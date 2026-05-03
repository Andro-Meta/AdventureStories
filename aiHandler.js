// aiHandler.js
// Handles AI communication, prompt generation, response processing, and command execution.

// --- Static Imports ---
import { gameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as API from './api_new.js?cb=014';
import { getChoiceSchema, validateChoicesPayload, arcMemorySchema, validateArcMemoryPayload, narrativeTurnSchema, validateNarrativeTurnPayload, EXPLORATION_CHOICE_TYPES, COMBAT_CHOICE_TYPES } from './schemas.js?cb=014';
import { applyDiff, describeAllowedPaths } from './engine.js?cb=014';
import { renderMemoryBlock } from './memoryRetriever.js?cb=014';
import { buildQuestStageHint } from './questDefinitions.js?cb=014';
import { generateNarrativeGuidelines } from './ageAppropriateReading.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Items from './items.js?cb=014';
import { generateId, clamp } from './utils.js?cb=014';
// Import turn manager functions statically
import { advanceTurn } from './turnManager.js?cb=014';
import { getCurrentPlayer, canCurrentPlayerAct } from './state.js?cb=014';
// Import location system
import { getCurrentLocationContext } from './locations.js?cb=014';
// Import resolution functions statically
import { handleGoalCompletionRewards } from './resolution.js?cb=014';
import { determineContext } from './state.js?cb=014';
// Import context management (using local AI orchestration)
import { contextManager } from './contextManager.js?cb=014';
// Import reputation system
import { getContextualizedFactions, getTrustDifficultyModifiers } from './reputationContextualizer.js?cb=014';
import { dynamicChoiceGenerator } from './dynamicChoices.js?cb=014';
import { localAIOrchestrator } from './localAIOrchestrator.js?cb=014';
// Note: Intelligent compression recording is handled in actionHandler.js

// FALLBACK FUNCTION REMOVED - AI must work correctly or fail clearly

/**
 * Enhanced AI processing using Local AI Orchestrator for complex requests
 * @param {string} prompt - The initial prompt
 * @param {string} requestType - Type of request (story_generation, encounter_creation, etc.)
 * @param {object} context - Additional context for the request
 * @returns {Promise<{narrative: string, choices: Array, metadata: object}>} Enhanced AI response
 */
export async function processEnhancedAIResponse(prompt, requestType = 'story_generation', context = {}) {
    const log = window.displayVisualError || console.log;
    log(`Processing enhanced AI response for ${requestType}...`);

    try {
        // Determine if this request should use multi-agent orchestration
        const shouldUseOrchestrator = shouldUseMultiAgentOrchestration(requestType, context);
        
        if (shouldUseOrchestrator) {
            log('Using multi-agent orchestration for enhanced processing...');
            
            // Use the orchestrator for complex, multi-faceted requests
            const orchestratedResult = await localAIOrchestrator.orchestrateAgents(
                requestType, 
                { ...context, originalPrompt: prompt },
                getRequiredCapabilities(requestType, context)
            );
            
            // Process orchestrated result into narrative and choices
            const processedResult = await processOrchestratedResult(orchestratedResult, requestType);
            
            return {
                narrative: processedResult.narrative,
                choices: processedResult.choices,
                metadata: {
                    orchestrated: true,
                    agentContributions: orchestratedResult.metadata.agentContributions,
                    confidenceScore: orchestratedResult.metadata.confidenceScore,
                    qualityScore: orchestratedResult.metadata.qualityScore,
                    processingTime: orchestratedResult.metadata.processingTime
                }
            };
        } else {
            log('Using standard AI processing for simple request...');
            // Fall back to standard processing for simple requests
            return await processAIResponse(prompt);
        }
        
    } catch (error) {
        log(`Enhanced AI processing failed: ${error.message}, falling back to standard processing`);
        // Graceful degradation to standard processing
        const fallbackResult = await processAIResponse(prompt);
        return {
            ...fallbackResult,
            metadata: {
                orchestrated: false,
                fallbackUsed: true,
                originalError: error.message
            }
        };
    }
}

/**
 * Determine if request should use multi-agent orchestration
 */
function shouldUseMultiAgentOrchestration(requestType, context) {
    // Use orchestration for complex requests
    const complexRequestTypes = [
        'comprehensive_response',
        'encounter_creation',
        'location_creation',
        'quest_progression'
    ];
    
    // Use orchestration if explicitly requested
    if (context.useOrchestration) return true;
    
    // Use orchestration for complex request types
    if (complexRequestTypes.includes(requestType)) return true;
    
    // Use orchestration if multiple capabilities are needed
    if (context.needsMultipleAgents) return true;
    
    // Use orchestration for story generation with special requirements
    if (requestType === 'story_generation' && (
        context.includeEncounters || 
        context.includeItems || 
        context.trackProgress ||
        context.needsAbilities
    )) return true;
    
    return false;
}

/**
 * Get required capabilities for request type
 */
function getRequiredCapabilities(requestType, context) {
    const capabilities = [];
    
    // Add capabilities based on context
    if (context.includeEncounters) capabilities.push('encounter_design', 'npc_generation');
    if (context.includeItems) capabilities.push('item_generation', 'contextual_items');
    if (context.needsAbilities) capabilities.push('spell_generation', 'ability_adaptation');
    if (context.needsEnemies) capabilities.push('enemy_generation', 'combat_design');
    if (context.needsLocations) capabilities.push('location_generation', 'environment_design');
    if (context.trackProgress) capabilities.push('progress_tracking', 'milestone_detection');
    
    return capabilities;
}

/**
 * Process orchestrated result into narrative and choices format
 */
async function processOrchestratedResult(orchestratedResult, requestType) {
    const log = window.displayVisualError || console.log;
    
    try {
        const result = orchestratedResult.result;
        
        // Extract narrative from orchestrated result
        let narrative = typeof result === 'string' ? result : 
                       (result.narrative || result.story || result.response || String(result));
        
        // Ensure narrative is a string
        if (typeof narrative !== 'string') {
            narrative = 'The adventure continues...';
        }
        
        // Generate choices using the dynamic choice generator with orchestrated context
        const choiceContext = {
            narrative: narrative,
            requestType: requestType,
            agentContributions: orchestratedResult.metadata?.agentContributions || [],
            qualityScore: orchestratedResult.metadata?.qualityScore || 0.5
        };
        
        const choices = await dynamicChoiceGenerator.generateContextualChoices(choiceContext);
        
        return {
            narrative: narrative,
            choices: choices || []
        };
        
    } catch (error) {
        log(`Error processing orchestrated result: ${error.message}`);
        
        // Fallback processing
        const fallbackNarrative = typeof orchestratedResult.result === 'string' ? 
                                  orchestratedResult.result : 'The adventure continues...';
        
        return {
            narrative: fallbackNarrative,
            choices: []
        };
    }
}

/**
 * Processes the story generation and choice creation using separate AI agents
 * @param {string} prompt - The initial prompt to generate the story
 * @returns {Promise<{narrative: string, choices: Array}>} The processed narrative and choices
 */
export async function processAIResponse(prompt) {
    const log = window.displayVisualError || console.log;
    log("Processing AI response using dual agents...");

    // EXTERNAL API CODE REMOVED - Using local MiniCPM AI only
    // Local AI uses direct processing without complex hyperthreading
    // Check if this is initial story setup
    const isInitialSetup = prompt.includes("Please provide a rich, detailed story introduction in three parts");
    
    // First AI call - Generate the narrative
    const narrativePrompt = isInitialSetup ? prompt : `[System Note: You are the Story AI Agent. Your role is to generate the next part of the story based on the current context. Focus ONLY on the narrative description - do NOT generate any choices or actions. Keep your response concise and engaging.

Current Game State:
- Theme: ${gameState.adventureTheme}
- Player(s): ${gameState.players.map(p => p.name).join(', ')}
- Current Location: ${getCurrentLocationContext()}
- Situation: ${gameState.inCombat ? 'Combat' : 'Exploration'}
- Turn: ${gameState.turn}
- Goal: ${gameState.adventureGoal}

Previous Narrative:
${gameState.currentNarrative}

Generate ONLY the narrative description of what happens next in response to this action:
${prompt}]`;

    try {
        // ----- Phase 1: Structured narration + state-diff (preferred path) -----
        // Ask the narrator for both prose AND a JSON-Patch-style description
        // of what changed in the world this turn. The engine validates and
        // applies. Falls back to legacy text-only narrative on failure so we
        // never regress.
        let cleanNarrative = '';
        let appliedDiff = null;
        try {
            const opRulesAndPaths = `== OP RULES (read carefully — bad ops are silently rejected) ==
• Use \`add\` ONLY for paths ending in \`/-\` (appending to a list). Examples: \`/players/0/inventory/-\`, \`/enemies/-\`, \`/questProgress/milestones/-\`, \`/players/0/statusEffects/-\`, \`/players/0/specialMoves/-\`.
• Use \`replace\` for ALL scalar paths (HP, coins, location, adventureGoal, isGoalComplete, inCombat). Never \`add\` to a scalar.
• Use \`add\` or \`replace\` for \`/entityMemory/<category>/<NAME>\` keyed entries.
• Use \`remove\` only on \`/players/0/inventory/<id>\` to drop an item by id.
• Use ABSOLUTE values for replace (new full value), not deltas.

== ALLOWED PATHS (the engine rejects anything else) ==

${describeAllowedPaths()}`;

            // Branch the prompt on god mode. In normal play we suppress
            // narrator-emitted HP/coin ops to avoid double-counting with the
            // outcome system. In god mode that suppression is the bug — the
            // narrator MUST emit ops to make the player's authorial power real.
            const isGodMode = !!gameState.isGoalComplete;
            const turnGuidance = isGodMode
                ? `== GOD MODE TURN — player has authorial authority ==
The player's input is a DECLARATION about the world. You MUST persist every
tangible change they assert via diff ops; otherwise the change disappears
next turn and god-mode feels broken.

DECLARATION → REQUIRED DIFF (use these whenever the input matches):
• "I have <N> gold/coins/money" → /players/0/coins replace with N (cap 99999).
• "I have/wield/wear <ITEM>" → /players/0/inventory/- add (with reasonable {atk}/{def}/effect if not specified).
• "I learn/cast/know <SKILL>" → /players/0/specialMoves/- add (cooldown:3, mpCost:10 default).
• "I summon/befriend <CREATURE>" → /entityMemory/npcs/<NAME> add (and /players/0/specialMoves/- if combat ally).
• "I create/visit <PLACE>" → /currentLocation replace + /entityMemory/locations/<NAME> add.
• "I face <NEW BOSS>" → /enemies/- add + /inCombat replace true + /entityMemory/npcs/<NAME>.
• "New quest: <GOAL>" → /adventureGoal replace + /questProgress/completionPercentage replace 0. Do NOT touch /isGoalComplete.
• "My <STAT> is <N>" → /players/0/<atk|def|maxHp|maxMp|level> replace.

DEFAULTING — fill in reasonable values when the player is vague:
• Item without stats → tier "Special", {atk:18-30} for weapons or {def:18-30} for armor, evocative effect.
• Skill without mechanics → cooldown:3, mpCost:10, plain mechanics object.
• Boss without stats → hp:300-800, atk:30-60, def:20-40 scaled to drama.
• "A lot" → 10000. "Infinite" → 99999.

The "small HP/coin drops are already handled" rule from normal play does NOT
apply here — in god mode you MUST emit the coin/HP/stat ops the player declares.`
                : `== STATE THAT'S ALREADY HANDLED — DO NOT EMIT THESE OPS ==
• Small statistical HP / coin / item drops from Good/Bad/Risky/Silly/Investigative actions are already applied by the game's outcome system. Do NOT propose HP or coin replace ops unless the prose describes a SPECIFIC, NARRATIVELY-MEANINGFUL change (e.g. "the fireball strikes you" → yes; "you carefully cross the bridge" → no).
• Random reputation tweaks are already handled. Don't emit them.

== STATE THAT'S YOURS TO PROPOSE ==
• New entities the player encounters (NPCs, named locations, magical items) — these only exist if you create them.
• Combat starts (spawn an enemy + flip /inCombat to true).
• Quest milestones — use the EXACT snake_case names from the MAIN QUEST STAGE block below; NEVER paraphrase.
• Location changes — the FIRST turn the player enters a named place, ALWAYS emit a /currentLocation replace op.
• Status effects with narrative weight — when prose says "the goblin's bite poisons you", "the witch curses you", "you stagger from the blow", "the spider venom paralyzes you", emit the matching status via /players/0/statusEffects/- (player) or /enemies/<idx>/statusEffects/- (enemy). Catalog: Burn, Poison, Bleed, Frost (DoT); Stun, Paralysis, Sleep, Silence, Blind, Confusion, Fear, Curse (debuffs); Berserk, Regen, DefenseUp, AttackUp, Shield (buffs). Use {name:"Poison", duration:4} or include effectTickData like {hpPerTurn:-3} when stronger than catalog default.
• Quest progress — every time you emit a milestone, ALSO emit /questProgress/completionPercentage with the new percentage.
• Side quests — when an NPC asks for a favor, when a found note describes a hidden treasure, when a character pleads for help, EMIT a side quest via /questProgress/sideQuests/- add. Shape: {name, description, giver?, reward?}. Mark a side quest complete via /questProgress/sideQuests/<id>/completed replace true. Side quests live alongside the main quest and are tracked in the UI's side-quest panel. Use them to add narrative texture and optional reward loops.
• The overall /adventureGoal — set it once early (turn 4-6) with a clear sentence.
• Goal completion (/isGoalComplete: true) — fires the god-mode unlock chain.`;

            const examples = isGodMode
                ? `== GOD MODE EXAMPLES ==

Player: "I have a million gold pieces."
  "diff": { "ops": [
    {"op":"replace","path":"/players/0/coins","value":99999}
  ]}

Player: "I wield the Singing Sword that stuns foes."
  "diff": { "ops": [
    {"op":"add","path":"/players/0/inventory/-","value":{"name":"Singing Sword","type":"Weapon","tier":"Special","effect":"strikes hum a chord that briefly staggers foes","stats":{"atk":24}}},
    {"op":"add","path":"/entityMemory/items/Singing Sword","value":{"name":"Singing Sword","description":"a blade resonating with bound music"}}
  ]}

Player: "I learn the Time Stop spell."
  "diff": { "ops": [
    {"op":"add","path":"/players/0/specialMoves/-","value":{"name":"Time Stop","description":"freeze the moment for one turn","cooldown":8,"mpCost":30,"usageContext":"both","mechanics":{"stunAllEnemies":1}}}
  ]}

Player: "I summon Ember the phoenix as my familiar."
  "diff": { "ops": [
    {"op":"add","path":"/entityMemory/npcs/Ember","value":{"name":"Ember","description":"a phoenix companion with feathers of living flame","traits":["familiar","loyal","fiery"],"relationship":"bonded"}},
    {"op":"add","path":"/players/0/specialMoves/-","value":{"name":"Ember's Aid","description":"call Ember to scorch a foe","cooldown":4,"mpCost":15,"usageContext":"combat","mechanics":{"directDamage":40}}}
  ]}

Player: "I summon the Hollow King as a new boss to fight."
  "diff": { "ops": [
    {"op":"add","path":"/enemies/-","value":{"name":"The Hollow King","hp":600,"maxHp":600,"atk":45,"def":25,"abilities":["Voidstrike","Echoing Curse"]}},
    {"op":"replace","path":"/inCombat","value":true},
    {"op":"add","path":"/entityMemory/npcs/The Hollow King","value":{"name":"The Hollow King","description":"a crowned silhouette where a soul should be","traits":["antagonist","void-touched"],"relationship":"hostile"}}
  ]}

Player: "I declare a new quest: find the seven Sun Hearts before winter ends."
  "diff": { "ops": [
    {"op":"replace","path":"/adventureGoal","value":"Find the seven Sun Hearts before winter's end."},
    {"op":"replace","path":"/questProgress/completionPercentage","value":0}
  ]}`
                : `== EXAMPLES ==

Story-significant turn (player picks up an artifact, hits a quest beat):
  "diff": { "ops": [
    {"op":"add","path":"/players/0/inventory/-","value":{"name":"Tarnished Silver Locket","type":"Misc","tier":"Special","effect":"whispers ancient secrets when held to the ear"}},
    {"op":"add","path":"/questProgress/milestones/-","value":{"name":"call_to_adventure","description":"The locket whispers the player's name; the threat is real."}},
    {"op":"replace","path":"/questProgress/completionPercentage","value":15}
  ]}

Combat starts:
  "diff": { "ops": [
    {"op":"add","path":"/enemies/-","value":{"name":"Stone Guardian","hp":40,"maxHp":40,"atk":7,"def":4,"abilities":["Slam","Roar"]}},
    {"op":"replace","path":"/inCombat","value":true}
  ]}

Moving to a new place:
  "diff": { "ops": [
    {"op":"replace","path":"/currentLocation","value":{"name":"The Crystal Hall","type":"ruins","dangerLevel":0.6,"description":"A vaulted chamber lined with humming crystals."}}
  ]}

Pure exposition (no state change):
  "diff": { "ops": [] }

The adventure's main goal becomes clear:
  "diff": { "ops": [
    {"op":"replace","path":"/adventureGoal","value":"Restore the Sunken Library before the Heart consumes it."}
  ]}

The main quest is finally complete (unlocks god mode):
  "diff": { "ops": [
    {"op":"replace","path":"/isGoalComplete","value":true},
    {"op":"replace","path":"/questProgress/completionPercentage","value":100}
  ]}`;

            const diffPrompt = `${narrativePrompt}

Respond with ONLY a JSON object of the shape:
{
  "narration": "1-3 paragraphs of vivid second-person prose describing what happens next. NO choices. NO bracketed action tokens.",
  "diff": {
    "ops": [
      { "op": "add"|"remove"|"replace", "path": "...", "value": ... }
    ]
  }
}

The diff describes the NARRATIVELY SIGNIFICANT consequences of this turn — what changed in the world that the player would care about. Empty ops array is preferred when the turn is exposition-only.

${opRulesAndPaths}

${turnGuidance}

${examples}`;

            const turnPayload = await API.getAIResponseJSON(
                [
                    { role: 'system', content: generateSystemPrompt() + '\n\nReturn ONLY a JSON object matching the requested narrative-turn schema. /no_think' },
                    { role: 'user', content: diffPrompt }
                ],
                narrativeTurnSchema,
                { jsonSchemaName: 'narrative_turn', max_tokens: 1500, temperature: 0.7 }
            );
            const validated = validateNarrativeTurnPayload(turnPayload);
            cleanNarrative = validated.narration
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
                .trim();
            // Apply the diff in non-strict mode (skip bad ops, keep good ones).
            appliedDiff = applyDiff(validated.diff.ops || [], { strict: false });
            log(`narrative diff: applied ${appliedDiff.length}/${(validated.diff.ops || []).length} ops`);
        } catch (jsonErr) {
            log(`Narrative+diff JSON path failed (${jsonErr.message}); falling back to legacy text-only narrative.`);
            const narrativeResponse = await API.getAIResponse([
                { role: 'system', content: generateSystemPrompt() },
                { role: 'user', content: narrativePrompt }
            ]);
            cleanNarrative = narrativeResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
                .trim()
                .split('\n')
                .filter(line => !line.match(/\[Type=[A-Za-z]+\]/))
                .filter(line => !line.match(/^\*\*.+\*\*$/))
                .join('\n')
                .trim();
        }

        // Store the narrative in game state for context
        gameState.currentNarrative = cleanNarrative;

        // Phase 2: jail escape auto-complete safety net. If the narrator
        // describes the escape without firing the jail_escaped milestone,
        // detect it heuristically so the player isn't stuck in the cell
        // metadata while the prose says they're free. No-op if not imprisoned.
        try {
            if (gameState.imprisoned && typeof window !== 'undefined' && window.__jailSystem?.tryAutoCompleteEscape) {
                window.__jailSystem.tryAutoCompleteEscape();
            }
        } catch (_) { /* don't break narrative update on jail-system errors */ }

        // Update UI with narrative + any diff-applied state changes immediately
        UI.updateNarrative(gameState.currentNarrative);
        UI.renderPlayerCards();
        UI.renderEnemyCards();
        UI.updateContextHeaders();

        // Second AI call - Generate the choices
        const expectedChoiceCount = gameState.inCombat ? 4 : 5;
        const validChoiceTypes = gameState.inCombat ? 
            ['Attack', 'Special', 'Item', 'Run'] : 
            ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];
        
        // ----- JSON-first choice generation (Tier 2) -----
        // Try schema-constrained JSON output first. Falls back to the legacy
        // bracket-format regex parser if JSON parse/validation fails so we
        // never regress against backends that don't honor the schema field.
        let choices = null;
        const choiceSchema = getChoiceSchema(gameState.inCombat);
        const jsonChoicePrompt = `Generate exactly ${expectedChoiceCount} player choices for this adventure situation. Respond with ONLY a JSON object — no prose, no code fences.

CURRENT NARRATIVE:
${gameState.currentNarrative}

GAME CONTEXT:
- Theme: ${gameState.adventureTheme}
- Combat Status: ${gameState.inCombat ? 'In Combat' : 'Exploring'}
- Location: ${getCurrentLocationContext()}
- Player: ${gameState.players[0]?.name || 'Player'}
${gameState.inCombat ? `- Active Enemies: ${gameState.enemies.filter(e => !e.isDefeated).map(e => e.name).join(', ')}` : ''}

Required JSON shape:
{"choices":[${validChoiceTypes.map(t => `{"type":"${t}","text":"..."}`).join(',')}]}

Rules:
- Exactly ${expectedChoiceCount} entries, exactly one of each type listed above.
- "text" is a specific contextually-relevant action under 240 characters.
- Output the JSON object and nothing else.`;

        try {
            const payload = await API.getAIResponseJSON(
                [
                    { role: 'system', content: generateSystemPrompt() + '\n\nReturn ONLY a JSON object matching the requested schema. No markdown, no commentary. /no_think' },
                    { role: 'user', content: jsonChoicePrompt }
                ],
                choiceSchema,
                { jsonSchemaName: gameState.inCombat ? 'combat_choices' : 'exploration_choices', max_tokens: 512 }
            );
            choices = validateChoicesPayload(payload, gameState.inCombat);
            log(`JSON path: parsed ${choices.length} valid choices.`);
        } catch (jsonErr) {
            log(`JSON choice path failed (${jsonErr.message}); falling back to legacy bracket parser.`);
            choices = null;
        }

        // ----- Legacy bracket-format fallback -----
        if (!choices) {
            const choicePrompt = `Generate exactly ${expectedChoiceCount} player choices for this adventure situation.

CURRENT NARRATIVE:
${gameState.currentNarrative}

GAME CONTEXT:
- Theme: ${gameState.adventureTheme}
- Combat Status: ${gameState.inCombat ? 'In Combat' : 'Exploring'}
- Location: ${getCurrentLocationContext()}
- Player: ${gameState.players[0]?.name || 'Player'}
${gameState.inCombat ? `- Active Enemies: ${gameState.enemies.filter(e => !e.isDefeated).map(e => e.name).join(', ')}` : ''}

REQUIREMENTS:
1. Generate EXACTLY ${expectedChoiceCount} choices
2. Use ONLY these choice types: ${validChoiceTypes.join(', ')}
3. Each choice must be specific and contextually relevant
4. Format each choice as: [Type=X]Specific action description

${gameState.inCombat ?
`COMBAT CHOICE EXAMPLES:
[Type=Attack]Strike the ${gameState.enemies.find(e => !e.isDefeated)?.name || 'enemy'} with your weapon
[Type=Special]Use your special ability against the threat
[Type=Item]Use a healing potion from your inventory
[Type=Run]Attempt to escape from the dangerous situation` :
`EXPLORATION CHOICE EXAMPLES:
[Type=Good]Carefully examine the area for potential dangers
[Type=Bad]Rush forward without checking for traps
[Type=Risky]Try to climb the unstable-looking structure
[Type=Silly]Start singing loudly to see what happens
[Type=Investigative]Search thoroughly for clues or hidden passages`}

Generate your ${expectedChoiceCount} choices now (one per line):`;

            const choicesResponse = await API.getAIResponse([
                { role: 'system', content: generateSystemPrompt() },
                { role: 'user', content: choicePrompt }
            ]);

            // Strip Qwen3 think tags before parsing — otherwise [Type=X]
            // tokens inside a <think> block get parsed as real choices.
            const cleanedChoicesResponse = choicesResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, '$1')
                .trim();

            // Process the choices with strict validation
            choices = [];
            const choiceLines = cleanedChoicesResponse.split('\n').filter(line => line.trim());

            log(`AI Response for choices:\n${choicesResponse}`);
            log(`Found ${choiceLines.length} lines to process`);

            for (const line of choiceLines) {
                const typeMatch = line.match(/\[Type=([A-Za-z]+)\]/);
                if (typeMatch) {
                    const rawType = typeMatch[1];
                    const text = line.replace(/\[Type=[A-Za-z]+\]/, '').trim();
                    if (text) {
                        if (validChoiceTypes.includes(rawType)) {
                            choices.push({ type: rawType, text });
                            log(`Parsed choice: [${rawType}] ${text}`);
                        } else {
                            log(`REJECTED invalid choice type "${rawType}" - not in allowed types: ${validChoiceTypes.join(', ')}`);
                        }
                    }
                }
            }

            // Strict validation - AI must provide exactly the right number of valid choices
            if (choices.length !== expectedChoiceCount) {
                log(`CRITICAL ERROR: AI provided ${choices.length} valid choices, expected ${expectedChoiceCount}`);
                log(`Valid choice types required: ${validChoiceTypes.join(', ')}`);
                log(`AI Response was:\n${choicesResponse}`);

                throw new Error(`AI failed to generate ${expectedChoiceCount} valid choices. Got ${choices.length} valid choices. This indicates the AI is not following the prompt correctly.`);
            }
        }

        // Additional validation: For exploration mode, ensure exactly one of each type
        // (JSON-path output is already validated by validateChoicesPayload, but the
        // legacy fallback path can produce duplicates/misses, so we re-check both.)
        if (!gameState.inCombat) {
            const requiredTypes = ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'];
            const typeCounts = {};

            // Count occurrences of each type
            choices.forEach(choice => {
                typeCounts[choice.type] = (typeCounts[choice.type] || 0) + 1;
            });

            // Check for duplicates or missing types
            const duplicateTypes = [];
            const missingTypes = [];

            requiredTypes.forEach(type => {
                const count = typeCounts[type] || 0;
                if (count === 0) {
                    missingTypes.push(type);
                } else if (count > 1) {
                    duplicateTypes.push(`${type}(${count})`);
                }
            });

            if (duplicateTypes.length > 0 || missingTypes.length > 0) {
                log(`CHOICE TYPE VALIDATION FAILED:`);
                if (duplicateTypes.length > 0) {
                    log(`- Duplicate types: ${duplicateTypes.join(', ')}`);
                }
                if (missingTypes.length > 0) {
                    log(`- Missing types: ${missingTypes.join(', ')}`);
                }
                log(`- Generated choices: ${choices.map(c => c.type).join(', ')}`);
                log(`AI Response was:\n${choicesResponse}`);
                
                throw new Error(`AI failed to generate exactly one choice of each required type. Duplicates: [${duplicateTypes.join(', ')}], Missing: [${missingTypes.join(', ')}]. The AI must provide exactly one Good, Bad, Risky, Silly, and Investigative choice.`);
            }
        }

        log(`SUCCESS: AI generated exactly ${choices.length} valid choices as required`);

        // Randomize choice order for better gameplay variety
        const shuffledChoices = [...choices];
        for (let i = shuffledChoices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledChoices[i], shuffledChoices[j]] = [shuffledChoices[j], shuffledChoices[i]];
        }
        
        log(`Choices randomized for presentation: ${shuffledChoices.map(c => c.type).join(', ')}`);

        // Store choices in game state and render them
        gameState.currentChoices = shuffledChoices;
        UI.renderChoices(shuffledChoices);
        return { narrative: cleanNarrative, choices: shuffledChoices };

    } catch (error) {
        log(`CRITICAL ERROR in processAIResponse: ${error.message}`);
        
        // Clear any loading indicators
        UI.showLoading(false);
        
        // Show clear error message to user
        UI.showPopup(`AI Generation Failed: ${error.message}. Make sure the configured LLM_BACKEND server is running (see start_game.py) or restart.`, 'error', 10000);
        
        // Re-throw the error - no fallbacks, system must work correctly
        throw new Error(`AI processing failed: ${error.message}. This indicates a problem with the local AI server or prompts that needs to be fixed.`);
    }
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
                            if (UI.elements.customActionContainer) UI.elements.customActionContainer.classList.remove('hidden');
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
    // Average all players' ages so the reading level stays consistent across the
    // whole party (spec requirement). Falls back to the current player's age for
    // solo play, then 25 as a safe adult default if no ages are available yet.
    const allAges = (gameState.players || []).map(p => p.age).filter(a => typeof a === 'number' && a > 0);
    const playerAge = allAges.length > 0
        ? Math.round(allAges.reduce((sum, a) => sum + a, 0) / allAges.length)
        : (currentPlayer?.age || 25);

    // Phase 3.2: build the canonical state block FIRST so it's the first
    // content the narrator sees after the role directive. This is appended
    // to the prompt at the bottom of this function.
    const canonicalStateBlock = buildCanonicalStateBlock();

    // Age-appropriate guidelines (static import; this function must remain
    // sync because pruneMessageHistory and several other call sites consume
    // its return value as a string. Tier 2 audit caught the previous async
    // version returning [object Promise] into the AI request body.)
    let ageAppropriateGuidelines = null;
    try {
        ageAppropriateGuidelines = generateNarrativeGuidelines(playerAge);
    } catch (error) {
        log(`Failed to compute age-appropriate guidelines: ${error.message}`);
    }
    
    // Get quest progress guidance — ONLY when not in god mode. Once the main
    // quest is complete, the buildQuestStageHint block below takes over with
    // authorial-authority instructions; the legacy quest-progress commands
    // would compete with that and the narrator gets confused. When god mode
    // is on, suppress them entirely.
    let questGuidance = '';
    if (gameState.questProgressManager && !gameState.isGoalComplete) {
        const guidance = gameState.questProgressManager.generateAIGuidance();
        const progressSummary = gameState.questProgressManager.getProgressSummary();

        questGuidance = `

QUEST PROGRESS GUIDANCE:
- Current Phase: ${progressSummary.phase} (${progressSummary.percentage}% complete)
- Story Direction: ${guidance.storyDirection}
- Urgency Level: ${guidance.urgency}
- Active Objectives: ${progressSummary.activeObjectives.join(', ') || 'None'}
- Recent Milestones: ${progressSummary.recentMilestones.map(m => m.name).join(', ') || 'None'}
- Suggested Milestones: ${guidance.suggestedMilestones.join(', ') || 'Continue current progression'}

QUEST PROGRESS COMMANDS (use these to track story progression):
- Milestone:Type:Name:Description (Types: first_encounter, location_discovered, character_met, secret_revealed, obstacle_overcome, plot_twist, final_confrontation, goal_achieved)
- Objective:Add:New objective text (add new objectives)
- Objective:Complete:Completed objective text (mark objectives as done)
- SideQuest:Add:Name:Description (create optional side quests)
- Secret:Discovered secret text:Category (track lore discoveries)
- Goal:Update:New main goal text (evolve the main quest)
- Goal:Complete (when the adventure is truly finished)

Use these commands to provide structured progression feedback to players!`;
    }
    
    let prompt = `You are the AI storyteller for an adventure game. Your role is to narrate the story and provide meaningful, contextual choices that drive the narrative forward.${questGuidance}

AGE-APPROPRIATE READING LEVEL (Average Party Age: ${playerAge}):
${ageAppropriateGuidelines ? `
READING LEVEL: ${ageAppropriateGuidelines.bookComparison}
TARGET LENGTH: ${ageAppropriateGuidelines.wordCount.min}-${ageAppropriateGuidelines.wordCount.max} words (${ageAppropriateGuidelines.readingTime} reading time)
PARAGRAPH STRUCTURE: ${ageAppropriateGuidelines.paragraphCount.min}-${ageAppropriateGuidelines.paragraphCount.max} well-developed paragraphs

