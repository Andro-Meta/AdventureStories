// tip_timing_check.mjs - issue #10: every loading tip stays up long enough to read (>= 8 s), even when a
// loading phase swaps in its own tip mid-rotation. Needs tools/play_server.mjs on :8322. Exit 1 on a short tip.
import { chromium } from 'playwright';
const MIN_MS = 8000;
const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
await p.clock.install();
await p.goto('http://127.0.0.1:8322/'); await p.clock.runFor(3000);
await p.evaluate(async () => {
  const { loadingTips: t } = await import('/loadingTips.js'); window.__t = t; window.__changes = [];
  t.startTipRotation();
  new MutationObserver(() => window.__changes.push(performance.now())).observe(t.tipElement, { childList: true, characterData: true, subtree: true });
});
// Phase tips land at uneven times, as initializationManager's phases finish.
for (const at of [2500, 4000, 9000, 15000]) { await p.clock.runFor(at - (await p.evaluate(() => window.__last || 0))); await p.evaluate(a => { window.__last = a; window.__t.showCategoryTip('combat'); }, at); }
await p.clock.runFor(30000);
const ch = await p.evaluate(() => window.__changes);
await b.close();
const gaps = ch.slice(1).map((v, i) => Math.round(v - ch[i]));
const min = Math.min(...gaps);
console.log(`${min >= MIN_MS ? '✓' : '✗'} shortest tip on screen ${min} ms (need ${MIN_MS}); ${gaps.length} swaps: ${gaps.join(', ')}`);
process.exit(min >= MIN_MS ? 0 : 1);
