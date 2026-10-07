// liteRTBridge.js - On-device LLM bridge for the Capacitor Android build.
// Wraps @capgo/capacitor-llm v8 (registered name "CapgoLLM"), which uses
// Google's MediaPipe LLM Inference under the hood. Speaks the same OpenAI
// /v1/chat/completions response shape as the desktop backends so localAI.js
// can route to it transparently.

import { LITERT_CONFIG } from './config.js';

const PLUGIN_KEY     = 'CapgoLLM';
const LS_MODEL_PATH  = 'adv.litert.modelPath';
const LS_MODEL_KEY   = 'adv.litert.modelKey';
const LS_MODEL_BYTES = 'adv.litert.modelBytes';
const GEN_TIMEOUT_MS = 5 * 60 * 1000;

let _plugin       = null;
let _modelLoaded  = false;
let _modelPath    = null;
let _modelInfo    = { name: null, sizeMB: null, contextWindow: 4096 };
let _initInflight = null;
let _dlInflight   = null;

function isCapacitor() {
    return !!(typeof window !== 'undefined' && window.Capacitor &&
              typeof window.Capacitor.isNativePlatform === 'function' &&
              window.Capacitor.isNativePlatform());
}

function getPlugin() {
    if (_plugin) return _plugin;
    const Plugins = window.Capacitor?.Plugins;
    if (!Plugins) return null;
    _plugin = Plugins[PLUGIN_KEY] || Plugins.CapgoLLM || Plugins.LLM || null;
    if (!_plugin) {
        console.warn('liteRTBridge: CapgoLLM plugin missing. Plugins:', Object.keys(Plugins));
    }
    return _plugin;
}

function getModelVariant() {
    let key = null;
    try { key = window.localStorage?.getItem('adv.litertModel'); } catch (_) {}
    const alt = key && LITERT_CONFIG.ALTERNATES?.[key];
    if (alt) return {
        key, modelName: alt.modelName, filename: alt.modelAssetPath,
        downloadUrl: alt.downloadUrl, companionUrl: alt.companionUrl || null,
        expectedBytes: alt.expectedBytes || 0,
        contextWindow: alt.contextWindow || 4096,
        defaultParams: alt.defaultParams || {},
        requiresHFToken: alt.requiresHFToken === true
    };
    return {
        key: '__default__',
        modelName:     LITERT_CONFIG.MODEL_NAME,
        filename:      LITERT_CONFIG.MODEL_FILE,
        downloadUrl:   LITERT_CONFIG.MODEL_DOWNLOAD_URL,
        companionUrl:  null,
        expectedBytes: LITERT_CONFIG.MODEL_EXPECTED_BYTES || 0,
        contextWindow: LITERT_CONFIG.CONTEXT_WINDOW || 4096,
        defaultParams: LITERT_CONFIG.DEFAULT_PARAMS || {},
        requiresHFToken: false
    };
}

// Download UI overlay (full-screen, shown only during first-run download).
function showDownloadOverlay() {
    if (document.getElementById('litert-download-overlay')) return;
    const el = document.createElement('div');
    el.id = 'litert-download-overlay';
    el.innerHTML = '<div style="position:fixed;inset:0;background:#0a0a0f;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;color:#e8e0d0;padding:24px;box-sizing:border-box;">' +
        '<div style="font-size:40px;margin-bottom:10px;">&#9876;</div>' +
        '<div style="font-size:22px;font-weight:bold;margin-bottom:6px;">Adventure Stories</div>' +
        '<div style="font-size:14px;color:#888;margin-bottom:32px;text-align:center;">Downloading AI model - first launch only (uses WiFi, runs offline after)</div>' +
        '<div style="width:min(320px,90vw);height:10px;background:#222;border-radius:5px;overflow:hidden;margin-bottom:12px;"><div id="litert-dl-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#c8972a,#e8b84b);border-radius:5px;transition:width 0.4s;"></div></div>' +
        '<div id="litert-dl-label" style="font-size:14px;color:#aaa;">Starting download...</div>' +
        '<div id="litert-dl-error" style="margin-top:20px;max-width:320px;text-align:center;font-size:12px;color:#e05050;line-height:1.5;display:none;"></div>' +
        '</div>';
    document.body.appendChild(el);
}
function updateDownloadOverlay(percent, bytesDownloaded, totalBytes) {
    const bar = document.getElementById('litert-dl-bar');
    const lbl = document.getElementById('litert-dl-label');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (lbl) {
        const mb = bytesDownloaded ? (bytesDownloaded / 1e6).toFixed(0) : '-';
        const total = totalBytes ? `${(totalBytes / 1e6).toFixed(0)} MB` : '?';
        lbl.textContent = `${mb} / ${total}  (${Math.round(percent)}%)`;
    }
}
function showOverlayError(msg) {
    const el = document.getElementById('litert-dl-error');
    const lbl = document.getElementById('litert-dl-label');
    if (el)  { el.style.display = 'block'; el.textContent = msg; }
    if (lbl) lbl.textContent = 'Download failed - see error below';
}
function removeDownloadOverlay() {
    const el = document.getElementById('litert-download-overlay');
    if (el) el.remove();
}

