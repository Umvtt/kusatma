// Canvas drawing: an abandoned plaza at night, seen from above, lit by the team's flashlights.
import { MAP_W, MAP_H, OBSTACLES, PLAYER_R, CLASSES, ZTYPES, ZS, clamp } from './config.js';

const DECAL_SCALE = 0.5;
const MINI_W = 180;
const DARKNESS = 0.5;
const SKIN = '#d9a77a';

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ground = makeGround();
    this.decal = document.createElement('canvas');
    this.decal.width = MAP_W * DECAL_SCALE;
    this.decal.height = MAP_H * DECAL_SCALE;
    this.dctx = this.decal.getContext('2d');
    this.lightCv = document.createElement('canvas');
    this.lctx = this.lightCv.getContext('2d');
    this.lastT = performance.now();
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
    this.lightCv.width = Math.ceil(this.vw / 2);
    this.lightCv.height = Math.ceil(this.vh / 2);
  }

  clearDecals() { this.dctx.clearRect(0, 0, this.decal.width, this.decal.height); }

  bake(decals) {
    const g = this.dctx;
    for (const d of decals) {
      if (d.scorch) {
        const gr = g.createRadialGradient(d.x * DECAL_SCALE, d.y * DECAL_SCALE, 0, d.x * DECAL_SCALE, d.y * DECAL_SCALE, d.r * DECAL_SCALE);
        gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(d.x * DECAL_SCALE, d.y * DECAL_SCALE, d.r * DECAL_SCALE, 0, Math.PI * 2); g.fill();
        continue;
      }
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * d.r;
        g.fillStyle = d.green
          ? `rgba(${90 + Math.random() * 30 | 0},${110 + Math.random() * 30 | 0},${20 + Math.random() * 10 | 0},${0.3 + Math.random() * 0.25})`
          : `rgba(${70 + Math.random() * 40 | 0},${12 + Math.random() * 10 | 0},${10 + Math.random() * 8 | 0},${0.35 + Math.random() * 0.3})`;
        g.beginPath();
        g.arc((d.x + Math.cos(a) * r) * DECAL_SCALE, (d.y + Math.sin(a) * r) * DECAL_SCALE, (d.r * (0.2 + Math.random() * 0.35)) * DECAL_SCALE, 0, Math.PI * 2);
        g.fill();
      }
    }
    decals.length = 0;
  }

  draw(game, roster) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const g = this.ctx, vw = this.vw, vh = this.vh;
    this.bake(game.decals);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#070908';
    g.fillRect(0, 0, vw, vh);

    // camera: follow the player, lean a little toward where they aim
    const S = game.self;
    const scale = clamp(Math.min(vw, vh) / 900, 0.55, 1.15) * game.zoom;
    let fx = S.x, fy = S.y;
    if (game.spectate != null) { const p = game.ps.get(game.spectate); if (p) { fx = p.x; fy = p.y; } }
    else if (S.alive) {
      fx += clamp((game.input.mx - vw / 2) / scale, -400, 400) * 0.18;
      fy += clamp((game.input.my - vh / 2) / scale, -300, 300) * 0.18;
    }
    const cam = game.cam;
    const k = 1 - Math.exp(-dt * (game.spectate != null ? 4 : 10));
    cam.x += (fx - cam.x) * k;
    cam.y += (fy - cam.y) * k;
    cam.scale = scale; cam.vw = vw; cam.vh = vh;
    const sh = game.shake;
    const ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;

    const world = (ctx, s) => { ctx.translate(vw / 2 * s + ox * s, vh / 2 * s + oy * s); ctx.scale(scale * s, scale * s); ctx.translate(-cam.x, -cam.y); };
    g.save();
    world(g, 1);
    const view = { l: cam.x - vw / 2 / scale - 80, r: cam.x + vw / 2 / scale + 80, t: cam.y - vh / 2 / scale - 80, b: cam.y + vh / 2 / scale + 80 };
    const inView = (x, y) => x > view.l && x < view.r && y > view.t && y < view.b;

    g.drawImage(this.ground, 0, 0, MAP_W, MAP_H);
    g.drawImage(this.decal, 0, 0, MAP_W, MAP_H);
    g.strokeStyle = 'rgba(255,107,44,0.35)';
    g.lineWidth = 4;
    g.setLineDash([24, 18]);
    g.strokeRect(2, 2, MAP_W - 4, MAP_H - 4);
    g.setLineDash([]);

    for (const o of OBSTACLES) drawObstacle(g, o);
    for (const m of game.mines) drawMine(g, m, game.time);
    for (const t of game.ts.values()) drawTurret(g, t);

    // downed players lie under everything
    for (const [pid, p] of game.ps) if (!p.alive && inView(p.x, p.y)) drawPlayer(g, game, pid, p, roster.get(pid), false);

    // warnings before big attacks
    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawTelegraph(g, z, game.time);
    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawZombie(g, z, game.time);

    for (const [pid, p] of game.ps) if (p.alive && inView(p.x, p.y)) drawPlayer(g, game, pid, p, roster.get(pid), true);

    // projectiles
    g.lineCap = 'round';
    for (const b of game.bullets) {
      if (b.kind === 'f') continue;
      if (b.kind === 'g') {
        g.fillStyle = '#3d4a2a';
        g.beginPath(); g.arc(b.x, b.y, 5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,200,120,0.35)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04); g.lineTo(b.x, b.y); g.stroke();
        continue;
      }
      g.strokeStyle = b.own ? 'rgba(255,224,150,0.95)' : 'rgba(255,214,140,0.7)';
      g.lineWidth = b.w;
      g.beginPath();
      g.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    for (const q of game.spits.values()) {
      g.fillStyle = 'rgba(159,191,42,0.35)';
      g.beginPath(); g.arc(q.x, q.y, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b5d43a';
      g.beginPath(); g.arc(q.x, q.y, 6, 0, Math.PI * 2); g.fill();
    }

    // particles: smoke under fire
    for (const p of game.parts) {
      const kk = p.life / p.max;
      if (p.kind === 'smoke') {
        g.globalAlpha = kk * 0.45;
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.size * (1.6 - kk * 0.6), 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
    for (const p of game.parts) {
      const kk = p.life / p.max;
      if (p.kind === 'flash') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        g.fillStyle = `rgba(255,210,130,${kk})`;
        g.beginPath(); g.moveTo(0, -p.size * 0.5); g.lineTo(p.size * 1.6, 0); g.lineTo(0, p.size * 0.5); g.closePath(); g.fill();
        g.restore();
      } else if (p.kind === 'dot') {
        g.globalAlpha = kk;
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
    }
    for (const r of game.rings) {
      const kk = r.t / r.max;
      g.strokeStyle = r.col;
      g.globalAlpha = 1 - kk;
      g.lineWidth = 4;
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + 0.7 * kk), 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();

    // ---------- night lighting ----------
    this.drawLights(game, world, inView);
    g.drawImage(this.lightCv, 0, 0, vw, vh);

    // things that glow in the dark sit above the darkness
    g.save();
    world(g, 1);
    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawEyes(g, z);
    g.globalCompositeOperation = 'lighter';
    for (const b of game.bullets) {
      if (b.kind !== 'f') continue;
      const age = 1 - b.life / b.max;
      g.globalAlpha = 0.5 * (1 - age);
      g.fillStyle = age < 0.35 ? '#ffd166' : age < 0.7 ? '#ff8c3a' : '#c2410c';
      g.beginPath(); g.arc(b.x, b.y, 5 + age * 16, 0, Math.PI * 2); g.fill();
    }
    for (const p of game.parts) {
      if (p.kind !== 'fire') continue;
      const kk = p.life / p.max;
      g.globalAlpha = kk * 0.75;
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.size * (0.6 + kk * 0.6), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    for (const m of game.mines) if (m[3] && Math.sin(game.time * 8 + m[0]) > 0) { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(m[1], m[2], 2.5, 0, Math.PI * 2); g.fill(); }
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

  drawLights(game, world, inView) {
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.lightCv.width, this.lightCv.height);
    l.fillStyle = `rgba(4,7,12,${DARKNESS})`;
    l.fillRect(0, 0, this.lightCv.width, this.lightCv.height);
    l.save();
    world(l, 0.5);
    l.globalCompositeOperation = 'destination-out';
    const glow = (x, y, r, a) => {
      const gr = l.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = gr;
      l.beginPath(); l.arc(x, y, r, 0, Math.PI * 2); l.fill();
    };
    for (const p of game.ps.values()) {
      if (!inView(p.x, p.y) && !p.alive) continue;
      glow(p.x, p.y, p.alive ? 190 : 90, p.alive ? 0.95 : 0.5);
      if (!p.alive) continue;
      // flashlight cone
      const len = 560, half = 0.42;
      const gr = l.createRadialGradient(p.x, p.y, 20, p.x, p.y, len);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = gr;
      l.beginPath(); l.moveTo(p.x, p.y); l.arc(p.x, p.y, len, p.a - half, p.a + half); l.closePath(); l.fill();
    }
    for (const t of game.ts.values()) glow(t.x, t.y, 90, 0.6);
    for (const q of game.spits.values()) glow(q.x, q.y, 50, 0.6);
    for (const li of game.lights) glow(li.x, li.y, li.r, Math.min(1, li.life / li.max + 0.2));
    for (const b of game.bullets) if (b.kind === 'f' && inView(b.x, b.y)) glow(b.x, b.y, 50, 0.35);
    l.restore();
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
    if (game.hitMark > 0) {
      g.strokeStyle = `rgba(255,90,80,${Math.min(1, game.hitMark * 10)})`;
      g.lineWidth = 2.5;
      const a = gap + 2, b = gap + 9;
      g.beginPath();
      g.moveTo(x - a, y - a); g.lineTo(x - b, y - b);
      g.moveTo(x + a, y - a); g.lineTo(x + b, y - b);
      g.moveTo(x - a, y + a); g.lineTo(x - b, y + b);
      g.moveTo(x + a, y + a); g.lineTo(x + b, y + b);
      g.stroke();
    }
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
    const x0 = this.vw - w - 16, y0 = 16;
    g.fillStyle = 'rgba(10,14,12,0.78)';
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = 'rgba(236,230,214,0.18)';
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    g.fillStyle = 'rgba(236,230,214,0.18)';
    for (const o of OBSTACLES) g.fillRect(x0 + o.x * s, y0 + o.y * s, Math.max(1, o.w * s), Math.max(1, o.h * s));
    for (const z of game.zs.values()) {
      g.fillStyle = z.t === 3 ? '#ff6b2c' : z.t === 4 ? '#b5d43a' : '#e5484d';
      const sz = z.t === 3 ? 4 : z.t === 2 ? 3 : 2;
      g.fillRect(x0 + z.x * s - sz / 2, y0 + z.y * s - sz / 2, sz, sz);
    }
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

// ---------- ground ----------
function makeGround() {
  const s = 0.5;
  const cv = document.createElement('canvas');
  cv.width = MAP_W * s; cv.height = MAP_H * s;
  const g = cv.getContext('2d');
  g.scale(s, s);
  g.fillStyle = '#1b231d';
  g.fillRect(0, 0, MAP_W, MAP_H);
  g.strokeStyle = 'rgba(255,255,255,0.035)';
  g.lineWidth = 2;
  for (let x = 0; x <= MAP_W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, MAP_H); g.stroke(); }
  for (let y = 0; y <= MAP_H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(MAP_W, y); g.stroke(); }
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rnd() < 0.6 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.01)';
    g.beginPath(); g.arc(rnd() * MAP_W, rnd() * MAP_H, 20 + rnd() * 80, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#151a17';
  g.fillRect(0, MAP_H / 2 - 90, MAP_W, 180);
  g.fillRect(MAP_W / 2 - 90, 0, 180, MAP_H);
  g.strokeStyle = 'rgba(233,196,106,0.25)';
  g.lineWidth = 6;
  g.setLineDash([40, 40]);
  g.beginPath(); g.moveTo(0, MAP_H / 2); g.lineTo(MAP_W / 2 - 100, MAP_H / 2); g.moveTo(MAP_W / 2 + 100, MAP_H / 2); g.lineTo(MAP_W, MAP_H / 2); g.stroke();
  g.beginPath(); g.moveTo(MAP_W / 2, 0); g.lineTo(MAP_W / 2, MAP_H / 2 - 100); g.moveTo(MAP_W / 2, MAP_H / 2 + 100); g.lineTo(MAP_W / 2, MAP_H); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    let x = rnd() * MAP_W, y = rnd() * MAP_H;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; g.lineTo(x, y); }
    g.stroke();
  }
  // sandbag ring where the team starts
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    if (Math.abs(Math.sin(a * 2)) < 0.25) continue; // gaps on the roads
    g.save(); g.translate(MAP_W / 2 + Math.cos(a) * 140, MAP_H / 2 + Math.sin(a) * 140); g.rotate(a + Math.PI / 2);
    g.fillStyle = '#5b5440'; g.strokeStyle = '#3a3528'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.restore();
  }
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
  g.strokeStyle = '#2a2d27'; g.lineWidth = 3;
  for (const a of [0.8, 2.4, 4]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); g.stroke(); }
  g.fillStyle = '#4a4f45';
  g.fillRect(-11, -11, 22, 22);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 2;
  g.strokeRect(-11, -11, 22, 22);
  g.rotate(t.a);
  g.fillStyle = '#20241f';
  g.fillRect(0, -3.5, 24, 7);
  g.fillStyle = '#6b7266';
  g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  g.restore();
  if (t.life <= 5) {
    g.fillStyle = 'rgba(255,210,63,0.9)';
    g.font = '600 11px Rubik, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(t.life), t.x, t.y - 20);
  }
}

