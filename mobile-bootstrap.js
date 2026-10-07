// mobile-bootstrap.js - runs SYNCHRONOUSLY before main.js (a module).
// Detects Android-APK shell, tags <html data-platform>, normalizes any
// stale localStorage entries that would land users on broken backends,
// and unregisters any old service worker that could serve cached JS.
(function () {
    'use strict';
    function isAndroidApp() {
        try {
            if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' &&
                window.Capacitor.isNativePlatform()) return true;
            if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function') {
                var p = window.Capacitor.getPlatform();
                if (p === 'android' || p === 'ios') return true;
            }
            if (window.Capacitor) return true;
            if (location && location.protocol === 'https:' &&
                (location.hostname === 'localhost' || location.hostname === '')) return true;
            if (navigator && /Android/i.test(navigator.userAgent || '') &&
                /\bwv\b/i.test(navigator.userAgent || '')) return true;
        } catch (_) {}
        return false;
    }

    var androidApp = isAndroidApp();
    try {
        document.documentElement.setAttribute('data-platform', androidApp ? 'android' : 'desktop');
    } catch (_) {}

    if (androidApp) {
        try {
            // Force any stale desktop-only backend choice to 'cloud'.
            var cur = localStorage.getItem('adv.llmBackend');
            var bad = (cur === 'llama-cpp' || cur === 'minicpm-python' || cur === 'ollama' || !cur);
            if (bad) localStorage.setItem('adv.llmBackend', 'cloud');

            // Unregister any prior service worker so cached JS doesn't keep
            // shipping stale code after a new APK install.
            if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                    regs.forEach(function (r) { try { r.unregister(); } catch (_) {} });
                }).catch(function () {});
            }
            if (typeof caches !== 'undefined' && caches.keys) {
                caches.keys().then(function (keys) {
                    keys.forEach(function (k) { try { caches.delete(k); } catch (_) {} });
                }).catch(function () {});
            }
        } catch (_) {}
    }
})();
