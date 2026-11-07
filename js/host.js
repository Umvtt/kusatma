// The host's browser runs this: zombies, waves, damage, gold and upgrades.
// Every incoming message is checked for shape and size so bad data can't crash the game.
import {
  MAP_W, MAP_H, MAX_PLAYERS, VERSION, NAME_MAX, PLAYER_R, PLAYER_COLORS,
  CLASSES, UPGRADES, HEAL_COST, upgradeCost, ZTYPES, zMaxHp, ZS,
  FIRST_BREAK, BREAK_TIME, START_GOLD, stats, clamp,
} from './config.js';
import { moveCircle, pointInObstacle, clearLine, buildField, fieldDir, GW, GH } from './world.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const SNAP_RATE = 15;
const GOLDEN = 2.399963;

export function cleanName(s, pid) {
  const name = String(typeof s === 'string' ? s : '')
    .replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g, '')
    .trim()
    .slice(0, NAME_MAX);
  return name || 'Oyuncu ' + pid;
}

export class HostGame {
  constructor(net) {
    this.net = net;
    this.hostPid = 1;
    this.players = new Map();
    this.phase = 'lobby';
    this.local = null; // delivers messages to the host's own screen
    this.last = performance.now();
    this.snapAcc = 0;
    this.field = new Float32Array(GW * GH);
    this.resetWorld();
  }

  resetWorld() {
    this.wave = 0;
    this.waveN = 1;
    this.zombies = [];
    this.zIndex = new Map();
    this.turrets = [];
    this.mines = [];
    this.spits = [];
    this.nextId = 1;
    this.queue = [];
    this.spawnT = 0;
    this.breakT = 0;
    this.time = 0;
    this.fieldT = 0;
    this.shots = [];
    this.events = [];
  }

  // ---------- messaging ----------
  deliverLocal(msg) {
    const l = this.local;
    if (l) queueMicrotask(() => l(msg));
  }
  out(msg) { this.net.broadcast(msg); this.deliverLocal(msg); }
  sendTo(pid, msg) { if (pid === this.hostPid) this.deliverLocal(msg); else this.net.send(pid, msg); }
  ev(e) { if (this.events.length < 220) this.events.push(e); }

  roster() {
    return {
      t: 'r', ph: this.phase, code: this.net.code || null, host: this.hostPid,
      players: [...this.players.values()].map((p) => ({
        pid: p.pid, name: p.name, cls: p.cls, ready: p.ready, color: p.color, inGame: p.inGame,
      })),
    };
  }
  pushRoster() { this.out(this.roster()); }

  inGame() { return [...this.players.values()].filter((p) => p.inGame); }

  addPlayer(pid, name) {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[pid % PLAYER_COLORS.length];
    this.players.set(pid, { pid, name, cls: 'asker', ready: false, color, inGame: false, sp: 0 });
    this.sendTo(pid, { t: 'w', pid });
    this.pushRoster();
  }

  removePlayer(pid) {
    if (!this.players.has(pid)) return;
    this.players.delete(pid);
    this.turrets = this.turrets.filter((t) => t.owner !== pid);
    this.mines = this.mines.filter((m) => m.owner !== pid);
    this.pushRoster();
    if (this.phase === 'combat') this.checkOver();
    else if (this.phase === 'break') this.checkAllReady();
  }

  onMsg(pid, m) {
    try { this.handle(pid, m); } catch (e) { console.warn('Geçersiz mesaj yok sayıldı', e); }
  }

