// bosses.js
// Comprehensive boss battle system with multi-phase mechanics, special abilities, and elite variants

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as UI from './ui.js?cb=014';
import { generateId, clamp, getRandomElement, getRandomInt } from './utils.js?cb=014';

/**
 * Boss types and their characteristics
 */
export const BOSS_TYPES = {
    MINI_BOSS: {
        name: 'Mini-Boss',
        hpMultiplier: 2.0,
        atkMultiplier: 1.3,
        defMultiplier: 1.2,
        specialAbilities: 1,
        phases: 1,
        lootMultiplier: 2.0,
        experienceMultiplier: 1.5
    },
    BOSS: {
        name: 'Boss',
        hpMultiplier: 4.0,
        atkMultiplier: 1.5,
        defMultiplier: 1.4,
        specialAbilities: 3,
        phases: 3,
        lootMultiplier: 3.0,
        experienceMultiplier: 2.5
    },
    RAID_BOSS: {
        name: 'Raid Boss',
        hpMultiplier: 8.0,
        atkMultiplier: 1.8,
        defMultiplier: 1.6,
        specialAbilities: 5,
        phases: 4,
        lootMultiplier: 5.0,
        experienceMultiplier: 4.0
    }
};

/**
 * Boss special abilities that can be used during combat
 */
export const BOSS_ABILITIES = {
    // Area Attacks
    FLAME_WAVE: {
        name: 'Flame Wave',
        description: 'Unleashes a wave of fire that hits all enemies',
        type: 'area_attack',
        element: 'Fire',
        damageMultiplier: 0.8,
        statusEffects: ['Burn'],
        statusChance: 0.6,
        cooldown: 3
    },
    ICE_STORM: {
        name: 'Ice Storm',
        description: 'Summons a freezing storm that slows and damages all enemies',
        type: 'area_attack',
        element: 'Ice',
        damageMultiplier: 0.7,
        statusEffects: ['Frost', 'Slow'],
        statusChance: 0.8,
        cooldown: 4
    },
    LIGHTNING_CHAIN: {
        name: 'Lightning Chain',
        description: 'Lightning jumps between all enemies',
        type: 'area_attack',
        element: 'Lightning',
        damageMultiplier: 0.9,
        statusEffects: ['Paralysis'],
        statusChance: 0.4,
        cooldown: 3
    },
    
    // Self Buffs
    BERSERKER_RAGE: {
        name: 'Berserker Rage',
        description: 'Enters a rage, increasing attack but reducing defense',
        type: 'self_buff',
        statusEffects: ['Berserk'],
        duration: 5,
        cooldown: 6
    },
    DAMAGE_SHIELD: {
        name: 'Damage Shield',
        description: 'Creates a protective barrier that reduces incoming damage',
        type: 'self_buff',
        statusEffects: ['Shield'],
        duration: 4,
        cooldown: 5
    },
    REGENERATION: {
        name: 'Regeneration',
        description: 'Begins rapidly healing each turn',
        type: 'self_heal',
        healPerTurn: 15,
        duration: 6,
        cooldown: 8
    },
    
    // Debuff Attacks
    TERROR_SCREAM: {
        name: 'Terror Scream',
        description: 'A horrifying scream that weakens and confuses enemies',
        type: 'debuff_attack',
        statusEffects: ['Weakness', 'Confusion'],
        statusChance: 0.7,
        cooldown: 4
    },
    POISON_CLOUD: {
        name: 'Poison Cloud',
        description: 'Releases toxic gas that poisons all enemies',
        type: 'area_debuff',
        statusEffects: ['Poison'],
        statusChance: 0.9,
        cooldown: 5
    },
    BLINDING_FLASH: {
        name: 'Blinding Flash',
        description: 'Brilliant light that blinds all enemies',
        type: 'area_debuff',
        statusEffects: ['Blind'],
        statusChance: 0.8,
        cooldown: 4
    },
    
    // Summon Abilities
    SUMMON_MINIONS: {
        name: 'Summon Minions',
        description: 'Calls forth lesser creatures to aid in battle',
        type: 'summon',
        minionCount: 2,
        minionType: 'weak',
        cooldown: 10
    },
    CALL_REINFORCEMENTS: {
        name: 'Call Reinforcements',
        description: 'Summons powerful allies to join the fight',
        type: 'summon',
        minionCount: 1,
        minionType: 'strong',
        cooldown: 12
    }
};

