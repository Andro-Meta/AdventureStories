// saveLoad.js
// Handles saving, loading, deleting game states, and related UI interactions.
//
// PHASE 4 PORT NOTE: This file currently uses `localStorage` directly.
// The async-shaped wrapper in `./storage.js` is in place for the React Native
// port — when porting, update these call sites to `await storage.setItem(...)`
// and replace storage.js's webBackend with an AsyncStorage / MMKV adapter.
// Doing the rip-and-replace was deferred to keep desktop save/load stable.

// --- Static Imports ---
import { gameState } from './state.js'; // Import gameState
import * as Roster from './roster.js';
import * as Config from './config.js';
import * as UI from './ui.js';
// Import functions from other new modules statically
import { getThemeName } from './aiHandler.js';
// CORRECTED IMPORT: resetGameState is in state.js
import { resetGameState } from './state.js';
// Need item generation for potential shop refresh on load
import { generateShopItems } from './items.js';




/**
 * Saves the current game state to local storage in the specified slot.
 * @param {string} slotName - The name to use for the save slot.
 * @returns {boolean} True if saving was successful, false otherwise.
 */
// Runtime-only or never read back: a saved in-flight promise came back as {}
// (truthy) and blocked every later summary; live services came back method-less.
const SKIP_IN_SAVE = new Set(['_arcMemoryRefreshInFlight', '_rewardsPromise', 'dynamicItemRegistry', 'dynamicSpellRegistry',
    'popupQueue', 'activeModals', 'reputationSystem', 'questProgressManager', 'relationshipMatrix', 'playerArchetypes',
    'worldStateHistory', 'divineTurn']);

export function saveGameToLocalStorage(slotName) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;

    if (!slotName) {
        log("SaveLoad ERROR: Save failed - No slot name provided.");
        if (UI.elements.saveError) UI.showError(UI.elements.saveError, "Please enter a save name.");
        return false;
    }
    const invalidChars = /[\\/:*?"<>|]/;
    if (invalidChars.test(slotName)) {
        log(`SaveLoad ERROR: Save failed - Invalid characters in slot name "${slotName}".`);
        if (UI.elements.saveError) UI.showError(UI.elements.saveError, "Save name contains invalid characters (\ / : * ? \" < > |).");
        return false;
    }
    if (UI.elements.saveError) UI.hideMessage(UI.elements.saveError);

    try {
        // One pass (10-10; it was clone, parse, clone again, then delete): runtime
        // objects and records nothing reads back are left out, Maps become
        // objects, and the god-mode manager writes itself (its toJSON).
        const json = JSON.stringify({ saveDate: Date.now(), gameState }, (k, v) => {
            if (SKIP_IN_SAVE.has(k)) return undefined;
            if (k === 'isLoading' || k === 'combatRoundInProgress' || k === 'handlingPartyWipe') return false;
            if (k === 'pendingConfirmation') return null;
            if (k === 'godModeManager') return gameState.godModeManager?.toJSON?.() ?? null; // its unlock state, not the class
            // Only replies since the last summary are ever read (by the next summary); the prompts never were.
            if (k === 'messageHistory' && Array.isArray(v)) {
                const since = gameState.arcMemory?.summaries?.slice(-1)[0]?.turn || 0;
                return v.filter(m => (m.turn || 0) > since).slice(-10).map(m => ({ turn: m.turn, response: m.response }));
            }
            // Choice records in the slim shape the reflection reads (older ones carried the whole roll).
            if (k === 'choicePatterns' && v) return Object.fromEntries([...(v instanceof Map ? v : Object.entries(v))].map(([id, list]) => [id, (list || []).map(c => c.outcome === undefined ? c
                : { turn: c.turn, type: c.type, stat: c.outcome?.roll ? (c.outcome.roll.stat || 'luck') : null, band: c.outcome?.roll?.band || null, text: String(c.text || '').slice(0, 120), significance: c.significance })]));
            return v instanceof Map ? Object.fromEntries(v) : v;
        });
        try { localStorage.setItem(Config.SAVE_GAME_PREFIX + slotName, json); }
        catch (e) {
            // Storage full: drop the oldest autosaves (never manual saves) and retry once.
            if (!(e instanceof DOMException && e.name === 'QuotaExceededError')) throw e;
            pruneAutosaves(1, Config.SAVE_GAME_PREFIX + slotName);
            localStorage.setItem(Config.SAVE_GAME_PREFIX + slotName, json);
        }
        log(`Saved: ${slotName}`);
        gameState.currentSaveSlot = slotName;
        return true;

    } catch (error) {
        log(`SaveLoad ERROR: Error saving game to slot "${slotName}"`, error);
        let userMessage = "Save failed. Check debug log for details.";
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
             userMessage = "Save failed: Storage limit reached. Delete old saves or clear browser data.";
        } else if (error instanceof TypeError && error.message.includes('circular structure')) {
             userMessage = "Save failed: Could not serialize game state (circular structure).";
        }
        if (UI.elements.saveError) UI.showError(UI.elements.saveError, userMessage);
        UI.showPopup(userMessage, 'error', 6000);
        return false;
    }
}

