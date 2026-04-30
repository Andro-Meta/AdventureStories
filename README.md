# Adventure Stories

An AI-driven, on-device text adventure that runs entirely in your browser, talks to a local `llama.cpp` server, and adapts to ages 6–99. Finish the main quest and unlock **god mode** — type any free-form action and the world remembers it.

> *Made with ❤️ for Brookston, Vincent, Toby, and Katie by their Dad.*

---

## What it does

- **AI storyteller** narrates a multi-act adventure with persistent NPCs, locations, items, and consequences across hundreds of turns.
- **Deterministic JSON-Patch engine** (`engine.js`) is the single mutation point — the narrator can never directly change state, only propose ops the engine validates and applies. Stops items from being hallucinated, choices from being meaningless, combat from breaking down.
- **Hybrid retrieval memory** — TF-IDF + recency over scene summaries, plus mention-aware entity scoring. The narrator remembers the NPC you saved 60 turns ago.
- **Age-tier safety** (L1 6–9 / L2 10–14 / L3 15+) governs the narrator's content policy and reading level.
- **God-mode endgame** — once you finish the main quest, type *"I have a million gold"*, *"I summon Ember the phoenix as my familiar"*, *"Face me, Hollow King!"*, *"I retire from godhood and begin a new quest..."*. The engine + extractor honor your authorial power. Earned items, skills, and stats persist when you start a new mortal arc.
- **130 distinct opening hooks** (13 themes × 10 archetypes) so each new game opens with a different inciting incident.

## Themes

Fantasy Kingdom · Space Exploration · Pirate Seas · Underwater World · Jungle Expedition · Utopian Future · Dinosaur Times · Arctic Adventure · Steampunk City · Haunted Mansion · Cyberpunk City · Wild West · Post-Apocalypse · Custom

## Stack

- **Browser app**: vanilla JS modules + HTML/CSS, no framework. PWA installable. Service worker for offline shell loading.
- **Narrator**: Gemma-3n-E4B-it Q4_K_M (~4.5 GB) running on `llama.cpp`'s `llama-server`, OpenAI-compatible `/v1/chat/completions` with GBNF JSON-schema constrained output.
- **Validator**: deterministic JavaScript engine + path allowlist — no second LLM needed, saves ~2 GB resident.
- **Backend launcher**: Python (`server.py` for the static site, `start_llama_server.py` for the model).
- **Future**: React Native + `llama.rn` for on-device mobile (Phase 4 in `RESTORATION_PLAN.md`).

## Run it (Windows)

1. Install [Python 3.10+](https://www.python.org/downloads/) (check "Add Python to PATH" on install).
2. Install [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) — extract a release into `./llama-cpp/` so `llama-cpp/llama-server.exe` exists.
3. Download [Gemma-3n-E4B-it-Q4_K_M.gguf](https://huggingface.co/unsloth/gemma-3n-E4B-it-GGUF) into `./models/`.
4. Double-click **`easy.bat`**. It launches the AI server, the static-site server, and opens your browser.
5. Optionally download Gemma-3n-E2B for speculative decoding (1.5–3× narrator speedup) — see comments in `start_llama_server.py`.

The launcher prints a LAN URL like `http://192.168.x.y:8000` — open that on your phone (same Wi-Fi) with `?backend=http://192.168.x.y:8090` appended to play on a real mobile device with the desktop's GPU running the model. **Add to Home Screen** to install as a PWA.

## Run it (mac/Linux)

```bash
python3 start_game.py
```

(Same model + binary requirements as above.)

## Project layout

| File | What |
|---|---|
| `index.html` + `style.css` | Static shell, PWA manifest, screens |
| `main.js` | Entry point + service-worker registration with poison-recovery |
| `state.js` | Central `gameState` object + reset/init helpers |
| `engine.js` | JSON-Patch engine — the only place state mutates |
| `aiHandler.js` | Prompt construction + narrator JSON pipeline |
| `actionHandler.js` | Player choice handling, combat branch, custom-action / god-mode |
| `combat.js` | Combat math, status effects, equipment scaling |
| `questDefinitions.js` | 3-act main-quest scaffold + per-act narrator hints |
| `storyHooks.js` | 130 inciting-incident archetypes per theme |
| `godMode.js` | Post-main-quest free-form authoring |
| `memoryRetriever.js` | TF-IDF + recency arc-memory retrieval |
| `schemas.js` | GBNF / JSON schemas for narrator output |
| `server.py` | Static site server (port 8000+) |
| `start_llama_server.py` | llama-server launcher (port 8090) |
| `start_game.py` | Top-level orchestrator |
| `easy.bat` | One-click launcher (Windows) |
| `_bump_cb.mjs` | Dev-iteration cache-bust + service-worker version sync |
| `RESTORATION_PLAN.md` | Living roadmap + bug log + phase tracker |

## Status

- ✅ Phase 0–3: stop-the-bleeding cleanup, narrator+engine architecture, retrieval+age tiers, god-mode reward + retirement loop
- ✅ Phase 3.5: combat log strip, game-over screen, status effects wired, reputation surfaced, side-quest engine path, equipment auto-equip on god-mode declarations, 130-hook variation
- 🟡 Phase 4: pre-port prep done (PWA, remote-backend switch, storage abstraction, touch polish, network-first SW). React Native port + on-device model bundling next.

See `RESTORATION_PLAN.md` for the full audit, bug catalog, and per-phase commit history.

## License

To be decided. Models, llama.cpp binaries, and any third-party assets follow their respective upstream licenses.
