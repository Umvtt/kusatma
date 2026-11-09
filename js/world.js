// The current map: its obstacles, the playable area (which grows as players join) and pathfinding.
import { WORLD_W, WORLD_H, clamp } from './config.js';

export const WORLD = {
  theme: null,
  seed: 0,
  obstacles: [],
  decor: [],
  bounds: { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H },
};

// Obstacles are bucketed in a coarse grid so collision checks only look nearby.
const BUCKET = 200;
const BW = Math.ceil(WORLD_W / BUCKET), BH = Math.ceil(WORLD_H / BUCKET);
let buckets = [];

export function setMap(theme, seed, obstacles, decor) {
  WORLD.theme = theme;
  WORLD.seed = seed;
  WORLD.obstacles = obstacles;
  WORLD.decor = decor;
  buckets = Array.from({ length: BW * BH }, () => []);
  for (const o of obstacles) {
    for (let by = Math.floor(o.y / BUCKET); by <= Math.floor((o.y + o.h) / BUCKET); by++) {
      for (let bx = Math.floor(o.x / BUCKET); bx <= Math.floor((o.x + o.w) / BUCKET); bx++) {
        if (bx >= 0 && by >= 0 && bx < BW && by < BH) buckets[by * BW + bx].push(o);
      }
    }
  }
  BLOCKED.fill(0);
  for (let cy = 0; cy < GH; cy++) {
    for (let cx = 0; cx < GW; cx++) {
      if (pointInObstacle(cx * CELL + CELL / 2, cy * CELL + CELL / 2, 16)) BLOCKED[cy * GW + cx] = 1;
    }
  }
}

export function setBounds(x0, y0, x1, y1) {
  const b = WORLD.bounds;
  b.x0 = x0; b.y0 = y0; b.x1 = x1; b.y1 = y1;
}

// Obstacles whose bucket overlaps the box (may contain duplicates; callers don't care).
function near(x0, y0, x1, y1) {
  const out = [];
  const a = clamp(Math.floor(x0 / BUCKET), 0, BW - 1), b = clamp(Math.floor(x1 / BUCKET), 0, BW - 1);
  const c = clamp(Math.floor(y0 / BUCKET), 0, BH - 1), d = clamp(Math.floor(y1 / BUCKET), 0, BH - 1);
  for (let by = c; by <= d; by++) for (let bx = a; bx <= b; bx++) { const l = buckets[by * BW + bx]; if (l) for (const o of l) out.push(o); }
  return out;
}
export function obstaclesIn(x0, y0, x1, y1) { return near(x0, y0, x1, y1); }

// Push a circle out of the map edges and every obstacle. Sliding along walls falls out of this.
export function resolveCircle(e, r) {
  const B = WORLD.bounds;
  e.x = clamp(e.x, B.x0 + r, B.x1 - r);
  e.y = clamp(e.y, B.y0 + r, B.y1 - r);
  for (const o of near(e.x - r, e.y - r, e.x + r, e.y + r)) {
    const cx = clamp(e.x, o.x, o.x + o.w);
    const cy = clamp(e.y, o.y, o.y + o.h);
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      e.x = cx + (dx / d) * r;
      e.y = cy + (dy / d) * r;
    } else {
      const l = e.x - o.x, rr = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y;
      const m = Math.min(l, rr, t, b);
      if (m === l) e.x = o.x - r;
      else if (m === rr) e.x = o.x + o.w + r;
      else if (m === t) e.y = o.y - r;
      else e.y = o.y + o.h + r;
    }
  }
}

export function moveCircle(e, dx, dy, r) {
  e.x += dx;
  e.y += dy;
  resolveCircle(e, r);
}

export function pointInObstacle(x, y, pad = 0) {
  for (const o of near(x - pad, y - pad, x + pad, y + pad)) {
    if (x >= o.x - pad && x <= o.x + o.w + pad && y >= o.y - pad && y <= o.y + o.h + pad) return true;
  }
  return false;
}

export const outOfMap = (x, y) => { const B = WORLD.bounds; return x < B.x0 || y < B.y0 || x > B.x1 || y > B.y1; };

// True when the straight line between two points misses every obstacle (grown by pad).
export function clearLine(x1, y1, x2, y2, pad = 0) {
  const dx = x2 - x1, dy = y2 - y1;
  for (const o of near(Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad)) {
    let t0 = 0, t1 = 1;
    const minX = o.x - pad, maxX = o.x + o.w + pad, minY = o.y - pad, maxY = o.y + o.h + pad;
    let hit = true;
    for (const [p, q1, q2] of [[dx, minX - x1, maxX - x1], [dy, minY - y1, maxY - y1]]) {
      if (Math.abs(p) < 1e-9) { if (q1 > 0 || q2 < 0) { hit = false; break; } continue; }
      let a = q1 / p, b = q2 / p;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) { hit = false; break; }
    }
    if (hit) return false;
  }
  return true;
}

