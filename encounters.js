// encounters.js
// Handles encounter generation, probability calculations, and combat initiation

// --- Module Imports ---
import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Bosses from './bosses.js?cb=014';
import * as UI from './ui.js?cb=014';
import { getRandomInt, getRandomElement } from './utils.js?cb=014';
import * as DynamicEncounters from './dynamicEncounters.js?cb=014';
import { getTrustDifficultyModifiers } from './reputationContextualizer.js?cb=014';

/**
 * Main encounter system class
 */
export class EncounterSystem {
    
    /**
     * Checks if an encounter should occur based on current conditions
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {Object|null} Encounter data or null if no encounter
     */
    static async checkForEncounter(location, turn) {
        const log = window.displayVisualError || console.log;

        // Don't trigger encounters if already in combat
        if (gameState.inCombat) {
            return null;
        }

        // Calculate encounter chance based on location and turn
        const encounterChance = this.calculateEncounterChance(location, turn);
        const roll = Math.random();

        log(`Encounter check: ${(roll * 100).toFixed(1)}% vs ${(encounterChance * 100).toFixed(1)}% chance`);

        if (roll < encounterChance) {
            // generateEncounter is async — must await or callers see Promise.
            // Phase 0 audit P1 #10.
            return await this.generateEncounter(location, turn);
        }

        return null;
    }
    
    /**
     * Calculates encounter probability based on various factors
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {number} Encounter chance (0-1)
     */
    static calculateEncounterChance(location, turn) {
        let baseChance = 0.15; // 15% base chance
        
        // Location danger level modifier
        if (location && location.dangerLevel) {
            baseChance += location.dangerLevel * 0.2; // Up to +20% for dangerous areas
        }
        
        // Turn progression modifier (encounters become more likely over time)
        const turnModifier = Math.min(turn * 0.01, 0.1); // Up to +10% after 10 turns
        baseChance += turnModifier;
        
        // Trust-based encounter frequency penalty
        if (gameState.reputationSystem) {
            const trustModifiers = getTrustDifficultyModifiers(gameState.reputationSystem.factions);
            baseChance *= trustModifiers.encounterFrequency;
            
            // Add ambush chance for untrustworthy players
            if (trustModifiers.ambushChance > 0) {
                baseChance += trustModifiers.ambushChance * 0.5; // Additional encounter chance from ambushes
            }
        }
        
        // Location type modifiers
        if (location && location.type) {
            switch (location.type) {
                case 'town':
                case 'city':
                    baseChance *= 0.3; // Much safer in towns
                    break;
                case 'dungeon':
                case 'ruins':
                    baseChance *= 1.5; // More dangerous in dungeons
                    break;
                case 'wilderness':
                case 'forest':
                    baseChance *= 1.2; // Slightly more dangerous in wild areas
                    break;
            }
        }
        
        // Cap at reasonable maximum
        return Math.min(baseChance, 0.4); // Max 40% chance
    }
    
    /**
     * Generates an encounter based on location and conditions
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {Object} Encounter data
     */
    static async generateEncounter(location, turn) {
        const log = window.displayVisualError || console.log;
        log(`Generating encounter for location: ${location?.name || 'Unknown'}, turn: ${turn}`);
        
        // Try dynamic encounter generation first
        try {
            const encounterType = this.determineEncounterType(location);
            
            // Use dynamic encounter system for enhanced encounters
            if (Math.random() < 0.7) { // 70% chance for dynamic encounters
                const context = {
                    location: location,
                    turn: turn,
                    theme: gameState.adventureTheme,
                    storyContext: gameState.currentNarrative?.slice(-200)
                };
                
                const dynamicEncounter = await DynamicEncounters.generateDynamicEncounter(encounterType, context);
                if (dynamicEncounter) {
                    log(`Generated dynamic ${encounterType} encounter: ${dynamicEncounter.id}`);
                    return dynamicEncounter;
                }
            }
        } catch (error) {
            log(`Dynamic encounter generation failed: ${error.message}`);
        }
        
        // Fallback to basic encounter generation
        const encounterType = this.determineEncounterType(location, turn);
        switch (encounterType) {
            case 'boss':
                return await this.generateBossEncounter(location, turn);
            case 'combat':
                return this.generateCombatEncounter(location, turn);
            case 'discovery':
                return this.generateDiscoveryEncounter(location, turn);
            case 'event':
                return this.generateEventEncounter(location, turn);
            default:
                return this.generateCombatEncounter(location, turn);
        }
    }
    