// Public: explicit download (for the Settings -> "Download AI Model" button).
export async function downloadModelOnly(onProgress) {
    if (_dlInflight) return _dlInflight;
    if (!isCapacitor()) throw new Error('On-device AI is only available inside the Android app.');
    const plugin = getPlugin();
    if (!plugin) throw new Error('CapgoLLM plugin not registered. Run `npx cap sync android`.');

    const v = getModelVariant();
    if (!v.downloadUrl) throw new Error('No download URL configured (config.js -> LITERT_CONFIG.MODEL_DOWNLOAD_URL).');
    if (v.requiresHFToken && !LITERT_CONFIG.MODEL_HF_TOKEN) {
        throw new Error(`The model "${v.modelName}" is gated by HuggingFace and requires a token. Pick a non-gated variant in Settings (Qwen2.5 1.5B is the safe default).`);
    }

    _dlInflight = (async () => {
        let progressHandle = null;
        try {
            progressHandle = await plugin.addListener('downloadProgress', (event) => {
                const pct = Number(event?.progress) || 0;
                const total = v.expectedBytes;
                const dl = total ? Math.round((total * pct) / 100) : 0;
                if (typeof onProgress === 'function') {
                    try { onProgress({ percent: pct, bytesDownloaded: dl, totalBytes: total }); } catch (_) {}
                }
            });
            const result = await plugin.downloadModel({
                url: v.downloadUrl,
                ...(v.companionUrl ? { companionUrl: v.companionUrl } : {}),
                filename: v.filename
            });
            try {
                window.localStorage.setItem(LS_MODEL_PATH, result.path);
                window.localStorage.setItem(LS_MODEL_KEY,  v.key);
                if (v.expectedBytes) window.localStorage.setItem(LS_MODEL_BYTES, String(v.expectedBytes));
            } catch (_) {}
            return result;
        } finally {
            if (progressHandle?.remove) { try { await progressHandle.remove(); } catch (_) {} }
            _dlInflight = null;
        }
    })();
    return _dlInflight;
}

// Public: cheap "is the model already downloaded?" check.
export async function checkModelExists() {
    if (!isCapacitor()) return { exists: false };
    let path = null, bytes = 0, modelKey = null;
    try {
        path     = window.localStorage.getItem(LS_MODEL_PATH);
        bytes    = Number(window.localStorage.getItem(LS_MODEL_BYTES) || 0);
        modelKey = window.localStorage.getItem(LS_MODEL_KEY);
    } catch (_) {}
    const v = getModelVariant();
    if (!path || modelKey !== v.key) return { exists: false };
    return { exists: true, path, sizeBytes: bytes };
}

