// Player settings, kept in this browser only.
const KEY = 'kusatma-ayarlar';
const DEFAULTS = {
  volume: 70,       // 0..100
  shake: true,      // screen shake
  dmgNums: true,    // floating damage numbers
  darkness: 50,     // 20..70, how dark the night is
  lead: true,       // camera leans toward where you aim
};

export const SETTINGS = { ...DEFAULTS };
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
