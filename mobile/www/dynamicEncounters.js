// dynamicEncounters.js
// Revolutionary Dynamic Encounter System with Theme Intelligence
// Generates NPCs, Puzzles, Anomalies, and Boss Battles with infinite theme adaptation

import { gameState, buildGameContextBlock } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as UI from './ui.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';

/**
 * Revolutionary Dynamic Encounter Registry
 * Generates contextually perfect encounters for infinite themes
 */
export class DynamicEncounterRegistry {
    constructor() {
        // Core encounter storage
        this.generatedEncounters = new Map();     // encounterId -> encounter object
        this.contextualCache = new Map();         // contextKey -> [encounterIds]
        this.themePatterns = new Map();           // theme -> successful encounter patterns
        this.storyRelevantEncounters = new Map(); // storyContext -> [encounterIds]
        
        // Encounter-specific intelligence
        this.npcPersonalities = new Map();        // theme -> personality patterns
        this.puzzleTypes = new Map();             // theme -> puzzle categories
        this.anomalyPatterns = new Map();         // theme -> anomaly types
        this.bossArchetypes = new Map();          // theme -> boss patterns
        
        // Quality and learning
        this.encounterQuality = new Map();        // encounterId -> quality score
        this.playerFeedback = new Map();          // encounterId -> engagement score
        this.storyImpact = new Map();             // encounterId -> narrative impact
        
        // Performance optimization (missing from original)
        this.recentRequests = new Map();          // Prevent duplicate AI calls
        this.generationQueue = [];                // Queue for batch generation
        
        this.initializeEncounterPatterns();
    }

    /**
     * Initialize encounter patterns for different themes and contexts
     */
    initializeEncounterPatterns() {
        // NPC personality patterns by theme
        this.npcPersonalities.set('haunted_mansion', {
            types: ['ghost', 'medium', 'paranormal_investigator', 'caretaker', 'previous_victim'],
            traits: ['ethereal', 'mysterious', 'fearful', 'knowledgeable', 'tormented'],
            motivations: ['seeking_peace', 'warning_others', 'solving_mystery', 'protecting_secrets'],
            interactions: ['cryptic_messages', 'spectral_guidance', 'fearful_warnings', 'supernatural_aid']
        });

        this.npcPersonalities.set('cyberpunk_city', {
            types: ['corporate_agent', 'street_hacker', 'augmented_citizen', 'ai_construct', 'data_broker'],
            traits: ['cynical', 'augmented', 'paranoid', 'street_smart', 'corporate'],
            motivations: ['profit', 'information', 'survival', 'corporate_agenda', 'rebellion'],
            interactions: ['data_exchange', 'hacking_challenge', 'corporate_negotiation', 'street_deal']
        });

        this.npcPersonalities.set('medieval_castle', {
            types: ['knight', 'noble', 'servant', 'court_wizard', 'merchant', 'bard'],
            traits: ['honorable', 'noble', 'loyal', 'cunning', 'wise', 'ambitious'],
            motivations: ['honor', 'duty', 'power', 'knowledge', 'wealth', 'love'],
            interactions: ['formal_audience', 'knightly_challenge', 'court_intrigue', 'magical_consultation']
        });

        // Puzzle patterns by theme
        this.puzzleTypes.set('haunted_mansion', {
            categories: ['séance_ritual', 'ghost_communication', 'supernatural_lock', 'spirit_puzzle', 'occult_riddle'],
            mechanics: ['symbol_matching', 'spiritual_energy', 'ghost_memory', 'supernatural_logic'],
            themes: ['death', 'memory', 'unfinished_business', 'supernatural_knowledge']
        });

        this.puzzleTypes.set('cyberpunk_city', {
            categories: ['hacking_challenge', 'digital_maze', 'encryption_puzzle', 'neural_interface', 'corporate_security'],
            mechanics: ['code_breaking', 'system_navigation', 'data_analysis', 'neural_pattern'],
            themes: ['information', 'access', 'corporate_secrets', 'digital_identity']
        });

        this.puzzleTypes.set('medieval_castle', {
            categories: ['heraldic_puzzle', 'ancient_riddle', 'mechanical_lock', 'courtly_etiquette', 'magical_ward'],
            mechanics: ['symbol_knowledge', 'logical_deduction', 'social_navigation', 'magical_understanding'],
            themes: ['honor', 'lineage', 'ancient_wisdom', 'courtly_knowledge']
        });

        // Anomaly patterns by theme
        this.anomalyPatterns.set('haunted_mansion', {
            types: ['temporal_echo', 'spectral_manifestation', 'reality_distortion', 'supernatural_phenomenon'],
            effects: ['time_slip', 'ghost_appearance', 'temperature_drop', 'unexplained_sounds'],
            consequences: ['reveal_history', 'supernatural_encounter', 'psychic_damage', 'story_revelation']
        });

        this.anomalyPatterns.set('cyberpunk_city', {
            types: ['data_glitch', 'reality_hack', 'neural_feedback', 'corporate_interference'],
            effects: ['system_malfunction', 'augmentation_glitch', 'memory_corruption', 'surveillance_spike'],
            consequences: ['information_leak', 'corporate_attention', 'system_access', 'identity_exposure']
        });

        this.anomalyPatterns.set('medieval_castle', {
            types: ['magical_surge', 'divine_intervention', 'ancient_curse', 'prophetic_vision'],
            effects: ['magical_manifestation', 'divine_sign', 'curse_activation', 'prophetic_dream'],
            consequences: ['magical_knowledge', 'divine_blessing', 'curse_effect', 'future_insight']
        });
    }

