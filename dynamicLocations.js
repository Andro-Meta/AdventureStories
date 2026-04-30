// dynamicLocations.js
// Revolutionary Dynamic Location Generation System with Theme Intelligence
// Replaces static location maps with intelligent, story-driven generation

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as ThemeIntelligence from './themeIntelligence.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';
import { generateId, getRandomInt, getRandomElement } from './utils.js?cb=014';
import { gemmaHT } from './gemmaHyperthreading.js?cb=014';

/**
 * Dynamic Location Registry - Generates contextually perfect locations for infinite themes
 * Creates story-driven worlds that serve the narrative
 */
export class DynamicLocationRegistry {
    constructor() {
        // Core location storage
        this.generatedLocations = new Map();      // locationId -> location object
        this.contextualCache = new Map();         // contextKey -> [locationIds]
        this.themePatterns = new Map();           // theme -> successful location patterns
        this.storyRelevantLocations = new Map();  // storyContext -> [locationIds]
        this.locationConnections = new Map();     // locationId -> [connectedLocationIds]
        
        // Location-specific intelligence
        this.locationArchetypes = new Map();      // theme -> location archetypes
        this.progressionPaths = new Map();        // theme -> progression patterns
        this.narrativePurposes = new Map();       // purpose -> location types
        
        // Performance optimization
        this.recentRequests = new Map();          // Prevent duplicate AI calls
        this.generationQueue = [];                // Queue for batch generation
        
        // Quality control & learning
        this.locationQualityScores = new Map();   // locationId -> quality score (0-1)
        this.playerFeedback = new Map();          // locationId -> engagement score
        this.storyImpact = new Map();             // locationId -> narrative impact
        this.explorationSuccess = new Map();      // locationId -> exploration outcomes
        
        this.initializeLocationPatterns();
    }

