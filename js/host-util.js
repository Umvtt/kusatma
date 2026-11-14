// Small helpers and numbers shared by host.js and its mixins.
export const num = (v) => typeof v === 'number' && Number.isFinite(v);
export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;
export const SNAP_RATE = 15;
export const GHOST_MS = 45000; // how long a player whose connection dropped keeps their spot
export const token = () => { const b = new Uint8Array(8); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
export const GOLDEN = 2.399963;
export const REVIVE_R = 60;
export const REVIVE_TIME = 3;
