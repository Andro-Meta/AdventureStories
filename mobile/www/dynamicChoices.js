// dynamicChoices.js
// Enhanced Choice Generation AI Agent for Contextual Fallback Choices
// Replaces generic boring fallbacks with intelligent, context-aware alternatives

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import { gemmaContextOptimizer } from './gemmaContextOptimizer.js?cb=014';

/**
 * Dynamic Choice Generator - Creates contextual fallback choices when AI fails
 * Ensures players always have engaging, relevant options
 */
export class DynamicChoiceGenerator {
    constructor() {
        // Choice generation patterns
        this.choicePatterns = new Map();           // theme -> choice patterns
        this.contextualChoices = new Map();       // context -> generated choices
        this.situationChoices = new Map();        // situation -> appropriate choices
        this.characterChoices = new Map();        // personality -> preferred choices
        
        // Choice intelligence
        this.choiceArchetypes = new Map();        // Choice type archetypes by theme
        this.narrativeChoices = new Map();        // Story-driven choice patterns
        // REMOVED: emergencyChoices - Fallback system that masked AI failures
        
        // Performance optimization
        this.recentGenerations = new Map();       // Prevent duplicate generations
        this.choiceCache = new Map();             // Cache successful choices
        
        // Quality control & learning
        this.choiceQuality = new Map();           // Choice quality scores
        this.playerPreferences = new Map();       // Player choice preferences
        this.contextualSuccess = new Map();       // Context -> choice success rates
        
        this.initializeDynamicChoices();
    }

    /**
     * Initialize dynamic choice patterns and archetypes
     */
    initializeDynamicChoices() {
        const log = window.displayVisualError || console.log;
        
        // Initialize choice archetypes by theme
        this.initializeChoiceArchetypes();
        
        // Initialize situational choice patterns
        this.initializeSituationalChoices();
        
        // Initialize character-based choice preferences
        this.initializeCharacterChoices();
        
        // REMOVED: Emergency fallback choice initialization
        
        log("DynamicChoiceGenerator: Initialized with contextual choice patterns");
    }

    /**
     * Initialize choice archetypes for different themes
     */
    initializeChoiceArchetypes() {
        // Fantasy theme choices
        this.choiceArchetypes.set('fantasy', {
            good: ['Honor the ancient code', 'Protect the innocent', 'Seek wisdom from elders', 'Follow the righteous path'],
            bad: ['Embrace dark magic', 'Betray your companions', 'Steal from the temple', 'Make a deal with demons'],
            risky: ['Challenge the dragon', 'Enter the cursed tomb', 'Trust the mysterious stranger', 'Use forbidden magic'],
            silly: ['Attempt to befriend the monster', 'Try to solve everything with riddles', 'Challenge the villain to a dance-off', 'Speak only in rhymes'],
            investigative: ['Search for ancient clues', 'Question the village elders', 'Study the magical runes', 'Follow the mysterious tracks']
        });

        // Cyberpunk theme choices
        this.choiceArchetypes.set('cyberpunk', {
            good: ['Expose corporate corruption', 'Help the resistance', 'Protect civilian data', 'Fight for digital freedom'],
            bad: ['Sell out to the corporations', 'Hack innocent systems', 'Betray the underground', 'Steal personal data'],
            risky: ['Jack into the mainframe', 'Confront the AI directly', 'Trust the corporate contact', 'Use experimental tech'],
            silly: ['Try to negotiate with the AI using memes', 'Challenge the corp exec to a video game', 'Attempt to hack using only emojis', 'Start a digital flash mob'],
            investigative: ['Trace the data trail', 'Analyze the code patterns', 'Interview the hackers', 'Search the dark web']
        });

        // Haunted mansion theme choices
        this.choiceArchetypes.set('haunted_mansion', {
            good: ['Help the trapped spirits', 'Perform a cleansing ritual', 'Protect others from harm', 'Seek to understand the tragedy'],
            bad: ['Disturb the ancient graves', 'Make a pact with dark forces', 'Abandon your companions', 'Desecrate the sacred items'],
            risky: ['Enter the forbidden room', 'Communicate with the spirits', 'Touch the cursed artifact', 'Spend the night alone'],
            silly: ['Try to make friends with the ghosts', 'Attempt to organize a séance party', 'Challenge the spirits to hide and seek', 'Start a ghost cooking show'],
            investigative: ['Research the mansion\'s history', 'Examine the old portraits', 'Search for hidden passages', 'Study the supernatural phenomena']
        });

        // Space exploration theme choices
        this.choiceArchetypes.set('space', {
            good: ['Follow protocol', 'Protect the crew', 'Share resources equally', 'Maintain diplomatic relations'],
            bad: ['Ignore safety protocols', 'Abandon crew members', 'Steal alien technology', 'Start an interstellar war'],
            risky: ['Explore the unknown planet', 'Make first contact', 'Enter the alien ship', 'Test the experimental drive'],
            silly: ['Try to teach aliens Earth dances', 'Attempt to trade with space currency', 'Challenge aliens to sports', 'Start an intergalactic food truck'],
            investigative: ['Scan for life signs', 'Analyze the alien technology', 'Study the star charts', 'Research the anomaly']
        });
    }

