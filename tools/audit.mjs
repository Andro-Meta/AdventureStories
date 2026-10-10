// Static validator for Adventure Stories. Runs in plain Node (no browser).
// Catches: missing hooks, malformed quest definitions, schema rot,
// engine-path drift from aiHandler/God-mode write paths.
//
// Usage: node --experimental-loader ./tools/preload.mjs tools/audit.mjs

import * as Hooks from '../storyHooks.js';
import * as Quest from '../questDefinitions.js';
import * as Schemas from '../schemas.js';

const issues = [];
const ok    = (msg) => console.log('  ✓', msg);
const fail  = (msg) => { console.log('  ✗', msg); issues.push(msg); };

console.log('\n=== STORY HOOKS ===');
const REQUIRED_THEMES = [
  'fantasy','space','pirate','underwater','jungle','future_utopia',
  'dinosaur','arctic','steampunk','haunted','cyberpunk','wild_west','post_apoc','custom'
];
const REQUIRED_ARCHETYPES = [
  'stranger_arrival','ancient_awakening','missing_person','festival_disrupted',
  'found_object','prophecy_named','rival_emerges','natural_disaster',
  'treasure_rumor','betrayal_revealed'
];
let hookCount = 0;
for (const theme of REQUIRED_THEMES) {
  const hook = Hooks.pickStoryHook(theme, theme === 'custom' ? 'My Custom Setting' : '');
  if (!hook || !hook.archetype || !hook.flavor) {
    fail(`pickStoryHook(${theme}) returned invalid hook`);
    continue;
  }
  // Force-iterate every archetype for full coverage.
  for (const arch of REQUIRED_ARCHETYPES) {
    // Use describeHookForPrompt to verify prompt rendering doesn't crash
    const promptFrag = Hooks.describeHookForPrompt({
      archetype: arch,
      flavor: 'TEST',
      themeForFlavor: theme,
      customDesc: theme === 'custom' ? 'desc' : ''
    });
    if (!promptFrag.includes(arch)) {
      fail(`describeHookForPrompt missing archetype for ${theme}/${arch}`);
    }
    hookCount++;
  }
}
ok(`${REQUIRED_THEMES.length} themes × ${REQUIRED_ARCHETYPES.length} archetypes = ${hookCount} prompt fragments render`);

