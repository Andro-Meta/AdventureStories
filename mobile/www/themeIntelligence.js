// themeIntelligence.js
// Revolutionary Theme-Contextual AI Agent for Infinite Dynamic Ability Generation
// Analyzes story context, location, and theme to generate perfectly appropriate abilities

import { gameState } from './state.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';

/**
 * Theme Intelligence Engine - Analyzes context to determine appropriate ability types
 */
export class ThemeIntelligenceEngine {
    constructor() {
        // Core intelligence patterns
        this.locationPatterns = new Map();      // location -> ability patterns
        this.storyPatterns = new Map();         // story context -> ability types
        this.themeAnalysis = new Map();         // theme -> contextual analysis
        this.environmentalFactors = new Map();  // environment -> ability modifiers
        
        // Learning systems
        this.successfulCombinations = new Map(); // context -> successful ability types
        this.playerAdaptations = new Map();      // player preferences by context
        this.narrativePatterns = new Map();      // story beats -> ability needs
        
        this.initializeThemeIntelligence();
    }

    /**
     * Initialize comprehensive theme intelligence patterns
     */
    initializeThemeIntelligence() {
        // Location-specific ability patterns
        this.locationPatterns.set('haunted_mansion', {
            primaryAbilities: ['spirit_communication', 'ghost_interaction', 'séance', 'exorcism', 'protective_wards'],
            secondaryAbilities: ['investigation', 'courage', 'occult_knowledge', 'medium_abilities'],
            avoidedAbilities: ['hacking', 'technology', 'cybernetics', 'space_travel'],
            environmentalFactors: ['supernatural', 'fear', 'darkness', 'spiritual_energy'],
            thematicElements: ['ghosts', 'spirits', 'haunting', 'paranormal', 'occult', 'séance', 'medium']
        });

        this.locationPatterns.set('cyberpunk_city', {
            primaryAbilities: ['hacking', 'neural_interface', 'data_manipulation', 'cybernetics', 'digital_warfare'],
            secondaryAbilities: ['street_smarts', 'corporate_espionage', 'tech_repair', 'augmentation'],
            avoidedAbilities: ['magic', 'divine_power', 'nature_magic', 'medieval_combat'],
            environmentalFactors: ['digital', 'corporate', 'neon', 'technology', 'augmentation'],
            thematicElements: ['cyber', 'neural', 'digital', 'matrix', 'augmented', 'corporate', 'street']
        });

        this.locationPatterns.set('medieval_castle', {
            primaryAbilities: ['swordsmanship', 'heraldry', 'courtly_etiquette', 'siege_warfare', 'chivalry'],
            secondaryAbilities: ['horsemanship', 'archery', 'diplomacy', 'noble_bearing'],
            avoidedAbilities: ['hacking', 'cybernetics', 'modern_technology', 'space_travel'],
            environmentalFactors: ['medieval', 'feudal', 'honor', 'nobility', 'warfare'],
            thematicElements: ['knight', 'noble', 'sword', 'castle', 'honor', 'chivalry', 'medieval']
        });

        this.locationPatterns.set('space_station', {
            primaryAbilities: ['zero_gravity_maneuvering', 'life_support_systems', 'space_engineering', 'alien_communication'],
            secondaryAbilities: ['astrogation', 'xenobiology', 'space_combat', 'emergency_protocols'],
            avoidedAbilities: ['nature_magic', 'medieval_combat', 'ghost_interaction', 'séance'],
            environmentalFactors: ['zero_gravity', 'vacuum', 'technology', 'alien', 'isolation'],
            thematicElements: ['space', 'alien', 'gravity', 'vacuum', 'stellar', 'cosmic', 'xenobiology']
        });

        this.locationPatterns.set('ancient_forest', {
            primaryAbilities: ['nature_communion', 'animal_communication', 'plant_growth', 'weather_control', 'druidic_magic'],
            secondaryAbilities: ['tracking', 'survival', 'herbalism', 'forest_navigation'],
            avoidedAbilities: ['cybernetics', 'hacking', 'urban_skills', 'technology'],
            environmentalFactors: ['natural', 'primal', 'growth', 'harmony', 'wilderness'],
            thematicElements: ['nature', 'forest', 'druid', 'animal', 'plant', 'natural', 'primal']
        });

        this.locationPatterns.set('underwater_city', {
            primaryAbilities: ['underwater_breathing', 'pressure_adaptation', 'marine_communication', 'hydro_engineering'],
            secondaryAbilities: ['swimming', 'diving', 'marine_biology', 'water_magic'],
            avoidedAbilities: ['fire_magic', 'desert_survival', 'mountain_climbing'],
            environmentalFactors: ['aquatic', 'pressure', 'marine', 'fluid', 'depth'],
            thematicElements: ['water', 'marine', 'aquatic', 'depth', 'pressure', 'oceanic', 'tidal']
        });

        this.locationPatterns.set('desert_wasteland', {
            primaryAbilities: ['desert_survival', 'heat_resistance', 'water_finding', 'sand_navigation', 'mirage_detection'],
            secondaryAbilities: ['endurance', 'resource_conservation', 'tribal_knowledge', 'sun_magic'],
            avoidedAbilities: ['ice_magic', 'underwater_abilities', 'forest_skills'],
            environmentalFactors: ['arid', 'heat', 'scarcity', 'endurance', 'survival'],
            thematicElements: ['sand', 'heat', 'desert', 'survival', 'oasis', 'nomad', 'tribal']
        });

        // Story context patterns
        this.storyPatterns.set('murder_mystery', {
            primaryAbilities: ['investigation', 'deduction', 'evidence_analysis', 'interrogation', 'psychology'],
            secondaryAbilities: ['observation', 'memory_palace', 'social_reading', 'forensics'],
            thematicElements: ['clue', 'evidence', 'suspect', 'motive', 'deduction', 'mystery']
        });

        this.storyPatterns.set('zombie_apocalypse', {
            primaryAbilities: ['zombie_combat', 'survival_instincts', 'fortification', 'scavenging', 'group_coordination'],
            secondaryAbilities: ['medical_knowledge', 'weapon_crafting', 'stealth', 'resource_management'],
            thematicElements: ['zombie', 'survival', 'apocalypse', 'undead', 'scavenge', 'fortify']
        });

        this.storyPatterns.set('political_intrigue', {
            primaryAbilities: ['diplomacy', 'espionage', 'manipulation', 'court_politics', 'information_gathering'],
            secondaryAbilities: ['persuasion', 'deception', 'alliance_building', 'blackmail'],
            thematicElements: ['politics', 'intrigue', 'alliance', 'betrayal', 'power', 'influence']
        });

        this.storyPatterns.set('alien_first_contact', {
            primaryAbilities: ['xenolinguistics', 'cultural_adaptation', 'diplomatic_protocol', 'alien_psychology'],
            secondaryAbilities: ['translation', 'peaceful_communication', 'scientific_analysis'],
            thematicElements: ['alien', 'contact', 'communication', 'xenobiology', 'diplomatic']
        });
    }

