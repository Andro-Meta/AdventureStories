// ui_fx.mjs - screenshot hit/heal/foe-hit effects mid-animation at phone size.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(2500);
await p.evaluate(async () => { const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.adventureTheme = 'pirate'; g.inCombat = true;
  g.players = [{ id: 'player_1', name: 'Katie', hp: 90, maxHp: 100, mp: 20, maxMp: 20, coins: 5, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] }];
  g.enemies = [{ id: 'enemy_1', name: 'Kraken Spawn', hp: 30, maxHp: 30, atk: 5, def: 1, statusEffects: [] }];
  UI.showScreen('gameScreen'); UI.renderPlayerCards(); UI.renderEnemyCards(); document.getElementById('enemyContainer').scrollIntoView(); });
const step = async (fn, name) => { await p.evaluate(fn); await p.waitForTimeout(180); await p.screenshot({ path: `${out}_${name}.png` }); await p.waitForTimeout(1200); };
await step(async () => { const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.players[0].hp = 70; UI.renderPlayerCards(); }, 'hurt');
await step(async () => { const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.players[0].hp = 95; UI.renderPlayerCards(); }, 'heal');
await step(async () => { const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.enemies[0].hp = 18; UI.renderEnemyCards(); }, 'foehit');
await b.close();
