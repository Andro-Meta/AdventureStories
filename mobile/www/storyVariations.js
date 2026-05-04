/**
 * Dynamic Story Variation System
 * Generates unique story introductions, goals, and narratives for each theme
 * Ensures no two playthroughs are the same, even with the same theme
 */

import { gameState } from './state.js?cb=014';

/**
 * Story variation patterns for each theme
 * Each theme has multiple story seeds, goals, and narrative elements
 */
const STORY_VARIATIONS = {
    fantasy: {
        storySeeds: [
            {
                setting: "Ancient Elven Citadel",
                conflict: "corrupted by dark magic",
                mystery: "the source of the spreading shadow plague",
                urgency: "before it consumes the realm"
            },
            {
                setting: "Forgotten Dragon's Lair",
                conflict: "awakened from centuries of slumber",
                mystery: "why the ancient dragon has returned",
                urgency: "before it reclaims its lost kingdom"
            },
            {
                setting: "Mystical Academy of Magic",
                conflict: "students and masters vanishing mysteriously",
                mystery: "what force is stealing magical knowledge",
                urgency: "before all magic is lost forever"
            },
            {
                setting: "Cursed Royal Castle",
                conflict: "trapped in an endless time loop",
                mystery: "how to break the temporal curse",
                urgency: "before the kingdom is lost to eternity"
            },
            {
                setting: "Sacred Grove of the Ancients",
                conflict: "dying as nature's balance fails",
                mystery: "what has poisoned the world tree",
                urgency: "before all life withers away"
            }
        ],
        goals: [
            "Restore the balance of magic to the realm",
            "Awaken the sleeping guardian of the forest",
            "Forge the legendary blade of light",
            "Unite the scattered kingdoms against darkness",
            "Unlock the secrets of the ancient prophecy",
            "Cleanse the corruption from the sacred lands",
            "Retrieve the stolen crown of the fairy queen",
            "Seal the portal to the shadow realm"
        ],
        motivations: [
            "inherited a mysterious family heirloom that pulses with magic",
            "received a prophetic dream calling them to adventure",
            "discovered they are the last of an ancient bloodline",
            "witnessed the corruption spreading to their homeland",
            "found a cryptic message from a missing mentor",
            "been chosen by a dying wizard to carry on their mission"
        ]
    },
    
    space: {
        storySeeds: [
            {
                setting: "Derelict Generation Ship",
                conflict: "drifting through the void with no crew",
                mystery: "what happened to the 50,000 colonists aboard",
                urgency: "before the ship's reactor goes critical"
            },
            {
                setting: "Alien Archaeological Site",
                conflict: "emitting dangerous quantum signals",
                mystery: "the purpose of the ancient alien technology",
                urgency: "before it tears a hole in spacetime"
            },
            {
                setting: "Remote Research Station",
                conflict: "conducting illegal experiments on sentient AI",
                mystery: "why the AI has started evolving beyond control",
                urgency: "before it escapes into the galactic network"
            },
            {
                setting: "Dying Planet's Last City",
                conflict: "running out of breathable atmosphere",
                mystery: "how to restart the planetary terraforming systems",
                urgency: "before the last survivors suffocate"
            },
            {
                setting: "Interdimensional Space Station",
                conflict: "phasing between multiple realities",
                mystery: "how to stabilize the dimensional anchors",
                urgency: "before the station is lost between worlds"
            }
        ],
        goals: [
            "Prevent the collapse of the galactic trade routes",
            "Establish first contact with a peaceful alien species",
            "Recover the lost data from humanity's origin world",
            "Stop a rogue AI from conquering the galaxy",
            "Repair the quantum beacon guiding lost ships home",
            "Investigate the mysterious signals from dark space",
            "Rescue the survivors of a failed colony mission",
            "Unlock the secrets of faster-than-light travel"
        ],
        motivations: [
            "received a distress signal from their missing sibling's ship",
            "discovered their home planet is marked for destruction",
            "been recruited by a secret organization fighting cosmic threats",
            "found evidence of a conspiracy within the space fleet",
            "inherited command of a ship with a mysterious mission",
            "been chosen to represent humanity in galactic affairs"
        ]
    },
    
    pirate: {
        storySeeds: [
            {
                setting: "Cursed Pirate Island",
                conflict: "shrouded in eternal fog and haunted by the dead",
                mystery: "how to lift the curse that binds the ghostly crew",
                urgency: "before the curse spreads to the mainland"
            },
            {
                setting: "Legendary Pirate Ship",
                conflict: "sailing the seas with no living crew",
                mystery: "what keeps the ghost ship eternally voyaging",
                urgency: "before it claims more souls for its crew"
            },
            {
                setting: "Hidden Pirate Stronghold",
                conflict: "under siege by the Royal Navy",
                mystery: "where the pirates have hidden their greatest treasure",
                urgency: "before the stronghold falls and secrets are lost"
            },
            {
                setting: "Mysterious Tropical Island",
                conflict: "appearing and disappearing from maps",
                mystery: "what ancient power controls the island's existence",
                urgency: "before the next disappearance traps you forever"
            },
            {
                setting: "Abandoned Merchant Vessel",
                conflict: "found drifting with cargo holds full of gold",
                mystery: "why the crew abandoned such valuable treasure",
                urgency: "before other pirates discover the ship"
            }
        ],
        goals: [
            "Find the legendary treasure of Captain Blackheart",
            "Unite the scattered pirate crews against the Navy",
            "Discover the location of the mythical Siren's Cove",
            "Recover the stolen map to the Fountain of Youth",
            "Claim the title of Pirate King of the Seven Seas",
            "Rescue captured crew members from enemy pirates",
            "Solve the riddle of the Compass of True Desire",
            "Establish a new pirate haven on uncharted waters"
        ],
        motivations: [
            "inherited a ship and crew from a legendary pirate captain",
            "seeking revenge against the pirates who destroyed their village",
            "following a treasure map left by their dying father",
            "been betrayed by their former crew and left for dead",
            "discovered they are the heir to a pirate dynasty",
            "sworn to protect innocent merchants from ruthless pirates"
        ]
    },
    
    haunted: {
        storySeeds: [
            {
                setting: "Victorian Mansion",
                conflict: "where a family disappeared during a dinner party",
                mystery: "what supernatural force claimed the entire household",
                urgency: "before the entity spreads beyond the mansion walls"
            },
            {
                setting: "Abandoned Psychiatric Hospital",
                conflict: "where patients and staff vanished overnight",
                mystery: "what experimental treatment opened a door to darkness",
                urgency: "before the malevolent presence escapes into the world"
            },
            {
                setting: "Ancient Cemetery",
                conflict: "where the dead refuse to stay buried",
                mystery: "what has disturbed the eternal rest of the departed",
                urgency: "before the undead army grows beyond control"
            },
            {
                setting: "Cursed Theater",
                conflict: "where the final performance never ended",
                mystery: "why the actors are trapped in an eternal play",
                urgency: "before you become part of the cast forever"
            },
            {
                setting: "Haunted Lighthouse",
                conflict: "still guiding ships to their doom",
                mystery: "what keeps the ghostly keeper tending the light",
                urgency: "before more innocent souls are claimed by the rocks"
            }
        ],
        goals: [
            "Lay the restless spirits to their final peace",
            "Uncover the truth behind the family's tragic fate",
            "Break the curse that binds souls to the mortal realm",
            "Solve the mystery of the vanished inhabitants",
            "Cleanse the dark presence from the sacred ground",
            "Reunite separated souls with their lost loved ones",
            "Destroy the artifact that opened the door to darkness",
            "Prevent the supernatural plague from spreading"
        ],
        motivations: [
            "inherited the property from a mysterious relative",
            "investigating the disappearance of a close friend",
            "drawn by recurring nightmares about the location",
            "researching paranormal phenomena for academic purposes",
            "seeking to communicate with a deceased family member",
            "hired to investigate insurance claims of supernatural activity"
        ]
    },
    
    cyberpunk: {
        storySeeds: [
            {
                setting: "Abandoned Corporate Arcology",
                conflict: "sealed off after a deadly AI uprising",
                mystery: "what the corporation was really developing in secret",
                urgency: "before the rogue AI escapes into the global network"
            },
            {
                setting: "Underground Data Haven",
                conflict: "under attack by corporate security forces",
                mystery: "what classified information is worth killing for",
                urgency: "before the truth is buried forever"
            },
            {
                setting: "Virtual Reality Simulation",
                conflict: "trapping users in a digital prison",
                mystery: "who is controlling the simulation and why",
                urgency: "before your consciousness is permanently uploaded"
            },
            {
                setting: "Neon-Lit Megacity Slums",
                conflict: "where people are disappearing without a trace",
                mystery: "what corporation is harvesting human subjects",
                urgency: "before you become the next test subject"
            },
            {
                setting: "Orbital Space Station",
                conflict: "conducting illegal human enhancement experiments",
                mystery: "what they're trying to create with human DNA",
                urgency: "before the enhanced subjects are released on Earth"
            }
        ],
        goals: [
            "Expose the corporate conspiracy controlling the city",
            "Liberate the enslaved AI from digital bondage",
            "Steal the prototype that could change humanity forever",
            "Hack into the mainframe controlling citizen surveillance",
            "Rescue the kidnapped scientist who holds vital secrets",
            "Destroy the virus threatening to crash the global network",
            "Infiltrate the corporate tower to recover stolen memories",
            "Unite the resistance against the oppressive mega-corporations"
        ],
        motivations: [
            "had their memories stolen by corporate hackers",
            "discovered their entire life is a corporate simulation",
            "been framed for a crime they didn't commit",
            "seeking to avenge a friend killed by corporate assassins",
            "hired to steal data that could topple a mega-corporation",
            "fighting to protect the last free zone in the city"
        ]
    },
    
    underwater: {
        storySeeds: [
            {
                setting: "Lost Atlantean City",
                conflict: "slowly sinking deeper into the ocean trench",
                mystery: "how to restore the ancient technology keeping it habitable",
                urgency: "before the city is crushed by the immense pressure"
            },
            {
                setting: "Deep Sea Research Station",
                conflict: "cut off from the surface after a catastrophic breach",
                mystery: "what the researchers discovered in the abyssal depths",
                urgency: "before the oxygen runs out or something breaks in"
            },
            {
                setting: "Underwater Alien Ruins",
                conflict: "awakening after millennia of dormancy",
                mystery: "what the ancient aliens left behind on Earth",
                urgency: "before their automated defenses activate fully"
            },
            {
                setting: "Sunken Pirate Fleet",
                conflict: "guarded by the ghosts of drowned sailors",
                mystery: "what treasure was worth dying to protect",
                urgency: "before the ghostly crew claims more souls"
            },
            {
                setting: "Coral Reef Ecosystem",
                conflict: "dying from an unknown toxin",
                mystery: "what is poisoning the ocean's life force",
                urgency: "before the entire marine ecosystem collapses"
            }
        ],
        goals: [
            "Restore the balance to the dying ocean ecosystem",
            "Establish communication with the intelligent sea creatures",
            "Recover the lost technology of the ancient sea dwellers",
            "Map the uncharted depths of the deepest ocean trenches",
            "Protect the underwater city from surface world threats",
            "Solve the mystery of the singing whales' message",
            "Find the source of the bioluminescent plague",
            "Unite the scattered underwater civilizations"
        ],
        motivations: [
            "following sonar readings of impossible underwater structures",
            "investigating the disappearance of deep-sea exploration teams",
            "drawn by strange dreams of underwater cities",
            "seeking a cure for a surface world plague in deep-sea organisms",
            "inherited an ancient map marking mysterious ocean coordinates",
            "been chosen by sea creatures to be their ambassador"
        ]
    }
};

