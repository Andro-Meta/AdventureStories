// spellCasting.js
// Spell Casting Mechanics and Execution System
// Phase 3: Magic System Implementation

import { gameState, getCurrentPlayer } from './state.js?cb=014';
import * as Spells from './spells.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as Combat from './combat.js?cb=014';
// BUG: previously imported './statusEffects.js' which doesn't exist —
// crashed the entire app at module-load time ("Could not load essential
// game modules"). The actual implementation lives in combat.js as
// applyStatusEffect(); we alias it here so existing call sites work.
const StatusEffects = { applyStatusEffect: (target, effect) => Combat.applyStatusEffect(target, effect?.name || effect, effect?.duration ?? 3, effect?.effectTickData || {}, 'spell') };
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';

/**
 * Cast a spell with full mechanics and effects
 * @param {Player} caster - The player casting the spell
 * @param {Spell} spell - The spell being cast
 * @param {object} [target] - Optional specific target
 * @returns {Promise<object>} Casting result
 */
export async function castSpell(caster, spell, target = null) {
    const log = window.displayVisualError || console.log;
    log(`Casting spell: ${spell.name} by ${caster.name}`);
    
    try {
        // Validate casting ability
        const canCast = Spells.canCastSpell(caster, spell);
        if (!canCast.success) {
            UI.showPopup(`Cannot cast ${spell.name}: ${canCast.reason}`, 'error');
            return { success: false, reason: canCast.reason };
        }
        
        // Show casting animation/effect
        showCastingEffect(caster, spell);
        
        // Consume MP
        const mpCost = calculateActualMpCost(caster, spell);
        caster.mp -= mpCost;
        log(`${caster.name} spent ${mpCost} MP casting ${spell.name}`);
        
        // Determine targets
        const targets = determineSpellTargets(spell, caster, target);
        if (!targets || targets.length === 0) {
            UI.showPopup(`No valid targets for ${spell.name}!`, 'warning');
            return { success: false, reason: 'No valid targets' };
        }
        
        // Apply spell effects
        const results = await applySpellEffects(spell, caster, targets);
        
        // Show success feedback
        showSpellResults(spell, caster, targets, results);
        
        // Update UI
        UI.renderPlayerCards();
        if (gameState.inCombat) {
            UI.renderEnemyCards();
        }
        
        // Increase school affinity
        increaseSchoolAffinity(caster, spell.school);
        
        // Check for spell learning opportunities
        await checkSpellLearning(caster, spell);
        
        // Learn from spell casting using dynamic system
        const wasSuccessful = results.length > 0;
        const wasRelevant = results.some(r => r.effects && r.effects.length > 0);
        
        try {
            await Spells.learnFromSpellCasting(caster, spell, wasSuccessful, wasRelevant);
        } catch (error) {
            log(`SpellCasting: Learning system error: ${error.message}`);
        }
        
        log(`Successfully cast ${spell.name}`);
        return { success: true, results: results };
        
    } catch (error) {
        log(`Error casting spell ${spell.name}: ${error.message}`);
        UI.showPopup(`Spell casting failed: ${error.message}`, 'error');
        return { success: false, reason: error.message };
    }
}

/**
 * Calculate the actual MP cost considering all modifiers
 * @param {Player} caster - The caster
 * @param {Spell} spell - The spell
 * @returns {number} Actual MP cost
 */
function calculateActualMpCost(caster, spell) {
    let cost = spell.mpCost;
    
    // Apply casting modifiers
    if (caster.spellcasting?.castingModifiers?.mpCostReduction) {
        cost = Math.max(1, cost - caster.spellcasting.castingModifiers.mpCostReduction);
    }
    
    // School affinity reduction
    const schoolAffinity = caster.spellcasting?.schoolAffinities?.[spell.school] || 0;
    if (schoolAffinity >= 75) {
        cost = Math.max(1, Math.floor(cost * 0.9)); // 10% reduction
    } else if (schoolAffinity >= 50) {
        cost = Math.max(1, Math.floor(cost * 0.95)); // 5% reduction
    }
    
    // Equipment bonuses (if any magical items equipped)
    const equipment = [caster.equipment.weapon, caster.equipment.armor].filter(Boolean);
    equipment.forEach(itemId => {
        const item = caster.inventory?.find(i => i.id === itemId);
        if (item?.magicalProperties?.mpCostReduction) {
            cost = Math.max(1, cost - item.magicalProperties.mpCostReduction);
        }
    });
    
    return cost;
}