    /**
     * Generate a contextually perfect encounter
     * @param {string} encounterType - Type of encounter (npc, puzzle, anomaly, boss)
     * @param {object} context - Current game context
     * @returns {Promise<object>} Generated encounter
     */
    async generateContextualEncounter(encounterType, context = {}) {
        const log = window.displayVisualError || console.log;
        log(`Generating ${encounterType} encounter for ${context.theme || gameState.adventureTheme}`);

        // Analyze context for perfect theming
        const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
        
        // Build comprehensive context
        const enhancedContext = {
            ...context,
            theme: context.theme || gameState.adventureTheme,
            location: context.location || gameState.currentLocation,
            storyContext: context.storyContext || gameState.currentNarrative?.slice(-300),
            playerNeeds: this.analyzePlayerNeeds(context),
            narrativeGoals: this.analyzeNarrativeGoals(context),
            thematicElements: contextualAnalysis.thematicElements,
            environmentalFactors: contextualAnalysis.environmentalFactors
        };

        // Generate encounter based on type
        switch (encounterType) {
            case 'npc':
                return await this.generateNPCEncounter(enhancedContext);
            case 'puzzle':
                return await this.generatePuzzleEncounter(enhancedContext);
            case 'anomaly':
                return await this.generateAnomalyEncounter(enhancedContext);
            case 'boss':
                return await this.generateBossEncounter(enhancedContext);
            case 'chance':
                return await this.generateChanceEncounter(enhancedContext);
            default:
                return await this.generateChanceEncounter(enhancedContext);
        }
    }

    /**
     * Generate theme-perfect NPC encounter
     */
    async generateNPCEncounter(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get theme-specific NPC patterns
            const locationKey = this.getLocationKey(context.location);
            const npcPatterns = this.npcPersonalities.get(locationKey) || this.getGenericNPCPatterns(context.theme);
            
            // Build AI prompt for NPC generation
            const npcPrompt = this.buildNPCGenerationPrompt(context, npcPatterns);
            
            // Generate NPC using AI
            const aiResponse = await this.callEncounterAgent(npcPrompt, 'npc_generation');
            const npcData = this.parseNPCResponse(aiResponse, context, npcPatterns);
            
            // Create encounter object
            const encounter = {
                id: generateId('npc_encounter'),
                type: 'npc',
                subtype: npcData.type,
                npc: {
                    id: generateId('npc'),
                    name: npcData.name,
                    description: npcData.description,
                    personality: npcData.personality,
                    motivation: npcData.motivation,
                    knowledge: npcData.knowledge,
                    abilities: npcData.abilities || [],
                    dialogue: npcData.dialogue || {},
                    questHooks: npcData.questHooks || []
                },
                interaction: {
                    type: npcData.interactionType,
                    options: npcData.interactionOptions || [],
                    consequences: npcData.consequences || {}
                },
                storyImpact: npcData.storyImpact || 'minor',
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            log(`Generated NPC encounter: ${encounter.npc.name} (${encounter.npc.personality})`);
            return encounter;
            
        } catch (error) {
            log(`NPC generation failed: ${error.message}`);
            return this.generateFallbackNPCEncounter(context);
        }
    }

    /**
     * Generate theme-perfect puzzle encounter
     */
    async generatePuzzleEncounter(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get theme-specific puzzle patterns
            const locationKey = this.getLocationKey(context.location);
            const puzzlePatterns = this.puzzleTypes.get(locationKey) || this.getGenericPuzzlePatterns(context.theme);
            
            // Build AI prompt for puzzle generation
            const puzzlePrompt = this.buildPuzzleGenerationPrompt(context, puzzlePatterns);
            
            // Generate puzzle using AI
            const aiResponse = await this.callEncounterAgent(puzzlePrompt, 'puzzle_generation');
            const puzzleData = this.parsePuzzleResponse(aiResponse, context, puzzlePatterns);
            
            // Create encounter object
            const encounter = {
                id: generateId('puzzle_encounter'),
                type: 'puzzle',
                subtype: puzzleData.category,
                puzzle: {
                    id: generateId('puzzle'),
                    name: puzzleData.name,
                    description: puzzleData.description,
                    category: puzzleData.category,
                    difficulty: puzzleData.difficulty,
                    mechanism: puzzleData.mechanism,
                    solution: puzzleData.solution,
                    hints: puzzleData.hints || [],
                    rewards: puzzleData.rewards || {},
                    failureConsequences: puzzleData.failureConsequences || {}
                },
                interaction: {
                    type: 'puzzle_solving',
                    attempts: 0,
                    maxAttempts: puzzleData.maxAttempts || 3,
                    timeLimit: puzzleData.timeLimit || null
                },
                storyImpact: puzzleData.storyImpact || 'moderate',
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            log(`Generated puzzle encounter: ${encounter.puzzle.name} (${encounter.puzzle.category})`);
            return encounter;
            
        } catch (error) {
            log(`Puzzle generation failed: ${error.message}`);
            return this.generateFallbackPuzzleEncounter(context);
        }
    }

