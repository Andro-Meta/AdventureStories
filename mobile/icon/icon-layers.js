// Adventure Stories app icon, as SVG layers on a 108x108 canvas (Android
// adaptive-icon units). The foreground art stays inside the 66-unit safe zone
// (a circle of radius 33 around the centre) so no launcher mask crops it.

export const BACKGROUND = `
<defs>
  <radialGradient id="sky" cx="50%" cy="38%" r="75%">
    <stop offset="0" stop-color="#4b2a7a"/>
    <stop offset="0.55" stop-color="#24184a"/>
    <stop offset="1" stop-color="#0d0b24"/>
  </radialGradient>
</defs>
<rect width="108" height="108" fill="url(#sky)"/>
<g fill="#fff">
  <circle cx="18" cy="20" r="0.9" opacity="0.8"/><circle cx="30" cy="12" r="0.6" opacity="0.6"/>
  <circle cx="86" cy="18" r="0.8" opacity="0.75"/><circle cx="94" cy="34" r="0.55" opacity="0.5"/>
  <circle cx="12" cy="44" r="0.6" opacity="0.5"/><circle cx="78" cy="9" r="0.5" opacity="0.6"/>
  <circle cx="98" cy="62" r="0.7" opacity="0.45"/><circle cx="9" cy="76" r="0.7" opacity="0.4"/>
  <circle cx="24" cy="96" r="0.5" opacity="0.35"/><circle cx="88" cy="92" r="0.6" opacity="0.35"/>
</g>`;

export const FOREGROUND = `
<defs>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffe9a8" stop-opacity="0.95"/>
    <stop offset="0.35" stop-color="#ffc94d" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ff9d2e" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="star" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff6d6"/>
    <stop offset="0.5" stop-color="#ffd35c"/>
    <stop offset="1" stop-color="#f0a623"/>
  </linearGradient>
  <linearGradient id="pageL" x1="1" y1="0" x2="0" y2="0">
    <stop offset="0" stop-color="#e9d3a2"/>
    <stop offset="1" stop-color="#fbf1da"/>
  </linearGradient>
  <linearGradient id="pageR" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#e9d3a2"/>
    <stop offset="1" stop-color="#fbf1da"/>
  </linearGradient>
  <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ffd35c" stop-opacity="0.75"/>
    <stop offset="1" stop-color="#ffd35c" stop-opacity="0"/>
  </linearGradient>
</defs>

<g transform="translate(54 54) scale(0.88) translate(-54 -54)"><!-- scaled into the 66-unit safe circle -->
<!-- light rising from the pages -->
<path d="M47 64 L41 36 L67 36 L61 64 Z" fill="url(#beam)" opacity="0.55"/>
<circle cx="54" cy="38" r="17" fill="url(#glow)"/>

<!-- compass star -->
<path d="M54 25.5 L57.2 34.8 L66.5 38 L57.2 41.2 L54 50.5 L50.8 41.2 L41.5 38 L50.8 34.8 Z" fill="url(#star)"/>
<path d="M54 31 L55.6 36.4 L61 38 L55.6 39.6 L54 45 L52.4 39.6 L47 38 L52.4 36.4 Z" fill="#fffbea" opacity="0.9"/>

<!-- sparkles -->
<g fill="#ffe7a0">
  <path d="M38 30 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z"/>
  <path d="M71 28 l0.8 1.9 1.9 0.8 -1.9 0.8 -0.8 1.9 -0.8 -1.9 -1.9 -0.8 1.9 -0.8 z"/>
  <path d="M69 47 l0.6 1.4 1.4 0.6 -1.4 0.6 -0.6 1.4 -0.6 -1.4 -1.4 -0.6 1.4 -0.6 z" opacity="0.8"/>
</g>

<!-- book: cover, pages, spine -->
<path d="M28 63 Q41 59 54 64 Q67 59 80 63 L80 79 Q67 75 54 80 Q41 75 28 79 Z" fill="#7a2335"/>
<path d="M30 61 Q42 56 54 62 L54 77 Q42 71 30 76 Z" fill="url(#pageL)"/>
<path d="M78 61 Q66 56 54 62 L54 77 Q66 71 78 76 Z" fill="url(#pageR)"/>
<g stroke="#c9a96a" stroke-width="0.7" fill="none" opacity="0.8" stroke-linecap="round">
  <path d="M34 63.5 Q42 60.5 50 64"/><path d="M34 67 Q42 64 50 67.5"/><path d="M34 70.5 Q42 67.5 50 71"/>
  <path d="M74 63.5 Q66 60.5 58 64"/><path d="M74 67 Q66 64 58 67.5"/><path d="M74 70.5 Q66 67.5 58 71"/>
</g>
<path d="M54 62 L54 80" stroke="#b07a2a" stroke-width="1.4"/>
</g>
`;
