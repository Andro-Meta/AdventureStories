// config.js
// Constants for Adventure Stories.
//
// The storyteller is a free online model (OpenRouter or Google AI Studio),
// called from the browser with the player's own key, saved in AI Settings.
// Local and on-device models were removed on purpose (2026-10-07): nothing
// is downloaded or run on the player's machine.

export const LLM_BACKEND = 'cloud';

/** Per-request limits for the online providers. */
export const AI_REQUEST_CONFIG = {
    TIMEOUT_MS: 45000,   // cloud replies take seconds; 45 s per attempt
    MAX_RETRIES: 2,      // 3 attempts in total
    RETRY_DELAY_MS: 2000 // network hiccups; per-minute 429s wait for Retry-After / 20 s
};

export const AI_DEFAULT_PARAMS = { max_tokens: 2048, temperature: 0.7, top_p: 0.95 };

// CLOUD MODEL IDs — re-verified 2026-10-07 against openrouter.ai/api/v1/models
// and with a live game-shaped JSON prompt (narration + diff + 5 typed choices):
//   nemotron-3-super-120b:free   ~10 s, valid JSON, 5/5 choice types
//   openrouter/free (router)     ~8 s on the bench, but in a live game it routed
//                                to code models and a safety classifier ("User
//                                Safety: safe" became the story). Never list it.
//   nemotron-3-ultra-550b:free   ~25 s, valid JSON, richest narration
//   gemma-4-31b / 26b :free      429 "rate-limited upstream" at test time
//   inkling(-small):free         403 "only available on agentic harnesses"
//   nemotron-3.5-lightning, dots-3-note-preview: broke JSON (reasoning prose)
// The old Qwen3 80B / Llama 3.3 70B / Hermes 405B / Gemma 3 :free IDs no
// longer exist on OpenRouter.
//
// OpenRouter free-model limits (docs, 2026-10): 20 requests/minute, and
// 50 requests/day, raised to 1000/day permanently once an account has bought
// at least $10 of credits (free models never spend them). One game turn is
// ~2 requests. `fallbackModels` goes out as OpenRouter's `models` array, so a
// rate-limited or down model fails over server-side within one request.
const OPENROUTER_FREE_LIMITS = '20/min · 50/day (1000/day after a one-time $10 credit purchase)';
export const CLOUD_PROVIDERS = {
    openrouter_free: {
        name: 'OpenRouter — Free models (auto-fallback) ★ recommended',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        fallbackModels: ['nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'],
        signupUrl: 'https://openrouter.ai/settings/keys',
        contextWindow: 262144,
        rateLimit: OPENROUTER_FREE_LIMITS,
        notes: 'Nemotron 3 Super 120B, failing over to Nemotron 3 Ultra, then Gemma 4 31B.'
    },
    openrouter_ultra: {
        name: 'OpenRouter — Nemotron 3 Ultra 550B (Free, richest, slower)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        fallbackModels: ['nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-31b-it:free'],
        signupUrl: 'https://openrouter.ai/settings/keys',
        contextWindow: 1000000,
        rateLimit: OPENROUTER_FREE_LIMITS,
        notes: '~25 s per call. Best descriptions; falls back to the faster models.'
    },
    openrouter_gemma4: {
        name: 'OpenRouter — Gemma 4 31B (Free, often rate-limited)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-4-31b-it:free',
        fallbackModels: ['nvidia/nemotron-3-super-120b-a12b:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
        signupUrl: 'https://openrouter.ai/settings/keys',
        contextWindow: 262144,
        rateLimit: OPENROUTER_FREE_LIMITS,
        notes: 'Upstream free provider is frequently busy; falls back to Nemotron.'
    },
    // Not OpenRouter: a separate free key from aistudio.google.com. Tested
    // 2026-10-07: ~1.4 s per call, valid JSON, 5/5 choice types. Google lists
    // free-tier daily caps per project in AI Studio rather than in the docs.
    googleai: {
        name: 'Google AI Studio — Gemini Flash-Lite (Free, fastest)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-flash-lite-latest',
        signupUrl: 'https://aistudio.google.com/apikey',
        contextWindow: 1000000,
        rateLimit: 'Free tier — daily cap shown in AI Studio',
        notes: 'Separate Google key. Fastest option tested.'
    }
};

/**
 * Default cloud provider when LLM_BACKEND === 'cloud' but no specific
 * provider has been selected. Users override via localStorage('adv.cloudProvider').
 */
export const DEFAULT_CLOUD_PROVIDER = 'openrouter_free';

/**
 * Resolve the active cloud provider config from localStorage selection,
 * falling back to DEFAULT_CLOUD_PROVIDER.
 */
export function resolveCloudProvider() {
    try {
        if (typeof window !== 'undefined') {
            const key = window.localStorage.getItem('adv.cloudProvider');
            if (key && CLOUD_PROVIDERS[key]) return CLOUD_PROVIDERS[key];
        }
    } catch (_) { /* fall through */ }
    return CLOUD_PROVIDERS[DEFAULT_CLOUD_PROVIDER];
}

/**
 * Read the user's saved API key from localStorage. Returns null if unset.
 * Cloud requests must include this as `Authorization: Bearer <key>`.
 */
export function getCloudApiKey() {
    try {
        if (typeof window !== 'undefined') {
            const ls = window.localStorage;
            const scoped = ls.getItem(cloudKeyStorageName(resolveCloudProvider()));
            if (scoped) return scoped;
            // Pre-2026-10 builds kept one unscoped key; it was an OpenRouter key.
            if (resolveCloudProvider().baseUrl.includes('openrouter')) return ls.getItem('adv.apiKey') || null;
        }
    } catch (_) { /* fall through */ }
    return null;
}

/** Keys are stored per provider host so an OpenRouter and a Google key can coexist. */
export function cloudKeyStorageName(provider) {
    return 'adv.apiKey.' + new URL(provider.baseUrl).hostname;
}

/** Provider, model and URL the client should use right now. */
export function getActiveBackendConfig() {
    const provider = resolveCloudProvider();
    return {
        id: 'cloud',
        isCloud: true,
        url: provider.baseUrl,
        modelName: provider.model,
        fallbackModels: provider.fallbackModels || [],
        contextWindow: provider.contextWindow,
        providerName: provider.name,
        defaultParams: AI_DEFAULT_PARAMS
    };
}

// --- Game Balance & Rules ---
export const INITIAL_HP = 100;
export const INITIAL_MP = 20;
export const INITIAL_COINS = 50;
export const BASE_ATK = 5; // Player base attack without weapon
export const BASE_DEF = 2; // Player base defense without armor

// --- Resource System Constants (MP/SP/EP/etc based on theme) ---
export const RESOURCE_REGEN_COMBAT = 2;      // Resource regenerated per turn in combat
export const RESOURCE_REGEN_EXPLORATION = 5; // Resource regenerated per turn out of combat
export const RESOURCE_PER_LEVEL = 5;         // Additional resource per character level
export const DOWNED_TURNS_MAX = 3; // Turns until auto-revive after being downed
export const MAX_PLAYERS = 5;
export const MIN_AGE = 6;
export const MAX_AGE = 99;
export const MAX_NAME_LENGTH = 30;
// Max conversation history kept for summaries, in user/assistant pairs.
// contextManager.compressHistoryIntelligently() summarises older turns.
export const MAX_HISTORY_LENGTH = 20;

// --- Hierarchical memory (Tier 3) ---
// Generate a fresh arc summary every N turns. Lower = more granular memory,
// higher = less inference overhead. 5 is a good balance for play sessions of
// 20-100 turns.
export const SUMMARY_EVERY_N_TURNS = 5;
// Cap on stored summaries; oldest are dropped past this. 12 covers ~60 turns
// of campaign memory at SUMMARY_EVERY_N_TURNS=5 — enough for long sessions
// without bloating the system prompt.
export const MEMORY_MAX_SUMMARIES = 12;
// Cap per entity category (npcs / locations / items) before LRU eviction.
// 30 each balances "detail in the prompt" against "context bloat". Tune
// down if Qwen3-4B starts ignoring tail entries.
export const ENTITY_MEMORY_MAX_PER_CATEGORY = 30;

// --- Item Tiers & Costs ---
// Define the tiers used in the game
export const Tiers = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    SPECIAL: 'Special',
    LEGENDARY: 'Legendary',
    GOD: 'God' // God tier might be reserved for unique quest rewards
};
// Default base costs for items by tier (random variation applied during generation)
export const DefaultItemCosts = {
    [Tiers.LOW]: 15,
    [Tiers.MEDIUM]: 50,
    [Tiers.HIGH]: 150,
    [Tiers.SPECIAL]: 350,
    [Tiers.LEGENDARY]: 1200,
    [Tiers.GOD]: 9999 // Placeholder cost
};
// Specific cost for revival items (variation added during generation)
export const REVIVAL_ITEM_BASE_COST = 150;
// Default name if a theme doesn't provide one
export const REVIVAL_ITEM_DEFAULT_NAME = "Revival Charm";

