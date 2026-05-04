// jailSystem.js
// Phase 2: Death → Jail mechanic.
//
// When the entire party is wiped, instead of showing a hard game-over the
// players "wake up in jail" and must complete a mini-quest (the jail_escape
// quest) to break out. This module owns:
//
//   - Theme-specific jail location definitions
//   - transitionToJail()       — called from resolution.handlePartyWipe
//   - completeJailEscape()     — called when the escape quest finishes
//   - buildJailSystemPromptAddon() — appended to AI system prompt while imprisoned
//   - tryAutoCompleteEscape()  — heuristic to detect when the player has escaped
//
// State fields owned by this module (live on gameState):
//   imprisoned: boolean        — true while the party is in jail
//   captureLocation: object    — the location the player was at before capture
//   jail: { name, description, theme }
//   confiscatedItems: array    — non-quest items removed at capture
//   confiscatedGold: number    — gold removed at capture
//   jailEscape: {
//       activated: bool,
//       turnActivated: number,
//       attempts: number,           // failed escape attempts
//       maxAttempts: number,
//       objectives: { assess, weakness, escape }   // booleans
//   }
//
// The player loses the game for real ONLY if they get wiped while
// jailEscape.activated is true and have used up all attempts. This makes
// the jail the consequence of dying, not just an inconvenience.

import { gameState } from './state.js?cb=014';

/**
 * Theme-specific jail flavor. Each entry provides a name + description that
 * the AI narrator anchors on. The narrator decides the *texture* of the
 * imprisonment (guards, layout, atmosphere) — these are starting points.
 */
export const JAIL_LOCATIONS = {
    fantasy:           { name: 'Dungeon Cell',           description: 'Cold stone walls, iron bars, distant torchlight, the smell of damp straw.' },
    space:             { name: 'Detention Block',        description: 'Metal bulkheads, a humming force-field door, intermittent alarm lights.' },
    pirate:            { name: 'Ship\'s Brig',            description: 'Below decks, chains rattle, the boards creak with each swell of the sea.' },
    underwater:        { name: 'Coral Cage',             description: 'A lattice of living coral, sealed by undersea currents and watchful guard-rays.' },
    jungle:            { name: 'Tribal Bone Cage',       description: 'Suspended over a pit, bone bars lashed with vine, drums beating somewhere below.' },
    future_utopia:     { name: 'Reform Pod',             description: 'A spotless white cube with a polite voice that explains your rehabilitation timeline.' },
    dinosaur:          { name: 'Tar-Pit Pen',            description: 'A shallow ring of tar surrounded by ancient stones, predators circling beyond.' },
    arctic:            { name: 'Ice Pit',                description: 'A glassy pit cut into the glacier, breath fogging in the still air.' },
    steampunk:         { name: 'Brass Holding Cell',     description: 'Riveted brass walls, a pneumatic tube somewhere overhead, the constant tick of clockwork.' },
    haunted:           { name: 'Oubliette',              description: 'A forgotten pit, dripping walls, distant wailing that may be the wind or may not be.' },
    cyberpunk:         { name: 'Holding Cell',           description: 'Reinforced glass, neural dampeners on the wall, a guard drone slowly patrolling outside.' },
    wild_west:         { name: 'Jailhouse Cell',         description: 'Wooden bars, a tin cup, a wanted poster on the wall featuring you.' },
    post_apoc:         { name: 'Raider Cage',            description: 'Welded scrap metal, the hum of a generator, the laughter of raiders eating somewhere close.' },
    custom:            { name: 'Holding Cell',           description: 'A locked cell appropriate to wherever you are now.' },
    default:           { name: 'Jail Cell',              description: 'A small, locked room with no obvious way out.' }
};

/**
 * Resolve the jail location for the current theme. Falls back to default.
 */
export function getJailForTheme(theme) {
    if (!theme) return JAIL_LOCATIONS.default;
    return JAIL_LOCATIONS[theme] || JAIL_LOCATIONS.default;
}

/**
 * Phase 2.4: Transition the party from a wipe state into the jail.
 * Confiscates weapons, armor, and 50% of gold; restores HP to 50%; clears
 * downed status; activates the jail_escape quest; sets gameState.imprisoned
 * so action handlers gate appropriately.
 */
