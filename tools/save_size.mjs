// save_size.mjs - load each save from a phone backup (tools/phone_saves.mjs
// backup), save it again with the current code, and report size before ->
// after, plus a reload check (players, turn, quest, story kept).
//   node --experimental-loader ./tools/preload.mjs tools/save_size.mjs [backup.json]
import './dom_polyfill.mjs';
import fs from 'node:fs';
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const out = (s) => process.stdout.write(s + '\n');
const file = process.argv[2] || 'test-results/phone_saves_pre_1.2.7.json';
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const saves = backup.saves || backup;
const { gameState } = await import('../state.js');
const SL = await import('../saveLoad.js');
let bad = 0;
for (const [key, raw] of Object.entries(saves)) {
    if (!key.startsWith('AG-')) continue;
    const slot = key.slice(3);
    localStorage.setItem(key, raw);
    await SL.loadGame(slot);
    const before = { players: gameState.players.map(p => `${p.name} L${p.level}`).join(','), turn: gameState.turn, scenes: (gameState.storyLog || []).length, ms: (gameState.questProgress?.milestones || []).length };
    SL.saveGameToLocalStorage('size-check');
    const after = localStorage.getItem('AG-size-check');
    await SL.loadGame('size-check');
    const again = { players: gameState.players.map(p => `${p.name} L${p.level}`).join(','), turn: gameState.turn, scenes: (gameState.storyLog || []).length, ms: (gameState.questProgress?.milestones || []).length };
    const same = JSON.stringify(before) === JSON.stringify(again);
    if (!same) bad++;
    out(`${slot.slice(0, 44).padEnd(44)} ${String(Math.round(raw.length / 1024)).padStart(4)} KB -> ${String(Math.round(after.length / 1024)).padStart(4)} KB | reload keeps ${JSON.stringify(again)} ${same ? 'ok' : 'CHANGED from ' + JSON.stringify(before)}`);
    localStorage.removeItem('AG-size-check'); localStorage.removeItem(key);
}
process.exit(bad ? 1 : 0);
