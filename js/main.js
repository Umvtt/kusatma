// Screens, lobby, HUD and the glue between networking, the host simulation and the local game.
import { ZTYPES, WEAPON_COST, weaponOf, PATHS, pathDesc, BASH, MAPS, MAP_ORDER, DIFFS, DIFF_ORDER, BUILD, VERSION, MAX_PLAYERS, CLASSES, CLASS_ORDER, UPGRADES, HEAL_COST, upgradeCost, CODE_LEN, ZOOM_MIN, ZOOM_MAX, clamp } from './config.js';
import { HostNet, OfflineNet, ClientNet, cleanCode } from './net.js';
import { HostGame, cleanName } from './host.js';
import { ClientGame } from './client.js';
import { Renderer, drawCharacter, drawWeaponPreview } from './render.js';
import * as sfx from './sfx.js';
import { WORLD, setMap } from './world.js';
import { generateMap } from './mapgen.js';
import { SETTINGS, onSettings, setSetting, resetSettings } from './settings.js';

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
const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
document.body.classList.toggle('touch', IS_TOUCH);
try { if (IS_TOUCH && !localStorage.getItem('kusatma-zoom')) zoom = 0.85; } catch (e) { /* ignore */ }
window.addEventListener('resize', () => renderer.resize());

// ---------- helpers ----------
function show(screen) {
  S.screen = screen;
  for (const id of ['menu', 'lobby', 'over']) $('#' + id).hidden = id !== screen;
  $('#hud').hidden = screen !== 'game';
  document.body.classList.toggle('playing', screen === 'game');
  $('#touch').hidden = !(IS_TOUCH && screen === 'game');
  updateRotate();
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
  if (S.role === 'host') S.host.onMsg(S.me, msg);
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
  net.onLeave = (pid) => S.host.playerLost(pid);
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
  net.onClose = hostLost;
  S.name = name;
  net.send({ t: 'hello', v: VERSION, name });
  startTicker();
}

function leave(reason) {
  closeEsc(true);
  closeChat();
  $('#chat-log').replaceChildren();
  stopTicker();
  cancelAnimationFrame(S.raf);
  S.raf = 0;
  if (S.net) {
    const n = S.net; S.net = null; n.onClose = null; n.onMsg = null;
    // a leaving host hands the game over first, so the room lives on
    if (S.role === 'host' && S.host && n.code) { S.host.sendBackup(); setTimeout(() => n.destroy(), 400); } else n.destroy();
  }
  S.host = null; S.game = null; S.role = null; S.me = null; S.roster = null; S.over = null; S.shopBuilt = false;
  S.backup = null; S.tok = null; S.rejoining = false;
  renderer.clearDecals();
  show('menu');
  menuMsg(reason || '');
}

window.addEventListener('beforeunload', () => { if (S.role === 'host' && S.host) S.host.sendBackup(); if (S.net) S.net.destroy(); });

// ---------- host migration ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The link to the host dropped. Often the host is still there and only the connection hiccuped, so first
// try to reconnect to the same room. If the room is really gone, the next player in line takes it over
// and everyone else reconnects to them. Everyone keeps their class, gold and upgrades.
function hostLost() {
  const r = S.roster;
  if (S.role !== 'client' || !r || !r.code || S.rejoining) { leave('Kurucuyla bağlantı koptu. Oda kapanmış olabilir.'); return; }
  S.rejoining = true;
  const old = S.net; S.net = null;
  if (old) { old.onClose = null; old.onMsg = null; old.destroy(); }
  reconnect(r.code, r.succ === S.me && !!S.backup);
}

