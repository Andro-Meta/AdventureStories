// spellGeneration.js
// AI-Driven Dynamic Spell Generation System
// Phase 3: Magic System Implementation

import { gameState, buildGameContextBlock } from './state.js?cb=014';
import * as Spells from './spells.js?cb=014';
import * as Config from './config.js?cb=014';
import * as AI from './aiHandler.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';

/**
 * Spell Generation Templates - Base structures for different spell types
 */
const SPELL_TEMPLATES = {
    OFFENSIVE: {
        damage: {
            cantrip: { base: 4, scaling: 1 },
            novice: { base: 8, scaling: 2 },
            apprentice: { base: 12, scaling: 3 },
            adept: { base: 18, scaling: 4 },
            expert: { base: 25, scaling: 5 },
            master: { base: 35, scaling: 6 },
            legendary: { base: 50, scaling: 8 },
            mythic: { base: 70, scaling: 10 }
        },
        targeting: ['single', 'multiple', 'area'],
        ranges: ['touch', 'short', 'medium', 'long'],
        durations: ['instant'],
        components: [['verbal', 'somatic'], ['verbal', 'somatic', 'material']]
    },
    DEFENSIVE: {
        shielding: {
            cantrip: { base: 5, scaling: 2 },
            novice: { base: 10, scaling: 3 },
            apprentice: { base: 18, scaling: 4 },
            adept: { base: 28, scaling: 5 },
            expert: { base: 40, scaling: 6 },
            master: { base: 55, scaling: 8 },
            legendary: { base: 75, scaling: 10 },
            mythic: { base: 100, scaling: 12 }
        },
        targeting: ['self', 'ally', 'party'],
        ranges: ['touch', 'short'],
        durations: ['short', 'medium', 'long'],
        components: [['verbal', 'somatic'], ['somatic', 'material']]
    },
    HEALING: {
        healing: {
            cantrip: { base: 6, scaling: 2 },
            novice: { base: 12, scaling: 3 },
            apprentice: { base: 20, scaling: 4 },
            adept: { base: 30, scaling: 5 },
            expert: { base: 42, scaling: 6 },
            master: { base: 58, scaling: 8 },
            legendary: { base: 80, scaling: 10 },
            mythic: { base: 110, scaling: 12 }
        },
        targeting: ['self', 'ally', 'party'],
        ranges: ['touch', 'short'],
        durations: ['instant', 'short'],
        components: [['verbal', 'somatic'], ['verbal', 'somatic', 'material']]
    },
    UTILITY: {
        enhancement: {
            cantrip: { base: 2, scaling: 1 },
            novice: { base: 4, scaling: 2 },
            apprentice: { base: 6, scaling: 2 },
            adept: { base: 8, scaling: 3 },
            expert: { base: 12, scaling: 3 },
            master: { base: 16, scaling: 4 },
            legendary: { base: 22, scaling: 5 },
            mythic: { base: 30, scaling: 6 }
        },
        targeting: ['self', 'ally', 'environment', 'object'],
        ranges: ['touch', 'short', 'medium'],
        durations: ['short', 'medium', 'long'],
        components: [['verbal'], ['somatic'], ['verbal', 'somatic']]
    },
    CONTROL: {
        duration: {
            cantrip: { base: 1, scaling: 1 },
            novice: { base: 2, scaling: 1 },
            apprentice: { base: 3, scaling: 1 },
            adept: { base: 4, scaling: 2 },
            expert: { base: 6, scaling: 2 },
            master: { base: 8, scaling: 3 },
            legendary: { base: 12, scaling: 4 },
            mythic: { base: 18, scaling: 5 }
        },
        targeting: ['single', 'multiple', 'area'],
        ranges: ['short', 'medium', 'long'],
        durations: ['short', 'medium', 'long'],
        components: [['verbal', 'somatic'], ['verbal', 'somatic', 'material']]
    },
    SUMMONING: {
        duration: {
            cantrip: { base: 2, scaling: 1 },
            novice: { base: 3, scaling: 1 },
            apprentice: { base: 5, scaling: 2 },
            adept: { base: 8, scaling: 2 },
            expert: { base: 12, scaling: 3 },
            master: { base: 18, scaling: 4 },
            legendary: { base: 25, scaling: 5 },
            mythic: { base: 35, scaling: 6 }
        },
        targeting: ['battlefield', 'location'],
        ranges: ['short', 'medium'],
        durations: ['short', 'medium', 'long'],
        components: [['verbal', 'somatic', 'material']]
    }
};

