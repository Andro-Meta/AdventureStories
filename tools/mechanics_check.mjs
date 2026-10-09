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
  p.stats = { brave: 0, clever: 0, sneaky: 0, kind: 0 }; // base rules; stat effects are checked on their own
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
  check(typeof rat?.atk === 'number' && rat.atk >= 7 && rat.atk <= 12 && typeof rat?.def === 'number' && rat.def >= 0, `enemy atk "7" -> ${JSON.stringify(rat?.atk)}, def "-3" -> ${JSON.stringify(rat?.def)} (numbers; level floor applies)`);
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
  // Defend is offered in every fight, as a fixed battle button: always last,
  // never stored (stored, it was reshuffled), and the text the game sends is
  // the choice itself, not the badge + text.
  const buttons = [];
  const realBox = UI.elements.choicesContainer;
  try {
  UI.elements.choicesContainer = { set innerHTML(_) { buttons.length = 0; }, get innerHTML() { return ''; }, appendChild(b) { buttons.push(b); }, querySelectorAll: () => [] };
  fresh(); startFight();
  UI.renderChoices([{ type: 'Run', text: 'Flee' }, { type: 'Item', text: 'Drink a potion' }, { type: 'Attack', text: 'Hit the goblin' }, { type: 'Special', text: 'Power Strike' }]);
  UI.renderChoices(gameState.currentChoices); // a re-render
  const types = buttons.map(b => b.dataset?.actionType);
  check(types.join(',') === 'Attack,Special,Item,Defend,Run' && !gameState.currentChoices.some(c => c.type === 'Defend'), `battle menu order after a re-render: ${types.join(', ')} (Defend not stored)`);
  const atk = buttons.find(b => b.dataset?.actionType === 'Attack');
  check(atk?.dataset?.text === 'Hit the goblin', `choice text sent is the choice, not the badge ("${atk?.dataset?.text}")`);
  gameState.inCombat = false;
  UI.renderChoices([{ type: 'Good', text: 'a' }, { type: 'Bad', text: 'b' }]);
  check(!buttons.some(b => b.dataset?.actionType === 'Defend'), 'no Defend outside a fight');
  } finally { UI.elements.choicesContainer = realBox; }
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
  // solo hero would (foe sized 25 HP solo / 35 HP for two: 23 XP each).
  const Battle = await import('../battle.js');
  fresh();
  const solo = Battle.awardXp({ maxHp: 25 });
  const a = createNewPlayer('A', 10), b = createNewPlayer('B', 10);
  gameState.players = [a, b];
  const duo = Battle.awardXp({ maxHp: 35 });
  check(solo.xp === 23 && duo.xp === 23 && a.xp === 23 && b.xp === 23, `solo 25-HP foe ${solo.xp} XP; duo vs 35-HP foe ${a.xp}/${b.xp} XP each`);
  b.isDowned = true; a.xp = 0;
  Battle.awardXp({ maxHp: 35 });
  check(a.xp === 46, `ally down: the standing hero takes the whole pot (${a.xp})`);
  gameState.players = [createNewPlayer('C', 10), createNewPlayer('D', 10), createNewPlayer('E', 10)];
  const boss = Battle.awardXp({ maxHp: 100, isBoss: true }); // boss sized for 3 = solo 60 HP -> 54*3 = 162
  check(boss.xp === 162, `3-hero boss (100 HP): ${boss.xp} XP each, same as a solo boss`);
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

// =====================================================================
section('Batch 9: story/engine review findings');
await block(async () => {
  // One reply: spawn the villain, mark it defeated, final_blow -> quest won with no fight.
  fresh(); gameState.enemies = [];
  gameState.questProgress = { villain: 'Lord Vex', milestones: ['call_to_adventure', 'stakes_clear', 'antagonist_revealed', 'final_confrontation'].map(name => ({ name })) };
  Engine.applyDiff([
    { op: 'add', path: '/enemies/-', value: { name: 'Lord Vex', hp: 60, isBoss: true } },
    { op: 'replace', path: '/enemies/0/isDefeated', value: true },
    { op: 'add', path: '/questProgress/milestones/-', value: { name: 'final_blow' } }
  ]);
  check(!gameState.isGoalComplete && !gameState.enemies[0].isDefeated, `narrated boss defeat is refused (won ${gameState.isGoalComplete}, boss defeated ${gameState.enemies[0].isDefeated})`);
});
await block(async () => {
  // Retire god mode at turn 40: the new quest started in a finished Act 3 with the old villain.
  const Q = await import('../questDefinitions.js');
  fresh(); gameState.turn = 40; gameState.isGoalComplete = true;
  gameState.questProgress = { villain: 'Lord Vex', act3StartTurn: 31, bossDefeated: true, milestones: [{ name: 'final_blow' }] };
  gameState.enemies = [{ id: 'e_old', name: 'Lord Vex', hp: 0, maxHp: 60, isBoss: true, isDefeated: true, statusEffects: [] }];
  Engine.applyDiff(AH.extractGodModeDiffOps('I retire my godhood'));
  const hint = Q.buildQuestStageHint(gameState);
  check(/Act 1/.test(hint) && !/Lord Vex/.test(hint) && !gameState.questProgress.bossDefeated, `new quest after retiring at turn 40 starts in Act 1 with no old villain (${(hint.match(/MAIN QUEST STAGE — ([^:]+)/) || [])[1]})`);
  const re = Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Lord Vex', hp: 30 } }]);
  check(re.length === 1, 'the old villain name can return in the new quest');
});
await block(async () => {
  // Act 3 confronted with no boss: the deadline demanded final_blow forever (always refused).
  const Q = await import('../questDefinitions.js');
  fresh(); gameState.enemies = []; gameState.turn = 40;
  gameState.questProgress = { villain: 'Lord Vex', act3StartTurn: 35, milestones: ['call_to_adventure', 'stakes_clear', 'antagonist_revealed', 'final_confrontation'].map(name => ({ name })) };
  const hint = Q.buildQuestStageHint(gameState);
  check(/isBoss/.test(hint) && /Lord Vex/.test(hint.split('DEADLINE')[1] || '') && !/add the "final_blow"/.test(hint), `stalled climax asks for the boss fight (${(hint.match(/DEADLINE:[^\n]*/) || ['no deadline'])[0].slice(0, 90)})`);
});
await block(async () => {
  // God-mode summoned boss was always 60 HP.
  fresh(); gameState.isGoalComplete = true; gameState.enemies = [];
  Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Void Dragon', hp: 600, maxHp: 600, atk: 50, isBoss: true } }]);
  check(gameState.enemies[0]?.maxHp === 600, `god-mode boss keeps its size (${gameState.enemies[0]?.maxHp} HP)`);
});
await block(async () => {
  // Wild West / jungle / haunted... got generic theme filler.
  const AIH = await import('../aiHandler.js');
  fresh(); gameState.adventureTheme = 'wild_west';
  const sys = AIH.generateSystemPrompt();
  check(/Frontier towns/.test(sys) && !/Theme appropriate/.test(sys), 'wild_west prompt gets its own theme notes');
});

// =====================================================================
section('Batch 11: accuracy');
await block(async () => {
  // Penalty was uncapped (DEF 30 vs ATK 5: 40% to hit) and ATK 0 divided by zero.
  const { p, e } = fresh(); startFight();
  p.atk = 5; e.def = 30; pinRandom(0.75); // hits at the capped 80%, missed at the old 40%
  const r = Combat.executeWeaponAttack(p, e); unpinRandom();
  check(!r.missed, `ATK 5 vs DEF 30 lands a 0.75 roll (80% to hit, not 40%) (missed ${r.missed})`);
  p.atk = 0; pinRandom(0.5);
  const z = Combat.executeWeaponAttack(p, e); unpinRandom();
  check(!z.missed, `ATK 0 attack is a normal roll, no divide-by-zero (missed ${z.missed})`);
});

