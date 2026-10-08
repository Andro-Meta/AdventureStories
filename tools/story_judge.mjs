// story_judge.mjs - scores how well a saved story is threaded, using the
// free model as a judge (the .env OpenRouter key, one call per story).
//   node tools/story_judge.mjs test-results/story_before.json [more.json ...]
// Two numbers, from Parker & Stone and Chekhov:
//   causal %  - scene-to-scene links that are THEREFORE or BUT, not AND THEN
//   payoff %  - things set up (clues, objects, promises, mysteries) that pay off later
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const env = fs.readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8');
const KEY = (env.match(/^OPENROUTER_API_KEY=["']?([^"'\r\n]*)/m) || [])[1]?.trim();
if (!KEY) { console.error('OPENROUTER_API_KEY is empty in .env'); process.exit(1); }

async function judge(story) {
  const scenes = story.log.map((s, i) => `[${i + 1}] ${s.replace(/\s+/g, ' ')}`).join('\n\n');
  const prompt = `You are a strict story editor. Below are the scenes of an interactive adventure, in order.

${scenes}

1. For each pair of consecutive scenes (1->2, 2->3, ...), label how the second follows from the first:
   "therefore" = it happens BECAUSE of what happened before (a consequence),
   "but" = a complication or reversal arising from what happened before,
   "and_then" = it just comes next; it would read the same if the earlier scene were different.
2. List every setup: a named clue, object, character promise, mystery or threat that the story makes a point of.
   For each, the scene number where it is paid off (used, answered, resolved), or null if it never is.
Reply with JSON only: {"links":[{"from":1,"to":2,"label":"therefore|but|and_then"}],"setups":[{"scene":1,"setup":"...","payoff":3}]}`;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, 'X-Title': 'Adventure Stories judge' },
    body: JSON.stringify({ model: 'nvidia/nemotron-3-super-120b-a12b:free', models: ['nvidia/nemotron-3-ultra-550b-a55b:free'], temperature: 0,
      reasoning: { enabled: false }, response_format: { type: 'json_object' }, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content || '';
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

for (const file of process.argv.slice(2)) {
  const story = JSON.parse(fs.readFileSync(file, 'utf8'));
  const v = await judge(story);
  const links = v.links || [], setups = v.setups || [];
  const count = (l) => links.filter(x => x.label === l).length;
  const causal = links.length ? Math.round(100 * (count('therefore') + count('but')) / links.length) : 0;
  const paid = setups.filter(s => s.payoff != null && s.payoff > s.scene).length;
  const payoff = setups.length ? Math.round(100 * paid / setups.length) : 0;
  console.log(`${file}: ${story.log.length} scenes | causal ${causal}% (therefore ${count('therefore')}, but ${count('but')}, and_then ${count('and_then')}) | payoff ${payoff}% (${paid}/${setups.length} setups)`);
  for (const s of setups) console.log(`   scene ${s.scene}: ${s.setup} -> ${s.payoff ?? 'never'}`);
}
