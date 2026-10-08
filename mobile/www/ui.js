// ui.js
// Handles DOM manipulation, UI updates, screen transitions, popups, modals, etc.

// --- Module Imports ---
import { playHpEffects, resetFx } from './fx.js';
import { gameState } from './state.js';
import * as Config from './config.js';
import { loadPlayerAges, loadPlayerNames, loadAdventureTheme } from './inputCache.js';
import * as Spells from './spells.js';
import * as SpellUI from './spellUI.js';
// Import specific utils needed
import { sanitizeText, shuffleArray } from './utils.js';
import { describeQuestStep, friendlyMilestone } from './questDefinitions.js';
// Import functions from other new modules
import { getCurrentPlayer, canCurrentPlayerAct } from './state.js';
// Import themedItemData directly if it's exported from items.js
import { themedItemData } from './items.js';
// Import reputation price calculation
import { calculateItemPrice } from './actionHandler.js';
// Import reputation system functions
import { getContextualizedFactions, calculateTrustLevel } from './reputationContextualizer.js';


// --- DOM Element References ---
// (Keep the existing elements object definition as is)
export const elements = {
    // Screens
    mainMenuScreen: document.getElementById('mainMenuScreen'),
    localAIScreen: document.getElementById('localAIScreen'),
    playerCountScreen: document.getElementById('playerCountScreen'),
    adventureTypeScreen: document.getElementById('adventureTypeScreen'),
    ageInputScreen: document.getElementById('ageInputScreen'),
    nameInputScreen: document.getElementById('nameInputScreen'),
    gameScreen: document.getElementById('gameScreen'),
    menuScreen: document.getElementById('menuScreen'),
    inventoryScreen: document.getElementById('inventoryScreen'),
    shopScreen: document.getElementById('shopScreen'),
    specialMovesScreen: document.getElementById('specialMovesScreen'),
    loadGameScreen: document.getElementById('loadGameScreen'),
    aboutScreen: document.getElementById('aboutScreen'),

    // Main Menu Buttons
    newGameBtn: document.getElementById('newGameBtn'),
    continueGameBtn: document.getElementById('continueGameBtn'),
    loadGameBtn: document.getElementById('loadGameBtn'),
    localAIBtn: document.getElementById('localAIBtn'),
    aboutBtn: document.getElementById('aboutBtn'),

    // Local AI Screen
    localAIStatus: document.getElementById('localAIStatus'),
    checkLocalAIBtn: document.getElementById('checkLocalAIBtn'),

    // Player Count Screen
    playerCountBtns: document.querySelectorAll('.playerCountBtn'),

    // Adventure Type Screen
    adventureTypeSelect: document.getElementById('adventureTypeSelect'),
    customThemeContainer: document.getElementById('customThemeContainer'),
    customThemeInput: document.getElementById('customThemeInput'),
    adventureTypeNextBtn: document.getElementById('adventureTypeNextBtn'),

    // Age Input Screen
    ageInputsContainer: document.getElementById('ageInputsContainer'),
    ageError: document.getElementById('ageError'),
    ageInputNextBtn: document.getElementById('ageInputNextBtn'),

    // Name Input Screen
    nameInputsContainer: document.getElementById('nameInputsContainer'),
    nameError: document.getElementById('nameError'),
    nameInputStartBtn: document.getElementById('nameInputStartBtn'),

    // Generic Back Buttons
    backBtns: document.querySelectorAll('.backBtn'),

    // Game Screen Elements
    gameHeader: document.getElementById('gameHeader'),
    adventureTitle: document.getElementById('adventureTitle'),
    adventureGoalContainer: document.getElementById('adventureGoalContainer'),
    adventureGoal: document.getElementById('adventureGoal'),
    turnCounter: document.getElementById('turnCounter'),
    
    // Quest Progress Elements
    questProgressContainer: document.getElementById('questProgressContainer'),
    questPhase: document.getElementById('questPhase'),
    questPercentage: document.getElementById('questPercentage'),
    questProgressBar: document.getElementById('questProgressBar'),
    questProgressDetails: document.getElementById('questProgressDetails'),
    questProgressToggle: document.getElementById('questProgressToggle'),
    questProgressContent: document.getElementById('questProgressContent'),
    objectivesList: document.getElementById('objectivesList'),
    milestonesList: document.getElementById('milestonesList'),
    sideQuestsList: document.getElementById('sideQuestsList'),
    secretsList: document.getElementById('secretsList'),
    sideQuestsSection: document.getElementById('sideQuestsSection'),
    discoveredSecrets: document.getElementById('discoveredSecrets'),
    playerStatsContainer: document.getElementById('playerStatsContainer'),
    currentPlayerIndicator: document.getElementById('currentPlayerIndicator'),
    playersDisplay: document.getElementById('playersDisplay'),
    quickActions: document.getElementById('quickActions'),
    inventoryBtn: document.getElementById('inventoryBtn'),
    shopBtn: document.getElementById('shopBtn'),
    specialBtn: document.getElementById('specialBtn'),
    helpAllyBtn: document.getElementById('helpAllyBtn'),
    menuBtn: document.getElementById('menuBtn'),
    enemyContainer: document.getElementById('enemyContainer'),
    enemiesDisplay: document.getElementById('enemiesDisplay'),
    storyCard: document.getElementById('storyCard'),
    storyText: document.getElementById('storyText'),
    turnRecap: document.getElementById('turnRecap'),
    // toggleStoryBtn: document.getElementById('toggleStoryBtn'), // REMOVED
    choicesCard: document.getElementById('choicesCard'),
    choicesContainer: document.getElementById('choicesContainer'),
    customActionContainer: document.getElementById('customActionContainer'),
    customActionInput: document.getElementById('customActionInput'),
    customActionBtn: document.getElementById('customActionBtn'),

    // In-Game Menu Screen
    resumeBtn: document.getElementById('resumeBtn'),
    menuDirectBtns: document.querySelectorAll('.menuDirectBtn'),
    saveGameBtn: document.getElementById('saveGameBtn'),
    exitToMainMenuBtn: document.getElementById('exitToMainMenuBtn'),
    exitWithoutSavingBtn: document.getElementById('exitWithoutSavingBtn'),

    // Inventory Screen
    inventoryDisplay: document.getElementById('inventoryDisplay'),

    // Shop Screen
    shopDisplay: document.getElementById('shopDisplay'),
    shopCoins: document.getElementById('shopCoins'),

    // Special Moves Screen
    specialMovesDisplay: document.getElementById('specialMovesDisplay'),

    // Load Game Screen
    savedGamesList: document.getElementById('savedGamesList'),
    loadError: document.getElementById('loadError'),
    noSavesMessage: document.getElementById('noSavesMessage'),

    // Sub-screen Back Buttons
    backToGameBtns: document.querySelectorAll('.backToGameBtn'),
    backToMenuBtns: document.querySelectorAll('.backToMenuBtn'),

    // Popups & Indicators
    popupMessage: document.getElementById('popupMessage'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    loadingMessage: document.getElementById('loadingMessage'),

    // Context Headers (shared elements in Inv/Shop/Moves)
    contextPlayerNameElements: document.querySelectorAll('.contextPlayerName'),
    contextPlayerCoinsElements: document.querySelectorAll('.contextPlayerCoins'),

    // Modals & Contents
    confirmationModal: document.getElementById('confirmationModal'),
    confirmationTitle: document.getElementById('confirmationTitle'),
    confirmationMessage: document.getElementById('confirmationMessage'),
    confirmYesBtn: document.getElementById('confirmYesBtn'),
    confirmNoBtn: document.getElementById('confirmNoBtn'),
    helpAllyModal: document.getElementById('helpAllyModal'),
    revivalItemStatus: document.getElementById('revivalItemStatus'),
    revivalItemCount: document.getElementById('revivalItemCount'),
    helpAllyTargetList: document.getElementById('helpAllyTargetList'),
    cancelHelpAllyBtn: document.getElementById('cancelHelpAllyBtn'),
    saveGameModal: document.getElementById('saveGameModal'),
    saveGameNameInput: document.getElementById('saveGameNameInput'),
    saveError: document.getElementById('saveError'),
    confirmSaveBtn: document.getElementById('confirmSaveBtn'),
    cancelSaveBtn: document.getElementById('cancelSaveBtn'),
    existingSavesForOverwrite: document.getElementById('existingSavesForOverwrite'),
    overwriteSaveList: document.getElementById('overwriteSaveList'),

    // Quick Action Buttons
    quickActionButtons: {
        inventoryBtn: document.getElementById('inventoryBtn'),
        shopBtn: document.getElementById('shopBtn'),
        specialBtn: document.getElementById('specialBtn'),
        helpAllyBtn: document.getElementById('helpAllyBtn'),
        menuBtn: document.getElementById('menuBtn'),
        customActionBtn: document.getElementById('customActionBtn')
    }
};


// --- Screen Management ---

/** Shows a popup message with the specified type and duration. */
export function showPopup(message, type = 'info', duration = 3000) {
    const log = window.displayVisualError || console.log;
    log(`Showing popup: ${message} (${type})`);

    // God-mode tutorial passed a whole HTML panel, shown as raw markup in a toast.
    if (type === 'god_mode_tutorial' || /<\/?div/i.test(String(message))) {
        message = '⚡ God mode: type anything in the golden box and it happens.';
        type = 'legendary'; duration = Math.max(duration, 4000);
    }
    // Queue lives in this module, not gameState: it was saved with the game,
    // and a reloaded queue of 18 stale toasts never started again.
    popupQueue.push({ message, type, duration });
    // Keep it current, but never drop level-ups, victories or loot (legendary/success).
    while (popupQueue.length > 4) {
        const i = popupQueue.findIndex((p, j) => j > 0 && !['legendary', 'success', 'item', 'capture'].includes(p.type));
        if (i === -1) break;
        popupQueue.splice(i, 1);
    }
    if (!popupShowing) showNextPopup();
}
const popupQueue = [];
let popupShowing = false;

/** Shows the next popup in the queue if enough time has passed. */
let lastPopupTime = 0;
function showNextPopup() {
    const log = window.displayVisualError || console.log;
    const now = Date.now();
    
    // Ensure minimum time between popups
    if (now - lastPopupTime < 500) {
        setTimeout(() => showNextPopup(), 500);
        return;
    }

    // Get next popup from queue
    const nextPopup = popupQueue[0];
    popupShowing = !!nextPopup;
    if (!nextPopup) {
        log("No more popups to show");
        return;
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = `popup-message popup-${nextPopup.type}`;
    
    // Handle special popup types
    if (nextPopup.type === 'boss_encounter') {
        popup.innerHTML = `
            <div class="boss-encounter-content">
                <div class="boss-encounter-header">
                    <span class="boss-encounter-icon">⚔️</span>
                    <h2 class="boss-encounter-title">BOSS ENCOUNTER</h2>
                    <span class="boss-encounter-icon">⚔️</span>
                </div>
                <div class="boss-encounter-description">${sanitizeText(nextPopup.message)}</div>
                <div class="boss-encounter-warning">Prepare for battle!</div>
            </div>
        `;
    } else {
        popup.textContent = nextPopup.message;
    }
    
    document.body.appendChild(popup);

    // Show popup
    requestAnimationFrame(() => {
        popup.style.opacity = '1';
        popup.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Update last popup time
    lastPopupTime = now;

    // Remove popup after duration
    setTimeout(() => {
        popup.style.opacity = '0';
        popup.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => {
            popup.parentNode?.removeChild(popup);
            popupQueue.shift();
            if (popupQueue.length > 0) showNextPopup();
            else popupShowing = false;
        }, 300);
    }, nextPopup.duration);
}

/** Shows a screen and hides others. */
let gameScreenScrollY = 0;
export function showScreen(screenId) {
    const log = window.displayVisualError || console.log;
    log(`Showing screen: ${screenId}`);

    // Leaving the game screen for Bag/Shop/Moves: remember where the reader was.
    if (gameState.currentScreen === 'gameScreen' && screenId !== 'gameScreen') gameScreenScrollY = window.scrollY || 0;
    const backToGame = screenId === 'gameScreen' && ['inventoryScreen', 'shopScreen', 'specialMovesScreen', 'storyBookScreen', 'menuScreen'].includes(gameState.currentScreen);
    // Update state
    gameState.currentScreen = screenId;

    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden');
    });

    // Show requested screen
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.remove('hidden');
        screen.classList.add('active');
        // Fill the header now, not when the background goal task finishes
        // (the screen opened showing "Adventure Name / Objective").
        if (screenId === 'gameScreen') { try { updateGameHeader(); gameState.godModeManager?.updateGodModeUI?.(); } catch (_) {} }
        if (screenId === 'mainMenuScreen') { try { window.__refreshContinue?.(); } catch (_) {} }
        window.scrollTo?.(0, backToGame ? gameScreenScrollY : 0);
    } else {
        log(`ERROR: Screen ${screenId} not found`);
    }
}

