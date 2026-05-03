// actionHandler.js
// Handles player-initiated actions like choices, item use, special moves, etc.

// --- Static Imports ---
import { gameState, determineContext, getCurrentPlayer, canCurrentPlayerAct, calculateContextModifiers } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Items from './items.js?cb=014';
import * as API from './api_new.js?cb=014'; // May not be needed if all calls go through aiHandler
import { generateId, getRandomElement, getRandomInt, clamp } from './utils.js?cb=014';
// Import aiHandler functions statically
import { makeAICallForSystemAction, processEnhancedAIResponse } from './aiHandler.js?cb=014';
import { localAIOrchestrator } from './localAIOrchestrator.js?cb=014';
// Import turnManager functions statically
import { advanceTurn } from './turnManager.js?cb=014';
// Import encounter system
import { checkAndProcessEncounter } from './encounters.js?cb=014';
// Import game loop
import { processPlayerAction as gameLoopProcessAction } from './gameLoop.js?cb=014';
// Import reputation system
import { calculateChoiceReputationEffects, calculatePriceModifiers, getContextualizedFactions, getTrustDifficultyModifiers } from './reputationContextualizer.js?cb=014';
// Import intelligent compression helpers
import { recordPlayerChoice, recordStoryBeat, recordRelationshipChange, recordWorldStateChange } from './state.js?cb=014';


/**
 * Handles the player selecting one of the AI-generated choices.
 * Identifies the choice's underlying type, applies mechanical consequences based on that type,
 * updates the UI, and then constructs a prompt for the AI based on the *text* chosen.
 * @param {string} actionType - The archetype of the action chosen ('Good', 'Bad', 'Risky', 'Silly', 'Investigative'), retrieved from button's data-action-type.
 * @param {string} choiceText - The actual text of the choice selected by the player, retrieved from button's text content.
 */
/**
 * Handle God Mode custom choice
 * @param {string} customChoice - Player's custom written choice
 */
async function handleGodModeChoice(customChoice) {
    const log = window.displayVisualError || console.log;

    if (!gameState.godModeManager?.isActive && !gameState.allowCustomActions) {
        log("God Mode choice attempted but God Mode is not active");
        return;
    }

    // CONSOLIDATED: route the Execute Divine Will button through the same
    // creative-mode flow as the Custom Action input. Both used to take
    // separate prompt paths (Execute went through godMode.js's
    // processCustomChoice with a generic AI prompt; Custom Action used the
    // diff-engine creative prompt). Now they share the rich god-mode prompt
    // with full authorial-power examples (items, skills, NPCs, bosses,
    // quests, stats, etc.) defined in handleCustomAction.
    try {
        log(`God Mode: Processing custom choice via consolidated handleCustomAction path - ${customChoice.slice(0, 50)}...`);
        // Stage the choice in the customActionInput so handleCustomAction
        // reads the same field it was designed for. Set the gating flag so
        // the entry guard passes regardless of which UI path opened it.
        if (UI.elements?.customActionInput) {
            UI.elements.customActionInput.value = customChoice;
        }
        // Make sure allowCustomActions is true (god mode unlock should have
        // set it, but reaffirm in case of partial state).
        gameState.allowCustomActions = true;
        await handleCustomAction();
        // Record after completion so it doesn't double-record on errors.
        try { recordPlayerChoice(gameState.players[0], 'God Mode', customChoice, 1.0); } catch (_) {}
    } catch (error) {
        log(`God Mode: Error handling custom choice: ${error.message}`);
        UI.showPopup('An error occurred while processing your divine command.', 'error', 3000);
    }
}

// Make handleGodModeChoice available globally for UI
if (typeof window !== 'undefined') {
    window.handleGodModeChoice = handleGodModeChoice;
}

