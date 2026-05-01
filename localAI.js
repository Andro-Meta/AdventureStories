// localAI.js
// Local AI Server Integration for Adventure Stories Game.
// Speaks the OpenAI-compatible /v1/chat/completions shape; the active backend
// is selected by config.LLM_BACKEND ('llama-cpp' or 'minicpm-python').

import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';

// Use Config.LOCAL_AI_CONFIG from config.js to avoid duplication

/**
 * Local AI Client
 * Manages connection and requests to local AI server
 */
export class LocalAIClient {
    constructor() {
        // Tier 2: route to whichever backend config.LLM_BACKEND selects.
        // Local backends serve OpenAI-compatible /v1/chat/completions.
        // Cloud backends (Phase 0) also speak the same shape but require
        // an Authorization header and skip backend-specific params like
        // cache_prompt and top_k.
        const backend = Config.getActiveBackendConfig();
        this.baseUrl = backend.url;
        this.backendDefaults = backend.defaultParams;
        this.modelName = backend.modelName;
        this.isCloud = backend.isCloud === true;
        this.apiKey = Config.getCloudApiKey();
        this.isAvailable = false;
        this.isHealthy = false;
        this.modelInfo = null;
        this.healthCheckInterval = null;
        this.requestQueue = [];
        this.isProcessingQueue = false;

        // Load configuration from localStorage or config file
        this.loadConfiguration();

        // Start health monitoring
        this.startHealthMonitoring();
    }

    /**
     * Phase 0: update the API key at runtime when the user pastes one in
     * the settings UI. Persisted to localStorage so it survives reload.
     */
    setApiKey(key) {
        this.apiKey = key || null;
        try {
            if (typeof window !== 'undefined') {
                if (key) {
                    window.localStorage.setItem('adv.apiKey', key);
                } else {
                    window.localStorage.removeItem('adv.apiKey');
                }
            }
        } catch (_) { /* localStorage unavailable — runtime-only key */ }
        this.checkHealth();
    }

