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
// Google Play store icon: a full-bleed 512 square (Play rounds the corners itself).
jobs.push({ out: here('play-icon-512.png'), px: 512, html: svg(full, CROP) });
jobs.push({ out: here('preview.png'), px: 600, html: svg(`<g clip-path="url(#m)">${full}</g>`, CROP, rounded) });

// Splash screens (were Capacitor's default blue X): sunset sky, the art, the name.
// Each existing splash.png is re-rendered at its own size.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
for (const dir of readdirSync(RES).filter(d => d.startsWith('drawable'))) {
  const f = `${RES}${dir}/splash.png`;
  if (!existsSync(f)) continue;
  const b = readFileSync(f), w = b.readUInt32BE(16), h = b.readUInt32BE(20); // PNG IHDR size
  const art = Math.round(Math.min(w, h) * 0.62), font = Math.round(Math.min(w, h) * 0.075);
  const html = `<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(font * 0.4)}px;background:linear-gradient(#ffcf8a,#ff9a76 45%,#c8668f 80%,#7a4a9e)">
    <div style="width:${art}px;height:${art}px">${svg(FOREGROUND)}</div>
    <div style="margin-top:-${Math.round(art * 0.14)}px;font:800 ${font}px 'Trebuchet MS',system-ui,sans-serif;color:#fffaf0;text-shadow:0 ${Math.round(font / 12)}px ${Math.round(font / 4)}px rgba(90,40,90,.45);letter-spacing:.5px">Talewright Adventures</div></div>`;
  jobs.push({ out: f, w, h, html });
}

// Google Play feature graphic (1024x500): the sky, the art, the name and a cozy line.
jobs.push({ out: here('feature-graphic.png'), w: 1024, h: 500, html: `<div style="width:1024px;height:500px;display:flex;align-items:center;gap:8px;padding:0 56px 0 24px;box-sizing:border-box;background:linear-gradient(160deg,#ffcf8a,#ff9a76 45%,#c8668f 80%,#7a4a9e);font-family:'Trebuchet MS',system-ui,sans-serif">
  <div style="width:460px;height:460px;flex:none">${svg(FOREGROUND)}</div>
  <div style="color:#fffaf0;text-shadow:0 3px 12px rgba(90,40,90,.45)">
    <div style="font-weight:800;font-size:66px;line-height:1.02">Talewright<br>Adventures</div>
    <div style="font-size:30px;margin-top:18px;opacity:.95">Every choice writes the tale.</div>
  </div></div>` });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  const W = Math.round(j.w || j.px), H = Math.round(j.h || j.px);
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<html><body style="margin:0;background:transparent">${j.html}</body></html>`);
  await page.screenshot({ path: j.out, omitBackground: !!j.transparent, clip: { x: 0, y: 0, width: W, height: H } });
}
await browser.close();
console.log(`rendered ${jobs.length} icons`);
