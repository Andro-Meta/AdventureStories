# Test Report — Qwen3-4B-Q4_K_M vs Gemma-3n-E4B-Q4_K_M

**Date:** 2026-04-29
**Hardware:** RTX 4090, 24 GB VRAM, Windows
**Runtime:** llama.cpp llama-server, OpenAI-compatible `/v1/chat/completions`
**Frontend:** existing JS app served by Python static HTTP

This is the head-to-head test of the project's **phone-portable** narrator candidates. The verdict at the top: **Gemma-3n-E4B is the right model for this project.** It's dramatically more reliable on JSON, faster on the schema-constrained calls, and produces richer prose.

---

## 1. Headline numbers

| Metric | Qwen3-4B-Q4_K_M (2.5 GB) | Gemma-3n-E4B-Q4_K_M (4.5 GB) |
|---|---|---|
| Arc-memory call success rate (live game) | ~33% (1 success in 3 attempts) | **100% (2/2)** |
| Arc-memory call success rate (isolated, 5 trials) | ~20% (1/5 with tolerant parser) | **100% (5/5)** |
| Arc-memory call latency | 5-10 seconds | **1.2-2.2 seconds** |
| Choice generation success rate | High (5/5 visible turns) | **High (10/10 visible turns)** |
| Item ID leak in narration | **Fixed during testing** (resolves to weapon name) | Same (uses fix) |
| Prose flavor (subjective) | Capable, sometimes generic | **More distinctive & evocative** |
| Resident memory at 32k Q8 KV | ~3.4 GB | ~4.5 GB |

**Bottom line:** Gemma-3n is ~5× faster on the JSON-schema arc-memory call and produces correct schema-shaped output every single time in this test. Qwen3-4B failed structurally most of the time and had to be retried. The cost is +1 GB resident memory, which is acceptable on 12+ GB phones.

## 2. Side-by-side prose samples