export function transitionToJail() {
    const log = window.displayVisualError || console.log;
    const theme = gameState.adventureTheme || 'fantasy';
    const jail = getJailForTheme(theme);

    log(`JailSystem: Transitioning party to ${jail.name} (theme: ${theme})`);

    // Confiscate equipment-class items. Quest items are kept (story progression).
    gameState.confiscatedItems = [];
    if (Array.isArray(gameState.players)) {
        gameState.players.forEach(p => {
            if (!p) return;
            const inv = Array.isArray(p.inventory) ? p.inventory : [];
            const taken = inv.filter(item => item && (item.type === 'Weapon' || item.type === 'Armor'));
            // Tag each confiscated item with its original owner so we can
            // return it to the right player on escape.
            taken.forEach(item => {
                if (item) {
                    gameState.confiscatedItems.push({ ...item, _ownerName: p.name });
                }
            });
            p.inventory = inv.filter(item => item && item.type !== 'Weapon' && item.type !== 'Armor');
            p.equipment = { weapon: null, armor: null };
        });
    }

    // Confiscate 50% of gold (rounded down).
    gameState.confiscatedGold = 0;
    if (Array.isArray(gameState.players)) {
        gameState.players.forEach(p => {
            if (!p) return;
            const taken = Math.floor((p.coins || 0) * 0.5);
            p.coins = (p.coins || 0) - taken;
            gameState.confiscatedGold += taken;
        });
    }

    // Restore party to a survivable state — 50% HP, no longer downed,
    // status effects cleared. Players walk out of unconsciousness into a
    // cell, not back into combat.
    if (Array.isArray(gameState.players)) {
        gameState.players.forEach(p => {
            if (!p) return;
            p.hp = Math.max(1, Math.floor((p.maxHp || 100) * 0.5));
            p.isDowned = false;
            p.downedTurns = 0;
            p.statusEffects = [];
        });
    }

    // Stash the location they were captured at; on escape they return there
    // (or somewhere narratively close to it).
    gameState.captureLocation = gameState.currentLocation
        ? JSON.parse(JSON.stringify(gameState.currentLocation))
        : null;

    // Replace currentLocation with the jail location structure (compatible
    // with the existing /currentLocation engine path).
    gameState.currentLocation = {
        name: jail.name,
        description: jail.description,
        type: 'jail',
        dangerLevel: 0.3,
        theme
    };

    // Activate the jail escape mini-quest. Three objective flags drive
    // both the AI system prompt addon and the auto-complete check.
    gameState.imprisoned = true;
    gameState.jail = { name: jail.name, description: jail.description, theme };
    gameState.jailEscape = {
        activated: true,
        turnActivated: gameState.turn || 1,
        attempts: 0,
        maxAttempts: 3,
        objectives: {
            assessed: false,
            weaknessFound: false,
            escaped: false
        }
    };

    // Combat / enemies cleared — the wipe combat is over.
    gameState.inCombat = false;
    gameState.enemies = [];

    log(`JailSystem: Party imprisoned. Confiscated ${gameState.confiscatedItems.length} items, ${gameState.confiscatedGold} gold.`);
}

/**
 * Phase 2.5: Called when the jail_escape quest completes (objectives.escaped
 * = true). Restores ~75% of confiscated items and gold, returns the party
 * to or near the capture location, and clears the imprisoned flag.
 */
export function completeJailEscape() {
    const log = window.displayVisualError || console.log;
    if (!gameState.imprisoned) {
        log('JailSystem: completeJailEscape called but party was not imprisoned.');
        return;
    }

    log('JailSystem: Party has escaped from ' + (gameState.jail?.name || 'jail'));

    // Restore ~75% of confiscated items, distributed back to original owners.
    const items = gameState.confiscatedItems || [];
    const restoreCount = Math.ceil(items.length * 0.75);
    const toRestore = items.slice(0, restoreCount);
    const playersByName = new Map();
    if (Array.isArray(gameState.players)) {
        gameState.players.forEach(p => { if (p?.name) playersByName.set(p.name, p); });
    }
    toRestore.forEach(item => {
        const owner = playersByName.get(item._ownerName) || gameState.players?.[0];
        if (owner) {
            const cleaned = { ...item };
            delete cleaned._ownerName;
            owner.inventory = owner.inventory || [];
            owner.inventory.push(cleaned);
        }
    });

    // Restore ~75% of gold, split across living players.
    const goldRestored = Math.floor((gameState.confiscatedGold || 0) * 0.75);
    const livingPlayers = (gameState.players || []).filter(p => p && p.hp > 0);
    if (livingPlayers.length > 0 && goldRestored > 0) {
        const perPlayer = Math.floor(goldRestored / livingPlayers.length);
        livingPlayers.forEach(p => { p.coins = (p.coins || 0) + perPlayer; });
    }

    // Return to capture location (or a fallback location for the theme).
    if (gameState.captureLocation) {
        gameState.currentLocation = gameState.captureLocation;
    }

    // Clear all jail state.
    gameState.imprisoned = false;
    gameState.confiscatedItems = [];
    gameState.confiscatedGold = 0;
    gameState.captureLocation = null;
    gameState.jail = null;
    if (gameState.jailEscape) {
        gameState.jailEscape.activated = false;
        gameState.jailEscape.objectives.escaped = true;
    }

    // Reset consecutiveWipes so a future wipe doesn't immediately trigger
    // another jail or game-over from a stale counter.
    gameState.consecutiveWipes = 0;

    log(`JailSystem: Restored ${toRestore.length}/${items.length} items, ${goldRestored} gold.`);
}

/**
 * Heuristic auto-complete: scan the most recent narrative for clear
 * indicators that the players have already escaped (the AI narrated it
 * without firing an explicit milestone op). This is a safety net so the
 * player isn't trapped by the LLM forgetting to advance the quest.
 *
 * Returns true if escape was detected and completeJailEscape() was called.
 */
