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

// Shown in the log header of every game (keep in step with package.json / build.gradle).
export const APP_VERSION = '1.2.9';

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
    // Default: free Gemma 4 on Google first, then free OpenRouter models. A
    // provider that is out of quota, rate-limited or down is skipped for a
    // while and the same request goes to the next one, mid-turn.
    auto: {
        name: '★ Smart switcher (recommended)',
        // Was Gemma 4 31B first (Michael's pick). Measured on his phone
        // 2026-10-08: Gemma on Google always "thinks" first (cannot be turned
        // off there), 27-82 s per reply, 500/503 on half the calls. Flash-Lite
        // on the same free key: 1.5-1.9 s, valid JSON. Up to two Google keys
        // (separate accounts), then Nemotron 3 Super free on OpenRouter.
        // Groq added 2026-10-08 (Michael): on a day Gemini was overloaded and
        // OpenRouter's free quota was spent, nothing answered. Groq's free tier
        // (no card on file, so it can't bill) serves Qwen 3.8 27B fast.
        chain: ['flashlite_google', 'flashlite_google_2', 'groq_qwen', 'groq_qwen_2', 'nemotron_openrouter'],
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-flash-lite-latest',
        signupUrl: 'https://aistudio.google.com/apikey',
        contextWindow: 262144,
        rateLimit: 'Google free tier, then Groq 1,000/day free, then OpenRouter 1000/day free',
        notes: 'Uses every free key you save (Google, Groq, OpenRouter): stays on the one that is working, moves on when one is busy, slow or used up, and learns which is fastest. Never spends credits.'
    },
    flashlite_google: {
        name: 'Google AI Studio — Gemini Flash-Lite (Free)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-flash-lite-latest',
        signupUrl: 'https://aistudio.google.com/apikey',
        contextWindow: 1000000,
        rateLimit: 'Free tier — daily cap shown in AI Studio (resets midnight Pacific)',
        notes: 'Fastest free option measured (~1.5-2 s per turn).'
    },
    flashlite_google_2: {
        name: 'Google AI Studio — Gemini Flash-Lite (2nd key)',
        keySlot: 'generativelanguage.googleapis.com#2',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-flash-lite-latest',
        signupUrl: 'https://aistudio.google.com/apikey',
        contextWindow: 1000000,
        rateLimit: 'Free tier — daily cap shown in AI Studio (resets midnight Pacific)',
        notes: 'Optional key from a second Google account.'
    },
    gemma_google: {
        name: 'Google AI Studio — Gemma 4 31B (Free, slow: thinks 30-80 s)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemma-4-31b-it',
        signupUrl: 'https://aistudio.google.com/apikey',
        contextWindow: 262144,
        rateLimit: 'Free tier — daily cap shown in AI Studio (resets midnight Pacific)',
        notes: 'Free Google key from a project WITHOUT billing turned on.'
    },
    // Optional second AI Studio key (another Google account): its own quota.
    gemma_google_2: {
        name: 'Google AI Studio — Gemma 4 31B (2nd key)',
        keySlot: 'generativelanguage.googleapis.com#2',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemma-4-31b-it',
        signupUrl: 'https://aistudio.google.com/apikey',
        contextWindow: 262144,
        rateLimit: 'Free tier — daily cap shown in AI Studio (resets midnight Pacific)',
        notes: 'Optional key from a second Google account.'
    },
    // Groq free tier: Qwen 3.8 27B with thinking switched off
    // (reasoning_effort "none", added in localAI.buildRequest). ~450 tokens/s.
    groq_qwen: {
        name: 'Groq — Qwen 3.8 27B (Free, fast, no thinking)',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'qwen/qwen3.8-27b',
        signupUrl: 'https://console.groq.com/keys',
        contextWindow: 131072,
        rateLimit: 'Groq free tier: about 1,000 requests a day, 30 a minute',
        notes: 'Free Groq account (no credit card); very fast.'
    },
    groq_qwen_2: {
        name: 'Groq — Qwen 3.8 27B (2nd key)',
        keySlot: 'api.groq.com#2',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'qwen/qwen3.8-27b',
        signupUrl: 'https://console.groq.com/keys',
        contextWindow: 131072,
        rateLimit: 'Groq free tier: about 1,000 requests a day, 30 a minute',
        notes: 'Optional key from a second Groq account.'
    },
    // Auto's OpenRouter step: Nemotron 3 Super free only, no other models.
    nemotron_openrouter: {
        name: 'OpenRouter — Nemotron 3 Super 120B (Free)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        signupUrl: 'https://openrouter.ai/settings/keys',
        contextWindow: 262144,
        rateLimit: OPENROUTER_FREE_LIMITS,
        notes: 'Free model only; never spends credits.'
    },
    openrouter_free: {
        name: 'OpenRouter — Free models (auto-fallback)',
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
export const DEFAULT_CLOUD_PROVIDER = 'auto';

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
    for (const p of providerChain()) { const k = keyForProvider(p); if (k) return k; }
    return null;
}

