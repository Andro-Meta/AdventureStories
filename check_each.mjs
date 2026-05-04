import './tools/dom_polyfill.mjs';
const modules = [
  'state.js','config.js','utils.js','schemas.js','engine.js','storyHooks.js',
  'questDefinitions.js','godMode.js','questProgress.js','saveLoad.js',
  'aiHandler.js','actionHandler.js','gameLoop.js','turnManager.js','combat.js',
  'resolution.js','ui.js','localAI.js','liteRTBridge.js','jailSystem.js',
  'spells.js','spellUI.js','spellCasting.js','spellGeneration.js','items.js',
  'bosses.js','encounters.js','storyContinuity.js','storyVariations.js',
  'characterDevelopment.js','worldEvolution.js','memoryRetriever.js',
  'adaptiveAbilities.js','ageAppropriateReading.js','reputationContextualizer.js',
  'difficultyAdaptation.js','contextManager.js','dynamicChoices.js',
  'dynamicEncounters.js','dynamicEnemies.js','dynamicItems.js',
  'dynamicLocations.js','dynamicSpells.js','dynamicBosses.js',
  'gemmaContextOptimizer.js','gemmaHyperthreading.js','localAIOrchestrator.js',
  'themeIntelligence.js','loadingManager.js','loadingTips.js','inputCache.js',
  'storage.js','locations.js','api_new.js','initializationManager.js',
  'setup.js','main.js'
];
for (const m of modules) {
  try { await import('./' + m); }
  catch (e) {
    if (e.message?.includes('Illegal return') || e.message?.includes('SyntaxError') || e.message?.toLowerCase().includes('syntax')) {
      console.log('SYNTAX FAIL:', m, '->', e.message.split('\n')[0]);
    }
  }
}
console.log('done');
