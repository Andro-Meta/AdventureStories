// questDefinitions.js - the main quest's story spine.
//
// The game owns the structure, the storyteller writes the scenes (research
// 10-10: Facade's drama manager, Hidden Door, beat sheets). The quest is a
// fixed ladder of story beats; each turn the storyteller is told only the ONE
// beat that comes next, and the engine refuses beats out of order, too close
// together, and any boss fight before the heroes have travelled to the
// villain's stronghold (Michael: "we always stumble upon the boss").

// Rounds between two beats: the story gets room to breathe (about 40-75
// rounds to the boss), and a stall nudge pushes the next beat after 5 idle rounds.
export const BEAT_GAP = 3;

// In order. `beat` is what the storyteller is asked for (VILLAIN and LAIR are
// filled in once known); `says` is the next step shown to players.
export const BEATS = [
    { name: 'call_to_adventure', act: 1, says: 'Find out what is wrong', beat: 'the inciting incident: something breaks the heroes\' ordinary world' },
    { name: 'world_introduced', act: 1, says: 'Meet the people and places involved', beat: 'bring one or two named people and a named place into the story' },
    { name: 'villain_glimpsed', act: 1, says: 'Notice the shadow behind it all', beat: 'a sign of the hidden enemy\'s reach (a servant, a mark, a rumour); not the enemy in person, no name yet' },
    { name: 'stakes_clear', act: 1, says: 'Learn what you must do', beat: 'make clear what the heroes must do, and what happens if they fail' },
    { name: 'ally_found', act: 2, says: 'Find someone to help you', beat: 'someone joins the heroes or commits to help' },
    { name: 'first_obstacle_overcome', act: 2, says: 'Get past the first big obstacle', beat: 'the heroes win a meaningful trial (a fight, a puzzle or a hard conversation)' },
    { name: 'midpoint_twist', act: 2, says: 'Survive a twist', beat: 'a reversal: a betrayal, a loss or a truth that changes the shape of the quest' },
    { name: 'antagonist_revealed', act: 2, says: 'Discover who is behind it all', beat: 'the enemy appears in person with a name native to the theme, shows their power, and gets away (no fight with them yet). The milestone carries {"villain":"<Name>","lair":"<the stronghold they rule from>"}' },
    { name: 'all_is_lost', act: 2, says: 'Face the darkest hour', beat: 'the darkest moment: the heroes lose something or someone that matters' },
    { name: 'path_to_lair', act: 2, says: 'Find the way to the enemy', beat: 'the heroes learn how to reach VILLAIN at LAIR, and a weakness they can use' },
    { name: 'journey_to_lair', act: 3, says: 'Journey to the stronghold', beat: 'the road to LAIR: VILLAIN\'s power shows in the land, and old threads come back' },
    { name: 'lair_reached', act: 3, says: 'Reach the stronghold', beat: 'arrive at LAIR; a guardian blocks the way (an ordinary foe, not VILLAIN)' },
    { name: 'final_confrontation', act: 3, says: 'Face the final challenge', beat: 'face VILLAIN in LAIR: in the same turn add them with /enemies/- ("isBoss": true) and replace /inCombat true' },
    { name: 'final_blow', act: 3, says: 'Win the final showdown', beat: 'win the fight; the game records the win when the boss falls' }
];
const BEAT_INDEX = Object.fromEntries(BEATS.map((b, i) => [b.name, i]));
export const isMainBeat = (name) => name in BEAT_INDEX;

export const MAIN_QUEST_ARC = [
    { id: 'act1', name: 'Act 1 — Call to Adventure' },
    { id: 'act2', name: 'Act 2 — The Trial' },
    { id: 'act3', name: 'Act 3 — The Journey and the Reckoning' }
].map((a, i) => ({ ...a, targetMilestones: BEATS.filter(b => b.act === i + 1).map(b => b.name) }));

const doneNames = (gs) => new Set((gs.questProgress?.milestones || []).map(m => String(m.name || '').toLowerCase()));

/** The next beat: the one after the furthest beat reached (an older save that skipped beats doesn't go back). */
export function nextBeat(gs) {
    const done = doneNames(gs);
    let last = -1;
    BEATS.forEach((b, i) => { if (done.has(b.name)) last = i; });
    return BEATS[last + 1] || null;
}

/** Rounds since the last main-quest beat (or since the quest began). */
export function roundsSinceBeat(gs) {
    const ms = (gs.questProgress?.milestones || []).filter(m => isMainBeat(String(m.name || '').toLowerCase()));
    const last = ms.length ? Math.max(...ms.map(m => m.turn || 0)) : (gs.questProgress?.questStartTurn || 0);
    return (gs.turn || 1) - last;
}

const openThreads = (gs) => (gs.storyThreads || []).filter(t => t && !t.resolved);

/**
 * May this beat land now? Null if yes, else why not (the engine's refusal and
 * the prompt's "build toward it" line use the same rule).
 */
export function beatBlocked(gs, name) {
    const next = nextBeat(gs);
    if (!next || name !== next.name) return `the next story beat is "${next?.name || 'none'}"`;
    if (name === 'final_blow') return null; // the kill decides it
    const wait = BEAT_GAP - roundsSinceBeat(gs);
    if (name !== 'call_to_adventure' && wait > 0) return `too soon: ${wait} more round${wait > 1 ? 's' : ''} before the next beat`;
    if (name === 'final_confrontation' && openThreads(gs).length > 1) return `pay off open threads first (${openThreads(gs).length} open)`;
    return null;
}

