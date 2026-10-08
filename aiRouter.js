// aiRouter.js - picks which free AI answers, and learns as it goes.
//
//  - Sticky: stays on the provider that is working (no restart from the top
//    of the chain every turn).
//  - Learns speed: an exponentially weighted average reply time per provider;
//    a backup that is consistently much faster takes over.
//  - Sees limits coming: Groq/OpenRouter "requests remaining" headers move it
//    off a key before it runs dry; daily-quota benches last until the reset.
//  - Hedging (Dean & Barroso, "The Tail at Scale"): localAI fires the same
//    request at the next provider when the current one is slower than usual
//    (hedgeDelay) and takes the first good answer.
//  - Comes back to the favourite: every PROBE_MS the preferred provider gets
//    another chance; hedging makes a slow probe cost a few seconds at most.
//  - Remembers across app restarts (localStorage).
// Pure state + ranking; localAI does the requests.

const STORE = 'adv.aiHealth';
const PROBE_MS = 10 * 60 * 1000;       // retry the favourite this often
const SLOW_FACTOR = 2;                 // a backup this many times faster takes over
const LOW_REMAINING = 15;              // requests left in the window: move on early
const ALPHA = 0.3;                     // weight of the newest latency sample

let state = { health: {}, active: null, activeSince: 0, preferredTriedAt: 0 };
let loaded = false;

function load() {
    if (loaded) return;
    loaded = true;
    try { const s = JSON.parse(globalThis.localStorage?.getItem(STORE) || 'null'); if (s && typeof s === 'object') state = { ...state, ...s }; } catch (_) {}
}
function save() {
    try { globalThis.localStorage?.setItem(STORE, JSON.stringify(state)); } catch (_) {}
}
const h = (id) => (state.health[id] ||= { ewma: null, n: 0, ok: 0, fail: 0, consecFail: 0, benchedUntil: 0, remaining: null, day: '', today: 0, hedgeWins: 0 });
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

/** "2m59.56s", "7.66s", "1h2m", "120ms" (Groq reset headers) -> ms; 0 if unreadable. */
export function parseDuration(s) {
    let ms = 0;
    for (const [, n, u] of String(s || '').matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) ms += Number(n) * { ms: 1, s: 1e3, m: 60e3, h: 3600e3 }[u];
    return Math.round(ms);
}

/** Forget everything (tests; or a fresh start from AI Settings). */
export function reset() { state = { health: {}, active: null, activeSince: 0, preferredTriedAt: 0 }; loaded = true; save(); }

export function isBenched(id, now = Date.now()) { load(); return (h(id).benchedUntil || 0) > now; }

/** A finished request. kind: 'ok' | 'fail'; ms = time to the answer (or to the failure). */
export function record(id, { ok, ms, benchUntil = 0, why = '', now = Date.now() }) {
    load();
    const x = h(id);
    if (x.day !== dayOf(now)) { x.day = dayOf(now); x.today = 0; }
    x.today++;
    if (ok) {
        x.ok++; x.consecFail = 0; x.n++;
        if (Number.isFinite(ms)) x.ewma = x.ewma == null ? ms : Math.round(ALPHA * ms + (1 - ALPHA) * x.ewma);
        if (!(x.remaining <= 0)) { x.benchedUntil = 0; x.why = ''; } // a reply that said "0 left today" keeps its rest
        if (state.active !== id) { state.active = id; state.activeSince = now; }
    } else {
        x.fail++; x.consecFail++;
        if (benchUntil) x.benchedUntil = benchUntil;
        if (why) x.why = why;
    }
    save();
}

/** A hedged request: the loser was slower than `ms` (no failure, but its speed counts). */
export function recordSlow(id, ms) {
    load();
    const x = h(id);
    x.ewma = x.ewma == null ? ms : Math.round(ALPHA * ms + (1 - ALPHA) * x.ewma);
    save();
}

/**
 * Rate-limit headers from any reply. Groq: x-ratelimit-remaining-requests is
 * requests left TODAY, x-ratelimit-reset-requests when the day resets ("2m59.56s").
 * At 0 the key is used up: rest it until then without spending a failed call.
 */
export function noteHeaders(id, headers, now = Date.now()) {
    const raw = headers?.get?.('x-ratelimit-remaining-requests');
    if (raw == null || !Number.isFinite(Number(raw))) return;
    load();
    const x = h(id);
    x.remaining = Number(raw);
    if (x.remaining <= 0) {
        x.benchedUntil = now + (parseDuration(headers.get('x-ratelimit-reset-requests')) || 3600e3);
        x.why = "today's free requests used up";
    }
    save();
}

/** A new key was saved for this provider: forget the old key's rests and limits. */
export function clear(id) { load(); delete state.health[id]; if (state.active === id) state.active = null; save(); }

/**
 * Order to try providers in. `ids` is the chain in preference order (the
 * player's/default order). Returns ids, best first.
 */
export function rank(ids, now = Date.now()) {
    load();
    const ready = ids.filter(id => !isBenched(id, now));
    if (!ready.length) return [...ids];                    // all resting: try anyway
    const low = (id) => h(id).remaining != null && h(id).remaining < LOW_REMAINING;
    let order = [...ready].sort((a, b) => (low(a) - low(b)) || (ids.indexOf(a) - ids.indexOf(b)));

    // Sticky: the provider that last answered goes first while it's healthy.
    const active = state.active;
    if (active && order.includes(active) && h(active).consecFail === 0 && !low(active)) {
        order = [active, ...order.filter(id => id !== active)];
        // Learned speed: a ready backup that is much faster (and proven) takes over.
        const a = h(active).ewma;
        const faster = order.slice(1).find(id => h(id).n >= 3 && h(id).consecFail === 0 && !low(id) && a != null && h(id).ewma != null && h(id).ewma * SLOW_FACTOR < a);
        if (faster) order = [faster, ...order.filter(id => id !== faster)];
        // Come back to the favourite now and then (hedged, so a slow probe is cheap).
        const fav = order.find(id => ids.indexOf(id) < ids.indexOf(order[0]));
        if (fav && now - Math.max(state.activeSince, state.preferredTriedAt) > PROBE_MS) {
            state.preferredTriedAt = now; save();
            order = [fav, ...order.filter(id => id !== fav)];
        }
    }
    return order;
}

/** How long to wait on a provider before also asking the next one. */
export function hedgeDelay(id) {
    load();
    const e = h(id).ewma;
    return Math.max(3500, Math.min(8000, e == null ? 6000 : Math.round(e * 2)));
}

export function noteHedgeWin(id) { load(); h(id).hedgeWins++; save(); }

/** For AI Settings: one row per provider. */
export function snapshot(ids, names = {}, now = Date.now()) {
    load();
    return ids.map(id => {
        const x = h(id);
        return {
            id, name: names[id] || id, active: state.active === id,
            restingUntil: x.benchedUntil > now ? x.benchedUntil : 0, why: x.why || '',
            avgMs: x.ewma, today: x.day === dayOf(now) ? x.today : 0, remaining: x.remaining,
            okRate: x.ok + x.fail ? Math.round(100 * x.ok / (x.ok + x.fail)) : null
        };
    });
}
