// gameLoop.js
// Central game loop controller that manages game flow, state transitions, and event processing

// --- Module Imports ---
import { gameState, getCurrentPlayer, canCurrentPlayerAct, syncTurnStates } from './state.js?cb=014';
import * as UI from './ui.js?cb=014';
import { advanceTurn } from './turnManager.js?cb=014';
import { advanceCombatTurn } from './combat.js?cb=014';
import { checkAndProcessEncounter } from './encounters.js?cb=014';
import { advanceToNextLocation, getCurrentLocationContext } from './locations.js?cb=014';
import { makeAICallForSystemAction } from './aiHandler.js?cb=014';

/**
 * Central game loop controller
 */
export class GameLoop {
    
    /**
     * Processes a player action and manages the game flow
     * @param {string} actionType - Type of action taken
     * @param {string} actionText - Description of the action
     * @returns {Promise<boolean>} Success status
     */
    static async processPlayerAction(actionType, actionText) {
        const log = window.displayVisualError || console.log;
        log(`GameLoop: Processing player action - ${actionType}: ${actionText}`);
        
        try {
            // Validate player can act
            if (!canCurrentPlayerAct()) {
                log("GameLoop: Player cannot act at this time");
                return false;
            }
            
            // Determine current game mode
            const turnMode = syncTurnStates();
            
            if (turnMode === 'combat') {
                return await this.processCombatAction(actionType, actionText);
            } else {
                return await this.processExplorationAction(actionType, actionText);
            }
            
        } catch (error) {
            log(`GameLoop: Error processing player action: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Processes actions during combat
     * @param {string} actionType - Type of action
     * @param {string} actionText - Action description
     * @returns {Promise<boolean>} Success status
     */
    static async processCombatAction(actionType, actionText) {
        const log = window.displayVisualError || console.log;
        log(`GameLoop: Processing combat action - ${actionType}`);
        
        // Combat actions are handled by the combat system
        // This is a coordination point for future combat enhancements
        
        try {
            // Let combat system handle the action
            // For now, we'll use the existing action handler logic
            // but this is where we'd integrate more sophisticated combat flow
            
            return true;
        } catch (error) {
            log(`GameLoop: Error in combat action: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Processes actions during exploration
     * @param {string} actionType - Type of action
     * @param {string} actionText - Action description
     * @returns {Promise<boolean>} Success status
     */
    static async processExplorationAction(actionType, actionText) {
        const log = window.displayVisualError || console.log;
        log(`GameLoop: Processing exploration action - ${actionType}`);
        
        try {
            // Check for location progression based on action type
            await this.checkLocationProgression(actionType, actionText);

            // A8: When the new engine path is in use (Phase 1+ architecture),
            // the narrator proposes encounters via diff ops (/enemies/-,
            // /inCombat). Running the legacy random-encounter system in
            // parallel races the engine and drifts state (smoke #4 saw 2
            // Stone Guardians spawn from both paths and gs.combat fall out
            // of sync). Skip the legacy check on llama-cpp backend.
            const Config = await import('./config.js?cb=014');
            const usingEngine = Config?.LLM_BACKEND === 'llama-cpp';
            let encounterOccurred = false;
            if (!usingEngine) {
                encounterOccurred = await checkAndProcessEncounter();
            }

            if (encounterOccurred && gameState.inCombat) {
                log("GameLoop: Encounter started combat, switching to combat mode");
                return true;
            }

            // Process exploration-specific effects
            await this.processExplorationEffects(actionType, actionText);
            
            return true;
            
        } catch (error) {
            log(`GameLoop: Error in exploration action: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Checks if the action should trigger location progression
     * @param {string} actionType - Type of action
     * @param {string} actionText - Action description
     */
    static async checkLocationProgression(actionType, actionText) {
        const log = window.displayVisualError || console.log;
        
        // Check if action suggests movement
        const movementKeywords = [
            'move', 'go', 'travel', 'walk', 'run', 'advance', 'proceed', 
            'explore', 'venture', 'journey', 'continue', 'forward'
        ];
        
        const retreatKeywords = [
            'retreat', 'back', 'return', 'flee', 'escape', 'withdraw'
        ];
        
        const actionLower = actionText.toLowerCase();
        
        let shouldProgress = false;
        let direction = 'forward';
        
        // Check for movement indicators
        if (movementKeywords.some(keyword => actionLower.includes(keyword))) {
            shouldProgress = true;
            direction = 'forward';
        } else if (retreatKeywords.some(keyword => actionLower.includes(keyword))) {
            shouldProgress = true;
            direction = 'retreat';
        } else if (actionType === 'Good' && Math.random() < 0.3) {
            // 30% chance good actions lead to progression
            shouldProgress = true;
            direction = 'forward';
        } else if (actionType === 'Investigative' && Math.random() < 0.4) {
            // 40% chance investigative actions lead to discovery of new areas
            shouldProgress = true;
            direction = 'explore';
        }
        
        if (shouldProgress) {
            const newLocation = advanceToNextLocation(direction);
            if (newLocation) {
                log(`GameLoop: Advanced to new location: ${newLocation.name}`);
                
                // Add location change to narrative context
                if (!gameState.narrativeContext.environmentalChanges) {
                    gameState.narrativeContext.environmentalChanges = [];
                }
                
                gameState.narrativeContext.environmentalChanges.push({
                    type: 'location_change',
                    from: gameState.currentLocation?.name || 'Unknown',
                    to: newLocation.name,
                    turn: gameState.turn
                });
                
                UI.showPopup(`Moved to ${newLocation.name}`, 'info', 2000);
            }
        }
    }
    
    /**
     * Processes exploration-specific effects
     * @param {string} actionType - Type of action
     * @param {string} actionText - Action description
     */
    static async processExplorationEffects(actionType, actionText) {
        const log = window.displayVisualError || console.log;
        const currentPlayer = getCurrentPlayer();
        
        if (!currentPlayer) return;
        
        // Process action-specific effects
        switch (actionType) {
            case 'Investigative':
                await this.processInvestigativeAction(currentPlayer, actionText);
                break;
            case 'Risky':
                await this.processRiskyAction(currentPlayer, actionText);
                break;
            case 'Good':
                await this.processGoodAction(currentPlayer, actionText);
                break;
            case 'Bad':
                await this.processBadAction(currentPlayer, actionText);
                break;
            case 'Silly':
                await this.processSillyAction(currentPlayer, actionText);
                break;
        }
    }
    
    /**
     * Processes investigative actions
     * @param {Object} player - Current player
     * @param {string} actionText - Action description
     */
    static async processInvestigativeAction(player, actionText) {
        const log = window.displayVisualError || console.log;
        
        // Investigative actions have a chance to reveal secrets or provide information
        // lgtm[js/insecure-randomness] — game narrative RNG, not a security context
        if (Math.random() < 0.3) {
            const secrets = [
                'hidden passage',
                'ancient inscription',
                'mysterious symbol',
                'secret compartment',
                'forgotten knowledge'
            ];
            // lgtm[js/insecure-randomness] — picking flavor text, not generating tokens/IDs
            const secret = secrets[Math.floor(Math.random() * secrets.length)];
            
            if (!gameState.narrativeContext.discoveredSecrets) {
                gameState.narrativeContext.discoveredSecrets = [];
            }
            
            gameState.narrativeContext.discoveredSecrets.push({
                secret: secret,
                action: actionText,
                location: gameState.currentLocation?.name || 'Unknown',
                turn: gameState.turn
            });
            
            log(`GameLoop: Player discovered: ${secret}`);
        }
    }
    
    /**
     * Processes risky actions
     * @param {Object} player - Current player
     * @param {string} actionText - Action description
     */
    static async processRiskyAction(player, actionText) {
        const log = window.displayVisualError || console.log;
        
        // Risky actions have both positive and negative potential
        const outcome = Math.random();
        
        if (outcome < 0.3) {
            // Negative outcome
            const damage = Math.floor(Math.random() * 10) + 5;
            player.hp = Math.max(0, player.hp - damage);
            UI.showPopup(`Lost ${damage} HP from risky action!`, 'damage');
            log(`GameLoop: Risky action caused ${damage} damage`);
        } else if (outcome > 0.7) {
            // Positive outcome
            const healing = Math.floor(Math.random() * 8) + 2;
            player.hp = Math.min(player.maxHp, player.hp + healing);
            UI.showPopup(`Gained ${healing} HP from bold action!`, 'heal');
            log(`GameLoop: Risky action provided ${healing} healing`);
        }
        // Middle range (0.3-0.7) has neutral outcome
    }
    
    /**
     * Processes good actions
     * @param {Object} player - Current player
     * @param {string} actionText - Action description
     */
    static async processGoodAction(player, actionText) {
        const log = window.displayVisualError || console.log;
        
        // Good actions have a chance for small positive effects
        if (Math.random() < 0.4) {
            const healing = Math.floor(Math.random() * 5) + 1;
            player.hp = Math.min(player.maxHp, player.hp + healing);
            UI.showPopup(`Gained ${healing} HP from good deed!`, 'heal');
            log(`GameLoop: Good action provided ${healing} healing`);
        }
    }
    
    /**
     * Processes bad actions
     * @param {Object} player - Current player
     * @param {string} actionText - Action description
     */
    static async processBadAction(player, actionText) {
        const log = window.displayVisualError || console.log;
        
        // Bad actions have a chance for negative consequences
        if (Math.random() < 0.4) {
            const damage = Math.floor(Math.random() * 8) + 2;
            player.hp = Math.max(0, player.hp - damage);
            UI.showPopup(`Lost ${damage} HP from poor choice!`, 'damage');
            log(`GameLoop: Bad action caused ${damage} damage`);
        }
    }
    
    /**
     * Processes silly actions
     * @param {Object} player - Current player
     * @param {string} actionText - Action description
     */
    static async processSillyAction(player, actionText) {
        const log = window.displayVisualError || console.log;
        
        // Silly actions have random minor effects
        const outcome = Math.random();
        
        if (outcome < 0.2) {
            const coins = Math.floor(Math.random() * 5) + 1;
            player.coins = (player.coins || 0) + coins;
            UI.showPopup(`Found ${coins} coins in an unexpected place!`, 'success');
            log(`GameLoop: Silly action found ${coins} coins`);
        } else if (outcome > 0.8) {
            const damage = Math.floor(Math.random() * 3) + 1;
            player.hp = Math.max(0, player.hp - damage);
            UI.showPopup(`Lost ${damage} HP from silly mishap!`, 'damage');
            log(`GameLoop: Silly action caused ${damage} damage`);
        }
        // Most silly actions have no mechanical effect (just narrative)
    }
    
    /**
     * Checks and processes end-of-turn conditions
     * @returns {Promise<boolean>} True if turn should advance
     */
    static async processEndOfTurn() {
        const log = window.displayVisualError || console.log;
        log("GameLoop: Processing end of turn conditions");
        
        try {
            // Check win conditions
            if (gameState.isGoalComplete) {
                log("GameLoop: Goal completed, enabling custom actions");
                gameState.allowCustomActions = true;
                return false; // Don't advance turn, let player continue
            }
            
            // Check if all players are downed
            const allPlayersDowned = gameState.players.every(p => p.isDowned);
            if (allPlayersDowned) {
                log("GameLoop: All players downed, party wipe condition");
                // Party wipe will be handled by turn manager
                return true;
            }
            
            // Normal turn advancement
            return true;
            
        } catch (error) {
            log(`GameLoop: Error in end of turn processing: ${error.message}`);
            return true; // Default to advancing turn
        }
    }
    
    
    /**
     * Gets current game state summary for debugging
     * @returns {Object} Game state summary
     */
    static getGameStateSummary() {
        return {
            turn: gameState.turn,
            currentPlayer: getCurrentPlayer()?.name || 'None',
            location: gameState.currentLocation?.name || 'Unknown',
            inCombat: gameState.inCombat,
            combatActive: gameState.combat?.isActive || false,
            enemyCount: gameState.enemies?.length || 0,
            goalComplete: gameState.isGoalComplete,
            allowCustomActions: gameState.allowCustomActions
        };
    }
}

/**
 * Convenience function to process a player action through the game loop
 * @param {string} actionType - Type of action
 * @param {string} actionText - Action description
 * @returns {Promise<boolean>} Success status
 */
export async function processPlayerAction(actionType, actionText) {
    return await GameLoop.processPlayerAction(actionType, actionText);
}


/**
 * Convenience function to get game state summary
 * @returns {Object} Game state summary
 */
export function getGameStateSummary() {
    return GameLoop.getGameStateSummary();
}
