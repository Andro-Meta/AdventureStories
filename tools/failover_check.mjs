// failover_check.mjs - the storyteller chain with fake providers (no network):
// Auto starts on Gemma 4 (Google), moves to free OpenRouter mid-request when
// Google is out of quota / rate-limited / down, remembers that, and never
// sends a paid OpenRouter model.
import './dom_polyfill.mjs';
const C = await import('../config.js');
const { localAI, assertFreeOnly, nextDailyReset } = await import('../localAI.js');

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failed++; };

localStorage.setItem('adv.cloudProvider', 'auto');
localStorage.setItem('adv.apiKey.generativelanguage.googleapis.com', 'g-key');
localStorage.setItem('adv.apiKey.generativelanguage.googleapis.com#2', 'g2-key');
localStorage.setItem('adv.apiKey.openrouter.ai', 'or-key');
C.AI_REQUEST_CONFIG.RETRY_DELAY_MS = 1;

const calls = [];
let googleReply = () => ({ status: 200, body: { choices: [{ message: { content: '{"ok":"google"}' } }] } });
globalThis.fetch = async (url, opts) => {
  const req = JSON.parse(opts.body);
  const host = new URL(url).hostname;
  calls.push({ host, req, auth: opts.headers.Authorization });
  const r = host.includes('google') ? googleReply(req) : { status: 200, body: { choices: [{ message: { content: '{"ok":"openrouter"}' } }] } };
  return { ok: r.status === 200, status: r.status, statusText: String(r.status), headers: { get: () => null },
    text: async () => JSON.stringify(r.body), json: async () => r.body };
};
const ask = () => localAI.makeRequest([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hi' }], { jsonObject: true });

check(C.CLOUD_PROVIDERS[C.DEFAULT_CLOUD_PROVIDER].chain?.[0] === 'gemma_google', 'default is Auto, starting with Gemma 4 on Google');
let out = await ask();
check(out.includes('google') && calls[0].host.includes('google') && calls[0].req.model === 'gemma-4-31b-it', 'first request goes to Gemma 4 31B on Google');
check(calls[0].auth === 'Bearer g-key', 'Google request carries the Google key');
check(!calls[0].req.messages.some(m => m.role === 'system') && calls[0].req.messages[0].content.startsWith('SYS'), 'Gemma gets the system prompt folded into the user turn');

// Google out of daily quota -> same request answered by OpenRouter.
calls.length = 0;
googleReply = () => ({ status: 429, body: { error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: GenerateRequestsPerDayPerProjectPerModel' } } });
out = await ask();
check(calls.length === 3 && calls[1].auth === 'Bearer g2-key' && calls[2].host.includes('openrouter') && out.includes('openrouter'),
  'both Google keys out of quota: second Google key tried, then the same request is answered by OpenRouter');
check(calls[2].auth === 'Bearer or-key' && calls[2].req.model === 'nvidia/nemotron-3-super-120b-a12b:free' && !calls[2].req.models,
  'OpenRouter step is Nemotron 3 Super :free only, no other models');
calls.length = 0;
out = await ask();
check(calls.length === 1 && calls[0].host.includes('openrouter'), 'Google keys stay benched until the daily reset (no wasted calls)');
const models = new Set(C.providerChain().map(p => p.model));
check(models.size === 2 && models.has('gemma-4-31b-it') && models.has('nvidia/nemotron-3-super-120b-a12b:free'), `Auto uses exactly two models (${[...models].join(', ')})`);

// Paid models are refused before any request.
let refused = false;
try { assertFreeOnly({ model: 'nvidia/nemotron-3-super-120b-a12b', models: [] }, C.CLOUD_PROVIDERS.openrouter_free); } catch { refused = true; }
check(refused, 'a paid OpenRouter model is refused (balance never spent)');

// Google resets at midnight Pacific; OpenRouter at midnight UTC.
const t = Date.UTC(2026, 9, 8, 6, 0); // 06:00 UTC = 23:00 PDT on Oct 7
check(nextDailyReset(C.CLOUD_PROVIDERS.gemma_google, t) === Date.UTC(2026, 9, 8, 7, 0), 'Google quota resets at the next Pacific midnight');
check(nextDailyReset(C.CLOUD_PROVIDERS.openrouter_free, t) === Date.UTC(2026, 9, 9, 0, 0), 'OpenRouter quota resets at the next UTC midnight');

console.log(failed ? `✗ ${failed} FAILOVER CHECK(S) FAILED` : '✓ failover checks pass');
process.exit(failed ? 1 : 0);
