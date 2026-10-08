// mechanics_check.mjs - offline checks that combat/item/skill/status mechanics
// actually change numbers when driven through the same entry points the UI
// uses (actionHandler.handlePlayerChoice for battle buttons, equipInventoryItem
// / useInventoryItem / useSpecialMove for the inventory and moves screens).
// No network: fetch is stubbed to reject, so every narrator call fails fast and
// the code under test falls back to its offline path. Math.random is pinned per
// check so damage numbers are deterministic.
import './dom_polyfill.mjs';

// ---- no network ----
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error('mechanics_check: network disabled'); };
if (globalThis.window) globalThis.window.fetch = globalThis.fetch;

// ---- quiet logs (game logs everything via displayVisualError/console.log) ----
const realLog = console.log.bind(console);
const out = (s) => process.stdout.write(s + '\n');
console.log = () => {}; console.info = () => {}; console.warn = () => {}; console.debug = () => {};
const realError = console.error.bind(console);
console.error = () => {};
const gameLog = [];
const logSink = (...a) => { gameLog.push(a.map(String).join(' ')); if (gameLog.length > 4000) gameLog.shift(); };
if (globalThis.window) globalThis.window.displayVisualError = logSink;
globalThis.displayVisualError = logSink;

const { gameState, resetGameState, createNewPlayer } = await import('../state.js');
const Combat = await import('../combat.js');
const Engine = await import('../engine.js');
const AH = await import('../actionHandler.js');
const UI = await import('../ui.js');
const { advanceTurn } = await import('../turnManager.js');

let failed = 0;
const results = [];
const check = (ok, label) => { out(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) failed++; results.push({ ok, label }); };
const section = (s) => out(`\n${s}`);
// Run one check group; an exception counts as a failure with its first stack frame.
async function block(fn) {
  try { await fn(); }
  catch (x) {
    Math.random = realRandom; gameState.isLoading = false;
    const at = String(x?.stack || '').split('\n').find(l => /\.js:\d+/.test(l) && !/mechanics_check/.test(l)) || '';
    check(false, `THREW ${x?.name}: ${x?.message} ${at.trim().replace(/.*\/(\w+\.js:\d+).*/, '@ $1')}`);
  }
}

const realRandom = Math.random;
const pinRandom = (v) => { Math.random = () => v; };
const unpinRandom = () => { Math.random = realRandom; };

// Capture player-card HTML (status effects are rendered into it).
const cards = [];
UI.elements.playersDisplay = { innerHTML: '', appendChild(c) { cards.push(String(c.innerHTML || '')); } };
UI.elements.currentPlayerIndicator = { textContent: '' };

function gameState_lastCaught() {
  const hit = [...gameLog].reverse().find(l => /\[CB-9\].*caught/.test(l));
  gameLog.length = 0;
  return hit ? hit.replace(/.*caught: /, '') : null;
}
function fresh({ enemy = {}, player = {} } = {}) {
  resetGameState();
  gameState.adventureTheme = 'fantasy';
  gameState.turn = 3;
  const p = createNewPlayer('Ava', 10);
  Object.assign(p, player);
  gameState.players = [p];
  gameState.currentPlayerIndex = 0;
  gameState.isLoading = false;
  const e = { id: 'enemy_test1', name: 'Goblin', hp: 200, maxHp: 200, atk: 8, def: 4, speed: 1, statusEffects: [], abilities: ['Basic Attack'], ...enemy };
  gameState.enemies = [e];
  gameState.inCombat = false;
  gameState.combat = null;
  return { p, e };
}
// Run the goblin's turn the way advanceCombatTurn does: with the turn index on it.
async function enemyTurn() {
  gameState.combat.currentTurnIndex = gameState.combat.initiative.indexOf('enemy_test1');
  await Combat.handleEnemyTurn('enemy_test1');
}
function startFight() {
  Combat.initializeCombat(gameState.enemies);
  return gameState.combat.initiative.slice();
}
const weapon = (atk = 10) => ({ id: 'item_sword', name: 'Iron Sword', type: 'Weapon', tier: 'Low', stats: { atk }, equippedSlot: null });
const armor = (def = 10) => ({ id: 'item_mail', name: 'Chain Mail', type: 'Armor', tier: 'Low', stats: { def }, equippedSlot: null });
const potion = (heal = 30, quantity = 1) => ({ id: 'item_potion', name: 'Healing Potion', type: 'Consumable', tier: 'Low', effect: 'Restores HP.', stats: { heal }, quantity });

const t0 = Date.now();

// =====================================================================
section('1. Weapons and armor');
await block(async () => {
  const { p, e } = fresh();
  pinRandom(0.5); // 0.5 < 0.9 accuracy -> hit; 0.5 > 0.1 crit chance -> no crit
  startFight();
  const before = Combat.executeWeaponAttack(p, e).actualDamage;
  p.inventory.push(weapon(10));
  AH.equipInventoryItem('item_sword', 'weapon');
  const atkAfter = p.atk;
  const hpBefore = e.hp;
  const after = Combat.executeWeaponAttack(p, e).actualDamage;
  check(after > before, `weapon raises damage: unarmed ${before} -> sword(+10) ${after} (ATK ${Combat ? 5 : ''}->${atkAfter})`);
  AH.unequipInventoryItem('weapon');
  check(p.atk === 5, `unequip restores ATK to base (now ${p.atk})`);
  unpinRandom();
});
await block(async () => {
  // Armor in the damage formula itself (enemy -> player), no enemy turn needed.
  const { p, e } = fresh();
  startFight();
  pinRandom(0.5);
  const bare = Combat.calculateDamage(e, p).damage;
  p.inventory.push(armor(10)); AH.equipInventoryItem('item_mail', 'armor');
  const armored = Combat.calculateDamage(e, p).damage;
  unpinRandom();
  check(armored < bare, `armor in damage formula: goblin hit ${bare} -> ${armored} with DEF ${p.def}`);
});
await block(async () => {
  // Armor through the real enemy turn (handleEnemyTurn -> executeEnemyAttack).
  const measure = async (withArmor) => {
    const { p } = fresh();
    if (withArmor) { p.inventory.push(armor(10)); AH.equipInventoryItem('item_mail', 'armor'); }
    startFight();
    pinRandom(0.5);
    const hp0 = p.hp;
    await enemyTurn();
    unpinRandom();
    return { taken: hp0 - p.hp, def: p.def };
  };
  const a = await measure(false), b = await measure(true);
  check(b.taken < a.taken, `armor reduces damage taken: DEF ${a.def} took ${a.taken} -> DEF ${b.def} took ${b.taken}`);
});
await block(async () => {
  // Full UI battle-button path: Attack via handlePlayerChoice.
  const run = async (armed) => {
    const { p, e } = fresh();
    if (armed) { p.inventory.push(weapon(10)); AH.equipInventoryItem('item_sword', 'weapon'); }
    startFight();
    pinRandom(0.5);
    const hp0 = e.hp;
    await AH.handlePlayerChoice('Attack', 'Strike the goblin');
    unpinRandom();
    return hp0 - e.hp;
  };
  const u = await run(false), w = await run(true);
  check(w > u, `Attack button: goblin loses ${u} HP unarmed vs ${w} HP with sword`);
});
await block(async () => {
  // Narrator-equipped weapon (engine op) also counts.
  const { p, e } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { id: 'item_n1', name: 'Singing Sword', type: 'Weapon', stats: { atk: 24 } } },
                    { op: 'replace', path: '/players/0/equipment/weapon', value: 'item_n1' }], { strict: false });
  check(p.atk === 29, `narrator equip op recalculates ATK (5 + 24 = ${p.atk})`);
});
await block(async () => {
  // The narrator never sees ids: equipping by item name works too.
  const { p } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'Coral Blade', type: 'Weapon', stats: { atk: 6 } } },
                    { op: 'replace', path: '/players/0/equipment/weapon', value: 'coral blade' }], { strict: false });
  check(p.atk === 11, `narrator equips by item name (5 + 6 = ${p.atk})`);
  // lower-case "weapon" type from the narrator
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { id: 'item_n2', name: 'Stick', type: 'weapon', stats: { atk: 3 } } }], { strict: false });
  const atk0 = p.atk;
  AH.equipInventoryItem('item_n2', 'weapon');
  check(p.equipment.weapon === 'item_n2', `inventory Equip accepts narrator item typed "weapon" (lower-case) [equipped=${p.equipment.weapon}, ATK ${atk0}->${p.atk}]`);
  // god-mode ATK boost survives an equip
  const { p: q } = fresh();
  Engine.applyDiff([{ op: 'replace', path: '/players/0/atk', value: 50 }], { strict: false });
  q.inventory.push(weapon(10));
  AH.equipInventoryItem('item_sword', 'weapon');
  check(q.atk >= 60, `narrator/god-mode ATK 50 survives equipping a +10 sword (ATK now ${q.atk})`);
});

