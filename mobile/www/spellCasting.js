// spellCasting.js
// Spell Casting Mechanics and Execution System
// Phase 3: Magic System Implementation

import { gameState } from './state.js';
import * as Spells from './spells.js';
import * as UI from './ui.js';
import * as Combat from './combat.js';
// BUG: previously imported './statusEffects.js' which doesn't exist —
// crashed the entire app at module-load time ("Could not load essential
// game modules"). The actual implementation lives in combat.js as
// applyStatusEffect(); we alias it here so existing call sites work.
const StatusEffects = { applyStatusEffect: (target, effect) => {
    const name = effect?.name || effect;
    // 'instant' spells convert to 0 turns: use the effect's own catalog length.
    const turns = Number(effect?.duration) > 0 ? Number(effect.duration) : (Combat.lookupStatusEffect(name)?.defaultDuration || 2);
    return Combat.applyStatusEffect(target, name, turns, effect?.effectTickData || {}, 'spell');
} };
import { isAreaSpell } from './battle.js';
import * as Progression from './progression.js';

/**
 * Cast a spell with full mechanics and effects
 * @param {Player} caster - The player casting the spell
 * @param {Spell} spell - The spell being cast
 * @param {object} [target] - Optional specific target
 * @returns {Promise<object>} Casting result
 */

// ---------------------------------------------------------------- every special does something real
// Phone 10-10 kit audit: storyteller-made specials had all-zero effects, status
// names the game doesn't know ("Thermal Burn", "System Cleansed"), stat keys in
// capitals ("DEF"), and debuffs that landed on the hero. normalizeSpell maps
// them onto real mechanics once (in place), and gives an effect-less special a
// fitting one from its own words. Harmful effects go to the foe, helpful ones
// to the caster's side (determineSpellTargets).
const STATUS_WORDS = [
    ['Burn', /burn|thermal|fire|flame|scorch|ignite|melt(?!.*armou?r)/i], ['Frost', /frost|freez|ice|chill|cryo/i],
    ['Poison', /poison|toxin|venom|acid/i], ['Bleed', /bleed|lacerat/i],
    ['Stun', /stun|glitch|disrupt|jam|overload|emp|daze|shock/i], ['Paralysis', /paraly/i], ['Sleep', /sleep|drows/i],
    ['Blind', /blind|dazzl|flash|smoke/i], ['Confusion', /confus|scramble|spoof/i], ['Silence', /silence|mute/i],
    ['Vulnerability', /vulnerab|armou?r.?(melt|break|crack|shred)|expos|weak.?spot|breach|scan|analy|insight|target/i],
    ['Weakness', /weak|drain|sap|enfeebl/i], ['Slow', /slow|sluggish|hobble/i], ['Fear', /fear|terror|dread|panic/i],
    ['Haste', /haste|speed|quick|overdrive|accelerat|reflex/i], ['Berserk', /berserk|rage|fury|empower|overclock/i],
    ['Shield', /shield|ward|protect|barrier|armou?r|stabiliz|fortif|aegis|deflect|guard/i],
    ['Regen', /regen|cleans|repair|restor|renew|purif|heal|mend|recover/i]
];
const HARMFUL = new Set(['Burn', 'Frost', 'Poison', 'Bleed', 'Stun', 'Paralysis', 'Sleep', 'Blind', 'Confusion', 'Silence', 'Vulnerability', 'Weakness', 'Slow', 'Fear']);
const toStatus = (name) => Combat.lookupStatusEffect(String(name || ''))?.name || (STATUS_WORDS.find(([, re]) => re.test(String(name || ''))) || [])[0] || null;

export function normalizeSpell(spell) {
    if (!spell || spell._normal) return spell;
    const fx = spell.effects = spell.effects || {};
    // Stat changes: atk/def in any spelling.
    const mods = {};
    for (const [k, v] of Object.entries(fx.modifiers || {})) {
        const key = /^(atk|attack|str|power)/i.test(k) ? 'atk' : /^(def|defen|armou?r)/i.test(k) ? 'def' : null;
        if (key && Number(v)) mods[key] = (mods[key] || 0) + Number(v);
    }
    fx.modifiers = mods;
    // Statuses the game knows (deduped).
    fx.statusEffects = [...new Set([].concat(fx.statusEffects || []).map(s => toStatus(typeof s === 'string' ? s : s?.name)).filter(Boolean))];
    const words = `${spell.name || ''} ${spell.description || ''}`;
    const nothing = !(Number(fx.damage) > 0) && !(Number(fx.healing) > 0) && !fx.statusEffects.length && !Object.keys(mods).length;
    if (nothing) {
        // An effect from its own words; scans, hacks and appraisals expose a weak spot.
        if (/heal|mend|restor|repair|cure|recover/i.test(words)) { fx.healing = 20; spell.fightNote = 'heals you'; }
        else if (/ward|shield|protect|barrier|aegis|deflect|guard|faraday/i.test(words)) { fx.statusEffects = ['Shield']; spell.fightNote = 'shields you'; }
        else if (/strike|blast|bolt|burn|fire|shock|lance|slash|smash|beam|explo|attack|damage|pulse|surge/i.test(words)) { fx.damage = 12; spell.fightNote = 'hits one foe'; }
        else { const st = toStatus(words); fx.statusEffects = [st && HARMFUL.has(st) ? st : 'Vulnerability']; spell.fightNote = `leaves the foe ${fx.statusEffects[0] === 'Vulnerability' ? 'exposed' : fx.statusEffects[0].toLowerCase()}`; }
    }
    spell._normal = true;
    return spell;
}