    /**
     * Phase 0: switch to a cloud provider at runtime. Updates baseUrl,
     * modelName, isCloud, persists the choice, and re-checks health.
     */
    setCloudProvider(providerKey) {
        const provider = Config.CLOUD_PROVIDERS[providerKey];
        if (!provider) {
            console.warn(`Unknown cloud provider: ${providerKey}`);
            return;
        }
        this.baseUrl = provider.baseUrl;
        this.modelName = provider.model;
        this.isCloud = true;
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('adv.cloudProvider', providerKey);
                window.localStorage.setItem('adv.llmBackend', 'cloud');
            }
        } catch (_) { /* persistence best-effort */ }
        this.checkHealth();
    }

    /**
     * Phase 0: switch back to local AI from cloud. Reads the local
     * default URL from config and clears the cloud flag.
     */
    setLocalBackend() {
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem('adv.llmBackend', 'llama-cpp');
            }
        } catch (_) { /* persistence best-effort */ }
        // Re-resolve config now that backend is local
        const backend = Config.getActiveBackendConfig();
        this.baseUrl = backend.url;
        this.modelName = backend.modelName;
        this.backendDefaults = backend.defaultParams;
        this.isCloud = false;
        this.checkHealth();
    }
    
    /**
     * Load configuration from various sources.
     *
     * The active backend's URL is the source of truth (config.LLM_BACKEND →
     * getActiveBackendConfig). localStorage and `local_ai_config.json` may
     * override the URL only when they're consistent with the active backend's
     * port; stale legacy values from a previous backend are ignored so a
     * config flip in config.js actually takes effect on next load.
     */
    loadConfiguration() {
        try {
            const backend = Config.getActiveBackendConfig();
            // Cloud backends don't have a local config file or persistent
            // localStorage URL — the URL is fixed by the provider preset.
            // Skip the local-port reconciliation entirely.
            if (backend.isCloud) {
                return;
            }
            const fallback = backend.url;
            const activePort = new URL(fallback).port;

            const isCompatibleUrl = (url) => {
                try { return new URL(url).port === activePort; } catch (_) { return false; }
            };

            // Try to load from localStorage first
            const savedConfig = localStorage.getItem('localAIConfig');
            if (savedConfig) {
                const config = JSON.parse(savedConfig);
                if (config.url && isCompatibleUrl(config.url)) {
                    this.baseUrl = config.url;
                    return;
                }
                // Stale entry from a previous backend — drop it.
                localStorage.removeItem('localAIConfig');
            }

            // Try to load from config file (if available). Only honored when its
            // URL matches the active backend's port; otherwise it's a stale
            // legacy artifact (typical case: setup_local_ai.py wrote
            // local_ai_config.json pointing at the MiniCPM port 8001).
            fetch('./local_ai_config.json')
                .then(response => response.json())
                .then(config => {
                    if (config.local_ai_server && config.local_ai_server.enabled
                        && isCompatibleUrl(config.local_ai_server.url)) {
                        this.baseUrl = config.local_ai_server.url;
                        this.saveConfiguration();
                    } else {
                        console.log('LocalAI: ignoring local_ai_config.json (mismatched port for active backend); using', fallback);
                    }
                })
                .catch(() => {
                    console.log('LocalAI: Using default configuration:', fallback);
                });

        } catch (error) {
            console.log('LocalAI: Error loading configuration:', error);
        }
    }
    
    /**
     * Save configuration to localStorage
     */
    saveConfiguration() {
        try {
            const config = {
                url: this.baseUrl,
                enabled: true,
                lastUpdated: Date.now()
            };
            localStorage.setItem('localAIConfig', JSON.stringify(config));
        } catch (error) {
            console.log('LocalAI: Error saving configuration:', error);
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        // Initial health check
        this.checkHealth();
        
        // Periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, Config.LOCAL_AI_CONFIG.HEALTH_CHECK_INTERVAL);
    }
    
    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
    
    /**
     * Check server health and availability
     */
    async checkHealth() {
        // Cloud providers don't expose /health. Treat them as healthy iff
        // the user has provided an API key — actual reachability is
        // verified on first real request, with retries/timeout fallback.
        if (this.isCloud) {
            if (this.apiKey) {
                this.isAvailable = true;
                this.isHealthy = true;
                this.modelInfo = { status: 'cloud', model: this.modelName };
                if (this.requestQueue.length > 0) {
                    this.processRequestQueue();
                }
                return this.modelInfo;
            }
            this.isAvailable = false;
            this.isHealthy = false;
            return null;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Config.LOCAL_AI_CONFIG.CONNECTION_TIMEOUT);

            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                const health = await response.json();
                this.isAvailable = true;
                // MiniCPM Python server: {status:"healthy", model_loaded:true}
                // llama-server:           {status:"ok"}
                this.isHealthy = health.status === 'healthy' || health.status === 'ok';
                this.modelInfo = health;

                // Process queued requests if server is healthy
                if (this.isHealthy && this.requestQueue.length > 0) {
                    this.processRequestQueue();
                }

                return health;
            } else {
                this.isAvailable = false;
                this.isHealthy = false;
                return null;
            }

        } catch (error) {
            this.isAvailable = false;
            this.isHealthy = false;
            // Don't log connection errors too frequently
            if (error.name !== 'AbortError') {
                console.log('LocalAI: Health check failed:', error.message);
            }
            return null;
        }
    }
    
    /**
     * Make AI request with automatic retry and queuing
     */
    async makeRequest(messages, options = {}) {
        const defaults = this.backendDefaults || Config.LOCAL_AI_CONFIG.DEFAULT_PARAMS;
        const requestData = {
            messages: this.formatMessages(messages),
            max_tokens: options.max_tokens || defaults.max_tokens,
            temperature: options.temperature || defaults.temperature,
            top_p: options.top_p || defaults.top_p,
            stream: false
        };

        // Cloud APIs require the model name in the request body. Local
        // llama-server uses whatever was loaded at startup, but accepts
        // the field harmlessly. Always include it.
        if (this.modelName) {
            requestData.model = this.modelName;
        }

        if (this.isCloud) {
            // Cloud APIs (OpenRouter, Groq, Google AI Studio) don't accept
            // top_k or cache_prompt. Strip them so the request validates.
            // Also strip Bearer-irrelevant fields.
            // (cache_prompt and top_k are deliberately not added above.)
        } else {
            // Local backends (llama-server, MiniCPM Python) accept top_k.
            requestData.top_k = options.top_k || defaults.top_k;
            // Phase 1-D: tell llama-server to keep its KV-cache prefix slot
            // warm. Branching choices share ~99% of the system prompt + arc
            // memory + entity memory across turns, so prefix reuse is the
            // single biggest free latency win on this stack. llama-server
            // ignores the field on backends that don't support it.
            requestData.cache_prompt = true;
        }

        // Schema-constrained generation. Per llama.cpp's tools/server docs the
        // /v1/chat/completions endpoint accepts a bare `schema` directly on
        // response_format:  { "type": "json_schema", "schema": {...} }
        //
        // We deliberately do NOT use OpenAI's nested `json_schema: {name,
        // schema, strict:true}` shape here: llama.cpp's grammar converter
        // doesn't honor `strict`, and `minItems/maxItems/minLength/maxLength`
        // on the schema fail the JSON-Schema-to-GBNF compile path silently.
        // We strip length constraints and rely on validateChoicesPayload (in
        // schemas.js) for count/type-uniqueness checks post-parse. Backends
        // that don't enforce schemas at all (e.g. MiniCPM Python) ignore the
        // field entirely; the system prompt + tolerant extractor still work.
        if (options.jsonSchema) {
            if (this.isCloud) {
                // Cloud OpenAI-compatible APIs use the nested
                // `json_schema: {name, schema, strict}` shape. Some
                // (OpenRouter free models, Groq) silently ignore it; we
                // include it anyway and rely on the tolerant extractor in
                // parseJSONFromModelOutput as the safety net.
                requestData.response_format = {
                    type: 'json_schema',
                    json_schema: {
                        name: options.jsonSchemaName || 'response',
                        schema: stripUnsupportedSchemaConstraints(options.jsonSchema),
                        strict: false
                    }
                };
            } else {
                requestData.response_format = {
                    type: 'json_schema',
                    schema: stripUnsupportedSchemaConstraints(options.jsonSchema)
                };
            }
        } else if (options.jsonObject) {
            requestData.response_format = { type: 'json_object' };
        }

        // If server is not healthy, queue the request
        if (!this.isHealthy) {
            return new Promise((resolve, reject) => {
                this.requestQueue.push({ requestData, resolve, reject, retries: 0 });

                // Try to process queue immediately
                this.processRequestQueue();
            });
        }

        return this.executeRequest(requestData);
    }
    
    /**
     * Execute a single request with retry logic
     */
    async executeRequest(requestData, retries = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Config.LOCAL_AI_CONFIG.CONNECTION_TIMEOUT);

            // Build headers — cloud providers require an Authorization
            // bearer token; local servers don't (and would reject extra
            // headers in CORS preflight on some llama-server builds).
            const headers = { 'Content-Type': 'application/json' };
            if (this.isCloud && this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }
            // OpenRouter optionally accepts these for usage analytics — they
            // don't affect routing but are recommended by their docs.
            if (this.isCloud && this.baseUrl.includes('openrouter')) {
                headers['HTTP-Referer'] = (typeof window !== 'undefined' && window.location)
                    ? window.location.origin
                    : 'https://adventure-stories.local';
                headers['X-Title'] = 'Adventure Stories';
            }

            // Cloud providers don't expose /v1/chat/completions identically —
            // base URLs are configured to include any provider-specific path
            // prefix (e.g. Google AI's /openai/), and we always append
            // /chat/completions. Local backends use /v1/chat/completions.
            const endpoint = this.isCloud
                ? `${this.baseUrl.replace(/\/$/, '')}/chat/completions`
                : `${this.baseUrl}/v1/chat/completions`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestData),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Extract the response text
            if (result.choices && result.choices.length > 0) {
                return result.choices[0].message.content;
            } else {
                throw new Error('No response generated');
            }
            
        } catch (error) {
            console.log(`LocalAI: Request failed (attempt ${retries + 1}):`, error.message);
            
            if (retries < Config.LOCAL_AI_CONFIG.MAX_RETRIES) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, Config.LOCAL_AI_CONFIG.RETRY_DELAY * (retries + 1)));
                return this.executeRequest(requestData, retries + 1);
            } else {
                throw new Error(`LocalAI request failed after ${Config.LOCAL_AI_CONFIG.MAX_RETRIES} attempts: ${error.message}`);
            }
        }
    }
    
    /**
     * Process queued requests
     */
    async processRequestQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0 || !this.isHealthy) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.requestQueue.length > 0 && this.isHealthy) {
            const { requestData, resolve, reject, retries } = this.requestQueue.shift();
            
            try {
                const result = await this.executeRequest(requestData, retries);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
        
        this.isProcessingQueue = false;
    }
    
    /**
     * Format messages for the local AI server
     */
    formatMessages(messages) {
        if (typeof messages === 'string') {
            return [{ role: 'user', content: messages }];
        }
        
        if (Array.isArray(messages)) {
            return messages.map(msg => ({
                role: msg.role || 'user',
                content: msg.content || msg
            }));
        }
        
        return [{ role: 'user', content: String(messages) }];
    }
    
    /**
     * Get server status information
     */
    getStatus() {
        return {
            available: this.isAvailable,
            healthy: this.isHealthy,
            url: this.baseUrl,
            modelInfo: this.modelInfo,
            queueLength: this.requestQueue.length
        };
    }
    
    /**
     * Update server URL
     */
    setUrl(newUrl) {
        this.baseUrl = newUrl;
        this.saveConfiguration();
        this.checkHealth(); // Immediate health check with new URL
    }
}

