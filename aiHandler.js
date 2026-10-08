// aiHandler.js
// Handles AI communication, prompt generation, response processing, and command execution.

// --- Static Imports ---
import { gameState } from './state.js';
import * as Config from './config.js';
import * as UI from './ui.js';
import * as API from './api_new.js';
import { getChoiceSchema, validateChoicesPayload, arcMemorySchema, validateArcMemoryPayload, storyTurnSchema, validateNarrativeTurnPayload, EXPLORATION_CHOICE_TYPES, COMBAT_CHOICE_TYPES } from './schemas.js';
import { applyDiff, describeAllowedPaths } from './engine.js';
import { renderMemoryBlock } from './memoryRetriever.js';
import { buildQuestStageHint } from './questDefinitions.js';
import { generateNarrativeGuidelines, getReadingSpecification } from './ageAppropriateReading.js';
import * as Combat from './combat.js';
import * as Items from './items.js';
import { generateId, clamp } from './utils.js';
// Import turn manager functions statically
import { advanceTurn } from './turnManager.js';
import { getCurrentPlayer, canCurrentPlayerAct } from './state.js';
// Import location system
import { getCurrentLocationContext } from './locations.js';
// Import resolution functions statically
import { handleGoalCompletionRewards } from './resolution.js';
import { determineContext } from './state.js';
// Import context management (using local AI orchestration)
import { contextManager } from './contextManager.js';
// Import reputation system
// Note: Intelligent compression recording is handled in actionHandler.js

// FALLBACK FUNCTION REMOVED - AI must work correctly or fail clearly

const CHOICE_TYPE_MEANINGS = {
    Good: 'the sensible, careful option',
    Bad: 'a tempting but clearly foolish option',
    Risky: 'a bold gamble that could pay off big or go wrong',
    Silly: 'something genuinely funny for this age group that might just work',
    Investigative: 'look closer, ask questions, or search for clues',
    Attack: 'a specific strike at a named enemy',
    Special: "use one of the hero's special moves or abilities",
    Item: 'use something from the inventory',
    Run: 'escape using something in the surroundings'
};

/**
 * Instructions for the turn's state-change ops. The player index is the
 * acting player's, so multiplayer changes land on the right hero (the old
 * prompt hard-coded /players/0/, so every narrator HP/item change hit player 1).
 */
export function buildDiffInstructions(pIdx) {
    const P = `/players/${pIdx}`;
    const isGodMode = !!gameState.isGoalComplete;
    const rules = `OPS = the world changes this turn caused (the engine applies them; invalid ones are dropped):
- "add" only on list paths ending in "/-" (e.g. ${P}/inventory/-, /enemies/-, /questProgress/milestones/-).
- "replace" for single values (hp, coins, currentLocation, adventureGoal, inCombat), always with the new full value, never a delta.
- entityMemory entries are keyed by name: /entityMemory/npcs/<Name>, /entityMemory/locations/<Name>, /entityMemory/items/<Name>. Never "/-" there.
- "remove" only on ${P}/inventory/<itemId>.
ALLOWED PATHS:
${describeAllowedPaths().replace(/\/players\/0\//g, `${P}/`)}`;

    if (isGodMode) {
        return `${rules}

GOD MODE: the player has authorial authority. Their input is a DECLARATION; persist every tangible change with ops or it vanishes next turn.
- "I have N gold" -> replace ${P}/coins (cap 99999). "I wield/wear X" -> add ${P}/inventory/- (give reasonable stats).
- "I learn X" -> add ${P}/specialMoves/- (cooldown 3, mpCost 10). "I summon/befriend X" -> add /entityMemory/npcs/<Name>.
- "I go to/create X" -> replace /currentLocation + add /entityMemory/locations/<Name>. "I face X" -> add /enemies/- + replace /inCombat true.
- "New quest: X" -> replace /adventureGoal + replace /questProgress/completionPercentage 0. Never touch /isGoalComplete.
Defaults when vague: items tier "Special" with atk or def 18-30; bosses hp 300-800, atk 30-60, def 20-40; "a lot" = 10000.
Example: {"op":"add","path":"${P}/inventory/-","value":{"name":"Singing Sword","type":"Weapon","tier":"Special","effect":"its hum staggers foes","stats":{"atk":24}}}`;
    }
    return `${rules}

ALREADY HANDLED BY THE GAME (do not emit): anything listed under "Already applied by the game" in the action, and small reputation shifts. Show those results in the story. Emit HP or coin ops only for an extra, specific event you add ("a second arrow grazes her").
YOURS TO EMIT when the story makes them happen:
- A named new place the players enter: replace /currentLocation AND add /entityMemory/locations/<Name>.
- New named NPCs or notable items: add /entityMemory/npcs/<Name> or /entityMemory/items/<Name>; items the hero picks up: add ${P}/inventory/-.
- A fight starts: add /enemies/- (hp, maxHp, atk, def, abilities) AND replace /inCombat true. During a fight the game handles enemy HP and defeat itself: never emit /enemies/<n>/hp or /isDefeated, and never re-add an enemy that is already there or was defeated.
- Status effects with narrative weight (Poison, Burn, Stun, Fear, Regen, Shield...): add ${P}/statusEffects/- {name, duration}.
- Setups (Chekhov's gun): sparingly (about one every few turns), when the story makes a point of a clue, object, promise or mystery, add /storyThreads/- {text}. When one pays off, replace /storyThreads/<n>/resolved true. Never plant something you won't use.
- Quest beats: add /questProgress/milestones/- using the EXACT names from the MAIN QUEST STAGE block (the game computes the progress bar from them). Favors or rumors: add /questProgress/sideQuests/- {name, description, reward}.
${gameState.adventureGoal ? '' : '- Set /adventureGoal once early (turn 4-6).\n'}- Main quest truly finished: add the "final_blow" milestone (the game then completes the quest).
If the narration says the hero picked something up, met someone named, arrived somewhere named, or a fight began, the matching op MUST be in "ops". An empty list is only for a turn where nothing in the world changed.
Format examples only (never use these names or details in the story):
{"op":"add","path":"/entityMemory/locations/The Crystal Hall","value":{"name":"The Crystal Hall","description":"a vaulted chamber of humming crystals"}}
{"op":"add","path":"/enemies/-","value":{"name":"Stone Guardian","hp":40,"maxHp":40,"atk":7,"def":4,"abilities":["Slam"]}}
{"op":"add","path":"/questProgress/milestones/-","value":{"name":"call_to_adventure","description":"The locket whispers the hero's name."}}`;
}

export function buildChoiceInstructions(types, inCombat) {
    const list = types.map(t => `- ${t}: ${CHOICE_TYPE_MEANINGS[t]}`).join('\n');
    return `CHOICES: exactly ${types.length}, one of each type:
${list}
Each choice: under 160 characters, starts with a verb, names something specific from the narration, and never states its type (no "safely", "risky", "silly").${inCombat ? ` Attack must name the enemy it targets.${combatKitLine()}` : ' Make the five genuinely different from each other. If your ops START a fight, write four fight choices instead, types Attack, Special, Item, Run.'}`;
}

// Item and Special choices must name what the acting hero really has: the
// game uses that item or move (live: "hold up the blue silk scrap" drank a potion).
function combatKitLine() {
    const p = gameState.players?.[gameState.nextActorIndex ?? gameState.currentPlayerIndex ?? 0];
    if (!p) return '';
    const items = (p.inventory || []).filter(i => i?.type === 'Consumable' && (i.quantity == null || i.quantity > 0)).map(i => i.name);
    const moves = (p.specialMoves || []).filter(m => !(m.currentCooldown > 0)).map(m => m.name);
    return ` Item must use one of ${p.name}'s items: ${items.length ? [...new Set(items)].join(', ') : 'none (write it as searching their pack)'}. Special must use ${moves.length ? `one of: ${moves.join(', ')}` : 'a bold signature move'}.`;
}

/**
 * One turn = one AI call returning narration + state diff + choices as a
 * single JSON object. A second, small choices-only call is made only when the
 * choices in that reply are unusable.
 */
