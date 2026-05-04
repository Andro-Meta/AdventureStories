// dynamicBosses.js
// Revolutionary Dynamic Boss Generation System with Theme Intelligence
// Specialized system for generating contextually perfect bosses for infinite themes

import { gameState, buildGameContextBlock } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import { gemmaContextOptimizer } from './gemmaContextOptimizer.js?cb=014';
import { localAIOrchestrator } from './localAIOrchestrator.js?cb=014';

/**
 * Dynamic Boss Registry - Generates contextually perfect bosses for infinite themes
 * Specialized for boss-level encounters with proper scaling and abilities
 */
export class DynamicBossRegistry {
    constructor() {
        // Core boss storage
        this.generatedBosses = new Map();        // bossId -> boss object
        this.contextualCache = new Map();        // contextKey -> [bossIds]
        this.themePatterns = new Map();          // theme -> successful boss patterns
        this.storyRelevantBosses = new Map();    // storyContext -> [bossIds]
        this.locationBosses = new Map();         // location -> [bossIds]
        
        // Boss-specific intelligence
        this.bossArchetypes = new Map();         // theme -> boss archetypes
        this.powerScaling = new Map();           // turn -> power parameters
        this.playerAdaptation = new Map();       // playerId -> boss preferences
        
        // Performance optimization
        this.recentRequests = new Map();        // Prevent duplicate AI calls
        this.generationQueue = [];              // Queue for batch generation
        
        // Quality control & learning
        this.bossQualityScores = new Map();     // bossId -> quality score (0-1)
        this.playerFeedback = new Map();        // bossId -> engagement score
        this.combatSuccess = new Map();         // bossId -> challenge rating
        this.contextualRelevance = new Map();   // bossId -> relevance scores
        
        this.initializeBossPatterns();
    }

    /**
     * Initialize boss archetypes for different themes and contexts
     */
    initializeBossPatterns() {
        // Boss archetypes by theme (these are AI generation guides, not static bosses)
        this.bossArchetypes.set('fantasy', {
            types: ['ancient_dragon', 'lich_lord', 'demon_prince', 'titan_guardian', 'dark_sorcerer'],
            powerSources: ['ancient_magic', 'divine_power', 'elemental_mastery', 'necromancy', 'primal_force'],
            motivations: ['world_domination', 'revenge', 'protecting_secrets', 'chaos_spreading', 'power_hunger']
        });
        
        this.bossArchetypes.set('cyberpunk', {
            types: ['ai_overlord', 'cyber_terrorist', 'corporate_tyrant', 'neural_hacker', 'synthetic_god'],
            powerSources: ['quantum_computing', 'neural_networks', 'corporate_resources', 'viral_code', 'data_manipulation'],
            motivations: ['digital_supremacy', 'corporate_control', 'information_warfare', 'consciousness_expansion', 'system_liberation']
        });
        
        this.bossArchetypes.set('space', {
            types: ['galactic_emperor', 'void_entity', 'alien_hivemind', 'rogue_ai', 'cosmic_horror'],
            powerSources: ['dark_energy', 'alien_technology', 'psychic_powers', 'quantum_manipulation', 'stellar_energy'],
            motivations: ['galactic_conquest', 'species_preservation', 'cosmic_balance', 'evolution_acceleration', 'universe_reshaping']
        });
        
        this.initializePowerScaling();
    }

    /**
     * Initialize power scaling for boss encounters
     */
    initializePowerScaling() {
        for (let turn = 1; turn <= 100; turn++) {
            const progressRatio = Math.min(turn / 50, 2.0);
            
            this.powerScaling.set(turn, {
                baseHp: Math.floor(150 + (turn * 8)),
                baseAtk: Math.floor(25 + (turn * 3)),
                baseDef: Math.floor(15 + (turn * 2)),
                abilityCount: Math.min(2 + Math.floor(turn / 8), 6),
                phaseCount: Math.min(1 + Math.floor(turn / 15), 4),
                specialPowers: Math.min(1 + Math.floor(turn / 10), 3),
                lootQuality: Math.min(turn / 20, 5)
            });
        }
    }