    /**
     * Determines what type of encounter to generate
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {string} Encounter type
     */
    static determineEncounterType(location, turn = gameState.turn || 1) {
        const roll = Math.random();
        
        // Check for boss encounter first
        const bossChance = Bosses.getBossEncounterChance(turn, location);
        if (roll < bossChance) {
            return 'boss';
        }
        
        // Adjust roll for remaining encounter types
        const adjustedRoll = (roll - bossChance) / (1 - bossChance);
        
        // Base probabilities for non-boss encounters (must sum to 1.0).
        // eventChance is the implicit remainder — the final return 'event' catches it.
        let combatChance = 0.6;
        let discoveryChance = 0.25;

        // Adjust based on location type
        if (location && location.type) {
            switch (location.type) {
                case 'town':
                case 'city':
                    combatChance = 0.2;
                    discoveryChance = 0.3;
                    break;
                case 'dungeon':
                case 'ruins':
                    combatChance = 0.8;
                    discoveryChance = 0.15;
                    break;
            }
        }
        
        if (adjustedRoll < combatChance) return 'combat';
        if (adjustedRoll < combatChance + discoveryChance) return 'discovery';
        return 'event';
    }
    
    /**
     * Generates a combat encounter
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {Object} Combat encounter data
     */
    static generateCombatEncounter(location, turn) {
        const log = window.displayVisualError || console.log;
        
        // Check for boss encounter first
        const bossChance = Bosses.getBossEncounterChance(turn, location);
        if (Math.random() < bossChance) {
            return this.generateBossEncounter(location, turn);
        }
        
        // Determine number of enemies (1-3 based on turn and location)
        let enemyCount = 1;
        if (turn > 5) enemyCount = getRandomInt(1, 2);
        if (turn > 10) enemyCount = getRandomInt(1, 3);
        
        // Adjust for location danger
        if (location && location.dangerLevel > 0.7) {
            enemyCount = Math.min(enemyCount + 1, 4);
        }
        
        // Generate enemies using existing system
        const enemies = Combat.generateEnemyGroup(
            gameState.adventureTheme, 
            turn, 
            turn, // Using turn as level proxy
            enemyCount
        );
        
        if (!enemies || enemies.length === 0) {
            log("Failed to generate enemies for combat encounter");
            return null;
        }
        
        log(`Generated combat encounter with ${enemies.length} enemies: ${enemies.map(e => e.name).join(', ')}`);
        
        return {
            type: 'combat',
            enemies: enemies,
            description: this.generateCombatDescription(enemies, location),
            location: location
        };
    }
    
    /**
     * REVOLUTIONARY: Generates a dynamic boss encounter using AI intelligence
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {Promise<Object>} Dynamic boss encounter data
     */
    static async generateBossEncounter(location, turn) {
        const log = window.displayVisualError || console.log;
        log(`Generating dynamic boss encounter for turn ${turn}`);
        
        try {
            // Use revolutionary dynamic encounter system for boss generation
            const bossContext = {
                encounterType: 'boss',
                theme: gameState.adventureTheme,
                location: location,
                turn: turn,
                storyContext: gameState.currentNarrative?.slice(-300),
                playerCount: gameState.players?.filter(p => !p.isDowned).length || 1,
                difficultyTarget: this.calculateBossDifficulty(turn),
                narrativePurpose: 'confrontation'
            };
            
            const dynamicBossEncounter = await DynamicEncounters.generateDynamicEncounter(bossContext);
            
            if (dynamicBossEncounter && dynamicBossEncounter.boss) {
                log(`Generated dynamic boss encounter: ${dynamicBossEncounter.boss.name}`);
                
                // Convert dynamic encounter to combat format
                const enemies = [dynamicBossEncounter.boss];
                
                // Add minions if specified
                if (dynamicBossEncounter.minions && dynamicBossEncounter.minions.length > 0) {
                    enemies.push(...dynamicBossEncounter.minions);
                }
                
                return {
                    type: 'boss_combat',
                    enemies: enemies,
                    boss: dynamicBossEncounter.boss,
                    description: dynamicBossEncounter.description,
                    location: location,
                    isDynamic: true
                };
            }
        } catch (error) {
            log(`Dynamic boss generation failed: ${error.message}`);
        }
        
        // Fallback to static boss generation
        log("Falling back to static boss generation");
        const bossType = Bosses.determineBossType(turn);
        const boss = await Bosses.createBossInstance(bossType, gameState.adventureTheme, turn, { location: location });
        
        if (!boss) {
            log("Failed to create boss instance, falling back to normal encounter");
            return this.generateCombatEncounter(location, turn);
        }
        
        log(`Generated static boss encounter: ${boss.name} (${bossType})`);
        
        // Boss encounters might include minions for higher tier bosses
        const enemies = [boss];
        if (bossType === 'raid_boss' && Math.random() < 0.5) {
            // Add 1-2 regular enemies as minions using dynamic generation
            try {
                const minions = await Combat.generateEnemyGroup(
                    gameState.adventureTheme, 
                    Math.max(1, turn - 5), // Slightly weaker minions
                    turn,
                    getRandomInt(1, 2)
                );
                enemies.push(...minions);
            } catch (error) {
                log(`Failed to generate dynamic minions: ${error.message}`);
            }
        }
        
        return {
            type: 'boss_combat',
            enemies: enemies,
            boss: boss,
            description: this.generateBossDescription(boss, location),
            location: location,
            isDynamic: false,
            isFallback: true
        };
    }
    
