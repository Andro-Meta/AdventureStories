// reflection.js - "the story noticed you": at the end of the quest, what a
// hero's choices say about them (Michael 10-10: reveal things the player might
// not know about themselves, never called a psych evaluation).
// All inference is here, in code, from the choice records; the storyteller
// only puts it into words (and code-written lines stand in if it fails or
// strays). Research 10-10: point at evidence, never hand down a label;
// strengths and growth only; no clinical words; delivered by a character.
import { gameState } from './state.js';

const APPROACH = {
    brave: { title: ['The Storm-Walker', 'The Shield'], line: (n, m) => `You went first into danger ${n} times${m}.` },
    clever: { title: ['The Lantern-Bearer', 'The Puzzle-Breaker'], line: (n, m) => `You looked for the clever way through ${n} times${m}.` },
    sneaky: { title: ['The Quiet Shadow', 'The Long Way Round'], line: (n, m) => `You found the hidden path ${n} times${m}.` },
    kind: { title: ['The Open Hand', 'The Heart of the Company'], line: (n, m) => `You chose kindness ${n} times${m}.` },
    luck: { title: ["Fortune's Darling", 'The Wild Card'], line: (n, m) => `You trusted luck ${n} times when the odds said no${m}.` }
};
const WORD = { brave: 'courage', clever: 'wits', sneaky: 'stealth', kind: 'kindness', luck: 'luck' };
// Words the reflection must never use (research: no diagnosis, no "test").
export const BANNED = /\b(psych\w*|profile|personality|diagnos\w*|disorder|anxi\w*|depress\w*|narciss\w*|trauma\w*|therap\w*|patholog\w*|test results?|evaluation|assessment|unstable|insecure)\b/i;

const quote = (t) => ` (like when you chose to "${String(t || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '').slice(0, 90).replace(/^./, c => c.toLowerCase())}")`;

/** The records for one hero: [{turn, type, stat, band, text}], oldest first. */
function recordsOf(hero, gs) {
    const cp = gs.choicePatterns;
    const list = (cp instanceof Map ? cp.get(hero.id) : cp?.[hero.id]) || [];
    // Older records carried the whole roll ({outcome:{roll}}): read them the same way.
    return list.filter(c => c && c.type !== 'God Mode')
        .map(c => c.outcome === undefined ? c : { ...c, stat: c.outcome?.roll ? (c.outcome.roll.stat || 'luck') : null, band: c.outcome?.roll?.band || null });
}

/**
 * What stands out about each hero: up to three signals with the moment behind
 * each, a title, and code-written fallback lines.
 * @returns {[{hero, title, signals:[{key, strength, text, moment}], lines:string[]}]}
 */
