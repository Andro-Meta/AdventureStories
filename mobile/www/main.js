// main.js (with visual error handling)
// Entry point for the Adventure Stories application

// --- Game log ---
// One capped log (window.__advLog, newest 1500 lines), also saved on the
// device (localStorage 'adv.log', newest 1500) so a slow or broken turn can be
// read afterwards: tools/phone.mjs logs, or AI Settings > Copy debug log.
// It used to add a DOM node per line for the whole session (pages grew by
// thousands of nodes) and wrote everything with console.error.
window.__advLog = (() => { try { return JSON.parse(localStorage.getItem('adv.log') || '[]'); } catch (_) { return []; } })();
window.__advLog.push(`--- app start ${new Date().toISOString()} ---`);
let advLogDirty = false;
const saveAdvLog = () => {
    if (!advLogDirty) return;
    advLogDirty = false;
    try { localStorage.setItem('adv.log', JSON.stringify(window.__advLog.slice(-1500))); } catch (_) {}
};
setInterval(saveAdvLog, 5000);
addEventListener('pagehide', saveAdvLog);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveAdvLog(); });

window.displayVisualError = (message, error = null) => {
    let details = '';
    if (error) {
        details = ` (${error.name || 'Error'}: ${error.message || String(error)})`;
        if (error.stack && !(error instanceof Event)) details += ` | ${error.stack.split('\n').slice(1, 3).join(' | ')}`;
    }
    const line = `[${new Date().toLocaleTimeString()}] ${message}${details}`;
    window.__advLog.push(line);
    if (window.__advLog.length > 1500) window.__advLog.splice(0, window.__advLog.length - 1500);
    advLogDirty = true;
    (error ? console.error : console.log)(line);
};

// --- Android back button (MainActivity asks here first) ---
// Returns true when handled. Only the main menu lets back leave the app.
window.__advBack = () => {
    const picker = document.getElementById('battlePicker');
    if (picker) { picker.querySelector('.bp-cancel')?.click(); return true; }
    const open = document.querySelector('.modal:not(.hidden)');
    if (open) { open.classList.add('hidden'); return true; }
    // Mid-turn the menu button is locked; back must not get round it.
    if (gameState?.isLoading || gameState?.combatRoundInProgress) return true;
    const active = document.querySelector('.screen.active')?.id || 'mainMenuScreen';
    if (active === 'mainMenuScreen') return false;
    const prev = {
        gameScreen: 'menuScreen', menuScreen: 'gameScreen', storyBookScreen: 'menuScreen',
        inventoryScreen: 'gameScreen', shopScreen: 'gameScreen', specialMovesScreen: 'gameScreen',
        playerCountScreen: 'mainMenuScreen', adventureTypeScreen: 'playerCountScreen',
        ageInputScreen: 'adventureTypeScreen', nameInputScreen: 'ageInputScreen',
        gameOverScreen: 'gameOverScreen',
        localAIScreen: document.getElementById('aiSettingsBackBtn')?.dataset.target || 'mainMenuScreen'
    }[active] || 'mainMenuScreen';
    import('./ui.js').then(UI => UI.showScreen(prev)).catch(() => {});
    return true;
};

// --- Start Execution Log ---
displayVisualError("main.js: Script starting execution.");

