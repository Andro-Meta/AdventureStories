// dynamicSpells.js
// Dynamic AI-driven contextual spell/skill generation system
// Matches the sophistication of dynamicItems.js with spell-specific intelligence

import { gameState, buildGameContextBlock } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import { generateId } from './utils.js?cb=014';
import * as Spells from './spells.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';

/**
 * Dynamic Spell Registry - Stores learned patterns and contextual spells for this game session
 * Mirrors the DynamicItemRegistry architecture for consistency
 */
export class DynamicSpellRegistry {
    constructor() {
        // Core spell storage
        this.generatedSpells = new Map();        // spellId -> full spell object
        this.contextualCache = new Map();        // contextKey -> [spellIds]
        this.themePatterns = new Map();          // theme -> successful spell patterns
        this.storyRelevantSpells = new Map();    // storyContext -> [spellIds]
        this.schoolProgression = new Map();      // playerId -> school learning patterns
        
        // Performance optimization
        this.recentRequests = new Map();         // Prevent duplicate AI calls
        this.generationQueue = [];               // Queue for batch generation
        
        // Quality control & learning
        this.spellQualityScores = new Map();     // spellId -> quality score (0-1)
        this.playerFeedback = new Map();         // spellId -> usage feedback
        this.castingSuccess = new Map();         // spellId -> success rate
        this.contextualRelevance = new Map();    // spellId -> relevance scores
        
        // Spell-specific intelligence
        this.schoolAffinityPatterns = new Map(); // Track what schools work for what situations
        this.situationalSpells = new Map();      // situation -> effective spell types
        this.playerPreferences = new Map();      // playerId -> preferred spell characteristics
    }

    /**
     * Initialize the dynamic spell system in gameState
     */
    static initializeDynamicSpellSystem() {
        if (!gameState.dynamicSpellRegistry) {
            gameState.dynamicSpellRegistry = new DynamicSpellRegistry();
        }
        return gameState.dynamicSpellRegistry;
    }

    /**
     * Generate a contextual spell based on current game situation
     * @param {string} school - Magic school
     * @param {string} type - Spell type
     * @param {number} level - Spell level
     * @param {object} context - Enhanced context for generation
     * @returns {Promise<Spell>} Generated spell
     */
    async generateContextualSpell(school, type, level, context = {}) {
        const log = window.displayVisualError || console.log;
        
        // Build comprehensive context key for caching
        const contextKey = this.buildContextKey(school, type, level, context);
        
        // Check cache first
        const cachedSpells = this.contextualCache.get(contextKey);
        if (cachedSpells && cachedSpells.length > 0) {
            // Return highest quality cached spell
            const bestSpell = this.selectBestCachedSpell(cachedSpells);
            if (bestSpell) {
                log(`DynamicSpells: Using cached spell: ${bestSpell.name}`);
                return bestSpell;
            }
        }

        // Check if we've made this request recently
        if (this.recentRequests.has(contextKey)) {
            const timeSince = Date.now() - this.recentRequests.get(contextKey);
            if (timeSince < 5000) { // 5 second cooldown
                log(`DynamicSpells: Request too recent, using fallback`);
                return this.generateFallbackSpell(school, type, level, context);
            }
        }

        try {
            this.recentRequests.set(contextKey, Date.now());
            
            // Generate spell using enhanced Spell Agent
            const generatedSpell = await this.callSpellAgent(school, type, level, context);
            
            if (generatedSpell) {
                // Store in registry with quality analysis
                this.storeGeneratedSpell(generatedSpell, contextKey, context);
                log(`DynamicSpells: Generated new spell: ${generatedSpell.name}`);
                return generatedSpell;
            }
        } catch (error) {
            log(`DynamicSpells: AI generation failed: ${error.message}`);
        }

        // Fallback to template-based generation
        return this.generateFallbackSpell(school, type, level, context);
    }

