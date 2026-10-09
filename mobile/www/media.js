// media.js - read-aloud narration, sound effects and vibration. Each is an
// option (localStorage), and each fails silently: no voice, no sound files
// or no vibration motor never breaks a turn.
//  - Voice: Android's own TextToSpeech through @capacitor-community/text-to-speech
//    in the app (the Android WebView has no speechSynthesis); the browser's
//    speechSynthesis on PC, preferring "Natural" (Edge) and "Google" voices.
//  - Sounds: CC0 effects in sfx/ (Kenney.nl packs and others; see sfx/CREDITS.txt).
//  - Vibration: navigator.vibrate (needs the VIBRATE permission in the app).

const pref = (k, d) => { try { const v = localStorage.getItem('adv.' + k); return v == null ? d : v === '1'; } catch (_) { return d; } };
export const settings = {
    get readAloud() { return pref('readAloud', false); },
    get sfx() { return pref('sfx', true); },
    get vibrate() { return pref('vibrate', true); },
    set(k, on) { try { localStorage.setItem('adv.' + k, on ? '1' : '0'); } catch (_) {} }
};

// ---------------------------------------------------------------- voice
const nativeTts = () => (globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor.Plugins?.TextToSpeech) || null;
const webTts = () => globalThis.speechSynthesis || null;
export const canSpeak = () => !!(nativeTts() || webTts());

// Best English voice: natural/neural > Google > online > en-US.
const score = (name = '', lang = '', online = false) =>
    (/natural|neural/i.test(name) ? 8 : 0) + (/google/i.test(name) ? 4 : 0) + (/network/i.test(name) ? 3 : 0) + (online ? 2 : 0) + (/en[-_]us/i.test(lang) ? 1 : 0);
let webVoice = null;
function pickWebVoice() {
    const vs = (webTts()?.getVoices?.() || []).filter(v => /^en/i.test(v.lang));
    webVoice = vs.sort((a, b) => score(b.name, b.lang, !b.localService) - score(a.name, a.lang, !a.localService))[0] || null;
}
if (webTts()) { try { webTts().addEventListener?.('voiceschanged', pickWebVoice); pickWebVoice(); } catch (_) {} }
let nativeVoiceIndex; // index into getSupportedVoices(), picked once
async function nativeVoice(tts) {
    if (nativeVoiceIndex !== undefined) return nativeVoiceIndex;
    nativeVoiceIndex = null;
    try {
        const { voices = [] } = await tts.getSupportedVoices();
        let best = -1;
        voices.forEach((v, i) => {
            if (!/^en/i.test(v.lang || '')) return;
            const s = score(v.name || v.voiceURI, v.lang, v.localService === false);
            if (s > best) { best = s; nativeVoiceIndex = i; }
        });
    } catch (_) { /* engine not ready: default voice */ }
    return nativeVoiceIndex;
}

/** Read text aloud (stops anything already being read). */
export async function speak(text) {
    stopSpeaking();
    const t = String(text || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    const tts = nativeTts();
    try {
        if (tts) {
            const voice = await nativeVoice(tts);
            await tts.speak({ text: t, lang: 'en-US', rate: 0.95, pitch: 1.0, volume: 1.0, ...(voice != null ? { voice } : {}) });
        } else if (webTts()) {
            const u = new SpeechSynthesisUtterance(t);
            if (!webVoice) pickWebVoice();
            if (webVoice) u.voice = webVoice;
            u.rate = 0.97;
            webTts().speak(u);
        }
    } catch (e) { (globalThis.displayVisualError || console.log)(`Read-aloud failed: ${e?.message || e}`); }
}
export function stopSpeaking() {
    try { nativeTts()?.stop?.(); } catch (_) {}
    try { webTts()?.cancel?.(); } catch (_) {}
}

// ---------------------------------------------------------------- sounds
// Several variants per sound so repeats don't sound mechanical.
const SFX = {
    dice: ['sfx/dice-1.ogg', 'sfx/dice-2.ogg', 'sfx/dice-3.ogg'],
    hit: ['sfx/hit-1.ogg', 'sfx/hit-2.ogg', 'sfx/hit-3.ogg'],
    miss: ['sfx/miss-1.ogg', 'sfx/miss-2.ogg'],
    hurt: ['sfx/hurt-1.ogg', 'sfx/hurt-2.ogg'],
    heal: ['sfx/heal.ogg'],
    coin: ['sfx/coin-1.ogg', 'sfx/coin-2.ogg'],
    crit: ['sfx/crit.ogg'],
    fumble: ['sfx/fumble.ogg'],
    levelup: ['sfx/levelup.ogg'],
    tap: ['sfx/tap.ogg']
};
const cache = {};
export function play(name, volume = 0.6) {
    if (!settings.sfx) return;
    const list = SFX[name];
    if (!list) return;
    const src = list[Math.floor(Math.random() * list.length)];
    try {
        const base = cache[src] || (cache[src] = new Audio(src));
        const a = base.cloneNode();
        a.volume = volume;
        a.play()?.catch?.(() => {});
    } catch (_) { /* no audio here */ }
}

// ---------------------------------------------------------------- vibration
export function buzz(pattern) {
    if (!settings.vibrate) return;
    try { globalThis.navigator?.vibrate?.(pattern); } catch (_) {}
}

/** The sound for a popup type (rewards). Hurt, heal and hit sounds come from fx.js, which sees every HP change. */
export function cue(type, message = '') {
    if (/reached level|level up/i.test(message)) return play('levelup');
    switch (type) {
        case 'coins': case 'item': return play('coin');
        case 'legendary': play('crit'); return buzz([30, 40, 60]);
    }
}
