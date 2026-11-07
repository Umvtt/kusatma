// What every player's browser runs (the host included): own movement and shooting,
// smoothing of what the host sends, and visual effects.
import { MAP_W, MAP_H, PLAYER_R, CLASSES, ZTYPES, zMaxHp, stats } from './config.js';
import { moveCircle, resolveCircle, pointInObstacle, outOfMap } from './world.js';

const SEND_INTERVAL = 0.05;
const MAX_PARTS = 600;

export class ClientGame {
  constructor(send, me) {
    this.send = send;
    this.me = me;
    this.roster = new Map();
    this.phase = 'lobby';
    this.wave = 0;
    this.waveN = 1;
    this.breakT = 0;
    this.zLeft = 0;
    this.zs = new Map();
    this.ps = new Map();
    this.ts = new Map();
    this.bullets = [];
    this.parts = [];
    this.rings = [];
    this.decals = [];
    this.notices = [];
    this.self = {
      x: MAP_W / 2, y: MAP_H / 2, a: 0, hp: 100, maxHp: 100, alive: true, inGame: false,
      gold: 0, kills: 0, sp: -1, lv: { dmg: 0, rate: 0, hp: 0, spd: 0, cd: 0 }, abLeft: 0, shopReady: false,
    };
    this.time = 0;
    this.fireT = 0;
    this.sendT = 0;
    this.abLock = 0;
    this.rageUntil = 0;
    this.focusUntil = 0;
    this.hitsQ = [];
    this.shotsQ = [];
    this.lastHp = null;
    this.hurt = 0;
    this.shake = 0;
    this.input = { keys: new Set(), mx: 0, my: 0, down: false, ab: false };
    this.cam = { x: MAP_W / 2, y: MAP_H / 2, scale: 1, vw: 1, vh: 1 };
    this.spectate = null;
  }

  get cls() { const r = this.roster.get(this.me); return r ? r.cls : 'asker'; }
  get myStats() { return stats(this.cls, this.self.lv); }
  nameOf(pid) { const r = this.roster.get(pid); return r ? r.name : 'Biri'; }

  onRoster(m) {
    this.roster = new Map(m.players.map((p) => [p.pid, p]));
  }

  onSnap(s) {
    this.phase = s.ph === 'c' ? 'combat' : 'break';
    this.wave = s.w;
    this.waveN = s.n;
    this.breakT = s.bt;
    this.zLeft = s.zl;

    const seenP = new Set();
    for (const e of s.P) {
      const [pid, x, y, a, hp, maxHp, alive, gold, kills, sp, l0, l1, l2, l3, l4, ab, rdy] = e;
      seenP.add(pid);
      if (pid === this.me) {
        const S = this.self;
        if (sp !== S.sp) { S.sp = sp; S.x = x; S.y = y; this.lastHp = null; }
        if (this.lastHp != null && hp < this.lastHp - 0.5) this.hurt = Math.min(1, this.hurt + 0.3);
        this.lastHp = hp;
        if (!S.alive && alive && S.inGame) this.notices.push({ k: 'revived' });
        S.hp = hp; S.maxHp = maxHp; S.alive = !!alive; S.gold = gold; S.kills = kills;
        S.lv = { dmg: l0, rate: l1, hp: l2, spd: l3, cd: l4 };
        S.abLeft = ab; S.shopReady = !!rdy; S.inGame = true;
      }
      let p = this.ps.get(pid);
      if (!p) { p = { x, y, a }; this.ps.set(pid, p); }
      if (pid === this.me) { p.x = this.self.x; p.y = this.self.y; }
      p.tx = x; p.ty = y; p.ta = a; p.hp = hp; p.maxHp = maxHp; p.alive = !!alive;
      p.kills = kills; p.ready = !!rdy;
    }
    for (const pid of [...this.ps.keys()]) if (!seenP.has(pid)) this.ps.delete(pid);
    if (!seenP.has(this.me)) this.self.inGame = false;

    const seenZ = new Set();
    for (const [id, t, x, y, hp] of s.Z) {
      seenZ.add(id);
      let z = this.zs.get(id);
      if (!z) { z = { id, t, x, y, face: 0, pend: [], dying: 0, born: this.time }; this.zs.set(id, z); }
      z.tx = x; z.ty = y; z.hp = hp; z.max = zMaxHp(t, this.wave, this.waveN);
    }
    for (const id of [...this.zs.keys()]) if (!seenZ.has(id)) this.zs.delete(id);

    const seenT = new Set();
    for (const [id, x, y, a, life] of s.T) {
      seenT.add(id);
      let t = this.ts.get(id);
      if (!t) { t = { id, x, y, a }; this.ts.set(id, t); this.ring(x, y, '#ffd23f', 60); }
      t.x = x; t.y = y; t.ta = a; t.life = life;
    }
    for (const id of [...this.ts.keys()]) if (!seenT.has(id)) this.ts.delete(id);

    for (const [pid, x, y, a] of s.S) if (pid !== this.me) this.visualShot(pid, x, y, a);

    for (const ev of s.E) {
      switch (ev[0]) {
        case 'd': this.splat(ev[1], ev[2], ZTYPES[ev[3]] ? ZTYPES[ev[3]].r : 15, true); break;
        case 'h': this.ring(ev[1], ev[2], '#43d17a', CLASSES.sihhiye.ab.r); break;
        case 'dn': this.notices.push({ k: 'down', pid: ev[1] }); break;
        case 'up': if (ev[1] !== this.me) this.notices.push({ k: 'up', pid: ev[1] }); break;
        case 'ab': {
          const p = this.ps.get(ev[1]);
          const r = this.roster.get(ev[1]);
          if (p && r && ev[1] !== this.me && (r.cls === 'asker' || r.cls === 'nisanci')) this.ring(p.x, p.y, r.cls === 'asker' ? '#ff6b2c' : '#7bdff2', 50);
          break;
        }
        case 'ws': this.notices.push({ k: 'wave', w: ev[1] }); break;
        case 'we': this.notices.push({ k: 'clear', w: ev[1], bonus: ev[2] }); break;
        default: break;
      }
    }
  }

