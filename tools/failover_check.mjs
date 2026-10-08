// failover_check.mjs - the storyteller chain with fake providers (no network):
// Auto starts on Gemma 4 (Google), moves to free OpenRouter mid-request when
// Google is out of quota / rate-limited / down, remembers that, and never
// sends a paid OpenRouter model.
import './dom_polyfill.mjs';
const C = await import('../config.js');
const { localAI, assertFreeOnly, nextDailyReset, parseJSONFromModelOutput, benchKey, classifyFailure } = await import('../localAI.js');
const Router = await import('../aiRouter.js');
Router.reset();

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };

localStorage.setItem('adv.cloudProvider', 'auto');
localStorage.setItem('adv.apiKey.generativelanguage.googleapis.com', 'g-key');
localStorage.setItem('adv.apiKey.generativelanguage.googleapis.com#2', 'g2-key');
localStorage.setItem('adv.apiKey.openrouter.ai', 'or-key');
localStorage.setItem('adv.apiKey.api.groq.com', 'groq-key');
C.AI_REQUEST_CONFIG.RETRY_DELAY_MS = 1;

const calls = [];
let googleReply = () => ({ status: 200, body: { choices: [{ message: { content: '{"ok":"google"}' } }] } });
let groqReply = () => ({ status: 429, body: { error: { message: 'Rate limit reached for requests per day (RPD): limit 1000' } } }); // out for the older checks
globalThis.fetch = async (url, opts) => {
  const req = JSON.parse(opts.body);
  const host = new URL(url).hostname;
  calls.push({ host, req, auth: opts.headers.Authorization });
  const r = host.includes('google') ? googleReply(req) : host.includes('groq') ? groqReply(req) : { status: 200, body: { choices: [{ message: { content: '{"ok":"openrouter"}' } }] } };
  return { ok: r.status === 200, status: r.status, statusText: String(r.status), headers: { get: () => null },
    text: async () => JSON.stringify(r.body), json: async () => r.body };
};
const ask = () => localAI.makeRequest([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }], { jsonObject: true });

check(C.CLOUD_PROVIDERS[C.DEFAULT_CLOUD_PROVIDER].chain?.[0] === 'flashlite_google', 'default is Auto, starting with Gemini Flash-Lite on Google');
let out = await ask();
check(out.includes('google') && calls[0].host.includes('google') && calls[0].req.model === 'gemini-flash-lite-latest', 'first request goes to Gemini Flash-Lite on Google');
check(calls[0].auth === 'Bearer g-key', 'Google request carries the Google key');
check(calls[0].req.messages[0].role === 'system', 'Flash-Lite keeps the system role (folding is Gemma-only)');