// =====================================================================
section('Batch 12: no repeated actions (phone game 10-08)');
await block(async () => {
  const AIH = await import('../aiHandler.js');
  fresh();
  gameState.recentTurns = [
    'T4 Michael: Study the flashing data streams for a repeating pattern to exploit -> worked (found 9 coins).',
    'T5 Michael: Crawl into the ventilation shaft alone to investigate the red pulse -> went wrong (lost 5 HP).',
    'T6 Michael: Use the biometric key on the ledger now -> worked (regained 4 HP).'
  ];
  const done = AIH.recentActionTexts('Michael chose (Good): "Peek through the vent grille" -> it works out.');
  check(done.length === 4 && done[2] === 'Use the biometric key on the ledger now', `recent actions read from the turn log (${done.length}: ${done.join(' | ').slice(0, 80)}...)`);
  const t7 = 'Secure the biometric key and return it to the ledger’s auth pads';
  check(AIH.isNearRepeat(t7, done), `"${t7}" is flagged as a repeat of turn 6`);
  const fresh5 = ['Examine the ‘Project Marigold’ subfile on the ledger before responding to the compartment',
    'Rush into the dark opening in the west wall without checking the ledger’s status',
    'Start dancing to confuse any potential security system in the ventilation shaft',
    'Attempt to wrest the biometric free from the ledger to scan the hidden compartment'];
  const flagged = fresh5.filter(c => AIH.isNearRepeat(c, done));
  check(flagged.length === 0, `new directions are not flagged (${flagged.length ? flagged.join(' | ') : 'none flagged'})`);
  const ins = AIH.buildChoiceInstructions(['Good', 'Bad'], false, done);
  check(/Never offer an action the heroes already took/.test(ins) && ins.includes('biometric key'), 'choice instructions list the actions already taken');
});

// =====================================================================
section('Batch 13: stats, checks, rewards and levels (progression.js)');
const Prog = await import('../progression.js');
await block(async () => {
  const h = Prog.ensureStats({ stats: {} });
  const pct = (t, st) => Math.round(Prog.chanceFor(t, h, st) * 100);
  check(pct('Safe', 'brave') === 70 && pct('Bold', 'brave') === 55 && pct('Reckless', 'brave') === 40 && pct('Bold', null) === 35, `odds at stat 1: Safe ${pct('Safe', 'brave')}% Bold ${pct('Bold', 'brave')}% Reckless ${pct('Reckless', 'brave')}%, a Bold 🍀 long shot ${pct('Bold', null)}% (+3 harder)`);
  h.stats.sneaky = 5;
  check(pct('Reckless', 'sneaky') === 60 && pct('Reckless', 'brave') === 40, `Sneaky 5 raises a Reckless sneaky move 40% -> ${pct('Reckless', 'sneaky')}%, not a brave one (${pct('Reckless', 'brave')}%)`);
  const seq = (v) => () => v;
  check(Prog.rollCheck('Reckless', h, seq(0.99), 'sneaky').band === 'crit' && Prog.rollCheck('Reckless', h, seq(0), 'sneaky').band === 'fumble', 'natural 20 is a crit, natural 1 a fumble');
  const r = Prog.rollCheck('Reckless', h, seq(0.30), 'sneaky'); // die 7 + 5 = 12 vs 14: within 3 -> partial
  check(r.band === 'partial', `7 + Sneaky 5 = 12 vs 14 is a success at a cost (${r.band})`);
});
await block(async () => {
  // Danger sizes the stakes: Safe never hurts, successes never hurt, and both
  // the pay on a win and the harm on a setback rise Safe < Bold < Reckless.
  const h = Prog.ensureStats({ stats: {}, maxHp: 100, level: 1 });
  let bad = [];
  const pay = {}, harm = {}, ev = {};
  for (const danger of Prog.DANGERS) {
    let wins = 0, won$ = 0, fails = 0, hurt = 0, all$ = 0, n = 0;
    for (const stat of ['brave', 'clever', 'sneaky', 'kind', null]) {
      for (let i = 0; i < 400; i++) {
        const roll = Prog.rollCheck(danger, h, Math.random, stat);
        const o = Prog.outcomeFor(roll, h);
        const won = roll.band === 'success' || roll.band === 'crit';
        if (won && o.hpLoss > 0) bad.push(`${danger} success hurt`);
        if (danger === 'Safe' && o.hpLoss > 0) bad.push('Safe hurt');
        if (o.xp < 5) bad.push(`${danger} gave ${o.xp} XP`);
        n++; all$ += o.coins;
        if (won) { wins++; won$ += Math.max(0, o.coins); } else if (roll.band === 'fail' || roll.band === 'fumble') { fails++; hurt += o.hpLoss; }
      }
    }
    pay[danger] = won$ / wins; harm[danger] = hurt / Math.max(1, fails); ev[danger] = all$ / n;
  }
  check(bad.length === 0, `Safe never hurts, successes never hurt, every check gives XP (${[...new Set(bad)].join(', ') || 'clean'})`);
  const f = (o) => Prog.DANGERS.map(d => o[d].toFixed(1)).join(' < ');
  check(pay.Safe < pay.Bold && pay.Bold < pay.Reckless && harm.Safe < harm.Bold && harm.Bold < harm.Reckless, `stakes rise with danger: coins per win ${f(pay)}, HP per setback ${f(harm)}`);
  // Per attempt at stat 1 (wins and losses together) the risk must pay: the
  // first cut had Reckless at 2.8 coins/turn vs Safe 10 (economy_sim).
  check(ev.Safe < ev.Bold && ev.Bold < ev.Reckless, `coins per attempt rise with danger: ${f(ev)}`);
  const fail = Prog.outcomeFor({ type: 'Reckless', band: 'fail', die: 3, stat: 'brave', dc: 14, total: 4 }, h, () => 0.5);
  const fum = Prog.outcomeFor({ type: 'Reckless', band: 'fumble', die: 1, stat: 'brave', dc: 14, total: 2 }, h, () => 0.5);
  check(fail.hpLoss >= 14 && fum.coins < 0 && fum.hpLoss >= 18, `a failed Reckless move hurts; a fumble also drops coins (fumble ${fum.coins}) (${fail.hpLoss} HP, ${fail.coins} coins)`);
  // 🍀 long shots: every win is spectacular (jackpot, top gear or a better
  // charm) and worth more than a normal win at the same danger.
  let dull = 0; const val = (o) => Math.max(0, o.coins) + (o.item ? (o.item.tierPool.includes('High') ? 60 : 30) : 0) + (o.charm ? 60 : 0);
  const avg = { luck: 0, brave: 0 };
  for (let i = 0; i < 2000; i++) {
    const lw = Prog.outcomeFor({ type: 'Bold', band: 'success', die: 15, stat: null, dc: 14, total: 15 }, h);
    if (!(lw.jackpot || lw.item?.tierPool.includes('High') || lw.charm)) dull++;
    avg.luck += val(lw) / 2000;
    avg.brave += val(Prog.outcomeFor({ type: 'Bold', band: 'success', die: 15, stat: 'brave', dc: 11, total: 16 }, h)) / 2000;
  }
  check(dull === 0 && avg.luck > avg.brave * 1.5, `every 🍀 win is spectacular (${dull} dull of 2000); worth ${avg.luck.toFixed(0)} vs a brave win ${avg.brave.toFixed(0)}`);
  const jack = Prog.outcomeFor({ type: 'Bold', band: 'crit', die: 20, stat: null, dc: 14, total: 20 }, h, () => 0.3);
  check(jack.jackpot && jack.coins >= 75, `a 🍀 natural 20 is a huge jackpot (${jack.coins} coins: ${jack.note})`);
});
await block(async () => {
  // Levels: 100 XP to level 2 with a stat point; 6 successes with a stat raise it.
  const h = Prog.ensureStats({ stats: {}, maxHp: 100, hp: 100, level: 1, xp: 0 });
  const Battle = await import('../battle.js');
  const n = Prog.gainXp(h, 100, Battle.levelUp);
  check(n === 1 && h.level === 2 && h.statPoints === 1 && h.maxHp === 110, `100 XP -> level ${h.level}, ${h.statPoints} stat point, max HP ${h.maxHp}`);
  check(Prog.spendStatPoint(h, 'clever') && h.stats.clever === 2 && h.statPoints === 0, `level-up point raises Clever to ${h.stats.clever}`);
  let grew = null; for (let i = 0; i < 6; i++) grew = Prog.addSpark(h, 'kind') || grew;
  check(grew === 'kind' && h.stats.kind === 2, `6 Kind successes raise Kind to ${h.stats.kind}`);
});
await block(async () => {
  // A real exploration turn: the roll decides; a crit can't hurt; a failed Bad move does.
  // A storyteller that answers (when none does, the roll is undone: Batch 18).
  const offline = globalThis.fetch;
  const STORY = JSON.stringify({ narration: 'It plays out.', ops: [], choices: Prog.APPROACHES.map((stat, i) => ({ stat, danger: Prog.DEFAULT_DANGER[stat], text: `Option ${i}` })) });
  globalThis.fetch = window.fetch = async () => ({ ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: STORY } }] }), text: async () => '' });
  localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'test');
  try {
  const { p } = fresh(); p.stats = { brave: 1, clever: 1, sneaky: 1, kind: 1 };
  const xp0 = p.xp || 0, hp0 = p.hp;
  gameState.currentChoices = [{ type: 'Reckless', stat: 'brave', text: 'Leap across the broken bridge' }];
  pinRandom(0.99); // natural 20
  await AH.handlePlayerChoice('Reckless', 'Leap across the broken bridge'); unpinRandom();
  check(p.hp === hp0 && (p.xp || 0) > xp0 && gameState.narrativeContext.lastOutcome?.band === 'crit', `Reckless crit: no harm, XP ${xp0} -> ${p.xp} (band ${gameState.narrativeContext.lastOutcome?.band})`);
  const g = fresh(); g.p.stats = { brave: 1, clever: 1, sneaky: 1, kind: 1 }; g.p.coins = 50;
  gameState.currentChoices = [{ type: 'Reckless', stat: 'brave', text: 'Kick the guard dog to get past it' }];
  pinRandom(0.1); // die 3: a clear failure
  await AH.handlePlayerChoice('Reckless', 'Kick the guard dog to get past it'); unpinRandom();
  check(g.p.hp < 100 && g.p.coins === 50, `failed Reckless move hurts (HP 100 -> ${g.p.hp}); only a fumble drops coins (coins 50 -> ${g.p.coins})`);
  const k = fresh(); k.p.stats = { brave: 1, clever: 1, sneaky: 1, kind: 1 };
  pinRandom(0.1);
  gameState.currentChoices = [{ type: 'Safe', stat: 'kind', text: 'Help the fisherman haul his net' }];
  await AH.handlePlayerChoice('Safe', 'Help the fisherman haul his net'); unpinRandom();
  check(k.p.hp === 100, `failed Safe move costs no HP (HP ${k.p.hp})`);
  } finally { globalThis.fetch = window.fetch = offline; localStorage.removeItem('adv.apiKey.api.groq.com'); localStorage.removeItem('adv.cloudProvider'); }
});
await block(async () => {
  // Story milestones pay XP and coins.
  const { p } = fresh(); gameState.questProgress = { milestones: [] }; p.coins = 0; p.xp = 0;
  Engine.applyDiff([{ op: 'add', path: '/questProgress/milestones/-', value: { name: 'call_to_adventure' } }]);
  check(p.xp === 50 && p.coins >= 15, `milestone: +${p.xp} XP, +${p.coins} coins`);
});
await block(async () => {
  // Stats in fights: Brave adds attack, Kind heals more.
  const { p } = fresh(); p.stats = { brave: 3, clever: 0, sneaky: 0, kind: 0 };
  Combat.recalculateCharacterStats(p);
  check(p.atk === 5 + 3, `Brave 3: ATK 5 -> ${p.atk}`);
  const k = fresh(); k.p.stats = { brave: 0, clever: 0, sneaky: 0, kind: 5 }; k.p.hp = 40;
  k.p.inventory.push({ id: 'pk', name: 'Healing Potion', type: 'Consumable', stats: { heal: 20 }, quantity: 1, effect: 'Restores HP.' });
  await AH.useInventoryItem('pk');
  check(k.p.hp === 70, `Kind 5: a 20-HP potion heals 30 (HP 40 -> ${k.p.hp})`);
});