/** The providers to try, in order (one unless the selection has a chain). */
export function providerChain() {
    const p = resolveCloudProvider();
    return p.chain ? p.chain.map(k => CLOUD_PROVIDERS[k]).filter(Boolean) : [p];
}

/** The saved key for one provider (per host), or null. */
export function keyForProvider(provider) {
    try {
        const ls = window.localStorage;
        const scoped = ls.getItem(cloudKeyStorageName(provider));
        if (scoped) return scoped;
        // Pre-2026-10 builds kept one unscoped key; it was an OpenRouter key.
        if (provider.baseUrl.includes('openrouter')) return ls.getItem('adv.apiKey') || null;
    } catch (_) { /* fall through */ }
    return null;
}

/** Keys are stored per provider host so an OpenRouter and a Google key can coexist. */
export function cloudKeyStorageName(provider) {
    return 'adv.apiKey.' + (provider.keySlot || new URL(provider.baseUrl).hostname);
}

/** Story setting: describe blood/cuts/wounds in fights (off by default). */
export function injuryDetailOn() {
    try { return window.localStorage.getItem('adv.injuryDetail') === '1'; } catch (_) { return false; }
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
export const RESOURCE_REGEN_EXPLORATION = 5;         // Additional resource per character level
export const DOWNED_TURNS_MAX = 3; // Turns until auto-revive after being downed
export const MAX_PLAYERS = 5;
export const MIN_AGE = 6;
export const MAX_AGE = 99;
export const MAX_NAME_LENGTH = 30;

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
// Default name if a theme doesn't provide one
export const REVIVAL_ITEM_DEFAULT_NAME = "Revival Charm";

export const FLEE_CHANCE = 0.4; // Lose 75% of coins on party wipe
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
    FLUSTERED: {
        name: 'Flustered',
        type: 'debuff',
        description: 'Rattled: -2 on choice checks for a few turns',
        icon: '😵',
        color: '#ffaa44',
        defaultDuration: 3,
        defaultData: {},
        resistanceType: 'None',
        canStack: false
    },
    GUARDING: {
        name: 'Guarding',
        type: 'buff',
        description: 'Defending: half damage until your next turn',
        icon: '🛡️',
        color: '#88aaff',
        defaultDuration: 2,
        defaultData: { damageMultiplier: 0.5 },
        resistanceType: 'None',
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
    },
    // The narrator prompt names Regen and Fear; without entries they showed
    // a ❓ and did nothing.
    REGEN: {
        name: 'Regen',
        type: 'heal_over_time',
        description: 'Recovers health each turn',
        icon: '💚',
        color: '#44cc66',
        defaultDuration: 3,
        defaultData: { hpPerTurn: 5 },
        resistanceType: null,
        canStack: false
    },
    FEAR: {
        name: 'Fear',
        type: 'debuff',
        description: 'Shaken: attacks land weaker',
        icon: '😨',
        color: '#9966cc',
        defaultDuration: 2,
        defaultData: { atkMultiplier: 0.7 },
        resistanceType: 'Mental',
        canStack: false
    }
};


// --- Local Storage ---
export const SAVE_GAME_PREFIX = 'AG-';           // Prefix for save game keys (spec: AG-<date-time-code>)
export const SAVE_GAME_LEGACY_PREFIX = 'advStorySave_'; // Default popup message duration (ms)
// Delay before showing "Thinking..." when waiting for AI (unused currently)
// export const TYPING_INDICATOR_DELAY = 800;