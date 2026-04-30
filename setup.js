// setup.js
// Handles game initialization and player/adventure setup steps.

// --- Static Imports ---
import { gameState, resetGameState, createNewPlayer, initializeGameState } from './state.js?cb=014';
import * as Config from './config.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as API from './api_new.js?cb=014';
import * as Items from './items.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Spells from './spells.js?cb=014';
import { loadingManager, withLoading } from './loadingManager.js?cb=014';
// Import necessary functions from aiHandler statically
import { getThemeName, generateSystemPrompt, processAIResponse, handleApiError, makeAICallForSystemAction } from './aiHandler.js?cb=014';
// Import location system
import { initializeLocationSystem } from './locations.js?cb=014';
// Import items for fallback generation
import { generateId } from './utils.js?cb=014';
// Import input caching
import { savePlayerAges, savePlayerNames, saveAdventureTheme, loadAdventureTheme } from './inputCache.js?cb=014';
// Import intelligent initialization manager
import { initManager } from './initializationManager.js?cb=014';

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
        const { testLocalAI } = await import('./api_new.js?cb=014');
        await testLocalAI();
        gameState.localAIStatus = 'healthy';
        log("Setup: Local AI server is healthy and ready");
    } catch (error) {
        gameState.localAIStatus = 'unavailable';
        log("Setup WARNING: Local AI server not available:", error.message);
        const guidance = Config.LLM_BACKEND === 'llama-cpp'
            ? 'Run `python start_llama_server.py` (llama.cpp) before starting a game.'
            : 'Run `python working_ai_server.py` (MiniCPM) before starting a game.';
        UI.showPopup(`Local AI server not available. ${guidance}`, 'error');
    }
}

/**
 * DEPRECATED: API key loading removed - system uses local AI exclusively
 */
export function loadApiKeys() {
    const log = window.displayVisualError || console.log;
    log("Setup: DEPRECATED - API key system removed, using local AI exclusively");
    // Function kept for compatibility but does nothing
}

/**
 * DEPRECATED: API key testing removed - system uses local AI exclusively
 */