// =====================================================================
section('2. Consumables');
await block(async () => {
  const { p } = fresh();
  p.hp = 40;
  p.inventory.push(potion(30, 2));
  startFight();
  pinRandom(0.5);
  await AH.handlePlayerChoice('Item', 'Drink the Healing Potion');
  unpinRandom();
  const pot = p.inventory.find(i => i.id === 'item_potion');
  check(pot && pot.quantity === 1, `combat Item: potion stack 2 -> ${pot?.quantity ?? 'removed'}`);
  // +30 heal -> 70, then the goblin's reply (6 dmg at pinned rolls) should land.
  check(p.hp > 40 && p.hp < 70, `combat Item: HP 40 -> ${p.hp} (expect 70 after heal, minus the goblin's reply)`);
});
await block(async () => {
  const { p } = fresh();
  p.hp = 40;
  p.inventory.push(potion(30, 3));
  await AH.useInventoryItem('item_potion');
  const pot = p.inventory.find(i => i.id === 'item_potion');
  check(p.hp === 70, `inventory Use (exploration): HP 40 -> ${p.hp}`);
  check(pot && pot.quantity === 2, `inventory Use: stack of 3 -> ${pot ? pot.quantity : 'whole stack removed'}`);
});
await block(async () => {
  // Inventory Use during combat: does the enemy get its turn?
  const { p } = fresh();
  p.hp = 40;
  p.inventory.push(potion(30, 1));
  startFight();
  const idx0 = gameState.combat.currentTurnIndex, round0 = gameState.combat.round;
  pinRandom(0.5);
  await AH.useInventoryItem('item_potion');
  unpinRandom();
  check(gameState.combat.currentTurnIndex !== idx0 || gameState.combat.round !== round0 || p.hp < 70,
    `inventory Use in combat costs the turn (turnIndex ${idx0}->${gameState.combat.currentTurnIndex}, round ${round0}->${gameState.combat.round}, HP ${p.hp})`);
});
await block(async () => {
  // healPercent-only consumable via the inventory screen
  const { p } = fresh();
  p.hp = 20;
  p.inventory.push({ id: 'item_hp', name: 'Elixir', type: 'Consumable', effect: 'Restores HP.', stats: { healPercent: 0.5 }, quantity: 1 });
  await AH.useInventoryItem('item_hp');
  check(p.hp === 70, `inventory Use: healPercent 0.5 elixir heals 20 -> ${p.hp}`);
});
await block(async () => {
  // Narrator-given potion (typical op: name + effect, no type/stats)
  const { p } = fresh();
  p.hp = 40;
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'Healing Potion', effect: 'restores 20 HP' } }], { strict: false });
  const it = p.inventory[p.inventory.length - 1];
  startFight();
  pinRandom(0.5);
  await AH.handlePlayerChoice('Item', 'Drink the Healing Potion');
  unpinRandom();
  check(!p.inventory.includes(it), `narrator "Healing Potion" (no type) is usable in battle (type=${it.type}, still in pack=${p.inventory.includes(it)})`);
});
await block(async () => {
  // applyStatus buff consumable and cure consumable
  const { p } = fresh();
  p.inventory.push({ id: 'item_buff', name: 'Iron Skin Tonic', type: 'Consumable', effect: 'Shields you.', stats: { applyStatus: 'Shield' }, quantity: 1 });
  await AH.useInventoryItem('item_buff');
  check(p.statusEffects.some(s => s.name === 'Shield') && !p.inventory.some(i => i.id === 'item_buff'), `buff tonic applies Shield (${p.statusEffects.map(s => s.name + ':' + s.duration).join(',') || 'none'}) and is consumed`);
  const { p: q } = fresh();
  q.statusEffects.push({ name: 'Poison', duration: 3, effectTickData: { hpPerTurn: -3 } });
  q.inventory.push({ id: 'item_cure', name: 'Antidote', type: 'Consumable', effect: 'Cures poison.', stats: { cure: 'Poison' }, quantity: 1 });
  await AH.useInventoryItem('item_cure');
  check(!q.statusEffects.some(s => s.name === 'Poison') && !q.inventory.some(i => i.id === 'item_cure'), `antidote cures Poison and is consumed`);
});
await block(async () => {
  // Key / quest items
  const { p } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'Rusty Key', type: 'Key', effect: 'opens the crypt' } }], { strict: false });
  const key = p.inventory[p.inventory.length - 1];
  await AH.useInventoryItem(key.id);
  check(p.inventory.includes(key), `Key item: Use is refused and item kept (type=${key.type})`);
});

// =====================================================================
section('3. Special moves');
await block(async () => {
  const { p, e } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/players/0/specialMoves/-', value: { name: 'Flame Strike', cooldown: 3, mpCost: 10, mechanics: { directDamage: 30, statusEffects: ['Burn'] } } }], { strict: false });
  const move = p.specialMoves[0];
  check(!!move && move.cooldown === 3 && move.mpCost === 10, `narrator op adds special move (cooldown ${move?.cooldown}, mp ${move?.mpCost})`);
  startFight();
  pinRandom(0.5);
  const atkDmg = (() => { const { p: a, e: b } = { p: { ...p, statusEffects: [] }, e: { ...e } }; return Combat.calculateDamage(a, b).damage; })();
  const mp0 = p.mp, hp0 = e.hp;
  await AH.handlePlayerChoice('Special', 'Use Flame Strike');
  const dealt = hp0 - e.hp;
  check(p.mp === mp0 - 10 + 2, `Special: MP ${mp0} -> ${p.mp} (cost 10, +2 round regen)`);
  check(dealt > atkDmg, `Special deals more than a basic attack: basic ${atkDmg}, Flame Strike ${dealt} (move says directDamage 30, combat says 1.5x)`);
  check(e.statusEffects.some(s => s.name === 'Burn'), `Special applies its Burn (enemy effects: ${e.statusEffects.map(s => s.name).join(',') || 'none'})`);
  const cds = [move.currentCooldown];
  // Next three combat actions: plain attacks; watch cooldown fall.
  for (let i = 0; i < 3; i++) { await AH.handlePlayerChoice('Attack', 'Strike'); cds.push(move.currentCooldown); }
  unpinRandom();
  check(cds[0] === 3 && cds[1] === 2 && cds[2] === 1 && cds[3] === 0, `cooldown after use then per round: ${cds.join(' -> ')} (expect 3 -> 2 -> 1 -> 0)`);
});
await block(async () => {
  // Special while on cooldown
  const { p, e } = fresh();
  p.specialMoves.push({ id: 'mv1', name: 'Bash', cooldown: 2, currentCooldown: 2, mpCost: 0, mechanics: {} });
  startFight();
  pinRandom(0.5);
  const hp0 = e.hp;
  await AH.handlePlayerChoice('Special', 'Bash');
  unpinRandom();
  // Not a wasted turn: falls back to a Power Strike; the move's cooldown is untouched.
  check(e.hp < hp0 && p.specialMoves[0].currentCooldown < 2 && p.specialMoves[0].currentCooldown >= 1, `Special with its move on cooldown falls back to a Power Strike, move not reused (goblin HP ${hp0}->${e.hp}, cd ${p.specialMoves[0].currentCooldown})`);
});
await block(async () => {
  // No moves at all: Power Strike hits harder than a plain Attack; no potions: catch a breath.
  const { p, e } = fresh(); startFight(); pinRandom(0.5);
  const h0 = e.hp; await AH.handlePlayerChoice('Attack', 'Strike'); const basic = h0 - e.hp;
  const { p: p2, e: e2 } = fresh(); startFight();
  const h1 = e2.hp; await AH.handlePlayerChoice('Special', 'Power'); const power = h1 - e2.hp;
  check(power > basic, `Power Strike (no learned moves) beats a basic hit: ${basic} vs ${power}`);
  const { p: p3 } = fresh(); p3.inventory = []; p3.hp = 50; startFight();
  await AH.handlePlayerChoice('Item', 'Search the pack');
  unpinRandom();
  check(p3.hp > 50 - 0 || p3.hp >= 50, `Item with an empty pack catches a breath (HP 50 -> ${p3.hp})`);
});
await block(async () => {
  // Special Moves screen "Use" button (useSpecialMove)
  const { p, e } = fresh();
  pinRandom(0.5); // a 10% miss made this check flaky
  Engine.applyDiff([{ op: 'add', path: '/players/0/specialMoves/-', value: { name: 'Flame Strike', cooldown: 3, mpCost: 10, mechanics: { directDamage: 30 } } }], { strict: false });
  const mv = p.specialMoves[0];
  startFight();
  const hp0 = e.hp, mp0 = p.mp;
  await AH.useSpecialMove(mv.id);
  check(e.hp < hp0, `Moves-screen Use on a narrator skill (mechanics.directDamage 30) damages: goblin ${hp0} -> ${e.hp}`);
  check(gameState.combat.round > 1 || gameState.combat.currentTurnIndex !== 0, `Moves-screen Use in combat hands the turn to the enemy (round ${gameState.combat.round}, turnIndex ${gameState.combat.currentTurnIndex})`);
  check(mv.currentCooldown > 0 && p.mp < mp0, `Moves-screen Use keeps cooldown/MP spent when narrator is offline (cd ${mv.currentCooldown}, MP ${mp0}->${p.mp})`);
  const { p: p2, e: e2 } = fresh();
  p2.specialMoves.push({ id: 'mv2', name: 'Smash', cooldown: 3, currentCooldown: 0, mpCost: 5, mechanics: { damage: 20 } });
  startFight();
  const h2 = e2.hp, m2 = p2.mp;
  await AH.useSpecialMove('mv2');
  check(!(e2.hp < h2 && p2.mp === m2 && p2.specialMoves[0].currentCooldown === 0), `Moves-screen damage is not free when narration fails (goblin ${h2}->${e2.hp}, MP ${m2}->${p2.mp}, cd ${p2.specialMoves[0].currentCooldown})`);
  unpinRandom();
});