    /**
     * Call the enhanced Spell Agent for intelligent generation
     */
    async callSpellAgent(school, type, level, context) {
        const spellPrompt = this.buildSpellAgentPrompt(school, type, level, context);
        
        try {
            // Show loading indicator for AI processing
            const UI = await import('./ui.js?cb=014');
            UI.showLoading(true, 'Generating dynamic spells...');
            
            // Use Gemma hyperthreading for better performance
            // Use schema-constrained JSON — narrative pipeline returns story prose, not spell JSON
            const API = await import('./api_new.js?cb=014');
            const messages = [
                { role: 'system', content: 'You are a game data generator. Return only valid JSON matching the requested schema. No prose.' },
                { role: 'user', content: spellPrompt }
            ];
            const aiResponse = await API.getAIResponseJSON(messages, { type: 'object' }, { max_tokens: 400, temperature: 0.7 });

            if (!aiResponse || typeof aiResponse !== 'object') {
                throw new Error('Invalid or empty AI response');
            }

            // Parse and validate the AI response
            const spellData = this.parseSpellAgentResponse(aiResponse, school, type, level, context);
            
            if (!spellData) {
                throw new Error('Failed to parse spell data from AI response');
            }
            
            // Create final spell object with quality scoring
            const spell = this.createSpellWithQuality(spellData, school, type, level, context);
            
            return spell;
            
        } catch (error) {
            const log = window.displayVisualError || console.log;
            log(`DynamicSpells: Spell Agent error: ${error.message}`);
            throw error;
        } finally {
            // Hide loading indicator
            try {
                const UI = await import('./ui.js?cb=014');
                UI.showLoading(false);
            } catch (e) {
                // Ignore UI import errors
            }
        }
    }

    /**
     * Build enhanced AI prompt for spell generation with revolutionary contextual intelligence
     */
    buildSpellAgentPrompt(school, type, level, context) {
        // Use revolutionary theme intelligence for perfect contextualization
        const contextualPrompt = ThemeIntelligence.generateContextualPrompt(school, type, level, context);
        const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
        
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
        
        // Analyze patterns for this context
        const patterns = this.analyzeContextualPatterns(school, type, context);
        const playerPrefs = this.getPlayerPreferences(context.playerId);
        
        const gameCtx = buildGameContextBlock();
        return `${gameCtx}
${contextualPrompt}

REVOLUTIONARY CONTEXTUAL ANALYSIS:
- Confidence Score: ${(contextualAnalysis.confidenceScore * 100).toFixed(0)}%
- Primary Categories: ${contextualAnalysis.primaryCategories.join(', ') || 'general'}
- AVOID Categories: ${contextualAnalysis.avoidedCategories.join(', ') || 'none'}
- Environmental Factors: ${contextualAnalysis.environmentalFactors.join(', ') || 'none'}
- Thematic Elements: ${contextualAnalysis.thematicElements.join(', ') || 'general'}

LEARNED PATTERNS:
${patterns.successful.length > 0 ? `- Successful patterns: ${patterns.successful.join(', ')}` : ''}
${patterns.effective.length > 0 ? `- Effective elements: ${patterns.effective.join(', ')}` : ''}
${playerPrefs.preferred.length > 0 ? `- Player preferences: ${playerPrefs.preferred.join(', ')}` : ''}

CRITICAL REQUIREMENTS:
- Level: ${level} (${levelData.name}) - ${adaptation.resourceName} Cost: ${levelData.mpCost}
- Must be PERFECTLY contextual for: ${context.environment || 'current setting'}
- Must use thematic elements: ${contextualAnalysis.thematicElements.slice(0, 3).join(', ')}
- Must NEVER include: ${contextualAnalysis.avoidedCategories.join(', ') || 'inappropriate themes'}

EXAMPLES FOR THIS CONTEXT:
${this.generateContextualExamples(contextualAnalysis, context)}

Respond with ONLY a JSON object:
{
    "name": "Perfectly contextual ${adaptation.abilityName.toLowerCase()} name",
    "description": "Rich description that fits EXACTLY in ${context.environment || 'this setting'}",
    "targeting": "single|multiple|area|self|ally|party|environment",
    "range": "touch|short|medium|long|unlimited", 
    "castTime": "instant|quick|standard|long",
    "duration": "instant|short|medium|long|permanent",
    "components": ["verbal", "somatic", "material"],
    "materialComponent": "theme-appropriate component if needed",
    "effects": {
        "damage": number_if_offensive,
        "healing": number_if_healing,
        "statusEffects": ["effect1", "effect2"],
        "modifiers": {"stat": value},
        "elements": ["thematic_element1", "thematic_element2"]
    },
    "rarity": "common|uncommon|rare|epic|legendary",
    "thematicElements": ["contextual", "thematic", "keywords"],
    "situationalUse": "specific context where this ability excels"
}`;
    }

