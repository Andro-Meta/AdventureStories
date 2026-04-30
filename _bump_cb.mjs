// _bump_cb.mjs — bump cache-busting query strings on imports of files we edit
// frequently. Chrome's V8 module cache is keyed by URL; bumping the query
// on the import URL forces a fresh module load. Run with `node _bump_cb.mjs`.
// Files in TARGETS get cache-busted at every importer.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

// Bump this number whenever you want all targets to reload fresh.
const CB = '014';

// AUTO-TARGET every local .js file in this directory. Anything we edit gets
// fresh cache-bust on its importers — no maintenance list to keep in sync.
// Excludes:
//   - underscore-prefixed files (this script, test harnesses)
//   - sw.js: a service worker is identified by its EXACT URL — adding
//     ?cb=N to navigator.serviceWorker.register('./sw.js') would create a
//     new SW instance every bump and never let it claim the old caches.
const NEVER_BUMP = new Set(['sw.js']);
const files = readdirSync('.').filter(f => f.endsWith('.js') && !f.startsWith('_'));
const TARGETS = files.filter(f => !NEVER_BUMP.has(f));

// Phase 4.0a follow-up: bump sw.js's CACHE_VERSION in lockstep. Without
// this the service worker serves stale modules forever — its own cached
// state.js / setup.js / main.js shadow the new versions even after we
// add ?cb=N to imports, because main.js itself is loaded bare from
// <script type="module" src="main.js"> in index.html.
try {
    const swPath = 'sw.js';
    let sw = readFileSync(swPath, 'utf8');
    const before = sw;
    sw = sw.replace(/(const\s+CACHE_VERSION\s*=\s*['"])adv-cb-[0-9]+(['"])/, `$1adv-cb-${CB}$2`);
    if (sw !== before) {
        writeFileSync(swPath, sw);
        console.log(`bumped sw.js CACHE_VERSION → adv-cb-${CB}`);
    }
} catch (e) {
    console.log(`sw.js bump skipped: ${e.message}`);
}

let edits = 0;
for (const file of files) {
    let src = readFileSync(file, 'utf8');
    let modified = false;
    for (const target of TARGETS) {
        // Pattern matches: `./TARGET`, `./TARGET?cb=anything`
        // Capture group 1: the quote char (' or ")
        // Capture group 2: the path up to and including TARGET
        // Replace any existing ?cb=... or append fresh.
        const re = new RegExp(`(['"])(\\./${target.replace('.', '\\.')})(\\?cb=[^'"]*)?\\1`, 'g');
        src = src.replace(re, (m, q, path, existing) => {
            modified = true;
            return `${q}${path}?cb=${CB}${q}`;
        });
    }
    if (modified) {
        writeFileSync(file, src);
        edits++;
        console.log(`bumped ${file}`);
    }
}
console.log(`Done. ${edits} files updated to cb=${CB}`);
