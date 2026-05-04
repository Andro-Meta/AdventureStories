// gemmaContextOptimizer.js (legacy filename; class is LocalAIContextOptimizer)
// Local-AI context management for whichever backend is active. Tunable via
// the maxContextTokens / emergencyThreshold / warningThreshold fields below;
// defaults assume a 128k-class window (legacy MiniCPM). Tier 2's Qwen3-4B
// runs with a 32k window — acceptable here because we aggressively compress
// before approaching the limit.

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import { contextManager } from './contextManager.js?cb=014';
import { generateId } from './utils.js?cb=014';

/**
 * Local AI Context Optimizer — manages context windows for the active local
 * backend. Defaults below assume a 128k-class window (legacy MiniCPM); the
 * thresholds compress aggressively before the limit, so smaller windows
 * (e.g. Qwen3-4B at 32k) work without changes.
 */
export class LocalAIContextOptimizer {
    constructor() {
        // Context window management - optimized for 128k context window
        this.maxContextTokens = 120000;         // 120k safe limit (leaving buffer)
        this.emergencyThreshold = 100000;       // Emergency compression trigger
        this.warningThreshold = 80000;          // Warning threshold
        
        // Agent context tracking
        this.agentContexts = new Map();         // agentId -> context data
        this.contextUsage = new Map();          // agentId -> token usage
        this.compressionHistory = new Map();    // agentId -> compression history
        
        // Cross-agent optimization
        this.sharedContext = new Map();         // Shared context between agents
        this.contextDeduplication = new Map();  // Deduplicated context elements
        this.agentCoordination = new Map();     // Agent coordination data
        
        // Performance monitoring
        this.contextMetrics = new Map();        // Performance metrics
        this.compressionStats = new Map();      // Compression statistics
        
        this.initializeContextOptimizer();
    }

    /**
     * Initialize the context optimizer with default settings
     */
    initializeContextOptimizer() {
        const log = window.displayVisualError || console.log;
        
        // Set up context monitoring
        this.setupContextMonitoring();
        
        // Initialize shared context
        this.initializeSharedContext();
        
        log("LocalAIContextOptimizer: Initialized with 128k context window optimizations");
    }

    /**
     * Set up real-time context monitoring
     */
    setupContextMonitoring() {
        // Monitor context usage every 30 seconds
        setInterval(() => {
            this.monitorContextUsage();
        }, 30000);
        
        // Emergency cleanup every 5 minutes
        setInterval(() => {
            this.performEmergencyCleanup();
        }, 300000);
    }

    /**
     * Initialize shared context that all agents can use
     */
    initializeSharedContext() {
        // Core game state that all agents need
        this.sharedContext.set('gameCore', {
            theme: gameState.adventureTheme,
            turn: gameState.turn,
            players: this.compressPlayerData(),
            location: this.compressLocationData(),
            lastUpdated: Date.now()
        });
        
        // Compressed story context
        this.sharedContext.set('storyCore', {
            recentNarrative: gameState.currentNarrative?.slice(-200),
            storyBeats: gameState.storyBeats?.slice(-5),
            lastUpdated: Date.now()
        });
    }

    /**
     * Optimize context for a specific AI agent
     * @param {string} agentType - Type of AI agent (enemies, locations, etc.)
     * @param {object} specificContext - Agent-specific context
     * @returns {object} Optimized context for MiniCPM
     */
    async optimizeContextForAgent(agentType, specificContext = {}) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get current context usage
            const currentUsage = this.estimateTokenUsage(specificContext);
            
            // Check if we need compression
            if (currentUsage > this.warningThreshold) {
                log(`LocalAIContextOptimizer: Context size warning for ${agentType}: ${currentUsage} tokens`);
                return await this.compressAgentContext(agentType, specificContext);
            }
            
            // Build optimized context
            const optimizedContext = {
                // Shared context (compressed)
                ...this.getSharedContext(),
                
                // Agent-specific context (prioritized)
                ...this.prioritizeAgentContext(agentType, specificContext),
                
                // Cross-agent insights (deduplicated)
                ...this.getCrossAgentInsights(agentType)
            };
            
            // Track usage
            this.trackContextUsage(agentType, optimizedContext);
            
