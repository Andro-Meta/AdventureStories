# Adventure Stories

**A choose-your-own-adventure game where a free AI is the storyteller.** Pick a world, name your heroes, and play through a story that is written live around every choice you make. It has dice rolls, fights, loot, a shop, levelling up and a real ending. Play solo or pass the phone around with up to five friends or family members.

It runs on Android (install the APK from [Releases](https://github.com/Andro-Meta/AdventureStories/releases)) or in any web browser on a PC. The AI is free: you paste a free key from Google, Groq or OpenRouter once, and the game handles the rest.

> *Made with ❤️ for Brookston, Vincent, Toby, and Katie by their Dad.*

---

## What it's for

Adventure Stories started as a dad's bedtime-story machine and grew into a full game. It is meant for:

- **Families and kids.** The story adapts to the youngest and oldest players at the table (reading levels for ages 6–9, 10–14 and 15+). A 7-year-old and a 35-year-old get a story both can follow. For younger players, fights show the effect of a hit without blood or wounds.
- **Reading practice that doesn't feel like homework.** Every turn is a short scene to read, or to hear: the 🔊 button reads it aloud.
- **Co-op play.** One to five heroes take turns on one device. Each has their own stats, bag, coins and special moves.
- **Endless replay.** 13 worlds plus a custom one you describe yourself, 130 different opening hooks, and a new story every time.
- **Anyone who wants a game that thinks.** The AI writes the story. The game itself enforces the rules (dice, damage, items and quests), so the story can't cheat or forget what you own.

---

## How a game plays

1. **Set up.** Choose 1–5 players, each player's age and name, and a world: Fantasy Kingdom, Space Exploration, Pirate Seas, Underwater World, Jungle Expedition, Utopian Future, Dinosaur Times, Arctic Adventure, Steampunk City, Haunted Mansion, Cyberpunk City, Wild West, Post-Apocalypse, or Custom.
2. **Explore.** Each turn the storyteller writes a scene and five choices. Each choice is one way of acting, and each shows its odds:
   - 💪 **Brave** · 🧠 **Clever** · 🥷 **Sneaky** · 💛 **Kind** · 🍀 **Luck** (an absurd long shot that pays off spectacularly if it works)
   - Each choice also has a danger level: no mark is **Safe**, ⚠ is **Bold**, ⚠⚠ is **Reckless**. Riskier choices pay more and can hurt when they fail.
   - The roll is a 20-sided die plus your stat. The story follows the dice, including critical successes and failures.
3. **Fight.** Encounters come regularly and foes scale with your level. Fights are classic turn-based RPG: you act, a short pause, then each foe answers once. No waiting on the AI between blows.
   - **Attack**, **Special** (special moves and spells), **Item** (your bag, in a fight), **Defend** (half damage until your next turn, plus a breather), **Run** (not from a boss).
   - When the fight ends, the storyteller tells how it ended, including the move that landed the final blow.
4. **Grow.**
   - **Levels:** XP from every roll, milestones and fights. Each level raises a stat (up to 10). Practising a stat raises it too.
   - **Specials get stronger** with your level and with use: mastery ranks I–V, cheaper at ranks III and V. **Every 2 levels you learn a new special**, picked from two that fit your world. Rare teaching scrolls teach more.
   - **Gear and loot** get better as you level: weapons with elements, armour, potions, MP tonics, cures, throwables, buffs and rare elixirs that raise a stat for good.
   - **Lucky charms** help luck rolls; two charms fuse into a stronger one.
   - **The shop** restocks as you play. Gear and charms are one per hero, so everyone in a group gets a shot.
5. **Breathers.** Rest spots, treasure, traps, strangers and puzzles show up between fights. You also catch your breath after every win.
6. **Win.** Every game has a goal and a 3-act quest that ends with a boss. The header shows the chapter and your next step.
7. **God mode.** Beat the main quest and the story is yours: type anything ("I summon a phoenix", "Face me, Hollow King!") and it happens.

Every game autosaves after each turn. You can also save named copies, export all your saves to a file and import them again (Load Game screen).

---

## Install

### Android (recommended)

1. Open the latest release on [GitHub Releases](https://github.com/Andro-Meta/AdventureStories/releases) on your phone and download the `.apk`.
2. Tap the download to install. The first time, Android asks you to allow installs from your browser.
3. **Updates:** the main menu shows a banner when a new version is out. Tap **Download and install**, then tap the finished download. Your saves and keys stay. You can also tap **Check for updates** under the menu.

### PC (any browser)

1. Install [Python 3](https://www.python.org/downloads/).
2. **Windows:** double-click `easy.bat`. **Mac/Linux:** run `python3 server.py`.
   This serves the game at `http://localhost:8321` (or the next free port) and opens your browser. Keep using the same address: keys and saves are stored per address.
3. On the same Wi-Fi, `server.py` also prints a LAN address (`http://192.168.x.y:8321`) that you can open on a phone or tablet.

---

## The free AI (set up once)

Open **⚙️ AI Settings**. The default is **★ Smart switcher**: it uses whichever free provider is fastest and has quota left, and switches when one is busy or out for the day. Paste any keys you have. One is enough, and more keys mean fewer interruptions. Each key box has a link to get that key.

| Provider | Get a free key | Notes |
|---|---|---|
| **Google AI Studio** (Gemini Flash-Lite) | <https://aistudio.google.com/apikey> | Fastest (about 1–3 s a turn). Use a project without billing so it stays free. A second key from another Google account doubles the daily quota. |
| **Groq** (Qwen) | <https://console.groq.com/keys> | Fast, no credit card. A second key from another account is supported. |
| **OpenRouter** (free Nemotron models) | <https://openrouter.ai/settings/keys> | 50 free requests a day, or 1,000 a day after a one-time $10 credit purchase. The game only ever uses the free models, so the credit is never spent. |

- **Your keys stay on your device.** They are stored only in the app (or browser) and sent only to the provider they belong to.
- The switcher understands each provider's errors: busy, rate-limited, or out for the day. It moves on without stopping the game, and if a call fails, the dice roll you made is undone so you can try again.
- A turn is usually one AI call.

---

## Sound, voice and accessibility

- **Read aloud:** the 🔊 button reads the story with your device's voice (Menu → Sound & Voice to turn on auto-read).
- **Sound effects and vibration** for dice, hits, heals, coins, crits and level-ups. All sounds are CC0 (see `sfx/CREDITS.txt`).
- **How to Play** guide in the menu.
- Built for phones held upright, and works on a PC screen too.

---

## For developers

The game is plain ES modules (no build step) in a Capacitor wrapper for Android.

- **Rules live in code, story lives in the AI.** The storyteller proposes changes as JSON operations. `engine.js` is the only place game state changes; it validates everything (items, foes, HP, quest steps), so the AI can't invent loot or break a fight.
- **Smart switcher:** `aiRouter.js` (ranking, health, speed) and `localAI.js` (calls, error classification, retries).
- **Choices:** `progression.js` (approaches, danger plans, rolls, pacing, specials' ranks) and `aiHandler.js` (prompts, repairing a choice set that comes back wrong).

### Tests (pure Node, no browser, no AI, no network)

```bash
npm run audit
```

This runs every suite:
- the engine, god-mode and story-hook audits;
- the prompt contract and first-turn checks;
- loot and shop;
- mechanics (fights, items, specials, saves);
- failover between AI providers;
- a fight simulator at levels 1–12, where foes and specials must stay balanced;
- a UI wiring audit;
- dead-code and dead-CSS checks.

### Build the Android APK

```bash
node mobile/sync-web.mjs          # copy the game into mobile/www
cd mobile && npx cap sync android # copy www into the Android project (needed for EVERY build)
cd android && ./gradlew assembleDebug
```

Builds use JDK 21. The APK is signed with the project's debug key, so every release installs over the last one and keeps saves and keys. See [`mobile/README.md`](mobile/README.md) for details.

### Project layout (main files)

| File | What |
|---|---|
| `index.html`, `style.css` | Screens and styles |
| `main.js` | Start-up, buttons, menus |
| `state.js` | The central `gameState` |
| `engine.js` | JSON-operation engine: the only place state changes |
| `aiHandler.js` | Prompts and the storyteller pipeline |
| `aiRouter.js`, `localAI.js`, `config.js` | Providers, smart switcher, AI calls |
| `actionHandler.js` | Choices, fights, items, specials |
| `combat.js`, `battle.js` | Fight rules, battle menu, level-ups |
| `progression.js` | Stats, rolls, choice mix, pacing, special ranks |
| `items.js`, `spells.js`, `spellCasting.js` | Loot, shop items, specials and learning new ones |
| `questProgress.js`, `questDefinitions.js`, `storyHooks.js`, `godMode.js` | Quest, acts, opening hooks, god mode |
| `memoryRetriever.js` | Story memory (what happened many turns ago) |
| `saveLoad.js` | Autosave, saves, export/import |
| `media.js`, `fx.js` | Read-aloud, sounds, vibration, hit effects |
| `updates.js` | "A new version is out" banner (GitHub Releases) |
| `ui.js` | Everything drawn on screen |
| `tools/` | Audits, simulators, phone and live-play test tools |
| `mobile/` | Android (Capacitor) project |

---

## License

To be decided. Sound effects are CC0 (credits in `sfx/CREDITS.txt`). Story text is generated by the AI provider you choose.