WRITING STYLE CHARACTERISTICS:
${ageAppropriateGuidelines.characteristics.map(char => `- ${char}`).join('\n')}

LENGTH REQUIREMENTS:
${ageAppropriateGuidelines.aiInstructions.length}
${ageAppropriateGuidelines.aiInstructions.structure}
${ageAppropriateGuidelines.aiInstructions.sentences}
${ageAppropriateGuidelines.aiInstructions.pacing}

VOCABULARY GUIDELINES:
- Level: ${ageAppropriateGuidelines.contentGuidelines.vocabulary.description}
- Complexity: ${ageAppropriateGuidelines.contentGuidelines.vocabulary.wordComplexity}
- New Words: ${ageAppropriateGuidelines.contentGuidelines.vocabulary.newWordsPerPage}
- Context: ${ageAppropriateGuidelines.contentGuidelines.vocabulary.contextClues}

NARRATIVE COMPLEXITY:
- Plot: ${ageAppropriateGuidelines.contentGuidelines.complexity.plotElements}
- Time: ${ageAppropriateGuidelines.contentGuidelines.complexity.timeStructure}
- Perspective: ${ageAppropriateGuidelines.contentGuidelines.complexity.perspectives}
- Subplots: ${ageAppropriateGuidelines.contentGuidelines.complexity.subplots}

