# Adventure Stories — Full Implementation Plan

**Date:** 2026-04-30  
**Status:** Active  
**Model:** Gemma 3 4B (local) / Gemma 3 27B via OpenRouter (cloud)

---

## Cloud AI Recommendation

The game previously had external API code that was deliberately removed. We are re-adding it — but as a user-configured optional provider, not a hardcoded key.

### Free Cloud Options (no credit card required)

| Provider | Best Free Gemma Model | RPM | Daily Cap | Endpoint |
|---|---|---|---|---|
| **OpenRouter** (Gemma-specific) | `google/gemma-4-31b-it:free` | 20 | 200 req/day | `https://openrouter.ai/api/v1` |
| **OpenRouter** (quality fallback) | `google/gemma-3-27b-it:free` | 20 | 200 req/day | `https://openrouter.ai/api/v1` |
| **Groq** (fastest, not Gemma) | `llama-3.3-70b-versatile` | 30 | 100K TPD | `https://api.groq.com/openai/v1` |
| **Google AI Studio** | `gemini-2.5-flash-lite` | 15 | 1,000 req/day | `https://generativelanguage.googleapis.com/v1beta/openai/` |

**Recommendation for users:** OpenRouter with `google/gemma-4-31b-it:free` — actual Gemma 4, 31B parameters (significantly better than the local 4B), free forever. Sign up at https://openrouter.ai, no credit card. 200 requests/day = roughly 200 game turns, which is a full adventure session.

**Code change required:** All three are OpenAI-compatible drop-ins — the only changes are: add `Authorization: Bearer <key>` header, update base URL, update model name. The existing `localAI.js` → `makeRequest()` path handles everything else unchanged.

---

## Architecture Notes (from codebase audit)

- Base URL: 3-tier resolution — query param → localStorage (`adv.backendUrl`) → config default
- Auth: **No API key infrastructure exists today** — must add `Authorization` header to `localAI.js:243`
- Request format: OpenAI `/v1/chat/completions`, ~2,000–3,200 tokens sent per turn
- Response: `choices[0].message.content` plain text, 2,048 token cap per response
- History: 20 message pairs max, 12 arc summaries max, TF-IDF retrieval in `memoryRetriever.js`
- External APIs were explicitly removed before (config.js:114-115) — re-adding as user-optional, not default

---

## Phase 0 — Cloud AI Integration
**Scope:** ~1 day | **Value:** Highest per-effort of all phases — unlocks the game for users with no local setup

### 0.1 — Auth header in `localAI.js`
**File:** `localAI.js:241-248` (the `makeRequest()` headers block)

Add conditional `Authorization` header:
```js
const headers = {
    'Content-Type': 'application/json',
};
if (this.apiKey) {
    headers['Authorization'] = `Bearer ${this.apiKey}`;
}
```

Add `apiKey` field to `LocalAIClient`:
- Initialize as `null`
- Load from `localStorage.getItem('adv.apiKey')` in `loadConfiguration()`
- Expose `setApiKey(key)` method (mirrors existing `setUrl(url)`)

**Security note:** API key stored in localStorage is visible to JS. This is acceptable for a client-side game where users own their own keys. Never hardcode a key.

### 0.2 — Provider configs in `config.js`
Add cloud provider presets after the existing backend configs:

```js
// Cloud provider presets (user-configured, no hardcoded keys)
CLOUD_PROVIDERS: {
    openrouter: {
        name: 'OpenRouter (Gemma 4 31B — Free)',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'google/gemma-4-31b-it:free',
        signupUrl: 'https://openrouter.ai',
        contextWindow: 131072,
        maxOutputTokens: 2048,
    },
    groq: {
        name: 'Groq (Llama 3.3 70B — Free)',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        signupUrl: 'https://console.groq.com',
        contextWindow: 128000,
        maxOutputTokens: 2048,
    },
    googleai: {
        name: 'Google AI Studio (Gemini Flash Lite — Free)',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-2.5-flash-lite',
        signupUrl: 'https://aistudio.google.com',
        contextWindow: 1000000,
        maxOutputTokens: 2048,
    },
},
```

