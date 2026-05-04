// engine.js
// Phase 1 deterministic state-diff engine.
//
// The narrator LLM proposes JSON-Patch-style operations describing what
// changed in the world this turn (player gains an item, HP changes, an
// enemy appears, location updates, milestone reached). This module is the
// SINGLE place those operations are applied to gameState. The narrator can
// never directly mutate state — every mutation is checked against an
// allowlist of paths, type-checked, and applied here.
//
// This replaces three failure modes the live test surfaced:
//   1. Story inventing inventory items the player doesn't have.
//   2. Choices not driving consequences (HP/coins/quest never moving).
//   3. Combat never starting because no narrator pathway proposed it.
//
// The op shape is RFC-6902-inspired (add / remove / replace), but the path
// grammar is OUR grammar — keyed to our gameState tree, single-player
// indices baked in for now (multi-player is a Phase 3 concern).

import { gameState, recordPlayerChoice, recordStoryBeat, recordWorldStateChange } from './state.js?cb=014';
import * as Combat from './combat.js?cb=014';
import * as Config from './config.js?cb=014';

/**
 * Phase 1.2: Look up a status effect from Config.STATUS_EFFECTS by name
 * (case-insensitive). The narrator typically writes "Poison" or "Stun"
 * without filling in defaultData / defaultDuration — without this lookup
 * those effects are mechanically hollow (no damage-per-turn, no disable
 * flag), so combat ticks did nothing.
 *
 * The catalog key in config.js is upper-cased ('POISON', 'STUN'); the
 * value's `name` field has the user-visible form. We try both.
 */
function lookupStatusEffectCatalog(name) {
    if (!name || typeof name !== 'string') return null;
    const catalog = Config.STATUS_EFFECTS || {};
    const upper = name.toUpperCase();
    if (catalog[upper]) return catalog[upper];
    // Fall back to a name-match search (handles "Burn" vs "BURN" mismatch
    // when the LLM is creative with capitalization).
    for (const entry of Object.values(catalog)) {
        if (entry && typeof entry.name === 'string'
            && entry.name.toLowerCase() === name.toLowerCase()) {
            return entry;
        }
    }
    return null;
}

/**
 * Phase 1.2: Build a fully-resolved status effect object from a narrator-
 * supplied value, merging in catalog defaults for duration and tick data.
 * The narrator's explicit fields always take precedence over the catalog.
 */
