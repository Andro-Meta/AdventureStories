// state.js
// Defines the central game state object and related helper functions/types.

// --- Module Imports ---
import * as Config from './config.js?cb=014'; // Needs config for initial values
import { generateId } from './utils.js?cb=014'; // Needs ID generation
import { ChoiceOutcomeConfig } from './config.js?cb=014';
// Note: getCurrentPlayer moved to avoid circular dependency

/**
 * Represents the overall state of the game.
 * This object is mutated directly by various modules.
 */
export const gameState = {
    // --- Setup & Meta ---
    // REMOVED: External API keys and provider selection - system uses local AI exclusively
    localAIStatus: 'unknown', // Status of local AI server ('healthy', 'unavailable', 'unknown')
    currentScreen: 'mainMenuScreen', // Tracks the currently visible UI screen ID
    currentSaveSlot: null, // Name of the loaded save slot, if any
    isLoading: false, // Is the game currently waiting for AI or processing?
    handlingPartyWipe: false, // Flag to prevent party wipe recursion
    consecutiveWipes: 0, // Count of party wipes since last combat victory; >=2 triggers game-over screen (Phase 3.5 P5)
    pendingConfirmation: null, // For modal confirmations

    // --- UI State ---
    currentPuzzleBonus: 0, // Bonus for puzzle-solving attempts
    activeModals: [], // Array of currently active modal IDs
    popupQueue: [], // Queue of popups to display
    lastPopupTime: 0, // Timestamp of last popup
    uiUpdatePending: false, // Flag to prevent UI update recursion

    // --- Adventure Core ---
    adventureTheme: 'fantasy', // Default theme
    customThemeDescription: '', // User input for custom theme
    adventureGoal: 'Not set yet.',
    isGoalComplete: false,
    allowCustomActions: false, // Enabled after goal completion
    turn: 1,

    // --- Reputation Economy System ---
    reputationSystem: {
        factions: {
            authority: 0,      // -100 to +100 (Nobles, Empire, Navy, etc.)
            warriors: 0,       // -100 to +100 (Knights, Mercenaries, Buccaneers, etc.)
            naturalists: 0,    // -100 to +100 (Druids, Terraformers, Islanders, etc.)
            shadows: 0,        // -100 to +100 (Rogues, Smugglers, Netrunners, etc.)
            scholars: 0,       // -100 to +100 (Mages, Scientists, Navigators, etc.)
            common: 0          // -100 to +100 (Villagers, Colonists, Settlers, etc.)
        },
        reputationHistory: [], // Track major changes for AI context
        factionConflicts: {
            authorityVsShadows: 0,      // Penalty when both are high
            warriorsVsNaturalists: 0,   // Combat vs nature conflict
            scholarsVsCommon: 0         // Academic vs practical conflict
        },
        worldStateChanges: [], // Track how reputation changed the world
        availableServices: [], // Services unlocked by reputation
        priceModifiers: {      // Current price modifiers by faction
            authority: 1.0,    // Luxury markets
            warriors: 1.0,     // Weapon markets  
            naturalists: 1.0,  // Healing markets
            shadows: 1.0,      // Black markets
            scholars: 1.0,     // Magical markets
            common: 1.0        // Basic services
        },
        lastReputationUpdate: 0, // Turn when reputation was last modified
        contextualizedFactions: null // Cached theme-adapted faction data
    },

    // --- Hierarchical Memory (Tier 3) ---
    // Rolling list of LLM-generated summaries of past adventure arcs, oldest
    // first. Each entry: { turn, summary, generatedAt }. Updated every
    // SUMMARY_EVERY_N_TURNS turns by aiHandler.refreshArcMemory(). Capped at
    // MEMORY_MAX_SUMMARIES; older entries fall off the front. The contents
    // are injected into the system prompt of every AI call so the model
    // remembers what's already happened in the campaign.
    arcMemory: {
        summaries: [],
        // The turn at which the next summary should be generated.
        nextSummaryAtTurn: 5
    },

    // Entity memory — name-keyed dictionaries of NPCs, locations, and
    // memorable items the campaign has surfaced. Populated by the SAME LLM
    // call that produces arc summaries (see schemas.arcMemorySchema). Each
    // entry: { description: string, firstSeenTurn: number, lastSeenTurn: number }.
    // Capped per category; least-recently-seen evicted first.
    entityMemory: {
        npcs: {},
        locations: {},
        items: {}
    },

    // --- Quest Progress System ---
    questProgress: {
        currentPhase: 'beginning', // beginning, exploration, climax, resolution
        completionPercentage: 0, // 0-100
        milestones: [], // Array of completed milestone objects
        currentObjectives: [], // Array of active objective strings
        sideQuests: [], // Array of side quest objects
        discoveredSecrets: [], // Array of discovered lore/secrets
        keyEvents: [], // Array of major story events
        progressHistory: [] // Array of progress snapshots for tracking
    },

    // --- Characters ---
    playerCount: 0, // Set during setup
    players: [], // Array of Player objects, filled during setup
    /** @type {Player[]} */ // JSDoc type hint for players
    enemies: [], // Array of Enemy objects, added during gameplay
    /** @type {Enemy[]} */ // JSDoc type hint for enemies
    currentPlayerIndex: 0, // Index in the players array for the current turn

    // --- Game Flow & History ---
    inCombat: false, // Flag indicating if combat is active
    messageHistory: [], // Array of { role: 'system' | 'user' | 'assistant', content: string }
    currentNarrative: '', // Current story narrative
    currentChoices: [], // Current available choices
    currentLocation: null, // Current location object { name, type, dangerLevel, etc }
    narrativeContext: {
        lastAction: null,
        lastOutcome: null,
        significantEvents: [],
        discoveredSecrets: [],
        relationshipChanges: [],
        environmentalChanges: []
    },

    // --- Intelligent Compression Data ---
    choicePatterns: new Map(), // Player ID -> choice pattern analysis
    relationshipMatrix: new Map(), // Player pair -> relationship data
    playerArchetypes: new Map(), // Player ID -> determined archetype
    storyBeats: [], // Major story moments for compression
    worldStateHistory: [], // World changes over time

    // --- Combat System ---
    combatChoiceTypes: ['Attack', 'Special', 'Item', 'Run'], // Standard combat choices

    // --- Dynamic World Data ---
    shopItems: [], // Array of Item objects currently available in the shop
    
    // --- Dynamic Item System ---
    dynamicItemRegistry: null, // Will be initialized by DynamicItemRegistry
    
    // --- Dynamic Spell System ---
    dynamicSpellRegistry: null, // Will be initialized by DynamicSpellRegistry
    
    // --- Dynamic Encounter System ---
    dynamicEncounterRegistry: null, // Will be initialized by DynamicEncounterRegistry
    
    // --- Dynamic Enemy System ---
    dynamicEnemyRegistry: null, // Will be initialized by DynamicEnemyRegistry
    
    // --- Dynamic Location System ---
    dynamicLocationRegistry: null, // Will be initialized by DynamicLocationRegistry
    
    // --- Story Continuity System ---
    storyContinuityAgent: null, // Will be initialized by StoryContinuityAgent
    
    // --- Character Development System ---
    characterDevelopmentAgent: null, // Will be initialized by CharacterDevelopmentAgent
    
    // --- World Evolution System ---
    worldEvolutionAgent: null, // Will be initialized by WorldEvolutionAgent
    
    // --- Difficulty Adaptation System ---
    difficultyAdaptationAgent: null, // Will be initialized by DifficultyAdaptationAgent
    
    // --- God Mode System ---
    godModeManager: null, // Will be initialized by GodModeManager

    // Enhanced Combat State
    combat: {
        isActive: false,
        round: 0,
        initiative: [], // Array of character IDs in turn order
        currentTurnIndex: 0,
        lastAction: null,
        comboCount: 0,
        activeEffects: [], // Tracks AoE and field effects
        formation: {
            frontLine: [], // Enemy IDs in front
            backLine: []  // Enemy IDs in back
        }
    },
    
    // Boss encounter state
    isBossEncounter: false,
    currentBoss: null,

    // Enhanced Enemy Properties
    enemyTypes: {
        NORMAL: 'normal',
        ELITE: 'elite',
        BOSS: 'boss'
    },

    // Combat Stats Extension
    combatStats: {
        criticalHitChance: 0.1,
        criticalHitMultiplier: 1.5,
        comboMultiplier: 0.2, // 20% damage increase per combo
        maxCombo: 3,
        statusResistances: {}, // Mapped by status effect type
        immunities: [] // List of status effects character is immune to
    }
};

