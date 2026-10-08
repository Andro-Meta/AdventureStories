// phone_explore.mjs - full play-through on the phone (debug build, app in front):
// new solo game, every exploration choice type, every fight move, Bag (use a
// potion), Shop, Moves, Menu, Story Book, Save. Screenshots each step into
// <outdir>, prints timings, game errors and display problems found.
//   node tools/phone_explore.mjs <outdir> [turns=14]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const OUT = process.argv[2]; const TURNS = Number(process.argv[3] || 14);
fs.mkdirSync(OUT, { recursive: true });
const DEVICE = process.env.ADB_DEVICE || '192.168.1.44:41529';
const adb = (...a) => execFileSync('adb', ['-s', DEVICE, ...a], { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', 'com.androsmeta.adventurestories').split(/\s+/)[0];
if (!pid) { console.error('App is not running.'); process.exit(1); }
adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('https://localhost'));
const gs = (fn) => page.evaluate(`(async()=>{const {gameState:g}=await import('/state.js');return (${fn})(g)})()`);
const notes = [];
const note = (s) => { notes.push(s); console.log('  ! ' + s); };
let shotN = 0;
// Real-device screenshot (what the player sees, incl. status/nav bars).
const shot = (name) => { const f = `${OUT}/${String(++shotN).padStart(2, '0')}_${name}.png`; fs.writeFileSync(f, execFileSync('adb', ['-s', DEVICE, 'exec-out', 'screencap', '-p'])); return f; };
const errMark = () => page.evaluate(() => (window.__advLog || []).length);
const errsSince = (m) => page.evaluate((m) => (window.__advLog || []).slice(m).filter(l => /Error in handler|TypeError|ReferenceError|THREW|is not a function|undefined/.test(l)), m);
async function settle(max = 120000) {
  const t0 = Date.now(); await page.waitForTimeout(400);
  while (Date.now() - t0 < max) {
    if (await gs(g => !g.isLoading && document.querySelectorAll('#choicesContainer .choice-btn:not(.disabled):not([disabled])').length > 0)) return Date.now() - t0;
    await page.waitForTimeout(300);
  }
  return -1;
}
// Display checks on the current screen: horizontal overflow, clipped text, tiny tap targets.
async function displayCheck(where) {
  const r = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${innerWidth})`);
    const active = document.querySelector('.screen.active') || document.body;
    for (const el of active.querySelectorAll('button, .choice-btn, .card-header, h1, h2, h3, p, span')) {
      const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue;
      const s = getComputedStyle(el);
      if (rc.right > innerWidth + 1) out.push(`off-screen right: "${(el.textContent || '').trim().slice(0, 40)}"`);
      if (el.scrollWidth > el.clientWidth + 2 && s.overflow !== 'visible' && s.whiteSpace === 'nowrap') out.push(`clipped: "${(el.textContent || '').trim().slice(0, 40)}"`);
      if (el.tagName === 'BUTTON' && rc.height < 36 && !el.closest('.hidden')) out.push(`small tap target (${Math.round(rc.height)}px): "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
    return [...new Set(out)].slice(0, 6);
  });
  r.forEach(x => note(`${where}: ${x}`));
}

// ---- new solo game ----
await page.evaluate(async () => (await import('/ui.js')).showScreen('mainMenuScreen'));
shot('main_menu'); await displayCheck('main menu');
await page.click('#newGameBtn'); await page.click('.playerCountBtn[data-count="1"]');
await page.selectOption('#adventureTypeSelect', 'fantasy'); await page.click('#adventureTypeNextBtn');
await (await page.$('#ageInputsContainer input')).fill('40'); await page.click('#ageInputNextBtn');
await (await page.$('#nameInputsContainer input')).fill('Michael');
let m = await errMark(); const t0 = Date.now();
await page.click('#nameInputStartBtn');
await page.waitForTimeout(2500); shot('loading');
const startMs = await settle(180000);
console.log(`new game ${(startMs / 1000).toFixed(1)} s`);
shot('game_start'); await displayCheck('game start');
(await errsSince(m)).forEach(e => note(`start error: ${e}`));

