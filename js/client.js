// What every player's browser runs (the host included): own movement and shooting,
// smoothing of what the host sends, and visual effects.
import { CX, CY, PLAYER_R, QUICK, CLASSES, ZTYPES, ZS, zMaxHp, stats, weaponOf, isBoss, SHIELD_ARC, ITEMS, BASH, bashCd, newLv, lvObj, GEAR, GEAR_RANGE, TEAM, abDur, PVP_DMG } from './config.js';
import { moveCircle, resolveCircle, pointInObstacle, outOfMap, setBounds, WORLD, escapePocket } from './world.js';
import * as sfx from './sfx.js';
import { SETTINGS } from './settings.js';

const SEND_INTERVAL = 0.05;
const PEND_T = 0.45; // how long a hit we predicted counts before the host's own numbers take over
import { QUAL } from './settings.js';
const MAX_PARTS_CAP = 700;

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
    this.items = [];
    this.texts = [];
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
      gold: 0, kills: 0, sp: -1, lv: newLv(), abLeft: 0, shopReady: false, wt: 0, wp: 0, wb: 0, inv: GEAR.map(() => 0), power: 0, haste: 0,
      kvx: 0, kvy: 0, bashLeft: 0,
    };
    this.time = 0;
    this.fireT = 0;
    this.sendT = 0;
    this.abLock = 0;
    this.hitsQ = [];
    this.hitsP = []; // hits on enemy players (PvP)
    this.dmgDir = []; // where the last hits on me came from (PvP)
    this.trains = []; // metro trains: warnings and passing trains
    this.shotsQ = [];
    this.lastHp = null;
    this.hurt = 0;
    this.shake = 0;
    this.hitMark = 0;
    this.zoom = 1;
    this.input = { keys: new Set(), mx: 0, my: 0, down: false, ab: false, bash: false, tmove: null, taim: null, tfire: false };
    this.touch = false;
    this.cam = { x: CX, y: CY, scale: 1, vw: 1, vh: 1 };
    this.hm = 1;
    this.spectate = null;
    this.walls = [];
    this.zones = [];
    this.zaps = [];
    this.lobs = [];
    this.marks = [];
    this.mev = null; // [kind, seconds left] of the running map event
    this.planes = [];
    this.team = TEAM.map(() => 0);
    this.teamFund = TEAM.map(() => 0);
    this.teamCost = TEAM.map(() => 0);
  }

  get cls() { const r = this.roster.get(this.me); return r ? r.cls : 'asker'; }
  get myStats() { return stats(this.cls, this.self.lv, this.self.wt, this.self.wp, this.self.wb, this.team); }
  // phones: a gentle pull of the aim stick toward the zombie closest to where it points (setting "Nişan yardımı")
  aimAssist(S, a) {
    const lv = { low: [0.6, 0.28], mid: [0.82, 0.36], high: [0.95, 0.48] }[SETTINGS.aim];
    if (!lv) return a;
    const w = this.myWeapon, range = w.kind === 'm' ? w.reach + 60 : Math.max(240, Math.min(950, (w.bspd || 900) * (w.life || 0.6)));
    let best = null, bs = Infinity;
    // PvP: a weaker pull toward enemy players, so phones and mice stay fair
    for (const [, p] of this.foes()) {
      if (p.pfl & 2) continue;
      const dx = p.x - S.x, dy = p.y - S.y, d = Math.hypot(dx, dy);
      if (d > range || d < 1) continue;
      let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      const cone = lv[1] * 0.6 + Math.atan2(PLAYER_R, d);
      if (Math.abs(da) > cone) continue;
      const sc = Math.abs(da) / cone + (d / range) * 0.4 - 0.2;
      if (sc < bs) { bs = sc; best = da * 0.6; }
    }
    for (const z of this.zs.values()) {
      if (z.dying || (z.fl & 128) || (z.fl & 4096)) continue;
      const dx = z.x - S.x, dy = z.y - S.y, d = Math.hypot(dx, dy);
      if (d > range || d < 1) continue;
      let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      const cone = lv[1] + Math.atan2((ZTYPES[z.t] ? ZTYPES[z.t].r : 15), d);
      if (Math.abs(da) > cone) continue;
      const sc = Math.abs(da) / cone + (d / range) * 0.4 - (isBoss(z.t) ? 0.1 : 0);
      if (sc < bs) { bs = sc; best = da; }
    }
    return best == null ? a : a + best * lv[0];
  }

  get myWeapon() { return weaponOf(this.cls, this.self.wt, this.self.wp, this.self.wb); }
  nameOf(pid) { const r = this.roster.get(pid); return r ? r.name : 'Biri'; }
  clsOf(pid) { const r = this.roster.get(pid); return r ? r.cls : 'asker'; }
  fxOn(pid, k) { const f = this.fx.get(pid); return !!f && f.k === k && this.time < f.until; }

  onRoster(m) {
    this.roster = new Map(m.players.map((p) => [p.pid, p]));
  }

  reset() {
    this.zs.clear(); this.ts.clear(); this.spits.clear(); this.mines = []; this.items = []; this.texts = [];
    this.bullets = []; this.parts = []; this.rings = []; this.lights = []; this.fx.clear();
    this.walls = []; this.zones = []; this.zaps = []; this.lobs = []; this.marks = []; this.mev = null; this.planes = [];
  }

  onSnap(s) {
    // snapshots on the fast channel can arrive late or twice: only newer ones count (a new host starts counting again)
    if (s.q) {
      if (s.hi !== this.snapHi) { this.snapHi = s.hi; this.lastQ = 0; this.lastEv = 0; }
      if (s.q <= this.lastQ) return;
      this.lastQ = s.q;
    }
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
      const [pid, x, y, a, hp, maxHp, alive, gold, kills, sp, lv, ab, rdy, shield, rev, pw, hs, wt, wp, wb, inv, chill, tm, pk, dth, resp, pfl, ast, ping, bs] = e;
      seenP.add(pid);
      if (pid === this.me) {
        const S = this.self;
        if (sp !== S.sp) { S.sp = sp; S.x = x; S.y = y; this.lastHp = null; this.cam.x = x; this.cam.y = y; }
        if (this.lastHp != null && hp < this.lastHp - 0.5) { this.hurt = Math.min(1, this.hurt + 0.3); if (hp < this.lastHp - 3) sfx.hurt(); }
        this.lastHp = hp;
        if (!S.alive && alive && S.inGame) this.notices.push({ k: 'revived' });
        S.hp = hp; S.maxHp = maxHp; S.alive = !!alive; S.gold = gold; S.kills = kills;
        S.lv = lvObj(lv);
        S.abLeft = ab; S.shopReady = !!rdy; S.inGame = true; S.wt = wt || 0; S.wp = wp || 0; S.wb = wb || 0; S.power = pw || 0; S.haste = hs || 0; S.chill = chill || 0;
        S.inv = Array.isArray(inv) ? GEAR.map((g, i) => inv[i] | 0) : GEAR.map(() => 0);
        S.tm = tm | 0; S.pk = pk | 0; S.dth = dth | 0; S.resp = resp || 0; S.pfl = pfl | 0; S.ast = ast | 0; S.bs = bs | 0;
      }
      let p = this.ps.get(pid);
      if (!p) { p = { x, y, a, walk: 0 }; this.ps.set(pid, p); }
      if (pid === this.me) { p.x = this.self.x; p.y = this.self.y; }
      p.tx = x; p.ty = y; p.ta = a; p.hp = hp; p.maxHp = maxHp; p.alive = !!alive;
      p.kills = kills; p.ready = !!rdy; p.shield = !!shield; p.rev = rev || 0; p.wt = wt || 0; p.wp = wp || 0; p.wb = wb || 0; p.power = pw || 0; p.haste = hs || 0; p.chill = chill || 0;
      p.abl = Array.isArray(lv) ? lv[lv.length - 1] | 0 : 0;
      p.tm = tm | 0; p.pk = pk | 0; p.dth = dth | 0; p.resp = resp || 0; p.pfl = pfl | 0; p.ast = ast | 0; p.ping = ping | 0; p.bs = bs | 0;
    }
    this.pv = Array.isArray(s.PV) ? s.PV : null;
    for (const pid of [...this.ps.keys()]) if (!seenP.has(pid)) this.ps.delete(pid);
    if (!seenP.has(this.me)) this.self.inGame = false;

    const seenZ = new Set();
    for (const e of s.Z) {
      if (e.length === 3) { // unchanged since last time: only where it is now
        const z = this.zs.get(e[0]);
        if (z) { z.tx = e[1]; z.ty = e[2]; } else if (!this.zrAsk || this.time - this.zrAsk > 1) { this.zrAsk = this.time; this.send({ t: 'zr' }); }
        continue;
      }
      const [id, t, x, y, hp, st, cdir, sface, fl] = e;
      seenZ.add(id);
      let z = this.zs.get(id);
      if (!z) {
        z = { id, t, x, y, face: Math.atan2(CY - y, CX - x), pend: [], dying: 0, born: this.time, flash: 0, walk: Math.random() * 6, st: 0 };
        this.zs.set(id, z);
        if (Math.random() < (isBoss(t) ? 1 : 0.15)) sfx.growl(x, y, t);
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
        if (st === ZS.WINDUP || st === ZS.SLAM) sfx.growl(x, y, z.t);
        if (st === ZS.SPIT) sfx.spit(x, y);
      }
      if (st === 9 && z.st !== 9) z.leapT = this.time;
      z.tx = x; z.ty = y; z.hp = hp; z.st = st; z.cdir = cdir; z.sface = sface; z.fl = fl || 0; z.max = zMaxHp(t, this.wave, this.waveN, this.hm) * ((fl >> 8) & 7 ? 2.5 : 1);
      if (z.dying && hp - z.pend.reduce((sum, e) => sum + e.d, 0) > 0) z.dying = 0;
    }
    if (s.zd) { for (const id of s.ZD || []) this.zs.delete(id); }
    else for (const id of [...this.zs.keys()]) if (!seenZ.has(id)) this.zs.delete(id);
    // nothing is left alive on the host between waves: whatever is still here is a leftover and goes
    if (this.phase === 'break' && !s.zl && !s.Z.length && this.zs.size) this.zs.clear();

    const seenT = new Set();
    for (const [id, x, y, a, life, k, hp] of s.T) {
      seenT.add(id);
      let t = this.ts.get(id);
      if (!t) { t = { id, x, y, a, k: k | 0 }; this.ts.set(id, t); if (!k) this.ring(x, y, '#ffd23f', 60); else if (k === 3) { this.ring(x, y, '#ffd34d', 120); sfx.heal(x, y); } else if (k === 2) this.ring(x, y, '#43d17a', 60); }
      t.tx = x; t.ty = y; t.ta = a; t.life = life; t.k = k | 0; t.hp = hp == null ? 100 : hp;
      if (!t.k || t.k === 3 || t.k === 4) { t.x = x; t.y = y; }
    }
    for (const id of [...this.ts.keys()]) if (!seenT.has(id)) this.ts.delete(id);

    if (Array.isArray(s.ZF)) { this.zf = s.ZF; this.zfAt = this.time; } else if (!this.zfAt || this.time - this.zfAt > 2) this.zf = null;
    this.mines = s.M;
    this.mev = Array.isArray(s.V) && typeof s.V[0] === 'string' ? s.V : null;
    this.items = s.I || [];
    this.walls = s.W || [];
    this.zones = s.F || [];
    if (Array.isArray(s.TM) && s.TM.length === 3) { this.team = s.TM[0]; this.teamFund = s.TM[1]; this.teamCost = s.TM[2]; }

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

    if (s.es) { // numbered events: each one once, even when it comes again in a later snapshot
      for (let i = 0; i < s.E.length; i++) { const n = s.es + i; if (n > (this.lastEv || 0)) { this.lastEv = n; this.onEvent(s.E[i]); } }
    } else for (const ev of s.E) this.onEvent(ev);
  }

  onEvent(ev) {
    switch (ev[0]) {
      case 'd': {
        const big = ev[3] === 2 || isBoss(ev[3]);
        this.splat(ev[1], ev[2], ZTYPES[ev[3]] ? ZTYPES[ev[3]].r : 15, true, ev[3] === 4);
        sfx.zombieDie(ev[1], ev[2], big, ev[3]);
        // kill feed (bosses, elites and the rarer zombies) and the local kill streak
        if (ev[4]) {
          // my heavy kills hit harder: a blink of hit-stop, a shake and a flash (bosses most of all)
          if (ev[4] === this.me && (isBoss(ev[3]) || ev[3] === 2 || ev[5])) { const B = isBoss(ev[3]); this.hitStop = B ? 0.14 : 0.05; this.shake = Math.min(16, this.shake + (B ? 12 : 4)); this.light(ev[1], ev[2], B ? 420 : 200, B ? 0.9 : 0.4, '255,240,210'); if (B) this.ring(ev[1], ev[2], '#ffe6a8', 140); }
          if (ev[4] === this.me) { const now = performance.now(); if (now - (this.stT || 0) > 2600) this.stN = 0; this.stN = (this.stN || 0) + 1; this.stT = now; if (this.stN >= 3) this.notices.push({ k: 'streak', n: this.stN }); }
          const zt = ZTYPES[ev[3]];
          if (zt && (zt.boss || ev[5] || [6, 7, 13, 15, 16, 17, 18, 21, 22].includes(ev[3]))) this.notices.push({ k: 'kill', pid: ev[4], t: ev[3], el: ev[5] | 0 });
        }
        break;
      }
      case 'h': this.ring(ev[1], ev[2], '#43d17a', ev[3] || CLASSES.doktor.ab.r); this.light(ev[1], ev[2], 260, 0.6, '67,209,122'); sfx.heal(ev[1], ev[2]); break;
      case 'md': this.ring(ev[1], ev[2], '#43d17a', 90); this.light(ev[1], ev[2], 180, 0.5, '67,209,122'); sfx.heal(ev[1], ev[2]); break;
      case 'zp': this.zapFx(ev.slice(2)); break;
      case 'lb': this.bolt(ev[1], ev[2], ev[3]); break;
      case 'vr2': this.ring(ev[1], ev[2], '#9dff6b', ev[3]); this.puff(ev[1], ev[2], 30); break;
      case 'bx': this.puff(ev[1], ev[2], ev[3]); break;
      case 'bb': this.fireBurst(ev[1], ev[2], ev[3], true); break;
      case 'ic': this.iceBurst(ev[1], ev[2], ev[3]); break;
      case 'ps': this.ring(ev[1], ev[2], '#8fd14f', 120); break;
      case 'gn': this.lobs.push({ x0: ev[1], y0: ev[2], x1: ev[3], y1: ev[4], t: 0, max: Math.max(0.1, ev[5]) }); sfx.bash(ev[1], ev[2], false); break;
      case 'as': this.marks.push({ x: ev[1], y: ev[2], t: 0, max: (ev[3] || 3) + 0.9 }); sfx.siren(ev[1], ev[2]); break;
      case 'wl': this.ring(ev[1], ev[2], '#c9a66b', 50); this.dust(ev[1], ev[2], 40); sfx.bash(ev[1], ev[2], false); break;
      case 'wb': this.dust(ev[1], ev[2], 50); sfx.bashHit(ev[1], ev[2]); break;
      case 'sw': this.ring(ev[1], ev[2], '#a0c4ff', ev[3]); this.dust(ev[1], ev[2], ev[3] * 0.7); sfx.slam(ev[1], ev[2]); break;
      case 'tu': this.notices.push({ k: 'team', i: ev[1], lv: ev[2], pid: ev[3] }); sfx.waveClear(); break;
      case 'qm': {
        // a quick message or ping; in PvP only your own side sees them
        const pid = ev[1], k = ev[2], p = this.ps.get(pid);
        if (this.pv && pid !== this.me && (this.pv[0] === 'ffa' || this.pv[0] === 'duel' || (p && p.tm !== this.self.tm))) break;
        const q = QUICK[k]; if (!q) break;
        (this.qmSay || (this.qmSay = new Map())).set(pid, { k, t: this.time });
        if (q.at) { this.pings = (this.pings || []).filter((x) => this.time - x.t < 6 && x.pid !== pid); this.pings.push({ pid, k, x: ev[3], y: ev[4], t: this.time }); }
        this.notices.push({ k: 'qm', pid, q: k });
        sfx.ping(ev[3], ev[4], k);
        break;
      }
      case 'dn': {
        this.notices.push({ k: 'down', pid: ev[1] }); sfx.down();
        if (ev[1] === this.me) { this.killedBy = ev[2] != null ? ev[2] : -1; this.slowMo = 0.9; this.shake = Math.min(16, this.shake + 10); }
        break;
      }
      case 'up': {
        if (ev[1] !== this.me) this.notices.push({ k: 'up', pid: ev[1] });
        // back on their feet: a green burst and a rising chime where they stand
        const p = ev[1] === this.me ? this.self : this.ps.get(ev[1]);
        if (p) { this.ring(p.x, p.y, '#43d17a', 70); this.ring(p.x, p.y, '#b6ffcf', 40); this.light(p.x, p.y, 200, 0.6, '67,209,122'); sfx.heal(p.x, p.y); }
        if (ev[1] === this.me) { this.killedBy = null; this.revivedAt = this.time; }
        break;
      }
      case 'ab': {
        const pid = ev[1];
        const cls = this.clsOf(pid);
        const c = CLASSES[cls];
        const p = this.ps.get(pid);
        const k = { asker: 'rage', nisanci: 'focus', izci: 'sprint', kalkanci: 'shield', kilicci: 'spin', ajan: 'shadow' }[cls];
        if (k && pid !== this.me) this.fx.set(pid, { k, until: this.time + (ev[2] || c.ab.dur) });
        if (p && pid !== this.me && k) this.ring(p.x, p.y, AB_COL[cls], 55);
        if (p && pid !== this.me && cls !== 'doktor' && cls !== 'alevci') sfx.ability(cls, p.x, p.y);
        break;
      }
      case 'kb': if (ev[1] === this.me) { const kk = this.cls === 'kalkanci' ? 0.4 : 1; this.self.kvx += ev[2] * kk; this.self.kvy += ev[3] * kk; this.shake = Math.min(14, this.shake + 10); } break;
      case 'x': this.explode(ev[1], ev[2], ev[3]); break;
      case 'fb': this.fireBurst(ev[1], ev[2], ev[3]); break;
      case 'sl':
        this.ring(ev[1], ev[2], '#e5484d', ev[3]);
        this.dust(ev[1], ev[2], ev[3]);
        sfx.slam(ev[1], ev[2]);
        if (Math.hypot(this.self.x - ev[1], this.self.y - ev[2]) < 500) this.shake = Math.min(16, this.shake + 12);
        break;
      case 'sp': this.goo(ev[1], ev[2]); break;
      case 'ws': if (ev[2]) sfx.sting('boss'); this.notices.push({ k: 'wave', w: ev[1], boss: ev[2] || 0 }); sfx.waveStart(); break;
      case 'mv': if (ev[1]) { this.notices.push({ k: 'mev', ev: ev[1] }); sfx.waveStart(); } break;
      case 'pl': this.planes.push({ x: ev[1], y: ev[2], a: ev[3] || 0, t: 0, max: 3.2 }); sfx.siren(ev[1], ev[2]); break;
      case 'dg': this.dust(ev[1], ev[2], 60); this.ring(ev[1], ev[2], '#8a6a3a', 70); sfx.slam(ev[1], ev[2]); break;
      case 'sc': this.ring(ev[1], ev[2], '#ff6fb5', ev[3]); this.ring(ev[1], ev[2], '#ff6fb5', ev[3] * 0.6); sfx.siren(ev[1], ev[2]); break;
      case 'rz': this.dust(ev[1], ev[2], 30); this.ring(ev[1], ev[2], '#b07ad8', 40); break;
      case 'tp': this.ring(ev[1], ev[2], '#b07ad8', 60); this.ring(ev[3], ev[4], '#b07ad8', 60); this.light(ev[3], ev[4], 180, 0.6, '176,122,216'); sfx.summon(ev[3], ev[4]); break;
      case 'cr': this.lobs.push({ x0: ev[1], y0: ev[2], x1: ev[3], y1: ev[4], t: 0, max: Math.max(0.1, ev[5]), car: true }); this.marks.push({ x: ev[3], y: ev[4], t: 0, max: Math.max(0.1, ev[5]) + 0.2, car: true }); break;
      case 'tb': this.explode(ev[1], ev[2], 50); this.dust(ev[1], ev[2], 40); break;
      case 'fan': this.fanFx(ev[1], ev[2], ev[3], ev[4], ev[5]); break;
      case 'hz': this.ring(ev[1], ev[2], '#6ad8a0', 170); break;
      case 'ab2': this.ring(ev[1], ev[2], '#d8d0b0', 40); sfx.turretShot(ev[1], ev[2]); break;
      case 'sm': this.ring(ev[1], ev[2], '#b07ad8', 90); this.light(ev[1], ev[2], 200, 0.5, '176,122,216'); sfx.summon(ev[1], ev[2]); break;
      case 'pk': {
        const [, pid, k, x, y, amount] = ev;
        const txt = k === 0 ? `+${amount} can` : k === 1 ? `+${amount} altın` : k === 2 ? 'Güç! 2× hasar' : 'Hız!';
        this.float(x, y - 20, txt, ITEMS[k].col);
        this.ring(x, y, ITEMS[k].col, 40);
        sfx.pickup(k, x, y);
        break;
      }
      case 'bs': {
        const [, pid, x, y, a, hit] = ev;
        const p = this.ps.get(pid);
        if (pid !== this.me) { if (p) p.bashT = 0.25; sfx.bash(x, y, false); }
        if (hit) { this.bashHit(x + Math.cos(a) * 40, y + Math.sin(a) * 40); sfx.bashHit(x, y); if (pid === this.me) this.shake = Math.min(10, this.shake + 5); }
        break;
      }
      case 'cu': if (ev[1] === this.me) this.notices.push({ k: 'cu', n: ev[2] }); break;
      case 'ae': if (ev[8] && ev[8] !== this.me) break; this.notices.push({ k: 'adm', e: ev[1], n: ev[2], i: ev[3], who: ev[4], later: ev[5], q: ev[6], t: ev[7] }); break;
      case 'we': this.notices.push({ k: 'clear', w: ev[1], bonus: ev[2] }); sfx.waveClear(); break;
      // ---- PvP ----
      case 'vk': {
        const [, att, vic, tag, streak] = ev;
        const v = this.ps.get(vic);
        if (v) { this.splat(v.x, v.y, 16, true, false); this.blood(v.x, v.y, Math.random() * 6, 10); }
        if (vic === this.me) { this.deathBy = att; this.deathTag = tag; sfx.down(); this.shake = Math.min(14, this.shake + 8); }
        if (att === this.me && vic !== this.me) { sfx.waveClear(); this.killMark = 0.5; if (streak >= 2) this.notices.push({ k: 'streak', n: streak }); }
        this.notices.push({ k: 'pvk', att, vic, tag });
        break;
      }
      case 'vh': if (ev[1] === this.me && ev[2]) { const a = this.ps.get(ev[2]); if (a) this.dmgDir.push({ a: Math.atan2(a.y - this.self.y, a.x - this.self.x), t: 0.9 }); if (this.dmgDir.length > 6) this.dmgDir.shift(); } else { const v = this.ps.get(ev[1]); if (v) v.flash = 0.1; } break;
      case 'vw': this.notices.push({ k: 'pvw', round: ev[1], t: ev[2] }); break;
      case 'vf': this.notices.push({ k: 'pvf', round: ev[1] }); sfx.waveStart(); break;
      case 'vr': this.notices.push({ k: 'pvr', round: ev[1], win: ev[2], r0: ev[3], r1: ev[4] }); sfx.waveClear(); break;
      case 'iv': {
        const p = this.ps.get(ev[1]);
        if (ev[2]) { if (ev[1] !== this.me) this.fx.set(ev[1], { k: 'shadow', until: this.time + CLASSES.ajan.ab.dur + 2 }); if (p) this.puff(p.x, p.y, 40); }
        else { const f = this.fx.get(ev[1]); if (f && f.k === 'shadow') this.fx.delete(ev[1]); if (p) this.ring(p.x, p.y, '#9a8cff', 40); }
        break;
      }
      case 'hk': this.hackFx(ev[2], ev[3], ev[4], ev[5]); break;
      case 'tr': this.trains.push({ y: ev[1], dir: ev[2], warn: ev[3] || 3, t: 0 }); sfx.siren(this.self.x, ev[1]); if (Math.abs(this.self.y - ev[1]) < 300) this.notices.push({ k: 'train' }); break;
      case 'tx': { const tw = this.trains.find((q) => q.y === ev[1] && !q.go); if (tw) { tw.go = 1; tw.t = 0; } else this.trains.push({ y: ev[1], dir: ev[2], warn: 0, go: 1, t: 0 }); this.shake = Math.min(14, this.shake + (Math.abs(this.self.y - ev[1]) < 400 ? 9 : 3)); sfx.slam(this.self.x, ev[1]); break; }
      case 'wm': this.marks.push({ x: ev[1], y: ev[2], t: 0, max: (ev[3] || 1) + 0.2 }); this.dust(ev[1], ev[2], 80); sfx.slam(ev[1], ev[2]); break;
      case 'hh': this.ring(ev[1], ev[2], '#b07ad8', 120); this.light(ev[1], ev[2], 260, 0.7, '176,122,216'); sfx.summon(ev[1], ev[2]); break;
      case 'bt': this.blood(ev[1], ev[2], Math.random() * 6, 3); sfx.bashHit(ev[1], ev[2]); break;
      default: break;
    }
  }

  // ---------- local actions ----------
  update(dt) {
    if (this.paused) { sfx.flame(0); this.input.ab = false; return; }
    // hit-stop: a heavy kill freezes everything for a blink; going down plays out in slow motion
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.15; } else if (this.slowMo > 0) { this.slowMo -= dt; dt *= 0.35; }
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 9);
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
      let len = Math.hypot(mx, my), push = 1;
      const tm = this.input.tmove;
      if (len === 0 && tm && (tm.x || tm.y)) { mx = tm.x; my = tm.y; len = Math.hypot(mx, my); push = Math.min(1, len); } // joystick: analog
      const spd = st.spd * (this.fxOn(this.me, 'sprint') ? 1.6 : 1) * (S.haste > 0 ? 1.4 : 1) * (S.chill > 0 ? 0.6 : 1) * (cls === 'ajan' && (S.pfl & 2) && (S.lv.ab | 0) >= 2 ? 1.3 : 1) * push;
      const bx = S.x, by = S.y;
      if (len > 0) moveCircle(S, (mx / len) * spd * dt, (my / len) * spd * dt, PLAYER_R);
      if (S.kvx || S.kvy) {
        moveCircle(S, S.kvx * dt, S.kvy * dt, PLAYER_R);
        const damp = Math.exp(-dt * 7);
        S.kvx *= damp; S.kvy *= damp;
        if (Math.abs(S.kvx) + Math.abs(S.kvy) < 5) { S.kvx = 0; S.kvy = 0; }
      }
      for (const z of this.zs.values()) {
        if (z.dying || (z.fl & 128) || (z.fl & 4096)) continue;
        const min = ZTYPES[z.t].r + PLAYER_R;
        const dx = S.x - z.x, dy = S.y - z.y;
        const d = Math.hypot(dx, dy);
        if (d < min && d > 0.01) { S.x += (dx / d) * (min - d) * 0.6; S.y += (dy / d) * (min - d) * 0.6; }
      }
      resolveCircle(S, PLAYER_R);
      // walled in by the moving arena edge? step out to open ground (checked once a second)
      this.pocketT = (this.pocketT || 0) - dt;
      if (this.pocketT <= 0) { this.pocketT = 1; const B = WORLD.bounds, edge = Math.min(S.x - B.x0, B.x1 - S.x, S.y - B.y0, B.y1 - S.y); if (edge < 280 && escapePocket(S, PLAYER_R, 40)) { S.kvx = 0; S.kvy = 0; } }
      if (meP) meP.walk += Math.hypot(S.x - bx, S.y - by);
      if (this.input.taim != null) S.a = this.touch ? this.aimAssist(S, this.input.taim) : this.input.taim;
      else if (len > 0 && this.touch) S.a = Math.atan2(my, mx); // no aim stick: face where you walk
      else if (!this.touch) { const w = this.toWorld(this.input.mx, this.input.my); S.a = Math.atan2(w.y - S.y, w.x - S.x); }

      const abl = S.lv.ab | 0;
      const wf = (this.myWeapon && this.myWeapon.fx) || {}, firing = this.input.down || this.input.tfire;
      // paths that heat up: the longer the trigger is held, the faster they fire; the heat drains twice as fast
      this.heat = wf.ramp ? Math.max(0, Math.min(1, (this.heat || 0) + (firing ? dt / (wf.rampT || 1.5) : -dt * 2 / (wf.rampT || 1.5)))) : 0;
      const rate = st.rate * (this.fxOn(this.me, 'rage') ? 2 : 1) * (abl >= 3 && this.fxOn(this.me, 'sprint') ? 1.3 : 1)
        * (wf.ramp ? 1 + wf.ramp * this.heat : 1) * (wf.hasteRate && S.haste > 0 ? wf.hasteRate : 1);
      this.fireT = Math.max(0, this.fireT - dt);
      if ((this.input.down || this.input.tfire) && this.fireT <= 0) { this.fire(this.myWeapon, st); this.fireT = 1 / rate; }

      this.abLock = Math.max(0, this.abLock - dt);
      if (this.input.ab && S.abLeft <= 0 && this.abLock <= 0) {
        this.abLock = 0.6;
        const ax = S.x + Math.cos(S.a) * 40, ay = S.y + Math.sin(S.a) * 40;
        this.send({ t: 'ab', x: Math.round(ax), y: Math.round(ay) });
        const k = { asker: 'rage', nisanci: 'focus', izci: 'sprint', kalkanci: 'shield', kilicci: 'spin' }[cls];
        if (k) { this.fx.set(this.me, { k, until: this.time + abDur(cls, S.lv.ab) }); this.ring(S.x, S.y, AB_COL[cls], 60); }
        if (cls !== 'doktor' && cls !== 'alevci') sfx.ability(cls, S.x, S.y);
      }

      // Dipçik: melee shove, the host decides what it hits
      S.bashLeft = Math.max(0, S.bashLeft - dt);
      if (this.input.bash && S.bashLeft <= 0 && this.phase === 'combat') {
        S.bashLeft = bashCd(cls);
        this.send({ t: 'bash', a: Math.round(S.a * 100) / 100 });
        if (meP) meP.bashT = 0.25;
        this.swoosh(S.x, S.y, S.a);
        sfx.bash(S.x, S.y, true);
      }
    }
    // one-use items (keys 1-4 in battle)
    const ui = this.input.use;
    if (active && ui != null && this.phase === 'combat' && S.inv[ui] > 0 && !(this.useLock > this.time)) {
      this.useLock = this.time + 0.45;
      let tx, ty;
      if (!this.touch && this.input.taim == null) { const w = this.toWorld(this.input.mx, this.input.my); tx = w.x; ty = w.y; }
      else { const d = GEAR_RANGE[ui] ? GEAR_RANGE[ui] * 0.6 : 0; tx = S.x + Math.cos(S.a) * d; ty = S.y + Math.sin(S.a) * d; }
      this.send({ t: 'use', i: ui, x: Math.round(tx), y: Math.round(ty) });
    }
    this.input.use = null;
    this.input.ab = false;
    this.input.bash = false;

    this.updateBullets(dt);

    // smooth everyone else toward the latest host positions
    const kf = 1 - Math.exp(-dt * 14);
    for (const [pid, p] of this.ps) {
      if (p.bashT > 0) p.bashT = Math.max(0, p.bashT - dt);
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
      // our own hits not confirmed by the host yet: the host has applied them well within 0.45 s, so anything older was
      // damage it reduced (armour, elites, shields) - forget it, or the zombie stays "dead" here with a sliver of health
      // left and our shots pass through it until the guess expires
      if (z.pend.length && this.time - z.pend[0].t > PEND_T) { z.pend = z.pend.filter((e) => this.time - e.t < PEND_T); if (z.dying && z.hp - z.pend.reduce((a, e) => a + e.d, 0) > 0) z.dying = 0; }
      if (z.dying && this.time - z.dying > PEND_T) { z.dying = 0; z.pend = []; }
      z.flash = Math.max(0, z.flash - dt);
    }
    for (const t of this.ts.values()) {
      t.a = lerpAngle(t.a, t.ta, kf);
      if (t.k === 1 || t.k === 2) { t.x += (t.tx - t.x) * Math.min(1, kf * 1.5); t.y += (t.ty - t.y) * Math.min(1, kf * 1.5); }
      else if (t.k === 5) { // the Eğitmen's dog runs around: follow it smoothly (it used to stay where it first appeared)
        const ox = t.x, oy = t.y;
        if (Math.hypot(t.tx - t.x, t.ty - t.y) > 320) { t.x = t.tx; t.y = t.ty; } else { const kd = Math.min(1, kf * 1.6); t.x += (t.tx - t.x) * kd; t.y += (t.ty - t.y) * kd; }
        const v = Math.hypot(t.x - ox, t.y - oy) / Math.max(dt, 1e-3);
        t.mv = (t.mv || 0) * 0.8 + (v > 25 ? 0.2 : 0);
      }
    }
    for (const q of this.spits.values()) { q.x += (q.tx - q.x) * kf; q.y += (q.ty - q.y) * kf; }

    this.updateParts(dt);
    this.hurt = Math.max(0, this.hurt - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.hitMark = Math.max(0, this.hitMark - dt);
    this.pHitMark = Math.max(0, (this.pHitMark || 0) - dt);
    this.killMark = Math.max(0, (this.killMark || 0) - dt);
    for (const d of this.dmgDir) d.t -= dt;
    for (const q of this.trains) q.t += dt;
    if (this.trains.length) this.trains = this.trains.filter((q) => (q.go ? q.t < 1.4 : q.t < q.warn + 1));
    if (this.dmgDir.length && this.dmgDir[0].t <= 0) this.dmgDir = this.dmgDir.filter((d) => d.t > 0);

    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = SEND_INTERVAL;
      if (S.inGame) {
        const h = this.hitsQ.splice(0, 60);
        const s = this.shotsQ.splice(0, 12);
        this.inN = (this.inN || 0) + 1;
        const m = { t: 'in', x: Math.round(S.x), y: Math.round(S.y), a: Math.round(S.a * 100) / 100, h, s, n: this.inN, k: this.lastQ || 0 };
        if (this.hitsP.length) m.p = this.hitsP.splice(0, 24);
        this.send(m);
      } else if (this.lastQ && this.lastQ !== this.ackSent) { this.ackSent = this.lastQ; this.send({ t: 'in', k: this.lastQ }); } // watching or waiting: still confirm snapshots
    }

    // who the camera follows
    const watching = S.inGame || this.watcher;
    if ((S.inGame && S.alive) || (this.pv && S.inGame)) this.spectate = null;
    else if (watching && this.specStep) { // switch to the next / previous living teammate
      const L = [...this.ps.entries()].filter(([pid, p]) => pid !== this.me && p.alive).map(([pid]) => pid);
      if (L.length) { const i = L.indexOf(this.spectate); this.spectate = L[((i < 0 ? 0 : i + this.specStep) % L.length + L.length) % L.length]; }
      this.specStep = 0;
    }
    else if (watching) {
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
    const abl = S.lv.ab | 0;
    const dmg = st.dmg * (focus ? (abl >= 3 && this.cls === 'nisanci' ? 2.5 : 2) : 1) * (S.power > 0 ? 2 : 1)
      * (abl >= 3 && this.cls === 'asker' && this.fxOn(this.me, 'rage') ? 1.3 : 1) * (c.pelDmg || 1)
      * (this.cls === 'asker' && S.hp > S.maxHp * 0.5 ? 1.1 : 1);
    const pierce = focus ? 99 : c.pierce;
    const f = c.fx || {};
    const critP = (st.crit || 0) + (f.crit || 0) + (f.critGold ? Math.min(0.2, (S.gold | 0) / 1000 * f.critGold) : 0) + (f.critInv && ((S.pfl & 2) || this.fxOn(this.me, 'shadow')) ? f.critInv : 0);
    const critX = f.critX || 2;
    if (c.kind === 'm') { this.swing(c, dmg, critP, critX); return; }
    const off = c.gun + 6;
    let mx = S.x + Math.cos(S.a) * off, my = S.y + Math.sin(S.a) * off;
    if (this.cls === 'izci') {
      // alternate between the two pistols
      this.side = -(this.side || 1);
      mx += Math.cos(S.a + Math.PI / 2) * 6 * this.side; my += Math.sin(S.a + Math.PI / 2) * 6 * this.side;
    }
    const hot = f.rampPel && (this.heat || 0) > 0.85, n = hot ? 1 + f.rampPel : c.pellets, pd = hot ? f.rampPelK || 0.6 : 1;
    const sp = hot ? { ...c, spread: Math.max(c.spread, 0.07) } : c;
    const hastePierce = f.hastePierce && S.haste > 0 ? f.hastePierce : 0;
    for (let i = 0; i < n; i++) {
      const crit = critP > 0 && Math.random() < critP;
      const b = this.makeBullet(sp, mx, my, S.a, (crit ? dmg * critX : dmg) * pd, crit && f.cap && f.crit && f.critX >= 3 ? 99 : Math.max(pierce, hastePierce), true);
      if (crit) b.crit = true;
      if (this.cls === 'kimyager' && !c.path) b.col = '#9dff6b';
      if (f.bounce) { b.bounce = f.bounce; b.bounceK = f.bounceK || 0.5; b.bounceAoe = f.bounceAoe || 1; }
      this.bullets.push(b);
    }
    if (c.heavy) this.shake = Math.min(8, this.shake + 1.5 * c.heavy);
    this.recoil = 1;
    this.shotsQ.push([Math.round(mx), Math.round(my), Math.round(S.a * 100) / 100]);
    if (c.kind !== 'f') { this.flash(mx, my, S.a); this.casing(S.x, S.y, S.a); }
    if (c.kind === 'f') this.flameAt.set(this.me, { t: this.time, x: S.x, y: S.y });
    sfx.shot(this.cls, S.x, S.y, true, this.myWeapon);
    if (this.cls === 'tamirci' || this.cls === 'nisanci' || this.cls === 'bombaci') this.shake = Math.min(8, this.shake + 4);
  }

  makeBullet(c, x, y, a, dmg, pierce, own) {
    const ang = a + (Math.random() * 2 - 1) * c.spread;
    const spd = c.bspd * (c.pellets > 1 || c.kind === 'f' ? 0.85 + Math.random() * 0.3 : 1);
    return {
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: c.life, max: c.life,
      dmg, pierce, own, hit: null, kind: c.kind || 'b', aoe: c.aoe || 0,
      w: (c.pellets > 1 ? 1.6 : c.gun >= 36 ? 2.6 : 2) + (c.heavy || 0) * 0.6,
      col: c.path ? c.col : null, frost: !!c.frost, pk: c.path || 0, tier: c.tier || 0, fire: c.kind === 'f',
      rico: c.fx && c.fx.rico ? c.fx.rico : 0, ricoN: c.fx && c.fx.rico ? c.fx.ricoN || 1 : 0, ricoUp: (c.fx && c.fx.ricoUp) || 0, pierceUp: (c.fx && c.fx.pierceUp) || 0,
      noShield: !!(c.fx && c.fx.noShield), look: c.look || '', home: own ? c.home || 0 : 0,
    };
  }

  // the Hacker's cone: a cyan sweep
  hackFx(x, y, a, R) {
    for (let i = 0; i < 14 && this.parts.length < QUAL.parts; i++) {
      const aa = a + (Math.random() - 0.5) * 1.1, s = R * (0.6 + Math.random() * 0.6);
      this.addPart({ x, y, vx: Math.cos(aa) * s * 1.6, vy: Math.sin(aa) * s * 1.6, life: 0.45, max: 0.45, col: '#4cf0d0', size: 2.2, kind: 'dot' });
    }
    this.light(x + Math.cos(a) * 80, y + Math.sin(a) * 80, 200, 0.5, '76,240,208');
  }
  // ---------- PvP and the new classes ----------
  isFoe(pid, p) {
    if (!this.pv || pid === this.me || !p || !p.alive) return false;
    return this.pv[0] === 'ffa' || p.tm !== this.self.tm;
  }
  foes() {
    const L = [];
    if (!this.pv || this.phase !== 'combat') return L;
    for (const [pid, p] of this.ps) if (this.isFoe(pid, p) && !(p.pfl & 1)) L.push([pid, p]);
    return L;
  }
  // the Ajan: +50 % on targets facing away, and the first hit out of the shadows counts double (triple with mastery 3)
  ajanBonus(face, x, y) {
    if (this.cls !== 'ajan') return 1;
    const S = this.self;
    let k = 1;
    if (face != null) { let d = Math.atan2(S.y - y, S.x - x) - face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (Math.abs(d) > 1.9) k *= 1.5; }
    if ((S.pfl & 2) || this.fxOn(this.me, 'shadow')) { k *= (S.lv.ab | 0) >= 3 ? 3 : 2; this.fx.delete(this.me); S.pfl &= ~2; }
    return k;
  }
  dealPHit(pid, p, dmg, tag, crit) {
    dmg *= this.ajanBonus(p.a, p.x, p.y);
    this.hitsP.push([pid, Math.round(dmg), tag | 0]);
    p.flash = 0.1;
    if (this.hitMark < 0.05) sfx.hit();
    this.hitMark = 0.16; this.pHitMark = 0.2;
    if (SETTINGS.dmgNums && this.texts.length < 40) this.texts.push({ x: p.x + (Math.random() - 0.5) * 14, y: p.y - PLAYER_R - 6, txt: String(Math.round(dmg * PVP_DMG / (1 + 0.25 * (this.self.wt | 0)))) + (crit ? '!' : ''), col: crit ? '#ff5a36' : '#ff9a9a', t: 0.5, small: !crit });
  }
  // the Kılıççı's sword: everything in an arc in front gets hit at once
  swing(c, dmg, critP, critX, second) {
    const S = this.self, reach = c.reach, arc = c.arc, f = c.fx || {};
    const inArc = (x, y, r) => {
      const dx = x - S.x, dy = y - S.y, d = Math.hypot(dx, dy);
      if (d > reach + r) return false;
      let da = Math.atan2(dy, dx) - S.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) <= arc || d < r + PLAYER_R;
    };
    let n = 0;
    for (const z of this.zs.values()) {
      if (z.dying || (z.fl & 128) || (z.fl & 4096) || !inArc(z.x, z.y, ZTYPES[z.t].r)) continue;
      const crit = critP > 0 && Math.random() < critP;
      this.dealHit(z, crit ? dmg * critX : dmg, true, crit);
      this.blood(z.x, z.y, S.a, 5); n++;
      if (n >= 12) break;
    }
    for (const [pid, p] of this.foes()) {
      if (!inArc(p.x, p.y, PLAYER_R)) continue;
      const crit = critP > 0 && Math.random() < critP;
      this.dealPHit(pid, p, crit ? dmg * critX : dmg, 9, crit);
      this.blood(p.x, p.y, S.a, 5);
    }
    this.slash(S.x, S.y, S.a, reach, c.col || '#e8f1ff', true, arc, this.swingMark(this.me));
    this.shotsQ.push([Math.round(S.x), Math.round(S.y), Math.round(S.a * 100) / 100]);
    if (n || this.pHitMark > 0.15) this.shake = Math.min(8, this.shake + 2);
    sfx.swish(S.x, S.y, true, !!f.heavySwing);
    // Çift kılıç's top power: a second, quicker cut right after
    if (f.doubleCut && !second) setTimeout(() => { if (this.self && this.self.alive && this.myWeapon === c) this.swing(c, dmg * f.doubleCut, critP, critX, true); }, 110);
    // Mızrak's top power: a slash wave flies on through everything in its way
    if (f.wave) this.bullets.push({ x: S.x + Math.cos(S.a) * reach * 0.6, y: S.y + Math.sin(S.a) * reach * 0.6, vx: Math.cos(S.a) * 900, vy: Math.sin(S.a) * 900, life: 0.4, max: 0.4, dmg: dmg * 0.6, pierce: 99, own: true, hit: null, kind: 'b', aoe: 0, w: 4, col: c.col, frost: false, pk: c.path || 0, tier: c.tier || 0, rico: 0, ricoN: 0, noShield: true, look: 'wave' });
  }
  // a quick message to the team; messages that point somewhere use the aim point (mouse, or 220 px ahead on a phone)
  quick(k, wx, wy) {
    const S = this.self; if (!S || !QUICK[k]) return;
    let x = wx, y = wy;
    if (x == null) { if (!this.touch && this.input.taim == null) { const w = this.toWorld(this.input.mx, this.input.my); x = w.x; y = w.y; } else { x = S.x + Math.cos(S.a) * 220; y = S.y + Math.sin(S.a) * 220; } }
    if (!QUICK[k].at) { x = S.x; y = S.y; }
    this.send({ t: 'qm', k, x: Math.round(x), y: Math.round(y) });
  }
  // remember a swing so the player's sword arm can sweep across; swings go left and right in turn
  swingMark(pid) {
    const m = this.swings || (this.swings = new Map()), old = m.get(pid), d = old && this.time - old.t < 0.9 ? 1 - old.d : 0;
    m.set(pid, { t: this.time, d }); return d;
  }
  slash(x, y, a, reach, col, mine, arc, dir) {
    if (this.parts.length > QUAL.parts) return;
    this.addPart({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, col: col || '#e8f1ff', size: reach, kind: 'slash', a, mine: !!mine, arc: arc || 1, sd: dir | 0 });
  }
  // the Hacker's bullets turn toward the nearest target ahead of them
  steer(b, dt, foes) {
    let best = null, bd = 230 * 230;
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    const look = (x, y) => { const dx = x - b.x, dy = y - b.y, d2 = dx * dx + dy * dy; if (d2 < bd && dx * ux + dy * uy > Math.sqrt(d2) * 0.55) { bd = d2; best = [x, y]; } };
    for (const z of this.zs.values()) if (!z.dying && !(z.fl & (128 | 4096))) look(z.x, z.y);
    for (const [, p] of foes) look(p.x, p.y);
    if (!best) return;
    const want = Math.atan2(best[1] - b.y, best[0] - b.x), cur = Math.atan2(b.vy, b.vx);
    let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    const na = cur + Math.max(-b.home * dt, Math.min(b.home * dt, d));
    b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
  }

  visualShot(pid, x, y, a) {
    if (pid === -2) { // Mühendis drone
      const c = { pellets: 1, spread: 0.02, bspd: 1500, life: 0.3, kind: 'b', gun: 8 };
      const b = this.makeBullet(c, x, y, a, 0, 0, false); b.col = '#7bdff2'; b.w = 1.4; this.bullets.push(b);
      sfx.droneShot(x, y);
      return;
    }
    if (pid === -1) {
      const c = { pellets: 1, spread: 0.03, bspd: 1300, life: 0.4, kind: 'b', gun: 20 };
      this.bullets.push(this.makeBullet(c, x, y, a, 0, 0, false));
      this.flash(x, y, a);
      sfx.turretShot(x, y);
      return;
    }
    const cls = this.clsOf(pid);
    const pl = this.ps.get(pid);
    const c = weaponOf(cls, pl ? pl.wt : 0, pl ? pl.wp : 0, pl ? pl.wb : 0);
    if (c.kind === 'm') { this.slash(x, y, a, c.reach, c.col || '#e8f1ff', false, c.arc, this.swingMark(pid)); sfx.swish(x, y, false, !!(c.fx && c.fx.heavySwing)); return; }
    if (c.kind === 'f') this.flameAt.set(pid, { t: this.time, x, y });
    for (let i = 0; i < c.pellets; i++) this.bullets.push(this.makeBullet(c, x, y, a, 0, c.pierce, false));
    if (c.kind !== 'f') this.flash(x, y, a);
    (this.recoils || (this.recoils = new Map())).set(pid, this.time);
    sfx.shot(cls, x, y, false, c);
  }

  updateBullets(dt) {
    const out = [], foes = this.foes();
    for (const b of this.bullets) {
      if (b.home) this.steer(b, dt, foes);
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.kind === 'f') { b.vx *= 0.97; b.vy *= 0.97; }
      if (b.life <= 0 || outOfMap(b.x, b.y)) { if (b.kind === 'g') this.grenadeBlast(b); continue; }
      if (pointInObstacle(b.x, b.y)) { if (b.kind === 'g') this.grenadeBlast(b); else if (b.kind === 'b') this.sparks(b.x, b.y); continue; }
      let alive = true;
      for (const z of this.zs.values()) {
        if (z.dying || (z.fl & 128) || (z.fl & 4096)) continue;
        const r = ZTYPES[z.t].r + (b.kind === 'f' ? 10 : 3);
        const dx = b.x - z.x, dy = b.y - z.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (b.hit && b.hit.has(z.id)) continue;
        if (b.kind === 'g') { this.grenadeBlast(b); alive = false; break; }
        if (b.kind === 'b' && z.t === 6 && !(z.fl & 2) && !(z.fl & 32) && !b.noShield && this.blocks(z, b)) {
          this.sparks(b.x, b.y); sfx.clang(b.x, b.y);
          // Delici rounds punch through the shield once, losing 40 % of their power
          if (b.pierce >= 2 && !b.shPass) { b.shPass = 1; b.dmg *= 0.6; } else { alive = false; break; }
        }
        if (b.own) this.dealHit(z, b.dmg, true, b.crit);
        if (b.kind === 'b') this.blood(b.x, b.y, Math.atan2(b.vy, b.vx), 4);
        if (b.pk) this.hitFx(b.col, b.fire, b.x, b.y, b.tier);
        if (b.pierce > 0 || b.shPass === 1) {
          // a piercing round loses 10 % with every zombie it goes through (some paths gain instead); the shield pass never costs a pierce
          if (b.shPass === 1) b.shPass = 2; else b.pierce--;
          if (b.pierceUp) b.dmg *= b.pierceUp; else if (b.pierce < 90) b.dmg *= 0.9;
          (b.hit || (b.hit = new Set())).add(z.id);
        }
        else if (b.ricoN > 0 && Math.random() < b.rico) {
          // a ricochet: the bullet bounces to the nearest other zombie it has not hit yet
          (b.hit || (b.hit = new Set())).add(z.id);
          b.ricoN--;
          let best = null, bd = 230 * 230;
          for (const o of this.zs.values()) {
            if (o.dying || b.hit.has(o.id)) continue;
            const dd = (o.x - b.x) ** 2 + (o.y - b.y) ** 2;
            if (dd < bd) { bd = dd; best = o; }
          }
          if (!best) { alive = false; break; }
          const sp = Math.hypot(b.vx, b.vy), a = Math.atan2(best.y - b.y, best.x - b.x);
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.dmg *= b.ricoUp || 0.7; b.life = Math.max(b.life, 0.35); b.max = Math.max(b.max, b.life);
          this.sparks(b.x, b.y);
          break;
        } else { alive = false; break; }
      }
      if (alive && b.own && foes.length) {
        for (const [pid, p] of foes) {
          const r = PLAYER_R + (b.kind === 'f' ? 10 : 3), dx = b.x - p.x, dy = b.y - p.y;
          if (dx * dx + dy * dy > r * r || (b.hit && b.hit.has('p' + pid))) continue;
          if (b.kind === 'g') { this.grenadeBlast(b); alive = false; break; }
          this.dealPHit(pid, p, b.dmg, b.pk || 0, b.crit);
          if (b.kind === 'b') this.blood(b.x, b.y, Math.atan2(b.vy, b.vx), 4);
          if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = new Set())).add('p' + pid); } else { alive = false; break; }
        }
      }
      if (alive) out.push(b);
    }
    this.bullets = out;
  }

  blocks(z, b) {
    const face = z.sface || z.face;
    const from = Math.atan2(-b.vy, -b.vx);
    let d = from - face;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < SHIELD_ARC;
  }

  float(x, y, txt, col) { if (this.texts.length < 30) this.texts.push({ x, y, txt, col, t: 0 }); }

  // every boss alive, biggest first (the HUD shows up to three)
  bosses() {
    const L = [];
    for (const z of this.zs.values()) if (isBoss(z.t) && !z.dying) L.push(z);
    return L.sort((a, b) => b.max - a.max || a.id - b.id).slice(0, 3);
  }

  // the biggest boss alive, for the health bar at the top of the screen
  boss() {
    let best = null;
    for (const z of this.zs.values()) if (isBoss(z.t) && (!best || z.max > best.max)) best = z;
    return best;
  }

  dealHit(z, dmg, eff, crit) {
    if (this.cls === 'ajan') dmg *= this.ajanBonus(z.face, z.x, z.y);
    this.hitsQ.push(eff ? [z.id, Math.round(dmg), crit ? 2 : 1] : [z.id, Math.round(dmg)]);
    z.pend.push({ d: dmg, t: this.time });
    z.flash = 0.08;
    const pending = z.pend.reduce((s, e) => s + e.d, 0);
    if (z.hp - pending <= 0) z.dying = this.time;
    if (this.hitMark < 0.05) sfx.hit();
    this.hitMark = 0.12;
    if (SETTINGS.dmgNums && this.texts.length < 40) {
      this.texts.push({ x: z.x + (Math.random() - 0.5) * 16, y: z.y - ZTYPES[z.t].r - 4, txt: String(Math.round(dmg)) + (crit ? '!' : ''), col: crit ? '#ff5a36' : '#ffe1a6', t: crit ? 0.3 : 0.5, small: !crit });
    }
  }

  grenadeBlast(b) {
    if (b.own) {
      for (const z of this.zs.values()) {
        if (z.dying || (z.fl & 128)) continue;
        if (Math.hypot(z.x - b.x, z.y - b.y) < b.aoe + ZTYPES[z.t].r) this.dealHit(z, b.dmg, true, b.crit);
      }
      for (const [pid, p] of this.foes()) if (Math.hypot(p.x - b.x, p.y - b.y) < b.aoe + PLAYER_R) this.dealPHit(pid, p, b.dmg, b.pk || 0, b.crit);
    }
    this.explode(b.x, b.y, b.aoe);
    if (b.pk && b.col) this.ring(b.x, b.y, b.col, b.aoe);
    // a bouncing bomb hops on and goes off again, weaker each time
    if (b.bounce > 0 && this.bullets.length < 400) {
      const sp = Math.hypot(b.vx, b.vy) || 600, a = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 0.6;
      this.bullets.push({ ...b, x: b.x - Math.cos(a) * 6, y: b.y - Math.sin(a) * 6, vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp * 0.7, life: 0.32, max: 0.32, dmg: b.dmg * b.bounceK, aoe: b.aoe * b.bounceAoe, bounce: b.bounce - 1, hit: null });
    }
  }

  // ---------- path effects ----------
  hitFx(col, fire, x, y, tier) {
    if (this.parts.length > QUAL.parts * 0.8) return;
    col = col || '#fff';
    const n = tier >= 5 ? 4 : tier >= 3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 110;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.28, max: 0.28, col, size: 1.8 + Math.random() * 1.6, kind: fire ? 'fire' : 'dot' });
    }
  }
  // Avcı's arrow fan: bolts that fly out in a fan from the player
  fanFx(x, y, a, n, R) {
    n = Math.max(2, Math.min(15, n | 0));
    for (let i = 0; i < n; i++) {
      const ang = a - 0.45 + 0.9 * (i / (n - 1));
      this.bullets.push({ x, y, vx: Math.cos(ang) * 1500, vy: Math.sin(ang) * 1500, life: R / 1500, max: R / 1500, dmg: 0, pierce: 99, own: false, hit: null, kind: 'b', aoe: 0, w: 2, col: null, frost: false, pk: 0, tier: 0, rico: 0, noShield: true, look: 'bolt' });
    }
    sfx.ability('avci', x, y);
  }

  zapFx(pts) {
    if (pts.length < 4) return;
    this.zaps.push({ pts, t: 0, max: 0.22, seed: Math.random() * 100 });
    for (let i = 2; i < pts.length; i += 2) this.light(pts[i], pts[i + 1], 90, 0.15, '154,216,255');
    sfx.zap(pts[0], pts[1]);
  }
  bolt(x, y, r) {
    this.zaps.push({ pts: [x - 30 + Math.random() * 60, y - 420, x + (Math.random() - 0.5) * 50, y - 200, x, y], t: 0, max: 0.35, seed: Math.random() * 100, big: true });
    this.ring(x, y, '#cfeeff', r);
    this.light(x, y, r * 3, 0.4, '190,230,255');
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 200;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, max: 0.3, col: i % 2 ? '#e6f7ff' : '#9ad8ff', size: 2, kind: 'dot' });
    }
    this.decals.push({ x, y, r: r * 0.3, scorch: true });
    sfx.thunder(x, y);
    if (Math.hypot(this.self.x - x, this.self.y - y) < 600) this.shake = Math.min(14, this.shake + 7);
  }
  puff(x, y, r) {
    this.ring(x, y, '#ffb347', r);
    this.light(x, y, r * 2.2, 0.15, '255,170,80');
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * r * 2;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, max: 0.3, col: i % 2 ? '#ffb347' : '#ff6b2c', size: 3 + Math.random() * 3, kind: 'fire' });
    }
  }
  iceBurst(x, y, r) {
    this.ring(x, y, '#cfefff', r);
    this.light(x, y, r * 2, 0.3, '160,230,255');
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * r * 2.5;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, col: i % 2 ? '#e6fbff' : '#7bdff2', size: 2 + Math.random() * 3, kind: 'shard', a: Math.random() * 6 });
    }
    sfx.clang(x, y);
  }

  // ---------- effects ----------
  swoosh(x, y, a) {
    for (let i = 0; i < 7; i++) {
      const ang = a + (i / 6 - 0.5) * BASH.arc * 1.6, r = 34;
      this.addPart({ x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r, vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 120, life: 0.16, max: 0.16, col: '#e8e4d8', size: 2.4, kind: 'dot' });
    }
  }
  bashHit(x, y) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 120;
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, max: 0.3, col: '#f5e6b8', size: 2.2, kind: 'dot' });
    }
    this.ring(x, y, '#f5e6b8', 34);
  }
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
  fireBurst(x, y, r, quiet) {
    this.ring(x, y, '#ff6b2c', r);
    this.light(x, y, r * 2, 0.5, '255,140,60');
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, s = r * 2.2 * (0.7 + Math.random() * 0.4);
      this.addPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, max: 0.45, col: i % 2 ? '#ff9a3c' : '#ffd166', size: 6 + Math.random() * 5, kind: 'fire' });
    }
    if (quiet) sfx.boomSmall(x, y); else sfx.ability('alevci', x, y);
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
  addPart(p) { if (this.parts.length < Math.min(MAX_PARTS_CAP, QUAL.parts)) this.parts.push(p); }
  updateParts(dt) {
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.kind === 'smoke' ? 0.92 : p.kind === 'fire' ? 0.88 : 0.9;
      p.vx *= k; p.vy *= k; p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.t += dt;
    for (const z of this.zaps) z.t += dt;
    this.zaps = this.zaps.filter((z) => z.t < z.max);
    for (const l of this.lobs) l.t += dt;
    this.lobs = this.lobs.filter((l) => l.t < l.max);
    for (const q of this.planes) q.t += dt;
    this.planes = this.planes.filter((q) => q.t < q.max);
    for (const m of this.marks) m.t += dt;
    this.marks = this.marks.filter((m) => m.t < m.max);
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const l of this.lights) l.life -= dt;
    for (const t of this.texts) { t.t += dt; t.y -= dt * 30; }
    this.texts = this.texts.filter((t) => t.t < 1.2);
    this.lights = this.lights.filter((l) => l.life > 0);
  }

  toWorld(sx, sy) {
    const c = this.cam;
    return { x: c.x + (sx - c.vw / 2) / c.scale, y: c.y + (sy - c.vh / 2) / c.scale };
  }
}

export const AB_COL = { asker: '#ff6b2c', nisanci: '#7bdff2', izci: '#9ef01a', kalkanci: '#a0c4ff', doktor: '#43d17a', tamirci: '#ffd23f', alevci: '#ff6b2c', bombaci: '#ffb347', muhendis: '#7bdff2', kimyager: '#9dff6b', komutan: '#ffd34d' };

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