  // ---------- local actions ----------
  update(dt) {
    this.time += dt;
    const S = this.self;
    const st = this.myStats;
    const c = CLASSES[this.cls];
    const active = S.inGame && S.alive && (this.phase === 'combat' || this.phase === 'break');

    if (active) {
      const k = this.input.keys;
      let mx = 0, my = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      const len = Math.hypot(mx, my);
      if (len > 0) moveCircle(S, (mx / len) * st.spd * dt, (my / len) * st.spd * dt, PLAYER_R);
      for (const z of this.zs.values()) {
        if (z.dying) continue;
        const min = ZTYPES[z.t].r + PLAYER_R;
        const dx = S.x - z.x, dy = S.y - z.y;
        const d = Math.hypot(dx, dy);
        if (d < min && d > 0.01) { S.x += (dx / d) * (min - d) * 0.6; S.y += (dy / d) * (min - d) * 0.6; }
      }
      resolveCircle(S, PLAYER_R);
      const w = this.toWorld(this.input.mx, this.input.my);
      S.a = Math.atan2(w.y - S.y, w.x - S.x);

      const rage = this.time < this.rageUntil;
      const rate = st.rate * (rage ? 2 : 1);
      this.fireT = Math.max(0, this.fireT - dt);
      if (this.input.down && this.fireT <= 0) { this.fire(c, st); this.fireT = 1 / rate; }

      this.abLock = Math.max(0, this.abLock - dt);
      if (this.input.ab && S.abLeft <= 0 && this.abLock <= 0) {
        this.abLock = 0.6;
        const ax = S.x + Math.cos(S.a) * 40, ay = S.y + Math.sin(S.a) * 40;
        this.send({ t: 'ab', x: Math.round(ax), y: Math.round(ay) });
        if (this.cls === 'asker') { this.rageUntil = this.time + c.ab.dur; this.ring(S.x, S.y, '#ff6b2c', 60); }
        if (this.cls === 'nisanci') { this.focusUntil = this.time + c.ab.dur; this.ring(S.x, S.y, '#7bdff2', 60); }
      }
    }
    this.input.ab = false;

    this.updateBullets(dt);

    // smooth everyone else toward the latest host positions
    const kf = 1 - Math.exp(-dt * 14);
    for (const [pid, p] of this.ps) {
      if (pid === this.me) { p.x = S.x; p.y = S.y; p.a = S.a; continue; }
      if (p.tx == null) continue;
      if (Math.hypot(p.tx - p.x, p.ty - p.y) > 300) { p.x = p.tx; p.y = p.ty; }
      p.x += (p.tx - p.x) * kf; p.y += (p.ty - p.y) * kf;
      p.a = lerpAngle(p.a, p.ta, kf);
    }
    for (const z of this.zs.values()) {
      const ox = z.x, oy = z.y;
      z.x += (z.tx - z.x) * kf; z.y += (z.ty - z.y) * kf;
      if (Math.abs(z.x - ox) + Math.abs(z.y - oy) > 0.05) z.face = lerpAngle(z.face, Math.atan2(z.y - oy, z.x - ox), 0.2);
      z.pend = z.pend.filter((e) => this.time - e.t < 0.45);
      if (z.dying && this.time - z.dying > 0.6) { z.dying = 0; z.pend = []; }
    }
    for (const t of this.ts.values()) t.a = lerpAngle(t.a, t.ta, kf);

    this.updateParts(dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 30);

    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = SEND_INTERVAL;
      if (S.inGame) {
        const h = this.hitsQ.splice(0, 60);
        const s = this.shotsQ.splice(0, 12);
        this.send({ t: 'in', x: Math.round(S.x), y: Math.round(S.y), a: Math.round(S.a * 1000) / 1000, h, s });
      }
    }

