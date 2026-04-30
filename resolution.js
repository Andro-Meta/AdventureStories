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
            return;
        }
    } catch (error) {
        console.log('Victory processing: Local AI orchestrator failed, using fallback:', error);
    }

    // Fallback to standard processing
    await makeAICallForSystemAction(victoryPrompt, true); // preventTurnAdvance = true
    console.log("handleCombatVictory finished.");
    displayVisualError("handleCombatVictory finished.");
}

/**
 * Handles the situation when all players are downed. Applies penalties, revives players, triggers AI.
 */
export async function handlePartyWipe() {
    // (Unchanged - already uses makeAICallForSystemAction)
    console.error("Party Wipe! Processing resolution...");
    displayVisualError("Party Wipe! Processing resolution..."); // Visual log
    if (gameState.handlingPartyWipe) {
        console.warn("Party wipe already being handled. Skipping.");
        displayVisualError("Warning: Party wipe already being handled. Skipping.");
        return;
    }
    gameState.handlingPartyWipe = true;

    // P5: Track consecutive wipes. If we cross the threshold AND the player
    // is not in god mode (god-mode players can author their way out, plus
    // they've already won at least once), surface the game-over screen
    // instead of the silent soft-recovery. Reset counter on combat victory
    // (see handleCombatVictory).
    gameState.consecutiveWipes = (gameState.consecutiveWipes || 0) + 1;
    const MAX_CONSECUTIVE_WIPES = 2;
    const showGameOver = gameState.consecutiveWipes >= MAX_CONSECUTIVE_WIPES && !gameState.isGoalComplete;
    if (showGameOver) {
        try {
            const ui = await import('./ui.js?cb=014');
            if (typeof ui.showGameOverScreen === 'function') {
                gameState.handlingPartyWipe = false; // release lock
                ui.showGameOverScreen({
                    reason: 'party_wipe',
                    consecutiveWipes: gameState.consecutiveWipes,
                    lastEnemies: (gameState.enemies || []).map(e => e.name).join(', '),
                    lastLocation: gameState.currentLocation?.name || 'an unknown place'
                });
                return; // do not soft-revive; the player chooses from the screen
            }
        } catch (e) {
            displayVisualError(`Game-over screen import failed: ${e?.message}; falling back to soft recovery.`);
        }
    }

    UI.showPopup('The entire party has fallen!', 'error', 6000);
    gameState.inCombat = false;
    gameState.enemies = [];

    displayVisualError("Applying party wipe consequences...");
    gameState.players.forEach(player => {
        if (!player) return;
        let coinLoss = 0;
        if (player.coins > 0) {
            coinLoss = Math.max(1, Math.floor(player.coins * Config.PARTY_WIPE_COIN_LOSS_PERCENT));
            player.coins -= coinLoss;
        }
        displayVisualError(`${player.name} lost ${coinLoss} coins. Remaining: ${player.coins}`);
        player.equipment = { weapon: null, armor: null };
        player.inventory?.forEach(item => { if (item) item.equippedSlot = null; });
        displayVisualError(`${player.name}: Equipment removed.`);
        const questItems = player.inventory?.filter(item => item?.type === 'Quest') || [];
        const lostItemCount = (player.inventory?.length || 0) - questItems.length;
        player.inventory = questItems;
        displayVisualError(`${player.name} lost ${lostItemCount} non-quest items.`);
        player.hp = 1;
        player.isDowned = false;
        player.downedTurns = 0;
        player.statusEffects = [];
        Combat.recalculateCharacterStats(player);
        displayVisualError(`${player.name} revived with 1 HP, status cleared, stats recalculated.`);
    });

    const wipePrompt = `[Action Report: Party Wipe Recovery]
Players: ${gameState.players.map(p => `${p.name} (HP: ${p.hp}/${p.maxHp}, Lost Items: ${(p.inventory?.length || 0)}, Coins Lost: ${Math.floor(p.coins * Config.PARTY_WIPE_COIN_LOSS_PERCENT)})`).join(', ')}
Previous Location: ${gameState.currentLocation?.name || 'Unknown'}
Previous Combat: ${gameState.enemies?.map(e => e.name).join(', ') || 'Unknown enemies'}
Environment: ${determineContext(getCurrentPlayer()).environment}

Describe the party regaining consciousness in a disadvantageous situation (e.g., waking up in a ditch, captured, or rescued by a mysterious figure). Focus on their vulnerable state and immediate survival needs. Then provide appropriate choices for their next actions.]`;

    try {
        await makeAICallForSystemAction(wipePrompt, false); // preventTurnAdvance = false
    } catch (error) {
         console.error("AI call failed during party wipe resolution.");
         displayVisualError("ERROR: AI call failed during party wipe resolution.", error);
    } finally {
        console.log("Party wipe handling complete.");
        displayVisualError("Party wipe handling complete.");
        gameState.handlingPartyWipe = false;
        // Update UI after flag reset
        UI.renderPlayerCards();
        UI.updateQuickActions();
        UI.updateContextHeaders();
    }
}


/**
 * Applies rewards after the main goal is completed. Called by aiHandler when [Goal:Complete] command is processed.
 */
export function handleGoalCompletionRewards() {
    // Implementation handles goal completion rewards properly
    // Needs gameState, Config, UI, Items, Combat, generateId, getRandomElement
    console.log("Goal Complete! Applying rewards.");
    displayVisualError("Goal Complete! Applying rewards."); // Visual log
    if (!gameState.isGoalComplete) {
         console.warn("handleGoalCompletionRewards called but goal is not marked complete in state yet. This might be called too early.");
         displayVisualError("Warning: handleGoalCompletionRewards called but goal is not marked complete in state.");
    }

    const coinReward = Config.DefaultItemCosts[Config.Tiers.SPECIAL] || 350;
    UI.showPopup(`Goal Complete! +${coinReward} Coins per player!`, 'legendary', 5000);

    gameState.players.forEach(player => {
         if (!player) return;

         player.coins = (player.coins || 0) + coinReward;

        let rewardTier = Config.Tiers.HIGH;
         const tierRoll = Math.random();
         if (tierRoll > 0.7) rewardTier = Config.Tiers.SPECIAL;

        displayVisualError(`Generating ${rewardTier} reward item for ${player.name}`);
        const itemType = getRandomElement(['Weapon', 'Armor']); // Give one good piece of gear
        const rewardItem = Items.generateThemedItem(gameState.adventureTheme, rewardTier, itemType);

        if (rewardItem) {
             console.log(`Generated reward: ${rewardItem.name}`);
             displayVisualError(` -> ${player.name} received reward: ${rewardItem.name}`);
             if (!rewardItem.id) rewardItem.id = generateId('item');
             player.inventory.push(rewardItem);
             UI.showPopup(`${player.name} received reward: ${rewardItem.name}!`, 'item');
        } else {
             console.warn(`Failed to generate ${rewardTier} ${itemType} reward for ${player.name}.`);
             displayVisualError(`Warning: Failed to generate ${rewardTier} ${itemType} reward for ${player.name}.`);
        }
    });

    if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
    UI.renderPlayerCards();
    UI.updateContextHeaders();
    console.log("handleGoalCompletionRewards finished.");
    displayVisualError("handleGoalCompletionRewards finished.");
}