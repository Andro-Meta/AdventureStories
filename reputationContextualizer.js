// reputationContextualizer.js
// Lightweight Faction Contextualization System
// Dynamically adapts reputation factions to any theme without AI agents

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';

/**
 * Lightweight Reputation Contextualizer
 * Adapts faction archetypes to any theme without requiring AI calls
 */
export class ReputationContextualizer {
    constructor() {
        // Core faction archetypes (theme-agnostic)
        this.factionArchetypes = this.initializeFactionArchetypes();
        
        // Theme adaptation patterns
        this.themeAdaptations = this.initializeThemeAdaptations();
        
        // Cached contextualized factions
        this.contextualizedFactions = new Map();
        
        // Performance tracking
        this.adaptationMetrics = new Map();
        
        console.log('ReputationContextualizer: Initialized lightweight faction adaptation');
    }

    /**
     * Initialize core faction archetypes (universal patterns)
     */
    initializeFactionArchetypes() {
        return {
            authority: {
                name: 'Authority',
                archetype: 'lawful_power',
                values: ['order', 'tradition', 'hierarchy', 'control'],
                conflicts: ['freedom', 'chaos', 'rebellion'],
                economicRole: 'luxury_markets',
                reputationRange: [-100, 100],
                priceModifier: {
                    high: 0.4,    // 60% discount at +80 rep
                    neutral: 1.0, // normal prices
                    low: 3.0      // 200% markup at -80 rep
                }
            },
            warriors: {
                name: 'Warriors',
                archetype: 'martial_might',
                values: ['strength', 'honor', 'skill', 'courage'],
                conflicts: ['weakness', 'cowardice', 'pacifism'],
                economicRole: 'weapon_markets',
                reputationRange: [-100, 100],
                priceModifier: {
                    high: 0.5,    // 50% discount
                    neutral: 1.0,
                    low: 2.0      // 100% markup
                }
            },
            naturalists: {
                name: 'Naturalists',
                archetype: 'nature_balance',
                values: ['balance', 'preservation', 'wisdom', 'harmony'],
                conflicts: ['destruction', 'pollution', 'excess'],
                economicRole: 'healing_markets',
                reputationRange: [-100, 100],
                priceModifier: {
                    high: 0.3,    // 70% discount
                    neutral: 1.0,
                    low: 4.0      // 300% markup
                }
            },
            shadows: {
                name: 'Shadows',
                archetype: 'hidden_networks',
                values: ['freedom', 'information', 'cunning', 'independence'],
                conflicts: ['authority', 'exposure', 'rigidity'],
                economicRole: 'black_markets',
                reputationRange: [-100, 100],
                priceModifier: {
                    high: 0.6,    // 40% discount + exclusive access
                    neutral: 1.5, // 50% markup (dangerous goods)
                    low: 999      // refused service
                }
            },
            scholars: {
                name: 'Scholars',
                archetype: 'knowledge_seekers',
                values: ['learning', 'discovery', 'preservation', 'truth'],
                conflicts: ['ignorance', 'destruction', 'lies'],
                economicRole: 'magical_markets',
                reputationRange: [-100, 100],
                priceModifier: {
                    high: 0.4,    // 60% discount
                    neutral: 1.0,
                    low: 2.5      // 150% markup
                }
            },
            common: {
                name: 'Common',
                archetype: 'everyday_folk',
                values: ['safety', 'fairness', 'community', 'simplicity'],
                conflicts: ['danger', 'elitism', 'complexity'],
                economicRole: 'basic_services',
                reputationRange: [-100, 100],
                priceModifier: {
                    high: 0.7,    // 30% discount
                    neutral: 1.0,
                    low: 1.8      // 80% markup
                }
            }
        };
    }

