// Screens, lobby, HUD and the glue between networking, the host simulation and the local game.
import { VERSION, MAX_PLAYERS, CLASSES, CLASS_ORDER, UPGRADES, HEAL_COST, upgradeCost, CODE_LEN, ZOOM_MIN, ZOOM_MAX, clamp } from './config.js';
import { HostNet, OfflineNet, ClientNet, cleanCode } from './net.js';
import { HostGame, cleanName } from './host.js';
import { ClientGame } from './client.js';
import { Renderer, drawCharacter } from './render.js';
import * as sfx from './sfx.js';

let zoom = 1;
try { const z = parseFloat(localStorage.getItem('kusatma-zoom')); if (z) zoom = clamp(z, ZOOM_MIN, ZOOM_MAX); } catch (e) { /* ignore */ }

const $ = (s) => document.querySelector(s);
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
window.addEventListener('resize', () => renderer.resize());

// ---------- helpers ----------
function show(screen) {
  S.screen = screen;
  for (const id of ['menu', 'lobby', 'over']) $('#' + id).hidden = id !== screen;
  $('#hud').hidden = screen !== 'game';
  document.body.classList.toggle('playing', screen === 'game');
  if (screen !== 'game') { $('#board').hidden = true; if (S.game) { S.game.input.down = false; S.game.input.keys.clear(); } }
}

