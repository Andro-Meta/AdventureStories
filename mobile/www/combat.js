// combat.js
// Handles combat calculations, enemy generation, status effects, and combat state checks.

// --- Module Imports ---
import { gameState, determineContext, getCurrentPlayer } from './state.js'; // Needs gameState to access players/enemies
import * as Config from './config.js'; // Needs config values
import * as Progression from './progression.js';
// Import specific functions from utils needed here
import { getRandomInt, getRandomElement, clamp, generateId } from './utils.js';
// Import item functions needed for enemy loot generation
import { generateLootDrop } from './items.js';
import * as AdaptiveAbilities from './adaptiveAbilities.js';
// Import UI function for popups and potentially updating UI after combat actions
import { showPopup, renderPlayerCards, renderEnemyCards, updateContextHeaders, renderInventory } from './ui.js'; // Added renderInventory

// --- Enemy Generation & Scaling ---

/**
 * Finds a character (player or enemy) by their ID
 * @param {string} id - The ID to search for
 * @returns {Character|null} The found character or null
 */
export function findCharacterById(id) {
    if (!id) return null;
    
    // Check players first
    if (id.startsWith('player')) {
        return gameState.players?.find(p => p?.id === id) || null;
    }
    
    // Then check enemies
    if (id.startsWith('enemy')) {
        return gameState.enemies?.find(e => e?.id === id) || null;
    }
    
    return null;
}


// --- Combat Calculations ---

/**
 * Initializes combat with given enemies, setting up turn order and formations
 * @param {Enemy[]} enemies - Array of enemies to start combat with
 */
export function initializeCombat(enemies) {
    const log = window.displayVisualError || console.log;
    log('Initializing enhanced combat system...');
    
    if (!enemies || !Array.isArray(enemies) || enemies.length === 0) {
        log('ERROR: Invalid enemies array provided to initializeCombat');
        return null;
    }

    // Set combat flags
    gameState.inCombat = true;
    
    // Reset combat state
    gameState.combat = {
        isActive: true,
        round: 1,
        initiative: [],
        currentTurnIndex: 0,
        lastAction: null,
        comboCount: 0,
        activeEffects: [],
        formation: {
            frontLine: [],
            backLine: []
        }
    };

    // Initialize combat stats if not present in gameState
    if (!gameState.combatStats) {
        gameState.combatStats = {
            criticalHitChance: 0.1,
            criticalHitMultiplier: 1.5,
            comboMultiplier: 0.2,
            maxCombo: 3,
            statusResistances: {},
            immunities: []
        };
    }

    // Set up enemy formations
    const totalEnemies = enemies.length;
    enemies.forEach((enemy, index) => {
        if (!enemy.id) {
            enemy.id = generateId('enemy');
            log(`Generated ID for enemy: ${enemy.id}`);
        }
        
        // Simple formation logic: First half in front, rest in back
        if (index < Math.ceil(totalEnemies / 2)) {
            gameState.combat.formation.frontLine.push(enemy.id);
        } else {
            gameState.combat.formation.backLine.push(enemy.id);
        }
        
        // Initialize enemy combat stats
        enemy.speed = enemy.speed || Math.floor((enemy.atk + enemy.def) / 2);
        enemy.criticalHitChance = enemy.criticalHitChance || gameState.combatStats.criticalHitChance;
        enemy.criticalHitMultiplier = enemy.criticalHitMultiplier || gameState.combatStats.criticalHitMultiplier;
        enemy.statusEffects = enemy.statusEffects || [];
    });

    // Power Strike's "every other round" is per fight (rounds restart at 1).
    (gameState.players || []).forEach(p => { if (p) delete p.lastPowerStrikeRound; });

    // Get all valid combatants
    // Downed heroes are in the order too (their turns are skipped while down),
    // so one revived mid-fight gets turns again.
    const allCombatants = [
        ...gameState.players.filter(Boolean),
        ...enemies
    ];

    // Initialize player combat stats
    allCombatants.forEach(char => {
        if (char.id.startsWith('player')) {
            char.speed = char.speed || Math.floor((char.atk + char.def) / 2);
            char.criticalHitChance = char.criticalHitChance || gameState.combatStats.criticalHitChance;
            char.criticalHitMultiplier = char.criticalHitMultiplier || gameState.combatStats.criticalHitMultiplier;
            char.statusEffects = char.statusEffects || [];
        }
    });

    // Sort by speed/initiative
    gameState.combat.initiative = allCombatants
        .sort((a, b) => (b.speed || 0) - (a.speed || 0))
        .map(char => char.id);

    // First turn = the hero at the controls. Starting on a faster foe let the
    // hero act anyway and the advance then skipped that foe's round-1 reply.
    // ponytail: heroes always open; a foe ambush would need an enemy phase here.
    const me = gameState.players?.[gameState.currentPlayerIndex];
    gameState.combat.currentTurnIndex = Math.max(0, gameState.combat.initiative.indexOf(me?.id));
    
    // Process any start-of-combat effects
    allCombatants.forEach(char => {
        if (char.statusEffects?.length > 0) {
            char.statusEffects = char.statusEffects.filter(effect => {
                if (effect?.onCombatStart) {
                    try {
                        effect.onCombatStart(char);
                    } catch (e) {
                        log(`Error processing combat start effect for ${char.name}:`, e);
                    }
                }
                return true;
            });
        }
    });

    log(`Combat initialized with ${enemies.length} enemies. Initiative order: ${gameState.combat.initiative.join(', ')}`);
    
    // Return first actor's ID
    const firstActorId = gameState.combat.initiative[0];
    const firstActor = findCharacterById(firstActorId);
    log(`First actor will be: ${firstActor?.name || 'Unknown'} (${firstActorId})`);
    
    return firstActorId;
}

/**
 * Advances to the next turn in combat
 * @returns {Promise<string|null>} ID of character whose turn is next, or null if combat ends
 */
export async function advanceCombatTurn() {
    const log = window.displayVisualError || console.log;
    
    if (!gameState.inCombat || !gameState.combat?.isActive) {
        log('ERROR: Attempted to advance turn while not in active combat');
        return null;
    }
    
    // Reset combo if it was the player's turn
    const currentTurnChar = findCharacterById(gameState.combat.initiative[gameState.combat.currentTurnIndex]);
    if (currentTurnChar?.id.startsWith('player')) {
        gameState.combat.comboCount = 0;
        gameState.combat.lastAction = null;
    }

    // Process end-of-turn effects for current character if they exist
    // (not for a downed hero or fallen foe whose turn is only being skipped)
    // A hero's turn ticking here is remembered, so the post-fight advanceTurn
    // doesn't tick the same round again.
    if (String(currentTurnChar?.id || '').startsWith('player')) gameState.combat.heroTicked = true;
    if (currentTurnChar?.statusEffects?.length > 0 && !currentTurnChar.isDowned && !currentTurnChar.isDefeated) {
        try {
            await processStatusEffectTicks(currentTurnChar);
        } catch (e) {
            log(`Error processing end-of-turn effects for ${currentTurnChar.name}:`, e);
        }
    }

    // Advance turn index
    gameState.combat.currentTurnIndex++;
    
    // If we've gone through all characters, start new round
    if (gameState.combat.currentTurnIndex >= gameState.combat.initiative.length) {
        gameState.combat.currentTurnIndex = 0;
        gameState.combat.round++;
        
        try {
            processRoundEffects();
        } catch (e) {
            log(`Error processing round effects:`, e);
        }
    }

    // Check for combat end conditions
    if (areAllEnemiesDefeated()) {
        log('All enemies defeated, ending combat');
        gameState.inCombat = false;
        gameState.combat.isActive = false;
        return null;
    }

    if (isPartyWiped()) {
        log('Party wiped, ending combat');
        gameState.inCombat = false;
        gameState.combat.isActive = false;
        return null;
    }

    // Get next character
    const nextCharId = gameState.combat.initiative[gameState.combat.currentTurnIndex];
    const nextChar = findCharacterById(nextCharId);

    // Skip turn if character is defeated/downed
    if ((nextChar?.isDowned && nextChar?.id.startsWith('player')) || 
        (nextChar?.isDefeated && nextChar?.id.startsWith('enemy'))) {
        log(`${nextChar.name} is unable to act, skipping turn`);
        return advanceCombatTurn(); // Recursively find next valid turn
    }

    // If we somehow got an invalid character, try to find the next valid one
    if (!nextChar) {
        log('WARNING: Invalid character in initiative order, attempting to find next valid turn');
        return advanceCombatTurn();
    }

    log(`Combat turn advanced to ${nextChar.name} (Round ${gameState.combat.round})`);
    
    // Update UI elements
    try {
        renderPlayerCards();
        renderEnemyCards();
        updateContextHeaders();
    } catch (e) {
        log('Error updating UI after turn advance:', e);
    }

    // If it's an enemy's turn, handle it automatically
    if (nextChar.id.startsWith('enemy')) {
        await handleEnemyTurn(nextChar.id);
        return null; // Enemy turn is handled automatically
    }

    // Hand control to that hero. Only the popup changed before, so the
    // fight starter acted for everyone, and if they were downed every click
    // said "Cannot act now" (multiplayer softlock).
    const heroIndex = gameState.players.findIndex(p => p && p.id === nextCharId);
    if (heroIndex >= 0) gameState.currentPlayerIndex = heroIndex;
    showPopup(`${nextChar.name}'s turn!`, 'info');

    return nextCharId;
}