    /**
     * Analyze current context to determine appropriate ability categories
     * @param {object} context - Current game context
     * @returns {object} Contextual ability analysis
     */
    analyzeContextForAbilities(context) {
        const analysis = {
            primaryCategories: [],
            secondaryCategories: [],
            avoidedCategories: [],
            thematicElements: [],
            environmentalFactors: [],
            confidenceScore: 0
        };

        // Analyze location
        const locationAnalysis = this.analyzeLocation(context);
        if (locationAnalysis) {
            analysis.primaryCategories.push(...locationAnalysis.primaryAbilities);
            analysis.secondaryCategories.push(...locationAnalysis.secondaryAbilities);
            analysis.avoidedCategories.push(...locationAnalysis.avoidedAbilities);
            analysis.thematicElements.push(...locationAnalysis.thematicElements);
            analysis.environmentalFactors.push(...locationAnalysis.environmentalFactors);
            analysis.confidenceScore += 0.4;
        }

        // Analyze story context
        const storyAnalysis = this.analyzeStoryContext(context);
        if (storyAnalysis) {
            analysis.primaryCategories.push(...storyAnalysis.primaryAbilities);
            analysis.secondaryCategories.push(...storyAnalysis.secondaryAbilities);
            analysis.thematicElements.push(...storyAnalysis.thematicElements);
            analysis.confidenceScore += 0.3;
        }

        // Analyze theme
        const themeAnalysis = this.analyzeTheme(context);
        if (themeAnalysis) {
            analysis.primaryCategories.push(...themeAnalysis.categories);
            analysis.thematicElements.push(...themeAnalysis.elements);
            analysis.confidenceScore += 0.2;
        }

        // Analyze recent narrative
        const narrativeAnalysis = this.analyzeNarrative(context);
        if (narrativeAnalysis) {
            analysis.primaryCategories.push(...narrativeAnalysis.suggestedAbilities);
            analysis.thematicElements.push(...narrativeAnalysis.keywords);
            analysis.confidenceScore += 0.1;
        }

        // Remove duplicates and prioritize
        analysis.primaryCategories = [...new Set(analysis.primaryCategories)];
        analysis.secondaryCategories = [...new Set(analysis.secondaryCategories)];
        analysis.avoidedCategories = [...new Set(analysis.avoidedCategories)];
        analysis.thematicElements = [...new Set(analysis.thematicElements)];
        analysis.environmentalFactors = [...new Set(analysis.environmentalFactors)];

        return analysis;
    }