/**
 * Continues the most recent game save automatically
 * @returns {Promise<void>}
 */
/**
 * Autosave after every completed turn into the "Autosave" slot, so a closed
 * tab or crash costs at most one turn (there was no autosave at all).
 * "Continue Last Game" picks the newest save, which is usually this one.
 * The player's own slot stays the target of "Save" / "Save and Exit".
 */
// Save soon after a change outside the story turn (buy, sell, equip, use an
// item, a level-up pick, the inn): several taps in a row make one save, 400 ms
// after the last. A turn in progress saves itself when it ends. One save is
// ~2 ms on a PC for a 160 KB game (measured 10-09).
let saveTimer = null;
export function requestAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveTimer = null;
        if (gameState.isLoading) return; // the turn's own autosave covers it
        try { autosave(); } catch (e) { (window.displayVisualError || console.log)(`Autosave failed: ${e.message}`); }
    }, 400);
}

export function autosave() {
    if (!gameState.players?.length) return;
    rememberNames();
    try { Roster.rememberHeroes(gameState.players, gameState.adventureTheme); } catch (_) {} // heroes for other games
    // One autosave per game: a single shared slot meant starting a new game
    // overwrote the previous game's only copy.
    if (!gameState.gameId) gameState.gameId = Date.now().toString(36);
    const names = gameState.players.map(p => p?.name).filter(Boolean).join(' & ').replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
    const slot = `Autosave ${names} (${gameState.adventureTheme || 'adventure'}) ${gameState.gameId}`;
    const ownSlot = gameState.currentSaveSlot;
    try { saveGameToLocalStorage(slot); }
    finally { gameState.currentSaveSlot = ownSlot; }
    pruneAutosaves(5);
}

/** Names this game invented (people, places, villain), kept across games so
 *  the storyteller can be told not to reuse them. Newest 80. */
function rememberNames() {
    try {
        const em = gameState.entityMemory || {};
        const fresh = [...Object.keys(em.npcs || {}), ...Object.keys(em.locations || {}), gameState.questProgress?.villain]
            .filter(n => n && !(gameState.players || []).some(p => p?.name === n));
        // This game's own names stay usable here even after they drop out of
        // entity memory (the storyteller was told never to reuse its own villain).
        gameState.ownNames = [...new Set([...(gameState.ownNames || []), ...fresh])].slice(-80);
        const old = JSON.parse(localStorage.getItem('adv.usedNames') || '[]');
        const all = [...old.filter(n => !fresh.includes(n)), ...fresh].slice(-80);
        localStorage.setItem('adv.usedNames', JSON.stringify(all));
    } catch (_) { /* storage blocked: variety hint just stays empty */ }
}

/** Keep the newest `keep` autosaves (plus `exceptKey`); manual saves are never touched. */
function pruneAutosaves(keep, exceptKey = null) {
    try {
        const autos = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k !== exceptKey && k.startsWith(Config.SAVE_GAME_PREFIX + 'Autosave ')) {
                // The slot name ends in the game id (Date.now() in base 36), so
                // age comes from the key: no full parse of every save each turn.
                const date = parseInt(k.split(' ').pop(), 36) || 0;
                autos.push([k, date]);
            }
        }
        autos.sort((a, b) => b[1] - a[1]).slice(keep).forEach(([k]) => localStorage.removeItem(k));
    } catch (_) { /* storage unavailable: nothing to prune */ }
}

