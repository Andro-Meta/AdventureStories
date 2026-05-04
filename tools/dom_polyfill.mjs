// Minimal DOM/window polyfills so engine.js (and its transitive imports)
// can be loaded under Node for unit-style audits. Permissive: no-op methods,
// chainable proxies. Goal: don't crash on import.

const noop = () => {};

function makeStubElement() {
  const el = {
    style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [],
    addEventListener: noop, removeEventListener: noop,
    appendChild: noop, removeChild: noop, replaceChild: noop, insertBefore: noop,
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    innerHTML: '', textContent: '', value: '',
    focus: noop, blur: noop, click: noop,
    getBoundingClientRect: () => ({ x:0,y:0,width:0,height:0,top:0,left:0,right:0,bottom:0 }),
    cloneNode() { return makeStubElement(); }
  };
  return new Proxy(el, {
    get(t, k) { return k in t ? t[k] : makeStubElement(); },
    set(t, k, v) { t[k] = v; return true; }
  });
}

const fakeDocument = new Proxy({
  body: makeStubElement(),
  documentElement: makeStubElement(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeStubElement(),
  createTextNode: () => ({ textContent: '' }),
  addEventListener: noop, removeEventListener: noop,
  cookie: ''
}, { get(t, k) { return k in t ? t[k] : noop; } });

const fakeStorage = (() => {
  const data = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    clear() { for (const k of Object.keys(data)) delete data[k]; },
    key(i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; }
  };
})();

const fakeWindow = new Proxy({
  document: fakeDocument,
  localStorage: fakeStorage,
  sessionStorage: fakeStorage,
  location: { href: 'http://localhost/', search: '', pathname: '/', hash: '' },
  navigator: { userAgent: 'node-audit', onLine: true },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: clearTimeout,
  addEventListener: noop, removeEventListener: noop,
  fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => '' }),
  alert: noop, confirm: () => true, prompt: () => null,
  displayVisualError: () => {},
  console
}, { get(t, k) { return k in t ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });

function safeAssign(name, value) {
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  } catch (_) { /* read-only globals stay as-is */ }
}

safeAssign('window', fakeWindow);
safeAssign('document', fakeDocument);
safeAssign('localStorage', fakeStorage);
safeAssign('sessionStorage', fakeStorage);
safeAssign('navigator', fakeWindow.navigator);
safeAssign('location', fakeWindow.location);
safeAssign('matchMedia', fakeWindow.matchMedia);
safeAssign('requestAnimationFrame', fakeWindow.requestAnimationFrame);
safeAssign('cancelAnimationFrame', fakeWindow.cancelAnimationFrame);
safeAssign('displayVisualError', fakeWindow.displayVisualError);
