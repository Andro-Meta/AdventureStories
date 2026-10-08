// state.js
// Defines the central game state object and related helper functions/types.

// --- Module Imports ---
import * as Config from './config.js'; // Needs config for initial values
import { generateId } from './utils.js';// Note: getCurrentPlayer moved to avoid circular dependency

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
    storyLog: [], // every scene shown, in order, for the re-readable story book
    storyThreads: [], // setups owed a payoff: { text, turn, resolved }
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

/**
 * Build a compact game-state context block for AI data generators.
 * Gives spell/item/enemy/encounter generators the same grounding the narrative
 * AI has (player state, inventory, spells, quests, NPCs, story flags) without
 * the narrative-format rules and age guidelines that belong only in the story
 * narrator system prompt.
 *
 * All dynamic-content modules (spells.js, dynamicItems.js, dynamicEnemies.js,
 * etc.) import this and prepend it to their prompts so generated content stays
 * coherent with the running campaign.
 *
 * @returns {string} Plain-text context block, or '' if no player exists yet.
 */
export function buildGameContextBlock() {
    const p = (gameState.players || [])[gameState.currentPlayerIndex || 0];
    if (!p) return '';

    const turn = gameState.turn || 1;
    const rawTheme = gameState.adventureTheme || 'fantasy';
    const theme = rawTheme === 'custom'
        ? (gameState.customThemeDescription || 'custom')
        : rawTheme;

    // Player headline
    const playerLine = `${p.name} | HP ${p.hp}/${p.maxHp} | MP ${p.mp ?? '?'}/${p.maxMp ?? '?'} | ATK ${p.atk} | DEF ${p.def} | Coins ${p.coins ?? 0}`;

    // Party (excluding current player)
    const partyLine = (gameState.players || [])
        .filter(pl => pl && pl !== p)
        .map(pl => `${pl.name} HP:${pl.hp}/${pl.maxHp}${pl.isDowned ? '(downed)' : ''}`)
        .join(', ');

    // Equipped items resolved to names
    const equip = p.equipment || {};
    const inv = p.inventory || [];
    const weaponName = equip.weapon ? (inv.find(it => it?.id === equip.weapon)?.name ?? null) : null;
    const armorName  = equip.armor  ? (inv.find(it => it?.id === equip.armor )?.name ?? null) : null;
    const equipLine  = [weaponName && `weapon:${weaponName}`, armorName && `armor:${armorName}`].filter(Boolean).join(', ') || 'none';

    // Unequipped inventory
    const unequippedNames = inv
        .filter(it => it && it.id !== equip.weapon && it.id !== equip.armor)
        .map(it => it.name)
        .filter(Boolean)
        .slice(0, 8);
    const inventoryLine = unequippedNames.length ? unequippedNames.join(', ') : 'none';

    // Known spells
    const knownSpellNames = (p.spellcasting?.knownSpells || []).map(s => s.name).filter(Boolean).slice(0, 8);
    const spellsLine = knownSpellNames.length ? knownSpellNames.join(', ') : 'none';

    // Active quests
    const questParts = [];
    if (gameState.adventureGoal && !gameState.isGoalComplete) {
        const pct = gameState.questProgress?.completionPercentage ?? 0;
        questParts.push(`main quest "${gameState.adventureGoal.slice(0, 60)}" (${pct}% done)`);
    }
    (gameState.questProgress?.sideQuests || [])
        .filter(q => !q.completed)
        .slice(0, 3)
        .forEach(q => questParts.push(`side:"${q.name}"`));

    // Recent milestones
    const recentMilestones = (gameState.questProgress?.milestones || [])
        .slice(-3)
        .map(m => m.name)
        .join(' → ') || 'none yet';

    // Recent significant events
    const recentEvents = (gameState.narrativeContext?.significantEvents || [])
        .slice(-3)
        .join('; ') || 'none';

    // NPCs from entity memory (most recently seen)
    const knownNPCs = Object.entries(gameState.entityMemory?.npcs || {})
        .sort(([, a], [, b]) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0))
        .slice(0, 6)
        .map(([name, data]) => `${name}${data.description ? ` (${data.description.slice(0, 40)})` : ''}`)
        .join(', ') || 'none recorded';

    // Story flags (truthy only)
    const flags = Object.entries(gameState.storyFlags || {})
        .filter(([, v]) => v === true)
        .slice(0, 8)
        .map(([k]) => k)
        .join(', ') || 'none';

    const location = gameState.currentLocation?.name || 'unknown';
    const narrativeExcerpt = gameState.currentNarrative
        ? gameState.currentNarrative.slice(-250)
        : '';

    let block = `=== CURRENT GAME STATE (Turn ${turn} | Theme: ${theme}) ===
Location: ${location}
Player: ${playerLine}
Equipped: ${equipLine}
Inventory: ${inventoryLine}
Known Spells/Abilities: ${spellsLine}`;

    if (partyLine) block += `\nParty: ${partyLine}`;

    block += `
Quests: ${questParts.join('; ') || 'none active'}
Recent Milestones: ${recentMilestones}
Recent Events: ${recentEvents}
Known NPCs: ${knownNPCs}
Story Flags: ${flags}`;

    if (narrativeExcerpt) {
        block += `\nCurrent Story (excerpt): "${narrativeExcerpt}"`;
    }

    block += '\n=== END GAME STATE ===\n';
    return block;
}

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



    return context;
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

    // BUG-07 fix: prior reassignment was missing entityMemory, arcMemory,
    // questProgress, narrativeContext, reputationSystem, combat, currentLocation,
    // currentChoices, etc. Any flow that resets-then-plays (Exit-without-save
    // → New Adventure) crashed on the first AI turn with "Cannot read
    // properties of undefined". Now we rebuild EVERY top-level key the live
    // system depends on — keep this in sync with the gameState literal at the
    // top of this file.
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
        // Story / quest progression — narrator + engine read these every turn.
        currentChoices: [],
        currentLocation: null,
        currentNarrative: '',
        storyLog: [],
        storyThreads: [],
        questProgress: {
            currentPhase: 'beginning', completionPercentage: 0,
            milestones: [], currentObjectives: [], sideQuests: [],
            discoveredSecrets: [], keyEvents: [], progressHistory: []
        },
        timeOfDay: 'morning', weather: 'clear', recentTurns: [], // advanced per round by turnManager.advanceWorldClock
        // Same shape as the initial gameState above; actionHandler reads these arrays on turn 1.
        narrativeContext: {
            lastAction: null, lastOutcome: null,
            significantEvents: [], discoveredSecrets: [],
            relationshipChanges: [], environmentalChanges: []
        },
        // Hierarchical memory (Tier 3) — referenced by aiHandler/memoryRetriever.
        arcMemory: { summaries: [], lastSummarizedTurn: 0, nextSummaryAtTurn: 5 }, // same as initial state; was missing, so the first summary call fired on turn 2
        entityMemory: { npcs: {}, locations: {}, items: {} },
        // Jail state (jailSystem.js).
        imprisoned: false,
        jail: null,
        jailEscape: null,
        confiscatedItems: [],
        confiscatedGold: 0,
        captureLocation: null,
        // Combat — synchTurnStates reads gameState.combat.isActive every turn.
        combat: { isActive: false, round: 1, initiative: [], currentTurnIndex: 0,
                  activeEffects: [], formation: { frontLine: [], backLine: [] } },
        combatStats: { totalDamageDealt: 0, totalDamageTaken: 0, criticalHits: 0 },
        // Story-graph compression caches (intelligent compression module).
        choicePatterns: new Map(),
        relationshipMatrix: new Map(),
        playerArchetypes: new Map(),
        storyBeats: [],
        worldStateHistory: [],
        // Story hook — picked at game start by storyHooks.pickStoryHook.
        storyHook: null,
        // UI bookkeeping — these MUST be present or showModal crashes
        // ("Cannot read properties of undefined (reading 'includes')").
        activeModals: [],
        popupQueue: [],
        lastPopupTime: 0,
        uiUpdatePending: false,
        currentPuzzleBonus: 0
    });

    log("State: Game state reset complete (setup data preserved, all subsystem objects rebuilt).");
}