// Google out of daily quota -> same request answered by OpenRouter.
calls.length = 0;
googleReply = () => ({ status: 429, body: { error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: GenerateRequestsPerDayPerProjectPerModel' } } });
out = await ask();
check(calls.length === 4 && calls[1].auth === 'Bearer g2-key' && calls[2].host.includes('groq') && calls[3].host.includes('openrouter') && out.includes('openrouter'),
  'both Google keys and Groq out of quota: second Google key, then Groq, then the same request is answered by OpenRouter');
check(calls[3].auth === 'Bearer or-key' && calls[3].req.model === 'nvidia/nemotron-3-super-120b-a12b:free' && !calls[3].req.models,
  'OpenRouter step is Nemotron 3 Super :free only, no other models');
calls.length = 0;
out = await ask();
check(calls.length === 1 && calls[0].host.includes('openrouter'), 'Google keys stay benched until the daily reset (no wasted calls)');
const models = new Set(C.providerChain().map(p => p.model));
check(models.size === 3 && models.has('gemini-flash-lite-latest') && models.has('qwen/qwen3.8-27b') && models.has('nvidia/nemotron-3-super-120b-a12b:free'), `Auto uses exactly three free models (${[...models].join(', ')})`);

// Live phone case: Gemma returned 500 'Internal error'. No retries on Google,
// straight to the next provider (was 3 attempts + waits on each).
{
  Router.reset(); const fresh = localAI;
  calls.length = 0;
  googleReply = () => ({ status: 500, body: { error: { message: 'Internal error encountered.' } } });
  const o = await fresh.makeRequest([{ role: 'user', content: 'hi' }]);
  const googleCalls = calls.filter(c => c.host.includes('google')).length;
  check(o.includes('openrouter') && googleCalls === 2, `Google 500s: each Google key tried once (${googleCalls}), then OpenRouter answers`);
}

// Live: a trailing comma made a whole turn call get re-asked.
{ let o = null; try { o = parseJSONFromModelOutput('Here: {"narration":"x","choices":[{"type":"Good","text":"y"},],}'); } catch {}
  check(o?.choices?.length === 1, 'the game parser repairs trailing commas instead of re-asking'); }

// Paid models are refused before any request.
let refused = false;
try { assertFreeOnly({ model: 'nvidia/nemotron-3-super-120b-a12b', models: [] }, C.CLOUD_PROVIDERS.openrouter_free); } catch { refused = true; }
check(refused, 'a paid OpenRouter model is refused (balance never spent)');

// Google resets at midnight Pacific; OpenRouter at midnight UTC.
const t = Date.UTC(2026, 9, 8, 6, 0); // 06:00 UTC = 23:00 PDT on Oct 7
check(nextDailyReset(C.CLOUD_PROVIDERS.gemma_google, t) === Date.UTC(2026, 9, 8, 7, 0), 'Google quota resets at the next Pacific midnight');
check(nextDailyReset(C.CLOUD_PROVIDERS.openrouter_free, t) === Date.UTC(2026, 9, 9, 0, 0), 'OpenRouter quota resets at the next UTC midnight');

// A rejected / stale Google key (401) fails over instead of ending the turn.
{
  Router.reset(); const fresh = localAI;
  calls.length = 0;
  googleReply = () => ({ status: 401, body: { error: { message: 'API key not valid' } } });
  let o = null; try { o = await fresh.makeRequest([{ role: 'user', content: 'hi' }]); } catch (e) { o = 'THREW ' + e.message.slice(0, 60); }
  check(String(o).includes('openrouter'), `Google key rejected (401): the next provider answers (${String(o).slice(0, 40)})`);
}

// Headers arrive, the body never does: the timeout must still fire and fail over.
{
  Router.reset(); const fresh = localAI;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const host = new URL(url).hostname;
    if (!host.includes('google')) return realFetch(url, opts);
    return { ok: true, status: 200, statusText: '200', headers: { get: () => null },
      json: () => new Promise((_, rej) => opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); })),
      text: async () => '' };
  };
  const t0 = Date.now();
  let o = null; try { o = await Promise.race([fresh.makeRequest([{ role: 'user', content: 'hi' }]), new Promise(r => setTimeout(() => r('HUNG'), 45000))]); } catch (e) { o = 'THREW ' + e.message.slice(0, 60); }
  globalThis.fetch = realFetch;
  check(String(o).includes('openrouter'), `Google body never arrives: failed over in ${((Date.now() - t0) / 1000).toFixed(0)} s (${String(o).slice(0, 30)})`);
}

// Groq between Google and OpenRouter, with Qwen's thinking switched off.
{
  Router.reset(); const fresh = localAI;
  calls.length = 0;
  googleReply = () => ({ status: 503, body: { error: { message: 'This model is currently experiencing high demand.' } } });
  groqReply = () => ({ status: 200, body: { choices: [{ message: { content: '{"ok":"groq"}' } }] } });
  const o = await fresh.makeRequest([{ role: 'user', content: 'hi' }]);
  const g = calls.find(c => c.host.includes('groq'));
  check(String(o).includes('groq') && g?.auth === 'Bearer groq-key' && g?.req.model === 'qwen/qwen3.8-27b' && g?.req.reasoning_effort === 'none' && !calls.some(c => c.host.includes('openrouter')),
    `Gemini overloaded: Groq answers (Qwen 3.8 27B, reasoning_effort ${g?.req.reasoning_effort}) before OpenRouter is touched`);
}

// --- Smart switcher (aiRouter) ---
const G1 = benchKey(C.CLOUD_PROVIDERS.flashlite_google), GQ = benchKey(C.CLOUD_PROVIDERS.groq_qwen), GQ2 = benchKey(C.CLOUD_PROVIDERS.groq_qwen_2), OR = benchKey(C.CLOUD_PROVIDERS.nemotron_openrouter);
const ok = (who) => () => ({ status: 200, body: { choices: [{ message: { content: `{"ok":"${who}"}` } }] } });

