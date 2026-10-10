// updates.js - "a new version is out" on the main menu (Michael 10-09).
// Asks GitHub for the latest release; if it is newer than this build, shows a
// banner whose button downloads the new APK in the phone's browser. Android
// then installs it over this app (same signing key: saves and keys stay).
// On a PC browser the button opens the release page instead.
import * as Config from './config.js';

const REPO = 'Andro-Meta/AdventureStories';
const EVERY_MS = 60 * 60 * 1000; // ask GitHub at most hourly (its limit: 60 requests/hour per IP)

/** 1 if a is newer than b, -1 if older, 0 if the same ("v1.2.10" > "1.2.9"). */
export function compareVersions(a, b) {
    const pa = String(a).replace(/^v/i, '').split('.').map(Number), pb = String(b).replace(/^v/i, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

/** The latest release if it is newer than this build, else null. `force` skips the 6-hour wait. */
export async function checkForUpdate(force = false) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('adv.update') || 'null'); } catch (_) {}
    if (!force && cached && Date.now() - cached.at < EVERY_MS) return newer(cached.release);
    try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
        if (!r.ok) return newer(cached?.release);
        const j = await r.json();
        const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name));
        const release = { version: String(j.tag_name || '').replace(/^v/i, ''), notes: String(j.body || '').slice(0, 600), page: j.html_url, apk: apk?.browser_download_url || null };
        try { localStorage.setItem('adv.update', JSON.stringify({ at: Date.now(), release })); } catch (_) {}
        return newer(release);
    } catch (_) { return newer(cached?.release); } // offline: say nothing new
}
const newer = (rel) => (rel?.version && compareVersions(rel.version, Config.APP_VERSION) > 0 ? rel : null);

/** Open the download (phone) or the release page (PC) outside the game. */
function openOutside(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove(); // the app hands external links to the browser
}

/** Show (or hide) the update banner on the main menu. */
export async function showUpdateBanner(force = false) {
    const box = document.getElementById('updateBanner');
    if (!box) return null;
    const rel = await checkForUpdate(force);
    box.classList.toggle('hidden', !rel);
    if (!rel) return null;
    const native = isNative() && rel.apk;
    box.querySelector('.update-title').textContent = `Version ${rel.version} is out (you have ${Config.APP_VERSION})`;
    box.querySelector('.update-notes').textContent = rel.notes.replace(/^[-*]\s*/gm, '• ');
    const btn = box.querySelector('.update-btn');
    btn.textContent = native ? '⬇️ Download and install' : 'Open the release page';
    btn.onclick = () => openOutside(native ? rel.apk : rel.page);
    box.querySelector('.update-help').classList.toggle('hidden', !native);
    return rel;
}
