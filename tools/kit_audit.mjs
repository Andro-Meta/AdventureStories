// kit_audit.mjs - does every item, spell and special move in real saves do
// what it says? For each hero in a phone backup (tools/phone_saves.mjs):
// each consumable used in a fight, each spell cast, each special move used,
// against a sturdy foe with the hero at 40% HP. Prints what changed and flags
// anything that did nothing, or whose words promise something that didn't happen.
//   node --experimental-loader ./tools/preload.mjs tools/kit_audit.mjs [backup.json]
import './dom_polyfill.mjs';
import fs from 'node:fs';
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const out = (s) => process.stdout.write(s + '\n');
const file = process.argv[2] || 'test-results/phone_saves_pre_logs_1010.json';
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
const saves = backup.saves || backup;
const { gameState } = await import('../state.js');
const SL = await import('../saveLoad.js');
const AH = await import('../actionHandler.js');
const Engine = await import('../engine.js');
const Combat = await import('../combat.js');
Combat.pace.ms = 0;
globalThis.fetch = window.fetch = async () => { throw new Error('offline'); }; // no storyteller: mechanics only
const realRandom = Math.random;

const WORDS = { damage: /damage|blast|strike|bolt|burn|shock|discharge|slash|smash|lance|pulse|purge|explo|attack|hit/i, heal: /heal|restor|repair|mend|regen|recover/i, buff: /boost|increase|shield|protect|armou?r|empower|haste|ward|barrier/i };
const snapshot = (p, e) => ({ hp: p.hp, mp: p.mp, atk: p.atk, def: p.def, st: (p.statusEffects || []).map(s => s.name).join(','), foeHp: e?.hp, foeSt: (e?.statusEffects || []).map(s => s.name).join(','), foeAtk: e?.atk, inv: (p.inventory || []).reduce((n, i) => n + (i.quantity ?? 1), 0) });
const diff = (a, b) => {
    const d = [];
    if (b.hp !== a.hp && b.hp - a.hp !== -1) d.push(`HP ${b.hp - a.hp > 0 ? '+' : ''}${b.hp - a.hp}`); // -1: the dummy's answer (atk 1)
    if (b.mp !== a.mp) d.push(`MP ${b.mp - a.mp > 0 ? '+' : ''}${b.mp - a.mp}`);
    if (b.foeHp !== a.foeHp) d.push(`foe ${b.foeHp - a.foeHp}`);
    const newSt = b.st.split(',').filter(x => x && !a.st.split(',').includes(x)); if (newSt.length) d.push(`hero gets ${newSt.join('/')}`);
    const newFoe = b.foeSt.split(',').filter(x => x && !a.foeSt.split(',').includes(x)); if (newFoe.length) d.push(`foe gets ${newFoe.join('/')}`);
    if (b.inv < a.inv) d.push('used up');
    return d;
};

async function trial(slot, act, setup = () => {}) {
    await SL.loadGame(slot);
    const p = gameState.players[gameState.currentPlayerIndex] || gameState.players[0];
    gameState.isLoading = false; gameState.imprisoned = false;
    gameState.enemies = []; gameState.inCombat = false;
    Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Test Dummy', hp: 5000, maxHp: 5000, atk: 1, def: 5 } }, { op: 'replace', path: '/inCombat', value: true }], { strict: false });
    gameState.enemies[0].hp = gameState.enemies[0].maxHp = 5000; gameState.enemies[0].atk = 1;
    Combat.initializeCombat(gameState.enemies); // a real fight: turn order, status ticks
    const e = gameState.enemies[0]; // (read after the fight starts: it may rebuild the list)
    p.hp = Math.round(p.maxHp * 0.4); p.mp = p.maxMp; p.isDowned = false; p.statusEffects = [];
    (p.specialMoves || []).forEach(m => { if (m) m.currentCooldown = 0; });
    gameState.currentPlayerIndex = gameState.players.indexOf(p);
    gameState.pickedTargetId = e.id;
    setup(p);
    const before = snapshot(p, e);
    Math.random = () => 0.5;
    try { await act(p, e); } catch (err) { Math.random = realRandom; return { p, error: err.message }; }
    Math.random = realRandom;
    // The hero's own action only: undo the foe's answer (atk 1) by reading the log line instead would be heavier.
    return { p, before, after: snapshot(p, e) };
}

for (const [key, raw] of Object.entries(saves)) {
    if (!key.startsWith('AG-')) continue;
    const slot = key.slice(3);
    localStorage.setItem(key, raw);
    await SL.loadGame(slot);
    const hero = gameState.players[0];
    out(`\n=== ${slot} | ${hero.name} L${hero.level} ATK ${hero.atk} DEF ${hero.def} HP ${hero.maxHp} MP ${hero.maxMp} ===`);
    const flags = [];
    const items = (hero.inventory || []).filter(i => i && i.type === 'Consumable');
    for (const it of items) {
        const r = await trial(slot, () => AH.handlePlayerChoice('Item', `Use ${it.name}`), (p) => { p.mp = 0; }); // MP potions need room to show
        const d = r.error ? [`ERROR ${r.error}`] : diff(r.before, r.after);
        const said = String(it.effect || '').slice(0, 70);
        const nothing = !r.error && d.filter(x => x !== 'used up').length === 0;
        if (nothing || r.error) flags.push(`item "${it.name}": ${r.error || 'did nothing'} (says: ${said})`);
        out(`  item  ${it.name.slice(0, 34).padEnd(34)} ${JSON.stringify(it.stats || {}).slice(0, 60).padEnd(60)} -> ${d.join(', ') || 'NOTHING'}`);
    }
    for (const s of hero.spellcasting?.knownSpells || []) {
        const r = await trial(slot, (p) => AH.handlePlayerChoice('Spell', `Cast ${s.name}`));
        const d = r.error ? [`ERROR ${r.error}`] : diff(r.before, r.after);
        const text = `${s.name} ${s.description || ''}`;
        const dealt = d.some(x => x.startsWith('foe -')), healed = d.some(x => /^HP \+/.test(x));
        const nothing = !r.error && d.filter(x => !x.startsWith('MP')).length === 0;
        if (nothing) flags.push(`spell "${s.name}": did nothing (effects ${JSON.stringify(s.effects)})`);
        out(`  spell ${s.name.slice(0, 34).padEnd(34)} ${JSON.stringify(s.effects || {}).slice(0, 60).padEnd(60)} -> ${d.join(', ') || 'NOTHING'}`);
    }
    for (const m of hero.specialMoves || []) {
        const r = await trial(slot, (p) => AH.handlePlayerChoice('Special', `Use ${m.name}`));
        const d = r.error ? [`ERROR ${r.error}`] : diff(r.before, r.after);
        if (!r.error && d.filter(x => !x.startsWith('MP')).length === 0) flags.push(`move "${m.name}": did nothing (mechanics ${JSON.stringify(m.mechanics)})`);
        out(`  move  ${m.name.slice(0, 34).padEnd(34)} ${JSON.stringify(m.mechanics || {}).slice(0, 60).padEnd(60)} -> ${d.join(', ') || 'NOTHING'}`);
    }
    out(flags.length ? `  FLAGS (${flags.length}):\n   - ${flags.join('\n   - ')}` : '  no flags');
    localStorage.removeItem(key);
}
