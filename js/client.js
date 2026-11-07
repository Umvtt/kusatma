// What every player's browser runs (the host included): own movement and shooting,
// smoothing of what the host sends, and visual effects.
import { CX, CY, PLAYER_R, CLASSES, ZTYPES, ZS, zMaxHp, stats } from './config.js';
import { moveCircle, resolveCircle, pointInObstacle, outOfMap, setBounds } from './world.js';
import * as sfx from './sfx.js';

const SEND_INTERVAL = 0.05;
const MAX_PARTS = 700;

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
    this.mines = [];
    this.spits = new Map();
    this.bullets = [];
    this.parts = [];
    this.rings = [];
    this.lights = [];
    this.decals = [];
    this.notices = [];
    this.fx = new Map(); // pid -> { k, until }
    this.flameAt = new Map(); // pid -> { t, x, y } of the latest flame shot
    this.lastSnapAt = performance.now();
    this.paused = false;
    this.self = {
      x: CX, y: CY, a: 0, hp: 100, maxHp: 100, alive: true, inGame: false,
      gold: 0, kills: 0, sp: -1, lv: { dmg: 0, rate: 0, hp: 0, spd: 0, cd: 0 }, abLeft: 0, shopReady: false,
      kvx: 0, kvy: 0,
    };
    this.time = 0;
    this.fireT = 0;
    this.sendT = 0;
    this.abLock = 0;
    this.hitsQ = [];
    this.shotsQ = [];
    this.lastHp = null;
    this.hurt = 0;
    this.shake = 0;
    this.hitMark = 0;
    this.zoom = 1;
    this.input = { keys: new Set(), mx: 0, my: 0, down: false, ab: false };
    this.cam = { x: CX, y: CY, scale: 1, vw: 1, vh: 1 };
    this.hm = 1;
    this.spectate = null;
  }

  get cls() { const r = this.roster.get(this.me); return r ? r.cls : 'asker'; }
  get myStats() { return stats(this.cls, this.self.lv); }
  nameOf(pid) { const r = this.roster.get(pid); return r ? r.name : 'Biri'; }
  clsOf(pid) { const r = this.roster.get(pid); return r ? r.cls : 'asker'; }
  fxOn(pid, k) { const f = this.fx.get(pid); return !!f && f.k === k && this.time < f.until; }

  onRoster(m) {
    this.roster = new Map(m.players.map((p) => [p.pid, p]));
  }

  reset() {
    this.zs.clear(); this.ts.clear(); this.spits.clear(); this.mines = [];
    this.bullets = []; this.parts = []; this.rings = []; this.lights = []; this.fx.clear();
  }

  onSnap(s) {
    const prevPhase = this.phase;
    this.lastSnapAt = performance.now();
    this.phase = s.ph === 'c' ? 'combat' : 'break';
    this.wave = s.w;
    this.waveN = s.n;
    this.breakT = s.bt;
    this.zLeft = s.zl;
    this.hm = s.hm || 1;
    if (s.B) setBounds(s.B[0], s.B[1], s.B[2], s.B[3]);
    if (prevPhase === 'combat' && this.phase === 'break') this.spits.clear();

    const seenP = new Set();
    for (const e of s.P) {
      const [pid, x, y, a, hp, maxHp, alive, gold, kills, sp, l0, l1, l2, l3, l4, ab, rdy, shield, rev] = e;
      seenP.add(pid);
      if (pid === this.me) {
        const S = this.self;
        if (sp !== S.sp) { S.sp = sp; S.x = x; S.y = y; this.lastHp = null; this.cam.x = x; this.cam.y = y; }
        if (this.lastHp != null && hp < this.lastHp - 0.5) { this.hurt = Math.min(1, this.hurt + 0.3); if (hp < this.lastHp - 3) sfx.hurt(); }
        this.lastHp = hp;
        if (!S.alive && alive && S.inGame) this.notices.push({ k: 'revived' });
        S.hp = hp; S.maxHp = maxHp; S.alive = !!alive; S.gold = gold; S.kills = kills;
        S.lv = { dmg: l0, rate: l1, hp: l2, spd: l3, cd: l4 };
        S.abLeft = ab; S.shopReady = !!rdy; S.inGame = true;
      }
      let p = this.ps.get(pid);
      if (!p) { p = { x, y, a, walk: 0 }; this.ps.set(pid, p); }
      if (pid === this.me) { p.x = this.self.x; p.y = this.self.y; }
      p.tx = x; p.ty = y; p.ta = a; p.hp = hp; p.maxHp = maxHp; p.alive = !!alive;
      p.kills = kills; p.ready = !!rdy; p.shield = !!shield; p.rev = rev || 0;
    }
    for (const pid of [...this.ps.keys()]) if (!seenP.has(pid)) this.ps.delete(pid);
    if (!seenP.has(this.me)) this.self.inGame = false;

    const seenZ = new Set();
    for (const [id, t, x, y, hp, st, cdir] of s.Z) {
      seenZ.add(id);
      let z = this.zs.get(id);
      if (!z) {
        z = { id, t, x, y, face: Math.atan2(CY - y, CX - x), pend: [], dying: 0, born: this.time, flash: 0, walk: Math.random() * 6, st: 0 };
        this.zs.set(id, z);
        if (Math.random() < 0.15) sfx.growl(x, y);
      }
      if (z.hp != null && hp < z.hp) {
        z.flash = 0.08;
        // the host has now applied some damage: stop counting that much of our own unconfirmed hits,
        // otherwise the same damage is subtracted twice and the zombie looks dead when it isn't
        let applied = z.hp - hp;
        while (applied > 0 && z.pend.length) {
          const e = z.pend[0];
          if (e.d <= applied) { applied -= e.d; z.pend.shift(); } else { e.d -= applied; applied = 0; }
        }
      }
      if (st !== z.st) {
        if (st === ZS.WINDUP || st === ZS.SLAM) sfx.growl(x, y);
        if (st === ZS.SPIT) sfx.spit(x, y);
      }
      z.tx = x; z.ty = y; z.hp = hp; z.st = st; z.cdir = cdir; z.max = zMaxHp(t, this.wave, this.waveN, this.hm);
      if (z.dying && hp - z.pend.reduce((sum, e) => sum + e.d, 0) > 0) z.dying = 0;
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

    this.mines = s.M;

    const seenQ = new Set();
    for (const [id, x, y] of s.Q) {
      seenQ.add(id);
      const q = this.spits.get(id);
      if (!q) this.spits.set(id, { x, y, tx: x, ty: y });
      else { q.tx = x; q.ty = y; }
    }
    for (const id of [...this.spits.keys()]) if (!seenQ.has(id)) this.spits.delete(id);

    for (const [pid, x, y, a] of s.S) {
      if (pid === this.me) continue;
      this.visualShot(pid, x, y, a);
    }

    for (const ev of s.E) this.onEvent(ev);
  }

  onEvent(ev) {
    switch (ev[0]) {
      case 'd': {
        const big = ev[3] === 2 || ev[3] === 3;
        this.splat(ev[1], ev[2], ZTYPES[ev[3]] ? ZTYPES[ev[3]].r : 15, true, ev[3] === 4);
        sfx.zombieDie(ev[1], ev[2], big);
        break;
      }
      case 'h': this.ring(ev[1], ev[2], '#43d17a', CLASSES.doktor.ab.r); this.light(ev[1], ev[2], 260, 0.6, '67,209,122'); sfx.heal(ev[1], ev[2]); break;
      case 'dn': this.notices.push({ k: 'down', pid: ev[1] }); sfx.down(); break;
      case 'up': if (ev[1] !== this.me) this.notices.push({ k: 'up', pid: ev[1] }); break;
      case 'ab': {
        const pid = ev[1];
        const cls = this.clsOf(pid);
        const c = CLASSES[cls];
        const p = this.ps.get(pid);
        const k = { asker: 'rage', nisanci: 'focus', izci: 'sprint', kalkanci: 'shield' }[cls];
        if (k && pid !== this.me) this.fx.set(pid, { k, until: this.time + c.ab.dur });
        if (p && pid !== this.me && k) this.ring(p.x, p.y, AB_COL[cls], 55);
        if (p && pid !== this.me && cls !== 'doktor' && cls !== 'alevci') sfx.ability(cls, p.x, p.y);
        break;
      }
      case 'kb': if (ev[1] === this.me) { this.self.kvx += ev[2]; this.self.kvy += ev[3]; this.shake = Math.min(14, this.shake + 10); } break;
      case 'x': this.explode(ev[1], ev[2], ev[3]); break;
      case 'fb': this.fireBurst(ev[1], ev[2], ev[3]); break;
      case 'sl':
        this.ring(ev[1], ev[2], '#e5484d', ev[3]);
        this.dust(ev[1], ev[2], ev[3]);
        sfx.slam(ev[1], ev[2]);
        if (Math.hypot(this.self.x - ev[1], this.self.y - ev[2]) < 500) this.shake = Math.min(16, this.shake + 12);
        break;
      case 'sp': this.goo(ev[1], ev[2]); break;
      case 'ws': this.notices.push({ k: 'wave', w: ev[1] }); sfx.waveStart(); break;
      case 'we': this.notices.push({ k: 'clear', w: ev[1], bonus: ev[2] }); sfx.waveClear(); break;
      default: break;
    }
  }

  // ---------- local actions ----------
  update(dt) {
    if (this.paused) { sfx.flame(0); this.input.ab = false; return; }
    this.time += dt;
    const S = this.self;
    const st = this.myStats;
    const cls = this.cls;
    const c = CLASSES[cls];
    const active = !this.paused && S.inGame && S.alive && (this.phase === 'combat' || this.phase === 'break');
    const meP = this.ps.get(this.me);

    if (active) {
      const k = this.input.keys;
      let mx = 0, my = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
      const len = Math.hypot(mx, my);
      const spd = st.spd * (this.fxOn(this.me, 'sprint') ? 1.6 : 1);
      const bx = S.x, by = S.y;
      if (len > 0) moveCircle(S, (mx / len) * spd * dt, (my / len) * spd * dt, PLAYER_R);
      if (S.kvx || S.kvy) {
        moveCircle(S, S.kvx * dt, S.kvy * dt, PLAYER_R);
        const damp = Math.exp(-dt * 7);
        S.kvx *= damp; S.kvy *= damp;
        if (Math.abs(S.kvx) + Math.abs(S.kvy) < 5) { S.kvx = 0; S.kvy = 0; }
      }
      for (const z of this.zs.values()) {
        if (z.dying) continue;
        const min = ZTYPES[z.t].r + PLAYER_R;
        const dx = S.x - z.x, dy = S.y - z.y;
        const d = Math.hypot(dx, dy);
        if (d < min && d > 0.01) { S.x += (dx / d) * (min - d) * 0.6; S.y += (dy / d) * (min - d) * 0.6; }
      }
      resolveCircle(S, PLAYER_R);
      if (meP) meP.walk += Math.hypot(S.x - bx, S.y - by);
      const w = this.toWorld(this.input.mx, this.input.my);
      S.a = Math.atan2(w.y - S.y, w.x - S.x);

      const rate = st.rate * (this.fxOn(this.me, 'rage') ? 2 : 1);
      this.fireT = Math.max(0, this.fireT - dt);
      if (this.input.down && this.fireT <= 0) { this.fire(c, st); this.fireT = 1 / rate; }

      this.abLock = Math.max(0, this.abLock - dt);
      if (this.input.ab && S.abLeft <= 0 && this.abLock <= 0) {
        this.abLock = 0.6;
        const ax = S.x + Math.cos(S.a) * 40, ay = S.y + Math.sin(S.a) * 40;
        this.send({ t: 'ab', x: Math.round(ax), y: Math.round(ay) });
        const k = { asker: 'rage', nisanci: 'focus', izci: 'sprint', kalkanci: 'shield' }[cls];
        if (k) { this.fx.set(this.me, { k, until: this.time + c.ab.dur }); this.ring(S.x, S.y, AB_COL[cls], 60); }
        if (cls !== 'doktor' && cls !== 'alevci') sfx.ability(cls, S.x, S.y);
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
      const ox = p.x, oy = p.y;
      p.x += (p.tx - p.x) * kf; p.y += (p.ty - p.y) * kf;
      p.walk += Math.hypot(p.x - ox, p.y - oy);
      p.a = lerpAngle(p.a, p.ta, kf);
    }
    for (const z of this.zs.values()) {
      const ox = z.x, oy = z.y;
      z.x += (z.tx - z.x) * kf; z.y += (z.ty - z.y) * kf;
      const moved = Math.hypot(z.x - ox, z.y - oy);
      z.walk += moved * 0.12;
      if (z.st === ZS.WINDUP || z.st === ZS.DASH && z.t === 2) z.face = lerpAngle(z.face, z.cdir, 0.3);
      else if (moved > 0.05) z.face = lerpAngle(z.face, Math.atan2(z.y - oy, z.x - ox), 0.18);
      z.pend = z.pend.filter((e) => this.time - e.t < 1);
      if (z.dying && this.time - z.dying > 1) { z.dying = 0; z.pend = []; }
      z.flash = Math.max(0, z.flash - dt);
    }
    for (const t of this.ts.values()) t.a = lerpAngle(t.a, t.ta, kf);
    for (const q of this.spits.values()) { q.x += (q.tx - q.x) * kf; q.y += (q.ty - q.y) * kf; }

    this.updateParts(dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.hitMark = Math.max(0, this.hitMark - dt);

    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = SEND_INTERVAL;
      if (S.inGame) {
        const h = this.hitsQ.splice(0, 60);
        const s = this.shotsQ.splice(0, 12);
        this.send({ t: 'in', x: Math.round(S.x), y: Math.round(S.y), a: Math.round(S.a * 100) / 100, h, s });
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
    sfx.setListener(this.cam.x, this.cam.y);
    let flame = 0;
    for (const [pid, f] of this.flameAt) {
      if (this.time - f.t > 0.12) { if (this.time - f.t > 1) this.flameAt.delete(pid); continue; }
      flame = Math.max(flame, pid === this.me ? 1 : 0.6 * Math.max(0, 1 - Math.hypot(f.x - this.cam.x, f.y - this.cam.y) / 1000));
    }
    sfx.flame(flame);
  }

  fire(c, st) {
    const S = this.self;
    const focus = this.fxOn(this.me, 'focus');
    const dmg = st.dmg * (focus ? 2 : 1);
    const pierce = focus ? 99 : c.pierce;
    const off = c.gun + 6;
    let mx = S.x + Math.cos(S.a) * off, my = S.y + Math.sin(S.a) * off;
    if (this.cls === 'izci') {
      // alternate between the two pistols
      this.side = -(this.side || 1);
      mx += Math.cos(S.a + Math.PI / 2) * 6 * this.side; my += Math.sin(S.a + Math.PI / 2) * 6 * this.side;
    }
    for (let i = 0; i < c.pellets; i++) this.bullets.push(this.makeBullet(c, mx, my, S.a, dmg, pierce, true));
    this.shotsQ.push([Math.round(mx), Math.round(my), Math.round(S.a * 100) / 100]);
    if (c.kind !== 'f') { this.flash(mx, my, S.a); this.casing(S.x, S.y, S.a); }
    if (c.kind === 'f') this.flameAt.set(this.me, { t: this.time, x: S.x, y: S.y });
    sfx.shot(this.cls, S.x, S.y, true);
    if (this.cls === 'tamirci' || this.cls === 'nisanci' || this.cls === 'bombaci') this.shake = Math.min(8, this.shake + 4);
  }

  makeBullet(c, x, y, a, dmg, pierce, own) {
    const ang = a + (Math.random() * 2 - 1) * c.spread;
    const spd = c.bspd * (c.pellets > 1 || c.kind === 'f' ? 0.85 + Math.random() * 0.3 : 1);
    return {
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: c.life, max: c.life,
      dmg, pierce, own, hit: null, kind: c.kind || 'b', aoe: c.aoe || 0,
      w: c.pellets > 1 ? 1.6 : c.gun >= 36 ? 2.6 : 2,
    };
  }

  visualShot(pid, x, y, a) {
    if (pid === -1) {
      const c = { pellets: 1, spread: 0.03, bspd: 1300, life: 0.4, kind: 'b', gun: 20 };
      this.bullets.push(this.makeBullet(c, x, y, a, 0, 0, false));
      this.flash(x, y, a);
      sfx.turretShot(x, y);
      return;
    }
    const cls = this.clsOf(pid);
    const c = CLASSES[cls];
    if (c.kind === 'f') this.flameAt.set(pid, { t: this.time, x, y });
    for (let i = 0; i < c.pellets; i++) this.bullets.push(this.makeBullet(c, x, y, a, 0, c.pierce, false));
    if (c.kind !== 'f') this.flash(x, y, a);
    sfx.shot(cls, x, y, false);
  }

  updateBullets(dt) {
    const out = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.kind === 'f') { b.vx *= 0.97; b.vy *= 0.97; }
      if (b.life <= 0 || outOfMap(b.x, b.y)) { if (b.kind === 'g') this.grenadeBlast(b); continue; }
      if (pointInObstacle(b.x, b.y)) { if (b.kind === 'g') this.grenadeBlast(b); else if (b.kind === 'b') this.sparks(b.x, b.y); continue; }
      let alive = true;
      for (const z of this.zs.values()) {
        if (z.dying) continue;
        const r = ZTYPES[z.t].r + (b.kind === 'f' ? 10 : 3);
        const dx = b.x - z.x, dy = b.y - z.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (b.hit && b.hit.has(z.id)) continue;
        if (b.kind === 'g') { this.grenadeBlast(b); alive = false; break; }
        if (b.own) this.dealHit(z, b.dmg);
        if (b.kind === 'b') this.blood(b.x, b.y, Math.atan2(b.vy, b.vx), 4);
        if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = new Set())).add(z.id); }
        else { alive = false; break; }
      }
      if (alive) out.push(b);
    }
    this.bullets = out;
  }

  dealHit(z, dmg) {
    this.hitsQ.push([z.id, Math.round(dmg)]);
    z.pend.push({ d: dmg, t: this.time });
    z.flash = 0.08;
    const pending = z.pend.reduce((s, e) => s + e.d, 0);
    if (z.hp - pending <= 0) z.dying = this.time;
    if (this.hitMark < 0.05) sfx.hit();
    this.hitMark = 0.12;
  }

  grenadeBlast(b) {
    if (b.own) {
      for (const z of this.zs.values()) {
        if (z.dying) continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) < b.aoe + ZTYPES[z.t].r) this.dealHit(z, b.dmg);
      }
    }
    this.explode(b.x, b.y, b.aoe);
  }

  // ---------- effects ----------
  flash(x, y, a) {
    this.addPart({ x, y, vx: 0, vy: 0, life: 0.06, max: 0.06, col: '#ffd58a', size: 9, kind: 'flash', a });
    this.light(x, y, 120, 0.06, '255,200,120');
  }
  light(x, y, r, life, col) { if (this.lights.length < 60) this.lights.push({ x, y, r, life, max: life, col }); }
  casing(x, y, a) {
    const side = a + Math.PI / 2 + (Math.random() - 0.5) * 0.6, s = 80 + Math.random() * 60;
    this.addPart({ x, y, vx: Math.cos(side) * s, vy: Math.sin(side) * s, life: 0.5, max: 0.5, col: '#d4a53c', size: 1.6, kind: 'dot' });
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
  splat(x, y, r, big, green) {
    this.decals.push({ x, y, r: r * (big ? 1.5 : 0.8), green });
    this.blood(x, y, Math.random() * Math.PI * 2, big ? 14 : 5);
    for (let i = 0; i < (big ? 10 : 0); i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, col: green ? '#6b7a1e' : '#4a1410', size: 3 + Math.random() * 3, kind: 'dot' });
    }
  }
  explode(x, y, r) {
    this.ring(x, y, '#ffb347', r);
    this.light(x, y, r * 2.4, 0.35, '255,170,80');
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * r * 3;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, col: i % 3 ? '#ffb347' : '#ff6b2c', size: 3 + Math.random() * 4, kind: 'fire' });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, max: 1, col: '#3a3a36', size: 10 + Math.random() * 10, kind: 'smoke' });
    }
    this.decals.push({ x, y, r: r * 0.5, scorch: true });
    sfx.boom(x, y);
    if (Math.hypot(this.self.x - x, this.self.y - y) < 600) this.shake = Math.min(14, this.shake + 8);
  }
  fireBurst(x, y, r) {
    this.ring(x, y, '#ff6b2c', r);
    this.light(x, y, r * 2, 0.5, '255,140,60');
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, s = r * 2.2 * (0.7 + Math.random() * 0.4);
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, col: i % 2 ? '#ff9a3c' : '#ffd166', size: 6 + Math.random() * 5, kind: 'fire' });
    }
    sfx.ability('alevci', x, y);
  }
  dust(x, y, r) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, s = r * 1.6;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, max: 0.6, col: '#5d5a4c', size: 8 + Math.random() * 6, kind: 'smoke' });
    }
    this.decals.push({ x, y, r: r * 0.35, scorch: true });
  }
  goo(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 100;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, col: '#9fbf2a', size: 2 + Math.random() * 3, kind: 'dot' });
    }
    this.decals.push({ x, y, r: 10, green: true });
  }
  ring(x, y, col, r) { this.rings.push({ x, y, col, r, t: 0, max: 0.6 }); }
  addPart(p) { if (this.parts.length < MAX_PARTS) this.parts.push(p); }
  updateParts(dt) {
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.kind === 'smoke' ? 0.92 : p.kind === 'fire' ? 0.88 : 0.9;
      p.vx *= k; p.vy *= k; p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter((l) => l.life > 0);
  }

  toWorld(sx, sy) {
    const c = this.cam;
    return { x: c.x + (sx - c.vw / 2) / c.scale, y: c.y + (sy - c.vh / 2) / c.scale };
  }
}

export const AB_COL = { asker: '#ff6b2c', nisanci: '#7bdff2', izci: '#9ef01a', kalkanci: '#a0c4ff', doktor: '#43d17a', tamirci: '#ffd23f', alevci: '#ff6b2c', bombaci: '#ffb347' };

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