/**
 * Determine valid targets for a spell
 * @param {Spell} spell - The spell being cast
 * @param {Player} caster - The caster
 * @param {object} specificTarget - Specific target if provided
 * @returns {object[]} Array of valid targets
 */
function determineSpellTargets(spell, caster, specificTarget = null) {
    const targets = [];
    
    if (specificTarget) {
        // Use specific target if provided and valid
        if (isValidTarget(spell, specificTarget, caster)) {
            targets.push(specificTarget);
        }
        return targets;
    }
    
    // Auto-determine targets based on spell targeting
    switch (spell.targeting) {
        case 'self':
            targets.push(caster);
            break;
            
        case 'ally':
            // Find best ally target
            const allyTarget = findBestAllyTarget(spell, caster);
            if (allyTarget) targets.push(allyTarget);
            break;
            
        case 'single':
            // Find best enemy target
            const enemyTarget = findBestEnemyTarget(spell, caster);
            if (enemyTarget) targets.push(enemyTarget);
            break;
            
        case 'party':
            // Target all conscious party members
            gameState.players.forEach(player => {
                if (player && !player.isDowned) {
                    targets.push(player);
                }
            });
            break;
            
        case 'multiple':
            // Target multiple enemies (up to 3)
            const multipleTargets = findMultipleEnemyTargets(spell, caster, 3);
            targets.push(...multipleTargets);
            break;
            
        case 'area':
            // Target all enemies in area
            gameState.enemies.forEach(enemy => {
                if (enemy && !enemy.isDefeated) {
                    targets.push(enemy);
                }
            });
            break;
            
        case 'environment':
        case 'object':
        case 'battlefield':
        case 'location':
            // Environmental spells target the environment itself
            targets.push({ type: 'environment', name: 'Environment' });
            break;
    }
    
    return targets;
}

/**
 * Check if a target is valid for a spell
 * @param {Spell} spell - The spell
 * @param {object} target - The target
 * @param {Player} caster - The caster
 * @returns {boolean} Whether target is valid
 */
function isValidTarget(spell, target, caster) {
    if (!target) return false;
    
    // Self-targeting spells
    if (spell.targeting === 'self') {
        return target.id === caster.id;
    }
    
    // Ally-targeting spells
    if (spell.targeting === 'ally' || spell.targeting === 'party') {
        return target.id && target.id.startsWith('player') && !target.isDowned;
    }
    
    // Enemy-targeting spells
    if (['single', 'multiple', 'area'].includes(spell.targeting)) {
        return target.id && target.id.startsWith('enemy') && !target.isDefeated;
    }
    
    // Environmental spells
    if (['environment', 'object', 'battlefield', 'location'].includes(spell.targeting)) {
        return target.type === 'environment';
    }
    
    return false;
}

/**
 * Find the best ally target for a spell
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @returns {Player|null} Best ally target
 */
function findBestAllyTarget(spell, caster) {
    const allies = gameState.players.filter(p => p && !p.isDowned);
    
    if (spell.type === 'HEALING') {
        // Target ally with lowest HP percentage
        return allies.reduce((best, ally) => {
            const hpPercent = ally.hp / ally.maxHp;
            const bestPercent = best ? best.hp / best.maxHp : 1;
            return hpPercent < bestPercent ? ally : best;
        }, null);
    }
    
    if (spell.type === 'DEFENSIVE') {
        // Target ally with lowest defense or most vulnerable
        return allies.reduce((best, ally) => {
            return !best || ally.def < best.def ? ally : best;
        }, null);
    }
    
    // Default to caster for utility spells
    return caster;
}

/**
 * Find the best enemy target for a spell
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @returns {Enemy|null} Best enemy target
 */
