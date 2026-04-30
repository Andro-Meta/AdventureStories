// godMode.js
// God Mode / Creative Mode System
// Unlocks unlimited creative freedom after main questline completion

import { gameState } from './state.js?cb=014';
import { generateId } from './utils.js?cb=014';
import * as UI from './ui.js?cb=014';

/**
 * God Mode Manager - Handles post-game creative freedom
 * Unlocks after main questline completion for unlimited player agency
 */
export class GodModeManager {
    constructor() {
        // God mode state
        this.isUnlocked = false;
        this.isActive = false;
        this.unlockConditions = new Map();
        
        // Creative tools
        this.customChoiceHistory = new Map();
        this.worldManipulations = new Map();
        this.narrativeOverrides = new Map();
        
        // Achievement tracking
        this.godModeAchievements = new Map();
        this.creativeStats = new Map();
        
        this.initializeGodMode();
    }

    /**
     * Initialize God Mode system
     */
    initializeGodMode() {
        const log = window.displayVisualError || console.log;
        
        // Define unlock conditions
        this.unlockConditions.set('main_questline', {
            name: 'Complete Main Questline',
            description: 'Finish the primary adventure storyline',
            completed: false,
            checkFunction: () => this.checkMainQuestlineCompletion()
        });
        
        this.unlockConditions.set('character_development', {
            name: 'Character Mastery',
            description: 'Reach maximum character development',
            completed: false,
            checkFunction: () => this.checkCharacterMastery()
        });
        
        this.unlockConditions.set('world_exploration', {
            name: 'World Explorer',
            description: 'Discover significant portions of the world',
            completed: false,
            checkFunction: () => this.checkWorldExploration()
        });
        
        // Initialize creative stats
        this.creativeStats.set('custom_choices_made', 0);
        this.creativeStats.set('world_changes_made', 0);
        this.creativeStats.set('narrative_rewrites', 0);
        this.creativeStats.set('locations_created', 0);
        this.creativeStats.set('characters_summoned', 0);
        
        log("GodModeManager: Initialized post-game creative system");
    }

    /**
     * Check if God Mode should be unlocked
     * @returns {boolean} Whether God Mode is now available
     */
    checkUnlockConditions() {
        const log = window.displayVisualError || console.log;
        
        if (this.isUnlocked) return true;
        
        // Check all unlock conditions
        let allConditionsMet = true;
        for (const [conditionId, condition] of this.unlockConditions.entries()) {
            const isCompleted = condition.checkFunction();
            condition.completed = isCompleted;
            
            if (!isCompleted) {
                allConditionsMet = false;
            }
        }
        
        if (allConditionsMet && !this.isUnlocked) {
            this.unlockGodMode();
            return true;
        }
        
        return false;
    }