    /**
     * Initialize theme adaptation patterns
     */
    initializeThemeAdaptations() {
        return {
            fantasy: {
                authority: { name: 'Nobles', flavor: 'Royal courts and aristocracy' },
                warriors: { name: 'Knights', flavor: 'Chivalrous warriors and mercenaries' },
                naturalists: { name: 'Druids', flavor: 'Forest guardians and nature priests' },
                shadows: { name: 'Rogues', flavor: 'Thieves guilds and assassins' },
                scholars: { name: 'Mages', flavor: 'Wizards and magical academies' },
                common: { name: 'Villagers', flavor: 'Farmers, merchants, and townsfolk' }
            },
            'space opera': {
                authority: { name: 'Empire', flavor: 'Galactic government and military' },
                warriors: { name: 'Mercenaries', flavor: 'Space marines and bounty hunters' },
                naturalists: { name: 'Terraformers', flavor: 'Eco-engineers and planet shapers' },
                shadows: { name: 'Smugglers', flavor: 'Pirates and black market traders' },
                scholars: { name: 'Scientists', flavor: 'Research stations and tech corps' },
                common: { name: 'Colonists', flavor: 'Settlers and space truckers' }
            },
            pirate: {
                authority: { name: 'Navy', flavor: 'Royal navies and port authorities' },
                warriors: { name: 'Buccaneers', flavor: 'Pirate captains and privateers' },
                naturalists: { name: 'Islanders', flavor: 'Native tribes and sea shamans' },
                shadows: { name: 'Smugglers', flavor: 'Black market dealers and spies' },
                scholars: { name: 'Navigators', flavor: 'Cartographers and treasure hunters' },
                common: { name: 'Sailors', flavor: 'Merchants and dock workers' }
            },
            western: {
                authority: { name: 'Law', flavor: 'Sheriffs and territorial government' },
                warriors: { name: 'Gunfighters', flavor: 'Cowboys and hired guns' },
                naturalists: { name: 'Natives', flavor: 'Indigenous tribes and mountain men' },
                shadows: { name: 'Outlaws', flavor: 'Bandits and underground networks' },
                scholars: { name: 'Doctors', flavor: 'Traveling doctors and inventors' },
                common: { name: 'Settlers', flavor: 'Ranchers and town builders' }
            },
            cyberpunk: {
                authority: { name: 'Corporations', flavor: 'Mega-corps and security forces' },
                warriors: { name: 'Mercenaries', flavor: 'Street samurai and corporate soldiers' },
                naturalists: { name: 'Ecologists', flavor: 'Green activists and bio-hackers' },
                shadows: { name: 'Netrunners', flavor: 'Hackers and data brokers' },
                scholars: { name: 'Techies', flavor: 'Scientists and AI researchers' },
                common: { name: 'Citizens', flavor: 'Workers and street dwellers' }
            },
            horror: {
                authority: { name: 'Order', flavor: 'Religious authorities and investigators' },
                warriors: { name: 'Hunters', flavor: 'Monster hunters and survivalists' },
                naturalists: { name: 'Occultists', flavor: 'Mystics and ancient knowledge keepers' },
                shadows: { name: 'Cultists', flavor: 'Secret societies and dark dealers' },
                scholars: { name: 'Researchers', flavor: 'Paranormal investigators and academics' },
                common: { name: 'Survivors', flavor: 'Ordinary people trying to survive' }
            },
            steampunk: {
                authority: { name: 'Aristocrats', flavor: 'Victorian nobility and industrialists' },
                warriors: { name: 'Airship Crews', flavor: 'Sky pirates and military aviators' },
                naturalists: { name: 'Naturalists', flavor: 'Conservationists and herbalists' },
                shadows: { name: 'Underground', flavor: 'Revolutionaries and black market tinkerers' },
                scholars: { name: 'Inventors', flavor: 'Mad scientists and engineers' },
                common: { name: 'Workers', flavor: 'Factory workers and street vendors' }
            }
        };
    }