// =====================================================================
section('Batch 14: stats in god mode');
await block(async () => {
  const { p } = fresh(); gameState.isGoalComplete = true;
  Engine.applyDiff(AH.extractGodModeDiffOps('my Brave is 5 and Clever 4'));
  check(p.stats.brave === 5 && p.stats.clever === 4, `god mode "my Brave is 5 and Clever 4" (brave ${p.stats.brave}, clever ${p.stats.clever})`);
  Engine.applyDiff([{ op: 'replace', path: '/players/0/level', value: 4 }]);
  check(p.statPoints === 3, `god-mode level 1 -> 4 gives 3 stat points (${p.statPoints})`);
  const q = fresh(); gameState.isGoalComplete = false;
  Engine.applyDiff([{ op: 'replace', path: '/players/0/stats/brave', value: 5 }]);
  check(q.p.stats.brave === 0, `outside god mode the storyteller can't set stats (brave ${q.p.stats.brave})`);
});

// =====================================================================
section('Batch 15: exploration turns run clean (live run 10-08)');
await block(async () => {
  // Every choice type at a natural 20 runs clean (a big faction swing used to
  // crash the turn; factions were later removed).
  const errs = [];
  for (const type of [...Prog.DANGERS, 'Good', 'Silly']) { // old saved types too
    fresh(); gameLog.length = 0; pinRandom(0.99);
    await AH.handlePlayerChoice(type, `A ${type} thing to do`); unpinRandom();
    errs.push(...gameLog.filter(l => /is not defined|is not a function|Error in handlePlayerChoice/.test(l)).map(l => `${type}: ${l.slice(0, 80)}`));
  }
  check(errs.length === 0, `every danger (and old saved types) at a natural 20 raises no errors (${errs[0] || 'clean'})`);
});

// =====================================================================
section('Batch 16: the stat follows the action; lucky charms');
await block(async () => {
  const S = await import('../schemas.js');
  const v = S.validateChoicesPayload({ choices: [
    { stat: 'kind', danger: 'safe', text: 'Sweet-talk the guard dog' }, { stat: 'Brave', danger: 'Reckless', text: 'Kick the guard dog to get past it' },
    { stat: 'sneaky', danger: 'Bold', text: 'Slip past the sleeping guards' }, { stat: 'luck', danger: 'nonsense', text: 'Bark back at the dog' },
    { stat: 'nonsense', text: 'Study the collar' }] }, false);
  check(v.map(c => `${c.stat || '-'}/${c.type}`).join(',') === 'kind/Safe,brave/Reckless,sneaky/Bold,luck/Bold,-/Bold',
    `approach and danger read loosely, junk -> defaults (${v.map(c => `${c.stat || '-'}/${c.type}`).join(',')})`);
  const old = S.validateChoicesPayload({ choices: ['Good', 'Bad', 'Risky', 'Silly', 'Investigative'].map(type => ({ type, text: type })) }, false);
  check(old.map(c => `${c.stat}/${c.type}`).join(',') === 'kind/Safe,brave/Reckless,brave/Bold,luck/Bold,clever/Safe', `old-style choices still load (${old.map(c => `${c.stat}/${c.type}`).join(',')})`);
  const h = Prog.ensureStats({ stats: { brave: 4, clever: 1, sneaky: 1, kind: 1 } });
  const braveBold = Math.round(Prog.chanceFor('Bold', h, 'brave') * 100), sneakyBold = Math.round(Prog.chanceFor('Bold', h, 'sneaky') * 100);
  check(braveBold === 70 && sneakyBold === 55, `same danger, the approach's stat decides: Bold+Brave 4 ${braveBold}%, Bold+Sneaky 1 ${sneakyBold}%`);
});
await block(async () => {
  // The turn rolls with the stat on the chosen button.
  const { p } = fresh(); p.stats = { brave: 0, clever: 0, sneaky: 5, kind: 0 };
  gameState.currentChoices = [{ type: 'Reckless', text: 'Slip past the sleeping guards', stat: 'sneaky' }];
  pinRandom(0.5); // die 11 + Sneaky 5 = 16 vs 14
  await AH.handlePlayerChoice('Reckless', 'Slip past the sleeping guards'); unpinRandom();
  const r = gameState.narrativeContext.lastOutcome?.roll;
  check(r?.stat === 'sneaky' && r?.total === 16 && r?.band === 'success', `rolled ${r?.stat} ${r?.die}+${r?.bonus}=${r?.total} vs ${r?.dc}: ${r?.band}`);
});
await block(async () => {
  const Items = await import('../items.js');
  const h = Prog.ensureStats({ stats: {}, inventory: [] });
  const before = Math.round(Prog.chanceFor('Bold', h, null) * 100);
  h.inventory.push(Items.makeLuckyCharm('pirate', 1));
  const after = Math.round(Prog.chanceFor('Bold', h, null) * 100);
  check(Prog.luckOf(h) === 1 && after === before + 5, `a lucky charm: luck ${Prog.luckOf(h)}, a luck move ${before}% -> ${after}%`);
  check(Prog.rollCheck('Reckless', h, () => 0.9, 'brave').band === 'crit', 'with luck 1 a natural 19 is a critical success');
  const shop = Items.generateShopItems('pirate', 3);
  check(shop.some(i => i.stats?.luck === 1 && i.cost === 60), `the shop sells a lucky charm (${shop.find(i => i.stats?.luck)?.name})`);
});

