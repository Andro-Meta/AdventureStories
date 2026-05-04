// run_audits.mjs — single entry point for all offline audits.
// Run all four suites in sequence; exit 1 if any fail.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Loader-using suites (need preload.mjs to strip ?cb= from imports).
const LOADER_SUITES = ['audit', 'engine_audit', 'godmode_audit', 'llm_contract'];
// Pure static-analysis suites (read source as text — no module loading).
const PLAIN_SUITES  = ['ui_audit'];

let failed = 0;
async function run(suite, useLoader) {
  console.log(`\n\x1b[1m┌─── ${suite} ───\x1b[0m`);
  const args = useLoader
    ? ['--experimental-loader', resolve(__dirname, 'preload.mjs'), resolve(__dirname, `${suite}.mjs`)]
    : [resolve(__dirname, `${suite}.mjs`)];
  const code = await new Promise((res) => {
    const p = spawn(process.execPath, args, { stdio: 'inherit' });
    p.on('exit', res);
  });
  if (code !== 0) failed++;
}
for (const suite of LOADER_SUITES) await run(suite, true);
for (const suite of PLAIN_SUITES)  await run(suite, false);
console.log(`\n${failed === 0 ? '\x1b[32m✓ ALL AUDITS PASSED\x1b[0m' : `\x1b[31m✗ ${failed} AUDIT(S) FAILED\x1b[0m`}`);
process.exit(failed === 0 ? 0 : 1);
