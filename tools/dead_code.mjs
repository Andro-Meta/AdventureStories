// dead_code.mjs - find (and optionally remove) code the game never runs.
//
// Parses every game module with acorn and counts references to each
// top-level function, top-level const/let, export and class method. A name is
// used if it appears anywhere outside its own definition: an identifier, a
// property access (obj.name / obj?.name), a destructured import key, a word
// inside a string or template (onclick="window.x.name()"), or index.html.
// Name-based, so it errs on the side of keeping code (any same-named use
// anywhere keeps it).
//
//   node tools/dead_code.mjs            report
//   node tools/dead_code.mjs --check    exit 1 if anything is dead (npm run audit)
//   node tools/dead_code.mjs --remove   delete it, repeat until nothing is left,
//                                       and drop import specifiers left unused
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = ['main.js', 'mobile-bootstrap.js', 'sw.js'];
const NOT_GAME = new Set(['playwright.config.js']); // tooling, not shipped
const REMOVE = process.argv.includes('--remove');
let files = [];
const listFiles = () => (files = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && !NOT_GAME.has(f)));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const parse = (code) => acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, allowHashBang: true });

function walk(node, fn, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, fn, node));
    else if (v && typeof v.type === 'string') walk(v, fn, node);
  }
}

function reachable(asts) {
  const seen = new Set(); const stack = ENTRIES.filter(e => asts[e]);
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    walk(asts[f], (n) => {
      const s = (n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') ? n.source
        : n.type === 'ImportExpression' ? n.source : null;
      const v = s && s.type === 'Literal' && typeof s.value === 'string' ? s.value : null;
      if (v && v.startsWith('./')) { const t = v.slice(2).split('?')[0]; if (asts[t]) stack.push(t); }
    });
  }
  return seen;
}

function analyze() {
  listFiles();
  const asts = {}; const codes = {};
  for (const f of files) { codes[f] = read(f); asts[f] = parse(codes[f]); }
  const live = reachable(asts);

  // Candidates: [{file, name, kind, start, end, idStart}]
  const cands = [];
  for (const f of live) {
    for (const st of asts[f].body) {
      const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      const outer = st;
      if (!decl) continue;
      if (decl.type === 'FunctionDeclaration') cands.push({ file: f, name: decl.id.name, kind: 'function', start: outer.start, end: outer.end, idStart: decl.id.start });
      if (decl.type === 'VariableDeclaration' && decl.declarations.length === 1 && decl.declarations[0].id.type === 'Identifier') {
        const d = decl.declarations[0];
        // Only pure initialisers: dropping one must not drop a side effect.
        const init = d.init;
        const pure = !init || ['Literal', 'ArrayExpression', 'ObjectExpression', 'ArrowFunctionExpression', 'FunctionExpression', 'TemplateLiteral', 'Identifier', 'MemberExpression', 'UnaryExpression', 'BinaryExpression'].includes(init.type);
        if (pure) cands.push({ file: f, name: d.id.name, kind: 'binding', start: outer.start, end: outer.end, idStart: d.id.start });
      }
      if (decl.type === 'ClassDeclaration') {
        for (const m of decl.body.body) {
          if (m.type === 'MethodDefinition' && m.kind === 'method' && !m.computed && m.key.type === 'Identifier') {
            cands.push({ file: f, name: m.key.name, kind: 'method', start: m.start, end: m.end, idStart: m.key.start });
          }
        }
      }
    }
  }

  // References: every identifier / property / string-word occurrence with its position.
  const refs = new Map(); // name -> [{file, pos}]
  const add = (name, file, pos) => { if (!refs.has(name)) refs.set(name, []); refs.get(name).push({ file, pos }); };
  for (const f of live) {
    walk(asts[f], (n, parent) => {
      if (n.type === 'Identifier') add(n.name, f, n.start);
      else if (n.type === 'Literal' && typeof n.value === 'string') for (const w of n.value.match(/[A-Za-z_$][\w$]*/g) || []) add(w, f, n.start);
      else if (n.type === 'TemplateElement') for (const w of (n.value.cooked || '').match(/[A-Za-z_$][\w$]*/g) || []) add(w, f, n.start);
    });
  }
  const htmlWords = new Set(html.match(/[A-Za-z_$][\w$]*/g) || []);

  const dead = cands.filter(c => {
    if (htmlWords.has(c.name)) return false;
    const r = (refs.get(c.name) || []).filter(x => !(x.file === c.file && x.pos >= c.start && x.pos < c.end));
    // Import specifiers of this name only count if the import is itself used:
    // handled by the import cleanup pass, so here an import mention counts.
    return r.length === 0;
  });
  const unreachable = files.filter(f => !live.has(f));
  return { asts, codes, live, dead, unreachable };
}

