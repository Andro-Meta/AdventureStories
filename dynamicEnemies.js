// dynamicEnemies.js
// Revolutionary Dynamic Enemy Generation System with Theme Intelligence
// Replaces static enemy databases with intelligent, context-aware generation

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import { gemmaContextOptimizer } from './gemmaContextOptimizer.js?cb=014';

/**
 * Dynamic Enemy Registry - Generates contextually perfect enemies for infinite themes
 * Mirrors the architecture of DynamicItemRegistry and DynamicSpellRegistry
 */
export class DynamicEnemyRegistry {
    constructor() {
        // Core enemy storage
        this.generatedEnemies = new Map();        // enemyId -> enemy object
        this.contextualCache = new Map();         // contextKey -> [enemyIds]
        this.themePatterns = new Map();           // theme -> successful enemy patterns
        this.storyRelevantEnemies = new Map();    // storyContext -> [enemyIds]
        this.locationEnemies = new Map();         // location -> [enemyIds]
        
        // Enemy-specific intelligence
        this.enemyArchetypes = new Map();         // theme -> enemy archetypes
        this.difficultyScaling = new Map();      // turn -> difficulty parameters
        this.playerAdaptation = new Map();       // playerId -> enemy preferences
        
        // Performance optimization
        this.recentRequests = new Map();         // Prevent duplicate AI calls
        this.generationQueue = [];               // Queue for batch generation
        
        // Quality control & learning
        this.enemyQualityScores = new Map();     // enemyId -> quality score (0-1)
        this.playerFeedback = new Map();         // enemyId -> engagement score
        this.combatSuccess = new Map();          // enemyId -> challenge rating
        this.contextualRelevance = new Map();    // enemyId -> relevance scores
        
        this.initializeEnemyPatterns();
    }

    /**
     * Initialize enemy patterns for different themes and contexts
     */
    initializeEnemyPatterns() {
        // Enemy archetypes by theme
        this.enemyArchetypes.set('haunted_mansion', {
            types: ['ghost', 'poltergeist', 'shadow', 'possessed_object', 'spectral_guardian'],
            elements: ['spectral', 'dark', 'cold', 'psychic'],
            abilities: ['phase_through', 'terrify', 'drain_life', 'possess', 'manifest'],
            resistances: ['physical_immunity', 'cold_resistance', 'dark_immunity'],
            weaknesses: ['holy', 'light', 'salt', 'iron'],
            motivations: ['unfinished_business', 'territorial', 'vengeful', 'protective', 'confused']
        });

        this.enemyArchetypes.set('cyberpunk_city', {
            types: ['corporate_security', 'street_gang', 'rogue_ai', 'augmented_criminal', 'cyber_mercenary'],
            elements: ['tech', 'electric', 'digital', 'augmented'],
            abilities: ['hack_systems', 'emp_blast', 'augmented_strength', 'digital_assault', 'stealth_mode'],
            resistances: ['electric_immunity', 'digital_resistance', 'tech_immunity'],
            weaknesses: ['emp', 'virus', 'system_overload', 'analog_attacks'],
            motivations: ['corporate_orders', 'profit', 'territory', 'data_theft', 'revenge']
        });

        this.enemyArchetypes.set('medieval_castle', {
            types: ['knight', 'guard', 'assassin', 'court_mage', 'noble_duelist'],
            elements: ['steel', 'magic', 'holy', 'dark'],
            abilities: ['sword_mastery', 'shield_bash', 'spell_casting', 'tactical_formation', 'honor_code'],
            resistances: ['armor_protection', 'magic_resistance', 'discipline'],
            weaknesses: ['honor_bound', 'formation_breaking', 'magic_disruption'],
            motivations: ['duty', 'honor', 'orders', 'protection', 'ambition']
        });

        this.enemyArchetypes.set('space_station', {
            types: ['alien_scout', 'rogue_android', 'space_pirate', 'mutant_creature', 'security_drone'],
            elements: ['plasma', 'radiation', 'void', 'energy'],
            abilities: ['energy_weapons', 'zero_g_combat', 'life_support_sabotage', 'alien_tech', 'void_adaptation'],
            resistances: ['radiation_immunity', 'vacuum_resistance', 'energy_shields'],
            weaknesses: ['atmosphere_dependency', 'tech_disruption', 'gravity_manipulation'],
            motivations: ['survival', 'conquest', 'resources', 'territory', 'instinct']
        });

        this.enemyArchetypes.set('underwater_city', {
            types: ['mer_warrior', 'deep_sea_creature', 'corrupted_guardian', 'sea_witch', 'leviathan_spawn'],
            elements: ['water', 'pressure', 'bio', 'ancient'],
            abilities: ['water_manipulation', 'pressure_attacks', 'bio_toxins', 'ancient_magic', 'deep_adaptation'],
            resistances: ['water_immunity', 'pressure_resistance', 'cold_immunity'],
            weaknesses: ['dehydration', 'surface_pressure', 'fire', 'electricity'],
            motivations: ['territorial', 'ancient_duty', 'corruption', 'hunger', 'protection']
        });

        // Initialize difficulty scaling parameters
        this.initializeDifficultyScaling();
    }

