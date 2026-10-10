// prompt_size.mjs - how big is the storyteller's per-turn system prompt?
// Builds it for fixed sample moments (Act 1 start, mid Act 2 with a cast and
// threads, Act 3) and prints characters and ~tokens (chars/4) per moment and
// for the quest block alone. Used to keep new story systems from growing it.
//   node --experimental-loader ./tools/preload.mjs tools/prompt_size.mjs
import './dom_polyfill.mjs';
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const out = (s) => process.stdout.write(s + '\n');
const { gameState, resetGameState, createNewPlayer } = await import('../state.js');
const AI = await import('../aiHandler.js');
const Q = await import('../questDefinitions.js');

function moment(turn, milestones, extra = {}) {
    resetGameState();
    Object.assign(gameState, { adventureTheme: 'cyberpunk', turn, adventureGoal: 'Free the city from the Halcyon Directorate', isGoalComplete: false });
    gameState.players = [createNewPlayer('Michael', 40)];
    gameState.currentPlayerIndex = 0;
    gameState.questProgress = { milestones: milestones.map((name, i) => ({ name, turn: 2 + i * 3 })), completionPercentage: 0, ...extra.qp };
    gameState.currentNarrative = 'Rain hisses on the neon. '.repeat(40);
    gameState.storyThreads = extra.threads || [];
    gameState.entityMemory = { npcs: {}, locations: {}, items: {} };
    for (const n of extra.npcs || []) gameState.entityMemory.npcs[n] = { name: n, description: 'A rebel engineer who knows the old tunnels under the spire.', relationship: 'ally', lastSeenTurn: turn - 1 };
    gameState.currentLocation = { name: 'Hollow Spire Dispensary', type: 'clinic', dangerLevel: 0.5, description: 'Flickering lights.' };
    const sys = AI.generateSystemPrompt();
    const quest = Q.buildQuestStageHint(gameState);
    return { sys: sys.length, quest: quest.length };
}
const rows = [
    ['Act 1 start', moment(2, [])],
    ['mid Act 2 + cast + threads', moment(20, ['call_to_adventure', 'world_introduced', 'stakes_clear', 'ally_found'], { npcs: ['Vesper', 'Null', 'Kade', 'Orla'], threads: [{ text: 'the locked music box' }, { text: 'Vesper owes the Directorate a debt' }] })],
    ['Act 3', moment(40, ['call_to_adventure', 'world_introduced', 'stakes_clear', 'ally_found', 'first_obstacle_overcome', 'antagonist_revealed'], { qp: { villain: 'Director Halcyon' }, npcs: ['Vesper', 'Null'] })],
];
let total = 0;
for (const [name, r] of rows) { total += r.sys; out(`${name.padEnd(28)} system ${String(r.sys).padStart(6)} chars (~${Math.round(r.sys / 4)} tok) | quest block ${String(r.quest).padStart(5)} chars`); }
out(`average system prompt: ${Math.round(total / rows.length)} chars (~${Math.round(total / rows.length / 4)} tokens)`);