    /**
     * Get contextualized factions for current theme
     * @param {string} theme - Current adventure theme
     * @param {string} customDescription - Custom theme description if any
     * @returns {Object} Contextualized faction data
     */
    getContextualizedFactions(theme = null, customDescription = '') {
        const currentTheme = theme || gameState.adventureTheme || 'fantasy';
        const cacheKey = `${currentTheme}:${customDescription}`;
        
        // Return cached version if available
        if (this.contextualizedFactions.has(cacheKey)) {
            return this.contextualizedFactions.get(cacheKey);
        }
        
        // Generate contextualized factions
        const contextualized = this.adaptFactionsToTheme(currentTheme, customDescription);
        
        // Cache for future use
        this.contextualizedFactions.set(cacheKey, contextualized);
        
        return contextualized;
    }

    /**
     * Adapt faction archetypes to specific theme
     * @param {string} theme - Theme to adapt to
     * @param {string} customDescription - Custom theme description
     * @returns {Object} Adapted faction data
     */
    adaptFactionsToTheme(theme, customDescription = '') {
        const adaptations = this.themeAdaptations[theme] || this.themeAdaptations.fantasy;
        const factions = {};
        
        // Adapt each archetype to the theme
        Object.entries(this.factionArchetypes).forEach(([archetypeKey, archetype]) => {
            const adaptation = adaptations[archetypeKey];
            
            factions[archetypeKey] = {
                ...archetype,
                name: adaptation.name,
                flavor: adaptation.flavor,
                theme: theme,
                customTheme: customDescription,
                // Add theme-specific modifiers if needed
                themeModifiers: this.calculateThemeModifiers(theme, archetypeKey)
            };
        });
        
        // Handle custom themes
        if (customDescription && theme === 'custom') {
            this.adaptToCustomTheme(factions, customDescription);
        }
        
        return factions;
    }

    /**
     * Calculate theme-specific modifiers for faction behavior
     * @param {string} theme - Current theme
     * @param {string} archetypeKey - Faction archetype key
     * @returns {Object} Theme modifiers
     */
    calculateThemeModifiers(theme, archetypeKey) {
        const modifiers = {
            reputationGainMultiplier: 1.0,
            conflictIntensity: 1.0,
            economicInfluence: 1.0
        };
        
        // Theme-specific adjustments
        switch (theme) {
            case 'cyberpunk':
                if (archetypeKey === 'authority') modifiers.economicInfluence = 1.5; // Corps have more power
                if (archetypeKey === 'shadows') modifiers.reputationGainMultiplier = 1.3; // Hacking culture
                break;
            case 'horror':
                if (archetypeKey === 'naturalists') modifiers.conflictIntensity = 1.4; // Occult conflicts
                if (archetypeKey === 'common') modifiers.reputationGainMultiplier = 1.2; // Survival bonds
                break;
            case 'western':
                if (archetypeKey === 'warriors') modifiers.reputationGainMultiplier = 1.3; // Gun culture
                if (archetypeKey === 'authority') modifiers.conflictIntensity = 0.8; // Weak law
                break;
        }
        
        return modifiers;
    }

    /**
     * Adapt factions to custom theme using simple keyword analysis
     * @param {Object} factions - Faction object to modify
     * @param {string} customDescription - Custom theme description
     */
    adaptToCustomTheme(factions, customDescription) {
        const keywords = customDescription.toLowerCase();
        
        // Simple keyword-based adaptation
        if (keywords.includes('magic') || keywords.includes('wizard')) {
            factions.scholars.name = 'Mages';
            factions.scholars.flavor = 'Practitioners of magical arts';
        }
        
        if (keywords.includes('space') || keywords.includes('alien')) {
            factions.authority.name = 'Federation';
            factions.warriors.name = 'Space Marines';
        }
        
        if (keywords.includes('robot') || keywords.includes('ai')) {
            factions.scholars.name = 'Technicians';
            factions.authority.name = 'AI Council';
        }
        
        // Add more keyword patterns as needed
    }