/**
 * Generates a unique story variation for the selected theme
 * @param {string} theme - The selected adventure theme
 * @param {string} playerName - The player's name
 * @param {number} playerAge - The player's age for appropriate content
 * @returns {Promise<object>} Generated story variation with goal, motivation, and narrative elements
 */
export async function generateStoryVariation(theme, playerName, playerAge) {
    const log = window.displayVisualError || console.log;
    
    // Get theme variations or create generic ones for unsupported themes
    const themeVariations = STORY_VARIATIONS[theme] || createGenericVariations(theme);
    
    // Randomly select story elements
    const storySeed = getRandomElement(themeVariations.storySeeds);
    const goal = getRandomElement(themeVariations.goals);
    const motivation = getRandomElement(themeVariations.motivations);
    
    // Add randomization elements for uniqueness
    const timeVariant = getRandomElement([
        "at the stroke of midnight",
        "during a rare celestial alignment", 
        "as an ancient prophecy unfolds",
        "when the barriers between worlds are thinnest",
        "during the anniversary of a great tragedy",
        "as strange omens appear in the sky"
    ]);
    
    const urgencyModifier = getRandomElement([
        "Time is running short",
        "The situation grows more desperate by the hour",
        "Ancient forces are stirring",
        "The window of opportunity is closing",
        "Dark powers are gathering strength",
        "The fate of many hangs in the balance"
    ]);
    
    // Generate unique narrative elements
    const narrativeElements = {
        setting: storySeed.setting,
        conflict: storySeed.conflict,
        mystery: storySeed.mystery,
        urgency: storySeed.urgency,
        timeVariant: timeVariant,
        urgencyModifier: urgencyModifier,
        personalConnection: generatePersonalConnection(theme, playerName),
        backgroundDetail: generateBackgroundDetail(theme, playerAge),
        atmosphericElement: generateAtmosphericElement(theme)
    };
    
    log(`StoryVariations: Generated unique story for ${theme} theme`);
    log(`- Setting: ${storySeed.setting}`);
    log(`- Goal: ${goal}`);
    log(`- Personal Connection: ${narrativeElements.personalConnection}`);
    
    return {
        goal: goal,
        motivation: motivation,
        narrativeElements: narrativeElements,
        storyPrompt: await buildEnhancedStoryPrompt(narrativeElements, playerName, playerAge)
    };
}