/**
 * REVOLUTIONARY DYNAMIC BOSS SYSTEM
 * No static boss definitions - all bosses generated dynamically via AI
 * Supports infinite themes with contextual intelligence
 */

/**
 * Creates a boss instance using the revolutionary dynamic enemy system
 * @param {string} bossType - 'mini_boss', 'boss', or 'raid_boss'
 * @param {string} theme - Adventure theme
 * @param {number} turn - Current game turn for scaling
 * @param {Object} context - Additional context for boss generation
 * @returns {Promise<Object>} Boss enemy instance
 */
export async function createBossInstance(bossType, theme, turn, context = {}) {
    const log = window.displayVisualError || console.log;
    
    const bossConfig = BOSS_TYPES[bossType.toUpperCase()];
    if (!bossConfig) {
        log(`Error: Unknown boss type: ${bossType}`);
        return null;
    }
    
    try {
        // REVOLUTIONARY: Use dynamic enemy system for infinite theme support
        log(`Creating dynamic boss: ${bossType} for theme '${theme}'`);
        
        const dynamicBoss = await createDynamicBoss(bossType, bossConfig, theme, turn, context);
        if (dynamicBoss) {
            log(`Successfully created dynamic boss: ${dynamicBoss.name}`);
            return dynamicBoss;
        }
        
        log(`Dynamic boss creation failed, creating emergency fallback`);
    } catch (error) {
        log(`Dynamic boss creation error: ${error.message}, creating emergency fallback`);
    }
    
    // Emergency fallback: Create a basic but functional boss
    return createEmergencyBoss(bossType, bossConfig, theme, turn, log);
}

/**
 * Creates a boss using the revolutionary dynamic boss system (PROPER ARCHITECTURE)
 * @param {string} bossType - Boss type
 * @param {Object} bossConfig - Boss configuration
 * @param {string} theme - Adventure theme
 * @param {number} turn - Current turn
 * @param {Object} context - Additional context
 * @returns {Promise<Object>} Dynamic boss instance
 */
async function createDynamicBoss(bossType, bossConfig, theme, turn, context) {
    const log = window.displayVisualError || console.log;
    
    try {
        // Import the PROPER dynamic boss system
        const { DynamicBossRegistry } = await import('./dynamicBosses.js?cb=014');
        
        // Get or create dynamic boss registry
        if (!gameState.dynamicBossRegistry) {
            gameState.dynamicBossRegistry = new DynamicBossRegistry();
        }
        
        // Build comprehensive boss context
        const bossContext = {
            theme: theme,
            customTheme: gameState.customThemeDescription,
            location: context.location || gameState.currentLocation,
            storyContext: context.storyContext || gameState.currentNarrative?.slice(-500),
            turn: turn,
            bossType: bossType,
            
            // Contextual elements for AI generation
            playerCount: gameState.players?.filter(p => !p.isDowned).length || 1,
            recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || [],
            environmentalFactors: context.environmentalFactors || [],
            
            // Boss configuration for scaling
            bossConfig: bossConfig
        };
        
        // Generate dynamic boss using specialized boss AI
        const dynamicBoss = await gameState.dynamicBossRegistry.generateContextualBoss(bossType, bossContext);
        
        if (dynamicBoss) {
            // Apply boss configuration scaling
            const scaledStats = applyBossConfigScaling(dynamicBoss, bossConfig, turn);
            Object.assign(dynamicBoss, scaledStats);
            
            log(`Dynamic boss created: ${dynamicBoss.name} (${theme} theme)`);
            return dynamicBoss;
        }
        
        return null;
        
    } catch (error) {
        log(`Dynamic boss creation failed: ${error.message}`);
        return null;
    }
}