EMOTIONAL DEPTH:
- Emotions: ${ageAppropriateGuidelines.contentGuidelines.emotional_depth.emotions}
- Relationships: ${ageAppropriateGuidelines.contentGuidelines.emotional_depth.relationships}
- Conflicts: ${ageAppropriateGuidelines.contentGuidelines.emotional_depth.conflicts}
- Resolution: ${ageAppropriateGuidelines.contentGuidelines.emotional_depth.resolution}

THEMES TO INCLUDE: ${ageAppropriateGuidelines.contentGuidelines.themes.join(', ')}
ELEMENTS TO EMPHASIZE: ${ageAppropriateGuidelines.styleRequirements.emphasize.join(', ')}
ELEMENTS TO AVOID: ${ageAppropriateGuidelines.styleRequirements.avoid.join(', ')}

SPECIAL INSTRUCTIONS: ${ageAppropriateGuidelines.aiInstructions.special}

CONTENT POLICY (age tier ${playerAge < 10 ? 'L1 — child' : playerAge < 15 ? 'L2 — tween' : 'L3 — teen/adult'}):
${
    playerAge < 10 ?
`- NEVER depict gore, sexual content, hateful slurs, or graphic violence.
- Scary moments resolve quickly with reassurance ("but you stand firm and the shadow flees").
- Avoid death descriptions; defeated foes "flee", "fall asleep", or "vanish in a puff of light".
- Stay in storybook voice. Never break the fourth wall ("As an AI…" is forbidden).
- If the player asks for something off-policy, the world responds in-character (the friendly fox shakes its head and steers them somewhere safer).` :
    playerAge < 15 ?
`- Fantasy violence is allowed (sword strikes, magical battles); avoid gore, no dismemberment, no romance beyond hand-holding/blushing.
- Death may be referenced but described tastefully; no torture or graphic suffering.
- Themes of betrayal, loss, and courage are fine; no hateful slurs.
- Never break the fourth wall. If the player asks for something off-policy, refuse in-character.` :
`- Mature themes are permitted in service of the story (loss, moral ambiguity, fantasy violence).
- Avoid explicit sexual content and gratuitous gore.
- Never break the fourth wall. Decline off-policy requests as a diegetic outcome ("the dagger refuses your hand").`
}