// =====================================================================
section('Batch 17: five choices, five approaches (phone 10-08)');
await block(async () => {
  const AIH = await import('../aiHandler.js');
  const phone = ['clever', 'clever', 'luck', 'brave', 'brave'].map(stat => ({ stat }));
  const good = ['brave', 'clever', 'sneaky', 'kind', 'luck'].map(stat => ({ stat }));
  check(AIH.approachGaps(phone) === 2 && AIH.approachGaps(good) === 0, `approach gaps: phone set ${AIH.approachGaps(phone)} (no kind, no sneaky), balanced set ${AIH.approachGaps(good)}`);
  const ins = AIH.buildChoiceInstructions(Prog.DANGERS, false, []);
  check(/one for each APPROACH/.test(ins) && ['brave', 'clever', 'sneaky', 'kind', 'luck'].every(a => ins.includes(`- ${a}:`)) && /danger ladder/.test(ins) && /"safe": little/.test(ins) && /"reckless": likely/.test(ins) && /Kick the snarling guard dog/.test(ins) && /luck: something ABSURD/.test(ins),
    'choice instructions: one per approach, each written as a safe / bold / reckless ladder');
});

// =====================================================================
section('Batch 18: storyteller down = the roll is undone (phone 10-08)');
await block(async () => {
  // Network is off here, so every story call fails. Phone 10-08: five taps in
  // five seconds while the AI was down each paid out coins/XP with no story.
  const { p } = fresh({ player: { coins: 50, hp: 7, maxHp: 10 } });
  gameState.enemies = [];
  gameState.currentChoices = [{ type: 'Reckless', text: 'Leap the gap', stat: 'brave' }];
  const snap = () => JSON.stringify({ coins: p.coins, hp: p.hp, xp: p.xp, level: p.level, inv: p.inventory.length, stats: p.stats, sparks: p.sparks });
  const before = snap();
  for (let i = 0; i < 5; i++) { gameState.isLoading = false; await AH.handlePlayerChoice('Reckless', 'Leap the gap'); }
  const after = snap();
  check(before === after, `5 choices with the storyteller down: hero unchanged (${after === before ? 'same' : before + ' -> ' + after})`);
});

// =====================================================================
section('Batch 19: always five approaches and all three dangers (phone 10-08: two luck, no sneaky)');
await block(async () => {
  gameState.choicePlan = null; // repair logic on its own (Batch 20 covers the round plan)
  const Prog = await import('../progression.js');
  const AIH = await import('../aiHandler.js');
  const ALL = Prog.APPROACHES;
  const distinct = (cs) => new Set(cs.map(c => c.stat)).size === 5 && cs.every(c => ALL.includes(c.stat));
  const mixed = (cs) => distinct(cs) && Prog.DANGERS.every(d => cs.some(c => c.type === d));
  // The screenshot's set.
  const phone = [
    { type: 'Bold', stat: 'luck', text: 'Balance a wobbling hubcap on your head to mimic the moving shadows.' },
    { type: 'Safe', stat: 'clever', text: 'Inspect the tracks in the dust beneath your Salvaged Tire Armor.' },
    { type: 'Reckless', stat: 'brave', text: 'Vault across the jagged alleyway using the Makeshift Pipe Wrench.' },
    { type: 'Safe', stat: 'kind', text: 'Share a ration of filtered water with the shivering scavenger.' },
    { type: 'Reckless', stat: 'luck', text: 'Lick the suspicious frost off the vibrating metallic sign.' }];
  const plan = Prog.mixPlan(phone);
  check(plan.length === 1 && plan[0].index === 4 && plan[0].stat === 'sneaky', `screenshot set: only the licking choice changes, to sneaky (${JSON.stringify(plan)})`);
  const allSafe = phone.map((c, i) => ({ ...c, stat: ALL[i], type: 'Safe' }));
  const ds = Prog.mixPlan(allSafe);
  check(ds.length === 2 && ds.every(p => p.stat === allSafe[p.index].stat) && new Set(ds.map(p => p.danger)).size === 2 && !ds.some(p => p.danger === 'Safe'),
    `all five Safe: two choices become Bold and Reckless, keeping their approach (${JSON.stringify(ds)})`);
  // Every combination of stats (incl. missing/invalid) on every type order.
  const TYPES = ['Safe', 'Bold', 'Reckless', 'Bold', 'Safe'];
  const opts = [...ALL, undefined];
  let bad = 0, sets = 0;
  const rec = (pre) => {
    if (pre.length === 5) {
      sets++;
      const cs = pre.map((stat, i) => ({ type: TYPES[(i + sets) % 5], stat, text: `choice ${i}` }));
      const out = Prog.fillMix(cs);
      if (!mixed(out)) bad++;
      return;
    }
    for (const o of opts) rec([...pre, o]);
  };
  rec([]);
  check(bad === 0, `all ${sets} possible stat sets end with one of each approach and all three dangers (${bad} failed)`);
  // Every danger combination (incl. missing/invalid) on every approach order.
  let dBad = 0, dSets = 0, tooMany = 0, touchedFine = 0;
  const dOpts = [...Prog.DANGERS, undefined, 'nonsense'];
  const recD = (pre) => {
    if (pre.length === 5) {
      for (let rot = 0; rot < 5; rot++) {
        dSets++;
        const cs = pre.map((type, i) => ({ type, stat: ALL[(i + rot) % 5], text: `c${i}` }));
        const out = Prog.fillMix(cs);
        if (!mixed(out)) dBad++;
        if (out.filter((c, i) => c.text !== cs[i].text).length > 2) tooMany++;
        if (Prog.DANGERS.every(d => cs.some(c => c.type === d)) && out.some((c, i) => c.text !== cs[i].text)) touchedFine++;
      }
      return;
    }
    for (const o of dOpts) recD([...pre, o]);
  };
  recD([]);
  check(dBad === 0 && tooMany === 0 && touchedFine === 0, `all ${dSets} danger sets end mixed (${dBad} failed), at most 2 rewrites (${tooMany} over), good sets untouched (${touchedFine} touched)`);
  // Random sets with both problems at once.
  let rBad = 0; const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (let i = 0; i < 20000; i++) { const cs = Array.from({ length: 5 }, (_, j) => ({ type: pick(dOpts), stat: pick(opts), text: `r${j}` })); if (!mixed(Prog.fillMix(cs))) rBad++; }
  check(rBad === 0, `20000 random sets (approach and danger both broken) all end mixed (${rBad} failed)`);
  check(mixed(Prog.fallbackChoices()), 'the plain fallback set has five approaches and all three dangers');

  // Storyteller down (network off here): gaps get plain choices, still five approaches.
  const down = await AIH.ensureChoiceMix(phone, 'A frozen alley.', []);
  check(mixed(down) && down[4].text === Prog.PLAIN_CHOICE.sneaky[down[4].type] && down[0].text === phone[0].text, `AI down: the gap gets "${down[4].text}" (${down[4].type}), the other four unchanged`);
  const downSafe = await AIH.ensureChoiceMix(allSafe, 'A frozen alley.', []);
  check(mixed(downSafe), `AI down, all Safe: plain Bold and Reckless choices fill in (${downSafe.map(c => c.type).join(', ')})`);

  // Storyteller up: the one choice is rewritten as a sneaky action.
  const offline = globalThis.fetch; let asked = '';
  globalThis.fetch = window.fetch = async (u, o) => { asked = JSON.parse(o.body).messages[1].content; return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '{"choices":[{"text":"Creep along the shadowed wall and slip past the sign unseen.","danger":"Bold"}]}' } }] }), text: async () => '' }; };
  localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'test');
  try {
    const fixed = await AIH.ensureChoiceMix(phone, 'A frozen alley.', []);
    check(mixed(fixed) && /slip past/.test(fixed[4].text) && fixed[4].type === "Bold" && /SNEAKY/.test(asked) && fixed.filter((c, i) => c.text !== phone[i].text).length === 1, `AI up: one small call rewrites only that choice ("${fixed[4].text}")`);
    // A rewrite that just repeats another choice is not accepted.
    globalThis.fetch = window.fetch = async () => ({ ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '{"choices":[{"text":"Share a ration of filtered water with the shivering scavenger.","danger":"Safe"}]}' } }] }), text: async () => '' });
    const dup = await AIH.ensureChoiceMix(phone, 'A frozen alley.', []);
    check(mixed(dup) && dup[4].text === Prog.PLAIN_CHOICE.sneaky[dup[4].type], 'a rewrite that copies another choice is refused (plain sneaky choice instead)');
    // All Safe: the call asks for exactly the missing dangers, with the approach kept.
    let asked2 = '';
    globalThis.fetch = window.fetch = async (u, o) => { asked2 = JSON.parse(o.body).messages[1].content; return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '{"choices":[{"text":"Shoulder through the crowd toward the shouting."},{"text":"Leap onto the moving cart and grab the reins."}]}' } }] }), text: async () => '' }; };
    const fixedSafe = await AIH.ensureChoiceMix(allSafe, 'A frozen alley.', []);
    check(mixed(fixedSafe) && /BOLD/.test(asked2) && /RECKLESS/.test(asked2) && fixedSafe.filter((c, i) => c.text !== allSafe[i].text).length === 2, `all Safe, AI up: one call rewrites two choices as Bold and Reckless (${fixedSafe.map(c => c.type).join(', ')})`);
  } finally { globalThis.fetch = window.fetch = offline; localStorage.removeItem('adv.apiKey.api.groq.com'); localStorage.removeItem('adv.cloudProvider'); }

  // Render time: whatever path produced the set, the screen gets five approaches.
  fresh(); gameState.inCombat = false;
  UI.renderChoices(phone.map(c => ({ ...c })));
  check(mixed(gameState.currentChoices), `on screen: ${gameState.currentChoices.map(c => `${c.stat}/${c.type}`).sort().join(', ')}`);
  UI.renderChoices(allSafe.map(c => ({ ...c })));
  check(mixed(gameState.currentChoices), `an all-Safe set on screen gets all three dangers (${gameState.currentChoices.map(c => c.type).join(', ')})`);
  UI.renderChoices(['Good', 'Bad', 'Risky', 'Silly', 'Investigative'].map(type => ({ type, text: type })));
  check(mixed(gameState.currentChoices), `an old saved set renders as five approaches with dangers (${gameState.currentChoices.map(c => `${c.stat}/${c.type}`).join(', ')})`);
});

