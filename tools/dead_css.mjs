// dead_css.mjs - style.css rules that can never match: every class/id they
// need appears nowhere in index.html or the game's JS (as a word, so
// classList.add('x'), `class="x"` in templates and `#x` lookups all count).
//   node tools/dead_css.mjs           report
//   node tools/dead_css.mjs --check   exit 1 if any (npm run audit)
//   node tools/dead_css.mjs --remove  delete those rules (and empty @media)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(ROOT, 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');
const corpus = [fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  ...fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))].join('\n');
const words = new Set(corpus.match(/[A-Za-z_][\w-]*/g) || []);
// Classes built from parts at runtime: `popup-${type}`, `fx-float-${kind}`...
// `${type}-card`, 'tier-' + t, t + '-badge' too.
const prefixes = [...corpus.matchAll(/([A-Za-z_][\w-]*-)\$\{/g), ...corpus.matchAll(/['"]([A-Za-z_][\w-]*-)['"]\s*\+/g)].map(m => m[1]);
const suffixes = [...corpus.matchAll(/\}(-[\w-]+)/g), ...corpus.matchAll(/\+\s*['"](-[\w-]+)['"]/g)].map(m => m[1]);
const known = (name) => words.has(name) || prefixes.some(p => name.startsWith(p)) || suffixes.some(s => name.endsWith(s) && name.length > s.length);

// Tokenise into top-level and nested blocks: [{sel, start, end, children?}]
function blocks(text, from, to) {
  const out = []; let i = from; let selStart = from;
  while (i < to) {
    if (text.startsWith('/*', i)) { i = text.indexOf('*/', i + 2) + 2; if (i < 2) break; continue; }
    const ch = text[i];
    if (ch === '{') {
      let depth = 1, j = i + 1;
      while (j < to && depth) { if (text.startsWith('/*', j)) { j = text.indexOf('*/', j + 2) + 2; continue; } if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const sel = text.slice(selStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const b = { sel, start: selStart, end: j, bodyStart: i + 1, bodyEnd: j - 1 };
      if (/^@(media|supports)/.test(sel)) b.children = blocks(text, i + 1, j - 1);
      out.push(b); i = j; selStart = j; continue;
    }
    if (ch === ';' || ch === '}') selStart = i + 1; // @import / stray
    i++;
  }
  return out;
}

const deadSelector = (s) => {
  const names = [...s.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].map(m => m[1]);
  return names.length > 0 && names.some(n => !known(n)); // needs something that never exists
};
const isDeadRule = (b) => !b.sel.startsWith('@') && b.sel.split(',').every(s => deadSelector(s.trim()));

const dead = [];
const collect = (list) => {
  for (const b of list) {
    if (b.children) { collect(b.children); if (b.children.length && b.children.every(c => isDeadRule(c) || (c.children && false))) dead.push(b); }
    else if (isDeadRule(b)) dead.push(b);
  }
};
const tree = blocks(css, 0, css.length);
collect(tree);
// Don't list children of an @media that goes entirely.
const outer = dead.filter(d => !dead.some(o => o !== d && o.start <= d.start && o.end >= d.end));

console.log(`dead CSS rules (${outer.length}):`);
for (const d of outer) console.log(`  line ${css.slice(0, d.start).split('\n').length}: ${d.sel.replace(/\s+/g, ' ').slice(0, 90)}`);

if (process.argv.includes('--remove') && outer.length) {
  let out = css;
  for (const d of [...outer].sort((a, b) => b.start - a.start)) {
    let s = d.start; while (s > 0 && /[ \t\r\n]/.test(out[s - 1])) s--;
    out = out.slice(0, s) + out.slice(d.end);
  }
  fs.writeFileSync(cssPath, out.replace(/(\r?\n)(?:[ \t]*\r?\n){2,}/g, '$1$1'));
  console.log(`removed ${outer.length} rules`);
}
if (process.argv.includes('--check') && outer.length) process.exit(1);