    /**
     * Initialize location patterns for different themes and narrative purposes
     */
    initializeLocationPatterns() {
        // Location archetypes by theme
        this.locationArchetypes.set('haunted_mansion', {
            types: ['grand_foyer', 'library', 'ballroom', 'servants_quarters', 'attic', 'basement', 'secret_passage', 'master_bedroom', 'conservatory', 'wine_cellar'],
            atmospheres: ['oppressive', 'melancholic', 'terrifying', 'mysterious', 'sorrowful', 'ominous'],
            features: ['cobwebs', 'dust_motes', 'creaking_floors', 'cold_spots', 'moving_shadows', 'whispers', 'portraits_with_eyes', 'flickering_candles'],
            purposes: ['revelation', 'confrontation', 'mystery', 'backstory', 'puzzle', 'escape', 'climax'],
            dangerLevels: [0.2, 0.4, 0.6, 0.8, 0.9]
        });

        this.locationArchetypes.set('cyberpunk_city', {
            types: ['neon_district', 'corporate_tower', 'underground_market', 'data_haven', 'augmentation_clinic', 'rooftop_garden', 'server_farm', 'abandoned_factory', 'night_club', 'police_station'],
            atmospheres: ['neon_soaked', 'corporate_sterile', 'underground_gritty', 'high_tech', 'dystopian', 'electric'],
            features: ['holographic_ads', 'rain_slicked_streets', 'neon_lights', 'surveillance_drones', 'augmented_citizens', 'data_streams', 'corporate_logos', 'street_vendors'],
            purposes: ['information_gathering', 'hacking', 'chase', 'negotiation', 'infiltration', 'revelation', 'confrontation'],
            dangerLevels: [0.1, 0.3, 0.5, 0.7, 0.9]
        });

        this.locationArchetypes.set('medieval_castle', {
            types: ['throne_room', 'great_hall', 'armory', 'chapel', 'dungeon', 'tower', 'courtyard', 'stables', 'kitchen', 'library', 'treasury', 'ramparts'],
            atmospheres: ['regal', 'imposing', 'sacred', 'foreboding', 'martial', 'scholarly', 'festive'],
            features: ['tapestries', 'suits_of_armor', 'stone_walls', 'torches', 'banners', 'stained_glass', 'wooden_beams', 'iron_gates'],
            purposes: ['audience', 'combat_training', 'worship', 'imprisonment', 'defense', 'learning', 'celebration'],
            dangerLevels: [0.1, 0.2, 0.4, 0.6, 0.8]
        });

        this.locationArchetypes.set('space_station', {
            types: ['command_bridge', 'engineering', 'hydroponics', 'docking_bay', 'crew_quarters', 'medical_bay', 'observation_deck', 'cargo_hold', 'reactor_core', 'communications'],
            atmospheres: ['sterile', 'cramped', 'high_tech', 'isolated', 'functional', 'claustrophobic'],
            features: ['control_panels', 'viewports', 'artificial_gravity', 'air_recyclers', 'emergency_lights', 'blast_doors', 'zero_g_sections', 'life_support_systems'],
            purposes: ['navigation', 'repair', 'research', 'docking', 'rest', 'medical', 'observation', 'storage'],
            dangerLevels: [0.2, 0.4, 0.6, 0.8, 1.0]
        });

        this.locationArchetypes.set('underwater_city', {
            types: ['coral_plaza', 'kelp_forest', 'deep_trench', 'thermal_vents', 'sunken_ship', 'pearl_gardens', 'current_tunnels', 'pressure_chambers', 'bioluminescent_caves', 'tidal_pools'],
            atmospheres: ['serene', 'mysterious', 'alien', 'beautiful', 'dangerous', 'ancient'],
            features: ['flowing_water', 'marine_life', 'bioluminescence', 'pressure_changes', 'coral_formations', 'underwater_currents', 'air_pockets', 'ancient_ruins'],
            purposes: ['exploration', 'discovery', 'sanctuary', 'danger', 'mystery', 'beauty', 'challenge'],
            dangerLevels: [0.1, 0.3, 0.5, 0.7, 0.9]
        });

        // Narrative purposes mapping
        this.narrativePurposes.set('introduction', ['safe_haven', 'starting_area', 'tutorial_zone']);
        this.narrativePurposes.set('exploration', ['wilderness', 'ruins', 'unknown_territory']);
        this.narrativePurposes.set('challenge', ['dangerous_area', 'enemy_stronghold', 'hazardous_zone']);
        this.narrativePurposes.set('revelation', ['library', 'archive', 'sacred_site', 'hidden_chamber']);
        this.narrativePurposes.set('confrontation', ['arena', 'throne_room', 'final_chamber', 'battlefield']);
        this.narrativePurposes.set('rest', ['inn', 'safe_house', 'sanctuary', 'camp']);
        this.narrativePurposes.set('mystery', ['abandoned_place', 'crime_scene', 'puzzle_chamber']);
        this.narrativePurposes.set('climax', ['final_destination', 'boss_lair', 'ultimate_chamber']);
    }

    /**
     * Generate a contextually perfect location
     * @param {object} context - Current game context and requirements
     * @returns {Promise<object>} Generated location
     */
    async generateContextualLocation(context = {}) {
        const log = window.displayVisualError || console.log;
        log(`Generating contextual location for ${context.theme || gameState.adventureTheme}`);

        // Build comprehensive context key for caching
        const contextKey = this.buildContextKey(context);
        
        // Check cache first
        const cachedLocations = this.contextualCache.get(contextKey);
        if (cachedLocations && cachedLocations.length > 0) {
            // Return highest quality cached location
            const bestLocation = this.selectBestCachedLocation(cachedLocations);
            if (bestLocation) {
                log(`DynamicLocations: Using cached location: ${bestLocation.name}`);
                return bestLocation;
            }
        }

        // Check if we've made this request recently
        if (this.recentRequests.has(contextKey)) {
            const timeSince = Date.now() - this.recentRequests.get(contextKey);
            if (timeSince < 5000) { // 5 second cooldown
                log(`DynamicLocations: Request too recent, using fallback`);
                return this.generateFallbackLocation(context);
            }
        }

        // Analyze context for perfect theming
        const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
        
        // Build comprehensive context
        const enhancedContext = {
            ...context,
            theme: context.theme || gameState.adventureTheme,
            currentLocation: context.currentLocation || gameState.currentLocation,
            storyContext: context.storyContext || gameState.currentNarrative?.slice(-300),
            narrativePurpose: this.analyzeNarrativePurpose(context),
            progressionNeeds: this.analyzeProgressionNeeds(context),
            thematicElements: contextualAnalysis.thematicElements,
            environmentalFactors: contextualAnalysis.environmentalFactors
        };

        try {
            this.recentRequests.set(contextKey, Date.now());
            
            // Generate location using AI
            const generatedLocation = await this.generateSingleLocation(enhancedContext);
            
            if (generatedLocation) {
                // Store in registry with quality analysis
                this.storeGeneratedLocation(generatedLocation, contextKey, enhancedContext);
                log(`DynamicLocations: Generated new location: ${generatedLocation.name}`);
                return generatedLocation;
            }
        } catch (error) {
            log(`DynamicLocations: AI generation failed: ${error.message}`);
        }

        // Fallback to template-based generation
        return this.generateFallbackLocation(context);
    }