// =====================================================================
section('4. Status effects');
await block(async () => {
  // Narrator-added effects resolve against the catalog
  const { p } = fresh();
  Engine.applyDiff(['Poison', 'Burn', 'Stun', 'Fear', 'Regen', 'Shield'].map(name => ({ op: 'add', path: '/players/0/statusEffects/-', value: { name, duration: 3 } })), { strict: false });
  const by = Object.fromEntries(p.statusEffects.map(s => [s.name, s]));
  check(by.Poison?.effectTickData?.hpPerTurn === -3 && by.Burn?.effectTickData?.hpPerTurn === -4, `Poison/Burn get catalog tick data (${by.Poison?.effectTickData?.hpPerTurn}, ${by.Burn?.effectTickData?.hpPerTurn})`);
  check(by.Stun?.effectTickData?.cannotAct === true, 'Stun gets cannotAct');
  check(by.Shield?.effectTickData?.damageMultiplier === 0.5, 'Shield gets damageMultiplier 0.5');
  check(Object.keys(by.Regen?.effectTickData || {}).length > 0, `Regen has a mechanical effect (tickData ${JSON.stringify(by.Regen?.effectTickData)})`);
  check(Object.keys(by.Fear?.effectTickData || {}).length > 0, `Fear has a mechanical effect (tickData ${JSON.stringify(by.Fear?.effectTickData)})`);
  // shown in UI
  cards.length = 0; UI.renderPlayerCards();
  const html = cards.join('');
  check(['Poison(3)', 'Stun(3)', 'Fear(3)', 'Regen(3)'].every(s => html.includes(s)), `player card shows effects with turns left (${(html.match(/status-effect"[^>]*>([^<]*)</g) || []).map(s => s.replace(/.*>/, '').trim()).join(' | ')})`);
});
await block(async () => {
  // Outside combat: end-of-turn tick + expiry
  const { p } = fresh();
  p.hp = 50;
  Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: 'Poison', duration: 3 } }], { strict: false });
  const hp = [p.hp];
  for (let i = 0; i < 4; i++) { await advanceTurn(); hp.push(p.hp); }
  check(hp[1] === 47 && hp[3] === 41 && hp[4] === 41 && p.statusEffects.length === 0, `exploration Poison(3): HP ${hp.join(' -> ')}, then expires (left: ${p.statusEffects.length})`);
});
await block(async () => {
  // In combat: Poison on the enemy ticks once per round
  const { p, e } = fresh();
  startFight();
  Engine.applyDiff([{ op: 'add', path: '/enemies/0/statusEffects/-', value: { name: 'Poison', duration: 4 } }], { strict: false });
  pinRandom(0.95); // every attack misses (0.95 > 0.9) so only Poison moves enemy HP
  const hp = [e.hp], dur = [e.statusEffects[0].duration];
  for (let i = 0; i < 2; i++) { await AH.handlePlayerChoice('Attack', 'Strike'); hp.push(e.hp); dur.push(e.statusEffects[0]?.duration ?? 0); }
  unpinRandom();
  check(hp[1] === hp[0] - 3, `enemy Poison ticks 3 per round in combat: HP ${hp.join(' -> ')}, duration ${dur.join(' -> ')} (expect -3 and -1 per round)`);
});
await block(async () => {
  // In combat: player Poison ticks at end of the player's turn
  const { p } = fresh();
  p.hp = 50;
  startFight();
  Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: 'Poison', duration: 4 } }], { strict: false });
  pinRandom(0.95); // enemy misses
  const hp = [p.hp];
  for (let i = 0; i < 2; i++) { await AH.handlePlayerChoice('Attack', 'Strike'); hp.push(p.hp); }
  unpinRandom();
  check(hp[1] === 47 && hp[2] === 44, `player Poison ticks in combat: HP ${hp.join(' -> ')}`);
});
await block(async () => {
  // Stun skips a turn
  const { p, e } = fresh();
  startFight();
  Engine.applyDiff([{ op: 'add', path: '/enemies/0/statusEffects/-', value: { name: 'Stun' } }], { strict: false });
  pinRandom(0.5);
  p.hp = 100;
  await AH.handlePlayerChoice('Attack', 'Strike');
  const tookWhileStunned = 100 - p.hp;
  unpinRandom();
  check(tookWhileStunned === 0, `stunned goblin skips its attack (player took ${tookWhileStunned})`);
  const { p: q, e: g } = fresh();
  startFight();
  Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: 'Stun' } }], { strict: false });
  pinRandom(0.5);
  const h0 = g.hp;
  await AH.handlePlayerChoice('Attack', 'Strike');
  unpinRandom();
  check(g.hp === h0, `stunned player's Attack deals 0 (goblin ${h0} -> ${g.hp})`);
});
await block(async () => {
  // Shield halves incoming damage; Weakness halves outgoing damage
  const hit = async (effect) => {
    const { p } = fresh();
    startFight();
    if (effect) Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: effect } }], { strict: false });
    pinRandom(0.5);
    const h = p.hp; await enemyTurn(); unpinRandom();
    return h - p.hp;
  };
  {
    const { p, e } = fresh(); startFight(); pinRandom(0.5);
    const b0 = Combat.calculateDamage(e, p).damage;
    Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: 'Shield' } }], { strict: false });
    const b1 = Combat.calculateDamage(e, p).damage; unpinRandom();
    check(b1 < b0, `Shield in damage formula: goblin hit ${b0} -> ${b1}`);
  }
  const base = await hit(null), sh = await hit('Shield');
  check(sh < base, `Shield through a real enemy turn: ${base} -> ${sh}`);
});
await block(async () => {
  const out1 = (eff) => {
    const { p, e } = fresh({ enemy: { def: 0 } });
    p.baseAtk = 20; Combat.recalculateCharacterStats(p);
    startFight();
    if (eff) { Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: eff } }], { strict: false }); Combat.recalculateCharacterStats(p); }
    pinRandom(0.5); const r = Combat.executeWeaponAttack(p, e).actualDamage; unpinRandom();
    return r;
  };
  const n = out1(null), w = out1('Weakness');
  check(w === Math.round(n * 0.5), `Weakness (atk x0.5) halves damage once: ${n} -> ${w} (expect ${Math.round(n * 0.5)})`);
});
await block(async () => {
  // Regen via item tonic (old-system data) heals per turn
  const { p } = fresh();
  p.hp = 50;
  Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: 'Regen', duration: 3 } }], { strict: false });
  await advanceTurn();
  check(p.hp > 50, `narrator Regen heals per turn outside combat (HP 50 -> ${p.hp})`);
});
await block(async () => {
  // Enemy effect durations: does an enemy's own turn tick its effects once?
  const { e } = fresh();
  startFight();
  Engine.applyDiff([{ op: 'add', path: '/enemies/0/statusEffects/-', value: { name: 'Bleed', duration: 5 } }], { strict: false });
  gameState.combat.currentTurnIndex = gameState.combat.initiative.indexOf('enemy_test1');
  pinRandom(0.95);
  const h0 = e.hp;
  await Combat.handleEnemyTurn('enemy_test1');
  unpinRandom();
  check(h0 - e.hp === 2, `one enemy turn ticks Bleed(-2) once: goblin lost ${h0 - e.hp}, duration 5 -> ${e.statusEffects[0]?.duration ?? 0}`);
});