/**
 * Processes effects that trigger at the start of each round
 */
function processRoundEffects() {
    const log = window.displayVisualError || console.log;
    log(`Processing effects for round ${gameState.combat.round}`);

    // Process active effects
    gameState.combat.activeEffects = gameState.combat.activeEffects.filter(effect => {
        effect.duration--;
        if (effect.duration <= 0) {
            log(`Effect ${effect.name} has expired`);
            return false;
        }
        // Process effect's per-round triggers
        if (effect.onRound) {
            effect.onRound();
        }
        return true;
    });

    // BUG-02 fix: previously this loop ALSO decremented per-character
    // statusEffects duration. But processStatusEffectTicks (called from
    // advanceCombatTurn AND advanceTurn) already decrements those same
    // durations — so a Poison{duration:4} expired in 2 rounds instead of 4.
    // Now this function ONLY handles round-scoped global effects in
    // gameState.combat.activeEffects (the strip up top); per-character
    // status durations are owned exclusively by processStatusEffectTicks.
    // Per-round triggers (e.g. status.onRound) still fire here without
    // touching duration.
    const allCombatants = [
        ...gameState.players.filter(p => !p.isDowned),
        ...gameState.enemies.filter(e => !e.isDefeated)
    ];

    // MP trickles back each round (turnManager's regen only runs out of combat).
    for (const p of gameState.players) {
        if (p && !p.isDowned && (p.mp ?? 0) < (p.maxMp ?? 0)) p.mp = Math.min(p.maxMp, (p.mp || 0) + Config.RESOURCE_REGEN_COMBAT);
    }

    allCombatants.forEach(char => {
        if (char.statusEffects) {
            char.statusEffects.forEach(status => {
                if (status.onRound && status.duration > 0) {
                    try { status.onRound(char); } catch (e) { log(`onRound err: ${e?.message}`); }
                }
            });
        }
    });
}

/**
 * Calculates damage with enhanced combat mechanics
 * @param {Character} attacker - The attacking character
 * @param {Character} defender - The defending character
 * @param {Object} options - Additional options for damage calculation
 * @returns {Object} Damage calculation results
 */
export function calculateDamage(attacker, defender, options = {}) {
    const log = window.displayVisualError || console.log;
    
    // Check if attacker is disabled (Stun, Paralysis, Sleep)
    const disablingEffects = ['Stun', 'Paralysis', 'Sleep'];
    const isDisabled = attacker.statusEffects?.some(effect => 
        disablingEffects.includes(effect.name) && effect.effectTickData?.cannotAct
    );
    
    if (isDisabled) {
        return {
            damage: 0,
            isCritical: false,
            missed: false,
            blocked: true,
            element: options.element || 'Physical',
            statusEffectsApplied: [],
            message: `${attacker.name} cannot act due to status effects!`
        };
    }

    // Accuracy check (base 90%, modified by Blind and other effects)
    let accuracy = 0.9; // Base 90% accuracy
    
    // Apply Blind effect
    const blindEffect = attacker.statusEffects?.find(effect => effect.name === 'Blind');
    if (blindEffect && blindEffect.effectTickData?.accuracyMod) {
        accuracy += blindEffect.effectTickData.accuracyMod; // -0.5 for Blind
    }
    
    // High DEF vs ATK can reduce accuracy
    // capped at 10% (it was unbounded: DEF 30 vs ATK 5 hit 40% of the time) and safe at ATK 0
    const defenseAdvantage = Math.min(1, Math.max(0, (defender.def || 0) - (attacker.atk || 0)) / Math.max(1, attacker.atk || 0));
    accuracy -= defenseAdvantage * 0.1; // Up to 10% accuracy reduction
    if (String(defender?.id || '').startsWith('player')) accuracy -= Progression.sneakyDodge(defender); // Sneaky heroes dodge
    
    // Accuracy check
    const accuracyRoll = Math.random();
    const missed = accuracyRoll > accuracy;
    
    if (missed) {
        return {
            damage: 0,
            isCritical: false,
            missed: true,
            blocked: false,
            element: options.element || 'Physical',
            statusEffectsApplied: [],
            message: `${attacker.name}'s attack missed ${defender.name}!`
        };
    }

    // Base damage calculation
    // Enemies' flat ATK/DEF mods (e.g. Shadow Weakness DEF -2) apply here;
    // players' are already in their atk/def.
    const flat = (c, k) => c.id?.startsWith('player') ? 0 : (c.statusEffects || []).reduce((n, e) => n + (Number(e?.effectTickData?.[k]) || 0), 0);
    let damage = Math.max(1, (attacker.atk + flat(attacker, 'atkMod')) - Math.max(0, defender.def + flat(defender, 'defMod')) / 2);
    
    // Attacker ATK multipliers (Berserk, Weakness): a player's atk already
    // has them baked in by recalculateCharacterStats, so only enemies get
    // them here (before, Weakness hit players twice: x0.25).
    if (attacker.statusEffects && !attacker.id?.startsWith('player')) {
        attacker.statusEffects.forEach(effect => {
            if (effect.effectTickData) {
                // Apply ATK multipliers (Berserk, Weakness, etc.)
                if (effect.effectTickData.atkMultiplier) {
                    damage *= effect.effectTickData.atkMultiplier;
                    log(`${effect.name} modified damage: x${effect.effectTickData.atkMultiplier}`);
                }
            }
        });
    }

    // Apply defender status effect modifiers
    let damageMultiplier = 1.0;
    if (defender.statusEffects) {
        defender.statusEffects.forEach(effect => {
            if (effect.effectTickData) {
                // Apply damage multipliers (Vulnerability, Shield, etc.)
                if (effect.effectTickData.damageMultiplier) {
                    damageMultiplier *= effect.effectTickData.damageMultiplier;
                    log(`${effect.name} modified incoming damage: x${effect.effectTickData.damageMultiplier}`);
                }
            }
        });
    }
    
    damage *= damageMultiplier;

    // Elemental damage and resistance system
    const element = options.element || 'Physical';
    if (defender.resistances && defender.resistances[element]) {
        const resistance = defender.resistances[element];
        if (resistance === 'immune') {
            return {
                damage: 0,
                isCritical: false,
                missed: false,
                blocked: true,
                element: element,
                statusEffectsApplied: [],
                message: `${defender.name} is immune to ${element} damage!`
            };
        } else if (typeof resistance === 'number') {
            damage *= (1 - resistance); // 0.5 = 50% resistance
            log(`${element} resistance applied: ${resistance * 100}% reduction`);
        }
    }

    // Critical hit check (criticals bypass some DEF)
    const criticalHitRoll = Math.random();
    const isCritical = criticalHitRoll < (attacker.criticalHitChance || gameState.combatStats.criticalHitChance);
    
    if (isCritical) {
        damage *= (attacker.criticalHitMultiplier || gameState.combatStats.criticalHitMultiplier);
        // Criticals bypass 25% of defense
        damage += (defender.def * 0.25);
        log(`Critical hit! Damage multiplied and defense bypassed`);
    }

    // Combo system
    if (options.isCombo && gameState.combat.comboCount < gameState.combatStats.maxCombo) {
        const comboMultiplier = 1 + (gameState.combat.comboCount * gameState.combatStats.comboMultiplier);
        damage *= comboMultiplier;
        gameState.combat.comboCount++;
        log(`Combo x${gameState.combat.comboCount}! Damage increased`);
    }

    // Round the final damage
    damage = Math.round(Math.max(1, damage));
    
    // Determine status effects to apply based on element and attack type
    const statusEffectsApplied = [];
    if (options.applyStatusEffects) {
        options.applyStatusEffects.forEach(effectName => {
            statusEffectsApplied.push(effectName);
        });
    }

    // Break Sleep effect if defender takes damage
    if (damage > 0) {
        const sleepEffect = defender.statusEffects?.find(effect => 
            effect.name === 'Sleep' && effect.effectTickData?.breaksOnDamage
        );
        if (sleepEffect) {
            sleepEffect.duration = 0;
            log(`${defender.name}'s Sleep was broken by damage!`);
        }
    }
    
    return {
        damage,
        isCritical,
        missed: false,
        blocked: false,
        element: element,
        statusEffectsApplied,
        comboCount: gameState.combat.comboCount,
        message: null
    };
}