async function reconnect(code, canTakeOver) {
  toast('Bağlantı koptu. Yeniden bağlanılıyor…');
  const until = performance.now() + 40000;
  let first = true;
  while (S.rejoining && performance.now() < until) {
    if (!first) await sleep(1500);
    first = false;
    if (!S.rejoining) return;
    // still a room under this code? (a live host, or someone who already took over)
    const net = new ClientNet();
    let ok = true;
    try { await net.connect(code, 5000); } catch (e) { ok = false; net.destroy(); }
    if (!S.rejoining) { if (ok) net.destroy(); return; }
    if (ok) {
      S.net = net;
      net.onMsg = onMessage;
      net.onClose = hostLost;
      S.rejoining = false;
      net.send({ t: 'hello', v: VERSION, name: S.name || '', rejoin: { pid: S.me, tok: S.tok } });
      toast('Yeniden bağlandın.', 'good');
      return;
    }
    // nobody answers: the next in line takes the room over
    if (canTakeOver && S.backup) {
      const host = new HostNet();
      let got = true;
      try { await host.open(code, 3000); } catch (e) { got = false; }
      if (!S.rejoining) { if (got) host.destroy(); return; }
      if (got) { becomeHost(host); return; }
    }
  }
  if (S.rejoining) leave('Kurucuyla bağlantı koptu ve oyun devam ettirilemedi.');
}

function becomeHost(net) {
  const host = new HostGame(net);
  host.restore(S.backup, S.me);
  net.nextPid = Math.max(S.me, ...host.players.keys()) + 1;
  S.role = 'host'; S.net = net; S.host = host; S.rejoining = false; S.backup = null;
  host.local = onMessage;
  net.onMsg = (pid, m) => host.onMsg(pid, m);
  net.onLeave = (pid) => host.playerLost(pid);
  host.pushRoster();
  toast('Kurucu ayrıldı. Artık kurucu sensin, diğerleri yeniden bağlanıyor.', 'good');
}

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
      S.tok = m.tok;
      S.rejoining = false;
      if (!S.game) S.game = new ClientGame(send, m.pid);
      break;
    case 'r': onRoster(m); break;
    case 's': if (S.game) S.game.onSnap(m); break;
    case 'o': S.over = m; m.record = saveBest(m.wave); renderOver(); if (S.roster) route(); break;
    case 'c': addChat(m.pid, m.m); break;
    case 'bye': leave(BYE[m.r] || 'Odadan çıkarıldın.'); break;
    case 'bk': if (S.role === 'client' && m.s && typeof m.s === 'object') S.backup = m.s; break;
    default: break;
  }
}

