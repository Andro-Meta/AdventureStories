// setup.js
// Handles game initialization and player/adventure setup steps.

// --- Static Imports ---
import { gameState } from './state.js';
import * as Config from './config.js';
import * as UI from './ui.js';
import { loadingManager } from './loadingManager.js';
// Import items for fallback generation
import { generateId } from './utils.js';
// Import input caching
import { savePlayerAges, savePlayerNames, saveAdventureTheme, loadAdventureTheme } from './inputCache.js';
// Import intelligent initialization manager
import { initManager } from './initializationManager.js';

/**
 * Initializes the game application, sets up initial state and listeners.
 * Called from main.js. Uses whichever LLM_BACKEND is configured.
 */
export async function initializeGame() {
    const log = window.displayVisualError || console.log;
    log("Setup: initializeGame called.");
    try {
        // Await the health check before showing the menu so the "server not
        // available" popup (if any) doesn't race with the menu render.
        await checkLocalAIStatus();
        UI.showScreen('mainMenuScreen');
        const backend = Config.getActiveBackendConfig();
        log(`Setup: Game initialization complete - backend ${Config.LLM_BACKEND}, model ${backend.modelName}, url ${backend.url}`);
    } catch (error) {
        log("Setup ERROR: Game initialization failed:", error);
        UI.showPopup('Game initialization failed. Please refresh the page.', 'error');
    }
}

/**
 * Checks local AI server status and updates game state.
 * Backend-aware: shows guidance for the selected LLM_BACKEND on failure.
 */
async function checkLocalAIStatus() {
    const log = window.displayVisualError || console.log;
    try {
        const { testLocalAI } = await import('./api_new.js');
        await testLocalAI();
        gameState.localAIStatus = 'healthy';
        log("Setup: Local AI server is healthy and ready");
    } catch (error) {
        gameState.localAIStatus = 'unavailable';
        log("Setup WARNING: AI not ready:", error.message);
        UI.showPopup(`AI not ready: ${error.message}`, 'error');
    }
}


/**
 * Handles player count selection and navigates to the next setup screen.
 */
export function handlePlayerCountSelection(count) {
    const log = window.displayVisualError || console.log;
    if (count < 1 || count > Config.MAX_PLAYERS) { 
        log(`Setup ERROR: Invalid player count selected: ${count}`); 
        return; 
    }
    gameState.playerCount = count;
    log(`Setup: Player count set to ${count}. Proceeding to theme selection.`);
    
    // Restore cached theme
    const { theme, customDescription } = loadAdventureTheme();
    if (UI.elements.adventureTypeSelect) {
        UI.elements.adventureTypeSelect.value = theme;
    }
    if (UI.elements.customThemeInput) {
        UI.elements.customThemeInput.value = customDescription;
    }
    
    // Show/hide custom theme input based on selection
    if (theme === 'custom') {
        if (UI.elements.customThemeContainer) UI.elements.customThemeContainer.classList.remove('hidden');
    } else {
        if (UI.elements.customThemeContainer) UI.elements.customThemeContainer.classList.add('hidden');
    }
    
    UI.showScreen('adventureTypeScreen');
}

/**
 * Handles changes in the adventure type dropdown, showing/hiding the custom input.
 */
export function handleAdventureTypeSelectionChange() {
    const log = window.displayVisualError || console.log;
    log("Setup: Adventure type selection changed.");
    if (!UI.elements.adventureTypeSelect || !UI.elements.customThemeContainer || !UI.elements.customThemeInput) { 
        log("Setup Warning: Adventure type UI elements missing."); 
        return; 
    }
    const selectedType = UI.elements.adventureTypeSelect.value;
    const showCustom = selectedType === 'custom';
    log(` -> Selected type: ${selectedType}, Show custom input: ${showCustom}`);
    UI.elements.customThemeContainer.classList.toggle('hidden', !showCustom);
    if (showCustom) { 
        UI.elements.customThemeInput.focus(); 
    }
}

/**
 * Validates adventure type selection and proceeds to age input.
 */
