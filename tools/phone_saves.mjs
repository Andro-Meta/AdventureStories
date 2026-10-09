// phone_saves.mjs - copy the phone's saved games to this PC before a test, and
// put them back after (a test game's autosave prunes the oldest of 5).
//   node tools/phone_saves.mjs backup [file]   -> AG-* saves to file (default test-results/phone_saves_backup.json)
//   node tools/phone_saves.mjs restore [file]  -> deletes AG-* saves not in the file, restores any missing/changed ones
//   node tools/phone_saves.mjs list
// Also restores from a copy left in the page (window.__savesBak) if no file exists.
// Only AG- save keys are read or written; API keys are never touched.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const DEVICE = process.env.ADB_DEVICE || (execFileSync('adb', ['devices'], { encoding: 'utf8' }).split('\n').map(l => l.split('\t')).find(([s, st]) => st?.trim() === 'device' && s.includes('_adb-tls-connect'))?.[0]);
if (!DEVICE) { console.error('No phone connected.'); process.exit(1); }
const adb = (...a) => execFileSync('adb', ['-s', DEVICE, ...a], { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', 'com.androsmeta.adventurestories').split(/\s+/)[0];
if (!pid) { console.error('App is not running on the phone.'); process.exit(1); }
try { adb('forward', '--remove-all'); } catch (_) {}
adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);

const [cmd = 'list', file = 'test-results/phone_saves_backup.json'] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('https://localhost'));
if (!page) { console.error('Game page not found.'); process.exit(1); }
const saves = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('AG-')).map(k => [k, localStorage.getItem(k)])));

if (cmd === 'backup') {
    const s = await saves();
    fs.mkdirSync(file.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(s));
    console.log(`backed up ${Object.keys(s).length} saves to ${file}: ${Object.keys(s).join(' | ')}`);
} else if (cmd === 'restore') {
    const bak = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : await page.evaluate(() => window.__savesBak || null);
    if (!bak) { console.error('No backup file and no copy in the page.'); process.exit(1); }
    const r = await page.evaluate((bak) => {
        const now = Object.keys(localStorage).filter(k => k.startsWith('AG-'));
        const removed = now.filter(k => !(k in bak));
        removed.forEach(k => localStorage.removeItem(k));
        const restored = Object.keys(bak).filter(k => localStorage.getItem(k) !== bak[k]);
        restored.forEach(k => localStorage.setItem(k, bak[k]));
        return { removed, restored, identical: Object.keys(bak).every(k => localStorage.getItem(k) === bak[k]) };
    }, bak);
    console.log(JSON.stringify(r));
} else {
    console.log(Object.keys(await saves()).join('\n'));
}
await browser.close();
