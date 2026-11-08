// The signed-in player's home: a full website around the game (home, play, profile and wardrobe, gem shop,
// friends and private messages, leaderboard, account settings and themes). Text from the server only ever goes
// into textContent.
import { ACCT, ME, LIVE, acctOp, owns, friendsGet, dmHistory, dmSend, topGet, roomsGet, acctCheck } from './live.js';
import { ITEMS, SLOTS, SLOT_OF, RARITY, FREE_CLS, isFree, titleOf } from './catalog.js';
import { CLASSES, CLASS_ORDER, DIFFS, MAX_PLAYERS, BUILD } from './config.js';
import { drawCharacter } from './render.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.onclick = fn; return b; };
const fmt = (n) => Math.round(n).toLocaleString('tr');
let H = null;
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
  const k = S / (opts.zoom || 58); g.translate(r - 6 * k, r + 1 * k); g.scale(k, k);
  drawCharacter(g, opts.cls || 'asker', colorOf(eq), opts.angle != null ? opts.angle : -0.55, opts.walk || 0, { alive: true, hat: eq && eq.hat, wsk: eq && eq.wsk, time: opts.time || 0 });
  g.restore();
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, fr.c[0]); gr.addColorStop(1, fr.c[1]);
  g.strokeStyle = gr; g.lineWidth = Math.max(2.5, S / 16);
  g.beginPath(); g.arc(r, r, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
}
function avatar(eq, size, cls) { const c = el('canvas', 'av'); drawAvatar(c, eq, { size, cls }); return c; }
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
function applyTheme() {
  const id = ME.eq.thm && THEMES[ME.eq.thm] ? ME.eq.thm : 't.gece';
  $('#dashpage').dataset.theme = id.slice(2);
}

