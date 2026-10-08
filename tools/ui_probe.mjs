// ui_probe.mjs - why is an element narrow? prints width/display/grid of it and its ancestors at phone size.
import { chromium } from 'playwright';
const sel = process.argv[2] || '#storyCard';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
await p.goto('http://127.0.0.1:8322/');
await p.waitForTimeout(3000);
await p.evaluate(async () => (await import('/ui.js')).showScreen('gameScreen'));
await p.waitForTimeout(300);
console.log(await p.evaluate((sel) => { const out = []; let e = document.querySelector(sel);
  while (e && e !== document.documentElement) { const s = getComputedStyle(e); out.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className ? '.' + String(e.className).split(' ').join('.') : ''} w=${Math.round(e.getBoundingClientRect().width)} display=${s.display} gtc=${s.gridTemplateColumns} maxW=${s.maxWidth} flex=${s.flex} pos=${s.position}`); e = e.parentElement; }
  return out.join('\n'); }, sel));
await b.close();
