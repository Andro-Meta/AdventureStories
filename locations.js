// locations.js
// Handles location definitions, progression, and context for different adventure themes

// --- Module Imports ---
import { gameState } from './state.js?cb=014';
import { getRandomElement, getRandomInt } from './utils.js?cb=014';
import * as DynamicLocations from './dynamicLocations.js?cb=014';

/**
 * Location system manager
 */
export class LocationSystem {
    
    /**
     * Gets location definitions for a specific theme
     * @param {string} theme - Adventure theme
     * @returns {Array} Array of location objects
     */
    static getLocationsForTheme(theme) {
        const locations = this.locationData[theme] || this.locationData.fantasy;
        return [...locations]; // Return copy to prevent mutation
    }
    
    /**
     * Gets a starting location for a theme
     * @param {string} theme - Adventure theme
     * @returns {Object} Starting location object
     */
    static async getStartingLocation(theme) {
        const log = window.displayVisualError || console.log;
        log(`LocationSystem: Generating dynamic starting location for theme: ${theme}`);
        
        try {
            // Use revolutionary dynamic location generation
            const startingLocation = await DynamicLocations.generateDynamicStartingLocation(theme);
            
            if (startingLocation) {
                log(`LocationSystem: Generated dynamic starting location: ${startingLocation.name}`);
                return startingLocation;
            }
        } catch (error) {
            log(`LocationSystem: Dynamic starting location generation failed: ${error.message}`);
        }
        
        // Ultimate fallback
        log(`LocationSystem: Using fallback starting location for theme: ${theme}`);
        return {
            name: "Starting Area",
            type: "town",
            dangerLevel: 0.1,
            isStarting: true,
            description: "A safe place to begin your adventure.",
            atmosphere: "The adventure begins here.",
            connections: ["Unknown Path"],
            isDynamic: false,
            isFallback: true
        };
    }
    
    /**
     * Gets possible next locations from current location
     * @param {Object} currentLocation - Current location object
     * @param {string} theme - Adventure theme
     * @returns {Array} Array of possible next locations
     */
    static getPossibleNextLocations(currentLocation, theme) {
        const allLocations = this.getLocationsForTheme(theme);
        
        if (!currentLocation || !currentLocation.connections) {
            // If no connections defined, allow progression to similar danger level
            return allLocations.filter(loc => 
                loc.name !== currentLocation?.name &&
                Math.abs(loc.dangerLevel - (currentLocation?.dangerLevel || 0.1)) <= 0.3
            );
        }
        
        // Use defined connections
        return currentLocation.connections
            .map(connName => allLocations.find(loc => loc.name === connName))
            .filter(loc => loc !== undefined);
    }
    
    /**
     * Advances to a new location based on player choice or story progression
     * @param {string} direction - Direction or method of travel
     * @returns {Object|null} New location or null if no progression
     */
    static advanceLocation(direction = 'forward') {
        const log = window.displayVisualError || console.log;
        const currentLocation = gameState.currentLocation;
        const theme = gameState.adventureTheme;
        
        log(`Advancing location from ${currentLocation?.name || 'Unknown'} via ${direction}`);
        
        const possibleLocations = this.getPossibleNextLocations(currentLocation, theme);
        
        if (possibleLocations.length === 0) {
            log("No possible next locations found");
            return null;
        }
        
        // Choose next location based on direction and current progress
        let nextLocation;
        
        switch (direction) {
            case 'forward':
            case 'explore':
                // Progress to slightly more dangerous area
                nextLocation = this.selectProgressionLocation(possibleLocations, currentLocation);
                break;
            case 'retreat':
            case 'back':
                // Go to safer area
                nextLocation = this.selectSaferLocation(possibleLocations, currentLocation);
                break;
            case 'random':
                nextLocation = getRandomElement(possibleLocations);
                break;
            default:
                nextLocation = this.selectProgressionLocation(possibleLocations, currentLocation);
        }
        
        if (nextLocation) {
            gameState.currentLocation = { ...nextLocation };
            log(`Advanced to location: ${nextLocation.name}`);
            return nextLocation;
        }
        
        return null;
    }
    
