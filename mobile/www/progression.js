// progression.js - stats, skill checks, rewards and levels.
//
// Design (researched from games players love, see docs in the 2026-10-08
// commit): every outcome has a visible reason.
//  - Four stats, 0-10 (was 0-5 until 10-09): Brave, Clever, Sneaky, Kind (Fighting Fantasy / PbtA
//    sized: few, broad, readable by a 6-year-old).
//  - Each choice is a check: d20 + stat against a difficulty, with the odds
//    shown on the button (Baldur's Gate 3, Disco Elysium). Three result bands:
//    success, success with a cost, setback (Powered by the Apocalypse), plus
//    natural 20 / natural 1 moments.
//  - Each choice has an APPROACH (the stat it uses) and a DANGER (Safe,
//    Bold, Reckless: how hard, how much it pays, whether failure hurts).
//    Coins and HP only change for a reason: danger sizes the stakes, the
//    approach flavours the reward (Clever finds stashes and gear, Kind may be
//    patched up, Luck can hit a jackpot on 19-20).
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
// Was 5: a long game (or god mode) maxed every stat and points piled up.
export const STAT_MAX = 10;
export const SPARKS_PER_POINT = 6;

// Each exploration choice has an APPROACH, the stat it uses (brave, clever,
// sneaky, kind, or luck = pure chance), and a DANGER: how hard it is and what
// is at stake. "Kick the guard dog" is Brave + Reckless, "sweet-talk it" Kind
// + Safe. (Michael 10-08: the old five types Good/Bad/Risky/Silly/
// Investigative mixed the two: "is Risky sneaky or luck?")
export const DANGERS = ['Safe', 'Bold', 'Reckless'];
export const CHECKS = {
    Safe:     { dc: 8,  label: 'Safe' },     // little harm if it fails
    Bold:     { dc: 11, label: 'Bold' },     // could get hurt
    Reckless: { dc: 14, label: 'Reckless' }  // big payoff, real harm
};
// Choices saved before the change: [danger, approach].
export const LEGACY_TYPES = { Good: ['Safe', 'kind'], Investigative: ['Safe', 'clever'], Silly: ['Bold', 'luck'], Risky: ['Bold', 'brave'], Bad: ['Reckless', 'brave'] };
// The five approaches every exploration set must have, exactly once each
// (Michael, phone 10-08: "two lucks, no sneaks").
export const APPROACHES = ['brave', 'clever', 'sneaky', 'kind', 'luck'];
// When the storyteller gave no danger, the usual one for the approach.
export const DEFAULT_DANGER = { kind: 'Safe', clever: 'Safe', sneaky: 'Bold', luck: 'Bold', brave: 'Reckless' };
// Last resort when the storyteller can't fix a set: plain, honest actions,
// one per approach and danger.
export const PLAIN_CHOICE = {
    brave:  { Safe: 'Stand your ground and keep watch.', Bold: 'Step up and face it head-on.', Reckless: 'Charge straight in, holding nothing back.' },
    clever: { Safe: 'Stop and work out what is really going on here.', Bold: 'Test your best guess about what is going on.', Reckless: 'Bet everything on a wild theory and act on it now.' },
    sneaky: { Safe: 'Stay hidden and watch from cover.', Bold: 'Slip out of sight and move in quietly.', Reckless: 'Sneak right past them, close enough to touch.' },
    kind:   { Safe: 'Reach out and help someone nearby.', Bold: 'Step in and calm things down before they get worse.', Reckless: 'Put yourself between the danger and someone who needs help.' },
    luck:   { Safe: 'Ask the nearest small creature for advice, very politely.', Bold: 'Challenge whoever is in charge to a dance-off.', Reckless: 'Disguise yourself as a piece of furniture and stroll right past.' }
};

/** A full fallback set: one plain choice per approach, at this round's dangers. */
export const fallbackChoices = (plan = DEFAULT_DANGER) => APPROACHES.map(stat => ({ type: plan[stat], stat, text: PLAIN_CHOICE[stat][plan[stat]] }));

