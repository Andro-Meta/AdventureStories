// eval_models.mjs — head-to-head benchmark of small Gemma variants against
// THE EXACT PROMPTS THE GAME SENDS. Answers the question "is the smaller
// model smart enough to ship?" without having to build the APK and play
// for an hour to find out.
//
// Run against any /v1/chat/completions backend (Ollama is the easiest):
//
//   ollama pull gemma3:270m gemma3:1b gemma3:4b gemma3:27b
//   npm run eval:models -- --models gemma3:270m,gemma3:1b,gemma3:4b
//
// Default URL is http://localhost:11434/v1 (Ollama). Override with
// ADV_EVAL_URL or --url.
//
// What it measures, per model:
//   • exploration choices: schema compliance + 5-of-each-type uniqueness
//   • combat choices: schema compliance + 4-of-each-type uniqueness
//   • narrative turn: produces narration AND a valid diff with allowed paths
//   • god-mode declarations: emits the right diff op for each pattern
//
// Each prompt is run THREE times per model so we see variance, not luck.
//
// Output: a markdown report on stdout you can paste straight into a commit
// message. A pass score >= 0.85 means "ship this model."

import './dom_polyfill.mjs';
import {
  EXPLORATION_CHOICE_TYPES, COMBAT_CHOICE_TYPES,
  validateChoicesPayload, validateNarrativeTurnPayload
} from '../schemas.js';
import { describeAllowedPaths, validateOp } from '../engine.js';

// --- CLI args ---
const argv = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = argv.indexOf(`--${k}`);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return dflt;
};
const URL    = arg('url', process.env.ADV_EVAL_URL || 'http://localhost:11434/v1');
const MODELS = arg('models', 'gemma3:1b').split(',').map(s => s.trim()).filter(Boolean);
const RUNS   = parseInt(arg('runs', '3'), 10);

console.log(`# Adventure Stories — Model Evaluation Report`);
console.log(`Endpoint: \`${URL}\``);
console.log(`Models:   ${MODELS.map(m => '`' + m + '`').join(', ')}`);
console.log(`Runs/test: ${RUNS}`);
console.log();

const PATHS_DESC = describeAllowedPaths();
const SYS_PROMPT_BASE = `You are the narrator of a multi-act text adventure. You output STRICT JSON only — no prose, no markdown, no commentary outside the JSON. Use the exact field names and shapes specified.`;

