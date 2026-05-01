// config.js
// Contains configuration constants for the Adventure Stories game.

// --- Local AI Configuration ---
//
// Tier 2: backends are selectable. Both backends expose OpenAI-compatible
// /v1/chat/completions on localhost, so consumer code stays backend-agnostic.
//
//   'minicpm-python'  — Legacy: working_ai_server.py + HuggingFace Transformers
//                       Pros: works with the model the user already downloaded.
//                       Cons: slow, no grammar/JSON-schema enforcement, ~5GB pip deps.
//
//   'llama-cpp'       — llama-server from llama.cpp. Recommended for new work.
//                       Pros: native streaming, GBNF grammars, JSON schema enforcement,
//                              MCP support, much faster on consumer GPUs.
//                       Cons: requires user to install llama.cpp + download a GGUF model.
//                       See OVERHAUL_PLAN.md for setup steps.
// 'minicpm-python' | 'llama-cpp' | 'cloud'
// 'cloud' = user-configured free OpenAI-compatible online provider (Phase 0).
//   The active cloud provider is selected via localStorage key 'adv.cloudProvider'
//   (one of the keys in CLOUD_PROVIDERS) and the API key via 'adv.apiKey'.
//   Default backend remains llama-cpp; users opt into cloud via the settings UI,
//   which writes localStorage('adv.llmBackend') to 'cloud' to persist their choice.
export const LLM_BACKEND = (() => {
    try {
        if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem('adv.llmBackend');
            if (stored === 'cloud' || stored === 'llama-cpp' || stored === 'minicpm-python') {
                return stored;
            }
        }
    } catch (_) { /* fall through to default */ }
    return 'llama-cpp';
})();

export const LOCAL_AI_CONFIG = {
    MODEL_NAME: 'MiniCPM-2B-128k',
    CONTEXT_WINDOW: 128000, // 128k tokens
    DEFAULT_MAX_TOKENS: 2048,
    DEFAULT_TEMPERATURE: 0.8,
    DEFAULT_URL: 'http://localhost:8001', // Live AI server (working_ai_server.py)
    CONNECTION_TIMEOUT: 120000, // 120 seconds for AI generation (local models can be slow)
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000, // 2 seconds between retries
    HEALTH_CHECK_INTERVAL: 30000, // 30 seconds between health checks

    // Model parameters aligned with MINICPM_OPTIMIZATIONS_APPLIED.md
    DEFAULT_PARAMS: {
        max_tokens: 2048,
        temperature: 0.8,
        top_p: 0.8,
        top_k: 50
    }
};

// llama.cpp llama-server config. Used when LLM_BACKEND === 'llama-cpp'.
// Default: Gemma-3n-E4B-it Q4_K_M (~4.5 GB). Locked in 2026-04-29 after
// head-to-head testing against Qwen3-4B (see TEST_REPORT_2026-04-29.md):
// 100% arc-memory JSON reliability, ~5x faster on schema-constrained calls,
// 5:1 sliding-window attention keeps the KV cache small (~700 MB at 32k Q8),
// total resident ~4.5 GB — fits comfortably on 12+ GB phones. The Qwen3-4B
// GGUF is preserved on disk for fallback comparison.
export const LLAMA_CPP_CONFIG = {
    MODEL_NAME: 'gemma-3n-E4B-it-Q4_K_M',
    MODEL_FILE: './models/gemma-3n-E4B-it-Q4_K_M.gguf', // Path passed to llama-server -m
    SERVER_BIN: './llama-cpp/llama-server.exe',  // Path to llama-server binary (Windows)
    SERVER_BIN_UNIX: './llama-cpp/llama-server', // Path to llama-server binary (Linux/Mac)
    CONTEXT_WINDOW: 32768,    // 32k context — Qwen3 supports up to 128k via YaRN
    PORT: 8090,               // 8080 is commonly taken (Docker Desktop, etc.)
    DEFAULT_URL: 'http://localhost:8090',
    GPU_LAYERS: 999,          // Offload all layers to GPU (override to 0 for CPU-only)
    DEFAULT_PARAMS: {
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.95,
        top_k: 40
    }
};

/**
 * Phase 4.0b: Resolve the AI backend URL with the following priority:
 *   1. URL query string `?backend=http://...` — one-off override (great for
 *      testing on a phone via your home network without editing config).
 *   2. localStorage `adv.backendUrl` — persistent override for installed PWAs.
 *   3. The configured DEFAULT_URL — what desktop dev uses.
 *
 * Examples:
 *   Open `http://192.168.1.50:8000/?backend=http://192.168.1.50:8090` on a
 *   phone connected to your home Wi-Fi → loads the PWA from your dev box,
 *   talks to llama-server on the same box. No native port required.
 */
function resolveBackendUrl(defaultUrl) {
    try {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const fromQuery = params.get('backend');
            if (fromQuery) {
                // Persist the override so reloads keep working
                try { window.localStorage.setItem('adv.backendUrl', fromQuery); } catch (_) {}
                return fromQuery;
            }
            const fromStorage = window.localStorage.getItem('adv.backendUrl');
            if (fromStorage) return fromStorage;
        }
    } catch (_) { /* fall through to default */ }
    return defaultUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 0: Cloud AI providers
