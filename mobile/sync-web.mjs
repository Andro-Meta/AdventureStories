// sync-web.mjs - copy the web-app source into mobile/www/ where Capacitor
// will pick it up. The project root has node_modules, .git, models/, etc.
// that we MUST NOT bundle into the APK.

import { mkdir, copyFile, stat, readdir, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WWW  = resolve(__dirname, 'www');

const INCLUDE_FILES = [
  'index.html', 'style.css', 'manifest.json', 'sw.js', 'mobile-bootstrap.js', 'icon-192.png', 'icon-512.png',
  'main.js', 'setup.js', 'state.js', 'engine.js', 'config.js', 'ui.js',
  'aiHandler.js', 'actionHandler.js', 'gameLoop.js', 'turnManager.js',
  'combat.js', 'resolution.js', 'questProgress.js', 'questDefinitions.js',
  'storyHooks.js',
  'godMode.js', 'memoryRetriever.js', 'schemas.js', 'localAI.js',
  'saveLoad.js', 'utils.js',
  'initializationManager.js', 'spellUI.js', 'spells.js',
  'spellCasting.js', 'jailSystem.js', 'items.js',
  'adaptiveAbilities.js', 'ageAppropriateReading.js', 'api_new.js',
  'contextManager.js', 'dynamicItems.js',
  'dynamicLocations.js', 'dynamicSpells.js', 'inputCache.js', 'loadingManager.js',
  'loadingTips.js', 'locations.js',
  'reputationContextualizer.js', 'themeIntelligence.js'
];

await mkdir(WWW, { recursive: true });

let copied = 0, missing = [];
for (const rel of new Set(INCLUDE_FILES)) {
  try {
    await stat(resolve(ROOT, rel));
    await copyFile(resolve(ROOT, rel), join(WWW, rel));
    copied++;
  } catch { missing.push(rel); }
}

// Remove files that are no longer part of the game, so deleted modules can't
// linger in www/ and get packaged into the APK (liteRTBridge.js did).
const keep = new Set(INCLUDE_FILES);
let removed = 0;
for (const f of await readdir(WWW)) {
  if (!keep.has(f)) { await unlink(join(WWW, f)); removed++; }
}

console.log(`Copied ${copied} files to mobile/www/${removed ? `, removed ${removed} stale` : ''}`);
if (missing.length) console.log(`${missing.length} file(s) not found:`, [...new Set(missing)].join(', '));