    /**
     * Generate contextual examples for AI guidance
     */
    generateContextualExamples(analysis, context) {
        const examples = [];
        
        if (analysis.primaryCategories.includes('ghost_interaction')) {
            examples.push('- "Commune with Spirits" - speak with ghosts in the mansion');
            examples.push('- "Spectral Ward" - protect against supernatural attacks');
        }
        
        if (analysis.primaryCategories.includes('hacking')) {
            examples.push('- "Neural Infiltration" - hack into cybernetic systems');
            examples.push('- "Data Ghost Protocol" - become invisible in networks');
        }
        
        if (analysis.primaryCategories.includes('swordsmanship')) {
            examples.push('- "Noble Blade Dance" - masterful sword technique');
            examples.push('- "Chivalric Guard" - defend with honor');
        }

        if (analysis.primaryCategories.includes('investigation')) {
            examples.push('- "Deductive Insight" - analyze clues and evidence');
            examples.push('- "Forensic Analysis" - examine crime scenes');
        }

        return examples.length > 0 ? examples.join('\n') : '- Context-appropriate abilities for this specific setting';
    }

    /**
     * Parse and validate AI response with enhanced error handling
     */
    parseSpellAgentResponse(aiResponse, school, type, level, context) {
        try {
            if (aiResponse && typeof aiResponse === 'object') {
                return this.validateAndSanitizeSpellData(aiResponse, school, type, level, context);
            }
            // Clean the response
            let cleanResponse = aiResponse.trim();

            // Extract JSON if wrapped in markdown or other text
            const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleanResponse = jsonMatch[0];
            }
            
            const spellData = JSON.parse(cleanResponse);
            
            // Validate required fields
            if (!spellData.name || !spellData.description) {
                throw new Error('Missing required fields: name or description');
            }
            
            // Sanitize and validate data
            return this.validateAndSanitizeSpellData(spellData, school, type, level, context);
            
        } catch (error) {
            const log = window.displayVisualError || console.log;
            log(`DynamicSpells: Parse error: ${error.message}`);
            log(`DynamicSpells: Raw response: ${JSON.stringify(aiResponse).substring(0, 200)}...`);
            return null;
        }
    }

    /**
     * Validate and sanitize spell data with theme-appropriate defaults
     */
    validateAndSanitizeSpellData(data, school, type, level, context) {
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
        
        // Ensure name uses appropriate terminology
        let name = (data.name || `${school} ${type}`).substring(0, 50);
        if (name.toLowerCase().includes('spell') && adaptation.abilityName.toLowerCase() !== 'spell') {
            name = name.replace(/spell/gi, adaptation.abilityName.toLowerCase());
        }
        
        // Ensure description fits theme
        let description = (data.description || `A ${levelData.name.toLowerCase()} ${school.toLowerCase()} ${adaptation.abilityName.toLowerCase()}.`).substring(0, 300);
        
        const validated = {
            name: name,
            description: description,
            targeting: this.validateTargeting(data.targeting, type),
            range: this.validateRange(data.range, type),
            castTime: ['instant', 'quick', 'standard', 'long'].includes(data.castTime) ? data.castTime : 'standard',
            duration: this.validateDuration(data.duration, type),
            components: this.validateComponents(data.components),
            materialComponent: data.materialComponent || null,
            effects: this.validateEffects(data.effects, type, level),
            rarity: this.validateRarity(data.rarity, level),
            thematicElements: Array.isArray(data.thematicElements) ? data.thematicElements.slice(0, 5) : [],
            situationalUse: data.situationalUse || 'general use'
        };
        
        return validated;
    }

    /**
     * Create spell object with quality scoring and metadata
     */
    createSpellWithQuality(spellData, school, type, level, context) {
        const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
        
        const spell = {
            id: `spell_dynamic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: spellData.name,
            description: spellData.description,
            school: school,
            type: type,
            level: level,
            mpCost: levelData.mpCost,
            targeting: spellData.targeting,
            range: spellData.range,
            castTime: spellData.castTime,
            duration: spellData.duration,
            effects: spellData.effects,
            scaling: this.calculateSpellScaling(spellData.effects, level),
            components: spellData.components,
            materialComponent: spellData.materialComponent,
            isRitual: level >= 5 && Math.random() < 0.3,
            prerequisites: level >= 3 ? [`${school}_affinity_${level * 10}`] : [],
            rarity: spellData.rarity,
            
            // Dynamic spell metadata
            generationContext: context,
            thematicElements: spellData.thematicElements,
            situationalUse: spellData.situationalUse,
            createdAt: Date.now(),
            qualityScore: this.calculateInitialQuality(spellData, context),
            isDynamic: true
        };
        
        return spell;
    }

    /**
     * Store generated spell with contextual mapping and quality tracking
     */
    storeGeneratedSpell(spell, contextKey, context) {
        // Store the spell
        this.generatedSpells.set(spell.id, spell);
        
        // Map to context
        if (!this.contextualCache.has(contextKey)) {
            this.contextualCache.set(contextKey, []);
        }
        this.contextualCache.get(contextKey).push(spell.id);
        
        // Store quality score
        this.spellQualityScores.set(spell.id, spell.qualityScore);
        
        // Update theme patterns
        this.updateThemePatterns(spell, context);
        
        // Update situational effectiveness
        this.updateSituationalPatterns(spell, context);
        
        const log = window.displayVisualError || console.log;
        log(`DynamicSpells: Stored spell ${spell.name} with quality ${spell.qualityScore.toFixed(2)}`);
    }

    /**
     * Build context key for caching
     */
    buildContextKey(school, type, level, context) {
        const keyParts = [
            school,
            type, 
            level,
            context.theme || gameState.adventureTheme,
            context.situation || 'general',
            context.environment || 'unknown'
        ];
        return keyParts.join('|');
    }

    /**
     * Select best cached spell based on quality and relevance
     */
    selectBestCachedSpell(spellIds) {
        let bestSpell = null;
        let bestScore = 0;
        
        for (const spellId of spellIds) {
            const spell = this.generatedSpells.get(spellId);
            const quality = this.spellQualityScores.get(spellId) || 0;
            const relevance = this.contextualRelevance.get(spellId) || 0.5;
            const success = this.castingSuccess.get(spellId) || 0.5;
            
            const totalScore = (quality * 0.4) + (relevance * 0.3) + (success * 0.3);
            
            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestSpell = spell;
            }
        }
        
        return bestSpell;
    }

    /**
     * Generate fallback spell using theme intelligence templates
     */
    generateFallbackSpell(school, type, level, context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Use theme intelligence for fallback generation
            const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
            const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
            
            // Create a basic spell with theme-appropriate elements
            const spellId = `spell_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
            
            // Generate theme-appropriate name and description
            const thematicElements = contextualAnalysis.thematicElements.slice(0, 2);
            const abilityName = thematicElements.length > 0 ? 
                `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} ${adaptation.abilityName}` :
                `Basic ${adaptation.abilityName}`;
            
            const description = `A ${levelData.name.toLowerCase()} ${adaptation.abilityName.toLowerCase()} that ${
                type === 'OFFENSIVE' ? 'damages enemies' :
                type === 'DEFENSIVE' ? 'provides protection' :
                type === 'HEALING' ? 'restores health' :
                type === 'UTILITY' ? 'provides utility' :
                'assists the user'
            } in ${context.environment || 'various situations'}.`;
            
            const fallbackSpell = {
                id: spellId,
                name: abilityName,
                description: description,
                school: school,
                type: type,
                level: level,
                mpCost: levelData.mpCost,
                targeting: type === 'OFFENSIVE' ? 'single' : type === 'HEALING' ? 'ally' : 'self',
                range: 'medium',
                castTime: 'standard',
                duration: type === 'OFFENSIVE' ? 'instant' : 'medium',
                effects: this.generateBasicEffects(type, level),
                scaling: { damagePerLevel: 2, healingPerLevel: 3, effectPowerPerLevel: 0.1 },
                components: ['verbal', 'somatic'],
                materialComponent: null,
                isRitual: false,
                prerequisites: [],
                rarity: level <= 1 ? 'common' : 'uncommon',
                isDynamic: false,
                isFallback: true,
                thematicElements: thematicElements,
                createdAt: Date.now()
            };
            
            log(`Generated theme-appropriate fallback spell: ${fallbackSpell.name}`);
            return fallbackSpell;
            
        } catch (error) {
            log(`Fallback spell generation failed: ${error.message}`);
            
            // Ultimate fallback - very basic spell
            return {
                id: `spell_basic_${Date.now()}`,
                name: 'Basic Ability',
                description: 'A simple ability that provides basic functionality.',
                school: school,
                type: type,
                level: level,
                mpCost: Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level)?.mpCost || 5,
                targeting: 'self',
                range: 'touch',
                castTime: 'standard',
                duration: 'instant',
                effects: { damage: 5, healing: 5 },
                scaling: { damagePerLevel: 1, healingPerLevel: 2 },
                components: ['verbal'],
                materialComponent: null,
                isRitual: false,
                prerequisites: [],
                rarity: 'common',
                isDynamic: false,
                isFallback: true
            };
        }
    }

    /**
     * Generate basic effects for fallback spells
     */
    generateBasicEffects(type, level) {
        const effects = {};
        
        switch (type) {
            case 'OFFENSIVE':
                effects.damage = Math.max(3, level * 4);
                break;
            case 'HEALING':
                effects.healing = Math.max(5, level * 6);
                break;
            case 'DEFENSIVE':
                effects.modifiers = { def: Math.max(2, level * 2) };
                break;
            case 'UTILITY':
                effects.modifiers = { atk: Math.max(1, level) };
                break;
            default:
                effects.damage = 3;
        }
        
        return effects;
    }

    /**
     * Analyze contextual patterns for better generation
     */
    analyzeContextualPatterns(school, type, context) {
        const patterns = {
            successful: [],
            effective: [],
            preferred: []
        };
        
        // Analyze theme patterns
        const themePattern = this.themePatterns.get(context.theme || gameState.adventureTheme);
        if (themePattern) {
            patterns.successful = themePattern.successfulElements || [];
        }
        
        // Analyze situational effectiveness
        const situational = this.situationalSpells.get(context.situation);
        if (situational) {
            patterns.effective = situational.effectiveTypes || [];
        }
        
        return patterns;
    }

    /**
     * Get player preferences for spell characteristics
     */
    getPlayerPreferences(playerId) {
        const prefs = this.playerPreferences.get(playerId) || { preferred: [], avoided: [] };
        return prefs;
    }

    /**
     * Calculate initial quality score for a spell
     */
    calculateInitialQuality(spellData, context) {
        let quality = 0.5; // Base quality
        
        // Theme appropriateness
        if (spellData.thematicElements && spellData.thematicElements.length > 0) {
            quality += 0.2;
        }
        
        // Description richness
        if (spellData.description && spellData.description.length > 50) {
            quality += 0.1;
        }
        
        // Situational relevance
        if (spellData.situationalUse && spellData.situationalUse !== 'general use') {
            quality += 0.1;
        }
        
        // Effect complexity
        if (spellData.effects && Object.keys(spellData.effects).length > 1) {
            quality += 0.1;
        }
        
        return Math.min(1.0, quality);
    }

    /**
     * Update theme patterns based on successful spells
     */
    updateThemePatterns(spell, context) {
        const theme = context.theme || gameState.adventureTheme;
        if (!this.themePatterns.has(theme)) {
            this.themePatterns.set(theme, { successfulElements: [], effectiveSchools: [] });
        }
        
        const pattern = this.themePatterns.get(theme);
        if (spell.thematicElements) {
            pattern.successfulElements.push(...spell.thematicElements);
        }
        pattern.effectiveSchools.push(spell.school);
    }

    /**
     * Update situational patterns
     */
    updateSituationalPatterns(spell, context) {
        if (!context.situation) return;
        
        if (!this.situationalSpells.has(context.situation)) {
            this.situationalSpells.set(context.situation, { effectiveTypes: [], effectiveSchools: [] });
        }
        
        const pattern = this.situationalSpells.get(context.situation);
        pattern.effectiveTypes.push(spell.type);
        pattern.effectiveSchools.push(spell.school);
    }

    /**
     * Record spell usage feedback for learning
     */
    recordSpellUsage(spellId, wasSuccessful, wasRelevant, playerFeedback = null) {
        // Update success rate
        const currentSuccess = this.castingSuccess.get(spellId) || 0.5;
        const newSuccess = wasSuccessful ? 
            Math.min(1.0, currentSuccess + 0.1) : 
            Math.max(0.0, currentSuccess - 0.1);
        this.castingSuccess.set(spellId, newSuccess);
        
        // Update relevance
        const currentRelevance = this.contextualRelevance.get(spellId) || 0.5;
        const newRelevance = wasRelevant ?
            Math.min(1.0, currentRelevance + 0.1) :
            Math.max(0.0, currentRelevance - 0.1);
        this.contextualRelevance.set(spellId, newRelevance);
        
        // Store player feedback
        if (playerFeedback) {
            this.playerFeedback.set(spellId, playerFeedback);
        }
        
        const log = window.displayVisualError || console.log;
        log(`DynamicSpells: Updated spell ${spellId} - Success: ${newSuccess.toFixed(2)}, Relevance: ${newRelevance.toFixed(2)}`);
    }

    // Validation helper methods
    validateTargeting(targeting, type) {
        const validTargets = {
            'OFFENSIVE': ['single', 'multiple', 'area'],
            'DEFENSIVE': ['self', 'ally', 'party'],
            'HEALING': ['self', 'ally', 'party'],
            'UTILITY': ['self', 'ally', 'party', 'area', 'environment'],
            'CONTROL': ['single', 'multiple', 'area'],
            'SUMMONING': ['self', 'area']
        };
        
        const valid = validTargets[type] || ['single'];
        return valid.includes(targeting) ? targeting : valid[0];
    }

    validateRange(range, type) {
        const validRanges = ['touch', 'short', 'medium', 'long', 'unlimited'];
        return validRanges.includes(range) ? range : 'medium';
    }

    validateDuration(duration, type) {
        const validDurations = ['instant', 'short', 'medium', 'long', 'permanent'];
        return validDurations.includes(duration) ? duration : 
            (type === 'OFFENSIVE' ? 'instant' : 'medium');
    }

    validateComponents(components) {
        if (!Array.isArray(components)) return ['verbal', 'somatic'];
        return components.filter(c => ['verbal', 'somatic', 'material'].includes(c));
    }

    validateEffects(effects, type, level) {
        if (!effects || typeof effects !== 'object') return {};
        
        const validated = {};
        
        // Validate damage
        if (effects.damage && type === 'OFFENSIVE') {
            validated.damage = Math.max(1, Math.min(100, Math.floor(effects.damage)));
        }
        
        // Validate healing
        if (effects.healing && type === 'HEALING') {
            validated.healing = Math.max(1, Math.min(100, Math.floor(effects.healing)));
        }
        
        // Validate status effects
        if (Array.isArray(effects.statusEffects)) {
            validated.statusEffects = effects.statusEffects.slice(0, 3);
        }
        
        // Validate modifiers
        if (effects.modifiers && typeof effects.modifiers === 'object') {
            validated.modifiers = effects.modifiers;
        }
        
        // Validate elements
        if (Array.isArray(effects.elements)) {
            validated.elements = effects.elements.slice(0, 3);
        }
        
        return validated;
    }

    validateRarity(rarity, level) {
        const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        if (validRarities.includes(rarity)) return rarity;
        
        // Auto-assign based on level
        if (level <= 1) return 'common';
        if (level <= 3) return 'uncommon';
        if (level <= 5) return 'rare';
        if (level <= 6) return 'epic';
        return 'legendary';
    }

    calculateSpellScaling(effects, level) {
        return {
            damagePerLevel: effects.damage ? Math.max(1, Math.floor(effects.damage / 4)) : 0,
            healingPerLevel: effects.healing ? Math.max(1, Math.floor(effects.healing / 3)) : 0,
            effectPowerPerLevel: level >= 3 ? 0.1 : 0
        };
    }
}

