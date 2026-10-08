// dynamicItems.js
// Dynamic AI-driven contextual item generation system
// Replaces static item databases with intelligent, context-aware generation

import { gameState } from './state.js';
import { generateId } from './utils.js';
import { itemValue } from './items.js';

/**
 * Dynamic Item Registry - Stores learned patterns and contextual items for this game session
 */
export class DynamicItemRegistry {
    constructor() {
        // Core item storage
        this.generatedItems = new Map();      // itemId -> full item object
        this.contextualCache = new Map();     // contextKey -> [itemIds]
        this.themePatterns = new Map();       // theme -> successful patterns
        this.storyRelevantItems = new Map();  // storyContext -> [itemIds]
        
        // Performance optimization
        this.recentRequests = new Map();      // Prevent duplicate AI calls
        this.generationQueue = [];            // Queue for batch generation
        
        // Quality control
        this.itemQualityScores = new Map();   // itemId -> quality score (0-1)
        this.playerFeedback = new Map();      // itemId -> usage feedback
    }

    /**
     * Initialize the dynamic item system in gameState
     */
    static initializeDynamicItemSystem() {
        if (!gameState.dynamicItemRegistry) {
            gameState.dynamicItemRegistry = new DynamicItemRegistry();
        }
        return gameState.dynamicItemRegistry;
    }

    /**
     * Generate a contextually appropriate item using AI with tier validation and luck mechanics
     * @param {string} requestedTier - Requested item tier (may be modified by luck)
     * @param {string} type - Item type (Weapon, Armor, Consumable)
     * @param {Object} context - Current game context
     * @returns {Promise<Object>} Generated item object
     */
    async generateContextualItem(requestedTier, type, context = {}) {
        const log = window.displayVisualError || console.log;
        
        // Apply tier progression control and luck mechanics
        const actualTier = this.calculateActualTier(requestedTier, context);
        log(`DynamicItems: Requested ${requestedTier}, actual tier after luck: ${actualTier}`);
        
        // Build context key for caching
        const contextKey = this.buildContextKey(actualTier, type, context);
        
        // Check cache first
        const cachedItems = this.contextualCache.get(contextKey);
        if (cachedItems && cachedItems.length > 0) {
            const cachedItemId = cachedItems[Math.floor(Math.random() * cachedItems.length)];
            const cachedItem = this.generatedItems.get(cachedItemId);
            if (cachedItem) {
                log(`DynamicItems: Using cached item: ${cachedItem.name}`);
                return this.createItemInstance(cachedItem);
            }
        }

        // Check recent requests to avoid duplicates
        if (this.recentRequests.has(contextKey)) {
            const recentTime = this.recentRequests.get(contextKey);
            if (Date.now() - recentTime < 5000) { // 5 second cooldown
                log(`DynamicItems: Recent request for ${contextKey}, using fallback`);
                return this.generateFallbackItem(actualTier, type, context);
            }
        }

        try {
            this.recentRequests.set(contextKey, Date.now());
            
            // Generate item using enhanced Items Agent
            const generatedItem = await this.callItemsAgent(actualTier, type, context);
            
            if (generatedItem) {
                // Store in registry
                this.storeGeneratedItem(generatedItem, contextKey, context);
                log(`DynamicItems: Generated new item: ${generatedItem.name}`);
                return generatedItem;
            }
        } catch (error) {
            log(`DynamicItems: AI generation failed: ${error.message}`);
        }

        // Fallback to basic generation
        return this.generateFallbackItem(actualTier, type, context);
    }

    /**
     * Call the enhanced Items Agent for intelligent generation
     */
    async callItemsAgent(tier, type, context) {
        const itemPrompt = this.buildItemGenerationPrompt(tier, type, context);
        
        // Direct call only: the orchestrator path never returned the `items`
        // field checked here (live: a 600-token prose reply, then this call anyway).
        return await this.directItemGeneration(itemPrompt, tier, type);
    }