// ---------- navigation grid for zombie pathfinding ----------
export const CELL = 40;
export const GW = Math.ceil(WORLD_W / CELL);
export const GH = Math.ceil(WORLD_H / CELL);
export const BLOCKED = new Uint8Array(GW * GH);
export const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Distance (in cells) from every cell to the nearest source point, going around walls and staying inside the bounds.
// typed-array binary heap, reused between calls (no allocations while the field is built)
const HK = new Float64Array(GW * GH * 4), HV = new Int32Array(GW * GH * 4);
const NBX = Int8Array.from(NB.map((n) => n[0])), NBY = Int8Array.from(NB.map((n) => n[1])), NBC = Float64Array.from(NB.map((n) => n[2]));
export function buildField(sources, out) {
  out.fill(Infinity);
  const B = WORLD.bounds;
  const gx0 = Math.max(0, Math.floor(B.x0 / CELL)), gx1 = Math.min(GW - 1, Math.ceil(B.x1 / CELL) - 1), gy0 = Math.max(0, Math.floor(B.y0 / CELL)), gy1 = Math.min(GH - 1, Math.ceil(B.y1 / CELL) - 1);
  let n = 0;
  const push = (i, d) => {
    if (n >= HK.length) return;
    let k = n++;
    while (k > 0) { const p = (k - 1) >> 1; if (HK[p] <= d) break; HK[k] = HK[p]; HV[k] = HV[p]; k = p; }
    HK[k] = d; HV[k] = i;
  };
  for (const s of sources) { const i = cellOf(s.x, s.y); if (out[i] !== 0) { out[i] = 0; push(i, 0); } }
  while (n > 0) {
    const d = HK[0], i = HV[0];
    // pop: move the last item down from the top
    n--;
    if (n > 0) {
      const ld = HK[n], li = HV[n];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= n) break;
        const r = l + 1, m = r < n && HK[r] < HK[l] ? r : l;
        if (HK[m] >= ld) break;
        HK[k] = HK[m]; HV[k] = HV[m]; k = m;
      }
      HK[k] = ld; HV[k] = li;
    }
    if (d > out[i]) continue;
    const cx = i % GW, cy = (i - cx) / GW;
    for (let q = 0; q < 8; q++) {
      const ox = NBX[q], oy = NBY[q], nx = cx + ox, ny = cy + oy;
      if (nx < gx0 || ny < gy0 || nx > gx1 || ny > gy1) continue;
      const j = ny * GW + nx;
      if (BLOCKED[j]) continue;
      if (ox && oy && (BLOCKED[cy * GW + nx] || BLOCKED[ny * GW + cx])) continue; // no corner cutting
      const nd = d + NBC[q];
      if (nd < out[j]) { out[j] = nd; push(j, nd); }
    }
  }
}

// Direction of steepest descent on the field from a world position (null if nowhere to go).
export function fieldDir(field, x, y) {
  const i = cellOf(x, y);
  const cx = i % GW, cy = (i - cx) / GW;
  let best = field[i], bx = 0, by = 0;
  for (const [ox, oy] of NB) {
    const nx = cx + ox, ny = cy + oy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
    const j = ny * GW + nx;
    if (BLOCKED[j]) continue;
    if (ox && oy && (BLOCKED[cy * GW + nx] || BLOCKED[ny * GW + cx])) continue;
    if (field[j] < best) { best = field[j]; bx = nx; by = ny; }
  }
  if (best === field[i]) return null;
  const tx = bx * CELL + CELL / 2 - x, ty = by * CELL + CELL / 2 - y;
  const d = Math.hypot(tx, ty) || 1;
  return { x: tx / d, y: ty / d };
}

// Like fieldDir, but looks a few cells down the path and heads for the farthest one in plain view
// (checked with the zombie's own radius), so big zombies cut corners smoothly instead of snagging.
export function fieldAhead(field, x, y, r) {
  let i = cellOf(x, y);
  let tx = null, ty = null;
  for (let step = 0; step < 6; step++) {
    const cx = i % GW, cy = (i - cx) / GW;
    let best = field[i], bj = -1;
    for (const [ox, oy] of NB) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const j = ny * GW + nx;
      if (BLOCKED[j]) continue;
      if (ox && oy && (BLOCKED[cy * GW + nx] || BLOCKED[ny * GW + cx])) continue;
      if (field[j] < best) { best = field[j]; bj = j; }
    }
    if (bj < 0) break;
    const px = (bj % GW) * CELL + CELL / 2, py = Math.floor(bj / GW) * CELL + CELL / 2;
    if (step > 0 && !clearLine(x, y, px, py, r * 0.9)) break;
    tx = px; ty = py; i = bj;
  }
  if (tx == null) return fieldDir(field, x, y);
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

// Field value at a world position (Infinity in walls or out of reach).
export function fieldAt(field, x, y) { return field[cellOf(x, y)]; }
