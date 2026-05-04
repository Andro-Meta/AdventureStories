// characterDevelopment.js
// Revolutionary Character Development AI Agent for Personality & Relationship Tracking
// Creates deep character growth, NPC relationships, and reputation systems

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import { gemmaContextOptimizer } from './gemmaContextOptimizer.js?cb=014';

/**
 * Character Development Agent - Manages personality evolution and relationships
 * Creates deep character growth based on player choices and interactions
 */
export class CharacterDevelopmentAgent {
    constructor() {
        // Character personality tracking
        this.personalityProfiles = new Map();      // playerId -> personality data
        this.personalityEvolution = new Map();     // playerId -> evolution history
        this.characterTraits = new Map();          // playerId -> trait scores
        this.moralAlignment = new Map();           // playerId -> moral compass data
        
        // NPC relationship system
        this.npcRelationships = new Map();         // npcId -> relationship data
        this.relationshipHistory = new Map();      // relationshipId -> interaction history
        this.npcMemories = new Map();              // npcId -> memory of player interactions
        this.socialNetworks = new Map();           // location -> NPC social connections
        
        // Reputation systems
        this.globalReputation = new Map();         // playerId -> global reputation
        this.locationReputation = new Map();       // playerId -> location-specific reputation
        this.factionReputation = new Map();        // playerId -> faction standings
        this.reputationEvents = new Map();         // eventId -> reputation impact
        
        // Character growth tracking
        this.growthMilestones = new Map();         // playerId -> milestone achievements
        this.characterArcs = new Map();            // playerId -> story arc progression
        this.personalStakes = new Map();           // playerId -> personal investment in outcomes
        this.emotionalJourney = new Map();         // playerId -> emotional development
        
        // AI intelligence
        this.personalityPatterns = new Map();      // Successful personality development patterns
        this.relationshipPatterns = new Map();     // Successful relationship dynamics
        this.reputationImpacts = new Map();        // Choice -> reputation consequence patterns
        
        // Performance optimization
        this.recentAnalysis = new Map();           // Prevent duplicate analysis
        this.developmentQueue = [];                // Queue for batch processing
        
        // Quality control & learning
        this.developmentQuality = new Map();       // Development event quality scores
        this.playerEngagement = new Map();         // Engagement with character development
        this.narrativeImpact = new Map();          // Impact on story progression
        
        this.initializeCharacterDevelopment();
    }

    /**
     * Initialize character development patterns and systems
     */
    initializeCharacterDevelopment() {
        const log = window.displayVisualError || console.log;
        
        // Initialize personality trait categories
        this.initializePersonalityTraits();
        
        // Initialize relationship dynamics
        this.initializeRelationshipDynamics();
        
        // Initialize reputation systems
        this.initializeReputationSystems();
        
        // Initialize character arc templates
        this.initializeCharacterArcs();
        
        log("CharacterDevelopmentAgent: Initialized with personality, relationship, and reputation systems");
    }

    /**
     * Initialize personality trait tracking system
     */
    initializePersonalityTraits() {
        // Core personality dimensions (Big Five + RPG-specific traits)
        this.personalityDimensions = {
            // Big Five personality traits
            openness: { min: 0, max: 1, description: 'Openness to experience and creativity' },
            conscientiousness: { min: 0, max: 1, description: 'Organization and dependability' },
            extraversion: { min: 0, max: 1, description: 'Social energy and assertiveness' },
            agreeableness: { min: 0, max: 1, description: 'Cooperation and trust' },
            neuroticism: { min: 0, max: 1, description: 'Emotional stability and anxiety' },
            
            // RPG-specific traits
            courage: { min: 0, max: 1, description: 'Willingness to face danger' },
            compassion: { min: 0, max: 1, description: 'Empathy and kindness' },
            cunning: { min: 0, max: 1, description: 'Strategic thinking and cleverness' },
            honor: { min: 0, max: 1, description: 'Adherence to moral principles' },
            ambition: { min: 0, max: 1, description: 'Drive for achievement and power' },
            
            // Moral alignment
            moralGood: { min: -1, max: 1, description: 'Good vs Evil alignment' },
            moralOrder: { min: -1, max: 1, description: 'Lawful vs Chaotic alignment' }
        };
        
        // Personality archetypes
        this.personalityArchetypes = {
            'The Hero': { courage: 0.8, honor: 0.9, compassion: 0.7, moralGood: 0.8, moralOrder: 0.6 },
            'The Trickster': { cunning: 0.9, openness: 0.8, extraversion: 0.7, moralOrder: -0.3 },
            'The Guardian': { conscientiousness: 0.9, agreeableness: 0.8, courage: 0.7, moralGood: 0.6 },
            'The Explorer': { openness: 0.9, extraversion: 0.6, courage: 0.7, ambition: 0.5 },
            'The Sage': { openness: 0.8, conscientiousness: 0.7, compassion: 0.6, moralGood: 0.4 },
            'The Rebel': { courage: 0.7, ambition: 0.8, moralOrder: -0.7, extraversion: 0.6 }
        };
    }