export function proceedToAgeInput() {
     const log = window.displayVisualError || console.log;
     log("Setup: Proceeding to age input...");
     if (!UI.elements.adventureTypeSelect || !UI.elements.customThemeInput) { log("Setup ERROR: Adventure type UI elements missing."); return; }
    gameState.adventureTheme = UI.elements.adventureTypeSelect.value;
    gameState.customThemeDescription = '';
    if (gameState.adventureTheme === 'custom') {
        gameState.customThemeDescription = UI.elements.customThemeInput.value.trim();
        if (!gameState.customThemeDescription) {
            log("Setup Validation Failed: Custom theme selected but description is empty.");
            UI.showPopup('Please enter a description for your custom theme.', 'error');
            UI.elements.customThemeInput.focus();
            return;
        }
         log(`Setup: Custom theme selected: "${gameState.customThemeDescription}"`);
    } else {
         log(`Setup: Standard theme selected: ${gameState.adventureTheme}`);
    }
    
    // Save theme to cache
    saveAdventureTheme(gameState.adventureTheme, gameState.customThemeDescription);
    
    UI.generateAgeInputs();
    UI.showScreen('ageInputScreen');
}

/**
 * Validates age inputs and proceeds to name input screen.
 */
export function proceedToNameInput() {
    const log = window.displayVisualError || console.log;
    log("Setup: Proceeding to name input...");
    if (!UI.elements.ageInputsContainer) { log("Setup ERROR: Age inputs container missing."); return; }
    const ageInputs = UI.elements.ageInputsContainer.querySelectorAll('input[type="number"]');
    if (ageInputs.length !== gameState.playerCount) { log("Setup ERROR: Age input count mismatch."); return; }
    gameState.playerAges = [];
    for (let i = 0; i < ageInputs.length; i++) {
        const ageValue = parseInt(ageInputs[i].value);
        if (!ageValue || ageValue < Config.MIN_AGE || ageValue > Config.MAX_AGE) {
            log(`Setup Validation Failed: Invalid age for player ${i + 1}: ${ageValue}`);
            UI.showPopup(`Please enter a valid age (${Config.MIN_AGE}-${Config.MAX_AGE}) for Player ${i + 1}.`, 'error');
            ageInputs[i].focus();
        return;
    }
        gameState.playerAges.push(ageValue);
    }
    
    // Save ages to cache
    savePlayerAges(gameState.playerAges);
    
    log(`Setup: Ages set: [${gameState.playerAges.join(', ')}]. Proceeding to name input.`);
    UI.generateNameInputs();
    UI.showScreen('nameInputScreen');
}


/**
 * ALTERNATIVE: Use intelligent initialization manager for robust setup
 * This is a better approach that handles dependencies and error recovery
 */