export async function processAIResponse(prompt) {
    const log = window.displayVisualError || console.log;
    const isInitialSetup = prompt.includes("Please provide a rich, detailed story introduction in three parts");
    const inCombat = !!gameState.inCombat;
    const types = inCombat ? COMBAT_CHOICE_TYPES : EXPLORATION_CHOICE_TYPES;
    const pIdx = gameState.currentPlayerIndex || 0;
    const actor = gameState.players?.[pIdx]?.name || 'the hero';
    const nextActor = gameState.players?.[gameState.nextActorIndex ?? pIdx];
    const ages = (gameState.players || []).map(p => p.age).filter(a => typeof a === 'number' && a > 0);
    const wc = getReadingSpecification(ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 25).targetWordCount;
    const words = isInitialSetup ? `${wc.min}-${Math.round(wc.max * 1.5)}` : `${wc.min}-${wc.max}`;

    const recent = (gameState.recentTurns || []).slice(-3);
    const scene = isInitialSetup ? prompt : `${recent.length ? `RECENT TURNS (oldest first):\n${recent.join('\n')}\n\n` : ''}PREVIOUS SCENE:
${gameState.currentNarrative || '(the story is just beginning)'}

WHAT ${actor.toUpperCase()} JUST DID:
${prompt}`;

    const userPrompt = `${scene}

Reply with ONE JSON object with all three keys, and nothing else:
{"narration":"...","ops":[],"choices":[${types.map(t => `{"type":"${t}","text":"..."}`).join(',')}]}

NARRATION: ${words} words (at least ${wc.min}; replies under that are too thin), in 2 short paragraphs, third person, naming the hero who acted. Show what happens because of the action, then end on a moment that invites the next decision. No choices or bracket tokens inside the narration.

${prompt.startsWith('[God mode]') ? '' : `STORY LOGIC: link this scene to the last as a consequence of the choice ("therefore") or a complication that makes things harder ("but"), never "and then". Do not write those linking words themselves in capitals or as labels. At least every other scene needs a BUT: a twist, a cost, a rival, a door that won't open. Never repeat the last scene's beat; something new must happen.${openThreadsBlock()}`}

${nextActor && (gameState.players || []).length > 1 ? `NEXT TO ACT: ${nextActor.name}. Write the choices for ${nextActor.name}${nextActor.specialMoves?.length ? ` (special moves: ${nextActor.specialMoves.map(m => m.name).join(', ')})` : ''} and end the narration by turning to them.

` : ''}${buildChoiceInstructions(types, inCombat)}

${buildDiffInstructions(pIdx)}`;

    const messages = [
        { role: 'system', content: generateSystemPrompt() },
        { role: 'user', content: userPrompt }
    ];

    try {
        let payload;
        try {
            payload = await API.getAIResponseJSON(messages, storyTurnSchema, { jsonSchemaName: 'story_turn', max_tokens: 2000, temperature: 0.8 });
            validateNarrativeTurnPayload(payload);
        } catch (firstErr) {
            if (firstErr.httpStatus !== undefined) throw firstErr;
            log(`Turn reply unusable (${firstErr.message}); retrying once.`);
            payload = await API.getAIResponseJSON(messages, storyTurnSchema, { jsonSchemaName: 'story_turn', max_tokens: 2000, temperature: 0.6 });
        }
        const validated = validateNarrativeTurnPayload(payload);
        const cleanNarrative = validated.narration
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
            .trim();
        // Coins/HP the game already applied this turn ("Already applied by the
        // game") were re-added by the narrator in 4 of 8 live turns (+43 coins
        // drift). Outside god mode, its coin/HP ops on such turns are dropped.
        let turnOps = validated.diff.ops || [];
        if (!gameState.isGoalComplete && /Already applied by the game/i.test(prompt)) {
            const before = turnOps.length;
            turnOps = turnOps.filter(o => !/^\/players\/\d+\/(coins|hp)$/.test(String(o.path)));
            if (turnOps.length < before) log(`dropped ${before - turnOps.length} duplicate coin/HP op(s) (game already applied them)`);
        }
        const appliedDiff = applyDiff(turnOps, { strict: false });
        log(`narrative diff: applied ${appliedDiff.length}/${(validated.diff.ops || []).length} ops`);
        // The opening names the starting place; if the narrator skipped the
        // /currentLocation op, use the first place it recorded.
        if (gameState.currentLocation?.name === 'Not named yet') {
            const first = Object.values(gameState.entityMemory?.locations || {})[0];
            if (first?.name) gameState.currentLocation = { ...gameState.currentLocation, name: first.name, description: first.description || '', isFallback: false };
        }

        gameState.currentNarrative = cleanNarrative;
        try {
            if (gameState.imprisoned && typeof window !== 'undefined' && window.__jailSystem?.tryAutoCompleteEscape) {
                window.__jailSystem.tryAutoCompleteEscape();
            }
        } catch (_) { /* don't break narrative update on jail-system errors */ }

        UI.updateNarrative(gameState.currentNarrative);
        UI.renderPlayerCards();
        UI.renderEnemyCards();
        UI.updateContextHeaders();

        // Ops that defeat the last enemy end the fight here, so the choices
        // match: before, a narrator kill left combat choices on screen after
        // actionHandler closed the fight (live: Attack/Run while exploring).
        if (gameState.inCombat && (gameState.enemies || []).length && Combat.areAllEnemiesDefeated()) {
            gameState.inCombat = false;
            if (gameState.combat) gameState.combat.isActive = false;
        }
        // The diff may have started or ended a fight; choices must match the mode now.
        const nowInCombat = !!gameState.inCombat;
        let choices = null;
        // Accept the reply's choices whenever they fit the mode now: a turn that
        // starts a fight may already carry Attack/Special/Item/Run (asked for
        // below); before, every fight start/end cost a choices-only call.
        try { choices = validateChoicesPayload(payload, nowInCombat); }
        catch (e) { log(`Turn choices unusable (${e.message}); asking for choices only.`); }
        if (!choices) choices = await requestChoicesOnly(cleanNarrative, nowInCombat);

        UI.renderChoices(choices); // shuffles and sets gameState.currentChoices
        return { narrative: cleanNarrative, choices: gameState.currentChoices };
    } catch (error) {
        log(`processAIResponse failed: ${error.message}`);
        UI.showLoading(false);
        throw new Error(`AI processing failed: ${error.message}`);
    }
}

/** Small call: choices for an already-written scene (optionally for a named hero). */
/**
 * The ending after the boss falls: one extra call so the win reads as a
 * finished story (world changes, reactions, each hero) before god mode.
 * Shown below the final turn's narration; failure just skips it.
 */
// Names from this device's earlier games, so a replayed theme gets new
// people and places (live: "Salty ..." in 4 of 4 pirate games).
function usedNamesLine() {
    let names = [];
    try { names = JSON.parse(localStorage.getItem('adv.usedNames') || '[]'); } catch (_) {}
    const mine = new Set(Object.keys(gameState.entityMemory?.npcs || {}).concat(Object.keys(gameState.entityMemory?.locations || {})));
    names = names.filter(n => !mine.has(n)).slice(-40);
    return names.length ? ` Names from earlier games, never reuse them or close variants: ${names.join(', ')}.` : '';
}

// Exactly who the heroes are: "for 1-5 friends" let a solo game grow
// invented companions acting like extra players.
function heroCountLine() {
    const names = (gameState.players || []).map(p => p?.name).filter(Boolean);
    if (names.length <= 1) return `one player. The only hero is ${names[0] || 'the player'}: never invent companions who act as heroes or take turns; helpers are NPCs.`;
    return `${names.length} friends playing together. The heroes are exactly ${names.join(', ')}: never add other heroes or party members; anyone else is an NPC.`;
}

// The setups the story still owes a payoff, numbered by their index in
// gameState.storyThreads so the narrator can mark them resolved.
function openThreadsBlock() {
    const open = (gameState.storyThreads || []).map((t, i) => ({ ...t, i })).filter(t => !t.resolved);
    if (!open.length) return '';
    return `\nOPEN THREADS (setups you owe a payoff; push one forward or pay it off soon, by number):\n${open.map(t => `${t.i}. ${t.text}`).join('\n')}`;
}

/**
 * God mode: turn a free-form wish into engine ops (stats, items, powers, gold,
 * a new quest...). Returns [] on failure; the caller applies them.
 */
export async function wishToOps(wish, alreadyApplied = []) {
    const p = gameState.players?.[gameState.currentPlayerIndex || 0];
    if (!p) return [];
    const hero = `${p.name}: level ${p.level || 1}, HP ${p.hp}/${p.maxHp}, MP ${p.mp}/${p.maxMp}, ATK ${p.atk}, DEF ${p.def}, coins ${p.coins}; items: ${(p.inventory || []).map(i => i.name).join(', ') || 'none'}; moves: ${(p.specialMoves || []).map(m => m.name).join(', ') || 'none'}`;
    const payload = await API.getAIResponseJSON([
        { role: 'system', content: 'You turn a game wish into JSON-patch ops for the game engine. The player has won and may do anything, even game-breaking. Reply with JSON only.' },
        { role: 'user', content: `HERO: ${hero}
WISH: "${wish}"${alreadyApplied.length ? `
ALREADY DONE (do not repeat): ${alreadyApplied.join('; ')}` : ''}

Ops for every concrete effect of the wish, using these paths:
${describeAllowedPaths()}
- Level ups: replace /players/0/level with the new level (the game adds the stat gains).
- New weapons/armor: add /players/0/inventory/- {name, type: Weapon|Armor, tier: Legendary, stats: {atk|def: N}} then replace /players/0/equipment/weapon|armor with the item name.
- New powers: add /players/0/specialMoves/- {name, description, cooldown, mpCost, mechanics: {directDamage: N}}.
- Vague powers or blessings ("divine power", "become a god", "unstoppable"): invent a fitting, generous concrete effect (a named special move with big directDamage, a large stat boost, a legendary item). Never return nothing for a power.
Values are totals, not deltas. Reply exactly as {"ops":[...]}; only a purely cosmetic wish gets {"ops":[]}.` }
    ], { type: 'object', properties: { ops: { type: 'array' } }, required: ['ops'] }, { jsonSchemaName: 'wish_ops', max_tokens: 700, temperature: 0.2 });
    return Array.isArray(payload?.ops) ? payload.ops.filter(o => o && typeof o.path === 'string').slice(0, 12) : [];
}

export async function writeEpilogue() {
    const heroes = (gameState.players || []).map(p => p.name).join(', ');
    const villain = gameState.questProgress?.villain;
    const payload = await API.getAIResponseJSON([
        { role: 'system', content: `You write the ending of a ${getThemeName()} text adventure. Reply with one JSON object only.` },
        { role: 'user', content: `QUEST WON: ${gameState.adventureGoal || 'the main quest'}${villain ? `
VILLAIN DEFEATED: ${villain}` : ''}${(gameState.storyThreads || []).length ? `
STORY THREADS (pay off any still open in a line each): ${gameState.storyThreads.map(t => `${t.text}${t.resolved ? '' : ' (still open)'}`).join('; ')}` : ''}
HEROES: ${heroes}
FINAL SCENE:
${gameState.currentNarrative || ''}

Write the epilogue in 2-3 short paragraphs, third person, past tense: how the world changed, how the people react, and one line for each hero about what they do next. End with a hint that more adventures wait. Reply exactly as {"epilogue":"..."}` }
    ], { type: 'object', properties: { epilogue: { type: 'string' } }, required: ['epilogue'] },
    { jsonSchemaName: 'epilogue', max_tokens: 900, temperature: 0.8 });
    const text = String(payload?.epilogue || '').trim();
    if (text.length < 40) throw new Error('epilogue too short');
    gameState.epilogue = text;
    gameState.currentNarrative = `${gameState.currentNarrative || ''}

— Epilogue —

${text}`.trim();
    UI.updateNarrative(gameState.currentNarrative);
    return text;
}