    /**
     * Generate a contextually perfect boss
     * @param {string} bossType - 'mini_boss', 'boss', or 'raid_boss'
     * @param {object} context - Current game context
     * @returns {Promise<Object>} Generated boss
     */
    async generateContextualBoss(bossType, context = {}) {
        const log = window.displayVisualError || console.log;
        log(`Generating ${bossType} for ${context.theme || gameState.adventureTheme}`);

        // Build comprehensive context key for caching
        const contextKey = this.buildBossContextKey(bossType, context);
        
        // Check cache first
        const cachedBoss = this.contextualCache.get(contextKey);
        if (cachedBoss && cachedBoss.length > 0) {
            const bestBoss = this.selectBestCachedBoss(cachedBoss);
            if (bestBoss) {
                log(`DynamicBosses: Using cached boss`);
                return bestBoss;
            }
        }

        // Check if we've made this request recently
        if (this.recentRequests.has(contextKey)) {
            const timeSince = Date.now() - this.recentRequests.get(contextKey);
            if (timeSince < 10000) { // 10 second cooldown for bosses
                log(`DynamicBosses: Request too recent, using fallback`);
                return this.generateFallbackBoss(bossType, context);
            }
        }

        // Analyze context for perfect theming
        const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
        
        // Build comprehensive boss context
        const enhancedContext = {
            ...context,
            theme: context.theme || gameState.adventureTheme,
            location: context.location || gameState.currentLocation,
            storyContext: context.storyContext || gameState.currentNarrative?.slice(-500),
            playerNeeds: this.analyzeBossNeeds(context),
            powerTarget: this.calculateBossPower(bossType, context),
            thematicElements: contextualAnalysis.thematicElements,
            environmentalFactors: contextualAnalysis.environmentalFactors,
            bossType: bossType
        };

        try {
            this.recentRequests.set(contextKey, Date.now());
            
            // Generate boss using specialized boss AI
            const boss = await this.generateSingleBoss(enhancedContext);
            
            if (boss) {
                // Store in cache and registry
                this.generatedBosses.set(boss.id, boss);
                this.updateCache(contextKey, boss.id);
                
                log(`Generated dynamic boss: ${boss.name}`);
                return boss;
            }
            
            log(`Boss generation failed, using fallback`);
            return this.generateFallbackBoss(bossType, context);
            
        } catch (error) {
            log(`Boss generation error: ${error.message}`);
            return this.generateFallbackBoss(bossType, context);
        }
    }

