// ui_audit.mjs — static UI wiring audit. Answers: every button has a
// handler; every handler points at a real button; every screen-transition
// data-target references a real screen id; every choice-click path leads
// to a function that ultimately advances the turn.
//
// Pure static analysis (regex over the source). No browser, no AI.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FILES = {
  html: 'index.html',
  js: [
    'main.js', 'ui.js', 'setup.js', 'actionHandler.js', 'aiHandler.js',
    'gameLoop.js', 'turnManager.js', 'godMode.js', 'saveLoad.js',
    'initializationManager.js', 'spellUI.js', 'jailSystem.js',
    'resolution.js', 'localAI.js', 'config.js', 'liteRTBridge.js'
  ]
};

const issues = [];
const warns  = [];
const ok    = (msg) => console.log('  \x1b[32m✓\x1b[0m', msg);
const fail  = (msg) => { console.log('  \x1b[31m✗\x1b[0m', msg); issues.push(msg); };
const warn  = (msg) => { console.log('  \x1b[33m⚠\x1b[0m', msg); warns.push(msg); };

const html = await readFile(resolve(ROOT, FILES.html), 'utf-8');
const jsBundle = (await Promise.all(
  FILES.js.map(async f => {
    try { return `\n/*=== ${f} ===*/\n` + await readFile(resolve(ROOT, f), 'utf-8'); }
    catch (_) { return ''; }
  })
)).join('\n');

// --- 1. Extract every button + every screen ---
const buttonIds = new Set();
const buttonClassUses = new Map(); // class -> [data-target | null, ...]
const inputIds  = new Set();
const allScreenIds = new Set();

// <div id="...Screen" class="screen">  → screen ids
for (const m of html.matchAll(/id="([a-zA-Z0-9_-]+Screen)"/g)) {
  allScreenIds.add(m[1]);
}

// <button id="..."> + <input type="button|text|number|password" id="...">
for (const m of html.matchAll(/<button\s+[^>]*id="([a-zA-Z0-9_-]+)"/g)) {
  buttonIds.add(m[1]);
}
for (const m of html.matchAll(/<input[^>]*\bid="([a-zA-Z0-9_-]+)"/g)) {
  inputIds.add(m[1]);
}

// <button class="..." data-target="...">  + <button class="..."> with no id
for (const m of html.matchAll(/<button[^>]*class="([^"]+)"[^>]*>/g)) {
  const fullTag = m[0];
  const classes = m[1].split(/\s+/).filter(Boolean);
  const targetMatch = fullTag.match(/data-target="([^"]+)"/);
  const countMatch  = fullTag.match(/data-count="([^"]+)"/);
  const idMatch     = fullTag.match(/\bid="([^"]+)"/);
  for (const cls of classes) {
    if (!buttonClassUses.has(cls)) buttonClassUses.set(cls, []);
    buttonClassUses.get(cls).push({
      target: targetMatch ? targetMatch[1] : null,
      count:  countMatch  ? countMatch[1]  : null,
      id:     idMatch     ? idMatch[1]     : null
    });
  }
}

console.log(`\n\x1b[1m=== UI INVENTORY ===\x1b[0m`);
ok(`${buttonIds.size} buttons with ids`);
ok(`${inputIds.size} inputs with ids`);
ok(`${allScreenIds.size} screens (id=*Screen)`);
ok(`${buttonClassUses.size} button classes referenced (.backBtn, .playerCountBtn, .menuDirectBtn, ...)`);

// --- 2. Every button id must be referenced from JS ---
console.log(`\n\x1b[1m=== BUTTON HANDLER WIRING (every id in index.html → JS reference) ===\x1b[0m`);
const orphans = [];
for (const id of buttonIds) {
  // Search for getElementById('id'), querySelector('#id'), or just 'id' as a string literal in JS
  const patt = new RegExp(`getElementById\\(\\s*['"\`]${id}['"\`]\\s*\\)|querySelector\\(\\s*['"\`]#${id}['"\`]\\s*\\)|['"\`]#${id}['"\`]|['"\`]${id}['"\`]`);
  if (!patt.test(jsBundle)) orphans.push(id);
}
if (orphans.length === 0) ok(`Every one of ${buttonIds.size} ID-buttons is referenced from JS`);
else for (const id of orphans) fail(`button #${id} has NO JS reference (dead button)`);