// Every way to give the five approaches a danger each that uses all three (150).
const ALL_PLANS = (() => {
    const out = [];
    const rec = (pre) => {
        if (pre.length === APPROACHES.length) { if (DANGERS.every(d => pre.includes(d))) out.push(pre); return; }
        for (const d of DANGERS) rec([...pre, d]);
    };
    rec([]);
    return out;
})();

/**
 * This round's danger for each approach, so the pairing shuffles in a
 * meaningful way (Michael 10-08). Left to itself the storyteller fell into
 * habits (phone: Clever Safe, Kind Safe and Luck Reckless 4 of 5 rounds).
 * Hard rules, over every plan that uses all three dangers: at least 3 of the
 * 5 approaches change danger from last round, and no approach keeps the same
 * danger 3 rounds running. Then, softly: each approach leans toward the
 * dangers it had least in the last 6 rounds, 2-2-1 spreads are preferred, and
 * a random weight keeps it from settling into a loop (a strict "least recent"
 * rule cycled through just 3 plans forever). `history` = earlier plans.
 */
export function pickDangerPlan(history = [], rng = Math.random) {
    const recent = (history || []).slice(-6);
    const last = recent[recent.length - 1], prev = recent[recent.length - 2];
    let best = null, bestScore = Infinity;
    for (const p of ALL_PLANS) {
        let score = rng() * 6;
        APPROACHES.forEach((a, i) => {
            score += recent.filter(h => h?.[a] === p[i]).length;                       // balance over 6 rounds
            if (last && prev && last[a] === p[i] && prev[a] === p[i]) score += 1000;    // never 3 in a row
        });
        if (Math.max(...DANGERS.map(d => p.filter(x => x === d).length)) > 2) score += 2;
        if (last && APPROACHES.filter((a, i) => last[a] !== p[i]).length < 3) score += 1000;
        if (score < bestScore) { bestScore = score; best = p; }
    }
    return Object.fromEntries(APPROACHES.map((a, i) => [a, best[i]]));
}

/**
 * The storyteller writes each approach as a danger LADDER: three escalating
 * versions of one idea ({ Safe, Bold, Reckless }). Written side by side the
 * danger is relative, which models judge far better than an absolute label
 * (a writer told "make this Reckless" missed ~1 in 6 times on the phone).
 * Picks the version this round's plan wants; if a danger is still missing,
 * switches a choice that has it from a danger shown more than once. Ladders
 * are dropped from the result.
 */
export function pickFromLadders(choices, want = null) {
    const out = (choices || []).map(c => ({ ...c }));
    for (const c of out) {
        if (!c.ladder) continue;
        const d = (want?.[c.stat] && c.ladder[want[c.stat]]) ? want[c.stat] : (c.ladder[c.type] ? c.type : DANGERS.find(x => c.ladder[x]));
        if (d) { c.type = d; c.text = c.ladder[d]; }
    }
    for (const d of DANGERS) {
        if (out.some(c => c.type === d)) continue;
        const i = out.findIndex(c => c.ladder?.[d] && out.filter(x => x.type === c.type).length > 1);
        if (i >= 0) { out[i].type = d; out[i].text = out[i].ladder[d]; }
    }
    return out.map(({ ladder, ...c }) => c);
}

// Chance a fight starts this exploration turn, by exploration turns since
// the last one (0, 1, 2, 3, 4+). Left to itself the storyteller started few
// fights (playtest 10-09: 2-3 fight scenes in 57, the same two foes).
export const ENCOUNTER_ODDS = [0, 0.1, 0.3, 0.6, 1];

/**
 * Is a fight due this turn? An encounter called last turn that the storyteller
 * didn't start is still owed; otherwise the odds rise with every quiet turn,
 * and a fight is certain after four.
 */
export function encounterDue(turnsSinceFight = 0, owed = false, rng = Math.random) {
    return !!owed || rng() < ENCOUNTER_ODDS[Math.min(ENCOUNTER_ODDS.length - 1, Math.max(0, turnsSinceFight))];
}

/** The plan a shown set actually has ({ stat: danger }), or null if it isn't a full set. */
export function planOf(choices) {
    const plan = Object.fromEntries((choices || []).filter(c => APPROACHES.includes(c?.stat) && DANGERS.includes(c?.type)).map(c => [c.stat, c.type]));
    return Object.keys(plan).length === APPROACHES.length ? plan : null;
}