// ---- turns: every exploration type, every fight move ----
const explore = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];
const fightMoves = ['Attack', 'Special', 'Item', 'Attack', 'Run'];
const used = new Set(); let fi = 0;
for (let t = 0; t < TURNS; t++) {
  const s = await gs(g => ({ combat: g.inCombat, types: g.currentChoices.map(c => c.type), hp: g.players[0].hp }));
  const want = s.combat ? fightMoves[fi++ % fightMoves.length] : explore[t % explore.length];
  const type = s.types.includes(want) ? want : s.types[0];
  m = await errMark();
  await page.evaluate((type) => { const b = [...document.querySelectorAll('#choicesContainer .choice-btn')].find(x => x.dataset.actionType === type); b?.scrollIntoView({ block: 'center' }); b?.click(); }, type);
  await page.waitForTimeout(250);
  const ms = await settle();
  used.add(type);
  const after = await gs(g => ({ combat: g.inCombat, foe: (g.enemies || []).filter(e => !e.isDefeated).map(e => `${e.name} ${e.hp}/${e.maxHp}`).join(', '), hp: g.players[0].hp, recap: document.getElementById('turnRecap')?.textContent || '', heroes: g.players.length }));
  console.log(`turn ${t + 1} ${type}: ${(ms / 1000).toFixed(1)} s | HP ${s.hp}->${after.hp}${after.combat ? ' | FIGHT ' + after.foe : ''} | ${after.recap}`);
  if (ms < 0) note(`turn ${t + 1} (${type}) never finished`);
  if (after.heroes !== 1) note(`solo game has ${after.heroes} heroes`);
  if (s.combat !== after.combat || t < 2 || (after.combat && t % 3 === 0)) shot(`turn${t + 1}_${type}${after.combat ? '_fight' : ''}`);
  (await errsSince(m)).forEach(e => note(`turn ${t + 1} error: ${e}`));
}
console.log(`choice types used: ${[...used].join(', ')}`);

// ---- Bag ----
m = await errMark();
await page.click('#inventoryBtn'); await page.waitForTimeout(800);
shot('bag'); await displayCheck('bag');
const bag = await page.evaluate(() => ({ screen: document.querySelector('.screen.active')?.id, cards: document.querySelectorAll('#inventoryDisplay .item-card').length, use: document.querySelectorAll('#inventoryDisplay .useItemBtn').length }));
if (bag.screen !== 'inventoryScreen') note(`Bag did not open (${bag.screen})`);
if (bag.use) { await page.click('#inventoryDisplay .useItemBtn'); await page.waitForTimeout(1500); shot('bag_used_item'); }
(await errsSince(m)).forEach(e => note(`bag error: ${e}`));
await page.evaluate(async () => (await import('/ui.js')).showScreen('gameScreen'));
await settle(60000);

// ---- Shop, Moves ----
for (const [btn, name] of [['#shopBtn', 'shop'], ['#specialBtn', 'moves']]) {
  m = await errMark();
  await page.click(btn); await page.waitForTimeout(800);
  shot(name); await displayCheck(name);
  const scr = await page.evaluate(() => document.querySelector('.screen.active')?.id);
  if (!/shop|special/i.test(scr)) note(`${name} did not open (${scr})`);
  (await errsSince(m)).forEach(e => note(`${name} error: ${e}`));
  await page.evaluate(async () => (await import('/ui.js')).showScreen('gameScreen'));
}

// ---- Menu, Story Book, Save ----
m = await errMark();
await page.click('#menuBtn'); await page.waitForTimeout(500); shot('menu'); await displayCheck('menu');
await page.click('#readStoryBtn'); await page.waitForTimeout(600); shot('story_book'); await displayCheck('story book');
await page.click('#closeStoryBtn'); await page.waitForTimeout(300);
await page.click('#saveGameBtn'); await page.waitForTimeout(600); shot('save_modal'); await displayCheck('save modal');
await page.evaluate(() => document.getElementById('cancelSaveBtn')?.click());
await page.click('#resumeBtn'); await page.waitForTimeout(400);
(await errsSince(m)).forEach(e => note(`menu error: ${e}`));

const end = await gs(g => ({ heroes: g.players.map(p => p.name), npcs: Object.keys(g.entityMemory?.npcs || {}), turn: g.turn, pct: g.questProgress?.completionPercentage, act: document.getElementById('questChapter')?.textContent }));
console.log(`\nend: heroes ${end.heroes.join(', ')} | NPCs ${end.npcs.join(', ')} | round ${end.turn} | ${end.act} ${end.pct}% | total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`issues noted: ${notes.length}`);
fs.writeFileSync(`${OUT}/notes.txt`, notes.join('\n'));
await browser.close();