export async function requestChoicesOnly(narrative, inCombat, forHero = null) {
    const types = inCombat ? COMBAT_CHOICE_TYPES : EXPLORATION_CHOICE_TYPES;
    const enemies = inCombat ? `\nEnemies: ${(gameState.enemies || []).filter(e => !e.isDefeated).map(e => e.name).join(', ')}` : '';
    const payload = await API.getAIResponseJSON([
        { role: 'system', content: `You write the player choices for a ${getThemeName()} text adventure. Reply with one JSON object only.` },
        { role: 'user', content: `SCENE:\n${narrative}${enemies}\n\n${forHero ? `Write the choices for ${forHero}, who acts next.\n` : ''}${buildChoiceInstructions(types, inCombat)}\n\nReply exactly as {"choices":[${types.map(t => `{"type":"${t}","text":"..."}`).join(',')}]}` }
    ], getChoiceSchema(inCombat), { jsonSchemaName: inCombat ? 'combat_choices' : 'exploration_choices', max_tokens: 600, temperature: 0.7 });
    return validateChoicesPayload(payload, inCombat);
}

/**
 * Validates and fixes the choices to ensure they meet requirements
 * @param {Array} choices - The generated choices
 * @param {boolean} inCombat - Whether the game is in combat mode
 * @returns {Array} The validated and fixed choices
 */
function validateAndFixChoices(choices, inCombat) {
    const log = window.displayVisualError || console.log;
    
    if (inCombat) {
        const requiredTypes = ['Attack', 'Special', 'Item', 'Run'];
        const missingTypes = requiredTypes.filter(type => !choices.some(choice => choice.type === type));
        
        if (missingTypes.length > 0) {
            log(`Adding missing combat choice types: ${missingTypes.join(', ')}`);
            const activeEnemy = gameState.enemies?.find(e => !e.isDefeated);
            
            missingTypes.forEach(type => {
                const defaultText = {
                    'Attack': activeEnemy ? `Attack ${activeEnemy.name} with your weapon.` : 'No valid target.',
                    'Special': 'Use a special move.',
                    'Item': 'Use an item from your inventory.',
                    'Run': 'Try to escape from combat.'
                }[type];
                
                choices.push({ type, text: defaultText });
            });
        }

        // Validate Attack choices have enemy names
        const attackChoices = choices.filter(c => c.type === 'Attack');
        const activeEnemies = gameState.enemies?.filter(e => !e.isDefeated) || [];
        
        attackChoices.forEach(choice => {
            const hasValidTarget = activeEnemies.some(enemy => 
                choice.text.toLowerCase().includes(enemy.name.toLowerCase())
            );
            
            if (!hasValidTarget && activeEnemies.length > 0) {
                choice.text = `Attack ${activeEnemies[0].name} with your weapon.`;
            }
        });
    } else {
        const requiredTypes = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];
        const missingTypes = requiredTypes.filter(type => !choices.some(choice => choice.type === type));
        
        if (missingTypes.length > 0) {
            log(`Adding missing exploration choice types: ${missingTypes.join(', ')}`);
            const context = determineContext(getCurrentPlayer());
            
            missingTypes.forEach(type => {
                const defaultText = {
                    'Good': context.environment === 'dangerous' ? 
                        'Take a careful and cautious approach.' : 'Take a safe and methodical approach.',
                    'Bad': 'Take a risky and potentially dangerous action.',
                    'Risky': context.environment === 'dangerous' ? 
                        'Attempt a calculated but dangerous maneuver.' : 'Take a calculated risk.',
                    'Silly': 'Do something unexpected or humorous.',
                    'Investigative': context.situation === 'social' ? 
                        'Ask questions and gather information.' : 'Search the area thoroughly.'
                }[type];
                
                choices.push({ type, text: defaultText });
            });
        }
    }

    return choices;
}

/**
 * Handles a single bracketed command extracted from the AI response.
 * Modifies gameState based on the command.
 * @param {string} commandString - The content inside the brackets.
 */
