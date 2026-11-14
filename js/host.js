// The host's browser runs this: zombies, waves, damage, gold and upgrades.
// Every incoming message is checked for shape and size so bad data can't crash the game.
import { WORLD_W, WORLD_H, CX, CY, areaFor, MAPS, MAP_ORDER, DIFFS, MAX_PLAYERS, VERSION, NAME_MAX, PLAYER_R, PLAYER_COLORS, QUICK, CLASSES, UPGRADES, HEAL_COST, upgradeCost, ZTYPES, zMaxHp, scaleFor, ZS, BOSS_ORDER, isBoss, CHARGE, SHIELD_ARC, BOSS_DMG, BOSS_CD, WEAPON_COST, ITEMS, BASH, WMAX, BRANCH_SWAP, weaponSpent, weaponOf, pathOk, newLv, lvArr, AB_COST, abDur, GEAR, GEAR_RANGE, TEAM, teamCost, TEAM_CHUNK, gearCost, gearMax, bashCd, FIRST_BREAK, BREAK_TIME, START_GOLD, stats, clamp, MODE_ORDER, dailyRules, MEV, MEV_ORDER, PVP_ORDER } from './config.js';
import { PvpMixin } from './pvp.js';
import { gzip64 } from './net.js';
import { packZ, packFar, rowDelta } from './pack.js';
import { WORLD, setMap, setBounds, moveCircle, pointInObstacle, clearLine, buildField, fieldAhead, fieldAt, outOfMap, GW, GH, escapePocket } from './world.js';
import { generateMap, METRO_TRACKS } from './mapgen.js';
import { ITEMS as COS, checkPass, ownsCls, nkey } from './catalog.js';

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
    this.mode = 'normal'; // normal, endless, boss, hc, daily, sandbox or pvp
    this.pvp = 'tdm'; // the kind of PvP match when mode is pvp
    this.daily = null; // the day's rules in the daily challenge
    this.maxP = MAX_PLAYERS; // the host can set a lower limit when making the room
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
    this.team = TEAM.map(() => 0); // team upgrade levels
    this.teamFund = TEAM.map(() => 0); // gold put toward each one's next level
    this.bombs = []; // thrown grenades and air-strike bombs on their way down
    this.walls = []; // sandbag barricades
    this.zones = []; // poison clouds and ground fires
    this.mev = null; // the map event running now: { k, until }
    this.mevAt = Infinity;
    this.hordeT = 0;
    this.cars = []; // wrecked cars thrown by Dev Hurda, in the air
    this.graves = []; // where zombies died lately (the Cadı raises them)
    this.train = null; this.trainAt = null; this.hauntAt = null;
    this.pvpOver = null; this.roundPause = 0; this.score = [0, 0]; this.rounds = [0, 0]; this.round = 0; this.pvT = 0; this.matchT = 0;
  }

  // A player's derived numbers, cached until something that changes them changes.
  pc(p) {
    const key = `${p.cls}|${p.wt | 0}|${p.wp | 0}|${p.wb | 0}|${lvArr(p.lv).join()}|${this.team.join()}`;
    if (p._c && p._c.key === key) return p._c;
    const st = stats(p.cls, p.lv, p.wt, p.wp, p.wb, this.team);
    const w = weaponOf(p.cls, p.wt, p.wp, p.wb);
    p._c = { key, st, fx: w.fx, dps: st.dmg * st.rate * w.pellets * (w.pelDmg || 1) * (w.kind === 'g' ? 1.6 : 1) };
    return p._c;
  }

  // ---------- messaging ----------
  deliverLocal(msg) {
    const l = this.local;
    if (l) queueMicrotask(() => l(msg));
  }
  out(msg) { this.net.broadcast(msg); this.deliverLocal(msg); if (this.spec && this.spec.count) this.spec.send(msg); }
  // snapshots go to each guest with only the zombies near them (bosses always), plus a coarse map of the rest
  // for the minimap every few snapshots; a guest whose link is backed up skips a snapshot instead of falling behind
  sendSnaps() {
    const s = this.snapshot();
    this.deliverLocal(s);
    this.snapN = (this.snapN || 0) + 1;
    if (this.spec && this.spec.count && (this.snapN & 1)) this.spec.send(s); // hidden spectators: the whole picture, 7 times a second
    if (!this.net.sendSnap) { this.net.broadcast(s); return; }
    // events get numbers; a guest is sent every event it has not confirmed yet, so a lost snapshot loses nothing
    if (!this.hid) { this.hid = Math.floor(Math.random() * 1e9) + 1; this.evSeq = 0; this.evLog = []; }
    const es0 = this.evSeq + 1;
    for (const e of s.E) { this.evSeq++; this.evLog.push(e); }
    if (this.evLog.length > 600) this.evLog.splice(0, this.evLog.length - 600);
    const logFirst = this.evSeq - this.evLog.length + 1;
    let far = null; const now = performance.now(); // the minimap's coarse picture of every zombie, about twice a second per guest
    const bJ = JSON.stringify(s.B), tmJ = JSON.stringify(s.TM), pr = new Map(s.P.map((r) => [r[0], r]));
    const R2 = 1800 * 1800, N2 = 1000 * 1000, q = this.snapN;
    // each zombie's state key, worked out once per snapshot instead of once per guest
    const keys = s.Z.map((z) => z[4] + ',' + z[5] + ',' + z[6] + ',' + z[7] + ',' + z[8]), bossF = s.Z.map((z) => isBoss(z[1]));
    for (const p of this.players.values()) {
      if (p.pid === this.hostPid || !this.net.canSnap(p.pid)) continue;
      // zombies are described against what the guest has confirmed (not what was last sent), so lost or late snapshots heal by themselves
      const zh = p.zh || (p.zh = { ack: 0, hist: new Map(), ev0: es0 - 1 });
      const base = (zh.ack && zh.hist.get(zh.ack)) || null, bz = base ? base.zk : null;
      const full = !p.inGame || !p.alive, cur = new Map(), Z = [];
      const third = (zh.n = (zh.n || 0) + 1) % 3 === 0; // per guest, so a guest that gets fewer snapshots still sees far zombies move
      for (let zi = 0; zi < s.Z.length; zi++) {
        const z = s.Z[zi], boss = bossF[zi], d2 = (z[2] - p.x) ** 2 + (z[3] - p.y) ** 2;
        if (!full && !boss && d2 >= R2) continue;
        const key = keys[zi];
        cur.set(z[0], key);
        const bk = bz ? bz.get(z[0]) : undefined;
        if (bk === undefined || (zh.rm && zh.rm.has(z[0]))) Z.push([3, z]); // new to this guest, or its removal was sent since the confirmed snapshot: whole, with its type
        else if (bk !== key) Z.push(bk.slice(bk.indexOf(',')) === key.slice(key.indexOf(',')) ? [1, [z[0], z[2], z[3], z[4]]] : [2, z]); // only its health changed, or its state
        else if (boss || d2 < N2 || third) Z.push([0, [z[0], z[2], z[3]]]); // unchanged: only where it is now (far, off-screen ones every third snapshot)
      }
      // removals: every zombie this guest may have (from any snapshot sent, confirmed or not) that is gone now. A removal is
      // repeated until the guest confirms a snapshot newer than the last one that still carried the zombie, so one that
      // appeared and died between two confirmations never stays behind on the guest's screen as a ghost.
      const seen = zh.seen || (zh.seen = new Map()), ZD = [];
      const rm = zh.rm || (zh.rm = new Map());
      for (const [id, rq] of rm) if (zh.ack > rq) rm.delete(id);
      // (a full snapshot replaces what the guest has, but it may be lost: what was sent before stays remembered until
      // the guest confirms something newer, so a later delta snapshot still removes it)
      for (const [id, lastQ] of seen) { if (cur.has(id)) continue; if (zh.ack > lastQ) seen.delete(id); else if (bz) { ZD.push(id); rm.set(id, q); } } // nothing confirmed to build on: this snapshot is the whole picture and replaces what the guest has
      for (const id of cur.keys()) seen.set(id, q);
      const evFrom = Math.max((base ? base.ev : zh.ev0) + 1, logFirst, this.evSeq - 299);
      const E = evFrom <= this.evSeq ? this.evLog.slice(evFrom - logFirst) : [];
      // where each zombie mentioned here is, so a later snapshot can send only how far it moved since this one
      const zp = new Map(); for (const [k, e] of Z) zp.set(e[0], k >= 2 ? [e[2], e[3]] : [e[1], e[2]]);
      zh.hist.set(q, { zk: cur, ev: this.evSeq, t: performance.now(), pr, zp });
      if (zh.hist.size > 48) zh.hist.delete(zh.hist.keys().next().value);
      const m = Object.assign({}, s, { Z: [], ZM: packZ(Z, base && base.zp), ZD, zd: bz ? 1 : 0, q, hi: this.hid, E, es: evFrom });
      if (base) m.pb = zh.ack;
      // players: only what changed since the snapshot this guest confirmed (it rebuilds the rest from its copy of it)
      const bp = base && base.pr;
      if (bp) {
        const P = [], PD = [];
        for (const r of s.P) { const b = bp.get(r[0]), d = b && rowDelta(r, b); if (d) PD.push(d); else P.push(r); }
        m.P = P; m.PD = PD; m.pb = zh.ack;
      }
      // bounds and team upgrades rarely change: left out while they match both the confirmed and the last sent value
      if (bp && base.bJ === bJ && zh.bJ === bJ) m.B = undefined;
      if (bp && base.tmJ === tmJ && zh.tmJ === tmJ) m.TM = undefined;
      zh.bJ = bJ; zh.tmJ = tmJ; zh.hist.get(q).bJ = bJ; zh.hist.get(q).tmJ = tmJ;
      if (!full && now - (zh.zfAt || 0) > 550) { far = far || packFar(s.Z.map((z) => [z[1], z[2] >> 3, z[3] >> 3])); m.ZFS = far; zh.zfAt = now; }
      this.net.sendSnap(p.pid, m);
    }
  }
  // the guest confirms the newest snapshot it has applied
  snapAck(p, k) { const zh = p.zh; if (!zh || !Number.isInteger(k) || k <= zh.ack || !zh.hist.has(k)) return; zh.ack = k;
    { const h = zh.hist.get(k), rtt = h && h.t ? Math.max(0, performance.now() - h.t - 25) : null; if (rtt != null && rtt < 5000) p.ping = p.ping == null ? rtt : p.ping * 0.8 + rtt * 0.2; } for (const q of [...zh.hist.keys()]) if (q < k) zh.hist.delete(q); }
  // a guest that lost track asks for everything again
  resyncZ(p) { if (p) p.zh = null; }

  sendTo(pid, msg) { if (pid === this.hostPid) this.deliverLocal(msg); else this.net.send(pid, msg); }
  ev(e) { if (this.events.length < 220) this.events.push(e); }

  roster() {
    return {
      t: 'r', ph: this.phase, code: this.net.code || null, host: this.hostPid, succ: this.successor(),
      map: this.mapPick, diff: this.diff, mode: this.mode, pvp: this.pvp, dly: this.daily ? this.daily.cls : '', theme: this.theme, seed: this.seed, max: this.maxP,
      players: [...this.players.values()].map((p) => ({
        pid: p.pid, name: p.name, cls: p.cls, ready: p.ready, color: p.color, inGame: p.inGame || !!p.ghost, away: !!p.ghost,
        eq: p.eq || {}, lvl: p.lvl || 0, acct: p.acct ? 1 : 0, tm: p.tm | 0,
        ct: p.ct || '', vo: p.vo ? 1 : 0, vp: p.vo ? (p.pid === this.hostPid ? (this.net.peer && this.net.peer.id) || null : (this.net.peerIdOf ? this.net.peerIdOf(p.pid) : null)) : null,
      })),
    };
  }
  pushRoster() { this.out(this.roster()); }

  // the host can start once at least 75% of the other players are ready
  readyOk() { const o = [...this.players.values()].filter((p) => p.pid !== this.hostPid && !p.ghost); return !o.length || o.filter((p) => p.ready).length >= Math.ceil(o.length * 0.75); }
  inGame() { return [...this.players.values()].filter((p) => p.inGame); }

  // Who takes over if this host leaves: the connected player who joined first.
  successor() {
    let best = null;
    for (const p of this.players.values()) if (p.pid !== this.hostPid && !p.ghost && (best == null || p.pid < best)) best = p.pid;
    return best;
  }

  addPlayer(pid, name) {
    { const old = this.players.get(pid); if (old) old.zh = null; }
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[pid % PLAYER_COLORS.length];
    const tok = token();
    this.players.set(pid, { pid, name, cls: 'asker', ready: false, color, inGame: false, sp: 0, tok });
    if (this.mode === 'pvp') this.players.get(pid).tm = this.pvpTeamFor(this.players.get(pid));
    this.sendTo(pid, { t: 'w', pid, tok });
    this.pushRoster();
  }

  // A signed-in player's pass (signed by the server): what they own decides their classes and looks in this room.
  async setPass(pid, pass) {
    const info = await checkPass(pass);
    const p = this.players.get(pid);
    if (!p || !info || nkey(info.name) !== nkey(p.name)) return;
    p.own = info.own; p.eq = info.eq; p.lvl = info.lvl; p.acct = info.id; p.ct = info.ct || '';
    const want = info.eq.col && COS[info.eq.col] ? COS[info.eq.col].c : null;
    if (want && ![...this.players.values()].some((q) => q !== p && q.color === want)) p.color = want;
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
          this.net.markPlayer(rj.pid); old.build = m.b | 0;
          if (old.ghost) { old.ghost = false; old.inGame = !!old.wasInGame; if (old.inGame) this.catchUp(old); }
          this.sendTo(rj.pid, { t: 'w', pid: rj.pid, tok: old.tok });
          this.pushRoster();
          return;
        }
      }
      // someone who dropped and comes back with the same name takes their old place; a full room makes room by dropping the oldest dropped player
      // the same name whose old link has gone quiet is almost always that player reloading or reconnecting: they take that
      // place back (keeping their progress) instead of being turned away as a second copy or by a "full" room
      { const nm = nkey(cleanName(m.name, pid)), sid = typeof m.sid === 'string' && /^[a-z0-9]{6,24}$/.test(m.sid) ? m.sid : '';
        // the same browser tab (a reload keeps its id) always takes its place back at once, even before the old link goes quiet
        const same = [...this.players.values()].find((q) => nkey(q.name) === nm && q.pid !== this.hostPid && (q.ghost || (sid && q.sid === sid) || (this.net.silentFor && this.net.silentFor(q.pid) > 4000)));
        if (same && this.net.rebind(pid, same.pid)) {
          this.net.markPlayer(same.pid); same.build = m.b | 0;
          if (same.ghost) { same.ghost = false; same.inGame = !!same.wasInGame; if (same.inGame) this.catchUp(same); }
          this.sendTo(same.pid, { t: 'w', pid: same.pid, tok: same.tok });
          this.pushRoster();
          return;
        }
        if (same) this.removePlayer(same.pid); }
      if ([...this.players.values()].filter((q) => !q.ghost).length >= this.maxP) { this.net.kick(pid, 'full'); return; }
      if (this.players.size >= this.maxP) { const g = [...this.players.values()].filter((q) => q.ghost).sort((a, b) => a.ghostAt - b.ghostAt)[0]; if (g) this.removePlayer(g.pid); }
      this.net.markPlayer(pid);
      this.addPlayer(pid, cleanName(m.name, pid));
      { const np = this.players.get(pid); if (np) np.build = m.b | 0; if (np && typeof m.sid === 'string' && /^[a-z0-9]{6,24}$/.test(m.sid)) np.sid = m.sid; }
      if (typeof m.ps === 'string') this.setPass(pid, m.ps);
      return;
    }
    const isHost = pid === this.hostPid;
    switch (m.t) {
      case 'cls':
        if (!p.inGame && typeof m.c === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, m.c) && ((this.net.code == null && this.mode === 'sandbox') || ownsCls(p.own, m.c)) && !(this.daily && m.c !== this.daily.cls)) {
          p.cls = m.c; this.pushRoster();
        }
        break;
      case 'zr': this.resyncZ(p); break;
      case 'ready':
        if (this.phase === 'lobby') { p.ready = !!m.r; this.pushRoster(); }
        else if ((this.phase === 'combat' || this.phase === 'break') && !p.inGame) { if (this.mode === 'pvp') { if (this.pvp !== 'duel') this.pvpEnter(p); } else this.enter(p); this.pushRoster(); }
        else if (this.phase === 'break' && p.inGame) { p.shopReady = !!m.r; this.checkAllReady(); }
        break;
      case 'in': this.onInput(p, m); break;
      case 'ab': this.onAbility(p, m); break;
      case 'bash': this.onBash(p, m); break;
      case 'buy': this.onBuy(p, m); break;
      case 'use': this.onUse(p, m); break;
      case 'start':
        if (isHost && this.phase === 'lobby' && this.readyOk()) {
          if (this.mode !== 'pvp') this.start();
          else if (this.players.size >= 2 && (this.pvp !== 'duel' || this.players.size === 2)) this.startPvp();
        }
        break;
      case 'team':
        if (this.mode === 'pvp' && this.pvp === 'tdm' && this.phase === 'lobby' && (m.tm === 0 || m.tm === 1)) { p.tm = m.tm; this.pushRoster(); }
        break;
      case 'bye': if (!isHost) { this.removePlayer(pid); this.net.kick(pid, 'left'); } break;
      case 'set':
        if (isHost && this.phase === 'lobby') {
          if (typeof m.map === 'string' && (m.map === 'rastgele' || Object.prototype.hasOwnProperty.call(MAPS, m.map))) this.mapPick = m.map;
          if (typeof m.diff === 'string' && Object.prototype.hasOwnProperty.call(DIFFS, m.diff)) this.diff = m.diff;
          if (typeof m.pv === 'string' && PVP_ORDER.includes(m.pv) && !(m.pv === 'duel' && this.players.size > 2)) {
            this.pvp = m.pv;
            if (this.mode === 'pvp') { for (const q of this.players.values()) q.tm = null; for (const q of this.players.values()) q.tm = this.pvpTeamFor(q); }
          }
          if (m.mode === 'pvp' && !this.net.offline) {
            this.mode = 'pvp'; this.daily = null;
            for (const q of this.players.values()) { if (!ownsCls(q.own, q.cls)) q.cls = 'asker'; q.tm = null; }
            for (const q of this.players.values()) q.tm = this.pvpTeamFor(q);
          } else if (typeof m.mode === 'string' && (MODE_ORDER.includes(m.mode) || (m.mode === 'sandbox' && this.net.code == null))) {
            this.mode = m.mode; this.daily = null;
            // leaving the test area: classes you don't own go back to Asker
            if (m.mode !== 'sandbox') for (const q of this.players.values()) if (!ownsCls(q.own, q.cls)) q.cls = 'asker';
          }
          // the daily challenge is solo only; its map, class and difficulty come from the date
          if (m.mode === 'daily' && this.net.code == null) {
            this.mode = 'daily'; this.daily = dailyRules(); this.mapPick = this.daily.map; this.diff = this.daily.diff;
            for (const q of this.players.values()) q.cls = this.daily.cls;
          }
          if (this.daily && (m.map || m.diff)) { this.mapPick = this.daily.map; this.diff = this.daily.diff; }
          this.pushRoster();
        }
        break;
      case 'chat': this.onChat(p, m); break;
      case 'qm': { // a quick message or a ping: at most 3 in 3 seconds per player
        const k = m.k, now = this.time;
        if (!Number.isInteger(k) || k < 0 || k >= QUICK.length || !p.inGame) break;
        if (now - (p.qmT || 0) > 3) { p.qmT = now; p.qmN = 0; }
        if (p.qmN >= 3) break;
        p.qmN++;
        const B = this.bounds, x = num(m.x) ? Math.max(B.x0, Math.min(B.x1, m.x)) : p.x, y = num(m.y) ? Math.max(B.y0, Math.min(B.y1, m.y)) : p.y;
        this.ev(['qm', p.pid, k, Math.round(x), Math.round(y)]);
        break;
      }
      case 'voice': if (!this.net.offline) { p.vo = !!m.on; this.pushRoster(); } break;
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
    if (Number.isInteger(m.k)) this.snapAck(p, m.k);
    if (!p.inGame) return;
    // inputs travel on the unordered channel: an older one arriving late still counts its hits, but not its position
    const stale = Number.isInteger(m.n) && m.n <= (p.inN || 0);
    if (Number.isInteger(m.n) && !stale) p.inN = m.n;
    if (stale) m = { h: m.h, s: m.s };
    const guest = p.pid !== this.hostPid;
    if (guest && this.phase === 'combat') this.acInput(p, m);
    const B = WORLD.bounds;
    if (p.alive && num(m.x) && num(m.y)) {
      const nx = clamp(m.x, B.x0, B.x1), ny = clamp(m.y, B.y0, B.y1);
      if (!guest || this.moveOk(p, nx, ny)) { p.x = nx; p.y = ny; p.posT = this.time; }
    }
    if (p.alive && num(m.a)) p.a = clamp(m.a, -10, 10);
    if (p.invUntil > this.time && ((Array.isArray(m.h) && m.h.length) || (Array.isArray(m.p) && m.p.length))) { p.invUntil = this.time; this.ev(['iv', p.pid, 0]); }
    if (this.phase === 'combat' && Array.isArray(m.h) && m.h.length <= 80) {
      const C = this.pc(p), cap = guest ? this.hitCap(p) : null;
      for (const h of m.h) {
        if (!Array.isArray(h) || h.length < 2 || h.length > 3) continue;
        const [id, d] = h;
        if (!Number.isInteger(id) || !num(d) || d < 0 || d > 5000) continue;
        const z = this.zIndex.get(id);
        if (!z) continue;
        // a guest's hit can be no bigger than its weapon allows, and only on a zombie its weapon could reach
        if (cap && (z.x - p.x) ** 2 + (z.y - p.y) ** 2 > cap.r2) continue;
        this.onHit(z, cap ? Math.min(d, cap.d) : d, p, C, h[2] === 1 || h[2] === 2, h[2] === 2);
      }
    }
    if (this.mode === 'pvp' && Array.isArray(m.p)) this.pvpHits(p, m.p);
    if (Array.isArray(m.s) && m.s.length <= 16 && this.shots.length < 240) {
      for (const s of m.s) {
        if (Array.isArray(s) && s.length === 3 && s.every(num)) {
          this.shots.push([p.pid, Math.round(clamp(s[0], 0, WORLD_W)), Math.round(clamp(s[1], 0, WORLD_H)), r2(clamp(s[2], -10, 10))]);
        }
      }
    }
  }

  // in-game chat: the owner's word list (from the live settings) is starred out on the host
  clean(text) {
    let o = text;
    for (const w of this.badWords || []) {
      if (typeof w !== 'string' || !w) continue;
      const re = new RegExp('(^|[^\\p{L}])(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^\\p{L}])', 'giu');
      o = o.replace(re, (all, a, x) => a + '*'.repeat(x.length));
    }
    return o;
  }

  onChat(p, m) {
    if (typeof m.m !== 'string') return;
    const now = performance.now();
    if (now - (p.chatAt || 0) < 700) return; // at most one line every 0.7 s per player
    const text = m.m.replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim().slice(0, 100);
    if (!text) return;
    p.chatAt = now;
    this.out({ t: 'c', pid: p.pid, m: this.clean(text) });
    if (this.onChatLog) this.onChatLog(p.name, text);
  }

  // A player's bullet hit a zombie. eff: the hit came from their weapon, so the path's effects apply.
  onHit(z, d, p, C, eff, crit) {
    const now = this.time;
    if (z.ally) return; // a hacked zombie is on our side for now
    if (p.cls === 'kilicci' && p.alive) { const h = Math.min(d, z.hp) * 0.09; if (now - (p.lsT || 0) > 1) { p.lsT = now; p.lsN = 0; } if (p.lsN < 40) { p.lsN += h; p.hp = Math.min(p.maxHp, p.hp + h); } }
    const boss = isBoss(z.t);
    if (z.acidT > now) d *= z.acidK || 1;
    if (eff && p.cls === 'alevci' && !(C.fx.burn)) this.ignite(z, C.dps * 0.15, 2, p.pid, false, false);
    if (eff && p.cls === 'kimyager' && !C.fx.poison) { const v = C.dps * 0.18; z.psD = z.psT > now ? Math.max(z.psD, v) : v; z.psT = now + 3; z.psO = p.pid; }
    if (this.chem && z.psT > now) d *= 1.2;
    if (z.t === 11 && z.armor > 0 && !(C.fx.pierce || C.fx.noShield || C.fx.blast || C.fx.acid || C.fx.burn || p.cls === 'nisanci' || p.cls === 'alevci' || p.cls === 'bombaci')) {
      z.armor -= d; d *= 0.4;
      if (z.armor <= 0) this.ev(['ab2', Math.round(z.x), Math.round(z.y)]);
    }
    if (eff && p.cls === 'tesla' && now >= (p.zapAt2 || 0)) { p.zapAt2 = now + 0.25; this.zap(z, p, { chain: 2 + Math.min(3, p.wt | 0), chainK: 0.55 }, C); }
    if (eff && p.cls === 'avci' && !boss && !(z.pinImm > now)) { z.stunT = Math.max(z.stunT || 0, z.t === 2 ? 0.06 : 0.2); z.pinImm = now + 0.5; if ((p.lv.ab | 0) >= 3) { z.slowUntil = now + 1.5; z.slowK = Math.min(z.slowK || 1, 0.6); } }
    if (this.leaders && this.leaders.length && this.leaders.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 220)) d *= 1.1;
    if (!eff || !C.fx.k) { this.damage(z, d, p); return; }
    const f = C.fx, mh = z.mhp || (z.mhp = Math.max(1, z.hp)), dist = Math.hypot(z.x - p.x, z.y - p.y);
    // ---- damage changes that depend on the situation ----
    if (f.close && dist < f.close[0]) {
      d *= f.close[1];
      if (f.closeStun && !boss && !(z.stunImm > now)) { z.stunT = Math.max(z.stunT || 0, f.closeStun); z.stunImm = now + 0.7; }
      if (f.leechClose) this.leech(p, d * f.leechClose, f);
    }
    if (f.exec && !boss && z.hp / mh < f.exec[0]) { d *= f.exec[1]; if (f.execKill && z.hp / mh < f.execKill) d = Math.max(d, z.hp + 1); }
    if (f.rage) d *= f.rageCap && p.hp < p.maxHp * 0.5 ? f.rageCap : 1 + f.rage * (1 - p.hp / p.maxHp);
    if (f.hasteDmg && p.hasteUntil > now) d *= f.hasteDmg;
    if (f.armorK && (z.t === 11 || z.t === 6 || z.el === 4)) d *= f.armorK;
    if (f.nearAlly) { let n = 0; for (const q of this.inGame()) if (q !== p && q.alive && this.ally(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < f.nearAlly[0]) n++; if (n) d *= f.nearAlly[1] + (f.nearAllyEach ? f.nearAllyEach * (n - 1) : 0); }
    if (f.nearDog && this.turrets.some((t) => t.k === 5 && t.owner === p.pid && Math.hypot(t.x - p.x, t.y - p.y) < f.nearDog[0])) d *= f.nearDog[1];
    if (f.stack) {
      if (p.stkZ === z.id) p.stkN = Math.min(f.stack[1], (p.stkN | 0) + 1); else { p.stkZ = z.id; p.stkN = f.stackKeep ? Math.max(0, (p.stkN | 0) - 2) : 0; }
      d *= 1 + (p.stkN | 0) * f.stack[0];
      if (p.stkN >= f.stack[1] && (f.stackStun || f.stackBolt || f.stackBoom)) {
        p.stkN = f.stackKeep ? Math.floor(f.stack[1] / 2) : 0;
        if (f.stackStun && !boss) z.stunT = Math.max(z.stunT || 0, f.stackStun);
        if (f.stackBolt) { d += C.dps * 0.25 * f.stackBolt; this.ev(['lb', Math.round(z.x), Math.round(z.y), 50]); }
        if (f.stackBoom) { for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < f.stackBoom + ZTYPES[o.t].r) this.damage(o, d * 0.5, p); this.ev(['bx', Math.round(z.x), Math.round(z.y), f.stackBoom]); }
      }
    }
    // ---- marks, acid and crit reactions ----
    if (f.mark) this.markAt(z, f.mark[0], f.mark[1], f.markR || 0, f);
    if (crit && f.critMark) this.markAt(z, f.critMark, 3, 0, f);
    if (f.acidHit) { z.acidT = now + f.acidHit[1]; z.acidK = Math.max(z.acidT > now && z.acidK ? z.acidK : 1, f.acidHit[0]); }
    if (crit && f.critCdr) p.abAt = Math.max(now, p.abAt - f.critCdr);
    if (crit && f.critStun && !boss) z.stunT = Math.max(z.stunT || 0, f.critStun);
    if (crit && f.critGoldK && Math.random() < 0.5) p.gold += 1;
    if (f.cdr) p.abAt = Math.max(now, p.abAt - f.cdr);
    if (f.leech) this.leech(p, Math.min(d, z.hp) * f.leech, f);
    if (f.virus) z.virus = { o: p.pid, r: f.virus[0], k: f.virus[1], n: f.virusN || 1, b: f.virusBoom || 0, s: f.slow ? 1 : 0, g: 0, dps: C.dps };
    if (f.bleed) { const v = C.dps * f.bleed; z.blD = z.blT > now ? Math.max(z.blD, v) : v; z.blT = now + 3; z.blO = p.pid; }
    if (f.pull && (!boss || f.pullBig) && !(z.t === 2 && !f.pullBig) && !(z.stunImm > now && z.kvx)) {
      const dx = p.x - z.x, dy = p.y - z.y, dl = Math.hypot(dx, dy) || 1, k = Math.min(1, dl / 120);
      z.kvx = (dx / dl) * f.pull * k; z.kvy = (dy / dl) * f.pull * k;
    }
    if (f.puddle && now >= (p.pudAt || 0)) { p.pudAt = now + 0.6; this.addZone(0, z.x, z.y, f.puddle[0], f.puddle[1], C.dps * (f.puddleK || 0.3), p.pid, !!f.puddleSlow); }
    if (f.tar && now >= (p.pudAt || 0)) { p.pudAt = now + 0.6; this.addZone(2, z.x, z.y, f.tar[0], f.tar[1], C.dps * 0.15, p.pid, true); }
    if (f.cloud && now >= (p.pudAt || 0)) { p.pudAt = now + 0.5; this.addZone(0, z.x, z.y, f.cloud[0], f.cloud[1], C.dps * 0.35, p.pid); }
    if (f.big && (z.t === 2 || boss)) d *= f.big;
    if (f.brittle && z.slowUntil > now) d *= f.brittle;
    if (f.dazed && z.stunT > 0) d *= f.dazed;
    if (f.slow) {
      z.slowUntil = now + (boss ? f.slow * 0.5 : f.slow);
      z.slowK = Math.min(z.slowUntil > now && z.slowK ? z.slowK : 1, f.slowK);
      if (f.shatter) z.shatO = p.pid;
      if (f.freeze && !boss && !(z.stunImm > now) && Math.random() < f.freeze) {
        z.stunT = Math.max(z.stunT || 0, 1.2); z.frozenT = now + 1.2; z.stunImm = now + 2.5;
      }
    }
    if (f.sleep && !boss && !(z.stunImm > now) && Math.random() < f.sleep) { z.stunT = Math.max(z.stunT || 0, 1.2); z.stunImm = now + 2.5; }
    if (f.stun && !f.kb && !boss && !(z.stunImm > now)) { z.stunT = Math.max(z.stunT || 0, f.stun); z.stunImm = now + 0.7; }
    if (f.kb && !boss) {
      const dx = z.x - p.x, dy = z.y - p.y, dl = Math.hypot(dx, dy) || 1, k = z.t === 2 ? 0.5 : 1;
      if (!(z.stunImm > now)) {
        z.kvx = (dx / dl) * f.kb * k; z.kvy = (dy / dl) * f.kb * k;
        if (f.stun) z.stunT = Math.max(z.stunT || 0, f.stun);
        if (f.cap) z.stunImm = now + 1.1;
        if (z.st === ZS.WINDUP || z.st === ZS.SPIT || z.st === ZS.SUMMON) { z.st = ZS.NORMAL; z.cd = Math.max(z.cd, 1); }
      }
    }
    if (f.poison) {
      const v = C.dps * f.poison;
      z.psD = z.psT > now ? Math.max(z.psD, v) : v;
      z.psT = now + f.pdur; z.psO = p.pid; z.psS = f.spread || 0; z.psG = !!f.gas;
      if (f.acid) { z.acidT = z.psT; z.acidK = f.acid; }
      if (f.melt) z.meltT = z.psT;
    }
    if (f.burn) this.ignite(z, C.dps * f.burn, f.bdur, p.pid, !!f.napalm, !!f.boomOnDeath);
    if (f.patch && now >= (p.patchAt || 0)) { p.patchAt = now + (f.patchT || 0.7); this.addZone(1, z.x, z.y, f.patchR || 55, 3, C.dps * (f.patchK || 0.45), p.pid, !!f.patchSlow); }
    if (f.chain && now >= (p.zapAt || 0)) { p.zapAt = now + 0.3; this.zap(z, p, f, C); }
    if (f.bolt && now >= (p.boltAt || 0)) {
      p.boltAt = now + f.bolt;
      const R = 95;
      this.ev(['lb', Math.round(z.x), Math.round(z.y), R]);
      for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < R + ZTYPES[o.t].r) this.damage(o, C.dps * 0.6, p);
      d += C.dps * 1.2;
    }
    if (f.blast) {
      const R = f.blast, x = z.x, y = z.y;
      for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - x, o.y - y) < R + ZTYPES[o.t].r) {
        this.damage(o, d * (f.blastK || 0.35), p);
        if (f.stunAoe && f.stun && !isBoss(o.t) && !(o.stunImm > now)) { o.stunT = Math.max(o.stunT || 0, f.stun); o.stunImm = now + 0.7; }
      }
      if (now >= (p.blastFx || 0)) { p.blastFx = now + 0.12; this.ev(['bx', Math.round(x), Math.round(y), R]); }
    }
    const was = z.dead;
    this.bulletHit = true; this.damage(z, d, p); this.bulletHit = false;
    if (!was && z.dead) this.killFx(z, p, f, C, d);
  }

  // ---- path effects that need more than one line ----
  // mark a zombie (and, with a radius, the zombies around it): it takes more damage from everyone
  markAt(z, k, dur, r, f) {
    const now = this.time;
    const one = (o) => { o.markT = now + dur; o.markK = Math.max(o.markT > now && o.markK ? o.markK : 1, k); if (f.markTur) o.markTur = f.markTur; if (f.markDog) o.markDog = f.markDog; if (f.slow && f.mark) { o.slowUntil = Math.max(o.slowUntil || 0, now + 0.6); o.slowK = Math.min(o.slowK || 1, f.slowK || 0.7); } };
    one(z);
    if (r) for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < r) one(o);
  }
  // heal from damage dealt (at most 30 a second); with leechAll the extra goes to teammates close by, guard gives a short damage cut
  leech(p, v, f) {
    const now = this.time;
    if (!p.alive || !(v > 0)) return;
    if (now - (p.lcT || 0) > 1) { p.lcT = now; p.lcN = 0; }
    v = Math.min(v, 30 - (p.lcN || 0)); if (v <= 0) return;
    p.lcN += v;
    const room = p.maxHp - p.hp;
    p.hp = Math.min(p.maxHp, p.hp + v);
    if (f.guard) p.guardUntil = now + f.guard;
    // Vampir: with health already full, what the blade drinks becomes a blood shield (up to a share of max health)
    if (f.bshield && v > room) { p.bs = Math.min(p.maxHp * f.bshield, (p.bs || 0) + (v - room)); p.bsAt = now; }
    if (f.leechAll && v > room) for (const q of this.inGame()) if (q !== p && q.alive && this.ally(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < 150) q.hp = Math.min(q.maxHp, q.hp + (v - room) * f.leechAll);
  }
  // what a path does when its hit kills
  killFx(z, p, f, C, d) {
    const now = this.time, boss = isBoss(z.t);
    if (f.haste) p.hasteUntil = Math.max(p.hasteUntil || 0, now + f.haste);
    if (f.goldK) p.gold += Math.max(1, Math.round(ZTYPES[z.t].gold * DIFFS[this.diff].gold * f.goldK * (f.goldBig && (z.el || z.t === 2 || boss) ? f.goldBig : 1)));
    if (f.killCdr) p.abAt = Math.max(now, p.abAt - f.killCdr);
    if (f.killHeal && p.alive) p.hp = Math.min(p.maxHp, p.hp + f.killHeal);
    if (f.killInv && p.cls === 'ajan' && !(p.invUntil > now)) { p.invUntil = now + f.killInv; this.ev(['iv', p.pid, 1]); }
    if (f.burst) { const R = f.burst[0]; for (const o of this.zombies) if (!o.dead && Math.hypot(o.x - z.x, o.y - z.y) < R + ZTYPES[o.t].r) this.damage(o, Math.max(C.dps * 0.3, d) * f.burst[1], p); this.ev(['bx', Math.round(z.x), Math.round(z.y), R]); }
    if (f.healAll) for (const q of this.inGame()) if (q.alive && this.ally(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < f.healAll[0]) q.hp = Math.min(q.maxHp, q.hp + f.healAll[1]);
    if (f.teamHaste && (z.markT > now || !f.mark)) for (const q of this.inGame()) if (q.alive && this.ally(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < 420) { q.hasteUntil = Math.max(q.hasteUntil || 0, now + f.teamHaste); if (f.teamPower) q.powerUntil = Math.max(q.powerUntil || 0, now + 1); }
  }

  ignite(z, v, dur, pid, napalm, boom) {
    const now = this.time;
    z.brD = z.brT > now ? Math.max(z.brD, v) : v;
    z.brT = now + dur; z.brO = pid; z.brN = napalm; z.brB = boom;
  }

  // Lightning jumps from the hit zombie to the nearest others in turn.
  zap(z0, p, f, C) {
    const hit = new Set([z0.id]);
    const pts = [Math.round(z0.x), Math.round(z0.y)];
    const dmg = C.dps * f.chainK * Math.max(0.3, 1 / Math.max(0.1, C.st.rate));
    let cur = z0;
    for (let j = 0; j < f.chain; j++) {
      let best = null, bd = 170 * 170;
      for (const o of this.zombies) {
        if (o.dead || hit.has(o.id)) continue;
        const dd = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2;
        if (dd < bd) { bd = dd; best = o; }
      }
      if (!best) break;
      hit.add(best.id);
      pts.push(Math.round(best.x), Math.round(best.y));
      if (f.chainStun && !isBoss(best.t) && !(best.stunImm > this.time)) { best.stunT = Math.max(best.stunT || 0, f.chainStun); best.stunImm = this.time + 1.5; }
      this.damage(best, dmg, p);
      cur = best;
    }
    if (pts.length > 2) this.ev(['zp', p.pid, ...pts]);
  }

  addZone(k, x, y, r, life, dps, owner, slow) {
    const mine = this.zones.filter((q) => q.owner === owner);
    if (mine.length >= 8) this.zones.splice(this.zones.indexOf(mine[0]), 1);
    if (this.zones.length >= 30) this.zones.shift();
    this.zones.push({ id: this.nextId++, k, x: Math.round(x), y: Math.round(y), r, life, max: life, dps, owner, slow: !!slow });
  }

  // Poison, fire and the zones on the ground.
  updateDots(dt) {
    const now = this.time;
    for (const z of this.zombies) {
      if (z.dead) continue;
      if (z.psT > now) this.damage(z, z.psD * dt * (isBoss(z.t) && !(z.meltT > now) ? 0.5 : 1), this.players.get(z.psO) || null);
      if (z.dead) continue;
      if (z.blT > now) { this.damage(z, z.blD * dt * (isBoss(z.t) ? 0.6 : 1), this.players.get(z.blO) || null); if (z.dead) continue; }
      if (z.brT > now) {
        this.damage(z, z.brD * dt * (isBoss(z.t) ? 0.6 : 1), this.players.get(z.brO) || null);
        if (z.brN && !z.dead && now >= (z.brSp || 0)) {
          z.brSp = now + 0.5;
          const rz = ZTYPES[z.t].r;
          let n = 0;
          for (const o of this.zombies) {
            if (o === z || o.dead || o.brT > now) continue;
            if (Math.hypot(o.x - z.x, o.y - z.y) < rz + ZTYPES[o.t].r + 10) { this.ignite(o, z.brD * 0.5, 3, z.brO, true, z.brB); if (++n >= 2) break; }
          }
        }
      }
    }
    for (const q of this.zones) {
      q.life -= dt;
      const owner = this.players.get(q.owner) || null;
      for (const z of this.zombies) {
        if (z.dead || Math.hypot(z.x - q.x, z.y - q.y) >= q.r + ZTYPES[z.t].r * 0.5) continue;
        if (q.slow) { z.slowUntil = Math.max(z.slowUntil || 0, now + 0.3); z.slowK = Math.min(z.slowUntil > now && z.slowK ? z.slowK : 1, 0.55); }
        this.damage(z, q.dps * dt, owner);
      }
      if (owner && this.mode === 'pvp') for (const f of this.foesOf(owner)) if (Math.hypot(f.x - q.x, f.y - q.y) < q.r) { this.pvpDamage(owner, f, q.dps * dt, 5); if (q.slow) f.chillUntil = Math.max(f.chillUntil || 0, now + 0.3); }
    }
    this.zones = this.zones.filter((q) => q.life > 0);
  }

  // What happens when a zombie dies with an effect on it.
  deathFx(z, p) {
    const now = this.time;
    if (z.virus && z.virus.g < 3) {
      const V = z.virus, owner = this.players.get(V.o) || null;
      const near = this.zombies.filter((o) => !o.dead && o !== z && !o.ally && Math.hypot(o.x - z.x, o.y - z.y) < V.r).sort((a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y)).slice(0, V.n);
      for (const o of near) {
        if (!isBoss(o.t)) { o.stunT = Math.max(o.stunT || 0, V.k); if (V.s) { o.slowUntil = now + 1.5; o.slowK = Math.min(o.slowK || 1, 0.7); } }
        if (V.b) this.damage(o, V.dps * V.b, owner);
        if (!o.dead) o.virus = { ...V, g: V.g + 1 };
      }
      if (near.length) this.ev(['vr2', Math.round(z.x), Math.round(z.y), V.r]);
    }
    if (z.psT > now && (z.psS || z.psG)) {
      const owner = this.players.get(z.psO) || null;
      if (z.psG) this.addZone(0, z.x, z.y, 85, 4, z.psD * 0.6, z.psO);
      if (z.psS) {
        const near = this.zombies.filter((o) => !o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 140)
          .sort((a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y)).slice(0, z.psS);
        for (const o of near) { o.psD = Math.max(o.psT > now ? o.psD : 0, z.psD * 0.85); o.psT = now + 4; o.psO = z.psO; o.psS = z.psS; o.psG = z.psG; }
        if (near.length) this.ev(['ps', Math.round(z.x), Math.round(z.y)]);
      }
      void owner;
    }
    if (z.brT > now && z.brB) {
      const owner = this.players.get(z.brO) || null;
      const R = 70;
      this.ev(['bb', Math.round(z.x), Math.round(z.y), R]);
      for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < R + ZTYPES[o.t].r) { this.damage(o, z.brD * 1.2, owner); if (!o.dead) this.ignite(o, z.brD * 0.6, 3, z.brO, true, true); }
    }
    if (z.shatO != null && z.slowUntil > now) {
      const owner = this.players.get(z.shatO) || null;
      if (owner) {
        const C = this.pc(owner), R = 85;
        this.ev(['ic', Math.round(z.x), Math.round(z.y), R]);
        for (const o of this.zombies) {
          if (o.dead || o === z || Math.hypot(o.x - z.x, o.y - z.y) >= R + ZTYPES[o.t].r) continue;
          o.slowUntil = now + 2.5; o.slowK = Math.min(o.slowK || 1, 0.5);
          this.damage(o, C.dps * 0.4, owner);
        }
      }
    }
    void p;
  }

  // ---------- one-use items ----------
  onUse(p, m) {
    if (!p.inGame || !p.alive || this.phase !== 'combat' || !Number.isInteger(m.i) || m.i < 0 || m.i >= GEAR.length) return;
    if (!p.inv || !(p.inv[m.i] > 0) || this.time < (p.useAt || 0)) return;
    const k = GEAR[m.i].k;
    let tx = num(m.x) ? m.x : p.x + Math.cos(p.a) * 200, ty = num(m.y) ? m.y : p.y + Math.sin(p.a) * 200;
    const R = GEAR_RANGE[m.i];
    if (R) {
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d > R) { tx = p.x + ((tx - p.x) / d) * R; ty = p.y + ((ty - p.y) / d) * R; }
      const B = WORLD.bounds;
      tx = clamp(tx, B.x0, B.x1); ty = clamp(ty, B.y0, B.y1);
    }
    p.useAt = this.time + 0.4;
    p.inv[m.i]--;
    const w = this.wave;
    const bk = p.cls === 'bombaci' ? 1.3 : 1;
    if (k === 'nade') {
      const delay = 0.25 + Math.hypot(tx - p.x, ty - p.y) / 700;
      this.bombs.push({ x: tx, y: ty, t: delay, dmg: (90 + w * 8) * bk, r: 110, owner: p.pid });
      this.ev(['gn', Math.round(p.x), Math.round(p.y), Math.round(tx), Math.round(ty), r2(delay)]);
    } else if (k === 'air') {
      this.ev(['as', Math.round(tx), Math.round(ty), 3]);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 130;
        this.bombs.push({ x: tx + Math.cos(a) * rr, y: ty + Math.sin(a) * rr, t: 3 + i * 0.14, dmg: (140 + w * 12) * bk, r: 95, owner: p.pid });
      }
    } else if (k === 'med') {
      p.hp = Math.min(p.maxHp, p.hp + 60);
      for (const q of this.inGame()) {
        if (q.alive || Math.hypot(q.x - p.x, q.y - p.y) > 90) continue;
        q.alive = true; q.hp = Math.ceil(q.maxHp * 0.4); q.rev = 0; p.revives++; this.ev(['up', q.pid]);
      }
      this.ev(['md', Math.round(p.x), Math.round(p.y)]);
    } else if (k === 'wall') {
      const B = WORLD.bounds;
      const x = clamp(p.x + Math.cos(p.a) * 58, B.x0 + 30, B.x1 - 30), y = clamp(p.y + Math.sin(p.a) * 58, B.y0 + 30, B.y1 - 30);
      const mine = this.walls.filter((q) => q.owner === p.pid);
      if (mine.length >= 2) this.walls.splice(this.walls.indexOf(mine[0]), 1);
      if (this.walls.length >= 12) this.walls.shift();
      const hp = (300 + w * 25) * (p.cls === 'tamirci' ? 2 : 1);
      this.walls.push({ id: this.nextId++, x: Math.round(x), y: Math.round(y), a: r2(p.a + Math.PI / 2), hp, max: hp, owner: p.pid, life: 60 });
      this.ev(['wl', Math.round(x), Math.round(y)]);
    }
  }

  updateBombs(dt) {
    for (const b of this.bombs) {
      b.t -= dt;
      if (b.t > 0) continue;
      const owner = this.players.get(b.owner) || null;
      for (const z of this.zombies) if (!z.dead && Math.hypot(z.x - b.x, z.y - b.y) < b.r + ZTYPES[z.t].r) this.damage(z, b.dmg, owner);
      for (const q of this.walls) if (Math.hypot(q.x - b.x, q.y - b.y) < b.r) q.hp -= b.dmg * 0.25;
      this.pvpArea(owner, b.x, b.y, b.r, b.dmg, 0);
      this.ev(['x', Math.round(b.x), Math.round(b.y), b.r]);
    }
    this.bombs = this.bombs.filter((b) => b.t > 0);
  }

  // Sandbag walls: zombies can't walk through, so they claw at them instead.
  wallPush(z, T, dt) {
    const W = 48, H = 11;
    for (const q of this.walls) {
      const c = Math.cos(q.a), s = Math.sin(q.a);
      const ex = z.x - q.x, ey = z.y - q.y;
      const lx = ex * c + ey * s, ly = -ex * s + ey * c;
      if (Math.abs(lx) > W + T.r || Math.abs(ly) > H + T.r) continue;
      const cx = clamp(lx, -W, W), cy = clamp(ly, -H, H);
      let nx = lx - cx, ny = ly - cy, d = Math.hypot(nx, ny);
      if (d >= T.r) continue;
      if (d < 0.01) { // centre inside the wall: push out the short way
        const ox = W + T.r - Math.abs(lx), oy = H + T.r - Math.abs(ly);
        if (ox < oy) { nx = (Math.sign(lx) || 1) * ox; ny = 0; } else { nx = 0; ny = (Math.sign(ly) || 1) * oy; }
        z.x += nx * c - ny * s; z.y += nx * s + ny * c;
      } else {
        const push = T.r - d;
        nx /= d; ny /= d;
        z.x += (nx * c - ny * s) * push; z.y += (nx * s + ny * c) * push;
      }
      if (T.dps > 0 && z.st !== ZS.DASH) q.hp -= T.dps * dt * 1.2;
      else if (z.st === ZS.DASH) { q.hp -= 60; z.st = ZS.NORMAL; z.cd = Math.max(z.cd, 2); }
    }
  }

  // turrets and Tesla coils stand in the way: zombies that reach one push against it and claw it down (slowly)
  turretPush(z, T, dt) {
    for (const t of this.turrets) {
      if (!(t.k == null || t.k === 0 || t.k === 4) || t.hp == null) continue;
      const R = 17 + T.r, dx = z.x - t.x, dy = z.y - t.y, d = Math.hypot(dx, dy);
      if (d >= R) continue;
      if (d > 0.01) { z.x = t.x + dx / d * R; z.y = t.y + dy / d * R; }
      if (z.st === ZS.DASH) { t.hp -= 120; z.st = ZS.NORMAL; z.cd = Math.max(z.cd, 2); }
      else if (T.dps > 0) t.hp -= T.dps * dt * 0.5 * (isBoss(z.t) ? 1.5 : 1);
    }
  }

  updateWalls(dt) {
    for (const q of this.walls) {
      q.life -= dt;
      if (q.hp <= 0 || q.life <= 0) { q.gone = true; this.ev(['wb', q.x, q.y, r2(q.a)]); }
    }
    this.walls = this.walls.filter((q) => !q.gone);
  }

  onAbility(p, m) {
    if (!p.inGame || !p.alive || (this.phase !== 'combat' && this.phase !== 'break')) return;
    if (this.time < p.abAt || p.silUntil > this.time) return;
    const c = CLASSES[p.cls];
    const dmgMul = (1 + 0.15 * p.lv.dmg) * (1 + 0.08 * (this.team[1] | 0));
    const L = p.lv.ab | 0, L2 = Math.min(2, L);
    const dur = abDur(p.cls, L);
    p.abAt = this.time + c.ab.cd * stats(p.cls, p.lv).cd;
    p.abUntil = this.time + dur;
    this.ev(['ab', p.pid, dur]);
    if (p.cls === 'doktor') {
      const r = c.ab.r + 30 * L2;
      for (const q of this.inGame()) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > r || !this.ally(p, q) || (!q.alive && this.mode === 'pvp')) continue;
        if (q.alive) q.hp = Math.min(q.maxHp, q.hp + c.ab.heal + 15 * L2);
        else { q.alive = true; q.hp = Math.ceil(q.maxHp * 0.4); p.revives++; this.ev(['up', q.pid]); }
        if (L >= 3) q.shieldUntil = Math.max(q.shieldUntil || 0, this.time + 3);
      }
      this.ev(['h', Math.round(p.x), Math.round(p.y), r]);
    } else if (p.cls === 'tamirci') {
      let x = num(m.x) ? m.x : p.x, y = num(m.y) ? m.y : p.y;
      if (Math.hypot(x - p.x, y - p.y) > 120 || pointInObstacle(x, y, 14)) { x = p.x; y = p.y; }
      const mine = this.turrets.filter((t) => t.owner === p.pid);
      if (mine.length >= (L >= 3 ? 2 : 1)) this.turrets.splice(this.turrets.indexOf(mine[0]), 1);
      const B = WORLD.bounds;
      this.turrets.push({ id: this.nextId++, owner: p.pid, x: clamp(x, B.x0 + 20, B.x1 - 20), y: clamp(y, B.y0 + 20, B.y1 - 20), a: p.a, life: c.ab.dur, cd: 0, dk: L >= 1 ? 1.4 : 1, rt: L >= 2 ? c.ab.rate / 2 : c.ab.rate, hp: 900, mhp: 900 });
    } else if (p.cls === 'muhendis') {
      this.turrets = this.turrets.filter((t) => !(t.owner === p.pid && t.k === 2));
      this.turrets.push({ id: this.nextId++, k: 2, owner: p.pid, x: p.x, y: p.y, a: 0, life: dur, cd: 0 });
    } else if (p.cls === 'kimyager') {
      let x = num(m.x) ? m.x : p.x, y = num(m.y) ? m.y : p.y;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d > 60) { const k = Math.min(1, 380 / d); x = p.x + (x - p.x) / d * Math.max(200, d * k); y = p.y + (y - p.y) / d * Math.max(200, d * k); } // thrown ahead, up to 380 px
      else { x = p.x + Math.cos(p.a) * 220; y = p.y + Math.sin(p.a) * 220; }
      const C = this.pc(p);
      this.addZone(0, x, y, c.ab.r + (L >= 1 ? 30 : 0), dur, Math.max(18, C.dps * (L >= 3 ? 1.1 : 0.65)), p.pid, L >= 2);
      this.ev(['gn', p.pid, Math.round(p.x), Math.round(p.y), Math.round(x), Math.round(y)]);
    } else if (p.cls === 'komutan') {
      const r = c.ab.r, g = Math.round((20 + 3 * this.wave) * (L >= 1 ? 1.5 : 1));
      for (const q of this.inGame()) {
        if (Math.hypot(q.x - p.x, q.y - p.y) > r || !this.ally(p, q) || (!q.alive && this.mode === 'pvp')) continue;
        if (q.alive) { q.hp = Math.min(q.maxHp, q.hp + c.ab.heal + (L >= 1 ? 15 : 0)); q.powerUntil = Math.max(q.powerUntil || 0, this.time + dur); q.gold += g; }
        else if (L >= 3) { q.alive = true; q.hp = Math.ceil(q.maxHp * 0.4); p.revives++; this.ev(['up', q.pid]); }
      }
      this.turrets.push({ id: this.nextId++, k: 3, owner: p.pid, x: Math.round(p.x + Math.cos(p.a) * 30), y: Math.round(p.y + Math.sin(p.a) * 30), a: p.a, life: 6, cd: 0 });
      this.ev(['h', Math.round(p.x), Math.round(p.y), r]);
    } else if (p.cls === 'kalkanci') {
      p.shieldUntil = this.time + dur;
      if (L >= 3) {
        const R = 150;
        for (const z of this.zombies) {
          if (z.dead || isBoss(z.t)) continue;
          const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
          if (d > R + ZTYPES[z.t].r) continue;
          const k = z.t === 2 ? 0.5 : 1;
          z.kvx = (dx / (d || 1)) * 520 * k; z.kvy = (dy / (d || 1)) * 520 * k; z.stunT = Math.max(z.stunT || 0, 0.8);
          if (z.st !== ZS.FUSE) z.st = ZS.NORMAL;
        }
        for (const q of this.foesOf(p)) if (Math.hypot(q.x - p.x, q.y - p.y) < R + PLAYER_R) this.knock(q, p.x, p.y, 520);
        this.ev(['sw', Math.round(p.x), Math.round(p.y), R]);
      }
    } else if (p.cls === 'alevci') {
      const r = c.ab.r + 25 * L2, dm = c.ab.dmg * dmgMul * (1 + 0.3 * L2);
      for (const z of this.zombies) {
        if (z.dead || Math.hypot(z.x - p.x, z.y - p.y) >= r + ZTYPES[z.t].r) continue;
        this.damage(z, dm, p);
        if (L >= 3 && !z.dead) this.ignite(z, dm * 0.25, 4, p.pid, false, false);
      }
      this.pvpArea(p, p.x, p.y, r, dm, 7);
      this.ev(['fb', Math.round(p.x), Math.round(p.y), r]);
    } else if (p.cls === 'tesla') {
      let x = num(m.x) ? m.x : p.x, y = num(m.y) ? m.y : p.y;
      if (Math.hypot(x - p.x, y - p.y) > 120 || pointInObstacle(x, y, 14)) { x = p.x; y = p.y; }
      this.turrets = this.turrets.filter((t) => !(t.owner === p.pid && t.k === 4));
      const B = WORLD.bounds;
      this.turrets.push({ id: this.nextId++, k: 4, owner: p.pid, x: clamp(x, B.x0 + 20, B.x1 - 20), y: clamp(y, B.y0 + 20, B.y1 - 20), a: 0, life: dur, cd: 0, L, hp: 700, mhp: 700 });
    } else if (p.cls === 'avci') {
      // a fan of piercing bolts: everything on each line takes the hit
      const n = c.ab.n + (L >= 1 ? 3 : 0), R = c.ab.range, dm = c.ab.dmg * dmgMul * (L >= 2 ? 1.4 : 1), spread = 0.9;
      const hit = new Map();
      for (let i = 0; i < n; i++) {
        const a = p.a - spread / 2 + spread * (i / (n - 1)), cx = Math.cos(a), cy = Math.sin(a);
        for (const z of this.zombies) {
          if (z.dead) continue;
          const dx = z.x - p.x, dy = z.y - p.y, along = dx * cx + dy * cy;
          if (along < 0 || along > R) continue;
          if (Math.abs(dx * cy - dy * cx) < ZTYPES[z.t].r + 6) hit.set(z, (hit.get(z) || 0) + 1);
        }
      }
      for (const [z, k] of hit) {
        if (z.dead) continue;
        this.damage(z, dm * Math.min(3, k), p);
        if (!z.dead && !isBoss(z.t)) { z.stunT = Math.max(z.stunT || 0, 0.5); if (L >= 3) { z.slowUntil = this.time + 2.5; z.slowK = 0.5; } }
      }
      for (const q of this.foesOf(p)) {
        let k = 0;
        for (let i = 0; i < n; i++) { const a = p.a - spread / 2 + spread * (i / (n - 1)), cx = Math.cos(a), cy = Math.sin(a), dx = q.x - p.x, dy = q.y - p.y, along = dx * cx + dy * cy; if (along >= 0 && along <= R && Math.abs(dx * cy - dy * cx) < PLAYER_R + 6) k++; }
        if (k) this.pvpDamage(p, q, dm * Math.min(2, k), 3);
      }
      this.ev(['fan', Math.round(p.x), Math.round(p.y), r2(p.a), n, R]);
    } else if (p.cls === 'bombaci') {
      const mine = this.mines.filter((x) => x.owner === p.pid);
      if (mine.length >= c.ab.max + (L >= 1 ? 1 : 0)) this.mines.splice(this.mines.indexOf(mine[0]), 1);
      this.mines.push({ id: this.nextId++, owner: p.pid, x: p.x, y: p.y, arm: 0.6, life: 120, k: L >= 2 ? 1.3 : 1, rk: L >= 2 ? 20 : 0, cl: L >= 3 });
    } else if (p.cls === 'kilicci') {
      p.spinUntil = this.time + dur; p.spinAt = 0; p.spinL = L;
    } else if (p.cls === 'egitmen') {
      // the dog(s) run to the nearest target around where the player aims and hold it
      const ax = num(m.x) ? m.x : p.x + Math.cos(p.a) * 250, ay = num(m.y) ? m.y : p.y + Math.sin(p.a) * 250;
      for (const t of this.turrets) if (t.k === 5 && t.owner === p.pid) { t.atkUntil = this.time + dur; t.tg = this.nearTarget(p, ax, ay, 420); t.lunge = 0.35; }
    } else if (p.cls === 'ajan') {
      p.invUntil = this.time + dur; p.invFirst = 1;
      this.ev(['iv', p.pid, 1]);
    } else if (p.cls === 'hacker') {
      const n = c.ab.n + (L >= 1 ? 1 : 0), R = c.ab.r, cone = 0.55, now = this.time;
      const cand = [];
      for (const z of this.zombies) {
        if (z.dead || isBoss(z.t) || z.ally || z.st === ZS.BURROW) continue; // a burrowed Kazıcı can't be reached
        const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
        let da = Math.atan2(dy, dx) - p.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        if (d < R && Math.abs(da) < cone) cand.push([d, z]);
        else if (d < R * 0.55) cand.push([d + R, z]); // right next to you but outside the aim cone: taken after the ones you aimed at
      }
      cand.sort((a, b) => a[0] - b[0]);
      let took = 0;
      for (const [, z] of cand.slice(0, n)) {
        z.ally = p.pid; z.allyUntil = now + dur; z.allyK = L >= 2 ? 2 : 1; z.allyB = L >= 3 ? 1.5 : 1; z.tg = null; took++;
        // whatever it was in the middle of (a charge, a jump, a spit, a scream, a fuse...) stops here, so it never stays frozen in that pose
        z.st = ZS.NORMAL; z.stT = 0; z.stunT = 0; z.kvx = 0; z.kvy = 0; z.rageT = 0; z.cd = Math.min(z.cd || 0, 0.25); z.hitSet = null;
      }
      // in PvP: enemies in the cone lose their abilities for a moment, slow down and can't hide
      for (const q of this.foesOf(p)) {
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        let da = Math.atan2(dy, dx) - p.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        if (d > R || Math.abs(da) > cone) continue;
        q.silUntil = now + 4 + (L >= 1 ? 1 : 0); q.chillUntil = Math.max(q.chillUntil || 0, now + 2);
        if (q.invUntil > now) { q.invUntil = now; this.ev(['iv', q.pid, 0]); }
        for (const t of this.turrets) if (t.owner === q.pid && (t.k == null || t.k === 4)) t.hackUntil = now + 4;
      }
      this.ev(['hk', p.pid, Math.round(p.x), Math.round(p.y), r2(p.a), R]);
      // nothing in reach to take over: the ability is ready again in a moment instead of going to waste
      if (!took && !this.foesOf(p).some((q) => q.silUntil === now + 4 + (L >= 1 ? 1 : 0))) p.abAt = Math.min(p.abAt, now + 2);
    }
  }

  // Dipçik: a short melee shove in front of the player. Knocks zombies back, stuns them
  // and knocks a Kalkanlı's shield aside so it can be shot from the front.
  onBash(p, m) {
    if (!p.inGame || !p.alive || this.phase !== 'combat' || !num(m.a)) return;
    if (this.time < (p.bashAt || 0) - 0.15) return;
    p.bashAt = this.time + bashCd(p.cls);
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
    for (const q of this.foesOf(p)) {
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d > BASH.range + PLAYER_R) continue;
      let da = Math.atan2(dy, dx) - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > BASH.arc) continue;
      hit++; this.pvpDamage(p, q, dmg, 0); this.knock(q, p.x, p.y, 380);
    }
    this.ev(['bs', p.pid, Math.round(p.x), Math.round(p.y), r2(a), hit ? 1 : 0]);
  }

  onBuy(p, m) {
    if (!(this.phase === 'break' || (this.mode === 'pvp' && this.phase === 'combat' && !p.alive)) || !p.inGame || typeof m.k !== 'string') return;
    if (m.k === 'heal') {
      if (p.alive && p.gold >= HEAL_COST && p.hp < p.maxHp) { this.pay(p, HEAL_COST); p.hp = p.maxHp; }
      return;
    }
    if (m.k === 'wpn') {
      if (p.wt >= WMAX || p.gold < WEAPON_COST[p.wt + 1]) return;
      if (p.wt === 0) {
        // the first level picks a path, the third one of its two branches; the rest follow them
        if (!Number.isInteger(m.p) || !pathOk(p.cls, m.p)) return;
        p.wp = m.p;
      }
      if (p.wt === 2) {
        if (m.b !== 1 && m.b !== 2) return;
        p.wb = m.b;
      }
      this.pay(p, WEAPON_COST[p.wt + 1]); p.wt++;
      return;
    }
    if (m.k === 'wswap') {
      if (p.wt < 3 || p.gold < BRANCH_SWAP) return;
      this.pay(p, BRANCH_SWAP); p.wb = 3 - p.wb;
      return;
    }
    if (m.k === 'wreset') {
      if (p.wt < 1) return;
      { const back = Math.floor(weaponSpent(p.wt) / 2); p.gold += back; p.spent = Math.max(0, (p.spent || 0) - back); }
      p.wt = 0; p.wp = 0; p.wb = 0;
      return;
    }
    if (m.k === 'ab') {
      const l = p.lv.ab | 0;
      if (l >= AB_COST.length || p.gold < AB_COST[l]) return;
      this.pay(p, AB_COST[l]); p.lv.ab = l + 1;
      return;
    }
    if (m.k === 'gear') {
      const i = m.i;
      if (!Number.isInteger(i) || i < 0 || i >= GEAR.length) return;
      if (!p.inv) p.inv = GEAR.map(() => 0);
      const cost = gearCost(p.cls, i);
      if (p.inv[i] >= gearMax(p.cls, i) || p.gold < cost) return;
      this.pay(p, cost); p.inv[i]++;
      return;
    }
    if (m.k === 'team' && this.mode === 'pvp') return; // shared team upgrades would help both sides
    if (m.k === 'team') {
      const i = m.i;
      if (!Number.isInteger(i) || i < 0 || i >= TEAM.length) return;
      const lv = this.team[i];
      if (lv >= TEAM[i].cost.length) return;
      const cost = teamCost(i, lv, this.inGame().length);
      const left = Math.max(0, cost - this.teamFund[i]);
      const pay = m.all ? left : Math.min(TEAM_CHUNK, left, p.gold);
      if (pay <= 0 || p.gold < pay) return;
      this.pay(p, pay); this.teamFund[i] += pay;
      p.given = (p.given || 0) + pay;
      if (this.teamFund[i] >= cost) { this.team[i] = lv + 1; this.teamFund[i] = 0; this.ev(['tu', i, lv + 1, p.pid]); }
      return;
    }
    const u = UPGRADES.find((x) => x.k === m.k);
    if (!u) return;
    const lv = p.lv[u.k];
    if (lv >= u.max) return;
    const cost = upgradeCost(u, lv);
    if (p.gold < cost) return;
    this.pay(p, cost);
    p.lv[u.k]++;
    if (u.k === 'hp') {
      p.maxHp = stats(p.cls, p.lv).maxHp;
      p.hp = Math.min(p.maxHp, p.hp + 20);
    }
  }

  // ---------- game flow ----------
  start() {
    for (const q of this.players.values()) q.zh = null;
    this.resetWorld();
    this.theme = this.mapPick === 'rastgele' ? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)] : this.mapPick;
    this.seed = (Math.random() * 2 ** 31) | 0;
    if (this.daily) { this.theme = this.daily.map; this.seed = this.daily.seed; this.diff = this.daily.diff; for (const q of this.players.values()) q.cls = this.daily.cls; }
    const map = generateMap(this.theme, this.seed);
    setMap(map.theme, map.seed, map.obstacles, map.decor); this.fieldKey = "";
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

  // gold paid in the armory; with what is left this is a player's "worth" in this game
  pay(p, n) { p.gold -= n; p.spent = (p.spent || 0) + n; }
  worth(p) { return (p.gold || 0) + (p.spent || 0); }
  // someone joining late or coming back gets 75 % of what the others have earned on average, so they can keep up
  catchUp(p) {
    if (this.wave < 1) return;
    const o = this.inGame().filter((q) => q !== p && !q.ghost);
    if (!o.length) return;
    const want = Math.round(0.75 * o.reduce((a, q) => a + this.worth(q), 0) / o.length), have = this.worth(p);
    if (want > have) { p.gold += want - have; this.ev(['cu', p.pid, want - have]); }
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
    p.lv = newLv();
    p.inv = GEAR.map(() => 0);
    p.wb = 0;
    p.abUntil = 0;
    p.useAt = 0;
    p.given = 0;
    p.maxHp = stats(p.cls, p.lv).maxHp;
    p.hp = p.maxHp;
    p.alive = true;
    p.gold = START_GOLD + this.wave * 30;
    p.spent = 0;
    if (!ring) this.catchUp(p);
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
    p.bk = 0; p.ek = 0;
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
    const total = Math.min(450, Math.round((8 + w * 5) * scaleFor(n).count * DIFFS[this.diff].count * (this.mode === 'boss' ? 0.55 : 1)));
    const pRun = w >= 2 ? Math.min(0.28, 0.08 + w * 0.02) : 0;
    const pBig = w >= 3 ? Math.min(0.14, 0.03 + w * 0.01) : 0;
    const pSpit = w >= 4 ? Math.min(0.12, 0.02 + w * 0.01) : 0;
    const pBoom = w >= 5 ? Math.min(0.1, 0.02 + (w - 5) * 0.01) : 0;
    const pShield = w >= 6 ? Math.min(0.1, 0.02 + (w - 6) * 0.01) : 0;
    const pSummon = w >= 8 ? Math.min(0.05, 0.015 + (w - 8) * 0.005) : 0;
    const pGhost = w >= 7 ? Math.min(0.05, 0.015 + (w - 7) * 0.005) : 0;
    const pArmor = w >= 9 ? Math.min(0.05, 0.015 + (w - 9) * 0.005) : 0;
    const pLeap = w >= 6 ? Math.min(0.06, 0.02 + (w - 6) * 0.006) : 0;
    const pBloat = w >= 8 ? Math.min(0.04, 0.012 + (w - 8) * 0.004) : 0;
    const pHeal = w >= 10 ? Math.min(0.025, 0.01 + (w - 10) * 0.003) : 0;
    const pCrawl = w >= 12 ? Math.min(0.03, 0.01 + (w - 12) * 0.003) : 0;
    const pDig = w >= 7 ? Math.min(0.04, 0.012 + (w - 7) * 0.004) : 0;
    const pScream = w >= 9 ? Math.min(0.025, 0.01 + (w - 9) * 0.003) : 0;
    const pFrost = w >= 6 ? Math.min(0.04, 0.012 + (w - 6) * 0.004) : 0;
    const pBat = w >= 7 ? Math.min(0.025, 0.008 + (w - 7) * 0.003) : 0;
    const pDog = w >= 5 ? Math.min(0.025, 0.008 + (w - 5) * 0.003) : 0;
    const table = [[21, pBat], [22, pDog], [16, pDig], [17, pScream], [18, pFrost], [2, pBig], [4, pSpit], [5, pBoom], [6, pShield], [7, pSummon], [10, pGhost], [11, pArmor], [12, pLeap], [13, pBloat], [15, pHeal], [14, pCrawl], [1, pRun]];
    this.queue = [];
    for (let i = 0; i < total; i++) {
      let r = Math.random(), t = 0;
      for (const [type, pr] of table) { if (r < pr) { t = type; break; } r -= pr; }
      this.queue.push(t);
      if (t === 21) this.queue.push(21, 21, 21, 21); else if (t === 22) this.queue.push(22, 22, 22);
    }
    this.bossWave = 0;
    if (w % 5 === 0 || this.mode === 'boss') {
      // Dev, Kraliçe, Koç in turn; from wave 20 two different bosses come together
      const k = this.mode === 'boss' ? w - 1 : w / 5 - 1;
      const kinds = [BOSS_ORDER[k % BOSS_ORDER.length]];
      if (w >= (this.mode === 'boss' ? 8 : 20)) kinds.push(BOSS_ORDER[(k + 1) % BOSS_ORDER.length]);
      const count = 1 + Math.floor((n - 1) / 4);
      let i = 0;
      for (let c = 0; c < count; c++) for (const t of kinds) this.queue.splice(Math.floor(this.queue.length * Math.min(0.9, 0.3 + 0.15 * i++)), 0, t);
      this.bossWave = kinds[0];
    }
    // now and then something happens on the map in the middle of the wave
    this.mev = null; this.hordeT = 0;
    this.mevAt = w >= 3 && Math.random() < (this.mode === 'endless' ? 0.5 : 0.4) ? this.time + 12 + Math.random() * 22 : Infinity;
    if (this.pendBoss) { this.queue.splice(Math.floor(this.queue.length * 0.4), 0, this.pendBoss); this.pendBoss = 0; }
    if (this.pendEv && this.pendEv.length) { const L = this.pendEv; this.pendEv = null; setTimeout(() => { if (this.phase === 'combat') for (const [k, n, x] of L) this.adminEvent(k, n, Object.assign({}, x, { re: 1 })); }, 4000); }
    this.spawnT = 0.5;
    for (const p of this.inGame()) p.shopReady = false;
    this.ev(['ws', w, this.bossWave]);
    this.pushRoster();
  }

  endWave() {
    this.phase = 'break';
    this.breakT = this.mode === 'endless' && this.wave >= 5 ? 5 : BREAK_TIME;
    this.mev = null; this.mevAt = Infinity; this.hordeT = 0; this.cars = [];
    this.spits = [];
    const bonus = 20 + this.wave * 6;
    this.bombs = [];
    this.zones = [];
    for (const p of this.inGame()) {
      p.gold += Math.round(bonus * (1 + 0.12 * (this.team[3] | 0)));
      p.shopReady = false;
      if (!p.alive && this.mode !== 'hc') { p.alive = true; p.hp = Math.ceil(p.maxHp * 0.5); this.ev(['up', p.pid]); }
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
    if (this.mode === 'pvp') return;
    const ps = this.inGame();
    if (!ps.length || ps.every((p) => !p.alive)) this.gameOver();
  }

  gameOver() {
    this.phase = 'over';
    const P = this.inGame()
      .map((p) => ({ pid: p.pid, name: p.name, cls: p.cls, color: p.color, kills: p.kills, dmg: Math.round(p.dmg), revives: p.revives || 0, downs: p.downs || 0, picks: p.picks || 0, bk: p.bk || 0, ek: p.ek || 0, wt: p.wt || 0, wp: p.wp || 0, wb: p.wb || 0 }))
      .sort((a, b) => b.kills - a.kills);
    this.out({ t: 'o', wave: this.wave, P, time: Math.round(this.time), diff: this.diff, theme: this.theme });
    this.pushRoster();
  }

  // events sent from the owner's admin panel
  adminEvent(k, n, x = {}) {
    if (this.mode === 'pvp' && (k === 'boss' || k === 'horde' || k === 'zombie' || k === 'mev')) return; // no zombies in a PvP match
    // everyone in the game sees a short note about it (deferred ones say they come with the next wave)
    // a gift to one player is told to that player only; anything for everyone is told to everyone
    const target = x.who && (k === 'gold' || k === 'item') ? ([...this.players.values()].find((p) => p.name === x.who) || {}).pid | 0 : 0;
    if (!x.re) this.ev(['ae', k, n | 0, x.i | 0, String(x.who || '').slice(0, 16), (k === 'horde' || k === 'zombie' || k === 'mev' || k === 'boss') && this.phase !== 'combat' ? 1 : 0, String(x.q || '').slice(0, 8), x.t | 0, target]);
    if (k === 'gold') {
      const g = Math.max(10, Math.min(5000, n | 0));
      for (const p of this.inGame()) if (!x.who || p.name === x.who) p.gold += g;
      this.pushRoster();
    } else if ((k === 'horde' || k === 'zombie' || k === 'mev') && this.phase !== 'combat') {
      // between waves (or in the lobby) the owner's event waits for the next wave
      if (!this.pendEv) this.pendEv = [];
      if (this.pendEv.length < 10) this.pendEv.push([k, n, x]);
    } else if (k === 'horde') {
      const c = Math.max(5, Math.min(150, n | 0 || 30));
      for (let i = 0; i < c; i++) this.queue.unshift(1);
      this.hordeT = this.time + 12;
    } else if (k === 'zombie') {
      const t = Math.max(0, Math.min(ZTYPES.length - 1, x.t | 0)), c = Math.max(1, Math.min(60, n | 0 || 5));
      for (let i = 0; i < c; i++) this.spawnZombie(t);
    } else if (k === 'mev' && MEV[x.q]) {
      // the owner picks the event: run it now, whatever was planned
      this.mev = null; this.mevAt = this.time;
      const R = Math.random, i = MEV_ORDER.indexOf(x.q);
      Math.random = () => (i + 0.5) / MEV_ORDER.length;
      try { const q = this.queue.length; if (q < 6) this.queue.push(...Array(6 - q).fill(0)); this.updateMev(); } finally { Math.random = R; }
    } else if (k === 'item') {
      const i = Math.max(0, Math.min(GEAR.length - 1, x.i | 0)), c = Math.max(1, Math.min(20, n | 0 || 1));
      for (const p of this.inGame()) if (!x.who || p.name === x.who) { if (!Array.isArray(p.inv)) p.inv = GEAR.map(() => 0); p.inv[i] = Math.min(99, (p.inv[i] | 0) + c); }
      this.pushRoster();
    } else if (k === 'boss') {
      const t = BOSS_ORDER.includes(x.t) ? x.t : BOSS_ORDER[Math.floor(Math.random() * BOSS_ORDER.length)];
      if (this.phase === 'combat') this.spawnZombie(t); else this.pendBoss = t;
    }
  }

  // a gold gift from the owner to one player, found by name
  adminGift(name, n) {
    const g = Math.max(10, Math.min(5000, n | 0));
    const p = [...this.players.values()].find((x) => x.name === name);
    if (!p) return false;
    p.gold = (p.gold || 0) + g;
    this.pushRoster();
    return true;
  }

  // a short summary of the room for the admin panel's room viewer
  detail() {
    return {
      ph: this.phase, w: this.wave, z: this.zombies.filter((z) => !z.dead).length + (this.queue ? this.queue.length : 0),
      diff: (DIFFS[this.diff] || {}).name || this.diff, map: (MAPS[this.theme || this.mapPick] || {}).name || 'Rastgele',
      p: [...this.players.values()].map((p) => [p.name, (CLASSES[p.cls] || {}).name || '', p.inGame ? (p.alive ? 1 : 0) : 2, p.kills | 0, p.gold | 0]),
      mode: this.mode, ev: this.mev ? this.mev.k : '', q: this.queue ? this.queue.length : 0,
      // a small picture of the map for the owner's control room
      mm: this.phase === 'lobby' || !this.bounds ? null : {
        b: [this.bounds.x0, this.bounds.y0, this.bounds.x1, this.bounds.y1].map(Math.round), w: WORLD_W, h: WORLD_H,
        p: this.inGame().map((p) => [Math.round(p.x), Math.round(p.y), p.alive ? 1 : 0]),
        z: this.zombies.filter((z) => !z.dead).slice(0, 150).map((z) => [Math.round(z.x), Math.round(z.y), isBoss(z.t) ? 1 : 0]),
        o: (WORLD.obstacles || []).filter((o) => o.w * o.h > 1500 && o.x + o.w > this.bounds.x0 && o.x < this.bounds.x1 && o.y + o.h > this.bounds.y0 && o.y < this.bounds.y1).slice(0, 400).map((o) => [Math.round(o.x), Math.round(o.y), Math.round(o.w), Math.round(o.h)]),
      },
    };
  }

  toLobby() {
    this.phase = 'lobby';
    this.pvpOver = null;
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
    // the backup for whoever takes over if the host drops: every 5 s, and only when that player's link is free
    this.backupAcc += dt;
    if (this.backupAcc >= 5) { this.backupAcc = 0; this.sendBackup(); }
    if (this.paused || (this.phase !== 'combat' && this.phase !== 'break')) return;
    if (this.mode === 'pvp') this.tickPvp(dt); else this.tick(dt);
    if (this.phase !== 'combat' && this.phase !== 'break') return;
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / SNAP_RATE) {
      this.snapAcc = 0;
      this.sendSnaps();
      this.shots = [];
      this.events = [];
    }
  }

  growBounds(dt) {
    const a = areaFor(this.areaN);
    // the arena slowly breathes and wanders (a few minutes per cycle, about 20 px a second), so the map never feels static
    const T = this.time, sc = 1 + 0.16 * Math.sin(T / 37) * Math.min(1, T / 90), w = a.w * sc, h = a.h * sc;
    const mx = Math.max(0, (WORLD_W - w) / 2 - 80), my = Math.max(0, (WORLD_H - h) / 2 - 80);
    const cx = CX + Math.sin(T / 53) * Math.min(420, mx) * Math.min(1, T / 120), cy = CY + Math.cos(T / 71) * Math.min(300, my) * Math.min(1, T / 120);
    const t = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
    const b = this.bounds, grow = (b.x1 - b.x0) < w - 150 || (b.y1 - b.y0) < h - 150;
    const step = (grow ? 70 : 22) * dt; // grows quickly when players join, otherwise drifts slowly
    const go = (v, to) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
    b.x0 = go(b.x0, t.x0); b.y0 = go(b.y0, t.y0); b.x1 = go(b.x1, t.x1); b.y1 = go(b.y1, t.y1);
    setBounds(b.x0, b.y0, b.x1, b.y1);
  }

  tick(dt) {
    this.time += dt;
    this.growBounds(dt);
    if (this.phase === 'break') {
      this.breakT -= dt;
      this.updateTurrets(dt);
      this.updateWalls(dt);
      this.updateItems(dt, true);
      if (this.breakT <= 0) this.startWave();
      return;
    }
    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.fieldT = 0.25;
      // the path map only changes when a target player changes cell or the arena moves a little: otherwise keep it
      const src = this.inGame().filter((p) => p.alive && !(p.invUntil > this.time)), B = WORLD.bounds;
      const fk = src.map((p) => ((p.x / 40) | 0) + ',' + ((p.y / 40) | 0)).join(';') + '|' + ((B.x0 / 40) | 0) + ',' + ((B.y0 / 40) | 0) + ',' + ((B.x1 / 40) | 0) + ',' + ((B.y1 / 40) | 0);
      if (fk !== this.fieldKey) { this.fieldKey = fk; buildField(src, this.field); }
    }
    this.spawn(dt);
    this.updateRevives(dt);
    this.updateRegen(dt);
    this.updateZombies(dt);
    this.curBoss = false; this.curZ = null; // later damage (spit, cars, trains, blasts) is not "from the last zombie moved"
    this.updateSpits(dt);
    this.updateTurrets(dt);
    this.updateSpin(dt);
    this.updateMines(dt);
    this.updateBombs(dt);
    this.updateDots(dt);
    this.updateWalls(dt);
    this.updateItems(dt);
    this.updateMev();
    this.updateMap(dt);
    if (this.cars && this.cars.length) {
      for (const c of this.cars) {
        c.t -= dt; if (c.t > 0) continue;
        this.ev(['sl', Math.round(c.x), Math.round(c.y), 90]);
        for (const t of this.turrets) if (t.hp != null && Math.hypot(t.x - c.x, t.y - c.y) < 100) t.hp -= 300;
        for (const q of this.inGame()) if (q.alive && Math.hypot(q.x - c.x, q.y - c.y) < 90) { this.hurt(q, 38 * BOSS_DMG, 19); this.knock(q, c.x, c.y, 520); }
      }
      this.cars = this.cars.filter((c) => c.t > 0);
    }
    this.zombies = this.zombies.filter((z) => !z.dead);
    if (this.phase === 'combat' && this.queue.length === 0 && this.zombies.length === 0) this.endWave();
  }

  updateRegen(dt) {
    const ps = this.inGame();
    const docs = ps.filter((q) => q.alive && q.cls === 'doktor');
    for (const p of ps) {
      // a blood shield that is not being fed drains away after a few seconds
      if (p.bs > 0 && (!p.alive || this.time - (p.bsAt || 0) > 6)) p.bs = p.alive ? Math.max(0, p.bs - p.maxHp * 0.04 * dt) : 0;
      if (!p.alive || p.hp >= p.maxHp) continue;
      let r = this.pc(p).st.regen;
      if (p.cls === 'doktor') r += 1.5;
      else if (docs.some((d) => this.ally(d, p) && Math.hypot(d.x - p.x, d.y - p.y) < 180)) r += 1;
      if (r > 0) p.hp = Math.min(p.maxHp, p.hp + r * dt);
    }
  }

  updateRevives(dt) {
    if (this.mode === 'hc') return; // Tek Can: whoever goes down stays down
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
    let interval = Math.max(0.05, (0.9 - this.wave * 0.04) / Math.sqrt(n));
    if (this.mode === 'endless' && this.wave > 5) interval *= 0.72;
    if (this.hordeT > this.time) interval *= 0.3;
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
      return true;
    }
    return false;
  }

  addZombie(t, x, y) {
    const id = this.nextId++;
    const z = {
      id, t, x, y, hp: zMaxHp(t, this.wave, this.waveN, DIFFS[this.diff].hp), dead: false,
      tg: null, rt: 0, los: false, losT: 0, st: ZS.NORMAL, stT: 0, cd: 1 + Math.random() * 2, cd2: 4 + Math.random() * 3,
      dx: 0, dy: 0, cdir: 0, hitSet: null, slot: id * GOLDEN, side: id % 2 ? 1 : -1,
      sm: (1 + Math.min(0.35, this.wave * 0.015)) * (0.9 + Math.random() * 0.2) * DIFFS[this.diff].spd,
    };
    if (t === 11) z.armor = z.hp * 0.6;
    if (t === 16) { z.st = ZS.BURROW; z.stT = 9; }
    if (t === 23) { z.st = ZS.BURROW; z.stT = 6; }
    // elites: from wave 8, now and then a zombie gets one random power
    if (!isBoss(t) && t !== 14 && this.wave >= 8 && Math.random() < Math.min(0.06, 0.025 + (this.wave - 8) * 0.002)) {
      z.el = 1 + Math.floor(Math.random() * 4); z.hp *= 2.5; z.mx = z.hp;
      if (z.el === 1) z.sm *= 1.45;
    }
    this.zombies.push(z);
    this.zIndex.set(id, z);
    return z;
  }

  spawnZombie(t) {
    const T = ZTYPES[t];
    const alive = this.inGame().filter((p) => p.alive);
    const B = WORLD.bounds;
    let x = 0, y = 0, ok = false;
    // the arena is big: come in a little off screen around someone, not from the far edge
    if (alive.length) {
      for (let tries = 0; tries < 16; tries++) {
        const p = alive[Math.floor(Math.random() * alive.length)], a = Math.random() * Math.PI * 2, d = 950 + Math.random() * 500;
        x = clamp(p.x + Math.cos(a) * d, B.x0 + T.r + 2, B.x1 - T.r - 2); y = clamp(p.y + Math.sin(a) * d, B.y0 + T.r + 2, B.y1 - T.r - 2);
        if (pointInObstacle(x, y, T.r + 4) || alive.some((q) => Math.hypot(q.x - x, q.y - y) < 750)) continue;
        this.addZombie(t, x, y); return;
      }
    }
    for (let tries = 0; tries < 24; tries++) {
      const side = Math.floor(Math.random() * 4);
      const along = Math.random();
      if (side < 2) { x = side === 0 ? B.x0 + T.r + 2 : B.x1 - T.r - 2; y = B.y0 + along * (B.y1 - B.y0); }
      else { x = B.x0 + along * (B.x1 - B.x0); y = side === 2 ? B.y0 + T.r + 2 : B.y1 - T.r - 2; }
      if (pointInObstacle(x, y, T.r + 4)) continue;
      ok = true;
      if (!alive.some((p) => Math.hypot(p.x - x, p.y - y) < 350)) break;
    }
    if (!ok) { // every edge spot was inside something: walk in from the edge until it's clear
      const cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2;
      for (let k = 0; k < 40 && pointInObstacle(x, y, T.r + 2); k++) { x += (cx - x) * 0.05; y += (cy - y) * 0.05; }
    }
    this.addZombie(t, x, y);
  }

  // src: what hurt them (a zombie type, or 'tr' for the metro train); by default the zombie being moved right now
  hurt(p, dmg, src) {
    if (!p.alive) return;
    p.lastBy = src !== undefined ? src : this.curZ ? this.curZ.t : p.lastBy;
    const sprint = p.cls === 'izci' && (p.lv.ab | 0) >= 3 && this.time < p.abUntil;
    if (this.curBoss) dmg *= BOSS_DMG;
    const pf = this.pc(p).fx || {};
    if (pf.thorns && this.curZ && !this.curZ.dead && Math.hypot(this.curZ.x - p.x, this.curZ.y - p.y) < 160) this.damage(this.curZ, dmg * pf.thorns * 3, p);
    let hit = dmg * DIFFS[this.diff].dmg * (this.time < p.shieldUntil ? 0.3 : 1) * this.pc(p).st.armor * (sprint ? 0.4 : 1) * (p.spinUntil > this.time ? 0.6 : 1) * (p.guardUntil > this.time ? 0.7 : 1);
    if (p.bs > 0) { const a = Math.min(p.bs, hit); p.bs -= a; hit -= a; } // the blood shield takes it first
    p.hp -= hit;
    if (p.hp <= 0) this.down(p);
  }

  // ---------- anti-cheat: the host watches each player's hits and movement and only reports what looks impossible ----------
  // (nothing happens to the player; the owner sees the report in the panel)
  acStrike(p, kind, detail) {
    const now = this.time, A = p.ac || (p.ac = {});
    const k = A[kind] || (A[kind] = { n: 0, t0: now, sent: -999 });
    if (now - k.t0 > 60) { k.n = 0; k.t0 = now; }
    k.n++;
    if (k.n >= 3 && now - k.sent > 60) { k.sent = now; k.n = 0; if (this.onCheat) this.onCheat({ name: p.name, acct: p.acct || '', kind, detail: String(detail).slice(0, 80), wave: this.wave }); }
  }
  // the biggest single hit and the farthest reach a guest's weapon can have (generous: power-up, crit, focus, rage,
  // ricochets and long shots all fit; a hacked client sending 5000 damage across the map does not)
  hitCap(p) {
    const C = this.pc(p), key = C.key;
    if (p._hc && p._hc.key === key) return p._hc;
    const w = weaponOf(p.cls, p.wt, p.wp, p.wb), reach = w.kind === 'm' ? (w.reach || 100) * 2.5 + 200 : Math.max(500, (w.bspd || 900) * (w.life || 0.7)) * 2 + 400;
    p._hc = { key, d: C.st.dmg * (w.pelDmg || 1) * 2 * 3.2 * 2.6 * 1.3 + 40, r2: reach * reach };
    return p._hc;
  }
  // a guest's new position: a normal step at the fastest this class can go, a moment after a knockback or respawn,
  // or one longer jump every 4 s (getting out of a corner the arena closed). Anything else is refused and the guest
  // is put back where the host has it (sp changes, the guest's game snaps there).
  moveOk(p, x, y) {
    const now = this.time, d = Math.hypot(x - p.x, y - p.y);
    if (d < 2) return true;
    const st = this.pc(p).st, dt = Math.min(3, Math.max(0.05, now - (p.posT || now - 0.05)));
    if (d <= st.spd * 1.6 * 1.4 * 1.35 * dt + 90 || now - (p.kbAt || -9) < 1.2) return true;
    if (now - (p.jumpAt || -9) > 4 && d < 900 && !pointInObstacle(x, y, PLAYER_R)) { p.jumpAt = now; return true; }
    p.sp = (p.sp | 0) + 1; p.spAt = now; p.acmSp = p.sp;
    return false;
  }
  acInput(p, m) {
    const now = this.time, C = this.pc(p), st = C.st;
    // movement: distance covered in each one-second window against the fastest this class can go
    if (p.alive && num(m.x) && num(m.y)) {
      const A = p.acm || (p.acm = { x: p.x, y: p.y, t: now, d: 0 });
      if (p.acmSp !== p.sp || now - (p.kbAt || -9) < 1.2) { A.x = m.x; A.y = m.y; A.t = now; A.d = 0; p.acmSp = p.sp; }
      else {
        A.d += Math.hypot(m.x - A.x, m.y - A.y); A.x = m.x; A.y = m.y;
        if (now - A.t >= 1) {
          const fast = st.spd * 1.6 * 1.4 * 1.35 * (now - A.t) + 120;
          if (A.d > fast) this.acStrike(p, 'hız', `${Math.round(A.d / (now - A.t))} px/sn, en çok ${Math.round(st.spd * 1.6 * 1.4)}`);
          A.t = now; A.d = 0;
        }
      }
    }
    // hits: damage per hit and hits per second
    if (Array.isArray(m.h) && m.h.length) {
      const maxHit = st.dmg * 2 * 3.2 * 2.6 * 1.3 + 40; // power-up, crit, focus/rage, margins
      for (const h of m.h) if (Array.isArray(h) && num(h[1]) && h[1] > maxHit) { this.acStrike(p, 'hasar', `${Math.round(h[1])} hasar, en çok ${Math.round(maxHit)}`); break; }
      const H = p.ach || (p.ach = { n: 0, t: now });
      H.n += m.h.length;
      if (now - H.t >= 2) {
        const w = weaponOf(p.cls, p.wt, p.wp, p.wb), perSec = H.n / (now - H.t);
        const wf = w.fx || {}, rate = st.rate * (1 + (wf.ramp || 0)) * (wf.hasteRate || 1);
        const cap = rate * 2.2 * Math.max(1, w.pellets, 1 + (wf.rampPel | 0)) * (Math.min(6, (w.pierce | 0) + 1) + (w.aoe ? 8 : 0) + (wf.chain ? 4 : 0) + (wf.rico ? (wf.ricoN | 0) : 0) + (wf.bounce ? 6 : 0) + (wf.doubleCut ? 4 : 0) + (wf.wave ? 6 : 0)) * 1.6 + 25;
        if (perSec > cap) this.acStrike(p, 'atış', `saniyede ${Math.round(perSec)} isabet, en çok ${Math.round(cap)}`);
        H.n = 0; H.t = now;
      }
    }
  }

  knock(p, fromX, fromY, power) {
    p.kbAt = this.time;
    const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    this.ev(['kb', p.pid, Math.round(((p.x - fromX) / d) * power), Math.round(((p.y - fromY) / d) * power)]);
  }

  updateZombies(dt) {
    const players = this.inGame().filter((p) => p.alive && !(p.invUntil > this.time));
    this.curZ = null;
    const zs = this.zombies;
    const maxAlive = Math.min(110, 30 + 6 * this.waveN);

    // spatial hash for crowd separation
    // (the cells' lists are kept and emptied each step instead of made anew: fewer throwaway objects, fewer pauses)
    const HC = 60, hw = Math.ceil(WORLD_W / HC);
    const grid = this.zgrid || (this.zgrid = new Map());
    if (grid.size > 4000) grid.clear();
    for (const a of grid.values()) a.length = 0;
    for (const z of zs) {
      const k = Math.floor(z.y / HC) * hw + Math.floor(z.x / HC);
      let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(z);
    }

    for (let zi = 0; zi < zs.length; zi++) {
      const z = zs[zi];
      if (z.dead) continue;
      const T = ZTYPES[z.t];
      this.curBoss = isBoss(z.t); this.curZ = z;
      z.cd -= dt * (this.curBoss ? BOSS_CD : 1); z.cd2 -= dt;
      // a zombie that has gone nowhere for 6 s while no player can see it comes back in from the edge
      z.chkT = (z.chkT || 0) + dt;
      if (z.chkT >= 1) {
        z.chkT = 0;
        if (z.cx != null && Math.hypot(z.x - z.cx, z.y - z.cy) < 25 && z.t !== 4 && z.t !== 7 && z.t !== 8) z.still = (z.still || 0) + 1; else z.still = 0;
        z.cx = z.x; z.cy = z.y;
        if (z.still >= 6 && !isBoss(z.t) && !players.some((p) => Math.hypot(p.x - z.x, p.y - z.y) < 750)) {
          z.still = 0;
          const B = WORLD.bounds, side = Math.floor(Math.random() * 4), along = Math.random();
          let nx = side < 2 ? (side === 0 ? B.x0 + T.r + 2 : B.x1 - T.r - 2) : B.x0 + along * (B.x1 - B.x0);
          let ny = side < 2 ? B.y0 + along * (B.y1 - B.y0) : (side === 2 ? B.y0 + T.r + 2 : B.y1 - T.r - 2);
          if (!pointInObstacle(nx, ny, T.r + 2) && !players.some((p) => Math.hypot(p.x - nx, p.y - ny) < 600)) { z.x = nx; z.y = ny; z.st = ZS.NORMAL; z.detT = 0; }
        }
      }

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
        if (this.walls.length) this.wallPush(z, T, dt);
        continue;
      }

      if (z.ally) { this.allyZombie(z, T, dt, grid, hw, HC); continue; }
      // pick the nearest living player now and then
      z.rt -= dt;
      if (z.rt <= 0) {
        z.rt = 0.35 + Math.random() * 0.2;
        let best = null, bd = Infinity;
        for (const p of players) { const d = (p.x - z.x) ** 2 + (p.y - z.y) ** 2; if (d < bd) { bd = d; best = p; } }
        if (z.t === 22) { let w = null, wk = 2; for (const p of players) { const k = p.hp / p.maxHp; if (k < wk && (p.x - z.x) ** 2 + (p.y - z.y) ** 2 < 900 * 900) { wk = k; w = p; } } if (w) best = w; }
        z.tg = best ? best.pid : null;
      }
      const tp = z.tg != null ? this.players.get(z.tg) : null;
      const target = tp && tp.alive && tp.inGame ? tp : null;

      if (!target) { this.wander(z, T, dt); continue; }

      const tx = target.x, ty = target.y;
      const dist = Math.hypot(tx - z.x, ty - z.y) || 1;
      z.losT -= dt;
      // can it see its target? checked often up close, about twice a second far off-screen (each check walks the obstacles)
      if (z.losT <= 0) { z.losT = (dist > 1100 ? 0.4 : 0.15) + Math.random() * 0.1; z.los = clearLine(z.x, z.y, tx, ty, T.r + 2); }
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
        if (this.walls.length) this.wallPush(z, T, dt);
        for (const p of players) {
          if (!z.hitSet) z.hitSet = new Set(); // a zombie restored mid-charge (new host) has none yet
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
          if (z.t === 20) { z.cd = 2.6; for (let i = -1; i <= 1; i++) this.spit(z, a0 + i * 0.22, 330); } else
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
      if (z.st === ZS.PHASE) { // Hayalet slips straight through walls and crates
        z.stT -= dt;
        const a = Math.atan2(ty - z.y, tx - z.x), sp = T.spd * 1.25 * (z.slowUntil > this.time ? z.slowK || 0.55 : 1);
        if (dist > reach) { z.x += Math.cos(a) * sp * dt; z.y += Math.sin(a) * sp * dt; }
        z.face = a;
        if (dist < reach + 3) this.hurt(target, T.dps * dt);
        if (z.stT <= 0 && !pointInObstacle(z.x, z.y, T.r)) { z.st = ZS.NORMAL; z.cd = 3 + Math.random() * 2; }
        continue;
      }
      if (z.st === ZS.BURROW && z.t === 23) { // Dev Solucan: hunts under the ground, a red ring warns, then it bursts out
        if (z.emT > 0) {
          z.emT -= dt;
          if (z.emT <= 0) {
            z.st = ZS.NORMAL; z.cd = 4.5;
            this.ev(['sl', Math.round(z.x), Math.round(z.y), 120]);
            for (const p of players) if (Math.hypot(p.x - z.x, p.y - z.y) < 120) { this.hurt(p, 42); this.knock(p, z.x, z.y, 560); }
            for (const t of this.turrets) if (t.hp != null && Math.hypot(t.x - z.x, t.y - z.y) < 120) t.hp -= 250;
          }
          continue;
        }
        z.stT -= dt;
        const a = Math.atan2(ty - z.y, tx - z.x), sp = T.spd * 2.2 * z.sm, B = WORLD.bounds;
        z.x = clamp(z.x + Math.cos(a) * Math.min(sp * dt, dist), B.x0 + T.r, B.x1 - T.r); z.y = clamp(z.y + Math.sin(a) * Math.min(sp * dt, dist), B.y0 + T.r, B.y1 - T.r);
        z.face = a;
        if ((dist < 30 || z.stT <= 0) && !pointInObstacle(z.x, z.y, 20)) { z.emT = 1.15; this.ev(['wm', Math.round(z.x), Math.round(z.y), 1.15]); }
        continue;
      }
      if (z.st === ZS.BURROW) { // Kazıcı moving underground, straight at its target
        z.stT -= dt;
        const a = Math.atan2(ty - z.y, tx - z.x), sp = T.spd * 1.5 * z.sm;
        const B = WORLD.bounds;
        z.x = clamp(z.x + Math.cos(a) * sp * dt, B.x0 + T.r, B.x1 - T.r); z.y = clamp(z.y + Math.sin(a) * sp * dt, B.y0 + T.r, B.y1 - T.r);
        z.face = a;
        if ((dist < reach + 22 || z.stT <= 0) && !pointInObstacle(z.x, z.y, T.r)) {
          z.st = ZS.NORMAL; z.cd = 7;
          this.ev(['dg', Math.round(z.x), Math.round(z.y)]);
          for (const p of players) if (Math.hypot(p.x - z.x, p.y - z.y) < 70) { this.hurt(p, 12); this.knock(p, z.x, z.y, 300); }
        }
        continue;
      }
      if (z.st === ZS.SCREAM) {
        z.stT -= dt;
        if (z.stT <= 0) {
          z.st = ZS.NORMAL; z.cd2 = 6;
          this.ev(['sc', Math.round(z.x), Math.round(z.y), 280]);
          for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 280) o.rageT = this.time + 5;
        }
        continue;
      }
      if (z.st === ZS.THROW) { // Dev Hurda heaving a wrecked car
        z.stT -= dt; z.face = Math.atan2(ty - z.y, tx - z.x);
        if (z.stT <= 0) {
          z.st = ZS.NORMAL; z.cd = 4.5;
          const lead = 0.5, ex = clamp(tx + (target.vx || 0) * lead + (Math.random() - 0.5) * 60, WORLD.bounds.x0, WORLD.bounds.x1), ey = clamp(ty + (target.vy || 0) * lead + (Math.random() - 0.5) * 60, WORLD.bounds.y0, WORLD.bounds.y1);
          (this.cars || (this.cars = [])).push({ x: ex, y: ey, t: 1.1 });
          this.ev(['cr', Math.round(z.x), Math.round(z.y), Math.round(ex), Math.round(ey), 1.1]);
        }
        continue;
      }
      if (z.st === ZS.CAST) { // Cadı raising the dead
        z.stT -= dt;
        if (z.stT <= 0) {
          z.st = ZS.NORMAL; z.cd2 = 7;
          this.ev(['sm', Math.round(z.x), Math.round(z.y)]);
          const G = (this.graves || []).filter((g) => Math.hypot(g[0] - z.x, g[1] - z.y) < 600).slice(-5);
          for (let i = 0; i < 4 && this.zombies.length < maxAlive + 15; i++) { const g = G[i]; if (g) { this.spawnAt(i % 2 ? 1 : 0, g[0], g[1]); this.ev(['rz', Math.round(g[0]), Math.round(g[1])]); } else this.spawnAt(0, z.x, z.y); }
        }
        continue;
      }
      if (z.st === ZS.CROUCH) { // Sıçrayıcı gathering for a jump
        z.stT -= dt; z.face = Math.atan2(ty - z.y, tx - z.x);
        if (z.stT <= 0) { z.st = ZS.LEAP; z.stT = 0.7; z.lx0 = z.x; z.ly0 = z.y; const d = Math.min(dist, 420); z.lx1 = z.x + (tx - z.x) / dist * d; z.ly1 = z.y + (ty - z.y) / dist * d; }
        continue;
      }
      if (z.st === ZS.LEAP) { // in the air: over barricades and crates
        z.stT -= dt;
        const k = 1 - Math.max(0, z.stT) / 0.7;
        z.x = z.lx0 + (z.lx1 - z.lx0) * k; z.y = z.ly0 + (z.ly1 - z.ly0) * k;
        if (z.stT <= 0) {
          z.st = ZS.NORMAL; z.cd = 3.5;
          moveCircle(z, 0, 0, T.r);
          this.ev(['sl', Math.round(z.x), Math.round(z.y), 90]);
          for (const p of players) if (Math.hypot(p.x - z.x, p.y - z.y) < 90) { this.hurt(p, 14); this.knock(p, z.x, z.y, 320); }
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
        if (z.t === 12 && z.cd <= 0 && dist > 150 && dist < 430) { z.st = ZS.CROUCH; z.stT = 0.55; continue; }
        if (z.t === 17 && z.cd2 <= 0 && dist < 600) { z.st = ZS.SCREAM; z.stT = 0.8; continue; }
        if (z.t === 19 && z.cd <= 0 && dist > 170 && dist < 700) { z.st = ZS.THROW; z.stT = 0.75; continue; }
        if (z.t === 20 && z.cd2 <= 0 && dist < 650) { z.st = ZS.CAST; z.stT = 1; continue; }
        if (z.t === 20 && z.cd <= 0 && dist < 520) { z.st = ZS.SPIT; z.stT = 0.5; continue; }
        if (z.cd <= 0) {
          if (charge && dist > charge.min && dist < charge.max) { z.st = ZS.WINDUP; z.stT = charge.wind; continue; }
          if (z.t === 3 && dist < 150) { z.st = ZS.SLAM; z.stT = 0.9; continue; }
          if ((z.t === 4 && dist < 470) || (z.t === 8 && dist < 520)) { z.st = ZS.SPIT; z.stT = z.t === 8 ? 0.6 : 0.4; continue; }
          if ((z.t === 1 || z.t === 22) && dist < 150) { z.st = ZS.DASH; z.stT = 0.45; z.cd = 2.4; }
        }
      }
      if (z.st === ZS.DASH && (z.t === 1 || z.t === 22)) { z.stT -= dt; if (z.stT <= 0) z.st = ZS.NORMAL; }

      if (z.t === 10 && z.cd <= 0 && dist < 700 && (!z.los || dist < 300)) { z.st = ZS.PHASE; z.stT = 2.2; continue; }
      if (z.t === 12 && z.cd <= 0 && !z.los && dist < 430 && dist > 120) { z.st = ZS.CROUCH; z.stT = 0.55; continue; }
      if (z.t === 20) { // Cadı vanishes when cornered and appears elsewhere
        z.tpT = (z.tpT == null ? 9 : z.tpT) - dt;
        if (z.tpT <= 0 && (dist < 230 || Math.random() < 0.3)) {
          z.tpT = 8 + Math.random() * 3;
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2, d = 320 + Math.random() * 120, nx = tx + Math.cos(a) * d, ny = ty + Math.sin(a) * d;
            if (pointInObstacle(nx, ny, T.r) || outOfMap(nx, ny)) continue;
            this.ev(['tp', Math.round(z.x), Math.round(z.y), Math.round(nx), Math.round(ny)]);
            z.x = nx; z.y = ny; break;
          }
        }
      }
      if (z.t === 21) { // bats fly over walls and barricades straight at their target, with a flutter
        const a = Math.atan2(ty - z.y, tx - z.x) + Math.sin(this.time * 7 + z.id) * 0.55, sp = T.spd * z.sm * (z.slowUntil > this.time ? (z.slowK || 0.6) : 1) * (z.stunT > 0 ? 0 : 1), B = WORLD.bounds;
        if (dist > reach) { z.x = clamp(z.x + Math.cos(a) * sp * dt, B.x0 + T.r, B.x1 - T.r); z.y = clamp(z.y + Math.sin(a) * sp * dt, B.y0 + T.r, B.y1 - T.r); }
        else this.hurt(target, T.dps * dt);
        z.face = a; z.dx = Math.cos(a); z.dy = Math.sin(a);
        continue;
      }
      if (z.t === 23 && z.cd <= 0 && z.st === ZS.NORMAL) { z.st = ZS.BURROW; z.stT = 7; z.emT = 0; this.ev(['dg', Math.round(z.x), Math.round(z.y)]); continue; }
      if (z.t === 16 && z.cd <= 0 && dist > 260) { z.st = ZS.BURROW; z.stT = 6; this.ev(['dg', Math.round(z.x), Math.round(z.y)]); continue; }
      if (z.el === 3 && z.hp < (z.mx || z.hp)) z.hp = Math.min(z.mx, z.hp + z.mx * 0.03 * dt);
      if (z.t === 15) { // Şifacı mends the zombies around it
        z.cd2 -= dt;
        if (z.cd2 <= 0) {
          z.cd2 = 1;
          let n = 0;
          for (const o of this.zombies) {
            if (o === z || o.dead || isBoss(o.t) || Math.hypot(o.x - z.x, o.y - z.y) > 170) continue;
            const mx = zMaxHp(o.t, this.wave, this.waveN, DIFFS[this.diff].hp);
            if (o.hp < mx) { o.hp = Math.min(mx, o.hp + mx * 0.07); n++; }
          }
          if (n) this.ev(['hz', Math.round(z.x), Math.round(z.y)]);
        }
      }

      // ----- steering -----
      const ranged = z.t === 4 || z.t === 7 || z.t === 8 || z.t === 15 || z.t === 17 || z.t === 20;
      let dx, dy, speed = T.spd * z.sm * (z.slowUntil > this.time ? z.slowK || 0.55 : 1) * (this.mev && this.mev.k === 'moon' ? 1.2 : 1) * (z.rageT > this.time ? 1.35 : 1);
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
          const near = z.t === 7 || z.t === 15 || z.t === 20 ? 280 : z.t === 17 ? 200 : 240, far = z.t === 7 || z.t === 20 ? 520 : z.t === 15 ? 420 : z.t === 17 ? 360 : 470;
          if (dist < near) { dx = -dx; dy = -dy; speed *= 0.8; }
          else if (dist < far) { const px = -dy * z.side, py = dx * z.side; dx = px; dy = py; speed *= 0.5; }
        }
      } else {
        const f = fieldAhead(this.field, z.x, z.y, T.r);
        if (f) { dx = f.x; dy = f.y; } else { dx = (tx - z.x) / dist; dy = (ty - z.y) / dist; }
      }
      if (z.st === ZS.DASH && (z.t === 1 || z.t === 22)) speed *= 1.9;
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
      if (this.walls.length) this.wallPush(z, T, dt);
      if (this.turrets.length) this.turretPush(z, T, dt);
      // stuck? (pressed into a wall or a crowd) step sideways toward whichever side is closer to the
      // players on the path map; if that fails too, back off a little first
      if (speed > 0 && Math.hypot(z.x - bx, z.y - by) < speed * dt * 0.3) {
        z.stk = (z.stk || 0) + dt;
        if (z.stk > 0.35) {
          z.stuckN = (z.stuckN || 0) + 1; z.freeT = 0;
          const a = Math.atan2(dy, dx), px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2), o = T.r + 30;
          const l = fieldAt(this.field, z.x + px * o, z.y + py * o), r = fieldAt(this.field, z.x - px * o, z.y - py * o);
          let side = l < r ? 1 : r < l ? -1 : (Math.random() < 0.5 ? 1 : -1);
          if (z.stuckN % 3 === 0) side = -side;
          z.det = side * (z.stuckN % 4 === 3 ? Math.PI * 0.8 : Math.PI / 2);
          z.detT = 0.5 + Math.min(0.6, z.stuckN * 0.1);
          z.stk = 0;
          z.los = false; z.losT = 0.6; // follow the path map for a moment
        }
      } else { z.stk = 0; z.freeT = (z.freeT || 0) + dt; if (z.freeT > 2) { z.stuckN = 0; z.freeT = 0; } }
      // walled in (the arena edge moved past it, or it keeps getting stuck)? move it to open ground
      z.pkT = (z.pkT || 0) - dt;
      if (z.pkT <= 0) { z.pkT = 1.5; if ((z.stuckN >= 3 || fieldAt(this.field, z.x, z.y) === Infinity) && escapePocket(z, T.r, 40)) { z.stuckN = 0; z.stk = 0; } }
      // face the target when close (matters for the Kalkanlı's shield)
      z.face = Math.atan2(ty - z.y, tx - z.x);

      // claw whoever is in reach
      if (T.dps > 0) {
        let near = null, nd = Infinity;
        for (const p of players) { const d = Math.hypot(p.x - z.x, p.y - z.y); if (d < nd) { nd = d; near = p; } }
        if (near && nd < reach + 3) { this.hurt(near, T.dps * dt); if (z.t === 18) near.chillUntil = this.time + 1.2; }
      }
    }
  }

  spit(z, a, spd) {
    const r = ZTYPES[z.t].r;
    this.spits.push({ id: this.nextId++, x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 2.2, boss: isBoss(z.t) });
  }

  // A Patlayan bursts: hurts nearby players and other zombies. byPlayer: who killed it, if anyone.
  burst(z, byPlayer) {
    if (z.burst) return;
    z.burst = true;
    const R = 110;
    this.ev(['x', Math.round(z.x), Math.round(z.y), R]);
    for (const p of this.inGame()) if (p.alive && Math.hypot(p.x - z.x, p.y - z.y) < R) { this.hurt(p, (byPlayer ? 12 : 30) * (p.cls === 'alevci' || p.cls === 'bombaci' ? 0.5 : 1), z.t); this.knock(p, z.x, z.y, 420); }
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
        if (Math.hypot(p.x - s.x, p.y - s.y) < PLAYER_R + 8) { this.hurt(p, s.boss ? 14 * BOSS_DMG : 14, s.boss ? 20 : 4); s.life = 0; this.ev(['sp', Math.round(s.x), Math.round(s.y)]); break; }
      }
    }
    this.spits = this.spits.filter((s) => s.life > 0);
  }

  // Mühendis always has two attack drones (three with mastery III); they follow and orbit their owner.
  keepDrones() {
    const want = new Map();
    for (const p of this.inGame()) if (p.cls === 'muhendis' && p.alive) want.set(p.pid, (p.lv.ab | 0) >= 3 ? 3 : 2);
    this.turrets = this.turrets.filter((t) => t.k !== 1 || (want.get(t.owner) || 0) > t.slot);
    const dogs = new Map();
    for (const p of this.inGame()) if (p.cls === 'egitmen') dogs.set(p.pid, (p.lv.ab | 0) >= 3 ? 2 : 1);
    this.turrets = this.turrets.filter((t) => t.k !== 5 || (dogs.get(t.owner) || 0) > t.slot);
    for (const [pid, n] of dogs) {
      const have = this.turrets.filter((t) => t.k === 5 && t.owner === pid).map((t) => t.slot), p = this.players.get(pid);
      for (let i = 0; i < n; i++) if (!have.includes(i)) this.turrets.push({ id: this.nextId++, k: 5, owner: pid, slot: i, x: p.x - 30, y: p.y + 20 * i, a: 0, life: 999, cd: 0 });
    }
    for (const [pid, n] of want) {
      const have = this.turrets.filter((t) => t.k === 1 && t.owner === pid).map((t) => t.slot);
      const p = this.players.get(pid);
      for (let i = 0; i < n; i++) if (!have.includes(i)) this.turrets.push({ id: this.nextId++, k: 1, owner: pid, slot: i, n, x: p.x, y: p.y, a: 0, life: 999, cd: Math.random() * 0.5 });
      for (const t of this.turrets) if (t.k === 1 && t.owner === pid) t.n = n;
    }
  }

  updateTurrets(dt) {
    this.keepDrones();
    this.chem = this.inGame().some((q) => q.cls === 'kimyager');
    this.leaders = this.inGame().filter((q) => q.cls === 'komutan' && q.alive);
    for (const t of this.turrets) {
      const owner = this.players.get(t.owner) || null;
      if (t.k === 1 || t.k === 2) { // drones fly with their owner
        if (!owner) { t.life = 0; continue; }
        const ang = this.time * (t.k === 1 ? 1.7 : 0.9) + (t.k === 1 ? t.slot * Math.PI * 2 / (t.n || 2) : 0), rad = t.k === 1 ? 40 : 30;
        const tx = owner.x + Math.cos(ang) * rad, ty = owner.y + Math.sin(ang) * rad - (t.k === 2 ? 26 : 0);
        t.x += (tx - t.x) * Math.min(1, dt * 8); t.y += (ty - t.y) * Math.min(1, dt * 8);
      }
      if (t.k === 5) { this.updateDog(t, owner, dt); continue; }
      if (t.k !== 1) t.life -= dt;
      t.cd -= dt;
      if (t.hackUntil > this.time) continue; // hacked by an enemy Hacker: dead for a moment
      if (t.k === 2) { // repair drone: heals teammates, mends barricades and turrets
        const ab = CLASSES.muhendis.ab;
        if (this.phase === 'combat' || this.phase === 'break') {
          for (const q of this.inGame()) if (q.alive && Math.hypot(q.x - t.x, q.y - t.y) < ab.r) q.hp = Math.min(q.maxHp, q.hp + ab.heal * dt);
          for (const w of this.walls) if (Math.hypot(w.x - t.x, w.y - t.y) < ab.r) w.hp = Math.min(w.max, w.hp + w.max * 0.15 * dt);
          for (const o of this.turrets) if (o.k == null && Math.hypot(o.x - t.x, o.y - t.y) < ab.r) o.life = Math.min(40, o.life + dt * 0.5);
        }
        continue;
      }
      if (t.k === 4) { // Tesla coil: zaps the nearest zombie, the spark jumps on
        if (this.phase !== 'combat' || t.cd > 0) continue;
        const ab = CLASSES.tesla.ab, L = t.L | 0;
        let best = null, bd = ab.r * ab.r;
        for (const z of this.zombies) { if (z.dead || z.ally) continue; const d = (z.x - t.x) ** 2 + (z.y - t.y) ** 2; if (d < bd) { bd = d; best = z; } }
        t.cd = L >= 2 ? 0.45 : 0.6;
        const C = owner && owner.inGame ? this.pc(owner) : null, dm = Math.max(14, C ? C.dps * 0.35 : 20) * this.netBoost(t);
        if (!best) { const f = this.foesOf(owner).find((q) => Math.hypot(q.x - t.x, q.y - t.y) < ab.r); if (f) { this.pvpDamage(owner, f, dm, 6); this.ev(['zp', owner ? owner.pid : 0, Math.round(t.x), Math.round(t.y - 20), Math.round(f.x), Math.round(f.y)]); } continue; }
        const hit = new Set([best.id]), pts = [Math.round(t.x), Math.round(t.y - 20), Math.round(best.x), Math.round(best.y)];
        let cur = best;
        this.damage(best, dm, owner);
        for (let j = 0; j < (L >= 2 ? 5 : 3); j++) {
          let nx = null, nd = 170 * 170;
          for (const o of this.zombies) { if (o.dead || hit.has(o.id)) continue; const d = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2; if (d < nd) { nd = d; nx = o; } }
          if (!nx) break;
          hit.add(nx.id); pts.push(Math.round(nx.x), Math.round(nx.y)); this.damage(nx, dm * 0.7, owner); cur = nx;
        }
        if (L >= 3) for (const id of hit) { const z = this.zIndex.get(id); if (z && !isBoss(z.t)) z.stunT = Math.max(z.stunT || 0, 0.35); }
        this.ev(['zp', owner ? owner.pid : 0, ...pts]);
        continue;
      }
      if (t.k === 3 || this.phase !== 'combat' || t.cd > 0) continue;
      const drone = t.k === 1, ab = drone ? CLASSES.muhendis.drone : CLASSES.tamirci.ab;
      let best = null, bd = ab.range * ab.range;
      for (const z of this.zombies) {
        if (z.dead || z.ally) continue;
        const d = (z.x - t.x) ** 2 + (z.y - t.y) ** 2;
        if (d < bd && (drone || clearLine(t.x, t.y, z.x, z.y))) { bd = d; best = z; }
      }
      for (const q of this.foesOf(owner)) {
        const d = (q.x - t.x) ** 2 + (q.y - t.y) ** 2;
        if (d < bd && !(q.invUntil > this.time) && (drone || clearLine(t.x, t.y, q.x, q.y))) { bd = d; best = q; }
      }
      if (!best) continue;
      t.a = Math.atan2(best.y - t.y, best.x - t.x);
      const lv = owner && owner.lv ? owner.lv : null;
      const base = drone ? ab.dmg * (1 + 0.12 * (owner ? owner.wt | 0 : 0)) * ((lv && (lv.ab | 0) >= 2) ? 1.4 : 1) : ab.dmg * (t.dk || 1);
      const tdm = base * (1 + 0.15 * (lv ? lv.dmg : 0)) * (1 + 0.08 * (this.team[1] | 0)) * this.netBoost(t);
      if (best.pid != null) this.pvpDamage(owner, best, tdm, 0);
      else if (!this.shielded(best, t.x, t.y)) this.damage(best, tdm, owner);
      if (this.shots.length < 240) this.shots.push([drone ? -2 : -1, Math.round(t.x + Math.cos(t.a) * (drone ? 8 : 20)), Math.round(t.y + Math.sin(t.a) * (drone ? 8 : 20)), r2(t.a)]);
      t.cd = drone ? ab.rate * (owner && owner.abUntil > this.time ? 0.6 : 1) : (t.rt || ab.rate);
    }
    for (const t of this.turrets) if (t.hp != null && t.hp <= 0 && t.life > 0) { t.life = 0; this.ev(['tb', Math.round(t.x), Math.round(t.y), t.k | 0]); }
    this.turrets = this.turrets.filter((t) => t.life > 0);
  }

  updateMines(dt) {
    const ab = CLASSES.bombaci.ab;
    for (const m of this.mines) {
      m.arm -= dt; m.life -= dt;
      if (m.arm > 0) continue;
      const owner = this.players.get(m.owner) || null;
      if (!this.zombies.some((z) => !z.dead && Math.hypot(z.x - m.x, z.y - m.y) < ZTYPES[z.t].r + 30) && !this.foesOf(owner).some((q) => Math.hypot(q.x - m.x, q.y - m.y) < PLAYER_R + 30)) continue;
      const mul = (1 + 0.15 * (owner && owner.lv ? owner.lv.dmg : 0)) * (m.k || 1) * (1 + 0.08 * (this.team[1] | 0));
      const R = ab.r + (m.rk || 0);
      for (const z of this.zombies) if (!z.dead && Math.hypot(z.x - m.x, z.y - m.y) < R + ZTYPES[z.t].r) this.damage(z, ab.dmg * mul, owner);
      this.pvpArea(owner, m.x, m.y, R, ab.dmg * mul, 0);
      this.ev(['x', Math.round(m.x), Math.round(m.y), R]);
      if (m.cl) for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + Math.random(), d = 70 + Math.random() * 30;
        this.bombs.push({ x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d, t: 0.35 + i * 0.12, dmg: ab.dmg * mul * 0.5, r: 70, owner: m.owner });
      }
      m.life = 0;
    }
    this.mines = this.mines.filter((m) => m.life > 0);
  }

  // a Hacker near a turret, drone or coil on their side makes it hit 25 % harder
  netBoost(t) {
    const o = this.players.get(t.owner);
    for (const q of this.inGame()) if (q.cls === 'hacker' && q.alive && this.ally(q, o || q) && Math.hypot(q.x - t.x, q.y - t.y) < 350) return 1.25;
    return 1;
  }
  // the nearest zombie (or enemy in PvP) to a point, for the dog
  nearTarget(p, x, y, r, skip) {
    let best = null, bd = r * r;
    for (const z of this.zombies) { if (z.dead || z.ally || z.st === ZS.BURROW || z.id === skip) continue; const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z; } }
    for (const q of this.foesOf(p)) { if (q.invUntil > this.time) continue; const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
    return best ? (best.pid != null ? 'p' + best.pid : best.id) : null;
  }
  // the dog appears at its owner's side (never inside a wall)
  dogHeel(t, owner) {
    for (let i = 0; i < 8; i++) {
      const a = owner.a + Math.PI + (t.slot ? 0.7 : -0.7) + i * 0.8, x = owner.x + Math.cos(a) * 34, y = owner.y + Math.sin(a) * 34;
      if (!pointInObstacle(x, y, 9) && !outOfMap(x, y)) { t.x = x; t.y = y; t.tg = null; return; }
    }
    t.x = owner.x; t.y = owner.y; t.tg = null;
  }
  // the Eğitmen's dog: stays near its owner, runs at anything close, bites and holds it
  updateDog(t, owner, dt) {
    if (!owner || !owner.inGame) { t.life = 0; return; }
    const D = CLASSES.egitmen.dog, now = this.time, atk = t.atkUntil > now;
    t.cd -= dt;
    const look = (id) => (typeof id === 'string' ? this.players.get(+id.slice(1)) : this.zIndex.get(id));
    let tg = t.tg != null ? look(t.tg) : null;
    if (tg && (tg.dead || (tg.pid != null && (!tg.alive || !this.foe(owner, tg) || tg.invUntil > now)) || tg.ally || Math.hypot(tg.x - owner.x, tg.y - owner.y) > D.range * (atk ? 2 : 1.4))) tg = null;
    if (!tg && owner.alive && (this.phase === 'combat') && (t.seek = (t.seek || 0) - dt) <= 0) { t.seek = 0.3; t.tg = this.nearTarget(owner, owner.x, owner.y, D.range, t.skipT > now ? t.skip : null); tg = t.tg != null ? look(t.tg) : null; }
    if (!tg) t.tg = null;
    let gx, gy, spd = D.spd * (atk ? 1.6 : 1);
    if (tg) { gx = tg.x; gy = tg.y; } else { const a = owner.a + Math.PI + (t.slot ? 0.7 : -0.7); gx = owner.x + Math.cos(a) * 38; gy = owner.y + Math.sin(a) * 38; spd = Math.max(D.spd, Math.hypot(gx - t.x, gy - t.y) * 3); }
    const dx = gx - t.x, dy = gy - t.y, d = Math.hypot(dx, dy) || 1;
    const reach = tg ? (tg.pid != null ? PLAYER_R : ZTYPES[tg.t].r) + 12 : 4;
    if (d > reach) {
      const st = Math.min(d - reach, spd * dt), bx = t.x, by = t.y;
      moveCircle(t, dx / d * st, dy / d * st, 9); t.a = Math.atan2(dy, dx);
      // a wall in the way: after half a second the dog drops that target, or comes straight back to heel
      if (st > 0.5 && Math.hypot(t.x - bx, t.y - by) < st * 0.3) t.stuck = (t.stuck || 0) + dt; else t.stuck = 0;
      if (t.stuck > 0.5) {
        t.stuck = 0;
        if (tg) { t.skip = t.tg; t.skipT = now + 2.5; t.tg = null; t.seek = 0.2; }
        else this.dogHeel(t, owner);
      }
    } else t.stuck = 0;
    if (Math.hypot(t.x - owner.x, t.y - owner.y) > (tg ? 900 : 560)) this.dogHeel(t, owner);
    if (!tg || d > reach + 6 || t.cd > 0 || this.phase !== 'combat') return;
    const of = this.pc(owner).fx || {};
    const L = owner.lv.ab | 0, dm = D.dmg * (1 + 0.15 * (owner.lv.dmg | 0)) * (L >= 2 ? 1.4 : 1) * (atk ? 2 * (of.dogAtk || 1) : 1) * this.netBoost(t);
    t.cd = D.rate * (atk ? 0.6 : 1) / (of.dogRate || 1);
    if (tg.pid != null) { this.pvpDamage(owner, tg, dm * 0.8, 0); tg.chillUntil = Math.max(tg.chillUntil || 0, now + (atk ? 1 : 0.5)); }
    else {
      const was = tg.dead;
      this.dogHit = true; this.damage(tg, dm * (of.markDog && !of.mark && tg.slowUntil > now ? of.markDog : 1), owner); this.dogHit = false;
      if (!tg.dead && !isBoss(tg.t)) { tg.slowUntil = now + 1.2; tg.slowK = Math.min(tg.slowK || 1, 0.55); if (atk) tg.stunT = Math.max(tg.stunT || 0, 0.6); if (of.dogStun) tg.stunT = Math.max(tg.stunT || 0, of.dogStun); }
      if (!was && tg.dead) { if (of.dogGold) owner.gold += Math.max(1, Math.round(ZTYPES[tg.t].gold * DIFFS[this.diff].gold * of.dogGold)); if (of.dogHeal && owner.alive) owner.hp = Math.min(owner.maxHp, owner.hp + of.dogHeal); }
    }
    this.ev(['bt', Math.round(tg.x), Math.round(tg.y)]);
  }
  // the Kılıççı's whirlwind
  updateSpin() {
    const now = this.time;
    for (const p of this.inGame()) {
      if (!(p.spinUntil > now) || !p.alive || now < (p.spinAt || 0)) continue;
      p.spinAt = now + 0.25;
      const ab = CLASSES.kilicci.ab, L = p.spinL | 0, R = ab.r + (L >= 2 ? 30 : 0);
      const dm = ab.dmg * (1 + 0.15 * (p.lv.dmg | 0)) * (L >= 2 ? 1.3 : 1);
      for (const z of this.zombies) {
        if (z.dead || z.ally || Math.hypot(z.x - p.x, z.y - p.y) > R + ZTYPES[z.t].r) continue;
        this.damage(z, dm, p);
        if (L >= 3 && !z.dead && !isBoss(z.t)) { const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy) || 1; z.kvx = dx / d * 300; z.kvy = dy / d * 300; z.stunT = Math.max(z.stunT || 0, 0.25); }
      }
      this.pvpArea(p, p.x, p.y, R, dm, 9);
    }
  }
  // a hacked zombie: hunts the nearest other zombie and bites it; when the time is up it blows up
  allyZombie(z, T, dt, grid, hw, HC) {
    const now = this.time, owner = this.players.get(z.ally);
    if (now >= z.allyUntil || !owner) {
      const R = 80 * (z.allyB || 1);
      z.ally = 0;
      this.ev(['x', Math.round(z.x), Math.round(z.y), Math.round(R)]);
      // other hacked zombies are still on our side: the blast spares them
      for (const o of this.zombies) if (o !== z && !o.dead && !o.ally && Math.hypot(o.x - z.x, o.y - z.y) < R + ZTYPES[o.t].r) this.damage(o, 60 * (z.allyK || 1) * (z.allyB || 1), owner || null);
      // the hacked zombie always dies here, whatever its armour or state, so none is ever left behind
      if (z.st === ZS.BURROW) z.st = ZS.NORMAL;
      z.hp = 0.01; this.damage(z, 1, owner || null);
      if (!z.dead) { z.dead = true; this.zIndex.delete(z.id); }
      return;
    }
    let best = null, bd = 700 * 700;
    for (const o of this.zombies) { if (o === z || o.dead || o.ally || o.st === ZS.BURROW || (o.id === z.aSkip && z.aSkipT > now)) continue; const d = (o.x - z.x) ** 2 + (o.y - z.y) ** 2; if (d < bd) { bd = d; best = o; } }
    if (!best) { this.wander(z, T, dt); return; }
    const dx = best.x - z.x, dy = best.y - z.y, d = Math.hypot(dx, dy) || 1, reach = T.r + ZTYPES[best.t].r + 4;
    if (d > reach) {
      const sp = T.spd * z.sm * 1.15 * dt, st = Math.min(sp, d - reach), bx = z.x, by = z.y;
      if (z.t === 21) { z.x += dx / d * st; z.y += dy / d * st; } // bats fly over everything
      else moveCircle(z, dx / d * st, dy / d * st, T.r);
      z.dx = dx / d; z.dy = dy / d;
      // a wall between it and its prey: after a moment it gives up on that one and picks another
      if (Math.hypot(z.x - bx, z.y - by) < st * 0.25) { z.aStuck = (z.aStuck || 0) + dt; if (z.aStuck > 0.8) { z.aStuck = 0; z.aSkip = best.id; z.aSkipT = now + 2.5; } } else z.aStuck = 0;
    }
    else if (z.cd <= 0) { z.cd = 0.7; this.damage(best, Math.max(12, (T.dps || 10) * 2) * (z.allyK || 1), owner); this.ev(['bt', Math.round(best.x), Math.round(best.y)]); }
    this.separate(z, T, grid, hw, HC, dt, 0);
  }

  damage(z, d, p) {
    if (z.dead || z.st === ZS.BURROW || !(d > 0)) return; // NaN or negative damage is ignored
    if (z.ally && p && p.pid != null && z.ally !== 0 && this.ally(p, this.players.get(z.ally) || p)) return; // our side's blasts and turrets spare a hacked zombie
    if (Number.isNaN(z.hp)) z.hp = 1; // a broken health value never makes a zombie unkillable
    if (z.el === 4) d *= 0.55;
    if (!this.bulletHit && z.acidT > this.time) d *= z.acidK || 1;
    if (z.markT > this.time) { d *= z.markK || 1; if (!this.bulletHit && z.markTur && p && !this.dogHit) d *= z.markTur; if (this.dogHit && z.markDog) d *= z.markDog; }
    const dealt = Math.min(d, z.hp);
    z.hp -= d;
    if (p && p.inGame) p.dmg += dealt;
    if (z.hp <= 0) {
      z.dead = true;
      this.zIndex.delete(z.id);
      if (p && p.inGame) { p.gold += Math.round(ZTYPES[z.t].gold * DIFFS[this.diff].gold * this.pc(p).st.gold * (this.mev && this.mev.k === 'moon' ? 2 : 1) * (z.el ? 4 : 1)); p.kills++; }
      (this.graves || (this.graves = [])).push([z.x, z.y]); if (this.graves.length > 30) this.graves.shift();
      if (z.el) this.drop(z.x, z.y);
      if (z.el === 2 || z.t === 18) { // exploding elite / frozen shatter
        const R = z.t === 18 ? 95 : 100;
        this.ev([z.t === 18 ? 'ic' : 'x', Math.round(z.x), Math.round(z.y), R]);
        for (const q of this.inGame()) if (q.alive && Math.hypot(q.x - z.x, q.y - z.y) < R) { this.hurt(q, z.t === 18 ? 8 : 16, z.t); if (z.t === 18) q.chillUntil = this.time + 2; }
      }
      if (p) { if (isBoss(z.t)) p.bk = (p.bk | 0) + 1; if (z.el) p.ek = (p.ek | 0) + 1; }
      this.ev(['d', Math.round(z.x), Math.round(z.y), z.t, p ? p.pid : 0, z.el | 0]);
      this.deathFx(z, p);
      if (z.t === 13) for (let i = 0; i < 4 && this.zombies.length < 520; i++) this.spawnAt(14, z.x, z.y);
      if (isBoss(z.t)) for (let i = 0; i < 4; i++) this.drop(z.x + (Math.random() - 0.5) * 80, z.y + (Math.random() - 0.5) * 80);
      else if (Math.random() < 0.05) this.drop(z.x, z.y);
      if (z.t === 5) this.burst(z, p);
    }
  }

  // map hazards: the metro's trains and the funfair's haunted house
  updateMap(dt) {
    const B = this.bounds, now = this.time;
    if (this.theme === 'metro') {
      if (this.trainAt == null) this.trainAt = now + 25 + Math.random() * 20;
      if (!this.train && now >= this.trainAt) {
        const L = METRO_TRACKS.filter((y) => y > B.y0 + 60 && y < B.y1 - 60);
        if (L.length) { const y = L[Math.floor(Math.random() * L.length)], dir = Math.random() < 0.5 ? 1 : -1; this.train = { y, dir, t: 3 }; this.ev(['tr', y, dir, 3]); }
        this.trainAt = now + 30 + Math.random() * 25;
      }
      if (this.train) {
        this.train.t -= dt;
        if (this.train.t <= 0) {
          const y = this.train.y;
          for (const q of this.inGame()) if (q.alive && Math.abs(q.y - y) < 56) { this.hurt(q, 55, 'tr'); this.knock(q, q.x, y, 700); }
          for (const z of this.zombies) if (!z.dead && Math.abs(z.y - y) < 50 + ZTYPES[z.t].r) this.damage(z, isBoss(z.t) ? 400 : 900, null);
          this.ev(['tx', y, this.train.dir]);
          this.train = null;
        }
      }
    } else if (this.theme === 'luna' && this.phase === 'combat') {
      if (this.hauntAt == null) this.hauntAt = now + 18;
      if (now >= this.hauntAt && this.queue.length) {
        this.hauntAt = now + 20 + Math.random() * 10;
        // a haunted house whose door is inside the playable area (the arena drifts, so the whole house may not be)
        const H = WORLD.obstacles.filter((o) => o.haunt && !outOfMap(o.x + o.w / 2, o.y + o.h + 30));
        if (H.length) {
          const o = H[Math.floor(Math.random() * H.length)], dx = o.x + o.w / 2, dy = o.y + o.h + 30;
          let out = 0;
          for (let i = 0; i < 4 && this.queue.length; i++) { const t = this.queue.shift(); if (this.spawnAt(t, dx, dy)) out++; else this.queue.push(t); } // no room at the door: it comes later the normal way
          if (out) this.ev(['hh', Math.round(dx), Math.round(dy)]);
        }
      }
    }
  }

  // map events: blackout, a supply plane, a runner horde or a blood moon
  updateMev() {
    if (this.mev && this.time >= this.mev.until) { this.mev = null; this.ev(['mv', '']); }
    if (this.mev || this.time < this.mevAt || this.queue.length < 6) return;
    this.mevAt = Infinity;
    const k = MEV_ORDER[Math.floor(Math.random() * MEV_ORDER.length)];
    this.mev = { k, until: this.time + MEV[k].dur };
    this.ev(['mv', k]);
    const alive = this.inGame().filter((p) => p.alive);
    if (k === 'drop' && alive.length) {
      const c = alive[Math.floor(Math.random() * alive.length)], a = Math.random() * Math.PI * 2;
      this.ev(['pl', Math.round(c.x), Math.round(c.y), r2(a)]);
      for (let i = 0, put = 0; i < 30 && put < 3 + alive.length; i++) {
        const x = c.x + (Math.random() - 0.5) * 320, y = c.y + (Math.random() - 0.5) * 320;
        if (pointInObstacle(x, y, 16) || outOfMap(x, y)) continue;
        this.items.push({ id: this.nextId++, k: put % 4, x: Math.round(x), y: Math.round(y), life: 30 }); put++;
      }
    } else if (k === 'horde') {
      const extra = Math.min(60, 10 + this.wave * 2) * Math.max(1, Math.round(Math.sqrt(this.waveN)));
      for (let i = 0; i < extra; i++) this.queue.unshift(1);
      this.hordeT = this.time + MEV.horde.dur;
    }
  }

  drop(x, y) {
    if (this.items.length >= 40) return;
    const r = Math.random();
    const k = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3;
    this.items.push({ id: this.nextId++, k, x: Math.round(x), y: Math.round(y), life: 25 });
  }

  updateItems(dt, paused) {
    const players = this.inGame().filter((p) => p.alive);
    for (const it of this.items) {
      if (!paused) it.life -= dt;
      for (const p of players) {
        const st = this.pc(p).st;
        if (Math.hypot(p.x - it.x, p.y - it.y) > PLAYER_R + 18 + 45 * st.mag) continue;
        let amount = 0;
        if (it.k === 0) { if (p.hp >= p.maxHp) continue; amount = Math.min(40, p.maxHp - p.hp); p.hp += amount; }
        else if (it.k === 1) { amount = Math.round((15 + this.wave * 2) * DIFFS[this.diff].gold * st.gold); p.gold += amount; }
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
    this.ev(['dn', p.pid, p.lastBy != null ? p.lastBy : -1]);
    this.checkOver();
  }

  // ---------- host migration ----------
  sendBackup() {
    const succ = this.successor();
    if (succ == null || !this.net.code) return;
    // only on an idle link: the backup must never hold up that player's snapshots (busy: try again in a second)
    if (this.net.idle ? !this.net.idle(succ) : (this.net.canSnap && !this.net.canSnap(succ))) { this.backupAcc = 4; return; }
    if (this.bkBusy) return;
    // rounded numbers and no per-hit bookkeeping: about a third of the size
    const j = JSON.stringify(this.backup(), (k, v) => (k === 'pend' || k === 'hitSet' || k === 'zsent' || k === 'zh' || k === '_c' ? undefined : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v));
    // build 59+ players get it gzipped (about 5x smaller); older ones the plain text they understand
    const sp = this.players.get(succ);
    if (sp && sp.build >= 59 && typeof CompressionStream === 'function') {
      this.bkBusy = true;
      gzip64(j).then((z) => { this.bkBusy = false; this.net.send(succ, { t: 'bk', z }); }, () => { this.bkBusy = false; this.net.send(succ, { t: 'bk', j }); });
    } else this.net.send(succ, { t: 'bk', j });
  }

  backup() {
    const keep = ['phase', 'wave', 'waveN', 'diff', 'mode', 'daily', 'mapPick', 'theme', 'seed', 'areaN', 'bounds', 'breakT', 'time', 'queue', 'spawnT', 'bossWave', 'nextId', 'hostPid', 'team', 'teamFund'];
    const st = {};
    for (const k of keep) st[k] = this[k];
    st.players = [...this.players.values()].map((p) => ({ ...p, _c: null }));
    st.zombies = this.zombies.filter((z) => !z.dead).map((z) => ({ ...z, hitSet: null }));
    st.turrets = this.turrets; st.mines = this.mines; st.items = this.items; st.spits = this.spits;
    st.walls = this.walls; st.zones = this.zones; st.bombs = this.bombs;
    return st;
  }

  // Continue a game from the previous host's backup. Everyone else is kept as "reconnecting" for a while.
  restore(st, myPid) {
    const keep = ['phase', 'wave', 'waveN', 'diff', 'mode', 'daily', 'mapPick', 'theme', 'seed', 'areaN', 'bounds', 'breakT', 'time', 'queue', 'spawnT', 'bossWave', 'nextId', 'team', 'teamFund'];
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
    this.walls = st.walls || []; this.zones = st.zones || []; this.bombs = st.bombs || [];
    if (!Array.isArray(this.team) || this.team.length !== TEAM.length) this.team = TEAM.map(() => 0);
    if (!Array.isArray(this.teamFund) || this.teamFund.length !== TEAM.length) this.teamFund = TEAM.map(() => 0);
    for (const p of this.players.values()) { p.lv = { ...newLv(), ...(p.lv || {}) }; if (!Array.isArray(p.inv)) p.inv = GEAR.map(() => 0); p._c = null; }
    this.shots = []; this.events = [];
    if (this.theme && (WORLD.theme !== this.theme || WORLD.seed !== this.seed)) {
      const map = generateMap(this.theme, this.seed);
      setMap(map.theme, map.seed, map.obstacles, map.decor); this.fieldKey = "";
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
        p.gold, p.kills, p.sp, lvArr(p.lv),
        Math.max(0, r1(p.abAt - this.time)), p.shopReady ? 1 : 0, this.time < p.shieldUntil ? 1 : 0,
        p.alive ? 0 : r2((p.rev || 0) / REVIVE_TIME),
        Math.max(0, r1(p.powerUntil - this.time)), Math.max(0, r1(p.hasteUntil - this.time)), p.wt, p.wp || 0, p.wb || 0, p.inv || [], Math.max(0, r1((p.chillUntil || 0) - this.time)),
        p.tm | 0, p.pk | 0, p.deaths | 0, !p.alive && p.respAt && p.respAt < Infinity ? Math.max(0, r1(p.respAt - this.time)) : 0,
        (p.protUntil > this.time ? 1 : 0) | (p.invUntil > this.time ? 2 : 0) | (p.silUntil > this.time ? 4 : 0) | (p.spinUntil > this.time ? 8 : 0) | (p.guardUntil > this.time ? 16 : 0), p.assists | 0,
        p.pid === this.hostPid ? 0 : Math.round(p.ping || 0), Math.ceil(p.bs || 0),
      ]);
    }
    const Z = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      const now = this.time;
      const fl = (z.slowUntil > now ? 1 : 0) | (z.stunT > 0 ? 2 : 0) | (z.psT > now ? 4 : 0) | (z.brT > now ? 8 : 0) | (z.frozenT > now ? 16 : 0) | (z.meltT > now ? 32 : 0) | (z.t === 11 && z.armor <= 0 ? 64 : 0) | (z.st === ZS.BURROW ? 128 : 0) | ((z.el | 0) << 8) | (z.rageT > now ? 2048 : 0) | (z.ally ? 4096 : 0);
      Z.push([z.id, z.t, Math.round(z.x), Math.round(z.y), Math.ceil(z.hp), z.st, z.st === ZS.WINDUP || z.st === ZS.DASH ? r2(z.cdir) : 0, z.t === 6 && z.face != null ? r2(z.face) : 0, fl]);
    }
    return {
      t: 's', ph: this.phase === 'combat' ? 'c' : 'b', w: this.wave, n: this.waveN, hm: DIFFS[this.diff].hp,
      B: [Math.round(this.bounds.x0), Math.round(this.bounds.y0), Math.round(this.bounds.x1), Math.round(this.bounds.y1)],
      bt: Math.max(0, Math.ceil(this.breakT)), zl: this.queue.length + Z.length,
      P, Z,
      T: this.turrets.map((t) => [t.id, Math.round(t.x), Math.round(t.y), r2(t.a), Math.min(99, Math.ceil(t.life)), t.k || 0, t.hp != null ? Math.max(0, Math.round(100 * t.hp / t.mhp)) : 100]),
      M: this.mines.map((m) => [m.id, Math.round(m.x), Math.round(m.y), m.arm <= 0 ? 1 : 0]),
      Q: this.spits.map((s) => [s.id, Math.round(s.x), Math.round(s.y)]),
      I: this.items.map((it) => [it.id, it.k, it.x, it.y, Math.ceil(it.life)]),
      W: this.walls.map((q) => [q.id, q.x, q.y, q.a, Math.max(0, Math.round((q.hp / q.max) * 100))]),
      F: this.zones.map((q) => [q.id, q.k, q.x, q.y, q.r, r1(q.life / q.max)]),
      TM: [this.team, this.teamFund, TEAM.map((t, i) => (this.team[i] < t.cost.length ? teamCost(i, this.team[i], this.inGame().length) : 0))],
      V: this.mev ? [this.mev.k, Math.max(0, r1(this.mev.until - this.time))] : 0,
      PV: this.mode === 'pvp' ? this.pvpSnap() : 0,
      S: this.shots, E: this.events,
    };
  }
}

Object.assign(HostGame.prototype, PvpMixin);