/**
 * Creates a new player object with default values.
 * Called during setup.
 * @param {string} name - Player's name.
 * @param {number} age - Player's age.
 * @returns {Player} The new player object.
 */
export function createNewPlayer(name, age) {
    const log = window.displayVisualError || console.log;
    // BUG-29 fix: empty/whitespace names produced players with name='' which
    // broke narration ("Player , HP 100/100") and god-mode prompts. Default
    // to "Adventurer" when the input is missing or blank.
    const safeName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Adventurer';
    log(`State: Creating new player object for Name: ${safeName}, Age: ${age}`);
    const player = {
        id: generateId('player'),
        name: safeName,
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
        // Brave / Clever / Sneaky / Kind, 0-5 (progression.js); all start at 1
        stats: { brave: 1, clever: 1, sneaky: 1, kind: 1 },
        sparks: {}, statPoints: 0, level: 1, xp: 0,
    };
    log(`State: Player created with ID: ${player.id}`);
    return player;
}

/**
 * Phase 1.5: PURE getter for the current player. Previously this method
 * silently mutated gameState.currentPlayerIndex when it found an invalid
 * value — a side effect inside what reads should never have. Tests and
 * callers that expected calling getCurrentPlayer() twice in a row to be
 * equivalent could see the index change between calls, which masked
 * turn-order bugs in multiplayer.
 *
 * Rules now:
 *   - getCurrentPlayer() is a pure read — no mutation.
 *   - Out-of-bounds index returns the player at index 0 (or null).
 *   - Null entries return the next valid player, but the index is NOT changed.
 *   - Call repairPlayerIndex() explicitly at turn boundaries (turnManager)
 *     to actually fix a stale or invalid currentPlayerIndex.
 */
