// live_test.mjs - end-to-end test against the REAL free AI (OpenRouter key
// from .env via tools/play_server.mjs). Plays through the UI buttons and
// checks the parts offline tests can't: the storyteller's replies, a named
// villain boss fight, afflictions and potions in a live fight, the win,
// epilogue, story book and save/load.
//
//   node tools/live_test.mjs                  boss scenario (~20-40 AI calls)
//   node tools/live_test.mjs --players 2      same, two heroes
//   node tools/live_test.mjs --full           whole game from turn 1 to the win (~150-200 calls)
//   node tools/live_test.mjs --headed         watch it
//
// Boss scenario: plays 2 real opening turns, then jumps the quest to Act 3
// with ops the narrator itself would send (villain reveal, potions, a skill,
// Poison), plays one live Act 3 turn, starts the fight with the villain and
// fights it out with Attack / Special / Item buttons.
// Uses its own play_server on :8323. Exit code 1 if any check fails.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const PLAYERS = Number(args[args.indexOf('--players') + 1]) || 1;
const PORT = 8323;
const URL_ = `http://127.0.0.1:${PORT}/`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VILLAIN = 'Captain Morrow Blackwake';

let failed = 0;
const results = [];
const check = (ok, msg) => { results.push(`${ok ? '  ✓' : '  ✗'} ${msg}`); console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };
const note = (msg) => console.log(`    ${msg}`);

// --- server -----------------------------------------------------------------
for (const f of fs.readdirSync(`${ROOT}test-results`)) if (/^play_call_\d+\.json$/.test(f)) fs.unlinkSync(`${ROOT}test-results/${f}`);
const server = spawn(process.execPath, ['tools/play_server.mjs'], { cwd: ROOT, env: { ...process.env, PLAY_PORT: String(PORT), PLAY_DUMP: '1' } });
const usage = { calls: 0, failed: 0, in: 0, out: 0 };
server.stdout.on('data', d => {
  for (const line of String(d).split('\n')) {
    const m = line.match(/total calls=(\d+) failed=(\d+) in=(\d+) out=(\d+)/);
    if (m) Object.assign(usage, { calls: +m[1], failed: +m[2], in: +m[3], out: +m[4] });
  }
});
server.stderr.on('data', d => process.stderr.write(d));
await new Promise(r => setTimeout(r, 1200));

// --keep-profile: reuse one browser profile across runs, so a second game
// sees the names the first one used (cross-game variety check).
const browser = args.includes('--keep-profile')
  ? await chromium.launchPersistentContext(`${ROOT}test-results/live_profile`, { headless: !args.includes('--headed'), viewport: { width: 1100, height: 900 } })
  : await chromium.launch({ headless: !args.includes('--headed') });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { const t = m.text(); if (/ReferenceError|TypeError|is not defined|SyntaxError/.test(t)) errors.push(t.slice(0, 200)); });

const gs = (fn) => page.evaluate(`(async()=>{const {gameState:g}=await import('/state.js');return (${fn})(g)})()`);
async function settle(timeoutMs = 120000) {
  const t0 = Date.now();
  await page.waitForTimeout(400);
  while (Date.now() - t0 < timeoutMs) {
    // Level-up: the game asks which stat to raise; take the first open one (and count it).
    const raised = await page.evaluate(() => { const t = document.querySelector('#battlePicker .bp-title')?.textContent || ''; if (!/raise a stat/.test(t)) return null; const o = document.querySelector('#battlePicker .bp-option:not([disabled])'); o?.click(); return o?.querySelector('.bp-label')?.textContent || null; });
    if (raised) { globalThis.__statPicks = (globalThis.__statPicks || 0) + 1; console.log(`  level-up -> ${raised}`); await page.waitForTimeout(300); continue; }
    const ready = await gs(g => !g.isLoading && !g.combatRoundInProgress && document.querySelectorAll('#choicesContainer .choice-btn:not(.disabled):not([disabled])').length > 0);
    if (ready) return true;
    await page.waitForTimeout(700);
  }
  return false;
}
async function clickType(type, prefer = null) {
  const label = await page.evaluate((type) => {
    const btns = [...document.querySelectorAll('#choicesContainer .choice-btn')].filter(b => !b.disabled && !b.classList.contains('disabled'));
    const b = btns.find(x => x.dataset.actionType === type || x.dataset.stat === type) || btns[0];
    if (!b) return null;
    b.click();
    return `${b.dataset.stat ? b.dataset.stat + '/' : ''}${b.dataset.actionType}: ${b.textContent.trim().slice(0, 70)}`;
  }, type);
  // Battle picker (Special / Item / target): choose like a player would.
  await page.waitForTimeout(300);
  const picked = await page.evaluate((prefer) => {
    const sheet = document.getElementById('battlePicker'); if (!sheet) return null;
    const opts = [...sheet.querySelectorAll('.bp-option:not([disabled])')];
    const o = (prefer && opts.find(x => x.textContent.includes(prefer))) || opts.find(x => !/power strike/i.test(x.textContent)) || opts[0];
    o?.click();
    return o?.querySelector('.bp-label')?.textContent || null;
  }, prefer);
  return picked ? `${label} -> ${picked}` : label;
}
const op = (ops) => page.evaluate(async (ops) => (await import('/engine.js')).applyDiff(ops, { strict: false }), ops);