/**
 * Every save in one file (Michael 10-09: a phone reset or reinstall must not
 * lose a game). On the phone the Android share sheet sends it anywhere (Drive,
 * email, Files); in a browser it downloads.
 */
export async function exportSaves() {
    const saves = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(Config.SAVE_GAME_PREFIX)) saves[k] = localStorage.getItem(k);
    }
    const count = Object.keys(saves).length;
    if (!count) { UI.showPopup('No saves to export yet.', 'info'); return; }
    let heroes = null; try { heroes = JSON.parse(localStorage.getItem('adv.heroes') || 'null'); } catch (_) {}
    const json = JSON.stringify({ app: 'adventure-stories', version: Config.APP_VERSION, exportedAt: new Date().toISOString(), saves, heroes });
    const name = `adventure-stories-saves-${new Date().toISOString().slice(0, 10)}.json`;
    const cap = globalThis.Capacitor;
    try {
        if (cap?.isNativePlatform?.() && cap.Plugins?.Filesystem && cap.Plugins?.Share) {
            const { uri } = await cap.Plugins.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
            await cap.Plugins.Share.share({ title: 'Adventure Stories saves', files: [uri] });
        } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            a.download = name; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
        UI.showPopup(`Exported ${count} save${count > 1 ? 's' : ''}.`, 'success');
    } catch (e) {
        (window.displayVisualError || console.log)(`Export failed: ${e.message}`);
        UI.showPopup(`Export failed: ${e.message}`, 'error');
    }
}

/** Saves from an exported file; a save with the same name is replaced. Returns how many were imported. */
export async function importSaves(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { UI.showPopup('That file is not an Adventure Stories save file.', 'error'); return 0; }
    const saves = data?.saves && typeof data.saves === 'object' ? data.saves : null;
    if (data?.app !== 'adventure-stories' || !saves) { UI.showPopup('That file is not an Adventure Stories save file.', 'error'); return 0; }
    let n = 0;
    for (const [k, v] of Object.entries(saves)) {
        if (!k.startsWith(Config.SAVE_GAME_PREFIX) || typeof v !== 'string') continue;
        try { JSON.parse(v); localStorage.setItem(k, v); n++; } catch (_) { /* skip a broken or oversized save */ }
    }
    if (data.heroes && typeof data.heroes === 'object') { // saved heroes: add to (never wipe) this device's roster
        try { const mine = JSON.parse(localStorage.getItem('adv.heroes') || '{}'); localStorage.setItem('adv.heroes', JSON.stringify({ ...data.heroes, ...mine })); } catch (_) {}
    }
    UI.showPopup(n ? `Imported ${n} save${n > 1 ? 's' : ''}.` : 'No saves could be imported.', n ? 'success' : 'error');
    return n;
}

export async function continueLastGame() {
    const log = window.displayVisualError || console.log;
    log("SaveLoad: Looking for most recent save to continue...");
    
    try {
        // Get all save keys
        const saveKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(Config.SAVE_GAME_PREFIX)) {
                saveKeys.push(key);
            }
        }
        
        if (saveKeys.length === 0) {
            log("SaveLoad: No saved games found for continue");
            UI.showPopup('No saved games found. Start a new adventure!', 'info');
            return;
        }
        
        // Find the most recent save
        let mostRecentSave = null;
        let mostRecentDate = 0;
        
        for (const key of saveKeys) {
            try {
                const saveData = JSON.parse(localStorage.getItem(key));
                if (saveData && saveData.saveDate > mostRecentDate) {
                    mostRecentDate = saveData.saveDate;
                    mostRecentSave = key.replace(Config.SAVE_GAME_PREFIX, '');
                }
            } catch (error) {
                log(`SaveLoad: Error reading save ${key}:`, error);
            }
        }
        
        if (mostRecentSave) {
            log(`SaveLoad: Continuing most recent save: ${mostRecentSave}`);
            await loadGame(mostRecentSave);
        } else {
            UI.showPopup('No valid saved games found. Start a new adventure!', 'info');
        }
        
    } catch (error) {
        log("SaveLoad ERROR: Failed to find recent save:", error);
        UI.showPopup('Error accessing saved games. Start a new adventure!', 'error');
    }
}

