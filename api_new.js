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
 * Test local AI server connectivity by hitting /health.
 *
 * Earlier versions sent a 10-token /v1/chat/completions probe — that's fine
 * for a non-thinking model, but Qwen3 spends its first 30+ tokens emitting
 * `<think>...</think>` so the probe came back empty and surfaced as "Local
 * AI server not available" on every game start. /health is fast and
 * backend-agnostic.
 */
export async function testLocalAI() {
    const log = window.displayVisualError || console.log;
    log('Testing local AI server connectivity...');

    try {
        const Config = await import('./config.js?cb=014');
        const url = Config.getActiveBackendConfig().url + '/health';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Health check returned HTTP ${response.status}`);
        }
        const health = await response.json();
        // MiniCPM Python: {status:"healthy", model_loaded:true}
        // llama-server:   {status:"ok"}
        const ok = health.status === 'ok' || health.model_loaded === true || health.status === 'healthy';
        if (!ok) {
            throw new Error(`Server reports not ready: ${JSON.stringify(health)}`);
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