// Second Groq account: first Groq key out for the day -> the second one answers.
{
  Router.reset(); calls.length = 0;
  localStorage.setItem('adv.apiKey.api.groq.com#2', 'groq2-key');
  googleReply = () => ({ status: 503, body: { error: { message: 'high demand' } } });
  let n = 0; groqReply = () => (n++ === 0 ? { status: 429, body: { error: { message: 'Rate limit reached for requests per day (RPD)' } } } : ok('groq2')());
  const o = await ask();
  const g = calls.filter(c => c.host.includes('groq'));
  check(String(o).includes('groq2') && g[1]?.auth === 'Bearer groq2-key' && !calls.some(c => c.host.includes('openrouter')),
    `first Groq key out: second Groq account answers (${g.map(c => c.auth.slice(7)).join(' -> ')})`);
}

// Sticky: once Groq is the one answering, the next turn starts there instead
// of re-trying the whole chain from the top.
{
  Router.reset(); calls.length = 0;
  googleReply = ok('google'); groqReply = ok('groq');
  Router.record(GQ, { ok: true, ms: 800 });
  const o = await ask();
  check(calls[0]?.host.includes('groq') && calls.length === 1 && String(o).includes('groq'), `sticky: the provider that last answered goes first (first call: ${calls[0]?.host})`);
}

// Remembered across app restarts (localStorage), including daily benches.
{
  Router.reset();
  Router.record(G1, { ok: false, ms: 50, benchUntil: Date.now() + 3600e3 });
  const saved = JSON.parse(localStorage.getItem('adv.aiHealth') || '{}');
  check(saved.health?.[G1]?.benchedUntil > Date.now(), 'a benched provider is saved, so a restart doesn\'t re-try it');
}

// Hedging: Gemini stalls; Groq gets the same request after a few seconds and
// its answer is used, without waiting out the 10 s timeout.
{
  Router.reset(); calls.length = 0;
  localStorage.removeItem('adv.apiKey.generativelanguage.googleapis.com#2');
  for (let i = 0; i < 3; i++) Router.record(G1, { ok: true, ms: 1500 }); // Gemini usually answers in 1.5 s
  groqReply = ok('groq');
  const realFetch = globalThis.fetch;
  let googleAborted = false;
  globalThis.fetch = async (url, opts) => {
    if (!new URL(url).hostname.includes('google')) return realFetch(url, opts);
    calls.push({ host: 'google-stall' });
    return new Promise((_, rej) => opts.signal.addEventListener('abort', () => { googleAborted = true; const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }));
  };
  const t0 = Date.now();
  const o = await ask();
  const secs = (Date.now() - t0) / 1000;
  await new Promise(r => setTimeout(r, 20));
  globalThis.fetch = realFetch;
  check(String(o).includes('groq') && secs < 5 && googleAborted, `hedge: Gemini stalls, Groq answers in ${secs.toFixed(1)} s (old: 10 s timeout first) and the stalled call is cancelled (${googleAborted})`);
  localStorage.setItem('adv.apiKey.generativelanguage.googleapis.com#2', 'g2-key');
}

// Learned speed, limits and coming back to the favourite (ranking only).
{
  const chain = [G1, GQ, GQ2, OR];
  Router.reset();
  for (let i = 0; i < 3; i++) Router.record(GQ, { ok: true, ms: 900 });
  for (let i = 0; i < 3; i++) Router.record(G1, { ok: true, ms: 7000 }); // Gemini is active but slow today
  check(Router.rank(chain)[0] === GQ, `learned speed: a proven backup 2x faster takes over (${Router.rank(chain)[0]})`);

  Router.reset();
  Router.record(GQ, { ok: true, ms: 900 });
  Router.noteHeaders(GQ, { get: (h) => h === 'x-ratelimit-remaining-requests' ? '3' : null });
  const r = Router.rank(chain);
  check(r.indexOf(GQ) > r.indexOf(GQ2), `nearly out (3 requests left): Groq moves behind the second Groq key before it runs dry (${r.join(' > ')})`);

  Router.reset();
  const t = Date.now();
  Router.record(GQ, { ok: true, ms: 900, now: t });
  check(Router.rank(chain, t + 60e3)[0] === GQ, 'one minute later it stays on Groq (sticky)');
  check(Router.rank(chain, t + 11 * 60e3)[0] === G1, 'ten minutes later the favourite (Gemini) gets another try');
  check(Router.rank(chain, t + 12 * 60e3)[0] === GQ, 'and not again right after (one probe per 10 minutes)');
}

