import { MAP_W, MAP_H, OBSTACLES, clamp } from './config.js';

// Push a circle out of the map edges and every obstacle. Sliding along walls falls out of this.
export function resolveCircle(e, r) {
  e.x = clamp(e.x, r, MAP_W - r);
  e.y = clamp(e.y, r, MAP_H - r);
  for (const o of OBSTACLES) {
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
  for (const o of OBSTACLES) {
    if (x >= o.x - pad && x <= o.x + o.w + pad && y >= o.y - pad && y <= o.y + o.h + pad) return true;
  }
  return false;
}

export const outOfMap = (x, y) => x < 0 || y < 0 || x > MAP_W || y > MAP_H;

// True when the straight line between two points misses every obstacle (grown by pad).
export function clearLine(x1, y1, x2, y2, pad = 0) {
  const dx = x2 - x1, dy = y2 - y1;
  for (const o of OBSTACLES) {
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
export const GW = Math.ceil(MAP_W / CELL);
export const GH = Math.ceil(MAP_H / CELL);
export const BLOCKED = new Uint8Array(GW * GH);
for (let cy = 0; cy < GH; cy++) {
  for (let cx = 0; cx < GW; cx++) {
    if (pointInObstacle(cx * CELL + CELL / 2, cy * CELL + CELL / 2, 16)) BLOCKED[cy * GW + cx] = 1;
  }
}
export const cellOf = (x, y) => clamp(Math.floor(y / CELL), 0, GH - 1) * GW + clamp(Math.floor(x / CELL), 0, GW - 1);

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

// Distance (in cells) from every cell to the nearest source point, going around walls.
export function buildField(sources, out) {
  out.fill(Infinity);
  const heap = [];
  const push = (i, d) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  for (const s of sources) { const i = cellOf(s.x, s.y); if (out[i] !== 0) { out[i] = 0; push(i, 0); } }
  while (heap.length) {
    const [d, i] = pop();
    if (d > out[i]) continue;
    const cx = i % GW, cy = (i - cx) / GW;
    for (const [ox, oy, c] of NB) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const j = ny * GW + nx;
      if (BLOCKED[j]) continue;
      if (ox && oy && (BLOCKED[cy * GW + nx] || BLOCKED[ny * GW + cx])) continue; // no corner cutting
      const nd = d + c;
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