  handle(pid, m) {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return;
    const p = this.players.get(pid);
    if (!p) {
      if (m.t !== 'hello') return;
      if (m.v !== VERSION) { this.net.kick(pid, 'version'); return; }
      if (this.players.size >= MAX_PLAYERS) { this.net.kick(pid, 'full'); return; }
      this.net.markPlayer(pid);
      this.addPlayer(pid, cleanName(m.name, pid));
      return;
    }
    const isHost = pid === this.hostPid;
    switch (m.t) {
      case 'cls':
        if (!p.inGame && typeof m.c === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, m.c)) {
          p.cls = m.c; this.pushRoster();
        }
        break;
      case 'ready':
        if (this.phase === 'lobby') { p.ready = !!m.r; this.pushRoster(); }
        else if ((this.phase === 'combat' || this.phase === 'break') && !p.inGame) { this.enter(p); this.pushRoster(); }
        else if (this.phase === 'break' && p.inGame) { p.shopReady = !!m.r; this.checkAllReady(); }
        break;
      case 'in': this.onInput(p, m); break;
      case 'ab': this.onAbility(p, m); break;
      case 'buy': this.onBuy(p, m); break;
      case 'start': if (isHost && this.phase === 'lobby') this.start(); break;
      case 'lobby': if (isHost && this.phase === 'over') this.toLobby(); break;
      case 'kick':
        if (isHost && Number.isInteger(m.pid) && m.pid !== this.hostPid && this.players.has(m.pid)) {
          this.net.kick(m.pid, 'kick');
          this.removePlayer(m.pid);
        }
        break;
      default: break;
    }
  }

  onInput(p, m) {
    if (!p.inGame) return;
    if (p.alive && num(m.x) && num(m.y)) { p.x = clamp(m.x, 0, MAP_W); p.y = clamp(m.y, 0, MAP_H); }
    if (p.alive && num(m.a)) p.a = clamp(m.a, -10, 10);
    if (this.phase === 'combat' && Array.isArray(m.h) && m.h.length <= 80) {
      for (const h of m.h) {
        if (!Array.isArray(h) || h.length !== 2) continue;
        const [id, d] = h;
        if (!Number.isInteger(id) || !num(d) || d < 0 || d > 5000) continue;
        const z = this.zIndex.get(id);
        if (z) this.damage(z, d, p);
      }
    }
    if (Array.isArray(m.s) && m.s.length <= 16 && this.shots.length < 240) {
      for (const s of m.s) {
        if (Array.isArray(s) && s.length === 3 && s.every(num)) {
          this.shots.push([p.pid, Math.round(clamp(s[0], 0, MAP_W)), Math.round(clamp(s[1], 0, MAP_H)), r2(clamp(s[2], -10, 10))]);
        }
      }
    }
  }

  onAbility(p, m) {
    if (!p.inGame || !p.alive || (this.phase !== 'combat' && this.phase !== 'break')) return;
    if (this.time < p.abAt) return;
    const c = CLASSES[p.cls];
    const dmgMul = 1 + 0.15 * p.lv.dmg;
    p.abAt = this.time + c.ab.cd * stats(p.cls, p.lv).cd;
    this.ev(['ab', p.pid]);
    if (p.cls === 'doktor') {
      for (const q of this.inGame()) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > c.ab.r) continue;
        if (q.alive) q.hp = Math.min(q.maxHp, q.hp + c.ab.heal);
        else { q.alive = true; q.hp = Math.ceil(q.maxHp * 0.4); this.ev(['up', q.pid]); }
      }
      this.ev(['h', Math.round(p.x), Math.round(p.y)]);
    } else if (p.cls === 'tamirci') {
      let x = num(m.x) ? m.x : p.x, y = num(m.y) ? m.y : p.y;
      if (Math.hypot(x - p.x, y - p.y) > 120 || pointInObstacle(x, y, 14)) { x = p.x; y = p.y; }
      this.turrets = this.turrets.filter((t) => t.owner !== p.pid);
      this.turrets.push({ id: this.nextId++, owner: p.pid, x: clamp(x, 20, MAP_W - 20), y: clamp(y, 20, MAP_H - 20), a: p.a, life: c.ab.dur, cd: 0 });
    } else if (p.cls === 'tank') {
      p.shieldUntil = this.time + c.ab.dur;
    } else if (p.cls === 'alevci') {
      for (const z of this.zombies) {
        if (!z.dead && Math.hypot(z.x - p.x, z.y - p.y) < c.ab.r + ZTYPES[z.t].r) this.damage(z, c.ab.dmg * dmgMul, p);
      }
      this.ev(['fb', Math.round(p.x), Math.round(p.y), c.ab.r]);
    } else if (p.cls === 'bombaci') {
      const mine = this.mines.filter((x) => x.owner === p.pid);
      if (mine.length >= c.ab.max) this.mines.splice(this.mines.indexOf(mine[0]), 1);
      this.mines.push({ id: this.nextId++, owner: p.pid, x: p.x, y: p.y, arm: 0.6, life: 120 });
    }
  }

  onBuy(p, m) {
    if (this.phase !== 'break' || !p.inGame || typeof m.k !== 'string') return;
    if (m.k === 'heal') {
      if (p.alive && p.gold >= HEAL_COST && p.hp < p.maxHp) { p.gold -= HEAL_COST; p.hp = p.maxHp; }
      return;
    }
    const u = UPGRADES.find((x) => x.k === m.k);
    if (!u) return;
    const lv = p.lv[u.k];
    if (lv >= u.max) return;
    const cost = upgradeCost(u, lv);
    if (p.gold < cost) return;
    p.gold -= cost;
    p.lv[u.k]++;
    if (u.k === 'hp') {
      p.maxHp = stats(p.cls, p.lv).maxHp;
      p.hp = Math.min(p.maxHp, p.hp + 20);
    }
  }

  // ---------- game flow ----------
  start() {
    this.resetWorld();
    this.phase = 'break';
    this.breakT = FIRST_BREAK;
    const all = [...this.players.values()];
    all.forEach((p, i) => this.enter(p, i, all.length, true));
    this.pushRoster();
  }

  enter(p, index = 0, total = 1, ring = false) {
    const mates = ring ? [] : this.inGame().filter((q) => q.alive && q !== p);
    if (mates.length) {
      const m = mates[Math.floor(Math.random() * mates.length)];
      p.x = clamp(m.x + (Math.random() - 0.5) * 80, 40, MAP_W - 40);
      p.y = clamp(m.y + (Math.random() - 0.5) * 80, 40, MAP_H - 40);
    } else {
      const ang = (index / Math.max(1, total)) * Math.PI * 2;
      const rad = total > 1 ? 70 : 0;
      p.x = MAP_W / 2 + Math.cos(ang) * rad;
      p.y = MAP_H / 2 + Math.sin(ang) * rad;
    }
    p.lv = { dmg: 0, rate: 0, hp: 0, spd: 0, cd: 0 };
    p.maxHp = stats(p.cls, p.lv).maxHp;
    p.hp = p.maxHp;
    p.alive = true;
    p.gold = START_GOLD + this.wave * 30;
    p.kills = 0;
    p.dmg = 0;
    p.abAt = 0;
    p.shieldUntil = 0;
    p.a = 0;
    p.shopReady = false;
    p.ready = false;
    p.sp = (p.sp || 0) + 1;
    p.inGame = true;
  }

  startWave() {
    this.wave++;
    this.phase = 'combat';
    const n = Math.max(1, this.inGame().length);
    this.waveN = n;
    const w = this.wave;
    const total = Math.min(450, Math.round((8 + w * 5) * (0.7 + 0.3 * n)));
    const pRun = w >= 2 ? Math.min(0.28, 0.08 + w * 0.02) : 0;
    const pBig = w >= 3 ? Math.min(0.14, 0.03 + w * 0.01) : 0;
    const pSpit = w >= 4 ? Math.min(0.12, 0.02 + w * 0.01) : 0;
    this.queue = [];
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      this.queue.push(r < pBig ? 2 : r < pBig + pSpit ? 4 : r < pBig + pSpit + pRun ? 1 : 0);
    }
    if (w % 5 === 0) {
      const bosses = 1 + Math.floor((n - 1) / 4);
      for (let i = 0; i < bosses; i++) this.queue.splice(Math.floor(this.queue.length * (0.3 + 0.2 * i)), 0, 3);
    }
    this.spawnT = 0.5;
    for (const p of this.inGame()) p.shopReady = false;
    this.ev(['ws', w]);
    this.pushRoster();
  }

  endWave() {
    this.phase = 'break';
    this.breakT = BREAK_TIME;
    this.spits = [];
    const bonus = 20 + this.wave * 6;
    for (const p of this.inGame()) {
      p.gold += bonus;
      p.shopReady = false;
      if (!p.alive) { p.alive = true; p.hp = Math.ceil(p.maxHp * 0.5); this.ev(['up', p.pid]); }
    }
    this.ev(['we', this.wave, bonus]);
    this.pushRoster();
  }

  checkAllReady() {
    if (this.phase !== 'break') return;
    const ps = this.inGame();
    if (ps.length && ps.every((p) => p.shopReady)) this.breakT = Math.min(this.breakT, 2);
  }

  checkOver() {
    const ps = this.inGame();
    if (!ps.length || ps.every((p) => !p.alive)) this.gameOver();
  }

  gameOver() {
    this.phase = 'over';
    const P = this.inGame()
      .map((p) => ({ pid: p.pid, name: p.name, cls: p.cls, color: p.color, kills: p.kills, dmg: Math.round(p.dmg) }))
      .sort((a, b) => b.kills - a.kills);
    this.out({ t: 'o', wave: this.wave, P });
    this.pushRoster();
  }

  toLobby() {
    this.phase = 'lobby';
    this.resetWorld();
    for (const p of this.players.values()) { p.inGame = false; p.ready = false; }
    this.pushRoster();
  }

  // ---------- simulation ----------
  step() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.phase !== 'combat' && this.phase !== 'break') return;
    this.tick(dt);
    if (this.phase !== 'combat' && this.phase !== 'break') return;
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAP_RATE) {
      this.snapAcc = 0;
      this.out(this.snapshot());
      this.shots = [];
      this.events = [];
    }
  }

  tick(dt) {
    this.time += dt;
    if (this.phase === 'break') {
      this.breakT -= dt;
      this.updateTurrets(dt);
      if (this.breakT <= 0) this.startWave();
      return;
    }
    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.fieldT = 0.25;
      buildField(this.inGame().filter((p) => p.alive), this.field);
    }
    this.spawn(dt);
    this.updateZombies(dt);
    this.updateSpits(dt);
    this.updateTurrets(dt);
    this.updateMines(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.phase === 'combat' && this.queue.length === 0 && this.zombies.length === 0) this.endWave();
  }

  spawn(dt) {
    const n = this.waveN;
    const interval = Math.max(0.05, (0.9 - this.wave * 0.04) / Math.sqrt(n));
    const maxAlive = Math.min(110, 30 + 6 * n);
    this.spawnT -= dt;
    while (this.spawnT <= 0 && this.queue.length && this.zombies.length < maxAlive) {
      this.spawnZombie(this.queue.shift());
      this.spawnT += interval;
    }
    this.spawnT = Math.max(this.spawnT, -interval);
  }

  spawnZombie(t) {
    const T = ZTYPES[t];
    const alive = this.inGame().filter((p) => p.alive);
    let x = 0, y = 0;
    for (let tries = 0; tries < 6; tries++) {
      const side = Math.floor(Math.random() * 4);
      const along = Math.random();
      if (side < 2) { x = side === 0 ? T.r + 2 : MAP_W - T.r - 2; y = along * MAP_H; }
      else { x = along * MAP_W; y = side === 2 ? T.r + 2 : MAP_H - T.r - 2; }
      if (!alive.some((p) => Math.hypot(p.x - x, p.y - y) < 350)) break;
    }
    const id = this.nextId++;
    const z = {
      id, t, x, y, hp: zMaxHp(t, this.wave, this.waveN), dead: false,
      tg: null, rt: 0, los: false, losT: 0, st: ZS.NORMAL, stT: 0, cd: 1 + Math.random() * 2,
      dx: 0, dy: 0, cdir: 0, hitSet: null, slot: id * GOLDEN, side: id % 2 ? 1 : -1,
      sm: (1 + Math.min(0.35, this.wave * 0.015)) * (0.9 + Math.random() * 0.2),
    };
    this.zombies.push(z);
    this.zIndex.set(id, z);
  }

  hurt(p, dmg) {
    if (!p.alive) return;
    p.hp -= dmg * (this.time < p.shieldUntil ? 0.3 : 1);
    if (p.hp <= 0) this.down(p);
  }

  knock(p, fromX, fromY, power) {
    const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    this.ev(['kb', p.pid, Math.round(((p.x - fromX) / d) * power), Math.round(((p.y - fromY) / d) * power)]);
  }

  updateZombies(dt) {
    const players = this.inGame().filter((p) => p.alive);
    const zs = this.zombies;

    // spatial hash for crowd separation
    const HC = 60, hw = Math.ceil(MAP_W / HC);
    const grid = new Map();
    for (const z of zs) {
      const k = Math.floor(z.y / HC) * hw + Math.floor(z.x / HC);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(z);
    }

    for (const z of zs) {
      if (z.dead) continue;
      const T = ZTYPES[z.t];
      z.cd -= dt;

      // pick the nearest living player now and then
      z.rt -= dt;
      if (z.rt <= 0) {
        z.rt = 0.35 + Math.random() * 0.2;
        let best = null, bd = Infinity;
        for (const p of players) { const d = (p.x - z.x) ** 2 + (p.y - z.y) ** 2; if (d < bd) { bd = d; best = p; } }
        z.tg = best ? best.pid : null;
      }
      const tp = z.tg != null ? this.players.get(z.tg) : null;
      const target = tp && tp.alive && tp.inGame ? tp : null;

      if (!target) { this.wander(z, T, dt); continue; }

      const tx = target.x, ty = target.y;
      const dist = Math.hypot(tx - z.x, ty - z.y) || 1;
      z.losT -= dt;
      if (z.losT <= 0) { z.losT = 0.15 + Math.random() * 0.1; z.los = clearLine(z.x, z.y, tx, ty, T.r * 0.6); }
      const reach = T.r + PLAYER_R + 2;

      // ----- special moves -----
      if (z.st === ZS.WINDUP) {
        z.stT -= dt;
        z.cdir = Math.atan2(ty - z.y, tx - z.x);
        z.dx = Math.cos(z.cdir); z.dy = Math.sin(z.cdir);
        if (z.stT <= 0) { z.st = ZS.DASH; z.stT = 0.85; z.hitSet = new Set(); }
        this.separate(z, T, grid, hw, HC, dt, 0);
        continue;
      }
      if (z.st === ZS.DASH && z.t === 2) {
        z.stT -= dt;
        const sp = 420;
        const bx = z.x, by = z.y;
        moveCircle(z, Math.cos(z.cdir) * sp * dt, Math.sin(z.cdir) * sp * dt, T.r);
        for (const p of players) {
          if (z.hitSet.has(p.pid)) continue;
          if (Math.hypot(p.x - z.x, p.y - z.y) < reach + 6) { z.hitSet.add(p.pid); this.hurt(p, 22); this.knock(p, z.x, z.y, 560); }
        }
        if (z.stT <= 0 || Math.hypot(z.x - bx, z.y - by) < sp * dt * 0.4) { z.st = ZS.NORMAL; z.cd = 4.5; }
        continue;
      }
      if (z.st === ZS.SLAM) {
        z.stT -= dt;
        if (z.stT <= 0) {
          z.st = ZS.NORMAL; z.cd = 3.5;
          this.ev(['sl', Math.round(z.x), Math.round(z.y), 165]);
          for (const p of players) if (Math.hypot(p.x - z.x, p.y - z.y) < 165) { this.hurt(p, 30); this.knock(p, z.x, z.y, 620); }
        }
        continue;
      }
      if (z.st === ZS.SPIT) {
        z.stT -= dt;
        if (z.stT <= 0) {
          z.st = ZS.NORMAL; z.cd = 2.2 + Math.random() * 0.8;
          const a = Math.atan2(ty - z.y, tx - z.x) + (Math.random() - 0.5) * 0.12;
          this.spits.push({ id: this.nextId++, x: z.x + Math.cos(a) * T.r, y: z.y + Math.sin(a) * T.r, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, life: 2.2 });
        }
        continue;
      }

      // start a special move?
      if (z.cd <= 0 && z.los) {
        if (z.t === 2 && dist > 130 && dist < 380) { z.st = ZS.WINDUP; z.stT = 0.7; continue; }
        if (z.t === 3 && dist < 150) { z.st = ZS.SLAM; z.stT = 0.9; continue; }
        if (z.t === 4 && dist < 470) { z.st = ZS.SPIT; z.stT = 0.4; continue; }
        if (z.t === 1 && dist < 150) { z.st = ZS.DASH; z.stT = 0.45; z.cd = 2.4; }
      }
      if (z.st === ZS.DASH && z.t === 1) { z.stT -= dt; if (z.stT <= 0) z.st = ZS.NORMAL; }

      // ----- steering -----
      let dx, dy, speed = T.spd * z.sm;
      if (z.los) {
        let ax = tx, ay = ty;
        if (dist < 220 && dist > reach + 20) {
          // fan out so the crowd surrounds the player instead of queuing
          const off = Math.min(70, dist * 0.35);
          ax += Math.cos(z.slot) * off; ay += Math.sin(z.slot) * off;
        }
        dx = ax - z.x; dy = ay - z.y;
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        if (z.t === 4) {
          if (dist < 240) { dx = -dx; dy = -dy; speed *= 0.8; }
          else if (dist < 470) { const px = -dy * z.side, py = dx * z.side; dx = px; dy = py; speed *= 0.5; }
        }
      } else {
        const f = fieldDir(this.field, z.x, z.y);
        if (f) { dx = f.x; dy = f.y; } else { dx = (tx - z.x) / dist; dy = (ty - z.y) / dist; }
      }
      if (z.st === ZS.DASH && z.t === 1) speed *= 1.9;
      if (target && dist < reach && z.t !== 4) speed = 0;

      // smooth turning
      z.dx += (dx - z.dx) * Math.min(1, dt * 8);
      z.dy += (dy - z.dy) * Math.min(1, dt * 8);
      const dl = Math.hypot(z.dx, z.dy) || 1;
      this.separate(z, T, grid, hw, HC, dt, speed, z.dx / dl, z.dy / dl);

      // claw whoever is in reach
      let near = null, nd = Infinity;
      for (const p of players) { const d = Math.hypot(p.x - z.x, p.y - z.y); if (d < nd) { nd = d; near = p; } }
      if (near && nd < reach + 3) this.hurt(near, T.dps * dt);
    }
  }

  separate(z, T, grid, hw, HC, dt, speed, dx = 0, dy = 0) {
    let sx = 0, sy = 0;
    const gx = Math.floor(z.x / HC), gy = Math.floor(z.y / HC);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const a = grid.get((gy + oy) * hw + gx + ox);
      if (!a) continue;
      for (const o of a) {
        if (o === z || o.dead) continue;
        const ex = z.x - o.x, ey = z.y - o.y;
        const min = T.r + ZTYPES[o.t].r;
        const d = Math.hypot(ex, ey);
        if (d < min && d > 0.01) { const k = (min - d) / min; sx += (ex / d) * k; sy += (ey / d) * k; }
      }
    }
    moveCircle(z, (dx * speed + sx * 110) * dt, (dy * speed + sy * 110) * dt, T.r);
  }

  wander(z, T, dt) {
    z.cdir += (Math.random() - 0.5) * dt * 2;
    moveCircle(z, Math.cos(z.cdir) * T.spd * 0.3 * dt, Math.sin(z.cdir) * T.spd * 0.3 * dt, T.r);
  }

  updateSpits(dt) {
    const players = this.inGame().filter((p) => p.alive);
    for (const s of this.spits) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0 || pointInObstacle(s.x, s.y) || s.x < 0 || s.y < 0 || s.x > MAP_W || s.y > MAP_H) { s.life = 0; this.ev(['sp', Math.round(s.x), Math.round(s.y)]); continue; }
      for (const p of players) {
        if (Math.hypot(p.x - s.x, p.y - s.y) < PLAYER_R + 8) { this.hurt(p, 14); s.life = 0; this.ev(['sp', Math.round(s.x), Math.round(s.y)]); break; }
      }
    }
    this.spits = this.spits.filter((s) => s.life > 0);
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      t.life -= dt;
      t.cd -= dt;
      if (this.phase !== 'combat' || t.cd > 0) continue;
      const ab = CLASSES.tamirci.ab;
      let best = null, bd = ab.range * ab.range;
      for (const z of this.zombies) {
        if (z.dead) continue;
        const d = (z.x - t.x) ** 2 + (z.y - t.y) ** 2;
        if (d < bd && clearLine(t.x, t.y, z.x, z.y)) { bd = d; best = z; }
      }
      if (!best) continue;
      t.a = Math.atan2(best.y - t.y, best.x - t.x);
      const owner = this.players.get(t.owner) || null;
      this.damage(best, ab.dmg * (1 + 0.15 * (owner && owner.lv ? owner.lv.dmg : 0)), owner);
      if (this.shots.length < 240) this.shots.push([-1, Math.round(t.x + Math.cos(t.a) * 20), Math.round(t.y + Math.sin(t.a) * 20), r2(t.a)]);
      t.cd = ab.rate;
    }
    this.turrets = this.turrets.filter((t) => t.life > 0);
  }

  updateMines(dt) {
    const ab = CLASSES.bombaci.ab;
    for (const m of this.mines) {
      m.arm -= dt; m.life -= dt;
      if (m.arm > 0) continue;
      if (!this.zombies.some((z) => !z.dead && Math.hypot(z.x - m.x, z.y - m.y) < ZTYPES[z.t].r + 30)) continue;
      const owner = this.players.get(m.owner) || null;
      const mul = 1 + 0.15 * (owner && owner.lv ? owner.lv.dmg : 0);
      for (const z of this.zombies) if (!z.dead && Math.hypot(z.x - m.x, z.y - m.y) < ab.r + ZTYPES[z.t].r) this.damage(z, ab.dmg * mul, owner);
      this.ev(['x', Math.round(m.x), Math.round(m.y), ab.r]);
      m.life = 0;
    }
    this.mines = this.mines.filter((m) => m.life > 0);
  }

  damage(z, d, p) {
    if (z.dead) return;
    const dealt = Math.min(d, z.hp);
    z.hp -= d;
    if (p && p.inGame) p.dmg += dealt;
    if (z.hp <= 0) {
      z.dead = true;
      this.zIndex.delete(z.id);
      if (p && p.inGame) { p.gold += ZTYPES[z.t].gold; p.kills++; }
      this.ev(['d', Math.round(z.x), Math.round(z.y), z.t]);
    }
  }

  down(p) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    this.ev(['dn', p.pid]);
    this.checkOver();
  }

  snapshot() {
    const P = [];
    for (const p of this.players.values()) {
      if (!p.inGame) continue;
      P.push([
        p.pid, Math.round(p.x), Math.round(p.y), r2(p.a), Math.ceil(p.hp), p.maxHp, p.alive ? 1 : 0,
        p.gold, p.kills, p.sp, p.lv.dmg, p.lv.rate, p.lv.hp, p.lv.spd, p.lv.cd,
        Math.max(0, r1(p.abAt - this.time)), p.shopReady ? 1 : 0, this.time < p.shieldUntil ? 1 : 0,
      ]);
    }
    const Z = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      Z.push([z.id, z.t, Math.round(z.x), Math.round(z.y), Math.ceil(z.hp), z.st, z.st === ZS.WINDUP || z.st === ZS.DASH ? r2(z.cdir) : 0]);
    }
    return {
      t: 's', ph: this.phase === 'combat' ? 'c' : 'b', w: this.wave, n: this.waveN,
      bt: Math.max(0, Math.ceil(this.breakT)), zl: this.queue.length + Z.length,
      P, Z,
      T: this.turrets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), r2(t.a), Math.ceil(t.life)]),
      M: this.mines.map((m) => [m.id, Math.round(m.x), Math.round(m.y), m.arm <= 0 ? 1 : 0]),
      Q: this.spits.map((s) => [s.id, Math.round(s.x), Math.round(s.y)]),
      S: this.shots, E: this.events,
    };
  }
}
