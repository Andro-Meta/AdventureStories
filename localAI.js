// localAI.js — client for the storyteller AI.
// The game only uses free online providers (OpenRouter, Google AI Studio) over
// the OpenAI-compatible /chat/completions API, called straight from the
// browser with the player's own key. Local and on-device models were removed.

import * as Config from './config.js';

/** Tell the loading overlay what a slow request is doing (ui.js listens). */
function announceAIStatus(message) {
    try { globalThis.dispatchEvent?.(new CustomEvent('adv:ai-status', { detail: message })); } catch (_) { /* no DOM */ }
}

export class LocalAIClient {
    constructor() {
        this.applyProvider(Config.resolveCloudProvider());
    }

    applyProvider(provider) {
        this.baseUrl = provider.baseUrl;
        this.modelName = provider.model;
        this.fallbackModels = provider.fallbackModels || [];
        this.apiKey = Config.getCloudApiKey(); // keys are stored per provider host
    }

    /** Save the key the player pasted in AI Settings (per provider host). */
    setApiKey(key) {
        this.apiKey = key || null;
        try {
            const name = Config.cloudKeyStorageName(Config.resolveCloudProvider());
            if (key) window.localStorage.setItem(name, key);
            else window.localStorage.removeItem(name);
        } catch (_) { /* localStorage unavailable — runtime-only key */ }
    }

    /** Switch provider (AI Settings dropdown) and persist the choice. */
    setCloudProvider(providerKey) {
        const provider = Config.CLOUD_PROVIDERS[providerKey];
        if (!provider) { console.warn(`Unknown cloud provider: ${providerKey}`); return; }
        try { window.localStorage.setItem('adv.cloudProvider', providerKey); } catch (_) {}
        this.applyProvider(provider);
    }

    getStatus() {
        return { available: !!this.apiKey, healthy: !!this.apiKey, url: this.baseUrl, model: this.modelName };
    }

    async makeRequest(messages, options = {}) {
        if (!this.apiKey) {
            const e = new Error('No AI key saved yet. Open "AI Settings" on the main menu and paste your free key.');
            e.httpStatus = 0; // configuration problem: not worth a retry
            throw e;
        }
        const d = Config.AI_DEFAULT_PARAMS;
        const requestData = {
            model: this.modelName,
            messages: formatMessages(messages),
            max_tokens: options.max_tokens ?? d.max_tokens,
            temperature: options.temperature ?? d.temperature,
            top_p: options.top_p ?? d.top_p,
            stream: false
        };
        if (this.baseUrl.includes('openrouter')) {
            // Server-side failover: each model in order on rate-limit/downtime.
            if (this.fallbackModels.length) requestData.models = [this.modelName, ...this.fallbackModels];
            // The free Nemotron models "think" first and that hidden reasoning
            // counts against max_tokens: live, 2 of 3 story calls came back
            // empty. Off: valid JSON 2/2 in 2.5-4 s (vs 1/2 in 12-14 s).
            requestData.reasoning = { enabled: false };
        }
        // json_object, not strict json_schema: free models vary in schema
        // support. Shape is enforced by the prompt and the validators.
        if (options.jsonSchema || options.jsonObject) requestData.response_format = { type: 'json_object' };
        return this.executeRequest(requestData);
    }

