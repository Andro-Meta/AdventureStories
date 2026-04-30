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
- Introduce 1-2 named NPCs and at least one named location.
- Plant the inciting incident: something is wrong, the player is the only one who can fix it.
- By turn 4-6, you MUST set /adventureGoal to a clear sentence ("Restore the X before the Y").
- Use these EXACT milestone names verbatim, in order, as you reach each beat:
   1. "call_to_adventure"   — emit on the turn the inciting incident lands.
   2. "world_introduced"    — emit once 1-2 NPCs and a named location are on stage.
   3. "stakes_clear"        — emit when the player understands what they must do. THIS IS REQUIRED to advance to Act 2.
- PACING: emit AT MOST ONE milestone per turn. Turn 1 should establish setting only — usually no milestone, or just call_to_adventure if the player's first action triggers the inciting beat. Don't fire all three Act 1 milestones in the opening scene; that ruins the slow burn.
- After EACH milestone you emit, ALSO emit a /questProgress/completionPercentage replace op.
  Suggested cumulative ranges in Act 1: 5%, 12%, 20% (when stakes_clear fires).
- Use snake_case milestone names exactly as listed; never paraphrase ("The Stakes Become Clear" is WRONG, use "stakes_clear").`
    },
    {
        id: 'act2',
        name: 'Act 2 — The Trial',
        targetMilestones: ['ally_found', 'first_obstacle_overcome', 'antagonist_revealed'],
        targetTurnRange: [13, 30],
        narratorHint:
`This is Act 2 of the main quest. The player is in the middle of the journey.
- Introduce the antagonist (NPC) or their reach (location/item).
- Give the player tangible progress: an ally NPC, a key item, a partial victory.
- Include at least one combat encounter (spawn an enemy via /enemies/-, set /inCombat: true).
- Use these EXACT milestone names verbatim, in order:
   1. "ally_found"              — when an ally NPC joins or commits to help.
   2. "first_obstacle_overcome" — when the player wins a meaningful trial (combat, puzzle, social).
   3. "antagonist_revealed"     — when the antagonist's identity / reach is shown. THIS IS REQUIRED to advance to Act 3.
- PACING: emit AT MOST ONE milestone per turn. Space these milestones across multiple turns — there's no rush.
- After EACH milestone, emit a /questProgress/completionPercentage replace op.
  Suggested cumulative ranges in Act 2: 35%, 50%, 65% (when antagonist_revealed fires).
- Use snake_case milestone names exactly as listed; never paraphrase.`
    },
    {
        id: 'act3',
        name: 'Act 3 — The Reckoning',
        targetMilestones: ['final_confrontation', 'final_blow', 'aftermath'],
        targetTurnRange: [31, 50],
        narratorHint:
`This is Act 3 of the main quest. The player is at the climax.
- Stage a climactic encounter — usually combat, sometimes a moral choice or sacrifice.
- Use these EXACT milestone names verbatim, in order:
   1. "final_confrontation" — when the player faces the antagonist directly.
   2. "final_blow"          — when the threat is defeated/resolved. CRITICAL: if you emitted "final_confrontation" two or more turns ago without yet emitting "final_blow", you MUST emit "final_blow" THIS TURN. The story cannot loop in the climax — close it.
   3. "aftermath"           — the closing beat after the win.
- PACING: emit AT MOST ONE milestone per turn. The climactic act deserves multiple beats.
- After EACH milestone, emit a /questProgress/completionPercentage replace op.
  Suggested cumulative ranges in Act 3: 80%, 95%, 100% (with final_blow + aftermath).
  Once you set 100% you MUST emit /isGoalComplete: true on the same or next turn.
- After the climax, the player WINS the quest. Emit (in this order):
  • {"op":"add","path":"/questProgress/milestones/-","value":{"name":"final_blow","description":"The threat is ended."}}
  • {"op":"replace","path":"/questProgress/completionPercentage","value":100}
  • {"op":"replace","path":"/isGoalComplete","value":true}
- The act of setting /isGoalComplete to true UNLOCKS GOD MODE — the player gains the power
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
    const turn = gameState.turn || 1;

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
 * Build the quest-stage hint block to inject into the system prompt.
 * @param {object} gameState
 * @returns {string}
 */
export function buildQuestStageHint(gameState) {
    if (gameState.isGoalComplete) {
        return `\n\n=== GOD MODE (post-main-quest authorial authority) ===

OVERRIDES: This block supersedes any earlier "QUEST PROGRESS GUIDANCE" or "MAIN QUEST
STAGE" rules. The main quest is finished. The player has earned full authorial power
over the world. Every input they submit is a DECLARATION about the world that you
must honor and PERSIST via diff ops.

PRIMARY RULE: Whenever the player declares a tangible change to the world or to
themselves, you MUST emit a corresponding diff op. Mere narration is NOT enough —
if the diff doesn't fire, the change vanishes next turn and the player's god-mode
power feels broken.

DECLARATION → REQUIRED DIFF MAPPING (memorize these):
• "I have <N> gold/coins/money" → /players/0/coins replace (cap 99999 for "infinite")
• "I have/wear/wield <ITEM>" → /players/0/inventory/- add (with reasonable stats)
• "I learn/cast/know <SKILL/SPELL>" → /players/0/specialMoves/- add
• "I summon/befriend/bond with <CREATURE_NAME>" → /entityMemory/npcs/<NAME> add (+ optionally /players/0/specialMoves/- if it's a combat ally)
• "I create/visit/transport-to <PLACE>" → /currentLocation replace + /entityMemory/locations/<NAME> add
• "I face/fight/summon <NEW BOSS>" → /enemies/- add + /inCombat replace true + /entityMemory/npcs/<NAME> add
• "I declare a new quest: <GOAL>" → /adventureGoal replace + /questProgress/completionPercentage replace 0 (do NOT touch /isGoalComplete — keep it true so god mode persists)
• "My <STAT> is now <N>" / "I gain <N> attack/defense/HP" → /players/0/<atk|def|maxHp|level> replace
• "I'm now level <N>" → /players/0/level replace

WHEN PLAYER IS VAGUE — apply these defaults in the diff value:
• Item with no stats specified → tier "Special", reasonable {atk:N} or {def:N} for the implied power, evocative effect string
• Skill with no mechanics → cooldown:3, mpCost:10, plain mechanics object
• NPC with no traits → relationship "neutral" or "bonded" (read from text), short description from your prose
• Boss with no stats → hp:300-800, atk:30-60, def:20-40 scaled to drama
• "A lot of <RESOURCE>" → 10000. "Infinite" → 99999.

REFUSAL: Only refuse if the input violates the active age-tier policy. In that case
write a DIEGETIC refusal — the world resists in-character, no fourth-wall break, no
diff ops for the forbidden change. Otherwise: HONOR EVERY INPUT. The player earned this.

DO NOT in god mode:
- Emit milestones for ongoing main-quest progression (the main quest is done)
- Reset /isGoalComplete to false (god mode would deactivate)
- Decline to add an item/skill/NPC just because it sounds powerful or strange — that's the point`;
    }
    const act = determineCurrentAct(gameState);
    if (!act) return '';
    return `\n\nMAIN QUEST STAGE — ${act.name}:
${act.narratorHint}

When you reach a milestone listed above, emit a /questProgress/milestones/- diff op so the
quest progresses. The act of completing the FINAL milestone of Act 3 (and setting
/isGoalComplete to true) unlocks the god-mode reward for the player.`;
}
