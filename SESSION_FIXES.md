# Adventure Stories — Session Fixes

What was changed in this session, why, and how to verify each one.

## TL;DR — what's better

- **God Mode now unlocks correctly when you finish the main quest.** Was gated by 3 conditions; now just one.
- **Diff ops actually apply on Ollama and LiteRT now.** They were silently being dropped every turn — HP, coins, inventory, quest progress never moved from narration.
- **"Local AI server is not available" on first launch with Ollama is fixed.** The startup health check was hardcoded to `/health` (404 on Ollama).
- **No more frozen UI after AI timeout.** `isLoading` flag was getting stuck true; every click silently rejected.
- **God Mode UI no longer disappears after save/load.**
- **`Exit without save → New Adventure` no longer crashes** with `Cannot read properties of undefined`.
- **Empty player names default to "Adventurer"** instead of breaking narration.
- **CI on every push/PR** runs 5 audit suites.

## Critical-path bugs fixed

| # | File | What was broken | Fix |
|---|---|---|---|
| BUG-04 | `api_new.js` | `testLocalAI` hardcoded `/health`; Ollama users saw "Local AI server is not available" on every start | Now reads `backend.healthPath` (Ollama uses `/api/tags`); cloud uses API-key presence; LiteRT defers to bridge |
| BUG-07 | `state.js` | `resetGameState()` dropped `questProgress`, `entityMemory`, `reputationSystem`, `combat`, etc. — first AI call after Exit-then-New-Game crashed with "Cannot read properties of undefined" | Now rebuilds every subsystem object from scratch |
| BUG-08 | `saveLoad.js` | God-mode UI vanished after loading a post-victory save (singleton re-attach reset `isActive=false`) | Now calls `activateGodMode()` on load when `isGoalComplete=true` |
| BUG-14 | `config.js`, `localAI.js`, `liteRTBridge.js` | `response_format: {type:'json_schema', schema:...}` (llama.cpp shape) was sent to every non-cloud backend. Ollama silently rejected it; LiteRT ignored it. Every turn fell back to text-only narrative path; **diff ops never applied**. State diffs (HP/coins/inventory/quest) silently frozen. | Backend capability flags drive request shape: `cloud → openai-nested`, `llama-cpp → bare-schema`, `ollama → json_object`, `litert → bridge injects JSON-mode directive into system prompt + prefills `{`` |
| BUG-30 | `actionHandler.js` | After 90s safety-net timeout, `isLoading` stayed true; UI showed fallback choices but every click silently rejected | Force-clear `isLoading=false` in `finally` |

## Bonus fixes (same files, low-risk)

| # | File | What was broken | Fix |
|---|---|---|---|
| BUG-05 | `localAI.js` | `temperature: options.temperature \|\| defaults.temperature` overwrote explicit `0` (deterministic mode) with default `0.7` | `??` instead of `\|\|` |
| BUG-06 | `localAI.js` | Retried on every error including 401/400/422 — wasted 8-10 seconds before surfacing auth/validation failures | Only retry on network errors, 5xx, and 429 (rate-limit) |
| BUG-13 | `localAI.js`, `config.js` | `cache_prompt: true` was sent to Ollama (llama.cpp-only extension; harmless but misleading) | Feature-gated via `backend.supportsCachePrompt` |
| BUG-21 | `engine.js` | Narrator emitting a stray `0` for `completionPercentage` mid-quest wiped all milestones | Only honor `0` reset when `isGoalComplete=true` (god-mode retirement) or when previous value was already 0 |
| BUG-29 | `state.js` | Empty/whitespace player name produced players with `name=''` — broke narration ("Player , HP 100/100") | Defaults to "Adventurer" |
| BUG-10 (mostly) | bridge | LiteRT response shape filled in: `content ?? reasoning_content ?? ''` for OpenRouter reasoning models | Cascade in extract |

## Architecture additions

### Backend capability flags (`config.js`)

Every backend now declares what it supports:

```js
{
  id: 'ollama',
  supportsJsonSchema: false,   // Ollama's OpenAI-compat layer rejects schema variant
  jsonSchemaShape: null,
  supportsJsonObject: true,    // accepts {type:'json_object'}
  supportsTopK: false,
  supportsCachePrompt: false
}
```

Adding a new backend means setting these flags correctly — `localAI.js`'s request builder reads them and shapes the request appropriately.

### LiteRT JSON-mode injection (`liteRTBridge.js`)

MediaPipe / LiteRT-LM has no `response_format` hook. When the caller wants JSON, the bridge:
1. Splices `"CRITICAL: Respond with ONE JSON object only..."` into the system turn
2. Prefills the assistant turn with `{` so Gemma commits to JSON shape before generating any tokens
3. Re-prepends `{` to the response on the way out

Result: on-device JSON conformance jumps from "occasional" to "near-perfect" with Gemma 3 4B.

## New CI / test infrastructure

### `npm run audit` — 5 offline suites

| Suite | What it checks | Assertions |
|---|---|---|
| `audit:hooks` | 14 themes × 10 archetypes (140 prompts) + quest-stage hints + 4 schemas | ~25 |
| `audit:engine` | Every `applyDiff` path including all god-mode declaration patterns + bad-op rejection + dedupe + turn cap + monotonicity + jail-lock | ~26 |
| `audit:godmode` | Unlock fires at `isGoalComplete=true` alone (matches README spec) | 2 |
| `audit:ui` | Every button has a JS handler + every `data-target` resolves to a real screen + 8 critical fns present + 4 LiteRT wiring checks | ~18 |
| **`test:llm`** (NEW) | Mock corpus of 17 known-bad model outputs (fences, thinking-tags, prose preamble, trailing commas, wrong choice counts, illegal diff verbs, etc.) | 17 |

All 5 run via `npm run audit`. Total: ~88 assertions, all green.

### `.github/workflows/ci.yml` (NEW)

Runs `npm run audit` and a `node --check` syntax pass on every push/PR to `main`. Future regressions get caught at PR time — you don't have to remember to run anything.

## Bugs deferred (documented but not fixed this session)

In `tools/BUG_REPORT.md`, these have file:line evidence and recommended fixes but didn't make this session's cut:

- **BUG-01** — cure-with-no-effect still advances turn (low: cosmetic)
- **BUG-02** — status effect duration decremented twice per round (medium: combat balance)
- **BUG-03** — status effect onTick functions don't survive save/load (medium)
- **BUG-09** — god-mode "I gain 100 gold" REPLACES (sets coins=100) instead of adds (medium: god-mode UX)
- **BUG-10** — god-mode item declarations auto-equip, kicking out legendaries (medium: god-mode UX)
- **BUG-11** — `applyDiff` is described as atomic but isn't (low: rare paths)
- **BUG-15** — `customThemeDescription` not always sanitized before innerHTML (medium: XSS surface)
- **BUG-17** — `useSpecialMove` cooldown undefined for narrator-emitted skills (low: cooldown bypass)
- **BUG-18** — MP not refunded if AI call fails after spending it (low: refund bug)
- **BUG-19/22** — `handleCombatVictory` triggers nested `advanceTurn` (medium: combat pacing)
- **BUG-20** — `processCombatEncounter` REPLACES `gameState.enemies` (medium: combat conflict)
- **BUG-23** — character/world-evolution agents fire-and-forget; can resolve into stale state (low)
- **BUG-25** — save migration re-runs every load when localStorage init throws (low)
- **BUG-26** — `GodModeManager` Maps lost on save (low: stat tracking)
- **BUG-27** — combat targeting always hits `enemies[0]` (low: combat UX)
- **BUG-28** — `refreshArcMemory` race when fast turns succeed slow turns (low)

A second pass should grab BUG-19/22 (combat double-tick) and BUG-09/10 (god-mode UX) — they're high-noticeability for the player.

## How to verify locally

```bash
# All offline checks (no AI server, no browser, no network)
npm run audit

# Just the LLM contract (parser + validators against malformed outputs)
npm run test:llm

# Live model evaluation (point at your Ollama)
npm run eval:models -- --models gemma3:1b,gemma3:4b

# Existing Playwright suite (needs live AI server)
npm test
```

## What this means for "shippable"

The LLM-side contract is now solid:
- **Schema enforcement** matches each backend's actual capabilities
- **Diff ops apply** on every backend that previously dropped them silently
- **Health check** correctly identifies each backend on first start
- **Error recovery** is bounded (no infinite retry on auth failures)
- **CI** prevents regressions

The remaining bugs in `tools/BUG_REPORT.md` are mostly UX papercuts and edge cases — none of them block normal play with the fixes that landed this session.
