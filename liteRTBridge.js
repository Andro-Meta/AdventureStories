// liteRTBridge.js — On-device LLM provider for the Capacitor Android build.
//
// EXPORTED CONTRACT
//   isAvailable()                                    boolean
//   initialize(opts)                                 Promise<void>
//   chatCompletion({ messages, max_tokens, ... })    Promise<openAIShape>
//   checkHealth()                                    Promise<{status, ...}>
//
// First launch: if the model isn't in local storage, this module downloads it
// from HuggingFace (via ModelDownloadPlugin) and shows a progress overlay.
// Subsequent launches skip straight to model init.

import { LITERT_CONFIG } from './config.js';

const LITERT_PLUGIN_NAME = '@capgo/capacitor-llm';

let _capPlugin   = null;
let _dlPlugin    = null;
let _initialized = false;
let _initInflight = null;
let _modelInfo   = { name: null, sizeMB: null, contextWindow: 4096 };

// ─── Capacitor helpers ────────────────────────────────────────────────────────

function isCapacitor() {
    return !!(typeof window !== 'undefined' && window.Capacitor &&
              typeof window.Capacitor.isNativePlatform === 'function' &&
              window.Capacitor.isNativePlatform());
}

async function loadLLMPlugin() {
    if (_capPlugin) return _capPlugin;
    // In Capacitor's unbuilt WebView, bare npm specifiers don't resolve.
    // Native plugins are always available via window.Capacitor.Plugins.
    const plugins = window.Capacitor?.Plugins;
    if (!plugins) return null;
    _capPlugin = plugins.CapgoLLM ?? plugins.LLM ?? plugins.CapacitorLlm ?? null;
    if (!_capPlugin) {
        console.warn(`liteRTBridge: LLM plugin not found. Keys:`, Object.keys(plugins));
    }
    return _capPlugin;
}

function getDownloadPlugin() {
    if (_dlPlugin) return _dlPlugin;
    try {
        _dlPlugin = window.Capacitor?.Plugins?.ModelDownload ?? null;
        return _dlPlugin;
    } catch (_) {
        return null;
    }
}

// ─── Download overlay UI ──────────────────────────────────────────────────────

function showDownloadOverlay() {
    const id = 'litert-download-overlay';
    if (document.getElementById(id)) return;
    const el = document.createElement('div');
    el.id = id;
    el.innerHTML = `
        <div style="position:fixed;inset:0;background:#0a0a0f;display:flex;flex-direction:column;
                    align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;color:#e8e0d0;padding:24px;box-sizing:border-box;">
            <div style="font-size:40px;margin-bottom:10px;">⚔️</div>
            <div style="font-size:22px;font-weight:bold;margin-bottom:6px;">Adventure Stories</div>
            <div style="font-size:14px;color:#888;margin-bottom:32px;text-align:center;">Downloading AI model — first launch only (~2.4 GB, needs WiFi)</div>
            <div style="width:min(320px,90vw);height:10px;background:#222;border-radius:5px;overflow:hidden;margin-bottom:12px;">
                <div id="litert-dl-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#c8972a,#e8b84b);border-radius:5px;transition:width 0.4s;"></div>
            </div>
            <div id="litert-dl-label" style="font-size:14px;color:#aaa;">Starting download…</div>
            <div id="litert-dl-error" style="margin-top:20px;max-width:320px;text-align:center;font-size:12px;color:#e05050;line-height:1.5;display:none;"></div>
        </div>`;
    document.body.appendChild(el);
}

function updateDownloadProgress(bytesDownloaded, totalBytes, percent) {
    const bar   = document.getElementById('litert-dl-bar');
    const label = document.getElementById('litert-dl-label');
    if (bar)   bar.style.width = percent + '%';
    if (label) {
        const mb    = (bytesDownloaded / 1e6).toFixed(0);
        const total = totalBytes > 0 ? (totalBytes / 1e6).toFixed(0) + ' MB' : '?';
        label.textContent = `${mb} / ${total}  (${percent}%)`;
    }
}

function showDownloadError(msg) {
    const el    = document.getElementById('litert-dl-error');
    const label = document.getElementById('litert-dl-label');
    if (el)    { el.style.display = 'block'; el.textContent = msg; }
    if (label) label.textContent = 'Download failed — see error below';
}

function removeDownloadOverlay() {
    const el = document.getElementById('litert-download-overlay');
    if (el) el.remove();
}

// ─── Model download ───────────────────────────────────────────────────────────

