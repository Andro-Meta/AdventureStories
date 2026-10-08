// ui_shot.mjs - game screen with a fake one-hero state, screenshot of the party card at a given width.
// node tools/ui_shot.mjs <out.png> [width]
import { chromium } from 'playwright';
const w = Number(process.argv[3] || 412);
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 700 })).newPage();
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(2500);
await p.evaluate(async () => { const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.adventureTheme = 'pirate'; g.adventureGoal = 'Find the map before the tide turns';
  g.players = [{ id: 'player_1', name: 'Katie', hp: 90, maxHp: 100, mp: 20, maxMp: 20, coins: 5, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] }, { id: 'player_2', name: 'Toby', hp: 70, maxHp: 100, mp: 12, maxMp: 20, coins: 3, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] }];
  g.currentNarrative = 'Katie stood on the docks as the tide rolled in. '.repeat(6); UI.showScreen('gameScreen'); UI.updateNarrative(g.currentNarrative); UI.renderPlayerCards();
  UI.renderChoices([{ type: 'Good', text: 'Ask the harbormaster' }, { type: 'Bad', text: 'Jump in the water' }, { type: 'Risky', text: 'Climb the mast' }, { type: 'Silly', text: 'Sing to the gulls' }, { type: 'Investigative', text: 'Check the footprints' }]); });
await p.waitForTimeout(400);
const sel = process.argv[4]; const box = sel ? await p.$(sel) : null; await (box || p).screenshot({ path: process.argv[2], fullPage: !sel });
await b.close();