    /**
     * Initialize difficulty scaling based on game progression
     */
    initializeDifficultyScaling() {
        // Base difficulty parameters that scale with turn progression
        for (let turn = 1; turn <= 100; turn++) {
            const progressRatio = Math.min(turn / 50, 2.0); // Cap at 2x difficulty
            
            this.difficultyScaling.set(turn, {
                baseHp: Math.floor(30 + (turn * 2.5)),
                baseAtk: Math.floor(8 + (turn * 1.2)),
                baseDef: Math.floor(3 + (turn * 0.8)),
                abilityCount: Math.min(1 + Math.floor(turn / 10), 4),
                statusChance: Math.min(0.1 + (turn * 0.01), 0.4),
                eliteChance: Math.min(0.05 + (turn * 0.005), 0.25),
                bossChance: Math.min(0.01 + (turn * 0.002), 0.1)
            });
        }
    }

    /**
     * Generate a contextually perfect enemy group
     * @param {number} count - Number of enemies to generate
     * @param {object} context - Current game context
     * @returns {Promise<Array>} Generated enemy group
     */
    async generateContextualEnemyGroup(count = 1, context = {}) {
        const log = window.displayVisualError || console.log;
        log(`Generating ${count} contextual enemies for ${context.theme || gameState.adventureTheme}`);

        const enemies = [];
        
        // Build comprehensive context key for caching
        const contextKey = this.buildContextKey(count, context);
        
        // Check cache first
        const cachedEnemies = this.contextualCache.get(contextKey);
        if (cachedEnemies && cachedEnemies.length >= count) {
            // Return highest quality cached enemies
            const bestEnemies = this.selectBestCachedEnemies(cachedEnemies, count);
            if (bestEnemies.length === count) {
                log(`DynamicEnemies: Using cached enemy group`);
                return bestEnemies;
            }
        }

        // Check if we've made this request recently
        if (this.recentRequests.has(contextKey)) {
            const timeSince = Date.now() - this.recentRequests.get(contextKey);
            if (timeSince < 5000) { // 5 second cooldown
                log(`DynamicEnemies: Request too recent, using fallback`);
                return this.generateFallbackEnemyGroup(count, context);
            }
        }

        // Analyze context for perfect theming
        const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
        
        // Build comprehensive context
        const enhancedContext = {
            ...context,
            theme: context.theme || gameState.adventureTheme,
            location: context.location || gameState.currentLocation,
            storyContext: context.storyContext || gameState.currentNarrative?.slice(-300),
            playerNeeds: this.analyzePlayerNeeds(context),
            difficultyTarget: this.calculateDifficultyTarget(context),
            thematicElements: contextualAnalysis.thematicElements,
            environmentalFactors: contextualAnalysis.environmentalFactors
        };

        try {
            this.recentRequests.set(contextKey, Date.now());
            
            // Generate each enemy in the group
            for (let i = 0; i < count; i++) {
                const enemyContext = {
                    ...enhancedContext,
                    groupPosition: i,
                    groupSize: count,
                    isLeader: i === 0 && count > 1
                };
                
                const generatedEnemy = await this.generateSingleEnemy(enemyContext);
                
                if (generatedEnemy) {
                    // Store in registry with quality analysis
                    this.storeGeneratedEnemy(generatedEnemy, contextKey, enemyContext);
                    enemies.push(generatedEnemy);
                    log(`DynamicEnemies: Generated enemy: ${generatedEnemy.name}`);
                } else {
                    // Fallback for this enemy
                    const fallbackEnemy = this.generateFallbackEnemy(enemyContext);
                    enemies.push(fallbackEnemy);
                }
            }
            
        } catch (error) {
            log(`DynamicEnemies: AI generation failed: ${error.message}`);
            // Fallback to template-based generation
            return this.generateFallbackEnemyGroup(count, context);
        }

        return enemies;
    }