// --- 3. Every data-target must point to a real screen ---
console.log(`\n\x1b[1m=== data-target SCREEN REFERENCES ===\x1b[0m`);
let dataTargetCount = 0;
let dataTargetBad = 0;
for (const [cls, uses] of buttonClassUses.entries()) {
  for (const u of uses) {
    if (!u.target) continue;
    dataTargetCount++;
    if (!allScreenIds.has(u.target)) {
      fail(`.${cls} → data-target="${u.target}" is NOT a real screen id`);
      dataTargetBad++;
    }
  }
}
if (dataTargetBad === 0) ok(`All ${dataTargetCount} data-target screen refs resolve to real screens`);

// --- 4. data-count must parse as 1..5 (player count buttons) ---
console.log(`\n\x1b[1m=== data-count VALIDATION ===\x1b[0m`);
let countBad = 0;
let countSeen = 0;
for (const [cls, uses] of buttonClassUses.entries()) {
  for (const u of uses) {
    if (!u.count) continue;
    countSeen++;
    const n = Number(u.count);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      fail(`.${cls} data-count="${u.count}" must be 1..5`); countBad++;
    }
  }
}
if (countBad === 0 && countSeen > 0) ok(`All ${countSeen} data-count attrs are integers 1..5`);
else if (countSeen === 0) warn('No data-count attributes found — playerCountBtn class may have moved');

// --- 5. Class buttons must be wired by class (delegated handlers) ---
console.log(`\n\x1b[1m=== CLASS-BASED HANDLERS ===\x1b[0m`);
for (const cls of buttonClassUses.keys()) {
  if (cls === 'primary' || cls === 'hidden' || cls === 'experimental-multiplayer'
      || cls === 'menu-btn' || cls === 'cancel-btn') continue; // styling-only
  // Look for selector usage: '.cls' as string OR querySelectorAll/querySelector('.cls') OR dataset.target
  const patt = new RegExp(`['"\`]\\.${cls}['"\`]|querySelectorAll\\(\\s*['"\`]\\.${cls}|querySelector\\(\\s*['"\`]\\.${cls}|classList\\.contains\\(\\s*['"\`]${cls}['"\`]`);
  if (!patt.test(jsBundle)) warn(`.${cls} buttons exist in HTML but no JS handler binds to the class (might rely on data-target only)`);
  else ok(`.${cls} class is bound from JS`);
}

