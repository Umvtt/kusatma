// Canvas drawing: an abandoned plaza at night, seen from above, lit by the team's flashlights.
import { WORLD_W, WORLD_H, CX, CY, areaFor, MAPS, PLAYER_R, QUICK, CLASSES, ZTYPES, ZS, CHARGE, ITEMS, ROMAN, isBoss, clamp, TEAM_COL, weaponOf } from './config.js';
import { WORLD, obstaclesIn } from './world.js';
import { SETTINGS, QUALITY } from './settings.js';
import { ITEMS as COS } from './catalog.js';
import { generateMap } from './mapgen.js';

const DECAL_SCALE = 0.4;
const MINI_W = 180;
const SKIN = '#d9a77a';
// extra shading and small details on characters and zombies (off on the low graphics level)
let DETAIL = true;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ground = null;
    this.mapKey = '';
    this.decal = document.createElement('canvas');
    this.decal.width = WORLD_W * DECAL_SCALE;
    this.decal.height = WORLD_H * DECAL_SCALE;
    this.dctx = this.decal.getContext('2d');
    this.lightCv = document.createElement('canvas');
    this.lctx = this.lightCv.getContext('2d');
    this.lastT = performance.now();
    this.fadeT = 0; this.checkT = 0;
    // phones under memory pressure can throw away an off-screen picture; rebuild it instead of drawing nothing
    for (const c of [this.decal, this.lightCv]) c.addEventListener('contextrestored', () => { this.mapKey = ''; });
    canvas.addEventListener('contextrestored', () => { this.mapKey = ''; });
    this.resize();
  }

  // graphics level: screen sharpness and light-map size
  setQuality(q) {
    DETAIL = q !== 'low';
    if (this.q === q) return;
    this.q = q; this.resize();
  }

  resize() {
    const Q = QUALITY[this.q || 'high'] || QUALITY.high;
    this.dpr = Math.min(Q.dpr, window.devicePixelRatio || 1);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
    this.lightW = Q.light;
    this.lightCv.width = Math.ceil(this.vw / Q.light);
    this.lightCv.height = Math.ceil(this.vh / Q.light);
  }

  // Rebuild the ground picture when the map changes.
  syncMap() {
    const key = WORLD.theme + ':' + WORLD.seed;
    if (!WORLD.theme || key === this.mapKey) return;
    this.mapKey = key;
    this.ground = makeGround(WORLD.theme, WORLD.seed, WORLD.decor);
    this.ground.addEventListener('contextrestored', () => { this.mapKey = ''; });
    this.clearDecals();
  }

  // Blood and scorch marks fade out over about a minute and a half; every few seconds check the ground
  // picture still has pixels (a dropped canvas reads back as transparent) and rebuild it if not.
  upkeep(dt) {
    this.fadeT += dt;
    if (this.fadeT >= 1.5) {
      this.fadeT = 0;
      const g = this.dctx;
      g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.025)'; g.fillRect(0, 0, this.decal.width, this.decal.height); g.restore();
    }
    this.checkT += dt;
    if (this.checkT >= 5 && this.ground) {
      this.checkT = 0;
      try {
        if (!this.probe) { this.probe = document.createElement('canvas'); this.probe.width = this.probe.height = 1; this.pctx = this.probe.getContext('2d', { willReadFrequently: true }); }
        this.pctx.clearRect(0, 0, 1, 1); this.pctx.drawImage(this.ground, 4, 4, 1, 1, 0, 0, 1, 1);
        const px = this.pctx.getImageData(0, 0, 1, 1).data;
        if (px[3] === 0) { this.mapKey = ''; this.syncMap(); }
      } catch (e) { /* ignore */ }
      if (this.ctx.isContextLost && this.ctx.isContextLost()) this.ctx = this.cv.getContext('2d');
    }
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
    else if (S.alive && SETTINGS.lead && !game.touch) {
      fx += clamp((game.input.mx - vw / 2) / scale, -400, 400) * 0.18;
      fy += clamp((game.input.my - vh / 2) / scale, -300, 300) * 0.18;
    }
    const cam = game.cam;
    const k = 1 - Math.exp(-dt * (game.spectate != null ? 4 : 10));
    cam.x += (fx - cam.x) * k;
    cam.y += (fy - cam.y) * k;
    cam.scale = scale; cam.vw = vw; cam.vh = vh;
    const sh = SETTINGS.shake ? game.shake : 0;
    const ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;

    const world = (ctx, s) => { ctx.translate(vw / 2 * s + ox * s, vh / 2 * s + oy * s); ctx.scale(scale * s, scale * s); ctx.translate(-cam.x, -cam.y); };
    g.save();
    world(g, 1);
    const view = { l: cam.x - vw / 2 / scale - 80, r: cam.x + vw / 2 / scale + 80, t: cam.y - vh / 2 / scale - 80, b: cam.y + vh / 2 / scale + 80 };
    const inView = (x, y) => x > view.l && x < view.r && y > view.t && y < view.b;

    this.syncMap();
    { const now = performance.now(); this.upkeep(Math.min(0.1, (now - (this.upT || now)) / 1000)); this.upT = now; }
    if (this.ground) g.drawImage(this.ground, 0, 0, WORLD_W, WORLD_H);
    g.drawImage(this.decal, 0, 0, WORLD_W, WORLD_H);

    for (const o of new Set(obstaclesIn(view.l - 60, view.t - 60, view.r + 60, view.b + 60))) drawObstacle(g, o);
    for (const q of game.zones) if (inView(q[2], q[3])) drawZone(g, q, game.time);
    for (const m of game.mines) drawMine(g, m, game.time);
    for (const it of game.items) if (inView(it[2], it[3])) drawItem(g, it, game.time);
    for (const mk of game.marks) drawStrikeMark(g, mk);
    for (const t of game.ts.values()) drawTurret(g, t, game.time);

    // downed players lie under everything
    for (const [pid, p] of game.ps) if (!p.alive && inView(p.x, p.y)) drawPlayer(g, game, pid, p, roster.get(pid), false);

    // warnings before big attacks
    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawTelegraph(g, z, game.time);
    for (const z of game.zs.values()) if (inView(z.x, z.y)) drawZombie(g, z, game.time);

    petsStep(game, roster);
    for (const [pid, q] of game.pets) { const p = game.ps.get(pid); if (p && inView(q.x, q.y)) { g.save(); g.translate(q.x, q.y); g.scale(1.5, 1.5); drawPet(g, q.id, 0, 0, q.a, game.time, q.mv, p.alive); g.restore(); } }
    for (const [pid, p] of game.ps) if (p.alive && inView(p.x, p.y)) drawPlayer(g, game, pid, p, roster.get(pid), true);
    for (const w of game.walls) if (inView(w[1], w[2])) drawWall(g, w);
    if (game.trains && game.trains.length) for (const q of game.trains) drawTrain(g, q, view, game.time);
    for (const l of game.lobs) drawLob(g, l);

    // projectiles
    g.lineCap = 'round';
    for (const b of game.bullets) {
      if (b.kind === 'f') continue;
      if (b.look === 'orb') { // plasma and EMP balls: a glowing core with a halo
        const pul = 0.75 + 0.25 * Math.sin(game.time * 30 + b.x * 0.05);
        g.globalAlpha = 0.35; g.fillStyle = b.col || '#c77dff'; g.beginPath(); g.arc(b.x, b.y, 10 * pul, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(b.x, b.y, 3.6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = b.col || '#c77dff'; g.lineWidth = 1.6; g.beginPath(); g.arc(b.x, b.y, 6, 0, Math.PI * 2); g.stroke(); continue;
      }
      if (b.look === 'wave') { // the sword's flying slash
        const a = Math.atan2(b.vy, b.vx), k = Math.max(0, b.life / b.max);
        g.save(); g.translate(b.x, b.y); g.rotate(a); g.globalAlpha = 0.85 * k; g.strokeStyle = b.col || '#e8f1ff'; g.lineWidth = 4;
        g.beginPath(); g.arc(-10, 0, 26, -1.1, 1.1); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); g.restore(); g.globalAlpha = 1; continue;
      }
      if (b.kind === 'g') {
        g.fillStyle = '#3d4a2a';
        g.beginPath(); g.arc(b.x, b.y, 5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,200,120,0.35)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04); g.lineTo(b.x, b.y); g.stroke();
        continue;
      }
      if (b.look === 'bolt') { // crossbow bolt
        const a = Math.atan2(b.vy, b.vx); g.save(); g.translate(b.x, b.y); g.rotate(a);
        g.strokeStyle = '#d8c7a0'; g.lineWidth = 2; g.beginPath(); g.moveTo(-16, 0); g.lineTo(2, 0); g.stroke();
        g.fillStyle = '#cfd4d8'; g.beginPath(); g.moveTo(6, 0); g.lineTo(0, -3); g.lineTo(0, 3); g.fill();
        g.fillStyle = '#c0392b'; g.fillRect(-17, -2.5, 4, 1.5); g.fillRect(-17, 1, 4, 1.5); g.restore(); continue;
      }
      if (b.look === 'arc') { // tesla spark
        g.strokeStyle = '#bff3ff'; g.lineWidth = 2.2; g.globalAlpha = 0.95; g.beginPath(); g.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025);
        for (let i = 1; i <= 3; i++) { const k = 0.025 * (1 - i / 3); g.lineTo(b.x - b.vx * k + (Math.random() - 0.5) * 6, b.y - b.vy * k + (Math.random() - 0.5) * 6); }
        g.stroke(); g.fillStyle = '#7ad8ff'; g.beginPath(); g.arc(b.x, b.y, 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; continue;
      }
      if (b.look === 'nail') { g.strokeStyle = '#c9ced3'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(b.x - b.vx * 0.008, b.y - b.vy * 0.008); g.lineTo(b.x, b.y); g.stroke(); continue; }
      if (b.look === 'rail') { g.strokeStyle = 'rgba(122,216,255,0.9)'; g.lineWidth = 5; g.beginPath(); g.moveTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); g.lineTo(b.x, b.y); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke(); continue; }
      if (b.col) { g.strokeStyle = b.col; g.globalAlpha = b.own ? 0.95 : 0.75; }
      else g.strokeStyle = b.own ? 'rgba(255,224,150,0.95)' : 'rgba(255,214,140,0.7)';
      const tl = 0.022 * (b.tier >= 3 ? 1.5 : 1);
      g.lineWidth = b.w * (b.crit ? 1.6 : 1) + (b.tier >= 5 ? 0.8 : 0);
      g.beginPath();
      g.moveTo(b.x - b.vx * tl, b.y - b.vy * tl);
      g.lineTo(b.x, b.y);
      g.stroke();
      if (b.crit || b.tier >= 5) { g.strokeStyle = '#fff'; g.globalAlpha = 0.8; g.lineWidth = Math.max(1, b.w * 0.45); g.beginPath(); g.moveTo(b.x - b.vx * 0.01, b.y - b.vy * 0.01); g.lineTo(b.x, b.y); g.stroke(); }
      g.globalAlpha = 1;
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
      } else if (p.kind === 'slash') { // a sword swing: the blade's path as a crescent that sweeps across the arc
        g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        const t = 1 - kk, e = 1 - (1 - Math.min(1, t * 1.6)) ** 3, A = p.arc || 1, dir = p.sd ? -1 : 1;
        const a0 = dir * A, a1 = dir * (A - 2 * A * e), lo = Math.min(a0, a1), hi = Math.max(a0, a1), R = p.size, Ri = R * 0.38;
        if (hi - lo > 0.02) {
          // the swept area: soft fill fading out behind the blade
          const gr = g.createRadialGradient(0, 0, Ri, 0, 0, R);
          gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, p.col); gr.addColorStop(1, 'rgba(255,255,255,0.9)');
          g.globalAlpha = 0.32 * kk; g.fillStyle = gr;
          g.beginPath(); g.arc(0, 0, R, lo, hi); g.arc(0, 0, Ri, hi, lo, true); g.closePath(); g.fill();
          // the outer edge, brightest where the blade is now
          g.lineCap = 'round'; g.strokeStyle = p.col;
          g.globalAlpha = 0.85 * kk; g.lineWidth = 5;
          g.beginPath(); g.arc(0, 0, R * 0.97, lo, hi); g.stroke();
          g.globalAlpha = kk; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
          const lead = a1, back = a1 - dir * Math.min(0.5, hi - lo);
          g.beginPath(); g.arc(0, 0, R * 0.97, Math.min(lead, back), Math.max(lead, back)); g.stroke();
          // the blade itself at its current angle, and a spark at the tip
          g.globalAlpha = kk; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(Math.cos(a1) * Ri, Math.sin(a1) * Ri); g.lineTo(Math.cos(a1) * R, Math.sin(a1) * R); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(Math.cos(a1) * R, Math.sin(a1) * R, 3.5 * kk + 1, 0, Math.PI * 2); g.fill();
        }
        g.restore(); g.globalAlpha = 1; g.lineCap = 'butt';
      } else if (p.kind === 'shard') {
        g.globalAlpha = kk;
        g.fillStyle = p.col;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a + kk * 4);
        g.beginPath(); g.moveTo(-p.size, 0); g.lineTo(0, -p.size * 0.5); g.lineTo(p.size * 1.4, 0); g.lineTo(0, p.size * 0.5); g.closePath(); g.fill();
        g.restore();
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
    // everything outside the playable area is fenced off and dark; it lifts as the map grows
    const B = WORLD.bounds;
    g.fillStyle = 'rgba(4,6,5,0.78)';
    g.beginPath();
    g.rect(view.l - 200, view.t - 200, view.r - view.l + 400, view.b - view.t + 400);
    g.rect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(255,107,44,0.45)';
    g.lineWidth = 4;
    g.setLineDash([24, 18]);
    g.strokeRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    g.setLineDash([]);
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
      if (b.frost) g.fillStyle = age < 0.35 ? '#e6fbff' : age < 0.7 ? '#7bdff2' : '#2a6fb0';
      else g.fillStyle = age < 0.35 ? '#ffd166' : age < 0.7 ? '#ff8c3a' : '#c2410c';
      g.beginPath(); g.arc(b.x, b.y, 5 + age * 16, 0, Math.PI * 2); g.fill();
    }
    for (const z of game.zaps) drawZap(g, z);
    for (const q of game.zones) if (q[1] === 1 && inView(q[2], q[3])) {
      g.globalAlpha = 0.18 * Math.min(1, q[5] * 3);
      g.fillStyle = '#ff7a2c';
      g.beginPath(); g.arc(q[2], q[3], q[4] * 0.9, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
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
    for (const q of game.planes) drawPlane(g, q);
    for (const [pid, p] of game.ps) if (inView(p.x, p.y)) drawTag(g, p, roster.get(pid), pid === game.me, game);
    // teammates' map pings: a pulsing marker with the message's sign, fading after 5 s
    if (game.pings) for (const q of game.pings) {
      const age = game.time - q.t; if (age > 5) continue; const Q = QUICK[q.k]; if (!Q) continue;
      const a = Math.min(1, (5 - age) / 1.2), pulse = (age * 1.6) % 1;
      g.globalAlpha = a * (1 - pulse) * 0.8; g.strokeStyle = Q.col; g.lineWidth = 3;
      g.beginPath(); g.arc(q.x, q.y, 14 + pulse * 46, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = a; g.fillStyle = 'rgba(10,14,12,0.75)'; g.beginPath(); g.arc(q.x, q.y - 26, 15, 0, Math.PI * 2); g.fill();
      g.strokeStyle = Q.col; g.lineWidth = 2.5; g.stroke();
      g.beginPath(); g.moveTo(q.x - 6, q.y - 13); g.lineTo(q.x, q.y - 3); g.lineTo(q.x + 6, q.y - 13); g.fillStyle = Q.col; g.fill();
      g.fillStyle = Q.col; g.font = '700 16px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(Q.ic, q.x, q.y - 26);
      const r = roster.get(q.pid); if (r) { g.font = '700 11px Rubik, system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(r.name, q.x, q.y - 50); }
      g.textBaseline = 'alphabetic'; g.globalAlpha = 1;
    }
    // what each player just said (quick messages): a bubble over their head for 3 s
    if (game.qmSay) for (const [pid, m] of game.qmSay) {
      const p = game.ps.get(pid), age = game.time - m.t, Q = QUICK[m.k]; if (!p || !Q || age > 3 || !inView(p.x, p.y)) continue;
      g.globalAlpha = Math.min(1, (3 - age) / 0.5); g.font = '700 12px Rubik, system-ui, sans-serif'; g.textAlign = 'center';
      const txt = Q.ic + ' ' + Q.t, w = g.measureText(txt).width + 16, x = p.x, y = p.y - PLAYER_R - 46 - Math.min(1, age * 6) * 4;
      g.fillStyle = 'rgba(10,14,12,0.85)'; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - 12, w, 22, 11) : g.rect(x - w / 2, y - 12, w, 22); g.fill();
      g.strokeStyle = Q.col; g.lineWidth = 1.5; g.stroke(); g.fillStyle = Q.col; g.fillText(txt, x, y + 4); g.globalAlpha = 1;
    }
    g.font = '700 14px Rubik, system-ui, sans-serif'; g.textAlign = 'center';
    for (const t of game.texts) {
      g.font = t.small ? '700 12px Rubik, system-ui, sans-serif' : '700 14px Rubik, system-ui, sans-serif';
      g.globalAlpha = Math.max(0, 1 - t.t / 1.2);
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(t.txt, t.x + 1, t.y + 1);
      g.fillStyle = t.col; g.fillText(t.txt, t.x, t.y);
    }
    g.globalAlpha = 1;
    g.restore();

    // screen-space overlays
    if (game.mev && game.mev[0] === 'moon') {
      const pulse = 0.12 + 0.03 * Math.sin(game.time * 2);
      const grad = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.2, vw / 2, vh / 2, Math.max(vw, vh) * 0.8);
      grad.addColorStop(0, `rgba(150,10,20,${pulse * 0.5})`); grad.addColorStop(1, `rgba(150,10,20,${pulse * 2})`);
      g.fillStyle = grad; g.fillRect(0, 0, vw, vh);
    }
    if (game.hurt > 0.01 || (S.alive && S.inGame && S.hp / S.maxHp < 0.3)) {
      const low = S.alive && S.hp / S.maxHp < 0.3 ? 0.25 + 0.1 * Math.sin(game.time * 6) : 0;
      const a = Math.min(0.65, game.hurt * 0.55 + low);
      const grad = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      grad.addColorStop(0, 'rgba(160,20,20,0)');
      grad.addColorStop(1, `rgba(160,20,20,${a})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, vw, vh);
    }
    if (game.dmgDir && game.dmgDir.length && S.alive) { // where PvP hits came from
      for (const d of game.dmgDir) {
        const k = Math.min(1, d.t / 0.9), R = Math.min(vw, vh) * 0.28;
        g.save(); g.translate(vw / 2, vh / 2); g.rotate(d.a);
        g.fillStyle = `rgba(255,70,70,${0.75 * k})`;
        g.beginPath(); g.moveTo(R + 26, 0); g.lineTo(R, -16); g.lineTo(R + 6, 0); g.lineTo(R, 16); g.closePath(); g.fill();
        g.restore();
      }
    }
    this.drawMates(g, game, roster);
    this.drawMinimap(g, game, roster);
    if (S.inGame && S.alive && !game.touch) this.drawCrosshair(g, game);
  }

  drawLights(game, world, inView) {
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.lightCv.width, this.lightCv.height);
    const blk = !!(game.mev && game.mev[0] === 'dark'), gk = blk ? 0.6 : 1;
    l.fillStyle = blk ? 'rgba(2,3,6,0.97)' : `rgba(4,7,12,${SETTINGS.darkness / 100})`;
    l.fillRect(0, 0, this.lightCv.width, this.lightCv.height);
    l.save();
    world(l, 1 / (this.lightW || 2));
    l.globalCompositeOperation = 'destination-out';
    const glow = (x, y, r, a) => {
      const gr = l.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = gr;
      l.beginPath(); l.arc(x, y, r, 0, Math.PI * 2); l.fill();
    };
    for (const p of game.ps.values()) {
      if (!inView(p.x, p.y) && !p.alive) continue;
      glow(p.x, p.y, (p.alive ? 190 : 90) * gk, p.alive ? 0.95 : 0.5);
      if (!p.alive) continue;
      // flashlight cone
      const len = blk ? 380 : 560, half = blk ? 0.34 : 0.42;
      const gr = l.createRadialGradient(p.x, p.y, 20, p.x, p.y, len);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = gr;
      l.beginPath(); l.moveTo(p.x, p.y); l.arc(p.x, p.y, len, p.a - half, p.a + half); l.closePath(); l.fill();
    }
    for (const t of game.ts.values()) glow(t.x, t.y, 90, 0.6);
    for (const it of game.items) glow(it[2], it[3], 70, 0.7);
    for (const q of game.spits.values()) glow(q.x, q.y, 50, 0.6);
    for (const li of game.lights) glow(li.x, li.y, li.r, Math.min(1, li.life / li.max + 0.2));
    for (const b of game.bullets) if (b.kind === 'f' && inView(b.x, b.y)) glow(b.x, b.y, 50, 0.35);
    for (const q of game.zones) if (q[1] === 1 && inView(q[2], q[3])) glow(q[2], q[3], q[4] * 1.6, 0.5);
    for (const z of game.zaps) for (let i = 0; i + 1 < z.pts.length; i += 2) glow(z.pts[i], z.pts[i + 1], 80, 0.5);
    for (const z of game.zs.values()) if (z.fl & 8 && inView(z.x, z.y)) glow(z.x, z.y, 45, 0.35);
    for (const m of game.marks) glow(m.x, m.y, 160, 0.4);
    l.restore();
  }

  // Arrows on the screen edge pointing at teammates you can't see. Downed ones pulse red.
  drawMates(g, game, roster) {
    const c = game.cam, m = 34;
    const pv = game.pv;
    for (const [pid, p] of game.ps) {
      if (pid === game.me || (pv && (pv[0] === 'ffa' || p.tm !== game.self.tm))) continue;
      const sx = (p.x - c.x) * c.scale + c.vw / 2, sy = (p.y - c.y) * c.scale + c.vh / 2;
      if (sx > 0 && sx < c.vw && sy > 0 && sy < c.vh) continue;
      const info = roster.get(pid);
      const dx = sx - c.vw / 2, dy = sy - c.vh / 2;
      // place on a ring around the player so the HUD never covers it
      const a = Math.atan2(dy, dx), ring = Math.min(c.vw, c.vh) * 0.36 - m;
      const ax = c.vw / 2 + Math.cos(a) * ring, ay = c.vh / 2 + Math.sin(a) * ring;
      const down = !p.alive;
      g.save(); g.translate(ax, ay);
      if (down) { g.globalAlpha = 0.6 + 0.4 * Math.sin(game.time * 6); }
      g.fillStyle = 'rgba(10,14,12,0.8)';
      g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
      g.strokeStyle = down ? '#e5484d' : (info ? info.color : '#fff'); g.lineWidth = 2; g.stroke();
      g.rotate(a);
      g.fillStyle = down ? '#e5484d' : (info ? info.color : '#fff');
      g.beginPath(); g.moveTo(19, 0); g.lineTo(12, -5); g.lineTo(12, 5); g.closePath(); g.fill();
      g.rotate(-a);
      g.fillStyle = down ? '#e5484d' : '#ece6d6';
      g.font = '700 11px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(down ? '+' : (info ? info.name.slice(0, 1).toLocaleUpperCase('tr-TR') : '?'), 0, 0.5);
      g.restore();
    }
    g.globalAlpha = 1; g.textBaseline = 'alphabetic';
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
    if (game.killMark > 0) {
      g.strokeStyle = `rgba(255,60,60,${Math.min(1, game.killMark * 3)})`; g.lineWidth = 4;
      const a = gap + 4, b = gap + 16;
      g.beginPath(); g.moveTo(x - a, y - a); g.lineTo(x - b, y - b); g.moveTo(x + a, y - a); g.lineTo(x + b, y - b); g.moveTo(x - a, y + a); g.lineTo(x - b, y + b); g.moveTo(x + a, y + a); g.lineTo(x + b, y + b); g.stroke();
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
    const B = WORLD.bounds;
    const bw = B.x1 - B.x0, bh = B.y1 - B.y0;
    const w = game.touch && this.vw < 760 ? 130 : game.touch && this.vh < 420 ? 155 : MINI_W, s = w / bw, h = bh * s;
    const x0 = this.vw - w - 16, y0 = 16;
    // the kill feed sits right under the minimap, whatever its height
    { const b = Math.round(y0 + h + 10); if (Math.abs(b - (this.mmB || 0)) > 3) { this.mmB = b; document.documentElement.style.setProperty('--mm-b', b + 'px'); } }
    const mx = (x) => x0 + (x - B.x0) * s, my = (y) => y0 + (y - B.y0) * s;
    g.fillStyle = 'rgba(10,14,12,0.78)';
    g.fillRect(x0, y0, w, h);
    g.strokeStyle = 'rgba(236,230,214,0.18)';
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    g.fillStyle = 'rgba(236,230,214,0.16)';
    for (const o of new Set(obstaclesIn(B.x0, B.y0, B.x1, B.y1))) g.fillRect(mx(o.x), my(o.y), Math.max(1, o.w * s), Math.max(1, o.h * s));
    if (game.zf) for (const [t, x8, y8] of game.zf) { g.fillStyle = isBoss(t) ? '#ff6b2c' : '#e5484d'; const sz = isBoss(t) ? 5 : 2; g.fillRect(mx(x8 * 8) - sz / 2, my(y8 * 8) - sz / 2, sz, sz); }
    else for (const z of game.zs.values()) {
      g.fillStyle = isBoss(z.t) ? '#ff6b2c' : z.t === 4 ? '#b5d43a' : z.t === 7 ? '#c08ae0' : '#e5484d';
      const sz = isBoss(z.t) ? 5 : z.t === 2 || z.t === 6 ? 3 : 2;
      g.fillRect(mx(z.x) - sz / 2, my(z.y) - sz / 2, sz, sz);
    }
    const pv = game.pv, cam = game.cam;
    for (const [pid, p] of game.ps) {
      const r = roster.get(pid);
      const foe = pv && pid !== game.me && (pv[0] === 'ffa' || p.tm !== game.self.tm);
      if (foe && (!p.alive || (p.pfl & 2) || Math.abs(p.x - cam.x) > cam.vw / 2 / cam.scale + 60 || Math.abs(p.y - cam.y) > cam.vh / 2 / cam.scale + 60)) continue;
      g.fillStyle = !p.alive ? '#666' : pv ? (pid === game.me ? '#ffffff' : foe ? '#ff5a5f' : '#4cc9f0') : (r ? r.color : '#fff');
      g.beginPath();
      g.arc(mx(p.x), my(p.y), pid === game.me ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
      if (pid === game.me) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
    }
    if (game.pings) for (const q of game.pings) { const age = game.time - q.t, Q = QUICK[q.k]; if (age > 5 || !Q) continue; g.strokeStyle = Q.col; g.lineWidth = 2; g.globalAlpha = 0.6 + 0.4 * Math.sin(game.time * 10); g.beginPath(); g.arc(mx(q.x), my(q.y), 5, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
    const c = game.cam;
    g.strokeStyle = 'rgba(236,230,214,0.4)';
    g.strokeRect(mx(c.x - c.vw / 2 / c.scale), my(c.y - c.vh / 2 / c.scale), (c.vw / c.scale) * s, (c.vh / c.scale) * s);
    g.restore();
  }
}

// ---------- ground ----------
const GROUND_BASE = { meydan: '#1b231d', benzinlik: '#1c201e', hastane: '#1e2a1b', orman: '#18221a', liman: '#1d2328', kar: '#46525c', metro: '#16181d', avm: '#2b2a30', us: '#2c2a1f', luna: '#191624' };
// the lobby's little map preview: the starting area of the map from a fixed seed, drawn once per map
const PV = new Map();
const PV_COL = { su: '#2a5d86', agac: '#2f5a2e', cam: '#2c5233', kaya: '#6d6a62', kutuk: '#5a4430', kasa: '#8a6a3c', beton: '#8d8a80', cit: '#a89b7c', wood: '#8a6a3c', kumtorba: '#b39a63', kule: '#6b5a3c', cadir: '#5d6b3c', tank: '#4c5340', konteyner: '#9a4d36', pompa: '#c94a3a', stand: '#c98a3a', saksi: '#4f7a3e', atli: '#c95a9a', bufe: '#d9a13a' };
export function drawMapPreview(cv, theme) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  if (!MAPS[theme]) {
    g.fillStyle = '#16191b'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(236,230,214,.55)'; g.font = `700 ${Math.round(H * 0.42)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', W / 2, H / 2 + 2);
    return;
  }
  let img = PV.get(theme);
  if (!img) {
    img = document.createElement('canvas'); img.width = W; img.height = H;
    const c = img.getContext('2d'), m = generateMap(theme, 20251), a = areaFor(4);
    const x0 = CX - a.w / 2, y0 = CY - a.h / 2, s = Math.min(W / a.w, H / a.h);
    c.fillStyle = GROUND_BASE[theme] || '#1b231d'; c.fillRect(0, 0, W, H);
    c.save(); c.translate((W - a.w * s) / 2, (H - a.h * s) / 2); c.scale(s, s); c.translate(-x0, -y0);
    for (const d of m.decor) {
      if (d.k === 'road' || d.k === 'path' || d.k === 'track' || d.k === 'rail') { c.fillStyle = d.k === 'path' ? 'rgba(200,180,140,.18)' : 'rgba(255,255,255,.08)'; c.fillRect(d.x, d.y, d.w, d.h); }
      else if (d.k === 'water' || d.k === 'lake' || d.k === 'sea') { c.fillStyle = '#2a5d86'; if (d.r) { c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill(); } else c.fillRect(d.x, d.y, d.w, d.h); }
    }
    for (const o of m.obstacles) {
      c.fillStyle = o.c || PV_COL[o.k] || 'rgba(214,208,192,.55)';
      if (o.k === 'agac' || o.k === 'cam' || o.k === 'kaya') { c.beginPath(); c.arc(o.x + o.w / 2, o.y + o.h / 2, Math.max(o.w, o.h) / 2 + 10, 0, 7); c.fill(); } else c.fillRect(o.x, o.y, o.w, o.h);
    }
    c.fillStyle = '#ff6b2c'; c.beginPath(); c.arc(CX, CY, 46, 0, 7); c.fill();
    c.restore();
    PV.set(theme, img);
  }
  g.drawImage(img, 0, 0);
}
const GROUND_SCALE = 0.38; // the whole map's ground in one canvas: about the same memory as before the map grew
function makeGround(theme, seed, decor) {
  const s = GROUND_SCALE;
  const cv = document.createElement('canvas');
  cv.width = WORLD_W * s; cv.height = WORLD_H * s;
  const g = cv.getContext('2d');
  g.scale(s, s);
  let st = (seed >>> 0) || 7;
  const rnd = () => { st = (st * 16807) % 2147483647; return st / 2147483647; };
  const base = GROUND_BASE[theme] || '#1b231d';
  g.fillStyle = base;
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  const blotches = (n, dark, light, rmin, rmax) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = rnd() < 0.6 ? dark : light;
      g.beginPath(); g.arc(rnd() * WORLD_W, rnd() * WORLD_H, rmin + rnd() * (rmax - rmin), 0, Math.PI * 2); g.fill();
    }
  };
  if (theme === 'meydan') {
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 2;
    for (let x = 0; x <= WORLD_W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WORLD_H); g.stroke(); }
    for (let y = 0; y <= WORLD_H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD_W, y); g.stroke(); }
    blotches(1200, 'rgba(0,0,0,0.035)', 'rgba(255,255,255,0.01)', 20, 100);
  } else if (theme === 'benzinlik') {
    blotches(1500, 'rgba(0,0,0,0.05)', 'rgba(255,255,255,0.015)', 15, 90);
  } else if (theme === 'hastane') {
    blotches(1800, 'rgba(0,0,0,0.05)', 'rgba(120,160,80,0.05)', 20, 110);
  } else if (theme === 'liman') {
    g.strokeStyle = 'rgba(255,255,255,0.03)'; g.lineWidth = 2;
    for (let x = 0; x <= WORLD_W; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WORLD_H); g.stroke(); }
    for (let y = 0; y <= WORLD_H; y += 120) { g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD_W, y); g.stroke(); }
    blotches(1400, 'rgba(0,0,0,0.05)', 'rgba(140,170,190,0.02)', 15, 90);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(214,182,92,0.25)'; g.fillRect(rnd() * WORLD_W, 480 + rnd() * (WORLD_H - 500), 60, 6); }
  } else if (theme === 'metro') {
    blotches(1400, 'rgba(0,0,0,0.06)', 'rgba(120,140,170,0.02)', 15, 80);
  } else if (theme === 'avm') {
    blotches(600, 'rgba(255,255,255,0.015)', 'rgba(0,0,0,0.03)', 40, 160);
  } else if (theme === 'us') {
    blotches(2200, 'rgba(0,0,0,0.07)', 'rgba(160,140,90,0.05)', 15, 100);
  } else if (theme === 'luna') {
    blotches(1800, 'rgba(0,0,0,0.06)', 'rgba(120,80,160,0.035)', 20, 110);
  } else if (theme === 'kar') {
    blotches(1600, 'rgba(255,255,255,0.03)', 'rgba(20,30,40,0.035)', 30, 140);
    for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(rnd() * WORLD_W, rnd() * WORLD_H, 2, 2); }
  } else {
    blotches(2200, 'rgba(0,0,0,0.07)', 'rgba(110,140,70,0.05)', 15, 90);
    for (let i = 0; i < 2500; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,70,40,0.25)' : 'rgba(60,90,40,0.25)'; g.fillRect(rnd() * WORLD_W, rnd() * WORLD_H, 4, 2); }
  }
  for (const d of decor) {
    if (d.k === 'road') {
      g.fillStyle = '#141917'; g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = 'rgba(233,196,106,0.25)'; g.lineWidth = 6; g.setLineDash([40, 40]);
      g.beginPath();
      if (d.dir === 'h') { g.moveTo(d.x, d.y + d.h / 2); g.lineTo(d.x + d.w, d.y + d.h / 2); } else { g.moveTo(d.x + d.w / 2, d.y); g.lineTo(d.x + d.w / 2, d.y + d.h); }
      g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3;
      g.beginPath();
      if (d.dir === 'h') { g.moveTo(d.x, d.y + 8); g.lineTo(d.x + d.w, d.y + 8); g.moveTo(d.x, d.y + d.h - 8); g.lineTo(d.x + d.w, d.y + d.h - 8); }
      else { g.moveTo(d.x + 8, d.y); g.lineTo(d.x + 8, d.y + d.h); g.moveTo(d.x + d.w - 8, d.y); g.lineTo(d.x + d.w - 8, d.y + d.h); }
      g.stroke();
    } else if (d.k === 'parking') {
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3;
      for (let x = d.x + 20; x < d.x + d.w - 20; x += 60) { g.beginPath(); g.moveTo(x, d.y + 10); g.lineTo(x, d.y + 90); g.moveTo(x, d.y + d.h - 10); g.lineTo(x, d.y + d.h - 90); g.stroke(); }
    } else if (d.k === 'canopy') {
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = 'rgba(229,72,77,0.35)'; g.lineWidth = 4; g.strokeRect(d.x, d.y, d.w, d.h);
    } else if (d.k === 'path') {
      g.fillStyle = '#34352e'; g.fillRect(d.x, d.y, d.w, d.h);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
      const along = d.w > d.h;
      for (let t = 0; t < (along ? d.w : d.h); t += 40) { g.beginPath(); if (along) { g.moveTo(d.x + t, d.y); g.lineTo(d.x + t, d.y + d.h); } else { g.moveTo(d.x, d.y + t); g.lineTo(d.x + d.w, d.y + t); } g.stroke(); }
    } else if (d.k === 'flowers') {
      g.fillStyle = '#2c3a22'; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < d.r / 2; i++) { const a = rnd() * Math.PI * 2, r = rnd() * d.r * 0.9; g.fillStyle = ['#c0506a', '#d8b84a', '#c7c0e0'][i % 3]; g.beginPath(); g.arc(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r, 3, 0, Math.PI * 2); g.fill(); }
    } else if (d.k === 'trail') {
      g.strokeStyle = '#2c2a1f'; g.lineWidth = 70; g.lineCap = 'round';
      g.beginPath(); g.moveTo(d.x1, d.y1); g.quadraticCurveTo((d.x1 + d.x2) / 2 + (rnd() - 0.5) * 600, (d.y1 + d.y2) / 2 + (rnd() - 0.5) * 600, d.x2, d.y2); g.stroke();
    } else if (d.k === 'clearing') {
      const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      gr.addColorStop(0, '#2c2a1f'); gr.addColorStop(1, 'rgba(44,42,31,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
    } else if (d.k === 'quay') {
      g.fillStyle = '#2a3036'; g.fillRect(d.x, d.y, d.w, d.h);
      g.fillStyle = 'rgba(214,182,92,0.6)'; for (let x = 0; x < d.w; x += 60) g.fillRect(x, d.y + d.h - 10, 30, 6);
    } else if (d.k === 'rail') {
      g.fillStyle = 'rgba(80,60,40,0.55)'; for (let x = d.x; x < d.x + d.w; x += 28) g.fillRect(x, d.y + 4, 12, d.h - 8);
      g.fillStyle = '#5b6168'; g.fillRect(d.x, d.y + 10, d.w, 4); g.fillRect(d.x, d.y + d.h - 14, d.w, 4);
    } else if (d.k === 'pond') {
      const gr = g.createRadialGradient(d.x, d.y, 20, d.x, d.y, d.r);
      gr.addColorStop(0, '#8fb4c8'); gr.addColorStop(1, '#5d7d90');
      g.fillStyle = gr; g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, r = rnd() * d.r * 0.7; g.beginPath(); g.moveTo(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r * 0.7); g.lineTo(d.x + Math.cos(a) * r + 40, d.y + Math.sin(a) * r * 0.7 + 10); g.stroke(); }
    } else if (d.k === 'snowpath') {
      g.strokeStyle = 'rgba(60,70,80,0.55)'; g.lineWidth = 60; g.lineCap = 'round';
      g.beginPath(); g.moveTo(d.x1, d.y1); g.quadraticCurveTo((d.x1 + d.x2) / 2 + (rnd() - 0.5) * 500, (d.y1 + d.y2) / 2 + (rnd() - 0.5) * 500, d.x2, d.y2); g.stroke();
    } else if (d.k === 'tiles') {
      g.strokeStyle = d.c; g.lineWidth = 2;
      for (let x = d.x; x <= d.x + d.w; x += d.s) { g.beginPath(); g.moveTo(x, d.y); g.lineTo(x, d.y + d.h); g.stroke(); }
      for (let y = d.y; y <= d.y + d.h; y += d.s) { g.beginPath(); g.moveTo(d.x, y); g.lineTo(d.x + d.w, y); g.stroke(); }
    } else if (d.k === 'platform') {
      g.fillStyle = '#c9a227'; g.fillRect(d.x, d.y, d.w, d.h); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let x = d.x; x < d.x + d.w; x += 22) g.fillRect(x, d.y, 10, d.h);
    } else if (d.k === 'dirt') {
      for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(90,75,45,0.25)'; g.fillRect(rnd() * d.w, rnd() * d.h, 6, 3); }
    } else if (d.k === 'helipad') {
      g.fillStyle = '#353a33'; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e8e6df'; g.lineWidth = 8; g.beginPath(); g.arc(d.x, d.y, d.r - 16, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#e8e6df'; g.fillRect(d.x - 50, d.y - 60, 18, 120); g.fillRect(d.x + 32, d.y - 60, 18, 120); g.fillRect(d.x - 32, d.y - 9, 64, 18);
    } else if (d.k === 'park') {
      for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,90,60,0.25)' : 'rgba(90,60,110,0.18)'; g.fillRect(rnd() * d.w, rnd() * d.h, 4, 2); }
    } else if (d.k === 'lights') {
      g.strokeStyle = 'rgba(30,26,36,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(d.x1, d.y1); g.lineTo(d.x2, d.y2); g.stroke();
      const L = Math.hypot(d.x2 - d.x1, d.y2 - d.y1), n = Math.floor(L / 34), cols = ['#ffd23f', '#ff5a5f', '#4cc9f0', '#9ef01a', '#f15bb5'];
      for (let i = 0; i <= n; i++) { const k = i / Math.max(1, n); g.fillStyle = cols[i % 5]; g.beginPath(); g.arc(d.x1 + (d.x2 - d.x1) * k, d.y1 + (d.y2 - d.y1) * k, 3.5, 0, Math.PI * 2); g.fill(); }
    } else if (d.k === 'sandbags') {
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        if (Math.abs(Math.sin(a * 2)) < 0.25) continue; // gaps on the roads
        g.save(); g.translate(d.x + Math.cos(a) * d.r, d.y + Math.sin(a) * d.r); g.rotate(a + Math.PI / 2);
        g.fillStyle = '#5b5440'; g.strokeStyle = '#3a3528'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); g.fill(); g.stroke();
        g.restore();
      }
    }
  }
  if (theme !== 'orman' && theme !== 'kar') {
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.lineCap = 'butt';
    for (let i = 0; i < 160; i++) {
      let x = rnd() * WORLD_W, y = rnd() * WORLD_H;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
  }
  return cv;
}

