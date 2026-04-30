// dynamicItems.js
// Dynamic AI-driven contextual item generation system
// Replaces static item databases with intelligent, context-aware generation

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import { generateId } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';
import { localAIOrchestrator } from './localAIOrchestrator.js?cb=014';

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
                return this.generateFallbackItem(tier, type, context);
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
        
        // Use local AI orchestrator if available
        if (localAIOrchestrator) {
            
            const contextAnalysis = {
                situationType: 'item_generation',
                requiredAgents: ['items'],
                itemContext: {
                    tier,
                    type,
                    theme: gameState.adventureTheme,
                    customTheme: gameState.customThemeDescription,
                    currentLocation: gameState.currentLocation,
                    storyContext: context.storyContext || '',
                    playerNeeds: context.playerNeeds || [],
                    recentEvents: context.recentEvents || []
                }
            };

            // Show loading indicator for AI processing
            const UI = await import('./ui.js?cb=014');
            UI.showLoading(true, 'Generating dynamic items...');
            
            try {
                const result = await localAIOrchestrator.orchestrateAgents('item_generation', contextAnalysis);
                if (result && result.items) {
                    return this.parseAIItemResponse(result.items, tier, type);
                }
            } finally {
                UI.showLoading(false);
            }
        }

        // Fallback to direct AI call if orchestrator fails
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
     * Parse AI response into item object
     */
    parseAIItemResponse(aiResponse, tier, type) {
        const log = window.displayVisualError || console.log;
        
        try {
            let itemData;
            
            if (typeof aiResponse === 'string') {
                // Enhanced JSON extraction with multiple patterns
                let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                
                // Try alternative JSON patterns
                if (!jsonMatch) {
                    jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
                    if (jsonMatch) jsonMatch[0] = jsonMatch[1];
                }
                
                if (!jsonMatch) {
                    jsonMatch = aiResponse.match(/```\s*([\s\S]*?)\s*```/);
                    if (jsonMatch) jsonMatch[0] = jsonMatch[1];
                }
                
                if (jsonMatch) {
                    try {
                        // Clean JSON string
                        let jsonStr = jsonMatch[0].trim();
                        jsonStr = jsonStr.replace(/,\s*}/g, '}'); // Remove trailing commas
                        jsonStr = jsonStr.replace(/,\s*]/g, ']');
                        
                        itemData = JSON.parse(jsonStr);
                        log(`DynamicItems: Successfully parsed JSON for ${type}`);
                    } catch (parseError) {
                        log(`DynamicItems: JSON parse failed, using text parsing: ${parseError.message}`);
                        itemData = this.parseTextItemResponse(aiResponse);
                    }
                } else {
                    log(`DynamicItems: No JSON found, using text parsing`);
                    itemData = this.parseTextItemResponse(aiResponse);
                }
            } else {
                itemData = aiResponse;
            }

            // Enhanced validation with robust fallbacks
            if (!itemData || typeof itemData !== 'object') {
                log(`DynamicItems: Invalid item data, creating fallback`);
                return null; // Will trigger fallback generation
            }

            // Create full item object with enhanced validation
            const item = {
                id: generateId('item'),
                name: this.sanitizeItemName(itemData.name) || `Generated ${type}`,
                type: type,
                tier: tier,
                effect: this.sanitizeItemEffect(itemData.effect) || `A ${tier.toLowerCase()} ${type.toLowerCase()}.`,
                stats: this.validateItemStats(itemData.stats || {}, type, tier),
                cost: this.calculateItemCost(tier, itemData.stats || {}),
                quantity: type === 'Consumable' ? (itemData.quantity || 1) : undefined,
                equippedSlot: null,
                
                // Dynamic item metadata
                isAIGenerated: true,
                generationContext: {
                    theme: gameState.adventureTheme,
                    customTheme: gameState.customThemeDescription,
                    location: gameState.currentLocation?.name,
                    turn: gameState.turn
                },
                parsingMethod: typeof aiResponse === 'string' ? 'enhanced' : 'direct'
            };

            log(`DynamicItems: Created item: ${item.name} (${item.tier} ${item.type})`);
            return item;
            
        } catch (error) {
            log(`DynamicItems: Parse error: ${error.message}, returning null for fallback`);
            return null;
        }
    }

    /**
     * Sanitize item name to prevent issues
     */
    sanitizeItemName(name) {
        if (!name || typeof name !== 'string') return null;
        return name.trim().slice(0, 50); // Limit length
    }

    /**
     * Sanitize item effect description
     */
    sanitizeItemEffect(effect) {
        if (!effect || typeof effect !== 'string') return null;
        return effect.trim().slice(0, 200); // Limit length
    }

    /**
     * Validate and sanitize item stats
     */
    validateItemStats(stats, type, tier) {
        if (!stats || typeof stats !== 'object') return {};
        
        const validatedStats = {};
        const maxStatValue = this.getMaxStatForTier(tier);
        
        // Validate common stats with safe property access
        if (stats && typeof stats === 'object' && stats.atk !== undefined && typeof stats.atk === 'number') {
            validatedStats.atk = Math.max(0, Math.min(stats.atk, maxStatValue));
        }
        if (stats && typeof stats === 'object' && stats.def !== undefined && typeof stats.def === 'number') {
            validatedStats.def = Math.max(0, Math.min(stats.def, maxStatValue));
        }
        if (stats && typeof stats === 'object' && stats.hp !== undefined && typeof stats.hp === 'number') {
            validatedStats.hp = Math.max(0, Math.min(stats.hp, maxStatValue * 2));
        }
        if (stats && typeof stats === 'object' && stats.mp !== undefined && typeof stats.mp === 'number') {
            validatedStats.mp = Math.max(0, Math.min(stats.mp, maxStatValue));
        }
        
        return validatedStats;
    }

    /**
     * Get maximum stat value for tier
     */
    getMaxStatForTier(tier) {
        const maxStats = {
            'Low': 5,
            'Medium': 10,
            'High': 15,
            'Epic': 25,
            'Legendary': 40
        };
        return maxStats[tier] || 5;
    }

    /**
     * Parse text-based AI response when JSON parsing fails
     */
    parseTextItemResponse(text) {
        const lines = text.split('\n');
        const itemData = { stats: {} };
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().includes('name:')) {
                itemData.name = trimmed.split(':')[1]?.trim();
            } else if (trimmed.toLowerCase().includes('effect:')) {
                itemData.effect = trimmed.split(':')[1]?.trim();
            } else if (trimmed.toLowerCase().includes('attack:') || trimmed.toLowerCase().includes('atk:')) {
                const atkMatch = trimmed.match(/(\d+)/);
                if (atkMatch) {
                    if (!itemData.stats) itemData.stats = {};
                    itemData.stats.atk = parseInt(atkMatch[1]);
                }
            } else if (trimmed.toLowerCase().includes('defense:') || trimmed.toLowerCase().includes('def:')) {
                const defMatch = trimmed.match(/(\d+)/);
                if (defMatch) {
                    if (!itemData.stats) itemData.stats = {};
                    itemData.stats.def = parseInt(defMatch[1]);
                }
            } else if (trimmed.toLowerCase().includes('heal:')) {
                const healMatch = trimmed.match(/(\d+)/);
                if (healMatch) {
                    if (!itemData.stats) itemData.stats = {};
                    itemData.stats.heal = parseInt(healMatch[1]);
                }
            }
        }
        
        return itemData;
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
            cost: Config.DefaultItemCosts[tier] || 10,
            quantity: type === 'Consumable' ? 1 : undefined,
            equippedSlot: null,
            isAIGenerated: false,
            isFallback: true
        };

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
     * Calculate appropriate cost for generated item
     */
    calculateItemCost(tier, stats) {
        const baseCost = Config.DefaultItemCosts[tier] || 10;
        
        // Adjust based on stats (with safe property access)
        let statValue = 0;
        if (stats && typeof stats === 'object') {
            if (stats.atk && typeof stats.atk === 'number') statValue += stats.atk;
            if (stats.def && typeof stats.def === 'number') statValue += stats.def;
            if (stats.heal && typeof stats.heal === 'number') statValue += stats.heal * 0.5;
        }
        
        return Math.floor(baseCost + (statValue * 0.5));
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
        try {
            const API = await import('./api_new.js?cb=014');
            const response = await API.getAIResponse([
                { role: 'system', content: 'You are an expert item designer for adventure games. Generate creative, thematic items that fit the requested specifications.' },
                { role: 'user', content: prompt }
            ]);
            
            return this.parseItemResponse(response, tier, type);
        } catch (error) {
            throw new Error(`Direct item generation failed: ${error.message}. Check local AI server and prompts.`);
        }
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

    /**
     * Get registry statistics for debugging
     */
    getRegistryStats() {
        return {
            totalItems: this.generatedItems.size,
            contextualMappings: this.contextualCache.size,
            themePatterns: this.themePatterns.size,
            storyRelevantItems: this.storyRelevantItems.size,
            recentRequests: this.recentRequests.size,
            playerLevel: this.calculatePlayerLevel(),
            maxAllowedTier: this.getMaxAllowedTier(gameState.turn || 1, this.calculatePlayerLevel(), {})
        };
    }

    /**
     * Create item object from parsed data
     */
    createItemFromData(itemData, tier, type, theme) {
        try {
            const item = {
                id: generateId('item'),
                name: itemData.name || `Generated ${type}`,
                type: itemData.type || type,
                tier: itemData.tier || tier,
                effect: itemData.effect || `A ${tier.toLowerCase()} ${type.toLowerCase()} for your adventure`,
                stats: this.validateItemStats(itemData.stats || {}, type, tier),
                cost: itemData.cost || this.calculateItemCost(tier, itemData.stats),
                theme: theme,
                isGenerated: true,
                generatedAt: Date.now()
            };

            // Store in registry
            this.generatedItems.set(item.id, item);
            
            return item;
        } catch (error) {
            console.log(`DynamicItems: Failed to create item from data: ${error.message}`);
            return null;
        }
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
    const registry = gameState.dynamicItemRegistry || dynamicItemRegistry;
    
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
 * Generate starting items for a player using dynamic system - BATCH OPTIMIZED
 * @param {string} theme - Adventure theme
 * @param {Object} player - Player object
 * @returns {Promise<Array>} Array of starting items
 */
export async function generateDynamicStartingItems(theme, player) {
    const context = {
        storyContext: 'character_creation',
        playerNeeds: ['basic_weapon', 'basic_armor', 'healing_item'],
        recentEvents: ['adventure_begins'],
        isStartingItem: true,
        luckUpChance: 0.05,    // Very low upgrade chance for starting items
        luckDownChance: 0.0    // No downgrade chance for starting items
    };
    
    // BATCH GENERATION: Generate all 3 starting items in ONE API call
    return await generateBatchItems([
        { tier: 'Low', type: 'Weapon', context },
        { tier: 'Low', type: 'Armor', context },
        { tier: 'Low', type: 'Consumable', context }
    ], theme, 'starting_equipment');
}

/**
 * Generate shop items using dynamic system - BATCH OPTIMIZED
 * @param {number} itemCount - Number of items to generate
 * @param {number} turn - Current turn for tier calculation
 * @returns {Promise<Array>} Array of shop items
 */
export async function generateDynamicShopItems(itemCount = 6, turn = 1) {
    const context = {
        storyContext: 'shop_visit',
        playerNeeds: ['equipment_upgrade', 'healing_supplies', 'utility_items'],
        recentEvents: ['visited_shop'],
        isShopItem: true,
        luckUpChance: 0.10,    // Moderate upgrade chance for shop items
        luckDownChance: 0.08   // Moderate downgrade chance for shop items
    };
    
    // Calculate tier distribution based on turn
    const tierDistribution = calculateShopTierDistribution(turn);
    
    // BATCH GENERATION: Create all shop items in ONE API call
    const itemRequests = [];
    for (let i = 0; i < itemCount; i++) {
        const tier = selectRandomTier(tierDistribution);
        const type = selectRandomType(['Weapon', 'Armor', 'Consumable']);
        itemRequests.push({ tier, type, context });
    }
    
    return await generateBatchItems(itemRequests, gameState.adventureTheme, 'shop_inventory');
}

/**
 * BATCH ITEM GENERATION - Generate multiple items in single API call
 * Reduces API calls from N to 1 for N items
 * @param {Array} itemRequests - Array of {tier, type, context} objects
 * @param {string} theme - Adventure theme
 * @param {string} batchType - Type of batch (starting_equipment, shop_inventory, etc.)
 * @returns {Promise<Array>} Array of generated items
 */
async function generateBatchItems(itemRequests, theme, batchType) {
    const log = window.displayVisualError || console.log;
    const registry = gameState.dynamicItemRegistry || dynamicItemRegistry;
    
    // Check cache first for similar batch requests
    const cacheKey = `batch_${batchType}_${theme}_${itemRequests.length}`;
    const cached = registry.contextualCache.get(cacheKey);
    if (cached && cached.length >= itemRequests.length) {
        log(`DynamicItems: Using cached batch items for ${batchType}`);
        return cached.slice(0, itemRequests.length);
    }
    
    try {
        // Build comprehensive batch prompt
        const batchPrompt = buildBatchItemPrompt(itemRequests, theme, batchType);
        
        // Use SINGLE API call for all items
        const UI = await import('./ui.js?cb=014');
        UI.showLoading(true, `Generating ${itemRequests.length} ${batchType} items...`);
        
        let response;
        
        // Use optimized single agent call instead of hyperthreading for batch generation
        if (true) { // Always use enhanced processing for MiniCPM
            const API = await import('./api_new.js?cb=014');
            const messages = [{
                role: 'user',
                content: batchPrompt
            }];
            
            response = await API.getAIResponse(messages, {
                max_tokens: Math.min(1024, 150 * itemRequests.length), // Scale tokens with item count
                temperature: 0.3 // Lower temperature for consistent item generation
            });
        } else {
            // Fallback for other providers
            const aiHandler = await import('./aiHandler.js?cb=014');
            const aiResponse = await aiHandler.makeAICallForSystemAction(batchPrompt, true);
            response = aiResponse.narrative;
        }
        
        UI.showLoading(false);
        
        // Parse batch response into individual items
        const items = parseBatchItemResponse(response, itemRequests, theme);
        
        // Cache successful batch for future use
        if (items.length > 0) {
            registry.contextualCache.set(cacheKey, items);
        }
        
        log(`DynamicItems: Generated ${items.length}/${itemRequests.length} items in batch`);
        return items;
        
    } catch (error) {
        const UI = await import('./ui.js?cb=014');
        UI.showLoading(false);
        
        log(`DynamicItems: Batch generation failed: ${error.message}`);
        
        // No fallbacks - throw error for proper debugging
        throw new Error(`Dynamic item batch generation failed: ${error.message}. AI must generate items correctly.`);
    }
}

/**
 * Build optimized prompt for batch item generation
 */
function buildBatchItemPrompt(itemRequests, theme, batchType) {
    const themeDesc = theme === 'custom' ? gameState.customThemeDescription : theme;
    
    const itemSpecs = itemRequests.map((req, i) => 
        `${i + 1}. ${req.tier} ${req.type} (${req.context.storyContext || 'general'})`
    ).join('\n');
    
    return `Generate ${itemRequests.length} ${themeDesc}-themed items for ${batchType}:

${itemSpecs}

Requirements:
- Theme: ${themeDesc}
- Context: ${itemRequests[0]?.context?.storyContext || 'adventure'}
- Format each item as JSON with: name, type, tier, effect, stats{atk?, def?, heal?}, cost

Return as JSON array: [{"name":"...", "type":"...", "tier":"...", "effect":"...", "stats":{...}, "cost":...}, ...]

Make items creative, balanced, and thematically appropriate. Ensure variety in names and effects.`;
}

/**
 * Parse batch response into individual items
 */
function parseBatchItemResponse(response, itemRequests, theme) {
    const log = window.displayVisualError || console.log;
    const registry = gameState.dynamicItemRegistry || dynamicItemRegistry;
    
    try {
        // Try to extract JSON array from response
        let itemsData;
        
        if (typeof response === 'string') {
            // Sanitize the JSON string to fix common AI generation issues
            let sanitizedResponse = response
                .replace(/```json\s*/g, '')  // Remove markdown code blocks
                .replace(/```\s*/g, '')      // Remove closing code blocks
                .replace(/,\s*}/g, '}')      // Remove trailing commas in objects
                .replace(/,\s*]/g, ']')      // Remove trailing commas in arrays
                .replace(/'/g, '"')          // Replace single quotes with double quotes
                .trim();
            
            // Look for JSON array in response
            const jsonMatch = sanitizedResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                itemsData = JSON.parse(jsonMatch[0]);
            } else {
                // Try to parse entire response
                itemsData = JSON.parse(sanitizedResponse);
            }
        } else if (Array.isArray(response)) {
            itemsData = response;
        } else {
            throw new Error('Invalid response format');
        }
        
        if (!Array.isArray(itemsData)) {
            throw new Error('Response is not an array');
        }
        
        // Convert each item data to proper item object
        const items = [];
        for (let i = 0; i < Math.min(itemsData.length, itemRequests.length); i++) {
            const itemData = itemsData[i];
            const request = itemRequests[i];
            
            if (itemData && typeof itemData === 'object') {
                const item = registry.createItemFromData(itemData, request.tier, request.type, theme);
                if (item) {
                    items.push(item);
                }
            }
        }
        
        return items;
        
    } catch (error) {
        log(`CRITICAL ERROR: DynamicItems batch parsing failed: ${error.message}`);
        throw new Error(`Dynamic item generation failed: ${error.message}. This indicates the AI is not generating valid JSON for items. Check local AI server and prompts.`);
    }
}

