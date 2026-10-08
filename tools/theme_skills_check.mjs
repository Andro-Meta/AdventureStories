// theme_skills_check.mjs - abilities fit the world: magic only where magic
// exists, tech/gear/know-how elsewhere. For every menu theme, checks what the
// game calls abilities, which "schools" the AI is asked to build from, the
// offline fallback starting abilities and the always-available battle pair.
// No network.
import './dom_polyfill.mjs';
globalThis.fetch = async () => { throw new Error('network disabled'); };
console.log = () => {}; console.warn = () => {};
const out = (s) => process.stdout.write(s + '\n');
const { gameState, createNewPlayer } = await import('../state.js');
const AA = await import('../adaptiveAbilities.js');
const Spells = await import('../spells.js');

const THEMES = ['fantasy', 'space', 'pirate', 'steampunk', 'cyberpunk', 'underwater', 'post_apoc', 'wild_west', 'jungle', 'future_utopia', 'dinosaur', 'arctic', 'haunted'];
const MAGIC_WORLDS = new Set(['fantasy', 'haunted']); // where spells/rituals belong
const MAGIC_WORDS = /\b(spell|spells|mana|arcane|magic|magical|mage|wizard|enchant\w*|sorcer\w*|divine)\b/i;
let failed = 0;
const check = (ok, msg) => { out(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };

for (const theme of THEMES) {
  gameState.adventureTheme = theme;
  const a = AA.getCurrentThemeAdaptation();
  const words = [a.abilityName, a.abilityNamePlural, a.resourceName, a.systemName, ...Object.values(a.schools || {}).map(s => `${s.name} ${s.description}`)].filter(Boolean).join(' | ');
  const p = createNewPlayer('Hero', 30);
  p.spellcasting = p.spellcasting || { knownSpells: [], preparedSpells: [], maxSpellLevel: 1 };
  p.spellcasting.knownSpells = []; p.spellcasting.preparedSpells = [];
  Spells.ensureBattleSpells(p);
  const pair = p.spellcasting.knownSpells.map(s => `${s.name}: ${s.description}`).join(' / ');
  const fallback = (Spells.themeFallbackAbilities?.(theme) || []).map(s => `${s.name}: ${s.description || ''}`).join(' / ');
  const text = `${words} || ${pair} || ${fallback}`;
  const magicy = MAGIC_WORDS.test(text);
  if (MAGIC_WORLDS.has(theme)) check(true, `${theme}: magic allowed (${a.abilityName})`);
  else check(!magicy, `${theme}: no magic words (${a.abilityName}; ${(text.match(MAGIC_WORDS) || ['clean'])[0]}) — ${pair}`);
}
// Custom themes are read from their description.
const CUSTOM = [
  ['A school for young wizards in the clouds', 'fantasy'], ['Dragon riders of the northern isles', 'fantasy'],
  ['Robots stranded on Mars', 'scifi'], ['A time travel heist', 'scifi'],
  ['Zombie outbreak in modern Chicago', 'modern'], ['Detectives in 1920s New York', 'modern'],
  ['A haunted carnival at midnight', 'horror'], ['Neon hackers versus a megacorp', 'cyberpunk'],
  ['Ancient Egypt with talking cats', 'adventure'], ['Shipwrecked on a candy island', 'adventure'],
];
for (const [desc, want] of CUSTOM) {
  gameState.adventureTheme = 'custom'; gameState.customThemeDescription = desc;
  const got = AA.themeAdaptationKey();
  check(got === want, `custom "${desc}" -> ${got} (${AA.getCurrentThemeAdaptation().abilityNamePlural})`);
}
out(failed ? `✗ ${failed} theme skill check(s) failed` : '✓ abilities fit every theme');
process.exit(failed ? 1 : 0);
