// spellUI.js
// User Interface for Magic & Spell System
// Phase 3: Magic System Implementation

import { gameState, getCurrentPlayer } from './state.js?cb=014';
import * as Spells from './spells.js?cb=014';
import * as UI from './ui.js?cb=014';
import * as AdaptiveAbilities from './adaptiveAbilities.js?cb=014';

/**
 * Render the spellbook interface
 */
export function renderSpellbook() {
    const log = window.displayVisualError || console.log;
    const player = getCurrentPlayer();
    
    if (!player || !player.spellcasting) {
        log('No spellcasting player found for spellbook');
        return;
    }
    
    log('Rendering spellbook interface');
    
    // Get theme-appropriate terminology
    const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
    const bookName = adaptation.bookName;
    const bookIcon = adaptation.bookIcon;
    const resourceName = adaptation.resourceName;
    const resourceAbbrev = adaptation.resourceAbbrev;
    const resourceIcon = adaptation.resourceIcon;
    const abilityNamePlural = adaptation.abilityNamePlural;
    
    // Create spellbook container if it doesn't exist
    let spellbookContainer = document.getElementById('spellbookContainer');
    if (!spellbookContainer) {
        spellbookContainer = document.createElement('div');
        spellbookContainer.id = 'spellbookContainer';
        spellbookContainer.className = 'spellbook-container';
        document.body.appendChild(spellbookContainer);
    }
    
    // Build spellbook HTML with adaptive terminology
    spellbookContainer.innerHTML = `
        <div class="spellbook-modal">
            <div class="spellbook-header">
                <h2>${bookIcon} ${player.name}'s ${bookName}</h2>
                <button class="close-spellbook-btn">✕</button>
            </div>
            
            <div class="spellbook-stats">
                <div class="casting-level">
                    <span class="stat-label">${adaptation.practitionerName} Level:</span>
                    <span class="stat-value">${player.spellcasting.spellcastingLevel}</span>
                </div>
                <div class="max-spell-level">
                    <span class="stat-label">Max ${adaptation.abilityName} Level:</span>
                    <span class="stat-value">${player.spellcasting.maxSpellLevel}</span>
                </div>
                <div class="current-mp">
                    <span class="stat-label">Current ${resourceAbbrev}:</span>
                    <span class="stat-value mp-display">${resourceIcon} ${player.mp}/${player.maxMp}</span>
                </div>
            </div>
            
            <div class="spellbook-tabs">
                <button class="spell-tab active" data-tab="known">Known ${abilityNamePlural} (${player.spellcasting.knownSpells.length})</button>
                <button class="spell-tab" data-tab="schools">${adaptation.systemName.replace(' System', '')} Schools</button>
                <button class="spell-tab" data-tab="prepared">Prepared ${abilityNamePlural} (${player.spellcasting.preparedSpells.length})</button>
            </div>
            
            <div class="spellbook-content">
                <div class="spell-tab-content active" id="known-spells-tab">
                    ${renderKnownSpells(player)}
                </div>
                <div class="spell-tab-content" id="schools-tab">
                    ${renderMagicSchools(player)}
                </div>
                <div class="spell-tab-content" id="prepared-spells-tab">
                    ${renderPreparedSpells(player)}
                </div>
            </div>
        </div>
        <div class="spellbook-backdrop"></div>
    `;
    
    // Add event listeners
    setupSpellbookEventListeners(spellbookContainer);
    
    // Show the spellbook
    spellbookContainer.classList.add('active');
}

/**
 * Render the known spells tab
 * @param {Player} player - The player
 * @returns {string} HTML for known spells
 */
function renderKnownSpells(player) {
    const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
    const abilityNamePlural = adaptation.abilityNamePlural.toLowerCase();
    
    if (!player.spellcasting.knownSpells.length) {
        return `<div class="no-spells">No ${abilityNamePlural} known yet. Learn ${abilityNamePlural} through exploration and practice!</div>`;
    }
    
    // Group spells by level
    const spellsByLevel = {};
    player.spellcasting.knownSpells.forEach(spell => {
        if (!spellsByLevel[spell.level]) {
            spellsByLevel[spell.level] = [];
        }
        spellsByLevel[spell.level].push(spell);
    });
    
    let html = '';
    Object.keys(spellsByLevel).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
        const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === parseInt(level));
        html += `
            <div class="spell-level-group">
                <h3 class="spell-level-header">
                    ${levelData.name} ${adaptation.abilityNamePlural} (Level ${level})
                    <span class="level-description">${levelData.description}</span>
                </h3>
                <div class="spells-grid">
                    ${spellsByLevel[level].map(spell => renderSpellCard(spell, player)).join('')}
                </div>
            </div>
        `;
    });
    
    return html;
}