function toast(text, kind = '') {
  const t = el('div', 'toast ' + kind, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3300);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

function menuMsg(text, info = false) {
  const m = $('#menu-msg');
  m.hidden = !text;
  m.textContent = text || '';
  m.classList.toggle('info', info);
}

function busy(on) {
  for (const id of ['#btn-create', '#btn-join', '#btn-solo']) $(id).disabled = on;
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

function getName() {
  const n = cleanName($('#name').value, '');
  try { localStorage.setItem('kusatma-ad', $('#name').value.trim()); } catch (e) { /* ignore */ }
  return n === 'Oyuncu ' ? '' : n;
}

function send(msg) {
  if (S.role === 'host') S.host.onMsg(1, msg);
  else if (S.net) S.net.send(msg);
}

// A worker-driven timer keeps the host simulation running even when its tab is in the background.
function startTicker() {
  stopTicker();
  const src = 'setInterval(() => postMessage(0), 33);';
  try {
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    let maint = 0;
    w.onmessage = () => {
      if (S.host) S.host.step();
      if (++maint >= 60) { maint = 0; if (S.net) S.net.maintain(); }
    };
    S.ticker = { stop: () => w.terminate() };
  } catch (e) {
    let maint = 0;
    const id = setInterval(() => { if (S.host) S.host.step(); if (++maint >= 60) { maint = 0; if (S.net) S.net.maintain(); } }, 33);
    S.ticker = { stop: () => clearInterval(id) };
  }
}
function stopTicker() { if (S.ticker) S.ticker.stop(); S.ticker = null; }

// ---------- starting and leaving ----------
async function createRoom(offline) {
  const name = getName();
  menuMsg(offline ? '' : 'Oda kuruluyor…', true);
  busy(true);
  const net = offline ? new OfflineNet() : new HostNet();
  try {
    if (!offline) await net.open();
  } catch (e) {
    busy(false);
    menuMsg(e && e.message === 'peerjs-missing'
      ? 'Bağlantı kütüphanesi yüklenemedi. Sayfayı yenile.'
      : 'Bağlantı sunucusuna ulaşılamadı. İnternetini kontrol edip tekrar dene.');
    net.destroy();
    return;
  }
  busy(false);
  menuMsg('');
  S.role = 'host';
  S.net = net;
  S.host = new HostGame(net);
  S.me = 1;
  S.game = new ClientGame(send, 1);
  S.host.local = onMessage;
  net.onMsg = (pid, m) => S.host.onMsg(pid, m);
  net.onLeave = (pid) => S.host.removePlayer(pid);
  S.host.addPlayer(1, name || 'Kurucu');
  startTicker();
}

async function joinRoom() {
  const code = cleanCode($('#code').value);
  if (code.length !== CODE_LEN) { menuMsg('Oda kodu 6 karakter olmalı.'); $('#code').focus(); return; }
  const name = getName();
  menuMsg('Odaya bağlanılıyor…', true);
  busy(true);
  const net = new ClientNet();
  try {
    await net.connect(code);
  } catch (e) {
    busy(false);
    const r = e && e.message;
    menuMsg(r === 'peer-unavailable' ? 'Bu kodla bir oda bulunamadı. Kodu kontrol et.'
      : r === 'peerjs-missing' ? 'Bağlantı kütüphanesi yüklenemedi. Sayfayı yenile.'
      : r === 'timeout' ? 'Odaya bağlanılamadı. Kodu kontrol et ya da tekrar dene.'
      : 'Odaya bağlanılamadı. İnternetini kontrol edip tekrar dene.');
    return;
  }
  busy(false);
  menuMsg('');
  S.role = 'client';
  S.net = net;
  net.onMsg = onMessage;
  net.onClose = () => leave('Kurucuyla bağlantı koptu. Oda kapanmış olabilir.');
  net.send({ t: 'hello', v: VERSION, name });
  startTicker();
}

function leave(reason) {
  stopTicker();
  cancelAnimationFrame(S.raf);
  S.raf = 0;
  if (S.net) { const n = S.net; S.net = null; n.onClose = null; n.onMsg = null; n.destroy(); }
  S.host = null; S.game = null; S.role = null; S.me = null; S.roster = null; S.over = null; S.shopBuilt = false;
  renderer.clearDecals();
  show('menu');
  menuMsg(reason || '');
}

window.addEventListener('beforeunload', () => { if (S.net) S.net.destroy(); });

// ---------- incoming messages ----------
const BYE = {
  kick: 'Kurucu seni odadan çıkardı.',
  spam: 'Çok fazla mesaj gönderdiğin için odadan çıkarıldın.',
  full: 'Oda dolu (15/15).',
  version: 'Oyunun farklı bir sürümü açık. Sayfayı yenileyip tekrar dene.',
};

function onMessage(m) {
  if (!S.role || !m || typeof m !== 'object') return;
  switch (m.t) {
    case 'w':
      S.me = m.pid;
      if (!S.game) S.game = new ClientGame(send, m.pid);
      break;
    case 'r': onRoster(m); break;
    case 's': if (S.game) S.game.onSnap(m); break;
    case 'o': S.over = m; renderOver(); if (S.roster) route(); break;
    case 'bye': leave(BYE[m.r] || 'Odadan çıkarıldın.'); break;
    default: break;
  }
}

function onRoster(m) {
  const prevPhase = S.roster ? S.roster.ph : null;
  S.roster = m;
  if (S.game) S.game.onRoster(m);
  if (m.ph === 'lobby' && prevPhase && prevPhase !== 'lobby') { renderer.clearDecals(); S.over = null; }
  if ((m.ph === 'break' || m.ph === 'combat') && prevPhase === 'lobby') { renderer.clearDecals(); if (S.game) S.game.reset(); }
  route();
  renderLobby();
}

function myEntry() { return S.roster ? S.roster.players.find((p) => p.pid === S.me) : null; }

function route() {
  const r = S.roster;
  if (!r) return;
  const me = myEntry();
  if (r.ph === 'over' && S.over && me && me.inGame) { show('over'); return; }
  if ((r.ph === 'combat' || r.ph === 'break') && me && me.inGame) {
    if (S.screen !== 'game') { show('game'); startLoop(); }
    return;
  }
  show('lobby');
}

// ---------- lobby ----------
function renderLobby() {
  const r = S.roster;
  if (!r) return;
  const me = myEntry();
  const isHost = S.me === r.host;
  const running = r.ph === 'combat' || r.ph === 'break';

  $('#room-code').textContent = r.code || 'Çevrimdışı';
  $('#btn-copy').hidden = !r.code;
  $('#code-box').classList.toggle('offline', !r.code);
  $('#lobby-eyebrow').textContent = r.code ? 'Lobi' : 'Tek kişilik oyun';
  $('#lobby-title').textContent = running ? 'Oyun sürüyor' : r.ph === 'over' ? 'Oyun bitti' : 'Takımını topla';
  $('#player-count').textContent = `${r.players.length}/${MAX_PLAYERS}`;

  const list = $('#player-list');
  list.replaceChildren();
  for (const p of r.players) {
    const li = el('li', 'player' + (p.pid === S.me ? ' me' : ''));
    const dot = el('span', 'dot'); dot.style.background = p.color;
    const nm = el('div', 'p-name');
    nm.append(el('b', '', p.name + (p.pid === S.me ? ' (sen)' : '')), el('small', '', CLASSES[p.cls].name));
    let chip;
    if (p.pid === r.host) chip = el('span', 'chip host', 'Kurucu');
    else if (running || r.ph === 'over') chip = el('span', 'chip' + (p.inGame ? ' ok' : ''), p.inGame ? 'Oyunda' : 'Bekliyor');
    else chip = el('span', 'chip' + (p.ready ? ' ok' : ''), p.ready ? 'Hazır' : 'Bekliyor');
    li.append(dot, nm, chip);
    if (isHost && p.pid !== S.me) {
      const k = el('button', 'btn ghost small kick', 'At');
      k.type = 'button';
      k.setAttribute('aria-label', p.name + ' adlı oyuncuyu odadan at');
      k.addEventListener('click', () => kickPlayer(p));
      li.append(k);
    } else li.append(el('span'));
    list.append(li);
  }
  if (r.code && r.players.length < 3) {
    list.append(el('li', 'empty-slot', 'Arkadaşlarına oda kodunu gönder, buraya katılsınlar.'));
  }

  const cl = $('#class-list');
  if (!cl.childElementCount) buildClassCards();
  if (me && cl.dataset.color !== me.color) { cl.dataset.color = me.color; drawPreviews(me.color); }
  for (const card of cl.children) {
    const on = me && card.dataset.cls === me.cls;
    card.setAttribute('aria-checked', on ? 'true' : 'false');
    card.tabIndex = on ? 0 : -1;
    card.disabled = !!(me && me.inGame);
  }

  const btn = $('#btn-ready');
  const note = $('#lobby-note');
  const others = r.players.filter((p) => p.pid !== r.host);
  if (running) {
    btn.textContent = 'Oyuna katıl';
    btn.disabled = false;
    btn.classList.remove('on');
    note.textContent = 'Oyun devam ediyor. Sınıfını seç ve hemen katıl.';
  } else if (r.ph === 'over') {
    btn.textContent = isHost ? 'Lobiye dön' : 'Kurucu bekleniyor';
    btn.disabled = !isHost;
    note.textContent = 'Önceki oyun bitti.';
  } else if (isHost) {
    const ready = others.filter((p) => p.ready).length;
    btn.textContent = 'Oyunu başlat';
    btn.disabled = false;
    btn.classList.remove('on');
    note.textContent = !r.code ? 'Hazır olduğunda başlat. Dalgalar arasında yükseltme alabilirsin.'
      : others.length ? `${ready}/${others.length} oyuncu hazır. Herkes hazır olmasa da başlatabilirsin.`
      : 'Henüz kimse katılmadı. Kodu paylaş ya da tek başına başlat.';
  } else {
    btn.textContent = me && me.ready ? 'Hazırım ✓' : 'Hazırım';
    btn.classList.toggle('on', !!(me && me.ready));
    btn.disabled = false;
    note.textContent = 'Kurucu oyunu başlattığında savaş başlar.';
  }
}

function buildClassCards() {
  const cl = $('#class-list');
  for (const id of CLASS_ORDER) {
    const c = CLASSES[id];
    const b = el('button', 'class-card');
    b.type = 'button';
    b.dataset.cls = id;
    b.setAttribute('role', 'radio');
    const top = el('div', 'class-top');
    const pv = el('canvas', 'class-preview');
    pv.width = 128; pv.height = 128;
    pv.setAttribute('aria-hidden', 'true');
    const title = el('div', 'class-title');
    title.append(el('span', 'class-name', c.name), el('span', 'class-weapon', c.weapon));
    top.append(pv, title);
    const bars = el('div', 'bars');
    for (const [label, v] of [['Can', c.bars.can], ['Hız', c.bars.hiz], ['Hasar', c.bars.hasar]]) {
      const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(v * 100) + '%'; bar.append(i);
      bars.append(el('span', '', label), bar);
    }
    const ab = el('div', 'ability');
    ab.append(el('b', '', c.ab.name + ': '), document.createTextNode(c.ab.desc));
    b.append(top, el('p', 'class-desc', c.desc), bars, ab);
    b.addEventListener('click', () => send({ t: 'cls', c: id }));
    b.addEventListener('keydown', (e) => {
      const i = CLASS_ORDER.indexOf(id);
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = CLASS_ORDER[(i + 1) % CLASS_ORDER.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = CLASS_ORDER[(i + CLASS_ORDER.length - 1) % CLASS_ORDER.length];
      if (n) { e.preventDefault(); send({ t: 'cls', c: n }); cl.querySelector(`[data-cls="${n}"]`).focus(); }
    });
    cl.append(b);
  }
}

function drawPreviews(color) {
  for (const card of $('#class-list').children) {
    const cv = card.querySelector('canvas');
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.translate(50, 72);
    g.scale(2.05, 2.05);
    drawCharacter(g, card.dataset.cls, color || '#ff8a3d', -0.6, 0, { alive: true });
  }
}

function kickPlayer(p) {
  ask('Oyuncuyu at', `${p.name} odadan çıkarılsın mı?`, 'Odadan at', () => send({ t: 'kick', pid: p.pid }));
}

$('#btn-ready').addEventListener('click', () => {
  const r = S.roster; if (!r) return;
  const me = myEntry();
  if (r.ph === 'combat' || r.ph === 'break') send({ t: 'ready', r: true });
  else if (r.ph === 'over') { if (S.me === r.host) send({ t: 'lobby' }); }
  else if (S.me === r.host) send({ t: 'start' });
  else send({ t: 'ready', r: !(me && me.ready) });
});

$('#btn-leave').addEventListener('click', () => {
  if (S.role === 'host' && S.roster && S.roster.players.length > 1) {
    ask('Odayı kapat', 'Kurucu sensin. Ayrılırsan oda herkes için kapanır.', 'Odayı kapat', () => leave(''));
  } else leave('');
});

$('#btn-copy').addEventListener('click', async () => {
  const code = S.roster && S.roster.code;
  if (!code) return;
  try { await navigator.clipboard.writeText(code); $('#btn-copy').textContent = 'Kopyalandı'; }
  catch (e) {
    const range = document.createRange(); range.selectNodeContents($('#room-code'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    $('#btn-copy').textContent = 'Seçildi, kopyala';
  }
  setTimeout(() => { $('#btn-copy').textContent = 'Kodu kopyala'; }, 1800);
});

// ---------- game over ----------
function renderOver() {
  const o = S.over;
  if (!o) return;
  $('#over-sub').textContent = `${o.wave}. dalgaya kadar dayandınız.`;
  const body = $('#over-body');
  body.replaceChildren();
  o.P.forEach((p, i) => {
    const tr = el('tr');
    const who = el('div', 'who'); const dot = el('span', 'dot'); dot.style.background = p.color;
    who.append(dot, el('span', '', p.name + (p.pid === S.me ? ' (sen)' : '')));
    const tdWho = el('td'); tdWho.append(who);
    tr.append(el('td', '', String(i + 1)), tdWho, el('td', '', CLASSES[p.cls].name), el('td', 'num', fmt(p.kills)), el('td', 'num', fmt(p.dmg)));
    body.append(tr);
  });
  const isHost = S.role === 'host';
  $('#btn-over-lobby').hidden = !isHost;
  $('#over-note').textContent = isHost ? 'Lobiye dönünce herkes yeni oyun için sınıf seçebilir.' : 'Kurucu lobiye döndüğünde yeni oyun için hazırlanabilirsin.';
}
$('#btn-over-lobby').addEventListener('click', () => send({ t: 'lobby' }));
$('#btn-over-leave').addEventListener('click', () => $('#btn-leave').click());

// ---------- game loop + HUD ----------
function startLoop() {
  if (S.raf) return;
  let last = performance.now();
  const frame = (now) => {
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const g = S.game;
    if (!g || S.screen !== 'game') return;
    g.zoom = zoom;
    g.update(dt);
    renderer.draw(g, g.roster);
    S.hudT -= dt;
    if (S.hudT <= 0) { S.hudT = 0.1; updateHud(); }
    for (const n of g.notices.splice(0)) notice(n);
  };
  S.raf = requestAnimationFrame(frame);
}

function notice(n) {
  const g = S.game;
  if (n.k === 'wave') banner(n.w % 5 === 0 ? 'Dev geliyor' : 'Sürü yaklaşıyor', `Dalga ${n.w}`, n.w % 5 === 0 ? 'Bu dalgada bir Dev var. Birlikte vurun.' : 'Sırt sırta verin.');
  else if (n.k === 'clear') banner('Dalga temizlendi', 'Mola', `Herkese +${n.bonus} altın. Cephanelikten yükseltme al.`);
  else if (n.k === 'down') toast(n.pid === S.me ? 'Düştün!' : `${g.nameOf(n.pid)} düştü!`, 'bad');
  else if (n.k === 'up') toast(`${g.nameOf(n.pid)} ayağa kalktı.`, 'good');
  else if (n.k === 'revived') toast('Ayağa kalktın!', 'good');
}

let bannerTimer = 0;
function banner(eyebrow, title, sub) {
  const b = $('#banner');
  $('#banner-eyebrow').textContent = eyebrow;
  $('#banner-title').textContent = title;
  $('#banner-sub').textContent = sub;
  b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 2700);
}

function updateHud() {
  const g = S.game;
  if (!g) return;
  const me = g.self;
  const c = CLASSES[g.cls];
  const st = g.myStats;

  if (g.phase === 'combat') {
    $('#hud-phase').textContent = 'Dalga';
    $('#hud-wave').textContent = String(g.wave);
    $('#hud-sub').textContent = `Kalan zombi: ${fmt(g.zLeft)}`;
  } else {
    $('#hud-phase').textContent = g.wave === 0 ? 'Hazırlan' : 'Mola';
    $('#hud-wave').textContent = String(g.wave + 1);
    $('#hud-sub').textContent = `Dalga ${g.wave + 1} başlıyor: ${g.breakT} sn`;
  }

  // team
  const team = $('#hud-team');
  const rows = [...g.ps.entries()];
  if (team.childElementCount !== rows.length) team.replaceChildren(...rows.map(() => { const li = el('li'); li.append(el('i', 'dot'), el('span'), el('div', 'mini-hp')); li.lastChild.append(el('i')); return li; }));
  rows.forEach(([pid, p], i) => {
    const li = team.children[i];
    const info = g.roster.get(pid);
    li.className = p.alive ? '' : 'down';
    li.children[0].style.background = info ? info.color : '#888';
    li.children[1].textContent = (info ? info.name : '?') + (pid === S.me ? ' (sen)' : '');
    li.children[2].firstChild.style.width = (p.maxHp ? Math.max(0, p.hp / p.maxHp) * 100 : 0) + '%';
  });

  // health, ability, gold
  $('#hud-class').textContent = c.name;
  $('#hud-hp-text').textContent = `${fmt(Math.max(0, me.hp))} / ${fmt(me.maxHp)}`;
  const hpk = me.maxHp ? Math.max(0, me.hp / me.maxHp) : 0;
  $('#hud-hp-fill').style.width = hpk * 100 + '%';
  $('#hud-hp-fill').classList.toggle('low', hpk < 0.3);
  const cd = c.ab.cd * st.cd;
  const left = me.abLeft;
  $('#hud-ab-name').textContent = c.ab.name;
  $('#hud-ab-cd').textContent = left > 0 ? `${Math.ceil(left)} sn` : 'Hazır';
  $('#hud-ab-fill').style.height = (left > 0 ? (1 - left / cd) * 100 : 100) + '%';
  $('#hud-ab').classList.toggle('ready', left <= 0);
  $('#hud-ab').title = c.ab.desc;
  const act = g.fx.get(S.me);
  if (act && g.time < act.until) { $('#hud-ab-cd').textContent = `Aktif: ${Math.ceil(act.until - g.time)} sn`; $('#hud-ab').classList.add('active'); }
  else $('#hud-ab').classList.remove('active');
  $('#hud-gold').textContent = fmt(me.gold);
  $('#hud-kills').textContent = fmt(me.kills);

  // downed
  $('#dead').hidden = me.alive || !me.inGame;
  if (!me.alive) {
    const w = g.spectate != null ? g.nameOf(g.spectate) : null;
    $('#dead-watch').textContent = w ? `${w} izleniyor` : '';
  }

  updateShop();
  if (!$('#board').hidden) renderBoard();
}

// ---------- shop ----------
function buildShop() {
  const list = $('#shop-list');
  list.replaceChildren();
  const items = [...UPGRADES.map((u) => ({ k: u.k, name: u.name, desc: u.desc, u })), { k: 'heal', name: 'Sargı', desc: 'Canını tamamen doldurur' }];
  items.forEach((it, i) => {
    const li = el('li');
    const b = el('button', 'shop-item');
    b.type = 'button';
    b.dataset.k = it.k;
    const cost = el('span', 'cost'); cost.append(el('span', 'coin'), el('span', 'cv'));
    b.append(el('span', 'hk', String(i + 1)), el('span', 'nm', it.name), cost, el('span', 'ds', it.desc));
    if (it.u) { const pips = el('span', 'pips'); for (let j = 0; j < it.u.max; j++) pips.append(el('i')); b.append(pips); }
    b.addEventListener('click', () => buy(it.k));
    li.append(b);
    list.append(li);
  });
  S.shopBuilt = true;
}

function buy(k) {
  const g = S.game;
  if (!g || g.phase !== 'break' || !g.self.alive) return;
  send({ t: 'buy', k });
  sfx.buy();
}

function updateShop() {
  const g = S.game;
  const open = g.phase === 'break' && g.self.inGame;
  $('#shop').hidden = !open;
  if (!open) return;
  if (!S.shopBuilt) buildShop();
  $('#shop-time').textContent = String(g.breakT);
  $('#shop-gold').textContent = fmt(g.self.gold);
  for (const b of $('#shop-list').querySelectorAll('.shop-item')) {
    const k = b.dataset.k;
    let cost, maxed = false, can;
    if (k === 'heal') {
      cost = HEAL_COST;
      can = g.self.alive && g.self.hp < g.self.maxHp && g.self.gold >= cost;
    } else {
      const u = UPGRADES.find((x) => x.k === k);
      const lv = g.self.lv[k];
      maxed = lv >= u.max;
      cost = maxed ? 0 : upgradeCost(u, lv);
      can = !maxed && g.self.gold >= cost && g.self.alive;
      b.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < lv));
    }
    b.querySelector('.cv').textContent = maxed ? 'Tam' : fmt(cost);
    b.classList.toggle('maxed', maxed);
    b.disabled = !can;
  }
  const players = [...g.ps.values()];
  const ready = players.filter((p) => p.ready).length;
  const rb = $('#btn-shop-ready');
  rb.textContent = g.self.shopReady ? 'Hazırsın ✓' : 'Hazırım';
  rb.classList.toggle('on', g.self.shopReady);
  $('#shop-ready-count').textContent = players.length > 1 ? `${ready}/${players.length} oyuncu hazır` : 'Hazırsan dalgayı hemen başlat.';
}
$('#btn-shop-ready').addEventListener('click', () => { if (S.game) send({ t: 'ready', r: !S.game.self.shopReady }); });

// ---------- scoreboard ----------
function renderBoard() {
  const g = S.game;
  if (!g) return;
  $('#board-wave').textContent = `Dalga ${g.wave}`;
  const body = $('#board-body');
  body.replaceChildren();
  const isHost = S.role === 'host';
  const rows = [...g.ps.entries()].sort((a, b) => b[1].kills - a[1].kills);
  for (const [pid, p] of rows) {
    const info = g.roster.get(pid);
    if (!info) continue;
    const tr = el('tr');
    const who = el('div', 'who'); const dot = el('span', 'dot'); dot.style.background = info.color;
    who.append(dot, el('span', '', info.name + (pid === S.me ? ' (sen)' : '')));
    const td = el('td'); td.append(who);
    const act = el('td');
    if (isHost && pid !== S.me) {
      const b = el('button', 'btn ghost small', 'At'); b.type = 'button';
      b.addEventListener('click', () => kickPlayer(info));
      act.append(b);
    }
    tr.append(td, el('td', '', CLASSES[info.cls].name), el('td', 'num', fmt(p.kills)), el('td', '', p.alive ? 'Ayakta' : 'Düştü'), act);
    body.append(tr);
  }
}

// ---------- input ----------
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
window.addEventListener('keydown', (e) => {
  if (S.screen !== 'game' || !S.game || !$('#confirm').hidden) return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'Tab') { $('#board').hidden = false; renderBoard(); return; }
  if (e.code === 'KeyM') { setMute(sfx.toggleMute()); return; }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') { setZoom(zoom * 1.12); return; }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') { setZoom(zoom / 1.12); return; }
  if (e.code === 'Space') { if (!e.repeat) S.game.input.ab = true; return; }
  if (/^Digit[1-6]$/.test(e.code)) {
    const i = Number(e.code.slice(5)) - 1;
    const k = i < UPGRADES.length ? UPGRADES[i].k : 'heal';
    buy(k);
    return;
  }
  S.game.input.keys.add(e.code);
});
window.addEventListener('keyup', (e) => {
  if (!S.game) return;
  if (e.code === 'Tab') { $('#board').hidden = true; return; }
  S.game.input.keys.delete(e.code);
});
window.addEventListener('blur', () => { if (S.game) { S.game.input.keys.clear(); S.game.input.down = false; } $('#board').hidden = true; });

