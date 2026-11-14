// Zombies on the host: spawning, the per-zombie brain (chasing, special attacks, bosses), crowd pushing, wandering,
// spit, shields and zombies the Hacker turned to our side. These methods are added to HostGame (see host.js).
import { WORLD_W, DIFFS, PLAYER_R, ZTYPES, zMaxHp, ZS, isBoss, CHARGE, SHIELD_ARC, BOSS_DMG, BOSS_CD, clamp } from './config.js';
import { WORLD, moveCircle, pointInObstacle, clearLine, fieldAhead, fieldAt, outOfMap, escapePocket } from './world.js';
import { GOLDEN } from './host-util.js';

export const ZombieMixin = {

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
  },

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
  },

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
  },

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
  },

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
  },

  spit(z, a, spd) {
    const r = ZTYPES[z.t].r;
    this.spits.push({ id: this.nextId++, x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 2.2, boss: isBoss(z.t) });
  },

  // A Patlayan bursts: hurts nearby players and other zombies. byPlayer: who killed it, if anyone.
  burst(z, byPlayer) {
    if (z.burst) return;
    z.burst = true;
    const R = 110;
    this.ev(['x', Math.round(z.x), Math.round(z.y), R]);
    for (const p of this.inGame()) if (p.alive && Math.hypot(p.x - z.x, p.y - z.y) < R) { this.hurt(p, (byPlayer ? 12 : 30) * (p.cls === 'alevci' || p.cls === 'bombaci' ? 0.5 : 1), z.t); this.knock(p, z.x, z.y, 420); }
    if (!z.dead) this.damage(z, z.hp + 1, null);
    for (const o of this.zombies) if (o !== z && !o.dead && Math.hypot(o.x - z.x, o.y - z.y) < R + ZTYPES[o.t].r) this.damage(o, 60, byPlayer);
  },

  // Bullets and turret fire from the front don't hurt a Kalkanlı.
  shielded(z, fromX, fromY) {
    if (z.t !== 6 || z.face == null || z.stunT > 0) return false;
    let d = Math.atan2(fromY - z.y, fromX - z.x) - z.face;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) < SHIELD_ARC;
  },

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
  },

  wander(z, T, dt) {
    z.cdir += (Math.random() - 0.5) * dt * 2;
    moveCircle(z, Math.cos(z.cdir) * T.spd * 0.3 * dt, Math.sin(z.cdir) * T.spd * 0.3 * dt, T.r);
  },

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
  },
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
  },
};
