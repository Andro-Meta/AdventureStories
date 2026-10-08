// localAI.js — client for the storyteller AI.
// The game only uses free online providers (OpenRouter, Google AI Studio) over
// the OpenAI-compatible /chat/completions API, called straight from the
// browser with the player's own key. Local and on-device models were removed.

import * as Config from './config.js';
import * as Router from './aiRouter.js';

/** Tell the loading overlay what a slow request is doing (ui.js listens). */
function announceAIStatus(message) {
    try { globalThis.dispatchEvent?.(new CustomEvent('adv:ai-status', { detail: message })); } catch (_) { /* no DOM */ }
}

/**
 * What a failed reply means and how long that provider should rest. From the
 * documented codes (read 2026-10-08): Google AI Studio "API errors" page,
 * Groq "Rate limits" headers, OpenRouter "Errors" page.
 *   kind: used_up | rate | busy | server | timeout | bad_key | model_gone | too_big | refused | bad_request
 * Every kind moves the request to the next provider; `until` = rest until (ms).
 */
export function classifyFailure(status, body = '', headers = null, provider = null, now = Date.now()) {
    const h = (n) => headers?.get?.(n) ?? null;
    const retryAfter = (Number(h('retry-after')) || 0) * 1000;
    const groqLeft = h('x-ratelimit-remaining-requests');          // Groq: requests left TODAY
    const dailyReset = () => (groqLeft === '0' && Router.parseDuration(h('x-ratelimit-reset-requests')))
        ? now + Router.parseDuration(h('x-ratelimit-reset-requests'))
        : provider ? nextDailyReset(provider, now) : now + 3600e3;
    const rest = (ms) => now + Math.min(Math.max(ms, 5e3), 15 * 60e3);
    const r = (kind, why, until) => ({ kind, why, until });
    // 402: OpenRouter "insufficient credits" / Google "prepay credits depleted".
    if (status === 402) return r('used_up', 'no free credits left', dailyReset());
    if (status === 429) {
        // Google: quota_exceeded = daily; rate_limit_exceeded / too_many_requests = per minute.
        // Groq: 0 requests left today. OpenRouter: "free-models-per-day".
        if (groqLeft === '0' || /quota_exceeded|per[- ]?day|daily|PerDay|\bRPD\b|free-models-per-day/i.test(body)) return r('used_up', "today's free requests used up", dailyReset());
        return r('rate', 'too many requests this minute', rest(retryAfter || Router.parseDuration(h('x-ratelimit-reset-tokens')) || 60e3));
    }
    // Google answers a bad key with 400 API_KEY_INVALID or 403; others with 401.
    if (status === 401 || ((status === 400 || status === 403) && /api[ _-]?key|API_KEY_INVALID|PERMISSION_DENIED|unauthenticated/i.test(body))) {
        return r('bad_key', 'key rejected: paste a fresh one', now + 24 * 3600e3);
    }
    if (status === 403) return r('refused', 'refused (permissions or moderation)', rest(10 * 60e3));
    if (status === 404) return r('model_gone', 'model not found', now + 3600e3);
    if (status === 413 || (status === 400 && /context|too long|too large|maximum.*tokens/i.test(body))) return r('too_big', 'story too long for this model', 0);
    if (status === 503 || status === 529) return r('busy', 'overloaded', rest(retryAfter || 2 * 60e3));
    if (status === 408 || status === 499 || status === 504) return r('timeout', 'timed out', rest(60e3));
    if (status >= 500) return r('server', `server error ${status}`, rest(60e3));
    if (status === 400) return r('bad_request', 'request refused (400)', 0);
    return r('server', `HTTP ${status}`, rest(60e3));
}
export const benchKey = (p) => p.keySlot || (p.baseUrl + p.model);

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
            Router.clear(benchKey(provider)); // new key: forget the old key's rests and limits
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
     * Ask the providers in aiRouter's order (sticky on the one that's
     * working). If the first is slower than its usual time, the next one gets
     * the same request too and the first good answer wins (the other is
     * cancelled). A quota / rate-limit / outage error rests that provider and
     * the request moves on, mid-turn.
     */
    async makeRequest(messages, options = {}) {
        const chain = Config.providerChain().map(p => ({ p, key: Config.keyForProvider(p), id: benchKey(p) })).filter(x => x.key);
        if (!chain.length) {
            const e = new Error('No AI key saved yet. Open "AI Settings" on the main menu and paste your free key.');
            e.httpStatus = 0; // configuration problem: not worth a retry
            throw e;
        }
        const byId = new Map(chain.map(x => [x.id, x]));
        const order = Router.rank(chain.map(x => x.id)).map(id => byId.get(id));
        const { p, out } = await this.hedgedRace(order, messages, options);
        if (this.activeName !== p.name) {
            if (this.activeName) announceAIStatus(`Storyteller switched to ${p.name}.`);
            this.activeName = p.name;
        }
        return out;
    }

    hedgedRace(order, messages, options) {
        const cancel = new AbortController();
        const started = [];
        let next = 0, running = 0, done = false, lastError;
        return new Promise((resolve, reject) => {
            const finish = (fn) => { done = true; cancel.abort(); fn(); };
            const launch = () => {
                if (done || next >= order.length) return false;
                const i = next++;
                const { p, key, id } = order[i];
                const hasNext = next < order.length;
                const t0 = Date.now();
                const attempt = { id, t0, live: true };
                started.push(attempt);
                running++;
                let successorUp = false;
                const hedge = hasNext && setTimeout(() => {
                    if (done || successorUp) return;
                    successorUp = true;
                    announceAIStatus(`${p.name} is slow; asking a backup too...`);
                    launch();
                }, Router.hedgeDelay(id));
                let req;
                try { req = this.buildRequest(p, messages, options); } catch (e) { req = Promise.reject(e); }
                Promise.resolve(req).then(r => this.executeRequest(r, p, key, 0, hasNext, cancel.signal)).then(out => {
                    clearTimeout(hedge); running--; attempt.live = false;
                    if (done) return;
                    const ms = Date.now() - t0;
                    Router.record(id, { ok: true, ms });
                    // Still-running providers lost the race: they're at least this slow.
                    for (const o of started) if (o.live) Router.recordSlow(o.id, Date.now() - o.t0);
                    if (i > 0 && started[0].live) Router.noteHedgeWin(id);
                    finish(() => resolve({ p, out }));
                }, error => {
                    clearTimeout(hedge); running--; attempt.live = false;
                    if (done) return;
                    lastError = error;
                    const now = Date.now();
                    // Every documented HTTP failure means another provider may work;
                    // a dropped or timed-out connection too.
                    const f = error.failure || (error.network || error.exhausted ? { kind: 'timeout', why: 'no answer (network or timeout)', until: now + 60e3 } : null);
                    const movable = !!f;
                    Router.record(id, { ok: false, ms: now - t0, now, benchUntil: f?.until || 0, why: f?.why });
                    if (movable && !successorUp && next < order.length) {
                        successorUp = true;
                        console.log(`AI: ${p.name} unavailable (${String(error.message).slice(0, 120)}); trying ${order[next].p.name}`);
                        announceAIStatus(`${p.name} is busy; switching storyteller...`);
                        launch();
                    }
                    if (running === 0) finish(() => reject(lastError));
                });
                return true;
            };
            launch();
        });
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
        // Groq's Qwen is a hybrid thinker: "none" turns thinking off (no hidden
        // reasoning tokens, straight to the answer).
        if (provider.baseUrl.includes('api.groq.com') && /qwen/i.test(provider.model)) requestData.reasoning_effort = 'none';
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

    async executeRequest(requestData, provider, apiKey, retries = 0, hasNext = false, signal = null) {
        const { TIMEOUT_MS, MAX_RETRIES, RETRY_DELAY_MS } = Config.AI_REQUEST_CONFIG;
        const started = Date.now();
        const aiLog = (msg) => (globalThis.displayVisualError || console.log)(`AI ${provider.name.split(' — ')[0]} ${provider.model}: ${msg} (${Date.now() - started} ms)`);
        try {
            const controller = new AbortController();
            // The race was won elsewhere: stop this request too.
            if (signal) { if (signal.aborted) controller.abort(); else signal.addEventListener('abort', () => controller.abort(), { once: true }); }
            // A provider with a backup behind it gets less time: a stuck call
            // (live: Gemma hung 45 s, then two 500s) shouldn't hold up the turn.
            // 10 s: phone run 10-08, Gemini p95 8.3 s but 4 of 20 calls stalled
            // to the old 20 s cutoff (turn 1 took 76 s across both keys).
            const timeoutId = setTimeout(() => controller.abort(), hasNext ? Math.min(TIMEOUT_MS, 10000) : TIMEOUT_MS);
            const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
            if (provider.baseUrl.includes('openrouter')) {
                headers['HTTP-Referer'] = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://adventure-stories.local';
                headers['X-Title'] = 'Adventure Stories';
            }
            const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST', headers, body: JSON.stringify(requestData), signal: controller.signal
            });
            // The timer runs until the body is read: free models can send headers
            // early and then sit queued, which hung the turn with no failover.
            Router.noteHeaders(benchKey(provider), response.headers);

            if (!response.ok) {
                let body = '';
                try { body = (await response.text()).slice(0, 500); } catch (_) {}
                clearTimeout(timeoutId);
                // A model that refuses JSON mode: retry once without it.
                if (response.status === 400 && requestData.response_format && /response_format|json|mime/i.test(body)) {
                    const { response_format, ...plain } = requestData;
                    return this.executeRequest(plain, provider, apiKey, retries, hasNext, signal);
                }
                const err = new Error(`HTTP ${response.status}: ${response.statusText}${body ? ' — ' + body : ''}`);
                err.httpStatus = response.status;
                err.failure = classifyFailure(response.status, body, response.headers, provider);
                err.retryable = ['rate', 'busy', 'server', 'timeout'].includes(err.failure.kind);
                err.retryAfterMs = Number(response.headers.get('retry-after')) * 1000 || 0;
                Router.noteHeaders(benchKey(provider), response.headers);
                if (err.failure.kind === 'used_up') {
                    err.dailyQuota = true;
                    err.message = `Today's free requests on ${provider.name} are used up. Try again after the daily reset, or add another free key in AI Settings.`;
                } else if (err.failure.kind === 'bad_key') {
                    err.message = `The ${provider.name} key was rejected. Open AI Settings and paste a fresh key.`;
                }
                throw err;
            }

            const result = await response.json();
            clearTimeout(timeoutId);
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
            if (signal?.aborted) throw error; // cancelled: another provider answered
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
                if (signal?.aborted) throw error;
                return this.executeRequest(requestData, provider, apiKey, retries + 1, hasNext, signal);
            }
            if (shouldRetry) {
                const e = new Error(`The storyteller didn't respond after ${MAX_RETRIES + 1} tries (${error.message}). Your choices are still there; try again in a moment.`);
                e.httpStatus = error.httpStatus ?? 0;
                e.failure = error.failure;
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
