// the few browser things the game modules touch at load time, so the simulation can run in Node
const mem = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.document = { documentElement: { style: { setProperty() {} } }, addEventListener() {}, querySelector: () => null, createElement: () => ({ getContext: () => null, style: {} }), visibilityState: 'visible', hidden: false };
if (!globalThis.navigator) globalThis.navigator = { userAgent: 'node' };
globalThis.requestAnimationFrame = () => 0;