// --- new game through the setup screens ------------------------------------
await page.goto(URL_);
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (!k.startsWith('adv.apiKey') && k !== 'adv.usedNames') localStorage.removeItem(k); });
await page.goto(URL_);
await page.click('#newGameBtn');
await page.click(`.playerCountBtn[data-count="${PLAYERS}"]`);
const THEME = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : 'pirate';
await page.selectOption('#adventureTypeSelect', THEME);
if (THEME === 'custom') await page.fill('#customThemeInput', args.includes('--custom') ? args[args.indexOf('--custom') + 1] : 'Ancient Egypt with talking cats');
await page.click('#adventureTypeNextBtn');
const AGES = [10, 12, 35], NAMES = ['Katie', 'Toby', 'Dad'];
const ageInputs = await page.$$('#ageInputsContainer input');
for (let i = 0; i < ageInputs.length; i++) await ageInputs[i].fill(String(AGES[i]));
await page.click('#ageInputNextBtn');
const nameInputs = await page.$$('#nameInputsContainer input');
for (let i = 0; i < nameInputs.length; i++) await nameInputs[i].fill(NAMES[i]);
const tStart = Date.now();
await page.click('#nameInputStartBtn');
check(await settle(180000), 'new game starts and shows choices');
const opening = await gs(g => ({ words: (g.currentNarrative || '').split(/\s+/).length, goal: g.adventureGoal, n: g.currentChoices.length, types: g.currentChoices.map(c => c.stat || '-').sort().join(','), dangers: g.currentChoices.map(c => c.type).join(',') }));
if (opening.words <= 60) console.log((await page.evaluate(() => (window.__advLog || []).filter(l => /error|fail|ERROR|THREW|not defined|not a function|AI /i.test(l)).slice(-15).join(String.fromCharCode(10)))));
check(opening.words > 60 && opening.goal, `opening story (${opening.words} words), goal: "${opening.goal}"`);
const tags = await gs(g => g.currentChoices.map(c => `${c.stat || '-'}: ${c.text}`));
check(tags.filter(t => !t.startsWith('-')).length >= 4, `storyteller tags choices with the stat they use: ${tags.map(t => t.slice(0, 60)).join(' | ')}`);
check(opening.types === 'brave,clever,kind,luck,sneaky', `5 choices, one per approach (${opening.types}), dangers ${opening.dangers}`);

const TYPES = ['clever', 'sneaky', 'kind', 'luck', 'brave']; // approaches, clicked by data-stat
async function playTurn(i) {
  const picked = await clickType(TYPES[i % TYPES.length]);
  const ok = await settle();
  return { picked, ok };
}

// --turns N [--tag name]: play N natural turns, save the story for
// tools/story_judge.mjs, stop (story-quality measurement, not a pass/fail run).
const TURNS = Number(args[args.indexOf('--turns') + 1]) || 0;
if (TURNS) {
  for (let t = 0; t < TURNS; t++) {
    if (await gs(g => g.inCombat)) { await clickType('Attack'); await settle(); } else await playTurn(t);
  }
  const tag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : 'run';
  const story = await gs(g => ({ theme: g.adventureTheme, custom: g.customThemeDescription, location: g.currentLocation?.name, goal: g.adventureGoal, villain: g.questProgress?.villain, threads: g.storyThreads || [], names: Object.keys(g.entityMemory?.npcs || {}).concat(Object.keys(g.entityMemory?.locations || {})), usedBefore: JSON.parse(localStorage.getItem('adv.usedNames') || '[]'), log: g.storyLog }));
  fs.writeFileSync(`${ROOT}test-results/story_${tag}.json`, JSON.stringify(story, null, 2));
  console.log(`saved ${story.log.length} scenes -> test-results/story_${tag}.json | AI calls ${usage.calls} | tokens in ${usage.in} out ${usage.out}`);
  await browser.close(); server.kill(); process.exit(0);
}