    /**
     * Unlock God Mode with fanfare
     */
    unlockGodMode() {
        const log = window.displayVisualError || console.log;
        
        this.isUnlocked = true;
        
        // Show comprehensive unlock notification with examples
        const unlockMessage = `
<div class="god-mode-unlock-popup">
    <div class="god-mode-unlock-header">
        <div class="god-mode-unlock-icon">⚡</div>
        <h2>🌟 CONGRATULATIONS! 🌟</h2>
        <h3>YOU HAVE UNLOCKED GOD MODE!</h3>
    </div>
    
    <div class="god-mode-unlock-content">
        <p class="unlock-intro">Having completed your epic adventure, you now possess <strong>unlimited creative freedom</strong>!</p>
        
        <div class="god-mode-features">
            <h4>🎮 What You Can Do:</h4>
            <ul>
                <li>✨ <strong>Write Custom Choices:</strong> Type anything you want to do - no limits!</li>
                <li>🌍 <strong>World Manipulation:</strong> Create locations, alter reality, control physics</li>
                <li>📝 <strong>Story Control:</strong> Rewrite events, time travel, alternate timelines</li>
                <li>🎭 <strong>Character Powers:</strong> Transform, gain abilities, become anything</li>
                <li>🗺️ <strong>Infinite Adventures:</strong> Continue playing forever with unlimited scenarios</li>
            </ul>
        </div>
        
        <div class="god-mode-examples">
            <h4>💡 Example God Mode Commands:</h4>
            <div class="examples-grid">
                <div class="example-category">
                    <h5>🏰 World Creation:</h5>
                    <ul>
                        <li>"I create a floating castle made of crystal in the sky"</li>
                        <li>"I summon a wise dragon companion to join my party"</li>
                        <li>"I teleport to a parallel dimension where magic is technology"</li>
                    </ul>
                </div>
                
                <div class="example-category">
                    <h5>🎭 Character Transformation:</h5>
                    <ul>
                        <li>"I transform into a phoenix and soar above the clouds"</li>
                        <li>"I become a powerful wizard with control over time"</li>
                        <li>"I gain the ability to speak with all living creatures"</li>
                    </ul>
                </div>
                
                <div class="example-category">
                    <h5>📚 Story Rewriting:</h5>
                    <ul>
                        <li>"I rewrite history so that I was born with magical powers"</li>
                        <li>"I time travel back to prevent the villain's evil plan"</li>
                        <li>"I create an alternate timeline where dragons rule the world"</li>
                    </ul>
                </div>
                
                <div class="example-category">
                    <h5>⚡ Reality Manipulation:</h5>
                    <ul>
                        <li>"I alter reality so that gravity works backwards here"</li>
                        <li>"I make it so that thoughts become visible as colors"</li>
                        <li>"I create a pocket dimension where time moves slowly"</li>
                    </ul>
                </div>
            </div>
        </div>
        
        <div class="god-mode-instructions">
            <h4>🎯 How to Use God Mode:</h4>
            <ol>
                <li>When God Mode is active, you'll see a <strong>golden input box</strong> above normal choices</li>
                <li>Simply <strong>type anything</strong> you want your character to do</li>
                <li>Press <strong>Enter</strong> or click <strong>"Execute Divine Will"</strong></li>
                <li>Watch as reality bends to your imagination!</li>
                <li>You can still use normal choices or toggle God Mode off anytime</li>
            </ol>
        </div>
        
        <div class="god-mode-finale">
            <p class="finale-text">✨ <em>The only limit is your imagination!</em> ✨</p>
            <p class="finale-subtext">Your adventure is now truly <strong>limitless</strong>!</p>
        </div>
    </div>
</div>
        `;
        
        UI.showPopup(unlockMessage, 'god_mode_unlock', 0, [
            { text: '⚡ Activate God Mode', action: () => this.activateGodMode() },
            { text: 'Continue Normal Play', action: () => {} }
        ]);
        
        log("GodMode: UNLOCKED! Player has achieved creative freedom!");
    }

    /**
     * Activate God Mode
     */
    activateGodMode() {
        const log = window.displayVisualError || console.log;
        
        this.isActive = true;
        
        // Update UI to show God Mode is active
        this.updateGodModeUI();
        
        // Show God Mode tutorial
        this.showGodModeTutorial();
        
        log("GodMode: ACTIVATED! Player now has unlimited creative control");
    }

    /**
     * Deactivate God Mode (return to normal play)
     */
    deactivateGodMode() {
        const log = window.displayVisualError || console.log;
        
        this.isActive = false;
        this.updateGodModeUI();
        
        log("GodMode: Deactivated - returning to normal gameplay");
    }

    /**
     * Process custom player choice in God Mode
     * @param {string} customChoice - Player's custom written choice
     * @returns {Promise<object>} Result of custom choice
     */
    async processCustomChoice(customChoice) {
        const log = window.displayVisualError || console.log;
        
        if (!this.isActive) {
            return { success: false, message: "God Mode is not active" };
        }
        
        try {
            // Record the custom choice
            const choiceId = generateId('god_choice');
            this.customChoiceHistory.set(choiceId, {
                id: choiceId,
                text: customChoice,
                timestamp: Date.now(),
                turn: gameState.turn,
                location: gameState.currentLocation?.name
            });
            
            // Update stats
            this.creativeStats.set('custom_choices_made', 
                (this.creativeStats.get('custom_choices_made') || 0) + 1);
            
            // Analyze the custom choice for special commands
            const analysisResult = this.analyzeCustomChoice(customChoice);
            
            // Process special god mode commands
            if (analysisResult.isSpecialCommand) {
                return await this.processSpecialCommand(analysisResult);
            }
            
            // Generate AI response to custom choice with god mode context
            const aiResponse = await this.generateGodModeResponse(customChoice, analysisResult);
            
            log(`GodMode: Processed custom choice - ${customChoice.slice(0, 50)}...`);
            
            return {
                success: true,
                response: aiResponse,
                isGodMode: true,
                choiceId: choiceId
            };
            
        } catch (error) {
            log(`GodMode: Error processing custom choice: ${error.message}`);
            return { 
                success: false, 
                message: "Failed to process custom choice",
                error: error.message 
            };
        }
    }