    /**
     * Generate theme-perfect anomaly encounter
     */
    async generateAnomalyEncounter(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get theme-specific anomaly patterns
            const locationKey = this.getLocationKey(context.location);
            const anomalyPatterns = this.anomalyPatterns.get(locationKey) || this.getGenericAnomalyPatterns(context.theme);
            
            // Build AI prompt for anomaly generation
            const anomalyPrompt = this.buildAnomalyGenerationPrompt(context, anomalyPatterns);
            
            // Generate anomaly using AI
            const aiResponse = await this.callEncounterAgent(anomalyPrompt, 'anomaly_generation');
            const anomalyData = this.parseAnomalyResponse(aiResponse, context, anomalyPatterns);
            
            // Create encounter object
            const encounter = {
                id: generateId('anomaly_encounter'),
                type: 'anomaly',
                subtype: anomalyData.type,
                anomaly: {
                    id: generateId('anomaly'),
                    name: anomalyData.name,
                    description: anomalyData.description,
                    type: anomalyData.type,
                    intensity: anomalyData.intensity,
                    effects: anomalyData.effects || [],
                    duration: anomalyData.duration,
                    consequences: anomalyData.consequences || {},
                    investigation: anomalyData.investigation || {}
                },
                interaction: {
                    type: 'anomaly_response',
                    options: anomalyData.responseOptions || [],
                    skillChecks: anomalyData.skillChecks || []
                },
                storyImpact: anomalyData.storyImpact || 'significant',
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            log(`Generated anomaly encounter: ${encounter.anomaly.name} (${encounter.anomaly.type})`);
            return encounter;
            
        } catch (error) {
            log(`Anomaly generation failed: ${error.message}`);
            return this.generateFallbackAnomalyEncounter(context);
        }
    }

    /**
     * Generate theme-perfect boss encounter
     */
    async generateBossEncounter(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Analyze context for boss generation
            const bossContext = {
                ...context,
                powerLevel: this.calculateBossPowerLevel(context),
                storySignificance: this.analyzeBossStoryRole(context),
                thematicRole: this.determineBossThematicRole(context)
            };
            
            // Build AI prompt for boss generation
            const bossPrompt = this.buildBossGenerationPrompt(bossContext);
            
            // Generate boss using AI
            const aiResponse = await this.callEncounterAgent(bossPrompt, 'boss_generation');
            const bossData = this.parseBossResponse(aiResponse, bossContext);
            
            // Create encounter object with full boss data
            const encounter = {
                id: generateId('boss_encounter'),
                type: 'boss',
                subtype: bossData.archetype,
                boss: {
                    id: generateId('boss'),
                    name: bossData.name,
                    title: bossData.title,
                    description: bossData.description,
                    archetype: bossData.archetype,
                    powerLevel: bossContext.powerLevel,
                    phases: bossData.phases || [],
                    abilities: bossData.abilities || [],
                    weaknesses: bossData.weaknesses || [],
                    lore: bossData.lore || {},
                    combatStats: this.generateBossCombatStats(bossData, bossContext)
                },
                encounter: {
                    setupDescription: bossData.setupDescription,
                    entryConditions: bossData.entryConditions || {},
                    environmentalHazards: bossData.environmentalHazards || [],
                    victoryConditions: bossData.victoryConditions || {}
                },
                storyImpact: 'major',
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            log(`Generated boss encounter: ${encounter.boss.name} - ${encounter.boss.title}`);
            return encounter;
            
        } catch (error) {
            log(`Boss generation failed: ${error.message}`);
            return this.generateFallbackBossEncounter(context);
        }
    }

    /**
     * Generate chance encounter (random event)
     */
    async generateChanceEncounter(context) {
        const encounterTypes = ['npc', 'puzzle', 'anomaly'];
        const randomType = getRandomElement(encounterTypes);
        
        // Add randomness to context
        const chanceContext = {
            ...context,
            isChanceEncounter: true,
            randomFactor: Math.random()
        };
        
        return await this.generateContextualEncounter(randomType, chanceContext);
    }

    // AI Generation Methods
    async callEncounterAgent(prompt, generationType) {
        try {
            const API = await import('./api_new.js?cb=014');
            const messages = [
                { role: 'system', content: 'You are a game data generator. Return only valid JSON matching the requested schema. No prose.' },
                { role: 'user', content: prompt }
            ];
            return await API.getAIResponseJSON(messages, { type: 'object' }, { max_tokens: 600, temperature: 0.7 });
        } catch (error) {
            throw new Error(`Encounter agent failed: ${error.message}`);
        }
    }

    /**
     * Build context key for caching (CRITICAL MISSING METHOD)
     */
    buildContextKey(encounterType, context) {
        const keyParts = [
            encounterType,
            context.theme || gameState.adventureTheme,
            context.location?.name || 'unknown',
            context.storyContext?.slice(0, 50) || 'general',
            (context.playerNeeds || []).join(','),
            (context.thematicElements || []).slice(0, 3).join(',')
        ];
        
        return keyParts.join('|');
    }

    /**
     * Store generated encounter with quality analysis (CRITICAL MISSING METHOD)
     */
    storeGeneratedEncounter(encounter, contextKey, context) {
        const log = window.displayVisualError || console.log;
        
        // Store the encounter
        this.generatedEncounters.set(encounter.id, encounter);
        
        // Add to contextual cache
        if (!this.contextualCache.has(contextKey)) {
            this.contextualCache.set(contextKey, []);
        }
        this.contextualCache.get(contextKey).push(encounter.id);
        
        // Store story relevance
        if (context.storyContext) {
            const storyKey = context.storyContext.slice(0, 100);
            if (!this.storyRelevantEncounters.has(storyKey)) {
                this.storyRelevantEncounters.set(storyKey, []);
            }
            this.storyRelevantEncounters.get(storyKey).push(encounter.id);
        }
        
        // Initialize quality score
        const initialQuality = this.calculateInitialQuality(encounter, context);
        this.encounterQuality.set(encounter.id, initialQuality);
        
        log(`Stored encounter ${encounter.id} with quality score: ${initialQuality.toFixed(2)}`);
    }

