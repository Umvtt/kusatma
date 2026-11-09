// Player settings, kept in this browser only.
const KEY = 'kusatma-ayarlar';
const DEFAULTS = {
  volume: 70,       // 0..100
  shake: true,      // screen shake
  dmgNums: true,    // floating damage numbers
  darkness: 50,     // 20..70, how dark the night is
  lead: true,       // camera leans toward where you aim
  quality: 'auto',  // auto, low, med, high
  fps: false,       // show the frame rate
  vibe: true,       // vibrate on phones (in the app and on Android browsers)
  aim: 'mid',       // aim assist on phones: off, low, mid, high
};

export const SETTINGS = { ...DEFAULTS };
// what each graphics level costs: screen sharpness, light map size, particle budget
export const QUALITY = {
  low: { name: 'Düşük', dpr: 1, light: 3, parts: 220 },
  med: { name: 'Orta', dpr: 1.5, light: 2, parts: 420 },
  high: { name: 'Yüksek', dpr: 2, light: 2, parts: 700 },
};
export const QORDER = ['low', 'med', 'high'];
// the level in use right now (the auto mode moves it)
export const QUAL = { level: 'high', parts: 700 };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) SETTINGS[k] = saved[k];
} catch (e) { /* ignore */ }

const listeners = [];
export function onSettings(fn) { listeners.push(fn); fn(SETTINGS); }
export function setSetting(k, v) {
  if (!(k in DEFAULTS) || typeof v !== typeof DEFAULTS[k]) return;
  SETTINGS[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch (e) { /* ignore */ }
  for (const fn of listeners) fn(SETTINGS);
}
export function resetSettings() {
  for (const k of Object.keys(DEFAULTS)) SETTINGS[k] = DEFAULTS[k];
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  for (const fn of listeners) fn(SETTINGS);
}
