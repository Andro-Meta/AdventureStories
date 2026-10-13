// ui.js
// Handles DOM manipulation, UI updates, screen transitions, popups, modals, etc.

// --- Module Imports ---
import { playHpEffects, resetFx } from './fx.js';
import { gameState } from './state.js';
import * as Config from './config.js';
import { loadPlayerAges, loadPlayerNames } from './inputCache.js';
import * as Spells from './spells.js';
import * as AdaptiveAbilities from './adaptiveAbilities.js';
import * as Progression from './progression.js';
import * as Media from './media.js';
import * as Reading from './reading.js';
import * as Roster from './roster.js';
import * as SpellCasting from './spellCasting.js';
// Import specific utils needed
import { sanitizeText } from './utils.js';
import { describeQuestStep, friendlyMilestone } from './questDefinitions.js';
// Import functions from other new modules
import { getCurrentPlayer } from './state.js';
// Import themedItemData directly if it's exported from items.js
import { themedItemData, itemValue, effectWords, inferItemEffects } from './items.js';
// Import reputation price calculation
import { calculateItemPrice } from './actionHandler.js';


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

    // In-Game Menu Screen
    resumeBtn: document.getElementById('resumeBtn'),
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

    // Popups & Indicators
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
        menuBtn: document.getElementById('menuBtn')
    }
};


// --- Screen Management ---