// --- Combat Settings ---
export const BASE_ENEMY_SCALING_FACTOR = 1.0; // Initial scaling factor for enemies
export const TURN_SCALING_INCREASE = 0.04; // % increase in enemy stats per turn (cumulative)
// How much average player "level" affects scaling. Currently uses Turn number as a proxy.
export const PLAYER_LEVEL_SCALING_FACTOR = 0.08;
export const FLEE_CHANCE = 0.4; // Base chance (40%) to successfully flee combat
export const PARTY_WIPE_COIN_LOSS_PERCENT = 0.75; // Lose 75% of coins on party wipe
export const REVIVE_HP_PERCENT_AUTO = 0.10; // Auto-revive HP% (10% of Max HP)
export const REVIVE_HP_PERCENT_ITEM = 0.25; // Default Item revive HP% (25% of Max HP) - Can be overridden by item stats

// --- Status Effects Configuration ---
export const STATUS_EFFECTS = {
    // Damage Over Time Effects
    BURN: {
        name: 'Burn',
        type: 'damage_over_time',
        description: 'Takes fire damage each turn',
        icon: '🔥',
        color: '#ff4444',
        defaultDuration: 3,
        defaultData: { hpPerTurn: -4, element: 'Fire' },
        resistanceType: 'Fire',
        canStack: false
    },
    POISON: {
        name: 'Poison',
        type: 'damage_over_time', 
        description: 'Takes poison damage each turn',
        icon: '☠️',
        color: '#44ff44',
        defaultDuration: 4,
        defaultData: { hpPerTurn: -3, element: 'Poison' },
        resistanceType: 'Poison',
        canStack: false
    },
    BLEED: {
        name: 'Bleed',
        type: 'damage_over_time',
        description: 'Bleeding causes damage each turn',
        icon: '🩸',
        color: '#cc0000',
        defaultDuration: 5,
        defaultData: { hpPerTurn: -2, element: 'Physical' },
        resistanceType: 'Physical',
        canStack: true
    },
    FROST: {
        name: 'Frost',
        type: 'damage_over_time',
        description: 'Takes ice damage and moves slower',
        icon: '❄️',
        color: '#4444ff',
        defaultDuration: 3,
        defaultData: { hpPerTurn: -2, speedMod: -0.5, element: 'Ice' },
        resistanceType: 'Ice',
        canStack: false
    },

    // Debilitating Effects
    STUN: {
        name: 'Stun',
        type: 'disable',
        description: 'Cannot act for one turn',
        icon: '⚡',
        color: '#ffff44',
        defaultDuration: 1,
        defaultData: { cannotAct: true },
        resistanceType: 'Stun',
        canStack: false
    },
    CONFUSION: {
        name: 'Confusion',
        type: 'disable',
        description: 'May target random ally instead of enemy',
        icon: '😵',
        color: '#ff44ff',
        defaultDuration: 2,
        defaultData: { randomTarget: 0.5 },
        resistanceType: 'Mental',
        canStack: false
    },
    BLIND: {
        name: 'Blind',
        type: 'debuff',
        description: 'Reduced accuracy for attacks',
        icon: '👁️',
        color: '#888888',
        defaultDuration: 3,
        defaultData: { accuracyMod: -0.5 },
        resistanceType: 'Physical',
        canStack: false
    },
    PARALYSIS: {
        name: 'Paralysis',
        type: 'disable',
        description: 'Cannot act, chance to recover each turn',
        icon: '⚡',
        color: '#ffaa00',
        defaultDuration: 3,
        defaultData: { cannotAct: true, recoveryChance: 0.5 },
        resistanceType: 'Lightning',
        canStack: false
    },
    SLEEP: {
        name: 'Sleep',
        type: 'disable',
        description: 'Cannot act until damaged or duration expires',
        icon: '😴',
        color: '#6666ff',
        defaultDuration: 3,
        defaultData: { cannotAct: true, breaksOnDamage: true },
        resistanceType: 'Mental',
        canStack: false
    },
    SILENCE: {
        name: 'Silence',
        type: 'debuff',
        description: 'Cannot use special abilities or spells',
        icon: '🤐',
        color: '#aa44aa',
        defaultDuration: 3,
        defaultData: { cannotUseAbilities: true },
        resistanceType: 'Mental',
        canStack: false
    },

    // Stat Modification Effects (Enhanced)
    WEAKNESS: {
        name: 'Weakness',
        type: 'debuff',
        description: 'Attack power reduced by 50%',
        icon: '⬇️',
        color: '#ff6666',
        defaultDuration: 4,
        defaultData: { atkMultiplier: 0.5 },
        resistanceType: 'Physical',
        canStack: false
    },
    VULNERABILITY: {
        name: 'Vulnerability',
        type: 'debuff',
        description: 'Takes 50% more damage',
        icon: '🛡️',
        color: '#ffaaaa',
        defaultDuration: 3,
        defaultData: { damageMultiplier: 1.5 },
        resistanceType: 'Mental',
        canStack: false
    },
    SLOW: {
        name: 'Slow',
        type: 'debuff',
        description: 'Speed and initiative reduced',
        icon: '🐌',
        color: '#aaaaff',
        defaultDuration: 4,
        defaultData: { speedMod: -0.5 },
        resistanceType: 'Time',
        canStack: false
    },
    HASTE: {
        name: 'Haste',
        type: 'buff',
        description: 'Speed and initiative increased',
        icon: '💨',
        color: '#44ff44',
        defaultDuration: 3,
        defaultData: { speedMod: 0.5 },
        resistanceType: 'Time',
        canStack: false
    },
    SHIELD: {
        name: 'Shield',
        type: 'buff',
        description: 'Takes 50% less damage',
        icon: '🛡️',
        color: '#4444ff',
        defaultDuration: 3,
        defaultData: { damageMultiplier: 0.5 },
        resistanceType: 'Magic',
        canStack: false
    },
    BERSERK: {
        name: 'Berserk',
        type: 'buff',
        description: 'Increased attack but reduced defense',
        icon: '😡',
        color: '#ff4444',
        defaultDuration: 4,
        defaultData: { atkMultiplier: 1.5, defMultiplier: 0.75 },
        resistanceType: 'Mental',
        canStack: false
    }
};