if (FULL) {
  // --- whole game ------------------------------------------------------------
  let t = 0;
  for (; t < 120; t++) {
    const s = await gs(g => ({ won: !!g.isGoalComplete, combat: g.inCombat }));
    if (s.won) break;
    if (s.combat) { await clickType('Attack'); await settle(); } else await playTurn(t);
    if (t % 10 === 9) note(`turn ${t + 1}: ${JSON.stringify(await gs(g => ({ pct: g.questProgress?.completionPercentage, villain: g.questProgress?.villain, hp: g.players.map(p => p.hp).join('/') })))}`);
  }
  const end = await gs(g => ({ won: !!g.isGoalComplete, villain: g.questProgress?.villain, bossKilled: (g.enemies || []).some(e => e.isBoss && e.isDefeated) }));
  check(end.won, `game won after ${t} choices`);
  check(!!end.villain, `a villain was named (${end.villain})`);
  check(end.bossKilled, 'the win came from defeating a boss');
} else {
  // --- boss scenario -----------------------------------------------------------
  for (let i = 0; i < 2; i++) { const r = await playTurn(i); check(r.ok, `live turn ${i + 1}: ${r.picked}`); }
  const recap = await page.$eval('#turnRecap', el => el.textContent).catch(() => '');
  check(!!recap, `turn recap shown ("${recap}")`);

  // What the narrator would send over Acts 1-2, plus kit for the fight.
  await op([
    ...['call_to_adventure', 'world_introduced', 'stakes_clear', 'ally_found', 'first_obstacle_overcome'].map(name => ({ op: 'add', path: '/questProgress/milestones/-', value: { name, description: 'test jump' } })),
    { op: 'add', path: '/questProgress/milestones/-', value: { name: 'antagonist_revealed', description: 'The red tide is his doing.', villain: VILLAIN } },
    { op: 'replace', path: '/questProgress/completionPercentage', value: 70 },
  ]);
  for (let p = 0; p < PLAYERS; p++) await op([
    { op: 'add', path: `/players/${p}/inventory/-`, value: { name: 'Healing Potion', stats: { heal: 35 }, quantity: 2 } },   // no type on purpose
    { op: 'add', path: `/players/${p}/inventory/-`, value: { name: 'Stormcaller Cutlass', type: 'weapon', stats: { atk: 14 } } },
    { op: 'replace', path: `/players/${p}/equipment/weapon`, value: 'Stormcaller Cutlass' },
    { op: 'add', path: `/players/${p}/specialMoves/-`, value: { name: 'Tidal Slash', description: 'a wave-charged cut', cooldown: 2, mpCost: 0, usageContext: 'combat', mechanics: { directDamage: 12, statusEffects: ['Burn'] } } },
    { op: 'add', path: `/players/${p}/statusEffects/-`, value: { name: 'Poison', duration: 4 } },
  ]);
  const kit = await gs(g => ({ villain: g.questProgress.villain, act: document.getElementById('questChapter')?.textContent,
    potion: g.players[0].inventory.find(i => i.name === 'Healing Potion')?.type, atk: g.players[0].atk, poison: g.players[0].statusEffects.find(s => s.name === 'Poison')?.effectTickData?.hpPerTurn }));
  check(kit.villain === VILLAIN, `villain stored: ${kit.villain}`);
  check(kit.potion === 'Consumable', `untyped "Healing Potion" became ${kit.potion}`);
  check(kit.atk >= 19, `weapon typed "weapon" equipped by name: ATK ${kit.atk}`);
  check(kit.poison === -3, `Poison has its tick (${kit.poison}/turn)`);

  // One live Act 3 turn: is the villain in the storyteller's brief?
  const hp0 = await gs(g => g.players[0].hp);
  const r3 = await playTurn(2);
  check(r3.ok, `live Act 3 turn: ${r3.picked}`);
  const brief = fs.readdirSync(`${ROOT}test-results`).filter(f => /^play_call_\d+\.json$/.test(f)).map(f => fs.readFileSync(`${ROOT}test-results/${f}`, 'utf8')).join(' ');
  check(brief.includes(`MAIN VILLAIN: ${VILLAIN}`), 'storyteller is told who the villain is');
  const afterTurn = await gs(g => ({ hp: g.players[0].hp, poison: g.players[0].statusEffects.find(s => s.name === 'Poison')?.duration }));
  note(`Poison outside combat: HP ${hp0} -> ${afterTurn.hp}, Poison turns left ${afterTurn.poison}`);
  check(afterTurn.poison < 4, `Poison ticks down outside combat (4 -> ${afterTurn.poison})`);

  // The villain shows up (the op the narrator sends when the fight starts),
  // first a minion, then the villain himself.
  await op([{ op: 'add', path: '/enemies/-', value: { name: 'Bilge Rat Deckhand', hp: 18, maxHp: 18, atk: 5, def: 1 } },
            { op: 'add', path: '/enemies/-', value: { name: VILLAIN, hp: 30, maxHp: 30, atk: 7, def: 3, abilities: ['Cutlass Flurry'] } },
            { op: 'replace', path: '/inCombat', value: true },
            // Everyone starts the fight hurt, so the potion gets drunk.
            ...Array.from({ length: PLAYERS }, (_, p) => ({ op: 'replace', path: `/players/${p}/hp`, value: 45 }))]);
  const foes = await gs(g => g.enemies.map(e => ({ name: e.name, boss: !!e.isBoss, hp: e.maxHp })));
  check(!foes[0].boss && foes[1].boss && foes[1].hp >= 60, `villain is the boss, minion is not (${foes.map(f => `${f.name}${f.boss ? '*' : ''} ${f.hp}`).join(', ')})`);
  // Fresh combat choices for whoever acts first (live call).
  await page.evaluate(async () => {
    const AI = await import('/aiHandler.js'); const UI = await import('/ui.js'); const { gameState: g } = await import('/state.js');
    UI.renderEnemyCards(); UI.renderChoices(await AI.requestChoicesOnly(g.currentNarrative, true));
  });
  await settle();

  // Fight: potion when hurt, the skill when ready, otherwise attack.
  const seen = { potion: 0, special: 0, signature: false, burn: false, poisonTicks: 0, potionHealed: 0 };
  let rounds = 0;
  for (; rounds < 40; rounds++) {
    const s = await gs(g => {
      const p = g.players[g.currentPlayerIndex];
      return { combat: g.inCombat, won: !!g.isGoalComplete, hp: p?.hp, max: p?.maxHp, potions: p?.inventory.find(i => i.name === 'Healing Potion')?.quantity || 0,
        ready: (p?.specialMoves || []).some(m => !(m.currentCooldown > 0)), boss: g.enemies.find(e => e.isBoss), poison: p?.statusEffects?.find(x => x.name === 'Poison')?.duration };
    });
    if (!s.combat || s.won) break;
    let type = 'Attack';
    if (s.hp < s.max * 0.6) seen.lowHp = true;
    if (s.hp < s.max * 0.6 && s.potions > 0) type = 'Item';
    else if (s.ready && rounds % 2 === 0) type = 'Special';
    else if (!seen.defend && rounds >= 1) type = 'Defend'; // first round free of potion/special needs
    const before = s;
    const picked = await clickType(type, type === 'Item' ? 'Healing Potion' : null);
    if (type === 'Defend') seen.defend = await gs(g => g.players.some(p => p.statusEffects?.some(x => x.name === 'Guarding')) || /braces behind their guard/.test(document.getElementById('combatLogStrip')?.innerText || ''));
    await settle();
    const after = await gs(g => { const p = g.players[0]; const b = g.enemies.find(e => e.isBoss);
      return { hp: p.hp, potions: p.inventory.find(i => i.name === 'Healing Potion')?.quantity || 0, bossHp: b?.hp, bossBurn: g.enemies.some(e => e.statusEffects?.some(x => x.name === 'Burn')),
        log: document.getElementById('combatLogStrip')?.innerText || '' }; });
    if (type === 'Item' && after.potions < before.potions) seen.potion++;
    if (type === 'Special') seen.special++;
    if (after.bossBurn) seen.burn = true;
    if (/unleashes/i.test(after.log)) seen.signature = true;
    note(`round ${rounds + 1}: ${picked} | hero HP ${before.hp} -> ${after.hp} | boss ${before.boss?.hp} -> ${after.bossHp}`);
  }
  fs.writeFileSync(`${ROOT}test-results/fightlog_${args.includes("--tag") ? args[args.indexOf("--tag") + 1] : "boss"}.txt`, (await page.evaluate(() => (window.__advLog || []).filter(l => /deals|damage|Combat:|Applying status|status:|sluggish|confused|hasted|misses|blocks|Recalc|ATK|DEF|Power Strike|special|Special/i.test(l)).join(String.fromCharCode(10)))));
  const fin = await gs(g => ({ won: !!g.isGoalComplete, boss: g.enemies.find(e => e.isBoss), poisonLeft: g.players[0].statusEffects.some(x => x.name === 'Poison'), downed: g.players.every(p => p.isDowned || p.hp <= 0) }));
  check(seen.potion > 0 || !seen.lowHp, seen.lowHp ? `potion drunk in the fight (${seen.potion}x, stack went down by one each time)` : 'hero never needed a potion (stayed above 60% HP)');
  check(seen.special > 0, `Special used (${seen.special}x)`);
  check(seen.defend, 'Defend raised a guard in the live fight');
  check(seen.burn, 'Special put Burn on its target');
  check(seen.signature, 'boss used its signature move');
  check(!fin.poisonLeft, 'Poison wore off');
  check(fin.won, `boss ${VILLAIN} defeated and quest won after ${rounds} fight turns${fin.downed ? ' (party wiped!)' : ''}`);
}