    /**
     * Select best cached encounter (CRITICAL MISSING METHOD)
     */
    selectBestCachedEncounter(encounterIds) {
        if (!encounterIds || encounterIds.length === 0) return null;
        
        let bestEncounter = null;
        let bestScore = -1;
        
        for (const encounterId of encounterIds) {
            const encounter = this.generatedEncounters.get(encounterId);
            const quality = this.encounterQuality.get(encounterId) || 0;
            
            if (encounter && quality > bestScore) {
                bestScore = quality;
                bestEncounter = encounter;
            }
        }
        
        return bestEncounter;
    }

    /**
     * Calculate initial quality score (CRITICAL MISSING METHOD)
     */
    calculateInitialQuality(encounter, context) {
        let quality = 0.5; // Base quality
        
        // Theme relevance
        if (encounter.thematicElements && encounter.thematicElements.length > 0) {
            quality += 0.2;
        }
        
        // Story integration
        if (encounter.storyImpact === 'major') quality += 0.2;
        else if (encounter.storyImpact === 'moderate') quality += 0.1;
        
        // Contextual appropriateness
        if (context.playerNeeds && context.playerNeeds.length > 0) {
            quality += 0.1;
        }
        
        // Dynamic generation bonus
        if (encounter.isDynamic) {
            quality += 0.1;
        }
        
        return Math.min(quality, 1.0);
    }

    /**
     * Generate fallback encounter (CRITICAL MISSING METHOD)
     */
    generateFallbackEncounter(encounterType, context) {
        const log = window.displayVisualError || console.log;
        log(`Generating fallback ${encounterType} encounter`);
        
        try {
            // Use theme intelligence for fallback generation
            const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
            const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
            
            const encounterId = generateId(`${encounterType}_fallback`);
            const thematicElements = contextualAnalysis.thematicElements.slice(0, 2);
            
            switch (encounterType) {
                case 'npc':
                    return this.generateFallbackNPCEncounter(context, encounterId, thematicElements, adaptation);
                case 'puzzle':
                    return this.generateFallbackPuzzleEncounter(context, encounterId, thematicElements, adaptation);
                case 'anomaly':
                    return this.generateFallbackAnomalyEncounter(context, encounterId, thematicElements, adaptation);
                case 'boss':
                    return this.generateFallbackBossEncounter(context, encounterId, thematicElements, adaptation);
                default:
                    return this.generateFallbackGenericEncounter(context, encounterId, thematicElements, adaptation);
            }
        } catch (error) {
            log(`Fallback encounter generation failed: ${error.message}`);
            return this.generateUltimateFallbackEncounter(encounterType, context);
        }
    }

    // Prompt Building Methods
    buildNPCGenerationPrompt(context, patterns) {
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        const gameCtx = buildGameContextBlock();
        return `${gameCtx}
Create a contextually perfect NPC for a ${context.theme} adventure.

LOCATION CONTEXT:
- Setting: ${context.location?.name || 'Unknown'}
- Environment: ${context.environmentalFactors.join(', ') || 'general'}
- Story Context: ${context.storyContext || 'exploration'}

THEMATIC REQUIREMENTS:
- Theme: ${context.theme}
- Thematic Elements: ${context.thematicElements.join(', ') || 'general'}
- NPC Types: ${patterns.types.join(', ')}
- Personality Traits: ${patterns.traits.join(', ')}
- Motivations: ${patterns.motivations.join(', ')}

STORY INTEGRATION:
- Current Narrative: ${context.storyContext || 'general adventure'}
- Player Needs: ${context.playerNeeds.join(', ') || 'interaction'}
- Narrative Goals: ${context.narrativeGoals.join(', ') || 'progression'}

Create an NPC that is PERFECTLY thematic and story-relevant. Respond with ONLY a JSON object:
{
    "name": "NPC name fitting the theme",
    "type": "NPC type from the provided list",
    "description": "Rich physical and personality description",
    "personality": "Dominant personality trait",
    "motivation": "Primary motivation driving the NPC",
    "knowledge": "What the NPC knows about the story/location",
    "abilities": ["special", "abilities", "if", "any"],
    "dialogue": {
        "greeting": "Initial dialogue",
        "information": "Key information they can share",
        "request": "What they might ask of players"
    },
    "interactionType": "Type of interaction (conversation, challenge, trade, etc.)",
    "interactionOptions": ["option1", "option2", "option3"],
    "consequences": {
        "positive": "Good outcome description",
        "negative": "Bad outcome description"
    },
    "questHooks": ["potential", "story", "hooks"],
    "storyImpact": "minor|moderate|major"
}`;
    }

    buildPuzzleGenerationPrompt(context, patterns) {
        const gameCtx = buildGameContextBlock();
        return `${gameCtx}
Create a contextually perfect puzzle for a ${context.theme} adventure.

LOCATION CONTEXT:
- Setting: ${context.location?.name || 'Unknown'}
- Environment: ${context.environmentalFactors.join(', ') || 'general'}
- Story Context: ${context.storyContext || 'exploration'}

THEMATIC REQUIREMENTS:
- Theme: ${context.theme}
- Puzzle Categories: ${patterns.categories.join(', ')}
- Mechanics: ${patterns.mechanics.join(', ')}
- Themes: ${patterns.themes.join(', ')}

Create a puzzle that is PERFECTLY thematic and story-integrated. Respond with ONLY a JSON object:
{
    "name": "Puzzle name fitting the theme",
    "category": "Category from the provided list",
    "description": "Rich description of the puzzle setup",
    "difficulty": "easy|medium|hard|expert",
    "mechanism": "How the puzzle works mechanically",
    "solution": "The correct solution or approach",
    "hints": ["hint1", "hint2", "hint3"],
    "rewards": {
        "success": "Reward for solving",
        "information": "Story information revealed"
    },
    "failureConsequences": {
        "minor": "Small failure consequence",
        "major": "Major failure consequence"
    },
    "maxAttempts": 3,
    "timeLimit": null,
    "storyImpact": "minor|moderate|major"
}`;
    }