    /**
     * Generate a single boss with AI
     */
    async generateSingleBoss(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get theme-specific boss patterns
            const bossPatterns = this.bossArchetypes.get(context.theme) || this.getGenericBossPatterns(context.theme);
            
            // Build AI prompt for boss generation
            const bossPrompt = this.buildBossGenerationPrompt(context, bossPatterns);
            
            // Generate boss using AI
            const aiResponse = await this.callBossAgent(bossPrompt, 'boss_generation');
            const bossData = this.parseBossResponse(aiResponse, context, bossPatterns);
            
            // Create boss object with proper boss stats
            const boss = {
                id: generateId('dynamic_boss'),
                name: bossData.name,
                title: bossData.title || '',
                description: bossData.description,
                archetype: bossData.archetype,
                element: bossData.element || 'Physical',
                
                // Combat stats (boss-level)
                hp: bossData.hp,
                maxHp: bossData.hp,
                atk: bossData.atk,
                def: bossData.def,
                
                // Boss-specific properties
                isBoss: true,
                bossType: context.bossType,
                phases: bossData.phases || [],
                currentPhase: 0,
                abilities: bossData.abilities || [],
                abilityCooldowns: {},
                
                // Special properties
                resistances: bossData.resistances || {},
                weaknesses: bossData.weaknesses || [],
                immunities: bossData.immunities || [],
                
                // Behavioral traits
                motivation: bossData.motivation,
                behavior: bossData.behavior || 'strategic',
                intelligence: bossData.intelligence || 'genius',
                personality: bossData.personality || 'menacing',
                
                // Loot and rewards (boss-level)
                lootTier: bossData.lootTier || Config.Tiers.LEGENDARY,
                lootChance: 1.0, // Bosses always drop loot
                lootMultiplier: this.getBossLootMultiplier(context.bossType),
                experienceMultiplier: this.getBossExpMultiplier(context.bossType),
                
                // Dynamic properties
                isDefeated: false,
                statusEffects: [],
                
                // Context tracking
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            // Initialize ability cooldowns
            boss.abilities.forEach(ability => {
                boss.abilityCooldowns[ability] = 0;
            });
            
            log(`Generated boss: ${boss.name} (${boss.archetype})`);
            return boss;
            
        } catch (error) {
            log(`Boss generation failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Build AI prompt for boss generation
     */
    buildBossGenerationPrompt(context, patterns) {
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        const power = this.powerScaling.get(gameState.turn || 1);
        const gameCtx = buildGameContextBlock();

        return `${gameCtx}
Create a legendary ${context.bossType.replace('_', ' ')} for a ${context.theme} adventure.

THEME CONTEXT:
- Adventure Theme: ${context.theme}
- Custom Theme: ${context.customTheme || 'none'}
- Location: ${context.location?.name || 'Unknown'}
- Story Context: ${context.storyContext || 'exploration'}

BOSS REQUIREMENTS:
- Boss Type: ${context.bossType} (${this.getBossTypeDescription(context.bossType)})
- Power Level: Turn ${gameState.turn || 1} scaling
- Target HP: ~${power.baseHp}
- Target ATK: ~${power.baseAtk}
- Target DEF: ~${power.baseDef}
- Abilities: ${power.abilityCount} powerful abilities
- Phases: ${power.phaseCount} combat phases

THEMATIC ELEMENTS:
${context.thematicElements?.join(', ') || 'general adventure'}

ENVIRONMENTAL FACTORS:
${context.environmentalFactors?.join(', ') || 'standard environment'}

Generate a JSON response with:
{
  "name": "Epic boss name that fits the theme perfectly",
  "title": "Optional title/epithet",
  "description": "Detailed, atmospheric description",
  "archetype": "Boss archetype from theme",
  "element": "Primary element type",
  "hp": ${power.baseHp},
  "atk": ${power.baseAtk},
  "def": ${power.baseDef},
  "abilities": ["ability1", "ability2", "ability3"],
  "phases": [
    {
      "hpThreshold": 1.0,
      "abilities": ["phase1_ability"],
      "description": "Phase 1 description"
    }
  ],
  "resistances": {"element": 0.5},
  "weaknesses": {"element": 1.5},
  "motivation": "What drives this boss",
  "behavior": "Combat behavior style",
  "intelligence": "Intelligence level",
  "personality": "Personality traits",
  "lootTier": "${this.getBossLootTier(context.bossType)}"
}

Make the boss feel like a natural part of the ${context.theme} world with a memorable name and epic presence!`;
    }

    /**
     * Call the boss AI agent for generation
     */
    async callBossAgent(prompt, generationType) {
        try {
            // Use enhanced AI processing for bosses
            if (localAIOrchestrator) {
                
                const contextAnalysis = {
                    situationType: 'boss_generation',
                    requiredAgents: ['bosses'],
                    bossContext: {
                        generationType,
                        theme: gameState.adventureTheme,
                        customTheme: gameState.customThemeDescription,
                        currentLocation: gameState.currentLocation,
                        storyContext: gameState.currentNarrative?.slice(-300) || '',
                        recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || []
                    }
                };

                const result = await localAIOrchestrator.orchestrateAgents('boss_generation', contextAnalysis);
                if (result && result.bosses) {
                    return result.bosses;
                }
            }

            // Fallback to direct AI call (schema-constrained JSON, not narrative pipeline)
            const API = await import('./api_new.js?cb=014');
            const messages = [
                { role: 'system', content: 'You are a game data generator. Return only valid JSON matching the requested schema. No prose.' },
                { role: 'user', content: prompt }
            ];
            return await API.getAIResponseJSON(messages, { type: 'object' }, { max_tokens: 700, temperature: 0.7 });
        } catch (error) {
            throw new Error(`Boss agent failed: ${error.message}`);
        }
    }

    /**
     * Parse AI response for boss data
     */
    parseBossResponse(aiResponse, context, patterns) {
        try {
            const bossData = (aiResponse && typeof aiResponse === 'object') ? aiResponse : JSON.parse(aiResponse);
            
            // Validate and enhance boss data
            return {
                name: bossData.name || `${context.theme} Overlord`,
                title: bossData.title || '',
                description: bossData.description || `A powerful ${context.bossType.replace('_', ' ')} from the ${context.theme} realm`,
                archetype: bossData.archetype || 'overlord',
                element: bossData.element || 'Physical',
                hp: Math.max(bossData.hp || 200, this.powerScaling.get(gameState.turn || 1).baseHp),
                atk: Math.max(bossData.atk || 30, this.powerScaling.get(gameState.turn || 1).baseAtk),
                def: Math.max(bossData.def || 20, this.powerScaling.get(gameState.turn || 1).baseDef),
                abilities: bossData.abilities || ['BERSERKER_RAGE', 'DAMAGE_SHIELD'],
                phases: bossData.phases || [],
                resistances: bossData.resistances || {},
                weaknesses: bossData.weaknesses || {},
                motivation: bossData.motivation || 'power',
                behavior: bossData.behavior || 'aggressive',
                intelligence: bossData.intelligence || 'high',
                personality: bossData.personality || 'menacing',
                lootTier: bossData.lootTier || this.getBossLootTier(context.bossType)
            };
        } catch (error) {
            // Fallback parsing for non-JSON responses
            return this.parseNonJSONBossResponse(aiResponse, context);
        }
    }

    /**
     * Generate fallback boss when AI fails
     */
    generateFallbackBoss(bossType, context) {
        const power = this.powerScaling.get(gameState.turn || 1);
        const theme = context.theme || gameState.adventureTheme;
        
        return {
            id: generateId('fallback_boss'),
            name: `${this.getThemeAdjective(theme)} ${this.getBossTitle(bossType)}`,
            description: `A formidable ${bossType.replace('_', ' ')} that embodies the essence of the ${theme} realm`,
            archetype: 'overlord',
            element: 'Physical',
            
            hp: power.baseHp,
            maxHp: power.baseHp,
            atk: power.baseAtk,
            def: power.baseDef,
            
            isBoss: true,
            bossType: bossType,
            isDefeated: false,
            statusEffects: [],
            
            abilities: this.getFallbackAbilities(bossType),
            abilityCooldowns: {},
            phases: [],
            currentPhase: 0,
            
            lootTier: this.getBossLootTier(bossType),
            lootChance: 1.0,
            lootMultiplier: this.getBossLootMultiplier(bossType),
            experienceMultiplier: this.getBossExpMultiplier(bossType),
            
            isDynamic: false,
            isFallback: true,
            createdAt: Date.now()
        };
    }

    // Helper methods
    getBossTypeDescription(bossType) {
        switch (bossType) {
            case 'mini_boss': return 'Challenging sub-boss encounter';
            case 'boss': return 'Major boss encounter';
            case 'raid_boss': return 'Epic raid-level encounter';
            default: return 'Boss encounter';
        }
    }

    getBossLootTier(bossType) {
        switch (bossType) {
            case 'mini_boss': return Config.Tiers.HIGH;
            case 'boss': return Config.Tiers.LEGENDARY;
            case 'raid_boss': return Config.Tiers.GOD;
            default: return Config.Tiers.HIGH;
        }
    }

    getBossLootMultiplier(bossType) {
        switch (bossType) {
            case 'mini_boss': return 2.0;
            case 'boss': return 3.0;
            case 'raid_boss': return 5.0;
            default: return 2.0;
        }
    }

    getBossExpMultiplier(bossType) {
        switch (bossType) {
            case 'mini_boss': return 1.5;
            case 'boss': return 2.5;
            case 'raid_boss': return 4.0;
            default: return 1.5;
        }
    }

    getThemeAdjective(theme) {
        const adjectives = {
            fantasy: 'Ancient',
            cyberpunk: 'Neural',
            space: 'Galactic',
            pirate: 'Legendary',
            underwater: 'Abyssal',
            steampunk: 'Mechanical',
            horror: 'Nightmarish'
        };
        return adjectives[theme] || 'Mysterious';
    }

    getBossTitle(bossType) {
        switch (bossType) {
            case 'mini_boss': return 'Guardian';
            case 'boss': return 'Overlord';
            case 'raid_boss': return 'Sovereign';
            default: return 'Entity';
        }
    }

    getFallbackAbilities(bossType) {
        switch (bossType) {
            case 'mini_boss': return ['BERSERKER_RAGE', 'DAMAGE_SHIELD'];
            case 'boss': return ['BERSERKER_RAGE', 'DAMAGE_SHIELD', 'REGENERATION', 'TERROR_SCREAM'];
            case 'raid_boss': return ['BERSERKER_RAGE', 'DAMAGE_SHIELD', 'REGENERATION', 'TERROR_SCREAM', 'CALL_REINFORCEMENTS', 'LIGHTNING_CHAIN'];
            default: return ['BERSERKER_RAGE'];
        }
    }

    // Cache and utility methods
    buildBossContextKey(bossType, context) {
        return `${bossType}_${context.theme}_${context.location?.name || 'generic'}_${gameState.turn}`;
    }

    updateCache(contextKey, bossId) {
        if (!this.contextualCache.has(contextKey)) {
            this.contextualCache.set(contextKey, []);
        }
        this.contextualCache.get(contextKey).push(bossId);
        
        // Keep cache size manageable
        if (this.contextualCache.get(contextKey).length > 3) {
            this.contextualCache.get(contextKey).shift();
        }
    }

    selectBestCachedBoss(bossIds) {
        // Select highest quality cached boss
        let bestBoss = null;
        let bestScore = -1;
        
        for (const bossId of bossIds) {
            const boss = this.generatedBosses.get(bossId);
            if (boss) {
                const score = this.bossQualityScores.get(bossId) || 0.5;
                if (score > bestScore) {
                    bestScore = score;
                    bestBoss = boss;
                }
            }
        }
        
        return bestBoss;
    }

    analyzeBossNeeds(context) {
        return {
            challengeLevel: 'high',
            thematicRelevance: 'critical',
            storyIntegration: 'important'
        };
    }

    calculateBossPower(bossType, context) {
        const basePower = this.powerScaling.get(gameState.turn || 1);
        const multipliers = {
            mini_boss: 1.0,
            boss: 1.5,
            raid_boss: 2.5
        };
        
        const multiplier = multipliers[bossType] || 1.0;
        
        return {
            hp: Math.round(basePower.baseHp * multiplier),
            atk: Math.round(basePower.baseAtk * multiplier),
            def: Math.round(basePower.baseDef * multiplier)
        };
    }

    getGenericBossPatterns(theme) {
        return {
            types: ['overlord', 'guardian', 'destroyer', 'sovereign', 'entity'],
            powerSources: ['ancient_power', 'dark_energy', 'elemental_force', 'technological_supremacy', 'divine_authority'],
            motivations: ['domination', 'protection', 'revenge', 'conquest', 'chaos']
        };
    }

    parseNonJSONBossResponse(aiResponse, context) {
        // Basic parsing for non-JSON AI responses
        const power = this.powerScaling.get(gameState.turn || 1);
        
        return {
            name: this.extractNameFromResponse(aiResponse) || `${context.theme} Overlord`,
            description: this.extractDescriptionFromResponse(aiResponse) || `A powerful boss from the ${context.theme} realm`,
            archetype: 'overlord',
            element: 'Physical',
            hp: power.baseHp,
            atk: power.baseAtk,
            def: power.baseDef,
            abilities: ['BERSERKER_RAGE', 'DAMAGE_SHIELD'],
            lootTier: this.getBossLootTier(context.bossType)
        };
    }

    extractNameFromResponse(response) {
        // Simple name extraction logic
        const lines = response.split('\n');
        for (const line of lines) {
            if (line.toLowerCase().includes('name:')) {
                return line.split(':')[1]?.trim();
            }
        }
        return null;
    }

    extractDescriptionFromResponse(response) {
        // Simple description extraction logic
        const lines = response.split('\n');
        for (const line of lines) {
            if (line.toLowerCase().includes('description:')) {
                return line.split(':')[1]?.trim();
            }
        }
        return null;
    }
}

// Export the registry
export default DynamicBossRegistry;