    /**
     * Calculate boss difficulty target based on turn and player count
     * @param {number} turn - Current turn number
     * @returns {number} Difficulty target
     */
    static calculateBossDifficulty(turn) {
        const baseDifficulty = turn || 1;
        const playerCount = gameState.players?.filter(p => !p.isDowned).length || 1;
        
        // Boss difficulty scales more aggressively than regular enemies
        let difficultyMultiplier = 1.5; // Base boss multiplier
        
        // Scale with turn progression
        if (turn >= 20) difficultyMultiplier += 0.5; // Major boss territory
        if (turn >= 50) difficultyMultiplier += 1.0; // Raid boss territory
        
        // Adjust for player count
        difficultyMultiplier += (playerCount - 1) * 0.3;
        
        return Math.floor(baseDifficulty * difficultyMultiplier);
    }
    
    /**
     * Generates a discovery encounter (treasure, items, secrets)
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {Object} Discovery encounter data
     */
    static generateDiscoveryEncounter(location, turn) {
        const discoveries = [
            'hidden treasure chest',
            'ancient artifact',
            'secret passage',
            'mysterious inscription',
            'abandoned campsite',
            'hidden cache of supplies'
        ];
        
        const discovery = getRandomElement(discoveries);
        
        return {
            type: 'discovery',
            discovery: discovery,
            description: `You discover a ${discovery}!`,
            location: location
        };
    }
    
    /**
     * Generates an event encounter (NPCs, environmental, story)
     * @param {Object} location - Current location object
     * @param {number} turn - Current turn number
     * @returns {Object} Event encounter data
     */
    static generateEventEncounter(location, turn) {
        const events = [
            'mysterious traveler',
            'strange weather phenomenon',
            'abandoned structure',
            'unusual animal behavior',
            'distant sounds',
            'environmental hazard'
        ];
        
        const event = getRandomElement(events);
        
        return {
            type: 'event',
            event: event,
            description: `You encounter ${event}.`,
            location: location
        };
    }
    
    /**
     * Generates description text for combat encounters
     * @param {Array} enemies - Array of enemy objects
     * @param {Object} location - Current location object
     * @returns {string} Description text
     */
    static generateCombatDescription(enemies, location) {
        const enemyNames = enemies.map(e => e.name).join(' and ');
        const locationDesc = location ? ` in the ${location.name}` : '';
        
        if (enemies.length === 1) {
            return `A ${enemyNames} appears${locationDesc}!`;
        } else {
            return `${enemyNames} appear${locationDesc}!`;
        }
    }
    
    /**
     * Generates description text for boss encounters
     * @param {Object} boss - Boss enemy object
     * @param {Object} location - Current location object
     * @returns {string} Description text
     */
    static generateBossDescription(boss, location) {
        const locationDesc = location ? ` in the ${location.name}` : '';
        const bossTypeDesc = boss.bossType === 'raid_boss' ? 'LEGENDARY ' : 
                           boss.bossType === 'boss' ? 'MIGHTY ' : '';
        
        return `${bossTypeDesc}${boss.name} emerges${locationDesc}! ${boss.description}`;
    }
    
    /**
     * Processes and executes an encounter
     * @param {Object} encounter - Encounter data object
     * @returns {Promise<boolean>} True if encounter was processed successfully
     */
    static async processEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        if (!encounter) {
            return false;
        }
        
        log(`Processing ${encounter.type} encounter`);
        
        // Check if this is a dynamic encounter
        if (encounter.isDynamic) {
            try {
                return await DynamicEncounters.processDynamicEncounter(encounter);
            } catch (error) {
                log(`Dynamic encounter processing failed: ${error.message}`);
                // Fall through to basic processing
            }
        }
        