// --- Type Definitions (JSDoc for better IDE support) ---

/**
 * Represents a player character.
 * @typedef {object} Player
 * @property {string} id - Unique identifier (e.g., 'player_timestamp_random').
 * @property {string} name - Player's name.
 * @property {number} age - Player's age.
 * @property {number} hp - Current health points.
 * @property {number} maxHp - Maximum health points.
 * @property {number} mp - Current magic points.
 * @property {number} maxMp - Maximum magic points.
 * @property {number} atk - Calculated attack power (base + equip + effects).
 * @property {number} def - Calculated defense power (base + equip + effects).
 * @property {number} baseAtk - Base attack without equipment/effects.
 * @property {number} baseDef - Base defense without equipment/effects.
 * @property {number} coins - Amount of currency.
 * @property {Item[]} inventory - Array of items the player possesses.
 * @property {{ weapon: string | null, armor: string | null }} equipment - IDs of equipped weapon and armor items found in inventory.
 * @property {SpecialMove[]} specialMoves - Array of known special moves.
 * @property {SpellcastingData} [spellcasting] - Player's spellcasting abilities and known spells.
 * @property {boolean} isDowned - Whether the player is currently downed (HP <= 0).
 * @property {number} downedTurns - Number of turns spent downed consecutively.
 * @property {StatusEffect[]} statusEffects - Array of active status effects.
 */

