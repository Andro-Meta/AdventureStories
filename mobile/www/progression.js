// progression.js - stats, skill checks, rewards and levels.
//
// Design (researched from games players love, see docs in the 2026-10-08
// commit): every outcome has a visible reason.
//  - Four stats, 0-5: Brave, Clever, Sneaky, Kind (Fighting Fantasy / PbtA
//    sized: few, broad, readable by a 6-year-old).
//  - Each choice is a check: d20 + stat against a difficulty, with the odds
//    shown on the button (Baldur's Gate 3, Disco Elysium). Three result bands:
//    success, success with a cost, setback (Powered by the Apocalypse), plus
//    natural 20 / natural 1 moments.
//  - Coins and HP only change for a reason: searching finds treasure, bold
//    plays win big, harm only comes from failed Risky / Bad moves and is
//    sized by how badly it went. Silly is comedy with a jackpot on 19-20.
//    (Before: every choice rolled random HP and coins whatever happened;
//    a reckless Bad choice paid as much as a Good one.)
//  - XP from every check, milestones and fights; levels at 100/250/450/700/
//    1000 total XP; each level the player picks +1 stat, and stats also grow
//    by use (Skyrim): 6 successes with a stat = +1.
// Pure functions over a hero object; callers apply UI and story.

export const STATS = {
    brave:  { icon: '💪', name: 'Brave',  does: 'fight, climb, face danger', fight: '+1 attack per point' },
    clever: { icon: '🧠', name: 'Clever', does: 'search, solve, know things', fight: '+10% power for specials and spells per point' },
    sneaky: { icon: '🥷', name: 'Sneaky', does: 'hide, trick, take shortcuts', fight: '3% dodge per point, easier escapes' },
    kind:   { icon: '💛', name: 'Kind',   does: 'help, talk, make friends', fight: '+10% healing per point' }
};
export const STAT_MAX = 5;
export const SPARKS_PER_POINT = 6;

// Choice type -> how hard it is (DC on a d20) and the stat it uses when the
// storyteller didn't say. The storyteller tags each choice with the stat the
// ACTION really uses ("Kick the guard dog" is Brave, "slip past it" Sneaky);
// the type only sets the risk. (Michael: "is kicking a guard dog sneaky?!")
export const CHECKS = {
    Good:          { stat: 'kind',   dc: 8,  label: 'Easy' },
    Investigative: { stat: 'clever', dc: 10, label: 'Fair' },
    Silly:         { stat: null,     dc: 10, label: 'Luck' },
    Bad:           { stat: 'brave',  dc: 13, label: 'Tricky' },
    Risky:         { stat: 'sneaky', dc: 14, label: 'Hard' }
};
// The five approaches every exploration set must have, exactly once each
// (Michael, phone 10-08: "two lucks, no sneaks"). 'luck' = the Silly one.
export const APPROACHES = ['brave', 'clever', 'sneaky', 'kind', 'luck'];
const TYPE_APPROACH = { Good: 'kind', Investigative: 'clever', Silly: 'luck', Bad: 'brave', Risky: 'sneaky' };
// Last resort when the storyteller can't fix a set: plain, honest actions.
export const APPROACH_FALLBACK = {
    brave: 'Step up and face it head-on.',
    clever: 'Stop and work out what is really going on here.',
    sneaky: 'Slip out of sight and move in quietly.',
    kind: 'Reach out and help someone nearby.',
    luck: 'Do something wild and hope luck is on your side.'
};

/**
 * Which choices must change so the five use five different approaches.
 * Keeps one choice per approach (the one whose type naturally fits it, else
 * the first) and returns [{ index, stat }] for the rest: each gets one of the
 * missing approaches. Empty when the set is already balanced.
 */
export function approachPlan(choices) {
    const list = choices || [];
    const stat = (c) => (APPROACHES.includes(c?.stat) ? c.stat : null);
    const keep = new Map();
    for (const s of APPROACHES) {
        const idx = list.map((c, i) => i).filter(i => stat(list[i]) === s);
        if (idx.length) keep.set(s, idx.find(i => TYPE_APPROACH[list[i].type] === s) ?? idx[0]);
    }
    const kept = new Set(keep.values());
    const free = list.map((c, i) => i).filter(i => !kept.has(i));
    const missing = APPROACHES.filter(s => !keep.has(s));
    const plan = [];
    // A free slot whose type fits a missing approach takes it first.
    for (const s of [...missing]) {
        const i = free.find(j => TYPE_APPROACH[list[j]?.type] === s);
        if (i != null) { plan.push({ index: i, stat: s }); free.splice(free.indexOf(i), 1); missing.splice(missing.indexOf(s), 1); }
    }
    missing.forEach((s, k) => { if (free[k] != null) plan.push({ index: free[k], stat: s }); });
    return plan.sort((a, b) => a.index - b.index);
}

/** Apply a plan with fixed fallback texts (sync; used at render time). */
export function fillApproaches(choices) {
    const plan = approachPlan(choices);
    if (!plan.length) return choices;
    const out = choices.map(c => ({ ...c }));
    for (const { index, stat } of plan) out[index] = { ...out[index], text: APPROACH_FALLBACK[stat], stat };
    return out;
}

