// difficultyAdaptation.js
// Revolutionary Difficulty Adaptation AI Agent
// Dynamically scales challenge based on player performance and engagement

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import { generateId, clamp } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import { gemmaContextOptimizer } from './gemmaContextOptimizer.js?cb=014';

/**
 * Difficulty Adaptation Agent - Intelligently scales game challenge
 * Monitors player performance, engagement, and skill to provide optimal difficulty
 */
export class DifficultyAdaptationAgent {
    constructor() {
        // Performance tracking
        this.performanceHistory = new Map();       // playerId -> performance data
        this.combatPerformance = new Map();        // Combat success/failure tracking
        this.choicePatterns = new Map();           // Choice complexity preferences
        this.engagementMetrics = new Map();        // Player engagement indicators
        
        // Difficulty scaling
        this.difficultyProfiles = new Map();       // playerId -> difficulty profile
        this.adaptationHistory = new Map();        // Historical adaptations
        this.challengeMetrics = new Map();         // Current challenge levels
        
        // AI-driven analysis
        this.skillAssessment = new Map();          // AI-assessed player skills
        this.adaptationStrategies = new Map();     // Successful adaptation patterns
        this.performancePrediction = new Map();    // Predicted performance
        
        // Real-time monitoring
        this.sessionMetrics = new Map();           // Current session performance
        this.adaptationQueue = [];                 // Pending difficulty changes
        this.lastAdaptation = new Map();           // Cooldown tracking
        
        // Quality control
        this.adaptationQuality = new Map();        // Quality of past adaptations
        this.playerSatisfaction = new Map();       // Inferred satisfaction levels
        
        this.initializeDifficultySystem();
    }

    /**
     * Initialize difficulty adaptation system
     */
    initializeDifficultySystem() {
        const log = window.displayVisualError || console.log;
        
        // Initialize difficulty categories
        this.difficultyCategories = {
            combat: {
                name: 'Combat Difficulty',
                factors: ['enemy_strength', 'enemy_count', 'boss_complexity'],
                range: [0.5, 2.0],
                default: 1.0
            },
            narrative: {
                name: 'Narrative Complexity',
                factors: ['choice_complexity', 'consequence_depth', 'story_branching'],
                range: [0.6, 1.8],
                default: 1.0
            },
            resource: {
                name: 'Resource Management',
                factors: ['item_rarity', 'currency_gain', 'resource_costs'],
                range: [0.7, 1.5],
                default: 1.0
            },
            progression: {
                name: 'Progression Speed',
                factors: ['xp_gain', 'level_requirements', 'unlock_speed'],
                range: [0.8, 1.4],
                default: 1.0
            }
        };
        
        // Initialize performance indicators
        this.performanceIndicators = {
            combat_success_rate: { weight: 0.3, target: 0.7 },
            choice_engagement: { weight: 0.2, target: 0.8 },
            session_duration: { weight: 0.2, target: 0.75 },
            retry_frequency: { weight: 0.15, target: 0.2 },
            help_usage: { weight: 0.15, target: 0.3 }
        };
        
        log("DifficultyAdaptationAgent: Initialized with dynamic challenge scaling");
    }

    /**
     * Analyze and adapt difficulty based on player performance
     * @param {string} playerId - Player to analyze
     * @param {object} performanceData - Current performance metrics
     * @returns {Promise<object>} Difficulty adaptation analysis
     */
    async analyzeDifficultyAdaptation(playerId, performanceData) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Check adaptation cooldown
            if (this.isAdaptationOnCooldown(playerId)) {
                return { adapted: false, reason: 'cooldown' };
            }
            
            // Analyze current performance
            const performanceAnalysis = await this.analyzePlayerPerformance(playerId, performanceData);
            
            // Assess skill level
            const skillAssessment = await this.assessPlayerSkill(playerId, performanceAnalysis);
            
            // Determine adaptation needs
            const adaptationNeeds = await this.determineAdaptationNeeds(playerId, performanceAnalysis, skillAssessment);
            
            // Generate adaptation strategy
            const adaptationStrategy = await this.generateAdaptationStrategy(playerId, adaptationNeeds);
            
            // Apply difficulty changes
            const adaptationResult = await this.applyDifficultyAdaptation(playerId, adaptationStrategy);
            
            // Update tracking
            this.updateAdaptationHistory(playerId, adaptationResult);
            
            log(`DifficultyAdaptation: ${adaptationResult.adapted ? 'Adapted' : 'No change'} difficulty for ${playerId}`);
            