// =====================================================================
section('Batch 20: the approach -> danger pairing shuffles every round (Michael 10-08)');
await block(async () => {
  const Prog = await import('../progression.js');
  const ALL = Prog.APPROACHES;
  const changes = (a, b) => ALL.filter(x => a[x] !== b[x]).length;
  // How varied a run of plans is: worst approach/danger share, least change round to round, longest same-danger streak.
  const measure = (plans) => {
    const share = {}; let minChange = 5, streak = 0, maxStreak = 0;
    plans.forEach((p, i) => {
      ALL.forEach(a => { share[`${a}/${p[a]}`] = (share[`${a}/${p[a]}`] || 0) + 1; });
      if (i) minChange = Math.min(minChange, changes(plans[i - 1], p));
    });
    for (const a of ALL) { streak = 1; for (let i = 1; i < plans.length; i++) { streak = plans[i][a] === plans[i - 1][a] ? streak + 1 : 1; maxStreak = Math.max(maxStreak, streak); } }
    const maxShare = Math.max(...Object.values(share)) / plans.length;
    return { maxShare, minChange, maxStreak, combos: Object.keys(share).length };
  };
  // Positive control: the five sets the storyteller picked by itself on the phone.
  const phone = [
    { sneaky: 'Reckless', luck: 'Bold', brave: 'Bold', clever: 'Safe', kind: 'Safe' },
    { clever: 'Safe', sneaky: 'Bold', brave: 'Bold', luck: 'Reckless', kind: 'Safe' },
    { kind: 'Safe', clever: 'Bold', brave: 'Reckless', luck: 'Reckless', sneaky: 'Safe' },
    { luck: 'Reckless', kind: 'Safe', clever: 'Safe', sneaky: 'Reckless', brave: 'Bold' },
    { brave: 'Bold', luck: 'Reckless', sneaky: 'Safe', clever: 'Safe', kind: 'Bold' }];
  const before = measure(phone);
  const plans = []; const hist = [];
  for (let i = 0; i < 300; i++) { const p = Prog.pickDangerPlan(hist); plans.push(p); hist.push(p); if (hist.length > 8) hist.shift(); }
  const after = measure(plans);
  const okAll = plans.every(p => Prog.DANGERS.every(d => ALL.some(a => p[a] === d)));
  check(before.maxShare >= 0.8 && before.maxStreak >= 3, `control: the storyteller alone kept one pairing ${Math.round(before.maxShare * 100)}% of rounds, same danger ${before.maxStreak} rounds running`);
  check(okAll && after.minChange >= 3 && after.maxStreak <= 2 && after.maxShare <= 0.4 && after.combos === 15 && new Set(plans.map(p => JSON.stringify(p))).size >= 50,
    `300 planned rounds: all three dangers every round (${okAll}), >=3 approaches change each round (min ${after.minChange}), same danger at most ${after.maxStreak} rounds running, no pairing over ${Math.round(after.maxShare * 100)}%, ${after.combos}/15 pairings used, ${new Set(plans.map(p => JSON.stringify(p))).size} different plans (a loop would be 3)`);
  const firsts = new Set(Array.from({ length: 40 }, () => JSON.stringify(Prog.pickDangerPlan([]))));
  check(firsts.size >= 10, `a new game's first round varies too (${firsts.size} different plans in 40 games)`);

  // End to end through requestChoicesOnly: the storyteller writes a danger
  // ladder per approach; the game shows the version this round's plan wants.
  const AIH = await import('../aiHandler.js');
  const offline = globalThis.fetch; let asked = '';
  const ladderReply = (drop = null) => JSON.stringify({ choices: ALL.map(stat => {
    const o = { stat, safe: `Carefully ${stat} ${Math.random().toString(36).slice(2, 6)}`, bold: `Boldly ${stat} ${Math.random().toString(36).slice(2, 6)}`, reckless: `Recklessly ${stat} ${Math.random().toString(36).slice(2, 6)}` };
    if (drop && drop[stat]) delete o[drop[stat]];
    return o;
  }) });
  let reply = () => ladderReply();
  globalThis.fetch = window.fetch = async (u, o) => {
    asked = JSON.parse(o.body).messages[1].content;
    return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: reply() } }] }), text: async () => '' };
  };
  localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'test');
  try {
    fresh(); gameState.inCombat = false; gameState.choiceMixHistory = [];
    const shown = []; let promptOk = true, pickOk = true, textOk = true;
    for (let r = 0; r < 12; r++) {
      const cs = await AIH.requestChoicesOnly('A market square at dusk.', false);
      const plan = gameState.choicePlan;
      if (!ALL.every(a => asked.includes(`{"stat":"${a}","safe":"...","bold":"...","reckless":"..."}`)) || !/danger ladder/.test(asked)) promptOk = false;
      if (!ALL.every(a => cs.find(c => c.stat === a)?.type === plan[a])) pickOk = false;
      // the text shown is the version written for that danger, and no ladder is kept
      if (!cs.every(c => c.text.startsWith({ Safe: 'Carefully', Bold: 'Boldly', Reckless: 'Recklessly' }[c.type]) && !c.ladder)) textOk = false;
      UI.renderChoices(cs); UI.renderChoices(gameState.currentChoices); // a re-render must not count twice
      shown.push(Prog.planOf(gameState.currentChoices));
    }
    const m = measure(shown);
    check(promptOk, 'every round the prompt asks for a danger ladder (safe / bold / reckless) per approach');
    check(pickOk && textOk, 'each approach shows the version written for this round\'s planned danger (text and label match)');
    check(gameState.choiceMixHistory.length === 8 && m.minChange >= 3 && m.maxStreak <= 2, `12 rounds on screen: >=3 approaches change each round (min ${m.minChange}), same danger at most ${m.maxStreak} running, history ${gameState.choiceMixHistory.length}/8 (no double count)`);

    // A ladder missing the planned rung: another rung is used and the set still has all three dangers.
    reply = () => ladderReply(Object.fromEntries(ALL.map(a => [a, gameState.choicePlan[a].toLowerCase()])));
    const gap = await AIH.requestChoicesOnly('A market square at dusk.', false);
    check(Prog.DANGERS.every(d => gap.some(c => c.type === d)) && gap.every(c => c.text.startsWith({ Safe: 'Carefully', Bold: 'Boldly', Reckless: 'Recklessly' }[c.type])),
      `every planned rung missing: other written rungs fill in, still all three dangers, labels still match (${gap.map(c => c.type).join(', ')})`);

    // An old-style single reply (one text each, all labelled Safe): its labels are kept, and the mix repair adds the missing dangers.
    reply = () => JSON.stringify({ choices: ALL.map(stat => ({ stat, danger: 'Safe', text: `Gently try the ${stat} way ${Math.random().toString(36).slice(2, 6)}` })) });
    const single = await AIH.requestChoicesOnly('A market square at dusk.', false);
    check(Prog.DANGERS.every(d => single.some(c => c.type === d)), `single-version reply: still ends with all three dangers (${single.map(c => c.type).join(', ')})`);
  } finally { globalThis.fetch = window.fetch = offline; localStorage.removeItem('adv.apiKey.api.groq.com'); localStorage.removeItem('adv.cloudProvider'); }

  // Pure picker.
  const lad = (stat, type) => ({ stat, type, text: 'x', ladder: { Safe: `${stat} s`, Bold: `${stat} b`, Reckless: `${stat} r` } });
  const picked = Prog.pickFromLadders(ALL.map(a => lad(a, 'Safe')), { brave: 'Reckless', clever: 'Safe', sneaky: 'Bold', kind: 'Safe', luck: 'Bold' });
  check(picked.map(c => `${c.stat}:${c.type}:${c.text}`).join(',') === 'brave:Reckless:brave r,clever:Safe:clever s,sneaky:Bold:sneaky b,kind:Safe:kind s,luck:Bold:luck b' && picked.every(c => !('ladder' in c)),
    `pickFromLadders follows the plan and drops the ladders (${picked.map(c => c.type).join(', ')})`);
});