    /**
     * Get reputation effects for a specific choice type and faction
     * @param {string} choiceType - Type of choice (Good, Bad, Risky, etc.)
     * @param {string} factionKey - Faction archetype key
     * @param {Object} context - Additional context
     * @returns {number} Reputation change amount
     */
    calculateReputationChange(choiceType, factionKey, context = {}) {
        const faction = this.factionArchetypes[factionKey];
        if (!faction) return 0;
        
        const baseChanges = {
            Good: {
                authority: [2, 5],
                common: [1, 3],
                scholars: [1, 2],
                naturalists: [1, 2],
                warriors: [-1, 0],
                shadows: [-2, -1]
            },
            Bad: {
                authority: [-8, -3],
                common: [-5, -2],
                scholars: [-3, -1],
                naturalists: [-5, -2],
                warriors: [1, 2],
                shadows: [2, 4]
            },
            Risky: {
                warriors: [2, 4],
                shadows: [1, 3],
                authority: [-1, 2],
                common: [-1, 1],
                scholars: [0, 1],
                naturalists: [0, 1]
            },
            Investigative: {
                scholars: [3, 5],
                naturalists: [1, 2],
                common: [1, 1],
                authority: [0, 1],
                warriors: [0, 0],
                shadows: [0, 1]
            },
            Silly: {
                common: [1, 2],
                shadows: [1, 1],
                authority: [-2, -1],
                warriors: [0, 0],
                scholars: [0, 0],
                naturalists: [0, 0]
            }
        };
        
        const changeRange = baseChanges[choiceType]?.[factionKey] || [0, 0];
        const baseChange = Math.floor(Math.random() * (changeRange[1] - changeRange[0] + 1)) + changeRange[0];
        
        // Apply theme modifiers
        const factions = this.getContextualizedFactions();
        const themeMultiplier = factions[factionKey]?.themeModifiers?.reputationGainMultiplier || 1.0;
        
        return Math.round(baseChange * themeMultiplier);
    }

    /**
     * Get price modifier for item based on faction reputation
     * @param {string} factionKey - Faction controlling the market
     * @param {number} reputation - Current reputation with faction
     * @returns {number} Price multiplier
     */
    getPriceModifier(factionKey, reputation) {
        const faction = this.factionArchetypes[factionKey];
        if (!faction) return 1.0;
        
        const modifiers = faction.priceModifier;
        
        if (reputation >= 80) return modifiers.high;
        if (reputation >= 60) return modifiers.high + (modifiers.neutral - modifiers.high) * 0.5;
        if (reputation >= 40) return modifiers.neutral + (modifiers.high - modifiers.neutral) * 0.3;
        if (reputation >= 20) return modifiers.neutral + (modifiers.high - modifiers.neutral) * 0.1;
        if (reputation >= 0) return modifiers.neutral;
        if (reputation >= -20) return modifiers.neutral + (modifiers.low - modifiers.neutral) * 0.2;
        if (reputation >= -40) return modifiers.neutral + (modifiers.low - modifiers.neutral) * 0.5;
        if (reputation >= -60) return modifiers.neutral + (modifiers.low - modifiers.neutral) * 0.8;
        
        return modifiers.low;
    }