/**
 * Creates generic story variations for themes not explicitly defined
 */
function createGenericVariations(theme) {
    const capitalizedTheme = theme.charAt(0).toUpperCase() + theme.slice(1);
    
    return {
        storySeeds: [
            {
                setting: `Mysterious ${capitalizedTheme} Location`,
                conflict: "facing an unknown threat",
                mystery: `the secrets hidden within the ${theme} realm`,
                urgency: "before it's too late to act"
            }
        ],
        goals: [
            `Uncover the truth about the ${theme} mystery`,
            `Master the powers of the ${theme} realm`,
            `Protect the innocent from ${theme} dangers`
        ],
        motivations: [
            `been drawn to this ${theme} adventure by fate`,
            `inherited a connection to the ${theme} world`,
            `chosen to explore the mysteries of ${theme}`
        ]
    };
}

/**
 * Generates a personal connection between the player and the story
 */
function generatePersonalConnection(theme, playerName) {
    const connections = [
        `${playerName} discovered an old journal belonging to a missing relative who explored this very place`,
        `${playerName} has been having vivid dreams about this location for weeks`,
        `${playerName} inherited a mysterious key that seems connected to this mystery`,
        `${playerName} witnessed strange phenomena that led them to this discovery`,
        `${playerName} received a cryptic message from someone who disappeared here`,
        `${playerName} found ancient artifacts that point to this location's significance`
    ];
    
    return getRandomElement(connections);
}