const pickStat = (type, stat) => (stat === 'luck' ? null : (STATS[stat] ? stat : CHECKS[type]?.stat ?? null));

/**
 * Lucky charms: the best one carried counts (cap 3). Luck adds to luck rolls
 * (Silly, or anything tagged luck) and widens the critical range: with luck 1
 * a natural 19 is a crit too. (Fighting Fantasy's Luck, as an item.)
 */
export function luckOf(hero) {
    return Math.min(3, Math.max(0, ...(hero?.inventory || []).map(i => Number(i?.stats?.luck) || 0)));
}

/** Give older saves and new heroes their stats (all 1 to start). */
export function ensureStats(hero) {
    if (!hero) return hero;
    hero.stats = hero.stats || {};
    for (const k of Object.keys(STATS)) hero.stats[k] = clampStat(hero.stats[k] ?? 1);
    hero.sparks = hero.sparks || {};
    hero.statPoints = hero.statPoints || 0;
    hero.level = hero.level || 1;
    hero.xp = hero.xp || 0;
    return hero;
}
const clampStat = (n) => Math.max(0, Math.min(STAT_MAX, Math.round(Number(n) || 0)));
export const statOf = (hero, key) => (key ? (hero?.stats?.[key] ?? 1) : 0);

/** A "Flustered" hero (silly fumbles, a bad scare) checks at -2 until it wears off. */
const flusterPenalty = (hero) => (hero?.statusEffects || []).some(e => e?.name === 'Flustered' && e.duration > 0) ? 2 : 0;

/** Chance (0-1) to at least succeed (total >= DC) on d20 + stat. Natural 20 always wins, natural 1 always fails. */
export function chanceFor(type, hero, statOverride = undefined) {
    const c = CHECKS[type]; if (!c) return 0.5;
    const stat = pickStat(type, statOverride);
    const bonus = stat ? statOf(hero, stat) : luckOf(hero);
    const need = c.dc - bonus + flusterPenalty(hero); // roll needed on the die
    const critFrom = 20 - luckOf(hero);                // these always succeed
    return Math.max((21 - critFrom) / 20, Math.min(0.95, (21 - need) / 20));
}

/** Roll the check. rng() returns [0,1). */
export function rollCheck(type, hero, rng = Math.random, statOverride = undefined) {
    const c = CHECKS[type] || CHECKS.Investigative;
    const stat = pickStat(type, statOverride);
    const die = 1 + Math.floor(rng() * 20);
    const bonus = (stat ? statOf(hero, stat) : luckOf(hero)) - flusterPenalty(hero);
    const total = die + bonus;
    let band;
    if (die >= 20 - luckOf(hero)) band = 'crit';
    else if (die === 1) band = 'fumble';
    else if (total >= c.dc) band = 'success';
    else if (total >= c.dc - 3) band = 'partial';
    else band = 'fail';
    return { type, stat, dc: c.dc, die, bonus, total, band };
}

const levelScale = (hero) => 1 + 0.15 * ((hero?.level || 1) - 1);
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pctHp = (hero, lo, hi, rng) => Math.max(1, Math.round((hero?.maxHp || 100) * between(rng, lo, hi) / 100));

/**
 * What the roll earns or costs. Returns plain data; the caller applies it.
 * { coins, hpLoss, heal, item: {tierPool, typePool} | null, xp, fluster, jackpot, note }
 */
