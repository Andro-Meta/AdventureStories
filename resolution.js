// resolution.js
// Handles specific game state resolutions: combat victory, party wipe, goal completion.

// --- Static Imports ---
import { gameState, getCurrentPlayer } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Items from './items.js?cb=014'; // Needed for goal completion rewards
import { generateId, getRandomElement } from './utils.js?cb=014'; // Added getRandomElement
// Import functions from aiHandler statically
import { makeAICallForSystemAction } from './aiHandler.js?cb=014';
// Import determineContext function
import { determineContext } from './state.js?cb=014';
// Import local AI orchestrator for enhanced resolution processing
import { localAIOrchestrator } from './localAIOrchestrator.js?cb=014';
// Phase 2: jail mechanic — replaces the old "soft revive at 1 HP same location" flow
import { transitionToJail, recordFailedEscape, getJailForTheme } from './jailSystem.js?cb=014';


/**
 * Handles the situation when all enemies are defeated. Triggers AI for aftermath.
 * Assumes called when gameState.inCombat is true and Combat.areAllEnemiesDefeated() is true.
 */
export async function handleCombatVictory() {
    // (Unchanged)
    console.log("Combat Victory! Processing resolution...");
    displayVisualError("Combat Victory! Processing resolution..."); // Visual log
    if (!gameState.inCombat || !Combat.areAllEnemiesDefeated()) {
         console.warn("handleCombatVictory called inappropriately. Skipping.");
         displayVisualError("Warning: handleCombatVictory called inappropriately. Skipping.");
         if (Combat.areAllEnemiesDefeated()) gameState.inCombat = false;
         return;
    }

    gameState.inCombat = false;
    // P5: Reset consecutive-wipes counter on victory. The game-over threshold
    // only fires when the player loses N times without a single combat win
    // in between, signalling they're genuinely stuck.
    gameState.consecutiveWipes = 0;
    UI.showPopup('Victory! All enemies defeated!', 'success', 4000);
    // P4: clear the combat log strip; encounter is over.
    try { if (typeof UI.clearCombatLog === 'function') UI.clearCombatLog(); } catch (_) {}

    // Trigger a specific AI prompt for post-combat narrative
    const victoryPrompt = `[Action Report: Combat Victory]
Players: ${gameState.players.map(p => `${p.name} (HP: ${p.hp}/${p.maxHp})`).join(', ')}
Defeated Enemies: ${gameState.enemies?.map(e => e.name).join(', ') || 'None'}
Location: ${gameState.currentLocation?.name || 'Unknown'}
Environment: ${determineContext(getCurrentPlayer()).environment}

Describe the scene after the victorious battle, mentioning the state of the defeated foes and the surrounding area. Then provide appropriate choices for what to do next.]`;

    // Use local AI orchestrator for enhanced victory processing
    try {
        const result = await localAIOrchestrator.orchestrateAgents('victory_processing', {
            situationType: 'combat_victory',
            context: victoryPrompt
        });
        if (result && result.narrative && result.choices) {
            UI.updateNarrative(result.narrative);
            gameState.currentChoices = result.choices;
            UI.renderChoices(result.choices);
            // Advance story turn now that combat is over (inCombat already false)
            try {
                const { advanceTurn } = await import('./turnManager.js?cb=014');
                await advanceTurn();
            } catch (e) { /* non-fatal — turn counter best-effort */ }
            return;
        }
    } catch (error) {
        console.log('Victory processing: Local AI orchestrator failed, using fallback:', error);
    }

    // Fallback to standard processing — inCombat is already false so advanceTurn will fire
    await makeAICallForSystemAction(victoryPrompt, false);
    console.log("handleCombatVictory finished.");
    displayVisualError("handleCombatVictory finished.");
}

/**
 * Phase 2.3: Handles the situation when all players are downed.
 *
 * NEW FLOW (replaces the old soft-revive + consecutiveWipes >= 2 hard
 * game-over):
 *
 *   Wiped while NOT imprisoned    → wake up in jail, jail_escape activates
 *   Wiped while imprisoned        → record failed attempt; if exceeded max
 *                                   attempts, real game over (executed)
 *
 * The jail IS the consequence of dying. There is no "2 wipes = game over"
 * arbitrary cutoff anymore — the player can keep playing as long as they
 * keep escaping. Real game-over only triggers if they fail to escape jail
 * three times.
 */