/**
 * Phase 3.5 P4: append a single line to the in-game combat log strip and
 * scroll it into view. Lines persist across the combat encounter; cleared
 * automatically when combat ends (see clearCombatLog). The card auto-shows
 * itself when the first line is appended and auto-hides on clear.
 *
 * @param {string} line - the mechanical-event string to append
 * @param {string} kind - 'attack'|'defend'|'item'|'status'|'flee'|'system' (CSS class)
 */
export function appendCombatLog(line, kind = 'system') {
    const card = document.getElementById('combatLogCard');
    const strip = document.getElementById('combatLogStrip');
    if (!card || !strip || !line) return;
    const div = document.createElement('div');
    div.className = `combat-log-line combat-log-${kind}`;
    div.textContent = line;
    strip.appendChild(div);
    // Cap to last 30 lines so the DOM doesn't grow unbounded across long fights.
    while (strip.children.length > 30) strip.removeChild(strip.firstChild);
    // Auto-scroll to most recent line
    strip.scrollTop = strip.scrollHeight;
    // Show card if it's the first line of the encounter
    if (card.classList.contains('hidden')) card.classList.remove('hidden');
}

/**
 * Clears the combat log strip and hides the card. Called when combat ends
 * (handleCombatVictory, party-wipe recovery, run/flee).
 */
export function clearCombatLog() {
    const card = document.getElementById('combatLogCard');
    const strip = document.getElementById('combatLogStrip');
    if (strip) strip.innerHTML = '';
    if (card) card.classList.add('hidden');
}

/**
 * Phase 3.5 P5: render and surface the game-over screen after the player has
 * suffered MAX_CONSECUTIVE_WIPES party wipes without a victory. Populates the
 * summary card with milestones earned, items kept, location, and the reason.
 * The three buttons (Continue Anyway / Save Final State / Begin a New Tale)
 * are wired up in main.js.
 *
 * @param {object} info - { reason, consecutiveWipes, lastEnemies, lastLocation }
 */
export function showGameOverScreen(info = {}) {
    const log = window.displayVisualError || console.log;
    const summary = document.getElementById('gameOverSummary');
    const flavor = document.getElementById('gameOverFlavor');
    if (!summary) {
        log('ERROR: gameOverSummary element not found.');
        return;
    }
    const milestones = (gameState.questProgress?.milestones || []).map(m => m.name);
    const items = (gameState.players || []).flatMap(p => p?.inventory || []).map(i => i.name); // whole party, not hero 1
    const npcs = Object.keys(gameState.entityMemory?.npcs || {});
    const locs = Object.keys(gameState.entityMemory?.locations || {});
    const flavorText = info.reason === 'party_wipe'
        ? `Your party has fallen ${info.consecutiveWipes || 'multiple'} times in a row in ${info.lastLocation || 'this place'}${info.lastEnemies ? `, defeated by ${info.lastEnemies}` : ''}. The world is unforgiving — but the choice is yours.`
        : `Your story pauses here. The choice is yours.`;
    if (flavor) flavor.textContent = flavorText;
    // Names, goal and location are model-written; escape before innerHTML.
    const esc = sanitizeText;
    summary.innerHTML = `
        <h3>What was achieved</h3>
        <p><strong>Turns played:</strong> ${gameState.turn || 1}</p>
        <p><strong>Last known location:</strong> ${esc(gameState.currentLocation?.name || info.lastLocation || 'Unknown')}</p>
        <p><strong>Adventure goal:</strong> ${esc(gameState.adventureGoal || 'Not set')}</p>
        <p><strong>Milestones reached (${milestones.length}):</strong> ${milestones.length ? esc(milestones.join(', ')) : '— none —'}</p>
        <p><strong>Items carried (${items.length}):</strong> ${items.length ? esc(items.slice(0, 12).join(', ')) + (items.length > 12 ? `, …and ${items.length - 12} more` : '') : '— none —'}</p>
        <p><strong>Allies remembered:</strong> ${npcs.length ? esc(npcs.slice(0, 8).join(', ')) : '— none —'}</p>
        <p><strong>Places known:</strong> ${locs.length ? esc(locs.slice(0, 8).join(', ')) : '— none —'}</p>
    `;
    showScreen('gameOverScreen');
    log(`GameOver screen shown — reason=${info.reason}, wipes=${info.consecutiveWipes}`);
}

/** Shows or hides a modal. */
export function showModal(modalId) {
    const log = window.displayVisualError || console.log;
    log(`Showing modal: ${modalId}`);

    const modal = document.getElementById(modalId);
    if (!modal) {
        log(`ERROR: Modal ${modalId} not found`);
        return;
    }

    // Add to active modals
    if (!gameState.activeModals.includes(modalId)) {
        gameState.activeModals.push(modalId);
    }

    modal.classList.remove('hidden');
}

/** Hides a modal. */
export function hideModal(modalId) {
    const log = window.displayVisualError || console.log;
    log(`Hiding modal: ${modalId}`);

    const modal = document.getElementById(modalId);
    if (!modal) {
        log(`ERROR: Modal ${modalId} not found`);
        return;
    }

    // Remove from active modals
    gameState.activeModals = gameState.activeModals.filter(id => id !== modalId);

    modal.classList.add('hidden');
}

// --- UI Updates ---

/** Updates the entire game UI based on the current gameState. */
export function updateGameUI() {
    const log = window.displayVisualError || console.log; // Use logger
    if (gameState.currentScreen !== 'gameScreen' || !elements.gameScreen) return;
    log("UI: Updating full game UI.");
    
    // Initialize spellcasting for players if needed
    if (gameState.players) {
        gameState.players.forEach(async (player) => {
            if (player && !player.spellcasting) {
                await Spells.initializePlayerSpellcasting(player);
            } else if (player) {
                Spells.ensureBattleSpells(player); // saves from before every hero got an attack + heal spell
            }
        });
    }
    
    updateGameHeader();
    
    // Spells are cast from the Moves screen (one place; the extra Book/Cast
    // quick buttons appeared only on loaded games and crowded the bar).
    renderPlayerCards();
    renderEnemyCards();
    updateQuickActions();
    updateContextHeaders();
    // Choices are rendered separately by processAIResponse or renderChoices call
    // Story text is updated separately by updateStoryText
}

/**
 * Generate Story Memory UI with plot thread tracker
 * @returns {string} HTML for story memory display
 */
function generateStoryMemoryUI() {
    if (!gameState.storyContinuityAgent) {
        return '<div class="story-memory"><p><em>Story memory initializing...</em></p></div>';
    }
    
    try {
        // Get story data from the continuity agent
        const storyData = gameState.storyContinuityAgent.getStoryMemory();
        
        if (!storyData || Object.keys(storyData).length === 0) {
            return '<div class="story-memory"><p><em>No story threads yet...</em></p></div>';
        }
        
        // Generate plot threads display
        const plotThreadsHTML = generatePlotThreadsUI(storyData.plotThreads || {});
        
        // Generate key events display
        const keyEventsHTML = generateKeyEventsUI(storyData.keyEvents || []);
        
        // Generate character relationships display
        const relationshipsHTML = generateRelationshipsUI(storyData.relationships || {});
        
        return `
            <div class="story-memory">
                <div class="story-memory-header">
                    <h4>📚 Story Memory</h4>
                    <span class="story-memory-count">${Object.keys(storyData.plotThreads || {}).length} Threads</span>
                </div>
                <div class="story-memory-content">
                    ${plotThreadsHTML}
                    ${keyEventsHTML}
                    ${relationshipsHTML}
                </div>
            </div>
        `;
    } catch (error) {
        console.log(`Story memory UI error: ${error.message}`);
        return '<div class="story-memory"><p><em>Story data loading...</em></p></div>';
    }
}

/**
 * Generate plot threads UI
 * @param {object} plotThreads - Plot threads data
 * @returns {string} HTML for plot threads
 */
function generatePlotThreadsUI(plotThreads) {
    if (!plotThreads || Object.keys(plotThreads).length === 0) {
        return '<div class="plot-threads"><p><em>No active plot threads...</em></p></div>';
    }
    
    const threadsHTML = Object.entries(plotThreads)
        .slice(0, 3) // Show top 3 most recent/important threads
        .map(([threadId, thread]) => {
            const statusClass = thread.status === 'active' ? 'thread-active' : 
                               thread.status === 'resolved' ? 'thread-resolved' : 'thread-dormant';
            const statusIcon = thread.status === 'active' ? '🔥' : 
                              thread.status === 'resolved' ? '✅' : '💤';
            
            return `
                <div class="plot-thread ${statusClass}">
                    <div class="thread-header">
                        <span class="thread-icon">${statusIcon}</span>
                        <span class="thread-title">${sanitizeText(thread.title || 'Unknown Thread')}</span>
                    </div>
                    <div class="thread-description">
                        ${sanitizeText((thread.description || '').slice(0, 100))}${thread.description?.length > 100 ? '...' : ''}
                    </div>
                </div>
            `;
        }).join('');
    
    return `
        <div class="plot-threads">
            <h5>🧵 Active Threads</h5>
            ${threadsHTML}
        </div>
    `;
}

/**
 * Generate key events UI
 * @param {array} keyEvents - Key events data
 * @returns {string} HTML for key events
 */
