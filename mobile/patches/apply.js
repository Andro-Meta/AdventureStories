#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * apply.js — re-applies in-tree patches to node_modules after `npm install`.
 *
 * Currently patches:
 *   @capgo/capacitor-llm/android/.../LLM.java
 *     · Skips re-extracting bundled .task assets when already in cacheDir
 *       at the correct size.
 *     · Streams with a 256 KB buffer instead of 1 KB.
 *
 * Run automatically via the "postinstall" hook in mobile/package.json, or
 * manually with `npm run patches:apply` from the mobile/ folder.
 */
const fs = require('fs');
const path = require('path');

const PATCHES = [
    {
        label: '@capgo/capacitor-llm — LLM.java (fast bundled-asset extraction)',
        from: path.join(__dirname, '@capgo+capacitor-llm+LLM.java'),
        to:   path.join(
            __dirname, '..',
            'node_modules', '@capgo', 'capacitor-llm',
            'android', 'src', 'main', 'java', 'ee', 'forgr', 'capgo_llm',
            'LLM.java'
        ),
        marker: 'Patched (Adventure Stories)'
    }
];

let appliedCount = 0;
let alreadyCount = 0;
let skippedCount = 0;

for (const p of PATCHES) {
    if (!fs.existsSync(p.to)) {
        console.log(`[patches] SKIP  ${p.label} — target not present (${p.to}). Run \`npm install\` first.`);
        skippedCount++;
        continue;
    }
    if (!fs.existsSync(p.from)) {
        console.log(`[patches] WARN  ${p.label} — patch source missing (${p.from})`);
        skippedCount++;
        continue;
    }
    const current = fs.readFileSync(p.to, 'utf8');
    if (current.includes(p.marker)) {
        console.log(`[patches] OK    ${p.label} — already applied.`);
        alreadyCount++;
        continue;
    }
    fs.copyFileSync(p.from, p.to);
    console.log(`[patches] APPLY ${p.label}`);
    appliedCount++;
}

console.log(`[patches] done — applied ${appliedCount}, already ${alreadyCount}, skipped ${skippedCount}.`);