export async function completeSetupAndStartGameIntelligent() {
    const log = window.displayVisualError || console.log;
    log("Setup: Starting INTELLIGENT game initialization...");
    
    // Validate inputs one more time - use the same method as the working system
    if (!UI.elements.nameInputsContainer) { 
        log("Setup ERROR: Name inputs container missing."); 
        UI.showPopup('Name input system error. Please refresh and try again.', 'error');
        return; 
    }
    const nameInputs = UI.elements.nameInputsContainer.querySelectorAll('input[type="text"]');
    if (nameInputs.length !== gameState.playerCount) { 
        log("Setup ERROR: Name input count mismatch."); 
        UI.showPopup('Name input count error. Please refresh and try again.', 'error');
        return; 
    }
    
    const playerNames = [];
    for (let i = 0; i < nameInputs.length; i++) {
        const nameValue = nameInputs[i].value.trim();
        if (!nameValue || nameValue.length > Config.MAX_NAME_LENGTH) {
            log(`Setup Validation Failed: Invalid name for player ${i + 1}: "${nameValue}"`);
            UI.showPopup(`Please enter a valid name (1-${Config.MAX_NAME_LENGTH} characters) for Player ${i + 1}.`, 'error');
            nameInputs[i].focus();
            return;
        }
        playerNames.push(nameValue);
    }
    
    // Save names to cache and store in gameState
    savePlayerNames(playerNames);
    gameState.playerNames = [...playerNames];
    log(`Setup: Names validated: [${playerNames.join(', ')}]. Starting intelligent initialization...`);

    // Shown only after validation so an invalid name can't strand the overlay.
    loadingManager.showLoading('Preparing your adventure...');
    UI.resetFx?.();
    try {
        // Set up progress monitoring
        const progressInterval = setInterval(() => {
            const progress = initManager.getProgress();
            loadingManager.updateProgress(progress.percentage); // the status line is the phase text from loadingTips
            
            // Show current running tasks
            if (progress.running > 0) {
                const runningTasks = Array.from(initManager.runningTasks);
                log(`InitManager: Running tasks: ${runningTasks.join(', ')}`);
            }
        }, 2000);

        // Reset stale task state from any previous game in this session.
        // Without this, all phases are silently skipped on the second+ start
        // because completedTasks still holds entries from the first run.
        initManager.reset();

        // Execute the intelligent initialization
        const result = await initManager.executeInitialization();
        clearInterval(progressInterval);
        
        if (result.success) {
            log("Setup: Intelligent initialization completed successfully!");
            // names this game's autosave slot; keep one an early turn's autosave
            // already made (overwriting it left two slots for one game)
            gameState.gameId = gameState.gameId || Date.now().toString(36);
            try { (await import('./saveLoad.js')).autosave(); } catch (_) { /* first autosave is best-effort */ }
            log("Setup: Results:", result.results);
            
            // Show success message
            UI.showPopup('Adventure begins! Your choices shape the story.', 'success');
        } else {
            log("Setup ERROR: Intelligent initialization failed:", result.error);
            log("Setup: Partial results:", result.results);
            
            loadingManager.hideLoading();
            UI.showPopup(`The storyteller didn't answer in time. Pick an action to begin.`, 'warning');
            
            // Try to show game screen anyway if players were created.
            // Wrap in its own try/catch: if renderPlayerCards throws for any
            // reason (e.g. incomplete game state), we still show gameScreen
            // rather than letting the exception propagate to the outer catch
            // and silently navigate to mainMenuScreen.
            if (result.results?.completed?.includes('createPlayers')) {
                log("Setup: Players were created, attempting to continue...");
                try { UI.renderPlayerCards(); } catch (e) { log(`Setup: renderPlayerCards failed in recovery: ${e.message}`); }
                // No opening story: still give the player something to press
                // (before, an empty screen with no choices).
                if (!gameState.currentChoices?.length) {
                    gameState.currentChoices = [
                        { type: 'Explore', text: 'Look around and get your bearings' },
                        { type: 'Social', text: 'Find someone nearby to talk to' },
                        { type: 'Explore', text: 'Set off toward the nearest sign of trouble' }
                    ];
                }
                try { UI.renderChoices(gameState.currentChoices); } catch (_) {}
                UI.showScreen('gameScreen');
            } else {
                UI.showScreen('mainMenuScreen');
            }
        }

    } catch (error) {
        log("Setup CRITICAL ERROR: Initialization system failed:", error);
        loadingManager.hideLoading();
        UI.showPopup(`Couldn't start the adventure. Please try again.`, 'error');
        UI.showScreen('mainMenuScreen');
    }
}

/**
 * Generate fallback shop items when AI generation fails
 * @param {string} theme - The adventure theme
 * @returns {Array} Array of fallback shop items
 */
function generateFallbackShopItems(theme) {
    const fallbackItems = [
        {
            id: generateId(),
            name: "Health Potion",
            type: "Consumable",
            tier: "Low",
            cost: 25,
            description: "Restores 30 HP when consumed.",
            effect: { type: "heal", value: 30 }
        },
        {
            id: generateId(),
            name: "Basic Sword",
            type: "Weapon",
            tier: "Medium",
            cost: 75,
            description: "A reliable weapon for combat.",
            effect: { type: "attack", value: 8 }
        },
        {
            id: generateId(),
            name: "Leather Armor",
            type: "Armor",
            tier: "Medium",
            cost: 60,
            description: "Provides basic protection.",
            effect: { type: "defense", value: 6 }
        },
        {
            id: generateId(),
            name: "Magic Scroll",
            type: "Consumable",
            tier: "Medium",
            cost: 40,
            description: "Contains a useful spell.",
            effect: { type: "spell", value: "minor_heal" }
        },
        {
            id: generateId(),
            name: "Energy Drink",
            type: "Consumable",
            tier: "Low",
            cost: 20,
            description: "Restores 15 MP/Energy.",
            effect: { type: "restore_mp", value: 15 }
        }
    ];
    
    return fallbackItems;
}