/**
 * Render the magic schools tab
 * @param {Player} player - The player
 * @returns {string} HTML for magic schools
 */
function renderMagicSchools(player) {
    const adaptedSchools = Spells.getAdaptedSchools();
    let html = '<div class="schools-grid">';
    
    Object.entries(adaptedSchools).forEach(([schoolKey, school]) => {
        const affinity = player.spellcasting.schoolAffinities[schoolKey] || 0;
        const playerSpells = Spells.getSpellsBySchool(player, schoolKey);
        const affinityClass = affinity >= 75 ? 'high-affinity' : affinity >= 50 ? 'medium-affinity' : 'low-affinity';
        
        html += `
            <div class="school-card ${affinityClass}">
                <div class="school-header">
                    <span class="school-icon">${school.icon}</span>
                    <h3 class="school-name" style="color: ${school.color}">${school.name}</h3>
                </div>
                <p class="school-description">${school.description}</p>
                <div class="school-stats">
                    <div class="affinity-bar">
                        <span class="affinity-label">Affinity: ${affinity}%</span>
                        <div class="affinity-progress">
                            <div class="affinity-fill" style="width: ${affinity}%; background-color: ${school.color}"></div>
                        </div>
                    </div>
                    <div class="school-spell-count">Known ${AdaptiveAbilities.getAdaptedTerm('abilityNamePlural')}: ${playerSpells.length}</div>
                </div>
                <div class="school-elements">
                    <strong>Elements:</strong> ${school.elements.join(', ')}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

/**
 * Render the prepared spells tab
 * @param {Player} player - The player
 * @returns {string} HTML for prepared spells
 */
function renderPreparedSpells(player) {
    const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
    const abilityNamePlural = adaptation.abilityNamePlural.toLowerCase();
    const resourceAbbrev = adaptation.resourceAbbrev;
    const usageVerb = adaptation.usageVerb;
    
    if (!player.spellcasting.preparedSpells.length) {
        return `<div class="no-spells">No ${abilityNamePlural} prepared. Prepare ${abilityNamePlural} to ${usageVerb} them in combat!</div>`;
    }
    
    let html = `<div class="prepared-spells-info">These ${abilityNamePlural} are ready to ${usageVerb} and consume ${resourceAbbrev} when used.</div>`;
    html += '<div class="spells-grid">';
    
    player.spellcasting.preparedSpells.forEach(spell => {
        const canCast = Spells.canCastSpell(player, spell);
        html += renderSpellCard(spell, player, true, canCast);
    });
    
    html += '</div>';
    return html;
}

/**
 * Render a single spell card
 * @param {Spell} spell - The spell to render
 * @param {Player} player - The player who knows the spell
 * @param {boolean} showCastButton - Whether to show cast button
 * @param {object} canCast - Result from canCastSpell check
 * @returns {string} HTML for the spell card
 */
function renderSpellCard(spell, player, showCastButton = false, canCast = null) {
    const adaptedSchools = Spells.getAdaptedSchools();
    const school = adaptedSchools[spell.school];
    const type = Spells.SPELL_TYPES[spell.type];
    const levelData = Object.values(Spells.SPELL_LEVELS).find(sl => sl.level === spell.level);
    
    const actualMpCost = calculateSpellMpCost(player, spell);
    const isPrepared = player.spellcasting.preparedSpells.find(s => s.id === spell.id);
    
    // Build effects description
    let effectsHtml = '';
    if (spell.effects.damage) {
        effectsHtml += `<div class="spell-effect damage">💥 Damage: ${spell.effects.damage}</div>`;
    }
    if (spell.effects.healing) {
        effectsHtml += `<div class="spell-effect healing">❤️ Healing: ${spell.effects.healing}</div>`;
    }
    if (spell.effects.statusEffects?.length) {
        effectsHtml += `<div class="spell-effect status">✨ Effects: ${spell.effects.statusEffects.join(', ')}</div>`;
    }
    
    return `
        <div class="spell-card ${spell.rarity}" data-spell-id="${spell.id}">
            <div class="spell-header">
                <div class="spell-name-row">
                    <h4 class="spell-name">${spell.name}</h4>
                    <span class="spell-level-badge level-${spell.level}">${levelData.name}</span>
                </div>
                <div class="spell-school-type">
                    <span class="spell-school" style="color: ${school.color}">
                        ${school.icon} ${school.name}
                    </span>
                    <span class="spell-type">${type.name}</span>
                </div>
            </div>
            
            <p class="spell-description">${spell.description}</p>
            
            <div class="spell-mechanics">
                <div class="spell-stats">
                    <div class="spell-stat">
                        <span class="stat-label">MP Cost:</span>
                        <span class="stat-value mp-cost">${actualMpCost} 🔮</span>
                    </div>
                    <div class="spell-stat">
                        <span class="stat-label">Range:</span>
                        <span class="stat-value">${spell.range}</span>
                    </div>
                    <div class="spell-stat">
                        <span class="stat-label">Cast Time:</span>
                        <span class="stat-value">${spell.castTime}</span>
                    </div>
                    <div class="spell-stat">
                        <span class="stat-label">Duration:</span>
                        <span class="stat-value">${spell.duration}</span>
                    </div>
                </div>
                
                ${effectsHtml ? `<div class="spell-effects">${effectsHtml}</div>` : ''}
                
                <div class="spell-components">
                    <strong>Components:</strong> ${spell.components.join(', ')}
                    ${spell.materialComponent ? `<br><em>Material: ${spell.materialComponent}</em>` : ''}
                </div>
            </div>
            
            <div class="spell-footer">
                ${isPrepared ? '<span class="prepared-indicator">📋 Prepared</span>' : ''}
                ${showCastButton ? `
                    <button class="cast-spell-btn ${canCast?.success ? '' : 'disabled'}" 
                            data-spell-id="${spell.id}"
                            ${canCast?.success ? '' : `disabled title="${canCast?.reason}"`}>
                        ${canCast?.success ? `${AdaptiveAbilities.getAdaptedTerm('usageVerb').charAt(0).toUpperCase() + AdaptiveAbilities.getAdaptedTerm('usageVerb').slice(1)} ${AdaptiveAbilities.getAdaptedTerm('abilityName')}` : canCast?.reason}
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Calculate MP cost for a spell (duplicate from spells.js for UI)
 * @param {Player} player - The caster
 * @param {Spell} spell - The spell
 * @returns {number} MP cost
 */
function calculateSpellMpCost(player, spell) {
    let cost = spell.mpCost;
    
    if (player.spellcasting?.castingModifiers?.mpCostReduction) {
        cost = Math.max(1, cost - player.spellcasting.castingModifiers.mpCostReduction);
    }
    
    const schoolAffinity = player.spellcasting?.schoolAffinities?.[spell.school] || 0;
    if (schoolAffinity >= 75) {
        cost = Math.max(1, Math.floor(cost * 0.9));
    }
    
    return cost;
}

/**
 * Setup event listeners for the spellbook
 * @param {HTMLElement} container - The spellbook container
 */
function setupSpellbookEventListeners(container) {
    // Close button
    const closeBtn = container.querySelector('.close-spellbook-btn');
    const backdrop = container.querySelector('.spellbook-backdrop');
    
    const closeSpellbook = () => {
        container.classList.remove('active');
        setTimeout(() => container.remove(), 300);
    };
    
    closeBtn?.addEventListener('click', closeSpellbook);
    backdrop?.addEventListener('click', closeSpellbook);
    
    // Tab switching
    const tabs = container.querySelectorAll('.spell-tab');
    const tabContents = container.querySelectorAll('.spell-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            tabContents.forEach(content => content.classList.remove('active'));
            const targetContent = container.querySelector(`#${tabName}-spells-tab`) || 
                                 container.querySelector(`#${tabName}-tab`);
            targetContent?.classList.add('active');
        });
    });
    
    // Cast spell buttons
    const castButtons = container.querySelectorAll('.cast-spell-btn:not(.disabled)');
    castButtons.forEach(button => {
        button.addEventListener('click', () => {
            const spellId = button.dataset.spellId;
            castSpellFromUI(spellId);
            closeSpellbook(); // Close spellbook after casting
        });
    });
}