// Initialize the dynamic spell system
export const dynamicSpellRegistry = DynamicSpellRegistry.initializeDynamicSpellSystem();

/**
 * Main entry point for generating spells - replaces basic spell generation
 * @param {string} school - Magic school
 * @param {string} type - Spell type  
 * @param {number} level - Spell level
 * @param {Object} context - Enhanced context for generation
 * @returns {Promise<Spell>} Generated spell
 */
export async function generateDynamicSpell(school, type, level, context = {}) {
    const registry = gameState.dynamicSpellRegistry || dynamicSpellRegistry;
    
    // Build enhanced context
    const enhancedContext = {
        ...context,
        theme: context.theme || gameState.adventureTheme,
        customTheme: gameState.customThemeDescription,
        currentLocation: gameState.currentLocation,
        turn: gameState.turn,
        playerId: context.playerId || gameState.players?.[0]?.id,
        playerNeeds: context.playerNeeds || [],
        recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || [],
        storyContext: context.storyContext || gameState.currentNarrative?.slice(0, 200)
    };
    
    return await registry.generateContextualSpell(school, type, level, enhancedContext);
}

/**
 * Generate contextual spell for specific situation
 * @param {string} situation - The situation requiring a spell
 * @param {Player} player - The player who will learn the spell
 * @param {number} maxLevel - Maximum spell level
 * @returns {Promise<Spell>} Contextual spell
 */