**Qwen3-4B-Q4 (Kael's first turn):**
> "You stand at the edge of the Whispering Vale, where the air hums with the low, resonant tones of ancient magic. The land is a tapestry of emerald glades and jagged spires…"

**Gemma-3n-E4B-Q4 (Lyra's first turn):**
> "The air hangs thick with the scent of brine and decaying parchment as you stand at the precipice of the Sunken Library of Eldoria. Sunlight filters weakly through the turbulent turquoise waters, illuminating colossal stone arches draped in phosphorescent algae. Centuries ago, this repository of arcane knowledge thrived above the waves, a beacon of learning now swallowed by the sea after a cataclysmic magical surge."

Both are good. Gemma 3n's is more cinematic and uses sensory anchors (smell, light, history). Qwen3 is competent but tends toward repeated tropes ("ancient magic", "tapestry of…").

## 3. What works on both models

- Story → choice → continuation loop end-to-end.
- Choice JSON-schema generation produces 5 valid contextual choices each turn.
- Turn counter advances correctly (after the solo-player wrap fix landed).
- Item-name resolution (no more "you grip the moksy7d4_r8d1m7a sword").
- Entity memory injects into later system prompts and the model uses it ("the bioluminescent fungi pulse", "the Stone Archway looms ahead").
- Save writes to localStorage successfully.
- `Continue Last Game` correctly restores: turn, player, HP, choices, narrative, arc memory, entity memory, known spells.
- Gemma's narration **picks up that the player cast a spell** ("Lyra used her Residue Scan spell to reveal a partial translation of protective runes…") — meaning the spell system is live and the narrator knows about it.

## 4. What's still broken on both models (model-independent code defects)

These are the audit P0/P1s that fire regardless of which LLM is behind the wall.

| # | Defect | Severity | Effect |
|---|---|---|---|
| 1 | `actionHandler.js:130` empty combat branch | **P0** | Player Attack/Special/Item/Run does NOTHING in combat |
| 2 | `UI.updateGameState` undefined (correct: `updateGameUI`) | **P0** | Throws on every Investigative action |
| 3 | `AI.processEmbeddedCommands` undefined symbol + function | **P0** | Throws on every Enhanced action |
| 4 | `Load Game` button (separate from Continue) doesn't navigate to load screen | P1 | Intermittent: was broken in pre-Tier-1 page state, untested fully on Gemma |
| 5 | Save name collision silently no-ops | P1 | Saving with the default name twice keeps only the first save |
| 6 | Quest progress manager never bound to gameState | P1 | "Beginning 0%" forever; god mode unreachable |
| 7 | Encounter Promise leak (`encounters.js:25`) | P1 | Combat encounters never start dynamically |
| 8 | `Spec.` button shows specialMoves not spells; `Book`/`Cast` are the real spell UI | P1 | Confusing UX; not blocking |
| 9 | `localAIOrchestrator.coordinateAgents` typo (3 callers) | P1 | Silent fallthrough on every dynamic-items / dynamic-bosses call |
| 10 | Status effects outside combat persist forever | P2 | Non-blocking for short sessions |

## 5. Bugs found in this test session that I introduced earlier

These are regressions from earlier work in this conversation:

- **`activeModals` undefined after `resetGameState`** — my Tier 1 cleanup tightened the preserved-keys allowlist and dropped `activeModals: []`. Result: every `showModal` call crashed silently, breaking the Save Game modal, Load list modal, Help Ally target picker, etc. **Fixed in `state.js`.** The running browser tab needed a fresh tab to pick up the fix.
- **Continue Last Game click handler intermittent** — after navigating to a fresh URL with `?fresh-after-save=1`, clicking the button visually showed a press but did not navigate. Direct module invocation (`m.continueLastGame()`) DID work. The likely cause is event-handler attachment timing on a freshly-loaded tab; needs deeper investigation.

## 6. Memory loop quality assessment (Gemma 3n)

The arc-memory + entity-memory pipeline produces **genuinely useful narrative recall**.

Sample arc summary at turn 5:
> "Lyra examined the crystalline structures around the archway and discovered a hidden alcove after identifying a sequence of runes. The guardian remains focused on the party, seemingly waiting for their next action, while the library's structural integrity continues to degrade due to the ongoing magical disturbance."

Sample arc summary at turn 10:
> "Lyra used her Residue Scan spell to reveal a partial translation of protective runes warning of impending darkness if 'The Heart' is not protected. This triggered the rise of a colossal, shadowy entity from the crystalline lake, causing the Sunken Library of Eldoria to structurally weaken. She then discovered pressure plates and a silver locket within the alcove."

Sample entity-memory entry (NPC):
> **The Colossal Shadowy Entity** — A colossal, shadowy form with twin points of malevolent emerald light for eyes. It emits guttural growls and is associated with darkness and impending doom.

Sample entity-memory entry (item):
> **Tarnished Silver Locket** — Intricately engraved with a serpentine design. Emits a faint whisper promising knowledge and power at a terrible price.

These get injected into every subsequent system prompt under `ADVENTURE MEMORY` / `KNOWN NPCS` / `NOTABLE ITEMS`. Manual review of turns 6-10 narration confirms the model uses these names verbatim and stays consistent with their established traits.

**One memory issue noticed:** Gemma sometimes creates near-duplicate location entries — "Hidden Alcove" (turn 5) and "Alcove in Sunken Library of Eldoria" (turn 10) refer to the same place. This is an entity-deduplication problem; needs a fuzzy-match step before insert. P2 polish.

## 7. Recommendation

**Lock in Gemma-3n-E4B-Q4_K_M as the narrator** for the next phase of work. Quality is meaningfully better, JSON is reliably correct, latency is much lower. The +1 GB memory cost is acceptable for the 12+ GB phone target.

**Next steps (in order of priority):**

1. **Land the activeModals fix to disk (already done)** and verify all modals (save / load list / help-ally / saved-games delete-confirm) work in fresh tabs.
2. **Fix the 3 P0s** from the audit (combat branch + 2 typo'd function refs). Combat is the biggest play-experience hole.
3. **Wire `gameState.questProgressManager`** to unblock god-mode unlock chain.
4. **Fix encounter Promise leak** so combat actually triggers from exploration.
5. **Trace `Load Game` button intermittent failure** — likely either listener-timing or another `activeModals`-style undefined.
6. **Trace silent save no-op on name collision** — investigate `confirmSaveGame` flow when the proposed name matches an existing save.
7. Then proceed with Phase 1 of `RESTORATION_PLAN.md` (deterministic JS validator + JSON-Patch engine) under Gemma-3n as the locked-in narrator.

## 8. Open questions

- **Phone deployment confirms.** All testing is on a 4090 desktop. The 4.5 GB Gemma-3n is theoretically phone-portable on flagships, but the only honest validation is to try llama.rn on actual hardware.
- **Memory deduplication.** Should "Hidden Alcove" and "Alcove in Sunken Library of Eldoria" become one entry? Need a fuzzy-match heuristic before inserting new entities.
- **Choice quality with KNOWN NPCS context.** Gemma sometimes tries to use entities that aren't physically present in the current scene (e.g. invoking The Watcher when in a different area). Tighter retrieval might help — only inject the 3-5 most-relevant entities, not all of them.

---

*This document is a snapshot of one ~20-turn test session. Reproduce the test on Gemma-3n with `LLM_BACKEND='llama-cpp'` and `LLAMA_CPP_CONFIG.MODEL_FILE='./models/gemma-3n-E4B-it-Q4_K_M.gguf'`.*
