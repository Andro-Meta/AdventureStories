// prompt_check.mjs - offline checks on what the narrator is asked for.
// Fails if the system prompt brings back the old contradicting formats or
// grows past budget, if multiplayer diffs target the wrong player, or if the
// tolerant parsing for common model slips regresses.
import './dom_polyfill.mjs';

const { gameState, resetGameState } = await import('../state.js');
const AI = await import('../aiHandler.js');
const { validateChoicesPayload, validateNarrativeTurnPayload } = await import('../schemas.js');
const Engine = await import('../engine.js');
const Q = await import('../questDefinitions.js');
const { formatTurnRecap } = await import('../actionHandler.js');

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

// Fight started with ops in the "wrong" order must still build a turn order.
gameState.inCombat = false; gameState.enemies = []; gameState.combat = null;
Engine.applyDiff([
  { op: 'replace', path: '/inCombat', value: true },
  { op: 'add', path: '/enemies/-', value: { name: 'Reef Shark', hp: 20, maxHp: 20, atk: 5, def: 2 } },
], { strict: false });
const init = gameState.combat?.initiative || [];
check(gameState.inCombat && init.some(id => String(id).startsWith('enemy')), `inCombat-before-enemy ops still put the enemy in the turn order (${init.length} entries)`);

// One-line turn recap.
const before = [{ name: 'Vincent', hp: 100, coins: 50, items: ['Grog'] }, { name: 'Ava', hp: 80, coins: 5, items: [] }];
const after = [{ name: 'Vincent', hp: 88, coins: 69, items: ['Grog', 'Rusty Cutlass'] }, { name: 'Ava', hp: 80, coins: 5, items: [] }];
const recap = formatTurnRecap(before, after, 'Vincent');
check(recap === 'Vincent: −12 HP, +19 coins, found Rusty Cutlass', `recap reads "${recap}"`);
check(formatTurnRecap(after, after, 'Ava') === 'Ava: no change', 'unchanged actor shows "no change"');

// Entity names: loose matching keeps one entry per place.
gameState.entityMemory = { npcs: {}, locations: { 'Grand Foyer': { name: 'Grand Foyer' } }, items: {} };
Engine.applyDiff([{ op: 'add', path: '/entityMemory/locations/the grand foyer', value: { name: 'the grand foyer', description: 'dusty' } }], { strict: false });
check(Object.keys(gameState.entityMemory.locations).length === 1 && gameState.entityMemory.locations['Grand Foyer'].description === 'dusty', 'renamed place updates the existing entity');
check(AI.findEntityKey({ 'Grand Foyer': {} }, 'The grand-foyer') === 'Grand Foyer', 'summarizer merge matches "The grand-foyer" to "Grand Foyer"');

// Bosses and mid-fight reinforcements.
Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Kraken Queen', hp: 30, atk: 4, def: 1, isBoss: true } }], { strict: false });
const boss = gameState.enemies.find(e => e.name === 'Kraken Queen');
check(boss?.isBoss && boss.maxHp >= 80 && boss.lootChance === 1, `boss gets a 2-player floor (hp ${boss?.maxHp}) and a sure drop`);
check(gameState.combat.initiative.includes(boss.id), 'an enemy added mid-fight joins the turn order');

// Pacing nudge after 5 idle rounds.
const qs = { turn: 20, adventureGoal: 'x', questProgress: { milestones: [{ name: 'call_to_adventure', turn: 2 }, { name: 'world_introduced', turn: 4 }, { name: 'stakes_clear', turn: 12 }] } };
check(/STALLED: 8 rounds/.test(Q.buildQuestStageHint(qs)), 'stalled story (8 idle rounds) gets a pacing nudge toward the next beat');
check(!/STALLED/.test(Q.buildQuestStageHint({ ...qs, turn: 14 })), 'no nudge when a beat happened recently');

// Combat owns enemy HP; no duplicate villains.
const bossIdx = gameState.enemies.indexOf(boss);
check(!Engine.validateOp({ op: 'replace', path: `/enemies/${bossIdx}/hp`, value: 0 }).ok, 'narrator cannot set enemy HP during a fight');
check(!Engine.validateOp({ op: 'add', path: '/enemies/-', value: { name: 'kraken queen', hp: 50 } }).ok, 'a second copy of a living enemy is refused');
boss.isDefeated = true;
check(!Engine.validateOp({ op: 'add', path: '/enemies/-', value: { name: 'Kraken Queen', hp: 90 } }).ok, 'a defeated boss cannot be re-added');

// The first foe after final_confrontation is the boss even without isBoss.
gameState.enemies = []; gameState.inCombat = false; gameState.combat = null;
gameState.questProgress.milestones = [{ name: 'final_confrontation', turn: 30 }];
Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Wailing Spirit', hp: 35 } }], { strict: false });
check(gameState.enemies[0]?.isBoss === true, 'climax foe becomes the boss automatically');

