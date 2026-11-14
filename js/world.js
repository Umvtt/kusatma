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

// Push a circle out of every obstacle it overlaps.
function pushOut(e, r) {
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

// True when a circle at (x, y) overlaps any obstacle.
export function overlaps(x, y, r) {
  for (const o of near(x - r, y - r, x + r, y + r)) {
    const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r - 0.5) return true;
  }
  return false;
}

// The nearest open spot inside the map edges where a circle of radius r fits, searched in rings
// (first toward the middle of the arena). Null if nothing is free within reach.
export function freeSpot(x, y, r, test) {
  const B = WORLD.bounds, m = r + 2;
  const mx = (B.x0 + B.x1) / 2, my = (B.y0 + B.y1) / 2, a0 = Math.atan2(my - y, mx - x);
  for (let d = 0; d <= 900; d += 18) {
    const n = d === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * d) / 24));
    for (let k = 0; k < n; k++) {
      // alternate sides around the direction to the middle: 0, +1, -1, +2, -2...
      const j = k === 0 ? 0 : (k % 2 ? (k + 1) / 2 : -k / 2);
      const a = a0 + (j * 2 * Math.PI) / n;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (px < B.x0 + m || px > B.x1 - m || py < B.y0 + m || py > B.y1 - m) continue;
      if (overlaps(px, py, m)) continue;
      if (test && !test(px, py)) continue;
      return { x: px, y: py };
    }
  }
  return null;
}

// Push a circle out of the map edges and every obstacle. Sliding along walls falls out of this.
// When the moving arena edge pins something against an obstacle, it is moved to the nearest open spot
// instead of being squeezed into the wall (where it would be stuck for good).
export function resolveCircle(e, r) {
  const B = WORLD.bounds;
  e.x = clamp(e.x, B.x0 + r, B.x1 - r);
  e.y = clamp(e.y, B.y0 + r, B.y1 - r);
  pushOut(e, r);
  const cx = clamp(e.x, B.x0 + r, B.x1 - r), cy = clamp(e.y, B.y0 + r, B.y1 - r);
  if (cx !== e.x || cy !== e.y) {
    e.x = cx; e.y = cy;
    if (overlaps(e.x, e.y, r)) { const f = freeSpot(e.x, e.y, r); if (f) { e.x = f.x; e.y = f.y; } }
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

// step costs in tenths of a cell (10 straight, 14 diagonal): whole numbers stay exact in the Float32 field, so no cell is
// queued again and again over rounding (on Liman that made a rebuild take 40 ms instead of a few)
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

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

// How many open path cells are reachable from (x, y) inside the map edges, counting up to `limit`.
// A small number means a closed pocket (walls on every side, or walls and the arena edge).
const PQ = new Int32Array(4096), PSEEN = new Uint8Array(GW * GH);
export function pocketSize(x, y, limit = 60) {
  const B = WORLD.bounds;
  const inB = (j) => { const cx = j % GW, cy = (j - cx) / GW, px = cx * CELL + CELL / 2, py = cy * CELL + CELL / 2; return px > B.x0 && px < B.x1 && py > B.y0 && py < B.y1; };
  const i0 = cellOf(x, y), cx0 = i0 % GW, cy0 = (i0 - cx0) / GW;
  let h = 0, t = 0, n = 0;
  const seen = [];
  const add = (j) => { if (PSEEN[j] || BLOCKED[j] || !inB(j)) return; PSEEN[j] = 1; seen.push(j); PQ[t++] = j; n++; };
  // start from the cell itself, or the open cells right around it when it hugs a wall
  add(i0);
  if (!n) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const nx = cx0 + ox, ny = cy0 + oy; if (nx >= 0 && ny >= 0 && nx < GW && ny < GH) add(ny * GW + nx); }
  if (!n) { for (const j of seen) PSEEN[j] = 0; return limit; } // inside a wall's margin: can't tell, assume open
  while (h < t && n < limit) {
    const i = PQ[h++], cx = i % GW, cy = (i - cx) / GW;
    for (let q = 0; q < 4; q++) {
      const nx = cx + NBX[q], ny = cy + NBY[q];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      add(ny * GW + nx);
      if (n >= limit || t >= PQ.length) break;
    }
  }
  for (const j of seen) PSEEN[j] = 0;
  return Math.min(n, limit);
}
// Moves `e` out of a small closed pocket to the nearest open ground. Returns true if it moved.
export function escapePocket(e, r, limit = 60) {
  if (pocketSize(e.x, e.y, limit) >= limit) return false;
  const f = freeSpot(e.x, e.y, r, (px, py) => pocketSize(px, py, limit) >= limit);
  if (!f) return false;
  e.x = f.x; e.y = f.y;
  return true;
}
