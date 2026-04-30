// spells.js
// Core Magic & Spell System for Adventure Stories
// Phase 3: Magic System Implementation

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId } from './utils.js?cb=014';

/**
 * Schools of Magic - Each with unique characteristics and themes
 * NOTE: This is the base fantasy configuration. Use getAdaptedSchools() for theme-appropriate schools.
 */
export const MAGIC_SCHOOLS = {
    ELEMENTAL: {
        name: 'Elemental',
        description: 'Harness the raw forces of fire, ice, lightning, and earth',
        color: '#ff6b35',
        icon: '🔥',
        elements: ['fire', 'ice', 'lightning', 'earth', 'wind', 'water']
    },
    ARCANE: {
        name: 'Arcane',
        description: 'Pure magical energy manipulation and reality alteration',
        color: '#9c27b0',
        icon: '✨',
        elements: ['force', 'energy', 'teleportation', 'time', 'space']
    },
    DIVINE: {
        name: 'Divine',
        description: 'Channel divine power for healing, protection, and purification',
        color: '#ffd700',
        icon: '☀️',
        elements: ['healing', 'protection', 'blessing', 'purification', 'light']
    },
    SHADOW: {
        name: 'Shadow',
        description: 'Manipulate darkness, fear, and the forces of decay',
        color: '#4a148c',
        icon: '🌙',
        elements: ['darkness', 'fear', 'curse', 'drain', 'illusion']
    },
    NATURE: {
        name: 'Nature',
        description: 'Command plants, animals, and the natural world',
        color: '#4caf50',
        icon: '🌿',
        elements: ['growth', 'animals', 'weather', 'poison', 'regeneration']
    },
    MIND: {
        name: 'Mind',
        description: 'Control thoughts, emotions, and mental faculties',
        color: '#2196f3',
        icon: '🧠',
        elements: ['telepathy', 'charm', 'confusion', 'memory', 'willpower']
    }
};

/**
 * Spell Types - Different categories of magical effects
 */
export const SPELL_TYPES = {
    OFFENSIVE: {
        name: 'Offensive',
        description: 'Spells designed to damage enemies',
        targeting: ['single', 'multiple', 'area'],
        effects: ['damage', 'debuff']
    },
    DEFENSIVE: {
        name: 'Defensive',
        description: 'Spells that protect and shield',
        targeting: ['self', 'ally', 'party'],
        effects: ['shield', 'resistance', 'immunity']
    },
    HEALING: {
        name: 'Healing',
        description: 'Restore health and cure ailments',
        targeting: ['self', 'ally', 'party'],
        effects: ['heal', 'cure', 'regeneration']
    },
    UTILITY: {
        name: 'Utility',
        description: 'Practical magic for exploration and problem-solving',
        targeting: ['self', 'environment', 'object'],
        effects: ['enhancement', 'transformation', 'detection']
    },
    CONTROL: {
        name: 'Control',
        description: 'Manipulate enemies and battlefield conditions',
        targeting: ['single', 'multiple', 'area'],
        effects: ['stun', 'slow', 'charm', 'fear']
    },
    SUMMONING: {
        name: 'Summoning',
        description: 'Call forth creatures, objects, or forces',
        targeting: ['battlefield', 'location'],
        effects: ['summon', 'create', 'manifest']
    }
};

/**
 * Spell Power Levels - Determines spell strength and MP cost
 */
export const SPELL_LEVELS = {
    CANTRIP: { level: 0, name: 'Cantrip', mpCost: 1, powerMultiplier: 0.5, description: 'Minor magical effects' },
    NOVICE: { level: 1, name: 'Novice', mpCost: 3, powerMultiplier: 1.0, description: 'Basic spells' },
    APPRENTICE: { level: 2, name: 'Apprentice', mpCost: 5, powerMultiplier: 1.5, description: 'Intermediate magic' },
    ADEPT: { level: 3, name: 'Adept', mpCost: 8, powerMultiplier: 2.0, description: 'Advanced spellcasting' },
    EXPERT: { level: 4, name: 'Expert', mpCost: 12, powerMultiplier: 2.5, description: 'Powerful magic' },
    MASTER: { level: 5, name: 'Master', mpCost: 18, powerMultiplier: 3.0, description: 'Masterful spellwork' },
    LEGENDARY: { level: 6, name: 'Legendary', mpCost: 25, powerMultiplier: 4.0, description: 'Legendary magic' },
    MYTHIC: { level: 7, name: 'Mythic', mpCost: 35, powerMultiplier: 5.0, description: 'Reality-altering power' }
};