function drawMine(g, m, time) {
  const [, x, y, armed] = m;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(x + 2, y + 3, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3f4636';
  g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#22261d'; g.lineWidth = 2; g.stroke();
  g.fillStyle = armed ? '#7a1d17' : (Math.sin(time * 12) > 0 ? '#ffd23f' : '#5b5420');
  g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
}

// ---------- zombies ----------
function drawTelegraph(g, z, time) {
  if (z.st === ZS.WINDUP && z.t === 2) {
    const pulse = 0.25 + 0.2 * Math.sin(time * 20);
    g.save(); g.translate(z.x, z.y); g.rotate(z.cdir);
    g.fillStyle = `rgba(229,72,77,${pulse})`;
    g.fillRect(0, -ZTYPES[2].r, 380, ZTYPES[2].r * 2);
    g.restore();
  } else if (z.st === ZS.SLAM) {
    const pulse = 0.2 + 0.15 * Math.sin(time * 18);
    g.fillStyle = `rgba(229,72,77,${pulse})`;
    g.beginPath(); g.arc(z.x, z.y, 165, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(229,72,77,0.7)'; g.lineWidth = 3;
    g.stroke();
  }
}

function drawZombie(g, z, time) {
  const T = ZTYPES[z.t], r = T.r;
  const age = time - z.born;
  g.save();
  g.translate(z.x, z.y);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(3, 5, r, r * 0.85, 0, 0, Math.PI * 2); g.fill();
  if (age < 0.5) { const s = 0.4 + age * 1.2; g.scale(s, s); g.globalAlpha = age * 2; }
  if (z.dying) g.globalAlpha = 0.45;
  if (z.t === 3) {
    g.fillStyle = 'rgba(229,72,77,0.13)';
    g.beginPath(); g.arc(0, 0, r + 10 + Math.sin(time * 4) * 3, 0, Math.PI * 2); g.fill();
  }
  if (z.t === 4) {
    g.fillStyle = `rgba(159,191,42,${0.15 + (z.st === ZS.SPIT ? 0.25 : 0)})`;
    g.beginPath(); g.arc(0, 0, r + 8, 0, Math.PI * 2); g.fill();
  }
  g.rotate(z.face);
  const sway = Math.sin(z.walk + z.id) * 0.25;
  const fl = z.flash > 0;
  // feet
  g.fillStyle = '#1e211b';
  const st = Math.sin(z.walk) * r * 0.35;
  g.beginPath(); g.ellipse(st, -r * 0.4, r * 0.3, r * 0.2, 0, 0, Math.PI * 2); g.ellipse(-st, r * 0.4, r * 0.3, r * 0.2, 0, 0, Math.PI * 2); g.fill();
  // arms reaching forward
  g.strokeStyle = fl ? '#fff' : T.dark;
  g.lineWidth = r * 0.32;
  g.lineCap = 'round';
  const reach = z.t === 2 && z.st === ZS.DASH ? 0.6 : 1;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(r * 0.1, s * r * 0.62);
    g.lineTo(r * (0.9 + 0.35 * reach + s * sway * 0.4), s * r * (0.55 + sway * 0.3 * s));
    g.stroke();
  }
  g.fillStyle = fl ? '#fff' : T.col;
  for (const s of [-1, 1]) { g.beginPath(); g.arc(r * (0.9 + 0.35 * reach + s * sway * 0.4), s * r * (0.55 + sway * 0.3 * s), r * 0.2, 0, Math.PI * 2); g.fill(); }
  // torso: ragged shirt
  g.fillStyle = fl ? '#fff' : shirtOf(z);
  g.beginPath(); g.ellipse(-r * 0.1, 0, r * 0.62, r * 0.88, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.stroke();
  if (z.t === 2 || z.t === 3) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(-r * 0.25, 0, r * 0.4, r * 0.7, 0, 0, Math.PI * 2); g.fill();
  }
  if (z.t === 3) {
    g.fillStyle = '#3a1a14';
    for (const s of [-1, 1]) for (const k of [0.2, 0.55]) { g.beginPath(); g.moveTo(-r * k, s * r * 0.5); g.lineTo(-r * (k + 0.1), s * r * 1.05); g.lineTo(-r * (k - 0.12), s * r * 0.55); g.fill(); }
  }
  if (z.t === 4) {
    g.fillStyle = '#b5d43a';
    for (const [px, py] of [[-0.3, -0.4], [-0.45, 0.3], [0.05, 0.5]]) { g.beginPath(); g.arc(px * r, py * r, r * 0.18, 0, Math.PI * 2); g.fill(); }
  }
  // head
  g.fillStyle = fl ? '#fff' : T.col;
  g.beginPath(); g.arc(r * 0.25, 0, r * 0.42, 0, Math.PI * 2); g.fill();
  g.strokeStyle = T.dark; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.arc(r * 0.12, -r * 0.12, r * 0.18, 0, Math.PI * 2); g.fill();
  g.restore();
  if (z.hp < z.max && !z.dying) {
    const w = Math.max(24, r * 2), kk = clamp(z.hp / z.max, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(z.x - w / 2, z.y - r - 12, w, 4);
    g.fillStyle = z.t === 3 ? '#ff6b2c' : '#e5484d';
    g.fillRect(z.x - w / 2, z.y - r - 12, w * kk, 4);
  }
}

const SHIRTS = ['#4b4f5c', '#5c4a3d', '#3f5560', '#5b5a44', '#604040', '#45503f'];
function shirtOf(z) {
  if (z.t === 3) return '#5a2a22';
  if (z.t === 4) return '#5f6a2a';
  return SHIRTS[z.id % SHIRTS.length];
}

function drawEyes(g, z) {
  if (z.dying) return;
  const r = ZTYPES[z.t].r;
  const c = Math.cos(z.face), s = Math.sin(z.face);
  const hx = z.x + c * r * 0.42, hy = z.y + s * r * 0.42;
  const ex = -s * r * 0.17, ey = c * r * 0.17;
  const er = Math.max(1.4, r * 0.08);
  g.fillStyle = z.t === 4 ? 'rgba(181,212,58,0.95)' : 'rgba(255,60,48,0.95)';
  g.beginPath(); g.arc(hx + ex, hy + ey, er, 0, Math.PI * 2); g.arc(hx - ex, hy - ey, er, 0, Math.PI * 2); g.fill();
}

// ---------- players ----------
function drawPlayer(g, game, pid, p, info, alive) {
  const cls = info ? info.cls : 'asker';
  const col = info ? info.color : '#ccc';
  const fx = game.fx.get(pid);
  const fxk = fx && game.time < fx.until ? fx.k : (p.shield ? 'shield' : null);
  g.save();
  g.translate(p.x, p.y);
  if (alive && fxk) drawAura(g, fxk, game.time);
  g.scale(1.15, 1.15);
  drawCharacter(g, cls, col, alive ? p.a || 0 : 0.6, p.walk || 0, { alive, me: pid === game.me });
  g.restore();
}

function drawAura(g, k, time) {
  if (k === 'shield') {
    g.strokeStyle = 'rgba(160,196,255,0.8)'; g.lineWidth = 3;
    g.fillStyle = 'rgba(160,196,255,0.12)';
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + time; g.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); }
    g.closePath(); g.fill(); g.stroke();
  } else if (k === 'rage') {
    g.fillStyle = `rgba(255,107,44,${0.18 + 0.08 * Math.sin(time * 12)})`;
    g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
  } else if (k === 'focus') {
    g.strokeStyle = 'rgba(123,223,242,0.7)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 26, time * 2, time * 2 + 1.2); g.stroke();
    g.beginPath(); g.arc(0, 0, 26, time * 2 + Math.PI, time * 2 + Math.PI + 1.2); g.stroke();
  } else if (k === 'sprint') {
    g.fillStyle = 'rgba(158,240,26,0.15)';
    g.beginPath(); g.arc(0, 0, 25, 0, Math.PI * 2); g.fill();
  }
}

