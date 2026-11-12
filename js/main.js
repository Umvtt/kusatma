// Screens, lobby, HUD and the glue between networking, the host simulation and the local game.
import { ZTYPES, WEAPON_COST, weaponOf, PATHS, pathOf, pathsFor, pathDesc, BASH, WMAX, ROMAN, BRANCH_SWAP, weaponSpent, AB_COST, AB_UP, GEAR, TEAM, TEAM_CHUNK, gearCost, gearMax, bashCd, MAPS, MAP_ORDER, DIFFS, DIFF_ORDER, MODES, MODE_ORDER, MEV, dailyRules, BUILD, VERSION, MAX_PLAYERS, scaleFor, GEM_DIFF, GEM_MODE, gemTag, CLASSES, CLASS_ORDER, UPGRADES, HEAL_COST, upgradeCost, CODE_LEN, ZOOM_MIN, ZOOM_MAX, clamp, APP_BUILD, PVP, PVP_ORDER, TEAM_COL, TEAM_NAME, league } from './config.js';
import { HostNet, OfflineNet, ClientNet, cleanCode, addIce, SpecHost } from './net.js';
import { HostGame, cleanName } from './host.js';
import { ClientGame } from './client.js';
import { Renderer, drawCharacter, drawWeaponPreview } from './render.js';
import { startScene } from './scene.js';
import { dashPage, dashGo } from './dash.js';
import { dashInit, dashShow, dashRefresh, dashSoft, dashTop, onFriends, onDm, onFr, gemIcon, notify, recentAdd, frList, drawAvatar } from './dash.js';
import { ownsCls, FREE_CLS, ITEMS as COS, titleOf } from './catalog.js';
import * as sfx from './sfx.js';
import { voiceOn, voiceStart, voiceStop, voiceSync, voicePtt, voiceOpen, voiceLevel, voiceMute, voiceMuted, voiceTalking, voiceSelfLevel } from './voice.js';
import { consentStart, manage as cookieSettings } from './consent.js';
import { WORLD, setMap } from './world.js';
import { generateMap } from './mapgen.js';
import { SETTINGS, onSettings, setSetting, resetSettings, QUALITY, QORDER, QUAL } from './settings.js';
import { LIVE, ACCT, ME, PUB, setPub, liveStart, liveStat, livePvp, liveBlock, acctSign, acctOut, acctCheck, topGet, roomsGet, nameTaken, turnReady, diagRun, liveGame, liveGameEnd, liveWave, liveKills, inviteSend, friendsGet, liveCheat, liveConn, liveChat } from './live.js';

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
  if (screen === 'menu' && sceneGo) sceneGo();
  if (screen !== 'game') { $('#board').hidden = true; if (S.game) { S.game.input.down = false; S.game.input.keys.clear(); } }
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
  for (const id of ['#btn-create', '#btn-join', '#btn-solo']) $(id).disabled = on;
  for (const b of document.querySelectorAll('#dashpage .play-btn, #dashpage .dp-act')) b.disabled = on;
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