function onRoster(m) {
  const prevPhase = S.roster ? S.roster.ph : null;
  S.roster = m;
  // build the same map the host built (the host page shares it already)
  if (m.theme && MAPS[m.theme] && Number.isInteger(m.seed) && (m.theme !== WORLD.theme || m.seed !== WORLD.seed)) {
    const map = generateMap(m.theme, m.seed);
    setMap(map.theme, map.seed, map.obstacles, map.decor);
  }
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
    if (p.away) chip = el('span', 'chip', 'Bağlanıyor');
    else if (p.pid === r.host) chip = el('span', 'chip host', 'Kurucu');
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

  renderSettings(r, isHost);

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

function renderSettings(r, isHost) {
  const canEdit = isHost && r.ph === 'lobby';
  $('#settings-who').textContent = canEdit ? 'Sen seçiyorsun' : 'Kurucu seçer';
  const ml = $('#map-list');
  if (!ml.childElementCount) {
    for (const id of [...MAP_ORDER, 'rastgele']) {
      const b = el('button', 'choice'); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
      b.append(el('b', '', id === 'rastgele' ? 'Rastgele' : MAPS[id].name));
      b.addEventListener('click', () => send({ t: 'set', map: id }));
      ml.append(b);
    }
    const dl = $('#diff-list');
    for (const id of DIFF_ORDER) {
      const b = el('button', '', DIFFS[id].name); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
      b.addEventListener('click', () => send({ t: 'set', diff: id }));
      dl.append(b);
    }
  }
  for (const b of ml.children) { b.setAttribute('aria-checked', b.dataset.v === r.map ? 'true' : 'false'); b.disabled = !canEdit; }
  for (const b of $('#diff-list').children) { b.setAttribute('aria-checked', b.dataset.v === r.diff ? 'true' : 'false'); b.disabled = !canEdit; }
  $('#diff-desc').textContent = DIFFS[r.diff] ? DIFFS[r.diff].desc : '';
  $('#map-desc').textContent = r.map === 'rastgele' ? 'Her oyunda dört haritadan biri seçilir.' : MAPS[r.map] ? MAPS[r.map].desc : '';
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
    ask('Odadan ayrıl', 'Kurucu sensin. Ayrılırsan kuruculuk başka bir oyuncuya geçer ve oyun devam eder.', 'Ayrıl', () => leave(''));
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
  const mins = Math.floor((o.time || 0) / 60), secs = String((o.time || 0) % 60).padStart(2, '0');
  const parts = [`${o.wave}. dalgaya kadar dayandınız`, `${mins}:${secs} dakika`];
  if (o.theme && MAPS[o.theme]) parts.push(MAPS[o.theme].name);
  if (o.diff && DIFFS[o.diff]) parts.push(DIFFS[o.diff].name);
  $('#over-sub').textContent = parts.join(' · ');
  $('#over-record').hidden = !o.record;

  // awards: only shown when someone actually earned them
  const score = (p) => p.kills * 2 + p.dmg / 50 + p.revives * 15 - p.downs * 5;
  const best = (f, min = 1) => { let top = null; for (const p of o.P) if (f(p) >= min && (!top || f(p) > f(top))) top = p; return top; };
  const awards = [];
  const mvp = best(score, -Infinity);
  if (mvp && o.P.length > 1) awards.push(['Takımın yıldızı', mvp, `${fmt(mvp.kills)} leş, ${fmt(mvp.revives)} kaldırma`, true]);
  const k = best((p) => p.kills); if (k) awards.push(['Kasap', k, `${fmt(k.kills)} leş`]);
  const d = best((p) => p.dmg); if (d) awards.push(['Yıkıcı', d, `${fmt(d.dmg)} hasar`]);
  const r = best((p) => p.revives); if (r) awards.push(['Melek', r, `${fmt(r.revives)} kez kaldırdı`]);
  const pk = best((p) => p.picks); if (pk) awards.push(['Toplayıcı', pk, `${fmt(pk.picks)} eşya topladı`]);
  const never = o.P.filter((p) => p.downs === 0);
  if (never.length === 1 && o.P.length > 1) awards.push(['Ölümsüz', never[0], 'Hiç düşmedi']);
  $('#over-awards').replaceChildren(...awards.map(([title, p, stat, gold]) => {
    const card = el('div', 'award' + (gold ? ' mvp' : ''));
    const name = el('b', '', p.name + (p.pid === S.me ? ' (sen)' : ''));
    name.style.color = p.color;
    card.append(el('span', 'eyebrow', title), name, el('small', '', stat));
    return card;
  }));

  const body = $('#over-body');
  body.replaceChildren();
  o.P.forEach((p, i) => {
    const tr = el('tr');
    const who = el('div', 'who'); const dot = el('span', 'dot'); dot.style.background = p.color;
    who.append(dot, el('span', '', p.name + (p.pid === S.me ? ' (sen)' : '')));
    const tdWho = el('td'); tdWho.append(who);
    tr.append(el('td', '', String(i + 1)), tdWho, el('td', '', CLASSES[p.cls].name), el('td', 'num', fmt(p.kills)), el('td', 'num', fmt(p.dmg)), el('td', 'num', fmt(p.revives || 0)), el('td', 'num', fmt(p.downs || 0)));
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
    g.touch = IS_TOUCH;
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
  if (n.k === 'wave') {
    const boss = n.boss ? ZTYPES[n.boss].name : null;
    const tip = { 3: 'Yere vurmadan önce kırmızı halkadan çıkın.', 8: 'Asit yağdırır ve koşucu çağırır. Dağılın.', 9: 'Kırmızı çizgiden kaçın, sonra arkasından vurun.' }[n.boss];
    banner(boss ? `${boss} geliyor` : 'Sürü yaklaşıyor', `Dalga ${n.w}`, boss ? tip : 'Sırt sırta verin.');
  }
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
  if (IS_TOUCH) {
    const fighting = g.phase === 'combat' && me.alive;
    $('#stick-aim').hidden = !fighting;
    $('#t-ab').hidden = !me.alive;
    $('#t-ab').classList.toggle('ready', left <= 0);
    $('#t-ab').textContent = left > 0 ? `${Math.ceil(left)} sn` : c.ab.name;
  }
  $('#hud-ab').title = c.ab.desc;
  const bashL = me.bashLeft || 0;
  $('#hud-bash-fill').style.height = (bashL > 0 ? (1 - bashL / BASH.cd) * 100 : 100) + '%';
  $('#hud-bash').classList.toggle('ready', bashL <= 0);
  if (IS_TOUCH) {
    $('#t-bash').hidden = !me.alive || g.phase !== 'combat';
    $('#t-bash').classList.toggle('ready', bashL <= 0);
  }
  const act = g.fx.get(S.me);
  if (act && g.time < act.until) { $('#hud-ab-cd').textContent = `Aktif: ${Math.ceil(act.until - g.time)} sn`; $('#hud-ab').classList.add('active'); }
  else $('#hud-ab').classList.remove('active');
  $('#hud-gold').textContent = fmt(me.gold);
  $('#hud-class').textContent = `${c.name} · ${g.myWeapon.name}`;
  const buffs = [];
  if (me.power > 0) buffs.push(['power', `Güç ${Math.ceil(me.power)} sn`]);
  if (me.haste > 0) buffs.push(['haste', `Hız ${Math.ceil(me.haste)} sn`]);
  const bl = $('#hud-buffs');
  if (bl.dataset.sig !== buffs.join()) { bl.dataset.sig = buffs.join(); bl.replaceChildren(...buffs.map(([k, t]) => el('span', 'buff ' + k, t))); }
  const boss = g.boss();
  $('#boss').hidden = !boss;
  if (boss) {
    $('#boss-name').textContent = ZTYPES[boss.t].name;
    $('#boss-fill').style.width = Math.max(0, Math.min(1, boss.hp / boss.max)) * 100 + '%';
  }
  $('#hud-kills').textContent = fmt(me.kills);

  // downed
  $('#dead').hidden = me.alive || !me.inGame || !$('#esc').hidden;
  $('#dead-sub').textContent = g.ps.size > 1
    ? 'Bir takım arkadaşın yanına gelirse seni kaldırır. Dalga bitince zaten geri döneceksin.'
    : 'Bu dalga bitince geri döneceksin.';
  $('#net-warn').hidden = S.role !== 'client' || performance.now() - g.lastSnapAt < 1500;
  if (!me.alive) {
    const w = g.spectate != null ? g.nameOf(g.spectate) : null;
    const mine = g.ps.get(S.me);
    $('#dead-watch').textContent = mine && mine.rev > 0 ? `Kaldırılıyorsun… %${Math.round(mine.rev * 100)}` : w ? `${w} izleniyor` : '';
  }

  updateShop();
  if (!$('#board').hidden) renderBoard();
}

// ---------- shop ----------
function buildShop() {
  const list = $('#shop-list');
  list.replaceChildren();
  const items = [{ k: 'wpn', name: 'Silah', desc: '' }, ...UPGRADES.map((u) => ({ k: u.k, name: u.name, desc: u.desc, u })), { k: 'heal', name: 'Sargı', desc: 'Canını tamamen doldurur' }];
  items.forEach((it, i) => {
    const li = el('li');
    const b = el('button', 'shop-item');
    b.type = 'button';
    b.dataset.k = it.k;
    const cost = el('span', 'cost'); cost.append(el('span', 'coin'), el('span', 'cv'));
    b.append(el('span', 'hk', String(i + 1)), el('span', 'nm', it.name), cost, el('span', 'ds', it.desc));
    if (it.u) { const pips = el('span', 'pips'); for (let j = 0; j < it.u.max; j++) pips.append(el('i')); b.append(pips); }
    if (it.k === 'wpn') { b.classList.add('weapon'); const pips = el('span', 'pips'); for (let j = 0; j < 2; j++) pips.append(el('i')); b.append(pips); }
    b.addEventListener('click', () => buy(it.k));
    li.append(b);
    list.append(li);
    if (it.k === 'wpn') list.append(buildPaths());
  });
  S.shopBuilt = true;
  S.shopCls = S.game ? S.game.cls : null;
}

// The four weapon paths, offered at the first weapon upgrade.
function buildPaths() {
  const li = el('li', 'paths');
  li.id = 'shop-paths';
  const cls = S.game ? S.game.cls : 'asker';
  for (let k = 1; k < PATHS.length; k++) {
    const b = el('button', 'path-btn');
    b.type = 'button';
    b.dataset.p = String(k);
    b.style.setProperty('--pc', PATHS[k].col);
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 84;
    drawWeaponPreview(cv.getContext('2d'), cls, 2, k, cv.width, cv.height);
    b.append(cv, el('span', 'nm', PATHS[k].name), el('span', 'ds', pathDesc(cls, k)));
    b.addEventListener('click', () => buy('wpn', k));
    li.append(b);
  }
  return li;
}

function buy(k, path) {
  const g = S.game;
  if (!g || g.phase !== 'break' || !g.self.alive) return;
  if (k === 'wpn' && g.self.wt === 0 && !path) { const f = $('#shop-paths .path-btn'); if (f) f.focus(); return; }
  send(path ? { t: 'buy', k, p: path } : { t: 'buy', k });
  sfx.buy();
}

function updateShop() {
  const g = S.game;
  const open = g.phase === 'break' && g.self.inGame;
  $('#shop').hidden = !open;
  if (!open) return;
  if (!S.shopBuilt || S.shopCls !== g.cls) buildShop();
  $('#shop-time').textContent = String(g.breakT);
  $('#shop-gold').textContent = fmt(g.self.gold);
  for (const b of $('#shop-list').querySelectorAll('.shop-item')) {
    const k = b.dataset.k;
    let cost, maxed = false, can;
    if (k === 'heal') {
      cost = HEAL_COST;
      can = g.self.alive && g.self.hp < g.self.maxHp && g.self.gold >= cost;
    } else if (k === 'wpn') {
      const wt = g.self.wt, wp = g.self.wp;
      maxed = wt >= 2;
      cost = maxed ? 0 : WEAPON_COST[wt + 1];
      can = !maxed && wt > 0 && g.self.gold >= cost && g.self.alive;
      const picking = wt === 0;
      b.querySelector('.nm').textContent = picking ? 'Silah yolu seç' : maxed ? weaponOf(g.cls, 2, wp).name : `Silah: ${weaponOf(g.cls, wt + 1, wp).name}`;
      b.querySelector('.ds').textContent = picking ? 'Aşağıdan bir yol seç. Sonraki yükseltme aynı yolda devam eder.'
        : maxed ? `${PATHS[wp].name} yolunun en güçlü silahı elinde` : `${PATHS[wp].name} yolu: ${pathDesc(g.cls, wp).toLocaleLowerCase('tr')}`;
      b.style.setProperty('--pc', wt > 0 ? PATHS[wp].col : '');
      b.classList.toggle('picking', picking);
      b.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < wt));
      const paths = $('#shop-paths');
      if (paths) {
        paths.hidden = !picking;
        const ok = g.self.gold >= WEAPON_COST[1] && g.self.alive;
        for (const pb of paths.querySelectorAll('.path-btn')) pb.disabled = !ok;
      }
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
  if (e.code === 'Escape') { e.preventDefault(); if ($('#esc').hidden) openEsc(); else closeEsc(); return; }
  if (!$('#esc').hidden) return;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (S.role === 'client' || (S.roster && S.roster.code)) openChat(); return; }
  if (GAME_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'Tab') { $('#board').hidden = false; renderBoard(); return; }
  if (e.code === 'KeyM') { setMute(sfx.toggleMute()); return; }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') { setZoom(zoom * 1.12); return; }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') { setZoom(zoom / 1.12); return; }
  if (e.code === 'Space') { if (!e.repeat) S.game.input.ab = true; return; }
  if (e.code === 'KeyF') { if (!e.repeat) S.game.input.bash = true; return; }
  if (/^Digit[1-7]$/.test(e.code)) {
    const i = Number(e.code.slice(5)) - 1;
    const k = i === 0 ? 'wpn' : i <= UPGRADES.length ? UPGRADES[i - 1].k : 'heal';
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

if (IS_TOUCH && !hashCode) menuMsg('Telefonda: sol çubukla yürü, sağ çubukla nişan al ve ateş et.', true);

// ---------- Esc menu (pauses solo games) ----------
function openEsc() {
  if (!S.game) return;
  const solo = S.role === 'host' && S.roster && !S.roster.code;
  $('#esc-eyebrow').textContent = solo ? 'Duraklatıldı' : 'Menü';
  $('#esc-title').textContent = solo ? 'Oyun durdu' : 'Oyun sürüyor';
  $('#esc-note').textContent = solo ? 'Zombiler de bekliyor. Hazır olduğunda devam et.' : 'Çok oyunculu oyunda oyun arka planda devam eder. Dikkatli ol.';
  $('#esc-leave').textContent = solo ? 'Ana menüye dön' : 'Odadan ayrıl';
  const code = S.roster && S.roster.code;
  $('#esc-code').hidden = !code;
  if (code) $('#esc-code-val').textContent = code;
  $('#esc-mute').textContent = sfx.isMuted() ? 'Sesi aç' : 'Sesi kapat';
  S.game.input.keys.clear(); S.game.input.down = false;
  $('#esc').hidden = false;
  if (solo) { S.game.paused = true; send({ t: 'pause', on: true }); }
  document.body.classList.remove('playing');
  $('#esc-resume').focus();
}
function closeEsc(silent) {
  if ($('#esc').hidden) return;
  $('#esc').hidden = true;
  if (S.game && S.game.paused) { S.game.paused = false; if (!silent) send({ t: 'pause', on: false }); }
  if (S.screen === 'game') document.body.classList.add('playing');
}
$('#esc-resume').addEventListener('click', () => closeEsc());
$('#esc-copy').addEventListener('click', async () => {
  const code = S.roster && S.roster.code;
  if (!code) return;
  const b = $('#esc-copy');
  try { await navigator.clipboard.writeText(code); b.textContent = 'Kopyalandı'; }
  catch (e) {
    const range = document.createRange(); range.selectNodeContents($('#esc-code-val'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    b.textContent = 'Seçildi, kopyala';
  }
  setTimeout(() => { b.textContent = 'Kodu kopyala'; }, 1800);
});
$('#esc-mute').addEventListener('click', () => { setMute(sfx.toggleMute()); $('#esc-mute').textContent = sfx.isMuted() ? 'Sesi aç' : 'Sesi kapat'; });
$('#esc-leave').addEventListener('click', () => { closeEsc(); $('#btn-leave').click(); });

// ---------- chat ----------
function openChat() {
  const inp = $('#chat-input');
  S.game.input.keys.clear(); S.game.input.down = false;
  inp.hidden = false; $('#chat').classList.add('open');
  inp.focus();
}
function closeChat() {
  const inp = $('#chat-input');
  inp.value = ''; inp.hidden = true; inp.blur();
  $('#chat').classList.remove('open');
}
$('#chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = e.target.value.trim(); if (t) send({ t: 'chat', m: t }); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});
function addChat(pid, text) {
  if (typeof text !== 'string') return;
  const info = S.roster && S.roster.players.find((p) => p.pid === pid);
  const li = el('li');
  const who = el('b', '', (info ? info.name : 'Biri') + ':');
  if (info) who.style.color = info.color;
  li.append(who, document.createTextNode(text));
  const log = $('#chat-log');
  log.append(li);
  while (log.children.length > 6) log.firstChild.remove();
  if (S.screen !== 'game') toast(`${info ? info.name : 'Biri'}: ${text}`);
}

// ---------- best wave, kept in this browser ----------
function saveBest(w) {
  let record = false;
  try { const b = Number(localStorage.getItem('kusatma-rekor')) || 0; if (w > b) { localStorage.setItem('kusatma-rekor', String(w)); record = b > 0; } } catch (e) { /* ignore */ }
  showBest();
  return record;
}
function showBest() {
  let b = 0;
  try { b = Number(localStorage.getItem('kusatma-rekor')) || 0; } catch (e) { /* ignore */ }
  $('#best-wave').textContent = b ? String(b) : '–';
  $('#best-label').textContent = b ? 'en iyi dalgan' : 'henüz rekor yok';
}
showBest();

// ---------- settings dialog ----------
function openSettings() {
  $('#set-volume').value = SETTINGS.volume;
  $('#set-darkness').value = SETTINGS.darkness;
  $('#set-zoom').value = Math.round(zoom * 100);
  $('#set-shake').checked = SETTINGS.shake;
  $('#set-dmgnums').checked = SETTINGS.dmgNums;
  $('#set-lead').checked = SETTINGS.lead;
  syncSettingsLabels();
  $('#settings').hidden = false;
  $('#settings-close').focus();
}
function syncSettingsLabels() {
  $('#set-volume-out').textContent = `%${$('#set-volume').value}`;
  $('#set-darkness-out').textContent = `%${$('#set-darkness').value}`;
  $('#set-zoom-out').textContent = `%${$('#set-zoom').value}`;
}
$('#btn-settings').addEventListener('click', openSettings);
$('#esc-settings').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', () => { $('#settings').hidden = true; });
$('#set-volume').addEventListener('input', (e) => { setSetting('volume', Number(e.target.value)); syncSettingsLabels(); });
$('#set-darkness').addEventListener('input', (e) => { setSetting('darkness', Number(e.target.value)); syncSettingsLabels(); });
$('#set-zoom').addEventListener('input', (e) => { setZoom(Number(e.target.value) / 100); syncSettingsLabels(); });
$('#set-shake').addEventListener('change', (e) => setSetting('shake', e.target.checked));
$('#set-dmgnums').addEventListener('change', (e) => setSetting('dmgNums', e.target.checked));
$('#set-lead').addEventListener('change', (e) => setSetting('lead', e.target.checked));
$('#settings-reset').addEventListener('click', () => { resetSettings(); setZoom(IS_TOUCH ? 0.85 : 1); openSettings(); });
onSettings((st) => sfx.setVolume(st.volume / 100));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#settings').hidden) { e.stopImmediatePropagation(); $('#settings').hidden = true; } }, { capture: true });

// ---------- phone controls ----------
function stick(elm, onMove) {
  const knob = elm.querySelector('i');
  let id = null;
  const at = (e) => {
    const r = elm.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    knob.style.transform = `translate(${x * r.width * 0.32}px, ${y * r.height * 0.32}px)`;
    onMove(x, y);
  };
  elm.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); id = e.pointerId; elm.setPointerCapture(id); at(e); });
  elm.addEventListener('pointermove', (e) => { if (e.pointerId === id) at(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; onMove(0, 0); };
  elm.addEventListener('pointerup', end);
  elm.addEventListener('pointercancel', end);
}
stick($('#stick-move'), (x, y) => { if (S.game) S.game.input.tmove = { x, y }; });
stick($('#stick-aim'), (x, y) => {
  if (!S.game) return;
  const l = Math.hypot(x, y);
  S.game.input.taim = l > 0.2 ? Math.atan2(y, x) : null;
  S.game.input.tfire = l > 0.35;
});
$('#t-ab').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.game) S.game.input.ab = true; });
$('#t-bash').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.game) S.game.input.bash = true; });
$('#t-menu').addEventListener('click', () => { if ($('#esc').hidden) openEsc(); else closeEsc(); });
$('#t-board').addEventListener('click', () => { const b = $('#board'); b.hidden = !b.hidden; if (!b.hidden) renderBoard(); });
function updateRotate() {
  $('#rotate').hidden = !(IS_TOUCH && S.screen === 'game' && window.innerHeight > window.innerWidth);
}
window.addEventListener('resize', updateRotate);

$('#build').textContent = `Yapı ${BUILD}`;
show('menu');

// For automated tests only: open the page with ?debug to expose state.
if (new URLSearchParams(location.search).has('debug')) window.__kusatma = S;
