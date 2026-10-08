// questDefinitions.js
// Phase 3 main-quest scaffolding.
//
// Without an actual main quest the player can complete, "god mode unlocked
// when the main quest finishes" is meaningless because the main quest never
// finishes. This file defines a generic 3-act structure that any theme can
// wear. The narrator gets hints about which act we're in via the system
// prompt, and the diff engine advances the quest by adding milestones and
// eventually flipping /isGoalComplete to true.
//
// We deliberately keep the quest theme-agnostic. The narrator fills in the
// specifics (an artifact, a villain, a place) based on the campaign theme.
// The owner can replace this scaffold with hand-authored quests later.

/**
 * Generic three-act arc.
 *
 * Act 1: Call to adventure. Player meets the world, learns the stakes,
 *         discovers what's wrong. Ends when narrator emits the "stakes_clear"
 *         milestone.
 * Act 2: The trial. Player overcomes obstacles, gathers allies/items,
 *         encounters the antagonist or the antagonist's reach. Ends with
 *         "antagonist_revealed" + "trial_passed" milestones.
 * Act 3: The reckoning. Climactic confrontation, resolution, transformation.
 *         Ends when narrator emits "final_blow" milestone and replaces
 *         /isGoalComplete to true.
 */
export const MAIN_QUEST_ARC = [
    {
        id: 'act1',
        name: 'Act 1 — Call to Adventure',
        targetMilestones: ['call_to_adventure', 'world_introduced', 'stakes_clear'],
        targetTurnRange: [1, 12],
        narratorHint:
`This is Act 1 of the main quest. You are establishing the world and the threat.
- STORY CIRCLE 1-2 (You, Need): first show the heroes in their ordinary world, then hit them with a want or problem that breaks it.
- Introduce 1-2 named NPCs and at least one named location.
- Plant the inciting incident: something is wrong, the player is the only one who can fix it.
- By turn 4-6, you MUST set /adventureGoal to a clear sentence ("Restore the X before the Y").
- Use these EXACT milestone names verbatim, in order, as you reach each beat:
   1. "call_to_adventure"   — emit on the turn the inciting incident lands.
   2. "world_introduced"    — emit once 1-2 NPCs and a named location are on stage.
   3. "stakes_clear"        — emit when the player understands what they must do. THIS IS REQUIRED to advance to Act 2.
- PACING: emit AT MOST ONE milestone per turn. Turn 1 should establish setting only — usually no milestone, or just call_to_adventure if the player's first action triggers the inciting beat. Don't fire all three Act 1 milestones in the opening scene; that ruins the slow burn.
- Use snake_case milestone names exactly as listed; never paraphrase ("The Stakes Become Clear" is WRONG, use "stakes_clear").`
    },
    {
        id: 'act2',
        name: 'Act 2 — The Trial',
        targetMilestones: ['ally_found', 'first_obstacle_overcome', 'antagonist_revealed'],
        targetTurnRange: [13, 30],
        narratorHint:
`This is Act 2 of the main quest. The player is in the middle of the journey.
- STORY CIRCLE 3-5 (Go, Search, Find): push them into unfamiliar places, let them try and fail and adapt, then let them find what they sought, but not the way they expected.
- Introduce the antagonist (NPC) or their reach (location/item).
- Give the player tangible progress: an ally NPC, a key item, a partial victory.
- Include at least one combat encounter (spawn an enemy via /enemies/-, set /inCombat: true).
- Use these EXACT milestone names verbatim, in order:
   1. "ally_found"              — when an ally NPC joins or commits to help.
   2. "first_obstacle_overcome" — when the player wins a meaningful trial (combat, puzzle, social).
   3. "antagonist_revealed"     — when the antagonist's identity is shown. THIS IS REQUIRED to advance to Act 3.
      The villain must have a NAME native to the theme, and the milestone value must carry it:
      {"name":"antagonist_revealed","description":"...","villain":"<Villain Name>"}. That villain is the final boss.
- PACING: emit AT MOST ONE milestone per turn. Space these milestones across multiple turns.
- Use snake_case milestone names exactly as listed; never paraphrase.`
    },
    {
        id: 'act3',
        name: 'Act 3 — The Reckoning',
        targetMilestones: ['final_confrontation', 'final_blow'],
        targetTurnRange: [31, 50],
        narratorHint:
`- The main villain is a BOSS: when the final fight starts, add it with /enemies/- including "isBoss": true.
  If a MAIN VILLAIN is named below, the boss IS that villain: use that exact name.
This is Act 3 of the main quest. The player is at the climax.
- STORY CIRCLE 6-8 (Take, Return, Change): before the victory the heroes pay a real price (a loss, a broken treasure, a hard choice, an ally hurt). Then they win, and the closing beats show how they have changed.
- Pay off every OPEN THREAD before the final_blow: each setup gets its moment.
- The climax is a FIGHT with the main villain (the boss). The quest is won only by defeating the boss in battle; the game records the win when the boss falls.
- Use these EXACT milestone names verbatim, in order:
   1. "final_confrontation" — when the player faces the antagonist directly; in the same turn add the villain with /enemies/- ("isBoss": true) and replace /inCombat true.
   2. "final_blow"          — only after the boss has been defeated in the fight (the game adds it itself on the kill).
- PACING: emit AT MOST ONE milestone per turn. The climactic act deserves multiple beats.
- Winning UNLOCKS GOD MODE — the player gains the power
  to type any free-form action and have the world respond. Foreshadow this with awe in the
  closing prose ("the world bends to your will now").
- Use snake_case milestone names exactly as listed; never paraphrase.`
    }
];