/**
 * Spell Data Structure
 * @typedef {object} Spell
 * @property {string} id - Unique spell identifier
 * @property {string} name - Display name of the spell
 * @property {string} description - Flavor text describing the spell
 * @property {string} school - Magic school (ELEMENTAL, ARCANE, etc.)
 * @property {string} type - Spell type (OFFENSIVE, DEFENSIVE, etc.)
 * @property {number} level - Spell power level (0-7)
 * @property {number} mpCost - MP required to cast
 * @property {string} targeting - How the spell targets ('single', 'multiple', 'area', 'self', etc.)
 * @property {string} range - Spell range ('touch', 'short', 'medium', 'long', 'unlimited')
 * @property {string} castTime - Time to cast ('instant', 'quick', 'standard', 'long')
 * @property {string} duration - How long effects last ('instant', 'short', 'medium', 'long', 'permanent')
 * @property {object} effects - Mechanical effects of the spell
 * @property {number} [effects.damage] - Base damage dealt
 * @property {number} [effects.healing] - Base healing provided
 * @property {string[]} [effects.statusEffects] - Status effects applied
 * @property {object} [effects.modifiers] - Stat modifiers applied
 * @property {string[]} [effects.elements] - Elemental types involved
 * @property {object} scaling - How the spell scales with caster level/stats
 * @property {string[]} components - What's required to cast ('verbal', 'somatic', 'material')
 * @property {string} [materialComponent] - Specific material required if any
 * @property {boolean} isRitual - Whether this is a ritual spell (longer cast time, more powerful)
 * @property {string[]} [prerequisites] - Requirements to learn this spell
 * @property {string} rarity - How rare/common the spell is ('common', 'uncommon', 'rare', 'epic', 'legendary')
 */

/**
 * Player Spellcasting Data Structure
 * @typedef {object} SpellcastingData
 * @property {Spell[]} knownSpells - Spells the player has learned
 * @property {Spell[]} preparedSpells - Spells ready for casting (if using preparation system)
 * @property {object} schoolAffinities - Player's affinity with each magic school (0-100)
 * @property {number} spellcastingLevel - Overall magical proficiency level
 * @property {number} maxSpellLevel - Highest level spells the player can cast
 * @property {object} spellSlots - Available spell slots by level (if using slot system)
 * @property {string[]} favoriteSchools - Schools the player specializes in
 * @property {object} castingModifiers - Bonuses/penalties to spellcasting
 */

/**
 * Initialize spellcasting data for a player
 * @param {Player} player - The player to initialize
 */