    /**
     * Analyze location for ability patterns
     */
    analyzeLocation(context) {
        const location = context.environment || context.currentLocation || gameState.currentLocation;
        if (!location) {
            // Return basic analysis instead of null
            return {
                locationTypes: ['generic'],
                atmospheres: ['neutral'],
                dangerLevels: [0.3],
                features: ['basic_environment']
            };
        }

        // Ensure location is a string for processing
        const locationStr = typeof location === 'string' ? location : 
                           (location.name || location.description || String(location));
        
        if (!locationStr || typeof locationStr !== 'string') {
            return {
                locationTypes: ['unknown'],
                atmospheres: ['mysterious'],
                dangerLevels: [0.5],
                features: ['unexplored_area']
            };
        }

        // Direct pattern match
        const directMatch = this.locationPatterns.get(locationStr.toLowerCase());
        if (directMatch) return directMatch;

        // Fuzzy matching for location keywords
        for (const [patternLocation, pattern] of this.locationPatterns) {
            if (locationStr.toLowerCase().includes(patternLocation.split('_')[0]) ||
                patternLocation.split('_').some(word => locationStr.toLowerCase().includes(word))) {
                return pattern;
            }
        }

        // Analyze location description for keywords
        const locationKeywords = this.extractLocationKeywords(locationStr);
        return this.matchKeywordsToPatterns(locationKeywords);
    }

    /**
     * Analyze story context for ability needs
     */
    analyzeStoryContext(context) {
        const storyContext = context.storyContext || context.situation || gameState.currentNarrative;
        if (!storyContext) {
            // Return basic story analysis instead of null
            return {
                storyElements: ['exploration'],
                narrativeTypes: ['adventure'],
                tensions: ['discovery'],
                themes: ['journey']
            };
        }

        // Direct pattern match
        for (const [pattern, abilities] of this.storyPatterns) {
            if (storyContext.toLowerCase().includes(pattern.replace('_', ' ')) ||
                storyContext.toLowerCase().includes(pattern)) {
                return abilities;
            }
        }

        // Keyword analysis
        const storyKeywords = this.extractStoryKeywords(storyContext);
        return this.matchStoryKeywords(storyKeywords);
    }

    /**
     * Analyze theme for ability categories
     */
    analyzeTheme(context) {
        const theme = context.theme || gameState.adventureTheme;
        const customTheme = context.customTheme || gameState.customThemeDescription;

        const themeMap = {
            'fantasy': { categories: ['magic', 'divine', 'nature', 'elemental'], elements: ['spell', 'magic', 'divine', 'elemental'] },
            'scifi': { categories: ['technology', 'science', 'space', 'alien'], elements: ['tech', 'cyber', 'quantum', 'alien'] },
            'horror': { categories: ['occult', 'survival', 'fear', 'supernatural'], elements: ['dark', 'fear', 'occult', 'supernatural'] },
            'mystery': { categories: ['investigation', 'deduction', 'social', 'knowledge'], elements: ['clue', 'mystery', 'investigation'] },
            'cyberpunk': { categories: ['hacking', 'cybernetics', 'corporate', 'street'], elements: ['cyber', 'neural', 'corporate', 'street'] },
            'modern': { categories: ['technology', 'social', 'professional', 'urban'], elements: ['modern', 'urban', 'professional'] },
            'adventure': { categories: ['exploration', 'survival', 'physical', 'social'], elements: ['adventure', 'exploration', 'journey'] }
        };

        let analysis = themeMap[theme] || { categories: ['general'], elements: ['adventure'] };

        // Analyze custom theme description
        if (customTheme) {
            const customAnalysis = this.analyzeCustomTheme(customTheme);
            analysis.categories.push(...customAnalysis.categories);
            analysis.elements.push(...customAnalysis.elements);
        }

        return analysis;
    }