    /**
     * Generate a single contextual enemy
     */
    async generateSingleEnemy(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get theme-specific enemy patterns
            const locationKey = this.getLocationKey(context.location);
            const enemyPatterns = this.enemyArchetypes.get(locationKey) || this.getGenericEnemyPatterns(context.theme);
            
            // Build AI prompt for enemy generation
            const enemyPrompt = this.buildEnemyGenerationPrompt(context, enemyPatterns);
            
            // Generate enemy using AI
            const aiResponse = await this.callEnemyAgent(enemyPrompt, 'enemy_generation');
            const enemyData = this.parseEnemyResponse(aiResponse, context, enemyPatterns);
            
            // Create enemy object with combat stats
            const enemy = {
                id: generateId('enemy'),
                name: enemyData.name,
                description: enemyData.description,
                archetype: enemyData.archetype,
                element: enemyData.element || 'Physical',
                
                // Combat stats
                hp: enemyData.hp,
                maxHp: enemyData.hp,
                atk: enemyData.atk,
                def: enemyData.def,
                
                // Special properties
                abilities: enemyData.abilities || [],
                resistances: enemyData.resistances || {},
                weaknesses: enemyData.weaknesses || [],
                statusAttacks: enemyData.statusAttacks || [],
                
                // Behavioral traits
                motivation: enemyData.motivation,
                behavior: enemyData.behavior || 'aggressive',
                intelligence: enemyData.intelligence || 'average',
                
                // Loot and rewards
                lootTier: enemyData.lootTier || Config.Tiers.LOW,
                lootChance: enemyData.lootChance || 0.3,
                
                // Dynamic properties
                isElite: enemyData.isElite || false,
                isBoss: enemyData.isBoss || false,
                isDefeated: false,
                
                // Context tracking
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            log(`Generated enemy: ${enemy.name} (${enemy.archetype})`);
            return enemy;
            
        } catch (error) {
            log(`Enemy generation failed: ${error.message}`);
            return this.generateFallbackEnemy(context);
        }
    }

    /**
     * Call the Enemy Agent for AI-driven generation
     */
    async callEnemyAgent(prompt, generationType) {
        try {
            // (Removed dead `apiProvider === 'aistudio'` Gemma-hyperthreading
            // branch. Local backend handles all generation now.)
            const AI = await import('./aiHandler.js?cb=014');
            const response = await AI.makeAICallForSystemAction(prompt, true);
            return response.narrative;
        } catch (error) {
            throw new Error(`Enemy agent failed: ${error.message}`);
        }
    }

    /**
     * Build AI prompt for enemy generation
     */
    buildEnemyGenerationPrompt(context, patterns) {
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        const difficulty = this.difficultyScaling.get(gameState.turn || 1);
        
        return `Create a contextually perfect enemy for a ${context.theme} adventure.

LOCATION CONTEXT:
- Setting: ${context.location?.name || 'Unknown'}
- Environment: ${context.environmentalFactors.join(', ') || 'general'}
- Story Context: ${context.storyContext || 'exploration'}

THEMATIC REQUIREMENTS:
- Theme: ${context.theme}
- Thematic Elements: ${context.thematicElements.join(', ') || 'general'}
- Enemy Types: ${patterns.types.join(', ')}
- Elements: ${patterns.elements.join(', ')}
- Abilities: ${patterns.abilities.join(', ')}

DIFFICULTY PARAMETERS:
- Target HP: ${difficulty.baseHp} (±20%)
- Target Attack: ${difficulty.baseAtk} (±20%)
- Target Defense: ${difficulty.baseDef} (±20%)
- Ability Count: ${difficulty.abilityCount}
- Group Position: ${context.groupPosition + 1} of ${context.groupSize}
- Is Leader: ${context.isLeader}

STORY INTEGRATION:
- Current Narrative: ${context.storyContext || 'general adventure'}
- Player Needs: ${context.playerNeeds.join(', ') || 'challenge'}
- Difficulty Target: ${context.difficultyTarget}

Create an enemy that is PERFECTLY thematic and appropriately challenging. Respond with ONLY a JSON object:
{
    "name": "Enemy name fitting the theme",
    "archetype": "Enemy type from the provided list",
    "description": "Rich physical and behavioral description",
    "element": "Primary element type",
    "hp": ${difficulty.baseHp},
    "atk": ${difficulty.baseAtk},
    "def": ${difficulty.baseDef},
    "abilities": ["ability1", "ability2"],
    "resistances": {"element": 0.5},
    "weaknesses": ["weakness1", "weakness2"],
    "statusAttacks": ["status1", "status2"],
    "motivation": "Why this enemy fights",
    "behavior": "aggressive|defensive|tactical|berserker",
    "intelligence": "low|average|high|genius",
    "lootTier": "${Config.Tiers.LOW}|${Config.Tiers.MEDIUM}|${Config.Tiers.HIGH}",
    "lootChance": 0.3,
    "isElite": ${context.isLeader && context.groupSize > 1},
    "isBoss": false
}`;
    }