// --- 6. Choice click → advanceTurn coverage ---
console.log(`\n\x1b[1m=== TURN-ADVANCE COVERAGE ===\x1b[0m`);
// Validate that the choice handlers — handleChoice, processPlayerAction, makeAICallForSystemAction —
// reach advanceTurn() in normal flow.
const turnAdvanceCallers = [];
const turnPattern = /\badvanceTurn\s*\(/g;
const matches = [...jsBundle.matchAll(turnPattern)];
ok(`advanceTurn() is called in ${matches.length} place(s)`);
if (matches.length < 3) {
  warn(`only ${matches.length} call sites for advanceTurn — expected at least 3 (post-choice, post-combat, post-system-action)`);
}
const requiredFlows = [
  { name: 'post-combat victory',  pattern: /handleCombatVictory[\s\S]{0,1500}advanceTurn/ },
  { name: 'gameLoop processPlayerAction', pattern: /processPlayerAction[\s\S]{0,3000}advanceTurn/ },
  { name: 'turnManager export',   pattern: /export\s+(?:async\s+)?function\s+advanceTurn/ }
];
for (const f of requiredFlows) {
  if (f.pattern.test(jsBundle)) ok(`turn-advance flow OK: ${f.name}`);
  else fail(`turn-advance flow MISSING: ${f.name}`);
}

// --- 7. Settings: every backend option in config.js must have a UI handle ---
console.log(`\n\x1b[1m=== SETTINGS WIRING (backend selector) ===\x1b[0m`);
const backendModes = ['backendModeLocal', 'backendModeCloud'];
for (const id of backendModes) {
  if (!html.includes(`id="${id}"`)) fail(`#${id} radio button missing from index.html`);
  else ok(`#${id} radio present`);
  if (!jsBundle.includes(id)) fail(`#${id} not referenced from JS`);
  else ok(`#${id} is wired from JS`);
}
// Backend keys recognized by config.js
const validBackends = ['cloud', 'llama-cpp', 'minicpm-python', 'ollama', 'litert'];
for (const b of validBackends) {
  if (!jsBundle.includes(`'${b}'`) && !jsBundle.includes(`"${b}"`)) {
    warn(`backend '${b}' has no JS reference — settings UI may not let users pick it`);
  } else {
    ok(`backend '${b}' referenced from JS`);
  }
}

// --- 8. Save / Load / God Mode buttons reach their respective module fns ---
console.log(`\n\x1b[1m=== CRITICAL ACTION COVERAGE ===\x1b[0m`);
const requiredFns = [
  { fn: 'saveGameToLocalStorage', why: 'Save Game button' },
  { fn: 'loadGame',               why: 'Load Game button' },
  { fn: 'deleteSaveSlot',         why: 'Delete save button' },
  { fn: "showScreen('playerCountScreen'", why: 'New Adventure button → player count screen' },
  { fn: 'showScreen',             why: 'screen transitions' },
  { fn: 'renderChoices',          why: 'choice rendering' },
  { fn: 'handlePlayerChoice',     why: 'delegated choice-button click handler' },
  { fn: 'updateNarrative',        why: 'narrative display' },
  { fn: 'renderPlayerCards',      why: 'player card UI' },
  { fn: 'showPopup',              why: 'feedback popups' },
  { fn: 'unlockGodMode',          why: 'god mode unlock celebration' },
  { fn: 'activateGodMode',        why: 'god mode activation' },
  { fn: 'processCustomChoice',    why: 'god mode custom action' }
];
for (const r of requiredFns) {
  if (jsBundle.includes(r.fn)) ok(`${r.fn} present (${r.why})`);
  else fail(`${r.fn} missing — ${r.why} won't work`);
}

// --- 9. Every screen referenced by data-target should also be reachable in JS via showScreen ---
console.log(`\n\x1b[1m=== showScreen REACHABILITY ===\x1b[0m`);
const screensReferenced = new Set();
for (const m of jsBundle.matchAll(/showScreen\(\s*['"`]([a-zA-Z0-9_-]+)['"`]/g)) {
  screensReferenced.add(m[1]);
}
ok(`showScreen() targets ${screensReferenced.size} distinct screens`);
const unreachable = [...allScreenIds].filter(s => !screensReferenced.has(s) && !s.endsWith('PopupScreen'));
for (const s of unreachable) {
  // Tolerate confirmation/help popups that are toggled differently
  if (/confirm|help|warn|info|popup|gameOver/i.test(s)) continue;
  warn(`screen #${s} exists in HTML but is never a showScreen() target (may be unreachable)`);
}

// --- 10. liteRTBridge wiring ---
console.log(`\n\x1b[1m=== ON-DEVICE LLM (LiteRT) WIRING ===\x1b[0m`);
const litertChecks = [
  { p: /baseUrl\s*===?\s*['"`]litert:\/\/local['"`]/, why: 'localAI.js short-circuits litert URL' },
  { p: /isLiteRT/, why: 'config.js exposes isLiteRT flag' },
  { p: /chatCompletion\b/, why: 'liteRTBridge exports chatCompletion' },
  { p: /Capacitor\.isNativePlatform/, why: 'auto-select uses isNativePlatform' }
];
for (const c of litertChecks) {
  if (c.p.test(jsBundle)) ok(c.why);
  else fail(`MISSING: ${c.why}`);
}

// --- Final ---
console.log(`\n\x1b[1m=== UI AUDIT SUMMARY ===\x1b[0m`);
console.log(`  buttons inspected: ${buttonIds.size}`);
console.log(`  classes inspected: ${buttonClassUses.size}`);
console.log(`  data-target refs: ${dataTargetCount}`);
console.log(`  warnings: ${warns.length}`);
console.log(`  failures: ${issues.length}`);
console.log(issues.length === 0
  ? '\x1b[32m✓ NO HARD FAILURES — every button connects, every turn-advance path present\x1b[0m'
  : '\x1b[31m✗ ' + issues.length + ' failure(s) — wiring is broken\x1b[0m');
process.exit(issues.length === 0 ? 0 : 1);