// new names: English letters and digits only (old saved names and accounts keep theirs)
const NAME_OK = /^[A-Za-z0-9]{6,16}$/;
const asciiName = (v) => v.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => ({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' })[c]).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
$('#name').addEventListener('input', (e) => { const i = e.target, v = asciiName(i.value); if (v !== i.value) i.value = v; });
function getName() {
  if (ACCT) $('#name').value = ACCT.name;
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
async function createRoom(offline, opts) {
  if (!offline && liveBlock()) { blockUi(); menuMsg(''); return; }
  if (!offline && nameTaken($('#name').value)) { menuMsg(TAKEN); return; }
  const name = getName();
  menuMsg(offline ? '' : 'Oda kuruluyor…', true);
  busy(true);
  const net = offline ? new OfflineNet() : new HostNet();
  try {
    if (!offline) { await turnReady(addIce); await net.open(); }
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
  S.host.badWords = LIVE.filter;
  S.host.onCheat = (r) => liveCheat(r);
  S.host.onChatLog = (n, m) => liveChat(n, m);
  S.me = 1;
  S.game = new ClientGame(send, 1);
  S.host.local = onMessage;
  net.onMsg = (pid, m) => S.host.onMsg(pid, m);
  net.onLeave = (pid, why, ms) => { const q = S.host && S.host.players.get(pid); if (q && why !== 'kick:left') liveConn({ r: why === 'spam' ? 'spam' : String(why).startsWith('kick:') ? 'kick' : 'lost', why: why + (ms > 1500 ? ', silent ' + Math.round(ms / 1000) + ' s' : ''), who: q.name, room: S.roster && S.roster.code, ping: q.ping }); S.host.playerLost(pid); };
  net.onSig = (k) => liveConn({ r: k === 'lost' ? 'sig' : 'sigok', room: net.code });
  S.host.addPlayer(1, name || 'Kurucu');
  if (ACCT && ME.pass) S.host.setPass(1, ME.pass);
  S.roomName = '';
  if (opts) {
    S.host.maxP = Math.max(2, Math.min(MAX_PLAYERS, opts.max | 0 || MAX_PLAYERS));
    S.roomName = String(opts.name || '').trim().slice(0, 24);
    send({ t: 'set', map: opts.map, diff: opts.diff, mode: opts.mode, pv: opts.pv });
  }
  startTicker();
}

async function joinRoom() {
  const code = cleanCode($('#code').value);
  if (code.length !== CODE_LEN) { menuMsg('Oda kodu 6 karakter olmalı.'); $('#code').focus(); return; }
  if (liveBlock()) { blockUi(); menuMsg(''); return; }
  if (nameTaken($('#name').value)) { menuMsg(TAKEN); return; }
  const name = getName();
  menuMsg('Odaya bağlanılıyor…', true);
  busy(true);
  const net = new ClientNet();
  try {
    await turnReady(addIce);
    await net.connect(code);
  } catch (e) {
    busy(false);
    const r = e && e.message;
    liveConn({ r: 'join', why: r || 'error', room: code });
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
  net.send({ t: 'hello', v: VERSION, name, ps: ACCT ? ME.pass : '' });
  S.joinedAt = performance.now();
  startTicker();
}

function leave(reason) {
  if (TUT.step >= 0) { TUT.step = -1; $('#tut').hidden = true; }
  if (voiceOn()) voiceStop();
  if (S.host && S.host.spec) { S.host.spec.destroy(); S.host.spec = null; }
  liveGameEnd();
  closeEsc(true);
  closeChat();
  $('#chat-log').replaceChildren(); $('#lchat-log').replaceChildren();
  stopTicker();
  cancelAnimationFrame(S.raf);
  S.raf = 0;
  if (S.net) {
    const n = S.net; S.net = null; n.onClose = null; n.onMsg = null;
    // a leaving host hands the game over first, so the room lives on
    if (S.role === 'host' && S.host && n.code) { S.host.sendBackup(); setTimeout(() => n.destroy(), 400); }
    else { try { n.send({ t: 'bye' }); } catch (e) { /* ignore */ } setTimeout(() => n.destroy(), 300); } // tell the host at once, so our place frees up
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
  liveConn({ r: 'lost', why: (S.net && S.net.why) || 'closed', room: r && r.code, secs: S.joinedAt ? (performance.now() - S.joinedAt) / 1000 : 0, ping: S.game && S.game.ping });
  if (S.role !== 'client' || !r || !r.code || S.rejoining) { leave('Kurucuyla bağlantı koptu. Oda kapanmış olabilir.'); return; }
  S.rejoining = true;
  const old = S.net; S.net = null;
  if (old) { old.onClose = null; old.onMsg = null; old.destroy(); }
  reconnect(r.code, r.succ === S.me && !!S.backup);
}

async function reconnect(code, canTakeOver) {
  toast('Bağlantı koptu. Yeniden bağlanılıyor…');
  const until = performance.now() + 40000;
  let first = true, tries = 0;
  while (S.rejoining && performance.now() < until) {
    if (!first) await sleep(1500);
    first = false;
    if (!S.rejoining) return;
    // still a room under this code? (a live host, or someone who already took over)
    const net = new ClientNet();
    let ok = true;
    tries++;
    try { await net.connect(code, 5000); } catch (e) { ok = false; net.destroy(); }
    if (!S.rejoining) { if (ok) net.destroy(); return; }
    if (ok) {
      S.net = net;
      net.onMsg = onMessage;
      net.onClose = hostLost;
      S.rejoining = false;
      net.send({ t: 'hello', v: VERSION, name: S.name || '', rejoin: { pid: S.me, tok: S.tok }, ps: ACCT ? ME.pass : '' });
      toast('Yeniden bağlandın.', 'good');
      liveConn({ r: 'back', room: code, tries });
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
  if (S.rejoining) { liveConn({ r: 'fail', room: code, tries }); leave('Kurucuyla bağlantı koptu ve oyun devam ettirilemedi.'); }
}

function becomeHost(net) {
  const host = new HostGame(net);
  host.restore(S.backup, S.me);
  net.nextPid = Math.max(S.me, ...host.players.keys()) + 1;
  S.role = 'host'; S.net = net; S.host = host; S.rejoining = false; S.backup = null;
  host.local = onMessage;
  net.onMsg = (pid, m) => host.onMsg(pid, m);
  net.onLeave = (pid, why, ms) => { const q = host && host.players.get(pid); if (q && why !== 'kick:left') liveConn({ r: why === 'spam' ? 'spam' : String(why).startsWith('kick:') ? 'kick' : 'lost', why: why + (ms > 1500 ? ', silent ' + Math.round(ms / 1000) + ' s' : ''), who: q.name, room: S.roster && S.roster.code, ping: q.ping }); host.playerLost(pid); };
  net.onSig = (k) => liveConn({ r: k === 'lost' ? 'sig' : 'sigok', room: net.code });
  host.pushRoster();
  toast('Kurucu ayrıldı. Artık kurucu sensin, diğerleri yeniden bağlanıyor.', 'good');
}

// ---------- incoming messages ----------
const BYE = {
  kick: 'Kurucu seni odadan çıkardı.',
  spam: 'Çok fazla mesaj gönderdiğin için odadan çıkarıldın.',
  full: 'Oda dolu.',
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
    case 'o': if (S.role === 'spec') { S.over = m; break; } if (S.roster && m.P) m.tm = m.time; if (S.roster) recentAdd(S.roster.players.filter((p) => p.pid !== S.me)); liveGameEnd(); S.over = m; if (m.pvp) { S.pvpRank = null; if (S.role === 'host') livePvp(m); renderOver(); if (S.roster) route(); break; } m.record = saveBest(m.wave); liveStat(m.wave, S.role === 'host', ((m.P || []).find((x) => x.pid === S.me) || {}).kills, { cls: ((m.P || []).find((x) => x.pid === S.me) || {}).cls || '', map: m.theme || '', diff: m.diff || '', tm: m.time | 0, gm: S.roster ? S.roster.mode || 'normal' : 'normal', solo: S.role === 'host' && !online() ? 1 : 0 }); renderOver(); if (S.roster) route(); break;
    case 'c': addChat(m.pid, m.m); break;
    case 'bye': if (m.r !== 'left') liveConn({ r: ['kick', 'spam', 'full', 'version'].includes(m.r) ? m.r : 'kick', why: m.r || '', room: S.roster && S.roster.code, secs: S.joinedAt ? (performance.now() - S.joinedAt) / 1000 : 0 }); leave(BYE[m.r] || 'Odadan çıkarıldın.'); break;
    case 'bk': if (S.role === 'client') { if (m.s && typeof m.s === 'object') S.backup = m.s; else if (typeof m.j === 'string' && m.j.length < 400000) { try { const b = JSON.parse(m.j); if (b && typeof b === 'object') S.backup = b; } catch (e) { /* ignore */ } } } break;
    default: break;
  }
}

function onRoster(m) {
  const prevPhase = S.roster ? S.roster.ph : null;
  S.roster = m;
  voiceUi(); if (voiceOn()) voiceSync(m, S.me);
  // build the same map the host built (the host page shares it already)
  if (m.theme && MAPS[m.theme] && Number.isInteger(m.seed) && (m.theme !== WORLD.theme || m.seed !== WORLD.seed)) {
    const map = generateMap(m.theme, m.seed);
    setMap(map.theme, map.seed, map.obstacles, map.decor);
  }
  if (S.game) S.game.onRoster(m);
  if (m.ph === 'lobby' && prevPhase && prevPhase !== 'lobby') { renderer.clearDecals(); S.over = null; }
  if ((m.ph === 'break' || m.ph === 'combat') && prevPhase === 'lobby') { renderer.clearDecals(); if (S.game) S.game.reset(); }
  route();
  if (S.role !== 'spec') renderLobby();
}

function myEntry() { return S.roster ? S.roster.players.find((p) => p.pid === S.me) : null; }

function route() {
  const r = S.roster;
  if (!r) return;
  if (S.role === 'spec') { // the owner watching unseen
    if (r.ph === 'combat' || r.ph === 'break') { if (S.screen !== 'game') { show('game'); startLoop(); } }
    else { show('menu'); menuMsg(r.ph === 'over' ? 'Oyun bitti.' : 'Oyuncular lobide. Oyun başlayınca görüntü gelecek.', true); }
    return;
  }
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
  $('#player-count').textContent = `${r.players.length}/${r.max || MAX_PLAYERS}`;
  $('#btn-invite').hidden = !(ACCT && r.code && online() && r.players.length < (r.max || MAX_PLAYERS));

  const list = $('#player-list');
  list.replaceChildren();
  $('#lt-n').textContent = String(r.players.length);
  $('#lchat').hidden = !r.code; $('#t-chat').hidden = !r.code;
  for (const p of r.players) {
    const li = el('li', 'player' + (p.pid === S.me ? ' me' : ''));
    let dot = el('span', 'dot'); dot.style.background = p.color;
    if (r.mode === 'pvp' && r.pvp !== 'ffa') li.classList.add('pv-t' + (p.tm | 0));
    if (p.eq && Object.keys(p.eq).length) { dot = el('canvas', 'p-av'); drawAvatar(dot, p.eq, { size: 34, cls: p.cls, noPet: true }); dot.style.setProperty('--pc', p.color); }
    const nm = el('div', 'p-name');
    const pn = el('b', '', p.name + (p.pid === S.me ? ' (sen)' : ''));
    const nc = p.eq && COS[p.eq.nc] ? COS[p.eq.nc].c : null;
    if (nc === 'rainbow') pn.classList.add('rainbow'); else if (nc) pn.style.color = nc;
    if (p.lvl) pn.prepend(el('span', 'lvl-b', String(p.lvl)));
    if (p.ct) pn.prepend(el('span', 'clan-t', '[' + p.ct + ']'));
    const tt = titleOf(p.eq);
    nm.append(pn, el('small', '', CLASSES[p.cls].name + (tt ? ' · ' + tt : '')));
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
  if (r.code && r.players.length < (r.max || MAX_PLAYERS)) {
    const li = el('li', 'empty-slot inv-slot');
    const on = ACCT ? frList().filter((f) => f.on && !r.players.some((p) => p.name === f.name)).length : 0;
    const acts = el('div', 'inv-acts');
    if (ACCT && online()) { const b = el('button', 'btn small primary', on ? `Arkadaş davet et (${on} çevrimiçi)` : 'Arkadaş davet et'); b.type = 'button'; b.onclick = () => $('#btn-invite').click(); acts.append(b); }
    const cp = el('button', 'btn small', 'Bağlantıyı kopyala'); cp.type = 'button';
    cp.onclick = async () => { const url = location.origin + (window.KROOT || '/') + '?oda=' + r.code; try { if (navigator.share && IS_TOUCH) await navigator.share({ title: 'Kuşatma', text: 'Odama gel!', url }); else { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı. Arkadaşın açınca direkt odana gelir.', 'good'); } } catch (e) { /* cancelled */ } };
    acts.append(cp);
    li.append(el('span', '', `Oda kodu ${r.code}. Bağlantıyı açan arkadaşın direkt odana gelir.`), acts);
    list.append(li);
  }

  renderSettings(r, isHost);
  if (S.again && r.ph === 'lobby') { S.again = false; const me2 = r.players.find((p) => p.pid === S.me); if (me2 && !me2.ready) setTimeout(() => $('#btn-ready').click(), 200); }

  const cl = $('#class-list');
  if (!cl.childElementCount) buildClassCards();
  if (me && cl.dataset.color !== me.color) { cl.dataset.color = me.color; drawPreviews(me.color); }
  showClassDetail(null);
  for (const card of cl.children) {
    const id = card.dataset.cls, on = me && id === me.cls, mine = ownsCls(ME.own, id) || (r.mode === 'daily' && id === r.dly), locked = (!mine && r.mode !== 'sandbox') || (r.mode === 'daily' && id !== r.dly);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
    card.tabIndex = on ? 0 : -1;
    card.disabled = !!(me && me.inGame);
    card.classList.toggle('locked', locked);
    const tag = card.querySelector('.cls-tag');
    tag.replaceChildren();
    if (!mine) {
      const pr = LIVE.shop && LIVE.shop.p['c.' + id];
      if (r.mode === 'daily') { tag.className = 'cls-tag lock'; tag.textContent = 'Bugün değil'; }
      else if (r.mode !== 'sandbox') { tag.className = 'cls-tag lock'; tag.append(el('span', '', 'Kilitli')); if (pr) { tag.append(gemIcon(13), el('b', '', pr.toLocaleString('tr'))); } }
      else { tag.className = 'cls-tag try'; tag.textContent = 'Deneme'; }
    } else if (r.mode === 'daily' && id === r.dly) { tag.className = 'cls-tag try'; tag.textContent = 'Günün sınıfı'; }
    else tag.className = 'cls-tag';
    const dots = card.querySelector('.cls-team');
    dots.replaceChildren(...r.players.filter((p) => p.cls === id).map((p) => { const d = el('i'); d.style.background = p.color; d.title = p.name; return d; }));
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
    const ready = others.filter((p) => p.ready).length, need = Math.ceil(others.length * 0.75);
    btn.textContent = 'Oyunu başlat';
    btn.disabled = (others.length > 0 && ready < need) || (r.mode === 'pvp' && (r.players.length < 2 || (r.pvp === 'duel' && r.players.length !== 2)));
    btn.classList.remove('on');
    note.textContent = r.mode === 'pvp' && r.players.length < 2 ? 'PvP için en az iki oyuncu gerekiyor. Kodu ya da bağlantıyı paylaş.'
      : r.mode === 'pvp' && r.pvp === 'duel' && r.players.length !== 2 ? 'Düello tam iki kişiyle oynanır.'
      : !r.code ? 'Hazır olduğunda başlat. Dalgalar arasında yükseltme alabilirsin.'
      : others.length ? (ready >= need ? `${ready}/${others.length} oyuncu hazır. Başlatabilirsin.` : `${ready}/${others.length} oyuncu hazır. Başlatmak için en az ${need} kişi hazır olmalı.`)
      : 'Henüz kimse katılmadı. Kodu paylaş ya da tek başına başlat.';
  } else {
    btn.textContent = me && me.ready ? 'Hazırım ✓' : 'Hazırım';
    btn.classList.toggle('on', !!(me && me.ready));
    btn.disabled = false;
    note.textContent = 'Kurucu oyunu başlattığında savaş başlar.';
  }
  // the game gets tougher (and the map bigger) with every extra player
  const np = r.players.length;
  if (np > 1 && !running && r.ph !== 'over' && r.mode !== 'pvp') {
    const k = scaleFor(np), pc = (v) => Math.round((v - 1) * 100);
    note.textContent += ` ${np} oyuncu: zombiler +%${pc(k.count)}, can +%${pc(k.hp)}, boss canı +%${pc(k.boss)}, harita daha büyük.`;
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
      if (gemTag(GEM_DIFF[id])) b.append(el('small', 'gem-x', gemTag(GEM_DIFF[id])));
      b.addEventListener('click', () => send({ t: 'set', diff: id }));
      dl.append(b);
    }
    const mo = $('#mode-list');
    for (const id of MODE_ORDER.concat('sandbox', 'pvp')) {
      const b = el('button', '', MODES[id].name); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
      if (id === 'pvp') b.append(el('small', 'gem-x pv', 'dereceli'));
      else if (gemTag(GEM_MODE[id])) b.append(el('small', 'gem-x', gemTag(GEM_MODE[id])));
      b.addEventListener('click', () => send({ t: 'set', mode: id }));
      mo.append(b);
    }
  }
  const dly = r.mode === 'daily';
  for (const b of ml.children) { b.setAttribute('aria-checked', b.dataset.v === r.map ? 'true' : 'false'); b.disabled = !canEdit || dly; }
  for (const b of $('#diff-list').children) { b.setAttribute('aria-checked', b.dataset.v === r.diff ? 'true' : 'false'); b.disabled = !canEdit || dly; }
  for (const b of $('#mode-list').children) { b.setAttribute('aria-checked', b.dataset.v === (r.mode || 'normal') ? 'true' : 'false'); b.disabled = !canEdit || dly; b.hidden = dly || (b.dataset.v === 'sandbox' && !!r.code) || (b.dataset.v === 'pvp' && !r.code); }
  lobbyPvp(r, canEdit);
  $('#mode-h').textContent = dly ? 'Mod: ' + MODES.daily.name : 'Mod';
  $('#mode-desc').textContent = dly ? `${MODES.daily.desc} Bugünün sınıfı: ${(CLASSES[r.dly] || {}).name || ''}.` : (MODES[r.mode] || MODES.normal).desc;
  $('#diff-desc').textContent = DIFFS[r.diff] ? DIFFS[r.diff].desc : '';
  $('#map-desc').textContent = r.map === 'rastgele' ? 'Her oyunda haritalardan biri rastgele seçilir.' : MAPS[r.map] ? MAPS[r.map].desc : '';
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
    top.append(el('span', 'cls-tag'));
    const role = el('span', 'cls-role', CLASS_ROLE[id] || '');
    b.append(top, role, el('p', 'class-desc', c.desc), bars, ab, el('span', 'cls-team'));
    b.addEventListener('click', () => {
      S.hoverCls = null; showClassDetail(id);
      if (b.classList.contains('locked') && S.roster && S.roster.mode === 'daily') { toast('Günün görevinde herkes aynı sınıfla oynar.'); return; }
      if (b.classList.contains('locked')) { toast(`${c.name} kilitli. ${ACCT ? 'Ana sayfadaki Mağaza\'dan elmasla açabilirsin.' : 'Hesap açıp elmas kazanarak açabilirsin.'} Tek başına modda deneyebilirsin.`); return; }
      send({ t: 'cls', c: id });
    });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { S.hoverCls = id; showClassDetail(id); } });
    b.addEventListener('pointerleave', () => { if (S.hoverCls === id) { S.hoverCls = null; showClassDetail(null); } });
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

const CLASS_ROLE = { asker: 'Saldırı', doktor: 'Destek', tamirci: 'Savunma', nisanci: 'Keskin nişancı', kalkanci: 'Tank', alevci: 'Yakın dövüş', bombaci: 'Alan hasarı', izci: 'Hız ve ganimet', muhendis: 'Dron ve destek', kimyager: 'Zehir ve kontrol', komutan: 'Liderlik', tesla: 'Zincirleme hasar', avci: 'Delici atış' };
// The side panel with everything about one class: stats, ability, passive, mastery and weapons.
const CLASS_TIPS = {
  asker: 'Her yere uyar. Canını yüksek tut, Disiplin hasarını artırır.',
  doktor: 'Takımın arkasında dur. Düşenlere koş, yeteneğin onları anında kaldırır.',
  tamirci: 'Tareti dar geçitlere kur, barikatlarla arkasını kapat.',
  nisanci: 'Zombileri bir hizaya getir, tek mermi hepsini deler.',
  kalkanci: 'Önde dur. Kalkanı en kalabalık anda aç, Dipçik ile Kalkanlıları aç.',
  alevci: 'Kalabalığın içine dal, alev her şeyi tutuşturur.',
  bombaci: 'Kalabalığa uzaktan ateş et, kaçarken arkana mayın bırak.',
  izci: 'Sürekli hareket et. Altınları ve eşyaları sen topla.',
  muhendis: 'Dronların sen hareket ettikçe ateş eder. Tamir dronunu barikatların ve taretlerin yanına götür.',
  kimyager: 'Önce zehirle, sonra takım eritsin. Bulutu dar geçitlere at.',
  komutan: 'Takımın ortasında kal: liderliğin herkese hasar katar. Sandığı en zor anda çağır.',
  tesla: 'Kalabalığa ateş et, şimşek kendisi yayılır. Bobini sürünün geleceği yere dik.',
  avci: 'Zombileri bir hizaya getir, her ok sırayı deler. Ok Yağmuru ile kapıyı kapat.',
};
function showClassDetail(id) {
  const box = $('#class-detail');
  if (!box) return;
  const me = myEntry();
  const cls = id || S.hoverCls || (me ? me.cls : 'asker');
  const color = me ? me.color : '#ff8a3d';
  const sig = cls + color + ME.own.length + (S.roster && S.roster.code ? 1 : 0) + JSON.stringify(ME.eq);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const c = CLASSES[cls];
  const head = el('div', 'cd-head');
  const cv = el('canvas', 'cd-pic'); cv.width = 176; cv.height = 176;
  const g = cv.getContext('2d'); g.translate(70, 96); g.scale(2.8, 2.8);
  drawCharacter(g, cls, color, -0.6, 0, { alive: true, hat: ME.eq.hat, wsk: ME.eq.wsk });
  const t = el('div', 'cd-title');
  t.append(el('span', 'eyebrow', CLASS_ROLE[cls] || 'Sınıf'), el('strong', '', c.name), el('span', 'cd-weapon', c.tiers.join(' → ')));
  head.append(cv, t);
  const stats = el('div', 'cd-stats');
  const dps = Math.round(c.dmg * c.rate * c.pellets);
  for (const [label, val, k] of [['Can', c.hp, c.bars.can], ['Hız', c.spd, c.bars.hiz], ['Hasar', `${c.dmg}${c.pellets > 1 ? '×' + c.pellets : ''} · ${c.rate}/sn`, c.bars.hasar], ['Saniyede', `~${dps}`, Math.min(1, dps / 180)]]) {
    const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(k * 100) + '%'; bar.append(i);
    stats.append(el('span', '', label), bar, el('b', '', String(val)));
  }
  const sec = (title, name, text, extra) => {
    const d = el('div', 'cd-sec');
    d.append(el('span', 'eyebrow', title));
    const p = el('p'); p.append(el('b', '', name + ' '), document.createTextNode(text)); d.append(p);
    if (extra) d.append(extra);
    return d;
  };
  const mast = el('ol', 'cd-mast');
  AB_UP[cls].forEach((x) => mast.append(el('li', '', x)));
  const abInfo = `${c.ab.desc} Bekleme ${c.ab.cd} sn.`;
  const lockNote = [];
  if (!ownsCls(ME.own, cls)) {
    const pr = LIVE.shop && LIVE.shop.p['c.' + cls], n = el('div', 'cd-lock');
    n.append(el('strong', '', S.roster && S.roster.mode === 'sandbox' ? 'Deneme alanında serbest' : 'Kilitli sınıf'));
    if (pr) { const g = el('span', 'gem-amt'); g.append(gemIcon(14), el('b', '', pr.toLocaleString('tr'))); n.append(g); }
    n.append(el('span', 'dim', (ACCT ? 'Ana sayfadaki Mağaza\'dan açabilirsin.' : 'Hesap aç, oynayarak elmas kazan, sınıfı aç.') + (S.roster && !S.roster.code && S.roster.mode !== 'sandbox' ? ' Denemek için Mod: Deneme Alanı.' : '')));
    lockNote.push(n);
  }
  box.replaceChildren(head, ...lockNote, el('p', 'cd-desc', c.desc), stats,
    sec('Yetenek · Boşluk', c.ab.name, abInfo),
    sec('Pasif', c.pas.name, c.pas.desc),
    sec('Yetenek ustalığı (cephanelikte)', '', '', mast),
    sec('Silah yolları (cephanelikte)', '', '', (() => { const u = el('div', 'cd-paths'); for (const k of pathsFor(cls)) { const P = pathOf(cls, k), ch = el('span', 'cd-path'); ch.style.setProperty('--pc', P.col); ch.title = P.desc || ''; ch.textContent = P.name; u.append(ch); } return u; })()),
    el('p', 'cd-tip', CLASS_TIPS[cls] || ''));
  box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
}

function drawPreviews(color) {
  for (const card of $('#class-list').children) {
    const cv = card.querySelector('canvas');
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.translate(50, 72);
    g.scale(2.05, 2.05);
    drawCharacter(g, card.dataset.cls, color || '#ff8a3d', -0.6, 0, { alive: true, hat: ME.eq.hat, wsk: ME.eq.wsk });
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

for (const b of document.querySelectorAll('.lobby-tabs button')) b.addEventListener('click', () => {
  $('#lobby').dataset.lt = b.dataset.lt;
  for (const o of document.querySelectorAll('.lobby-tabs button')) o.setAttribute('aria-selected', String(o === b));
  $('#lobby').scrollTop = 0;
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
// the signed-in player's take from this game: gems, level, season tier and their own line
function overMe() {
  const box = $('#over-me'), o = S.over, me = o && o.P.find((p) => p.pid === S.me);
  if (!box || !me) { if (box) box.hidden = true; return; }
  const tile = (v, l, cls) => { const t = el('div', 'om-t' + (cls ? ' ' + cls : '')); t.append(el('strong', '', v), el('span', '', l)); return t; };
  const tiles = [tile(fmt(me.kills), 'leş'), tile(fmt(me.dmg), 'hasar'), tile(String(o.wave), 'dalga')];
  if (ACCT) {
    const g = tile('+' + fmt(S.gameGems | 0), 'elmas', 'gem'); g.prepend(gemIcon(18)); tiles.unshift(g);
    const lv = el('div', 'om-t om-lv'); const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * (ME.lx | 0) / Math.max(1, ME.ln | 0)) + '%'; bar.append(f);
    lv.append(el('strong', '', 'Seviye ' + (ME.lvl || 1)), bar, el('span', '', `${fmt(ME.lx | 0)} / ${fmt(ME.ln | 0)} XP · sezon kademesi ${ME.spt | 0}`)); tiles.push(lv);
  } else tiles.push(tile('Hesap aç', 'elmas ve seviye kazan', 'cta'));
  box.replaceChildren(...tiles); box.hidden = false;
  if (ACCT && !S.overRefresh) { S.overRefresh = 1; setTimeout(() => { acctCheck().then(() => { S.overRefresh = 0; if (S.screen === 'over') overMe(); }).catch(() => { S.overRefresh = 0; }); }, 2500); }
}
$('#btn-over-again').addEventListener('click', () => { S.again = true; send({ t: 'lobby' }); });
function renderOver() {
  const o = S.over;
  if (!o) return;
  $('#over-h').textContent = 'Kuşatma düştü'; $('#over-h').classList.remove('win'); $('#over-c6').textContent = 'Kaldırma'; $('#over-c7').textContent = 'Düşme';
  if (o.pvp) { renderPvpOver(o); return; }
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
  overMe();
  const isHost = S.role === 'host';
  $('#btn-over-lobby').hidden = !isHost;
  $('#btn-over-again').hidden = !(isHost && S.roster && !S.roster.code);
  $('#over-note').textContent = isHost ? 'Lobiye dönünce herkes yeni oyun için sınıf seçebilir.' : 'Kurucu lobiye döndüğünde yeni oyun için hazırlanabilirsin.';
}
$('#btn-over-lobby').addEventListener('click', () => send({ t: 'lobby' }));
// ---------- voice chat ----------
// The mic button: tap once to turn voice on. Then hold it to talk (the finger may slide off it, talking stops only
// when it lifts), or tap it quickly to leave the microphone open and tap again to close it. V does the same on a
// keyboard (hold to talk, tap to leave open). The small × beside it turns voice off. "Mikrofon hep açık" in the lobby
// is the same open-mic switch.
let voiceOpenPref = false;
try { voiceOpenPref = localStorage.getItem('kusatma-mik') === '1'; } catch (e) { /* ignore */ }
function setOpenMic(on) {
  voiceOpenPref = !!on;
  try { localStorage.setItem('kusatma-mik', on ? '1' : '0'); } catch (e) { /* ignore */ }
  voiceOpen(voiceOpenPref); voiceUi();
}
async function toggleVoice() {
  if (voiceOn()) { voiceStop(); send({ t: 'voice', on: false }); voiceUi(); return; }
  if (!S.net || !S.net.peer) { toast('Sesli sohbet için bir odada olmalısın.'); return; }
  const ok = await voiceStart(S.net.peer);
  if (!ok) { toast('Mikrofona izin verilmedi. Tarayıcının adres çubuğundan izin verebilirsin.', 'bad'); return; }
  voiceOpen(voiceOpenPref);
  send({ t: 'voice', on: true });
  toast(voiceOpenPref ? 'Sesli sohbet açık, mikrofonun açık.' : IS_TOUCH ? 'Sesli sohbet açık. Basılı tut konuş, kısa dokun mikrofonu açık bırak.' : 'Sesli sohbet açık. V\'ye basılı tut konuş, kısa bas mikrofonu açık bırak.', 'good');
  voiceUi();
}
function voiceLabel() {
  if (!voiceOn()) return 'Ses';
  if (voiceTalking()) return voiceOpenPref ? 'Açık' : 'Konuşuyor';
  return IS_TOUCH ? 'Basılı tut' : 'V: konuş';
}
function voiceUi() {
  const r = S.roster, can = !!(r && r.code && S.net && S.net.peer), on = voiceOn(), talk = voiceTalking();
  const hb = $('#btn-voice');
  if (hb) {
    hb.hidden = !can; hb.setAttribute('aria-pressed', String(on));
    hb.classList.toggle('on', on); hb.classList.toggle('talk', talk); hb.classList.toggle('open', on && voiceOpenPref);
    const t = hb.querySelector('.vb-t'), txt = voiceLabel(); if (t && t.textContent !== txt) t.textContent = txt;
  }
  const off = $('#btn-voice-off'); if (off) off.hidden = !can || !on;
  const lb = $('#lb-voice');
  if (lb) {
    lb.hidden = !can; lb.setAttribute('aria-pressed', String(on)); lb.classList.toggle('on', on); lb.classList.toggle('talk', talk);
    const t = !on ? '🎙 Sesli sohbeti aç' : '🎙 Sesli sohbeti kapat'; if (lb.textContent !== t) lb.textContent = t;
  }
  const o = $('#lb-vopen'); if (o) { o.hidden = !can; o.querySelector('input').checked = voiceOpenPref; }
}
// called every frame while voice is on: my microphone level drives the ring around the button
function voiceTick() {
  const hb = $('#btn-voice'); if (!hb || hb.hidden) return;
  const lv = voiceOn() ? Math.min(1, voiceSelfLevel() / 22) : 0;
  hb.style.setProperty('--lv', lv.toFixed(2));
}
const TAP_MS = 220;
(function voiceButtons() {
  const hb = $('#btn-voice');
  // phones hide the bottom-right HUD, so the mic joins the touch buttons (above Dipçik)
  if (IS_TOUCH) { const w = hb.parentElement, pad = $('#touch'); if (w && pad) { w.classList.add('t-mic'); pad.append(w); } }
  let downAt = 0, pid = null;
  const start = () => { downAt = performance.now(); if (voiceOn() && !voiceOpenPref) { voicePtt(true); buzz(12); } voiceUi(); };
  const end = (cancel) => {
    if (!downAt) return;
    const held = performance.now() - downAt; downAt = 0; pid = null;
    voicePtt(false);
    if (!cancel) {
      if (!voiceOn()) toggleVoice();
      else if (held < TAP_MS) { setOpenMic(!voiceOpenPref); buzz(voiceOpenPref ? 18 : 8); toast(voiceOpenPref ? 'Mikrofonun açık. Kapatmak için tekrar dokun.' : 'Mikrofon kapandı. Konuşmak için basılı tut.', voiceOpenPref ? 'good' : ''); }
    }
    voiceUi();
  };
  hb.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); pid = e.pointerId; try { hb.setPointerCapture(pid); } catch (x) { /* ignore */ } start(); });
  hb.addEventListener('pointerup', (e) => { if (pid !== null && e.pointerId !== pid) return; end(false); });
  hb.addEventListener('pointercancel', () => end(true));
  hb.addEventListener('lostpointercapture', () => { if (downAt) end(false); });
  hb.addEventListener('contextmenu', (e) => e.preventDefault());
  hb.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); if (!voiceOn()) toggleVoice(); else setOpenMic(!voiceOpenPref); } });
  $('#btn-voice-off').addEventListener('click', () => { if (voiceOn()) toggleVoice(); });
  // the lobby gets an on/off button plus "Mikrofon hep açık"
  const lc = $('#lchat');
  if (lc) {
    const row = el('div', 'voice-row');
    const lb = el('button', 'btn small voice-btn', '🎙 Sesli sohbeti aç'); lb.type = 'button'; lb.id = 'lb-voice'; lb.hidden = true; lb.onclick = () => toggleVoice();
    const lab = el('label', 'voice-open'); lab.id = 'lb-vopen'; lab.hidden = true; const cb = el('input'); cb.type = 'checkbox';
    cb.onchange = () => setOpenMic(cb.checked);
    lab.append(cb, el('span', '', 'Mikrofon hep açık'));
    row.append(lb, lab); lc.before(row);
  }
})();
// the lobby's PvP options: the kind of match and (in team fights) which team you're on
function lobbyPvp(r, canEdit) {
  let box = $('#pvp-opts');
  if (!box) {
    box = el('div', 'pvp-opts'); box.id = 'pvp-opts';
    const kinds = el('div', 'seg pv-kinds'); kinds.setAttribute('role', 'radiogroup'); kinds.id = 'pvp-kinds';
    for (const id of PVP_ORDER) { const b = el('button', '', PVP[id].name); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio'); b.addEventListener('click', () => send({ t: 'set', pv: id })); kinds.append(b); }
    const teams = el('div', 'pv-teams'); teams.id = 'pvp-teams';
    for (const t of [0, 1]) { const b = el('button', 'btn ghost small pv-team t' + t, TEAM_NAME[t] + ' takım'); b.type = 'button'; b.dataset.t = t; b.addEventListener('click', () => send({ t: 'team', tm: t })); teams.append(b); }
    box.append(kinds, el('p', 'dim small', ''), teams);
    $('#mode-desc').after(box);
  }
  const on = r.mode === 'pvp';
  box.hidden = !on;
  const dl = $('#diff-list'); if (dl) { const sec = dl.closest('section, .lb-sec, div'); dl.hidden = on; if ($('#diff-desc')) $('#diff-desc').hidden = on; void sec; }
  if (!on) return;
  const me = r.players.find((p) => p.pid === S.me);
  for (const b of $('#pvp-kinds').children) { b.setAttribute('aria-checked', b.dataset.v === r.pvp ? 'true' : 'false'); b.disabled = !canEdit || (b.dataset.v === 'duel' && r.players.length > 2); }
  box.querySelector('p').textContent = (PVP[r.pvp] || PVP.tdm).desc + (r.pvp === 'duel' && r.players.length > 2 ? '' : '');
  const tb = $('#pvp-teams'); tb.hidden = r.pvp !== 'tdm';
  const cnt = [0, 1].map((t) => r.players.filter((p) => (p.tm | 0) === t).length);
  for (const b of tb.children) { const t = +b.dataset.t; b.textContent = `${TEAM_NAME[t]} takım (${cnt[t]})`; b.classList.toggle('on', !!me && (me.tm | 0) === t); }
}
$('#btn-over-leave').addEventListener('click', () => $('#btn-leave').click());

// ---------- PvP: score bar, respawn screen, kill feed, round banners and the end screen ----------
function pvpHud(g) {
  const bar = $('#pvp-bar'), rs = $('#pvp-resp');
  if (!g.pv) { if (!bar.hidden) bar.hidden = true; if (!rs.hidden) rs.hidden = true; return; }
  const [k, t, s0, s1, r0, r1] = g.pv, P = PVP[k] || PVP.tdm, mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const side = (n, i, label) => { const d = el('div', 'pv-side t' + i); d.append(el('span', '', label), el('strong', '', String(n))); return d; };
  let sig;
  if (k === 'ffa') {
    const L = [...g.ps.entries()].sort((a, b) => b[1].pk - a[1].pk), top = L[0];
    const lead = top ? (top[0] === S.me ? 'Sen öndesin' : `${g.nameOf(top[0])}: ${top[1].pk | 0}`) : '';
    sig = ['f', g.self.pk, lead, mm].join('|');
    if (bar.dataset.sig !== sig) { bar.dataset.sig = sig; const mid = el('div', 'pv-mid'); mid.append(el('strong', '', mm), el('span', '', `${P.goal} leşe ilk ulaşan kazanır`)); bar.replaceChildren(side(g.self.pk | 0, 0, 'Sen'), mid, side(top ? top[1].pk | 0 : 0, 1, top && top[0] !== S.me ? g.nameOf(top[0]) : 'Lider')); bar.title = lead; }
  } else if (k === 'duel') {
    sig = ['d', r0, r1, mm].join('|');
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      const mine = g.self.tm | 0, dots = (n) => { const d = el('div', 'pv-dots'); for (let i = 0; i < P.goal; i++) d.append(el('i', i < n ? 'on' : '')); return d; };
      const a = side(mine ? r1 : r0, 0, 'Sen'), b = side(mine ? r0 : r1, 1, 'Rakip'); a.append(dots(mine ? r1 : r0)); b.append(dots(mine ? r0 : r1));
      const mid = el('div', 'pv-mid'); mid.append(el('strong', '', mm), el('span', '', `Raunt ${g.pv[6] || 1}`)); bar.replaceChildren(a, mid, b);
    }
  } else {
    sig = ['t', s0, s1, mm, g.self.tm].join('|');
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      const mid = el('div', 'pv-mid'); mid.append(el('strong', '', mm), el('span', '', `${P.goal} leşe ilk ulaşan`));
      const a = side(s0, 0, TEAM_NAME[0] + (g.self.tm === 0 ? ' (sen)' : '')), b = side(s1, 1, TEAM_NAME[1] + (g.self.tm === 1 ? ' (sen)' : ''));
      const prog = (n, i) => { const q = el('div', 'pv-prog t' + i); const f = el('i'); f.style.width = Math.min(100, 100 * n / P.goal) + '%'; q.append(f); return q; };
      a.append(prog(s0, 0)); b.append(prog(s1, 1));
      bar.replaceChildren(a, mid, b);
    }
  }
  if (bar.hidden) bar.hidden = false;
  // dead: who did it, when you come back
  const dead = g.self.inGame && !g.self.alive && g.phase === 'combat';
  if (rs.hidden !== !dead) rs.hidden = !dead;
  if (dead) {
    const by = g.deathBy && g.deathBy !== S.me ? `${g.nameOf(g.deathBy)} (${(CLASSES[g.clsOf(g.deathBy)] || {}).name || ''}) seni indirdi` : 'İndin';
    if ($('#pvp-resp-by').textContent !== by) $('#pvp-resp-by').textContent = by;
    const tt = k === 'duel' ? 'Raunt bitti' : g.self.resp > 0 ? `${Math.ceil(g.self.resp)} sn` : 'Doğuyorsun…';
    if ($('#pvp-resp-t').textContent !== tt) $('#pvp-resp-t').textContent = tt;
    const tip = k === 'duel' ? '' : `${fmt(g.self.gold)} altının var: beklerken cephanelikten alışveriş yapabilirsin.`;
    if ($('#pvp-resp-tip').textContent !== tip) $('#pvp-resp-tip').textContent = tip;
  }
}
const PV_TAG = { 9: 'kılıç', 7: 'ateş', 5: 'zehir', 6: 'şimşek', 4: 'buz', 3: 'delici' };
function pvpNotice(n) {
  const g = S.game;
  if (!g) return;
  if (n.k === 'pvk') {
    const box = $('#kfeed');
    const li = el('li', (n.att === S.me || n.vic === S.me ? 'me' : '') + ' pv');
    const nm = (pid) => { const b = el('b', '', pid === S.me ? 'Sen' : pid ? g.nameOf(pid) : 'Dünya'); const p = g.ps.get(pid); if (p && g.pv && g.pv[0] !== 'ffa') b.style.color = TEAM_COL[p.tm | 0]; else if (pid && pid !== S.me) b.style.color = '#ff7b7f'; return b; };
    li.append(nm(n.att), el('span', 'kf-x', PV_TAG[n.tag] ? `› ${PV_TAG[n.tag]} ›` : '›'), nm(n.vic));
    box.prepend(li);
    while (box.children.length > (IS_TOUCH ? 3 : 5)) box.lastChild.remove();
    setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 400); }, 4500);
    if (n.vic === S.me) buzz([120, 60, 180], true);
    if (n.att === S.me && n.vic !== S.me) buzz(40);
    return;
  }
  const k = g.pv ? g.pv[0] : 'tdm', P = PVP[k] || PVP.tdm;
  if (n.k === 'pvw') banner(n.round ? `Raunt ${n.round + 1}` : P.name, 'Hazırlık', n.round ? 'Silahını yenile, sonra tekrar.' : 'Cephanelikten silahını ve yolunu seç. Süre bitince savaş başlar.');
  else if (n.k === 'pvf') { banner('Savaş!', k === 'duel' ? `Raunt ${n.round}` : P.name, k === 'tdm' ? `${P.goal} leşe ilk ulaşan takım kazanır.` : k === 'ffa' ? `${P.goal} leşi ilk yapan kazanır.` : 'Rakibini indir.'); buzz([60, 40, 60]); }
  else if (n.k === 'pvr') {
    const mine = g.self.tm | 0, won = n.win === mine, draw = n.win < 0;
    banner(draw ? 'Berabere' : won ? 'Raundu aldın' : 'Raundu kaybettin', `${mine ? n.r1 : n.r0} – ${mine ? n.r0 : n.r1}`, draw ? 'Kimse kazanamadı, raunt tekrar.' : '');
  }
}
function renderPvpOver(o) {
  const v = o.pvp, me = o.P.find((p) => p.pid === S.me), P = PVP[v.k] || PVP.tdm;
  const won = v.k === 'ffa' ? v.win === S.me : me && v.win === me.tm, draw = v.win === -1;
  const mins = Math.floor((o.time || 0) / 60), secs = String((o.time || 0) % 60).padStart(2, '0');
  const score = v.k === 'tdm' ? `${v.score[0]} – ${v.score[1]}` : v.k === 'duel' ? `${v.rounds[0]} – ${v.rounds[1]}` : '';
  $('#over-h').textContent = draw ? 'Berabere' : won ? 'Zafer!' : 'Yenilgi'; $('#over-h').classList.toggle('win', !!won); $('#over-c6').textContent = 'Asist'; $('#over-c7').textContent = 'Ölüm';
  $('#over-sub').textContent = [draw ? 'Berabere' : won ? 'Kazandın!' : 'Kaybettin', P.name, score, `${mins}:${secs}`, MAPS[o.theme] ? MAPS[o.theme].name : ''].filter(Boolean).join(' · ');
  $('#over-record').hidden = true;
  const best = (f) => { let t = null; for (const p of o.P) if (f(p) > 0 && (!t || f(p) > f(t))) t = p; return t; };
  const awards = [];
  const mvp = best((p) => p.pk * 3 + p.as + p.dmg / 400 - p.dth);
  if (mvp) awards.push(['Maçın yıldızı', mvp, `${mvp.pk} leş, ${mvp.as} asist`, true]);
  const st = best((p) => p.best); if (st && st.best >= 3) awards.push(['Seri katil', st, `${st.best} leş üst üste`]);
  const d = best((p) => p.dmg); if (d) awards.push(['Yıkıcı', d, `${fmt(d.dmg)} hasar`]);
  $('#over-awards').replaceChildren(...awards.map(([title, p, s2, gold]) => { const c = el('div', 'award' + (gold ? ' mvp' : '')); const nm = el('b', '', p.name + (p.pid === S.me ? ' (sen)' : '')); nm.style.color = v.k === 'ffa' ? p.color : TEAM_COL[p.tm]; c.append(el('span', 'eyebrow', title), nm, el('small', '', s2)); return c; }));
  const body = $('#over-body');
  body.replaceChildren();
  o.P.forEach((p, i) => {
    const tr = el('tr'), who = el('div', 'who'), dot = el('span', 'dot');
    dot.style.background = v.k === 'ffa' ? p.color : TEAM_COL[p.tm];
    who.append(dot, el('span', '', p.name + (p.pid === S.me ? ' (sen)' : '')));
    const td = el('td'); td.append(who);
    tr.append(el('td', '', String(i + 1)), td, el('td', '', (CLASSES[p.cls] || {}).name || ''), el('td', 'num', String(p.pk)), el('td', 'num', fmt(p.dmg)), el('td', 'num', String(p.as)), el('td', 'num', String(p.dth)));
    body.append(tr);
  });
  const box = $('#over-me');
  if (box && me) {
    const tile = (val, l, cls) => { const t = el('div', 'om-t' + (cls ? ' ' + cls : '')); t.append(el('strong', '', val), el('span', '', l)); return t; };
    const tiles = [tile(won ? 'Zafer' : draw ? 'Berabere' : 'Yenilgi', P.name, won ? 'gem' : ''), tile(String(me.pk), 'leş'), tile(String(me.dth), 'ölüm'), tile(String(me.as), 'asist')];
    const rk = S.pvpRank;
    if (ACCT && rk) { const L = league(rk.rp), t = el('div', 'om-t om-lv'), b = el('div', 'xpbar'), f = el('i'); f.style.width = Math.round(100 * L.pct) + '%'; f.style.background = L.c; b.append(f); t.append(el('strong', '', `${L.name} ${rk.d > 0 ? '+' : ''}${rk.d} puan`), b, el('span', '', `${rk.rp} puan${rk.up ? ' · yükseldin!' : ''}`)); tiles.push(t); }
    else if (ACCT) tiles.push(tile('…', 'dereceli puan hesaplanıyor'));
    else tiles.push(tile('Hesap aç', 'dereceli lige gir', 'cta'));
    box.replaceChildren(...tiles); box.hidden = false;
  }
  const isHost = S.role === 'host';
  $('#btn-over-lobby').hidden = !isHost;
  $('#btn-over-again').hidden = true;
  $('#over-note').textContent = isHost ? 'Lobiye dönünce takımlar ve sınıflar yeniden seçilir.' : 'Kurucu lobiye döndüğünde rövanş için hazırlanabilirsin.';
}

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
    perfTick(now);
    S.hudT -= dt;
    if (S.hudT <= 0) { S.hudT = 0.1; updateHud(); }
    for (const n of g.notices.splice(0)) notice(n);
  };
  S.raf = requestAnimationFrame(frame);
}