    /**
     * Build context key for caching
     */
    buildContextKey(count, context) {
        const keyParts = [
            count,
            context.theme || gameState.adventureTheme,
            context.location?.name || 'unknown',
            context.storyContext?.slice(0, 50) || 'general',
            gameState.turn || 1,
            (context.playerNeeds || []).join(','),
            (context.thematicElements || []).slice(0, 3).join(',')
        ];
        
        return keyParts.join('|');
    }

    /**
     * Store generated enemy with quality analysis
     */
    storeGeneratedEnemy(enemy, contextKey, context) {
        const log = window.displayVisualError || console.log;
        
        // Store the enemy
        this.generatedEnemies.set(enemy.id, enemy);
        
        // Add to contextual cache
        if (!this.contextualCache.has(contextKey)) {
            this.contextualCache.set(contextKey, []);
        }
        this.contextualCache.get(contextKey).push(enemy.id);
        
        // Store story relevance
        if (context.storyContext) {
            const storyKey = context.storyContext.slice(0, 100);
            if (!this.storyRelevantEnemies.has(storyKey)) {
                this.storyRelevantEnemies.set(storyKey, []);
            }
            this.storyRelevantEnemies.get(storyKey).push(enemy.id);
        }
        
        // Store location relevance
        if (context.location) {
            const locationKey = context.location.name;
            if (!this.locationEnemies.has(locationKey)) {
                this.locationEnemies.set(locationKey, []);
            }
            this.locationEnemies.get(locationKey).push(enemy.id);
        }
        
        // Initialize quality score
        const initialQuality = this.calculateInitialQuality(enemy, context);
        this.enemyQualityScores.set(enemy.id, initialQuality);
        
        log(`Stored enemy ${enemy.id} with quality score: ${initialQuality.toFixed(2)}`);
    }

    /**
     * Select best cached enemies
     */
    selectBestCachedEnemies(enemyIds, count) {
        if (!enemyIds || enemyIds.length === 0) return [];
        
        const enemiesWithScores = enemyIds.map(enemyId => {
            const enemy = this.generatedEnemies.get(enemyId);
            const quality = this.enemyQualityScores.get(enemyId) || 0;
            return { enemy, quality };
        }).filter(item => item.enemy);
        
        // Sort by quality and take the best ones
        enemiesWithScores.sort((a, b) => b.quality - a.quality);
        
        return enemiesWithScores.slice(0, count).map(item => item.enemy);
    }

    /**
     * Calculate initial quality score
     */
    calculateInitialQuality(enemy, context) {
        let quality = 0.5; // Base quality
        
        // Theme relevance
        if (enemy.thematicElements && enemy.thematicElements.length > 0) {
            quality += 0.2;
        }
        
        // Difficulty appropriateness
        const targetDifficulty = this.difficultyScaling.get(gameState.turn || 1);
        const hpRatio = enemy.hp / targetDifficulty.baseHp;
        if (hpRatio >= 0.8 && hpRatio <= 1.2) {
            quality += 0.1;
        }
        
        // Ability variety
        if (enemy.abilities && enemy.abilities.length > 0) {
            quality += 0.1;
        }
        
        // Story integration
        if (enemy.motivation && enemy.motivation !== 'unknown') {
            quality += 0.1;
        }
        
        // Dynamic generation bonus
        if (enemy.isDynamic) {
            quality += 0.1;
        }
        
        return Math.min(quality, 1.0);
    }