export async function handleCommand(commandString) {
    const log = window.displayVisualError || console.log; // Use logger
    // Needs access to gameState, Combat, Items, UI, generateId, clamp, findCharacterById, handleGoalCompletionRewards
    log(`Handling command: ${commandString}`);
    const parts = commandString.split(':').map(s => s.trim());
    const command = parts[0]?.toLowerCase();
    if (!command) {
        log("Warning: Empty command received.");
        return;
    }

    try {
        switch (command) {
            // --- Character Stat/Resource Commands ---
            case 'hp': // HP:[+/-]Value:TargetID(:Source)
                if (parts.length >= 3) {
                    const valueStr = parts[1];
                    const value = parseInt(valueStr, 10);
                    const targetIdHp = parts[2];
                    const source = parts[3] || 'AI Action';
                    const target = Combat.findCharacterById(targetIdHp);

                    if (!isNaN(value) && target) {
                        log(`Applying HP change via command: ${value} to ${target.name} (${target.id}) from ${source}`);
                        const oldHp = target.hp;
                        // Don't apply HP changes from commands if already downed/defeated
                        if ((target.id.startsWith('player') && !target.isDowned) || (target.id.startsWith('enemy') && !target.isDefeated)) {
                            target.hp = clamp(target.hp + value, 0, target.maxHp);
                            const actualChange = target.hp - oldHp;
                            if(actualChange !== 0) {
                                const msg = `${target.name} ${actualChange > 0 ? 'healed' : 'damaged'} for ${Math.abs(actualChange)} HP (${source}).`;
                                UI.showPopup(msg, actualChange > 0 ? 'healing' : 'damage');
                            }
                            // Check for defeat/downed AFTER applying change
                            if (target.id.startsWith('player') && target.hp <= 0 && !target.isDowned) {
                                target.isDowned = true;
                                target.downedTurns = 0;
                                UI.showPopup(`${target.name} downed by ${source}!`, 'error');
                                log(`${target.name} downed by command ${source}!`);
                            } else if (target.id.startsWith('enemy') && target.hp <= 0 && !target.isDefeated) {
                                log(`${target.name} defeated by command ${source}! Processing defeat...`);
                                await Combat.handleEnemyDefeat(target.id); // Handles loot etc.
                            }
                        } else {
                            log(`Skipping HP command for already downed/defeated target: ${target.name}`);
                        }
                    } else {
                        log(`Warning: Invalid HP command: Value='${valueStr}', TargetID='${targetIdHp}'. Target found: ${!!target}`);
                    }
                } else {
                    log(`Warning: Invalid HP command format: ${commandString}`);
                }
                break;

            case 'coins': // Coins:[+/-]Value:PlayerID
                if (parts.length >= 3) {
                    const amountStr = parts[1];
                    const amount = parseInt(amountStr, 10);
                    const coinTargetId = parts[2];
                    const playerCoins = Combat.findCharacterById(coinTargetId);
                    if (!isNaN(amount) && playerCoins?.id.startsWith('player') && !playerCoins.isDowned) { // Don't give coins to downed players via command? Maybe okay.
                        const oldCoins = playerCoins.coins;
                        playerCoins.coins = Math.max(0, playerCoins.coins + amount);
                        const actualCoinChange = playerCoins.coins - oldCoins;
                        if (actualCoinChange !== 0) {
                            UI.showPopup(`${playerCoins.name} ${actualCoinChange > 0 ? 'gained' : 'lost'} ${Math.abs(actualCoinChange)} Coins!`, 'coins');
                            log(`Coins changed by ${actualCoinChange} for ${playerCoins.name}. New Coins: ${playerCoins.coins}`);
                            UI.updateContextHeaders();
                        }
                    } else {
                        log(`Warning: Invalid Coins command: Amount='${amountStr}', TargetID='${coinTargetId}'. Target found/isPlayer/notDowned: ${!!playerCoins?.id.startsWith('player') && !playerCoins?.isDowned}`);
                    }
                } else {
                    log(`Warning: Invalid Coins command format: ${commandString}`);
                }
                break;

             // --- Item Commands ---
             case 'item': // Item:Give:PlayerID:ItemName:Tier:Type(:EffectOverride)
                 if (parts.length >= 6 && parts[1].toLowerCase() === 'give') {
                     const itemTargetId = parts[2];
                     const itemName = parts[3];
                     const itemTierStr = parts[4];
                     const itemType = parts[5];
                     const effectOverride = parts.slice(6).join(':').trim(); // Join remaining parts for effect
                     const playerItem = Combat.findCharacterById(itemTargetId);
                     // Find the tier value from Config.Tiers based on the string
                     const itemTier = Object.values(Config.Tiers).find(t => t.toLowerCase() === itemTierStr.toLowerCase()) || Config.Tiers.LOW;

                     if (itemName && itemType && playerItem?.id.startsWith('player') && !playerItem.isDowned) { // Don't give items to downed players via command
                         log(`Attempting to give item '${itemName}' (Tier: ${itemTier}, Type: ${itemType}) to ${playerItem.name}`);
                         // Try generating a themed item first to get base stats/structure, then override
                         let newItem = Items.generateThemedItem(gameState.adventureTheme, itemTier, itemType);
                         if (newItem) {
                             newItem.name = itemName; // Override name
                             if (effectOverride) newItem.effect = effectOverride;
                             // Could potentially override stats here too if needed, e.g., from effectOverride parsing
                             log(` -> Generated base item, overridden name/effect.`);
                         } else {
                             // Fallback if generation fails (e.g., invalid type/tier for theme)
                             log(`Warning: Failed to generate base item for command: ${commandString}. Creating basic fallback.`);
                             newItem = {
                                 id: generateId('item'),
                                 name: itemName,
                                 tier: itemTier,
                                 type: itemType,
                                 effect: effectOverride || `A ${itemTier} ${itemType} item.`,
                                 stats: {}, // Add basic stats based on type/tier? Deferred.
                                 quantity: itemType === 'Consumable' ? 1 : undefined,
                                 equippedSlot: null
                             };
                         }
                         // Add to inventory
                         if(!playerItem.inventory) playerItem.inventory = [];
                         playerItem.inventory.push(newItem);
                         UI.showPopup(`${playerItem.name} received: ${itemName}!`, 'item');
                         log(`Item added to ${playerItem.name}'s inventory: ${itemName}`);
                         if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
                     } else {
                         log(`Warning: Invalid Item:Give command: TargetID='${itemTargetId}', Name='${itemName}'. Target found/isPlayer/notDowned: ${!!playerItem?.id.startsWith('player') && !playerItem?.isDowned}`);
                     }
                 } else {
                      log(`Warning: Invalid Item:Give command format: ${commandString}`);
                 }
                 break;

            // --- Enemy Commands ---
            case 'enemy': // Enemy:Spawn:Name:HP:ATK:DEF(:Ability1;Ability2:LootTier:LootChance)
                if (parts.length >= 6 && parts[1].toLowerCase() === 'spawn') {
                    const enemyName = parts[2];
                    const enemyMaxHp = parseInt(parts[3], 10);
                    const enemyAtk = parseInt(parts[4], 10);
                    const enemyDef = parseInt(parts[5], 10);
                    const optionalPartsStr = parts.length > 6 ? parts.slice(6).join(':') : '';
                    const optionalParts = optionalPartsStr.split(':');
                    let abilities = [];
                    let lootTier = Config.Tiers.LOW;
                    let lootChance = 0.25;
                    // Parse optional parts carefully
                    if (optionalParts.length > 0 && optionalParts[0].trim() !== '') { abilities = optionalParts[0].split(';').map(a => a.trim()).filter(a => a); }
                    if (optionalParts.length > 1) { const tierStr = optionalParts[1].trim(); lootTier = Object.values(Config.Tiers).find(t => t.toLowerCase() === tierStr.toLowerCase()) || Config.Tiers.LOW; }
                    if (optionalParts.length > 2) { const chance = parseFloat(optionalParts[2].trim()); if (!isNaN(chance)) lootChance = clamp(chance, 0, 1); }

                    if (enemyName && !isNaN(enemyMaxHp) && enemyMaxHp > 0 && !isNaN(enemyAtk) && !isNaN(enemyDef)) {
                        log(`Spawning enemy via command: ${enemyName}, HP:${enemyMaxHp}, ATK:${enemyAtk}, DEF:${enemyDef}, Abilities:${abilities.join('/') || 'None'}, Loot:${lootTier}/${lootChance}`);
                        const newEnemy = {
                            id: generateId('enemy'), name: enemyName, hp: enemyMaxHp, maxHp: enemyMaxHp, atk: enemyAtk, def: enemyDef,
                            abilities: abilities.length > 0 ? abilities : ['Basic Attack'], statusEffects: [], isDefeated: false,
                            lootTier: lootTier, lootChance: lootChance
                        };
                        if(!gameState.enemies) gameState.enemies = [];
                        gameState.enemies.push(newEnemy);
                        // Start combat if not already started
                        if (!gameState.inCombat) {
                            gameState.inCombat = true;
                            UI.showPopup('Combat Started!', 'info');
                            log('Combat Started! (Triggered by Enemy:Spawn)');
                        }
                        UI.showPopup(`Enemy Appeared: ${enemyName}!`, 'damage');
                    } else {
                        log(`Warning: Invalid Enemy:Spawn command data: Name=${enemyName} HP=${parts[3]} ATK=${parts[4]} DEF=${parts[5]}`);
                    }
                } else {
                    log(`Warning: Invalid Enemy:Spawn command format: ${commandString}`);
                }
                break;

            // --- Combat State Commands ---
            case 'combat': // Combat:Start or Combat:End
                 if (parts.length >= 2) {
                    const combatState = parts[1]?.toLowerCase();
                    if (combatState === 'start') {
                        if (!gameState.inCombat) {
                            gameState.inCombat = true;
                            UI.showPopup('Combat Started!', 'info');
                            log("Combat explicitly started by command.");
                        } else { log("Combat:Start received, already in combat."); }
                    } else if (combatState === 'end') {
                        if (gameState.inCombat) {
                            gameState.inCombat = false;
                            const remainingEnemies = gameState.enemies?.filter(e => e && !e.isDefeated);
                            if (remainingEnemies && remainingEnemies.length > 0) {
                                 log(`Combat ended by command. Removing ${remainingEnemies.length} non-defeated enemies.`);
                                 // Maybe don't delete, just mark as defeated or fled? For now, deleting.
                                 gameState.enemies = [];
                            } else {
                                log("Combat ended by command. No remaining enemies needed clearing.");
                            }
                            UI.showPopup('Combat Ended!', 'success');
                        } else { log("Combat:End received, not in combat."); }
                    } else {
                         log(`Warning: Invalid Combat state: ${combatState}`);
                    }
                } else {
                    log(`Warning: Invalid Combat command format: ${commandString}`);
                }
                break;

            // --- Goal Commands ---
            case 'goal': // Goal:Complete or Goal:Update:New goal text
                if (parts.length >= 2) {
                    const goalState = parts[1]?.toLowerCase();
                    if (goalState === 'complete') {
                        if (!gameState.isGoalComplete) {
                            gameState.isGoalComplete = true;
                            gameState.allowCustomActions = true; // Enable custom actions
                            log("Goal marked as complete by command. Custom actions enabled.");
                            UI.showPopup('Goal Completed! You can now type custom actions.', 'legendary', 5000);
                            // Trigger rewards *after* marking complete
                            log("Calling handleGoalCompletionRewards...");
                            handleGoalCompletionRewards();
                            log("handleGoalCompletionRewards finished.");
                            // Explicitly show custom action container
                            // (the god-mode box in the choices card is the only custom input)
                        } else { log("Goal:Complete received, already complete."); }
                    } else if (goalState === 'update' && parts.length >= 3) {
                        const newGoal = parts.slice(2).join(':').trim();
                        if (newGoal) {
                            gameState.adventureGoal = newGoal;
                            // Update quest progress objectives
                            if (gameState.questProgressManager) {
                                gameState.questProgressManager.updateObjectives([newGoal], true);
                            }
                            UI.showPopup('Goal Updated!', 'info');
                            log("Goal updated by command to: " + newGoal);
                        } else {
                            log(`Warning: Goal:Update command missing text: ${commandString}`);
                        }
                    } else {
                        log(`Warning: Invalid Goal state or format: ${commandString}`);
                    }
                } else {
                    log(`Warning: Invalid Goal command format: ${commandString}`);
                }
                break;

            // --- Quest Progress Commands ---
            case 'milestone': // Milestone:Type:Name:Description
                if (parts.length >= 2 && gameState.questProgressManager) {
                    const milestoneType = parts[1];
                    const customName = parts[2] || null;
                    const customDescription = parts[3] || null;
                    
                    const success = gameState.questProgressManager.addMilestone(milestoneType, customName, customDescription);
                    if (success) {
                        log(`Milestone added: ${milestoneType} - ${customName || 'default name'}`);
                    } else {
                        log(`Warning: Invalid milestone type: ${milestoneType}`);
                    }
                } else {
                    log(`Warning: Invalid Milestone command format: ${commandString}`);
                }
                break;

            case 'objective': // Objective:Complete:Text or Objective:Add:Text
                if (parts.length >= 3 && gameState.questProgressManager) {
                    const action = parts[1]?.toLowerCase();
                    const objectiveText = parts.slice(2).join(':').trim();
                    
                    if (action === 'complete') {
                        gameState.questProgressManager.completeObjective(objectiveText);
                        log(`Objective completed: ${objectiveText}`);
                    } else if (action === 'add') {
                        gameState.questProgressManager.updateObjectives([objectiveText], false);
                        log(`Objective added: ${objectiveText}`);
                    } else {
                        log(`Warning: Invalid Objective action: ${action}`);
                    }
                } else {
                    log(`Warning: Invalid Objective command format: ${commandString}`);
                }
                break;

            case 'sidequest': // SideQuest:Add:Name:Description or SideQuest:Complete:ID
                if (parts.length >= 3 && gameState.questProgressManager) {
                    const action = parts[1]?.toLowerCase();
                    
                    if (action === 'add' && parts.length >= 4) {
                        const name = parts[2];
                        const description = parts.slice(3).join(':').trim();
                        const questId = gameState.questProgressManager.addSideQuest(name, description);
                        log(`Side quest added: ${name} (ID: ${questId})`);
                    } else if (action === 'complete') {
                        const questId = parts[2];
                        const success = gameState.questProgressManager.completeSideQuest(questId);
                        log(`Side quest completion ${success ? 'successful' : 'failed'}: ${questId}`);
                    } else {
                        log(`Warning: Invalid SideQuest action or format: ${commandString}`);
                    }
                } else {
                    log(`Warning: Invalid SideQuest command format: ${commandString}`);
                }
                break;

            case 'secret': // Secret:Text:Category
                if (parts.length >= 2 && gameState.questProgressManager) {
                    const secretText = parts[1];
                    const category = parts[2] || 'general';
                    const secretId = gameState.questProgressManager.addSecret(secretText, category);
                    log(`Secret discovered: ${secretText} (ID: ${secretId})`);
                } else {
                    log(`Warning: Invalid Secret command format: ${commandString}`);
                }
                break;

            // --- Status Effect Commands ---
            case 'status': // Status:Apply:TargetID:EffectName:Duration(:DataKey1=Value1;...)
                 if (parts.length >= 5 && parts[1].toLowerCase() === 'apply') {
                    const statusTargetId = parts[2];
                    const effectName = parts[3];
                    const durationStr = parts[4];
                    const effectDataStr = parts.length > 5 ? parts.slice(5).join(':') : null;
                    const targetStatus = Combat.findCharacterById(statusTargetId);
                    const duration = parseInt(durationStr, 10);

                    if (effectName && targetStatus && !isNaN(duration) && duration > 0) {
                        // Only apply if target is alive
                         if ((targetStatus.id.startsWith('player') && !targetStatus.isDowned) || (targetStatus.id.startsWith('enemy') && !targetStatus.isDefeated)) {
                            let effectData = {};
                            if (effectDataStr) {
                                // Simple key=value;key2=value2 parser
                                effectDataStr.split(';').forEach(pair => {
                                    const [key, value] = pair.split('=');
                                    if (key && value !== undefined) {
                                        const trimmedKey = key.trim();
                                        const trimmedValue = value.trim();
                                        // Basic type inference
                                        if (!isNaN(Number(trimmedValue))) effectData[trimmedKey] = parseFloat(trimmedValue);
                                        else if (trimmedValue.toLowerCase() === 'true') effectData[trimmedKey] = true;
                                        else if (trimmedValue.toLowerCase() === 'false') effectData[trimmedKey] = false;
                                        else effectData[trimmedKey] = trimmedValue; // Store as string otherwise
                                    }
                                });
                            }
                            log(`Applying status effect '${effectName}' to ${targetStatus.name} for ${duration} turns via command. Data: ${JSON.stringify(effectData)}`);
                            Combat.applyStatusEffect(targetStatus, effectName, duration, effectData, 'AI Action');
                            UI.showPopup(`${targetStatus.name} is affected by ${effectName}!`, 'risky');
                         } else {
                             log(`Skipping Status:Apply command for downed/defeated target: ${targetStatus.name}`);
                         }
                    } else {
                         log(`Warning: Invalid Status:Apply command data: Target='${statusTargetId}', Effect='${effectName}', Duration='${durationStr}'. Target found: ${!!targetStatus}, Duration valid: ${!isNaN(duration) && duration > 0}`);
                    }
                 } else {
                      log(`Warning: Invalid Status:Apply command format: ${commandString}`);
                 }
                 break;

            default:
                log(`Warning: Unknown command received: ${commandString}`);
        }
    } catch (error) {
        log(`ERROR processing command "${commandString}":`, error);
    }
}


