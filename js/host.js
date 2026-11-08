// The host's browser runs this: zombies, waves, damage, gold and upgrades.
// Every incoming message is checked for shape and size so bad data can't crash the game.
import {
  WORLD_W, WORLD_H, CX, CY, areaFor, MAPS, MAP_ORDER, DIFFS, MAX_PLAYERS, VERSION, NAME_MAX, PLAYER_R, PLAYER_COLORS,
  CLASSES, UPGRADES, HEAL_COST, upgradeCost, ZTYPES, zMaxHp, ZS, BOSS_ORDER, isBoss, CHARGE, SHIELD_ARC,
  WEAPON_COST, ITEMS, PATHS, BASH,
  FIRST_BREAK, BREAK_TIME, START_GOLD, stats, clamp,
} from './config.js';
import { WORLD, setMap, setBounds, moveCircle, pointInObstacle, clearLine, buildField, fieldDir, outOfMap, GW, GH } from './world.js';
import { generateMap } from './mapgen.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const SNAP_RATE = 15;
const GHOST_MS = 45000; // how long a player whose connection dropped keeps their spot
const token = () => { const b = new Uint8Array(8); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); };
const GOLDEN = 2.399963;
export const REVIVE_R = 60;
export const REVIVE_TIME = 3;

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
    this.backupAcc = 0;
    this.field = new Float32Array(GW * GH);
    this.mapPick = 'meydan'; // lobby choice, may be 'rastgele'
    this.diff = 'normal';
    this.theme = null;
    this.seed = 0;
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
    this.items = [];
    this.nextId = 1;
    this.queue = [];
    this.spawnT = 0;
    this.breakT = 0;
    this.time = 0;
    this.fieldT = 0;
    this.areaN = 1;
    this.bounds = null; // current playable rectangle, grows toward the target
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
      t: 'r', ph: this.phase, code: this.net.code || null, host: this.hostPid, succ: this.successor(),
      map: this.mapPick, diff: this.diff, theme: this.theme, seed: this.seed,
      players: [...this.players.values()].map((p) => ({
        pid: p.pid, name: p.name, cls: p.cls, ready: p.ready, color: p.color, inGame: p.inGame || !!p.ghost, away: !!p.ghost,
      })),
    };
  }
  pushRoster() { this.out(this.roster()); }

  inGame() { return [...this.players.values()].filter((p) => p.inGame); }

  // Who takes over if this host leaves: the connected player who joined first.
  successor() {
    let best = null;
    for (const p of this.players.values()) if (p.pid !== this.hostPid && !p.ghost && (best == null || p.pid < best)) best = p.pid;
    return best;
  }

  addPlayer(pid, name) {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[pid % PLAYER_COLORS.length];
    const tok = token();
    this.players.set(pid, { pid, name, cls: 'asker', ready: false, color, inGame: false, sp: 0, tok });
    this.sendTo(pid, { t: 'w', pid, tok });
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

  // A connection dropped. During a game the player keeps their spot for a while so they can come back.
  playerLost(pid) {
    const p = this.players.get(pid);
    if (!p) return;
    if (!p.inGame || (this.phase !== 'combat' && this.phase !== 'break')) { this.removePlayer(pid); return; }
    p.ghost = true; p.ghostAt = performance.now(); p.wasInGame = true; p.inGame = false;
    this.pushRoster();
    if (this.phase === 'combat') this.checkOver(); else this.checkAllReady();
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
      // coming back after a host change: same player number, same progress
      const rj = m.rejoin;
      if (rj && typeof rj === 'object' && Number.isInteger(rj.pid) && typeof rj.tok === 'string' && rj.tok.length <= 40) {
        const old = this.players.get(rj.pid);
        if (old && old.tok === rj.tok && rj.pid !== this.hostPid && this.net.rebind(pid, rj.pid)) {
          this.net.markPlayer(rj.pid);
          if (old.ghost) { old.ghost = false; old.inGame = !!old.wasInGame; }
          this.sendTo(rj.pid, { t: 'w', pid: rj.pid, tok: old.tok });
          this.pushRoster();
          return;
        }
      }
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
      case 'bash': this.onBash(p, m); break;
      case 'buy': this.onBuy(p, m); break;
      case 'start': if (isHost && this.phase === 'lobby') this.start(); break;
      case 'set':
        if (isHost && this.phase === 'lobby') {
          if (typeof m.map === 'string' && (m.map === 'rastgele' || Object.prototype.hasOwnProperty.call(MAPS, m.map))) this.mapPick = m.map;
          if (typeof m.diff === 'string' && Object.prototype.hasOwnProperty.call(DIFFS, m.diff)) this.diff = m.diff;
          this.pushRoster();
        }
        break;
      case 'chat': this.onChat(p, m); break;
      case 'pause': if (isHost && this.net.code == null) this.paused = !!m.on; break;
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
    const B = WORLD.bounds;
    if (p.alive && num(m.x) && num(m.y)) { p.x = clamp(m.x, B.x0, B.x1); p.y = clamp(m.y, B.y0, B.y1); }
    if (p.alive && num(m.a)) p.a = clamp(m.a, -10, 10);
    if (this.phase === 'combat' && Array.isArray(m.h) && m.h.length <= 80) {
      const slow = p.wp === 4 && p.wt > 0 ? PATHS[4].slow[p.wt] : 0;
      for (const h of m.h) {
        if (!Array.isArray(h) || h.length < 2 || h.length > 3) continue;
        const [id, d] = h;
        if (!Number.isInteger(id) || !num(d) || d < 0 || d > 5000) continue;
        const z = this.zIndex.get(id);
        if (!z) continue;
        if (slow && h[2] === 1) z.slowUntil = this.time + (isBoss(z.t) ? slow * 0.5 : slow);
        this.damage(z, d, p);
      }
    }
    if (Array.isArray(m.s) && m.s.length <= 16 && this.shots.length < 240) {
      for (const s of m.s) {
        if (Array.isArray(s) && s.length === 3 && s.every(num)) {
          this.shots.push([p.pid, Math.round(clamp(s[0], 0, WORLD_W)), Math.round(clamp(s[1], 0, WORLD_H)), r2(clamp(s[2], -10, 10))]);
        }
      }
    }
  }

  onChat(p, m) {
    if (typeof m.m !== 'string') return;
    const now = performance.now();
    if (now - (p.chatAt || 0) < 700) return; // at most one line every 0.7 s per player
    const text = m.m.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim().slice(0, 100);
    if (!text) return;
    p.chatAt = now;
    this.out({ t: 'c', pid: p.pid, m: text });
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
        else { q.alive = true; q.hp = Math.ceil(q.maxHp * 0.4); p.revives++; this.ev(['up', q.pid]); }
      }
      this.ev(['h', Math.round(p.x), Math.round(p.y)]);
    } else if (p.cls === 'tamirci') {
      let x = num(m.x) ? m.x : p.x, y = num(m.y) ? m.y : p.y;
      if (Math.hypot(x - p.x, y - p.y) > 120 || pointInObstacle(x, y, 14)) { x = p.x; y = p.y; }
      this.turrets = this.turrets.filter((t) => t.owner !== p.pid);
      const B = WORLD.bounds;
      this.turrets.push({ id: this.nextId++, owner: p.pid, x: clamp(x, B.x0 + 20, B.x1 - 20), y: clamp(y, B.y0 + 20, B.y1 - 20), a: p.a, life: c.ab.dur, cd: 0 });
    } else if (p.cls === 'kalkanci') {
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

  // Dipçik: a short melee shove in front of the player. Knocks zombies back, stuns them
  // and knocks a Kalkanlı's shield aside so it can be shot from the front.
  onBash(p, m) {
    if (!p.inGame || !p.alive || this.phase !== 'combat' || !num(m.a)) return;
    if (this.time < (p.bashAt || 0) - 0.15) return;
    p.bashAt = this.time + BASH.cd;
    const a = clamp(m.a, -10, 10);
    p.a = a;
    const dmg = BASH.dmg * (1 + 0.15 * (p.lv ? p.lv.dmg : 0));
    let hit = 0;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const T = ZTYPES[z.t];
      const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
      if (d > BASH.range + T.r) continue;
      let da = Math.atan2(dy, dx) - a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > BASH.arc && d > T.r + PLAYER_R) continue;
      hit++;
      const boss = isBoss(z.t);
      if (!boss) {
        z.stunT = z.t === 6 ? BASH.shieldStun : BASH.stun;
        const k = z.t === 2 ? 0.5 : 1;
        z.kvx = (dx / (d || 1)) * BASH.kb * k; z.kvy = (dy / (d || 1)) * BASH.kb * k;
        if (z.st === ZS.WINDUP || z.st === ZS.DASH || z.st === ZS.SPIT || z.st === ZS.SUMMON) { z.st = ZS.NORMAL; z.cd = Math.max(z.cd, 1.5); }
      }
      this.damage(z, boss ? dmg * 0.5 : dmg, p);
    }
    this.ev(['bs', p.pid, Math.round(p.x), Math.round(p.y), r2(a), hit ? 1 : 0]);
  }

  onBuy(p, m) {
    if (this.phase !== 'break' || !p.inGame || typeof m.k !== 'string') return;
    if (m.k === 'heal') {
      if (p.alive && p.gold >= HEAL_COST && p.hp < p.maxHp) { p.gold -= HEAL_COST; p.hp = p.maxHp; }
      return;
    }
    if (m.k === 'wpn') {
      if (p.wt >= 2 || p.gold < WEAPON_COST[p.wt + 1]) return;
      if (p.wt === 0) {
        // the first upgrade picks one of the four paths; later ones follow it
        if (!Number.isInteger(m.p) || m.p < 1 || m.p >= PATHS.length) return;
        p.wp = m.p;
      }
      p.gold -= WEAPON_COST[p.wt + 1]; p.wt++;
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
    this.theme = this.mapPick === 'rastgele' ? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)] : this.mapPick;
    this.seed = (Math.random() * 2 ** 31) | 0;
    const map = generateMap(this.theme, this.seed);
    setMap(map.theme, map.seed, map.obstacles, map.decor);
    this.areaN = Math.max(1, this.players.size);
    const a = areaFor(this.areaN);
    this.bounds = { x0: CX - a.w / 2, y0: CY - a.h / 2, x1: CX + a.w / 2, y1: CY + a.h / 2 };
    setBounds(this.bounds.x0, this.bounds.y0, this.bounds.x1, this.bounds.y1);
    this.phase = 'break';
    this.breakT = FIRST_BREAK;
    const all = [...this.players.values()];
    all.forEach((p, i) => {
      this.enter(p, i, all.length, true);
      // still reconnecting after a host change: they join this game as soon as they're back
      if (p.ghost) { p.wasInGame = true; p.inGame = false; }
    });
    this.pushRoster();
  }

  enter(p, index = 0, total = 1, ring = false) {
    const mates = ring ? [] : this.inGame().filter((q) => q.alive && q !== p);
    if (mates.length) {
      const m = mates[Math.floor(Math.random() * mates.length)];
      p.x = m.x + (Math.random() - 0.5) * 60;
      p.y = m.y + (Math.random() - 0.5) * 60;
    } else {
      const ang = (index / Math.max(1, total)) * Math.PI * 2;
      const rad = total > 1 ? 70 : 0;
      p.x = CX + Math.cos(ang) * rad;
      p.y = CY + Math.sin(ang) * rad;
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
    p.rev = 0;
    p.wt = 0;
    p.wp = 0;
    p.bashAt = 0;
    p.powerUntil = 0;
    p.hasteUntil = 0;
    p.revives = 0;
    p.downs = 0;
    p.picks = 0;
    p.a = 0;
    p.shopReady = false;
    p.ready = false;
    p.sp = (p.sp || 0) + 1;
    p.inGame = true;
    // a new player makes the map grow (it never shrinks during a game)
    this.areaN = Math.max(this.areaN, this.inGame().length);
  }

  startWave() {
    this.wave++;
    this.phase = 'combat';
    const n = Math.max(1, this.inGame().length);
    this.waveN = n;
    const w = this.wave;
    const total = Math.min(450, Math.round((8 + w * 5) * (0.7 + 0.3 * n) * DIFFS[this.diff].count));
    const pRun = w >= 2 ? Math.min(0.28, 0.08 + w * 0.02) : 0;
    const pBig = w >= 3 ? Math.min(0.14, 0.03 + w * 0.01) : 0;
    const pSpit = w >= 4 ? Math.min(0.12, 0.02 + w * 0.01) : 0;
    const pBoom = w >= 5 ? Math.min(0.1, 0.02 + (w - 5) * 0.01) : 0;
    const pShield = w >= 6 ? Math.min(0.1, 0.02 + (w - 6) * 0.01) : 0;
    const pSummon = w >= 8 ? Math.min(0.05, 0.015 + (w - 8) * 0.005) : 0;
    const table = [[2, pBig], [4, pSpit], [5, pBoom], [6, pShield], [7, pSummon], [1, pRun]];
    this.queue = [];
    for (let i = 0; i < total; i++) {
      let r = Math.random(), t = 0;
      for (const [type, pr] of table) { if (r < pr) { t = type; break; } r -= pr; }
      this.queue.push(t);
    }
    this.bossWave = 0;
    if (w % 5 === 0) {
      // Dev, Kraliçe, Koç in turn; from wave 20 two different bosses come together
      const k = w / 5 - 1;
      const kinds = [BOSS_ORDER[k % 3]];
      if (w >= 20) kinds.push(BOSS_ORDER[(k + 1) % 3]);
      const count = 1 + Math.floor((n - 1) / 4);
      let i = 0;
      for (let c = 0; c < count; c++) for (const t of kinds) this.queue.splice(Math.floor(this.queue.length * Math.min(0.9, 0.3 + 0.15 * i++)), 0, t);
      this.bossWave = kinds[0];
    }
    if (this.pendBoss) { this.queue.splice(Math.floor(this.queue.length * 0.4), 0, this.pendBoss); this.pendBoss = 0; }
    this.spawnT = 0.5;
    for (const p of this.inGame()) p.shopReady = false;
    this.ev(['ws', w, this.bossWave]);
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
      .map((p) => ({ pid: p.pid, name: p.name, cls: p.cls, color: p.color, kills: p.kills, dmg: Math.round(p.dmg), revives: p.revives || 0, downs: p.downs || 0, picks: p.picks || 0, wt: p.wt || 0 }))
      .sort((a, b) => b.kills - a.kills);
    this.out({ t: 'o', wave: this.wave, P, time: Math.round(this.time), diff: this.diff, theme: this.theme });
    this.pushRoster();
  }

  // events sent from the owner's admin panel
  adminEvent(k, n) {
    if (k === 'gold') {
      const g = Math.max(10, Math.min(5000, n | 0));
      for (const p of this.inGame()) p.gold += g;
      this.pushRoster();
    } else if (k === 'boss') {
      const t = BOSS_ORDER[Math.floor(Math.random() * BOSS_ORDER.length)];
      if (this.phase === 'combat') this.spawnZombie(t); else this.pendBoss = t;
    }
  }

  // a short summary of the room for the admin panel's room viewer
  detail() {
    return {
      ph: this.phase, w: this.wave, z: this.zombies.filter((z) => !z.dead).length + (this.queue ? this.queue.length : 0),
      diff: (DIFFS[this.diff] || {}).name || this.diff, map: (MAPS[this.theme || this.mapPick] || {}).name || 'Rastgele',
      p: [...this.players.values()].map((p) => [p.name, (CLASSES[p.cls] || {}).name || '', p.inGame ? (p.alive ? 1 : 0) : 2, p.kills | 0, p.gold | 0]),
    };
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
    let gone = false;
    for (const p of [...this.players.values()]) {
      if (p.ghost && now - p.ghostAt > GHOST_MS) {
        this.players.delete(p.pid); gone = true;
        this.turrets = this.turrets.filter((t) => t.owner !== p.pid);
        this.mines = this.mines.filter((m) => m.owner !== p.pid);
      }
    }
    if (gone) { this.pushRoster(); if (this.phase === 'combat') this.checkOver(); }
    this.backupAcc += dt;
    if (this.backupAcc >= 1) { this.backupAcc = 0; this.sendBackup(); }
    if (this.paused || (this.phase !== 'combat' && this.phase !== 'break')) return;
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

  growBounds(dt) {
    const a = areaFor(this.areaN);
    const t = { x0: CX - a.w / 2, y0: CY - a.h / 2, x1: CX + a.w / 2, y1: CY + a.h / 2 };
    const step = 70 * dt; // pixels per second on each side
    const b = this.bounds;
    const go = (v, to, dir) => (dir < 0 ? Math.max(to, v - step) : Math.min(to, v + step));
    b.x0 = go(b.x0, t.x0, -1); b.y0 = go(b.y0, t.y0, -1); b.x1 = go(b.x1, t.x1, 1); b.y1 = go(b.y1, t.y1, 1);
    setBounds(b.x0, b.y0, b.x1, b.y1);
  }

  tick(dt) {
    this.time += dt;
    this.growBounds(dt);
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
    this.updateRevives(dt);
    this.updateZombies(dt);
    this.updateSpits(dt);
    this.updateTurrets(dt);
    this.updateMines(dt);
    this.updateItems(dt);
    this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.phase === 'combat' && this.queue.length === 0 && this.zombies.length === 0) this.endWave();
  }

  updateRevives(dt) {
    const ps = this.inGame();
    for (const p of ps) {
      if (p.alive) { p.rev = 0; continue; }
      let rate = 0, helper = null;
      for (const q of ps) {
        if (q === p || !q.alive || Math.hypot(q.x - p.x, q.y - p.y) > REVIVE_R) continue;
        const r = q.cls === 'doktor' ? 2 : 1;
        if (r > rate) { rate = r; helper = q; }
      }
      p.rev = rate ? (p.rev || 0) + dt * rate : Math.max(0, (p.rev || 0) - dt);
      if (p.rev >= REVIVE_TIME) {
        if (helper) helper.revives++;
        p.rev = 0; p.alive = true; p.hp = Math.ceil(p.maxHp * 0.35);
        this.ev(['up', p.pid]);
      }
    }
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

  spawnAt(t, x, y) {
    const T = ZTYPES[t];
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (pointInObstacle(px, py, T.r) || outOfMap(px, py)) continue;
      this.addZombie(t, px, py);
      return;
    }
  }

  addZombie(t, x, y) {
    const id = this.nextId++;
    const z = {
      id, t, x, y, hp: zMaxHp(t, this.wave, this.waveN, DIFFS[this.diff].hp), dead: false,
      tg: null, rt: 0, los: false, losT: 0, st: ZS.NORMAL, stT: 0, cd: 1 + Math.random() * 2, cd2: 4 + Math.random() * 3,
      dx: 0, dy: 0, cdir: 0, hitSet: null, slot: id * GOLDEN, side: id % 2 ? 1 : -1,
      sm: (1 + Math.min(0.35, this.wave * 0.015)) * (0.9 + Math.random() * 0.2) * DIFFS[this.diff].spd,
    };
    this.zombies.push(z);
    this.zIndex.set(id, z);
    return z;
  }

  spawnZombie(t) {
    const T = ZTYPES[t];
    const alive = this.inGame().filter((p) => p.alive);
    const B = WORLD.bounds;
    let x = 0, y = 0;
    for (let tries = 0; tries < 12; tries++) {
      const side = Math.floor(Math.random() * 4);
      const along = Math.random();
      if (side < 2) { x = side === 0 ? B.x0 + T.r + 2 : B.x1 - T.r - 2; y = B.y0 + along * (B.y1 - B.y0); }
      else { x = B.x0 + along * (B.x1 - B.x0); y = side === 2 ? B.y0 + T.r + 2 : B.y1 - T.r - 2; }
      if (pointInObstacle(x, y, T.r + 4)) continue;
      if (!alive.some((p) => Math.hypot(p.x - x, p.y - y) < 350)) break;
    }
    this.addZombie(t, x, y);
  }

  hurt(p, dmg) {
    if (!p.alive) return;
    p.hp -= dmg * DIFFS[this.diff].dmg * (this.time < p.shieldUntil ? 0.3 : 1);
    if (p.hp <= 0) this.down(p);
  }

  knock(p, fromX, fromY, power) {
    const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    this.ev(['kb', p.pid, Math.round(((p.x - fromX) / d) * power), Math.round(((p.y - fromY) / d) * power)]);
  }

  updateZombies(dt) {
    const players = this.inGame().filter((p) => p.alive);
    const zs = this.zombies;
    const maxAlive = Math.min(110, 30 + 6 * this.waveN);

    // spatial hash for crowd separation
    const HC = 60, hw = Math.ceil(WORLD_W / HC);
    const grid = new Map();
    for (const z of zs) {
      const k = Math.floor(z.y / HC) * hw + Math.floor(z.x / HC);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(z);
    }

    for (let zi = 0; zi < zs.length; zi++) {
      const z = zs[zi];
      if (z.dead) continue;
      const T = ZTYPES[z.t];
      z.cd -= dt; z.cd2 -= dt;

      // knocked back and dazed by a Dipçik
      if (z.stunT > 0) {
        z.stunT -= dt;
        if (z.kvx || z.kvy) {
          moveCircle(z, z.kvx * dt, z.kvy * dt, T.r);
          const damp = Math.exp(-dt * 8);
          z.kvx *= damp; z.kvy *= damp;
          if (Math.abs(z.kvx) + Math.abs(z.kvy) < 5) { z.kvx = 0; z.kvy = 0; }
        }
        this.separate(z, T, grid, hw, HC, dt, 0);
        continue;
      }

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
      const charge = CHARGE[z.t];

      // ----- special moves in progress -----
      if (z.st === ZS.WINDUP) { // İri / Koç aiming a charge
        z.stT -= dt;
        z.cdir = Math.atan2(ty - z.y, tx - z.x);
        z.dx = Math.cos(z.cdir); z.dy = Math.sin(z.cdir);
        if (z.stT <= 0) { z.st = ZS.DASH; z.stT = charge.dur; z.hitSet = new Set(); }
        this.separate(z, T, grid, hw, HC, dt, 0);
        continue;
      }
      if (z.st === ZS.DASH && charge) {
        z.stT -= dt;
        const bx = z.x, by = z.y;
        moveCircle(z, Math.cos(z.cdir) * charge.spd * dt, Math.sin(z.cdir) * charge.spd * dt, T.r);
        for (const p of players) {
          if (z.hitSet.has(p.pid)) continue;
          if (Math.hypot(p.x - z.x, p.y - z.y) < reach + 6) { z.hitSet.add(p.pid); this.hurt(p, charge.dmg); this.knock(p, z.x, z.y, charge.kb); }
        }
        if (z.stT <= 0 || Math.hypot(z.x - bx, z.y - by) < charge.spd * dt * 0.4) { z.st = ZS.NORMAL; z.cd = charge.cd; }
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
          z.st = ZS.NORMAL;
          const a0 = Math.atan2(ty - z.y, tx - z.x);
          if (z.t === 8) { // the queen sprays a fan
            z.cd = 3;
            for (let i = -3; i <= 3; i++) this.spit(z, a0 + i * 0.16, 300);
          } else {
            z.cd = 2.2 + Math.random() * 0.8;
            this.spit(z, a0 + (Math.random() - 0.5) * 0.12, 340);
          }
        }
        continue;
      }
      if (z.st === ZS.FUSE) { // Patlayan about to burst
        z.stT -= dt;
        if (z.stT <= 0) this.burst(z, null);
        continue;
      }
      if (z.st === ZS.SUMMON) {
        z.stT -= dt;
        if (z.stT <= 0) {
          z.st = ZS.NORMAL;
          z.cd2 = z.t === 8 ? 8 : 6;
          const kind = z.t === 8 ? 1 : 0, n = z.t === 8 ? 4 : 3;
          this.ev(['sm', Math.round(z.x), Math.round(z.y)]);
          for (let i = 0; i < n && this.zombies.length < maxAlive + 15; i++) this.spawnAt(kind, z.x, z.y);
        }
        continue;
      }

      // ----- start a special move? -----
      if (z.los) {
        if (z.t === 5 && dist < reach + 14) { z.st = ZS.FUSE; z.stT = 0.6; continue; }
        if ((z.t === 7 || z.t === 8) && z.cd2 <= 0 && dist < 650) { z.st = ZS.SUMMON; z.stT = z.t === 8 ? 0.9 : 1; continue; }
        if (z.cd <= 0) {
          if (charge && dist > charge.min && dist < charge.max) { z.st = ZS.WINDUP; z.stT = charge.wind; continue; }
          if (z.t === 3 && dist < 150) { z.st = ZS.SLAM; z.stT = 0.9; continue; }
          if ((z.t === 4 && dist < 470) || (z.t === 8 && dist < 520)) { z.st = ZS.SPIT; z.stT = z.t === 8 ? 0.6 : 0.4; continue; }
          if (z.t === 1 && dist < 150) { z.st = ZS.DASH; z.stT = 0.45; z.cd = 2.4; }
        }
      }
      if (z.st === ZS.DASH && z.t === 1) { z.stT -= dt; if (z.stT <= 0) z.st = ZS.NORMAL; }

      // ----- steering -----
      const ranged = z.t === 4 || z.t === 7 || z.t === 8;
      let dx, dy, speed = T.spd * z.sm * (z.slowUntil > this.time ? 0.55 : 1);
      if (z.los) {
        let ax = tx, ay = ty;
        if (dist < 220 && dist > reach + 20) {
          // fan out so the crowd surrounds the player instead of queuing
          const off = Math.min(70, dist * 0.35);
          ax += Math.cos(z.slot) * off; ay += Math.sin(z.slot) * off;
        }
        dx = ax - z.x; dy = ay - z.y;
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        if (ranged) {
          const near = z.t === 7 ? 300 : 240, far = z.t === 7 ? 520 : 470;
          if (dist < near) { dx = -dx; dy = -dy; speed *= 0.8; }
          else if (dist < far) { const px = -dy * z.side, py = dx * z.side; dx = px; dy = py; speed *= 0.5; }
        }
      } else {
        const f = fieldDir(this.field, z.x, z.y);
        if (f) { dx = f.x; dy = f.y; } else { dx = (tx - z.x) / dist; dy = (ty - z.y) / dist; }
      }
      if (z.st === ZS.DASH && z.t === 1) speed *= 1.9;
      if (dist < reach && !ranged) speed = 0;

      // stuck against something? sidestep for a moment
      if (z.detT > 0) {
        z.detT -= dt;
        const c = Math.cos(z.det), sn = Math.sin(z.det);
        const nx = dx * c - dy * sn, ny = dx * sn + dy * c;
        dx = nx; dy = ny;
      }
      // smooth turning
      z.dx += (dx - z.dx) * Math.min(1, dt * 8);
      z.dy += (dy - z.dy) * Math.min(1, dt * 8);
      const dl = Math.hypot(z.dx, z.dy) || 1;
      const bx = z.x, by = z.y;
      this.separate(z, T, grid, hw, HC, dt, speed, z.dx / dl, z.dy / dl);
      if (speed > 0 && Math.hypot(z.x - bx, z.y - by) < speed * dt * 0.25) {
        z.stk = (z.stk || 0) + dt;
        if (z.stk > 0.4) { z.det = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2; z.detT = 0.8; z.stk = 0; }
      } else z.stk = 0;
      // face the target when close (matters for the Kalkanlı's shield)
      z.face = Math.atan2(ty - z.y, tx - z.x);

      // claw whoever is in reach
      if (T.dps > 0) {
        let near = null, nd = Infinity;
        for (const p of players) { const d = Math.hypot(p.x - z.x, p.y - z.y); if (d < nd) { nd = d; near = p; } }
        if (near && nd < reach + 3) this.hurt(near, T.dps * dt);
      }
    }
  }

  spit(z, a, spd) {
    const r = ZTYPES[z.t].r;
    this.spits.push({ id: this.nextId++, x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 2.2 });
  }

  // A Patlayan bursts: hurts nearby players and other zombies. byPlayer: who killed it, if anyone.
  burst(z, byPlayer) {
    if (z.burst) return;
    z.burst = true;
    const R = 110;
    this.ev(['x', Math.round(z.x), Math.round(z.y), R]);
    for (const p of this.inGame()) if (p.alive && Math.hypot(p.x - z.x, p.y - z.y) < R) { this.hurt(p, byPlayer ? 12 : 30); this.knock(p, z.x, z.y, 420); }
    if (!z.dead) this.damage(z, z.hp + 1, null);
    for (const o of this.zombies) if (o !== z && !o.dead && Math.hypot(o.x - z.x, o.y - z.y) < R + ZTYPES[o.t].r) this.damage(o, 60, byPlayer);
  }

  // Bullets and turret fire from the front don't hurt a Kalkanlı.
  shielded(z, fromX, fromY) {
    if (z.t !== 6 || z.face == null || z.stunT > 0) return false;
    let d = Math.atan2(fromY - z.y, fromX - z.x) - z.face;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < SHIELD_ARC;
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
      if (s.life <= 0 || pointInObstacle(s.x, s.y) || outOfMap(s.x, s.y)) { s.life = 0; this.ev(['sp', Math.round(s.x), Math.round(s.y)]); continue; }
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
      if (!this.shielded(best, t.x, t.y)) this.damage(best, ab.dmg * (1 + 0.15 * (owner && owner.lv ? owner.lv.dmg : 0)), owner);
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
      if (p && p.inGame) { p.gold += Math.round(ZTYPES[z.t].gold * DIFFS[this.diff].gold); p.kills++; }
      this.ev(['d', Math.round(z.x), Math.round(z.y), z.t]);
      if (isBoss(z.t)) for (let i = 0; i < 4; i++) this.drop(z.x + (Math.random() - 0.5) * 80, z.y + (Math.random() - 0.5) * 80);
      else if (Math.random() < 0.05) this.drop(z.x, z.y);
      if (z.t === 5) this.burst(z, p);
    }
  }

  drop(x, y) {
    if (this.items.length >= 40) return;
    const r = Math.random();
    const k = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3;
    this.items.push({ id: this.nextId++, k, x: Math.round(x), y: Math.round(y), life: 25 });
  }

  updateItems(dt) {
    const players = this.inGame().filter((p) => p.alive);
    for (const it of this.items) {
      it.life -= dt;
      for (const p of players) {
        if (Math.hypot(p.x - it.x, p.y - it.y) > PLAYER_R + 18) continue;
        let amount = 0;
        if (it.k === 0) { if (p.hp >= p.maxHp) continue; amount = Math.min(40, p.maxHp - p.hp); p.hp += amount; }
        else if (it.k === 1) { amount = Math.round((15 + this.wave * 2) * DIFFS[this.diff].gold); p.gold += amount; }
        else if (it.k === 2) p.powerUntil = this.time + ITEMS[2].dur;
        else p.hasteUntil = this.time + ITEMS[3].dur;
        p.picks++;
        it.life = 0;
        this.ev(['pk', p.pid, it.k, it.x, it.y, Math.round(amount)]);
        break;
      }
    }
    this.items = this.items.filter((it) => it.life > 0);
  }

  down(p) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    p.downs++;
    this.ev(['dn', p.pid]);
    this.checkOver();
  }

  // ---------- host migration ----------
  sendBackup() {
    const succ = this.successor();
    if (succ == null || !this.net.code) return;
    this.net.send(succ, { t: 'bk', s: this.backup() });
  }

  backup() {
    const keep = ['phase', 'wave', 'waveN', 'diff', 'mapPick', 'theme', 'seed', 'areaN', 'bounds', 'breakT', 'time', 'queue', 'spawnT', 'bossWave', 'nextId', 'hostPid'];
    const st = {};
    for (const k of keep) st[k] = this[k];
    st.players = [...this.players.values()].map((p) => ({ ...p }));
    st.zombies = this.zombies.filter((z) => !z.dead).map((z) => ({ ...z, hitSet: null }));
    st.turrets = this.turrets; st.mines = this.mines; st.items = this.items; st.spits = this.spits;
    return st;
  }

  // Continue a game from the previous host's backup. Everyone else is kept as "reconnecting" for a while.
  restore(st, myPid) {
    const keep = ['phase', 'wave', 'waveN', 'diff', 'mapPick', 'theme', 'seed', 'areaN', 'bounds', 'breakT', 'time', 'queue', 'spawnT', 'bossWave', 'nextId'];
    for (const k of keep) if (st[k] !== undefined) this[k] = st[k];
    const oldHost = st.hostPid;
    this.hostPid = myPid;
    this.players = new Map();
    const now = performance.now();
    for (const p of st.players || []) {
      if (p.pid === oldHost) continue;
      const q = { ...p };
      if (q.pid !== myPid) { q.ghost = true; q.ghostAt = now; q.wasInGame = q.inGame; q.inGame = false; }
      this.players.set(q.pid, q);
    }
    this.zombies = (st.zombies || []).map((z) => ({ ...z, hitSet: null }));
    this.zIndex = new Map(this.zombies.map((z) => [z.id, z]));
    this.turrets = st.turrets || []; this.mines = st.mines || []; this.items = st.items || []; this.spits = st.spits || [];
    this.shots = []; this.events = [];
    if (this.theme && (WORLD.theme !== this.theme || WORLD.seed !== this.seed)) {
      const map = generateMap(this.theme, this.seed);
      setMap(map.theme, map.seed, map.obstacles, map.decor);
    }
    if (this.bounds) setBounds(this.bounds.x0, this.bounds.y0, this.bounds.x1, this.bounds.y1);
    this.fieldT = 0;
    this.last = performance.now();
    this.paused = false;
  }

  snapshot() {
    const P = [];
    for (const p of this.players.values()) {
      if (!p.inGame) continue;
      P.push([
        p.pid, Math.round(p.x), Math.round(p.y), r2(p.a), Math.ceil(p.hp), p.maxHp, p.alive ? 1 : 0,
        p.gold, p.kills, p.sp, p.lv.dmg, p.lv.rate, p.lv.hp, p.lv.spd, p.lv.cd,
        Math.max(0, r1(p.abAt - this.time)), p.shopReady ? 1 : 0, this.time < p.shieldUntil ? 1 : 0,
        p.alive ? 0 : r2((p.rev || 0) / REVIVE_TIME),
        Math.max(0, r1(p.powerUntil - this.time)), Math.max(0, r1(p.hasteUntil - this.time)), p.wt, p.wp || 0,
      ]);
    }
    const Z = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      const fl = (z.slowUntil > this.time ? 1 : 0) | (z.stunT > 0 ? 2 : 0);
      Z.push([z.id, z.t, Math.round(z.x), Math.round(z.y), Math.ceil(z.hp), z.st, z.st === ZS.WINDUP || z.st === ZS.DASH ? r2(z.cdir) : 0, z.t === 6 && z.face != null ? r2(z.face) : 0, fl]);
    }
    return {
      t: 's', ph: this.phase === 'combat' ? 'c' : 'b', w: this.wave, n: this.waveN, hm: DIFFS[this.diff].hp,
      B: [Math.round(this.bounds.x0), Math.round(this.bounds.y0), Math.round(this.bounds.x1), Math.round(this.bounds.y1)],
      bt: Math.max(0, Math.ceil(this.breakT)), zl: this.queue.length + Z.length,
      P, Z,
      T: this.turrets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), r2(t.a), Math.ceil(t.life)]),
      M: this.mines.map((m) => [m.id, Math.round(m.x), Math.round(m.y), m.arm <= 0 ? 1 : 0]),
      Q: this.spits.map((s) => [s.id, Math.round(s.x), Math.round(s.y)]),
      I: this.items.map((it) => [it.id, it.k, it.x, it.y, Math.ceil(it.life)]),
      S: this.shots, E: this.events,
    };
  }
}
