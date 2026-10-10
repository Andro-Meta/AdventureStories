// updates.js - "a new version is out" on the main menu (Michael 10-09).
// Asks GitHub for the latest release. On the phone a newer APK downloads by
// itself in the background (UpdaterPlugin.java); the banner then offers
// Install now / Later, and Android installs it over this app (same signing
// key: saves and keys stay). On a PC browser it links to the release page.
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
        const release = { version: String(j.tag_name || '').replace(/^v/i, ''), notes: String(j.body || '').slice(0, 600), page: j.html_url, apk: apk?.browser_download_url || null, size: apk?.size || 0 };
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

const updater = () => (isNative() && window.Capacitor?.Plugins?.Updater) || null;
let downloading = null; // one download at a time

/** Show (or hide) the update banner on the main menu; on the phone, download the update by itself. */
export async function showUpdateBanner(force = false) {
    const box = document.getElementById('updateBanner');
    if (!box) return null;
    const rel = await checkForUpdate(force);
    let later = ''; try { later = sessionStorage.getItem('adv.updateLater') || ''; } catch (_) {}
    box.classList.toggle('hidden', !rel || (!force && later === rel.version));
    if (!rel) return null;
    const $ = (s) => box.querySelector(s);
    $('.update-title').textContent = `Version ${rel.version} is out (you have ${Config.APP_VERSION})`;
    $('.update-notes').textContent = rel.notes.replace(/^[-*]\s*/gm, '• ');
    const btn = $('.update-btn'), help = $('.update-help'), laterBtn = $('.update-later');
    laterBtn.onclick = () => { try { sessionStorage.setItem('adv.updateLater', rel.version); } catch (_) {} box.classList.add('hidden'); };
    const U = updater();
    if (!U || !rel.apk) { // PC browser (or an old app without the updater): the release page
        btn.disabled = false; btn.textContent = 'Open the release page'; btn.onclick = () => openOutside(rel.page);
        help.textContent = ''; return rel;
    }
    const ready = () => {
        btn.disabled = false; btn.textContent = '✅ Install now';
        help.textContent = `Version ${rel.version} is downloaded. Install when you like: your saves and keys stay.`;
        btn.onclick = async () => {
            const r = await U.install({ version: rel.version }).catch(e => ({ error: e?.message }));
            if (r?.needsPermission) help.textContent = 'Allow "Install unknown apps" for Adventure Stories (the switch Android just opened), come back, and tap Install now again.';
            else if (r?.error) help.textContent = `Could not start the installer: ${r.error}`;
        };
    };
    const st = await U.status({ version: rel.version }).catch(() => ({}));
    if (st.ready) { ready(); return rel; }
    btn.disabled = true; btn.textContent = '⬇️ Downloading…'; help.textContent = 'Downloading the update in the background. You can keep playing.';
    if (!downloading) {
        const listener = await U.addListener('progress', ({ pct }) => { if (pct >= 0) btn.textContent = `⬇️ Downloading… ${pct}%`; });
        downloading = U.download({ url: rel.apk, version: rel.version, size: rel.size || 0 })
            .finally(() => { listener?.remove?.(); downloading = null; });
    }
    downloading.then(ready).catch(e => {
        btn.disabled = false; btn.textContent = '⬇️ Try the download again';
        help.textContent = `${e?.message || 'Download failed'}. Check your connection.`;
        btn.onclick = () => showUpdateBanner(true);
    });
    return rel;
}
