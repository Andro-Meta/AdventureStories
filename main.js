// main.js (with visual error handling)
// Entry point for the Adventure Stories application

// --- Global Error Display Function ---
window.displayVisualError = (message, error = null) => {
    console.error(message, error || '');
    const errorLogContent = document.getElementById('errorLogContent');
    const errorLogContainer = document.getElementById('errorLogContainer');
    if (!errorLogContent || !errorLogContainer) { console.error("!! Error Log Container or Content not found in HTML !!"); return; }
    try {
        const errorLine = document.createElement('div');
        let errorDetails = error ? ` (${error.name || 'Error'}: ${error.message || String(error)})` : '';
        // Basic stack trace if available
        if (error && error.stack) {
            const stackLines = error.stack.split('\n').slice(0, 4).join('\n');
            // Heuristic to avoid logging DOM event objects directly which can be huge
            if (!(error instanceof Event) && typeof error !== 'string') {
                 errorDetails += `\nStack: ${stackLines}...`;
            }
        }
        errorLine.textContent = `[${new Date().toLocaleTimeString()}] ${message}${errorDetails}`;
        errorLogContent.appendChild(errorLine);
        // Auto-scroll to bottom
        errorLogContent.scrollTop = errorLogContent.scrollHeight;
    } catch (e) {
        // Prevent infinite loop if logging itself fails
        console.error("Could not append error to visual log:", e);
        if (!errorLogContent.textContent.includes("FAILED TO LOG ERROR")) {
             errorLogContent.textContent += `\n!! FAILED TO LOG ERROR: ${e.message} !!`;
        }
    }
}

// --- Start Execution Log ---
displayVisualError("main.js: Script starting execution.");

// --- Static Module Imports ---
let Config, gameState, UI, setup, actionHandler, saveLoad;
try {
    displayVisualError("main.js: Importing core modules...");
    Config = await import('./config.js?cb=014');
    ({ gameState } = await import('./state.js?cb=014'));
    UI = await import('./ui.js?cb=014');
    displayVisualError("main.js: Core modules imported successfully.");
    displayVisualError("main.js: Importing feature modules...");
    
    // Import loading manager first
    await import('./loadingManager.js?cb=014');
    displayVisualError('LoadingManager: Initialized with intelligent loading system');
    
    // Import local AI integration
    await import('./localAI.js?cb=014');
    displayVisualError('LocalAI: Integration initialized');
    
    setup = await import('./setup.js?cb=014');
    actionHandler = await import('./actionHandler.js?cb=014');
    saveLoad = await import('./saveLoad.js?cb=014');
    // Other modules like combat, items, turnManager, resolution are imported statically
    // within the modules that need them (actionHandler, aiHandler, etc.)
    displayVisualError("main.js: All feature modules imported successfully.");
} catch (moduleLoadError) {
    displayVisualError("main.js: CRITICAL ERROR DURING MODULE LOADING.", moduleLoadError);
    document.body.innerHTML = `<div style="color: red; background: black; padding: 20px; font-family: sans-serif;"><h1>Fatal Error</h1><p>Could not load essential game modules. See console/debug log.</p><pre>${moduleLoadError.message}\n${moduleLoadError.stack}</pre></div>`;
    throw moduleLoadError; // Stop execution
}


