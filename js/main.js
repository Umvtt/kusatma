// Screens, lobby, HUD and the glue between networking, the host simulation and the local game.
import { PING_K, GEAR, MAPS, MAP_ORDER, BUILD, VERSION, MAX_PLAYERS, CLASSES, CLASS_ORDER, CODE_LEN, clamp, APP_BUILD, league } from './config.js';
import { HostNet, OfflineNet, ClientNet, cleanCode, addIce, SpecHost, gunzip64 } from './net.js';
import { HostGame, cleanName } from './host.js';
import { ClientGame } from './client.js';
import { drawCharacter } from './render.js';
import { startScene } from './scene.js';
import { dashPage, dashGo, dashRefresh, dashSoft, dashTop, onFriends, onDm, onFr, gemIcon, notify, recentAdd, frList, drawAvatar } from './dash.js';
import { FREE_CLS, ITEMS as COS } from './catalog.js';
import * as sfx from './sfx.js';
import { voiceOn, voiceStop, voiceSync, voicePtt, voiceRate, voiceBitrate } from './voice.js';
import { perfStart, perfStop, perfFrame, perfSnap, perfRelay } from './perf.js';
import { consentStart, manage as cookieSettings } from './consent.js';
import { CTL, layoutInit } from './layout.js';
import { WORLD, setMap } from './world.js';
import { generateMap } from './mapgen.js';
import { SETTINGS, onSettings, setSetting, resetSettings, QUALITY, QORDER, QUAL } from './settings.js';
import { LIVE, ACCT, ME, liveStart, liveStat, livePerf, livePvp, liveBlock, acctCheck, roomsGet, nameTaken, turnReady, liveGameEnd, inviteSend, friendsGet, liveCheat, liveConn, liveChat, errorReports } from './live.js';
import { $, IS_TOUCH, S, busy, el, menuMsg, renderer, setZoom, sleep, toast, zoom } from './app.js';
import { TAKEN, acctUi, authClose, blockUi } from './acct.js';
import { buzz, notice, qaPop, quickPick, quickToggle, renderBoard, updateHud } from './hud.js';
import { closeEsc, openEsc, openSettings, syncSettingsLabels } from './esc.js';
import { addChat, closeChat, openChat } from './chat.js';
import { renderOver } from './over.js';
import { TAP_MS, setOpenMic, voiceOpenPref, voiceUi } from './voiceui.js';
import { renderLobby, roomDlg } from './lobby.js';
import { shopKey, shopTabStep } from './shop.js';