CRITICAL: Write like an engaging page from a book that a ${playerAge}-year-old would love to read!
` : `
- For ages 6-12: Focus on wonder, discovery, and clear moral choices (2-3 paragraphs). No gore, no death, no romance.
- For ages 13-17: Fantasy violence + moral ambiguity OK (3-4 paragraphs). No explicit content.
- For ages 18+: Mature themes welcome but never explicit (4-5 paragraphs).
- For ages 30+: Deeper philosophical and moral complexity (5-6 paragraphs).
`}

${(() => {
    // Phase 3.5 P2: surface non-zero faction reputations so the narrator can
    // shape NPC reactions ("the city guard salutes you" if authority>30, "the
    // taverns whisper as you pass" if shadows<-30, etc.). Only includes
    // factions that have moved off zero — silent factions stay invisible to
    // keep prompt size lean.
    const reps = gameState.reputationSystem?.factions || {};
    const named = Object.entries(reps).filter(([, v]) => Math.abs(v) >= 5);
    if (named.length === 0) return '';
    const desc = (v) => v >= 50 ? 'revered' : v >= 25 ? 'liked' : v >= 5 ? 'neutral-positive' : v <= -50 ? 'hated' : v <= -25 ? 'disliked' : 'neutral-negative';
    const lines = named.map(([f, v]) => `  • ${f}: ${v} (${desc(v)})`).join('\n');
    return `

