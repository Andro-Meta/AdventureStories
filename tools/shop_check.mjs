// shop_check.mjs - is the shop fair and does it grow with the hero?
//  - price tracks power: correlation of price with ATK (weapons) / DEF (armor)
//  - "same tier, worse item, higher price" inversions among weapons
//  - tier mix by hero level 1..6
//  - names whose parts name two different elements ("Inferno Blade of Absolute Zero")
//   node --experimental-loader ./tools/preload.mjs tools/shop_check.mjs [--check]
import './dom_polyfill.mjs';
console.log = () => {}; globalThis.displayVisualError = () => {}; if (globalThis.window) window.displayVisualError = () => {};
const out = (s) => process.stdout.write(s + '\n');
const { gameState, createNewPlayer } = await import('../state.js');
const Items = await import('../items.js');

const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };
const ELEMENT = /(fire|flam|inferno|blaz|ember|burn|frost|ice|glacial|frozen|absolute zero|cold|snow|thunder|lightning|storm|shock|volt|poison|venom|toxic)/gi;
const family = (w) => /fire|flam|inferno|blaz|ember|burn/i.test(w) ? 'fire' : /frost|ice|glacial|frozen|zero|cold|snow/i.test(w) ? 'ice' : /thunder|lightning|storm|shock|volt/i.test(w) ? 'storm' : 'poison';

const themes = ['fantasy', 'pirate', 'space', 'cyberpunk', 'wild_west'];
const weapons = [], armors = []; let clashes = 0, names = 0; const clashSamples = [];
const tierMix = {};
for (let level = 1; level <= 6; level++) {
  const p = createNewPlayer('A', 30); p.level = level; gameState.players = [p];
  const counts = {};
  for (let r = 0; r < 40; r++) {
    for (const item of Items.generateShopItems(themes[r % themes.length], 5 * level)) {
      counts[item.tier] = (counts[item.tier] || 0) + 1;
      if (item.type === 'Weapon') weapons.push({ stat: item.stats.atk, price: item.cost, tier: item.tier });
      if (item.type === 'Armor') armors.push({ stat: item.stats.def, price: item.cost, tier: item.tier });
      names++;
      const fams = new Set((item.name.match(ELEMENT) || []).map(family));
      if (fams.size > 1) { clashes++; if (clashSamples.length < 3) clashSamples.push(item.name); }
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  tierMix[level] = Object.entries(counts).sort().map(([t, n]) => `${t} ${Math.round(100 * n / total)}%`).join(', ');
}
let inversions = 0, pairs = 0;
for (const list of [weapons, armors]) for (let i = 0; i < list.length; i += 3) for (let j = i + 1; j < Math.min(list.length, i + 40); j += 3) {
  const a = list[i], b = list[j]; if (a.stat === b.stat) continue; pairs++;
  if ((a.stat > b.stat) !== (a.price > b.price) && a.price !== b.price) inversions++;
}
const cw = corr(weapons.map(w => w.stat), weapons.map(w => w.price)), ca = corr(armors.map(w => w.stat), armors.map(w => w.price));

out(`price vs power: weapons r=${cw.toFixed(2)}, armor r=${ca.toFixed(2)}; better item cheaper in ${Math.round(100 * inversions / Math.max(1, pairs))}% of pairs`);
out(`names with clashing elements: ${clashes}/${names}${clashSamples.length ? ` (e.g. ${clashSamples.join('; ')})` : ''}`);
for (const [l, m] of Object.entries(tierMix)) out(`  hero level ${l}: ${m}`);
if (process.argv.includes('--check')) {
  const ok = cw > 0.9 && ca > 0.9 && clashes === 0;
  out(ok ? '✓ shop is fair' : '✗ shop checks failed'); process.exit(ok ? 0 : 1);
}
process.exit(0);
