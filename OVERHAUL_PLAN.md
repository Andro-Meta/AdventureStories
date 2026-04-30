# Adventure Stories WebApp — Overhaul Plan

Generated 2026-04-29 from a full architecture + LLM audit. Three tiers, do them in order.

---

## Tier 1 — Fix what's misaligned (mechanical cleanup, ~1 day)

Goal: stop the project from being broken-on-paper. No new features, no model swap.

1. **Delete dead Python servers/tests.** Keep `working_ai_server.py` (the AI backend on :8001) and `server.py` (static file server on :8000). Delete: `test_fixed_server.py`, `test_working_server.py`, `test_ai_connection.py`, `test_local_ai.py`. Keep `setup_local_ai.py` and `start_game.py` if they are the install/launch entry points.

2. **Remove the orphan `SERVER_URL` constant** in `config.js:11`. `DEFAULT_URL` (line 16) is the live one.

3. **Reconcile the orchestrator.** `localAIOrchestrator.js` declares 8 agents that don't exist; the system silently falls back to single-call. Two acceptable resolutions: (a) leave the orchestrator file but delete the `gemmaHyperthreading.js` / `gemmaContextOptimizer.js` stubs and have the ~20 importer files call `localAIOrchestrator` directly; (b) delete the orchestrator entirely and route through `aiHandler` only. (a) is less invasive and preserves the path for Tier 3 multi-agent work.

4. **Fix `max_tokens` mismatch.** Server (`working_ai_server.py:26`) defaults to 100; config and the optimization doc say 2048. Make the server default match config.

5. **Decide on God Mode.** Either wire `gameState.godModeManager = new GodModeManager()` at init or remove the UI. Wiring is one line; UI removal is cleaner if the feature is dead.

6. **Repo hygiene.** Add a `.gitignore` excluding `__pycache__/`, `venv_local_ai/`, `models/` weights, `*.pyc`. Add a download/clear-error fallback in `working_ai_server.py` if `./models/minicpm-2b-128k/` is missing — currently the server crashes silently.

7. **Add streaming + real token counts** to `/v1/chat/completions`. SSE on server, incremental rendering on client. (Stretch goal for Tier 1; defensible to defer to Tier 2.)

---

## Tier 2 — Modernize the LLM layer (LANDED in code; user-side downloads pending)

Goal: replace early-2025 LLM scaffolding with 2026-grade tooling. The JS layer barely changes.

**Status as of 2026-04-29:** Items 1-3 implemented in code. Item 4 (streaming) deferred to Tier 2.5 — touches every render path and is best landed alongside the UI work in Tier 3.

### What landed

1. **Selectable backend** — `LLM_BACKEND` flag in `config.js` switches between `'minicpm-python'` (legacy, default) and `'llama-cpp'` (new, recommended). Both expose OpenAI-compatible `/v1/chat/completions`, so the JS layer is backend-agnostic. `getActiveBackendConfig()` exposes the URL and parameter defaults to `localAI.js`.

2. **JSON-schema-constrained choice generation** — new `schemas.js` defines `explorationChoicesSchema` and `combatChoicesSchema`. New `getAIResponseJSON()` helper sends the schema two ways for cross-backend compatibility: as an OpenAI-style `response_format: { type: "json_schema", ... }` and as llama.cpp's native top-level `json_schema` extension field. `aiHandler.js` now tries the JSON path first and falls back to the legacy bracket-format regex parser if JSON parsing fails — so this is additive, never breaking.