function drawObstacle(g, o) {
  if (o.k === 'su') { // the sea: drawn with slow waves
    const t = performance.now() / 1000;
    const gr = g.createLinearGradient(0, o.y, 0, o.y + o.h); gr.addColorStop(0, '#0b2233'); gr.addColorStop(1, '#16405a');
    g.fillStyle = gr; g.fillRect(o.x, o.y, o.w, o.h);
    g.strokeStyle = 'rgba(160,210,235,0.12)'; g.lineWidth = 3;
    for (let y = o.y + 40; y < o.y + o.h; y += 60) { g.beginPath(); for (let x = o.x; x <= o.x + o.w; x += 40) g.lineTo(x, y + Math.sin(x / 90 + t + y) * 6); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(o.x, o.y + o.h - 6, o.w, 6);
    return;
  }
  const round = o.k === 'agac' || o.k === 'kaya' || o.k === 'cam' || o.k === 'kar' || o.k === 'baba' || o.k === 'kuyu' || o.k === 'saksi' || o.k === 'atli';
  if (!round) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(o.x + 6, o.y + 8, o.w, o.h); }
  switch (o.k) {
    case 'kolon': // metro pillar
      g.fillStyle = '#3a3f48'; g.fillRect(o.x, o.y, o.w, o.h); g.fillStyle = '#4a505a'; g.fillRect(o.x, o.y, o.w, 6);
      g.fillStyle = '#c9a227'; g.fillRect(o.x, o.y + o.h * 0.45, o.w, 6); g.strokeStyle = '#22252b'; g.lineWidth = 2; g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2); break;
    case 'stand': // mall kiosk
      g.fillStyle = '#2f2f36'; g.fillRect(o.x, o.y, o.w, o.h); g.fillStyle = o.c || '#ff9f43'; g.fillRect(o.x + 4, o.y + 4, o.w - 8, 10);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(o.x + 8, o.y + 20, o.w - 16, o.h - 28); break;
    case 'saksi': { const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w / 2;
      g.fillStyle = '#8a6a4a'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3e7a3a'; for (let i = 0; i < 5; i++) { const a = i * 1.26; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4, r * 0.5, 0, Math.PI * 2); g.fill(); } break; }
    case 'kumtorba': { // sandbag wall
      g.fillStyle = '#7a6a48'; g.fillRect(o.x, o.y, o.w, o.h); g.strokeStyle = '#4a4030'; g.lineWidth = 2;
      const hz = o.w >= o.h, n = Math.max(2, Math.round((hz ? o.w : o.h) / 28));
      for (let i = 1; i < n; i++) { g.beginPath(); if (hz) { g.moveTo(o.x + (o.w * i) / n, o.y); g.lineTo(o.x + (o.w * i) / n, o.y + o.h); } else { g.moveTo(o.x, o.y + (o.h * i) / n); g.lineTo(o.x + o.w, o.y + (o.h * i) / n); } g.stroke(); }
      g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2); break; }
    case 'kule': // watchtower seen from above
      g.fillStyle = '#4a3a28'; g.fillRect(o.x, o.y, o.w, o.h); g.strokeStyle = '#2a2018'; g.lineWidth = 3; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x + o.w, o.y + o.h); g.moveTo(o.x + o.w, o.y); g.lineTo(o.x, o.y + o.h); g.stroke();
      g.fillStyle = '#5a4a36'; g.fillRect(o.x + 10, o.y + 10, o.w - 20, o.h - 20); break;
    case 'cadir': // tent
      g.fillStyle = o.c || '#4a5a32'; g.fillRect(o.x, o.y, o.w, o.h);
      if (o.stripe) { g.fillStyle = 'rgba(255,255,255,0.75)'; for (let x = o.x + 10; x < o.x + o.w; x += 28) g.fillRect(x, o.y, 12, o.h); }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(o.x + o.w / 2, o.y); g.lineTo(o.x + o.w / 2, o.y + o.h); g.stroke(); g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2); break;
    case 'tank': { // wrecked tank
      g.fillStyle = '#3d4530'; g.fillRect(o.x, o.y, o.w, o.h); g.fillStyle = '#23281c';
      if (o.d) { g.fillRect(o.x, o.y, 12, o.h); g.fillRect(o.x + o.w - 12, o.y, 12, o.h); } else { g.fillRect(o.x, o.y, o.w, 12); g.fillRect(o.x, o.y + o.h - 12, o.w, 12); }
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2; g.fillStyle = '#4a5338'; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a2f20'; g.save(); g.translate(cx, cy); g.rotate(o.d ? 2.2 : 0.6); g.fillRect(0, -4, 58, 8); g.restore();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(cx - 18, cy + 10, 10, 0, Math.PI * 2); g.fill(); break; }
    case 'atli': { // carousel
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w / 2, cols = ['#e5484d', '#ffd23f', '#4cc9f0', '#f15bb5', '#9ef01a', '#ff9f43'];
      for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 6]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2); g.closePath(); g.fill(); }
      g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(cx, cy, r * 0.22, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r - 1, 0, Math.PI * 2); g.stroke(); break; }
    case 'bufe': // food stall with a striped roof
      g.fillStyle = '#3a2f2a'; g.fillRect(o.x, o.y, o.w, o.h);
      for (let x = o.x; x < o.x + o.w; x += 18) { g.fillStyle = Math.round((x - o.x) / 18) % 2 ? '#f4f1ea' : (o.c || '#e5484d'); g.fillRect(x, o.y, Math.min(18, o.x + o.w - x), o.h * 0.55); }
      g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2); break;
    case 'konteyner': {
      g.fillStyle = o.c || '#8e3b2e'; g.fillRect(o.x, o.y, o.w, o.h);
      const hor = o.w > o.h; g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
      for (let i = 8; i < (hor ? o.w : o.h) - 4; i += 14) { g.beginPath(); if (hor) { g.moveTo(o.x + i, o.y + 4); g.lineTo(o.x + i, o.y + o.h - 4); } else { g.moveTo(o.x + 4, o.y + i); g.lineTo(o.x + o.w - 4, o.y + i); } g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4; g.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(o.x, o.y, o.w, 4);
      break;
    }
    case 'forklift': {
      g.fillStyle = '#d8a21e'; rr(g, o.x, o.y, o.w, o.h, 6); g.fill();
      g.fillStyle = '#222'; g.fillRect(o.x + o.w * 0.25, o.y + o.h * 0.25, o.w * 0.5, o.h * 0.5);
      g.fillStyle = '#555'; if (o.w > o.h) { g.fillRect(o.x + o.w, o.y + 8, 18, 4); g.fillRect(o.x + o.w, o.y + o.h - 12, 18, 4); } else { g.fillRect(o.x + 8, o.y + o.h, 4, 18); g.fillRect(o.x + o.w - 12, o.y + o.h, 4, 18); }
      break;
    }
    case 'baba': g.fillStyle = '#2b2f33'; g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4a5056'; g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 3, 0, Math.PI * 2); g.fill(); break;
    case 'cam': { // pine with snow on the tips
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w / 2;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(cx + 5, cy + 7, r * 1.1, 0, Math.PI * 2); g.fill();
      for (const [k, c] of [[1.15, '#1f3a2a'], [0.8, '#2a4d36'], [0.45, '#35603f']]) { g.fillStyle = c; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const rr2 = r * k * (i % 2 ? 0.7 : 1); g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(240,248,255,0.75)'; for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.18, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'kar': g.fillStyle = '#dfe7ee'; g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(150,175,200,0.35)'; g.beginPath(); g.ellipse(o.x + o.w / 2 + 4, o.y + o.h / 2 + 5, o.w / 2.6, o.h / 3, 0, 0, Math.PI * 2); g.fill(); break;
    case 'kuyu': g.fillStyle = '#6f7378'; g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 0, Math.PI * 2); g.fill(); g.fillStyle = '#0d1418'; g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 3.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#eef3f7'; g.lineWidth = 3; g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2 - 1, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); break;
    case 'kasa':
      g.fillStyle = '#6b4f2e'; g.fillRect(o.x, o.y, o.w, o.h);
      g.strokeStyle = '#3e2c18'; g.lineWidth = 3;
      g.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
      g.beginPath(); g.moveTo(o.x + 4, o.y + 4); g.lineTo(o.x + o.w - 4, o.y + o.h - 4); g.moveTo(o.x + o.w - 4, o.y + 4); g.lineTo(o.x + 4, o.y + o.h - 4); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(o.x, o.y, o.w, 4);
      break;
    case 'araba': {
      const hor = o.w > o.h, L = hor ? o.w : o.h, W = hor ? o.h : o.w;
      g.save(); g.translate(o.x + o.w / 2, o.y + o.h / 2); if (!hor) g.rotate(Math.PI / 2);
      g.fillStyle = '#111'; for (const [x, y] of [[-L * 0.32, -W / 2], [L * 0.28, -W / 2], [-L * 0.32, W / 2 - 6], [L * 0.28, W / 2 - 6]]) g.fillRect(x, y, 16, 6);
      g.fillStyle = o.c || '#555'; rr(g, -L / 2, -W / 2 + 3, L, W - 6, 10); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, -L * 0.18, -W / 2 + 7, L * 0.42, W - 14, 6); g.fill();
      g.fillStyle = 'rgba(160,200,230,0.35)'; g.fillRect(L * 0.18, -W / 2 + 8, 8, W - 16); g.fillRect(-L * 0.24, -W / 2 + 8, 6, W - 16);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(-L / 2 + 4, -W / 2 + 5, L - 8, 3);
      g.restore();
      break;
    }
    case 'bina':
      g.fillStyle = o.c || '#4b5560'; g.fillRect(o.x, o.y, o.w, o.h);
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 6; g.strokeRect(o.x + 3, o.y + 3, o.w - 6, o.h - 6);
      if (o.cabin) {
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
        for (let y = o.y + 14; y < o.y + o.h; y += 14) { g.beginPath(); g.moveTo(o.x + 6, y); g.lineTo(o.x + o.w - 6, y); g.stroke(); }
        g.fillStyle = '#3a3a36'; g.fillRect(o.x + o.w * 0.7, o.y + 14, 24, 24);
        if (o.snowy) {
          g.fillStyle = 'rgba(236,242,248,0.92)'; rr(g, o.x + 4, o.y + 4, o.w - 8, o.h * 0.42, 10); g.fill();
          g.fillStyle = 'rgba(200,214,228,0.9)'; g.fillRect(o.x + 4, o.y + o.h * 0.42, o.w - 8, 4);
          g.fillStyle = 'rgba(236,242,248,0.85)'; g.fillRect(o.x + o.w * 0.7 - 2, o.y + 12, 28, 8);
        }
      } else if (o.shop) { // mall shop: a coloured awning and a window
        g.fillStyle = o.a || '#ffd23f'; g.fillRect(o.x + 6, o.y + o.h - 24, o.w - 12, 14);
        g.fillStyle = 'rgba(160,200,230,0.18)'; g.fillRect(o.x + 16, o.y + 16, o.w - 32, o.h - 48);
      } else if (o.haunt) { // the haunted house
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(o.x + 16, o.y + 16, o.w - 32, o.h - 32);
        g.fillStyle = '#b07ad8'; for (const fx of [0.25, 0.62]) { g.beginPath(); g.arc(o.x + o.w * fx + 12, o.y + o.h * 0.42, 9, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#120c18'; g.fillRect(o.x + o.w / 2 - 22, o.y + o.h - 46, 44, 46);
      } else if (o.hosp) {
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(o.x + 16, o.y + 16, o.w - 32, o.h - 32);
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        g.fillStyle = '#e8e6df'; g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c0392b'; g.fillRect(cx - 8, cy - 26, 16, 52); g.fillRect(cx - 26, cy - 8, 52, 16);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(o.x + 16, o.y + 16, o.w - 32, o.h - 32);
        g.fillStyle = '#6b6f6a';
        for (let i = 0; i < 3; i++) g.fillRect(o.x + 30 + i * 46, o.y + 26, 30, 22);
      }
      break;
    case 'pompa':
      g.fillStyle = '#4a4f4b'; g.fillRect(o.x, o.y, o.w, o.h);
      for (const fx of [0.18, 0.62]) { g.fillStyle = '#c0392b'; g.fillRect(o.x + o.w * fx, o.y + 4, 20, o.h - 8); g.fillStyle = '#e8e6df'; g.fillRect(o.x + o.w * fx + 4, o.y + 7, 12, 6); }
      break;
    case 'cit':
      if (o.wood) {
        const hz = o.w > o.h, L = hz ? o.w : o.h;
        g.fillStyle = '#6b4a2b';
        for (let t = 0; t < 2; t++) hz ? g.fillRect(o.x, o.y + o.h * (0.3 + t * 0.35) - 2, o.w, 4) : g.fillRect(o.x + o.w * (0.3 + t * 0.35) - 2, o.y, 4, o.h);
        g.fillStyle = '#4a3220';
        for (let t = 0; t <= L; t += 26) { const px = hz ? o.x + Math.min(t, o.w - 7) : o.x + o.w / 2 - 4, py = hz ? o.y + o.h / 2 - 4 : o.y + Math.min(t, o.h - 7); g.fillRect(px, py, 7, 7); g.fillStyle = 'rgba(240,245,250,0.85)'; g.fillRect(px, py, 7, 2); g.fillStyle = '#4a3220'; }
        break;
      }
      g.fillStyle = '#24391f'; rr(g, o.x, o.y, o.w, o.h, 14); g.fill();
      g.fillStyle = '#2f4a27';
      for (let t = 10; t < Math.max(o.w, o.h) - 6; t += 22) { const x = o.w > o.h ? o.x + t : o.x + o.w / 2, y = o.w > o.h ? o.y + o.h / 2 : o.y + t; g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill(); }
      break;
    case 'ambulans': {
      const hor = o.w > o.h, L = hor ? o.w : o.h, W = hor ? o.h : o.w;
      g.save(); g.translate(o.x + o.w / 2, o.y + o.h / 2); if (!hor) g.rotate(Math.PI / 2);
      g.fillStyle = '#e8e6df'; rr(g, -L / 2, -W / 2, L, W, 8); g.fill();
      g.fillStyle = '#c0392b'; g.fillRect(-L / 2, -3, L, 6);
      g.fillRect(-12, -W / 2 + 6, 8, W - 12); g.fillRect(-20, -4, 24, 8);
      g.fillStyle = 'rgba(80,140,220,0.8)'; g.fillRect(L / 2 - 22, -W / 2 + 4, 6, 8); g.fillStyle = 'rgba(220,60,60,0.8)'; g.fillRect(L / 2 - 22, W / 2 - 12, 6, 8);
      g.restore();
      break;
    }
    case 'bank':
      g.fillStyle = '#5b4026'; g.fillRect(o.x, o.y, o.w, o.h);
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
      if (o.w > o.h) for (let y = o.y + 5; y < o.y + o.h; y += 6) { g.beginPath(); g.moveTo(o.x, y); g.lineTo(o.x + o.w, y); g.stroke(); }
      else for (let x = o.x + 5; x < o.x + o.w; x += 6) { g.beginPath(); g.moveTo(x, o.y); g.lineTo(x, o.y + o.h); g.stroke(); }
      break;
    case 'agac': {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w * 0.95;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(cx + 8, cy + 10, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1f3a1d'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a4d26';
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + o.x; g.beginPath(); g.arc(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(160,200,110,0.12)'; g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.25, r * 0.4, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'kaya': {
      g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, o.x + 5, o.y + 7, o.w, o.h, 16); g.fill();
      g.fillStyle = '#5a5d58'; rr(g, o.x, o.y, o.w, o.h, 16); g.fill();
      g.fillStyle = '#6d716b'; rr(g, o.x + 6, o.y + 5, o.w * 0.6, o.h * 0.45, 10); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(o.x + o.w * 0.3, o.y + o.h * 0.6); g.lineTo(o.x + o.w * 0.7, o.y + o.h * 0.75); g.stroke();
      break;
    }
    case 'kutuk': {
      g.fillStyle = '#4a3420'; rr(g, o.x, o.y, o.w, o.h, 10); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
      const hor = o.w > o.h;
      for (let t = 12; t < (hor ? o.w : o.h) - 8; t += 18) { g.beginPath(); if (hor) { g.moveTo(o.x + t, o.y + 4); g.lineTo(o.x + t + 10, o.y + o.h - 4); } else { g.moveTo(o.x + 4, o.y + t); g.lineTo(o.x + o.w - 4, o.y + t + 10); } g.stroke(); }
      g.fillStyle = '#8a6a44';
      if (hor) { g.beginPath(); g.ellipse(o.x + o.w - 4, o.y + o.h / 2, 5, o.h / 2 - 2, 0, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.ellipse(o.x + o.w / 2, o.y + o.h - 4, o.w / 2 - 2, 5, 0, 0, Math.PI * 2); g.fill(); }
      break;
    }
    default: // beton
      g.fillStyle = '#353d37'; g.fillRect(o.x, o.y, o.w, o.h);
      g.fillStyle = '#434c45'; g.fillRect(o.x, o.y, o.w, 5);
      g.strokeStyle = '#222824'; g.lineWidth = 2; g.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
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

function drawTurret(g, t, time) {
  if (t.k === 5) { g.save(); g.translate(t.x, t.y); g.scale(1.9, 1.9); drawPet(g, 'k9', 0, 0, t.a || 0, time || 0, 1, true); g.restore(); return; }
  if (t.k === 1 || t.k === 2) { drawDrone(g, t); return; }
  if (t.k === 3) { drawCrate(g, t); return; }
  if (t.k === 4) { rangeRing(g, t.x, t.y, CLASSES.tesla.ab.r || 260, '120,200,255'); drawCoil(g, t); turretHp(g, t); return; }
  rangeRing(g, t.x, t.y, CLASSES.tamirci.ab.range || 420, '255,210,63'); drawTurretBody(g, t); turretHp(g, t);
}
// a faint circle showing how far a turret or coil reaches
function rangeRing(g, x, y, r, rgb) {
  g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = `rgba(${rgb},0.035)`; g.fill();
  g.setLineDash([10, 10]); g.lineWidth = 1.5; g.strokeStyle = `rgba(${rgb},0.16)`; g.stroke();
  g.restore();
}
// a small health bar under a turret or coil once zombies start clawing it
function turretHp(g, t) {
  if (t.hp == null || t.hp >= 100) return;
  const w = 36, x = t.x - w / 2, y = t.y + 22, k = Math.max(0, t.hp) / 100;
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 1, y - 1, w + 2, 6);
  g.fillStyle = k > 0.5 ? '#43d17a' : k > 0.25 ? '#f5c542' : '#e5484d'; g.fillRect(x, y, w * k, 4);
}
function drawTurretBody(g, t) {
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

function drawItem(g, it, time) {
  const [id, k, x, y, life] = it;
  if (life <= 5 && Math.sin(time * 14) < 0) return; // blink before vanishing
  const bob = Math.sin(time * 3 + id) * 3;
  const col = ITEMS[k].col;
  g.save(); g.translate(x, y + bob);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(2, 10 - bob, 11, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(13,17,15,0.85)'; g.strokeStyle = col; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = col; g.strokeStyle = col;
  if (k === 0) { g.fillRect(-2.5, -7, 5, 14); g.fillRect(-7, -2.5, 14, 5); }
  else if (k === 1) { g.beginPath(); g.arc(-3, 2, 4.5, 0, Math.PI * 2); g.arc(3, 2, 4.5, 0, Math.PI * 2); g.arc(0, -3, 4.5, 0, Math.PI * 2); g.fill(); }
  else if (k === 2) { g.beginPath(); g.moveTo(0, -8); g.lineTo(7, 0); g.lineTo(0, 8); g.lineTo(-7, 0); g.closePath(); g.fill(); g.fillStyle = '#1a0d05'; g.font = '700 9px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('2×', 0, 3); }
  else { g.beginPath(); g.moveTo(2, -9); g.lineTo(-5, 1); g.lineTo(0, 1); g.lineTo(-2, 9); g.lineTo(5, -1); g.lineTo(0, -1); g.closePath(); g.fill(); }
  g.restore();
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
  if (z.st === ZS.WINDUP && CHARGE[z.t]) {
    const pulse = 0.25 + 0.2 * Math.sin(time * 20), c = CHARGE[z.t], r = ZTYPES[z.t].r;
    g.save(); g.translate(z.x, z.y); g.rotate(z.cdir);
    g.fillStyle = `rgba(229,72,77,${pulse})`;
    g.fillRect(0, -r, c.spd * c.dur, r * 2);
    g.restore();
  } else if (z.st === ZS.FUSE) {
    const pulse = 0.25 + 0.25 * Math.sin(time * 30);
    g.fillStyle = `rgba(255,120,40,${pulse})`;
    g.beginPath(); g.arc(z.x, z.y, 110, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,120,40,0.8)'; g.lineWidth = 3; g.stroke();
  } else if (z.st === ZS.SUMMON) {
    g.strokeStyle = `rgba(176,122,216,${0.5 + 0.3 * Math.sin(time * 12)})`; g.lineWidth = 4;
    g.setLineDash([10, 8]);
    g.beginPath(); g.arc(z.x, z.y, 70, time * 2, time * 2 + Math.PI * 2); g.stroke();
    g.setLineDash([]);
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
  if (z.fl & 4096) { g.strokeStyle = `rgba(76,240,208,${0.55 + 0.3 * Math.sin(time * 8)})`; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r + 6, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(76,240,208,0.14)'; g.fill(); }
  if (z.t === 3) {
    g.fillStyle = 'rgba(229,72,77,0.13)';
    g.beginPath(); g.arc(0, 0, r + 10 + Math.sin(time * 4) * 3, 0, Math.PI * 2); g.fill();
  }
  if (z.t === 4 || z.t === 8) {
    g.fillStyle = `rgba(159,191,42,${0.15 + (z.st === ZS.SPIT ? 0.25 : 0)})`;
    g.beginPath(); g.arc(0, 0, r + 8, 0, Math.PI * 2); g.fill();
  }
  if (z.t === 5 && z.st === ZS.FUSE) { const s = 1 + 0.12 * Math.sin(time * 40); g.scale(s, s); }
  if (z.t === 10) g.globalAlpha *= z.st === ZS.PHASE ? 0.28 + 0.1 * Math.sin(time * 20) : 0.75 + 0.15 * Math.sin(time * 3 + z.id);
  if (z.t === 12 && z.st === ZS.CROUCH) g.scale(1.15, 0.8);
  if (z.t === 12 && z.st === ZS.LEAP) { const h = Math.sin(Math.PI * Math.min(1, (time - (z.leapT || time)) / 0.7)); g.translate(0, -h * 30); g.scale(1 + h * 0.35, 1 + h * 0.35); }
  if (z.t === 15) { g.strokeStyle = `rgba(106,216,160,${0.1 + 0.06 * Math.sin(time * 3)})`; g.lineWidth = 1.5; g.setLineDash([3, 9]); g.beginPath(); g.arc(0, 0, 170, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
  if (z.t === 13) { const s = 1 + 0.04 * Math.sin(time * 5 + z.id); g.scale(s, s); }
  if (z.fl & 128) { // Kazıcı underground: only a moving mound of dirt
    g.fillStyle = '#5a4630'; g.beginPath(); g.ellipse(0, 0, r * 1.2, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a5f3e'; for (let i = 0; i < 5; i++) { const a = time * 3 + i * 1.3 + z.id; g.beginPath(); g.arc(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.5, 3, 0, Math.PI * 2); g.fill(); }
    g.restore(); return;
  }
  const el = (z.fl >> 8) & 7;
  if (el) { // elite glow, coloured by its power
    const c = ['', '255,210,63', '255,106,44', '67,209,122', '160,170,190'][el];
    g.fillStyle = `rgba(${c},${0.18 + 0.1 * Math.sin(time * 5 + z.id)})`; g.beginPath(); g.arc(0, 0, r + 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(${c},0.85)`; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r + 5, 0, Math.PI * 2); g.stroke();
  }
  if (z.fl & 2048) { g.strokeStyle = 'rgba(255,111,181,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r + 3, 0, Math.PI * 2); g.stroke(); }
  if (z.t === 18) { g.fillStyle = 'rgba(159,227,255,0.15)'; g.beginPath(); g.arc(0, 0, r + 7, 0, Math.PI * 2); g.fill(); }
  if (z.t === 20) { g.globalAlpha *= 0.85 + 0.15 * Math.sin(time * 4); g.fillStyle = 'rgba(176,122,216,0.18)'; g.beginPath(); g.arc(0, 0, r + 14 + Math.sin(time * 3) * 4, 0, Math.PI * 2); g.fill(); }
  if (z.t === 19) { g.fillStyle = 'rgba(255,170,60,0.12)'; g.beginPath(); g.arc(0, 0, r + 10 + Math.sin(time * 4) * 3, 0, Math.PI * 2); g.fill(); }
  if (z.t === 17 && z.st === ZS.SCREAM) { const s = 1.1 + 0.08 * Math.sin(time * 40); g.scale(s, s); }
  if (z.t === 9) {
    g.fillStyle = 'rgba(229,72,77,0.13)';
    g.beginPath(); g.arc(0, 0, r + 10 + Math.sin(time * 5) * 3, 0, Math.PI * 2); g.fill();
  }
  if (z.t === 21 || z.t === 22 || z.t === 23) { drawNewZombie(g, z, r, time); g.restore(); return; }
  g.rotate(z.t === 6 && z.sface ? z.sface : z.face);
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
  if (DETAIL && !fl) { // torn sleeves over the upper arm
    g.strokeStyle = shirtOf(z); g.lineWidth = r * 0.36;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(r * 0.1, s * r * 0.62); g.lineTo(r * 0.45, s * r * (0.6 + sway * 0.1 * s)); g.stroke(); }
  }
  g.fillStyle = fl ? '#fff' : T.col;
  for (const s of [-1, 1]) { g.beginPath(); g.arc(r * (0.9 + 0.35 * reach + s * sway * 0.4), s * r * (0.55 + sway * 0.3 * s), r * 0.2, 0, Math.PI * 2); g.fill(); }
  // torso: ragged shirt
  g.fillStyle = fl ? '#fff' : shirtOf(z);
  g.beginPath(); g.ellipse(-r * 0.1, 0, r * 0.62, r * 0.88, 0, 0, Math.PI * 2); g.fill();
  if (DETAIL && !fl) {
    // shading, a torn hem and old blood: each zombie a little different (from its id)
    g.fillStyle = 'rgba(0,0,0,0.24)'; g.beginPath(); g.ellipse(-r * 0.35, 0, r * 0.36, r * 0.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(r * 0.12, -r * 0.15, r * 0.25, r * 0.5, 0, 0, Math.PI * 2); g.fill();
    const h = (z.id * 2654435761) >>> 0;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 3; i++) { const a = ((h >> (i * 5)) & 31) / 31 * Math.PI * 2, px = Math.cos(a) * r * 0.58 - r * 0.1, py = Math.sin(a) * r * 0.84; g.beginPath(); g.moveTo(px, py); g.lineTo(px * 0.72, py * 0.72 + r * 0.12); g.lineTo(px * 0.78, py * 0.78 - r * 0.12); g.fill(); }
    if (h & 1) { g.fillStyle = 'rgba(110,20,18,0.55)'; g.beginPath(); g.ellipse(-r * 0.05 + ((h >> 3) & 7) * 0.6 - 2, ((h >> 7) & 7) - 3, r * 0.22, r * 0.16, (h & 15) * 0.4, 0, Math.PI * 2); g.fill(); }
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(-r * 0.1, 0, r * 0.62, r * 0.88, 0, 0, Math.PI * 2); g.stroke();
  if (z.t === 2 || z.t === 3) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(-r * 0.25, 0, r * 0.4, r * 0.7, 0, 0, Math.PI * 2); g.fill();
  }
  if (z.t === 3) {
    g.fillStyle = '#3a1a14';
    for (const s of [-1, 1]) for (const k of [0.2, 0.55]) { g.beginPath(); g.moveTo(-r * k, s * r * 0.5); g.lineTo(-r * (k + 0.1), s * r * 1.05); g.lineTo(-r * (k - 0.12), s * r * 0.55); g.fill(); }
  }
  if (z.t === 4 || z.t === 8) {
    g.fillStyle = '#b5d43a';
    for (const [px, py] of [[-0.3, -0.4], [-0.45, 0.3], [0.05, 0.5]]) { g.beginPath(); g.arc(px * r, py * r, r * 0.18, 0, Math.PI * 2); g.fill(); }
  }
  if (z.t === 5) { // glowing pustules, brighter when about to burst
    g.fillStyle = z.st === ZS.FUSE && Math.sin(time * 30) > 0 ? '#fff2a8' : '#ffb347';
    for (const [px, py, pr] of [[-0.35, -0.35, 0.22], [-0.5, 0.25, 0.18], [0, 0.45, 0.2], [0.05, -0.55, 0.15]]) { g.beginPath(); g.arc(px * r, py * r, r * pr, 0, Math.PI * 2); g.fill(); }
  }
  if (z.t === 11 && !(z.fl & 64)) { // armour plates
    g.fillStyle = fl ? '#fff' : '#7d858c';
    rr(g, -r * 0.55, -r * 0.8, r * 0.9, r * 1.6, 4); g.fill();
    g.strokeStyle = '#3b4248'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#9aa3aa'; for (const y of [-0.45, 0, 0.45]) g.fillRect(-r * 0.4, y * r - 1, r * 0.6, 2);
  }
  if (z.t === 13) { // swollen, with the brood showing through
    g.fillStyle = 'rgba(200,180,110,0.85)'; g.beginPath(); g.ellipse(-r * 0.2, 0, r * 0.7, r * 0.75, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(90,120,60,0.7)'; for (const [px, py] of [[-0.4, -0.3], [-0.1, 0.35], [-0.5, 0.25], [0, -0.35]]) { g.beginPath(); g.arc(px * r, py * r, r * 0.16, 0, Math.PI * 2); g.fill(); }
  }
  if (z.t === 15) { // healer: pale green robe with a glowing cross
    g.fillStyle = '#244a3a'; g.beginPath(); g.ellipse(-r * 0.2, 0, r * 0.7, r * 0.95, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(130,255,180,${0.6 + 0.4 * Math.sin(time * 4)})`; g.fillRect(-r * 0.35, -r * 0.1, r * 0.5, r * 0.2); g.fillRect(-r * 0.2, -r * 0.35, r * 0.2, r * 0.7);
  }
  if (z.t === 16) { // digger: dirt-caked with a helmet lamp
    g.fillStyle = 'rgba(90,70,48,0.8)'; for (const [px, py] of [[-0.4, -0.4], [-0.5, 0.3], [0, 0.5]]) { g.beginPath(); g.arc(px * r, py * r, r * 0.22, 0, Math.PI * 2); g.fill(); }
  }
  if (z.t === 18) { // frozen: ice crust
    g.fillStyle = 'rgba(220,245,255,0.75)'; for (const [px, py] of [[-0.3, -0.5], [-0.55, 0.15], [0.1, 0.55], [-0.1, 0]]) { g.beginPath(); g.moveTo(px * r, py * r - 5); g.lineTo(px * r + 4, py * r); g.lineTo(px * r, py * r + 5); g.lineTo(px * r - 4, py * r); g.fill(); }
  }
  if (z.t === 19) { // Dev Hurda: scrap-metal armour bolted on
    g.fillStyle = fl ? '#fff' : '#5a5f66'; rr(g, -r * 0.6, -r * 0.75, r * 0.7, r * 0.6, 4); g.fill(); rr(g, -r * 0.5, r * 0.15, r * 0.6, r * 0.55, 4); g.fill();
    g.fillStyle = '#9a6a3a'; for (const [px, py] of [[-0.45, -0.6], [-0.15, -0.3], [-0.35, 0.3], [-0.05, 0.55]]) { g.beginPath(); g.arc(px * r, py * r, 2.5, 0, Math.PI * 2); g.fill(); }
  }
  if (z.t === 20) { // Cadı: dark robe with glowing runes
    g.fillStyle = '#24142e'; g.beginPath(); g.ellipse(-r * 0.2, 0, r * 0.75, r * 1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(200,140,255,${0.5 + 0.5 * Math.sin(time * 5)})`; for (let i = 0; i < 5; i++) { const a = i * 1.26 + time; g.fillRect(Math.cos(a) * r * 0.45 - r * 0.2 - 1.5, Math.sin(a) * r * 0.6 - 1.5, 3, 3); }
  }
  if (z.t === 14) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (const s of [-1, 1]) { g.fillRect(-r * 0.6, s * r * 0.9 - 1, r * 1.2, 2); } }
  if (z.t === 7) { // hooded caster with glowing hands
    g.fillStyle = '#2a1a34';
    g.beginPath(); g.ellipse(-r * 0.2, 0, r * 0.7, r * 0.95, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(200,140,255,${0.6 + 0.4 * Math.sin(time * 6)})`;
    for (const sd of [-1, 1]) { g.beginPath(); g.arc(r * 1.1, sd * r * 0.55, r * 0.22, 0, Math.PI * 2); g.fill(); }
  }
  if (z.t === 8) { // queen's crown of spikes
    g.fillStyle = '#5a6a12';
    for (let i = 0; i < 6; i++) { const a = Math.PI * 0.6 + i * 0.25; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); g.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15); g.lineTo(Math.cos(a + 0.12) * r * 0.6, Math.sin(a + 0.12) * r * 0.6); g.fill(); g.beginPath(); g.moveTo(Math.cos(-a) * r * 0.6, Math.sin(-a) * r * 0.6); g.lineTo(Math.cos(-a) * r * 1.15, Math.sin(-a) * r * 1.15); g.lineTo(Math.cos(-a - 0.12) * r * 0.6, Math.sin(-a - 0.12) * r * 0.6); g.fill(); }
  }
  // head
  g.fillStyle = fl ? '#fff' : T.col;
  g.beginPath(); g.arc(r * 0.25, 0, r * 0.42, 0, Math.PI * 2); g.fill();
  g.strokeStyle = T.dark; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.arc(r * 0.12, -r * 0.12, r * 0.18, 0, Math.PI * 2); g.fill();
  if (DETAIL && !fl && z.t !== 17 && z.t !== 20 && z.t !== 19) { // sunken jaw, hanging open
    g.fillStyle = 'rgba(40,10,10,0.75)'; g.beginPath(); g.ellipse(r * 0.55, 0, r * 0.09, r * 0.16, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(r * 0.18, 0, r * 0.4, Math.PI * 0.55, Math.PI * 1.45); g.fill();
  }
  if (z.t === 16) { g.fillStyle = '#e8a33a'; g.beginPath(); g.arc(r * 0.25, 0, r * 0.44, Math.PI * 0.5, Math.PI * 1.5); g.fill(); g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(r * 0.55, 0, 2.5, 0, Math.PI * 2); g.fill(); }
  if (z.t === 17) { g.fillStyle = '#2a0a14'; g.beginPath(); g.ellipse(r * 0.55, 0, r * 0.18, r * (z.st === ZS.SCREAM ? 0.28 : 0.14), 0, 0, Math.PI * 2); g.fill(); }
  if (z.t === 20) { g.fillStyle = '#1a0e22'; g.beginPath(); g.moveTo(r * 0.7, 0); g.lineTo(-r * 0.6, -r * 0.55); g.lineTo(-r * 0.6, r * 0.55); g.closePath(); g.fill(); g.fillStyle = '#c88cff'; g.beginPath(); g.arc(r * 0.4, -r * 0.12, 2, 0, Math.PI * 2); g.arc(r * 0.4, r * 0.12, 2, 0, Math.PI * 2); g.fill(); }
  if (z.t === 19) { g.fillStyle = '#4a4f56'; g.fillRect(r * 0.05, -r * 0.42, r * 0.4, r * 0.84); g.fillStyle = '#ff5a36'; g.fillRect(r * 0.35, -r * 0.2, 3, r * 0.4); }
  if (z.t === 9) { // ram horns
    g.strokeStyle = fl ? '#fff' : '#d8cfb0'; g.lineWidth = r * 0.16; g.lineCap = 'round';
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(r * 0.3, sd * r * 0.3); g.quadraticCurveTo(r * 0.1, sd * r * 0.95, r * 0.75, sd * r * 0.8); g.stroke(); }
  }
  if (z.t === 6) { // riot shield held in front, swung aside while dazed by a Dipçik
    g.save();
    if (z.fl & 2) { g.translate(0, r * 0.9); g.rotate(1.25); }
    g.fillStyle = fl ? '#fff' : '#8a949e';
    rr(g, r * 0.95, -r * 1.1, r * 0.32, r * 2.2, 4); g.fill();
    g.strokeStyle = '#3a4048'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(160,200,230,0.35)'; g.fillRect(r * 1.0, -r * 0.5, r * 0.18, r * 0.4);
    g.restore();
  }
  g.restore();
  if (z.fl & 4) { // poisoned: green haze and bubbles
    g.fillStyle = 'rgba(143,209,79,0.2)';
    g.beginPath(); g.arc(z.x, z.y, r + 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(170,230,90,0.85)';
    for (let i = 0; i < 3; i++) { const k = ((time * 0.8 + i / 3 + z.id * 0.13) % 1); g.beginPath(); g.arc(z.x + Math.sin(z.id + i * 2.1) * r * 0.6, z.y - r * 0.2 - k * r * 1.2, 1.5 + (1 - k) * 1.5, 0, Math.PI * 2); g.fill(); }
  }
  if (z.fl & 32 && z.t === 6) { // shield eaten by acid
    g.strokeStyle = 'rgba(160,230,60,0.8)'; g.lineWidth = 2; g.setLineDash([3, 4]);
    g.beginPath(); g.arc(z.x, z.y, r + 6, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  if (z.fl & 8) { // burning: little flames licking up
    for (let i = 0; i < 4; i++) {
      const a = z.id + i * 1.6, fx = z.x + Math.cos(a) * r * 0.55, fy = z.y + Math.sin(a) * r * 0.55;
      const h = 5 + 4 * Math.sin(time * 18 + i * 2);
      g.fillStyle = i % 2 ? 'rgba(255,154,60,0.9)' : 'rgba(255,209,102,0.9)';
      g.beginPath(); g.moveTo(fx - 3, fy); g.quadraticCurveTo(fx, fy - h * 1.6, fx + 3, fy); g.closePath(); g.fill();
    }
  }
  if (z.fl & 16) { // frozen solid
    g.fillStyle = 'rgba(200,240,255,0.45)'; g.strokeStyle = 'rgba(230,251,255,0.95)'; g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + z.id, rr = r + 5 + (i % 2) * 3; g.lineTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.stroke();
  } else if (z.fl & 1) { // slowed: icy rim
    g.strokeStyle = 'rgba(160,230,255,0.85)'; g.lineWidth = 2.5;
    g.fillStyle = 'rgba(123,223,242,0.22)';
    g.beginPath(); g.arc(z.x, z.y, r + 3, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#e6fbff';
    for (let i = 0; i < 4; i++) { const a = z.id + i * 1.7; g.fillRect(z.x + Math.cos(a) * r * 0.8 - 1.5, z.y + Math.sin(a) * r * 0.8 - 1.5, 3, 3); }
  }
  if (z.fl & 2) { // dazed: stars circling the head
    g.fillStyle = '#ffe27a';
    for (let i = 0; i < 3; i++) {
      const a = time * 6 + i * 2.1;
      const sx = z.x + Math.cos(a) * r * 0.75, sy = z.y - r * 0.4 + Math.sin(a) * r * 0.3;
      star(g, sx, sy, 3.6);
    }
  }
  if (isBoss(z.t)) return; // bosses use the big bar at the top of the screen
  if (z.hp < z.max || z.dying) {
    // show the health the player's own hits have already taken off, so a finished zombie reads as empty
    const pending = z.pend ? z.pend.reduce((s, e) => s + e.d, 0) : 0;
    const w = Math.max(24, r * 2), kk = z.dying ? 0 : clamp((z.hp - pending) / z.max, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(z.x - w / 2, z.y - r - 12, w, 4);
    g.fillStyle = z.t === 3 ? '#ff6b2c' : '#e5484d';
    g.fillRect(z.x - w / 2, z.y - r - 12, w * kk, 4);
  }
}

const SHIRTS = ['#4b4f5c', '#5c4a3d', '#3f5560', '#5b5a44', '#604040', '#45503f'];
function shirtOf(z) {
  if (z.t === 3) return '#5a2a22';
  if (z.t === 4 || z.t === 8) return '#5f6a2a';
  if (z.t === 5) return '#7a4a28';
  if (z.t === 6) return '#3a4450';
  if (z.t === 7) return '#3a2448';
  if (z.t === 9) return '#4a2a1c';
  return SHIRTS[z.id % SHIRTS.length];
}

function drawEyes(g, z) {
  const r = ZTYPES[z.t].r;
  const f = z.t === 6 && z.sface ? z.sface : z.face;
  const c = Math.cos(f), s = Math.sin(f);
  const hx = z.x + c * r * 0.42, hy = z.y + s * r * 0.42;
  const ex = -s * r * 0.17, ey = c * r * 0.17;
  const er = Math.max(1.4, r * 0.08);
  g.fillStyle = z.t === 4 || z.t === 8 ? 'rgba(181,212,58,0.95)' : z.t === 7 ? 'rgba(210,150,255,0.95)' : 'rgba(255,60,48,0.95)';
  g.beginPath(); g.arc(hx + ex, hy + ey, er, 0, Math.PI * 2); g.arc(hx - ex, hy - ey, er, 0, Math.PI * 2); g.fill();
}

// ---------- players ----------
function drawPlayer(g, game, pid, p, info, alive) {
  const cls = info ? info.cls : 'asker';
  const col = info ? info.color : '#ccc';
  const fx = game.fx.get(pid);
  const fxk = fx && game.time < fx.until ? fx.k : (p.pfl & 8) ? 'spin' : (p.shield ? 'shield' : null);
  const pv = game.pv, foe = !!pv && pid !== game.me && (pv[0] === 'ffa' || p.tm !== game.self.tm);
  // an Ajan in the shadows: faint to friends, almost nothing to enemies (gone when far away)
  let alpha = 1;
  if (alive && (fxk === 'shadow' || (p.pfl & 2))) {
    alpha = foe ? Math.max(0, 0.16 - Math.hypot(p.x - game.self.x, p.y - game.self.y) / 1600) : 0.4;
    if (alpha <= 0.01) return;
  }
  g.save();
  g.translate(p.x, p.y);
  g.globalAlpha = alpha;
  if (pv && alive) { // team ring under PvP players: blue/red teams, red for everyone else in free-for-all
    const col = pv[0] === 'ffa' ? (pid === game.me ? '#4cc9f0' : '#ff5a5f') : TEAM_COL[p.tm | 0];
    g.strokeStyle = col; g.lineWidth = 3; g.globalAlpha = alpha * 0.85;
    g.beginPath(); g.ellipse(0, 6, 22, 16, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = alpha;
    if (p.pfl & 1) { g.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(game.time * 10)})`; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.stroke(); }
    if (p.pfl & 4) { g.fillStyle = '#4cf0d0'; g.font = '700 11px Rubik, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('⦸', 0, -34); }
  }
  if (p.flash > 0) { p.flash -= 1 / 60; g.fillStyle = 'rgba(255,90,90,0.35)'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill(); }
  if (alive && fxk === 'spin') { // the Kılıççı's whirlwind (Kasırga): the blade circles all around, everything inside is cut
    const T = game.time, R = 64, sp = T * 16;
    // the ground under the storm
    const gr = g.createRadialGradient(0, 0, 18, 0, 0, R + 18);
    gr.addColorStop(0, 'rgba(232,241,255,0)'); gr.addColorStop(0.75, 'rgba(232,241,255,0.10)'); gr.addColorStop(1, 'rgba(232,241,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R + 18, 0, Math.PI * 2); g.fill();
    g.setLineDash([10, 14]); g.lineDashOffset = -T * 120; g.strokeStyle = 'rgba(232,241,255,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, R + 10, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    // the blade's trail: a fading sweep behind it, two passes for the doubled image of a fast spin
    g.lineCap = 'round';
    for (const off of [0, Math.PI]) {
      for (let k = 0; k < 7; k++) {
        const a = sp + off - k * 0.16;
        g.globalAlpha = (1 - k / 7) * 0.55; g.strokeStyle = k === 0 ? '#ffffff' : '#e8f1ff'; g.lineWidth = k === 0 ? 4 : 6 - k * 0.6;
        g.beginPath(); g.arc(0, 0, R - 6, a - 0.16, a); g.stroke();
      }
      const a = sp + off;
      g.globalAlpha = 0.9; g.strokeStyle = '#ffffff'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); g.lineTo(Math.cos(a) * (R + 2), Math.sin(a) * (R + 2)); g.stroke();
    }
    // wind streaks
    g.strokeStyle = 'rgba(232,241,255,0.4)'; g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { const a0 = T * 9 + i * 1.257, r = 34 + ((i * 13 + T * 60) % 34); g.globalAlpha = 0.25 + 0.3 * Math.sin(T * 7 + i); g.beginPath(); g.arc(0, 0, r, a0, a0 + 0.7); g.stroke(); }
    g.globalAlpha = alpha; g.lineCap = 'butt';
  }
  if (alive && fxk && fxk !== 'shadow' && fxk !== 'spin') drawAura(g, fxk, game.time);
  if (alive && p.power > 0) { g.fillStyle = `rgba(255,107,44,${0.18 + 0.1 * Math.sin(game.time * 10)})`; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill(); }
  if (alive && p.chill > 0) { g.fillStyle = 'rgba(159,227,255,0.22)'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(220,245,255,0.7)'; g.lineWidth = 1.5; g.stroke(); }
  if (alive && p.haste > 0) { g.strokeStyle = 'rgba(76,201,240,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 24, game.time * 6, game.time * 6 + 2); g.stroke(); }
  if (!alive && !pv) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);
    g.strokeStyle = `rgba(229,72,77,${0.35 + pulse * 0.35})`; g.lineWidth = 2;
    g.setLineDash([5, 5]);
    g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    if (p.rev > 0) {
      g.strokeStyle = '#43d17a'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.rev)); g.stroke();
    }
  }
  g.scale(1.15, 1.15);
  const eq = (info && info.eq) || {};
  const swg = cls === 'kilicci' && game.swings && game.swings.get(pid), swp = swg ? (game.time - swg.t) / 0.2 : -1;
  drawCharacter(g, cls, col, alive ? (fxk === 'spin' ? game.time * 16 : p.a || 0) : 0.6, p.walk || 0, { alive, me: pid === game.me, wt: p.wt || 0, wp: p.wp || 0, wb: p.wb || 0, bash: p.bashT || 0, power: p.power > 0, time: game.time, hat: eq.hat, wsk: eq.wsk, sw: swp, sd: swg ? swg.d : 0, rc: pid === game.me ? game.recoil || 0 : game.recoils && game.recoils.has(pid) ? Math.max(0, 1 - (game.time - game.recoils.get(pid)) * 9) : 0 });
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

  // feet: boots with a lighter toe cap
  g.fillStyle = '#1c1f1c';
  g.beginPath(); g.ellipse(stride, -6.5, 5.5, 3.5, 0, 0, Math.PI * 2); g.ellipse(-stride, 6.5, 5.5, 3.5, 0, 0, Math.PI * 2); g.fill();
  if (DETAIL) { g.fillStyle = '#3a3f3a'; g.beginPath(); g.ellipse(stride + 2.6, -6.5, 2.2, 2.2, 0, 0, Math.PI * 2); g.ellipse(-stride + 2.6, 6.5, 2.2, 2.2, 0, 0, Math.PI * 2); g.fill(); }

  // gear on the back
  drawBack(g, cls, color);

  // torso
  g.fillStyle = cls === 'nisanci' ? '#3a4a30' : color;
  g.beginPath(); g.ellipse(-1, 0, 9.5, cls === 'kalkanci' ? 16.5 : 15, 0, 0, Math.PI * 2); g.fill();
  if (DETAIL && alive) {
    // light on the front, shadow at the back, a strap across the chest and shoulder pads: reads as a body, not a disc
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(-5, 0, 5, cls === 'kalkanci' ? 15 : 13.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.ellipse(3, -2, 4, 9, 0, 0, Math.PI * 2); g.fill();
    if (cls !== 'kalkanci') { g.fillStyle = shade(cls === 'nisanci' ? '#3a4a30' : color, -40); for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(0, sd * 11.5, 4.2, 3.4, 0, 0, Math.PI * 2); g.fill(); } }
    g.strokeStyle = 'rgba(30,24,16,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -10); g.lineTo(5, 9); g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(-1, 0, 9.5, cls === 'kalkanci' ? 16.5 : 15, 0, 0, Math.PI * 2); g.stroke();
  if (cls === 'nisanci') { // ghillie fringe in team colour
    g.strokeStyle = color; g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-4, i * 4); g.lineTo(-11, i * 4.5 + 1); g.stroke(); }
  }
  if (cls === 'kalkanci') {
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
  if (cls === 'komutan') { // medals on the chest
    g.fillStyle = '#ffd34d'; for (const y of [-5, -1, 3]) { g.beginPath(); g.arc(2, y, 1.6, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#c4182c'; g.fillRect(0.5, -8, 3, 2);
  }
  if (cls === 'kimyager') { g.fillStyle = 'rgba(157,255,107,0.5)'; g.fillRect(-6, -8, 3, 16); }
  if (cls === 'izci') {
    g.fillStyle = '#c0392b';
    g.beginPath(); g.ellipse(-3, 0, 5, 10, 0, 0, Math.PI * 2); g.fill();
  }

  // weapon and arms; a Dipçik thrusts them forward
  const thrust = opts.bash > 0 ? Math.sin((1 - opts.bash / 0.25) * Math.PI) * 9 : 0;
  g.save();
  if (thrust) g.translate(thrust, 0);
  if (opts.rc > 0) g.translate(-opts.rc * (opts.wt && weaponOf(cls, opts.wt, opts.wp || 1, opts.wb || 0).heavy ? 6 : 3.5), 0); // the gun kicks back on each shot
  // a sword swing: the blade sweeps from one side to the other (opts.sw: 0..1 through the swing, opts.sd: direction)
  if (opts.sw != null && opts.sw >= 0 && opts.sw < 1) {
    const e = 1 - (1 - opts.sw) ** 3, from = 1.25, to = -1.05;
    g.rotate((opts.sd ? -1 : 1) * (from + (to - from) * e));
    g.translate(Math.sin(opts.sw * Math.PI) * 4, 0);
  }
  drawWeapon(g, cls, COS[opts.wsk]);
  if (opts.wt) drawWeaponMod(g, cls, opts.wt, opts.wp || 1, opts.time || 0, opts.wb || 0);
  drawArms(g, cls, dark);
  g.restore();

  // head and headgear
  g.fillStyle = SKIN;
  g.beginPath(); g.arc(1, 0, 6.5, 0, Math.PI * 2); g.fill();
  if (DETAIL && alive) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(-0.5, 0, 6, Math.PI * 0.5, Math.PI * 1.5); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(1, 0, 6.5, 0, Math.PI * 2); g.stroke(); }
  if (opts.hat && alive) drawHat(g, opts.hat, color, opts.time || 0); else drawHead(g, cls, color);
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
    case 'kalkanci': g.fillStyle = '#4a4f55'; rr(g, -19, -10, 10, 20, 3); g.fill(); g.strokeStyle = '#2d3135'; g.lineWidth = 1.5; g.stroke(); break;
    case 'alevci':
      for (const s of [-1, 1]) { g.fillStyle = '#b8352a'; rr(g, -20, s * 5 - 4, 11, 8, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-18, s * 5 - 3, 6, 1.5); }
      g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, 5); g.quadraticCurveTo(0, 14, 12, 6); g.stroke(); break;
    case 'bombaci':
      g.fillStyle = '#5a4630'; rr(g, -17, -7, 8, 14, 2); g.fill();
      g.fillStyle = '#4a5a2a'; for (const y of [-4, 0, 4]) { g.beginPath(); g.arc(-13, y, 2.4, 0, Math.PI * 2); g.fill(); } break;
    case 'izci': g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-16, 4, -20, -2); g.stroke(); break;
    case 'muhendis': g.fillStyle = '#3d4652'; rr(g, -19, -9, 10, 18, 3); g.fill(); g.fillStyle = '#7bdff2'; g.fillRect(-16, -5, 4, 3); g.fillRect(-16, 2, 4, 3);
      g.strokeStyle = '#2a2f36'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-14, -9); g.lineTo(-14, -14); g.stroke(); g.fillStyle = '#ff5a5f'; g.beginPath(); g.arc(-14, -15, 1.6, 0, Math.PI * 2); g.fill(); break;
    case 'kimyager': for (const s of [-1, 1]) { g.fillStyle = '#2f4a2a'; rr(g, -20, s * 5 - 4, 11, 8, 4); g.fill(); g.fillStyle = '#9dff6b'; g.fillRect(-18, s * 5 - 2, 7, 3); }
      g.strokeStyle = '#2a3a28'; g.lineWidth = 2; g.beginPath(); g.moveTo(-10, -5); g.quadraticCurveTo(0, -14, 10, -4); g.stroke(); break;
    case 'komutan': g.fillStyle = '#5a1e22'; g.beginPath(); g.moveTo(-6, -11); g.quadraticCurveTo(-22, -6, -20, 0); g.quadraticCurveTo(-22, 6, -6, 11); g.closePath(); g.fill(); break;
    case 'tesla': g.fillStyle = '#2f3640'; rr(g, -20, -8, 11, 16, 3); g.fill(); g.strokeStyle = '#b87333'; g.lineWidth = 2; for (const y of [-5, -1, 3]) { g.beginPath(); g.moveTo(-19, y); g.lineTo(-10, y + 1); g.stroke(); }
      g.fillStyle = '#7ad8ff'; g.beginPath(); g.arc(-14.5, 0, 2, 0, Math.PI * 2); g.fill(); break;
    case 'avci': g.fillStyle = '#5b4026'; rr(g, -19, -4, 12, 9, 3); g.fill(); g.strokeStyle = '#d8c7a0'; g.lineWidth = 1.4; for (const y of [-3, -0.5, 2]) { g.beginPath(); g.moveTo(-21, y); g.lineTo(-8, y - 1.5); g.stroke(); }
      g.fillStyle = '#c0392b'; for (const y of [-3, -0.5, 2]) g.fillRect(-22, y - 0.8, 2.5, 1.6); break;
    case 'kilicci': g.fillStyle = '#3a2418'; g.save(); g.rotate(-0.5); rr(g, -24, -3, 22, 6, 2); g.fill(); g.fillStyle = '#c9971b'; g.fillRect(-5, -4, 3, 8); g.restore();
      g.fillStyle = '#7a1e22'; g.beginPath(); g.moveTo(-6, -11); g.quadraticCurveTo(-18, 0, -6, 11); g.closePath(); g.fill(); break;
    case 'egitmen': g.fillStyle = '#5a4630'; rr(g, -17, -8, 9, 16, 3); g.fill(); g.strokeStyle = '#c0392b'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-9, 6); g.quadraticCurveTo(-4, 13, 4, 10); g.stroke();
      g.fillStyle = '#d8c7a0'; g.beginPath(); g.arc(-12.5, -3, 2, 0, Math.PI * 2); g.fill(); break;
    case 'ajan': g.fillStyle = '#16181c'; g.beginPath(); g.moveTo(-5, -12); g.quadraticCurveTo(-21, -8, -20, 0); g.quadraticCurveTo(-21, 8, -5, 12); g.closePath(); g.fill();
      g.strokeStyle = '#2c2f36'; g.lineWidth = 1; g.stroke(); break;
    case 'hacker': g.fillStyle = '#23262e'; rr(g, -19, -9, 11, 18, 3); g.fill(); g.fillStyle = '#4cf0d0'; g.fillRect(-17, -6, 7, 1.4); g.fillRect(-17, -2, 5, 1.4); g.fillRect(-17, 2, 6, 1.4);
      g.fillStyle = 'rgba(76,240,208,0.25)'; g.fillRect(-18, -8, 9, 16); break;
    default: break;
  }
  void color;
}

function drawWeapon(g, cls, sk) {
  const M = sk ? sk.m : '#191c19', W = sk ? sk.w : '#6b4a2b';
  switch (cls) {
    case 'asker': g.fillStyle = M; g.fillRect(6, 1.5, 28, 5); g.fillRect(14, 6, 4, 5); g.fillStyle = '#2a2f2a'; g.fillRect(2, 2, 6, 4); break;
    case 'doktor': g.fillStyle = M; g.fillRect(6, 1.5, 20, 5); g.fillRect(12, 6, 3, 6); break;
    case 'tamirci': g.fillStyle = W; g.fillRect(2, 1.5, 10, 6); g.fillStyle = M; g.fillRect(10, 2, 22, 4.5); g.fillStyle = '#3a2a1a'; g.fillRect(16, 2, 6, 5); break;
    case 'nisanci': g.fillStyle = W; g.fillRect(2, 2, 10, 5); g.fillStyle = M; g.fillRect(10, 3, 32, 3.5); g.fillStyle = '#0d0f0d'; g.fillRect(14, 0, 10, 2.5); g.fillStyle = '#7bdff2'; g.fillRect(23, 0.5, 1.5, 1.5); break;
    case 'kalkanci':
      g.fillStyle = '#2a2d2a'; g.fillRect(4, 0, 16, 8);
      g.fillStyle = M; for (const y of [0.8, 3.2, 5.6]) g.fillRect(18, y, 18, 1.8);
      g.fillStyle = '#3d423d'; g.fillRect(30, 0, 3, 8); break;
    case 'alevci': g.fillStyle = '#2c2c2c'; g.fillRect(4, 1, 24, 6.5); g.fillStyle = '#b8352a'; g.fillRect(10, 7, 6, 4); g.fillStyle = '#ff9a3c'; g.fillRect(28, 2.5, 3, 3.5); break;
    case 'bombaci': g.fillStyle = '#3f4a2a'; g.fillRect(4, 0, 26, 9); g.fillStyle = '#1e2414'; g.beginPath(); g.arc(30, 4.5, 4.5, 0, Math.PI * 2); g.fill(); break;
    case 'izci': g.fillStyle = M; g.fillRect(12, -9, 13, 4); g.fillRect(12, 5, 13, 4); break;
    case 'muhendis': g.fillStyle = W; g.fillRect(3, 2, 8, 5); g.fillStyle = M; g.fillRect(9, 1.5, 22, 5); g.fillStyle = '#7bdff2'; g.fillRect(14, 0, 6, 1.6); g.fillStyle = M; g.fillRect(14, 6, 3, 4); break;
    case 'kimyager': g.fillStyle = M; g.fillRect(6, 1.5, 22, 5.5); g.fillStyle = '#4a7a3a'; g.beginPath(); g.arc(14, 9, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9dff6b'; g.beginPath(); g.arc(14, 9, 2.4, 0, Math.PI * 2); g.fill(); g.fillRect(26, 2.5, 3, 3.5); break;
    case 'komutan': g.fillStyle = M; g.fillRect(10, 2, 15, 4.5); g.fillRect(12, 6, 3.5, 5); g.fillStyle = '#c9971b'; g.fillRect(10, 2, 4, 4.5); break;
    case 'tesla': g.fillStyle = M; g.fillRect(6, 1.5, 20, 5.5); g.fillStyle = '#b87333'; for (const x of [12, 16, 20]) g.fillRect(x, 0.5, 2, 7.5); g.fillStyle = '#7ad8ff'; g.beginPath(); g.arc(28, 4.2, 3, 0, Math.PI * 2); g.fill(); g.fillRect(12, 7, 3, 4); break;
    case 'avci': g.fillStyle = W; g.fillRect(4, 2.5, 26, 3.5); g.strokeStyle = M; g.lineWidth = 2.4; g.beginPath(); g.moveTo(26, -7); g.quadraticCurveTo(31, 4, 26, 15); g.stroke();
      g.strokeStyle = '#d8d0b8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(26, -7); g.lineTo(14, 4); g.lineTo(26, 15); g.stroke(); g.fillStyle = '#aaa'; g.fillRect(28, 3, 5, 2.5); break;
    case 'kilicci': g.fillStyle = '#3a2418'; g.fillRect(6, 2, 7, 4); g.fillStyle = '#c9971b'; g.fillRect(12, -1.5, 3, 11); g.fillStyle = sk ? sk.s : '#dfe6ee';
      g.beginPath(); g.moveTo(15, 1.6); g.lineTo(44, 2.6); g.lineTo(48, 4); g.lineTo(44, 5.4); g.lineTo(15, 6.4); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(16, 3.4, 26, 0.9); break;
    case 'egitmen': g.fillStyle = M; g.fillRect(9, 2, 16, 4.5); g.fillRect(11, 6, 3.5, 5); g.fillStyle = '#5a4630'; g.fillRect(11, 6.5, 3.5, 4); break;
    case 'ajan': g.fillStyle = M; g.fillRect(9, 2.2, 14, 4); g.fillRect(11, 6, 3.2, 4.6); g.fillStyle = '#2b2f36'; g.fillRect(22, 2.6, 13, 3.2); break;
    case 'hacker': g.fillStyle = M; g.fillRect(8, 1.6, 18, 5); g.fillRect(11, 6, 3.4, 4.6); g.fillStyle = '#4cf0d0'; g.fillRect(13, 0, 6, 1.4); g.beginPath(); g.arc(26, 4.1, 1.8, 0, Math.PI * 2); g.fill(); break;
    default: break;
  }
  if (sk) { // the skin's accent stripe along the gun
    g.fillStyle = sk.s;
    if (cls === 'izci') { g.fillRect(14, -8, 9, 1.3); g.fillRect(14, 6, 9, 1.3); } else g.fillRect(10, 3.2, 16, 1.4);
    if (sk.glow) { g.globalAlpha *= 0.35; g.fillRect(9, 2.2, 18, 3.4); g.globalAlpha /= 0.35; }
  }
}

// Shop hats, seen from above (the character faces +x).
function drawHat(g, id, color, time) {
  const C = (c) => { g.fillStyle = c; }, O = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  switch (id) {
    case 'h.bere': C('#7a2532'); O(-0.5, 0, 8.2); C('#9c3342'); O(-1.5, 0, 5); C('#5e1a25'); g.fillRect(-1, -8, 2, 16); break;
    case 'h.kulaklik':
      g.strokeStyle = '#1d1f24'; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 7.5, -Math.PI / 2 - 0.2, Math.PI / 2 + 0.2, true); g.stroke();
      C('#2a2d33'); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(0.5, s * 7.5, 3.6, 2.6, 0, 0, Math.PI * 2); g.fill(); }
      C(color); for (const s of [-1, 1]) O(0.5, s * 7.5, 1.3); break;
    case 'h.bandana':
      C('#c0392b'); O(0, 0, 7.6); C('#e8e2d0'); for (const [x, y] of [[-2, -3], [2, 2], [-3, 3], [3, -3]]) O(x, y, 0.9);
      C('#a32d22'); g.beginPath(); g.moveTo(-7, -1.5); g.lineTo(-13, -4 + Math.sin(time * 8)); g.lineTo(-12, 0); g.lineTo(-13, 4 + Math.sin(time * 8 + 1)); g.lineTo(-7, 1.5); g.fill(); break;
    case 'h.ninja':
      g.strokeStyle = '#111'; g.lineWidth = 3.2; g.beginPath(); g.arc(1, 0, 6.6, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#d61f3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-13, -3 + Math.sin(time * 9) * 2, -19, -1); g.moveTo(-6, 1); g.quadraticCurveTo(-13, 5 + Math.sin(time * 9 + 1) * 2, -18, 5); g.stroke(); break;
    case 'h.sef':
      C('#f4f2ec'); for (const [x, y] of [[-2, -3], [-2, 3], [2, 0], [-4, 0], [0, -4], [0, 4]]) O(x, y, 4.3);
      g.strokeStyle = 'rgba(0,0,0,0.15)'; g.lineWidth = 1; g.beginPath(); g.arc(-1, 0, 8.5, 0, Math.PI * 2); g.stroke(); break;
    case 'h.kovboy':
      C('#6b4a2b'); g.beginPath(); g.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); g.fill();
      C('#8a6238'); g.beginPath(); g.ellipse(-0.5, 0, 6.5, 7.2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a2614'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(-0.5, 0, 7, 7.7, 0, 0, Math.PI * 2); g.stroke();
      C('#5a3c20'); g.fillRect(-1, -6, 2, 12); break;
    case 'h.viking':
      C('#e8e1cf'); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-1, s * 6); g.quadraticCurveTo(2, s * 13, 7, s * 15); g.quadraticCurveTo(1, s * 11, 2, s * 6); g.fill(); }
      C('#8a8f96'); O(0, 0, 8); C('#6d7279'); g.fillRect(-8, -1.2, 16, 2.4); g.fillRect(-1.2, -8, 2.4, 16);
      C('#c9971b'); for (const [x, y] of [[4, 4], [-4, 4], [4, -4], [-4, -4]]) O(x, y, 1.1); break;
    case 'h.tac':
      C('#c9971b'); O(0, 0, 8.4); C('#ffe27a'); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a - 0.3) * 6.5, Math.sin(a - 0.3) * 6.5); g.lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5); g.lineTo(Math.cos(a + 0.3) * 6.5, Math.sin(a + 0.3) * 6.5); g.fill(); }
      C('#7a0f1c'); O(0, 0, 3.5); C('#e33'); O(5.2, 0, 1.4); C('#3df'); O(-5.2, 0, 1.4); break;
    case 'h.hale':
      drawHead(g, 'asker', color);
      g.strokeStyle = `rgba(255,232,140,${0.75 + 0.25 * Math.sin(time * 4)})`; g.lineWidth = 2.4; g.beginPath(); g.ellipse(-3, 0, 9, 10, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,232,140,0.25)'; g.lineWidth = 6; g.stroke(); break;
    case 'h.kabak':
      C('#e07b1a'); for (const y of [-4, 0, 4]) { g.beginPath(); g.ellipse(0, y, 8.5, 4.6, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#a3510c'; g.lineWidth = 1; for (const y of [-2, 2]) { g.beginPath(); g.moveTo(-8, y); g.lineTo(8, y); g.stroke(); }
      C('#3f6b1e'); g.fillRect(-2, -1, 4, 2); C('#ffd34d'); g.beginPath(); g.moveTo(6, -3); g.lineTo(8.5, -1.5); g.lineTo(6, 0); g.fill(); break;
    case 'h.kask':
      C('#4b5320'); O(0, 0, 8.6); C('#5d6629'); O(-1, -1, 6.4); C('#3a4118'); g.fillRect(-2, -8.6, 4, 17.2);
      g.strokeStyle = '#2b2f14'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 8.6, 0, Math.PI * 2); g.stroke();
      C('#d9c27a'); O(4, 0, 1.6); break;
    case 'h.noel':
      C('#c4182c'); O(0, 0, 7.8); g.beginPath(); g.moveTo(-3, -5); g.quadraticCurveTo(-12, -2, -15, 4); g.lineTo(-3, 5); g.fill();
      C('#f4f2ec'); O(-15, 4, 3); g.strokeStyle = '#f4f2ec'; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 7.8, 0, Math.PI * 2); g.stroke(); break;
    default: drawHead(g, 'asker', color);
  }
}

// Just the gun, for the armory's path buttons.
export function drawWeaponPreview(g, cls, wt, wp, w, h, wb = 0, time = 0) {
  g.clearRect(0, 0, w, h);
  g.save();
  const m = MUZZLE[cls] || MUZZLE.asker;
  const len = m[0] + (wt && weaponOf(cls, wt, wp, wb).gfx === 3 ? 14 : 6) + 24;
  const k = Math.min((w - 16) / len, (h - 8) / 22);
  g.translate((w - len * k) / 2 + 24 * k, h / 2 - 4 * k);
  g.scale(k, k);
  if (cls === 'izci') g.translate(-10, 2);
  drawWeapon(g, cls);
  if (wt) drawWeaponMod(g, cls, wt, wp, time, wb);
  g.restore();
}

// Mühendis drones: a small quadcopter (attack) or a white one with a cross and a healing ring (repair).
function drawDrone(g, t) {
  const now = performance.now() / 1000, rep = t.k === 2;
  g.save();
  g.translate(t.x, t.y);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(5, 14, 9, 5, 0, 0, Math.PI * 2); g.fill();
  if (rep) {
    const r = 180, pulse = (now * 0.8) % 1;
    g.strokeStyle = `rgba(67,209,122,${0.35 * (1 - pulse)})`; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, r * pulse, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(67,209,122,0.18)'; g.setLineDash([6, 8]); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  g.rotate(t.a || 0);
  g.strokeStyle = rep ? '#d8dcd8' : '#2a2f36'; g.lineWidth = 2;
  for (const [x, y] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke();
    g.fillStyle = 'rgba(200,220,230,0.35)'; g.beginPath(); g.ellipse(x, y, 4.5, 4.5 * Math.abs(Math.sin(now * 40 + x)), 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = rep ? '#eef1ee' : '#3d4652'; g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill();
  if (rep) { g.fillStyle = '#43d17a'; g.fillRect(-1, -3, 2, 6); g.fillRect(-3, -1, 6, 2); }
  else { g.fillStyle = '#7bdff2'; g.fillRect(3, -1, 4, 2); }
  g.restore();
}

// Komutan's supply crate, with a small parachute while it lands.
function drawCrate(g, t) {
  g.save(); g.translate(t.x, t.y);
  const land = Math.max(0, (t.life || 0) - 5);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-11, -8, 26, 22);
  if (land > 0) { g.fillStyle = 'rgba(240,240,230,0.7)'; g.beginPath(); g.arc(0, -16 - land * 20, 16, Math.PI, 0); g.fill(); }
  g.fillStyle = '#6b5232'; g.fillRect(-12, -12, 24, 24);
  g.strokeStyle = '#3d2e1a'; g.lineWidth = 2; g.strokeRect(-12, -12, 24, 24);
  g.fillStyle = '#ffd34d'; star(g, 0, 0, 7);
  g.restore();
}

// Where each class's weapon ends and what height its barrel sits at (izci has two pistols).
const MUZZLE = { asker: [34, 4], doktor: [26, 4], tamirci: [32, 4.2], nisanci: [42, 4.7], kalkanci: [36, 4], alevci: [31, 4.2], bombaci: [34, 4.5], izci: [25, -7, 7], muhendis: [32, 4], kimyager: [30, 4.2], komutan: [24, 4], tesla: [31, 4.2], avci: [33, 4.2] };
// a weapon's colour and gun model come from its path (every class has its own four)
const wLook = (cls, wt, wp, wb) => { const W = weaponOf(cls, wt, wp, wb); return { col: W.col || '#ffe1a6', gfx: W.gfx || 1 }; };

// Visible parts an upgraded weapon gets, different for each of the four paths; tier 2 adds more.
function drawWeaponMod(g, cls, wt, wp, time, wb = 0) {
  const L = wLook(cls, wt, wp, wb);
  drawWeaponMod2(g, cls, wt, L.gfx, time, L.col);
  if (wt >= 3) drawWeaponHigh(g, cls, wt, L.col, time, wb);
}

// Levels 3-5: a branch stripe, extra parts and, at the top level, a pulsing glow.
function drawWeaponHigh(g, cls, wt, col, time, wb) {
  const m = MUZZLE[cls] || MUZZLE.asker;
  const ys = m.length > 2 ? [m[1], m[2]] : [m[1]];
  const x = m[0];
  const small = ys.length > 1;
  for (const y of ys) {
    // branch marking: one bar for the first branch, two for the second
    g.fillStyle = col;
    for (let i = 0; i < (wb === 2 ? 2 : 1); i++) g.fillRect(x - (small ? 14 : 24) + i * 3.5, y - 2.4, 2, 4.8);
    if (wt >= 4) { // rail under the barrel and a side box
      g.fillStyle = '#262a26'; g.fillRect(x - (small ? 13 : 22), y + 2.6, small ? 9 : 16, 2.2);
      g.fillStyle = col; g.fillRect(x - (small ? 6 : 9), y + 2.8, 2, 1.8);
      if (!small) { g.fillStyle = '#1d211d'; rr(g, x - 26, y - 6.8, 7, 4, 1.5); g.fill(); g.fillStyle = col; g.fillRect(x - 24.5, y - 5.6, 3.5, 1.4); }
    }
    if (wt >= 5) { // top level: glowing core along the barrel
      const k = 0.55 + 0.45 * Math.sin(time * 6 + y);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 * k;
      g.fillStyle = col;
      g.beginPath(); g.ellipse(x - 6, y, small ? 10 : 16, 6, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.9 * k;
      g.fillRect(x - (small ? 10 : 18), y - 0.6, small ? 10 : 18, 1.2);
      g.beginPath(); g.arc(x + 2, y, 2.4, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
}

function drawWeaponMod2(g, cls, wt, wp, time, col) {
  const m = MUZZLE[cls] || MUZZLE.asker;
  const ys = m.length > 2 ? [m[1], m[2]] : [m[1]];
  const x = m[0], two = wt >= 2;
  const M = '#191c19';
  for (const y of ys) {
    const small = ys.length > 1;
    if (wp === 1) { // Ağır: thick barrel shroud and a muzzle brake
      g.fillStyle = '#2b2f2b'; g.fillRect(x - (small ? 9 : 14), y - 3.6, small ? 9 : 14, 7.2);
      g.fillStyle = M; g.fillRect(x, y - (two ? 4.2 : 3.4), two ? 6 : 4, two ? 8.4 : 6.8);
      g.fillStyle = '#555c55'; g.fillRect(x + 1, y - 1, two ? 4 : 2, 2);
      g.fillStyle = col; g.fillRect(x - (small ? 8 : 12), y - 3.6, 2.2, 7.2);
      if (two) { g.fillRect(x - (small ? 4 : 6), y - 3.6, 2.2, 7.2); g.fillStyle = '#2b2f2b'; g.fillRect(x - 20, y + 3, 9, 4); }
    } else if (wp === 2) { // Seri: drum magazine and a vented barrel
      g.fillStyle = '#2b2f2b'; g.fillRect(x - (small ? 8 : 12), y - 2.8, small ? 8 : 12, 5.6);
      g.fillStyle = '#6a706a'; for (let i = 0; i < (small ? 2 : 4); i++) g.fillRect(x - (small ? 7 : 11) + i * 3, y - 1.5, 1.4, 3);
      const dr = two ? 5 : 4.2, dx = x - (small ? 6 : 11), dy = y + (small ? 0 : 8);
      if (!small) { g.fillStyle = '#2f342f'; g.beginPath(); g.arc(dx, dy, dr, 0, Math.PI * 2); g.fill(); g.strokeStyle = col; g.lineWidth = 1.6; g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(dx, dy, 1.4, 0, Math.PI * 2); g.fill(); }
      else { g.fillStyle = col; g.fillRect(x - 9, y - 3.2, 8, 1.3); }
      if (two && !small) { g.fillStyle = M; g.fillRect(x, y - 3.2, 3, 2); g.fillRect(x, y + 1.2, 3, 2); }
    } else if (wp === 3) { // Delici: long thin barrel and a scope
      const ext = two ? 12 : 7;
      g.fillStyle = M; g.fillRect(x - 1, y - 1.3, ext + 1, 2.6);
      g.fillStyle = col; g.fillRect(x + ext - 2, y - 1.6, 2, 3.2);
      if (!small) { g.fillStyle = '#101210'; g.fillRect(x - 22, y - 7, 12, 3); g.fillStyle = col; g.fillRect(x - 11, y - 6.6, 1.6, 2.2); }
      if (two) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 6, y - 2.6); g.lineTo(x + ext - 3, y - 2.6); g.stroke(); }
    } else if (wp === 5) { // Zehir: green vial and a dripping tip
      g.fillStyle = '#2b2f2b'; g.fillRect(x - (small ? 8 : 12), y - 2.6, small ? 8 : 12, 5.2);
      g.fillStyle = col; rr(g, x - (small ? 12 : 19), y - (small ? 7 : 9.5), small ? 5 : 7, small ? 4 : 5.5, 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - (small ? 11 : 17.5), y - (small ? 6.4 : 8.6), 1.4, small ? 2 : 3);
      if (two) { g.fillStyle = col; rr(g, x - (small ? 12 : 19), y + (small ? 3 : 4), small ? 5 : 7, small ? 4 : 5.5, 2); g.fill(); }
      const drip = (time * 2 + y) % 1;
      g.fillStyle = col; g.beginPath(); g.arc(x + 1, y + 2 + drip * 4, 1.3, 0, Math.PI * 2); g.fill();
    } else if (wp === 6) { // Elektrik: coils and a sparking tip
      g.strokeStyle = col; g.lineWidth = 1.3;
      const n = small ? 3 : two ? 6 : 4;
      for (let i = 0; i < n; i++) { const cx = x - (small ? 10 : 18) + i * 2.6; g.beginPath(); g.ellipse(cx, y, 1, small ? 3 : 4.2, 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = '#e6f7ff';
      if (Math.sin(time * 23 + y) > 0.2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y - 2); g.lineTo(x + 2.5, y); g.lineTo(x + 6, y + 2); g.lineTo(x + 1, y + 0.8); g.closePath(); g.fill(); }
      if (two && !small) { g.fillStyle = '#1d211d'; g.fillRect(x - 24, y + 3.5, 8, 4); g.fillStyle = col; g.fillRect(x - 23, y + 4.5, 2, 2); g.fillRect(x - 19.5, y + 4.5, 2, 2); }
    } else if (wp === 9) { // a blade under the barrel (bayonets, hooks, swords)
      g.fillStyle = '#c9ced3'; g.beginPath(); g.moveTo(x - 4, y + 2.6); g.lineTo(x + (two ? 12 : 8), y + 3.6); g.lineTo(x - 4, y + 5.4); g.closePath(); g.fill();
      g.fillStyle = col; g.fillRect(x - 8, y + 2.4, 4, 3.2);
      if (two) { g.strokeStyle = '#ffffff'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 2, y + 3.4); g.lineTo(x + 9, y + 3.9); g.stroke(); }
    } else if (wp === 10) { // a dish emitter with a pulsing ring (lasers, magnets, plasma)
      g.fillStyle = '#2b2f2b'; g.fillRect(x - (small ? 7 : 11), y - 2.4, small ? 7 : 11, 4.8);
      const pul = 0.6 + 0.4 * Math.sin(time * 8 + y);
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.ellipse(x + 1.5, y, 1.8, two ? 5 : 4, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = pul; g.fillStyle = col; g.beginPath(); g.arc(x + 1.5, y, 1.6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      if (!small) { g.fillStyle = '#1d211d'; g.fillRect(x - 20, y - 6.5, 8, 3); g.fillStyle = col; g.fillRect(x - 18.5, y - 5.8, 2, 1.6); }
    } else if (wp === 11) { // a second barrel on top (twin shots, scatter, mortars)
      g.fillStyle = M; g.fillRect(x - (small ? 6 : 10), y - 4.6, small ? 8 : 12, 2.4);
      g.fillStyle = col; g.fillRect(x + (small ? 1 : 1.5), y - 4.8, 1.6, 2.8);
      if (two && !small) { g.fillStyle = '#2b2f2b'; g.fillRect(x - 18, y + 3, 10, 3.5); g.fillStyle = col; g.fillRect(x - 16, y + 3.8, 2, 1.8); g.fillRect(x - 12, y + 3.8, 2, 1.8); }
    } else if (wp === 7) { // Yangın: fuel tank and a pilot flame at the muzzle
      g.fillStyle = '#7a2a1c'; rr(g, x - (small ? 12 : 20), y + (small ? 2 : 3.5), small ? 6 : 10, small ? 4 : 5, 2); g.fill();
      g.fillStyle = '#2b2f2b'; g.fillRect(x - (small ? 6 : 9), y - 2.6, small ? 6 : 9, 5.2);
      const fl = 0.7 + 0.3 * Math.sin(time * 20 + y);
      g.fillStyle = `rgba(255,154,60,${fl})`; g.beginPath(); g.ellipse(x + 2.5, y, 3 * fl + (two ? 1 : 0), 1.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x + 1.5, y, 1, 0, Math.PI * 2); g.fill();
      if (two) { g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x - (small ? 9 : 15), y + (small ? 2 : 3.5)); g.quadraticCurveTo(x - 5, y + 6, x - 2, y + 2.6); g.stroke(); }
    } else { // Buz: frost canisters and a glowing cold tip
      g.fillStyle = '#d9f4ff'; rr(g, x - (small ? 10 : 18), y - (small ? 6.5 : 8.5), small ? 6 : 9, 4, 2); g.fill();
      if (two) { rr(g, x - (small ? 10 : 18), y + (small ? 2.5 : 4.5), small ? 6 : 9, 4, 2); g.fill(); }
      g.fillStyle = '#3a8fc0'; g.fillRect(x - (small ? 7 : 14), y - (small ? 6 : 8), 1.5, 3);
      const glow = 0.6 + 0.4 * Math.sin(time * 5);
      g.fillStyle = `rgba(123,223,242,${glow})`; g.fillRect(x - 1, y - 2.4, 4, 4.8);
      g.fillStyle = '#e6fbff'; g.fillRect(x, y - 1, 2, 2);
    }
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
  const front = { asker: 22, doktor: 18, tamirci: 20, nisanci: 24, kalkanci: 16, alevci: 20, bombaci: 20, muhendis: 20, kimyager: 18, komutan: 13, tesla: 18, avci: 20, kilicci: 12, egitmen: 13, ajan: 13, hacker: 14 }[cls] || 20;
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
    case 'kalkanci':
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
    case 'muhendis':
      g.fillStyle = '#e8a33a'; g.beginPath(); g.arc(-0.5, 0, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a2f36'; rr(g, 3, -6, 4, 12, 2); g.fill(); g.fillStyle = '#7bdff2'; g.fillRect(4, -5, 2, 4); g.fillRect(4, 1, 2, 4); break;
    case 'kimyager':
      g.fillStyle = '#3a4a36'; g.beginPath(); g.arc(-0.5, 0, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9dff6b'; g.globalAlpha *= 0.85; rr(g, 2, -5, 5, 10, 2); g.fill(); g.globalAlpha /= 0.85;
      g.fillStyle = '#556052'; g.beginPath(); g.arc(7, 0, 3, 0, Math.PI * 2); g.fill(); break;
    case 'komutan':
      g.fillStyle = '#2f3a2a'; g.beginPath(); g.ellipse(0, 0, 8.5, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1f18'; g.fillRect(4, -7, 4, 14); g.fillStyle = '#ffd34d'; star(g, -1, 0, 3.2); break;
    case 'tesla':
      g.fillStyle = '#3a4048'; g.beginPath(); g.arc(-0.5, 0, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b87333'; g.fillRect(-2, -9, 3, 18);
      g.fillStyle = '#0d1418'; rr(g, 3, -5, 4.5, 10, 2); g.fill(); g.fillStyle = '#7ad8ff'; g.fillRect(4, -4, 2.5, 3); g.fillRect(4, 1, 2.5, 3); break;
    case 'avci':
      g.fillStyle = '#4b5a32'; g.beginPath(); g.arc(-1, 0, 8.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a4626'; g.beginPath(); g.moveTo(-9, -3); g.lineTo(-14, 0); g.lineTo(-9, 3); g.fill();
      g.fillStyle = SKIN; g.beginPath(); g.arc(4, 0, 3.2, -1.2, 1.2); g.fill(); break;
    case 'kilicci': // headband with trailing ends
      g.fillStyle = '#2a1c14'; g.beginPath(); g.arc(0, 0, 7.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c0392b'; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 7.2, -1.2, 1.2); g.stroke();
      g.beginPath(); g.moveTo(-6, 2); g.quadraticCurveTo(-13, 5, -16, 1); g.stroke(); break;
    case 'egitmen': // cap
      g.fillStyle = '#4a5a36'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a4628'; g.beginPath(); g.ellipse(6, 0, 5, 7, 0, -Math.PI / 2, Math.PI / 2); g.fill(); break;
    case 'ajan': // dark hood and glasses
      g.fillStyle = '#121418'; g.beginPath(); g.arc(0, 0, 8.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9a8cff'; g.fillRect(3, -4, 3, 2.4); g.fillRect(3, 1.6, 3, 2.4); break;
    case 'hacker': // headset with a glowing mic
      g.fillStyle = '#23262e'; g.beginPath(); g.arc(0, 0, 7.8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4cf0d0'; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, 8.4, -2.2, 2.2, true); g.stroke();
      g.fillStyle = '#4cf0d0'; g.beginPath(); g.arc(7, 6, 1.6, 0, Math.PI * 2); g.fill(); break;
    default: break;
  }
}

function star(g, x, y, s) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
  g.closePath(); g.fill();
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

function drawTag(g, p, info, isMe, game) {
  if (!info) return;
  const pv = game && game.pv, foe = !!pv && !isMe && (pv[0] === 'ffa' || p.tm !== game.self.tm);
  if (foe && (p.pfl & 2)) return;
  const y = p.y - PLAYER_R - 14;
  g.font = '600 12px Rubik, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.75)';
  const tagged = info.ct ? `[${info.ct}] ${info.name}` : info.name;
  g.fillText(tagged, p.x + 1, y - 5);
  const nc = info.eq && COS[info.eq.nc] ? COS[info.eq.nc].c : null;
  g.fillStyle = !p.alive ? '#9aa39a' : pv ? (isMe ? '#ffffff' : foe ? '#ff7b7f' : '#8fdcff') : nc === 'rainbow' ? `hsl(${(performance.now() / 8) % 360},90%,65%)` : nc || (isMe ? '#ffffff' : info.color);
  g.fillText(tagged, p.x, y - 6);
  if (p.wt > 0) { // weapon level badge after the name
    const tw = g.measureText(tagged).width;
    const bx = p.x + tw / 2 + 4, by = y - 16, txt = ROMAN[p.wt] || '';
    g.font = '700 9px Rubik, system-ui, sans-serif';
    const bw = g.measureText(txt).width + 7;
    g.fillStyle = 'rgba(0,0,0,0.7)'; rr(g, bx, by, bw, 12, 3); g.fill();
    const pc = weaponOf(info.cls || p.cls || 'asker', p.wt, p.wp, p.wb).col || '#fff';
    g.strokeStyle = pc; g.lineWidth = p.wt >= 5 ? 1.6 : 1; g.stroke();
    g.fillStyle = pc; g.textAlign = 'left';
    g.fillText(txt, bx + 3.5, by + 9.5);
    g.textAlign = 'center';
  }
  if (p.alive && p.maxHp) {
    const w = 34, k = clamp(p.hp / p.maxHp, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(p.x - w / 2, y, w, 4);
    g.fillStyle = k > 0.5 ? '#43d17a' : k > 0.25 ? '#f5c542' : '#e5484d';
    g.fillRect(p.x - w / 2, y, w * k, 4);
  }
}

// ---------- items in the world ----------
function drawZone(g, q, time) {
  const [id, k, x, y, r, left] = q;
  const a = Math.min(1, left * 3);
  if (k === 0) { // poison cloud
    for (let i = 0; i < 5; i++) {
      const ang = time * 0.6 + i * 1.256 + id, rr2 = r * 0.45;
      g.fillStyle = `rgba(120,190,60,${0.13 * a})`;
      g.beginPath(); g.arc(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2, r * 0.6, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = `rgba(143,209,79,${0.35 * a})`; g.lineWidth = 2; g.setLineDash([6, 8]);
    g.beginPath(); g.arc(x, y, r, time, time + Math.PI * 2); g.stroke(); g.setLineDash([]);
  } else if (k === 2) { // sticky tar
    g.fillStyle = `rgba(22,18,14,${0.62 * a})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(90,80,64,${0.35 * a})`;
    for (let i = 0; i < 4; i++) { const ang = i * 1.7 + id, d = r * (0.25 + (i % 2) * 0.3), bl = 3 + 2 * Math.sin(time * 2 + i * 2); g.beginPath(); g.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, bl, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = `rgba(60,52,40,${0.6 * a})`; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  } else { // ground fire
    g.fillStyle = `rgba(90,30,10,${0.35 * a})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 7; i++) {
      const ang = i * 0.9 + id, d = (i % 3) * r * 0.3;
      const fx = x + Math.cos(ang) * d, fy = y + Math.sin(ang) * d, h = 8 + 5 * Math.sin(time * 16 + i);
      g.fillStyle = i % 2 ? `rgba(255,154,60,${0.85 * a})` : `rgba(255,209,102,${0.85 * a})`;
      g.beginPath(); g.moveTo(fx - 5, fy + 3); g.quadraticCurveTo(fx, fy - h * 1.5, fx + 5, fy + 3); g.closePath(); g.fill();
    }
  }
}

function drawWall(g, w) {
  const [, x, y, a, hp] = w;
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, -46, -8, 96, 22, 6); g.fill();
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      const bx = -48 + i * 16 + (row ? 8 : 0);
      if (bx + 16 > 50) continue;
      g.fillStyle = row ? '#a58a58' : '#b99b66';
      rr(g, bx, -11 + row * 10, 16, 11, 4); g.fill();
      g.strokeStyle = '#6e5a36'; g.lineWidth = 1.2; g.stroke();
    }
  }
  g.restore();
  if (hp < 100) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 20, y - 26, 40, 4);
    g.fillStyle = hp > 50 ? '#c9a66b' : hp > 25 ? '#f5c542' : '#e5484d'; g.fillRect(x - 20, y - 26, 40 * hp / 100, 4);
  }
}

function drawLob(g, l) {
  const k = Math.min(1, l.t / l.max);
  const x = l.x0 + (l.x1 - l.x0) * k, y = l.y0 + (l.y1 - l.y0) * k;
  if (l.car) { // a wrecked car tumbling through the air
    const h = Math.sin(k * Math.PI) * 140, s = 1 + Math.sin(k * Math.PI) * 0.5;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y + 6, 26, 14, 0, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(x, y - h); g.rotate(l.t * 7); g.scale(s, s);
    g.fillStyle = '#7a3a2a'; rr(g, -22, -11, 44, 22, 5); g.fill(); g.fillStyle = '#3a2a24'; g.fillRect(-10, -9, 20, 18);
    g.fillStyle = 'rgba(160,200,230,0.5)'; g.fillRect(8, -8, 5, 16); g.fillStyle = '#1a1a1a'; for (const [a, b] of [[-15, -12], [11, -12], [-15, 10], [11, 10]]) g.fillRect(a, b, 6, 3);
    g.restore(); return;
  }
  const h = Math.sin(k * Math.PI) * 60;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y + 4, 6, 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4b5a2a'; g.beginPath(); g.arc(x, y - h, 5.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#23291a'; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = 'rgba(255,90,54,0.6)'; g.setLineDash([4, 5]); g.lineWidth = 1.5;
  g.beginPath(); g.arc(l.x1, l.y1, 30, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
}

function drawStrikeMark(g, m) {
  const pulse = 0.5 + 0.5 * Math.sin(m.t * 12);
  if (m.car) { // where Dev Hurda's car will land
    g.strokeStyle = `rgba(255,170,60,${0.5 + 0.4 * pulse})`; g.lineWidth = 3; g.setLineDash([8, 6]);
    g.beginPath(); g.arc(m.x, m.y, 90, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = `rgba(255,170,60,${0.08 + 0.08 * pulse})`; g.fill(); return;
  }
  g.strokeStyle = `rgba(255,59,48,${0.45 + 0.4 * pulse})`; g.lineWidth = 3;
  g.beginPath(); g.arc(m.x, m.y, 150, 0, Math.PI * 2); g.stroke();
  g.fillStyle = `rgba(255,59,48,${0.07 + 0.06 * pulse})`; g.fill();
  g.beginPath(); g.moveTo(m.x - 26, m.y); g.lineTo(m.x + 26, m.y); g.moveTo(m.x, m.y - 26); g.lineTo(m.x, m.y + 26); g.stroke();
}

function drawZap(g, z) {
  const k = 1 - z.t / z.max;
  g.strokeStyle = z.big ? '#e6f7ff' : '#bfe8ff'; g.lineWidth = z.big ? 4 : 2.2; g.globalAlpha = k;
  g.lineJoin = 'round';
  g.beginPath();
  const p = z.pts;
  g.moveTo(p[0], p[1]);
  for (let i = 2; i + 1 < p.length; i += 2) {
    const x0 = p[i - 2], y0 = p[i - 1], x1 = p[i], y1 = p[i + 1];
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(2, Math.round(Math.hypot(dx, dy) / 22));
    for (let j = 1; j < n; j++) {
      const t = j / n, jit = Math.sin(z.seed + i * 7 + j * 3.1 + z.t * 60) * 9;
      g.lineTo(x0 + dx * t - dy / (Math.hypot(dx, dy) || 1) * jit, y0 + dy * t + dx / (Math.hypot(dx, dy) || 1) * jit);
    }
    g.lineTo(x1, y1);
  }
  g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = z.big ? 1.6 : 0.9; g.stroke();
  g.globalAlpha = 1;
}

// the supply plane of the map event: its shadow and the plane itself cross the screen over the drop point
function drawPlane(g, q) {
  const k = q.t / q.max, d = (k - 0.5) * 2600;
  const x = q.x + Math.cos(q.a) * d, y = q.y + Math.sin(q.a) * d;
  g.save();
  g.translate(x + 60, y + 90); g.rotate(q.a);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath(); g.ellipse(0, 0, 70, 12, 0, 0, Math.PI * 2); g.fill(); g.fillRect(-16, -78, 26, 156); g.fillRect(-62, -26, 14, 52);
  g.restore();
  g.save();
  g.translate(x, y); g.rotate(q.a);
  g.fillStyle = '#5d6650'; g.strokeStyle = '#2c3126'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-60, -9); g.lineTo(52, -10); g.quadraticCurveTo(76, 0, 52, 10); g.lineTo(-60, 9); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-6, -80); g.lineTo(16, -80); g.lineTo(22, 80); g.lineTo(0, 80); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-60, -28); g.lineTo(-46, -28); g.lineTo(-44, 28); g.lineTo(-58, 28); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#3a4033'; for (const s of [-46, -24, 24, 46]) g.fillRect(14, s - 5, 14, 10);
  g.fillStyle = 'rgba(180,220,255,0.6)'; g.fillRect(48, -5, 8, 10);
  g.fillStyle = Math.sin(q.t * 18) > 0 ? '#ff4a3d' : '#3dff6a'; g.beginPath(); g.arc(4, -80, 3, 0, Math.PI * 2); g.fill();
  g.restore();
}

// ---------- pets: purely for looks, each one trails its owner on this screen only ----------
function petsStep(game, roster) {
  if (!game.pets) { game.pets = new Map(); game.petT = game.time; }
  const dt = Math.min(0.1, Math.max(0, game.time - game.petT)); game.petT = game.time;
  for (const pid of [...game.pets.keys()]) if (!game.ps.has(pid)) game.pets.delete(pid);
  for (const [pid, p] of game.ps) {
    const info = roster.get(pid), id = info && info.eq && info.eq.pet;
    if (!id || !PET_KIND[id]) { game.pets.delete(pid); continue; }
    let q = game.pets.get(pid);
    if (!q || q.id !== id) { q = { id, x: p.x - 30, y: p.y + 10, a: 0, mv: 0 }; game.pets.set(pid, q); }
    const fly = PET_KIND[id] === 'bird' || id === 'p.ejder';
    const back = p.alive ? (fly ? 22 : 34) : 26, side = fly ? Math.sin(game.time * 1.7 + pid) * 22 : 16;
    const fa = p.alive ? p.a || 0 : 0.6;
    const tx = p.x - Math.cos(fa) * back - Math.sin(fa) * side, ty = p.y - Math.sin(fa) * back + Math.cos(fa) * side;
    const dx = tx - q.x, dy = ty - q.y, d = Math.hypot(dx, dy);
    if (d > 600) { q.x = tx; q.y = ty; }
    const k = 1 - Math.exp(-dt * (fly ? 4 : 6));
    q.x += dx * k; q.y += dy * k;
    q.mv = Math.min(1, d / 30);
    if (d > 3) { const ta = Math.atan2(dy, dx); let da = ta - q.a; da = Math.atan2(Math.sin(da), Math.cos(da)); q.a += da * Math.min(1, dt * 10); }
    else { let da = fa - q.a; da = Math.atan2(Math.sin(da), Math.cos(da)); q.a += da * Math.min(1, dt * 3); }
  }
}
const PET_KIND = { zdog: 'wolf', k9: 'dog', 'p.kopek': 'dog', 'p.kedi': 'cat', 'p.tilki': 'fox', 'p.kurt': 'wolf', 'p.karga': 'bird', 'p.serce': 'bird', 'p.robot': 'robot', 'p.ejder': 'dragon' };
const PET_COL = { zdog: ['#6f6a4a', '#2f2a1a'], k9: ['#8a6234', '#2a2018'], 'p.kopek': ['#b07a45', '#6e4524'], 'p.kedi': ['#e0a050', '#9a5f22'], 'p.tilki': ['#e06a2c', '#8a3510'], 'p.kurt': ['#9aa3ad', '#59616b'], 'p.karga': ['#2b2f3a', '#11131a'], 'p.serce': ['#9c7b55', '#5a4228'], 'p.robot': ['#8fa3b8', '#4a5a6b'], 'p.ejder': ['#4fbf6a', '#1f6a34'] };
export function drawPet(g, id, x, y, a, t, mv = 0, happy = true) {
  const kind = PET_KIND[id]; if (!kind) return;
  const [c1, c2] = PET_COL[id];
  const C = (c) => { g.fillStyle = c; }, O = (px, py, r) => { g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); };
  const E = (px, py, rx, ry) => { g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  g.save(); g.translate(x, y);
  const fly = kind === 'bird' || kind === 'dragon';
  // shadow on the ground (further away when flying)
  C('rgba(0,0,0,0.28)'); E(fly ? 6 : 2, fly ? 9 : 3, kind === 'wolf' ? 13 : 10, 6);
  if (fly) g.translate(0, -4 - Math.sin(t * 4) * 2);
  g.rotate(a);
  const step = Math.sin(t * 14) * mv;
  if (kind === 'dog' || kind === 'cat' || kind === 'fox' || kind === 'wolf') {
    const L = kind === 'wolf' ? 1.25 : kind === 'cat' ? 0.9 : 1;
    g.scale(L, L);
    // legs
    C(c2); for (const [lx, ly] of [[5, -4], [5, 4], [-5, -4], [-5, 4]]) O(lx + (lx > 0 ? step : -step) * 2, ly * 1.2, 1.8);
    // tail
    const wag = Math.sin(t * (happy ? 12 : 3)) * (kind === 'cat' ? 0.25 : 0.5);
    g.save(); g.translate(-8, 0); g.rotate(Math.PI + wag);
    C(c1); if (kind === 'fox' || kind === 'wolf') { E(5, 0, 6, 3); if (kind === 'fox') { C('#f4efe6'); O(10, 0, 2.4); } } else { g.fillRect(0, -1.2, kind === 'cat' ? 10 : 7, 2.4); }
    g.restore();
    // body and head
    C(c1); E(0, 0, 8, 5);
    C(c2); E(-1, 0, 5, 2.4);
    C(c1); O(8, 0, 4.4);
    // ears
    C(c2);
    if (kind === 'dog') { E(7, -4, 2.2, 1.4); E(7, 4, 2.2, 1.4); }
    else { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(7, s * 2); g.lineTo(9.5, s * 5.5); g.lineTo(5, s * 4.6); g.closePath(); g.fill(); } }
    C(kind === 'fox' || kind === 'cat' ? '#2a1a10' : '#1a1410'); O(12, 0, 1.2);
    if (kind === 'fox') { C('#f4efe6'); O(10.5, 0, 1.6); C('#2a1a10'); O(12.2, 0, 1); }
  } else if (kind === 'bird') {
    const f = Math.sin(t * 22) * 0.9;
    C(c2); for (const s of [-1, 1]) { g.save(); g.scale(1, s); g.rotate(-0.3 - f * 0.4); E(-1, 6, 3, 6); g.restore(); }
    C(c1); E(0, 0, 6, 3.4); O(5, 0, 2.8);
    C(id === 'p.karga' ? '#3a3f4c' : '#e0b04a'); g.beginPath(); g.moveTo(7.4, -1.2); g.lineTo(10.4, 0); g.lineTo(7.4, 1.2); g.fill();
    C(c2); g.beginPath(); g.moveTo(-5, 0); g.lineTo(-10, -2.5); g.lineTo(-10, 2.5); g.closePath(); g.fill();
  } else if (kind === 'dragon') {
    const f = Math.sin(t * 9) * 0.6;
    C(c2); for (const s of [-1, 1]) { g.save(); g.scale(1, s); g.rotate(-0.2 - f * 0.5); g.beginPath(); g.moveTo(0, 2); g.lineTo(-4, 13); g.lineTo(2, 11); g.lineTo(5, 3); g.closePath(); g.fill(); g.restore(); }
    C(c1); g.beginPath(); g.moveTo(-6, -2); g.quadraticCurveTo(-14, Math.sin(t * 5) * 4, -17, 0); g.quadraticCurveTo(-14, 1, -6, 2); g.fill();
    E(0, 0, 7, 4); O(7, 0, 3.6);
    C('#f2c230'); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(7, s * 2); g.lineTo(5, s * 5); g.lineTo(9, s * 2.5); g.fill(); }
    C('#ffeb7a'); O(9.6, -1.4, 0.9); O(9.6, 1.4, 0.9);
    if (happy && Math.sin(t * 1.3) > 0.97) { C('rgba(255,140,40,0.8)'); O(14, 0, 2.5); C('rgba(255,220,90,0.8)'); O(12.5, 0, 1.6); }
  } else if (kind === 'robot') {
    C('#2e353d'); g.fillRect(-7, -7, 14, 3); g.fillRect(-7, 4, 14, 3);
    C('#454e58'); for (let i = -6; i < 7; i += 3) { g.fillRect(i + ((t * 20 * mv) % 3), -7, 1, 3); g.fillRect(i + ((t * 20 * mv) % 3), 4, 1, 3); }
    C(c1); g.fillRect(-5.5, -5, 11, 10);
    C(c2); g.fillRect(-5.5, -5, 11, 2.5);
    C('#0d1418'); g.fillRect(2, -3, 3.4, 6);
    C(Math.sin(t * 6) > 0 ? '#3df2ff' : '#1a8a99'); g.fillRect(3, -2, 1.6, 1.6); g.fillRect(3, 0.6, 1.6, 1.6);
    C('#c0392b'); O(-3, 0, 1.3);
  }
  g.restore();
}

// Tesla's coil: a copper tower with a crackling ball on top
function drawCoil(g, t) {
  const now = performance.now() / 1000;
  g.save(); g.translate(t.x, t.y);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(4, 6, 16, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2f3640'; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b87333'; g.lineWidth = 2.5; for (let r = 4; r <= 10; r += 3) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  const p = 0.6 + 0.4 * Math.sin(now * 12 + t.id);
  g.fillStyle = `rgba(122,216,255,${0.25 * p})`; g.beginPath(); g.arc(0, -4, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#bff3ff'; g.beginPath(); g.arc(0, -4, 5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(191,243,255,0.8)'; g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) { const a = now * 7 + i * 2.1; g.beginPath(); g.moveTo(0, -4); g.lineTo(Math.cos(a) * 10 + (Math.random() - 0.5) * 4, -4 + Math.sin(a) * 10); g.stroke(); }
  if (t.life != null && t.life < 3) { g.globalAlpha = 0.6; g.fillStyle = '#fff'; g.font = '700 10px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.ceil(t.life)), 0, 24); }
  g.restore();
}

// metro: a flashing red lane while the horn sounds, then the train sweeps through
function drawTrain(g, q, view, time) {
  const B = WORLD.bounds;
  if (!q.go) {
    g.fillStyle = `rgba(229,72,77,${0.12 + 0.12 * Math.sin(time * 14)})`; g.fillRect(B.x0, q.y - 56, B.x1 - B.x0, 112);
    g.strokeStyle = 'rgba(255,90,90,0.7)'; g.lineWidth = 3; g.setLineDash([18, 12]);
    g.beginPath(); g.moveTo(B.x0, q.y - 56); g.lineTo(B.x1, q.y - 56); g.moveTo(B.x0, q.y + 56); g.lineTo(B.x1, q.y + 56); g.stroke(); g.setLineDash([]);
    return;
  }
  const W = B.x1 - B.x0, len = 1100, k = q.t / 1.2, head = q.dir > 0 ? B.x0 - len + (W + len * 2) * k : B.x1 + len - (W + len * 2) * k;
  for (let i = 0; i < 4; i++) {
    const x = q.dir > 0 ? head - i * 270 - 260 : head + i * 270;
    if (x > view.r + 300 || x + 260 < view.l - 300) continue;
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 6, q.y - 40, 260, 88);
    g.fillStyle = '#b8bec6'; g.fillRect(x, q.y - 46, 260, 92);
    g.fillStyle = '#c0392b'; g.fillRect(x, q.y - 8, 260, 14);
    g.fillStyle = '#2a3440'; for (let w = 14; w < 250; w += 40) g.fillRect(x + w, q.y - 38, 26, 22);
  }
}

// build 43: bats (wings flapping), zombie dogs and the Dev Solucan
function drawNewZombie(g, z, r, time) {
  const hit = z.flash > 0;
  if (z.t === 21) { // bat
    g.rotate(z.face || 0);
    const f = Math.sin(time * 26 + z.id) * 0.6;
    g.fillStyle = hit ? '#fff' : '#3a2e3a';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, s * (14 + f * 8), -12, s * (20 + f * 10)); g.quadraticCurveTo(-6, s * 10, -14, s * 6); g.closePath(); g.fill(); }
    g.fillStyle = hit ? '#fff' : '#5a4a5a'; g.beginPath(); g.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff4040'; g.beginPath(); g.arc(5, -2.5, 1.5, 0, Math.PI * 2); g.arc(5, 2.5, 1.5, 0, Math.PI * 2); g.fill();
    return;
  }
  if (z.t === 22) { // zombie dog: the wolf model in rotten colours, red eyes
    g.scale(1.6, 1.6);
    drawPet(g, 'zdog', 0, 0, z.face || 0, time, 1, false);
    if (hit) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill(); }
    return;
  }
  // Dev Solucan: a fat ringed worm with a round mouth of teeth
  g.rotate(z.face || 0);
  for (let i = 4; i >= 0; i--) {
    const x = -i * r * 0.45, w = Math.sin(time * 5 + i) * 4;
    g.fillStyle = hit ? '#fff' : i % 2 ? '#8a5656' : '#a06a6a';
    g.beginPath(); g.ellipse(x, w, r * (1 - i * 0.12), r * (0.9 - i * 0.1), 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.stroke();
  }
  g.fillStyle = '#2a0e0e'; g.beginPath(); g.arc(r * 0.35, 0, r * 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f4ead2';
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(r * 0.35 + Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); g.lineTo(r * 0.35 + Math.cos(a + 0.2) * r * 0.25, Math.sin(a + 0.2) * r * 0.25); g.lineTo(r * 0.35 + Math.cos(a + 0.4) * r * 0.5, Math.sin(a + 0.4) * r * 0.5); g.fill(); }
}