    /**
     * Initialize relationship dynamics system
     */
    initializeRelationshipDynamics() {
        // Relationship types and their characteristics
        this.relationshipTypes = {
            'ally': { trust: 0.7, respect: 0.6, affection: 0.5, dependency: 0.3 },
            'friend': { trust: 0.8, respect: 0.7, affection: 0.8, dependency: 0.2 },
            'mentor': { trust: 0.6, respect: 0.9, affection: 0.4, dependency: 0.7 },
            'rival': { trust: 0.3, respect: 0.7, affection: 0.2, dependency: 0.1 },
            'enemy': { trust: 0.1, respect: 0.2, affection: 0.1, dependency: 0.0 },
            'neutral': { trust: 0.5, respect: 0.5, affection: 0.5, dependency: 0.1 },
            'romantic': { trust: 0.9, respect: 0.8, affection: 0.9, dependency: 0.6 }
        };
        
        // Relationship evolution patterns
        this.relationshipEvolution = {
            'trust_building': ['neutral', 'ally', 'friend'],
            'respect_earning': ['neutral', 'ally', 'mentor'],
            'romantic_development': ['neutral', 'friend', 'romantic'],
            'rivalry_formation': ['neutral', 'rival', 'enemy'],
            'betrayal_arc': ['friend', 'neutral', 'enemy'],
            'redemption_arc': ['enemy', 'rival', 'neutral', 'ally']
        };
    }

    /**
     * Initialize reputation systems
     */
    initializeReputationSystems() {
        // Reputation categories
        this.reputationCategories = {
            'heroic': { description: 'Known for heroic deeds and saving others' },
            'cunning': { description: 'Reputation for cleverness and strategic thinking' },
            'honorable': { description: 'Known for keeping promises and moral behavior' },
            'ruthless': { description: 'Reputation for achieving goals by any means' },
            'mysterious': { description: 'Enigmatic figure with unknown motivations' },
            'charismatic': { description: 'Natural leader who inspires others' },
            'scholarly': { description: 'Known for knowledge and wisdom' },
            'rebellious': { description: 'Reputation for challenging authority' }
        };
        
        // Faction types and their values
        this.factionTypes = {
            'nobles': { values: ['honor', 'order', 'tradition'], opposites: ['chaos', 'rebellion'] },
            'merchants': { values: ['profit', 'negotiation', 'connections'], opposites: ['theft', 'violence'] },
            'scholars': { values: ['knowledge', 'wisdom', 'discovery'], opposites: ['ignorance', 'destruction'] },
            'rebels': { values: ['freedom', 'change', 'justice'], opposites: ['oppression', 'tradition'] },
            'criminals': { values: ['cunning', 'profit', 'loyalty'], opposites: ['law', 'betrayal'] },
            'religious': { values: ['faith', 'compassion', 'order'], opposites: ['heresy', 'cruelty'] }
        };
    }

    /**
     * Initialize character arc templates
     */
    initializeCharacterArcs() {
        // Character development arc templates
        this.characterArcTemplates = {
            'hero_journey': {
                stages: ['call_to_adventure', 'refusal', 'mentor', 'threshold', 'trials', 'revelation', 'transformation', 'return'],
                personality_changes: { courage: +0.3, honor: +0.2, compassion: +0.2 }
            },
            'redemption': {
                stages: ['fall', 'consequences', 'realization', 'struggle', 'sacrifice', 'redemption'],
                personality_changes: { honor: +0.4, compassion: +0.3, moralGood: +0.5 }
            },
            'corruption': {
                stages: ['temptation', 'first_compromise', 'justification', 'escalation', 'point_of_no_return'],
                personality_changes: { honor: -0.3, compassion: -0.2, moralGood: -0.4 }
            },
            'coming_of_age': {
                stages: ['innocence', 'challenge', 'failure', 'learning', 'growth', 'maturity'],
                personality_changes: { conscientiousness: +0.3, courage: +0.2, openness: +0.2 }
            },
            'mentor_to_student': {
                stages: ['expertise', 'student_appears', 'teaching', 'student_surpasses', 'legacy'],
                personality_changes: { compassion: +0.3, agreeableness: +0.2, ambition: -0.1 }
            }
        };
    }