/**
 * Loads game state from a specified slot in local storage.
 * Handles parsing, validation, and potential migration.
 * **REVISED:** Handles parsing and validation.
 * @param {string} slotName - The name of the save slot to load.
 */
export async function loadGame(slotName) {
    // Needs access to gameState, Config, UI, resetGameState (imported statically)
    // Needs generateShopItems from items.js (imported statically)
    const log = window.displayVisualError || console.log;
    log(`SaveLoad: Attempting to load game from slot: "${slotName}"`);
    if (UI.elements.loadError) UI.hideMessage(UI.elements.loadError);
    try { UI.clearCombatLog(); UI.showTurnRecap(''); } catch (_) {} // nothing from the previous game
    const savedJson = localStorage.getItem(Config.SAVE_GAME_PREFIX + slotName);

    if (!savedJson) {
        log(`SaveLoad ERROR: Load failed - No save data found for slot ${slotName}`);
        if (UI.elements.loadError) UI.showError(UI.elements.loadError, `Could not find save data for "${slotName}".`);
        return;
    }

    try {
        const loadedSave = JSON.parse(savedJson);
        log(`SaveLoad: Parsed save data for "${slotName}". Validating...`);

        if (!loadedSave || !loadedSave.gameState || !loadedSave.saveDate || !Array.isArray(loadedSave.gameState.players)) {
             log("SaveLoad ERROR: Invalid save file format. Missing key properties.", loadedSave);
             throw new Error("Invalid save file format.");
        }
        log(`SaveLoad: Save Format Version: ${loadedSave.saveFormatVersion || 'N/A'}`);

        // --- Data Migration ---
        // Migration logic can be added here if save format changes are needed in the future
        //      log(`SaveLoad Warning: Save data is old format (v${loadedSave.saveFormatVersion || 'undef'}). Migration might be needed.`);
        //      // loadedSave.gameState = migrateSaveData(loadedSave.gameState, loadedSave.saveFormatVersion);
        // }

        const loadedGameState = loadedSave.gameState;
        log(`SaveLoad: Save data validated. Loading state for Turn ${loadedGameState.turn}, Theme ${loadedGameState.adventureTheme}...`);

        // (Removed dead apiKeys/currentApiKeyIndex preservation — those
        // fields were dropped in Tier 1 alongside the external-API removal.)
        resetGameState();

        Object.assign(gameState, loadedGameState);
        log("SaveLoad: Loaded game state applied.");
        log(`=== LOADED GAME ${gameState.gameId || '?'} | ${gameState.adventureTheme} | ${(gameState.players || []).map(p => `${p.name} L${p.level || 1}`).join(', ')} | turn ${gameState.turn} | app ${Config.APP_VERSION} ===`);
        UI.resetFx?.(); // HP from another game must not fire hit/heal effects
        // Saves made while resetGameState built an incomplete narrativeContext
        // lack these arrays, and every turn after loading would crash on them.
        gameState.narrativeContext = gameState.narrativeContext || {};
        for (const k of ['significantEvents', 'discoveredSecrets', 'relationshipChanges', 'environmentalChanges']) {
            if (!Array.isArray(gameState.narrativeContext[k])) gameState.narrativeContext[k] = [];
        }
        gameState.isLoading = false;
        gameState._arcMemoryRefreshInFlight = null;
        
        // Phase 1.1: Validate and initialize spellcasting data for loaded
        // players. Previously this used `forEach(async ...)` which dropped
        // the promises on the floor — the function would return before any
        // spellcasting init completed, leaving combat without spell data.
        // Use Promise.all over a `.map()` so we await every player's init
        // before continuing to the rest of the load flow.
        if (gameState.players && Array.isArray(gameState.players)) {
            const playersNeedingInit = gameState.players.filter(p => p && !p.spellcasting);
            if (playersNeedingInit.length > 0) {
                try {
                    const Spells = await import('./spells.js');
                    if (Spells && Spells.initializePlayerSpellcasting) {
                        await Promise.all(playersNeedingInit.map(player =>
                            Promise.resolve(Spells.initializePlayerSpellcasting(player))
                                .then(() => log(`SaveLoad: Initialized missing spellcasting data for ${player.name}`))
                                .catch(err => log(`SaveLoad: Error initializing spellcasting for ${player.name}:`, err))
                        ));
                    }
                } catch (error) {
                    log(`SaveLoad: Error loading spells module:`, error);
                }
            }
        }

        // The choice records (the end-of-quest reflection reads them) are a Map in play.
        if (gameState.choicePatterns && !(gameState.choicePatterns instanceof Map)) gameState.choicePatterns = new Map(Object.entries(gameState.choicePatterns));

        // An autosave is not the player's slot: "Save and Exit" into it made a
        // manual save that pruneAutosaves later deleted.
        gameState.currentSaveSlot = slotName.startsWith('Autosave ') ? null : slotName;
        delete gameState.dynamicItemRegistry; // old saves carried method-less copies
        delete gameState.dynamicSpellRegistry;
        gameState.isLoading = false;
        gameState.pendingConfirmation = null;
        gameState.handlingPartyWipe = false;
        // Re-attach singleton subsystems whose prototypes were stripped by
        // JSON.stringify (godModeManager, questProgressManager). Without
        // this, methods on those objects become undefined after load —
        // god-mode unlock checks throw, quest milestone updates no-op.
        // Phase 0 audit P1 #15.
        try {
            const { godModeManager } = await import('./godMode.js');
            godModeManager.resetForNewGame?.(); // restoreFromJSON / isGoalComplete below re-unlock only won saves
            gameState.godModeManager = godModeManager;
            // BUG-26 fix: restore the Map-backed manager state from the
            // snapshot saved in saveGameToLocalStorage. Without this every
            // load resets custom-choice-history, achievement counters, and
            // creative-stats to zero.
            const gmSaved = loadedGameState._godModeSnapshot || loadedGameState.godModeManager;
            if (gmSaved && typeof gmSaved === 'object') godModeManager.restoreFromJSON?.(gmSaved);
            delete gameState._godModeSnapshot;
            // BUG-08 fix: re-attached singleton has fresh isUnlocked=false,
            // isActive=false. If the saved game was post-victory, restore
            // those flags so the golden god-mode input box renders again
            // and unlock conditions check resolves true.
            if (gameState.isGoalComplete === true) {
                godModeManager.isUnlocked = true;
                if (typeof godModeManager.activateGodMode === 'function') {
                    godModeManager.activateGodMode();
                }
                log('SaveLoad: God Mode restored from saved isGoalComplete=true.');
            }
        } catch (e) { log(`SaveLoad: re-attach godModeManager failed: ${e.message}`); }
        try {
            const { questProgressManager } = await import('./questProgress.js');
            // Preserve any saved quest-progress *data* that lives on the
            // manager singleton's properties. The manager itself is the
            // class-shaped wrapper; data is read from gameState.questProgress
            // which Object.assign already restored above.
            gameState.questProgressManager = questProgressManager;
        } catch (e) { log(`SaveLoad: re-attach questProgressManager failed: ${e.message}`); }
        log(`SaveLoad: Transient states set and Maps restored. Current save slot: "${slotName}"`);

        // --- Post-Load Adjustments ---
        if (!gameState.shopItems || gameState.shopItems.length === 0) {
            log("SaveLoad Warning: No shop items in loaded state. Regenerating shop...");
            gameState.shopItems = generateShopItems(gameState.adventureTheme, gameState.turn); // Use imported function
        } else {
             log(`SaveLoad: Loaded ${gameState.shopItems.length} shop items.`);
        }

        // Restore UI
        log("SaveLoad: Updating UI for loaded game...");
        UI.showScreen('gameScreen');
        UI.updateGameUI(); // Renders header, players, enemies, actions

        // History entries are {content: prompt, response: narration}; there is
        // no `role` field, so the old role==='assistant' search never matched.
        const lastNarration = gameState.currentNarrative
            || gameState.messageHistory?.slice().reverse().find(m => m.response)?.response;
        if (lastNarration) {
            UI.updateStoryText(lastNarration);
            log("SaveLoad: Restored last story text.");
        } else {
             log("SaveLoad Warning: No assistant message found in history to restore story text.");
             UI.updateStoryText("The adventure resumes...");
        }
        // Render the current choices immediately after loading. If the save
        // pre-dates Tier 2 (no currentChoices field) or the field is empty,
        // regenerate by re-running the system action so the player isn't
        // left staring at an empty action list.
        if (gameState.currentChoices && gameState.currentChoices.length > 0) {
            UI.renderChoices(gameState.currentChoices);
            log("SaveLoad: UI updated, current choices rendered.");
        } else {
            log("SaveLoad: No currentChoices in save (legacy format or empty); regenerating from narrative.");
            try {
                // Choices only: a full system turn rewrote the story and applied ops on load.
                const { requestChoicesOnly } = await import('./aiHandler.js');
                UI.renderChoices(await requestChoicesOnly(gameState.currentNarrative || '', !!gameState.inCombat));
            } catch (regenErr) {
                log(`SaveLoad: choice regeneration failed (${regenErr.message}); rendering empty list.`);
                UI.renderChoices([]);
            }
        }

        // Autosave slot names carry an internal id ("Autosave Michael (custom) muz4k0sy"): show the game instead.
        UI.showPopup(`Welcome back${gameState.players?.length ? ', ' + gameState.players.map(p => p.name).join(' & ') : ''}!`, 'success', 2500);
        log(`SaveLoad: Game "${slotName}" loaded successfully!`);

    } catch (error) {
        log(`SaveLoad ERROR: Error loading game from slot "${slotName}"`, error);
        if (UI.elements.loadError) UI.showError(UI.elements.loadError, `Failed to load save "${slotName}": ${error.message}. File might be corrupted.`);
        UI.showPopup(`Failed to load game: ${error.message}`, 'error', 6000);
    }
}