function generateKeyEventsUI(keyEvents) {
    if (!keyEvents || keyEvents.length === 0) {
        return '';
    }
    
    const eventsHTML = keyEvents
        .slice(-3) // Show last 3 key events
        .map(event => {
            const significance = event.significance || 0.5;
            const significanceClass = significance > 0.8 ? 'event-major' : 
                                    significance > 0.5 ? 'event-moderate' : 'event-minor';
            const significanceIcon = significance > 0.8 ? '⭐' : 
                                   significance > 0.5 ? '🔸' : '🔹';
            
            return `
                <div class="key-event ${significanceClass}">
                    <span class="event-icon">${significanceIcon}</span>
                    <span class="event-text">${sanitizeText((event.description || '').slice(0, 80))}${event.description?.length > 80 ? '...' : ''}</span>
                </div>
            `;
        }).join('');
    
    return `
        <div class="key-events">
            <h5>📖 Recent Events</h5>
            ${eventsHTML}
        </div>
    `;
}

/**
 * Generate relationships UI
 * @param {object} relationships - Relationships data
 * @returns {string} HTML for relationships
 */
function generateRelationshipsUI(relationships) {
    if (!relationships || Object.keys(relationships).length === 0) {
        return '';
    }
    
    const relationshipsHTML = Object.entries(relationships)
        .slice(0, 2) // Show top 2 most significant relationships
        .map(([npcId, relationship]) => {
            const trust = relationship.trust || 0;
            const trustClass = trust > 0.6 ? 'relationship-positive' : 
                              trust < 0.4 ? 'relationship-negative' : 'relationship-neutral';
            const trustIcon = trust > 0.6 ? '💚' : trust < 0.4 ? '💔' : '💛';
            
            return `
                <div class="relationship ${trustClass}">
                    <span class="relationship-icon">${trustIcon}</span>
                    <span class="relationship-name">${sanitizeText(relationship.name || npcId)}</span>
                    <span class="relationship-status">${Math.round(trust * 100)}%</span>
                </div>
            `;
        }).join('');
    
    if (relationshipsHTML) {
        return `
            <div class="relationships">
                <h5>👥 Key Relationships</h5>
                ${relationshipsHTML}
            </div>
        `;
    }
    
    return '';
}

/**
 * Generate AI System Status UI
 * @returns {string} HTML for AI system status display
 */
function generateAISystemStatusUI() {
    if (!gameState) return '';
    
    const systems = [
        { name: 'Dynamic Items', agent: gameState.dynamicItemRegistry, icon: '🎒', status: 'active' },
        { name: 'Dynamic Spells', agent: gameState.dynamicSpellRegistry, icon: '✨', status: 'active' },
        { name: 'Dynamic Enemies', agent: gameState.dynamicEnemyRegistry, icon: '👹', status: 'active' },
        { name: 'Dynamic Locations', agent: gameState.dynamicLocationRegistry, icon: '🗺️', status: 'active' },
        { name: 'Story Continuity', agent: gameState.storyContinuityAgent, icon: '📚', status: 'active' },
        { name: 'Character Development', agent: gameState.characterDevelopmentAgent, icon: '🎭', status: 'active' },
        { name: 'World Evolution', agent: gameState.worldEvolutionAgent, icon: '🌍', status: 'active' },
        { name: 'Difficulty Adaptation', agent: gameState.difficultyAdaptationAgent, icon: '⚖️', status: 'active' },
        { name: 'Context Optimization', agent: gameState.localAIContextOptimizer, icon: '🧠', status: 'active' }
    ];
    
    const activeCount = systems.filter(s => s.agent).length;
    const totalCount = systems.length;
    
    const systemsHTML = systems.map(system => {
        const isActive = system.agent !== null && system.agent !== undefined;
        const statusClass = isActive ? 'ai-system-active' : 'ai-system-inactive';
        const statusIcon = isActive ? '✅' : '❌';
        
        return `
            <div class="ai-system-item ${statusClass}">
                <span class="ai-system-icon">${system.icon}</span>
                <span class="ai-system-name">${sanitizeText(system.name)}</span>
                <span class="ai-system-status">${statusIcon}</span>
            </div>
        `;
    }).join('');
    
    return `
        <div class="ai-system-status">
            <div class="ai-system-header">
                <h4>🤖 AI Systems Status</h4>
                <span class="ai-system-count">${activeCount}/${totalCount} Active</span>
            </div>
            <div class="ai-systems-grid">
                ${systemsHTML}
            </div>
        </div>
    `;
}

/** Updates the game header (title, goal, turn, custom action visibility). */
export function updateGameHeader() {
    const log = window.displayVisualError || console.log; // Use logger
    let themeName = 'Adventure';
    try {
        if (gameState.adventureTheme === 'custom') {
             themeName = gameState.customThemeDescription || 'Custom Adventure';
        } else if (elements.adventureTypeSelect) {
             const option = elements.adventureTypeSelect.querySelector(`option[value="${gameState.adventureTheme}"]`);
             themeName = option ? option.textContent : (gameState.adventureTheme || 'Adventure');
        } else { themeName = gameState.adventureTheme || 'Adventure'; }
    } catch (e) { log("Failed to get theme name for header", e); }

    if (elements.adventureTitle) elements.adventureTitle.textContent = String(themeName);
    const hasRealGoal = gameState.adventureGoal && gameState.adventureGoal !== 'Not set yet.';
    if (elements.adventureGoal) elements.adventureGoal.textContent = String(hasRealGoal ? gameState.adventureGoal : 'Setting your quest...');
    if (elements.turnCounter) elements.turnCounter.textContent = gameState.turn;
    // Players never saw what to do next: chapter + next beat, kid-friendly.
    const step = describeQuestStep(gameState);
    const chapterEl = document.getElementById('questChapter'), nextEl = document.getElementById('questNextStep');
    if (chapterEl && nextEl) {
        chapterEl.textContent = gameState.isGoalComplete ? 'Quest complete!' : (step?.chapter || '');
        nextEl.textContent = gameState.isGoalComplete ? '· God mode: type anything to shape the world' : (step ? `· Next: ${step.next}` : '');
    }

    // Update custom action visibility based on game state
    if (elements.customActionContainer) {
        // Never shown: the golden god-mode box in the choices card is the one
        // input (players saw two). This input only carries its text to
        // handleCustomAction.
        elements.customActionContainer.classList.add('hidden');
    }

    // Update quest progress
    updateQuestProgressUI();
}

/** Renders all player cards in the player display area. */
export function renderPlayerCards() {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.playersDisplay || !elements.currentPlayerIndicator) {
        log("UI Warning: Player display elements not found.");
        return;
    }
    elements.playersDisplay.innerHTML = '';
    if (!gameState.players || gameState.players.length === 0) {
        elements.currentPlayerIndicator.textContent = 'No Players';
        return;
    }
    let currentPlayer;
    try { currentPlayer = getCurrentPlayer(); } catch (e) { log("Failed to get current player for rendering", e); }
    elements.currentPlayerIndicator.textContent = `Current Turn: ${String(currentPlayer?.name || 'N/A')}`;
    gameState.players.forEach((player, index) => {
        if (!player) { log(`Warning: Player object at index ${index} is invalid.`); return; }
        const card = createCharacterCard(player, 'player', index, Config);
        elements.playersDisplay.appendChild(card);
    });
    updateCollapsibleListeners();
    renderBattleHud();
    playHpEffects(gameState.players);
}

/** Renders all enemy cards in the enemy display area. */
export function renderEnemyCards() {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.enemiesDisplay || !elements.enemyContainer) {
        log("UI Warning: Enemy display elements not found.");
        return;
    }
    elements.enemiesDisplay.innerHTML = '';
    const activeEnemies = gameState.enemies?.filter(enemy => enemy && !enemy.isDefeated) || [];
    if (gameState.inCombat && activeEnemies.length > 0) {
        elements.enemyContainer.classList.remove('hidden');
        activeEnemies.forEach((enemy, index) => {
            if (!enemy) { log(`Warning: Enemy object at index ${index} is invalid.`); return; }
            const card = createCharacterCard(enemy, 'enemy', index, null);
            elements.enemiesDisplay.appendChild(card);
        });
        updateCollapsibleListeners();
        renderBattleHud();
        playHpEffects(gameState.enemies || []); // defeated too: the killing blow gets its number
    } else {
        elements.enemyContainer.classList.add('hidden');
        renderBattleHud();
    }
}

/**
 * Battle bar pinned to the top of the game screen during fights: every hero's
 * HP/MP and every foe's HP at a glance (players had to scroll between the foe
 * card above the moves and their own card below them). Hit effects attach here.
 */
function renderBattleHud() {
    const screen = document.getElementById('gameScreen');
    if (!screen) return;
    let hud = document.getElementById('battleHud');
    const foes = (gameState.enemies || []).filter(e => e && !e.isDefeated && e.hp > 0);
    if (!gameState.inCombat || !foes.length) { hud?.remove(); document.documentElement.style.setProperty('--hud-h', '0px'); document.body.classList.remove('in-battle'); return; }
    document.body.classList.add('in-battle'); // the HUD shows foes; the separate Enemies card is hidden
    if (!hud) { hud = document.createElement('div'); hud.id = 'battleHud'; screen.prepend(hud); }
    const heroes = (gameState.players || []).filter(Boolean);
    const sig = [...heroes, ...foes].map(c => c.id).join('|') + '#' + gameState.currentPlayerIndex;
    const fx = (c) => (c.statusEffects || []).filter(s => s?.duration > 0).map(s => Config.STATUS_EFFECTS?.[String(s.name).toUpperCase()]?.icon || '✦').join('');
    if (hud.dataset.sig === sig) {
        // Same rows: update numbers/bars in place. Rebuilding wiped the hit
        // effects fx.js had just attached (players never saw their -N).
        for (const c of [...heroes, ...foes]) {
            const row = [...hud.querySelectorAll('[data-character-id]')].find(r => r.dataset.characterId === String(c.id));
            if (!row) continue;
            const bars = row.querySelectorAll('.bh-bar > span');
            if (bars[0]) bars[0].style.width = `${Math.max(0, Math.min(100, Math.round(100 * c.hp / (c.maxHp || 1))))}%`;
            if (bars[1]) bars[1].style.width = `${Math.max(0, Math.min(100, Math.round(100 * (c.mp || 0) / (c.maxMp || 1))))}%`;
            const nums = row.querySelectorAll('.bh-num');
            if (nums[0]) nums[0].textContent = `${c.hp}/${c.maxHp}`;
            if (nums[1]) nums[1].textContent = `${c.mp || 0}/${c.maxMp || 0}`;
            const st = row.querySelector('.bh-fx'); if (st) st.textContent = fx(c);
        }
        document.documentElement.style.setProperty('--hud-h', `${hud.offsetHeight}px`);
        return;
    }
    hud.dataset.sig = sig;
    const bar = (v, max, cls) => `<span class="bh-bar ${cls}"><span style="width:${Math.max(0, Math.min(100, Math.round(100 * v / (max || 1))))}%"></span></span>`;
    const actor = gameState.players?.[gameState.currentPlayerIndex]?.id;
    hud.innerHTML = `<div class="bh-side">${(gameState.players || []).filter(Boolean).map(p => `
        <div class="bh-row${p.id === actor ? ' bh-actor' : ''}${p.isDowned ? ' bh-down' : ''}" data-character-id="${sanitizeText(p.id)}">
          <span class="bh-name">${sanitizeText(p.name)} <small>Lv ${p.level || 1}</small> <span class="bh-fx">${fx(p)}</span></span>
          ${bar(p.hp, p.maxHp, 'bh-hp')}<span class="bh-num">${p.hp}/${p.maxHp}</span>
          ${bar(p.mp || 0, p.maxMp || 1, 'bh-mp')}<span class="bh-num bh-mpn">${p.mp || 0}/${p.maxMp || 0}</span></div>`).join('')}</div>
      <div class="bh-side bh-foes">${foes.map(e => `
        <div class="bh-row bh-foe${e.isBoss ? ' bh-boss' : ''}" data-character-id="${sanitizeText(e.id)}">
          <span class="bh-name">${e.isBoss ? '👑 ' : ''}${sanitizeText(e.name)} <span class="bh-fx">${fx(e)}</span></span>
          ${bar(e.hp, e.maxHp, 'bh-foehp')}<span class="bh-num">${e.hp}/${e.maxHp}</span></div>`).join('')}</div>`;
    document.documentElement.style.setProperty('--hud-h', `${hud.offsetHeight}px`);
}