    buildAnomalyGenerationPrompt(context, patterns) {
        const gameCtx = buildGameContextBlock();
        return `${gameCtx}
Create a contextually perfect anomaly for a ${context.theme} adventure.

LOCATION CONTEXT:
- Setting: ${context.location?.name || 'Unknown'}
- Environment: ${context.environmentalFactors.join(', ') || 'general'}
- Story Context: ${context.storyContext || 'exploration'}

THEMATIC REQUIREMENTS:
- Theme: ${context.theme}
- Anomaly Types: ${patterns.types.join(', ')}
- Effects: ${patterns.effects.join(', ')}
- Consequences: ${patterns.consequences.join(', ')}

Create an anomaly that is PERFECTLY thematic and story-relevant. Respond with ONLY a JSON object:
{
    "name": "Anomaly name fitting the theme",
    "type": "Type from the provided list",
    "description": "Rich description of the anomalous event",
    "intensity": "low|medium|high|extreme",
    "effects": ["immediate", "effects", "of", "anomaly"],
    "duration": "How long the anomaly lasts",
    "consequences": {
        "immediate": "Immediate consequences",
        "longTerm": "Long-term story effects"
    },
    "investigation": {
        "clues": ["clue1", "clue2"],
        "skillChecks": ["required", "skills"]
    },
    "responseOptions": ["option1", "option2", "option3"],
    "storyImpact": "minor|moderate|major|significant"
}`;
    }

    buildBossGenerationPrompt(context) {
        const gameCtx = buildGameContextBlock();
        return `${gameCtx}
Create a contextually perfect boss for a ${context.theme} adventure.

BOSS CONTEXT:
- Power Level: ${context.powerLevel}
- Story Significance: ${context.storySignificance}
- Thematic Role: ${context.thematicRole}
- Location: ${context.location?.name || 'Unknown'}

THEMATIC REQUIREMENTS:
- Theme: ${context.theme}
- Environmental Factors: ${context.environmentalFactors.join(', ')}
- Story Context: ${context.storyContext || 'climactic encounter'}

Create a boss that is PERFECTLY thematic and story-climactic. Respond with ONLY a JSON object:
{
    "name": "Boss name",
    "title": "Boss title/epithet",
    "archetype": "Boss archetype fitting theme",
    "description": "Rich physical and thematic description",
    "setupDescription": "How the encounter begins",
    "phases": [
        {
            "name": "Phase name",
            "description": "Phase description",
            "abilities": ["phase", "specific", "abilities"]
        }
    ],
    "abilities": [
        {
            "name": "Ability name",
            "description": "Ability description",
            "type": "offensive|defensive|utility",
            "cooldown": 3
        }
    ],
    "weaknesses": ["weakness1", "weakness2"],
    "lore": {
        "background": "Boss background story",
        "motivation": "Why they're the antagonist"
    },
    "environmentalHazards": ["hazard1", "hazard2"],
    "victoryConditions": {
        "primary": "Main victory condition",
        "alternative": "Alternative victory method"
    }
}`;
    }

    // Helper Methods
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
        
