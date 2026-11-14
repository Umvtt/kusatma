// Phone screen layout: every control and HUD piece can be moved and resized within limits (Ayarlar → Ekran düzeni).
// Saved per device in localStorage 'kusatma-kontrol' (v2: {op, free, pos:{k:{x,y}}, sz:{k:scale}}).
import { GEAR, clamp } from './config.js';
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// what the page gives this module: the game state (screen, tbTop), the renderer (minimap) and whether this is a touch device
const X = { S: {}, renderer: {}, touch: false };
// ---------- phone screen layout: every control and HUD piece can be moved and resized within limits (this device only) ----------
const CTL_KEY = 'kusatma-kontrol';
const LAY_ITEMS = {
  mv: { sel: '#stick-move', name: 'Hareket joystick\'i', min: 0.7, max: 1.5 },
  aim: { sel: '#stick-aim', name: 'Nişan joystick\'i', min: 0.7, max: 1.5 },
  ab: { sel: '#t-ab', name: 'Yetenek tuşu', min: 0.7, max: 1.5 },
  bash: { sel: '#t-bash', name: 'Dipçik tuşu', min: 0.7, max: 1.5 },
  mic: { sel: '#touch .vb-wrap', name: 'Mikrofon', min: 0.7, max: 1.5 },
  gear: { sel: '#t-gear', name: 'Eşyalar', min: 0.7, max: 1.4 },
  tools: { sel: '#t-tools', name: 'Menü tuşları', min: 0.7, max: 1.4 },
  wave: { sel: '.wave-box', name: 'Dalga kutusu', min: 0.7, max: 1.4 },
  hp: { sel: '.hud-bottom', name: 'Can ve altın', min: 0.7, max: 1.4 },
  boss: { sel: '#boss', name: 'Boss çubuğu', min: 0.7, max: 1.5 },
  fab: { sel: '#btn-armory', name: 'Cephanelik tuşu', min: 0.7, max: 1.3 },
  mm: { sel: '#mm-box', name: 'Harita', min: 0.6, max: 1.6 },
};
export const CTL = { op: 100, free: false, pos: {}, sz: {}, editing: false, sel: null };
try {
  const c = JSON.parse(localStorage.getItem(CTL_KEY) || '{}');
  if (Number.isFinite(c.op)) CTL.op = clamp(c.op, 30, 100);
  CTL.free = c.free === true;
  for (const [k, it] of Object.entries(LAY_ITEMS)) {
    const q = c.pos && c.pos[k]; if (q && Number.isFinite(q.x) && Number.isFinite(q.y)) CTL.pos[k] = { x: clamp(q.x, 0, 1), y: clamp(q.y, 0, 1) };
    const z = c.sz && c.sz[k]; if (Number.isFinite(z)) CTL.sz[k] = clamp(z, it.min, it.max);
  }
  // the earlier editor had one size for both sticks and one for the buttons
  if (!c.sz && Number.isFinite(c.stk) && c.stk !== 100) { CTL.sz.mv = CTL.sz.aim = clamp(c.stk / 100, 0.7, 1.5); }
  if (!c.sz && Number.isFinite(c.btn) && c.btn !== 100) { CTL.sz.ab = CTL.sz.bash = CTL.sz.mic = clamp(c.btn / 100, 0.7, 1.5); }
} catch (e) { /* ignore */ }
function ctlSave() { try { localStorage.setItem(CTL_KEY, JSON.stringify({ v: 2, op: CTL.op, free: CTL.free, pos: CTL.pos, sz: CTL.sz })); } catch (e) { /* ignore */ } }
const laySize = (k) => clamp(CTL.sz[k] || 1, LAY_ITEMS[k].min, LAY_ITEMS[k].max);
// where a piece's centre may go so that it stays on the screen whole
function layClamp(k, e, x, y) {
  const s = laySize(k), W = innerWidth, H = innerHeight;
  const hw = Math.min(W / 2, ((e && e.offsetWidth) || 60) * s / 2 + 2), hh = Math.min(H / 2, ((e && e.offsetHeight) || 40) * s / 2 + 2);
  return { x: clamp(x, hw, W - hw), y: clamp(y, hh, H - hh) };
}
export function ctlApply() {
  if (!X.touch && !CTL.editing) return;
  const pad = $('#touch');
  pad.style.setProperty('--tco', CTL.op / 100);
  pad.classList.toggle('free', CTL.free);
  for (const [k, it] of Object.entries(LAY_ITEMS)) {
    const e = $(it.sel); if (!e) continue;
    e.dataset.ed = k;
    const s = laySize(k), q = CTL.pos[k];
    if (k === 'mm') { X.renderer.mmLay = q || s !== 1 ? { x: q ? q.x : null, y: q ? q.y : null, s } : null; continue; }
    e.style.setProperty('--ms', s);
    e.classList.toggle('moved', !!q);
    if (q) { const c = layClamp(k, e, q.x * innerWidth, q.y * innerHeight); e.style.setProperty('--mx', c.x.toFixed(1) + 'px'); e.style.setProperty('--my', c.y.toFixed(1) + 'px'); }
  }
  hudMeasure();
}
// the row of small buttons sits right under the wave box (measured when that box changes size, never while the game draws)
export function hudMeasure() {
  if (!X.touch) return;
  const wb = document.querySelector('.wave-box'); if (!wb || !wb.offsetParent) return;
  const t = wb.classList.contains('moved') ? 52 : Math.round(wb.getBoundingClientRect().bottom + 6);
  if (t > 20 && t !== X.S.tbTop) { X.S.tbTop = t; document.body.style.setProperty('--tb-top', t + 'px'); }
}
function ctlSelect(k) {
  CTL.sel = k;
  for (const e of document.querySelectorAll('[data-ed].sel')) e.classList.remove('sel');
  const it = k && LAY_ITEMS[k], sl = $('#ctl-sz');
  if (it) { const e = $(it.sel); if (e) e.classList.add('sel'); }
  $('#ctl-sel').textContent = it ? it.name : 'Parça seç';
  sl.disabled = !it; $('#ctl-one').disabled = !it;
  if (it) { sl.min = Math.round(it.min * 100); sl.max = Math.round(it.max * 100); sl.value = Math.round(laySize(k) * 100); }
  $('#ctl-sz-v').textContent = it ? '%' + Math.round(laySize(k) * 100) : '–';
}
function ctlSync() { $('#ctl-op').value = CTL.op; $('#ctl-op-v').textContent = '%' + CTL.op; $('#ctl-free').checked = CTL.free; ctlSelect(CTL.sel); }
// a piece gets a place of its own the first time it is dragged or resized: exactly where it is now
function layPin(k) {
  if (CTL.pos[k]) return;
  const e = $(LAY_ITEMS[k].sel); if (!e) return;
  const r = e.getBoundingClientRect(); if (!r.width) return;
  CTL.pos[k] = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
}
function ctlEdit(on) {
  CTL.editing = on;
  document.body.classList.toggle('ctl-editing', on);
  $('#ctl-ed').hidden = !on;
  const tg = $('#t-gear');
  if (on) {
    $('#settings').hidden = true;
    // show every piece, even those that only appear now and then, so each can be placed
    if (!tg.childElementCount) { tg.dataset.ph = '1'; tg.append(...GEAR.slice(0, 3).map((it) => { const b = el('button', 't-btn t-gear'); b.type = 'button'; b.style.setProperty('--pc', it.col); b.append(el('span', '', it.short), el('b', '', '×1')); return b; })); }
    if (!$('#boss-name').textContent.trim() || $('#boss').hidden) { $('#boss-name').textContent = $('#boss-name').textContent.trim() || 'Boss'; }
    CTL.sel = null; ctlSync(); ctlApply();
  } else {
    if (tg.dataset.ph) { delete tg.dataset.ph; tg.replaceChildren(); $('#hud-gear').dataset.sig = ''; }
    ctlSelect(null); ctlSave(); ctlApply();
  }
  $('#touch').hidden = !on && !(X.touch && X.S.screen === 'game');
}