// Top-down soldier facing +x. Shared by the game and the lobby class cards.
export function drawCharacter(g, cls, color, angle, walk, opts = {}) {
  const alive = opts.alive !== false;
  const R = PLAYER_R;
  g.save();
  if (!alive) { g.globalAlpha = 0.6; color = '#6b706c'; }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.ellipse(3, 5, R, R * 0.9, 0, 0, Math.PI * 2); g.fill();
  if (opts.me && alive) {
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, R + 9, 0, Math.PI * 2); g.stroke();
  }
  g.rotate(angle);
  const dark = shade(color, -60);
  const stride = alive ? Math.sin(walk * 0.12) * 6 : 0;

  // feet
  g.fillStyle = '#1c1f1c';
  g.beginPath(); g.ellipse(stride, -6.5, 5.5, 3.5, 0, 0, Math.PI * 2); g.ellipse(-stride, 6.5, 5.5, 3.5, 0, 0, Math.PI * 2); g.fill();

  // gear on the back
  drawBack(g, cls, color);

  // torso
  g.fillStyle = cls === 'nisanci' ? '#3a4a30' : color;
  g.beginPath(); g.ellipse(-1, 0, 9.5, cls === 'tank' ? 16.5 : 15, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2.5; g.stroke();
  if (cls === 'nisanci') { // ghillie fringe in team colour
    g.strokeStyle = color; g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-4, i * 4); g.lineTo(-11, i * 4.5 + 1); g.stroke(); }
  }
  if (cls === 'tank') {
    g.fillStyle = '#5a6066';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(0, s * 13, 7, 5.5, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2d3135'; g.lineWidth = 1.5; g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-6, -7, 10, 14);
  }
  if (cls === 'bombaci') {
    g.strokeStyle = '#5a4630'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-6, -12); g.lineTo(5, 11); g.stroke();
    g.fillStyle = '#4a5a2a';
    for (const t of [0.25, 0.5, 0.75]) { g.beginPath(); g.arc(-6 + 11 * t, -12 + 23 * t, 2.6, 0, Math.PI * 2); g.fill(); }
  }
  if (cls === 'doktor') {
    g.fillStyle = '#fff'; g.fillRect(-3, 7, 6, 6);
    g.fillStyle = '#e5484d'; g.fillRect(-0.8, 7.8, 1.6, 4.4); g.fillRect(-2.2, 9.2, 4.4, 1.6);
  }
  if (cls === 'izci') {
    g.fillStyle = '#c0392b';
    g.beginPath(); g.ellipse(-3, 0, 5, 10, 0, 0, Math.PI * 2); g.fill();
  }

  // weapon and arms
  drawWeapon(g, cls);
  drawArms(g, cls, dark);

  // head and headgear
  g.fillStyle = SKIN;
  g.beginPath(); g.arc(1, 0, 6.5, 0, Math.PI * 2); g.fill();
  drawHead(g, cls, color);
  g.restore();
}