//
// User-configured optional cloud backends. No keys are hardcoded — users
// paste their own free API key into the settings UI, which is persisted in
// localStorage as 'adv.apiKey' (visible to JS, but acceptable for a
// client-side game where the user owns the key and chooses to use it).
//
// All three providers are OpenAI-compatible /v1/chat/completions, so the
// existing localAI.js calling code is reused; only the base URL, model,
// and Authorization header differ. Phase 0 docs (IMPLEMENTATION_PLAN.md)
// recommend OpenRouter Gemma 4 31B for users who want to stick with Gemma.
// ─────────────────────────────────────────────────────────────────────────────
export const CLOUD_PROVIDERS = {
    openrouter: {
        name: 'OpenRouter (Gemma 4 31B — Free)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-4-31b-it:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 131072,
        rateLimit: '20 RPM, 200 requests/day',
        notes: 'Recommended. Actual Gemma 4, free tier, no credit card. Best when local AI isn\'t set up.'
    },
    openrouter_gemma3: {
        name: 'OpenRouter (Gemma 3 27B — Free)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-3-27b-it:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 131072,
        rateLimit: '20 RPM, 200 requests/day',
        notes: 'Alternative Gemma model — slightly older but proven for storytelling.'
    },
    groq: {
        name: 'Groq (Llama 3.3 70B — Free, fastest)',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        signupUrl: 'https://console.groq.com',
        contextWindow: 128000,
        rateLimit: '30 RPM, 100K tokens/day',
        notes: 'Not Gemma but extremely fast (~315 tok/s) and higher daily limits.'
    },
    googleai: {
        name: 'Google AI Studio (Gemini Flash Lite — Free)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-2.5-flash-lite',
        signupUrl: 'https://aistudio.google.com',
        contextWindow: 1000000,
        rateLimit: '15 RPM, 1000 requests/day',
        notes: 'Most generous daily limit. Quality exceeds Gemma 3 4B.'
    }
};

/**
 * Default cloud provider when LLM_BACKEND === 'cloud' but no specific
 * provider has been selected. Users override via localStorage('adv.cloudProvider').
 */
export const DEFAULT_CLOUD_PROVIDER = 'openrouter';

/**
 * Resolve the active cloud provider config from localStorage selection,
 * falling back to DEFAULT_CLOUD_PROVIDER.
 */
function resolveCloudProvider() {
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
            return window.localStorage.getItem('adv.apiKey') || null;
        }
    } catch (_) { /* fall through */ }
    return null;
}

/**
 * Returns the active backend's URL + param defaults.
 * Used by localAI.js so a single config flag swaps the entire stack.
 */
export function getActiveBackendConfig() {
    if (LLM_BACKEND === 'cloud') {
        const provider = resolveCloudProvider();
        return {
            url: provider.baseUrl,
            modelName: provider.model,
            contextWindow: provider.contextWindow,
            defaultParams: {
                max_tokens: 2048,
                temperature: 0.7,
                top_p: 0.95
                // top_k intentionally omitted — not supported by most cloud APIs
            },
            isCloud: true,
            providerName: provider.name
        };
    }
    if (LLM_BACKEND === 'llama-cpp') {
        return {
            url: resolveBackendUrl(LLAMA_CPP_CONFIG.DEFAULT_URL),
            modelName: LLAMA_CPP_CONFIG.MODEL_NAME,
            contextWindow: LLAMA_CPP_CONFIG.CONTEXT_WINDOW,
            defaultParams: LLAMA_CPP_CONFIG.DEFAULT_PARAMS,
            isCloud: false
        };
    }
    return {
        url: resolveBackendUrl(LOCAL_AI_CONFIG.DEFAULT_URL),
        modelName: LOCAL_AI_CONFIG.MODEL_NAME,
        contextWindow: LOCAL_AI_CONFIG.CONTEXT_WINDOW,
        defaultParams: LOCAL_AI_CONFIG.DEFAULT_PARAMS,
        isCloud: false
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
export const MAX_PLAYERS = 4;
export const MIN_AGE = 6;
export const MAX_AGE = 99;
export const MAX_NAME_LENGTH = 30;
// Max conversation history length, in user/assistant pairs. 20 pairs = 40
// messages + a system prompt; safely fits both backends (128k MiniCPM and
// 32k Qwen3-4B). contextManager.compressHistoryIntelligently() summarises
// older turns when this threshold is exceeded.
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
                    tiers: ['LOW', 'MEDIUM'],
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
                    tiers: ['MEDIUM', 'HIGH'],
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
                    tiers: ['LOW', 'MEDIUM', 'HIGH'],
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
                    tiers: ['LOW'],
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
                    tiers: ['LOW', 'MEDIUM'],
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
                    tiers: ['LOW'],
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
                    tiers: ['LOW', 'MEDIUM'],
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
                    tiers: ['LOW'],
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
                    tiers: ['LOW'],
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
                    coinChangeMultiplier: 0.5,  // Reduced coin changes in combat
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
export const SAVE_GAME_PREFIX = 'advStorySave_'; // Prefix for save game keys

// --- UI Settings ---
export const POPUP_DURATION = 3000; // Default popup message duration (ms)
// Delay before showing "Thinking..." when waiting for AI (unused currently)
// export const TYPING_INDICATOR_DELAY = 800;