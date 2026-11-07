// Tiny synthesized sound effects (no audio files). Muted with M; the choice is remembered.
let ctx = null, master = null, noise = null;
let muted = false;
try { muted = localStorage.getItem('kusatma-ses') === '0'; } catch (e) { /* ignore */ }
const listener = { x: 0, y: 0 };
let budget = 0, budgetT = 0;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('kusatma-ses', muted ? '0' : '1'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}
export function setListener(x, y) { listener.x = x; listener.y = y; }

// Volume falls off with distance; far sounds are skipped. A per-frame budget stops pile-ups.
function vol(x, y, base) {
  if (!ctx || muted) return 0;
  const now = ctx.currentTime;
  if (now - budgetT > 0.05) { budgetT = now; budget = 0; }
  if (budget > 6) return 0;
  const d = x == null ? 0 : Math.hypot(x - listener.x, y - listener.y);
  const v = base * Math.max(0, 1 - d / 1100);
  if (v < 0.01) return 0;
  budget++;
  return v;
}

function burst(v, dur, freq, q, type = 'lowpass') {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function tone(v, dur, f0, f1, type = 'sine', delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

const SHOT = {
  asker: [0.35, 0.09, 1800, 0.8], doktor: [0.25, 0.06, 2400, 0.8], tamirci: [0.55, 0.22, 900, 0.7],
  nisanci: [0.6, 0.3, 1200, 0.6], tank: [0.3, 0.07, 1500, 0.8], izci: [0.3, 0.07, 2200, 0.9],
};

export function shot(cls, x, y, own) {
  if (cls === 'alevci') { const v = vol(x, y, own ? 0.12 : 0.06); if (v) burst(v, 0.12, 700, 0.5, 'bandpass'); return; }
  if (cls === 'bombaci') { const v = vol(x, y, own ? 0.35 : 0.2); if (v) tone(v, 0.15, 220, 90, 'triangle'); return; }
  const s = SHOT[cls] || SHOT.asker;
  const v = vol(x, y, own ? s[0] : s[0] * 0.55);
  if (!v) return;
  burst(v, s[1], s[2], s[3]);
  tone(v * 0.5, s[1] * 0.8, 160, 60, 'square');
}
export function turretShot(x, y) { const v = vol(x, y, 0.12); if (v) burst(v, 0.05, 2600, 1); }
export function hit() { const v = vol(null, null, 0.12); if (v) tone(v, 0.05, 900, 500, 'square'); }
export function zombieDie(x, y, big) { const v = vol(x, y, big ? 0.4 : 0.22); if (v) { burst(v, 0.18, 400, 1); tone(v * 0.6, 0.25, big ? 120 : 200, 50, 'sawtooth'); } }
export function boom(x, y) { const v = vol(x, y, 0.8); if (v) { burst(v, 0.6, 300, 0.5); tone(v, 0.5, 120, 30, 'sine'); } }
export function slam(x, y) { const v = vol(x, y, 0.8); if (v) { tone(v, 0.45, 90, 25, 'sine'); burst(v * 0.6, 0.35, 200, 0.7); } }
export function growl(x, y) { const v = vol(x, y, 0.14); if (v) tone(v, 0.5, 110 + Math.random() * 40, 70, 'sawtooth'); }
export function spit(x, y) { const v = vol(x, y, 0.2); if (v) burst(v, 0.15, 1200, 3, 'bandpass'); }
export function hurt() { const v = vol(null, null, 0.3); if (v) { tone(v, 0.18, 300, 120, 'sawtooth'); } }
export function heal(x, y) { const v = vol(x, y, 0.3); if (v) { tone(v, 0.25, 520, 780); tone(v * 0.8, 0.3, 660, 990, 'sine', 0.08); } }
export function ability(x, y) { const v = vol(x, y, 0.3); if (v) tone(v, 0.3, 300, 900, 'triangle'); }
export function waveStart() { const v = vol(null, null, 0.45); if (v) { tone(v, 0.9, 110, 90, 'sawtooth'); tone(v * 0.7, 0.9, 165, 135, 'sawtooth', 0.05); } }
export function waveClear() { const v = vol(null, null, 0.35); if (v) { tone(v, 0.2, 440, 440, 'triangle'); tone(v, 0.35, 660, 660, 'triangle', 0.15); } }
export function buy() { const v = vol(null, null, 0.25); if (v) { tone(v, 0.08, 880, 880, 'square'); tone(v, 0.12, 1320, 1320, 'square', 0.06); } }
export function down() { const v = vol(null, null, 0.4); if (v) tone(v, 0.6, 400, 80, 'sawtooth'); }
