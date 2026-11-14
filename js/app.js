// Shared by the page's modules: element lookups and quick writes, the game state S, the renderer, toasts, the
// loading screen, the confirm dialog and the zoom level. Imports nothing from the other page modules (it runs first).
import { ZOOM_MIN, ZOOM_MAX, clamp, TIPS } from './config.js';
import { Renderer } from './render.js';

let zoom = 1;
try { const z = parseFloat(localStorage.getItem('kusatma-zoom')); if (z) zoom = clamp(z, ZOOM_MIN, ZOOM_MAX); } catch (e) { /* ignore */ }
// plain "#id" lookups are remembered (the HUD asks for the same few dozen elements ten times a second)
const $ID = new Map();
const $ = (s) => {
  if (s.charCodeAt(0) !== 35 || s.indexOf(' ') >= 0 || s.indexOf('.') >= 0 || s.indexOf('[') >= 0 || s.indexOf(':') >= 0) return document.querySelector(s);
  let e = $ID.get(s);
  if (!e || !e.isConnected) { e = document.getElementById(s.slice(1)); if (e) $ID.set(s, e); else $ID.delete(s); }
  return e;
};
// HUD writes only touch the page when the value changed
const setT = (sel, t) => { const e = $(sel); if (e && e.textContent !== t) e.textContent = t; };
const setHid = (sel, h) => { const e = $(sel); if (e && e.hidden !== h) e.hidden = h; };
const setPct = (e, k, prop = 'width') => { const v = (Math.max(0, Math.min(1, k || 0)) * 100).toFixed(1) + '%'; if (e && e.style[prop] !== v) e.style[prop] = v; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
const S = {
  role: null,      // 'host' | 'client'
  net: null,
  host: null,
  game: null,
  me: null,
  roster: null,
  ticker: null,
  raf: 0,
  screen: 'menu',
  over: null,
  hudT: 0,
  shopBuilt: false,
};
const renderer = new Renderer($('#game'));
const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
document.body.classList.toggle('touch', IS_TOUCH);
try { if (IS_TOUCH && !localStorage.getItem('kusatma-zoom')) zoom = 0.85; } catch (e) { /* ignore */ }
window.addEventListener('resize', () => renderer.resize());
// a note with one button (a friend who is playing: Katıl); stays 9 s
function actToast(text, label, fn) {
  const t = el('div', 'toast act'), b = el('button', 'btn small primary', label); b.type = 'button';
  b.onclick = () => { t.remove(); fn(); };
  t.append(el('span', '', text), b); $('#toasts').append(t);
  setTimeout(() => t.remove(), 9000);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
function toast(text, kind = '') {
  const t = el('div', 'toast ' + kind, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3300);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
function menuMsg(text, info = false) {
  for (const id of ['#menu-msg', '#dp-msg']) {
    const m = $(id);
    m.hidden = !text;
    m.textContent = text || '';
    m.classList.toggle('info', info);
  }
}
function busy(on) {
  for (const id of ['#btn-create', '#btn-join', '#btn-solo', '#btn-quick']) $(id).disabled = on;
  for (const b of document.querySelectorAll('#dashpage .play-btn, #dashpage .dp-act, #dashpage .quick-btn')) b.disabled = on;
  loading(on);
}
// ---------- the loading screen while a room is being set up or joined: a spinner, what is happening and a tip ----------
const LD = { t: 0, iv: 0, i: Math.floor(Math.random() * TIPS.length) };
function tipNext() { LD.i = (LD.i + 1) % TIPS.length; return TIPS[LD.i]; }
function loading(on) {
  clearTimeout(LD.t); clearInterval(LD.iv);
  if (!on) { $('#loading').hidden = true; return; }
  // quick steps never flash the screen
  LD.t = setTimeout(() => {
    const m = $('#menu-msg').textContent || $('#dp-msg').textContent;
    $('#ld-txt').textContent = m || 'Bağlanılıyor…';
    const tip = $('#ld-tip'); tip.textContent = tipNext();
    $('#loading').hidden = false;
    LD.iv = setInterval(() => { tip.style.opacity = '0'; setTimeout(() => { tip.textContent = tipNext(); tip.style.opacity = ''; }, 300); }, 4500);
  }, 350);
}
let confirmCb = null;
function ask(title, text, yesLabel, cb) {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = yesLabel;
  confirmCb = cb;
  $('#confirm').hidden = false;
  $('#confirm-no').focus();
}
$('#confirm-no').addEventListener('click', () => { $('#confirm').hidden = true; confirmCb = null; });
$('#confirm-yes').addEventListener('click', () => { $('#confirm').hidden = true; const cb = confirmCb; confirmCb = null; if (cb) cb(); });
// ---------- host migration ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setZoom(z) {
  zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  try { localStorage.setItem('kusatma-zoom', zoom.toFixed(3)); } catch (e) { /* ignore */ }
}

export { $, $ID, IS_TOUCH, LD, S, actToast, ask, busy, confirmCb, el, fmt, loading, menuMsg, renderer, setHid, setPct, setT, setZoom, sleep, tipNext, toast, zoom };