/** Any choice in the current shape { type: danger, stat, text } (old saves and loose model output converted). */
export function normalizeChoice(c) {
    if (!c || typeof c !== 'object') return c;
    const legacy = LEGACY_TYPES[c.type];
    const s = String(c.stat || '').trim().toLowerCase();
    const stat = APPROACHES.includes(s) ? s : legacy?.[1];
    const pick = (v) => DANGERS.find(d => d.toLowerCase() === String(v || '').trim().toLowerCase());
    const type = pick(c.danger) || pick(c.type) || legacy?.[0] || DEFAULT_DANGER[stat] || 'Bold';
    const { danger, stat: _junk, ...rest } = c;
    return { ...rest, type, ...(stat ? { stat } : {}) };
}

/**
 * Which choices must change so the five use five different approaches.
 * Keeps the first choice of each approach and returns [{ index, stat }] for
 * the rest: each gets one of the missing approaches. Empty when balanced.
 */
export function approachPlan(choices) {
    const list = choices || [];
    const seen = new Set(), free = [];
    list.forEach((c, i) => { if (APPROACHES.includes(c?.stat) && !seen.has(c.stat)) seen.add(c.stat); else free.push(i); });
    return APPROACHES.filter(s => !seen.has(s)).map((stat, k) => ({ index: free[k], stat })).filter(p => p.index != null);
}

/**
 * Every exploration set: five different approaches AND all three dangers
 * (at least one Safe, one Bold, one Reckless), so there is always a safe
 * option and a risky one worth the risk. Returns the choices to rewrite as
 * [{ index, stat, danger }]: the approach fixes first (they take a missing
 * danger), then, if a danger is still missing, one choice from a danger that
 * appears more than once. A text is never just relabelled. Empty = fine.
 */
const dangerOf = (c) => (DANGERS.includes(c?.type) ? c.type : DEFAULT_DANGER[c?.stat] || 'Bold');
export function mixPlan(choices, want = null) {
    const list = choices || [];
    const slots = approachPlan(list).map(p => ({ ...p, danger: want?.[p.stat] || null }));
    const isSlot = (i) => slots.some(p => p.index === i);
    const count = Object.fromEntries(DANGERS.map(d => [d, 0]));
    list.forEach((c, i) => { if (!isSlot(i)) count[dangerOf(c)]++; });
    slots.forEach(p => { if (p.danger) count[p.danger]++; });
    const missing = DANGERS.filter(d => !count[d]);
    for (const p of slots.filter(p => !p.danger)) { p.danger = missing.shift() || DEFAULT_DANGER[p.stat]; count[p.danger]++; }
    while (missing.length) {
        const d = missing.shift();
        const donor = list.findIndex((c, i) => !isSlot(i) && count[dangerOf(c)] > 1);
        if (donor === -1) break;
        count[dangerOf(list[donor])]--; count[d]++;
        slots.push({ index: donor, stat: list[donor].stat, danger: d });
    }
    return slots.sort((a, b) => a.index - b.index);
}

/** Apply mixPlan with the plain texts (sync; the render-time guarantee). */
export function fillMix(choices, want = null) {
    const plan = mixPlan(choices, want);
    const out = choices.map(c => ({ ...c, type: dangerOf(c) })); // a missing or junk danger gets the usual one
    for (const { index, stat, danger } of plan) out[index] = { ...out[index], type: danger, stat, text: PLAIN_CHOICE[stat][danger] };
    return out;
}

// 🍀 choices are absurd long shots (Michael 10-08: "sillier, more absurd, but
// super amazing results if it succeeds"): harder than the danger alone, and
// a success pays spectacularly (outcomeFor).
export const LUCK_LONG_SHOT = 3;

