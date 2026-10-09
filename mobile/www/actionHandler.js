// actionHandler.js
// Handles player-initiated actions like choices, item use, special moves, etc.

// --- Static Imports ---
import { gameState, determineContext, getCurrentPlayer, canCurrentPlayerAct } from './state.js';
import * as Config from './config.js';
import * as UI from './ui.js';
import * as Combat from './combat.js';
import * as Items from './items.js';
import * as Progression from './progression.js';
import * as Media from './media.js';
import { levelUp } from './battle.js';
 // May not be needed if all calls go through aiHandler
import { generateId, getRandomElement, clamp } from './utils.js';
// Import aiHandler functions statically
import { makeAICallForSystemAction } from './aiHandler.js';
// Import turnManager functions statically
import { advanceTurn } from './turnManager.js';
// Import game loop
// Import intelligent compression helpers
import { recordPlayerChoice, recordStoryBeat } from './state.js';


/**
 * Handles the player selecting one of the AI-generated choices.
 * Identifies the choice's underlying type, applies mechanical consequences based on that type,
 * updates the UI, and then constructs a prompt for the AI based on the *text* chosen.
 * @param {string} actionType - The choice's danger ('Safe', 'Bold', 'Reckless') or a battle command, from the button's data-action-type.
 * @param {string} choiceText - The actual text of the choice selected by the player, retrieved from button's text content.
 */
/**
 * Handle God Mode custom choice
 * @param {string} customChoice - Player's custom written choice
 */
async function handleGodModeChoice(customChoice) {
    const log = window.displayVisualError || console.log;

    if (!gameState.godModeManager?.isActive && !gameState.allowCustomActions) {
        log("God Mode choice attempted but God Mode is not active");
        return;
    }

    // CONSOLIDATED: route the Execute Divine Will button through the same
    // creative-mode flow as the Custom Action input. Both used to take
    // separate prompt paths (Execute went through godMode.js's
    // processCustomChoice with a generic AI prompt; Custom Action used the
    // diff-engine creative prompt). Now they share the rich god-mode prompt
    // with full authorial-power examples (items, skills, NPCs, bosses,
    // quests, stats, etc.) defined in handleCustomAction.
    try {
        log(`God Mode: Processing custom choice via consolidated handleCustomAction path - ${customChoice.slice(0, 50)}...`);
        // Make sure allowCustomActions is true (god mode unlock should have
        // set it, but reaffirm in case of partial state).
        gameState.allowCustomActions = true;
        await handleCustomAction(customChoice);
        // Record after completion so it doesn't double-record on errors.
        try { recordPlayerChoice(getCurrentPlayer()?.id, 'God Mode', customChoice, 1.0); } catch (_) {}
    } catch (error) {
        log(`God Mode: Error handling custom choice: ${error.message}`);
        UI.showPopup('An error occurred while processing your divine command.', 'error', 3000);
    }
}

// Make handleGodModeChoice available globally for UI
if (typeof window !== 'undefined') {
    window.handleGodModeChoice = handleGodModeChoice;
}

/** HP, coins and item names per player, to diff before/after a turn. */
function snapshotParty() {
    return (gameState.players || []).map(p => ({
        name: p.name, hp: p.hp ?? 0, coins: p.coins ?? 0,
        items: (p.inventory || []).map(i => i?.name).filter(Boolean)
    }));
}

/**
 * "Vincent: -12 HP, +19 coins, found Rusty Cutlass" for the acting player,
 * plus any other player whose numbers changed this turn ("·"-separated).
 */
export function formatTurnRecap(before, after, actorName) {
    const parts = [];
    after.forEach((a, i) => {
        const b = before[i] || { hp: a.hp, coins: a.coins, items: a.items };
        const bits = [];
        const dHp = a.hp - b.hp, dCoins = a.coins - b.coins;
        if (dHp) bits.push(`${dHp > 0 ? '+' : '\u2212'}${Math.abs(dHp)} HP`);
        if (dCoins) bits.push(`${dCoins > 0 ? '+' : '\u2212'}${Math.abs(dCoins)} coins`);
        const remaining = [...b.items];
        const gained = a.items.filter(n => { const k = remaining.indexOf(n); if (k >= 0) { remaining.splice(k, 1); return false; } return true; });
        if (gained.length) bits.push(`found ${gained.join(', ')}`);
        if (remaining.length) bits.push(`used ${remaining.join(', ')}`);
        if (bits.length) parts.push(`${a.name}: ${bits.join(', ')}`);
        else if (a.name === actorName) parts.push(`${a.name}: no change`);
    });
    return parts.join(' \u00b7 ');
}

