// The signed-in player's home: a full website around the game (home, play, profile and wardrobe, gem shop,
// friends and private messages, leaderboard, account settings and themes). Text from the server only ever goes
// into textContent.
import { ACCT, ME, LIVE, acctOp, owns, friendsGet, dmHistory, dmSend, topGet, dailyGet, roomsGet, acctCheck, sysNotifyOn, sysNotifySet, appPushCan, appPushOn, appPushSet } from './live.js';
import { ITEMS, SLOTS, SLOT_OF, RARITY, FREE_CLS, isFree, titleOf } from './catalog.js';
import { CLASSES, CLASS_ORDER, DIFFS, MAPS, BUILD, dailyRules, league, LEAGUES, clsNext, BADGES, APP_BUILD } from './config.js';
import { drawCharacter, drawPet } from './render.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.onclick = fn; return b; };
const fmt = (n) => Math.round(n).toLocaleString('tr');
let H = null;
// a window opened on top of another must sit above it
let topZ = 30;
const front = (d) => { d.style.zIndex = String(++topZ); };
let page = 'home';

// ---------- small pieces ----------
const SVGNS = 'http://www.w3.org/2000/svg';
export function gemIcon(size = 16) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('class', 'gem-ic'); s.setAttribute('aria-hidden', 'true');
  for (const [d, f] of [['M12 2 3 9l9 13 9-13z', '#5be3ff'], ['M12 2 7.5 9H3z', '#a6f2ff'], ['M12 2l4.5 7H21z', '#2bb5e0'], ['M7.5 9h9L12 22z', '#38c8f0'], ['M3 9h4.5L12 22z', '#1d93c4']]) {
    const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', f); s.append(p);
  }
  return s;
}
const gemAmt = (n, cls = 'gem-amt') => { const s = el('span', cls); s.append(gemIcon(cls === 'gem-amt big' ? 22 : 15), el('b', '', fmt(n))); return s; };
function ago(t) {
  if (!t) return '';
  const m = Math.max(0, (Date.now() - t) / 60000);
  if (m < 2) return 'az önce';
  if (m < 60) return `${Math.round(m)} dk önce`;
  if (m < 1440) return `${Math.round(m / 60)} saat önce`;
  return `${Math.round(m / 1440)} gün önce`;
}
const nameEl = (name, eq, tag = 'span', cls = 'nm') => {
  const e = el(tag, cls, name);
  const c = eq && ITEMS[eq.nc] ? ITEMS[eq.nc].c : null;
  if (c === 'rainbow') e.classList.add('rainbow'); else if (c) e.style.color = c;
  return e;
};
const colorOf = (eq) => (eq && ITEMS[eq.col] ? ITEMS[eq.col].c : '#ff8a3d');