        return 'generic';
    }

    analyzePlayerNeeds(context) {
        const needs = [];
        
        if (context.storyContext?.includes('information')) needs.push('information');
        if (context.storyContext?.includes('help')) needs.push('assistance');
        if (context.storyContext?.includes('challenge')) needs.push('challenge');
        if (context.storyContext?.includes('mystery')) needs.push('mystery_solving');
        
        return needs.length > 0 ? needs : ['interaction', 'progression'];
    }

    analyzeNarrativeGoals(context) {
        const goals = [];
        
        if (context.storyContext?.includes('investigate')) goals.push('investigation');
        if (context.storyContext?.includes('find')) goals.push('discovery');
        if (context.storyContext?.includes('solve')) goals.push('problem_solving');
        if (context.storyContext?.includes('defeat')) goals.push('confrontation');
        
        return goals.length > 0 ? goals : ['story_progression'];
    }

    calculateBossPowerLevel(context) {
        const basePower = Math.min(gameState.turn || 1, 50);
        const locationDanger = (context.location?.dangerLevel || 0.5) * 20;
        return Math.floor(basePower + locationDanger);
    }

    analyzeBossStoryRole(context) {
        if (context.storyContext?.includes('final') || context.storyContext?.includes('climax')) {
            return 'final_boss';
        }
        if (context.storyContext?.includes('chapter') || context.storyContext?.includes('arc')) {
            return 'arc_boss';
        }
        return 'mini_boss';
    }

    determineBossThematicRole(context) {
        const thematicElements = context.thematicElements || [];
        
        if (thematicElements.includes('supernatural')) return 'supernatural_entity';
        if (thematicElements.includes('corporate')) return 'corporate_antagonist';
        if (thematicElements.includes('noble')) return 'corrupt_noble';
        if (thematicElements.includes('technology')) return 'technological_threat';
        
        return 'thematic_nemesis';
    }

    // Response Parsing Methods (simplified for brevity)
    parseNPCResponse(response, context, patterns) {
        try {
            if (response && typeof response === 'object') return response;
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            return this.generateFallbackNPCData(context, patterns);
        }
    }

    parsePuzzleResponse(response, context, patterns) {
        try {
            if (response && typeof response === 'object') return response;
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            return this.generateFallbackPuzzleData(context, patterns);
        }
    }

    parseAnomalyResponse(response, context, patterns) {
        try {
            if (response && typeof response === 'object') return response;
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            return this.generateFallbackAnomalyData(context, patterns);
        }
    }

    parseBossResponse(response, context) {
        try {
            if (response && typeof response === 'object') return response;
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            return this.generateFallbackBossData(context);
        }
    }

    // Enhanced Fallback generation methods with theme intelligence
    generateFallbackNPCEncounter(context, encounterId, thematicElements, adaptation) {
        const locationKey = this.getLocationKey(context.location);
        const patterns = this.npcPersonalities.get(locationKey) || this.getGenericNPCPatterns(context.theme);
        
        const npcName = thematicElements.length > 0 ? 
            `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} Figure` :
            'Mysterious Figure';
        
        return {
            id: encounterId,
            type: 'npc',
            subtype: patterns.types[0] || 'stranger',
            npc: {
                id: generateId('npc'),
                name: npcName,
                description: `A ${patterns.traits[0] || 'mysterious'} figure emerges in ${context.location?.name || 'this place'}.`,
                personality: patterns.traits[0] || 'mysterious',
                motivation: patterns.motivations[0] || 'unknown',
                knowledge: `Information about ${context.location?.name || 'the area'}.`,
                abilities: [],
                dialogue: {
                    greeting: `Greetings, travelers.`,
                    information: `I know something about this place...`,
                    request: `Perhaps you could help me with something?`
                }
            },
            interaction: {
                type: 'conversation',
                options: ['Talk', 'Ask about area', 'Ignore'],
                consequences: {
                    positive: 'Gain useful information',
                    negative: 'Miss opportunity'
                }
            },
            storyImpact: 'minor',
            thematicElements: thematicElements,
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true
        };
    }

    generateFallbackPuzzleEncounter(context, encounterId, thematicElements, adaptation) {
        const locationKey = this.getLocationKey(context.location);
        const patterns = this.puzzleTypes.get(locationKey) || this.getGenericPuzzlePatterns(context.theme);
        
        const puzzleName = thematicElements.length > 0 ? 
            `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} Puzzle` :
            'Ancient Mechanism';
        
        return {
            id: encounterId,
            type: 'puzzle',
            subtype: patterns.categories[0] || 'logic_puzzle',
            puzzle: {
                id: generateId('puzzle'),
                name: puzzleName,
                description: `A ${patterns.categories[0] || 'mysterious'} puzzle appears in ${context.location?.name || 'this place'}.`,
                category: patterns.categories[0] || 'logic_puzzle',
                difficulty: 'medium',
                mechanism: patterns.mechanics[0] || 'logical_deduction',
                solution: 'careful_analysis',
                hints: ['Look for patterns', 'Consider the theme', 'Think contextually'],
                rewards: { success: 'Progress forward', information: 'Learn about the area' },
                failureConsequences: { minor: 'Try again', major: 'Seek alternative path' },
                maxAttempts: 3
            },
            interaction: {
                type: 'puzzle_solving',
                attempts: 0,
                maxAttempts: 3
            },
            storyImpact: 'moderate',
            thematicElements: thematicElements,
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true
        };
    }

    generateFallbackAnomalyEncounter(context, encounterId, thematicElements, adaptation) {
        const locationKey = this.getLocationKey(context.location);
        const patterns = this.anomalyPatterns.get(locationKey) || this.getGenericAnomalyPatterns(context.theme);
        
        const anomalyName = thematicElements.length > 0 ? 
            `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} Anomaly` :
            'Strange Occurrence';
        
        return {
            id: encounterId,
            type: 'anomaly',
            subtype: patterns.types[0] || 'environmental',
            anomaly: {
                id: generateId('anomaly'),
                name: anomalyName,
                description: `A ${patterns.types[0] || 'strange'} anomaly manifests in ${context.location?.name || 'this area'}.`,
                type: patterns.types[0] || 'environmental',
                intensity: 'medium',
                effects: patterns.effects?.slice(0, 2) || ['confusion', 'uncertainty'],
                duration: 'brief',
                consequences: {
                    immediate: 'Immediate effects on the environment',
                    longTerm: 'Potential story implications'
                },
                investigation: {
                    clues: ['Environmental changes', 'Unusual patterns'],
                    skillChecks: ['observation', 'analysis']
                }
            },
            interaction: {
                type: 'anomaly_response',
                options: ['Investigate', 'Avoid', 'Interact'],
                skillChecks: ['perception', 'knowledge']
            },
            storyImpact: 'moderate',
            thematicElements: thematicElements,
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true
        };
    }

    generateFallbackBossEncounter(context, encounterId, thematicElements, adaptation) {
        const powerLevel = this.calculateBossPowerLevel(context);
        const bossName = thematicElements.length > 0 ? 
            `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} Guardian` :
            'Powerful Adversary';
        
        return {
            id: encounterId,
            type: 'boss',
            subtype: 'guardian',
            boss: {
                id: generateId('boss'),
                name: bossName,
                title: 'The Protector',
                description: `A formidable ${thematicElements[0] || 'mysterious'} guardian appears in ${context.location?.name || 'this place'}.`,
                archetype: 'guardian',
                powerLevel: powerLevel,
                phases: [
                    {
                        name: 'Initial Phase',
                        description: 'The guardian tests your resolve',
                        abilities: ['Powerful Strike', 'Defensive Stance']
                    }
                ],
                abilities: [
                    {
                        name: 'Guardian Strike',
                        description: 'A powerful attack that protects this place',
                        type: 'offensive',
                        cooldown: 2
                    }
                ],
                weaknesses: ['strategy', 'teamwork'],
                lore: {
                    background: `A guardian of ${context.location?.name || 'this sacred place'}`,
                    motivation: 'Protecting what lies within'
                },
                combatStats: this.generateBossCombatStats({ abilities: [] }, { powerLevel })
            },
            encounter: {
                setupDescription: `The guardian of ${context.location?.name || 'this place'} emerges to challenge you!`,
                entryConditions: {},
                environmentalHazards: [],
                victoryConditions: {
                    primary: 'Defeat the guardian in combat',
                    alternative: 'Prove your worth through skill'
                }
            },
            storyImpact: 'major',
            thematicElements: thematicElements,
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true
        };
    }

    generateFallbackGenericEncounter(context, encounterId, thematicElements, adaptation) {
        return {
            id: encounterId,
            type: 'event',
            subtype: 'discovery',
            event: {
                id: generateId('event'),
                name: 'Unexpected Discovery',
                description: `Something interesting happens in ${context.location?.name || 'this area'}.`,
                type: 'discovery'
            },
            interaction: {
                type: 'exploration',
                options: ['Investigate', 'Continue', 'Be cautious']
            },
            storyImpact: 'minor',
            thematicElements: thematicElements,
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true
        };
    }

    generateUltimateFallbackEncounter(encounterType, context) {
        return {
            id: generateId(`${encounterType}_ultimate_fallback`),
            type: encounterType,
            description: `A ${encounterType} encounter occurs.`,
            interaction: { type: 'basic', options: ['Continue'] },
            storyImpact: 'minor',
            isDynamic: false,
            isFallback: true,
            isUltimateFallback: true,
            createdAt: Date.now()
        };
    }

    // Additional helper methods for fallback data generation
    generateFallbackNPCData(context, patterns) {
        return {
            name: 'Mysterious Figure',
            type: patterns.types[0] || 'stranger',
            description: 'A figure of uncertain intent.',
            personality: patterns.traits[0] || 'mysterious',
            motivation: patterns.motivations[0] || 'unknown',
            knowledge: 'Limited information about the area.',
            interactionType: 'conversation',
            storyImpact: 'minor'
        };
    }

    generateFallbackPuzzleData(context, patterns) {
        return {
            name: 'Ancient Puzzle',
            category: patterns.categories[0] || 'logic_puzzle',
            description: 'An old puzzle that requires solving.',
            difficulty: 'medium',
            mechanism: patterns.mechanics[0] || 'logical_deduction',
            solution: 'careful_analysis',
            storyImpact: 'moderate'
        };
    }

    generateFallbackAnomalyData(context, patterns) {
        return {
            name: 'Strange Event',
            type: patterns.types[0] || 'environmental',
            description: 'An unusual occurrence that defies explanation.',
            intensity: 'medium',
            effects: ['confusion', 'uncertainty'],
            duration: 'brief',
            storyImpact: 'moderate'
        };
    }

    generateFallbackBossData(context) {
        return {
            name: 'Powerful Guardian',
            title: 'The Protector',
            archetype: 'guardian',
            description: 'A formidable opponent that guards this place.',
            phases: [{ name: 'Combat Phase', description: 'Direct confrontation' }],
            abilities: [{ name: 'Powerful Attack', type: 'offensive', cooldown: 2 }],
            weaknesses: ['strategy', 'teamwork']
        };
    }

    generateBossCombatStats(bossData, context) {
        const baseHp = 100 + (context.powerLevel * 10);
        const baseAtk = 15 + (context.powerLevel * 2);
        const baseDef = 10 + context.powerLevel;
        
        return {
            hp: baseHp,
            maxHp: baseHp,
            atk: baseAtk,
            def: baseDef,
            abilities: bossData.abilities || [],
            phases: bossData.phases || []
        };
    }

    getGenericNPCPatterns(theme) {
        return {
            types: ['traveler', 'local', 'merchant', 'guide'],
            traits: ['friendly', 'cautious', 'knowledgeable', 'mysterious'],
            motivations: ['help', 'trade', 'information', 'survival'],
            interactions: ['conversation', 'trade', 'guidance', 'warning']
        };
    }

    getGenericPuzzlePatterns(theme) {
        return {
            categories: ['logic_puzzle', 'riddle', 'mechanism', 'code'],
            mechanics: ['deduction', 'pattern_recognition', 'knowledge', 'skill'],
            themes: ['ancient_wisdom', 'hidden_knowledge', 'security', 'test']
        };
    }

    getGenericAnomalyPatterns(theme) {
        return {
            types: ['environmental', 'temporal', 'spatial', 'energy'],
            effects: ['disorientation', 'revelation', 'change', 'challenge'],
            consequences: ['information', 'opportunity', 'danger', 'mystery']
        };
    }
}