export async function generateContextualSpell(situation, player, maxLevel = 3) {
    const context = {
        situation: situation,
        playerId: player.id,
        playerNeeds: analyzePlayerNeeds(player, situation),
        environment: gameState.currentLocation,
        recentEvents: gameState.narrativeContext?.significantEvents || []
    };
    
    const spellParams = determineOptimalSpellParameters(situation, player);
    const actualLevel = Math.min(maxLevel, player.spellcasting?.maxSpellLevel || 1);
    
    return await generateDynamicSpell(spellParams.school, spellParams.type, actualLevel, context);
}

/**
 * Learn spell from successful casting
 * @param {Player} player - The player
 * @param {Spell} spell - The spell that was cast successfully
 */
export function learnFromSpellCasting(player, spell, wasSuccessful, wasRelevant) {
    const registry = gameState.dynamicSpellRegistry || dynamicSpellRegistry;
    
    if (spell.isDynamic) {
        registry.recordSpellUsage(spell.id, wasSuccessful, wasRelevant);
    }
    
    // Update player preferences
    if (wasSuccessful && wasRelevant) {
        const prefs = registry.playerPreferences.get(player.id) || { preferred: [], avoided: [] };
        prefs.preferred.push(spell.school, spell.type);
        registry.playerPreferences.set(player.id, prefs);
    }
}