export async function handlePlayerChoice(actionType, choiceText) {
    const log = window.displayVisualError || console.log;
    log(`Handling player choice: ${actionType} - ${choiceText}`);
    let recapBefore = null, recapActor = null; // set once the turn actually starts
    let heroBeforeRoll = null; // the hero before an exploration roll, put back if the story never comes

    try {
        if (gameState.isLoading || !canCurrentPlayerAct()) {
            const reason = gameState.isLoading ? "Game is loading" : "Current player cannot act";
            log(`Action blocked: ${reason}`);
            if (!gameState.isLoading) { UI.showPopup("Cannot act now.", "warning"); }
            return;
        }

        // Turn lock: held until this turn's AI calls have actually finished
        // (released in finally), so a slow reply can't overlap the next turn.
        gameState.isLoading = true;
        recapBefore = snapshotParty();
        recapActor = getCurrentPlayer()?.name;

        // Show loading indicator and disable choices to prevent multiple clicks
        UI.showLoading(true, 'Processing your choice...');
        if (typeof UI.disableChoices === 'function') {
            UI.disableChoices();
        }

        // Initialize narrative context if it doesn't exist
        if (!gameState.narrativeContext) {
            gameState.narrativeContext = {
                lastAction: null,
                lastOutcome: null,
                discoveredSecrets: [],
                significantEvents: [],
                relationshipChanges: []
            };
        }

        const currentPlayer = getCurrentPlayer();
        if (!currentPlayer) {
            throw new Error("Could not get current player.");
        }

        // Store the action in narrative context
        gameState.narrativeContext.lastAction = {
            type: actionType,
            text: choiceText,
            player: currentPlayer.name,
            turn: gameState.turn
        };

        // Get current context for outcome determination
        const context = determineContext(currentPlayer);
        
        let success;
        // What the game already rolled this turn, told to the narrator so the
        // prose matches the popups (it used to see only "Success: Yes/No").
        const outcomeNotes = [];
        
        // Process the action based on type
        log(`[HPC-DIAG] At branch decision: inCombat=${gameState.inCombat}, combat.isActive=${gameState.combat?.isActive}, enemies=${gameState.enemies?.filter(e=>!e.isDefeated)?.length || 0}, actionType=${actionType}`);
        if (gameState.inCombat) {
            // ===== Combat branch (Phase 0 implementation) =====
            // INSTRUMENTED for smoke #6 — every step logs a [CB-N] marker so
            // we can see the exact line where the recurring Item-in-combat
            // hang happens. Remove these markers once the bug is identified.
            // Step markers only when something went wrong (each fight round wrote ~15 lines).
            const cbStep = (n, extra) => { if (/caught|fail|error|timeout|not found|no valid/i.test(extra || '')) log(`[CB-${n}] ${actionType} ${extra}`); };
            cbStep(1, 'enter combat branch');
            // Keep the fight visible while the moves resolve (the dark loading
            // screen hid both actions, so they seemed to happen at once); it
            // comes back only while the story of the round is written.
            UI.showLoading(false);
            gameState.combatRoundInProgress = true; // cleared in finally
            if (gameState.combat) gameState.combat.heroTicked = false; // set if this hero's combat turn ticks (see advanceTurn afterCombat)

            // Special-move cooldowns count down once per combat action
            // (turnManager only ticks them on exploration turns).
            (currentPlayer.specialMoves || []).forEach(m => { if (m && m.currentCooldown > 0) m.currentCooldown--; });

            // Master timeout: if the entire combat branch takes >180s, render
            // fallback choices and bail. This is a final safety net beyond
            // the per-step timeouts.
            const COMBAT_BRANCH_DEADLINE = Date.now() + 180000;

            const aliveEnemies = (gameState.enemies || []).filter(e => !e.isDefeated);
            cbStep(2, `aliveEnemies=${aliveEnemies.length}`);
            if (aliveEnemies.length === 0) {
                log("Combat is active but no enemies remain — exiting combat.");
                gameState.inCombat = false;
                if (gameState.combat) gameState.combat.isActive = false;
                UI.renderEnemyCards();
            } else {
                // BUG-27 fix: parse the chosen text for an enemy name. If
                // the player picked "Strike the goblin shaman" while a slime
                // is also alive, target the goblin shaman, not enemies[0].
                // Falls back to enemies[0] when no name match is found.
                let target = aliveEnemies[0];
                try {
                    const lower = String(choiceText || '').toLowerCase();
                    const named = aliveEnemies.find(e => {
                        const n = String(e?.name || '').toLowerCase();
                        return n && lower.includes(n);
                    });
                    if (named) {
                        target = named;
                        cbStep('TGT', `name-match: ${named.name}`);
                    }
                } catch (_) { /* keep enemies[0] fallback */ }
                let combatLog = '';
                // Stun/Paralysis/Sleep: the hero loses this turn whatever they
                // picked (before, only Attack was blocked; Item and Run worked).
                const disabled = (currentPlayer.statusEffects || []).find(fx => fx?.duration > 0 && fx.effectTickData?.cannotAct);
                if (disabled) actionType = 'Disabled';
                // Silence: no spells or special moves (Power Strike is a plain blow, still fine).
                const silenced = !Combat.canCharacterUseAbilities(currentPlayer);
                if (silenced && (actionType === 'Spell' || (actionType === 'Special' && !/^power strike/i.test(String(choiceText || ''))))) actionType = 'Silenced';
                // Slow / Frost: every other turn is lost. Confusion: a blow may land on yourself or an ally.
                if (actionType !== 'Disabled' && Combat.isSluggish(currentPlayer)) actionType = 'Sluggish';
                const offensive = ['Attack', 'Special', 'Spell'].includes(actionType);
                const foeHpBefore = (gameState.enemies || []).reduce((s, e) => s + (e?.hp || 0), 0);
                if (offensive && Combat.confusedRoll(currentPlayer)) actionType = 'Confused';

                switch (actionType) {
                    case 'Sluggish':
                        combatLog = `${currentPlayer.name} is too sluggish to act this turn.`;
                        break;
                    case 'Confused': {
                        const allies = gameState.players.filter(p => p && !p.isDowned);
                        const victim = allies[Math.floor(Math.random() * allies.length)] || currentPlayer;
                        const dmg = Math.max(1, Math.round((currentPlayer.atk || 5) * 0.6 - (victim.def || 0) * 0.3));
                        victim.hp = Math.max(0, victim.hp - dmg);
                        if (victim.hp <= 0) victim.isDowned = true;
                        combatLog = victim === currentPlayer
                            ? `${currentPlayer.name} is confused and hits themselves (−${dmg}).`
                            : `${currentPlayer.name} is confused and strikes ${victim.name} (−${dmg}).`;
                        break;
                    }
                    case 'Defend': {
                        // Guard until this hero's next turn (the status ticks at the end of
                        // this turn and the next): half damage from every hit, plus a breather.
                        Combat.applyStatusEffect(currentPlayer, 'Guarding', 2, {}, 'Defend');
                        const before = currentPlayer.hp;
                        currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + Math.max(2, Math.round((currentPlayer.maxHp || 100) * 0.05)));
                        currentPlayer.mp = Math.min(currentPlayer.maxMp || 0, (currentPlayer.mp || 0) + 2);
                        combatLog = `${currentPlayer.name} braces behind their guard (half damage until their next turn, +${currentPlayer.hp - before} HP).`;
                        break;
                    }
                    case 'Disabled':
                        combatLog = `${currentPlayer.name} is held by ${disabled.name} and loses the turn.`;
                        break;
                    case 'Silenced':
                        combatLog = `${currentPlayer.name} is silenced: no spells or special moves, and the moment passes.`;
                        break;
                    case 'Attack': {
                        const r = Combat.executeWeaponAttack(currentPlayer, target);
                        if (r.missed || r.blocked) Media.play('miss'); // a hit is heard from fx.js (every HP change)
                        if (r.missed) combatLog = `${currentPlayer.name} swings at ${target.name} and misses.`;
                        else if (r.blocked) combatLog = `${target.name} blocks ${currentPlayer.name}'s strike.`;
                        else combatLog = `${currentPlayer.name} hits ${target.name} for ${r.actualDamage} ${r.element || ''} damage.`;
                        break;
                    }

                    case 'Special': {
                        const ready = (currentPlayer.specialMoves || []).filter(m => (m.currentCooldown || 0) <= 0);
                        const lowerChoice = String(choiceText || '').toLowerCase();
                        // "Power Strike" picked from the battle menu, or no learned move ready.
                        const move = lowerChoice.startsWith('power strike') ? null
                            : (ready.find(m => m.name && lowerChoice.includes(m.name.toLowerCase())) || ready[0]);
                        if (!move) {
                            // No learned move (most heroes early on): a Power Strike,
                            // a heavy hit usable every other round. Before, Special
                            // with no moves did nothing and wasted the turn.
                            const round = gameState.combat?.round || 0;
                            const ready = round - (currentPlayer.lastPowerStrikeRound ?? -99) >= 2;
                            const r = Combat.executeWeaponAttack(currentPlayer, target, {});
                            let total = r.actualDamage || 0;
                            if (ready && !r.missed && !r.blocked) {
                                const before = target.hp;
                                target.hp = Math.max(0, target.hp - Math.max(4, Math.round(total * 0.8)));
                                total += before - target.hp;
                                currentPlayer.lastPowerStrikeRound = round;
                            }
                            combatLog = r.missed ? `${currentPlayer.name}'s power strike misses ${target.name}.`
                                : ready ? `${currentPlayer.name} lands a Power Strike on ${target.name} for ${total} damage!`
                                : `${currentPlayer.name} is still winded from the last power strike and hits ${target.name} for ${total}.`;
                        } else if ((move.mpCost || 0) > (currentPlayer.mp || 0)) {
                            combatLog = `${currentPlayer.name} reaches for ${move.name} but doesn't have enough MP.`;
                        } else {
                            // Special: 1.5x a weapon hit, plus the move's own damage
                            // (narrator/god-mode moves carry mechanics.directDamage),
                            // plus its status effects. Before, it was a plain attack.
                            const r = Combat.executeWeaponAttack(currentPlayer, target, {});
                            if (!r.missed && !r.blocked) {
                                const bonus = Math.round((r.actualDamage || 0) * 0.5)
                                    + (Number(move.mechanics?.directDamage ?? move.mechanics?.damage) || 0);
                                const before = target.hp;
                                target.hp = Math.max(0, target.hp - bonus);
                                r.actualDamage = (r.actualDamage || 0) + (before - target.hp);
                                for (const fx of [].concat(move.mechanics?.statusEffects || [])) {
                                    const name = typeof fx === 'string' ? fx : fx?.name;
                                    const dur = (typeof fx === 'object' && fx?.duration) || Combat.lookupStatusEffect(name)?.defaultDuration || 3;
                                    if (name) Combat.applyStatusEffect(target, name, dur, (typeof fx === 'object' && fx?.effectTickData) || {}, move.name);
                                }
                            }
                            move.currentCooldown = move.cooldown || 2;
                            const mpCost = move.mpCost || 0;
                            if (mpCost) currentPlayer.mp = Math.max(0, (currentPlayer.mp || 0) - mpCost);
                            combatLog = r.missed
                                ? `${currentPlayer.name} unleashes ${move.name} but misses ${target.name}.`
                                : `${currentPlayer.name} uses ${move.name} on ${target.name} for ${r.actualDamage || 0} damage!`;
                        }
                        break;
                    }

                    case 'Item': {
                        cbStep('3-Item', 'enter Item case');
                        const usable = (currentPlayer.inventory || []).filter(i => i && i.type === 'Consumable' && !i.stats?.revive && (i.quantity == null || i.quantity > 0));
                        const lowerChoice = String(choiceText || '').toLowerCase();
                        // The item the choice names, else one that heals, else any consumable.
                        // "Catch a breath" (battle menu, empty pack) uses nothing.
                        const item = lowerChoice.startsWith('catch a breath') ? null
                            // Longest name first: "Use Greater Potion" must not pick "Potion".
                            : ([...usable].sort((a, b) => String(b.name).length - String(a.name).length).find(i => i.name && lowerChoice.includes(i.name.toLowerCase()))
                            || usable.find(i => (i.stats?.heal || 0) + (i.stats?.healPercent || 0) > 0)
                            || usable[0]);
                        cbStep('3-Item', `item=${item?.name || 'NONE'}`);
                        if (!item) {
                            // Nothing usable left: catch a breath instead of a wasted turn.
                            const before = currentPlayer.hp;
                            currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + Math.max(4, Math.round((currentPlayer.maxHp || 100) * 0.08)));
                            combatLog = `${currentPlayer.name} finds no usable items and catches a breath (+${currentPlayer.hp - before} HP).`;
                        } else {
                            Items.inferItemEffects(item); // an older item with only words gets real effects
                            const heal = item.stats?.heal || 0;
                            const healPct = item.stats?.healPercent || 0;
                            const totalHeal = Math.round((heal + (currentPlayer.maxHp || 100) * healPct) * Progression.kindHealing(currentPlayer)); // Kind: +10% per point
                            const parts = [];
                            if (item.stats?.throwStatus) {
                                // Bombs, darts, powders: thrown at the foe, never at the hero.
                                const st = item.stats.throwStatus;
                                Combat.applyStatusEffect(target, st, Combat.lookupStatusEffect(st)?.defaultDuration || 3, {}, item.name);
                                const before = target.hp; target.hp = Math.max(0, target.hp - 5);
                                parts.push(`throws ${item.name} at ${target.name} (${before - target.hp} damage, ${st})`);
                            }
                            if (totalHeal > 0) {
                                const oldHp = currentPlayer.hp;
                                currentPlayer.hp = Math.min(currentPlayer.maxHp, currentPlayer.hp + totalHeal);
                                parts.push(`restores ${currentPlayer.hp - oldHp} HP`);
                            }
                            for (const st of [].concat(item.stats?.applyStatus || [])) {
                                Combat.applyStatusEffect(currentPlayer, st, Combat.lookupStatusEffect(st)?.defaultDuration || 3, {}, item.name);
                                parts.push(`gains ${st}`);
                            }
                            if (item.stats?.cure) {
                                const cure = item.stats.cure;
                                const n0 = (currentPlayer.statusEffects || []).length;
                                currentPlayer.statusEffects = (currentPlayer.statusEffects || []).filter(fx => cure !== 'All' && ![].concat(cure).includes(fx.name));
                                if (n0 !== currentPlayer.statusEffects.length) parts.push(`is cured`);
                            }
                            parts.push(...applyItemExtras(currentPlayer, item));
                            combatLog = `${currentPlayer.name} ${parts.length ? parts.join(', ') : `uses ${item.name}`}.`;
                            // Decrement / remove
                            if (item.quantity != null) {
                                item.quantity = Math.max(0, item.quantity - 1);
                                if (item.quantity === 0) {
                                    currentPlayer.inventory = currentPlayer.inventory.filter(i => i.id !== item.id);
                                }
                            } else {
                                currentPlayer.inventory = currentPlayer.inventory.filter(i => i.id !== item.id);
                            }
                        }
                        cbStep('3-Item', 'done');
                        break;
                    }

                    case 'Spell': {
                        // Cast button / spellbook in a fight (see spellUI.js).
                        const spells = currentPlayer.spellcasting?.knownSpells || [];
                        const said = String(choiceText || '').toLowerCase();
                        const spell = spells.find(sp => sp?.name && said.includes(sp.name.toLowerCase()));
                        if (!spell) { combatLog = `${currentPlayer.name} reaches for a spell but the words won't come.`; break; }
                        const SpellCasting = await import('./spellCasting.js');
                        // Healing/self spells land on the caster, not the foe.
                        const selfCast = spell.targeting === 'self' || (spell.effects?.healing > 0 && !(spell.effects?.damage > 0));
                        const res = await SpellCasting.castSpell(currentPlayer, spell, selfCast ? currentPlayer : target);
                        combatLog = res?.success
                            ? `${currentPlayer.name} casts ${spell.name}!`
                            : `${currentPlayer.name} tries ${spell.name} but it fizzles (${res?.reason || 'failed'}).`;
                        break;
                    }

                    case 'Run': {
                        // Like the classics: no running from the boss.
                        if ((gameState.enemies || []).some(e => e.isBoss && !e.isDefeated && e.hp > 0)) {
                            combatLog = `${currentPlayer.name} looks for a way out, but there is no escaping this fight!`;
                            break;
                        }
                        const fled = Math.random() < (Config.FLEE_CHANCE ?? 0.4) + 0.05 * Progression.statOf(currentPlayer, 'sneaky'); // Sneaky slips away
                        if (fled) {
                            combatLog = `${currentPlayer.name} successfully escapes from combat.`;
                            gameState.inCombat = false;
                            if (gameState.combat) gameState.combat.isActive = false;
                            gameState.enemies = [];
                            UI.renderEnemyCards();
                        } else {
                            combatLog = `${currentPlayer.name} tries to flee but stumbles, losing the moment.`;
                        }
                        break;
                    }

                    default:
                        combatLog = `${currentPlayer.name} acts: ${choiceText}.`;
                }

                // Haste: a quick half-power follow-up strike after an attack, special or spell.
                const landed = (gameState.enemies || []).reduce((s, e) => s + (e?.hp || 0), 0) < foeHpBefore;
                if (offensive && landed && actionType !== 'Confused' && Combat.speedModOf(currentPlayer) > 0) {
                    const foe = (target && !target.isDefeated && target.hp > 0) ? target : (gameState.enemies || []).find(e => e && !e.isDefeated && e.hp > 0);
                    if (foe) {
                        const dmg = Math.max(1, Math.round(((currentPlayer.atk || 5) - (foe.def || 0) * 0.5) * 0.5));
                        foe.hp = Math.max(0, foe.hp - dmg);
                        if (foe.hp <= 0) foe.isDefeated = true;
                        combatLog += ` Hasted, ${currentPlayer.name} strikes again: ${foe.name} −${dmg}.`;
                    }
                }

                // Loot + coins for anything the player's action just killed.
                for (const e of (gameState.enemies || [])) {
                    if (e && (e.isDefeated || e.hp <= 0) && !e.defeatProcessed) {
                        try { await Combat.handleEnemyDefeat(e.id); } catch (err) { log(`handleEnemyDefeat failed: ${err.message}`); }
                    }
                }

                cbStep(4, 'switch done, calling showPopup + combat log');
                // (no toast: the combat log strip below shows this same line)
                // P4: stream mechanical event to in-game combat log strip
                try {
                    const kind = actionType === 'Attack' || actionType === 'Special' ? 'attack'
                        : actionType === 'Item' ? 'item'
                        : actionType === 'Run' ? 'flee'
                        : 'system';
                    if (typeof UI.appendCombatLog === 'function') UI.appendCombatLog(combatLog, kind);
                } catch (_) {}
                cbStep(5, 'showPopup ok, renderPlayerCards');
                try { UI.renderPlayerCards(); } catch(e) { cbStep(5, `renderPlayerCards THREW: ${e?.message}`); }
                cbStep(6, 'renderPlayerCards ok, renderEnemyCards');
                try { UI.renderEnemyCards(); } catch(e) { cbStep(6, `renderEnemyCards THREW: ${e?.message}`); }
                cbStep(7, `Combat: ${combatLog}`);

                // Resolve win/wipe; otherwise let combat system advance to enemy turn(s).
                if (Combat.areAllEnemiesDefeated()) {
                    cbStep(8, 'all enemies defeated, exiting combat');
                    gameState.inCombat = false;
                    if (gameState.combat) gameState.combat.isActive = false;
                } else if (gameState.inCombat && !Combat.isPartyWiped()) {
                    cbStep(8, 'calling advanceCombatTurn (enemy phase)');
                    await new Promise(r => setTimeout(r, 700)); // let the hero's hit land before the foe answers
                    try {
                        await Combat.advanceCombatTurn();
                        cbStep(9, 'advanceCombatTurn returned ok');
                    } catch (e) {
                        cbStep(9, `advanceCombatTurn caught: ${e?.message || e}`);
                    }
                }

                // Party wiped (now or during the enemy phase): hand over to the
                // jail / game-over flow, which runs its own narration. Before,
                // this waited for advanceTurn, which never runs in combat, so a
                // solo game got stuck on "Cannot act now".
                if (Combat.isPartyWiped()) {
                    cbStep(8, 'party wiped -> handlePartyWipe');
                    gameState.inCombat = false;
                    if (gameState.combat) gameState.combat.isActive = false;
                    const { handlePartyWipe } = await import('./resolution.js');
                    await handlePartyWipe();
                    return;
                }
                if (!gameState.inCombat) {
                    gameState.consecutiveWipes = 0;
                    try { UI.clearCombatLog?.(); } catch (_) {}
                }
                cbStep(10, `building combatActionLog (deadline left: ${COMBAT_BRANCH_DEADLINE - Date.now()}ms)`);

                // Ask the narrator to dramatize the round and give the next choices.
                const enemiesAfter = (gameState.enemies || []).filter(e => !e.isDefeated);
                const combatActionLog = `[Combat Round]
Player: ${currentPlayer.name} (HP ${currentPlayer.hp}/${currentPlayer.maxHp}, MP ${currentPlayer.mp || 0}/${currentPlayer.maxMp || 0})
Action chosen: ${actionType} — "${choiceText}"
Mechanical outcome: ${combatLog}
Active enemies: ${enemiesAfter.map(e => `${e.name} (HP ${e.hp}/${e.maxHp})`).join(', ') || 'None — combat ended.'}
Combat status: ${gameState.inCombat ? 'Ongoing' : 'Ended'}

Fight round ${gameState.combat?.round || 1}. Narrate this round so the fight CHANGES: the foe adapts or tries something new, the ground or weather shifts, a hazard, an object or a bystander gets involved. Never describe the same blow or the same reaction as an earlier round.${averagePartyAge() < 15 && !Config.injuryDetailOn() ? ' Kid-safe: no blood or wounds; show hits by their effect.' : ''} Never write HP, MP or other game numbers in the story. Then provide ${gameState.inCombat ? '4 combat choices (Attack/Special/Item/Run)' : '5 exploration choices (one per approach, each with a danger)'} as JSON.`;

                cbStep(11, 'showLoading + AI call');
                UI.showLoading(true, 'Combat unfolding...');
                let renderedChoices = false;
                try {
                    // Advance the turn only when this round ended the fight.
                    const inCombatBeforeCall = gameState.inCombat;
                    const aiResponse = await makeAICallForSystemAction(combatActionLog, inCombatBeforeCall);
                    // The narrator's diff can also finish enemies off (or end the
                    // fight). Pay out their loot too, and advance the turn the
                    // call above skipped because combat was still on.
                    for (const e of (gameState.enemies || [])) {
                        if (e && (e.isDefeated || e.hp <= 0) && !e.defeatProcessed) {
                            try { await Combat.handleEnemyDefeat(e.id); } catch (err) { log(`handleEnemyDefeat failed: ${err.message}`); }
                        }
                    }
                    if (inCombatBeforeCall && (!gameState.inCombat || Combat.areAllEnemiesDefeated())) {
                        gameState.inCombat = false;
                        if (gameState.combat) gameState.combat.isActive = false;
                        // The hero who just fought: the combat turn order may already
                        // have passed the turn on, and advancing from there skipped
                        // the next hero (Ava attacked, Ben was up, the turn went back to Ava).
                        const fighter = Math.max(0, gameState.players.indexOf(currentPlayer));
                        gameState.currentPlayerIndex = fighter;
                        // Skip the round tick only if this hero's combat turn already ticked
                        // (the storyteller ended the fight after the enemy phase); a killing
                        // blow ends it before any combat tick, so that round still ticks once.
                        await advanceTurn({ afterCombat: !!gameState.combat?.heroTicked });
                        // The reply's choices were written for the fighter; with 2+
                        // players the turn has just passed to someone else.
                        if (gameState.players.length > 1 && gameState.currentPlayerIndex !== fighter) {
                            try {
                                const { requestChoicesOnly } = await import('./aiHandler.js');
                                const fresh = await requestChoicesOnly(gameState.currentNarrative, false, getCurrentPlayer()?.name);
                                gameState.currentChoices = fresh;
                                UI.renderChoices(fresh);
                                renderedChoices = true; // the fighter's choices below must not replace these
                            } catch (err) { log(`Post-fight choices for next hero failed: ${err.message}`); }
                        }
                    }
                    cbStep(12, `AI call returned, choices=${aiResponse?.choices?.length || 0}`);
                    const choices = aiResponse?.choices;
                    if (!renderedChoices && Array.isArray(choices) && choices.length > 0) {
                        UI.renderChoices(choices);
                        renderedChoices = true;
                        cbStep(13, 'rendered AI choices');
                    }
                } catch (e) {
                    cbStep(12, `AI call caught: ${e?.message || e}`);
                } finally {
                    UI.showLoading(false);
                    cbStep('11-finally', 'showLoading(false)');
                }
                // Winning the fight after the final confrontation began IS the
                // final blow, even if the narrator forgot the milestone.
                if (!gameState.inCombat && !gameState.isGoalComplete) {
                    const names = (gameState.questProgress?.milestones || []).map(m => String(m.name || ''));
                    // Or the named villain just fell (live 2-player run: boss at
                    // 0 HP, no final_confrontation milestone, quest never ended).
                    const villain = String(gameState.questProgress?.villain || '').toLowerCase().replace(/^the\s+/, '');
                    const villainDown = !!villain && (gameState.enemies || []).some(e => e.isBoss && (e.isDefeated || e.hp <= 0)
                        && (n => !!n && (n.includes(villain) || villain.includes(n)))(String(e.name || '').toLowerCase().replace(/^the\s+/, '')));
                    if ((names.includes('final_confrontation') || villainDown) && !names.includes('final_blow')) {
                        const { applyDiff } = await import('./engine.js');
                        applyDiff([{ op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow', description: 'The final foe is defeated.' } }], { strict: false });
                    }
                }
                // SMOKE-FIX: never leave the player with no choices. If the
                // narrator call failed, timed out, or returned an empty list,
                // fall back to generic mode-appropriate choices so the loop
                // can continue.
                if (!renderedChoices) {
                    const fallback = gameState.inCombat
                        ? [
                            { type: 'Attack',  text: 'Press the attack — strike again.' },
                            { type: 'Special', text: 'Try a special move if one is ready.' },
                            { type: 'Item',    text: 'Use an item from your pack.' },
                            { type: 'Run',     text: 'Try to break off and flee.' }
                        ]
                        : Progression.fallbackChoices(gameState.choicePlan);
                    UI.renderChoices(fallback);
                    cbStep(14, `rendered ${fallback.length} fallback choices`);
                }
                document.querySelectorAll('#choicesContainer .choice-btn').forEach(b => { b.disabled = false; });
                cbStep(15, 'force-enabled all buttons; combat branch returning');
            }
            return; // combat branch is fully handled here
        } else {
            // Handle exploration/story action with standard processing
            // A skill check (progression.js): d20 + the stat this kind of choice
            // uses, against its difficulty; the odds were shown on the button.
            // Coins, HP, items and XP follow from the result, never at random.
            const checkType = validateAndMapActionType(actionType);
            Progression.ensureStats(currentPlayer);
            heroBeforeRoll = JSON.parse(JSON.stringify(currentPlayer));
            // The button sends the text without markdown (ui.js); two choices can
            // share a danger, so match the text, cleaned the same way.
            const plainText = (t) => String(t || '').replace(/\*\*|__|`/g, '').trim();
            const chosen = (gameState.currentChoices || []).find(c => c?.type === actionType && plainText(c.text) === plainText(choiceText))
                || (gameState.currentChoices || []).find(c => c?.type === actionType);
            const roll = Progression.rollCheck(checkType, currentPlayer, Math.random, chosen?.stat);
            const result = Progression.outcomeFor(roll, currentPlayer);
            const won = roll.band === 'success' || roll.band === 'crit';
            success = won || roll.band === 'partial';
            gameState.narrativeContext.lastOutcome = { success, band: roll.band, roll, context };
            const statName = roll.stat ? Progression.STATS[roll.stat].name : 'Luck';
            UI.showPopup(`🎲 ${statName}: ${Progression.describeRoll(roll)}`, won ? 'success' : roll.band === 'partial' ? 'info' : 'warning', 3500);
            Media.play('dice');
            if (roll.band === 'crit') setTimeout(() => { Media.play('crit'); Media.buzz([30, 40, 60]); }, 450);
            else if (roll.band === 'fumble') setTimeout(() => { Media.play('fumble'); Media.buzz(80); }, 450);
            outcomeNotes.push(`${statName} check ${Progression.describeRoll(roll)}`);

            if (result.hpLoss > 0) {
                // Exploration never knocks a hero out (worst case 1 HP).
                const before = currentPlayer.hp;
                currentPlayer.hp = Math.max(Math.min(1, before), before - result.hpLoss);
                UI.showPopup(`Lost ${before - currentPlayer.hp} HP!`, 'damage');
                outcomeNotes.push(`lost ${before - currentPlayer.hp} HP (now ${currentPlayer.hp}/${currentPlayer.maxHp})`);
            }
            if (result.heal > 0) {
                const before = currentPlayer.hp;
                currentPlayer.hp = Math.min(currentPlayer.maxHp, before + Math.round(result.heal * Progression.kindHealing(currentPlayer)));
                if (currentPlayer.hp > before) { UI.showPopup(`Gained ${currentPlayer.hp - before} HP!`, 'heal'); outcomeNotes.push(`regained ${currentPlayer.hp - before} HP (someone grateful patched them up)`); }
            }
            if (result.coins !== 0) {
                const before = currentPlayer.coins || 0;
                currentPlayer.coins = Math.max(0, before + result.coins);
                const d = currentPlayer.coins - before;
                if (d > 0) { UI.showPopup(`${result.jackpot ? '💰 Jackpot! ' : ''}Found ${d} coins!`, result.jackpot ? 'legendary' : 'coins'); outcomeNotes.push(`found ${d} coins${result.note ? ` (${result.note})` : ''}`); }
                else if (d < 0) { UI.showPopup(`Lost ${-d} coins!`, 'warning'); outcomeNotes.push(`lost ${-d} coins`); }
            } else if (result.note) outcomeNotes.push(`found ${result.note}`);
            if (result.item) {
                // Never below the tier for the party's level (finds were Low/Medium at any level).
                const tier = Items.betterTier(getRandomElement(result.item.tierPool), Items.lootTierFor(Items.partyLevel()));
                const newItem = Items.generateThemedItem(gameState.adventureTheme, tier, getRandomElement(result.item.typePool));
                if (newItem) {
                    currentPlayer.inventory.push(newItem);
                    UI.showPopup(`Found ${newItem.name}!`, 'item');
                    outcomeNotes.push(`found ${newItem.name} (already in the inventory)`);
                }
            }
            if (result.charm) {
                const charm = Items.makeLuckyCharm(gameState.adventureTheme, result.charm);
                currentPlayer.inventory.push(charm);
                const fused = Progression.fuseCharms(currentPlayer);
                UI.showPopup(fused ? `🍀 Found ${charm.name}: it fuses into ${fused.name}, luck ${fused.luck}!` : `🍀 Found ${charm.name}! Luck +${result.charm}`, 'legendary', 3500);
                outcomeNotes.push(`found ${charm.name}, a lucky charm${fused ? ` that fused into ${fused.name} (luck ${fused.luck})` : ''} (already in the inventory)`);
            }
            if (result.fluster) {
                Combat.applyStatusEffect(currentPlayer, 'Flustered', 3, {}, 'fumble');
                outcomeNotes.push(`${currentPlayer.name} is flustered (-2 on checks for a few turns)`);
            }
            // XP and growth: every check teaches something; successes build the stat.
            const levelsUp = Progression.gainXp(currentPlayer, result.xp, levelUp);
            UI.showPopup(`+${result.xp} XP`, 'skill', 1800);
            if (levelsUp) {
                UI.showPopup(`⭐ ${currentPlayer.name} reached level ${currentPlayer.level}! Choose a stat to raise.`, 'legendary', 4000);
                outcomeNotes.push(`${currentPlayer.name} reached level ${currentPlayer.level}`);
            }
            const grew = won ? Progression.addSpark(currentPlayer, roll.stat) : null;
            if (grew) {
                UI.showPopup(`${Progression.STATS[grew].icon} ${currentPlayer.name}'s ${Progression.STATS[grew].name} grew to ${currentPlayer.stats[grew]} from practice!`, 'legendary', 4000);
                outcomeNotes.push(`${currentPlayer.name}'s ${Progression.STATS[grew].name} grew from practice`);
            }

        }

        // Update UI
        UI.renderPlayerCards();
        UI.updateContextHeaders();

        // Record player choice for intelligent compression
        const choiceSignificance = calculateChoiceSignificance(actionType);
        recordPlayerChoice(currentPlayer.id, actionType, choiceText, gameState.narrativeContext.lastOutcome, choiceSignificance);
        
        // Record story beat if significant
        if (choiceSignificance >= 0.7) {
            recordStoryBeat('player_choice', `${currentPlayer.name} chose: ${choiceText}`, choiceSignificance, [currentPlayer.id]);
        }
        
        // Analyze character development impact
        if (gameState.characterDevelopmentAgent) {
            try {
                const choiceData = {
                    id: generateId('choice'),
                    type: actionType,
                    text: choiceText,
                    outcome: gameState.narrativeContext.lastOutcome,
                    significance: choiceSignificance,
                    turn: gameState.turn,
                    location: gameState.currentLocation?.name
                };
                
                // Async character development analysis (non-blocking).
                // BUG-23 fix: capture turn-tag so a stale resolution after
                // Exit-to-menu doesn't write into the post-reset gameState.
                const _tagCD = gameState.turn;
                gameState.characterDevelopmentAgent.analyzeCharacterDevelopment(currentPlayer.id, choiceData)
                    .then(developmentResult => {
                        if (gameState.turn !== _tagCD) return; // stale — drop
                        if (developmentResult?.narrativeInsights) {
                            log(`Character development: ${currentPlayer.name} - ${JSON.stringify(developmentResult.narrativeInsights)}`);
                        }
                    })
                    .catch(error => {
                        if (gameState.turn === _tagCD) log(`Character development analysis failed: ${error.message}`);
                    });
            } catch (error) {
                log(`Character development integration error: ${error.message}`);
            }
        }
        
        // Check God Mode unlock conditions
        if (gameState.godModeManager) {
            try {
                const unlocked = gameState.godModeManager.checkUnlockConditions();
                if (unlocked) {
                    log(`God Mode unlocked after player action!`);
                }
            } catch (error) {
                log(`God Mode unlock check failed: ${error.message}`);
            }
        }
        
        // Analyze world evolution impact
        if (gameState.worldEvolutionAgent) {
            try {
                const evolutionData = {
                    id: generateId('action'),
                    type: actionType,
                    text: choiceText,
                    outcome: gameState.narrativeContext.lastOutcome,
                    significance: choiceSignificance,
                    turn: gameState.turn,
                    location: gameState.currentLocation?.name
                };
                
                // Async world evolution analysis (non-blocking).
                // BUG-23 fix: turn-tag guard.
                const _tagWE = gameState.turn;
                gameState.worldEvolutionAgent.analyzeWorldEvolution(currentPlayer.id, evolutionData)
                    .then(evolutionResult => {
                        if (gameState.turn !== _tagWE) return; // stale — drop
                        if (evolutionResult?.evolutionEvent) {
                            log(`World evolution: ${evolutionResult.evolutionEvent.significance.toFixed(2)} significance - ${evolutionResult.evolutionEvent.immediateConsequences?.consequences?.length || 0} consequences`);
                        }
                    })
                    .catch(error => {
                        if (gameState.turn === _tagWE) log(`World evolution analysis failed: ${error.message}`);
                    });
            } catch (error) {
                log(`World evolution integration error: ${error.message}`);
            }
        }

        // The scene, location and recent turns are already in the turn prompt;
        // this says only what was chosen and what the game rolled.
        const outcomeText = outcomeNotes.length
            ? `
Already applied by the game (show these in the story; do not emit ops for them): ${outcomeNotes.join('; ')}.`
            : '';
        const lastRoll = gameState.narrativeContext.lastOutcome?.roll;
        const actionLog = `${currentPlayer.name} chose (${lastRoll ? `${lastRoll.stat ? Progression.STATS[lastRoll.stat].name : 'Luck'}, ${lastRoll.type}` : actionType}): "${choiceText}"
Result: ${(lastRoll && !lastRoll.stat
            // 🍀 an absurd long shot: spectacular when it works, a funny flop when not
            ? { crit: 'the absurd plan works so spectacularly that nobody will ever believe it', success: 'the absurd plan works spectacularly, better than anyone could have imagined', partial: 'the absurd plan sort of works, in a ridiculous way (show the cost)' }
            : { crit: 'a brilliant success', success: 'it works out', partial: 'it works, but at a cost (show the cost)' })[gameState.narrativeContext.lastOutcome?.band] || (gameState.narrativeContext.lastOutcome?.success ? 'it works out' : lastRoll && !lastRoll.stat ? 'it goes hilariously wrong: a funny complication, not a dead end' : 'it goes wrong: the story turns against them (a complication, not a dead end)')}.${outcomeText}`;
        gameState.lastActionMeta = { actor: currentPlayer.name, action: choiceText, success: !!gameState.narrativeContext.lastOutcome?.success, notes: outcomeNotes.join('; ') };

        log(`Constructed AI prompt with enhanced context: ${actionLog}`);


        // ROOT CAUSE FIX (smoke #6 finding):
        // If combat started DURING this exploration turn (narrator emitted
        // /enemies/- + /inCombat:true via the diff engine, OR a legacy
        // encounter spawned), the previous code did `return` without ever
        // rendering new choices. That left the UI with 4 disabled buttons
        // and "Processing your choice..." stuck forever — every smoke #1–6
        // hang was this exact sequence. Now we render combat choices and
        // return to a usable state.
        if (gameState.inCombat) {
            log('Combat started mid-exploration-turn — rendering combat choices.');
            UI.showLoading(false);
            UI.renderChoices([
                { type: 'Attack',  text: 'Strike the nearest enemy.' },
                { type: 'Special', text: 'Use a special ability.' },
                { type: 'Item',    text: 'Use an item from your pack.' },
                { type: 'Run',     text: 'Try to break off and flee.' }
            ]);
            document.querySelectorAll('#choicesContainer .choice-btn').forEach(b => { b.disabled = false; });
            return;
        }

        // Trigger AI for Narrative — wrap with hard 90s timeout so a stalled
        // llama-server can't deadlock the UI.
        UI.showLoading(true, 'Processing choice...');
        let aiResponse = null;
        try {
            aiResponse = await makeAICallForSystemAction(actionLog, false);
        } catch (e) {
            log(`Exploration AI call failed: ${e?.message || e}`);
        }
        // No story came back: undo the roll (coins, HP, XP, items, growth).
        // Phone 10-08, AI down: five taps in five seconds each paid out with
        // no story, so a down storyteller became free rewards (or free damage).
        if ((!aiResponse || aiResponse.failed) && heroBeforeRoll) {
            for (const k of Object.keys(currentPlayer)) if (!(k in heroBeforeRoll)) delete currentPlayer[k];
            Object.assign(currentPlayer, heroBeforeRoll);
            UI.renderPlayerCards();
            UI.showPopup("The storyteller didn't answer, so that roll was undone. Pick again in a moment.", 'info', 4000);
            log('Exploration roll undone (no story).');
        }
        // makeAICallForSystemAction already rendered choices via processAIResponse.
        // Only render here if aiResponse is null (90s timeout fired) to guarantee
        // the UI never hangs.
        if (!aiResponse?.choices || !Array.isArray(aiResponse.choices) || aiResponse.choices.length === 0) {
            log('Rendered fallback exploration choices (timeout or null response).');
            UI.renderChoices(Progression.fallbackChoices(gameState.choicePlan));
        }

    } catch (error) {
        log(`Error in handlePlayerChoice: ${error.message}`);
        UI.showPopup(`Action failed: ${error.message}`, "error");

        // Re-enable choices on error
        if (typeof UI.enableChoices === 'function') {
            UI.enableChoices();
        }

        // Re-render existing choices
        UI.renderChoices(gameState.currentChoices || []); // (empty call left only a dead placeholder)
    } finally {
        // BUG-30 fix: force-clear isLoading here. The 90s safety-net timeout
        // can fire before makeAICallForSystemAction's own finally runs, which
        // would leave isLoading=true even though the UI looks alive. With
        // isLoading stuck true, canCurrentPlayerAct returns false and every
        // subsequent click is silently rejected. UI shows fallback choices
        // but nothing responds. Clearing here covers that path.
        gameState.isLoading = false;
        gameState.combatRoundInProgress = false;
        if (recapBefore) {
            // The win reward is granted asynchronously; include it in this recap.
            if (gameState._rewardsPromise) {
                try { await gameState._rewardsPromise; } catch (_) {}
                delete gameState._rewardsPromise;
                // Quest just won: write the ending before god mode opens.
                // Locked while it's written, so no one clicks past the ending.
                gameState.isLoading = true;
                try { UI.showLoading(true, 'Writing the epilogue...'); await (await import('./aiHandler.js')).writeEpilogue(); }
                catch (e) { log(`Epilogue skipped: ${e.message}`); }
                finally { gameState.isLoading = false; }
            }
            try { UI.showTurnRecap(formatTurnRecap(recapBefore, snapshotParty(), recapActor)); } catch (_) {}
            try { (await import('./saveLoad.js')).autosave(); } catch (e) { log(`Autosave failed: ${e.message}`); }
        }
        UI.showLoading(false);
        try { UI.updateQuickActions(); } catch (_) { /* inventory/shop buttons were disabled by the lock */ }

        // FINAL SAFETY NET — guarantee the UI never hangs.
        // If the choices container is empty OR every button is disabled,
        // render mode-appropriate fallback choices and force-enable them.
        try {
            const container = document.getElementById('choicesContainer');
            const allBtns = container ? container.querySelectorAll('button') : [];
            const enabledBtns = container ? container.querySelectorAll('button:not([disabled])') : [];
            if (allBtns.length === 0 || enabledBtns.length === 0) {
                const fallback = gameState.inCombat
                    ? [
                        { type: 'Attack',  text: 'Strike the nearest enemy.' },
                        { type: 'Special', text: 'Use a special ability.' },
                        { type: 'Item',    text: 'Use an item from your pack.' },
                        { type: 'Run',     text: 'Try to break off and flee.' }
                    ]
                    : Progression.fallbackChoices(gameState.choicePlan);
                UI.renderChoices(fallback);
                document.querySelectorAll('#choicesContainer .choice-btn').forEach(b => { b.disabled = false; });
                log('Final safety net: rendered fallback choices because none were enabled.');
            }
        } catch (_) { /* never throw from a finally */ }
    }
}


/** An item's MP and permanent-stat effects (inventory and battle use). Returns what happened, for the story. */
function applyItemExtras(hero, item) {
    const parts = [];
    const st = item?.stats || {};
    const mp = Math.round((Number(st.mp) || 0) + (hero.maxMp || 0) * (Number(st.mpPercent) || 0));
    if (mp > 0) {
        const before = hero.mp || 0;
        hero.mp = Math.min(hero.maxMp || before + mp, before + mp);
        if (hero.mp > before) parts.push(`restores ${hero.mp - before} MP`);
    }
    for (const [stat, n] of Object.entries(st.statUp || {})) {
        if (!Progression.STATS[stat]) continue;
        Progression.ensureStats(hero);
        const before = hero.stats[stat];
        hero.stats[stat] = Math.min(Progression.STAT_MAX, before + (Number(n) || 0));
        if (hero.stats[stat] > before) parts.push(`${Progression.STATS[stat].name} rises to ${hero.stats[stat]}`);
    }
    if (st.statUp) { try { Combat.recalculateCharacterStats(hero); } catch (_) {} }
    return parts;
}

/**
 * Calculates the significance of a player choice for compression
 * @param {string} actionType - The type of action taken
 * @returns {number} Significance score (0.0 to 1.0)
 */
function calculateChoiceSignificance(actionType) {
    let significance = 0.3; // Base significance
    
    // Increase significance based on action type
    switch (actionType) {
        case 'Reckless':
            significance += 0.2;
            break;
        case 'Bold':
            significance += 0.1;
            break;
    }
    
    return Math.min(significance, 1.0);
}


/**
 * Validates and maps action types to ensure compatibility
 * @param {string} actionType - The action type from AI generation
 * @returns {string} Valid action type
 */
function validateAndMapActionType(actionType) {
    const log = window.displayVisualError || console.log;
    
    // Define valid action types
    const validTypes = [...Progression.DANGERS, ...Object.keys(Progression.LEGACY_TYPES), 'Attack', 'Special', 'Item', 'Run', 'Spell', 'Defend'];
    
    // If already valid, return as-is
    if (validTypes.includes(actionType)) {
        return actionType;
    }
    
    // Define fallback mappings for common AI variations
    const actionMappings = {
        'Explore': 'Safe',
        'Exploration': 'Safe',
        'Search': 'Safe',
        'Examine': 'Safe',
        'Investigate': 'Safe',
        'Look': 'Safe',
        'Study': 'Safe',
        'Inspect': 'Safe',
        'Combat': 'Attack',
        'Fight': 'Attack',
        'Battle': 'Attack',
        'Strike': 'Attack',
        'Hit': 'Attack',
        'Defensive': 'Safe',
        'Careful': 'Safe',
        'Cautious': 'Safe',
        'Dangerous': 'Reckless',
        'Foolish': 'Reckless',
        'Aggressive': 'Reckless',
        'Gamble': 'Bold',
        'Chance': 'Bold',
        'Risk': 'Bold',
        'Risky': 'Bold',
        'Funny': 'Bold',
        'Humorous': 'Bold',
        'Creative': 'Bold',
        'Weird': 'Bold',
        'Magic': 'Special',
        'Spell': 'Special',
        'Ability': 'Special',
        'Skill': 'Special',
        'Use': 'Item',
        'Consume': 'Item',
        'Drink': 'Item',
        'Eat': 'Item',
        'Escape': 'Run',
        'Flee': 'Run',
        'Retreat': 'Run',
        'Leave': 'Run'
    };
    
    // Check for mapping
    const mappedType = actionMappings[actionType];
    if (mappedType) {
        log(`ActionType: Mapped "${actionType}" -> "${mappedType}"`);
        return mappedType;
    }
    
    // If no mapping found, default to appropriate type based on context
    log(`ActionType: Unknown type "${actionType}", defaulting to "Safe"`);
    return 'Safe';
}


/**
 * Deterministic god-mode intent extractor. Parses the player's free-form
 * declaration and returns an array of JSON-Patch ops the engine should apply
 * BEFORE the narrator turn. The narrator (4B model) doesn't reliably honor
 * declarations like "I have a million gold" — this is the fallback that
 * guarantees the player's authorial power is real.
 *
 * Patterns are intentionally permissive: they surface intent even when the
 * player's phrasing is loose. False positives are bounded by the engine's
 * own validation.
 *
 * @param {string} text - the raw player input
 * @returns {Array} JSON-Patch ops to apply
 */
export function extractGodModeDiffOps(text) {
    const ops = [];
    const t = String(text || '');
    const lower = t.toLowerCase();
    const NUMS = { million: 1000000, thousand: 1000, hundred: 100 };

    // --- Coins ---
    // BUG-09 fix: distinguish "I have N gold" / "I now have N gold" (replace,
    // total = N) from "I gain N gold" / "give me N gold" (add, current + N).
    // Previously every variant was a replace, so a player at 50,000 gold who
    // typed "I gain 100 gold" got knocked DOWN to 100 — losing 49,900.
    //
    // Verb groups:
    //   replace → "have", "now have", "set", "wield" (state declarations)
    //   add     → "gain", "get", "give me", "grant me", "earn", "find" (deltas)
    let goldMatch = t.match(/\b(?:i (?:have|now have)|set my (?:gold|coins?))\s+(?:to\s+)?(?:a\s+)?([\d,]+|infinite|million|thousand|hundred|countless|endless)\s*(?:gold|coins?|silver|gp|pieces? of gold)\b/i);
    let goldVerb = goldMatch ? 'replace' : null;
    if (!goldMatch) {
        goldMatch = t.match(/\b(?:i (?:gain|get|earn|find)|give me|grant me)\s+(?:a\s+)?([\d,]+|infinite|million|thousand|hundred|countless|endless)\s*(?:gold|coins?|silver|gp|pieces? of gold)\b/i);
        goldVerb = goldMatch ? 'add' : null;
    }
    if (goldMatch) {
        const word = goldMatch[1].toLowerCase().replace(/,/g, '');
        let n = NUMS[word] ?? Number(word);
        if (!Number.isFinite(n) || /infinite|countless|endless/.test(word)) n = 99999;
        n = Math.min(99999, Math.max(0, n));
        if (goldVerb === 'add') {
            // Engine's coins handler is replace-only, so compute the sum here
            // and emit a replace with the capped total.
            n = Math.min(99999, (getCurrentPlayer()?.coins || 0) + n);
        }
        ops.push({ op: 'replace', path: '/players/0/coins', value: n });
    }

    // --- Stats (progression.js): "max stats", "my Brave is 5", "Clever 4" ---
    if (/\b(max(imum|ed)?|all)\s+(my\s+)?stats\b|\bstats\s+(to\s+)?max\b/i.test(t)) {
        for (const k of ['brave', 'clever', 'sneaky', 'kind']) ops.push({ op: 'replace', path: `/players/0/stats/${k}`, value: 5 });
    } else {
        for (const k of ['brave', 'clever', 'sneaky', 'kind']) {
            const m = t.match(new RegExp(`\\b(?:my\\s+)?${k}(?:ness)?\\s*(?:is\\s+(?:now\\s+)?|=|to\\s+|:\\s*)?(\\d)\\b`, 'i'));
            if (m) ops.push({ op: 'replace', path: `/players/0/stats/${k}`, value: Math.min(5, Number(m[1])) });
        }
    }

    // --- Health, mana, levels (live: "full health, level up" matched nothing) ---
    const me = getCurrentPlayer();
    if (me && /\b(full(y)?\s*(heal(th|ed)?|hp|health)|heal(ed)?(\s+(me|fully|completely))?|restore\s*(my\s*)?(hp|health)|max(imum)?\s*health)\b/i.test(t)) {
        ops.push({ op: 'replace', path: '/players/0/hp', value: me.maxHp || 100 });
    }
    if (me && /\b(full\s*(mana|mp)|restore\s*(my\s*)?(mana|mp)|max(imum)?\s*(mana|mp))\b/i.test(t)) {
        ops.push({ op: 'replace', path: '/players/0/mp', value: me.maxMp || 20 });
    }
    const lvlTo = t.match(/\b(?:to\s+)?level\s+(\d{1,3})\b/i);
    const lvlUp = t.match(/\blevels?\s*up(?:\s*(?:x\s*)?(\d{1,3}))?(?:\s*times)?\b/i) || t.match(/\bgain\s+(\d{1,3})\s+levels?\b/i);
    if (me && (lvlTo || lvlUp)) {
        const cur = me.level || 1;
        const target = lvlTo ? Number(lvlTo[1]) : cur + (Number(lvlUp[1]) || 1);
        if (target > cur) ops.push({ op: 'replace', path: '/players/0/level', value: Math.min(999, target) });
    }

    // --- New skill / spell / move ---
    // "I learn the Time Stop spell", "I cast Fireball", "I master Shadow Step technique"
    const skillMatch = t.match(/\b[Ii] (?:learn|master|cast|know|gain|acquire|Learn|Master|Cast|Know|Gain|Acquire)\s+(?:the\s+|The\s+)?([A-Z][A-Za-z' ]{1,40}?)\s+(?:spell|skill|move|technique|art|ability|power|Spell|Skill|Move|Technique)\b/);
    if (skillMatch) {
        const name = skillMatch[1].trim();
        const isAttackish = /(strike|blast|nova|fire|frost|shock|smite|bolt|lash|claw|fang|rend)/i.test(name);
        ops.push({
            op: 'add', path: '/players/0/specialMoves/-',
            value: {
                name,
                description: `god-mode skill: ${name}`,
                cooldown: 3, mpCost: 10,
                usageContext: 'both',
                mechanics: isAttackish ? { directDamage: 30 } : {}
            }
        });
    }

    // --- Stat modifications ---
    // "my max HP is now 500", "I gain 50 attack", "set my defense to 80"
    const maxHpMatch = t.match(/\b(?:my\s+)?max(?:imum)?\s*hp\s*(?:is\s+(?:now|set\s+to)|=|to|now|is)\s*(\d{1,5})\b/i)
        || t.match(/\bi (?:have|now have)\s+(\d{1,5})\s+(?:max\s+)?hp\b/i);
    // "I gain N ..." adds to what the hero has; "is now / set to N" sets it.
    const gainOf = (re, cur) => { const m = t.match(re); return m ? [m[0], String((Number(cur) || 0) + Number(m[1]))] : null; };
    const me0 = getCurrentPlayer();
    const maxHpGain = maxHpMatch ? null : gainOf(/\bi gain\s+(\d{1,5})\s+(?:max\s+)?hp\b/i, me0?.maxHp ?? 100);
    if (maxHpMatch || maxHpGain) {
        const n = Math.min(99999, Math.max(1, Number((maxHpMatch || maxHpGain)[1])));
        ops.push({ op: 'replace', path: '/players/0/maxHp', value: n });
        ops.push({ op: 'replace', path: '/players/0/hp', value: n });
    }
    const atkMatch = t.match(/\b(?:my\s+)?(?:atk|attack(?:\s*power)?|str(?:ength)?)\s*(?:is\s+(?:now|set\s+to)|=|to|now|is)\s*(\d{1,5})\b/i)
        || t.match(/\bi now have\s+(\d{1,5})\s+(?:atk|attack)\b/i)
        || gainOf(/\bi gain\s+(\d{1,5})\s+(?:atk|attack)\b/i, me0?.atk ?? 5);
    if (atkMatch) {
        const n = Math.min(99999, Math.max(0, Number(atkMatch[1])));
        ops.push({ op: 'replace', path: '/players/0/atk', value: n });
    }
    const defMatch = t.match(/\b(?:my\s+)?(?:def|defense|armor)\s*(?:is\s+(?:now|set\s+to)|=|to|now|is)\s*(\d{1,5})\b/i)
        || t.match(/\bi now have\s+(\d{1,5})\s+(?:def|defense)\b/i)
        || gainOf(/\bi gain\s+(\d{1,5})\s+(?:def|defense)\b/i, me0?.def ?? 2);
    if (defMatch) {
        const n = Math.min(99999, Math.max(0, Number(defMatch[1])));
        ops.push({ op: 'replace', path: '/players/0/def', value: n });
    }

    // --- New item (weapon / armor / consumable / misc) ---
    // "I wield the Singing Sword", "give me the Aegis of Dawn", "I have a Healing Potion of Light"
    // Item match: skip if gold match already fired (gold input shouldn't also create an item).
    const itemMatch = (goldMatch || skillMatch) ? null : t.match(/\b[Ii] (?:wield|hold|grip|wear|carry|have|gain|acquire|conjure|forge)\s+(?:the\s+|a\s+|an\s+|The\s+|A\s+|An\s+)?([A-Z][A-Za-z' -]{2,50}?)(?=[.,!?:;]|$|\s+(?:that|which|with))/);
    if (itemMatch) {
        const rawName = itemMatch[1].trim();
        const lname = rawName.toLowerCase();
        // Classify by keywords
        let type = 'Misc', stats = {};
        if (/(sword|blade|axe|hammer|spear|bow|staff|dagger|mace|scythe|wand|katana|halberd|glaive|whip|chakram|claw|fist|gauntlet)/i.test(lname)) {
            type = 'Weapon'; stats = { atk: /(legendary|mythic|godslayer|divine|cosmic|eternal)/i.test(lname) ? 60 : 24 };
        } else if (/(armor|plate|mail|shield|helm|robe|cloak|aegis|jerkin|tunic|cuirass|vestment|garb|raiment)/i.test(lname)) {
            type = 'Armor'; stats = { def: /(legendary|mythic|divine|cosmic|eternal)/i.test(lname) ? 50 : 22 };
        } else if (/(potion|elixir|tincture|brew|draught|salve|tonic|philter)/i.test(lname)) {
            type = 'Consumable'; stats = { heal: 30 };
        }
        // P6: pre-compute a deterministic id so we can reference it in a
        // follow-up auto-equip op within the same applyDiff batch. Engine's
        // equipment-replace path requires the item to already be in inventory
        // — which it will be, since ops apply sequentially.
        const itemId = `god_${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36)}`;
        ops.push({
            op: 'add', path: '/players/0/inventory/-',
            value: {
                id: itemId,
                name: rawName, type, tier: 'Special',
                effect: `god-mode artifact: ${rawName}`,
                stats
            }
        });
        ops.push({
            op: 'add', path: `/entityMemory/items/${rawName}`,
            value: { name: rawName, description: `Created by player in god mode.`, traits: ['god-mode-created'] }
        });
        // BUG-10 fix: previously ANY item declaration auto-equipped, kicking
        // out higher-stat earned legendaries when the player just said
        // "I have a small dagger". Now: only auto-equip when the verb
        // signals intent to USE it (wield/wear/grip — not have/carry), AND
        // only when the slot is empty OR the new item's stats clearly beat
        // what's equipped. "I have/carry" stays passive — adds to inventory
        // without touching equipment.
        const wieldVerb = /\bI (?:wield|hold|grip|wear|swap to|equip)\b/i.test(t);
        if (wieldVerb) {
            const slot = type === 'Weapon' ? 'weapon' : (type === 'Armor' ? 'armor' : null);
            if (slot && typeof gameState !== 'undefined') {
                const player = getCurrentPlayer(); // the acting hero (was always hero 1)
                const currentId = player?.equipment?.[slot] || null;
                let allowEquip = !currentId;   // empty slot → always equip
                if (currentId && player?.inventory) {
                    const cur = player.inventory.find(it => it && it.id === currentId);
                    const curStat = cur?.stats?.[slot === 'weapon' ? 'atk' : 'def'] || 0;
                    const newStat = stats?.[slot === 'weapon' ? 'atk' : 'def'] || 0;
                    if (newStat >= curStat) allowEquip = true;
                }
                if (allowEquip) {
                    ops.push({ op: 'replace', path: `/players/${gameState.currentPlayerIndex || 0}/equipment/${slot}`, value: itemId });
                }
            } else if (slot) {
                // Fallback path when gameState isn't accessible: equip anyway
                // for the wield verb (matches old behaviour).
                ops.push({ op: 'replace', path: `/players/0/equipment/${slot}`, value: itemId });
            }
        }
        // For "I have/carry/gain/acquire" (passive), don't auto-equip — the
        // player is just acquiring the item. They can equip explicitly via
        // the inventory UI or a follow-up "I wield X" declaration.
    }

    // --- New NPC / familiar / companion ---
    // "I summon Ember the phoenix", "I befriend Lyra", "I bond with the Dragon named Vex"
    // Match "I summon Ember", "I summon Ember the phoenix", "I summon the Dragon named Vex"
    // Stop the name capture at "as", "to be", or punctuation. Capture optional "the X" descriptor after the name.
    // Capital-only chain captures the proper name. Stops naturally at "the phoenix"
    // (lowercase) or at "as", "to be", punctuation. Case-sensitive on the capture
    // so we don't accidentally swallow "as my familiar" as part of the name.
    const npcMatch = t.match(/\b[Ii] (?:summon|befriend|bond with|conjure|call forth)\s+(?:the\s+|The\s+)?([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)*)(?:\s+(?:the|a|an|named)\s+([A-Za-z'-]+(?:\s+[A-Za-z'-]+){0,4}?))?(?=[.,!?:;]|\s+as\s+|\s+to\s+be|$)/);
    if (npcMatch) {
        const name = (npcMatch[1] || '').trim();
        const kind = (npcMatch[2] || '').trim();
        if (name) {
            ops.push({
                op: 'add', path: `/entityMemory/npcs/${name}`,
                value: {
                    name,
                    description: kind ? `${name}, ${kind}, summoned by god mode` : `${name}, god-mode familiar`,
                    traits: ['familiar', 'loyal'],
                    relationship: 'bonded'
                }
            });
        }
    }

    // --- New boss / enemy summoned to fight ---
    // "I summon X as a boss", "I face the Hollow King", "let the Void Dragon appear to fight"
    // Note: this MUST come AFTER the npc match, since "I summon X as a boss" should
    // be a boss not a familiar. We re-check explicitly here for "as a boss" suffix.
    const bossMatch = t.match(/\b(?:[Ii] (?:face|fight|summon|challenge)|[Ll]et)\s+(?:the\s+|The\s+)?([A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)*)\s+(?:as\s+(?:a\s+)?(?:new\s+)?boss|to\s+fight|appear|in\s+combat)\b/);
    if (bossMatch) {
        const name = bossMatch[1].trim();
        const epic = /(king|queen|dragon|god|titan|leviathan|primarch|emperor|colossus|behemoth|wraith)/i.test(name);
        // If the npc match also fired for the same name, we want the boss
        // version (hostile) to win, not the bonded familiar. Strip prior NPC
        // ops for this same name.
        for (let i = ops.length - 1; i >= 0; i--) {
            if (ops[i].path === `/entityMemory/npcs/${name}` && ops[i].value?.relationship === 'bonded') {
                ops.splice(i, 1);
            }
        }
        ops.push({
            op: 'add', path: '/enemies/-',
            value: {
                name,
                hp: epic ? 600 : 300, maxHp: epic ? 600 : 300,
                atk: epic ? 50 : 30, def: epic ? 30 : 18,
                abilities: ['Voidstrike', 'Dread Aura'],
                isBoss: true // else the engine clamps it like a minion (25 HP)
            }
        });
        ops.push({ op: 'replace', path: '/inCombat', value: true });
        ops.push({
            op: 'add', path: `/entityMemory/npcs/${name}`,
            value: {
                name,
                description: `${name}, summoned as antagonist via god mode`,
                traits: ['antagonist', epic ? 'epic' : 'foe'],
                relationship: 'hostile'
            }
        });
    }

    // --- New quest declaration ---
    // "I declare a new quest: find the Sun Hearts", "begin a quest to slay the Hollow King"
    const questMatch = t.match(/\b(?:i\s+)?(?:declare|begin|start|create)\s+(?:a\s+)?(?:new\s+)?quest:?\s*(?:to\s+)?(.{6,200}?)(?=[.!?]|$)/i);
    if (questMatch) {
        const goal = questMatch[1].trim().replace(/^to\s+/, '');
        if (goal) {
            ops.push({ op: 'replace', path: '/adventureGoal', value: goal.charAt(0).toUpperCase() + goal.slice(1) });
        }
    }

    // --- God-mode retirement: renounce divinity, begin a new mortal arc ---
    // "I retire from godhood", "I renounce my divine power", "End my god mode",
    // "I am mortal again", "Reset my journey and start a new quest".
    // The player wields god-mode authority to disable god-mode itself.
    // Earned items, skills, stats are KEPT — only the omnipotent UI goes
    // away and a new main-quest arc begins.
    const retireMatch = t.match(/\b(?:i\s+(?:retire|renounce|relinquish|surrender|forsake|abdicate)|i\s+(?:am|become)\s+mortal(?:\s+again)?|end\s+(?:my\s+)?(?:god(?:hood|\s*mode|\s+powers?)?|divinity)|reset\s+(?:my\s+)?(?:journey|adventure|quest))/i);
    if (retireMatch) {
        // Reset the bar while the goal still reads complete (that 0 clears the
        // old milestones), then reopen the goal.
        ops.push({ op: 'replace', path: '/questProgress/completionPercentage', value: 0 });
        ops.push({ op: 'replace', path: '/isGoalComplete', value: false });
        // If the input didn't already specify a new quest goal, seed a
        // generic call-to-adventure so the narrator has something to anchor
        // Act 1 on. Otherwise the questMatch above provided one.
        if (!questMatch) {
            ops.push({
                op: 'replace', path: '/adventureGoal',
                value: 'A new chapter begins. The world has shifted; what calls to you now?'
            });
        }
    }

    return ops;
}

/**
 * Handles the player submitting a custom action after the goal is complete.
 * Triggers AI for narrative progression.
 */
export async function handleCustomAction(text = '') {
    const log = window.displayVisualError || console.log; // Use logger
    log("Handling custom action submission...");

    const recapBefore = snapshotParty(), recapActor = getCurrentPlayer()?.name; // god-mode turns get the recap too

    // Check if custom actions are allowed
    if (!gameState.allowCustomActions) {
         log("Custom action blocked: Goal not complete.");
         UI.showPopup("Custom actions only allowed after completing the goal.", "info");
         return;
    }

    // Standard loading/action checks
    if (gameState.isLoading || !canCurrentPlayerAct()) {
          const reason = gameState.isLoading ? "Game is loading" : "Current player cannot act";
          log(`Custom action blocked: ${reason}.`);
          if (!gameState.isLoading) { UI.showPopup("Cannot act now.", "warning"); }
         return;
    }

    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer) {
         log("ERROR: Could not get current player during custom action.");
        return;
    }

    const actionText = String(text || '').trim();
    if (!actionText) {
        UI.showPopup('Please enter your custom action.', 'error');
        log("Custom action blocked: Input is empty.");
        return;
    }

    UI.renderChoices([], null); // Clear choice buttons visually

    // Phase 3: anchor the free-form input in existing world entities. We
    // substring-match (case-insensitive) the input against names in
    // entityMemory, surface the hits in the action log so the narrator
    // routes the action through the existing canon. The narrator-as-
    // retriever pattern: cheap, no extra LLM call, falls back to "novel
    // creation" framing when no existing entity matches.
    const inputLower = actionText.toLowerCase();
    const em = gameState.entityMemory || {};
    const matchedNames = [];
    for (const cat of ['npcs', 'locations', 'items']) {
        for (const name of Object.keys(em[cat] || {})) {
            if (inputLower.includes(name.toLowerCase())) matchedNames.push(`${name} (${cat.slice(0, -1)})`);
        }
    }

    const refLine = matchedNames.length > 0
        ? `\nThe input references existing entities: ${matchedNames.join(', ')}. Honor their established traits.`
        : `\nThe input may introduce something new. If so, persist it via diff ops below.`;

    // ===== GOD-MODE DETERMINISTIC INTENT EXTRACTION =====
    // The narrator (Gemma-3n-E4B, 4B params) inconsistently honors god-mode
    // declarations even with rich prompts — it tends to revert to flavor
    // narration. Solution: parse the player's input with regex BEFORE the
    // narrator turn, emit diff ops directly through the engine, and tell
    // the narrator what we already did so it can describe the consequences
    // without needing to invent them. Narrator-as-retriever, not author.
    const preApplied = [];
    if (gameState.isGoalComplete) {
        try {
            const { applyDiff } = await import('./engine.js');
            const pi = gameState.currentPlayerIndex || 0; // the parser writes /players/0; target the declarer
            const ops = extractGodModeDiffOps(actionText).map(o => ({ ...o, path: o.path.replace(/^\/players\/0\//, `/players/${pi}/`) }));
            if (ops.length > 0) {
                const summaries = applyDiff(ops, { strict: false });
                preApplied.push(...summaries);
                log(`God Mode pre-narrator: applied ${summaries.length} deterministic ops from input`);
            }
        } catch (e) {
            log(`God Mode intent extraction failed: ${e?.message || e}`);
        }
    }
    // Anything the parser didn't cover: one small call turns the wish into
    // game changes before the story is written, so the wish really happens
    // (live: the storyteller narrated "divine power" and sent 0 ops).
    if (gameState.isGoalComplete) {
        try {
            const { wishToOps } = await import('./aiHandler.js');
            const { applyDiff } = await import('./engine.js');
            const pi = gameState.currentPlayerIndex || 0;
            const extra = (await wishToOps(actionText, preApplied)).map(o => ({ ...o, path: String(o.path || '').replace(/^\/players\/0\//, `/players/${pi}/`) }));
            if (extra.length) {
                const done = applyDiff(extra, { strict: false });
                preApplied.push(...done);
                log(`God Mode wish: applied ${done.length}/${extra.length} ops`);
            }
        } catch (e) { log(`God Mode wish-to-ops failed: ${e?.message || e}`); }
    }
    const preAppliedNote = preApplied.length > 0
        ? `\nPRE-APPLIED CHANGES (narrate these as already happening, do not re-emit these ops):\n  • ${preApplied.join('\n  • ')}`
        : '';

    // GOD MODE PROMPT — exhaustive examples for every authorial scenario.
    // The player has finished the main quest and earned the right to reshape
    // the world. Treat their input as canon unless age-tier policy forbids.
    // Every tangible consequence MUST be persisted via diff ops; otherwise
    // the change is just narration and disappears next turn.
    // The god-mode rules (declaration -> op mapping, defaults, examples) are
    // in every turn prompt (buildDiffInstructions + the GOD MODE quest block),
    // targeted at the acting player. This used to repeat ~100 lines of them
    // with /players/0 paths, second person and 200-400 words.
    const actionLog = `[God mode] ${currentPlayer.name} declares: "${actionText}"${refLine}${preAppliedNote}
The wish succeeds fully and at once, with no cost, catch or twist unless the player asked for one (age policy permitting). Narrate it happening and the world's awe; persist any further tangible change with ops.`;

    log(`Custom action prompt (creative mode${matchedNames.length ? `, refs: ${matchedNames.join(', ')}` : ', novel'}): ${actionText.slice(0, 80)}...`);

    // --- Trigger AI for Narrative ---
    UI.showLoading(true, 'Narrating outcome...');
    try {
        await makeAICallForSystemAction(actionLog, false); // Let turn advance normally after AI response
    } catch (error) {
        log(`CRITICAL ERROR in handleCustomAction: ${error.message}`);
        UI.showPopup(`Custom Action Failed: ${error.message}. The AI could not process your custom action. Please try a different action.`, 'error', 8000);
        
        // Re-throw error - no silent failures
        throw new Error(`Custom action processing failed: ${error.message}`);
    } finally {
        UI.showLoading(false);
        try { UI.showTurnRecap(formatTurnRecap(recapBefore, snapshotParty(), recapActor)); } catch (_) {}
        try { (await import('./saveLoad.js')).autosave(); } catch (_) {}
    }

    log("handleCustomAction finished.");
}

/**
 * Uses an item from the current player's inventory.
 * Applies effects, consumes item, and potentially triggers AI or advances turn.
 * (Largely unchanged, logic seems okay based on new structure)
 * @param {string} itemId - The ID of the item to use.
 */
export async function useInventoryItem(itemId) {
     const log = window.displayVisualError || console.log; // Use logger
     log(`Attempting to use item: ${itemId}`);
     if (!canCurrentPlayerAct()) {
          log(`Action blocked: Cannot use item now.`);
          UI.showPopup(`${getCurrentPlayer()?.name || 'Player'} cannot use items now.`, 'warning');
          return;
     }
     const player = getCurrentPlayer();
     if (!player) { log("ERROR: Cannot find player to use item."); return; }

     const itemIndex = player.inventory?.findIndex(i => i && i.id === itemId);
     if (itemIndex === undefined || itemIndex === -1) {
         log(`ERROR: Item ${itemId} not found in player ${player.name} inventory.`);
         UI.showPopup("Item not found in inventory!", 'error');
         return;
     }
     const item = player.inventory[itemIndex];
     item.type = Progression.usableType(item); // an invented type ("Artifact") from an older save
     Items.inferItemEffects(item); // words become real effects
     log(`Found item: ${item.name} (${item.type})`);

     // In a fight, drinking from the pack is the battle Item action: it costs
     // the turn and the enemies answer (before, heals here were free).
     if (gameState.inCombat && item.type === 'Consumable' && !item.stats?.revive) {
         UI.showScreen('gameScreen');
         return handlePlayerChoice('Item', `Use ${item.name}`);
     }

     let consumed = false;
     let requiresAICall = false;
     let actionLog = "";
     let turnAdvanced = false; // Track if turn is advanced *within* this function

     if (item.type === 'Consumable' && item.stats?.throwStatus) {
         UI.showPopup(`${item.name} is thrown at enemies: save it for a fight.`, 'info');
         return; // not consumed, no turn used
     }
     // Revival items also carry healPercent: check revive first, or the heal
     // branch below drank the Phoenix Down on yourself.
     if (item.type === 'Consumable' && item.stats?.revive === true) {
         UI.showPopup(`Use '${item.name}' via the 'Help Ally' action on a downed ally.`, 'info');
         return; // Do not consume or advance turn
     }
     if (item.type === 'Consumable') {
        // Heal Effect
        const baseHeal = Math.round(((Number(item.stats?.heal) || 0) + (player.maxHp || 100) * (Number(item.stats?.healPercent) || 0)) * Progression.kindHealing(player)); // Kind: +10% per point
        if (baseHeal > 0) {
            consumed = true;
            const oldHp = player.hp;
            
            player.hp = clamp(player.hp + baseHeal, 0, player.maxHp);
            const actualHeal = player.hp - oldHp;
            actionLog = `${player.name} uses ${item.name}. Result: Restored ${actualHeal} HP.`;
            
            if (actualHeal > 0) UI.showPopup(`${item.name} restored ${actualHeal} HP!`, 'healing');
            else UI.showPopup(`${player.name} uses ${item.name}, but HP is already full.`, 'info');
            
            log(actionLog);
            // A heal item's cure / extra status still apply (the battle path does both).
            if (item.stats?.cure && player.statusEffects?.length) {
                const cure = item.stats.cure;
                player.statusEffects = player.statusEffects.filter(e => !(e && (cure === 'All' || e.name === cure)));
            }
            for (const name of [].concat(item.stats?.applyStatus || [])) {
                Combat.applyStatusEffect(player, name, Number(item.stats.duration) || 3, {}, `Used ${item.name}`);
            }

             // Check if only simple healing occurred
             const otherStats = Object.keys(item.stats).filter(k => !['heal', 'revive', 'cure', 'healPercent'].includes(k));
             const simpleDescription = !item.effect || /heal|restor|mend/i.test(item.effect); // Basic check
             if (otherStats.length === 0 && simpleDescription) {
                 log("Simple heal item used. Advancing turn.");
                 UI.renderPlayerCards(); // Update UI before advancing
                 await advanceTurn(); // Simple heal advances turn immediately
                 turnAdvanced = true;
             } else {
                 log("Heal item has other effects or complex description. Triggering AI.");
                 requiresAICall = true;
                 actionLog += ` Effect: ${item.effect || 'Various effects.'}`;
             }
         }
         // Revival Effect (Handled by Help Ally)
         else if (item.stats?.revive === true) {
             log("Attempted to 'Use' revival item directly.");
             UI.showPopup(`Use '${item.name}' via the 'Help Ally' action on a downed ally.`, 'info');
             return; // Do not consume or advance turn
         }
         // Status Effect Application (enhanced for new system)
         else if (item.stats?.applyStatus) {
             consumed = true;
             const statusEffects = Array.isArray(item.stats.applyStatus) ? item.stats.applyStatus : [item.stats.applyStatus];
             const appliedEffects = [];
             
             statusEffects.forEach(effectName => {
                 // Try to find the effect in the config first
                 const effectKey = Object.keys(Config.STATUS_EFFECTS).find(key => 
                     Config.STATUS_EFFECTS[key].name === effectName
                 );
                 
                 if (effectKey) {
                     // Use configured status effect
                     Combat.applyConfiguredStatusEffect(player, effectKey, null, {}, `Used ${item.name}`);
                     appliedEffects.push(Config.STATUS_EFFECTS[effectKey].name);
                 } else {
                     // Fallback to old system
                     const duration = item.stats.duration || 3;
                     let effectData = { ...item.stats };
                     delete effectData.applyStatus; delete effectData.duration; delete effectData.heal; delete effectData.revive; delete effectData.cure; delete effectData.healPercent;
                     Combat.applyStatusEffect(player, effectName, duration, effectData, `Used ${item.name}`);
                     appliedEffects.push(effectName);
                 }
             });
             
             actionLog = `${player.name} uses ${item.name}. Result: Affected by ${appliedEffects.join(', ')}.`;
             log(actionLog);
             UI.showPopup(`${player.name} is affected by ${appliedEffects.join(', ')}!`, 'risky');
             requiresAICall = true; // Status effects likely need AI narration
         }
         // Cure Effect
         else if (item.stats?.cure) {
             const cureType = item.stats.cure;
             let curedEffects = [];
             if (player.statusEffects) {
                 player.statusEffects = player.statusEffects.filter(effect => {
                     if (effect && (cureType === 'All' || effect.name === cureType)) {
                         curedEffects.push(effect.name);
                         return false;
                     }
                     return true;
                 });
             }
             actionLog = `${player.name} uses ${item.name}.`;
             if (curedEffects.length > 0) {
                 // Only consume the item if it actually cured something — don't
                 // burn a cure potion when the player has no matching debuff.
                 consumed = true;
                 actionLog += ` Result: Cured ${curedEffects.join(', ')}.`;
                 UI.showPopup(`Cured: ${curedEffects.join(', ')}!`, 'healing');
             } else {
                 actionLog += ` Result: No relevant effects to cure.`;
                 UI.showPopup(`${item.name} had no effect — it was not consumed.`, 'info');
             }
             log(actionLog);

             // BUG-01 fix: only advance the turn if the cure actually
             // consumed the item. Previously a cure-with-nothing-to-cure
             // popped "no effect — not consumed" but still advanced the
             // turn, ticking cooldowns and status effects for the wrong
             // reason.
             const otherStatsCure = Object.keys(item.stats).filter(k => !['cure', 'revive', 'heal', 'healPercent'].includes(k));
             const simpleCureDesc = !item.effect || /cure|remov|cleanse|purif/i.test(item.effect);
             if (otherStatsCure.length === 0 && simpleCureDesc) {
                 if (consumed) {
                     log("Simple cure item used. Advancing turn.");
                     UI.renderPlayerCards();
                     await advanceTurn();
                     turnAdvanced = true;
                 } else {
                     log("Cure item had nothing to cure; turn NOT advanced (item was not consumed).");
                 }
             } else {
                 log("Cure item has other effects or complex description. Triggering AI.");
                 requiresAICall = true;
                 actionLog += ` Effect: ${item.effect || 'Various effects.'}`;
             }
         }
         // Other/Generic Consumables
         else {
             consumed = true;
             actionLog = `${player.name} uses ${item.name}. Effect: ${item.effect || 'The effect is uncertain...'}`;
             log(actionLog);
             UI.showPopup(`Used ${item.name}.`, 'info'); // Simple popup for generic items
             requiresAICall = true; // Assume uncertain effects need AI interpretation
         }
     } else {
         log(`Cannot 'Use' a ${item.type}.`);
         UI.showPopup(`Cannot 'Use' a ${item.type}. Try equipping or dropping.`, 'info');
         return; // Do not consume or advance turn
     }

     // MP and permanent stat effects come on top of the main effect.
     if (item.type === 'Consumable' && (consumed || requiresAICall || turnAdvanced)) {
         const extras = applyItemExtras(player, item);
         if (extras.length) {
             consumed = true;
             UI.showPopup(`${item.name}: ${extras.join(', ')}!`, 'healing', 3000);
             actionLog = `${actionLog || `${player.name} uses ${item.name}.`} Also: ${extras.join(', ')}.`;
             UI.renderPlayerCards();
         }
     }
     // Remove Consumed Item
     if (consumed) {
         // One from a stack (before, drinking one of 3 potions deleted all 3).
         if ((item.quantity ?? 1) > 1) item.quantity -= 1;
         else player.inventory.splice(itemIndex, 1);
         log(`${item.name} used (${item.quantity > 1 ? item.quantity + ' left' : 'removed'}).`);
     }

     // Update UI (player cards handled within turn advance or AI call completion)
     if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();

     // Trigger AI or Advance Turn
     if (requiresAICall && actionLog) {
         log("Item use requires AI call for narrative.");
         UI.showLoading(true, 'Narrating item use...');
         try {
             await makeAICallForSystemAction(actionLog, false); // Let AI handle narrative & turn advance
         } catch (error) {
             log(`Error during AI call in useInventoryItem: ${error.message}`);
              UI.renderChoices(gameState.currentChoices || []); // re-render the last choices on failure (empty call left only 'Waiting for storyteller')
         } finally {
             UI.showLoading(false);
              // Close inventory if open after AI call completes (success or fail)
             if (gameState.currentScreen === 'inventoryScreen') {
                 setTimeout(() => { if (gameState.currentScreen === 'inventoryScreen') UI.showScreen('gameScreen'); }, 100);
             }
         }
     } else if (consumed && !turnAdvanced) {
         // Turn was not advanced internally (e.g., for complex heal/cure), but no AI call needed now.
         // This case should be rare now, as complex items trigger AI. If reached, advance turn.
         log("Item consumed, no AI call needed, turn not advanced yet. Advancing now.");
         await advanceTurn();
         turnAdvanced = true; // Mark as advanced
         // Close inventory if open
          if (gameState.currentScreen === 'inventoryScreen') {
              setTimeout(() => { if (gameState.currentScreen === 'inventoryScreen') UI.showScreen('gameScreen'); }, 100);
          }
     } else if (consumed && turnAdvanced) {
         // Turn already advanced internally (simple heal/cure)
         log("Item use completed, turn already advanced.");
          // Close inventory if open
          if (gameState.currentScreen === 'inventoryScreen') {
              setTimeout(() => { if (gameState.currentScreen === 'inventoryScreen') UI.showScreen('gameScreen'); }, 100);
          }
     } else if (!consumed) {
         // Item was not consumed — either a cure potion that had no effect (turn
         // was already advanced inside the cure branch) or a non-consumable that
         // returned early above.
         log("Item use completed without consumption.");
     }

     log("useInventoryItem finished.");
 }


// --- Remaining functions (equip, unequip, drop, buy, special move, help ally) ---
// These functions generally don't involve direct AI choice interaction in the same way.
// Their AI prompts describe the action taken. Reviewing their prompts for clarity is good practice,
// but major structural changes like handlePlayerChoice aren't needed.
// Keep these functions as they are for now, unless specific issues arise.

/** Equips an item for the current player. Does not use a turn. */
export function equipInventoryItem(itemId, slot) {
     const log = window.displayVisualError || console.log; // Use logger
     log(`Attempting to equip item ${itemId} in slot ${slot}`);
     // Phase 2.6: equipment is locked while imprisoned (gear was confiscated).
     if (gameState.imprisoned) {
         log(`Action blocked: Cannot equip while imprisoned.`);
         UI.showPopup(`Your gear was confiscated. Find it during the escape.`, 'warning');
         return;
     }
     // Cannot equip if downed or loading
     if (gameState.isLoading || getCurrentPlayer()?.isDowned) {
           const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
           log(`Action blocked: Cannot equip now (${reason}).`);
           UI.showPopup(`Cannot change equipment now.`, 'warning');
           return;
     }
     const player = getCurrentPlayer();
     if (!player) { log("ERROR: Cannot find player to equip item."); return; }
     const itemIndex = player.inventory?.findIndex(item => item && item.id === itemId);
     if (itemIndex === undefined || itemIndex === -1) {
         log(`ERROR: Item ${itemId} not found in inventory.`);
         UI.showPopup("Item not found!", "error");
         return;
     }
     const itemToEquip = player.inventory[itemIndex];
     if ((slot === 'weapon' && itemToEquip.type !== 'Weapon') || (slot === 'armor' && itemToEquip.type !== 'Armor')) {
         log(`ERROR: Cannot equip ${itemToEquip.name} (${itemToEquip.type}) in ${slot} slot.`);
         UI.showPopup(`Cannot equip a ${itemToEquip.type} in the ${slot} slot.`, 'error');
         return;
     }
      if (player.equipment[slot] === itemId) {
           log(`${itemToEquip.name} is already equipped.`);
           UI.showPopup(`${itemToEquip.name} is already equipped.`, 'info');
           return;
      }
     // Unequip previous item in the slot
     const currentlyEquippedId = player.equipment[slot];
     if (currentlyEquippedId) {
         const currentlyEquippedItem = player.inventory.find(item => item && item.id === currentlyEquippedId);
         if (currentlyEquippedItem) {
             log(`Unequipping previous ${slot}: ${currentlyEquippedItem.name}`);
             currentlyEquippedItem.equippedSlot = null;
         } else { log(`Warning: Previously equipped item ${currentlyEquippedId} in ${slot} slot not found in inventory.`); }
         player.equipment[slot] = null;
     }
     // Equip new item
     player.equipment[slot] = itemId;
     itemToEquip.equippedSlot = slot;
     log(`${itemToEquip.name} equipped in ${slot} slot.`);
     Combat.recalculateCharacterStats(player);
     log(`Stats recalculated. ATK: ${player.atk}, DEF: ${player.def}`);
     UI.showPopup(`${itemToEquip.name} equipped.`, 'success');
     if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
     UI.renderPlayerCards();
     log("equipInventoryItem finished.");
 }

/** Unequips an item from the specified slot for the current player. Does not use a turn. */
export function unequipInventoryItem(slot) {
      const log = window.displayVisualError || console.log; // Use logger
      log(`Attempting to unequip item from slot ${slot}`);
      // Phase 2.6: equipment frozen while imprisoned.
      if (gameState.imprisoned) {
          log(`Action blocked: Cannot unequip while imprisoned.`);
          UI.showPopup(`Your gear was confiscated.`, 'warning');
          return;
      }
      // Cannot unequip if downed or loading
      if (gameState.isLoading || getCurrentPlayer()?.isDowned) {
           const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
           log(`Action blocked: Cannot unequip now (${reason}).`);
           UI.showPopup(`Cannot change equipment now.`, 'warning');
           return;
      }
      const player = getCurrentPlayer();
      if (!player) { log("ERROR: Cannot find player to unequip item."); return; }
      const currentEquippedId = player.equipment[slot];
      if (currentEquippedId) {
           const itemToUnequip = player.inventory?.find(item => item && item.id === currentEquippedId);
           if (itemToUnequip) {
                itemToUnequip.equippedSlot = null;
                player.equipment[slot] = null;
                log(`${itemToUnequip.name} unequipped from ${slot}.`);
                Combat.recalculateCharacterStats(player);
                log(`Stats recalculated. ATK: ${player.atk}, DEF: ${player.def}`);
                UI.showPopup(`${itemToUnequip.name} unequipped.`, 'success');
                if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
                UI.renderPlayerCards();
           } else {
                // Item ID was equipped but item missing from inventory (shouldn't happen ideally)
                log(`Warning: Unequipped item ID ${currentEquippedId} from ${slot} not found in inventory.`);
                player.equipment[slot] = null; // Still clear the slot
                Combat.recalculateCharacterStats(player); // Recalc needed
                UI.showPopup(`Item in ${slot} slot removed (not found in inventory).`, 'warning');
                 if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
                 UI.renderPlayerCards();
           }
      } else {
           log(`Nothing equipped in ${slot} slot.`);
           UI.showPopup("Nothing equipped in that slot.", 'info');
      }
      log("unequipInventoryItem finished.");
 }

/** Shows confirmation modal for dropping an item. Does not use a turn. */
export function confirmDropItem(itemId) {
    const log = window.displayVisualError || console.log; // Use logger
    log(`Requesting confirmation to drop item: ${itemId}`);
    const player = getCurrentPlayer();
    if (!player) { log("ERROR: Cannot find player for confirmDropItem."); return; }
    // Cannot drop if downed or loading
    if (gameState.isLoading || player.isDowned) {
          const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
          log(`Action blocked: Cannot drop item now (${reason}).`);
          UI.showPopup("Cannot drop items now.", "warning");
          return;
    }
    const item = player.inventory?.find(i => i && i.id === itemId);
    if (!item) {
        log(`ERROR: Item ${itemId} not found for confirmDropItem.`);
        UI.showPopup("Item not found!", "error");
        return;
    }
    UI.updateConfirmationModal( 'Confirm Drop', `Are you sure you want to permanently drop ${item.name}? This cannot be undone.` );
    UI.elements.confirmYesBtn.onclick = () => {
        log(`Confirmation received to drop item: ${itemId}`);
        dropInventoryItem(itemId); // Call the actual drop function
        UI.hideModal('confirmationModal');
    };
     UI.elements.confirmNoBtn.onclick = () => { // Make sure No button works
          UI.hideModal('confirmationModal');
     }
    UI.showModal('confirmationModal');
}

/** Drops an item from the current player's inventory. Handles unequipping if needed. Assumes confirmation. Does not use a turn. */
function dropInventoryItem(itemId) {
     const log = window.displayVisualError || console.log; // Make helper function use logger
     const player = getCurrentPlayer();
     if (!player) { log("ERROR: Cannot find player for dropInventoryItem."); return; }
     // Double check cannot drop if downed (should be caught by confirm)
     if (player.isDowned) { log("Drop blocked: Player is downed."); return; }

     const itemIndex = player.inventory?.findIndex(i => i && i.id === itemId);
     if (itemIndex === undefined || itemIndex === -1) {
          log(`ERROR: Item ${itemId} not found for dropInventoryItem.`);
          // Re-render inventory in case state is weird
           if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
          return;
     }
     const itemToDrop = player.inventory[itemIndex];
     log(`Dropping item: ${itemToDrop.name} (ID: ${itemId})`);
     let unequipped = false;

     // Check if equipped and unequip first
     if (itemToDrop.equippedSlot) {
          const slot = itemToDrop.equippedSlot;
          if (player.equipment[slot] === itemId) {
              player.equipment[slot] = null;
               log(` -> Item was equipped in ${slot}, unequipping before drop.`);
              unequipped = true;
          }
          itemToDrop.equippedSlot = null; // Ensure flag is cleared even if slot was already null
     }

     const droppedItemName = itemToDrop.name;
     player.inventory.splice(itemIndex, 1); // Remove from inventory
     UI.showPopup(`${droppedItemName} dropped.`, 'info');

     // If an item was unequipped, recalculate stats and update cards
     if (unequipped) {
        Combat.recalculateCharacterStats(player);
        log(` -> Stats recalculated after unequipping dropped item. ATK: ${player.atk}, DEF: ${player.def}`);
        UI.renderPlayerCards();
     }

     // Always re-render inventory if it's the current screen
     if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory();
     log("dropInventoryItem finished.");
 }

/** Buys an item from the shop for the current player. Does not use a turn. */
export function buyShopItem(itemData) {
     const log = window.displayVisualError || console.log; // Use logger

     // Calculate reputation-modified price
     const modifiedPrice = calculateItemPrice(itemData);
     log(`Attempting to buy item: ${itemData?.name} (Base: ${itemData?.cost}, Modified: ${modifiedPrice})`);

     // Phase 2.6: no shopping in jail.
     if (gameState.imprisoned) {
         log(`Action blocked: Cannot shop while imprisoned.`);
         UI.showPopup(`Not now — you're locked up.`, 'warning');
         return;
     }
      // Cannot shop if downed or loading
      if (gameState.isLoading || getCurrentPlayer()?.isDowned) {
          const reason = gameState.isLoading ? "Game is loading" : "Player is downed";
          log(`Action blocked: Cannot buy now (${reason}).`);
         UI.showPopup(`Cannot shop now.`, 'warning');
         return;
     }
     const player = getCurrentPlayer();
     if (!player || !itemData || typeof itemData.cost !== 'number' || itemData.cost < 0) {
          log(`ERROR: Buy item failed - invalid player or item data. Player: ${!!player}, Item: ${JSON.stringify(itemData)}`);
          UI.showPopup("Cannot buy item: Invalid data.", 'error');
          return;
     }
     if (itemData.type !== 'Consumable' && (itemData.boughtBy || []).includes(player.id)) {
         UI.showPopup(`${player.name} already has ${itemData.name}.`, 'info'); // one of each gear or charm per hero
         return;
     }
     if (player.coins >= modifiedPrice) {
         const oldCoins = player.coins;
         player.coins -= modifiedPrice;
         log(`Player coins reduced from ${oldCoins} to ${player.coins} (paid ${modifiedPrice} coins)`);
         // Create a new instance for the player's inventory
         const newItem = { ...itemData, id: generateId('item'), equippedSlot: null };
         delete newItem.cost; // Remove cost from player inventory version
         newItem.boughtFor = modifiedPrice; // sells back for half of what was paid
         if (newItem.type === 'Consumable' && newItem.quantity === undefined) { newItem.quantity = 1; }
         if (!player.inventory) player.inventory = [];
         player.inventory.push(newItem);
         const fused = Progression.fuseCharms(player);
         if (fused) UI.showPopup(`🍀 Your charms fuse: ${fused.name}, luck ${fused.luck}!`, 'legendary', 3500);
         // One of each piece of gear or charm per hero: it leaves this hero's
         // shop, the others can still buy their own (live 10-09: five copies
         // of the same lucky charm). Consumables stay on sale.
         if (itemData.type !== 'Consumable') itemData.boughtBy = [...new Set([...(itemData.boughtBy || []), player.id])];
         log(`Added new item instance to inventory: ${newItem.name} (New ID: ${newItem.id})`);
         UI.showPopup(`Bought ${newItem.name}!`, 'success');
         // Update UI
         UI.renderShop(); // Re-render shop to potentially show updated affordability
         UI.renderPlayerCards(); // Update player card for coins
         UI.updateContextHeaders(); // Update header coins
         if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory(); // Update inv if open
     } else {
         log(`Buy item failed: Not enough coins. Need ${modifiedPrice}, have ${player.coins}`);
         const discount = modifiedPrice < itemData.cost ? ` (${Math.round((1 - modifiedPrice/itemData.cost) * 100)}% discount!)` : '';
         const markup = modifiedPrice > itemData.cost ? ` (${Math.round((modifiedPrice/itemData.cost - 1) * 100)}% markup)` : '';
         UI.showPopup(`Not enough coins! Need ${modifiedPrice}${discount}${markup}`, 'error');
     }
      log("buyShopItem finished.");
 }

/** Uses a special move for the current player. Applies cooldown, triggers AI. Uses a turn via AI call. */
export async function useSpecialMove(moveId) {
    const log = window.displayVisualError || console.log;
    log(`Attempting to use special move: ${moveId}`);
    
    if (!canCurrentPlayerAct()) {
        log(`Action blocked: Cannot use special move now.`);
        UI.showPopup(`${getCurrentPlayer()?.name || 'Player'} cannot use special moves now.`, 'warning');
        return;
    }

    const player = getCurrentPlayer();
    if (!player) { 
        log("ERROR: Cannot find player for useSpecialMove."); 
        return; 
    }

    const move = player.specialMoves?.find(m => m && m.id === moveId);
    if (!move) {
        log(`ERROR: Special move ${moveId} not found for player ${player.name}.`);
        UI.showPopup("Special move not found!", "error");
        return;
    }

    // Check if move can be used in current context
    if (gameState.inCombat && move.usageContext === 'exploration') {
        log(`Move ${move.name} cannot be used in combat.`);
        UI.showPopup(`${move.name} cannot be used during combat!`, 'warning');
        return;
    }
    // In a fight the Moves screen runs the battle Special action: same
    // damage and effects, and the turn passes (before: 0 damage, free turn).
    if (gameState.inCombat) {
        UI.showScreen('gameScreen');
        return handlePlayerChoice('Special', `Use ${move.name}`);
    }
    if (!gameState.inCombat && move.usageContext === 'combat') {
        log(`Move ${move.name} cannot be used outside combat.`);
        UI.showPopup(`${move.name} can only be used during combat!`, 'warning');
        return;
    }

    if (move.currentCooldown > 0) {
        log(`Move ${move.name} is on cooldown (${move.currentCooldown} turns remaining).`);
        UI.showPopup(`${move.name} is on cooldown! (${move.currentCooldown} turns left)`, 'warning');
        return;
    }

    // Check MP cost
    const mpCost = move.mpCost || 0;
    if (mpCost > 0 && player.mp < mpCost) {
        log(`Move ${move.name} requires ${mpCost} MP, but player only has ${player.mp} MP.`);
        UI.showPopup(`Not enough MP! ${move.name} costs ${mpCost} MP (you have ${player.mp})`, 'warning');
        return;
    }

    // Apply cooldown and consume MP.
    // BUG-17 fix: god-mode-emitted moves can have cooldown undefined; previous
    // code set currentCooldown = undefined and `> 0` evaluates false, letting
    // the move be spammed every turn. Default to 2 (mirrors combat-branch).
    move.currentCooldown = move.cooldown ?? 2;
    let mpSpent = 0;
    if (mpCost > 0) {
        player.mp -= mpCost;
        mpSpent = mpCost;
        log(`${player.name} spent ${mpCost} MP using ${move.name} (${player.mp + mpCost} -> ${player.mp})`);
    }
    log(`Set cooldown for ${move.name} to ${move.currentCooldown}`);

    // Apply mechanical effects based on context
    let enemyDefeated = false;
    if (gameState.inCombat && move.mechanics) {
        // Combat effects
        if (move.mechanics.damage) {
            const targetEnemy = gameState.enemies.find(e => !e.isDefeated);
            if (targetEnemy) {
                const damage = Math.round(move.mechanics.damage * (1 + (player.atk / 100)));
                targetEnemy.hp = Math.max(0, targetEnemy.hp - damage);
                UI.showPopup(`${move.name} deals ${damage} damage to ${targetEnemy.name}!`, 'damage');
                
                if (targetEnemy.hp <= 0 && !targetEnemy.isDefeated) {
                    enemyDefeated = true;
                    await Combat.handleEnemyDefeat(targetEnemy.id);
                }
            }
        }

        if (move.mechanics.healing) {
            let healing = Math.round(move.mechanics.healing * (1 + (player.def / 100)));
            
            player.hp = Math.min(player.maxHp, player.hp + healing);
            UI.showPopup(`${move.name} restores ${healing} HP!`, 'healing');
        }

        if (move.mechanics.statusEffects) {
            move.mechanics.statusEffects.forEach(effect => {
                const target = gameState.inCombat ? 
                    gameState.enemies.find(e => !e.isDefeated) : 
                    player;
                if (target) {
                    Combat.applyStatusEffect(target, effect, 3, {}, move.name);
                    UI.showPopup(`${target.name} is affected by ${effect}!`, 'status');
                }
            });
        }
    } else if (!gameState.inCombat && move.mechanics?.exploration) {
        // Exploration effects
        if (move.mechanics.exploration.obstacleTypes) {
            // Let AI handle obstacle interaction
            log(`Move ${move.name} can overcome obstacles: ${move.mechanics.exploration.obstacleTypes.join(', ')}`);
        }
        
        if (move.mechanics.exploration.puzzleBonus) {
            // Store puzzle bonus for AI to use
            gameState.currentPuzzleBonus = move.mechanics.exploration.puzzleBonus;
            log(`Applied puzzle bonus: ${move.mechanics.exploration.puzzleBonus}`);
        }

        if (move.mechanics.exploration.environmentalEffect) {
            // Let AI handle environmental effects
            log(`Move ${move.name} affects environment: ${move.mechanics.exploration.environmentalEffect}`);
        }
    }

    UI.showPopup(`${player.name} uses ${move.name}!`, 'skill');

    // Update UI
    if (gameState.currentScreen === 'specialMovesScreen') UI.renderSpecialMoves();
    UI.renderPlayerCards();
    if (gameState.inCombat) UI.renderEnemyCards();

    // If enemy was defeated by the move, don't trigger AI narration
    if (enemyDefeated) {
        log("Enemy defeated by special move, skipping AI narration");
        return;
    }

    // Construct AI prompt with context
    const context = gameState.inCombat ? 'combat' : 'exploration';
    const actionLog = `${player.name} uses the special move: ${move.name}! (Context: ${context}, Effect: ${move.effect})`;
    log(`Sending special move action to AI: ${actionLog}`);

    // Trigger AI
    UI.showLoading(true, 'Narrating special move...');
    try {
        await makeAICallForSystemAction(actionLog, false);
    } catch (error) {
        log(`Error during AI call in useSpecialMove: ${error.message}`);
        move.currentCooldown = 0;
        // BUG-18 fix: previously the catch refunded the cooldown but NOT
        // the MP cost. Player lost 30 MP on a Time-Stop attempt that errored
        // before any narration. Refund both.
        if (mpSpent > 0 && player) {
            player.mp = Math.min(player.maxMp || 100, (player.mp || 0) + mpSpent);
            log(`Refunded ${mpSpent} MP to ${player.name} after special-move AI error.`);
        }
        UI.renderChoices(gameState.currentChoices || []); // (empty call left only a dead placeholder)
    } finally {
        UI.showLoading(false);
        if (gameState.currentScreen === 'specialMovesScreen') {
            setTimeout(() => { 
                if (gameState.currentScreen === 'specialMovesScreen') 
                    UI.showScreen('gameScreen'); 
            }, 100);
        }
    }
    log("useSpecialMove finished.");
}

/** Opens the modal to select an ally to help. UI setup action. Does not use turn. */
export function openHelpAllyModal() {
     const log = window.displayVisualError || console.log; // Use logger
     log("Opening Help Ally modal...");
     const player = getCurrentPlayer();
     if (!player || player.isDowned || gameState.isLoading) {
          const reason = !player ? "No player data" : (player.isDowned ? "Player is downed" : "Game is loading");
          log(`Cannot open Help Ally modal: ${reason}.`);
          UI.showPopup("Cannot help allies now.", 'warning');
          return;
     }
     const downedAllies = gameState.players?.filter(p => p && p.id !== player.id && p.isDowned) || [];
     log(`Downed allies found: ${downedAllies.length > 0 ? downedAllies.map(p => p.name).join(', ') : 'None'}`);
     const revivalItems = player.inventory?.filter(item => item?.stats?.revive === true) || [];
     const revivalItemCount = revivalItems.length;
     let revivalItemName = Config.REVIVAL_ITEM_DEFAULT_NAME;
     try { revivalItemName = Items.themedItemData[gameState.adventureTheme]?.RevivalItemName || Config.REVIVAL_ITEM_DEFAULT_NAME; } catch (e) { log("Error getting themed revival item name, using default.", e); }
     log(`Player has ${revivalItemCount} revival items (${revivalItemName}).`);
     UI.updateHelpAllyModal(downedAllies, revivalItemCount, revivalItemName);
     UI.showModal('helpAllyModal');
 }

/** Initiates the Help Ally action for the current player on a specific target. Consumes item, revives target, advances turn. */
export async function helpAlly(targetPlayerId) {
      const log = window.displayVisualError || console.log; // Use logger
      log(`Attempting to help ally ID: ${targetPlayerId}`);
      if (!canCurrentPlayerAct()) { // Standard action check
           log(`Action blocked: Cannot help ally now.`);
           UI.showPopup("Cannot perform action.", 'warning');
           UI.hideModal('helpAllyModal');
           return;
      }
      const helper = getCurrentPlayer();
      if (!helper) { log("ERROR: Helper player not found."); UI.hideModal('helpAllyModal'); return; } // Added helper check just in case

      const target = gameState.players?.find(p => p && p.id === targetPlayerId);
      const revivalItemIndex = helper.inventory?.findIndex(item => item?.stats?.revive === true);

      // Validate target and item
      if (!target) {
          log(`ERROR: Help Ally failed - Target ally ${targetPlayerId} not found!`);
          UI.showPopup("Target ally not found!", 'error'); UI.hideModal('helpAllyModal'); return;
      }
      if (!target.isDowned) {
           log(`ERROR: Help Ally failed - Target ${target.name} is not downed!`);
           UI.showPopup(`${target.name} is not downed!`, 'error'); UI.hideModal('helpAllyModal'); return;
      }
      if (revivalItemIndex === undefined || revivalItemIndex === -1) {
           log(`ERROR: Help Ally failed - No revival items available for ${helper.name}.`);
           UI.showPopup("No revival items available!", 'error'); UI.hideModal('helpAllyModal'); return;
       }

      // Consume item and revive target
      // One from the stack, not the whole stack.
      const stacked = helper.inventory[revivalItemIndex];
      const revivalItem = (Number(stacked.quantity) || 1) > 1
          ? (stacked.quantity -= 1, stacked)
          : helper.inventory.splice(revivalItemIndex, 1)[0];
      log(`Consumed revival item: ${revivalItem.name} from ${helper.name}.`);

      target.isDowned = false;
      let reviveHealAmount = Math.floor(target.maxHp * Config.REVIVE_HP_PERCENT_ITEM); // Default %
      // Check if item overrides default healing amount/percent
      if (typeof revivalItem.stats?.heal === 'number') {
          reviveHealAmount = revivalItem.stats.heal;
          log(`Using item's flat heal value: ${reviveHealAmount}`);
      } else if (typeof revivalItem.stats?.healPercent === 'number') {
          reviveHealAmount = Math.floor(target.maxHp * revivalItem.stats.healPercent);
          log(`Using item's percent heal value: ${revivalItem.stats.healPercent * 100}% -> ${reviveHealAmount}`);
      } else {
          log(`Using default revive heal percent: ${Config.REVIVE_HP_PERCENT_ITEM * 100}% -> ${reviveHealAmount}`);
      }
      target.hp = clamp(reviveHealAmount, 1, target.maxHp); // Ensure at least 1 HP
      target.downedTurns = 0;
      Combat.recalculateCharacterStats(target); // Recalculate in case stats were affected by being downed (if applicable)

      log(`${target.name} revived by ${helper.name} using ${revivalItem.name}. New HP: ${target.hp}`);
      UI.showPopup(`${helper.name} used ${revivalItem.name} to revive ${target.name}!`, 'success');

      // Update UI before advancing turn
      UI.hideModal('helpAllyModal');
      if (gameState.currentScreen === 'inventoryScreen') UI.renderInventory(); // Update helper's inventory if open
      UI.renderPlayerCards(); // Update both players' cards

      // Turn advancement happens AFTER showing popups etc.
      log("Help Ally action complete. Advancing turn.");
      // In a fight the turn passes through the combat order, so the foes answer.
      if (gameState.inCombat && gameState.combat?.isActive) await Combat.advanceCombatTurn();
      else await advanceTurn(); // Uses a turn
      log("helpAlly finished.");
 }


/**
 * Calculate the actual price of an item based on reputation modifiers
 * @param {Object} itemData - Item data with base cost
 * @returns {number} Modified price based on reputation
 */
export function calculateItemPrice(itemData) {
    // The price on the tag (faction markets were removed: 2026-10-08).
    return itemData && typeof itemData.cost === 'number' ? itemData.cost : 0;
}


// Average age of the party, for the kid-safe fight reminder.
function averagePartyAge() {
    const ages = (gameState.players || []).map(p => p?.age).filter(a => typeof a === 'number' && a > 0);
    return ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 99;
}

/** Sell one of an item to the shop for half its price (not equipped gear, quest items or mid-fight). */
export function sellInventoryItem(itemId) {
    const player = getCurrentPlayer();
    const idx = player?.inventory?.findIndex(i => i && i.id === itemId) ?? -1;
    if (idx === -1 || gameState.inCombat) return;
    const item = player.inventory[idx];
    if (item.type === 'Quest' || player.equipment?.weapon === itemId || player.equipment?.armor === itemId) return;
    const coins = UI.sellValue(item);
    if ((item.quantity ?? 1) > 1) item.quantity -= 1;
    else player.inventory.splice(idx, 1);
    player.coins = (player.coins || 0) + coins;
    UI.showPopup(`Sold ${item.name} for ${coins} coins`, 'coins', 2500);
    UI.renderInventory();
    UI.renderPlayerCards();
    UI.updateContextHeaders();
    import('./saveLoad.js').then(m => m.autosave()).catch(() => {});
}