    /**
     * Build comprehensive prompt for item generation
     */
    buildItemGenerationPrompt(tier, type, context) {
        const theme = gameState.adventureTheme;
        const customTheme = gameState.customThemeDescription;
        const location = gameState.currentLocation;
        
        let prompt = `Generate a ${tier} tier ${type} item for the following context:

THEME: ${theme}${customTheme ? ` (${customTheme})` : ''}
LOCATION: ${location ? location.name : 'Unknown'}
STORY CONTEXT: ${context.storyContext || 'General adventure'}

REQUIREMENTS:
1. Name must be thematically appropriate and creative
2. Effect description should be vivid and specific
3. Stats must match the ${tier} tier power level
4. Item should feel contextually relevant to current situation

TIER GUIDELINES (STRICTLY ENFORCE THESE RANGES):
- Low: Basic, common items
  * Weapon ATK: 3-6, Armor DEF: 2-4, Heal: 15-30
  * Cost: ~15 coins, Simple names and effects
- Medium: Decent, reliable items  
  * Weapon ATK: 7-12, Armor DEF: 5-8, Heal: 35-60
  * Cost: ~50 coins, Improved names and effects
- High: Superior, well-crafted items
  * Weapon ATK: 13-20, Armor DEF: 9-15, Heal: 65-100
  * Cost: ~150 coins, Notable names and effects
- Special: Rare, unique items
  * Weapon ATK: 21-30, Armor DEF: 16-25, No standard heals
  * Cost: ~350 coins, Special abilities and effects
- Legendary: Extraordinary, powerful items
  * Weapon ATK: 35-50, Armor DEF: 30-45, No standard heals
  * Cost: ~1200 coins, Legendary abilities and lore
- God: Ultimate, game-changing items (VERY RARE)
  * Weapon ATK: 60-100, Armor DEF: 50-80, No standard heals
  * Cost: ~9999 coins, World-altering abilities

CRITICAL: You MUST generate stats within these exact ranges for the specified tier. Do not exceed these limits!

${type === 'Weapon' ? `
WEAPON REQUIREMENTS:
- Include attack bonus (atk stat)
- Consider elemental damage type if thematically appropriate
- May include on-hit status effects for higher tiers
- Should reflect combat style of the theme
` : ''}

${type === 'Armor' ? `
ARMOR REQUIREMENTS:
- Include defense bonus (def stat)
- Consider resistances for higher tiers
- Should reflect protection style of the theme
- May include passive abilities for Special+ tiers
` : ''}

${type === 'Consumable' ? `
CONSUMABLE REQUIREMENTS:
- Include healing amount or status effect
- Consider cure properties if appropriate
- Should reflect consumable style of the theme
- May apply temporary buffs for higher tiers
` : ''}

CONTEXT-SPECIFIC NEEDS:
${context.playerNeeds ? context.playerNeeds.map(need => `- ${need}`).join('\n') : '- General utility'}

RECENT STORY EVENTS:
${context.recentEvents ? context.recentEvents.map(event => `- ${event}`).join('\n') : '- None specified'}

Respond with a JSON object containing: name, effect, stats (object with relevant properties), and any special properties.`;

        return prompt;
    }


    /**
     * Store generated item in registry with context mapping
     */
    storeGeneratedItem(item, contextKey, context) {
        // Store the item
        this.generatedItems.set(item.id, item);
        
        // Map to context
        if (!this.contextualCache.has(contextKey)) {
            this.contextualCache.set(contextKey, []);
        }
        this.contextualCache.get(contextKey).push(item.id);
        
        // Store theme patterns
        const theme = gameState.adventureTheme;
        if (!this.themePatterns.has(theme)) {
            this.themePatterns.set(theme, []);
        }
        this.themePatterns.get(theme).push({
            itemId: item.id,
            tier: item.tier,
            type: item.type,
            namePattern: this.extractNamePattern(item.name),
            effectPattern: this.extractEffectPattern(item.effect)
        });
        
        // Store story relevance if applicable
        if (context.storyContext) {
            if (!this.storyRelevantItems.has(context.storyContext)) {
                this.storyRelevantItems.set(context.storyContext, []);
            }
            this.storyRelevantItems.get(context.storyContext).push(item.id);
        }
    }

    /**
     * Generate fallback item when AI generation fails
     */
    generateFallbackItem(tier, type, context) {
        const theme = gameState.adventureTheme;
        const customTheme = gameState.customThemeDescription;
        
        // Use theme-appropriate fallback names
        const fallbackNames = this.getFallbackNames(theme, type, tier);
        const name = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
        
        const item = {
            id: generateId('item'),
            name: name,
            type: type,
            tier: tier,
            effect: `A ${tier.toLowerCase()} ${type.toLowerCase()} from ${customTheme || theme}.`,
            stats: this.generateFallbackStats(tier, type),
            cost: 0, // set from what it does, below
            quantity: type === 'Consumable' ? 1 : undefined,
            equippedSlot: null,
            isAIGenerated: false,
            isFallback: true
        };
        item.cost = itemValue(item); // priced by its stats, like the shop

        return item;
    }