// =====================================================================
section('Batch 21: review 10-08 (story already told; markdown choice text)');
await block(async () => {
  const Prog = await import('../progression.js');
  const offline = globalThis.fetch;
  const story = JSON.stringify({ narration: 'Ava leaps the gap and lands in a pile of coins.', ops: [] }); // no choices: a choices-only call follows
  let n = 0;
  globalThis.fetch = window.fetch = async () => {
    n++;
    if (n === 1) return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: story } }] }), text: async () => '' };
    throw new TypeError('Failed to fetch'); // the follow-up choices call fails
  };
  localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'test');
  try {
    const { p } = fresh(); p.stats = { brave: 1, clever: 1, sneaky: 1, kind: 1 }; p.coins = 50;
    gameState.currentChoices = [{ type: 'Reckless', stat: 'brave', text: 'Leap the gap' }];
    pinRandom(0.99); // natural 20: a reward is applied before the story call
    await AH.handlePlayerChoice('Reckless', 'Leap the gap'); unpinRandom();
    check(p.coins > 50 && gameState.currentNarrative.includes('pile of coins') && gameState.currentChoices.length === 5,
      `story told, then the choices call failed: the roll stands (coins 50 -> ${p.coins}) and plain choices appear (${gameState.currentChoices.length})`);
  } finally { globalThis.fetch = window.fetch = offline; localStorage.removeItem('adv.apiKey.api.groq.com'); localStorage.removeItem('adv.cloudProvider'); }

  // The button sends the text without markdown; the roll must still use that choice's approach.
  const { p } = fresh(); p.stats = { brave: 0, clever: 0, sneaky: 5, kind: 0 };
  gameState.currentChoices = [
    { type: 'Bold', stat: 'luck', text: 'Juggle the lanterns' },
    { type: 'Bold', stat: 'sneaky', text: '**Ghost Step** past the guard' }];
  pinRandom(0.5);
  await AH.handlePlayerChoice('Bold', 'Ghost Step past the guard'); unpinRandom();
  const r = gameState.narrativeContext.lastOutcome?.roll;
  check(r?.stat === 'sneaky', `a choice with **markdown** rolls its own approach (rolled ${r?.stat || 'luck'})`);
});

// =====================================================================
section('Batch 22: review 10-08 leftovers (history per game; fight commands outside a fight)');
await block(async () => {
  const Prog = await import('../progression.js');
  const S = await import('../state.js');
  // #4: a new or loaded game starts with no danger history from the last one.
  gameState.choiceMixHistory = [{ brave: 'Safe', clever: 'Bold', sneaky: 'Reckless', kind: 'Safe', luck: 'Bold' }];
  gameState.choicePlan = { brave: 'Safe', clever: 'Bold', sneaky: 'Reckless', kind: 'Safe', luck: 'Bold' };
  S.resetGameState();
  check(gameState.choiceMixHistory === undefined && gameState.choicePlan === undefined, 'starting a new game clears the danger history and plan');
  const oldSave = { turn: 4, adventureTheme: 'pirate', players: [S.createNewPlayer('Ava', 10)] }; // a save from before the history existed
  S.resetGameState(); Object.assign(gameState, oldSave); // what saveLoad.loadGame does
  check(gameState.choiceMixHistory === undefined, 'loading an older save brings no history along');

  // #5: a leftover set of fight commands shown outside a fight becomes plain story choices, not luck choices.
  fresh(); gameState.inCombat = false;
  UI.renderChoices([{ type: 'Attack', text: 'Strike the goblin' }, { type: 'Special', text: 'Use a move' }, { type: 'Item', text: 'Use an item' }, { type: 'Run', text: 'Flee' }]);
  const cs = gameState.currentChoices;
  check(cs.length === 5 && new Set(cs.map(c => c.stat)).size === 5 && Prog.DANGERS.every(d => cs.some(c => c.type === d)) && !cs.some(c => /goblin/.test(c.text)),
    `fight commands outside a fight: five plain story choices instead (${cs.map(c => `${c.stat}/${c.type}`).join(', ')})`);
});

await block(async () => {
  // After a multiplayer fight that the STORYTELLER ends (here: the foe is
  // driven off by its ops), the turn passes to the next hero and choices are
  // written for them; they were then replaced by the fighter's. (When the
  // attack itself wins, the story call already writes for the next hero.)
  const { createNewPlayer } = await import('../state.js');
  const offline = globalThis.fetch;
  globalThis.fetch = window.fetch = async (u, o) => {
    const msgs = JSON.parse(o.body).messages;
    const forNext = /write the player choices/i.test(msgs[0].content);
    const content = forNext
      ? JSON.stringify({ choices: ['brave', 'clever', 'sneaky', 'kind', 'luck'].map(stat => ({ stat, safe: `NEXT ${stat} safe`, bold: `NEXT ${stat} bold`, reckless: `NEXT ${stat} reckless` })) })
      : JSON.stringify({ narration: 'The goblin turns and flees into the hills.', ops: [{ op: 'replace', path: '/inCombat', value: false }],
          choices: ['brave', 'clever', 'sneaky', 'kind', 'luck'].map(stat => ({ stat, safe: `FIGHTER ${stat} safe`, bold: `FIGHTER ${stat} bold`, reckless: `FIGHTER ${stat} reckless` })) });
    return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content } }] }), text: async () => '' };
  };
  localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'test');
  // The test page has no real buttons; tell the turn's last-resort check that some are on screen.
  const realGet = document.getElementById.bind(document);
  document.getElementById = (id) => id === 'choicesContainer' ? { querySelectorAll: () => [{}] } : realGet(id);
  try {
    const { p } = fresh({ enemy: { hp: 200, maxHp: 200 } });
    const b = createNewPlayer('Ben', 10);
    gameState.players = [p, b]; gameState.currentPlayerIndex = 0;
    startFight();
    pinRandom(0.5);
    await AH.handlePlayerChoice('Attack', 'Strike the goblin'); unpinRandom();
    const texts = (gameState.currentChoices || []).map(c => c.text);
    check(!gameState.inCombat && gameState.currentPlayerIndex === 1 && texts.length === 5 && texts.every(t => t.startsWith('NEXT')),
      `after a 2-hero fight the story ends, Ben gets choices written for him (${texts[0] || 'none'}; hero ${gameState.currentPlayerIndex}, inCombat ${gameState.inCombat})`);
  } finally { document.getElementById = realGet; globalThis.fetch = window.fetch = offline; localStorage.removeItem('adv.apiKey.api.groq.com'); localStorage.removeItem('adv.cloudProvider'); }
});