    /**
     * Analyze custom choice for special commands
     * @param {string} choice - Custom choice text
     * @returns {object} Analysis result
     */
    analyzeCustomChoice(choice) {
        const lowerChoice = choice.toLowerCase();
        
        // Detect world manipulation commands
        const worldCommands = [
            'create location', 'summon', 'teleport to', 'change weather',
            'spawn item', 'modify world', 'alter reality', 'time travel'
        ];
        
        // Detect narrative commands
        const narrativeCommands = [
            'rewrite', 'change story', 'alter past', 'undo', 'retcon',
            'flashback', 'dream sequence', 'alternate timeline'
        ];
        
        // Detect character commands
        const characterCommands = [
            'become', 'transform into', 'gain power', 'learn skill',
            'level up', 'change class', 'acquire ability'
        ];
        
        const isWorldCommand = worldCommands.some(cmd => lowerChoice.includes(cmd));
        const isNarrativeCommand = narrativeCommands.some(cmd => lowerChoice.includes(cmd));
        const isCharacterCommand = characterCommands.some(cmd => lowerChoice.includes(cmd));
        
        return {
            isSpecialCommand: isWorldCommand || isNarrativeCommand || isCharacterCommand,
            commandType: isWorldCommand ? 'world' : 
                        isNarrativeCommand ? 'narrative' : 
                        isCharacterCommand ? 'character' : 'normal',
            originalText: choice,
            analysis: {
                worldManipulation: isWorldCommand,
                narrativeControl: isNarrativeCommand,
                characterModification: isCharacterCommand
            }
        };
    }

    /**
     * Process special god mode commands
     * @param {object} analysisResult - Command analysis
     * @returns {Promise<object>} Command result
     */
    async processSpecialCommand(analysisResult) {
        const log = window.displayVisualError || console.log;
        
        switch (analysisResult.commandType) {
            case 'world':
                return await this.processWorldCommand(analysisResult);
            case 'narrative':
                return await this.processNarrativeCommand(analysisResult);
            case 'character':
                return await this.processCharacterCommand(analysisResult);
            default:
                return await this.generateGodModeResponse(analysisResult.originalText, analysisResult);
        }
    }

