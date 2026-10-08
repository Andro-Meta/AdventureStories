// ui_loader.mjs - show the start-up loader at phone size at a given percent; screenshot + computed bar style.
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true })).newPage();
await p.goto('http://127.0.0.1:8322/'); await p.waitForTimeout(2500);
console.log(await p.evaluate(async () => { const { loadingManager } = await import('/loadingManager.js'); const { loadingTips } = await import('/loadingTips.js');
  loadingManager.showLoading('Building the world around you...'); loadingTips.initializeTipsDisplay(); loadingTips.updateProgress(60, 'Building the world around you...');
  await new Promise(r => setTimeout(r, 700)); const bar = document.getElementById('loadingProgressBar'); const s = getComputedStyle(bar);
  return JSON.stringify({ w: bar.getBoundingClientRect().width, track: document.querySelector('.loading-progress').getBoundingClientRect().width, h: bar.getBoundingClientRect().height, bg: s.backgroundImage.slice(0, 80), bgc: s.backgroundColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-color') }); }));
await p.screenshot({ path: process.argv[2] }); await b.close();
