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
// Phase 5: 'litert' = on-device LiteRT-LM (Gemma 3 1B etc.) via the
// @capgo/capacitor-llm plugin. Only valid when running inside the
// Capacitor Android shell — selected automatically there, ignored on
// desktop/web (which fall through to llama-cpp).
export const LLM_BACKEND = (() => {
    try {
        if (typeof window !== 'undefined') {
            const stored = window.localStorage.getItem('adv.llmBackend');
            if (stored === 'cloud' || stored === 'llama-cpp' || stored === 'minicpm-python' || stored === 'ollama' || stored === 'litert') {
                return stored;
            }
            // Auto-select litert when running in Capacitor (production APK).
            const Cap = window.Capacitor;
            if (Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform()) {
                return 'litert';
            }
        }
    } catch (_) { /* fall through to default */ }
    return 'llama-cpp';
})();

// Phase 5: LiteRT-LM (on-device) config.
//
// MODEL CHOICE — All filenames verified against the live
// huggingface.co/litert-community/* file listings (May 2026), all sizes
// pulled from the API. **All Gemma variants on HuggingFace are gated**
// behind the Gemma license + an HF token; we ship Gemma as the default
// because it produces the best narrative quality and the user already
// completed the HF setup once. To enable:
//   1. Visit huggingface.co/google/gemma-3-1b-it (and /gemma-3-4b-it for
//      the upgrade), click "Acknowledge license".
//   2. Create a READ token at huggingface.co/settings/tokens.
//   3. Paste it into MODEL_HF_TOKEN below.
//
// SIZE / QUALITY MATRIX (q8 = 8-bit weights, fastest; q4 = 4-bit, smallest):
//   Gemma 3 1B q8 4k ctx  → 1.05 GB   ← DEFAULT (user's S22 Ultra/S24 FE friendly)
//   Gemma 3 1B q4 2k ctx  → 0.55 GB   ← smaller fallback
//   Gemma 3 4B int4 web   → 2.56 GB   ← upgrade for richer narration
//   Gemma 3 4B q4 web     → 2.89 GB   ← alt 4B quant
//   Gemma 3 4B int8 web   → 3.90 GB   ← highest 4B quality, slowest
// All run within Phi-4-mini's RAM ceiling on either of your phones.
//
// NON-GATED ALTERNATES (for users without an HF account):
//   Qwen2.5 1.5B q8       → 1.60 GB
//   Qwen2.5 0.5B q8       → 0.55 GB
//   Phi-4 mini q8         → 3.91 GB
// Switch via localStorage.adv.litertModel = '<key>' to one of ALTERNATES below.
export const LITERT_CONFIG = {
    MODEL_NAME: 'gemma3-1b-it-q8',
    MODEL_FILE: 'Gemma3-1B-IT_multi-prefill-seq_q8_ekv4096.task',
    MODEL_ASSET_PATH: 'Gemma3-1B-IT_multi-prefill-seq_q8_ekv4096.task',
    // Direct .task URL from the litert-community Gemma 3 1B repo. q8
    // weights, 4k context window, 1.05 GB. Best quality-per-MB for this
    // game's narrator workload.
    MODEL_DOWNLOAD_URL: 'https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/Gemma3-1B-IT_multi-prefill-seq_q8_ekv4096.task',
    MODEL_HF_TOKEN: '', // PASTE your HF read token here. Required for any Gemma model.
    MODEL_EXPECTED_BYTES: 1054023846, // strict-size check; set to 0 to disable
    CONTEXT_WINDOW: 4096,
    DEFAULT_PARAMS: {
        max_tokens: 1024,
        temperature: 0.7,
        top_k: 40,
        top_p: 0.95
    },
    // Runtime-selectable via localStorage.adv.litertModel = <key>.
    // First three are GATED (need HF token); last three are non-gated.
    ALTERNATES: {
        'gemma3-1b-it-int4': {
            modelName:      'gemma3-1b-it-int4',
            modelAssetPath: 'gemma3-1b-it-int4.task',
            downloadUrl:    'https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4.task',
            expectedBytes:  554661243,
            contextWindow:  2048,
            defaultParams:  { max_tokens: 512, temperature: 0.7, top_k: 40, top_p: 0.95 },
            requiresHFToken: true,
            note: 'Smallest Gemma. ~555 MB. 2k context. Lowest quality but fastest.'
        },
        'gemma3-4b-it-int4-web': {
            modelName:      'gemma3-4b-it-int4-web',
            modelAssetPath: 'gemma3-4b-it-int4-web.task',
            downloadUrl:    'https://huggingface.co/litert-community/Gemma3-4B-IT/resolve/main/gemma3-4b-it-int4-web.task',
            expectedBytes:  2559442944,
            contextWindow:  8192,
            defaultParams:  { max_tokens: 2048, temperature: 0.7, top_k: 40, top_p: 0.95 },
            requiresHFToken: true,
            note: 'Upgrade to 4B for richer narration. ~2.56 GB. Best quality for S22 Ultra.'
        },
        'gemma3-4b-it-q4-web': {
            modelName:      'gemma3-4b-it-q4-web',
            modelAssetPath: 'gemma3-4b-it-q4_0-web.task',
            downloadUrl:    'https://huggingface.co/litert-community/Gemma3-4B-IT/resolve/main/gemma3-4b-it-q4_0-web.task',
            expectedBytes:  2890530816,
            contextWindow:  8192,
            defaultParams:  { max_tokens: 2048, temperature: 0.7, top_k: 40, top_p: 0.95 },
            requiresHFToken: true,
            note: 'Alt 4B quant (~2.89 GB). Slightly higher quality than int4-web.'
        },
        'qwen2.5-1.5b-instruct': {
            modelName:      'qwen2.5-1.5b-instruct-q8',
            modelAssetPath: 'Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.task',
            downloadUrl:    'https://huggingface.co/litert-community/Qwen2.5-1.5B-Instruct/resolve/main/Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.task',
            expectedBytes:  1598556720,
            contextWindow:  4096,
            defaultParams:  { max_tokens: 1024, temperature: 0.7, top_k: 40, top_p: 0.95 },
            requiresHFToken: false,
            note: 'Non-gated alternative. ~1.6 GB. Strong instruction-following.'
        },
        'qwen2.5-0.5b-instruct': {
            modelName:      'qwen2.5-0.5b-instruct-q8',
            modelAssetPath: 'Qwen2.5-0.5B-Instruct_multi-prefill-seq_q8_ekv1280.task',
            downloadUrl:    'https://huggingface.co/litert-community/Qwen2.5-0.5B-Instruct/resolve/main/Qwen2.5-0.5B-Instruct_multi-prefill-seq_q8_ekv1280.task',
            expectedBytes:  546660344,
            contextWindow:  1280,
            defaultParams:  { max_tokens: 384, temperature: 0.7, top_k: 40, top_p: 0.95 },
            requiresHFToken: false,
            note: 'Non-gated tiny model. ~547 MB. Lowest quality fallback.'
        },
        'phi-4-mini-instruct': {
            modelName:      'phi-4-mini-instruct-q8',
            modelAssetPath: 'Phi-4-mini-instruct_multi-prefill-seq_q8_ekv4096.task',
            downloadUrl:    'https://huggingface.co/litert-community/Phi-4-mini-instruct/resolve/main/Phi-4-mini-instruct_multi-prefill-seq_q8_ekv4096.task',
            expectedBytes:  3910050199,
            contextWindow:  4096,
            defaultParams:  { max_tokens: 1024, temperature: 0.7, top_k: 40, top_p: 0.95 },
            requiresHFToken: false,
            note: 'Non-gated 4B class. ~3.91 GB. Strong reasoning; slower than Gemma.'
        }
    }
};

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