// --- Status Effects ---

/**
 * Applies a status effect using predefined configurations from Config.STATUS_EFFECTS
 * @param {Player | Enemy} target - The character to apply the effect to
 * @param {string} effectKey - Key from Config.STATUS_EFFECTS (e.g., 'BURN', 'POISON')
 * @param {number} [durationOverride] - Optional duration override
 * @param {object} [dataOverride] - Optional effect data override
 * @param {string} [source] - Source of the effect
 */
export function applyConfiguredStatusEffect(target, effectKey, durationOverride = null, dataOverride = {}, source = 'Unknown') {
    const log = window.displayVisualError || console.log;
    
    if (!Config.STATUS_EFFECTS[effectKey]) {
        log(`Warning: Unknown status effect key: ${effectKey}`);
        return;
    }
    
    const effectConfig = Config.STATUS_EFFECTS[effectKey];
    const duration = durationOverride || effectConfig.defaultDuration;
    const effectData = { ...effectConfig.defaultData, ...dataOverride };
    
    log(`Applying configured status effect: ${effectConfig.name} to ${target.name}`);
    applyStatusEffect(target, effectConfig.name, duration, effectData, source);
}

/**
 * Checks if a character can act (not disabled by status effects)
 * @param {Player | Enemy} character - The character to check
 * @returns {boolean} True if character can act, false if disabled
 */
export function canCharacterAct(character) {
    if (!character || !character.statusEffects) return true;
    
    const disablingEffects = ['Stun', 'Paralysis', 'Sleep'];
    return !character.statusEffects.some(effect => 
        disablingEffects.includes(effect.name) && 
        effect.effectTickData?.cannotAct && 
        effect.duration > 0
    );
}

/**
 * Checks if a character can use abilities (not silenced)
 * @param {Player | Enemy} character - The character to check
 * @returns {boolean} True if character can use abilities
 */
export function canCharacterUseAbilities(character) {
    if (!character || !character.statusEffects) return true;
    
    const silenceEffect = character.statusEffects.find(effect => 
        effect.name === 'Silence' && effect.duration > 0
    );
    
    return !silenceEffect || !silenceEffect.effectTickData?.cannotUseAbilities;
}

/**
 * Applies damage and handles weapon-based effects (elemental damage, on-hit status effects)
 * @param {Player | Enemy} attacker - The attacking character
 * @param {Player | Enemy} target - The target character
 * @param {Object} options - Attack options
 * @returns {Object} Attack result
 */
export function executeWeaponAttack(attacker, target, options = {}) {
    const log = window.displayVisualError || console.log;
    
    // Get weapon information if attacker is a player
    let weapon = null;
    if (attacker.id?.startsWith('player') && attacker.inventory && attacker.equipment?.weapon) {
        weapon = attacker.inventory.find(item => item.id === attacker.equipment.weapon);
    }
    
    // Determine element and status effects from weapon
    const element = weapon?.stats?.element || options.element || 'Physical';
    const onHitStatus = weapon?.stats?.onHitStatus || options.onHitStatus;
    
    // Calculate damage with elemental type
    const damageResult = calculateDamage(attacker, target, {
        ...options,
        element: element,
        applyStatusEffects: onHitStatus ? [onHitStatus] : options.applyStatusEffects
    });
    
    // Handle miss/block
    if (damageResult.missed || damageResult.blocked) {
        return damageResult;
    }
    
    // Apply damage
    const oldHp = target.hp;
    target.hp = Math.max(0, target.hp - damageResult.damage);
    const actualDamage = oldHp - target.hp;
    
    log(`${attacker.name} deals ${actualDamage} ${element} damage to ${target.name} (${oldHp} -> ${target.hp})`);
    
    // Apply on-hit status effects
    if (onHitStatus && actualDamage > 0) {
        const statusChance = weapon?.stats?.statusChance || 0.2; // Default 20% chance
        if (Math.random() < statusChance) {
            const effectKey = Object.keys(Config.STATUS_EFFECTS).find(key => 
                Config.STATUS_EFFECTS[key].name === onHitStatus
            );
            
            if (effectKey) {
                applyConfiguredStatusEffect(target, effectKey, null, {}, `${weapon?.name || 'Weapon'} hit`);
                log(`${target.name} is affected by ${onHitStatus} from weapon hit!`);
            }
        }
    }
    
    // Check for defeat
    if (target.hp <= 0) {
        if (target.id?.startsWith('player') && !target.isDowned) {
            target.isDowned = true;
            target.downedTurns = 0;
        } else if (target.id?.startsWith('enemy') && !target.isDefeated) {
            target.isDefeated = true;
        }
    }
    
    return {
        ...damageResult,
        actualDamage,
        element,
        statusApplied: onHitStatus && actualDamage > 0
    };
}

/**
 * Applies a status effect to a target character. Handles duration stacking.
 * @param {Player | Enemy} target - The character to apply the effect to.
 * @param {string} effectName - Name of the effect (e.g., 'Poison', 'Regen', 'Defense Up').
 * @param {number} duration - Duration in turns.
 * @param {object} [effectData={}] - Data associated with the effect (e.g., { hpPerTurn: -5, defMod: 10 }).
 * @param {string} [source='Unknown'] - Source of the effect (e.g., move name, item name).
 */
/**
 * Catalog entry for a status name, case-insensitive; also matches word forms
 * like "Burning" / "Poisoned" (spells and the narrator write those).
 */
export function lookupStatusEffect(name) {
    if (!name || typeof name !== 'string') return null;
    const catalog = Config.STATUS_EFFECTS || {};
    const low = name.trim().toLowerCase();
    if (catalog[low.toUpperCase()]) return catalog[low.toUpperCase()];
    const entries = Object.values(catalog).filter(e => e && typeof e.name === 'string');
    return entries.find(e => e.name.toLowerCase() === low)
        || entries.find(e => low.startsWith(e.name.toLowerCase()))
        || null;
}

