// engine_audit.mjs — drive engine.applyDiff() end-to-end through the
// EXACT diff-path patterns that questDefinitions's GOD MODE prompt
// instructs the narrator to emit. Catches the "narrator emits a diff
// the engine ignores" failure mode that breaks god-mode in practice.
//
// Run: node --experimental-loader ./tools/preload.mjs tools/engine_audit.mjs

// --- Polyfill DOM/window for Node ----------------------------------------
import './dom_polyfill.mjs';

// Import after polyfill ----------------------------------------------------
const { gameState } = await import('../state.js');
const Engine = await import('../engine.js');
const Quest  = await import('../questDefinitions.js');

const issues = [];
const ok    = (msg) => console.log('  ✓', msg);
const fail  = (msg) => { console.log('  ✗', msg); issues.push(msg); };

// Helper: reset gameState into a known, post-setup-ish shape -------------
function resetGS() {
  gameState.players = [{
    name: 'TestHero', hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    coins: 0, atk: 10, def: 5, level: 1,
    inventory: [], equipment: { weapon: null, armor: null },
    statusEffects: [], specialMoves: []
  }];
  gameState.enemies = [];
  gameState.inCombat = false;
  gameState.turn = 8;
  gameState.adventureGoal = 'Restore the kingdom.';
  gameState.isGoalComplete = false;
  gameState.allowCustomActions = false;
  gameState.imprisoned = false;
  gameState.questProgress = { milestones: [], completionPercentage: 0, sideQuests: [], currentObjectives: [] };
  gameState.entityMemory = { npcs: {}, locations: {}, items: {} };
  gameState.reputationSystem = {
    factions: { authority:0,warriors:0,naturalists:0,shadows:0,scholars:0,common:0 },
    reputationHistory: []
  };
  gameState.currentLocation = { name: 'Test Town', type: 'town', dangerLevel: 0.1, description: '' };
}

// ---- 1. ENGINE: every god-mode declaration → diff path -----------------
console.log('\n=== ENGINE applyDiff PATHS (god-mode declaration coverage) ===');

resetGS();
const cases = [
  // Each entry mirrors the GOD MODE DECLARATION → REQUIRED DIFF MAPPING in
  // questDefinitions.js. If any one of these fails, god mode is broken.
  { name:'gold',     ops:[{op:'replace',path:'/players/0/coins',value:99999}] },
  { name:'item',     ops:[{op:'add',path:'/players/0/inventory/-',value:{name:'Phoenix Feather',type:'Special',tier:'Legendary',effect:'Revives once per arc'}}] },
  { name:'spell',    ops:[{op:'add',path:'/players/0/specialMoves/-',value:{name:'Time Stop',cooldown:5,mpCost:30,usageContext:'both',mechanics:{}}}] },
  { name:'npc',      ops:[{op:'add',path:'/entityMemory/npcs/Ember',value:{name:'Ember',description:'A summoned phoenix companion'}}] },
  { name:'location', ops:[
      {op:'replace',path:'/currentLocation',value:{name:'Crystal Peak',type:'mountain',dangerLevel:0.4,description:'A spire of singing crystal.'}},
      {op:'add',path:'/entityMemory/locations/Crystal Peak',value:{name:'Crystal Peak',description:'A spire of singing crystal.'}}
   ] },
  { name:'boss',     ops:[
      {op:'add',path:'/enemies/-',value:{name:'Hollow King',hp:600,maxHp:600,atk:50,def:30,abilities:['Shadow Strike']}},
      {op:'replace',path:'/inCombat',value:true},
      {op:'add',path:'/entityMemory/npcs/Hollow King',value:{name:'Hollow King',description:'The summoned final boss.'}}
   ] },
  { name:'newQuest', ops:[
      {op:'replace',path:'/adventureGoal',value:'Master the four elements.'},
      {op:'replace',path:'/questProgress/completionPercentage',value:0}
   ] },
  { name:'stat',     ops:[
      {op:'replace',path:'/players/0/atk',value:75},
      {op:'replace',path:'/players/0/def',value:60}
   ] },
  { name:'level',    ops:[{op:'replace',path:'/players/0/level',value:25}] },
  { name:'maxStat',  ops:[
      {op:'replace',path:'/players/0/maxHp',value:500},
      {op:'replace',path:'/players/0/maxMp',value:200}
   ] },
  { name:'reputation',ops:[{op:'replace',path:'/reputationSystem/factions/authority',value:75}] },
  { name:'sideQuest',ops:[{op:'add',path:'/questProgress/sideQuests/-',value:{name:'Find the lost cat',description:'A villager cat'}}] },
  { name:'milestone',ops:[{op:'add',path:'/questProgress/milestones/-',value:{name:'final_blow',description:'The threat is ended.'}}] }
];