/** Shows a popup message with the specified type and duration. */
export function showPopup(message, type = 'info', duration = 3000) {
    const log = window.displayVisualError || console.log;
    log(`Showing popup: ${message} (${type})`);
    try { Media.cue(type, String(message)); } catch (_) {} // coin, heal, hurt, crit and level-up sounds

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
        ${readingSummary()}
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
             ${isPlayer ? statsExplainer(character) : ''}
             <p>ATK: <span class="${type}-atk">${character.atk ?? '?'}</span> | DEF: <span class="${type}-def">${character.def ?? '?'}</span></p>
             ${isPlayer ? `<p>Weapon: <span class="${type}-weapon">${sanitizeText(weaponName)} ${weaponTier ? `(${sanitizeText(weaponTier)})` : ''}</span></p>` : ''}
             ${isPlayer ? `<p>Armor: <span class="${type}-armor">${sanitizeText(armorName)} ${armorTier ? `(${sanitizeText(armorTier)})` : ''}</span></p>` : ''}
             ${isPlayer ? `<p>Coins: <span class="${type}-coins">${character.coins ?? 0}</span>💰</p>` : ''}
             ${!isPlayer ? `<p>Abilities: <span class="${type}-abilities">${character.abilities?.map(sanitizeText).join(', ') || 'None'}</span></p>` : ''}
             <p>Effects: <span class="status-effects">${statusEffectString}</span></p>

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
         ${isPlayer ? heroStatsRow(character) : ''}
         ${isDowned ? `<div class="downed-indicator">DOWNED (<span class="downed-timer">${Math.max(0, downedTurnsMax - (character.downedTurns ?? 0))}</span> turns left)</div>` : ''}
         ${isDefeated ? `<div class="defeated-indicator">DEFEATED</div>` : ''}
    `;
    return card;
}

/** Always-visible row: the four stats, the XP bar, and a button for unspent level-up points. */
function heroStatsRow(hero) {
    Progression.ensureStats(hero);
    const need = Progression.xpForLevel(hero.level);
    const pct = Math.min(100, Math.round(100 * hero.xp / need));
    const chips = Object.entries(Progression.STATS).map(([k, s]) => `<span class="stat-chip" title="${s.name}: ${s.does}">${s.icon}${hero.stats[k]}</span>`).join('')
        + (Progression.luckOf(hero) ? `<span class="stat-chip" title="Lucky charm: helps luck rolls; crits from ${Progression.critFromLuck(Progression.luckOf(hero))}">🍀${Progression.luckOf(hero)}</span>` : '')
        + readingChip(hero);
    return `<div class="hero-stats">${chips}
        <span class="xp-wrap" title="${hero.xp}/${need} XP to level ${hero.level + 1}"><span class="xp-bar"><span style="width:${pct}%"></span></span><small>${hero.xp}/${need} XP</small></span>
        ${Math.min(hero.statPoints || 0, Progression.statRoom(hero)) > 0 ? `<button class="spend-points" data-hero="${sanitizeText(hero.id)}">⭐ +${Math.min(hero.statPoints, Progression.statRoom(hero))} stat</button>` : ''}
        ${hero.abilityPicks > 0 ? `<button class="spend-points" data-hero="${sanitizeText(hero.id)}">✨ new special</button>` : ''}</div>`;
}

/** The party's reading pace, for the end-of-game screens. */
export function readingSummary() {
    const lines = (gameState.players || []).map(p => Reading.reportText(p.name, Reading.readingReport(p))).filter(Boolean);
    return lines.length ? `<h3>📖 Reading</h3>${lines.map(l => `<p>${sanitizeText(l)}</p>`).join('')}` : '';
}

/** Reading pace on the hero row: 📖 words a minute; ⚠ when they keep skipping the story. */
function readingChip(hero) {
    const r = Reading.readingReport(hero);
    if (!r) return '';
    const pace = r.wpm ? `${r.wpm} wpm` : 'skimming';
    return `<span class="stat-chip${r.flagged ? ' reading-flag' : ''}" title="Reading: ${pace} (typical for the age ~${r.typical}); skipped the story ${r.skims} of ${r.scenes} scenes">📖${r.flagged ? '⚠' : ''}${r.wpm || '?'}</span>`;
}
function readingLine(hero) {
    const r = Reading.readingReport(hero);
    if (!r) return '';
    return `<p class="stats-how"><small>📖 <b>Reading:</b> ${r.wpm ? `${r.wpm} words a minute` : 'no scene read at a reading pace yet'} (typical for the age: about ${r.typical}), over ${r.scenes - r.skims} of ${r.scenes} story scenes. ${r.skims ? `Picked a choice too fast to have read the scene ${r.skims} time${r.skims > 1 ? 's' : ''}.` : 'Never skipped the story.'}${r.flagged ? ' <b>⚠ Often choosing without reading.</b>' : ''} Scenes read aloud and fights are not counted.</small></p>`;
}

/** In the card details: what each stat does, and how close it is to growing. */
function statsExplainer(hero) {
    Progression.ensureStats(hero);
    const rows = Object.entries(Progression.STATS).map(([k, s]) =>
        `<li>${s.icon} <b>${s.name} ${hero.stats[k]}</b>/${Progression.STAT_MAX}: ${s.does}. In fights: ${s.fight}.${hero.stats[k] < Progression.STAT_MAX ? ` <small>Practice ${hero.sparks[k] || 0}/${Progression.SPARKS_PER_POINT}</small>` : ' <small>Mastered</small>'}</li>`).join('');
    return `<div class="stats-explainer"><p><b>Level ${hero.level}</b> · ${hero.xp}/${Progression.xpForLevel(hero.level)} XP</p>
        <ul>${rows}</ul>${readingLine(hero)}
        <p class="stats-how"><small>Every choice is a roll: a 20-sided die plus the stat the action uses (the icon on the button), and the % is your chance. Each point in a stat adds +5% to every choice that uses it. The marks show the danger: no mark is safe (a failure just complicates things), ⚠ is bold (a failure can hurt), ⚠⚠ is reckless (a failure will hurt, but it pays the most). 🍀 choices are absurd long shots: harder than the rest, but if one works the payoff is spectacular. A lucky charm in your bag helps those and makes a 19 count as a critical success too.${Progression.luckOf(hero) ? ` You carry luck +${Progression.luckOf(hero)}.` : ''} Every roll gives XP; each level lets you raise a stat; ${Progression.SPARKS_PER_POINT} successes with a stat raise it as well.</small></p></div>`;
}

let statPromptOpen = false;

/**
 * Open the level-up picker by itself? Only for points earned since the
 * player last tapped Cancel (live 10-09: Cancel re-rendered the choices,
 * which reopened the picker, forever). The ⭐ button still opens it any time.
 */
export function wantsStatPrompt(players) {
    return (players || []).some(p => p && (Math.min(p.statPoints || 0, Progression.statRoom(p)) > (p.statPromptSnooze || 0)
        || (p.abilityPicks || 0) > (p.abilityPromptSnooze || 0)));
}
/** Level-up: let each hero with unspent points pick the stat to raise (battle picker sheet). */
export async function promptStatPoints(heroId = null) {
    if (statPromptOpen || gameState.inCombat) return;
    statPromptOpen = true;
    try {
        const { pickBattleOption } = await import('./battle.js');
        for (const hero of (gameState.players || []).filter(p => p && (!heroId || p.id === heroId))) {
            Progression.ensureStats(hero);
            while (hero.statPoints > 0) {
                const opts = Object.entries(Progression.STATS).map(([k, s]) => ({
                    label: `${s.icon} ${s.name} ${hero.stats[k]} → ${Math.min(Progression.STAT_MAX, hero.stats[k] + 1)}`,
                    detail: `${s.does}; in fights ${s.fight}`, key: k, disabled: hero.stats[k] >= Progression.STAT_MAX
                }));
                const pick = await pickBattleOption(`⭐ ${hero.name} reached level ${hero.level}: raise a stat (${hero.statPoints} to spend)`, opts);
                if (!pick) { Progression.snoozeStatPrompt(hero); break; } // later: the ⭐ button on the card
                Progression.spendStatPoint(hero, pick.key);
                showPopup(`${Progression.STATS[pick.key].icon} ${hero.name}'s ${Progression.STATS[pick.key].name} is now ${hero.stats[pick.key]}!`, 'success', 2500);
                try { (await import('./combat.js')).recalculateCharacterStats(hero); } catch (_) {}
            }
            // Every 2 levels (or a teaching scroll): learn 1 of 2 new specials.
            while (hero.abilityPicks > 0) {
                const offer = Spells.newAbilityChoices(hero, 2);
                if (!offer.length) {
                    hero.abilityPicks--;
                    if (Progression.masteryBoost(hero)) showPopup(`✨ ${hero.name} knows every special there is: all of them grow stronger!`, 'legendary', 3000);
                    continue;
                }
                const pick = await pickBattleOption(`✨ ${hero.name} can learn a new special`, offer.map(s => ({
                    label: s.name, detail: `${s.mpCost} MP · ${s.description}`, spell: s
                })));
                if (!pick) { Progression.snoozeStatPrompt(hero); break; }
                Spells.learnAbility(hero, pick.spell);
                hero.abilityPicks--;
                showPopup(`✨ ${hero.name} learned ${pick.spell.name}!`, 'legendary', 3000);
            }
        }
    } finally {
        statPromptOpen = false;
        import('./saveLoad.js').then(m => m.requestAutosave()).catch(() => {}); // stat and special picks are kept
        renderPlayerCards();
        if (gameState.currentChoices?.length && !gameState.isLoading) renderChoices(gameState.currentChoices);
    }
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
        if (changed && Media.settings.readAloud) Media.speak(cleanText); // read each new scene aloud
        if (changed) Reading.sceneShown(cleanText, !!Media.settings.readAloud); // reading-pace clock
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
    if (last && text.startsWith(last)) { log[log.length - 1] = text; return true; } // same scene grew (the ending)
    // A chapter heading whenever the story enters a new act (the Story Book reads like a book).
    const act = describeQuestStep(gameState)?.chapter || (gameState.isGoalComplete ? 'Beyond the Quest' : null);
    if (act && act !== gameState.storyChapter) { gameState.storyChapter = act; log.push(`## ${act}`); }
    log.push(text);
    return true;
}