/** The boss may only be fought at the final confrontation (or after it). */
export function climaxOpen(gs) {
    if (gs.isGoalComplete || gs.divineTurn) return true;
    const done = doneNames(gs);
    return done.has('final_confrontation') || !beatBlocked(gs, 'final_confrontation');
}

/** The act the story is in (by beats reached; no turn-count jumps), or null once the quest is won. */
export function determineCurrentAct(gameState) {
    if (gameState.isGoalComplete) return null;
    return MAIN_QUEST_ARC[(nextBeat(gameState)?.act || 3) - 1];
}

/**
 * Phase 2: Active jail-escape mini-quest. When the party is imprisoned,
 * this overrides the main quest stage hint.
 */
function buildJailEscapeHint() {
    try {
        if (typeof window !== 'undefined' && window.__jailSystem?.buildJailSystemPromptAddon) {
            return window.__jailSystem.buildJailSystemPromptAddon();
        }
    } catch (_) { /* fall through */ }
    return `\n\n=== JAIL ESCAPE (active) ===
The party is imprisoned. They cannot leave the jail until they: (1) assess the situation, (2) find a weakness, and (3) execute the escape. Equipment was confiscated. Push them toward each objective and emit milestones jail_assessed → jail_weakness_found → jail_escaped as they progress.`;
}

// What players see: the plain-words step per milestone.
const FRIENDLY = Object.fromEntries([...BEATS.map(b => [b.name, b.says]), ['aftermath', 'See how the world has changed']]);
export const friendlyMilestone = (name) => FRIENDLY[name] || String(name || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** {chapter, next} for the header, or null when the main quest is over. */
export function describeQuestStep(gameState) {
    if (gameState.imprisoned) return { chapter: 'Captured!', next: 'Escape from captivity' };
    const act = determineCurrentAct(gameState);
    if (!act) return null;
    const next = nextBeat(gameState);
    return { chapter: act.name.replace(' — ', ': '), next: next ? next.says : 'Keep going: the next chapter is close' };
}

/**
 * The quest's part of the system prompt: one beat at a time (it used to send
 * the whole act's instructions, ~1,400-2,000 characters, every turn).
 */
export function buildQuestStageHint(gameState) {
    if (gameState.imprisoned) return buildJailEscapeHint();
    if (gameState.isGoalComplete) {
        return `\n\n=== GOD MODE ===
The main quest is won and the player has authorial power: each input is a declaration about the world. Honour it and persist every tangible change with ops (items, skills, places, people, foes, stats), or it vanishes next turn.
Only refuse what breaks the age-tier content policy, and then in-character (the world resists), with no ops for it. Do not add main-quest milestones or touch /isGoalComplete.`;
    }
    const act = determineCurrentAct(gameState);
    const qp = gameState.questProgress || {};
    const next = nextBeat(gameState);
    if (!act || !next) return '';
    const fill = (s) => s.replace(/VILLAIN/g, qp.villain || 'the enemy').replace(/LAIR/g, qp.lair || 'their stronghold');
    const lines = [`\n\nMAIN QUEST — ${act.name}${qp.villain ? ` · VILLAIN: ${qp.villain}${qp.lair ? ` (rules from ${qp.lair})` : ''}; until the final confrontation they are never fought: if met, they escape` : ''}`];
    const bossUp = (gameState.enemies || []).some(e => e.isBoss && !e.isDefeated && e.hp > 0);
    const confronted = doneNames(gameState).has('final_confrontation');
    if (bossUp) {
        // the fight decides it
    } else if (confronted && !qp.bossDefeated) {
        lines.push(`THIS TURN: ${qp.villain || 'the villain'} fights: add them with /enemies/- ("isBoss": true) and replace /inCombat true.`);
    } else {
        const why = beatBlocked(gameState, next.name);
        const threads = openThreads(gameState);
        if (!why) lines.push(`STORY BEAT NOW: ${fill(next.beat)}. When it happens, add milestone "${next.name}" with /questProgress/milestones/-.`);
        else if (/pay off/.test(why)) lines.push(`BEFORE THE FINAL CONFRONTATION: pay off ${threads.map(t => `"${t.text}"`).slice(0, 2).join(' and ')} (mark each resolved).`);
        else lines.push(`BUILD TOWARD: ${fill(next.beat)} (it lands in a later round; no milestone this turn).`);
        if (threads.length && act.id !== 'act1' && !/pay off/.test(why || '')) lines.push(`PAY OFF SOON: "${threads[0].text}"`);
        const idle = roundsSinceBeat(gameState);
        if (!why && idle >= BEAT_GAP + 2) lines.push(`STALLED for ${idle} rounds: make this beat happen now.`);
    }
    // Fights were rare (live: 14 turns, no fight, with a goblin chieftain on stage).
    const sinceFight = (gameState.turn || 0) - (gameState.lastCombatTurn || 0);
    if (act.id !== 'act1' && !gameState.inCombat && sinceFight >= 5) lines.push(`ACTION: no fight for ${sinceFight} rounds; unless resting somewhere safe, start one (a foe native to the story, never ${qp.villain || 'the villain'}).`);
    return lines.join('\n');
}