for (const c of cases) {
  resetGS();  // engine.applyDiff is two-phase; reset between cases
  const applied = Engine.applyDiff(c.ops);
  if (applied.length === c.ops.length) {
    ok(`${c.name.padEnd(11)} – ${c.ops.length} op(s) applied: ${applied.join(' | ')}`);
  } else {
    fail(`${c.name} – only ${applied.length}/${c.ops.length} ops applied`);
  }
}

// ---- 2. ENGINE: applyDiff rejects bad ops ----
console.log('\n=== ENGINE applyDiff (reject bad ops) ===');
resetGS();
const badCases = [
  // Disallowed path
  { name:'unknown path', op:{op:'replace',path:'/players/0/secretField',value:42} },
  // Wrong op verb
  { name:'remove on hp', op:{op:'remove',path:'/players/0/hp'} },
  // Invalid value type
  { name:'string hp',    op:{op:'replace',path:'/players/0/hp',value:'lots'} },
  // Negative hp
  { name:'negative hp',  op:{op:'replace',path:'/players/0/hp',value:-50} },
  // Reputation out of range
  { name:'rep > 100',    op:{op:'replace',path:'/reputationSystem/factions/common',value:200} }
];
for (const c of badCases) {
  resetGS();
  const applied = Engine.applyDiff([c.op]);
  if (applied.length === 0) ok(`${c.name} rejected`);
  else                       fail(`${c.name} was incorrectly applied`);
}

// ---- 3. ENGINE: completionPercentage turn cap ----
console.log('\n=== ENGINE: turn-cap on completionPercentage ===');
resetGS();
gameState.turn = 1;
Engine.applyDiff([{op:'replace',path:'/questProgress/completionPercentage',value:80}]);
if (gameState.questProgress.completionPercentage <= 12) {
  ok(`turn-1 cap honored (got ${gameState.questProgress.completionPercentage}%, asked 80%)`);
} else {
  fail(`turn-1 cap missing — completionPercentage = ${gameState.questProgress.completionPercentage}`);
}
resetGS();
gameState.turn = 25;
Engine.applyDiff([{op:'replace',path:'/questProgress/completionPercentage',value:80}]);
if (gameState.questProgress.completionPercentage === 80) {
  ok(`late-game cap is open (got ${gameState.questProgress.completionPercentage}%)`);
} else {
  fail(`late-game completionPercentage = ${gameState.questProgress.completionPercentage}, expected 80`);
}

// ---- 4. ENGINE: monotonic non-decreasing (with 0 as full reset) ----
console.log('\n=== ENGINE: completionPercentage monotonicity ===');
resetGS(); gameState.turn = 25;
Engine.applyDiff([{op:'replace',path:'/questProgress/completionPercentage',value:60}]);
Engine.applyDiff([{op:'replace',path:'/questProgress/completionPercentage',value:30}]);
if (gameState.questProgress.completionPercentage === 60) ok('cannot decrease (60 stays after 30 emit)');
else fail(`expected 60, got ${gameState.questProgress.completionPercentage}`);
// BUG-21: stray 0 emit mid-quest must be ignored (would otherwise wipe milestones).
Engine.applyDiff([{op:'replace',path:'/questProgress/completionPercentage',value:0}]);
if (gameState.questProgress.completionPercentage === 60) {
  ok('regressive 0 ignored mid-quest (60 stays, milestones preserved)');
} else {
  fail(`regressive 0 not ignored — pct=${gameState.questProgress.completionPercentage}`);
}
// Legitimate reset: god-mode retirement (isGoalComplete=true) DOES allow 0.
gameState.isGoalComplete = true;
Engine.applyDiff([{op:'replace',path:'/questProgress/completionPercentage',value:0}]);
if (gameState.questProgress.completionPercentage === 0 && gameState.questProgress.milestones.length === 0) {
  ok('explicit 0 is a full reset under god-mode retirement (milestones cleared)');
} else {
  fail(`god-mode reset to 0 failed — pct=${gameState.questProgress.completionPercentage}, milestones=${gameState.questProgress.milestones.length}`);
}
gameState.isGoalComplete = false;