// --- Static Module Imports ---
let Config, gameState, UI, setup, actionHandler, saveLoad;
try {
    displayVisualError("main.js: Importing core modules...");
    Config = await import('./config.js');
    ({ gameState } = await import('./state.js'));
    UI = await import('./ui.js');
    displayVisualError("main.js: Core modules imported successfully.");
    displayVisualError("main.js: Importing feature modules...");
    
    // Import loading manager first
    await import('./loadingManager.js');
    displayVisualError('LoadingManager: Initialized with intelligent loading system');
    
    // Import local AI integration
    await import('./localAI.js');
    displayVisualError('LocalAI: Integration initialized');

    // Phase 2: load the jail system module so it registers itself on
    // window.__jailSystem before any AI prompts are built. Without this
    // import being explicit somewhere, modules that lazily reach for
    // window.__jailSystem (questDefinitions, engine) won't find it.
    await import('./jailSystem.js');
    displayVisualError('JailSystem: registered.');

    setup = await import('./setup.js');
    actionHandler = await import('./actionHandler.js');
    saveLoad = await import('./saveLoad.js');
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
        if (!UI.elements.mainMenuScreen || !UI.elements.newGameBtn) {
            throw new Error("Essential UI elements (mainMenuScreen, newGameBtn) not found in the DOM!");
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
            // Signal that JS initialization is complete and all event listeners are
            // attached. Tests wait for this attribute so they don't click buttons
            // before the click handlers are wired up (#mainMenuScreen starts as
            // `active` in the raw HTML, which would otherwise satisfy the selector
            // before JS has run).
            document.body.dataset.jsReady = '1';
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
// Not inside the Android app: mobile-bootstrap.js removes it there on every launch.
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.() && location.protocol !== 'file:' && !/[?&]nosw=1\b/.test(location.search)) {
    window.addEventListener('load', async () => {
        try {
            // Once per browser, not per tab: sessionStorage made every new tab
            // unregister the (already network-first) worker and reload the page.
            let recovered = null;
            try { recovered = localStorage.getItem('__sw_poison_recovered_v015__'); } catch (_) {}
            if (!recovered) {
                const regs = await navigator.serviceWorker.getRegistrations();
                if (regs.length > 0) {
                    for (const reg of regs) {
                        try { reg.active?.postMessage({ type: 'PURGE_CACHE' }); } catch (_) {}
                        try { await reg.unregister(); } catch (_) {}
                    }
                    try { localStorage.setItem('__sw_poison_recovered_v015__', '1'); } catch (_) {}
                    displayVisualError('SW poison-recovery: unregistered old worker, reloading once for fresh modules.');
                    location.reload();
                    return;
                }
                try { localStorage.setItem('__sw_poison_recovered_v015__', '1'); } catch (_) {}
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

                try {
                    await handler(event); // Await the handler (works for both sync/async)
                } catch (e) {
                    displayVisualError(`Error in handler ${handlerName} for event ${eventType} on #${elementId}`, e);
                    // Optional: Show a generic error popup to the user
                    // UI.showPopup(`Error processing ${handlerName}.`, 'error');
                } finally {

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

                    try {
                         await handler(event, element, index); // Await handler (works for sync/async)
                    } catch (e) {
                         displayVisualError(`Error in handler ${specificHandlerName} for event ${eventType} on element matching '${selector}'`, e);
                    } finally {

                    }
                };
                element.addEventListener(eventType, eventHandler);
            });
        } else {
            displayVisualError(`Failed to add listener: No elements found for selector '${selector}' for ${handlerNamePrefix}.`);
        }
    };


    // The newest log lines, for a bug report (the old on-screen log panel
    // could never be opened).
    // ⭐ +N stat on a hero card: spend level-up points.
    document.addEventListener('click', (e) => {
        const b = e.target.closest?.('.spend-points');
        if (b) { e.stopPropagation(); UI.promptStatPoints(b.dataset.hero); }
    });
    safeAddListener('copyDebugLogBtn', 'click', async () => {
        const text = (window.__advLog || []).join('\n');
        try { await navigator.clipboard.writeText(text); UI.showPopup('Debug log copied', 'success', 2000); }
        catch (_) { UI.showPopup('Copy blocked on this device', 'info', 2500); }
    }, 'copyDebugLogBtn');

    // --- Main Menu & Setup Navigation ---
    safeAddListener('newGameBtn', 'click', () => {
        // Cloud play needs a key; say so before the party is set up (the
        // check used to happen only after names, ages and theme were entered).
        if (Config.LLM_BACKEND === 'cloud' && !Config.getCloudApiKey()) {
            UI.showPopup('First, paste your free AI key here (one time only).', 'info', 6000);
            showLocalAIStatus();
            return;
        }
        UI.showScreen('playerCountScreen');
    }, 'newGameBtn');
    safeAddListener('continueGameBtn', 'click', async () => { await saveLoad.continueLastGame(); }, 'continueGameBtn');
    // Show the Load Game screen FIRST, then list saves. listSaves() only
    // renders into the saved-games list when currentScreen === 'loadGameScreen';
    // the previous order rendered nothing because the screen hadn't switched
    // yet. Phase 0 audit P0 #8.
    safeAddListener('loadGameBtn', 'click', () => { UI.showScreen('loadGameScreen'); saveLoad.listSaves(); }, 'loadGameBtn');
    safeAddListener('localAIBtn', 'click', () => showLocalAIStatus(), 'localAIBtn');
    // Mid-game route to the keys (a dead key used to mean quitting to the main menu).
    safeAddListener('menuAISettingsBtn', 'click', () => showLocalAIStatus('menuScreen'), 'menuAISettingsBtn');
    safeAddListener('checkLocalAIBtn', 'click', () => runConnectionCheck(), 'checkLocalAIBtn');
    // Phase 0: cloud backend selection + API key save
    setupCloudBackendListeners();
    safeAddListener('aboutBtn', 'click', () => UI.showScreen('aboutScreen'), 'aboutBtn');
    // How to Play: from the main menu or the in-game menu; Back returns to where you came from.
    let guideReturn = 'mainMenuScreen';
    safeAddListener('howToPlayBtn', 'click', () => { guideReturn = 'mainMenuScreen'; UI.showScreen('howToPlayScreen'); }, 'howToPlayBtn');
    safeAddListener('menuHowToPlayBtn', 'click', () => { guideReturn = 'menuScreen'; UI.showScreen('howToPlayScreen'); }, 'menuHowToPlayBtn');
    safeAddListener('howToPlayBackBtn', 'click', () => UI.showScreen(guideReturn), 'howToPlayBackBtn');
    // Sound & Voice settings (both menus) and the story card's read-aloud button.
    import('./media.js').then((Media) => {
    let soundReturn = 'mainMenuScreen';
    const openSound = (from) => {
        soundReturn = from;
        const set = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
        set('optReadAloud', Media.settings.readAloud); set('optSfx', Media.settings.sfx); set('optVibrate', Media.settings.vibrate);
        const note = document.getElementById('voiceNote');
        if (note && !Media.canSpeak()) note.textContent = 'Read-aloud is not available on this device yet.';
        const rate = document.getElementById('optVoiceRate'); if (rate) rate.value = Media.voiceRate();
        Media.listVoices().then(vs => {
            const sel = document.getElementById('optVoice'); if (!sel) return;
            sel.innerHTML = '';
            let saved = ''; try { saved = localStorage.getItem('adv.voice') || ''; } catch (_) {}
            for (const v of vs) { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; sel.appendChild(o); }
            sel.value = vs.some(v => v.id === saved) ? saved : '';
        }).catch(() => {});
        UI.showScreen('soundSettingsScreen');
    };
    safeAddListener('soundSettingsBtn', 'click', () => openSound('mainMenuScreen'), 'soundSettingsBtn');
    safeAddListener('menuSoundSettingsBtn', 'click', () => openSound('menuScreen'), 'menuSoundSettingsBtn');
    safeAddListener('soundSettingsBackBtn', 'click', () => UI.showScreen(soundReturn), 'soundSettingsBackBtn');
    for (const [id, key] of [['optReadAloud', 'readAloud'], ['optSfx', 'sfx'], ['optVibrate', 'vibrate']]) {
        document.getElementById(id)?.addEventListener('change', (e) => {
            Media.settings.set(key, e.target.checked);
            if (key === 'sfx' && e.target.checked) Media.play('coin');
            if (key === 'vibrate' && e.target.checked) Media.buzz(60);
            if (key === 'readAloud' && !e.target.checked) Media.stopSpeaking();
        });
    }
    const sample = () => Media.speak('Once upon a time, a brave hero set out on an adventure. Behind a creaking door, something was waiting.');
    safeAddListener('testVoiceBtn', 'click', sample, 'testVoiceBtn');
    // Choosing a voice or a speed plays the sample, so players can compare quickly.
    document.getElementById('optVoice')?.addEventListener('change', (e) => { Media.setVoice(e.target.value, null); sample(); });
    document.getElementById('optVoiceRate')?.addEventListener('change', (e) => { Media.setVoice(null, e.target.value); sample(); });
    let reading = false;
    safeAddListener('readAloudBtn', 'click', () => {
        if (reading) { Media.stopSpeaking(); reading = false; return; }
        reading = true; Media.speak(gameState.currentNarrative || document.getElementById('storyText')?.textContent || '');
        setTimeout(() => { reading = false; }, 60000); // a second tap within a minute stops it
    }, 'readAloudBtn');
    }).catch(e => displayVisualError(`Sound & Voice setup failed: ${e.message}`));
    { const v = document.getElementById('versionInfo'); if (v) v.textContent = `v${Config.APP_VERSION}`; }
    // New version on GitHub? A banner on the main menu (checked at start, at most every 6 hours).
    import('./updates.js').then(U => {
        U.showUpdateBanner().catch(() => {});
        safeAddListener('checkUpdatesBtn', 'click', async () => {
            const b = document.getElementById('checkUpdatesBtn'); b.textContent = 'Checking…';
            const rel = await U.showUpdateBanner(true).catch(() => null);
            b.textContent = rel ? `Version ${rel.version} is out ↑` : 'Up to date ✓';
        }, 'checkUpdatesBtn');
    }).catch(e => displayVisualError(`Update check setup failed: ${e.message}`));
    // Save backup: export every save to a file, import them again.
    safeAddListener('exportSavesBtn', 'click', () => saveLoad.exportSaves(), 'exportSavesBtn');
    safeAddListener('importSavesBtn', 'click', () => document.getElementById('importSavesInput')?.click(), 'importSavesBtn');
    document.getElementById('importSavesInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (file) { await saveLoad.importSaves(await file.text()); saveLoad.listSaves(); }
    });
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
    safeAddListenerAll('.backToGameBtn', 'click', () => UI.showScreen('gameScreen'), 'backToGameBtn');


    // --- Specific Element Listeners ---
    safeAddListener('adventureTypeSelect', 'change', setup.handleAdventureTypeSelectionChange, 'adventureTypeSelect');
    safeAddListener('inventoryBtn', 'click', () => {
        UI.renderInventory();
        UI.showScreen('inventoryScreen');
    }, 'inventoryBtn');
    safeAddListener('shopBtn', 'click', () => {
        UI.renderShop();
        UI.showScreen('shopScreen');
    }, 'shopBtn');
    safeAddListener('specialBtn', 'click', () => {
        UI.renderSpecialMoves();
        UI.showScreen('specialMovesScreen');
    }, 'specialBtn');
    safeAddListener('helpAllyBtn', 'click', actionHandler.openHelpAllyModal, 'helpAllyBtn');
    safeAddListener('menuBtn', 'click', () => UI.showScreen('menuScreen'), 'menuBtn');
    safeAddListener('resumeBtn', 'click', () => UI.showScreen('gameScreen'), 'resumeBtn');
    safeAddListener('saveGameBtn', 'click', saveLoad.openSaveGameModal, 'saveGameBtn');
    safeAddListener('readStoryBtn', 'click', UI.showStoryBook, 'readStoryBtn');
    safeAddListener('saveStoryBtn', 'click', UI.saveStoryBook, 'saveStoryBtn');
    safeAddListener('copyStoryBtn', 'click', UI.copyStoryBook, 'copyStoryBtn');
    safeAddListener('closeStoryBtn', 'click', () => UI.showScreen('menuScreen'), 'closeStoryBtn');
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
        const { gameState } = await import('./state.js');
        gameState.consecutiveWipes = 0;
        // Run the soft-recovery directly (skip the threshold check inside handlePartyWipe).
        const Combat = await import('./combat.js');
        gameState.players?.forEach(p => {
            if (!p) return;
            p.hp = Math.max(1, Math.floor((p.maxHp || 100) * 0.25)); // revive at 25% HP
            p.isDowned = false; p.downedTurns = 0; p.statusEffects = [];
            try { Combat.recalculateCharacterStats(p); } catch (_) {}
        });
        // Out of the lost fight, with something to press.
        gameState.inCombat = false;
        if (gameState.combat) gameState.combat.isActive = false;
        gameState.enemies = [];
        UI.clearCombatLog?.();
        UI.showScreen('gameScreen');
        UI.renderPlayerCards();
        UI.renderEnemyCards();
        UI.renderChoices([
            { type: 'Safe', stat: 'kind', text: 'Get back on your feet and take stock' },
            { type: 'Safe', stat: 'clever', text: 'Look around for what went wrong' },
            { type: 'Bold', stat: 'brave', text: 'Go after them again, smarter this time' }
        ]);
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

        import('./media.js').then(M => M.play('tap', 0.35)).catch(() => {}); // a soft click
        // Disable all choice buttons immediately to prevent double clicks
        document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = true);

        let actionType = button.dataset.actionType;
        let choiceText = button.dataset.text || button.textContent; // the choice itself (textContent also has the battle badge)
        // Battle commands open a picker (which item / move / target), like a
        // classic RPG menu. Cancel returns to the choices.
        if (gameState.inCombat && ['Attack', 'Item', 'Special'].includes(actionType) && !gameState.isLoading) {
            const Battle = await import('./battle.js');
            const hero = gameState.players?.[gameState.currentPlayerIndex];
            const opts = Battle.battleOptions(actionType, hero);
            if (opts) {
                const title = { Attack: 'Attack which foe?', Item: 'Use which item?', Special: 'Which special?' }[actionType];
                const pick = await Battle.pickBattleOption(title, opts);
                if (!pick) { // cancelled: give the choices back (they stayed disabled)
                    document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = false);
                    return;
                }
                actionType = pick.type;
                choiceText = pick.text;
                gameState.pickedTargetId = pick.targetId || null;
                // A special, spell or throwable that hits one foe: which one? (10-09:
                // specials always hit the first foe.)
                const foes = pick.targets === 'one' ? Battle.battleOptions('Attack', hero) : null;
                if (foes) {
                    const foe = await Battle.pickBattleOption(`${pick.label}: which foe?`, foes);
                    if (!foe) {
                        document.querySelectorAll('#choicesContainer .choice-btn').forEach(btn => btn.disabled = false);
                        return;
                    }
                    gameState.pickedTargetId = foe.targetId;
                    choiceText = `${pick.text} on ${foes.find(f => f.targetId === foe.targetId)?.label || ''}`.trim();
                }
            }
        }

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
        else if (event.target.classList.contains('sellItemBtn')) {
            actionHandler.sellInventoryItem(itemId);
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

    
    // Initialize quest progress UI
    UI.initializeQuestProgressUI();
    displayVisualError("main.js: Quest progress UI initialized.");
    
    displayVisualError("setupEventListeners: Listener attachment process finished.");
}


