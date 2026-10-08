// localAI.js — client for the storyteller AI.
// The game only uses free online providers (OpenRouter, Google AI Studio) over
// the OpenAI-compatible /chat/completions API, called straight from the
// browser with the player's own key. Local and on-device models were removed.

import * as Config from './config.js';

/** Tell the loading overlay what a slow request is doing (ui.js listens). */
function announceAIStatus(message) {
    try { globalThis.dispatchEvent?.(new CustomEvent('adv:ai-status', { detail: message })); } catch (_) { /* no DOM */ }
}

// Providers that just failed with a quota / rate / outage error, skipped
// until the time stored here (ms). In memory only: a reload tries them again.
const benchedUntil = new Map();
const BENCH_MS = { rate: 5 * 60 * 1000, outage: 2 * 60 * 1000 };
const benchKey = (p) => p.keySlot || (p.baseUrl + p.model);

/** Next quota reset: midnight Pacific (Google) or midnight UTC (OpenRouter). */
export function nextDailyReset(provider, now = Date.now()) {
    if (provider.baseUrl.includes('googleapis')) {
        // ponytail: Pacific as UTC-7 (PDT); an hour early in winter, harmless.
        const pac = new Date(now - 7 * 3600e3);
        return Date.UTC(pac.getUTCFullYear(), pac.getUTCMonth(), pac.getUTCDate() + 1) + 7 * 3600e3;
    }
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/**
 * Never spend OpenRouter credits: every OpenRouter model must be a ':free'
 * variant, so the account's $10 balance stays untouched. Throws before any request.
 */
export function assertFreeOnly(requestData, provider) {
    if (!provider.baseUrl.includes('openrouter')) return;
    const ids = [requestData.model, ...(requestData.models || [])];
    const paid = ids.filter(id => !String(id).endsWith(':free'));
    if (paid.length) {
        const e = new Error(`Refusing paid OpenRouter model(s): ${paid.join(', ')} (free models only)`);
        e.httpStatus = 0;
        throw e;
    }
}

export class LocalAIClient {
    constructor() {
        this.applyProvider(Config.resolveCloudProvider());
    }

    applyProvider(provider) {
        this.baseUrl = provider.baseUrl;
        this.modelName = provider.model;
        this.fallbackModels = provider.fallbackModels || [];
        this.apiKey = Config.getCloudApiKey(); // any key in the chain
    }

    /** Save a key the player pasted in AI Settings (per provider host). */
    setApiKey(key, providerKey = null) {
        const provider = (providerKey && Config.CLOUD_PROVIDERS[providerKey]) || Config.resolveCloudProvider();
        try {
            const name = Config.cloudKeyStorageName(provider);
            if (key) window.localStorage.setItem(name, key);
            else window.localStorage.removeItem(name);
        } catch (_) { /* localStorage unavailable — runtime-only key */ }
        this.apiKey = Config.getCloudApiKey() || key || null;
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

    /**
     * Try each provider in the chain that has a key and isn't benched. A quota,
     * rate-limit or outage error benches that provider and the same request
     * goes to the next one, so the game carries on mid-turn.
     */
    async makeRequest(messages, options = {}) {
        const chain = Config.providerChain().map(p => ({ p, key: Config.keyForProvider(p) })).filter(x => x.key);
        if (!chain.length) {
            const e = new Error('No AI key saved yet. Open "AI Settings" on the main menu and paste your free key.');
            e.httpStatus = 0; // configuration problem: not worth a retry
            throw e;
        }
        const now = Date.now();
        const ready = chain.filter(x => !(benchedUntil.get(benchKey(x.p)) > now));
        const order = ready.length ? ready : chain; // all benched: try anyway rather than stop
        let lastError;
        for (let i = 0; i < order.length; i++) {
            const { p, key } = order[i];
            const hasNext = i < order.length - 1;
            try {
                const out = await this.executeRequest(this.buildRequest(p, messages, options), p, key, 0, hasNext);
                if (this.activeName !== p.name) {
                    if (this.activeName) announceAIStatus(`Storyteller switched to ${p.name}.`);
                    this.activeName = p.name;
                }
                return out;
            } catch (error) {
                lastError = error;
                const s = error.httpStatus;
                const quota = error.dailyQuota || s === 402;
                const rate = s === 429 || s === 403 || s === 503;
                const outage = error.exhausted || error.network || s >= 500;
                if (!hasNext || !(quota || rate || outage)) throw error;
                benchedUntil.set(benchKey(p), quota ? nextDailyReset(p, now) : now + (rate ? BENCH_MS.rate : BENCH_MS.outage));
                console.log(`AI: ${p.name} unavailable (${String(error.message).slice(0, 120)}); trying ${order[i + 1].p.name}`);
                announceAIStatus(`${p.name} is busy; switching storyteller...`);
            }
        }
        throw lastError;
    }

    buildRequest(provider, messages, options) {
        const d = Config.AI_DEFAULT_PARAMS;
        let msgs = formatMessages(messages);
        // Gemma on Google has no separate system role: fold it into the first user turn.
        if (/gemma/i.test(provider.model) && provider.baseUrl.includes('googleapis')) msgs = foldSystemIntoUser(msgs);
        const requestData = {
            model: provider.model,
            messages: msgs,
            max_tokens: options.max_tokens ?? d.max_tokens,
            temperature: options.temperature ?? d.temperature,
            top_p: options.top_p ?? d.top_p,
            stream: false
        };
        if (provider.baseUrl.includes('openrouter')) {
            // Server-side failover: each model in order on rate-limit/downtime.
            if (provider.fallbackModels?.length) requestData.models = [provider.model, ...provider.fallbackModels];
            // The free Nemotron models "think" first and that hidden reasoning
            // counts against max_tokens: live, 2 of 3 story calls came back
            // empty. Off: valid JSON 2/2 in 2.5-4 s (vs 1/2 in 12-14 s).
            requestData.reasoning = { enabled: false };
        }
        // json_object, not strict json_schema: free models vary in schema
        // support. Shape is enforced by the prompt and the validators.
        if (options.jsonSchema || options.jsonObject) requestData.response_format = { type: 'json_object' };
        assertFreeOnly(requestData, provider);
        return requestData;
    }

    async executeRequest(requestData, provider, apiKey, retries = 0, hasNext = false) {
        const { TIMEOUT_MS, MAX_RETRIES, RETRY_DELAY_MS } = Config.AI_REQUEST_CONFIG;
        const started = Date.now();
        const aiLog = (msg) => (globalThis.displayVisualError || console.log)(`AI ${provider.name.split(' — ')[0]} ${provider.model}: ${msg} (${Date.now() - started} ms)`);
        try {
            const controller = new AbortController();
            // A provider with a backup behind it gets less time: a stuck call
            // (live: Gemma hung 45 s, then two 500s) shouldn't hold up the turn.
            const timeoutId = setTimeout(() => controller.abort(), hasNext ? Math.min(TIMEOUT_MS, 20000) : TIMEOUT_MS);
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
            if (provider.baseUrl.includes('openrouter')) {
                headers['HTTP-Referer'] = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://adventure-stories.local';
                headers['X-Title'] = 'Adventure Stories';
            }
            const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST', headers, body: JSON.stringify(requestData), signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                let body = '';
                try { body = (await response.text()).slice(0, 500); } catch (_) {}
                // A model that refuses JSON mode: retry once without it.
                if (response.status === 400 && requestData.response_format && /response_format|json|mime/i.test(body)) {
                    const { response_format, ...plain } = requestData;
                    return this.executeRequest(plain, provider, apiKey, retries, hasNext);
                }
                const err = new Error(`HTTP ${response.status}: ${response.statusText}${body ? ' — ' + body : ''}`);
                err.httpStatus = response.status;
                err.retryable = response.status >= 500 || response.status === 429;
                err.retryAfterMs = Number(response.headers.get('retry-after')) * 1000 || 0;
                if (response.status === 429 && /per[- ]?day|daily|PerDay/i.test(body)) {
                    err.retryable = false; // daily quota, not a burst limit
                    err.dailyQuota = true;
                    err.message = `Today's free requests on ${provider.name} are used up. Try again after the daily reset, or add another free key in AI Settings.`;
                } else if (response.status === 401) {
                    err.message = `The ${provider.name} key was rejected. Open AI Settings and paste a fresh key.`;
                }
                throw err;
            }

            const result = await response.json();
            aiLog(`200 in=${result.usage?.prompt_tokens ?? '?'} out=${result.usage?.completion_tokens ?? '?'}`);
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
            if (isNetworkError) error.network = true;
            const shouldRetry = isNetworkError || error.retryable === true;
            aiLog(`failed attempt ${retries + 1}: ${String(error.message).slice(0, 160)}`);
            // With another provider waiting, fail over now: retrying a timed-out,
            // erroring or rate-limited provider just makes the players wait.
            if (shouldRetry && hasNext) throw error;
            if (shouldRetry && retries < MAX_RETRIES) {
                // A per-minute 429 needs the window to roll over: honour
                // Retry-After, else wait 20 s (quick retries all failed).
                const wait = error.httpStatus === 429
                    ? Math.min(Math.max(error.retryAfterMs || 20000, 5000), 60000)
                    : RETRY_DELAY_MS * (retries + 1);
                const why = error.httpStatus === 429 ? 'The storyteller is busy' : 'Connection hiccup';
                announceAIStatus(`${why}. Trying again in ${Math.round(wait / 1000)} s (attempt ${retries + 2} of ${MAX_RETRIES + 1})...`);
                await new Promise(resolve => setTimeout(resolve, wait));
                return this.executeRequest(requestData, provider, apiKey, retries + 1, hasNext);
            }
            if (shouldRetry) {
                const e = new Error(`The storyteller didn't respond after ${MAX_RETRIES + 1} tries (${error.message}). Your choices are still there; try again in a moment.`);
                e.httpStatus = error.httpStatus ?? 0;
                e.exhausted = true;
                throw e;
            }
            throw error;
        }
    }
}

/** Merge system messages into the first user message (for models with no system role). */
function foldSystemIntoUser(msgs) {
    const sys = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const rest = msgs.filter(m => m.role !== 'system');
    if (!sys) return rest;
    const i = rest.findIndex(m => m.role === 'user');
    if (i === -1) return [{ role: 'user', content: sys }, ...rest];
    return rest.map((m, j) => j === i ? { ...m, content: `${sys}\n\n${m.content}` } : m);
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
        const body = stripped.slice(first, last + 1);
        try { return JSON.parse(body); } catch (e) {
            // Trailing commas are the usual slip (live: "Expected double-quoted
            // property name" cost a whole extra turn call). Repair, don't re-ask.
            try { return JSON.parse(body.replace(/,(\s*[}\]])/g, '$1')); } catch (_) { /* fall through */ }
            throw new Error(`Could not parse JSON from model output: ${e.message}`);
        }
    }
    throw new Error('Model output contained no JSON object');
}
