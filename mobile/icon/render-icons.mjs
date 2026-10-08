// render-icons.mjs - renders the app icon layers (icon-layers.js) with headless
// Chromium into every Android launcher density plus web/PWA icons.
//   node mobile/icon/render-icons.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BACKGROUND, FOREGROUND } from './icon-layers.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const RES = here('../android/app/src/main/res/');
const WEB = here('../../');
const svg = (body, viewBox = '0 0 108 108', clip = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${clip}${body}</svg>`;

// Legacy icons show the middle 72x72 of the 108 canvas (what launchers show of adaptive icons).
const CROP = '18 18 72 72';
const rounded = `<defs><clipPath id="m"><rect x="18" y="18" width="72" height="72" rx="15"/></clipPath></defs>`;
const circle = `<defs><clipPath id="m"><circle cx="54" cy="54" r="36"/></clipPath></defs>`;
const full = BACKGROUND + FOREGROUND;

const jobs = [];
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  mkdirSync(`${RES}mipmap-${d}`, { recursive: true });
  jobs.push({ out: `${RES}mipmap-${d}/ic_launcher.png`, px: 48 * k, html: svg(`<g clip-path="url(#m)">${full}</g>`, CROP, rounded) });
  jobs.push({ out: `${RES}mipmap-${d}/ic_launcher_round.png`, px: 48 * k, html: svg(`<g clip-path="url(#m)">${full}</g>`, CROP, circle) });
  jobs.push({ out: `${RES}mipmap-${d}/ic_launcher_foreground.png`, px: 108 * k, html: svg(FOREGROUND), transparent: true });
  jobs.push({ out: `${RES}mipmap-${d}/ic_launcher_background.png`, px: 108 * k, html: svg(BACKGROUND) });
}
jobs.push({ out: `${WEB}icon-512.png`, px: 512, html: svg(`<g clip-path="url(#m)">${full}</g>`, CROP, rounded), transparent: true });
jobs.push({ out: `${WEB}icon-192.png`, px: 192, html: svg(`<g clip-path="url(#m)">${full}</g>`, CROP, rounded), transparent: true });
jobs.push({ out: here('preview.png'), px: 600, html: svg(`<g clip-path="url(#m)">${full}</g>`, CROP, rounded) });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  await page.setViewportSize({ width: Math.round(j.px), height: Math.round(j.px) });
  await page.setContent(`<html><body style="margin:0;background:transparent">${j.html}</body></html>`);
  await page.screenshot({ path: j.out, omitBackground: !!j.transparent, clip: { x: 0, y: 0, width: Math.round(j.px), height: Math.round(j.px) } });
}
await browser.close();
console.log(`rendered ${jobs.length} icons`);