        // Basic encounter processing
        switch (encounter.type) {
            case 'combat':
                return this.processCombatEncounter(encounter);
            case 'boss_combat':
            case 'boss':
                return this.processBossEncounter(encounter);
            case 'discovery':
                return this.processDiscoveryEncounter(encounter);
            case 'event':
                return this.processEventEncounter(encounter);
            case 'npc':
                return this.processNPCEncounter(encounter);
            case 'puzzle':
                return this.processPuzzleEncounter(encounter);
            case 'anomaly':
                return this.processAnomalyEncounter(encounter);
            default:
                log(`Unknown encounter type: ${encounter.type}`);
                return false;
        }
    }
    
    /**
     * Processes a combat encounter
     * @param {Object} encounter - Combat encounter data
     * @returns {boolean} Success status
     */
    static processCombatEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Add enemies to game state
            gameState.enemies = encounter.enemies;
            
            // Initialize combat system
            const firstActorId = Combat.initializeCombat(encounter.enemies);
            
            if (firstActorId) {
                UI.showPopup(encounter.description, 'damage', 3000);
                log(`Combat encounter processed successfully. First actor: ${firstActorId}`);
                return true;
            } else {
                log("Failed to initialize combat");
                return false;
            }
        } catch (error) {
            log(`Error processing combat encounter: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Processes a boss encounter (enhanced combat with special mechanics)
     * @param {Object} encounter - Boss encounter data
     * @returns {boolean} Success status
     */
    static processBossEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Add enemies to game state
            gameState.enemies = encounter.enemies;
            
            // Mark this as a boss encounter
            gameState.currentBoss = encounter.boss;
            gameState.isBossEncounter = true;
            
            // Initialize combat system
            const firstActorId = Combat.initializeCombat(encounter.enemies);
            
            if (firstActorId) {
                // Special boss encounter popup with dramatic styling
                UI.showPopup(encounter.description, 'boss_encounter', 5000);
                
                // Additional boss encounter setup
                log(`Boss encounter processed successfully: ${encounter.boss.name}`);
                log(`Boss phases: ${encounter.boss.phases?.length || 0}, Abilities: ${encounter.boss.abilities?.length || 0}`);
                
                return true;
            } else {
                log("Failed to initialize boss combat");
                return false;
            }
        } catch (error) {
            log(`Error processing boss encounter: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Processes a discovery encounter
     * @param {Object} encounter - Discovery encounter data
     * @returns {boolean} Success status
     */
    static processDiscoveryEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        // Add to narrative context
        if (!gameState.narrativeContext.discoveredSecrets) {
            gameState.narrativeContext.discoveredSecrets = [];
        }
        
        gameState.narrativeContext.discoveredSecrets.push({
            discovery: encounter.discovery,
            location: encounter.location?.name || 'Unknown',
            turn: gameState.turn
        });
        
        UI.showPopup(encounter.description, 'success', 3000);
        log(`Discovery encounter processed: ${encounter.discovery}`);
        return true;
    }
    
    /**
     * Processes an event encounter
     * @param {Object} encounter - Event encounter data
     * @returns {boolean} Success status
     */
    static processEventEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        // Add to narrative context
        if (!gameState.narrativeContext.significantEvents) {
            gameState.narrativeContext.significantEvents = [];
        }
        
        gameState.narrativeContext.significantEvents.push({
            event: encounter.event,
            location: encounter.location?.name || 'Unknown',
            turn: gameState.turn
        });
        
        UI.showPopup(encounter.description, 'info', 3000);
        log(`Event encounter processed: ${encounter.event}`);
        return true;
    }
    
    /**
     * Processes an NPC encounter (basic fallback)
     * @param {Object} encounter - NPC encounter data
     * @returns {boolean} Success status
     */
    static processNPCEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        UI.showPopup(`You encounter ${encounter.npc?.name || 'someone'}`, 'info', 3000);
        log(`NPC encounter processed: ${encounter.npc?.name || 'Unknown NPC'}`);
        
        return true;
    }
    
    /**
     * Processes a puzzle encounter (basic fallback)
     * @param {Object} encounter - Puzzle encounter data
     * @returns {boolean} Success status
     */
    static processPuzzleEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        UI.showPopup(`You discover ${encounter.puzzle?.name || 'a puzzle'}`, 'info', 3000);
        log(`Puzzle encounter processed: ${encounter.puzzle?.name || 'Unknown Puzzle'}`);
        
        return true;
    }
    
    /**
     * Processes an anomaly encounter (basic fallback)
     * @param {Object} encounter - Anomaly encounter data
     * @returns {boolean} Success status
     */
    static processAnomalyEncounter(encounter) {
        const log = window.displayVisualError || console.log;
        
        UI.showPopup(`${encounter.anomaly?.name || 'Something strange'} occurs!`, 'warning', 4000);
        log(`Anomaly encounter processed: ${encounter.anomaly?.name || 'Unknown Anomaly'}`);
        
        return true;
    }
}

/**
 * Convenience function to check and process encounters
 * Called from action handlers after player actions
 * @returns {Promise<boolean>} True if an encounter occurred
 */
export async function checkAndProcessEncounter() {
    const encounter = await EncounterSystem.checkForEncounter(
        gameState.currentLocation,
        gameState.turn
    );

    if (encounter) {
        return await EncounterSystem.processEncounter(encounter);
    }

    return false;
}