// Public: ensure the model is downloaded AND loaded into MediaPipe.
//
// Resolution order:
//   1. Already loaded in this process? Return cached info.
//   2. Bundled in APK assets? Use /android_asset/<filename>. CapgoLLM's
//      setModel detects this prefix and copies the asset into the app's
//      cache dir before loading — no network, instant on first launch.
//   3. Previously downloaded path persisted in localStorage? Load it.
//   4. Otherwise: download from HuggingFace, persist, then load.
export async function loadModel(opts = {}) {
    if (_modelLoaded) return _modelInfo;
    if (!isCapacitor()) throw new Error('On-device AI is only available inside the Android app.');
    const plugin = getPlugin();
    if (!plugin) throw new Error('CapgoLLM plugin not registered. Run `npx cap sync android`.');

    const v = getModelVariant();

    const setModelWith = async (modelPath) => {
        await plugin.setModel({
            path:        modelPath,
            modelType:   'task',
            maxTokens:   opts.contextWindow || v.contextWindow || 4096,
            topk:        opts.topK ?? v.defaultParams?.top_k ?? 40,
            temperature: opts.temperature ?? v.defaultParams?.temperature ?? 0.7,
            randomSeed:  0
        });
        return modelPath;
    };

    // Step 2: try bundled /android_asset/<filename>. If this works, the model
    // ships with the APK and no download is ever needed.
    if (v.filename) {
        const assetPath = '/android_asset/' + v.filename;
        try {
            await setModelWith(assetPath);
            _modelLoaded = true;
            _modelPath   = assetPath;
            _modelInfo = {
                name:          v.modelName || v.filename,
                sizeMB:        v.expectedBytes ? Math.round(v.expectedBytes / 1e6) : null,
                contextWindow: opts.contextWindow || v.contextWindow || 4096,
                path:          assetPath,
                source:        'bundled-asset'
            };
            console.log('liteRTBridge: model loaded from bundled APK asset (' + assetPath + ')');
            return _modelInfo;
        } catch (e) {
            // Asset not bundled (or failed) - fall through to persisted/download path.
            console.log('liteRTBridge: bundled asset not available, falling back to download flow:', e?.message || e);
        }
    }

    // Step 3 + 4: previously downloaded, or fresh download.
    let modelPath = (await checkModelExists()).path;

    if (!modelPath) {
        showDownloadOverlay();
        try {
            const dl = await downloadModelOnly(({ percent, bytesDownloaded, totalBytes }) =>
                updateDownloadOverlay(percent, bytesDownloaded, totalBytes));
            modelPath = dl.path;
        } catch (e) {
            showOverlayError(String(e?.message || e));
            throw e;
        } finally {
            removeDownloadOverlay();
        }
    }

    try {
        await setModelWith(modelPath);
    } catch (e) {
        try {
            window.localStorage.removeItem(LS_MODEL_PATH);
            window.localStorage.removeItem(LS_MODEL_KEY);
            window.localStorage.removeItem(LS_MODEL_BYTES);
        } catch (_) {}
        throw new Error(`On-device model failed to load: ${e?.message || e}. Tap "Download AI Model" in Settings to redownload.`);
    }

    _modelLoaded = true;
    _modelPath   = modelPath;
    _modelInfo = {
        name:          v.modelName || v.filename,
        sizeMB:        v.expectedBytes ? Math.round(v.expectedBytes / 1e6) : null,
        contextWindow: opts.contextWindow || v.contextWindow || 4096,
        path:          modelPath
    };
    console.log(`liteRTBridge: model ready - ${_modelInfo.name} @ ${modelPath}`);
    return _modelInfo;
}

export function isAvailable() { return isCapacitor(); }

export async function initialize(opts = {}) {
    if (_modelLoaded) return _modelInfo;
    if (_initInflight) return _initInflight;
    _initInflight = (async () => {
        if (!isCapacitor()) throw new Error("liteRTBridge: not running in Capacitor - cannot use 'litert' on desktop.");
        return await loadModel(opts);
    })();
    try { return await _initInflight; }
    finally { _initInflight = null; }
}