/**
 * Apply boss configuration scaling to dynamic boss
 */
function applyBossConfigScaling(boss, bossConfig, turn) {
    const turnScaling = 1 + (turn - 1) * Config.TURN_SCALING_INCREASE;
    const levelScaling = 1 + turn * Config.PLAYER_LEVEL_SCALING_FACTOR;
    const totalScaling = Config.BASE_ENEMY_SCALING_FACTOR * turnScaling * levelScaling;
    
    return {
        hp: Math.round(boss.hp * bossConfig.hpMultiplier * totalScaling),
        maxHp: Math.round(boss.hp * bossConfig.hpMultiplier * totalScaling),
        atk: Math.round(boss.atk * bossConfig.atkMultiplier * totalScaling),
        def: Math.round(boss.def * bossConfig.defMultiplier * totalScaling),
        lootMultiplier: bossConfig.lootMultiplier,
        experienceMultiplier: bossConfig.experienceMultiplier
    };
}

/**
 * Creates an emergency boss when dynamic system fails (MINIMAL FALLBACK)
 * @param {string} bossType - Boss type
 * @param {Object} bossConfig - Boss configuration
 * @param {string} theme - Adventure theme
 * @param {number} turn - Current turn
 * @param {Function} log - Logging function
 * @returns {Object} Emergency boss instance
 */
function createEmergencyBoss(bossType, bossConfig, theme, turn, log) {
    log(`Creating emergency ${bossType} for theme: ${theme}`);
    
    // Calculate scaled stats
    const hp = calculateBossHp(bossConfig, turn);
    const atk = calculateBossAtk(bossConfig, turn);
    const def = calculateBossDef(bossConfig, turn);
    
    // Create basic but functional boss
    const boss = {
        id: generateId('emergency_boss'),
        name: `Mysterious ${bossConfig.name}`,
        description: `A powerful adversary that emerged from the ${theme} realm`,
        
        // Combat stats
        hp: hp,
        maxHp: hp,
        atk: atk,
        def: def,
        element: 'Physical',
        
        // Boss properties
        isBoss: true,
        bossType: bossType,
        isDefeated: false,
        statusEffects: [],
        
        // Basic abilities based on boss type
        abilities: getEmergencyAbilities(bossType),
        abilityCooldowns: {},
        phases: [],
        currentPhase: 0,
        
        // Rewards
        lootTier: bossConfig.name === 'Raid Boss' ? Config.Tiers.GOD : 
                 bossConfig.name === 'Boss' ? Config.Tiers.LEGENDARY : Config.Tiers.HIGH,
        lootChance: 1.0,
        lootMultiplier: bossConfig.lootMultiplier,
        experienceMultiplier: bossConfig.experienceMultiplier,
        
        // Meta properties
        isDynamic: false,
        isEmergency: true,
        createdAt: Date.now()
    };
    
    // Initialize ability cooldowns
    boss.abilities.forEach(ability => {
        boss.abilityCooldowns[ability] = 0;
    });
    
    log(`Emergency boss created: ${boss.name} (HP: ${hp}, ATK: ${atk}, DEF: ${def})`);
    return boss;
}

/**
 * Get emergency abilities based on boss type
 */
function getEmergencyAbilities(bossType) {
    switch (bossType) {
        case 'mini_boss':
            return ['BERSERKER_RAGE'];
        case 'boss':
            return ['BERSERKER_RAGE', 'DAMAGE_SHIELD', 'REGENERATION'];
        case 'raid_boss':
            return ['BERSERKER_RAGE', 'DAMAGE_SHIELD', 'REGENERATION', 'CALL_REINFORCEMENTS', 'LIGHTNING_CHAIN'];
        default:
            return ['BERSERKER_RAGE'];
    }
}

/**
 * Calculate boss HP with scaling
 */
function calculateBossHp(bossConfig, turn) {
    const turnScaling = 1 + (turn - 1) * Config.TURN_SCALING_INCREASE;
    const levelScaling = 1 + turn * Config.PLAYER_LEVEL_SCALING_FACTOR;
    const totalScaling = Config.BASE_ENEMY_SCALING_FACTOR * turnScaling * levelScaling;
    return Math.round(100 * bossConfig.hpMultiplier * totalScaling);
}