// The check a choice makes: its difficulty and the stat that helps (null = luck).
function checkOf(type, stat) {
    const legacy = LEGACY_TYPES[type];
    const base = CHECKS[type] || CHECKS[legacy?.[0]] || CHECKS.Bold;
    const s = stat === undefined ? legacy?.[1] : stat;
    const st = STATS[s] ? s : null;
    const c = st ? base : { ...base, dc: base.dc + LUCK_LONG_SHOT };
    return { c, danger: CHECKS[type] ? type : legacy?.[0] || 'Bold', stat: st };
}

/**
 * Lucky charms: the best one carried counts (cap 3). Luck adds to luck rolls
 * (choices tagged luck) and widens the critical range: with luck 1
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
    // Points beyond what the stats can still take can never be spent (live
    // 10-09: god mode set level 20 with every stat at 5 -> 16 stuck points).
    hero.statPoints = Math.min(hero.statPoints || 0, statRoom(hero));
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
    const { c, stat } = checkOf(type, statOverride);
    const bonus = stat ? statOf(hero, stat) : luckOf(hero);
    const need = c.dc - bonus + flusterPenalty(hero); // roll needed on the die
    const critFrom = 20 - luckOf(hero);                // these always succeed
    return Math.max((21 - critFrom) / 20, Math.min(0.95, (21 - need) / 20));
}

/** Roll the check. rng() returns [0,1). */
export function rollCheck(type, hero, rng = Math.random, statOverride = undefined) {
    const { c, danger, stat } = checkOf(type, statOverride);
    const die = 1 + Math.floor(rng() * 20);
    const bonus = (stat ? statOf(hero, stat) : luckOf(hero)) - flusterPenalty(hero);
    const total = die + bonus;
    let band;
    if (die >= 20 - luckOf(hero)) band = 'crit';
    else if (die === 1) band = 'fumble';
    else if (total >= c.dc) band = 'success';
    else if (total >= c.dc - 3) band = 'partial';
    else band = 'fail';
    return { type: danger, stat, dc: c.dc, die, bonus, total, band };
}

const levelScale = (hero) => 1 + 0.15 * ((hero?.level || 1) - 1);
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pctHp = (hero, lo, hi, rng) => Math.max(1, Math.round((hero?.maxHp || 100) * between(rng, lo, hi) / 100));

// What each danger puts at stake: XP, coin ranges, gear tier, harm (% of max HP).
const STAKES = {
    Safe:     { xp: 10, coins: [5, 10],  crit: [10, 20],  rare: 0.04, items: ['Low', 'Medium'],  partial: null,    fail: null,     fumble: null },
    Bold:     { xp: 15, coins: [15, 30], crit: [25, 50],  rare: 0.10, items: ['Low', 'Medium'],  partial: [4, 8],  fail: [10, 15], fumble: [14, 20] },
    Reckless: { xp: 22, coins: [40, 70], crit: [60, 100], rare: 0.20, items: ['Medium', 'High'], partial: [6, 10], fail: [14, 20], fumble: [18, 24] }
};

/**
 * What the roll earns or costs. Returns plain data; the caller applies it.
 * { coins, hpLoss, heal, item: {tierPool, typePool} | null, xp, fluster, jackpot, note, charm }
 * Danger sizes the stakes; the approach flavours the reward.
 */
