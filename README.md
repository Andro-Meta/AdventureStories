# Adventure Stories

An AI-driven text adventure for 1–5 friends that runs in your browser or as an Android app. The storyteller is a free online AI (OpenRouter or Google AI Studio); you paste a free key once.

> *Made with ❤️ for Brookston, Vincent, Toby, and Katie by their Dad.*

---

## What it does

- **AI storyteller** narrates a multi-act adventure with persistent NPCs, locations, items, and consequences across hundreds of turns.
- **1–5 players** — solo or co-op, hot-seat style. Each player gets their own character, inventory, and HP.
- **Age-adaptive narration** — averages your whole party's ages and picks the right reading level (L1 ages 6–9 / L2 ages 10–14 / L3 ages 15+). A 7-year-old and a 35-year-old playing together get a middle-ground story.
- **Deterministic JSON-Patch engine** (`engine.js`) is the single mutation point — the narrator proposes state ops; the engine validates and applies them. Items can't be hallucinated, choices can't be meaningless, combat can't break down.
- **Hybrid retrieval memory** — TF-IDF + recency over scene summaries, plus mention-aware entity scoring. The narrator remembers the NPC you saved 60 turns ago.
- **130 distinct opening hooks** (13 themes × 10 archetypes) so each new game opens with a different inciting incident.
- **Clear path to win** — every game gets a goal and a 3-act quest; the header shows the chapter and the next step, and a one-line recap after each turn shows what changed.
- **God-mode endgame** — finish the main quest, earn 1,000 coins + a legendary weapon per player, then type anything: *"I have a million gold"*, *"I summon Ember the phoenix"*, *"Face me, Hollow King!"*. Earned items and stats persist when you start a new arc.

## Themes

Fantasy Kingdom · Space Exploration · Pirate Seas · Underwater World · Jungle Expedition · Utopian Future · Dinosaur Times · Arctic Adventure · Steampunk City · Haunted Mansion · Cyberpunk City · Wild West · Post-Apocalypse · Custom

---

## Play it (free online AI, nothing to install but Python)

1. **Windows:** double-click `easy.bat`. **Mac/Linux:** `python3 server.py`.
   It serves the game at `http://localhost:8321` (next free port if taken) and opens your browser.
   Keep using the same address: your key and saves are stored per address.
2. Get a free key (no credit card):
   - **OpenRouter** (default): <https://openrouter.ai/settings/keys>
   - or **Google AI Studio** (fastest, ~1–2 s per turn): <https://aistudio.google.com/apikey>
3. In the game: **⚙️ AI Settings → Cloud AI → pick the provider → paste the key → Save.**

The key lives only in this browser's localStorage; requests go straight from the browser to the provider.

### Free-tier limits (checked 2026-10-07)

| Provider | Models used | Limit | One turn |
|---|---|---|---|
| OpenRouter (default) | Nemotron 3 Super 120B → Nemotron 3 Ultra 550B → Gemma 4 31B (automatic fallback) | 20/min, **50 requests/day**; **1,000/day for good** after a one-time $10 credit purchase (free models never spend it) | 1 request, ~3–7 s |
| Google AI Studio | Gemini Flash-Lite | Free tier; daily cap shown in AI Studio | 1 request, ~1–2 s |

A new game costs about 6 requests (intro, goal, shop, starting place, spells per player); each turn
is 1 request (a second small one only if the choices come back unusable), plus a memory summary every
5 rounds. On 50/day that is ~40 turns; with the $10 credit (1,000/day) a long group session fits easily.
If the daily quota runs out the game says so instead of failing silently.

### Play on your phone (same Wi-Fi)

`server.py` prints a LAN URL like `http://192.168.x.y:8321`. Open it on the phone, paste a key in AI Settings
(keys are per device), and **Add to Home Screen** to install it as a PWA.

---

## Android

The Android app is the same game in a Capacitor wrapper, using the same online AI. See
[`mobile/README.md`](mobile/README.md) to build the APK (about 67 MB).

---

## Saves

Every game autosaves after each turn into its own slot ("Autosave <names> (<theme>) <id>"; the newest 5 are kept), and you can save named copies from the menu. **Continue Last Game** opens the newest save. Saves live in this browser's `localStorage` (prefix `AG-`).

---

## Offline tests (no browser, no AI server)

```bash
npm run audit              # all three suites
npm run audit:hooks        # 14 themes × 10 archetypes + quest hints + schemas
npm run audit:engine       # every applyDiff path + dedupe + turn cap + monotonicity
npm run audit:godmode      # main-quest-completion unlock, no extra gates
```

These run pure Node, no browser, no AI server, no network — perfect for CI.
`npm run audit` also runs `first_turn_check` (fresh game survives turn 1), `prompt_check` (no contradicting
formats, prompt size budget, multiplayer op targeting, tolerant parsing, fight-op order) and `loot_check`
(every loot roll yields an item in every theme).

### Live play-test tools (developer only)

- Put an OpenRouter key in `.env` (git-ignored; `powershell -File tools\set_key.ps1` prompts for it hidden).
- `node tools/key_proxy.mjs` forwards the game's OpenRouter calls and adds the key, so it never enters the
  page; `KEY_PROXY_DUMP=1` saves every request/response to `test-results/`.
- `node --experimental-loader ./tools/preload.mjs tools/turn_metrics.mjs` scores those dumps: latency, tokens,
  truncation, valid JSON, narration words, choice validity and engine-valid ops per call. The Playwright suite (`npm test`) covers the full UI / integration loop and still requires a live AI backend.

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
| `config.js` | Online AI providers (OpenRouter free models, Google AI Studio), game constants |
| `localAI.js` | Client for the online AI: retries, rate limits, JSON parsing |
| `saveLoad.js` | localStorage save/load + AG- migration |
| `ui.js` | All DOM updates — narrative, choices, player cards, quest panel |
| `server.py` | Static site server (port 8321+) |
| `easy.bat` | One-click launcher (Windows): runs `server.py` |
| `mobile/` | Capacitor wrapper + Android build instructions |
| `tools/audit.mjs` | Static validation: themes, hooks, quest hints, schemas |
| `tools/engine_audit.mjs` | Engine applyDiff coverage (every god-mode path) |
| `tools/godmode_audit.mjs` | Unlock condition matches README spec |
| `tests/smoke7.spec.js` | 26-test Playwright suite (themes, setup, save/load, full game loop) |

---

## Status

- ✅ **Phase 0** — Cloud AI backends (OpenRouter / Groq / Google AI), selectable in-game
- ✅ **Phase 1** — Architecture cleanup: JSON-Patch engine, age tiers, narrator pipeline
- ✅ **Phase 2** — Jail-escape mechanic, death handling, status effects
- ✅ **Phase 3** — Arc memory, story hooks, god-mode reward + retirement loop
- ✅ **Phase 3.5** — Combat log, reputation, side-quest engine, 130 opening variations
- ✅ **Phase 4** — God mode completion, quest rewards (1000 coins + legendary weapon), 5-player co-op, UI sync fixes, 26/26 tests green
- ✅ **2026-10** — Cloud-only AI (local/on-device models removed), one AI call per turn, story matches the dice, multiplayer turn fixes, quest win path with rewards, turn recap, per-game autosave, security fixes. Android APK rebuilt.

See `IMPLEMENTATION_PLAN.md` for the older roadmap.

---

## License

To be decided. Third-party assets follow their upstream licenses; AI output is generated by the provider you choose.