export function tryAutoCompleteEscape() {
    if (!gameState.imprisoned) return false;
    const narrative = (gameState.currentNarrative || '').toLowerCase();
    if (!narrative) return false;

    // Strong escape signals — these phrases mean the escape happened.
    const escapeSignals = [
        'broke out',
        'escaped from',
        'fled the cell',
        'the cell door swung open',
        'left the jail',
        'left the cell',
        'free of the jail',
        'free of the cell',
        'past the guards',
        'into the open air'
    ];
    const matched = escapeSignals.some(sig => narrative.includes(sig));
    if (matched) {
        completeJailEscape();
        return true;
    }
    return false;
}

/**
 * Phase 2 / 3.2 helper: build the system-prompt addon to inject into AI
 * calls while the party is imprisoned. aiHandler appends this after its
 * canonical state block.
 */
export function buildJailSystemPromptAddon() {
    if (!gameState.imprisoned || !gameState.jail) return '';
    const objs = gameState.jailEscape?.objectives || {};
    const checked = (b) => b ? '☑' : '☐';

    return `

=== ACTIVE: JAIL ESCAPE QUEST ===
The party is currently IMPRISONED in: ${gameState.jail.name}
Setting: ${gameState.jail.description}

OBJECTIVES (the player must complete these to escape):
${checked(objs.assessed)} Assess the situation — survey the cell, the guards, the layout, what they have left
${checked(objs.weaknessFound)} Find a weakness — discover the way out (a loose bar, a corruptible guard, a guard's pattern, an overlooked vent, anything)
${checked(objs.escaped)} Escape — physically exit the jail, into freedom

INSTRUCTIONS for this turn:
- Do NOT let the player leave the jail until ALL three objectives are completed.
- Equipment was confiscated. The player has no weapons or armor unless they retrieve them.
- Combat in jail: improvised weapons only (a stool, a chain, fists). No spells if "Silence" is thematic.
- Offer choices that map to the active objective. Push toward the next one.
- BUG-16: LOCATION RULES WHILE IMPRISONED — DO NOT, UNDER ANY CIRCUMSTANCE:
    • Emit a /currentLocation diff op (engine will reject; prose will desync).
    • Describe the player traveling to the courtyard, the town, the market, anywhere
      outside the jail. Even after a milestone fires.
    • Describe successful escape into the open world before the FINAL jail_escaped
      milestone has been narrated.
  Allowed: describe attempts, failures, partial progress, planning, NPC interactions
  WITHIN the cell area only. The system itself moves the location after jail_escaped.
- When the player attempts an action that satisfies an objective, narrate the success and emit a milestone:
    {"op":"add","path":"/questProgress/milestones/-","value":{"name":"jail_assessed","description":"The cell and guards are scoped out."}}
    {"op":"add","path":"/questProgress/milestones/-","value":{"name":"jail_weakness_found","description":"A way out has been identified."}}
    {"op":"add","path":"/questProgress/milestones/-","value":{"name":"jail_escaped","description":"The party is free."}}
- ON THE TURN OF FULL ESCAPE, narrate the breakout vividly and then the system will restore the party's items + gold + location.
=== END JAIL BLOCK ===`;
}

/**
 * Apply milestone ops emitted by the narrator to update jailEscape state.
 * Called from engine.applyDiff side-channel (via a hook in aiHandler).
 *
 * Returns true if the milestone matched a jail objective.
 */
export function tryApplyJailMilestone(milestoneName) {
    if (!gameState.imprisoned || !gameState.jailEscape) return false;
    const name = (milestoneName || '').toLowerCase();
    const objs = gameState.jailEscape.objectives;

    if (name === 'jail_assessed' || name === 'jail_situation_assessed') {
        objs.assessed = true;
        return true;
    }
    if (name === 'jail_weakness_found' || name === 'jail_plan_made') {
        objs.weaknessFound = true;
        return true;
    }
    if (name === 'jail_escaped' || name === 'jail_breakout_complete') {
        objs.escaped = true;
        // Trigger the completion flow.
        completeJailEscape();
        return true;
    }
    return false;
}

/**
 * Track a failed escape attempt — the party was wiped again while
 * imprisoned. If they exceed maxAttempts, the game-over screen is the
 * appropriate response (true game over, no further jail loop).
 *
 * Returns true if max attempts have been exceeded (caller should show
 * the real game-over screen).
 */
export function recordFailedEscape() {
    if (!gameState.imprisoned || !gameState.jailEscape) return false;
    gameState.jailEscape.attempts = (gameState.jailEscape.attempts || 0) + 1;
    return gameState.jailEscape.attempts >= (gameState.jailEscape.maxAttempts || 3);
}

// Phase 2: register on window so questDefinitions and other modules can
// fetch the jail prompt addon without creating a circular import. This is
// a one-way registration — questDefinitions only reads, never writes.
if (typeof window !== 'undefined') {
    window.__jailSystem = {
        buildJailSystemPromptAddon,
        tryApplyJailMilestone,
        tryApplyJailMilestone,
        tryAutoCompleteEscape,
        getJailForTheme
    };
}
