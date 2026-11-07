// Canvas drawing: an abandoned plaza at night, seen from above.
import { MAP_W, MAP_H, OBSTACLES, PLAYER_R, CLASSES, ZTYPES, clamp } from './config.js';

const DECAL_SCALE = 0.5;
const MINI_W = 180;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ground = makeGround();
    this.decal = document.createElement('canvas');
    this.decal.width = MAP_W * DECAL_SCALE;
    this.decal.height = MAP_H * DECAL_SCALE;
    this.dctx = this.decal.getContext('2d');
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
  }

  clearDecals() { this.dctx.clearRect(0, 0, this.decal.width, this.decal.height); }

  bake(decals) {
    const g = this.dctx;
    for (const d of decals) {
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * d.r;
        g.fillStyle = `rgba(${70 + Math.random() * 40 | 0},${12 + Math.random() * 10 | 0},${10 + Math.random() * 8 | 0},${0.35 + Math.random() * 0.3})`;
        g.beginPath();
        g.arc((d.x + Math.cos(a) * r) * DECAL_SCALE, (d.y + Math.sin(a) * r) * DECAL_SCALE, (d.r * (0.2 + Math.random() * 0.35)) * DECAL_SCALE, 0, Math.PI * 2);
        g.fill();
      }
    }
    decals.length = 0;
  }

  draw(game, roster) {
    const g = this.ctx, vw = this.vw, vh = this.vh;
    this.bake(game.decals);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#070908';
    g.fillRect(0, 0, vw, vh);

    const S = game.self;
    let fx = S.x, fy = S.y;
    if (game.spectate != null) { const p = game.ps.get(game.spectate); if (p) { fx = p.x; fy = p.y; } }
    const scale = clamp(Math.min(vw, vh) / 900, 0.55, 1.15);
    const cam = game.cam;
    cam.x += (fx - cam.x) * (game.spectate != null ? 0.12 : 1);
    cam.y += (fy - cam.y) * (game.spectate != null ? 0.12 : 1);
    cam.scale = scale; cam.vw = vw; cam.vh = vh;
    const sh = game.shake;
    const ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;

    g.save();
    g.translate(vw / 2 + ox, vh / 2 + oy);
    g.scale(scale, scale);
    g.translate(-cam.x, -cam.y);
    const view = { l: cam.x - vw / 2 / scale - 60, r: cam.x + vw / 2 / scale + 60, t: cam.y - vh / 2 / scale - 60, b: cam.y + vh / 2 / scale + 60 };
    const inView = (x, y) => x > view.l && x < view.r && y > view.t && y < view.b;

    g.drawImage(this.ground, 0, 0, MAP_W, MAP_H);
    g.drawImage(this.decal, 0, 0, MAP_W, MAP_H);
    g.strokeStyle = 'rgba(255,107,44,0.35)';
    g.lineWidth = 4;
    g.setLineDash([24, 18]);
    g.strokeRect(2, 2, MAP_W - 4, MAP_H - 4);
    g.setLineDash([]);

    for (const o of OBSTACLES) drawObstacle(g, o);

    for (const t of game.ts.values()) drawTurret(g, t);

    // downed players lie under everything
    for (const [pid, p] of game.ps) if (!p.alive && inView(p.x, p.y)) drawPlayer(g, p, roster.get(pid), pid === game.me, false);

    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawZombieShadow(g, z);
    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawZombie(g, z, game.time);

    for (const [pid, p] of game.ps) if (p.alive && inView(p.x, p.y)) drawPlayer(g, p, roster.get(pid), pid === game.me, true);

    g.lineCap = 'round';
    for (const b of game.bullets) {
      g.strokeStyle = b.own ? 'rgba(255,224,150,0.95)' : 'rgba(255,214,140,0.7)';
      g.lineWidth = b.w;
      g.beginPath();
      g.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    for (const p of game.parts) {
      const k = p.life / p.max;
      if (p.kind === 'flash') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        g.fillStyle = `rgba(255,210,130,${k})`;
        g.beginPath(); g.moveTo(0, -p.size * 0.5); g.lineTo(p.size * 1.6, 0); g.lineTo(0, p.size * 0.5); g.closePath(); g.fill();
        g.restore();
      } else {
        g.globalAlpha = k;
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
    }
    for (const r of game.rings) {
      const k = r.t / r.max;
      g.strokeStyle = r.col;
      g.globalAlpha = 1 - k;
      g.lineWidth = 4;
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + 0.7 * k), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }

    // name tags on top
    for (const [pid, p] of game.ps) if (inView(p.x, p.y)) drawTag(g, p, roster.get(pid), pid === game.me);

    g.restore();

    // screen-space overlays
    if (game.hurt > 0.01 || (S.alive && S.inGame && S.hp / S.maxHp < 0.3)) {
      const low = S.alive && S.hp / S.maxHp < 0.3 ? 0.25 + 0.1 * Math.sin(game.time * 6) : 0;
      const a = Math.min(0.65, game.hurt * 0.55 + low);
      const grad = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      grad.addColorStop(0, 'rgba(160,20,20,0)');
      grad.addColorStop(1, `rgba(160,20,20,${a})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, vw, vh);
    }
    this.drawMinimap(g, game, roster);
    if (S.inGame && S.alive) this.drawCrosshair(g, game);
  }

  drawCrosshair(g, game) {
    const x = game.input.mx, y = game.input.my;
    const c = CLASSES[game.cls];
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    const gap = 5 + c.spread * 40, len = 6;
    g.beginPath();
    g.moveTo(x - gap - len, y); g.lineTo(x - gap, y);
    g.moveTo(x + gap, y); g.lineTo(x + gap + len, y);
    g.moveTo(x, y - gap - len); g.lineTo(x, y - gap);
    g.moveTo(x, y + gap); g.lineTo(x, y + gap + len);
    g.stroke();
    const rate = game.myStats.rate;
    if (rate < 3 && game.fireT > 0) {
      g.strokeStyle = 'rgba(255,107,44,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, gap + len + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - game.fireT * rate));
      g.stroke();
    }
  }

  drawMinimap(g, game, roster) {
    const w = MINI_W, h = (MAP_H / MAP_W) * w, s = w / MAP_W;
    const x0 = this.vw - w - Math.max(16, 0), y0 = 16;
    g.fillStyle = 'rgba(10,14,12,0.78)';
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = 'rgba(236,230,214,0.18)';
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    g.fillStyle = 'rgba(236,230,214,0.18)';
    for (const o of OBSTACLES) g.fillRect(x0 + o.x * s, y0 + o.y * s, Math.max(1, o.w * s), Math.max(1, o.h * s));
    g.fillStyle = '#e5484d';
    for (const z of game.zs.values()) g.fillRect(x0 + z.x * s - 1, y0 + z.y * s - 1, z.t >= 2 ? 3 : 2, z.t >= 2 ? 3 : 2);
    for (const [pid, p] of game.ps) {
      const r = roster.get(pid);
      g.fillStyle = p.alive ? (r ? r.color : '#fff') : '#666';
      g.beginPath();
      g.arc(x0 + p.x * s, y0 + p.y * s, pid === game.me ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
      if (pid === game.me) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    }
    const c = game.cam;
    g.strokeStyle = 'rgba(236,230,214,0.4)';
    g.strokeRect(x0 + (c.x - c.vw / 2 / c.scale) * s, y0 + (c.y - c.vh / 2 / c.scale) * s, (c.vw / c.scale) * s, (c.vh / c.scale) * s);
  }
}

function makeGround() {
  const s = 0.5;
  const cv = document.createElement('canvas');
  cv.width = MAP_W * s; cv.height = MAP_H * s;
  const g = cv.getContext('2d');
  g.scale(s, s);
  g.fillStyle = '#19201b';
  g.fillRect(0, 0, MAP_W, MAP_H);
  // paving slabs
  g.strokeStyle = 'rgba(255,255,255,0.03)';
  g.lineWidth = 2;
  for (let x = 0; x <= MAP_W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, MAP_H); g.stroke(); }
  for (let y = 0; y <= MAP_H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(MAP_W, y); g.stroke(); }
  // grime
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rnd() < 0.6 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.01)';
    g.beginPath(); g.arc(rnd() * MAP_W, rnd() * MAP_H, 20 + rnd() * 80, 0, Math.PI * 2); g.fill();
  }
  // two asphalt roads crossing the plaza
  g.fillStyle = '#141916';
  g.fillRect(0, MAP_H / 2 - 90, MAP_W, 180);
  g.fillRect(MAP_W / 2 - 90, 0, 180, MAP_H);
  g.strokeStyle = 'rgba(233,196,106,0.22)';
  g.lineWidth = 6;
  g.setLineDash([40, 40]);
  g.beginPath(); g.moveTo(0, MAP_H / 2); g.lineTo(MAP_W / 2 - 100, MAP_H / 2); g.moveTo(MAP_W / 2 + 100, MAP_H / 2); g.lineTo(MAP_W, MAP_H / 2); g.stroke();
  g.beginPath(); g.moveTo(MAP_W / 2, 0); g.lineTo(MAP_W / 2, MAP_H / 2 - 100); g.moveTo(MAP_W / 2, MAP_H / 2 + 100); g.lineTo(MAP_W / 2, MAP_H); g.stroke();
  g.setLineDash([]);
  // cracks
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    let x = rnd() * MAP_W, y = rnd() * MAP_H;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  // central sandbag ring where the team starts
  g.strokeStyle = 'rgba(255,107,44,0.14)';
  g.lineWidth = 8;
  g.beginPath(); g.arc(MAP_W / 2, MAP_H / 2, 130, 0, Math.PI * 2); g.stroke();
  return cv;
}

function drawObstacle(g, o) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(o.x + 6, o.y + 8, o.w, o.h);
  if (o.k === 'kasa') {
    g.fillStyle = '#6b4f2e';
    g.fillRect(o.x, o.y, o.w, o.h);
    g.strokeStyle = '#3e2c18';
    g.lineWidth = 3;
    g.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
    g.beginPath(); g.moveTo(o.x + 4, o.y + 4); g.lineTo(o.x + o.w - 4, o.y + o.h - 4); g.moveTo(o.x + o.w - 4, o.y + 4); g.lineTo(o.x + 4, o.y + o.h - 4); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(o.x, o.y, o.w, 4);
  } else {
    g.fillStyle = '#353d37';
    g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = '#434c45';
    g.fillRect(o.x, o.y, o.w, 5);
    g.strokeStyle = '#222824';
    g.lineWidth = 2;
    g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    // hazard stripe on long faces
    if (o.w > 120) {
      g.save(); g.beginPath(); g.rect(o.x + 6, o.y + o.h - 12, o.w - 12, 6); g.clip();
      for (let x = o.x - 20; x < o.x + o.w; x += 16) {
        g.fillStyle = 'rgba(233,196,106,0.35)';
        g.beginPath(); g.moveTo(x, o.y + o.h - 6); g.lineTo(x + 8, o.y + o.h - 6); g.lineTo(x + 14, o.y + o.h - 12); g.lineTo(x + 6, o.y + o.h - 12); g.fill();
      }
      g.restore();
    }
  }
}

function drawTurret(g, t) {
  g.save();
  g.translate(t.x, t.y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(3, 5, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a4f45';
  g.fillRect(-14, -14, 28, 28);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 2;
  g.strokeRect(-14, -14, 28, 28);
  g.rotate(t.a);
  g.fillStyle = '#20241f';
  g.fillRect(0, -3.5, 24, 7);
  g.fillStyle = '#6b7266';
  g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
  g.restore();
  if (t.life <= 5) {
    g.fillStyle = 'rgba(255,210,63,0.9)';
    g.font = '600 11px Rubik, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(t.life), t.x, t.y - 20);
  }
}

function drawZombieShadow(g, z) {
  const r = ZTYPES[z.t].r;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(z.x + 3, z.y + 5, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
}

function drawZombie(g, z, time) {
  const T = ZTYPES[z.t], r = T.r;
  g.save();
  g.translate(z.x, z.y);
  if (z.dying) g.globalAlpha = 0.45;
  if (z.t === 3) {
    g.fillStyle = 'rgba(229,72,77,0.12)';
    g.beginPath(); g.arc(0, 0, r + 10 + Math.sin(time * 4) * 3, 0, Math.PI * 2); g.fill();
  }
  g.rotate(z.face);
  const sway = Math.sin(time * 8 + z.id) * 0.15;
  g.fillStyle = T.dark;
  for (const s of [-1, 1]) {
    const a = s * (0.55 + sway * s);
    g.beginPath(); g.arc(Math.cos(a) * r * 0.95 + r * 0.25, Math.sin(a) * r * 0.95, r * 0.3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = T.col;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = T.dark;
  g.lineWidth = 2.5;
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.arc(-r * 0.25, r * 0.15, r * 0.45, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff4b3e';
  g.beginPath(); g.arc(r * 0.55, -r * 0.28, Math.max(1.6, r * 0.11), 0, Math.PI * 2); g.arc(r * 0.55, r * 0.28, Math.max(1.6, r * 0.11), 0, Math.PI * 2); g.fill();
  g.restore();
  if (z.hp < z.max && !z.dying) {
    const w = Math.max(24, r * 2), k = clamp(z.hp / z.max, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(z.x - w / 2, z.y - r - 10, w, 4);
    g.fillStyle = z.t === 3 ? '#ff6b2c' : '#e5484d';
    g.fillRect(z.x - w / 2, z.y - r - 10, w * k, 4);
  }
}

function drawPlayer(g, p, info, isMe, alive) {
  const col = info ? info.color : '#ccc';
  const cls = CLASSES[info ? info.cls : 'asker'];
  g.save();
  g.translate(p.x, p.y);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(3, 5, PLAYER_R, PLAYER_R * 0.85, 0, 0, Math.PI * 2); g.fill();
  if (!alive) {
    g.globalAlpha = 0.7;
    g.fillStyle = '#4a4f4b';
    g.beginPath(); g.arc(0, 0, PLAYER_R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#e5484d'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-6, -6); g.lineTo(6, 6); g.moveTo(6, -6); g.lineTo(-6, 6); g.stroke();
    g.restore();
    return;
  }
  g.rotate(p.a || 0);
  g.fillStyle = '#151816';
  const gw = info && info.cls === 'muhendis' ? 8 : 6;
  g.fillRect(4, -gw / 2 + 4, cls.gun, gw);
  g.fillStyle = col;
  g.beginPath(); g.arc(0, 0, PLAYER_R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath(); g.arc(-2, 0, PLAYER_R * 0.55, 0, Math.PI * 2); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.arc(9, 6, 4.5, 0, Math.PI * 2); g.fill();
  g.restore();
  if (isMe) {
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(p.x, p.y, PLAYER_R + 6, 0, Math.PI * 2); g.stroke();
  }
}

function drawTag(g, p, info, isMe) {
  if (!info) return;
  const y = p.y - PLAYER_R - 12;
  g.font = '600 12px Rubik, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.7)';
  g.fillText(info.name, p.x + 1, y - 5);
  g.fillStyle = p.alive ? (isMe ? '#ffffff' : info.color) : '#9aa39a';
  g.fillText(info.name, p.x, y - 6);
  if (p.alive && p.maxHp) {
    const w = 34, k = clamp(p.hp / p.maxHp, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(p.x - w / 2, y, w, 4);
    g.fillStyle = k > 0.5 ? '#43d17a' : k > 0.25 ? '#f5c542' : '#e5484d';
    g.fillRect(p.x - w / 2, y, w * k, 4);
  }
}