Extend `getActiveBackendConfig()` to return cloud provider config when `LLM_BACKEND === 'cloud'`.

### 0.3 — Settings UI in `index.html`
Extend the existing Local AI Status screen (or add a new Settings tab) with:

```
AI Backend:
  ○ Local (llama.cpp / Gemma 3 4B)
  ● Cloud (free online AI)
  
Cloud Provider: [OpenRouter ▾]
API Key: [____________________] [Save]
[Get a free key →]   [Test Connection]

Status: ✓ Connected — Gemma 4 31B
```

Wire to `localStorage` via `localAI.setUrl()` and `localAI.setApiKey()`. Show the signup URL for the selected provider.

### 0.4 — Model name passthrough
The cloud providers use different model names than `local_ai_config.json`. When `LLM_BACKEND === 'cloud'`, use the provider config model name in the request payload instead of the local config model. One conditional in `localAI.js:makeRequest()`.

### 0.5 — Strip unsupported params for cloud
`cache_prompt: true` is a llama-server-only param — cloud APIs return errors or silently ignore it. Remove it from the request body when `LLM_BACKEND === 'cloud'`. Similarly, `top_k` is not standard — conditionally omit.

---

## Phase 1 — Bug Fixes
**Scope:** 2–3 days | All five are self-contained, no dependencies between them.

### 1.1 — Spellcasting async on load (`saveLoad.js:221`) — P0
**Problem:** `players.forEach(async (player) => { await Spells.initializePlayerSpellcasting(player) })` fires promises without awaiting the collection. Loaded games have no spell data before the next render.

**Fix:**
```js
// Before:
players.forEach(async (player) => {
    await Spells.initializePlayerSpellcasting(player);
});

// After:
await Promise.all(players.map(player => Spells.initializePlayerSpellcasting(player)));
```

**Test:** Load a saved game where a player had spells. Verify spell list is populated before first action.

### 1.2 — Status effects catalog (`engine.js:444`) — P0
**Problem:** Config module not imported; named status effects (Poison, Stun, Burn, etc.) created with no mechanical data — no damage-per-turn applies.

**Fix:**
1. Import Config at the top of `engine.js`
2. At line 444, replace the "rely on value's own data" comment with a catalog lookup:
```js
const catalogData = Config.STATUS_EFFECT_CATALOG?.[statusName.toLowerCase()] ?? {};
const effectData = { ...catalogData, ...providedData }; // providedData overrides catalog
```
3. Verify `Config.STATUS_EFFECT_CATALOG` exists with entries for common effects (Poison, Stun, Burn, Freeze, Blind, etc.). If the catalog doesn't exist in config.js, create it with standard RPG values.

**Test:** Combat encounter where enemy applies Poison. Verify player loses HP each turn.

### 1.3 — questProgressManager null checks (`initializationManager.js:51,59,76`) — P1
**Problem:** If the dynamic import of `questProgress.js` or `storyHooks.js` throws, all downstream `questProgressManager.initializeQuestProgress()` calls crash silently.

**Fix:** Wrap usage in null checks throughout initializationManager and any downstream callers:
```js
// Instead of direct access:
gameState.questProgressManager.initializeQuestProgress(theme);

// Use:
gameState.questProgressManager?.initializeQuestProgress(theme)
    ?? console.warn('questProgressManager not available — quests disabled this session');
```

Also add a `try/catch` around the dynamic import with a clear error log:
```js
try {
    const { QuestProgressManager } = await import('./questProgress.js');
    gameState.questProgressManager = new QuestProgressManager(gameState);
} catch (err) {
    console.error('Failed to load questProgress.js — quests disabled:', err);
    gameState.questProgressManager = null;
}
```

**Test:** Temporarily break the import path, verify game starts and logs a warning rather than crashing.