/**
 * Calculate boss ATK with scaling
 */
function calculateBossAtk(bossConfig, turn) {
    const turnScaling = 1 + (turn - 1) * Config.TURN_SCALING_INCREASE;
    const levelScaling = 1 + turn * Config.PLAYER_LEVEL_SCALING_FACTOR;
    const totalScaling = Config.BASE_ENEMY_SCALING_FACTOR * turnScaling * levelScaling;
    return Math.round(20 * bossConfig.atkMultiplier * totalScaling);
}

/**
 * Calculate boss DEF with scaling
 */
function calculateBossDef(bossConfig, turn) {
    const turnScaling = 1 + (turn - 1) * Config.TURN_SCALING_INCREASE;
    const levelScaling = 1 + turn * Config.PLAYER_LEVEL_SCALING_FACTOR;
    const totalScaling = Config.BASE_ENEMY_SCALING_FACTOR * turnScaling * levelScaling;
    return Math.round(10 * bossConfig.defMultiplier * totalScaling);
}

/**
 * Ensure dynamic boss meets minimum boss-level requirements
 */
function ensureBossMinimumStats(boss, bossConfig, turn) {
    const minHp = calculateBossHp(bossConfig, turn);
    const minAtk = calculateBossAtk(bossConfig, turn);
    const minDef = calculateBossDef(bossConfig, turn);
    
    // Ensure minimum stats
    boss.hp = Math.max(boss.hp, minHp);
    boss.maxHp = boss.hp;
    boss.atk = Math.max(boss.atk, minAtk);
    boss.def = Math.max(boss.def, minDef);
    
    // Ensure boss-level loot
    if (!boss.lootTier || boss.lootTier < Config.Tiers.HIGH) {
        boss.lootTier = bossConfig.name === 'Raid Boss' ? Config.Tiers.GOD : 
                       bossConfig.name === 'Boss' ? Config.Tiers.LEGENDARY : Config.Tiers.HIGH;
    }
}


/**
 * Initializes boss ability cooldowns
 * @param {Array} abilities - Array of ability keys
 * @returns {Object} Object with initialized cooldowns
 */
function initializeBossAbilities(abilities) {
    const cooldowns = {};
    abilities.forEach(abilityKey => {
        cooldowns[abilityKey] = 0; // Start with abilities ready
    });
    return { abilityCooldowns: cooldowns };
}

/**
 * Checks if a boss should transition to the next phase
 * @param {Object} boss - Boss enemy instance
 * @returns {boolean} True if phase transition should occur
 */
export function checkBossPhaseTransition(boss) {
    if (!boss.isBoss || !boss.phases || boss.phases.length <= 1) {
        return false;
    }
    
    const currentHpPercent = boss.hp / boss.maxHp;
    const nextPhaseIndex = boss.currentPhase + 1;
    
    if (nextPhaseIndex < boss.phases.length) {
        const nextPhase = boss.phases[nextPhaseIndex];
        if (currentHpPercent <= nextPhase.hpThreshold) {
            return true;
        }
    }
    
    return false;
}

/**
 * Triggers a boss phase transition
 * @param {Object} boss - Boss enemy instance
 */