    /**
     * Generate faction-appropriate NPC data for encounters
     * @param {string} factionKey - Faction archetype key
     * @param {number} reputation - Current reputation with faction
     * @returns {Object} NPC behavior modifiers
     */
    getFactionNPCBehavior(factionKey, reputation) {
        const faction = this.factionArchetypes[factionKey];
        if (!faction) return { hostility: 0, helpfulness: 0, trustLevel: 'neutral' };
        
        let hostility = 0;
        let helpfulness = 0;
        let trustLevel = 'neutral';
        
        if (reputation >= 60) {
            hostility = -2;
            helpfulness = 2;
            trustLevel = 'trusted';
        } else if (reputation >= 20) {
            hostility = -1;
            helpfulness = 1;
            trustLevel = 'friendly';
        } else if (reputation >= -20) {
            hostility = 0;
            helpfulness = 0;
            trustLevel = 'neutral';
        } else if (reputation >= -60) {
            hostility = 1;
            helpfulness = -1;
            trustLevel = 'suspicious';
        } else {
            hostility = 2;
            helpfulness = -2;
            trustLevel = 'hostile';
        }
        
        return { hostility, helpfulness, trustLevel };
    }

/**
 * Calculate trust level - core metric for gameplay difficulty
 * @param {Object} reputationData - All faction reputations
 * @returns {Object} Trust analysis
 */
calculateTrustLevel(reputationData) {
    const factions = Object.values(reputationData);
    const totalRep = factions.reduce((sum, rep) => sum + rep, 0);
    const averageRep = totalRep / factions.length;
    
    // Count hostile factions (reputation <= -20)
    const hostileFactions = factions.filter(rep => rep <= -20).length;
    
    // Count trusted factions (reputation >= 60)
    const trustedFactions = factions.filter(rep => rep >= 60).length;
    
    // Calculate trust penalty (0 = no penalty, 1 = maximum penalty)
    let trustPenalty = 0;
    
    // Base penalty from average reputation
    if (averageRep < -40) trustPenalty += 0.5;
    else if (averageRep < -20) trustPenalty += 0.3;
    else if (averageRep < 0) trustPenalty += 0.1;
    
    // Additional penalty for having many hostile factions
    trustPenalty += (hostileFactions / factions.length) * 0.4;
    
    // Reduce penalty for having trusted factions
    trustPenalty -= (trustedFactions / factions.length) * 0.2;
    
    // Clamp between 0 and 1
    trustPenalty = Math.max(0, Math.min(1, trustPenalty));
    
    return {
        averageReputation: averageRep,
        hostileFactions,
        trustedFactions,
        trustPenalty, // 0-1 scale
        trustLevel: trustPenalty < 0.2 ? 'trusted' : 
                   trustPenalty < 0.4 ? 'neutral' :
                   trustPenalty < 0.7 ? 'distrusted' : 'pariah'
    };
}

/**
 * Get available services based on reputation
 * @param {Object} reputationData - All faction reputations
 * @returns {Array} Available services
 */
getAvailableServices(reputationData) {
        const services = [];
        
        Object.entries(reputationData).forEach(([factionKey, reputation]) => {
            const faction = this.factionArchetypes[factionKey];
            if (!faction) return;
            
            if (reputation >= 60) {
                switch (factionKey) {
                    case 'authority':
                        services.push('banking', 'safe_storage', 'political_protection');
                        break;
                    case 'warriors':
                        services.push('combat_training', 'equipment_insurance', 'bodyguard');
                        break;
                    case 'naturalists':
                        services.push('healing_discount', 'weather_protection', 'animal_companion');
                        break;
                    case 'shadows':
                        services.push('information_network', 'black_market', 'stealth_training');
                        break;
                    case 'scholars':
                        services.push('item_identification', 'magical_research', 'spell_scrolls');
                        break;
                    case 'common':
                        services.push('free_lodging', 'community_support', 'local_information');
                        break;
                }
            }
        });
        
        return services;
    }

