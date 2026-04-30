// combat.js
// Handles combat calculations, enemy generation, status effects, and combat state checks.

// --- Module Imports ---
import { gameState, determineContext } from './state.js?cb=014'; // Needs gameState to access players/enemies
import * as Config from './config.js?cb=014'; // Needs config values
// Import specific functions from utils needed here
import { getRandomInt, getRandomElement, clamp, generateId } from './utils.js?cb=014';
// Import item functions needed for enemy loot generation
import { generateThemedItem, generateLootDrop } from './items.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import * as DynamicEnemies from './dynamicEnemies.js?cb=014';
import { getTrustDifficultyModifiers } from './reputationContextualizer.js?cb=014';
// Import UI function for popups and potentially updating UI after combat actions
import { showPopup, renderPlayerCards, renderEnemyCards, updateContextHeaders, renderInventory } from './ui.js?cb=014'; // Added renderInventory
// Import Gemma hyperthreading for enhanced combat AI
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
// Import boss system for enhanced boss encounters
import * as Bosses from './bosses.js?cb=014';

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

/**
 * Creates an enemy object based on a base definition and current scaling.
 * @param {object} baseEnemy - Object containing base stats (name, hp, atk, def, abilities, lootTier).
 * @param {number} turn - Current game turn.
 * @param {number} averagePlayerLevel - Placeholder, currently based on turn. Needs refinement if level system implemented.
 * @returns {Enemy | null} The generated enemy object, or null if baseEnemy is invalid.
 */
export function createEnemyInstance(baseEnemy, turn, averagePlayerLevel) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
    if (!baseEnemy || typeof baseEnemy !== 'object' || !baseEnemy.name || !baseEnemy.baseHp || !baseEnemy.baseAtk || !baseEnemy.baseDef) {
        log("Combat ERROR: Invalid baseEnemy data provided to createEnemyInstance:", baseEnemy);
        return null;
    }
    log(`Combat: Creating enemy instance for '${baseEnemy.name}' (Turn: ${turn}, AvgLvlProxy: ${averagePlayerLevel})`);
    const currentLevelProxy = turn;
    const turnScaling = 1 + (turn - 1) * Config.TURN_SCALING_INCREASE;
    const levelScaling = 1 + currentLevelProxy * Config.PLAYER_LEVEL_SCALING_FACTOR;
    const totalScaling = Config.BASE_ENEMY_SCALING_FACTOR * turnScaling * levelScaling;
    log(` -> Scaling factors: Turn=${turnScaling.toFixed(2)}, LevelProxy=${levelScaling.toFixed(2)}, Total=${totalScaling.toFixed(2)}`);
    const scaledMaxHp = Math.max(10, Math.round(baseEnemy.baseHp * totalScaling));
    const scaledAtk = Math.max(1, Math.round(baseEnemy.baseAtk * totalScaling));
    const scaledDef = Math.max(1, Math.round(baseEnemy.baseDef * totalScaling));
    log(` -> Scaled Stats: HP=${scaledMaxHp}, ATK=${scaledAtk}, DEF=${scaledDef}`);
    // Determine if this should be an elite variant (10% chance, higher at dangerous locations)
    let eliteChance = 0.1; // Base 10% chance
    if (turn > 15) eliteChance += 0.05; // +5% after turn 15
    if (gameState.currentLocation?.dangerLevel > 0.7) eliteChance += 0.1; // +10% in dangerous areas
    
    const isElite = Math.random() < eliteChance;
    const eliteType = isElite ? determineEliteType() : null;
    
    // Apply elite modifiers
    let eliteMultipliers = { hp: 1, atk: 1, def: 1, loot: 1 };
    let eliteName = baseEnemy.name;
    let eliteAbilities = baseEnemy.abilities?.slice() || ['Basic Attack'];
    
    if (isElite) {
        switch (eliteType) {
            case 'Elite':
                eliteMultipliers = { hp: 1.5, atk: 1.3, def: 1.2, loot: 2.0 };
                eliteName = `Elite ${baseEnemy.name}`;
                eliteAbilities.push('Regeneration');
                break;
            case 'Champion':
                eliteMultipliers = { hp: 2.0, atk: 1.5, def: 1.4, loot: 3.0 };
                eliteName = `Champion ${baseEnemy.name}`;
                eliteAbilities.push('Regeneration', 'Damage Reflection');
                break;
            case 'Legendary':
                eliteMultipliers = { hp: 3.0, atk: 1.8, def: 1.6, loot: 5.0 };
                eliteName = `Legendary ${baseEnemy.name}`;
                eliteAbilities.push('Regeneration', 'Damage Reflection', 'Status Immunity');
                break;
        }
    }
    
    let finalMaxHp = Math.round(scaledMaxHp * eliteMultipliers.hp);
    let finalAtk = Math.round(scaledAtk * eliteMultipliers.atk);
    let finalDef = Math.round(scaledDef * eliteMultipliers.def);
    
    // Apply trust-based difficulty scaling for untrustworthy players
    if (gameState.reputationSystem) {
        const trustModifiers = getTrustDifficultyModifiers(gameState.reputationSystem.factions);
        const strengthMultiplier = trustModifiers.enemyStrengthMultiplier;
        
        if (strengthMultiplier > 1.0) {
            const originalHp = finalMaxHp;
            const originalAtk = finalAtk;
            const originalDef = finalDef;
            
            finalMaxHp = Math.round(finalMaxHp * strengthMultiplier);
            finalAtk = Math.round(finalAtk * strengthMultiplier);
            finalDef = Math.round(finalDef * strengthMultiplier);
            
            const strengthPercent = Math.round((strengthMultiplier - 1) * 100);
            log(` -> Trust penalty applied: Enemy strengthened by ${strengthPercent}% due to poor reputation`);
            log(` -> Stats increased: HP ${originalHp}->${finalMaxHp}, ATK ${originalAtk}->${finalAtk}, DEF ${originalDef}->${finalDef}`);
        }
    }
    
    const enemy = {
        id: generateId('enemy'),
        name: eliteName,
        hp: finalMaxHp,
        maxHp: finalMaxHp,
        atk: finalAtk,
        def: finalDef,
        abilities: eliteAbilities,
        statusEffects: [],
        isDefeated: false,
        lootTier: isElite ? upgradeEliteLootTier(baseEnemy.lootTier) : baseEnemy.lootTier || Config.Tiers.LOW,
        lootChance: clamp((baseEnemy.lootChance || 0.25) * eliteMultipliers.loot, 0, 1),
        resistances: baseEnemy.resistances ? { ...baseEnemy.resistances } : {},
        element: baseEnemy.element || 'Physical',
        statusAttacks: baseEnemy.statusAttacks ? [...baseEnemy.statusAttacks] : [],
        isElite: isElite,
        eliteType: eliteType
    };
    log(` -> Enemy instance created successfully: ID ${enemy.id}`);
    if (isElite) {
        log(` -> Elite variant: ${eliteType} (HP: ${finalMaxHp}, ATK: ${finalAtk}, DEF: ${finalDef})`);
    }
    return enemy;
}