export function triggerBossPhaseTransition(boss) {
    const log = window.displayVisualError || console.log;
    
    if (!checkBossPhaseTransition(boss)) {
        return;
    }
    
    boss.currentPhase++;
    const newPhase = boss.phases[boss.currentPhase];
    
    log(`${boss.name} enters Phase ${boss.currentPhase + 1}!`);
    
    // Update available abilities
    boss.abilities = newPhase.abilities ? [...newPhase.abilities] : boss.abilities;
    
    // Reset ability cooldowns for dramatic effect
    Object.keys(boss.abilityCooldowns).forEach(ability => {
        boss.abilityCooldowns[ability] = 0;
    });
    
    // Show phase transition message
    const phaseMessage = newPhase.description || `${boss.name} enters a new phase of battle!`;
    UI.showPopup(phaseMessage, 'boss_phase', 4000);
    
    // Optional: Apply phase transition effects
    if (newPhase.healPercent) {
        const healAmount = Math.round(boss.maxHp * newPhase.healPercent);
        boss.hp = Math.min(boss.maxHp, boss.hp + healAmount);
        UI.showPopup(`${boss.name} heals for ${healAmount} HP!`, 'healing');
    }
    
    if (newPhase.statusEffects) {
        newPhase.statusEffects.forEach(effectKey => {
            Combat.applyConfiguredStatusEffect(boss, effectKey, null, {}, 'Phase Transition');
        });
    }
}

/**
 * Selects and executes a boss special ability
 * @param {Object} boss - Boss enemy instance
 * @param {Array} targets - Array of potential targets
 * @returns {Object} Ability execution result
 */
export async function executeBossAbility(boss, targets) {
    const log = window.displayVisualError || console.log;
    
    if (!boss.abilities || boss.abilities.length === 0) {
        return { success: false, message: 'No abilities available' };
    }
    
    // Filter available abilities (not on cooldown)
    const availableAbilities = boss.abilities.filter(abilityKey => {
        const cooldown = boss.abilityCooldowns[abilityKey] || 0;
        return cooldown <= 0;
    });
    
    if (availableAbilities.length === 0) {
        return { success: false, message: 'All abilities on cooldown' };
    }
    
    // Select ability (could be enhanced with AI decision making)
    const selectedAbilityKey = getRandomElement(availableAbilities);
    const ability = BOSS_ABILITIES[selectedAbilityKey];
    
    if (!ability) {
        log(`Error: Unknown boss ability: ${selectedAbilityKey}`);
        return { success: false, message: 'Unknown ability' };
    }
    
    // Set cooldown
    boss.abilityCooldowns[selectedAbilityKey] = ability.cooldown;
    
    // Execute ability based on type
    const result = await executeAbilityByType(boss, ability, targets);
    
    // Show ability usage message
    UI.showPopup(`${boss.name} uses ${ability.name}!`, 'boss_ability', 3000);
    
    return { success: true, ability: ability.name, result };
}

/**
 * Executes a boss ability based on its type
 * @param {Object} boss - Boss enemy instance
 * @param {Object} ability - Ability definition
 * @param {Array} targets - Array of potential targets
 * @returns {Object} Execution result
 */