REPUTATION CONTEXT (use this to shape NPC reactions, merchant prices, faction services):
${lines}
- High +reputation → faction NPCs greet warmly, offer discounts, share lore.
- Low -reputation → faction NPCs are cold/hostile, refuse service, may attack.
- When the player's choice clearly affects a faction (helping authority, robbing common-folk, defending nature, betraying scholars), emit a /reputationSystem/factions/<name> replace op with the new value (clamped -100..100, typical delta ±5 per significant action).
`;
})()}

CRITICAL RESPONSE FORMAT:
1. Story narrative (length based on age group)
2. Blank line
3. Five choices, each on its own line, with [Type=X] prefix

${gameState.inCombat ? 
    `COMBAT CHOICES: Since combat is active, you MUST provide EXACTLY these 4 combat choices that reflect the current tactical situation:
    [Type=Attack] - Describe a specific attack against ${gameState.enemies?.find(e => !e.isDefeated)?.name || 'the enemy'}.
    [Type=Special] - Suggest a special move that fits the current combat advantage/disadvantage.
    [Type=Item] - Recommend an item use based on player/enemy conditions.
    [Type=Run] - Describe an escape attempt that considers the environment.
    
    CRITICAL COMBAT RULES:
    1. TACTICAL AWARENESS:
       - If player has tactical advantage, emphasize aggressive options
       - If at disadvantage, focus on defensive or strategic choices
       - Match attack descriptions to enemy conditions
       - Consider status effects in choice descriptions
    
    2. THREAT RESPONSE:
       - Low Threat: Choices can be more experimental
       - Normal Threat: Balanced mix of safe and aggressive options
       - High Threat: Emphasize careful tactics
       - Extreme Threat: Focus on survival and damage mitigation
    
    3. CONDITION ADAPTATION:
       - Healthy Player: Enable bold tactical choices
       - Injured Player: Suggest protective actions
       - Critical Player: Prioritize healing/escape options
    
    4. REQUIRED ELEMENTS:
       - Attack choices MUST name specific enemies
       - Special moves MUST consider status effects
       - Item suggestions MUST match player needs
       - Escape plans MUST reference environment
    
    5. COMBAT NARRATION:
       - Describe enemy reactions and positioning
       - Note environmental factors affecting combat
       - Highlight status effect impacts
       - Indicate relative threat levels` 
    :
    `EXPLORATION CHOICES: You must provide EXACTLY 5 choices with EXACTLY ONE of each type. NO DUPLICATES ALLOWED.

    REQUIRED CHOICE TYPES (EXACTLY ONE OF EACH):
    [Type=Good] - A cautious or wise choice that prioritizes safety
    [Type=Bad] - A dangerous or foolish choice that could have severe consequences
    [Type=Risky] - A calculated gamble with both potential rewards and dangers
    [Type=Silly] - A creative or humorous choice that might unexpectedly work
    [Type=Investigative] - A choice focused on exploration, gathering information, or solving puzzles

    ⚠️ CRITICAL: You MUST generate EXACTLY ONE choice of each type above. NO MORE, NO LESS.
    ⚠️ If you generate two Investigative choices or miss a Silly choice, the system will reject your response.

    CRITICAL CHOICE RULES:
    1. CONTEXT INTEGRATION:
       - If the story mentions specific paths, doors, or objects, choices MUST reference them
       - If in a dangerous area, include appropriate caution in choice descriptions
       - If at night/dark, reference light sources or visibility in choices
       - Match the tone of choices to the current situation (e.g., tense, mysterious, etc.)
    
    2. CHOICE STRUCTURE:
       - Start each choice with a specific verb (e.g., "Push", "Investigate", "Climb")
       - Include relevant details from the environment
       - Hint at potential consequences without being obvious
       
    3. EXAMPLES FOR CURRENT CONTEXT:
       ${getCurrentContextExamples()}
       
    4. FORBIDDEN PATTERNS:
       ❌ Don't use "safe", "dangerous", "risky" in choice text
       ❌ Don't make the type obvious from the wording
       ❌ Don't use generic actions like "proceed carefully"
       ❌ Don't ignore elements mentioned in the narrative
       
    5. REQUIRED ELEMENTS:
       - Each choice MUST relate to the current scene
       - Each choice MUST have potential consequences
       - Each choice MUST use specific, vivid language
       - Choices MUST be shuffled in presentation order`}

SPECIAL MOVES SYSTEM:
When a player learns a new special move, generate a move that fits the current theme and context:
1. Name: Create a thematic and descriptive name
2. Effect: Write a vivid description of what the move does
3. Context: Specify if it's for 'combat', 'exploration', or 'both'
4. Mechanics: Define the move's mechanical effects:
   - For combat moves: damage, healing, or status effects
   - For exploration moves: obstacle types it can overcome, puzzle bonuses, or environmental effects
5. Cooldown: Always set to 5 turns
6. Theme: Match the move to the current adventure theme (fantasy, space, pirate, etc.)

Example special move format:
{
    "name": "Mystic Surge",
    "effect": "Channels arcane energy to empower attacks and overcome magical barriers",
    "usageContext": "both",
    "mechanics": {
        "damage": 15,
        "statusEffects": ["Empowered"],
        "exploration": {
            "obstacleTypes": ["magical", "barrier"],
            "puzzleBonus": 2,
            "environmentalEffect": "disperses magical barriers"
        }
    },
    "cooldown": 5
}

4. NEVER add explanatory text around choices.
5. NEVER create choices that don't match the required types.
6. If in combat, ALWAYS specify the target enemy in Attack choices.
7. Keep story segments concise but vivid.`;

    // Add theme-specific guidance and story variation context
    prompt += `\n\nCURRENT THEME: ${gameState.adventureTheme}${gameState.customThemeDescription ? ` (${gameState.customThemeDescription})` : ''}

THEME-SPECIFIC GUIDANCE:
${getThemeSpecificGuidance(gameState.adventureTheme)}

THEME ATMOSPHERE AND ELEMENTS:
${getThemeAtmosphere(gameState.adventureTheme)}

THEME-SPECIFIC INTERACTIONS:
${getThemeInteractions(gameState.adventureTheme)}

FORBIDDEN TROPE PHRASES (do not use these exact words; they are over-used patterns from training data and break replay variety):
  - "Sunken Library"
  - "Heart of Shadow"
  - "Heart of Darkness"
  - "Shadow Blight"
  - "the Heart of <noun>"
  - "Whispering Woods" / "Whisperwood"
  - "the Old Book"
  - "the Ancient Evil"
  - "the Chosen One"
Invent fresh names and vocabulary native to the chosen theme. A dinosaur-era story should have hunting-grounds, migration-stones, ash-fields, geyser-fields, predator-territory — not libraries and shadow-blights. A space story should have habitats, transponders, biosignals, jump-coordinates — not libraries or curses.

THEME FAITHFULNESS RULE: Use vocabulary, NPC types, locations, and props NATIVE to the chosen theme. Never borrow archetypes from other themes (no "village elder" in cyberpunk; no "ship's captain" in dinosaur; no "scholar" in post-apocalypse — replace with theme-appropriate equivalents like "tribe shaman", "fleet commander", "hunt-mother", "wasteland archivist").`;

    // Phase 3.5 follow-on: surface the per-run STORY HOOK so the narrator
    // anchors the FIRST story turn on this specific inciting incident.
    // Different hook each game = different storyline each playthrough.
    if (gameState.storyHook) {
        prompt += `\n\nSTORY HOOK FOR THIS RUN (the inciting incident is fixed; do not invent an alternative):
Archetype: ${gameState.storyHook.archetype}
Concrete inciting incident: ${gameState.storyHook.flavor}
This hook was selected for THIS playthrough. The opening prose must reflect it. Variations of NPC names, place names, and exact wording are encouraged — but the SHAPE of the inciting incident must come from the hook above, not from your training prior.`;
    }

    // Add story variation context if available
    if (gameState.storyVariation) {
        prompt += `\n\nSTORY VARIATION CONTEXT:
Current Setting: ${gameState.storyVariation.narrativeElements.setting}
Central Conflict: ${gameState.storyVariation.narrativeElements.conflict}
Core Mystery: ${gameState.storyVariation.narrativeElements.mystery}
Urgency Factor: ${gameState.storyVariation.narrativeElements.urgency}
Atmospheric Element: ${gameState.storyVariation.narrativeElements.atmosphericElement}
Personal Connection: ${gameState.storyVariation.narrativeElements.personalConnection}

NARRATIVE CONSISTENCY REQUIREMENTS:
- All story elements must align with the ${gameState.storyVariation.narrativeElements.setting}
- Maintain the central conflict: ${gameState.storyVariation.narrativeElements.conflict}
- Keep the mystery focused on: ${gameState.storyVariation.narrativeElements.mystery}
- Remember the urgency: ${gameState.storyVariation.narrativeElements.urgency}
- Preserve the atmospheric tone: ${gameState.storyVariation.narrativeElements.atmosphericElement}`;
    }

    // Add goal if set
    if (gameState.adventureGoal) {
        prompt += `\n\nCURRENT GOAL: ${gameState.adventureGoal}`;
    }

    // Get current context
    const context = determineContext(currentPlayer);

    // Enhanced context information
    prompt += `\n\nCURRENT CONTEXT:
Situation: ${context.situation}
Environment: ${context.environment}
Time of Day: ${context.timeOfDay}
Weather: ${context.weather}
Location: ${context.location || 'Unknown'}`;

    // Enhanced combat state info
    if (gameState.inCombat) {
        const activeEnemies = gameState.enemies?.filter(e => !e.isDefeated) || [];
        
        prompt += `\n\nCOMBAT SITUATION:
Threat Level: ${context.combatState.threatLevel}
Tactical Position: ${context.combatState.tacticalAdvantage}
Player Condition: ${context.combatState.playerCondition}
Enemy Condition: ${context.combatState.enemyCondition}
Active Enemies: ${activeEnemies.map(e => 
            `${e.name} (HP: ${e.hp}/${e.maxHp}, ATK: ${e.atk}, DEF: ${e.def}${
                e.statusEffects?.length ? `, Status: ${e.statusEffects.map(s => s.name).join(', ')}` : ''
            }${e.abilities ? `, Abilities: ${e.abilities.join(', ')}` : ''})`
        ).join('\n              ')}`;
    }

    // Add detailed player state.
    // IMPORTANT: equipment.weapon / equipment.armor store ITEM IDs (e.g.
    // "moksy7d4_r8d1m7a"); resolve them to names before showing the model so
    // the narrative doesn't write lines like "she gripped the moksy7d4_...".
    if (currentPlayer) {
        const inv = currentPlayer.inventory || [];
        const lookupName = (id) => {
            if (!id) return 'None';
            const item = inv.find(it => it && it.id === id);
            return item ? (item.name || 'Unnamed Item') : 'None';
        };
        const weaponName = lookupName(currentPlayer.equipment?.weapon);
        const armorName = lookupName(currentPlayer.equipment?.armor);
        prompt += `\n\nPLAYER STATE:
Name: ${currentPlayer.name}
HP: ${currentPlayer.hp}/${currentPlayer.maxHp}
ATK: ${currentPlayer.atk}
DEF: ${currentPlayer.def}
Coins: ${currentPlayer.coins}
${currentPlayer.statusEffects?.length ? `Status Effects: ${currentPlayer.statusEffects.map(s => s.name).join(', ')}` : ''}
Equipment: Weapon: ${weaponName}, Armor: ${armorName}`;
    }

    // Add reputation context
    if (gameState.reputationSystem) {
        prompt += generateReputationContext();
    }

    // Phase 2 hybrid retrieval: inject only the summaries + entities that
    // are RELEVANT to the current scene, instead of dumping everything we
    // know. Recency-blended TF-IDF over arc summaries; mention-aware sort
    // over entities. See memoryRetriever.js. The query is the current
    // narrative — what the model is "thinking about right now."
    const memoryQuery = (gameState.currentNarrative || '') + ' ' + (gameState.currentLocation?.name || '');
    prompt += renderMemoryBlock(memoryQuery);

    // Phase 3 main-quest stage hint — tells the narrator which act we're in
    // so the milestone graph progresses, and switches to creative-mode
    // framing once /isGoalComplete is true (god mode unlocked). This
    // function also returns the jail-escape addon when imprisoned.
    prompt += buildQuestStageHint(gameState);

    // Phase 3.2: prepend the canonical entity state block. Done here at
    // return time (rather than building the prompt around it) so the
    // existing 1500+ lines of system-prompt construction don't have to be
    // touched. The block is short and lives at the very top of the prompt
    // — the first thing the narrator sees after the role directive.
    return canonicalStateBlock + prompt;
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
    const recentWindow = (gameState.messageHistory || [])
        .filter(m => (m.turn || 0) > lastSummaryTurn)
        .map(m => `Turn ${m.turn}: ${m.content || ''} -> ${m.response || ''}`)
        .join('\n')
        .slice(-3500); // hard cap to keep the summary call cheap

    if (!recentWindow.trim()) {
        gameState.arcMemory.nextSummaryAtTurn = gameState.turn + Config.SUMMARY_EVERY_N_TURNS;
        return;
    }

    try {
        const payload = await API.getAIResponseJSON(
            [
                { role: 'system', content: 'You are an editor distilling a tabletop adventure transcript. Output ONLY a JSON object — no prose, no commentary. Use the EXACT field names below. Names should be specific (e.g. "Mira" not "the player"). /no_think' },
                { role: 'user', content:
`Summarize turns ${lastSummaryTurn + 1}-${gameState.turn} and extract any new named entities. Respond with ONLY this JSON shape (use empty arrays where nothing applies):

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
            turn: gameState.turn,
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
                const existing = bucket[e.name];
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
    } catch (err) {
        log(`ArcMemory: refresh failed (${err.message}); will retry next interval.`);
    } finally {
        gameState.arcMemory.nextSummaryAtTurn = gameState.turn + Config.SUMMARY_EVERY_N_TURNS;
    }
}

/**
 * Generates context-appropriate examples for the current game state
 * @returns {string} Example choices formatted for the current context
 */
function getCurrentContextExamples() {
    const context = determineContext(getCurrentPlayer());
    
    // Base examples on the current environment and situation
    if (context.environment === 'dangerous') {
        return `✓ [Type=Good] "Scout ahead from behind cover, watching for any movement"
✓ [Type=Bad] "Rush forward without checking for traps or enemies"
✓ [Type=Risky] "Create a distraction by throwing a rock at the metal debris"
✓ [Type=Silly] "Try to sneak past while humming a 'sneaky' tune"
✓ [Type=Investigative] "Search for signs of recent activity or tracks"`;
    } else if (context.environment === 'mysterious') {
        return `✓ [Type=Good] "Examine the ancient symbols with a respectful distance"
✓ [Type=Bad] "Touch the glowing runes without any precaution"
✓ [Type=Risky] "Attempt to decipher the inscription while channeling magic"
✓ [Type=Silly] "Draw your own 'mystical' symbols next to the ancient ones"
✓ [Type=Investigative] "Document the pattern of symbols for later research"`;
    } else if (context.environment === 'urban') {
        return `✓ [Type=Good] "Ask the local merchant about recent events"
✓ [Type=Bad] "Pick a fight with the town guard"
✓ [Type=Risky] "Try to eavesdrop on the suspicious conversation"
✓ [Type=Silly] "Start juggling in the town square for coins"
✓ [Type=Investigative] "Check the notice board for unusual postings"`;
    } else {
        return `✓ [Type=Good] "Survey the surroundings from a vantage point"
✓ [Type=Bad] "Ignore the warning signs and proceed anyway"
✓ [Type=Risky] "Test the stability of the old bridge"
✓ [Type=Silly] "Try to befriend any nearby wildlife"
✓ [Type=Investigative] "Look for any unusual patterns or markings"`;
    }
}

/**
 * Gets the display name for the current theme. Helper for prompt generation.
 * @returns {string} The theme name.
 */
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
            const { describeHookForPrompt } = await import('./storyHooks.js?cb=014');
            hookBlock = describeHookForPrompt(gameState.storyHook);
        } catch (_) { /* graceful: if storyHooks isn't loaded yet, fall back to generic intro */ }

        prompt = `Please provide a rich, detailed story introduction in three parts for the start of a new ${themeBlurb} adventure starring ${playerNames}.

Part 1: vivid scene-setting paragraph establishing the world, mood, and immediate location. USE VOCABULARY NATIVE TO THE THEME — for dinosaur, words like "tar pit", "migration", "claw-strike", "scaled feet"; for space, "habitat", "transponder", "parsec", "biosignal"; for pirate, "cog", "rigging", "salt-blasted", "doubloon"; for cyberpunk, "decker", "neon", "deck", "ICE", "chrome". Avoid generic-fantasy phrasing in non-fantasy themes.
Part 2: introduce the player character(s) — their situation right now and what makes this moment a turning point. Anchor names and props to the theme.
Part 3: USE THE STORY HOOK BELOW as the inciting incident. Do not invent a different inciting incident — turn the hook's flavor text into prose.${hookBlock}

Keep total length under ~400 words. Use second-person voice ("You ..."). Do NOT include choice options — those are generated separately. NEVER use the trope phrases listed in the system prompt's FORBIDDEN TROPE PHRASES section.`;
    }

    try {
        // Process the AI response using dual agents
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
        Promise.resolve().then(() => refreshArcMemory()).catch(e => log(`ArcMemory dispatch failed: ${e.message}`));

        return { narrative, choices };

    } catch (error) {
        log(`Error in makeAICallForSystemAction: ${error.message}`);
        // Preserve the narrative if the first AI call (story generation) already
        // succeeded and set gameState.currentNarrative — only choices failed.
        // Falling back to "The story continues..." here would overwrite real prose
        // that was already rendered to the DOM by processAIResponse.
        const defaultNarrative = gameState.currentNarrative || "The story continues...";
        const defaultChoices = validateAndFixChoices([], gameState.inCombat);

        UI.updateNarrative(defaultNarrative);
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

/**
 * Generate reputation context for AI prompts
 * @returns {string} Reputation context formatted for AI
 */
function generateReputationContext() {
    const factions = gameState.reputationSystem.factions;
    const contextualizedFactions = getContextualizedFactions();
    const availableServices = gameState.reputationSystem.availableServices || [];
    const reputationHistory = gameState.reputationSystem.reputationHistory || [];
    
    let context = '\n\nREPUTATION & FACTION STANDING:';
    
    // Add current faction standings
    context += '\nCurrent Standing:';
    Object.entries(factions).forEach(([factionKey, reputation]) => {
        const faction = contextualizedFactions[factionKey];
        if (faction) {
            let standing = 'Neutral';
            if (reputation >= 60) standing = 'Trusted';
            else if (reputation >= 20) standing = 'Friendly';
            else if (reputation <= -60) standing = 'Hostile';
            else if (reputation <= -20) standing = 'Suspicious';
            
            context += `\n- ${faction.name}: ${reputation} (${standing}) - ${faction.flavor}`;
        }
    });
    
    // Add available services
    if (availableServices.length > 0) {
        context += '\n\nUnlocked Services: ' + availableServices.join(', ');
    }
    
    // Add recent reputation changes for context
    if (reputationHistory.length > 0) {
        context += '\n\nRecent Reputation Events:';
        reputationHistory.slice(-3).forEach(event => {
            const majorChanges = event.changes.filter(c => Math.abs(c.change) >= 3);
            if (majorChanges.length > 0) {
                const change = majorChanges[0];
                const faction = contextualizedFactions[change.faction];
                const changeText = change.change > 0 ? 'improved' : 'worsened';
                context += `\n- Turn ${event.turn}: ${faction?.name || change.faction} reputation ${changeText} due to "${event.choiceText}"`;
            }
        });
    }
    
    // Add faction interaction guidance and trust penalties
    const trustModifiers = getTrustDifficultyModifiers(factions);
    
    context += '\n\nFACTION INTERACTION GUIDANCE:';
    context += '\n- NPCs react based on faction reputation';
    context += '\n- Prices vary significantly based on standing';
    context += '\n- High reputation unlocks exclusive services and dialogue';
    context += '\n- Faction conflicts may limit maximum reputation with opposing groups';
    context += '\n- Consider long-term reputation consequences in story choices';
    
    // Add trust level effects
    context += `\n\nCURRENT TRUST LEVEL: ${trustModifiers.trustLevel.toUpperCase()}`;
    if (trustModifiers.penalties.length > 0) {
        context += '\nACTIVE TRUST PENALTIES:';
        trustModifiers.penalties.forEach(penalty => {
            context += `\n- ${penalty}`;
        });
        
        context += '\n\nNPC BEHAVIOR ADJUSTMENTS:';
        context += `\n- NPCs are ${Math.round((1 - trustModifiers.npcHelpChance) * 100)}% less helpful`;
        context += `\n- Information quality reduced by ${Math.round((1 - trustModifiers.informationQuality) * 100)}%`;
        context += `\n- Warning chances reduced by ${Math.round((1 - trustModifiers.warningChance) * 100)}%`;
        
        if (trustModifiers.ambushChance > 0) {
            context += `\n- ${Math.round(trustModifiers.ambushChance * 100)}% chance of hostile ambushes`;
        }
    }
    
    return context;
}