// ---------- graphics level: auto mode steps down when the frame rate drops and back up when there is room ----------
const PERF = { t0: 0, n: 0, ups: 0, cool: 0, good: 0, fps: 0 };
function qApply() {
  const want = SETTINGS.quality === 'auto' ? (QUAL.auto || (IS_TOUCH ? 'med' : 'high')) : SETTINGS.quality;
  QUAL.level = QUALITY[want] ? want : 'high'; QUAL.parts = QUALITY[QUAL.level].parts;
  renderer.setQuality(QUAL.level);
}
function qSync() {
  for (const b of $('#set-quality').children) b.setAttribute('aria-checked', String(b.dataset.q === SETTINGS.quality));
  $('#set-q-out').textContent = SETTINGS.quality === 'auto' ? `Otomatik · ${QUALITY[QUAL.level].name}` : QUALITY[SETTINGS.quality].name;
}
for (const b of $('#set-quality').children) b.addEventListener('click', () => { setSetting('quality', b.dataset.q); PERF.ups = 0; qApply(); qSync(); });
$('#set-fps').addEventListener('change', (e) => { setSetting('fps', e.target.checked); $('#fps').hidden = !e.target.checked; });
const AIM_N = { off: 'Kapalı', low: 'Hafif', mid: 'Orta', high: 'Güçlü' };
function aimSync() { for (const b of $('#set-aim').children) b.setAttribute('aria-checked', String(b.dataset.a === SETTINGS.aim)); $('#set-aim-out').textContent = AIM_N[SETTINGS.aim] || 'Orta'; }
for (const b of $('#set-aim').children) b.addEventListener('click', () => { setSetting('aim', b.dataset.a); aimSync(); });
$('#set-vibe').addEventListener('change', (e) => setSetting('vibe', e.target.checked));
function perfTick(now) {
  if (!PERF.t0) { PERF.t0 = now; PERF.n = 0; return; }
  PERF.n++;
  const el2 = now - PERF.t0;
  if (el2 < 3000) return;
  const fps = PERF.n * 1000 / el2; PERF.fps = fps; PERF.t0 = now; PERF.n = 0;
  if (SETTINGS.fps) { const f = $('#fps'); f.hidden = false; f.textContent = `${Math.round(fps)} FPS · ${QUALITY[QUAL.level].name}`; }
  if (SETTINGS.quality !== 'auto' || document.hidden || (S.game && S.game.paused) || now < PERF.cool) return;
  const i = QORDER.indexOf(QUAL.level);
  if (fps < 44 && i > 0) { QUAL.auto = QORDER[i - 1]; PERF.good = 0; PERF.cool = now + 6000; qApply(); }
  else if (fps > 57) { PERF.good++; if (PERF.good >= 3 && i < QORDER.length - 1 && PERF.ups < 2) { PERF.ups++; PERF.good = 0; QUAL.auto = QORDER[i + 1]; PERF.cool = now + 6000; qApply(); } }
  else PERF.good = 0;
}
qApply();
$('#fps').hidden = !SETTINGS.fps;
onSettings(() => { qApply(); $('#fps').hidden = !SETTINGS.fps; });
// vibration: the app's own bridge when there is one, the browser's otherwise
let buzzAt = 0;
function buzz(p, force) {
  if (!SETTINGS.vibe || !IS_TOUCH) return;
  const now = performance.now(); if (!force && now - buzzAt < 250) return; buzzAt = now;
  try { if (window.KusatmaApp && window.KusatmaApp.vibrate) window.KusatmaApp.vibrate(JSON.stringify(Array.isArray(p) ? p : [p])); else if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ }
}
let lastHpBuzz = null;