// --- after the win -------------------------------------------------------------
await page.waitForTimeout(1500);
for (let i = 0; i < 60; i++) { if (await gs(g => !g.isLoading)) break; await page.waitForTimeout(1000); }
const win = await gs(g => ({ epi: (g.epilogue || '').length, coins: g.players.map(p => p.coins), legendary: g.players.every(p => p.inventory.some(i => i.questReward)), god: !!g.isGoalComplete, log: g.storyLog.length, lastHasEpi: (g.storyLog.at(-1) || '').includes('Epilogue') }));
fs.writeFileSync(`${ROOT}test-results/story_${args.includes('--tag') ? args[args.indexOf('--tag') + 1] : 'boss'}.json`, JSON.stringify(await gs(g => ({ villain: g.questProgress?.villain, threads: g.storyThreads, log: g.storyLog })), null, 2));
check(win.epi > 100, `epilogue written (${win.epi} chars)`);
check(win.legendary && win.coins.every(c => c >= 1000), `rewards: 1000+ coins (${win.coins.join('/')}) and a legendary item each`);
check(win.lastHasEpi, `story book holds ${win.log} scenes ending with the epilogue`);
await page.click('#menuBtn'); await page.click('#readStoryBtn');
const book = await page.$eval('#storyBookText', el => el.textContent.length);
check(book > 1000, `Story Book screen shows the tale (${book} chars)`);
await page.screenshot({ path: `${ROOT}test-results/live_test_storybook.png` });
await page.click('#closeStoryBtn');