// --- DOMContentLoaded Handler Definition ---
const handleDOMContentLoaded = async () => {
    displayVisualError("main.js: DOMContentLoaded event handler STARTED.");
    try {
        if (!UI || !UI.elements) { throw new Error("UI module or UI.elements are not available after import!"); }
        displayVisualError("DOMContentLoaded: Verifying essential UI elements...");
        // Add more checks if needed, but these are critical
        if (!UI.elements.mainMenuScreen || !UI.elements.newGameBtn || !document.getElementById('errorLogToggleBtn')) {
            throw new Error("Essential UI elements (e.g., mainMenuScreen, newGameBtn, errorLogToggleBtn) not found in the DOM!");
        }
        displayVisualError("DOMContentLoaded: Essential UI elements verified.");

        displayVisualError("DOMContentLoaded: Calling setupEventListeners...");
        setupEventListeners(UI, setup, actionHandler, saveLoad); // Pass necessary modules
        displayVisualError("DOMContentLoaded: setupEventListeners call completed.");

        displayVisualError("DOMContentLoaded: Calling setup.initializeGame...");
        if (setup && typeof setup.initializeGame === 'function') {
            // Properly await — initializeGame is async (it health-checks the
            // local AI backend before showing the menu).
            await setup.initializeGame();

            // Check if Continue button should be shown
            updateContinueButtonVisibility();
            displayVisualError("DOMContentLoaded: setup.initializeGame call completed.");
        } else {
            throw new Error("setup module or setup.initializeGame function not available.");
        }
        displayVisualError("main.js: Adventure Stories Ready! (End of DOMContentLoaded handler)");
    } catch (domReadyError) {
         displayVisualError("main.js: CRITICAL ERROR during DOMContentLoaded handler.", domReadyError);
         // Try to show a popup if UI is partially available
         try { if(UI && UI.showPopup) UI.showPopup("Critical Error during startup. Check Debug Log.", "error", 10000); } catch (uiError) {/* Ignore */}
    }
};

// --- DOM Ready Check and Handler Attachment ---
if (document.readyState === 'loading') {
    displayVisualError("main.js: Adding DOMContentLoaded listener (DOM still loading)...");
    document.addEventListener('DOMContentLoaded', handleDOMContentLoaded);
} else {
    // DOM already loaded
    displayVisualError("main.js: DOM already loaded, calling handler directly.");
    // Use setTimeout to ensure it runs after current script execution finishes, letting imports resolve fully
    setTimeout(handleDOMContentLoaded, 0);
}
displayVisualError("main.js: DOMContentLoaded listener logic executed/scheduled.");

// Phase 4.0 + POISON RECOVERY: Service worker registration with one-shot
// stale-cache rescue.
//
// Why this exists: the FIRST version of sw.js used cache-first for state.js,
// setup.js, main.js, etc. Once installed, it served stale modules forever
// regardless of how many times we bumped ?cb=N (because main.js itself is
// loaded bare by the <script> tag, not through a cb-busted import). Symptom:
// users picked cyberpunk and got Fantasy Kingdom because state.js's
// resetGameState fix was never delivered.
//
// Recovery routine on first load with the new code:
//   1. If a SW is already registered, postMessage PURGE_CACHE and unregister
//      every registration, then hard-reload once. sessionStorage flag stops
//      the loop after one reload.
//   2. After recovery (or if no prior SW), register the new (network-first)
//      sw.js. The SW path is bare — never cb-busted — because the browser
//      identifies SWs by URL and a different URL = different SW instance.
//
// Skipped on file:// and `?nosw=1`.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw=1\b/.test(location.search)) {
    window.addEventListener('load', async () => {
        try {
            const recovered = sessionStorage.getItem('__sw_poison_recovered__');
            if (!recovered) {
                const regs = await navigator.serviceWorker.getRegistrations();
                if (regs.length > 0) {
                    for (const reg of regs) {
                        try { reg.active?.postMessage({ type: 'PURGE_CACHE' }); } catch (_) {}
                        try { await reg.unregister(); } catch (_) {}
                    }
                    sessionStorage.setItem('__sw_poison_recovered__', '1');
                    displayVisualError('SW poison-recovery: unregistered old worker, reloading once for fresh modules.');
                    location.reload();
                    return;
                }
                sessionStorage.setItem('__sw_poison_recovered__', '1');
            }
            const reg = await navigator.serviceWorker.register('./sw.js');
            displayVisualError(`SW registered: scope=${reg.scope}`);
        } catch (err) {
            displayVisualError(`SW registration failed (non-fatal): ${err?.message || err}`);
        }
    });
}