    /**
     * Initialize situational choice patterns
     */
    initializeSituationalChoices() {
        // Combat situations
        this.situationChoices.set('combat', {
            good: ['Defend your allies', 'Fight with honor', 'Protect the innocent'],
            bad: ['Strike without mercy', 'Use dirty tactics', 'Target the weak'],
            risky: ['Attempt a desperate gambit', 'Try an untested strategy', 'Go all-out attack'],
            silly: ['Try to confuse the enemy', 'Attempt an unconventional approach', 'Use the environment creatively'],
            investigative: ['Study enemy patterns', 'Look for weaknesses', 'Assess the battlefield']
        });

        // Social encounters
        this.situationChoices.set('social', {
            good: ['Speak truthfully', 'Show compassion', 'Build trust'],
            bad: ['Lie convincingly', 'Manipulate emotions', 'Threaten subtly'],
            risky: ['Make a bold proposal', 'Challenge their authority', 'Reveal a secret'],
            silly: ['Use humor to defuse tension', 'Try an unexpected approach', 'Be charmingly eccentric'],
            investigative: ['Ask probing questions', 'Observe their reactions', 'Gather information']
        });

        // Exploration situations
        this.situationChoices.set('exploration', {
            good: ['Proceed carefully', 'Help your companions', 'Respect the environment'],
            bad: ['Rush ahead recklessly', 'Take everything valuable', 'Ignore potential dangers'],
            risky: ['Explore the dangerous path', 'Try the shortcut', 'Investigate the anomaly'],
            silly: ['Try an unconventional route', 'Make the journey fun', 'Turn it into a game'],
            investigative: ['Map the area thoroughly', 'Search for clues', 'Study the surroundings']
        });
    }

    /**
     * Initialize character-based choice preferences
     */
    initializeCharacterChoices() {
        // Hero archetype preferences
        this.characterChoices.set('The Hero', {
            preferred: ['good', 'risky'],
            avoided: ['bad'],
            modifiers: {
                good: 'with unwavering courage',
                risky: 'for the greater good',
                investigative: 'to protect others'
            }
        });

        // Trickster archetype preferences
        this.characterChoices.set('The Trickster', {
            preferred: ['silly', 'risky'],
            avoided: ['good'],
            modifiers: {
                silly: 'with clever mischief',
                risky: 'with cunning calculation',
                bad: 'through clever schemes'
            }
        });

        // Guardian archetype preferences
        this.characterChoices.set('The Guardian', {
            preferred: ['good', 'investigative'],
            avoided: ['risky'],
            modifiers: {
                good: 'with protective instincts',
                investigative: 'with careful consideration',
                risky: 'only to protect others'
            }
        });
    }

    // REMOVED: initializeEmergencyChoices() - Fallback system that masked AI failures