/**
 * Updates the visibility of the Continue Last Game button based on available saves
 */
// Re-checked whenever the main menu shows (was boot-only: Continue stayed
// hidden after the first save of a session).
window.__refreshContinue = () => updateContinueButtonVisibility();
function updateContinueButtonVisibility() {
    const continueBtn = document.getElementById('continueGameBtn');
    if (!continueBtn) return;
    
    try {
        // Check if any saves exist under the current prefix (AG-) or the legacy
        // prefix (advStorySave_) in case migration hasn't run yet on first load.
        const savePrefix = (Config && Config.SAVE_GAME_PREFIX) ? Config.SAVE_GAME_PREFIX : 'AG-';
        const legacyPrefix = 'advStorySave_';
        let hasSaves = false;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith(savePrefix) || key.startsWith(legacyPrefix))) {
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
 * AI Settings screen: pick an online provider, paste a free key, test it.
 * (Local and on-device models were removed; the game only uses online AI.)
 */
async function showLocalAIStatus(backTo = 'mainMenuScreen') {
    if (!document.getElementById('localAIStatus')) return;
    const back = document.getElementById('aiSettingsBackBtn');
    if (back) back.dataset.target = backTo;
    UI.showScreen('localAIScreen');

    const providerKey = (() => {
        try { return localStorage.getItem('adv.cloudProvider') || Config.DEFAULT_CLOUD_PROVIDER; }
        catch (_) { return Config.DEFAULT_CLOUD_PROVIDER; }
    })();
    const select = document.getElementById('cloudProviderSelect');
    if (select) select.value = providerKey;
    updateCloudProviderNotes(providerKey);
    await runConnectionCheck();
}

/** Description and signup link for the selected provider. */
// Auto mode has two keys: Google (Gemma, first) and OpenRouter (fallback).
// The main key field belongs to OpenRouter there, else to the chosen provider.
function mainKeyProvider(providerKey) {
    return providerKey === 'auto' ? 'openrouter_free' : providerKey;
}

/** AI Settings: which storyteller is in use, its speed, today's count, who's resting. */
async function renderAIHealth(auto) {
    const list = document.getElementById('aiHealthList');
    if (!list) return;
    list.replaceChildren();
    if (!auto) return;
    const [Router, { benchKey }] = await Promise.all([import('./aiRouter.js'), import('./localAI.js')]);
    const chain = Config.providerChain();
    const rows = Router.snapshot(chain.map(benchKey));
    chain.forEach((p, i) => {
        const r = rows[i];
        const li = document.createElement('li');
        const name = p.name.split(' — ')[0] + (p.keySlot ? ' (2nd key)' : '');
        const bits = [];
        if (!Config.keyForProvider(p)) bits.push('no key');
        else if (r.restingUntil) bits.push(`resting until ${new Date(r.restingUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${r.why ? ` (${r.why})` : ''}`);
        else bits.push('ready');
        if (r.avgMs != null) bits.push(`${(r.avgMs / 1000).toFixed(1)} s avg`);
        if (r.today) bits.push(`${r.today} today`);
        if (r.remaining != null) bits.push(`${r.remaining} left today`);
        li.textContent = `${r.active ? '▶ ' : ''}${name}: ${bits.join(' · ')}`;
        list.appendChild(li);
    });
}

function updateCloudProviderNotes(providerKey) {
    const provider = Config.CLOUD_PROVIDERS[providerKey];
    if (!provider) return;
    const auto = providerKey === 'auto';
    document.getElementById('googleKeyBlock')?.classList.toggle('hidden', !auto);
    const label = document.getElementById('cloudKeyLabel');
    if (label) label.textContent = auto ? 'OpenRouter Key (used when Google runs out):' : 'API Key:';
    const saved = (k) => Config.keyForProvider(Config.CLOUD_PROVIDERS[k]) ? '✓ Key saved' : null;
    const keyInput = document.getElementById('cloudApiKeyInput');
    if (keyInput) { keyInput.value = ''; keyInput.placeholder = saved(mainKeyProvider(providerKey)) || 'Paste your free API key here'; }
    const gInput = document.getElementById('googleApiKeyInput');
    if (gInput) { gInput.value = ''; gInput.placeholder = saved('flashlite_google') || 'Paste your free Google AI Studio key'; }
    const g2Input = document.getElementById('googleApiKey2Input');
    if (g2Input) { g2Input.value = ''; g2Input.placeholder = saved('flashlite_google_2') || 'Optional: key from a second Google account'; }
    const groqInput = document.getElementById('groqApiKeyInput');
    if (groqInput) { groqInput.value = ''; groqInput.placeholder = saved('groq_qwen') || 'Paste your free Groq key'; }
    const groq2Input = document.getElementById('groqApiKey2Input');
    if (groq2Input) { groq2Input.value = ''; groq2Input.placeholder = saved('groq_qwen_2') || 'Optional: key from a second Groq account'; }
    renderAIHealth(auto);
    const signupUrl = (auto ? Config.CLOUD_PROVIDERS.openrouter_free : provider).signupUrl;
    const notesEl = document.getElementById('cloudProviderNotes');
    const signupEl = document.getElementById('cloudSignupLink');
    if (notesEl) notesEl.textContent = `${provider.notes} (${provider.rateLimit})`;
    if (signupEl) {
        signupEl.href = signupUrl;
        signupEl.textContent = `Get a free key from ${new URL(signupUrl).hostname} →`;
    }
}

/** Tiny completion to prove the key and provider work. */
async function runConnectionCheck() {
    const statusElement = document.getElementById('localAIStatus');
    if (!statusElement) return;
    const backend = Config.getActiveBackendConfig();
    if (!Config.getCloudApiKey()) {
        statusElement.textContent = '⚠️ No key saved yet. Paste your free key above and click Save.';
        statusElement.className = 'status-message warning';
        return;
    }
    statusElement.textContent = `Testing ${backend.providerName}...`;
    statusElement.className = 'status-message checking';
    try {
        const { localAI } = await import('./localAI.js');
        const response = await localAI.makeRequest([{ role: 'user', content: 'Reply with just the word OK.' }], { max_tokens: 5, temperature: 0 });
        if (!response) throw new Error('Empty response');
        statusElement.textContent = `✅ Connected: ${backend.providerName}`;
        statusElement.className = 'status-message healthy';
    } catch (error) {
        statusElement.textContent = `❌ Test failed: ${error.message}`; // textContent: the error body is untrusted
        statusElement.className = 'status-message error';
    }
}

function setupCloudBackendListeners() {
    const providerSelect = document.getElementById('cloudProviderSelect');
    const apiKeyInput = document.getElementById('cloudApiKeyInput');
    const saveBtn = document.getElementById('cloudApiKeySaveBtn');

    if (providerSelect) providerSelect.addEventListener('change', async () => {
        const { localAI } = await import('./localAI.js');
        localAI.setCloudProvider(providerSelect.value); // remembered right away, no Save needed
        updateCloudProviderNotes(providerSelect.value);
    });
    const injury = document.getElementById('injuryDetailToggle');
    if (injury) {
        injury.checked = Config.injuryDetailOn();
        injury.addEventListener('change', () => {
            try { localStorage.setItem('adv.injuryDetail', injury.checked ? '1' : '0'); } catch (_) {}
            UI.showPopup(injury.checked ? 'Injury details on' : 'Injury details off', 'info', 2000);
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const key = apiKeyInput?.value?.trim() || '';
            const providerKey = providerSelect ? providerSelect.value : Config.DEFAULT_CLOUD_PROVIDER;
            if (!key) { UI.showPopup('Paste your API key first.', 'warning'); return; }
            const { localAI } = await import('./localAI.js');
            localAI.setCloudProvider(providerKey);
            localAI.setApiKey(key, mainKeyProvider(providerKey));
            await afterKeySaved(providerKey);
        });
    }
    for (const [btnId, inputId, slot] of [['googleApiKeySaveBtn', 'googleApiKeyInput', 'flashlite_google'], ['googleApiKey2SaveBtn', 'googleApiKey2Input', 'flashlite_google_2'], ['groqApiKeySaveBtn', 'groqApiKeyInput', 'groq_qwen'], ['groqApiKey2SaveBtn', 'groqApiKey2Input', 'groq_qwen_2']]) {
        document.getElementById(btnId)?.addEventListener('click', async () => {
            const key = document.getElementById(inputId)?.value?.trim() || '';
            if (!key) { UI.showPopup('Paste your key first.', 'warning'); return; }
            const { localAI } = await import('./localAI.js');
            localAI.setCloudProvider(providerSelect ? providerSelect.value : 'auto');
            localAI.setApiKey(key, slot);
            await afterKeySaved(providerSelect ? providerSelect.value : 'auto');
        });
    }
}

// Stay on AI Settings after a save (it used to reload to the main menu):
// clear the field, show "✓ Key saved", test the connection.
async function afterKeySaved(providerKey) {
    updateCloudProviderNotes(providerKey);
    UI.showPopup('Key saved', 'info', 2000);
    await runConnectionCheck();
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