export function applyStatusEffect(target, effectName, duration, effectData = {}, source = 'Unknown') {
    const log = window.displayVisualError || console.log;
    // Fill in the catalog's mechanics (spells and special moves passed {} or
    // flat fields, so a "Burning" spell never burned). Given data wins.
    const known = lookupStatusEffect(effectName);
    // One name per effect: "stunned" / "Poisoned" are stored as Stun / Poison,
    // so canCharacterAct, cures and icons recognise them.
    if (known?.name) effectName = known.name;
    effectData = { ...(known?.defaultData || {}), ...(effectData || {}) };
    if (!target || !effectName || typeof duration !== 'number' || duration <= 0) {
        log(`Combat Warning: Invalid parameters for applyStatusEffect: Target=${!!target}, Effect=${effectName}, Duration=${duration}`);
        return;
    }
    log(`Combat: Applying status '${effectName}' to ${target.name} (Duration: ${duration}, Source: ${source}, Data: ${JSON.stringify(effectData)})`);
    if (!target.statusEffects) target.statusEffects = [];
    const existingEffectIndex = target.statusEffects.findIndex(e => e?.name === effectName);
    if (existingEffectIndex !== -1) {
        const existingEffect = target.statusEffects[existingEffectIndex];
        log(` -> Effect '${effectName}' already exists. Refreshing duration.`);
        existingEffect.duration = Math.max(existingEffect.duration, duration);
        existingEffect.effectTickData = { ...effectData };
        existingEffect.source = source;
        log(` -> Duration updated to ${existingEffect.duration}, data replaced.`);
    } else {
        const newEffect = {
            id: generateId('status'),
            name: effectName,
            duration: duration,
            effectTickData: { ...effectData },
            source: source,
        };
        target.statusEffects.push(newEffect);
        log(` -> New effect added. Total effects: ${target.statusEffects.length}`);
    }
    const affectsStats = Object.keys(effectData).some(key => key.toLowerCase().includes('atk') || key.toLowerCase().includes('def'));
    if (affectsStats) {
        log(` -> Status effect '${effectName}' potentially affects stats. Recalculating...`);
        recalculateCharacterStats(target);
        log(` -> ${target.name} stats recalculated. New ATK:${target.atk}, DEF:${target.def}`);
    }
}

/**
 * Processes status effect ticks at the start/end of a turn/round.
 * Applies damage/healing, updates durations, removes expired effects. Checks for defeat/downed state.
 * Called from turnManager.advanceTurn.
 * **REVISED:** Focuses on core status effect processing.
 * @param {Player | Enemy} character - The character whose effects to process.
 * @returns {boolean} True if any effect ticked, changed duration, or expired, false otherwise.
 */
export async function processStatusEffectTicks(character) {
    const log = window.displayVisualError || console.log;
    
    // Validate input
    if (!character || typeof character !== 'object') {
        log('ERROR: Invalid character passed to processStatusEffectTicks');
        return false;
    }

    // Initialize status effects array if it doesn't exist
    if (!Array.isArray(character.statusEffects)) {
        character.statusEffects = [];
        return false;
    }

    // Early return if no effects to process
    if (character.statusEffects.length === 0) {
        return false;
    }
    
    log(`Combat: Processing status ticks for ${character.name} (ID: ${character.id}). Current HP: ${character.hp}/${character.maxHp}`);
    
    let effectsChanged = false;
    let statsNeedRecalc = false;
    let damageDealt = 0;
    
    // Process effects in reverse order to safely remove expired ones
    for (let i = character.statusEffects.length - 1; i >= 0; i--) {
        const effect = character.statusEffects[i];
        
        // Skip invalid effects
        if (!effect || typeof effect !== 'object') {
            log(` -> Removing invalid effect at index ${i}`);
            character.statusEffects.splice(i, 1);
            effectsChanged = true;
            continue;
        }

        // Validate effect properties
        if (!effect.name || typeof effect.duration !== 'number') {
            log(` -> Removing malformed effect at index ${i}: ${JSON.stringify(effect)}`);
            character.statusEffects.splice(i, 1);
            effectsChanged = true;
            continue;
        }

        log(` -> Processing effect: ${effect.name} (Duration: ${effect.duration})`);

        // Process effect ticks if active
        if (effect.duration > 0) {
            // Process HP per turn effects (Burn, Poison, Bleed, Frost, Regen)
            if (effect.effectTickData && typeof effect.effectTickData.hpPerTurn === 'number') {
                try {
                    const hpChange = effect.effectTickData.hpPerTurn;
                    const oldHp = character.hp;
                    character.hp = clamp(character.hp + hpChange, 0, character.maxHp);
                    const actualChange = character.hp - oldHp;
                    
                    if (actualChange !== 0) {
                        const msg = `${character.name} ${actualChange > 0 ? 'regenerates' : 'takes'} ${Math.abs(actualChange)} HP from ${effect.name}.`;
                        log(`   -> ${msg} (HP: ${oldHp} -> ${character.hp})`);
                        showPopup(msg, actualChange > 0 ? 'healing' : 'damage');
                        
                        if (actualChange < 0) {
                            damageDealt += Math.abs(actualChange);
                            
                            // Break sleep effect if damaged
                            if (effect.name === 'Sleep' && effect.effectTickData.breaksOnDamage) {
                                log(`   -> ${effect.name} broken by damage!`);
                                effect.duration = 0; // Will be removed this turn
                            }
                        }

                        // Check for defeat/down state
                        if (character.hp <= 0) {
                            log(`   -> ${character.name} reached 0 HP due to ${effect.name}!`);
                            if (character.id.startsWith('player') && !character.isDowned) {
                                character.isDowned = true;
                                character.downedTurns = 0;
                                showPopup(`${character.name} was downed by ${effect.name}!`, 'error');
                            } else if (character.id.startsWith('enemy') && !character.isDefeated) {
                                await handleEnemyDefeat(character.id);
                            }
                        }
                    }
                } catch (e) {
                    log(`Error processing HP change for ${effect.name}:`, e);
                }
            }

            // Process special effect behaviors
            if (effect.effectTickData) {
                // Handle Paralysis recovery chance
                if (effect.name === 'Paralysis' && effect.effectTickData.recoveryChance) {
                    if (Math.random() < effect.effectTickData.recoveryChance) {
                        log(`   -> ${character.name} recovered from ${effect.name}!`);
                        showPopup(`${character.name} recovered from ${effect.name}!`, 'success');
                        effect.duration = 0; // Will be removed this turn
                    }
                }

                // Handle stat modifications that need recalculation
                const statKeys = ['atkMod', 'defMod', 'atkMultiplier', 'defMultiplier', 'speedMod'];
                const hasStatMods = statKeys.some(key => typeof effect.effectTickData[key] === 'number');
                if (hasStatMods) {
                    statsNeedRecalc = true;
                }
            }

            // Process custom tick effects
            if (typeof effect.onTick === 'function') {
                try {
                    effect.onTick(character);
                } catch (e) {
                    log(`Error in status effect tick handler for ${effect.name}:`, e);
                }
            }
        }

        // Decrease duration
        effect.duration--;
        log(`   -> ${effect.name} duration decreased to ${effect.duration}`);
        effectsChanged = true;

        // Handle effect expiration
        if (effect.duration <= 0) {
            log(`   -> ${effect.name} expired for ${character.name}`);
            
            // Process expiration effects
            if (typeof effect.onExpire === 'function') {
                try {
                    effect.onExpire(character);
                } catch (e) {
                    log(`Error in status effect expiration handler for ${effect.name}:`, e);
                }
            }

            // Remove the effect
            character.statusEffects.splice(i, 1);
            effectsChanged = true;
            
            // Check if expired effect had stat mods
            if (effect.effectTickData) {
                const statKeys = ['atkMod', 'defMod', 'atkMultiplier', 'defMultiplier'];
                const hadStatMods = statKeys.some(key => typeof effect.effectTickData[key] === 'number');
                if (hadStatMods) {
                    statsNeedRecalc = true;
                }
            }
        }
    }

    // Recalculate stats if needed
    if (statsNeedRecalc) {
        log(` -> Recalculating stats for ${character.name} due to status changes`);
        try {
            recalculateCharacterStats(character);
        } catch (e) {
            log(`Error recalculating stats:`, e);
        }
    }

    // Update UI if needed
    if (effectsChanged) {
        try {
            renderPlayerCards();
            renderEnemyCards();
            updateContextHeaders();
        } catch (e) {
            log(`Error updating UI after status effects:`, e);
        }
    }

    log(`Combat: Status tick processing finished for ${character.name}. Effects changed: ${effectsChanged}`);
    return effectsChanged;
}

/**
 * Recalculates derived stats (ATK, DEF) for a character based on base stats,
 * equipment (if player), and applicable status effect modifiers.
 * Updates the character object directly.
 * @param {Player | Enemy} character
 */