### 1.4 — Boss encounter double roll (`encounters.js:158 + 201`) — P1
**Problem:** Boss chance calculated at `determineEncounterType()` (line 158) and again inside `generateCombatEncounter()` (line 201-205). Second RNG roll can downgrade a boss encounter to a normal fight.

**Fix:** Remove the second boss check in `generateCombatEncounter()`. The encounter type was already determined by `determineEncounterType()` — pass it through as a parameter instead of re-rolling:
```js
// generateCombatEncounter(context) becomes:
// generateCombatEncounter(context, encounterType)
// Use encounterType directly, remove the isBoss re-check at line 201.
```

**Test:** Add temporary logging, trigger 20 encounters, verify boss designation is consistent from determination to generation.

### 1.5 — `getCurrentPlayer` side-effect mutation (`state.js:341`) — P1
**Problem:** `getCurrentPlayer()` mutates `gameState.currentPlayerIndex` as a recovery side effect when the index is invalid — a pure read operation that silently changes state.

**Fix:** Extract recovery mutation to a dedicated function:
```js
// New:
function repairPlayerIndex() {
    if (!gameState.players?.length) return;
    if (gameState.currentPlayerIndex >= gameState.players.length) {
        gameState.currentPlayerIndex = 0;
    }
}

// getCurrentPlayer becomes pure:
function getCurrentPlayer() {
    if (!gameState.players?.length) return null;
    return gameState.players[gameState.currentPlayerIndex] ?? gameState.players[0];
}
```

Call `repairPlayerIndex()` explicitly at turn boundaries (in `turnManager.js` advance logic), not inside the getter.

**Test:** Set `currentPlayerIndex` to an out-of-bounds value, call `getCurrentPlayer()` twice — index should not change between calls.

---

## Phase 2 — Death → Jail Mechanic
**Scope:** 3–4 days | Core gameplay change, must be done carefully.

### Current State
- `combat.js` → HP ≤ 0 → `isDowned = true` ✓
- `turnManager.js` → auto-revive after ~3 downed turns ✓  
- `resolution.js:handlePartyWipe()` → revives at same location with 1 HP, prompts AI to narrate "waking up captured" — but doesn't enforce it ✓ / ✗
- `consecutiveWipes >= 2` → hard game-over screen (this logic will be replaced)
- **Missing:** Forced jail location, breakout quest, jail mechanics, escape condition

### Design
When the entire party is wiped (all players downed and auto-revive window expires):
1. Players wake up in a jail cell — inventory partially confiscated, HP restored to 50%
2. A `jail_escape` mini-quest activates — objectives are flexible (AI decides HOW, not IF)
3. Completing the quest restores confiscated items and resumes the story at the capture location
4. Dying in jail (2nd wipe while imprisoned) → real game over (the execution route)
5. The hard `consecutiveWipes >= 2` game-over path is removed and replaced by this

### 2.1 — Jail location definition
**File:** `dynamicLocations.js`

Add a `jail` location type with theme-specific variants:
```js
JAIL_LOCATIONS: {
    fantasy:      { name: 'Dungeon Cell',       description: 'Stone walls, iron bars, distant torchlight.' },
    space:        { name: 'Detention Block',     description: 'Metal bulkheads, a force-field door, alarm lights.' },
    pirate:       { name: 'Ship\'s Brig',        description: 'Below decks, chains, the sound of waves.' },
    wild_west:    { name: 'Jailhouse Cell',      description: 'Wooden bars, a tin cup, a wanted poster on the wall.' },
    cyberpunk:    { name: 'Holding Cell',        description: 'Reinforced glass, neural dampeners, a guard drone.' },
    haunted:      { name: 'Oubliette',           description: 'A forgotten pit, dripping walls, distant wailing.' },
    // ... one per theme
    default:      { name: 'Jail Cell',           description: 'A small, locked room with no obvious way out.' },
}
```

The jail location is always accessible to the engine regardless of the current map — it's a special state, not a navigable location.

### 2.2 — Jail breakout quest definition
**File:** `questDefinitions.js`