/**
 * Cast a spell from the UI
 * @param {string} spellId - The spell ID to cast
 */
async function castSpellFromUI(spellId) {
    const log = window.displayVisualError || console.log;
    const player = getCurrentPlayer();
    
    if (!player || !player.spellcasting) {
        log('No spellcasting player for spell casting');
        return;
    }
    
    const spell = player.spellcasting.knownSpells.find(s => s.id === spellId);
    if (!spell) {
        log(`Spell ${spellId} not found`);
        UI.showPopup('Spell not found!', 'error');
        return;
    }
    
    // Import spell casting system (will be created next)
    try {
        const SpellCasting = await import('./spellCasting.js?cb=014');
        await SpellCasting.castSpell(player, spell);
    } catch (error) {
        log('Error casting spell:', error);
        UI.showPopup('Failed to cast spell!', 'error');
    }
}

/**
 * Show a quick spell selection popup for combat
 * @param {Player} player - The player casting
 * @param {Function} onSpellSelected - Callback when spell is selected
 */
export function showQuickSpellSelector(player, onSpellSelected) {
    const availableSpells = Spells.getAvailableSpells(player);
    const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
    const abilityNamePlural = adaptation.abilityNamePlural.toLowerCase();
    const usageVerb = adaptation.usageVerb;
    const resourceAbbrev = adaptation.resourceAbbrev;
    
    if (!availableSpells.length) {
        UI.showPopup(`No ${abilityNamePlural} available to ${usageVerb}!`, 'warning');
        return;
    }
    
    // Create quick selector
    const selector = document.createElement('div');
    selector.className = 'quick-spell-selector';
    selector.innerHTML = `
        <div class="quick-selector-header">
            <h3>${usageVerb.charAt(0).toUpperCase() + usageVerb.slice(1)} ${adaptation.abilityName}</h3>
            <button class="close-selector-btn">✕</button>
        </div>
        <div class="quick-spells-grid">
            ${availableSpells.map(spell => {
                const adaptedSchools = Spells.getAdaptedSchools();
                const school = adaptedSchools[spell.school];
                const mpCost = calculateSpellMpCost(player, spell);
                return `
                    <button class="quick-spell-btn" data-spell-id="${spell.id}">
                        <div class="quick-spell-icon" style="color: ${school.color}">${school.icon}</div>
                        <div class="quick-spell-name">${spell.name}</div>
                        <div class="quick-spell-cost">${mpCost} ${resourceAbbrev}</div>
                    </button>
                `;
            }).join('')}
        </div>
    `;
    
    document.body.appendChild(selector);
    
    // Event listeners
    selector.querySelector('.close-selector-btn').addEventListener('click', () => {
        selector.remove();
    });
    
    selector.querySelectorAll('.quick-spell-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const spellId = btn.dataset.spellId;
            const spell = availableSpells.find(s => s.id === spellId);
            selector.remove();
            onSpellSelected(spell);
        });
    });
    
    selector.classList.add('active');
}