    /**
     * Get theme-appropriate fallback names
     */
    getFallbackNames(theme, type, tier) {
        const themeAdjectives = {
            fantasy: ['Enchanted', 'Mystical', 'Ancient', 'Blessed', 'Cursed'],
            space: ['Quantum', 'Plasma', 'Stellar', 'Cosmic', 'Neural'],
            cyberpunk: ['Cyber', 'Neural', 'Digital', 'Synthetic', 'Augmented'],
            steampunk: ['Steam', 'Brass', 'Clockwork', 'Mechanical', 'Victorian'],
            pirate: ['Cursed', 'Treasure', 'Nautical', 'Swashbuckling', 'Maritime'],
            custom: ['Unique', 'Strange', 'Mysterious', 'Exotic', 'Otherworldly']
        };

        const typeNouns = {
            Weapon: ['Blade', 'Staff', 'Bow', 'Hammer', 'Spear'],
            Armor: ['Mail', 'Plate', 'Robes', 'Shield', 'Helm'],
            Consumable: ['Potion', 'Elixir', 'Tonic', 'Brew', 'Draught']
        };

        const adjectives = themeAdjectives[theme] || themeAdjectives.custom;
        const nouns = typeNouns[type] || ['Item'];
        
        const names = [];
        for (const adj of adjectives) {
            for (const noun of nouns) {
                names.push(`${adj} ${noun}`);
            }
        }
        
        return names;
    }

    /**
     * Generate appropriate stats for fallback items
     */
    generateFallbackStats(tier, type) {
        const stats = {};
        const tierMultipliers = {
            Low: 1,
            Medium: 2,
            High: 4,
            Special: 8,
            Legendary: 16,
            God: 32
        };
        
        const multiplier = tierMultipliers[tier] || 1;
        
        if (type === 'Weapon') {
            stats.atk = Math.floor((10 + Math.random() * 15) * multiplier);
        } else if (type === 'Armor') {
            stats.def = Math.floor((8 + Math.random() * 12) * multiplier);
        } else if (type === 'Consumable') {
            stats.heal = Math.floor((15 + Math.random() * 25) * multiplier);
        }
        
        return stats;
    }

    /**
     * Build context key for caching
     */
    buildContextKey(tier, type, context) {
        const theme = gameState.adventureTheme;
        const customTheme = gameState.customThemeDescription;
        const location = gameState.currentLocation?.name || 'unknown';
        const storyContext = context.storyContext || 'general';
        
        return `${theme}:${customTheme}:${location}:${tier}:${type}:${storyContext}`.toLowerCase();
    }

    /**
     * Create a new instance of a cached item (with new ID)
     */
    createItemInstance(templateItem) {
        return {
            ...templateItem,
            id: generateId('item'),
            quantity: templateItem.type === 'Consumable' ? 1 : undefined,
            equippedSlot: null
        };
    }


    /**
     * Extract naming patterns for consistency
     */
    extractNamePattern(name) {
        const words = name.split(' ');
        return {
            wordCount: words.length,
            hasAdjective: words.length > 1,
            firstWord: words[0],
            lastWord: words[words.length - 1]
        };
    }

    /**
     * Extract effect patterns for consistency
     */
    extractEffectPattern(effect) {
        return {
            length: effect.length,
            hasNumbers: /\d/.test(effect),
            tone: effect.includes('powerful') ? 'epic' : 
                  effect.includes('basic') ? 'simple' : 'neutral'
        };
    }

    /**
     * Direct AI generation fallback
     */
    async directItemGeneration(prompt, tier, type) {
        // ponytail: no AI call. It called a parseItemResponse that never
        // existed, so every loot roll paid for a 2048-token reply and then
        // threw into the fallback item anyway. The caller's fallback is used.
        throw new Error('direct item generation disabled');
    }

    /**
     * Calculate actual tier based on progression control and luck mechanics
     * @param {string} requestedTier - The originally requested tier
     * @param {Object} context - Current game context
     * @returns {string} The actual tier to use after applying controls
     */
    calculateActualTier(requestedTier, context = {}) {
        const turn = gameState.turn || 1;
        const playerLevel = this.calculatePlayerLevel();
        
        // Get maximum allowed tier based on game progression
        const maxAllowedTier = this.getMaxAllowedTier(turn, playerLevel, context);
        
        // Apply tier cap
        let cappedTier = this.capTierToProgression(requestedTier, maxAllowedTier);
        
        // Apply luck mechanics (chance for tier upgrade/downgrade)
        const finalTier = this.applyLuckModifiers(cappedTier, context);
        
        return finalTier;
    }