// --- Event Listener Setup Definition ---
function setupEventListeners(UI, setup, actionHandler, saveLoad) { // Added actionHandler parameter
    displayVisualError("setupEventListeners: Attaching listeners...");

    // Helper for robust listener attachment with logging
    const safeAddListener = (elementId, eventType, handler, handlerName) => {
        const element = document.getElementById(elementId);
        if (element) {
            displayVisualError(`Attaching listener: ${eventType} on #${elementId} for ${handlerName}`);
            // Use an async wrapper always to handle both sync and async handlers
            element.addEventListener(eventType, async (event) => {
                displayVisualError(`Event Triggered: ${handlerName} on #${elementId}`);
                try {
                    await handler(event); // Await the handler (works for both sync/async)
                } catch (e) {
                    displayVisualError(`Error in handler ${handlerName} for event ${eventType} on #${elementId}`, e);
                    // Optional: Show a generic error popup to the user
                    // UI.showPopup(`Error processing ${handlerName}.`, 'error');
                } finally {
                    displayVisualError(`Event Handling Complete: ${handlerName} on #${elementId}`);
                }
            });
        } else {
            displayVisualError(`Failed to add listener: Element #${elementId} for ${handlerName} not found!`);
        }
    };

    // Helper for adding listeners to NodeLists
    const safeAddListenerAll = (selector, eventType, handler, handlerNamePrefix) => {
        const elementsNodeList = document.querySelectorAll(selector);
        if (elementsNodeList && elementsNodeList.length > 0) {
            displayVisualError(`Attaching listener to ${elementsNodeList.length} elements matching selector '${selector}' for ${handlerNamePrefix}`);
            elementsNodeList.forEach((element, index) => {
                const specificHandlerName = `${handlerNamePrefix}_${index}`;
                const eventHandler = async (event) => {
                    displayVisualError(`Event Triggered: ${specificHandlerName} on element matching '${selector}'`);
                    try {
                         await handler(event, element, index); // Await handler (works for sync/async)
                    } catch (e) {
                         displayVisualError(`Error in handler ${specificHandlerName} for event ${eventType} on element matching '${selector}'`, e);
                    } finally {
                         displayVisualError(`Event Handling Complete: ${specificHandlerName}`);
                    }
                };
                element.addEventListener(eventType, eventHandler);
            });
        } else {
            displayVisualError(`Failed to add listener: No elements found for selector '${selector}' for ${handlerNamePrefix}.`);
        }
    };


    // --- Error Log Sidebar Button Listeners ---
    const errorLogContainer = document.getElementById('errorLogContainer');
    const errorLogToggleBtn = document.getElementById('errorLogToggleBtn');
    const errorLogClearBtn = document.getElementById('errorLogClearBtn');
    const errorLogCopyBtn = document.getElementById('errorLogCopyBtn'); // Get copy button
    const errorLogContent = document.getElementById('errorLogContent');

    // Toggle Button Listener
    if (errorLogToggleBtn && errorLogContainer) {
        safeAddListener('errorLogToggleBtn', 'click', () => { errorLogContainer.classList.toggle('hidden'); }, 'errorLogToggleBtn');
    } else { displayVisualError("setupEventListeners FATAL: Element #errorLogToggleBtn or #errorLogContainer not found!"); }

    // Clear Button Listener
    if (errorLogClearBtn && errorLogContent) {
        safeAddListener('errorLogClearBtn', 'click', () => { errorLogContent.innerHTML = ''; displayVisualError("Debug Log Cleared."); }, 'errorLogClearBtn');
    } else { displayVisualError("setupEventListeners Warning: Element #errorLogClearBtn or #errorLogContent not found."); }

    // Copy Button Listener
    if (errorLogCopyBtn && errorLogContent) {
        safeAddListener('errorLogCopyBtn', 'click', async () => { // Make handler async
            const logText = errorLogContent.textContent || '';
            if (!logText) {
                UI.showPopup("Log is empty.", "info", 1500); return;
            }
            try {
                await navigator.clipboard.writeText(logText); // Use modern clipboard API
                const originalIcon = errorLogCopyBtn.textContent; errorLogCopyBtn.textContent = '✅';
                setTimeout(() => { errorLogCopyBtn.textContent = originalIcon; }, 1500);
                UI.showPopup("Debug log copied!", "success", 1500);
            } catch (err) {
                displayVisualError(" -> ERROR copying log to clipboard:", err);
                UI.showPopup("Failed to copy log automatically.", "error", 2500);
                // Fallback: Select text (less reliable, requires user action)
                try {
                     const range = document.createRange(); range.selectNodeContents(errorLogContent);
                     const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
                     UI.showPopup("Log selected. Press Ctrl+C / Cmd+C.", "info", 3000);
                } catch(fallbackErr) { displayVisualError(" -> ERROR during fallback text selection:", fallbackErr); }
            }
        }, 'errorLogCopyBtn');
    } else { displayVisualError("setupEventListeners Warning: Element #errorLogCopyBtn or #errorLogContent not found."); }


    // --- Main Menu & Setup Navigation ---
    safeAddListener('newGameBtn', 'click', () => UI.showScreen('playerCountScreen'), 'newGameBtn');
    safeAddListener('continueGameBtn', 'click', async () => { await saveLoad.continueLastGame(); }, 'continueGameBtn');
    // Show the Load Game screen FIRST, then list saves. listSaves() only
    // renders into the saved-games list when currentScreen === 'loadGameScreen';
    // the previous order rendered nothing because the screen hadn't switched
    // yet. Phase 0 audit P0 #8.
    safeAddListener('loadGameBtn', 'click', () => { UI.showScreen('loadGameScreen'); saveLoad.listSaves(); }, 'loadGameBtn');
    safeAddListener('localAIBtn', 'click', () => showLocalAIStatus(), 'localAIBtn');
    safeAddListener('checkLocalAIBtn', 'click', () => showLocalAIStatus(), 'checkLocalAIBtn');
    safeAddListener('aboutBtn', 'click', () => UI.showScreen('aboutScreen'), 'aboutBtn');
    // saveApiKeyBtn removed - using local AI exclusively
    safeAddListener('adventureTypeNextBtn', 'click', setup.proceedToAgeInput, 'adventureTypeNextBtn');
    safeAddListener('ageInputNextBtn', 'click', setup.proceedToNameInput, 'ageInputNextBtn');
    safeAddListener('nameInputStartBtn', 'click', setup.completeSetupAndStartGameIntelligent, 'nameInputStartBtn'); // Is async - uses intelligent initialization

    // --- Listeners for NodeLists ---
    safeAddListenerAll('.playerCountBtn', 'click', (event, element) => {
        const count = parseInt(element.dataset.count); if (!isNaN(count)) { setup.handlePlayerCountSelection(count); } else { displayVisualError(`Invalid count in playerCountBtn: ${element.dataset.count}`); }
    }, 'playerCountBtn');
    safeAddListenerAll('.backBtn', 'click', (event, element) => {
        const targetScreen = element.dataset.target; if (targetScreen) { UI.showScreen(targetScreen); } else { displayVisualError(`Back button missing data-target attribute.`); }
    }, 'backBtn');
    safeAddListenerAll('.menuDirectBtn', 'click', (event, element) => {
        const target = element.dataset.target; if (!target) { displayVisualError("Menu direct button missing data-target."); return; }
        if (target === 'inventoryScreen') UI.renderInventory(); else if (target === 'shopScreen') UI.renderShop(); else if (target === 'specialMovesScreen') UI.renderSpecialMoves();
        // Set correct back button visibility for direct menu->subscreen navigation
        document.querySelectorAll('.backToGameBtn').forEach(b => b.classList.add('hidden'));
        document.querySelectorAll('.backToMenuBtn').forEach(b => b.classList.remove('hidden'));
        UI.showScreen(target);
    }, 'menuDirectBtn');
    safeAddListenerAll('.backToGameBtn', 'click', () => UI.showScreen('gameScreen'), 'backToGameBtn');
    safeAddListenerAll('.backToMenuBtn', 'click', () => UI.showScreen('menuScreen'), 'backToMenuBtn');


    // --- Specific Element Listeners ---
    safeAddListener('adventureTypeSelect', 'change', setup.handleAdventureTypeSelectionChange, 'adventureTypeSelect');
    safeAddListener('inventoryBtn', 'click', () => {
        UI.renderInventory();
        // Set correct back button visibility when coming from game screen
        document.querySelectorAll('.backToGameBtn').forEach(b => b.classList.remove('hidden'));
        document.querySelectorAll('.backToMenuBtn').forEach(b => b.classList.add('hidden'));
        UI.showScreen('inventoryScreen');
    }, 'inventoryBtn');
    safeAddListener('shopBtn', 'click', () => {
        UI.renderShop();
        document.querySelectorAll('.backToGameBtn').forEach(b => b.classList.remove('hidden'));
        document.querySelectorAll('.backToMenuBtn').forEach(b => b.classList.add('hidden'));
        UI.showScreen('shopScreen');
    }, 'shopBtn');
    safeAddListener('specialBtn', 'click', () => {
        UI.renderSpecialMoves();
        document.querySelectorAll('.backToGameBtn').forEach(b => b.classList.remove('hidden'));
        document.querySelectorAll('.backToMenuBtn').forEach(b => b.classList.add('hidden'));
        UI.showScreen('specialMovesScreen');
    }, 'specialBtn');
    safeAddListener('helpAllyBtn', 'click', actionHandler.openHelpAllyModal, 'helpAllyBtn');
    safeAddListener('menuBtn', 'click', () => UI.showScreen('menuScreen'), 'menuBtn');
    safeAddListener('customActionBtn', 'click', actionHandler.handleCustomAction, 'customActionBtn'); // Is async
    safeAddListener('resumeBtn', 'click', () => UI.showScreen('gameScreen'), 'resumeBtn');
    safeAddListener('saveGameBtn', 'click', saveLoad.openSaveGameModal, 'saveGameBtn');
    safeAddListener('exitToMainMenuBtn', 'click', () => saveLoad.confirmExitToMainMenu(true), 'exitToMainMenuBtn');
    safeAddListener('exitWithoutSavingBtn', 'click', () => saveLoad.confirmExitToMainMenu(false), 'exitWithoutSavingBtn');
    safeAddListener('confirmNoBtn', 'click', () => UI.hideModal('confirmationModal'), 'confirmNoBtn');
    safeAddListener('cancelHelpAllyBtn', 'click', () => UI.hideModal('helpAllyModal'), 'cancelHelpAllyBtn');
    safeAddListener('confirmSaveBtn', 'click', saveLoad.confirmSaveGame, 'confirmSaveBtn');
    safeAddListener('cancelSaveBtn', 'click', () => UI.hideModal('saveGameModal'), 'cancelSaveBtn');

    // Phase 3.5 P5: game-over screen buttons
    safeAddListener('gameOverContinueBtn', 'click', async () => {
        // Soft revive: revert to handlePartyWipe's normal recovery path so the
        // player keeps playing. Reset the wipe counter so they get another N
        // chances before the screen reappears.
        const { gameState } = await import('./state.js?cb=014');
        gameState.consecutiveWipes = 0;
        // Run the soft-recovery directly (skip the threshold check inside handlePartyWipe).
        const Combat = await import('./combat.js?cb=014');
        gameState.players?.forEach(p => {
            if (!p) return;
            p.hp = Math.max(1, Math.floor((p.maxHp || 100) * 0.25)); // revive at 25% HP
            p.isDowned = false; p.downedTurns = 0; p.statusEffects = [];
            try { Combat.recalculateCharacterStats(p); } catch (_) {}
        });
        UI.showScreen('gameScreen');
        UI.renderPlayerCards();
        UI.showPopup('You rise again — battered, but unbowed.', 'info', 4000);
    }, 'gameOverContinueBtn');
    safeAddListener('gameOverSaveBtn', 'click', () => saveLoad.openSaveGameModal(), 'gameOverSaveBtn');
    safeAddListener('gameOverNewTaleBtn', 'click', () => {
        // Return to main menu; player can start a new adventure.
        UI.showScreen('mainMenuScreen');
    }, 'gameOverNewTaleBtn');

    // REMOVED listener for toggleStoryBtn


    // --- Event Delegation Listeners ---

    // *** UPDATED Choice Container Listener ***
    safeAddListener('choicesContainer', 'click', async (event) => { // Make listener async
        const button = event.target.closest('.choice-btn');
        // Ignore clicks if not on a button, or if it's a recovery button (handled by direct onclick)
        if (!button || button.classList.contains('recovery-choice-btn')) {
             if (button?.classList.contains('recovery-choice-btn')) {
                  displayVisualError("Click on recovery button ignored by standard choice delegation listener.");
             }
            return; // Exit if not a standard choice button
        }

        // Disable all choice buttons immediately to prevent double clicks
        document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = true);

        const actionType = button.dataset.actionType;
        const choiceText = button.textContent; // Get the displayed text

        if (actionType && choiceText) {
            displayVisualError(`Standard Choice clicked: Type="${actionType}", Text="${choiceText.substring(0, 30)}..."`);
            if (actionHandler && typeof actionHandler.handlePlayerChoice === 'function') {
                 try {
                      await actionHandler.handlePlayerChoice(actionType, choiceText);
                      // If successful, the AI response will eventually call renderChoices again
                 } catch(handlerError) {
                      // Error was already logged by handlePlayerChoice/makeAICall
                      displayVisualError(`Error during handlePlayerChoice for Type="${actionType}" (logged previously). Re-enabling choices.`);
                      // Re-enable buttons on failure
                      document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = false);
                      // Potentially re-render choices if state is uncertain
                      UI.renderChoices(gameState.currentChoices || []); // Re-render the current choices
                 }
            } else {
                 displayVisualError("ERROR: actionHandler.handlePlayerChoice function not found!");
                 // Re-enable buttons if handler is missing
                 document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = false);
            }
        } else {
            displayVisualError("Choice button clicked, but data-action-type or text content is missing/empty.");
            // Re-enable buttons if data is missing
            document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = false);
        }
    }, 'choicesContainerDelegation');

    // Inventory Delegation Listener (Async)
    safeAddListener('inventoryDisplay', 'click', async (event) => {
        const itemCard = event.target.closest('.item-card'); if (!itemCard) return;
        const itemId = itemCard.dataset.itemId; if (!itemId) { displayVisualError("Inventory click on item card missing data-itemId."); return; }

        if (event.target.classList.contains('useItemBtn')) {
            displayVisualError(`Inventory 'Use' clicked for item: ${itemId}`);
            await actionHandler.useInventoryItem(itemId); // Await async action
        }
        else if (event.target.classList.contains('equipItemBtn')) {
            const slot = event.target.dataset.slot;
            if (slot === 'weapon' || slot === 'armor') {
                displayVisualError(`Inventory 'Equip' clicked for item: ${itemId}, slot: ${slot}`);
                actionHandler.equipInventoryItem(itemId, slot); // Sync action
            } else { displayVisualError("Equip button missing valid data-slot (weapon/armor)."); }
        }
        else if (event.target.classList.contains('unequipItemBtn')) {
            const slot = itemCard.dataset.slot || event.target.dataset.slot;
            if (slot === 'weapon' || slot === 'armor') {
                displayVisualError(`Inventory 'Unequip' clicked for item: ${itemId}, slot: ${slot}`);
                actionHandler.unequipInventoryItem(slot); // Sync action
            } else { displayVisualError("Unequip button or parent card missing valid data-slot (weapon/armor)."); }
        }
        else if (event.target.classList.contains('dropItemBtn')) {
            displayVisualError(`Inventory 'Drop' clicked for item: ${itemId}`);
            actionHandler.confirmDropItem(itemId); // Sync action (opens modal)
        }
    }, 'inventoryDisplayDelegation');

    // Shop Delegation Listener
    safeAddListener('shopDisplay', 'click', (event) => {
        const card = event.target.closest('.item-card'); if (!card || !event.target.classList.contains('buyItemBtn')) return;
        const itemId = card.dataset.itemId; if (!itemId) { displayVisualError("Shop click on buy button missing item ID."); return; }
        const itemData = gameState.shopItems?.find(item => item.id === itemId); if (itemData) { displayVisualError(`Shop 'Buy' clicked for item: ${itemData.name} (ID: ${itemId})`); actionHandler.buyShopItem(itemData); } else { displayVisualError(`Buy button clicked but shop item data not found for ID: ${itemId}`); }
    }, 'shopDisplayDelegation');

    // Special Moves Delegation Listener (Async)
    safeAddListener('specialMovesDisplay', 'click', async (event) => {
        const card = event.target.closest('.move-card'); if (!card || !event.target.classList.contains('useMoveBtn')) return;
        const moveId = card.dataset.moveId; if (moveId) { displayVisualError(`Special Moves 'Use' clicked for move: ${moveId}`); await actionHandler.useSpecialMove(moveId); } else { displayVisualError(`Use move button clicked but move ID not found.`); }
    }, 'specialMovesDisplayDelegation');

    // Saved Games Delegation Listener
    safeAddListener('savedGamesList', 'click', (event) => {
        const card = event.target.closest('.saved-game-card'); if (!card) return;
        const saveName = card.dataset.saveName; if (!saveName) { displayVisualError("Saved game card click missing data-saveName."); return; }
        if (event.target.classList.contains('load-btn')) { displayVisualError(`Load Game 'Load' clicked for save: ${saveName}`); saveLoad.loadGame(saveName); }
        else if (event.target.classList.contains('delete-save-btn')) { displayVisualError(`Load Game 'Delete' clicked for save: ${saveName}`); saveLoad.confirmDeleteSave(saveName); }
    }, 'savedGamesListDelegation');

    // Overwrite Save Delegation Listener
    safeAddListener('overwriteSaveList', 'click', (event) => {
        const button = event.target.closest('button'); if (!button || !button.parentElement || button.parentElement.id !== 'overwriteSaveList') return;
        const saveName = button.dataset.saveName; if (saveName) { displayVisualError(`Save Modal 'Overwrite' button clicked for save: ${saveName}`); const nameInput = document.getElementById('saveGameNameInput'); if (nameInput) { nameInput.value = saveName; } saveLoad.confirmSaveGame(); } else { displayVisualError("Overwrite button clicked but missing data-saveName."); }
    }, 'overwriteSaveListDelegation');

     // Help Ally Delegation Listener (Async)
     safeAddListener('helpAllyTargetList', 'click', async (event) => {
         const button = event.target.closest('.selectAllyBtn'); if (!button) return;
         const playerId = button.dataset.playerId; if (playerId) { displayVisualError(`Help Ally Modal 'Select Ally' clicked for player: ${playerId}`); await actionHandler.helpAlly(playerId); } else { displayVisualError("Select Ally button clicked but missing data-playerId."); }
     }, 'helpAllyTargetListDelegation');
    // --- End Delegation ---

    // Initialize API tabs
    UI.initializeApiTabs();
    
    // Initialize quest progress UI
    UI.initializeQuestProgressUI();
    displayVisualError("main.js: Quest progress UI initialized.");
    
    // Initialize Local AI Orchestrator
    import('./localAIOrchestrator.js?cb=014')
        .then(({ localAIOrchestrator }) => {
            displayVisualError("main.js: Local AI Orchestrator initialized and ready for multi-agent coordination.");
        })
        .catch(error => {
            displayVisualError(`main.js: Local AI Orchestrator initialization failed: ${error.message}`);
        });

    displayVisualError("setupEventListeners: Listener attachment process finished.");
}


