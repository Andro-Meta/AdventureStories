// key_proxy.mjs - dev-only proxy for live play-tests.
// Browser -> http://127.0.0.1:8899/openrouter.ai/api/v1/... -> https://openrouter.ai/api/v1/...
// Swaps the page's placeholder key for OPENROUTER_API_KEY from this project's
// .env, so the real key never enters the page or localStorage. OpenRouter only.
// Logs one line per request (requested model, served model, status, ms).
//
//   node tools/key_proxy.mjs            (then point the game at it, see README)
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const KEY = (fs.readFileSync(envPath, 'utf8').match(/^OPENROUTER_API_KEY=["']?([^"'\r\n]*)/m) || [])[1]?.trim();
if (!KEY) { console.error('OPENROUTER_API_KEY is empty in .env'); process.exit(1); }
const HOST = 'openrouter.ai';
const LOG = fileURLToPath(new URL('../test-results/key_proxy.log', import.meta.url));
fs.mkdirSync(fileURLToPath(new URL('../test-results/', import.meta.url)), { recursive: true });

http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const [, host, ...rest] = req.url.split('/');
  if (host !== HOST) { res.writeHead(403, cors); return res.end('{"error":{"message":"key_proxy only forwards to openrouter.ai"}}'); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const t0 = Date.now();
  try {
    const r = await fetch(`https://${HOST}/${rest.join('/')}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'X-Title': 'Adventure Stories test' },
      body: req.method === 'GET' ? undefined : body,
    });
    const text = await r.text();
    let asked = '', served = '';
    try { asked = JSON.parse(body).model; } catch {}
    try { served = JSON.parse(text).model || ''; } catch {}
    fs.appendFileSync(LOG, `${new Date().toISOString()} req=${asked} served=${served} ${r.status} ${Date.now() - t0}ms\n`);
    res.writeHead(r.status, { ...cors, 'Content-Type': 'application/json' });
    res.end(text);
  } catch (e) {
    fs.appendFileSync(LOG, `ERR ${e.message}\n`);
    res.writeHead(502, cors); res.end(JSON.stringify({ error: { message: e.message } }));
  }
}).listen(8899, '127.0.0.1', () => console.log('key_proxy on http://127.0.0.1:8899 (openrouter.ai only)'));
