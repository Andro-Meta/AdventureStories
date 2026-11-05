// duplicate_gear_check.mjs - issue #12: one hero never ends a fight holding two weapons/armour of the same name.
// Math.random is pinned so every loot roll makes the same item: the worst case for two foes in one fight.
import './dom_polyfill.mjs';
const { gameState: g } = await import('../state.js');
const C = await import('../combat.js');
Math.random = () => 0.1; // drop always (lootChance 1), always a Weapon, always the same name
g.adventureTheme = 'steampunk';
g.players = [{ id: 'player_1', name: 'Solo', hp: 50, maxHp: 50, mp: 10, maxMp: 10, level: 3, inventory: [], equipment: {}, statusEffects: [], stats: {} }];
g.enemies = [1, 2].map(i => ({ id: `e${i}`, name: `Gearbot ${i}`, hp: 0, maxHp: 30, atk: 3, def: 1, lootChance: 1, lootTier: 'Low', isDefeated: true }));
for (const e of [...g.enemies]) await C.handleEnemyDefeat(e.id);
const names = g.players[0].inventory.filter(i => i.type !== 'Consumable').map(i => i.name.toLowerCase());
const dup = names.length - new Set(names).size;
console.log(`  ${dup === 0 ? '\u2713' : '\u2717'} duplicate gear after a two-foe fight: ${dup} (${names.join(' | ')})`);
process.exit(dup === 0 ? 0 : 1);
