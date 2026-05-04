// api_new.js
// Local-AI API handler. Routes through localAI.js to whichever backend
// config.LLM_BACKEND selects ('llama-cpp' or 'minicpm-python'). Both expose
// OpenAI-compatible /v1/chat/completions, so consumer code is backend-
// agnostic and never references a specific model name.

// --- Module Imports ---
import { gameState } from './state.js?cb=014';
import { getLocalAIResponse, getLocalAIJSONResponse } from './localAI.js?cb=014';

/**
 * Main API handler - uses local AI server exclusively
 * @param {object[]} messages - The array of message objects
 * @param {object} [options={}] - Optional parameters
 * @param {number} [retryAttempt=0] - Internal counter for retry attempts (unused)
 * @returns {Promise<string>} A promise that resolves with the AI's response content string
 */
export async function getAIResponse(messages, options = {}, retryAttempt = 0) {
    const log = window.displayVisualError || console.log;

    try {
        return await getLocalAIResponse(messages, options);
    } catch (error) {
        log(`CRITICAL ERROR: Local AI failed: ${error.message}`);
        throw new Error(`Local AI server is not available: ${error.message}. Please ensure the configured LLM backend is running.`);
    }
}

/**
 * JSON-schema-constrained AI request. The configured backend will (where
 * supported) be told to emit only valid JSON matching the schema. Returns
 * the parsed object.
 *
 * Backends with grammar/JSON support (llama.cpp, vLLM, Ollama) will enforce
 * the schema at sample-time. Backends without (e.g. the bundled MiniCPM
 * Python server) ignore the schema field, but the caller's system prompt
 * still asks for JSON, and the response is parsed by the same tolerant
 * extractor — so the JSON path remains the right call regardless of backend.
 */
export async function getAIResponseJSON(messages, schema, options = {}) {
    const log = window.displayVisualError || console.log;
    try {
        return await getLocalAIJSONResponse(messages, schema, options);
    } catch (error) {
        log(`API: JSON response failed: ${error.message}`);
        throw error;
    }
}

/**
 * Test local AI server connectivity using the backend's own healthPath.
 *
 * BUG-04 fix: previously this hardcoded `/health` for every backend, which
 * 404s on Ollama (uses `/api/tags`) and on cloud (no health endpoint at
 * all). Result: every Ollama user saw "Local AI server is not available"
 * on game start until the periodic health-check eventually succeeded.
 *
 * Now: read backend.healthPath; for cloud backends (no path), treat the
 * presence of an API key as healthy (real reachability is verified on
 * first inference call); for litert (on-device), defer to the bridge.
 */
export async function testLocalAI() {
    const log = window.displayVisualError || console.log;
    log('Testing local AI server connectivity...');

    const Config = await import('./config.js?cb=014');
    const backend = Config.getActiveBackendConfig();

    // litert (on-device, Capacitor) — defer to the bridge's health check.
    if (backend.isLiteRT) {
        try {
            const Bridge = await import('./liteRTBridge.js?cb=014');
            const h = await Bridge.checkHealth();
            const ok = h.status === 'healthy' || h.status === 'pending';
            log(`LiteRT bridge: ${h.status}${h.reason ? ' (' + h.reason + ')' : ''}`);
            return ok;
        } catch (e) {
            log(`LiteRT bridge test failed: ${e.message}`);
            throw e;
        }
    }

    // cloud — no health endpoint; presence of API key is the contract.
    if (backend.isCloud) {
        const key = Config.getCloudApiKey();
        if (!key) throw new Error('Cloud backend requires an API key — paste one in the Local AI Status panel.');
        log(`Cloud backend (${backend.providerName || backend.modelName}) configured with API key — first request will verify reachability.`);
        return true;
    }

    const healthPath = backend.healthPath || '/health';
    const url = backend.url + healthPath;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Health check ${url} returned HTTP ${response.status}`);
        }
        const health = await response.json();
        // MiniCPM Python: {status:"healthy", model_loaded:true}
        // llama-server:   {status:"ok"}
        // Ollama /api/tags: {models:[...]}
        const ok = health.status === 'ok'
                || health.status === 'healthy'
                || health.model_loaded === true
                || Array.isArray(health.models);
        if (!ok) {
            throw new Error(`Server at ${url} reports not ready: ${JSON.stringify(health).slice(0, 200)}`);
        }
        log(`Local AI server test successful (${url})`);
        return true;
    } catch (error) {
        log(`Local AI server test failed: ${error.message}`);
        throw error;
    }
}

// External API integrations (OpenRouter, Google AI Studio) were removed in
// Tier 1. Local-only inference: see config.LLM_BACKEND for the active backend
// and getActiveBackendConfig() for its URL / model / context window.
