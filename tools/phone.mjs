// phone.mjs - talk to the game running on the phone (debug build) over adb.
//   node tools/phone.mjs eval "<js expression>"   -> prints the result (JSON)
//   node tools/phone.mjs logs [n]                  -> last n game log lines kept in the page
//   node tools/phone.mjs shot <out.png>            -> screenshot of the game page
// Needs: adb connected (wireless ok), the app open. Forwards the WebView's
// devtools socket to 127.0.0.1:9333 and connects with Playwright.
// Never prints saved API keys: expressions mentioning apiKey are refused.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const DEVICE = process.env.ADB_DEVICE || '192.168.1.44:41529';
const adb = (...a) => execFileSync('adb', ['-s', DEVICE, ...a], { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', 'com.androsmeta.adventurestories');
if (!pid) { console.error('App is not running on the phone.'); process.exit(1); }
adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid.split(/\s+/)[0]}`);

const [cmd, arg] = process.argv.slice(2);
if (/apiKey/i.test(arg || '')) { console.error('Refusing: never read saved keys.'); process.exit(1); }
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('https://localhost'));
if (!page) { console.error('Game page not found.'); process.exit(1); }
if (cmd === 'eval') console.log(JSON.stringify(await page.evaluate(`(async () => (${arg}))()`), null, 1));
else if (cmd === 'logs') console.log(await page.evaluate((n) => (window.__advLog || []).slice(-n).join('\n'), Number(arg) || 80));
else if (cmd === 'shot') await page.screenshot({ path: arg });
await browser.close(); // disconnects only; the app keeps running