/**
 * Deletes a save slot from local storage and updates UI lists.
 * @param {string} slotName - The name of the slot to delete.
 */
export function deleteSaveSlot(slotName) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
    if (!slotName) {
         log("SaveLoad Warning: Delete save failed - No slot name provided.");
         return;
    }
    log(`SaveLoad: Attempting to delete save slot: "${slotName}"`);
    try {
        localStorage.removeItem(Config.SAVE_GAME_PREFIX + slotName);
        log(`SaveLoad: Save slot "${slotName}" deleted from localStorage.`);
        UI.showPopup(`Save "${slotName}" deleted.`, 'success');

        if (gameState.currentScreen === 'loadGameScreen') {
            log("SaveLoad: Refreshing load screen list after delete.");
            listSaves();
        }
        if (UI.elements.saveGameModal && !UI.elements.saveGameModal.classList.contains('hidden')) {
             log("SaveLoad: Refreshing save modal overwrite list after delete.");
             populateOverwriteList();
        }
        if (gameState.currentSaveSlot === slotName) {
             log("SaveLoad: Deleted the currently active save slot. Clearing tracker.");
             gameState.currentSaveSlot = null;
        }
    } catch (error) {
        log(`SaveLoad ERROR: Error deleting save slot "${slotName}"`, error);
        UI.showPopup(`Failed to delete save "${slotName}".`, 'error');
    }
}

