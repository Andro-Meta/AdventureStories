// loot_check.mjs - every item tier/type an exploration outcome can roll must
// produce an item in every theme. (Tier case mismatches once made all 34
// combinations return null, so exploration loot never dropped.)
import './dom_polyfill.mjs';
const I = await import('../items.js');
const C = await import('../config.js');
let ok = 0, n = 0; const fails = new Set();
const themes = ['fantasy', 'space', 'pirate', 'underwater', 'jungle', 'dinosaur', 'arctic', 'steampunk', 'haunted', 'cyberpunk', 'western', 'custom'];
const walk = (o, th) => {
  if (!o || typeof o !== 'object') return;
  if (o.itemOptions) for (const t of o.itemOptions.tiers) for (const ty of o.itemOptions.types) { n++; if (I.generateThemedItem(th, t, ty)) ok++; else fails.add(`${th}:${t}/${ty}`); }
  for (const v of Object.values(o)) walk(v, th);
};
for (const th of themes) walk(C.ChoiceOutcomeConfig, th);
console.log(`  ${ok === n ? '\u2713' : '\u2717'} loot rolls produce items: ${ok}/${n}${fails.size ? ' failing: ' + [...fails].slice(0, 8).join(', ') : ''}`);
process.exit(ok === n ? 0 : 1);