export function getCurrentPlayer() {
    const log = window.displayVisualError || console.log;
    if (!gameState.players || gameState.players.length === 0) {
        return null;
    }
    const index = gameState.currentPlayerIndex;
    if (index < 0 || index >= gameState.players.length) {
        log(`getCurrentPlayer: index ${index} out of range (count=${gameState.players.length}). Returning players[0] without mutation; call repairPlayerIndex() to actually fix.`);
        return gameState.players[0] || null;
    }
    const player = gameState.players[index];
    if (player) return player;

    // Find a valid neighbor for the read, but DO NOT mutate the index.
    log(`getCurrentPlayer: players[${index}] is null/undefined. Returning next valid player without mutating index.`);
    for (let i = 1; i < gameState.players.length; i++) {
        const nextIndex = (index + i) % gameState.players.length;
        if (gameState.players[nextIndex]) return gameState.players[nextIndex];
    }
    log(`CRITICAL: No valid player objects found in the players array.`);
    return null;
}

/**
 * Phase 1.5: explicit recovery path — call this at turn boundaries
 * (turnManager / advanceTurn) to fix a stale currentPlayerIndex. Safe to
 * call when the index is already valid (no-op in that case).
 *
 * Returns true if an index repair was performed, false otherwise.
 */
export function repairPlayerIndex() {
    if (!gameState.players || gameState.players.length === 0) return false;
    const log = window.displayVisualError || console.log;
    const original = gameState.currentPlayerIndex;

    if (original < 0 || original >= gameState.players.length) {
        log(`repairPlayerIndex: clamping ${original} → 0 (count=${gameState.players.length})`);
        gameState.currentPlayerIndex = 0;
        return true;
    }
    if (!gameState.players[original]) {
        for (let i = 1; i < gameState.players.length; i++) {
            const nextIndex = (original + i) % gameState.players.length;
            if (gameState.players[nextIndex]) {
                log(`repairPlayerIndex: ${original} (null) → ${nextIndex}`);
                gameState.currentPlayerIndex = nextIndex;
                return true;
            }
        }
    }
    return false;
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
    
    log("State: Game state initialization complete with intelligent compression tracking.");
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