/**
 * Represents an enemy character.
 * @typedef {object} Enemy
 * @property {string} id - Unique identifier (e.g., 'enemy_timestamp_random').
 * @property {string} name - Enemy's name.
 * @property {number} hp - Current health points.
 * @property {number} maxHp - Maximum health points.
 * @property {number} atk - Enemy's attack power (can be modified by effects).
 * @property {number} def - Enemy's defense power (can be modified by effects).
 * @property {string[]} abilities - List of special ability names enemy might use (AI controls usage).
 * @property {StatusEffect[]} statusEffects - Array of active status effects.
 * @property {boolean} isDefeated - Whether the enemy has been defeated (HP <= 0).
 * @property {keyof Config.Tiers} lootTier - Max tier of loot this enemy can drop.
 * @property {number} lootChance - Base chance (0-1) to drop any loot upon defeat.
 */

/**
 * Represents an item in the game.
 * @typedef {object} Item
 * @property {string} id - Unique identifier (e.g., 'item_timestamp_random' or 'shop_timestamp_random').
 * @property {string} name - Display name of the item.
 * @property {'Consumable' | 'Weapon' | 'Armor' | 'Quest' | 'Misc' | 'Revival'} type - Category of the item. Added Revival type.
 * @property {keyof Config.Tiers} tier - Rarity/power level (e.g., 'Low', 'Medium').
 * @property {string} effect - Text description of the item's effect or lore.
 * @property {object} [stats] - Numerical effects/properties.
 * @property {number} [stats.atk] - Attack bonus (for weapons).
 * @property {number} [stats.def] - Defense bonus (for armor).
 * @property {number} [stats.heal] - Amount of HP restored (for consumables).
 * @property {number} [stats.healPercent] - Percentage of Max HP restored (for consumables).
 * @property {boolean} [stats.revive] - Flag indicating item can revive (for consumables).
 * @property {string} [stats.cure] - What status effect(s) it cures ('Poison', 'All', 'Mental', etc.).
 * @property {string} [stats.applyStatus] - Name of status effect to apply on use.
 * @property {number} [stats.duration] - Duration for applied status effect.
 * @property {number} [stats.atkMod] - Flat ATK modifier for applied status effect.
 * @property {number} [stats.defMod] - Flat DEF modifier for applied status effect.
 * @property {number} [stats.atkMultiplier] - Multiplier applied to ATK (e.g., 1.2 for +20%).
 * @property {number} [stats.defMultiplier] - Multiplier applied to DEF (e.g., 0.8 for -20%).
 * @property {number} [quantity] - Stack size (mainly for consumables).
 * @property {number} [cost] - Purchase price (only relevant for shop items or maybe sell value).
 * @property {'weapon' | 'armor' | null} [equippedSlot] - If equipped by a player, indicates the slot. Null otherwise.
 */