export function outcomeFor(roll, hero, rng = Math.random) {
    const s = levelScale(hero);
    const k = STAKES[roll.type] || STAKES[LEGACY_TYPES[roll.type]?.[0]] || STAKES.Bold;
    const o = { coins: 0, hpLoss: 0, heal: 0, item: null, xp: 0, fluster: false, jackpot: false, note: '' };
    const won = roll.band === 'success' || roll.band === 'crit';
    const coins = ([lo, hi]) => Math.round(between(rng, lo, hi) * s);
    const approach = roll.stat || 'luck';
    o.xp = won ? k.xp : roll.band === 'partial' ? Math.round(k.xp * 0.6) : 5; // even a setback teaches
    if (roll.band === 'crit') o.xp += 10;

    if (won) {
        if (approach === 'luck') { // the absurd long shot came off: spectacular
            o.note = 'an absurd plan that worked spectacularly';
            const r = rng();
            if (r < 0.5) { o.jackpot = true; o.coins = coins(k.crit); }
            else if (r < 0.8) o.item = { tierPool: roll.type === 'Safe' ? ['Medium'] : ['High'], typePool: ['Weapon', 'Armor', 'Consumable'] };
            else if (roll.type !== 'Safe' && luckOf(hero) < 3) o.charm = luckOf(hero) + 1; // a better lucky charm (not for a safe silly move)
            else { o.jackpot = true; o.coins = coins(k.crit); }
            if (roll.band === 'crit') { o.jackpot = true; o.coins += coins(k.crit) * 2; o.note = 'a ridiculous stroke of luck nobody will ever believe'; }
        } else if (approach === 'clever') { // figuring it out: a stash, gear, a charm, or a clue
            const r = rng();
            if (r < 0.40) {
                const rare = rng() < k.rare || roll.band === 'crit';
                o.coins = rare ? coins([80, 120]) : coins(k.coins);
                o.jackpot = rare; o.note = rare ? 'a rare treasure chest' : 'a hidden stash';
            } else if (r < 0.65) o.item = { tierPool: k.items, typePool: ['Consumable', 'Weapon', 'Armor'] };
            else if (r < 0.70 && luckOf(hero) < 1) o.charm = 1; // a lucky charm
            else o.note = 'a useful clue';
        } else if (roll.type !== 'Safe' || rng() < 0.6) { // a Safe win pays something 60% of the time
            if (approach === 'kind' && rng() < 0.5) o.heal = pctHp(hero, 8, 15, rng); // someone grateful patches them up
            else if (approach !== 'kind' && roll.type !== 'Safe' && rng() < 0.4) o.item = { tierPool: k.items, typePool: ['Weapon', 'Armor', 'Consumable'] };
            else o.coins = coins(k.coins);
        }
        if (roll.band === 'crit' && approach !== 'luck' && !o.jackpot) o.coins += coins(k.crit);
    } else if (roll.band === 'partial') { // it works, at a cost
        o.coins = coins([Math.ceil(k.coins[0] / 3), Math.ceil(k.coins[0] / 2)]);
        if (k.partial) o.hpLoss = pctHp(hero, k.partial[0], k.partial[1], rng);
    } else { // setback or fumble: only Bold and Reckless hurt
        const harm = roll.band === 'fumble' ? k.fumble : k.fail;
        if (harm) o.hpLoss = pctHp(hero, harm[0], harm[1], rng);
        if (roll.band === 'fumble') {
            o.fluster = true;
            if (roll.type === 'Reckless') o.coins = -coins([5, 15]); // dropped something in the scramble
            if (approach === 'luck') o.note = 'a glorious pratfall';
        }
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
        if (hero.statPoints < statRoom(hero)) hero.statPoints += 1;
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

/** The type an item with no known type should have: Consumable if it describes an effect, else Misc. */
export function usableType(item) {
    const known = ['Weapon', 'Armor', 'Consumable', 'Revival', 'Quest', 'Misc'];
    if (known.includes(item?.type)) return item.type;
    return String(item?.effect || '').trim() ? 'Consumable' : 'Misc';
}

/** How many more points the stats can take (each stat stops at STAT_MAX). */
export function statRoom(hero) {
    return Object.keys(STATS).reduce((n, k) => n + Math.max(0, STAT_MAX - (hero?.stats?.[k] ?? 1)), 0);
}

/** "Later" on the level-up picker: don't ask again until another point is earned. */
export function snoozeStatPrompt(hero) { hero.statPromptSnooze = hero.statPoints || 0; }

/** Spend a level-up point. */
export function spendStatPoint(hero, stat) {
    ensureStats(hero);
    if (!hero.statPoints || !STATS[stat] || hero.stats[stat] >= STAT_MAX) return false;
    hero.stats[stat] += 1; hero.statPoints -= 1;
    if (hero.statPromptSnooze > hero.statPoints) hero.statPromptSnooze = hero.statPoints; // so the next new point asks again
    return true;
}

// ---------------------------------------------------------------- fights
export const braveAttack = (hero) => statOf(hero, 'brave');
export const sneakyDodge = (hero) => Math.min(0.25, 0.03 * statOf(hero, 'sneaky')); // capped: Sneaky 10 would dodge 30%
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