    /**
     * Generate a single contextual location
     */
    async generateSingleLocation(context) {
        const log = window.displayVisualError || console.log;
        
        try {
            // Get theme-specific location patterns
            const locationKey = this.getLocationKey(context.theme);
            const locationPatterns = this.locationArchetypes.get(locationKey) || this.getGenericLocationPatterns(context.theme);
            
            // Build AI prompt for location generation
            const locationPrompt = this.buildLocationGenerationPrompt(context, locationPatterns);
            
            // Generate location using AI
            const aiResponse = await this.callLocationAgent(locationPrompt, 'location_generation');
            const locationData = this.parseLocationResponse(aiResponse, context, locationPatterns);
            
            // Create location object
            const location = {
                id: generateId('location'),
                name: locationData.name,
                type: locationData.type,
                description: locationData.description,
                atmosphere: locationData.atmosphere,
                
                // Gameplay properties
                dangerLevel: locationData.dangerLevel || 0.3,
                isStarting: locationData.isStarting || false,
                isEnding: locationData.isEnding || false,
                
                // Features and interactables
                features: locationData.features || [],
                interactables: locationData.interactables || [],
                secrets: locationData.secrets || [],
                
                // Navigation
                connections: locationData.connections || [],
                accessRequirements: locationData.accessRequirements || [],
                
                // Story integration
                narrativePurpose: context.narrativePurpose,
                storyRelevance: locationData.storyRelevance || 'moderate',
                plotHooks: locationData.plotHooks || [],
                
                // Environmental effects
                environmentalEffects: locationData.environmentalEffects || [],
                ambientSounds: locationData.ambientSounds || [],
                lighting: locationData.lighting || 'normal',
                
                // Context tracking
                thematicElements: context.thematicElements,
                createdAt: Date.now(),
                isDynamic: true
            };
            
            log(`Generated location: ${location.name} (${location.type})`);
            return location;
            
        } catch (error) {
            log(`Location generation failed: ${error.message}`);
            return this.generateFallbackLocation(context);
        }
    }

    /**
     * Call the Location Agent for AI-driven generation
     */
    async callLocationAgent(prompt, generationType) {
        try {
            // (Removed dead `apiProvider === 'aistudio'` Gemma-hyperthreading
            // branch. Local backend handles all generation now.)
            const AI = await import('./aiHandler.js?cb=014');
            const response = await AI.makeAICallForSystemAction(prompt, true);
            return response.narrative;
        } catch (error) {
            throw new Error(`Location agent failed: ${error.message}`);
        }
    }