function drawBack(g, cls, color) {
  switch (cls) {
    case 'asker': g.fillStyle = '#4b5536'; rr(g, -17, -7, 8, 14, 2); g.fill(); break;
    case 'doktor':
      g.fillStyle = '#e8e6df'; rr(g, -18, -8, 9, 16, 2); g.fill();
      g.fillStyle = '#e5484d'; g.fillRect(-14.6, -4, 2.2, 8); g.fillRect(-17.5, -1.1, 8, 2.2); break;
    case 'tamirci':
      g.fillStyle = '#d9822b'; rr(g, -18, -8, 9, 16, 2); g.fill();
      g.strokeStyle = '#8a4b14'; g.lineWidth = 1.5; g.strokeRect(-17, -6, 7, 12); break;
    case 'tank': g.fillStyle = '#4a4f55'; rr(g, -19, -10, 10, 20, 3); g.fill(); g.strokeStyle = '#2d3135'; g.lineWidth = 1.5; g.stroke(); break;
    case 'alevci':
      for (const s of [-1, 1]) { g.fillStyle = '#b8352a'; rr(g, -20, s * 5 - 4, 11, 8, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-18, s * 5 - 3, 6, 1.5); }
      g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, 5); g.quadraticCurveTo(0, 14, 12, 6); g.stroke(); break;
    case 'bombaci':
      g.fillStyle = '#5a4630'; rr(g, -17, -7, 8, 14, 2); g.fill();
      g.fillStyle = '#4a5a2a'; for (const y of [-4, 0, 4]) { g.beginPath(); g.arc(-13, y, 2.4, 0, Math.PI * 2); g.fill(); } break;
    case 'izci': g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-16, 4, -20, -2); g.stroke(); break;
    default: break;
  }
  void color;
}

