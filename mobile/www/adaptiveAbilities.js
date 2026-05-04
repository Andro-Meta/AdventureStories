// adaptiveAbilities.js
// Universal Ability System - Adapts to Any Adventure Theme
// Phase 3: Magic System Enhancement - Theme Adaptation

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';

/**
 * Theme-Adaptive Ability System Configuration
 * Transforms magic system terminology and mechanics based on adventure theme
 */
export const THEME_ADAPTATIONS = {
    fantasy: {
        systemName: 'Magic System',
        resourceName: 'Magic Points',
        resourceAbbrev: 'MP',
        resourceIcon: '🔮',
        abilityName: 'Spell',
        abilityNamePlural: 'Spells',
        practitionerName: 'Spellcaster',
        usageVerb: 'cast',
        usageVerbPast: 'cast',
        bookName: 'Spellbook',
        bookIcon: '📖',
        actionButton: '🔮 Cast Spell',
        schools: {
            ELEMENTAL: {
                name: 'Elemental Magic',
                description: 'Harness the raw forces of fire, ice, lightning, and earth',
                color: '#ff6b35',
                icon: '🔥',
                elements: ['fire', 'ice', 'lightning', 'earth', 'wind', 'water']
            },
            ARCANE: {
                name: 'Arcane Magic',
                description: 'Pure magical energy manipulation and reality alteration',
                color: '#9c27b0',
                icon: '✨',
                elements: ['force', 'energy', 'teleportation', 'time', 'space']
            },
            DIVINE: {
                name: 'Divine Magic',
                description: 'Channel divine power for healing, protection, and purification',
                color: '#ffd700',
                icon: '☀️',
                elements: ['healing', 'protection', 'blessing', 'purification', 'light']
            },
            SHADOW: {
                name: 'Shadow Magic',
                description: 'Manipulate darkness, fear, and the forces of decay',
                color: '#4a148c',
                icon: '🌙',
                elements: ['darkness', 'fear', 'curse', 'drain', 'illusion']
            },
            NATURE: {
                name: 'Nature Magic',
                description: 'Command plants, animals, and the natural world',
                color: '#4caf50',
                icon: '🌿',
                elements: ['growth', 'animals', 'weather', 'poison', 'regeneration']
            },
            MIND: {
                name: 'Mind Magic',
                description: 'Control thoughts, emotions, and mental faculties',
                color: '#2196f3',
                icon: '🧠',
                elements: ['telepathy', 'charm', 'confusion', 'memory', 'willpower']
            }
        }
    },
    
    scifi: {
        systemName: 'Tech System',
        resourceName: 'Energy Points',
        resourceAbbrev: 'EP',
        resourceIcon: '⚡',
        abilityName: 'Tech Ability',
        abilityNamePlural: 'Tech Abilities',
        practitionerName: 'Tech Specialist',
        usageVerb: 'activate',
        usageVerbPast: 'activated',
        bookName: 'Tech Manual',
        bookIcon: '📱',
        actionButton: '⚡ Use Tech',
        schools: {
            ELEMENTAL: {
                name: 'Energy Manipulation',
                description: 'Control plasma, electricity, thermal, and kinetic energy',
                color: '#ff6b35',
                icon: '⚡',
                elements: ['plasma', 'electrical', 'thermal', 'kinetic', 'radiation', 'magnetic']
            },
            ARCANE: {
                name: 'Quantum Tech',
                description: 'Advanced quantum manipulation and spacetime technology',
                color: '#9c27b0',
                icon: '🌌',
                elements: ['quantum', 'spacetime', 'teleportation', 'temporal', 'dimensional']
            },
            DIVINE: {
                name: 'Medical Tech',
                description: 'Advanced healing technology and life support systems',
                color: '#ffd700',
                icon: '🏥',
                elements: ['healing', 'regeneration', 'immunity', 'enhancement', 'stabilization']
            },
            SHADOW: {
                name: 'Stealth Tech',
                description: 'Cloaking, hacking, and infiltration technology',
                color: '#4a148c',
                icon: '👤',
                elements: ['cloaking', 'hacking', 'disruption', 'interference', 'infiltration']
            },
            NATURE: {
                name: 'Bio Tech',
                description: 'Biotechnology and environmental manipulation systems',
                color: '#4caf50',
                icon: '🧬',
                elements: ['biological', 'environmental', 'genetic', 'ecosystem', 'adaptation']
            },
            MIND: {
                name: 'Neural Tech',
                description: 'Brain-computer interfaces and consciousness technology',
                color: '#2196f3',
                icon: '🧠',
                elements: ['neural', 'consciousness', 'memory', 'cognition', 'interface']
            }
        }
    },
    
    modern: {
        systemName: 'Skill System',
        resourceName: 'Skill Points',
        resourceAbbrev: 'SP',
        resourceIcon: '💪',
        abilityName: 'Skill',
        abilityNamePlural: 'Skills',
        practitionerName: 'Specialist',
        usageVerb: 'use',
        usageVerbPast: 'used',
        bookName: 'Skill Manual',
        bookIcon: '📋',
        actionButton: '💪 Use Skill',
        schools: {
            ELEMENTAL: {
                name: 'Combat Skills',
                description: 'Physical combat techniques and weapon mastery',
                color: '#ff6b35',
                icon: '⚔️',
                elements: ['melee', 'ranged', 'martial_arts', 'weapons', 'tactics', 'explosives']
            },
            ARCANE: {
                name: 'Technical Skills',
                description: 'Advanced technology and engineering expertise',
                color: '#9c27b0',
                icon: '🔧',
                elements: ['engineering', 'electronics', 'computers', 'mechanics', 'innovation']
            },
            DIVINE: {
                name: 'Medical Skills',
                description: 'Healing, first aid, and medical expertise',
                color: '#ffd700',
                icon: '🏥',
                elements: ['first_aid', 'surgery', 'medicine', 'psychology', 'rehabilitation']
            },
            SHADOW: {
                name: 'Stealth Skills',
                description: 'Infiltration, espionage, and covert operations',
                color: '#4a148c',
                icon: '🕵️',
                elements: ['stealth', 'lockpicking', 'hacking', 'disguise', 'surveillance']
            },
            NATURE: {
                name: 'Survival Skills',
                description: 'Outdoor survival and environmental expertise',
                color: '#4caf50',
                icon: '🏕️',
                elements: ['survival', 'tracking', 'climbing', 'navigation', 'wilderness']
            },
            MIND: {
                name: 'Social Skills',
                description: 'Communication, leadership, and psychological expertise',
                color: '#2196f3',
                icon: '🗣️',
                elements: ['persuasion', 'leadership', 'negotiation', 'psychology', 'investigation']
            }
        }
    },
    
    cyberpunk: {
        systemName: 'Cyber System',
        resourceName: 'Neural Energy',
        resourceAbbrev: 'NE',
        resourceIcon: '🧠',
        abilityName: 'Cyber Ability',
        abilityNamePlural: 'Cyber Abilities',
        practitionerName: 'Netrunner',
        usageVerb: 'execute',
        usageVerbPast: 'executed',
        bookName: 'Neural Interface',
        bookIcon: '🖥️',
        actionButton: '🧠 Jack In',
        schools: {
            ELEMENTAL: {
                name: 'Combat Protocols',
                description: 'Enhanced combat systems and weapon interfaces',
                color: '#ff6b35',
                icon: '🔫',
                elements: ['targeting', 'reflexes', 'weapons', 'combat_drugs', 'augmentation']
            },
            ARCANE: {
                name: 'Netrunning',
                description: 'Advanced hacking and cyberspace navigation',
                color: '#9c27b0',
                icon: '💻',
                elements: ['hacking', 'viruses', 'ice_breaking', 'data_mining', 'cyber_warfare']
            },
            DIVINE: {
                name: 'Bioware',
                description: 'Biological enhancement and medical cybernetics',
                color: '#ffd700',
                icon: '🧬',
                elements: ['healing', 'enhancement', 'toxin_resistance', 'regeneration', 'immunity']
            },
            SHADOW: {
                name: 'Ghost Protocols',
                description: 'Stealth systems and electronic countermeasures',
                color: '#4a148c',
                icon: '👻',
                elements: ['stealth', 'jamming', 'spoofing', 'infiltration', 'anonymity']
            },
            NATURE: {
                name: 'Street Smarts',
                description: 'Urban survival and underground connections',
                color: '#4caf50',
                icon: '🏙️',
                elements: ['contacts', 'black_market', 'survival', 'reputation', 'territory']
            },
            MIND: {
                name: 'Neural Interface',
                description: 'Direct brain-computer interface and mental enhancement',
                color: '#2196f3',
                icon: '🧠',
                elements: ['memory', 'processing', 'multitasking', 'analysis', 'prediction']
            }
        }
    },
    
    horror: {
        systemName: 'Occult System',
        resourceName: 'Sanity Points',
        resourceAbbrev: 'SAN',
        resourceIcon: '🕯️',
        abilityName: 'Occult Ritual',
        abilityNamePlural: 'Occult Rituals',
        practitionerName: 'Occultist',
        usageVerb: 'perform',
        usageVerbPast: 'performed',
        bookName: 'Grimoire',
        bookIcon: '📜',
        actionButton: '🕯️ Perform Ritual',
        schools: {
            ELEMENTAL: {
                name: 'Primal Forces',
                description: 'Harness ancient elemental powers at great cost',
                color: '#ff6b35',
                icon: '🔥',
                elements: ['fire', 'ice', 'storm', 'earth', 'decay', 'void']
            },
            ARCANE: {
                name: 'Forbidden Knowledge',
                description: 'Dangerous arcane secrets that strain the mind',
                color: '#9c27b0',
                icon: '👁️',
                elements: ['revelation', 'prophecy', 'scrying', 'binding', 'summoning']
            },
            DIVINE: {
                name: 'Sacred Rites',
                description: 'Protective rituals and divine intervention',
                color: '#ffd700',
                icon: '✝️',
                elements: ['blessing', 'warding', 'purification', 'exorcism', 'sanctuary']
            },
            SHADOW: {
                name: 'Dark Arts',
                description: 'Malevolent powers that corrupt the soul',
                color: '#4a148c',
                icon: '💀',
                elements: ['curse', 'necromancy', 'possession', 'madness', 'corruption']
            },
            NATURE: {
                name: 'Primordial Pacts',
                description: 'Ancient agreements with nature spirits',
                color: '#4caf50',
                icon: '🌲',
                elements: ['spirits', 'transformation', 'communion', 'sacrifice', 'wildness']
            },
            MIND: {
                name: 'Psychic Phenomena',
                description: 'Mental powers that risk psychological breakdown',
                color: '#2196f3',
                icon: '🧠',
                elements: ['telepathy', 'precognition', 'psychometry', 'influence', 'madness']
            }
        }
    },
    
    mystery: {
        systemName: 'Investigation System',
        resourceName: 'Focus Points',
        resourceAbbrev: 'FP',
        resourceIcon: '🔍',
        abilityName: 'Investigation Technique',
        abilityNamePlural: 'Investigation Techniques',
        practitionerName: 'Detective',
        usageVerb: 'employ',
        usageVerbPast: 'employed',
        bookName: 'Case Files',
        bookIcon: '📁',
        actionButton: '🔍 Investigate',
        schools: {
            ELEMENTAL: {
                name: 'Physical Evidence',
                description: 'Forensic analysis and crime scene investigation',
                color: '#ff6b35',
                icon: '🔬',
                elements: ['forensics', 'ballistics', 'fingerprints', 'dna', 'trace_evidence']
            },
            ARCANE: {
                name: 'Deductive Reasoning',
                description: 'Advanced logical analysis and pattern recognition',
                color: '#9c27b0',
                icon: '🧩',
                elements: ['deduction', 'analysis', 'patterns', 'connections', 'logic']
            },
            DIVINE: {
                name: 'Intuitive Insight',
                description: 'Gut feelings and intuitive leaps in reasoning',
                color: '#ffd700',
                icon: '💡',
                elements: ['intuition', 'hunches', 'inspiration', 'breakthrough', 'revelation']
            },
            SHADOW: {
                name: 'Underworld Contacts',
                description: 'Information from criminal networks and informants',
                color: '#4a148c',
                icon: '🕴️',
                elements: ['informants', 'underworld', 'surveillance', 'infiltration', 'secrets']
            },
            NATURE: {
                name: 'Environmental Analysis',
                description: 'Reading locations and environmental clues',
                color: '#4caf50',
                icon: '🌍',
                elements: ['locations', 'weather', 'timing', 'geography', 'atmosphere']
            },
            MIND: {
                name: 'Psychological Profiling',
                description: 'Understanding motives and psychological patterns',
                color: '#2196f3',
                icon: '🧠',
                elements: ['profiling', 'motives', 'psychology', 'behavior', 'personality']
            }
        }
    },
    
    adventure: {
        systemName: 'Adventure System',
        resourceName: 'Action Points',
        resourceAbbrev: 'AP',
        resourceIcon: '⭐',
        abilityName: 'Adventure Skill',
        abilityNamePlural: 'Adventure Skills',
        practitionerName: 'Adventurer',
        usageVerb: 'perform',
        usageVerbPast: 'performed',
        bookName: 'Adventure Guide',
        bookIcon: '🗺️',
        actionButton: '⭐ Take Action',
        schools: {
            ELEMENTAL: {
                name: 'Physical Prowess',
                description: 'Athletic abilities and physical challenges',
                color: '#ff6b35',
                icon: '💪',
                elements: ['strength', 'agility', 'endurance', 'climbing', 'swimming']
            },
            ARCANE: {
                name: 'Problem Solving',
                description: 'Creative solutions and innovative thinking',
                color: '#9c27b0',
                icon: '🧩',
                elements: ['creativity', 'innovation', 'improvisation', 'adaptation', 'ingenuity']
            },
            DIVINE: {
                name: 'Leadership',
                description: 'Inspiring others and team coordination',
                color: '#ffd700',
                icon: '👑',
                elements: ['inspiration', 'coordination', 'morale', 'teamwork', 'courage']
            },
            SHADOW: {
                name: 'Cunning',
                description: 'Stealth, trickery, and clever maneuvering',
                color: '#4a148c',
                icon: '🎭',
                elements: ['stealth', 'deception', 'misdirection', 'cunning', 'trickery']
            },
            NATURE: {
                name: 'Exploration',
                description: 'Navigation, survival, and wilderness skills',
                color: '#4caf50',
                icon: '🧭',
                elements: ['navigation', 'survival', 'tracking', 'foraging', 'weather']
            },
            MIND: {
                name: 'Knowledge',
                description: 'Academic knowledge and research abilities',
                color: '#2196f3',
                icon: '📚',
                elements: ['research', 'languages', 'history', 'culture', 'academics']
            }
        }
    }
};

