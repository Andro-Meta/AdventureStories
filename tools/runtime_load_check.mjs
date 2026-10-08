// runtime_load_check.mjs — actually IMPORT main.js end-to-end with the
// DOM polyfill so we surface module-load errors before they hit the
// WebView. Mimics what the browser does when index.html sources main.js.

import './dom_polyfill.mjs';
// main.js calls the global addEventListener (window = globalThis in a page).
globalThis.addEventListener ||= () => {};
globalThis.removeEventListener ||= () => {};

const errors = [];
process.on('unhandledRejection', (r, p) => {
  errors.push({ kind: 'unhandledRejection', err: r?.message || String(r), stack: r?.stack });
});
process.on('uncaughtException', (e) => {
  errors.push({ kind: 'uncaughtException', err: e?.message, stack: e?.stack });
});

const ok = [];
const fail = [];

// Load every module the WebView would, in import order from index.html → main.js.
// Every shipped module in the folder (a hand-kept list went stale when dead
// modules were deleted), main.js last as the page loads it.
import fsMod from 'node:fs';
const SKIP = new Set(['main.js', 'sw.js', 'mobile-bootstrap.js', 'playwright.config.js']);
const modules = fsMod.readdirSync(new URL('..', import.meta.url)).filter(f => f.endsWith('.js') && !SKIP.has(f)).map(f => `../${f}`).concat('../main.js');

for (const m of modules) {
  try {
    // main.js boots the whole game at import (DOMContentLoaded path); in Node
    // that waits on page work forever. A module that evaluated without
    // throwing within 8 s counts as loaded.
    await Promise.race([import(m), new Promise(r => setTimeout(r, 8000))]);
    ok.push(m);
  } catch (e) {
    fail.push({ m, err: e?.message, stack: (e?.stack || '').split('\n').slice(0, 5).join('\n') });
  }
}

console.log(`\n=== RUNTIME LOAD CHECK ===`);
console.log(`OK: ${ok.length} / ${modules.length}`);
if (fail.length === 0 && errors.length === 0) {
  console.log('\x1b[32m✓ Every module loaded cleanly.\x1b[0m');
  process.exit(0);
} else {
  console.log(`\x1b[31m✗ ${fail.length} failed import(s) + ${errors.length} runtime error(s):\x1b[0m`);
  for (const f of fail) {
    console.log(`\n  --- ${f.m} ---`);
    console.log(`  err: ${f.err}`);
    console.log(`  ${f.stack.replace(/\n/g, '\n  ')}`);
  }
  for (const e of errors) {
    console.log(`\n  --- ${e.kind} ---`);
    console.log(`  ${e.err}`);
    console.log(`  ${(e.stack || '').replace(/\n/g, '\n  ')}`);
  }
  process.exit(1);
}