/**
 * Represents a special move or ability.
 * @typedef {object} SpecialMove
 * @property {string} id - Unique identifier.
 * @property {string} name - Display name of the move.
 * @property {string} effect - Text description of the move's effect (used by AI and potentially parser).
 * @property {number} cooldown - Total turns required for cooldown after use.
 * @property {number} currentCooldown - Remaining turns on cooldown (0 if ready).
 * @property {number} [mpCost] - MP cost to use this ability (0 if no cost).
 * @property {'combat' | 'exploration' | 'both'} usageContext - Where the move can be used.
 * @property {object} mechanics - Mechanical effects of the move.
 * @property {number} [mechanics.damage] - Base damage in combat.
 * @property {number} [mechanics.healing] - Base healing amount.
 * @property {string[]} [mechanics.statusEffects] - Status effects that can be applied.
 * @property {object} [mechanics.exploration] - Effects specific to exploration.
 * @property {string[]} [mechanics.exploration.obstacleTypes] - Types of obstacles this move can overcome.
 * @property {number} [mechanics.exploration.puzzleBonus] - Bonus to puzzle-solving attempts.
 * @property {string} [mechanics.exploration.environmentalEffect] - Effect on the environment.
 */

/**
 * Represents an active status effect on a character.
 * @typedef {object} StatusEffect
 * @property {string} id - Unique identifier for this specific instance of the effect.
 * @property {string} name - Name of the status effect (e.g., 'Poison', 'Regen', 'Attack Up').
 * @property {number} duration - Remaining turns for the effect (decremented each turn).
 * @property {object} [effectTickData] - Data defining the effect per turn or static modifiers.
 * @property {number} [effectTickData.hpPerTurn] - HP change applied each tick (+ for heal, - for damage).
 * @property {number} [effectTickData.atkMod] - Flat modifier added to base ATK.
 * @property {number} [effectTickData.defMod] - Flat modifier added to base DEF.
 * @property {number} [effectTickData.atkMultiplier] - Multiplier applied to ATK (e.g., 1.2 for +20%, 0.8 for -20%).
 * @property {number} [effectTickData.defMultiplier] - Multiplier applied to DEF.
 * @property {string} [source] - Optional: ID or name of the character/item/move that applied the effect.
 */

/**
 * Determines the current context of the game based on player state and environment.
 * This is the centralized context determination function used across all modules.
 * @param {Player} player - The current player object
 * @returns {Object} Comprehensive context object
 */