export function outcomeFor(roll, hero, rng = Math.random) {
    const s = levelScale(hero);
    const o = { coins: 0, hpLoss: 0, heal: 0, item: null, xp: 0, fluster: false, jackpot: false, note: '' };
    const xpWin = { Good: 10, Investigative: 15, Silly: 10, Bad: 15, Risky: 20 }[roll.type] || 10;
    const won = roll.band === 'success' || roll.band === 'crit';
    o.xp = won ? xpWin : roll.band === 'partial' ? Math.round(xpWin * 0.6) : 5; // even a setback teaches
    if (roll.band === 'crit') o.xp += 10;

    switch (roll.type) {
        case 'Good': // kindness: safe, small thanks; a failure only complicates the story
            if (won && rng() < 0.6) { if (rng() < 0.6) o.coins = Math.round(between(rng, 6, 14) * s); else o.heal = pctHp(hero, 8, 15, rng); } // thanks, a tip, a meal
            if (roll.band === 'crit') o.coins += Math.round(between(rng, 15, 30) * s);
            break;
        case 'Investigative': // searching finds treasure, gear, or a clue
            if (won) {
                const r = rng();
                if (r < 0.40) {
                    const rare = rng() < 0.10 || roll.band === 'crit';
                    o.coins = Math.round((rare ? between(rng, 80, 120) : between(rng, 15, 30)) * s);
                    o.jackpot = rare; o.note = rare ? 'a rare treasure chest' : 'a hidden stash';
                } else if (r < 0.65) o.item = { tierPool: ['Low', 'Medium'], typePool: ['Consumable', 'Weapon', 'Armor'] };
                else if (r < 0.70 && luckOf(hero) < 1) o.charm = 1; // a lucky charm
                else o.note = 'a useful clue';
            } else if (roll.band === 'partial') { o.coins = Math.round(between(rng, 3, 8) * s); o.note = 'a few loose coins'; }
            break;
        case 'Risky': // bold: big rewards, real danger
            if (won) {
                if (rng() < 0.6) o.coins = Math.round(between(rng, 20, 40) * s);
                else o.item = { tierPool: ['Medium', 'High'], typePool: ['Weapon', 'Armor', 'Consumable'] };
                if (roll.band === 'crit') o.coins += Math.round(between(rng, 25, 50) * s);
            } else if (roll.band === 'partial') { o.coins = Math.round(between(rng, 10, 20) * s); o.hpLoss = pctHp(hero, 4, 8, rng); }
            else o.hpLoss = roll.band === 'fumble' ? pctHp(hero, 16, 22, rng) : pctHp(hero, 10, 15, rng);
            break;
        case 'Bad': // reckless / mean shortcut: a quick grab, a nasty fall
            if (won) o.coins = Math.round(between(rng, 8, 16) * s); // a grab, never the best way to earn
            else if (roll.band === 'partial') { o.coins = Math.round(between(rng, 4, 8) * s); o.hpLoss = pctHp(hero, 5, 9, rng); }
            else { o.hpLoss = roll.band === 'fumble' ? pctHp(hero, 18, 24, rng) : pctHp(hero, 12, 18, rng); o.coins = -Math.round(between(rng, 5, 15) * s); o.fluster = roll.band === 'fumble'; }
            break;
        case 'Silly': // comedy: tiny stakes, the odd jackpot
            if (roll.die >= 19) { o.jackpot = true; o.coins = Math.round(between(rng, 25, 50) * s); o.note = 'an absurd stroke of luck'; }
            else if (won) { if (rng() < 0.4) o.coins = Math.round(between(rng, 3, 8) * s); }
            else if (roll.band === 'fumble') { o.fluster = true; o.note = 'a glorious pratfall'; }
            else if (roll.band === 'fail') { if (rng() < 0.5) o.coins = -between(rng, 1, 3); else o.hpLoss = between(rng, 2, 4); }
            break;
    }
    return o;
}

// ---------------------------------------------------------------- levels
/** XP needed to go from `level` to the next: 100, 150, 200, 250, 300... (totals 100/250/450/700/1000). */
export const xpForLevel = (level) => 50 + 50 * Math.max(1, level);

/**
 * Add XP to one hero; returns the levels gained. Each level: the battle.js
 * gains (HP, MP, attack) via `levelUp`, plus one stat point to spend.
 */
export function gainXp(hero, amount, levelUp) {
    ensureStats(hero);
    hero.xp += Math.max(0, Math.round(amount) || 0);
    let gained = 0;
    while (hero.xp >= xpForLevel(hero.level) && hero.level < 99) {
        hero.xp -= xpForLevel(hero.level);
        if (levelUp) levelUp(hero, 1); else hero.level += 1;
        hero.statPoints += 1;
        gained++;
    }
    return gained;
}

/** Learn by doing: a success with a stat earns a spark; enough sparks raise it. Returns the stat raised, if any. */
export function addSpark(hero, stat) {
    if (!stat) return null;
    ensureStats(hero);
    if (hero.stats[stat] >= STAT_MAX) return null;
    hero.sparks[stat] = (hero.sparks[stat] || 0) + 1;
    if (hero.sparks[stat] >= SPARKS_PER_POINT) {
        hero.sparks[stat] = 0;
        hero.stats[stat] += 1;
        return stat;
    }
    return null;
}

/** Spend a level-up point. */
export function spendStatPoint(hero, stat) {
    ensureStats(hero);
    if (!hero.statPoints || !STATS[stat] || hero.stats[stat] >= STAT_MAX) return false;
    hero.stats[stat] += 1; hero.statPoints -= 1;
    return true;
}

// ---------------------------------------------------------------- fights
export const braveAttack = (hero) => statOf(hero, 'brave');
export const sneakyDodge = (hero) => 0.03 * statOf(hero, 'sneaky');
export const cleverPower = (hero) => 1 + 0.10 * statOf(hero, 'clever');
export const kindHealing = (hero) => 1 + 0.10 * statOf(hero, 'kind');

// ---------------------------------------------------------------- money sinks
/** The inn: full HP and MP, Flustered cleared. Price grows with level. */
export const innPrice = (hero) => 10 + 5 * ((hero?.level || 1) - 1);

/** One readable line for the result toast and the storyteller. */
export function describeRoll(roll) {
    const st = roll.stat ? `${STATS[roll.stat].icon}${roll.bonus >= 0 ? '+' : ''}${roll.bonus}` : `🍀${roll.bonus >= 0 ? '+' : ''}${roll.bonus}`;
    const word = { crit: 'Critical success!', success: 'Success', partial: 'Success, at a cost', fail: 'Setback', fumble: 'Fumble!' }[roll.band];
    return `${roll.die}${roll.stat || roll.bonus ? ` ${st}` : ''} = ${roll.total} vs ${roll.dc}: ${word}`;
}