/**
 * Generates the system prompt based on the current game state.
 * Instructs AI on narrative, commands, and choice generation format.
 * **REVISED: Enhanced choice instructions and added checklist.**
 * @returns {string} The generated system prompt.
 */
/**
 * Phase 3.2: Build a compact, canonical "GAME STATE" block to inject at
 * the very top of the system prompt. The narrator sees this BEFORE any
 * narrative history, so factual contradictions (NPCs reappearing after
 * death, resolved quests still mentioned, items the player no longer
 * has) become much rarer.
 *
 * Capped: 8 NPCs, 5 active quests, 12 story flags. Total cost ~250-450
 * tokens — well worth it for coherence on a 4B model.
 */
function buildCanonicalStateBlock() {
    const p = getCurrentPlayer();
    if (!p) return '';

    const turn = gameState.turn || 1;
    const theme = gameState.adventureTheme || 'unknown';
    const imprisonedTag = gameState.imprisoned ? ' | IMPRISONED' : (gameState.isGoalComplete ? ' | GOD MODE' : '');

    const playerLine = `${p.name}, HP ${p.hp}/${p.maxHp}, Coins ${p.coins ?? 0}`;
    const partyLine = (gameState.players || [])
        .filter(pl => pl && pl !== p)
        .slice(0, 3)
        .map(pl => `${pl.name}:HP${pl.hp}/${pl.maxHp}${pl.isDowned ? '(downed)' : ''}`)
        .join(', ');

    const equipParts = [];
    const equip = p.equipment || {};
    if (equip.weapon) {
        const w = (p.inventory || []).find(it => it && it.id === equip.weapon);
        if (w?.name) equipParts.push(`weapon:${w.name}`);
    }
    if (equip.armor) {
        const a = (p.inventory || []).find(it => it && it.id === equip.armor);
        if (a?.name) equipParts.push(`armor:${a.name}`);
    }
    const equipLine = equipParts.length ? equipParts.join(', ') : 'none';

    // NPCs from entityMemory — most recently seen first, capped.
    const npcs = Object.entries(gameState.entityMemory?.npcs || {})
        .sort(([, a], [, b]) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0))
        .slice(0, 8)
        .map(([name]) => name)
        .join(', ') || 'none recorded';

    // Active quests — main quest stage + side quests + jail if active.
    const activeQuests = [];
    if (gameState.imprisoned) activeQuests.push('jail_escape');
    if (!gameState.isGoalComplete && gameState.adventureGoal) {
        const pct = gameState.questProgress?.completionPercentage ?? 0;
        activeQuests.push(`main(${pct}%)`);
    }
    const sideActive = (gameState.questProgress?.sideQuests || [])
        .filter(q => !q.completed)
        .slice(0, 4)
        .map(q => q.name)
        .join(', ');
    if (sideActive) activeQuests.push(`side:[${sideActive}]`);

    // Story flags — only true ones, capped at 12.
    const flags = Object.entries(gameState.storyFlags || {})
        .filter(([, v]) => v === true)
        .slice(0, 12)
        .map(([k]) => k)
        .join(', ') || 'none';

    // Recent milestones for narrative consistency.
    const recentMilestones = (gameState.questProgress?.milestones || [])
        .slice(-3)
        .map(m => m.name)
        .join(' → ') || 'none yet';

    const location = gameState.currentLocation?.name || 'unknown';

    return `=== GAME STATE — Turn ${turn} | ${theme}${imprisonedTag} ===
Location: ${location}
Player: ${playerLine}
Equipped: ${equipLine}${partyLine ? `
Party: ${partyLine}` : ''}
Active Quests: ${activeQuests.join(', ') || 'none'}
NPCs (most recent): ${npcs}
Story Flags: ${flags}
Recent Milestones: ${recentMilestones}
=== END STATE ===

`;
}

export function generateSystemPrompt() {
    const log = window.displayVisualError || console.log;
    const currentPlayer = getCurrentPlayer();
    // Average all players' ages so the reading level suits the whole party.
    const allAges = (gameState.players || []).map(p => p.age).filter(a => typeof a === 'number' && a > 0);
    const playerAge = allAges.length > 0
        ? Math.round(allAges.reduce((sum, a) => sum + a, 0) / allAges.length)
        : (currentPlayer?.age || 25);

    let g = null;
    try { g = generateNarrativeGuidelines(playerAge); }
    catch (error) { log(`Failed to compute age-appropriate guidelines: ${error.message}`); }

    const tier = playerAge < 10 ? 'L1 child' : playerAge < 15 ? 'L2 tween' : 'L3 teen/adult';
    // Settings toggle (default off): blood/cuts/wounds may be shown, never gore.
    const injuryLine = Config.injuryDetailOn()
        ? ' Injury details are ON in settings: blood, cuts and wounds may be described briefly in fights, but never gory, lingering or gruesome.'
        : '';
    const policy = (injuryLine && playerAge < 15
        ? (playerAge < 10 ? 'No death, romance or slurs. Scary moments resolve quickly; defeated foes flee, fall asleep or vanish.' : 'Exciting fantasy action; defeated foes are knocked out, captured or flee; any death happens off-screen; romance no further than blushing; no slurs.')
        : null) ?? (playerAge < 10
        ? 'No blood, wounds, gore, death, romance or slurs. Show hits by their effect (knocked back, dizzy, a dented shield). Scary moments resolve quickly with reassurance; defeated foes flee, fall asleep or vanish in a puff of light.'
        : playerAge < 15
            ? 'Exciting fantasy action, but no blood, gore or injury detail: show hits by their effect (knocked back, stumbling, a cracked shield), a scrape or bruise at most. Defeated foes are knocked out, captured or flee; any death happens off-screen and tastefully; romance no further than blushing; no slurs.'
            : 'Mature themes allowed in service of the story (loss, moral ambiguity, fantasy violence); no explicit sexual content or gratuitous gore.');

    // Pacing: every field here comes from one place (ageAppropriateReading.js)
    // so the length the narrator is asked for is the same everywhere.
    const reading = g ? `READING LEVEL (average party age ${playerAge}): ${g.bookComparison}.
- Narration: ${g.wordCount.min}-${g.wordCount.max} words in ${g.paragraphCount.min}-${g.paragraphCount.max} short paragraphs. Keep the pace brisk; this is a game turn, not a chapter.
- Style: ${g.characteristics.slice(0, 3).join('; ')}.
- Vocabulary: ${g.contentGuidelines.vocabulary.description}.` : `READING LEVEL (average party age ${playerAge}): clear, vivid prose, 120-200 words.`;

    const parts = [buildCanonicalStateBlock()];
    parts.push(`You are the storyteller of a turn-based text adventure for ${heroCountLine()} Each turn, continue the story from the chosen action and set up the next decision. Make it fun: surprises, humor, vivid details, NPCs with personality, and consequences that clearly follow from what the players chose. Stay in the story; never mention being an AI.

${reading}

CONTENT POLICY (${tier}): ${policy}${injuryLine} If players ask for something off-policy, the world declines in-character.`);

    if (gameState.questProgressManager && !gameState.isGoalComplete) {
        try {
            const guidance = gameState.questProgressManager.generateAIGuidance();
            const s = gameState.questProgressManager.getProgressSummary();
            parts.push(`QUEST PACE: phase ${s.phase} (${s.percentage}% complete), urgency ${guidance.urgency}. Direction: ${guidance.storyDirection}${s.activeObjectives?.length ? ` Active objectives: ${s.activeObjectives.join(', ')}.` : ''}`);
        } catch (e) { log(`Quest guidance unavailable: ${e.message}`); }
    }

    parts.push(`THEME: ${gameState.adventureTheme}${gameState.customThemeDescription ? ` (${gameState.customThemeDescription})` : ''}. ${getThemeSpecificGuidance(gameState.adventureTheme)}
Atmosphere: ${getThemeAtmosphere(gameState.adventureTheme)}
Typical interactions: ${getThemeInteractions(gameState.adventureTheme)}
Use names, people, places and props native to this theme (no village elders in cyberpunk, no libraries in dinosaur times). Avoid over-used names: Sunken Library, Heart of Shadow/Darkness, Shadow Blight, Whispering Woods/Cove, anything 'Salty', the Ancient Evil, the Chosen One.${usedNamesLine()}`);

    if (gameState.storyHook && (gameState.turn || 0) <= 3) {
        parts.push(`STORY HOOK FOR THIS RUN: build the opening on the "${gameState.storyHook.archetype}" archetype${gameState.storyHook.motif ? ` with the twist "${gameState.storyHook.motif}"` : ''}, using your own new people, places and details.`);
    }
    if (gameState.storyVariation?.narrativeElements) {
        const v = gameState.storyVariation.narrativeElements;
        parts.push(`STORY THREADS: setting ${v.setting}; conflict ${v.conflict}; mystery ${v.mystery}; urgency ${v.urgency}; mood ${v.atmosphericElement}.`);
    }
    if (gameState.adventureGoal) parts.push(`CURRENT GOAL: ${gameState.adventureGoal}`);

    const context = determineContext(currentPlayer);
    let scene = `SCENE: ${context.situation}; ${context.environment}; ${context.timeOfDay}; weather ${context.weather} (interpret for the setting: indoors or in space it means the conditions there).`;
    if (currentPlayer) {
        const moves = (currentPlayer.specialMoves || []).map(m => m.name).filter(Boolean);
        const status = (currentPlayer.statusEffects || []).map(s => s.name).filter(Boolean);
        scene += `\nACTING HERO: ${currentPlayer.name}, ATK ${currentPlayer.atk}, DEF ${currentPlayer.def}${status.length ? `, status: ${status.join(', ')}` : ''}${moves.length ? `, special moves: ${moves.join(', ')}` : ''}.`;
    }
    if (gameState.inCombat) {
        const foes = (gameState.enemies || []).filter(e => !e.isDefeated);
        scene += `\nCOMBAT: threat ${context.combatState.threatLevel}, position ${context.combatState.tacticalAdvantage}, hero ${context.combatState.playerCondition}. Enemies: ${foes.map(e => `${e.name} (HP ${e.hp}/${e.maxHp}${e.statusEffects?.length ? `, ${e.statusEffects.map(s => s.name).join('/')}` : ''})`).join(', ')}.`;
    }
    parts.push(scene);

    // Faction standing: only factions that have moved, one line each.
    const reps = Object.entries(gameState.reputationSystem?.factions || {}).filter(([, v]) => Math.abs(v) >= 5);
    if (reps.length) {
        parts.push(`FACTION STANDING (shapes how their people treat the heroes): ${reps.map(([f, v]) => `${f} ${v}`).join(', ')}. When a choice clearly helps or hurts a faction, replace /reputationSystem/factions/<name> (about ±5).`);
    }

    // Relevant long-term memory and the main-quest stage (milestone names live there).
    const memoryQuery = (gameState.currentNarrative || '') + ' ' + (gameState.currentLocation?.name || '');
    return parts.join('\n\n') + renderMemoryBlock(memoryQuery) + buildQuestStageHint(gameState);
}