/**
 * School-specific spell elements and themes
 */
const SCHOOL_THEMES = {
    ELEMENTAL: {
        elements: ['fire', 'ice', 'lightning', 'earth', 'wind', 'water'],
        keywords: ['burn', 'freeze', 'shock', 'crush', 'gust', 'flow', 'flame', 'frost', 'storm', 'stone'],
        effects: ['burning', 'frozen', 'shocked', 'slowed', 'knocked_down'],
        materials: ['sulfur', 'ice crystal', 'copper wire', 'stone chip', 'feather', 'water drop']
    },
    ARCANE: {
        elements: ['force', 'energy', 'teleportation', 'time', 'space'],
        keywords: ['force', 'energy', 'warp', 'bend', 'twist', 'phase', 'pulse', 'wave', 'field', 'matrix'],
        effects: ['stunned', 'displaced', 'slowed', 'hasted', 'confused'],
        materials: ['crystal', 'silver dust', 'mirror shard', 'clockwork gear', 'void essence']
    },
    DIVINE: {
        elements: ['healing', 'protection', 'blessing', 'purification', 'light'],
        keywords: ['bless', 'heal', 'purify', 'sanctify', 'illuminate', 'ward', 'grace', 'radiance', 'holy', 'sacred'],
        effects: ['blessed', 'protected', 'regenerating', 'purified', 'illuminated'],
        materials: ['holy water', 'blessed oil', 'silver symbol', 'prayer beads', 'incense']
    },
    SHADOW: {
        elements: ['darkness', 'fear', 'curse', 'drain', 'illusion'],
        keywords: ['shadow', 'dark', 'curse', 'drain', 'wither', 'fear', 'nightmare', 'void', 'corrupt', 'decay'],
        effects: ['cursed', 'drained', 'frightened', 'weakened', 'blinded'],
        materials: ['black candle', 'bone dust', 'shadow essence', 'cursed coin', 'dark crystal']
    },
    NATURE: {
        elements: ['growth', 'animals', 'weather', 'poison', 'regeneration'],
        keywords: ['grow', 'bloom', 'wild', 'natural', 'primal', 'verdant', 'thorn', 'root', 'branch', 'leaf'],
        effects: ['poisoned', 'entangled', 'regenerating', 'strengthened', 'charmed'],
        materials: ['herb bundle', 'tree bark', 'flower petal', 'animal fur', 'seed']
    },
    MIND: {
        elements: ['telepathy', 'charm', 'confusion', 'memory', 'willpower'],
        keywords: ['mind', 'thought', 'will', 'memory', 'dream', 'psychic', 'mental', 'consciousness', 'intellect', 'wisdom'],
        effects: ['charmed', 'confused', 'dominated', 'inspired', 'enlightened'],
        materials: ['crystal orb', 'meditation stone', 'dream catcher', 'memory vial', 'wisdom scroll']
    }
};

/**
 * Generate a dynamic spell based on context and requirements
 * @param {string} school - The magic school for the spell
 * @param {string} type - The spell type (OFFENSIVE, DEFENSIVE, etc.)
 * @param {number} level - The spell level (0-7)
 * @param {object} context - Context for spell generation
 * @param {string} context.theme - Adventure theme
 * @param {string} context.situation - Current situation context
 * @param {string[]} context.playerNeeds - What the player needs
 * @param {string} context.environment - Current environment
 * @returns {Promise<Spell>} Generated spell
 */
export async function generateDynamicSpell(school, type, level, context = {}) {
    const log = window.displayVisualError || console.log;
    log(`Generating dynamic spell: ${school} ${type} Level ${level}`);
    
    try {
        // Get base templates and themes
        const template = SPELL_TEMPLATES[type];
        const schoolTheme = SCHOOL_THEMES[school];
        const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
        
        if (!template || !schoolTheme || !levelData) {
            throw new Error(`Invalid spell parameters: ${school}, ${type}, ${level}`);
        }
        
        // Build AI prompt for spell generation
        const prompt = buildSpellGenerationPrompt(school, type, level, context, schoolTheme, template);
        
        // Use schema-constrained JSON — narrative pipeline returns prose, not spell JSON
        const API = await import('./api_new.js?cb=014');
        const messages = [
            { role: 'system', content: 'You are a game data generator. Return only valid JSON matching the requested schema. No prose.' },
            { role: 'user', content: prompt }
        ];
        const aiResponse = await API.getAIResponseJSON(messages, { type: 'object' }, { max_tokens: 400, temperature: 0.7 });

        // Parse AI response and create spell object
        const spellData = parseSpellFromAI(aiResponse, school, type, level, template, schoolTheme);
        
        // Create final spell object
        const spell = createSpellObject(spellData, school, type, level, levelData);
        
        log(`Generated spell: ${spell.name} (${school} ${type} Level ${level})`);
        return spell;
        
    } catch (error) {
        log(`Error generating dynamic spell: ${error.message}`);
        // Fallback to template-based generation
        return generateTemplateSpell(school, type, level, context);
    }
}