// =====================================================================
section('3b. Spells (Cast button -> spellCasting.castSpell)');
await block(async () => {
  const Spells = await import('../spells.js');
  const SpellCasting = await import('../spellCasting.js');
  const { p, e } = fresh();
  p.mp = 50; p.maxMp = 50;
  await Spells.initializePlayerSpellcasting(p);
  const known = p.spellcasting?.knownSpells || [];
  out(`    starting spells: ${known.map(s => `${s.name}[mp ${s.mpCost}, dmg ${s.effects?.damage ?? 0}, heal ${s.effects?.healing ?? 0}, fx ${(s.effects?.statusEffects || []).join('/') || '-'}]`).join('; ') || 'none'}`);
  check(known.length > 0, `offline spell init grants starting spells (${known.length})`);
  // Offline starters are utility/heal only; add a narrator-style attack spell
  // shaped like the batch generator's output to exercise the damage path.
  if (!known.some(s => s.effects?.damage > 0)) {
    const bolt = { id: 'spell_bolt', name: 'Fire Bolt', school: 'ELEMENTAL', type: 'OFFENSIVE', level: 1, mpCost: 5, targeting: 'single', range: 'medium', duration: 'short', effects: { damage: 12, statusEffects: ['burning'] } };
    p.spellcasting.knownSpells.push(bolt); p.spellcasting.preparedSpells.push(bolt);
  }
  const dmgSpell = known.find(s => s.effects?.damage > 0);
  if (dmgSpell) {
    startFight();
    const mp0 = p.mp, hp0 = e.hp, r0 = gameState.combat.round;
    const res = await SpellCasting.castSpell(p, dmgSpell, e);
    check(res.success && p.mp < mp0 && e.hp < hp0, `cast ${dmgSpell.name}: MP ${mp0} -> ${p.mp}, goblin ${hp0} -> ${e.hp} (${res.reason || 'ok'})`);
    // spellUI.js Cast button in a fight runs the battle 'Spell' action.
    const mp1 = p.mp, r1 = gameState.combat.round;
    await AH.handlePlayerChoice('Spell', `Cast ${dmgSpell.name}`);
    check(p.mp < mp1 && (!gameState.inCombat || gameState.combat.round > r1 || gameState.combat.currentTurnIndex !== 0), `combat Cast costs MP and hands the turn on (MP ${mp1} -> ${p.mp}, round ${r1} -> ${gameState.combat?.round})`);
    const res2 = await SpellCasting.castSpell(p, dmgSpell, e);
    out(`    recast immediately: success=${res2.success}, MP now ${p.mp} (spells have no cooldown field: ${dmgSpell.cooldown === undefined})`);
  }
  const fxSpell = known.find(s => (s.effects?.statusEffects || []).length);
  if (fxSpell) {
    const { p: q, e: g } = fresh(); q.mp = 50; q.spellcasting = p.spellcasting; startFight();
    await SpellCasting.castSpell(q, fxSpell, g);
    const fx = [...g.statusEffects, ...q.statusEffects].map(s => `${s.name}:${s.duration}:${JSON.stringify(s.effectTickData)}`);
    check(fx.some(s => !s.endsWith(':{}')), `${fxSpell.name} applies a status with mechanical data (${fx.join(', ') || 'none'})`);
  }
});

// =====================================================================
section('5. Battle options');
await block(async () => {
  for (const kind of ['Attack', 'Special', 'Item', 'Run']) {
    const { p } = fresh();
    p.inventory.push(potion(10, 1));
    p.specialMoves.push({ id: 'mvx', name: 'Kick', cooldown: 2, currentCooldown: 0, mpCost: 0, mechanics: {} });
    startFight();
    const r0 = gameState.combat.round;
    let err = null;
    pinRandom(0.5);
    try { await AH.handlePlayerChoice(kind, kind); } catch (x) { err = x; }
    unpinRandom();
    const advanced = !gameState.inCombat || gameState.combat.round > r0;
    const swallowed = gameState_lastCaught();
    check(!err && !gameState.isLoading, `${kind}: handlePlayerChoice returns without throwing, turn lock released`);
    check(advanced && !swallowed, `${kind}: enemy turn runs and round advances (round ${r0} -> ${gameState.combat?.round}, inCombat=${gameState.inCombat}${swallowed ? ', swallowed: ' + swallowed : ''})`);
  }
  const flee = async (r) => { const { p } = fresh(); startFight(); pinRandom(r); await AH.handlePlayerChoice('Run', 'Flee'); unpinRandom(); return { inCombat: gameState.inCombat, enemies: gameState.enemies.length, hp: p.hp }; };
  const ok = await flee(0.1), no = await flee(0.9);
  check(!ok.inCombat && ok.enemies === 0, `Run roll 0.1 (< 0.4) escapes (inCombat=${ok.inCombat}, enemies=${ok.enemies})`);
  check(no.inCombat && no.hp < 100, `Run roll 0.9 fails and the goblin gets its swing (inCombat=${no.inCombat}, HP ${no.hp})`);
});
await block(async () => {
  // Two heroes: turn passes to the next actor
  const { p } = fresh();
  const b = createNewPlayer('Ben', 12); gameState.players.push(b);
  startFight();
  const order = gameState.combat.initiative.map(id => Combat.findCharacterById(id)?.name);
  pinRandom(0.95);
  const first = gameState.players[gameState.currentPlayerIndex].name;
  await AH.handlePlayerChoice('Attack', 'Strike');
  const second = gameState.players[gameState.currentPlayerIndex].name;
  unpinRandom();
  check(first !== second, `2 heroes: after ${first} acts, control passes to ${second} (initiative ${order.join(', ')})`);
});

await block(async () => {
  // A stunned hero can't drink a potion or flee either.
  const { p } = fresh();
  p.inventory.push(potion(30, 1));
  p.hp = 40;
  startFight();
  Combat.applyStatusEffect(p, 'Stun', 2, {}, 'test');
  await AH.handlePlayerChoice('Item', 'Use Healing Potion');
  const kept = p.inventory.some(i => i.id === 'item_potion');
  check(kept, `stunned hero cannot use an item (potion still in pack: ${kept}, HP ${p.hp})`);
});

await block(async () => {
  // Live phone: a generated spell with school 'Divination' crashed castSpell ('icon' of undefined).
  const { p, e } = fresh();
  startFight();
  const spell = { id: 'sp_div', name: 'Aura Sense', school: 'Divination', type: 'UTILITY', level: 0, mpCost: 4, targeting: 'self', effects: {} };
  p.spellcasting = p.spellcasting || { knownSpells: [], preparedSpells: [] };
  p.spellcasting.knownSpells.push(spell); p.spellcasting.preparedSpells?.push(spell);
  const mp0 = p.mp;
  const res = await (await import('../spellCasting.js')).castSpell(p, spell);
  check(res?.success && p.mp === mp0 - 4, `spell from an unknown school casts and costs MP (${res?.success ? 'ok' : res?.reason}, MP ${mp0} -> ${p.mp})`);
});

await block(async () => {
  // Classic-RPG layer: XP/levels, no escaping bosses, battle menus list real options.
  const Battle = await import('../battle.js');
  const { p, e } = fresh(); p.level = 1; p.xp = 0;
  const hp0 = p.maxHp;
  const r = Battle.awardXp({ name: 'Ogre', maxHp: 80, isBoss: true });
  check(p.level >= 2 && p.maxHp > hp0, `boss kill gives XP and a level-up (+${r.xp} XP, level ${p.level}, max HP ${hp0} -> ${p.maxHp})`);
  e.isBoss = true; startFight(); pinRandom(0.01);
  await AH.handlePlayerChoice('Run', 'Flee');
  unpinRandom();
  check(gameState.inCombat === true, 'cannot run from a boss (still in combat after a lucky roll)');
  p.inventory = [{ id: 'pot', name: 'Health Potion', type: 'Consumable', stats: { heal: 30 }, quantity: 2 }];
  const items = Battle.battleOptions('Item', p);
  check(items.length === 1 && items[0].label.includes('×2') && items[0].detail.includes('heals 30'), `Item menu lists real items (${items.map(o => o.label + ': ' + o.detail).join('; ')})`);
  const specials = Battle.battleOptions('Special', p);
  check(specials.some(o => o.label === 'Power Strike'), 'Special menu always offers Power Strike');
  check(Battle.battleOptions('Attack', p) === null, 'one foe: Attack needs no target menu');
});