```js
{
    id: 'jail_escape',
    title: 'Break Out of {jailName}',
    type: 'escape',
    hidden: false,
    priority: 'critical',  // Overrides main quest tracking while active
    objectives: [
        {
            id: 'assess_situation',
            description: 'Take stock of your surroundings',
            completed: false,
            optional: false,
        },
        {
            id: 'find_weakness',
            description: 'Find a way out — the bars, the guards, or something else',
            completed: false,
            optional: false,
        },
        {
            id: 'execute_escape',
            description: 'Get out',
            completed: false,
            optional: false,
        },
    ],
    failCondition: 'allPlayersDowned',   // Triggers real game over if party wiped while imprisoned
    onComplete: { action: 'resumeFromCapture' },
}
```

The objectives are deliberately vague — the AI narrator decides whether the player bribes a guard, picks a lock, digs a tunnel, starts a prison riot, or bluffs their way out. The quest just tracks that the escape arc completes.

### 2.3 — Wire party wipe to jail
**File:** `resolution.js:handlePartyWipe()`

Replace the current soft-revive + `consecutiveWipes` counter logic:

```
Current flow:
  party wipe → revive at 1HP same location → AI narrates "captured maybe" → 
  if (consecutiveWipes >= 2) → game over screen

New flow:
  party wipe → transition to jail location → restore HP to 50% → confiscate inventory →
  activate jail_escape quest → update AI system prompt →
  AI narrates the capture and waking up in jail →
  [player plays through jail escape] →
  quest complete → restore items → resume story at capture point
  
  Exception: if party wiped WHILE jail_escape quest is active →
  → show real game-over ("You were executed / you never escaped")
```

Key changes in `resolution.js`:
1. Remove `gameState.consecutiveWipes` counter and the `>= 2` check
2. After revive, call `transitionToJail()` (new function — see 2.4)
3. Build the jail-specific AI prompt: system prompt addition noting imprisonment, objectives, and that the narrator should present opportunities to escape
4. Remove the hard game-over path triggered by wipes; replace with `gameState.imprisoned` guard

### 2.4 — `transitionToJail()` function
**New function in `resolution.js`** (or a new `jailSystem.js`):

```js
function transitionToJail() {
    const theme = gameState.adventureTheme || 'fantasy';
    const jailLocation = JAIL_LOCATIONS[theme] || JAIL_LOCATIONS.default;

    // Confiscate: save weapons + most items, leave basic clothing/tools
    gameState.confiscatedItems = gameState.players.flatMap(p => {
        const confiscated = p.inventory.filter(item => item.type === 'weapon' || item.type === 'armor');
        p.inventory = p.inventory.filter(item => item.type !== 'weapon' && item.type !== 'armor');
        return confiscated;
    });

    // Confiscate gold (partial — 50% taken as "fees")
    gameState.players.forEach(p => {
        const taken = Math.floor(p.gold * 0.5);
        p.gold -= taken;
        gameState.confiscatedGold = (gameState.confiscatedGold || 0) + taken;
    });

    // Restore HP to 50%
    gameState.players.forEach(p => {
        p.hp = Math.max(1, Math.floor(p.maxHp * 0.5));
        p.isDowned = false;
    });

    // Set jail state
    gameState.imprisoned = true;
    gameState.captureLocation = gameState.currentLocation;
    gameState.currentLocation = jailLocation.name;

    // Activate jail quest
    questProgressManager?.activateQuest('jail_escape', {
        jailName: jailLocation.name,
        theme,
    });

    // Update UI
    UI.showJailNotification(jailLocation);
}
```

### 2.5 — `completeJailEscape()` function

Called when `jail_escape` quest's `execute_escape` objective completes:

```js
function completeJailEscape() {
    // Restore confiscated items
    const itemsToRestore = gameState.confiscatedItems || [];
    // Distribute back to original owners (or party leader if single player)
    // Partial restoration — narrative flavor: "you find most of your gear stashed nearby"
    const restoreCount = Math.ceil(itemsToRestore.length * 0.75);
    gameState.players[0].inventory.push(...itemsToRestore.slice(0, restoreCount));

    gameState.imprisoned = false;
    gameState.confiscatedItems = [];
    gameState.currentLocation = gameState.captureLocation || gameState.currentLocation;

    // Re-introduce AI system prompt back to main story context
    // Prompt: "The party has just escaped from {jailName}. Resume the main story..."
}
```

### 2.6 — Block actions while imprisoned (already partially done)
**Files:** `actionHandler.js`, `ui.js`

Add `gameState.imprisoned` check alongside the existing `isDowned` checks:
- Block equipment changes (imprisoned = gear confiscated)
- Block fast travel / location change (imprisoned = can't go anywhere)
- Allow: combat (fight guards), dialogue (talk to guards/cellmates), item use (anything in remaining inventory)

The AI narrator naturally gates escape through the quest objectives — the code just needs to prevent bypassing the jail via normal navigation.

---

## Phase 3 — Memory System Upgrade
**Scope:** 2–3 days | Can be done in parallel with Phase 2 if working on separate files.

### Current State
- `contextManager.js` — tiered compression by turn age (DETAILED/SUMMARY/ESSENCE/LEGEND) via regex heuristics ✓
- `memoryRetriever.js` — hybrid TF-IDF recency + similarity retrieval over arc summaries ✓
- Arc summaries stored in `gameState.arcMemory.summaries`, max 12, next summary at turn 5 ✓
- **Gap:** Compression uses regex/heuristics, not LLM summarization — summaries lose meaning
- **Gap:** Structured entity state not always injected first in system prompt

### 3.1 — LLM-based arc summarization
**File:** `contextManager.js` — replace the heuristic compressor

After every 6–8 turns (instead of the hardcoded `nextSummaryAtTurn: 5`), fire a background summarization call. This runs asynchronously after the player's turn completes — zero user-visible latency.

```js
async function generateArcSummary(rawTurns, startTurn, endTurn) {
    if (!rawTurns?.length) return null;
    try {
        const result = await localAI.makeRequest([
            {
                role: 'system',
                content: 'You are a story archivist for an adventure game. Summarize the following game events in exactly 2 sentences. Focus on: what happened, what changed, what the players now know or possess. Be specific about names, places, and outcomes.'
            },
            {
                role: 'user',
                content: rawTurns.join('\n')
            }
        ], {
            max_tokens: 100,
            temperature: 0.3,
        });

        return {
            turnRange: [startTurn, endTurn],
            summary: result,
            timestamp: Date.now(),
        };
    } catch (err) {
        // Fall back to existing heuristic compression — don't break gameplay
        console.warn('Arc summarization failed, using heuristic fallback:', err);
        return null;
    }
}
```

Schedule this call in `contextManager.js` after turn processing completes:
```js
// At end of each turn (non-blocking):
if (gameState.turn % 7 === 0) {
    const recentTurns = getLastNTurnsRaw(7);
    generateArcSummary(recentTurns, gameState.turn - 7, gameState.turn)
        .then(summary => {
            if (summary) {
                gameState.arcMemory.summaries.push(summary);
                // Evict oldest if over cap (12 summaries max per config)
                if (gameState.arcMemory.summaries.length > Config.MAX_ARC_SUMMARIES) {
                    gameState.arcMemory.summaries.shift();
                }
            }
        });
    // Do NOT await — runs in background
}
```

Update `nextSummaryAtTurn` to be a rolling value (`turn + 7`) rather than the static 5.

### 3.2 — Canonicalized entity state injection
**File:** `aiHandler.js:1055` (system prompt assembly)

Ensure the compact entity state block is always the **first** content after the role directive, before narrative history. Currently it may be buried mid-prompt.

```js
function buildEntityStateBlock() {
    const p = getCurrentPlayer();
    const state = gameState;
    
    const activeQuests = state.questProgressManager
        ?.getActiveQuests()
        ?.map(q => q.title)
        ?.join(', ') || 'none';

    const npcSummary = Object.entries(state.entityMemory?.npcs || {})
        .slice(0, 8)  // Cap at 8 most recent NPCs
        .map(([name, data]) => `${name}:${data.status}/${data.disposition}`)
        .join(', ') || 'none';

    const flags = Object.entries(state.storyFlags || {})
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .join(', ') || 'none';

    return [
        `[GAME STATE — Turn ${state.turn} | ${state.adventureTheme}${state.imprisoned ? ' | IMPRISONED' : ''}]`,
        `Player: ${p?.name}, HP ${p?.hp}/${p?.maxHp} | Gold ${p?.gold} | Quests: [${activeQuests}]`,
        `NPCs: {${npcSummary}}`,
        `Flags: {${flags}}`,
        `[END STATE]`,
    ].join('\n');
}
```

Inject this block at the very top of the system prompt (after the role/persona line, before any narrative).

**Why this matters:** Prevents the most common coherence failures — NPCs reappearing after death, resolved quests re-mentioned, items the player doesn't have being referenced. Takes ~300 tokens, worth every one.

---

## Phase 4 — God Mode Completion
**Scope:** 1–2 days | Power-user feature, post-story-completion reward.

### Current State
- God mode unlocks after `isGoalComplete` — the player has finished the main story
- UI exists, unlock popup exists, command input exists
- `generateGodModeResponse()` returns hardcoded `Math.random()` flavor text — never calls AI
- `processWorldCommand()`, `processNarrativeCommand()`, `processCharacterCommand()` are stubs

### 4.1 — Wire god mode commands to actual AI calls
**File:** `godMode.js:354-393`

Replace `generateGodModeResponse()` with a real AI call using a god-mode-specific system prompt:

```js
async function executeGodModeCommand(command, commandType) {
    const systemPrompt = buildGodModeSystemPrompt(commandType);
    
    const response = await localAI.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: command }
    ], {
        max_tokens: 400,
        temperature: 0.9,  // More creative for god mode
    });

    // Parse response for diff ops and apply to game state
    const diffOps = parseDiffOps(response);
    if (diffOps?.length) {
        engine.applyDiff(diffOps);
    }

    return response;
}
```

### 4.2 — God mode system prompts per command type

```js
function buildGodModeSystemPrompt(commandType) {
    const base = `You are the omnipotent narrator of an adventure game. The player has earned god mode by completing the main story. Honor their commands creatively and literally.`;
    
    const typePrompts = {
        world:     `${base} The player wants to change something about the world. Describe the change vividly and output game diff ops to apply it.`,
        narrative: `${base} The player wants to reshape the story. Accept their direction and advance the narrative accordingly.`,
        character: `${base} The player wants to modify their character. Apply the change and describe how it feels.`,
        spawn:     `${base} The player wants to summon or create something. Bring it into existence and describe its arrival.`,
        default:   `${base} Fulfill the player's command as literally as possible while making it narratively satisfying.`,
    };
    
    return typePrompts[commandType] || typePrompts.default;
}
```

### 4.3 — Apply returned diffs
The AI response in god mode should return standard diff ops (same format as regular narrative diffs). `engine.applyDiff()` already handles these. God mode just needs to pass the response through the same diff parsing pipeline rather than discarding it.

---

## Phase 5 — Mobile / WebLLM
**Scope:** ~2 weeks | Separate project phase, do not start until Phases 0–4 are complete and stable.

This phase is deferred. Notes for when it begins:

### 5.1 — Model update
Update `local_ai_config.json` to offer Gemma 3 4B as the default (replacing any older model). The cloud path (Phase 0) already handles the larger Gemma 4 31B via OpenRouter, which is the better mobile experience — users on phones likely want cloud anyway.

### 5.2 — WebLLM service worker
WebLLM ([github.com/mlc-ai/web-llm](https://github.com/mlc-ai/web-llm)) exposes an OpenAI-compatible in-browser engine. Integration plan:

1. Initialize WebLLM in a dedicated Web Worker on mobile detection
2. Register a service worker that intercepts `/v1/chat/completions` fetch calls and routes them to the WebLLM engine
3. Existing `localAI.js` calling code unchanged — it still fetches `/v1/chat/completions`, just now answered in-browser
4. Model: `google/gemma-3-4b-it` via MLC prebuilt (`mlc-ai/gemma-3-4b-it-q4f16_1-MLC` on HuggingFace)

WebGPU availability check:
```js
const hasWebGPU = navigator.gpu != null;
if (isMobile && hasWebGPU) {
    initWebLLM();      // ~2.5 GB model download on first run
} else if (isMobile) {
    suggestCloudMode(); // No WebGPU → push user to cloud option (Phase 0)
}
```

### 5.3 — First-run download UX
Mobile users need to download ~2.5 GB on first use. Show:
- Clear storage size warning before initiating
- Progress bar with download speed and ETA
- Cached after first download (browser IndexedDB via WebLLM's built-in cache)
- Option to skip and use cloud instead (cloud is the better mobile experience anyway)

### 5.4 — Fallback chain
```
WebGPU available → WebLLM (Gemma 3 4B, on-device, ~10–15 tok/s)
    ↓ unavailable