export async function saveAndTestApiKeys() {
    const log = window.displayVisualError || console.log;
    log("Setup: DEPRECATED - API key system removed, using local AI exclusively");
    // Function kept for compatibility but does nothing
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
 * Main setup completion function - validates inputs and starts the game
 */
export async function completeSetupAndStartGame() {
    const log = window.displayVisualError || console.log;
    log("Setup: Starting game setup completion...");

    // Check local AI status first
    if (gameState.localAIStatus !== 'healthy') {
        log("Setup ERROR: Local AI server not available");
        const guidance = Config.LLM_BACKEND === 'llama-cpp'
            ? 'Run `python start_llama_server.py` to start llama.cpp.'
            : 'Run `python working_ai_server.py` to start the MiniCPM backend.';
        UI.showPopup(`Local AI server not available. ${guidance}`, 'error');
        return;
    }

    // Validate name inputs
    if (!UI.elements.nameInputsContainer) { log("Setup ERROR: Name inputs container missing."); return; }
    const nameInputs = UI.elements.nameInputsContainer.querySelectorAll('input[type="text"]');
    if (nameInputs.length !== gameState.playerCount) { log("Setup ERROR: Name input count mismatch."); return; }
    
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

    // Save names to cache
    savePlayerNames(playerNames);

    log(`Setup: Names validated: [${playerNames.join(', ')}]. Starting game initialization...`);
    
    // Store player names in gameState before reset
    gameState.playerNames = [...playerNames];
    
    loadingManager.showLoading('Initializing adventure...');

    try {
        // Reset game state (preserves playerNames, playerAges, playerCount)
        resetGameState();
        loadingManager.updateStatus('Creating characters...');

        // Use preserved data from gameState
        const finalPlayerNames = gameState.playerNames;
        const finalPlayerAges = gameState.playerAges;

        // Create player characters - PHASE 1: Create and add to gameState first
        gameState.players = [];
        for (let i = 0; i < finalPlayerNames.length; i++) {
            const name = finalPlayerNames[i];
            const age = finalPlayerAges[i] || 10; // Default age if missing
            log(`Setup: Creating player ${i + 1}: ${name}, age ${age}`);
            
            const player = createNewPlayer(name, age);
            
            // Generate starting equipment
            const startingItems = Items.generateStartingItems(gameState.adventureTheme);
            log(` -> Generated ${startingItems.length} starting items`);
            
            // Add items to inventory and equip weapon/armor
            startingItems.forEach(item => {
                player.inventory.push(item);
                if (item.type === 'Weapon' && !player.equipment.weapon) {
                    player.equipment.weapon = item.id;
                    item.equippedSlot = 'weapon';
                    log(` -> Equipped starting weapon: ${item.name}`);
                } else if (item.type === 'Armor' && !player.equipment.armor) {
                    player.equipment.armor = item.id;
                    item.equippedSlot = 'armor';
                    log(` -> Equipped starting armor: ${item.name}`);
                }
            });
            Combat.recalculateCharacterStats(player);
             log(` -> Recalculated initial stats for ${name}: ATK=${player.atk}, DEF=${player.def}`);
            
            // ADD PLAYER TO GAMESTATE FIRST - this is critical for AI calls to work
            gameState.players.push(player);
        }
        
        // Set current player index so getCurrentPlayer() works
        gameState.currentPlayerIndex = 0;
        
        // PHASE 2: Initialize spellcasting AFTER all players are in gameState
        for (let i = 0; i < gameState.players.length; i++) {
            const player = gameState.players[i];
            log(`Setup: Initializing spellcasting for ${player.name}...`);
            await Spells.initializePlayerSpellcasting(player);
            log(` -> Initialized spellcasting for ${player.name}: ${player.spellcasting.knownSpells.length} starting abilities`);
        }
         if (!gameState.players || gameState.players.length === 0) { throw new Error("Player array is empty after creation loop."); }
    } catch (error) {
         log("Setup ERROR: Failed during player object creation:", error);
         UI.showPopup(`Error creating players: ${error.message}. Please try again.`, 'error');
         UI.showScreen('nameInputScreen');
         return;
    }
    log("Setup: Player creation complete.");
    loadingManager.updateStatus('Generating starting equipment...');

    // --- Initialize Remaining Game State ---
    gameState.enemies = [];
    gameState.turn = 1;
    gameState.isGoalComplete = false;
    gameState.allowCustomActions = false;
    gameState.messageHistory = [];
    gameState.inCombat = false;
    gameState.currentSaveSlot = null;
    // Generate shop items using dynamic system with fallback
    try {
        const dynamicItems = await import('./dynamicItems.js?cb=014');
        gameState.shopItems = await dynamicItems.generateDynamicShopItems(8, gameState.turn);
        log(`Generated ${gameState.shopItems.length} dynamic shop items`);
    } catch (error) {
        log(`Dynamic shop generation failed: ${error.message}. Using fallback items.`);
        // Use fallback static items so game can continue
        gameState.shopItems = generateFallbackShopItems(gameState.adventureTheme);
        log(`Using ${gameState.shopItems.length} fallback shop items`);
    }
    
    // Initialize missing state properties
    await initializeGameState();
    
    // Initialize dynamic spell system
    loadingManager.updateStatus('Loading AI systems...');
    try {
        const DynamicSpells = await import('./dynamicSpells.js?cb=014');
        // The dynamicSpellRegistry is already initialized on import
        log("Dynamic spell registry loaded:", DynamicSpells.dynamicSpellRegistry ? "Success" : "Failed");
        log("Dynamic spell system initialized successfully");
    } catch (error) {
        log(`Dynamic spell initialization failed: ${error.message}`);
        // Non-fatal error - continue with game setup
    }

    // Initialize location system
    loadingManager.updateStatus('Initializing world...');
    try {
        await initializeLocationSystem();
        log("Location system initialized");
    } catch (error) {
        log(`Location system initialization failed: ${error.message}`);
        // Non-fatal error - continue
    }

    // Generate initial story and start the game
    loadingManager.updateStatus('Starting your adventure...');
    log("Setup: Generating initial story with local AI...");
    
    try {
        await makeAICallForSystemAction('start_adventure', null);
        log("Setup: Initial story generated successfully");
        
        // Final setup
        UI.renderPlayerCards();
        UI.showScreen('gameScreen');
        loadingManager.hideLoading();
        
        log(`Setup: Game setup complete! Adventure begins with ${Config.getActiveBackendConfig().modelName} (backend ${Config.LLM_BACKEND}).`);
        UI.showPopup('Adventure begins! Your choices shape the story.', 'success');

    } catch (error) {
        log("Setup ERROR: Failed to generate initial story:", error);
        loadingManager.hideLoading();
        UI.showPopup('Failed to start adventure. Please check that the local AI server is running.', 'error');
        UI.showScreen('mainMenuScreen');
    }
}

/**
 * ALTERNATIVE: Use intelligent initialization manager for robust setup
 * This is a better approach that handles dependencies and error recovery
 */
export async function completeSetupAndStartGameIntelligent() {
    const log = window.displayVisualError || console.log;
    log("Setup: Starting INTELLIGENT game initialization...");
    
    // Show loading screen
    loadingManager.showLoading('Preparing intelligent initialization...');

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

    try {
        // Set up progress monitoring
        const progressInterval = setInterval(() => {
            const progress = initManager.getProgress();
            loadingManager.updateStatus(`Initializing... ${progress.completed}/${progress.total} tasks complete (${progress.percentage}%)`);
            
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
            log("Setup: Results:", result.results);
            
            // Show success message
            UI.showPopup('Adventure begins! Your choices shape the story.', 'success');
        } else {
            log("Setup ERROR: Intelligent initialization failed:", result.error);
            log("Setup: Partial results:", result.results);
            
            loadingManager.hideLoading();
            UI.showPopup(`Initialization failed: ${result.error}. Some features may not work properly.`, 'error');
            
            // Try to show game screen anyway if players were created
            if (result.results.completed.includes('createPlayers')) {
                log("Setup: Players were created, attempting to continue...");
                UI.renderPlayerCards();
                UI.showScreen('gameScreen');
            } else {
                UI.showScreen('mainMenuScreen');
            }
        }

    } catch (error) {
        log("Setup CRITICAL ERROR: Initialization system failed:", error);
        loadingManager.hideLoading();
        UI.showPopup(`Critical initialization error: ${error.message}. Please restart the game.`, 'error');
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