// ---------- helpers ----------
function show(screen) {
  S.screen = screen;
  for (const id of ['menu', 'lobby', 'over']) $('#' + id).hidden = id !== screen;
  $('#hud').hidden = screen !== 'game';
  document.body.classList.toggle('playing', screen === 'game');
  $('#touch').hidden = !(IS_TOUCH && screen === 'game');
  updateRotate();
  if (screen === 'menu' && sceneGo) sceneGo();
  if (screen !== 'game') { $('#board').hidden = true; $('#quick').hidden = true; if (S.game) { S.game.input.down = false; S.game.input.keys.clear(); } }
}
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
// this browser tab's id (kept across reloads of the same tab): a reload takes its place in the room back at once
const TAB_ID = (() => { try { let t = sessionStorage.getItem('kusatma-sekme'); if (!t || !/^[a-z0-9]{6,24}$/.test(t)) { t = (Math.random().toString(36).slice(2, 12) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 16); sessionStorage.setItem('kusatma-sekme', t); } return t; } catch (e) { return ''; } })();
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
    return false;
  }
  busy(false);
  menuMsg('');
  S.role = 'client';
  S.net = net;
  net.onMsg = onMessage;
  net.onClose = hostLost;
  S.name = name;
  net.send({ t: 'hello', v: VERSION, b: BUILD, name, ps: ACCT ? ME.pass : '', sid: TAB_ID });
  S.joinedAt = performance.now();
  startTicker();
  return true;
}
// ---------- quick play: the best open room of this build with space, or a solo game that starts at once ----------
let quickBusy = false;
async function quickPlay() {
  if (quickBusy || S.net) return;
  quickBusy = true;
  try {
    let pick = null;
    if (!liveBlock() && !nameTaken($('#name').value)) {
      menuMsg('Uygun oda aranıyor…', true); busy(true);
      let res = null; try { res = await Promise.race([roomsGet(), new Promise((r) => setTimeout(() => r(null), 4000))]); } catch (e) { res = null; }
      busy(false);
      const L = res && res.ok && Array.isArray(res.rooms) ? res.rooms : [];
      // only rooms still in their lobby: there you pick your class before the game starts (a running game would put you
      // straight in with whatever class you had)
      const rank = (r) => r.n * 10 - r.wave;
      pick = L.filter((r) => r.ver === BUILD && r.st === 'lobby' && r.gm !== 'pvp' && r.gm !== 'sandbox' && r.gm !== 'daily' && r.n < (r.mx || MAX_PLAYERS))
        .sort((a, b) => rank(b) - rank(a))[0] || null;
    }
    if (pick) { $('#code').value = pick.code; if (await joinRoom()) return; }
    if (S.net) return;
    // no room: a solo game whose lobby opens on the class picker (you start it with Hazırım)
    menuMsg('');
    await createRoom(true);
    if (S.net) { const tb = document.querySelector('.lobby-tabs button[data-lt="cls"]'); if (tb) tb.click(); toast(pick ? 'Odaya girilemedi: sınıfını seç ve tek başına başla.' : 'Açık oda yok: sınıfını seç, Hazırım\'a bas ve tek başına başla.'); }
  } finally { quickBusy = false; }
}
function leave(reason) {
  sfx.music('off');
  $('#lobby-tip').textContent = '';
  quickToggle(false);
  if (TUT.step >= 0) { TUT.step = -1; $('#tut').hidden = true; }
  if (voiceOn()) voiceStop();
  perfStop(); S.perfOn = false;
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
      net.send({ t: 'hello', v: VERSION, b: BUILD, name: S.name || '', rejoin: { pid: S.me, tok: S.tok }, ps: ACCT ? ME.pass : '', sid: TAB_ID });
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
      S.game.onlineGuest = S.role === 'client';
      break;
    case 'r': onRoster(m); break;
    case 's': if (S.game) { S.game.onSnap(m); if (S.perfOn && S.role === 'client') perfSnap(performance.now(), m); } break;
    case 'o': if (S.role === 'spec') { S.over = m; break; } if (S.roster && m.P) m.tm = m.time; if (S.roster) recentAdd(S.roster.players.filter((p) => p.pid !== S.me)); liveGameEnd(); perfStop(); S.perfOn = false; S.over = m; if (m.pvp) { S.pvpRank = null; if (S.role === 'host') livePvp(m); renderOver(); if (S.roster) route(); break; } m.record = saveBest(m.wave); liveStat(m.wave, S.role === 'host', ((m.P || []).find((x) => x.pid === S.me) || {}).kills, { cls: ((m.P || []).find((x) => x.pid === S.me) || {}).cls || '', map: m.theme || '', diff: m.diff || '', tm: m.time | 0, gm: S.roster ? S.roster.mode || 'normal' : 'normal', solo: S.role === 'host' && !online() ? 1 : 0 }); renderOver(); if (S.roster) route(); break;
    case 'c': addChat(m.pid, m.m); break;
    case 'bye': if (m.r !== 'left') liveConn({ r: ['kick', 'spam', 'full', 'version'].includes(m.r) ? m.r : 'kick', why: m.r || '', room: S.roster && S.roster.code, secs: S.joinedAt ? (performance.now() - S.joinedAt) / 1000 : 0 }); leave(BYE[m.r] || 'Odadan çıkarıldın.'); break;
    case 'bk': if (S.role === 'client') { if (typeof m.z === 'string' && m.z.length < 300000) gunzip64(m.z).then((j) => { const b = JSON.parse(j); if (b && typeof b === 'object') S.backup = b; }).catch(() => {}); else if (m.s && typeof m.s === 'object') S.backup = m.s; else if (typeof m.j === 'string' && m.j.length < 400000) { try { const b = JSON.parse(m.j); if (b && typeof b === 'object') S.backup = b; } catch (e) { /* ignore */ } } } break;
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
  if (m.ph === 'lobby' && prevPhase && prevPhase !== 'lobby') { renderer.clearDecals(); S.over = null; $('#lobby-tip').textContent = ''; }
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
// ---------- performance reports (js/perf.js): what the game was doing when a report goes out ----------
function perfCtx() {
  const g = S.game, r = S.roster, me = g && g.ps ? g.ps.get(S.me) : null;
  return {
    role: S.role === 'client' ? 'g' : online() ? 'h' : 's', map: WORLD.theme || '', w: g ? g.wave | 0 : 0, z: g ? g.zs.size : 0,
    pl: r && r.players ? r.players.length : 1, vo: voiceOn(), vb: voiceOn() ? voiceBitrate() : 0, q: QUAL.level + (SAVE.on ? '/saver' : ''),
    ping: S.role === 'client' && me ? me.ping | 0 : 0, links: S.role === 'host' && S.net && S.net.linkStats ? () => S.net.linkStats() : null,
  };
}
// a guest: is the link to the host direct or through the relay server? asked once per game from the connection's stats
function relayCheck() {
  if (S.role !== 'client' || !S.net || !S.net.conn) return;
  setTimeout(async () => {
    try {
      const pc = S.net.conn.peerConnection; if (!pc) return;
      const st = await pc.getStats(); let pair = null; const cands = new Map();
      st.forEach((x) => { if (x.type === 'candidate-pair' && x.state === 'succeeded' && (x.nominated || x.selected)) pair = x; if (x.type === 'local-candidate') cands.set(x.id, x); });
      const lc = pair && cands.get(pair.localCandidateId);
      perfRelay(lc ? (lc.candidateType === 'relay' ? 'relay' : 'direct') : '?');
    } catch (e) { /* ignore */ }
  }, 8000);
}
// ---------- game loop + HUD ----------
function startLoop() {
  if (S.raf) return;
  let last = performance.now();
  const frame = (now) => {
    S.raf = requestAnimationFrame(frame);
    // battery saver: every other frame on a 60 Hz screen (30 FPS), whatever the refresh rate
    if (SAVE.on && now - last < 30.3) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const g = S.game;
    if (!g || S.screen !== 'game') return;
    g.zoom = zoom;
    g.touch = IS_TOUCH;
    // the game runs in real time whatever the frame rate: a slow frame is played as several short steps
    // (it used to be cut to 1/20 s, so below 20 FPS you walked and shot in slow motion)
    for (let left = dt, n = 0; left > 1e-4 && n < 5; n++) { const step = Math.min(0.05, left); left -= step; g.lastStep = left <= 1e-4 || n === 4; g.update(step); } // inputs go out once per frame, on the last step
    renderer.draw(g, g.roster);
    perfTick(now);
    if (!S.perfOn) { S.perfOn = true; perfStart(perfCtx, livePerf); relayCheck(); }
    perfFrame(now);
    // the host's upload is struggling to keep a guest fed: voice steps down to a lighter rate until it recovers
    if (S.role === 'host' && S.net && S.net.struggling && voiceOn() && (S.vrT = (S.vrT || 0) - dt) <= 0) { S.vrT = 1; voiceRate(S.net.struggling() ? 12000 : 20000); }
    S.hudT -= dt;
    if (S.hudT <= 0) { S.hudT = 0.1; updateHud(); }
    for (const n of g.notices.splice(0)) notice(n);
  };
  S.raf = requestAnimationFrame(frame);
}
// ---------- graphics level: auto mode steps down when the frame rate drops and back up when there is room ----------
const PERF = { t0: 0, n: 0, ups: 0, cool: 0, good: 0, fps: 0 };
// where "auto" starts: a phone with little memory or few processor cores starts on low, other phones on medium
// (the auto mode still moves up or down from there as it measures the frame rate)
const DEVICE_Q = (() => {
  if (!IS_TOUCH) return 'high';
  const mem = navigator.deviceMemory || 0, cpu = navigator.hardwareConcurrency || 0;
  return (mem && mem <= 3) || (cpu && cpu <= 4) ? 'low' : 'med';
})();
function qApply() {
  let want = SETTINGS.quality === 'auto' ? (QUAL.auto || DEVICE_Q) : SETTINGS.quality;
  if (!QUALITY[want]) want = 'high';
  // the saver never runs the sharpest screen and halves the particles
  if (SAVE.on && want === 'high') want = 'med';
  QUAL.level = want; QUAL.parts = Math.round(QUALITY[want].parts * (SAVE.on ? 0.5 : 1));
  renderer.setQuality(QUAL.level);
}
// ---------- battery saver: on, off, or auto (battery at 20 % or less and not charging, or a phone that cannot keep up even on low) ----------
const SAVE = { on: false, bat: false, slow: 0, told: false };
function saverCalc() {
  const was = SAVE.on;
  SAVE.on = SETTINGS.saver === 'on' || (SETTINGS.saver === 'auto' && (SAVE.bat || SAVE.slow >= 2));
  document.body.classList.toggle('saver', SAVE.on);
  if (SAVE.on !== was) {
    PERF.t0 = 0; qApply();
    if (SAVE.on && SETTINGS.saver === 'auto' && !SAVE.told && S.screen === 'game') { SAVE.told = true; toast(SAVE.bat ? 'Pil azaldı: pil tasarrufu açıldı (30 FPS).' : 'Telefon zorlanıyor: pil tasarrufu açıldı (30 FPS).'); }
  }
  saverSync();
}
const SAVER_N = { off: 'Kapalı', auto: 'Otomatik', on: 'Açık' };
function saverSync() {
  for (const b of $('#set-saver').children) b.setAttribute('aria-checked', String(b.dataset.s === SETTINGS.saver));
  $('#set-saver-out').textContent = SETTINGS.saver === 'auto' ? `Otomatik · ${SAVE.on ? 'açık' : 'kapalı'}` : SAVER_N[SETTINGS.saver] || 'Otomatik';
}
for (const b of $('#set-saver').children) b.addEventListener('click', () => { setSetting('saver', b.dataset.s); saverCalc(); });
try {
  if (navigator.getBattery) navigator.getBattery().then((bt) => {
    const f = () => { SAVE.bat = !bt.charging && bt.level <= 0.2; saverCalc(); };
    bt.addEventListener('levelchange', f); bt.addEventListener('chargingchange', f); f();
  }).catch(() => {});
} catch (e) { /* ignore */ }
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
  if (document.hidden || (S.game && S.game.paused) || now < PERF.cool) return;
  if (SAVE.on) return;
  // a phone still under 38 FPS on the lowest level twice in a row gets the saver's steady 30 (auto only)
  if (IS_TOUCH && QUAL.level === 'low' && S.screen === 'game') { if (fps < 38) { SAVE.slow++; if (SAVE.slow >= 2) saverCalc(); } else if (SAVE.slow < 2) SAVE.slow = 0; }
  if (SETTINGS.quality !== 'auto') return;
  const i = QORDER.indexOf(QUAL.level);
  if (fps < 44 && i > 0) { QUAL.auto = QORDER[i - 1]; PERF.good = 0; PERF.cool = now + 6000; qApply(); }
  else if (fps > 57) { PERF.good++; if (PERF.good >= 3 && i < QORDER.length - 1 && PERF.ups < 2) { PERF.ups++; PERF.good = 0; QUAL.auto = QORDER[i + 1]; PERF.cool = now + 6000; qApply(); } }
  else PERF.good = 0;
}
qApply();
onSettings(() => saverCalc());
$('#fps').hidden = !SETTINGS.fps;
onSettings(() => { qApply(); $('#fps').hidden = !SETTINGS.fps; });
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
  // quick messages: Z opens the menu, 1–7 pick while it is open; G pings where you aim
  if (e.code === 'KeyZ' && !e.repeat && S.screen === 'game' && S.roster && S.roster.code) { quickToggle(); return; }
  if (!$('#quick').hidden && /^(Digit|Numpad)[1-7]$/.test(e.code)) { quickPick(Number(e.code.slice(-1)) - 1); return; }
  if (e.code === 'KeyG' && !e.repeat && S.screen === 'game' && S.game && S.roster && S.roster.code) { S.game.quick(PING_K); return; }
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
$('#btn-quick').addEventListener('click', quickPlay);
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
// the main menu: a live battle behind it and the eight classes up front
var sceneGo = null;
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
// inside an older app: an ordinary (not required) update is offered with a Güncelle button. It opens the phone's browser
// (a link without the trailing slash is not one of the app's own addresses, so the app hands it to the browser),
// where the download page waits; nothing blocks playing.
const APP_V = (() => { try { return IN_APP && window.KusatmaApp && typeof window.KusatmaApp.version === 'function' ? +window.KusatmaApp.version() || 0 : 0; } catch (e) { return 0; } })();
const appOld = () => IN_APP && APP_V > 0 && APP_V < APP_BUILD;
const APP_UPD = 'https://umvtt.github.io/kusatma?guncelle=2';
if (appOld()) { const b = $('#btn-apk'); b.href = APP_UPD; b.removeAttribute('download'); b.querySelector('.lbl-long').textContent = `Güncelle (${APP_BUILD}.0)`; b.querySelector('.lbl-short').textContent = 'Güncelle'; b.hidden = false; }
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
  if (/[?&]guncelle=[12]/.test(location.search)) {
    const must = /[?&]guncelle=1/.test(location.search);
    $('#getapp').hidden = false; $('.ga-h').textContent = must ? 'Önemli güncelleme' : `Yeni sürüm: ${APP_BUILD}.0`; $('#ga-dl').textContent = 'Güncelle';
    $('.ga-list').replaceChildren(el('li', '', must ? 'Uygulamanın yeni sürümü gerekiyor' : 'İstersen güncelle; eski sürümle de oynamaya devam edebilirsin'), el('li', '', 'Hesabın ve ilerlemen aynı kalır'), el('li', '', 'Eskisini silmene gerek yok, üstüne kurulur'));
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
$('#set-music').addEventListener('input', (e) => { setSetting('music', Number(e.target.value)); syncSettingsLabels(); });
$('#set-darkness').addEventListener('input', (e) => { setSetting('darkness', Number(e.target.value)); syncSettingsLabels(); });
$('#set-zoom').addEventListener('input', (e) => { setZoom(Number(e.target.value) / 100); syncSettingsLabels(); });
$('#set-shake').addEventListener('change', (e) => setSetting('shake', e.target.checked));
$('#set-dmgnums').addEventListener('change', (e) => setSetting('dmgNums', e.target.checked));
$('#set-lead').addEventListener('change', (e) => setSetting('lead', e.target.checked));
$('#settings-reset').addEventListener('click', () => { resetSettings(); setZoom(IS_TOUCH ? 0.85 : 1); openSettings(); });
onSettings((st) => { sfx.setVolume(st.volume / 100); sfx.setMusicVolume(st.music / 100); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#settings').hidden) { e.stopImmediatePropagation(); $('#settings').hidden = true; } }, { capture: true });
// ---------- phone controls ----------
function stick(elm, onMove, zone) {
  const knob = elm.querySelector('i');
  let id = null;
  const at = (e) => {
    const r = elm.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    knob.style.transform = `translate(${x * elm.offsetWidth * 0.32}px, ${y * elm.offsetHeight * 0.32}px)`;
    onMove(x, y);
  };
  // a free joystick centres itself wherever the thumb lands on the left side
  const down = (e, from) => {
    // a second finger on the same stick takes it over; a lost touch never leaves the stick stuck
    e.preventDefault(); sfx.unlock(); id = e.pointerId;
    if (zone && CTL.free) {
      const h = elm.offsetWidth / 2;
      elm.style.setProperty('--fx', clamp(e.clientX, h + 4, innerWidth - h - 4) + 'px');
      elm.style.setProperty('--fy', clamp(e.clientY, h + 4, innerHeight - h - 4) + 'px');
      elm.classList.add('held');
    }
    try { from.setPointerCapture(id); } catch (err) { /* ignore */ }
    at(e);
  };
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; elm.classList.remove('held'); onMove(0, 0); };
  elm.addEventListener('pointerdown', (e) => down(e, elm));
  if (zone) zone.addEventListener('pointerdown', (e) => down(e, zone));
  for (const t of zone ? [elm, zone] : [elm]) {
    t.addEventListener('pointermove', (e) => { if (e.pointerId === id) at(e); });
    t.addEventListener('pointerup', end);
    t.addEventListener('pointercancel', end);
    t.addEventListener('lostpointercapture', end);
  }
}
layoutInit({ S, renderer, touch: IS_TOUCH });
stick($('#stick-move'), (x, y) => { if (S.game) S.game.input.tmove = { x, y }; }, $('#zone-move'));
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
errorReports(BUILD);
$('#f-cls').textContent = CLASS_ORDER.length;
$('#f-max').textContent = MAX_PLAYERS;
$('#f-maps').textContent = MAP_ORDER.length;
// a short logo intro on the first visit of a session (not in the app, which has its own splash, nor for links that join or watch)
try {
  const q = new URLSearchParams(location.search);
  if (!window.KusatmaApp && !q.has('spec') && !q.has('oda') && !sessionStorage.getItem('kusatma-intro') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sessionStorage.setItem('kusatma-intro', '1');
    const it = $('#intro'); it.hidden = false; setTimeout(() => { it.remove(); }, 1950);
  } else $('#intro').remove();
} catch (e) { $('#intro').remove(); }
$('#set-build').textContent = `Kuşatma · Yapı ${BUILD}`;
show('menu');
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
  // online friends first; offline ones can be called too (their phone gets a notice that joins the room when tapped)
  const ul = $('#inv-list'), all0 = frList(), L = all0.filter((f) => f.on).concat(all0.filter((f) => !f.on).slice(0, 20));
  const here = new Set((S.roster ? S.roster.players : []).map((p) => p.name));
  ul.replaceChildren(...(L.length ? L.map((f) => {
    const li = el('li'); const cv = el('canvas'); drawAvatar(cv, f.eq || {}, { size: 36 });
    const tx = el('div'); tx.append(el('strong', '', f.name), el('span', '', !f.on ? 'Çevrimdışı · telefonuna bildirim gider' : f.room ? (f.room === (S.roster && S.roster.code) ? 'Bu odada' : 'Başka bir odada') : f.solo ? 'Tek başına oynuyor' : 'Menüde'));
    const b = el('button', 'btn small', here.has(f.name) ? 'Odada' : 'Davet'); b.type = 'button'; b.disabled = here.has(f.name);
    b.onclick = async () => { b.disabled = true; b.textContent = '…'; const j = await inviteSend(f.id); b.textContent = j.ok ? (j.reason === 'push' ? 'Bildirim gitti ✓' : 'Gönderildi ✓') : 'Olmadı'; if (!j.ok) { b.disabled = false; toast({ off: `${f.name} çevrimdışı ve telefon bildirimi açık değil.`, slow: 'Çok fazla davet. Biraz bekle.', room: 'Önce bir oda kur.' }[j.reason] || 'Davet gönderilemedi.', 'bad'); } };
    li.append(cv, tx, b); return li;
  }) : [el('li', 'empty', 'Henüz arkadaşın yok.')]));
  const all = $('#inv-all'), can = L.filter((f) => f.on && !here.has(f.name));
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
  onQa: (L) => { ME.qn = (ME.qn | 0) + L.length; qaPop(L); },
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
if (new URLSearchParams(location.search).has('debug') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { window.__kusatma = S; S.renderer = renderer; }
window.__kusatmaReady = true;
// cookie choice: the banner on a first visit, and the settings window from the legal links
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.ck-open')) cookieSettings(); });
if (!WATCH) consentStart();
if (location.hash === '#cerez') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } setTimeout(cookieSettings, 400); }
// the Android app hides its loading screen as soon as the game has drawn its first screen
requestAnimationFrame(() => requestAnimationFrame(() => { try { if (window.KusatmaApp && window.KusatmaApp.ready) window.KusatmaApp.ready(); } catch (e) { /* ignore */ } }));

export { AIM_N, APP_UPD, APP_V, BYE, DEVICE_Q, GAME_KEYS, IN_APP, NAME_OK, PERF, SAVE, SAVER_N, TAB_ID, TUT, WATCH, aimSync, appOld, asciiName, becomeHost, createRoom, cv, gaDone, gemPop, getName, hashCode, hostLost, invDone, invDraw, invIn, invNow, invQ, invShow, joinRoom, leave, liveNews, liveNote, myEntry, onMessage, onRoster, online, perfCtx, perfTick, qApply, qSync, quickBusy, quickPlay, reconnect, relayCheck, route, saveBest, saverCalc, saverSync, sceneGo, send, setMute, show, showBest, startLoop, startTicker, stick, stopTicker, tutDone, tutEnd, tutSteps, tutTick, updateRotate, vKeyAt, watchStart };