            return adaptationResult;
            
        } catch (error) {
            log(`DifficultyAdaptation: Analysis failed: ${error.message}`);
            return this.getFallbackAdaptation(playerId, performanceData);
        }
    }

    /**
     * Analyze player performance using AI
     * @param {string} playerId - Player ID
     * @param {object} performanceData - Performance metrics
     * @returns {Promise<object>} Performance analysis
     */
    async analyzePlayerPerformance(playerId, performanceData) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Build context for AI analysis
            const context = {
                playerId: playerId,
                currentPerformance: performanceData,
                historicalPerformance: this.getHistoricalPerformance(playerId),
                sessionMetrics: this.getSessionMetrics(playerId),
                currentDifficulty: this.getCurrentDifficulty(playerId)
            };
            
            // Optimize context for Gemma
            const optimizedContext = await gemmaContextOptimizer.optimizeContextForAgent('difficulty_adaptation', context);
            
            // Generate AI performance analysis
            const aiAnalysis = await this.generatePerformanceAnalysis(optimizedContext);
            
            if (aiAnalysis) {
                return aiAnalysis;
            }
            
        } catch (error) {
            log(`DifficultyAdaptation: AI performance analysis failed: ${error.message}`);
        }
        
        // Fallback to rule-based analysis
        return this.analyzePerformanceRuleBased(playerId, performanceData);
    }

    /**
     * Generate AI-driven performance analysis
     * @param {object} context - Optimized context
     * @returns {Promise<object>} AI performance analysis
     */
    async generatePerformanceAnalysis(context) {
        const prompt = `Analyze player performance for difficulty adaptation:

CURRENT PERFORMANCE:
- Combat Success Rate: ${context.currentPerformance?.combatSuccessRate || 'Unknown'}%
- Average Session Duration: ${context.currentPerformance?.sessionDuration || 'Unknown'} minutes
- Choice Engagement: ${context.currentPerformance?.choiceEngagement || 'Unknown'}%
- Help Usage Frequency: ${context.currentPerformance?.helpUsage || 'Unknown'}%

HISTORICAL TRENDS:
${JSON.stringify(context.historicalPerformance || {}, null, 2)}

CURRENT DIFFICULTY SETTINGS:
${JSON.stringify(context.currentDifficulty || {}, null, 2)}

Analyze and respond with JSON:
{
    "performance_assessment": {
        "overall_skill": "beginner|intermediate|advanced|expert",
        "combat_proficiency": 0.7,
        "narrative_engagement": 0.8,
        "learning_curve": "steep|moderate|gradual",
        "frustration_indicators": ["indicator1", "indicator2"],
        "mastery_indicators": ["indicator1", "indicator2"]
    },
    "adaptation_recommendations": {
        "combat_difficulty": "increase|decrease|maintain",
        "narrative_complexity": "increase|decrease|maintain",
        "resource_availability": "increase|decrease|maintain",
        "progression_speed": "increase|decrease|maintain"
    },
    "confidence_score": 0.85
}

Focus on creating an optimal challenge level that maintains engagement without causing frustration.`;

        try {
            // Show loading indicator for AI processing
            const UI = await import('./ui.js?cb=014');
            UI.showLoading(true, 'Adapting difficulty...');
            
            const response = await gemmaHT.processWithHyperthreading(prompt, 'difficulty_adaptation');
            
            if (response && response.includes('{')) {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
        } catch (error) {
            console.log(`DifficultyAdaptation: AI analysis parsing failed: ${error.message}`);
        } finally {
            // Hide loading indicator
            try {
                const UI = await import('./ui.js?cb=014');
                UI.showLoading(false);
            } catch (e) {
                // Ignore UI import errors
            }
        }
        
        return null;
    }

    /**
     * Rule-based performance analysis (fallback)
     * @param {string} playerId - Player ID
     * @param {object} performanceData - Performance metrics
     * @returns {object} Performance analysis
     */
    analyzePerformanceRuleBased(playerId, performanceData) {
        const combatSuccess = performanceData.combatSuccessRate || 0.5;
        const engagement = performanceData.choiceEngagement || 0.5;
        const sessionTime = performanceData.sessionDuration || 30;
        
        // Determine skill level
        let skillLevel = 'intermediate';
        if (combatSuccess > 0.8 && engagement > 0.8) {
            skillLevel = 'advanced';
        } else if (combatSuccess < 0.4 || engagement < 0.4) {
            skillLevel = 'beginner';
        }
        
        // Determine adaptation needs
        const adaptationRecommendations = {
            combat_difficulty: combatSuccess > 0.8 ? 'increase' : combatSuccess < 0.4 ? 'decrease' : 'maintain',
            narrative_complexity: engagement > 0.8 ? 'increase' : engagement < 0.5 ? 'decrease' : 'maintain',
            resource_availability: combatSuccess < 0.5 ? 'increase' : 'maintain',
            progression_speed: sessionTime < 15 ? 'increase' : sessionTime > 60 ? 'decrease' : 'maintain'
        };
        
        return {
            performance_assessment: {
                overall_skill: skillLevel,
                combat_proficiency: combatSuccess,
                narrative_engagement: engagement,
                learning_curve: 'moderate',
                frustration_indicators: combatSuccess < 0.3 ? ['low_combat_success'] : [],
                mastery_indicators: combatSuccess > 0.9 ? ['high_combat_success'] : []
            },
            adaptation_recommendations: adaptationRecommendations,
            confidence_score: 0.7,
            method: 'rule_based'
        };
    }

    /**
     * Apply difficulty adaptation based on strategy
     * @param {string} playerId - Player ID
     * @param {object} strategy - Adaptation strategy
     * @returns {Promise<object>} Adaptation result
     */
    async applyDifficultyAdaptation(playerId, strategy) {
        const log = window.displayVisualError || console.log;
        
        try {
            const adaptations = [];
            let adapted = false;
            
            // Apply combat difficulty changes
            if (strategy.combat_changes) {
                const combatResult = await this.adaptCombatDifficulty(playerId, strategy.combat_changes);
                if (combatResult.changed) {
                    adaptations.push(combatResult);
                    adapted = true;
                }
            }
            
            // Apply narrative complexity changes
            if (strategy.narrative_changes) {
                const narrativeResult = await this.adaptNarrativeComplexity(playerId, strategy.narrative_changes);
                if (narrativeResult.changed) {
                    adaptations.push(narrativeResult);
                    adapted = true;
                }
            }
            
            // Apply resource availability changes
            if (strategy.resource_changes) {
                const resourceResult = await this.adaptResourceAvailability(playerId, strategy.resource_changes);
                if (resourceResult.changed) {
                    adaptations.push(resourceResult);
                    adapted = true;
                }
            }
            
            // Update difficulty profile
            if (adapted) {
                this.updateDifficultyProfile(playerId, adaptations);
                this.setAdaptationCooldown(playerId);
            }
            
            log(`DifficultyAdaptation: Applied ${adaptations.length} adaptations for ${playerId}`);
            
            return {
                adapted: adapted,
                adaptations: adaptations,
                newDifficulty: this.getCurrentDifficulty(playerId),
                strategy: strategy
            };
            
        } catch (error) {
            log(`DifficultyAdaptation: Failed to apply adaptation: ${error.message}`);
            return { adapted: false, error: error.message };
        }
    }

    /**
     * Get current difficulty settings for player
     * @param {string} playerId - Player ID
     * @returns {object} Current difficulty settings
     */
    getCurrentDifficulty(playerId) {
        const profile = this.difficultyProfiles.get(playerId);
        if (!profile) {
            // Initialize default difficulty profile
            const defaultProfile = {
                combat: 1.0,
                narrative: 1.0,
                resource: 1.0,
                progression: 1.0,
                lastUpdate: Date.now()
            };
            this.difficultyProfiles.set(playerId, defaultProfile);
            return defaultProfile;
        }
        return profile;
    }

    /**
     * Helper methods (simplified implementations)
     */
    isAdaptationOnCooldown(playerId) {
        const lastAdaptation = this.lastAdaptation.get(playerId);
        return lastAdaptation && (Date.now() - lastAdaptation) < 300000; // 5 minute cooldown
    }

    assessPlayerSkill(playerId, analysis) { return Promise.resolve(analysis.performance_assessment); }
    determineAdaptationNeeds(playerId, analysis, skill) { return Promise.resolve(analysis.adaptation_recommendations); }
    generateAdaptationStrategy(playerId, needs) { 
        return Promise.resolve({
            combat_changes: needs.combat_difficulty !== 'maintain' ? { direction: needs.combat_difficulty, magnitude: 0.1 } : null,
            narrative_changes: needs.narrative_complexity !== 'maintain' ? { direction: needs.narrative_complexity, magnitude: 0.1 } : null,
            resource_changes: needs.resource_availability !== 'maintain' ? { direction: needs.resource_availability, magnitude: 0.1 } : null
        });
    }

    adaptCombatDifficulty(playerId, changes) { 
        return Promise.resolve({ changed: true, type: 'combat', change: changes }); 
    }
    adaptNarrativeComplexity(playerId, changes) { 
        return Promise.resolve({ changed: true, type: 'narrative', change: changes }); 
    }
    adaptResourceAvailability(playerId, changes) { 
        return Promise.resolve({ changed: true, type: 'resource', change: changes }); 
    }

    updateAdaptationHistory(playerId, result) {
        const history = this.adaptationHistory.get(playerId) || [];
        history.push({
            timestamp: Date.now(),
            result: result,
            turn: gameState.turn
        });
        this.adaptationHistory.set(playerId, history.slice(-10)); // Keep last 10
    }

    updateDifficultyProfile(playerId, adaptations) {
        const profile = this.getCurrentDifficulty(playerId);
        adaptations.forEach(adaptation => {
            if (adaptation.type === 'combat') {
                profile.combat = clamp(profile.combat + (adaptation.change.direction === 'increase' ? adaptation.change.magnitude : -adaptation.change.magnitude), 0.5, 2.0);
            }
            // Similar for other types...
        });
        profile.lastUpdate = Date.now();
        this.difficultyProfiles.set(playerId, profile);
    }

    setAdaptationCooldown(playerId) {
        this.lastAdaptation.set(playerId, Date.now());
    }

    getHistoricalPerformance(playerId) { return this.performanceHistory.get(playerId) || {}; }
    getSessionMetrics(playerId) { return this.sessionMetrics.get(playerId) || {}; }
    getFallbackAdaptation(playerId, data) { return { adapted: false, reason: 'fallback' }; }
}

// Export singleton instance
export const difficultyAdaptationAgent = new DifficultyAdaptationAgent();
