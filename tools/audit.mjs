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

// Verify FORBIDDEN_TROPES is non-empty
if (!Array.isArray(Hooks.FORBIDDEN_TROPES) || Hooks.FORBIDDEN_TROPES.length < 3) {
  fail('FORBIDDEN_TROPES list is too short (<3 entries)');
} else {
  ok(`${Hooks.FORBIDDEN_TROPES.length} forbidden tropes registered`);
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
  act3: ['final_confrontation','final_blow','aftermath']
};
for (const a of arc || []) {
  const want = REQUIRED_MILESTONES[a.id];
  if (!want) { fail(`Unknown act id: ${a.id}`); continue; }
  if (!Array.isArray(a.targetMilestones) || a.targetMilestones.length === 0) {
    fail(`${a.id}: targetMilestones is empty`); continue;
  }
  for (const m of want) {
    if (!a.targetMilestones.includes(m) && !a.narratorHint.includes(m)) {
      fail(`${a.id} missing required milestone "${m}" in both targetMilestones and narratorHint`);
    }
  }
  if (!a.narratorHint || a.narratorHint.length < 100) {
    fail(`${a.id}: narratorHint suspiciously short`);
  } else {
    ok(`${a.id} narrator hint: ${a.narratorHint.length} chars`);
  }
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
    {name:'stakes_clear'},{name:'antagonist_revealed'}
  ], completionPercentage: 60 },
  turn: 35
}));
if (!act3Hint.includes('Act 3')) fail('Act 3 hint not produced for late game');
else ok('Late game → Act 3 hint');

const godHint = Quest.buildQuestStageHint(baseGS({ isGoalComplete: true }));
if (!godHint.includes('GOD MODE')) fail('Post-victory state did not produce GOD MODE hint');
else ok('isGoalComplete → GOD MODE hint');

if (!godHint.includes('OVERRIDES:') || !godHint.includes('DECLARATION → REQUIRED DIFF MAPPING')) {
  fail('GOD MODE hint missing OVERRIDES or DIFF MAPPING sections');
} else {
  ok('GOD MODE hint contains override and diff-mapping sections');
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

if (Schemas.EXPLORATION_CHOICE_TYPES.length !== 5) fail('EXPLORATION_CHOICE_TYPES must have 5 entries');
else ok('5 exploration choice types');
if (Schemas.COMBAT_CHOICE_TYPES.length !== 4) fail('COMBAT_CHOICE_TYPES must have 4 entries');
else ok('4 combat choice types');

// Schema validators: positive cases
try {
  const norm = Schemas.validateChoicesPayload({
    choices: Schemas.EXPLORATION_CHOICE_TYPES.map(t => ({ type: t, text: 'do something' }))
  }, false);
  if (norm.length !== 5) fail('validateChoicesPayload returned wrong length');
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
    {type:'Good',text:'a'}, {type:'Good',text:'b'},
    {type:'Bad',text:'c'}, {type:'Risky',text:'d'}, {type:'Silly',text:'e'}
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