/**
 * Generate character development UI for player cards
 * @param {Object} character - Player character object
 * @returns {string} HTML string for character development display
 */
function generateCharacterDevelopmentUI(character) {
    if (!gameState.characterDevelopmentAgent) {
        return ''; // No character development system available
    }
    
    try {
        const profile = gameState.characterDevelopmentAgent.getCharacterProfile(character.id);
        if (!profile) {
            return '<div class="character-dev"><p><em>Character development initializing...</em></p></div>';
        }
        
        // Generate personality trait bars
        const personalityHTML = generatePersonalityTraitsUI(profile.traits);
        
        // Generate archetype display
        const archetypeHTML = `<p><strong>Archetype:</strong> <span class="character-archetype">${sanitizeText(profile.archetype)}</span></p>`;
        
        // Generate reputation display
        const reputationHTML = generateReputationUI(profile.reputation);
        
        return `
            <div class="character-development">
                <h4>Character Development</h4>
                ${archetypeHTML}
                ${personalityHTML}
                ${reputationHTML}
            </div>
        `;
    } catch (error) {
        console.log(`Character development UI error: ${error.message}`);
        return '<div class="character-dev"><p><em>Character data loading...</em></p></div>';
    }
}

/**
 * Generate personality traits UI with progress bars
 * @param {Object} traits - Character traits object
 * @returns {string} HTML for personality traits
 */
function generatePersonalityTraitsUI(traits) {
    if (!traits || typeof traits !== 'object') {
        return '<p><em>Personality developing...</em></p>';
    }
    
    // Show top 3 most significant traits
    const traitEntries = Object.entries(traits)
        .filter(([key, value]) => typeof value === 'number' && Math.abs(value) > 0.1)
        .sort(([,a], [,b]) => Math.abs(b) - Math.abs(a))
        .slice(0, 3);
    
    if (traitEntries.length === 0) {
        return '<p><em>Personality traits emerging...</em></p>';
    }
    
    const traitsHTML = traitEntries.map(([trait, value]) => {
        const percentage = Math.abs(value * 100);
        const displayName = trait.charAt(0).toUpperCase() + trait.slice(1);
        const barColor = value > 0 ? '#4CAF50' : '#FF5722';
        
        return `
            <div class="trait-bar">
                <span class="trait-name">${sanitizeText(displayName)}</span>
                <div class="trait-progress">
                    <div class="trait-fill" style="width: ${percentage}%; background-color: ${barColor};"></div>
                </div>
                <span class="trait-value">${Math.round(percentage)}%</span>
            </div>
        `;
    }).join('');
    
    return `
        <div class="personality-traits">
            <p><strong>Key Traits:</strong></p>
            ${traitsHTML}
        </div>
    `;
}

/**
 * Generate faction reputation UI display for new reputation system
 * @returns {string} HTML for faction reputation display
 */
function generateFactionReputationUI() {
    if (!gameState.reputationSystem) {
        return '';
    }
    
    try {
        // Functions imported at top of file
        const factions = gameState.reputationSystem.factions;
        const contextualizedFactions = getContextualizedFactions();
        const trustData = calculateTrustLevel(factions);
        
        // Generate faction reputation bars
        let factionHTML = '';
        Object.entries(factions).forEach(([factionKey, reputation]) => {
            const faction = contextualizedFactions[factionKey];
            if (!faction) return;
            
            const repPercent = Math.max(0, Math.min(100, (reputation + 100) / 2)); // Convert -100 to +100 range to 0-100%
            const repColor = reputation >= 60 ? '#4CAF50' : 
                           reputation >= 20 ? '#8BC34A' :
                           reputation >= -20 ? '#FFC107' :
                           reputation >= -60 ? '#FF9800' : '#FF5722';
            
            const repText = reputation >= 60 ? 'Trusted' :
                           reputation >= 20 ? 'Friendly' :
                           reputation >= -20 ? 'Neutral' :
                           reputation >= -60 ? 'Suspicious' : 'Hostile';
            
            // BUG-15 fix: faction.flavor flows from narrator-driven
            // contextualizedFactions; sanitize before injecting into title.
            factionHTML += `
                <div class="faction-rep-item" title="${sanitizeText(faction.flavor || '')}">
                    <span class="faction-name">${sanitizeText(faction.name)}:</span>
                    <span class="rep-value" style="color: ${repColor};">${reputation}</span>
                    <span class="rep-status">(${repText})</span>
                </div>
            `;
        });
        
        // Trust level indicator
        const trustColor = trustData.trustLevel === 'trusted' ? '#4CAF50' :
                          trustData.trustLevel === 'neutral' ? '#FFC107' :
                          trustData.trustLevel === 'distrusted' ? '#FF9800' : '#FF5722';
        
        return `
            <div class="faction-reputation-display">
                <h5>Faction Standing</h5>
                <div class="trust-level" style="color: ${trustColor};">
                    <strong>Trust Level: ${sanitizeText(trustData.trustLevel.toUpperCase())}</strong>
                </div>
                <div class="faction-list">
                    ${factionHTML}
                </div>
            </div>
        `;
    } catch (error) {
        console.log(`Faction reputation UI error: ${error.message}`);
        return '<div class="faction-rep"><p><em>Reputation loading...</em></p></div>';
    }
}

/**
 * Generate reputation UI display (legacy character development)
 * @param {Object} reputation - Reputation data
 * @returns {string} HTML for reputation display
 */
function generateReputationUI(reputation) {
    if (!reputation) {
        return '<p><em>Reputation unknown...</em></p>';
    }
    
    const globalRep = reputation.global || 0;
    const repColor = globalRep > 0 ? '#4CAF50' : globalRep < 0 ? '#FF5722' : '#FFC107';
    const repText = globalRep > 0.3 ? 'Hero' : globalRep < -0.3 ? 'Villain' : 'Neutral';
    
    return `
        <div class="reputation-display">
            <p><strong>Reputation:</strong> 
                <span class="reputation-badge" style="color: ${repColor};">
                    ${sanitizeText(repText)} (${globalRep > 0 ? '+' : ''}${Math.round(globalRep * 100)})
                </span>
            </p>
        </div>
    `;
}

/** Creates the HTML structure for a player or enemy card. Helper function. */
function createCharacterCard(character, type, index, configRef) {
    // Using sanitizeText for names, effects etc.
    const card = document.createElement('div');
    card.className = `${type}-card`;
    card.dataset.characterId = character.id;
    const isPlayer = type === 'player';
    let isCurrentPlayer = false;
    try { isCurrentPlayer = isPlayer && character.id === getCurrentPlayer()?.id; } catch(e) { /* ignore */ }
    const isDowned = isPlayer && character.isDowned;
    const isDefeated = !isPlayer && character.isDefeated;

    if (isPlayer && isCurrentPlayer) card.classList.add('current-player');
    if (isDowned) card.classList.add('downed');
    if (isDefeated) card.classList.add('defeated');
    
    // Add elite/boss styling for enemies
    if (!isPlayer) {
        if (character.isBoss) {
            card.classList.add('boss-enemy');
        } else if (character.isElite) {
            card.classList.add('elite-enemy');
            card.classList.add(character.eliteType?.toLowerCase() || 'elite');
        }
    }

    let weaponName = 'N/A', weaponTier = '', armorName = 'N/A', armorTier = '';
    if (isPlayer && character.inventory) {
        const weapon = character.inventory.find(item => item?.id === character.equipment?.weapon);
        const armor = character.inventory.find(item => item?.id === character.equipment?.armor);
        weaponName = weapon?.name || 'None'; weaponTier = weapon?.tier || '';
        armorName = armor?.name || 'None'; armorTier = armor?.tier || '';
    }

    // Enhanced status effect display with icons and colors
    const statusEffectString = character.statusEffects?.map(effect => {
        const effectConfig = Object.values(Config.STATUS_EFFECTS).find(config => config.name === effect.name);
        const icon = effectConfig?.icon || '❓';
        const color = effectConfig?.color || '#888888';
        const name = sanitizeText(effect.name || 'Unknown');
        const duration = effect.duration || 0;
        
        // BUG-15 fix: effectConfig.description is catalog-controlled (safe)
        // but effect.name (used in fallback) and the resolved description
        // both flow through narrator-supplied data eventually. Sanitize the
        // title attribute so a malicious narrator/save can't inject markup.
        const titleAttr = sanitizeText(effectConfig?.description || effect.name || 'Unknown');
        return `<span class="status-effect" style="color: ${color};" title="${titleAttr}">${icon} ${name}(${duration})</span>`;
    }).join(' ') || '<span class="no-effects">None</span>';

    const downedTurnsMax = configRef?.DOWNED_TURNS_MAX ?? 3;

    card.innerHTML = `
        <div class="card-details hidden">
             ${isPlayer ? `<p>Status: <span class="${type}-status">${isDowned ? 'Downed' : 'Okay'}</span></p>` : ''}
             ${isPlayer ? `<p>Level ${character.level || 1} · XP <span>${character.xp || 0}/${40 * (character.level || 1)}</span></p>` : ''}
             <p>ATK: <span class="${type}-atk">${character.atk ?? '?'}</span> | DEF: <span class="${type}-def">${character.def ?? '?'}</span></p>
             ${isPlayer ? `<p>Weapon: <span class="${type}-weapon">${sanitizeText(weaponName)} ${weaponTier ? `(${sanitizeText(weaponTier)})` : ''}</span></p>` : ''}
             ${isPlayer ? `<p>Armor: <span class="${type}-armor">${sanitizeText(armorName)} ${armorTier ? `(${sanitizeText(armorTier)})` : ''}</span></p>` : ''}
             ${isPlayer ? `<p>Coins: <span class="${type}-coins">${character.coins ?? 0}</span>💰</p>` : ''}
             ${!isPlayer ? `<p>Abilities: <span class="${type}-abilities">${character.abilities?.map(sanitizeText).join(', ') || 'None'}</span></p>` : ''}
             <p>Effects: <span class="status-effects">${statusEffectString}</span></p>
             ${isPlayer && index === 0 && Object.values(gameState.reputationSystem?.factions || {}).some(v => v) ? generateFactionReputationUI() : ''}
             ${isPlayer ? generateCharacterDevelopmentUI(character) : ''}
        </div>
        <div class="card-header collapsible">
            <span class="${type}-name">${sanitizeText(character.name)}${isPlayer ? ` <small class="hero-level">Lv ${character.level || 1}</small>` : ''}</span>
            <div class="${type}-hp">
                <span class="hp-icon">❤️</span>
                <span class="hp-value">${character.hp ?? '?'}</span>&nbsp;/&nbsp;<span class="hp-max">${character.maxHp ?? '?'}</span>
            </div>
            ${isPlayer ? `
            <div class="${type}-mp">
                <span class="mp-icon">🔮</span>
                <span class="mp-value">${character.mp ?? 0}</span>&nbsp;/&nbsp;<span class="mp-max">${character.maxMp ?? 0}</span>
            </div>` : ''}
            <span class="expand-icon">▼</span>
        </div>
         ${isDowned ? `<div class="downed-indicator">DOWNED (<span class="downed-timer">${Math.max(0, downedTurnsMax - (character.downedTurns ?? 0))}</span> turns left)</div>` : ''}
         ${isDefeated ? `<div class="defeated-indicator">DEFEATED</div>` : ''}
    `;
    return card;
}

