# Adventure Stories

An AI-driven, on-device text adventure that runs entirely in your browser. Plays on desktop, mobile, and everything in between — no cloud account required.

> *Made with ❤️ for Brookston, Vincent, Toby, and Katie by their Dad.*

---

## What it does

- **AI storyteller** narrates a multi-act adventure with persistent NPCs, locations, items, and consequences across hundreds of turns.
- **1–5 players** — solo or co-op, hot-seat style. Each player gets their own character, inventory, and HP.
- **Age-adaptive narration** — averages your whole party's ages and picks the right reading level (L1 ages 6–9 / L2 ages 10–14 / L3 ages 15+). A 7-year-old and a 35-year-old playing together get a middle-ground story.
- **Deterministic JSON-Patch engine** (`engine.js`) is the single mutation point — the narrator proposes state ops; the engine validates and applies them. Items can't be hallucinated, choices can't be meaningless, combat can't break down.
- **Hybrid retrieval memory** — TF-IDF + recency over scene summaries, plus mention-aware entity scoring. The narrator remembers the NPC you saved 60 turns ago.
- **130 distinct opening hooks** (13 themes × 10 archetypes) so each new game opens with a different inciting incident.
- **God-mode endgame** — finish the main quest, earn 1,000 coins + a legendary weapon per player, then type anything: *"I have a million gold"*, *"I summon Ember the phoenix"*, *"Face me, Hollow King!"*. Earned items and stats persist when you start a new arc.

## Themes

Fantasy Kingdom · Space Exploration · Pirate Seas · Underwater World · Jungle Expedition · Utopian Future · Dinosaur Times · Arctic Adventure · Steampunk City · Haunted Mansion · Cyberpunk City · Wild West · Post-Apocalypse · Custom

---

## AI backends

The game speaks OpenAI-compatible `/v1/chat/completions` and supports four backends. Switch via the in-game settings or `localStorage.setItem('adv.llmBackend', '...')`.

| Backend | When to use | Set via |
|---|---|---|
| **llama.cpp** (default desktop) | Desktop with Gemma-3n GGUF downloaded | `'llama-cpp'` |
| **Ollama** | Ollama already installed and running | `'ollama'` |
| **LiteRT** (auto-selected on Android) | Capacitor APK with on-device Gemma 3 1B | `'litert'` |
| **Cloud** | No local model — free OpenRouter / Groq / Google AI key | `'cloud'` |

### Option A — llama.cpp (highest quality, offline)

