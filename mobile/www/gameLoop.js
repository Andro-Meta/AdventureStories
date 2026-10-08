// gameLoop.js
// Central game loop controller that manages game flow, state transitions, and event processing

// --- Module Imports ---
import { gameState, getCurrentPlayer, canCurrentPlayerAct, syncTurnStates } from './state.js';

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
            // Location changes come from the narrator's /currentLocation op.
            // checkLocationProgression substring-matched choice text ("go" in
            // "gold", "run" in "rune") and moved the party before the story
            // was written, even out of jail.

            // Encounters come from the narrator's diff ops (/enemies/-, /inCombat)
            // on every backend now. The legacy random-encounter roll raced the
            // engine and started fights the narrator never heard about, and
            // processExplorationEffects re-rolled the HP/coin outcome that
            // actionHandler had already applied this turn.
            return true;
            
        } catch (error) {
            log(`GameLoop: Error in exploration action: ${error.message}`);
            return false;
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