    /**
     * Analyze and update character development based on player choice
     * @param {string} playerId - Player making the choice
     * @param {object} choiceData - Choice information
     * @returns {Promise<object>} Character development analysis
     */
    async analyzeCharacterDevelopment(playerId, choiceData) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get current character profile
            const currentProfile = this.getCharacterProfile(playerId);
            
            // Analyze choice impact on personality
            const personalityImpact = await this.analyzePersonalityImpact(playerId, choiceData);
            
            // Analyze relationship impacts
            const relationshipImpacts = await this.analyzeRelationshipImpacts(playerId, choiceData);
            
            // Analyze reputation changes
            const reputationChanges = await this.analyzeReputationChanges(playerId, choiceData);
            
            // Update character development
            const developmentUpdate = {
                playerId: playerId,
                choiceId: choiceData.id || generateId('choice'),
                personalityChanges: personalityImpact,
                relationshipChanges: relationshipImpacts,
                reputationChanges: reputationChanges,
                timestamp: Date.now(),
                significance: this.calculateDevelopmentSignificance(personalityImpact, relationshipImpacts, reputationChanges)
            };
            
            // Apply updates to character profile
            await this.applyCharacterDevelopment(playerId, developmentUpdate);
            
            // Check for character arc progression
            await this.checkCharacterArcProgression(playerId, developmentUpdate);
            
            // Generate narrative insights for AI systems
            const narrativeInsights = await this.generateNarrativeInsights(playerId, developmentUpdate);
            
            log(`CharacterDevelopment: Analyzed development for ${currentProfile.name} - Significance: ${developmentUpdate.significance.toFixed(2)}`);
            