/**
 * Generate spell rewards for defeating enemies
 * @param {string} enemyType - Type of enemy defeated
 * @param {Player} player - The player to reward
 * @returns {Promise<Spell|null>} Reward spell
 */
export async function generateSpellReward(enemyType, player) {
    const context = {
        situation: 'combat_victory',
        storyContext: `defeated_${enemyType}`,
        playerId: player.id,
        playerNeeds: ['combat_improvement'],
        isReward: true
    };
    
    // Determine appropriate spell based on enemy type
    let school, type, level;
    
    if (enemyType.includes('boss')) {
        level = Math.min(player.spellcasting?.maxSpellLevel + 1 || 2, 7);
        school = 'ELEMENTAL';
        type = 'OFFENSIVE';
    } else if (enemyType.includes('elite')) {
        level = Math.min(player.spellcasting?.maxSpellLevel || 1, 5);
        school = Math.random() < 0.5 ? 'ELEMENTAL' : 'ARCANE';
        type = Math.random() < 0.7 ? 'OFFENSIVE' : 'UTILITY';
    } else {
        level = Math.max(1, player.spellcasting?.maxSpellLevel || 1);
        school = Object.keys(Spells.MAGIC_SCHOOLS)[Math.floor(Math.random() * 6)];
        type = ['OFFENSIVE', 'DEFENSIVE', 'UTILITY'][Math.floor(Math.random() * 3)];
    }
    
    return await generateDynamicSpell(school, type, level, context);
}