// Flatten an OpenAI messages array into Gemma's chat-template string.
// In JSON mode we splice an explicit JSON-only directive into the system
// turn and prefill the assistant turn with `{` so the model commits to
// JSON shape before generating any tokens.
function flattenChat(messages, jsonMode) {
    const parts = [];
    let systemInjected = false;
    for (const m of (messages || [])) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (m.role === 'system') {
            const sys = jsonMode
                ? m.content + '\n\nCRITICAL: Respond with ONE JSON object only. No prose before or after. No markdown code fences. The first character of your response must be `{`.'
                : m.content;
            parts.push(`<start_of_turn>user\n${sys}\n<end_of_turn>`);
            systemInjected = true;
            continue;
        }
        parts.push(`<start_of_turn>${role}\n${m.content}\n<end_of_turn>`);
    }
    if (!systemInjected && jsonMode) {
        parts.unshift('<start_of_turn>user\nCRITICAL: Respond with ONE JSON object only. The first character of your response must be `{`.\n<end_of_turn>');
    }
    parts.push(jsonMode ? '<start_of_turn>model\n{' : '<start_of_turn>model\n');
    return parts.join('\n');
}

// Public: OpenAI-shape chat completion. Wraps the plugin's event-driven
// streaming (createChat -> addListener('textFromAi'/'aiFinished') ->
// sendMessage) in a Promise.
export async function chatCompletion(req) {
    if (!_modelLoaded) await initialize({});
    const plugin = getPlugin();
    if (!plugin) throw new Error('CapgoLLM plugin not registered.');

    const jsonMode = !!(req?.response_format
            && (req.response_format.type === 'json_object' || req.response_format.type === 'json_schema'))
        || !!req?._jsonSchema;
    const prompt = flattenChat(req?.messages, jsonMode);
    const t0 = Date.now();

    return await new Promise(async (resolve, reject) => {
        let chatId = null, textHandle = null, finishedHandle = null, timeout = null;
        let acc = '', resolved = false;

        const cleanup = async () => {
            if (timeout) { clearTimeout(timeout); timeout = null; }
            try { if (textHandle?.remove)     await textHandle.remove();     } catch (_) {}
            try { if (finishedHandle?.remove) await finishedHandle.remove(); } catch (_) {}
            textHandle = null; finishedHandle = null;
        };
        const finish = async (err) => {
            if (resolved) return;
            resolved = true;
            await cleanup();
            if (err) return reject(err);
            let text = String(acc || '').replace(/<end_of_turn>\s*$/, '').trim();
            if (jsonMode && text && !text.startsWith('{')) text = '{' + text;
            resolve({
                id: `litert-${Date.now()}`, object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: _modelInfo.name || 'litert-on-device',
                choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
                usage: {
                    prompt_tokens:     Math.ceil(prompt.length / 4),
                    completion_tokens: Math.ceil(text.length / 4),
                    total_tokens:      Math.ceil((prompt.length + text.length) / 4)
                },
                _liteRT: { elapsedMs: Date.now() - t0, model: _modelInfo }
            });
        };

        try {
            const created = await plugin.createChat();
            chatId = created?.id;
            if (!chatId) return finish(new Error('createChat() returned no id'));

            textHandle = await plugin.addListener('textFromAi', (event) => {
                if (event?.chatId === chatId && typeof event.text === 'string') acc += event.text;
            });
            finishedHandle = await plugin.addListener('aiFinished', (event) => {
                if (event?.chatId === chatId) finish(null);
            });
            timeout = setTimeout(
                () => finish(new Error(`liteRTBridge: generation timed out after ${GEN_TIMEOUT_MS / 1000}s`)),
                GEN_TIMEOUT_MS
            );
            await plugin.sendMessage({ chatId, message: prompt });
        } catch (e) {
            finish(e);
        }
    });
}

export async function checkHealth() {
    if (!isAvailable()) return { status: 'unavailable', reason: 'not running in Capacitor' };
    const plugin = getPlugin();
    if (!plugin) return { status: 'unavailable', reason: 'CapgoLLM plugin not registered' };
    if (!_modelLoaded) {
        const probe = await checkModelExists();
        return {
            status: 'pending',
            reason: probe.exists ? 'model present, will load on first generation' : 'model not yet downloaded',
            modelPresent: probe.exists,
            modelPath: probe.path || null
        };
    }
    try {
        const r = await plugin.getReadiness();
        if (r?.readiness === 'ready') return { status: 'healthy', model: _modelInfo };
        return { status: 'pending', reason: r?.readiness || 'not ready' };
    } catch (e) {
        return { status: 'unavailable', reason: e?.message || String(e) };
    }
}

export const _internal = { getPlugin, flattenChat, getModelVariant };
