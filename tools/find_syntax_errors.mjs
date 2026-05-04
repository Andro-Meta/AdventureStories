// Parse every .js file as a strict ESM module; report syntax errors.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import vm from 'vm';

const root = process.cwd();
const skipDirs = new Set(['node_modules', '.git', 'mobile', 'test-results', 'tests', '_Previous Runs', 'venv_local_ai', '__pycache__', 'models', 'llama-cpp']);

const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) walk(join(dir, e.name));
    } else if (e.isFile() && e.name.endsWith('.js')) {
      files.push(join(dir, e.name));
    }
  }
}
walk(root);

const fails = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  try {
    // Use vm.SourceTextModule (experimental but checks syntax as ESM).
    new vm.SourceTextModule(src, { identifier: f });
  } catch (e) {
    fails.push({ f: relative(root, f), msg: e.message?.split('\n')[0] });
  }
}

if (fails.length === 0) console.log('OK: every .js parses as ESM (' + files.length + ' files)');
else {
  console.log('FAIL: ' + fails.length + ' files have ESM syntax errors:');
  for (const x of fails) console.log('  ' + x.f + ' -> ' + x.msg);
}
