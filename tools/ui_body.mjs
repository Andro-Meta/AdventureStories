// ui_body.mjs - body's direct children (flex siblings of .container) at phone size, after a popup.
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(3000);
await p.evaluate(async () => { const UI = await import('/ui.js'); UI.showScreen('gameScreen'); UI.showPopup('Adventure begins! Your choices shape the story.', 'info', 9000); });
await p.waitForTimeout(500);
console.log(await p.evaluate(() => [...document.body.children].map(e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
  return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${e.className} w=${Math.round(r.width)} x=${Math.round(r.x)} display=${s.display} pos=${s.position}`; }).join('\n') + `\nbody: flex-direction=${getComputedStyle(document.body).flexDirection} justify=${getComputedStyle(document.body).justifyContent}`));
await p.screenshot({ path: process.argv[2] || 'body.png' }); await b.close();
