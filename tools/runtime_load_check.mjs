// runtime_load_check.mjs — actually IMPORT main.js end-to-end with the
// DOM polyfill so we surface module-load errors before they hit the
// WebView. Mimics what the browser does when index.html sources main.js.

import './dom_polyfill.mjs';

const errors = [];
process.on('unhandledRejection', (r, p) => {
  errors.push({ kind: 'unhandledRejection', err: r?.message || String(r), stack: r?.stack });
});
process.on('uncaughtException', (e) => {
  errors.push({ kind: 'uncaughtException', err: e?.message, stack: e?.stack });
});

const ok = [];
const fail = [];

// Load every module the WebView would, in import order from index.html → main.js.
const modules = [
  '../state.js', '../config.js', '../utils.js', '../schemas.js',
  '../engine.js', '../storyHooks.js', '../questDefinitions.js',
  '../godMode.js', '../questProgress.js', '../saveLoad.js',
  '../aiHandler.js', '../actionHandler.js', '../gameLoop.js',
  '../turnManager.js', '../combat.js', '../resolution.js',
  '../ui.js', '../localAI.js', '../liteRTBridge.js',
  '../jailSystem.js', '../spells.js', '../spellUI.js',
  '../spellCasting.js', '../spellGeneration.js', '../items.js',
  '../bosses.js', '../encounters.js', '../storyHooks.js',
  '../storyContinuity.js', '../storyVariations.js',
  '../characterDevelopment.js', '../worldEvolution.js',
  '../memoryRetriever.js', '../adaptiveAbilities.js',
  '../ageAppropriateReading.js', '../reputationContextualizer.js',
  '../difficultyAdaptation.js', '../contextManager.js',
  '../dynamicChoices.js', '../dynamicEncounters.js',
  '../dynamicEnemies.js', '../dynamicItems.js',
  '../dynamicLocations.js', '../dynamicSpells.js', '../dynamicBosses.js',
  '../gemmaContextOptimizer.js', '../gemmaHyperthreading.js',
  '../localAIOrchestrator.js', '../storyContinuity.js',
  '../themeIntelligence.js', '../loadingManager.js', '../loadingTips.js',
  '../inputCache.js', '../storage.js', '../locations.js',
  '../api_new.js', '../initializationManager.js', '../setup.js',
  '../main.js'  // last — the entry point
];

for (const m of modules) {
  try {
    await import(m);
    ok.push(m);
  } catch (e) {
    fail.push({ m, err: e?.message, stack: (e?.stack || '').split('\n').slice(0, 5).join('\n') });
  }
}

console.log(`\n=== RUNTIME LOAD CHECK ===`);
console.log(`OK: ${ok.length} / ${modules.length}`);
if (fail.length === 0 && errors.length === 0) {
  console.log('\x1b[32m✓ Every module loaded cleanly.\x1b[0m');
} else {
  console.log(`\x1b[31m✗ ${fail.length} failed import(s) + ${errors.length} runtime error(s):\x1b[0m`);
  for (const f of fail) {
    console.log(`\n  --- ${f.m} ---`);
    console.log(`  err: ${f.err}`);
    console.log(`  ${f.stack.replace(/\n/g, '\n  ')}`);
  }
  for (const e of errors) {
    console.log(`\n  --- ${e.kind} ---`);
    console.log(`  ${e.err}`);
    console.log(`  ${(e.stack || '').replace(/\n/g, '\n  ')}`);
  }
  process.exit(1);
}