function notice(n) {
  const g = S.game;
  if (n.k === 'down' && n.pid === S.me) buzz([120, 60, 220], true);
  if (n.k === 'wave' && n.boss) buzz([70, 50, 70, 50, 140], true);
  if (n.k === 'mev' && MEV[n.ev]) { banner('Harita olayı', MEV[n.ev].name, MEV[n.ev].desc); return; }
  if (n.k === 'kill') { killFeed(n); return; }
  if (n.k === 'pvk' || n.k === 'pvw' || n.k === 'pvf' || n.k === 'pvr') { pvpNotice(n); return; }
  if (n.k === 'streak') { streak(n.n); return; }
  if (n.k === 'adm') { adminNote(n); return; }
  if (n.k === 'train') { toast('Tren geliyor! Raydan çekil.', 'bad'); buzz([80, 40, 80]); return; }
  if (n.k === 'cu') { toast(`Takıma yetişmen için +${n.n} altın`, 'good'); return; }
  if (n.k === 'wave') {
    if (n.w === 1) { S.gameGems = 0; $('#kfeed').replaceChildren(); }
    liveGame();
    if (g.self) liveKills(g.self.kills);
    const boss = n.boss ? ZTYPES[n.boss].name : null;
    const tip = { 3: 'Yere vurmadan önce kırmızı halkadan çıkın.', 8: 'Asit yağdırır ve koşucu çağırır. Dağılın.', 9: 'Kırmızı çizgiden kaçın, sonra arkasından vurun.', 19: 'Turuncu halkaya araba düşer, hemen çıkın.', 20: 'Ölüleri kaldırır ve ışınlanır. Önce cesetlerden uzak durun.', 23: 'Yerin altından gelir. Kırmızı halka görünce durma, koş.' }[n.boss];
    banner(boss ? `${boss} geliyor` : 'Sürü yaklaşıyor', `Dalga ${n.w}`, boss ? tip : 'Sırt sırta verin.');
  }
  else if (n.k === 'clear') { const me = myEntry(); if (me && me.inGame) liveWave(g.wave, g.self.kills); }
  if (n.k === 'clear') banner('Dalga temizlendi', 'Mola', `Herkese +${n.bonus} altın. Cephanelikten yükseltme al.`);
  else if (n.k === 'down') toast(n.pid === S.me ? 'Düştün!' : `${g.nameOf(n.pid)} düştü!`, 'bad');
  else if (n.k === 'up') toast(`${g.nameOf(n.pid)} ayağa kalktı.`, 'good');
  else if (n.k === 'revived') toast('Ayağa kalktın!', 'good');
  else if (n.k === 'team' && TEAM[n.i]) toast(`Takım yükseltmesi: ${TEAM[n.i].name} ${ROMAN[n.lv] || n.lv}${n.pid === S.me ? ' (son katkı senden)' : ''}`, 'good');
}

// what the game's organisers just sent, as a short toast for everyone in the game
function adminNote(n) {
  const mine = !!n.who && !!S.game && n.who === S.game.nameOf(S.me);
  const who = n.who ? (mine ? 'Sana' : `${n.who} için`) : 'Herkese';
  const later = n.later ? ' (sonraki dalgada)' : '';
  const zt = ZTYPES[n.t];
  const t = {
    gold: `${who} +${Math.max(10, Math.min(5000, n.n))} altın geldi!`,
    item: `${who} ${(GEAR[n.i] || {}).name || 'eşya'} ×${Math.max(1, n.n)} geldi!`,
    boss: `Bir boss yola çıktı${later}!`,
    horde: `Koşucu sürüsü geliyor${later}!`,
    zombie: `${zt ? zt.name : 'Zombi'} ×${Math.max(1, n.n)} geliyor${later}!`,
    mev: MEV[n.q] ? `${MEV[n.q].name}${later}!` : '',
  }[n.e];
  if (!t) return;
  toast(t, n.e === 'gold' || n.e === 'item' ? 'good' : 'bad');
  if ((n.e === 'gold' || n.e === 'item') && (!n.who || mine)) sfx.buy();
}

// kill feed: bosses, elites and rarer zombies, newest on top, each line fades after a few seconds
const ELITE = ['', 'Hızlı', 'Patlayan', 'Yenilenen', 'Zırhlı'];
function killFeed(n) {
  const g = S.game, box = $('#kfeed'), zt = ZTYPES[n.t];
  if (!g || !box || !zt) return;
  const li = el('li', (n.pid === S.me ? 'me' : '') + (zt.boss ? ' kf-boss' : ''));
  const who = el('b', '', n.pid === S.me ? 'Sen' : g.nameOf(n.pid));
  const r = g.roster.get(n.pid); if (r && r.color && n.pid !== S.me) who.style.color = r.color;
  li.append(who, el('span', 'kf-x', '›'), el('span', '', (n.el && ELITE[n.el] ? ELITE[n.el] + ' ' : '') + zt.name));
  box.prepend(li);
  while (box.children.length > (IS_TOUCH ? 3 : 5)) box.lastChild.remove();
  setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 400); }, 4500);
}
let streakT = 0;
function streak(k) {
  const b = $('#streak'); if (!b) return;
  const word = k >= 15 ? 'Durdurulamaz!' : k >= 10 ? 'Katliam!' : k >= 6 ? 'Seri katil!' : k >= 4 ? 'Seri!' : 'Üçlü!';
  b.replaceChildren(el('strong', '', word), el('span', '', `${k} leş`));
  b.hidden = false; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  if (k === 6 || k === 10 || k === 15) buzz(40);
  clearTimeout(streakT); streakT = setTimeout(() => { b.hidden = true; }, 1600);
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
  if (IS_TOUCH) { const wb = document.querySelector('.wave-box'); if (wb) { const t = Math.round(wb.getBoundingClientRect().bottom + 8); if (t > 20 && t !== S.tbTop) { S.tbTop = t; document.body.style.setProperty('--tb-top', t + 'px'); } } }
  const g = S.game;
  if (!g) return;
  const me = g.self;
  const c = CLASSES[g.cls];
  const st = g.myStats;
  if (me.inGame && me.alive && lastHpBuzz != null && me.hp < lastHpBuzz - Math.max(8, me.maxHp * 0.06)) buzz(35);
  lastHpBuzz = me.inGame && me.alive ? me.hp : null;

  pvpHud(g);
  tutTick(g);
  if (voiceOn() && S.roster) { voiceSync(S.roster, S.me); voiceTick(); }
  { // my connection to the room's host
    let pc = $('#hud-ping'); if (!pc) { pc = el('span', 'ping-chip'); pc.id = 'hud-ping'; document.querySelector('.wave-box').append(pc); }
    const mp = g.ps.get(S.me), v = S.role === 'client' && mp ? mp.ping | 0 : 0; pc.hidden = !v;
    if (v) { const t = `Ping ${v} ms`; if (pc.textContent !== t) pc.textContent = t; pc.className = 'ping-chip ' + (v < 90 ? 'ok' : v < 180 ? 'mid' : 'bad'); }
  }
  if (g.pv) {
    const P = PVP[g.pv[0]] || PVP.tdm, t = g.pv[1], mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('#hud-phase').textContent = g.phase === 'combat' ? P.name : 'Hazırlık';
    $('#hud-wave').textContent = g.phase === 'combat' ? mm : String(g.breakT);
    $('#hud-sub').textContent = g.phase === 'combat' ? (g.pv[0] === 'duel' ? `Raunt ${g.pv[6]}` : `Leş: ${g.self.pk | 0} · Ölüm: ${g.self.dth | 0}`) : 'Cephanelikten silahını seç';
  } else if (g.phase === 'combat') {
    $('#hud-phase').textContent = 'Dalga';
    $('#hud-wave').textContent = String(g.wave);
    $('#hud-sub').textContent = `Kalan zombi: ${fmt(g.zLeft)}`;
  } else {
    $('#hud-phase').textContent = g.wave === 0 ? 'Hazırlan' : 'Mola';
    $('#hud-wave').textContent = String(g.wave + 1);
    $('#hud-sub').textContent = `Dalga ${g.wave + 1} başlıyor: ${g.breakT} sn`;
  }

  const md = S.roster && S.roster.mode && S.roster.mode !== 'normal' ? MODES[S.roster.mode] : null;
  const mt = $('#hud-mode');
  if (mt.hidden !== !md) mt.hidden = !md;
  if (md && mt.textContent !== md.name) mt.textContent = md.name;
  const mv = $('#hud-mev'), ev = g.mev && MEV[g.mev[0]];
  if (mv.hidden !== !ev) mv.hidden = !ev;
  if (ev) { const t = `${ev.name} · ${Math.ceil(g.mev[1])} sn`; if (mv.textContent !== t) mv.textContent = t; mv.dataset.k = g.mev[0]; }

  // team
  const team = $('#hud-team');
  const rows = [...g.ps.entries()];
  if (team.childElementCount !== rows.length) team.replaceChildren(...rows.map(() => { const li = el('li'); li.append(el('i', 'dot'), el('span'), el('div', 'mini-hp')); li.lastChild.append(el('i')); return li; }));
  rows.forEach(([pid, p], i) => {
    const li = team.children[i];
    const info = g.roster.get(pid);
    li.className = p.alive ? '' : 'down';
    li.children[0].style.background = g.pv && g.pv[0] !== 'ffa' ? TEAM_COL[p.tm | 0] : info ? info.color : '#888';
    li.children[1].textContent = (info ? info.name : '?') + (pid === S.me ? ' (sen)' : '');
    li.classList.toggle('talk', voiceLevel(pid) > 6);
    if (p.ping > 0) { const q = el('small', 'ping ' + (p.ping < 90 ? 'ok' : p.ping < 180 ? 'mid' : 'bad'), ` ${p.ping} ms`); li.children[1].append(q); }
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
  $('#hud-bash-fill').style.height = (bashL > 0 ? (1 - bashL / bashCd(g.cls)) * 100 : 100) + '%';
  $('#hud-bash').classList.toggle('ready', bashL <= 0);
  if (IS_TOUCH) {
    $('#t-bash').hidden = !me.alive || g.phase !== 'combat';
    $('#t-bash').classList.toggle('ready', bashL <= 0);
  }
  updateGearHud(g, me);
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
  const BL = g.bosses(), boss = BL[0], bx = $('#boss');
  if (bx.hidden !== !boss) bx.hidden = !boss;
  if (boss) {
    const nm = ZTYPES[boss.t].name; if ($('#boss-name').textContent !== nm) $('#boss-name').textContent = nm;
    $('#boss-fill').style.width = Math.max(0, Math.min(1, boss.hp / boss.max)) * 100 + '%';
    // other bosses alive at the same time: smaller bars underneath
    const more = $('#boss-more'), rest = BL.slice(1);
    if (more.childElementCount !== rest.length) more.replaceChildren(...rest.map(() => { const r = el('div', 'boss-row'); const b = el('div', 'boss-bar sm'); b.append(el('i')); r.append(el('span'), b); return r; }));
    rest.forEach((z, i) => { const r = more.children[i]; const t = ZTYPES[z.t].name; if (r.firstChild.textContent !== t) r.firstChild.textContent = t; r.lastChild.firstChild.style.width = Math.max(0, Math.min(1, z.hp / z.max)) * 100 + '%'; });
    // phones: the health row sits at the top, so the boss bar goes right under it (and under the buffs)
    if (document.body.classList.contains('touch')) {
      let top = 0;
      for (const s of ['.hud-bottom', '#hud-buffs']) { const e = $(s); if (!e || !e.offsetParent && s !== '.hud-bottom') continue; const r = e.getBoundingClientRect(); if (r.height > 2) top = Math.max(top, r.bottom); }
      const want = Math.round(top + 6) + 'px';
      if (bx.style.top !== want) bx.style.top = want;
    } else if (bx.style.top) bx.style.top = '';
  }
  $('#hud-kills').textContent = fmt(me.kills);

  // downed
  $('#dead').hidden = me.alive || !me.inGame || !$('#esc').hidden || !!g.pv;
  $('#dead-sub').textContent = g.ps.size > 1 ? 'Bir arkadaşın yanına gelip seni kaldırabilir · dalga bitince dönersin' : 'Dalga bitince geri döneceksin';
  $('#net-warn').hidden = S.role !== 'client' || performance.now() - g.lastSnapAt < 1500;
  if (!me.alive) {
    const sp = g.spectate != null ? g.ps.get(g.spectate) : null;
    const mine = g.ps.get(S.me);
    $('#spec').hidden = !sp;
    if (sp) {
      $('#spec-name').textContent = g.nameOf(g.spectate);
      const info = S.roster && S.roster.players.find((p) => p.pid === g.spectate);
      $('#spec-name').style.color = info ? info.color : '';
      $('#spec-hp').style.width = Math.max(0, Math.min(1, sp.hp / (sp.maxHp || 1))) * 100 + '%';
      const many = [...g.ps.entries()].filter(([pid, p]) => pid !== S.me && p.alive).length > 1;
      $('#spec-prev').hidden = $('#spec-next').hidden = !many;
    }
    const rev = mine && mine.rev > 0;
    $('#rev').hidden = !rev;
    if (rev) { $('#dead-watch').textContent = 'Kaldırılıyorsun…'; $('#rev-fill').style.width = Math.round(mine.rev * 100) + '%'; }
  }

  updateShop();
  if (!$('#board').hidden) renderBoard();
}

// ---------- shop ----------
// The armory has four tabs. Each tab is rebuilt only when its layout changes (class, weapon level,
// path or branch); every frame after that just updates prices, levels and which buttons work.
const SHOP_TABS = [['wpn', 'Silah'], ['up', 'Gelişim'], ['gear', 'Eşya'], ['team', 'Takım']];
S.shopTab = 'wpn';
S.shopSig = '';
S.shopUpd = [];
(function buildTabs() {
  const bar = $('#shop-tabs');
  for (const [k, name] of SHOP_TABS) {
    const b = el('button', 'shop-tab');
    b.append(el('span', '', name), el('i', 'tab-n'));
    b.type = 'button'; b.dataset.tab = k; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { S.shopTab = k; S.shopSig = ''; updateShop(); });
    bar.append(b);
  }
})();
function shopTabStep(d) {
  const i = SHOP_TABS.findIndex(([k]) => k === S.shopTab);
  S.shopTab = SHOP_TABS[(i + d + SHOP_TABS.length) % SHOP_TABS.length][0];
  if (S.shopTab === 'team' && S.game && S.game.pv) S.shopTab = SHOP_TABS[(i + 2 * d + SHOP_TABS.length * 2) % SHOP_TABS.length][0];
  S.shopSig = ''; updateShop();
}

function buildShop() {
  const g = S.game;
  const list = $('#shop-list');
  list.replaceChildren();
  S.shopUpd = [];
  S.shopHk = 0;
  if (S.shopTab === 'wpn') buildWeaponTab(list, g);
  else if (S.shopTab === 'up') buildUpTab(list, g);
  else if (S.shopTab === 'gear') buildGearTab(list, g);
  else buildTeamTab(list, g);
  list.scrollTop = 0;
}

// A standard row: hotkey, name, description, price and level pips. upd(b) returns {cost, can, maxed, lv}.
function shopRow(list, name, desc, max, onBuy, upd, extra) {
  const li = el('li');
  const b = el('button', 'shop-item' + (extra ? ' ' + extra : ''));
  b.type = 'button';
  const hk = ++S.shopHk;
  b.dataset.hk = String(hk);
  const cost = el('span', 'cost'); cost.append(el('span', 'coin'), el('span', 'cv'));
  b.append(el('span', 'hk', hk <= 9 ? String(hk) : ''), el('span', 'nm', name), cost, el('span', 'ds', desc));
  if (max) { const pips = el('span', 'pips'); for (let j = 0; j < max; j++) pips.append(el('i')); b.append(pips); }
  b.addEventListener('click', () => { if (!b.disabled) { onBuy(); sfx.buy(); } });
  li.append(b);
  list.append(li);
  S.shopUpd.push(() => {
    const r = upd(b);
    b.querySelector('.cv').textContent = r.maxed ? 'Tam' : r.label || fmt(r.cost);
    b.classList.toggle('maxed', !!r.maxed);
    b.classList.toggle('poor', !r.maxed && r.cost > gold());
    b.disabled = !r.can;
    if (max) b.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < r.lv));
  });
  return b;
}
// a gold price tag: coin + amount, red when you can't afford it yet
function priceTag(cost) { const t = el('span', 'price-tag'); t.append(el('span', 'coin'), el('b', '', fmt(cost))); S.shopUpd.push(() => t.classList.toggle('poor', gold() < cost)); return t; }
function costHead(text, cost) { const li = el('li', 'shop-sub cost-head'); li.append(el('span', '', text), priceTag(cost)); return li; }
const alive = () => S.game && S.game.self.alive;
const gold = () => (S.game ? S.game.self.gold : 0);