// Global instance
export const localAI = new LocalAIClient();

/**
 * Integration with existing API system
 * Provides drop-in replacement for external AI APIs
 */
export async function getLocalAIResponse(messages, options = {}) {
    try {
        const response = await localAI.makeRequest(messages, options);
        return response;
    } catch (error) {
        console.log('LocalAI: Request failed:', error);
        throw error;
    }
}

/**
 * JSON-schema-constrained AI request. Returns the parsed JSON object.
 * @param {Array|string} messages - Messages to send (system+user typically)
 * @param {object} schema - JSON Schema describing the required response shape
 * @param {object} [options] - Standard generation options + { jsonSchemaName }
 * @returns {Promise<object>} Parsed JSON response
 * @throws if the model output cannot be parsed as JSON
 */
export async function getLocalAIJSONResponse(messages, schema, options = {}) {
    const raw = await localAI.makeRequest(messages, {
        ...options,
        jsonSchema: schema,
        jsonSchemaName: options.jsonSchemaName || 'response'
    });
    return parseJSONFromModelOutput(raw);
}

/**
 * Strip JSON-Schema constraints that llama.cpp's grammar converter doesn't
 * honor (and on some versions silently rejects the whole schema): minItems,
 * maxItems, minLength, maxLength. We re-enforce these client-side via
 * validateChoicesPayload after parsing the model output.
 */