            return optimizedContext;
            
        } catch (error) {
            log(`LocalAIContextOptimizer: Failed to optimize context for ${agentType}: ${error.message}`);
            return this.getEmergencyContext(agentType);
        }
    }

    /**
     * Compress agent context using our existing compression system
     * @param {string} agentType - Type of AI agent
     * @param {object} context - Context to compress
     * @returns {object} Compressed context
     */
    async compressAgentContext(agentType, context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Use our existing intelligent compression
            const compressedGameContext = contextManager.compressHistoryIntelligently();
            
            // Agent-specific compression
            const agentCompression = this.getAgentSpecificCompression(agentType, context);
            
            // Combine compressed contexts
            const finalContext = {
                // Compressed game state
                gameState: this.extractEssentialGameState(),
                
                // Compressed story context
                story: this.compressStoryContext(),
                
                // Agent-specific compressed data
                agentData: agentCompression,
                
                // Cross-agent shared insights
                sharedInsights: this.getCompressedSharedInsights(agentType)
            };
            
            // Log compression ratio
            const originalSize = this.estimateTokenUsage(context);
            const compressedSize = this.estimateTokenUsage(finalContext);
            const ratio = (originalSize / compressedSize).toFixed(1);
            
            log(`LocalAIContextOptimizer: Compressed ${agentType} context ${originalSize} -> ${compressedSize} tokens (${ratio}:1 ratio)`);
            
            // Store compression history
            this.recordCompressionEvent(agentType, originalSize, compressedSize, ratio);
            
            return finalContext;
            
        } catch (error) {
            log(`LocalAIContextOptimizer: Compression failed for ${agentType}: ${error.message}`);
            return this.getEmergencyContext(agentType);
        }
    }

    /**
     * Get agent-specific compression based on agent type
     * @param {string} agentType - Type of AI agent
     * @param {object} context - Original context
     * @returns {object} Agent-specific compressed data
     */
    getAgentSpecificCompression(agentType, context) {
        switch (agentType) {
            case 'enemies':
                return {
                    recentEnemies: this.compressRecentEnemies(),
                    combatPatterns: this.compressCombatPatterns(),
                    difficultyTrends: this.compressDifficultyTrends()
                };
                
            case 'locations':
                return {
                    recentLocations: this.compressRecentLocations(),
                    explorationPatterns: this.compressExplorationPatterns(),
                    narrativePurposes: this.compressNarrativePurposes()
                };
                
            case 'story':
                return {
                    plotThreads: this.compressPlotThreads(),
                    characterArcs: this.compressCharacterArcs(),
                    storyMomentum: this.compressStoryMomentum()
                };
                
            case 'encounters':
                return {
                    recentEncounters: this.compressRecentEncounters(),
                    encounterPatterns: this.compressEncounterPatterns(),
                    playerPreferences: this.compressPlayerPreferences()
                };
                
            default:
                return {
                    generalContext: this.compressGeneralContext(context)
                };
        }
    }

    /**
     * Extract essential game state for all agents
     * @returns {object} Essential game state
     */
    extractEssentialGameState() {
        return {
            theme: gameState.adventureTheme,
            turn: gameState.turn,
            playerCount: gameState.players?.length || 1,
            currentPhase: gameState.inCombat ? 'combat' : 'exploration',
            location: gameState.currentLocation?.name || 'Unknown'
        };
    }

    /**
     * Compress story context for agents
     * @returns {object} Compressed story context
     */
    compressStoryContext() {
        return {
            recentEvents: gameState.currentNarrative?.slice(-150) || '',
            storyTone: this.analyzeStoryTone(),
            narrativeDirection: this.analyzeNarrativeDirection(),
            keyThemes: this.extractKeyThemes()
        };
    }

    /**
     * Get shared context optimized for all agents
     * @returns {object} Shared context
     */
    getSharedContext() {
        // Update shared context if stale
        this.updateSharedContextIfNeeded();
        
        return {
            core: this.sharedContext.get('gameCore'),
            story: this.sharedContext.get('storyCore')
        };
    }

    /**
     * Update shared context if it's stale
     */
    updateSharedContextIfNeeded() {
        const coreContext = this.sharedContext.get('gameCore');
        const storyContext = this.sharedContext.get('storyCore');
        
        const now = Date.now();
        const staleThreshold = 60000; // 1 minute
        
        // Update core context if stale
        if (!coreContext || (now - coreContext.lastUpdated) > staleThreshold) {
            this.sharedContext.set('gameCore', {
                theme: gameState.adventureTheme,
                turn: gameState.turn,
                players: this.compressPlayerData(),
                location: this.compressLocationData(),
                lastUpdated: now
            });
        }
        
        // Update story context if stale
        if (!storyContext || (now - storyContext.lastUpdated) > staleThreshold) {
            this.sharedContext.set('storyCore', {
                recentNarrative: gameState.currentNarrative?.slice(-200),
                storyBeats: gameState.storyBeats?.slice(-5),
                lastUpdated: now
            });
        }
    }

    /**
     * Estimate token usage for context
     * @param {object} context - Context to estimate
     * @returns {number} Estimated token count
     */
    estimateTokenUsage(context) {
        if (!context) return 0;
        
        // Rough estimation: 1 token ≈ 4 characters
        const contextString = JSON.stringify(context);
        return Math.ceil(contextString.length / 4);
    }

    /**
     * Monitor context usage across all agents
     */
    monitorContextUsage() {
        const log = window.displayVisualError || console.log;
        
        let totalUsage = 0;
        let warningAgents = [];
        let emergencyAgents = [];
        
        for (const [agentId, usage] of this.contextUsage.entries()) {
            totalUsage += usage;
            
            if (usage > this.emergencyThreshold) {
                emergencyAgents.push(agentId);
            } else if (usage > this.warningThreshold) {
                warningAgents.push(agentId);
            }
        }
        
        // Log warnings
        if (warningAgents.length > 0) {
            log(`LocalAIContextOptimizer: Context usage warning for agents: ${warningAgents.join(', ')}`);
        }
        
        if (emergencyAgents.length > 0) {
            log(`LocalAIContextOptimizer: EMERGENCY - Context usage critical for agents: ${emergencyAgents.join(', ')}`);
            this.performEmergencyCompression(emergencyAgents);
        }
        
        // Update metrics
        this.contextMetrics.set('totalUsage', totalUsage);
        this.contextMetrics.set('averageUsage', totalUsage / this.contextUsage.size);
        this.contextMetrics.set('lastMonitored', Date.now());
    }

    /**
     * Perform emergency compression for critical agents
     * @param {Array} emergencyAgents - Agents needing emergency compression
     */
    async performEmergencyCompression(emergencyAgents) {
        const log = window.displayVisualError || console.log;
        
        for (const agentId of emergencyAgents) {
            try {
                // Get current context
                const currentContext = this.agentContexts.get(agentId);
                
                // Apply aggressive compression
                const emergencyContext = await this.applyAggressiveCompression(agentId, currentContext);
                
                // Update agent context
                this.agentContexts.set(agentId, emergencyContext);
                
                // Update usage tracking
                const newUsage = this.estimateTokenUsage(emergencyContext);
                this.contextUsage.set(agentId, newUsage);
                
                log(`LocalAIContextOptimizer: Emergency compression applied to ${agentId}: ${newUsage} tokens`);
                
            } catch (error) {
                log(`LocalAIContextOptimizer: Emergency compression failed for ${agentId}: ${error.message}`);
            }
        }
    }

    /**
     * Apply aggressive compression for emergency situations
     * @param {string} agentId - Agent needing compression
     * @param {object} context - Current context
     * @returns {object} Aggressively compressed context
     */
    async applyAggressiveCompression(agentId, context) {
        // Keep only the most essential information
        return {
            essential: {
                theme: gameState.adventureTheme,
                turn: gameState.turn,
                phase: gameState.inCombat ? 'combat' : 'exploration'
            },
            compressed: await this.compressAgentContext(agentId, context),
            emergency: true,
            timestamp: Date.now()
        };
    }

    /**
     * Get emergency fallback context
     * @param {string} agentType - Type of agent
     * @returns {object} Minimal emergency context
     */
    getEmergencyContext(agentType) {
        return {
            theme: gameState.adventureTheme || 'fantasy',
            turn: gameState.turn || 1,
            emergency: true,
            agentType: agentType,
            message: 'Using emergency context due to compression failure'
        };
    }

    /**
     * Helper methods for compression
     */
    compressPlayerData() {
        return gameState.players?.map(p => ({
            name: p.name,
            level: p.level,
            isDowned: p.isDowned
        })) || [];
    }

    compressLocationData() {
        return {
            name: gameState.currentLocation?.name || 'Unknown',
            type: gameState.currentLocation?.type || 'unknown'
        };
    }

    analyzeStoryTone() {
        const narrative = gameState.currentNarrative || '';
        // Simple tone analysis
        if (narrative.includes('danger') || narrative.includes('threat')) return 'tense';
        if (narrative.includes('peaceful') || narrative.includes('calm')) return 'peaceful';
        return 'neutral';
    }

    analyzeNarrativeDirection() {
        // Analyze where the story is heading
        return 'progressing'; // Simplified for now
    }

    extractKeyThemes() {
        // Extract key themes from recent narrative
        return [gameState.adventureTheme]; // Simplified for now
    }

    // Compression methods for context optimization
    compressRecentEnemies() {
        const recentEnemies = gameState.combatHistory?.slice(-3) || [];
        return {
            enemyTypes: [...new Set(recentEnemies.map(e => e.enemyType))],
            avgDifficulty: recentEnemies.reduce((sum, e) => sum + (e.difficulty || 1), 0) / Math.max(recentEnemies.length, 1)
        };
    }

    compressCombatPatterns() {
        const combatHistory = gameState.combatHistory?.slice(-5) || [];
        return {
            preferredActions: this.getMostFrequentActions(combatHistory),
            avgCombatLength: combatHistory.reduce((sum, c) => sum + (c.turns || 1), 0) / Math.max(combatHistory.length, 1)
        };
    }

    compressDifficultyTrends() {
        return {
            currentDifficulty: gameState.difficultyLevel || 'normal',
            recentAdjustments: gameState.difficultyAdjustments?.slice(-2) || []
        };
    }

    compressRecentLocations() {
        const locationHistory = gameState.locationHistory?.slice(-3) || [];
        return {
            recentLocations: locationHistory.map(l => l.name || l),
            currentTheme: gameState.adventureTheme
        };
    }

    compressExplorationPatterns() {
        return {
            explorationStyle: this.determineExplorationStyle(),
            preferredChoiceTypes: this.getPreferredChoiceTypes()
        };
    }

    compressNarrativePurposes() {
        return {
            currentNarrativeGoal: gameState.narrativeContext?.currentGoal || 'exploration',
            storyMomentum: gameState.narrativeContext?.momentum || 'building'
        };
    }

    compressPlotThreads() {
        const plotThreads = gameState.narrativeContext?.plotThreads || [];
        return {
            activeThreads: plotThreads.filter(t => t.status === 'active').length,
            mainQuestProgress: gameState.questProgress || 0
        };
    }

    compressCharacterArcs() {
        const players = gameState.players || [];
        return {
            characterCount: players.length,
            avgPersonalityDevelopment: this.calculateAvgPersonalityDevelopment(players)
        };
    }

    compressStoryMomentum() {
        return {
            currentTurn: gameState.turn || 0,
            recentEventTypes: this.getRecentEventTypes(),
            narrativePace: gameState.narrativeContext?.pace || 'moderate'
        };
    }

    compressRecentEncounters() {
        const encounters = gameState.encounterHistory?.slice(-3) || [];
        return {
            encounterTypes: [...new Set(encounters.map(e => e.type))],
            successRate: this.calculateEncounterSuccessRate(encounters)
        };
    }

    compressEncounterPatterns() {
        return {
            preferredEncounterTypes: this.getPreferredEncounterTypes(),
            avgEncounterDifficulty: this.getAvgEncounterDifficulty()
        };
    }

    compressPlayerPreferences() {
        return {
            preferredActions: this.getPlayerActionPreferences(),
            riskTolerance: this.calculateRiskTolerance(),
            explorationVsCombat: this.getExplorationCombatRatio()
        };
    }
    // Helper methods for compression functions
    getMostFrequentActions(combatHistory) {
        const actions = combatHistory.flatMap(c => c.actions || []);
        const actionCounts = {};
        actions.forEach(action => {
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });
        return Object.keys(actionCounts).sort((a, b) => actionCounts[b] - actionCounts[a]).slice(0, 3);
    }

    determineExplorationStyle() {
        const recentChoices = gameState.messageHistory?.slice(-5) || [];
        const cautiousChoices = recentChoices.filter(c => c.content?.includes('careful') || c.content?.includes('cautious')).length;
        const boldChoices = recentChoices.filter(c => c.content?.includes('bold') || c.content?.includes('aggressive')).length;
        
        if (cautiousChoices > boldChoices) return 'cautious';
        if (boldChoices > cautiousChoices) return 'bold';
        return 'balanced';
    }

    getPreferredChoiceTypes() {
        const recentChoices = gameState.messageHistory?.slice(-10) || [];
        const types = recentChoices.map(c => this.categorizeChoice(c.content || ''));
        const typeCounts = {};
        types.forEach(type => {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        return Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]).slice(0, 2);
    }

    categorizeChoice(choiceText) {
        if (choiceText.includes('attack') || choiceText.includes('fight')) return 'combat';
        if (choiceText.includes('explore') || choiceText.includes('investigate')) return 'exploration';
        if (choiceText.includes('talk') || choiceText.includes('negotiate')) return 'social';
        if (choiceText.includes('use') || choiceText.includes('item')) return 'item';
        return 'other';
    }

    calculateAvgPersonalityDevelopment(players) {
        if (!players.length) return 0;
        return players.reduce((sum, p) => sum + (p.personalityDevelopment || 0), 0) / players.length;
    }

    getRecentEventTypes() {
        const events = gameState.narrativeContext?.significantEvents?.slice(-3) || [];
        return [...new Set(events.map(e => e.type))];
    }

    calculateEncounterSuccessRate(encounters) {
        if (!encounters.length) return 0.5;
        const successes = encounters.filter(e => e.outcome === 'success').length;
        return successes / encounters.length;
    }

    getPreferredEncounterTypes() {
        const encounters = gameState.encounterHistory || [];
        const types = encounters.map(e => e.type);
        const typeCounts = {};
        types.forEach(type => {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        return Object.keys(typeCounts).sort((a, b) => typeCounts[b] - typeCounts[a]).slice(0, 2);
    }

    getAvgEncounterDifficulty() {
        const encounters = gameState.encounterHistory || [];
        if (!encounters.length) return 1;
        return encounters.reduce((sum, e) => sum + (e.difficulty || 1), 0) / encounters.length;
    }

    getPlayerActionPreferences() {
        const actions = gameState.messageHistory?.slice(-10) || [];
        return this.getMostFrequentActions(actions);
    }

    calculateRiskTolerance() {
        const recentChoices = gameState.messageHistory?.slice(-5) || [];
        const riskyChoices = recentChoices.filter(c => 
            c.content?.includes('risky') || c.content?.includes('dangerous') || c.content?.includes('bold')
        ).length;
        return riskyChoices / Math.max(recentChoices.length, 1);
    }

    getExplorationCombatRatio() {
        const recentActions = gameState.messageHistory?.slice(-10) || [];
        const explorationActions = recentActions.filter(a => this.categorizeChoice(a.content || '') === 'exploration').length;
        const combatActions = recentActions.filter(a => this.categorizeChoice(a.content || '') === 'combat').length;
        
        if (combatActions === 0) return explorationActions > 0 ? 'exploration_focused' : 'balanced';
        const ratio = explorationActions / combatActions;
        if (ratio > 1.5) return 'exploration_focused';
        if (ratio < 0.5) return 'combat_focused';
        return 'balanced';
    }

    compressGeneralContext(context) { return context; }

    prioritizeAgentContext(agentType, context) { return context; }
    getCrossAgentInsights(agentType) { return {}; }
    getCompressedSharedInsights(agentType) { return {}; }
    trackContextUsage(agentType, context) {
        const usage = this.estimateTokenUsage(context);
        this.contextUsage.set(agentType, usage);
    }
    recordCompressionEvent(agentType, original, compressed, ratio) {
        const stats = this.compressionStats.get(agentType) || [];
        stats.push({ original, compressed, ratio, timestamp: Date.now() });
        this.compressionStats.set(agentType, stats.slice(-10)); // Keep last 10
    }
    performEmergencyCleanup() {
        // Clean up old data
        const now = Date.now();
        const cleanupThreshold = 300000; // 5 minutes
        
        // Clean up old compression stats
        for (const [agentType, stats] of this.compressionStats.entries()) {
            const recentStats = stats.filter(s => (now - s.timestamp) < cleanupThreshold);
            this.compressionStats.set(agentType, recentStats);
        }
    }
}

// Export singleton instance
export const localAIContextOptimizer = new LocalAIContextOptimizer();

// Backward compatibility export
export const gemmaContextOptimizer = localAIContextOptimizer; // Legacy alias for compatibility