export async function handlePartyWipe() {
    console.error("Party Wipe! Processing resolution...");
    displayVisualError("Party Wipe! Processing resolution...");
    if (gameState.handlingPartyWipe) {
        console.warn("Party wipe already being handled. Skipping.");
        displayVisualError("Warning: Party wipe already being handled. Skipping.");
        return;
    }
    gameState.handlingPartyWipe = true;

    // Branch 1: wiped while ALREADY imprisoned. Record the failed escape
    // attempt; if maxAttempts exceeded, this is the real game over (the
    // player tried to escape and could not).
    if (gameState.imprisoned) {
        const exhausted = recordFailedEscape();
        if (exhausted) {
            try {
                const ui = await import('./ui.js?cb=014');
                if (typeof ui.showGameOverScreen === 'function') {
                    gameState.handlingPartyWipe = false;
                    ui.showGameOverScreen({
                        reason: 'jail_execution',
                        consecutiveWipes: gameState.jailEscape?.attempts || 0,
                        lastEnemies: (gameState.enemies || []).map(e => e.name).join(', '),
                        lastLocation: gameState.jail?.name || 'the cell'
                    });
                    return;
                }
            } catch (e) {
                displayVisualError(`Game-over screen import failed: ${e?.message}`);
            }
        }
        // Not yet exhausted — the AI gets another shot at narrating a
        // brutal beating that returns the players to the cell at low HP.
        UI.showPopup('Your escape attempt failed. Back in the cell.', 'error', 5000);
        gameState.inCombat = false;
        gameState.enemies = [];
        gameState.players.forEach(p => {
            if (!p) return;
            p.hp = Math.max(1, Math.floor((p.maxHp || 100) * 0.25));
            p.isDowned = false;
            p.downedTurns = 0;
            p.statusEffects = [];
            Combat.recalculateCharacterStats(p);
        });

        const failPrompt = `[Action Report: Failed Jail Escape]
The party tried to escape ${gameState.jail?.name || 'the cell'} and was beaten back.
Players: ${gameState.players.map(p => `${p.name} (HP: ${p.hp}/${p.maxHp})`).join(', ')}
Attempts remaining: ${(gameState.jailEscape?.maxAttempts || 3) - (gameState.jailEscape?.attempts || 0)}

Describe the failure vividly: the guards' counter-attack, the consequences (a beating, an additional restraint, perhaps a warning), and the party returned to the cell. Then provide choices for what to try next. The objectives of the jail_escape quest persist — the player must still find a weakness and escape.]`;
        try {
            await makeAICallForSystemAction(failPrompt, false);
        } catch (e) {
            console.error('AI call failed during jail-escape-failure resolution.', e);
        } finally {
            gameState.handlingPartyWipe = false;
            UI.renderPlayerCards();
            UI.updateQuickActions();
            UI.updateContextHeaders();
        }
        return;
    }

    // Branch 2: wiped in the open world. Transition to jail.
    UI.showPopup('The entire party has fallen!', 'error', 6000);

    // Recalculate stats post-revive (transitionToJail sets HP to 50%).
    transitionToJail();
    gameState.players.forEach(p => {
        if (p) Combat.recalculateCharacterStats(p);
    });

    const jail = getJailForTheme(gameState.adventureTheme || 'fantasy');
    const wipePrompt = `[Action Report: Captured]
The party was overwhelmed and has woken up imprisoned.
Players: ${gameState.players.map(p => `${p.name} (HP: ${p.hp}/${p.maxHp})`).join(', ')}
Imprisoned in: ${jail.name}
Setting: ${jail.description}
Items confiscated: ${(gameState.confiscatedItems || []).length}
Gold confiscated: ${gameState.confiscatedGold || 0}
Captured from: ${gameState.captureLocation?.name || 'an unknown place'}

Describe the party regaining consciousness in their cell. Establish:
1. The setting (sights, sounds, smells)
2. Visible guards or security
3. The state of their belongings (weapons gone)
4. One immediate hint at a possible weakness (a dropped key, a sleeping guard, a loose stone, an air vent — choose one)

Then provide three concrete choices that begin the escape attempt: assess the cell, watch the guards, or attempt to talk to a fellow prisoner / guard. The jail_escape quest is now active and the player must complete it to leave.]`;

    try {
        await makeAICallForSystemAction(wipePrompt, false);
    } catch (error) {
         console.error("AI call failed during party wipe → jail resolution.");
         displayVisualError("ERROR: AI call failed during jail transition.", error);
    } finally {
        console.log("Party wipe → jail transition complete.");
        displayVisualError("Party wipe → jail transition complete.");
        gameState.handlingPartyWipe = false;
        UI.renderPlayerCards();
        UI.updateQuickActions();
        UI.updateContextHeaders();
    }
}


/**
 * Applies rewards after the main goal is completed. Called by aiHandler when [Goal:Complete] command is processed.
 */
export function handleGoalCompletionRewards() {
    const log = window.displayVisualError || console.log;
    log("Goal Complete! Applying rewards.");

    if (!gameState.isGoalComplete) {
        log("Warning: handleGoalCompletionRewards called before isGoalComplete was set.");
    }

    // Spec: 1000 coins + a legendary weapon per player.
    const COIN_REWARD = 1000;

    // Announce the victory first with a dramatic popup.
    UI.showPopup('🏆 Quest Complete! The adventure is won!', 'legendary', 6000);

    gameState.players.forEach(player => {
        if (!player) return;

        // --- 1000 coins ---
        player.coins = (player.coins || 0) + COIN_REWARD;
        UI.showPopup(`${player.name} received ${COIN_REWARD} coins!`, 'coins', 4000);

        // --- Legendary weapon ---
        // Always generate a Legendary-tier Weapon so the reward matches the spec.
        const legendaryWeapon = Items.generateThemedItem(
            gameState.adventureTheme,
            Config.Tiers.LEGENDARY,
            'Weapon'
        );

        if (legendaryWeapon) {
            if (!legendaryWeapon.id) legendaryWeapon.id = generateId('item');
            // Mark it as a quest reward so the UI can call it out specially.
            legendaryWeapon.questReward = true;
            player.inventory.push(legendaryWeapon);
            log(`${player.name} received legendary weapon: ${legendaryWeapon.name}`);
            UI.showPopup(`${player.name} obtained: ${legendaryWeapon.name}!`, 'legendary', 5000);
        } else {
            // Fallback: give a large coin bonus if item generation fails.
            log(`Warning: Could not generate legendary weapon for ${player.name}. Giving bonus coins instead.`);
            player.coins += 500;
            UI.showPopup(`${player.name} receives a bonus 500 coins (legendary item unavailable).`, 'coins', 4000);
        }
    });

    if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
    UI.renderPlayerCards();
    UI.updateContextHeaders();
    log("handleGoalCompletionRewards finished.");
}