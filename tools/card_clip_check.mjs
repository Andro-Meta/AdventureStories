// card_clip_check.mjs - issue #11: an opened party card must show all of its details below the name banner.
// Needs tools/play_server.mjs on :8322. node tools/card_clip_check.mjs [shot.png]  (exit 1 on clip / wrong order)
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 900 }, isMobile: true })).newPage();
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(2500);
const r = await p.evaluate(async () => {
  const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js'); g.adventureTheme = 'steampunk';
  const fx = Array.from({ length: 12 }, (_, i) => ({ name: `Long Lasting Effect Number ${i}`, duration: 3 }));
  g.players = [{ id: 'player_1', name: 'Katie', level: 9, hp: 90, maxHp: 100, mp: 20, maxMp: 20, coins: 5, atk: 14, def: 9,
    stats: { brave: 6, clever: 5, sneaky: 4, kind: 3 }, inventory: [], statusEffects: fx, specialMoves: [],
    equipment: { weapon: { name: 'Masterwork Aether Blade of the Engineer', tier: 'Epic' }, armor: { name: 'Brass Plated Overcoat of Endless Pockets', tier: 'Rare' } } }];
  UI.showScreen('gameScreen'); UI.renderPlayerCards();
  document.querySelector('.player-card .card-header').click();
  await new Promise(res => setTimeout(res, 700));
  const d = document.querySelector('.player-card .card-details'), h = document.querySelector('.player-card .card-header');
  return { detailsBelowHeader: d.getBoundingClientRect().top >= h.getBoundingClientRect().bottom - 1,
    hiddenPx: Math.max(0, d.scrollHeight - d.clientHeight), scrollable: getComputedStyle(d).overflowY };
});
if (process.argv[2]) await p.screenshot({ path: process.argv[2], fullPage: true });
await b.close();
const ok = r.detailsBelowHeader && (r.hiddenPx === 0 || r.scrollable === 'auto');
console.log(`${ok ? '✓' : '✗'} card details below header=${r.detailsBelowHeader}, clipped px=${r.hiddenPx}, overflow-y=${r.scrollable}`);
process.exit(ok ? 0 : 1);