export async function initializePlayerSpellcasting(player) {
    const log = window.displayVisualError || console.log;
    
    if (!player) {
        log('ERROR: Cannot initialize spellcasting for null/undefined player');
        return;
    }
    
    if (!player.spellcasting) {
        try {
            player.spellcasting = {
            knownSpells: [],
            preparedSpells: [],
            schoolAffinities: {
                ELEMENTAL: 10,
                ARCANE: 10,
                DIVINE: 10,
                SHADOW: 10,
                NATURE: 10,
                MIND: 10
            },
            spellcastingLevel: 1,
            maxSpellLevel: 1,
            spellSlots: {
                0: 3, // Cantrips
                1: 2, // Novice spells
                2: 0, // Apprentice spells
                3: 0, // Adept spells
                4: 0, // Expert spells
                5: 0, // Master spells
                6: 0, // Legendary spells
                7: 0  // Mythic spells
            },
            favoriteSchools: [],
            castingModifiers: {
                mpCostReduction: 0,
                powerBonus: 0,
                accuracyBonus: 0,
                criticalChance: 0
            }
            };
            
            // Give starting spells based on theme/background
            await grantStartingSpells(player);
            log(`Successfully initialized spellcasting for ${player.name}`);
        } catch (error) {
            log(`ERROR: Failed to initialize spellcasting for ${player.name}:`, error);
            // Create minimal fallback spellcasting data
            player.spellcasting = {
                knownSpells: [],
                preparedSpells: [],
                schoolAffinities: { ELEMENTAL: 10, ARCANE: 10, DIVINE: 10, SHADOW: 10, NATURE: 10, MIND: 10 },
                spellcastingLevel: 1,
                maxSpellLevel: 1,
                spellSlots: { 0: 3, 1: 2, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
                favoriteSchools: [],
                castingModifiers: { mpCostReduction: 0, powerBonus: 0, accuracyBonus: 0, criticalChance: 0 }
            };
        }
    }
}

/**
 * Grant starting spells to a new spellcaster
 * @param {Player} player - The player to grant spells to
 */
async function grantStartingSpells(player) {
    const log = window.displayVisualError || console.log;
    
    try {
        // Generate theme-appropriate starting abilities using revolutionary theme intelligence
        const startingSpells = [];
        
        const context = {
            situation: 'character_creation',
            playerId: player.id,
            playerNeeds: ['basic_utility', 'survival', 'versatility'],
            storyContext: 'adventure_begins',
            isStartingAbility: true
        };
        
        // BATCH SPELL GENERATION: Generate all starting abilities in ONE API call
        const abilityRequests = [
            { situation: 'exploration_utility', type: 'UTILITY', level: 0 },
            { situation: 'basic_survival', type: 'DEFENSIVE', level: 0 },
            { situation: 'basic_interaction', type: 'UTILITY', level: 0 }
        ];
        
        try {
            const batchSpells = await generateBatchSpells(abilityRequests, player, 'starting_abilities');
            startingSpells.push(...batchSpells);
        } catch (error) {
            log(`Batch spell generation failed: ${error.message}`);
            // Fallback to basic spells
            const fallbackSpells = [
                createBasicSpell('light', 'ARCANE', 'UTILITY', 0),
                createBasicSpell('detect_magic', 'ARCANE', 'UTILITY', 0),
                createBasicSpell('minor_healing', 'DIVINE', 'HEALING', 0)
            ].filter(Boolean);
            startingSpells.push(...fallbackSpells);
        }
        
        // Ensure we have at least some abilities (fallback)
        if (startingSpells.length === 0) {
            log(`No dynamic abilities generated, using fallback spells`);
            const fallbackSpells = [
                createBasicSpell('light', 'ARCANE', 'UTILITY', 0),
                createBasicSpell('detect_magic', 'ARCANE', 'UTILITY', 0),
                createBasicSpell('minor_healing', 'DIVINE', 'HEALING', 0)
            ].filter(Boolean);
            startingSpells.push(...fallbackSpells);
        }
        
        player.spellcasting.knownSpells = startingSpells;
        player.spellcasting.preparedSpells = [...startingSpells]; // All spells prepared initially
        
        log(`Granted ${startingSpells.length} theme-appropriate starting abilities to ${player.name}`);
    } catch (error) {
        log(`ERROR: Failed to grant starting spells to ${player.name}:`, error);
        // Ensure arrays exist even if spell creation fails
        player.spellcasting.knownSpells = player.spellcasting.knownSpells || [];
        player.spellcasting.preparedSpells = player.spellcasting.preparedSpells || [];
    }
}

/**
 * Create a basic spell with standard properties
 * @param {string} spellKey - The spell identifier
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @returns {Spell} The created spell
 */
function createBasicSpell(spellKey, school, type, level) {
    const spellTemplates = {
        light: {
            name: 'Light',
            description: 'Create a small orb of magical light that illuminates dark areas',
            targeting: 'self',
            range: 'touch',
            castTime: 'instant',
            duration: 'long',
            effects: { illumination: 30 },
            components: ['verbal', 'somatic']
        },
        detect_magic: {
            name: 'Detect Magic',
            description: 'Sense the presence of magical auras and enchantments nearby',
            targeting: 'area',
            range: 'medium',
            castTime: 'quick',
            duration: 'medium',
            effects: { detection: 'magic' },
            components: ['verbal', 'somatic']
        },
        minor_healing: {
            name: 'Minor Healing',
            description: 'Channel divine energy to heal minor wounds and restore vitality',
            targeting: 'single',
            range: 'touch',
            castTime: 'standard',
            duration: 'instant',
            effects: { healing: 8 },
            components: ['verbal', 'somatic']
        }
    };
    
    const template = spellTemplates[spellKey];
    if (!template) return null;
    
    // Adapt spell name and description to current theme
    const adaptedName = AdaptiveAbilities.adaptAbilityName(template.name, school, type);
    const adaptedDescription = AdaptiveAbilities.adaptAbilityDescription(template.description, school);
    
    const spellLevelData = Object.values(SPELL_LEVELS).find(sl => sl.level === level);
    
    return {
        id: `spell_${spellKey}_${Date.now()}`,
        ...template,
        name: adaptedName,
        description: adaptedDescription,
        school,
        type,
        level,
        mpCost: spellLevelData.mpCost,
        scaling: {
            damagePerLevel: template.effects.damage ? 2 : 0,
            healingPerLevel: template.effects.healing ? 3 : 0
        },
        isRitual: false,
        prerequisites: [],
        rarity: level <= 1 ? 'common' : level <= 3 ? 'uncommon' : 'rare'
    };
}

/**
 * Get a theme-appropriate starting spell
 * @param {string} theme - The adventure theme
 * @returns {Spell|null} Theme spell or null
 */
function getThemeStartingSpell(theme) {
    const themeSpells = {
        fantasy: createBasicSpell('magic_missile', 'ARCANE', 'OFFENSIVE', 1),
        scifi: createBasicSpell('energy_bolt', 'ARCANE', 'OFFENSIVE', 1),
        horror: createBasicSpell('ward_evil', 'DIVINE', 'DEFENSIVE', 1),
        mystery: createBasicSpell('insight', 'MIND', 'UTILITY', 1),
        adventure: createBasicSpell('enhance_ability', 'ARCANE', 'UTILITY', 1)
    };
    
    return themeSpells[theme] || null;
}

/**
 * Check if a player can cast a specific spell
 * @param {Player} player - The player attempting to cast
 * @param {Spell} spell - The spell to cast
 * @returns {object} Result with success boolean and reason if failed
 */
export function canCastSpell(player, spell) {
    const log = window.displayVisualError || console.log;
    
    // Check if player has spellcasting ability
    if (!player.spellcasting) {
        return { success: false, reason: 'No spellcasting ability' };
    }
    
    // Check if spell is known
    if (!player.spellcasting.knownSpells.find(s => s.id === spell.id)) {
        return { success: false, reason: 'Spell not known' };
    }
    
    // Check if spell is prepared (if using preparation system)
    if (!player.spellcasting.preparedSpells.find(s => s.id === spell.id)) {
        return { success: false, reason: 'Spell not prepared' };
    }
    
    // Check MP cost
    const actualMpCost = calculateSpellMpCost(player, spell);
    if (player.mp < actualMpCost) {
        return { success: false, reason: `Not enough MP (need ${actualMpCost}, have ${player.mp})` };
    }
    
    // Check spell level vs caster level
    if (spell.level > player.spellcasting.maxSpellLevel) {
        return { success: false, reason: 'Spell level too high for caster' };
    }
    
    // Check if player is downed
    if (player.isDowned) {
        return { success: false, reason: 'Cannot cast while downed' };
    }
    
    return { success: true };
}

/**
 * Calculate the actual MP cost for a spell considering modifiers
 * @param {Player} player - The caster
 * @param {Spell} spell - The spell being cast
 * @returns {number} Actual MP cost
 */
function calculateSpellMpCost(player, spell) {
    let cost = spell.mpCost;
    
    // Apply MP cost reduction from equipment/abilities
    if (player.spellcasting?.castingModifiers?.mpCostReduction) {
        cost = Math.max(1, cost - player.spellcasting.castingModifiers.mpCostReduction);
    }
    
    // School affinity can reduce costs
    const schoolAffinity = player.spellcasting?.schoolAffinities?.[spell.school] || 0;
    if (schoolAffinity >= 75) {
        cost = Math.max(1, Math.floor(cost * 0.9)); // 10% reduction for high affinity
    }
    
    return cost;
}

/**
 * Get all spells available to a player
 * @param {Player} player - The player
 * @returns {Spell[]} Array of available spells
 */
export function getAvailableSpells(player) {
    if (!player.spellcasting) return [];
    
    return player.spellcasting.preparedSpells.filter(spell => {
        const canCast = canCastSpell(player, spell);
        return canCast.success;
    });
}

/**
 * Get spells by school for a player
 * @param {Player} player - The player
 * @param {string} school - The magic school
 * @returns {Spell[]} Spells from that school
 */
export function getSpellsBySchool(player, school) {
    if (!player.spellcasting) return [];
    
    return player.spellcasting.knownSpells.filter(spell => spell.school === school);
}

/**
 * Get spells by type for a player
 * @param {Player} player - The player
 * @param {string} type - The spell type
 * @returns {Spell[]} Spells of that type
 */
export function getSpellsByType(player, type) {
    if (!player.spellcasting) return [];
    
    return player.spellcasting.knownSpells.filter(spell => spell.type === type);
}

/**
 * Get the current adapted schools based on adventure theme
 * @returns {object} Theme-appropriate schools
 */
export function getAdaptedSchools() {
    return AdaptiveAbilities.getAdaptedSchools();
}

/**
 * Get adapted terminology for the current theme
 * @param {string} term - The term to adapt
 * @returns {string} Theme-appropriate term
 */
export function getAdaptedTerm(term) {
    return AdaptiveAbilities.getAdaptedTerm(term);
}

/**
 * Generate a dynamic spell using the enhanced spell agent
 * @param {string} school - Magic school
 * @param {string} type - Spell type
 * @param {number} level - Spell level
 * @param {object} context - Generation context
 * @returns {Promise<Spell>} Generated spell
 */
export async function generateDynamicSpell(school, type, level, context = {}) {
    try {
        const DynamicSpells = await import('./dynamicSpells.js?cb=014');
        return await DynamicSpells.generateDynamicSpell(school, type, level, context);
    } catch (error) {
        const log = window.displayVisualError || console.log;
        log(`Spells: Dynamic generation failed, using fallback: ${error.message}`);
        
        // Fallback to basic generation
        const SpellGeneration = await import('./spellGeneration.js?cb=014');
        return await SpellGeneration.generateDynamicSpell(school, type, level, context);
    }
}

/**
 * Generate contextual spell for specific situation using dynamic system
 * @param {string} situation - The situation
 * @param {Player} player - The player
 * @param {number} maxLevel - Maximum spell level
 * @returns {Promise<Spell>} Contextual spell
 */
export async function generateContextualSpell(situation, player, maxLevel = 3) {
    try {
        const DynamicSpells = await import('./dynamicSpells.js?cb=014');
        return await DynamicSpells.generateContextualSpell(situation, player, maxLevel);
    } catch (error) {
        const log = window.displayVisualError || console.log;
        log(`Spells: Contextual generation failed: ${error.message}`);
        return null;
    }
}

/**
 * Learn from spell casting for dynamic improvement
 * @param {Player} player - The player
 * @param {Spell} spell - The spell cast
 * @param {boolean} wasSuccessful - Whether casting was successful
 * @param {boolean} wasRelevant - Whether spell was relevant to situation
 */
export async function learnFromSpellCasting(player, spell, wasSuccessful, wasRelevant) {
    try {
        const DynamicSpells = await import('./dynamicSpells.js?cb=014');
        DynamicSpells.learnFromSpellCasting(player, spell, wasSuccessful, wasRelevant);
    } catch (error) {
        const log = window.displayVisualError || console.log;
        log(`Spells: Learning system error: ${error.message}`);
    }
}

/**
 * BATCH SPELL GENERATION - Generate multiple spells in single API call
 * Reduces API calls from N to 1 for N spells
 * @param {Array} spellRequests - Array of {situation, type, level} objects
 * @param {Object} player - Player object
 * @param {string} batchType - Type of batch (starting_abilities, learned_spells, etc.)
 * @returns {Promise<Array>} Array of generated spells
 */
async function generateBatchSpells(spellRequests, player, batchType) {
    const log = window.displayVisualError || console.log;
    
    try {
        // Build batch spell prompt
        const batchPrompt = buildBatchSpellPrompt(spellRequests, player, batchType);
        
        // (Removed dead `apiProvider === 'aistudio'` Gemma branch.)
        // Single AI call for the whole batch, via the standard handler.
        const aiHandler = await import('./aiHandler.js?cb=014');
        const aiResponse = await aiHandler.makeAICallForSystemAction(batchPrompt, true);
        const response = aiResponse.narrative;
        
        // Parse batch response into individual spells
        const spells = parseBatchSpellResponse(response, spellRequests, player);
        
        log(`Spells: Generated ${spells.length}/${spellRequests.length} spells in batch`);
        return spells;
        
    } catch (error) {
        log(`Spells: Batch generation failed: ${error.message}`);
        
        // Fallback: Generate basic spells
        return generateFallbackSpells(spellRequests, player);
    }
}

/**
 * Build optimized prompt for batch spell generation
 */
function buildBatchSpellPrompt(spellRequests, player, batchType) {
    const theme = gameState.adventureTheme;
    const themeDesc = theme === 'custom' ? gameState.customThemeDescription : theme;
    
    const spellSpecs = spellRequests.map((req, i) => 
        `${i + 1}. ${req.type} ability for ${req.situation} (Level ${req.level})`
    ).join('\n');
    
    return `Generate ${spellRequests.length} ${themeDesc}-themed abilities for ${batchType}:

${spellSpecs}

Requirements:
- Theme: ${themeDesc} (adapt magic/abilities to fit theme - e.g., tech skills for cyberpunk, survival skills for post-apocalyptic)
- Player: ${player.name}
- Context: Character creation/starting abilities
- Format each ability as JSON with: name, school, type, level, mpCost, effect, damage?, healing?

Return as JSON array: [{"name":"...", "school":"...", "type":"...", "level":..., "mpCost":..., "effect":"...", "damage":..., "healing":...}, ...]

Make abilities creative, balanced, and thematically appropriate. Ensure variety in names and effects.`;
}

/**
 * Parse batch spell response into individual spells
 */
function parseBatchSpellResponse(response, spellRequests, player) {
    const log = window.displayVisualError || console.log;
    
    try {
        // Try to extract JSON array from response
        let spellsData;
        
        if (typeof response === 'string') {
            // Look for JSON array in response
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                spellsData = JSON.parse(jsonMatch[0]);
            } else {
                // Try to parse entire response
                spellsData = JSON.parse(response);
            }
        } else if (Array.isArray(response)) {
            spellsData = response;
        } else {
            throw new Error('Invalid response format');
        }
        
        if (!Array.isArray(spellsData)) {
            throw new Error('Response is not an array');
        }
        
        // Convert each spell data to proper spell object
        const spells = [];
        for (let i = 0; i < Math.min(spellsData.length, spellRequests.length); i++) {
            const spellData = spellsData[i];
            const request = spellRequests[i];
            
            if (spellData && typeof spellData === 'object') {
                const spell = createSpellFromData(spellData, request, player);
                if (spell) {
                    spells.push(spell);
                }
            }
        }
        
        return spells;
        
    } catch (error) {
        log(`Spells: Batch parsing failed: ${error.message}`);
        return generateFallbackSpells(spellRequests, player);
    }
}

