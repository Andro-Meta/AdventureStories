// turnManager.js
// Manages game turns, processing effects, checking conditions, and selecting the next player.

// --- Static Imports ---
import { gameState, getCurrentPlayer, syncTurnStates, canCurrentPlayerAct } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Items from './items.js?cb=014';
// Import resolution functions statically
import { handlePartyWipe, handleCombatVictory } from './resolution.js?cb=014';


/**
 * Advances the game turn, processes end-of-turn effects, checks win/loss conditions,
 * handles cooldowns/timers, and selects the next active player.
 * Calls relevant UI updates EXCEPT for rendering choices.
 */
export async function advanceTurn() {
    const log = window.displayVisualError || console.log; // Use logger
    log(`--- Advancing Turn (End of Turn ${gameState.turn}) ---`);
    
    // Synchronize turn states to prevent conflicts
    const turnMode = syncTurnStates();
    if (turnMode === 'combat') {
        log("Turn advancement deferred to combat system");
        return; // Combat system handles its own turns
    }

    // --- Process End-of-Turn Effects for ALL Players & Enemies ---
    log("Processing end-of-turn status effects...");
    // Process status effects for all characters (async)
    for (const player of gameState.players) {
        if (player && !player.isDowned) {
            await Combat.processStatusEffectTicks(player);
        }
    }
    
    // Process enemies *after* players in case player status effect defeats an enemy
    for (const enemy of gameState.enemies) {
        if (enemy && !enemy.isDefeated) {
            await Combat.processStatusEffectTicks(enemy);
        }
    }
    log("Finished processing status effects.");

    // --- Resource Regeneration (MP/SP/EP/etc based on theme) ---
    log("Processing resource regeneration...");
    const regenAmount = gameState.inCombat ? Config.RESOURCE_REGEN_COMBAT : Config.RESOURCE_REGEN_EXPLORATION;
    
    gameState.players.forEach(player => {
        if (player && !player.isDowned && player.mp < player.maxMp) {
            const oldMp = player.mp;
            player.mp = Math.min(player.maxMp, player.mp + regenAmount);
            if (player.mp > oldMp) {
                log(`${player.name} regenerated ${player.mp - oldMp} resource points (${oldMp} -> ${player.mp})`);
            }
        }
    });
    log("Finished resource regeneration.");

     // --- Check Win/Loss Conditions ---
     log("Checking win/loss conditions...");
     // Check party wipe first (most critical)
     if (Combat.isPartyWiped()) {
         log("Party wipe detected in advanceTurn.");
         await handlePartyWipe(); // Await the async function
         log("Turn advancement halted due to party wipe.");
         // UI updates are handled within handlePartyWipe or its subsequent AI call
         return; // Stop further turn advancement processing
     }

     // Check combat victory (only if still in combat)
     const combatEndedThisTurn = gameState.inCombat && Combat.areAllEnemiesDefeated();
     if (combatEndedThisTurn) {
         log("Combat victory detected in advanceTurn.");
         await handleCombatVictory(); // Await the async function
         log("Combat ended this turn.");
         // Combat state is set within handleCombatVictory. UI updates will happen below.
         // Note: handleCombatVictory prevents immediate turn advance in its AI call,
         // allowing the below logic to proceed for turn increment etc.
     }
     log("Finished checking win/loss conditions.");

    // --- Process Cooldowns & Downed Timers for ALL Players ---
    log("Processing cooldowns and downed timers...");
    let recoveredPlayer = false;
    gameState.players.forEach(player => {
        if (!player) return;
        // Cooldowns tick down
        player.specialMoves?.forEach(move => { if (move && move.currentCooldown > 0) move.currentCooldown--; });
        // Downed timer ticks up
        if (player.isDowned) {
            player.downedTurns++;
            log(`${player.name} downed turn count: ${player.downedTurns}/${Config.DOWNED_TURNS_MAX}`);
            // Check for auto-revive
            if (player.downedTurns >= Config.DOWNED_TURNS_MAX) {
                player.isDowned = false;
                player.hp = Math.max(1, Math.floor(player.maxHp * Config.REVIVE_HP_PERCENT_AUTO));
                player.downedTurns = 0;
                UI.showPopup(`${player.name} recovered consciousness!`, 'healing');
                Combat.recalculateCharacterStats(player); // Recalculate stats on revive
                recoveredPlayer = true;
                 log(`${player.name} auto-revived.`);
            }
        }
    });
    log("Finished processing cooldowns and downed timers.");

    // --- Select Next Player ---
    log("Selecting next player...");
    let nextPlayerFound = false;
    let safetyCounter = 0;
    const initialPlayerIndex = gameState.currentPlayerIndex;
    let wrappedAround = false; // Did the index wrap back to the start?

    const canAnyoneAct = gameState.players.some(p => p && !p.isDowned);

    if (!canAnyoneAct && !gameState.handlingPartyWipe) {
        // This is an edge case recovery. If isPartyWiped didn't catch it earlier,
        // but we find no one can act now, trigger the wipe handling.
        log("ERROR: No players can act, but party wipe not triggered earlier. Forcing party wipe check now.");
        await handlePartyWipe(); // Await the async function
        log("Turn advancement halted after forced party wipe check.");
        return;
    }

    if (canAnyoneAct) {
        let newIndex = gameState.currentPlayerIndex;
        // Special case: a 1-player game wraps every single turn. The
        // generic logic below conflated "found next player without wrapping"
        // with "did not complete a round" and zeroed wrappedAround for
        // solo play, which kept gameState.turn pinned at 1 forever.
        if (gameState.players.length === 1) {
            const onlyPlayer = gameState.players[0];
            if (onlyPlayer && !onlyPlayer.isDowned) {
                nextPlayerFound = true;
                gameState.currentPlayerIndex = 0;
                wrappedAround = true; // a solo round always wraps
                log(`Next player found: ${onlyPlayer.name} (Index: 0, solo wrap)`);
            }
        } else do {
            newIndex = (newIndex + 1) % gameState.players.length;
             // Check if we've wrapped around back to the start
             if (newIndex === 0 && gameState.currentPlayerIndex === gameState.players.length - 1) { wrappedAround = true; }
             else if (newIndex === gameState.currentPlayerIndex + 1 && newIndex !== 0) { wrappedAround = false; } // Reset wrap check if moving normally mid-list
             // More robust wrap check: if newIndex loops back to starting point after checking others
             if (newIndex === initialPlayerIndex && safetyCounter >= gameState.players.length) { wrappedAround = true; }


            const nextPlayer = gameState.players[newIndex];
            if (nextPlayer && !nextPlayer.isDowned) {
                // Found the next valid player
                nextPlayerFound = true;
                gameState.currentPlayerIndex = newIndex;
                log(`Next player found: ${nextPlayer.name} (Index: ${gameState.currentPlayerIndex})`);
                // If we found a player *before* wrapping around, it's not the end of a full round yet.
                if (safetyCounter < gameState.players.length) wrappedAround = false;
            }

            safetyCounter++;
            // Safety break to prevent infinite loops if state is broken
            if (safetyCounter > gameState.players.length * 2) { // Allow checking each player twice just in case
                 log("CRITICAL ERROR: Infinite loop detected in next player selection. Check turn logic and player states.");
                 console.error("State:", JSON.parse(JSON.stringify(gameState))); // Log state for debugging
                 UI.showPopup("Critical Error: Could not determine next player turn. Check debug log.", "error", 10000);
                 log("Halting turn advancement due to loop.");
                 return; // Halt
             }
        } while (!nextPlayerFound);
    } else {
         // This case should ideally be caught by party wipe checks earlier
         log("Warning: No players available to act this turn (should have been party wipe).");
         wrappedAround = false; // Prevent turn increment if everyone is somehow down but not wiped
    }
    log("Finished selecting next player.");


    // --- Increment Global Turn Counter ---
    // Increment turn ONLY if we have wrapped around back to the first player (or equivalent)
    let turnIncremented = false;
    if (wrappedAround && canAnyoneAct) { // Only increment if someone can actually take the new turn
        gameState.turn++;
        turnIncremented = true;
        log(`--- Starting Turn ${gameState.turn} ---`);
        // Refresh shop periodically
         if (gameState.turn > 1 && gameState.turn % 5 === 0) {
             gameState.shopItems = Items.generateShopItems(gameState.adventureTheme, gameState.turn);
             log("Shop stock refreshed.");
             if (gameState.currentScreen === 'shopScreen') UI.renderShop();
         }
    } else if (!canAnyoneAct) {
         log("Turn counter not incremented (no players can act).");
    } else {
         log(`Turn counter remains ${gameState.turn} (did not wrap around or no one can act).`);
    }

    // --- Clear Defeated Enemies (Post-Combat) ---
    // This might be redundant if handleCombatVictory already clears them, but ensure consistency.
    // Only clear if combat actually *ended* this specific turn advancement cycle.
    // if (combatEndedThisTurn) {
    //      const defeatedCount = gameState.enemies.filter(e => e.isDefeated).length;
    //      if (defeatedCount > 0) {
    //          gameState.enemies = gameState.enemies.filter(e => !e.isDefeated);
    //          log(`Removed ${defeatedCount} defeated enemies after combat ended.`);
    //      }
    // }

    log(`Turn advanced processing complete. Current Player: ${getCurrentPlayer()?.name || 'None'}, Turn: ${gameState.turn}`);

    // --- Update UI for New Turn State (Player Cards, Headers, Quick Actions) ---
    UI.updateGameHeader();
    UI.renderPlayerCards();
    UI.renderEnemyCards(); // Ensure enemies are updated/hidden if combat ended
    UI.updateQuickActions();
    UI.updateContextHeaders(); // For inv/shop etc.

    // --- REMOVED Choice Rendering ---
    // UI.renderChoices(); // DO NOT RENDER CHOICES HERE - They come from AI response processing

    log("advanceTurn completed.");
}