export function recalculateCharacterStats(character) {
     // (Unchanged)
     const log = window.displayVisualError || console.log;
     if (!character) { log("Combat Warning: recalculateCharacterStats called with null character."); return; }
     log(`Combat: Recalculating stats for ${character.name} (ID: ${character.id})...`);
     let currentAtk, currentDef;
     const isPlayer = character.id?.startsWith('player');
     // ponytail: enemies keep their raw atk/def; their multipliers apply at
     // attack time (calculateDamage). Baking them in here compounded on every
     // recalculation and never wore off. Flat mods on enemies are ignored.
     if (!isPlayer) return;
     if (isPlayer) {
         currentAtk = character.baseAtk ?? Config.BASE_ATK;
         currentDef = character.baseDef ?? Config.BASE_DEF;
         log(` -> Player Base Stats: ATK=${currentAtk}, DEF=${currentDef}`);
     } else {
         currentAtk = character.atk ?? 0;
         currentDef = character.def ?? 0;
         log(` -> Enemy Base (from current values): ATK=${currentAtk}, DEF=${currentDef}`);
     }
     if (isPlayer && character.inventory) {
        const weapon = character.inventory.find(item => item?.id === character.equipment?.weapon);
        const armor = character.inventory.find(item => item?.id === character.equipment?.armor);
        const weaponBonus = weapon?.stats?.atk || 0;
        const armorBonus = armor?.stats?.def || 0;
        currentAtk += weaponBonus;
        currentDef += armorBonus;
        currentAtk += Progression.braveAttack(character); // +1 attack per point of Brave
        if (weaponBonus !== 0 || armorBonus !== 0) log(` -> After Equip: ATK=${currentAtk} (+${weaponBonus}), DEF=${currentDef} (+${armorBonus})`);
     }
     let flatAtkMod = 0, flatDefMod = 0, atkMultiplier = 1.0, defMultiplier = 1.0;
     character.statusEffects?.forEach(effect => {
         if (effect?.effectTickData) {
             if (typeof effect.effectTickData.atkMod === 'number') flatAtkMod += effect.effectTickData.atkMod;
             if (typeof effect.effectTickData.defMod === 'number') flatDefMod += effect.effectTickData.defMod;
             if (typeof effect.effectTickData.atkMultiplier === 'number') atkMultiplier *= effect.effectTickData.atkMultiplier;
             if (typeof effect.effectTickData.defMultiplier === 'number') defMultiplier *= effect.effectTickData.defMultiplier;
         }
     });
     currentAtk += flatAtkMod; currentDef += flatDefMod;
     if (flatAtkMod !== 0 || flatDefMod !== 0) log(` -> After Flat Status Mods: ATK=${currentAtk} (${flatAtkMod > 0 ? '+' : ''}${flatAtkMod}), DEF=${currentDef} (${flatDefMod > 0 ? '+' : ''}${flatDefMod})`);
     currentAtk = Math.max(0, currentAtk); currentDef = Math.max(0, currentDef);
     currentAtk *= atkMultiplier; currentDef *= defMultiplier;
     if (atkMultiplier !== 1.0 || defMultiplier !== 1.0) log(` -> After Status Multipliers: ATK=${currentAtk.toFixed(1)} (x${atkMultiplier.toFixed(2)}), DEF=${currentDef.toFixed(1)} (x${defMultiplier.toFixed(2)})`);
     character.atk = Math.max(0, Math.round(currentAtk));
     character.def = Math.max(0, Math.round(currentDef));
     log(` -> Final Recalculated Stats Assigned: ATK=${character.atk}, DEF=${character.def}`);
}


// --- Combat Checks ---

/**
 * Checks if all enemies are defeated.
 * @returns {boolean} True if all enemies are defeated, false otherwise.
 */
export function areAllEnemiesDefeated() {
    // (Unchanged)
    if (!gameState.inCombat) return false;
    if (!gameState.enemies || gameState.enemies.length === 0) return true;
    return gameState.enemies.every(enemy => enemy?.isDefeated || enemy?.hp <= 0);
}

/**
 * Checks if the entire player party is downed.
 * @returns {boolean} True if all players are downed, false otherwise.
 */
export function isPartyWiped() {
    // (Unchanged)
    if (!gameState.players || gameState.players.length === 0) return false;
    return gameState.players.every(player => player?.isDowned);
}

/**
 * Handles the defeat of a specific enemy, including loot/coin generation and distribution.
 * Called when an enemy's HP reaches 0 (or by status effect ticks).
 * **REVISED:** Handles loot and coin distribution.
 * @param {string} enemyId - The ID of the defeated enemy.
 */
/** One loot roll for a defeated foe (its drop chance, tier and boss/elite tables); null on a miss. */
async function rollLootItem(enemy) {
    const log = window.displayVisualError || console.log;
    if (Math.random() > enemy.lootChance) return null;
    try {
        const dynamicItems = await import('./dynamicItems.js');
        if (enemy.isBoss) return await dynamicItems.generateBossRewardItem(gameState.adventureTheme, enemy.lootTier, { name: enemy.name, bossType: enemy.bossType || 'boss', phase: enemy.currentPhase || 0 });
        if (enemy.isElite) return await dynamicItems.generateEliteRewardItem(gameState.adventureTheme, enemy.lootTier, { name: enemy.name, eliteType: enemy.eliteType || 'elite' });
        const roll = Math.random();
        const itemType = roll < 0.25 ? 'Weapon' : roll < 0.5 ? 'Armor' : 'Consumable';
        return await dynamicItems.generateDynamicItem(gameState.adventureTheme, enemy.lootTier, itemType, {
            storyContext: `defeated_${enemy.name.toLowerCase().replace(/\s+/g, '_')}`,
            playerNeeds: ['equipment_upgrade', 'consumables'],
            recentEvents: ['defeated_regular_enemy'],
            isLootDrop: true, luckUpChance: 0.12, luckDownChance: 0.03
        });
    } catch (e) {
        log('Combat ERROR generating dynamic loot drop:', e);
        try { return generateLootDrop(gameState.adventureTheme, 1, enemy.lootTier); } catch (_) { return null; }
    }
}