export function determineContext(player) {
    const log = window.displayVisualError || console.log;
    if (!player) {
        log('Warning: determineContext called without player');
        player = getCurrentPlayer();
        if (!player) {
            log('Warning: No current player available, returning default context');
            return {
                situation: 'exploration',
                environment: 'safe',
                timeOfDay: 'day',
                weather: 'clear',
                location: 'unknown',
                combatState: { isActive: false, enemyCount: 0, threatLevel: 'normal', tacticalAdvantage: 'neutral', playerCondition: 'healthy', enemyCondition: 'healthy' },
                characterState: ['initializing'],
                gameState: [],
                recentEvents: [],
                difficulty: 'normal'
            };
        }
    }
    
    // Additional safety check for player properties
    if (!player.hp || !player.maxHp || player.coins === undefined) {
        log('Warning: Player object missing required properties, using defaults');
        // Ensure player has minimum required properties
        player.hp = player.hp || 100;
        player.maxHp = player.maxHp || 100;
        player.coins = player.coins || 50;
    }
    
    // Base context object
    const context = {
        situation: 'exploration',    // exploration, combat, social, puzzle
        environment: 'safe',         // safe, dangerous, mysterious, urban
        timeOfDay: gameState.timeOfDay || 'day',           // day, night
        weather: gameState.weather || 'clear',           // clear, stormy, foggy
        location: gameState.currentLocation?.name || 'unknown',
        combatState: {
            isActive: gameState.inCombat,
            enemyCount: 0,
            threatLevel: 'normal',   // low, normal, high, extreme
            tacticalAdvantage: 'neutral', // advantage, disadvantage, neutral
            playerCondition: 'healthy', // healthy, injured, critical
            enemyCondition: 'healthy'  // healthy, injured, critical
        },
        characterState: [],       // Array of applicable states
        modifiers: {}            // Calculated modifiers for outcomes
    };

    // Determine situation
    if (gameState.inCombat) {
        context.situation = 'combat';
    } else if (gameState.currentLocation?.type === 'town' || 
               gameState.currentLocation?.type === 'inn') {
        context.situation = 'social';
    } else if (gameState.currentLocation?.type === 'puzzle' ||
               gameState.currentPuzzle) {
        context.situation = 'puzzle';
    }

    // Determine environment based on location and danger level
    if (gameState.currentLocation?.dangerLevel > 0.7) {
        context.environment = 'dangerous';
    } else if (gameState.currentLocation?.type === 'ruins' || 
               gameState.currentLocation?.type === 'temple') {
        context.environment = 'mysterious';
    } else if (gameState.currentLocation?.type === 'town' || 
               gameState.currentLocation?.type === 'city') {
        context.environment = 'urban';
    }

    // Enhanced combat context analysis
    if (gameState.inCombat) {
        const activeEnemies = gameState.enemies?.filter(e => !e.isDefeated) || [];
        context.combatState.enemyCount = activeEnemies.length;

        // Analyze threat level
        let totalEnemyPower = activeEnemies.reduce((sum, enemy) => 
            sum + (enemy.atk + enemy.def + enemy.hp/2), 0);
        let playerPower = player.atk + player.def + player.hp/2;
        
        // Determine threat level based on power ratio
        let powerRatio = totalEnemyPower / playerPower;
        if (powerRatio <= 0.5) context.combatState.threatLevel = 'low';
        else if (powerRatio <= 1.0) context.combatState.threatLevel = 'normal';
        else if (powerRatio <= 2.0) context.combatState.threatLevel = 'high';
        else context.combatState.threatLevel = 'extreme';

        // Analyze tactical advantage
        let tacticalFactors = 0;
        // Player has advantage if they have more HP percentage
        if (player.hp/player.maxHp > 0.7) tacticalFactors++;
        if (activeEnemies.some(e => e.hp/e.maxHp < 0.3)) tacticalFactors++;
        // Consider status effects
        if (player.statusEffects?.some(effect => 
            effect.name.toLowerCase().includes('strengthen') || 
            effect.name.toLowerCase().includes('protect'))) tacticalFactors++;
        if (activeEnemies.some(e => e.statusEffects?.some(effect =>
            effect.name.toLowerCase().includes('weaken') ||
            effect.name.toLowerCase().includes('vulnerable')))) tacticalFactors++;

        context.combatState.tacticalAdvantage = 
            tacticalFactors >= 2 ? 'advantage' :
            tacticalFactors <= -2 ? 'disadvantage' : 'neutral';

        // Analyze conditions
        context.combatState.playerCondition = 
            player.hp/player.maxHp > 0.7 ? 'healthy' :
            player.hp/player.maxHp > 0.3 ? 'injured' : 'critical';

        const averageEnemyHealth = activeEnemies.reduce((sum, e) => 
            sum + e.hp/e.maxHp, 0) / activeEnemies.length;
        context.combatState.enemyCondition = 
            averageEnemyHealth > 0.7 ? 'healthy' :
            averageEnemyHealth > 0.3 ? 'injured' : 'critical';
    }

    // Determine character states
    if (player.hp < player.maxHp * 0.3) {
        context.characterState.push('wounded');
    } else if (player.hp > player.maxHp * 0.8) {
        context.characterState.push('healthy');
    }

    if (player.coins > 1000) {
        context.characterState.push('rich');
    } else if (player.coins < 100) {
        context.characterState.push('poor');
    }

    // Calculate outcome modifiers based on context
    context.modifiers = calculateContextModifiers(context);

    return context;
}

/**
 * Calculates outcome modifiers based on context
 * @param {Object} context - The current context
 * @returns {Object} Calculated modifiers
 */
export function calculateContextModifiers(context) {
    const modifiers = {
        physical: {},
        resource: {},
        narrative: {}
    };

    // Apply situation modifiers
    const situationMods = ChoiceOutcomeConfig.contextModifiers.situations[context.situation];
    if (situationMods) {
        Object.assign(modifiers, situationMods);
    }

    // Apply environment modifiers
    const envMods = ChoiceOutcomeConfig.contextModifiers.environment[context.environment];
    if (envMods) {
        Object.assign(modifiers, envMods);
    }

    // Apply character state modifiers
    context.characterState.forEach(state => {
        const stateMods = ChoiceOutcomeConfig.contextModifiers.characterState[state];
        if (stateMods) {
            Object.assign(modifiers, stateMods);
        }
    });

    return modifiers;
}

/**
 * Resets the game state to its initial values for a new game.
 * Preserves the API keys array and index.
 */