// Ollama config. Used when LLM_BACKEND === 'ollama'.
// Ollama exposes OpenAI-compatible /v1/chat/completions so the same localAI.js
// calling code works — only the health check path differs (/api/tags instead of /health).
// Switch via: localStorage.setItem('adv.llmBackend', 'ollama') in the browser console.
export const OLLAMA_CONFIG = {
    MODEL_NAME: 'gemma3:27b',           // Best Gemma story model in typical Ollama installs
    DEFAULT_URL: 'http://localhost:11434',
    HEALTH_PATH: '/api/tags',           // Ollama lists models here; 200 = healthy
    CONTEXT_WINDOW: 131072,
    DEFAULT_PARAMS: {
        max_tokens: 2048,
        temperature: 0.7,
        top_p: 0.95
        // top_k omitted — Ollama's OpenAI endpoint ignores it
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
// CLOUD MODEL IDs — VERIFIED LIVE against openrouter.ai/api/v1/models in May
// 2026 (HEAD-checked, 200 OK). Picks ranked by storytelling fit + context
// window. Free-tier rate limits: 20 RPM + 50/day on a fresh account, OR
// 1000/day after a one-time $10 credit top-up (no monthly fee).
//
// Why these picks:
//   • Gemma 4 31B (262k ctx) — Google's newest open-weight, best narrative
//     quality + biggest context for long campaigns. Default.
//   • Nemotron 3 Super 120B (262k) — best raw intelligence, slower.
//   • Qwen3 80B (262k) — great instruction-following + JSON compliance.
//   • Llama 3.3 70B (65k) — proven workhorse, fastest of the big ones.
//   • Hermes 3 Llama 405B (131k) — most parameters, fine-tuned for
//     storytelling/RP, less polish than newer models.
//   • Gemma 3 27B (131k) — Gemma family backup if 4 31B has issues.
//   • Gemma 3n E4B (8k) — smallest, fastest fallback for short sessions.
export const CLOUD_PROVIDERS = {
    openrouter: {
        name: 'OpenRouter — Gemma 4 31B (Free) ★ recommended',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-4-31b-it:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 262144,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: '262k context, current Gemma flagship. Best balance of quality + speed for this game.'
    },
    openrouter_nemotron: {
        name: 'OpenRouter — Nemotron 3 Super 120B (Free, smartest)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 262144,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: 'Highest-quality narrative output. Slower per turn; pick this for set-piece moments.'
    },
    openrouter_qwen: {
        name: 'OpenRouter — Qwen3 80B (Free, JSON-strong)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'qwen/qwen3-next-80b-a3b-instruct:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 262144,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: 'Excellent at structured output. Pick this if you see schema-violation errors with Gemma.'
    },
    openrouter_llama70b: {
        name: 'OpenRouter — Llama 3.3 70B (Free, fastest of the big)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 65536,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: 'Reliable workhorse. 65k context — fine for normal play, may run short on 100+ turn arcs.'
    },
    openrouter_hermes405b: {
        name: 'OpenRouter — Hermes 3 Llama 405B (Free, most params)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'nousresearch/hermes-3-llama-3.1-405b:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 131072,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: 'Largest free model. Fine-tuned for storytelling/RP. Slower; pick for narrative depth.'
    },
    openrouter_gemma3_27b: {
        name: 'OpenRouter — Gemma 3 27B (Free, Gemma family backup)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-3-27b-it:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 131072,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: 'Pre-Gemma-4 flagship. Use if Gemma 4 31B has reliability issues.'
    },
    openrouter_gemma3n: {
        name: 'OpenRouter — Gemma 3n E4B (Free, smallest)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-3n-e4b-it:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 8192,
        rateLimit: '20 RPM, 50/day (1000/day after $10 credit)',
        notes: 'Smallest, fastest. 8k context — short sessions only. Use only as last resort.'
    },
    groq: {
        name: 'Groq — Llama 3.3 70B (Free, ~315 tok/s)',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        signupUrl: 'https://console.groq.com',
        contextWindow: 128000,
        rateLimit: '30 RPM, 100K tokens/day',
        notes: 'Extremely fast inference. Tighter daily-token cap; great for active play, not all-day binges.'
    },
    googleai: {
        name: 'Google AI Studio — Gemini 2.5 Flash (Free)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-2.5-flash',
        signupUrl: 'https://aistudio.google.com',
        contextWindow: 1000000,
        rateLimit: '15 RPM, 1500 requests/day',
        notes: 'Most generous daily quota (1500 req/day) and 1M context. Best for marathon sessions.'
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
            id: 'cloud',
            isCloud: true,
            healthPath: null, // Cloud providers skip local health checks
            providerName: provider.name,
            // BUG-14 fix: cloud backends use OpenAI's nested json_schema shape.
            // Most enforce the schema; Groq/free OpenRouter sometimes ignore it.
            supportsJsonSchema: true,
            jsonSchemaShape: 'openai-nested',
            supportsJsonObject: true,
            supportsTopK: false,
            supportsCachePrompt: false
        };
    }
    if (LLM_BACKEND === 'ollama') {
        return {
            url: resolveBackendUrl(OLLAMA_CONFIG.DEFAULT_URL),
            modelName: OLLAMA_CONFIG.MODEL_NAME,
            contextWindow: OLLAMA_CONFIG.CONTEXT_WINDOW,
            defaultParams: OLLAMA_CONFIG.DEFAULT_PARAMS,
            id: 'ollama',
            isCloud: false,
            healthPath: OLLAMA_CONFIG.HEALTH_PATH,  // /api/tags returns { models: [...] }
            // BUG-14 fix: Ollama's OpenAI-compat layer rejects the llama.cpp
            // bare-schema shape AND OpenAI's nested json_schema. It accepts
            // only `{type: 'json_object'}`. Without this flag, every turn
            // silently fell back to the legacy text-only path and diff ops
            // never applied — HP/coins/inventory frozen.
            supportsJsonSchema: false,
            jsonSchemaShape: null,
            supportsJsonObject: true,
            supportsTopK: false,        // Ollama's OpenAI endpoint ignores top_k
            supportsCachePrompt: false  // llama.cpp extension; Ollama doesn't recognize it
        };
    }
    if (LLM_BACKEND === 'litert') {
        // Special: on-device. URL is the synthetic 'litert://local' marker;
        // localAI.js routes to liteRTBridge.chatCompletion() when it sees this.
        return {
            url: 'litert://local',
            modelName: LITERT_CONFIG.MODEL_NAME,
            contextWindow: LITERT_CONFIG.CONTEXT_WINDOW,
            defaultParams: LITERT_CONFIG.DEFAULT_PARAMS,
            id: 'litert',
            isCloud: false,
            isLiteRT: true,
            healthPath: null,
            modelAssetPath: LITERT_CONFIG.MODEL_ASSET_PATH,
            // BUG-14 fix: MediaPipe / LiteRT-LM has no response_format hook.
            // The bridge appends a JSON-mode instruction to the system prompt
            // when this flag is set, so the narrator still produces JSON.
            supportsJsonSchema: false,
            jsonSchemaShape: null,
            supportsJsonObject: false,
            supportsTopK: true,
            supportsCachePrompt: false
        };
    }
    if (LLM_BACKEND === 'llama-cpp') {
        return {
            url: resolveBackendUrl(LLAMA_CPP_CONFIG.DEFAULT_URL),
            modelName: LLAMA_CPP_CONFIG.MODEL_NAME,
            contextWindow: LLAMA_CPP_CONFIG.CONTEXT_WINDOW,
            defaultParams: LLAMA_CPP_CONFIG.DEFAULT_PARAMS,
            id: 'llama-cpp',
            isCloud: false,
            healthPath: '/health',  // llama-server: { status: 'ok' }
            // llama.cpp uses its own bare-schema shape (NOT OpenAI's nested
            // json_schema). Strict mode is honored at sample time via GBNF.
            supportsJsonSchema: true,
            jsonSchemaShape: 'llama-cpp-bare',
            supportsJsonObject: true,
            supportsTopK: true,
            supportsCachePrompt: true   // llama-server's prefix-cache hint
        };
    }
    // minicpm-python fallback (legacy — still supported for users with
    // working_ai_server.py running). No grammar enforcement; relies on
    // tolerant parser.
    return {
        url: resolveBackendUrl(LOCAL_AI_CONFIG.DEFAULT_URL),
        modelName: LOCAL_AI_CONFIG.MODEL_NAME,
        contextWindow: LOCAL_AI_CONFIG.CONTEXT_WINDOW,
        defaultParams: LOCAL_AI_CONFIG.DEFAULT_PARAMS,
        id: 'minicpm-python',
        isCloud: false,
        healthPath: '/health',
        supportsJsonSchema: false,
        jsonSchemaShape: null,
        supportsJsonObject: true,
        supportsTopK: true,
        supportsCachePrompt: false
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