export async function handleEnemyDefeat(enemyId) {
     const log = window.displayVisualError || console.log;
     const enemyIndex = gameState.enemies.findIndex(e => e?.id === enemyId);
     if (enemyIndex === -1) {
         log(`Combat Warning: handleEnemyDefeat called for unknown enemy ID ${enemyId}.`);
         return;
     }
     const enemy = gameState.enemies[enemyIndex];

     // Own flag, not isDefeated: executeWeaponAttack sets isDefeated on the
     // killing blow, which used to make this return early with no loot.
     if (enemy.defeatProcessed) {
         log(`Combat Info: Enemy ${enemy.name} defeat already processed.`);
         return;
     }
     enemy.defeatProcessed = true;
     // Remembered past the fight: only a fallen boss can end the quest (engine).
     if (enemy.isBoss) { gameState.questProgress = gameState.questProgress || {}; gameState.questProgress.bossDefeated = true; }

     enemy.isDefeated = true;
     enemy.hp = 0;

     log(`Combat: ${enemy.name} defeated! Processing loot and coins...`);
     // Experience for the whole party; level-ups raise stats (battle.js).
     try {
         const { awardXp } = await import('./battle.js');
         const { xp, ups } = awardXp(enemy);
         const standing = (gameState.players || []).filter(p => p && !p.isDowned).length;
         showPopup(`${enemy.name} defeated! +${xp} XP${standing > 1 ? ' each' : ''}`, 'success');
         for (const p of gameState.players || []) if (p) recalculateCharacterStats(p);
         ups.forEach(u => showPopup(`⭐ ${u}`, 'legendary', 3500));
     } catch (e) {
         showPopup(`${enemy.name} defeated!`, 'success');
     }

     // --- Generate Loot Using Dynamic Item System ---
     log(` -> Generating dynamic loot (Chance: ${enemy.lootChance}, MaxTier: ${enemy.lootTier}, Type: ${enemy.isBoss ? 'Boss' : enemy.isElite ? 'Elite' : 'Regular'})`);
     // One drop roll per standing hero, each to a different hero: loot
     // scales with the party (solo: one roll, as before).
     const looters = (gameState.players || []).filter(p => p && !p.isDowned);
     for (const lootRecipient of looters) {
         const lootItem = await rollLootItem(enemy);
         if (!lootItem) continue;
         if (!lootRecipient.inventory) lootRecipient.inventory = [];
         lootRecipient.inventory.push(lootItem);
         showPopup(`${lootRecipient.name} found: ${lootItem.name}!`, 'item');
         log(` -> Loot ${lootItem.name} given to ${lootRecipient.name}`);
     }
     if (gameState.currentScreen === 'inventoryScreen') renderInventory();

     // --- Generate Spell Rewards for Spellcasters ---
     try {
         const player = gameState.players.find(p => p && !p.isDowned && p.spellcasting);
         if (player && (enemy.isBoss || enemy.isElite || Math.random() < 0.15)) {
             const DynamicSpells = await import('./dynamicSpells.js');
             const rewardSpell = await DynamicSpells.generateSpellReward(enemy.type || 'regular', player);
             
             if (rewardSpell) {
                 // Add to player's known spells
                 player.spellcasting.knownSpells.push(rewardSpell);
                 
                 // Add to prepared if there's room
                 if (player.spellcasting.preparedSpells.length < 10) {
                     player.spellcasting.preparedSpells.push(rewardSpell);
                 }
                 
                 const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
                 showPopup(`${player.name} learned new ${adaptation.abilityName.toLowerCase()}: ${rewardSpell.name}!`, 'success', 5000);
                 log(`${player.name} learned spell reward: ${rewardSpell.name}`);
             }
         }
     } catch (error) {
         log(`Spell reward generation failed: ${error.message}`);
     }

     // --- Generate Coins ---
     // The pot grows with the foe (foe HP scales with party size) and is
     // split evenly between the heroes still standing.
     const baseCoin = Math.max(1, Math.round(enemy.maxHp / 5));
     const coinDrop = getRandomInt(Math.floor(baseCoin * 0.7), Math.ceil(baseCoin * 1.3));
     if (coinDrop > 0 && looters.length) {
         const share = Math.max(1, Math.ceil(coinDrop / looters.length));
         looters.forEach(p => { p.coins = (p.coins || 0) + share; });
         showPopup(looters.length > 1 ? `The party splits ${share * looters.length} coins (${share} each)!` : `${looters[0].name} gained ${share} coins!`, 'coins');
         log(` -> ${coinDrop} coins split ${share} each across ${looters.length} hero(es)`);
         renderPlayerCards();
         updateContextHeaders();
     }

     renderEnemyCards();

     // Check if this was the last enemy and trigger combat victory if so
     // During a player's combat round actionHandler narrates the victory
     // itself; triggering handleCombatVictory too gave two narrations.
     if (areAllEnemiesDefeated() && !gameState.combatRoundInProgress) {
         log("All enemies defeated after processing this enemy. Triggering combat victory...");
         import('./resolution.js').then(resolution => {
             resolution.handleCombatVictory();
         }).catch(error => {
             log("Error importing resolution module:", error);
         });
     }

     // Track performance for difficulty adaptation
     if (gameState.difficultyAdaptationAgent) {
         try {
             const performanceData = {
                 combatSuccessRate: calculateCombatSuccessRate(),
                 enemyDefeated: true,
                 turnsToDefeat: gameState.combat.round,
                 playerHealthRemaining: gameState.players.reduce((sum, p) => sum + (p.hp || 0), 0),
                 timestamp: Date.now()
             };
             
             // Async difficulty analysis (non-blocking)
             gameState.difficultyAdaptationAgent.analyzeDifficultyAdaptation(gameState.players[0]?.id, performanceData)
                 .then(adaptationResult => {
                     if (adaptationResult?.adapted) {
                         log(`Difficulty adapted: ${adaptationResult.adaptations.length} changes applied`);
                     }
                 })
                 .catch(error => {
                     log(`Difficulty adaptation failed: ${error.message}`);
                 });
         } catch (error) {
             log(`Difficulty adaptation integration error: ${error.message}`);
         }
     }

     log(`Combat: handleEnemyDefeat finished for ${enemy.name}.`);
}

/**
 * Calculate combat success rate for difficulty adaptation
 * @returns {number} Success rate between 0 and 1
 */
function calculateCombatSuccessRate() {
    // Simple heuristic based on player health and combat progress
    const totalPlayerHealth = gameState.players.reduce((sum, p) => sum + (p.hp || 0), 0);
    const totalMaxHealth = gameState.players.reduce((sum, p) => sum + (p.maxHp || 1), 0);
    const healthRatio = totalPlayerHealth / Math.max(totalMaxHealth, 1);
    
    // Factor in combat rounds (longer combat = lower success rate)
    const roundPenalty = Math.max(0, (gameState.combat.round - 5) * 0.05);
    
    return Math.max(0, Math.min(1, healthRatio - roundPenalty));
}

// --- Enemy AI ---

/**
 * Handles an enemy's turn in combat
 * @param {string} enemyId - ID of the enemy whose turn it is
 * @returns {Promise<void>}
 */
export async function handleEnemyTurn(enemyId) {
    const log = window.displayVisualError || console.log;
    const enemy = findCharacterById(enemyId);
    
    if (!enemy || enemy.isDefeated) {
        log(`ERROR: Invalid enemy or defeated enemy for turn: ${enemyId}`);
        return;
    }

    log(`Enemy Turn: ${enemy.name} is acting...`);

    // Stunned / asleep / paralysed foes (bosses too) lose their turn.
    if (!canCharacterAct(enemy)) {
        showPopup(`${enemy.name} can't act this turn!`, 'info', 2000);
        await advanceCombatTurn(); // ticks the disabling effect down
        return;
    }
    
    // Slow / Frost: every other turn is lost.
    if (isSluggish(enemy)) {
        showPopup(`${enemy.name} is too sluggish to act!`, 'info', 2000);
        try { (await import('./ui.js')).appendCombatLog?.(`${enemy.name} is too slow to act this turn.`, 'info'); } catch (_) {}
        await advanceCombatTurn();
        return;
    }

    // Wait a moment before enemy acts for better UX
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get all valid targets (non-downed players)
    const validTargets = gameState.players.filter(p => !p.isDowned);
    if (validTargets.length === 0) {
        log(`No valid targets for ${enemy.name}`);
        return;
    }

    // Confusion: the blow lands on itself or a fellow foe.
    if (confusedRoll(enemy)) {
        const foes = (gameState.enemies || []).filter(e => e && !e.isDefeated && e.hp > 0);
        const victim = foes[Math.floor(Math.random() * foes.length)] || enemy;
        const dmg = Math.max(1, Math.round((enemy.atk || 5) * 0.6 - (victim.def || 0) * 0.3));
        victim.hp = Math.max(0, victim.hp - dmg);
        const line = victim === enemy ? `${enemy.name} is confused and hurts itself (−${dmg})!` : `${enemy.name} is confused and strikes ${victim.name} (−${dmg})!`;
        showPopup(line, 'info', 2500);
        try { (await import('./ui.js')).appendCombatLog?.(line, 'attack'); } catch (_) {}
        if (victim.hp <= 0) { victim.isDefeated = true; await handleEnemyDefeat(victim.id); }
        renderEnemyCards();
        if (areAllEnemiesDefeated()) { gameState.inCombat = false; if (gameState.combat) gameState.combat.isActive = false; return; }
        await advanceCombatTurn();
        return;
    }

    // Boss signature move every other round: hits every conscious hero.
    if (enemy.isBoss && (gameState.combat?.round || 1) % 2 === 0) {
        const move = enemy.abilities?.[0] || 'Crushing Blow';
        const hits = [];
        for (const hero of validTargets) {
            const dmg = Math.max(1, Math.round(Math.max(3, enemy.atk * 1.2 - (hero.def || 0) * 0.5) * incomingDamageMultiplier(hero)));
            hero.hp = Math.max(0, hero.hp - dmg);
            hits.push(`${hero.name} -${dmg}`);
            if (hero.hp <= 0) { hero.isDowned = true; showPopup(`${hero.name} has been defeated!`, 'error'); }
        }
        showPopup(`\u{1F451} ${enemy.name} unleashes ${move}! (${hits.join(', ')})`, 'damage', 4000);
        try { (await import('./ui.js')).appendCombatLog?.(`${enemy.name} unleashes ${move}: ${hits.join(', ')}`, 'attack'); } catch (_) {}
        await hasteFollowUp(enemy);
        renderPlayerCards();
        await advanceCombatTurn(); // ticks the enemy's status effects (once)
        return;
    }

    // Select action based on enemy's abilities and state
    const action = await selectEnemyAction(enemy);
    
    // Select target based on action type
    const target = selectEnemyTarget(enemy, action, validTargets);
    
    // Execute the action
    await executeEnemyAction(enemy, action, target);
    await hasteFollowUp(enemy);

    // Advance the turn (awaited: see boss branch above); it also ticks the
    // enemy's status effects, so they are not ticked here too.
    await advanceCombatTurn();
}

