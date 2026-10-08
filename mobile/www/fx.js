// fx.js - hit / heal feedback. Called by ui.js after cards render: compares
// each character's HP with the last value it saw, so every HP change shows
// (combat, potions, poison ticks, narrator events) without hooks in each system.
//   hero hurt  : screen shake + red edge flash + short buzz + floating -N
//   hero healed: green glow on the card + floating +N
//   foe hurt   : card jolt + red flash + floating -N (bigger on big hits)
// Respects prefers-reduced-motion (flash and numbers only, no shake).

const lastHp = new Map();
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Forget remembered HP (new game / loaded game), so nothing fires on the first render. */
export function resetFx() { lastHp.clear(); }

/** Compare HP of every rendered character card with last time and play effects. */
export function playHpEffects(characters) {
    try { play(characters); } catch (_) { /* effects must never break a turn */ }
}

function play(characters) {
    for (const c of characters || []) {
        if (!c?.id || typeof c.hp !== 'number') continue;
        const prev = lastHp.get(c.id);
        lastHp.set(c.id, c.hp);
        if (prev === undefined || prev === c.hp) continue;
        const card = [...document.querySelectorAll('[data-character-id]')].find(el => el.dataset.characterId === String(c.id));
        const diff = c.hp - prev;
        const isPlayer = String(c.id).startsWith('player');
        if (card) floatNumber(card, diff);
        if (diff < 0 && isPlayer) heroHurt(card, -diff, c.maxHp || 100);
        else if (diff > 0) healed(card);
        else if (diff < 0) foeHurt(card, -diff, c.maxHp || 30);
    }
}

function restart(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 900);
}

function heroHurt(card, amount, maxHp) {
    const heavy = amount >= maxHp * 0.15;
    // Shake the game screen, not .container: a transform there moved the
    // fixed overlays and modals inside it.
    if (!reduceMotion()) restart(document.getElementById('gameScreen'), heavy ? 'fx-shake-heavy' : 'fx-shake');
    let edge = document.getElementById('fxDamageEdge');
    if (!edge) { edge = document.createElement('div'); edge.id = 'fxDamageEdge'; document.body.appendChild(edge); }
    restart(edge, 'fx-on');
    restart(card, 'fx-hurt');
    try { navigator.vibrate?.(heavy ? [40, 30, 60] : 35); } catch (_) {}
}

function healed(card) { restart(card, 'fx-heal'); }

function foeHurt(card, amount, maxHp) {
    restart(card, amount >= maxHp * 0.3 ? 'fx-foe-crit' : 'fx-foe-hit');
}

function floatNumber(card, diff) {
    const n = document.createElement('span');
    n.className = `fx-float ${diff < 0 ? 'fx-float-dmg' : 'fx-float-heal'}`;
    n.textContent = diff < 0 ? `−${-diff}` : `+${diff}`;
    card.style.position = card.style.position || 'relative';
    card.appendChild(n);
    setTimeout(() => n.remove(), 1200);
}