function findBestEnemyTarget(spell, caster) {
    const enemies = gameState.enemies.filter(e => e && !e.isDefeated);
    
    if (enemies.length === 0) return null;
    
    if (spell.type === 'OFFENSIVE') {
        // Target enemy with lowest HP or highest threat
        return enemies.reduce((best, enemy) => {
            if (!best) return enemy;
            
            // Prioritize bosses and elites
            if (enemy.isBoss && !best.isBoss) return enemy;
            if (enemy.isElite && !best.isElite && !best.isBoss) return enemy;
            
            // Otherwise target lowest HP
            return enemy.hp < best.hp ? enemy : best;
        }, null);
    }
    
    if (spell.type === 'CONTROL') {
        // Target strongest enemy or one without status effects
        return enemies.reduce((best, enemy) => {
            if (!best) return enemy;
            
            // Prioritize enemies without status effects
            const enemyEffects = enemy.statusEffects?.length || 0;
            const bestEffects = best.statusEffects?.length || 0;
            
            if (enemyEffects < bestEffects) return enemy;
            if (enemyEffects > bestEffects) return best;
            
            // Otherwise target highest HP
            return enemy.hp > best.hp ? enemy : best;
        }, null);
    }
    
    // Default to first available enemy
    return enemies[0];
}

/**
 * Find multiple enemy targets
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @param {number} maxTargets - Maximum number of targets
 * @returns {Enemy[]} Array of enemy targets
 */
function findMultipleEnemyTargets(spell, caster, maxTargets) {
    const enemies = gameState.enemies.filter(e => e && !e.isDefeated);
    
    // Sort by priority (bosses first, then elites, then by HP)
    enemies.sort((a, b) => {
        if (a.isBoss && !b.isBoss) return -1;
        if (b.isBoss && !a.isBoss) return 1;
        if (a.isElite && !b.isElite) return -1;
        if (b.isElite && !a.isElite) return 1;
        return b.hp - a.hp; // Higher HP first
    });
    
    return enemies.slice(0, maxTargets);
}

/**
 * Apply spell effects to targets
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @param {object[]} targets - The targets
 * @returns {Promise<object[]>} Array of results for each target
 */
async function applySpellEffects(spell, caster, targets) {
    const results = [];
    
    for (const target of targets) {
        const result = await applySpellEffectToTarget(spell, caster, target);
        results.push(result);
    }
    
    return results;
}

/**
 * Apply spell effects to a single target
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @param {object} target - The target
 * @returns {Promise<object>} Result of spell application
 */
async function applySpellEffectToTarget(spell, caster, target) {
    const log = window.displayVisualError || console.log;
    const result = { target: target, effects: [] };
    
    // Calculate spell power based on caster level and affinity
    const spellPower = calculateSpellPower(spell, caster);
    
    // Apply damage
    if (spell.effects.damage) {
        const damage = Math.round(spell.effects.damage * spellPower);
        target.hp = Math.max(0, target.hp - damage);
        result.effects.push({ type: 'damage', value: damage });
        log(`${spell.name} deals ${damage} damage to ${target.name}`);
        
        // Check if enemy was defeated
        if (target.id?.startsWith('enemy') && target.hp <= 0 && !target.isDefeated) {
            await Combat.handleEnemyDefeat(target.id);
        }
    }
    
    // Apply healing
    if (spell.effects.healing) {
        const healing = Math.round(spell.effects.healing * spellPower);
        const actualHealing = Math.min(healing, target.maxHp - target.hp);
        target.hp = Math.min(target.maxHp, target.hp + healing);
        result.effects.push({ type: 'healing', value: actualHealing });
        log(`${spell.name} heals ${actualHealing} HP to ${target.name}`);
    }
    
    // Apply status effects
    if (spell.effects.statusEffects?.length > 0) {
        for (const effectName of spell.effects.statusEffects) {
            const adaptedEffectName = AdaptiveAbilities.adaptStatusEffect(effectName);
            const statusEffect = createStatusEffectFromSpell(effectName, spell, caster);
            if (statusEffect) {
                // Use adapted name for display
                statusEffect.name = adaptedEffectName.charAt(0).toUpperCase() + adaptedEffectName.slice(1);
                StatusEffects.applyStatusEffect(target, statusEffect);
                result.effects.push({ type: 'status', value: adaptedEffectName });
                log(`${spell.name} applies ${adaptedEffectName} to ${target.name}`);
            }
        }
    }
    
    // Apply stat modifiers
    if (spell.effects.modifiers) {
        Object.entries(spell.effects.modifiers).forEach(([stat, value]) => {
            const modifier = Math.round(value * spellPower);
            if (target[stat] !== undefined) {
                target[stat] += modifier;
                result.effects.push({ type: 'modifier', stat: stat, value: modifier });
                log(`${spell.name} modifies ${target.name}'s ${stat} by ${modifier}`);
            }
        });
    }
    
    // Handle environmental effects
    if (target.type === 'environment') {
        result.effects.push({ type: 'environmental', description: `${spell.name} affects the environment` });
        log(`${spell.name} creates environmental effects`);
    }
    
    return result;
}