// ---- 5. ENGINE: side quest dedupe ----
console.log('\n=== ENGINE: side quest dedupe ===');
resetGS();
Engine.applyDiff([{op:'add',path:'/questProgress/sideQuests/-',value:{name:'Find the lost cat'}}]);
Engine.applyDiff([{op:'add',path:'/questProgress/sideQuests/-',value:{name:'Find the Lost Cat'}}]); // case-different dup
if (gameState.questProgress.sideQuests.length === 1) ok('side-quest dedupe works (case-insensitive)');
else fail(`side-quest dedupe failed — got ${gameState.questProgress.sideQuests.length}`);

// ---- 6. ENGINE: milestone dedupe ----
console.log('\n=== ENGINE: milestone dedupe ===');
resetGS();
Engine.applyDiff([{op:'add',path:'/questProgress/milestones/-',value:{name:'stakes_clear'}}]);
Engine.applyDiff([{op:'add',path:'/questProgress/milestones/-',value:{name:'Stakes Clear'}}]);
if (gameState.questProgress.milestones.length === 1) ok('milestone dedupe works (case+separator-insensitive)');
else fail(`milestone dedupe failed — got ${gameState.questProgress.milestones.length}`);

// ---- 7. ENGINE: isGoalComplete unlock side-effect ----
console.log('\n=== ENGINE: isGoalComplete unlocks god mode ===');
resetGS();
let unlockCalled = false, activateCalled = false;
gameState.godModeManager = {
  isUnlocked: false,
  checkUnlockConditions() { unlockCalled = true; this.isUnlocked = true; return true; },
  activateGodMode()       { activateCalled = true; },
  deactivateGodMode()     {}
};
Engine.applyDiff([{op:'replace',path:'/isGoalComplete',value:true}]);
if (gameState.allowCustomActions === true && unlockCalled && activateCalled) {
  ok('isGoalComplete=true → allowCustomActions, checkUnlockConditions, activateGodMode all fire');
} else {
  fail(`isGoalComplete side-effects: allowCustomActions=${gameState.allowCustomActions}, unlockCalled=${unlockCalled}, activateCalled=${activateCalled}`);
}

// ---- 8. ENGINE: location lock while imprisoned ----
console.log('\n=== ENGINE: imprisoned blocks free location change ===');
resetGS(); gameState.imprisoned = true;
const blocked = Engine.applyDiff([{op:'replace',path:'/currentLocation',value:{name:'Free Forest',type:'forest'}}]);
if (blocked.length === 0) ok('imprisoned location-change rejected');
else fail('imprisoned location-change was applied (should reject)');
const allowed = Engine.applyDiff([{op:'replace',path:'/currentLocation',value:{name:'Iron Cells',type:'jail'}}]);
if (allowed.length === 1) ok('imprisoned → jail-typed location allowed');
else fail('imprisoned → jail-typed location was rejected');

// ---- 9. ENGINE: maxHp raises hp clamp ----
console.log('\n=== ENGINE: maxHp adjusts current hp ceiling ===');
resetGS();
gameState.players[0].hp = 100;
Engine.applyDiff([{op:'replace',path:'/players/0/maxHp',value:60}]);
if (gameState.players[0].hp === 60) ok('hp clamped down when maxHp lowered');
else fail(`expected hp=60, got ${gameState.players[0].hp}`);

console.log(`\n=== ENGINE AUDIT SUMMARY ===\n${issues.length === 0 ? '✓ ALL ENGINE CHECKS PASSED' : `✗ ${issues.length} issue(s):\n  - ` + issues.join('\n  - ')}`);
process.exit(issues.length === 0 ? 0 : 1);