/**
 * Selects an action for the enemy to take based on combat context
 * @param {Enemy} enemy - The enemy selecting an action
 * @returns {Object} The selected action
 */
async function selectEnemyAction(enemy) {
    const log = window.displayVisualError || console.log;
    
    // Get current player and combat context
    const currentPlayer = getCurrentPlayer();
    const context = determineContext(currentPlayer);
    
    // Get available abilities
    const abilities = enemy.abilities || ['Basic Attack'];
    
    // (Removed dead `apiProvider === 'aistudio'` branch — external Google AI
    // Studio integration was removed in Tier 1; only the local backend exists.)

    // Original tactical-fallback logic
    const tacticalPosition = context.combatState.tacticalAdvantage;
    const threatLevel = context.combatState.threatLevel;
    const playerCondition = context.combatState.playerCondition;
    const enemyCondition = context.combatState.enemyCondition;
    
    log(`Enemy AI: Analyzing combat context - Tactical: ${tacticalPosition}, Threat: ${threatLevel}, Player: ${playerCondition}, Enemy: ${enemyCondition}`);

    // Calculate special ability chance based on context
    let specialChance = 0.3; // Base 30% chance
    
    // Adjust based on tactical position
    if (tacticalPosition === 'advantage') {
        specialChance += 0.2; // More aggressive when advantaged
    } else if (tacticalPosition === 'disadvantage') {
        specialChance += 0.1; // Slightly more desperate when disadvantaged
    }
    
    // Adjust based on conditions
    if (playerCondition === 'critical') {
        specialChance += 0.2; // More aggressive against weak players
    }
    if (enemyCondition === 'critical') {
        specialChance += 0.1; // More desperate when weak
    }

    // Select ability based on context
    const specialAbilities = abilities.filter(a => a !== 'Basic Attack');
    if (Math.random() < specialChance && specialAbilities.length > 0) {
        
        // Prioritize abilities based on context
        const prioritizedAbilities = specialAbilities.map(ability => {
            let priority = 1;
            
            // Boost priority based on context
            if (tacticalPosition === 'advantage' && isAggressiveAbility(ability)) priority += 2;
            if (tacticalPosition === 'disadvantage' && isDefensiveAbility(ability)) priority += 2;
            if (playerCondition === 'critical' && isFinishingAbility(ability)) priority += 3;
            if (enemyCondition === 'critical' && isDefensiveAbility(ability)) priority += 2;
            
            return { ability, priority };
        }).sort((a, b) => b.priority - a.priority);
        
        const selectedAbility = prioritizedAbilities[0].ability;
        log(`${enemy.name} selected special ability: ${selectedAbility} based on combat context`);
        
        return {
            type: 'special',
            name: selectedAbility,
            targeting: getAbilityTargeting(selectedAbility)
        };
    }
    
    // Default to basic attack with context-aware description
    log(`${enemy.name} using basic attack with context awareness`);
    return {
        type: 'attack',
        name: 'Basic Attack',
        targeting: 'single',
        contextualDescription: getContextualAttackDescription(enemy, context)
    };
}

/**
 * Categorizes an ability type for tactical decision making
 */
function isAggressiveAbility(ability) {
    return ['Shadow Bolt', 'Smash', 'Acid Spit'].includes(ability);
}

function isDefensiveAbility(ability) {
    return ['Web', 'Roar', 'Shield'].includes(ability);
}

function isFinishingAbility(ability) {
    return ['Shadow Bolt', 'Acid Spit', 'Death Strike'].includes(ability);
}

/**
 * Generates a contextual description for basic attacks
 */
function getContextualAttackDescription(enemy, context) {
    if (context.combatState.tacticalAdvantage === 'advantage') {
        return `${enemy.name} presses their advantage with a fierce attack`;
    } else if (context.combatState.tacticalAdvantage === 'disadvantage') {
        return `${enemy.name} launches a desperate attack`;
    } else if (context.combatState.playerCondition === 'critical') {
        return `${enemy.name} moves in for a finishing blow`;
    } else {
        return `${enemy.name} strikes`;
    }
}

/**
 * Selects a target for the enemy's action based on combat context
 * @param {Enemy} enemy - The enemy selecting a target
 * @param {Object} action - The action being used
 * @param {Player[]} validTargets - Array of valid targets
 * @returns {Player|Player[]} Selected target(s)
 */
function selectEnemyTarget(enemy, action, validTargets) {
    const currentPlayer = getCurrentPlayer();
    const context = determineContext(currentPlayer);
    
    if (action.targeting === 'all') {
        return validTargets;
    }
    
    if (action.targeting === 'random') {
        return getRandomElement(validTargets);
    }
    
    // Enhanced target selection based on context
    const targetPriorities = validTargets.map(target => {
        let priority = 0;
        
        // Base priority on HP percentage
        const hpPercentage = target.hp / target.maxHp;
        if (hpPercentage <= 0.3) priority += 3;
        else if (hpPercentage <= 0.5) priority += 2;
        
        // Consider tactical position
        if (context.combatState.tacticalAdvantage === 'advantage') {
            // When advantaged, focus on finishing off weak targets
            if (hpPercentage <= 0.3) priority += 2;
        } else if (context.combatState.tacticalAdvantage === 'disadvantage') {
            // When disadvantaged, focus on targets that might be a bigger threat
            if (target.atk > enemy.def) priority += 2;
        }
        
        // Consider status effects
        if (target.statusEffects?.some(effect => 
            effect.name.toLowerCase().includes('weaken') || 
            effect.name.toLowerCase().includes('vulnerable'))) {
            priority += 2;
        }
        
        return { target, priority };
    }).sort((a, b) => b.priority - a.priority);
    
    // 70% chance to pick highest priority target, 30% chance for random selection
    return Math.random() < 0.7 ? targetPriorities[0].target : getRandomElement(validTargets);
}

/**
 * Executes the enemy's selected action with contextual descriptions
 * @param {Enemy} enemy - The enemy performing the action
 * @param {Object} action - The action to execute
 * @param {Player|Player[]} target - The target(s) of the action
 * @returns {Promise<void>}
 */
async function executeEnemyAction(enemy, action, target) {
    const log = window.displayVisualError || console.log;
    const context = determineContext(getCurrentPlayer());
    
    switch (action.type) {
        case 'attack':
            if (Array.isArray(target)) {
                // Handle multi-target attack
                for (const t of target) {
                    await executeEnemyAttack(enemy, t, action, context);
                }
            } else {
                // Single target attack
                await executeEnemyAttack(enemy, target, action, context);
            }
            break;
            
        case 'special':
            await executeEnemySpecialAbility(enemy, target, action, context);
            break;
    }
}

/**
 * Executes a basic enemy attack with contextual descriptions
 * @param {Enemy} enemy - The attacking enemy
 * @param {Player} target - The target player
 * @param {Object} action - The attack action
 * @param {Object} context - The current combat context
 */