            return {
                developmentUpdate: developmentUpdate,
                narrativeInsights: narrativeInsights,
                characterProfile: this.getCharacterProfile(playerId)
            };
            
        } catch (error) {
            log(`CharacterDevelopment: Analysis failed for player ${playerId}: ${error.message}`);
            return this.getFallbackDevelopment(playerId, choiceData);
        }
    }

    /**
     * Analyze personality impact of a choice
     * @param {string} playerId - Player ID
     * @param {object} choiceData - Choice information
     * @returns {Promise<object>} Personality impact analysis
     */
    async analyzePersonalityImpact(playerId, choiceData) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Build context for AI analysis
            const context = {
                playerId: playerId,
                choice: choiceData,
                currentPersonality: this.getCharacterProfile(playerId),
                recentChoices: this.getRecentChoices(playerId, 5),
                theme: gameState.adventureTheme,
                situation: gameState.currentNarrative?.slice(-200)
            };
            
            // Optimize context for Gemma
            const optimizedContext = await gemmaContextOptimizer.optimizeContextForAgent('character_development', context);
            
            // Generate AI analysis of personality impact
            const personalityAnalysis = await this.generatePersonalityAnalysis(optimizedContext);
            
            if (personalityAnalysis) {
                return personalityAnalysis;
            }
            
        } catch (error) {
            log(`CharacterDevelopment: AI personality analysis failed: ${error.message}`);
        }
        
        // Fallback to rule-based analysis
        return this.analyzePersonalityImpactRuleBased(playerId, choiceData);
    }

    /**
     * Generate AI-driven personality analysis
     * @param {object} context - Optimized context for analysis
     * @returns {Promise<object>} AI personality analysis
     */
    async generatePersonalityAnalysis(context) {
        const prompt = `Analyze how this player choice affects their personality development:

PLAYER: ${context.currentPersonality?.name || 'Unknown'}
CURRENT PERSONALITY: ${JSON.stringify(context.currentPersonality?.traits || {}, null, 2)}

CHOICE MADE: ${context.choice?.text || 'Unknown choice'}
CHOICE TYPE: ${context.choice?.type || 'Unknown'}
SITUATION: ${context.situation || 'Unknown situation'}

RECENT PATTERN: ${context.recentChoices?.map(c => c.type).join(' -> ') || 'No pattern'}

Analyze the personality impact and respond with JSON:
{
    "trait_changes": {
        "courage": 0.1,
        "compassion": -0.05,
        "honor": 0.2
    },
    "reasoning": "Explanation of why these traits changed",
    "archetype_shift": "Direction of personality evolution",
    "significance": 0.7
}

Focus on realistic, gradual personality development based on the choice's moral and emotional implications.`;

        try {
            // Show loading indicator for AI processing
            const UI = await import('./ui.js?cb=014');
            UI.showLoading(true, 'Analyzing character development...');
            
            const response = await gemmaHT.processWithHyperthreading(prompt, 'character_development');
            
            if (response && response.includes('{')) {
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
        } catch (error) {
            console.log(`CharacterDevelopment: AI analysis parsing failed: ${error.message}`);
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
     * Rule-based personality impact analysis (fallback)
     * @param {string} playerId - Player ID
     * @param {object} choiceData - Choice information
     * @returns {object} Personality impact
     */
    analyzePersonalityImpactRuleBased(playerId, choiceData) {
        const traitChanges = {};
        const choiceType = choiceData.type?.toLowerCase() || '';
        const choiceText = choiceData.text?.toLowerCase() || '';
        
        // Analyze choice type impact
        switch (choiceType) {
            case 'good':
                traitChanges.compassion = 0.05;
                traitChanges.honor = 0.05;
                traitChanges.moralGood = 0.1;
                break;
            case 'bad':
                traitChanges.compassion = -0.05;
                traitChanges.honor = -0.05;
                traitChanges.moralGood = -0.1;
                break;
            case 'risky':
                traitChanges.courage = 0.1;
                traitChanges.openness = 0.05;
                break;
            case 'investigative':
                traitChanges.openness = 0.1;
                traitChanges.conscientiousness = 0.05;
                break;
        }
        
        // Analyze choice content
        if (choiceText.includes('help') || choiceText.includes('save')) {
            traitChanges.compassion = (traitChanges.compassion || 0) + 0.1;
        }
        if (choiceText.includes('fight') || choiceText.includes('attack')) {
            traitChanges.courage = (traitChanges.courage || 0) + 0.05;
        }
        if (choiceText.includes('lie') || choiceText.includes('deceive')) {
            traitChanges.honor = (traitChanges.honor || 0) - 0.1;
        }
        
        return {
            trait_changes: traitChanges,
            reasoning: `Rule-based analysis of ${choiceType} choice`,
            archetype_shift: this.determineArchetypeShift(traitChanges),
            significance: Math.max(...Object.values(traitChanges).map(Math.abs)) || 0.1
        };
    }

    /**
     * Get character profile for a player
     * @param {string} playerId - Player ID
     * @returns {object} Character profile
     */
    getCharacterProfile(playerId) {
        if (!this.personalityProfiles.has(playerId)) {
            // Initialize new character profile
            const player = gameState.players?.find(p => p.id === playerId);
            const profile = {
                id: playerId,
                name: player?.name || 'Unknown',
                traits: this.initializeDefaultTraits(),
                archetype: 'Developing',
                reputation: { global: 0, local: new Map(), faction: new Map() },
                relationships: new Map(),
                characterArc: null,
                growthMilestones: [],
                createdAt: Date.now()
            };
            
            this.personalityProfiles.set(playerId, profile);
        }
        
        return this.personalityProfiles.get(playerId);
    }

    /**
     * Initialize default personality traits
     * @returns {object} Default trait values
     */
    initializeDefaultTraits() {
        const traits = {};
        for (const [traitName, traitInfo] of Object.entries(this.personalityDimensions)) {
            // Start with neutral values, slightly randomized
            const baseValue = (traitInfo.min + traitInfo.max) / 2;
            const randomOffset = (Math.random() - 0.5) * 0.2; // ±0.1 variation
            traits[traitName] = Math.max(traitInfo.min, Math.min(traitInfo.max, baseValue + randomOffset));
        }
        return traits;
    }

    /**
     * Apply character development updates
     * @param {string} playerId - Player ID
     * @param {object} developmentUpdate - Development changes to apply
     */
    async applyCharacterDevelopment(playerId, developmentUpdate) {
        const profile = this.getCharacterProfile(playerId);
        
        // Apply personality trait changes
        if (developmentUpdate.personalityChanges?.trait_changes) {
            for (const [trait, change] of Object.entries(developmentUpdate.personalityChanges.trait_changes)) {
                if (profile.traits[trait] !== undefined) {
                    const traitInfo = this.personalityDimensions[trait];
                    const newValue = profile.traits[trait] + change;
                    profile.traits[trait] = Math.max(traitInfo.min, Math.min(traitInfo.max, newValue));
                }
            }
        }
        
        // Update archetype if significant change
        if (developmentUpdate.significance > 0.5) {
            profile.archetype = this.determineCharacterArchetype(profile.traits);
        }
        
        // Apply relationship changes
        if (developmentUpdate.relationshipChanges) {
            // Implementation for relationship updates
        }
        
        // Apply reputation changes
        if (developmentUpdate.reputationChanges) {
            // Implementation for reputation updates
        }
        
        // Record development history
        const evolutionHistory = this.personalityEvolution.get(playerId) || [];
        evolutionHistory.push(developmentUpdate);
        this.personalityEvolution.set(playerId, evolutionHistory.slice(-20)); // Keep last 20 events
        
        // Update profile
        this.personalityProfiles.set(playerId, profile);
    }

    /**
     * Determine character archetype based on traits
     * @param {object} traits - Character traits
     * @returns {string} Character archetype
     */
    determineCharacterArchetype(traits) {
        let bestMatch = 'Developing';
        let bestScore = -1;
        
        for (const [archetype, archetypeTraits] of Object.entries(this.personalityArchetypes)) {
            let score = 0;
            let traitCount = 0;
            
            for (const [trait, expectedValue] of Object.entries(archetypeTraits)) {
                if (traits[trait] !== undefined) {
                    const difference = Math.abs(traits[trait] - expectedValue);
                    score += (1 - difference); // Higher score for closer match
                    traitCount++;
                }
            }
            
            if (traitCount > 0) {
                score /= traitCount; // Average score
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = archetype;
                }
            }
        }
        
        return bestMatch;
    }

    /**
     * Placeholder methods for full implementation
     */
    async analyzeRelationshipImpacts(playerId, choiceData) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return {};

        const relationships = {};
        
        // Analyze choice for relationship implications
        if (choiceData.type === 'social' || choiceData.text.includes('help') || choiceData.text.includes('ally')) {
            relationships.allies = { change: 0.1, reason: 'Cooperative behavior' };
        }
        
        if (choiceData.text.includes('attack') || choiceData.text.includes('hostile')) {
            relationships.enemies = { change: -0.1, reason: 'Aggressive behavior' };
        }

        return relationships;
    }

    async analyzeReputationChanges(playerId, choiceData) {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) return {};

        const reputation = {};
        
        // Analyze moral implications
        if (choiceData.text.includes('help') || choiceData.text.includes('save')) {
            reputation.heroic = { change: 0.1, reason: 'Heroic action' };
        }
        
        if (choiceData.text.includes('steal') || choiceData.text.includes('betray')) {
            reputation.villainous = { change: 0.1, reason: 'Morally questionable action' };
        }

        return reputation;
    }

    calculateDevelopmentSignificance(personality, relationships, reputation) {
        let significance = 0.3; // Base significance
        
        if (personality && Object.keys(personality).length > 0) significance += 0.2;
        if (relationships && Object.keys(relationships).length > 0) significance += 0.2;
        if (reputation && Object.keys(reputation).length > 0) significance += 0.3;
        
        return Math.min(significance, 1.0);
    }

    async checkCharacterArcProgression(playerId, update) {
        const profile = this.personalityProfiles.get(playerId);
        if (!profile) return;
        
        // Track character arc progression
        if (!profile.characterArc) {
            profile.characterArc = { stage: 'beginning', progression: 0 };
        }
        
        profile.characterArc.progression += update.significance || 0.1;
        
        if (profile.characterArc.progression > 0.3 && profile.characterArc.stage === 'beginning') {
            profile.characterArc.stage = 'development';
        } else if (profile.characterArc.progression > 0.7 && profile.characterArc.stage === 'development') {
            profile.characterArc.stage = 'climax';
        }
    }

    async generateNarrativeInsights(playerId, update) {
        const insights = {
            personalityShift: update.personalityChange ? 'Character showing growth' : 'Character remains consistent',
            relationshipNote: update.relationships ? 'Social dynamics evolving' : 'Relationships stable',
            storyHook: 'Character development creates new story opportunities'
        };
        
        return insights;
    }

    getFallbackDevelopment(playerId, choiceData) {
        return {
            personalityChange: { trait: 'adaptability', change: 0.05 },
            relationships: {},
            reputation: {},
            significance: 0.3
        };
    }

    getRecentChoices(playerId, count = 3) {
        if (!gameState.messageHistory) return [];
        
        return gameState.messageHistory
            .filter(entry => entry.type === 'action')
            .slice(-count)
            .map(entry => ({
                text: entry.content,
                turn: entry.turn,
                type: 'action'
            }));
    }
    determineArchetypeShift(traitChanges) { return 'gradual_development'; }
}

// Export singleton instance
export const characterDevelopmentAgent = new CharacterDevelopmentAgent();