/**
 * Asynchronously refresh BOTH the rolling arc summary AND the entity memory
 * (Tier 3 hierarchical memory). One LLM round-trip via JSON schema produces:
 *   - a 1-2 sentence summary of the recent stretch
 *   - newly-introduced or significantly-changed NPCs / locations / items
 *
 * Called from makeAICallForSystemAction after each successful turn; only
 * invokes the model when the current turn has crossed the next-summary
 * boundary. Does NOT block the player — failures are logged and ignored.
 *
 * The summary feeds gameState.arcMemory.summaries; entity entries merge
 * into gameState.entityMemory keyed by name, with LRU eviction past the
 * per-category cap. Both data structures persist in the save file.
 */
/** Existing key in an entityMemory bucket that names the same thing, or null. */
export function findEntityKey(bucket, name) {
    const norm = (n) => String(n || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const target = norm(name);
    if (!target) return null;
    return Object.keys(bucket || {}).find(k => norm(k) === target) ?? null;
}

export async function refreshArcMemory() {
    const log = window.displayVisualError || console.log;
    if (!gameState.arcMemory) {
        gameState.arcMemory = { summaries: [], nextSummaryAtTurn: Config.SUMMARY_EVERY_N_TURNS };
    }
    if (!gameState.entityMemory) {
        gameState.entityMemory = { npcs: {}, locations: {}, items: {} };
    }
    if (gameState.turn < gameState.arcMemory.nextSummaryAtTurn) return;

    const lastSummaryTurn = gameState.arcMemory.summaries.length > 0
        ? gameState.arcMemory.summaries[gameState.arcMemory.summaries.length - 1].turn
        : 0;

    // Pull the recent narrative window since the last summary.
    // Narration per turn, capped per entry so every turn since the last
    // summary is represented. The old .slice(-3500) over full prompts kept
    // only the last ~2.5 turns, starting mid-word.
    const turnsSince = (gameState.messageHistory || []).filter(m => (m.turn || 0) > lastSummaryTurn).slice(-10);
    const recentWindow = [
        ...(gameState.recentTurns || []).slice(-Math.max(turnsSince.length, 1)),
        '',
        ...turnsSince.map(m => `Turn ${m.turn}: ${String(m.response || '').slice(0, 450)}`)
    ].join('\n');

    if (!recentWindow.trim()) {
        gameState.arcMemory.nextSummaryAtTurn = gameState.turn + Config.SUMMARY_EVERY_N_TURNS;
        return;
    }

    try {
        const payload = await API.getAIResponseJSON(
            [
                { role: 'system', content: 'You are an editor distilling a tabletop adventure transcript. Output ONLY a JSON object — no prose, no commentary. Use the EXACT field names below. Names should be specific (e.g. "Mira" not "the player"). ' },
                { role: 'user', content:
`Summarize turns ${lastSummaryTurn + 1}-${gameState.turn} and extract any new named entities. Already known (reuse these exact names, do not rename or re-list them): ${['npcs', 'locations', 'items'].map(c => Object.keys(gameState.entityMemory?.[c] || {}).join(', ')).filter(Boolean).join('; ') || 'none'}. Respond with ONLY this JSON shape (use empty arrays where nothing applies):

{
  "summary": "1-2 sentences capturing WHO did WHAT and the LASTING CONSEQUENCE.",
  "newNpcs":     [{"name": "...", "description": "..."}],
  "newLocations":[{"name": "...", "description": "..."}],
  "newItems":    [{"name": "...", "description": "..."}]
}

Transcript:
${recentWindow}` }
            ],
            arcMemorySchema,
            { jsonSchemaName: 'arc_memory', max_tokens: 800, temperature: 0.4 }
        );
        const result = validateArcMemoryPayload(payload);

        // Append the summary entry.
        gameState.arcMemory.summaries.push({
            // Last turn actually covered: turns are logged before the turn
            // counter advances, so recording gameState.turn skipped every 5th
            // turn from long-term memory (5, 10, 15...).
            turn: Math.max(lastSummaryTurn, ...turnsSince.map(m => m.turn || 0)),
            summary: result.summary,
            generatedAt: Date.now()
        });
        if (gameState.arcMemory.summaries.length > Config.MEMORY_MAX_SUMMARIES) {
            gameState.arcMemory.summaries = gameState.arcMemory.summaries.slice(-Config.MEMORY_MAX_SUMMARIES);
        }

        // Merge entities. New entries record firstSeenTurn; existing entries
        // get their description refreshed and lastSeenTurn bumped.
        const mergeEntities = (bucket, fresh) => {
            for (const e of fresh) {
                // Match loosely so "the Grand Foyer" / "Grand foyer" update the
                // existing entry instead of becoming a second place.
                const existing = bucket[findEntityKey(bucket, e.name) ?? e.name];
                if (existing) {
                    existing.description = e.description;
                    existing.lastSeenTurn = gameState.turn;
                } else {
                    bucket[e.name] = {
                        description: e.description,
                        firstSeenTurn: gameState.turn,
                        lastSeenTurn: gameState.turn
                    };
                }
            }
            // LRU evict if over the cap.
            const cap = Config.ENTITY_MEMORY_MAX_PER_CATEGORY;
            const entries = Object.entries(bucket);
            if (entries.length > cap) {
                entries.sort(([, a], [, b]) => (b.lastSeenTurn || 0) - (a.lastSeenTurn || 0));
                for (const [name] of entries.slice(cap)) delete bucket[name];
            }
        };
        mergeEntities(gameState.entityMemory.npcs, result.newNpcs);
        mergeEntities(gameState.entityMemory.locations, result.newLocations);
        mergeEntities(gameState.entityMemory.items, result.newItems);

        log(`ArcMemory: stored summary at turn ${gameState.turn} (${result.summary.length} chars; +${result.newNpcs.length} NPCs, +${result.newLocations.length} locs, +${result.newItems.length} items).`);
        gameState.arcMemory.nextSummaryAtTurn = gameState.turn + Config.SUMMARY_EVERY_N_TURNS;
    } catch (err) {
        // Retry on the next turn instead of waiting another full interval.
        gameState.arcMemory.nextSummaryAtTurn = gameState.turn + 1;
        log(`ArcMemory: refresh failed (${err.message}); retrying next turn.`);
    }
}


export function getThemeName() {
    const log = window.displayVisualError || console.log; // Use logger
    if (gameState.adventureTheme === 'custom') {
        return gameState.customThemeDescription || 'Custom Adventure';
    }
    const selectElement = UI.elements.adventureTypeSelect;
    if (selectElement) {
        const option = selectElement.querySelector(`option[value="${gameState.adventureTheme}"]`);
        if (option) { return option.textContent; }
        else { log(`Warning: Could not find theme name for value '${gameState.adventureTheme}' in select list.`); }
    } else { log("Warning: Adventure type select element not found for getting theme name."); }
    // Fallback
    return gameState.adventureTheme || 'Adventure';
}


/**
 * Handles errors during API calls. Shows popup and offers recovery choices.
 * @param {Error} error - The error object.
 */
export function handleApiError(error) {
    const log = window.displayVisualError || console.log; // Use logger
    // Needs gameState, UI, makeAICallForSystemAction (imported statically)
    log("AI API Call Error in AI Handler:", error);
    const errorMessage = error.message || "An unknown error occurred.";
    UI.showPopup(`AI Error: ${errorMessage}`, 'error', 8000);

    const recoveryChoices = [];
    const recoveryHandlers = {};

    // Option 1: Try to Continue (Tell AI what happened)
    const continueText = "Try to Continue (Tell AI what happened)";
    recoveryChoices.push(continueText);
    recoveryHandlers[continueText] = async () => { // Make handler async
        log("Attempting recovery: Try to Continue...");
        UI.showLoading(true, 'Trying to continue...');
        const continuePrompt = "[System Action: The previous AI interaction failed unexpectedly. Describe the current situation based on game state and provide 5 appropriate choices using the [Type=TYPE] format.]";
        try {
            // Call AI but prevent turn advance as we are recovering state, not performing a new action
            await makeAICallForSystemAction(continuePrompt, true);
        } catch (continueError) {
            log(`Error during 'Try to Continue' AI call: ${continueError.message}`);
            // Re-call handleApiError to show options again if continue fails
            handleApiError(continueError); // Pass the new error
        } finally {
            UI.showLoading(false);
        }
    };

    // Option 2: Simple Retry Last Action
    const lastUserMessage = gameState.messageHistory?.findLast(m => m.role === 'user');
    if (lastUserMessage) {
        const retryText = "Retry Last Action";
        recoveryChoices.push(retryText);
        recoveryHandlers[retryText] = async () => {
             log("Attempting recovery: Retry Last Action...");
             if (gameState.isLoading) { log("Retry blocked: Still loading."); return; } // Prevent overlapping retries

             UI.showLoading(true, 'Retrying last action...');
             const userMsgIndex = gameState.messageHistory.findLastIndex(m => m.role === 'user' && m.content === lastUserMessage.content);

             // Roll back history *before* the failed user action and the assumed failed assistant response
             if (userMsgIndex !== -1) {
                  // Remove the failed user action and any subsequent messages (likely the error placeholder/failed response)
                  gameState.messageHistory.length = userMsgIndex;
                  log(`Rolled back history to before last user message (index ${userMsgIndex}) for retry.`);
             } else {
                  // If user message not found (shouldn't happen often), just pop last if it was assistant
                  if(gameState.messageHistory.length > 0 && gameState.messageHistory[gameState.messageHistory.length - 1].role === 'assistant') { gameState.messageHistory.pop(); }
                  log("Warning: Could not precisely find last user message in history for retry rollback. Attempting basic rollback.");
             }

             try {
                // Re-call makeAICallForSystemAction with the original user prompt content
                // Assume the original action did NOT prevent turn advance unless we store that info somewhere (complex)
                const originalActionPreventedTurn = false;
                await makeAICallForSystemAction(lastUserMessage.content, originalActionPreventedTurn);
                log("Retry action sent to AI successfully.");
            } catch (retryError) {
                log(`Error during retry AI call: ${retryError.message}`);
                // Ensure the user message is back in history if the retry itself fails, so next retry works
                if (!gameState.messageHistory.findLast(m => m.role === 'user' && m.content === lastUserMessage.content)) {
                     gameState.messageHistory.push(lastUserMessage);
                }
                // The error from makeAICallForSystemAction will bubble up and call handleApiError again
            } finally {
                UI.showLoading(false); // Hide loading indicator after retry attempt
            }
        };
    }

    // Option 3: Check API Key
    const checkApiKeyText = "Check/Update API Key(s)";
    recoveryChoices.push(checkApiKeyText);
    recoveryHandlers[checkApiKeyText] = () => {
        log("Navigating to API Key screen from error recovery.");
        UI.showScreen('apiKeyScreen');
    };

    log("Rendering recovery choices:", recoveryChoices);
    // Use UI.renderChoices with the handlers map
    UI.renderChoices(recoveryChoices, recoveryHandlers);

    // Ensure loading is off *before* showing recovery choices
    UI.showLoading(false);
    UI.updateQuickActions(); // Enable quick actions if they were disabled by loading
}


/**
 * Prunes the message history to stay within token limits.
 * Ensures the system prompt is always present and up-to-date.
 * @param {object[]} history - The current message history array.
 * @returns {object[]} The pruned message history.
 */
export function pruneMessageHistory(history) {
    const log = window.displayVisualError || console.log; // Use logger
    if (!Array.isArray(history)) {
        log("Warning: Pruning called with invalid history.");
        return [{ role: 'system', content: generateSystemPrompt() }]; // Return default with system prompt
    }

    // Use context manager for local AI
    const isLocalAI = gameState.apiProvider === 'local' || !gameState.apiProvider;
    
    if (isLocalAI) {
        return contextManager.compressHistoryIntelligently();
    }

    // The legacy non-local code path is unreachable today (apiProvider is
    // always 'local'), but the rest of pruneMessageHistory is kept as a safe
    // fallback if some future call sets isLocalAI=false. Use the top-level
    // Config.MAX_HISTORY_LENGTH for the trim window — Config.MODEL_CONFIGS
    // never existed in the current codebase (Tier 2 audit found the typo).
    const maxHistoryLength = Config.MAX_HISTORY_LENGTH;
    const maxMessages = maxHistoryLength * 2;
    const systemPromptContent = generateSystemPrompt(); // Always generate fresh system prompt
    let systemPrompt = { role: 'system', content: systemPromptContent };
    let conversation = [];

    // Separate existing system prompt (if any) from conversation
    if (history.length > 0 && history[0]?.role === 'system') {
        conversation = history.slice(1);
    } else {
        if (history.length > 0) {
            log("Warning: System prompt not found at the beginning of history during pruning. Will prepend.");
        }
        conversation = history; // Treat entire history as conversation if no system prompt found
    }

    // Calculate how many messages to keep (including the system prompt)
    const totalMessagesAllowed = maxMessages + 1; // +1 for system prompt

    if (history.length <= totalMessagesAllowed) {
        // History is within limits, just ensure system prompt is up-to-date
        let currentHistory = [...history];
        if(currentHistory.length > 0 && currentHistory[0]?.role === 'system') {
             currentHistory[0].content = systemPrompt.content; // Update existing
        } else {
             currentHistory.unshift(systemPrompt); // Prepend if missing
        }
        return currentHistory;
    }

    // History exceeds limits, prune conversation part
    log(`Pruning message history from ${history.length} messages to ~${totalMessagesAllowed}.`);
    // Keep the latest 'maxMessages' conversation messages
    const conversationToKeep = conversation.slice(-maxMessages);
    // Combine the updated system prompt with the pruned conversation
    const pruned = [systemPrompt, ...conversationToKeep];
    log(`History pruned to ${pruned.length} messages.`);
    return pruned;
}


/**
 * Makes an AI call for system actions and processes the response
 * @param {string} prompt - The prompt to send to the AI
 * @param {boolean} preventTurnAdvance - Whether to prevent turn advancement after the action
 * @returns {Promise<{narrative: string, choices: Array}>} The processed narrative and choices
 */
export async function makeAICallForSystemAction(prompt, preventTurnAdvance = false) {
    const log = window.displayVisualError || console.log;
    log(`Making AI call. PreventTurnAdvance: ${preventTurnAdvance}. Prompt: "${(prompt || '').substring(0, 50)}..."`);

    // Expand the 'start_adventure' magic-string into a real intro prompt
    // so processAIResponse's intro detector (which looks for "Please provide
    // a rich, detailed story introduction in three parts") fires correctly.
    if (prompt === 'start_adventure') {
        const playerNames = gameState.players.map(p => p.name).join(', ') || 'an Adventurer';
        const themeName = gameState.adventureTheme || 'fantasy';
        const customDesc = gameState.customThemeDescription || '';
        const themeBlurb = themeName === 'custom' && customDesc
            ? `custom (${customDesc})`
            : themeName;

        // Phase 3.5 follow-on: inject the per-run STORY HOOK so each new
        // game opens with a different inciting incident, and the narrator
        // can't fall back to over-trained tropes. Hook was picked at
        // game-init in initializationManager.js.
        let hookBlock = '';
        try {
            const { describeHookForPrompt } = await import('./storyHooks.js');
            hookBlock = describeHookForPrompt(gameState.storyHook);
        } catch (_) { /* graceful: if storyHooks isn't loaded yet, fall back to generic intro */ }

        prompt = `Please provide a rich, detailed story introduction in three parts for the start of a new ${themeBlurb} adventure starring ${playerNames}.

Part 1: vivid scene-setting paragraph establishing the world, mood, and immediate location. USE VOCABULARY NATIVE TO THE THEME (a dinosaur story talks of tar pits and migrations, a space story of habitats and transponders). Pick your own words; do not open with the same images every game. Avoid generic-fantasy phrasing in non-fantasy themes.
Part 2: introduce the player character(s) — their situation right now and what makes this moment a turning point. Anchor names and props to the theme.
Part 3: the inciting incident follows the hook's archetype and twist below, told with your own invented details (its example is for flavor only; do not copy it).${hookBlock}

This opening may run up to half again the READING LEVEL length. Third person, like every turn. Avoid the over-used names listed under THEME. In "ops", replace /currentLocation with the named place where the story opens and add it under /entityMemory/locations.`;
    }

    // Who picks from the choices this call produces: the same hero when the
    // turn will not advance (intro, combat rounds), otherwise the next
    // conscious player. Choices used to be written for the hero who just acted.
    const players = gameState.players || [];
    let nextIdx = gameState.currentPlayerIndex || 0;
    if (!preventTurnAdvance && !gameState.inCombat && players.length > 1) {
        for (let step = 1; step <= players.length; step++) {
            const i = (nextIdx + step) % players.length;
            if (players[i] && !players[i].isDowned) { nextIdx = i; break; }
        }
    }
    gameState.nextActorIndex = nextIdx;

    try {
        const response = await processAIResponse(prompt);
        
        if (!response || typeof response !== 'object') {
            throw new Error('Invalid response from processAIResponse');
        }

        const { narrative, choices } = response;

        if (!narrative || typeof narrative !== 'string') {
            throw new Error('Invalid narrative in AI response');
        }

        if (!choices || !Array.isArray(choices) || choices.length === 0) {
            throw new Error('Invalid choices in AI response');
        }

        // Update message history
        const historyEntry = {
            type: 'action',
            content: prompt,
            response: narrative,
            turn: gameState.turn
        };

        if (!gameState.messageHistory) {
            gameState.messageHistory = [];
        }

        gameState.messageHistory.push(historyEntry);
        pruneMessageHistory(gameState.messageHistory);

        // One line per turn for the RECENT TURNS block and arc summaries:
        // the model used to see only the last scene.
        const meta = gameState.lastActionMeta;
        if (meta && prompt !== 'start_adventure') {
            const firstSentence = (narrative.match(/^[^.!?]*[.!?]/) || [narrative.slice(0, 160)])[0].trim();
            gameState.recentTurns = [...(gameState.recentTurns || []),
                `T${gameState.turn} ${meta.actor}: ${meta.action} -> ${meta.success ? 'worked' : 'went wrong'}${meta.notes ? ` (${meta.notes})` : ''}. ${firstSentence}`].slice(-12);
            gameState.lastActionMeta = null;
        }

        // processAIResponse already rendered narrative + choices; just sync state.
        gameState.currentChoices = choices;

        // Handle turn advancement if not prevented. advanceTurn is async —
        // await it so the turn counter is up-to-date before the arc-memory
        // refresh below decides whether to fire its summary call.
        if (!preventTurnAdvance && !gameState.inCombat) {
            await advanceTurn();
        }

        log("AI Call Wrapper finished successfully.");

        // Tier 3 hierarchical memory: kick off a non-blocking arc-memory
        // refresh after each successful turn. The summary call only fires
        // when the turn crosses the SUMMARY_EVERY_N_TURNS boundary, so this
        // is cheap on most turns.
        // BUG-28 fix: dedupe in-flight refreshes. Two consecutive turns
        // could each trigger a refresh and the older summary could resolve
        // last, overwriting the newer one. Stash the in-flight Promise on
        // gameState; if one is running, skip launching another.
        if (!gameState._arcMemoryRefreshInFlight) {
            gameState._arcMemoryRefreshInFlight = Promise.resolve()
                .then(() => refreshArcMemory())
                .catch(e => log(`ArcMemory dispatch failed: ${e.message}`))
                .finally(() => { gameState._arcMemoryRefreshInFlight = null; });
        }

        return { narrative, choices };

    } catch (error) {
        log(`Error in makeAICallForSystemAction: ${error.message}`);
        // Preserve the narrative if the first AI call (story generation) already
        // succeeded and set gameState.currentNarrative — only choices failed.
        // Falling back to "The story continues..." here would overwrite real prose
        // that was already rendered to the DOM by processAIResponse.
        const defaultNarrative = gameState.currentNarrative || "The story continues...";
        // Say what went wrong (quota, bad key, network) instead of quietly
        // swapping in stock choices, and put the previous choices back so the
        // player can simply try again. The turn does not advance.
        UI.showPopup(`The storyteller couldn't answer: ${error.message}`, 'error');
        const previous = Array.isArray(gameState.currentChoices) && gameState.currentChoices.length
            ? gameState.currentChoices : null;
        const defaultChoices = previous || validateAndFixChoices([], gameState.inCombat);

        UI.renderChoices(defaultChoices);
        gameState.currentChoices = defaultChoices;

        return {
            narrative: defaultNarrative,
            choices: defaultChoices
        };
    }
}

/**
 * Finds a character (player or enemy) by their ID. Helper function.
 * @param {string} id - The ID of the character.
 * @returns {Player | Enemy | null} The found character or null.
 */

/**
 * Gets theme-specific guidance for storytelling
 * @param {string} theme - The current adventure theme
 * @returns {string} Theme-specific guidance text
 */
function getThemeSpecificGuidance(theme) {
    switch(theme?.toLowerCase()) {
        case 'fantasy':
            return "Focus on magic, mythical creatures, and epic quests. Include elements of traditional fantasy like magical artifacts, ancient prophecies, and mystical powers.";
        case 'space':
            return "Emphasize advanced technology, alien encounters, and space exploration. Include elements like spacecraft, distant planets, and futuristic gadgets.";
        case 'pirate':
            return "Focus on seafaring adventures, treasure hunting, and naval combat. Include elements like ships, islands, sea monsters, and buried treasure.";
        case 'steampunk':
            return "Blend Victorian aesthetics with steam-powered technology. Include brass and copper machinery, clockwork devices, and steam-powered inventions.";
        case 'cyberpunk':
            return "Focus on high tech and low life themes. Include advanced computers, cybernetic enhancements, megacorporations, and digital worlds.";
        case 'western':
            return "Emphasize frontier life and wild west themes. Include elements like dusty towns, outlaws, sheriffs, and frontier justice.";
        case 'underwater':
            return "Focus on deep-sea exploration and aquatic adventures. Include sea creatures, underwater cities, and oceanic mysteries.";
        case 'post-apocalyptic':
            return "Emphasize survival in a ruined world. Include scavenging, dangerous wastelands, and remnants of the old world.";
        default:
            return "Focus on creating an engaging and consistent narrative that fits the chosen theme.";
    }
}

/**
 * Gets theme-specific atmosphere descriptions
 * @param {string} theme - The current adventure theme
 * @returns {string} Theme atmosphere description
 */
function getThemeAtmosphere(theme) {
    switch(theme?.toLowerCase()) {
        case 'fantasy':
            return "ATMOSPHERE:\n- Mood: Mystical and wondrous\n- Colors: Rich jewel tones, magical glows\n- Sounds: Mystical chimes, rustling leaves\n- Aromas: Fresh herbs, ancient tomes";
        case 'space':
            return "ATMOSPHERE:\n- Mood: Vast and mysterious\n- Colors: Deep blacks, starlight, nebula colors\n- Sounds: Engine hums, airlock seals\n- Aromas: Recycled air, metal";
        case 'pirate':
            return "ATMOSPHERE:\n- Mood: Adventurous and dangerous\n- Colors: Ocean blues, weathered woods\n- Sounds: Waves, creaking ships\n- Aromas: Sea salt, rum";
        case 'steampunk':
            return "ATMOSPHERE:\n- Mood: Industrial and innovative\n- Colors: Brass, copper, steam\n- Sounds: Clockwork, steam releases\n- Aromas: Oil, metal, coal";
        case 'cyberpunk':
            return "ATMOSPHERE:\n- Mood: Gritty and high-tech\n- Colors: Neon lights, dark alleys\n- Sounds: Electronic beats, city noise\n- Aromas: Ozone, street food";
        case 'western':
            return "ATMOSPHERE:\n- Mood: Rugged and lawless\n- Colors: Desert browns, sunset oranges\n- Sounds: Wind, horse hooves\n- Aromas: Dust, leather";
        case 'underwater':
            return "ATMOSPHERE:\n- Mood: Mysterious and serene\n- Colors: Ocean blues, bioluminescence\n- Sounds: Water currents, bubbles\n- Aromas: Salt water, marine life";
        case 'post-apocalyptic':
            return "ATMOSPHERE:\n- Mood: Desolate and desperate\n- Colors: Rust, decay, dust\n- Sounds: Wind through ruins, distant dangers\n- Aromas: Dust, decay";
        default:
            return "ATMOSPHERE:\n- Mood: Match theme atmosphere\n- Colors: Theme appropriate\n- Sounds: Contextual ambiance\n- Aromas: Setting-specific scents";
    }
}

/**
 * Gets theme-specific interaction guidance
 * @param {string} theme - The current adventure theme
 * @returns {string} Theme interaction guidance
 */
function getThemeInteractions(theme) {
    switch(theme?.toLowerCase()) {
        case 'fantasy':
            return "INTERACTIONS:\n- Skills: Magic, swordsmanship, lore\n- Social: Noble courts, magical guilds\n- Environment: Enchanted forests, ancient ruins\n- Combat: Magic spells, mythical creatures";
        case 'space':
            return "INTERACTIONS:\n- Skills: Piloting, tech use, xenobiology\n- Social: Alien diplomacy, crew dynamics\n- Environment: Zero gravity, hostile planets\n- Combat: Energy weapons, space battles";
        case 'pirate':
            return "INTERACTIONS:\n- Skills: Navigation, sword fighting, negotiation\n- Social: Crew loyalty, port dealings\n- Environment: Ships, tropical islands\n- Combat: Naval battles, boarding actions";
        case 'steampunk':
            return "INTERACTIONS:\n- Skills: Engineering, invention, mechanics\n- Social: Inventor guilds, aristocracy\n- Environment: Industrial cities, workshops\n- Combat: Steam-powered weapons, gadgets";
        case 'cyberpunk':
            return "INTERACTIONS:\n- Skills: Hacking, tech implants, street smarts\n- Social: Corporate intrigue, street gangs\n- Environment: Megacities, virtual reality\n- Combat: Cyber-enhanced combat, hacking";
        case 'western':
            return "INTERACTIONS:\n- Skills: Shooting, riding, survival\n- Social: Town politics, outlaw gangs\n- Environment: Desert, frontier towns\n- Combat: Gunfights, horseback combat";
        case 'underwater':
            return "INTERACTIONS:\n- Skills: Swimming, pressure adaptation, marine knowledge\n- Social: Underwater colonies, sea creatures\n- Environment: Ocean depths, coral cities\n- Combat: Underwater weapons, sea creatures";
        case 'post-apocalyptic':
            return "INTERACTIONS:\n- Skills: Survival, scavenging, adaptation\n- Social: Survivor groups, wasteland traders\n- Environment: Ruins, radioactive zones\n- Combat: Makeshift weapons, survival gear";
        default:
            return "INTERACTIONS:\n- Skills: Theme-appropriate abilities\n- Social: Context-specific relations\n- Environment: Theme-specific challenges\n- Combat: Setting-appropriate conflict";
    }
}