/**
 * Lists available save slots from local storage, validates them, updates UI, and returns the list.
 * @returns {{key: string, data: object}[]} Array of valid save objects.
 */
export function listSaves() {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
     log("SaveLoad: Listing available save slots...");
     const saves = [];
     let keysToRemove = [];
     for (let i = 0; i < localStorage.length; i++) {
         const key = localStorage.key(i);
         if (key?.startsWith(Config.SAVE_GAME_PREFIX)) {
             try {
                 const rawData = localStorage.getItem(key);
                 const data = JSON.parse(rawData);
                  if (data && data.saveDate && data.gameState && Array.isArray(data.gameState.players)) {
                      saves.push({ key, data });
                  } else {
                      log(`SaveLoad Warning: Invalid save data structure in key: ${key}. Skipping.`);
                  }
             } catch (error) {
                  log(`SaveLoad Warning: Could not parse save data for key: ${key}. Error: ${error}. Skipping.`, error);
             }
         }
     }
     log(`SaveLoad: Found ${saves.length} valid save slots.`);
     if (gameState.currentScreen === 'loadGameScreen') {
          UI.renderSavedGamesList(saves);
     }
     return saves;
 }


/** Opens the save game modal and populates the overwrite list. */
export function openSaveGameModal() {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
    log("SaveLoad: Opening save game modal...");

    if (!UI.elements.saveGameModal || !UI.elements.saveGameNameInput || !UI.elements.saveError) {
         log("SaveLoad ERROR: Cannot open save modal - Required UI elements missing.");
         return;
    }
    UI.hideMessage(UI.elements.saveError);

    const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let themePart = 'Game';
     try { themePart = getThemeName().substring(0, 15); } catch(e) { log("SaveLoad Warning: Error getting theme name for save default.", e); }
    const defaultName = gameState.currentSaveSlot || `${themePart} - ${dateStr}`;
    UI.elements.saveGameNameInput.value = defaultName;
    log(`SaveLoad: Default save name set to: "${defaultName}"`);

    populateOverwriteList();
    UI.showModal('saveGameModal');
    UI.elements.saveGameNameInput.focus();
}

