// roster.js - heroes that travel between games (Michael 10-09: "our created
// character could be used in other games"). Every autosave copies each hero's
// progress here; on the Player Names screen a saved hero can be picked instead
// of making a new one. Stored in localStorage 'adv.heroes' (this device); save
// export/import carries it too.
const KEY = 'adv.heroes';
const MAX = 30; // newest kept

// What carries over: who they are and everything they earned.
const CARRY = ['name', 'age', 'level', 'xp', 'stats', 'sparks', 'statPoints', 'maxHp', 'maxMp', 'baseAtk', 'baseDef',
    'specialMoves', 'spellcasting', 'abilityPicks', 'levelHealTotal', 'inventory', 'equipment', 'coins'];

function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
}
function write(all) {
    const keep = Object.values(all).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.map(h => [h.rosterId, h])))); } catch (_) {}
}

/** Copy the party's heroes into the roster (called on every autosave). */
export function rememberHeroes(players, theme) {
    if (!players?.length) return;
    const all = read();
    for (const p of players) {
        if (!p?.name) continue;
        p.rosterId = p.rosterId || p.id;
        const snap = JSON.parse(JSON.stringify(Object.fromEntries(CARRY.filter(k => p[k] !== undefined).map(k => [k, p[k]]))));
        all[p.rosterId] = { ...snap, rosterId: p.rosterId, atk: p.atk, def: p.def, theme: theme || '', savedAt: Date.now() };
    }
    write(all);
}

/** Saved heroes, newest first, with a one-line label for the picker. */
const worldName = (t) => t === 'custom' ? 'a custom world' : String(t).split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ').replace('Post Apoc', 'Post-Apocalypse').replace('Future Utopia', 'Utopian Future');
export function listHeroes(themeName = worldName) {
    return Object.values(read()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).map(h => ({
        id: h.rosterId, name: h.name,
        label: `${h.name} · Lv ${h.level || 1} · ATK ${h.atk ?? '?'} · DEF ${h.def ?? '?'}${h.theme ? ` · from ${themeName(h.theme)}` : ''}`
    }));
}

/** Turn a freshly created player into the saved hero (keeps the new player's id). */
export function applyHero(player, rosterId) {
    const h = read()[rosterId];
    if (!player || !h) return false;
    for (const k of CARRY) if (h[k] !== undefined) player[k] = JSON.parse(JSON.stringify(h[k]));
    player.rosterId = rosterId;
    player.hp = player.maxHp; player.mp = player.maxMp; // a fresh start for a new story
    player.isDowned = false; player.statusEffects = [];
    (player.specialMoves || []).forEach(m => { if (m) m.currentCooldown = 0; });
    return true;
}