/**
 * Get the current theme adaptation based on adventure theme
 * @returns {object} Theme adaptation configuration
 */
export function getCurrentThemeAdaptation() {
    const theme = gameState.adventureTheme || 'fantasy';
    return THEME_ADAPTATIONS[theme] || THEME_ADAPTATIONS.fantasy;
}

/**
 * Get adapted terminology for the current theme
 * @param {string} term - The term to adapt ('systemName', 'resourceName', etc.)
 * @returns {string} Adapted term
 */
export function getAdaptedTerm(term) {
    const adaptation = getCurrentThemeAdaptation();
    return adaptation[term] || term;
}

/**
 * Get adapted schools for the current theme
 * @returns {object} Adapted schools configuration
 */
export function getAdaptedSchools() {
    const adaptation = getCurrentThemeAdaptation();
    return adaptation.schools || THEME_ADAPTATIONS.fantasy.schools;
}

/**
 * Transform a spell/ability name to fit the current theme
 * @param {string} originalName - Original spell name
 * @param {string} school - The school/discipline
 * @param {string} type - The ability type
 * @returns {string} Theme-appropriate name
 */
export function adaptAbilityName(originalName, school, type) {
    const adaptation = getCurrentThemeAdaptation();
    const schoolData = adaptation.schools[school];
    
    if (!schoolData) return originalName;
    
    // Theme-specific name transformations
    const themeTransforms = {
        scifi: {
            'Fireball': 'Plasma Burst',
            'Heal': 'Medical Nanobots',
            'Shield': 'Energy Barrier',
            'Lightning Bolt': 'Electrical Discharge',
            'Invisibility': 'Optical Camouflage',
            'Teleport': 'Quantum Jump'
        },
        modern: {
            'Fireball': 'Explosive Charge',
            'Heal': 'First Aid',
            'Shield': 'Tactical Defense',
            'Lightning Bolt': 'Taser Strike',
            'Invisibility': 'Stealth Technique',
            'Teleport': 'Quick Movement'
        },
        cyberpunk: {
            'Fireball': 'Incendiary Program',
            'Heal': 'Medical Subroutine',
            'Shield': 'ICE Protocol',
            'Lightning Bolt': 'Neural Spike',
            'Invisibility': 'Ghost Mode',
            'Teleport': 'Fast Travel'
        },
        horror: {
            'Fireball': 'Hellfire Invocation',
            'Heal': 'Forbidden Regeneration',
            'Shield': 'Protective Ward',
            'Lightning Bolt': 'Wrathful Strike',
            'Invisibility': 'Shadow Veil',
            'Teleport': 'Dimensional Step'
        },
        mystery: {
            'Fireball': 'Explosive Analysis',
            'Heal': 'Stress Relief',
            'Shield': 'Mental Fortitude',
            'Lightning Bolt': 'Sudden Insight',
            'Invisibility': 'Unnoticed Observation',
            'Teleport': 'Quick Deduction'
        },
        adventure: {
            'Fireball': 'Explosive Action',
            'Heal': 'Recovery Technique',
            'Shield': 'Defensive Maneuver',
            'Lightning Bolt': 'Swift Strike',
            'Invisibility': 'Stealth Approach',
            'Teleport': 'Acrobatic Movement'
        }
    };
    
    const theme = gameState.adventureTheme || 'fantasy';
    const transforms = themeTransforms[theme];
    
    return transforms?.[originalName] || originalName;
}