/**
 * Build AI prompt for spell generation
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} context - Generation context
 * @param {object} schoolTheme - School theme data
 * @param {object} template - Spell template
 * @returns {string} AI prompt
 */
function buildSpellGenerationPrompt(school, type, level, context, schoolTheme, template) {
    const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
    const adaptedSchools = Spells.getAdaptedSchools();
    const schoolData = adaptedSchools[school];
    const typeData = Spells.SPELL_TYPES[type];
    const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
    
    const gameCtx = buildGameContextBlock();
    return `${gameCtx}
Create a ${levelData.name} level ${schoolData.name} ${typeData.name} ${adaptation.abilityName.toLowerCase()} for an adventure game.

${adaptation.abilityName.toUpperCase()} REQUIREMENTS:
- School: ${schoolData.name} (${schoolData.description})
- Type: ${typeData.name} (${typeData.description})
- Level: ${level} (${levelData.name} - ${levelData.description})
- ${adaptation.resourceName} Cost: ${levelData.mpCost}

CONTEXT:
- Adventure Theme: ${context.theme || 'fantasy'}
- Current Situation: ${context.situation || 'exploration'}
- Player Needs: ${context.playerNeeds?.join(', ') || 'general utility'}
- Environment: ${context.environment || 'unknown'}

SCHOOL ELEMENTS: ${schoolTheme.elements.join(', ')}
THEMATIC KEYWORDS: ${schoolTheme.keywords.join(', ')}
POSSIBLE EFFECTS: ${schoolTheme.effects.join(', ')}

Please respond with ONLY a JSON object containing:
{
    "name": "${adaptation.abilityName} Name",
    "description": "Flavorful description of what the ${adaptation.abilityName.toLowerCase()} does",
    "targeting": "single|multiple|area|self|ally|party|environment|object|battlefield|location",
    "range": "touch|short|medium|long|unlimited",
    "castTime": "instant|quick|standard|long",
    "duration": "instant|short|medium|long|permanent",
    "components": ["verbal", "somatic", "material"],
    "materialComponent": "specific material if needed",
    "effects": {
        "damage": number_if_damage_spell,
        "healing": number_if_healing_spell,
        "statusEffects": ["effect1", "effect2"],
        "modifiers": {"stat": value},
        "elements": ["element1", "element2"]
    },
    "rarity": "common|uncommon|rare|epic|legendary"
}

Make the ${adaptation.abilityName.toLowerCase()} creative, thematically appropriate for ${context.theme || 'fantasy'} setting, and balanced for its level.`;
}

/**
 * Parse spell data from AI response
 * @param {string} aiResponse - AI response text
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} template - Spell template
 * @param {object} schoolTheme - School theme
 * @returns {object} Parsed spell data
 */
function parseSpellFromAI(aiResponse, school, type, level, template, schoolTheme) {
    const log = window.displayVisualError || console.log;

    try {
        let spellData;
        if (aiResponse && typeof aiResponse === 'object') {
            spellData = aiResponse;
        } else {
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in AI response');
            spellData = JSON.parse(jsonMatch[0]);
        }
        
        // Validate and sanitize the data
        return validateAndSanitizeSpellData(spellData, school, type, level, template, schoolTheme);
        
    } catch (error) {
        log(`Error parsing AI spell response: ${error.message}`);
        // Return fallback data
        return generateFallbackSpellData(school, type, level, template, schoolTheme);
    }
}

/**
 * Validate and sanitize AI-generated spell data
 * @param {object} data - Raw AI data
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} template - Spell template
 * @param {object} schoolTheme - School theme
 * @returns {object} Validated spell data
 */