    /**
     * Get trust-based difficulty modifiers for various game systems
     * @param {Object} reputationData - All faction reputations
     * @returns {Object} Difficulty modifiers
     */
    getTrustDifficultyModifiers(reputationData) {
        const trust = this.calculateTrustLevel(reputationData);
        const penalty = trust.trustPenalty;
        
        return {
            // Combat difficulty increases
            enemyStrengthMultiplier: 1 + (penalty * 0.3), // Up to 30% stronger enemies
            encounterFrequency: 1 + (penalty * 0.5), // Up to 50% more encounters
            ambushChance: penalty * 0.4, // Up to 40% chance of ambushes
            
            // Help and assistance penalties
            npcHelpChance: 1 - (penalty * 0.8), // Up to 80% less help from NPCs
            informationQuality: 1 - (penalty * 0.6), // Up to 60% worse information
            allySupport: 1 - (penalty * 0.7), // Up to 70% less ally support
            
            // Resource and economic penalties
            lootQuality: 1 - (penalty * 0.4), // Up to 40% worse loot
            healingEfficiency: 1 - (penalty * 0.3), // Up to 30% less healing
            serviceAvailability: 1 - (penalty * 0.9), // Up to 90% fewer services
            
            // Exploration and puzzle penalties
            hintAvailability: 1 - (penalty * 0.8), // Up to 80% fewer hints
            safePassage: 1 - (penalty * 0.6), // Up to 60% less safe passage
            warningChance: 1 - (penalty * 0.7), // Up to 70% fewer warnings
            
            // Trust level and penalty for display
            trustLevel: trust.trustLevel,
            trustPenalty: penalty,
            
            // Specific penalties by trust level
            penalties: this.getTrustLevelPenalties(trust.trustLevel)
        };
    }
    
    /**
     * Get specific penalties based on trust level
     * @param {string} trustLevel - Current trust level
     * @returns {Array} Array of penalty descriptions
     */
    getTrustLevelPenalties(trustLevel) {
        switch (trustLevel) {
            case 'trusted':
                return []; // No penalties, may even get bonuses
            case 'neutral':
                return [
                    'Slightly less helpful NPCs',
                    'Occasional higher prices'
                ];
            case 'distrusted':
                return [
                    'NPCs provide less information',
                    'Enemies are more aggressive',
                    'Fewer services available',
                    'Higher encounter rates',
                    'Less effective healing'
                ];
            case 'pariah':
                return [
                    'Most NPCs are hostile or unhelpful',
                    'Enemies actively hunt you',
                    'Very few services available',
                    'Frequent dangerous encounters',
                    'Significantly reduced healing',
                    'No warnings about dangers',
                    'Ambushes are common',
                    'Poor quality loot and rewards'
                ];
            default:
                return [];
        }
    }
}

// Initialize the reputation contextualizer
export const reputationContextualizer = new ReputationContextualizer();

/**
 * Main entry point for getting contextualized factions
 * @param {string} theme - Optional theme override
 * @returns {Object} Contextualized faction data
 */
export function getContextualizedFactions(theme = null) {
    return reputationContextualizer.getContextualizedFactions(theme, gameState.customThemeDescription);
}

/**
 * Calculate reputation change for a choice
 * @param {string} choiceType - Type of choice made
 * @param {Object} context - Additional context
 * @returns {Object} Reputation changes for all factions
 */
export function calculateChoiceReputationEffects(choiceType, context = {}) {
    const changes = {};
    
    Object.keys(reputationContextualizer.factionArchetypes).forEach(factionKey => {
        changes[factionKey] = reputationContextualizer.calculateReputationChange(choiceType, factionKey, context);
    });
    
    return changes;
}

/**
 * Get all price modifiers based on current reputation
 * @param {Object} reputationData - Current reputation with all factions
 * @returns {Object} Price modifiers by faction
 */
export function calculatePriceModifiers(reputationData) {
    const modifiers = {};
    
    Object.entries(reputationData).forEach(([factionKey, reputation]) => {
        modifiers[factionKey] = reputationContextualizer.getPriceModifier(factionKey, reputation);
    });
    
    return modifiers;
}

/**
 * Get trust-based difficulty modifiers for the current reputation state
 * @param {Object} reputationData - Current reputation with all factions
 * @returns {Object} Trust difficulty modifiers
 */
export function getTrustDifficultyModifiers(reputationData) {
    return reputationContextualizer.getTrustDifficultyModifiers(reputationData);
}

/**
 * Calculate current trust level
 * @param {Object} reputationData - Current reputation with all factions
 * @returns {Object} Trust analysis
 */
export function calculateTrustLevel(reputationData) {
    return reputationContextualizer.calculateTrustLevel(reputationData);
}