    /**
     * Calculate effective player level based on stats and progress
     */
    calculatePlayerLevel() {
        if (!gameState.players || gameState.players.length === 0) return 1;
        
        const currentPlayer = gameState.players[gameState.currentPlayerIndex] || gameState.players[0];
        if (!currentPlayer) return 1;
        
        // Calculate level based on stats, equipment, and progress
        const statLevel = Math.floor((currentPlayer.atk + currentPlayer.def) / 20);
        const turnLevel = Math.floor(gameState.turn / 10);
        const equipmentLevel = this.calculateEquipmentLevel(currentPlayer);
        
        return Math.max(1, Math.floor((statLevel + turnLevel + equipmentLevel) / 3));
    }

    /**
     * Calculate equipment level contribution
     */
    calculateEquipmentLevel(player) {
        let equipLevel = 0;
        
        if (player.equipment?.weapon) {
            const weapon = player.inventory?.find(item => item.id === player.equipment.weapon);
            if (weapon) equipLevel += this.getTierLevel(weapon.tier);
        }
        
        if (player.equipment?.armor) {
            const armor = player.inventory?.find(item => item.id === player.equipment.armor);
            if (armor) equipLevel += this.getTierLevel(armor.tier);
        }
        
        return Math.floor(equipLevel / 2);
    }

    /**
     * Convert tier name to numeric level
     */
    getTierLevel(tierName) {
        const tierLevels = {
            'Low': 1,
            'Medium': 2,
            'High': 3,
            'Special': 4,
            'Legendary': 5,
            'God': 6
        };
        return tierLevels[tierName] || 1;
    }

    /**
     * Convert numeric level back to tier name
     */
    getLevelTier(level) {
        const levelTiers = {
            1: 'Low',
            2: 'Medium',
            3: 'High',
            4: 'Special',
            5: 'Legendary',
            6: 'God'
        };
        return levelTiers[Math.min(6, Math.max(1, level))] || 'Low';
    }

    /**
     * Get maximum allowed tier based on game progression
     */
    getMaxAllowedTier(turn, playerLevel, context) {
        // Base progression: unlock higher tiers as game progresses
        let maxTierLevel = 1; // Start with Low tier
        
        // Turn-based progression
        if (turn >= 5) maxTierLevel = Math.max(maxTierLevel, 2);   // Medium at turn 5
        if (turn >= 15) maxTierLevel = Math.max(maxTierLevel, 3);  // High at turn 15
        if (turn >= 30) maxTierLevel = Math.max(maxTierLevel, 4);  // Special at turn 30
        if (turn >= 50) maxTierLevel = Math.max(maxTierLevel, 5);  // Legendary at turn 50
        if (turn >= 100) maxTierLevel = Math.max(maxTierLevel, 6); // God at turn 100
        
        // Player level can accelerate progression
        maxTierLevel = Math.max(maxTierLevel, Math.min(playerLevel, 4)); // Player level caps at Special normally
        
        // Context-based exceptions
        if (context.isBossReward) {
            maxTierLevel = Math.min(maxTierLevel + 1, 6); // Boss rewards can be one tier higher
        }
        
        if (context.isQuestReward) {
            maxTierLevel = Math.min(maxTierLevel + 1, 5); // Quest rewards can be one tier higher (max Legendary)
        }
        
        if (context.isShopItem) {
            maxTierLevel = Math.max(1, maxTierLevel - 1); // Shop items are generally one tier lower
        }
        
        if (context.isStartingItem) {
            maxTierLevel = Math.min(maxTierLevel, 2); // Starting items max out at Medium
        }
        
        return this.getLevelTier(maxTierLevel);
    }

    /**
     * Cap requested tier to progression limits
     */
    capTierToProgression(requestedTier, maxAllowedTier) {
        const requestedLevel = this.getTierLevel(requestedTier);
        const maxLevel = this.getTierLevel(maxAllowedTier);
        
        if (requestedLevel <= maxLevel) {
            return requestedTier;
        }
        
        return maxAllowedTier;
    }