// Initialize the dynamic encounter system
export const dynamicEncounterRegistry = new DynamicEncounterRegistry();

/**
 * Main entry point for generating encounters
 * @param {string} encounterType - Type of encounter to generate
 * @param {object} context - Current game context
 * @returns {Promise<object>} Generated encounter
 */
export async function generateDynamicEncounter(encounterType, context = {}) {
    const registry = gameState.dynamicEncounterRegistry || dynamicEncounterRegistry;
    
    // Build enhanced context
    const enhancedContext = {
        ...context,
        theme: context.theme || gameState.adventureTheme,
        location: context.location || gameState.currentLocation,
        turn: gameState.turn,
        storyContext: context.storyContext || gameState.currentNarrative?.slice(-300),
        recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || []
    };
    
    return await registry.generateContextualEncounter(encounterType, enhancedContext);
}

/**
 * Process a dynamic encounter and integrate with story
 * @param {object} encounter - The encounter to process
 * @returns {Promise<boolean>} Success status
 */
export async function processDynamicEncounter(encounter) {
    const log = window.displayVisualError || console.log;
    log(`Processing dynamic ${encounter.type} encounter: ${encounter.id}`);
    
    try {
        // Add to narrative context
        if (!gameState.narrativeContext.significantEvents) {
            gameState.narrativeContext.significantEvents = [];
        }
        
        gameState.narrativeContext.significantEvents.push({
            type: 'encounter',
            subtype: encounter.type,
            description: encounter.description || `${encounter.type} encounter`,
            location: gameState.currentLocation?.name || 'Unknown',
            turn: gameState.turn,
            encounterId: encounter.id
        });
        
        // Process based on encounter type
        switch (encounter.type) {
            case 'npc':
                return await processNPCEncounter(encounter);
            case 'puzzle':
                return await processPuzzleEncounter(encounter);
            case 'anomaly':
                return await processAnomalyEncounter(encounter);
            case 'boss':
                return await processBossEncounter(encounter);
            default:
                return await processGenericEncounter(encounter);
        }
        
    } catch (error) {
        log(`Error processing encounter: ${error.message}`);
        return false;
    }
}