/**
 * Calculate spell power based on caster abilities
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @returns {number} Spell power multiplier
 */
function calculateSpellPower(spell, caster) {
    let power = 1.0;
    
    // Base power from spellcasting level
    const spellcastingLevel = caster.spellcasting?.spellcastingLevel || 1;
    power += (spellcastingLevel - 1) * 0.1; // 10% per level above 1
    
    // School affinity bonus
    const schoolAffinity = caster.spellcasting?.schoolAffinities?.[spell.school] || 0;
    power += schoolAffinity / 200; // Up to 50% bonus at 100 affinity
    
    // Equipment bonuses
    const equipment = [caster.equipment.weapon, caster.equipment.armor].filter(Boolean);
    equipment.forEach(itemId => {
        const item = caster.inventory?.find(i => i.id === itemId);
        if (item?.magicalProperties?.spellPowerBonus) {
            power += item.magicalProperties.spellPowerBonus;
        }
    });
    
    // Casting modifiers
    if (caster.spellcasting?.castingModifiers?.powerBonus) {
        power += caster.spellcasting.castingModifiers.powerBonus;
    }
    
    return Math.max(0.5, Math.min(3.0, power)); // Cap between 50% and 300%
}

/**
 * Create a status effect from a spell
 * @param {string} effectName - Name of the effect
 * @param {Spell} spell - The spell creating the effect
 * @param {Player} caster - The caster
 * @returns {StatusEffect|null} Created status effect
 */
function createStatusEffectFromSpell(effectName, spell, caster) {
    const duration = getDurationInTurns(spell.duration);
    const spellPower = calculateSpellPower(spell, caster);
    
    // Map spell effect names to status effect types
    const effectMap = {
        'burning': { type: 'burning', damage: Math.round(spell.level * 2 * spellPower) },
        'frozen': { type: 'frozen', duration: Math.max(1, Math.round(duration * 0.5)) },
        'shocked': { type: 'shocked', damage: Math.round(spell.level * 1.5 * spellPower) },
        'poisoned': { type: 'poisoned', damage: Math.round(spell.level * 1.5 * spellPower) },
        'blessed': { type: 'blessed', healingBonus: Math.round(spell.level * 3 * spellPower) },
        'cursed': { type: 'cursed', damageReduction: Math.round(spell.level * 2 * spellPower) },
        'stunned': { type: 'stunned', duration: Math.max(1, Math.round(duration * 0.3)) },
        'charmed': { type: 'charmed', duration: Math.max(1, Math.round(duration * 0.4)) },
        'frightened': { type: 'frightened', accuracyPenalty: Math.round(spell.level * 5) },
        'protected': { type: 'protected', damageReduction: Math.round(spell.level * 3 * spellPower) }
    };
    
    const effectData = effectMap[effectName.toLowerCase()];
    if (!effectData) return null;
    
    return {
        id: `spell_effect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: effectName.charAt(0).toUpperCase() + effectName.slice(1),
        type: effectData.type,
        duration: effectData.duration || duration,
        source: `${spell.name} (${caster.name})`,
        ...effectData
    };
}

/**
 * Convert spell duration to turns
 * @param {string} duration - Spell duration
 * @returns {number} Duration in turns
 */
function getDurationInTurns(duration) {
    switch (duration) {
        case 'instant': return 0;
        case 'short': return 3;
        case 'medium': return 6;
        case 'long': return 10;
        case 'permanent': return 999;
        default: return 3;
    }
}

/**
 * Show casting visual effect
 * @param {Player} caster - The caster
 * @param {Spell} spell - The spell
 */
function showCastingEffect(caster, spell) {
    const school = Spells.MAGIC_SCHOOLS[spell.school];
    const message = `${caster.name} casts ${spell.name}! ${school.icon}`;
    UI.showPopup(message, 'skill', 2000);
}

/**
 * Show spell results
 * @param {Spell} spell - The spell
 * @param {Player} caster - The caster
 * @param {object[]} targets - The targets
 * @param {object[]} results - The results
 */
function showSpellResults(spell, caster, targets, results) {
    results.forEach((result, index) => {
        const target = targets[index];
        
        result.effects.forEach(effect => {
            let message = '';
            let type = 'info';
            
            switch (effect.type) {
                case 'damage':
                    message = `${target.name} takes ${effect.value} magical damage!`;
                    type = 'damage';
                    break;
                case 'healing':
                    message = `${target.name} recovers ${effect.value} HP!`;
                    type = 'healing';
                    break;
                case 'status':
                    message = `${target.name} is affected by ${effect.value}!`;
                    type = 'risky';
                    break;
                case 'modifier':
                    message = `${target.name}'s ${effect.stat} ${effect.value > 0 ? 'increased' : 'decreased'} by ${Math.abs(effect.value)}!`;
                    type = effect.value > 0 ? 'success' : 'warning';
                    break;
                case 'environmental':
                    message = effect.description;
                    type = 'info';
                    break;
            }
            
            if (message) {
                UI.showPopup(message, type, 1500);
            }
        });
    });
}