    /**
     * Selects a location for forward progression
     * @param {Array} possibleLocations - Available locations
     * @param {Object} currentLocation - Current location
     * @returns {Object} Selected location
     */
    static selectProgressionLocation(possibleLocations, currentLocation) {
        const currentDanger = currentLocation?.dangerLevel || 0.1;
        
        // Prefer locations with slightly higher danger level
        const progressionLocations = possibleLocations.filter(loc => 
            loc.dangerLevel >= currentDanger && loc.dangerLevel <= currentDanger + 0.3
        );
        
        if (progressionLocations.length > 0) {
            return getRandomElement(progressionLocations);
        }
        
        // Fallback to any available location
        return getRandomElement(possibleLocations);
    }
    
    /**
     * Selects a safer location for retreat
     * @param {Array} possibleLocations - Available locations
     * @param {Object} currentLocation - Current location
     * @returns {Object} Selected location
     */
    static selectSaferLocation(possibleLocations, currentLocation) {
        const currentDanger = currentLocation?.dangerLevel || 0.1;
        
        // Prefer locations with lower danger level
        const saferLocations = possibleLocations.filter(loc => 
            loc.dangerLevel < currentDanger
        );
        
        if (saferLocations.length > 0) {
            return getRandomElement(saferLocations);
        }
        
        // Fallback to any available location
        return getRandomElement(possibleLocations);
    }
    
    /**
     * Gets context information for AI prompts based on current location
     * @param {Object} location - Location object
     * @returns {string} Context description
     */
    static getLocationContext(location) {
        if (!location) {
            return "You are in an unknown location.";
        }
        
        let context = `You are in ${location.name}`;
        
        if (location.description) {
            context += `. ${location.description}`;
        }
        
        if (location.atmosphere) {
            context += ` ${location.atmosphere}`;
        }
        
        return context;
    }
}

/**
 * Location data for different themes
 */
