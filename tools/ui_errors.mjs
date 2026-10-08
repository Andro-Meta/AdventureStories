// ui_errors.mjs - load the game page at phone size, load the newest autosave, print page errors.
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' || /Error|THREW|failed/i.test(m.text())) errs.push(m.text().slice(0, 200)); });
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(3000);
await p.evaluate(async () => { const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.adventureTheme = 'pirate'; g.adventureGoal = 'Find the map'; g.players = [{ id: 'player_1', name: 'Katie', hp: 90, maxHp: 100, mp: 20, maxMp: 20, coins: 5, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] }]; UI.showScreen('gameScreen'); try { UI.updateGameHeader(); } catch (e) { console.error('updateGameHeader THREW ' + e.message + ' ' + e.stack); } UI.renderPlayerCards(); });
await p.waitForTimeout(500);
console.log(await p.evaluate(() => JSON.stringify({ title: document.getElementById('adventureTitle').textContent, goal: document.getElementById('adventureGoal').textContent })));
console.log(errs.join('\n'));
if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
await b.close();
