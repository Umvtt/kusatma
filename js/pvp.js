// PvP on the host: teams, spawns, damage between players, kills, respawns, scores, rounds and the end of a match.
// These methods are added to HostGame (see the bottom of host.js); in PvE none of them run.
import { MAP_ORDER, PVP, PVP_WARM, PVP_HP, PVP_DMG, PVP_GOLD, PVP_PROT, CX, CY, WORLD_W, WORLD_H, PLAYER_R, stats, clamp, newLv, GEAR } from './config.js';
import { WORLD, setMap, setBounds, freeSpot } from './world.js';
import { generateMap } from './mapgen.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// the playable rectangle for a PvP match: smaller than co-op so fights find each other
export function pvpArea(kind, n) {
  if (kind === 'duel') return { w: 1700, h: 1100 };
  const k = Math.max(0, n - 2);
  return { w: Math.min(WORLD_W - 200, 2300 + k * 150), h: Math.min(WORLD_H - 200, 1450 + k * 95) };
}

export const PvpMixin = {
  isPvp() { return this.mode === 'pvp'; },
  // FFA: everyone is their own team (the pid); duel and tdm use 0 and 1
  foe(a, b) { return this.mode === 'pvp' && !!a && !!b && a !== b && (this.pvp === 'ffa' || a.tm !== b.tm); },
  ally(a, b) { return this.mode !== 'pvp' || a === b || (this.pvp !== 'ffa' && a.tm === b.tm); },
  foesOf(p) {
    if (this.mode !== 'pvp' || !p || this.phase !== 'combat') return [];
    const now = this.time;
    return this.inGame().filter((q) => q.alive && this.foe(p, q) && !(q.protUntil > now));
  },

  // a new player in a PvP lobby joins the smaller team
  pvpTeamFor(p) {
    if (this.pvp === 'ffa') return 0;
    const c = [0, 0];
    for (const q of this.players.values()) if (q !== p && (q.tm === 0 || q.tm === 1)) c[q.tm]++;
    return c[0] <= c[1] ? 0 : 1;
  },
  pvpBalance() {
    if (this.pvp === 'ffa') return;
    const all = [...this.players.values()];
    if (this.pvp === 'duel') { all.forEach((p, i) => { p.tm = i % 2; }); return; }
    // keep everyone's pick when the teams are even enough, otherwise move the newest players over
    const t = [all.filter((p) => p.tm === 0), all.filter((p) => p.tm === 1)];
    for (const p of all) if (p.tm !== 0 && p.tm !== 1) { const s = t[0].length <= t[1].length ? 0 : 1; p.tm = s; t[s].push(p); }
    while (Math.abs(t[0].length - t[1].length) > 1) {
      const big = t[0].length > t[1].length ? 0 : 1, mv = t[big].sort((a, b) => b.pid - a.pid).shift();
      mv.tm = 1 - big; t[1 - big].push(mv);
    }
  },

  startPvp() {
    for (const q of this.players.values()) q.zh = null;
    this.resetWorld();
    this.theme = this.mapPick === 'rastgele' ? MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)] : this.mapPick;
    this.seed = (Math.random() * 2 ** 31) | 0;
    const map = generateMap(this.theme, this.seed);
    setMap(map.theme, map.seed, map.obstacles, map.decor);
    this.pvpBalance();
    const a = pvpArea(this.pvp, this.players.size);
    this.bounds = { x0: CX - a.w / 2, y0: CY - a.h / 2, x1: CX + a.w / 2, y1: CY + a.h / 2 };
    setBounds(this.bounds.x0, this.bounds.y0, this.bounds.x1, this.bounds.y1);
    // clear a lane at each spawn so nobody starts inside a wall
    this.score = [0, 0];
    this.rounds = [0, 0];
    this.round = 0;
    this.pvT = PVP[this.pvp].time;
    this.matchT = 0;
    for (const p of this.players.values()) {
      this.pvpEnter(p);
      if (p.ghost) { p.wasInGame = true; p.inGame = false; }
    }
    this.pvpWarm(PVP_WARM);
    this.pushRoster();
  },

  // a player joins the match (at the start, or late)
  pvpEnter(p) {
    if (p.tm == null || (this.pvp !== 'ffa' && p.tm !== 0 && p.tm !== 1)) p.tm = this.pvpTeamFor(p);
    p.lv = newLv();
    p.inv = GEAR.map(() => 0);
    p.wt = 0; p.wp = 0; p.wb = 0;
    p.abUntil = 0; p.useAt = 0; p.given = 0; p.abAt = 0; p.shieldUntil = 0; p.rev = 0; p.bashAt = 0;
    p.powerUntil = 0; p.hasteUntil = 0; p.revives = 0; p.downs = 0; p.picks = 0; p.a = p.tm === 1 ? Math.PI : 0;
    p.kills = 0; p.dmg = 0; p.pk = 0; p.deaths = 0; p.assists = 0; p.streak = 0; p.best = 0;
    p.hitBy = new Map();
    p.gold = PVP_GOLD.start; p.spent = 0;
    // someone who comes in late gets the gold the others have earned on average, so they can buy
    const o = this.inGame().filter((q) => q !== p);
    if (o.length && this.phase === 'combat') p.gold = Math.max(p.gold, Math.round(o.reduce((s, q) => s + this.worth(q), 0) / o.length));
    p.shopReady = false; p.ready = false;
    p.inGame = true;
    p.invUntil = 0; p.silUntil = 0; p.spinUntil = 0; p.chillUntil = 0; p.dot = null;
    this.pvpSpawn(p);
  },

  // where someone (re)appears: their team's side in tdm/duel, the spot furthest from everyone in ffa
  pvpSpawnPoint(p) {
    const B = this.bounds, w = B.x1 - B.x0, h = B.y1 - B.y0;
    const foes = this.inGame().filter((q) => q !== p && q.alive && this.foe(p, q));
    const far = (x, y) => foes.reduce((m, q) => Math.min(m, Math.hypot(q.x - x, q.y - y)), 1e9);
    let best = null, bs = -1;
    for (let i = 0; i < 14; i++) {
      let x, y;
      if (this.pvp === 'ffa') { x = B.x0 + 120 + Math.random() * (w - 240); y = B.y0 + 120 + Math.random() * (h - 240); }
      else {
        const side = p.tm === 1 ? 1 : 0, edge = Math.min(380, w * 0.16);
        x = side ? B.x1 - 90 - Math.random() * edge : B.x0 + 90 + Math.random() * edge;
        y = CY + (Math.random() - 0.5) * h * (this.pvp === 'duel' ? 0.3 : 0.6);
      }
      const s = freeSpot(x, y, PLAYER_R + 4);
      if (!s) continue;
      const sc = far(s.x, s.y) + Math.random() * 60;
      if (sc > bs) { bs = sc; best = s; }
    }
    return best || freeSpot(CX, CY, PLAYER_R + 4) || { x: CX, y: CY };
  },
  pvpSpawn(p) {
    const s = this.pvpSpawnPoint(p);
    p.x = s.x; p.y = s.y;
    p.maxHp = Math.round(stats(p.cls, p.lv).maxHp * PVP_HP);
    p.hp = p.maxHp;
    p.alive = true;
    p.respAt = 0;
    p.protUntil = this.time + PVP_PROT;
    p.invUntil = 0; p.spinUntil = 0; p.chillUntil = 0; p.dot = null;
    p.hitBy = new Map();
    p.a = p.tm === 1 && this.pvp !== 'ffa' ? Math.PI : p.a;
    p.sp = (p.sp || 0) + 1; // tells the player's screen to jump to the new place
  },

  // shopping time before the fight (and between duel rounds); nobody can be hurt
  pvpWarm(t) {
    this.phase = 'break';
    this.breakT = t;
    for (const p of this.inGame()) { p.shopReady = false; p.protUntil = this.time + t + PVP_PROT; }
    this.ev(['vw', this.round, Math.round(t)]);
  },
  pvpFight() {
    this.phase = 'combat';
    this.round++;
    if (this.pvp === 'duel') this.pvT = PVP.duel.time;
    for (const p of this.inGame()) { p.protUntil = this.time + 0.5; p.shopReady = false; }
    this.ev(['vf', this.round]);
    this.pushRoster();
  },

  // ---------- damage between players ----------
  pvpDamage(att, vic, d, tag = 0) {
    if (!vic || !vic.alive || !vic.inGame || this.phase !== 'combat' || !(d > 0)) return 0;
    const now = this.time;
    if (vic.protUntil > now) return 0;
    if (att && !this.foe(att, vic)) return 0;
    const sprint = vic.cls === 'izci' && (vic.lv.ab | 0) >= 3 && now < vic.abUntil;
    // weapon levels are tuned for zombie hordes: against players each level counts for less, so fights stay a few seconds long
    const k = PVP_DMG * (now < vic.shieldUntil ? 0.3 : 1) * this.pc(vic).st.armor * (sprint ? 0.4 : 1) * (vic.spinUntil > now ? 0.6 : 1) / (1 + 0.25 * ((att && att.wt) | 0));
    let hit = d * k;
    if (vic.bs > 0) { const a = Math.min(vic.bs, hit); vic.bs -= a; hit -= a; }
    const dealt = Math.min(vic.hp, hit);
    vic.hp -= hit;
    vic.lastHurt = now;
    if (att) {
      att.dmg += dealt;
      vic.hitBy.set(att.pid, now);
      // the Kılıççı heals from his own sword hits
      if (tag === 9 && att.cls === 'kilicci' && att.alive) att.hp = Math.min(att.maxHp, att.hp + dealt * 0.12);
      // an Ajan who strikes from the shadows shows himself
      if (att.invUntil > now) { att.invUntil = now; this.ev(['iv', att.pid, 0]); }
    }
    if (vic.invUntil > now && hit > 0 && tag !== 5) { vic.invUntil = now; this.ev(['iv', vic.pid, 0]); }
    this.ev(['vh', vic.pid, att ? att.pid : 0, Math.round(hit)]);
    if (vic.hp <= 0) this.pvpKill(att, vic, tag);
    return dealt;
  },
  // splash from things on the ground (grenades, mines, fire, gas, the Alevci's blast)
  pvpArea(att, x, y, r, d, tag = 0) {
    if (this.mode !== 'pvp' || !att) return;
    for (const q of this.foesOf(att)) if (Math.hypot(q.x - x, q.y - y) < r + PLAYER_R) this.pvpDamage(att, q, d, tag);
  },

  pvpKill(att, vic, tag) {
    vic.alive = false; vic.hp = 0; vic.deaths++; vic.streak = 0;
    vic.invUntil = 0; vic.spinUntil = 0; vic.dot = null;
    const now = this.time;
    vic.respAt = this.pvp === 'duel' ? Infinity : now + PVP[this.pvp].resp;
    // turrets, mines and coils go with their owner
    this.turrets = this.turrets.filter((t) => t.owner !== vic.pid || t.k === 1 || t.k === 5);
    this.mines = this.mines.filter((m) => m.owner !== vic.pid);
    if (att && att !== vic) {
      att.pk++; att.kills++; att.streak++; att.best = Math.max(att.best, att.streak);
      att.gold += PVP_GOLD.kill + (vic.streak >= 3 ? 100 : 0);
      if (this.pvp === 'tdm') this.score[att.tm]++;
    }
    // everyone else who hurt them in the last 8 seconds gets an assist
    for (const [pid, t] of vic.hitBy) {
      if (now - t > 8 || (att && pid === att.pid)) continue;
      const q = this.players.get(pid);
      if (q && q.inGame) { q.assists++; q.gold += PVP_GOLD.assist; }
    }
    vic.hitBy = new Map();
    this.ev(['vk', att ? att.pid : 0, vic.pid, tag | 0, att ? att.streak : 0]);
    if (this.pvp === 'duel') { this.pvpRoundEnd(att && att !== vic ? att.tm : 1 - vic.tm); return; }
    const G = PVP[this.pvp].goal;
    if (this.pvp === 'tdm' && att && this.score[att.tm] >= G) this.pvpEnd(att.tm);
    else if (this.pvp === 'ffa' && att && att.pk >= G) this.pvpEnd(att.pid);
  },

  pvpRoundEnd(winTm) {
    if (winTm === 0 || winTm === 1) this.rounds[winTm]++;
    this.ev(['vr', this.round, winTm == null ? -1 : winTm, this.rounds[0], this.rounds[1]]);
    if (this.rounds[0] >= PVP.duel.goal || this.rounds[1] >= PVP.duel.goal) { this.pvpEnd(this.rounds[0] > this.rounds[1] ? 0 : 1, 2.5); return; }
    // a short pause, then both come back full and can shop again
    this.roundPause = 2.5;
  },

  // the winner: a team (tdm, duel) or a pid (ffa); -1 is a draw
  pvpEnd(win, delay = 0) {
    if (this.phase === 'over' || this.pvpOver) return;
    if (delay) { this.pvpOver = { win, t: delay }; return; }
    this.phase = 'over';
    this.pvpOver = null;
    const P = this.inGame().concat([...this.players.values()].filter((p) => !p.inGame && p.wasInGame))
      .map((p) => ({ pid: p.pid, name: p.name, cls: p.cls, color: p.color, tm: p.tm | 0, pk: p.pk | 0, dth: p.deaths | 0, as: p.assists | 0, dmg: Math.round(p.dmg || 0), best: p.best | 0, kills: p.pk | 0, acct: p.acct || '' }))
      .sort((a, b) => b.pk - a.pk || a.dth - b.dth);
    this.out({ t: 'o', pvp: { k: this.pvp, win, score: this.score, rounds: this.rounds }, P, time: Math.round(this.matchT), wave: 0, diff: this.diff, theme: this.theme });
    this.pushRoster();
  },

  // time ran out: whoever leads wins
  pvpTimeUp() {
    if (this.pvp === 'duel') {
      const [a, b] = [0, 1].map((t) => this.inGame().find((p) => p.tm === t));
      const ha = a && a.alive ? a.hp / a.maxHp : 0, hb = b && b.alive ? b.hp / b.maxHp : 0;
      this.pvpRoundEnd(Math.abs(ha - hb) < 0.02 ? null : ha > hb ? 0 : 1);
      return;
    }
    if (this.pvp === 'tdm') { this.pvpEnd(this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1); return; }
    const L = this.inGame().sort((a, b) => b.pk - a.pk);
    this.pvpEnd(L.length && (L.length < 2 || L[0].pk > L[1].pk) ? L[0].pid : -1);
  },

  tickPvp(dt) {
    this.time += dt;
    if (this.pvpOver) { this.pvpOver.t -= dt; if (this.pvpOver.t <= 0) { const w = this.pvpOver.win; this.pvpOver = null; this.pvpEnd(w); } return; }
    if (this.phase === 'break') {
      this.breakT -= dt;
      this.updateRegen(dt);
      this.updateTurrets(dt);
      if (this.breakT <= 0) this.pvpFight();
      return;
    }
    this.matchT += dt;
    if (this.roundPause > 0) {
      this.roundPause -= dt;
      if (this.roundPause <= 0) {
        this.roundPause = 0;
        this.turrets = this.turrets.filter((t) => t.k === 1 || t.k === 5); this.mines = []; this.zones = []; this.bombs = []; this.walls = [];
        for (const p of this.inGame()) { this.pvpSpawn(p); p.abAt = 0; p.gold += PVP_GOLD.round; }
        this.pvpWarm(8);
      }
      return;
    }
    this.pvT -= dt;
    if (this.pvT <= 0) { this.pvT = 0; this.pvpTimeUp(); if (this.phase !== 'combat') return; }
    const now = this.time;
    for (const p of this.inGame()) {
      if (!p.alive && p.respAt && now >= p.respAt) this.pvpSpawn(p);
      if (p.alive && p.dot && p.dot.until > now) {
        const att = this.players.get(p.dot.att);
        this.pvpDamage(att && att.inGame ? att : null, p, p.dot.dps * dt / PVP_DMG, 5);
      }
    }
    this.updateRegen(dt);
    this.updateTurrets(dt);
    this.updateMines(dt);
    this.updateBombs(dt);
    this.updateDots(dt);
    this.updateWalls(dt);
    this.updateSpin(dt);
    // a team with nobody left forfeits
    if (this.pvp !== 'ffa') {
      const t = [0, 1].map((k) => this.inGame().some((p) => p.tm === k && !p.ghost));
      if (!t[0] || !t[1]) this.pvpEnd(t[0] ? 0 : t[1] ? 1 : -1);
    } else if (this.inGame().length < 2) this.pvpEnd(this.inGame()[0] ? this.inGame()[0].pid : -1);
  },

  // hits a player's screen reports on other players: checked for range and size, then applied
  pvpHits(p, list) {
    if (!p.alive || this.phase !== 'combat' || !Array.isArray(list) || list.length > 24) return;
    const C = this.pc(p), st = C.st, now = this.time;
    const maxHit = st.dmg * 2 * 3.2 * 2.6 * 1.3 + 60;
    const W = p.pvW || (p.pvW = { t: now, d: 0 });
    if (now - W.t > 1) { W.t = now; W.d = 0; }
    const cap = Math.max(400, C.dps * 5);
    for (const h of list) {
      if (!Array.isArray(h) || h.length < 2 || h.length > 3) continue;
      const [pid, d] = h, tag = h[2] | 0;
      if (!Number.isInteger(pid) || !num(d) || d <= 0 || d > maxHit) continue;
      const q = this.players.get(pid);
      if (!q || !this.foe(p, q) || !q.alive) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) > 1700) continue;
      if (W.d + d > cap) { this.acStrike(p, 'atış', 'PvP: saniyede çok fazla hasar'); break; }
      W.d += d;
      this.pvpDamage(p, q, d, tag);
      // path effects on players: ice slows, fire and poison keep hurting for a moment
      if (q.alive) {
        const fx = C.fx || {};
        if (fx.slow || fx.frost) q.chillUntil = Math.max(q.chillUntil || 0, now + 1.2);
        else if (fx.burn || fx.poison || fx.bleed) q.dot = { dps: Math.min(30, d * 0.25), until: now + 2.5, att: p.pid };
      }
    }
  },

  // what the screens need to draw the match
  pvpSnap() {
    return [this.pvp, Math.max(0, Math.ceil(this.pvT || 0)), this.score[0], this.score[1], this.rounds[0], this.rounds[1], this.round, this.roundPause > 0 || this.pvpOver ? 1 : 0];
  },
};