1. Install [Python 3.10+](https://www.python.org/downloads/).
2. Extract a [llama.cpp release](https://github.com/ggml-org/llama.cpp/releases) into `./llama-cpp/` so `llama-cpp/llama-server.exe` exists (CUDA build if you have NVIDIA).
3. Download [Gemma-3n-E4B-it-Q4_K_M.gguf](https://huggingface.co/unsloth/gemma-3n-E4B-it-GGUF) (~4.5 GB) into `./models/`.
4. **Windows:** double-click `easy.bat`. **Mac/Linux:** `python3 start_game.py`.

### Option B — Ollama (easiest local setup)

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull gemma3:27b`
2. Run `python server.py` (or `python3 server.py`) to start the static-file server.
3. Open `http://localhost:8000` and run in the browser console:
   ```js
   localStorage.setItem('adv.llmBackend', 'ollama')
   ```
4. Reload. The game will use Ollama on port 11434.

> **Tip:** Use `gemma3:27b` for best story quality, `gemma3:4b` or `qwen3.5:9b` for faster responses on smaller machines.

### Option C — Cloud (no local AI required)

Open the **Local AI Status** panel from the main menu and paste a free API key from [OpenRouter](https://openrouter.ai), [Groq](https://console.groq.com), or [Google AI Studio](https://aistudio.google.com). No credit card required for the free tiers.

### Play on your phone (same Wi-Fi)

The launcher prints a LAN URL like `http://192.168.x.y:8000`. Open that on your phone with `?backend=http://192.168.x.y:8090` appended to point at the desktop's AI server. **Add to Home Screen** to install as a PWA.

---

## Android (on-device LLM, Play Store-ready)

The Android build wraps this web app in Capacitor 8 and runs **Gemma 3 1B** (int4, ~600 MB) on-device through Google's **LiteRT-LM** runtime — no network required after install. Same web codebase, same prompts; the swap happens in `liteRTBridge.js`.

```bash
cd mobile
npm install
npm run add:android
# drop gemma3-1b-it-int4.task into android/app/src/main/assets/ (or wire Play Asset Delivery)
npm run sync && npm run open:android
```

The full guide — including Play Asset Delivery for the model, signing, and Play Console metadata — is in [`mobile/README.md`](mobile/README.md).

### Pick the right model for your phone

Before you commit to a default model, run the head-to-head benchmark against your local Ollama:

```bash
ollama pull gemma3:270m gemma3:1b gemma3:4b
npm run eval:models -- --models gemma3:270m,gemma3:1b,gemma3:4b
```

The script generates a markdown report scoring each model on the *actual* game prompts (5-of-each-type choices, narrative-with-diff, god-mode declarations, final-blow milestone trio). Score ≥ 0.85 means ship.

---

## Saves

Save files use the prefix `AG-` in `localStorage`. Opening the game on an existing save automatically migrates any old `advStorySave_*` keys.

---

## Offline tests (no browser, no AI server)

```bash
npm run audit              # all three suites
npm run audit:hooks        # 14 themes × 10 archetypes + quest hints + schemas
npm run audit:engine       # every applyDiff path + dedupe + turn cap + monotonicity
npm run audit:godmode      # main-quest-completion unlock, no extra gates
```

These run pure Node, no browser, no AI server, no network — perfect for CI. The Playwright suite (`npm test`) covers the full UI / integration loop and still requires a live AI backend.

---

## Project layout

| File | What |
|---|---|
| `index.html` + `style.css` | Static shell, PWA manifest, screens |
| `main.js` | Entry point + service-worker registration |
| `state.js` | Central `gameState` object + reset/init helpers |
| `engine.js` | JSON-Patch engine — only place state mutates |
| `aiHandler.js` | Prompt construction + narrator JSON pipeline |
| `actionHandler.js` | Player choice handling, combat, god-mode |
| `initializationManager.js` | Phased boot sequence with dependency resolution |
| `combat.js` | Combat math, status effects, equipment scaling |
| `resolution.js` | Combat/jail outcome handling + quest reward distribution |
| `questProgress.js` | Quest phase tracking + completion percentage |
| `questDefinitions.js` | 3-act main-quest scaffold + per-act narrator hints |
| `storyHooks.js` | 130 inciting-incident archetypes per theme |
| `godMode.js` | Post-main-quest free-form authoring (unlock = main quest done, period) |
| `memoryRetriever.js` | TF-IDF + recency arc-memory retrieval |
| `schemas.js` | JSON schemas for narrator output |
| `config.js` | Backend selection, game constants, save prefix, LiteRT config |
| `localAI.js` | HTTP client for all AI backends (LiteRT short-circuit included) |
| `liteRTBridge.js` | On-device LiteRT-LM bridge (Capacitor → @capgo/capacitor-llm) |
| `saveLoad.js` | localStorage save/load + AG- migration |
| `ui.js` | All DOM updates — narrative, choices, player cards, quest panel |
| `server.py` | Static site server (port 8000) |
| `start_llama_server.py` | llama-server launcher (port 8090) |
| `start_game.py` | Top-level orchestrator |
| `easy.bat` | One-click launcher (Windows) |
| `mobile/` | Capacitor wrapper + Android build instructions |
| `tools/audit.mjs` | Static validation: themes, hooks, quest hints, schemas |
| `tools/engine_audit.mjs` | Engine applyDiff coverage (every god-mode path) |
| `tools/godmode_audit.mjs` | Unlock condition matches README spec |
| `tools/eval_models.mjs` | Head-to-head benchmark of small Gemma variants |
| `tests/smoke7.spec.js` | 26-test Playwright suite (themes, setup, save/load, full game loop) |

---

## Status

- ✅ **Phase 0** — Cloud AI backends (OpenRouter / Groq / Google AI), selectable in-game
- ✅ **Phase 1** — Architecture cleanup: JSON-Patch engine, age tiers, narrator pipeline
- ✅ **Phase 2** — Jail-escape mechanic, death handling, status effects
- ✅ **Phase 3** — Arc memory, story hooks, god-mode reward + retirement loop
- ✅ **Phase 3.5** — Combat log, reputation, side-quest engine, 130 opening variations
- ✅ **Phase 4** — God mode completion, quest rewards (1000 coins + legendary weapon), 5-player co-op, Ollama backend, UI sync fixes, 26/26 tests green
- ✅ **Phase 5** — Capacitor + LiteRT-LM on-device LLM for Android. Gemma 3 1B default. Play Asset Delivery-ready. God Mode unlock fixed (was gated by 3 conditions instead of 1). Offline audit suite (30+ deep checks) green.

See `IMPLEMENTATION_PLAN.md` for the full roadmap and `OVERHAUL_PLAN.md` for the architecture audit.

---

## License

To be decided. Models, llama.cpp binaries, and third-party assets follow their respective upstream licenses.