/**
 * Determines the type of elite enemy to create
 * @returns {string} Elite type ('Elite', 'Champion', or 'Legendary')
 */
function determineEliteType() {
    const rand = Math.random();
    if (rand < 0.05) return 'Legendary'; // 5% chance
    if (rand < 0.2) return 'Champion';   // 15% chance
    return 'Elite';                      // 80% chance
}

/**
 * Upgrades loot tier for elite enemies
 * @param {string} baseTier - Base loot tier
 * @returns {string} Upgraded loot tier
 */
function upgradeEliteLootTier(baseTier) {
    const tierOrder = Object.values(Config.Tiers);
    const currentIndex = tierOrder.indexOf(baseTier);
    const upgradeAmount = Math.random() < 0.3 ? 2 : 1; // 30% chance for double upgrade
    const newIndex = Math.min(currentIndex + upgradeAmount, tierOrder.length - 1);
    return tierOrder[newIndex];
}

/**
 * Gets base enemy definitions for a theme using dynamic generation.
 * Uses the dynamic enemy system for contextual enemy creation.
 * @param {string} theme - The adventure theme.
 * @param {number} count - Number of enemies to generate.
 * @param {object} context - Generation context.
 * @returns {object[]} Array of base enemy definitions for the theme.
 */
async function getBaseEnemiesForTheme(theme, count = 1, context = {}) {
    const log = window.displayVisualError || console.log;
    const currentTheme = theme || gameState.adventureTheme || 'fantasy';
    log(`Combat: Generating ${count} dynamic enemies for theme: ${currentTheme}`);
    switch (currentTheme) {
        case 'fantasy':
            return [
                { 
                    name: 'Goblin Grunt', baseHp: 30, baseAtk: 8, baseDef: 3, 
                    abilities: ['Scratch', 'Throw Rock'], lootTier: Config.Tiers.LOW, lootChance: 0.3,
                    resistances: {}, element: 'Physical'
                },
                { 
                    name: 'Orc Brute', baseHp: 60, baseAtk: 12, baseDef: 5, 
                    abilities: ['Smash', 'Roar'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4,
                    resistances: { Fire: 0.2 }, element: 'Physical'
                },
                { 
                    name: 'Dark Mage', baseHp: 40, baseAtk: 15, baseDef: 2, 
                    abilities: ['Shadow Bolt', 'Curse'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.5,
                    resistances: { Dark: 0.5, Holy: -0.5 }, element: 'Dark', statusAttacks: ['Weakness', 'Confusion']
                },
                { 
                    name: 'Giant Spider', baseHp: 45, baseAtk: 10, baseDef: 4, 
                    abilities: ['Bite', 'Web'], lootTier: Config.Tiers.LOW, lootChance: 0.35,
                    resistances: { Poison: 'immune' }, element: 'Poison', statusAttacks: ['Poison', 'Paralysis']
                },
                { 
                    name: 'Fire Elemental', baseHp: 50, baseAtk: 14, baseDef: 3, 
                    abilities: ['Flame Burst', 'Ignite'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.45,
                    resistances: { Fire: 'immune', Ice: -0.5 }, element: 'Fire', statusAttacks: ['Burn']
                },
                { 
                    name: 'Ice Wraith', baseHp: 35, baseAtk: 11, baseDef: 6, 
                    abilities: ['Frost Touch', 'Freeze'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4,
                    resistances: { Ice: 'immune', Fire: -0.5 }, element: 'Ice', statusAttacks: ['Frost', 'Slow']
                },
                { 
                    name: 'Lightning Drake', baseHp: 70, baseAtk: 16, baseDef: 7, 
                    abilities: ['Lightning Breath', 'Thunder Roar'], lootTier: Config.Tiers.HIGH, lootChance: 0.6,
                    resistances: { Lightning: 'immune', Physical: 0.3 }, element: 'Lightning', statusAttacks: ['Paralysis', 'Stun']
                }
            ];
        case 'space':
            return [
                { name: 'Security Bot', baseHp: 45, baseAtk: 10, baseDef: 6, abilities: ['Laser Shot', 'Scan Target', 'Suppressing Fire'], lootTier: Config.Tiers.LOW, lootChance: 0.2 },
                { name: 'Xeno-Scuttler', baseHp: 35, baseAtk: 12, baseDef: 4, abilities: ['Acid Spit', 'Pounce', 'Claw Rake'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Void Pirate', baseHp: 55, baseAtk: 11, baseDef: 5, abilities: ['Plasma Pistol', 'Boarding Hook', 'Intimidate'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.45 },
                { name: 'Asteroid Worm', baseHp: 80, baseAtk: 14, baseDef: 3, abilities: ['Burrow', 'Rock Toss', 'Chomp'], lootTier: Config.Tiers.HIGH, lootChance: 0.2 },
            ];
        case 'pirate':
             return [
                { name: 'Scurvy Dog', baseHp: 35, baseAtk: 9, baseDef: 3, abilities: ['Rusty Cutlass', 'Swig Grog', 'Dirty Kick'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Undead Pirate', baseHp: 50, baseAtk: 10, baseDef: 4, abilities: ['Ghostly Touch', 'Eerie Moan', 'Bone Toss'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4 },
                { name: 'Quartermaster', baseHp: 60, baseAtk: 12, baseDef: 5, abilities: ['Blunderbuss Blast', 'Order Crew', 'Parry'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.5 },
                { name: 'Deckhand Brute', baseHp: 70, baseAtk: 11, baseDef: 6, abilities: ['Belaying Pin Bash', 'Heave Ho!', 'Grab'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.3 },
             ];
        case 'underwater':
            return [
                { name: 'Reef Shark', baseHp: 45, baseAtk: 12, baseDef: 4, abilities: ['Bite', 'Tail Whip', 'Charge'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Giant Octopus', baseHp: 60, baseAtk: 10, baseDef: 6, abilities: ['Tentacle Grab', 'Ink Cloud', 'Constrict'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4 },
                { name: 'Deep Sea Serpent', baseHp: 75, baseAtk: 14, baseDef: 5, abilities: ['Water Jet', 'Electric Shock', 'Swirling Vortex'], lootTier: Config.Tiers.HIGH, lootChance: 0.35 },
                { name: 'Coral Guardian', baseHp: 50, baseAtk: 11, baseDef: 8, abilities: ['Coral Spike', 'Shell Shield', 'Healing Waters'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.45 },
            ];
        case 'jungle':
            return [
                { name: 'Jungle Cat', baseHp: 40, baseAtk: 11, baseDef: 3, abilities: ['Pounce', 'Claw Swipe', 'Stealth'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Poison Dart Frog', baseHp: 25, baseAtk: 13, baseDef: 2, abilities: ['Toxic Dart', 'Poison Cloud', 'Quick Hop'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Jungle Giant', baseHp: 80, baseAtk: 15, baseDef: 7, abilities: ['Tree Throw', 'Ground Slam', 'Vine Whip'], lootTier: Config.Tiers.HIGH, lootChance: 0.4 },
                { name: 'Tribal Warrior', baseHp: 55, baseAtk: 12, baseDef: 5, abilities: ['Spear Throw', 'War Dance', 'Healing Ritual'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.45 },
            ];
        case 'future_utopia':
            return [
                { name: 'Peacekeeper Bot', baseHp: 50, baseAtk: 10, baseDef: 6, abilities: ['Stun Baton', 'Peace Ray', 'Restraint Field'], lootTier: Config.Tiers.LOW, lootChance: 0.25 },
                { name: 'Hologram Guardian', baseHp: 40, baseAtk: 12, baseDef: 4, abilities: ['Light Beam', 'Phase Shift', 'Replicate'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Utopian Elite', baseHp: 65, baseAtk: 14, baseDef: 7, abilities: ['Quantum Strike', 'Reality Warp', 'Mind Control'], lootTier: Config.Tiers.HIGH, lootChance: 0.4 },
                { name: 'System Administrator', baseHp: 45, baseAtk: 13, baseDef: 5, abilities: ['System Override', 'Data Corruption', 'Emergency Protocol'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.45 },
            ];
        case 'dinosaur':
            return [
                { name: 'Raptor Pack', baseHp: 45, baseAtk: 13, baseDef: 4, abilities: ['Pack Attack', 'Claw Strike', 'Pounce'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Triceratops', baseHp: 90, baseAtk: 12, baseDef: 8, abilities: ['Horn Charge', 'Tail Swing', 'Ground Stomp'], lootTier: Config.Tiers.HIGH, lootChance: 0.35 },
                { name: 'T-Rex', baseHp: 120, baseAtk: 18, baseDef: 7, abilities: ['Bone Crush', 'Roar', 'Tail Whip'], lootTier: Config.Tiers.SPECIAL, lootChance: 0.4 },
                { name: 'Pterodactyl', baseHp: 40, baseAtk: 11, baseDef: 3, abilities: ['Dive Bomb', 'Wing Blast', 'Sky Strike'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.3 },
            ];
        case 'arctic':
            return [
                { name: 'Ice Golem', baseHp: 60, baseAtk: 11, baseDef: 7, abilities: ['Ice Shard', 'Frost Nova', 'Freeze'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Arctic Wolf', baseHp: 45, baseAtk: 12, baseDef: 4, abilities: ['Frost Bite', 'Pack Tactics', 'Howl'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Yeti', baseHp: 80, baseAtk: 14, baseDef: 6, abilities: ['Snowball Throw', 'Ice Slam', 'Blizzard'], lootTier: Config.Tiers.HIGH, lootChance: 0.4 },
                { name: 'Frost Giant', baseHp: 100, baseAtk: 15, baseDef: 8, abilities: ['Glacier Strike', 'Frost Shield', 'Ice Storm'], lootTier: Config.Tiers.SPECIAL, lootChance: 0.45 },
            ];
        case 'steampunk':
            return [
                { name: 'Steam Golem', baseHp: 55, baseAtk: 12, baseDef: 6, abilities: ['Steam Blast', 'Gear Grind', 'Pressure Build'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Clockwork Knight', baseHp: 50, baseAtk: 11, baseDef: 7, abilities: ['Spring Strike', 'Time Warp', 'Gear Shield'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4 },
                { name: 'Tesla Coil', baseHp: 40, baseAtk: 14, baseDef: 4, abilities: ['Lightning Arc', 'Energy Surge', 'Overcharge'], lootTier: Config.Tiers.HIGH, lootChance: 0.35 },
                { name: 'Brass Titan', baseHp: 90, baseAtk: 15, baseDef: 8, abilities: ['Cannon Blast', 'Steam Vent', 'Mechanical Overdrive'], lootTier: Config.Tiers.SPECIAL, lootChance: 0.45 },
            ];
        case 'haunted':
            return [
                { name: 'Ghostly Apparition', baseHp: 35, baseAtk: 10, baseDef: 3, abilities: ['Soul Drain', 'Phase Through', 'Haunting Wail'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Skeleton Warrior', baseHp: 45, baseAtk: 11, baseDef: 4, abilities: ['Bone Throw', 'Rattle', 'Skeleton Army'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Poltergeist', baseHp: 40, baseAtk: 13, baseDef: 2, abilities: ['Object Throw', 'Possess', 'Ectoplasm'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4 },
                { name: 'Haunted Knight', baseHp: 70, baseAtk: 14, baseDef: 6, abilities: ['Spectral Blade', 'Curse', 'Dark Aura'], lootTier: Config.Tiers.HIGH, lootChance: 0.45 },
            ];
        case 'cyberpunk':
            return [
                { name: 'Street Thug', baseHp: 45, baseAtk: 10, baseDef: 4, abilities: ['Cyber Fist', 'Stim Shot', 'Hack'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Netrunner', baseHp: 35, baseAtk: 12, baseDef: 3, abilities: ['System Hack', 'Virus Upload', 'Cyber Stun'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Cyber Ninja', baseHp: 50, baseAtk: 13, baseDef: 5, abilities: ['Stealth Strike', 'Nanite Swarm', 'Combat Stims'], lootTier: Config.Tiers.HIGH, lootChance: 0.4 },
                { name: 'Corporate Agent', baseHp: 60, baseAtk: 14, baseDef: 6, abilities: ['Neural Link', 'Corporate Protocol', 'Executive Order'], lootTier: Config.Tiers.SPECIAL, lootChance: 0.45 },
            ];
        case 'wild_west':
            return [
                { name: 'Bandit', baseHp: 40, baseAtk: 9, baseDef: 3, abilities: ['Quick Draw', 'Dirty Shot', 'Dodge'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Sheriff', baseHp: 55, baseAtk: 11, baseDef: 5, abilities: ['Lawbringer', 'Call Posse', 'Justice Strike'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4 },
                { name: 'Gunslinger', baseHp: 45, baseAtk: 13, baseDef: 4, abilities: ['Fan the Hammer', 'Trick Shot', 'Quick Step'], lootTier: Config.Tiers.HIGH, lootChance: 0.35 },
                { name: 'Outlaw Leader', baseHp: 65, baseAtk: 12, baseDef: 6, abilities: ['Gang Tactics', 'Intimidate', 'Last Stand'], lootTier: Config.Tiers.SPECIAL, lootChance: 0.45 },
            ];
        case 'post_apoc':
            return [
                { name: 'Raider', baseHp: 45, baseAtk: 10, baseDef: 4, abilities: ['Scrap Strike', 'Radiation Burst', 'Scavenge'], lootTier: Config.Tiers.LOW, lootChance: 0.3 },
                { name: 'Mutant', baseHp: 60, baseAtk: 12, baseDef: 5, abilities: ['Toxic Claw', 'Radiation Cloud', 'Regenerate'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                { name: 'Survivalist', baseHp: 50, baseAtk: 11, baseDef: 6, abilities: ['Trap', 'First Aid', 'Scout'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.4 },
                { name: 'Wasteland Beast', baseHp: 75, baseAtk: 14, baseDef: 7, abilities: ['Radiation Blast', 'Toxic Bite', 'Pack Tactics'], lootTier: Config.Tiers.HIGH, lootChance: 0.45 },
            ];
        // Cases for other themes deferred
        default: // Generic/Custom fallback
             log(`Combat Warning: No specific enemies defined for theme: ${currentTheme}. Using generic.`);
            return [
                { name: 'Generic Thug', baseHp: 40, baseAtk: 10, baseDef: 4, abilities: ['Punch'], lootTier: Config.Tiers.LOW, lootChance: 0.25 },
                { name: 'Tougher Enemy', baseHp: 70, baseAtk: 13, baseDef: 6, abilities: ['Heavy Strike'], lootTier: Config.Tiers.MEDIUM, lootChance: 0.35 },
                 { name: 'Weak Critter', baseHp: 20, baseAtk: 6, baseDef: 2, abilities: ['Nibble'], lootTier: Config.Tiers.LOW, lootChance: 0.15 },
            ];
    }
}

/**
 * Generates a group of enemies for combat based on theme and difficulty factors.
 * @param {string} theme - The adventure theme.
 * @param {number} turn - Current game turn.
 * @param {number} averagePlayerLevel - Placeholder for player power metric (using turn as proxy).
 * @param {number} [count=1] - Number of enemies to generate.
 * @returns {Enemy[]} An array of generated enemy instances.
 */
export async function generateEnemyGroup(theme, turn, averagePlayerLevel, count = 1) {
    const log = window.displayVisualError || console.log;
    log(`Combat: Generating dynamic enemy group (Count: ${count}) for theme '${theme}', turn ${turn}...`);
    
    // Build context for dynamic generation
    const context = {
        turn: turn,
        averagePlayerLevel: averagePlayerLevel,
        location: gameState.currentLocation,
        storyContext: gameState.currentNarrative?.slice(-200),
        playerCount: gameState.players?.filter(p => !p.isDowned).length || 1
    };
    
    try {
        // Use revolutionary dynamic enemy generation
        const enemies = await getBaseEnemiesForTheme(theme, count, context);
        
        if (enemies && enemies.length > 0) {
            log(`Combat: Generated ${enemies.length} dynamic enemies: ${enemies.map(e => e.name).join(', ')}`);
            return enemies;
        }
    } catch (error) {
        log(`Combat: Dynamic enemy generation failed: ${error.message}`);
    }
    
    // Ultimate fallback
    log(`Combat: Using ultimate fallback for enemy generation`);
    return [{
        id: generateId('enemy'),
        name: 'Mysterious Adversary',
        description: 'A formidable opponent blocks your path.',
        hp: 35,
        maxHp: 35,
        atk: 10,
        def: 4,
        abilities: ['Strike'],
        resistances: {},
        weaknesses: [],
        statusAttacks: [],
        lootTier: Config.Tiers.LOW,
        lootChance: 0.3,
        element: 'Physical',
        isDefeated: false,
        isDynamic: false,
        isFallback: true,
        isUltimateFallback: true
    }];
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

    // Get all valid combatants
    const allCombatants = [
        ...gameState.players.filter(p => p && !p.isDowned),
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

    // Set first turn
    gameState.combat.currentTurnIndex = 0;
    
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
    if (currentTurnChar?.statusEffects?.length > 0) {
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

    // Show whose turn it is
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

    // Process status effects on all combatants
    const allCombatants = [
        ...gameState.players.filter(p => !p.isDowned),
        ...gameState.enemies.filter(e => !e.isDefeated)
    ];

    allCombatants.forEach(char => {
        if (char.statusEffects) {
            char.statusEffects = char.statusEffects.filter(status => {
                if (status.duration <= 0) {
                    log(`Status ${status.name} expired on ${char.name}`);
                    return false;
                }
                // Process status effect
                if (status.onRound) {
                    status.onRound(char);
                }
                status.duration--;
                return true;
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
    const defenseAdvantage = Math.max(0, defender.def - attacker.atk) / attacker.atk;
    accuracy -= defenseAdvantage * 0.1; // Up to 10% accuracy reduction
    
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
    let damage = Math.max(1, attacker.atk - defender.def / 2);
    
    // Apply attacker status effect modifiers
    if (attacker.statusEffects) {
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

    // Handle Confusion (attacker might hit wrong target)
    const confusionEffect = attacker.statusEffects?.find(effect => effect.name === 'Confusion');
    let confusedTarget = false;
    if (confusionEffect && confusionEffect.effectTickData?.randomTarget) {
        if (Math.random() < confusionEffect.effectTickData.randomTarget) {
            confusedTarget = true;
            log(`${attacker.name} is confused and might hit the wrong target!`);
        }
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
        confusedTarget,
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
export function applyStatusEffect(target, effectName, duration, effectData = {}, source = 'Unknown') {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
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
                    effectsChanged = true;
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
export async function handleEnemyDefeat(enemyId) {
     const log = window.displayVisualError || console.log;
     const enemyIndex = gameState.enemies.findIndex(e => e?.id === enemyId);
     if (enemyIndex === -1) {
         log(`Combat Warning: handleEnemyDefeat called for unknown enemy ID ${enemyId}.`);
         return;
     }
     const enemy = gameState.enemies[enemyIndex];

     if (enemy.isDefeated) {
         log(`Combat Info: Enemy ${enemy.name} defeat already processed.`);
         return;
     }

     enemy.isDefeated = true;
     enemy.hp = 0;

     log(`Combat: ${enemy.name} defeated! Processing loot and coins...`);
     showPopup(`${enemy.name} defeated!`, 'success');

     // --- Generate Loot Using Dynamic Item System ---
     log(` -> Generating dynamic loot (Chance: ${enemy.lootChance}, MaxTier: ${enemy.lootTier}, Type: ${enemy.isBoss ? 'Boss' : enemy.isElite ? 'Elite' : 'Regular'})`);
     let lootItem = null;
     try {
         // Check loot drop chance first
         if (Math.random() <= enemy.lootChance) {
             // Import dynamic items system
             const dynamicItems = await import('./dynamicItems.js?cb=014');
             
             if (enemy.isBoss) {
                 // Boss rewards with enhanced luck and tier potential
                 lootItem = await dynamicItems.generateBossRewardItem(
                     gameState.adventureTheme, 
                     enemy.lootTier, 
                     { 
                         name: enemy.name, 
                         bossType: enemy.bossType || 'boss',
                         phase: enemy.currentPhase || 0
                     }
                 );
                 log(` -> Generated boss reward: ${lootItem?.name || 'none'}`);
             } else if (enemy.isElite) {
                 // Elite rewards with moderate luck bonus
                 lootItem = await dynamicItems.generateEliteRewardItem(
                     gameState.adventureTheme, 
                     enemy.lootTier, 
                     { 
                         name: enemy.name, 
                         eliteType: enemy.eliteType || 'elite'
                     }
                 );
                 log(` -> Generated elite reward: ${lootItem?.name || 'none'}`);
             } else {
                 // Regular enemy loot using dynamic system
                 const context = {
                     storyContext: `defeated_${enemy.name.toLowerCase().replace(/\s+/g, '_')}`,
                     playerNeeds: ['equipment_upgrade', 'consumables'],
                     recentEvents: [`defeated_regular_enemy`],
                     isLootDrop: true,
                     luckUpChance: 0.12,    // Slightly better than shop
                     luckDownChance: 0.03   // Low downgrade chance
                 };
                 
                 // Determine item type based on probability
                 const typeRoll = Math.random();
                 let itemType;
                 if (typeRoll < 0.25) itemType = 'Weapon';
                 else if (typeRoll < 0.50) itemType = 'Armor';
                 else if (typeRoll < 0.85) itemType = 'Consumable';
                 else itemType = 'Consumable'; // Default to consumable for misc
                 
                 lootItem = await dynamicItems.generateDynamicItem(
                     gameState.adventureTheme, 
                     enemy.lootTier, 
                     itemType, 
                     context
                 );
                 log(` -> Generated regular loot: ${lootItem?.name || 'none'}`);
             }
         } else {
             log(` -> Loot chance failed (${Math.round(enemy.lootChance * 100)}%)`);
         }
     } catch (e) { 
         log("Combat ERROR generating dynamic loot drop:", e);
         // Fallback to static system if dynamic fails
         try {
             lootItem = generateLootDrop(gameState.adventureTheme, enemy.lootChance, enemy.lootTier);
             log(` -> Fallback to static loot: ${lootItem?.name || 'none'}`);
         } catch (fallbackError) {
             log("Combat ERROR: Both dynamic and static loot generation failed:", fallbackError);
         }
     }

     if (lootItem) {
         log(` -> Generated loot: ${lootItem.name}`);
         let lootRecipient = gameState.players[gameState.currentPlayerIndex];
         if (!lootRecipient || lootRecipient.isDowned) {
             log(` -> Current player downed or invalid. Finding alternative recipient.`);
            lootRecipient = gameState.players.find(p => p && !p.isDowned);
         }

         if (lootRecipient) {
             if (!lootRecipient.inventory) lootRecipient.inventory = [];
             lootRecipient.inventory.push(lootItem);
             showPopup(`${lootRecipient.name} found: ${lootItem.name}!`, 'item');
             log(` -> Loot ${lootItem.name} given to ${lootRecipient.name}`);
             if (gameState.currentScreen === 'inventoryScreen') renderInventory();
         } else {
             log(`Combat Warning: Loot dropped (${lootItem.name}), but no conscious player found to pick it up!`);
             showPopup(`Loot dropped (${lootItem.name}), but no one could pick it up!`, 'warning');
         }
     } else {
         log(" -> No loot generated for this enemy.");
     }

     // --- Generate Spell Rewards for Spellcasters ---
     try {
         const player = gameState.players.find(p => p && !p.isDowned && p.spellcasting);
         if (player && (enemy.isBoss || enemy.isElite || Math.random() < 0.15)) {
             const DynamicSpells = await import('./dynamicSpells.js?cb=014');
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
     const baseCoin = Math.max(1, Math.round(enemy.maxHp / 5));
     const coinDrop = getRandomInt(Math.floor(baseCoin * 0.7), Math.ceil(baseCoin * 1.3));
     log(` -> Calculated coin drop: ${coinDrop} (Base: ${baseCoin})`);

     if (coinDrop > 0) {
          let coinRecipient = gameState.players[gameState.currentPlayerIndex];
          if (!coinRecipient || coinRecipient.isDowned) {
             coinRecipient = gameState.players.find(p => p && !p.isDowned);
          }
          if (coinRecipient) {
              coinRecipient.coins = (coinRecipient.coins || 0) + coinDrop;
              showPopup(`${coinRecipient.name} gained ${coinDrop} coins!`, 'coins');
              log(` -> ${coinDrop} coins given to ${coinRecipient.name}. Total: ${coinRecipient.coins}`);
              renderPlayerCards();
              updateContextHeaders();
          } else {
               log(`Combat Warning: Coins dropped (${coinDrop}), but no conscious player found!`);
          }
     } else {
          log(" -> No coins generated for this enemy.");
     }

     renderEnemyCards();

     // Check if this was the last enemy and trigger combat victory if so
     if (areAllEnemiesDefeated()) {
         log("All enemies defeated after processing this enemy. Triggering combat victory...");
         import('./resolution.js?cb=014').then(resolution => {
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
    
    // Check for boss phase transitions
    if (enemy.isBoss && Bosses.checkBossPhaseTransition(enemy)) {
        Bosses.triggerBossPhaseTransition(enemy);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Extra pause for phase transition
    }
    
    // Update boss ability cooldowns
    if (enemy.isBoss) {
        Bosses.updateBossAbilityCooldowns(enemy);
    }
    
    // Wait a moment before enemy acts for better UX
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get all valid targets (non-downed players)
    const validTargets = gameState.players.filter(p => !p.isDowned);
    if (validTargets.length === 0) {
        log(`No valid targets for ${enemy.name}`);
        return;
    }

    // Boss enemies have a chance to use special abilities
    if (enemy.isBoss && Math.random() < 0.6) { // 60% chance for boss ability
        const abilityResult = await Bosses.executeBossAbility(enemy, validTargets);
        if (abilityResult.success) {
            log(`${enemy.name} used boss ability: ${abilityResult.ability}`);
            
            // Process any post-action effects
            if (enemy.statusEffects?.length > 0) {
                await processStatusEffectTicks(enemy);
            }
            
            // Advance the turn after boss ability
            advanceCombatTurn();
            return;
        }
        // If boss ability failed, fall through to normal attack
    }

    // Select action based on enemy's abilities and state
    const action = await selectEnemyAction(enemy);
    
    // Select target based on action type
    const target = selectEnemyTarget(enemy, action, validTargets);
    
    // Execute the action
    await executeEnemyAction(enemy, action, target);

    // Process any post-action effects
    if (enemy.statusEffects?.length > 0) {
        await processStatusEffectTicks(enemy);
    }

    // Advance the turn
    advanceCombatTurn();
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
    if (Math.random() < specialChance && abilities.length > 1) {
        const specialAbilities = abilities.filter(a => a !== 'Basic Attack');
        
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
        return `${enemy.name} attacks with standard intensity`;
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
    showPopup(`${attackDescription}! Deals ${damageResult.damage} damage${damageResult.isCritical ? ' (Critical Hit!)' : ''}`, 'damage');
    
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
        default:
            log(`Warning: No specific execution for ability: ${ability}`);
            showPopup(abilityDescription, 'special');
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
async function executeAbilityShadowBolt(enemy, target, context, description) {
    const damage = Math.round(enemy.atk * 1.5);
    target.hp = Math.max(0, target.hp - damage);
    
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
    const duration = context.combatState.tacticalAdvantage === 'advantage' ? 3 : 2;
    applyStatusEffect(target, 'Webbed', duration, { 
        isImmobilized: true,
        defMod: -1
    });
    
    showPopup(`${description}! Target is immobilized!`, 'special');
    renderPlayerCards();
}

function processCombatAction(action, player, enemies) {
    const context = determineContext(player);
    // ... rest of the function ...
}