    async executeRequest(requestData, retries = 0) {
        const { TIMEOUT_MS, MAX_RETRIES, RETRY_DELAY_MS } = Config.AI_REQUEST_CONFIG;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` };
            if (this.baseUrl.includes('openrouter')) {
                headers['HTTP-Referer'] = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://adventure-stories.local';
                headers['X-Title'] = 'Adventure Stories';
            }
            const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST', headers, body: JSON.stringify(requestData), signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                let body = '';
                try { body = (await response.text()).slice(0, 500); } catch (_) {}
                const err = new Error(`HTTP ${response.status}: ${response.statusText}${body ? ' — ' + body : ''}`);
                err.httpStatus = response.status;
                err.retryable = response.status >= 500 || response.status === 429;
                err.retryAfterMs = Number(response.headers.get('retry-after')) * 1000 || 0;
                if (response.status === 429 && /per[- ]day/i.test(body)) {
                    err.retryable = false; // daily quota, not a burst limit
                    err.message = "Today's free AI requests are used up (OpenRouter allows 50/day, or 1000/day once an account has bought $10 of credits). Try again tomorrow or switch provider in AI Settings.";
                } else if (response.status === 401) {
                    err.message = 'The AI key was rejected. Open AI Settings and paste a fresh key.';
                }
                throw err;
            }

            const result = await response.json();
            const choice = result.choices?.[0];
            if (!choice) throw new Error('No response generated');
            // Only the answer counts; a model's reasoning text is never story.
            const msg = choice.message || {};
            if (!msg.content && choice.finish_reason === 'length') {
                throw new Error('The AI ran out of room before answering (max_tokens reached)');
            }
            return msg.content ?? '';
        } catch (error) {
            const isNetworkError = error.name === 'AbortError' || error.name === 'TypeError'
                || (error.message || '').toLowerCase().includes('failed to fetch');
            const shouldRetry = isNetworkError || error.retryable === true;
            console.log(`AI: request failed (attempt ${retries + 1}, retryable=${shouldRetry}):`, error.message);
            if (shouldRetry && retries < MAX_RETRIES) {
                // A per-minute 429 needs the window to roll over: honour
                // Retry-After, else wait 20 s (quick retries all failed).
                const wait = error.httpStatus === 429
                    ? Math.min(Math.max(error.retryAfterMs || 20000, 5000), 60000)
                    : RETRY_DELAY_MS * (retries + 1);
                const why = error.httpStatus === 429 ? 'The storyteller is busy' : 'Connection hiccup';
                announceAIStatus(`${why}. Trying again in ${Math.round(wait / 1000)} s (attempt ${retries + 2} of ${MAX_RETRIES + 1})...`);
                await new Promise(resolve => setTimeout(resolve, wait));
                return this.executeRequest(requestData, retries + 1);
            }
            if (shouldRetry) {
                const e = new Error(`The storyteller didn't respond after ${MAX_RETRIES + 1} tries (${error.message}). Your choices are still there; try again in a moment.`);
                e.httpStatus = error.httpStatus ?? 0;
                throw e;
            }
            throw error;
        }
    }
}

function formatMessages(messages) {
    if (typeof messages === 'string') return [{ role: 'user', content: messages }];
    if (Array.isArray(messages)) return messages.map(m => ({ role: m.role || 'user', content: m.content || m }));
    return [{ role: 'user', content: String(messages) }];
}

export const localAI = new LocalAIClient();

export async function getLocalAIResponse(messages, options = {}) {
    return localAI.makeRequest(messages, options);
}

/** JSON request; returns the parsed object (throws if no JSON can be found). */
export async function getLocalAIJSONResponse(messages, schema, options = {}) {
    const raw = await localAI.makeRequest(messages, { ...options, jsonSchema: schema });
    return parseJSONFromModelOutput(raw);
}

/**
 * Tolerant JSON extractor. Models sometimes wrap JSON in code fences, prepend
 * "Here's the JSON:" filler, or trail commentary after the closing brace.
 */
export function parseJSONFromModelOutput(raw) {
    if (typeof raw !== 'string') throw new Error('Model output is not a string');
    // Strip <think> blocks and raw control characters JSON.parse rejects.
    const stripped = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .trim();
    try { return JSON.parse(stripped); } catch (_) { /* try fenced/sliced */ }
    const fenceMatch = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1].trim()); } catch (_) { /* fall through */ }
    }
    const first = stripped.indexOf('{');
    const last = stripped.lastIndexOf('}');
    if (first !== -1 && last > first) {
        try { return JSON.parse(stripped.slice(first, last + 1)); } catch (e) {
            throw new Error(`Could not parse JSON from model output: ${e.message}`);
        }
    }
    throw new Error('Model output contained no JSON object');
}