/**
 * Adapt ability description to fit the current theme
 * @param {string} originalDescription - Original description
 * @param {string} school - The school/discipline
 * @returns {string} Theme-appropriate description
 */
export function adaptAbilityDescription(originalDescription, school) {
    const adaptation = getCurrentThemeAdaptation();
    const theme = gameState.adventureTheme || 'fantasy';
    
    // Theme-specific description transformations
    const transformMap = {
        scifi: {
            'magical': 'technological',
            'spell': 'program',
            'cast': 'execute',
            'mana': 'energy',
            'enchanted': 'enhanced',
            'divine': 'medical',
            'arcane': 'quantum',
            'elemental': 'energy-based'
        },
        modern: {
            'magical': 'skilled',
            'spell': 'technique',
            'cast': 'perform',
            'mana': 'stamina',
            'enchanted': 'specialized',
            'divine': 'medical',
            'arcane': 'technical',
            'elemental': 'physical'
        },
        cyberpunk: {
            'magical': 'cyber',
            'spell': 'program',
            'cast': 'execute',
            'mana': 'neural energy',
            'enchanted': 'augmented',
            'divine': 'bioware',
            'arcane': 'netrunning',
            'elemental': 'combat protocol'
        },
        horror: {
            'magical': 'occult',
            'spell': 'ritual',
            'cast': 'perform',
            'mana': 'sanity',
            'enchanted': 'cursed',
            'divine': 'sacred',
            'arcane': 'forbidden',
            'elemental': 'primal'
        },
        mystery: {
            'magical': 'investigative',
            'spell': 'technique',
            'cast': 'employ',
            'mana': 'focus',
            'enchanted': 'specialized',
            'divine': 'intuitive',
            'arcane': 'analytical',
            'elemental': 'forensic'
        },
        adventure: {
            'magical': 'adventurous',
            'spell': 'skill',
            'cast': 'perform',
            'mana': 'energy',
            'enchanted': 'enhanced',
            'divine': 'inspiring',
            'arcane': 'clever',
            'elemental': 'physical'
        }
    };
    
    let adapted = originalDescription;
    const transforms = transformMap[theme];
    
    if (transforms) {
        Object.entries(transforms).forEach(([from, to]) => {
            const regex = new RegExp(from, 'gi');
            adapted = adapted.replace(regex, to);
        });
    }
    
    return adapted;
}