function weaponCanvas(cls, wt, wp, wb, w = 240, h = 84) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  drawWeaponPreview(cv.getContext('2d'), cls, wt, wp, w, h, wb, 0.4);
  return cv;
}

function buildWeaponTab(list, g) {
  const me = g.self, cls = g.cls, wt = me.wt, wp = me.wp, wb = me.wb;
  const P = pathOf(cls, wp);
  const B = wb && P.br ? P.br[wb - 1] : null;
  // current weapon
  const card = el('li', 'wpn-card');
  card.style.setProperty('--pc', wt ? P.col : '#ffe1a6');
  const w = weaponOf(cls, wt, wp, wb);
  const info = el('div', 'wpn-info');
  const lvl = el('div', 'wpn-lv');
  for (let i = 1; i <= WMAX; i++) lvl.append(el('i', i <= wt ? 'on' + (i >= 3 ? ' br' : '') : ''));
  info.append(el('span', 'eyebrow', wt ? `Seviye ${ROMAN[wt]} / ${ROMAN[WMAX]}` : 'Başlangıç silahı'), el('strong', '', w.name), lvl,
    el('span', 'ds', wt === 0 ? 'Bir yol seç. Yol, silahın nasıl güçleneceğini belirler.'
      : B ? `${P.name} → ${B.name}: ${B.desc.toLocaleLowerCase('tr')}` : `${P.name}: ${pathDesc(cls, wp).toLocaleLowerCase('tr')}`));
  if (wt >= WMAX && B) info.append(el('span', 'cap on', `Özel güç: ${B.cap}`));
  card.append(weaponCanvas(cls, wt, wp, wb, 240, 70), info);
  list.append(card);

  if (wt === 0) {
    list.append(costHead('Yol seç', WEAPON_COST[1]));
    const li = el('li', 'paths');
    for (const k of pathsFor(cls)) {
      const b = el('button', 'path-btn');
      b.type = 'button';
      b.style.setProperty('--pc', pathOf(cls, k).col);
      const hk = ++S.shopHk; b.dataset.hk = String(hk);
      b.append(weaponCanvas(cls, 2, k, 0), el('span', 'nm', `${hk <= 9 ? hk + ' · ' : ''}${pathOf(cls, k).name}`), el('span', 'ds', pathDesc(cls, k)), priceTag(WEAPON_COST[1]));
      b.addEventListener('click', () => { send({ t: 'buy', k: 'wpn', p: k }); sfx.buy(); });
      li.append(b);
      S.shopUpd.push(() => { b.disabled = !(gold() >= WEAPON_COST[1] && alive()); });
    }
    list.append(li);
    return;
  }
  if (wt === 2) {
    list.append(costHead('Seviye III: dal seç', WEAPON_COST[3]));
    const li = el('li', 'paths branches');
    P.br.forEach((br, i) => {
      const b = el('button', 'path-btn');
      b.type = 'button';
      b.style.setProperty('--pc', P.col);
      const hk = ++S.shopHk; b.dataset.hk = String(hk);
      b.append(weaponCanvas(cls, 3, wp, i + 1), el('span', 'nm', `${hk} · ${br.name}`), el('span', 'ds', br.desc), el('span', 'cap', `Seviye V: ${br.cap}`), priceTag(WEAPON_COST[3]));
      b.addEventListener('click', () => { send({ t: 'buy', k: 'wpn', b: i + 1 }); sfx.buy(); });
      li.append(b);
      S.shopUpd.push(() => { b.disabled = !(gold() >= WEAPON_COST[3] && alive()); });
    });
    list.append(li);
  } else if (wt < WMAX) {
    const next = weaponOf(cls, wt + 1, wp, wb);
    const desc = wt === 1 ? `Daha güçlü. Seviye III'te iki daldan birini seçeceksin: ${P.br.map((x) => x.name).join(' ya da ')}.`
      : wt + 1 === WMAX ? `Son seviye. Özel güç: ${B.cap}.` : 'Daha güçlü, dalın etkisi büyür.';
    shopRow(list, `Seviye ${ROMAN[wt + 1]}: ${next.name}`, desc, 0, () => send({ t: 'buy', k: 'wpn' }),
      () => ({ cost: WEAPON_COST[wt + 1], can: alive() && gold() >= WEAPON_COST[wt + 1] }), 'weapon');
  }
  // change branch or start over
  const acts = el('li', 'wpn-acts');
  if (wt >= 3) {
    const other = P.br[2 - wb];
    const sw = el('button', 'btn small', `${other.name} dalına geç · ${fmt(BRANCH_SWAP)}`);
    sw.type = 'button';
    sw.title = other.desc;
    sw.addEventListener('click', () => { send({ t: 'buy', k: 'wswap' }); sfx.buy(); });
    S.shopUpd.push(() => { sw.disabled = !(gold() >= BRANCH_SWAP && alive()); });
    acts.append(sw);
  }
  const back = Math.floor(weaponSpent(wt) / 2);
  const rs = el('button', 'btn small ghost', `Yolu sıfırla · +${fmt(back)}`);
  rs.type = 'button';
  rs.title = 'Harcadığın altının yarısı geri gelir, yeni bir yol seçersin.';
  let armed = 0;
  rs.addEventListener('click', () => {
    if (performance.now() - armed > 3000) { armed = performance.now(); rs.textContent = 'Emin misin? Tekrar bas'; rs.classList.add('warn'); return; }
    send({ t: 'buy', k: 'wreset' }); sfx.buy();
  });
  S.shopUpd.push(() => {
    rs.disabled = !alive();
    if (armed && performance.now() - armed > 3000) { armed = 0; rs.textContent = `Yolu sıfırla · +${fmt(back)}`; rs.classList.remove('warn'); }
  });
  acts.append(rs);
  list.append(acts);
}

function buildUpTab(list, g) {
  const cls = g.cls;
  // what you have right now
  const sum = el('li', 'stat-strip');
  const cells = [['Can', (st) => fmt(g.self.maxHp)], ['Hasar', (st) => fmt(Math.round(st.dmg))], ['Atış', (st) => `${st.rate.toFixed(1)}/sn`], ['Kritik', (st) => `%${Math.round(st.crit * 100 + (g.myWeapon.fx.crit || 0) * 100)}`], ['Zırh', (st) => `%${Math.round((1 - st.armor) * 100)}`], ['Yenilenme', (st) => `${st.regen.toFixed(1)}/sn`]];
  const vals = cells.map(([label]) => { const d = el('div'); const v = el('b'); d.append(v, el('span', '', label)); sum.append(d); return v; });
  list.append(sum);
  S.shopUpd.push(() => { const st = g.myStats; cells.forEach(([, f], i) => { vals[i].textContent = f(st); }); });
  for (const u of UPGRADES) {
    shopRow(list, u.name, u.desc, u.max, () => send({ t: 'buy', k: u.k }), () => {
      const lv = g.self.lv[u.k] | 0, maxed = lv >= u.max, cost = maxed ? 0 : upgradeCost(u, lv);
      return { cost, maxed, lv, can: !maxed && alive() && gold() >= cost };
    });
  }
  const c = CLASSES[cls];
  const abRow = shopRow(list, `Yetenek ustalığı: ${c.ab.name}`, '', AB_COST.length, () => send({ t: 'buy', k: 'ab' }), (b) => {
    const lv = g.self.lv.ab | 0, maxed = lv >= AB_COST.length, cost = maxed ? 0 : AB_COST[lv];
    b.querySelector('.ds').textContent = maxed ? 'Yeteneğin en güçlü hâlinde' : `Sonraki: ${AB_UP[cls][lv]}`;
    return { cost, maxed, lv, can: !maxed && alive() && gold() >= cost };
  }, 'ability-up');
  void abRow;
}

function buildGearTab(list, g) {
  list.append(el('li', 'shop-sub', IS_TOUCH ? 'Savaşta sağdaki eşya düğmeleriyle kullanılır.' : 'Savaşta 1–4 tuşlarıyla kullanılır. Nişan aldığın yere atılır.'));
  GEAR.forEach((it, i) => {
    const max = gearMax(g.cls, i), cost = gearCost(g.cls, i);
    shopRow(list, `${it.name}`, it.desc, max, () => send({ t: 'buy', k: 'gear', i }), (b) => {
      const n = g.self.inv[i] | 0, maxed = n >= max;
      b.style.setProperty('--pc', it.col);
      return { cost, maxed, lv: n, can: !maxed && alive() && gold() >= cost };
    }, 'gear-item');
  });
}

function buildTeamTab(list, g) {
  list.append(el('li', 'shop-sub', 'Takımca altın biriktirin. Hedefe ulaşınca herkes güçlenir.'));
  const coinBtn = (cls, label, hk) => { const b = el('button', 'btn small ' + cls); b.type = 'button'; if (hk) b.dataset.hk = String(hk); const c = el('span', 'coin'); const t = el('span', '', label); b.append(c, t); return [b, t]; };
  TEAM.forEach((t, i) => {
    const li = el('li', 'team-up');
    const head = el('div', 'tu-head');
    const pips = el('span', 'pips'); for (let j = 0; j < t.cost.length; j++) pips.append(el('i'));
    head.append(el('strong', '', t.name), pips);
    const bar = el('div', 'tu-bar'); const fill = el('i'); const bt = el('span', 'tu-bt'); bar.append(fill, bt);
    const row = el('div', 'tu-btns');
    const hk = ++S.shopHk;
    const [give, giveT] = coinBtn('', `${TEAM_CHUNK} koy`, hk);
    const [all, allT] = coinBtn('primary', 'Tamamla');
    give.addEventListener('click', () => { if (!give.disabled) { send({ t: 'buy', k: 'team', i }); sfx.buy(); } });
    all.addEventListener('click', () => { if (!all.disabled) { send({ t: 'buy', k: 'team', i, all: 1 }); sfx.buy(); } });
    row.append(give, all);
    li.append(head, el('span', 'ds', t.desc), bar, row);
    list.append(li);
    S.shopUpd.push(() => {
      const lv = g.team[i] | 0, maxed = lv >= t.cost.length, cost = g.teamCost[i] | 0, fund = g.teamFund[i] | 0, left = Math.max(0, cost - fund);
      pips.querySelectorAll('i').forEach((p, j) => p.classList.toggle('on', j < lv));
      fill.style.width = maxed ? '100%' : cost ? Math.min(100, (fund / cost) * 100) + '%' : '0%';
      bt.textContent = maxed ? 'Tamamlandı ✓' : `${fmt(fund)} / ${fmt(cost)} · Seviye ${ROMAN[lv + 1]} için`;
      li.classList.toggle('maxed', maxed);
      give.disabled = maxed || !alive() || gold() <= 0;
      giveT.textContent = `${Math.min(TEAM_CHUNK, Math.max(left, 1))} koy`;
      all.disabled = maxed || !alive() || gold() < left || left <= 0;
      allT.textContent = maxed ? 'Tamam' : `${fmt(left)} ile tamamla`;
      row.hidden = maxed;
    });
  });
}

// How many things in each tab you could buy right now (the small number on the tabs).
function shopAffordable(g) {
  const me = g.self, gd = me.gold, out = { wpn: 0, up: 0, gear: 0, team: 0 };
  if (!me.alive) return out;
  if (me.wt < WMAX && gd >= WEAPON_COST[me.wt + 1]) out.wpn = 1;
  for (const u of UPGRADES) { const lv = me.lv[u.k] | 0; if (lv < u.max && gd >= upgradeCost(u, lv)) out.up++; }
  const al = me.lv.ab | 0; if (al < AB_COST.length && gd >= AB_COST[al]) out.up++;
  GEAR.forEach((it, i) => { if ((me.inv[i] | 0) < gearMax(g.cls, i) && gd >= gearCost(g.cls, i)) out.gear++; });
  TEAM.forEach((t, i) => { if ((g.team[i] | 0) < t.cost.length && gd > 0) out.team++; });
  return out;
}

// Keys in the break: 1-9 press the tab's numbered buttons, Q/E change tabs.
function shopKey(n) {
  const b = $(`#shop-list [data-hk="${n}"]`);
  if (b && !b.disabled) b.click();
}

$('#shop-close').addEventListener('click', () => { S.armoryOpen = false; updateShop(); });
$('#btn-armory').addEventListener('click', () => { S.armoryOpen = true; S.shopSig = ''; updateShop(); });
$('#shop-heal').addEventListener('click', () => { if (!$('#shop-heal').disabled) { send({ t: 'buy', k: 'heal' }); sfx.buy(); } });
function updateShop() {
  const g = S.game;
  { const h = $('#shop-heal'), s2 = g.self, full = s2.hp >= s2.maxHp; $('#shop-heal-c').textContent = String(HEAL_COST); h.disabled = !s2.alive || full || s2.gold < HEAL_COST; h.classList.toggle('full', full); h.title = full ? 'Canın zaten dolu' : ''; }
  const brk = (g.phase === 'break' || (!!g.pv && g.phase === 'combat' && !g.self.alive)) && g.self.inGame, touch = document.body.classList.contains('touch');
  // phones: the armory opens full screen at the start of each break; closing it leaves a button on the screen
  if (brk && !S.wasBreak) S.armoryOpen = true;
  S.wasBreak = brk;
  const open = brk && (!touch || S.armoryOpen !== false);
  if ($('#shop').hidden !== !open) $('#shop').hidden = !open;
  $('#shop').classList.toggle('full', touch);
  { const tt = $('#shop-tabs [data-tab="team"]'), pv = !!g.pv; if (tt && tt.hidden !== pv) tt.hidden = pv; if (pv && S.shopTab === 'team') { S.shopTab = 'wpn'; S.shopSig = ''; } }
  const fab = $('#btn-armory'), showFab = brk && touch && !open;
  if (fab.hidden !== !showFab) fab.hidden = !showFab;
  if (showFab) {
    const gs = fmt(g.self.gold); if ($('#fab-gold').textContent !== gs) $('#fab-gold').textContent = gs;
    const na = Object.values(shopAffordable(g)).reduce((a, b) => a + b, 0), nf = $('#fab-n');
    nf.hidden = !na; if (na && nf.textContent !== String(na)) nf.textContent = String(na);
  }
  if (!open) return;
  const me = g.self;
  const sig = `${S.shopTab}|${g.cls}|${me.wt}|${me.wp}|${me.wb}`;
  if (sig !== S.shopSig) { S.shopSig = sig; buildShop(); }
  const n = shopAffordable(g);
  for (const t of $('#shop-tabs').children) {
    const on = t.dataset.tab === S.shopTab;
    t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    const c = n[t.dataset.tab] || 0;
    t.querySelector('.tab-n').textContent = c ? String(c) : '';
  }
  $('#shop-time').textContent = String(g.breakT);
  $('#shop-gold').textContent = fmt(me.gold);
  for (const f of S.shopUpd) f();
  const players = [...g.ps.values()];
  const ready = players.filter((p) => p.ready).length;
  const rb = $('#btn-shop-ready');
  { const hide = !!g.pv && g.phase === 'combat'; if (rb.hidden !== hide) rb.hidden = hide; const rc = $('#shop-ready-count'); if (rc.hidden !== hide) rc.hidden = hide; }
  rb.textContent = me.shopReady ? 'Hazırsın ✓' : 'Hazırım';
  rb.classList.toggle('on', me.shopReady);
  $('#shop-ready-count').textContent = players.length > 1 ? `${ready}/${players.length} oyuncu hazır` : 'Hazırsan dalgayı hemen başlat.';
}

// ---------- one-use items in battle ----------
function updateGearHud(g, me) {
  const bar = $('#hud-gear');
  const sig = me.inv.join() + '|' + (g.phase === 'combat' && me.alive ? 1 : 0);
  if (bar.dataset.sig === sig) return;
  bar.dataset.sig = sig;
  const fight = g.phase === 'combat' && me.alive;
  const slots = GEAR.map((it, i) => [it, i]).filter(([, i]) => me.inv[i] > 0);
  bar.replaceChildren(...slots.map(([it, i]) => {
    const d = el('div', 'gear-slot');
    d.style.setProperty('--pc', it.col);
    d.append(el('span', 'ab-key', String(i + 1)), el('strong', '', it.short), el('span', 'gear-n', `×${me.inv[i]}`));
    d.title = it.desc;
    return d;
  }));
  bar.hidden = !slots.length;
  const tg = $('#t-gear');
  tg.replaceChildren(...slots.map(([it, i]) => {
    const b = el('button', 't-btn t-gear');
    b.type = 'button';
    b.style.setProperty('--pc', it.col);
    b.append(el('span', '', it.short), el('b', '', `×${me.inv[i]}`));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.game) S.game.input.use = i; });
    return b;
  }));
  tg.hidden = !(IS_TOUCH && fight && slots.length);
}
$('#btn-shop-ready').addEventListener('click', () => { if (S.game) send({ t: 'ready', r: !S.game.self.shopReady }); });