/** Attaches click listeners to collapsible card headers. */
function updateCollapsibleListeners() {
    // Use event delegation on a parent container if possible, otherwise re-attach like this
    document.querySelectorAll('.collapsible').forEach(header => {
        // Remove listener first to prevent duplicates if called multiple times
        header.removeEventListener('click', toggleCardDetails);
        header.addEventListener('click', toggleCardDetails);
        // Set initial icon state
        const details = Array.from(header.parentNode.children).find(el => el.classList.contains('card-details'));
        const icon = header.querySelector('.expand-icon');
        if (details && icon) { icon.style.transform = details.classList.contains('hidden') ? 'rotate(-90deg)' : 'rotate(0deg)'; }
    });
}

/** Handles the click event for toggling card details visibility. */
function toggleCardDetails(event) {
    const log = window.displayVisualError || console.log; // Use logger
    const header = event.currentTarget;
    const details = Array.from(header.parentNode.children).find(el => el.classList.contains('card-details'));
    if (details) {
        const willBeHidden = !details.classList.contains('hidden');
        log(`Toggling details visibility for card. Will be hidden: ${willBeHidden}`);
        details.classList.toggle('hidden');
        const icon = header.querySelector('.expand-icon');
        if (icon) { icon.style.transform = details.classList.contains('hidden') ? 'rotate(-90deg)' : 'rotate(0deg)'; }
    }
}

/** Updates the story text display area. */
export function updateStoryText(text) {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.storyText) return;
    elements.storyText.textContent = text || "The story continues...";
    // REMOVED logic managing expansion and toggle button
}


/**
 * Updates the narrative text in the story card.
 * @param {string} text - The narrative text to display.
 */