    /**
     * Generate enhanced contextual choices
     * @param {string} narrative - Current narrative context
     * @param {boolean} inCombat - Whether in combat mode
     * @returns {Promise<Array>} Generated contextual choices
     */
    async generateContextualChoices(narrative = '', inCombat = false) {
        const log = window.displayVisualError || console.log;
        log(`DynamicChoices: Generating contextual choices (Combat: ${inCombat})`);

        try {
            // Build comprehensive context
            const context = await this.buildChoiceContext(narrative, inCombat);
            
            // Check cache first
            const cacheKey = this.buildCacheKey(context);
            const cachedChoices = this.choiceCache.get(cacheKey);
            if (cachedChoices) {
                log(`DynamicChoices: Using cached choices`);
                return cachedChoices;
            }

            // Check recent generation cooldown
            if (this.recentGenerations.has(cacheKey)) {
                const timeSince = Date.now() - this.recentGenerations.get(cacheKey);
                if (timeSince < 3000) { // 3 second cooldown
                    throw new Error(`DynamicChoices: Too many generation requests. Wait ${Math.ceil((3000 - timeSince) / 1000)} seconds before requesting new choices.`);
                }
            }

            // Optimize context for Gemma
            const optimizedContext = await gemmaContextOptimizer.optimizeContextForAgent('choices', context);
            
            // Generate AI-driven choices
            const aiChoices = await this.generateAIChoices(optimizedContext);
            
            if (aiChoices && aiChoices.length > 0) {
                // Cache successful generation
                this.choiceCache.set(cacheKey, aiChoices);
                this.recentGenerations.set(cacheKey, Date.now());
                
                log(`DynamicChoices: Generated ${aiChoices.length} AI-driven choices`);
                return aiChoices;
            }

        } catch (error) {
            log(`DynamicChoices: AI generation failed: ${error.message}`);
            // Re-throw INSIDE the catch where `error` is in scope. The
            // previous version threw outside the catch, producing a
            // ReferenceError on every retry path. Phase 0 audit P1 #4.
            throw new Error(`Dynamic choice generation failed: ${error.message}. The AI system must generate choices correctly. Check local AI server and prompts.`);
        }
    }

    /**
     * Build comprehensive context for choice generation
     * @param {string} narrative - Current narrative
     * @param {boolean} inCombat - Combat state
     * @returns {Promise<object>} Choice generation context
     */
    async buildChoiceContext(narrative, inCombat) {
        const currentPlayer = gameState.players?.[gameState.currentPlayerIndex];
        const characterProfile = gameState.characterDevelopmentAgent?.getCharacterProfile(currentPlayer?.id);
        
        // Coerce narrative to string. Callers sometimes pass a context
        // object (orchestrator path) where `.slice` would throw. Phase 0
        // audit P1 #5.
        const narrativeStr = (typeof narrative === 'string') ? narrative : String(narrative ?? '');
        return {
            narrative: narrativeStr.slice(-300), // Last 300 characters
            inCombat: inCombat,
            theme: gameState.adventureTheme,
            location: gameState.currentLocation?.name,
            turn: gameState.turn,
            player: {
                name: currentPlayer?.name,
                archetype: characterProfile?.archetype || 'Developing',
                traits: characterProfile?.traits || {},
                recentChoices: this.getRecentPlayerChoices(currentPlayer?.id, 3)
            },
            situation: this.analyzeSituation(narrative, inCombat),
            storyContext: gameState.currentNarrative?.slice(-200),
            recentEvents: gameState.storyBeats?.slice(-3) || []
        };
    }

    /**
     * Generate AI-driven contextual choices
     * @param {object} context - Optimized context
     * @returns {Promise<Array>} AI-generated choices
     */
    async generateAIChoices(context) {
        const choiceTypes = context.inCombat ? 
            ['Attack', 'Special', 'Item', 'Run'] : 
            ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];

        const prompt = `Generate contextual choices for this adventure situation:

THEME: ${context.theme}
LOCATION: ${context.location || 'Unknown'}
SITUATION: ${context.inCombat ? 'Combat' : 'Exploration'}
CURRENT NARRATIVE: ${context.narrative}

PLAYER CHARACTER:
- Name: ${context.player?.name || 'Unknown'}
- Archetype: ${context.player?.archetype || 'Developing'}
- Recent Choices: ${context.player?.recentChoices?.join(' → ') || 'None'}

STORY CONTEXT: ${context.storyContext || 'Beginning of adventure'}

${context.inCombat ? 
    `Generate ${choiceTypes.length} combat choices that are:` :
    `Generate EXACTLY ${choiceTypes.length} choices with EXACTLY ONE of each type. NO DUPLICATES ALLOWED.

⚠️ CRITICAL: You MUST generate EXACTLY ONE choice of each type: ${choiceTypes.join(', ')}
⚠️ If you generate two of the same type or miss a type, the system will reject your response.

Generate choices that are:`
}
1. Contextually appropriate to the ${context.theme} theme
2. Relevant to the current situation and location
3. Influenced by the player's ${context.player?.archetype} personality
4. Engaging and specific (not generic)

Format each choice as:
[Type=CHOICE_TYPE]Specific, engaging choice text

Required types (EXACTLY ONE OF EACH): ${choiceTypes.join(', ')}

Your choices:`;