export function resetGameState() {
    const log = window.displayVisualError || console.log;
    log("State: Resetting game state...");

    // Preserve setup data across the reset (the only legitimate carry-over —
    // the player just typed names/ages and is mid-flow). External-API keys
    // (apiKeys, currentApiKeyIndex, geminiApiKey, selectedGoogleModel,
    // apiProvider) used to be preserved here; they were removed in Tier 1's
    // dead-code purge alongside the OpenRouter / AI Studio integrations.
    const preservedPlayerCount = gameState.playerCount || 0;
    const preservedPlayerAges = gameState.playerAges ? [...gameState.playerAges] : [];
    const preservedPlayerNames = gameState.playerNames ? [...gameState.playerNames] : [];
    // BUG FIX (2026-04-30): adventureTheme + customThemeDescription used to be
    // wiped by this reset, which clobbered the player's actual theme choice
    // (set in setup.proceedToAgeInput) right before initialization rebuilt
    // gameState. Symptom: user picks "Dinosaur Times", game launches as
    // Fantasy. Preserve them alongside the other setup data.
    const preservedAdventureTheme = gameState.adventureTheme || 'fantasy';
    const preservedCustomThemeDescription = gameState.customThemeDescription || '';

    Object.keys(gameState).forEach(key => {
        if (key !== 'playerCount' && key !== 'playerAges' && key !== 'playerNames'
            && key !== 'adventureTheme' && key !== 'customThemeDescription') {
            delete gameState[key];
        }
    });

    Object.assign(gameState, {
        currentScreen: 'mainMenuScreen',
        currentSaveSlot: null,
        isLoading: false,
        handlingPartyWipe: false,
        consecutiveWipes: 0,
        pendingConfirmation: null,
        adventureTheme: preservedAdventureTheme,
        customThemeDescription: preservedCustomThemeDescription,
        adventureGoal: 'Not set yet.',
        isGoalComplete: false,
        allowCustomActions: false,
        turn: 1,
        playerCount: preservedPlayerCount,
        playerAges: preservedPlayerAges,
        playerNames: preservedPlayerNames,
        players: [],
        enemies: [],
        currentPlayerIndex: 0,
        inCombat: false,
        messageHistory: [],
        shopItems: [],
        // UI bookkeeping — these MUST be present or showModal crashes
        // ("Cannot read properties of undefined (reading 'includes')").
        // Regression introduced when Tier 1 cleanup tightened the preserved
        // key allowlist; restored here.
        activeModals: [],
        popupQueue: [],
        lastPopupTime: 0,
        uiUpdatePending: false,
        currentPuzzleBonus: 0,
    });

    log("State: Game state reset complete (setup data preserved).");
}

/**
 * Creates a new player object with default values.
 * Called during setup.
 * @param {string} name - Player's name.
 * @param {number} age - Player's age.
 * @returns {Player} The new player object.
 */
export function createNewPlayer(name, age) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
    log(`State: Creating new player object for Name: ${name}, Age: ${age}`);
    const player = {
        id: generateId('player'),
        name: name,
        age: parseInt(age, 10) || 10,
        hp: Config.INITIAL_HP,
        maxHp: Config.INITIAL_HP,
        mp: Config.INITIAL_MP,
        maxMp: Config.INITIAL_MP,
        atk: Config.BASE_ATK,
        def: Config.BASE_DEF,
        baseAtk: Config.BASE_ATK,
        baseDef: Config.BASE_DEF,
        coins: Config.INITIAL_COINS,
        inventory: [],
        equipment: { weapon: null, armor: null },
        specialMoves: [],
        spellcasting: null, // Will be initialized by spells.js
        isDowned: false,
        downedTurns: 0,
        statusEffects: [],
    };
    log(`State: Player created with ID: ${player.id}`);
    return player;
}

/**
 * Gets the player object for the current turn. Includes basic validation.
 * Moved from turnManager.js to avoid circular dependency.
 */
export function getCurrentPlayer() {
    const log = window.displayVisualError || console.log;
    if (!gameState.players || gameState.players.length === 0) {
        log("getCurrentPlayer: No players array exists.");
        return null;
    }
    const index = gameState.currentPlayerIndex;
    if (index < 0 || index >= gameState.players.length) {
        log(`getCurrentPlayer: Invalid index ${index} for player count ${gameState.players.length}. Resetting to 0.`);
        gameState.currentPlayerIndex = 0; // Attempt recovery
        return gameState.players[0] || null;
    }
    const player = gameState.players[index];
    if (!player) {
        log(`getCurrentPlayer: Player object at index ${index} is null or undefined.`);
        // Try to find the next valid player if current is invalid
        for(let i=1; i < gameState.players.length; i++) {
            const nextIndex = (index + i) % gameState.players.length;
            if(gameState.players[nextIndex]) {
                log(`Recovered to player index ${nextIndex}.`);
                gameState.currentPlayerIndex = nextIndex;
                return gameState.players[nextIndex];
            }
        }
        // If no valid player found at all
        log(`CRITICAL: No valid player objects found in the players array.`);
        return null;
    }
    return player;
}