    /**
     * Build AI prompt for location generation
     */
    buildLocationGenerationPrompt(context, patterns) {
        const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
        
        return `Create a contextually perfect location for a ${context.theme} adventure.

STORY CONTEXT:
- Current Narrative: ${context.storyContext || 'exploration'}
- Narrative Purpose: ${context.narrativePurpose}
- Progression Needs: ${context.progressionNeeds.join(', ') || 'exploration'}
- Current Location: ${context.currentLocation?.name || 'Unknown'}

THEMATIC REQUIREMENTS:
- Theme: ${context.theme}
- Thematic Elements: ${context.thematicElements.join(', ') || 'general'}
- Location Types: ${patterns.types.join(', ')}
- Atmospheres: ${patterns.atmospheres.join(', ')}
- Features: ${patterns.features.join(', ')}

GAMEPLAY REQUIREMENTS:
- Danger Levels: ${patterns.dangerLevels.join(', ')}
- Story Relevance: Must serve the narrative purpose
- Player Progression: Should advance the story meaningfully

Create a location that is PERFECTLY thematic and story-relevant. Respond with ONLY a JSON object:
{
    "name": "Location name fitting the theme and story",
    "type": "Location type from the provided list",
    "description": "Rich, atmospheric description that sets the scene",
    "atmosphere": "Dominant atmosphere from the provided list",
    "dangerLevel": 0.5,
    "features": ["feature1", "feature2", "feature3"],
    "interactables": ["object1", "object2"],
    "secrets": ["hidden1", "hidden2"],
    "connections": ["direction1", "direction2", "direction3"],
    "accessRequirements": ["requirement1", "requirement2"],
    "storyRelevance": "minor|moderate|major|critical",
    "plotHooks": ["hook1", "hook2"],
    "environmentalEffects": ["effect1", "effect2"],
    "ambientSounds": ["sound1", "sound2"],
    "lighting": "dim|normal|bright|flickering|colorful",
    "isStarting": false,
    "isEnding": false
}`;
    }

    /**
     * Build context key for caching
     */
    buildContextKey(context) {
        const keyParts = [
            context.theme || gameState.adventureTheme,
            context.narrativePurpose || 'exploration',
            context.storyContext?.slice(0, 50) || 'general',
            gameState.turn || 1,
            (context.progressionNeeds || []).join(','),
            (context.thematicElements || []).slice(0, 3).join(',')
        ];
        
        return keyParts.join('|');
    }

    /**
     * Store generated location with quality analysis
     */
    storeGeneratedLocation(location, contextKey, context) {
        const log = window.displayVisualError || console.log;
        
        // Store the location
        this.generatedLocations.set(location.id, location);
        
        // Add to contextual cache
        if (!this.contextualCache.has(contextKey)) {
            this.contextualCache.set(contextKey, []);
        }
        this.contextualCache.get(contextKey).push(location.id);
        
        // Store story relevance
        if (context.storyContext) {
            const storyKey = context.storyContext.slice(0, 100);
            if (!this.storyRelevantLocations.has(storyKey)) {
                this.storyRelevantLocations.set(storyKey, []);
            }
            this.storyRelevantLocations.get(storyKey).push(location.id);
        }
        
        // Initialize quality score
        const initialQuality = this.calculateInitialQuality(location, context);
        this.locationQualityScores.set(location.id, initialQuality);
        
        log(`Stored location ${location.id} with quality score: ${initialQuality.toFixed(2)}`);
    }

    /**
     * Select best cached location
     */
    selectBestCachedLocation(locationIds) {
        if (!locationIds || locationIds.length === 0) return null;
        
        let bestLocation = null;
        let bestScore = -1;
        
        for (const locationId of locationIds) {
            const location = this.generatedLocations.get(locationId);
            const quality = this.locationQualityScores.get(locationId) || 0;
            
            if (location && quality > bestScore) {
                bestScore = quality;
                bestLocation = location;
            }
        }
        
        return bestLocation;
    }

    /**
     * Calculate initial quality score
     */
    calculateInitialQuality(location, context) {
        let quality = 0.5; // Base quality
        
        // Theme relevance
        if (location.thematicElements && location.thematicElements.length > 0) {
            quality += 0.2;
        }
        
        // Story integration
        if (location.storyRelevance === 'critical') quality += 0.2;
        else if (location.storyRelevance === 'major') quality += 0.15;
        else if (location.storyRelevance === 'moderate') quality += 0.1;
        
        // Feature richness
        if (location.features && location.features.length > 2) {
            quality += 0.1;
        }
        
        // Narrative purpose alignment
        if (location.narrativePurpose && location.narrativePurpose !== 'unknown') {
            quality += 0.1;
        }
        
        // Dynamic generation bonus
        if (location.isDynamic) {
            quality += 0.1;
        }
        
        return Math.min(quality, 1.0);
    }