// Save/continue: autosave exists and reloads with the villain and story intact.
const slot = await page.evaluate(() => Object.keys(localStorage).find(k => k.includes('Autosave')));
await page.goto(URL_);
const reloaded = await page.evaluate(async (slot) => {
  const SL = await import('/saveLoad.js'); const C = await import('/config.js');
  await SL.loadGame(slot.slice(C.SAVE_GAME_PREFIX.length));
  const { gameState: g } = await import('/state.js');
  return { villain: g.questProgress?.villain, log: g.storyLog?.length, won: !!g.isGoalComplete };
}, slot);
check(!!slot && reloaded.won && reloaded.log === win.log, `autosave reloads (won=${reloaded.won}, ${reloaded.log} scenes, villain ${reloaded.villain || 'n/a'})`);

check(errors.length === 0, `no script errors in the page${errors.length ? ': ' + [...new Set(errors)].slice(0, 3).join(' | ') : ''}`);
const mins = ((Date.now() - tStart) / 60000).toFixed(1);
await browser.close();
server.kill();

const summary = `${failed ? `✗ ${failed} LIVE CHECK(S) FAILED` : '✓ all live checks passed'} | ${mins} min | AI calls ${usage.calls} (${usage.failed} failed) | tokens in ${usage.in} out ${usage.out}`;
console.log(`\n${summary}`);
fs.writeFileSync(`${ROOT}test-results/live_test_result.txt`, results.join('\n') + `\n${summary}\n`);
process.exit(failed ? 1 : 0);
