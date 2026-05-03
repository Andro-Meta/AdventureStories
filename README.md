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

The game speaks OpenAI-compatible `/v1/chat/completions` and supports three backends. Switch via the in-game settings or `localStorage.setItem('adv.llmBackend', '...')`.

| Backend | When to use | Set via |
|---|---|---|
| **llama.cpp** (default) | Desktop with Gemma-3n GGUF downloaded | `'llama-cpp'` |
| **Ollama** | Ollama already installed and running | `'ollama'` |
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

## Saves

Save files use the prefix `AG-` in `localStorage`. Opening the game on an existing save automatically migrates any old `advStorySave_*` keys.

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
| `godMode.js` | Post-main-quest free-form authoring |
| `memoryRetriever.js` | TF-IDF + recency arc-memory retrieval |
| `schemas.js` | JSON schemas for narrator output |
| `config.js` | Backend selection, game constants, save prefix |
| `localAI.js` | HTTP client for all AI backends |
| `saveLoad.js` | localStorage save/load + AG- migration |
| `ui.js` | All DOM updates — narrative, choices, player cards, quest panel |
| `server.py` | Static site server (port 8000) |
| `start_llama_server.py` | llama-server launcher (port 8090) |
| `start_game.py` | Top-level orchestrator |
| `easy.bat` | One-click launcher (Windows) |
| `tests/smoke7.spec.js` | 26-test Playwright suite (themes, setup, save/load, full game loop) |

---

## Status

- ✅ **Phase 0** — Cloud AI backends (OpenRouter / Groq / Google AI), selectable in-game
- ✅ **Phase 1** — Architecture cleanup: JSON-Patch engine, age tiers, narrator pipeline
- ✅ **Phase 2** — Jail-escape mechanic, death handling, status effects
- ✅ **Phase 3** — Arc memory, story hooks, god-mode reward + retirement loop
- ✅ **Phase 3.5** — Combat log, reputation, side-quest engine, 130 opening variations
- ✅ **Phase 4** — God mode completion, quest rewards (1000 coins + legendary weapon), 5-player co-op, Ollama backend, UI sync fixes, 26/26 tests green
- 🟡 **Phase 5** — Mobile: WebLLM service worker + Gemma via WebGPU for fully offline on-device play

See `IMPLEMENTATION_PLAN.md` for the full roadmap and `OVERHAUL_PLAN.md` for the architecture audit.

---

## License

To be decided. Models, llama.cpp binaries, and third-party assets follow their respective upstream licenses.