    /**
     * Generate fallback location using theme intelligence
     */
    generateFallbackLocation(context) {
        const log = window.displayVisualError || console.log;
        log(`Generating fallback location for ${context.theme}`);
        
        try {
            // Use theme intelligence for fallback generation
            const contextualAnalysis = ThemeIntelligence.analyzeContextForAbilities(context);
            const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
            
            const locationKey = this.getLocationKey(context.theme);
            const patterns = this.locationArchetypes.get(locationKey) || this.getGenericLocationPatterns(context.theme);
            
            const thematicElements = contextualAnalysis.thematicElements.slice(0, 2);
            const locationName = thematicElements.length > 0 ? 
                `${thematicElements[0].charAt(0).toUpperCase() + thematicElements[0].slice(1)} ${patterns.types[0] || 'Area'}` :
                `Mysterious ${patterns.types[0] || 'Area'}`;
            
            const location = {
                id: generateId('location'),
                name: locationName,
                type: patterns.types[0] || 'unknown',
                description: `A ${patterns.atmospheres[0] || 'mysterious'} ${patterns.types[0] || 'area'} that ${context.narrativePurpose === 'exploration' ? 'beckons to be explored' : 'serves the story'}.`,
                atmosphere: patterns.atmospheres[0] || 'mysterious',
                
                // Basic properties
                dangerLevel: patterns.dangerLevels[Math.floor(patterns.dangerLevels.length / 2)] || 0.3,
                isStarting: context.narrativePurpose === 'introduction',
                isEnding: context.narrativePurpose === 'climax',
                
                // Basic features
                features: patterns.features?.slice(0, 3) || ['mysterious_elements'],
                interactables: ['examine_area', 'search_surroundings'],
                secrets: [],
                
                // Basic navigation
                connections: ['north', 'south', 'east', 'west'].slice(0, Math.floor(Math.random() * 3) + 1),
                accessRequirements: [],
                
                // Story properties
                narrativePurpose: context.narrativePurpose || 'exploration',
                storyRelevance: 'moderate',
                plotHooks: [],
                
                // Environmental
                environmentalEffects: [],
                ambientSounds: patterns.atmospheres[0] ? [`${patterns.atmospheres[0]}_sounds`] : [],
                lighting: 'normal',
                
                // Context
                thematicElements: thematicElements,
                createdAt: Date.now(),
                isDynamic: false,
                isFallback: true
            };
            
            return location;
            
        } catch (error) {
            log(`Fallback location generation failed: ${error.message}`);
            return this.generateUltimateFallbackLocation(context);
        }
    }

    /**
     * Generate ultimate fallback location
     */
    generateUltimateFallbackLocation(context) {
        return {
            id: generateId('location'),
            name: 'Mysterious Area',
            type: 'unknown',
            description: 'A place of mystery and possibility awaits exploration.',
            atmosphere: 'mysterious',
            dangerLevel: 0.3,
            isStarting: false,
            isEnding: false,
            features: ['unknown_elements'],
            interactables: ['explore'],
            secrets: [],
            connections: ['continue'],
            accessRequirements: [],
            narrativePurpose: context.narrativePurpose || 'exploration',
            storyRelevance: 'minor',
            plotHooks: [],
            environmentalEffects: [],
            ambientSounds: [],
            lighting: 'normal',
            createdAt: Date.now(),
            isDynamic: false,
            isFallback: true,
            isUltimateFallback: true
        };
    }

    // Helper methods
    getLocationKey(theme) {
        if (!theme) return 'generic';
        
        // Ensure theme is a string before calling toLowerCase
        const themeStr = typeof theme === 'string' ? theme : String(theme);
        const themeName = themeStr.toLowerCase();
        
        if (themeName.includes('haunted') || themeName.includes('mansion') || themeName.includes('ghost')) {
            return 'haunted_mansion';
        }
        if (themeName.includes('cyber') || themeName.includes('punk') || themeName.includes('corporate')) {
            return 'cyberpunk_city';
        }
        if (themeName.includes('medieval') || themeName.includes('castle') || themeName.includes('knight')) {
            return 'medieval_castle';
        }
        if (themeName.includes('space') || themeName.includes('station') || themeName.includes('sci')) {
            return 'space_station';
        }
        if (themeName.includes('underwater') || themeName.includes('ocean') || themeName.includes('sea')) {
            return 'underwater_city';
        }
        
        return 'generic';
    }

