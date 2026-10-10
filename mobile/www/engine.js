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

import { gameState, recordStoryBeat, recordWorldStateChange } from './state.js';
import * as Combat from './combat.js';
import * as Config from './config.js';
import { levelUp } from './battle.js';
import { gainXp, usableType, ensureStats, STAT_MAX } from './progression.js';
import * as Items from './items.js';

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
    return Combat.lookupStatusEffect(name);
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
            if (field === 'hp') {
                player.hp = Math.min(player.maxHp, value);
                // HP 0 downs the hero (wipe/jail can follow); healing revives.
                if (player.hp <= 0) player.isDowned = true;
                else if (player.isDowned) { player.isDowned = false; player.downedTurns = 0; }
            }
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
            // Live: the game's loot and the narrator both added the same spear in
            // one turn. Gear can't be owned twice; consumables may stack.
            const t = itemType(value);
            const low = value.name.trim().toLowerCase();
            if (t !== 'Consumable' && (gs.players[idx].inventory || []).some(i => i?.name?.trim().toLowerCase() === low)) {
                return `${value.name} is already in the pack`;
            }
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const player = gs.players[idx];
            const item = {
                id: value.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: value.name,
                type: itemType(value),
                tier: itemTier(value.tier),
                effect: value.effect || '',
                stats: cleanStats(value.stats),
                // "2", -3, 1.5 -> a whole number of at least 1
                quantity: Math.max(1, Math.floor(Number(value.quantity ?? 1) || 1))
            };
            player.inventory = player.inventory || [];
            Items.inferItemEffects(item); // its words become real effects ("maxes out stats", "restores mana")
            // Consumables stack by name instead of filling the pack with copies.
            const stack = item.type === 'Consumable'
                && player.inventory.find(i => i?.type === 'Consumable' && String(i.name).trim().toLowerCase() === item.name.trim().toLowerCase());
            if (stack) {
                stack.quantity = (Number(stack.quantity) || 1) + item.quantity;
                return `${player.name} now has ${stack.quantity}x "${stack.name}"`;
            }
            player.inventory.push(item);
            const st = Object.entries(item.stats || {}).map(([k, v]) => `${k} ${v}`).join(', ');
            return `${player.name} gained item "${item.name}" (${item.tier} ${item.type}${st ? `; ${st}` : ''}${item.effect ? `; "${item.effect.slice(0, 60)}"` : ''})`;
        }
    },

    // ---- Player inventory: remove one item by id or name ----
    // The narrator is never shown ids, so names ("Healing Potion") count too.
    {
        regex: /^\/players\/(\d+)\/inventory\/([^/]+)$/,
        ops: ['remove'],
        validate: (m, _value, gs) => {
            const idx = Number(m[1]);
            if (!gs.players?.[idx]) return `players[${idx}] does not exist`;
            if (!findOwnedItem(gs.players[idx], decodeRef(m[2]))) return `item ${m[2]} not in inventory`;
            return null;
        },
        apply: (m, _value, gs) => {
            const player = gs.players[Number(m[1])];
            const item = findOwnedItem(player, decodeRef(m[2]));
            if ((Number(item.quantity) || 1) > 1) {
                item.quantity -= 1;
                return `used one "${item.name}" (${item.quantity} left)`;
            }
            player.inventory = player.inventory.filter(it => it !== item);
            // Losing worn gear takes its stats with it.
            for (const slot of ['weapon', 'armor']) if (player.equipment?.[slot] === item.id) player.equipment[slot] = null;
            Combat.recalculateCharacterStats(player);
            return `removed item "${item.name}"`;
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
            if (typeof value === 'string' && !findOwnedItem(gs.players[idx], value)) {
                return `item ${value} not in inventory`;
            }
            return null;
        },
        apply: (m, value, gs) => {
            const idx = Number(m[1]);
            const slot = m[2];
            const player = gs.players[idx];
            // The narrator never sees generated ids, so it may name the item.
            if (typeof value === 'string') value = findOwnedItem(player, value)?.id ?? value;
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
            Combat.applyStatusEffect(player, effect.name, Math.min(10, Math.max(1, Math.round(effect.duration) || 1)), effect.effectTickData, 'narration');
            return `${player.name} status: +${effect.name}`;
        }
    },

    // ---- Player stats Brave/Clever/Sneaky/Kind, 0-STAT_MAX (god mode; progression.js) ----
    {
        regex: /^\/players\/(\d+)\/stats\/(brave|clever|sneaky|kind)$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            if (!gs.players?.[Number(m[1])]) return `players[${m[1]}] does not exist`;
            if (typeof value !== 'number' || !Number.isFinite(value)) return `stat must be a number 0-${STAT_MAX}`;
            if (!divine(gs)) return 'stats grow by play (levels and practice), not narration';
            return null;
        },
        apply: (m, value, gs) => {
            const p = gs.players[Number(m[1])];
            p.stats = p.stats || {};
            p.stats[m[2]] = Math.max(0, Math.min(STAT_MAX, Math.round(value)));
            try { Combat.recalculateCharacterStats(p); } catch (_) {}
            return `${p.name}.${m[2]} = ${p.stats[m[2]]}`;
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
            // atk/def are recomputed from baseAtk/baseDef + gear + effects on
            // every equip or status change; move the base by the same amount
            // so a god-mode ATK 50 doesn't fall back to 15.
            if (field === 'atk') player.baseAtk = (player.baseAtk ?? Config.BASE_ATK) + (value - (player.atk || 0));
            if (field === 'def') player.baseDef = (player.baseDef ?? Config.BASE_DEF) + (value - (player.def || 0));
            // A higher level (god mode, story) brings the normal per-level gains.
            if (field === 'level' && value > (player.level || 1)) {
                const gained = value - (player.level || 1);
                levelUp(player, gained);
                player.statPoints = (player.statPoints || 0) + gained; // each level: a stat to raise
                ensureStats(player); // ...but never more than the stats can still take
                try { Combat.recalculateCharacterStats(player); } catch (_) {}
                return `${player.name}.level = ${player.level}`;
            }
            // Lowering the level skipped the stat loss and the next XP award
            // re-levelled in a burst: levels only go up.
            if (field === 'level') return `${player.name}.level stays ${player.level || 1} (levels only go up)`;
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
            if (m[2] === '-') return 'entity path needs a name, not "-"'; // normalizeOp rewrites /- when value.name exists
            if (!value.name && !m[2]) return 'entity needs a name';
            return null;
        },
        apply: (m, value, gs) => {
            const category = m[1];
            const rawKey = (value.name || m[2]).trim();
            const norm = (n) => String(n || '').toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
            const key = Object.keys(gs.entityMemory?.[category] || {}).find(k => norm(k) === norm(rawKey)) || rawKey;
            gs.entityMemory = gs.entityMemory || { npcs: {}, locations: {}, items: {} };
            gs.entityMemory[category] = gs.entityMemory[category] || {};
            gs.entityMemory[category][key] = {
                description: value.description || '',
                traits: value.traits || [],
                relationship: value.relationship || (category === 'npcs' ? 'neutral' : undefined),
                lastSeenTurn: gs.turn,
                createdInGodMode: !!gs.isGoalComplete,
                ...value,
                name: key // keep the stored key's spelling
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

    // ---- Combat: enter / exit ----
    {
        regex: /^\/inCombat$/,
        ops: ['replace'],
        validate: (_m, value, gs) => {
            if (typeof value !== 'boolean') return 'inCombat must be boolean';
            // Live (phone): the narrator ended the fight with the boss untouched.
            if (!value && (gs?.enemies || []).some(e => e.isBoss && !e.isDefeated && e.hp > 0)) return 'the boss fight ends when the boss falls';
            return null;
        },
        apply: (_m, value, gs) => {
            const wasInCombat = !!gs.inCombat;
            // Story ends a fight with foes still up (live: drake left at 2 HP in
            // the enemy list, out of combat): they are driven off, not kept.
            if (!value && wasInCombat) gs.enemies = (gs.enemies || []).filter(e => e && (e.isDefeated || e.hp <= 0));
            gs.inCombat = value;
            if (value) gs.lastCombatTurn = gs.turn || 0; // for the "no fight lately" nudge
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
                    // (a fresh stub: the old one from state.js is isActive:false, and
                    // foes added next were then never put in the turn order)
                    gs.combat = { isActive: true, round: 1, initiative: [], currentTurnIndex: 0, activeEffects: [], formation: { frontLine: [], backLine: [] } };
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
        validate: (_m, value, gs) => {
            if (!value || typeof value !== 'object') return 'enemy must be an object';
            if (!value.name || typeof value.name !== 'string') return 'enemy.name required';
            if (typeof value.hp !== 'number' || value.hp <= 0) return 'enemy.hp must be a positive number';
            const same = (gs.enemies || []).filter(e => String(e.name).trim().toLowerCase() === value.name.trim().toLowerCase());
            if (same.some(e => !e.isDefeated)) return `"${value.name}" is already in the fight`;
            if (same.some(e => e.isBoss) && !gs.isGoalComplete) return `"${value.name}" was already defeated`; // god mode may summon a rematch
            return null;
        },
        apply: (_m, value, gs) => {
            gs.enemies = gs.enemies || [];
            const enemy = {
                id: value.id || `enemy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: value.name,
                hp: value.hp,
                maxHp: value.maxHp || value.hp,
                atk: Math.max(1, Math.round(Number(value.atk)) || 5),
                def: Math.max(0, Math.round(Number(value.def)) || 2),
                abilities: Array.isArray(value.abilities) ? value.abilities : ['Basic Attack'],
                statusEffects: [],
                isDefeated: false,
                lootTier: value.lootTier || 'Low',
                lootChance: typeof value.lootChance === 'number' ? value.lootChance : 0.5
            };
            // Bosses (the narrator marks the main threat isBoss): a sturdier
            // floor that scales with party size, a guaranteed good drop, and a
            // signature attack every other round (combat.js handleEnemyTurn).
            // The first enemy of the final confrontation is the boss even if the
            // narrator forgets "isBoss" (live: it did, and the climax was a
            // 35-HP spirit).
            const msNames = (gs.questProgress?.milestones || []).map(m => m.name);
            const villain = gs.questProgress?.villain;
            const bare = (n) => String(n || '').toLowerCase().replace(/^the\s+/, '').trim();
            const sameName = (a, b) => !!bare(a) && !!bare(b) && (bare(a).includes(bare(b)) || bare(b).includes(bare(a)));
            // Known villain: they are the boss whenever they fight (live: the
            // narrator skipped final_confrontation and Brinebeard fell at 30 HP),
            // and a minion at the climax stays a minion.
            const climaxFoe = !msNames.includes('final_blow') && !(gs.enemies || []).some(e => e.isBoss)
                && (villain ? sameName(value.name, villain) : msNames.includes('final_confrontation'));
            if (value.isBoss || climaxFoe) {
                const party = Math.max(1, (gs.players || []).length);
                enemy.isBoss = true;
                // Fixed size, not "at least": the narrator's 75-HP magistrate took a
                // solo hero 13 hits while hitting back for 10-20 (unwinnable).
                // God mode keeps the size it asked for (a summoned Void Dragon was 60 HP).
                const L = foeLevel(gs);
                enemy.hp = enemy.maxHp = gs.isGoalComplete
                    ? Math.min(99999, Math.max(20, Math.round(Number(value.maxHp || value.hp)) || 300))
                    : Math.round((40 + 20 * party) * (1 + 0.3 * (L - 1))); // a gentler curve than ordinary foes (fight_sim: 46% wins at L12 on the steep one)
                if (!gs.isGoalComplete) {
                    enemy.atk = foeStat(enemy.atk, 10 + 1.6 * (L - 1));
                    enemy.def = foeStat(enemy.def, 4 + 1.2 * (L - 1));
                }
                enemy.lootTier = 'High';
                enemy.lootChance = 1;
                if (!Array.isArray(value.abilities) || !value.abilities.length) enemy.abilities = ['Crushing Blow'];
            }
            // Ordinary foes stay quick (live, a 45-HP commander needed 7+ hits) but
            // keep pace with the party's level: they were the same 25 HP / atk 7
            // at level 12 as at level 1, so a fight cost 1% of the hero's HP.
            if (!enemy.isBoss && !gs.isGoalComplete) {
                const L = foeLevel(gs);
                const target = Math.round((15 + 10 * Math.max(1, (gs.players || []).length)) * foeScale(L));
                enemy.hp = enemy.maxHp = Math.max(5, Math.round(Math.min(target, Math.max(target * 0.6, Number(enemy.maxHp) || target)))); // the storyteller's size, within 60-100% of the level's
                enemy.atk = foeStat(enemy.atk, 8 + 1.8 * (L - 1));
                enemy.def = foeStat(enemy.def, 3 + 1.0 * (L - 1));
            }
            gs.enemies.push(enemy);
            gs.foesMet = [...new Set([...(gs.foesMet || []), enemy.name])].slice(-12); // so new fights bring new foes
            // Joining a fight already in progress: give it a turn. Enemies added
            // mid-combat used to never act (they were missing from initiative).
            // A fight with no proper turn order yet (inCombat came first, or a
            // stale combat object) gets one built now, heroes included.
            if (gs.inCombat) {
                const order = gs.combat?.initiative || [];
                if (!gs.combat?.isActive || !order.some(id => String(id).startsWith('player'))) {
                    try { Combat.initializeCombat(gs.enemies.filter(e => e && !e.isDefeated)); } catch (_) {}
                } else order.push(enemy.id);
            }
            return `+enemy "${enemy.name}"${enemy.isBoss ? ' (BOSS)' : ''} (HP ${enemy.hp}/${enemy.maxHp})`;
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
            Combat.applyStatusEffect(enemy, effect.name, Math.min(10, Math.max(1, Math.round(effect.duration) || 1)), effect.effectTickData, 'narration');
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
            if (gs.inCombat) return 'enemy HP and defeat are handled by the combat system during fights';
            // A boss falls only in battle (a reply could spawn the villain and mark it
            // defeated in one go, winning the quest without a fight).
            if (gs.enemies[idx].isBoss) return 'a boss is defeated in battle, not by narration';
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

    // ---- Divine Will: a new quest, another world (10-09) ----
    {
        // A fresh main quest: new goal (and villain), Act 1 again, rewards can be won again.
        // The Divine Will box stays: the players keep the power they earned.
        regex: /^\/questProgress\/newQuest$/,
        ops: ['replace'],
        validate: (_m, value, gs) => {
            if (!divine(gs)) return 'a new quest comes from Divine Will';
            if (!value || typeof value.goal !== 'string' || !value.goal.trim()) return 'newQuest needs {goal, villain?}';
            return null;
        },
        apply: (_m, value, gs) => {
            gs.questProgress = gs.questProgress || {};
            Object.assign(gs.questProgress, { milestones: [], completionPercentage: 0, bossDefeated: false, questStartTurn: gs.turn || 0 });
            delete gs.questProgress.act3StartTurn;
            if (typeof value.villain === 'string' && value.villain.trim()) gs.questProgress.villain = value.villain.trim().slice(0, 60);
            else delete gs.questProgress.villain;
            gs.storyThreads = [];
            gs.adventureGoal = value.goal.trim();
            gs.isGoalComplete = false;       // the acts run again (determineCurrentAct)
            gs.questRewardsGranted = false;  // winning it pays out again
            return `new quest: "${gs.adventureGoal}"${gs.questProgress.villain ? ` (villain ${gs.questProgress.villain})` : ''}, Act 1`;
        }
    },
    {
        // Another world: a portal, a time jump, a dream. The setting itself changes
        // (names, items, shop, magic or tech follow the theme), not just one scene.
        regex: /^\/adventureTheme$/,
        ops: ['replace'],
        validate: (_m, value, gs) => {
            if (!divine(gs)) return 'the world changes only by Divine Will';
            const key = typeof value === 'string' ? value : value?.theme;
            if (!THEMES.includes(key)) return `theme must be one of ${THEMES.join(', ')} (custom with a description)`;
            if (key === 'custom' && !String(value?.description || '').trim()) return 'a custom world needs {theme:"custom", description}';
            return null;
        },
        apply: (_m, value, gs) => {
            const key = typeof value === 'string' ? value : value.theme;
            const from = gs.adventureTheme;
            gs.adventureTheme = key;
            gs.customThemeDescription = key === 'custom' ? String(value.description).trim().slice(0, 300) : '';
            gs.storyVariation = null; // the old world's setting/conflict threads would pull the story back
            gs.storyHook = null;
            try { gs.shopItems = Items.generateShopItems(key, gs.turn || 1); } catch (_) {}
            return `world: ${from} -> ${key}${gs.customThemeDescription ? ` (${gs.customThemeDescription.slice(0, 60)})` : ''}`;
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
            // The quest can't end while the boss still stands (live: final_blow
            // arrived with the boss at 36/60). Killing it adds final_blow.
            if (norm === 'final blow' && !bossBeaten(gs)) {
                return 'final_blow must wait until the boss is defeated';
            }
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
            gs.questProgress.completionPercentage = questPercent(gs);
            if (canonicalName === 'antagonist_revealed' && typeof value.villain === 'string' && value.villain.trim()) {
                gs.questProgress.villain = value.villain.trim().slice(0, 60); // the final boss, by name
            }
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
            // Keep the quest phase in step: only the legacy command path ever
            // recomputed it, so it stayed "beginning" for the whole game.
            try { gs.questProgressManager?.updateCurrentPhase?.(); } catch (_) {}
            // final_blow completes the main quest even if the narrator forgets
            // the separate /isGoalComplete op (Act 3 could loop forever).
            if (canonicalName === 'final_blow' && !gs.isGoalComplete) {
                const done = PATHS.find(h => h.regex.test('/isGoalComplete'));
                try { done.apply('/isGoalComplete'.match(done.regex), true, gs); }
                catch (e) { (window.displayVisualError || console.log)(`final_blow completion failed: ${e.message}`); }
            }
            // Main-quest beats reward the party (not jail beats, not god mode).
            if (!/^jail[ _]/i.test(canonicalName) && !gs.isGoalComplete) {
                const heroes = (gs.players || []).filter(p => p && !p.isDowned);
                const coins = 15 + Math.floor(Math.random() * 11); // 15-25 each
                const lines = [];
                for (const p of heroes) {
                    p.coins = (p.coins || 0) + coins;
                    const ups = gainXp(p, 50, levelUp);
                    if (ups) lines.push(`⭐ ${p.name} reached level ${p.level}! Choose a stat to raise.`);
                }
                if (heroes.length) import('./ui.js').then(UI => {
                    UI.showPopup(`📜 Story milestone! +50 XP and +${coins} coins${heroes.length > 1 ? ' each' : ''}`, 'success', 3500);
                    lines.forEach(l => UI.showPopup(l, 'legendary', 4000));
                    UI.renderPlayerCards?.();
                }).catch(() => {});
            }
            return `milestone: ${canonicalName}${canonicalName !== original ? ` (normalized from "${original}")` : ''}`;
        }
    },
    // ---- Story threads (Chekhov's gun): setups the story owes a payoff ----
    // The narrator plants one when it makes a point of a clue, object, promise
    // or mystery, and marks it resolved when it pays off. Open threads are
    // shown every turn (live baseline: 6-8 of ~25 setups were never paid off).
    {
        regex: /^\/storyThreads\/-$/,
        ops: ['add'],
        validate: (_m, value, gs) => {
            const text = typeof value === 'string' ? value : value?.text;
            if (!text || typeof text !== 'string' || !text.trim()) return 'thread needs text';
            const open = (gs.storyThreads || []).filter(t => !t.resolved);
            if (open.length >= 4) return 'already 4 open threads: pay one off first';
            const low = text.trim().toLowerCase();
            if ((gs.storyThreads || []).some(t => t.text.toLowerCase() === low)) return 'thread already planted';
            return null;
        },
        apply: (_m, value, gs) => {
            const text = String(typeof value === 'string' ? value : value.text).trim().slice(0, 140);
            (gs.storyThreads = gs.storyThreads || []).push({ text, turn: gs.turn, resolved: false });
            return `thread planted: ${text}`;
        }
    },
    {
        regex: /^\/storyThreads\/(\d+)\/resolved$/,
        ops: ['replace'],
        validate: (m, value, gs) => {
            if (!gs.storyThreads?.[Number(m[1])]) return `storyThreads[${m[1]}] does not exist`;
            return value === true ? null : 'resolved can only be set to true';
        },
        apply: (m, _value, gs) => {
            const t = gs.storyThreads[Number(m[1])];
            t.resolved = true; t.resolvedTurn = gs.turn;
            return `thread paid off: ${t.text}`;
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
            // The bar is computed from the story beats actually reached, not the
            // narrator's guess (live: it showed 78% while the hero sat in jail).
            // A 0 after the quest is won is a full reset (new god-mode quest:
            // milestones cleared); a stray 0 mid-quest is ignored like any guess.
            if (value === 0 && gs.isGoalComplete) gs.questProgress.milestones = [];
            gs.questProgress.completionPercentage = questPercent(gs);
            return `completionPercentage = ${gs.questProgress.completionPercentage} (from milestones)`;
        }
    },
    {
        regex: /^\/isGoalComplete$/,
        ops: ['replace'],
        validate: (_m, value, gs) => {
            if (typeof value !== 'boolean') return 'isGoalComplete must be boolean';
            if (value && !bossBeaten(gs)) return 'the quest ends when the boss is defeated';
            return null;
        },
        apply: (_m, value, gs) => {
            const wasComplete = !!gs.isGoalComplete;
            gs.isGoalComplete = value;
            // false → true: unlock god mode (the original Phase 3 reward).
            if (value && !wasComplete) {
                gs.allowCustomActions = true;
                gs.questProgress = gs.questProgress || {};
                gs.questProgress.completionPercentage = 100;
                if (!gs.questRewardsGranted) {
                    gs.questRewardsGranted = true; // once per main quest
                    gs._rewardsPromise = import('./resolution.js').then(r => r.handleGoalCompletionRewards())
                        .catch(e => (window.displayVisualError || console.log)(`Quest rewards failed: ${e.message}`));
                }
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
                gs.questRewardsGranted = false; // a new main quest can pay out again
                // New quest: old beats would block call_to_adventure/final_blow as duplicates.
                if (gs.questProgress) {
                    // Acts count from here; the old villain, Act 3 clock, threads and
                    // fallen foes belong to the finished quest.
                    Object.assign(gs.questProgress, { milestones: [], completionPercentage: 0, bossDefeated: false, questStartTurn: gs.turn || 0 });
                    delete gs.questProgress.villain; delete gs.questProgress.act3StartTurn;
                }
                gs.storyThreads = [];
                gs.enemies = (gs.enemies || []).filter(e => e && !e.isDefeated && e.hp > 0);
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
/**
 * Repair common narrator slips before validation. Models often append
 * entities with "/entityMemory/<cat>/-" (list style); the name is in the value,
 * so key it there. Before this, "-" matched the name pattern and every such
 * entity was stored under the key "-", overwriting the previous one.
 */
export function normalizeOp(op) {
    if (!op || typeof op.path !== 'string') return op;
    if (op.op === 'replace' && op.path.endsWith('/-')) op = { ...op, op: 'add' }; // live: a milestone was dropped this way
    const m = op.path.match(/^\/entityMemory\/(npcs|locations|items)\/-$/);
    if (m && op.value && typeof op.value.name === 'string' && op.value.name.trim()) {
        const key = op.value.name.trim().replace(/[^a-zA-Z0-9 _'-]/g, '').slice(0, 60);
        if (key) return { ...op, op: 'add', path: `/entityMemory/${m[1]}/${key}` };
    }
    return op;
}

export function validateOp(op) {
    op = normalizeOp(op);
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
// Narrator items arrive typed "weapon", "potion" or not at all; the game
// only uses Weapon/Armor/Consumable, so map them (live-like: an untyped
// "Healing Potion" became Misc and could never be drunk).
// Foe scaling with the party's average level (fight_sim.mjs measures it).
const foeLevel = (gs) => { const ls = (gs.players || []).filter(Boolean).map(p => p.level || 1); return ls.length ? ls.reduce((a, b) => a + b, 0) / ls.length : 1; };
const foeScale = (L) => 1 + 0.4 * (L - 1);
// At least the level's value, at most 40% above it (a narrator's atk 30 one-shot level-1 heroes).
const foeStat = (given, base) => Math.round(Math.min(Math.max(Number(given) || 0, base), base * 1.4));

function itemType(value) {
    const t = String(value.type || '').trim().toLowerCase();
    const known = { weapon: 'Weapon', armor: 'Armor', armour: 'Armor', consumable: 'Consumable', potion: 'Consumable',
        food: 'Consumable', revival: 'Revival', quest: 'Quest', quest_item: 'Quest', 'quest item': 'Quest', key: 'Quest', misc: 'Misc' };
    if (known[t]) return known[t];
    const st = value.stats || {};
    if (st.heal || st.healPercent || st.mp || /potion|elixir|tonic|salve|bandage|herb|antidote|ration|draught/i.test(value.name || '')) return 'Consumable';
    if (st.atk && !st.def) return 'Weapon';
    if (st.def && !st.atk) return 'Armor';
    // A type the game has no buttons for ("Artifact", "Relic"): live 10-09 the
    // "Luminous Orb of Zenith" could be neither used nor equipped. With an
    // effect it is used (the storyteller narrates the effect); else a keepsake.
    return usableType(value);
}

// Tiers as the game names them; the narrator sometimes sends 1-5 or lowercase.
function itemTier(t) {
    const names = ['Low', 'Medium', 'High', 'Special', 'Legendary'];
    if (typeof t === 'number') return names[Math.min(names.length, Math.max(1, Math.round(t))) - 1];
    const s = String(t || '').trim().toLowerCase();
    return names.find(n => n.toLowerCase() === s) || (s === 'god' ? 'God' : 'Low');
}

// Quest progress from milestones reached: each story beat is worth a fixed share.
const MILESTONE_PCT = { call_to_adventure: 5, world_introduced: 12, stakes_clear: 20, ally_found: 35,
    first_obstacle_overcome: 50, antagonist_revealed: 65, final_confrontation: 80, final_blow: 100 };
// God-mode powers: after the main quest is won, or during a Divine Will turn.
const divine = (gs) => !!(gs?.isGoalComplete || gs?.divineTurn);
const THEMES = ['fantasy', 'space', 'pirate', 'underwater', 'jungle', 'future_utopia', 'dinosaur', 'arctic', 'steampunk', 'haunted', 'cyberpunk', 'wild_west', 'post_apoc', 'custom'];

export function questPercent(gs) {
    return Math.max(0, ...(gs.questProgress?.milestones || []).map(m => MILESTONE_PCT[m.name] || 0));
}

// An owned item by id, or by name (case-insensitive) as the narrator writes it.
/**
 * The quest can only be won by beating the boss: none may be standing, and
 * one must have fallen this quest (a story 'win' never fought the villain).
 */
function bossBeaten(gs) {
    if ((gs?.enemies || []).some(e => e.isBoss && !e.isDefeated && e.hp > 0)) return false;
    return !!gs?.questProgress?.bossDefeated; // set by Combat.handleEnemyDefeat
}

/** Path segment -> item ref ("Healing%20Potion" / "Healing_Potion" -> "Healing Potion" too). */
function decodeRef(seg) {
    let s = String(seg);
    try { s = decodeURIComponent(s); } catch (_) {}
    return s;
}

/**
 * Item stats from the narrator: numeric strings become numbers ("50" was
 * glued onto ATK as text: 5 + "50" -> attack 550), junk numbers are dropped,
 * text fields (cure, applyStatus...) are kept.
 */
function cleanStats(stats) {
    const out = {};
    if (!stats || typeof stats !== 'object') return out;
    for (const [k, v] of Object.entries(stats)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = v; }
        else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) out[k] = Number(v);
        else out[k] = v;
    }
    return out;
}

function findOwnedItem(player, ref) {
    const inv = (player?.inventory || []).filter(Boolean);
    const low = String(ref).trim().toLowerCase();
    return inv.find(it => it.id === ref) || inv.find(it => String(it.name || '').trim().toLowerCase() === low);
}

export function applyDiff(ops, opts = {}) {
    const log = window.displayVisualError || console.log;
    if (!Array.isArray(ops)) throw new Error('ops must be an array');

    // Enemies must exist before /inCombat true builds the turn order; with
    // the ops the other way round combat got an empty initiative list and
    // enemy turns recursed until the stack overflowed.
    // Quest-ending ops go last: live, one reply sent final_blow +
    // isGoalComplete before '+enemy (BOSS)', so the boss check saw no boss
    // and the quest was won with the villain at full HP.
    const rank = (op) => op?.path === '/isGoalComplete' ? 3
        : (op?.path === '/questProgress/milestones/-' && /final[\s_-]*blow/i.test(String(op?.value?.name || ''))) ? 2
        : op?.path === '/inCombat' ? 1 : 0;
    const ordered = ops.map(normalizeOp).sort((a, b) => rank(a) - rank(b));

    // Non-strict (every narrator turn): validate each op against the state
    // the earlier ops produced, so "pick up the sword" + "equip it" in one
    // reply works (before, the equip was checked against the old pack).
    if (!opts.strict) {
        const applied = [];
        for (const op of ordered) {
            const result = validateOp(op);
            if (!result.ok) { log(`engine.applyDiff rejected op: ${result.error}`); continue; }
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

    // Strict: two-phase commit, validate everything first, then apply.
    const planned = [];
    for (const op of ordered) {
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
        `/players/0/stats/brave|clever|sneaky|kind (replace, 0-${STAT_MAX}; god mode only)`,
        '/questProgress/newQuest (replace, {goal, villain?}; god mode only) - a fresh 3-act main quest',
        '/adventureTheme     (replace, theme key, or {theme:"custom", description}; god mode only) - travel to another world',
        '/players/0/inventory/- (add, {name, type, tier, effect, stats})',
        '/players/0/inventory/<id> (remove)',
        '/players/0/equipment/weapon|armor (replace, item name or id, or null)',
        '/players/0/statusEffects/- (add, {name, duration, effectTickData})',
        '/players/0/specialMoves/- (add, {name, description, cooldown, mpCost, usageContext, mechanics})',
        '/inCombat            (replace, boolean) - true to enter combat',
        '/enemies/-           (add, {name, hp, maxHp, atk, def, abilities, isBoss: true only for the main villain})',
        '/enemies/<idx>/hp    (replace, number)',
        '/enemies/<idx>/isDefeated (replace, boolean)',
        '/enemies/<idx>/statusEffects/- (add, {name, duration, effectTickData})',
        '/currentLocation     (replace, {name, type, dangerLevel 0-1: 0.2 calm, 0.5 tense, 0.8+ deadly, description})',
        '/adventureGoal       (replace, string)',
        '/questProgress/milestones/- (add, {name, description})',
        '/questProgress/completionPercentage (replace, 0-100)',
        '/questProgress/sideQuests/- (add, {name, description, giver, location, reward})',
        '/questProgress/sideQuests/<id>/completed (replace, boolean)',
        '/questProgress/sideQuests/<id>/progress (replace, 0-100)',
        '/storyThreads/-       (add, {text}) - a setup the story must pay off later',
        '/storyThreads/<n>/resolved (replace, true) - that setup just paid off',
        '/isGoalComplete      (replace, boolean) - unlocks god mode',
        '/entityMemory/npcs/<name>      (add|replace, {name, description, traits, relationship})',
        '/entityMemory/locations/<name> (add|replace, {name, description, traits})',
        '/entityMemory/items/<name>     (add|replace, {name, description, traits})',
    ].join('\n');
}