/**
 * Increase school affinity based on spell usage
 * @param {Player} caster - The caster
 * @param {string} school - The magic school
 */
function increaseSchoolAffinity(caster, school) {
    if (!caster.spellcasting?.schoolAffinities) return;
    
    const currentAffinity = caster.spellcasting.schoolAffinities[school] || 0;
    const increase = Math.max(1, Math.floor(5 - (currentAffinity / 20))); // Diminishing returns
    
    caster.spellcasting.schoolAffinities[school] = Math.min(100, currentAffinity + increase);
    
    const log = window.displayVisualError || console.log;
    log(`${caster.name}'s ${school} affinity increased by ${increase} to ${caster.spellcasting.schoolAffinities[school]}`);
}

/**
 * Check for spell learning opportunities
 * @param {Player} caster - The caster
 * @param {Spell} spell - The spell that was cast
 */
async function checkSpellLearning(caster, spell) {
    // Chance to learn a related spell based on school affinity
    const schoolAffinity = caster.spellcasting?.schoolAffinities?.[spell.school] || 0;
    const learningChance = Math.min(0.1, schoolAffinity / 1000); // Max 10% chance
    
    if (Math.random() < learningChance) {
        const log = window.displayVisualError || console.log;
        log(`${caster.name} has a chance to learn a new ${spell.school} spell!`);
        
        try {
            // Generate a new spell in the same school but different type
            const availableTypes = Object.keys(Spells.SPELL_TYPES).filter(t => t !== spell.type);
            const newType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
            const newLevel = Math.min(spell.level + 1, caster.spellcasting.maxSpellLevel);
            
            const context = {
                situation: 'spell_learning',
                playerId: caster.id,
                playerNeeds: ['spell_progression'],
                learnedFrom: spell.id,
                storyContext: `learned from casting ${spell.name}`
            };
            
            const newSpell = await Spells.generateDynamicSpell(spell.school, newType, newLevel, context);
            
            if (newSpell) {
                // Add to known spells
                caster.spellcasting.knownSpells.push(newSpell);
                
                // Add to prepared spells if there's room
                if (caster.spellcasting.preparedSpells.length < 10) {
                    caster.spellcasting.preparedSpells.push(newSpell);
                }
                log(`${caster.name} learned new ${spell.school} spell: ${newSpell.name}!`);
                UI.showPopup(`${caster.name} learned: ${newSpell.name}!`, 'success', 4000);
                
                // Update UI to show new spell
                UI.updateGameUI();
            }
        } catch (error) {
            log(`Spell learning failed: ${error.message}`);
        }
    }
}

export default {
    castSpell,
    calculateActualMpCost,
    calculateSpellPower
};