await block(async () => {
  // Every hero can fight and heal with magic; a healing spell in a fight heals the caster.
  const Spells = await import('../spells.js');
  const { p, e } = fresh();
  p.spellcasting = { knownSpells: [{ name: 'Aether Sense', effects: {} }], preparedSpells: [] };
  Spells.ensureBattleSpells(p);
  const atk = p.spellcasting.knownSpells.find(s => s.effects?.damage > 0), heal = p.spellcasting.knownSpells.find(s => s.effects?.healing > 0);
  check(!!atk && !!heal, `utility-only spellbook gains an attack and a healing spell (${atk?.name}, ${heal?.name})`);
  p.hp = 40; p.mp = 20; startFight(); pinRandom(0.5);
  const foe0 = e.hp;
  await AH.handlePlayerChoice('Spell', `Cast ${heal.name}`);
  unpinRandom();
  check(p.hp > 40 && e.hp === foe0, `healing spell in a fight heals the hero, not the foe (hero 40 -> ${p.hp}, foe ${foe0} -> ${e.hp})`);
});

// =====================================================================
section('Batch 4: enemy specials, disabled foes, status names, selling');
await block(async () => {
  // Spider 'Web' special referenced an undefined `duration`: the enemy turn threw.
  const { p } = fresh({ enemy: { abilities: ['Web'] } });
  startFight(); pinRandom(0.01);
  await enemyTurn();
  unpinRandom();
  check(p.statusEffects.some(s => s.name === 'Webbed'), `Web special webs the hero (hero effects: ${p.statusEffects.map(s => s.name).join(',') || 'none'})`);
});
await block(async () => {
  // AI-named villain abilities hit the default branch: a popup and no effect.
  const { p } = fresh({ enemy: { abilities: ['Basic Attack', 'Crushing Blow'] } });
  startFight(); pinRandom(0.01);
  const hp0 = p.hp;
  await enemyTurn();
  unpinRandom();
  check(p.hp < hp0, `unknown special 'Crushing Blow' deals damage (hero HP ${hp0} -> ${p.hp})`);
});
await block(async () => {
  // Shadow Bolt to 0 HP left the hero standing at 0 (never downed).
  const { p } = fresh({ enemy: { abilities: ['Basic Attack', 'Shadow Bolt'], atk: 80 } });
  startFight(); p.hp = 5; pinRandom(0.01);
  await enemyTurn();
  unpinRandom();
  check(p.hp === 0 && p.isDowned === true, `Shadow Bolt to 0 HP downs the hero (hp ${p.hp}, downed ${p.isDowned})`);
});
await block(async () => {
  // A faster foe sits first in initiative while the hero acts: its round-1 reply was skipped.
  const { p } = fresh({ enemy: { speed: 99 } });
  startFight(); pinRandom(0.5);
  const hp0 = p.hp;
  await AH.handlePlayerChoice('Attack', 'Strike the goblin');
  unpinRandom();
  check(p.hp < hp0, `faster foe answers the hero's first attack (hero HP ${hp0} -> ${p.hp})`);
});
await block(async () => {
  // God mode "I gain 50 attack" replaced ATK with 50 (a 60-ATK hero went down to 50).
  const { p } = fresh({ player: { atk: 60, baseAtk: 60 } });
  const ops = AH.extractGodModeDiffOps('I gain 50 attack');
  const v = ops.find(o => o.path === '/players/0/atk')?.value;
  check(v === 110, `"I gain 50 attack" at ATK 60 -> ${v} (expect 110)`);
});
await block(async () => {
  // RESOURCE_REGEN_COMBAT existed but nothing applied it in a fight: MP stayed at 0.
  const { p } = fresh();
  p.mp = 0; p.maxMp = 20;
  startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Attack', 'Strike the goblin');
  unpinRandom();
  check(p.mp > 0, `MP regenerates each combat round (MP 0 -> ${p.mp} after one exchange)`);
});
await block(async () => {
  // A stunned boss still landed its every-other-round signature hit.
  const { p, e } = fresh({ enemy: { isBoss: true } });
  startFight(); gameState.combat.round = 2;
  Combat.applyStatusEffect(e, 'Stun', 1, {}, 'test');
  const hp0 = p.hp; pinRandom(0.5);
  await enemyTurn();
  unpinRandom();
  check(p.hp === hp0, `stunned boss loses its turn (hero HP ${hp0} -> ${p.hp})`);
});
await block(async () => {
  // The narrator writes "Stunned"/"poisoned": those names never matched the catalog.
  const { e } = fresh();
  Combat.applyStatusEffect(e, 'stunned', 1, {}, 'test');
  check(e.statusEffects[0]?.name === 'Stun' && !Combat.canCharacterAct(e), `"stunned" is stored as Stun and disables (stored as ${e.statusEffects[0]?.name})`);
});
await block(async () => {
  // Buy a potion and sell it straight back: must not make money.
  const { p } = fresh();
  p.coins = 100;
  AH.buyShopItem({ id: 'shop_pot', name: 'Cheap Tonic', type: 'Consumable', tier: 'Low', cost: 4, stats: { heal: 10 } });
  const it = p.inventory.find(i => i.name === 'Cheap Tonic');
  AH.sellInventoryItem(it.id);
  check(p.coins <= 100 - 2, `buy for 4 then sell: coins 100 -> ${p.coins} (no profit)`);
});