    /**
     * Generate AI response with god mode context
     * @param {string} choice - Custom choice
     * @param {object} analysis - Choice analysis
     * @returns {Promise<string>} AI response
     */
    async generateGodModeResponse(choice, analysis) {
        // For now, return a creative response acknowledging the god mode choice
        // In a full implementation, this would use the AI system with special god mode prompts
        
        const responses = [
            `With your newfound divine power, you ${choice.toLowerCase()}. Reality bends to your will as the world reshapes itself according to your desires.`,
            
            `Your godlike abilities manifest as you ${choice.toLowerCase()}. The very fabric of existence responds to your command, creating new possibilities.`,
            
            `Drawing upon unlimited creative force, you ${choice.toLowerCase()}. The adventure transforms in ways previously unimaginable.`,
            
            `With omnipotent control over this realm, you ${choice.toLowerCase()}. The story becomes whatever you envision it to be.`
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    }

    /**
     * Update UI to show God Mode status
     */
    updateGodModeUI() {
        // Add God Mode indicator to the UI
        const gameHeader = document.querySelector('.game-header');
        if (!gameHeader) return;
        
        // Remove existing god mode indicator
        const existingIndicator = document.querySelector('.god-mode-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        if (this.isActive) {
            const godModeIndicator = document.createElement('div');
            godModeIndicator.className = 'god-mode-indicator';
            godModeIndicator.innerHTML = `
                <span class="god-mode-icon">⚡</span>
                <span class="god-mode-text">GOD MODE</span>
                <button class="god-mode-toggle" onclick="window.godModeManager.deactivateGodMode()">Deactivate</button>
            `;
            gameHeader.appendChild(godModeIndicator);
        }
    }

    /**
     * Show God Mode tutorial
     */
    showGodModeTutorial() {
        const tutorialMessage = `
<div class="god-mode-tutorial-popup">
    <div class="tutorial-header">
        <div class="tutorial-icon">⚡</div>
        <h3>🎮 GOD MODE ACTIVATED! 🎮</h3>
        <p>You now have unlimited creative control!</p>
    </div>
    
    <div class="tutorial-content">
        <div class="tutorial-section">
            <h4>🎯 How It Works:</h4>
            <ul>
                <li>Look for the <strong>golden input box</strong> above normal choices</li>
                <li>Type <strong>anything</strong> you want your character to do</li>
                <li>Press <strong>Enter</strong> or click <strong>"Execute Divine Will"</strong></li>
                <li>Watch reality bend to your will!</li>
            </ul>
        </div>
        
        <div class="tutorial-quick-examples">
            <h4>⚡ Quick Start Examples:</h4>
            <div class="quick-examples-grid">
                <div class="quick-example">"I summon a dragon companion"</div>
                <div class="quick-example">"I create a castle in the clouds"</div>
                <div class="quick-example">"I become invisible"</div>
                <div class="quick-example">"I time travel to yesterday"</div>
            </div>
        </div>
        
        <div class="tutorial-tips">
            <h4>💡 Pro Tips:</h4>
            <ul>
                <li>Be as creative and detailed as you want</li>
                <li>You can still use normal choices anytime</li>
                <li>Toggle God Mode on/off with the header button</li>
                <li>There are no wrong answers - experiment!</li>
            </ul>
        </div>
        
        <div class="tutorial-finale">
            <p><strong>✨ Your adventure is now truly limitless! ✨</strong></p>
        </div>
    </div>
</div>
        `;
        
        UI.showPopup(tutorialMessage, 'god_mode_tutorial', 10000);
    }

    /**
     * Check unlock conditions
     */
    checkMainQuestlineCompletion() {
        // Use the new quest progress system if available
        if (gameState.questProgressManager) {
            return gameState.questProgressManager.shouldCompleteQuest();
        }
        
        // Fallback to old method
        return gameState.turn >= 50 && gameState.adventureGoal?.includes('completed');
    }

    checkCharacterMastery() {
        // Check if character has reached high development
        return gameState.players?.some(player => 
            (player.level || 1) >= 10 && 
            Object.keys(player.inventory || {}).length >= 20
        );
    }

    checkWorldExploration() {
        // Check if player has explored extensively
        return gameState.turn >= 30;
    }

    /**
     * Helper methods for special commands (simplified implementations)
     */
    async processWorldCommand(analysis) {
        this.creativeStats.set('world_changes_made', 
            (this.creativeStats.get('world_changes_made') || 0) + 1);
        return await this.generateGodModeResponse(analysis.originalText, analysis);
    }

    async processNarrativeCommand(analysis) {
        this.creativeStats.set('narrative_rewrites', 
            (this.creativeStats.get('narrative_rewrites') || 0) + 1);
        return await this.generateGodModeResponse(analysis.originalText, analysis);
    }

    async processCharacterCommand(analysis) {
        return await this.generateGodModeResponse(analysis.originalText, analysis);
    }

    /**
     * Get God Mode status for UI
     */
    getStatus() {
        return {
            isUnlocked: this.isUnlocked,
            isActive: this.isActive,
            conditions: Array.from(this.unlockConditions.values()),
            stats: Object.fromEntries(this.creativeStats)
        };
    }
}

// Export singleton instance
export const godModeManager = new GodModeManager();

// Make available globally for UI interactions
if (typeof window !== 'undefined') {
    window.godModeManager = godModeManager;
}
