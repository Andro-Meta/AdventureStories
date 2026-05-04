// storage.js — Phase 4.0c storage abstraction.
//
// Centralizes ALL persistent storage so the React Native port can swap a
// single backend (web localStorage → AsyncStorage / MMKV) instead of
// chasing localStorage.* calls across the codebase.
//
// API mirrors localStorage but is async-aware. On the web, all operations
// resolve synchronously; on RN later, the same calls become real promises.
// Existing call sites should `await` to stay forward-compatible.
//
// Usage:
//   import { storage } from './storage.js?cb=014';
//   await storage.setItem('myKey', JSON.stringify(value));
//   const raw = await storage.getItem('myKey');
//   await storage.removeItem('myKey');
//   const keys = await storage.keys();
//   await storage.clear();
//
// On RN port: replace the `webBackend` object with an AsyncStorage wrapper
// of the same shape. Nothing else in the codebase changes.

/**
 * Web (browser) implementation. Wraps localStorage in an async-shaped API.
 * Returns the value (or null) and tolerates SecurityError / QuotaExceeded
 * by falling through to a process-memory shim — saves still work in
 * private-browsing or storage-disabled contexts (lost on tab close).
 */
const webBackend = (() => {
    let memoryShim = null;
    const getMemory = () => {
        if (!memoryShim) memoryShim = new Map();
        return memoryShim;
    };
    const isLSAvailable = () => {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return false;
            const probe = '__adv_storage_probe__';
            window.localStorage.setItem(probe, '1');
            window.localStorage.removeItem(probe);
            return true;
        } catch { return false; }
    };
    return {
        async getItem(key) {
            try {
                if (isLSAvailable()) return window.localStorage.getItem(key);
            } catch { /* fallthrough */ }
            return getMemory().get(key) ?? null;
        },
        async setItem(key, value) {
            try {
                if (isLSAvailable()) { window.localStorage.setItem(key, value); return; }
            } catch (e) {
                // QuotaExceededError or similar — fall back to memory so the
                // call doesn't throw mid-save. The user gets a warning via
                // the visual error log; data persists for the session.
                if (typeof window !== 'undefined' && window.displayVisualError) {
                    window.displayVisualError(`Storage warning: localStorage write failed (${e?.message}); using in-memory fallback.`);
                }
            }
            getMemory().set(key, String(value));
        },
        async removeItem(key) {
            try {
                if (isLSAvailable()) { window.localStorage.removeItem(key); return; }
            } catch { /* fallthrough */ }
            getMemory().delete(key);
        },
        async keys() {
            try {
                if (isLSAvailable()) {
                    const out = [];
                    for (let i = 0; i < window.localStorage.length; i++) {
                        const k = window.localStorage.key(i);
                        if (k) out.push(k);
                    }
                    return out;
                }
            } catch { /* fallthrough */ }
            return Array.from(getMemory().keys());
        },
        async clear() {
            try {
                if (isLSAvailable()) { window.localStorage.clear(); return; }
            } catch { /* fallthrough */ }
            getMemory().clear();
        }
    };
})();

// Phase 4 swap point: when porting to React Native, replace `storage` with
// an AsyncStorage / MMKV adapter that exposes the same {getItem, setItem,
// removeItem, keys, clear} shape.
export const storage = webBackend;

// Convenience helpers for common JSON-shaped values.
export async function getJson(key, fallback = null) {
    try {
        const raw = await storage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
    } catch { return fallback; }
}

export async function setJson(key, value) {
    return storage.setItem(key, JSON.stringify(value));
}