async function ensureModel() {
    const dl = getDownloadPlugin();
    if (!dl) throw new Error('liteRTBridge: ModelDownload plugin not found');

    const modelFile = LITERT_CONFIG.MODEL_FILE || (LITERT_CONFIG.MODEL_NAME + '.task');

    // Check if already downloaded (must be > 100 MB to count as valid)
    const check = await dl.checkModel({ modelName: modelFile });
    if (check.exists && check.sizeBytes > 100_000_000) {
        console.log(`liteRTBridge: model already at ${check.path} (${(check.sizeBytes / 1e6).toFixed(0)} MB)`);
        return check.path;
    }

    const downloadUrl = LITERT_CONFIG.MODEL_DOWNLOAD_URL;
    if (!downloadUrl) {
        throw new Error('liteRTBridge: LITERT_CONFIG.MODEL_DOWNLOAD_URL is empty. Set it in config.js.');
    }

    console.log(`liteRTBridge: starting model download from ${downloadUrl}`);
    showDownloadOverlay();

    // Subscribe to progress events via the plugin's own addListener (synchronous, reliable)
    let progressListener = null;
    try {
        if (typeof dl.addListener === 'function') {
            progressListener = await dl.addListener('modelDownloadProgress', (data) => {
                updateDownloadProgress(data.bytesDownloaded, data.totalBytes, data.percent);
            });
        }
    } catch (_) {}

    try {
        const result = await dl.downloadModel({
            modelName: modelFile,
            url:       downloadUrl,
            hfToken:   LITERT_CONFIG.MODEL_HF_TOKEN || ''
        });
        removeDownloadOverlay();
        return result.path;
    } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('AUTH_REQUIRED')) {
            showDownloadError(
                'This model requires a HuggingFace account + Gemma license.\n' +
                '1. Accept the license at huggingface.co/google/gemma-3-4b-it\n' +
                '2. Create a read token at huggingface.co/settings/tokens\n' +
                '3. Go back to Settings → On-Device AI and paste the token.'
            );
        } else {
            showDownloadError(msg);
        }
        throw e;
    } finally {
        if (progressListener && typeof progressListener.remove === 'function') {
            progressListener.remove();
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isAvailable() {
    return isCapacitor();
}

export async function initialize(opts = {}) {
    if (_initialized) return;
    if (_initInflight) return _initInflight;

    _initInflight = (async () => {
        if (!isCapacitor()) {
            throw new Error(
                `liteRTBridge: not running in Capacitor — cannot use 'litert' backend on ` +
                `web/desktop. Pick 'ollama', 'llama-cpp', or 'cloud' instead.`
            );
        }

        const modelPath = await ensureModel();

        const plugin = await loadLLMPlugin();
        if (!plugin) throw new Error(`liteRTBridge: failed to load ${LITERT_PLUGIN_NAME}`);

        const initParams = {
            modelPath,
            maxTokens:   opts.contextWindow || LITERT_CONFIG.CONTEXT_WINDOW || 4096,
            temperature: opts.temperature ?? 0.7,
            topK:        opts.topK ?? 40,
            randomSeed:  0
        };

        console.log(`liteRTBridge: initializing model at ${modelPath}`);

        if (typeof plugin.initialize === 'function') {
            await plugin.initialize(initParams);
        } else if (typeof plugin.load === 'function') {
            await plugin.load(initParams);
        } else {
            throw new Error(`liteRTBridge: ${LITERT_PLUGIN_NAME} has no initialize() or load()`);
        }

        const sizeMB = LITERT_CONFIG.MODEL_EXPECTED_BYTES
            ? Math.round(LITERT_CONFIG.MODEL_EXPECTED_BYTES / 1e6)
            : null;
        _modelInfo = { name: LITERT_CONFIG.MODEL_FILE, sizeMB, contextWindow: initParams.maxTokens };
        _initialized = true;
        console.log(`liteRTBridge: model ready — ${_modelInfo.name}`);
        return _modelInfo;
    })();

    try { return await _initInflight; }
    finally { _initInflight = null; }
}

function flattenChat(messages, jsonMode) {
    // BUG-14 fix continuation: LiteRT-LM has no response_format hook, so when
    // the caller wants JSON we splice an explicit JSON-only directive into
    // the system turn and prefill the model's opening token with `{`. Gemma
    // strongly honors the prefill — it almost always continues with the
    // expected JSON object instead of prose preamble.
    const parts = [];
    let systemInjected = false;
    for (const m of messages || []) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (m.role === 'system') {
            const sys = jsonMode
                ? m.content + '\n\nCRITICAL: Respond with ONE JSON object only. No prose before or after. No markdown code fences. No commentary. The first character of your response must be `{`.'
                : m.content;
            parts.push(`<start_of_turn>user\n${sys}\n<end_of_turn>`);
            systemInjected = true;
            continue;
        }
        parts.push(`<start_of_turn>${role}\n${m.content}\n<end_of_turn>`);
    }
    if (!systemInjected && jsonMode) {
        // No system turn but JSON requested — prepend a synthetic one.
        parts.unshift('<start_of_turn>user\nCRITICAL: Respond with ONE JSON object only. The first character of your response must be `{`.\n<end_of_turn>');
    }
    // Prefill the assistant turn with `{` when JSON is required so the model
    // commits to JSON shape before generating any tokens.
    parts.push(jsonMode ? '<start_of_turn>model\n{' : '<start_of_turn>model\n');
    return parts.join('\n');
}

export async function chatCompletion(req) {
    if (!_initialized) await initialize({});
    const plugin      = _capPlugin;
    // BUG-14 fix: detect JSON mode from the synthetic markers localAI sets.
    const jsonMode    = !!(req?.response_format
        && (req.response_format.type === 'json_object' || req.response_format.type === 'json_schema'))
        || !!req?._jsonSchema;
    const prompt      = flattenChat(req?.messages, jsonMode);
    const maxTokens   = req?.max_tokens ?? 2048;
    const temperature = req?.temperature ?? 0.7;
    const topK        = req?.top_k ?? 40;
    const t0 = Date.now();
    let text = '';

    if (typeof plugin.generateResponse === 'function') {
        const r = await plugin.generateResponse({ prompt, maxTokens, temperature, topK });
        text = r?.response ?? r?.text ?? '';
    } else if (typeof plugin.generate === 'function') {
        const r = await plugin.generate({ prompt, maxTokens, temperature, topK });
        text = r?.text ?? r?.response ?? '';
    } else {
        throw new Error(`liteRTBridge: plugin has no generate() or generateResponse()`);
    }

    const elapsedMs = Date.now() - t0;
    text = String(text).replace(/<end_of_turn>\s*$/, '').trim();
    // BUG-14 fix: when we prefilled `{`, the plugin's response only contains
    // the *continuation*. Re-prepend `{` so the caller receives a complete
    // JSON object string. If the model already started with `{` (some
    // plugins echo the prefill back), don't double up.
    if (jsonMode && text && !text.startsWith('{')) {
        text = '{' + text;
    }

    return {
        id:      `litert-${Date.now()}`,
        object:  'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model:   _modelInfo.name || 'litert-on-device',
        choices: [{
            index:         0,
            message:       { role: 'assistant', content: text },
            finish_reason: 'stop'
        }],
        usage: {
            prompt_tokens:     Math.ceil(prompt.length / 4),
            completion_tokens: Math.ceil(text.length / 4),
            total_tokens:      Math.ceil((prompt.length + text.length) / 4)
        },
        _liteRT: { elapsedMs, model: _modelInfo }
    };
}

export async function checkHealth() {
    if (!isAvailable()) return { status: 'unavailable', reason: 'not running in Capacitor' };
    try {
        const plugin = await loadLLMPlugin();
        if (!plugin) return { status: 'unavailable', reason: 'LLM plugin not installed' };
        if (!_initialized) return { status: 'pending', reason: 'model not yet loaded' };
        return { status: 'healthy', model: _modelInfo };
    } catch (e) {
        return { status: 'unavailable', reason: e?.message || String(e) };
    }
}

export const _internal = { loadLLMPlugin, flattenChat, ensureModel };
`liteRTBridge: plugin has no generate() or generateResponse()`);
    }

    const elapsedMs = Date.now() - t0;
    text = String(text).replace(/<end_of_turn>\s*$/, '').trim();
    // BUG-14 fix: when we prefilled `{`, the plugin's response only contains
    // the *continuation*. Re-prepend `{` so the caller receives a complete
    // JSON object string. If the model already started with `{` (some
    // plugins echo the prefill back), don't double up.
    if (jsonMode && text && !text.startsWith('{')) {
        text = '{' + text;
    }

    return {
        id:      `litert-${Date.now()}`,
        object:  'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model:   _modelInfo.name || 'litert-on-device',
        choices: [{
            index:         0,
            message:       { role: 'assistant', content: text },
            finish_reason: 'stop'
        }],
        usage: {
            prompt_tokens:     Math.ceil(prompt.length / 4),
            completion_tokens: Math.ceil(text.length / 4),
            total_tokens:      Math.ceil((prompt.length + text.length) / 4)
        },
        _liteRT: { elapsedMs, model: _modelInfo }
    };
}

export async function checkHealth() {
    if (!isAvailable()) return { status: 'unavailable', reason: 'not running in Capacitor' };
    try {
        const plugin = await loadLLMPlugin();
        if (!plugin) return { status: 'unavailable', reason: 'LLM plugin not installed' };
        if (!_initialized) return { status: 'pending', reason: 'model not yet loaded' };
        return { status: 'healthy', model: _modelInfo };
    } catch (e) {
        return { status: 'unavailable', reason: e?.message || String(e) };
    }
}

export const _internal = { loadLLMPlugin, flattenChat, ensureModel };