// Encounter processing functions
async function processNPCEncounter(encounter) {
    const npc = encounter.npc;
    
    // Create story prompt for NPC interaction
    const npcPrompt = `[NPC Encounter: ${npc.name}]
Location: ${gameState.currentLocation?.name || 'Unknown'}
NPC Description: ${npc.description}
NPC Personality: ${npc.personality}
NPC Motivation: ${npc.motivation}
NPC Knowledge: ${npc.knowledge}

The players encounter ${npc.name}. Describe the meeting and provide interaction choices based on the NPC's personality and motivation.`;

    // Trigger AI for NPC interaction
    const AI = await import('./aiHandler.js?cb=014');
    await AI.makeAICallForSystemAction(npcPrompt, true);
    
    return true;
}

async function processPuzzleEncounter(encounter) {
    const puzzle = encounter.puzzle;
    
    // Set current puzzle in game state
    gameState.currentPuzzle = puzzle;
    
    // Create story prompt for puzzle presentation
    const puzzlePrompt = `[Puzzle Encounter: ${puzzle.name}]
Location: ${gameState.currentLocation?.name || 'Unknown'}
Puzzle Description: ${puzzle.description}
Difficulty: ${puzzle.difficulty}
Category: ${puzzle.category}

The players encounter a puzzle. Describe the puzzle setup and provide options for how to approach solving it.`;

    // Trigger AI for puzzle presentation
    const AI = await import('./aiHandler.js?cb=014');
    await AI.makeAICallForSystemAction(puzzlePrompt, true);
    
    return true;
}

async function processAnomalyEncounter(encounter) {
    const anomaly = encounter.anomaly;
    
    // Create story prompt for anomaly event
    const anomalyPrompt = `[Anomaly Event: ${anomaly.name}]
Location: ${gameState.currentLocation?.name || 'Unknown'}
Anomaly Description: ${anomaly.description}
Type: ${anomaly.type}
Intensity: ${anomaly.intensity}
Effects: ${anomaly.effects?.join(', ') || 'Unknown'}

A strange anomaly occurs. Describe the event and provide choices for how the players can respond.`;

    // Trigger AI for anomaly event
    const AI = await import('./aiHandler.js?cb=014');
    await AI.makeAICallForSystemAction(anomalyPrompt, true);
    
    return true;
}

async function processBossEncounter(encounter) {
    const boss = encounter.boss;
    
    // Create boss enemy for combat
    const bossEnemy = {
        id: boss.id,
        name: boss.name,
        description: boss.description,
        hp: boss.combatStats?.hp || 150,
        maxHp: boss.combatStats?.maxHp || 150,
        atk: boss.combatStats?.atk || 25,
        def: boss.combatStats?.def || 15,
        isBoss: true,
        abilities: boss.abilities || [],
        phases: boss.phases || [],
        lootChance: 1.0,
        lootTier: 'Epic'
    };
    
    // Add boss to enemies and start combat
    gameState.enemies = [bossEnemy];
    gameState.inCombat = true;
    gameState.isBossEncounter = true;
    gameState.currentBoss = boss;
    
    // Show boss encounter popup
    UI.showPopup(`Boss Encounter: ${boss.name} - ${boss.title}!`, 'boss_encounter', 6000);
    
    // Create story prompt for boss encounter
    const bossPrompt = `[Boss Encounter: ${boss.name}]
${encounter.encounter?.setupDescription || `A powerful adversary appears: ${boss.name} - ${boss.title}!`}

The ultimate confrontation begins!`;

    // Trigger AI for boss encounter setup
    const AI = await import('./aiHandler.js?cb=014');
    await AI.makeAICallForSystemAction(bossPrompt, true);
    
    return true;
}

async function processGenericEncounter(encounter) {
    // Generic encounter processing
    const encounterPrompt = `[${encounter.type.charAt(0).toUpperCase() + encounter.type.slice(1)} Encounter]
Location: ${gameState.currentLocation?.name || 'Unknown'}
Description: ${encounter.description || 'An unexpected event occurs.'}

Describe this encounter and provide appropriate choices for the players.`;

    const AI = await import('./aiHandler.js?cb=014');
    await AI.makeAICallForSystemAction(encounterPrompt, true);
    
    return true;
}