export function layoutInit(deps) {
  Object.assign(X, deps);
  if (X.touch && window.ResizeObserver) { const ro = new ResizeObserver(() => hudMeasure()); const wb = document.querySelector('.wave-box'); if (wb) ro.observe(wb); }
  window.addEventListener('resize', () => { if (X.touch || CTL.editing) ctlApply(); });
  let drag = null;
  const move = (e) => {
    const k = drag.k, it = LAY_ITEMS[k], elm = $(it.sel);
    if (!drag.go) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return; drag.go = true; layPin(k); const q = CTL.pos[k]; drag.ox = q ? q.x * innerWidth - drag.sx : 0; drag.oy = q ? q.y * innerHeight - drag.sy : 0; }
    const c = layClamp(k, elm, e.clientX + drag.ox, e.clientY + drag.oy);
    CTL.pos[k] = { x: c.x / innerWidth, y: c.y / innerHeight };
    ctlApply();
  };
  // while editing, every touch moves or picks a piece instead of using it
  const down = (e) => {
    if (!CTL.editing || e.target.closest('.ctl-bar')) return;
    e.stopPropagation(); e.preventDefault();
    const t = e.target.closest('[data-ed]'); if (!t) return;
    ctlSelect(t.dataset.ed);
    drag = { k: t.dataset.ed, id: e.pointerId, sx: e.clientX, sy: e.clientY, go: false };
    try { t.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  const mv = (e) => { if (!CTL.editing || e.target.closest('.ctl-bar')) return; e.stopPropagation(); if (drag && e.pointerId === drag.id) move(e); };
  const stop = (e) => { if (!CTL.editing || e.target.closest('.ctl-bar')) return; e.stopPropagation(); if (drag && e.pointerId === drag.id) { drag = null; ctlSave(); } };
  document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', mv, true);
  document.addEventListener('pointerup', stop, true); document.addEventListener('pointercancel', stop, true);
  document.addEventListener('click', (e) => { if (CTL.editing && !e.target.closest('.ctl-bar')) { e.stopPropagation(); e.preventDefault(); } }, true);
  { // the editor's own box can be dragged out of the way by its title
    const bar = document.querySelector('.ctl-bar'), grip = bar.querySelector('.ctl-row'); let g = null;
    grip.addEventListener('pointerdown', (e) => { const r = bar.getBoundingClientRect(); g = { id: e.pointerId, ox: r.left + r.width / 2 - e.clientX, oy: r.top + r.height / 2 - e.clientY }; try { grip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
    grip.addEventListener('pointermove', (e) => { if (!g || e.pointerId !== g.id) return; const r = bar.getBoundingClientRect(); bar.style.setProperty('--bx', clamp(e.clientX + g.ox, r.width / 2, innerWidth - r.width / 2) + 'px'); bar.style.setProperty('--by', clamp(e.clientY + g.oy, r.height / 2, innerHeight - r.height / 2) + 'px'); });
    const up = (e) => { if (g && e.pointerId === g.id) g = null; }; grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  }
  $('#ctl-sz').addEventListener('input', (e) => { const k = CTL.sel; if (!k) return; layPin(k); CTL.sz[k] = clamp(Number(e.target.value) / 100, LAY_ITEMS[k].min, LAY_ITEMS[k].max); $('#ctl-sz-v').textContent = '%' + Math.round(CTL.sz[k] * 100); ctlApply(); });
  $('#ctl-sz').addEventListener('change', ctlSave);
  $('#ctl-op').addEventListener('input', (e) => { CTL.op = Number(e.target.value); $('#ctl-op-v').textContent = '%' + CTL.op; ctlApply(); });
  $('#ctl-free').addEventListener('change', (e) => { CTL.free = e.target.checked; ctlApply(); });
  $('#ctl-one').addEventListener('click', () => { const k = CTL.sel; if (!k) return; delete CTL.pos[k]; delete CTL.sz[k]; ctlApply(); ctlSelect(k); ctlSave(); });
  $('#ctl-reset').addEventListener('click', () => { CTL.op = 100; CTL.free = false; CTL.pos = {}; CTL.sz = {}; ctlSync(); ctlApply(); ctlSave(); });
  $('#ctl-done').addEventListener('click', () => ctlEdit(false));
  $('#set-ctl').addEventListener('click', () => ctlEdit(true));
  $('#set-ctl-row').hidden = !X.touch;
  window.addEventListener('keydown', (e) => { if (CTL.editing && e.key === 'Escape') { e.stopImmediatePropagation(); ctlEdit(false); } }, { capture: true });
  ctlApply();
}