    analyzeNarrativePurpose(context) {
        if (context.storyContext?.includes('beginning') || context.storyContext?.includes('start')) {
            return 'introduction';
        }
        if (context.storyContext?.includes('final') || context.storyContext?.includes('climax')) {
            return 'climax';
        }
        if (context.storyContext?.includes('rest') || context.storyContext?.includes('safe')) {
            return 'rest';
        }
        if (context.storyContext?.includes('fight') || context.storyContext?.includes('battle')) {
            return 'confrontation';
        }
        if (context.storyContext?.includes('learn') || context.storyContext?.includes('discover')) {
            return 'revelation';
        }
        if (context.storyContext?.includes('mystery') || context.storyContext?.includes('investigate')) {
            return 'mystery';
        }
        
        return 'exploration';
    }

    analyzeProgressionNeeds(context) {
        const needs = [];
        
        if (context.storyContext?.includes('challenge')) needs.push('difficulty_increase');
        if (context.storyContext?.includes('information')) needs.push('revelation_opportunity');
        if (context.storyContext?.includes('rest')) needs.push('safe_haven');
        if (context.storyContext?.includes('equipment')) needs.push('resource_access');
        if (gameState.turn && gameState.turn > 20) needs.push('advanced_area');
        
        return needs.length > 0 ? needs : ['story_progression'];
    }

    getGenericLocationPatterns(theme) {
        return {
            types: ['area', 'zone', 'region', 'place'],
            atmospheres: ['mysterious', 'intriguing', 'atmospheric', 'evocative'],
            features: ['interesting_details', 'notable_elements', 'atmospheric_touches'],
            purposes: ['exploration', 'discovery', 'progression'],
            dangerLevels: [0.1, 0.3, 0.5, 0.7]
        };
    }

    parseLocationResponse(response, context, patterns) {
        try {
            const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
            return JSON.parse(cleanResponse);
        } catch (error) {
            return this.generateFallbackLocationData(context, patterns);
        }
    }

    generateFallbackLocationData(context, patterns) {
        return {
            name: `${patterns.types[0] || 'Area'}`,
            type: patterns.types[0] || 'unknown',
            description: 'A place that serves the story.',
            atmosphere: patterns.atmospheres[0] || 'mysterious',
            dangerLevel: patterns.dangerLevels[0] || 0.3,
            features: patterns.features?.slice(0, 2) || [],
            interactables: ['explore'],
            secrets: [],
            connections: ['continue'],
            accessRequirements: [],
            storyRelevance: 'moderate',
            plotHooks: [],
            environmentalEffects: [],
            ambientSounds: [],
            lighting: 'normal',
            isStarting: false,
            isEnding: false
        };
    }
}

// Initialize the dynamic location system
export const dynamicLocationRegistry = new DynamicLocationRegistry();

/**
 * Main entry point for generating locations - replaces static location data
 * @param {string} theme - Adventure theme
 * @param {object} context - Additional context for generation
 * @returns {Promise<object>} Generated location
 */
export async function generateDynamicLocation(theme, context = {}) {
    const registry = gameState.dynamicLocationRegistry || dynamicLocationRegistry;
    
    // Build enhanced context
    const enhancedContext = {
        ...context,
        theme: theme || gameState.adventureTheme,
        currentLocation: context.currentLocation || gameState.currentLocation,
        turn: gameState.turn,
        storyContext: context.storyContext || gameState.currentNarrative?.slice(-300),
        recentEvents: gameState.narrativeContext?.significantEvents?.slice(-3) || []
    };
    
    return await registry.generateContextualLocation(enhancedContext);
}

/**
 * Generate a starting location for a theme
 * @param {string} theme - Adventure theme
 * @returns {Promise<object>} Generated starting location
 */
export async function generateDynamicStartingLocation(theme) {
    const context = {
        theme: theme,
        narrativePurpose: 'introduction',
        storyContext: 'adventure begins',
        progressionNeeds: ['safe_introduction', 'story_setup']
    };
    
    const location = await generateDynamicLocation(theme, context);
    location.isStarting = true;
    location.dangerLevel = Math.min(location.dangerLevel, 0.2); // Ensure safe start
    
    return location;
}
