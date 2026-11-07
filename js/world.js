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

export function pointInObstacle(x, y) {
  for (const o of OBSTACLES) {
    if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) return true;
  }
  return false;
}

export const outOfMap = (x, y) => x < 0 || y < 0 || x > MAP_W || y > MAP_H;
