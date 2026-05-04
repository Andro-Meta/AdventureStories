// godMode.js
// God Mode / Creative Mode System
// Unlocks unlimited creative freedom after main questline completion

import { gameState } from './state.js?cb=014';
import { generateId } from './utils.js?cb=014';
import * as UI from './ui.js?cb=014';
// Phase 4: god mode now actually calls the AI instead of returning canned
// flavor text. Dynamic-import in the methods to avoid a top-level cycle
// (aiHandler imports state which imports godMode lazily during init).

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
     * Initialize God Mode system.
     *
     * UNLOCK SPEC (matches README + questDefinitions Act 3 narratorHint):
     *   God Mode unlocks the moment /isGoalComplete flips true. The other
     *   stats below (Character Mastery, World Explorer) are tracked as
     *   *bragging-rights achievements*, not gates — they used to gate
     *   the unlock, which prevented the celebration popup from firing
     *   even after the main quest finished. Phase 4 fix.
     */
    initializeGodMode() {
        const log = window.displayVisualError || console.log;

        // Sole unlock gate: main quest completion.
        this.unlockConditions.set('main_questline', {
            name: 'Complete Main Questline',
            description: 'Finish the primary adventure storyline',
            completed: false,
            isGate: true,
            checkFunction: () => this.checkMainQuestlineCompletion()
        });

        // Achievements — tracked + displayed, but DO NOT gate the unlock.
        this.unlockConditions.set('character_development', {
            name: 'Character Mastery',
            description: 'Reach maximum character development',
            completed: false,
            isGate: false,
            checkFunction: () => this.checkCharacterMastery()
        });
        this.unlockConditions.set('world_exploration', {
            name: 'World Explorer',
            description: 'Discover significant portions of the world',
            completed: false,
            isGate: false,
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
     * Check if God Mode should be unlocked.
     *
     * Unlock rule: ALL conditions with `isGate: true` must be satisfied.
     * Currently that's just `main_questline`. Achievement-style conditions
     * (character_development, world_exploration) are evaluated for stats
     * but never block the unlock — fixes the long-standing bug where
     * God Mode silently failed to unlock after winning because the player
     * hadn't also hit lvl 10 with 20+ items. (README spec: "finish the
     * main quest" — that's it.)
     *
     * @returns {boolean} Whether God Mode is now available
     */
    checkUnlockConditions() {
        if (this.isUnlocked) return true;

        let gatesPassed = true;
        for (const [, condition] of this.unlockConditions.entries()) {
            const completed = !!condition.checkFunction();
            condition.completed = completed;
            if (condition.isGate && !completed) gatesPassed = false;
        }

        if (gatesPassed && !this.isUnlocked) {
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
     * Phase 4: Generate the actual AI narrative response to a god-mode
     * declaration. The choice is treated as a player input, fed through
     * the standard makeAICallForSystemAction pipeline so the existing
     * diff-op engine, narrative storage, and arc memory all engage. The
     * god-mode-specific framing comes from buildQuestStageHint(gameState)
     * which already returns the GOD MODE block when /isGoalComplete is true.
     *
     * @param {string} choice - Custom god-mode declaration from the player
     * @param {object} analysis - Result of analyzeCustomChoice (commandType, etc.)
     * @returns {Promise<string>} The narrator's response prose
     */
    async generateGodModeResponse(choice, analysis) {
        const log = window.displayVisualError || console.log;
        const commandType = analysis?.commandType || 'normal';

        try {
            // Build a system action prompt that frames the player input as a
            // god-mode declaration. The existing aiHandler / engine path
            // applies any diff ops the narrator emits — this is how items,
            // NPCs, world changes, and stat modifications actually take
            // effect. Without this hook, god mode was pure flavor text.
            const promptByType = {
                world:     `[God Mode — World Manipulation]\nThe player declares: "${choice}"\nApply this change to the world. Emit diff ops for any concrete state changes (location, items, NPCs, enemies). Then narrate the change vividly.`,
                narrative: `[God Mode — Narrative Override]\nThe player declares: "${choice}"\nReshape the story to honor this declaration. Emit diff ops for any state changes. Narrate the new direction.`,
                character: `[God Mode — Character Modification]\nThe player declares: "${choice}"\nApply the change to the player character. Emit diff ops for stat / inventory / spell / level changes. Narrate how the player feels the change manifest.`,
                normal:    `[God Mode — Free Action]\nThe player declares: "${choice}"\nHonor this declaration as authorial authority. Emit any diff ops needed to make the change real. Narrate the result.`
            };
            const prompt = promptByType[commandType] || promptByType.normal;

            // Lazy import to dodge any module-load ordering issues with
            // aiHandler ↔ state ↔ godMode.
            const aiHandler = await import('./aiHandler.js?cb=014');
            const result = await aiHandler.makeAICallForSystemAction(prompt, false);

            // makeAICallForSystemAction returns { narrative, choices } and
            // also pushes the narrative to the UI internally — return the
            // narrative so the caller can include it in its own response.
            return result?.narrative
                || `Your declaration ripples outward — "${choice}" — and the world reshapes to match.`;

        } catch (err) {
            log(`GodMode: AI call failed (${err.message}); returning fallback prose.`);
            // Graceful fallback: still acknowledge the god-mode action even
            // if the AI is unreachable.
            return `Your divine will reaches outward to "${choice}", though the response of the world is muted today. (AI backend error — try again or check the Local AI Status screen.)`;
        }
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
     * Main-quest completion check.
     *
     * Order of authority (most → least authoritative):
     *   1. gameState.isGoalComplete — the engine flips this when the
     *      narrator emits the Act 3 final_blow milestone + isGoalComplete
     *      diff op. This is the canonical "you won the game" signal.
     *   2. questProgressManager.shouldCompleteQuest() — pre-Phase-4
     *      heuristic (>=2 of high-progress / final milestone / minimum
     *      turns / phase=resolution). Kept as a backstop in case the
     *      narrator forgets to emit the explicit isGoalComplete op.
     *   3. Generous fallback: 95%+ progress AND turn >= 30 AND a
     *      milestone literally named final_blow. Earlier code looked
     *      for `adventureGoal.includes('completed')` which never fires.
     */
    checkMainQuestlineCompletion() {
        if (gameState.isGoalComplete === true) return true;
        if (gameState.questProgressManager
            && typeof gameState.questProgressManager.shouldCompleteQuest === 'function'
            && gameState.questProgressManager.shouldCompleteQuest()) {
            return true;
        }
        const milestones = gameState.questProgress?.milestones || [];
        const hasFinalBlow = milestones.some(m => {
            const n = String(m?.name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
            return n === 'final blow' || n === 'goal achieved';
        });
        return hasFinalBlow
            && (gameState.questProgress?.completionPercentage || 0) >= 95
            && (gameState.turn || 0) >= 30;
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
        // Phase 4: route through generateGodModeResponse with the explicit
        // 'world' command type so the AI prompt is tailored and the diff
        // engine actually applies world-state changes (location, NPCs,
        // enemies). Stat tracking is preserved.
        const response = await this.generateGodModeResponse(analysis.originalText, { ...analysis, commandType: 'world' });
        this.creativeStats.set('world_changes_made',
            (this.creativeStats.get('world_changes_made') || 0) + 1);
        return { success: true, response, isGodMode: true, commandType: 'world' };
    }
    async processNarrativeCommand(analysis) {
        // Phase 4: explicit narrative-override AI prompt.
        const response = await this.generateGodModeResponse(analysis.originalText, { ...analysis, commandType: 'narrative' });
        this.creativeStats.set('narrative_overrides_made',
            (this.creativeStats.get('narrative_overrides_made') || 0) + 1);
        return { success: true, response, isGodMode: true, commandType: 'narrative' };
    }
    async processCharacterCommand(analysis) {
        // Phase 4: explicit character-modification AI prompt.
        const response = await this.generateGodModeResponse(analysis.originalText, { ...analysis, commandType: 'character' });
        this.creativeStats.set('character_modifications_made',
            (this.creativeStats.get('character_modifications_made') || 0) + 1);
        return { success: true, response, isGodMode: true, commandType: 'character' };
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

    /**
     * BUG-26 fix: serialize the Map-backed state into plain JSON-able shapes
     * so saveLoad.js can persist it. Counterpart to restoreFromJSON below.
     * Returns null if there's nothing meaningful to save (fresh manager) so
     * the saved blob doesn't carry empty ceremony.
     */
    toJSON() {
        const empty = !this.isUnlocked && !this.isActive
            && this.customChoiceHistory.size === 0
            && this.worldManipulations.size === 0
            && this.narrativeOverrides.size === 0
            && Array.from(this.creativeStats.values()).every(v => !v);
        if (empty) return null;
        return {
            v: 1,
            isUnlocked: !!this.isUnlocked,
            isActive: !!this.isActive,
            customChoiceHistory: Array.from(this.customChoiceHistory.entries()),
            worldManipulations: Array.from(this.worldManipulations.entries()),
            narrativeOverrides: Array.from(this.narrativeOverrides.entries()),
            godModeAchievements: Array.from(this.godModeAchievements.entries()),
            creativeStats: Array.from(this.creativeStats.entries())
        };
    }

    /**
     * BUG-26 fix: rebuild the Maps from the JSON shape produced by toJSON.
     * Tolerant: missing fields keep the constructor defaults, malformed
     * fields are skipped, and the version field allows future schema bumps.
     */
    restoreFromJSON(data) {
        if (!data || typeof data !== 'object') return;
        const log = window.displayVisualError || console.log;
        try {
            if (typeof data.isUnlocked === 'boolean') this.isUnlocked = data.isUnlocked;
            if (typeof data.isActive === 'boolean') this.isActive = data.isActive;
            const restoreMap = (target, entries) => {
                if (!Array.isArray(entries)) return;
                for (const e of entries) {
                    if (Array.isArray(e) && e.length === 2 && typeof e[0] === 'string') {
                        target.set(e[0], e[1]);
                    }
                }
            };
            restoreMap(this.customChoiceHistory,  data.customChoiceHistory);
            restoreMap(this.worldManipulations,    data.worldManipulations);
            restoreMap(this.narrativeOverrides,    data.narrativeOverrides);
            restoreMap(this.godModeAchievements,   data.godModeAchievements);
            restoreMap(this.creativeStats,         data.creativeStats);
            log(`GodModeManager: restored from save (unlocked=${this.isUnlocked}, active=${this.isActive}, ${this.customChoiceHistory.size} custom choices replayed)`);
        } catch (e) {
            log(`GodModeManager: restoreFromJSON failed (${e?.message}); continuing with fresh state.`);
        }
    }
}

// Export singleton instance
export const godModeManager = new GodModeManager();

// Make available globally for UI interactions
if (typeof window !== 'undefined') {
    window.godModeManager = godModeManager;
}