// Elemental Damage Types
export const ELEMENTS = {
    PHYSICAL: { name: 'Physical', color: '#888888', icon: '⚔️' },
    FIRE: { name: 'Fire', color: '#ff4444', icon: '🔥' },
    ICE: { name: 'Ice', color: '#4444ff', icon: '❄️' },
    LIGHTNING: { name: 'Lightning', color: '#ffff44', icon: '⚡' },
    POISON: { name: 'Poison', color: '#44ff44', icon: '☠️' },
    HOLY: { name: 'Holy', color: '#ffffaa', icon: '✨' },
    DARK: { name: 'Dark', color: '#444444', icon: '🌑' }
};

// Status Effect Resistance Types
export const RESISTANCE_TYPES = {
    PHYSICAL: 'Physical',
    FIRE: 'Fire',
    ICE: 'Ice', 
    LIGHTNING: 'Lightning',
    POISON: 'Poison',
    MENTAL: 'Mental',
    MAGIC: 'Magic',
    TIME: 'Time',
    STUN: 'Stun'
};

// --- Choice Outcome Configuration ---
// Defines the mechanical consequences applied when a player selects a choice.
// Outcomes are now contextual and multi-dimensional, considering the specific action,
// current situation, and character state.
export const ChoiceOutcomeConfig = {
    // Base outcome ranges for different choice types
    // These serve as starting points that get modified by context
    baseOutcomes: {
        Good: {
            successChance: 0.9,
            physical: {
                hpChange: [0, 5] // Can heal a small amount
            },
            resource: {
                coinChange: [0, 10],
                itemChance: 0.2,
                itemOptions: {
                    tiers: ['Low', 'Medium'],
                    types: ['Consumable', 'Misc']
                }
            },
            narrative: {
                reputationChange: [0, 1],
                informationGain: true
            },
            reputation: {
                authority: [2, 5],      // Nobles love lawful behavior
                warriors: [-1, 0],      // Warriors see as "soft"
                naturalists: [1, 2],    // Druids appreciate harmony
                shadows: [-2, -1],      // Rogues see as "goody-two-shoes"
                scholars: [1, 2],       // Scholars value wisdom
                common: [1, 3]          // Common folk love kindness
            }
        },
        Bad: {
            successChance: 0.3,
            physical: {
                hpChange: [-20, -5] // Always takes damage
            },
            resource: {
                coinChange: [-10, 20], // High risk, high reward
                itemChance: 0.4, // Higher item chance
                itemOptions: {
                    tiers: ['Medium', 'High'],
                    types: ['Weapon', 'Armor', 'Quest']
                }
            },
            narrative: {
                reputationChange: [-2, 2],
                informationGain: false
            },
            reputation: {
                authority: [-8, -3],    // Nobles hate lawless behavior
                warriors: [1, 2],       // Warriors respect ruthlessness
                naturalists: [-5, -2],  // Druids hate harmful acts
                shadows: [2, 4],        // Rogues appreciate rule-breaking
                scholars: [-3, -1],     // Scholars disapprove of recklessness
                common: [-5, -2]        // Common folk fear dangerous behavior
            }
        },
        Risky: {
            successChance: 0.5,
            physical: {
                hpChange: [-15, 10] // Can heal or hurt
            },
            resource: {
                coinChange: [-5, 15],
                itemChance: 0.3,
                itemOptions: {
                    tiers: ['Low', 'Medium', 'High'],
                    types: ['Weapon', 'Armor', 'Consumable']
                }
            },
            narrative: {
                reputationChange: [-1, 2],
                informationGain: true
            },
            reputation: {
                authority: [-1, 2],     // Nobles vary based on outcome
                warriors: [2, 4],       // Warriors respect boldness
                naturalists: [0, 1],    // Druids neutral on calculated risks
                shadows: [1, 3],        // Rogues like calculated risks
                scholars: [0, 1],       // Scholars appreciate careful planning
                common: [-1, 1]         // Common folk worried but impressed
            }
        },
        Silly: {
            successChance: 0.7,
            physical: {
                hpChange: [-5, 5] // Minor effects
            },
            resource: {
                coinChange: [-2, 8],
                itemChance: 0.15,
                itemOptions: {
                    tiers: ['Low'],
                    types: ['Misc', 'Consumable']
                }
            },
            narrative: {
                reputationChange: [0, 1],
                informationGain: false
            },
            reputation: {
                authority: [-2, -1],    // Nobles see as undignified
                warriors: [0, 0],       // Warriors indifferent
                naturalists: [0, 0],    // Druids indifferent
                shadows: [1, 1],        // Rogues appreciate unpredictability
                scholars: [0, 0],       // Scholars indifferent
                common: [1, 2]          // Common folk enjoy humor
            }
        },
        Investigative: {
            successChance: 0.8,
            physical: {
                hpChange: [-5, 5] // Slightly higher risk/reward for thorough exploration
            },
            resource: {
                coinChange: [0, 15], // Better rewards for investigation
                itemChance: 0.3, // Higher chance of finding items
                itemOptions: {
                    tiers: ['Low', 'Medium'],
                    types: ['Quest', 'Misc', 'Consumable'] // Added consumables for exploration finds
                }
            },
            narrative: {
                reputationChange: [0, 1],
                informationGain: true,
                specialAbilityChance: 0.3 // 30% chance to gain special ability during investigation
            },
            reputation: {
                authority: [0, 1],      // Nobles appreciate thoroughness
                warriors: [0, 0],       // Warriors indifferent to investigation
                naturalists: [1, 2],    // Druids value seeking natural wisdom
                shadows: [0, 1],        // Rogues appreciate information gathering
                scholars: [3, 5],       // Scholars LOVE knowledge-seeking
                common: [1, 1]          // Common folk appreciate thoroughness
            }
        },
        Attack: {
            successChance: 0.7,
            physical: {
                hpChange: [-5, 0] // Combat actions can cause damage to self if failed
            },
            resource: {
                coinChange: [0, 5],
                itemChance: 0.1,
                itemOptions: {
                    tiers: ['Low'],
                    types: ['Consumable']
                }
            },
            narrative: {
                reputationChange: [0, 1],
                informationGain: false
            }
        },
        Special: {
            successChance: 0.6,
            physical: {
                hpChange: [-10, 5] // Higher risk/reward for special moves
            },
            resource: {
                coinChange: [0, 10],
                itemChance: 0.2,
                itemOptions: {
                    tiers: ['Low', 'Medium'],
                    types: ['Consumable', 'Misc']
                }
            },
            narrative: {
                reputationChange: [0, 2],
                informationGain: false
            }
        },
        Item: {
            successChance: 0.9,
            physical: {
                hpChange: [0, 15] // Items usually help
            },
            resource: {
                coinChange: [-5, 0], // Using items costs resources
                itemChance: 0.05, // Low chance of finding items when using items
                itemOptions: {
                    tiers: ['Low'],
                    types: ['Consumable']
                }
            },
            narrative: {
                reputationChange: [0, 0],
                informationGain: false
            }
        },
        Run: {
            successChance: 0.8,
            physical: {
                hpChange: [-2, 0] // Minor risk when running
            },
            resource: {
                coinChange: [-2, 0], // Might lose some coins when fleeing
                itemChance: 0.05,
                itemOptions: {
                    tiers: ['Low'],
                    types: ['Misc']
                }
            },
            narrative: {
                reputationChange: [-1, 0], // Running might hurt reputation
                informationGain: false
            },
            reputation: {
                authority: [0, 0],
                warriors: [-2, -1],   // Warriors disdain fleeing
                naturalists: [0, 1],
                shadows: [0, 1],
                scholars: [0, 0],
                common: [0, 0]
            }
        }
    },

    // Context modifiers that adjust the base outcomes
    contextModifiers: {
        // Situation-based modifiers
        situations: {
            combat: {
                physical: {
                    hpChangeMultiplier: 1.5,    // Increased HP changes in combat
                    statusEffectChance: 1.2     // More likely to get status effects
                },
                resource: {
                    itemChanceMultiplier: 0.8   // Reduced item chances in combat
                }
            },
            exploration: {
                physical: {
                    hpChangeMultiplier: 0.8,    // Reduced HP changes during exploration
                    statusEffectChance: 0.8     // Less likely to get status effects
                },
                resource: {
                    coinChangeMultiplier: 1.2,  // Increased coin changes during exploration
                    itemChanceMultiplier: 1.2   // Increased item chances during exploration
                }
            },
            social: {
                physical: {
                    hpChangeMultiplier: 0.5,    // Minimal HP changes in social situations
                    statusEffectChance: 0.5     // Rare status effects in social situations
                },
                narrative: {
                    reputationMultiplier: 1.5,  // Increased reputation changes
                    relationshipMultiplier: 1.5  // Increased relationship changes
                }
            }
        },

        // Character state modifiers
        characterState: {
            wounded: {
                physical: {
                    hpChangeMultiplier: 0.7,    // Reduced healing when wounded
                    statusEffectChance: 1.3     // More likely to get new status effects
                }
            },
            healthy: {
                physical: {
                    hpChangeMultiplier: 1.2,    // Increased healing when healthy
                    statusEffectChance: 0.8     // Less likely to get status effects
                }
            },
            rich: {
                resource: {
                    coinChangeMultiplier: 0.8,  // Reduced coin gains when rich
                    itemChanceMultiplier: 1.2   // Increased item chances when rich
                }
            },
            poor: {
                resource: {
                    coinChangeMultiplier: 1.2,  // Increased coin gains when poor
                    itemChanceMultiplier: 0.8   // Reduced item chances when poor
                }
            }
        },

        // Environmental modifiers
        environment: {
            dangerous: {
                physical: {
                    hpChangeMultiplier: 1.3,    // Increased HP changes in dangerous areas
                    statusEffectChance: 1.2     // More likely to get status effects
                },
                resource: {
                    coinChangeMultiplier: 1.2,  // Increased coin changes in dangerous areas
                    itemChanceMultiplier: 1.1   // Slightly increased item chances
                }
            },
            safe: {
                physical: {
                    hpChangeMultiplier: 0.7,    // Reduced HP changes in safe areas
                    statusEffectChance: 0.7     // Less likely to get status effects
                },
                resource: {
                    coinChangeMultiplier: 0.8,  // Reduced coin changes in safe areas
                    itemChanceMultiplier: 0.9   // Slightly reduced item chances
                }
            }
        }
    }
};

// --- Local Storage ---
export const SAVE_GAME_PREFIX = 'AG-';           // Prefix for save game keys (spec: AG-<date-time-code>)
export const SAVE_GAME_LEGACY_PREFIX = 'advStorySave_'; // Old prefix — used only for one-time migration

// --- UI Settings ---
export const POPUP_DURATION = 3000; // Default popup message duration (ms)
// Delay before showing "Thinking..." when waiting for AI (unused currently)
// export const TYPING_INDICATOR_DELAY = 800;