/**
 * Initializes game state with proper default values
 */
export async function initializeGameState() {
    const log = window.displayVisualError || console.log;
    log("State: Initializing game state with default values...");
    
    // Initialize location
    gameState.currentLocation = {
        name: 'Starting Area',
        type: 'town',
        dangerLevel: 0.1,
        description: 'A safe starting location for new adventurers.'
    };
    
    // Ensure choices array exists
    if (!gameState.currentChoices) {
        gameState.currentChoices = [];
    }
    
    // Ensure narrative context exists
    if (!gameState.narrativeContext) {
        gameState.narrativeContext = {
            lastAction: null,
            lastOutcome: null,
            significantEvents: [],
            discoveredSecrets: [],
            relationshipChanges: [],
            environmentalChanges: []
        };
    }
    
    // Initialize intelligent compression data structures
    if (!gameState.choicePatterns) gameState.choicePatterns = new Map();
    if (!gameState.relationshipMatrix) gameState.relationshipMatrix = new Map();
    if (!gameState.playerArchetypes) gameState.playerArchetypes = new Map();
    if (!gameState.storyBeats) gameState.storyBeats = [];
    if (!gameState.worldStateHistory) gameState.worldStateHistory = [];
    
    // Initialize reputation system contextualized factions
    if (gameState.reputationSystem && !gameState.reputationSystem.contextualizedFactions) {
        try {
            const { getContextualizedFactions, calculatePriceModifiers } = await import('./reputationContextualizer.js?cb=014');
            gameState.reputationSystem.contextualizedFactions = getContextualizedFactions();
            gameState.reputationSystem.priceModifiers = calculatePriceModifiers(gameState.reputationSystem.factions);
            log("State: Reputation system contextualized factions initialized for theme:", gameState.adventureTheme);
        } catch (error) {
            log("State: Warning - Could not initialize reputation system contextualized factions:", error.message);
        }
    }
    
    log("State: Game state initialization complete with intelligent compression tracking and reputation system.");
}

/**
 * Synchronizes combat and exploration turn states
 */
export function syncTurnStates() {
    const log = window.displayVisualError || console.log;
    
    if (gameState.inCombat && gameState.combat.isActive) {
        // In combat - use combat turn system
        log("State: Using combat turn system");
        return 'combat';
    } else if (gameState.inCombat && !gameState.combat.isActive) {
        // Combat ended but flag not cleared - fix inconsistency
        log("State: Fixing combat state inconsistency");
        gameState.inCombat = false;
        return 'exploration';
    } else {
        // Normal exploration
        return 'exploration';
    }
}

/**
 * Checks if the current player can perform actions
 */
export function canCurrentPlayerAct() {
    const player = getCurrentPlayer();
    if (!player) return false;
    if (player.isDowned) return false;
    if (gameState.isLoading) return false;
    return true;
}

/**
 * INTELLIGENT COMPRESSION HELPER FUNCTIONS
 */

/**
 * Records a player choice for pattern analysis
 */
export function recordPlayerChoice(playerId, choiceType, choiceText, outcome, significance = 0.3) {
    if (!gameState.choicePatterns.has(playerId)) {
        gameState.choicePatterns.set(playerId, []);
    }
    
    const choice = {
        turn: gameState.turn,
        type: choiceType,
        text: choiceText,
        outcome: outcome,
        significance: significance,
        timestamp: Date.now()
    };
    
    gameState.choicePatterns.get(playerId).push(choice);
    
    // Keep only the last 50 choices per player to prevent memory bloat
    const choices = gameState.choicePatterns.get(playerId);
    if (choices.length > 50) {
        choices.splice(0, choices.length - 50);
    }
}

/**
 * Records a relationship change between players
 */
export function recordRelationshipChange(player1Id, player2Id, changeType, magnitude, description) {
    const relationshipKey = [player1Id, player2Id].sort().join('_');
    
    if (!gameState.relationshipMatrix.has(relationshipKey)) {
        gameState.relationshipMatrix.set(relationshipKey, {
            players: [player1Id, player2Id],
            history: [],
            currentStatus: 'neutral',
            trustLevel: 0.5
        });
    }
    
    const relationship = gameState.relationshipMatrix.get(relationshipKey);
    relationship.history.push({
        turn: gameState.turn,
        type: changeType,
        magnitude: magnitude,
        description: description,
        timestamp: Date.now()
    });
    
    // Update current status based on recent changes
    const recentChanges = relationship.history.slice(-5);
    const avgMagnitude = recentChanges.reduce((sum, change) => sum + change.magnitude, 0) / recentChanges.length;
    
    if (avgMagnitude > 0.3) relationship.currentStatus = 'positive';
    else if (avgMagnitude < -0.3) relationship.currentStatus = 'negative';
    else relationship.currentStatus = 'neutral';
    
    relationship.trustLevel = Math.max(0, Math.min(1, relationship.trustLevel + magnitude));
}