/**
 * Determines which act the campaign is currently in based on milestones
 * achieved and turn count. Returns the matching MAIN_QUEST_ARC entry.
 *
 * @param {object} gameState
 * @returns {object} the active act definition
 */
export function determineCurrentAct(gameState) {
    const milestoneNames = (gameState.questProgress?.milestones || [])
        .map(m => (m.name || '').toLowerCase());
    const turn = (gameState.turn || 1) - (gameState.questProgress?.questStartTurn || 0);

    // If goal complete, the main quest is over — return null so the system
    // prompt can shift to god-mode framing instead of advancing the quest.
    if (gameState.isGoalComplete) return null;

    // Heuristic: act advances when the milestone signaling its end has been
    // emitted, OR turn count exceeds the act's range.
    const act1Done = milestoneNames.some(m => m.includes('stakes clear') || m.includes('stakes_clear'))
                  || turn > MAIN_QUEST_ARC[0].targetTurnRange[1];
    const act2Done = milestoneNames.some(m => m.includes('antagonist revealed') || m.includes('antagonist_revealed'))
                  || turn > MAIN_QUEST_ARC[1].targetTurnRange[1];

    if (act2Done) return MAIN_QUEST_ARC[2];
    if (act1Done) return MAIN_QUEST_ARC[1];
    return MAIN_QUEST_ARC[0];
}

/**
 * Phase 2: Active jail-escape mini-quest. When the party is imprisoned,
 * this overrides the main quest stage hint — the player must complete the
 * escape before the main quest resumes. The jailSystem module owns the
 * full prompt addon; this is a thin pointer so questDefinitions stays the
 * single dispatch for "what should the narrator focus on right now?".
 */
function buildJailEscapeHint() {
    // Lazily fetch the jail system prompt so we don't create a circular
    // import at module load (jailSystem imports state, this file is
    // imported by aiHandler which also imports jailSystem).
    try {
        // Use a synchronous module reference — the jailSystem module is
        // already loaded by the time the AI prompt is built.
        if (typeof window !== 'undefined' && window.__jailSystem?.buildJailSystemPromptAddon) {
            return window.__jailSystem.buildJailSystemPromptAddon();
        }
    } catch (_) { /* fall through */ }
    // Fallback minimal hint if jail module hasn't registered itself yet.
    return `\n\n=== JAIL ESCAPE (active) ===
The party is imprisoned. They cannot leave the jail until they: (1) assess the situation, (2) find a weakness, and (3) execute the escape. Equipment was confiscated. Push them toward each objective and emit milestones jail_assessed → jail_weakness_found → jail_escaped as they progress.`;
}

/**
 * Build the quest-stage hint block to inject into the system prompt.
 * @param {object} gameState
 * @returns {string}
 */
/**
 * Act 3 had no turn-based fallback: if the narrator never staged the climax,
 * the game never ended. Escalate after 6 rounds in Act 3, then insist.
 */
function act3Deadline(gameState, act) {
    if (act?.id !== 'act3') return '';
    const qp = gameState.questProgress || (gameState.questProgress = {});
    if (!qp.act3StartTurn) qp.act3StartTurn = gameState.turn || 1; // cleared when a new quest starts
    const rounds = (gameState.turn || 1) - qp.act3StartTurn;
    const names = (qp.milestones || []).map(m => String(m.name || '').toLowerCase());
    const confronted = names.some(n => n.includes('final_confrontation') || n.includes('final confrontation'));
    // The engine refuses final_blow while the boss stands; mid-fight the game
    // ends the quest itself on the kill, so don't demand an impossible op.
    const bossUp = (gameState.enemies || []).some(e => e.isBoss && !e.isDefeated && e.hp > 0);
    if (bossUp) return '';
    const villain = qp.villain ? `"${qp.villain}"` : 'the main villain';
    // Confronted but no boss to beat: final_blow is refused until one falls,
    // so ask for the fight (it used to demand final_blow forever).
    if (confronted && rounds >= 2 && !qp.bossDefeated) return `\nDEADLINE: the final confrontation has no fight yet. THIS turn add ${villain} with /enemies/- ("isBoss": true) and replace /inCombat true.`;
    if (confronted && rounds >= 2) return `\nDEADLINE: the boss has fallen. Close the story THIS turn and add the "final_blow" milestone.`;
    if (rounds >= 6) return `\nDEADLINE: the story has been in Act 3 for ${rounds} rounds. Bring the final confrontation THIS turn (add "final_confrontation"; if it is a fight, spawn the main threat with /enemies/- and "isBoss": true).`;
    return '';
}