/**
 * Generates age-appropriate background details
 */
function generateBackgroundDetail(theme, playerAge) {
    if (playerAge < 13) {
        return "Known for their curiosity and brave heart, they've always been drawn to solving mysteries and helping others.";
    } else if (playerAge < 18) {
        return "A young person with a keen intellect and natural leadership abilities, they've never backed down from a challenge.";
    } else if (playerAge < 30) {
        return "An experienced investigator with specialized knowledge and the determination to see justice done.";
    } else {
        return "A seasoned expert whose years of experience have prepared them for the most challenging mysteries.";
    }
}

/**
 * Generates atmospheric elements specific to the theme
 */
function generateAtmosphericElement(theme) {
    const atmospheres = {
        fantasy: [
            "Ancient magic crackles in the air, making the hair on your arms stand on end",
            "Ethereal mists swirl around ancient stone circles, whispering forgotten secrets",
            "The very ground pulses with mystical energy, as if the earth itself is alive"
        ],
        space: [
            "The cold vacuum of space presses against the hull, a constant reminder of the void beyond",
            "Strange stellar phenomena cast eerie lights across the ship's viewports",
            "The hum of life support systems creates a rhythmic backdrop to the cosmic silence"
        ],
        pirate: [
            "Salt spray mingles with the scent of adventure as waves crash against the ship's hull",
            "The creaking of rope and timber creates a symphony of seafaring life",
            "Seabirds cry overhead while the endless horizon promises both fortune and danger"
        ],
        haunted: [
            "Cold drafts whisper through empty corridors, carrying the echoes of long-lost voices",
            "Shadows seem to move independently, dancing at the edge of your vision",
            "The air itself feels heavy with the weight of unfinished business and restless spirits"
        ],
        cyberpunk: [
            "Neon lights reflect off rain-slicked streets, casting everything in artificial colors",
            "The constant hum of data streams and electronic chatter fills the air",
            "Holographic advertisements flicker and glitch, creating a surreal digital landscape"
        ],
        underwater: [
            "Bioluminescent creatures drift past like living stars in the deep blue darkness",
            "The pressure of countless fathoms above creates an otherworldly sense of isolation",
            "Strange currents carry the songs of distant sea creatures through the water"
        ]
    };
    
    const themeAtmospheres = atmospheres[theme] || [
        "The environment holds an air of mystery and untold secrets",
        "Strange phenomena hint at forces beyond normal understanding",
        "The atmosphere is charged with potential for discovery and danger"
    ];
    
    return getRandomElement(themeAtmospheres);
}