Cloud configured → OpenRouter / Groq / Google AI Studio
    ↓ no key
Show setup screen: "To play, either download AI (~2.5GB) or connect a free cloud API key"
```

---

## Execution Order

```
Phase 0 (Cloud AI)           ← Start here: highest value, ~1 day, unblocks all users
Phase 1 (Bug fixes)          ← 1.1–1.5, ~2 days, parallel to Phase 0 if desired
Phase 2 (Jail mechanic)      ← After Phase 1, ~3–4 days
Phase 3 (Memory upgrade)     ← Can parallel Phase 2 (different files), ~2 days
Phase 4 (God mode)           ← After Phase 3, ~1–2 days
Phase 5 (Mobile)             ← Separate project, after 0–4 are solid
```

**Total for Phases 0–4:** ~10–12 days of focused work  
**Phase 5:** ~2 weeks, separate planning document when ready

---

## Files Changed Per Phase

| Phase | Files Modified | Files Created |
|---|---|---|
| 0 | `localAI.js`, `config.js`, `index.html` | none |
| 1.1 | `saveLoad.js` | — |
| 1.2 | `engine.js`, `config.js` | — |
| 1.3 | `initializationManager.js` | — |
| 1.4 | `encounters.js` | — |
| 1.5 | `state.js`, `turnManager.js` | — |
| 2 | `resolution.js`, `dynamicLocations.js`, `questDefinitions.js`, `actionHandler.js`, `ui.js`, `state.js` | `jailSystem.js` (optional) |
| 3 | `contextManager.js`, `aiHandler.js` | — |
| 4 | `godMode.js` | — |
| 5 | `localAI.js`, `config.js`, `index.html` | `sw-llm.js`, `webllm-worker.js` |

---

## Open Questions to Answer Before Starting Each Phase

**Before Phase 0:**
- Should the API key be stored in localStorage or prompted each session? (localStorage is convenient but visible to any JS on the page — acceptable since this is a local game with no server)
- Should we default to cloud or local? Recommend: detect if local server is healthy on startup; if not, suggest cloud setup

**Before Phase 2:**
- Should all themes have a jail cell, or should some themes have a thematic equivalent (e.g., "Post-Apocalypse" could be "Raider Cage", "Space" could be "Cryopod")? → Yes, theme-specific jail already listed in 2.1
- What happens to a multi-player party — all captured together or split? → All captured together, simplest to implement and narratively coherent

**Before Phase 3:**
- The summarization call uses the same local AI model — if the server is slow, it could add background load. Cap the background call to max 2 concurrent summarization requests.

**Before Phase 4:**
- Is there a content policy concern with god mode? Since god mode requires finishing the game (adults), age-appropriate restrictions can be relaxed slightly. The system prompt should still include basic safety guidelines but can be less restrictive than the main game.