    /**
     * Analyze narrative for ability suggestions
     */
    analyzeNarrative(context) {
        const narrative = context.storyContext || gameState.currentNarrative?.slice(-500) || '';
        if (!narrative) {
            // Return basic narrative analysis instead of null
            return {
                narrativeElements: ['beginning'],
                pacing: ['steady'],
                mood: ['neutral'],
                progression: ['starting']
            };
        }

        const keywords = this.extractNarrativeKeywords(narrative);
        const suggestedAbilities = this.mapKeywordsToAbilities(keywords);

        return {
            suggestedAbilities: suggestedAbilities,
            keywords: keywords
        };
    }

    /**
     * Generate contextual ability prompt for AI
     */
    generateContextualAbilityPrompt(school, type, level, context) {
        const analysis = this.analyzeContextForAbilities(context);
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();

        // Determine if this should be a primary or secondary ability
        const isPrimaryAbility = analysis.primaryCategories.length > 0;
        const abilityCategories = isPrimaryAbility ? analysis.primaryCategories : analysis.secondaryCategories;

        return `You are creating a ${adaptation.abilityName.toLowerCase()} for a ${context.theme || gameState.adventureTheme} adventure.

CRITICAL CONTEXT ANALYSIS:
- Location: ${context.environment || 'unknown'} 
- Story Context: ${context.storyContext || 'general adventure'}
- Theme: ${context.theme || gameState.adventureTheme}
- Situation: ${context.situation || 'exploration'}

CONTEXTUAL INTELLIGENCE (Confidence: ${(analysis.confidenceScore * 100).toFixed(0)}%):
- Primary Ability Categories: ${analysis.primaryCategories.join(', ') || 'general'}
- Secondary Categories: ${analysis.secondaryCategories.join(', ') || 'none'}
- AVOID These Categories: ${analysis.avoidedCategories.join(', ') || 'none'}
- Environmental Factors: ${analysis.environmentalFactors.join(', ') || 'none'}
- Thematic Elements: ${analysis.thematicElements.join(', ') || 'general'}

ABILITY REQUIREMENTS:
- Must be PERFECTLY appropriate for: ${context.environment || 'the current setting'}
- Must address: ${context.situation || 'general needs'}
- Must use thematic elements: ${analysis.thematicElements.slice(0, 3).join(', ')}
- Must avoid: ${analysis.avoidedCategories.join(', ') || 'inappropriate themes'}

EXAMPLES OF APPROPRIATE ABILITIES:
${this.generateExampleAbilities(analysis, context)}

Create a ${adaptation.abilityName.toLowerCase()} that is PERFECTLY contextual and thematically appropriate.`;
    }

    /**
     * Generate example abilities for context
     */
    generateExampleAbilities(analysis, context) {
        const examples = [];
        
        if (analysis.primaryCategories.includes('ghost_interaction')) {
            examples.push('- "Commune with Spirits" - communicate with ghosts in the mansion');
            examples.push('- "Protective Ward" - create barriers against supernatural entities');
        }
        
        if (analysis.primaryCategories.includes('hacking')) {
            examples.push('- "Neural Hack" - infiltrate cybernetic systems');
            examples.push('- "Data Ghost" - become invisible in digital networks');
        }
        
        if (analysis.primaryCategories.includes('swordsmanship')) {
            examples.push('- "Noble Blade Technique" - masterful sword combat');
            examples.push('- "Chivalric Defense" - protect others with honor');
        }

        return examples.length > 0 ? examples.join('\n') : '- Context-appropriate abilities based on the setting';
    }