// Helper functions
function analyzePlayerNeeds(player, situation) {
    const needs = [];
    
    if (player.hp < player.maxHp * 0.5) needs.push('healing');
    if (player.mp < player.maxMp * 0.3) needs.push('resource_management');
    if (situation.includes('combat')) needs.push('combat_effectiveness');
    if (situation.includes('exploration')) needs.push('utility');
    if (situation.includes('social')) needs.push('social_interaction');
    
    return needs;
}

function determineOptimalSpellParameters(situation, player) {
    // Use revolutionary theme intelligence for contextual parameter determination
    const context = {
        situation: situation,
        playerId: player.id,
        environment: gameState.currentLocation,
        theme: gameState.adventureTheme,
        storyContext: gameState.currentNarrative?.slice(-200)
    };
    
    try {
        return ThemeIntelligence.getContextualAbilityParameters(situation, context);
    } catch (error) {
        // Fallback to basic mapping if theme intelligence fails
        const situationMap = {
            'combat_damage': { school: 'ELEMENTAL', type: 'OFFENSIVE' },
            'combat_healing': { school: 'DIVINE', type: 'HEALING' },
            'combat_protection': { school: 'ARCANE', type: 'DEFENSIVE' },
            'exploration_utility': { school: 'ARCANE', type: 'UTILITY' },
            'social_interaction': { school: 'MIND', type: 'UTILITY' },
            'environmental_challenge': { school: 'NATURE', type: 'UTILITY' },
            'mystery_solving': { school: 'MIND', type: 'UTILITY' },
            'stealth_infiltration': { school: 'SHADOW', type: 'UTILITY' },
            'boss_encounter': { school: 'ELEMENTAL', type: 'OFFENSIVE' },
            'party_support': { school: 'DIVINE', type: 'DEFENSIVE' }
        };
        
        return situationMap[situation] || { school: 'ARCANE', type: 'UTILITY' };
    }
}