// A round avatar: the soldier from above, in their colour, hat and gun skin, inside their frame.
export function drawAvatar(cv, eq, opts = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), S = opts.size || 64;
  if (cv.width !== S * dpr) { cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px'; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, S, S);
  const fr = ITEMS[eq && eq.frm] || ITEMS['f.bronz'], r = S / 2;
  const th = THEMES[(eq && eq.thm) || 't.gece'] || THEMES['t.gece'];
  const bg = g.createRadialGradient(r, r * 0.8, 2, r, r, r);
  bg.addColorStop(0, th.a2); bg.addColorStop(1, th.b2);
  g.fillStyle = bg; g.beginPath(); g.arc(r, r, r - 2, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(r, r, r - 3, 0, Math.PI * 2); g.clip();
  // the whole character (gun or blade included) stays inside the circle, slightly left of centre to leave room for the pet
  const k = S / (opts.zoom || 76); g.translate(r - 3 * k, r + 3 * k); g.scale(k, k);
  drawCharacter(g, opts.cls || 'asker', colorOf(eq), opts.angle != null ? opts.angle : -0.8, opts.walk || 0, { alive: true, hat: eq && eq.hat, wsk: eq && eq.wsk, time: opts.time || 0 });
  g.restore();
  if (eq && eq.pet && S >= 56 && !opts.noPet) {
    // the pet sits in the lower right, clipped to the circle so nothing spills past the frame
    g.save(); g.beginPath(); g.arc(r, r, r - 3, 0, Math.PI * 2); g.clip();
    const pk = S / 70; g.translate(r + S * 0.25, r + S * 0.25); g.scale(pk * 1.1, pk * 1.1);
    drawPet(g, eq.pet, 0, 0, -2.4, opts.time || 0, 0, true); g.restore();
  }
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, fr.c[0]); gr.addColorStop(1, fr.c[1]);
  g.strokeStyle = gr; g.lineWidth = Math.max(2.5, S / 16);
  g.beginPath(); g.arc(r, r, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
}
function avatar(eq, size, cls) { const c = el('canvas', 'av'); drawAvatar(c, eq, { size, cls, noPet: size < 60 }); return c; }
const lvlBadge = (l) => el('span', 'lvl-b', String(l || 1));

// ---------- themes ----------
export const THEMES = {
  't.gece': { a: '#ff6b2c', a2: '#2a3a2f', b2: '#0d110f', sky: ['#0b120e', '#121c16'], ground: '#1a231d', fog: 'rgba(255,107,44,0.06)' },
  't.orman': { a: '#8fdc4a', a2: '#2f4a25', b2: '#0b140b', sky: ['#081208', '#13261a'], ground: '#1b2c18', fog: 'rgba(143,220,74,0.06)' },
  't.kan': { a: '#ff3b4a', a2: '#4a161c', b2: '#140607', sky: ['#1a0607', '#2b0b0f'], ground: '#2a1416', fog: 'rgba(255,40,60,0.09)', moon: '#ff3b4a' },
  't.kar': { a: '#7fe3ff', a2: '#3c5566', b2: '#0d1820', sky: ['#0f1c26', '#22394a'], ground: '#cfdde6', fog: 'rgba(255,255,255,0.08)', snow: true },
  't.col': { a: '#ffb547', a2: '#5a3a1a', b2: '#1a0f07', sky: ['#2a1608', '#5a2e10'], ground: '#b9894f', fog: 'rgba(255,181,71,0.08)' },
  't.neon': { a: '#ff3df2', a2: '#2a1446', b2: '#07040f', sky: ['#07040f', '#1a0b33'], ground: '#120a24', fog: 'rgba(61,242,255,0.07)', grid: '#3df2ff' },
  't.altin': { a: '#ffd34d', a2: '#3d3214', b2: '#0c0a04', sky: ['#0c0a04', '#241c08'], ground: '#1e1a0e', fog: 'rgba(255,211,77,0.07)' },
};
// a theme being tried on (not bought or worn yet): the whole site shows it until the preview ends
let pvTheme = null;
const curThm = () => (pvTheme && THEMES[pvTheme] ? pvTheme : ME.eq.thm && THEMES[ME.eq.thm] ? ME.eq.thm : 't.gece');
function applyTheme() {
  $('#dashpage').dataset.theme = curThm().slice(2);
}
function previewTheme(id) {
  if (!THEMES[id]) return;
  pvTheme = id; applyTheme(); hero.flakes.length = 0;
  let bar = $('#thm-pv');
  if (!bar) { bar = el('div', 'thm-pv'); bar.id = 'thm-pv'; bar.setAttribute('role', 'status'); $('#dashpage').append(bar); }
  const have = owns(id) || isFree(id), price = priceOf(id);
  const txt = el('div', 'thm-pv-t'); txt.append(el('span', 'eyebrow', 'Önizleme'), el('strong', '', ITEMS[id].name));
  const acts = el('div', 'thm-pv-a');
  if (have) acts.append(btn('btn primary small', 'Kullan', () => { endPreview(); equip('thm', id === 't.gece' ? '' : id); }));
  else if (price != null) { const b = btn('btn primary small', '', () => { endPreview(); buyDlg(id, price); }); b.append(el('span', '', 'Satın al · '), gemAmt(price)); acts.append(b); }
  acts.append(btn('btn ghost small', 'Bitir', endPreview));
  bar.replaceChildren(el('div', 'theme-sw thm-pv-sw'), txt, acts);
  bar.firstChild.dataset.theme = id.slice(2);
  bar.hidden = false;
  clearTimeout(previewTheme.t); previewTheme.t = setTimeout(endPreview, 45000);
}
function endPreview() { if (!pvTheme) return; pvTheme = null; clearTimeout(previewTheme.t); const b = $('#thm-pv'); if (b) b.hidden = true; applyTheme(); hero.flakes.length = 0; }

// ---------- the hero scene on the home page: your soldier holding off a few zombies ----------
const hero = { raf: 0, t: 0, z: [], shots: [], cv: null, last: 0, aim: 0, flakes: [] };
function heroStart() {
  hero.cv = $('#dp-hero-cv');
  if (!hero.cv || hero.raf) return;
  hero.last = performance.now();
  const loop = (now) => {
    hero.raf = 0;
    if (page !== 'home' || document.hidden || $('#dashpage').hidden) return;
    hero.raf = requestAnimationFrame(loop);
    if (document.body.classList.contains('saver') && now - hero.last < 30.3) return;
    const dt = Math.min(0.05, (now - hero.last) / 1000); hero.last = now;
    heroStep(dt); heroDraw();
  };
  hero.raf = requestAnimationFrame(loop);
}
function heroStep(dt) {
  hero.t += dt;
  const W = hero.cv.clientWidth, Hh = hero.cv.clientHeight, cx = W * 0.72, cy = Hh * 0.58;
  if (hero.z.length < 5 && Math.random() < dt * 1.4) {
    const side = Math.random() < 0.6 ? 1 : -1;
    hero.z.push({ x: side > 0 ? W + 30 : cx - 260 - Math.random() * 120, y: 20 + Math.random() * (Hh - 40), hp: 3, s: 22 + Math.random() * 16, w: Math.random() * 10, dead: 0 });
  }
  let target = null, best = 1e9;
  for (const z of hero.z) {
    if (z.dead) { z.dead += dt; continue; }
    const dx = cx - z.x, dy = cy - z.y, d = Math.hypot(dx, dy);
    z.x += (dx / d) * z.s * dt; z.y += (dy / d) * z.s * dt; z.w += dt * 6; z.a = Math.atan2(dy, dx);
    if (d < best) { best = d; target = z; }
  }
  hero.z = hero.z.filter((z) => z.dead < 0.6 && !(Math.hypot(cx - z.x, cy - z.y) < 30));
  if (target) {
    const want = Math.atan2(target.y - cy, target.x - cx);
    let da = want - hero.aim; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    hero.aim += da * Math.min(1, dt * 6);
    hero.cool = (hero.cool || 0) - dt;
    if (hero.cool <= 0 && Math.abs(da) < 0.25 && best < 330) {
      hero.cool = 0.42;
      hero.shots.push({ x: cx + Math.cos(hero.aim) * 34, y: cy + Math.sin(hero.aim) * 34, tx: target.x, ty: target.y, life: 0.08 });
      if (--target.hp <= 0) target.dead = 0.001;
    }
  }
  for (const s of hero.shots) s.life -= dt;
  hero.shots = hero.shots.filter((s) => s.life > 0);
  const th = THEMES[curThm()];
  if (th.snow) {
    while (hero.flakes.length < 70) hero.flakes.push({ x: Math.random() * W, y: Math.random() * Hh, v: 20 + Math.random() * 40 });
    for (const f of hero.flakes) { f.y += f.v * dt; f.x += Math.sin(hero.t + f.v) * dt * 10; if (f.y > Hh) { f.y = -4; f.x = Math.random() * W; } }
  } else hero.flakes.length = 0;
}
function heroDraw() {
  const cv = hero.cv, dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, Hh = cv.clientHeight;
  if (!W || !Hh) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
  const g = cv.getContext('2d'), th = THEMES[curThm()];
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = g.createLinearGradient(0, 0, W, Hh); sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
  // ground tiles seen from above
  g.globalAlpha = 0.18; g.strokeStyle = th.grid || th.ground; g.lineWidth = 1;
  for (let x = (-hero.t * 6) % 48; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); }
  for (let y = 0; y < Hh; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.globalAlpha = 1;
  if (th.moon) { g.fillStyle = th.moon; g.globalAlpha = 0.25; g.beginPath(); g.arc(W * 0.12, Hh * 0.2, 36, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
  const cx = W * 0.72, cy = Hh * 0.58;
  // flashlight cone
  const cone = g.createRadialGradient(cx, cy, 10, cx, cy, 300);
  cone.addColorStop(0, 'rgba(255,240,200,0.16)'); cone.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = cone; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 300, hero.aim - 0.45, hero.aim + 0.45); g.closePath(); g.fill();
  for (const z of hero.z) drawMiniZombie(g, z);
  for (const s of hero.shots) {
    g.strokeStyle = 'rgba(255,220,140,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.tx, s.ty); g.stroke();
    g.fillStyle = 'rgba(255,200,90,0.8)'; g.beginPath(); g.arc(s.x, s.y, 6, 0, Math.PI * 2); g.fill();
  }
  g.save(); g.translate(cx, cy); g.scale(1.7, 1.7);
  drawCharacter(g, heroCls(), colorOf(ME.eq), hero.aim, hero.t * 8 * 0, { alive: true, hat: ME.eq.hat, wsk: ME.eq.wsk, time: hero.t });
  g.restore();
  for (const f of hero.flakes) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(f.x, f.y, 2, 2); }
  const fog = g.createLinearGradient(0, 0, W * 0.6, 0); fog.addColorStop(0, 'rgba(0,0,0,0.75)'); fog.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fog; g.fillRect(0, 0, W, Hh);
}
function drawMiniZombie(g, z) {
  g.save(); g.translate(z.x, z.y); g.rotate(z.a || 0);
  const k = z.dead ? 1 - z.dead / 0.6 : 1;
  g.globalAlpha = Math.max(0, k);
  if (z.dead) { g.fillStyle = 'rgba(120,10,10,0.5)'; g.beginPath(); g.arc(0, 0, 18 * (1 + z.dead), 0, Math.PI * 2); g.fill(); }
  const sw = Math.sin(z.w) * 4;
  g.fillStyle = '#3d5a2e';
  g.fillRect(4, -11 + sw * 0.3, 14, 4); g.fillRect(4, 7 - sw * 0.3, 14, 4);
  g.fillStyle = '#4c6b39'; g.beginPath(); g.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6f8f55'; g.beginPath(); g.arc(2, 0, 6.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e33'; g.fillRect(6, -3, 2, 2); g.fillRect(6, 1, 2, 2);
  g.restore();
}
let heroC = '';
function heroCls() {
  if (!heroC) { const mine = CLASS_ORDER.filter((c) => FREE_CLS.includes(c) || ME.own.includes('c.' + c)); heroC = mine[Math.floor(Math.random() * mine.length)] || 'asker'; }
  return heroC;
}

// ---------- top bar ----------
function topBar() {
  const g = $('#dp-gems'); g.replaceChildren(gemIcon(18), el('b', '', fmt(ME.gems)));
  const av = $('#dp-av-cv'); drawAvatar(av, ME.eq, { size: 36, cls: heroCls() });
  $('#dp-name').replaceChildren(nameEl(ACCT.name, ME.eq));
  $('#dp-lvl').textContent = `Seviye ${ME.lvl}`;
  $('#dp-xpbar').style.width = Math.round(100 * ME.lx / Math.max(1, ME.ln)) + '%';
  const fq = ME.fq.length, un = ME.un | 0;
  for (const b of document.querySelectorAll('[data-badge="fr"]')) { b.textContent = fq + un ? String(fq + un) : ''; b.hidden = !(fq + un); }
  $('#dp-daily').classList.toggle('ready', !ME.dl);
  for (const b of document.querySelectorAll('[data-badge="q"]')) { b.textContent = ME.qn ? String(ME.qn) : ''; b.hidden = !ME.qn; }
  const sp = ME.spn | 0;
  for (const b of document.querySelectorAll('[data-badge="sp"]')) { b.textContent = sp ? String(sp) : ''; b.hidden = !sp; }
  bellBadge();
}

// ---------- pages ----------
const PAGES = { clan: clanPage, season: seasonPage, quests: questsPage, home: homePage, play: playPage, profile: profilePage, locker: lockerPage, shop: shopPage, friends: friendsPage, top: topPage, account: accountPage };
// each page has its own address under the game's root: /oyun, /oyun/gorevler, /oyun/magaza...
const SLUG = { clan: 'klan', home: '', play: 'oyna', quests: 'gorevler', season: 'sezon', shop: 'magaza', profile: 'profil', locker: 'dolap', friends: 'arkadaslar', top: 'siralama', account: 'ayarlar' };
const ROOT = () => window.KROOT || './';
export function pageFromPath() { const m = location.pathname.slice(ROOT().length).match(/^oyun(?:\/([a-z]+))?\/?$/); if (!m) return null; const s = m[1] || ''; return Object.keys(SLUG).find((k) => SLUG[k] === s) || null; }
function setPath(p, replace) {
  // the home page lives at the site root, every other page at oyun/<slug>
  const want = SLUG[p] ? ROOT() + 'oyun/' + SLUG[p] : ROOT();
  if (location.pathname === want || (!SLUG[p] && !pageFromPath() && location.pathname.startsWith(ROOT()))) { if (!history.state || history.state.dp !== p) { try { history.replaceState({ dp: p }, '', location.href); } catch (e) { /* ignore */ } } return; }
  try { history[replace ? 'replaceState' : 'pushState']({ dp: p }, '', want + location.search); } catch (e) { /* ignore */ }
}
addEventListener('popstate', (e) => { const p = (e.state && e.state.dp) || pageFromPath() || 'home'; if (p && ACCT && !$('#dashpage').hidden && p !== page) dashGo(p, undefined, true); });
export function dashGo(p, arg, fromHistory) {
  if (!PAGES[p]) p = 'home';
  if (!fromHistory && ACCT && !$('#dashpage').hidden) setPath(p, !shown2);
  shown2 = true;
  page = p;
  for (const b of document.querySelectorAll('[data-dp]')) b.setAttribute('aria-selected', String(b.dataset.dp === p || ((p === 'locker' || ((p === 'top' || p === 'account') && innerWidth <= 880)) && b.dataset.dp === 'profile')));
  if (!ACCT) return;
  const main = $('#dp-page');
  main.replaceChildren();
  main.scrollTop = 0;
  const sec = el('section', 'dp-sec');
  main.append(sec);
  PAGES[p](sec, arg);
  if (p === 'home') heroStart();
  try { localStorage.setItem('kusatma-dp', p === 'locker' ? 'profile' : p); } catch (e) { /* ignore */ }
}
const head = (sec, eyebrow, title, extra) => {
  const h = el('div', 'dp-pagehead');
  const t = el('div'); t.append(el('p', 'eyebrow', eyebrow), el('h2', 'dp-h', title));
  h.append(t); if (extra) h.append(extra);
  sec.append(h);
};
const card = (title, action) => {
  const c = el('div', 'dp-card');
  if (title) { const h = el('div', 'dp-card-h'); h.append(el('h3', '', title)); if (action) h.append(action); c.append(h); }
  return c;
};

// a horizontal strip that scrolls with arrows, drag or the wheel, never a browser scrollbar
function scroller(track) {
  const wrap = el('div', 'sp-wrap'), mv = (d) => track.scrollBy({ left: d * track.clientWidth * 0.8, behavior: 'smooth' });
  const pb = btn('sp-arrow l', '‹', () => mv(-1)), nb = btn('sp-arrow r', '›', () => mv(1));
  pb.setAttribute('aria-label', 'Geri'); nb.setAttribute('aria-label', 'İleri');
  const edge = () => { wrap.classList.toggle('at-l', track.scrollLeft < 8); wrap.classList.toggle('at-r', track.scrollLeft > track.scrollWidth - track.clientWidth - 8); };
  track.addEventListener('scroll', edge, { passive: true }); setTimeout(edge, 80); new ResizeObserver(edge).observe(track);
  track.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && track.scrollWidth > track.clientWidth) { track.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  // drag with the mouse too (even when the press starts on a button; a real drag doesn't count as a click)
  let dx = null, sl = 0, moved = false;
  track.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; dx = e.clientX; sl = track.scrollLeft; moved = false; });
  addEventListener('pointermove', (e) => { if (dx == null) return; const d = e.clientX - dx; if (!moved && Math.abs(d) > 6) { moved = true; track.classList.add('drag'); } if (moved) track.scrollLeft = sl - d; });
  addEventListener('pointerup', () => { dx = null; track.classList.remove('drag'); setTimeout(() => { moved = false; }, 0); });
  track.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  track.classList.add('sx'); wrap.append(track, pb, nb);
  // keep the chosen tab in view
  setTimeout(() => { const on = track.querySelector('[aria-selected="true"], .on, .cur'); if (on && track.scrollWidth > track.clientWidth) track.scrollLeft = Math.max(0, on.offsetLeft - (track.clientWidth - on.offsetWidth) / 2); }, 0);
  return wrap;
}
// a row of tabs that slides sideways (touch, mouse drag, wheel and arrows) when it doesn't fit
function segTabs(tabs) { const w = scroller(tabs); w.classList.add('seg-wrap'); return w; }
function homePage(sec) {
  const heroBox = el('div', 'dp-hero');
  const cv = el('canvas'); cv.id = 'dp-hero-cv'; cv.setAttribute('aria-hidden', 'true');
  const txt = el('div', 'dp-hero-txt');
  txt.append(el('p', 'eyebrow', LIVE.shop && LIVE.shop.mul > 1 ? `Etkinlik: ${LIVE.shop.mul}× elmas` : 'Tekrar hoş geldin'));
  const h = el('h2', 'dp-hero-h'); h.append(document.createTextNode('Selam, '), nameEl(ACCT.name, ME.eq)); txt.append(h);
  const lv = el('div', 'dp-hero-lvl');
  const bar = el('div', 'xpbar'); const fill = el('i'); fill.style.width = Math.round(100 * ME.lx / Math.max(1, ME.ln)) + '%'; bar.append(fill);
  lv.append(lvlBadge(ME.lvl), el('span', '', `Seviye ${ME.lvl}`), bar, el('span', 'dim', `${fmt(ME.lx)} / ${fmt(ME.ln)} XP`));
  txt.append(lv);
  const acts = el('div', 'dp-hero-acts');
  acts.append(btn('btn primary big play-btn', 'Oyna', () => dashGo('play')), btn('btn ghost quick-btn', 'Hızlı oyna', () => H.quick()), btn('btn ghost', 'Tek başına', () => H.solo()), btn('btn ghost', 'Oda kur', () => H.roomDlg()), btn('btn ghost phone-only', 'Sıralama', () => dashGo('top')));
  txt.append(acts);
  heroBox.append(cv, txt);
  sec.append(heroBox);
  sec.append(newsCard());
  sec.append(dailyCard());
  sec.append(spinCard());

  // friends strip
  const fr = card('Arkadaşlar', btn('btn small ghost', 'Tümü', () => dashGo('friends')));
  const strip = el('div', 'fr-strip'); strip.id = 'home-fr';
  const add = btn('fr-dot add', '', () => dashGo('friends', 'add')); add.append(el('span', 'plus', '+'), el('span', 'fn', 'Ekle'));
  strip.append(add);
  fr.append(scroller(strip));
  sec.append(fr);
  friendsGet().then((d) => { if (d) onFriends(d); });

  const row = el('div', 'dp-grid3');
  // daily reward
  const daily = card('Günlük ödül');
  const dl = el('div', 'daily');
  dl.append(el('div', 'daily-gem'));
  dl.firstChild.append(gemIcon(40));
  // 7-day login streak: claimed days are filled, today is highlighted, day 7 pays the most
  const base = LIVE.shop ? LIVE.shop.login : 20, mul = ME.lsm || [1, 1.25, 1.5, 2, 2.5, 3, 7];
  const done = ME.ls | 0, todayN = ME.dl ? done : (done % 7) + 1;
  const dt = el('div'); dt.append(el('strong', '', ME.dl ? `Seri: ${done}. gün alındı` : `${todayN}. gün: +${fmt(Math.round(base * mul[todayN - 1]))} elmas seni bekliyor`), el('span', 'dim', ME.dl ? 'Yarın gel, seri devam etsin.' : 'Bir gün kaçırırsan seri baştan başlar.'));
  dl.append(dt);
  const cal = el('div', 'streak-cal');
  for (let i = 1; i <= 7; i++) { const d = el('div', 'sc-d' + (i <= (ME.dl ? done : todayN - 1) ? ' got' : '') + (i === todayN && !ME.dl ? ' now' : '') + (i === 7 ? ' big' : '')); d.append(el('span', 'sc-n', i + '. gün'), gemIcon(i === 7 ? 18 : 13), el('b', '', fmt(Math.round(base * mul[i - 1])))); cal.append(d); }
  const db = btn('btn primary', ME.dl ? 'Alındı ✓' : 'Al', async () => { db.disabled = true; await claimDaily(); dashGo('home'); });
  db.disabled = ME.dl;
  daily.append(dl, cal, db);
  // today's gems
  const today = card('Bugün kazandığın');
  const cap = (LIVE.shop && LIVE.shop.cap) || 400;
  const tb = el('div', 'xpbar gem'); const tf = el('i'); tf.style.width = Math.min(100, Math.round(100 * ME.gd / cap)) + '%'; tb.append(tf);
  today.append(gemAmt(ME.gd, 'gem-amt big'), tb, el('p', 'note', ME.gd >= cap ? 'Bugünkü sınıra ulaştın. Yarın devam!' : `Günde en çok ${cap} elmas kazanılır. Zor dalgalar ve bosslar daha çok verir.`));
  // featured item
  const fid = (LIVE.shop && LIVE.shop.feat) || 'h.kovboy';
  const feat = card('Öne çıkan', btn('btn small ghost', 'Mağaza', () => dashGo('shop')));
  feat.append(itemCard(fid, true));
  row.append(daily, today, feat);
  sec.append(row);
  const qc = card('Bugünün görevleri', btn('btn small ghost', 'Tümü', () => dashGo('quests')));
  const ql = el('div', 'q-list'); ql.append(el('p', 'note', 'Yükleniyor…')); qc.append(ql);
  sec.append(qc);
  loadQuests().then((j) => { if (j) ql.replaceChildren(...j.q.map((q, i) => questRow(q, i, true))); else ql.replaceChildren(el('p', 'note', 'Görevler yüklenemedi.')); });

  const row2 = el('div', 'dp-cols');
  const ra = el('div', 'row card-acts');
  const rr = btn('btn small ghost', 'Yenile', () => { if (rr.disabled) return; rr.disabled = true; loadRooms(); setTimeout(() => { rr.disabled = false; }, 5000); }); // at most once every 5 s
  ra.append(rr, btn('btn small ghost', 'Tümü', () => dashGo('play')));
  const rooms = card('Açık odalar', ra);
  const ul = el('ul', 'dp-rooms'); ul.append(el('li', 'empty', 'Yükleniyor…')); rooms.append(ul);
  ul.dataset.rooms = '4';
  const loadRooms = () => roomsGet().then((j) => ul.replaceChildren(...H.roomItems(j.ok ? j.rooms : null, 4)));
  loadRooms();
  const st = card('İstatistiklerin');
  st.append(statList());
  row2.append(rooms, st);
  sec.append(row2);
  if (LIVE.news.on && LIVE.news.text) { const n = el('div', 'dp-news'); n.append(el('strong', '', 'Duyuru'), el('span', '', LIVE.news.text)); sec.prepend(n); }
}
// what's on now (events with a countdown, players online) and what this version added
const WHATS_NEW = ['Oyun güncellemeleri artık yaklaşık üç kat daha az internet kullanıyor: kurucunun telefonu kalabalık dalgalarda bile arkadaşlarına rahatça yetişiyor. Eski sürümle aynı odada oynanamaz; sayfayı bir kez yenile.', 'Arkadaşlarla oynarken donmalar azaldı: kurucunun bağlantısı zorlanınca eski veri sıraya girmiyor, en yenisi gidiyor. Kısa gecikmelerde zombiler durmadan yürümeye devam eder; gecikme uzarsa üstte "Bağlantı zayıf" yazar.', 'Sesli sohbet daha az internet kullanıyor; bağlantı çok zorlanırsa ses bir anlığına kalitesini düşürür, oyun donmaz.', 'Performans raporları: istatistiklere izin verdiysen oyun dakikada bir kısa bir hız özeti gönderir, donmaları bulup düzeltmemize yardım eder.', 'Hile koruması: oyuna katılan biri imkânsız hasar veremez, ışınlanamaz; dalga atlayan rapor elmas ve sıralama kazandırmaz.', 'Hızlı oyna artık her zaman sınıf seçimini gösteriyor: lobisi açık bir odaya katılırsın ya da tek başına oyunun lobisi açılır.', 'Hayalet zombiler kökten düzeltildi: kayıplı bağlantıda bile ölen zombi ekranında kalmıyor. Farklı sürümler artık aynı odada oynayamaz (sayfayı yenile).', 'Hacker\'ın ele geçirdiği zombilere artık kendi bombaların ve kulelerin zarar vermiyor.', 'Kurucunun bilgisayarı daha az yoruluyor: zombi yol haritası yalnız gerektiğinde yeniden hesaplanıyor.', 'Telefonda daha küçük oyun ekranı: dalga, can, boss ve harita daha az yer kaplıyor. Ayarlar → Ekran düzeni ile her parçayı taşıyıp boyutunu ayarlayabilirsin.', 'Dalga bitince ekranda kalan hayalet zombiler düzeltildi.', 'Düşük FPS\'te yavaş yürüme düzeltildi: oyun artık her kare hızında gerçek zamanlı.', 'Eğitmen\'in köpeği artık ekranda gerçekten koşuyor ve duvar arkasında takılmıyor.', 'Hacker: ele geçirilen zombiler olduğu pozda donmuyor; yakındaki zombiler de alınabiliyor.', 'Kılıççı Vampir dalı: kan kalkanı artık gerçek bir kalkan ve çubuğu görünüyor.', 'Zombi köpek ve yarasaların can çubuğu var. Cephanelikte Sargı tuşu telefonda belirgin.', 'Her sınıfın artık dört kendine özel silah yolu var: ısınan namlular, işaret, can emme, çekme, birikim, sekme, virüs ve daha fazlası.', 'Bildirim seçenekleri: hangi bildirimleri istediğini seç, sessiz saatler koy.', 'Çevrimdışı arkadaşını odana davet et: telefonuna bildirim gider, dokununca odaya katılır.', 'Haftalık görevler ve haftanın sıralaması: ilk 10 her pazartesi elmas alır.', 'Oyunda bir görev ya da başarım tamamlanınca ekranda hemen kart çıkar.', 'Oyun sonunda yeni ödüller (Boss avcısı, Elit avcısı) ve Sonucu paylaş: sonucunun resmini paylaş.', 'Bir arkadaşın odaya girince Katıl tuşlu bildirim gelir.', 'Telefon yan tutulunca Cephanelik ve sınıf seçimi ekrana sığıyor: menüler solda, liste sağda ve kendi içinde kayıyor.', 'Telefonda kayıt ve giriş düzeltildi; yavaş internette "ad alınmış" hatası da giderildi.', 'Sayfayı yenileyince odadaki yerine hemen geri dönersin (iki kopya oluşmaz).', 'Hızlı oyna: tek dokunuşla açık bir odaya katıl, yoksa hemen tek başına başla.', 'Telefonda kontrolleri düzenle: tuşları taşı, boyutlarını ve saydamlığını ayarla, serbest joystick.', 'Pil tasarrufu: 30 FPS ve daha az parçacık; pil azalınca kendiliğinden açılır.', 'Bekleme ekranında ipuçları, lobide harita önizlemesi.', 'Vuruş hissi: ağır vuruşlar ekranı sarsar, silahlar geri teper; her silahın ve zombinin kendi sesi var.', 'Oyunun kendi müziği (Ayarlar → Müzik).', 'Hızlı takım mesajları: Z ya da telefonda Hızlı; G ile haritada işaretle.', 'Düşünce seni neyin devirdiğini görürsün; mikrofonun açıkken üstte gösterge çıkar.', 'Denge: Kılıççı, Ajan ve Nişancı güçlendi; Tesla\'nın yüksek gerilim yolu biraz zayıfladı.', 'Kılıç savurma ve Kasırga artık net görünüyor.', 'Yeni mikrofon düğmesi: basılı tut konuş, kısa dokun mikrofonu açık bırak. Telefonda artık oyunda da görünüyor.', 'Hacker\'ın ele geçirdiği zombilerin ısırdığı zombilerin ölmemesi düzeltildi.', 'Odadan düşenler ve sayfayı yenileyenler yerlerine geri dönebiliyor.', 'Android uygulaması 45.0: oyun kapalıyken bile mesaj, arkadaşlık isteği ve klan davetleri telefonuna bildirim olarak gelir.', 'Klanlar: klan kur ya da katıl, etiketin oyunda adının önünde görünür. Sıralamada klan sekmesi var.', 'Sınıf seviyeleri: her sınıf kendi seviyesini kazanır (en çok 30), her seviye 20 elmas.', 'Rozet koleksiyonu profilinde: oynadıkça kendiliğinden kazanılır.', 'Tarayıcı bildirimleri: Ayarlar\'dan açarsan arka plandaki sekmede mesaj ve davetleri bildirir.', 'Önceki yapılardan: PvP ve dereceli lig, 4 yeni sınıf, 4 yeni harita, yeni düşmanlar, sesli sohbet, 20 kişilik odalar.'];
const leftT = (t) => { const s = Math.max(0, Math.round((t - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} gün ${h} sa` : h ? `${h} sa ${m} dk` : m ? `${m} dk ${s % 60} sn` : `${s} sn`; };
function newsCard() {
  const c = card('Neler var?'); c.classList.add('dp-whatsnew');
  const live = el('div', 'wn-live'), ticks = [];
  const ev = (cls, title, until) => { const r = el('div', 'wn-ev ' + cls); const t = el('span', 'wn-t'); r.append(el('strong', '', title), t); if (until) ticks.push([t, until]); live.append(r); };
  const sh = LIVE.shop, now = Date.now();
  if (sh && sh.mul > 1 && (!sh.until || sh.until > now)) ev('gem', `${sh.mul}× elmas etkinliği`, sh.until);
  if (sh && sh.saleAll > 0 && sh.saleUntil > now) ev('sale', `Mağazada %${sh.saleAll} indirim`, sh.saleUntil);
  if (LIVE.on > 0) ev('on', `${fmt(LIVE.on)} oyuncu şu an çevrimiçi`, 0);
  if (!live.childElementCount) ev('none', 'Şu an etkinlik yok', 0);
  const tick = () => { if (!c.isConnected && ticks.length) { clearInterval(iv); return; } for (const [t, u] of ticks) t.textContent = u > Date.now() ? 'bitmesine ' + leftT(u) : 'bitti'; };
  const iv = setInterval(tick, 1000); tick();
  const ul = el('ul', 'wn-list'); for (const x of WHATS_NEW) ul.append(el('li', '', x));
  const nw = el('div', 'wn-new'); nw.append(el('span', 'eyebrow', 'Bu sürümde'), ul);
  c.append(live, nw);
  return c;
}
// the daily challenge: the same map, class and difficulty for everyone today
function dailyCard() {
  const R = dailyRules(), done = !!ME.dc;
  const c = el('div', 'dp-card daily-ch');
  const l = el('div', 'dc-l');
  l.append(el('p', 'eyebrow', 'Günün görevi'), el('h3', '', `${MAPS[R.map].name} · ${CLASSES[R.cls].name} · ${DIFFS[R.diff].name}`));
  l.append(el('p', 'dim', done ? `Bugünkü denemen: ${ME.dc.w}. dalga, ${fmt(ME.dc.k)} zombi. Yeni denemeler sıralamaya girmez.` : 'Herkes aynı harita ve sınıfla oynar. Günün ilk denemesi sıralamaya girer. İlk 10 ertesi gün elmas kazanır.'));
  const acts = el('div', 'row');
  acts.append(btn('btn primary', done ? 'Yine oyna' : 'Göreve başla', () => H.daily()));
  const prize = el('span', 'dc-prize'); acts.append(prize);
  l.append(acts);
  const r = el('ol', 'dc-top'); r.append(el('li', 'empty', 'Yükleniyor…'));
  c.append(l, r);
  dailyGet().then((j) => {
    if (!j.ok) { r.replaceChildren(el('li', 'empty', 'Sıralama yüklenemedi.')); return; }
    r.replaceChildren(...(j.top.length ? j.top.slice(0, 5).map((x, i) => { const li = el('li', ACCT && x.id === ACCT.id ? 'me' : ''); li.append(el('span', 'rk', String(i + 1)), nameEl(x.name, x.eq || {}), el('span', 'tv', `${x.w}. dalga`)); return li; }) : [el('li', 'empty', 'Bugün henüz kimse oynamadı. İlk sen ol!')]));
    const yi = (j.y || []).findIndex((x) => ACCT && x.id === ACCT.id);
    if (yi >= 0 && ME.dcc !== j.yday) {
      const b = btn('btn gem-btn', '', async () => {
        b.disabled = true; const k = await acctOp('dcp');
        if (k.ok) { ME.dcc = j.yday; H.toast(`Dünkü görevde ${k.rank}. oldun: +${k.n} elmas!`, 'gem'); gemBurst(); b.remove(); topBar(); }
        else { b.disabled = false; H.toast(k.reason === 'done' ? 'Bu ödülü zaten aldın.' : 'Ödül alınamadı.', 'bad'); }
      });
      b.append(document.createTextNode(`Dün ${yi + 1}. oldun · `), gemIcon(14), el('b', '', '+' + (j.prize[yi] || 0)));
      prize.append(b);
    }
  });
  return c;
}
// a profile banner: the item's two colours and a light pattern
export function bannerEl(id, cls) {
  const it = ITEMS[id] || ITEMS['b.gece'], d = el('div', cls + ' ban-' + (it.pat || 'plain'));
  d.style.setProperty('--b1', it.c[0]); d.style.setProperty('--b2', it.c[1]);
  return d;
}

// ---------- the daily spin wheel ----------
const SPIN = [['10', 'gem'], ['25', 'gem'], ['50', 'gem'], ['100', 'gem'], ['250', 'gem'], ['120 XP', 'xp'], ['350 XP', 'xp'], ['Unvan', 'item'], ['Çerçeve', 'item']];
const SPIN_COL = ['#24402e', '#1f3a4a', '#2f2a4a', '#4a2a2a', '#5a4a12', '#203a3a', '#2a3a20', '#4a2a44', '#5a3a14'];
function drawWheel(cv, rot) {
  const S = cv.clientWidth || 180, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== S * dpr) { cv.width = S * dpr; cv.height = S * dpr; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
  const r = S / 2 - 6, n = SPIN.length, a0 = -Math.PI / 2;
  g.save(); g.translate(S / 2, S / 2); g.rotate(rot);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 - Math.PI / n, b = a + Math.PI * 2 / n;
    g.fillStyle = SPIN_COL[i]; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a, b); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.stroke();
    g.save(); g.rotate(a0 + (i / n) * Math.PI * 2); g.fillStyle = SPIN[i][1] === 'item' ? '#ffd34d' : '#ece6d6'; g.font = `700 ${Math.round(S / 17)}px Rubik, system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(SPIN[i][0], r - 8, 0); g.restore();
  }
  g.restore();
  g.fillStyle = '#ece6d6'; g.beginPath(); g.arc(S / 2, S / 2, 12, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffd34d'; g.lineWidth = 4; g.beginPath(); g.arc(S / 2, S / 2, r + 2, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ff6b2c'; g.beginPath(); g.moveTo(S / 2 - 10, 2); g.lineTo(S / 2 + 10, 2); g.lineTo(S / 2, 22); g.closePath(); g.fill();
}
let spinRot = 0;
// the prize window after a spin: a big icon, what you got, your balance and the next spin
function spinPop(j, what, again) {
  const old = document.querySelector('.spin-pop'); if (old) old.remove();
  const bg = el('div', 'spin-pop'), box = el('div', 'spin-box dp-card'), ic = el('div', 'spin-ic');
  if (j.it && ITEMS[j.it]) { const it = ITEMS[j.it]; ic.append(el('span', 'spin-it', it.name)); ic.classList.add('item'); }
  else if (j.x) { ic.append(el('b', '', '+' + fmt(j.x)), el('span', '', 'XP')); ic.classList.add('xp'); }
  else { ic.append(gemIcon(54), el('b', '', '+' + fmt(j.g))); ic.classList.add('gem'); }
  const bal = el('p', 'spin-bal'); bal.append(document.createTextNode('Bakiyen: '), gemIcon(15), el('b', '', fmt(ME.gems)));
  const s = ME.spin || {}, max = LIVE.shop && LIVE.shop.spinMax != null ? LIVE.shop.spinMax : 5;
  const left = Math.max(0, max - (s.n | 0));
  const acts = el('div', 'row spin-acts');
  const close = btn('btn', 'Kapat', () => bg.remove());
  acts.append(close);
  if (left > 0 && !again.disabled) { const a = btn('btn primary', '', () => { bg.remove(); again.click(); }); a.append(document.createTextNode('Tekrar çevir · '), gemIcon(14), el('b', '', fmt(LIVE.shop && LIVE.shop.spinP != null ? LIVE.shop.spinP : 100))); acts.append(a); }
  box.append(el('p', 'eyebrow', 'Şans çarkı'), ic, el('h3', '', what), bal, el('p', 'dim', left > 0 ? `Bugün ${left} çevirme hakkın kaldı.` : 'Bugünlük çevirmelerin bitti. Yarın ücretsiz çevirme yenilenir.'), acts);
  bg.append(box); bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.append(bg); close.focus();
}
function spinCard() {
  const c = el('div', 'dp-card spin-card'), cv = el('canvas', 'wheel');
  const t = el('div', 'spin-t');
  const sp = ME.spin || { free: true, n: 0 }, sh = LIVE.shop || {}, price = sh.spinP == null ? 100 : sh.spinP, max = sh.spinMax == null ? 5 : sh.spinMax;
  const hd = el('h3', '', sp.free ? 'Bugünkü ücretsiz çevirmen hazır!' : 'Bugünkü ücretsiz çevirmeni kullandın');
  t.append(el('p', 'eyebrow', 'Şans çarkı'), hd,
    el('p', 'dim', `Ekstra çevirme ${price} elmas (günde en çok ${max}).`));
  { const pr = el('div', 'spin-prizes'); for (const [v, k] of SPIN) { const c2 = el('span', 'sp-chip ' + k); if (k === 'gem') c2.append(gemIcon(13), el('b', '', v)); else c2.append(el('b', '', v)); pr.append(c2); } t.append(pr); }
  const b = btn('btn primary' + (sp.free ? '' : ' gem-btn'), '');
  const label = () => { b.replaceChildren(); const s = ME.spin || sp; hd.textContent = s.free ? 'Bugünkü ücretsiz çevirmen hazır!' : (s.n | 0) >= max ? 'Bugünlük çevirmelerin bitti' : 'Ücretsiz çevirmeni kullandın'; if (s.free) b.textContent = 'Ücretsiz çevir'; else if ((s.n | 0) >= max) { b.textContent = 'Yarın tekrar gel'; b.disabled = true; } else { b.append(document.createTextNode('Tekrar çevir · '), gemIcon(14), el('b', '', fmt(price))); } };
  label();
  b.onclick = async () => {
    const s = ME.spin || sp; b.disabled = true;
    const j = await acctOp('spin', { buy: s.free ? 0 : 1 });
    if (!j.ok) { b.disabled = false; H.toast({ gems: 'Yeterli elmasın yok.', max: 'Bugünlük bu kadar. Yarın gel!', used: 'Ücretsiz çevirmeni kullandın.', slow: 'Biraz bekle.' }[j.reason] || 'Çevrilemedi.', 'bad'); return; }
    ME.spin = { free: false, n: j.n }; ME.gems = j.gems;
    if (j.it && !ME.own.includes(j.it)) ME.own.push(j.it); if (j.pass) ME.pass = j.pass;
    // spin: several turns, then stop with the prize under the pointer
    const n = SPIN.length, target = -(j.i / n) * Math.PI * 2, from = spinRot, to = target - Math.PI * 2 * (5 + Math.floor(spinRot / (Math.PI * 2))) - Math.PI * 2 * 5;
    const t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 3600;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      spinRot = from + (to - from) * e; drawWheel(cv, spinRot);
      if (k < 1) { requestAnimationFrame(step); return; }
      spinRot = to % (Math.PI * 2);
      const what = j.it ? `${ITEMS[j.it] ? ITEMS[j.it].name : j.it} kazandın!` : j.x ? `+${j.x} XP kazandın!` : `+${fmt(j.g)} elmas kazandın!`;
      notify('gem', 'Şans çarkı', what); if (j.g) gemBurst(); topBar(); b.disabled = false; label(); spinPop(j, what, b);
    };
    requestAnimationFrame(step);
  };
  t.append(b);
  c.append(cv, t);
  requestAnimationFrame(() => drawWheel(cv, spinRot));
  return c;
}

// a pet on its own little canvas, turning slowly
function petCanvas(id, S) {
  const cv = el('canvas', 'pet-cv'), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2); bg.addColorStop(0, 'rgba(255,255,255,.08)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2 + 2); const k = S / 34; g.scale(k, k); drawPet(g, id, 0, 0, -Math.PI / 2 + 0.35, 1.2, 0, true); g.restore();
  return cv;
}

// ---------- season pass ----------
let SP = null;
function seasonCell(r, st, onClaim) {
  const c = el('button', 'sp-cell ' + st); c.type = 'button';
  if (r.i && ITEMS[r.i]) {
    const it = ITEMS[r.i]; c.classList.add('r-' + it.r);
    const pv = el('div', 'sp-ic');
    if (r.i[0] === 'p') pv.append(petCanvas(r.i, 46));
    else if ('hrwf'.includes(r.i[0])) { const cv = el('canvas'); drawAvatar(cv, Object.assign({}, ME.eq, { [SLOT_OF[r.i[0]].k]: r.i }), { size: 46, noPet: true }); pv.append(cv); }
    else if (r.i[0] === 'n') pv.append(nameEl('Aa', { nc: r.i }, 'span', 'nm'));
    else pv.append(el('span', 'sp-ttl', '“' + it.name + '”'));
    c.append(pv, el('span', 'sp-n', it.name));
  } else { const pv = el('div', 'sp-ic'); pv.append(gemIcon(26)); c.append(pv, el('span', 'sp-n', '+' + fmt(r.g || 0))); }
  if (st === 'got') c.append(el('span', 'sp-st', '✓'));
  if (st === 'lock') c.append(el('span', 'sp-st', '🔒'));
  if (st === 'ready') c.onclick = onClaim; else c.disabled = st !== 'ready';
  return c;
}
function seasonPage(sec) {
  head(sec, 'Sezon kartı', 'Yükleniyor…');
  const body = el('div', 'sp-body'); body.append(el('p', 'note', 'Yükleniyor…')); sec.append(body);
  acctOp('sp').then((j) => { if (j.ok) { SP = j; ME.spn = j.n; topBar(); if (page === 'season') drawSeason(sec, body); } else body.replaceChildren(el('p', 'note', 'Sezon bilgisi yüklenemedi.')); });
}
async function spClaim(t, tr) {
  const j = await acctOp('spcl', t ? { t, tr } : {});
  if (!j.ok) { H.toast(j.reason === 'none' ? 'Alınacak ödül yok.' : 'Ödül alınamadı.', 'bad'); return; }
  SP = j; ME.gems = j.gems; ME.spn = j.n;
  if (j.got && j.got.length) { for (const id of j.got) if (!ME.own.includes(id)) ME.own.push(id); if (j.pass) ME.pass = j.pass; }
  const parts = []; if (j.g) parts.push(`+${fmt(j.g)} elmas`); for (const id of j.got || []) parts.push(ITEMS[id] ? ITEMS[id].name : id);
  H.toast('Sezon ödülü: ' + parts.join(', '), 'gem'); gemBurst(); topBar();
  if (page === 'season') dashGo('season');
}
function drawSeason(sec, body) {
  const j = SP;
  sec.querySelector('.dp-h').textContent = j.name;
  const days = Math.max(0, Math.ceil((j.end - Date.now()) / 864e5));
  const top = el('div', 'sp-top');
  const prog = el('div', 'sp-prog');
  const inTier = j.tier >= 30 ? j.per : j.x - j.tier * j.per;
  const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * inTier / j.per) + '%'; bar.append(f);
  prog.append(el('div', 'sp-tier', String(j.tier)), el('div', 'sp-pt'));
  prog.lastChild.append(el('strong', '', j.tier >= 30 ? 'Son kademe!' : `Kademe ${j.tier} / 30`), bar, el('span', 'dim', j.tier >= 30 ? `${fmt(j.x)} sezon XP` : `Sonraki kademe: ${fmt(inTier)} / ${fmt(j.per)} XP · Oynadıkça XP kazanırsın`));
  top.append(prog, el('span', 'sp-left', `${days} gün kaldı`));
  const acts = el('div', 'row');
  { const b = btn('btn primary', j.n ? `Hepsini al (${j.n})` : 'Hepsini al', () => spClaim(0)); b.disabled = !j.n; if (!j.n) b.title = 'Alınacak ödül yok'; acts.append(b); }
  top.append(acts);
  const nodes = [top];
  if (!j.prem) {
    const pc = el('div', 'sp-prem');
    const t = el('div'); t.append(el('strong', '', 'Premium sezon kartı'), el('span', 'dim', 'Premium yolun bütün ödülleri: Kurt evcil hayvanı, Gazi kaskı, Gazi silah kaplaması, Kış nişanı çerçevesi, Buz isim rengi ve kademelerde 100–200 elmas. Geçmiş kademelerin ödülleri de hemen açılır.'));
    const b = btn('btn gem-btn primary', '', () => {
      formDlg('Premium sezon kartı', [], `${fmt(j.price)} elmas harcanacak. Bu ay sonuna kadar geçerli. Bakiyen: ${fmt(ME.gems)} elmas.`, 'Satın al', async () => {
        const k = await acctOp('spbuy');
        if (k.ok) { SP = k; ME.gems = k.gems; ME.spn = k.n; H.toast('Premium sezon kartı açıldı!', 'gem'); gemBurst(); topBar(); dashGo('season'); return ''; }
        return k.reason === 'gems' ? `Yeterli elmasın yok (${fmt(k.gems || ME.gems)} / ${fmt(j.price)}).` : k.reason === 'owned' ? 'Zaten sende.' : 'Satın alınamadı.';
      });
    });
    b.append(document.createTextNode('Aç · '), gemIcon(15), el('b', '', fmt(j.price)));
    if (ME.gems < j.price) b.classList.add('poor');
    pc.append(t, b); nodes.push(pc);
  }
  const track = el('div', 'sp-track');
  const lab = el('div', 'sp-col sp-lab');
  // the two rows' name cards: an icon, the track's name and whether it is open for this player
  const trackCard = (cls, svg, name, sub) => {
    const c = el('div', 'sp-rl ' + cls), ic = el('span', 'sp-rl-ic');
    ic.innerHTML = svg; c.append(ic, el('strong', '', name), el('small', '', sub)); return c;
  };
  lab.append(
    el('span', 'sp-tn sp-tn-l', 'Kademe'),
    trackCard('free', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-2.2A3 3 0 0 0 12 4.4 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h.5v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7h.5a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-6-1a1 1 0 1 1 1 1h-1.5ZM9 6a1 1 0 0 1 1-1 1 1 0 0 1 1 1v1H9.5A1 1 0 0 1 9 6Zm2 14H6.5v-8H11Zm0-10H5V9h6Zm6.5 10H13v-8h4.5ZM19 10h-6V9h6Z"/></svg>', 'Ücretsiz', 'Herkese açık'),
    trackCard('prem' + (j.prem ? ' on' : ''), '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19 18H5Zm2.2 12.5h13.6a1 1 0 0 1 0 2H5.2a1 1 0 0 1 0-2Z"/></svg>', 'Premium', j.prem ? 'Açık' : 'Kilitli'));
  track.append(lab);
  for (let t = 1; t <= 30; t++) {
    const T = j.tiers[t - 1], col = el('div', 'sp-col' + (t <= j.tier ? ' done' : '') + (t === j.tier + 1 ? ' next' : ''));
    col.append(el('span', 'sp-tn', String(t)));
    const stF = j.cf.includes(t) ? 'got' : t <= j.tier ? 'ready' : 'future';
    const stP = j.cp.includes(t) ? 'got' : !j.prem ? 'lock' : t <= j.tier ? 'ready' : 'future';
    col.append(seasonCell(T.f, stF, () => spClaim(t, 'f')), seasonCell(T.p, stP, () => spClaim(t, 'p')));
    track.append(col);
  }
  const wrap = scroller(track);
  nodes.push(wrap, el('p', 'note', 'Her oyunda kazandığın XP sezon kartını da doldurur. Sezon ayın son günü biter; alınmamış ödüller kaybolur.'));
  body.replaceChildren(...nodes);
  const nx = track.querySelector('.next') || track.querySelector('.sp-col:last-child');
  if (nx) track.scrollLeft = Math.max(0, nx.offsetLeft - track.clientWidth / 2);
}

// ---------- notifications: kept on this device only ----------
const BKEY = () => 'kusatma-bildirim-' + (ACCT ? ACCT.id : '');
function bellGet() { try { const L = JSON.parse(localStorage.getItem(BKEY()) || '[]'); return Array.isArray(L) ? L : []; } catch (e) { return []; } }
function bellSet(L) { try { localStorage.setItem(BKEY(), JSON.stringify(L.slice(0, 40))); } catch (e) { /* ignore */ } }
export function notify(k, title, text, go) {
  if (!ACCT) return;
  const L = bellGet(); L.unshift({ t: Date.now(), k: String(k).slice(0, 8), title: String(title || '').slice(0, 80), text: String(text || '').slice(0, 200), go: go ? String(go).slice(0, 40) : '', u: 1 });
  bellSet(L); bellBadge(); if (!$('#bell-pop').hidden) bellDraw();
}
function bellBadge() { const n = bellGet().filter((x) => x.u).length; for (const b of document.querySelectorAll('[data-badge="bell"]')) { b.textContent = n ? String(Math.min(99, n)) : ''; b.hidden = !n; } }
const BELL_IC = { gift: '🎁', fr: '👥', dm: '✉', inv: '📨', lvl: '⭐', gem: '💎', msg: '📢', sp: '🛡' };
function bellDraw() {
  const L = bellGet(), ul = $('#bell-list');
  ul.replaceChildren(...(L.length ? L.map((x) => {
    const li = el('li', x.u ? 'new' : ''); const b = btn('bell-row', '', () => { $('#bell-pop').hidden = true; $('#dp-bell').setAttribute('aria-expanded', 'false'); if (x.go) { const [p, a] = x.go.split(':'); dashGo(p, a); } });
    const tx = el('div'); tx.append(el('strong', '', x.title)); if (x.text) tx.append(el('span', '', x.text)); tx.append(el('small', '', ago(x.t)));
    b.append(el('span', 'bell-ic', BELL_IC[x.k] || '•'), tx); li.append(b); return li;
  }) : [el('li', 'empty', 'Henüz bildirim yok.')]));
}
function bellToggle() {
  const p = $('#bell-pop'), open = p.hidden;
  p.hidden = !open; $('#dp-bell').setAttribute('aria-expanded', String(open));
  if (open) { bellDraw(); front(p); const L = bellGet(); for (const x of L) x.u = 0; bellSet(L); bellBadge(); }
}

// ---------- people you played with recently (this device) ----------
const RKEY = () => 'kusatma-son-' + (ACCT ? ACCT.id : '');
export function recentAdd(list) {
  if (!ACCT) return;
  let L = []; try { L = JSON.parse(localStorage.getItem(RKEY()) || '[]'); if (!Array.isArray(L)) L = []; } catch (e) { L = []; }
  const now = Date.now();
  for (const p of list) { if (!p || !p.name || p.name === ACCT.name) continue; L = L.filter((x) => x.name !== p.name); L.unshift({ name: String(p.name).slice(0, 16), eq: p.eq || {}, acct: p.acct ? 1 : 0, t: now }); }
  try { localStorage.setItem(RKEY(), JSON.stringify(L.slice(0, 20))); } catch (e) { /* ignore */ }
}
function recentGet() { try { const L = JSON.parse(localStorage.getItem(RKEY()) || '[]'); return Array.isArray(L) ? L : []; } catch (e) { return []; } }

function statList() {
  const ul = el('ul', 'dp-stats');
  for (const [v, l] of [[ME.best, 'en iyi dalga'], [fmt(ME.kills), 'zombi'], [ME.games, 'oyun'], [fmt(ME.mins), 'dakika']]) { const li = el('li'); li.append(el('strong', '', String(v)), el('span', '', l)); ul.append(li); }
  return ul;
}
async function claimDaily() {
  const j = await acctOp('daily');
  if (j.ok) { ME.dl = true; ME.ls = j.day | 0 || ME.ls; H.toast(`Seri ${j.day || 1}. gün: +${j.n} elmas! Yarın yine gel.`, 'gem'); gemBurst(); }
  else if (j.reason === 'done') { ME.dl = true; H.toast('Bugünkü ödülü zaten aldın.'); }
  else H.toast('Ödül alınamadı. İnternetini kontrol et.', 'bad');
  topBar();
}
function gemBurst() {
  const box = $('#dp-gems'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
}

function playPage(sec) {
  head(sec, 'Oyna', 'Savaşa hazır mısın?');
  const acts = el('div', 'dp-actions');
  const a0 = btn('dp-act primary', ''); a0.append(el('strong', '', 'Hızlı oyna'), el('span', '', 'Uygun bir açık odaya katıl; yoksa hemen tek başına başla.')); a0.onclick = () => H.quick();
  const a1 = btn('dp-act', ''); a1.append(el('strong', '', 'Oda kur'), el('span', '', 'Açık ya da gizli bir oda kur, takımını topla.')); a1.onclick = () => H.roomDlg();
  const a2 = el('div', 'dp-act'); a2.append(el('strong', '', 'Koda katıl'));
  const jr = el('div', 'join-row'); const inp = el('input', 'code-input'); inp.maxLength = 6; inp.placeholder = 'ODA KODU'; inp.autocomplete = 'off'; inp.spellcheck = false;
  const jb = btn('btn', 'Katıl', () => H.join(inp.value)); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') jb.click(); });
  jr.append(inp, jb); a2.append(jr);
  const a3 = btn('dp-act', ''); a3.append(el('strong', '', 'Tek başına oyna'), el('span', '', 'Kilitli sınıfları da deneyebilirsin (elmas kazandırmaz).')); a3.onclick = () => H.solo();
  acts.append(a0, a1, a2, a3);
  sec.append(acts);
  sec.append(dailyCard());
  const fc = card('Oyundaki arkadaşların');
  const fl = el('ul', 'dp-rooms'); fl.id = 'play-fr'; fl.append(el('li', 'empty', 'Yükleniyor…')); fc.append(fl);
  sec.append(fc);
  friendsGet().then((d) => { if (d) onFriends(d); });
  const rb = btn('btn small ghost', 'Yenile', () => { if (rb.disabled) return; rb.disabled = true; load(); setTimeout(() => { rb.disabled = false; }, 5000); }); // at most once every 5 s
  const rc = card('Açık odalar', rb);
  const ul = el('ul', 'dp-rooms'); rc.append(el('p', 'note', 'Hesabı olan oyuncuların açık kurduğu odalar.'), ul);
  sec.append(rc);
  ul.dataset.rooms = '50';
  const load = () => roomsGet().then((j) => ul.replaceChildren(...H.roomItems(j.ok ? j.rooms : null, 50)));
  ul.append(el('li', 'empty', 'Yükleniyor…')); load();
}

// ---------- profile and wardrobe ----------
function profileView(p, mine) {
  const wrap = el('div', 'prof');
  const ban = el('div', 'prof-banner'); ban.dataset.theme = ((p.eq && p.eq.thm) || 't.gece').slice(2);
  if (p.eq && ITEMS[p.eq.ban]) ban.append(bannerEl(p.eq.ban, 'ban-bg'));
  const av = avatar(p.eq, 120, mine ? heroCls() : 'asker');
  const info = el('div', 'prof-info');
  const nm = el('div', 'prof-name'); nm.append(nameEl(p.name, p.eq, 'h2', 'nm dp-h'), lvlBadge(p.lvl));
  info.append(nm);
  const t = titleOf(p.eq); if (t) info.append(el('p', 'prof-title', t));
  const meta = el('p', 'dim');
  meta.textContent = `${p.made ? 'Katıldı: ' + new Date(p.made).toLocaleDateString('tr', { year: 'numeric', month: 'long' }) : ''}${p.on ? ' · Çevrimiçi' : ''}`;
  info.append(meta);
  if (p.bio) info.append(el('p', 'prof-bio', p.bio));
  ban.append(av, info);
  wrap.append(ban);
  const show = (p.show || []).filter((id) => ACH_NAME[id]);
  if (show.length) {
    const sc = el('div', 'prof-show');
    for (const id of show) { const d = el('div', 'show-ach'); d.append(el('span', 'ach-ic', '★'), el('strong', '', ACH_NAME[id])); sc.append(d); }
    wrap.append(sc);
  }
  const st = el('ul', 'dp-stats big');
  for (const [v, l] of [[p.lvl, 'seviye'], [p.best, 'en iyi dalga'], [fmt(p.kills), 'zombi'], [p.games, 'oyun'], [fmt(p.mins), 'dakika'], [p.ncls != null ? p.ncls : '', 'sınıf']]) { const li = el('li'); li.append(el('strong', '', String(v)), el('span', '', l)); st.append(li); }
  wrap.append(st);
  return wrap;
}
function profilePage(sec) {
  const pa = el('div', 'prof-head-acts');
  pa.append(btn('btn ghost phone-only', 'Sıralama', () => dashGo('top')), btn('btn ghost phone-only', 'Ayarlar', () => dashGo('account')), btn('btn primary', 'Dolabı aç', () => dashGo('locker')));
  head(sec, 'Profil', 'Profilim', pa);
  const p = { name: ACCT.name, eq: ME.eq, bio: ME.bio || '', show: ME.show || [], lvl: ME.lvl, best: ME.best, kills: ME.kills, games: ME.games, mins: ME.mins, made: ME.made, on: true, ncls: CLASS_ORDER.filter((c) => FREE_CLS.includes(c) || ME.own.includes('c.' + c)).length };
  sec.append(profileView(p, true));
  // edit: bio and the three achievements shown on the profile
  const ed = card('Profilini düzenle', btn('btn small ghost', 'Afiş seç', () => { lockSlot = 'ban'; dashGo('locker'); }));
  const bl = el('label', 'field'); const bi = el('textarea', 'bio-in'); bi.maxLength = 120; bi.rows = 2; bi.placeholder = 'Kendini birkaç kelimeyle anlat (herkes görür)'; bi.value = ME.bio || '';
  bl.append(el('span', '', 'Hakkımda'), bi);
  const bb = btn('btn small self-start', 'Kaydet', async () => { bb.disabled = true; const r = await acctOp('bio', { x: bi.value }); bb.disabled = false; if (r.ok) { ME.bio = r.bio; bi.value = r.bio; H.toast('Kaydedildi', 'good'); dashGo('profile'); } else H.toast(r.reason === 'slow' ? 'Biraz bekle.' : 'Kaydedilemedi.', 'bad'); });
  ed.append(bl, bb, el('p', 'eyebrow', 'Vitrin: profilinde görünen 3 başarım'));
  const sb = el('div', 'show-pick'); sb.append(el('p', 'note', 'Yükleniyor…')); ed.append(sb);
  sec.append(ed);
  loadQuests().then((j) => {
    if (!j) { sb.replaceChildren(el('p', 'note', 'Başarımlar yüklenemedi.')); return; }
    const got = j.ach.filter((a) => a.claimed);
    if (!got.length) { sb.replaceChildren(el('p', 'note', 'Önce bir başarım kazan ve ödülünü al.')); return; }
    const sel = new Set(ME.show || []);
    sb.replaceChildren(...got.map((a) => {
      const b = btn('chip-opt' + (sel.has(a.id) ? ' on' : ''), (ACH_IC[a.k] || '★') + ' ' + (ACH_NAME[a.id] || a.id), async () => {
        if (sel.has(a.id)) sel.delete(a.id); else { if (sel.size >= 3) { H.toast('En fazla 3 başarım seçebilirsin.'); return; } sel.add(a.id); }
        const r = await acctOp('show', { ids: [...sel] });
        if (r.ok) { ME.show = r.show; dashGo('profile'); } else H.toast('Kaydedilemedi.', 'bad');
      });
      b.setAttribute('aria-pressed', String(sel.has(a.id))); return b;
    }));
  });
  const qa = card('Görevler ve başarımlar', btn('btn small ghost', 'Aç', () => dashGo('quests'))); qa.append(el('p', 'note', 'Günlük görevler, seviye yolu ödülleri ve başarımlar.')); sec.append(qa);
  sec.append(pvpCard());
  const xp = card('Seviye ilerlemesi');
  const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * ME.lx / Math.max(1, ME.ln)) + '%'; bar.append(f);
  xp.append(bar, el('p', 'note', `Seviye ${ME.lvl + 1} için ${fmt(ME.ln - ME.lx)} XP kaldı. Her temizlenen dalga XP verir; zor dalgalar daha çok.`));
  sec.append(xp);
  const cc = card('Sınıfların', btn('btn small ghost', 'Mağaza', () => dashGo('shop', 'c')));
  const grid = el('div', 'cls-grid');
  for (const c of CLASS_ORDER) {
    const id = 'c.' + c, have = FREE_CLS.includes(c) || ME.own.includes(id), it = ITEMS[id];
    const b = el('div', 'cls-chip' + (have ? '' : ' locked'));
    const cv = el('canvas'); drawClassPic(cv, c, 56);
    b.append(cv, el('span', '', CLASSES[c] ? CLASSES[c].name : it ? it.name : c));
    if (!have) b.append(el('span', 'lock', it && it.soon ? 'Yakında' : 'Kilitli'));
    else { const n = clsNext((ME.cx || {})[c] | 0), bar = el('div', 'cl-bar'), f = el('i'); f.style.width = Math.round(100 * n.pct) + '%'; bar.append(f); b.append(el('span', 'cl-lv', `Sv ${n.l}`), bar); b.title = n.l >= 30 ? 'En yüksek seviye' : `Sonraki seviyeye ${fmt(n.need)} XP · her seviye 20 elmas`; }
    grid.append(b);
  }
  cc.append(grid, el('p', 'note', 'Sınıf seviyesi o sınıfla temizlediğin dalgalarla artar (en çok 30). Her seviye 20 elmas verir.'));
  sec.append(badgesCard(ME.bdg || []));
  sec.append(cc);
}
function drawClassPic(cv, cls, S, eq) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(S * 0.42, S * 0.55); g.scale(S / 44, S / 44);
  if (CLASSES[cls]) drawCharacter(g, cls, colorOf(eq || ME.eq), -0.6, 0, { alive: true, hat: eq && eq.hat, wsk: eq && eq.wsk });
  else { g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '700 16px Rubik'; g.textAlign = 'center'; g.fillText('?', 0, 6); }
}
let lockSlot = 'hat', lockCls = '';
function lockerPage(sec) {
  head(sec, 'Dolap', 'Görünümünü seç', btn('btn ghost', 'Profile dön', () => dashGo('profile')));
  const box = el('div', 'locker');
  const left = el('div', 'locker-prev');
  const cv = el('canvas'); left.append(cv);
  if (!lockCls) lockCls = heroCls();
  const cs = el('div', 'chips');
  for (const c of CLASS_ORDER) {
    if (!(FREE_CLS.includes(c) || ME.own.includes('c.' + c))) continue;
    const b = btn('chip-opt', CLASSES[c].name, () => { lockCls = c; dashGo('locker'); }); b.setAttribute('aria-pressed', String(c === lockCls)); cs.append(b);
  }
  left.append(el('p', 'note', 'Önizleme sınıfı'), cs);
  const spin = { a: -0.8 };
  const draw = () => { drawAvatar(cv, ME.eq, { size: 220, cls: lockCls, angle: spin.a }); };
  draw();
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); spin.a = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); draw(); });
  const right = el('div', 'locker-items');
  const tabs = el('div', 'seg-tabs');
  for (const s of SLOTS) { const b = btn('', s.name, () => { lockSlot = s.k; dashGo('locker'); }); b.setAttribute('aria-selected', String(s.k === lockSlot)); tabs.append(b); }
  right.append(segTabs(tabs));
  const slot = SLOTS.find((s) => s.k === lockSlot);
  const grid = el('div', 'item-grid small');
  const cur = ME.eq[slot.k] || '';
  const ids = Object.keys(ITEMS).filter((id) => id.startsWith(slot.p + '.') && (owns(id) || isFree(id)));
  // a free item that is the slot's default (the Gece theme and banner) stands in for "nothing worn"
  const dflt = ids.find((id) => isFree(id) && ITEMS[id].name === slot.none);
  if (!dflt) {
    const none = el('button', 'item-card' + (!cur ? ' on' : '')); none.type = 'button';
    none.append(el('div', 'ic-prev none', '∅'), el('span', 'ic-name', slot.none));
    none.onclick = () => equip(slot.k, '');
    grid.append(none);
  }
  for (const id of ids) {
    const b = itemCard(id, false, { equip: true });
    b.classList.toggle('on', id === dflt ? !cur || cur === id : cur === id);
    b.onclick = () => equip(slot.k, id === dflt ? '' : id);
    grid.append(b);
  }
  right.append(grid);
  const more = Object.keys(ITEMS).filter((id) => id.startsWith(slot.p + '.') && !owns(id) && !isFree(id) && !ITEMS[id].reward).length;
  if (more) right.append(btn('btn ghost', `Mağazada ${more} ${slot.name.toLowerCase()} daha`, () => dashGo('shop', slot.p)));
  box.append(left, right);
  sec.append(box);
}
async function equip(slot, id) {
  const prev = ME.eq[slot];
  if (id) ME.eq[slot] = id; else delete ME.eq[slot];
  if (slot === 'thm') applyTheme();
  dashGo(page); topBar();
  const j = await acctOp('eq', { e: { [slot]: id } });
  if (!j.ok) { if (prev) ME.eq[slot] = prev; else delete ME.eq[slot]; applyTheme(); dashGo(page); topBar(); H.toast('Kaydedilemedi. Tekrar dene.', 'bad'); }
}