// ---------- scoreboard ----------
function renderBoard() {
  const g = S.game;
  if (!g) return;
  $('#board-wave').textContent = g.pv ? (PVP[g.pv[0]] || PVP.tdm).name : `Dalga ${g.wave}`;
  const body = $('#board-body');
  body.replaceChildren();
  const isHost = S.role === 'host';
  const rows = [...g.ps.entries()].sort((a, b) => g.pv ? ((a[1].tm - b[1].tm) * (g.pv[0] === 'ffa' ? 0 : 1) || b[1].pk - a[1].pk) : b[1].kills - a[1].kills);
  for (const [pid, p] of rows) {
    const info = g.roster.get(pid);
    if (!info) continue;
    const tr = el('tr');
    const who = el('div', 'who'); const dot = el('span', 'dot'); dot.style.background = info.color;
    who.append(dot, el('span', '', info.name + (pid === S.me ? ' (sen)' : '')));
    const td = el('td'); td.append(who);
    const act = el('td');
    if (info.vo && pid !== S.me && voiceOn()) { const mb = el('button', 'btn ghost small', voiceMuted(pid) ? 'Sesi aç' : 'Sustur'); mb.type = 'button'; mb.addEventListener('click', () => { voiceMute(pid, !voiceMuted(pid)); renderBoard(); }); act.append(mb); }
    if (isHost && pid !== S.me) {
      const b = el('button', 'btn ghost small', 'At'); b.type = 'button';
      b.addEventListener('click', () => kickPlayer(info));
      act.append(b);
    }
    if (g.pv && g.pv[0] !== 'ffa') dot.style.background = TEAM_COL[p.tm | 0];
    tr.append(td, el('td', '', CLASSES[info.cls].name), el('td', 'num', g.pv ? `${p.pk | 0} / ${p.dth | 0} / ${p.ast | 0}` : fmt(p.kills)), el('td', '', (g.pv ? (p.alive ? 'Savaşta' : 'Yeniden doğuyor') : p.alive ? 'Ayakta' : 'Düştü') + (p.ping > 0 ? ` · ${p.ping} ms` : pid === (S.roster && S.roster.host) ? ' · kurucu' : '')), act);
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
  if (/^(Digit|Numpad)[1-9]$/.test(e.code)) {
    const n = Number(e.code.slice(-1));
    if (S.game.phase === 'combat') { if (n <= GEAR.length && !e.repeat) S.game.input.use = n - 1; }
    else shopKey(n);
    return;
  }
  if ((e.code === 'KeyQ' || e.code === 'KeyE') && S.game.phase !== 'combat' && !$('#shop').hidden) { shopTabStep(e.code === 'KeyQ' ? -1 : 1); return; }
  if (!S.game.self.alive && !e.repeat && ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) S.game.specStep = e.code === 'KeyA' || e.code === 'ArrowLeft' ? -1 : 1;
  S.game.input.keys.add(e.code);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyV') { voicePtt(false); if (vKeyAt && voiceOn() && performance.now() - vKeyAt < TAP_MS) setOpenMic(!voiceOpenPref); vKeyAt = 0; voiceUi(); }
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
let vKeyAt = 0;
window.addEventListener('keydown', (e) => { if (e.code === 'KeyV' && !e.repeat && voiceOn() && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { vKeyAt = performance.now(); if (!voiceOpenPref) voicePtt(true); voiceUi(); } });

// ---------- menu ----------
try { const saved = localStorage.getItem('kusatma-ad'); if (saved) $('#name').value = saved; } catch (e) { /* ignore */ }
$('#btn-create').addEventListener('click', () => roomDlg());
$('#btn-solo').addEventListener('click', () => createRoom(true));
$('#btn-tut').addEventListener('click', () => { TUT.force = true; createRoom(true); });
// ---------- first-game tutorial: a few short steps that finish themselves as the player does them ----------
const TUT = { step: -1, force: false, t: 0, x: 0, y: 0, walked: 0, fired: 0 };
// players who already finished a game (a saved best wave or account games) are not shown the tutorial unless they ask for it
const tutDone = () => { try { return localStorage.getItem('kusatma-egitim') === '1' || Number(localStorage.getItem('kusatma-rekor')) > 0 || (ACCT && (ME.games | 0) > 0); } catch (e) { return true; } };
const tutEnd = () => { TUT.step = -1; TUT.force = false; try { localStorage.setItem('kusatma-egitim', '1'); } catch (e) { /* ignore */ } $('#tut').hidden = true; };
$('#tut-skip').addEventListener('click', tutEnd);
function tutSteps() {
  const t = IS_TOUCH;
  return [
    ['Yürü', t ? 'Sol taraftaki çubukla yürü.' : 'W A S D (ya da ok tuşları) ile yürü.'],
    ['Nişan al ve ateş et', t ? 'Sağ çubuğu it: o yöne nişan alır ve ateş edersin.' : 'Fareyle nişan al, sol tıkla ateş et.'],
    ['Sınıf yeteneği', t ? 'Yetenek düğmesine bas. Her sınıfın yeteneği farklı.' : 'Boşluk tuşu (ya da sağ tık) sınıf yeteneğini kullanır.'],
    ['Dipçik', t ? 'Dipçik düğmesi önündeki zombileri iter ve sersemletir.' : 'F tuşu: Dipçik önündeki zombileri iter ve sersemletir. Kalkanlı\'nın kalkanını da düşürür.'],
    ['Cephanelik', 'Dalgayı temizle. Molada cephanelikten silahına bir yol seç: silahın güçlenir.'],
    ['Hazırsın!', 'Arkadaşlarınla oda kurabilir ya da böyle devam edebilirsin. İyi şanslar.'],
  ];
}
function tutTick(g) {
  if (TUT.step < 0) {
    if (!g || !g.self.inGame || !S.roster || S.roster.code || S.roster.mode === 'pvp' || (tutDone() && !TUT.force)) return;
    TUT.step = 0; TUT.t = 0; TUT.walked = 0; TUT.fired = 0; TUT.x = g.self.x; TUT.y = g.self.y; TUT.force = false;
  }
  const L = tutSteps(), me = g.self;
  TUT.t += 0.1;
  const next = () => { TUT.step++; TUT.t = 0; sfx.buy(); };
  switch (TUT.step) {
    case 0: TUT.walked += Math.hypot(me.x - TUT.x, me.y - TUT.y); TUT.x = me.x; TUT.y = me.y; if (TUT.walked > 260) next(); break;
    case 1: if (g.input.down || g.input.tfire) TUT.fired += 0.1; if (TUT.fired > 1.2) next(); break;
    case 2: if (me.abLeft > 0) next(); break;
    case 3: if (me.bashLeft > 0) next(); break;
    case 4: if ((me.wt | 0) > 0) next(); break;
    case 5: if (TUT.t > 6) { tutEnd(); return; } break;
    default: tutEnd(); return;
  }
  if (TUT.step < 0 || TUT.step >= L.length) return;
  const [h, d] = L[TUT.step];
  $('#tut').hidden = false;
  const n = `Eğitim ${TUT.step + 1}/${L.length}`;
  if ($('#tut-n').textContent !== n) { $('#tut-n').textContent = n; $('#tut-t').textContent = h; $('#tut-d').textContent = d; $('#tut-skip').textContent = TUT.step === L.length - 1 ? 'Kapat' : 'Eğitimi geç'; }
}
$('#btn-join').addEventListener('click', joinRoom);
$('#code').addEventListener('input', (e) => { const v = cleanCode(e.target.value); if (v !== e.target.value) e.target.value = v; });
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createRoom(false); });

// Opening a link like .../#K7X2PM fills in the room code.
const hashCode = cleanCode(location.hash.slice(1));
if (hashCode.length === CODE_LEN) { $('#code').value = hashCode; menuMsg('Takma adını yaz ve “Katıl”a bas.', true); }

if (IS_TOUCH && !hashCode) { const m = $('#menu-msg'); m.textContent = 'Telefonda: sol çubukla yürü, sağ çubukla nişan al ve ateş et.'; m.classList.add('info'); m.hidden = false; }

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
  leaveArm = 0; $('#esc-leave').classList.remove('danger');
  $('#esc').hidden = false; document.body.classList.add('esc-open');
  escFill(); clearInterval(escTimer); escTimer = setInterval(() => { if ($('#esc').hidden) clearInterval(escTimer); else escFill(); }, 1000);
  if (solo) { S.game.paused = true; send({ t: 'pause', on: true }); }
  document.body.classList.remove('playing');
  $('#esc-resume').focus();
}
function closeEsc(silent) {
  if ($('#esc').hidden) return;
  $('#esc').hidden = true; document.body.classList.remove('esc-open');
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
// leaving asks once more so nobody leaves by accident
let leaveArm = 0, escTimer = 0;
$('#esc-leave').addEventListener('click', () => {
  const b = $('#esc-leave');
  if (!leaveArm || Date.now() - leaveArm > 4000) { leaveArm = Date.now(); b.dataset.t = b.textContent; b.textContent = 'Emin misin? Tekrar bas'; b.classList.add('danger'); setTimeout(() => { if (leaveArm && Date.now() - leaveArm >= 3900) { leaveArm = 0; b.textContent = b.dataset.t; b.classList.remove('danger'); } }, 4000); return; }
  leaveArm = 0; b.textContent = b.dataset.t || b.textContent; b.classList.remove('danger');
  closeEsc(); $('#btn-leave').click();
});
const tile = (v, l) => { const d = el('div', 'esc-tile'); d.append(el('b', '', String(v)), el('span', '', l)); return d; };
function escFill() {
  const g = S.game, r = S.roster; if (!g) return;
  const me = (r && r.players.find((p) => p.pid === S.me)) || {};
  const tags = [];
  if (r) {
    tags.push((MODES[r.mode] || MODES.normal).name, MAPS[r.theme || r.map] ? MAPS[r.theme || r.map].name : 'Rastgele', (DIFFS[r.diff] || {}).name || '', `${r.players.length}/${r.max || MAX_PLAYERS} oyuncu`);
    if (S.roomName) tags.unshift(S.roomName);
  }
  $('#esc-room').replaceChildren(...tags.filter(Boolean).map((t) => el('span', 'chip-tag', t)));
  const sec = $('#esc-me-sec'); sec.hidden = !ACCT;
  if (ACCT) {
    const cap = (LIVE.shop && LIVE.shop.cap) || 1000, left = Math.max(0, cap - (ME.gd | 0));
    const gem = el('div', 'esc-tile'); const gb = el('b'); gb.append(gemIcon(16), document.createTextNode(' ' + (ME.gems | 0).toLocaleString('tr'))); gem.append(gb, el('span', '', 'elmas'));
    const lv = el('div', 'esc-tile wide'); const bar = el('div', 'esc-xp'); const f = el('i'); f.style.width = Math.round(100 * ME.lx / Math.max(1, ME.ln)) + '%'; bar.append(f);
    lv.append(el('b', '', `Seviye ${ME.lvl}`), bar, el('span', '', `${(ME.lx | 0).toLocaleString('tr')} / ${(ME.ln | 0).toLocaleString('tr')} XP`));
    $('#esc-me').replaceChildren(gem, tile('+' + (S.gameGems | 0), 'bu oyunda elmas'), tile(left.toLocaleString('tr'), 'bugün kalan elmas'), tile(ME.spt | 0, 'sezon kademesi'), lv);
  }
  let best = 0; try { best = Number(localStorage.getItem('kusatma-rekor')) || 0; } catch (e) { /* ignore */ }
  const mins = Math.floor((g.time || 0) / 60), secs = Math.floor((g.time || 0) % 60);
  $('#esc-stats').replaceChildren(tile(g.wave || 0, 'dalga'), tile((g.self.kills | 0).toLocaleString('tr'), 'leş'), tile((g.self.gold | 0).toLocaleString('tr'), 'altın'), tile(`${mins}:${String(secs).padStart(2, '0')}`, 'süre'), tile(Math.max(best, g.wave || 0), 'en iyi dalgan'), tile(CLASSES[me.cls || g.cls] ? CLASSES[me.cls || g.cls].name : '', 'sınıf'));
  $('#esc-invite').hidden = !(ACCT && r && r.code && online());
  $('#esc-chat').hidden = !(r && r.code);
  $('#esc-diag').hidden = !(r && r.code);
}
$('#esc-invite').addEventListener('click', () => { closeEsc(); $('#btn-invite').click(); });
$('#esc-chat').addEventListener('click', () => { closeEsc(); openChat(); });
$('#esc-diag').addEventListener('click', () => { openDiag(); });

// ---------- chat ----------
function openChat() {
  const inp = $('#chat-input');
  if (S.game) { S.game.input.keys.clear(); S.game.input.down = false; }
  $('#chat-row').hidden = false; $('#chat').classList.add('open');
  const log = $('#chat-log'); log.scrollTop = log.scrollHeight;
  inp.focus();
}
function closeChat() {
  const inp = $('#chat-input');
  inp.value = ''; $('#chat-row').hidden = true; inp.blur();
  $('#chat').classList.remove('open');
}
function chatSend(inp) { const t = inp.value.trim(); if (t) send({ t: 'chat', m: t }); inp.value = ''; }
$('#chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { chatSend(e.target); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});
$('#chat-send').addEventListener('click', () => { chatSend($('#chat-input')); closeChat(); });
$('#chat-x').addEventListener('click', closeChat);
$('#t-chat').addEventListener('click', () => { if ($('#chat').classList.contains('open')) closeChat(); else openChat(); });
$('#lchat-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') chatSend(e.target); });
$('#lchat-go').addEventListener('click', () => { chatSend($('#lchat-in')); $('#lchat-in').focus(); });
function addChat(pid, text) {
  if (typeof text !== 'string') return;
  const info = S.roster && S.roster.players.find((p) => p.pid === pid);
  const li = el('li');
  const who = el('b', '', (info ? info.name : 'Biri') + ':');
  if (info) who.style.color = info.color;
  li.append(who, document.createTextNode(text));
  const log = $('#chat-log');
  log.append(li);
  setTimeout(() => li.classList.add('old'), 7000); // fades away; shown again only while the chat is open
  while (log.children.length > 40) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  // the lobby keeps its own copy, so people can talk while picking classes
  const ll = $('#lchat-log'), l2 = li.cloneNode(true); l2.classList.remove('old'); ll.append(l2);
  while (ll.children.length > 40) ll.firstChild.remove();
  ll.scrollTop = ll.scrollHeight;
  if (S.screen !== 'game' && S.screen !== 'lobby') toast(`${info ? info.name : 'Biri'}: ${text}`);
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
  $('#set-fps').checked = SETTINGS.fps;
  $('#set-vibe').checked = SETTINGS.vibe;
  $('#set-vibe-row').hidden = !IS_TOUCH || (!('vibrate' in navigator) && !window.KusatmaApp);
  $('#set-aim-row').hidden = !IS_TOUCH;
  qSync(); aimSync();
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
// the main menu: a live battle behind it and the eight classes up front
var sceneGo = null; // var: show() may run before this line
sceneGo = startScene($('#menu-bg'));
{
  const box = $('#lp-classes');
  for (const id of CLASS_ORDER) {
    const c = CLASSES[id], d = el('div', 'lp-cls' + (FREE_CLS.includes(id) ? '' : ' paid'));
    const cv = el('canvas'); cv.width = 104; cv.height = 104; cv.style.width = '52px'; cv.style.height = '52px';
    const g = cv.getContext('2d'); g.scale(2, 2); g.translate(22, 29); g.scale(1.05, 1.05);
    drawCharacter(g, id, '#ff8a3d', -0.6, 0, { alive: true });
    d.append(cv, el('span', '', c.name));
    d.title = `${c.name}: ${c.desc}${FREE_CLS.includes(id) ? '' : ' (elmasla açılır)'}`;
    box.append(d);
  }
}
$('#btn-promo').onclick = () => $('#btn-acct').click();
// the Android app: a download button for Android browsers, and the back button inside the app
const IN_APP = /KusatmaApp\//.test(navigator.userAgent);
if (/Android/i.test(navigator.userAgent) && !IN_APP) $('#btn-apk').hidden = false;
// Android browsers first see a full-screen "get the app" page (once per visit); they can still play here
if (/Android/i.test(navigator.userAgent) && !IN_APP && !/[?&](debug|nogetapp)/.test(location.search)) {
  let seen = false; try { seen = sessionStorage.getItem('kusatma-getapp') === '1'; } catch (e) { /* ignore */ }
  if (!seen) $('#getapp').hidden = false;
}
// phones: while typing in a dialog, keep it at the top so the keyboard can't cover its buttons
document.addEventListener('focusin', (e) => { if (IS_TOUCH && e.target.matches('.confirm input, .dm input')) { document.body.classList.add('kb'); setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 250); } });
document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('.confirm input, .dm input')) document.body.classList.remove('kb'); }, 100));
$('#acct-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#acct-pw').focus(); } });
// the app download is named after the app's build; the app's "important update" screen opens the site with ?guncelle=1
{ const f = `app/kusatma-${APP_BUILD}.0.apk`, n = `Kuşatma ${APP_BUILD}.0.apk`;
  for (const a of document.querySelectorAll('a[href="app/kusatma.apk"]')) { a.href = f; a.download = n; }
  if (/[?&]guncelle=1/.test(location.search)) {
    $('#getapp').hidden = false; $('.ga-h').textContent = 'Önemli güncelleme'; $('#ga-dl').textContent = 'Güncelle';
    $('.ga-list').replaceChildren(el('li', '', 'Uygulamanın yeni sürümü gerekiyor'), el('li', '', 'Hesabın ve ilerlemen aynı kalır'), el('li', '', 'Eskisini silmene gerek yok, üstüne kurulur'));
    $('.ga-how').textContent = 'Güncelle\'ye bas, inen "' + n + '" dosyasını aç ve Güncelle\'ye dokun.';
  } }