export function storyBookText() {
    const title = gameState.adventureGoal || 'An Adventure Story';
    const heroes = (gameState.players || []).map(p => p.name).join(', ');
    // Headings start chapters; scenes inside a chapter are separated by * * *.
    const body = (gameState.storyLog || []).reduce((s, e, i, all) => s + (e.startsWith('## ')
        ? `${i ? '\n\n' : ''}${e.slice(3).toUpperCase()}\n\n`
        : `${i && !all[i - 1].startsWith('## ') ? '\n\n* * *\n\n' : ''}${e}`), '');
    return `${title}\n${heroes ? `Starring ${heroes}\n` : ''}\n${body}\n`;
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
    // Bag/Shop follow the fight state whenever choices change (phone 10-09: a
    // fight starts mid-turn, and the Bag stayed open until the turn ended).
    try { updateQuickActions(); } catch (_) {}
    // Every set of story choices is shown in a fresh random order, whatever
    // path produced it (post-fight and fallback choices came in type order).
    if (Array.isArray(choices) && !handler) choices = choices.filter(c => c?.type !== 'Defend');
    // The next-chapter picks at the end of a quest are not approach choices.
    const chapterPick = Array.isArray(choices) && choices.length > 0 && choices.every(c => c?.type === 'NewChapter');
    // Exploration: five different approaches, always (the storyteller is asked
    // and repaired in aiHandler; this is the last line for every other path).
    // Fight commands left over after a fight would turn into luck choices
    // below: show plain story choices instead.
    if (Array.isArray(choices) && !handler && !chapterPick && !gameState.inCombat && choices.length && choices.every(c => ['Attack', 'Special', 'Item', 'Run', 'Defend', 'Spell'].includes(c?.type))) choices = Progression.fallbackChoices(gameState.choicePlan);
    if (Array.isArray(choices) && !handler && !chapterPick && !gameState.inCombat) choices = choices.map(Progression.normalizeChoice);
    if (Array.isArray(choices) && !handler && !chapterPick && !gameState.inCombat && choices.length === 5) choices = Progression.fillMix(choices, gameState.choicePlan);
    if (Array.isArray(choices) && choices.length > 1 && !handler && !chapterPick) {
        choices = [...choices];
        for (let i = choices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [choices[i], choices[j]] = [choices[j], choices[i]];
        }
        gameState.currentChoices = choices;
        // Remember this round's approach -> danger pairing so the next one differs.
        const shown = !gameState.inCombat && Progression.planOf(choices);
        if (shown) {
            const h = gameState.choiceMixHistory || (gameState.choiceMixHistory = []);
            if (!Progression.APPROACHES.every(a => h[h.length - 1]?.[a] === shown[a])) { h.push(shown); if (h.length > 8) h.shift(); }
        }
    } else if (chapterPick) gameState.currentChoices = choices; // kept in order, and saved
    // Battle menu in a fixed order (Michael): Attack, Special, Item, Defend,
    // Run. Defend is a fixed command added here at render time (never
    // stored, so it costs the storyteller no words and can't be reshuffled).
    if (gameState.inCombat && !handler && Array.isArray(choices) && choices.length && !choices.some(c => c?.type === 'SelfRevive')) {
        const ORDER = ['Attack', 'Special', 'Item', 'Defend', 'Run'];
        const rank = (c) => { const i = ORDER.indexOf(c?.type); return i === -1 ? ORDER.length : i; };
        choices = [...choices, { type: 'Defend', text: 'Raise your guard: half damage until your next turn, and catch your breath' }]
            .sort((a, b) => rank(a) - rank(b));
    }
    if (!handler && !gameState.inCombat && wantsStatPrompt(gameState.players)) setTimeout(() => promptStatPoints(), 700);
    
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

    // If no valid choices provided, show loading state
    if (!Array.isArray(choices) || choices.length === 0) {
        log("UI: No valid choices data provided. Rendering default/loading state.");
        const loadingChoice = document.createElement('button');
        loadingChoice.className = 'choice-btn disabled';
        loadingChoice.disabled = true;
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
        button.dataset.text = plain; // the click handler sends this, not the badge + text
        // The check this choice makes: stat icon and the chance to succeed.
        const check = !gameState.inCombat && !handler && Progression.CHECKS[choice.type];
        if (check) {
            const hero = gameState.players?.[gameState.currentPlayerIndex] || gameState.players?.[0];
            const stat = Progression.STATS[choice.stat] ? choice.stat : null; // null = luck
            const pct = Math.round(Progression.chanceFor(choice.type, hero, choice.stat ?? null) * 100);
            const icon = stat ? Progression.STATS[stat].icon : '🍀';
            // Danger: Safe shows nothing, Bold ⚠ (could get hurt), Reckless ⚠⚠.
            const danger = { Bold: ' ⚠', Reckless: ' ⚠⚠' }[choice.type] || '';
            button.dataset.odds = `${icon} ${pct}%${danger}`;
            button.title = `${stat ? Progression.STATS[stat].name : 'Luck'}, ${choice.type}: ${pct}% to succeed${choice.type === 'Reckless' ? ', failing will hurt' : danger ? ', failing can hurt' : ''}`;
        }
        // In a fight the move type is shown: Attack/Special/Item/Run are
        // mechanics, not hidden story options.
        const badge = { Attack: '⚔️ Attack', Special: '✨ Special', Item: '🧪 Item', Run: '🏃 Run', Defend: '🛡️ Defend', SelfRevive: '💫 Get up' }[choice.type];
        if (badge) {
            const tag = document.createElement('span');
            tag.className = 'choice-badge';
            tag.textContent = badge;
            button.append(tag, document.createTextNode(plain));
        } else {
            button.textContent = plain;
        }
        button.dataset.actionType = choice.type;
        if (check) button.dataset.stat = Progression.STATS[choice.stat] ? choice.stat : 'luck'; // the approach (tests pick by it)
        button.dataset.choiceIndex = index;

        if (handler) {
            button.onclick = () => handler(choice);
        }

        elements.choicesContainer.appendChild(button);
    });

    // God mode: write your own, below the choices and compact (Michael 10-09:
    // it sat above them and took half the screen).
    if (gameState.godModeManager?.isActive && !handler) appendGodModeInput();
}