// ---------- the gem shop ----------
const SHOP_TABS = [['c', 'Sınıflar'], ['p', 'Evcil'], ['b', 'Afiş'], ['h', 'Şapkalar'], ['r', 'Renkler'], ['w', 'Silah'], ['f', 'Çerçeve'], ['n', 'İsim rengi'], ['u', 'Unvan'], ['t', 'Tema']];
let shopTab = 'c', shopOwn = 'all';
const priceOf = (id) => (LIVE.shop && LIVE.shop.p[id] != null ? LIVE.shop.p[id] : null);
function shopPage(sec, tab) {
  if (tab) shopTab = tab;
  const bal = el('div', 'shop-bal'); bal.append(el('span', 'dim', 'Bakiyen'), gemAmt(ME.gems, 'gem-amt big'));
  head(sec, 'Mağaza', 'Elmas mağazası', bal);
  const S = LIVE.shop;
  if (S && S.mul > 1) { const b = el('div', 'dp-banner ev'); b.append(el('strong', '', `${S.mul}× elmas etkinliği!`), el('span', '', `Her dalga ${S.mul} kat elmas veriyor${S.until ? ' · ' + left(S.until) : ''}.`)); sec.append(b); }
  if (S && S.saleAll && S.saleUntil > Date.now()) { const b = el('div', 'dp-banner sale'); b.append(el('strong', '', `Her şeyde %${S.saleAll} indirim`), el('span', '', left(S.saleUntil))); sec.append(b); }
  if (!S) sec.append(el('p', 'msg', 'Mağaza bilgisi yüklenemedi. İnternetini kontrol et.'));
  const tabs = el('div', 'seg-tabs');
  const allIds = (k) => Object.keys(ITEMS).filter((id) => id.startsWith(k + '.') && !isFree(id) && !ITEMS[id].reward && (priceOf(id) != null || ITEMS[id].soon || owns(id)));
  for (const [k, n] of SHOP_TABS) {
    const L = allIds(k), have = L.filter((id) => owns(id)).length, sale = L.some((id) => S && S.o && S.o[id] && !owns(id));
    const b = btn('', '', () => { shopTab = k; dashGo('shop'); }); b.append(el('span', '', n), el('span', 'tab-c', `${have}/${L.length}`)); if (sale) b.append(el('span', 'tab-sale', '%'));
    b.setAttribute('aria-selected', String(k === shopTab)); tabs.append(b);
  }
  sec.append(segTabs(tabs));
  const own = el('div', 'chips shop-own');
  for (const [k, n] of [['all', 'Hepsi'], ['no', 'Sahip olmadıklarım'], ['yes', 'Sahip olduklarım'], ['sale', 'İndirimde']]) { const b = btn('chip-opt', n, () => { shopOwn = k; dashGo('shop'); }); b.setAttribute('aria-pressed', String(k === shopOwn)); own.append(b); }
  sec.append(own);
  if (shopTab === 'c') sec.append(el('p', 'note', 'Asker, Doktor, Tamirci ve Nişancı ücretsiz. Kilitli sınıfları Tek başına modunda deneyebilirsin.'));
  const grid = el('div', 'item-grid' + (shopTab === 'c' ? ' wide' : ''));
  const ids = allIds(shopTab).filter((id) => shopOwn === 'all' || (shopOwn === 'yes' ? owns(id) : shopOwn === 'no' ? !owns(id) : !owns(id) && S && S.o && S.o[id]));
  ids.sort((a, b) => (owns(a) - owns(b)) || ((priceOf(a) || 9e9) - (priceOf(b) || 9e9)));
  for (const id of ids) grid.append(itemCard(id));
  if (!ids.length) grid.append(el('p', 'empty-big', shopOwn === 'yes' ? 'Bu bölümden henüz bir şeyin yok.' : shopOwn === 'sale' ? 'Bu bölümde şu an indirim yok.' : shopOwn === 'no' ? 'Bu bölümdeki her şey sende!' : 'Bu bölümde şu an satılık bir şey yok.'));
  sec.append(grid);
}
function left(t) { const m = Math.max(0, (t - Date.now()) / 60000); return m > 1440 ? `${Math.ceil(m / 1440)} gün kaldı` : m > 60 ? `${Math.ceil(m / 60)} saat kaldı` : `${Math.ceil(m)} dk kaldı`; }
function itemCard(id, big, o = {}) {
  const it = ITEMS[id]; if (!it) return el('div');
  const have = owns(id) || isFree(id), price = priceOf(id), kind = id[0];
  const b = el('button', `item-card r-${it.r}${big ? ' big' : ''}${have && !o.equip ? ' owned' : ''}`); b.type = 'button';
  const pv = el('div', 'ic-prev');
  if (kind === 'c') { const cv = el('canvas'); drawClassPic(cv, it.cls, big ? 110 : 96, {}); pv.append(cv); }
  else if (kind === 'h' || kind === 'r' || kind === 'w') { const cv = el('canvas'); const eq = Object.assign({}, ME.eq, { [SLOT_OF[kind].k]: id }); drawAvatar(cv, eq, { noPet: true, size: big ? 110 : 84, cls: kind === 'w' ? heroCls() : 'asker', angle: kind === 'w' ? -0.25 : -0.55 }); pv.append(cv); }
  else if (kind === 'f') { const cv = el('canvas'); drawAvatar(cv, Object.assign({}, ME.eq, { frm: id }), { noPet: true, size: big ? 110 : 84 }); pv.append(cv); }
  else if (kind === 'n') { const n = nameEl(ACCT.name, { nc: id }, 'span', 'nm big'); pv.append(n); }
  else if (kind === 'u') { pv.append(el('span', 'ttl-prev', it.name)); }
  else if (kind === 't') { const sw = el('div', 'theme-sw'); sw.dataset.theme = id.slice(2); pv.append(sw); }
  else if (kind === 'p') { pv.append(petCanvas(id, big ? 110 : 84)); }
  else if (kind === 'b') { pv.append(bannerEl(id, 'ban-prev')); }
  b.append(pv);
  b.append(el('span', 'ic-r', RARITY[it.r] || ''), el('span', 'ic-name', it.name));
  if (kind === 'c' && CLASSES[it.cls]) b.append(el('span', 'ic-desc', `${CLASSES[it.cls].ab.name} · ${CLASSES[it.cls].pas.name}`));
  if (o.equip) return b;
  const pr = el('span', 'ic-price');
  if (have) pr.append(el('b', 'own', 'Sahipsin'));
  else if (it.soon) pr.append(el('b', 'soon', 'Yakında'));
  else if (!LIVE.shop) pr.append(el('b', 'soon', '…'));
  else if (it.season) pr.append(el('b', 'soon', it.season === 'p' ? 'Premium sezon ödülü' : 'Sezon ödülü'));
  else if (it.wheel) pr.append(el('b', 'soon', 'Şans çarkı ödülü'));
  else if (it.reward) pr.append(el('b', 'soon', `${it.reward}. seviye ödülü`));
  else if (price == null) pr.append(el('b', 'soon', 'Satışta değil'));
  else {
    const was = LIVE.shop && LIVE.shop.o ? LIVE.shop.o[id] : 0;
    if (was && was > price) { const o = el('s', 'ic-was', fmt(was)); pr.append(o); b.append(el('span', 'ic-sale', `-%${Math.round(100 - price * 100 / was)}`)); b.classList.add('on-sale'); }
    pr.append(gemAmt(price));
    if (LIVE.shop && LIVE.shop.lim[id]) b.append(el('span', 'ic-lim', 'Sınırlı · ' + left(LIVE.shop.lim[id])));
    if (ME.gems < price) pr.classList.add('poor');
  }
  b.append(pr);
  b.onclick = () => {
    if (have) { if (kind !== 'c') { lockSlot = SLOT_OF[kind] ? SLOT_OF[kind].k : lockSlot; dashGo('locker'); } return; }
    if (it.soon || price == null) { H.toast('Bu eşya şu an satın alınamıyor.'); return; }
    buyDlg(id, price);
  };
  return b;
}
function buyDlg(id, price) {
  const it = ITEMS[id], kind = id[0], slot = SLOT_OF[kind];
  const dlg = $('#buy-dlg'), box = $('#buy-body');
  const was = LIVE.shop && LIVE.shop.o ? LIVE.shop.o[id] : 0;
  const draw = (state, msg) => {
    box.replaceChildren();
    const pv = el('div', `buy-prev r-${it.r}`); const card = itemCard(id, true, { equip: true }); card.disabled = true; pv.append(card);
    box.append(pv);
    const info = el('div', 'buy-info');
    info.append(el('span', `buy-r r-${it.r}`, RARITY[it.r] || ''), el('h3', '', it.name));
    if (kind === 'c' && CLASSES[it.cls]) info.append(el('p', 'dim', `${CLASSES[it.cls].desc} Yetenek: ${CLASSES[it.cls].ab.name}. Pasif: ${CLASSES[it.cls].pas.name}.`));
    else if (slot) info.append(el('p', 'dim', `${slot.name} · aldıktan sonra Dolap'tan istediğin zaman değiştirebilirsin.`));
    const rows = el('div', 'buy-rows');
    const row = (l, v, cls) => { const r = el('div', 'buy-row' + (cls ? ' ' + cls : '')); r.append(el('span', '', l), v); rows.append(r); };
    const pc = el('span', 'buy-price'); if (was > price) pc.append(el('s', 'ic-was', fmt(was))); pc.append(gemAmt(price));
    row('Fiyat', pc);
    row('Bakiyen', gemAmt(ME.gems));
    if (state !== 'done') row('Sonra kalan', gemAmt(Math.max(0, ME.gems - price)), ME.gems < price ? 'bad' : '');
    info.append(rows);
    if (msg) info.append(el('p', state === 'err' ? 'msg' : 'note', msg));
    const acts = el('div', 'buy-acts');
    if (state === 'done') {
      if (slot) acts.append(btn('btn primary', 'Hemen kuşan', () => { dlg.hidden = true; equip(slot.k, id); }));
      acts.append(btn('btn ghost', 'Tamam', () => { dlg.hidden = true; dashGo(page); }));
    } else if (ME.gems < price) {
      acts.append(btn('btn primary', 'Elmas kazan', () => { dlg.hidden = true; dashGo('quests'); }), btn('btn ghost', 'Vazgeç', () => { dlg.hidden = true; }));
      info.append(el('p', 'note', `${fmt(price - ME.gems)} elmas daha gerekiyor. Dalga temizle, günlük ödülü ve görevleri al.`));
    } else {
      const go = btn('btn primary big', '', async () => {
        go.disabled = true; go.textContent = 'Satın alınıyor…';
        const j = await acctOp('buy', { id });
        if (j.ok) { gemBurst(); topBar(); draw('done', `${it.name} artık senin!`); dlg.querySelector('.card').classList.add('bought'); }
        else draw('err', { gems: 'Elmasın yetmiyor.', owned: 'Bu zaten sende.', item: 'Bu eşya artık satışta değil.', slow: 'Biraz yavaş, birkaç saniye bekle.' }[j.reason] || 'Satın alınamadı. İnternetini kontrol edip tekrar dene.');
      });
      go.append(el('span', '', 'Satın al · '), gemAmt(price));
      acts.append(go);
      if (kind === 't') acts.append(btn('btn ghost', 'Önizle', () => { dlg.hidden = true; previewTheme(id); }));
      acts.append(btn('btn ghost', 'Vazgeç', () => { dlg.hidden = true; }));
    }
    info.append(acts);
    box.append(info);
  };
  dlg.querySelector('.card').classList.remove('bought');
  dlg.hidden = false; front(dlg);
  draw('ask');
}

