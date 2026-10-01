// first_turn_check.mjs - a fresh game (resetGameState) must survive the
// narrativeContext reads that actionHandler.js does when building the first
// exploration turn's action log (actionHandler.js ~line 574).
import './dom_polyfill.mjs';

const { gameState, resetGameState } = await import('../state.js');

resetGameState();
const nc = gameState.narrativeContext;
let failed = 0;
for (const key of ['discoveredSecrets', 'significantEvents', 'relationshipChanges', 'environmentalChanges']) {
  try {
    nc[key].slice(-2);
    console.log(`  ✓ narrativeContext.${key} is an array after reset`);
  } catch (e) {
    console.log(`  ✗ narrativeContext.${key}: ${e.message}`);
    failed++;
  }
}
console.log(failed ? `✗ ${failed} FIRST-TURN FAILURE(S)` : '✓ first turn survives a fresh game');
process.exit(failed ? 1 : 0);