LocationSystem.locationData = {
    fantasy: [
        {
            name: "Village Square",
            type: "town",
            dangerLevel: 0.1,
            isStarting: true,
            description: "A peaceful village square with cobblestone paths and friendly merchants.",
            atmosphere: "The air is filled with the sounds of daily life and commerce.",
            connections: ["Forest Path", "Old Road", "Village Outskirts"]
        },
        {
            name: "Forest Path",
            type: "wilderness",
            dangerLevel: 0.3,
            description: "A winding path through dense woodland.",
            atmosphere: "Sunlight filters through the canopy above, creating dancing shadows.",
            connections: ["Village Square", "Deep Forest", "Forest Clearing"]
        },
        {
            name: "Deep Forest",
            type: "wilderness",
            dangerLevel: 0.5,
            description: "The heart of an ancient forest where few dare to tread.",
            atmosphere: "The trees grow thick here, blocking out most of the light.",
            connections: ["Forest Path", "Ancient Ruins", "Hidden Grove"]
        },
        {
            name: "Ancient Ruins",
            type: "ruins",
            dangerLevel: 0.7,
            description: "Crumbling stone structures from a forgotten civilization.",
            atmosphere: "An eerie silence hangs over these weathered stones.",
            connections: ["Deep Forest", "Underground Chamber", "Ruined Tower"]
        },
        {
            name: "Underground Chamber",
            type: "dungeon",
            dangerLevel: 0.8,
            description: "A dark chamber beneath the ruins, filled with mystery.",
            atmosphere: "The air is stale and heavy with the weight of ages.",
            connections: ["Ancient Ruins", "Treasure Vault"]
        },
        {
            name: "Treasure Vault",
            type: "dungeon",
            dangerLevel: 0.9,
            description: "The final chamber where ancient treasures are kept.",
            atmosphere: "Gold and jewels glint in the torchlight, but danger lurks in the shadows.",
            connections: ["Underground Chamber"]
        }
    ],
    
    space: [
        {
            name: "Space Station Alpha",
            type: "station",
            dangerLevel: 0.1,
            isStarting: true,
            description: "A bustling space station serving as a hub for interstellar travel.",
            atmosphere: "The hum of life support systems and chatter of diverse species fills the air.",
            connections: ["Docking Bay", "Commercial Sector", "Residential Deck"]
        },
        {
            name: "Asteroid Field",
            type: "space",
            dangerLevel: 0.4,
            description: "A treacherous field of floating rocks and debris.",
            atmosphere: "Navigation is difficult among the slowly tumbling asteroids.",
            connections: ["Space Station Alpha", "Mining Outpost", "Derelict Ship"]
        },
        {
            name: "Derelict Ship",
            type: "wreck",
            dangerLevel: 0.6,
            description: "An abandoned vessel drifting silently through space.",
            atmosphere: "Emergency lighting casts eerie red shadows through empty corridors.",
            connections: ["Asteroid Field", "Ship's Bridge", "Cargo Hold"]
        },
        {
            name: "Alien Planet Surface",
            type: "planet",
            dangerLevel: 0.7,
            description: "The surface of an unexplored alien world.",
            atmosphere: "Strange flora and fauna suggest this world harbors unknown dangers.",
            connections: ["Landing Site", "Alien Ruins", "Underground Caverns"]
        }
    ],
    
    pirate: [
        {
            name: "Port Royal",
            type: "town",
            dangerLevel: 0.2,
            isStarting: true,
            description: "A bustling pirate port filled with taverns and trading posts.",
            atmosphere: "The smell of salt air mixes with rum and adventure.",
            connections: ["Harbor", "Tavern District", "Ship Chandler"]
        },
        {
            name: "Open Seas",
            type: "ocean",
            dangerLevel: 0.4,
            description: "Endless blue waters stretching to the horizon.",
            atmosphere: "The wind fills your sails as seabirds cry overhead.",
            connections: ["Port Royal", "Mysterious Island", "Pirate Cove"]
        },
        {
            name: "Mysterious Island",
            type: "island",
            dangerLevel: 0.6,
            description: "A tropical island shrouded in legends and mystery.",
            atmosphere: "Dense jungle conceals ancient secrets and hidden dangers.",
            connections: ["Open Seas", "Jungle Path", "Hidden Beach"]
        },
        {
            name: "Treasure Cave",
            type: "cave",
            dangerLevel: 0.8,
            description: "A hidden cave where pirates have stashed their greatest treasures.",
            atmosphere: "The sound of dripping water echoes off walls lined with gold.",
            connections: ["Mysterious Island", "Underground River"]
        }
    ],
    
    underwater: [
        {
            name: "Coral Reef City",
            type: "city",
            dangerLevel: 0.1,
            isStarting: true,
            description: "A vibrant underwater city built within a living coral reef.",
            atmosphere: "Colorful fish swim between the coral buildings as bioluminescent plants provide light.",
            connections: ["Kelp Forest", "Deep Current", "Reef Outskirts"]
        },
        {
            name: "Kelp Forest",
            type: "forest",
            dangerLevel: 0.3,
            description: "Towering kelp fronds create an underwater forest.",
            atmosphere: "Sunlight filters down through the swaying kelp, creating an ethereal green glow.",
            connections: ["Coral Reef City", "Deep Trench", "Sunken Ship"]
        },
        {
            name: "Deep Trench",
            type: "abyss",
            dangerLevel: 0.7,
            description: "A dark chasm in the ocean floor where few creatures dare to venture.",
            atmosphere: "The pressure is immense and strange lights flicker in the depths.",
            connections: ["Kelp Forest", "Abyssal Plain", "Thermal Vents"]
        },
        {
            name: "Lost Atlantis",
            type: "ruins",
            dangerLevel: 0.9,
            description: "The legendary lost city, now claimed by the ocean depths.",
            atmosphere: "Ancient architecture stands testament to a civilization lost to time.",
            connections: ["Deep Trench", "Temple of the Deep"]
        }
    ]
};

/**
 * Convenience function to initialize location system
 * @param {string} theme - Adventure theme
 */
export async function initializeLocationSystem(theme) {
    const log = window.displayVisualError || console.log;
    log(`Initializing dynamic location system for theme: ${theme}`);
    
    try {
        const startingLocation = await LocationSystem.getStartingLocation(theme);
        gameState.currentLocation = startingLocation;
        
        log(`Set dynamic starting location: ${startingLocation.name}`);
        return startingLocation;
    } catch (error) {
        log(`Location system initialization failed: ${error.message}`);
        
        // Ultimate fallback
        const fallbackLocation = {
            name: "Starting Area",
            type: "town",
            dangerLevel: 0.1,
            isStarting: true,
            description: "A safe place to begin your adventure.",
            atmosphere: "The adventure begins here.",
            connections: ["Unknown Path"],
            isDynamic: false,
            isFallback: true
        };
        
        gameState.currentLocation = fallbackLocation;
        return fallbackLocation;
    }
}

/**
 * Convenience function to advance location
 * @param {string} direction - Direction to travel
 * @returns {Object|null} New location or null
 */
export function advanceToNextLocation(direction = 'forward') {
    return LocationSystem.advanceLocation(direction);
}

/**
 * Gets current location context for AI
 * @returns {string} Location context description
 */
export function getCurrentLocationContext() {
    return LocationSystem.getLocationContext(gameState.currentLocation);
}
