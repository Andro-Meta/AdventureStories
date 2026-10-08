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
  check(p.mp === mp0 - 10, `Special: MP ${mp0} -> ${p.mp} (cost 10)`);
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

console.error = realError;
out(`\nfetch attempts blocked: ${fetchCalls}; elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
out(failed ? `✗ ${failed} mechanics check(s) failed` : '✓ all mechanics checks passed');
process.exit(failed ? 1 : 0);
