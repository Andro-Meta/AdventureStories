// initializationManager.js
// Intelligent initialization system with dependency management and error recovery

/**
 * Initialization Manager - Handles complex dependency resolution and graceful error recovery
 * This system ensures components are initialized in the correct order with proper dependency tracking
 */
export class InitializationManager {
    constructor() {
        this.tasks = new Map();
        this.completedTasks = new Set();
        this.failedTasks = new Set();
        this.runningTasks = new Set();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.log = window.displayVisualError || console.log;
        this.loadingTips = null; // Will be initialized when needed
        
        // Initialization phases
        this.phases = {
            CORE: 'core',           // Essential systems (state, config, UI)
            PLAYERS: 'players',     // Player creation and basic setup
            CONTENT: 'content',     // Dynamic content systems (spells, items, etc.)
            WORLD: 'world',         // World systems (locations, shops, etc.)
            STORY: 'story',         // Story generation and game start
            FINALIZE: 'finalize'    // Final cleanup and UI updates
        };
        
        this.initializeTasks();
    }

    /**
     * Register all initialization tasks with their dependencies and phases
     */
    initializeTasks() {
        // CORE PHASE - Essential systems that everything else depends on
        this.registerTask('gameState', {
            phase: this.phases.CORE,
            dependencies: [],
            priority: 100,
            timeout: 5000,
            critical: true,
            action: async () => {
                const { gameState, resetGameState, initializeGameState } = await import('./state.js?cb=014');
                resetGameState();
                await initializeGameState();

                // Wire singleton subsystems onto gameState so consumers
                // (actionHandler, ui) find them at the documented paths.
                // Phase 1.3: each dynamic import is wrapped — if a module
                // fails to load, the rest of init still proceeds and the
                // dependent feature degrades gracefully (logs a warning,
                // sets the manager to null so call sites can ?.-guard).
                try {
                    const { godModeManager } = await import('./godMode.js?cb=014');
                    gameState.godModeManager = godModeManager || null;
                } catch (e) {
                    this.log(`InitManager: godMode load failed — feature disabled: ${e.message}`);
                    gameState.godModeManager = null;
                }

                // Wire the quest progress manager and initialize it for the
                // selected theme. Without this, every `gameState.questProgressManager`
                // guard in aiHandler/godMode is permanently false — the
                // "Beginning 0%" panel never updates and god mode never
                // unlocks. Phase 0 audit P1 #6.
                try {
                    const { questProgressManager } = await import('./questProgress.js?cb=014');
                    gameState.questProgressManager = questProgressManager || null;
                    if (questProgressManager?.initializeQuestProgress) {
                        try {
                            questProgressManager.initializeQuestProgress(
                                gameState.adventureTheme || 'fantasy',
                                gameState.adventureGoal || 'Discover the unfolding adventure.'
                            );
                        } catch (e) {
                            this.log(`InitManager: questProgressManager init warning: ${e.message}`);
                        }
                    } else {
                        this.log(`InitManager: questProgressManager has no initializeQuestProgress() — quest panel will not update.`);
                    }
                } catch (e) {
                    this.log(`InitManager: questProgress load failed — quests disabled this session: ${e.message}`);
                    gameState.questProgressManager = null;
                }

                // Phase 3.5 follow-on: pick a random STORY HOOK for this run
                // so each new game opens with a different inciting incident
                // and the narrator can't default to its overused fantasy
                // tropes ("Sunken Library", "Heart of Shadow"). The hook is
                // persisted on gameState so the initial-story prompt can
                // anchor on it and saves preserve it across reloads.
                try {
                    const storyHooksMod = await import('./storyHooks.js?cb=014');
                    if (storyHooksMod?.pickStoryHook) {
                        gameState.storyHook = storyHooksMod.pickStoryHook(
                            gameState.adventureTheme,
                            gameState.customThemeDescription
                        );
                        this.log(`InitManager: storyHook picked — ${gameState.storyHook?.archetype || 'unknown'} for theme '${gameState.adventureTheme}'`);
                    } else {
                        this.log(`InitManager: storyHooks module loaded but pickStoryHook missing — using default.`);
                        gameState.storyHook = null;
                    }
                } catch (e) {
                    this.log(`InitManager: storyHook pick warning — game continues without hook: ${e.message}`);
                    gameState.storyHook = null;
                }

                // SANITY CHECK: if theme isn't what the user picked, log loudly.
                // A theme mismatch here means setup.js's write was lost during
                // resetGameState (the bug we just fixed) — or someone reloaded
                // a stale-cached state.js. Either way, the player will see
                // wrong content and we want loud evidence.
                this.log(`InitManager: SANITY — adventureTheme='${gameState.adventureTheme}', custom='${gameState.customThemeDescription || '—'}', playerCount=${gameState.playerCount}, names=[${(gameState.playerNames||[]).join(',')}]`);

                return { gameState };
            },
            description: 'Initialize core game state'
        });

        this.registerTask('localAI', {
            phase: this.phases.CORE,
            dependencies: [],
            priority: 90,
            timeout: 8000, // Give it 8 seconds
            critical: true, // AI IS CRITICAL - we need it to work
            action: async () => {
                const localAI = await import('./localAI.js?cb=014');
                
                // First, check if the server is even running
                try {
                    this.log('InitManager: Checking AI server connectivity...');
                    const health = await this.checkLocalAIHealth();
                    this.log(`InitManager: AI server is healthy and ready!`);
                    return { localAI, healthy: true, modelInfo: health };
                } catch (error) {
                    this.log(`InitManager: AI server check failed: ${error.message}`);
                    
                    // If it's a timeout, the server might be starting up
                    if (error.message.includes('timed out')) {
                        this.log('InitManager: AI server appears to be starting up. Waiting a bit more...');
                        
                        // Wait 3 more seconds and try once more
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        try {
                            const health = await this.checkLocalAIHealth();
                            this.log(`InitManager: AI server is now ready after waiting!`);
                            return { localAI, healthy: true, modelInfo: health };
                        } catch (secondError) {
                            throw new Error(`AI server not responding: ${secondError.message}. Make sure start_game.py launched the configured LLM_BACKEND server.`);
                        }
                    } else {
                        throw new Error(`AI server error: ${error.message}. Make sure start_game.py launched the configured LLM_BACKEND server.`);
                    }
                }
            },
            description: 'Verify local AI server is running and ready'
        });

        // PLAYERS PHASE - Player creation and basic setup
        this.registerTask('createPlayers', {
            phase: this.phases.PLAYERS,
            dependencies: ['gameState'],
            priority: 80,
            timeout: 15000,
            critical: true,
            action: async (context) => {
                const { gameState, createNewPlayer } = await import('./state.js?cb=014');
                const Items = await import('./items.js?cb=014');
                const Combat = await import('./combat.js?cb=014');
                
                // Create all players first
                gameState.players = [];
                gameState.currentPlayerIndex = 0;
                
                for (let i = 0; i < gameState.playerNames.length; i++) {
                    const player = createNewPlayer(gameState.playerNames[i], gameState.playerAges[i]);
                    
                    // Generate and equip starting items
                    const startingItems = Items.generateStartingItems(gameState.adventureTheme);
                    startingItems.forEach(item => {
                        player.inventory.push(item);
                        if (item.type === 'Weapon' && !player.equipment.weapon) {
                            player.equipment.weapon = item.id;
                            item.equippedSlot = 'weapon';
                        } else if (item.type === 'Armor' && !player.equipment.armor) {
                            player.equipment.armor = item.id;
                            item.equippedSlot = 'armor';
                        }
                    });
                    
                    Combat.recalculateCharacterStats(player);
                    gameState.players.push(player);
                }
                
                return { playersCreated: gameState.players.length };
            },
            description: 'Create player characters with equipment'
        });

        this.registerTask('initializeSpells', {
            phase: this.phases.CONTENT,
            dependencies: ['gameState', 'createPlayers', 'localAI'],
            priority: 70,
            timeout: 30000,
            critical: false, // Non-critical - can use fallbacks
            action: async (context) => {
                const { gameState } = await import('./state.js?cb=014');
                const Spells = await import('./spells.js?cb=014');
                
                // Initialize spellcasting for each player
                const results = [];
                for (const player of gameState.players) {
                    try {
                        await Spells.initializePlayerSpellcasting(player);
                        results.push({ player: player.name, spells: player.spellcasting?.knownSpells?.length || 0 });
                    } catch (error) {
                        this.log(`Warning: Spell initialization failed for ${player.name}: ${error.message}`);
                        // Create minimal fallback spellcasting
                        player.spellcasting = {
                            knownSpells: [],
                            preparedSpells: [],
                            schoolAffinities: { ELEMENTAL: 10, ARCANE: 10, DIVINE: 10, SHADOW: 10, NATURE: 10, MIND: 10 },
                            spellcastingLevel: 1,
                            maxSpellLevel: 1,
                            spellSlots: { 0: 3, 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
                            favoriteSchools: [],
                            castingModifiers: { mpCostReduction: 0, powerBonus: 0, accuracyBonus: 0, criticalChance: 0 }
                        };
                        results.push({ player: player.name, spells: 0, fallback: true });
                    }
                }
                
                return { spellInitResults: results };
            },
            description: 'Initialize player spellcasting abilities'
        });

        this.registerTask('generateShopItems', {
            phase: this.phases.WORLD,
            dependencies: ['gameState'],
            priority: 50,
            timeout: 20000,
            critical: false,
            action: async (context) => {
                const { gameState } = await import('./state.js?cb=014');
                
                try {
                    const dynamicItems = await import('./dynamicItems.js?cb=014');
                    gameState.shopItems = await dynamicItems.generateDynamicShopItems(8, gameState.turn);
                    return { shopItems: gameState.shopItems.length, dynamic: true };
                } catch (error) {
                    // Fallback to static items
                    gameState.shopItems = this.generateFallbackShopItems(gameState.adventureTheme);
                    return { shopItems: gameState.shopItems.length, dynamic: false };
                }
            },
            description: 'Generate shop inventory'
        });

        this.registerTask('initializeLocationSystem', {
            phase: this.phases.WORLD,
            dependencies: ['gameState'],
            priority: 40,
            timeout: 15000,
            critical: false,
            action: async () => {
                const { initializeLocationSystem } = await import('./locations.js?cb=014');
                // B2: pass the actual chosen theme so locations.js doesn't log
                // "theme: undefined" and fall back to a generic fantasy default.
                const { gameState } = await import('./state.js?cb=014');
                const theme = gameState.adventureTheme || 'fantasy';
                await initializeLocationSystem(theme);
                return { locationsInitialized: true, theme };
            },
            description: 'Initialize world locations'
        });

        this.registerTask('initializeDynamicSystems', {
            phase: this.phases.CONTENT,
            dependencies: ['gameState'],
            priority: 30,
            timeout: 10000,
            critical: false,
            action: async () => {
                const results = {};
                
                try {
                    const DynamicSpells = await import('./dynamicSpells.js?cb=014');
                    results.dynamicSpells = !!DynamicSpells.dynamicSpellRegistry;
                } catch (error) {
                    results.dynamicSpells = false;
                    results.dynamicSpellsError = error.message;
                }
                
                return results;
            },
            description: 'Initialize dynamic content systems'
        });

        this.registerTask('generateInitialStory', {
            phase: this.phases.STORY,
            dependencies: ['gameState', 'createPlayers', 'localAI'],
            priority: 60,
            timeout: 45000,
            critical: true,
            action: async () => {
                const { makeAICallForSystemAction } = await import('./aiHandler.js?cb=014');
                await makeAICallForSystemAction('start_adventure', null);
                return { storyGenerated: true };
            },
            description: 'Generate initial story'
        });

        this.registerTask('finalizeUI', {
            phase: this.phases.FINALIZE,
            dependencies: ['gameState', 'createPlayers', 'generateInitialStory'],
            priority: 20,
            timeout: 5000,
            critical: true,
            action: async (context) => {
                const UI = await import('./ui.js?cb=014');
                const { loadingManager } = await import('./loadingManager.js?cb=014');
                
                UI.renderPlayerCards();
                UI.showScreen('gameScreen');
                loadingManager.hideLoading();
                
                return { uiFinalized: true };
            },
            description: 'Finalize UI and show game screen'
        });
    }

    /**
     * Register a new initialization task
     */
    registerTask(name, config) {
        this.tasks.set(name, {
            name,
            ...config,
            retries: 0
        });
    }

    /**
     * Execute all initialization tasks in dependency order
     */
    async executeInitialization() {
        this.log('InitManager: Starting intelligent initialization sequence...');
        
        // Initialize loading tips system
        await this.initializeLoadingTips();
        
        try {
            // Start tip rotation
            this.loadingTips?.startTipRotation();
            
            // Execute tasks by phase
            for (const phase of Object.values(this.phases)) {
                this.log(`InitManager: Starting ${phase.toUpperCase()} phase...`);
                
                // Show phase-specific tips
                this.showPhaseSpecificTips(phase);
                
                await this.executePhase(phase);
                this.log(`InitManager: ${phase.toUpperCase()} phase complete.`);
                
                // Update progress
                this.updateProgress();
            }
            
            this.log('InitManager: All initialization phases completed successfully!');
            
            // Show completion
            this.loadingTips?.showCompletion();
            
            return { success: true, results: this.getResults() };
            
        } catch (error) {
            this.log(`InitManager: Critical initialization failure: ${error.message}`);
            this.loadingTips?.stopTipRotation();
            return { success: false, error: error.message, results: this.getResults() };
        }
    }

    /**
     * Execute all tasks in a specific phase
     */
    async executePhase(phase) {
        const phaseTasks = Array.from(this.tasks.values())
            .filter(task => task.phase === phase)
            .sort((a, b) => b.priority - a.priority); // Higher priority first

        // Execute tasks in dependency order within the phase
        for (const task of phaseTasks) {
            if (this.completedTasks.has(task.name)) continue;
            
            await this.executeTask(task);
        }
    }

    /**
     * Execute a single task with dependency checking and error handling
     */
    async executeTask(task) {
        // Check if already completed or failed
        if (this.completedTasks.has(task.name)) return;
        if (this.failedTasks.has(task.name) && task.critical) {
            throw new Error(`Critical task ${task.name} has failed and cannot be retried`);
        }

        // Check dependencies
        for (const dep of task.dependencies) {
            if (!this.completedTasks.has(dep)) {
                // Try to execute dependency first
                const depTask = this.tasks.get(dep);
                if (depTask && !this.runningTasks.has(dep)) {
                    await this.executeTask(depTask);
                }
                
                // Verify dependency is now complete
                if (!this.completedTasks.has(dep)) {
                    throw new Error(`Dependency ${dep} for task ${task.name} could not be satisfied`);
                }
            }
        }

        // Execute the task
        this.runningTasks.add(task.name);
        this.log(`InitManager: Executing ${task.name} - ${task.description}`);
        
        try {
            const startTime = Date.now();
            
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Task ${task.name} timed out after ${task.timeout}ms`)), task.timeout)
            );
            
            // Execute task with timeout
            const context = this.buildTaskContext(task);
            const result = await Promise.race([
                task.action(context),
                timeoutPromise
            ]);
            
            const duration = Date.now() - startTime;
            this.completedTasks.add(task.name);
            this.runningTasks.delete(task.name);
            
            this.log(`InitManager: ✅ ${task.name} completed in ${duration}ms`);
            
            // Store result for other tasks
            task.result = result;
            
        } catch (error) {
            this.runningTasks.delete(task.name);
            task.retries++;
            
            this.log(`InitManager: ❌ ${task.name} failed: ${error.message} (attempt ${task.retries}/${this.maxRetries})`);
            
            // Retry logic
            if (task.retries < this.maxRetries && !task.critical) {
                this.log(`InitManager: Retrying ${task.name}...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * task.retries)); // Exponential backoff
                return this.executeTask(task);
            } else {
                this.failedTasks.add(task.name);
                
                if (task.critical) {
                    throw new Error(`Critical task ${task.name} failed: ${error.message}`);
                } else {
                    this.log(`InitManager: Non-critical task ${task.name} failed, continuing...`);
                }
            }
        }
    }

    /**
     * Build context object for task execution
     */
    buildTaskContext(task) {
        const context = {};
        
        // Add results from completed dependencies
        for (const dep of task.dependencies) {
            const depTask = this.tasks.get(dep);
            if (depTask && depTask.result) {
                context[dep] = depTask.result;
            }
        }
        
        return context;
    }

    /**
     * Check local AI server health
     */
    async checkLocalAIHealth() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

        try {
            const Config = await import('./config.js?cb=014');
            const url = Config.getActiveBackendConfig().url + '/health';
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Local AI server health check failed: ${response.status}`);
            }

            const health = await response.json();
            // MiniCPM Python: {status:"healthy", model_loaded:true}
            // llama-server:   {status:"ok"}
            const ok = health.status === 'ok' || health.model_loaded === true || health.status === 'healthy';
            if (!ok) {
                throw new Error('Local AI server reports not ready: ' + JSON.stringify(health));
            }

            this.log(`InitManager: AI server healthy at ${url} (${JSON.stringify(health)})`);
            return health;

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('AI server health check timed out - server may be starting up');
            }
            throw error;
        }
    }

    /**
     * Generate fallback shop items
     */
    generateFallbackShopItems(theme) {
        // Use a simple ID generator since we can't import utils in this context
        const generateId = () => 'item_' + Math.random().toString(36).substr(2, 9);
        return [
            {
                id: generateId(),
                name: "Health Potion",
                type: "Consumable",
                tier: "Low",
                cost: 25,
                description: "Restores 30 HP when consumed.",
                effect: { type: "heal", value: 30 }
            },
            {
                id: generateId(),
                name: "Basic Sword",
                type: "Weapon",
                tier: "Medium",
                cost: 75,
                description: "A reliable weapon for combat.",
                effect: { type: "attack", value: 8 }
            },
            {
                id: generateId(),
                name: "Leather Armor",
                type: "Armor",
                tier: "Medium",
                cost: 60,
                description: "Provides basic protection.",
                effect: { type: "defense", value: 6 }
            }
        ];
    }

    /**
     * Reset task state so a subsequent executeInitialization() re-runs all
     * phases from scratch. Must be called before starting a new game within
     * the same browser session; without this, completedTasks still has entries
     * from the previous game and every phase is silently skipped.
     */
    reset() {
        this.completedTasks.clear();
        this.failedTasks.clear();
        this.runningTasks.clear();
        this.retryAttempts.clear();
        // Clear cached task results so stale context doesn't bleed into the new run.
        for (const task of this.tasks.values()) {
            delete task.result;
        }
        this.log('InitManager: Reset — all tasks will re-execute on next initialization.');
    }

    /**
     * Get initialization results summary
     */
    getResults() {
        return {
            completed: Array.from(this.completedTasks),
            failed: Array.from(this.failedTasks),
            taskResults: Object.fromEntries(
                Array.from(this.tasks.entries())
                    .filter(([_, task]) => task.result)
                    .map(([name, task]) => [name, task.result])
            )
        };
    }

    /**
     * Get initialization progress
     */
    getProgress() {
        const total = this.tasks.size;
        const completed = this.completedTasks.size;
        const failed = this.failedTasks.size;
        const running = this.runningTasks.size;
        
        return {
            total,
            completed,
            failed,
            running,
            percentage: Math.round((completed / total) * 100)
        };
    }

    /**
     * Initialize loading tips system
     */
    async initializeLoadingTips() {
        try {
            const { loadingTips } = await import('./loadingTips.js?cb=014');
            this.loadingTips = loadingTips;
            this.log('InitManager: Loading tips system initialized');
        } catch (error) {
            this.log(`InitManager: Failed to load tips system: ${error.message}`);
            // Non-critical - continue without tips
        }
    }

    /**
     * Show phase-specific loading tips
     */
    showPhaseSpecificTips(phase) {
        if (!this.loadingTips) return;

        // Show gameplay tips regardless of phase - players want to learn how to play!
        const gameplayCategories = ['combat', 'spells', 'reputation', 'items', 'exploration', 'story', 'multiplayer', 'gameplay'];
        const randomCategory = gameplayCategories[Math.floor(Math.random() * gameplayCategories.length)];
        this.loadingTips.showCategoryTip(randomCategory);
    }

    /**
     * Update progress bar and status
     */
    updateProgress() {
        if (!this.loadingTips) return;

        const progress = this.getProgress();
        const statusTexts = {
            [this.phases.CORE]: 'Setting up core systems...',
            [this.phases.PLAYERS]: 'Creating your characters...',
            [this.phases.CONTENT]: 'Initializing magic and abilities...',
            [this.phases.WORLD]: 'Building the world around you...',
            [this.phases.STORY]: 'Crafting your unique adventure...',
            [this.phases.FINALIZE]: 'Putting finishing touches...'
        };

        // Find current phase
        let currentPhase = this.phases.FINALIZE;
        for (const [phase, phaseTasks] of Object.entries(this.getTasksByPhase())) {
            const completedInPhase = phaseTasks.filter(task => this.completedTasks.has(task.name)).length;
            
            if (completedInPhase < phaseTasks.length) {
                currentPhase = phase;
                break;
            }
        }

        const statusText = statusTexts[currentPhase] || 'Initializing...';
        this.loadingTips.updateProgress(progress.percentage, statusText);
    }

    /**
     * Get tasks organized by phase
     */
    getTasksByPhase() {
        const tasksByPhase = {};
        for (const phase of Object.values(this.phases)) {
            tasksByPhase[phase] = Array.from(this.tasks.values()).filter(task => task.phase === phase);
        }
        return tasksByPhase;
    }
}

// Create global instance
export const initManager = new InitializationManager();