    /**
     * Generate fallback enemy group
     */
    generateFallbackEnemyGroup(count, context) {
        const enemies = [];
        
        for (let i = 0; i < count; i++) {
            const enemyContext = {
                ...context,
                groupPosition: i,
                groupSize: count,
                isLeader: i === 0 && count > 1
            };
            
            enemies.push(this.generateFallbackEnemy(enemyContext));
        }
        
        return enemies;
    }

    /**
     * Generate fallback enemy using theme intelligence
     */
    generateFallbackEnemy(context) {
        const log = window.displayVisualError || console.log;
        log(`Generating fallback enemy for ${context.theme}`);
        
        try {
            // Use theme intelligence for fallback generation
            const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
            const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
            const difficulty = this.difficultyScaling.get(gameState.turn || 1);
            
            const locationKey = this.getLocationKey(context.location);
            const patterns = this.enemyArchetypes.get(locationKey) || this.getGenericEnemyPatterns(context.theme);
            
            const thematicElements = contextualAnalysis.thematicElements.slice(0, 2);
            const enemyName = thematicElements.length > 0 ? 
                `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} ${patterns.types[0] || 'Adversary'}` :
                `Mysterious ${patterns.types[0] || 'Adversary'}`;
            
            const enemy = {
                id: generateId('enemy'),
                name: enemyName,
                description: `A ${patterns.types[0] || 'mysterious'} adversary that appears in ${context.location?.name || 'this place'}.`,
                archetype: patterns.types[0] || 'unknown',
                element: patterns.elements[0] || 'Physical',
                
                // Combat stats with some variation
                hp: Math.floor(difficulty.baseHp * (0.8 + Math.random() * 0.4)),
                maxHp: Math.floor(difficulty.baseHp * (0.8 + Math.random() * 0.4)),
                atk: Math.floor(difficulty.baseAtk * (0.8 + Math.random() * 0.4)),
                def: Math.floor(difficulty.baseDef * (0.8 + Math.random() * 0.4)),
                
                // Basic abilities
                abilities: patterns.abilities?.slice(0, Math.min(2, difficulty.abilityCount)) || [],
                resistances: {},
                weaknesses: patterns.weaknesses?.slice(0, 1) || [],
                statusAttacks: [],
                
                // Basic traits
                motivation: patterns.motivations[0] || 'territorial',
                behavior: 'aggressive',
                intelligence: 'average',
                
                // Loot
                lootTier: Config.Tiers.LOW,
                lootChance: 0.3,
                
                // Properties
                isElite: context.isLeader && context.groupSize > 1,
                isBoss: false,
                isDefeated: false,
                
                // Context
                thematicElements: thematicElements,
                createdAt: Date.now(),
                isDynamic: false,
                isFallback: true
            };
            
            // Ensure HP is set correctly
            enemy.maxHp = enemy.hp;
            
            return enemy;
            
        } catch (error) {
            log(`Fallback enemy generation failed: ${error.message}`);
            return this.generateUltimateFallbackEnemy(context);
        }
    }

    /**
     * Generate ultimate fallback enemy
     */
    generateUltimateFallbackEnemy(context) {
        const difficulty = this.difficultyScaling.get(gameState.turn || 1);
        
        const enemy = {
            id: generateId('enemy'),
            name: 'Mysterious Adversary',
            description: 'A formidable opponent blocks your path.',
            archetype: 'unknown',
            element: 'Physical',
            
            hp: difficulty.baseHp,
            maxHp: difficulty.baseHp,
            atk: difficulty.baseAtk,
            def: difficulty.baseDef,
            
            abilities: [],
            resistances: {},
            weaknesses: [],
            statusAttacks: [],
            
            motivation: 'territorial',
            behavior: 'aggressive',
            intelligence: 'average',
            
            lootTier: Config.Tiers.LOW,
            lootChance: 0.3,
            
            isElite: false,
            isBoss: false,
            isDefeated: false,
            
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true,
            isUltimateFallback: true
        };
        
        return enemy;
    }