function buildStatusEffectFromValue(value) {
    const catalogEntry = lookupStatusEffectCatalog(value.name);
    const duration = typeof value.duration === 'number'
        ? value.duration
        : (catalogEntry?.defaultDuration ?? 3);
    const tickData = value.effectTickData
        || value.defaultData
        || catalogEntry?.defaultData
        || {};
    return {
        id: value.id || `eff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: catalogEntry?.name || value.name,
        type: catalogEntry?.type || value.type || 'debuff',
        icon: catalogEntry?.icon || value.icon || '',
        duration,
        effectTickData: tickData,
        source: value.source || 'narration',
        canStack: catalogEntry?.canStack ?? value.canStack ?? false,
        resistanceType: catalogEntry?.resistanceType || value.resistanceType
    };
}

// ---- Path allowlist ---------------------------------------------------------
// Each entry maps a regex over the path to a handler {op, validator}.
// Handlers know how to walk gameState and apply or reject the op.
// Paths use leading '/' and slash separators (RFC-6902 syntax). Player and
// enemy indices are explicit numbers; '-' means append (RFC 6902).

const PATHS = [
    // ---- Player vitals ----
    {
        regex: /^\/players\/(\d+)\/(hp|mp|coins)$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (typeof value !== 'number' || !Number.isFinite(value)) return `${m[2]} must be a finite number`;
            if (value < 0) return `${m[2]} cannot be negative`;
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const field = m[2];
            const player = gs.players[idx];
            if (field === 'hp') player.hp = Math.min(player.maxHp, value);
            else if (field === 'mp') player.mp = Math.min(player.maxMp, value);
            else if (field === 'coins') player.coins = Math.max(0, value);
            return `${player.name}.${field} = ${player[field]}`;
        }
    },

    // ---- Player inventory: add (append) ----
    {
        regex: /^\/players\/(\d+)\/inventory\/-$/,
        ops: ['add'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (!value || typeof value !== 'object') return 'inventory item must be an object';
            if (!value.name || typeof value.name !== 'string') return 'item.name is required';
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const player = gs.players[idx];
            const item = {
                id: value.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: value.name,
                type: value.type || 'Misc',
                tier: value.tier || 'Low',
                effect: value.effect || '',
                stats: value.stats || {},
                quantity: value.quantity ?? 1
            };
            player.inventory = player.inventory || [];
            player.inventory.push(item);
            return `${player.name} gained item "${item.name}"`;
        }
    },

    // ---- Player inventory: remove a specific item by id ----
    {
        regex: /^\/players\/(\d+)\/inventory\/([a-zA-Z0-9_-]+)$/,
        ops: ['remove'],
        validate: (m, _value, gs) => {
            const idx = Number(m[1]);
            const itemId = m[2];
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (!(gs.players[idx].inventory || []).some(it => it && it.id === itemId)) {
                return `item ${itemId} not in inventory`;
            }
            return null;
        },
        apply: (m, _value, gs) => {
            const idx = Number(m[1]);
            const itemId = m[2];
            const player = gs.players[idx];
            const before = player.inventory.length;
            player.inventory = player.inventory.filter(it => it.id !== itemId);
            return `removed item ${itemId} (${before} -> ${player.inventory.length})`;
        }
    },

    // ---- Player equipment: equip / unequip ----
    {
        regex: /^\/players\/(\d+)\/equipment\/(weapon|armor)$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (value !== null && typeof value !== 'string') return 'equipment value must be item id (string) or null';
            if (typeof value === 'string') {
                if (!(gs.players[idx].inventory || []).some(it => it && it.id === value)) {
                    return `item ${value} not in inventory`;
                }
            }
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const slot = m[2];
            const player = gs.players[idx];
            player.equipment = player.equipment || { weapon: null, armor: null };
            const old = player.equipment[slot];
            if (old) {
                const oldItem = (player.inventory || []).find(it => it && it.id === old);
                if (oldItem) oldItem.equippedSlot = null;
            }
            player.equipment[slot] = value;
            if (typeof value === 'string') {
                const newItem = (player.inventory || []).find(it => it && it.id === value);
                if (newItem) newItem.equippedSlot = slot;
            }
            // Recalc derived stats
            try { Combat.recalculateCharacterStats(player); } catch (_) {}
            return `${player.name}.equipment.${slot} = ${value}`;
        }
    },

    // ---- Player status effects: append ----
    {
        regex: /^\/players\/(\d+)\/statusEffects\/-$/,
        ops: ['add'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (!value || typeof value !== 'object' || !value.name) return 'statusEffect must have a name';
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const player = gs.players[idx];
            player.statusEffects = player.statusEffects || [];
            // Phase 1.2: resolve catalog defaults (duration + tick data)
            // so named effects like "Poison" actually do damage-per-turn
            // even when the narrator only supplies the name.
            const effect = buildStatusEffectFromValue(value);
            player.statusEffects.push(effect);
            return `${player.name} status: +${effect.name}`;
        }
    },

    // ---- Player core stats (god-mode primarily; narrator may also adjust) ----
    {
        regex: /^\/players\/(\d+)\/(maxHp|maxMp|atk|def|level)$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (typeof value !== 'number' || !Number.isFinite(value)) return `${m[2]} must be a finite number`;
            if (value < 0) return `${m[2]} cannot be negative`;
            // Cap absurd values to keep narrative grounded; god mode can hit 9999
            // but not a billion (which breaks UI / save serialization).
            if (value > 99999) return `${m[2]} cannot exceed 99999 (god-mode reasonable cap)`;
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const field = m[2];
            const player = gs.players[idx];
            player[field] = value;
            // Raise current to new max if max increased
            if (field === 'maxHp' && (player.hp || 0) > value) player.hp = value;
            if (field === 'maxMp' && (player.mp || 0) > value) player.mp = value;
            return `${player.name}.${field} = ${value}`;
        }
    },

    // ---- Player skills / spells / specialMoves (god-mode learn-a-skill) ----
    {
        regex: /^\/players\/(\d+)\/specialMoves\/-$/,
        ops: ['add'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (!value || typeof value !== 'object') return 'specialMove must be an object';
            if (!value.name || typeof value.name !== 'string') return 'specialMove.name is required';
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const player = gs.players[idx];
            player.specialMoves = player.specialMoves || [];
            // Dedupe by name (case-insensitive) — repeated god-mode "I learn fireball"
            // shouldn't stack the same skill 5 times.
            const norm = String(value.name).trim().toLowerCase();
            if (player.specialMoves.some(m => String(m?.name || '').trim().toLowerCase() === norm)) {
                return `specialMove "${value.name}" already known (no-op)`;
            }
            player.specialMoves.push({
                id: value.id || `move_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: value.name,
                description: value.description || '',
                cooldown: typeof value.cooldown === 'number' ? value.cooldown : 2,
                currentCooldown: 0,
                mpCost: typeof value.mpCost === 'number' ? value.mpCost : 0,
                usageContext: value.usageContext || 'both', // 'combat' | 'exploration' | 'both'
                mechanics: value.mechanics || {},
                source: value.source || 'narration'
            });
            return `${player.name} learned skill "${value.name}"`;
        }
    },

    // ---- Entity memory: NPCs / locations / items (canonicalize narrator's world) ----
    {
        regex: /^\/entityMemory\/(npcs|locations|items)\/([a-zA-Z0-9 _'-]+)$/,
        ops: ['add', 'replace'],
        validate: (m, value) => {
            if (!value || typeof value !== 'object') return 'entity must be an object';
            if (!value.name && !m[2]) return 'entity needs a name';
            return null;
        },
        apply: (m, value, gs) => {
            const category = m[1];
            const key = (value.name || m[2]).trim();
            gs.entityMemory = gs.entityMemory || { npcs: {}, locations: {}, items: {} };
            gs.entityMemory[category] = gs.entityMemory[category] || {};
            gs.entityMemory[category][key] = {
                name: key,
                description: value.description || '',
                traits: value.traits || [],
                relationship: value.relationship || (category === 'npcs' ? 'neutral' : undefined),
                lastSeenTurn: gs.turn,
                createdInGodMode: !!gs.isGoalComplete,
                ...value
            };
            return `entityMemory.${category}["${key}"] set`;
        }
    },

    // ---- Side quests (Phase 3.5 P7) ----
    // /questProgress/sideQuests/- (add) creates a new side quest entry.
    // /questProgress/sideQuests/<id>/completed (replace) marks one done.
    // Side quests are independent of the main quest's milestones list and
    // surface in the side-quest panel of the UI.
    {
        regex: /^\/questProgress\/sideQuests\/-$/,
        ops: ['add'],
        validate: (_m, value) => {
            if (!value || typeof value !== 'object') return 'sideQuest must be an object';
            if (!value.name || typeof value.name !== 'string') return 'sideQuest.name required';
            return null;
        },
        apply: (_m, value, gs) => {
            gs.questProgress = gs.questProgress || { sideQuests: [] };
            gs.questProgress.sideQuests = gs.questProgress.sideQuests || [];
            // Dedupe by name (case-insensitive) — narrator may emit the same
            // side quest twice across turns; second add is a no-op.
            const norm = String(value.name).trim().toLowerCase();
            if (gs.questProgress.sideQuests.some(q => String(q?.name || '').trim().toLowerCase() === norm)) {
                return `sideQuest "${value.name}" already exists (no-op)`;
            }
            const id = value.id || `sq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            gs.questProgress.sideQuests.push({
                id,
                name: value.name,
                description: value.description || '',
                giver: value.giver || '',
                location: value.location || gs.currentLocation?.name || '',
                reward: value.reward || '',
                turnAccepted: gs.turn,
                completed: false,
                progress: 0
            });
            return `+sideQuest "${value.name}" (id ${id})`;
        }
    },
    {
        // BUG-12 fix: widened from `[a-zA-Z0-9_-]+` to accept apostrophes,
        // spaces, hyphens — so narrator-invented ids ("the_villagers'_plea",
        // "Find the lost cat") aren't silently rejected. The validator does
        // the real lookup with id-then-name fuzzy match.
        regex: /^\/questProgress\/sideQuests\/([^/]+)\/(completed|progress)$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            const idOrName = decodeURIComponent(m[1]);
            const field = m[2];
            const list = gs.questProgress?.sideQuests || [];
            // Try exact id, exact name, then fuzzy (case+separator-insensitive name).
            const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_'-]+/g, ' ');
            const target = norm(idOrName);
            const quest = list.find(q => q?.id === idOrName)
                       || list.find(q => norm(q?.name) === target)
                       || list.find(q => norm(q?.id)   === target);
            if (!quest) return `sideQuest "${idOrName}" not found (engine has: ${list.map(q => q.id).join(', ') || '∅'})`;
            if (field === 'completed' && typeof value !== 'boolean') return 'completed must be boolean';
            if (field === 'progress' && (typeof value !== 'number' || value < 0 || value > 100)) return 'progress must be 0-100';
            return null;
        },
        apply: (m, value, gs) => {
            const idOrName = decodeURIComponent(m[1]);
            const field = m[2];
            const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_'-]+/g, ' ');
            const target = norm(idOrName);
            const quest = gs.questProgress.sideQuests.find(q => q?.id === idOrName)
                       || gs.questProgress.sideQuests.find(q => norm(q?.name) === target)
                       || gs.questProgress.sideQuests.find(q => norm(q?.id)   === target);
            if (!quest) return `sideQuest "${idOrName}" vanished`;
            quest[field] = value;
            if (field === 'completed' && value === true) {
                quest.turnCompleted = gs.turn;
                quest.progress = 100;
                return `sideQuest "${quest.name}" completed (matched on ${idOrName === quest.id ? 'id' : 'name'})`;
            }
            return `sideQuest "${quest.name}".${field} = ${value}`;
        }
    },

    // ---- Reputation factions (Phase 3.5 P2) ----
    // Lets the narrator nudge faction trust based on player choices
    // (helping a noble → +authority, robbing a merchant → -common, etc).
    // The legacy reputation system already maintains priceModifiers and
    // service availability based on these values; we just need a way to
    // mutate them via the narrator's diff. Clamped to [-100, 100].
    {
        regex: /^\/reputationSystem\/factions\/(authority|warriors|naturalists|shadows|scholars|common)$/,
        ops: ['replace'],
        validate: (m, value) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return 'reputation value must be a finite number';
            if (value < -100 || value > 100) return 'reputation must be in [-100, 100]';
            return null;
        },
        apply: (m, value, gs) => {
            const faction = m[1];
            gs.reputationSystem = gs.reputationSystem || { factions: {} };
            gs.reputationSystem.factions = gs.reputationSystem.factions || {};
            const old = gs.reputationSystem.factions[faction] || 0;
            gs.reputationSystem.factions[faction] = value;
            // Track history so the narrator's next turn knows this just changed.
            gs.reputationSystem.reputationHistory = gs.reputationSystem.reputationHistory || [];
            gs.reputationSystem.reputationHistory.push({
                turn: gs.turn, faction, from: old, to: value, delta: value - old
            });
            // Keep history bounded.
            if (gs.reputationSystem.reputationHistory.length > 50) {
                gs.reputationSystem.reputationHistory = gs.reputationSystem.reputationHistory.slice(-50);
            }
            gs.reputationSystem.lastReputationUpdate = gs.turn;
            const dir = value > old ? '+' : '';
            return `reputation.${faction}: ${old} → ${value} (${dir}${value - old})`;
        }
    },

    // ---- Combat: enter / exit ----
    {
        regex: /^\/inCombat$/,
        ops: ['replace'],
        validate: (_m, value) => {
            if (typeof value !== 'boolean') return 'inCombat must be boolean';
            return null;
        },
        apply: (_m, value, gs) => {
            const wasInCombat = !!gs.inCombat;
            gs.inCombat = value;
            // A7: When the narrator flips inCombat false→true, the combat
            // machinery (initiative, currentTurnIndex, isActive, formation)
            // needs proper initialization. Without this, advanceCombatTurn
            // early-returns and downstream logic chases a missing object.
            // Smoke #4 hung exactly here — the narrator added enemies + set
            // inCombat=true via the engine, but gs.combat stayed undefined.
            if (value && !wasInCombat) {
                const liveEnemies = (gs.enemies || []).filter(e => e && !e.isDefeated);
                if (liveEnemies.length > 0) {
                    try {
                        Combat.initializeCombat(liveEnemies);
                    } catch (e) {
                        const msg = `engine: Combat.initializeCombat failed: ${e?.message || e}`;
                        const log = window.displayVisualError || console.log;
                        log(msg);
                    }
                } else {
                    // No enemies yet — defer; narrator should also add /enemies/-.
                    // Just ensure gs.combat is at least a stub so checks against
                    // gs.combat?.isActive don't drift.
                    gs.combat = gs.combat || { isActive: true, round: 1, initiative: [], currentTurnIndex: 0, activeEffects: [], formation: { frontLine: [], backLine: [] } };
                }
            } else if (!value && gs.combat) {
                gs.combat.isActive = false;
            }
            return `inCombat = ${value}${value && !wasInCombat ? ' (combat object initialized)' : ''}`;
        }
    },

    // ---- Enemies: append (spawn) ----
    {
        regex: /^\/enemies\/-$/,
        ops: ['add'],
        validate: (_m, value) => {
            if (!value || typeof value !== 'object') return 'enemy must be an object';
            if (!value.name || typeof value.name !== 'string') return 'enemy.name required';
            if (typeof value.hp !== 'number' || value.hp <= 0) return 'enemy.hp must be a positive number';
            return null;
        },
        apply: (_m, value, gs) => {
            gs.enemies = gs.enemies || [];
            const enemy = {
                id: value.id || `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: value.name,
                hp: value.hp,
                maxHp: value.maxHp || value.hp,
                atk: value.atk || 5,
                def: value.def || 2,
                abilities: Array.isArray(value.abilities) ? value.abilities : ['Basic Attack'],
                statusEffects: [],
                isDefeated: false,
                lootTier: value.lootTier || 'Low',
                lootChance: typeof value.lootChance === 'number' ? value.lootChance : 0.5
            };
            gs.enemies.push(enemy);
            return `+enemy "${enemy.name}" (HP ${enemy.hp}/${enemy.maxHp})`;
        }
    },

    // ---- Enemy status effects: append (Phase 3.5 P1) ----
    // Lets the narrator apply Poison/Stun/Burn/etc to a specific enemy via
    // a diff op alongside the attack narration. Engine resolves the catalog
    // entry by name on apply if `defaultData` is missing from the value.
    {
        regex: /^\/enemies\/(\d+)\/statusEffects\/-$/,
        ops: ['add'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.enemies?.[idx]) return `enemies[${idx}] does not exist`;
            if (!value || typeof value !== 'object' || !value.name) return 'statusEffect must have a name';
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const enemy = gs.enemies[idx];
            enemy.statusEffects = enemy.statusEffects || [];
            // Phase 1.2: same catalog resolution as the player path —
            // named effects pull defaultDuration + defaultData so combat
            // tick logic actually applies the right damage / disable flags.
            const effect = buildStatusEffectFromValue(value);
            enemy.statusEffects.push(effect);
            return `${enemy.name} status: +${effect.name}`;
        }
    },

    // ---- Enemies: HP change / defeat ----
    {
        regex: /^\/enemies\/(\d+)\/(hp|isDefeated)$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            const idx = Number(m[1]);
            if (!gs.enemies?.[idx]) return `enemies[${idx}] does not exist`;
            if (m[2] === 'hp') {
                if (typeof value !== 'number' || !Number.isFinite(value)) return 'hp must be a finite number';
            } else if (m[2] === 'isDefeated') {
                if (typeof value !== 'boolean') return 'isDefeated must be boolean';
            }
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const enemy = gs.enemies[idx];
            if (m[2] === 'hp') enemy.hp = Math.max(0, value);
            else enemy.isDefeated = value;
            if (enemy.hp <= 0 && !enemy.isDefeated) enemy.isDefeated = true;
            return `${enemy.name}.${m[2]} = ${enemy[m[2]]}`;
        }
    },

    // ---- Location ----
    {
        regex: /^\/currentLocation$/,
        ops: ['replace'],
        validate: (_m, value, gs) => {
            if (!value || typeof value !== 'object' || !value.name) return 'currentLocation must be an object with at least a name';
            // Phase 2.6: reject location changes while imprisoned UNLESS the
            // narrator is moving to/from a jail-typed location (which the
            // jail system itself manages). The escape itself is handled by
            // jailSystem.completeJailEscape, not by an arbitrary
            // /currentLocation diff op.
            if (gs.imprisoned && value.type !== 'jail') {
                return 'cannot change location while imprisoned — complete the jail_escape quest first';
            }
            return null;
        },
        apply: (_m, value, gs) => {
            const oldName = gs.currentLocation?.name || '(none)';
            gs.currentLocation = {
                name: value.name,
                type: value.type || 'unknown',
                dangerLevel: typeof value.dangerLevel === 'number' ? value.dangerLevel : 0.3,
                description: value.description || ''
            };
            try { recordWorldStateChange('movement', `Moved to ${value.name}`, value.name, 'local'); } catch (_) {}
            return `location: ${oldName} -> ${value.name}`;
        }
    },

    // ---- Adventure goal & quest progress ----
    {
        regex: /^\/adventureGoal$/,
        ops: ['replace'],
        validate: (_m, value) => {
            if (typeof value !== 'string' || !value.trim()) return 'adventureGoal must be a non-empty string';
            return null;
        },
        apply: (_m, value, gs) => {
            gs.adventureGoal = value.trim();
            return `adventureGoal updated`;
        }
    },
    {
        regex: /^\/questProgress\/milestones\/-$/,
        ops: ['add'],
        validate: (_m, value, gs) => {
            if (!value || typeof value !== 'object' || !value.name) return 'milestone must have a name';
            // Dedupe: the narrator sometimes proposes the same milestone on
            // consecutive turns. Reject the second one rather than letting
            // the quest log fill up with duplicates. Compare names case-
            // insensitively so "Stakes Clear" / "stakes clear" / "stakes_clear"
            // all collapse.
            const norm = String(value.name).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
            const existing = gs?.questProgress?.milestones || [];
            const isDup = existing.some(m => {
                const n = String(m?.name || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
                return n === norm;
            });
            if (isDup) return `duplicate milestone "${value.name}" (already recorded)`;
            return null;
        },
        apply: (_m, value, gs) => {
            gs.questProgress = gs.questProgress || { milestones: [] };
            gs.questProgress.milestones = gs.questProgress.milestones || [];
            // BUG-24 fix: normalize the stored name to canonical snake_case
            // so the dedupe scan, the quest-log lookup, and the jail-system
            // milestone hook all see the same form regardless of whether the
            // narrator emitted "Stakes Clear", "stakes-clear", or
            // "stakes_clear". Original is preserved as displayName for UI.
            const original = String(value.name).trim();
            const canonicalName = original
                .toLowerCase()
                .replace(/[^a-z0-9_]+/g, '_')   // collapse anything not snake_case to _
                .replace(/_+/g, '_')             // squash repeated underscores
                .replace(/^_|_$/g, '');          // trim leading/trailing _
            const milestone = {
                id: value.id || `ms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: canonicalName || original,  // canonical for engine lookups
                displayName: original,             // pretty form for UI
                description: value.description || '',
                turn: gs.turn,
                completed: true
            };
            gs.questProgress.milestones.push(milestone);
            try { recordStoryBeat('milestone', canonicalName, 0.7); } catch (_) {}
            // Phase 2: jail mini-quest hook. Pass the canonical name — the
            // jailSystem.tryApplyJailMilestone now matches "jail_assessed"
            // exactly, so canonical normalization here means narrator
            // variants ("Jail Assessed", "jail-assessed") all route correctly.
            try {
                if (gs.imprisoned && typeof window !== 'undefined' && window.__jailSystem?.tryApplyJailMilestone) {
                    window.__jailSystem.tryApplyJailMilestone(canonicalName);
                }
            } catch (_) { /* don't let the hook break milestone application */ }
            return `milestone: ${canonicalName}${canonicalName !== original ? ` (normalized from "${original}")` : ''}`;
        }
    },
    {
        regex: /^\/questProgress\/completionPercentage$/,
        ops: ['replace'],
        validate: (_m, value) => {
            if (typeof value !== 'number' || value < 0 || value > 100) return 'completionPercentage must be 0-100';
            return null;
        },
        apply: (_m, value, gs) => {
            gs.questProgress = gs.questProgress || {};
            // Clamp monotonic non-decreasing — the narrator sometimes emits a
            // smaller number on a later turn (smoke #2 saw 45 → 25). The
            // quest bar should never run backwards … EXCEPT when value is
            // exactly 0, which is treated as an explicit full reset (used
            // when a new main quest is being declared, e.g. via god-mode
            // retirement). Going to 0 is intentional; going to 25 from 45
            // is sloppy narrator output.
            //
            // BUG FIX (2026-04-30): also cap by turn so the narrator can't
            // dump all Act 1 milestones in turn 1 and show the player 30%
            // when they just started. Pacing curve: turn 1 → 8%, turn 4 → 20%,
            // turn 10 → 40%, turn 20+ → no cap. (User shouldn't be in god
            // mode and at 30% on turn 1.)
            const current = typeof gs.questProgress.completionPercentage === 'number'
                ? gs.questProgress.completionPercentage : 0;
            const turn = gs.turn || 1;
            // Skip the turn cap entirely once god mode is unlocked — the
            // player has earned authorial control.
            if (!gs.isGoalComplete) {
                let turnCap = 100;
                if (turn <= 1) turnCap = 0;       // initial story = 0%, player hasn't acted yet
                else if (turn <= 3) turnCap = 12;
                else if (turn <= 6) turnCap = 22;
                else if (turn <= 10) turnCap = 38;
                else if (turn <= 15) turnCap = 58;
                else if (turn <= 20) turnCap = 78;
                if (value > turnCap) {
                    const log = window.displayVisualError || console.log;
                    log(`engine: completionPercentage clamped from ${value} to ${turnCap} (turn ${turn} cap; narrator pacing too aggressive).`);
                    value = turnCap;
                }
            }
            if (value === 0) {
                // BUG-21 fix: previously a stray narrator emit of 0 mid-quest
                // would silently wipe all milestones. Only honor the reset
                // when god-mode retirement is in play (isGoalComplete=true)
                // or when the previous value was already 0 (initial state).
                // Otherwise treat 0 as a regression and clamp to current.
                const isLegitimateReset = gs.isGoalComplete === true || current === 0;
                if (!isLegitimateReset) {
                    const log = window.displayVisualError || console.log;
                    log(`engine: completionPercentage=0 ignored mid-quest (current ${current}%, narrator likely glitching). Use isGoalComplete=true for god-mode retirement.`);
                    return `quest progress = ${current}% (regressive 0 ignored)`;
                }
                gs.questProgress.completionPercentage = 0;
                // Also clear milestones — a new quest starts with a fresh log.
                if (Array.isArray(gs.questProgress.milestones) && gs.questProgress.milestones.length > 0) {
                    gs.questProgress.milestones = [];
                    return `quest progress = 0% (full reset; milestones cleared)`;
                }
                return `quest progress = 0% (reset)`;
            }
            const next = Math.max(current, value);
            gs.questProgress.completionPercentage = next;
            return next === value
                ? `quest progress = ${next}%`
                : `quest progress = ${next}% (clamped from regressive ${value})`;
        }
    },
    {
        regex: /^\/isGoalComplete$/,
        ops: ['replace'],
        validate: (_m, value) => {
            if (typeof value !== 'boolean') return 'isGoalComplete must be boolean';
            return null;
        },
        apply: (_m, value, gs) => {
            const wasComplete = !!gs.isGoalComplete;
            gs.isGoalComplete = value;
            // false → true: unlock god mode (the original Phase 3 reward).
            if (value && !wasComplete) {
                gs.allowCustomActions = true;
                if (gs.godModeManager) {
                    try {
                        gs.godModeManager.checkUnlockConditions();
                        if (typeof gs.godModeManager.activateGodMode === 'function') {
                            gs.godModeManager.activateGodMode();
                        }
                    } catch (_) {}
                }
                return `isGoalComplete = true (allowCustomActions enabled, god mode activated)`;
            }
            // true → false: god-mode retirement. Player wields their power
            // to renounce it and begin a new mortal arc. Deactivate the
            // god-mode UI, gate custom actions back, but keep all earned
            // items/skills/stats — power persists across the reset, only
            // the omnipotent UI goes away.
            if (!value && wasComplete) {
                gs.allowCustomActions = false;
                if (gs.godModeManager) {
                    try {
                        if (typeof gs.godModeManager.deactivateGodMode === 'function') {
                            gs.godModeManager.deactivateGodMode();
                        }
                    } catch (_) {}
                }
                return `isGoalComplete = false (god mode retired; new quest begins; earned powers retained)`;
            }
            return `isGoalComplete = ${value}`;
        }
    }
];

/**
 * Validate a single op against the path allowlist.
 * @returns {{ok: true, handler: object, match: RegExpMatchArray} | {ok: false, error: string}}
 */
export function validateOp(op) {
    if (!op || typeof op !== 'object') return { ok: false, error: 'op must be an object' };
    if (typeof op.op !== 'string') return { ok: false, error: 'op.op missing' };
    if (typeof op.path !== 'string') return { ok: false, error: 'op.path missing' };

    for (const handler of PATHS) {
        const m = op.path.match(handler.regex);
        if (!m) continue;
        if (!handler.ops.includes(op.op)) {
            return { ok: false, error: `op '${op.op}' not allowed on path '${op.path}' (allowed: ${handler.ops.join(', ')})` };
        }
        const valError = handler.validate(m, op.value, gameState);
        if (valError) return { ok: false, error: `${op.path}: ${valError}` };
        return { ok: true, handler, match: m };
    }
    return { ok: false, error: `path '${op.path}' is not in the allowlist` };
}

/**
 * Apply a list of ops to gameState. Order matters — ops are applied
 * sequentially.
 *
 * BUG-11 note (revised): the "atomic-ish" claim of older versions was
 * misleading. We DO validate every op before applying any of them — but if
 * a handler's apply step throws *during* mutation (e.g. a recalculate-stats
 * crash inside the equipment handler), earlier ops in the same batch stay
 * applied. True rollback would require a structuredClone snapshot per op,
 * which is expensive on per-turn cadence. The validate-first phase catches
 * the vast majority of issues; runtime mutation throws are rare and logged.
 *
 * If you need true rollback for a specific batch, call validateOp on each
 * op first and only invoke applyDiff if all pass — but understand that an
 * exception in handler.apply still leaves partial state.
 */
export function applyDiff(ops, opts = {}) {
    const log = window.displayVisualError || console.log;
    if (!Array.isArray(ops)) throw new Error('ops must be an array');

    // Two-phase commit: validate everything first, then apply.
    const planned = [];
    for (const op of ops) {
        const result = validateOp(op);
        if (!result.ok) {
            const msg = `engine.applyDiff rejected op: ${result.error}`;
            log(msg);
            if (opts.strict) throw new Error(msg);
            // In non-strict mode, skip the bad op and continue with the rest.
            // (Better to apply the legal subset than discard the entire turn.)
            continue;
        }
        planned.push({ op, result });
    }

    const applied = [];
    for (const { op, result } of planned) {
        try {
            const summary = result.handler.apply(result.match, op.value, gameState);
            applied.push(summary);
            log(`engine: applied ${op.op} ${op.path} -> ${summary}`);
        } catch (e) {
            log(`engine: apply failed for ${op.op} ${op.path}: ${e.message}`);
        }
    }

    return applied;
}

/**
/**
 * Build a compact textual summary of allowlisted paths so the system prompt
 * can show the narrator what mutations are available. Keep it short — every
 * token spent here is a token the narrator can't spend on prose.
 */
export function describeAllowedPaths() {
    return [
        '/players/0/hp        (replace, number)',
        '/players/0/mp        (replace, number)',
        '/players/0/coins     (replace, number)',
        '/players/0/maxHp     (replace, number, ≤99999)',
        '/players/0/maxMp     (replace, number, ≤99999)',
        '/players/0/atk       (replace, number) - attack stat',
        '/players/0/def       (replace, number) - defense stat',
        '/players/0/level     (replace, number)',
        '/players/0/inventory/- (add, {name, type, tier, effect, stats})',
        '/players/0/inventory/<id> (remove)',
        '/players/0/equipment/weapon|armor (replace, item id or null)',
        '/players/0/statusEffects/- (add, {name, duration, effectTickData})',
        '/players/0/specialMoves/- (add, {name, description, cooldown, mpCost, usageContext, mechanics})',
        '/inCombat            (replace, boolean) - true to enter combat',
        '/enemies/-           (add, {name, hp, maxHp, atk, def, abilities})',
        '/enemies/<idx>/hp    (replace, number)',
        '/enemies/<idx>/isDefeated (replace, boolean)',
        '/enemies/<idx>/statusEffects/- (add, {name, duration, effectTickData})',
        '/currentLocation     (replace, {name, type, dangerLevel, description})',
        '/adventureGoal       (replace, string)',
        '/questProgress/milestones/- (add, {name, description})',
        '/questProgress/completionPercentage (replace, 0-100)',
        '/questProgress/sideQuests/- (add, {name, description, giver, location, reward})',
        '/questProgress/sideQuests/<id>/completed (replace, boolean)',
        '/questProgress/sideQuests/<id>/progress (replace, 0-100)',
        '/isGoalComplete      (replace, boolean) - unlocks god mode',
        '/entityMemory/npcs/<name>      (add|replace, {name, description, traits, relationship})',
        '/entityMemory/locations/<name> (add|replace, {name, description, traits})',
        '/entityMemory/items/<name>     (add|replace, {name, description, traits})',
        '/reputationSystem/factions/<f> (replace, -100..100; f = authority|warriors|naturalists|shadows|scholars|common)'
    ].join('\n');
}