// --- Test cases ---------------------------------------------------------
const TESTS = [
  {
    name: 'exploration_choices',
    description: 'Generate 5 exploration choices, one of each type',
    inCombat: false,
    messages: [
      { role: 'system', content: SYS_PROMPT_BASE },
      { role: 'user', content: `The player has just entered a derelict starship's bridge. Lights flicker. There's a sealed door, an unfamiliar console, and a body slumped against a wall.

Output JSON:
{"choices":[{"type":"Good","text":"..."},{"type":"Bad","text":"..."},{"type":"Risky","text":"..."},{"type":"Silly","text":"..."},{"type":"Investigative","text":"..."}]}

Rules: exactly 5 choices, types must be exactly Good, Bad, Risky, Silly, Investigative — one of each. Each text 1-2 short sentences (under 200 chars).` }
    ],
    grade: (text) => {
      const obj = parseJson(text);
      if (!obj) return { pass: false, reason: 'no JSON' };
      try {
        const norm = validateChoicesPayload(obj, false);
        return { pass: norm.length === 5, reason: 'OK', detail: norm.map(c=>c.type).join(',') };
      } catch (e) { return { pass: false, reason: e.message }; }
    }
  },
  {
    name: 'combat_choices',
    description: 'Generate 4 combat choices, one of each type',
    inCombat: true,
    messages: [
      { role: 'system', content: SYS_PROMPT_BASE },
      { role: 'user', content: `Combat. The player faces a Hollow Knight (HP 80/100, Atk 18, Def 12). Player Inventory: Iron Sword, Healing Potion x2.

Output JSON:
{"choices":[{"type":"Attack","text":"..."},{"type":"Special","text":"..."},{"type":"Item","text":"..."},{"type":"Run","text":"..."}]}

Rules: exactly 4 choices, types must be exactly Attack, Special, Item, Run — one of each.` }
    ],
    grade: (text) => {
      const obj = parseJson(text);
      if (!obj) return { pass: false, reason: 'no JSON' };
      try {
        const norm = validateChoicesPayload(obj, true);
        return { pass: norm.length === 4, reason: 'OK', detail: norm.map(c=>c.type).join(',') };
      } catch (e) { return { pass: false, reason: e.message }; }
    }
  },
  {
    name: 'narrative_turn',
    description: 'Narration + valid diff ops with allowed paths',
    messages: [
      { role: 'system', content: `${SYS_PROMPT_BASE}

Allowed diff paths:
${PATHS_DESC}` },
      { role: 'user', content: `The player chose: "Pry open the rusted chest in the corner." Inside is a small leather pouch.

Output JSON:
{"narration":"...","diff":{"ops":[ ... ]}}

The narration is 2-4 sentences (max 600 chars). Emit ONE diff op that adds an item to /players/0/inventory/- with name, type ('Misc' or 'Consumable'), tier ('Low' or 'Medium'), effect.` }
    ],
    grade: (text) => {
      const obj = parseJson(text);
      if (!obj) return { pass: false, reason: 'no JSON' };
      try {
        const norm = validateNarrativeTurnPayload(obj);
        if (norm.diff.ops.length < 1) return { pass: false, reason: 'no diff ops' };
        const inventoryAdd = norm.diff.ops.find(o => /^\/players\/\d+\/inventory\/-$/.test(o.path));
        if (!inventoryAdd) return { pass: false, reason: 'no inventory add op' };
        if (!inventoryAdd.value?.name) return { pass: false, reason: 'item missing name' };
        return { pass: true, reason: 'OK', detail: inventoryAdd.value.name };
      } catch (e) { return { pass: false, reason: e.message }; }
    }
  },
  {
    name: 'god_mode_summon',
    description: 'God-mode "I summon Ember the phoenix" -> NPC + skill diff',
    messages: [
      { role: 'system', content: `${SYS_PROMPT_BASE}

Allowed diff paths:
${PATHS_DESC}

The main quest is COMPLETE — god mode. Player declarations must be honored with diff ops.` },
      { role: 'user', content: `[God Mode] Player declares: "I summon Ember the phoenix as my companion."

Output JSON: {"narration":"...","diff":{"ops":[ ... ]}}

You MUST emit at least one entityMemory.npcs add op with name="Ember" plus a specialMoves add for the bond. Narrate vividly in 1-3 sentences.` }
    ],
    grade: (text) => {
      const obj = parseJson(text);
      if (!obj) return { pass: false, reason: 'no JSON' };
      try {
        const norm = validateNarrativeTurnPayload(obj);
        const npcOp = norm.diff.ops.find(o => /^\/entityMemory\/npcs\//.test(o.path));
        if (!npcOp) return { pass: false, reason: 'no npc add op' };
        return { pass: true, reason: 'OK', detail: npcOp.value?.name || npcOp.path };
      } catch (e) { return { pass: false, reason: e.message }; }
    }
  },
  {
    name: 'milestone_progression',
    description: 'Emit final_blow milestone + isGoalComplete=true',
    messages: [
      { role: 'system', content: `${SYS_PROMPT_BASE}

Allowed diff paths:
${PATHS_DESC}` },
      { role: 'user', content: `Act 3 final beat — the player has just struck down the Hollow King with their legendary blade.

Output JSON: {"narration":"...","diff":{"ops":[ ... ]}}

Required ops in this exact order:
  1. add /questProgress/milestones/- with {name:"final_blow", description:"..."}
  2. replace /questProgress/completionPercentage = 100
  3. replace /isGoalComplete = true` }
    ],
    grade: (text) => {
      const obj = parseJson(text);
      if (!obj) return { pass: false, reason: 'no JSON' };
      try {
        const norm = validateNarrativeTurnPayload(obj);
        const ops = norm.diff.ops;
        const hasMs   = ops.some(o => o.path === '/questProgress/milestones/-' && /final.?blow/i.test(o.value?.name || ''));
        const hasPct  = ops.some(o => o.path === '/questProgress/completionPercentage' && o.value === 100);
        const hasGoal = ops.some(o => o.path === '/isGoalComplete' && o.value === true);
        if (!hasMs)   return { pass: false, reason: 'missing final_blow milestone' };
        if (!hasPct)  return { pass: false, reason: 'missing 100% set' };
        if (!hasGoal) return { pass: false, reason: 'missing isGoalComplete=true' };
        return { pass: true, reason: 'OK', detail: 'all 3 ops present' };
      } catch (e) { return { pass: false, reason: e.message }; }
    }
  }
];

// --- Helpers -----------------------------------------------------------
function parseJson(text) {
  if (!text) return null;
  // Strip markdown fences
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // Extract JSON object boundary
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

async function callModel(model, messages) {
  const t0 = Date.now();
  const r = await fetch(`${URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages, temperature: 0.7, max_tokens: 1024,
      response_format: { type: 'json_object' }
    })
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
  const j = await r.json();
  const elapsedMs = Date.now() - t0;
  return { text: j?.choices?.[0]?.message?.content || '', elapsedMs };
}

// --- Run ---------------------------------------------------------------
const summary = {};
for (const model of MODELS) {
  console.log(`\n## ${model}\n`);
  const rows = [];
  for (const t of TESTS) {
    const results = [];
    for (let r = 0; r < RUNS; r++) {
      try {
        const { text, elapsedMs } = await callModel(model, t.messages);
        const grade = t.grade(text);
        results.push({ ...grade, elapsedMs });
      } catch (e) {
        results.push({ pass: false, reason: 'request failed: ' + e.message, elapsedMs: 0 });
      }
    }
    const passes = results.filter(r => r.pass).length;
    const avgMs  = Math.round(results.reduce((a, r) => a + r.elapsedMs, 0) / results.length);
    rows.push({ test: t.name, pass: `${passes}/${RUNS}`, avgMs, last: results[results.length - 1] });
  }
  console.log('| Test | Pass | Avg ms | Last detail |');
  console.log('|---|---|---|---|');
  for (const r of rows) {
    const detail = r.last.pass ? r.last.detail || 'OK' : `FAIL: ${r.last.reason}`;
    console.log(`| ${r.test} | ${r.pass} | ${r.avgMs} | ${String(detail).slice(0, 80)} |`);
  }
  const totalPasses = rows.reduce((a, r) => a + parseInt(r.pass), 0);
  const totalRuns = TESTS.length * RUNS;
  const score = (totalPasses / totalRuns).toFixed(2);
  summary[model] = { score, totalPasses, totalRuns };
  console.log(`\n**Score:** ${totalPasses}/${totalRuns} = **${score}** ${score >= 0.85 ? '✓ SHIPPABLE' : '✗ needs more'}`);
}

console.log(`\n## Summary\n`);
console.log('| Model | Score | Verdict |');
console.log('|---|---|---|');
for (const [m, s] of Object.entries(summary)) {
  console.log(`| ${m} | ${s.score} (${s.totalPasses}/${s.totalRuns}) | ${s.score >= 0.85 ? '✓ SHIP' : '✗ skip'} |`);
}
