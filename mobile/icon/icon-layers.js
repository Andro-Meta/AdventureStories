// Talewright Adventures app icon, as SVG layers on a 108x108 canvas (Android
// adaptive-icon units). The foreground art stays inside the 66-unit safe zone
// (a circle of radius 33 around the centre) so no launcher mask crops it.
// Cozy and fun (Michael 10-14): a sunset sky, and a path that winds up out of an
// open storybook to a little hilltop cottage with a lit window.

export const BACKGROUND = `
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffcf8a"/>
    <stop offset="0.45" stop-color="#ff9a76"/>
    <stop offset="0.8" stop-color="#c8668f"/>
    <stop offset="1" stop-color="#7a4a9e"/>
  </linearGradient>
</defs>
<rect width="108" height="108" fill="url(#sky)"/>
<g fill="#fff4e4" opacity="0.75">
  <ellipse cx="22" cy="30" rx="10" ry="4.5"/><ellipse cx="29" cy="27.5" rx="7" ry="5"/>
  <ellipse cx="88" cy="46" rx="9" ry="4"/><ellipse cx="82" cy="43.5" rx="6" ry="4.5"/>
</g>
<g fill="#fffaf0">
  <circle cx="14" cy="14" r="0.9" opacity="0.8"/><circle cx="94" cy="12" r="0.8" opacity="0.7"/>
  <circle cx="100" cy="26" r="0.6" opacity="0.6"/><circle cx="8" cy="52" r="0.6" opacity="0.5"/>
</g>`;

export const FOREGROUND = `
<defs>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#fff3b0" stop-opacity="0.95"/>
    <stop offset="0.4" stop-color="#ffd166" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#ffb347" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8fd18b"/>
    <stop offset="1" stop-color="#4f9e6a"/>
  </linearGradient>
  <linearGradient id="page" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fffaf0"/>
    <stop offset="1" stop-color="#f1dfbd"/>
  </linearGradient>
  <linearGradient id="path" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ffe1a6"/>
    <stop offset="1" stop-color="#f7c873"/>
  </linearGradient>
</defs>

<g transform="translate(54 54) scale(0.9) translate(-54 -54)"><!-- inside the 66-unit safe circle -->
<!-- crescent moon -->
<mask id="moonCut"><rect width="108" height="108" fill="#fff"/><circle cx="83" cy="29" r="5.6" fill="#000"/></mask>
<circle cx="80" cy="31" r="6.5" fill="#fff6d8" mask="url(#moonCut)"/>

<!-- hill with the cottage -->
<path d="M27 59 Q40 37 56 38 Q72 39 83 59 Z" fill="url(#hill)"/>
<circle cx="59" cy="38" r="15" fill="url(#glow)"/>
<!-- cottage: walls, roof, door, glowing window, chimney + smoke (scaled up to read at phone size) -->
<g transform="translate(59 40) scale(1.35) translate(-59 -40)">
<rect x="52.5" y="35" width="13" height="9.5" rx="1" fill="#fff1dc"/>
<path d="M50.5 36.5 L59 28.5 L67.5 36.5 Z" fill="#e0574f"/>
<rect x="63" y="29.5" width="2.6" height="5" fill="#9a4b3f"/>
<g fill="#fff4e4" opacity="0.85"><circle cx="64.5" cy="27" r="1.4"/><circle cx="66.2" cy="24.6" r="1.1"/><circle cx="65.4" cy="22.4" r="0.8"/></g>
<rect x="55" y="38" width="3.6" height="3.4" rx="0.6" fill="#ffd64d"/>
<path d="M60.8 44.5 v-4.2 a1.5 1.5 0 0 1 3 0 v4.2 Z" fill="#a8613e"/>
</g>

<!-- book cover and pages -->
<path d="M24 66 Q39 61 54 67 Q69 61 84 66 L84 82 Q69 77 54 83 Q39 77 24 82 Z" fill="#2f8f9d"/>
<path d="M26 64 Q40 58 54 65 L54 80 Q40 74 26 79 Z" fill="url(#page)"/>
<path d="M82 64 Q68 58 54 65 L54 80 Q68 74 82 79 Z" fill="url(#page)"/>
<path d="M54 65 L54 83" stroke="#1f6b77" stroke-width="1.4"/>
<g stroke="#d9bf8c" stroke-width="0.7" fill="none" opacity="0.85" stroke-linecap="round">
  <path d="M30 67 Q38 64 46 67.5"/><path d="M30 70.5 Q38 67.5 46 71"/>
  <path d="M78 67 Q70 64 62 67.5"/><path d="M78 70.5 Q70 67.5 62 71"/>
</g>

<!-- the path: out of the pages, winding up the hill to the door -->
<path d="M48.5 72.5 Q44 63.5 53 59.5 Q62 55.5 56.5 51 Q52.5 48 61.5 46 L65.5 46 Q57.5 48.4 60.8 51.2 Q67.5 57.5 57 62.2 Q51.5 65 55.5 72.5 Z" fill="url(#path)"/>

<!-- sparkles -->
<g fill="#fff6c9">
  <path d="M33 47 l0.9 2.1 2.1 0.9 -2.1 0.9 -0.9 2.1 -0.9 -2.1 -2.1 -0.9 2.1 -0.9 z"/>
  <path d="M42 29 l0.7 1.6 1.6 0.7 -1.6 0.7 -0.7 1.6 -0.7 -1.6 -1.6 -0.7 1.6 -0.7 z"/>
  <path d="M80 50 l0.6 1.4 1.4 0.6 -1.4 0.6 -0.6 1.4 -0.6 -1.4 -1.4 -0.6 1.4 -0.6 z"/>
</g>
</g>
`;
