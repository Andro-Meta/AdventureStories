// turn_metrics.mjs - score a live play-test recorded by key_proxy (KEY_PROXY_DUMP=1).
// Reads test-results/call_*.json + key_proxy.log and prints one line per AI call
// plus totals: kind, latency, tokens, finish reason, JSON validity, narration
// words, choice validity, and how many diff ops the engine allowlist accepts.
//
//   node --experimental-loader ./tools/preload.mjs tools/turn_metrics.mjs [fromCallNumber]
import './dom_polyfill.mjs';
import fs from 'node:fs';

const { validateChoicesPayload } = await import('../schemas.js');
const { validateOp } = await import('../engine.js');
const { gameState } = await import('../state.js');
gameState.players = [{ name: 'P', hp: 100, maxHp: 100, coins: 50, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] }];
gameState.enemies = [{ name: 'E', hp: 10, maxHp: 10 }];

const dir = 'test-results';
const from = Number(process.argv[2] || 0);
const ms = {};
for (const line of fs.readFileSync(`${dir}/key_proxy.log`, 'utf8').split('\n')) {
  const m = line.match(/#(\d+) .* (\d+)ms in=(\S+) out=(\S+)/);
  if (m) ms[+m[1]] = { ms: +m[2], inTok: m[3], outTok: m[4] };
}
const parse = (s) => { try { return JSON.parse(String(s).replace(/^\s*```(?:json)?|```\s*$/g, '').trim()); } catch { return null; } };
const kindOf = (user) =>
  /"choices"\s*:\s*\[/.test(user) && /"narration"/.test(user) ? 'TURN(1-call)'
  : /Respond with ONLY a JSON object of the shape/.test(user) ? 'NARR+DIFF'
  : /Required JSON shape/.test(user) ? 'CHOICES'
  : /\[Type=X\]/.test(user) ? 'CHOICES-LEGACY'
  : /summary|arc/i.test(user) ? 'SUMMARY/OTHER' : 'OTHER';

const rows = [];
for (const f of fs.readdirSync(dir).filter(f => /^call_\d+\.json$/.test(f)).sort()) {
  const n = +f.match(/\d+/)[0];
  if (n < from) continue;
  const d = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const msgs = d.request.messages || [];
  const user = msgs[msgs.length - 1]?.content || '';
  const resp = parse(d.response) || {};
  const c = resp.choices?.[0];
  const content = c?.message?.content || '';
  const o = parse(content);
  const kind = kindOf(user);
  let choicesOk = '-', ops = '-', words = '-';
  if (o?.narration) words = o.narration.trim().split(/\s+/).length;
  if (o?.choices) { try { validateChoicesPayload(o, o.choices.length === 4); choicesOk = 'ok'; } catch (e) { choicesOk = 'BAD:' + e.message.slice(0, 40); } }
  { const all = Array.isArray(o?.ops) ? o.ops : Array.isArray(o?.diff) ? o.diff : o?.diff?.ops; if (all) ops = `${all.filter(op => validateOp(op).ok).length}/${all.length}`; }
  rows.push({ n, kind, sysChars: msgs[0]?.role === 'system' ? msgs[0].content.length : 0, userChars: user.length,
    finish: c?.finish_reason, json: !!o, words, choicesOk, ops, ...(ms[n] || {}) });
}
for (const r of rows) console.log(`#${String(r.n).padStart(3)} ${r.kind.padEnd(14)} ${String(r.ms ?? '?').padStart(6)}ms in=${r.inTok} out=${r.outTok} sys=${r.sysChars} user=${r.userChars} finish=${r.finish} json=${r.json} words=${r.words} choices=${r.choicesOk} ops=${r.ops}`);
const turnKinds = rows.filter(r => /TURN|NARR|CHOICES/.test(r.kind));
console.log(`calls=${rows.length} turnCalls=${turnKinds.length} truncated=${rows.filter(r => r.finish === 'length').length} invalidJSON=${turnKinds.filter(r => !r.json).length}`);
process.exit(0); // imported game modules start timers