const gaDone = () => { $('#getapp').hidden = true; try { sessionStorage.setItem('kusatma-getapp', '1'); } catch (e) { /* ignore */ } };
$('#ga-skip').onclick = gaDone;
$('#ga-dl').addEventListener('click', () => { setTimeout(() => { $('#ga-dl').textContent = 'İndiriliyor… Bitince dosyayı aç'; }, 300); });
window.kusatmaBack = () => {
  if (!$('#acct-dlg').hidden) { authClose(); return 'handled'; }
  { const ck = document.getElementById('ck-dlg'); if (ck) { ck.remove(); return 'handled'; } }
  { const sp = document.querySelector('.spin-pop'); if (sp) { sp.remove(); return 'handled'; } }
  if (!$('#inv-pop').hidden) { $('#inv-no').click(); return 'handled'; }
  const open = [...document.querySelectorAll('.confirm')].find((d) => !d.hidden);
  if (open) { open.hidden = true; return 'handled'; }
  if (!$('#dm').hidden) { $('#dm').hidden = true; return 'handled'; }
  if (S.screen === 'game') { if ($('#esc').hidden) openEsc(); else closeEsc(); return 'handled'; }
  if (S.screen === 'lobby' || S.screen === 'over') { $('#btn-leave').click(); return 'handled'; }
  if (ACCT && dashPage() !== 'home') { dashGo('home'); return 'handled'; }
  return 'exit';
};
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
for (const [id, d] of [['#spec-prev', -1], ['#spec-next', 1]]) $(id).addEventListener('click', () => { if (S.game) S.game.specStep = d; });
$('#t-ab').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.game) S.game.input.ab = true; });
$('#t-bash').addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.game) S.game.input.bash = true; });
$('#t-menu').addEventListener('click', () => { if ($('#esc').hidden) openEsc(); else closeEsc(); });
$('#t-board').addEventListener('click', () => { const b = $('#board'); b.hidden = !b.hidden; if (!b.hidden) renderBoard(); });
function updateRotate() {
  $('#rotate').hidden = !(IS_TOUCH && S.screen === 'game' && window.innerHeight > window.innerWidth);
}
window.addEventListener('resize', updateRotate);

$('#build').textContent = `Yapı ${BUILD}`;
$('#set-build').textContent = `Kuşatma · Yapı ${BUILD}`;
show('menu');

// ---------- optional accounts and the leaderboard ----------
const TAKEN = 'Bu ad bir hesaba ait. Giriş yap ya da başka bir ad seç.';
const ACCT_WHY = { name: 'Ad en az 6, en fazla 16 karakter olmalı.', chars: 'Ad 6–16 karakter olmalı; sadece İngilizce harf (A-Z) ve rakam.', pw: 'Şifre en az 6 karakter olmalı.', taken: 'Bu ad alınmış. Başka bir ad dene.', wrong: 'Ad ya da şifre yanlış.',
  slow: 'Çok fazla deneme oldu. Birkaç dakika bekleyip tekrar dene.', ban: 'Bu hesap engellendi.', net: 'Sunucuya ulaşılamadı. İnternetini kontrol et.' };