// FALLBACK GENERATION REMOVED - AI must generate items correctly or fail clearly

/**
 * Calculate tier distribution for shop based on game progress
 */
function calculateShopTierDistribution(turn) {
    const progress = Math.min(turn / 50, 1); // Normalize to 0-1 over 50 turns
    
    return {
        Low: Math.max(0.6 - progress * 0.4, 0.1),      // 60% -> 10%
        Medium: Math.max(0.3 - progress * 0.1, 0.2),   // 30% -> 20%
        High: Math.min(0.1 + progress * 0.3, 0.4),     // 10% -> 40%
        Special: Math.min(progress * 0.2, 0.2),        // 0% -> 20%
        Legendary: Math.min(progress * 0.1, 0.1),      // 0% -> 10%
        God: 0 // Reserved for special events
    };
}

/**
 * Select random tier based on distribution
 */
function selectRandomTier(distribution) {
    const random = Math.random();
    let cumulative = 0;
    
    for (const [tier, probability] of Object.entries(distribution)) {
        cumulative += probability;
        if (random <= cumulative) {
            return tier;
        }
    }
    
    return 'Low'; // Fallback
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

/**
 * Generate quest reward item with guaranteed quality
 * @param {string} theme - Adventure theme
 * @param {string} baseTier - Base tier for the reward
 * @param {Object} questInfo - Information about the completed quest
 * @returns {Promise<Object>} Generated quest reward item
 */
export async function generateQuestRewardItem(theme, baseTier, questInfo = {}) {
    const context = {
        storyContext: `completed_quest_${questInfo.name || 'unknown'}`,
        playerNeeds: ['quest_reward', 'story_item'],
        recentEvents: [`completed_${questInfo.type || 'quest'}`],
        isQuestReward: true,
        luckUpChance: 0.30,    // High upgrade chance for quest rewards
        luckDownChance: 0.0,   // No downgrade chance for quest rewards
        questType: questInfo.type,
        questName: questInfo.name
    };
    
    // Quest rewards can be any type, including special consumables
    const rewardTypes = ['Weapon', 'Armor', 'Consumable'];
    const type = selectRandomType(rewardTypes);
    
    return await generateDynamicItem(theme, baseTier, type, context);
}