check(!Engine.validateOp({ op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow' } }).ok, 'final_blow is refused while the boss still stands');
check(!Engine.validateOp({ op: 'replace', path: '/isGoalComplete', value: true }).ok, 'isGoalComplete is refused while the boss still stands');
gameState.enemies[0].isDefeated = true; gameState.enemies[0].hp = 0;
check(Engine.validateOp({ op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow' } }).ok, 'final_blow is accepted once the boss is down');

// A named villain: the reveal stores the name, the prompt carries it, and
// only that villain becomes the boss (live: minion "Scout Kelri" did).
gameState.enemies = []; gameState.inCombat = false; gameState.combat = null;
gameState.isGoalComplete = false;
gameState.questProgress.milestones = [];
gameState.questProgress.villain = undefined;
Engine.applyDiff([{ op: 'add', path: '/questProgress/milestones/-', value: { name: 'antagonist_revealed', description: 'the admiral', villain: 'Admiral Grimtide' } }], { strict: false });
check(gameState.questProgress.villain === 'Admiral Grimtide', 'antagonist_revealed stores the villain name');
check(Q.buildQuestStageHint(gameState).includes('Admiral Grimtide'), 'quest hint names the villain');
// No final_confrontation: the live narrator skipped it and the villain fell at 30 HP.
Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Deckhand Brute', hp: 20 } }], { strict: false });
check(!gameState.enemies[0]?.isBoss, 'a minion at the climax is not made the boss when the villain is known');
Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'The Admiral Grimtide', hp: 30 } }], { strict: false });
check(gameState.enemies[1]?.isBoss === true, 'the named villain becomes the boss');
check(typeof AI.writeEpilogue === 'function', 'epilogue writer exists');

// Choice order: every render path shuffles, so no type owns a slot.
{
  const UI = await import('../ui.js');
  const ordered = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'].map(t => ({ type: t, text: `${t} option` }));
  const firsts = {};
  for (let i = 0; i < 300; i++) { UI.renderChoices(ordered); const t = gameState.currentChoices[0].type; firsts[t] = (firsts[t] || 0) + 1; }
  const max = Math.max(...Object.values(firsts));
  check(Object.keys(firsts).length === 5 && max < 120, `choices render in random order (first-slot counts ${JSON.stringify(firsts)})`);
}

// Story threads (Chekhov's gun): planted, capped at 4 open, paid off.
gameState.storyThreads = [];
Engine.applyDiff([1, 2, 3, 4, 5].map(n => ({ op: 'add', path: '/storyThreads/-', value: { text: `clue ${n}` } })), { strict: false });
check(gameState.storyThreads.length === 4, `at most 4 open threads (${gameState.storyThreads.length})`);
Engine.applyDiff([{ op: 'replace', path: '/storyThreads/1/resolved', value: true }], { strict: false });
check(gameState.storyThreads[1].resolved === true, 'a thread can be paid off');
Engine.applyDiff([{ op: 'add', path: '/storyThreads/-', value: 'clue 5' }], { strict: false });
check(gameState.storyThreads.length === 5, 'paying one off makes room for a new thread');
check(Engine.describeAllowedPaths().includes('/storyThreads/-'), 'narrator is told about /storyThreads');
check(Q.MAIN_QUEST_ARC.every(a => /STORY CIRCLE/.test(a.narratorHint)), 'every act carries its Story Circle beats');
check(/OPEN THREAD/.test(Q.MAIN_QUEST_ARC[2].narratorHint), 'Act 3 demands open threads be paid off');

// Combat Item/Special choices name the acting hero's real kit.
gameState.currentPlayerIndex = 0; gameState.nextActorIndex = 0;
gameState.players[0].inventory = [{ name: 'Kelp Tonic', type: 'Consumable', quantity: 1 }];
gameState.players[0].specialMoves = [{ name: 'Gale Kick' }];
{ const ci = AI.buildChoiceInstructions(['Attack', 'Special', 'Item', 'Run'], true);
  check(ci.includes('Kelp Tonic') && ci.includes('Gale Kick'), "combat choices must name the hero's real items and moves"); }

// Injury-detail setting: off by default (no blood for kids), on allows it.
{
  gameState.players.forEach(p => { p.age = 10; });
  localStorage.removeItem('adv.injuryDetail');
  const off = AI.generateSystemPrompt();
  localStorage.setItem('adv.injuryDetail', '1');
  const on = AI.generateSystemPrompt();
  localStorage.removeItem('adv.injuryDetail');
  check(/no blood/i.test(off) && !/Injury details are ON/.test(off), 'injury details off by default: kids get no blood');
  check(/Injury details are ON/.test(on) && !/no blood/i.test(on), 'injury details on: blood allowed, never gory');
}

console.log(failed ? `✗ ${failed} PROMPT CHECK FAILURE(S)` : '✓ prompt checks pass');
process.exit(failed ? 1 : 0);