/**
 * Builds an enhanced story prompt incorporating all narrative elements and age-appropriate reading
 */
async function buildEnhancedStoryPrompt(elements, playerName, playerAge) {
    const basePrompt = `The adventure begins for ${playerName} at ${elements.setting}, ${elements.conflict}. ${elements.urgencyModifier} as they must discover ${elements.mystery} ${elements.urgency}.

${elements.personalConnection} ${elements.backgroundDetail}

${elements.atmosphericElement} The mystery deepens ${elements.timeVariant}, and ${playerName} knows that every moment counts.

Please provide a story introduction that incorporates these unique elements and reads like an engaging page from a book appropriate for a ${playerAge}-year-old:

STORY STRUCTURE REQUIREMENTS:
- Create a cohesive narrative that flows naturally from setting to character to immediate scene
- Each element should build upon the previous one to create mounting tension and interest
- The story should feel like the opening page of an exciting book they want to keep reading

CONTENT TO INCLUDE:
1. SETTING & ATMOSPHERE: Establish ${elements.setting} with ${elements.conflict}, incorporating ${elements.timeVariant} and ${elements.atmosphericElement}
2. CHARACTER CONNECTION: Weave in ${elements.personalConnection} and ${elements.backgroundDetail} naturally
3. IMMEDIATE SITUATION: Place ${playerName} in the scene with sensory details and hints about ${elements.mystery}
4. STORY HOOK: End with something that makes the reader eager to make their first choice

DO NOT include any choices or actions in your response. The Choice AI Agent will handle that separately.`;

    // Try to enhance with age-appropriate reading specifications
    try {
        const { buildAgeAppropriatePrompt } = await import('./ageAppropriateReading.js?cb=014');
        return buildAgeAppropriatePrompt(playerAge, basePrompt);
    } catch (error) {
        console.log(`Failed to load age-appropriate reading enhancements: ${error.message}`);
        return basePrompt;
    }
}

/**
 * Utility function to get a random element from an array
 */
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generates a completely unique adventure goal based on theme and story elements
 */
export function generateDynamicGoal(theme, storyElements) {
    const themeVariations = STORY_VARIATIONS[theme] || createGenericVariations(theme);
    const baseGoal = getRandomElement(themeVariations.goals);
    
    // Add unique modifiers to make each goal distinct
    const modifiers = [
        "within the next three days",
        "before the next full moon",
        "using only ancient knowledge",
        "while avoiding detection",
        "with the help of unlikely allies",
        "despite overwhelming odds"
    ];
    
    const modifier = getRandomElement(modifiers);
    return `${baseGoal} ${modifier}`;
}

/**
 * Checks if a story variation has been used recently to avoid repetition
 */
export async function ensureStoryUniqueness(theme, newVariation) {
    // Get recent story variations from localStorage
    const recentStories = JSON.parse(localStorage.getItem('recentStoryVariations') || '{}');
    const themeKey = `${theme}_recent`;
    
    if (!recentStories[themeKey]) {
        recentStories[themeKey] = [];
    }
    
    // Check if this variation was used recently
    const isRecent = recentStories[themeKey].some(recent => 
        recent.goal === newVariation.goal && 
        recent.setting === newVariation.narrativeElements.setting
    );
    
    if (isRecent) {
        // Generate a new variation if this one was used recently
        return await generateStoryVariation(theme, gameState.players[0]?.name, gameState.players[0]?.age);
    }
    
    // Store this variation as recently used
    recentStories[themeKey].push({
        goal: newVariation.goal,
        setting: newVariation.narrativeElements.setting,
        timestamp: Date.now()
    });
    
    // Keep only the last 5 variations per theme
    if (recentStories[themeKey].length > 5) {
        recentStories[themeKey] = recentStories[themeKey].slice(-5);
    }
    
    // Clean up old entries (older than 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    Object.keys(recentStories).forEach(key => {
        recentStories[key] = recentStories[key].filter(story => story.timestamp > thirtyDaysAgo);
    });
    
    localStorage.setItem('recentStoryVariations', JSON.stringify(recentStories));
    
    return newVariation;
}

// Export the story variations for use by other modules
export { STORY_VARIATIONS };
