// The host's browser runs this: zombies, waves, damage, gold and upgrades.
// Every incoming message is checked for shape and size so bad data can't crash the game.
import {
  MAP_W, MAP_H, MAX_PLAYERS, VERSION, NAME_MAX, PLAYER_R, PLAYER_COLORS,
  CLASSES, UPGRADES, HEAL_COST, upgradeCost, ZTYPES, zMaxHp,
  FIRST_BREAK, BREAK_TIME, START_GOLD, stats, clamp,
} from './config.js';
import { moveCircle, pointInObstacle } from './world.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const SNAP_RATE = 15;

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
    this.resetWorld();
  }

  resetWorld() {
    this.wave = 0;
    this.waveN = 1;
    this.zombies = [];
    this.zIndex = new Map();
    this.turrets = [];
    this.nextZ = 1;
    this.nextT = 1;
    this.queue = [];
    this.spawnT = 0;
    this.breakT = 0;
    this.time = 0;
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
          this.shots.push([p.pid, Math.round(clamp(s[0], 0, MAP_W)), Math.round(clamp(s[1], 0, MAP_H)), r3(clamp(s[2], -10, 10))]);
        }
      }
    }
  }

  onAbility(p, m) {
    if (!p.inGame || !p.alive || (this.phase !== 'combat' && this.phase !== 'break')) return;
    if (this.time < p.abAt) return;
    const c = CLASSES[p.cls];
    p.abAt = this.time + c.ab.cd * stats(p.cls, p.lv).cd;
    this.events.push(['ab', p.pid]);
    if (p.cls === 'sihhiye') {
      for (const q of this.inGame()) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > c.ab.r) continue;
        if (q.alive) q.hp = Math.min(q.maxHp, q.hp + c.ab.heal);
        else { q.alive = true; q.hp = Math.ceil(q.maxHp * 0.4); this.events.push(['up', q.pid]); }
      }
      this.events.push(['h', Math.round(p.x), Math.round(p.y)]);
    } else if (p.cls === 'muhendis') {
      let x = num(m.x) ? m.x : p.x, y = num(m.y) ? m.y : p.y;
      if (Math.hypot(x - p.x, y - p.y) > 120 || pointInObstacle(x, y)) { x = p.x; y = p.y; }
      this.turrets = this.turrets.filter((t) => t.owner !== p.pid);
      this.turrets.push({ id: this.nextT++, owner: p.pid, x: clamp(x, 20, MAP_W - 20), y: clamp(y, 20, MAP_H - 20), a: p.a, life: c.ab.dur, cd: 0 });
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
    let i = 0;
    const all = [...this.players.values()];
    for (const p of all) this.enter(p, i++, all.length);
    this.pushRoster();
  }

  enter(p, index = 0, total = 1) {
    const mates = this.phase === 'lobby' || this.wave === 0 && total > 1 ? [] : this.inGame().filter((q) => q.alive && q !== p);
    if (mates.length) {
      const m = mates[Math.floor(Math.random() * mates.length)];
      p.x = clamp(m.x + (Math.random() - 0.5) * 80, 40, MAP_W - 40);
      p.y = clamp(m.y + (Math.random() - 0.5) * 80, 40, MAP_H - 40);
    } else {
      const ang = (index / Math.max(1, total)) * Math.PI * 2;
      p.x = MAP_W / 2 + Math.cos(ang) * 70;
      p.y = MAP_H / 2 + Math.sin(ang) * 70;
    }
    p.lv = { dmg: 0, rate: 0, hp: 0, spd: 0, cd: 0 };
    p.maxHp = stats(p.cls, p.lv).maxHp;
    p.hp = p.maxHp;
    p.alive = true;
    p.gold = START_GOLD + this.wave * 30;
    p.kills = 0;
    p.dmg = 0;
    p.abAt = 0;
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
    const pRun = w >= 2 ? Math.min(0.3, 0.08 + w * 0.02) : 0;
    const pBig = w >= 3 ? Math.min(0.15, 0.03 + w * 0.01) : 0;
    this.queue = [];
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      this.queue.push(r < pBig ? 2 : r < pBig + pRun ? 1 : 0);
    }
    if (w % 5 === 0) {
      const bosses = 1 + Math.floor((n - 1) / 4);
      for (let i = 0; i < bosses; i++) this.queue.splice(Math.floor(this.queue.length * (0.3 + 0.2 * i)), 0, 3);
    }
    this.spawnT = 0.5;
    for (const p of this.inGame()) p.shopReady = false;
    this.events.push(['ws', w]);
    this.pushRoster();
  }

  endWave() {
    this.phase = 'break';
    this.breakT = BREAK_TIME;
    const bonus = 20 + this.wave * 6;
    for (const p of this.inGame()) {
      p.gold += bonus;
      p.shopReady = false;
      if (!p.alive) { p.alive = true; p.hp = Math.ceil(p.maxHp * 0.5); this.events.push(['up', p.pid]); }
    }
    this.events.push(['we', this.wave, bonus]);
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
    this.spawn(dt);
    this.updateZombies(dt);
    this.updateTurrets(dt);
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
      x = side === 0 ? T.r + 2 : side === 1 ? MAP_W - T.r - 2 : along * MAP_W;
      y = side === 2 ? T.r + 2 : side === 3 ? MAP_H - T.r - 2 : along * MAP_H;
      if (side < 2) y = along * MAP_H;
      if (!alive.some((p) => Math.hypot(p.x - x, p.y - y) < 350)) break;
    }
    const hp = zMaxHp(t, this.wave, this.waveN);
    const z = {
      id: this.nextZ++, t, x, y, hp, dead: false,
      tg: null, rt: 0, det: 0, detT: 0, stk: 0,
      sm: (1 + Math.min(0.35, this.wave * 0.015)) * (0.9 + Math.random() * 0.2),
    };
    this.zombies.push(z);
    this.zIndex.set(z.id, z);
  }

  updateZombies(dt) {
    const players = this.inGame().filter((p) => p.alive);
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.dead) continue;
      const T = ZTYPES[z.t];
      z.rt -= dt;
      if (z.rt <= 0) {
        z.rt = 0.4 + Math.random() * 0.2;
        let best = null, bd = Infinity;
        for (const p of players) {
          const d = (p.x - z.x) ** 2 + (p.y - z.y) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
        z.tg = best ? best.pid : null;
      }
      const p = z.tg != null ? this.players.get(z.tg) : null;
      const target = p && p.alive && p.inGame ? p : null;
      const tx = target ? target.x : MAP_W / 2, ty = target ? target.y : MAP_H / 2;
      let dx = tx - z.x, dy = ty - z.y;
      const dist = Math.hypot(dx, dy) || 1;
      dx /= dist; dy /= dist;
      if (z.detT > 0) {
        z.detT -= dt;
        const c = Math.cos(z.det), s = Math.sin(z.det);
        const nx = dx * c - dy * s, ny = dx * s + dy * c;
        dx = nx; dy = ny;
      }
      let sx = 0, sy = 0;
      for (let j = 0; j < zs.length; j++) {
        if (j === i) continue;
        const o = zs[j];
        const ox = z.x - o.x, oy = z.y - o.y;
        const min = T.r + ZTYPES[o.t].r;
        if (Math.abs(ox) > min || Math.abs(oy) > min) continue;
        const d = Math.hypot(ox, oy);
        if (d < min && d > 0.01) { const k = (min - d) / min; sx += (ox / d) * k; sy += (oy / d) * k; }
      }
      const reach = T.r + PLAYER_R + 2;
      const speed = target && dist < reach ? 0 : T.spd * z.sm;
      const bx = z.x, by = z.y;
      moveCircle(z, (dx * speed + sx * 90) * dt, (dy * speed + sy * 90) * dt, T.r);
      if (speed > 0 && Math.hypot(z.x - bx, z.y - by) < speed * dt * 0.25) {
        z.stk += dt;
        if (z.stk > 0.4) { z.det = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2; z.detT = 0.8; z.stk = 0; }
      } else z.stk = 0;
      if (target && dist < reach + 3) {
        target.hp -= T.dps * dt;
        if (target.hp <= 0) this.down(target);
      }
    }
  }

  updateTurrets(dt) {
    for (const t of this.turrets) {
      t.life -= dt;
      t.cd -= dt;
      if (this.phase !== 'combat' || t.cd > 0) continue;
      const ab = CLASSES.muhendis.ab;
      let best = null, bd = ab.range * ab.range;
      for (const z of this.zombies) {
        if (z.dead) continue;
        const d = (z.x - t.x) ** 2 + (z.y - t.y) ** 2;
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) continue;
      t.a = Math.atan2(best.y - t.y, best.x - t.x);
      const owner = this.players.get(t.owner) || null;
      this.damage(best, ab.dmg * (1 + 0.15 * (owner && owner.lv ? owner.lv.dmg : 0)), owner);
      if (this.shots.length < 240) this.shots.push([-1, Math.round(t.x + Math.cos(t.a) * 20), Math.round(t.y + Math.sin(t.a) * 20), r3(t.a)]);
      t.cd = ab.rate;
    }
    this.turrets = this.turrets.filter((t) => t.life > 0);
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
      if (this.events.length < 200) this.events.push(['d', Math.round(z.x), Math.round(z.y), z.t]);
    }
  }

  down(p) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    this.events.push(['dn', p.pid]);
    this.checkOver();
  }

  snapshot() {
    const P = [];
    for (const p of this.players.values()) {
      if (!p.inGame) continue;
      P.push([
        p.pid, Math.round(p.x), Math.round(p.y), r3(p.a), Math.ceil(p.hp), p.maxHp, p.alive ? 1 : 0,
        p.gold, p.kills, p.sp, p.lv.dmg, p.lv.rate, p.lv.hp, p.lv.spd, p.lv.cd,
        Math.max(0, r1(p.abAt - this.time)), p.shopReady ? 1 : 0,
      ]);
    }
    const Z = [];
    for (const z of this.zombies) if (!z.dead) Z.push([z.id, z.t, Math.round(z.x), Math.round(z.y), Math.ceil(z.hp)]);
    const T = this.turrets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), r3(t.a), Math.ceil(t.life)]);
    return {
      t: 's', ph: this.phase === 'combat' ? 'c' : 'b', w: this.wave, n: this.waveN,
      bt: Math.max(0, Math.ceil(this.breakT)), zl: this.queue.length + Z.length,
      P, Z, T, S: this.shots, E: this.events,
    };
  }
}