// ---------- the hero scene on the home page: your soldier holding off a few zombies ----------
const hero = { raf: 0, t: 0, z: [], shots: [], cv: null, last: 0, aim: 0, flakes: [] };
function heroStart() {
  hero.cv = $('#dp-hero-cv');
  if (!hero.cv || hero.raf) return;
  hero.last = performance.now();
  const loop = (now) => {
    hero.raf = 0;
    if (page !== 'home' || document.hidden || $('#dashpage').hidden) return;
    const dt = Math.min(0.05, (now - hero.last) / 1000); hero.last = now;
    heroStep(dt); heroDraw();
    hero.raf = requestAnimationFrame(loop);
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
  const th = THEMES[ME.eq.thm] || THEMES['t.gece'];
  if (th.snow) {
    while (hero.flakes.length < 70) hero.flakes.push({ x: Math.random() * W, y: Math.random() * Hh, v: 20 + Math.random() * 40 });
    for (const f of hero.flakes) { f.y += f.v * dt; f.x += Math.sin(hero.t + f.v) * dt * 10; if (f.y > Hh) { f.y = -4; f.x = Math.random() * W; } }
  } else hero.flakes.length = 0;
}
function heroDraw() {
  const cv = hero.cv, dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, Hh = cv.clientHeight;
  if (!W || !Hh) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
  const g = cv.getContext('2d'), th = THEMES[ME.eq.thm] || THEMES['t.gece'];
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
}

// ---------- pages ----------
const PAGES = { quests: questsPage, home: homePage, play: playPage, profile: profilePage, locker: lockerPage, shop: shopPage, friends: friendsPage, top: topPage, account: accountPage };
export function dashGo(p, arg) {
  if (!PAGES[p]) p = 'home';
  page = p;
  for (const b of document.querySelectorAll('[data-dp]')) b.setAttribute('aria-selected', String(b.dataset.dp === p || ((p === 'locker' || ((p === 'top' || p === 'account') && innerWidth <= 880)) && b.dataset.dp === 'profile')));
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
  acts.append(btn('btn primary big play-btn', 'Oyna', () => dashGo('play')), btn('btn ghost', 'Tek başına', () => H.solo()), btn('btn ghost', 'Oda kur', () => H.roomDlg()));
  txt.append(acts);
  heroBox.append(cv, txt);
  sec.append(heroBox);

  // friends strip
  const fr = card('Arkadaşlar', btn('btn small ghost', 'Tümü', () => dashGo('friends')));
  const strip = el('div', 'fr-strip'); strip.id = 'home-fr';
  const add = btn('fr-dot add', '', () => dashGo('friends', 'add')); add.append(el('span', 'plus', '+'), el('span', 'fn', 'Ekle'));
  strip.append(add);
  fr.append(strip);
  sec.append(fr);
  friendsGet().then((d) => { if (d) onFriends(d); });

  const row = el('div', 'dp-grid3');
  // daily reward
  const daily = card('Günlük ödül');
  const dl = el('div', 'daily');
  dl.append(el('div', 'daily-gem'));
  dl.firstChild.append(gemIcon(40));
  const dt = el('div'); dt.append(el('strong', '', ME.dl ? 'Bugünkü ödülü aldın' : `+${LIVE.shop ? LIVE.shop.login : 20} elmas seni bekliyor`), el('span', 'dim', ME.dl ? 'Yarın tekrar gel.' : 'Her gün bir kez.'));
  dl.append(dt);
  const db = btn('btn primary', ME.dl ? 'Alındı ✓' : 'Al', async () => { db.disabled = true; await claimDaily(); dashGo('home'); });
  db.disabled = ME.dl;
  daily.append(dl, db);
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
  const rooms = card('Açık odalar', btn('btn small ghost', 'Tümü', () => dashGo('play')));
  const ul = el('ul', 'dp-rooms'); ul.append(el('li', 'empty', 'Yükleniyor…')); rooms.append(ul);
  roomsGet().then((j) => ul.replaceChildren(...H.roomItems(j.ok ? j.rooms : null, 4)));
  const st = card('İstatistiklerin');
  st.append(statList());
  row2.append(rooms, st);
  sec.append(row2);
  if (LIVE.news.on && LIVE.news.text) { const n = el('div', 'dp-news'); n.append(el('strong', '', 'Duyuru'), el('span', '', LIVE.news.text)); sec.prepend(n); }
}
function statList() {
  const ul = el('ul', 'dp-stats');
  for (const [v, l] of [[ME.best, 'en iyi dalga'], [fmt(ME.kills), 'zombi'], [ME.games, 'oyun'], [fmt(ME.mins), 'dakika']]) { const li = el('li'); li.append(el('strong', '', String(v)), el('span', '', l)); ul.append(li); }
  return ul;
}
async function claimDaily() {
  const j = await acctOp('daily');
  if (j.ok) { ME.dl = true; ME.gd += 0; H.toast(`+${j.n} elmas! Yarın yine gel.`, 'gem'); gemBurst(); }
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
  const a1 = btn('dp-act primary', ''); a1.append(el('strong', '', 'Oda kur'), el('span', '', 'Açık ya da gizli bir oda kur, takımını topla.')); a1.onclick = () => H.roomDlg();
  const a2 = el('div', 'dp-act'); a2.append(el('strong', '', 'Koda katıl'));
  const jr = el('div', 'join-row'); const inp = el('input', 'code-input'); inp.maxLength = 6; inp.placeholder = 'ODA KODU'; inp.autocomplete = 'off'; inp.spellcheck = false;
  const jb = btn('btn', 'Katıl', () => H.join(inp.value)); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') jb.click(); });
  jr.append(inp, jb); a2.append(jr);
  const a3 = btn('dp-act', ''); a3.append(el('strong', '', 'Tek başına oyna'), el('span', '', 'Kilitli sınıfları da deneyebilirsin (elmas kazandırmaz).')); a3.onclick = () => H.solo();
  acts.append(a1, a2, a3);
  sec.append(acts);
  const fc = card('Oyundaki arkadaşların');
  const fl = el('ul', 'dp-rooms'); fl.id = 'play-fr'; fl.append(el('li', 'empty', 'Yükleniyor…')); fc.append(fl);
  sec.append(fc);
  friendsGet().then((d) => { if (d) onFriends(d); });
  const rc = card('Açık odalar', btn('btn small ghost', 'Yenile', () => load()));
  const ul = el('ul', 'dp-rooms'); rc.append(el('p', 'note', 'Hesabı olan oyuncuların açık kurduğu odalar.'), ul);
  sec.append(rc);
  const load = () => roomsGet().then((j) => ul.replaceChildren(...H.roomItems(j.ok ? j.rooms : null, 50)));
  ul.append(el('li', 'empty', 'Yükleniyor…')); load();
}

// ---------- profile and wardrobe ----------
function profileView(p, mine) {
  const wrap = el('div', 'prof');
  const ban = el('div', 'prof-banner'); ban.dataset.theme = ((p.eq && p.eq.thm) || 't.gece').slice(2);
  const av = avatar(p.eq, 120, mine ? heroCls() : 'asker');
  const info = el('div', 'prof-info');
  const nm = el('div', 'prof-name'); nm.append(nameEl(p.name, p.eq, 'h2', 'nm dp-h'), lvlBadge(p.lvl));
  info.append(nm);
  const t = titleOf(p.eq); if (t) info.append(el('p', 'prof-title', t));
  const meta = el('p', 'dim');
  meta.textContent = `${p.made ? 'Katıldı: ' + new Date(p.made).toLocaleDateString('tr', { year: 'numeric', month: 'long' }) : ''}${p.on ? ' · Çevrimiçi' : ''}`;
  info.append(meta);
  ban.append(av, info);
  wrap.append(ban);
  const st = el('ul', 'dp-stats big');
  for (const [v, l] of [[p.lvl, 'seviye'], [p.best, 'en iyi dalga'], [fmt(p.kills), 'zombi'], [p.games, 'oyun'], [fmt(p.mins), 'dakika'], [p.ncls != null ? p.ncls : '', 'sınıf']]) { const li = el('li'); li.append(el('strong', '', String(v)), el('span', '', l)); st.append(li); }
  wrap.append(st);
  return wrap;
}
function profilePage(sec) {
  const pa = el('div', 'prof-head-acts');
  pa.append(btn('btn ghost phone-only', 'Sıralama', () => dashGo('top')), btn('btn ghost phone-only', 'Ayarlar', () => dashGo('account')), btn('btn primary', 'Dolabı aç', () => dashGo('locker')));
  head(sec, 'Profil', 'Profilim', pa);
  const p = { name: ACCT.name, eq: ME.eq, lvl: ME.lvl, best: ME.best, kills: ME.kills, games: ME.games, mins: ME.mins, made: ME.made, on: true, ncls: CLASS_ORDER.filter((c) => FREE_CLS.includes(c) || ME.own.includes('c.' + c)).length };
  sec.append(profileView(p, true));
  const qa = card('Görevler ve başarımlar', btn('btn small ghost', 'Aç', () => dashGo('quests'))); qa.append(el('p', 'note', 'Günlük görevler, seviye yolu ödülleri ve başarımlar.')); sec.append(qa);
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
    grid.append(b);
  }
  cc.append(grid);
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
  const spin = { a: -0.5 };
  const draw = () => { drawAvatar(cv, ME.eq, { size: 220, cls: lockCls, angle: spin.a }); };
  draw();
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); spin.a = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2); draw(); });
  const right = el('div', 'locker-items');
  const tabs = el('div', 'seg-tabs');
  for (const s of SLOTS) { const b = btn('', s.name, () => { lockSlot = s.k; dashGo('locker'); }); b.setAttribute('aria-selected', String(s.k === lockSlot)); tabs.append(b); }
  right.append(tabs);
  const slot = SLOTS.find((s) => s.k === lockSlot);
  const grid = el('div', 'item-grid small');
  const cur = ME.eq[slot.k] || '';
  const none = el('button', 'item-card' + (!cur ? ' on' : '')); none.type = 'button';
  none.append(el('div', 'ic-prev none', '∅'), el('span', 'ic-name', slot.none));
  none.onclick = () => equip(slot.k, '');
  grid.append(none);
  const ids = Object.keys(ITEMS).filter((id) => id.startsWith(slot.p + '.') && (owns(id) || isFree(id)));
  for (const id of ids) {
    const b = itemCard(id, false, { equip: true });
    b.classList.toggle('on', cur === id);
    b.onclick = () => equip(slot.k, id);
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
const SHOP_TABS = [['c', 'Sınıflar'], ['h', 'Şapkalar'], ['r', 'Renkler'], ['w', 'Silah'], ['f', 'Çerçeve'], ['n', 'İsim rengi'], ['u', 'Unvan'], ['t', 'Tema']];
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
  sec.append(tabs);
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
  else if (kind === 'h' || kind === 'r' || kind === 'w') { const cv = el('canvas'); const eq = Object.assign({}, ME.eq, { [SLOT_OF[kind].k]: id }); drawAvatar(cv, eq, { size: big ? 110 : 84, cls: kind === 'w' ? heroCls() : 'asker', angle: kind === 'w' ? -0.25 : -0.55 }); pv.append(cv); }
  else if (kind === 'f') { const cv = el('canvas'); drawAvatar(cv, Object.assign({}, ME.eq, { frm: id }), { size: big ? 110 : 84 }); pv.append(cv); }
  else if (kind === 'n') { const n = nameEl(ACCT.name, { nc: id }, 'span', 'nm big'); pv.append(n); }
  else if (kind === 'u') { pv.append(el('span', 'ttl-prev', it.name)); }
  else if (kind === 't') { const sw = el('div', 'theme-sw'); sw.dataset.theme = id.slice(2); pv.append(sw); }
  b.append(pv);
  b.append(el('span', 'ic-r', RARITY[it.r] || ''), el('span', 'ic-name', it.name));
  if (kind === 'c' && CLASSES[it.cls]) b.append(el('span', 'ic-desc', `${CLASSES[it.cls].ab.name} · ${CLASSES[it.cls].pas.name}`));
  if (o.equip) return b;
  const pr = el('span', 'ic-price');
  if (have) pr.append(el('b', 'own', 'Sahipsin'));
  else if (it.soon) pr.append(el('b', 'soon', 'Yakında'));
  else if (!LIVE.shop) pr.append(el('b', 'soon', '…'));
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
      acts.append(go, btn('btn ghost', 'Vazgeç', () => { dlg.hidden = true; }));
    }
    info.append(acts);
    box.append(info);
  };
  dlg.querySelector('.card').classList.remove('bought');
  dlg.hidden = false;
  draw('ask');
}