async function executeAbilityByType(boss, ability, targets) {
    const log = window.displayVisualError || console.log;
    const results = [];
    
    switch (ability.type) {
        case 'area_attack':
            // Hit all player targets
            for (const target of targets) {
                if (target && !target.isDowned) {
                    const attackResult = Combat.executeWeaponAttack(boss, target, {
                        element: ability.element,
                        damageMultiplier: ability.damageMultiplier || 1.0
                    });
                    
                    // Apply status effects
                    if (ability.statusEffects && attackResult.actualDamage > 0) {
                        ability.statusEffects.forEach(effectName => {
                            if (Math.random() < (ability.statusChance || 0.5)) {
                                const effectKey = Object.keys(Config.STATUS_EFFECTS).find(key => 
                                    Config.STATUS_EFFECTS[key].name === effectName
                                );
                                if (effectKey) {
                                    Combat.applyConfiguredStatusEffect(target, effectKey, null, {}, ability.name);
                                }
                            }
                        });
                    }
                    
                    results.push({ target: target.name, damage: attackResult.actualDamage });
                }
            }
            break;
            
        case 'self_buff':
            // Apply status effects to self
            if (ability.statusEffects) {
                ability.statusEffects.forEach(effectName => {
                    const effectKey = Object.keys(Config.STATUS_EFFECTS).find(key => 
                        Config.STATUS_EFFECTS[key].name === effectName
                    );
                    if (effectKey) {
                        Combat.applyConfiguredStatusEffect(boss, effectKey, ability.duration, {}, ability.name);
                    }
                });
            }
            results.push({ target: boss.name, effect: 'self_buff' });
            break;
            
        case 'self_heal':
            // Start regeneration effect
            Combat.applyStatusEffect(boss, 'Regeneration', ability.duration, {
                hpPerTurn: ability.healPerTurn
            }, ability.name);
            results.push({ target: boss.name, effect: 'regeneration' });
            break;
            
        case 'area_debuff':
        case 'debuff_attack':
            // Apply debuffs to all targets
            for (const target of targets) {
                if (target && !target.isDowned) {
                    if (ability.statusEffects) {
                        ability.statusEffects.forEach(effectName => {
                            if (Math.random() < (ability.statusChance || 0.7)) {
                                const effectKey = Object.keys(Config.STATUS_EFFECTS).find(key => 
                                    Config.STATUS_EFFECTS[key].name === effectName
                                );
                                if (effectKey) {
                                    Combat.applyConfiguredStatusEffect(target, effectKey, null, {}, ability.name);
                                }
                            }
                        });
                    }
                    results.push({ target: target.name, effect: 'debuff' });
                }
            }
            break;
            
        case 'summon':
            // Summon minions (simplified - would need full minion system)
            const minionCount = ability.minionCount || 1;
            const minionType = ability.minionType || 'weak';
            
            log(`${boss.name} attempts to summon ${minionCount} ${minionType} minions`);
            UI.showPopup(`${boss.name} summons ${minionCount} minions!`, 'warning');
            
            // For now, just show the message - full minion system would be Phase 2.2
            results.push({ effect: 'summon', count: minionCount, type: minionType });
            break;
    }
    
    return results;
}

/**
 * Updates boss ability cooldowns (called each turn)
 * @param {Object} boss - Boss enemy instance
 */
export function updateBossAbilityCooldowns(boss) {
    if (!boss.isBoss || !boss.abilityCooldowns) return;
    
    Object.keys(boss.abilityCooldowns).forEach(ability => {
        if (boss.abilityCooldowns[ability] > 0) {
            boss.abilityCooldowns[ability]--;
        }
    });
}

/**
 * Checks if an enemy is a boss
 * @param {Object} enemy - Enemy instance
 * @returns {boolean} True if enemy is a boss
 */
export function isBoss(enemy) {
    return enemy && enemy.isBoss === true;
}

/**
 * Gets boss encounter chance based on turn and location
 * @param {number} turn - Current game turn
 * @param {Object} location - Current location
 * @returns {number} Chance (0-1) of boss encounter
 */
export function getBossEncounterChance(turn, location) {
    let baseChance = 0;
    
    // Mini-boss chance increases with turn
    if (turn >= 10) {
        baseChance += 0.05; // 5% base chance after turn 10
        baseChance += (turn - 10) * 0.01; // +1% per turn after 10
    }
    
    // Boss chance starts later
    if (turn >= 20) {
        baseChance += 0.02; // Additional 2% for full boss
    }
    
    // Raid boss chance (very rare)
    if (turn >= 50) {
        baseChance += 0.005; // Additional 0.5% for raid boss
    }
    
    // Location danger modifier
    if (location && location.dangerLevel) {
        baseChance *= (1 + location.dangerLevel);
    }
    
    return Math.min(baseChance, 0.15); // Cap at 15%
}

/**
 * Determines what type of boss to spawn
 * @param {number} turn - Current game turn
 * @returns {string} Boss type ('mini_boss', 'boss', or 'raid_boss')
 */
export function determineBossType(turn) {
    const rand = Math.random();
    
    if (turn >= 50 && rand < 0.1) {
        return 'raid_boss';
    } else if (turn >= 20 && rand < 0.3) {
        return 'boss';
    } else {
        return 'mini_boss';
    }
}

// Export for use in other modules
export default {
    BOSS_TYPES,
    BOSS_ABILITIES,
    createBossInstance,
    checkBossPhaseTransition,
    triggerBossPhaseTransition,
    executeBossAbility,
    updateBossAbilityCooldowns,
    isBoss,
    getBossEncounterChance,
    determineBossType
};
