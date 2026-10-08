// questProgress.js
// Manages quest progression, milestones, objectives, and player feedback

import { gameState } from './state.js';
import * as UI from './ui.js';

/**
 * Quest Progress Manager - Handles structured progression tracking
 */
export class QuestProgressManager {
    constructor() {
        this.phaseThresholds = {
            beginning: { min: 0, max: 25 },
            exploration: { min: 25, max: 70 },
            climax: { min: 70, max: 90 },
            resolution: { min: 90, max: 100 }
        };
        
        this.milestoneTemplates = {
            'first_encounter': { name: 'First Encounter', description: 'Face your first challenge', weight: 5 },
            'location_discovered': { name: 'New Location', description: 'Discover a significant location', weight: 8 },
            'character_met': { name: 'Important Character', description: 'Meet a key character', weight: 6 },
            'secret_revealed': { name: 'Secret Revealed', description: 'Uncover hidden knowledge', weight: 10 },
            'obstacle_overcome': { name: 'Major Obstacle', description: 'Overcome a significant challenge', weight: 12 },
            'plot_twist': { name: 'Plot Twist', description: 'Experience a major story revelation', weight: 15 },
            'final_confrontation': { name: 'Final Challenge', description: 'Face the ultimate test', weight: 20 },
            'goal_achieved': { name: 'Goal Completed', description: 'Achieve the main objective', weight: 25 }
        };
    }

    /**
     * Initialize quest progress for a new game
     */
    initializeQuestProgress(theme, initialGoal) {
        const log = window.displayVisualError || console.log;

        // Only add a real goal string as an objective — not the placeholder.
        const isRealGoal = initialGoal && initialGoal !== 'Not set yet.';

        gameState.questProgress = {
            currentPhase: 'beginning',
            completionPercentage: 0,
            milestones: [],
            currentObjectives: isRealGoal ? [initialGoal] : [],
            sideQuests: [],
            discoveredSecrets: [],
            keyEvents: [],
            progressHistory: [{
                turn: 1,
                phase: 'beginning',
                percentage: 0,
                event: 'Adventure begins',
                timestamp: Date.now()
            }]
        };

        log(`QuestProgress: Initialized for ${theme} theme. Goal: ${isRealGoal ? initialGoal : '(pending AI generation)'}`);
        this.updateProgressUI();
    }


    /**
     * Add or update current objectives
     */
    updateObjectives(newObjectives, replace = false) {
        const log = window.displayVisualError || console.log;
        
        if (replace) {
            gameState.questProgress.currentObjectives = [...newObjectives];
        } else {
            // Add new objectives that don't already exist
            newObjectives.forEach(obj => {
                if (!gameState.questProgress.currentObjectives.includes(obj)) {
                    gameState.questProgress.currentObjectives.push(obj);
                }
            });
        }
        
        log(`QuestProgress: Updated objectives - ${gameState.questProgress.currentObjectives.length} active`);
        this.updateProgressUI();
    }


    /**
     * Update current phase based on completion percentage
     */
    updateCurrentPhase() {
        const percentage = gameState.questProgress.completionPercentage;
        let newPhase = gameState.questProgress.currentPhase;
        
        for (const [phase, threshold] of Object.entries(this.phaseThresholds)) {
            if (percentage >= threshold.min && percentage < threshold.max) {
                newPhase = phase;
                break;
            }
        }
        
        if (newPhase !== gameState.questProgress.currentPhase) {
            const oldPhase = gameState.questProgress.currentPhase;
            gameState.questProgress.currentPhase = newPhase;
            
            // Add phase transition to history
            gameState.questProgress.progressHistory.push({
                turn: gameState.turn,
                phase: newPhase,
                percentage: percentage,
                event: `Phase transition: ${oldPhase} -> ${newPhase}`,
                timestamp: Date.now()
            });
            
            // ponytail: phase names ("Deep Exploration") are internal; the header
            // already shows the act and next step, so no pop-up for them.
        }
    }

    /**
     * Get display name for phase
     */
    getPhaseDisplayName(phase) {
        const names = {
            beginning: 'The Journey Begins',
            exploration: 'Deep Exploration',
            climax: 'The Climax Approaches',
            resolution: 'Final Resolution'
        };
        return names[phase] || phase;
    }


    /**
     * Update the progress UI elements
     */
    updateProgressUI() {
        // This will be called by the UI update system
        if (typeof UI.updateQuestProgressUI === 'function') {
            UI.updateQuestProgressUI();
        }
    }

    /**
     * Check if quest should be considered complete
     */
    shouldCompleteQuest() {
        const progress = gameState.questProgress;
        
        // Multiple completion criteria
        const criteria = {
            highProgress: progress.completionPercentage >= 95,
            finalMilestone: progress.milestones.some(m => m.type === 'goal_achieved'),
            minimumTurns: gameState.turn >= 30,
            phaseResolution: progress.currentPhase === 'resolution'
        };
        
        // Need at least 2 criteria met
        const metCriteria = Object.values(criteria).filter(Boolean).length;
        return metCriteria >= 2;
    }

}

// Create global instance
export const questProgressManager = new QuestProgressManager();