    /**
     * Determine optimal ability parameters based on context
     */
    determineContextualAbilityParameters(context) {
        const analysis = this.analyzeContextForAbilities(context);
        
        // Map contextual categories to schools and types
        const categoryMapping = {
            // Supernatural/Horror
            'ghost_interaction': { school: 'SHADOW', type: 'UTILITY' },
            'spirit_communication': { school: 'MIND', type: 'UTILITY' },
            'exorcism': { school: 'DIVINE', type: 'OFFENSIVE' },
            'protective_wards': { school: 'DIVINE', type: 'DEFENSIVE' },
            
            // Technology/Cyberpunk
            'hacking': { school: 'SHADOW', type: 'UTILITY' },
            'neural_interface': { school: 'MIND', type: 'UTILITY' },
            'cybernetics': { school: 'ARCANE', type: 'DEFENSIVE' },
            'data_manipulation': { school: 'ARCANE', type: 'UTILITY' },
            
            // Medieval/Fantasy
            'swordsmanship': { school: 'ELEMENTAL', type: 'OFFENSIVE' },
            'chivalry': { school: 'DIVINE', type: 'DEFENSIVE' },
            'heraldry': { school: 'MIND', type: 'UTILITY' },
            
            // Nature/Survival
            'nature_communion': { school: 'NATURE', type: 'UTILITY' },
            'animal_communication': { school: 'NATURE', type: 'UTILITY' },
            'survival_instincts': { school: 'NATURE', type: 'DEFENSIVE' },
            
            // Investigation/Mystery
            'investigation': { school: 'MIND', type: 'UTILITY' },
            'deduction': { school: 'MIND', type: 'UTILITY' },
            'evidence_analysis': { school: 'ARCANE', type: 'UTILITY' },
            
            // Default fallbacks
            'general': { school: 'ARCANE', type: 'UTILITY' }
        };

        // Find best match from primary categories
        for (const category of analysis.primaryCategories) {
            if (categoryMapping[category]) {
                return categoryMapping[category];
            }
        }

        // Fallback to secondary categories
        for (const category of analysis.secondaryCategories) {
            if (categoryMapping[category]) {
                return categoryMapping[category];
            }
        }

        // Ultimate fallback
        return { school: 'ARCANE', type: 'UTILITY' };
    }

    // Helper methods for keyword extraction and analysis
    extractLocationKeywords(location) {
        const keywords = [];
        const locationLower = location.toLowerCase();
        
        // Location type keywords
        if (locationLower.includes('haunted') || locationLower.includes('ghost') || locationLower.includes('mansion')) {
            keywords.push('supernatural', 'ghost', 'haunted');
        }
        if (locationLower.includes('cyber') || locationLower.includes('neon') || locationLower.includes('corporate')) {
            keywords.push('cyberpunk', 'technology', 'corporate');
        }
        if (locationLower.includes('castle') || locationLower.includes('medieval') || locationLower.includes('knight')) {
            keywords.push('medieval', 'castle', 'nobility');
        }
        if (locationLower.includes('forest') || locationLower.includes('nature') || locationLower.includes('wild')) {
            keywords.push('nature', 'forest', 'wilderness');
        }
        if (locationLower.includes('space') || locationLower.includes('station') || locationLower.includes('alien')) {
            keywords.push('space', 'technology', 'alien');
        }
        
        return keywords;
    }

    extractStoryKeywords(story) {
        const keywords = [];
        const storyLower = story.toLowerCase();
        
        // Story type keywords
        if (storyLower.includes('murder') || storyLower.includes('mystery') || storyLower.includes('investigate')) {
            keywords.push('mystery', 'investigation', 'crime');
        }
        if (storyLower.includes('zombie') || storyLower.includes('apocalypse') || storyLower.includes('survival')) {
            keywords.push('survival', 'zombie', 'apocalypse');
        }
        if (storyLower.includes('politics') || storyLower.includes('intrigue') || storyLower.includes('court')) {
            keywords.push('politics', 'intrigue', 'social');
        }
        if (storyLower.includes('alien') || storyLower.includes('contact') || storyLower.includes('first')) {
            keywords.push('alien', 'contact', 'diplomatic');
        }
        
        return keywords;
    }