// The storyteller is told which over-used names to avoid (the line lives in
// aiHandler's system prompt; storyHooks' old FORBIDDEN_TROPES list was unused).
{
  const fsMod = await import('node:fs');
  const ai = fsMod.readFileSync(new URL('../aiHandler.js', import.meta.url), 'utf8');
  const line = ai.match(/Avoid over-used names: ([^`]*?)\./);
  const n = line ? line[1].split(',').length : 0;
  if (n < 3) fail(`system prompt avoid-list too short (${n} names)`);
  else ok(`system prompt names ${n} over-used names to avoid`);
}

console.log('\n=== QUEST DEFINITIONS ===');
const arc = Quest.MAIN_QUEST_ARC;
if (!Array.isArray(arc) || arc.length !== 3) {
  fail(`MAIN_QUEST_ARC must have exactly 3 acts, got ${arc?.length}`);
} else {
  ok(`3-act structure present`);
}
const REQUIRED_MILESTONES = {
  act1: ['call_to_adventure','world_introduced','stakes_clear'],
  act2: ['ally_found','first_obstacle_overcome','antagonist_revealed'],
  act3: ['final_confrontation','final_blow'] // 'aftermath' removed: the quest ends at final_blow
};
for (const a of arc || []) {
  const want = REQUIRED_MILESTONES[a.id];
  if (!want) { fail(`Unknown act id: ${a.id}`); continue; }
  if (!Array.isArray(a.targetMilestones) || a.targetMilestones.length === 0) {
    fail(`${a.id}: targetMilestones is empty`); continue;
  }
  for (const m of want) {
    if (!a.targetMilestones.includes(m)) fail(`${a.id} missing required milestone "${m}"`);
  }
  const thin = Quest.BEATS.filter(b => a.targetMilestones.includes(b.name) && !(b.beat?.length > 20));
  if (thin.length) fail(`${a.id}: beats without an instruction: ${thin.map(b => b.name).join(', ')}`);
  else ok(`${a.id}: ${a.targetMilestones.length} story beats, each with an instruction`);
}

// Test buildQuestStageHint for the THREE major states: act1, act3-finale, post-victory god mode.
const baseGS = (overrides = {}) => ({
  questProgress: { milestones: [], completionPercentage: 0 },
  turn: 1, isGoalComplete: false, imprisoned: false, ...overrides
});
const act1Hint = Quest.buildQuestStageHint(baseGS());
if (!act1Hint.includes('Act 1')) fail('Act 1 hint not produced for fresh state');
else ok('Fresh state → Act 1 hint');

const act3Hint = Quest.buildQuestStageHint(baseGS({
  questProgress: { milestones:[
    ...Quest.BEATS.slice(0, Quest.BEATS.findIndex(b => b.name === 'path_to_lair') + 1).map(b => ({ name: b.name, turn: 1 }))
  ], completionPercentage: 60 },
  turn: 35
}));
if (!act3Hint.includes('Act 3')) fail('Act 3 hint not produced for late game');
else ok('Late game → Act 3 hint');

const godHint = Quest.buildQuestStageHint(baseGS({ isGoalComplete: true }));
if (!godHint.includes('GOD MODE')) fail('Post-victory state did not produce GOD MODE hint');
else ok('isGoalComplete → GOD MODE hint');

// The op mapping lives in the turn instructions (buildDiffInstructions); the
// system block only carries authority, persistence and refusal rules.
if (!/persist every tangible change/.test(godHint) || !/refuse/.test(godHint) || godHint.length > 900) {
  fail(`GOD MODE hint should be the short authority/persist/refusal block (${godHint.length} chars)`);
} else {
  ok(`GOD MODE hint: authority, persistence and refusal rules (${godHint.length} chars)`);
}

console.log('\n=== SCHEMAS ===');
function validateSchema(name, schema) {
  if (!schema || typeof schema !== 'object') { fail(`${name}: not an object`); return; }
  if (schema.type !== 'object') { fail(`${name}: top-level type must be object`); return; }
  if (!Array.isArray(schema.required) || schema.required.length === 0) {
    fail(`${name}: required[] is empty`); return;
  }
  ok(`${name} schema OK`);
}
validateSchema('explorationChoicesSchema', Schemas.explorationChoicesSchema);
validateSchema('combatChoicesSchema', Schemas.combatChoicesSchema);
validateSchema('narrativeTurnSchema', Schemas.narrativeTurnSchema);
validateSchema('arcMemorySchema', Schemas.arcMemorySchema);

if (Schemas.EXPLORATION_CHOICE_TYPES.join() !== 'Safe,Bold,Reckless') fail('exploration choice types must be the dangers Safe, Bold, Reckless');
else ok('exploration choice types are the dangers Safe, Bold, Reckless');
if (Schemas.COMBAT_CHOICE_TYPES.length !== 4) fail('COMBAT_CHOICE_TYPES must have 4 entries');
else ok('4 combat choice types');

// Schema validators: positive cases
try {
  const norm = Schemas.validateChoicesPayload({
    choices: Schemas.CHOICE_STATS.map(stat => ({ stat, danger: 'Bold', text: 'do something' }))
  }, false);
  if (norm.length !== 5 || norm.some(c => c.type !== 'Bold' || !c.stat)) fail('validateChoicesPayload returned wrong length');
  else ok('validateChoicesPayload accepts canonical 5-choice exploration');
} catch (e) { fail(`validateChoicesPayload failed: ${e.message}`); }

try {
  const norm = Schemas.validateChoicesPayload({
    choices: Schemas.COMBAT_CHOICE_TYPES.map(t => ({ type: t, text: 'do something' }))
  }, true);
  if (norm.length !== 4) fail('validateChoicesPayload returned wrong combat length');
  else ok('validateChoicesPayload accepts canonical 4-choice combat');
} catch (e) { fail(`validateChoicesPayload combat failed: ${e.message}`); }

// Validators: negative cases
let negCaught = 0;
try {
  Schemas.validateChoicesPayload({ choices: [{type:'Good', text:'a'}] }, false);
} catch (_) { negCaught++; }
try {
  Schemas.validateChoicesPayload({ choices: [
    {stat:'brave',danger:'Safe',text:'a'}, {stat:'clever',danger:'Safe',text:''},
    {stat:'sneaky',danger:'Bold',text:'c'}, {stat:'kind',danger:'Safe',text:'d'}, {stat:'luck',danger:'Bold',text:'e'}
  ] }, false);
} catch (_) { negCaught++; }
if (negCaught === 2) ok('validateChoicesPayload rejects malformed payloads');
else fail(`validateChoicesPayload rejected only ${negCaught}/2 negative cases`);

// Narrative turn schema validator
try {
  const n = Schemas.validateNarrativeTurnPayload({
    narration: 'You enter the room.',
    diff: { ops: [{op:'add',path:'/players/0/inventory/-',value:{name:'Coin'}}] }
  });
  if (!n.narration || !Array.isArray(n.diff.ops) || n.diff.ops.length !== 1) {
    fail('validateNarrativeTurnPayload returned wrong shape');
  } else { ok('validateNarrativeTurnPayload accepts canonical turn'); }
} catch (e) { fail(`validateNarrativeTurnPayload failed: ${e.message}`); }

console.log(`\n=== AUDIT SUMMARY ===\n${issues.length === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${issues.length} issue(s):\n  - ` + issues.join('\n  - ')}`);
process.exit(issues.length === 0 ? 0 : 1);