// ---------- friends and private messages ----------
let FR = { L: [], q: [], un: {} }, frTab = 'list';
export const frList = () => FR.L;
function friendsPage(sec, arg) {
  if (arg === 'add') frTab = 'add';
  head(sec, 'Arkadaşlar', 'Arkadaşların');
  const tabs = el('div', 'seg-tabs');
  for (const [k, n] of [['list', `Arkadaşlar (${FR.L.length})`], ['req', `İstekler${FR.q.length ? ' (' + FR.q.length + ')' : ''}`], ['recent', 'Son oynadıkların'], ['add', 'Arkadaş ekle']]) {
    const b = btn('', n, () => { frTab = k; dashGo('friends'); }); b.setAttribute('aria-selected', String(k === frTab)); tabs.append(b);
  }
  sec.append(segTabs(tabs));
  const box = el('div', 'fr-box'); box.id = 'fr-box'; sec.append(box);
  drawFriends();
  friendsGet().then((d) => { if (d) onFriends(d); });
}
function drawFriends() {
  const box = $('#fr-box'); if (!box) return;
  box.replaceChildren();
  if (frTab === 'recent') {
    const L = recentGet(), c = card('Son oynadıkların');
    const ul = el('ul', 'fr-list');
    if (!L.length) ul.append(el('li', 'empty', 'Biriyle oynadığında burada görünür.'));
    for (const r of L) {
      const li = el('li', 'fr-row'); li.append(avatar(r.eq || {}, 40));
      const tx = el('div', 'fr-tx'); tx.append(nameEl(r.name, r.eq || {}), el('span', 'dim', ago(r.t) + (r.acct ? '' : ' · hesapsız')));
      li.append(tx);
      const acts = el('div', 'fr-acts');
      if (r.acct) {
        acts.append(btn('btn small ghost', 'Profil', () => openProfile({ name: r.name })));
        if (!FR.L.some((f) => f.name === r.name)) acts.append(btn('btn small', 'Ekle', async (e) => { e.target.disabled = true; const j = await acctOp('fadd', { name: r.name }); H.toast(j.ok ? (j.now ? `${r.name} ile artık arkadaşsınız!` : 'İstek gönderildi.') : 'Gönderilemedi.', j.ok ? 'good' : 'bad'); }));
      }
      li.append(acts); ul.append(li);
    }
    c.append(ul, el('p', 'note', 'Bu liste sadece bu cihazda tutulur.'));
    box.append(c);
    return;
  }
  if (frTab === 'add') {
    const c = card('Ad ile ekle');
    const row = el('div', 'join-row'); const inp = el('input', 'field-in'); inp.maxLength = 16; inp.placeholder = 'Oyuncu adı'; inp.autocomplete = 'off';
    const go = btn('btn primary', 'İstek gönder', async () => {
      const n = inp.value.trim(); if (!n) return; go.disabled = true;
      const j = await acctOp('fadd', { name: n }); go.disabled = false;
      H.toast(j.ok ? (j.now ? `${n} ile artık arkadaşsınız!` : 'İstek gönderildi.') : ({ gone: 'Bu adla bir hesap yok.', already: 'Zaten arkadaşsınız.', closed: 'Bu oyuncu arkadaşlık isteği almıyor.', full: 'Liste dolu.', slow: 'Çok fazla istek. Biraz bekle.' }[j.reason] || 'Gönderilemedi.'), j.ok ? 'good' : 'bad');
      if (j.ok) inp.value = '';
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    row.append(inp, go); c.append(row, el('p', 'note', 'Arkadaşlarının ne zaman çevrimiçi olduğunu ve hangi odada oynadığını görürsün, onlara mesaj atabilirsin.'));
    box.append(c);
    return;
  }
  if (frTab === 'req') {
    if (!FR.q.length) { box.append(el('p', 'empty-big', 'Bekleyen istek yok.')); return; }
    const ul = el('ul', 'fr-list');
    for (const q of FR.q) {
      const li = el('li'); li.append(el('span', 'fr-name', q.name));
      const acts = el('span', 'fr-acts');
      acts.append(btn('btn small primary', 'Kabul et', async () => { await acctOp('facc', { id: q.id }); H.toast(`${q.name} ile artık arkadaşsınız!`, 'good'); refreshFriends(); }),
        btn('btn small ghost', 'Reddet', async () => { await acctOp('fno', { id: q.id }); refreshFriends(); }),
        btn('btn small ghost', 'Profil', () => openProfile({ id: q.id })));
      li.append(acts); ul.append(li);
    }
    box.append(ul);
    return;
  }
  if (!FR.L.length) { const e = el('div', 'empty-big'); e.append(el('p', '', 'Henüz arkadaşın yok.'), btn('btn primary', 'Arkadaş ekle', () => { frTab = 'add'; dashGo('friends'); })); box.append(e); return; }
  const ul = el('ul', 'fr-list');
  for (const f of FR.L) {
    const li = el('li', f.on ? 'on' : '');
    const av = avatar(f.eq, 44); const avw = el('span', 'fr-av'); avw.append(av); if (f.on) avw.append(el('i', 'dot'));
    const info = el('span', 'fr-info'); const nm = el('span', 'fr-name'); nm.append(nameEl(f.name, f.eq), lvlBadge(f.lvl)); info.append(nm, el('span', 'fr-st', frStatus(f)));
    const acts = el('span', 'fr-acts');
    if (f.room) acts.append(btn('btn small primary', 'Katıl', () => H.join(f.room)));
    const mb = btn('btn small', 'Mesaj', () => openDm(f)); if (FR.un[f.id]) mb.append(el('span', 'badge', String(FR.un[f.id]))); acts.append(mb);
    acts.append(btn('btn small ghost', 'Profil', () => openProfile({ id: f.id })));
    li.append(avw, info, acts); ul.append(li);
  }
  box.append(ul);
}
function frStatus(f) {
  if (!f.on) return f.last ? `Çevrimdışı · ${ago(f.last)}` : 'Çevrimdışı';
  if (f.room) return `Oyunda · Oda ${f.room}${f.wave ? ' · ' + f.wave + '. dalga' : ''}`;
  if (f.solo) return 'Tek başına oynuyor';
  return 'Çevrimiçi';
}
// a friend who just opened or joined a room: a short note with Katıl (only while this player is not in a game)
let frRooms = null;
function frNewRooms(d) {
  const now = new Map(d.L.filter((f) => f.room).map((f) => [f.id, f.room]));
  if (frRooms && H.inGame && !H.inGame()) for (const [id, room] of now) if (frRooms.get(id) !== room) { const f = d.L.find((x) => x.id === id); if (f && H.actToast) H.actToast(`${f.name} oyunda (oda ${room}${f.wave ? ', ' + f.wave + '. dalga' : ''}).`, 'Katıl', () => H.join(room)); }
  frRooms = now;
}
export function onFriends(d) {
  frNewRooms(d);
  FR = d;
  ME.fq = d.q; ME.un = Object.values(d.un).reduce((s, n) => s + n, 0);
  topBar();
  if (page === 'friends') drawFriends();
  const hs = $('#home-fr');
  if (hs) {
    const keep = hs.querySelector('.add');
    hs.replaceChildren(...d.L.slice(0, 12).map((f) => {
      const b = btn('fr-dot' + (f.on ? ' on' : ''), '', () => (f.room ? H.join(f.room) : openProfile({ id: f.id })));
      const w = el('span', 'fr-av'); w.append(avatar(f.eq, 56)); if (f.on) w.append(el('i', 'dot'));
      b.append(w, el('span', 'fn', f.name), el('span', 'fs', f.room ? 'Katıl' : f.on ? 'Çevrimiçi' : ago(f.last)));
      return b;
    }), keep);
  }
  const pf = $('#play-fr');
  if (pf) {
    const inRooms = d.L.filter((f) => f.room);
    pf.replaceChildren(...(inRooms.length ? inRooms.map((f) => { const li = el('li'); li.append(avatar(f.eq, 32), el('span', 'rh', f.name), el('span', 'rm', frStatus(f)), btn('btn small', 'Katıl', () => H.join(f.room))); return li; }) : [el('li', 'empty', 'Şu an odada olan arkadaşın yok.')]));
  }
}
const refreshFriends = () => friendsGet().then((d) => { if (d) onFriends(d); });

// the message drawer
let dmWith = null;
async function openDm(f) {
  dmWith = f;
  const d = $('#dm'); d.hidden = false;
  $('#dm-name').replaceChildren(nameEl(f.name, f.eq));
  $('#dm-st').textContent = frStatus(f);
  const av = $('#dm-av'); drawAvatar(av, f.eq, { size: 36 });
  const log = $('#dm-log'); log.replaceChildren(el('p', 'note', 'Yükleniyor…'));
  $('#dm-in').value = ''; $('#dm-in').focus();
  const L = await dmHistory(f.id);
  if (dmWith !== f) return;
  log.replaceChildren();
  if (!L) { log.append(el('p', 'note', 'Mesajlar yüklenemedi.')); return; }
  if (!L.length) log.append(el('p', 'note', `${f.name} ile henüz yazışmadın. İlk mesajı sen at!`));
  for (const m of L) addMsg(m);
  if (FR.un[f.id]) { delete FR.un[f.id]; ME.un = Object.values(FR.un).reduce((s, n) => s + n, 0); topBar(); if (page === 'friends') drawFriends(); }
}
function addMsg(m) {
  const log = $('#dm-log');
  if (log.firstChild && log.firstChild.classList && log.firstChild.classList.contains('note')) log.firstChild.remove();
  const mine = m.f === ACCT.id;
  const b = el('div', 'dm-msg' + (mine ? ' me' : ''));
  b.append(el('span', 'dm-x', m.x), el('span', 'dm-t', new Date(m.t).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' })));
  log.append(b); log.scrollTop = log.scrollHeight;
}
async function sendDm() {
  const inp = $('#dm-in'), x = inp.value.trim();
  if (!x || !dmWith) return;
  inp.value = '';
  const j = await dmSend(dmWith.id, x);
  if (j.ok && j.m) addMsg(j.m);
  else { inp.value = x; H.toast({ mute: 'Mesaj göndermen yönetici tarafından geçici olarak kapatıldı.', friend: 'Sadece arkadaşlarına mesaj atabilirsin.', slow: 'Biraz yavaş yaz.', text: 'Mesaj boş.' }[j.reason] || 'Gönderilemedi.', 'bad'); }
}
export function onDm(m) {
  if (dmWith && dmWith.id === m.f && !$('#dm').hidden) { addMsg(m); acctOp('dmh', { w: m.f }); return; }
  FR.un[m.f] = (FR.un[m.f] || 0) + 1; ME.un = (ME.un | 0) + 1; topBar();
  if (page === 'friends') drawFriends();
  H.toast(`${m.n}: ${m.x}`, 'dm');
}
export function onFr(k, n) { H.toast(k === 'acc' ? `${n} arkadaşlık isteğini kabul etti!` : `${n} sana arkadaşlık isteği gönderdi.`, 'good'); refreshFriends(); }

// someone's public profile
async function openProfile(q) {
  const dlg = $('#prof-dlg'), body = $('#prof-body');
  dlg.hidden = false; front(dlg); body.replaceChildren(el('p', 'note', 'Yükleniyor…'));
  const j = await acctOp('prof', q);
  if (!j.ok) { body.replaceChildren(el('p', 'msg', j.reason === 'gone' ? 'Bu oyuncu bulunamadı.' : 'Profil yüklenemedi.')); return; }
  const p = j.p;
  body.replaceChildren(profileView(p, false));
  const acts = el('div', 'prof-acts');
  if (p.me) acts.append(btn('btn', 'Profilime git', () => { dlg.hidden = true; dashGo('profile'); }));
  else {
    if (p.fr === 1) acts.append(btn('btn primary', 'Mesaj at', () => { dlg.hidden = true; openDm({ id: p.id, name: p.name, eq: p.eq, on: p.on }); }));
    else if (p.fr === 3) acts.append(el('span', 'note', 'İstek gönderildi.'));
    else acts.append(btn('btn primary', p.fr === 2 ? 'İsteği kabul et' : 'Arkadaş ekle', async () => { const r = await acctOp('fadd', { id: p.id }); H.toast(r.ok ? (r.now ? 'Artık arkadaşsınız!' : 'İstek gönderildi.') : r.reason === 'closed' ? 'Bu oyuncu istek almıyor.' : 'Gönderilemedi.', r.ok ? 'good' : 'bad'); dlg.hidden = true; refreshFriends(); }));
    if (p.fr === 1) acts.append(btn('btn ghost', 'Arkadaşlıktan çıkar', () => H.ask('Arkadaşlıktan çıkar', `${p.name} arkadaş listenden çıkarılsın mı?`, 'Çıkar', async () => { await acctOp('fdel', { id: p.id }); dlg.hidden = true; refreshFriends(); })));
    acts.append(btn('btn ghost danger', 'Bildir', () => reportDlg(p)));
  }
  body.append(acts);
}
function reportDlg(p) {
  $('#prof-dlg').hidden = true;
  const dlg = $('#rep-dlg'); dlg.hidden = false; front(dlg);
  $('#rep-who').textContent = p.name;
  $('#rep-x').value = '';
  const opts = $('#rep-why'); let why = 'isim';
  opts.replaceChildren(...[['isim', 'Uygunsuz ad'], ['küfür', 'Küfür / hakaret'], ['taciz', 'Rahatsız ediyor'], ['hile', 'Hile yapıyor'], ['diğer', 'Diğer']].map(([k, n]) => {
    const b = btn('chip-opt', n, () => { why = k; for (const x of opts.children) x.setAttribute('aria-pressed', String(x === b)); }); b.setAttribute('aria-pressed', String(k === why)); return b;
  }));
  $('#rep-send').onclick = async () => {
    const j = await acctOp('rep', { id: p.id, why, x: $('#rep-x').value, dm: p.fr === 1 ? 1 : 0 });
    dlg.hidden = true;
    H.toast(j.ok ? 'Bildirimin yöneticiye ulaştı. Teşekkürler.' : j.reason === 'slow' ? 'Bugün yeterince bildirim gönderdin.' : 'Gönderilemedi.', j.ok ? 'good' : 'bad');
  };
}

// ---------- quests, achievements and the level road ----------
const ACH_NAME = { k1: 'Avcı', k2: 'Kasap', k3: 'Katliam', k4: 'Kıyamet', b1: 'Hayatta kalan', b2: 'Dayanıklı', b3: 'Sabaha kadar', b4: 'Kuşatma bozan', b5: 'Yıkılmaz', b6: 'Efsane',
  g1: 'İlk adım', g2: 'Alışkanlık', g3: 'Gedikli', g4: 'Müdavim', w1: 'Dalga kıran', w2: 'Dalga ustası', w3: 'Okyanus', o1: 'Dev avcısı', o2: 'Boss katili', o3: 'Boss kâbusu',
  h1: 'Zorlu', h2: 'Kâbus gibi', c1: 'Takım oyuncusu', c2: 'Kardeşlik', l1: 'Çaylak', l2: 'Tecrübeli', l3: 'Usta', l4: 'Efsanevi', f1: 'Dost', f2: 'Kalabalık', s1: 'Alışverişçi', s2: 'Koleksiyoncu', s3: 'Hazine avcısı' };
const ACH_DESC = { kills: (n) => `${fmt(n)} zombi öldür`, best: (n) => `Bir oyunda ${n}. dalgaya ulaş`, games: (n) => `${n} oyun bitir`, waves: (n) => `${fmt(n)} dalga temizle`, bosses: (n) => `${n} boss dalgası temizle`,
  hard: (n) => `Zor ya da Kâbus'ta ${n} dalga temizle`, coop: (n) => `Arkadaşlarınla ${n} dalga temizle`, lvl: (n) => `Seviye ${n} ol`, friends: (n) => `${n} arkadaş edin`, own: (n) => `Mağazadan ${n} şey al` };
const ACH_IC = { kills: '☠', best: '🌊', games: '🎮', waves: '🌊', bosses: '👹', hard: '🔥', coop: '🤝', lvl: '⭐', friends: '👥', own: '💎' };
const questText = (q) => ({ kill: `${q.n} zombi öldür`, waves: `${q.n} dalga temizle`, reach: `Bir oyunda ${q.n}. dalgaya ulaş`, hard: `Zor ya da Kâbus'ta ${q.n} dalga temizle`,
  boss: `${q.n} boss dalgası temizle`, cls: `${CLASSES[q.k] ? CLASSES[q.k].name : q.k} ile ${q.n} dalga temizle`, coop: `Başkalarıyla bir odada ${q.n} dalga temizle` }[q.t] || '');
const QIC = { kill: '☠', waves: '🌊', reach: '📈', hard: '🔥', boss: '👹', cls: '🎖', coop: '🤝' };
// the in-game pop-up for a quest or achievement the server just saw finished
export function rewardText(r) {
  if (r.k === 'a') return { ic: ACH_IC[r.s] || '★', title: 'Başarım açıldı: ' + (ACH_NAME[r.id] || r.id), sub: (ACH_DESC[r.s] ? ACH_DESC[r.s](r.n) : '') + ` · +${r.g} elmas (Görevler'den al)` };
  return { ic: QIC[r.t] || '✓', title: (r.k === 'w' ? 'Haftalık görev tamam: ' : 'Görev tamam: ') + questText({ t: r.t, n: r.n, k: r.c }), sub: `+${r.g} elmas, +${r.k === 'w' ? 300 : 100} XP (Görevler'den al)` };
}
function untilMidnight() { const t = new Date(Date.now() + 3 * 36e5); const m = (24 * 60) - (t.getUTCHours() * 60 + t.getUTCMinutes()); return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`; }
let QD = null;
const qReady = (j) => j.q.filter((q) => q.p >= q.n && !q.c).length + (j.wq || []).filter((q) => q.p >= q.n && !q.c).length + j.ach.filter((a) => a.done && !a.claimed).length;
async function loadQuests() { const j = await acctOp('quests'); if (j.ok) { QD = j; ME.qn = qReady(j); topBar(); } return j.ok ? j : null; }
const leftTime = (t) => { const s = Math.max(0, Math.round((t - Date.now()) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} gün ${h} sa` : h ? `${h} sa ${m} dk` : `${m} dk`; };
function questRow(q, i, compact, weekly) {
  const done = q.p >= q.n, row = el('div', 'q-row' + (q.c ? ' claimed' : done ? ' done' : ''));
  row.append(el('span', 'q-ic', QIC[q.t] || '•'));
  const mid = el('div', 'q-mid'); mid.append(el('strong', '', questText(q)));
  const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * Math.min(1, q.p / q.n)) + '%'; bar.append(f);
  mid.append(bar, el('span', 'dim', `${fmt(q.p)} / ${fmt(q.n)}`));
  row.append(mid);
  if (q.c) row.append(el('span', 'q-ok', 'Alındı ✓'));
  else if (done) row.append(btn('btn primary small', `+${q.g}`, async (e) => { e.target.disabled = true; const j = await acctOp(weekly ? 'wqclaim' : 'qclaim', { i }); if (j.ok) { H.toast(`${weekly ? 'Haftalık görev' : 'Görev'} tamam! +${j.g} elmas, +${weekly ? 300 : 100} XP`, 'gem'); gemBurst(); ME.xp = j.xp || ME.xp; await loadQuests(); dashGo(page); } else H.toast('Alınamadı.', 'bad'); }));
  else { const r = el('span', 'q-rew'); r.append(gemAmt(q.g)); if (!compact) r.append(el('span', 'dim', `+${weekly ? 300 : 100} XP`)); row.append(r); }
  return row;
}
// claim every finished quest and achievement in one go
async function claimAll(b) {
  if (!QD) return; b.disabled = true; let g = 0, n = 0;
  for (let i = 0; i < QD.q.length; i++) { const q = QD.q[i]; if (q.p >= q.n && !q.c) { const j = await acctOp('qclaim', { i }); if (j.ok) { g += j.g | 0; n++; } } }
  for (let i = 0; i < (QD.wq || []).length; i++) { const q = QD.wq[i]; if (q.p >= q.n && !q.c) { const j = await acctOp('wqclaim', { i }); if (j.ok) { g += j.g | 0; n++; } } }
  for (const a of QD.ach) if (a.done && !a.claimed) { const r = await acctOp('aclaim', { id: a.id }); if (r.ok) { g += r.g | 0; n++; } }
  if (n) { H.toast(`${n} ödül alındı: +${fmt(g)} elmas`, 'gem'); gemBurst(); } else H.toast('Alınamadı.', 'bad');
  await loadQuests(); dashGo('quests');
}
function questsPage(sec) {
  const hx = el('div', 'q-headx'); const allBtn = btn('btn primary', 'Hepsini al', () => claimAll(allBtn)); allBtn.disabled = true;
  hx.append(el('span', 'dim', `Yeni görevlere ${untilMidnight()}`), allBtn);
  head(sec, 'Görevler', 'Görevler ve başarımlar', hx);
  const qc = card('Günlük görevler'); qc.append(el('p', 'note', 'Her gün üç yeni görev. Dalgaları temizledikçe ilerler.'));
  const qbox = el('div', 'q-list'); qbox.append(el('p', 'note', 'Yükleniyor…')); qc.append(qbox); sec.append(qc);
  const wc = card('Haftalık görevler'); const wnote = el('p', 'note', 'Her pazartesi üç büyük görev. Ödülleri daha büyük.'); const wbox = el('div', 'q-list'); wc.append(wnote, wbox); sec.append(wc);
  const lc = card('Haftanın sıralaması'); const lnote = el('p', 'note', 'Bu hafta kazandığın sezon XP\'si sayılır. Haftanın ilk 10\'u pazartesi elmas alır: 1. 1.000, 2. 700, 3. 500, 4–5. 300, 6–10. 200.'); const lbox = el('div', 'wk-box'); lc.append(lnote, lbox); sec.append(lc);
  const rc = card('Seviye yolu'); const road = el('div', 'road'); rc.append(el('p', 'note', 'Her seviye elmas verir; bazı seviyeler satılmayan özel ödüller açar.'), scroller(road)); sec.append(rc);
  const ac = card('Başarımlar'); const abox = el('div', 'ach-grid'); ac.append(abox); sec.append(ac);
  loadQuests().then((j) => {
    if (!j) { qbox.replaceChildren(el('p', 'msg', 'Görevler yüklenemedi.')); return; }
    qbox.replaceChildren(...j.q.map((q, i) => questRow(q, i)));
    if (j.wq) wbox.replaceChildren(...j.wq.map((q, i) => questRow(q, i, false, true)));
    if (j.wk) {
      wnote.textContent = `Her pazartesi üç büyük görev. Yenilerine ${leftTime(j.wk.end)}.`;
      const kids = [];
      if (j.wk.last && !j.wk.last.cl) { const pr = el('div', 'wk-prize'); pr.append(el('strong', '', `Geçen hafta ${j.wk.last.rank}. oldun!`), btn('btn primary small', `+${fmt(j.wk.last.g)} elmas al`, async (e) => { e.target.disabled = true; const r = await acctOp('wkp'); if (r.ok) { H.toast(`Haftanın ${r.rank}.si ödülü: +${fmt(r.n)} elmas`, 'gem'); gemBurst(); await loadQuests(); dashGo('quests'); } else H.toast('Alınamadı.', 'bad'); })); kids.push(pr); }
      kids.push(el('p', 'dim', `Bu hafta: ${fmt(j.wk.x)} XP · bitişe ${leftTime(j.wk.end)}`));
      const ol = el('ol', 'top-rows wk-rows');
      if (!j.wk.top.length) ol.append(el('li', 'empty', 'Bu hafta henüz kimse yok. İlk sen ol!'));
      for (const [i, r] of j.wk.top.entries()) { const li = el('li', i < 3 ? 'podium p' + (i + 1) : ''); const b = btn('top-row', '', () => openProfile({ name: r.name })); b.append(el('span', 'rk', String(i + 1)), avatar(r.eq || {}, 32), nameEl(r.name, r.eq || {}), el('span', 'tv', `${fmt(r.wk)} XP`)); li.append(b); ol.append(li); }
      kids.push(ol); lbox.replaceChildren(...kids);
    }
    const ready = qReady(j);
    if (ready) { allBtn.disabled = false; allBtn.textContent = `Hepsini al (${ready})`; }
    const L = j.lvl;
    for (let l = 2; l <= 50; l++) {
      const r = j.road[l]; if (!r) continue;
      const n = el('div', 'road-n' + (l <= L ? ' got' : '') + (l === L + 1 ? ' next' : '') + (r.it ? ' big' : ''));
      n.append(el('span', 'road-l', String(l)));
      if (r.it && ITEMS[r.it]) { const it = ITEMS[r.it]; n.append(el('span', 'road-it', it.name)); n.title = `Seviye ${l}: ${it.name} (${RARITY[it.r]}) ve ${r.g} elmas`; }
      else n.title = `Seviye ${l}: ${r.g} elmas`;
      n.append(gemAmt(r.g, 'gem-amt sm'));
      road.append(n);
    }
    setTimeout(() => { const nx = road.querySelector('.next'); if (nx) road.scrollLeft = nx.offsetLeft - road.clientWidth / 2; }, 50);
    const got = j.ach.filter((a) => a.claimed).length;
    ac.querySelector('h3').textContent = `Başarımlar · ${got}/${j.ach.length}`;
    const order = j.ach.slice().sort((a, b) => ((b.done && !b.claimed) - (a.done && !a.claimed)) || (a.claimed - b.claimed));
    abox.replaceChildren(...order.map((a) => {
      const d = el('div', 'ach' + (a.claimed ? ' got' : a.done ? ' ready' : ''));
      d.append(el('span', 'ach-ic', ACH_IC[a.k] || '★'));
      const m = el('div', 'ach-m'); m.append(el('strong', '', ACH_NAME[a.id] || a.id), el('span', 'dim', ACH_DESC[a.k] ? ACH_DESC[a.k](a.n) : ''));
      if (!a.claimed) { const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * a.p / a.n) + '%'; bar.append(f); m.append(bar); }
      d.append(m);
      if (a.claimed) d.append(el('span', 'q-ok', '✓'));
      else if (a.done) d.append(btn('btn primary small', `+${a.g}`, async (e) => { e.target.disabled = true; const r = await acctOp('aclaim', { id: a.id }); if (r.ok) { H.toast(`Başarım: ${ACH_NAME[a.id]}! +${r.g} elmas`, 'gem'); gemBurst(); dashGo('quests'); } else H.toast('Alınamadı.', 'bad'); }));
      else d.append(gemAmt(a.g, 'gem-amt sm'));
      return d;
    }));
  });
}

// ---------- badges ----------
function badgesCard(have) {
  const c = card('Rozetler'), grid = el('div', 'bdg-grid'), got = new Set(have);
  for (const [id, [n, d, ic]] of Object.entries(BADGES)) { const b = el('div', 'bdg' + (got.has(id) ? ' on' : '')); b.title = d; b.append(el('span', 'bi', ic), el('b', '', n), el('small', '', d)); grid.append(b); }
  c.append(el('p', 'note', `${got.size} / ${Object.keys(BADGES).length} rozet. Oynadıkça kendiliğinden kazanılır.`), grid);
  return c;
}

// ---------- clans ----------
const CL_ROLE = { l: 'Lider', o: 'Yardımcı', m: 'Üye' };
const CL_ERR = { name: 'Klan adı 3–20 harf ya da rakam olmalı.', tag: 'Etiket 2–4 harf ya da rakam olmalı.', bad: 'Bu ad kullanılamaz.', taken: 'Bu ad alınmış.', tagtaken: 'Bu etiket alınmış.', gems: 'Klan kurmak 1.000 elmas.', inclan: 'Zaten bir klandasın.', full: 'Klan dolu.', role: 'Bunu yapmaya yetkin yok.', nouser: 'Böyle bir oyuncu yok.', gone: 'Bulunamadı.', slow: 'Biraz yavaş, birazdan tekrar dene.' };
const clErr = (r) => H.toast(CL_ERR[r.reason] || 'Olmadı.', 'bad');
function clanPage(sec, arg) {
  const mine = ME.clan && ME.clan.id;
  head(sec, 'Klan', arg && arg !== mine ? 'Klan' : mine ? 'Klanın' : 'Klanlar');
  const box = el('div', 'clan-wrap'); box.append(el('p', 'note', 'Yükleniyor…')); sec.append(box);
  const id = arg || mine;
  if (!id) { clanBrowse(box); return; }
  acctOp('cget', { id }).then((j) => {
    if (!j.ok) { if (!arg) { ME.clan = null; clanBrowse(box); } else box.replaceChildren(el('p', 'note', 'Bu klan artık yok.')); return; }
    const c = j.c, me = j.me, off = me === 'l' || me === 'o';
    const top = card(''); top.classList.add('clan-head');
    const t = el('div', 'clan-title'); t.append(el('span', 'clan-t big', '[' + c.tag + ']'), el('strong', '', c.name));
    top.append(t, el('p', 'note', c.desc || 'Açıklama yok.'), el('p', 'clan-meta', `${c.n}/${c.max} üye · bu sezon ${fmt(c.score)} puan · ${c.open ? 'herkes katılabilir' : 'istekle katılım'}`));
    const acts = el('div', 'row-btns');
    if (!me && !mine) acts.append(btn('btn primary', c.open ? 'Katıl' : 'Katılma isteği gönder', async () => { const r = await acctOp('cjoin', { id: c.id }); if (!r.ok) { clErr(r); return; } H.toast(r.joined ? 'Klana katıldın!' : 'İstek gönderildi.', 'good'); await acctCheck(); dashGo('clan'); }));
    if (me) acts.append(btn('btn ghost', me === 'l' && c.n > 1 ? 'Klandan ayrıl (liderlik devredilir)' : 'Klandan ayrıl', async () => { if (!confirm('Klandan ayrılmak istediğine emin misin?')) return; const r = await acctOp('cleave'); if (!r.ok) { clErr(r); return; } ME.clan = null; dashGo('clan'); }));
    if (me === 'l') acts.append(btn('btn ghost danger', 'Klanı dağıt', async () => { if (!confirm('Klan tamamen silinecek. Emin misin?')) return; const r = await acctOp('cdel'); if (!r.ok) { clErr(r); return; } ME.clan = null; dashGo('clan'); }));
    top.append(acts); box.replaceChildren(top);
    if (off) {
      const st = card('Klan ayarları'), desc = el('textarea'); desc.maxLength = 120; desc.value = c.desc || ''; desc.rows = 2;
      const op = el('label', 'voice-open'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!c.open; op.append(cb, el('span', '', 'Herkes istek beklemeden katılabilsin'));
      const inv = el('input'); inv.placeholder = 'Oyuncu adı'; inv.maxLength = 16;
      st.append(desc, op, btn('btn small', 'Kaydet', async () => { const r = await acctOp('cset', { desc: desc.value, open: cb.checked ? 1 : 0 }); if (!r.ok) clErr(r); else { H.toast('Kaydedildi.', 'good'); dashGo('clan'); } }),
        el('div', 'clan-inv'), btn('btn small primary', 'Davet et', async () => { const r = await acctOp('cinv', { name: inv.value.trim() }); if (!r.ok) clErr(r); else { H.toast('Davet gönderildi.', 'good'); inv.value = ''; } }));
      st.querySelector('.clan-inv').append(inv);
      if (c.req && c.req.length) { const rq = el('ul', 'clan-req'); for (const q of c.req) { const li = el('li'); li.append(el('b', '', q.name), el('small', '', 'Sv ' + q.lvl), btn('btn small primary', 'Kabul', async () => { const r = await acctOp('cacc', { i: q.i }); if (!r.ok) clErr(r); dashGo('clan'); }), btn('btn small ghost', 'Reddet', async () => { await acctOp('cno', { i: q.i }); dashGo('clan'); })); rq.append(li); } st.append(el('p', 'note', 'Katılma istekleri'), rq); }
      box.append(st);
    }
    const ml = card('Üyeler'), ul = el('ul', 'clan-mem');
    for (const m of c.mem) {
      const li = el('li', m.on ? 'on' : ''); const who = btn('top-row', '', () => openProfile({ name: m.name }));
      who.append(avatar(m.eq || {}, 32), nameEl(m.name, m.eq || {}), lvlBadge(m.lvl), el('span', 'role r-' + m.r, CL_ROLE[m.r] || ''), el('span', 'tv', `${fmt(m.x)} puan${m.on ? ' · çevrimiçi' : ''}`));
      li.append(who);
      if (me === 'l' && m.r !== 'l') li.append(btn('btn small ghost', m.r === 'o' ? 'Üye yap' : 'Yardımcı yap', async () => { await acctOp('crole', { i: m.i, r: m.r === 'o' ? 'm' : 'o' }); dashGo('clan'); }), btn('btn small ghost', 'Lider yap', async () => { if (!confirm(m.name + ' klan lideri olsun mu?')) return; await acctOp('clead', { i: m.i }); dashGo('clan'); }));
      if (off && m.r !== 'l' && (me === 'l' || m.r === 'm')) li.append(btn('btn small ghost danger', 'Çıkar', async () => { if (!confirm(m.name + ' klandan çıkarılsın mı?')) return; await acctOp('ckick', { i: m.i }); dashGo('clan'); }));
      ul.append(li);
    }
    ml.append(ul, el('p', 'note', 'Klan puanı, üyelerin bu sezon kazandığı sezon XP\'sinin toplamıdır.')); box.append(ml);
  });
}
function clanBrowse(box) {
  box.replaceChildren();
  if (ME.cinv && ME.cinv.length) {
    const ic = card('Klan davetlerin');
    for (const v of ME.cinv) { const r = el('div', 'clan-invrow'); r.append(el('span', 'clan-t', '[' + v.t + ']'), el('b', '', v.n), el('small', '', v.by + ' davet etti'), btn('btn small primary', 'Katıl', async () => { const j = await acctOp('cjoin', { id: v.c }); if (!j.ok) { clErr(j); return; } await acctCheck(); dashGo('clan'); }), btn('btn small ghost', 'Reddet', async () => { await acctOp('cinvno', { c: v.c }); ME.cinv = ME.cinv.filter((x) => x !== v); dashGo('clan'); })); ic.append(r); }
    box.append(ic);
  }
  const mk = card('Klan kur');
  const n = el('input'); n.placeholder = 'Klan adı (3–20)'; n.maxLength = 20; const t = el('input'); t.placeholder = 'Etiket (2–4, ör. KRT)'; t.maxLength = 4; t.oninput = () => { t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const op = el('label', 'voice-open'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; op.append(cb, el('span', '', 'Herkes istek beklemeden katılabilsin'));
  const go = btn('btn primary', 'Klanı kur · 1.000 elmas', async () => { go.disabled = true; const r = await acctOp('cmake', { name: n.value, tag: t.value, open: cb.checked ? 1 : 0 }); go.disabled = false; if (!r.ok) { clErr(r); return; } ME.gems = r.gems; ME.clan = { id: r.c.id, tag: r.c.tag }; H.toast('Klan kuruldu!', 'good'); dashGo('clan'); });
  const f = el('div', 'clan-form'); f.append(n, t); mk.append(el('p', 'note', 'En çok 20 kişi. Etiketin oyunda adının önünde görünür.'), f, op, go); box.append(mk);
  const ls = card('Klan ara'); const q = el('input'); q.placeholder = 'Ad ya da etiket'; const ul = el('ol', 'top-rows');
  const load = () => acctOp('clist', { q: q.value }).then((j) => { if (!j.ok) return; ul.replaceChildren(...(j.L.length ? j.L : []).map((c) => { const li = el('li'); const b = btn('top-row', '', () => dashGo('clan', c.id)); b.append(el('span', 'clan-t big', '[' + c.tag + ']'), el('b', 'cl-name', c.name), el('span', 'tv', `${c.n}/${c.max} · ${c.open ? 'açık' : 'istekle'}`)); li.append(b); return li; })); if (!j.L.length) ul.append(el('li', 'empty', 'Klan bulunamadı.')); });
  let tq = 0; q.oninput = () => { clearTimeout(tq); tq = setTimeout(load, 350); };
  ls.append(q, ul); box.append(ls); load();
}

// ---------- PvP rank ----------
function pvpCard() {
  const v = ME.pvp || { rp: 0, w: 0, l: 0, dr: 0, k: 0, dt: 0, m: 0 }, L = league(v.rp);
  const c = card('PvP ligi', btn('btn small ghost', 'Sıralama', () => { topTab = 'pvp'; dashGo('top'); }));
  const row = el('div', 'pv-rank');
  const badge = el('div', 'pv-badge'); badge.style.setProperty('--lc', L.c); badge.append(el('strong', '', L.n), el('span', '', L.div || '★'));
  const info = el('div', 'pv-info');
  const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * L.pct) + '%'; f.style.background = L.c; bar.append(f);
  const next = LEAGUES[L.i + 1];
  info.append(el('b', '', `${L.name} · ${fmt(v.rp)} puan`), bar,
    el('small', 'note', v.m ? `${v.w} galibiyet, ${v.l} yenilgi${v.dr ? `, ${v.dr} beraberlik` : ''} · ${v.k} leş, ${v.dt} ölüm` + (L.to ? ` · bir sonraki kademe ${fmt(L.to)} puanda` : '') : `Henüz dereceli maç yok. Bir odada PvP seç, arkadaşlarınla dövüş; kazandıkça ${next ? next.n : 'yukarı'} ligine yüksel.`));
  row.append(badge, info); c.append(row);
  if (v.last && !v.last.cl) {
    const lg = LEAGUES[v.last.lg] || LEAGUES[0], gems = [100, 250, 500, 900, 1500][v.last.lg] || 0;
    const b = btn('btn small primary', `Geçen sezonun ödülü: ${lg.n} · ${gems} elmas al`, async () => { b.disabled = true; const r = await acctOp('pvpcl'); if (r.ok) { ME.gems = r.gems; v.last.cl = 1; H.toast(`+${r.g} elmas!`, 'good'); dashGo('profile'); } else { b.disabled = false; H.toast('Alınamadı.', 'bad'); } });
    c.append(b);
  }
  c.append(el('p', 'note', 'Her ay yeni sezon başlar; puanının %60\'ı kalır. Sezonun en yüksek ligine göre elmas ödülü alırsın.'));
  return c;
}

// ---------- leaderboard ----------
let topTab = 'xp';
function topPage(sec) {
  head(sec, 'Sıralama', 'En iyiler');
  const tabs = el('div', 'seg-tabs');
  for (const [k, n] of [['wk', 'Bu hafta'], ['xp', 'Seviye'], ['best', 'En iyi dalga'], ['end', 'Hayatta Kalma'], ['daily', 'Günün görevi'], ['pvp', 'PvP'], ['clans', 'Klanlar'], ['kills', 'En çok öldürme']]) { const b = btn('', n, () => { topTab = k; dashGo('top'); }); b.setAttribute('aria-selected', String(k === topTab)); tabs.append(b); }
  sec.append(segTabs(tabs));
  const ol = el('ol', 'top-rows'); ol.append(el('li', 'empty', 'Yükleniyor…'));
  sec.append(ol);
  if (topTab === 'clans') {
    acctOp('clist').then((j) => {
      if (!j.ok) { ol.replaceChildren(el('li', 'empty', 'Sıralama yüklenemedi.')); return; }
      if (!j.L.length) { ol.replaceChildren(el('li', 'empty', 'Henüz klan yok. İlk klanı sen kur!')); return; }
      ol.replaceChildren(...j.L.map((c, i) => { const li = el('li', i < 3 ? 'podium p' + (i + 1) : ''); const b = btn('top-row', '', () => dashGo('clan', c.id)); b.append(el('span', 'rk', String(i + 1)), el('span', 'clan-t big', '[' + c.tag + ']'), el('b', 'cl-name', c.name), el('span', 'tv', `${fmt(c.score)} puan · ${c.n}/${c.max}`)); li.append(b); return li; }));
    });
    return;
  }
  (topTab === 'daily' ? dailyGet() : topGet()).then((j) => {
    if (!j.ok) { ol.replaceChildren(el('li', 'empty', 'Sıralama yüklenemedi.')); return; }
    const L = topTab === 'daily' ? j.top : (j.top[topTab] || []);
    if (!L.length) { ol.replaceChildren(el('li', 'empty', 'Henüz kimse yok. Bir oyun bitir, ilk sen ol!')); return; }
    if (topTab === 'wk' && j.top.wend) ol.before(el('p', 'note wk-note', `Bu hafta kazanılan sezon XP'si. İlk 10 pazartesi elmas alır (Görevler sayfasından). Bitişe ${leftTime(j.top.wend)}.`));
    ol.replaceChildren(...L.map((r, i) => {
      const li = el('li', i < 3 ? 'podium p' + (i + 1) : '');
      const b = btn('top-row', '', () => openProfile({ name: r.name }));
      b.append(el('span', 'rk', String(i + 1)), avatar(r.eq || {}, 36), nameEl(r.name, r.eq || {}), topTab === 'daily' ? el('span') : lvlBadge(r.lvl || 1),
        el('span', 'tv', topTab === 'wk' ? `${fmt(r.wk || 0)} XP` : topTab === 'xp' ? `Seviye ${r.lvl || 1}` : topTab === 'best' ? `${r.best}. dalga` : topTab === 'end' ? `${r.end}. dalga` : topTab === 'daily' ? `${r.w}. dalga · ${fmt(r.k)} zombi` : topTab === 'pvp' ? `${league(r.pv).name} · ${fmt(r.pv)} puan` : `${fmt(r.kills)} zombi`));
      li.append(b); return li;
    }));
  });
}

// which notices this player wants (phone and browser alike) and quiet hours, saved on the account
const PN_KINDS = [['dm', 'Özel mesajlar'], ['fr', 'Arkadaşlık istekleri'], ['inv', 'Oda davetleri (dokununca odaya katılırsın)'], ['clan', 'Klan davetleri ve istekleri'], ['news', 'Duyurular ve etkinlikler']];
function notifyCard() {
  const c = card('Bildirim seçenekleri'), set = ME.set || {}, pn = Object.assign({}, set.pn || {});
  const save = async (patch) => { const j = await acctOp('set', { s: patch }); if (j.ok) { ME.set = j.set; H.toast('Kaydedildi.', 'good'); } else H.toast('Kaydedilemedi.', 'bad'); };
  for (const [k, label] of PN_KINDS) {
    const lab = el('label', 'voice-open'), cb = el('input'); cb.type = 'checkbox'; cb.checked = pn[k] !== 0; cb.dataset.pn = k;
    cb.onchange = () => { pn[k] = cb.checked ? 1 : 0; save({ pn }); };
    lab.append(cb, el('span', '', label)); c.append(lab);
  }
  // quiet hours: no notices between two hours (Turkey time)
  const q = Array.isArray(set.qh) ? set.qh : null, row = el('div', 'qh-row'), on = el('input'); on.type = 'checkbox'; on.checked = !!q;
  const hourSel = (v) => { const s2 = el('select', 'qh-sel'); for (let h = 0; h < 24; h++) { const o = el('option', '', String(h).padStart(2, '0') + ':00'); o.value = String(h); s2.append(o); } s2.value = String(v); return s2; };
  const from = hourSel(q ? q[0] : 23), to = hourSel(q ? q[1] : 8);
  const apply = () => { from.disabled = to.disabled = !on.checked; if (on.checked && from.value === to.value) to.value = String((+from.value + 8) % 24); save({ qh: on.checked ? [+from.value, +to.value] : null }); };
  on.onchange = apply; from.onchange = apply; to.onchange = apply; from.disabled = to.disabled = !on.checked;
  const lab = el('label', 'voice-open'); lab.append(on, el('span', '', 'Sessiz saatler'));
  row.append(from, el('span', 'dim', '–'), to);
  c.append(lab, row, el('p', 'note', 'Sessiz saatlerde telefonuna ve tarayıcına bildirim gelmez (Türkiye saati). Oyundayken gelenleri yine görürsün.'));
  return c;
}
// ---------- account settings ----------
function accountPage(sec) {
  head(sec, 'Ayarlar', 'Hesap ve görünüm');
  if (appPushCan()) { const pc = card('Telefon bildirimleri'), lab = el('label', 'voice-open'), cb = el('input'); cb.type = 'checkbox'; cb.checked = appPushOn();
    cb.onchange = async () => { const ok = await appPushSet(cb.checked); if (!ok && cb.checked) { H.toast('Bildirim izni verilmedi ya da telefon henüz hazır değil. Telefonun Ayarlar > Uygulamalar > Kuşatma > Bildirimler bölümünden izin verebilirsin.', 'bad'); } };
    lab.append(cb, el('span', '', 'Oyun kapalıyken mesaj, arkadaşlık isteği, klan daveti ve duyuruları telefonuma bildir'));
    pc.append(lab); sec.append(pc); }
  if (!appPushCan()) { const nc = card('Tarayıcı bildirimleri'), lab = el('label', 'voice-open'), cb = el('input'); cb.type = 'checkbox'; cb.checked = sysNotifyOn();
    cb.onchange = async () => { const ok = await sysNotifySet(cb.checked); cb.checked = ok && cb.checked; if (!ok && cb.checked === false && typeof Notification !== 'undefined' && Notification.permission === 'denied') H.toast('Tarayıcı bildirimleri engellemiş. Adres çubuğundaki kilit simgesinden izin verebilirsin.', 'bad'); };
    lab.append(cb, el('span', '', 'Oyun arka plandaki bir sekmedeyken mesaj, arkadaşlık isteği, oda ve klan davetlerini bildir'));
    nc.append(lab, el('p', 'note', 'Bildirimler yalnızca site açıkken (arka planda bile olsa) gelir. Android uygulamasında oyun kapalıyken de gelir.')); sec.append(nc); }
  sec.append(notifyCard());
  const th = card('Tema');
  const tg = el('div', 'theme-grid');
  for (const id of Object.keys(THEMES)) {
    const have = owns(id) || isFree(id);
    const b = btn('theme-pick' + ((ME.eq.thm || 't.gece') === id ? ' on' : '') + (have ? '' : ' locked'), '');
    const sw = el('div', 'theme-sw'); sw.dataset.theme = id.slice(2);
    b.append(sw, el('span', '', ITEMS[id].name));
    if (!have) b.append(gemAmt(priceOf(id) || 0));
    b.onclick = () => (have ? equip('thm', id === 't.gece' ? '' : id) : previewTheme(id));
    if (!have) b.title = 'Dokun: önizle';
    tg.append(b);
  }
  th.append(tg);
  sec.append(th);

  {
    const lg = card('Yasal ve çerezler');
    const row = el('div', 'legal-links dp-legal');
    for (const [h, t] of [['gizlilik.html', 'Gizlilik Politikası'], ['cerezler.html', 'Çerez Politikası'], ['kosullar.html', 'Kullanım Şartları']]) { const a = el('a', '', t); a.href = h; a.target = '_blank'; a.rel = 'noopener'; row.append(a); }
    const cb = btn('ck-open', 'Çerez tercihleri'); row.append(cb);
    lg.append(el('p', 'note', 'Hangi bilgileri neden sakladığımızı buradan okuyabilir, çerez tercihini değiştirebilirsin.'), row);
    sec.append(lg);
  }
  const pv = card('Gizlilik');
  const sw = (k, label, hint, val, set) => {
    const row = el('label', 'sw-row'); const t = el('span'); t.append(el('strong', '', label), el('span', 'dim', hint));
    const i = el('input'); i.type = 'checkbox'; i.checked = val; i.className = 'switch';
    i.onchange = async () => { const j = await acctOp('set', { s: set(i.checked) }); if (!j.ok) { i.checked = !i.checked; H.toast('Kaydedilemedi.', 'bad'); } };
    row.append(t, i); return row;
  };
  pv.append(sw('fr', 'Arkadaşlık istekleri', 'Başkaları sana istek gönderebilsin.', !!ME.set.fr, (v) => ({ fr: v })),
    sw('on', 'Çevrimiçi görün', 'Arkadaşların oyunda olduğunu görsün.', !!ME.set.on, (v) => ({ on: v })),
    sw('room', 'Odamı göster', 'Arkadaşların hangi odada olduğunu görüp katılabilsin.', !!ME.set.room, (v) => ({ room: v })),
    sw('lb', 'Sıralamada görün', 'Adın sıralama listelerinde çıksın.', !ME.hideLb, (v) => ({ lb: v })));
  sec.append(pv);

  const ac = card('Hesap');
  const row = (label, hint, b) => { const r = el('div', 'acc-row'); const t = el('span'); t.append(el('strong', '', label), el('span', 'dim', hint)); r.append(t, b); return r; };
  const renCost = LIVE.shop ? LIVE.shop.ren : 500;
  ac.append(row('Adını değiştir', `Yeni ad ${renCost} elmas. Şu an: ${ACCT.name}`, btn('btn small', 'Değiştir', () => formDlg('Adını değiştir', [['name', 'Yeni ad', 'text']], `${renCost} elmas harcanacak.`, 'Değiştir', async (v) => {
    if (!/^[A-Za-z0-9]{6,16}$/.test(v.name.trim())) return v.name.trim().length < 6 ? 'Ad en az 6, en fazla 16 karakter olmalı.' : 'Ad 6–16 karakter olmalı; sadece İngilizce harf (A-Z) ve rakam.';
    const j = await acctOp('ren', { name: v.name.trim() });
    if (j.ok) { H.toast('Adın değişti.', 'good'); H.refresh(); return ''; }
    return { name: 'Ad en az 6, en fazla 16 karakter olmalı.', chars: 'Ad 6–16 karakter olmalı; sadece İngilizce harf (A-Z) ve rakam.', taken: 'Bu ad alınmış.', gems: 'Elmasın yetmiyor.', slow: 'Bugün yeterince denedin.' }[j.reason] || 'Değiştirilemedi.';
  }))));
  ac.append(row('Şifreni değiştir', 'Diğer cihazlardaki oturumlar kapanır.', btn('btn small', 'Değiştir', () => formDlg('Şifreni değiştir', [['old', 'Şu anki şifre', 'password'], ['pw', 'Yeni şifre (en az 6)', 'password']], '', 'Değiştir', async (v) => {
    const j = await acctOp('pw', v);
    if (j.ok) { H.toast('Şifren değişti.', 'good'); return ''; }
    return { wrong: 'Şu anki şifre yanlış.', pw: 'Yeni şifre en az 6 karakter olmalı.', slow: 'Çok fazla deneme. Sonra tekrar dene.' }[j.reason] || 'Değiştirilemedi.';
  }))));
  { let av = 0; try { av = window.KusatmaApp && typeof window.KusatmaApp.version === 'function' ? +window.KusatmaApp.version() || 0 : 0; } catch (e) { /* ignore */ }
    if (/KusatmaApp\//.test(navigator.userAgent) && av && av < APP_BUILD) { const a = el('a', 'btn small', 'Güncelle'); a.href = 'https://umvtt.github.io/kusatma?guncelle=2'; ac.append(row('Uygulama güncellemesi', `Yeni sürüm ${APP_BUILD}.0 hazır (sendeki ${av}.0). İstersen güncelle; zorunlu değil.`, a)); } }
  if (/Android/i.test(navigator.userAgent) && !/KusatmaApp\//.test(navigator.userAgent)) { const a = el('a', 'btn small', 'İndir'); a.href = `app/kusatma-${APP_BUILD}.0.apk`; a.download = `Kuşatma ${APP_BUILD}.0.apk`; ac.append(row('Android uygulaması', 'Kuşatma\'yı telefonuna uygulama olarak kur. Güncellemeler kendiliğinden gelir.', a)); }
  ac.append(row('Oyun ayarları', 'Ses, karanlık, yakınlaştırma, ekran sarsıntısı.', btn('btn small', 'Aç', () => H.openSettings())));
  ac.append(row('Bağlantı testi', 'Oyuna bağlanamıyorsan nedenini bul.', btn('btn small', 'Başlat', () => H.openDiag())));
  ac.append(row('Çıkış yap', 'Bu cihazda hesabından çık.', btn('btn small ghost', 'Çıkış yap', () => H.signOut())));
  sec.append(ac);
  const dz = card('Tehlikeli bölge');
  dz.classList.add('danger-card');
  dz.append(row('Hesabı sil', 'Elmasların, eşyaların ve arkadaşların kalıcı olarak silinir.', btn('btn small danger', 'Hesabı sil', () => formDlg('Hesabı sil', [['pw', 'Şifren', 'password']], 'Bu geri alınamaz.', 'Kalıcı olarak sil', async (v) => {
    const j = await acctOp('del', v);
    if (j.ok) { H.toast('Hesabın silindi.'); H.signedOut(); return ''; }
    return j.reason === 'wrong' ? 'Şifre yanlış.' : 'Silinemedi.';
  }))));
  sec.append(dz);
  sec.append(el('p', 'set-build', `Kuşatma · Yapı ${BUILD}`));
}
function formDlg(title, fields, note, go, fn) {
  const dlg = $('#form-dlg'); dlg.hidden = false; front(dlg);
  $('#form-title').textContent = title; $('#form-note').textContent = note; $('#form-go').textContent = go;
  const box = $('#form-fields'), msg = $('#form-msg'); msg.hidden = true;
  box.replaceChildren(...fields.map(([k, label, type]) => { const l = el('label', 'field'); const i = el('input'); i.type = type; i.name = k; i.maxLength = type === 'password' ? 64 : 16; i.autocomplete = type === 'password' ? 'current-password' : 'off'; l.append(el('span', '', label), i); return l; }));
  const fi = box.querySelector('input'); if (fi) fi.focus(); else $('#form-go').focus();
  $('#form-go').onclick = async () => {
    const v = {}; for (const i of box.querySelectorAll('input')) v[i.name] = i.value;
    $('#form-go').disabled = true;
    const err = await fn(v);
    $('#form-go').disabled = false;
    if (err) { msg.hidden = false; msg.textContent = err; } else dlg.hidden = true;
  };
}

// ---------- wiring ----------
export function dashInit(hooks) {
  H = hooks;
  for (const b of document.querySelectorAll('[data-dp]')) b.onclick = () => dashGo(b.dataset.dp);
  $('#dp-gems').onclick = () => dashGo('shop');
  $('#dp-daily').onclick = async () => { if (ME.dl) { H.toast('Bugünkü ödülü aldın. Yarın tekrar gel!'); return; } await claimDaily(); if (page === 'home') dashGo('home'); };
  $('#dp-me').onclick = () => dashGo('profile');
  $('#dp-bell').onclick = (e) => { e.stopPropagation(); bellToggle(); };
  $('#bell-clear').onclick = (e) => { e.stopPropagation(); bellSet([]); bellDraw(); bellBadge(); };
  document.addEventListener('click', (e) => { const p = $('#bell-pop'); if (!p.hidden && !p.contains(e.target)) { p.hidden = true; $('#dp-bell').setAttribute('aria-expanded', 'false'); } });
  $('#dp-search').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { openProfile({ name: e.target.value.trim() }); e.target.value = ''; } });
  $('#dm-close').onclick = () => { $('#dm').hidden = true; dmWith = null; };
  $('#dm-send').onclick = sendDm;
  $('#dm-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendDm(); e.stopPropagation(); });
  $('#prof-close').onclick = () => { $('#prof-dlg').hidden = true; };
  $('#rep-close').onclick = () => { $('#rep-dlg').hidden = true; };
  $('#form-close').onclick = () => { $('#form-dlg').hidden = true; };
  $('#buy-close').onclick = () => { $('#buy-dlg').hidden = true; };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && page === 'home') heroStart(); });
  // friends' online status stays fresh while the panel is open
  setInterval(() => { if (ACCT && !document.hidden && !$('#dashpage').hidden && (page === 'home' || page === 'friends' || page === 'play')) refreshFriends(); }, 30000);
  // lists that change by themselves stay fresh while someone is looking at them (paused after 5 idle minutes)
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true });
  setInterval(() => {
    if (!ACCT || document.hidden || $('#dashpage').hidden || Date.now() - lastAct > 300000) return;
    if (softLater) dashSoft();
    for (const ul of document.querySelectorAll('#dp-page ul[data-rooms]')) roomsGet().then((j) => { if (ul.isConnected && j.ok) ul.replaceChildren(...H.roomItems(j.rooms, +ul.dataset.rooms)); });
    if (page === 'top' && Date.now() - topAt > 60000) { topAt = Date.now(); dashSoft(); }
  }, 15000);
}
let shown = false, shown2 = false, lastAct = Date.now(), topAt = Date.now();
export function dashShow(on) {
  if (!on) { shown = false; shown2 = false; if (pageFromPath()) { try { history.replaceState(null, '', ROOT() + location.search); } catch (e) { /* ignore */ } } return; }
  applyTheme();
  topBar();
  if (!shown) { shown = true; let p = pageFromPath(); if (!p) { try { p = localStorage.getItem('kusatma-dp') || 'home'; } catch (e) { p = 'home'; } } dashGo(PAGES[p] ? p : 'home'); }
}
export function dashRefresh() { if (!ACCT || $('#dashpage').hidden) return; applyTheme(); topBar(); dashSoft(); }
// draw the open page again with fresh data, in place: same scroll position, no entrance animation, never while the
// player is typing or has a window open on top
export function dashSoft() {
  if (!ACCT || $('#dashpage').hidden || page === 'locker') return;
  if (document.querySelector('#buy-dlg:not([hidden]), #prof-dlg:not([hidden]), #form-dlg:not([hidden]), #rep-dlg:not([hidden]), #dm:not([hidden]), .spin-pop, #thm-pv:not([hidden])')) { softLater = true; return; }
  const a = document.activeElement;
  if (a && a.closest && a.closest('#dp-page') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { softLater = true; return; }
  softLater = false;
  const main = $('#dp-page'), y = main.scrollTop;
  main.classList.add('soft');
  dashGo(page);
  main.scrollTop = y;
  setTimeout(() => main.classList.remove('soft'), 400);
}
let softLater = false;
export function dashTop() { if (ACCT) topBar(); }
export const dashPage = () => page;
export { openProfile, acctCheck };
