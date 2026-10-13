/**
 * Reading pace (Michael 10-12): how many words a minute each reader reads,
 * and who skips the story and just picks. A scene's clock starts when it is
 * shown and stops at the first story choice; time with the app in the
 * background does not count. Fights, read-aloud scenes and walk-aways are
 * left out. Stats live on the hero (hero.reading, saved with the game) and,
 * for parents, in a per-reader history on the device (Settings, 10-13).
 */

// Typical reading pace by age, words a minute (oral-fluency norms for
// children, ~240 silent for adults). Over 2.5x typical is skimming, not reading.
const TYPICAL_WPM = [[7, 60], [8, 90], [9, 110], [10, 125], [11, 140], [12, 150], [15, 180], [Infinity, 240]];
export const typicalWpm = (age) => TYPICAL_WPM.find(([a]) => (Number(age) || 25) <= a)[1];
const SKIM_FACTOR = 2.5;
const MIN_WORDS = 30;      // shorter scenes say too little about pace
const AWAY_SEC = 300;      // longer than 5 minutes: they walked away
const KEEP = 20;           // recent paces kept per reader
const LOG_KEY = 'adv.readingLog';

let scene = null;          // { words, shownAt, hiddenMs, hiddenAt, listened }

const now = () => Date.now();
if (typeof document !== 'undefined') {
    document.addEventListener?.('visibilitychange', () => {
        if (!scene) return;
        if (document.hidden) scene.hiddenAt = now();
        else if (scene.hiddenAt) { scene.hiddenMs += now() - scene.hiddenAt; scene.hiddenAt = 0; }
    });
}

/** A new story scene is on screen. `listened`: it is being read aloud. */
export function sceneShown(text, listened = false) {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    scene = { words, shownAt: now(), hiddenMs: 0, hiddenAt: 0, listened };
}

const blank = () => ({ scenes: 0, skims: 0, words: 0, sec: 0, recent: [] });
function tally(r, words, sec, wpm, skimmed) {
    r.scenes++;
    if (skimmed) r.skims++;
    else { r.words += words; r.sec += sec; } // the pace counts only scenes really read
    r.recent = [...(r.recent || []), { wpm, skimmed }].slice(-KEEP);
    return r;
}
function loadLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}') || {}; } catch (_) { return {}; } }

/** The first story choice on this scene; returns what was recorded, or null. */
export function choicePicked(hero, at = now()) {
    const s = scene;
    scene = null;
    if (!s || !hero || s.listened || s.words < MIN_WORDS) return null;
    const sec = (at - s.shownAt - s.hiddenMs - (s.hiddenAt ? at - s.hiddenAt : 0)) / 1000;
    if (sec < 0 || sec > AWAY_SEC) return null;
    const wpm = Math.round(s.words / (Math.max(sec, 0.5) / 60)); // an instant tap is a skip, not a divide by zero
    const skimmed = wpm > typicalWpm(hero.age) * SKIM_FACTOR;
    tally(hero.reading || (hero.reading = blank()), s.words, sec, wpm, skimmed);
    // The parents' history: one entry per reader name, across every game on this device.
    const name = String(hero.name || '').trim();
    if (name) {
        const log = loadLog();
        log[name] = { ...tally(log[name] || blank(), s.words, sec, wpm, skimmed), age: hero.age, last: new Date().toISOString().slice(0, 10) };
        try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (_) {}
    }
    return { wpm, skimmed, words: s.words, sec: Math.round(sec) };
}

/** { wpm, scenes, skims, flagged, typical } from a tally, or null before any scene counted. */
function reportOf(r, age) {
    if (!r?.scenes) return null;
    const wpm = r.sec > 0 ? Math.round(r.words / (r.sec / 60)) : null;
    const recent = r.recent || [];
    const recentSkims = recent.filter(x => x.skimmed).length;
    // Flag: a third or more of the last scenes skimmed (at least 3).
    return { wpm, scenes: r.scenes, skims: r.skims, flagged: recentSkims >= 3 && recentSkims / recent.length >= 1 / 3, typical: typicalWpm(age), age };
}
export const readingReport = (hero) => reportOf(hero?.reading, hero?.age);

/** One plain sentence for a parent. */
export function reportText(name, r) {
    if (!r) return '';
    const pace = r.wpm ? `${r.wpm} words a minute` : 'no scene read at a reading pace yet';
    return `${name}: ${pace} (typical${r.age ? ` at ${r.age}` : ''}: about ${r.typical}). Read ${r.scenes - r.skims} of ${r.scenes} scenes${r.skims ? `, chose without reading ${r.skims}` : ''}.${r.flagged ? ' ⚠ Often chooses without reading.' : ''}`;
}

/** Every reader on this device, most recent first: [{ name, last, ...report }]. */
export function readingLog() {
    return Object.entries(loadLog()).map(([name, e]) => ({ name, last: e.last, ...reportOf(e, e.age) }))
        .filter(e => e.scenes).sort((a, b) => String(b.last).localeCompare(String(a.last)));
}
export function clearReadingLog() { try { localStorage.removeItem(LOG_KEY); } catch (_) {} }
