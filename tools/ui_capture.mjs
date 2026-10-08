// ui_capture.mjs - phone-size frames of the game's screens + load sequence, with numbers.
// node ui_capture.mjs <outdir> [port]
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = process.argv[2]; const PORT = process.argv[3] || 8322;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const metrics = () => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const spinners = [...document.querySelectorAll('*')].filter(e => vis(e) && /spin/.test(getComputedStyle(e).animationName || '')).length;
  const bars = [...document.querySelectorAll('[class*=progress],[id*=progress],[class*=bar]')].filter(e => vis(e) && e.children.length <= 2 && e.getBoundingClientRect().height < 30 && e.getBoundingClientRect().width > 100).length;
  const gs = document.getElementById('gameScreen');
  const active = document.querySelector('.screen.active')?.id;
  return { active, spinners, bars, gameW: gs ? Math.round(gs.getBoundingClientRect().width) : 0, docW: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
const log = [];
await page.goto(`http://127.0.0.1:${PORT}/`);
for (let i = 0; i < 12; i++) { log.push({ t: i * 250, phase: 'boot', ...(await metrics()) }); if (i % 4 === 0) await shot(`boot_${i}`); await page.waitForTimeout(250); }
await shot('menu');
const clickShot = async (sel, name) => { await page.click(sel); await page.waitForTimeout(500); await shot(name); log.push({ phase: name, ...(await metrics()) }); };
await clickShot('#localAIBtn', 'ai_settings');
await page.click('#localAIScreen .backBtn'); await page.waitForTimeout(300);
await clickShot('#newGameBtn', 'player_count');
await clickShot('.playerCountBtn[data-count="2"]', 'theme');
await page.selectOption('#adventureTypeSelect', 'pirate');
await clickShot('#adventureTypeNextBtn', 'ages');
for (const [i, el] of (await page.$$('#ageInputsContainer input')).entries()) await el.fill(String([10, 12][i]));
await clickShot('#ageInputNextBtn', 'names');
for (const [i, el] of (await page.$$('#nameInputsContainer input')).entries()) await el.fill(['Katie', 'Toby'][i]);
await page.click('#nameInputStartBtn');
for (let i = 0; i < 80; i++) {
  const m = await metrics(); log.push({ t: i * 300, phase: 'start', ...m });
  if (i % 3 === 0) await shot(`start_${String(i).padStart(2, '0')}`);
  const ready = await page.evaluate(async () => { const { gameState: g } = await import('/state.js'); return (g.currentChoices || []).length >= 4 && !g.isLoading; });
  if (ready) break;
  await page.waitForTimeout(300);
}
await page.waitForTimeout(600);
await shot('game_top');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)); await page.waitForTimeout(200); await shot('game_mid');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200); await shot('game_bottom');
await page.evaluate(() => window.scrollTo(0, 0));
log.push({ phase: 'game', ...(await metrics()), pageH: await page.evaluate(() => document.body.scrollHeight) });
await page.evaluate(() => document.querySelector('#choicesContainer .choice-btn')?.click());
await page.waitForTimeout(700); await shot('turn_loading'); log.push({ phase: 'turn_loading', ...(await metrics()) });
for (let i = 0; i < 60; i++) { if (await page.evaluate(async () => !(await import('/state.js')).gameState.isLoading)) break; await page.waitForTimeout(500); }
await page.waitForTimeout(500); await shot('after_turn');
await clickShot('#menuBtn', 'menu_screen');
await clickShot('#readStoryBtn', 'story_book');
await page.click('#closeStoryBtn'); await page.waitForTimeout(300);
await clickShot('#resumeBtn', 'back_game');
await clickShot('#inventoryBtn', 'inventory');
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(log, null, 1));
await browser.close();
console.log(log.filter(l => l.phase !== 'boot' || l.t % 1000 === 0).map(l => JSON.stringify(l)).join('\n'));