/** Populates the overwrite list in the save modal. Helper function. */
function populateOverwriteList() {
     // (Unchanged)
     const log = window.displayVisualError || console.log;
     log("SaveLoad: Populating overwrite save list...");
     if (!UI.elements.overwriteSaveList || !UI.elements.existingSavesForOverwrite) {
         log("SaveLoad Warning: Overwrite list UI elements not found.");
         return;
     }
     UI.elements.overwriteSaveList.innerHTML = '';
     const saves = listSaves();

     if (saves && saves.length > 0) {
         saves.sort((a, b) => b.data.saveDate - a.data.saveDate);
         log(` -> Found ${saves.length} saves to list for overwrite.`);
         saves.forEach(save => {
             const saveName = save.key.substring(Config.SAVE_GAME_PREFIX.length);
             const date = new Date(save.data.saveDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const savedGameState = save.data?.gameState;
              let theme = 'Unknown Theme';
              if (savedGameState) {
                   const savedThemeId = savedGameState.adventureTheme;
                   const savedCustomDesc = savedGameState.customThemeDescription;
                    if (savedThemeId === 'custom' && savedCustomDesc) { theme = savedCustomDesc.substring(0, 15) + (savedCustomDesc.length > 15 ? '...' : ''); }
                    else if (savedThemeId) { const selectOption = document.querySelector(`#adventureTypeSelect option[value="${savedThemeId}"]`); theme = selectOption?.textContent || savedThemeId; }
              }
             const button = document.createElement('button');
             button.textContent = `${saveName} (${theme} - ${date})`;
             button.dataset.saveName = saveName;
             UI.elements.overwriteSaveList.appendChild(button);
         });
         UI.elements.existingSavesForOverwrite.classList.remove('hidden');
     } else {
         log(" -> No existing saves found for overwrite list.");
         UI.elements.existingSavesForOverwrite.classList.add('hidden');
     }
 }

/** Handles the primary confirmation click in the save game modal (Save button). */
export function confirmSaveGame() {
     // (Unchanged)
     const log = window.displayVisualError || console.log;
     log("SaveLoad: Confirm save button clicked.");

     if (!UI.elements.saveGameNameInput || !UI.elements.saveError || !UI.elements.saveGameModal) {
         log("SaveLoad ERROR: Cannot confirm save - Required UI elements missing.");
         return;
     }

     const slotName = UI.elements.saveGameNameInput.value.trim();
     if (!slotName) {
         UI.showError(UI.elements.saveError, "Please enter a name for your save file.");
         log("SaveLoad Validation Failed: Save name is empty.");
         return;
     }
       const invalidChars = /[\\/:*?"<>|]/;
       if (invalidChars.test(slotName)) {
           UI.showError(UI.elements.saveError, "Save name contains invalid characters (\ / : * ? \" < > |).");
           log(`SaveLoad Validation Failed: Save name "${slotName}" contains invalid characters.`);
           return;
       }
     UI.hideMessage(UI.elements.saveError);

     const existingKey = Config.SAVE_GAME_PREFIX + slotName;
     if (localStorage.getItem(existingKey)) {
         log(`SaveLoad: Save slot "${slotName}" exists. Confirming overwrite.`);
         UI.updateConfirmationModal('Overwrite Save?', `A save named "${slotName}" already exists. Overwrite it?`);
         UI.elements.confirmYesBtn.onclick = () => {
             log(`SaveLoad: Overwrite confirmed for "${slotName}". Attempting save...`);
             UI.hideModal('confirmationModal');
             if (saveGameToLocalStorage(slotName)) {
                 UI.hideModal('saveGameModal');
                 UI.showPopup(`Game saved as "${slotName}".`, 'success');
             } else {
                  log(`SaveLoad: Overwrite save failed for "${slotName}". Keeping save modal open.`);
             }
         };
         UI.showModal('confirmationModal');
     } else {
         log(`SaveLoad: Saving new game to slot "${slotName}".`);
         if (saveGameToLocalStorage(slotName)) {
             UI.hideModal('saveGameModal');
             UI.showPopup(`Game saved as "${slotName}".`, 'success');
         } else {
              log(`SaveLoad: Save failed for new slot "${slotName}". Keeping save modal open.`);
         }
     }
 }

/** Shows confirmation modal for deleting a save. */
export function confirmDeleteSave(slotName) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
     log(`SaveLoad: Requesting confirmation to delete save: "${slotName}"`);
     UI.updateConfirmationModal('Confirm Delete', `Are you sure you want to permanently delete the save file "${slotName}"? This cannot be undone.`);
     UI.elements.confirmYesBtn.onclick = () => {
         log(`SaveLoad: Deletion confirmed for "${slotName}".`);
         deleteSaveSlot(slotName);
         UI.hideModal('confirmationModal');
     };
     UI.showModal('confirmationModal');
 }


/** Shows confirmation modal for exiting to main menu, potentially saving first. */
export function confirmExitToMainMenu(shouldSave) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
     log(`SaveLoad: Requesting exit confirmation. Should save: ${shouldSave}`);
     let message = shouldSave ? "Save your progress and return to the main menu?" : "Are you sure you want to exit? Unsaved progress will be lost.";
     let title = shouldSave ? "Save and Exit?" : "Exit Without Saving?";

     UI.updateConfirmationModal(title, message);

     UI.elements.confirmYesBtn.onclick = () => {
         log(`SaveLoad: Exit confirmation 'Yes' clicked. Should save: ${shouldSave}`);
         UI.hideModal('confirmationModal');
         if (shouldSave) {
              log("SaveLoad: Attempting to save before exiting...");
              if (gameState.currentSaveSlot) {
                   log(` -> Saving to current slot: "${gameState.currentSaveSlot}"`);
                  if (saveGameToLocalStorage(gameState.currentSaveSlot)) {
                       log(" -> Save successful. Exiting to main menu.");
                        resetGameState();
                       UI.showScreen('mainMenuScreen');
                  } else {
                       log(" -> ERROR: Failed to save game before exiting. Asking to exit without saving.");
                       UI.showPopup("Failed to save game. Exit anyway without saving?", "error", 5000);
                       confirmExitToMainMenu(false);
                  }
              } else {
                   // Never saved by hand: keep it in this game's autosave slot
                   // (before, Yes opened the Save dialog and did not exit).
                   log(" -> No manual slot; saving to the autosave slot and exiting.");
                   autosave();
                   UI.showPopup('Saved. Continue it any time from the main menu.', 'success', 3000);
                   resetGameState();
                   UI.showScreen('mainMenuScreen');
              }
         } else {
             log("SaveLoad: Exiting without saving. Resetting state.");
             resetGameState();
             UI.showScreen('mainMenuScreen');
         }
     };
     UI.showModal('confirmationModal');
 }