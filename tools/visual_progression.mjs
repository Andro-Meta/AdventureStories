// visual_progression.mjs - screenshots of the stats/XP/odds UI at phone width
// (python -m http.server 8399 from the project root; no AI calls).
import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, deviceScaleFactor: 2 })).newPage();
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.goto('http://127.0.0.1:8399/'); await p.waitForTimeout(2000);
await p.evaluate(async () => {
  const { gameState, createNewPlayer } = await import('/state.js');
  const UI = await import('/ui.js');
  const h = createNewPlayer('Michael', 40); h.stats = { brave: 2, clever: 3, sneaky: 1, kind: 1 }; h.xp = 60; h.sparks = { clever: 4 };
  gameState.players = [h]; gameState.currentPlayerIndex = 0; gameState.adventureTheme = 'pirate'; gameState.turn = 6;
  gameState.adventureGoal = 'Find the drowned captain\'s map.'; gameState.inCombat = false; gameState.enemies = [];
  gameState.shopItems = [];
  UI.showScreen('gameScreen'); UI.renderPlayerCards();
  UI.renderChoices([{ type: 'Good', text: 'Help the old fisherman haul his net' }, { type: 'Bad', text: 'Kick the guard dog to get past it' },
    { type: 'Risky', text: 'Leap across the broken bridge' }, { type: 'Silly', text: 'Challenge the parrot to a staring contest' },
    { type: 'Investigative', text: 'Search the captain\'s desk for clues' }]);
});
await p.waitForTimeout(500);
await p.evaluate(() => document.getElementById('choicesContainer')?.scrollIntoView({ block: 'start' }));
await p.screenshot({ path: `${OUT}/p1_choices_odds.png` });
await p.evaluate(() => document.querySelector('.hero-stats')?.scrollIntoView({ block: 'center' }));
await p.screenshot({ path: `${OUT}/p2_hero_stats.png` });
// Level up
await p.evaluate(async () => { const { gameState } = await import('/state.js'); gameState.players[0].statPoints = 1; (await import('/ui.js')).promptStatPoints(); });
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/p3_levelup_picker.png` });
await p.evaluate(() => document.querySelector('#battlePicker .bp-option')?.click());
await p.waitForTimeout(400);
// Inn
await p.evaluate(async () => { const { gameState } = await import('/state.js'); gameState.players[0].hp = 60; const UI = await import('/ui.js'); UI.renderShop(); UI.showScreen('shopScreen'); });
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/p4_inn.png` });
console.log('stats after pick', await p.evaluate(async () => JSON.stringify((await import('/state.js')).gameState.players[0].stats)));
console.log('errors', JSON.stringify(errors));
await b.close();