/** Does this special hurt foes (damage, a harmful status, or a stat drain)? */
export function isHarmfulSpell(spell) {
    const fx = spell?.effects || {};
    return Number(fx.damage) > 0 || Object.values(fx.modifiers || {}).some(v => Number(v) < 0) || (fx.statusEffects || []).some(s => HARMFUL.has(toStatus(s)));
}

/** What a special really does now, in a few words ("≈96 damage · Stun", "heals ≈119", "ATK +3 for you"). */
export function abilitySummary(spell, caster) {
    normalizeSpell(spell);
    const fx = spell.effects || {};
    const power = (() => { try { return calculateSpellPower(spell, caster); } catch (_) { return 1; } })();
    const bits = [];
    if (Number(fx.damage) > 0) bits.push(`≈${Math.round(fx.damage * power)} damage${isAreaSpell(spell) ? ' to every foe' : ''}`);
    if (Number(fx.healing) > 0) bits.push(`heals ≈${Math.round(fx.healing * power * Progression.kindHealing(caster) / Progression.cleverPower(caster))}${isAreaSpell(spell) ? ' each' : ''}`);
    for (const s of fx.statusEffects || []) bits.push(HARMFUL.has(s) ? `${s} on the foe` : `${s} for you`);
    for (const [k, v] of Object.entries(fx.modifiers || {})) bits.push(`${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}${v > 0 ? ' for you' : ' on the foe'}`);
    return bits.join(' · ') || 'no effect in a fight';
}