// ban or maintenance: its own notice that always shows the current state
function blockUi() { const t = liveBlock(); for (const id of ['#menu-block', '#dp-block']) { const m = $(id); m.hidden = !t; m.textContent = t; } }
function acctUi() {
  blockUi();
  dpShow();
  $('#acct-txt').textContent = ACCT ? `Giriş yapıldı: ${ACCT.name}` : 'Hesap isteğe bağlı';
  $('#menu-promo').hidden = !!ACCT;
  const ab = $('#btn-acct'); if (ACCT) ab.textContent = 'Çıkış yap'; else ab.replaceChildren(el('span', 'lbl-long', 'Giriş yap / Hesap oluştur'), el('span', 'lbl-short', 'Giriş / Kayıt'));
  $('#name').readOnly = !!ACCT;
  if (ACCT) $('#name').value = ACCT.name;
}
// ---------- sign in / sign up: a page of its own ----------
const AUTH = { m: 'login', busy: false };
function acctMsg(t, info) { const m = $('#acct-msg'); m.hidden = !t; m.textContent = t || ''; m.classList.toggle('info', !!info); }
function pwScore(pw) {
  if (pw.length < 6) return 0;
  let k = 1;
  if (pw.length >= 10) k++;
  if (/[a-zçğıöşü]/.test(pw) && /[A-ZÇĞİÖŞÜ]/.test(pw)) k++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) k++; else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) k += 0.5;
  if (/^(.)\1+$/.test(pw) || /^(123456|password|qwerty|sifre|şifre)/i.test(pw)) k = 1;
  return Math.min(4, Math.round(k));
}
function authCheck() {
  const reg = AUTH.m === 'reg', name = $('#acct-name').value, pw = $('#acct-pw').value, pw2 = $('#acct-pw2').value;
  $('#auth-count').textContent = `${name.length}/16`;
  const len = name.length >= 6 && name.length <= 16, chr = /^[A-Za-z0-9]*$/.test(name) && name.length > 0;
  for (const [r, okv] of [['len', len], ['chr', chr]]) { const li = $(`#auth-rules [data-r="${r}"]`); li.classList.toggle('ok', okv); li.classList.toggle('bad', !!name && !okv); }
  const sc = pwScore(pw), words = ['En az 6 karakter', 'Zayıf', 'İdare eder', 'Güçlü', 'Çok güçlü'];
  $('#auth-meter').dataset.s = String(pw ? sc : -1); $('#auth-meter-t').textContent = pw ? words[sc] : words[0];
  const same = !!pw2 && pw2 === pw; $('#auth-pw2-row').classList.toggle('ok', same); $('#auth-pw2-row').classList.toggle('bad', !!pw2 && !same && pw2.length >= pw.length);
  const ready = reg ? len && chr && pw.length >= 6 && same : name.trim().length > 0 && pw.length > 0;
  $(reg ? '#acct-reg' : '#acct-login').classList.toggle('ready', ready);
  return ready;
}
function authMode(m) {
  AUTH.m = m === 'reg' ? 'reg' : 'login';
  const reg = AUTH.m === 'reg', page = $('#acct-dlg');
  page.dataset.m = AUTH.m;
  for (const b of page.querySelectorAll('.auth-seg [data-m]')) { const on = b.dataset.m === AUTH.m; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  $('#auth-h').textContent = reg ? 'Aramıza katıl' : 'Tekrar hoş geldin';
  $('#auth-sub').textContent = reg ? 'Bir ad ve şifre seç. Adın sana ayrılır, ilerlemen her cihazda seninle.' : 'Hesabına gir, kaldığın yerden devam et.';
  $('#acct-login').hidden = reg; $('#acct-reg').hidden = !reg;
  $('#auth-rules').hidden = !reg; $('#auth-meter').hidden = !reg; $('#auth-pw2-row').hidden = !reg; $('#auth-count').hidden = !reg;
  $('#acct-pw').autocomplete = reg ? 'new-password' : 'current-password';
  const alt = $('#auth-alt'); alt.replaceChildren(document.createTextNode(reg ? 'Zaten hesabın var mı? ' : 'Hesabın yok mu? '));
  const sw = el('button', '', reg ? 'Giriş yap' : 'Hemen oluştur'); sw.type = 'button'; sw.onclick = () => { authMode(reg ? 'login' : 'reg'); $('#acct-name').focus(); }; alt.append(sw);
  acctMsg(''); authCheck();
}
function authOpen(m) {
  const page = $('#acct-dlg');
  $('#acct-name').value = ($('#name').value || '').trim().slice(0, 16); $('#acct-pw').value = ''; $('#acct-pw2').value = '';
  let had = false; try { had = !!localStorage.getItem('kusatma-giris'); } catch (e) { /* ignore */ }
  authMode(m || (had ? 'login' : 'reg'));
  page.hidden = false; page.classList.remove('out'); document.body.classList.add('authing');
  try { if (!history.state || !history.state.auth) history.pushState({ auth: 1 }, ''); } catch (e) { /* ignore */ }
  authSquad();
  setTimeout(() => ($('#acct-name').value ? $('#acct-pw') : $('#acct-name')).focus({ preventScroll: true }), 60);
}
function authClose(fromPop) {
  const page = $('#acct-dlg'); if (page.hidden) return;
  page.classList.add('out'); document.body.classList.remove('authing');
  setTimeout(() => { page.hidden = true; page.classList.remove('out'); }, 220);
  if (!fromPop) { try { if (history.state && history.state.auth) history.back(); } catch (e) { /* ignore */ } }
}
addEventListener('popstate', () => { if (!$('#acct-dlg').hidden) authClose(true); });
// a few of the classes standing together under the logo
function authSquad() {
  const cv = $('#auth-squad'); if (!cv || cv.dataset.done) return; cv.dataset.done = '1';
  const g = cv.getContext('2d'), L = [['kalkanci', '#4cc9f0'], ['asker', '#ff8a3d'], ['doktor', '#43d17a'], ['tesla', '#9ad8ff'], ['nisanci', '#f15bb5']];
  L.forEach(([c, col], i) => { g.save(); g.translate(40 + i * 70, 74); g.scale(1.9, 1.9); try { drawCharacter(g, c, col, -Math.PI / 2 + (i - 2) * 0.12, 0, { alive: true }); } catch (e) { /* ignore */ } g.restore(); });
}
$('#btn-acct').onclick = () => {
  if (ACCT) { ask('Çıkış yap', 'Bu cihazda hesabından çıkılsın mı? İstediğin zaman tekrar girebilirsin.', 'Çıkış yap', async () => { await acctOut(); acctUi(); }); return; }
  authOpen();
};
$('#acct-close').onclick = () => authClose();
$('#auth-guest').onclick = () => authClose();
for (const b of document.querySelectorAll('#acct-dlg .auth-seg [data-m]')) b.onclick = () => { authMode(b.dataset.m); $('#acct-name').focus(); };
$('#acct-dlg .auth-seg').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { authMode(AUTH.m === 'reg' ? 'login' : 'reg'); $(`#auth-t-${AUTH.m}`).focus(); } });
$('#acct-dlg').addEventListener('keydown', (e) => { if (e.key === 'Escape') authClose(); });
for (const id of ['#acct-name', '#acct-pw', '#acct-pw2']) $(id).addEventListener('input', () => { if (!$('#acct-msg').classList.contains('info')) acctMsg(''); authCheck(); });
$('#acct-name').addEventListener('input', () => { const i = $('#acct-name'); if (AUTH.m === 'reg') { const v = i.value.replace(/[^A-Za-z0-9]/g, ''); if (v !== i.value) { i.value = v; authCheck(); const r = $('#auth-rules [data-r="chr"]'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); } } });
$('#auth-eye').onclick = () => { const on = $('#acct-pw').type === 'password'; for (const id of ['#acct-pw', '#acct-pw2']) $(id).type = on ? 'text' : 'password'; $('#auth-eye').setAttribute('aria-pressed', String(on)); $('#auth-eye').setAttribute('aria-label', on ? 'Şifreyi gizle' : 'Şifreyi göster'); };
function authShake() { const c = $('#auth-form'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
async function acctGo(op) {
  if (AUTH.busy) return;
  const name = $('#acct-name').value.trim(), pw = $('#acct-pw').value;
  if (op === 'reg') {
    if (!NAME_OK.test(name)) { acctMsg(name.length < 6 || name.length > 16 ? ACCT_WHY.name : ACCT_WHY.chars); authShake(); $('#acct-name').focus(); return; }
    if (pw.length < 6) { acctMsg(ACCT_WHY.pw); authShake(); $('#acct-pw').focus(); return; }
    if ($('#acct-pw2').value !== pw) { acctMsg('Şifreler aynı değil.'); authShake(); $('#acct-pw2').focus(); return; }
  } else if (!name || !pw) { acctMsg('Adını ve şifreni yaz.'); authShake(); return; }
  const go = $(op === 'reg' ? '#acct-reg' : '#acct-login');
  AUTH.busy = true; go.classList.add('busy'); go.disabled = true; acctMsg('');
  const j = await acctSign(op, name, pw);
  AUTH.busy = false; go.classList.remove('busy'); go.disabled = false;
  if (!j.ok) { acctMsg(ACCT_WHY[j.reason] || 'Bir sorun oldu. Tekrar dene.'); authShake(); return; }
  try { localStorage.setItem('kusatma-giris', '1'); } catch (e) { /* ignore */ }
  go.classList.add('done');
  setTimeout(() => { go.classList.remove('done'); authClose(); acctUi(); toast(op === 'reg' ? `Hesabın oluşturuldu. Hoş geldin, ${j.name}!` : `Hoş geldin, ${j.name}!`, 'good'); }, 420);
}
$('#auth-form').addEventListener('submit', (e) => { e.preventDefault(); const sub = e.submitter && e.submitter.id; acctGo(sub === 'acct-reg' ? 'reg' : sub === 'acct-login' ? 'login' : AUTH.m); });
// ---------- the signed-in player's full-page panel (js/dash.js) ----------
function dpShow() {
  const on = !!ACCT; document.body.classList.toggle('signed', on); $('#dashpage').hidden = !on;
  dashShow(on);
  if (!on && sceneGo) sceneGo();
}
function roomItems(rooms, max) {
  if (!rooms) return [el('li', 'empty', 'Odalar yüklenemedi.')];
  if (!rooms.length) return [el('li', 'empty', 'Şu an açık oda yok. Bir oda kur, burada görünsün.')];
  return rooms.slice(0, max).map((r) => {
    const li = el('li'), b = el('button', 'btn small', 'Katıl'); b.type = 'button';
    b.onclick = () => { $('#code').value = r.code; joinRoom(); };
    li.append(el('span', 'rc', r.code), el('span', 'rh', r.rn || r.name), el('span', 'rm', `${r.rn ? r.name + ' · ' : ''}${r.n}/${r.mx || MAX_PLAYERS} · ${r.st === 'lobby' ? 'lobide' : `${r.wave}. dalga`}${r.diff ? ' · ' + ((DIFFS[r.diff] || {}).name || '') : ''}`), b);
    if (r.n >= (r.mx || MAX_PLAYERS)) { b.disabled = true; b.textContent = 'Dolu'; }
    return li;
  });
}
dashInit({
  toast, ask, roomItems,
  solo: () => createRoom(true),
  daily: () => createRoom(true, { mode: 'daily' }),
  roomDlg: () => roomDlg(),
  join: (code) => { $('#code').value = code; joinRoom(); },
  openSettings: () => openSettings(),
  openDiag: () => openDiag(),
  signOut: () => $('#btn-acct').click(),
  signedOut: async () => { await acctOut(); acctUi(); },
  refresh: () => { acctUi(); dashRefresh(); },
});

// ---------- connection test ----------
let diagText = '';
async function openDiag() {
  $('#settings').hidden = true; $('#diag-dlg').hidden = false;
  $('#diag-copy').disabled = true; $('#diag-again').disabled = true; $('#diag-sum').textContent = 'Test ediliyor…';
  const list = $('#diag-list'); list.replaceChildren();
  const ICON = { ok: '✓', bad: '✕', warn: '!' };
  const draw = (rows) => {
    list.replaceChildren(...rows.map((r) => { const li = el('li', r.s); li.append(el('span', 'ic', ICON[r.s] || ''), el('span', '', r.t), el('span', 'dv', r.v)); return li; }));
    const run = el('li', 'run'); run.append(el('span', 'ic'), el('span', 'dt', 'Sıradaki kontrol…'), el('span', 'dv', '')); list.append(run);
  };
  const rows = await diagRun(draw);
  list.replaceChildren(...rows.map((r) => { const li = el('li', r.s); li.append(el('span', 'ic', ICON[r.s] || ''), el('span', '', r.t), el('span', 'dv', r.v)); return li; }));
  const bad = rows.filter((r) => r.s === 'bad'), apiOk = rows.some((r) => r.k.startsWith('api') && r.s === 'ok');
  $('#diag-sum').textContent = !bad.length ? 'Her şey çalışıyor.'
    : !apiOk ? 'Sunuculara ulaşılamıyor. İnternetini ya da ağının engellerini kontrol et; okul ağındaysan okul aynasını dene.'
    : bad.some((r) => r.k === 'peer') ? 'Oda servisine ulaşılamıyor; oda kurup katılmak çalışmayabilir.'
    : bad.some((r) => r.k === 'turn') && rows.some((r) => r.k === 'stun' && r.s !== 'ok') ? 'Ağın hem doğrudan bağlantıyı hem aktarmayı engelliyor; başka bir ağdan dene.'
    : 'Sunuculardan biri yanıt vermedi ama diğerleri çalışıyor, oyun yedek adresi kullanır.';
  diagText = `Kuşatma bağlantı testi · Yapı ${BUILD} · ${new Date().toLocaleString('tr')}\n` + rows.map((r) => `${ICON[r.s] || '·'} ${r.t}: ${r.v}`).join('\n') + `\n${navigator.userAgent}`;
  $('#diag-copy').disabled = false; $('#diag-again').disabled = false;
}
$('#settings-diag').onclick = openDiag;
$('#diag-again').onclick = openDiag;
$('#diag-close').onclick = () => { $('#diag-dlg').hidden = true; };
$('#diag-copy').onclick = async () => { try { await navigator.clipboard.writeText(diagText); toast('Rapor kopyalandı', 'good'); } catch (e) { toast('Kopyalanamadı', 'bad'); } };

// ---------- room settings popup: open (listed for signed-in players) or private ----------
let roomVis = 0;
function roomVisSet(v) { roomVis = v; for (const b of document.querySelectorAll('.vis-opt')) b.setAttribute('aria-pressed', String(+b.dataset.v === v)); }
function chipRow(box, items, cur, onPick) {
  box.replaceChildren(...items.map(([v, t, x]) => { const b = el('button', 'chip-opt', t); if (x) b.append(el('small', 'gem-x', x)); b.type = 'button'; b.setAttribute('aria-pressed', String(v === cur)); b.onclick = () => { for (const x of box.children) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); onPick(v); }; return b; }));
}
const ROOM = { map: 'meydan', diff: 'normal', mode: 'normal', max: MAX_PLAYERS };
try { Object.assign(ROOM, JSON.parse(localStorage.getItem('kusatma-oda') || '{}')); } catch (e) { /* ignore */ }
function roomDlg() {
  if (liveBlock()) { blockUi(); return; }
  if (nameTaken($('#name').value)) { menuMsg(TAKEN); return; }
  const pubOk = !!ACCT;
  document.querySelector('.vis-opt[data-v="1"]').disabled = !pubOk;
  roomVisSet(pubOk && PUB ? 1 : 0);
  $('#room-note').textContent = pubOk ? 'İstersen sonradan oda kodunu da paylaşabilirsin.' : 'Açık oda kurmak için hesap gerekir. Ana menüden Giriş yap.';
  chipRow($('#room-map'), [...MAP_ORDER.map((id) => [id, MAPS[id].name]), ['rastgele', 'Rastgele']], ROOM.map, (v) => { ROOM.map = v; });
  chipRow($('#room-diff'), DIFF_ORDER.map((id) => [id, DIFFS[id].name, gemTag(GEM_DIFF[id])]), ROOM.diff, (v) => { ROOM.diff = v; });
  const pvRow = () => { const on = ROOM.mode === 'pvp'; $('#room-pvp').hidden = !on; $('#room-diff').hidden = on; const dh = $('#room-diff').previousElementSibling; if (dh) dh.hidden = on; };
  chipRow($('#room-mode'), MODE_ORDER.concat('pvp').map((id) => [id, MODES[id].name, id === 'pvp' ? 'dereceli' : gemTag(GEM_MODE[id])]), MODE_ORDER.includes(ROOM.mode) || ROOM.mode === 'pvp' ? ROOM.mode : 'normal', (v) => { ROOM.mode = v; pvRow(); });
  chipRow($('#room-pvp'), PVP_ORDER.map((id) => [id, PVP[id].name]), PVP[ROOM.pv] ? ROOM.pv : 'tdm', (v) => { ROOM.pv = v; if (v === 'duel') { ROOM.max = 2; chipRow($('#room-max'), [[2, '2'], [4, '4'], [6, '6'], [8, '8'], [12, '12'], [16, '16'], [MAX_PLAYERS, String(MAX_PLAYERS)]], 2, (x) => { ROOM.max = x; }); } });
  pvRow();
  chipRow($('#room-max'), [[2, '2'], [4, '4'], [6, '6'], [8, '8'], [12, '12'], [16, '16'], [MAX_PLAYERS, String(MAX_PLAYERS)]], ROOM.max, (v) => { ROOM.max = v; });
  $('#room-name').value = ACCT ? (ROOM.name || '') : ''; $('#room-name-row').hidden = !ACCT;
  $('#room-dlg').hidden = false;
}
for (const b of document.querySelectorAll('.vis-opt')) b.onclick = () => roomVisSet(+b.dataset.v);
$('#room-close').onclick = () => { $('#room-dlg').hidden = true; };
$('#room-go').onclick = () => {
  $('#room-dlg').hidden = true;
  ROOM.name = ACCT ? $('#room-name').value.trim().slice(0, 24) : '';
  try { localStorage.setItem('kusatma-oda', JSON.stringify(ROOM)); } catch (e) { /* ignore */ }
  setPub(!!ACCT && roomVis === 1);
  createRoom(false, { map: ROOM.map, diff: ROOM.diff, mode: MODE_ORDER.includes(ROOM.mode) || ROOM.mode === 'pvp' ? ROOM.mode : 'normal', pv: PVP[ROOM.pv] ? ROOM.pv : 'tdm', max: ROOM.mode === 'pvp' && ROOM.pv === 'duel' ? 2 : ROOM.max, name: roomVis === 1 ? ROOM.name : '' });
};
acctUi();
acctCheck().then(() => { acctUi(); dashRefresh(); });

// ---------- live link to the owner's server ----------
const online = () => S.role && S.net && !(S.net instanceof OfflineNet);
function liveNews() {
  let b = $('#live-news');
  if (!b) { b = el('p', 'live-news'); b.id = 'live-news'; $('.menu-card').prepend(b); }
  b.textContent = LIVE.news.on ? LIVE.news.text : '';
  b.hidden = !(LIVE.news.on && LIVE.news.text);
}
// ---------- room invites: send to online friends, and the pop-up when a friend calls you ----------
function invDraw() {
  const ul = $('#inv-list'), L = frList().filter((f) => f.on);
  const here = new Set((S.roster ? S.roster.players : []).map((p) => p.name));
  ul.replaceChildren(...(L.length ? L.map((f) => {
    const li = el('li'); const cv = el('canvas'); drawAvatar(cv, f.eq || {}, { size: 36 });
    const tx = el('div'); tx.append(el('strong', '', f.name), el('span', '', f.room ? (f.room === (S.roster && S.roster.code) ? 'Bu odada' : 'Başka bir odada') : f.solo ? 'Tek başına oynuyor' : 'Menüde'));
    const b = el('button', 'btn small', here.has(f.name) ? 'Odada' : 'Davet'); b.type = 'button'; b.disabled = here.has(f.name);
    b.onclick = async () => { b.disabled = true; b.textContent = '…'; const j = await inviteSend(f.id); b.textContent = j.ok ? 'Gönderildi ✓' : 'Olmadı'; if (!j.ok) { b.disabled = false; toast({ off: `${f.name} şu an çevrimdışı.`, slow: 'Çok fazla davet. Biraz bekle.', room: 'Önce bir oda kur.' }[j.reason] || 'Davet gönderilemedi.', 'bad'); } };
    li.append(cv, tx, b); return li;
  }) : [el('li', 'empty', 'Şu an çevrimiçi arkadaşın yok.')]));
  const all = $('#inv-all'), can = L.filter((f) => !here.has(f.name));
  all.hidden = can.length < 2; all.textContent = `Hepsini davet et (${can.length})`;
  all.onclick = async () => { all.disabled = true; let n = 0; for (const f of can) { const j = await inviteSend(f.id); if (j.ok) n++; } all.disabled = false; toast(n ? `${n} arkadaşına davet gitti.` : 'Davet gönderilemedi.', n ? 'good' : 'bad'); for (const b of ul.querySelectorAll('button')) if (!b.disabled) { b.textContent = 'Gönderildi ✓'; b.disabled = true; } };
}
$('#btn-invite').onclick = () => { $('#inv-dlg').hidden = false; invDraw(); friendsGet().then((d) => { if (d) { onFriends(d); invDraw(); } }); };
$('#inv-close').onclick = () => { $('#inv-dlg').hidden = true; };
// invites stay on screen until answered (Katıl, Reddet or ×); several wait in line, newest first
let invNow = null;
const invQ = [];
function invShow() {
  const v = invQ[0]; invNow = v || null;
  if (!v) { $('#inv-pop').hidden = true; return; }
  drawAvatar($('#inv-pop-av'), v.eq || {}, { size: 48 });
  $('#inv-pop-t').textContent = `${v.f} seni odasına çağırıyor`;
  $('#inv-pop-s').textContent = `${v.rn ? v.rn + ' · ' : ''}${v.n || 1}/${v.mx || MAX_PLAYERS} oyuncu${S.role ? ' · Katılırsan bu oyundan çıkarsın' : ''}${invQ.length > 1 ? ` · ${invQ.length - 1} davet daha` : ''}`;
  const p = $('#inv-pop'); p.hidden = false; p.classList.remove('pulse'); void p.offsetWidth; p.classList.add('pulse');
}
function invIn(v) {
  if (!v.room || (S.roster && S.roster.code === v.room)) return;
  notify('inv', `${v.f} seni odasına çağırıyor`, v.rn ? `Oda: ${v.rn}` : `Oda kodu ${v.room}`);
  for (let i = invQ.length - 1; i >= 0; i--) if (invQ[i].room === v.room || invQ[i].f === v.f) invQ.splice(i, 1);
  invQ.unshift(v); if (invQ.length > 5) invQ.length = 5;
  invShow(); buzz([60, 40, 60]);
  sfx.waveClear && sfx.waveClear();
}
const invDone = () => { invQ.shift(); invShow(); };
$('#inv-no').onclick = invDone;
$('#inv-x').onclick = invDone;
$('#inv-yes').onclick = () => {
  const v = invQ.shift(); invQ.length = 0; invShow(); if (!v) return;
  if (S.role) leave('');
  $('#code').value = v.room; setTimeout(joinRoom, S.role ? 300 : 0);
};
// a shared room link (?oda=CODE) joins that room straight away
{ const q = new URLSearchParams(location.search), c = cleanCode(q.get('oda') || ''); if (c.length === CODE_LEN) { q.delete('oda'); const r = q.toString(); try { history.replaceState(history.state, '', location.pathname + (r ? '?' + r : '') + location.hash); } catch (e) { /* ignore */ } setTimeout(() => { $('#code').value = c; joinRoom(); }, 900); } }

function liveNote(title, text) {
  let b = $('#live-note');
  if (!b) {
    b = el('div', 'live-note'); b.id = 'live-note'; b.setAttribute('role', 'status');
    const x = el('button', 'ln-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Kapat');
    x.onclick = (e) => { e.stopPropagation(); b.hidden = true; };
    const head = el('div', 'ln-h'); head.append(el('strong', ''), x);
    b.append(head, el('p', ''));
    // a long note opens fully on a tap and then stays until closed
    b.onclick = () => { if (b.classList.contains('clip')) { b.classList.remove('clip'); b.classList.add('open'); clearTimeout(liveNote.t); } };
  }
  document.body.append(b);
  b.querySelector('strong').textContent = title;
  const p = b.querySelector('p'); p.textContent = text || ''; p.hidden = !text;
  b.classList.toggle('gift', /gönderdi|etkinli/i.test(title));
  b.classList.remove('open', 'clip'); b.hidden = false;
  requestAnimationFrame(() => b.classList.toggle('clip', !p.hidden && p.scrollHeight > p.clientHeight + 2));
  clearTimeout(liveNote.t); liveNote.t = setTimeout(() => { b.hidden = true; }, Math.min(14000, 5000 + (text || '').length * 50));
}
// ?spec=<peer>&k=<key>: the owner's hidden spectator view (opened from the panel); it never joins the live list
const WATCH = (() => { const q = new URLSearchParams(location.search), id = q.get('spec'), k = q.get('k'); return id && k && /^[a-z0-9-]{8,64}$/.test(id) && /^[A-Za-z0-9]{4,24}$/.test(k) ? { id, k } : null; })();
async function watchStart(w) {
  document.body.classList.add('watching'); document.body.classList.remove('signed');
  $('#getapp').hidden = true; $('#dashpage').hidden = true;
  show('menu'); menuMsg('İzleme bağlantısı kuruluyor…', true);
  const net = new ClientNet();
  try { await turnReady(addIce); await net.connect('', 20000, w.id); } catch (e) { menuMsg('Oyuna bağlanılamadı. Oyun bitmiş olabilir.'); return; }
  S.role = 'spec'; S.net = net; S.me = 0;
  S.game = new ClientGame(() => {}, 0); S.game.watcher = true; S.game.self.alive = false;
  net.onMsg = onMessage; net.onClose = () => { stopTicker(); cancelAnimationFrame(S.raf); S.raf = 0; S.role = null; show('menu'); menuMsg('Oyun bitti ya da bağlantı koptu.'); };
  net.send({ t: 'spec', k: w.k });
  startTicker();
}
if (WATCH) watchStart(WATCH);
if (!WATCH) liveStart({
  state: () => ({
    name: (S.roster && S.me && myEntry() ? myEntry().name : '') || $('#name').value.trim(),
    room: online() && S.roster ? S.roster.code || '' : '',
    mode: !S.role ? '' : online() ? S.role : 'solo',
    st: S.roster ? S.roster.ph : S.screen,
    wave: S.game ? S.game.wave || 0 : 0,
    n: S.roster ? S.roster.players.length : 0,
    cls: (myEntry() || {}).cls || '',
    rn: S.role === 'host' ? S.roomName || '' : '',
    mx: S.roster ? S.roster.max || MAX_PLAYERS : 0,
    df: S.roster ? S.roster.diff || '' : '',
    gm: S.roster && S.roster.mode !== 'normal' ? S.roster.mode || '' : '',
    ver: BUILD,
  }),
  onCfg: (shopChanged) => { if (S.host) S.host.badWords = LIVE.filter; acctUi(); dashTop(); liveNews(); if (shopChanged) dashSoft(); if (online() && LIVE.maint.on) leave(''); },
  onMsg: (t, title) => { notify('msg', title || 'Yöneticiden mesaj', t); liveNote(title || 'Yöneticiden mesaj', t); },
  onKick: (t) => { if (online()) leave('Yönetici seni oyundan çıkardı.' + (t ? ' Sebep: ' + t : '')); else liveNote('Yönetici', t || 'Oyundan çıkarıldın.'); },
  onEv: (k, n, t, x) => {
    if (S.host) S.host.adminEvent(k, n, x || {});
    if (t) liveNote('Duyuru', t);
  },
  detail: () => (S.host ? S.host.detail() : null),
  // the owner's panel asks to watch this game unseen: open a spectator door (solo games too) and say where it is
  onSpec: async (k) => {
    const h = S.host; if (!h) return '';
    if (!h.spec) { h.spec = new SpecHost(); h.spec.onJoin = (c) => { h.spec.sendTo(c, h.roster()); if (h.phase === 'combat' || h.phase === 'break') h.spec.sendTo(c, h.snapshot()); }; }
    h.spec.keys.add(k); if (h.spec.keys.size > 20) h.spec.keys.delete(h.spec.keys.values().next().value);
    return h.spec.open();
  },
  onGift: (name, n) => { if (S.host) S.host.adminGift(name, n); },
  onBan: () => { blockUi(); if (online()) leave(''); },
  onClv: (c, l, g) => { toast(`${(CLASSES[c] || {}).name || c} seviye ${l}! +${g} elmas`, 'good'); },
  onClan: () => { acctCheck().then(() => { if (/\/oyun\/klan\/?$/.test(location.pathname)) dashGo('clan'); }); },
  onCinv: (n, by) => { toast(`${by} seni ${n} klanına davet etti. Klan sayfasından katılabilirsin.`, 'good'); acctCheck(); },
  onPvp: (d) => { S.pvpRank = { rp: d.rp | 0, d: d.d | 0, up: !!d.up }; if (S.screen === 'over' && S.over && S.over.pvp) renderOver(); if (d.up) toast(`Yeni lig: ${league(d.rp).name}!`, 'good'); },
  onGem: (n, xp, cap) => {
    S.gameGems = (S.gameGems | 0) + n;
    dashTop();
    if (S.screen === 'game' || S.screen === 'lobby') gemPop(n, xp, cap);
  },
  onLevel: () => {},
  onRoad: (l, gm, it) => { toast(`Seviye ${l}! +${gm} elmas${it ? ' · Ödül: ' + COS[it].name : ''}`, 'gem'); notify('lvl', `Seviye ${l}!`, `+${gm} elmas${it ? ' · Ödül: ' + COS[it].name : ''}`, 'quests'); dashTop(); },
  onInv: (v) => invIn(v),
  onFriends: (d) => { onFriends(d); if (!$('#inv-dlg').hidden) invDraw(); },
  onDm: (m) => { if ($('#dm').hidden) notify('dm', `${m.n} sana yazdı`, m.x, 'friends'); onDm(m); },
  onFr: (k, n) => { notify('fr', k === 'acc' ? `${n} isteğini kabul etti` : `${n} arkadaşlık isteği gönderdi`, '', 'friends'); onFr(k, n); },
  onAcct: () => dashRefresh(),
  onGift2: (L) => { for (const g of L) { toast(`Hediye: +${g.n} elmas${g.text ? ' · ' + g.text : ''}`, 'gem'); notify('gift', `Hediye: +${g.n} elmas`, g.text || ''); } },
});
// gems from a cleared wave: a small pop under the wave banner
function gemPop(n, xp, cap) {
  const b = el('div', 'gem-pop');
  b.append(gemIcon(18), el('b', '', n ? `+${n}` : '+0'), el('span', '', `+${xp} XP${cap ? ' · günlük sınır doldu' : ''}`));
  document.body.append(b);
  setTimeout(() => b.remove(), 3200);
}

// For automated tests only: open the page with ?debug to expose state.
// only on a test machine: on the real site this would let anyone edit the game
if (new URLSearchParams(location.search).has('debug') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__kusatma = S;
window.__kusatmaReady = true;
// cookie choice: the banner on a first visit, and the settings window from the legal links
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.ck-open')) cookieSettings(); });
if (!WATCH) consentStart();
if (location.hash === '#cerez') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } setTimeout(cookieSettings, 400); }
// the Android app hides its loading screen as soon as the game has drawn its first screen
requestAnimationFrame(() => requestAnimationFrame(() => { try { if (window.KusatmaApp && window.KusatmaApp.ready) window.KusatmaApp.ready(); } catch (e) { /* ignore */ } }));