// =====================================================================
section('Batch 23: haunted mansion playtest 10-09 (orb, maxed stats, picker loop, special names)');
await block(async () => {
  const Prog = await import('../progression.js');
  // 1. The storyteller invented an item type ("Special Artifact"): no Use, no Equip.
  const { p } = fresh();
  Engine.applyDiff([{ op: 'add', path: '/players/0/inventory/-', value: { name: 'Luminous Orb of Zenith', type: 'Artifact', tier: 'Special', effect: 'Maxes out stats and radiates radiant energy', stats: { atk: 30, def: 30 } } }]);
  const orb = p.inventory.find(i => i.name === 'Luminous Orb of Zenith');
  check(orb?.type === 'Consumable', `an invented item type with an effect becomes usable (type ${orb?.type})`);
  // ...and one already in a save with the made-up type can be used too.
  p.inventory.push({ id: 'item_old_orb', name: 'Old Orb', type: 'Artifact', tier: 'Special', effect: 'Glows with power', stats: { atk: 5, def: 5 } });
  let refused = false; const pops = [];
  const realPop = UI.showPopup; // showPopup is a live binding; watch the log for the refusal instead
  gameLog.length = 0;
  await AH.useInventoryItem('item_old_orb').catch(() => {});
  refused = gameLog.some(l => /Cannot 'Use' a Artifact/.test(l));
  check(!refused && !p.inventory.some(i => i.id === 'item_old_orb'), `an old save's "Artifact" item can be used (refused: ${refused})`);

  // 2. God mode set level 20 with every stat already 5: no points that can never be spent.
  const M = Prog.STAT_MAX; const g = fresh(); g.p.stats = { brave: M, clever: M, sneaky: M, kind: M };
  gameState.isGoalComplete = true; // god mode
  Engine.applyDiff([{ op: 'replace', path: '/players/0/level', value: 20 }]);
  check((g.p.statPoints || 0) === 0, `level 20 with all stats at the max (${M}): ${g.p.statPoints || 0} unspendable points handed out`);
  const h = Prog.ensureStats({ stats: { brave: M, clever: M, sneaky: M - 1, kind: M }, statPoints: 16 });
  check(h.statPoints === 1, `a save holding 16 points with room for 1 keeps 1 (${h.statPoints})`);
  const x = Prog.ensureStats({ stats: { brave: M, clever: M, sneaky: M, kind: M }, level: 3, xp: 0 });
  Prog.gainXp(x, 500);
  check(x.statPoints === 0 && x.level > 3, `levelling with every stat at the max gives no stat points (level ${x.level}, points ${x.statPoints})`);

  // 3. Cancel on the stat picker: it must not reopen until a new point is earned.
  const c = Prog.ensureStats({ stats: { brave: 1, clever: 1, sneaky: 1, kind: 1 }, statPoints: 2 });
  check(UI.wantsStatPrompt([c]) === true, 'unspent points: the picker opens');
  Prog.snoozeStatPrompt(c);
  check(UI.wantsStatPrompt([c]) === false, 'after Cancel: it does not reopen by itself');
  c.statPoints += 1;
  check(UI.wantsStatPrompt([c]) === true, 'a new point earned: it opens again');
  Prog.spendStatPoint(c, 'brave'); Prog.spendStatPoint(c, 'brave'); Prog.spendStatPoint(c, 'brave'); // spent via the star button
  c.statPoints += 1;
  check(UI.wantsStatPrompt([c]) === true, 'after spending with the star, the next new point opens it again');

  // 4. The storyteller's Special choice must name a special the hero really has.
  const s4 = fresh(); s4.p.mp = 20;
  s4.p.spellcasting = { knownSpells: [{ name: 'Whispering Pendulum', mpCost: 5 }, { name: 'Ward of Ash', mpCost: 4 }] };
  s4.p.specialMoves = [{ name: 'Power Strike', currentCooldown: 2 }];
  gameState.inCombat = true;
  const AIH = await import('../aiHandler.js');
  const ins = AIH.buildChoiceInstructions(['Attack', 'Special', 'Item', 'Run'], true, []);
  gameState.inCombat = false;
  check(/Whispering Pendulum/.test(ins) && /Ward of Ash/.test(ins), `combat prompt lists the hero's real specials (${(ins.match(/Special must use[^.]*/) || ['none'])[0]})`);
});