/**
 * Create spell object from parsed data
 */
function createSpellFromData(spellData, request, player) {
    try {
        const spell = {
            id: generateId('spell'),
            name: spellData.name || `${request.type} Ability`,
            description: spellData.effect || `A ${request.type.toLowerCase()} ability`,
            school: spellData.school || 'UNIVERSAL',
            type: spellData.type || request.type,
            level: spellData.level || request.level,
            mpCost: spellData.mpCost || Math.max(1, request.level * 2),
            targeting: 'single',
            range: 'short',
            castTime: 'standard',
            duration: 'instant',
            effects: {
                damage: spellData.damage || 0,
                healing: spellData.healing || 0,
                statusEffects: [],
                modifiers: {},
                elements: []
            },
            scaling: { level: 1, intelligence: 0.5 },
            components: ['verbal', 'somatic'],
            isRitual: false,
            prerequisites: [],
            rarity: 'common',
            isGenerated: true,
            generatedAt: Date.now()
        };
        
        return spell;
    } catch (error) {
        console.log(`Spells: Failed to create spell from data: ${error.message}`);
        return null;
    }
}

/**
 * Generate fallback spells when batch generation fails
 */
function generateFallbackSpells(spellRequests, player) {
    const spells = [];
    
    for (const request of spellRequests) {
        let spellKey = 'light';
        let school = 'ARCANE';
        
        if (request.type === 'DEFENSIVE') {
            spellKey = 'shield';
            school = 'ARCANE';
        } else if (request.situation.includes('survival')) {
            spellKey = 'minor_healing';
            school = 'DIVINE';
        }
        
        const spell = createBasicSpell(spellKey, school, request.type, request.level);
        if (spell) {
            spells.push(spell);
        }
    }
    
    return spells;
}

// Initialize spellcasting for existing players when the module loads
if (gameState?.players) {
    gameState.players.forEach(player => {
        if (player && !player.spellcasting) {
            initializePlayerSpellcasting(player);
        }
    });
}

export default {
    MAGIC_SCHOOLS,
    SPELL_TYPES,
    SPELL_LEVELS,
    initializePlayerSpellcasting,
    canCastSpell,
    getAvailableSpells,
    getSpellsBySchool,
    getSpellsByType
};