function validateAndSanitizeSpellData(data, school, type, level, template, schoolTheme) {
    const levelName = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level)?.name.toLowerCase();
    
    // Sanitize and validate each field
    const validated = {
        name: (data.name || `${schoolTheme.keywords[0]} ${type.toLowerCase()}`).substring(0, 50),
        description: (data.description || `A ${levelName} ${school.toLowerCase()} spell.`).substring(0, 200),
        targeting: template.targeting.includes(data.targeting) ? data.targeting : template.targeting[0],
        range: template.ranges.includes(data.range) ? data.range : template.ranges[0],
        castTime: ['instant', 'quick', 'standard', 'long'].includes(data.castTime) ? data.castTime : 'standard',
        duration: template.durations.includes(data.duration) ? data.duration : template.durations[0],
        components: Array.isArray(data.components) ? data.components.filter(c => 
            ['verbal', 'somatic', 'material'].includes(c)
        ) : template.components[0],
        materialComponent: data.materialComponent || null,
        effects: validateSpellEffects(data.effects || {}, type, level, template),
        rarity: ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(data.rarity) ? 
                data.rarity : (level <= 1 ? 'common' : level <= 3 ? 'uncommon' : 'rare')
    };
    
    // Ensure material component is specified if components include material
    if (validated.components.includes('material') && !validated.materialComponent) {
        validated.materialComponent = schoolTheme.materials[Math.floor(Math.random() * schoolTheme.materials.length)];
    }
    
    return validated;
}

/**
 * Validate spell effects based on type and level
 * @param {object} effects - Raw effects data
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} template - Spell template
 * @returns {object} Validated effects
 */
function validateSpellEffects(effects, type, level, template) {
    const validated = {};
    const levelName = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level)?.name.toLowerCase();
    
    // Validate damage for offensive spells
    if (type === 'OFFENSIVE' && template.damage) {
        const damageTemplate = template.damage[levelName];
        if (damageTemplate) {
            validated.damage = Math.max(1, Math.min(
                effects.damage || damageTemplate.base,
                damageTemplate.base * 1.5 // Cap at 150% of template
            ));
        }
    }
    
    // Validate healing for healing spells
    if (type === 'HEALING' && template.healing) {
        const healingTemplate = template.healing[levelName];
        if (healingTemplate) {
            validated.healing = Math.max(1, Math.min(
                effects.healing || healingTemplate.base,
                healingTemplate.base * 1.5
            ));
        }
    }
    
    // Validate status effects
    if (Array.isArray(effects.statusEffects)) {
        validated.statusEffects = effects.statusEffects.slice(0, 3); // Max 3 effects
    }
    
    // Validate modifiers
    if (effects.modifiers && typeof effects.modifiers === 'object') {
        validated.modifiers = {};
        Object.entries(effects.modifiers).forEach(([stat, value]) => {
            if (typeof value === 'number' && Math.abs(value) <= level * 5) {
                validated.modifiers[stat] = value;
            }
        });
    }
    
    // Validate elements
    if (Array.isArray(effects.elements)) {
        validated.elements = effects.elements.slice(0, 2); // Max 2 elements
    }
    
    return validated;
}

/**
 * Generate fallback spell data when AI fails
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} template - Spell template
 * @param {object} schoolTheme - School theme
 * @returns {object} Fallback spell data
 */