// What players see: chapter title and a plain-words next step per milestone.
const FRIENDLY_MILESTONES = {
    call_to_adventure: 'Find out what is wrong',
    world_introduced: 'Meet the people and places involved',
    stakes_clear: 'Learn what you must do',
    ally_found: 'Find someone to help you',
    first_obstacle_overcome: 'Get past the first big obstacle',
    antagonist_revealed: 'Discover who (or what) is behind it all',
    final_confrontation: 'Face the final challenge',
    final_blow: 'Win the final showdown',
    aftermath: 'See how the world has changed'
};
export const friendlyMilestone = (name) => FRIENDLY_MILESTONES[name] || String(name || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** {chapter, next} for the header, or null when the main quest is over. */
export function describeQuestStep(gameState) {
    if (gameState.imprisoned) return { chapter: 'Captured!', next: 'Escape from captivity' };
    const act = determineCurrentAct(gameState);
    if (!act) return null;
    const done = new Set((gameState.questProgress?.milestones || []).map(m => m.name));
    const nextName = act.targetMilestones.find(n => !done.has(n));
    return { chapter: act.name.replace(' — ', ': '), next: nextName ? friendlyMilestone(nextName) : 'Keep going: the next chapter is close' };
}

/**
 * Any act: 5+ rounds without a milestone means the story is wandering (a live
 * play-through sat at 35% for 8 rounds in Act 2). Point at the next beat.
 */
function stallNudge(gameState, act) {
    const ms = gameState.questProgress?.milestones || [];
    const lastTurn = ms.length ? Math.max(...ms.map(m => m.turn || 0)) : 1;
    const idle = (gameState.turn || 1) - lastTurn;
    if (idle < 5) return '';
    const done = new Set(ms.map(m => m.name));
    const next = act.targetMilestones.find(n => !done.has(n));
    return next ? `\nSTALLED: ${idle} rounds have passed without a quest beat. This turn, move the story clearly toward "${next}" and add that milestone when it happens.` : '';
}

export function buildQuestStageHint(gameState) {
    // Phase 2: jail mini-quest takes precedence over the main arc.
    if (gameState.imprisoned) {
        return buildJailEscapeHint();
    }
    if (gameState.isGoalComplete) {
        // Authority and refusal rules only: the op mapping is in the turn's
        // instructions (aiHandler buildDiffInstructions); sending both cost
        // ~700 tokens a wish and disagreed on "I gain N" (the game adds N).
        return `\n\n=== GOD MODE ===
The main quest is won and the player has authorial power: each input is a declaration about the world. Honour it and persist every tangible change with ops (items, skills, places, people, foes, stats), or it vanishes next turn.
Only refuse what breaks the age-tier content policy, and then in-character (the world resists), with no ops for it. Do not add main-quest milestones or touch /isGoalComplete.`;
    }
    const act = determineCurrentAct(gameState);
    if (!act) return '';
    const villain = gameState.questProgress?.villain;
    // Fights were rare (live: 14 turns, no fight, with a goblin chieftain on stage).
    const sinceFight = (gameState.turn || 0) - (gameState.lastCombatTurn || 0);
    const fightNudge = act.id !== 'act1' && !gameState.inCombat && sinceFight >= 5
        ? `\nACTION: no fight for ${sinceFight} rounds. Unless the hero is resting somewhere safe, start one this turn: add a foe native to the story with /enemies/- and replace /inCombat true.`
        : '';
    return `\n\nMAIN QUEST STAGE — ${act.name}:${villain ? `\nMAIN VILLAIN: ${villain} (the final boss; keep them present in the story)` : ''}${fightNudge}
${gameState.adventureGoal && gameState.adventureGoal !== 'Not set yet.' ? act.narratorHint.replace(/^- By turn 4-6, you MUST set \/adventureGoal.*\n/m, '') : act.narratorHint}

When you reach a milestone listed above, emit a /questProgress/milestones/- diff op so the
quest progresses. Adding the final_blow milestone completes the main quest and unlocks the
god-mode reward.${act3Deadline(gameState, act) || stallNudge(gameState, act)}`;
}