/**
 * Updates the visibility of the Continue Last Game button based on available saves
 */
function updateContinueButtonVisibility() {
    const continueBtn = document.getElementById('continueGameBtn');
    if (!continueBtn) return;
    
    try {
        // Check if any saves exist
        let hasSaves = false;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('advStorySave_')) {
                hasSaves = true;
                break;
            }
        }
        
        if (hasSaves) {
            continueBtn.classList.remove('hidden');
        } else {
            continueBtn.classList.add('hidden');
        }
    } catch (error) {
        console.log('Error checking for saves:', error);
        continueBtn.classList.add('hidden');
    }
}

/**
 * Shows the Local AI Status screen with current server information
 */
async function showLocalAIStatus() {
    const statusElement = document.getElementById('localAIStatus');
    if (!statusElement) return;
    
    statusElement.textContent = 'Checking local AI server...';
    statusElement.className = 'status-message checking';
    
    UI.showScreen('localAIScreen');
    
    // Backend-aware status panel: pull live values from getActiveBackendConfig
    // so the UI reflects whichever LLM_BACKEND is selected in config.js.
    const backend = Config.getActiveBackendConfig();
    const backendName = Config.LLM_BACKEND;
    const launchHint = backendName === 'llama-cpp'
        ? 'python start_llama_server.py'
        : 'python working_ai_server.py';

    try {
        const { testLocalAI } = await import('./api_new.js?cb=014');
        await testLocalAI();

        statusElement.textContent = `✅ Local AI Server is running and healthy! ${backend.modelName} ready.`;
        statusElement.className = 'status-message healthy';

        const serverInfo = document.createElement('div');
        serverInfo.className = 'server-info';
        serverInfo.innerHTML = `
            <h4>Server Details:</h4>
            <ul>
                <li><strong>Backend:</strong> ${backendName}</li>
                <li><strong>Model:</strong> ${backend.modelName}</li>
                <li><strong>Context Window:</strong> ${backend.contextWindow.toLocaleString()} tokens</li>
                <li><strong>Server URL:</strong> ${backend.url}</li>
            </ul>
        `;

        const existingInfo = statusElement.parentNode.querySelector('.server-info');
        if (existingInfo) existingInfo.remove();
        statusElement.parentNode.appendChild(serverInfo);

    } catch (error) {
        statusElement.textContent = `❌ Local AI Server not available at ${backend.url}.`;
        statusElement.className = 'status-message error';

        const errorInfo = document.createElement('div');
        errorInfo.className = 'error-info';
        errorInfo.innerHTML = `
            <h4>Troubleshooting:</h4>
            <ul>
                <li>Start the server with <code>${launchHint}</code> in a separate terminal.</li>
                <li>Wait for model load to finish (10-60s depending on model size).</li>
                <li>Verify the URL is reachable: <code>${backend.url}/health</code></li>
                <li>Error: ${error.message}</li>
            </ul>
        `;

        const existingInfo = statusElement.parentNode.querySelector('.error-info, .server-info');
        if (existingInfo) existingInfo.remove();
        statusElement.parentNode.appendChild(errorInfo);
    }
}

// --- Global Error Handling ---
window.addEventListener('error', (event) => {
    const d = window.displayVisualError || console.error;
    d(`Unhandled GLOBAL error: ${event.message} at ${event.filename}:${event.lineno}`, event.error);
    // Attempt to stop loading indicator if an uncaught error occurs
    try { if(UI && UI.showLoading) UI.showLoading(false); } catch(e){ d("Error trying to stop loading indicator during global error.", e); }
});
window.addEventListener('unhandledrejection', (event) => {
    const errorObj = event.reason;
    const message = errorObj instanceof Error ? `Async Error: ${errorObj.message}` : `Async Error: ${String(errorObj)}`;
    const d = window.displayVisualError || console.error;
    d(message, errorObj);
    // Attempt to stop loading indicator
     try { if(UI && UI.showLoading) UI.showLoading(false); } catch(e){ d("Error trying to stop loading indicator during unhandled rejection.", e); }
});


displayVisualError("main.js: Script execution finished (end of file).");