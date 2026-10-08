// play_server.mjs - play the game with the OpenRouter key from this project's
// .env, without typing it into the page. Serves the game on 127.0.0.1 and
// forwards the game's OpenRouter calls itself, adding the key on the way out,
// so the key never reaches the browser, localStorage or a save file.
//
//   node tools/play_server.mjs            -> http://127.0.0.1:8322
//   PLAY_PORT=8330 node tools/play_server.mjs
//   PLAY_DUMP=1 ...                       -> test-results/play_call_NNN.json per call
//
// Prints one line per AI call with tokens, plus running totals since start.
// Local machine only (binds 127.0.0.1): anyone who can reach it spends the key.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PLAY_PORT || 8322);
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const KEY = (env.match(/^OPENROUTER_API_KEY=["']?([^"'\r\n]*)/m) || [])[1]?.trim();
if (!KEY) { console.error('OPENROUTER_API_KEY is empty in .env (run tools/set_key.ps1)'); process.exit(1); }

const LOGDIR = path.join(ROOT, 'test-results');
fs.mkdirSync(LOGDIR, { recursive: true });
const LOG = path.join(LOGDIR, 'play_server.log');

// Same rules as server.py: only game files, never .env/.git/tools/dumps.
const BLOCKED = new Set(['tools', 'test-results', 'tests', 'mobile', 'node_modules', 'models', '__pycache__']);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

// Injected first in <head>: a placeholder key so the game skips the key
// screen, and OpenRouter calls rerouted to this server (same origin).
const SHIM = `<script>(function(){try{localStorage.setItem('adv.apiKey.openrouter.ai','key-is-on-the-server');localStorage.removeItem('adv.cloudProvider');}catch(e){}
var f=window.fetch;window.fetch=function(u,o){return f(typeof u==='string'?u.replace(/^https:\\/\\/openrouter\\.ai\\//,'/openrouter.ai/'):u,o);};})();</script>`;

const totals = { calls: 0, failed: 0, in: 0, out: 0 };

async function forward(req, res) {
  const origin = req.headers.origin || '';
  if (origin && origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) { res.writeHead(403); return res.end(); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const t0 = Date.now();
  let status = 502, text = '';
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'X-Title': 'Adventure Stories' },
      body,
    });
    status = r.status; text = await r.text();
  } catch (e) { text = JSON.stringify({ error: { message: e.message } }); }
  let usage = {}, model = '';
  try { const j = JSON.parse(text); usage = j.usage || {}; model = j.model || ''; } catch {}
  const n = ++totals.calls;
  if (status !== 200) totals.failed++;
  totals.in += usage.prompt_tokens || 0; totals.out += usage.completion_tokens || 0;
  const line = `${new Date().toISOString()} #${n} ${status} ${Date.now() - t0}ms ${model} in=${usage.prompt_tokens ?? '?'} out=${usage.completion_tokens ?? '?'} | total calls=${n} failed=${totals.failed} in=${totals.in} out=${totals.out}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
  if (process.env.PLAY_DUMP) fs.writeFileSync(path.join(LOGDIR, `play_call_${String(n).padStart(3, '0')}.json`), JSON.stringify({ request: JSON.parse(body || '{}'), status, response: text }, null, 2));
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(text);
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const parts = urlPath.split('/').filter(Boolean);
  if (parts.some(p => p.startsWith('.') || p === '..') || BLOCKED.has(parts[0])) { res.writeHead(404); return res.end(); }
  const file = path.join(ROOT, ...(parts.length ? parts : ['index.html']));
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  let data = fs.readFileSync(file);
  if (file.endsWith(`${path.sep}index.html`)) data = data.toString().replace('<head>', `<head>${SHIM}`);
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/openrouter.ai/api/v1/chat/completions') return forward(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveFile(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`Adventure Stories with your OpenRouter key: http://127.0.0.1:${PORT}  (Ctrl+C to stop)`));