// Every documented error code means something specific (Google AI Studio
// "API errors", Groq "Rate limits", OpenRouter "Errors" pages).
{
  const hdr = (o) => ({ get: (n) => o[n] ?? null });
  const now = Date.UTC(2026, 9, 8, 18, 0);
  const G = C.CLOUD_PROVIDERS.flashlite_google, Q = C.CLOUD_PROVIDERS.groq_qwen;
  const cases = [
    [429, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"quota_exceeded: daily"}}', {}, G, 'used_up', nextDailyReset(G, now)],
    [429, '{"error":{"message":"rate_limit_exceeded"}}', { 'retry-after': '30' }, G, 'rate', now + 30e3],
    [429, '{"error":{"message":"Rate limit reached"}}', { 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '2h5m' }, Q, 'used_up', now + 2 * 3600e3 + 5 * 60e3],
    [429, '{"error":{"message":"Rate limit reached for tokens per minute"}}', { 'x-ratelimit-remaining-requests': '812', 'x-ratelimit-reset-tokens': '7.66s' }, Q, 'rate', now + 7660],
    [402, '{"error":{"code":402,"message":"Insufficient credits"}}', {}, C.CLOUD_PROVIDERS.nemotron_openrouter, 'used_up', null],
    [503, '{"error":{"message":"The model is overloaded"}}', {}, G, 'busy', now + 120e3],
    [500, '{"error":{"message":"Internal error"}}', {}, G, 'server', now + 60e3],
    [504, '', {}, G, 'timeout', now + 60e3],
    [401, '{"error":{"message":"Invalid API Key"}}', {}, Q, 'bad_key', now + 24 * 3600e3],
    [400, '[{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}]', {}, G, 'bad_key', null],
    [403, '{"error":{"message":"Flagged by moderation"}}', {}, C.CLOUD_PROVIDERS.nemotron_openrouter, 'refused', null],
    [404, '{"error":{"message":"model_not_found"}}', {}, Q, 'model_gone', now + 3600e3],
    [413, '', {}, Q, 'too_big', 0],
  ];
  const wrong = cases.filter(([st, body, h, p, kind, until]) => { const f = classifyFailure(st, body, hdr(h), p, now); return f.kind !== kind || (until != null && f.until !== until); })
    .map(([st, body, , , kind]) => `${st}->${classifyFailure(st, body, hdr({}), null, now).kind} (want ${kind})`);
  check(!wrong.length, `error codes understood: 402/429-daily = used up, 429-minute = wait, 503 busy, 5xx, 401/bad key, 403, 404, 413 (${cases.length} cases${wrong.length ? '; wrong: ' + wrong.join(', ') : ''})`);
}

// Groq says "0 requests left today" on a GOOD reply: that key rests until its
// reset, so the next turn doesn't waste a failed call finding out.
{
  Router.reset(); calls.length = 0;
  googleReply = () => ({ status: 503, body: { error: { message: 'overloaded' } } });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const r = await realFetch(url, opts);
    if (!new URL(url).hostname.includes('groq')) return r;
    return { ...r, headers: { get: (n) => ({ 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '3h' })[n] ?? null } };
  };
  groqReply = ok('groq');
  await ask();
  globalThis.fetch = realFetch;
  const snap = Router.snapshot([GQ])[0];
  check(snap.restingUntil > Date.now() + 2.9 * 3600e3 && /used up/.test(snap.why), `Groq key at 0 left today: rests ~3 h (${snap.why}) before any failed call`);
  calls.length = 0;
  await ask();
  check(!calls.some(c => c.auth === 'Bearer groq-key'), 'next turn skips the used-up Groq key');
  localAI.setApiKey('groq-key', 'groq_qwen');
  check(!Router.isBenched(GQ), 'saving a new key for it clears the rest');
}

console.log(failed ? `✗ ${failed} FAILOVER CHECK(S) FAILED` : '✓ failover checks pass');
process.exit(failed ? 1 : 0);