    // Helper methods
    getLocationKey(location) {
        if (!location?.name) return 'generic';
        
        const locationName = location.name.toLowerCase();
        
        if (locationName.includes('haunted') || locationName.includes('mansion') || locationName.includes('ghost')) {
            return 'haunted_mansion';
        }
        if (locationName.includes('cyber') || locationName.includes('city') || locationName.includes('corporate')) {
            return 'cyberpunk_city';
        }
        if (locationName.includes('castle') || locationName.includes('medieval') || locationName.includes('court')) {
            return 'medieval_castle';
        }
        if (locationName.includes('space') || locationName.includes('station') || locationName.includes('ship')) {
            return 'space_station';
        }
        if (locationName.includes('underwater') || locationName.includes('ocean') || locationName.includes('sea')) {
            return 'underwater_city';
        }
        
        return 'generic';
    }

    analyzePlayerNeeds(context) {
        const needs = [];
        
        if (context.storyContext?.includes('challenge')) needs.push('combat_challenge');
        if (context.storyContext?.includes('mystery')) needs.push('information_source');
        if (context.storyContext?.includes('guard')) needs.push('obstacle');
        if (gameState.turn && gameState.turn > 20) needs.push('elite_challenge');
        
        return needs.length > 0 ? needs : ['basic_combat'];
    }

    calculateDifficultyTarget(context) {
        const baseDifficulty = gameState.turn || 1;
        const playerCount = gameState.players?.length || 1;
        
        // Adjust for player count and story context
        let difficultyMultiplier = 1.0;
        if (context.storyContext?.includes('boss')) difficultyMultiplier = 1.5;
        if (context.storyContext?.includes('easy')) difficultyMultiplier = 0.7;
        if (context.storyContext?.includes('hard')) difficultyMultiplier = 1.3;
        
        return Math.floor(baseDifficulty * difficultyMultiplier);
    }

    getGenericEnemyPatterns(theme) {
        return {
            types: ['adversary', 'opponent', 'challenger', 'guardian'],
            elements: ['Physical', 'Energy', 'Elemental', 'Dark'],
            abilities: ['basic_attack', 'defensive_stance', 'power_strike'],
            resistances: [],
            weaknesses: ['strategy', 'teamwork'],
            motivations: ['territorial', 'aggressive', 'defensive', 'instinctual']
        };
    }

    parseEnemyResponse(response, context, patterns) {
        try {
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            return this.generateFallbackEnemyData(context, patterns);
        }
    }

    generateFallbackEnemyData(context, patterns) {
        const difficulty = this.difficultyScaling.get(gameState.turn || 1);
        
        return {
            name: `${patterns.types[0] || 'Adversary'}`,
            archetype: patterns.types[0] || 'unknown',
            description: 'A formidable opponent.',
            element: patterns.elements[0] || 'Physical',
            hp: difficulty.baseHp,
            atk: difficulty.baseAtk,
            def: difficulty.baseDef,
            abilities: patterns.abilities?.slice(0, 2) || [],
            resistances: {},
            weaknesses: patterns.weaknesses?.slice(0, 1) || [],
            statusAttacks: [],
            motivation: patterns.motivations[0] || 'territorial',
            behavior: 'aggressive',
            intelligence: 'average',
            lootTier: Config.Tiers.LOW,
            lootChance: 0.3,
            isElite: false,
            isBoss: false
        };
    }
}

// Initialize the dynamic enemy system
export const dynamicEnemyRegistry = new DynamicEnemyRegistry();

/**
 * Main entry point for generating enemies - replaces getBaseEnemiesForTheme
 * @param {string} theme - Adventure theme
 * @param {number} count - Number of enemies to generate
 * @param {object} context - Additional context for generation
 * @returns {Promise<Array>} Generated enemy group
 */
export async function generateDynamicEnemyGroup(theme, count = 1, context = {}) {
    const registry = gameState.dynamicEnemyRegistry || dynamicEnemyRegistry;
    
    // Build enhanced context
    const enhancedContext = {
        ...context,
        theme: theme || gameState.adventureTheme,
        location: context.location || gameState.currentLocation,
        turn: gameState.turn,
        storyContext: context.storyContext || gameState.currentNarrative?.slice(-300),
        recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || []
    };
    
    return await registry.generateContextualEnemyGroup(count, enhancedContext);
}

/**
 * Generate a single dynamic enemy
 * @param {string} theme - Adventure theme
 * @param {object} context - Generation context
 * @returns {Promise<object>} Generated enemy
 */
export async function generateDynamicEnemy(theme, context = {}) {
    const enemies = await generateDynamicEnemyGroup(theme, 1, context);
    return enemies[0];
}