/**
 * Get theme-appropriate status effect names
 * @param {string} originalEffect - Original status effect name
 * @returns {string} Theme-appropriate effect name
 */
export function adaptStatusEffect(originalEffect) {
    const theme = gameState.adventureTheme || 'fantasy';
    
    const effectMap = {
        scifi: {
            'burning': 'overheating',
            'frozen': 'system_locked',
            'poisoned': 'infected',
            'blessed': 'enhanced',
            'cursed': 'corrupted',
            'charmed': 'hacked'
        },
        modern: {
            'burning': 'injured',
            'frozen': 'stunned',
            'poisoned': 'sick',
            'blessed': 'motivated',
            'cursed': 'demoralized',
            'charmed': 'convinced'
        },
        cyberpunk: {
            'burning': 'viral_damage',
            'frozen': 'system_freeze',
            'poisoned': 'data_corruption',
            'blessed': 'boosted',
            'cursed': 'glitched',
            'charmed': 'mind_hacked'
        },
        horror: {
            'burning': 'hellfire',
            'frozen': 'paralyzed',
            'poisoned': 'tainted',
            'blessed': 'sanctified',
            'cursed': 'damned',
            'charmed': 'possessed'
        },
        mystery: {
            'burning': 'stressed',
            'frozen': 'confused',
            'poisoned': 'misled',
            'blessed': 'inspired',
            'cursed': 'frustrated',
            'charmed': 'distracted'
        },
        adventure: {
            'burning': 'exhausted',
            'frozen': 'hesitant',
            'poisoned': 'weakened',
            'blessed': 'energized',
            'cursed': 'discouraged',
            'charmed': 'motivated'
        }
    };
    
    return effectMap[theme]?.[originalEffect] || originalEffect;
}

export default {
    THEME_ADAPTATIONS,
    getCurrentThemeAdaptation,
    getAdaptedTerm,
    getAdaptedSchools,
    adaptAbilityName,
    adaptAbilityDescription,
    adaptStatusEffect
};