// ---------- friends and private messages ----------
let FR = { L: [], q: [], un: {} }, frTab = 'list';
function friendsPage(sec, arg) {
  if (arg === 'add') frTab = 'add';
  head(sec, 'Arkadaşlar', 'Arkadaşların');
  const tabs = el('div', 'seg-tabs');
  for (const [k, n] of [['list', `Arkadaşlar (${FR.L.length})`], ['req', `İstekler${FR.q.length ? ' (' + FR.q.length + ')' : ''}`], ['add', 'Arkadaş ekle']]) {
    const b = btn('', n, () => { frTab = k; dashGo('friends'); }); b.setAttribute('aria-selected', String(k === frTab)); tabs.append(b);
  }
  sec.append(tabs);
  const box = el('div', 'fr-box'); box.id = 'fr-box'; sec.append(box);
  drawFriends();
  friendsGet().then((d) => { if (d) onFriends(d); });
}
function drawFriends() {
  const box = $('#fr-box'); if (!box) return;
  box.replaceChildren();
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
export function onFriends(d) {
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
  dlg.hidden = false; body.replaceChildren(el('p', 'note', 'Yükleniyor…'));
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
  const dlg = $('#rep-dlg'); dlg.hidden = false;
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
function untilMidnight() { const t = new Date(Date.now() + 3 * 36e5); const m = (24 * 60) - (t.getUTCHours() * 60 + t.getUTCMinutes()); return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`; }
let QD = null;
async function loadQuests() { const j = await acctOp('quests'); if (j.ok) { QD = j; ME.qn = j.q.filter((q) => q.p >= q.n && !q.c).length + j.ach.filter((a) => a.done && !a.claimed).length; topBar(); } return j.ok ? j : null; }
function questRow(q, i, compact) {
  const done = q.p >= q.n, row = el('div', 'q-row' + (q.c ? ' claimed' : done ? ' done' : ''));
  row.append(el('span', 'q-ic', QIC[q.t] || '•'));
  const mid = el('div', 'q-mid'); mid.append(el('strong', '', questText(q)));
  const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * Math.min(1, q.p / q.n)) + '%'; bar.append(f);
  mid.append(bar, el('span', 'dim', `${fmt(q.p)} / ${fmt(q.n)}`));
  row.append(mid);
  if (q.c) row.append(el('span', 'q-ok', 'Alındı ✓'));
  else if (done) row.append(btn('btn primary small', `+${q.g}`, async (e) => { e.target.disabled = true; const j = await acctOp('qclaim', { i }); if (j.ok) { H.toast(`Görev tamam! +${j.g} elmas, +100 XP`, 'gem'); gemBurst(); ME.xp = j.xp || ME.xp; await loadQuests(); dashGo(page); } else H.toast('Alınamadı.', 'bad'); }));
  else { const r = el('span', 'q-rew'); r.append(gemAmt(q.g)); if (!compact) r.append(el('span', 'dim', '+100 XP')); row.append(r); }
  return row;
}
function questsPage(sec) {
  head(sec, 'Görevler', 'Görevler ve başarımlar', el('span', 'dim', `Yeni görevlere ${untilMidnight()}`));
  const qc = card('Günlük görevler'); qc.append(el('p', 'note', 'Her gün üç yeni görev. Dalgaları temizledikçe ilerler.'));
  const qbox = el('div', 'q-list'); qbox.append(el('p', 'note', 'Yükleniyor…')); qc.append(qbox); sec.append(qc);
  const rc = card('Seviye yolu'); const road = el('div', 'road'); rc.append(el('p', 'note', 'Her seviye elmas verir; bazı seviyeler satılmayan özel ödüller açar.'), road); sec.append(rc);
  const ac = card('Başarımlar'); const abox = el('div', 'ach-grid'); ac.append(abox); sec.append(ac);
  loadQuests().then((j) => {
    if (!j) { qbox.replaceChildren(el('p', 'msg', 'Görevler yüklenemedi.')); return; }
    qbox.replaceChildren(...j.q.map((q, i) => questRow(q, i)));
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

// ---------- leaderboard ----------
let topTab = 'xp';
function topPage(sec) {
  head(sec, 'Sıralama', 'En iyiler');
  const tabs = el('div', 'seg-tabs');
  for (const [k, n] of [['xp', 'Seviye'], ['best', 'En iyi dalga'], ['kills', 'En çok öldürme']]) { const b = btn('', n, () => { topTab = k; dashGo('top'); }); b.setAttribute('aria-selected', String(k === topTab)); tabs.append(b); }
  sec.append(tabs);
  const ol = el('ol', 'top-rows'); ol.append(el('li', 'empty', 'Yükleniyor…'));
  sec.append(ol);
  topGet().then((j) => {
    if (!j.ok) { ol.replaceChildren(el('li', 'empty', 'Sıralama yüklenemedi.')); return; }
    const L = (j.top[topTab] || []);
    if (!L.length) { ol.replaceChildren(el('li', 'empty', 'Henüz kimse yok. Bir oyun bitir, ilk sen ol!')); return; }
    ol.replaceChildren(...L.map((r, i) => {
      const li = el('li', i < 3 ? 'podium p' + (i + 1) : '');
      const b = btn('top-row', '', () => openProfile({ name: r.name }));
      b.append(el('span', 'rk', String(i + 1)), avatar(r.eq || {}, 36), nameEl(r.name, r.eq || {}), lvlBadge(r.lvl || 1),
        el('span', 'tv', topTab === 'xp' ? `Seviye ${r.lvl || 1}` : topTab === 'best' ? `${r.best}. dalga` : `${fmt(r.kills)} zombi`));
      li.append(b); return li;
    }));
  });
}

// ---------- account settings ----------
function accountPage(sec) {
  head(sec, 'Ayarlar', 'Hesap ve görünüm');
  const th = card('Tema');
  const tg = el('div', 'theme-grid');
  for (const id of Object.keys(THEMES)) {
    const have = owns(id) || isFree(id);
    const b = btn('theme-pick' + ((ME.eq.thm || 't.gece') === id ? ' on' : '') + (have ? '' : ' locked'), '');
    const sw = el('div', 'theme-sw'); sw.dataset.theme = id.slice(2);
    b.append(sw, el('span', '', ITEMS[id].name));
    if (!have) b.append(gemAmt(priceOf(id) || 0));
    b.onclick = () => (have ? equip('thm', id === 't.gece' ? '' : id) : buyDlg(id, priceOf(id)));
    tg.append(b);
  }
  th.append(tg);
  sec.append(th);

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
    const j = await acctOp('ren', { name: v.name });
    if (j.ok) { H.toast('Adın değişti.', 'good'); H.refresh(); return ''; }
    return { name: 'Ad en az 3 harf olmalı.', taken: 'Bu ad alınmış.', gems: 'Elmasın yetmiyor.', slow: 'Bugün yeterince denedin.' }[j.reason] || 'Değiştirilemedi.';
  }))));
  ac.append(row('Şifreni değiştir', 'Diğer cihazlardaki oturumlar kapanır.', btn('btn small', 'Değiştir', () => formDlg('Şifreni değiştir', [['old', 'Şu anki şifre', 'password'], ['pw', 'Yeni şifre (en az 6)', 'password']], '', 'Değiştir', async (v) => {
    const j = await acctOp('pw', v);
    if (j.ok) { H.toast('Şifren değişti.', 'good'); return ''; }
    return { wrong: 'Şu anki şifre yanlış.', pw: 'Yeni şifre en az 6 karakter olmalı.', slow: 'Çok fazla deneme. Sonra tekrar dene.' }[j.reason] || 'Değiştirilemedi.';
  }))));
  if (/Android/i.test(navigator.userAgent) && !/KusatmaApp\//.test(navigator.userAgent)) { const a = el('a', 'btn small', 'İndir'); a.href = 'app/kusatma.apk'; a.download = ''; ac.append(row('Android uygulaması', 'Kuşatma\'yı telefonuna uygulama olarak kur. Güncellemeler kendiliğinden gelir.', a)); }
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
  const dlg = $('#form-dlg'); dlg.hidden = false;
  $('#form-title').textContent = title; $('#form-note').textContent = note; $('#form-go').textContent = go;
  const box = $('#form-fields'), msg = $('#form-msg'); msg.hidden = true;
  box.replaceChildren(...fields.map(([k, label, type]) => { const l = el('label', 'field'); const i = el('input'); i.type = type; i.name = k; i.maxLength = type === 'password' ? 64 : 16; i.autocomplete = type === 'password' ? 'current-password' : 'off'; l.append(el('span', '', label), i); return l; }));
  box.querySelector('input').focus();
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
}
let shown = false;
export function dashShow(on) {
  if (!on) { shown = false; return; }
  applyTheme();
  topBar();
  if (!shown) { shown = true; let p = 'home'; try { p = localStorage.getItem('kusatma-dp') || 'home'; } catch (e) { /* ignore */ } dashGo(PAGES[p] ? p : 'home'); }
}
export function dashRefresh() { if (!ACCT || $('#dashpage').hidden) return; applyTheme(); topBar(); if (page !== 'locker') dashGo(page); }
export function dashTop() { if (ACCT) topBar(); }
export const dashPage = () => page;
export { openProfile, acctCheck };
