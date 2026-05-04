// godmode_audit.mjs — verify GodModeManager.checkUnlockConditions matches
// the README spec ("finish the main quest" — only that). Currently it
// requires THREE conditions (main quest + lvl 10 + 20 items + turn 30),
// which is broken per spec. This test FAILS until godMode.js is fixed.

import './dom_polyfill.mjs';

const { gameState } = await import('../state.js');
const { GodModeManager } = await import('../godMode.js');

const issues = [];
const ok    = (msg) => console.log('  ✓', msg);
const fail  = (msg) => { console.log('  ✗', msg); issues.push(msg); };

// Hook UI.showPopup to a noop so we don't blow up in unlockGodMode().
// The polyfill already covers `document` etc.

function freshGS() {
  gameState.players = [{
    name: 'Test', hp: 100, maxHp: 100, level: 1, inventory: [], coins: 0
  }];
  gameState.turn = 1;
  gameState.adventureGoal = 'Save the kingdom';
  gameState.isGoalComplete = false;
  gameState.questProgress = { milestones: [], completionPercentage: 0, sideQuests: [], currentObjectives: [] };
  gameState.questProgressManager = {
    shouldCompleteQuest: () => false   // override per test
  };
}

console.log('\n=== GOD MODE: unlock when isGoalComplete=true (per README) ===');
freshGS();
gameState.isGoalComplete = true;
gameState.questProgressManager.shouldCompleteQuest = () => true;
const m = new GodModeManager();
const unlocked = m.checkUnlockConditions();
if (unlocked && m.isUnlocked) {
  ok('Unlocked when isGoalComplete=true (matches README spec)');
} else {
  fail(`NOT unlocked despite main quest complete — README says only requirement is finishing the main quest. (isUnlocked=${m.isUnlocked})`);
  // Diagnose which conditions blocked it
  for (const [id, c] of m.unlockConditions.entries()) {
    if (!c.completed) console.log(`     - blocked by: ${id} ("${c.name}")`);
  }
}

console.log('\n=== GOD MODE: stays locked before main quest done ===');
freshGS();
const m2 = new GodModeManager();
const stillLocked = !m2.checkUnlockConditions();
if (stillLocked && !m2.isUnlocked) ok('Locked while main quest incomplete');
else fail('Unlocked too early!');

console.log(`\n=== GOD MODE AUDIT SUMMARY ===\n${issues.length === 0 ? '✓ ALL GOD-MODE CHECKS PASSED' : '✗ ' + issues.length + ' issue(s):\n  - ' + issues.join('\n  - ')}`);
process.exit(issues.length === 0 ? 0 : 1);
