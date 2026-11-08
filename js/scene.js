// The animated battle behind the main menu: a small squad in the middle of a plaza holding off zombies at night.
import { drawCharacter } from './render.js';

const SQUAD = [['asker', '#ff8a3d'], ['doktor', '#4cc9f0'], ['nisanci', '#9ef01a'], ['alevci', '#f15bb5']];

export function startScene(cv) {
  const S = { t: 0, z: [], shots: [], blood: [], flames: [], raf: 0, last: 0, props: [], squad: [] };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, cx = 0, cy = 0;
  const size = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W * (W > 900 ? 0.585 : 0.5); cy = W > 900 ? H * 0.8 : H + 70;
    S.squad = SQUAD.map(([cls, color], i) => { const a = i / SQUAD.length * Math.PI * 2 + 0.6; return { cls, color, x: cx + Math.cos(a) * 34, y: cy + Math.sin(a) * 34, aim: a, cool: Math.random() * 0.5, walk: 0 }; });
    // a few crates and concrete blocks around the plaza, from a fixed seed so it never jumps around
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    S.props = [];
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W, y = rnd() * H;
      if (Math.hypot(x - cx, y - cy) < 170) continue;
      S.props.push({ x, y, w: 28 + rnd() * 50, h: 22 + rnd() * 30, k: rnd() < 0.5 ? 'crate' : 'block', r: (rnd() - 0.5) * 0.4 });
    }
  };
  size();
  addEventListener('resize', size);

  function spawn() {
    const side = Math.floor(Math.random() * 4), m = 40;
    const x = side === 0 ? -m : side === 1 ? W + m : Math.random() * W;
    const y = side === 2 ? -m : side === 3 ? H + m : Math.random() * H;
    const big = Math.random() < 0.08;
    S.z.push({ x, y, hp: big ? 9 : 2 + Math.floor(Math.random() * 2), s: big ? 18 : 22 + Math.random() * 22, big, w: Math.random() * 10, a: 0, dead: 0 });
  }
  function step(dt) {
    S.t += dt;
    if (S.z.length < (W > 900 ? 26 : 14) && Math.random() < dt * 4) spawn();
    for (const z of S.z) {
      if (z.dead) { z.dead += dt; continue; }
      const dx = cx - z.x, dy = cy - z.y, d = Math.hypot(dx, dy) || 1;
      if (d > 70) { z.x += (dx / d) * z.s * dt; z.y += (dy / d) * z.s * dt; z.w += dt * 6; }
      z.a = Math.atan2(dy, dx);
      if (d < 75) { z.hp -= dt * 2; if (z.hp <= 0) kill(z); }
    }
    S.z = S.z.filter((z) => z.dead < 0.7);
    for (const p of S.squad) {
      let best = null, bd = 1e9;
      for (const z of S.z) { if (z.dead || z.claimed === p) continue; const d = Math.hypot(z.x - p.x, z.y - p.y); if (d < bd) { bd = d; best = z; } }
      if (!best) continue;
      const want = Math.atan2(best.y - p.y, best.x - p.x);
      let da = want - p.aim; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      p.aim += da * Math.min(1, dt * 5);
      p.cool -= dt;
      const range = p.cls === 'alevci' ? 170 : p.cls === 'nisanci' ? 900 : 520;
      if (p.cool <= 0 && Math.abs(da) < 0.2 && bd < range) {
        p.cool = p.cls === 'nisanci' ? 1.1 : p.cls === 'alevci' ? 0.08 : p.cls === 'doktor' ? 0.22 : 0.35;
        const mx = p.x + Math.cos(p.aim) * 30, my = p.y + Math.sin(p.aim) * 30;
        if (p.cls === 'alevci') { S.flames.push({ x: mx, y: my, vx: Math.cos(p.aim + (Math.random() - 0.5) * 0.3) * 260, vy: Math.sin(p.aim + (Math.random() - 0.5) * 0.3) * 260, life: 0.5 }); best.hp -= 0.25; }
        else { S.shots.push({ x: mx, y: my, tx: best.x, ty: best.y, life: 0.07, sn: p.cls === 'nisanci' }); best.hp -= p.cls === 'nisanci' ? 5 : 1; }
        if (best.hp <= 0) kill(best);
      }
    }
    for (const s of S.shots) s.life -= dt;
    S.shots = S.shots.filter((s) => s.life > 0);
    for (const f of S.flames) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }
    S.flames = S.flames.filter((f) => f.life > 0);
    for (const b of S.blood) b.life -= dt * 0.05;
    S.blood = S.blood.filter((b) => b.life > 0);
  }
  function kill(z) {
    if (z.dead) return;
    z.dead = 0.001;
    if (S.blood.length < 60) S.blood.push({ x: z.x, y: z.y, r: (z.big ? 22 : 12) + Math.random() * 8, life: 1 });
  }
  function draw() {
    const g = cv.getContext('2d');
    g.fillStyle = '#0c100e'; g.fillRect(0, 0, W, H);
    // paving and road markings
    g.strokeStyle = 'rgba(255,255,255,0.025)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 56) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 56) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (const b of S.blood) { g.fillStyle = `rgba(90,10,14,${0.55 * b.life})`; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); }
    for (const o of S.props) {
      g.save(); g.globalAlpha = 0.55; g.translate(o.x, o.y); g.rotate(o.r);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-o.w / 2 + 4, -o.h / 2 + 5, o.w, o.h);
      if (o.k === 'crate') { g.fillStyle = '#4a3a24'; g.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); g.strokeStyle = '#2c2214'; g.lineWidth = 2; g.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); g.beginPath(); g.moveTo(-o.w / 2, -o.h / 2); g.lineTo(o.w / 2, o.h / 2); g.moveTo(o.w / 2, -o.h / 2); g.lineTo(-o.w / 2, o.h / 2); g.stroke(); }
      else { g.fillStyle = '#3a403c'; g.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); g.fillStyle = 'rgba(214,182,92,0.5)'; for (let i = -o.w / 2; i < o.w / 2 - 6; i += 12) g.fillRect(i, o.h / 2 - 5, 6, 3); }
      g.restore();
    }
    // flashlight cones
    for (const p of S.squad) {
      const cone = g.createRadialGradient(p.x, p.y, 10, p.x, p.y, 330);
      cone.addColorStop(0, 'rgba(255,236,190,0.13)'); cone.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, 330, p.aim - 0.42, p.aim + 0.42); g.closePath(); g.fill();
    }
    for (const z of S.z) drawZombie(g, z);
    for (const f of S.flames) { const k = f.life / 0.5; g.fillStyle = `rgba(255,${Math.round(120 + 100 * k)},40,${0.5 * k})`; g.beginPath(); g.arc(f.x, f.y, 6 + (1 - k) * 12, 0, Math.PI * 2); g.fill(); }
    for (const s of S.shots) {
      g.strokeStyle = s.sn ? 'rgba(160,230,255,0.9)' : 'rgba(255,220,140,0.85)'; g.lineWidth = s.sn ? 2.5 : 1.8;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.tx, s.ty); g.stroke();
      g.fillStyle = 'rgba(255,200,90,0.8)'; g.beginPath(); g.arc(s.x, s.y, 5, 0, Math.PI * 2); g.fill();
    }
    for (const p of S.squad) { g.save(); g.translate(p.x, p.y); g.scale(1.15, 1.15); drawCharacter(g, p.cls, p.color, p.aim, 0, { alive: true, time: S.t }); g.restore(); }
    // darkness around the edges so the menu stays readable
    const v = g.createRadialGradient(cx, cy, 80, cx, cy, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.8)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (W > 900) { const l = g.createLinearGradient(0, 0, W * 0.55, 0); l.addColorStop(0, 'rgba(8,10,9,0.75)'); l.addColorStop(1, 'rgba(8,10,9,0)'); g.fillStyle = l; g.fillRect(0, 0, W * 0.55, H); }
    else { const l = g.createLinearGradient(0, H * 0.3, 0, H); l.addColorStop(0, 'rgba(8,10,9,0)'); l.addColorStop(1, 'rgba(8,10,9,0.85)'); g.fillStyle = l; g.fillRect(0, 0, W, H); }
  }
  function drawZombie(g, z) {
    g.save(); g.translate(z.x, z.y); g.rotate(z.a); if (z.big) g.scale(1.7, 1.7);
    const k = z.dead ? Math.max(0, 1 - z.dead / 0.7) : 1;
    g.globalAlpha = k;
    const sw = Math.sin(z.w) * 4;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(3, 4, 12, 14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d5a2e'; g.fillRect(4, -11 + sw * 0.3, 14, 4); g.fillRect(4, 7 - sw * 0.3, 14, 4);
    g.fillStyle = z.big ? '#55663a' : '#4c6b39'; g.beginPath(); g.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6f8f55'; g.beginPath(); g.arc(2, 0, 6.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff3b3b'; g.fillRect(6, -3, 2, 2); g.fillRect(6, 1, 2, 2);
    g.restore();
  }
  const loop = (now) => {
    S.raf = 0;
    if (cv.closest('[hidden]') || document.body.classList.contains('signed') || document.hidden) { S.last = now; return; }
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now;
    step(dt); draw();
    S.raf = requestAnimationFrame(loop);
  };
  const go = () => { if (still) { for (let i = 0; i < 400; i++) step(0.02); draw(); return; } if (!S.raf) S.raf = requestAnimationFrame(loop); };
  document.addEventListener('visibilitychange', go);
  go();
  return go;
}