function appendGodModeInput() {
    const box = document.createElement('div');
    box.className = 'god-mode-choice-input compact';
    box.innerHTML = `
        <p class="god-mode-or">Or write your own:</p>
        <div class="god-mode-input-container">
            <textarea id="godModeCustomChoice" placeholder="Anything at all: summon, travel, rewrite reality..." rows="2" maxlength="500"></textarea>
            <button id="godModeSubmitBtn" class="god-mode-submit">⚡ Divine Will</button>
        </div>`;
    elements.choicesContainer.appendChild(box);
    const submitBtn = box.querySelector('#godModeSubmitBtn');
    const textarea = box.querySelector('#godModeCustomChoice');
    const submit = async () => {
        const customChoice = textarea.value.trim();
        if (customChoice) { await handleGodModeChoice(customChoice); textarea.value = ''; }
    };
    submitBtn.addEventListener('click', submit);
    // Enter submits (Shift+Enter for a new line); swipe keyboards compose words, so never mid-composition.
    textarea.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); await submit(); }
    });
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

    // No bag or shop mid-battle (Michael 10-09): the battle Item command is the
    // way to use something from the bag in a fight.
    elements.quickActionButtons.inventoryBtn.disabled = baseDisabled || !!gameState.inCombat;
    elements.quickActionButtons.inventoryBtn.title = gameState.inCombat ? 'Use the Item command in a fight' : 'Inventory';
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
    
    // Saved heroes from earlier games (roster.js): pick one, or make a new hero.
    const heroes = Roster.listHeroes();
    for (let i = 0; i < gameState.playerCount; i++) {
        const div = document.createElement('div');
        if (heroes.length) {
            const pick = document.createElement('select');
            pick.id = `heroPick_${i}`; pick.className = 'cloud-provider-select hero-pick';
            pick.innerHTML = `<option value="">✨ New hero</option>` + heroes.map(h => `<option value="${sanitizeText(h.id)}">${sanitizeText(h.label)}</option>`).join('');
            pick.addEventListener('change', () => {
                const h = heroes.find(x => x.id === pick.value);
                const input = document.getElementById(`nameInput_${i}`);
                if (input) { input.value = h ? h.name : ''; input.readOnly = !!h; }
            });
            div.appendChild(pick);
        }
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

// ---------------------------------------------------------------- Bag, Shop, Moves (redesign 10-11)
// One compact row per thing: an icon for what it is, the name, one line of what
// it really does (computed, never the storyteller's prose), and the main action
// right there. Tapping the row opens the description and the rarer actions.
// Class hooks stay (.item-card + data-item-id, .useItemBtn..., .move-card +
// .useMoveBtn) so the click handlers in main.js work unchanged.
const kitFilter = { inventory: 'all' };

/** What an item is, as an icon. */
function itemIcon(item) {
    const s = item.stats || {};
    if (item.type === 'Weapon') return '⚔️';
    if (item.type === 'Armor') return '🛡️';
    if (item.type === 'Quest') return '🗝️';
    if (s.luck && item.type !== 'Consumable') return '🍀';
    if (s.revive) return '💫';
    if (s.teach) return '📜';
    if (s.statUp || s.maxHpUp || s.maxMpUp || s.rankUp) return '⭐';
    if (s.throwStatus) return '💣';
    if (s.cure) return '🌿';
    if (s.applyStatus) return '✨';
    if ((s.mp || s.mpPercent) && !(s.heal || s.healPercent)) return '🔷';
    if (item.type === 'Consumable') return '🧪';
    return '📦';
}

/** What an item really does, in a few words; gear is compared with what the hero wears. */
function itemLine(item, hero) {
    const s = item.stats || {};
    const bits = [];
    const worn = (slot) => (hero?.inventory || []).find(i => i?.id === hero?.equipment?.[slot]);
    if (item.type === 'Weapon' || item.type === 'Armor') {
        const slot = item.type === 'Weapon' ? 'weapon' : 'armor', key = slot === 'weapon' ? 'atk' : 'def';
        const mine = worn(slot), v = Number(s[key]) || 0;
        bits.push(`${key.toUpperCase()} +${v}`);
        if (mine && mine.id !== item.id) { const d = v - (Number(mine.stats?.[key]) || 0); bits.push(d > 0 ? `▲${d} vs yours` : d < 0 ? `▼${-d} vs yours` : 'same as yours'); }
        else if (!mine) bits.push('▲ you have none');
        if (s.element) bits.push(`${s.element}${s.onHitStatus ? ` · ${s.onHitStatus} on hit` : ''}`);
    }
    const words = effectWords(item);
    if (words) bits.push(words);
    if (s.luck) bits.push(`🍀 luck +${s.luck}`);
    return bits.join(' · ') || (item.type === 'Quest' ? 'needed for the quest' : 'story item: use it in a choice');
}

/** One row. `actions` = [{label, cls, disabled, data, primary}]; `more` = details shown when opened. */
function kitRow({ icon, name, qty, tier, line, actions = [], more = '', cls = '', data = {} }) {
    const row = document.createElement('div');
    row.className = `kit-row ${cls}${tier ? ` tier-${String(tier).toLowerCase()}` : ''}`;
    Object.entries(data).forEach(([k, v]) => { if (v != null) row.dataset[k] = v; });
    const primary = actions.filter(a => a.primary), rest = actions.filter(a => !a.primary);
    const btn = (a) => `<button class="${a.cls || ''}${a.primary ? ' kit-act' : ' kit-act2'}" ${a.disabled ? 'disabled' : ''} ${Object.entries(a.data || {}).map(([k, v]) => `data-${k}="${sanitizeText(String(v))}"`).join(' ')}>${sanitizeText(a.label)}</button>`;
    row.innerHTML = `
        <div class="kit-main">
            <span class="kit-icon" aria-hidden="true">${icon}</span>
            <div class="kit-text">
                <div class="kit-name">${sanitizeText(name)}${qty > 1 ? ` <span class="kit-qty">×${qty}</span>` : ''}${tier ? ` <span class="kit-tier">${sanitizeText(String(tier))}</span>` : ''}</div>
                <div class="kit-line">${sanitizeText(line)}</div>
            </div>
            ${primary.map(btn).join('')}
        </div>
        ${more || rest.length ? `<div class="kit-more">${more ? `<p>${more}</p>` : ''}${rest.length ? `<div class="kit-more-acts">${rest.map(btn).join('')}</div>` : ''}</div>` : ''}`;
    // Tap the row (not a button) to open or close its details.
    row.addEventListener('click', (e) => { if (!e.target.closest?.('button') && e.target.closest?.('.kit-main')) row.classList.toggle('open'); });
    return row;
}

const kitNote = (box, cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; box.appendChild(p); };
const section = (title, n) => { const h = document.createElement('h3'); h.className = 'kit-section'; h.textContent = n != null ? `${title} (${n})` : title; return h; };

/** The hero's wallet and gear at the top of the Bag and the Shop. */
function kitHeader(hero, extra = '') {
    const worn = (slot) => (hero.inventory || []).find(i => i?.id === hero.equipment?.[slot]);
    const w = worn('weapon'), a = worn('armor');
    const div = document.createElement('div');
    div.className = 'kit-header';
    div.innerHTML = `<span>⚔️ ${w ? `${sanitizeText(w.name)} +${w.stats?.atk || 0}` : 'no weapon'}</span><span>🛡️ ${a ? `${sanitizeText(a.name)} +${a.stats?.def || 0}` : 'no armour'}</span>${extra ? `<span class="kit-note">${extra}</span>` : ''}`;
    return div;
}

/** Item rows for the Bag (context 'inventory') or the Shop ('shop'). */
function createItemCard(item, context) {
    let hero; try { hero = getCurrentPlayer(); } catch (_) {}
    item.type = Progression.usableType(item); // older saves: an invented type had no buttons
    inferItemEffects(item); // older saves: the +15% guess on story items is read again
    const tier = String(item.tier ?? 'Low');
    const equippedSlot = hero?.equipment?.weapon === item.id ? 'weapon' : hero?.equipment?.armor === item.id ? 'armor' : null;
    const cannotAct = hero?.isDowned || gameState.isLoading;
    const actions = [];
    if (context === 'shop') {
        const price = calculateItemPrice(item);
        const short = price - (hero?.coins || 0);
        actions.push({ label: short > 0 ? `Need ${short} more` : `Buy ${price} 💰`, cls: 'buyItemBtn', primary: true, disabled: short > 0 || cannotAct || !item.cost });
    } else {
        if (item.type === 'Consumable' && !item.stats?.revive) actions.push({ label: 'Use', cls: 'useItemBtn', primary: true, disabled: cannotAct });
        if ((item.type === 'Weapon' || item.type === 'Armor') && !equippedSlot && !gameState.inCombat) actions.push({ label: 'Equip', cls: 'equipItemBtn', primary: true, disabled: cannotAct, data: { slot: item.type === 'Weapon' ? 'weapon' : 'armor' } });
        if (equippedSlot && !gameState.inCombat) actions.push({ label: 'Unequip', cls: 'unequipItemBtn', disabled: cannotAct });
        if (!equippedSlot && item.type !== 'Quest' && !gameState.inCombat) actions.push({ label: `Sell ${sellValue(item)} 💰`, cls: 'sellItemBtn', disabled: cannotAct });
        if (!gameState.inCombat && item.type !== 'Quest') actions.push({ label: 'Drop', cls: 'dropItemBtn', disabled: cannotAct });
    }
    const row = kitRow({
        icon: itemIcon(item), name: item.name, qty: item.quantity, tier, line: `${equippedSlot ? 'Worn · ' : ''}${itemLine(item, hero)}`,
        actions, more: sanitizeText(item.effect || item.description || ''), cls: `item-card${equippedSlot ? ' equipped' : ''}`,
        data: { itemId: item.id, slot: equippedSlot }
    });
    return row;
}

/** Bag: what you carry, grouped, with filters. */
export function renderInventory() {
    updateContextHeaders();
    if (!elements.inventoryDisplay) return;
    const box = elements.inventoryDisplay;
    box.innerHTML = '';
    let hero; try { hero = getCurrentPlayer(); } catch (_) {}
    if (!hero) return;
    box.appendChild(kitHeader(hero));
    const items = (hero.inventory || []).filter(Boolean);
    if (!items.length) { kitNote(box, 'info-message', 'Your bag is empty.'); return; }
    const groups = [
        ['use', 'Use', (i) => i.type === 'Consumable'],
        ['gear', 'Gear', (i) => i.type === 'Weapon' || i.type === 'Armor'],
        ['keep', 'Keep', (i) => i.type !== 'Consumable' && i.type !== 'Weapon' && i.type !== 'Armor']
    ];
    const chips = document.createElement('div');
    chips.className = 'kit-chips';
    for (const [key, label] of [['all', 'All'], ...groups.map(([k, l]) => [k, l])]) {
        const n = key === 'all' ? items.length : items.filter(groups.find(g => g[0] === key)[2]).length;
        if (key !== 'all' && !n) continue;
        const c = document.createElement('button');
        c.className = `kit-chip${kitFilter.inventory === key ? ' on' : ''}`;
        c.textContent = `${label} ${n}`;
        c.addEventListener('click', () => { kitFilter.inventory = key; renderInventory(); });
        chips.appendChild(c);
    }
    box.appendChild(chips);
    for (const [key, label, test] of groups) {
        if (kitFilter.inventory !== 'all' && kitFilter.inventory !== key) continue;
        const list = items.filter(test).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        if (!list.length) continue;
        box.appendChild(section(label, list.length));
        list.forEach(i => box.appendChild(createItemCard(i, 'inventory')));
    }
}

/** Shop: the inn, then potions, gear and charms, cheapest first. */
export function renderShop() {
    updateContextHeaders();
    if (!elements.shopDisplay) return;
    const box = elements.shopDisplay;
    box.innerHTML = '';
    const hero = gameState.players?.[gameState.currentPlayerIndex];
    if (!hero) return;
    const nextStock = 5 - ((gameState.turn || 1) % 5);
    box.appendChild(kitHeader(hero, `New stock in ${nextStock} turn${nextStock === 1 ? '' : 's'}`));
    // The inn.
    const price = Progression.innPrice(hero);
    const rested = hero.hp >= hero.maxHp && (hero.mp ?? 0) >= (hero.maxMp ?? 0) && !(hero.statusEffects || []).some(e => e?.name === 'Flustered');
    const inn = kitRow({ icon: '🛏️', name: 'Rest at the inn', line: rested ? 'You are already fully rested' : 'Full HP and MP, and shake off Flustered', cls: 'inn-card',
        actions: [{ label: gameState.inCombat ? 'Not in a fight' : rested ? 'Rested' : (hero.coins || 0) < price ? `Need ${price - (hero.coins || 0)} more` : `Rest ${price} 💰`, cls: 'innRestBtn', primary: true, disabled: gameState.inCombat || rested || (hero.coins || 0) < price }] });
    inn.addEventListener('click', (e) => {
        if (!e.target.closest?.('.innRestBtn') || gameState.inCombat || (hero.coins || 0) < price) return;
        hero.coins -= price; hero.hp = hero.maxHp; hero.mp = hero.maxMp ?? hero.mp;
        hero.statusEffects = (hero.statusEffects || []).filter(e => e?.name !== 'Flustered');
        import('./saveLoad.js').then(m => m.requestAutosave()).catch(() => {});
        showPopup(`${hero.name} rests at the inn: fully restored (-${price} coins).`, 'healing', 3000);
        renderPlayerCards(); updateContextHeaders(); renderShop();
    });
    box.appendChild(inn);
    // Gear and charms this hero already bought are gone from their shop.
    const stock = (gameState.shopItems || []).filter(i => i && !(i.boughtBy || []).includes(hero.id));
    if (!stock.length) { kitNote(box, 'info-message', 'The shelves are empty: new stock soon.'); return; }
    const groups = [['Potions & tools', (i) => i.type === 'Consumable'], ['Gear', (i) => i.type === 'Weapon' || i.type === 'Armor'], ['Charms & curios', (i) => i.type !== 'Consumable' && i.type !== 'Weapon' && i.type !== 'Armor']];
    for (const [label, test] of groups) {
        const list = stock.filter(test).sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
        if (!list.length) continue;
        box.appendChild(section(label));
        list.forEach(i => box.appendChild(createItemCard(i, 'shop')));
    }
    kitNote(box, 'kit-note kit-foot', 'Sell from your Bag for half price.');
}

/** Moves: every special, grouped by what it does, with its rank and real effect. */
export function renderSpecialMoves() {
    updateContextHeaders();
    if (!elements.specialMovesDisplay) return;
    const box = elements.specialMovesDisplay;
    box.innerHTML = '';
    let hero; try { hero = getCurrentPlayer(); } catch (_) {}
    const moves = (hero?.specialMoves || []).filter(Boolean);
    const spells = (hero?.spellcasting?.knownSpells || []).filter(Boolean);
    if (!hero || (!moves.length && !spells.length)) { box.innerHTML = '<p class="info-message">No special moves yet: you learn new ones every 2 levels.</p>'; return; }
    const pips = (a) => { const r = Progression.abilityRank(a); return `${'●'.repeat(r)}${'○'.repeat(5 - r)}`; };
    const toNext = (a) => { const r = Progression.abilityRank(a); return r < 5 ? `${a.uses || 0}/${Progression.RANK_USES[r]} uses to rank ${Progression.ROMAN[r + 1]}` : 'mastered'; };
    const verb = AdaptiveAbilities.isMagicWorld() ? 'Cast' : 'Use';
    const rows = [];
    for (const s of spells) {
        const sum = SpellCasting.abilitySummary(s, hero);
        const fx = s.effects || {};
        const kind = Number(fx.damage) > 0 ? 'attack' : Number(fx.healing) > 0 ? 'heal' : 'trick';
        const cost = Progression.abilityMpCost(s);
        const row = kitRow({ icon: kind === 'attack' ? '💥' : kind === 'heal' ? '💚' : '🌀', name: s.name, line: `${pips(s)} · ${cost} MP · ${sum}`,
            actions: [{ label: (hero.mp ?? 0) >= cost ? `${verb}` : `Need ${cost} MP`, cls: 'castSpellCardBtn', primary: true, disabled: (hero.mp ?? 0) < cost || gameState.isLoading || hero.isDowned }],
            more: `${sanitizeText(s.description || '')}<br><small>Rank ${Progression.ROMAN[Progression.abilityRank(s)]} · ${toNext(s)}</small>`, cls: 'spell-card' });
        row.addEventListener('click', async (e) => {
            if (!e.target.closest?.('.castSpellCardBtn')) return;
            showScreen('gameScreen');
            if (gameState.inCombat) { const { handlePlayerChoice } = await import('./actionHandler.js'); return handlePlayerChoice('Spell', `Cast ${s.name}`); } // costs the turn
            const res = await SpellCasting.castSpell(hero, s);
            showPopup(res?.success ? `${hero.name} uses ${s.name}!` : `${s.name} fizzles${res?.reason ? ': ' + res.reason : ''}`, res?.success ? 'skill' : 'warning');
            renderPlayerCards();
        });
        rows.push([kind, row]);
    }
    for (const m of moves) {
        const mech = m.mechanics || {};
        const cost = Progression.abilityMpCost(m), cd = m.currentCooldown || 0;
        const wrongPlace = (m.usageContext === 'exploration' && gameState.inCombat) || (m.usageContext === 'combat' && !gameState.inCombat);
        const dmg = Number(mech.directDamage ?? mech.damage) || 0;
        const kind = dmg > 0 ? 'attack' : Number(mech.healing) > 0 ? 'heal' : 'trick';
        const bits = [dmg ? `weapon hit ×1.5 + ${Math.round(dmg * Progression.abilityPower(hero, m))}` : '', mech.healing ? `heals ${mech.healing}` : '', ...(mech.statusEffects || []).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean)];
        const row = kitRow({ icon: kind === 'attack' ? '💥' : kind === 'heal' ? '💚' : '🌀', name: m.name,
            line: `${pips(m)} · ${cost ? `${cost} MP · ` : ''}${bits.filter(Boolean).join(' · ') || 'a special move'}${cd > 0 ? ` · ready in ${cd}` : ''}`,
            actions: [{ label: cd > 0 ? `In ${cd}` : wrongPlace ? (gameState.inCombat ? 'Not in fights' : 'Fights only') : 'Use', cls: 'useMoveBtn', primary: true, disabled: hero.isDowned || cd > 0 || (cost > (hero.mp || 0)) || gameState.isLoading || wrongPlace }],
            more: `${sanitizeText(m.effect || m.description || '')}<br><small>Rank ${Progression.ROMAN[Progression.abilityRank(m)]} · ${toNext(m)} · cooldown ${m.cooldown ?? 2}</small>`, cls: 'move-card', data: { moveId: m.id } });
        rows.push([kind, row]);
    }
    for (const [kind, title] of [['attack', 'Attacks'], ['heal', 'Heals'], ['trick', 'Tricks & boosts']]) {
        const list = rows.filter(r => r[0] === kind);
        if (!list.length) continue;
        box.appendChild(section(title, list.length));
        list.forEach(([, r]) => box.appendChild(r));
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
    elements.revivalItemStatus.innerHTML = `Revival Items (<span class="revival-item-name">${safeRevivalName}</span>): <span id="revivalItemCount" class="${revivalItemCount > 0 ? 'has-items' : 'no-items'}">${revivalItemCount}</span>`;

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
    const base = item?.boughtFor ?? item?.cost ?? itemValue(item);
    return Math.max(item?.boughtFor != null ? 0 : 1, Math.floor(base / 2));
}