export async function castSpell(caster, spell, target = null) {
    const log = window.displayVisualError || console.log;
    log(`Casting spell: ${spell.name} by ${caster.name}`);
    
    try {
        normalizeSpell(spell); // real mechanics for storyteller-made specials
        // Validate casting ability
        const canCast = Spells.canCastSpell(caster, spell);
        if (!canCast.success) {
            UI.showPopup(`Cannot cast ${spell.name}: ${canCast.reason}`, 'error');
            return { success: false, reason: canCast.reason };
        }
        
        // Show casting animation/effect
        showCastingEffect(caster, spell);
        
        // Determine targets (before paying: a fizzle costs no MP)
        const targets = determineSpellTargets(spell, caster, target);
        if (!targets || targets.length === 0) {
            UI.showPopup(`No valid targets for ${spell.name}!`, 'warning');
            return { success: false, reason: 'No valid targets' };
        }

        // Consume MP
        const mpCost = calculateActualMpCost(caster, spell);
        caster.mp -= mpCost;
        log(`${caster.name} spent ${mpCost} MP casting ${spell.name}`);
        
        // Apply spell effects
        const results = await applySpellEffects(spell, caster, targets);
        const ranked = Progression.useAbility(spell);
        if (ranked) UI.showPopup(`✨ ${caster.name}'s ${spell.name} reached rank ${Progression.ROMAN[ranked]}!`, 'legendary', 3500);
        
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
    let cost = Progression.abilityMpCost(spell); // cheaper at mastery ranks III and V
    
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
    // Helpful specials land on the caster's side and harmful ones on a foe,
    // whatever was aimed at (phone 10-10: a boost buffed the boss; "blind and
    // stun the foe" blinded the hero).
    if (!isAreaSpell(spell)) {
        const foes = (gameState.enemies || []).filter(e => e && !e.isDefeated && e.hp > 0);
        if (isHarmfulSpell(spell) && foes.length) return [foes.includes(specificTarget) ? specificTarget : foes[0]]; // (a heal in it goes to the caster)
        if (!isHarmfulSpell(spell)) return [specificTarget && (gameState.players || []).includes(specificTarget) ? specificTarget : caster];
    }
    if (isAreaSpell(spell)) {
        // Damage or afflictions go to every foe; heals and buffs to the party.
        // (an empty modifiers {} counted as "has stat changes": Data-Scrape blinded the party)
        const foes = (gameState.enemies || []).filter(e => e && !e.isDefeated && e.hp > 0);
        return isHarmfulSpell(spell) && foes.length ? foes : gameState.players.filter(p => p && !p.isDowned);
    }
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

    // Pure healing spells land on heroes whatever their targeting says
    // (AI-made heals come tagged 'single', which meant enemy-only).
    if (spell.effects?.healing > 0 && !(spell.effects?.damage > 0)) {
        return !!target.id && target.id.startsWith('player') && !target.isDowned;
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
        // A special that both hurts and heals drains: the foe takes the hit, the caster gets the heal.
        const healed = (gameState.enemies || []).includes(target) ? caster : target;
        const healing = Math.round(spell.effects.healing * spellPower * Progression.kindHealing(caster) / Progression.cleverPower(caster)); // heals scale with Kind, not Clever
        const actualHealing = Math.min(healing, healed.maxHp - healed.hp);
        healed.hp = Math.min(healed.maxHp, healed.hp + healing);
        result.effects.push({ type: 'healing', value: actualHealing });
        log(`${spell.name} heals ${actualHealing} HP to ${healed.name}`);
    }
    
    // Apply status effects
    if (spell.effects.statusEffects?.length > 0) {
        for (const effectName of spell.effects.statusEffects) {
            const statusEffect = createStatusEffectFromSpell(effectName, spell, caster);
            if (statusEffect) {
                // Keep the catalog name: a theme rename ("overheating") matched
                // no catalog entry, so the effect did nothing.
                StatusEffects.applyStatusEffect(target, statusEffect);
                result.effects.push({ type: 'status', value: effectName });
                log(`${spell.name} applies ${effectName} to ${target.name}`);
            }
        }
    }
    
    // Apply stat modifiers
    if (spell.effects.modifiers) {
        // As a 3-turn effect (atkMod/defMod): a raw stat edit was wiped at the
        // next recalculation on heroes and never wore off on foes.
        // A boost always helps the caster's side and a drain always hits the foe,
        // whatever the spell's targeting (phone 10-10: "Resonance Pulse" gave the
        // boss +97 ATK). Sizes grow a little with power (at most 1.5x; the 8x
        // special multiplier is for damage and healing: it made +200 DEF) and
        // never exceed half the stat they change.
        const foe = (gameState.enemies || []).includes(target);
        const data = {};
        Object.entries(spell.effects.modifiers).forEach(([stat, value]) => {
            if (stat !== 'atk' && stat !== 'def') return;
            const v = Number(value) || 0;
            if (!v || (v > 0) === foe) return; // a boost on a foe or a drain on a friend: skip
            const cap = Math.max(3, Math.round(0.5 * (Number(target[stat]) || 10)));
            const modifier = Math.sign(v) * Math.min(cap, Math.round(Math.abs(v) * Math.min(1.5, spellPower)));
            data[`${stat}Mod`] = modifier;
            result.effects.push({ type: 'modifier', stat, value: modifier });
        });
        if (Object.keys(data).length) {
            Combat.applyStatusEffect(target, `${spell.name}`, 3, data, 'spell');
            log(`${spell.name} modifies ${target.name}: ${JSON.stringify(data)} for 3 turns`);
        }
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
    
    power *= Progression.cleverPower(caster); // Clever: +10% per point
    power *= Progression.abilityPower(caster, spell); // grows with level and mastery rank (10-09)
    return Math.max(0.5, Math.min(8.0, power));
}

/**
 * Create a status effect from a spell
 * @param {string} effectName - Name of the effect
 * @param {Spell} spell - The spell creating the effect
 * @param {Player} caster - The caster
 * @returns {StatusEffect|null} Created status effect
 */
function createStatusEffectFromSpell(effectName, spell, caster) {
    // Resolve through the status catalog ("Burn", "burning", "Poisoned" all
    // work; the old table only knew a few -ing words, so "Burn" did nothing).
    // The catalog supplies the mechanics; unknown names are skipped.
    const entry = Combat.lookupStatusEffect(String(effectName || ''));
    if (!entry) return null;
    const turns = getDurationInTurns(spell.duration);
    return {
        name: entry.name,
        // At least 2: a 1-turn status ran out before the foe's turn ("instant"
        // stun specials never stunned anything, kit audit 10-10).
        duration: Math.max(2, turns > 0 ? Math.min(turns, 10) : (entry.defaultDuration || 2)),
        effectTickData: {},
        source: `${spell.name} (${caster.name})`
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
    // Generated spells name schools freely ("Divination"): unknown -> sparkle, not a crash.
    const school = Spells.MAGIC_SCHOOLS[String(spell.school || '').toUpperCase()] || { icon: '✨' };
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
            
            if (newSpell && !caster.spellcasting.knownSpells.some(x => String(x?.name).toLowerCase() === String(newSpell.name).toLowerCase())) { // never the same spell twice
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