    /**
     * Apply luck modifiers for tier upgrades/downgrades
     */
    applyLuckModifiers(baseTier, context = {}) {
        const baseTierLevel = this.getTierLevel(baseTier);
        let finalTierLevel = baseTierLevel;
        
        // Base luck chances
        const luckUpChance = context.luckUpChance || 0.15;    // 15% chance for upgrade
        const luckDownChance = context.luckDownChance || 0.05; // 5% chance for downgrade
        
        // Context modifiers
        let upChance = luckUpChance;
        let downChance = luckDownChance;
        
        if (context.isBossReward) {
            upChance *= 2.0; // Double upgrade chance for boss rewards
            downChance *= 0.5; // Half downgrade chance
        }
        
        if (context.isEliteReward) {
            upChance *= 1.5; // 50% better upgrade chance for elite rewards
        }
        
        if (context.isShopItem) {
            upChance *= 0.5; // Half upgrade chance for shop items
            downChance *= 1.5; // Higher downgrade chance
        }
        
        if (context.playerLuck) {
            const luckMultiplier = 1 + (context.playerLuck * 0.1); // Each luck point = 10% better odds
            upChance *= luckMultiplier;
            downChance /= luckMultiplier;
        }
        
        // Apply luck rolls
        const roll = Math.random();
        
        if (roll < upChance && finalTierLevel < 6) {
            finalTierLevel += 1;
            if (window.displayVisualError) {
                window.displayVisualError(`Lucky upgrade! ${baseTier} -> ${this.getLevelTier(finalTierLevel)}`);
            }
        } else if (roll > (1 - downChance) && finalTierLevel > 1) {
            finalTierLevel -= 1;
            if (window.displayVisualError) {
                window.displayVisualError(`Unlucky downgrade: ${baseTier} -> ${this.getLevelTier(finalTierLevel)}`);
            }
        }
        
        return this.getLevelTier(finalTierLevel);
    }


}

// Initialize the dynamic item system
export const dynamicItemRegistry = DynamicItemRegistry.initializeDynamicItemSystem();

/**
 * Main entry point for generating items - replaces Items.generateThemedItem
 * @param {string} theme - Adventure theme (can be custom)
 * @param {string} tier - Item tier
 * @param {string} type - Item type
 * @param {Object} context - Additional context for generation
 * @returns {Promise<Object>} Generated item
 */
export async function generateDynamicItem(theme, tier, type, context = {}) {
    const registry = dynamicItemRegistry; // live instance (a loaded save held a method-less copy)
    
    // Build enhanced context
    const enhancedContext = {
        ...context,
        theme: theme || gameState.adventureTheme,
        customTheme: gameState.customThemeDescription,
        currentLocation: gameState.currentLocation,
        turn: gameState.turn,
        playerNeeds: context.playerNeeds || [],
        recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || [],
        storyContext: context.storyContext || gameState.currentNarrative?.slice(0, 200)
    };
    
    return await registry.generateContextualItem(tier, type, enhancedContext);
}


/**
 * Select random item type
 */
function selectRandomType(types) {
    return types[Math.floor(Math.random() * types.length)];
}

/**
 * Generate boss reward item with enhanced luck and tier potential
 * @param {string} theme - Adventure theme
 * @param {string} baseTier - Base tier for the reward
 * @param {Object} bossInfo - Information about the defeated boss
 * @returns {Promise<Object>} Generated boss reward item
 */
export async function generateBossRewardItem(theme, baseTier, bossInfo = {}) {
    const context = {
        storyContext: `defeated_boss_${bossInfo.name || 'unknown'}`,
        playerNeeds: ['powerful_equipment', 'boss_trophy'],
        recentEvents: [`defeated_${bossInfo.bossType || 'boss'}`],
        isBossReward: true,
        luckUpChance: 0.40,    // High upgrade chance for boss rewards
        luckDownChance: 0.0,   // No downgrade chance for boss rewards
        bossType: bossInfo.bossType,
        bossName: bossInfo.name
    };
    
    // Boss rewards favor weapons and armor
    const rewardTypes = ['Weapon', 'Armor'];
    const type = selectRandomType(rewardTypes);
    
    return await generateDynamicItem(theme, baseTier, type, context);
}

/**
 * Generate elite enemy reward item with moderate luck bonus
 * @param {string} theme - Adventure theme
 * @param {string} baseTier - Base tier for the reward
 * @param {Object} eliteInfo - Information about the defeated elite
 * @returns {Promise<Object>} Generated elite reward item
 */
export async function generateEliteRewardItem(theme, baseTier, eliteInfo = {}) {
    const context = {
        storyContext: `defeated_elite_${eliteInfo.name || 'unknown'}`,
        playerNeeds: ['equipment_upgrade', 'elite_trophy'],
        recentEvents: [`defeated_${eliteInfo.eliteType || 'elite'}_enemy`],
        isEliteReward: true,
        luckUpChance: 0.25,    // Good upgrade chance for elite rewards
        luckDownChance: 0.02,  // Very low downgrade chance
        eliteType: eliteInfo.eliteType,
        eliteName: eliteInfo.name
    };
    
    // Elite rewards can be any type
    const rewardTypes = ['Weapon', 'Armor', 'Consumable'];
    const type = selectRandomType(rewardTypes);
    
    return await generateDynamicItem(theme, baseTier, type, context);
}

