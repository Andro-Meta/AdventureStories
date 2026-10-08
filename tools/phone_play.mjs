// phone_play.mjs - play a real game on the phone (debug build, app in front)
// through its own buttons and time every turn.
//   node tools/phone_play.mjs [turns=6] [players=1] [theme=pirate]
// Prints per-turn seconds, which provider answered (from the game log),
// hero count, and any extra hero names the story invents. Never reads keys.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const [TURNS = 6, PLAYERS = 1, THEME = 'pirate'] = process.argv.slice(2);
const DEVICE = process.env.ADB_DEVICE || '192.168.1.44:41529';
const adb = (...a) => execFileSync('adb', ['-s', DEVICE, ...a], { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', 'com.androsmeta.adventurestories').split(/\s+/)[0];
if (!pid) { console.error('App is not running.'); process.exit(1); }
adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('https://localhost'));
const gs = (fn) => page.evaluate(`(async()=>{const {gameState:g}=await import('/state.js');return (${fn})(g)})()`);
const logLen = () => page.evaluate(() => (window.__advLog || []).length);
const aiLines = (from) => page.evaluate((f) => (window.__advLog || []).slice(f).filter(l => /\] AI /.test(l)).map(l => l.replace(/^\[[^\]]+\] AI /, '')), from);
async function settle(max = 180000) {
  const t0 = Date.now();
  await page.waitForTimeout(500);
  while (Date.now() - t0 < max) {
    if (await gs(g => !g.isLoading && document.querySelectorAll('#choicesContainer .choice-btn:not(.disabled):not([disabled])').length > 0)) return Date.now() - t0;
    await page.waitForTimeout(400);
  }
  return -1;
}

await page.evaluate(async () => (await import('/ui.js')).showScreen('mainMenuScreen'));
await page.click('#newGameBtn');
await page.click(`.playerCountBtn[data-count="${PLAYERS}"]`);
await page.selectOption('#adventureTypeSelect', THEME);
await page.click('#adventureTypeNextBtn');
const ages = [40, 10, 12]; const names = ['Michael', 'Katie', 'Toby'];
for (const [i, el] of (await page.$$('#ageInputsContainer input')).entries()) await el.fill(String(ages[i]));
await page.click('#ageInputNextBtn');
for (const [i, el] of (await page.$$('#nameInputsContainer input')).entries()) await el.fill(names[i]);
let mark = await logLen();
const t0 = Date.now();
await page.click('#nameInputStartBtn');
const startMs = await settle(240000);
console.log(`new game: ${(startMs / 1000).toFixed(1)} s | calls: ${(await aiLines(mark)).join(' ; ')}`);
const types = ['clever', 'sneaky', 'kind', 'luck', 'brave']; // approaches (data-stat)
const times = [];
for (let t = 0; t < Number(TURNS); t++) {
  mark = await logLen();
  const picked = await page.evaluate((type) => { const bs = [...document.querySelectorAll('#choicesContainer .choice-btn')]; const b = bs.find(x => x.dataset.actionType === type || x.dataset.stat === type) || bs.find(x => x.dataset.actionType === 'Attack') || bs[0]; b.click(); return b.dataset.actionType; }, types[t % types.length]);
  const ms = await settle();
  times.push(ms);
  console.log(`turn ${t + 1} (${picked}): ${(ms / 1000).toFixed(1)} s | ${(await aiLines(mark)).join(' ; ')}`);
}
const end = await gs(g => ({ heroes: g.players.map(p => p.name), npcs: Object.keys(g.entityMemory?.npcs || {}), story: g.storyLog.join('\n') }));
const sorted = [...times].sort((a, b) => a - b);
console.log(`\nheroes in game: ${end.heroes.join(', ')} | NPCs: ${end.npcs.join(', ') || 'none'}`);
console.log(`turn seconds: median ${(sorted[Math.floor(sorted.length / 2)] / 1000).toFixed(1)}, max ${(sorted.at(-1) / 1000).toFixed(1)}, total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
// Hints of invented party members: "Michael and his companion/friends/party/team" etc.
const hits = end.story.match(/\b(companions?|party members?|fellow (adventurers?|heroes?)|his (friends?|team|crew mates?)|the (party|group|team))\b[^.]{0,60}/gi) || [];
console.log(`party-word hits in story: ${hits.length}${hits.length ? ' -> ' + hits.slice(0, 5).join(' | ') : ''}`);
await page.screenshot({ path: process.argv[5] || 'test-results/phone_play.png' });
await browser.close();
