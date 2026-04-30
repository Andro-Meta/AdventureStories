// saveLoad.js
// Handles saving, loading, deleting game states, and related UI interactions.
//
// PHASE 4 PORT NOTE: This file currently uses `localStorage` directly.
// The async-shaped wrapper in `./storage.js` is in place for the React Native
// port — when porting, update these call sites to `await storage.setItem(...)`
// and replace storage.js's webBackend with an AsyncStorage / MMKV adapter.
// Doing the rip-and-replace was deferred to keep desktop save/load stable.

// --- Static Imports ---
import { gameState } from './state.js?cb=014'; // Import gameState
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
// Import functions from other new modules statically
import { pruneMessageHistory, getThemeName } from './aiHandler.js?cb=014';
// CORRECTED IMPORT: resetGameState is in state.js
import { resetGameState } from './state.js?cb=014';
// Need item generation for potential shop refresh on load
import { generateShopItems } from './items.js?cb=014';


/**
 * Saves the current game state to local storage in the specified slot.
 * @param {string} slotName - The name to use for the save slot.
 * @returns {boolean} True if saving was successful, false otherwise.
 */
export function saveGameToLocalStorage(slotName) {
    // (Unchanged)
    const log = window.displayVisualError || console.log;
    log(`SaveLoad: Attempting to save game to slot: "${slotName}"`);

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
        log("SaveLoad: Creating deep copy of gameState...");
        const stateToSave = JSON.parse(JSON.stringify(gameState));
        log("SaveLoad: Pruning message history for save...");
        stateToSave.messageHistory = pruneMessageHistory(stateToSave.messageHistory);
        stateToSave.isLoading = false;
        stateToSave.pendingConfirmation = null;
        stateToSave.handlingPartyWipe = false;
        
        // Convert Maps to Objects for JSON serialization
        if (stateToSave.choicePatterns instanceof Map) {
            stateToSave.choicePatterns = Object.fromEntries(stateToSave.choicePatterns);
        }
        if (stateToSave.relationshipMatrix instanceof Map) {
            stateToSave.relationshipMatrix = Object.fromEntries(stateToSave.relationshipMatrix);
        }
        if (stateToSave.playerArchetypes instanceof Map) {
            stateToSave.playerArchetypes = Object.fromEntries(stateToSave.playerArchetypes);
        }
        
        // Convert Dynamic Item Registry Maps to Objects
        if (stateToSave.dynamicItemRegistry) {
            const registry = stateToSave.dynamicItemRegistry;
            if (registry.generatedItems instanceof Map) {
                registry.generatedItems = Object.fromEntries(registry.generatedItems);
            }
            if (registry.contextualCache instanceof Map) {
                registry.contextualCache = Object.fromEntries(registry.contextualCache);
            }
            if (registry.themePatterns instanceof Map) {
                registry.themePatterns = Object.fromEntries(registry.themePatterns);
            }
            if (registry.storyRelevantItems instanceof Map) {
                registry.storyRelevantItems = Object.fromEntries(registry.storyRelevantItems);
            }
            if (registry.recentRequests instanceof Map) {
                registry.recentRequests = Object.fromEntries(registry.recentRequests);
            }
            if (registry.itemQualityScores instanceof Map) {
                registry.itemQualityScores = Object.fromEntries(registry.itemQualityScores);
            }
            if (registry.playerFeedback instanceof Map) {
                registry.playerFeedback = Object.fromEntries(registry.playerFeedback);
            }
        }
        // Ensure reputation system contextualized factions are not saved (they're regenerated)
        if (stateToSave.reputationSystem && stateToSave.reputationSystem.contextualizedFactions) {
            stateToSave.reputationSystem.contextualizedFactions = null;
        }
        
        const saveData = {
            saveFormatVersion: 2, // Updated for reputation system and new features
            saveDate: Date.now(),
            gameState: stateToSave
        };
        log(`SaveLoad: Saving data (Version: ${saveData.saveFormatVersion}, Date: ${new Date(saveData.saveDate).toLocaleString()})`);
        localStorage.setItem(Config.SAVE_GAME_PREFIX + slotName, JSON.stringify(saveData));
        log(`SaveLoad: Game saved successfully to slot: ${slotName}`);
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
        
        // Validate and initialize spellcasting data for loaded players
        if (gameState.players && Array.isArray(gameState.players)) {
            gameState.players.forEach(async (player) => {
                if (player && !player.spellcasting) {
                    try {
                        // Initialize spellcasting for players who don't have it
                        const Spells = await import('./spells.js?cb=014');
                        if (Spells && Spells.initializePlayerSpellcasting) {
                            Spells.initializePlayerSpellcasting(player);
                            log(`SaveLoad: Initialized missing spellcasting data for ${player.name}`);
                        }
                    } catch (error) {
                        log(`SaveLoad: Error initializing spellcasting for ${player.name}:`, error);
                    }
                }
            });
        }

        // Restore Maps from Objects
        if (gameState.choicePatterns && typeof gameState.choicePatterns === 'object' && !(gameState.choicePatterns instanceof Map)) {
            gameState.choicePatterns = new Map(Object.entries(gameState.choicePatterns));
        }
        if (gameState.relationshipMatrix && typeof gameState.relationshipMatrix === 'object' && !(gameState.relationshipMatrix instanceof Map)) {
            gameState.relationshipMatrix = new Map(Object.entries(gameState.relationshipMatrix));
        }
        if (gameState.playerArchetypes && typeof gameState.playerArchetypes === 'object' && !(gameState.playerArchetypes instanceof Map)) {
            gameState.playerArchetypes = new Map(Object.entries(gameState.playerArchetypes));
        }
        
        // Restore Dynamic Item Registry Maps from Objects
        if (gameState.dynamicItemRegistry) {
            const registry = gameState.dynamicItemRegistry;
            if (registry.generatedItems && typeof registry.generatedItems === 'object' && !(registry.generatedItems instanceof Map)) {
                registry.generatedItems = new Map(Object.entries(registry.generatedItems));
            }
            if (registry.contextualCache && typeof registry.contextualCache === 'object' && !(registry.contextualCache instanceof Map)) {
                registry.contextualCache = new Map(Object.entries(registry.contextualCache));
            }
            if (registry.themePatterns && typeof registry.themePatterns === 'object' && !(registry.themePatterns instanceof Map)) {
                registry.themePatterns = new Map(Object.entries(registry.themePatterns));
            }
            if (registry.storyRelevantItems && typeof registry.storyRelevantItems === 'object' && !(registry.storyRelevantItems instanceof Map)) {
                registry.storyRelevantItems = new Map(Object.entries(registry.storyRelevantItems));
            }
            if (registry.recentRequests && typeof registry.recentRequests === 'object' && !(registry.recentRequests instanceof Map)) {
                registry.recentRequests = new Map(Object.entries(registry.recentRequests));
            }
            if (registry.itemQualityScores && typeof registry.itemQualityScores === 'object' && !(registry.itemQualityScores instanceof Map)) {
                registry.itemQualityScores = new Map(Object.entries(registry.itemQualityScores));
            }
            if (registry.playerFeedback && typeof registry.playerFeedback === 'object' && !(registry.playerFeedback instanceof Map)) {
                registry.playerFeedback = new Map(Object.entries(registry.playerFeedback));
            }
        }

        gameState.currentSaveSlot = slotName;
        gameState.isLoading = false;
        gameState.pendingConfirmation = null;
        gameState.handlingPartyWipe = false;
        // Re-attach singleton subsystems whose prototypes were stripped by
        // JSON.stringify (godModeManager, questProgressManager). Without
        // this, methods on those objects become undefined after load —
        // god-mode unlock checks throw, quest milestone updates no-op.
        // Phase 0 audit P1 #15.
        try {
            const { godModeManager } = await import('./godMode.js?cb=014');
            gameState.godModeManager = godModeManager;
        } catch (e) { log(`SaveLoad: re-attach godModeManager failed: ${e.message}`); }
        try {
            const { questProgressManager } = await import('./questProgress.js?cb=014');
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
        // Potential stat recalculation - consider if necessary based on saved data version/consistency
        // gameState.players.forEach(p => p && Combat.recalculateCharacterStats(p));
        // gameState.enemies.forEach(e => e && Combat.recalculateCharacterStats(e));


        // Restore UI
        log("SaveLoad: Updating UI for loaded game...");
        UI.showScreen('gameScreen');
        UI.updateGameUI(); // Renders header, players, enemies, actions

        const lastAssistantMessage = gameState.messageHistory?.slice().reverse().find(m => m.role === 'assistant');
        if (lastAssistantMessage) {
            UI.updateStoryText(lastAssistantMessage.content);
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
                const { makeAICallForSystemAction } = await import('./aiHandler.js?cb=014');
                await makeAICallForSystemAction('Resume the adventure: regenerate the next set of player choices based on the current narrative and game state. Do not advance the turn.', true);
            } catch (regenErr) {
                log(`SaveLoad: choice regeneration failed (${regenErr.message}); rendering empty list.`);
                UI.renderChoices([]);
            }
        }

        UI.showPopup(`Game "${slotName}" loaded successfully!`, 'success');
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
     let message = shouldSave ? "Do you want to save your current progress before exiting?" : "Are you sure you want to exit? Unsaved progress will be lost.";
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
                   log(" -> No current save slot. Opening save modal instead of exiting.");
                   openSaveGameModal();
                   UI.showPopup("Please save your game first, then use the Menu to exit.", "info", 4000);
              }
         } else {
             log("SaveLoad: Exiting without saving. Resetting state.");
             resetGameState();
             UI.showScreen('mainMenuScreen');
         }
     };
     UI.showModal('confirmationModal');
 }