export async function handlePlayerChoice(actionType, choiceText) {
    const log = window.displayVisualError || console.log;
    log(`Handling player choice: ${actionType} - ${choiceText}`);

    try {
        if (gameState.isLoading || !canCurrentPlayerAct()) {
            const reason = gameState.isLoading ? "Game is loading" : "Current player cannot act";
            log(`Action blocked: ${reason}`);
            if (!gameState.isLoading) { UI.showPopup("Cannot act now.", "warning"); }
            return;
        }

        // Show loading indicator and disable choices to prevent multiple clicks
        UI.showLoading(true, 'Processing your choice...');
        if (typeof UI.disableChoices === 'function') {
            UI.disableChoices();
        }

        // Initialize narrative context if it doesn't exist
        if (!gameState.narrativeContext) {
            gameState.narrativeContext = {
                lastAction: null,
                lastOutcome: null,
                discoveredSecrets: [],
                significantEvents: [],
                relationshipChanges: []
            };
        }

        const currentPlayer = getCurrentPlayer();
        if (!currentPlayer) {
            throw new Error("Could not get current player.");
        }

        // Store the action in narrative context
        gameState.narrativeContext.lastAction = {
            type: actionType,
            text: choiceText,
            player: currentPlayer.name,
            turn: gameState.turn
        };

        // Get current context for outcome determination
        const context = determineContext(currentPlayer);
        
        // Declare outcomeSet in the proper scope
        let outcomeSet;
        let success;
        
        // Process the action based on type
        log(`[HPC-DIAG] At branch decision: inCombat=${gameState.inCombat}, combat.isActive=${gameState.combat?.isActive}, enemies=${gameState.enemies?.filter(e=>!e.isDefeated)?.length || 0}, actionType=${actionType}`);
        if (gameState.inCombat) {
            // ===== Combat branch (Phase 0 implementation) =====
            // INSTRUMENTED for smoke #6 — every step logs a [CB-N] marker so
            // we can see the exact line where the recurring Item-in-combat
            // hang happens. Remove these markers once the bug is identified.
            const cbStep = (n, extra) => log(`[CB-${n}] ${actionType} ${extra || ''}`);
            cbStep(1, 'enter combat branch');

            // Master timeout: if the entire combat branch takes >180s, render
            // fallback choices and bail. This is a final safety net beyond
            // the per-step timeouts.
            const COMBAT_BRANCH_DEADLINE = Date.now() + 180000;

            const aliveEnemies = (gameState.enemies || []).filter(e => !e.isDefeated);
            cbStep(2, `aliveEnemies=${aliveEnemies.length}`);
            if (aliveEnemies.length === 0) {
                log("Combat is active but no enemies remain — exiting combat.");
                gameState.inCombat = false;
                if (gameState.combat) gameState.combat.isActive = false;
                UI.renderEnemyCards();
            } else {
                const target = aliveEnemies[0]; // simple targeting; player-pick lands in Phase 1
                let combatLog = '';

                switch (actionType) {
                    case 'Attack': {
                        const r = Combat.executeWeaponAttack(currentPlayer, target);
                        if (r.missed) combatLog = `${currentPlayer.name} swings at ${target.name} and misses.`;
                        else if (r.blocked) combatLog = `${target.name} blocks ${currentPlayer.name}'s strike.`;
                        else combatLog = `${currentPlayer.name} hits ${target.name} for ${r.actualDamage} ${r.element || ''} damage.`;
                        break;
                    }

                    case 'Special': {
                        const move = (currentPlayer.specialMoves || []).find(m => (m.currentCooldown || 0) <= 0);
                        if (!move) {
                            combatLog = `${currentPlayer.name} tries a special move but none are ready.`;
                        } else {
                            // Generic special: 1.5x weapon damage + status if move declares one.
                            const r = Combat.executeWeaponAttack(currentPlayer, target, {
                                baseDamageMultiplier: 1.5,
                                applyStatusEffects: move.mechanics?.statusEffects || []
                            });
                            move.currentCooldown = move.cooldown || 2;
                            const mpCost = move.mpCost || 0;
                            if (mpCost) currentPlayer.mp = Math.max(0, (currentPlayer.mp || 0) - mpCost);
                            combatLog = r.missed
                                ? `${currentPlayer.name} unleashes ${move.name} but misses ${target.name}.`
                                : `${currentPlayer.name} uses ${move.name} on ${target.name} for ${r.actualDamage || 0} damage!`;
                        }
                        break;
                    }

                    case 'Item': {
                        cbStep('3-Item', 'enter Item case');
                        const item = (currentPlayer.inventory || []).find(i => i && i.type === 'Consumable' && (i.quantity == null || i.quantity > 0));
                        cbStep('3-Item', `item=${item?.name || 'NONE'}`);
                        if (!item) {
                            combatLog = `${currentPlayer.name} fumbles for an item but finds nothing usable.`;
                        } else {
                            const heal = item.stats?.heal || 0;
                            const healPct = item.stats?.healPercent || 0;
                            const totalHeal = heal + Math.round((currentPlayer.maxHp || 100) * healPct);
                            if (totalHeal > 0) {
                                const oldHp = currentPlayer.hp;
                                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + totalHeal);
                                combatLog = `${currentPlayer.name} uses ${item.name}, restoring ${currentPlayer.hp - oldHp} HP.`;
                            } else {
                                combatLog = `${currentPlayer.name} uses ${item.name}.`;
                            }
                            // Decrement / remove
                            if (item.quantity != null) {
                                item.quantity = Math.max(0, item.quantity - 1);
                                if (item.quantity === 0) {
                                    currentPlayer.inventory = currentPlayer.inventory.filter(i => i.id !== item.id);
                                }
                            } else {
                                currentPlayer.inventory = currentPlayer.inventory.filter(i => i.id !== item.id);
                            }
                        }
                        cbStep('3-Item', 'done');
                        break;
                    }

                    case 'Run': {
                        const fled = Math.random() < (Config.FLEE_CHANCE ?? 0.4);
                        if (fled) {
                            combatLog = `${currentPlayer.name} successfully escapes from combat.`;
                            gameState.inCombat = false;
                            if (gameState.combat) gameState.combat.isActive = false;
                            gameState.enemies = [];
                            UI.renderEnemyCards();
                        } else {
                            combatLog = `${currentPlayer.name} tries to flee but stumbles, losing the moment.`;
                        }
                        break;
                    }

                    default:
                        combatLog = `${currentPlayer.name} acts: ${choiceText}.`;
                }

                cbStep(4, 'switch done, calling showPopup + combat log');
                try { UI.showPopup(combatLog, 'combat', 4000); } catch(e) { cbStep(4, `showPopup THREW: ${e?.message}`); }
                // P4: stream mechanical event to in-game combat log strip
                try {
                    const kind = actionType === 'Attack' || actionType === 'Special' ? 'attack'
                        : actionType === 'Item' ? 'item'
                        : actionType === 'Run' ? 'flee'
                        : 'system';
                    if (typeof UI.appendCombatLog === 'function') UI.appendCombatLog(combatLog, kind);
                } catch (_) {}
                cbStep(5, 'showPopup ok, renderPlayerCards');
                try { UI.renderPlayerCards(); } catch(e) { cbStep(5, `renderPlayerCards THREW: ${e?.message}`); }
                cbStep(6, 'renderPlayerCards ok, renderEnemyCards');
                try { UI.renderEnemyCards(); } catch(e) { cbStep(6, `renderEnemyCards THREW: ${e?.message}`); }
                cbStep(7, `Combat: ${combatLog}`);

                // Resolve win/wipe; otherwise let combat system advance to enemy turn(s).
                if (Combat.areAllEnemiesDefeated()) {
                    cbStep(8, 'all enemies defeated, exiting combat');
                    gameState.inCombat = false;
                    if (gameState.combat) gameState.combat.isActive = false;
                } else if (Combat.isPartyWiped()) {
                    cbStep(8, 'party wiped, deferring to turn manager');
                } else if (gameState.inCombat) {
                    cbStep(8, 'calling advanceCombatTurn (15s timeout)');
                    try {
                        await Promise.race([
                            Combat.advanceCombatTurn(),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('advanceCombatTurn timed out (15s)')), 15000))
                        ]);
                        cbStep(9, 'advanceCombatTurn returned ok');
                    } catch (e) {
                        cbStep(9, `advanceCombatTurn caught: ${e?.message || e}`);
                    }
                }
                cbStep(10, `building combatActionLog (deadline left: ${COMBAT_BRANCH_DEADLINE - Date.now()}ms)`);

                // Ask the narrator to dramatize the round and give the next choices.
                const enemiesAfter = (gameState.enemies || []).filter(e => !e.isDefeated);
                const combatActionLog = `[Combat Round]
Player: ${currentPlayer.name} (HP ${currentPlayer.hp}/${currentPlayer.maxHp}, MP ${currentPlayer.mp || 0}/${currentPlayer.maxMp || 0})
Action chosen: ${actionType} — "${choiceText}"
Mechanical outcome: ${combatLog}
Active enemies: ${enemiesAfter.map(e => `${e.name} (HP ${e.hp}/${e.maxHp})`).join(', ') || 'None — combat ended.'}
Combat status: ${gameState.inCombat ? 'Ongoing' : 'Ended'}

Narrate this combat round in vivid second-person voice. Then provide ${gameState.inCombat ? '4 combat choices (Attack/Special/Item/Run)' : '5 exploration choices (Good/Bad/Risky/Silly/Investigative)'} as JSON.`;

                cbStep(11, 'showLoading + AI call');
                UI.showLoading(true, 'Combat unfolding...');
                let renderedChoices = false;
                const callWithTimeout = (p, ms = 90000) => Promise.race([
                    p,
                    new Promise((_, rej) => setTimeout(() => rej(new Error(`combat AI call timed out after ${ms}ms`)), ms))
                ]);
                try {
                    const aiResponse = await callWithTimeout(makeAICallForSystemAction(combatActionLog, true));
                    cbStep(12, `AI call returned, choices=${aiResponse?.choices?.length || 0}`);
                    const choices = aiResponse?.choices;
                    if (Array.isArray(choices) && choices.length > 0) {
                        UI.renderChoices(choices);
                        renderedChoices = true;
                        cbStep(13, 'rendered AI choices');
                    }
                } catch (e) {
                    cbStep(12, `AI call caught: ${e?.message || e}`);
                } finally {
                    UI.showLoading(false);
                    cbStep('11-finally', 'showLoading(false)');
                }
                // SMOKE-FIX: never leave the player with no choices. If the
                // narrator call failed, timed out, or returned an empty list,
                // fall back to generic mode-appropriate choices so the loop
                // can continue.
                if (!renderedChoices) {
                    const fallback = gameState.inCombat
                        ? [
                            { type: 'Attack',  text: 'Press the attack — strike again.' },
                            { type: 'Special', text: 'Try a special move if one is ready.' },
                            { type: 'Item',    text: 'Use an item from your pack.' },
                            { type: 'Run',     text: 'Try to break off and flee.' }
                        ]
                        : [
                            { type: 'Good',          text: 'Take stock of your surroundings and plan your next step.' },
                            { type: 'Bad',           text: 'Push forward recklessly without a plan.' },
                            { type: 'Risky',         text: 'Take a calculated gamble.' },
                            { type: 'Silly',         text: 'Try something absurd.' },
                            { type: 'Investigative', text: 'Search the area carefully for clues.' }
                        ];
                    UI.renderChoices(fallback);
                    cbStep(14, `rendered ${fallback.length} fallback choices`);
                }
                document.querySelectorAll('#choicesContainer .choice-btn').forEach(b => { b.disabled = false; });
                cbStep(15, 'force-enabled all buttons; combat branch returning');
            }
            return; // combat branch is fully handled here
        } else {
            // Determine if this action should use enhanced AI processing
            const shouldUseEnhanced = shouldUseEnhancedProcessing(actionType, choiceText, context);
            
            if (shouldUseEnhanced) {
                // Use enhanced multi-agent processing for complex actions —
                // wrapped in a hard timeout so the legacy multi-agent path
                // can't deadlock the UI. If it times out, we fall through
                // to the standard processing below as a recovery.
                const enhancedTimeoutMs = 90000;
                try {
                    return await Promise.race([
                        handleEnhancedAction(actionType, choiceText, context, currentPlayer),
                        new Promise((_, rej) => setTimeout(() => rej(new Error(`handleEnhancedAction timed out after ${enhancedTimeoutMs}ms`)), enhancedTimeoutMs))
                    ]);
                } catch (e) {
                    log(`Enhanced action path failed (${e?.message || e}) — falling back to standard processing.`);
                    // Fall through to standard processing below
                }
            }
            
            // Handle exploration/story action with standard processing
            outcomeSet = determineActionOutcomes(actionType, context);
            if (!outcomeSet || !outcomeSet.outcomes) {
                throw new Error(`Failed to determine outcomes for action type: ${actionType}`);
            }
            
            success = determineActionSuccess(outcomeSet.successChance);
            
            // Store outcome in narrative context
            gameState.narrativeContext.lastOutcome = {
                success,
                effects: outcomeSet,
                context: context
            };

            // Apply physical outcomes
            if (outcomeSet.outcomes.physical) {
                if (outcomeSet.outcomes.physical.hpChange) {
                    const [min, max] = outcomeSet.outcomes.physical.hpChange;
                    const hpChange = getRandomInt(min, max);
                    if (hpChange !== 0) {
                        currentPlayer.hp = clamp(
                            currentPlayer.hp + hpChange,
                            0,
                            currentPlayer.maxHp
                        );
                        if (hpChange < 0) {
                            UI.showPopup(`Lost ${Math.abs(hpChange)} HP!`, 'damage');
                        } else {
                            UI.showPopup(`Gained ${hpChange} HP!`, 'heal');
                        }
                    }
                }
            }

            // Apply resource outcomes
            if (outcomeSet.outcomes.resource) {
                if (outcomeSet.outcomes.resource.coinChange) {
                    const [min, max] = outcomeSet.outcomes.resource.coinChange;
                    const coinChange = getRandomInt(min, max);
                    if (coinChange !== 0) {
                        currentPlayer.coins = Math.max(0, (currentPlayer.coins || 0) + coinChange);
                        if (coinChange > 0) {
                            UI.showPopup(`Found ${coinChange} coins!`, 'success');
                        } else if (coinChange < 0) {
                            UI.showPopup(`Lost ${Math.abs(coinChange)} coins!`, 'warning');
                        }
                    }
                }

                // Handle item drops
                if (outcomeSet.outcomes.resource.itemChance && Math.random() < outcomeSet.outcomes.resource.itemChance) {
                    const tier = getRandomElement(outcomeSet.outcomes.resource.itemOptions.tiers);
                    const type = getRandomElement(outcomeSet.outcomes.resource.itemOptions.types);
                    const newItem = Items.generateThemedItem(gameState.adventureTheme, tier, type);
                    if (newItem) {
                        currentPlayer.inventory.push(newItem);
                        UI.showPopup(`Found ${newItem.name}!`, 'item');
                        // Track significant item finds
                        if (newItem.rarity === 'Rare' || newItem.rarity === 'Legendary') {
                            gameState.narrativeContext.significantEvents.push({
                                type: 'itemFound',
                                item: newItem.name,
                                turn: gameState.turn
                            });
                        }
                    }
                }
            }

            // Apply reputation outcomes (NEW FACTION SYSTEM)
            if (outcomeSet.outcomes.reputation) {
                await applyReputationChanges(outcomeSet.outcomes.reputation, actionType, choiceText);
            }

            // Apply narrative outcomes
            if (outcomeSet.outcomes.narrative) {
                if (outcomeSet.outcomes.narrative.reputationChange) {
                    const [min, max] = outcomeSet.outcomes.narrative.reputationChange;
                    const repChange = getRandomInt(min, max);
                    if (repChange !== 0) {
                        currentPlayer.reputation = (currentPlayer.reputation || 0) + repChange;
                        // Track significant reputation changes
                        if (Math.abs(repChange) >= 2) {
                            gameState.narrativeContext.relationshipChanges.push({
                                type: 'reputation',
                                change: repChange,
                                turn: gameState.turn
                            });
                        }
                    }
                }

                // Handle information gain
                if (outcomeSet.outcomes.narrative.informationGain) {
                    gameState.narrativeContext.discoveredSecrets.push({
                        action: choiceText,
                        turn: gameState.turn
                    });
                }

                // Handle special ability gain
                if (outcomeSet.outcomes.narrative.specialAbility) {
                    const newAbility = {
                        name: outcomeSet.outcomes.narrative.specialAbility.name,
                        effect: outcomeSet.outcomes.narrative.specialAbility.effect,
                        usageContext: outcomeSet.outcomes.narrative.specialAbility.usageContext || 'both',
                        mechanics: outcomeSet.outcomes.narrative.specialAbility.mechanics || {}
                    };
                    addSpecialMove(newAbility);
                }
            }
        }

        // Update UI
        UI.renderPlayerCards();
        UI.updateContextHeaders();

        // Record player choice for intelligent compression
        const choiceSignificance = calculateChoiceSignificance(actionType, outcomeSet);
        recordPlayerChoice(currentPlayer.id, actionType, choiceText, gameState.narrativeContext.lastOutcome, choiceSignificance);
        
        // Record story beat if significant
        if (choiceSignificance >= 0.7) {
            recordStoryBeat('player_choice', `${currentPlayer.name} chose: ${choiceText}`, choiceSignificance, [currentPlayer.id]);
        }
        
        // Analyze character development impact
        if (gameState.characterDevelopmentAgent) {
            try {
                const choiceData = {
                    id: generateId('choice'),
                    type: actionType,
                    text: choiceText,
                    outcome: gameState.narrativeContext.lastOutcome,
                    significance: choiceSignificance,
                    turn: gameState.turn,
                    location: gameState.currentLocation?.name
                };
                
                // Async character development analysis (non-blocking)
                gameState.characterDevelopmentAgent.analyzeCharacterDevelopment(currentPlayer.id, choiceData)
                    .then(developmentResult => {
                        if (developmentResult?.narrativeInsights) {
                            log(`Character development: ${currentPlayer.name} - ${JSON.stringify(developmentResult.narrativeInsights)}`);
                        }
                    })
                    .catch(error => {
                        log(`Character development analysis failed: ${error.message}`);
                    });
            } catch (error) {
                log(`Character development integration error: ${error.message}`);
            }
        }
        
        // Check God Mode unlock conditions
        if (gameState.godModeManager) {
            try {
                const unlocked = gameState.godModeManager.checkUnlockConditions();
                if (unlocked) {
                    log(`God Mode unlocked after player action!`);
                }
            } catch (error) {
                log(`God Mode unlock check failed: ${error.message}`);
            }
        }
        
        // Analyze world evolution impact
        if (gameState.worldEvolutionAgent) {
            try {
                const evolutionData = {
                    id: generateId('action'),
                    type: actionType,
                    text: choiceText,
                    outcome: gameState.narrativeContext.lastOutcome,
                    significance: choiceSignificance,
                    turn: gameState.turn,
                    location: gameState.currentLocation?.name
                };
                
                // Async world evolution analysis (non-blocking)
                gameState.worldEvolutionAgent.analyzeWorldEvolution(currentPlayer.id, evolutionData)
                    .then(evolutionResult => {
                        if (evolutionResult?.evolutionEvent) {
                            log(`World evolution: ${evolutionResult.evolutionEvent.significance.toFixed(2)} significance - ${evolutionResult.evolutionEvent.immediateConsequences?.consequences?.length || 0} consequences`);
                        }
                    })
                    .catch(error => {
                        log(`World evolution analysis failed: ${error.message}`);
                    });
            } catch (error) {
                log(`World evolution integration error: ${error.message}`);
            }
        }

        // Construct AI Prompt with enhanced context
        const actionLog = `[Action Report: ${actionType} Action]
Player: ${currentPlayer.name}
Action Description: "${choiceText}"
Success: ${gameState.narrativeContext.lastOutcome?.success ? 'Yes' : 'No'}
Current Location: ${gameState.currentLocation?.name || 'Unknown'}
Environment: ${context.environment}
Situation: ${context.situation}

Recent Discoveries: ${gameState.narrativeContext.discoveredSecrets.slice(-2).map(s => s.action).join(', ')}
Significant Events: ${gameState.narrativeContext.significantEvents.slice(-2).map(e => `${e.type}: ${e.item}`).join(', ')}
Relationship Changes: ${gameState.narrativeContext.relationshipChanges.slice(-2).map(r => `${r.type} ${r.change > 0 ? 'improved' : 'worsened'}`).join(', ')}

Previous Narrative:
${gameState.currentNarrative}

Narrate the outcome of this action and provide appropriate choices for what happens next.]`;

        log(`Constructed AI prompt with enhanced context: ${actionLog}`);

        // Process action through game loop (handles encounters, location progression, etc.)
        const gameLoopSuccess = await gameLoopProcessAction(actionType, choiceText);
        if (!gameLoopSuccess) {
            log("Game loop processing failed");
        }

        // ROOT CAUSE FIX (smoke #6 finding):
        // If combat started DURING this exploration turn (narrator emitted
        // /enemies/- + /inCombat:true via the diff engine, OR a legacy
        // encounter spawned), the previous code did `return` without ever
        // rendering new choices. That left the UI with 4 disabled buttons
        // and "Processing your choice..." stuck forever — every smoke #1–6
        // hang was this exact sequence. Now we render combat choices and
        // return to a usable state.
        if (gameState.inCombat) {
            log('Combat started mid-exploration-turn — rendering combat choices.');
            UI.showLoading(false);
            UI.renderChoices([
                { type: 'Attack',  text: 'Strike the nearest enemy.' },
                { type: 'Special', text: 'Use a special ability.' },
                { type: 'Item',    text: 'Use an item from your pack.' },
                { type: 'Run',     text: 'Try to break off and flee.' }
            ]);
            document.querySelectorAll('#choicesContainer .choice-btn').forEach(b => { b.disabled = false; });
            return;
        }

        // Trigger AI for Narrative — wrap with hard 90s timeout so a stalled
        // llama-server can't deadlock the UI.
        UI.showLoading(true, 'Processing choice...');
        const callWithTimeout = (p, ms = 90000) => Promise.race([
            p,
            new Promise((_, rej) => setTimeout(() => rej(new Error(`AI call timed out after ${ms}ms`)), ms))
        ]);
        let aiResponse = null;
        try {
            aiResponse = await callWithTimeout(makeAICallForSystemAction(actionLog, false));
        } catch (e) {
            log(`Exploration AI call failed: ${e?.message || e}`);
        }
        // makeAICallForSystemAction already rendered choices via processAIResponse.
        // Only render here if aiResponse is null (90s timeout fired) to guarantee
        // the UI never hangs.
        if (!aiResponse?.choices || !Array.isArray(aiResponse.choices) || aiResponse.choices.length === 0) {
            log('Rendered fallback exploration choices (timeout or null response).');
            UI.renderChoices([
                { type: 'Good',          text: 'Take stock and plan your next step.' },
                { type: 'Bad',           text: 'Push forward without a plan.' },
                { type: 'Risky',         text: 'Take a calculated gamble.' },
                { type: 'Silly',         text: 'Try something absurd.' },
                { type: 'Investigative', text: 'Search the area carefully.' }
            ]);
        }

    } catch (error) {
        log(`Error in handlePlayerChoice: ${error.message}`);
        UI.showPopup(`Action failed: ${error.message}`, "error");

        // Re-enable choices on error
        if (typeof UI.enableChoices === 'function') {
            UI.enableChoices();
        }

        // Re-render existing choices
        UI.renderChoices();
    } finally {
        // Always hide loading indicator
        UI.showLoading(false);

        // FINAL SAFETY NET — guarantee the UI never hangs.
        // If the choices container is empty OR every button is disabled,
        // render mode-appropriate fallback choices and force-enable them.
        // This catches every code path that could exit handlePlayerChoice
        // without leaving the player a way forward.
        try {
            const container = document.getElementById('choicesContainer');
            const allBtns = container ? container.querySelectorAll('button') : [];
            const enabledBtns = container ? container.querySelectorAll('button:not([disabled])') : [];
            if (allBtns.length === 0 || enabledBtns.length === 0) {
                const fallback = gameState.inCombat
                    ? [
                        { type: 'Attack',  text: 'Strike the nearest enemy.' },
                        { type: 'Special', text: 'Use a special ability.' },
                        { type: 'Item',    text: 'Use an item from your pack.' },
                        { type: 'Run',     text: 'Try to break off and flee.' }
                    ]
                    : [
                        { type: 'Good',          text: 'Take stock and plan your next step.' },
                        { type: 'Bad',           text: 'Push forward without a plan.' },
                        { type: 'Risky',         text: 'Take a calculated gamble.' },
                        { type: 'Silly',         text: 'Try something absurd.' },
                        { type: 'Investigative', text: 'Search the area carefully.' }
                    ];
                UI.renderChoices(fallback);
                document.querySelectorAll('#choicesContainer .choice-btn').forEach(b => { b.disabled = false; });
                log('Final safety net: rendered fallback choices because none were enabled.');
            }
        } catch (_) { /* never throw from a finally */ }
    }
}


