// Tiny synthesized sound effects (no audio files). Muted with M; the choice is remembered.
let ctx = null, master = null, noise = null;
let muted = false;
try { muted = localStorage.getItem('kusatma-ses') === '0'; } catch (e) { /* ignore */ }
const listener = { x: 0, y: 0 };
let level = 0.5; // master volume when not muted
let musicBus = null, musicLevel = 0.35; // the music's own level, under the master volume
export function setVolume(v) { level = Math.max(0, Math.min(1, v)) * 0.7; if (master) master.gain.value = muted ? 0 : level; }
let budget = 0, budgetT = 0;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : level;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = musicLevel; musicBus.connect(master);
  if (MUS.mode !== 'off' && !MUS.timer) { MUS.next = ctx.currentTime + 0.1; MUS.timer = setInterval(musicTick, 50); }
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('kusatma-ses', muted ? '0' : '1'); } catch (e) { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : level;
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

// [loudness, length, noise colour, filter Q] of each class's gun
const SHOT = {
  asker: [0.35, 0.09, 1800, 0.8], doktor: [0.25, 0.06, 2400, 0.8], tamirci: [0.55, 0.22, 900, 0.7],
  nisanci: [0.6, 0.3, 1200, 0.6], kalkanci: [0.3, 0.07, 1500, 0.8], izci: [0.3, 0.07, 2200, 0.9],
  muhendis: [0.3, 0.08, 2000, 0.85], kimyager: [0.28, 0.12, 700, 0.5], komutan: [0.55, 0.16, 1100, 0.7],
  tesla: [0.3, 0.1, 3200, 0.4], avci: [0.35, 0.12, 1300, 0.9], egitmen: [0.3, 0.08, 1700, 0.8],
  ajan: [0.16, 0.05, 650, 1.6], hacker: [0.22, 0.06, 2800, 1.2],
};

// w: the weapon (its path and level change the sound: heavy rounds boom, rapid fire clicks, piercing rounds crack)
export function shot(cls, x, y, own, w) {
  if (cls === 'alevci') return; // the flamethrower is a continuous loop, see flame()
  const k = w ? w.path | 0 : 0, t = w ? w.tier | 0 : 0;
  if (cls === 'bombaci' || (k === 8 && cls === 'asker')) {
    // hollow launcher thump, nothing like a gunshot
    const v = vol(x, y, own ? 0.5 : 0.28);
    if (v) { tone(v, 0.22, k === 1 ? 110 : 140, 55, 'sine'); burst(v * 0.5, 0.12, 500, 0.6); tone(v * 0.25, 0.08, 900, 600, 'triangle', 0.02); }
    return;
  }
  const s = SHOT[cls] || SHOT.asker;
  let loud = s[0], len = s[1], col = s[2];
  if (k === 1) { loud *= 1.25; len *= 1.45; col *= 0.7; }        // heavy: deeper and longer
  else if (k === 2) { loud *= 0.8; len *= 0.7; col *= 1.2; }     // rapid: short, bright
  loud *= 1 + 0.04 * t;
  const v = vol(x, y, own ? loud : loud * 0.55);
  if (!v) return;
  if (cls === 'ajan') { burst(v, len, col, s[3], 'bandpass'); tone(v * 0.3, 0.04, 420, 260, 'sine'); return; } // suppressed "pfft"
  if (cls === 'hacker') { tone(v * 0.7, 0.07, 1800, 600, 'square'); burst(v * 0.4, 0.04, col, s[3], 'bandpass'); return; } // digital chirp
  burst(v, len, col, s[3]);
  tone(v * 0.5, len * 0.8, k === 1 ? 110 : 160, 60, 'square');
  if (k === 1) tone(v * 0.45, 0.18, 80, 35, 'sine');                                       // the heavy round's thump
  if (k === 3) tone(v * 0.35, 0.12, 3200, 1400, 'triangle');                              // piercing crack and whine
  if (k === 4) { tone(v * 0.3, 0.16, 2600, 3400, 'sine'); tone(v * 0.2, 0.2, 3900, 4600, 'sine', 0.02); } // ice: glassy ring
  if (k === 5) burst(v * 0.4, 0.2, 2400, 4, 'bandpass');                                  // poison: hiss
  if (k === 6) { burst(v * 0.5, 0.08, 4500, 6, 'bandpass'); tone(v * 0.25, 0.08, 1600, 500, 'square'); } // lightning: crackle
  if (k === 8) tone(v * 0.4, 0.14, cls === 'nisanci' ? 600 : 1200, cls === 'nisanci' ? 2400 : 500, 'sawtooth'); // the class special
}
// the Kılıççı's sword: a swish, sharper with a heavier blade
export function swish(x, y, own, heavy) { const v = vol(x, y, own ? 0.32 : 0.16); if (v) { burst(v, heavy ? 0.16 : 0.11, heavy ? 900 : 1500, 1.4, 'bandpass'); tone(v * 0.25, 0.1, heavy ? 500 : 900, 300, 'triangle'); } }
export function turretShot(x, y) { const v = vol(x, y, 0.12); if (v) burst(v, 0.05, 2600, 1); }
export function hit() { const v = vol(null, null, 0.12); if (v) tone(v, 0.05, 900, 500, 'square'); }
// each kind of zombie sounds like itself: [pitch, length, wave] for its growl; bosses roar
const ZV = { 0: [120, 0.5, 'sawtooth'], 1: [190, 0.28, 'sawtooth'], 2: [80, 0.7, 'sawtooth'], 3: [55, 1.1, 'sawtooth'], 4: [150, 0.4, 'square'], 5: [140, 0.35, 'square'],
  6: [100, 0.6, 'sawtooth'], 7: [130, 0.8, 'triangle'], 8: [65, 1.1, 'sawtooth'], 9: [60, 1.0, 'sawtooth'], 10: [240, 0.6, 'sine'], 11: [90, 0.6, 'square'],
  12: [170, 0.3, 'sawtooth'], 13: [95, 0.7, 'triangle'], 14: [260, 0.2, 'square'], 15: [160, 0.6, 'sine'], 16: [110, 0.5, 'triangle'], 17: [300, 0.6, 'sawtooth'],
  18: [130, 0.5, 'triangle'], 19: [50, 1.2, 'sawtooth'], 20: [180, 1.0, 'sine'], 21: [900, 0.18, 'square'], 22: [330, 0.16, 'square'], 23: [45, 1.3, 'sawtooth'] };
export function zombieDie(x, y, big, t) {
  const v = vol(x, y, big ? 0.4 : 0.22); if (!v) return;
  const z = ZV[t] || ZV[0];
  burst(v, 0.18, t === 21 ? 2200 : 400, 1);
  tone(v * 0.6, big ? 0.6 : 0.25, z[0] * 1.6, z[0] * 0.4, z[2]);
  if (big) tone(v * 0.5, 0.9, 70, 30, 'sine', 0.05);
}
export function boom(x, y) { const v = vol(x, y, 0.8); if (v) { burst(v, 0.6, 300, 0.5); tone(v, 0.5, 120, 30, 'sine'); } }
export function slam(x, y) { const v = vol(x, y, 0.8); if (v) { tone(v, 0.45, 90, 25, 'sine'); burst(v * 0.6, 0.35, 200, 0.7); } }
export function growl(x, y, t) {
  const z = ZV[t] || ZV[0], boss = t === 3 || t === 8 || t === 9 || t === 19 || t === 20 || t === 23;
  const v = vol(x, y, boss ? 0.3 : 0.14); if (!v) return;
  const f = z[0] * (0.85 + Math.random() * 0.3);
  if (t === 22) { tone(v, 0.09, f, f * 0.7, 'square'); tone(v, 0.09, f, f * 0.7, 'square', 0.14); return; } // a dog's double bark
  if (t === 21) { tone(v * 0.6, z[1], f, f * 1.4, 'square'); return; }                                   // a bat's screech
  tone(v, z[1], f, f * 0.6, z[2]);
  if (boss) { tone(v * 0.7, z[1] * 1.2, f * 0.5, f * 0.3, 'sawtooth', 0.04); burst(v * 0.4, z[1], 260, 0.7); }
}
export function spit(x, y) { const v = vol(x, y, 0.2); if (v) burst(v, 0.15, 1200, 3, 'bandpass'); }
export function hurt() { const v = vol(null, null, 0.3); if (v) { tone(v, 0.18, 300, 120, 'sawtooth'); } }
export function heal(x, y) { const v = vol(x, y, 0.3); if (v) { tone(v, 0.25, 520, 780); tone(v * 0.8, 0.3, 660, 990, 'sine', 0.08); } }
export function ability(cls, x, y) {
  const v = vol(x, y, 0.35);
  if (!v) return;
  switch (cls) {
    case 'asker': tone(v, 0.12, 300, 600, 'square'); tone(v, 0.18, 450, 900, 'square', 0.08); break; // rally
    case 'nisanci': tone(v * 0.7, 0.35, 1800, 2600, 'sine'); burst(v * 0.3, 0.05, 4000, 2, 'highpass'); break; // scope zoom
    case 'izci': burst(v, 0.35, 900, 0.7, 'bandpass'); tone(v * 0.4, 0.3, 200, 500, 'sine'); break; // whoosh
    case 'kalkanci': tone(v, 0.5, 180, 180, 'triangle'); tone(v * 0.6, 0.5, 360, 362, 'sine'); burst(v * 0.4, 0.08, 3000, 3, 'bandpass'); break; // metal hum
    case 'tamirci': for (let i = 0; i < 3; i++) { burst(v * 0.6, 0.05, 2500, 4, 'bandpass'); tone(v * 0.4, 0.05, 700, 650, 'square', i * 0.09); } break; // clank
    case 'bombaci': tone(v * 0.6, 0.06, 1200, 1200, 'square'); tone(v * 0.6, 0.06, 1600, 1600, 'square', 0.12); break; // mine beep
    case 'alevci': burst(v * 1.2, 0.6, 600, 0.6); tone(v, 0.5, 90, 40, 'sawtooth'); break; // fire burst
    case 'muhendis': tone(v * 0.6, 0.25, 600, 1400, 'sine'); tone(v * 0.4, 0.25, 900, 1800, 'triangle', 0.1); break; // drone launch
    case 'kimyager': burst(v, 0.5, 400, 0.5, 'lowpass'); tone(v * 0.5, 0.35, 220, 90, 'sine'); break; // hiss
    case 'tesla': burst(v, 0.4, 3500, 2, 'bandpass'); tone(v * 0.5, 0.4, 120, 60, 'sawtooth'); break; // crackle
    case 'avci': for (let i = 0; i < 4; i++) burst(v * 0.5, 0.06, 1800, 3, 'bandpass'); tone(v * 0.4, 0.2, 900, 300, 'triangle'); break; // twang
    case 'komutan': tone(v * 0.6, 0.15, 500, 500, 'square'); tone(v * 0.6, 0.15, 750, 750, 'square', 0.15); tone(v * 0.6, 0.3, 1000, 1000, 'square', 0.3); break; // bugle
    default: tone(v, 0.3, 300, 900, 'triangle');
  }
}

// Continuous flamethrower roar. Called every frame with 0..1 (loudest nearby flamethrower).
let flameSrc = null, flameGain = null, flameFilter = null;
export function flame(level) {
  if (!ctx) return;
  if (!flameSrc) {
    flameSrc = ctx.createBufferSource(); flameSrc.buffer = noise; flameSrc.loop = true;
    flameFilter = ctx.createBiquadFilter(); flameFilter.type = 'lowpass'; flameFilter.frequency.value = 500; flameFilter.Q.value = 0.8;
    const rumble = ctx.createBiquadFilter(); rumble.type = 'peaking'; rumble.frequency.value = 160; rumble.gain.value = 8;
    flameGain = ctx.createGain(); flameGain.gain.value = 0;
    flameSrc.connect(flameFilter).connect(rumble).connect(flameGain).connect(master);
    flameSrc.start();
  }
  const t = ctx.currentTime;
  const target = muted ? 0 : level * 0.55;
  flameGain.gain.setTargetAtTime(target, t, target > flameGain.gain.value ? 0.03 : 0.12);
  flameFilter.frequency.setTargetAtTime(400 + level * 900 + Math.random() * 200, t, 0.05);
}
export function waveStart() { const v = vol(null, null, 0.45); if (v) { tone(v, 0.9, 110, 90, 'sawtooth'); tone(v * 0.7, 0.9, 165, 135, 'sawtooth', 0.05); } }
export function waveClear() { const v = vol(null, null, 0.35); if (v) { tone(v, 0.2, 440, 440, 'triangle'); tone(v, 0.35, 660, 660, 'triangle', 0.15); } }
export function buy() { const v = vol(null, null, 0.25); if (v) { tone(v, 0.08, 880, 880, 'square'); tone(v, 0.12, 1320, 1320, 'square', 0.06); } }
export function down() { const v = vol(null, null, 0.4); if (v) tone(v, 0.6, 400, 80, 'sawtooth'); }
export function summon(x, y) { const v = vol(x, y, 0.35); if (v) { tone(v, 0.7, 220, 110, 'sine'); tone(v * 0.6, 0.7, 330, 165, 'triangle', 0.05); burst(v * 0.3, 0.5, 600, 4, 'bandpass'); } }
export function clang(x, y) { const v = vol(x, y, 0.15); if (v) { tone(v, 0.08, 1400, 1300, 'square'); burst(v * 0.5, 0.05, 3500, 5, 'bandpass'); } }
export function pickup(k, x, y) {
  const v = vol(x, y, 0.35);
  if (!v) return;
  if (k === 0) { tone(v, 0.15, 500, 750); tone(v, 0.2, 750, 1000, 'sine', 0.1); }        // heal
  else if (k === 1) { tone(v, 0.06, 1500, 1500, 'square'); tone(v, 0.12, 2000, 2000, 'square', 0.06); } // coins
  else if (k === 2) { tone(v, 0.3, 200, 500, 'sawtooth'); tone(v * 0.5, 0.3, 300, 750, 'square', 0.05); } // power
  else { burst(v, 0.25, 1400, 1, 'bandpass'); tone(v * 0.5, 0.25, 400, 1200, 'sine'); }   // speed
}
// Dipçik: a quick whoosh, and a dull thud when it connects.
export function bash(x, y, own) { const v = vol(x, y, own ? 0.3 : 0.16); if (v) burst(v, 0.12, 1100, 1.2, 'bandpass'); }
export function bashHit(x, y) { const v = vol(x, y, 0.45); if (v) { tone(v, 0.14, 160, 60, 'sine'); burst(v * 0.6, 0.08, 700, 0.8); } }
export function zap(x, y) { const v = vol(x, y, 0.16); if (v) { burst(v, 0.12, 4200, 6, 'bandpass'); tone(v * 0.5, 0.1, 1800, 600, 'square'); } }
export function thunder(x, y) { const v = vol(x, y, 0.75); if (v) { burst(v, 0.9, 500, 0.6); burst(v * 0.7, 0.15, 5000, 3, 'bandpass'); tone(v * 0.6, 0.6, 90, 35, 'sawtooth'); } }
export function siren(x, y) { const v = vol(null, null, 0.3); void x; void y; if (v) { tone(v, 0.7, 500, 900, 'triangle'); tone(v, 0.7, 900, 500, 'triangle', 0.7); tone(v, 0.7, 500, 900, 'triangle', 1.4); } }
export function boomSmall(x, y) { const v = vol(x, y, 0.35); if (v) { burst(v, 0.3, 500, 0.6); tone(v * 0.6, 0.25, 160, 50, 'sine'); } }

// a Mühendis drone's small laser shot
export function droneShot(x, y) { const v = vol(x, y, 0.12); if (v) tone(v, 0.06, 2400, 1600, 'square'); }

// ---------- music: made by the game itself, no files. Calm in breaks, driving in waves, heavier with a boss. ----------
// A small step sequencer looks 0.2 s ahead and schedules notes on the audio clock, so timers never make it stutter.
const MUS = { mode: 'off', step: 0, next: 0, timer: 0, root: 0, bar: 0, intensity: 0 };
// A natural minor (D) in Hz; chords move i – VI – III – VII
const NOTE = (n) => 146.83 * 2 ** (n / 12);
const PROG = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
const TEMPO = { break: 76, combat: 108, boss: 128 };
export function setMusicVolume(v) { musicLevel = Math.max(0, Math.min(1, v)) * 0.6; if (musicBus) musicBus.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.2); }
function mnote(t, f, dur, v, type = 'sine', attack = 0.01) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
}
function mkick(t, v) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.25);
}
function mnoise(t, v, dur, freq, type = 'highpass') {
  const src = ctx.createBufferSource(); src.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(musicBus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function playStep(t, i) {
  const m = MUS.mode, chord = PROG[Math.floor(i / 16) % PROG.length], s16 = i % 16, beat = 60 / TEMPO[m] / 4;
  if (m === 'break') {
    if (s16 === 0) for (const n of chord) mnote(t, NOTE(n), beat * 16, 0.045, 'triangle', 0.6);                // a slow pad
    if (s16 % 4 === 2) mnote(t, NOTE(chord[(s16 / 4 | 0) % 3] + 12), beat * 3, 0.03, 'sine');                 // soft arpeggio
    return;
  }
  const heavy = m === 'boss', I = MUS.intensity;
  if (s16 % 4 === 0) mkick(t, heavy ? 0.5 : 0.38);
  if (heavy && s16 % 8 === 6) mkick(t, 0.3);
  if (s16 % 8 === 4) mnoise(t, 0.14 + I * 0.06, 0.12, 1800, 'bandpass');                                   // snare
  if (s16 % 2 === 1) mnoise(t, 0.035 + I * 0.02, 0.04, 7000);                                                // hat
  // driving bass on eighths; the boss gets a fifth on top
  if (s16 % 2 === 0) { mnote(t, NOTE(chord[0] - 12), beat * 1.8, 0.12, 'sawtooth', 0.005); if (heavy) mnote(t, NOTE(chord[0] - 5), beat * 1.6, 0.05, 'sawtooth', 0.005); }
  // a tense lead that grows with the wave
  if (I > 0.3 && s16 % 4 === 3) mnote(t, NOTE(chord[(i >> 2) % 3] + 12), beat * 2, 0.025 + I * 0.02, 'square');
  if (heavy && s16 === 0) for (const n of chord) mnote(t, NOTE(n + 1), beat * 6, 0.03, 'sawtooth', 0.02);   // dissonant stab
}
function musicTick() {
  if (!ctx || MUS.mode === 'off') return;
  const beat = 60 / TEMPO[MUS.mode] / 4;
  if (MUS.next < ctx.currentTime) MUS.next = ctx.currentTime + 0.05;
  while (MUS.next < ctx.currentTime + 0.2) { if (!muted && musicLevel > 0 && !document.hidden) playStep(MUS.next, MUS.step); MUS.next += beat; MUS.step++; }
}
// mode: 'off' | 'break' | 'combat' | 'boss'; intensity 0..1 (how late in the game it is)
export function music(mode, intensity = 0) {
  MUS.intensity = Math.max(0, Math.min(1, intensity));
  if (mode === MUS.mode) return;
  MUS.mode = mode;
  if (!ctx) return;
  if (mode === 'off') { clearInterval(MUS.timer); MUS.timer = 0; if (musicBus) { musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3); } return; }
  musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.4);
  MUS.step = 0; MUS.next = ctx.currentTime + 0.1;
  if (!MUS.timer) MUS.timer = setInterval(musicTick, 50);
}
// a short sting for moments (wave start, boss arrival, the team wiped)
export function sting(k) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + 0.02;
  if (k === 'boss') { mnote(t, NOTE(-12), 1.6, 0.18, 'sawtooth', 0.02); mnote(t, NOTE(-11), 1.6, 0.12, 'sawtooth', 0.02); mkick(t, 0.6); }
  else if (k === 'clear') { for (const [i, n] of [0, 3, 7, 12].entries()) mnote(t + i * 0.09, NOTE(n + 12), 0.5, 0.06, 'triangle'); }
  else if (k === 'over') { for (const [i, n] of [7, 3, 0, -5].entries()) mnote(t + i * 0.28, NOTE(n), 0.9, 0.08, 'triangle', 0.05); }
}
// a teammate's quick message or ping: a short two-note blip (higher for warnings)
export function ping(x, y, k) { const v = vol(null, null, 0.22); if (!v) return; const hi = k === 1 || k === 3; tone(v, 0.09, hi ? 1320 : 990, hi ? 1320 : 990, 'triangle'); tone(v, 0.14, hi ? 1760 : 1320, hi ? 1760 : 1320, 'triangle', 0.09); }