// Remove import specifiers whose local name is never used in that file.
function cleanImports(f) {
  const code = read(f); const ast = parse(code);
  const used = new Map();
  walk(ast, (n, p) => { if (n.type === 'Identifier' && !(p && (p.type === 'ImportSpecifier' || p.type === 'ImportDefaultSpecifier' || p.type === 'ImportNamespaceSpecifier'))) used.set(n.name, (used.get(n.name) || 0) + 1); });
  const edits = [];
  for (const st of ast.body) {
    if (st.type !== 'ImportDeclaration' || !st.specifiers.length) continue;
    const keep = st.specifiers.filter(s => used.get(s.local.name));
    if (keep.length === st.specifiers.length) continue;
    if (!keep.length) { edits.push([st.start, st.end, '']); continue; }
    const def = keep.find(s => s.type === 'ImportDefaultSpecifier');
    const ns = keep.find(s => s.type === 'ImportNamespaceSpecifier');
    const named = keep.filter(s => s.type === 'ImportSpecifier').map(s => code.slice(s.start, s.end));
    const parts = [def && def.local.name, ns && `* as ${ns.local.name}`, named.length && `{ ${named.join(', ')} }`].filter(Boolean);
    edits.push([st.start, st.end, `import ${parts.join(', ')} from ${code.slice(st.source.start, st.source.end)};`]);
  }
  if (!edits.length) return 0;
  fs.writeFileSync(path.join(ROOT, f), applyEdits(code, edits, f));
  return edits.length;
}

function applyEdits(code, edits, file = '?') {
  // Comments that sit directly above a removed node (only whitespace between)
  // go with it; positions come from the parser, never from a regex.
  const comments = [];
  acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowAwaitOutsideFunction: true, allowHashBang: true, onComment: comments });
  const isBlank = (a, b) => /^\s*$/.test(code.slice(a, b));
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [s, e, rep] of edits) {
    let start = s;
    if (rep === '') {
      for (let i = comments.length - 1; i >= 0; i--) {
        const c = comments[i];
        if (c.end <= start && isBlank(c.end, start)) start = c.start;
        else if (c.end <= start) break;
      }
    }
    // Start of that line (indentation), and the rest of the last line.
    while (start > 0 && /[ \t]/.test(code[start - 1])) start--;
    let end = e;
    const after = code.slice(e).match(/^[ \t]*;?[ \t]*\r?\n/);
    if (rep === '' && after) end = e + after[0].length;
    out = out.slice(0, start) + rep + out.slice(end);
  }
  out = out.replace(/(\r?\n)(?:[ \t]*\r?\n){3,}/g, '$1$1$1');
  // Never write a file that no longer parses.
  try { parse(out); } catch (x) { throw new Error(`dead_code: edit would break ${file} (${x.message}); nothing written`); }
  return out;
}

let round = 0; let removed = 0; let result = analyze();
if (REMOVE) {
  while (result.dead.length && round < 30) {
    round++;
    const byFile = {};
    for (const c of result.dead) (byFile[c.file] ||= []).push([c.start, c.end, '']);
    for (const [f, edits] of Object.entries(byFile)) {
      // Drop nested ranges (a method inside a removed class is already gone).
      const flat = edits.sort((a, b) => a[0] - b[0]).filter((e, i, arr) => !arr.some((o, j) => j !== i && o[0] <= e[0] && o[1] >= e[1] && (o[0] !== e[0] || o[1] !== e[1])));
      fs.writeFileSync(path.join(ROOT, f), applyEdits(read(f), flat, f));
    }
    removed += result.dead.length;
    result.dead.forEach(c => console.log(`  - ${c.file}: ${c.kind} ${c.name}`));
    for (const f of result.live) cleanImports(f);
    result = analyze();
  }
  for (const f of result.unreachable) { fs.unlinkSync(path.join(ROOT, f)); console.log(`  - deleted unreachable ${f}`); }
  console.log(`removed ${removed} definitions in ${round} rounds`);
  result = analyze();
}

console.log(`modules: ${files.length}, reachable ${result.live.size}`);
console.log(`unreachable modules (${result.unreachable.length}): ${result.unreachable.join(', ') || '-'}`);
console.log(`dead definitions (${result.dead.length}):`);
for (const c of result.dead) console.log(`  ${c.file}: ${c.kind} ${c.name}`);
if (process.argv.includes('--check') && (result.unreachable.length || result.dead.length)) process.exit(1);