/**
 * Calculates the significance of a player choice for compression
 * @param {string} actionType - The type of action taken
 * @param {Object} outcomeSet - The outcome configuration
 * @returns {number} Significance score (0.0 to 1.0)
 */
function calculateChoiceSignificance(actionType, outcomeSet) {
    let significance = 0.3; // Base significance
    
    // Increase significance based on action type
    switch (actionType) {
        case 'Risky':
            significance += 0.2;
            break;
        case 'Bad':
            significance += 0.1;
            break;
        case 'Good':
            significance += 0.1;
            break;
    }
    
    // Increase significance based on outcomes
    if (outcomeSet?.outcomes) {
        const outcomes = outcomeSet.outcomes;
        
        // Combat outcomes are significant
        if (outcomes.combat) {
            significance += 0.2;
        }
        
        // Large HP changes are significant
        if (outcomes.hp && Math.abs(outcomes.hp) >= 10) {
            significance += 0.2;
        }
        
        // Large coin changes are significant
        if (outcomes.coins && Math.abs(outcomes.coins) >= 20) {
            significance += 0.1;
        }
        
        // Narrative outcomes are significant
        if (outcomes.narrative) {
            if (outcomes.narrative.informationGain) significance += 0.2;
            if (outcomes.narrative.specialAbility) significance += 0.3;
            if (outcomes.narrative.reputationChange && Math.abs(outcomes.narrative.reputationChange) >= 2) {
                significance += 0.2;
            }
        }
    }
    
    return Math.min(significance, 1.0);
}

/**
 * Calculates modified outcomes based on context
 * @param {Object} baseOutcome - The base outcome configuration
 * @param {Object} context - The current context
 * @returns {Object} Modified outcome configuration
 */
function calculateModifiedOutcomes(baseOutcome, context) {
    const modified = JSON.parse(JSON.stringify(baseOutcome)); // Deep copy

    // Apply success chance modifiers
    if (context.modifiers?.successChanceMultiplier) {
        modified.successChance *= context.modifiers.successChanceMultiplier;
    }

    // Apply physical modifiers
    if (context.modifiers?.physical) {
        if (context.modifiers.physical.hpChangeMultiplier) {
            if (modified.outcomes.physical?.hpChange) {
                modified.outcomes.physical.hpChange = modified.outcomes.physical.hpChange.map(
                    val => Math.round(val * context.modifiers.physical.hpChangeMultiplier)
                );
            }
        }
    }

    // Apply resource modifiers
    if (context.modifiers?.resource) {
        if (context.modifiers.resource.coinChangeMultiplier) {
            if (modified.outcomes.resource?.coinChange) {
                modified.outcomes.resource.coinChange = modified.outcomes.resource.coinChange.map(
                    val => Math.round(val * context.modifiers.resource.coinChangeMultiplier)
                );
            }
        }
    }

    // Apply narrative modifiers
    if (context.modifiers?.narrative) {
        if (context.modifiers.narrative.reputationMultiplier) {
            if (modified.outcomes.narrative?.reputationChange) {
                modified.outcomes.narrative.reputationChange = modified.outcomes.narrative.reputationChange.map(
                    val => Math.round(val * context.modifiers.narrative.reputationMultiplier)
                );
            }
        }
        if (context.modifiers.narrative.relationshipMultiplier) {
            if (modified.outcomes.narrative?.relationshipChange) {
                modified.outcomes.narrative.relationshipChange = modified.outcomes.narrative.relationshipChange.map(
                    val => Math.round(val * context.modifiers.narrative.relationshipMultiplier)
                );
            }
        }
    }

    return modified;
}

/**
 * Validates and maps action types to ensure compatibility
 * @param {string} actionType - The action type from AI generation
 * @returns {string} Valid action type
 */
function validateAndMapActionType(actionType) {
    const log = window.displayVisualError || console.log;
    
    // Define valid action types
    const validTypes = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative', 'Attack', 'Special', 'Item', 'Run'];
    
    // If already valid, return as-is
    if (validTypes.includes(actionType)) {
        return actionType;
    }
    
    // Define fallback mappings for common AI variations
    const actionMappings = {
        'Explore': 'Investigative',
        'Exploration': 'Investigative', 
        'Search': 'Investigative',
        'Examine': 'Investigative',
        'Investigate': 'Investigative',
        'Look': 'Investigative',
        'Study': 'Investigative',
        'Inspect': 'Investigative',
        'Combat': 'Attack',
        'Fight': 'Attack',
        'Battle': 'Attack',
        'Strike': 'Attack',
        'Hit': 'Attack',
        'Defensive': 'Good',
        'Safe': 'Good',
        'Careful': 'Good',
        'Cautious': 'Good',
        'Dangerous': 'Bad',
        'Reckless': 'Bad',
        'Foolish': 'Bad',
        'Aggressive': 'Bad',
        'Gamble': 'Risky',
        'Chance': 'Risky',
        'Risk': 'Risky',
        'Funny': 'Silly',
        'Humorous': 'Silly',
        'Creative': 'Silly',
        'Weird': 'Silly',
        'Magic': 'Special',
        'Spell': 'Special',
        'Ability': 'Special',
        'Skill': 'Special',
        'Use': 'Item',
        'Consume': 'Item',
        'Drink': 'Item',
        'Eat': 'Item',
        'Escape': 'Run',
        'Flee': 'Run',
        'Retreat': 'Run',
        'Leave': 'Run'
    };
    
    // Check for mapping
    const mappedType = actionMappings[actionType];
    if (mappedType) {
        log(`ActionType: Mapped "${actionType}" -> "${mappedType}"`);
        return mappedType;
    }
    
    // If no mapping found, default to appropriate type based on context
    log(`ActionType: Unknown type "${actionType}", defaulting to "Investigative"`);
    return 'Investigative'; // Safe default for exploration-like actions
}

/**
 * Determines the potential outcomes for an action based on its type and context
 * @param {string} actionType - The type of action ('Good', 'Bad', 'Risky', 'Silly', 'Investigative')
 * @param {Object} context - The current game context
 * @returns {Object} Object containing success chance and potential outcomes
 */
function determineActionOutcomes(actionType, context) {
    // Validate and map action types
    const validActionType = validateAndMapActionType(actionType);
    const baseConfig = Config.ChoiceOutcomeConfig.baseOutcomes[validActionType];
    
    if (!baseConfig) {
        throw new Error(`No outcome configuration for action type: ${validActionType} (original: ${actionType})`);
    }

    const contextMods = calculateContextModifiers(context);
    const outcomes = {
        successChance: baseConfig.successChance,
        outcomes: {
            physical: {},
            resource: {},
            narrative: {}
        }
    };

    // Apply base outcomes
    if (baseConfig.physical) {
        outcomes.outcomes.physical = { ...baseConfig.physical };
        if (contextMods.physical) {
            // Modify HP changes
            if (outcomes.outcomes.physical.hpChange && contextMods.physical.hpMod) {
                outcomes.outcomes.physical.hpChange = outcomes.outcomes.physical.hpChange.map(
                    val => Math.round(val * contextMods.physical.hpMod)
                );
            }
        }
    }

    if (baseConfig.resource) {
        outcomes.outcomes.resource = { ...baseConfig.resource };
        if (contextMods.resource) {
            // Modify coin changes
            if (outcomes.outcomes.resource.coinChange && contextMods.resource.coinMod) {
                outcomes.outcomes.resource.coinChange = outcomes.outcomes.resource.coinChange.map(
                    val => Math.round(val * contextMods.resource.coinMod)
                );
            }
            // Modify item chances
            if (outcomes.outcomes.resource.itemChance && contextMods.resource.itemChanceMod) {
                outcomes.outcomes.resource.itemChance *= contextMods.resource.itemChanceMod;
            }
        }
    }

    if (baseConfig.narrative) {
        outcomes.outcomes.narrative = { ...baseConfig.narrative };
        if (contextMods.narrative) {
            // Modify reputation changes
            if (outcomes.outcomes.narrative.reputationChange && contextMods.narrative.repMod) {
                outcomes.outcomes.narrative.reputationChange = outcomes.outcomes.narrative.reputationChange.map(
                    val => Math.round(val * contextMods.narrative.repMod)
                );
            }
        }

        // Check for special ability gain based on context
        if (context.situation === 'discovery' || context.situation === 'revelation') {
            // Higher chance for special abilities during discoveries
            if (Math.random() < 0.3) { // 30% chance
                outcomes.outcomes.narrative.specialAbility = {
                    name: "Hydrokinesis",
                    effect: "Control and manipulate water currents with newfound Hydrokin abilities",
                    usageContext: "both",
                    mechanics: {
                        damage: 20,
                        statusEffects: ["Drenched"],
                        exploration: {
                            obstacleTypes: ["water", "current"],
                            puzzleBonus: 2,
                            environmentalEffect: "manipulate water currents"
                        }
                    }
                };
            }
        }
    }

    // Apply success chance modifiers
    if (contextMods.successChanceMod) {
        outcomes.successChance = clamp(
            outcomes.successChance * contextMods.successChanceMod,
            0.1,  // Minimum 10% chance
            0.9   // Maximum 90% chance
        );
    }

    return outcomes;
}

/**
 * Determines if an action is successful based on its success chance
 * @param {number} successChance - The probability of success (0-1)
 * @returns {boolean} Whether the action succeeded
 */
function determineActionSuccess(successChance) {
    return Math.random() < successChance;
}

/**
 * Deterministic god-mode intent extractor. Parses the player's free-form
 * declaration and returns an array of JSON-Patch ops the engine should apply
 * BEFORE the narrator turn. The narrator (4B model) doesn't reliably honor
 * declarations like "I have a million gold" — this is the fallback that
 * guarantees the player's authorial power is real.
 *
 * Patterns are intentionally permissive: they surface intent even when the
 * player's phrasing is loose. False positives are bounded by the engine's
 * own validation.
 *
 * @param {string} text - the raw player input
 * @returns {Array} JSON-Patch ops to apply
 */
