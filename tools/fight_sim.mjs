// fight_sim.mjs - does a fight stay a fight as the hero levels up?
// For heroes at several levels: gear at the tier the game's loot gives at that
// level, an ordinary foe and a boss created through the real engine (as the
// storyteller would add them), fought with the real damage formula.
// Reports per level: gear ATK/DEF, hero hits to win, % of hero HP lost.
//   node --experimental-loader ./tools/preload.mjs tools/fight_sim.mjs
import './dom_polyfill.mjs';
globalThis.fetch = async () => { throw new Error('offline'); };
console.log = () => {}; console.warn = () => {}; console.error = () => {};
globalThis.displayVisualError = () => {}; if (globalThis.window) globalThis.window.displayVisualError = () => {};
const out = (s) => process.stdout.write(s + '\n');

const { gameState, resetGameState, createNewPlayer } = await import('../state.js');
const Combat = await import('../combat.js');
const Engine = await import('../engine.js');
const Items = await import('../items.js');
const { levelUp } = await import('../battle.js');

// The tier loot drops at this level (Low for every level before 1.2.1).
const lootTier = (level) => (Items.lootTierFor ? Items.lootTierFor(level) : 'Low');
// What the storyteller tends to write for foes (live logs: 25-40 HP, atk 6-9).
const NARRATOR_FOE = { name: 'Spectral Butler', hp: 30, maxHp: 30, atk: 7, def: 3, abilities: ['Chill Touch'] };
const NARRATOR_BOSS = { name: 'Julian Vance', hp: 60, maxHp: 60, atk: 9, def: 4, isBoss: true, abilities: ['Hypnotic Swing'] };

function hero(level) {
    resetGameState();
    gameState.adventureTheme = 'haunted';
    const p = createNewPlayer('Ava', 30);
    gameState.players = [p]; gameState.currentPlayerIndex = 0;
    if (level > 1) levelUp(p, level - 1);
    for (const type of ['Weapon', 'Armor']) {
        const item = Items.generateThemedItem('fantasy', lootTier(level), type);
        if (item) { item.equippedSlot = type === 'Weapon' ? 'weapon' : 'armor'; p.inventory.push(item); p.equipment = p.equipment || {}; p.equipment[item.equippedSlot] = item.id; }
    }
    Combat.recalculateCharacterStats(p);
    p.hp = p.maxHp;
    return p;
}

function fight(level, foeSpec, n = 300) {
    let hits = 0, lost = 0, wins = 0;
    let gear = null;
    for (let i = 0; i < n; i++) {
        const p = hero(level);
        gear = gear || { atk: p.atk, def: p.def, hp: p.maxHp };
        gameState.enemies = []; gameState.inCombat = false; gameState.questProgress = { milestones: [] };
        Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { ...foeSpec } }], { strict: false });
        const e = gameState.enemies[0];
        let h = 0;
        for (let round = 0; round < 60 && e.hp > 0 && p.hp > 0; round++) {
            e.hp -= Combat.calculateDamage(p, e).damage || 0; h++;
            if (e.hp > 0) p.hp -= Combat.calculateDamage(e, p).damage || 0;
        }
        hits += h; lost += Math.max(0, gear.hp - Math.max(0, p.hp)) / gear.hp; if (e.hp <= 0) wins++;
    }
    return { gear, hits: hits / n, lost: 100 * lost / n, win: 100 * wins / n, foe: { hp: gameState.enemies[0].maxHp, atk: gameState.enemies[0].atk, def: gameState.enemies[0].def } };
}

// --check: every level must keep a fight a fight (before 1.2.1 an ordinary
// foe cost a level-12 hero 1% of HP and a boss 4%).
const CHECK = process.argv.includes('--check');
let bad = 0;
out('level | loot tier | hero ATK DEF HP | ordinary foe (HP/ATK/DEF): hits to win, hero HP lost | boss: hits, HP lost, win%');
for (const L of [1, 3, 5, 8, 12]) {
    const f = fight(L, NARRATOR_FOE), b = fight(L, NARRATOR_BOSS);
    const ok = f.lost >= 5 && f.lost <= 30 && b.lost >= 25 && b.win >= 75;
    if (!ok) bad++;
    out(`${CHECK ? (ok ? '  ✓ ' : '  ✗ ') : ''}L${String(L).padEnd(2)} | ${lootTier(L).padEnd(9)} | ${String(f.gear.atk).padStart(3)} ${String(f.gear.def).padStart(3)} ${String(f.gear.hp).padStart(3)} | foe ${f.foe.hp}/${f.foe.atk}/${f.foe.def}: ${f.hits.toFixed(1)} hits, ${f.lost.toFixed(0)}% HP | boss ${b.foe.hp}/${b.foe.atk}/${b.foe.def}: ${b.hits.toFixed(1)} hits, ${b.lost.toFixed(0)}% HP, win ${b.win.toFixed(0)}%`);
}
if (CHECK) out(bad ? `✗ ${bad} level(s) outside the fight ranges (ordinary foe 5-30% HP; boss >=25% HP, >=75% wins)` : '✓ fights stay fights at every level');
process.exit(CHECK && bad ? 1 : 0);
