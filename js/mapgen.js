// Builds a whole map from a theme and a seed. Every player runs this with the same seed,
// so only the seed travels over the network.
import { WORLD_W, WORLD_H, CX, CY, MAPS } from './config.js';

const CLEAR = 320;     // nothing is placed this close to the starting point
const EDGE = 30;
// the metro's tracks (the host sends trains along them)
export const METRO_TRACKS = [CY - 1150, CY - 380, CY + 380, CY + 1150];

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMap(theme, seed) {
  if (!MAPS[theme]) theme = 'meydan';
  const R = rng(seed);
  const between = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const obs = [], decor = [];

  const fits = (r, pad) => {
    if (r.x < EDGE || r.y < EDGE || r.x + r.w > WORLD_W - EDGE || r.y + r.h > WORLD_H - EDGE) return false;
    const nx = Math.max(r.x, Math.min(CX, r.x + r.w)), ny = Math.max(r.y, Math.min(CY, r.y + r.h));
    if (Math.hypot(nx - CX, ny - CY) < CLEAR) return false;
    for (const o of obs) {
      if (r.x < o.x + o.w + pad && r.x + r.w + pad > o.x && r.y < o.y + o.h + pad && r.y + r.h + pad > o.y) return false;
    }
    return true;
  };
  // place one or more parts together, only if all of them fit
  const place = (parts, pad = 80) => {
    if (!parts.every((p) => fits(p, pad))) return false;
    for (const p of parts) obs.push({ ...p, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h) });
    return true;
  };
  const AF = (WORLD_W * WORLD_H) / (4400 * 3000); // the world grew: keep the same density of things
  const tries = (n, fn) => { const m = Math.round(n * AF); for (let i = 0; i < m; i++) fn(i); };
  const rx = (w) => between(EDGE, WORLD_W - EDGE - w);
  const ry = (h) => between(EDGE, WORLD_H - EDGE - h);

  if (theme === 'meydan') {
    decor.push({ k: 'road', x: 0, y: CY - 90, w: WORLD_W, h: 180, dir: 'h' }, { k: 'road', x: CX - 90, y: 0, w: 180, h: WORLD_H, dir: 'v' });
    decor.push({ k: 'sandbags', x: CX, y: CY, r: 150 });
    tries(60, () => { // L-shaped concrete walls
      const arm = between(150, 240), t = between(48, 62), x = rx(arm), y = ry(arm);
      const o = Math.floor(R() * 4);
      const h = { x, y: o < 2 ? y : y + arm - t, w: arm, h: t, k: 'beton' };
      const v = { x: o % 2 ? x + arm - t : x, y, w: t, h: arm, k: 'beton' };
      place([h, v], 90);
    });
    tries(70, () => { const long = R() < 0.5, l = between(120, 220); const w = long ? l : 46, h = long ? 46 : l; place([{ x: rx(w), y: ry(h), w, h, k: 'beton' }], 90); });
    tries(160, () => {
      const s = between(38, 58), x = rx(s * 3), y = ry(s * 2), n = 1 + Math.floor(R() * 3);
      const parts = [];
      for (let i = 0; i < n; i++) parts.push({ x: x + i * (s + 2), y: y + (i === 2 ? s + 2 : 0), w: s, h: s, k: 'kasa' });
      place(parts, 80);
    });
  } else if (theme === 'benzinlik') {
    decor.push({ k: 'asphalt', x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    for (const y of [CY, CY - 1000, CY + 1000]) decor.push({ k: 'road', x: 0, y: y - 100, w: WORLD_W, h: 200, dir: 'h' });
    for (const x of [CX, CX - 1500, CX + 1500]) decor.push({ k: 'road', x: x - 100, y: 0, w: 200, h: WORLD_H, dir: 'v' });
    tries(14, () => { const w = between(380, 560), h = between(240, 360); decor.push({ k: 'parking', x: rx(w), y: ry(h), w, h }); });
    tries(30, () => { // fuel station: canopy with pillars and pump islands
      const w = 300, h = 190, x = rx(w), y = ry(h);
      const parts = [
        { x: x + 20, y: y + 20, w: 24, h: 24, k: 'beton' }, { x: x + w - 44, y: y + 20, w: 24, h: 24, k: 'beton' },
        { x: x + 20, y: y + h - 44, w: 24, h: 24, k: 'beton' }, { x: x + w - 44, y: y + h - 44, w: 24, h: 24, k: 'beton' },
        { x: x + 100, y: y + 55, w: 100, h: 24, k: 'pompa' }, { x: x + 100, y: y + h - 79, w: 100, h: 24, k: 'pompa' },
      ];
      if (place(parts, 110)) decor.push({ k: 'canopy', x, y, w, h });
    });
    tries(30, () => { const w = between(220, 340), h = between(140, 210); place([{ x: rx(w), y: ry(h), w, h, k: 'bina', c: pick(['#5b4d42', '#4b5560', '#5a5640', '#5c4848']) }], 120); });
    tries(220, () => { const side = R() < 0.5, w = side ? 92 : 46, h = side ? 46 : 92; place([{ x: rx(w), y: ry(h), w, h, k: 'araba', c: pick(['#7a2e2e', '#2e4a7a', '#7a6a2e', '#4a4a4a', '#d8d4c8', '#2e6a4a']) }], 70); });
    tries(60, () => place([{ x: rx(60), y: ry(36), w: 60, h: 36, k: 'kasa' }], 80));
  } else if (theme === 'hastane') {
    decor.push({ k: 'grass', x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    decor.push({ k: 'path', x: 0, y: CY - 60, w: WORLD_W, h: 120 }, { k: 'path', x: CX - 60, y: 0, w: 120, h: WORLD_H });
    for (const d of [-1, 1]) { decor.push({ k: 'path', x: 0, y: CY + d * 900 - 45, w: WORLD_W, h: 90 }, { k: 'path', x: CX + d * 1300 - 45, y: 0, w: 90, h: WORLD_H }); }
    tries(40, () => { const r = between(50, 110); decor.push({ k: 'flowers', x: rx(r * 2) + r, y: ry(r * 2) + r, r }); });
    tries(16, () => { const w = between(380, 620), h = between(160, 240); place([{ x: rx(w), y: ry(h), w, h, k: 'bina', c: '#c9c4b5', hosp: true }], 140); });
    tries(110, () => { const long = R() < 0.5, l = between(200, 360); const w = long ? l : 34, h = long ? 34 : l; place([{ x: rx(w), y: ry(h), w, h, k: 'cit' }], 90); });
    tries(40, () => { const side = R() < 0.5, w = side ? 104 : 50, h = side ? 50 : 104; place([{ x: rx(w), y: ry(h), w, h, k: 'ambulans' }], 80); });
    tries(80, () => { const side = R() < 0.5, w = side ? 64 : 22, h = side ? 22 : 64; place([{ x: rx(w), y: ry(h), w, h, k: 'bank' }], 70); });
    tries(90, () => { const s = between(34, 46); place([{ x: rx(s), y: ry(s), w: s, h: s, k: 'agac' }], 70); });
  } else if (theme === 'orman') {
    decor.push({ k: 'forest', x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    tries(10, () => { decor.push({ k: 'trail', x1: R() * WORLD_W, y1: R() * WORLD_H, x2: CX + (R() - 0.5) * 200, y2: CY + (R() - 0.5) * 200 }); });
    decor.push({ k: 'clearing', x: CX, y: CY, r: 300 });
    tries(4, () => { const w = between(200, 260), h = between(150, 190); place([{ x: rx(w), y: ry(h), w, h, k: 'bina', c: '#6b4a2b', cabin: true }], 140); });
    tries(80, () => { const w = between(50, 95), h = between(45, 80); place([{ x: rx(w), y: ry(h), w, h, k: 'kaya' }], 80); });
    tries(60, () => { const side = R() < 0.5, l = between(110, 170); const w = side ? l : 28, h = side ? 28 : l; place([{ x: rx(w), y: ry(h), w, h, k: 'kutuk' }], 80); });
    tries(520, () => { const s = between(30, 48); place([{ x: rx(s), y: ry(s), w: s, h: s, k: 'agac' }], 66); });
  } else if (theme === 'liman') {
    // the sea along the top edge, a quay, rows of containers, cranes' legs, forklifts and mooring posts
    obs.push({ x: 0, y: 0, w: WORLD_W, h: 360, k: 'su' });
    decor.push({ k: 'quay', x: 0, y: 360, w: WORLD_W, h: 70 });
    for (const y of [CY - 40, CY + 900]) decor.push({ k: 'rail', x: 0, y, w: WORLD_W, h: 40 });
    tries(24, () => { const x = rx(30); place([{ x, y: 440, w: 30, h: 30, k: 'baba' }], 110); });
    tries(90, () => { // container stacks: 1-3 boxes in a row
      const side = R() < 0.6, n = 1 + Math.floor(R() * 3), L = 230, W = 84, c = pick(['#8e3b2e', '#2f5a8a', '#3d7a4a', '#c07a2a', '#6b6f75', '#7a2e5a']);
      const x = rx(side ? L : W * n + 6 * n), y = between(470, WORLD_H - EDGE - (side ? W * n + 6 * n : L));
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(side ? { x, y: y + i * (W + 6), w: L, h: W, k: 'konteyner', c } : { x: x + i * (W + 6), y, w: W, h: L, k: 'konteyner', c });
      place(parts, 95);
    });
    tries(16, () => { const x = rx(240), y = between(480, WORLD_H - 300); place([{ x, y, w: 34, h: 34, k: 'beton' }, { x: x + 206, y, w: 34, h: 34, k: 'beton' }, { x, y: y + 180, w: 34, h: 34, k: 'beton' }, { x: x + 206, y: y + 180, w: 34, h: 34, k: 'beton' }], 100); });
    tries(40, () => { const side = R() < 0.5; const w = side ? 76 : 44, h = side ? 44 : 76; place([{ x: rx(w), y: between(470, WORLD_H - 120), w, h, k: 'forklift' }], 80); });
    tries(70, () => place([{ x: rx(56), y: between(470, WORLD_H - 80), w: 56, h: 40, k: 'kasa' }], 80));
  } else if (theme === 'kar') {
    // a snowed-in village: houses, pine trees, fences, drifts and a frozen pond in the middle
    decor.push({ k: 'snow', x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    decor.push({ k: 'pond', x: CX + 900, y: CY - 600, r: 330 });
    tries(8, () => { decor.push({ k: 'snowpath', x1: R() * WORLD_W, y1: R() * WORLD_H, x2: CX + (R() - 0.5) * 200, y2: CY + (R() - 0.5) * 200 }); });
    tries(26, () => { const w = between(180, 260), h = between(140, 200); place([{ x: rx(w), y: ry(h), w, h, k: 'bina', c: pick(['#6b4a2b', '#5a3f28', '#7a5536']), cabin: true, snowy: true }], 140); });
    tries(80, () => { const long = R() < 0.5, l = between(160, 300); const w = long ? l : 26, h = long ? 26 : l; place([{ x: rx(w), y: ry(h), w, h, k: 'cit', wood: true }], 90); });
    tries(260, () => { const s = between(34, 52); place([{ x: rx(s), y: ry(s), w: s, h: s, k: 'cam' }], 70); });
    tries(70, () => { const w = between(70, 130), h = between(50, 80); place([{ x: rx(w), y: ry(h), w, h, k: 'kar' }], 80); });
    tries(20, () => place([{ x: rx(44), y: ry(44), w: 44, h: 44, k: 'kuyu' }], 120));
  }
  else if (theme === 'metro') {
    // platforms between three pairs of tracks; trains come along the tracks (the host sends them)
    decor.push({ k: 'tiles', x: 0, y: 0, w: WORLD_W, h: WORLD_H, c: 'rgba(255,255,255,0.025)', s: 60 });
    for (const ty of METRO_TRACKS) decor.push({ k: 'rail', x: 0, y: ty - 22, w: WORLD_W, h: 44 }, { k: 'platform', x: 0, y: ty - 60, w: WORLD_W, h: 14 }, { k: 'platform', x: 0, y: ty + 46, w: WORLD_W, h: 14 });
    const offTrack = (y, h) => METRO_TRACKS.every((ty) => y + h < ty - 70 || y > ty + 70);
    tries(150, () => { const s2 = between(40, 54), x = rx(s2), y = ry(s2); if (offTrack(y, s2)) place([{ x, y, w: s2, h: s2, k: 'kolon' }], 120); });
    tries(70, () => { const w = between(70, 110), x = rx(w), y = ry(22); if (offTrack(y, 22)) place([{ x, y, w, h: 22, k: 'bank' }], 80); });
    tries(40, () => { const w = between(160, 260), h = between(60, 90), x = rx(w), y = ry(h); if (offTrack(y, h)) place([{ x, y, w, h, k: 'beton' }], 110); });
    tries(30, () => { const x = rx(60), y = ry(36); if (offTrack(y, 36)) place([{ x, y, w: 60, h: 36, k: 'kasa' }], 80); });
  } else if (theme === 'avm') {
    // a mall: rows of shops along wide corridors, kiosks, planters and benches
    decor.push({ k: 'tiles', x: 0, y: 0, w: WORLD_W, h: WORLD_H, c: 'rgba(255,255,255,0.04)', s: 120 });
    for (const y of [CY - 900, CY, CY + 900]) decor.push({ k: 'path', x: 0, y: y - 110, w: WORLD_W, h: 220, c: 'rgba(255,255,255,0.03)' });
    tries(46, () => { const w = between(240, 380), h = between(150, 220); place([{ x: rx(w), y: ry(h), w, h, k: 'bina', shop: true, c: pick(['#5a3d4f', '#3d4f5a', '#4f5a3d', '#5a4a3d', '#3d3d5a']), a: pick(['#ff6b6b', '#ffd23f', '#4cc9f0', '#9ef01a', '#f15bb5']) }], 130); });
    tries(60, () => { const s2 = between(54, 72); place([{ x: rx(s2), y: ry(s2), w: s2, h: s2, k: 'stand', c: pick(['#ff9f43', '#4cc9f0', '#f15bb5', '#9ef01a']) }], 100); });
    tries(110, () => { const s2 = between(34, 44); place([{ x: rx(s2), y: ry(s2), w: s2, h: s2, k: 'saksi' }], 80); });
    tries(80, () => { const side = R() < 0.5, w = side ? 70 : 22, h = side ? 22 : 70; place([{ x: rx(w), y: ry(h), w, h, k: 'bank' }], 70); });
  } else if (theme === 'us') {
    // an army base: sandbag lines, watchtowers, tents, wrecked tanks and a helipad
    decor.push({ k: 'dirt', x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    decor.push({ k: 'road', x: 0, y: CY - 80, w: WORLD_W, h: 160, dir: 'h' });
    decor.push({ k: 'helipad', x: CX + 1100, y: CY - 700, r: 170 });
    tries(90, () => { const long = R() < 0.5, l = between(140, 260); const w = long ? l : 30, h = long ? 30 : l; place([{ x: rx(w), y: ry(h), w, h, k: 'kumtorba' }], 90); });
    tries(24, () => place([{ x: rx(64), y: ry(64), w: 64, h: 64, k: 'kule' }], 140));
    tries(36, () => { const w = between(120, 170), h = between(90, 120); place([{ x: rx(w), y: ry(h), w, h, k: 'cadir', c: '#4a5a32' }], 110); });
    tries(22, () => { const side = R() < 0.5, w = side ? 130 : 74, h = side ? 74 : 130; place([{ x: rx(w), y: ry(h), w, h, k: 'tank', d: side ? 0 : 1 }], 120); });
    tries(30, () => { const side = R() < 0.5, L = 230, W = 84; const w = side ? L : W, h = side ? W : L; place([{ x: rx(w), y: ry(h), w, h, k: 'konteyner', c: pick(['#4a5a32', '#5a5640', '#3d4a2e']) }], 100); });
    tries(70, () => place([{ x: rx(56), y: ry(40), w: 56, h: 40, k: 'kasa' }], 80));
  } else if (theme === 'luna') {
    // a night funfair: carousels, food stalls, striped tents, trees, strings of lights and a haunted house
    decor.push({ k: 'park', x: 0, y: 0, w: WORLD_W, h: WORLD_H });
    tries(10, () => { decor.push({ k: 'trail', x1: R() * WORLD_W, y1: R() * WORLD_H, x2: CX + (R() - 0.5) * 200, y2: CY + (R() - 0.5) * 200 }); });
    tries(26, () => { const x1 = R() * WORLD_W, y1 = R() * WORLD_H, a = R() * Math.PI * 2, L = between(220, 420); decor.push({ k: 'lights', x1, y1, x2: x1 + Math.cos(a) * L, y2: y1 + Math.sin(a) * L }); });
    tries(10, () => { const s2 = between(150, 190); place([{ x: rx(s2), y: ry(s2), w: s2, h: s2, k: 'atli' }], 140); });
    tries(40, () => { const w = between(90, 130), h = between(70, 90); place([{ x: rx(w), y: ry(h), w, h, k: 'bufe', c: pick(['#e5484d', '#4cc9f0', '#ffd23f', '#9ef01a', '#f15bb5']) }], 110); });
    tries(24, () => { const w = between(120, 170), h = between(100, 140); place([{ x: rx(w), y: ry(h), w, h, k: 'cadir', c: pick(['#c0392b', '#2f5a8a', '#7a2e5a']), stripe: true }], 120); });
    // haunted houses stay near the middle, inside the arena even when one player plays alone
    for (let i = 0, n = 0; i < 80 && n < 3; i++) { const w = 260, h = 200; if (place([{ x: between(CX - 1500, CX + 1240), y: between(CY - 1000, CY + 800), w, h, k: 'bina', c: '#2a1f33', haunt: true }], 160)) n++; }
    tries(140, () => { const s2 = between(30, 44); place([{ x: rx(s2), y: ry(s2), w: s2, h: s2, k: 'agac' }], 70); });
    tries(60, () => { const side = R() < 0.5, w = side ? 64 : 22, h = side ? 22 : 64; place([{ x: rx(w), y: ry(h), w, h, k: 'bank' }], 70); });
  }
  return { theme, seed, obstacles: obs, decor };
}