export function updateNarrative(text) {
    if (elements.storyText) {
        // Clean up any choice-like text that might have slipped through
        const cleanText = text.split('\n')
            .filter(line => !line.match(/\[Type=[A-Za-z]+\]/)) // Remove any [Type=X] lines
            .filter(line => !line.match(/^\*\*.+\*\*$/)) // Remove any **action** lines
            .join('\n')
            .trim();
        elements.storyText.textContent = (cleanText || "The story continues...").replace(/\*\*|__/g, '');
        // A new scene: bring the top of the story into view (players were left
        // looking at the choices or the party card after picking).
        const changed = recordStoryScene(cleanText);
        if (changed && gameState.currentScreen === 'gameScreen') {
            const card = document.getElementById('storyCard');
            requestAnimationFrame(() => card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
        }
    }
}

// Story book: every scene shown, so a finished game can be re-read as a story.
function recordStoryScene(text) {
    if (!text) return false;
    const log = gameState.storyLog || (gameState.storyLog = []);
    const last = log[log.length - 1];
    if (last === text) return false;
    if (last && text.startsWith(last)) log[log.length - 1] = text; // same scene grew (epilogue)
    else log.push(text);
    return true;
}

export function storyBookText() {
    const title = gameState.adventureGoal || 'An Adventure Story';
    const heroes = (gameState.players || []).map(p => p.name).join(', ');
    return `${title}\n${heroes ? `Starring ${heroes}\n` : ''}\n${(gameState.storyLog || []).join('\n\n* * *\n\n')}\n`;
}

export function showStoryBook() {
    const box = document.getElementById('storyBookText');
    if (box) box.textContent = (gameState.storyLog || []).length ? storyBookText() : 'The story has not started yet.';
    showScreen('storyBookScreen');
}

export async function saveStoryBook() {
    const text = storyBookText();
    const name = `${(gameState.adventureGoal || 'adventure-story').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.txt`;
    // The Android app's web view ignores download links (nothing happened):
    // share the text there, else copy it.
    if (window.Capacitor?.isNativePlatform?.()) {
        try { if (navigator.share) { await navigator.share({ title: name, text }); return; } } catch (_) { return; /* share cancelled */ }
        return copyStoryBook();
    }
    try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (_) { return copyStoryBook(); }
}

export async function copyStoryBook() {
    try { await navigator.clipboard.writeText(storyBookText()); showPopup('Story copied', 'info', 2000); }
    catch (_) { showPopup('Copy blocked: select the text and copy it', 'info', 3000); }
}

/**
 * Renders choice buttons based on the provided choices array.
 * @param {Array<{type: string, text: string}>} choices - Array of choice objects
 * @param {Function|null} [handler=null] - Optional custom click handler
 */
export function renderChoices(choices, handler = null) {
    const log = window.displayVisualError || console.log;
    // Every set of story choices is shown in a fresh random order, whatever
    // path produced it (post-fight and fallback choices came in type order).
    if (Array.isArray(choices) && choices.length > 1 && !handler) {
        choices = [...choices];
        for (let i = choices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [choices[i], choices[j]] = [choices[j], choices[i]];
        }
        gameState.currentChoices = choices;
    }
    log(`UI: Rendering choices. Data type: ${typeof choices}, Is Array: ${Array.isArray(choices)}, Handler Mode: ${!!handler}`);
    
    if (!elements.choicesContainer) {
        log("ERROR: Choices container not found!");
        return;
    }

    // Clear existing choices
    elements.choicesContainer.innerHTML = '';
    // Say whose turn it is right above the choices (it was only in the Party card below).
    const head = document.querySelector('#choicesCard h3');
    if (head) {
        const who = gameState.players?.[gameState.currentPlayerIndex]?.name;
        head.textContent = gameState.inCombat ? `Battle${(gameState.players || []).length > 1 && who ? ` · ${who}'s move` : ''}: choose a move`
            : (gameState.players || []).length > 1 && who ? `${who}'s turn: choose an action` : 'Choose your action:';
    }

    // Add God Mode custom choice input if active
    if (gameState.godModeManager?.isActive) {
        const godModeInput = document.createElement('div');
        godModeInput.className = 'god-mode-choice-input';
        godModeInput.innerHTML = `
            <div class="god-mode-header">
                <span class="god-mode-icon">⚡</span>
                <span class="god-mode-label">GOD MODE - Write Your Own Choice:</span>
            </div>
            <div class="god-mode-input-container">
                <textarea 
                    id="godModeCustomChoice" 
                    placeholder="Write anything you want to do... Create worlds, summon creatures, rewrite reality, travel through time - your imagination is the only limit!"
                    rows="3"
                    maxlength="500"
                ></textarea>
                <button id="godModeSubmitBtn" class="god-mode-submit">Execute Divine Will</button>
            </div>
        `;
        elements.choicesContainer.appendChild(godModeInput);
        
        // Add event listener for God Mode choice submission
        const submitBtn = document.getElementById('godModeSubmitBtn');
        const textarea = document.getElementById('godModeCustomChoice');
        
        if (submitBtn && textarea) {
            submitBtn.addEventListener('click', async () => {
                const customChoice = textarea.value.trim();
                if (customChoice) {
                    await handleGodModeChoice(customChoice);
                    textarea.value = '';
                }
            });
            
            // Allow Enter to submit (with Shift+Enter for new lines)
            textarea.addEventListener('keydown', async (e) => {
                // Swipe/glide keyboards compose words; never act mid-composition.
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    const customChoice = textarea.value.trim();
                    if (customChoice) {
                        await handleGodModeChoice(customChoice);
                        textarea.value = '';
                    }
                }
            });
        }
        
        // Add separator
        const separator = document.createElement('div');
        separator.className = 'god-mode-separator';
        separator.innerHTML = '<hr><p class="separator-text">Or choose from standard options:</p>';
        elements.choicesContainer.appendChild(separator);
    }

    // If no valid choices provided, show loading state
    if (!Array.isArray(choices) || choices.length === 0) {
        log("UI: No valid choices data provided. Rendering default/loading state.");
        const loadingChoice = document.createElement('button');
        loadingChoice.className = 'choice-btn disabled';
        loadingChoice.textContent = 'Waiting for storyteller...';
        elements.choicesContainer.appendChild(loadingChoice);
        return;
    }

    // Render each choice as a button
    choices.forEach((choice, index) => {
        if (!choice || typeof choice.text !== 'string') {
            log(`Warning: Invalid choice at index ${index}`);
            return;
        }

        const button = document.createElement('button');
        button.className = 'choice-btn';
        // Markdown from the model (**Ghost Step**) shows as raw asterisks.
        const plain = choice.text.replace(/\*\*|__|`/g, '');
        // In a fight the move type is shown: Attack/Special/Item/Run are
        // mechanics, not hidden story options.
        const badge = { Attack: '⚔️ Attack', Special: '✨ Special', Item: '🧪 Item', Run: '🏃 Run' }[choice.type];
        if (badge) {
            const tag = document.createElement('span');
            tag.className = 'choice-badge';
            tag.textContent = badge;
            button.append(tag, document.createTextNode(plain));
        } else {
            button.textContent = plain;
        }
        button.dataset.actionType = choice.type;
        button.dataset.choiceIndex = index;

        if (handler) {
            button.onclick = () => handler(choice);
        }

        elements.choicesContainer.appendChild(button);
    });

    log(`UI: Successfully rendered ${choices.length} ${handler ? 'custom' : 'standard'} choices.`);
}

/** Updates the enabled/disabled state and visibility of quick action buttons. */
export function updateQuickActions() {
    const log = window.displayVisualError || console.log; // Use logger
    let currentPlayer;
    try { currentPlayer = getCurrentPlayer(); } catch(e) { log("Failed to get current player for quick actions", e); }
    if (!elements.quickActionButtons || !elements.quickActionButtons.inventoryBtn) {
        log("UI Warning: Quick action buttons object not found in UI elements.");
        return;
    }

    // Determine base disabled state (loading or player downed)
    const baseDisabled = gameState.isLoading || !currentPlayer || currentPlayer.isDowned;
    // Menu button is only disabled during loading
    const menuDisabled = gameState.isLoading;

    elements.quickActionButtons.inventoryBtn.disabled = baseDisabled;
    // No shopping mid-battle (classic RPG rule); Bag and Moves still work there,
    // and using an item or spell from them costs the turn.
    elements.quickActionButtons.shopBtn.disabled = baseDisabled || !!gameState.inCombat;
    elements.quickActionButtons.shopBtn.title = gameState.inCombat ? 'Shop is closed during battle' : 'Shop';
    elements.quickActionButtons.specialBtn.disabled = baseDisabled;
    elements.quickActionButtons.menuBtn.disabled = menuDisabled;

    // Determine Help Ally state
    let helpAllyDisabled;
    let alliesDown = false;
    let hasRevivalItem = false;
    if (currentPlayer && !baseDisabled) {
        alliesDown = gameState.players?.some(p => p && p.id !== currentPlayer.id && p.isDowned) || false;
        hasRevivalItem = currentPlayer.inventory?.some(item => item?.stats?.revive === true) || false;
        helpAllyDisabled = !alliesDown || !hasRevivalItem; // Disabled if no allies down OR no revival item
    } else {
        // If base is disabled, help ally is also disabled
        helpAllyDisabled = true;
    }

    elements.quickActionButtons.helpAllyBtn.disabled = helpAllyDisabled;
    // Show button only if allies *are* down (even if disabled due to no item)
    elements.quickActionButtons.helpAllyBtn.classList.toggle('hidden', !alliesDown);

    // Update Help Ally button title
    let revivalItemName = Config.REVIVAL_ITEM_DEFAULT_NAME;
    try { revivalItemName = themedItemData[gameState.adventureTheme]?.RevivalItemName || Config.REVIVAL_ITEM_DEFAULT_NAME; } catch (e) { log("Error getting themed revival item name for button title.", e); }
    elements.quickActionButtons.helpAllyBtn.title = `Help Ally (${hasRevivalItem ? `${sanitizeText(revivalItemName)} Available` : `Requires ${sanitizeText(revivalItemName)}`})`;
}

/** Updates the context headers (Player Name, Coins) in Inventory, Shop, Moves screens. */
export function updateContextHeaders() {
    const log = window.displayVisualError || console.log; // Use logger
    let currentPlayer;
    try { currentPlayer = getCurrentPlayer(); } catch(e) { log("Failed to get current player for context headers", e); }
    if (!currentPlayer) return;

    const playerName = sanitizeText(currentPlayer.name);
    const playerCoins = currentPlayer.coins ?? 0;

    elements.contextPlayerNameElements.forEach(el => el.textContent = playerName);
    elements.contextPlayerCoinsElements.forEach(el => el.textContent = playerCoins);
    if(elements.shopCoins) elements.shopCoins.textContent = playerCoins;
}

// --- Input Generation ---

/** Generates age input fields dynamically. */
export function generateAgeInputs() {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.ageInputsContainer || !elements.ageError) return;
    log(`UI: Generating ${gameState.playerCount} age input(s).`);
    elements.ageInputsContainer.innerHTML = '';
    hideMessage(elements.ageError);
    const minAge = Config.MIN_AGE ?? 6;
    const maxAge = Config.MAX_AGE ?? 99;
    
    // Load cached ages
    const cachedAges = loadPlayerAges();
    
    for (let i = 0; i < gameState.playerCount; i++) {
        const div = document.createElement('div');
        const label = document.createElement('label');
        label.htmlFor = `ageInput_${i}`;
        label.textContent = `Player ${i + 1} Age:`;
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `ageInput_${i}`;
        input.min = minAge;
        input.max = maxAge;
        input.placeholder = 'Enter age';
        // Use cached value if available, otherwise leave empty
        if (cachedAges[i] && cachedAges[i] >= minAge && cachedAges[i] <= maxAge) {
            input.value = cachedAges[i];
        }
        input.required = true;
        label.appendChild(input);
        div.appendChild(label);
        elements.ageInputsContainer.appendChild(div);
    }
     // Focus the first age input
     const firstInput = document.getElementById('ageInput_0');
     if (firstInput) { try { firstInput.focus(); } catch(e) { log("Warning: Failed to focus first age input.", e); }}
}

/** Generates name input fields dynamically. */
export function generateNameInputs() {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.nameInputsContainer || !elements.nameError) return;
     log(`UI: Generating ${gameState.playerCount} name input(s).`);
    elements.nameInputsContainer.innerHTML = '';
    hideMessage(elements.nameError);
    
    // Load cached names
    const cachedNames = loadPlayerNames();
    
    for (let i = 0; i < gameState.playerCount; i++) {
        const div = document.createElement('div');
        const label = document.createElement('label');
        label.htmlFor = `nameInput_${i}`;
        label.textContent = `Player ${i + 1} Name:`;
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `nameInput_${i}`;
        input.placeholder = `Adventurer ${i + 1}`;
        // Use cached value if available
        if (cachedNames[i] && cachedNames[i].trim()) {
            input.value = cachedNames[i];
        }
        input.required = true;
        input.maxLength = Config.MAX_NAME_LENGTH;
        label.appendChild(input);
        div.appendChild(label);
        elements.nameInputsContainer.appendChild(div);
    }
    // Focus the first name input
    const firstInput = document.getElementById('nameInput_0');
    if (firstInput) { try { firstInput.focus(); } catch(e) { log("Warning: Failed to focus first name input.", e); } }
}

// --- Item/Move/Save Rendering ---

/** Renders the inventory items for the current player. */
export function renderInventory() {
    const log = window.displayVisualError || console.log; // Use logger
    updateContextHeaders();
    if (!elements.inventoryDisplay) return;
    log("UI: Rendering inventory.");
    elements.inventoryDisplay.innerHTML = '';
    let player;
    try { player = getCurrentPlayer(); } catch(e) {}
    if (!player || !player.inventory || player.inventory.length === 0) {
        elements.inventoryDisplay.innerHTML = '<p class="info-message">Inventory is empty.</p>';
        return;
    }
    // Sort inventory? Optional (e.g., by type then name)
    const sortedInventory = [...player.inventory].sort((a, b) => {
         if (!a || !b) return 0;
         if (a.type !== b.type) return a.type.localeCompare(b.type);
         return a.name.localeCompare(b.name);
    });
    sortedInventory.forEach(item => {
        if (!item) return;
        const itemCard = createItemCard(item, 'inventory');
        elements.inventoryDisplay.appendChild(itemCard);
    });
}

/** Renders the items available in the shop. */
export function renderShop() {
    const log = window.displayVisualError || console.log; // Use logger
    updateContextHeaders();
    if (!elements.shopDisplay) return;
    log("UI: Rendering shop.");
    elements.shopDisplay.innerHTML = '';
    if (!gameState.shopItems || gameState.shopItems.length === 0) {
        elements.shopDisplay.innerHTML = '<p class="info-message">The shop is currently empty.</p>';
        return;
    }
     // Sort shop items? Optional (e.g., by cost or type)
     const sortedShop = [...gameState.shopItems].sort((a, b) => {
          if (!a || !b) return 0;
          if ((a.cost ?? Infinity) !== (b.cost ?? Infinity)) return (a.cost ?? Infinity) - (b.cost ?? Infinity);
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.name.localeCompare(b.name);
     });
    sortedShop.forEach(item => {
        if (!item) return;
        const itemCard = createItemCard(item, 'shop');
        elements.shopDisplay.appendChild(itemCard);
    });
}

/** Renders the special moves for the current player. */
export function renderSpecialMoves() {
    const log = window.displayVisualError || console.log; // Use logger
    updateContextHeaders();
    if (!elements.specialMovesDisplay) return;
    log("UI: Rendering special moves + known spells.");
    elements.specialMovesDisplay.innerHTML = '';
    let player;
    try { player = getCurrentPlayer(); } catch (e) {}

    const moves = (player?.specialMoves || []);
    const spells = (player?.spellcasting?.knownSpells || []);

    if (!player || (moves.length === 0 && spells.length === 0)) {
        elements.specialMovesDisplay.innerHTML = '<p class="info-message">No special moves or spells known yet.</p>';
        return;
    }

    // Render special moves (legacy slot)
    if (moves.length > 0) {
        const movesHeader = document.createElement('h3');
        movesHeader.className = 'spec-section-header';
        movesHeader.textContent = 'Special Moves';
        elements.specialMovesDisplay.appendChild(movesHeader);
        const sortedMoves = [...moves].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        sortedMoves.forEach(move => {
            if (!move) return;
            const moveCard = createSpecialMoveCard(move);
            elements.specialMovesDisplay.appendChild(moveCard);
        });
    }

    // Also list known spells here so the Spec. button isn't a dead-end for
    // spellcasters. The dedicated Book/Cast UI in spellUI.js has richer
    // affordances; this is a discoverability hint. Phase 0 audit P1 #16.
    if (spells.length > 0) {
        const spellsHeader = document.createElement('h3');
        spellsHeader.className = 'spec-section-header';
        spellsHeader.textContent = 'Known Spells';
        elements.specialMovesDisplay.appendChild(spellsHeader);
        const sortedSpells = [...spells].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        sortedSpells.forEach(spell => {
            if (!spell) return;
            const card = document.createElement('div');
            card.className = 'special-move-card spell-card';
            card.innerHTML = `
                <h4>${sanitizeText(spell.name || 'Unnamed Spell')}</h4>
                <p>${sanitizeText(spell.description || spell.effect || 'A learned spell.')}</p>
                <p class="meta">School: ${sanitizeText(spell.school || 'Arcane')} · MP: ${spell.mpCost ?? '?'} · Level: ${spell.level ?? '?'}</p>
            `;
            // Cast from here (the Book/Cast quick buttons were only ever added
            // when a save was loaded, so new games could never cast).
            const castBtn = document.createElement('button');
            castBtn.className = 'castSpellCardBtn';
            const player = getCurrentPlayer();
            const enoughMp = (player?.mp ?? 0) >= (spell.mpCost || 0);
            castBtn.textContent = enoughMp ? `Cast (${spell.mpCost || 0} MP)` : `Need ${spell.mpCost} MP`;
            castBtn.disabled = !enoughMp || gameState.isLoading;
            castBtn.addEventListener('click', async () => {
                showScreen('gameScreen');
                if (gameState.inCombat) {
                    const { handlePlayerChoice } = await import('./actionHandler.js');
                    return handlePlayerChoice('Spell', `Cast ${spell.name}`); // costs the turn
                }
                const SpellCasting = await import('./spellCasting.js');
                const res = await SpellCasting.castSpell(player, spell);
                showPopup(res?.success ? `${player.name} casts ${spell.name}!` : `${spell.name} fizzles${res?.reason ? ': ' + res.reason : ''}`, res?.success ? 'skill' : 'warning');
                renderPlayerCards();
            });
            card.appendChild(castBtn);
            elements.specialMovesDisplay.appendChild(card);
        });
    }
}

/** Renders the list of saved games in the Load Game screen. */
export function renderSavedGamesList(saves) {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.savedGamesList || !elements.loadError || !elements.noSavesMessage) return;
    log("UI: Rendering saved games list.");
    elements.savedGamesList.innerHTML = '';
    hideMessage(elements.loadError);
    hideMessage(elements.noSavesMessage);
    if (!saves || saves.length === 0) {
        showStatus(elements.noSavesMessage, 'No saved games found.');
        return;
    }
    saves.sort((a, b) => b.data.saveDate - a.data.saveDate); // Sort newest first
    saves.forEach(save => {
        const saveName = save.key.substring(Config.SAVE_GAME_PREFIX.length);
        const date = new Date(save.data.saveDate).toLocaleString();
        const savedState = save.data?.gameState;
        const playerNames = savedState?.players?.map(p => p?.name).filter(Boolean).join(', ') || 'Unknown Players';
        let theme = 'Unknown';
         if (savedState) {
             if (savedState.adventureTheme === 'custom') { theme = (savedState.customThemeDescription?.substring(0, 20) || 'Custom') + (savedState.customThemeDescription?.length > 20 ? '...' : ''); }
             else { const selectOption = elements.adventureTypeSelect?.querySelector(`option[value="${savedState.adventureTheme}"]`); theme = selectOption?.textContent || savedState.adventureTheme || 'Unknown Theme'; }
         }
        // Which game is which: round, quest progress and goal at a glance.
        const pct = savedState?.questProgress?.completionPercentage ?? 0;
        const progressLine = savedState ? (savedState.isGoalComplete ? `Round ${savedState.turn || 1} · Quest complete (god mode)`
            : `Round ${savedState.turn || 1} · Quest ${pct}%${savedState.imprisoned ? ' · captured!' : ''}`) : '';
        const goalLine = (savedState?.adventureGoal || '').slice(0, 120);
        const card = document.createElement('div');
        card.className = 'saved-game-card';
        card.dataset.saveName = saveName; // Store save name for delegation
        card.innerHTML = `
            <h4>${sanitizeText(saveName)}</h4>
            <p>Players: ${sanitizeText(playerNames)}</p>
            <p>Theme: ${sanitizeText(theme)}</p>
            ${progressLine ? `<p>${sanitizeText(progressLine)}</p>` : ''}
            ${goalLine ? `<p class="save-goal">Goal: ${sanitizeText(goalLine)}</p>` : ''}
            <p>Saved: ${date}</p>
            <div class="load-delete-buttons">
                <button class="load-btn">Load</button>
                <button class="delete-save-btn">Delete</button>
            </div>
        `;
        elements.savedGamesList.appendChild(card);
    });
}

/** Creates the HTML structure for an item card (Inventory or Shop). Helper. */
function createItemCard(item, context) {
    const card = document.createElement('div');
    // Narrator items can carry a numeric tier (live: tier 1 crashed the Bag screen).
    const tierName = String(item.tier ?? 'Low');
    card.className = `item-card tier-${tierName.toLowerCase()}`;
    card.dataset.itemId = item.id;
    let player; try { player = getCurrentPlayer(); } catch(e) {}
    const isEquipped = player?.equipment && (player.equipment.weapon === item.id || player.equipment.armor === item.id);
    const equippedSlot = isEquipped ? (player.equipment.weapon === item.id ? 'weapon' : 'armor') : null;

    if (isEquipped) card.classList.add('equipped');
    if (equippedSlot) card.dataset.slot = equippedSlot; // Store slot if equipped for unequip button

    // Build stats string, filtering out zero/false values unless specifically needed
    const statsString = Object.entries(item.stats || {})
        .map(([key, value]) => {
            if (value === true && key === 'revive') return sanitizeText(key); // Show 'revive' flag
            if (typeof value === 'number' && value !== 0) return `${sanitizeText(key.toUpperCase())}: ${value}`;
            if (key === 'cure' && value) return `Cures: ${sanitizeText(String(value))}`;
            if (key === 'applyStatus' && value) return `Applies: ${sanitizeText(String(value))}${item.stats.duration ? `(${item.stats.duration}t)` : ''}`;
            return null;
         })
         .filter(s => s !== null)
         .join(' | ');

    const playerIsDowned = player?.isDowned ?? true; // Assume downed if no player
    
    // Calculate reputation-modified price for shop items
    const actualPrice = context === 'shop' ? calculateItemPrice(item) : item.cost;
    const canAfford = player?.coins >= (actualPrice ?? Infinity);
    
    // General disabled state for actions (not buy button cost check)
    const cannotAct = playerIsDowned || gameState.isLoading;

    card.innerHTML = `
        <h4>${sanitizeText(item.name)} ${item.quantity ? `(x${item.quantity})` : ''}</h4>
        <p class="item-tier tier-${tierName.toLowerCase()}">${sanitizeText(tierName)} ${sanitizeText(item.type)}</p>
        <p class="item-effect">${sanitizeText(item.effect || 'An item of interest.')}</p>
        ${statsString ? `<p class="item-stats">${statsString}</p>` : ''}
        ${context === 'shop' && item.cost !== undefined ? `<p class="item-cost">${actualPrice} 💰${actualPrice !== item.cost ? ` <span class="price-modifier">(was ${item.cost})</span>` : ''}</p>` : ''}
        <div class="button-container vertical">
            ${context === 'inventory' ? `
                ${item.type === 'Consumable' && !item.stats?.revive ? `<button class="useItemBtn" ${cannotAct ? 'disabled' : ''}>Use</button>` : ''}
                ${item.type === 'Weapon' && !isEquipped && !gameState.inCombat ? `<button class="equipItemBtn" data-slot="weapon" ${cannotAct ? 'disabled' : ''}>Equip Weapon</button>` : ''}
                ${item.type === 'Armor' && !isEquipped && !gameState.inCombat ? `<button class="equipItemBtn" data-slot="armor" ${cannotAct ? 'disabled' : ''}>Equip Armor</button>` : ''}
                ${isEquipped && !gameState.inCombat ? `<button class="unequipItemBtn" ${cannotAct ? 'disabled' : ''}>Unequip</button>` : ''}
                ${!isEquipped && item.type !== 'Quest' && !gameState.inCombat ? `<button class="sellItemBtn btn-secondary" ${cannotAct ? 'disabled' : ''}>Sell (${sellValue(item)}💰)</button>` : ''}
                ${gameState.inCombat ? '' : `<button class="dropItemBtn" ${cannotAct ? 'disabled' : ''}>Drop</button>`}
            ` : ''}
            ${context === 'shop' ? `
                <button class="buyItemBtn" ${!item.cost || !canAfford || cannotAct ? 'disabled' : ''}>
                    Buy (${actualPrice !== undefined ? actualPrice : '?'}💰)
                </button>
            ` : ''}
        </div>
    `;
    return card;
}

/** Creates the HTML structure for a special move card. Helper. */
function createSpecialMoveCard(move) {
    const card = document.createElement('div');
    card.className = 'move-card';
    card.dataset.moveId = move.id;
    let player; try { player = getCurrentPlayer(); } catch(e) {}
    const isReady = move.currentCooldown <= 0;
    const hasEnoughMP = !move.mpCost || (player?.mp >= move.mpCost);
    // Wrong place for the move (exploration-only in a fight, or combat-only outside one) too.
    const wrongPlace = (move.usageContext === 'exploration' && gameState.inCombat) || (move.usageContext === 'combat' && !gameState.inCombat);
    const isDisabled = player?.isDowned || !isReady || !hasEnoughMP || gameState.isLoading || wrongPlace;

    // Determine context badge
    const contextBadge = move.usageContext === 'both' ? 'Combat & Exploration' :
                        move.usageContext === 'combat' ? 'Combat Only' :
                        'Exploration Only';

    // Build mechanics description
    let mechanicsDesc = '';
    if (move.mechanics) {
        if (move.mechanics.damage) {
            mechanicsDesc += `Deals ${move.mechanics.damage} damage`;
        }
        if (move.mechanics.healing) {
            mechanicsDesc += mechanicsDesc ? ', ' : '';
            mechanicsDesc += `Heals ${move.mechanics.healing} HP`;
        }
        if (move.mechanics.statusEffects?.length > 0) {
            mechanicsDesc += mechanicsDesc ? ', ' : '';
            mechanicsDesc += `Applies: ${move.mechanics.statusEffects.join(', ')}`;
        }
        if (move.mechanics.exploration) {
            if (move.mechanics.exploration.obstacleTypes?.length > 0) {
                mechanicsDesc += mechanicsDesc ? '\n' : '';
                mechanicsDesc += `Overcomes: ${move.mechanics.exploration.obstacleTypes.join(', ')}`;
            }
            if (move.mechanics.exploration.puzzleBonus) {
                mechanicsDesc += mechanicsDesc ? '\n' : '';
                mechanicsDesc += `Puzzle Bonus: +${move.mechanics.exploration.puzzleBonus}`;
            }
            if (move.mechanics.exploration.environmentalEffect) {
                mechanicsDesc += mechanicsDesc ? '\n' : '';
                mechanicsDesc += `Effect: ${move.mechanics.exploration.environmentalEffect}`;
            }
        }
    }

    card.innerHTML = `
        <div class="move-header">
            <h4>${sanitizeText(move.name)}</h4>
            <span class="context-badge ${move.usageContext}">${contextBadge}</span>
        </div>
        <p class="move-effect">${sanitizeText(move.effect)}</p>
        ${mechanicsDesc ? `<p class="move-mechanics">${sanitizeText(mechanicsDesc)}</p>` : ''}
        <div class="move-footer">
            <p class="move-cooldown">Cooldown: ${move.cooldown} turns</p>
            ${move.mpCost ? `<p class="move-mp-cost">MP Cost: ${move.mpCost} 🔮</p>` : ''}
            <p class="move-status ${isReady ? 'ready' : 'on-cooldown'}">
                ${isReady ? 'Ready!' : `Ready in ${move.currentCooldown} turns`}
            </p>
            <div class="button-container">
                <button class="useMoveBtn" ${isDisabled ? 'disabled' : ''}>Use Move</button>
            </div>
        </div>
    `;

    // Clicks are handled by the delegated .useMoveBtn listener in main.js
    // (a listener here called an unimported useSpecialMove and threw).
    return card;
}

// --- Modal Content Updates ---

/** Updates the content of the generic confirmation modal. */
export function updateConfirmationModal(title, message) {
    if(elements.confirmationTitle) elements.confirmationTitle.textContent = title;
    if(elements.confirmationMessage) elements.confirmationMessage.textContent = message;
}

/** Updates the Help Ally modal with target buttons. */
export function updateHelpAllyModal(downedAllies, revivalItemCount, revivalItemName) {
    const log = window.displayVisualError || console.log; // Use logger
    if (!elements.revivalItemStatus || !elements.helpAllyTargetList) {
         log("UI Warning: Help Ally modal elements not found.");
         return;
    }
    const safeRevivalName = sanitizeText(revivalItemName);
    // Update status text using innerHTML to include styled count span
    elements.revivalItemStatus.innerHTML = `Revival Items (${safeRevivalName}): <span id="revivalItemCount" class="${revivalItemCount > 0 ? 'has-items' : 'no-items'}">${revivalItemCount}</span>`;

    // Clear previous list
    elements.helpAllyTargetList.innerHTML = '';

    if (!downedAllies || downedAllies.length === 0) {
        elements.helpAllyTargetList.innerHTML = '<p class="info-message">No allies currently need help.</p>';
    } else {
        downedAllies.forEach(ally => {
            if (!ally) return;
            const button = document.createElement('button');
            button.className = 'selectAllyBtn';
            button.dataset.playerId = ally.id; // Store target player ID
            button.textContent = `Help ${String(ally.name)} (HP: ${ally.hp ?? '?'}/${ally.maxHp ?? '?'})`;
            // Disable button if no revival items available OR if game is loading
            button.disabled = revivalItemCount <= 0 || gameState.isLoading;
            elements.helpAllyTargetList.appendChild(button);
        });
    }
}

/**
 * Hides a message element by setting its display style to 'none'.
 * @param {HTMLElement} element - The message element to hide.
 */
export function hideMessage(element) {
    if (element) {
        element.style.display = 'none';
        element.classList.add('hidden');
    }
}

/**
 * Shows an error message in the specified element.
 * @param {HTMLElement} element - The element to show the error in.
 * @param {string} message - The error message to display.
 */
export function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        element.classList.remove('hidden'); // .hidden is display:none !important: messages never showed
        element.classList.add('error');
    }
}

/**
 * Shows a status message in the specified element.
 * @param {HTMLElement} element - The element to show the status in.
 * @param {string} message - The status message to display.
 */
export function showStatus(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        element.classList.remove('hidden');
        element.classList.remove('error');
        element.classList.add('status');
    }
}

/**
 * Shows a success message in the specified element.
 * @param {HTMLElement} element - The element to show the success in.
 * @param {string} message - The success message to display.
 */
export function showSuccess(element, message) {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
        element.classList.remove('error');
        element.classList.add('success');
    }
}

/**
 * Shows or hides the loading indicator with an optional message.
 * @param {boolean} isLoading - Whether to show or hide the loading indicator.
 * @param {string} [message='Loading...'] - The message to display in the loading indicator.
 */
// Retry/wait messages from localAI.js replace the loading text while it shows.
globalThis.addEventListener?.('adv:ai-status', (e) => {
    if (elements.loadingIndicator && !elements.loadingIndicator.classList.contains('hidden') && elements.loadingMessage) {
        elements.loadingMessage.textContent = e.detail;
    }
});

/** Show (or hide, with empty text) the one-line result of the last turn. */
export function showTurnRecap(text) {
    if (!elements.turnRecap) return;
    elements.turnRecap.textContent = text || '';
    elements.turnRecap.classList.toggle('hidden', !text);
}

export function showLoading(isLoading, message = 'Loading...') {
    const loadingIndicator = elements.loadingIndicator;
    const loadingMessage = elements.loadingMessage;
    
    if (loadingIndicator && loadingMessage) {
        if (isLoading) {
            loadingMessage.textContent = message;
            // The start-up loader is already on screen: don't stack a second spinner over it.
            const startup = document.getElementById('loadingOverlay');
            if (startup && !startup.classList.contains('hidden')) return;
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }
}

/**
 * Initializes the API key tab system
 */
export function initializeApiTabs() {
    if (!elements.apiTabs || !elements.apiSections) return;
    
    elements.apiTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const provider = tab.dataset.provider;
            
            // Update active tab
            elements.apiTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active section
            elements.apiSections.forEach(section => {
                section.classList.remove('active');
                if (section.id === `${provider}-section`) {
                    section.classList.add('active');
                }
            });
        });
    });

}

/* === QUEST PROGRESS UI FUNCTIONS === */

/**
 * Updates the quest progress UI elements
 */
export function updateQuestProgressUI() {
    const log = window.displayVisualError || console.log;
    
    // Check if quest progress is initialized
    if (!gameState.questProgress) {
        return; // Quest progress not initialized yet
    }
    
    try {
        const progress = gameState.questProgress;
        const hasGoal = gameState.adventureGoal && gameState.adventureGoal !== 'Not set yet.';

        // Suppress phase/percentage display until the AI has set a real goal.
        if (elements.questPhase) {
            elements.questPhase.textContent = hasGoal ? getPhaseDisplayName(progress.currentPhase) : 'Awaiting quest...';
        }

        if (elements.questPercentage) {
            elements.questPercentage.textContent = hasGoal ? `${progress.completionPercentage}%` : '';
        }

        if (elements.questProgressBar) {
            elements.questProgressBar.style.width = hasGoal ? `${progress.completionPercentage}%` : '0%';
            elements.questProgressBar.className = `progress-fill ${hasGoal ? progress.currentPhase : 'beginning'}`;
        }
        
        // Update objectives list
        updateObjectivesList(progress.currentObjectives);
        
        // Update milestones list
        updateMilestonesList(progress.milestones);
        
        // Update side quests (show section if there are any)
        updateSideQuestsList(progress.sideQuests);
        
        // Update secrets (show section if there are any)
        updateSecretsList(progress.discoveredSecrets);
        
    } catch (error) {
        log(`Error updating quest progress UI: ${error.message}`);
    }
}

/**
 * Get display name for quest phase
 */
function getPhaseDisplayName(phase) {
    const names = {
        beginning: 'The Journey Begins',
        exploration: 'Deep Exploration',
        climax: 'The Climax Approaches',
        resolution: 'Final Resolution'
    };
    return names[phase] || phase;
}

/**
 * Update the objectives list
 */
function updateObjectivesList(objectives) {
    if (!elements.objectivesList) return;
    
    elements.objectivesList.innerHTML = '';
    
    if (objectives && objectives.length > 0) {
        objectives.forEach(objective => {
            const li = document.createElement('li');
            li.textContent = String(objective);
            elements.objectivesList.appendChild(li);
        });
    } else {
        const li = document.createElement('li');
        li.textContent = 'No current objectives';
        li.style.fontStyle = 'italic';
        li.style.opacity = '0.7';
        elements.objectivesList.appendChild(li);
    }
}

/**
 * Update the milestones list
 */
function updateMilestonesList(milestones) {
    if (!elements.milestonesList) return;
    
    elements.milestonesList.innerHTML = '';
    
    // Show only the most recent 3 milestones
    const recentMilestones = milestones ? milestones.slice(-3).reverse() : [];
    
    if (recentMilestones.length > 0) {
        recentMilestones.forEach(milestone => {
            const div = document.createElement('div');
            div.className = 'milestone-item';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'milestone-name';
            nameSpan.textContent = friendlyMilestone(milestone.name) || String(milestone.displayName || milestone.name);
            
            const turnSpan = document.createElement('span');
            turnSpan.className = 'milestone-turn';
            // The engine stores `turn`; the old UI read `completedTurn` ("Turn undefined").
            turnSpan.textContent = `Turn ${milestone.turn ?? milestone.completedTurn ?? '?'}`;
            
            div.appendChild(nameSpan);
            div.appendChild(turnSpan);
            elements.milestonesList.appendChild(div);
        });
    } else {
        const div = document.createElement('div');
        div.textContent = 'No milestones achieved yet';
        div.style.fontStyle = 'italic';
        div.style.opacity = '0.7';
        elements.milestonesList.appendChild(div);
    }
}

/**
 * Update the side quests list
 */
function updateSideQuestsList(sideQuests) {
    if (!elements.sideQuestsList || !elements.sideQuestsSection) return;
    
    const activeSideQuests = sideQuests ? sideQuests.filter(q => q.status === 'active') : [];
    
    // Show/hide section based on whether there are side quests
    if (activeSideQuests.length > 0) {
        elements.sideQuestsSection.classList.remove('hidden');
        
        elements.sideQuestsList.innerHTML = '';
        activeSideQuests.forEach(quest => {
            const div = document.createElement('div');
            div.className = 'side-quest-item';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'side-quest-name';
            nameDiv.textContent = String(quest.name);
            
            const descDiv = document.createElement('div');
            descDiv.className = 'side-quest-description';
            descDiv.textContent = String(quest.description);
            
            const statusSpan = document.createElement('span');
            statusSpan.className = `side-quest-status ${quest.status}`;
            statusSpan.textContent = quest.status.charAt(0).toUpperCase() + quest.status.slice(1);
            
            div.appendChild(nameDiv);
            div.appendChild(descDiv);
            div.appendChild(statusSpan);
            elements.sideQuestsList.appendChild(div);
        });
    } else {
        elements.sideQuestsSection.classList.add('hidden');
    }
}

/**
 * Update the secrets list
 */
function updateSecretsList(secrets) {
    if (!elements.secretsList || !elements.discoveredSecrets) return;
    
    // Show/hide section based on whether there are secrets
    if (secrets && secrets.length > 0) {
        elements.discoveredSecrets.classList.remove('hidden');
        
        elements.secretsList.innerHTML = '';
        // Show only the most recent 3 secrets
        const recentSecrets = secrets.slice(-3).reverse();
        
        recentSecrets.forEach(secret => {
            const div = document.createElement('div');
            div.className = 'secret-item';
            div.textContent = String(secret.text);
            elements.secretsList.appendChild(div);
        });
    } else {
        elements.discoveredSecrets.classList.add('hidden');
    }
}

/**
 * Initialize quest progress UI interactions
 */
export function initializeQuestProgressUI() {
    // Set up collapsible quest progress details
    if (elements.questProgressToggle && elements.questProgressDetails) {
        elements.questProgressToggle.addEventListener('click', () => {
            elements.questProgressDetails.classList.toggle('collapsed');
        });
        
        // Start collapsed by default
        elements.questProgressDetails.classList.add('collapsed');
    }
}

/**
 * Disable choice buttons to prevent multiple clicks
 */
export function disableChoices() {
    if (elements.choicesContainer) {
        const choiceButtons = elements.choicesContainer.querySelectorAll('button');
        choiceButtons.forEach(button => {
            button.disabled = true;
            button.style.opacity = '0.6';
        });
    }
}

/**
 * Enable choice buttons
 */
export function enableChoices() {
    if (elements.choicesContainer) {
        const choiceButtons = elements.choicesContainer.querySelectorAll('button');
        choiceButtons.forEach(button => {
            button.disabled = false;
            button.style.opacity = '1';
        });
    }
}

export { resetFx };

/** What the shop pays for an item: half its price (half the tier's default when unpriced). */
export function sellValue(item) {
    const base = item?.boughtFor ?? item?.cost ?? Config.DefaultItemCosts?.[item?.tier] ?? 10;
    return Math.max(item?.boughtFor != null ? 0 : 1, Math.floor(base / 2));
}
