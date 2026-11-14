// Fighting on the host: guest hits (checked against what the weapon can do), damage and kills, on-hit effects
// (burning, poison, chains, marks), abilities, the bash, one-use items, bombs, players going down and being revived.
// These methods are added to HostGame (see the bottom of host.js).
import { DIFFS, PLAYER_R, CLASSES, ZTYPES, ZS, isBoss, BOSS_DMG, BASH, weaponOf, abDur, GEAR, GEAR_RANGE, bashCd, stats, clamp } from './config.js';
import { WORLD, pointInObstacle } from './world.js';
import { num, r2, REVIVE_R, REVIVE_TIME } from './host-util.js';

export const CombatMixin = {

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
  },

  // ---- path effects that need more than one line ----
  // mark a zombie (and, with a radius, the zombies around it): it takes more damage from everyone
  markAt(z, k, dur, r, f) {
    const now = this.time;
    const one = (o) => { o.markT = now + dur; o.markK = Math.max(o.markT > now && o.markK ? o.markK : 1, k); if (f.markTur) o.markTur = f.markTur; if (f.markDog) o.markDog = f.markDog; if (f.slow && f.mark) { o.slowUntil = Math.max(o.slowUntil || 0, now + 0.6); o.slowK = Math.min(o.slowK || 1, f.slowK || 0.7); } };
    one(z);
    if (r) for (const o of this.zombies) if (!o.dead && o !== z && Math.hypot(o.x - z.x, o.y - z.y) < r) one(o);
  },
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
  },
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
  },

  ignite(z, v, dur, pid, napalm, boom) {
    const now = this.time;
    z.brD = z.brT > now ? Math.max(z.brD, v) : v;
    z.brT = now + dur; z.brO = pid; z.brN = napalm; z.brB = boom;
  },

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
  },

  addZone(k, x, y, r, life, dps, owner, slow) {
    const mine = this.zones.filter((q) => q.owner === owner);
    if (mine.length >= 8) this.zones.splice(this.zones.indexOf(mine[0]), 1);
    if (this.zones.length >= 30) this.zones.shift();
    this.zones.push({ id: this.nextId++, k, x: Math.round(x), y: Math.round(y), r, life, max: life, dps, owner, slow: !!slow });
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  // ---------- anti-cheat: the host watches each player's hits and movement and only reports what looks impossible ----------
  // (nothing happens to the player; the owner sees the report in the panel)
  acStrike(p, kind, detail) {
    const now = this.time, A = p.ac || (p.ac = {});
    const k = A[kind] || (A[kind] = { n: 0, t0: now, sent: -999 });
    if (now - k.t0 > 60) { k.n = 0; k.t0 = now; }
    k.n++;
    if (k.n >= 3 && now - k.sent > 60) { k.sent = now; k.n = 0; if (this.onCheat) this.onCheat({ name: p.name, acct: p.acct || '', kind, detail: String(detail).slice(0, 80), wave: this.wave }); }
  },
  // the biggest single hit and the farthest reach a guest's weapon can have (generous: power-up, crit, focus, rage,
  // ricochets and long shots all fit; a hacked client sending 5000 damage across the map does not)
  hitCap(p) {
    const C = this.pc(p), key = C.key;
    if (p._hc && p._hc.key === key) return p._hc;
    const w = weaponOf(p.cls, p.wt, p.wp, p.wb), reach = w.kind === 'm' ? (w.reach || 100) * 2.5 + 200 : Math.max(500, (w.bspd || 900) * (w.life || 0.7)) * 2 + 400;
    p._hc = { key, d: C.st.dmg * (w.pelDmg || 1) * 2 * 3.2 * 2.6 * 1.3 + 40, r2: reach * reach };
    return p._hc;
  },
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
  },
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
  },

  knock(p, fromX, fromY, power) {
    p.kbAt = this.time;
    const d = Math.hypot(p.x - fromX, p.y - fromY) || 1;
    this.ev(['kb', p.pid, Math.round(((p.x - fromX) / d) * power), Math.round(((p.y - fromY) / d) * power)]);
  },

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
  },

  down(p) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    p.downs++;
    this.ev(['dn', p.pid, p.lastBy != null ? p.lastBy : -1]);
    this.checkOver();
  },

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
  },

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
  },
};
