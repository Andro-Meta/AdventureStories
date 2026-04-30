// sw.js — Service Worker for Adventure Stories.
//
// LESSON LEARNED THE HARD WAY (2026-04-30):
// The previous version of this file pre-cached state.js / setup.js / main.js
// and used CACHE-FIRST for all same-origin GETs. Effect: once the SW
// installed, subsequent runs ALWAYS got the cached JS files even after
// code-bumps (cb=N query strings only worked when the importer was also
// fresh; main.js loads bare without cb because it's the script tag entry
// point). Symptom: users saw "Fantasy Kingdom" headers when they picked
// cyberpunk because state.js's resetGameState fix was never delivered.
//
// THIS VERSION:
//  - NETWORK-FIRST for all .js, .json, .html — always try network first,
//    fall back to cache only if offline.
//  - Cache-first only for genuinely static assets (style.css, icons).
//  - On activate, immediately delete every previous-version cache and claim
//    all clients so a soft refresh picks up the fixed worker.
//  - CACHE_VERSION is bumped by `_bump_cb.mjs` along with cb=N queries so
//    cache + module versions move together.

const CACHE_VERSION = 'adv-cb-014';        // bumped by _bump_cb.mjs
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            // Wipe ANY cache that doesn't match this version. Critical to
            // recover users who got a poisoned cache from the old SW.
            keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Always pass-through AI backend traffic (port 8090, /v1/, /health).
    if (url.port === '8090' || url.pathname.includes('/v1/') || url.pathname === '/health') {
        return;
    }

    // Non-GET or cross-origin → leave alone.
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    const path = url.pathname;
    const isCodeOrData = /\.(js|mjs|json|html)$|\/$/i.test(path);

    if (isCodeOrData) {
        // NETWORK-FIRST: fetch fresh, save a copy to cache, fall back to
        // cache only if offline. This is what we should have done from
        // day one.
        event.respondWith(
            fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request).then(c => c || Response.error()))
        );
        return;
    }

    // Cache-first for the remaining static assets (CSS, icons, fonts).
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
                const clone = response.clone();
                caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
            }
            return response;
        }))
    );
});

// Manual purge — page-side code can postMessage({type:'PURGE_CACHE'}) to
// nuke the cache without a version bump (used by main.js's first-load
// poison-recovery routine).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PURGE_CACHE') {
        event.waitUntil(
            caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        );
    }
});
