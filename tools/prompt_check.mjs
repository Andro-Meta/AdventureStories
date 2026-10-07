// prompt_check.mjs - offline checks on what the narrator is asked for.
// Fails if the system prompt brings back the old contradicting formats or
// grows past budget, if multiplayer diffs target the wrong player, or if the
// tolerant parsing for common model slips regresses.
import './dom_polyfill.mjs';

const { gameState, resetGameState } = await import('../state.js');
const AI = await import('../aiHandler.js');
const { validateChoicesPayload, validateNarrativeTurnPayload } = await import('../schemas.js');
const Engine = await import('../engine.js');

resetGameState();
gameState.adventureTheme = 'pirate';
gameState.turn = 4;
gameState.players = [
  { id: 'player_1', name: 'Ava', age: 10, hp: 100, maxHp: 100, coins: 50, atk: 10, def: 5, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] },
  { id: 'player_2', name: 'Ben', age: 12, hp: 90, maxHp: 100, coins: 20, atk: 9, def: 6, inventory: [], equipment: {}, statusEffects: [], specialMoves: [] },
];
gameState.currentPlayerIndex = 1;

let failed = 0;
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++; };

const sys = AI.generateSystemPrompt();
check(!/\[Type=/.test(sys), 'system prompt has no legacy [Type=X] choice format');
check(!/Milestone:Type:Name/.test(sys), 'system prompt has no legacy Milestone: command format');
check(!/no_think|MiniCPM/i.test(sys), 'system prompt has no /no_think or MiniCPM leftovers');
check(sys.length < 7000, `system prompt under 7000 chars (is ${sys.length})`);
check(/110-170 words/.test(sys), 'age-11 party gets the 110-170 word turn length');

const diff = AI.buildDiffInstructions(1);
check(diff.includes('/players/1/inventory/-') && !diff.includes('/players/0/'), 'diff instructions target the acting player (index 1)');
const choices = AI.buildChoiceInstructions(['Good', 'Bad', 'Risky', 'Silly', 'Investigative'], false);
check(/exactly 5/.test(choices), 'choice instructions ask for exactly 5');

const n = Engine.normalizeOp({ op: 'add', path: '/entityMemory/locations/-', value: { name: 'Skull Cove' } });
check(n.path === '/entityMemory/locations/Skull Cove', 'entity "/-" path is keyed by value.name');
check(!Engine.validateOp({ op: 'add', path: '/entityMemory/npcs/-', value: {} }).ok, 'nameless entity "/-" op is rejected, not stored under "-"');

let caseOk = true;
try { validateChoicesPayload({ choices: [{ type: 'good', text: 'a' }, { type: 'Bad', text: 'b' }, { type: ' Risky', text: 'c' }, { type: 'SILLY', text: 'd' }, { type: 'Investigative', text: 'e' }] }, false); }
catch { caseOk = false; }
check(caseOk, 'choice types match regardless of case/spacing');

const op = { op: 'add', path: '/players/0/inventory/-', value: { name: 'Idol' } };
for (const [label, payload] of [['top-level ops', { narration: 'x', ops: [op] }], ['diff as bare array', { narration: 'x', diff: [op] }], ['diff.ops', { narration: 'x', diff: { ops: [op] } }]]) {
  check(validateNarrativeTurnPayload(payload).diff.ops.length === 1, `turn payload with ${label} keeps its op`);
}

console.log(failed ? `✗ ${failed} PROMPT CHECK FAILURE(S)` : '✓ prompt checks pass');
process.exit(failed ? 1 : 0);