const cv = $('#game');
cv.addEventListener('pointermove', (e) => { if (S.game) { S.game.input.mx = e.clientX; S.game.input.my = e.clientY; } });
cv.addEventListener('pointerdown', (e) => {
  if (!S.game || S.screen !== 'game') return;
  S.game.input.mx = e.clientX; S.game.input.my = e.clientY;
  if (e.button === 0) { S.game.input.down = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  if (e.button === 2) S.game.input.ab = true;
});
window.addEventListener('pointerup', (e) => { if (S.game && e.button === 0) S.game.input.down = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => {
  if (S.screen !== 'game' || (e.target.closest && e.target.closest('.shop, .board'))) return;
  e.preventDefault();
  setZoom(zoom * Math.exp(-clamp(e.deltaY, -200, 200) * 0.0015));
}, { passive: false });

function setZoom(z) {
  zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  try { localStorage.setItem('kusatma-zoom', zoom.toFixed(3)); } catch (e) { /* ignore */ }
}

function setMute(m) {
  const b = $('#btn-mute');
  b.textContent = m ? 'Ses kapalı' : 'Ses açık';
  b.setAttribute('aria-pressed', m ? 'true' : 'false');
  b.classList.toggle('off', m);
}
setMute(sfx.isMuted());
$('#btn-mute').addEventListener('click', () => { sfx.unlock(); setMute(sfx.toggleMute()); });
// browsers only allow sound after the first click or key press
window.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
window.addEventListener('keydown', () => sfx.unlock(), { capture: true });

// ---------- menu ----------
try { const saved = localStorage.getItem('kusatma-ad'); if (saved) $('#name').value = saved; } catch (e) { /* ignore */ }
$('#btn-create').addEventListener('click', () => createRoom(false));
$('#btn-solo').addEventListener('click', () => createRoom(true));
$('#btn-join').addEventListener('click', joinRoom);
$('#code').addEventListener('input', (e) => { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; });
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createRoom(false); });

// Opening a link like .../#K7X2PM fills in the room code.
const hashCode = cleanCode(location.hash.slice(1));
if (hashCode.length === CODE_LEN) { $('#code').value = hashCode; menuMsg('Takma adını yaz ve “Katıl”a bas.', true); }

if (window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
  menuMsg('Kuşatma klavye ve fare ile oynanır. En iyi deneyim için bilgisayardan aç.', true);
}

show('menu');

// For automated tests only: open the page with ?debug to expose state.
if (new URLSearchParams(location.search).has('debug')) window.__kusatma = S;