3. **Tolerant JSON extractor** — `parseJSONFromModelOutput()` in `localAI.js` slices from the first `{` to the last `}` and strips ``` fences before parsing, so partial-JSON output still works.

4. **llama-server launcher** — new `start_llama_server.py` boots `llama-cpp/llama-server.exe` with the right flags. `start_game.py` now detects `LLM_BACKEND` from config.js and dispatches to either it or `working_ai_server.py`.

5. **Setup script extension** — `setup_local_ai.py --backend llama-cpp` prepares directories and prints the manual download steps for the Tier 2 stack.

### User-side migration (manual, when ready)

To switch to the Tier 2 stack:

1. Run `python setup_local_ai.py --backend llama-cpp` to prep directories.
2. Download a llama.cpp release for your platform from <https://github.com/ggml-org/llama.cpp/releases>. NVIDIA users: pick a CUDA build. Extract into `./llama-cpp/` so `./llama-cpp/llama-server.exe` exists.
3. Download a Qwen3-8B GGUF (Q5_K_M recommended, ~5.7GB) from <https://huggingface.co/Qwen> and save as `./models/Qwen3-8B-Q5_K_M.gguf`. Update `LLAMA_CPP_CONFIG.MODEL_FILE` in `config.js` if your filename differs.
4. Set `LLM_BACKEND = 'llama-cpp'` in `config.js`.
5. Run `python start_game.py` — it will launch llama-server in a new window and the static web server in this one.

Roll back any time by setting `LLM_BACKEND = 'minicpm-python'` and re-running `start_game.py`. Both stacks coexist.

### Why the JSON path is a win even on the legacy MiniCPM backend

The MiniCPM Python server has no grammar/schema enforcement, so the schema field is ignored — but the JSON system prompt asking for "ONLY a JSON object" plus the tolerant `parseJSONFromModelOutput` extractor still works most of the time. When it fails, the legacy regex parser kicks in. So the JSON path is a free reliability bump on the current stack and a major quality-of-life fix on the new stack.

### Deferred (Tier 2.5)

- **Streaming end-to-end.** SSE from `llama-server`, EventSource on client, incremental DOM updates. Defer because it requires touching every consumer that today expects a fully-resolved string.
- **Migrating dynamic* modules to JSON.** `dynamicSpells`, `dynamicEnemies`, etc. still parse free-form text. Each is a small targeted refactor; group when working in those areas.

---

## Tier 3 — Smarter integrations (where "AI game" pays off)

Goal: features that actually move the experience, not just speed.

### What landed in this pass (2026-04-29)

1. **Rolling AI-summarized arc memory.** New `refreshArcMemory()` in `aiHandler.js` runs asynchronously after each successful turn. Every `SUMMARY_EVERY_N_TURNS` (default 5), it asks the LLM to distill the last stretch into 1-2 sentences and stores it in `gameState.arcMemory.summaries` (capped at `MEMORY_MAX_SUMMARIES`, default 12 — ~60 turns of campaign memory). The summaries are injected into every system prompt under `ADVENTURE MEMORY:`. Persists in saves. The pre-existing `contextManager.IntelligentContextCompressor` is still there but is purely heuristic; the new arc memory provides the real LLM-summarized layer it was missing.

2. **EAGLE-3 / speculative-decoding scaffolding.** `start_llama_server.py` now exposes `DRAFT_MODEL_FILE` (default `None`). Set it to a smaller GGUF that shares the main model's vocabulary (e.g. `Qwen3-0.6B-Q4_K_M.gguf` paired with Qwen3-4B) to enable `--model-draft` for 1.5-3x throughput. No code change required — just point at the file.

### Still queued (deferred)

3. **Generator/validator split.** Big model writes prose + proposed state diff; small Qwen3-4B validates the diff against game rules (legal item moves, HP bounds, item ownership). Requires designing a state-diff schema first — the LLM doesn't currently emit one. Substantial design work.

4. **MCP for game tools.** Expose dice rolls, inventory ops, save/load as MCP tools — `llama-server` speaks MCP natively. Replaces ad-hoc `dynamic*` modules with a clean tool surface.

5. **Vector-RAG entity memory.** Embed NPCs/locations/quests with `nomic-embed-text v2` (CPU-friendly) and retrieve top-k relevant entities per turn. Today the arc memory above carries the campaign-level recap; entity-level recall would be the next step. Requires a second llama-server instance running an embedding model OR transformers.js client-side.

6. **Scene illustrations.** SDXL (8GB+) or FLUX.2 Q4 (12GB+) via ComfyUI for inline scene art.

7. **Resurrect or retire `localAIOrchestrator`.** The orchestrator declares 8 agent classes that are never imported. `gemmaHyperthreading.processSpecialists` falls through to a single AI call. Either wire up the agents (`storyContinuityAgent`, `dynamicItemRegistry`, etc. — they exist as singletons elsewhere) or delete the registry to be honest about behavior.

---

## Known issues catalogued during audit

- `localAIOrchestrator.js` declares 8 agents (`storyContinuity`, `dynamicItems`, `encounters`, `enemies`, `locations`, `themeIntelligence`, `adaptiveAbilities`, `questProgress`) that are never instantiated; multi-agent calls silently fall back to single-LLM call.
- `aiHandler.js:287-303` regex-strict parser for `[Type=Good/Bad/Risky/Silly/Investigative]` — fails hard on any drift.
- `working_ai_server.py:26` defaults `max_tokens` to 100 vs config's 2048.
- `config.js:11` stale `SERVER_URL: 'http://localhost:8000'` (unused; `DEFAULT_URL` on :8001 is live).
- `gemmaHyperthreading.js` (compatibility stub) imported by 13 files: characterDevelopment, combat, difficultyAdaptation, dynamicBosses, dynamicChoices, dynamicEncounters, dynamicEnemies, dynamicItems, dynamicLocations, dynamicSpells, spellGeneration, storyVariations, worldEvolution.
- `gemmaContextOptimizer.js` imported by 7 files: characterDevelopment, difficultyAdaptation, dynamicBosses, dynamicChoices, dynamicEnemies, dynamicLocations, dynamicSpells.
- `godMode.js` defines `GodModeManager` but `gameState.godModeManager` (state.js:145) is never assigned `new GodModeManager()`. UI renders (ui.js:956-970) but does nothing.
- `__pycache__/` and `venv_local_ai/` committed to repo.
- No model download fallback if `./models/minicpm-2b-128k/` missing.
- Server returns full response only; `usage` fields hardcoded zero.
