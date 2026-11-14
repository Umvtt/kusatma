// Things players put on the field and buy: the armory, walls, turrets, drones, mines, the dog, the spinning blade,
// pick-ups, plus the map's own events (trains, map events). These methods are added to HostGame (see host.js).
import { DIFFS, PLAYER_R, CLASSES, UPGRADES, HEAL_COST, upgradeCost, ZTYPES, ZS, isBoss, WEAPON_COST, ITEMS, WMAX, BRANCH_SWAP, weaponSpent, pathOk, AB_COST, GEAR, TEAM, teamCost, TEAM_CHUNK, gearCost, gearMax, stats, clamp, MEV, MEV_ORDER } from './config.js';
import { WORLD, moveCircle, pointInObstacle, clearLine, outOfMap } from './world.js';
import { METRO_TRACKS } from './mapgen.js';
import { r2 } from './host-util.js';

export const GearMixin = {

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
  },

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
  },

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
  },

  updateWalls(dt) {
    for (const q of this.walls) {
      q.life -= dt;
      if (q.hp <= 0 || q.life <= 0) { q.gone = true; this.ev(['wb', q.x, q.y, r2(q.a)]); }
    }
    this.walls = this.walls.filter((q) => !q.gone);
  },

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
  },

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
  },

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
  },

  // a Hacker near a turret, drone or coil on their side makes it hit 25 % harder
  netBoost(t) {
    const o = this.players.get(t.owner);
    for (const q of this.inGame()) if (q.cls === 'hacker' && q.alive && this.ally(q, o || q) && Math.hypot(q.x - t.x, q.y - t.y) < 350) return 1.25;
    return 1;
  },
  // the nearest zombie (or enemy in PvP) to a point, for the dog
  nearTarget(p, x, y, r, skip) {
    let best = null, bd = r * r;
    for (const z of this.zombies) { if (z.dead || z.ally || z.st === ZS.BURROW || z.id === skip) continue; const d = (z.x - x) ** 2 + (z.y - y) ** 2; if (d < bd) { bd = d; best = z; } }
    for (const q of this.foesOf(p)) { if (q.invUntil > this.time) continue; const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
    return best ? (best.pid != null ? 'p' + best.pid : best.id) : null;
  },
  // the dog appears at its owner's side (never inside a wall)
  dogHeel(t, owner) {
    for (let i = 0; i < 8; i++) {
      const a = owner.a + Math.PI + (t.slot ? 0.7 : -0.7) + i * 0.8, x = owner.x + Math.cos(a) * 34, y = owner.y + Math.sin(a) * 34;
      if (!pointInObstacle(x, y, 9) && !outOfMap(x, y)) { t.x = x; t.y = y; t.tg = null; return; }
    }
    t.x = owner.x; t.y = owner.y; t.tg = null;
  },
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
  },
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
  },

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
  },

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
  },

  drop(x, y) {
    if (this.items.length >= 40) return;
    const r = Math.random();
    const k = r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3;
    this.items.push({ id: this.nextId++, k, x: Math.round(x), y: Math.round(y), life: 25 });
  },

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
  },
};