/**
 * Records a major story beat for compression
 */
export function recordStoryBeat(type, description, significance, involvedPlayers = []) {
    const storyBeat = {
        turn: gameState.turn,
        type: type, // 'discovery', 'conflict', 'resolution', 'character_development', etc.
        description: description,
        significance: significance, // 0.0 to 1.0
        involvedPlayers: involvedPlayers,
        location: gameState.currentLocation?.name || 'Unknown',
        timestamp: Date.now()
    };
    
    gameState.storyBeats.push(storyBeat);
    
    // Keep only the most significant story beats (max 100)
    if (gameState.storyBeats.length > 100) {
        gameState.storyBeats.sort((a, b) => b.significance - a.significance);
        gameState.storyBeats = gameState.storyBeats.slice(0, 100);
    }
}

/**
 * Records a world state change for compression
 */
export function recordWorldStateChange(changeType, description, location, impact) {
    const worldChange = {
        turn: gameState.turn,
        type: changeType, // 'political', 'environmental', 'economic', 'social', etc.
        description: description,
        location: location,
        impact: impact, // 'local', 'regional', 'global'
        timestamp: Date.now()
    };
    
    gameState.worldStateHistory.push(worldChange);
    
    // Keep only the last 50 world changes to prevent memory bloat
    if (gameState.worldStateHistory.length > 50) {
        gameState.worldStateHistory.shift();
    }
}

/**
 * Gets player choice patterns for analysis
 */
export function getPlayerChoicePatterns(playerId) {
    return gameState.choicePatterns.get(playerId) || [];
}

/**
 * Gets relationship data between two players
 */
export function getPlayerRelationship(player1Id, player2Id) {
    const relationshipKey = [player1Id, player2Id].sort().join('_');
    return gameState.relationshipMatrix.get(relationshipKey) || null;
}

/**
 * Gets all story beats above a certain significance threshold
 */
export function getSignificantStoryBeats(minSignificance = 0.5) {
    return gameState.storyBeats.filter(beat => beat.significance >= minSignificance);
}

/**
 * Gets recent world state changes
 */
export function getRecentWorldChanges(maxAge = 20) {
    const cutoffTurn = gameState.turn - maxAge;
    return gameState.worldStateHistory.filter(change => change.turn >= cutoffTurn);
}

/**
 * Analyzes player behavior patterns for archetype determination
 */
export function analyzePlayerBehavior(playerId) {
    const choices = getPlayerChoicePatterns(playerId);
    if (choices.length === 0) return null;
    
    const patterns = {
        riskTolerance: 0,
        moralAlignment: 0,
        socialStyle: 0,
        problemSolving: 0,
        leadership: 0
    };
    
    choices.forEach(choice => {
        switch (choice.type) {
            case 'Good':
                patterns.moralAlignment += 0.2;
                patterns.riskTolerance -= 0.1;
                break;
            case 'Bad':
                patterns.moralAlignment -= 0.2;
                patterns.riskTolerance += 0.3;
                break;
            case 'Risky':
                patterns.riskTolerance += 0.2;
                patterns.problemSolving += 0.1;
                break;
            case 'Silly':
                patterns.problemSolving += 0.3;
                patterns.socialStyle += 0.1;
                break;
            case 'Investigative':
                patterns.problemSolving += 0.2;
                patterns.riskTolerance -= 0.1;
                break;
        }
        
        // Analyze choice text for additional patterns
        const text = choice.text.toLowerCase();
        if (text.includes('help') || text.includes('team') || text.includes('together')) {
            patterns.socialStyle += 0.1;
        }
        if (text.includes('lead') || text.includes('decide') || text.includes('command')) {
            patterns.leadership += 0.1;
        }
    });
    
    // Normalize patterns
    Object.keys(patterns).forEach(key => {
        patterns[key] = Math.max(-1, Math.min(1, patterns[key]));
    });
    
    return patterns;
}