    extractNarrativeKeywords(narrative) {
        const keywords = [];
        const narrativeLower = narrative.toLowerCase();
        
        // Extract action keywords
        const actionWords = ['fight', 'investigate', 'explore', 'communicate', 'hack', 'cast', 'heal', 'protect'];
        actionWords.forEach(word => {
            if (narrativeLower.includes(word)) keywords.push(word);
        });
        
        // Extract entity keywords
        const entityWords = ['ghost', 'spirit', 'alien', 'robot', 'knight', 'wizard', 'hacker', 'detective'];
        entityWords.forEach(word => {
            if (narrativeLower.includes(word)) keywords.push(word);
        });
        
        return keywords;
    }

    mapKeywordsToAbilities(keywords) {
        const abilityMap = {
            'ghost': ['ghost_interaction', 'spirit_communication'],
            'spirit': ['spirit_communication', 'exorcism'],
            'hack': ['hacking', 'data_manipulation'],
            'alien': ['xenolinguistics', 'alien_communication'],
            'knight': ['swordsmanship', 'chivalry'],
            'investigate': ['investigation', 'deduction'],
            'fight': ['combat', 'martial_arts'],
            'heal': ['healing', 'medical'],
            'protect': ['defensive', 'protective_wards']
        };

        const abilities = [];
        keywords.forEach(keyword => {
            if (abilityMap[keyword]) {
                abilities.push(...abilityMap[keyword]);
            }
        });

        return [...new Set(abilities)];
    }

    analyzeCustomTheme(customTheme) {
        const categories = [];
        const elements = [];
        const themeLower = customTheme.toLowerCase();

        // Technology indicators
        if (themeLower.includes('cyber') || themeLower.includes('tech') || themeLower.includes('robot')) {
            categories.push('technology', 'cybernetics');
            elements.push('cyber', 'tech', 'digital');
        }

        // Supernatural indicators
        if (themeLower.includes('ghost') || themeLower.includes('spirit') || themeLower.includes('supernatural')) {
            categories.push('supernatural', 'occult');
            elements.push('ghost', 'spirit', 'supernatural');
        }

        // Medieval indicators
        if (themeLower.includes('medieval') || themeLower.includes('knight') || themeLower.includes('castle')) {
            categories.push('medieval', 'chivalry');
            elements.push('knight', 'medieval', 'honor');
        }

        return { categories, elements };
    }

    matchKeywordsToPatterns(keywords) {
        // Find best matching pattern based on keywords
        let bestMatch = null;
        let bestScore = 0;

        for (const [location, pattern] of this.locationPatterns) {
            let score = 0;
            keywords.forEach(keyword => {
                if (pattern.thematicElements.includes(keyword) || 
                    pattern.environmentalFactors.includes(keyword)) {
                    score++;
                }
            });

            if (score > bestScore) {
                bestScore = score;
                bestMatch = pattern;
            }
        }

        return bestMatch;
    }

    matchStoryKeywords(keywords) {
        // Find best matching story pattern
        let bestMatch = null;
        let bestScore = 0;

        for (const [story, pattern] of this.storyPatterns) {
            let score = 0;
            keywords.forEach(keyword => {
                if (pattern.thematicElements.includes(keyword)) {
                    score++;
                }
            });

            if (score > bestScore) {
                bestScore = score;
                bestMatch = pattern;
            }
        }

        return bestMatch;
    }
}

// Initialize the theme intelligence engine
export const themeIntelligence = new ThemeIntelligenceEngine();

/**
 * Get contextually appropriate ability parameters
 * @param {string} situation - Current situation
 * @param {object} context - Full context
 * @returns {object} Optimal ability parameters
 */
export function getContextualAbilityParameters(situation, context = {}) {
    return themeIntelligence.determineContextualAbilityParameters({
        ...context,
        situation: situation
    });
}

/**
 * Generate enhanced AI prompt with full contextual intelligence
 * @param {string} school - Ability school
 * @param {string} type - Ability type
 * @param {number} level - Ability level
 * @param {object} context - Generation context
 * @returns {string} Enhanced AI prompt
 */
export function generateContextualPrompt(school, type, level, context) {
    return themeIntelligence.generateContextualAbilityPrompt(school, type, level, context);
}

/**
 * Analyze context for ability generation
 * @param {object} context - Current context
 * @returns {object} Contextual analysis
 */
export function analyzeContextForAbilities(context) {
    return themeIntelligence.analyzeContextForAbilities(context);
}