        try {
            // Show loading indicator for AI processing
            const UI = await import('./ui.js?cb=014');
            UI.showLoading(true, 'Generating dynamic choices...');
            
            const response = await gemmaHT.processWithHyperthreading(prompt, 'choices');
            
            if (response) {
                const choices = this.parseAIChoiceResponse(response, choiceTypes);
                if (choices.length === choiceTypes.length) {
                    // Additional validation for exploration mode: ensure exactly one of each type
                    if (!context.inCombat) {
                        const typeCounts = {};
                        choices.forEach(choice => {
                            typeCounts[choice.type] = (typeCounts[choice.type] || 0) + 1;
                        });
                        
                        const duplicates = Object.entries(typeCounts).filter(([type, count]) => count > 1);
                        const missing = choiceTypes.filter(type => !typeCounts[type]);
                        
                        if (duplicates.length === 0 && missing.length === 0) {
                            // Randomize choice order
                            for (let i = choices.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [choices[i], choices[j]] = [choices[j], choices[i]];
                            }
                            return choices;
                        } else {
                            console.log(`DynamicChoices: Type validation failed - Duplicates: ${duplicates.map(([t,c]) => `${t}(${c})`).join(', ')}, Missing: ${missing.join(', ')}`);
                        }
                    } else {
                        return choices;
                    }
                }
            }
        } catch (error) {
            console.log(`DynamicChoices: AI generation error: ${error.message}`);
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
     * Parse AI choice response into structured choices
     * @param {string} response - AI response text
     * @param {Array} expectedTypes - Expected choice types
     * @returns {Array} Parsed choices
     */
    parseAIChoiceResponse(response, expectedTypes) {
        const choices = [];
        const lines = response.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            const typeMatch = line.match(/\[Type=([A-Za-z]+)\]/);
            if (typeMatch) {
                const type = typeMatch[1];
                const text = line.replace(/\[Type=[A-Za-z]+\]/, '').trim();
                
                if (expectedTypes.includes(type) && text) {
                    choices.push({ type, text });
                }
            }
        }
        
        return choices;
    }

    // REMOVED: generatePatternBasedChoices() - Fallback function that masked AI failures

    /**
     * Generate combat-specific choices
     * @param {object} context - Combat context
     * @returns {Array} Combat choices
     */
    generateCombatChoices(context) {
        const { theme, player } = context;
        
        // Get theme-appropriate combat terms
        const combatTerms = this.getCombatTermsForTheme(theme);
        
        return [
            { type: 'Attack', text: `${combatTerms.attack} with precision` },
            { type: 'Special', text: `Use ${combatTerms.special} ability` },
            { type: 'Item', text: `Deploy ${combatTerms.item} strategically` },
            { type: 'Run', text: `${combatTerms.escape} from danger` }
        ];
    }

    /**
     * Helper methods
     */
    buildCacheKey(context) {
        return `${context.theme}_${context.inCombat}_${context.situation}_${context.turn}`;
    }

    analyzeSituation(narrative, inCombat = false) {
        if (inCombat) return 'combat';
        
        const text = narrative.toLowerCase();
        if (text.includes('talk') || text.includes('speak') || text.includes('conversation')) return 'social';
        if (text.includes('explore') || text.includes('search') || text.includes('investigate')) return 'exploration';
        return 'exploration'; // Default
    }

    selectContextualChoice(themeChoices = [], situationChoices = []) {
        const allChoices = [...(themeChoices || []), ...(situationChoices || [])];
        return getRandomElement(allChoices) || 'Take action';
    }

    getCombatTermsForTheme(theme) {
        const combatTerms = {
            fantasy: { attack: 'Strike', special: 'magical', item: 'enchanted item', escape: 'Retreat' },
            cyberpunk: { attack: 'Hack', special: 'cyber', item: 'tech device', escape: 'Jack out' },
            space: { attack: 'Fire', special: 'quantum', item: 'device', escape: 'Warp away' },
            haunted_mansion: { attack: 'Banish', special: 'spiritual', item: 'blessed item', escape: 'Flee' }
        };
        
        return combatTerms[theme] || combatTerms.fantasy;
    }

    // REMOVED: getEmergencyChoice() - Fallback function that masked AI failures

    getRecentPlayerChoices(playerId, count = 3) {
        // Get actual choice history from gameState.messageHistory
        if (!gameState.messageHistory || !Array.isArray(gameState.messageHistory)) {
            return [];
        }
        
        return gameState.messageHistory
            .filter(msg => msg.playerId === playerId && msg.type === 'choice')
            .slice(-count)
            .map(msg => ({
                type: msg.choiceType,
                text: msg.choiceText,
                timestamp: msg.timestamp
            }));
    }
}

// Export singleton instance
export const dynamicChoiceGenerator = new DynamicChoiceGenerator();