// =====================================================================
section('Batch 5: items, spells, jail, quests, engine guards');
await block(async () => {
  // Revival items carry healPercent: "Use" drank them on yourself.
  const { p } = fresh();
  p.hp = 40;
  p.inventory.push({ id: 'item_phx', name: 'Phoenix Ash', type: 'Consumable', tier: 'High', stats: { revive: true, healPercent: 0.25 }, quantity: 1 });
  await AH.useInventoryItem('item_phx');
  check(p.inventory.some(i => i.id === 'item_phx') && p.hp === 40, `revival item is kept for Help Ally (in pack: ${p.inventory.some(i => i.id === 'item_phx')}, HP 40 -> ${p.hp})`);
});
await block(async () => {
  // Heal items lost their cure outside battle.
  const { p } = fresh();
  p.hp = 40;
  Combat.applyStatusEffect(p, 'Poison', 4, {}, 'test');
  p.inventory.push({ id: 'item_hc', name: 'Purifying Draught', type: 'Consumable', tier: 'Low', effect: 'Heals and cures poison.', stats: { heal: 20, cure: 'Poison' }, quantity: 1 });
  await AH.useInventoryItem('item_hc');
  check(!p.statusEffects.some(s => s.name === 'Poison'), `heal+cure item cures Poison outside battle (effects: ${p.statusEffects.map(s => s.name).join(',') || 'none'})`);
});
await block(async () => {
  // Retiring god mode left old milestones: the new quest's beats were rejected as duplicates.
  fresh();
  gameState.isGoalComplete = true;
  gameState.questProgress = { milestones: [{ name: 'call_to_adventure' }, { name: 'final_blow' }], completionPercentage: 100 };
  Engine.applyDiff(AH.extractGodModeDiffOps('I retire my godhood'));
  const applied = Engine.applyDiff([{ op: 'add', path: '/questProgress/milestones/-', value: { name: 'call_to_adventure' } }]);
  check(gameState.isGoalComplete === false && gameState.questProgress.milestones.length === 1, `after retiring, a new call_to_adventure is accepted (milestones: ${gameState.questProgress.milestones.map(m => m.name).join(',')})`);
});
await block(async () => {
  // Second capture: old jail beats blocked the new escape; seized gear kept its ATK.
  const Jail = await import('../jailSystem.js');
  const { p } = fresh();
  p.inventory.push(weapon(10)); AH.equipInventoryItem('item_sword', 'weapon');
  gameState.questProgress = { milestones: [{ name: 'jail_assessed' }, { name: 'jail_escaped' }, { name: 'call_to_adventure' }] };
  Jail.transitionToJail();
  const names = gameState.questProgress.milestones.map(m => m.name);
  check(!names.some(n => n.startsWith('jail_')) && names.includes('call_to_adventure'), `capture clears old jail beats, keeps the rest (${names.join(',')})`);
  check(p.atk === 5, `confiscated sword's ATK leaves with it (ATK ${p.atk}, expect 5)`);
  Jail.completeJailEscape();
  check(p.equipment.weapon === 'item_sword' && p.atk === 15, `escape returns the sword equipped (slot ${p.equipment.weapon}, ATK ${p.atk})`);
});
await block(async () => {
  // "tried to slip past the guards but was caught" counted as an escape.
  const Jail = await import('../jailSystem.js');
  fresh();
  gameState.imprisoned = true;
  gameState.currentNarrative = 'You tried to slip past the guards but were caught and dragged back.';
  check(Jail.tryAutoCompleteEscape() === false && gameState.imprisoned, 'a failed escape attempt is not an escape');
});
await block(async () => {
  // AI-made heal spells are tagged 'single' (enemy-only): they fizzled and still took MP.
  const { p } = fresh();
  const heal = { id: 'sp_mend', name: 'Sap Mend', level: 1, mpCost: 4, targeting: 'single', effects: { healing: 20 }, school: 'Restoration' };
  p.spellcasting = { knownSpells: [heal], preparedSpells: [heal], maxSpellLevel: 1 };
  p.hp = 50; p.mp = 20;
  startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Spell', 'Cast Sap Mend');
  unpinRandom();
  check(p.hp > 50, `'single' heal spell heals the caster in battle (HP 50 -> ${p.hp}, MP 20 -> ${p.mp})`);
  const S = await import('../spellCasting.js');
  const bolt = { id: 'sp_bolt', name: 'Bolt', level: 1, mpCost: 4, targeting: 'single', effects: { damage: 10 } };
  p.spellcasting.knownSpells.push(bolt); p.spellcasting.preparedSpells.push(bolt); p.mp = 20;
  await S.castSpell(p, bolt, p); // invalid target: a damage spell on yourself
  check(p.mp === 20, `a spell with no valid target costs no MP (MP 20 -> ${p.mp})`);
});
await block(async () => {
  // A learned-but-unprepared spell (story/god mode) always fizzled.
  const { p } = fresh();
  const bolt = { id: 'sp_b2', name: 'Ember Dart', level: 1, mpCost: 4, targeting: 'single', effects: { damage: 12 } };
  p.spellcasting = { knownSpells: [bolt], preparedSpells: [], maxSpellLevel: 1 };
  p.mp = 20;
  const Spells = await import('../spells.js');
  check(Spells.canCastSpell(p, bolt).success, `known spell is castable without a prepare step (${Spells.canCastSpell(p, bolt).reason || 'ok'})`);
});
await block(async () => {
  // Narrator item stats as text were glued onto ATK; quantity "2" stored as text; no stacking.
  const { p } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'Bone Club', type: 'Weapon', stats: { atk: '6' } } }]);
  const club = p.inventory.find(i => i.name === 'Bone Club');
  check(club?.stats.atk === 6, `item stat "6" stored as number (${JSON.stringify(club?.stats)})`);
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'Healing Potion', type: 'Consumable', stats: { heal: 20 }, quantity: '2' } }]);
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'healing potion', type: 'Consumable', stats: { heal: 20 } } }]);
  const pots = p.inventory.filter(i => /healing potion/i.test(i.name));
  check(pots.length === 1 && pots[0].quantity === 3, `potions stack: ${pots.length} entr(ies), quantity ${pots.map(x => JSON.stringify(x.quantity)).join(',')}`);
  Engine.applyDiff([{ op: 'remove', path: '/players/0/inventory/Healing Potion' }]);
  check(pots[0].quantity === 2, `narrator removes one by name (quantity now ${pots[0].quantity})`);
});
await block(async () => {
  // Engine HP 0 did not down the hero; enemy atk "7" was text (hits for 68+).
  const { p } = fresh();
  Engine.applyDiff([{ op: 'replace', path: '/players/0/hp', value: 0 }]);
  check(p.isDowned === true, `engine HP 0 downs the hero (downed ${p.isDowned})`);
  Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Bog Rat', hp: 10, atk: '7', def: '-3' } }]);
  const rat = gameState.enemies.find(e => e.name === 'Bog Rat');
  check(rat?.atk === 7 && rat?.def === 0, `enemy atk "7" -> ${JSON.stringify(rat?.atk)}, def "-3" -> ${JSON.stringify(rat?.def)}`);
  p.level = 3; const lv = 3;
  Engine.applyDiff([{ op: 'replace', path: '/players/0/level', value: 2 }]);
  check(p.level === lv, `level cannot go down (${lv} -> ${p.level})`);
});
await block(async () => {
  fresh();
  const boss = AH.extractGodModeDiffOps('I summon Malgrath as a boss').find(o => o.path === '/enemies/-');
  const wish = AH.extractGodModeDiffOps('I gain the Fireball spell');
  check(boss?.value.isBoss === true, `god-mode summoned foe is a boss (${boss ? boss.value.isBoss : 'no summon matched'})`);
  check(!wish.some(o => /inventory/.test(o.path)), `"I gain the Fireball spell" adds no item (ops: ${wish.map(o => o.path).join(', ')})`);
});
await block(async () => {
  // "Use Greater Potion" used up "Potion".
  const { p } = fresh();
  p.hp = 40;
  p.inventory.push({ id: 'i1', name: 'Potion', type: 'Consumable', stats: { heal: 10 }, quantity: 1 });
  p.inventory.push({ id: 'i2', name: 'Greater Potion', type: 'Consumable', stats: { heal: 40 }, quantity: 1 });
  startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Item', 'Use Greater Potion');
  unpinRandom();
  check(p.inventory.some(i => i.id === 'i1') && !p.inventory.some(i => i.id === 'i2'), `"Use Greater Potion" uses the Greater Potion (left: ${p.inventory.map(i => i.name).join(',')})`);
});
await block(async () => {
  // Silence did nothing.
  const { p, e } = fresh();
  const dart = { id: 'sp_x', name: 'Ember Dart', level: 1, mpCost: 4, targeting: 'single', effects: { damage: 12 } };
  p.spellcasting = { knownSpells: [dart], preparedSpells: [dart], maxSpellLevel: 1 };
  p.mp = 20;
  startFight();
  Combat.applyStatusEffect(p, 'Silence', 2, {}, 'test');
  pinRandom(0.5);
  await AH.handlePlayerChoice('Spell', 'Cast Ember Dart');
  unpinRandom();
  check(p.mp >= 20, `silenced hero cannot cast (MP 20 -> ${p.mp})`);
});
await block(async () => {
  // 3 heroes out of combat: Poison ticked on every hero's turn (3x a round).
  fresh();
  const a = createNewPlayer('A', 10), b = createNewPlayer('B', 10), c = createNewPlayer('C', 10);
  gameState.players = [a, b, c]; gameState.currentPlayerIndex = 0;
  Combat.applyStatusEffect(a, 'Poison', 4, {}, 'test');
  for (let i = 0; i < 3; i++) await advanceTurn();
  const d = a.statusEffects.find(s => s.name === 'Poison')?.duration;
  check(d === 3, `Poison ticks once per 3-hero round (duration 4 -> ${d})`);
});
await block(async () => {
  const Items = await import('../items.js');
  const shop = Array.from({ length: 30 }, (_, i) => Items.generateShopItems('fantasy', 5 * i)).flat();
  check(shop.every(i => typeof i.cost === 'number'), `every shop item has a price (${shop.filter(i => typeof i.cost !== 'number').map(i => i.name).join(', ') || 'all priced'})`);
});
await block(async () => {
  const Battle = await import('../battle.js');
  const { p } = fresh();
  p.spellcasting = { knownSpells: [], preparedSpells: [], maxSpellLevel: 1 };
  Battle.levelUp(p, 3);
  check(p.spellcasting.maxSpellLevel >= 2, `level ${p.level} unlocks spell level ${p.spellcasting.maxSpellLevel}`);
});

