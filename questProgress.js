// questProgress.js
// Manages quest progression, milestones, objectives, and player feedback

import { gameState } from './state.js?cb=014';
import * as UI from './ui.js?cb=014';

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
        
        gameState.questProgress = {
            currentPhase: 'beginning',
            completionPercentage: 0,
            milestones: [],
            currentObjectives: [initialGoal],
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
        
        log(`QuestProgress: Initialized for ${theme} theme with goal: ${initialGoal}`);
        this.updateProgressUI();
    }

    /**
     * Add a milestone to the quest progress
     */
    addMilestone(milestoneType, customName = null, customDescription = null) {
        const log = window.displayVisualError || console.log;
        
        const template = this.milestoneTemplates[milestoneType];
        if (!template) {
            log(`QuestProgress: Unknown milestone type: ${milestoneType}`);
            return false;
        }

        const milestone = {
            id: `milestone_${Date.now()}`,
            type: milestoneType,
            name: customName || template.name,
            description: customDescription || template.description,
            weight: template.weight,
            completedTurn: gameState.turn,
            timestamp: Date.now()
        };

        gameState.questProgress.milestones.push(milestone);
        
        // Update completion percentage
        const newPercentage = this.calculateCompletionPercentage();
        const oldPercentage = gameState.questProgress.completionPercentage;
        gameState.questProgress.completionPercentage = newPercentage;
        
        // Check for phase advancement
        this.updateCurrentPhase();
        
        // Add to progress history
        gameState.questProgress.progressHistory.push({
            turn: gameState.turn,
            phase: gameState.questProgress.currentPhase,
            percentage: newPercentage,
            event: `Milestone: ${milestone.name}`,
            timestamp: Date.now()
        });

        // Show progress feedback to player
        const progressGain = newPercentage - oldPercentage;
        UI.showPopup(`Milestone Achieved: ${milestone.name} (+${progressGain}% progress)`, 'success', 4000);
        
        log(`QuestProgress: Added milestone '${milestone.name}' - Progress: ${oldPercentage}% -> ${newPercentage}%`);
        
        this.updateProgressUI();
        return true;
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
     * Complete an objective
     */
    completeObjective(objectiveText) {
        const log = window.displayVisualError || console.log;
        
        const index = gameState.questProgress.currentObjectives.indexOf(objectiveText);
        if (index !== -1) {
            gameState.questProgress.currentObjectives.splice(index, 1);
            
            // Add to key events
            gameState.questProgress.keyEvents.push({
                turn: gameState.turn,
                event: `Objective completed: ${objectiveText}`,
                timestamp: Date.now()
            });
            
            UI.showPopup(`Objective Complete: ${objectiveText}`, 'success', 3000);
            log(`QuestProgress: Completed objective: ${objectiveText}`);
            
            this.updateProgressUI();
            return true;
        }
        
        return false;
    }

    /**
     * Add a side quest
     */
    addSideQuest(name, description, reward = null) {
        const sideQuest = {
            id: `side_${Date.now()}`,
            name,
            description,
            reward,
            status: 'active', // active, completed, failed
            startTurn: gameState.turn,
            timestamp: Date.now()
        };
        
        gameState.questProgress.sideQuests.push(sideQuest);
        UI.showPopup(`New Side Quest: ${name}`, 'info', 3000);
        
        this.updateProgressUI();
        return sideQuest.id;
    }

    /**
     * Complete a side quest
     */
    completeSideQuest(questId) {
        const quest = gameState.questProgress.sideQuests.find(q => q.id === questId);
        if (quest) {
            quest.status = 'completed';
            quest.completedTurn = gameState.turn;
            
            UI.showPopup(`Side Quest Complete: ${quest.name}`, 'legendary', 4000);
            this.updateProgressUI();
            return true;
        }
        return false;
    }

    /**
     * Add discovered secret/lore
     */
    addSecret(secretText, category = 'general') {
        const secret = {
            id: `secret_${Date.now()}`,
            text: secretText,
            category,
            discoveredTurn: gameState.turn,
            timestamp: Date.now()
        };
        
        gameState.questProgress.discoveredSecrets.push(secret);
        UI.showPopup(`Secret Discovered: ${secretText}`, 'rare', 4000);
        
        this.updateProgressUI();
        return secret.id;
    }

    /**
     * Calculate completion percentage based on milestones and progress
     */
    calculateCompletionPercentage() {
        const totalWeight = gameState.questProgress.milestones.reduce((sum, m) => sum + m.weight, 0);
        
        // Base percentage from milestones
        let percentage = Math.min(85, totalWeight); // Cap at 85% from milestones
        
        // Add turn-based progression (slow background progress)
        const turnBonus = Math.min(15, Math.floor(gameState.turn / 5)); // Max 15% from turns
        percentage += turnBonus;
        
        return Math.min(100, Math.max(0, percentage));
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
            
            UI.showPopup(`Story Phase: ${this.getPhaseDisplayName(newPhase)}`, 'legendary', 5000);
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
     * Get progress summary for AI context
     */
    getProgressSummary() {
        const progress = gameState.questProgress;
        return {
            phase: progress.currentPhase,
            percentage: progress.completionPercentage,
            recentMilestones: progress.milestones.slice(-3),
            activeObjectives: progress.currentObjectives,
            activeSideQuests: progress.sideQuests.filter(q => q.status === 'active'),
            secretCount: progress.discoveredSecrets.length,
            keyEventCount: progress.keyEvents.length
        };
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

    /**
     * Generate AI guidance based on current progress
     */
    generateAIGuidance() {
        const progress = gameState.questProgress;
        const guidance = {
            suggestedMilestones: [],
            storyDirection: '',
            urgency: 'normal'
        };
        
        // Suggest milestones based on current phase and progress
        if (progress.currentPhase === 'beginning' && progress.milestones.length < 2) {
            guidance.suggestedMilestones.push('first_encounter', 'location_discovered');
            guidance.storyDirection = 'Focus on world-building and initial challenges';
        } else if (progress.currentPhase === 'exploration' && progress.completionPercentage < 50) {
            guidance.suggestedMilestones.push('character_met', 'secret_revealed', 'obstacle_overcome');
            guidance.storyDirection = 'Develop characters and reveal plot elements';
        } else if (progress.currentPhase === 'climax') {
            guidance.suggestedMilestones.push('plot_twist', 'final_confrontation');
            guidance.storyDirection = 'Build toward the climactic resolution';
            guidance.urgency = 'high';
        } else if (progress.currentPhase === 'resolution') {
            guidance.suggestedMilestones.push('goal_achieved');
            guidance.storyDirection = 'Conclude the adventure and resolve plot threads';
            guidance.urgency = 'critical';
        }
        
        return guidance;
    }
}

// Create global instance
export const questProgressManager = new QuestProgressManager();