function stripUnsupportedSchemaConstraints(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map(stripUnsupportedSchemaConstraints);
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
        if (k === 'minItems' || k === 'maxItems' || k === 'minLength' || k === 'maxLength') continue;
        out[k] = (v && typeof v === 'object') ? stripUnsupportedSchemaConstraints(v) : v;
    }
    return out;
}

/**
 * Tolerant JSON extractor. Models sometimes wrap JSON in code fences, prepend
 * "Here's the JSON:" filler, or trail commentary after the closing brace.
 * We slice from the first '{' to the last '}' before parsing.
 * @param {string} raw - Raw model output
 * @returns {object} Parsed object
 */
export function parseJSONFromModelOutput(raw) {
    if (typeof raw !== 'string') {
        throw new Error('Model output is not a string');
    }
    // Strip Qwen3-style <think>...</think> reasoning blocks BEFORE any other
    // parsing. A think block can contain `{` and `}` characters which would
    // otherwise corrupt the first-{/last-} slice fallback below.
    // Also strip raw control characters (other than \n, \r, \t) — smoke #2
    // saw a "Bad control character in string literal" parse failure when the
    // narrator's prose smuggled a literal \x0B / \x0C into a string field.
    // JSON.parse rejects those even though they're harmless to render.
    const stripped = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .trim();

    // Try direct parse first (happy path: schema-constrained output)
    try { return JSON.parse(stripped); } catch (_) { /* try fenced/sliced */ }

    // Strip common ``` fences
    const fenceMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1].trim()); } catch (_) { /* fall through */ }
    }

    // Slice from first '{' to last '}' as a last resort
    const first = stripped.indexOf('{');
    const last = stripped.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        const sliced = stripped.slice(first, last + 1);
        try { return JSON.parse(sliced); } catch (e) {
            throw new Error(`Could not parse JSON from model output: ${e.message}`);
        }
    }
    throw new Error('Model output contained no JSON object');
}

    /**
     * Check if local AI is available and should be used
     */
    export function shouldUseLocalAI() {
        // SIMPLIFIED: Always use local AI (it's the only supported provider)
        return localAI.isAvailable || localAI.isHealthy;
    }

/**
 * Initialize local AI integration
 */
export function initializeLocalAI() {
    console.log('LocalAI: Initializing local AI integration');
    
    // Add local AI as an option to the game state
    if (!gameState.availableProviders) {
        gameState.availableProviders = [];
    }
    
    if (!gameState.availableProviders.includes('local')) {
        gameState.availableProviders.push('local');
    }
    
    // Check initial status
    localAI.checkHealth().then(health => {
        if (health) {
            console.log('LocalAI: Server is available and healthy');
            console.log('LocalAI: Model info:', health);
        } else {
            console.log('LocalAI: Server is not available');
            console.log('LocalAI: To use local AI, run: python local_ai_server.py --auto-download');
        }
    });
}

/**
 * Cleanup function
 */
export function cleanupLocalAI() {
    localAI.stopHealthMonitoring();
}

// Auto-initialize when module loads
initializeLocalAI();