// =====================================================================
section('Batch 6: the quest is only won by beating the boss (phone run 10-08)');
const climaxState = () => {
  fresh();
  gameState.enemies = [];
  gameState.questProgress = { villain: 'High Inquisitor Malakor', milestones: ['call_to_adventure', 'world_introduced', 'stakes_clear', 'first_obstacle_overcome', 'antagonist_revealed', 'final_confrontation'].map(name => ({ name })) };
};
await block(async () => {
  // The exact reply from the phone: win ops before the boss is added.
  climaxState();
  Engine.applyDiff([
    { op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow' } },
    { op: 'replace', path: '/isGoalComplete', value: true },
    { op: 'add', path: '/enemies/-', value: { name: 'High Inquisitor Malakor', hp: 60, isBoss: true } },
    { op: 'replace', path: '/inCombat', value: true }
  ]);
  const names = gameState.questProgress.milestones.map(m => m.name);
  check(!gameState.isGoalComplete && !names.includes('final_blow') && gameState.inCombat, `win ops sent with a fresh boss are refused (goal ${gameState.isGoalComplete}, final_blow ${names.includes('final_blow')}, in combat ${gameState.inCombat})`);
});
await block(async () => {
  // No boss fight at all: the story cannot just declare victory.
  climaxState();
  Engine.applyDiff([{ op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow' } }, { op: 'replace', path: '/isGoalComplete', value: true }]);
  check(!gameState.isGoalComplete, `no boss ever fought: goal stays open (${gameState.isGoalComplete})`);
});
await block(async () => {
  // Positive control: kill the boss, then the same ops win.
  climaxState();
  Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'High Inquisitor Malakor', hp: 60, isBoss: true } }, { op: 'replace', path: '/inCombat', value: true }]);
  const boss = gameState.enemies[0]; boss.hp = 0; boss.isDefeated = true;
  await Combat.handleEnemyDefeat(boss.id);
  gameState.inCombat = false; gameState.enemies = []; // victory clears the list
  Engine.applyDiff([{ op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow' } }, { op: 'replace', path: '/isGoalComplete', value: true }]);
  check(gameState.isGoalComplete === true, `after the boss falls the quest is won (${gameState.isGoalComplete})`);
});
await block(async () => {
  // Story ended the fight with the drake at 2 HP: it stayed in the list, out of combat.
  fresh();
  gameState.enemies = [];
  Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Mountain Drake', hp: 25 } }, { op: 'replace', path: '/inCombat', value: true }]);
  gameState.enemies[0].hp = 2;
  Engine.applyDiff([{ op: 'replace', path: '/inCombat', value: false }]);
  check(!gameState.inCombat && gameState.enemies.length === 0, `story-ended fight: live drake is driven off (enemies left ${gameState.enemies.length})`);
  Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Malakor', hp: 60, isBoss: true } }, { op: 'replace', path: '/inCombat', value: true }]);
  Engine.applyDiff([{ op: 'replace', path: '/inCombat', value: false }]);
  check(gameState.inCombat === true, `story cannot end a boss fight with the boss standing (in combat ${gameState.inCombat})`);
});

// =====================================================================
section('Batch 7: Defend, Haste/Slow, Confusion, area spells, party XP and loot');
await block(async () => {
  // Defend: half damage from the foe's next hit, a small breather, and the guard ends after the hero's next turn.
  const hit = async (defend) => {
    const { p } = fresh();
    startFight(); pinRandom(0.5);
    p.hp = 60;
    if (defend) await AH.handlePlayerChoice('Defend', 'Raise your guard');
    else { const hp0 = p.hp; await enemyTurn(); unpinRandom(); return hp0 - p.hp; }
    unpinRandom();
    return { taken: 60 + Math.max(2, Math.round(100 * 0.05)) - p.hp, guard: p.statusEffects.find(s => s.name === 'Guarding')?.duration };
  };
  const open = await hit(false);
  const g = await hit(true);
  check(g.taken > 0 && g.taken <= Math.ceil(open / 2), `Defend halves the foe's hit (open ${open}, guarded ${g.taken}), guard left ${g.guard}`);
  const { p } = fresh(); startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Defend', 'guard'); await AH.handlePlayerChoice('Attack', 'Strike the goblin');
  unpinRandom();
  check(!p.statusEffects.some(s => s.name === 'Guarding'), `guard is gone after the hero's next turn (${p.statusEffects.map(s => s.name + ':' + s.duration).join(',') || 'none'})`);
});
await block(async () => {
  // Defend is offered in every fight, as a fixed battle button.
  fresh(); startFight();
  UI.renderChoices([{ type: 'Attack', text: 'Hit the goblin' }, { type: 'Run', text: 'Flee' }]);
  check(gameState.currentChoices.some(c => c.type === 'Defend'), `battle choices include Defend (${gameState.currentChoices.map(c => c.type).join(',')})`);
  gameState.inCombat = false;
  UI.renderChoices([{ type: 'Good', text: 'a' }, { type: 'Bad', text: 'b' }]);
  check(!gameState.currentChoices.some(c => c.type === 'Defend'), 'no Defend outside a fight');
});
await block(async () => {
  // Haste: the hero follows up with a quick strike; a hasted foe strikes twice.
  const dealt = async (haste) => {
    const { p, e } = fresh(); startFight(); pinRandom(0.5);
    if (haste) Combat.applyStatusEffect(p, 'Haste', 3, {}, 'test');
    const hp0 = e.hp; await AH.handlePlayerChoice('Attack', 'Strike the goblin'); unpinRandom(); return hp0 - e.hp;
  };
  const a = await dealt(false), b = await dealt(true);
  check(b > a, `hasted hero deals more per turn (${a} -> ${b})`);
  const taken = async (haste) => {
    const { p, e } = fresh(); startFight(); pinRandom(0.5);
    if (haste) Combat.applyStatusEffect(e, 'Haste', 3, {}, 'test');
    const hp0 = p.hp; await enemyTurn(); unpinRandom(); return hp0 - p.hp;
  };
  const c = await taken(false), d = await taken(true);
  check(d > c, `hasted foe hits twice (${c} -> ${d})`);
});
await block(async () => {
  // Slow: loses every other turn (even rounds), for heroes and foes.
  const { p, e } = fresh(); startFight(); gameState.combat.round = 2;
  Combat.applyStatusEffect(e, 'Slow', 4, {}, 'test');
  pinRandom(0.5); const hp0 = p.hp; await enemyTurn(); unpinRandom();
  check(p.hp === hp0, `slowed foe loses its even-round turn (hero ${hp0} -> ${p.hp})`);
  const f = fresh(); startFight(); gameState.combat.round = 2;
  Combat.applyStatusEffect(f.p, 'Frost', 3, {}, 'test');
  pinRandom(0.5); const e0 = f.e.hp; await AH.handlePlayerChoice('Attack', 'Strike the goblin'); unpinRandom();
  check(f.e.hp === e0, `Frost-slowed hero loses the even-round attack (goblin ${e0} -> ${f.e.hp})`);
});
await block(async () => {
  // Confusion: the blow lands on yourself (solo) / the foe hits itself.
  const { p, e } = fresh(); startFight();
  Combat.applyStatusEffect(p, 'Confusion', 2, {}, 'test');
  pinRandom(0.1); // < 0.5: confused this turn
  const e0 = e.hp, p0 = p.hp; await AH.handlePlayerChoice('Attack', 'Strike the goblin'); unpinRandom();
  check(e.hp === e0 && p.hp < p0, `confused hero hits themselves (goblin ${e0} -> ${e.hp}, hero ${p0} -> ${p.hp})`);
  const g = fresh(); startFight();
  Combat.applyStatusEffect(g.e, 'Confusion', 2, {}, 'test');
  pinRandom(0.1); const h0 = g.p.hp, f0 = g.e.hp; await enemyTurn(); unpinRandom();
  check(g.p.hp === h0 && g.e.hp < f0, `confused foe hurts itself (hero ${h0} -> ${g.p.hp}, foe ${f0} -> ${g.e.hp})`);
});
await block(async () => {
  // Area spells hit every foe; a single-target spell hits one.
  const { p } = fresh();
  gameState.enemies.push({ id: 'enemy_test2', name: 'Goblin Archer', hp: 200, maxHp: 200, atk: 8, def: 4, speed: 1, statusEffects: [], abilities: ['Basic Attack'] });
  const storm = { id: 'sp_storm', name: 'Fire Storm', level: 1, mpCost: 6, targeting: 'single', effects: { damage: 20 } };
  p.spellcasting = { knownSpells: [storm], preparedSpells: [storm], maxSpellLevel: 1 }; p.mp = 30;
  startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Spell', 'Cast Fire Storm'); unpinRandom();
  const hurt = gameState.enemies.filter(e => e.hp < 200).length;
  check(hurt === 2, `area spell hits every foe (${hurt} of 2 hurt: ${gameState.enemies.map(e => e.hp).join('/')})`);
});
await block(async () => {
  // XP pot scales with the party like the foes do: every hero earns what a
  // solo hero would (foe sized 25 HP solo / 35 HP for two: 15 XP each).
  const Battle = await import('../battle.js');
  fresh();
  const solo = Battle.awardXp({ maxHp: 25 });
  const a = createNewPlayer('A', 10), b = createNewPlayer('B', 10);
  gameState.players = [a, b];
  const duo = Battle.awardXp({ maxHp: 35 });
  check(solo.xp === 15 && duo.xp === 15 && a.xp === 15 && b.xp === 15, `solo 25-HP foe ${solo.xp} XP; duo vs 35-HP foe ${a.xp}/${b.xp} XP each`);
  b.isDowned = true; a.xp = 0;
  Battle.awardXp({ maxHp: 35 });
  check(a.xp === 30, `ally down: the standing hero takes the whole pot (${a.xp})`);
  gameState.players = [createNewPlayer('C', 10), createNewPlayer('D', 10), createNewPlayer('E', 10)];
  const boss = Battle.awardXp({ maxHp: 100, isBoss: true }); // boss sized for 3 = solo 60 HP -> 36*3 = 108
  check(boss.xp === 108, `3-hero boss (100 HP): ${boss.xp} XP each, same as a solo boss`);
});
await block(async () => {
  // Loot: one roll per standing hero, each to a different hero; coins split.
  fresh();
  const a = createNewPlayer('A', 10), b = createNewPlayer('B', 10), c = createNewPlayer('C', 10);
  gameState.players = [a, b, c];
  const e = gameState.enemies[0]; e.lootChance = 1; e.lootTier = 'Low'; e.maxHp = 60;
  startFight(); e.hp = 0; e.isDefeated = true;
  const c0 = [a, b, c].map(p => p.coins || 0);
  pinRandom(0.5); gameLog.length = 0;
  await Combat.handleEnemyDefeat(e.id); unpinRandom();
  const lootErr = gameLog.find(l => /ERROR generating dynamic loot|is not defined/.test(l));
  check(!lootErr, `3 loot rolls in a row raise no errors (${lootErr ? lootErr.slice(0, 90) : 'clean'})`);
  const got = [a, b, c].map(p => (p.inventory || []).length);
  const coins = [a, b, c].map((p, i) => (p.coins || 0) - c0[i]);
  check(got.every(n => n >= 1), `3 heroes, 100% drop: each hero gets a drop (${got.join('/')})`);
  check(coins[0] > 0 && coins.every(x => x === coins[0]), `coins split evenly (${coins.join('/')})`);
  fresh();
  const s = gameState.enemies[0]; s.lootChance = 1; s.lootTier = 'Low';
  const inv0 = gameState.players[0].inventory.length;
  startFight(); s.hp = 0; s.isDefeated = true; pinRandom(0.5);
  await Combat.handleEnemyDefeat(s.id); unpinRandom();
  check(gameState.players[0].inventory.length - inv0 === 1, `solo: one drop (${gameState.players[0].inventory.length - inv0})`);
});

// =====================================================================
section('Batch 8: combat review findings');
await block(async () => {
  // Narrator starts the fight, then adds the foe in the next reply: it never acted.
  fresh(); gameState.enemies = []; gameState.combat = { isActive: false, initiative: [], round: 1, currentTurnIndex: 0 };
  Engine.applyDiff([{ op: 'replace', path: '/inCombat', value: true }]);
  Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Wolf', hp: 20, atk: 9 } }]);
  const p = gameState.players[0]; const hp0 = p.hp; pinRandom(0.5);
  await AH.handlePlayerChoice('Attack', 'Strike the wolf'); unpinRandom();
  check(gameState.combat.isActive && gameState.combat.initiative.length === 2 && p.hp < hp0, `foe added after inCombat joins the turn order and fights back (order ${gameState.combat.initiative.length}, hero ${hp0} -> ${p.hp})`);
});
await block(async () => {
  // Help Ally in a fight was free: no enemy reply, same hero acted again.
  fresh();
  const a = gameState.players[0], b = createNewPlayer('Bo', 10);
  gameState.players = [a, b]; b.hp = 0; b.isDowned = true;
  a.inventory.push({ id: 'rv', name: 'Phoenix Ash', type: 'Consumable', stats: { revive: true, healPercent: 0.25 }, quantity: 1 });
  startFight(); gameState.combat.currentTurnIndex = gameState.combat.initiative.indexOf(a.id);
  pinRandom(0.5); gameLog.length = 0;
  await AH.helpAlly(b.id); unpinRandom();
  const foeActed = gameLog.some(l => /Enemy Turn: Goblin is acting/.test(l));
  const now = gameState.combat.initiative[gameState.combat.currentTurnIndex];
  check(!b.isDowned && (foeActed || now !== a.id), `Help Ally in a fight passes the turn (Bo up ${!b.isDowned}, turn now ${now === a.id ? 'still Ava' : now}, foe acted ${foeActed})`);
});
await block(async () => {
  // 'instant' damage spell with a status: the status was dropped.
  const { p, e } = fresh();
  const bolt = { id: 'sp_fb', name: 'Fire Bolt', level: 1, mpCost: 4, targeting: 'single', duration: 'instant', effects: { damage: 6, statusEffects: ['Burn'] } };
  p.spellcasting = { knownSpells: [bolt], preparedSpells: [bolt], maxSpellLevel: 1 }; p.mp = 20;
  startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Spell', 'Cast Fire Bolt'); unpinRandom();
  check(e.statusEffects.some(s => s.name === 'Burn'), `instant spell applies its Burn (${e.statusEffects.map(s => s.name).join(',') || 'none'})`);
});
await block(async () => {
  // Self buff named "Burst of Vigor" went to the foe.
  const { p, e } = fresh();
  const buff = { id: 'sp_bv', name: 'Burst of Vigor', level: 1, mpCost: 3, targeting: 'self', effects: { modifiers: { def: 3 } } };
  p.spellcasting = { knownSpells: [buff], preparedSpells: [buff], maxSpellLevel: 1 }; p.mp = 20;
  startFight(); const d0 = p.def, ed0 = e.def; pinRandom(0.5);
  await AH.handlePlayerChoice('Spell', 'Cast Burst of Vigor'); unpinRandom();
  check(p.def > d0 && e.def === ed0, `self buff with 'burst' in its name buffs the hero (hero DEF ${d0} -> ${p.def}, foe ${ed0} -> ${e.def})`);
});
await block(async () => {
  // Power Strike stayed winded into the next fight.
  const { p } = fresh(); p.lastPowerStrikeRound = 6; startFight();
  const Battle = await import('../battle.js');
  const ps = Battle.battleOptions('Special', p).find(o => o.label === 'Power Strike');
  check(!/winded/.test(ps.detail), `new fight: Power Strike ready (${ps.detail})`);
});
await block(async () => {
  // Battle Item with only a revive item drank it on yourself.
  const { p } = fresh(); p.hp = 50;
  p.inventory = [{ id: 'rv2', name: 'Phoenix Ash', type: 'Consumable', stats: { revive: true, healPercent: 0.25 }, quantity: 1 }];
  startFight(); pinRandom(0.5);
  await AH.handlePlayerChoice('Item', 'Use an item from your pack.'); unpinRandom();
  check(p.inventory.some(i => i.id === 'rv2'), `battle Item keeps the revive item for a downed ally (still in pack ${p.inventory.some(i => i.id === 'rv2')})`);
});
await block(async () => {
  // Narrator Poison twice stacked (ticked twice); Stun 999 never ended.
  const { e } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/enemies/0/statusEffects/-', value: { name: 'Poison' } }]);
  Engine.applyDiff([{ op: 'add', path: '/enemies/0/statusEffects/-', value: { name: 'Poison' } }]);
  Engine.applyDiff([{ op: 'add', path: '/players/0/statusEffects/-', value: { name: 'Stun', duration: 999 } }]);
  const stun = gameState.players[0].statusEffects.find(s => s.name === 'Stun');
  check(e.statusEffects.filter(s => s.name === 'Poison').length === 1 && stun && stun.duration <= 10, `narrator effects merge and are capped (poison x${e.statusEffects.filter(s => s.name === 'Poison').length}, stun ${stun?.duration})`);
});
await block(async () => {
  // Haste follow-up fired after a fizzled spell.
  const { p, e } = fresh();
  Combat.applyStatusEffect(p, 'Haste', 3, {}, 'test');
  p.spellcasting = { knownSpells: [{ id: 'sp_big', name: 'Doom', level: 1, mpCost: 99, targeting: 'single', effects: { damage: 50 } }], preparedSpells: [], maxSpellLevel: 1 }; p.mp = 1;
  startFight(); const e0 = e.hp; pinRandom(0.5);
  await AH.handlePlayerChoice('Spell', 'Cast Doom'); unpinRandom();
  check(e.hp === e0, `no hasted follow-up after a spell that fizzled (foe ${e0} -> ${e.hp})`);
});

console.error = realError;
out(`\nfetch attempts blocked: ${fetchCalls}; elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
out(failed ? `✗ ${failed} mechanics check(s) failed` : '✓ all mechanics checks passed');
process.exit(failed ? 1 : 0);