function drawWeapon(g, cls) {
  const M = '#191c19', W = '#6b4a2b';
  switch (cls) {
    case 'asker': g.fillStyle = M; g.fillRect(6, 1.5, 28, 5); g.fillRect(14, 6, 4, 5); g.fillStyle = '#2a2f2a'; g.fillRect(2, 2, 6, 4); break;
    case 'doktor': g.fillStyle = M; g.fillRect(6, 1.5, 20, 5); g.fillRect(12, 6, 3, 6); break;
    case 'tamirci': g.fillStyle = W; g.fillRect(2, 1.5, 10, 6); g.fillStyle = M; g.fillRect(10, 2, 22, 4.5); g.fillStyle = '#3a2a1a'; g.fillRect(16, 2, 6, 5); break;
    case 'nisanci': g.fillStyle = W; g.fillRect(2, 2, 10, 5); g.fillStyle = M; g.fillRect(10, 3, 32, 3.5); g.fillStyle = '#0d0f0d'; g.fillRect(14, 0, 10, 2.5); g.fillStyle = '#7bdff2'; g.fillRect(23, 0.5, 1.5, 1.5); break;
    case 'tank':
      g.fillStyle = '#2a2d2a'; g.fillRect(4, 0, 16, 8);
      g.fillStyle = M; for (const y of [0.8, 3.2, 5.6]) g.fillRect(18, y, 18, 1.8);
      g.fillStyle = '#3d423d'; g.fillRect(30, 0, 3, 8); break;
    case 'alevci': g.fillStyle = '#2c2c2c'; g.fillRect(4, 1, 24, 6.5); g.fillStyle = '#b8352a'; g.fillRect(10, 7, 6, 4); g.fillStyle = '#ff9a3c'; g.fillRect(28, 2.5, 3, 3.5); break;
    case 'bombaci': g.fillStyle = '#3f4a2a'; g.fillRect(4, 0, 26, 9); g.fillStyle = '#1e2414'; g.beginPath(); g.arc(30, 4.5, 4.5, 0, Math.PI * 2); g.fill(); break;
    case 'izci': g.fillStyle = M; g.fillRect(12, -9, 13, 4); g.fillRect(12, 5, 13, 4); break;
    default: break;
  }
}

