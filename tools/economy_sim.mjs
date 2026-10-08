// economy_sim.mjs - what a game actually feels like, in numbers. Plays N
// exploration turns per choice type through the real handlePlayerChoice
// (a fake storyteller answers instantly) and reports, per type: coins/turn, HP lost/turn, how often HP moved
// with no reason (success with a loss, or failure with a gain), XP gained,
// levels reached, stat growth.
//   node --experimental-loader ./tools/preload.mjs tools/economy_sim.mjs [turns=40]
import './dom_polyfill.mjs';
// A storyteller that always answers (a failed call now undoes the roll).
const STORY = JSON.stringify({ narration: 'Ava tries it, and the moment plays out.', ops: [], choices: [
  { type: 'Good', text: 'Help the old fisherman haul his net', stat: 'kind' }, { type: 'Bad', text: 'Kick the guard dog to get past it', stat: 'brave' },
  { type: 'Risky', text: 'Leap across the broken bridge', stat: 'brave' }, { type: 'Silly', text: 'Challenge the parrot to a staring contest', stat: 'luck' },
  { type: 'Investigative', text: 'Search the captain desk for clues', stat: 'clever' }] });
globalThis.fetch = async () => ({ ok: true, status: 200, statusText: '200', headers: { get: () => null },
  json: async () => ({ choices: [{ message: { content: STORY } }] }), text: async () => '' });
if (globalThis.window) globalThis.window.fetch = globalThis.fetch;
localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'sim');
const out = (s) => process.stdout.write(s + '\n');
console.log = () => {}; console.info = () => {}; console.warn = () => {}; console.error = () => {};
globalThis.displayVisualError = () => {}; if (globalThis.window) globalThis.window.displayVisualError = () => {};

const { gameState, resetGameState, createNewPlayer } = await import('../state.js');
const AH = await import('../actionHandler.js');
const { xpForLevel } = await import('../progression.js');
const totalXp = (p) => { let t = p.xp || 0; for (let l = 1; l < (p.level || 1); l++) t += xpForLevel(l); return t; };
const TURNS = Number(process.argv[2] || 40);
const TYPES = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];
const TEXT = { Good: 'Help the old fisherman haul his net', Bad: 'Kick the guard dog to get past it', Risky: 'Leap across the broken bridge', Silly: 'Challenge the parrot to a staring contest', Investigative: 'Search the captain\'s desk for clues' };

const rows = [];
for (const type of TYPES) {
  resetGameState();
  gameState.adventureTheme = 'pirate'; gameState.turn = 3;
  const p = createNewPlayer('Ava', 30);
  gameState.players = [p]; gameState.currentPlayerIndex = 0; gameState.isLoading = false; gameState.inCombat = false; gameState.enemies = [];
  const s0 = { coins: p.coins, level: p.level || 1, stats: JSON.stringify(p.stats || {}) };
  let lost = 0, unearned = 0, xp0 = p.xp || 0, xpTotal = 0;
  for (let t = 0; t < TURNS; t++) {
    p.hp = p.maxHp; // measure each turn from full
    const hp = p.hp, xpBefore = totalXp(p), lvBefore = p.level;
    gameState.isLoading = false; gameState.inCombat = false; gameState.enemies = [];
    await AH.handlePlayerChoice(type, TEXT[type]).catch(() => {});
    const band = gameState.narrativeContext?.lastOutcome?.band;
    const d = p.hp - hp;
    if (d < 0) lost += -d;
    // a clean win that hurt, or a setback that healed ('success at a cost' may hurt by design)
    // (a level-up's +HP isn't the roll's doing)
    if (p.level === lvBefore && (((band === 'success' || band === 'crit') && d < 0) || ((band === 'fail' || band === 'fumble') && d > 0))) unearned++;
    xpTotal += totalXp(p) - xpBefore;
  }
  rows.push({ type, coinsPerTurn: ((p.coins - s0.coins) / TURNS).toFixed(1), hpLostPerTurn: (lost / TURNS).toFixed(1), unearnedHp: `${unearned}/${TURNS}`, xpPerTurn: (xpTotal / TURNS).toFixed(1), level: p.level || 1, stats: JSON.stringify(p.stats || {}) });
}
out(`${TURNS} exploration turns per choice type (no fights):`);
for (const r of rows) out(`  ${r.type.padEnd(13)} coins/turn ${r.coinsPerTurn.padStart(5)} | HP lost/turn ${r.hpLostPerTurn.padStart(5)} | HP moved against the outcome ${r.unearnedHp.padStart(5)} | XP/turn ${r.xpPerTurn.padStart(4)} | level ${r.level} | stats ${r.stats}`);
process.exit(0);