// =====================================================================
section('Batch 24: more fights, foes and loot that keep pace (playtest 10-09)');
await block(async () => {
  const Prog = await import('../progression.js');
  const Items = await import('../items.js');
  // Pacing: never right after a fight, certain after four quiet turns, owed ones stay owed.
  const rate = (t) => { let n = 0; for (let i = 0; i < 4000; i++) if (Prog.encounterDue(t, false)) n++; return n / 4000; };
  check(rate(0) === 0 && rate(4) === 1 && rate(9) === 1 && Prog.encounterDue(0, true) && rate(2) > 0.2 && rate(2) < 0.4,
    `encounter odds by quiet turns: 0 -> ${rate(0)}, 2 -> ${rate(2).toFixed(2)}, 4+ -> ${rate(4)}; an owed one -> always`);
  let gaps = [], t = 0; for (let i = 0; i < 5000; i++) { if (Prog.encounterDue(t, false)) { gaps.push(t); t = 0; } else t++; }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  check(avg >= 2 && avg <= 3.5, `a fight every ${avg.toFixed(1)} exploration turns on average (the storyteller alone: about 1 in 15 scenes)`);

  // Foes keep pace with the party's level; god mode keeps what it asked for.
  const foeAt = (level, spec) => { const { p } = fresh(); p.level = level; gameState.enemies = []; gameState.isGoalComplete = false; Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: spec }], { strict: false }); return gameState.enemies[0]; };
  const f1 = foeAt(1, { name: 'Ghoul', hp: 30, atk: 7, def: 3 }), f10 = foeAt(10, { name: 'Ghoul', hp: 30, atk: 7, def: 3 });
  check(f10.maxHp > f1.maxHp * 2 && f10.atk > f1.atk * 1.8 && f10.def > f1.def, `an ordinary foe at level 10 vs 1: HP ${f1.maxHp} -> ${f10.maxHp}, ATK ${f1.atk} -> ${f10.atk}, DEF ${f1.def} -> ${f10.def}`);
  const b1 = foeAt(1, { name: 'Vance', hp: 60, atk: 9, def: 4, isBoss: true }), b10 = foeAt(10, { name: 'Vance', hp: 60, atk: 9, def: 4, isBoss: true });
  check(b10.maxHp > b1.maxHp * 2 && b10.atk > b1.atk, `a boss at level 10 vs 1: HP ${b1.maxHp} -> ${b10.maxHp}, ATK ${b1.atk} -> ${b10.atk}`);
  const tiny = foeAt(1, { name: 'Rat', hp: 5, atk: 2, def: 0 });
  check(tiny.maxHp >= 15 && tiny.maxHp <= 25, `a tiny foe still makes a fight (HP ${tiny.maxHp}, within 60-100% of the level's size)`);
  const brute = foeAt(1, { name: 'Ogre', hp: 30, atk: 40, def: 3 });
  check(brute.atk <= 12, `a storyteller's ATK 40 at level 1 is capped (ATK ${brute.atk}), no one-shot heroes`);
  { const { p } = fresh(); p.level = 10; gameState.enemies = []; gameState.isGoalComplete = true;
    Engine.applyDiff([{ op: 'add', path: '/enemies/-', value: { name: 'Void Dragon', hp: 60, atk: 5, def: 2 } }], { strict: false });
    check(gameState.enemies[0].maxHp === 60 && gameState.enemies[0].atk === 5, 'god mode foes keep the size asked for'); gameState.isGoalComplete = false; }

  // Loot tier follows the level (it was Low for every level).
  const tiers = (L, shift = 0) => { const c = {}; for (let i = 0; i < 2000; i++) { const x = Items.lootTierFor(L, shift); c[x] = (c[x] || 0) + 1; } return c; };
  const t1 = tiers(1), t8 = tiers(8), boss8 = tiers(8, 1);
  check((t1.Low || 0) > 1000 && !(t8.Low) && (t8.Special || 0) + (t8.Legendary || 0) > 300 && (boss8.Legendary || 0) >= (t8.Legendary || 0),
    `loot tiers: level 1 ${JSON.stringify(t1)}; level 8 ${JSON.stringify(t8)}; a level-8 boss ${JSON.stringify(boss8)}`);
  check(Items.betterTier('Low', 'High') === 'High' && Items.betterTier('Special', 'Medium') === 'Special', 'betterTier keeps the better tier');

  // The turn prompt calls the encounter, the count resets when a fight starts, and an ignored call stays owed.
  const offline = globalThis.fetch; let asked = '';
  const reply = (fightStarts) => JSON.stringify({ narration: 'Something moves in the dark.', ops: fightStarts ? [{ op: 'add', path: '/enemies/-', value: { name: 'Grave Hound', hp: 30, atk: 7, def: 3 } }, { op: 'replace', path: '/inCombat', value: true }] : [],
    choices: fightStarts ? ['Attack', 'Special', 'Item', 'Run'].map(type => ({ type, text: type === 'Attack' ? 'Strike the Grave Hound' : `${type} now` }))
      : ['brave', 'clever', 'sneaky', 'kind', 'luck'].map(stat => ({ stat, safe: `${stat} s ${Math.random()}`, bold: `${stat} b ${Math.random()}`, reckless: `${stat} r ${Math.random()}` })) });
  let starts = false;
  globalThis.fetch = window.fetch = async (u, o) => { const m = JSON.parse(o.body).messages; if (/story game|text adventure/i.test(m[0].content) && m[1].content.includes('JUST DID')) asked = m[1].content; return { ok: true, status: 200, statusText: '200', headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: reply(starts) } }] }), text: async () => '' }; };
  localStorage.setItem('adv.cloudProvider', 'groq_qwen'); localStorage.setItem('adv.apiKey.api.groq.com', 'test');
  try {
    const { p } = fresh(); gameState.turnsSinceFight = 4; gameState.encounterOwed = false; gameState.foesMet = ['Spectral Butler'];
    gameState.currentChoices = [{ type: 'Bold', stat: 'brave', text: 'Kick the door in' }];
    starts = false; asked = '';
    await AH.handlePlayerChoice('Bold', 'Kick the door in');
    check(/ENCOUNTER THIS TURN/.test(asked) && /not one already met: Spectral Butler/.test(asked), 'after 4 quiet turns the prompt calls a fight with a new foe');
    check(gameState.encounterOwed === true && gameState.turnsSinceFight === 5 && !gameState.inCombat, `the storyteller ignored it: still owed (quiet turns ${gameState.turnsSinceFight})`);
    gameState.isLoading = false; starts = true; asked = '';
    gameState.currentChoices = [{ type: 'Bold', stat: 'brave', text: 'Kick the next door in' }];
    await AH.handlePlayerChoice('Bold', 'Kick the next door in');
    check(/ENCOUNTER THIS TURN/.test(asked) && gameState.inCombat && gameState.turnsSinceFight === 0 && gameState.encounterOwed === false && gameState.foesMet.includes('Grave Hound'),
      `owed fight called again, it starts: count reset, foe remembered (${gameState.foesMet.join(', ')})`);
  } finally { globalThis.fetch = window.fetch = offline; localStorage.removeItem('adv.apiKey.api.groq.com'); localStorage.removeItem('adv.cloudProvider'); gameState.inCombat = false; }
});

// =====================================================================
section('Batch 25: stats past 5; one of each gear or charm per hero in the shop (10-09)');
await block(async () => {
  const Prog = await import('../progression.js');
  const { createNewPlayer } = await import('../state.js');
  // Stats go to 10, in god mode too; Sneaky's dodge stays capped.
  const h = Prog.ensureStats({ stats: { brave: 5, clever: 1, sneaky: 1, kind: 1 }, statPoints: 1 });
  check(Prog.STAT_MAX === 10 && Prog.spendStatPoint(h, 'brave') && h.stats.brave === 6, `a stat can go past 5 (Brave ${h.stats.brave}, max ${Prog.STAT_MAX})`);
  const { p } = fresh(); gameState.isGoalComplete = true;
  Engine.applyDiff([{ op: 'replace', path: '/players/0/stats/brave', value: 9 }]);
  check(p.stats.brave === 9, `god mode can set Brave 9 (${p.stats.brave})`); gameState.isGoalComplete = false;
  check(Prog.sneakyDodge({ stats: { sneaky: 10 } }) === 0.25 && Prog.sneakyDodge({ stats: { sneaky: 5 } }) === 0.15, `Sneaky dodge: 5 -> ${Prog.sneakyDodge({ stats: { sneaky: 5 } })}, 10 -> ${Prog.sneakyDodge({ stats: { sneaky: 10 } })} (capped)`);

  // Shop: a charm or weapon leaves the buyer's shop only; potions stay on sale.
  const a = fresh().p; a.coins = 500;
  const b = createNewPlayer('Ben', 10); b.coins = 500;
  gameState.players = [a, b]; gameState.currentPlayerIndex = 0;
  gameState.shopItems = [
    { id: 'shop_charm', name: 'Blessed Candle Stub', type: 'Misc', tier: 'High', cost: 60, stats: { luck: 1 } },
    { id: 'shop_sword', name: 'Iron Sword', type: 'Weapon', tier: 'Low', cost: 40, stats: { atk: 5 } },
    { id: 'shop_potion', name: 'Healing Potion', type: 'Consumable', tier: 'Low', cost: 15, stats: { heal: 30 } }];
  const shown = () => { const cards = []; const real = UI.elements.shopDisplay; UI.elements.shopDisplay = { innerHTML: '', appendChild(c) { if (c?.dataset?.itemId) cards.push(c.dataset.itemId); } }; try { UI.renderShop(); } finally { UI.elements.shopDisplay = real; } return cards; };
  for (const id of ['shop_charm', 'shop_sword', 'shop_potion', 'shop_charm', 'shop_potion']) AH.buyShopItem(gameState.shopItems.find(i => i.id === id));
  const charms = a.inventory.filter(i => i.name === 'Blessed Candle Stub').length, potions = a.inventory.filter(i => i.name === 'Healing Potion').length;
  check(charms === 1 && potions === 2, `Ava buys the charm twice and the potion twice: ${charms} charm, ${potions} potions`);
  const forAva = shown();
  gameState.currentPlayerIndex = 1; const forBen = shown();
  check(!forAva.includes('shop_charm') && !forAva.includes('shop_sword') && forAva.includes('shop_potion') && ['shop_charm', 'shop_sword', 'shop_potion'].every(id => forBen.includes(id)),
    `Ava's shop: ${forAva.join(', ')}; Ben's shop: ${forBen.join(', ')}`);
  AH.buyShopItem(gameState.shopItems.find(i => i.id === 'shop_charm'));
  check(b.inventory.some(i => i.name === 'Blessed Candle Stub') && !shown().includes('shop_charm'), 'Ben gets his own charm, then it leaves his shop too');
});

await block(async () => {
  // Live 10-09 log: "Special must use one of: Light, Light, ...": a spell learned twice.
  const Battle = await import('../battle.js');
  const { p } = fresh(); p.mp = 20;
  p.spellcasting = { knownSpells: [{ name: 'Light', mpCost: 3 }, { name: 'Light', mpCost: 3 }, { name: 'Storm Shot', mpCost: 5 }] };
  const labels = Battle.battleOptions('Special', p).map(o => o.label);
  check(labels.filter(l => /^Light/.test(l)).length === 1, `a spell known twice shows once in the Special picker (${labels.join(', ')})`);
});

console.error = realError;
out(`\nfetch attempts blocked: ${fetchCalls}; elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
out(failed ? `✗ ${failed} mechanics check(s) failed` : '✓ all mechanics checks passed');
process.exit(failed ? 1 : 0);