function drawArms(g, cls, dark) {
  g.strokeStyle = dark;
  g.lineWidth = 5;
  g.lineCap = 'round';
  const hand = (x, y) => { g.fillStyle = SKIN; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); };
  if (cls === 'izci') {
    g.beginPath(); g.moveTo(1, -11); g.lineTo(12, -7); g.moveTo(1, 11); g.lineTo(12, 7); g.stroke();
    hand(12, -7); hand(12, 7);
    return;
  }
  const front = { asker: 22, doktor: 18, tamirci: 20, nisanci: 24, tank: 16, alevci: 20, bombaci: 20 }[cls] || 20;
  g.beginPath(); g.moveTo(1, 12); g.lineTo(9, 5); g.moveTo(1, -12); g.lineTo(front, 3); g.stroke();
  hand(9, 5); hand(front, 3);
}

function drawHead(g, cls, color) {
  switch (cls) {
    case 'asker':
      g.fillStyle = '#4f5a3a'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 6, Math.PI * 0.6, Math.PI * 1.4); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke(); break;
    case 'doktor':
      g.fillStyle = '#ecebe6'; g.beginPath(); g.arc(0, 0, 7.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e5484d'; g.fillRect(-1, -4, 2, 8); g.fillRect(-4, -1, 8, 2); break;
    case 'tamirci':
      g.fillStyle = '#f2c230'; g.beginPath(); g.arc(-0.5, 0, 8.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#b8901a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
      g.fillStyle = '#f2c230'; g.fillRect(5, -5, 4, 10); break;
    case 'nisanci':
      g.fillStyle = '#2f3b2a'; g.beginPath(); g.arc(-1, 0, 8.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = SKIN; g.beginPath(); g.arc(4, 0, 3.4, -1.2, 1.2); g.fill(); break;
    case 'tank':
      g.fillStyle = '#5a6066'; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2d3135'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#111'; g.fillRect(5, -4.5, 2.5, 9); break;
    case 'alevci':
      g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6b6b6b'; for (const s of [-1, 1]) { g.beginPath(); g.arc(6, s * 3.6, 2.6, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ff9a3c'; g.fillRect(3, -2.5, 1.5, 5); break;
    case 'bombaci':
      g.fillStyle = '#7a2e2e'; g.beginPath(); g.arc(-0.5, 0, 7.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9a4040'; g.beginPath(); g.arc(-2.5, 0, 2.4, 0, Math.PI * 2); g.fill(); break;
    case 'izci':
      g.fillStyle = '#c8b98a'; g.beginPath(); g.arc(-0.5, 0, 7.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a8996a'; rr(g, 4, -5.5, 6, 11, 3); g.fill(); break;
    default: break;
  }
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => clamp(((n >> s) & 255) + amt, 0, 255);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function drawTag(g, p, info, isMe) {
  if (!info) return;
  const y = p.y - PLAYER_R - 14;
  g.font = '600 12px Rubik, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.75)';
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