/**
 * Add spellbook and cast spell buttons to the UI
 */
export function addSpellbookButton() {
    const player = getCurrentPlayer();
    if (!player || !player.spellcasting) return;
    
    const quickActions = document.getElementById('quickActions');
    if (!quickActions) return;
    
    // Remove existing spell buttons to refresh them
    const existingSpellbookBtn = document.getElementById('spellbookBtn');
    const existingCastBtn = document.getElementById('castSpellBtn');
    if (existingSpellbookBtn) existingSpellbookBtn.remove();
    if (existingCastBtn) existingCastBtn.remove();
    
    // Get theme-appropriate terminology
    const adaptation = AdaptiveAbilities.getCurrentThemeAdaptation();
    
    // Add spellbook button if not already there
    if (!document.getElementById('spellbookBtn')) {
        const spellbookBtn = document.createElement('button');
        spellbookBtn.id = 'spellbookBtn';
        spellbookBtn.className = 'quick-btn';
        spellbookBtn.innerHTML = `${adaptation.bookIcon} Book`;
        spellbookBtn.title = `Open ${adaptation.bookName}`;
        spellbookBtn.addEventListener('click', renderSpellbook);
        quickActions.appendChild(spellbookBtn);
    }
    
    // Add cast spell button if player has spells and not already there
    const hasSpells = player.spellcasting.knownSpells?.length > 0;
    if (hasSpells && !document.getElementById('castSpellBtn')) {
        const castSpellBtn = document.createElement('button');
        castSpellBtn.id = 'castSpellBtn';
        castSpellBtn.className = 'quick-btn';
        castSpellBtn.innerHTML = adaptation.actionButton.split(' ').slice(0, 2).join(' '); // Take first two parts (icon + first word)
        castSpellBtn.title = adaptation.actionButton;
        castSpellBtn.addEventListener('click', () => {
            showQuickSpellSelector(player, async (spell) => {
                const SpellCasting = await import('./spellCasting.js?cb=014');
                await SpellCasting.castSpell(player, spell);
                
                // Advance turn if in combat
                if (gameState.inCombat) {
                    const TurnManager = await import('./turnManager.js?cb=014');
                    await TurnManager.advanceTurn();
                }
            });
        });
        quickActions.appendChild(castSpellBtn);
    }
}

export default {
    renderSpellbook,
    showQuickSpellSelector,
    addSpellbookButton
};
