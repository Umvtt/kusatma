// The host's browser runs this: zombies, waves, damage, gold and upgrades.
// Every incoming message is checked for shape and size so bad data can't crash the game.
import { WORLD_W, WORLD_H, CX, CY, areaFor, MAPS, MAP_ORDER, DIFFS, MAX_PLAYERS, VERSION, NAME_MAX,  PLAYER_COLORS, QUICK, CLASSES,    ZTYPES,  scaleFor, ZS, BOSS_ORDER, isBoss,   BOSS_DMG,        weaponOf,  newLv, lvArr,   GEAR,  TEAM, teamCost,     FIRST_BREAK, BREAK_TIME, START_GOLD, stats, clamp, MODE_ORDER, dailyRules, MEV, MEV_ORDER, PVP_ORDER } from './config.js';
import { PvpMixin } from './pvp.js';
import { CombatMixin } from './host-combat.js';
import { ZombieMixin } from './host-zombies.js';
import { GearMixin } from './host-gear.js';
import { num, r1, r2, SNAP_RATE, GHOST_MS, token,   REVIVE_TIME } from './host-util.js';
import { gzip64 } from './net.js';
import { packZ, packFar, rowDelta } from './pack.js';
import { WORLD, setMap, setBounds,    buildField,    GW, GH } from './world.js';
import { generateMap } from './mapgen.js';
import { ITEMS as COS, checkPass, ownsCls, nkey } from './catalog.js';


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

Object.assign(HostGame.prototype, PvpMixin, CombatMixin, ZombieMixin, GearMixin);
// (the rule-book is split by subject: host-combat.js, host-zombies.js, host-gear.js and pvp.js add their methods here)

export { REVIVE_R, REVIVE_TIME } from './host-util.js';