async function executeEnemyAttack(enemy, target, action, context) {
    const log = window.displayVisualError || console.log;
    
    // Calculate damage using the enhanced combat system
    const damageResult = calculateDamage(enemy, target, {
        isCombo: false,
        contextualBonus: context.combatState.tacticalAdvantage === 'advantage' ? 1.2 : 1.0
    });

    // Apply the damage
    target.hp = Math.max(0, target.hp - damageResult.damage);
    
    // Generate contextual attack description
    let attackDescription = action.contextualDescription || `${enemy.name} attacks ${target.name}`;
    if (damageResult.isCritical) {
        attackDescription += ' with devastating effect';
    }
    
    // Add tactical flavor based on context
    if (context.combatState.tacticalAdvantage === 'advantage') {
        attackDescription += ', pressing their tactical advantage';
    } else if (context.combatState.tacticalAdvantage === 'disadvantage') {
        attackDescription += ', despite their disadvantaged position';
    }
    
    // Add condition-based descriptions
    if (context.combatState.playerCondition === 'critical') {
        attackDescription += ', sensing victory is near';
    } else if (context.combatState.enemyCondition === 'critical') {
        attackDescription += ' with desperate determination';
    }
    
    // Show the attack result
    if (damageResult.missed) showPopup(`${enemy.name} attacks ${target.name} and misses!`, 'info');
    else if (damageResult.blocked) showPopup(`${enemy.name} can't land a blow on ${target.name}!`, 'info');
    else showPopup(`${attackDescription}: ${target.name} −${damageResult.damage}${damageResult.isCritical ? ' (critical!)' : ''}`, 'damage');
    
    // Check for defeat
    if (target.hp <= 0) {
        target.isDowned = true;
        target.hp = 0;
        showPopup(`${target.name} has been defeated!`, 'error');
    }
    
    // Update UI
    renderPlayerCards();
    renderEnemyCards();
    updateContextHeaders();
}

/**
 * Executes an enemy special ability with contextual descriptions
 * @param {Enemy} enemy - The enemy using the ability
 * @param {Player|Player[]} target - The target(s)
 * @param {Object} action - The special action
 * @param {Object} context - The current combat context
 */
async function executeEnemySpecialAbility(enemy, target, action, context) {
    const log = window.displayVisualError || console.log;
    
    // Get ability details
    const ability = action.name;
    const targeting = getAbilityTargeting(ability);
    
    // Generate contextual ability description
    let abilityDescription = getContextualAbilityDescription(enemy, ability, context);
    
    // Execute ability effects based on type
    switch (ability) {
        case 'Shadow Bolt':
            await executeAbilityShadowBolt(enemy, target, context, abilityDescription);
            break;
        case 'Curse':
            await executeAbilityCurse(enemy, target, context, abilityDescription);
            break;
        case 'Roar':
            await executeAbilityRoar(enemy, target, context, abilityDescription);
            break;
        case 'Web':
            await executeAbilityWeb(enemy, target, context, abilityDescription);
            break;
        default: {
            // Storyteller-named moves ("Crushing Blow"): a heavy hit, 1.3x attack.
            const hero = Array.isArray(target) ? target[0] : target;
            if (!hero) { showPopup(abilityDescription, 'special'); break; }
            const dealt = hitHero(hero, Math.max(3, Math.round((enemy.atk || 5) * 1.3 - (hero.def || 0) * 0.5)));
            showPopup(`${abilityDescription}! ${hero.name} takes ${dealt} damage!`, 'damage');
            renderPlayerCards();
        }
    }
}

/**
 * Gets targeting type for an ability
 * @param {string} abilityName - Name of the ability
 * @returns {string} Targeting type ('single', 'all', 'random', etc.)
 */
function getAbilityTargeting(abilityName) {
    // Define targeting for special abilities
    const targetingMap = {
        'Shadow Bolt': 'single',
        'Curse': 'single',
        'Roar': 'all',
        'Web': 'single',
        'Acid Spit': 'single',
        'Suppressing Fire': 'all',
        // Add more abilities and their targeting types
    };
    
    return targetingMap[abilityName] || 'single';
}

/**
 * Generates a contextual description for special abilities
 */
function getContextualAbilityDescription(enemy, ability, context) {
    const baseDescription = `${enemy.name} uses ${ability}`;
    
    // Add tactical context
    let tacticalContext = '';
    if (context.combatState.tacticalAdvantage === 'advantage') {
        tacticalContext = ' with overwhelming force';
    } else if (context.combatState.tacticalAdvantage === 'disadvantage') {
        tacticalContext = ' in a desperate gambit';
    }
    
    // Add condition context
    let conditionContext = '';
    if (context.combatState.enemyCondition === 'critical') {
        conditionContext = ' despite their wounds';
    } else if (context.combatState.playerCondition === 'critical') {
        conditionContext = ' for the finishing blow';
    }
    
    return `${baseDescription}${tacticalContext}${conditionContext}`;
}

// Specific ability execution functions
// --- Speed and mind effects (Haste, Slow/Frost, Confusion) and Guard ---
/** Sum of active speedMod (Haste +0.5, Slow/Frost -0.5). */
export function speedModOf(c) {
    return (c?.statusEffects || []).reduce((s, fx) => s + (fx?.duration > 0 ? Number(fx.effectTickData?.speedMod) || 0 : 0), 0);
}
/** Slowed characters lose every other turn (even rounds). */
export function isSluggish(c) {
    return speedModOf(c) < 0 && (gameState.combat?.round || 1) % 2 === 0;
}
/** Confused characters' blows go astray this often (catalog: randomTarget 0.5). */
export function confusedRoll(c) {
    const fx = (c?.statusEffects || []).find(e => e?.name === 'Confusion' && e.duration > 0);
    return !!fx && Math.random() < (Number(fx.effectTickData?.randomTarget) || 0.5);
}
/** Incoming damage factor from Guard, Shield, Vulnerability... (damageMultiplier). */
export function incomingDamageMultiplier(t) {
    return (t?.statusEffects || []).reduce((m, fx) => m * (fx?.duration > 0 && Number(fx.effectTickData?.damageMultiplier) > 0 ? Number(fx.effectTickData.damageMultiplier) : 1), 1);
}
/** Hasted foes follow up with a quick half-power strike on a standing hero. */
async function hasteFollowUp(enemy) {
    if (speedModOf(enemy) <= 0 || enemy.isDefeated || enemy.hp <= 0) return;
    const heroes = gameState.players.filter(p => p && !p.isDowned);
    const hero = heroes[Math.floor(Math.random() * heroes.length)];
    if (!hero) return;
    const dealt = hitHero(hero, Math.max(1, Math.round((enemy.atk || 5) * 0.5 - (hero.def || 0) * 0.25)));
    const line = `${enemy.name} is hasted and strikes again: ${hero.name} −${dealt}`;
    showPopup(line, 'damage', 2500);
    try { (await import('./ui.js')).appendCombatLog?.(line, 'attack'); } catch (_) {}
}

/** Special-ability damage to one hero (Guard/Shield apply); a hero at 0 HP is downed. Returns the damage dealt. */
function hitHero(target, damage) {
    damage = Math.max(1, Math.round(damage * incomingDamageMultiplier(target)));
    target.hp = Math.max(0, target.hp - damage);
    if (target.hp <= 0 && !target.isDowned) {
        target.isDowned = true;
        showPopup(`${target.name} has been defeated!`, 'error');
    }
    return damage;
}

async function executeAbilityShadowBolt(enemy, target, context, description) {
    const damage = hitHero(target, Math.round(enemy.atk * 1.5));
    
    if (context.combatState.tacticalAdvantage === 'advantage') {
        // Apply additional effect when advantaged
        applyStatusEffect(target, 'Shadow Weakness', 2, { defMod: -2 });
    }
    
    showPopup(`${description}! Deals ${damage} dark damage!`, 'special');
    renderPlayerCards();
}

async function executeAbilityCurse(enemy, target, context, description) {
    const duration = context.combatState.tacticalAdvantage === 'advantage' ? 3 : 2;
    applyStatusEffect(target, 'Cursed', duration, { 
        atkMod: -2,
        defMod: -2
    });
    
    showPopup(`${description}! Target is cursed!`, 'special');
    renderPlayerCards();
}

async function executeAbilityRoar(enemy, targets, context, description) {
    const duration = 2;
    if (Array.isArray(targets)) {
        targets.forEach(target => {
            applyStatusEffect(target, 'Intimidated', duration, { 
                atkMod: -1,
                isIntimidated: true
            });
        });
    }
    
    showPopup(`${description}! All targets are intimidated!`, 'special');
    renderPlayerCards();
}

async function executeAbilityWeb(enemy, target, context, description) {
    const duration = 2;
    applyStatusEffect(target, 'Webbed', duration, { 
        isImmobilized: true,
        defMod: -1
    });
    
    showPopup(`${description}! Target is immobilized!`, 'special');
    renderPlayerCards();
}