function generateFallbackSpellData(school, type, level, template, schoolTheme) {
    const levelName = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level)?.name.toLowerCase();
    const keyword = schoolTheme.keywords[Math.floor(Math.random() * schoolTheme.keywords.length)];
    
    const fallback = {
        name: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} ${type.charAt(0) + type.slice(1).toLowerCase()}`,
        description: `A ${levelName} ${school.toLowerCase()} spell that ${type === 'OFFENSIVE' ? 'damages enemies' : 
                     type === 'DEFENSIVE' ? 'protects allies' : type === 'HEALING' ? 'restores health' : 
                     type === 'UTILITY' ? 'provides utility' : type === 'CONTROL' ? 'controls the battlefield' : 
                     'summons aid'}.`,
        targeting: template.targeting[0],
        range: template.ranges[0],
        castTime: 'standard',
        duration: template.durations[0],
        components: template.components[0],
        materialComponent: template.components[0].includes('material') ? 
                          schoolTheme.materials[Math.floor(Math.random() * schoolTheme.materials.length)] : null,
        effects: {},
        rarity: level <= 1 ? 'common' : level <= 3 ? 'uncommon' : 'rare'
    };
    
    // Add appropriate effects
    if (type === 'OFFENSIVE' && template.damage) {
        const damageTemplate = template.damage[levelName];
        if (damageTemplate) {
            fallback.effects.damage = damageTemplate.base;
        }
    } else if (type === 'HEALING' && template.healing) {
        const healingTemplate = template.healing[levelName];
        if (healingTemplate) {
            fallback.effects.healing = healingTemplate.base;
        }
    }
    
    // Add a random status effect
    if (schoolTheme.effects.length > 0) {
        fallback.effects.statusEffects = [schoolTheme.effects[Math.floor(Math.random() * schoolTheme.effects.length)]];
    }
    
    return fallback;
}

/**
 * Create final spell object from validated data
 * @param {object} spellData - Validated spell data
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} levelData - Level data from SPELL_LEVELS
 * @returns {Spell} Complete spell object
 */
function createSpellObject(spellData, school, type, level, levelData) {
    return {
        id: `spell_generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        scaling: {
            damagePerLevel: spellData.effects.damage ? Math.max(1, Math.floor(spellData.effects.damage / 4)) : 0,
            healingPerLevel: spellData.effects.healing ? Math.max(1, Math.floor(spellData.effects.healing / 3)) : 0
        },
        components: spellData.components,
        materialComponent: spellData.materialComponent,
        isRitual: level >= 5 && Math.random() < 0.3, // 30% chance for high-level spells
        prerequisites: level >= 3 ? [`${school}_affinity_${level * 10}`] : [],
        rarity: spellData.rarity
    };
}

/**
 * Generate a template-based spell (fallback when AI fails)
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} context - Generation context
 * @returns {Spell} Template-based spell
 */
function generateTemplateSpell(school, type, level, context) {
    const log = window.displayVisualError || console.log;
    log(`Generating template-based spell: ${school} ${type} Level ${level}`);
    
    const template = SPELL_TEMPLATES[type];
    const schoolTheme = SCHOOL_THEMES[school];
    const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === level);
    
    const fallbackData = generateFallbackSpellData(school, type, level, template, schoolTheme);
    return createSpellObject(fallbackData, school, type, level, levelData);
}

/**
 * Generate a contextual spell for a specific situation
 * @param {string} situation - The situation requiring a spell
 * @param {Player} player - The player who will learn the spell
 * @param {number} maxLevel - Maximum spell level to generate
 * @returns {Promise<Spell>} Contextual spell
 */
export async function generateContextualSpell(situation, player, maxLevel = 3) {
    const log = window.displayVisualError || console.log;
    log(`Generating contextual spell for situation: ${situation}`);
    
    // Determine appropriate school and type based on situation
    const spellParams = determineSpellParameters(situation, player);
    
    // Cap level based on player's spellcasting ability
    const actualLevel = Math.min(maxLevel, player.spellcasting?.maxSpellLevel || 1);
    
    // Build context for generation
    const context = {
        theme: gameState.adventureTheme,
        situation: situation,
        playerNeeds: analyzePlayerNeeds(player),
        environment: gameState.currentLocation || 'unknown'
    };
    
    return await generateDynamicSpell(spellParams.school, spellParams.type, actualLevel, context);
}

/**
 * Determine spell parameters based on situation
 * @param {string} situation - The situation
 * @param {Player} player - The player
 * @returns {object} Spell parameters
 */
function determineSpellParameters(situation, player) {
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
    
    const params = situationMap[situation];
    if (params) return params;
    
    // Fallback based on player's highest affinity
    const highestAffinity = Object.entries(player.spellcasting?.schoolAffinities || {})
        .sort(([,a], [,b]) => b - a)[0];
    
    return {
        school: highestAffinity?.[0] || 'ARCANE',
        type: 'UTILITY'
    };
}

/**
 * Analyze player needs for spell generation
 * @param {Player} player - The player
 * @returns {string[]} Array of player needs
 */
function analyzePlayerNeeds(player) {
    const needs = [];
    
    if (player.hp < player.maxHp * 0.5) needs.push('healing');
    if (player.mp < player.maxMp * 0.3) needs.push('mp_efficiency');
    if (!player.equipment.weapon) needs.push('combat_power');
    if (!player.equipment.armor) needs.push('protection');
    if (gameState.inCombat) needs.push('combat_utility');
    else needs.push('exploration_utility');
    
    return needs.length > 0 ? needs : ['general_utility'];
}

export default {
    generateDynamicSpell,
    generateContextualSpell,
    SPELL_TEMPLATES,
    SCHOOL_THEMES
};