export function readHeroes(gs = gameState) {
    const out = [];
    for (const hero of gs.players || []) {
        const recs = recordsOf(hero, gs);
        const story = recs.filter(c => ['Safe', 'Bold', 'Reckless'].includes(c.type));
        if (story.length < 3) continue; // too little to say anything true
        const approachOf = (c) => c.stat || 'luck';
        const count = (pred, list = story) => list.filter(pred).length;
        const by = Object.fromEntries(Object.keys(APPROACH).map(k => [k, count(c => approachOf(c) === k)]));
        const ranked = Object.entries(by).sort((a, b) => b[1] - a[1]);
        const [top, topN] = ranked[0];
        const share = topN / story.length;
        const reckless = count(c => c.type === 'Reckless'), safe = count(c => c.type === 'Safe');
        // The moment behind a signal: a critical success, else a success, else any; never the same moment twice.
        const used = new Set();
        const best = (pred) => {
            const pool = [...story].reverse().filter(c => pred(c) && !used.has(c.text));
            const m = pool.find(c => c.band === 'crit') || pool.find(c => c.band === 'success') || pool[0];
            if (m) used.add(m.text);
            return m;
        };
        const signals = [];
        // 1. The approach they lean on (only if it really stands out from an even 20%).
        if (share >= 0.3) signals.push({ key: top, strength: share, text: APPROACH[top].line(topN, quote(best(c => approachOf(c) === top)?.text)) });
        // 2. Risk: how often they chose the reckless road, or kept others safe.
        if (reckless / story.length >= 0.35) {
            const wins = count(c => c.type === 'Reckless' && ['crit', 'success'].includes(c.band));
            signals.push({ key: 'risk', strength: reckless / story.length, text: `When the road split, you took the dangerous one ${reckless} times, and won ${wins} of them${quote(best(c => c.type === 'Reckless')?.text)}.` });
        } else if (safe / story.length >= 0.5) {
            signals.push({ key: 'care', strength: safe / story.length, text: `You weighed every step: ${safe} times you chose the careful way, and it kept the story alive${quote(best(c => c.type === 'Safe')?.text)}.` });
        }
        // 3. A turning point: they leaned one way early and another way late.
        const half = Math.floor(story.length / 2);
        const lean = (list) => Object.keys(APPROACH).map(k => [k, count(c => approachOf(c) === k, list)]).sort((a, b) => b[1] - a[1])[0][0];
        if (story.length >= 8) {
            const early = lean(story.slice(0, half)), late = lean(story.slice(half));
            if (early !== late) signals.push({ key: 'turn', strength: 0.5, text: `You began the journey with ${WORD[early]}, and somewhere along the way you learned to lead with ${WORD[late]}.` });
        }
        // 4. Grit: failures that didn't change the next choice.
        const falls = count(c => ['fail', 'fumble'].includes(c.band));
        if (falls >= 3) signals.push({ key: 'grit', strength: 0.4 + falls / 40, text: `You fell ${falls} times and got straight back up; not one setback changed who you were in the next choice.` });
        // 5. The fight: never ran, or held the line.
        const fights = recs.filter(c => ['Attack', 'Special', 'Spell', 'Item', 'Run', 'Defend'].includes(c.type));
        const ran = count(c => c.type === 'Run', fights), guarded = count(c => c.type === 'Defend', fights);
        if (fights.length >= 6 && !ran) signals.push({ key: 'stood', strength: 0.45, text: `In ${fights.length} moves of battle you never once ran.` });
        else if (guarded >= 3) signals.push({ key: 'guard', strength: 0.4, text: `You raised your guard ${guarded} times; you knew that surviving is how you win.` });
        // 6. The people: friends kept beside them.
        const friends = Object.entries(gs.entityMemory?.npcs || {}).filter(([, p]) => (p.bond || 0) >= 2 && p.status !== 'dead').map(([n]) => n);
        if (friends.length >= 2) signals.push({ key: 'friends', strength: 0.45, text: `People chose to stand with you: ${friends.slice(0, 3).join(', ')}. That is not luck.` });
        const picked = signals.sort((a, b) => b.strength - a.strength).slice(0, 3);
        const title = APPROACH[top].title[reckless >= safe ? 0 : 1];
        out.push({ hero: hero.name, title, signals: picked, lines: picked.map(s => s.text) });
    }
    return out;
}

/** The storyteller's words for one hero, or the code's own lines if it said nothing usable or strayed. */
export function cleanReflection(fromAI, read) {
    const lines = (Array.isArray(fromAI?.lines) ? fromAI.lines : []).map(l => String(l || '').trim()).filter(Boolean).slice(0, 3);
    const ok = lines.length >= Math.min(2, read.lines.length) && !lines.some(l => BANNED.test(l)) && !BANNED.test(String(fromAI?.closing || ''));
    return { hero: read.hero, title: read.title, speaker: ok ? String(fromAI?.speaker || '').slice(0, 60) : '', lines: ok ? lines : read.lines, closing: ok ? String(fromAI?.closing || '').slice(0, 200) : '' };
}

/** On by default; a parent can turn it off (Menu > Sound & Voice). */
export function reflectionOn() {
    try { return localStorage.getItem('adv.reflection') !== '0'; } catch (_) { return true; }
}