function extractGodModeDiffOps(text) {
    const ops = [];
    const t = String(text || '');
    const lower = t.toLowerCase();
    const NUMS = { million: 1000000, thousand: 1000, hundred: 100 };

    // --- Coins ---
    // "I have a million gold", "give me 50000 gold", "I now have infinite gold"
    const goldMatch = t.match(/\b(?:i (?:have|gain|get|now have)|give me|grant me)\s+(?:a\s+)?([\d,]+|infinite|million|thousand|hundred|countless|endless)\s*(?:gold|coins?|silver|gp|pieces? of gold)\b/i);
    if (goldMatch) {
        const word = goldMatch[1].toLowerCase().replace(/,/g, '');
        let n = NUMS[word] ?? Number(word);
        if (!Number.isFinite(n) || /infinite|countless|endless/.test(word)) n = 99999;
        n = Math.min(99999, Math.max(0, n));
        ops.push({ op: 'replace', path: '/players/0/coins', value: n });
    }

    // --- New skill / spell / move ---
    // "I learn the Time Stop spell", "I cast Fireball", "I master Shadow Step technique"
    const skillMatch = t.match(/\b[Ii] (?:learn|master|cast|know|gain|acquire|Learn|Master|Cast|Know|Gain|Acquire)\s+(?:the\s+|The\s+)?([A-Z][A-Za-z' ]{1,40}?)\s+(?:spell|skill|move|technique|art|ability|power|Spell|Skill|Move|Technique)\b/);
    if (skillMatch) {
        const name = skillMatch[1].trim();
        const isAttackish = /(strike|blast|nova|fire|frost|shock|smite|bolt|lash|claw|fang|rend)/i.test(name);
        ops.push({
            op: 'add', path: '/players/0/specialMoves/-',
            value: {
                name,
                description: `god-mode skill: ${name}`,
                cooldown: 3, mpCost: 10,
                usageContext: 'both',
                mechanics: isAttackish ? { directDamage: 30 } : {}
            }
        });
    }

    // --- Stat modifications ---
    // "my max HP is now 500", "I gain 50 attack", "set my defense to 80"
    const maxHpMatch = t.match(/\b(?:my\s+)?max(?:imum)?\s*hp\s*(?:is\s+(?:now|set\s+to)|=|to|now|is)\s*(\d{1,5})\b/i)
        || t.match(/\bi (?:have|gain|now have)\s+(\d{1,5})\s+(?:max\s+)?hp\b/i);
    if (maxHpMatch) {
        const n = Math.min(99999, Math.max(1, Number(maxHpMatch[1])));
        ops.push({ op: 'replace', path: '/players/0/maxHp', value: n });
        ops.push({ op: 'replace', path: '/players/0/hp', value: n });
    }
    const atkMatch = t.match(/\b(?:my\s+)?(?:atk|attack(?:\s*power)?|str(?:ength)?)\s*(?:is\s+(?:now|set\s+to)|=|to|now|is)\s*(\d{1,5})\b/i)
        || t.match(/\bi (?:gain|now have)\s+(\d{1,5})\s+(?:atk|attack)\b/i);
    if (atkMatch) {
        const n = Math.min(99999, Math.max(0, Number(atkMatch[1])));
        ops.push({ op: 'replace', path: '/players/0/atk', value: n });
    }
    const defMatch = t.match(/\b(?:my\s+)?(?:def|defense|armor)\s*(?:is\s+(?:now|set\s+to)|=|to|now|is)\s*(\d{1,5})\b/i)
        || t.match(/\bi (?:gain|now have)\s+(\d{1,5})\s+(?:def|defense)\b/i);
    if (defMatch) {
        const n = Math.min(99999, Math.max(0, Number(defMatch[1])));
        ops.push({ op: 'replace', path: '/players/0/def', value: n });
    }

    // --- New item (weapon / armor / consumable / misc) ---
    // "I wield the Singing Sword", "give me the Aegis of Dawn", "I have a Healing Potion of Light"
    // Item match: skip if gold match already fired (gold input shouldn't also create an item).
    const itemMatch = goldMatch ? null : t.match(/\b[Ii] (?:wield|hold|grip|wear|carry|have|gain|acquire|conjure|forge)\s+(?:the\s+|a\s+|an\s+|The\s+|A\s+|An\s+)?([A-Z][A-Za-z' -]{2,50}?)(?=[.,!?:;]|$|\s+(?:that|which|with))/);
    if (itemMatch) {
        const rawName = itemMatch[1].trim();
        const lname = rawName.toLowerCase();
        // Classify by keywords
        let type = 'Misc', stats = {};
        if (/(sword|blade|axe|hammer|spear|bow|staff|dagger|mace|scythe|wand|katana|halberd|glaive|whip|chakram|claw|fist|gauntlet)/i.test(lname)) {
            type = 'Weapon'; stats = { atk: /(legendary|mythic|godslayer|divine|cosmic|eternal)/i.test(lname) ? 60 : 24 };
        } else if (/(armor|plate|mail|shield|helm|robe|cloak|aegis|jerkin|tunic|cuirass|vestment|garb|raiment)/i.test(lname)) {
            type = 'Armor'; stats = { def: /(legendary|mythic|divine|cosmic|eternal)/i.test(lname) ? 50 : 22 };
        } else if (/(potion|elixir|tincture|brew|draught|salve|tonic|philter)/i.test(lname)) {
            type = 'Consumable'; stats = { heal: 30 };
        }
        // P6: pre-compute a deterministic id so we can reference it in a
        // follow-up auto-equip op within the same applyDiff batch. Engine's
        // equipment-replace path requires the item to already be in inventory
        // — which it will be, since ops apply sequentially.
        const itemId = `god_${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
        ops.push({
            op: 'add', path: '/players/0/inventory/-',
            value: {
                id: itemId,
                name: rawName, type, tier: 'Special',
                effect: `god-mode artifact: ${rawName}`,
                stats
            }
        });
        ops.push({
            op: 'add', path: `/entityMemory/items/${rawName}`,
            value: { name: rawName, description: `Created by player in god mode.`, traits: ['god-mode-created'] }
        });
        // P6: auto-equip Weapon/Armor declarations. The verb "wield"/"wear"
        // signals intent — the player isn't just acquiring it, they're using
        // it. Equipment-replace clobbers any existing equipped item so the
        // god-mode artifact takes priority (which is what the player wants
        // when they declare "I now wield the Stardust Blade").
        if (type === 'Weapon') {
            ops.push({ op: 'replace', path: '/players/0/equipment/weapon', value: itemId });
        } else if (type === 'Armor') {
            ops.push({ op: 'replace', path: '/players/0/equipment/armor', value: itemId });
        }
    }

    // --- New NPC / familiar / companion ---
    // "I summon Ember the phoenix", "I befriend Lyra", "I bond with the Dragon named Vex"
    // Match "I summon Ember", "I summon Ember the phoenix", "I summon the Dragon named Vex"
    // Stop the name capture at "as", "to be", or punctuation. Capture optional "the X" descriptor after the name.
    // Capital-only chain captures the proper name. Stops naturally at "the phoenix"
    // (lowercase) or at "as", "to be", punctuation. Case-sensitive on the capture
    // so we don't accidentally swallow "as my familiar" as part of the name.
    const npcMatch = t.match(/\b[Ii] (?:summon|befriend|bond with|conjure|call forth)\s+(?:the\s+|The\s+)?([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)*)(?:\s+(?:the|a|an|named)\s+([A-Za-z'-]+(?:\s+[A-Za-z'-]+){0,4}?))?(?=[.,!?:;]|\s+as\s+|\s+to\s+be|$)/);
    if (npcMatch) {
        const name = (npcMatch[1] || '').trim();
        const kind = (npcMatch[2] || '').trim();
        if (name) {
            ops.push({
                op: 'add', path: `/entityMemory/npcs/${name}`,
                value: {
                    name,
                    description: kind ? `${name}, ${kind}, summoned by god mode` : `${name}, god-mode familiar`,
                    traits: ['familiar', 'loyal'],
                    relationship: 'bonded'
                }
            });
        }
    }

    // --- New boss / enemy summoned to fight ---
    // "I summon X as a boss", "I face the Hollow King", "let the Void Dragon appear to fight"
    // Note: this MUST come AFTER the npc match, since "I summon X as a boss" should
    // be a boss not a familiar. We re-check explicitly here for "as a boss" suffix.
    const bossMatch = t.match(/\b(?:[Ii] (?:face|fight|summon|challenge)|[Ll]et)\s+(?:the\s+|The\s+)?([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)*)\s+(?:as\s+(?:a\s+)?(?:new\s+)?boss|to\s+fight|appear|in\s+combat)\b/);
    if (bossMatch) {
        const name = bossMatch[1].trim();
        const epic = /(king|queen|dragon|god|titan|leviathan|primarch|emperor|colossus|behemoth|wraith)/i.test(name);
        // If the npc match also fired for the same name, we want the boss
        // version (hostile) to win, not the bonded familiar. Strip prior NPC
        // ops for this same name.
        for (let i = ops.length - 1; i >= 0; i--) {
            if (ops[i].path === `/entityMemory/npcs/${name}` && ops[i].value?.relationship === 'bonded') {
                ops.splice(i, 1);
            }
        }
        ops.push({
            op: 'add', path: '/enemies/-',
            value: {
                name,
                hp: epic ? 600 : 300, maxHp: epic ? 600 : 300,
                atk: epic ? 50 : 30, def: epic ? 30 : 18,
                abilities: ['Voidstrike', 'Dread Aura']
            }
        });
        ops.push({ op: 'replace', path: '/inCombat', value: true });
        ops.push({
            op: 'add', path: `/entityMemory/npcs/${name}`,
            value: {
                name,
                description: `${name}, summoned as antagonist via god mode`,
                traits: ['antagonist', epic ? 'epic' : 'foe'],
                relationship: 'hostile'
            }
        });
    }

    // --- New quest declaration ---
    // "I declare a new quest: find the Sun Hearts", "begin a quest to slay the Hollow King"
    const questMatch = t.match(/\b(?:i\s+)?(?:declare|begin|start|create)\s+(?:a\s+)?(?:new\s+)?quest:?\s*(?:to\s+)?(.{6,200}?)(?=[.!?]|$)/i);
    if (questMatch) {
        const goal = questMatch[1].trim().replace(/^to\s+/, '');
        if (goal) {
            ops.push({ op: 'replace', path: '/adventureGoal', value: goal.charAt(0).toUpperCase() + goal.slice(1) });
        }
    }

    // --- God-mode retirement: renounce divinity, begin a new mortal arc ---
    // "I retire from godhood", "I renounce my divine power", "End my god mode",
    // "I am mortal again", "Reset my journey and start a new quest".
    // The player wields god-mode authority to disable god-mode itself.
    // Earned items, skills, stats are KEPT — only the omnipotent UI goes
    // away and a new main-quest arc begins.
    const retireMatch = t.match(/\b(?:i\s+(?:retire|renounce|relinquish|surrender|forsake|abdicate)|i\s+(?:am|become)\s+mortal(?:\s+again)?|end\s+(?:my\s+)?(?:god(?:hood|\s*mode|\s+powers?)?|divinity)|reset\s+(?:my\s+)?(?:journey|adventure|quest))/i);
    if (retireMatch) {
        ops.push({ op: 'replace', path: '/isGoalComplete', value: false });
        ops.push({ op: 'replace', path: '/questProgress/completionPercentage', value: 0 });
        // If the input didn't already specify a new quest goal, seed a
        // generic call-to-adventure so the narrator has something to anchor
        // Act 1 on. Otherwise the questMatch above provided one.
        if (!questMatch) {
            ops.push({
                op: 'replace', path: '/adventureGoal',
                value: 'A new chapter begins. The world has shifted; what calls to you now?'
            });
        }
    }

    return ops;
}

/**
 * Handles the player submitting a custom action after the goal is complete.
 * Triggers AI for narrative progression.
 */
export async function handleCustomAction() {
    const log = window.displayVisualError || console.log; // Use logger
    log("Handling custom action submission...");
    if (!UI.elements.customActionInput || !UI.elements.customActionBtn) {
         log("ERROR: Custom action UI elements not found.");
         return;
    }

    // Check if custom actions are allowed
    if (!gameState.allowCustomActions) {
         log("Custom action blocked: Goal not complete.");
         UI.showPopup("Custom actions only allowed after completing the goal.", "info");
         return;
    }

    // Standard loading/action checks
    if (gameState.isLoading || !canCurrentPlayerAct()) {
          const reason = gameState.isLoading ? "Game is loading" : "Current player cannot act";
          log(`Custom action blocked: ${reason}.`);
          if (!gameState.isLoading) { UI.showPopup("Cannot act now.", "warning"); }
         return;
    }

    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer) {
         log("ERROR: Could not get current player during custom action.");
        return;
    }

    const actionText = UI.elements.customActionInput.value.trim();
    if (!actionText) {
        UI.showPopup('Please enter your custom action.', 'error');
        log("Custom action blocked: Input is empty.");
        return;
    }

    UI.elements.customActionInput.value = ''; // Clear input immediately
    UI.renderChoices([], null); // Clear choice buttons visually

    // Phase 3: anchor the free-form input in existing world entities. We
    // substring-match (case-insensitive) the input against names in
    // entityMemory, surface the hits in the action log so the narrator
    // routes the action through the existing canon. The narrator-as-
    // retriever pattern: cheap, no extra LLM call, falls back to "novel
    // creation" framing when no existing entity matches.
    const inputLower = actionText.toLowerCase();
    const em = gameState.entityMemory || {};
    const matchedNames = [];
    for (const cat of ['npcs', 'locations', 'items']) {
        for (const name of Object.keys(em[cat] || {})) {
            if (inputLower.includes(name.toLowerCase())) matchedNames.push(`${name} (${cat.slice(0, -1)})`);
        }
    }

    const refLine = matchedNames.length > 0
        ? `\nThe input references existing entities: ${matchedNames.join(', ')}. Honor their established traits.`
        : `\nThe input may introduce something new. If so, persist it via diff ops below.`;

    // ===== GOD-MODE DETERMINISTIC INTENT EXTRACTION =====
    // The narrator (Gemma-3n-E4B, 4B params) inconsistently honors god-mode
    // declarations even with rich prompts — it tends to revert to flavor
    // narration. Solution: parse the player's input with regex BEFORE the
    // narrator turn, emit diff ops directly through the engine, and tell
    // the narrator what we already did so it can describe the consequences
    // without needing to invent them. Narrator-as-retriever, not author.
    const preApplied = [];
    if (gameState.isGoalComplete) {
        try {
            const { applyDiff } = await import('./engine.js?cb=014');
            const ops = extractGodModeDiffOps(actionText);
            if (ops.length > 0) {
                const summaries = applyDiff(ops, { strict: false });
                preApplied.push(...summaries);
                log(`God Mode pre-narrator: applied ${summaries.length} deterministic ops from input`);
            }
        } catch (e) {
            log(`God Mode intent extraction failed: ${e?.message || e}`);
        }
    }
    const preAppliedNote = preApplied.length > 0
        ? `\nPRE-APPLIED CHANGES (narrate these as already happening, do not re-emit these ops):\n  • ${preApplied.join('\n  • ')}`
        : '';

    // GOD MODE PROMPT — exhaustive examples for every authorial scenario.
    // The player has finished the main quest and earned the right to reshape
    // the world. Treat their input as canon unless age-tier policy forbids.
    // Every tangible consequence MUST be persisted via diff ops; otherwise
    // the change is just narration and disappears next turn.
    const actionLog = `[CREATIVE MODE — player wields divine authorial power]
Player: ${currentPlayer.name}
Player input: "${actionText}"${refLine}${preAppliedNote}

The player has earned full authorial authority. Honor what they declare.
NARRATE the world's response in vivid second-person voice (200-400 words),
THEN emit diff ops to persist every tangible consequence.

DEFAULTING POLICY when the player is vague:
• Item without stats → assign reasonable stats for the implied power level. A "Singing Sword"
  → {atk:18, effect:"strikes hum a chord that staggers foes for 1 turn"}. A "godslayer" weapon
  → {atk:60, effect:"deals double damage to bosses"}. Use Special tier unless player says otherwise.
• Skill/spell without mechanics → cooldown:3, mpCost:10, plain mechanics. A "Time Stop" spell
  → {cooldown:8, mpCost:30, mechanics:{stunAllEnemies:1}}. A "Heal" spell → {cooldown:2, mpCost:5, mechanics:{healSelf:30}}.
• NPC without details → friendly/neutral relationship, traits=["companion"], description from prose.
• Boss without stats → hp:300-800, atk:30-60, def:20-40 scaled to drama.
• Quantities ("a lot of gold") → 10000. ("infinite") → 99999 (engine cap).

EXAMPLES — copy the diff shapes verbatim:

"I have a million gold."
{"diff":{"ops":[
  {"op":"replace","path":"/players/0/coins","value":99999}
]}}

"Give me a Singing Sword that stuns enemies."
{"diff":{"ops":[
  {"op":"add","path":"/players/0/inventory/-","value":{
    "name":"Singing Sword","type":"Weapon","tier":"Special",
    "effect":"strikes hum a chord that briefly staggers foes",
    "stats":{"atk":24}}},
  {"op":"add","path":"/entityMemory/items/Singing Sword","value":{
    "name":"Singing Sword","description":"a blade that resonates with bound music"}}
]}}

"I'm wearing the Aegis of the Dawn (player did NOT specify stats)."
{"diff":{"ops":[
  {"op":"add","path":"/players/0/inventory/-","value":{
    "name":"Aegis of the Dawn","type":"Armor","tier":"Special",
    "effect":"glows with first-light radiance, repelling shadow",
    "stats":{"def":22}}}
]}}

"I learn the Time Stop spell."
{"diff":{"ops":[
  {"op":"add","path":"/players/0/specialMoves/-","value":{
    "name":"Time Stop","description":"freeze the moment for one turn",
    "cooldown":8,"mpCost":30,"usageContext":"both",
    "mechanics":{"stunAllEnemies":1}}}
]}}

"I summon Ember the phoenix as my familiar."
{"diff":{"ops":[
  {"op":"add","path":"/entityMemory/npcs/Ember","value":{
    "name":"Ember","description":"a phoenix companion, feathers of living flame",
    "traits":["familiar","loyal","fiery"],"relationship":"bonded"}},
  {"op":"add","path":"/players/0/specialMoves/-","value":{
    "name":"Ember's Aid","description":"call Ember to scorch a single foe",
    "cooldown":4,"mpCost":15,"usageContext":"combat",
    "mechanics":{"directDamage":40}}}
]}}

"I increase my max HP to 500 and gain 30 attack."
{"diff":{"ops":[
  {"op":"replace","path":"/players/0/maxHp","value":500},
  {"op":"replace","path":"/players/0/hp","value":500},
  {"op":"replace","path":"/players/0/atk","value":30}
]}}

"I summon the Hollow King as a new boss for me to fight."
{"diff":{"ops":[
  {"op":"add","path":"/enemies/-","value":{
    "name":"The Hollow King","hp":600,"maxHp":600,"atk":45,"def":25,
    "abilities":["Voidstrike","Echoing Curse","Dread Aura"]}},
  {"op":"replace","path":"/inCombat","value":true},
  {"op":"add","path":"/entityMemory/npcs/The Hollow King","value":{
    "name":"The Hollow King","description":"a crowned silhouette where a soul should be",
    "traits":["antagonist","void-touched"],"relationship":"hostile"}}
]}}

"I declare a new quest: find the seven Sun Hearts before winter ends."
{"diff":{"ops":[
  {"op":"replace","path":"/adventureGoal","value":"Find the seven Sun Hearts before winter's end."},
  {"op":"replace","path":"/questProgress/completionPercentage","value":0},
  {"op":"add","path":"/questProgress/milestones/-","value":{
    "name":"new_quest_declared","description":"The Sun Heart quest begins."}}
]}}
(Note: do NOT flip /isGoalComplete back to false — the player keeps god mode.
A new quest in creative mode is its own thing; the original main quest stays
"complete" forever. Just reset completionPercentage and reuse the milestones list.)

"I create a new location: the Crystal Spires of Ashveil."
{"diff":{"ops":[
  {"op":"replace","path":"/currentLocation","value":{
    "name":"Crystal Spires of Ashveil","type":"sanctuary",
    "dangerLevel":0.2,
    "description":"a dawn-lit lattice of singing crystal towers above a sea of ash"}},
  {"op":"add","path":"/entityMemory/locations/Crystal Spires of Ashveil","value":{
    "name":"Crystal Spires of Ashveil","description":"player-summoned sanctuary above the ashlands",
    "traits":["sanctuary","crystal","dawn"]}}
]}}

REFUSAL RULES (rare):
• If the input violates the active age-tier content policy, do NOT carry it out.
  Instead, write a DIEGETIC refusal — the world itself resists, in character —
  with no fourth-wall break, and emit no diff ops for the forbidden change.
• "Anti-fun" requests like "I delete the player" or "the universe ends" — narrate
  the cosmos shrugging it off, no diff ops.

Otherwise: HONOR the player's intent. Persist consequences. They earned this.`;

    log(`Custom action prompt (creative mode${matchedNames.length ? `, refs: ${matchedNames.join(', ')}` : ', novel'}): ${actionText.slice(0, 80)}...`);

    // --- Trigger AI for Narrative ---
    UI.showLoading(true, 'Narrating outcome...');
    try {
        await makeAICallForSystemAction(actionLog, false); // Let turn advance normally after AI response
    } catch (error) {
        log(`CRITICAL ERROR in handleCustomAction: ${error.message}`);
        UI.showPopup(`Custom Action Failed: ${error.message}. The AI could not process your custom action. Please try a different action or restart the local AI server.`, 'error', 8000);
        
        // Re-throw error - no silent failures
        throw new Error(`Custom action processing failed: ${error.message}`);
    } finally {
        UI.showLoading(false);
    }

    log("handleCustomAction finished.");
}

/**
 * Determine if action should use enhanced multi-agent processing
 */
function shouldUseEnhancedProcessing(actionType, choiceText, context) {
    // Use enhanced processing for complex action types
    const complexActionTypes = ['Investigative', 'Social', 'Creative'];
    if (complexActionTypes.includes(actionType)) return true;
    
    // Use enhanced processing for actions that mention multiple elements
    const complexKeywords = [
        'explore', 'investigate', 'search', 'examine', 'discover',
        'talk', 'negotiate', 'persuade', 'convince', 'interact',
        'create', 'build', 'craft', 'make', 'construct',
        'magic', 'spell', 'ability', 'power', 'enchant',
        'quest', 'mission', 'objective', 'goal'
    ];
    
    const textLower = choiceText.toLowerCase();
    const keywordMatches = complexKeywords.filter(keyword => textLower.includes(keyword)).length;
    
    // Use enhanced processing if multiple keywords match
    if (keywordMatches >= 2) return true;
    
    // Use enhanced processing if context suggests complexity
    if (context.needsMultipleAgents || context.useOrchestration) return true;
    
    // Use enhanced processing for quest-related actions
    if (gameState.questProgress && gameState.questProgress.currentPhase !== 'beginning') {
        return true;
    }
    
    return false;
}

/**
 * Handle complex actions using enhanced multi-agent processing
 */
async function handleEnhancedAction(actionType, choiceText, context, currentPlayer) {
    const log = window.displayVisualError || console.log;
    log(`Processing enhanced action: ${actionType} - ${choiceText}`);
    
    try {
        // Determine request type and context for orchestration
        const requestType = determineRequestType(actionType, choiceText);
        const enhancedContext = buildEnhancedContext(actionType, choiceText, context, currentPlayer);
        
        // Use enhanced AI processing with orchestration
        const enhancedResult = await processEnhancedAIResponse(
            `Player ${currentPlayer.name} chooses: ${choiceText}`,
            requestType,
            enhancedContext
        );
        
        // Process the enhanced result
        await processEnhancedResult(enhancedResult, actionType, currentPlayer);
        
        log(`Enhanced action processing completed successfully`);
        
    } catch (error) {
        log(`Enhanced action processing failed: ${error.message}`);
        
        // Graceful degradation to standard processing
        log('Falling back to standard action processing...');
        return await handleStandardAction(actionType, choiceText, context, currentPlayer);
    }
}

/**
 * Determine request type for orchestration based on action
 */
function determineRequestType(actionType, choiceText) {
    const textLower = choiceText.toLowerCase();
    
    // Encounter-related actions
    if (textLower.includes('meet') || textLower.includes('talk') || textLower.includes('npc') || 
        textLower.includes('character') || actionType === 'Social') {
        return 'encounter_creation';
    }
    
    // Location-related actions
    if (textLower.includes('explore') || textLower.includes('go') || textLower.includes('enter') ||
        textLower.includes('location') || textLower.includes('place')) {
        return 'location_creation';
    }
    
    // Quest-related actions
    if (textLower.includes('quest') || textLower.includes('mission') || textLower.includes('objective') ||
        textLower.includes('goal') || actionType === 'Investigative') {
        return 'quest_progression';
    }
    
    // Complex story actions
    if (actionType === 'Creative' || textLower.includes('create') || textLower.includes('magic')) {
        return 'comprehensive_response';
    }
    
    // Default to story generation
    return 'story_generation';
}

/**
 * Build enhanced context for orchestration
 */
function buildEnhancedContext(actionType, choiceText, context, currentPlayer) {
    return {
        ...context,
        actionType,
        choiceText,
        currentPlayer: {
            name: currentPlayer.name,
            level: currentPlayer.level,
            class: currentPlayer.class,
            hp: currentPlayer.hp,
            maxHp: currentPlayer.maxHp,
            mp: currentPlayer.mp,
            maxMp: currentPlayer.maxMp
        },
        includeEncounters: choiceText.toLowerCase().includes('meet') || 
                          choiceText.toLowerCase().includes('talk') ||
                          actionType === 'Social',
        includeItems: choiceText.toLowerCase().includes('find') || 
                     choiceText.toLowerCase().includes('search') ||
                     choiceText.toLowerCase().includes('loot'),
        needsAbilities: choiceText.toLowerCase().includes('magic') || 
                       choiceText.toLowerCase().includes('spell') ||
                       choiceText.toLowerCase().includes('ability'),
        needsLocations: choiceText.toLowerCase().includes('explore') || 
                       choiceText.toLowerCase().includes('go') ||
                       choiceText.toLowerCase().includes('enter'),
        trackProgress: true, // Always track progress for enhanced actions
        useOrchestration: true
    };
}

/**
 * Process enhanced AI result and apply effects
 */
async function processEnhancedResult(enhancedResult, actionType, currentPlayer) {
    const log = window.displayVisualError || console.log;
    
    // Update narrative
    if (enhancedResult.narrative) {
        gameState.currentNarrative = enhancedResult.narrative;
    }
    
    // (Removed dead `AI.processEmbeddedCommands(...)` block. Both the `AI`
    // symbol and the `processEmbeddedCommands` function are undefined in
    // this codebase — the call always threw a ReferenceError on Investigative
    // actions, which was caught here and logged but accomplished nothing.
    // Phase 0 audit P0 #3.)
    
    // Apply any physical effects (simplified for enhanced processing)
    if (enhancedResult.metadata && enhancedResult.metadata.qualityScore > 0.7) {
        // High quality results might grant small bonuses
        const bonusHp = Math.floor(Math.random() * 3);
        if (bonusHp > 0) {
            currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + bonusHp);
            UI.showPopup(`Enhanced action grants ${bonusHp} HP!`, 'healing');
        }
    }
    
    // Update UI with choices
    if (enhancedResult.choices && enhancedResult.choices.length > 0) {
        UI.renderChoices(enhancedResult.choices, null);
    }
    
    // Show metadata if available
    if (enhancedResult.metadata && enhancedResult.metadata.orchestrated) {
        log(`Enhanced processing used ${enhancedResult.metadata.agentContributions?.length || 0} agents`);
        log(`Quality score: ${enhancedResult.metadata.qualityScore?.toFixed(2) || 'unknown'}`);
    }
    
    // Update UI (was UI.updateGameState which doesn't exist; correct name
    // is updateGameUI per ui.js:328. Phase 0 audit P0 #2.)
    UI.updateGameUI();
}

/**
 * Handle standard action processing (fallback)
 */
async function handleStandardAction(actionType, choiceText, context, currentPlayer) {
    const log = window.displayVisualError || console.log;
    log('Processing action with standard method...');
    
    // Use existing standard processing logic
    const outcomeSet = determineActionOutcomes(actionType, context);
    if (!outcomeSet || !outcomeSet.outcomes) {
        throw new Error(`Failed to determine outcomes for action type: ${actionType}`);
    }
    
    const success = determineActionSuccess(outcomeSet.successChance);
    
    // Store outcome in narrative context
    gameState.narrativeContext.lastOutcome = {
        success,
        effects: outcomeSet,
        context: context
    };

    // Apply physical outcomes (existing logic)
    if (outcomeSet.outcomes.physical) {
        if (outcomeSet.outcomes.physical.hpChange) {
            const [min, max] = outcomeSet.outcomes.physical.hpChange;
            const hpChange = getRandomInt(min, max);
            if (hpChange !== 0) {
                currentPlayer.hp = clamp(
                    currentPlayer.hp + hpChange,
                    0,
                    currentPlayer.maxHp
                );
                if (hpChange < 0) {
                    UI.showPopup(`Lost ${Math.abs(hpChange)} HP!`, 'damage');
                } else {
                    UI.showPopup(`Gained ${hpChange} HP!`, 'heal');
                }
            }
        }
    }

    // Apply resource outcomes (existing logic)
    if (outcomeSet.outcomes.resources) {
        if (outcomeSet.outcomes.resources.mpChange) {
            const [min, max] = outcomeSet.outcomes.resources.mpChange;
            const mpChange = getRandomInt(min, max);
            if (mpChange !== 0) {
                currentPlayer.mp = clamp(
                    currentPlayer.mp + mpChange,
                    0,
                    currentPlayer.maxMp
                );
                if (mpChange < 0) {
                    UI.showPopup(`Lost ${Math.abs(mpChange)} MP!`, 'damage');
                } else {
                    UI.showPopup(`Gained ${mpChange} MP!`, 'heal');
                }
            }
        }
    }

    // Trigger AI for narrative continuation
    const actionLog = `${currentPlayer.name} chooses: ${choiceText}`;
    await makeAICallForSystemAction(actionLog, false);
}


/**
 * Uses an item from the current player's inventory.
 * Applies effects, consumes item, and potentially triggers AI or advances turn.
 * (Largely unchanged, logic seems okay based on new structure)
 * @param {string} itemId - The ID of the item to use.
 */
export async function useInventoryItem(itemId) {
     const log = window.displayVisualError || console.log; // Use logger
     log(`Attempting to use item: ${itemId}`);
     if (!canCurrentPlayerAct()) {
          log(`Action blocked: Cannot use item now.`);
          UI.showPopup(`${getCurrentPlayer()?.name || 'Player'} cannot use items now.`, 'warning');
          return;
     }
     const player = getCurrentPlayer();
     if (!player) { log("ERROR: Cannot find player to use item."); return; }

     const itemIndex = player.inventory?.findIndex(i => i && i.id === itemId);
     if (itemIndex === undefined || itemIndex === -1) {
         log(`ERROR: Item ${itemId} not found in player ${player.name} inventory.`);
         UI.showPopup("Item not found in inventory!", 'error');
         return;
     }
     const item = player.inventory[itemIndex];
     log(`Found item: ${item.name} (${item.type})`);

     let consumed = false;
     let requiresAICall = false;
     let actionLog = "";
     let turnAdvanced = false; // Track if turn is advanced *within* this function

     if (item.type === 'Consumable') {
        // Heal Effect (with trust-based penalties)
        if (item.stats?.heal && typeof item.stats.heal === 'number' && item.stats.heal > 0) {
            consumed = true;
            const oldHp = player.hp;
            
            // Apply trust-based healing penalty
            let healAmount = item.stats.heal;
            if (gameState.reputationSystem) {
                const trustModifiers = getTrustDifficultyModifiers(gameState.reputationSystem.factions);
                healAmount = Math.round(healAmount * trustModifiers.healingEfficiency);
                
                if (trustModifiers.healingEfficiency < 1.0) {
                    const penaltyPercent = Math.round((1 - trustModifiers.healingEfficiency) * 100);
                    log(`Healing reduced by ${penaltyPercent}% due to poor reputation (${item.stats.heal} -> ${healAmount})`);
                }
            }
            
            player.hp = clamp(player.hp + healAmount, 0, player.maxHp);
            const actualHeal = player.hp - oldHp;
            actionLog = `${player.name} uses ${item.name}. Result: Restored ${actualHeal} HP.`;
            
            // Show different messages based on trust penalty
            if (gameState.reputationSystem && healAmount < item.stats.heal) {
                const trustLevel = getTrustDifficultyModifiers(gameState.reputationSystem.factions).trustLevel;
                if (actualHeal > 0) {
                    UI.showPopup(`${item.name} restored ${actualHeal} HP (reduced effectiveness due to ${trustLevel} reputation)`, 'healing');
                } else {
                    UI.showPopup(`${player.name} uses ${item.name}, but HP is already full.`, 'info');
                }
            } else {
                if (actualHeal > 0) UI.showPopup(`${item.name} restored ${actualHeal} HP!`, 'healing');
                else UI.showPopup(`${player.name} uses ${item.name}, but HP is already full.`, 'info');
            }
            
            log(actionLog);

             // Check if only simple healing occurred
             const otherStats = Object.keys(item.stats).filter(k => !['heal', 'revive', 'cure', 'healPercent'].includes(k));
             const simpleDescription = !item.effect || /heal|restor|mend/i.test(item.effect); // Basic check
             if (otherStats.length === 0 && simpleDescription) {
                 log("Simple heal item used. Advancing turn.");
                 UI.renderPlayerCards(); // Update UI before advancing
                 await advanceTurn(); // Simple heal advances turn immediately
                 turnAdvanced = true;
             } else {
                 log("Heal item has other effects or complex description. Triggering AI.");
                 requiresAICall = true;
                 actionLog += ` Effect: ${item.effect || 'Various effects.'}`;
             }
         }
         // Revival Effect (Handled by Help Ally)
         else if (item.stats?.revive === true) {
             log("Attempted to 'Use' revival item directly.");
             UI.showPopup(`Use '${item.name}' via the 'Help Ally' action on a downed ally.`, 'info');
             return; // Do not consume or advance turn
         }
         // Status Effect Application (enhanced for new system)
         else if (item.stats?.applyStatus) {
             consumed = true;
             const statusEffects = Array.isArray(item.stats.applyStatus) ? item.stats.applyStatus : [item.stats.applyStatus];
             const appliedEffects = [];
             
             statusEffects.forEach(effectName => {
                 // Try to find the effect in the config first
                 const effectKey = Object.keys(Config.STATUS_EFFECTS).find(key => 
                     Config.STATUS_EFFECTS[key].name === effectName
                 );
                 
                 if (effectKey) {
                     // Use configured status effect
                     Combat.applyConfiguredStatusEffect(player, effectKey, null, {}, `Used ${item.name}`);
                     appliedEffects.push(Config.STATUS_EFFECTS[effectKey].name);
                 } else {
                     // Fallback to old system
                     const duration = item.stats.duration || 3;
                     let effectData = { ...item.stats };
                     delete effectData.applyStatus; delete effectData.duration; delete effectData.heal; delete effectData.revive; delete effectData.cure; delete effectData.healPercent;
                     Combat.applyStatusEffect(player, effectName, duration, effectData, `Used ${item.name}`);
                     appliedEffects.push(effectName);
                 }
             });
             
             actionLog = `${player.name} uses ${item.name}. Result: Affected by ${appliedEffects.join(', ')}.`;
             log(actionLog);
             UI.showPopup(`${player.name} is affected by ${appliedEffects.join(', ')}!`, 'risky');
             requiresAICall = true; // Status effects likely need AI narration
         }
         // Cure Effect
         else if (item.stats?.cure) {
             const cureType = item.stats.cure;
             let curedEffects = [];
             if (player.statusEffects) {
                 player.statusEffects = player.statusEffects.filter(effect => {
                     if (effect && (cureType === 'All' || effect.name === cureType)) {
                         curedEffects.push(effect.name);
                         return false;
                     }
                     return true;
                 });
             }
             actionLog = `${player.name} uses ${item.name}.`;
             if (curedEffects.length > 0) {
                 // Only consume the item if it actually cured something — don't
                 // burn a cure potion when the player has no matching debuff.
                 consumed = true;
                 actionLog += ` Result: Cured ${curedEffects.join(', ')}.`;
                 UI.showPopup(`Cured: ${curedEffects.join(', ')}!`, 'healing');
             } else {
                 actionLog += ` Result: No relevant effects to cure.`;
                 UI.showPopup(`${item.name} had no effect — it was not consumed.`, 'info');
             }
             log(actionLog);

             // Check if only simple cure occurred
             const otherStatsCure = Object.keys(item.stats).filter(k => !['cure', 'revive', 'heal', 'healPercent'].includes(k));
             const simpleCureDesc = !item.effect || /cure|remov|cleanse|purif/i.test(item.effect);
             if (otherStatsCure.length === 0 && simpleCureDesc) {
                 log("Simple cure item used. Advancing turn.");
                 UI.renderPlayerCards(); // Update UI before advancing
                 await advanceTurn();
                 turnAdvanced = true;
             } else {
                 log("Cure item has other effects or complex description. Triggering AI.");
                 requiresAICall = true;
                 actionLog += ` Effect: ${item.effect || 'Various effects.'}`;
             }
         }
         // Other/Generic Consumables
         else {
             consumed = true;
             actionLog = `${player.name} uses ${item.name}. Effect: ${item.effect || 'The effect is uncertain...'}`;
             log(actionLog);
             UI.showPopup(`Used ${item.name}.`, 'info'); // Simple popup for generic items
             requiresAICall = true; // Assume uncertain effects need AI interpretation
         }
     } else {
         log(`Cannot 'Use' a ${item.type}.`);
         UI.showPopup(`Cannot 'Use' a ${item.type}. Try equipping or dropping.`, 'info');
         return; // Do not consume or advance turn
     }

     // Remove Consumed Item
     if (consumed) {
         player.inventory.splice(itemIndex, 1);
         log(`${item.name} removed from inventory.`);
     }

     // Update UI (player cards handled within turn advance or AI call completion)
     if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();

     // Trigger AI or Advance Turn
     if (requiresAICall && actionLog) {
         log("Item use requires AI call for narrative.");
         UI.showLoading(true, 'Narrating item use...');
         try {
             await makeAICallForSystemAction(actionLog, false); // Let AI handle narrative & turn advance
         } catch (error) {
             log(`Error during AI call in useInventoryItem: ${error.message}`);
              UI.renderChoices(); // Re-render fixed choices on failure
         } finally {
             UI.showLoading(false);
              // Close inventory if open after AI call completes (success or fail)
             if (gameState.currentScreen === 'inventoryScreen') {
                 setTimeout(() => { if (gameState.currentScreen === 'inventoryScreen') UI.showScreen('gameScreen'); }, 100);
             }
         }
     } else if (consumed && !turnAdvanced) {
         // Turn was not advanced internally (e.g., for complex heal/cure), but no AI call needed now.
         // This case should be rare now, as complex items trigger AI. If reached, advance turn.
         log("Item consumed, no AI call needed, turn not advanced yet. Advancing now.");
         await advanceTurn();
         turnAdvanced = true; // Mark as advanced
         // Close inventory if open
          if (gameState.currentScreen === 'inventoryScreen') {
              setTimeout(() => { if (gameState.currentScreen === 'inventoryScreen') UI.showScreen('gameScreen'); }, 100);
          }
     } else if (consumed && turnAdvanced) {
         // Turn already advanced internally (simple heal/cure)
         log("Item use completed, turn already advanced.");
          // Close inventory if open
          if (gameState.currentScreen === 'inventoryScreen') {
              setTimeout(() => { if (gameState.currentScreen === 'inventoryScreen') UI.showScreen('gameScreen'); }, 100);
          }
     } else if (!consumed) {
         // Item was not consumed — either a cure potion that had no effect (turn
         // was already advanced inside the cure branch) or a non-consumable that
         // returned early above.
         log("Item use completed without consumption.");
     }

     log("useInventoryItem finished.");
 }


// --- Remaining functions (equip, unequip, drop, buy, special move, help ally) ---
// These functions generally don't involve direct AI choice interaction in the same way.
// Their AI prompts describe the action taken. Reviewing their prompts for clarity is good practice,
// but major structural changes like handlePlayerChoice aren't needed.
// Keep these functions as they are for now, unless specific issues arise.

/** Equips an item for the current player. Does not use a turn. */
export function equipInventoryItem(itemId, slot) {
     const log = window.displayVisualError || console.log; // Use logger
     log(`Attempting to equip item ${itemId} in slot ${slot}`);
     // Phase 2.6: equipment is locked while imprisoned (gear was confiscated).
     if (gameState.imprisoned) {
         log(`Action blocked: Cannot equip while imprisoned.`);
         UI.showPopup(`Your gear was confiscated. Find it during the escape.`, 'warning');
         return;
     }
     // Cannot equip if downed or loading
     if (gameState.isLoading || getCurrentPlayer()?.isDowned) {
           const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
           log(`Action blocked: Cannot equip now (${reason}).`);
           UI.showPopup(`Cannot change equipment now.`, 'warning');
           return;
     }
     const player = getCurrentPlayer();
     if (!player) { log("ERROR: Cannot find player to equip item."); return; }
     const itemIndex = player.inventory?.findIndex(item => item && item.id === itemId);
     if (itemIndex === undefined || itemIndex === -1) {
         log(`ERROR: Item ${itemId} not found in inventory.`);
         UI.showPopup("Item not found!", "error");
         return;
     }
     const itemToEquip = player.inventory[itemIndex];
     if ((slot === 'weapon' && itemToEquip.type !== 'Weapon') || (slot === 'armor' && itemToEquip.type !== 'Armor')) {
         log(`ERROR: Cannot equip ${itemToEquip.name} (${itemToEquip.type}) in ${slot} slot.`);
         UI.showPopup(`Cannot equip a ${itemToEquip.type} in the ${slot} slot.`, 'error');
         return;
     }
      if (player.equipment[slot] === itemId) {
           log(`${itemToEquip.name} is already equipped.`);
           UI.showPopup(`${itemToEquip.name} is already equipped.`, 'info');
           return;
      }
     // Unequip previous item in the slot
     const currentlyEquippedId = player.equipment[slot];
     if (currentlyEquippedId) {
         const currentlyEquippedItem = player.inventory.find(item => item && item.id === currentlyEquippedId);
         if (currentlyEquippedItem) {
             log(`Unequipping previous ${slot}: ${currentlyEquippedItem.name}`);
             currentlyEquippedItem.equippedSlot = null;
         } else { log(`Warning: Previously equipped item ${currentlyEquippedId} in ${slot} slot not found in inventory.`); }
         player.equipment[slot] = null;
     }
     // Equip new item
     player.equipment[slot] = itemId;
     itemToEquip.equippedSlot = slot;
     log(`${itemToEquip.name} equipped in ${slot} slot.`);
     Combat.recalculateCharacterStats(player);
     log(`Stats recalculated. ATK: ${player.atk}, DEF: ${player.def}`);
     UI.showPopup(`${itemToEquip.name} equipped.`, 'success');
     if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
     UI.renderPlayerCards();
     log("equipInventoryItem finished.");
 }

/** Unequips an item from the specified slot for the current player. Does not use a turn. */
export function unequipInventoryItem(slot) {
      const log = window.displayVisualError || console.log; // Use logger
      log(`Attempting to unequip item from slot ${slot}`);
      // Phase 2.6: equipment frozen while imprisoned.
      if (gameState.imprisoned) {
          log(`Action blocked: Cannot unequip while imprisoned.`);
          UI.showPopup(`Your gear was confiscated.`, 'warning');
          return;
      }
      // Cannot unequip if downed or loading
      if (gameState.isLoading || getCurrentPlayer()?.isDowned) {
           const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
           log(`Action blocked: Cannot unequip now (${reason}).`);
           UI.showPopup(`Cannot change equipment now.`, 'warning');
           return;
      }
      const player = getCurrentPlayer();
      if (!player) { log("ERROR: Cannot find player to unequip item."); return; }
      const currentEquippedId = player.equipment[slot];
      if (currentEquippedId) {
           const itemToUnequip = player.inventory?.find(item => item && item.id === currentEquippedId);
           if (itemToUnequip) {
                itemToUnequip.equippedSlot = null;
                player.equipment[slot] = null;
                log(`${itemToUnequip.name} unequipped from ${slot}.`);
                Combat.recalculateCharacterStats(player);
                log(`Stats recalculated. ATK: ${player.atk}, DEF: ${player.def}`);
                UI.showPopup(`${itemToUnequip.name} unequipped.`, 'success');
                if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
                UI.renderPlayerCards();
           } else {
                // Item ID was equipped but item missing from inventory (shouldn't happen ideally)
                log(`Warning: Unequipped item ID ${currentEquippedId} from ${slot} not found in inventory.`);
                player.equipment[slot] = null; // Still clear the slot
                Combat.recalculateCharacterStats(player); // Recalc needed
                UI.showPopup(`Item in ${slot} slot removed (not found in inventory).`, 'warning');
                 if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
                 UI.renderPlayerCards();
           }
      } else {
           log(`Nothing equipped in ${slot} slot.`);
           UI.showPopup("Nothing equipped in that slot.", 'info');
      }
      log("unequipInventoryItem finished.");
 }

/** Shows confirmation modal for dropping an item. Does not use a turn. */
export function confirmDropItem(itemId) {
    const log = window.displayVisualError || console.log; // Use logger
    log(`Requesting confirmation to drop item: ${itemId}`);
    const player = getCurrentPlayer();
    if (!player) { log("ERROR: Cannot find player for confirmDropItem."); return; }
    // Cannot drop if downed or loading
    if (gameState.isLoading || player.isDowned) {
          const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
          log(`Action blocked: Cannot drop item now (${reason}).`);
          UI.showPopup("Cannot drop items now.", "warning");
          return;
    }
    const item = player.inventory?.find(i => i && i.id === itemId);
    if (!item) {
        log(`ERROR: Item ${itemId} not found for confirmDropItem.`);
        UI.showPopup("Item not found!", "error");
        return;
    }
    UI.updateConfirmationModal( 'Confirm Drop', `Are you sure you want to permanently drop ${item.name}? This cannot be undone.` );
    UI.elements.confirmYesBtn.onclick = () => {
        log(`Confirmation received to drop item: ${itemId}`);
        dropInventoryItem(itemId); // Call the actual drop function
        UI.hideModal('confirmationModal');
    };
     UI.elements.confirmNoBtn.onclick = () => { // Make sure No button works
          UI.hideModal('confirmationModal');
     }
    UI.showModal('confirmationModal');
}

/** Drops an item from the current player's inventory. Handles unequipping if needed. Assumes confirmation. Does not use a turn. */
function dropInventoryItem(itemId) {
     const log = window.displayVisualError || console.log; // Make helper function use logger
     const player = getCurrentPlayer();
     if (!player) { log("ERROR: Cannot find player for dropInventoryItem."); return; }
     // Double check cannot drop if downed (should be caught by confirm)
     if (player.isDowned) { log("Drop blocked: Player is downed."); return; }

     const itemIndex = player.inventory?.findIndex(i => i && i.id === itemId);
     if (itemIndex === undefined || itemIndex === -1) {
          log(`ERROR: Item ${itemId} not found for dropInventoryItem.`);
          // Re-render inventory in case state is weird
           if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
          return;
     }
     const itemToDrop = player.inventory[itemIndex];
     log(`Dropping item: ${itemToDrop.name} (ID: ${itemId})`);
     let unequipped = false;

     // Check if equipped and unequip first
     if (itemToDrop.equippedSlot) {
          const slot = itemToDrop.equippedSlot;
          if (player.equipment[slot] === itemId) {
              player.equipment[slot] = null;
               log(` -> Item was equipped in ${slot}, unequipping before drop.`);
              unequipped = true;
          }
          itemToDrop.equippedSlot = null; // Ensure flag is cleared even if slot was already null
     }

     const droppedItemName = itemToDrop.name;
     player.inventory.splice(itemIndex, 1); // Remove from inventory
     UI.showPopup(`${droppedItemName} dropped.`, 'info');

     // If an item was unequipped, recalculate stats and update cards
     if (unequipped) {
        Combat.recalculateCharacterStats(player);
        log(` -> Stats recalculated after unequipping dropped item. ATK: ${player.atk}, DEF: ${player.def}`);
        UI.renderPlayerCards();
     }

     // Always re-render inventory if it's the current screen
     if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
     log("dropInventoryItem finished.");
 }

/** Buys an item from the shop for the current player. Does not use a turn. */
export function buyShopItem(itemData) {
     const log = window.displayVisualError || console.log; // Use logger

     // Calculate reputation-modified price
     const modifiedPrice = calculateItemPrice(itemData);
     log(`Attempting to buy item: ${itemData?.name} (Base: ${itemData?.cost}, Modified: ${modifiedPrice})`);

     // Phase 2.6: no shopping in jail.
     if (gameState.imprisoned) {
         log(`Action blocked: Cannot shop while imprisoned.`);
         UI.showPopup(`Not now — you're locked up.`, 'warning');
         return;
     }
      // Cannot shop if downed or loading
      if (gameState.isLoading || getCurrentPlayer()?.isDowned) {
          const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
          log(`Action blocked: Cannot buy now (${reason}).`);
         UI.showPopup(`Cannot shop now.`, 'warning');
         return;
     }
     const player = getCurrentPlayer();
     if (!player || !itemData || typeof itemData.cost !== 'number' || itemData.cost < 0) {
          log(`ERROR: Buy item failed - invalid player or item data. Player: ${!!player}, Item: ${JSON.stringify(itemData)}`);
          UI.showPopup("Cannot buy item: Invalid data.", 'error');
          return;
     }
     if (player.coins >= modifiedPrice) {
         const oldCoins = player.coins;
         player.coins -= modifiedPrice;
         log(`Player coins reduced from ${oldCoins} to ${player.coins} (paid ${modifiedPrice} coins)`);
         // Create a new instance for the player's inventory
         const newItem = { ...itemData, id: generateId('item'), equippedSlot: null };
         delete newItem.cost; // Remove cost from player inventory version
         if (newItem.type === 'Consumable' && newItem.quantity === undefined) { newItem.quantity = 1; }
         if (!player.inventory) player.inventory = [];
         player.inventory.push(newItem);
         log(`Added new item instance to inventory: ${newItem.name} (New ID: ${newItem.id})`);
         UI.showPopup(`Bought ${newItem.name}!`, 'success');
         // Update UI
         UI.renderShop(); // Re-render shop to potentially show updated affordability
         UI.renderPlayerCards(); // Update player card for coins
         UI.updateContextHeaders(); // Update header coins
         if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory(); // Update inv if open
     } else {
         log(`Buy item failed: Not enough coins. Need ${modifiedPrice}, have ${player.coins}`);
         const discount = modifiedPrice < itemData.cost ? ` (${Math.round((1 - modifiedPrice/itemData.cost) * 100)}% discount!)` : '';
         const markup = modifiedPrice > itemData.cost ? ` (${Math.round((modifiedPrice/itemData.cost - 1) * 100)}% markup)` : '';
         UI.showPopup(`Not enough coins! Need ${modifiedPrice}${discount}${markup}`, 'error');
     }
      log("buyShopItem finished.");
 }

/** Uses a special move for the current player. Applies cooldown, triggers AI. Uses a turn via AI call. */
export async function useSpecialMove(moveId) {
    const log = window.displayVisualError || console.log;
    log(`Attempting to use special move: ${moveId}`);
    
    if (!canCurrentPlayerAct()) {
        log(`Action blocked: Cannot use special move now.`);
        UI.showPopup(`${getCurrentPlayer()?.name || 'Player'} cannot use special moves now.`, 'warning');
        return;
    }

    const player = getCurrentPlayer();
    if (!player) { 
        log("ERROR: Cannot find player for useSpecialMove."); 
        return; 
    }

    const move = player.specialMoves?.find(m => m && m.id === moveId);
    if (!move) {
        log(`ERROR: Special move ${moveId} not found for player ${player.name}.`);
        UI.showPopup("Special move not found!", "error");
        return;
    }

    // Check if move can be used in current context
    if (gameState.inCombat && move.usageContext === 'exploration') {
        log(`Move ${move.name} cannot be used in combat.`);
        UI.showPopup(`${move.name} cannot be used during combat!`, 'warning');
        return;
    }
    if (!gameState.inCombat && move.usageContext === 'combat') {
        log(`Move ${move.name} cannot be used outside combat.`);
        UI.showPopup(`${move.name} can only be used during combat!`, 'warning');
        return;
    }

    if (move.currentCooldown > 0) {
        log(`Move ${move.name} is on cooldown (${move.currentCooldown} turns remaining).`);
        UI.showPopup(`${move.name} is on cooldown! (${move.currentCooldown} turns left)`, 'warning');
        return;
    }

    // Check MP cost
    const mpCost = move.mpCost || 0;
    if (mpCost > 0 && player.mp < mpCost) {
        log(`Move ${move.name} requires ${mpCost} MP, but player only has ${player.mp} MP.`);
        UI.showPopup(`Not enough MP! ${move.name} costs ${mpCost} MP (you have ${player.mp})`, 'warning');
        return;
    }

    // Apply cooldown and consume MP
    move.currentCooldown = move.cooldown;
    if (mpCost > 0) {
        player.mp -= mpCost;
        log(`${player.name} spent ${mpCost} MP using ${move.name} (${player.mp + mpCost} -> ${player.mp})`);
    }
    log(`Set cooldown for ${move.name} to ${move.cooldown}`);

    // Apply mechanical effects based on context
    let enemyDefeated = false;
    if (gameState.inCombat && move.mechanics) {
        // Combat effects
        if (move.mechanics.damage) {
            const targetEnemy = gameState.enemies.find(e => !e.isDefeated);
            if (targetEnemy) {
                const damage = Math.round(move.mechanics.damage * (1 + (player.atk / 100)));
                targetEnemy.hp = Math.max(0, targetEnemy.hp - damage);
                UI.showPopup(`${move.name} deals ${damage} damage to ${targetEnemy.name}!`, 'damage');
                
                if (targetEnemy.hp <= 0 && !targetEnemy.isDefeated) {
                    enemyDefeated = true;
                    await Combat.handleEnemyDefeat(targetEnemy.id);
                }
            }
        }

        if (move.mechanics.healing) {
            let healing = Math.round(move.mechanics.healing * (1 + (player.def / 100)));
            
            // Apply trust-based healing penalty
            if (gameState.reputationSystem) {
                const trustModifiers = getTrustDifficultyModifiers(gameState.reputationSystem.factions);
                const originalHealing = healing;
                healing = Math.round(healing * trustModifiers.healingEfficiency);
                
                if (healing < originalHealing) {
                    const penaltyPercent = Math.round((1 - trustModifiers.healingEfficiency) * 100);
                    log(`Special move healing reduced by ${penaltyPercent}% due to poor reputation`);
                }
            }
            
            player.hp = Math.min(player.maxHp, player.hp + healing);
            UI.showPopup(`${move.name} restores ${healing} HP!`, 'healing');
        }

        if (move.mechanics.statusEffects) {
            move.mechanics.statusEffects.forEach(effect => {
                const target = gameState.inCombat ? 
                    gameState.enemies.find(e => !e.isDefeated) : 
                    player;
                if (target) {
                    Combat.applyStatusEffect(target, effect, 3, {}, move.name);
                    UI.showPopup(`${target.name} is affected by ${effect}!`, 'status');
                }
            });
        }
    } else if (!gameState.inCombat && move.mechanics?.exploration) {
        // Exploration effects
        if (move.mechanics.exploration.obstacleTypes) {
            // Let AI handle obstacle interaction
            log(`Move ${move.name} can overcome obstacles: ${move.mechanics.exploration.obstacleTypes.join(', ')}`);
        }
        
        if (move.mechanics.exploration.puzzleBonus) {
            // Store puzzle bonus for AI to use
            gameState.currentPuzzleBonus = move.mechanics.exploration.puzzleBonus;
            log(`Applied puzzle bonus: ${move.mechanics.exploration.puzzleBonus}`);
        }

        if (move.mechanics.exploration.environmentalEffect) {
            // Let AI handle environmental effects
            log(`Move ${move.name} affects environment: ${move.mechanics.exploration.environmentalEffect}`);
        }
    }

    UI.showPopup(`${player.name} uses ${move.name}!`, 'skill');

    // Update UI
    if (gameState.currentScreen === 'specialMovesScreen') UI.renderSpecialMoves();
    UI.renderPlayerCards();
    if (gameState.inCombat) UI.renderEnemyCards();

    // If enemy was defeated by the move, don't trigger AI narration
    if (enemyDefeated) {
        log("Enemy defeated by special move, skipping AI narration");
        return;
    }

    // Construct AI prompt with context
    const context = gameState.inCombat ? 'combat' : 'exploration';
    const actionLog = `${player.name} uses the special move: ${move.name}! (Context: ${context}, Effect: ${move.effect})`;
    log(`Sending special move action to AI: ${actionLog}`);

    // Trigger AI
    UI.showLoading(true, 'Narrating special move...');
    try {
        await makeAICallForSystemAction(actionLog, false);
    } catch (error) {
        log(`Error during AI call in useSpecialMove: ${error.message}`);
        move.currentCooldown = 0;
        UI.renderChoices();
    } finally {
        UI.showLoading(false);
        if (gameState.currentScreen === 'specialMovesScreen') {
            setTimeout(() => { 
                if (gameState.currentScreen === 'specialMovesScreen') 
                    UI.showScreen('gameScreen'); 
            }, 100);
        }
    }
    log("useSpecialMove finished.");
}

/** Opens the modal to select an ally to help. UI setup action. Does not use turn. */
export function openHelpAllyModal() {
     const log = window.displayVisualError || console.log; // Use logger
     log("Opening Help Ally modal...");
     const player = getCurrentPlayer();
     if (!player || player.isDowned || gameState.isLoading) {
          const reason = !player ? "No player data" : (player.isDowned ? "Player is downed" : "Game is loading");
          log(`Cannot open Help Ally modal: ${reason}.`);
          UI.showPopup("Cannot help allies now.", 'warning');
          return;
     }
     const downedAllies = gameState.players?.filter(p => p && p.id !== player.id && p.isDowned) || [];
     log(`Downed allies found: ${downedAllies.length > 0 ? downedAllies.map(p => p.name).join(', ') : 'None'}`);
     const revivalItems = player.inventory?.filter(item => item?.stats?.revive === true) || [];
     const revivalItemCount = revivalItems.length;
     let revivalItemName = Config.REVIVAL_ITEM_DEFAULT_NAME;
     try { revivalItemName = Items.themedItemData[gameState.adventureTheme]?.RevivalItemName || Config.REVIVAL_ITEM_DEFAULT_NAME; } catch (e) { log("Error getting themed revival item name, using default.", e); }
     log(`Player has ${revivalItemCount} revival items (${revivalItemName}).`);
     UI.updateHelpAllyModal(downedAllies, revivalItemCount, revivalItemName);
     UI.showModal('helpAllyModal');
 }

/** Initiates the Help Ally action for the current player on a specific target. Consumes item, revives target, advances turn. */
export async function helpAlly(targetPlayerId) {
      const log = window.displayVisualError || console.log; // Use logger
      log(`Attempting to help ally ID: ${targetPlayerId}`);
      if (!canCurrentPlayerAct()) { // Standard action check
           log(`Action blocked: Cannot help ally now.`);
           UI.showPopup("Cannot perform action.", 'warning');
           UI.hideModal('helpAllyModal');
           return;
      }
      const helper = getCurrentPlayer();
      if (!helper) { log("ERROR: Helper player not found."); UI.hideModal('helpAllyModal'); return; } // Added helper check just in case

      const target = gameState.players?.find(p => p && p.id === targetPlayerId);
      const revivalItemIndex = helper.inventory?.findIndex(item => item?.stats?.revive === true);

      // Validate target and item
      if (!target) {
          log(`ERROR: Help Ally failed - Target ally ${targetPlayerId} not found!`);
          UI.showPopup("Target ally not found!", 'error'); UI.hideModal('helpAllyModal'); return;
      }
      if (!target.isDowned) {
           log(`ERROR: Help Ally failed - Target ${target.name} is not downed!`);
           UI.showPopup(`${target.name} is not downed!`, 'error'); UI.hideModal('helpAllyModal'); return;
      }
      if (revivalItemIndex === undefined || revivalItemIndex === -1) {
           log(`ERROR: Help Ally failed - No revival items available for ${helper.name}.`);
           UI.showPopup("No revival items available!", 'error'); UI.hideModal('helpAllyModal'); return;
       }

      // Consume item and revive target
      const revivalItem = helper.inventory.splice(revivalItemIndex, 1)[0]; // Remove item and get it
      log(`Consumed revival item: ${revivalItem.name} from ${helper.name}.`);

      target.isDowned = false;
      let reviveHealAmount = Math.floor(target.maxHp * Config.REVIVE_HP_PERCENT_ITEM); // Default %
      // Check if item overrides default healing amount/percent
      if (typeof revivalItem.stats?.heal === 'number') {
          reviveHealAmount = revivalItem.stats.heal;
          log(`Using item's flat heal value: ${reviveHealAmount}`);
      } else if (typeof revivalItem.stats?.healPercent === 'number') {
          reviveHealAmount = Math.floor(target.maxHp * revivalItem.stats.healPercent);
          log(`Using item's percent heal value: ${revivalItem.stats.healPercent * 100}% -> ${reviveHealAmount}`);
      } else {
          log(`Using default revive heal percent: ${Config.REVIVE_HP_PERCENT_ITEM * 100}% -> ${reviveHealAmount}`);
      }
      target.hp = clamp(reviveHealAmount, 1, target.maxHp); // Ensure at least 1 HP
      target.downedTurns = 0;
      Combat.recalculateCharacterStats(target); // Recalculate in case stats were affected by being downed (if applicable)

      log(`${target.name} revived by ${helper.name} using ${revivalItem.name}. New HP: ${target.hp}`);
      UI.showPopup(`${helper.name} used ${revivalItem.name} to revive ${target.name}!`, 'success');

      // Update UI before advancing turn
      UI.hideModal('helpAllyModal');
      if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory(); // Update helper's inventory if open
      UI.renderPlayerCards(); // Update both players' cards

      // Turn advancement happens AFTER showing popups etc.
      log("Help Ally action complete. Advancing turn.");
      await advanceTurn(); // Uses a turn
      log("helpAlly finished.");
 }

/** Adds a new special move to the current player. */
export function addSpecialMove(moveData) {
    const log = window.displayVisualError || console.log;
    log(`Attempting to add special move: ${moveData.name}`);
    
    const player = getCurrentPlayer();
    if (!player) { 
        log("ERROR: Cannot find player to add special move."); 
        return; 
    }

    // Initialize specialMoves array if it doesn't exist
    if (!player.specialMoves) {
        player.specialMoves = [];
    }

    // Generate unique ID for the move
    const moveId = generateId('move');
    
    // Create the special move object
    const specialMove = {
        id: moveId,
        name: moveData.name,
        effect: moveData.effect,
        usageContext: moveData.usageContext || 'both',
        cooldown: moveData.cooldown || 5,
        currentCooldown: 0,
        mechanics: moveData.mechanics || {}
    };

    // Add the move to player's special moves
    player.specialMoves.push(specialMove);
    log(`Added special move ${specialMove.name} to player ${player.name}`);
    
    // Show feedback
    UI.showPopup(`Learned new ability: ${specialMove.name}!`, 'skill');
    
    // Update UI if on special moves screen
    if (gameState.currentScreen === 'specialMovesScreen') {
        UI.renderSpecialMoves();
    }

    return specialMove;
}

/**
 * Apply reputation changes from choice outcomes
 * @param {Object} reputationChanges - Reputation changes by faction
 * @param {string} actionType - Type of action taken
 * @param {string} choiceText - Text of the choice made
 */
async function applyReputationChanges(reputationChanges, actionType, choiceText) {
    const log = window.displayVisualError || console.log;
    
    if (!gameState.reputationSystem) {
        log('Warning: Reputation system not initialized');
        return;
    }
    
    const factions = gameState.reputationSystem.factions;
    const significantChanges = [];
    let totalAbsoluteChange = 0;
    
    // Apply changes to each faction
    Object.entries(reputationChanges).forEach(([factionKey, changeRange]) => {
        if (!factions.hasOwnProperty(factionKey)) {
            log(`Warning: Unknown faction ${factionKey}`);
            return;
        }
        
        const [min, max] = changeRange;
        const change = getRandomInt(min, max);
        
        if (change !== 0) {
            const oldRep = factions[factionKey];
            factions[factionKey] = clamp(oldRep + change, -100, 100);
            const actualChange = factions[factionKey] - oldRep;
            
            totalAbsoluteChange += Math.abs(actualChange);
            
            // Track significant changes (absolute value >= 2)
            if (Math.abs(actualChange) >= 2) {
                significantChanges.push({
                    faction: factionKey,
                    change: actualChange,
                    oldValue: oldRep,
                    newValue: factions[factionKey]
                });
            }
            
            log(`Reputation change: ${factionKey} ${actualChange > 0 ? '+' : ''}${actualChange} (${oldRep} -> ${factions[factionKey]})`);
        }
    });
    
    // Update reputation history for significant changes
    if (significantChanges.length > 0) {
        gameState.reputationSystem.reputationHistory.push({
            turn: gameState.turn,
            actionType: actionType,
            choiceText: choiceText.substring(0, 50) + (choiceText.length > 50 ? '...' : ''),
            changes: significantChanges,
            timestamp: Date.now()
        });
        
        // Keep only last 20 entries
        if (gameState.reputationSystem.reputationHistory.length > 20) {
            gameState.reputationSystem.reputationHistory.shift();
        }
    }
    
    // Update price modifiers
    gameState.reputationSystem.priceModifiers = calculatePriceModifiers(factions);
    
    // Update last reputation update turn
    gameState.reputationSystem.lastReputationUpdate = gameState.turn;
    
    // Show popup for significant reputation changes
    if (totalAbsoluteChange >= 4) {
        const contextualizedFactions = getContextualizedFactions();
        const majorChanges = significantChanges.filter(c => Math.abs(c.change) >= 3);
        
        if (majorChanges.length > 0) {
            const factionName = contextualizedFactions[majorChanges[0].faction]?.name || majorChanges[0].faction;
            const change = majorChanges[0].change;
            const changeText = change > 0 ? 'improved' : 'worsened';
            
            UI.showPopup(`Your reputation with ${factionName} has ${changeText} significantly!`, 
                        change > 0 ? 'success' : 'warning', 3000);
        }
    }
    
    // Check for faction conflicts and apply penalties
    applyFactionConflicts();
    
    // Update available services based on new reputation
    updateAvailableServices();
    
    log(`Applied reputation changes from ${actionType} choice`);
}

/**
 * Apply faction conflict penalties
 */
function applyFactionConflicts() {
    const factions = gameState.reputationSystem.factions;
    const conflicts = gameState.reputationSystem.factionConflicts;
    
    // Authority vs Shadows conflict
    if (factions.authority > 60 && factions.shadows > 20) {
        const penalty = Math.floor((factions.authority - 60) * 0.1);
        factions.shadows = Math.max(factions.shadows - penalty, -20);
        conflicts.authorityVsShadows = penalty;
    } else if (factions.shadows > 60 && factions.authority > -20) {
        const penalty = Math.floor((factions.shadows - 60) * 0.1);
        factions.authority = Math.max(factions.authority - penalty, -20);
        conflicts.authorityVsShadows = penalty;
    }
    
    // Warriors vs Naturalists conflict (moderate)
    if (factions.warriors > 80 && factions.naturalists > 30) {
        const penalty = Math.floor((factions.warriors - 80) * 0.05);
        factions.naturalists = Math.max(factions.naturalists - penalty, 30);
        conflicts.warriorsVsNaturalists = penalty;
    }
}

/**
 * Update available services based on current reputation
 */
function updateAvailableServices() {
    const factions = gameState.reputationSystem.factions;
    const services = [];
    
    // Check each faction for high reputation services
    Object.entries(factions).forEach(([factionKey, reputation]) => {
        if (reputation >= 60) {
            switch (factionKey) {
                case 'authority':
                    services.push('banking', 'safe_storage', 'political_protection');
                    break;
                case 'warriors':
                    services.push('combat_training', 'equipment_insurance', 'bodyguard');
                    break;
                case 'naturalists':
                    services.push('healing_discount', 'weather_protection', 'animal_companion');
                    break;
                case 'shadows':
                    services.push('information_network', 'black_market', 'stealth_training');
                    break;
                case 'scholars':
                    services.push('item_identification', 'magical_research', 'spell_scrolls');
                    break;
                case 'common':
                    services.push('free_lodging', 'community_support', 'local_information');
                    break;
            }
        }
    });
    
    gameState.reputationSystem.availableServices = services;
}

/**
 * Calculate the actual price of an item based on reputation modifiers
 * @param {Object} itemData - Item data with base cost
 * @returns {number} Modified price based on reputation
 */
export function calculateItemPrice(itemData) {
    if (!itemData || typeof itemData.cost !== 'number') {
        return 0;
    }
    
    if (!gameState.reputationSystem) {
        return itemData.cost; // No reputation system, use base price
    }
    
    // Determine which faction controls this item's market
    const marketFaction = determineItemMarketFaction(itemData);
    const priceModifier = gameState.reputationSystem.priceModifiers[marketFaction] || 1.0;
    
    // Calculate modified price
    const modifiedPrice = Math.max(1, Math.round(itemData.cost * priceModifier));
    
    return modifiedPrice;
}

/**
 * Determine which faction controls the market for this item type
 * @param {Object} itemData - Item data
 * @returns {string} Faction key that controls this market
 */
function determineItemMarketFaction(itemData) {
    if (!itemData.type) return 'common'; // Default to common folk markets
    
    switch (itemData.type) {
        case 'Weapon':
        case 'Armor':
            return 'warriors'; // Warriors control weapon/armor markets
        case 'Consumable':
            // Healing items controlled by naturalists, others by common folk
            if (itemData.stats?.heal || itemData.stats?.healPercent || 
                itemData.name?.toLowerCase().includes('heal') ||
                itemData.name?.toLowerCase().includes('potion')) {
                return 'naturalists';
            }
            return 'common';
        case 'Revival':
            return 'naturalists'; // Druids control revival items
        case 'Quest':
        case 'Misc':
            // Magical items controlled by scholars
            if (itemData.stats?.applyStatus || itemData.tier === 'LEGENDARY' || 
                itemData.tier === 'GOD' || itemData.name?.toLowerCase().includes('magic') ||
                itemData.name?.toLowerCase().includes('spell')) {
                return 'scholars';
            }
            // High-tier items controlled by nobles
            if (itemData.tier === 'SPECIAL' || itemData.tier === 'HIGH') {
                return 'authority';
            }
            return 'common';
        default:
            return 'common';
    }
}