    // who the camera follows
    if (S.inGame && S.alive) this.spectate = null;
    else if (S.inGame) {
      const cur = this.spectate != null ? this.ps.get(this.spectate) : null;
      if (!cur || !cur.alive) {
        const next = [...this.ps.entries()].find(([pid, p]) => pid !== this.me && p.alive);
        this.spectate = next ? next[0] : null;
      }
    }
  }

  fire(c, st) {
    const S = this.self;
    const focus = this.time < this.focusUntil;
    const dmg = st.dmg * (focus ? 2 : 1);
    const pierce = focus ? 99 : c.pierce;
    const mx = S.x + Math.cos(S.a) * (c.gun + 4), my = S.y + Math.sin(S.a) * (c.gun + 4);
    for (let i = 0; i < c.pellets; i++) {
      const ang = S.a + (Math.random() * 2 - 1) * c.spread;
      const spd = c.bspd * (c.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
      this.bullets.push({ x: mx, y: my, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: c.life, dmg, pierce, own: true, hit: null, w: c.pellets > 1 ? 1.6 : this.cls === 'nisanci' ? 2.6 : 2 });
    }
    this.shotsQ.push([Math.round(mx), Math.round(my), Math.round(S.a * 1000) / 1000]);
    this.flash(mx, my, S.a);
    if (this.cls === 'muhendis' || this.cls === 'nisanci') this.shake = Math.min(8, this.shake + 4);
  }

  visualShot(pid, x, y, a) {
    let c;
    if (pid === -1) c = { pellets: 1, spread: 0.03, bspd: 1300, life: 0.4 };
    else { const r = this.roster.get(pid); c = CLASSES[r ? r.cls : 'asker']; }
    for (let i = 0; i < c.pellets; i++) {
      const ang = a + (Math.random() * 2 - 1) * c.spread;
      this.bullets.push({ x, y, vx: Math.cos(ang) * c.bspd, vy: Math.sin(ang) * c.bspd, life: c.life, dmg: 0, pierce: c.pierce || 0, own: false, hit: null, w: 1.6 });
    }
    this.flash(x, y, a);
  }

  updateBullets(dt) {
    const out = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || outOfMap(b.x, b.y)) continue;
      if (pointInObstacle(b.x, b.y)) { this.sparks(b.x, b.y); continue; }
      let alive = true;
      for (const z of this.zs.values()) {
        if (z.dying) continue;
        const r = ZTYPES[z.t].r + 3;
        const dx = b.x - z.x, dy = b.y - z.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (b.hit && b.hit.has(z.id)) continue;
        if (b.own) {
          this.hitsQ.push([z.id, Math.round(b.dmg)]);
          z.pend.push({ d: b.dmg, t: this.time });
          const pending = z.pend.reduce((s, e) => s + e.d, 0);
          if (z.hp - pending <= 0) z.dying = this.time;
        }
        this.blood(b.x, b.y, Math.atan2(b.vy, b.vx), 4);
        if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = new Set())).add(z.id); }
        else { alive = false; break; }
      }
      if (alive) out.push(b);
    }
    this.bullets = out;
  }

  // ---------- effects ----------
  flash(x, y, a) {
    this.addPart({ x, y, vx: 0, vy: 0, life: 0.06, max: 0.06, col: '#ffd58a', size: 9, kind: 'flash', a });
  }
  sparks(x, y) {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 140;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2, max: 0.2, col: '#ffcf7a', size: 2, kind: 'dot' });
    }
  }
  blood(x, y, a, n) {
    for (let i = 0; i < n; i++) {
      const ang = a + (Math.random() - 0.5) * 1.4, s = 80 + Math.random() * 160;
      this.addPart({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: 0.35, max: 0.35, col: '#7a1d17', size: 2 + Math.random() * 2, kind: 'dot' });
    }
  }
  splat(x, y, r, big) {
    this.decals.push({ x, y, r: r * (big ? 1.5 : 0.8) });
    this.blood(x, y, Math.random() * Math.PI * 2, big ? 14 : 5);
    for (let i = 0; i < (big ? 10 : 0); i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, col: '#4a1410', size: 3 + Math.random() * 3, kind: 'dot' });
    }
  }
  ring(x, y, col, r) { this.rings.push({ x, y, col, r, t: 0, max: 0.6 }); }
  addPart(p) { if (this.parts.length < MAX_PARTS) this.parts.push(p); }
  updateParts(dt) {
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
  }

  toWorld(sx, sy) {
    const c = this.cam;
    return { x: c.x + (sx - c.vw / 2) / c.scale, y: c.y + (sy - c.vh / 2) / c.scale };
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
