import { statsOk, onConsent } from './consent.js';
import { ITEMS, cleanEq, nkey } from './catalog.js';
export { nkey };
// Live link to the owner's server: news, maintenance, messages, kicks and bans from the admin panel,
// plus who is online and how far games get. Tries each address in turn (some networks block one of them).
let ADDRS = ['wss://kusatma-api.umvtt.deno.net', 'wss://kusatma-api.umvtt.workers.dev', 'wss://kusatma-api.pages.dev'];
// local tests only: point the game at a test server
try { const t = new URLSearchParams(location.search).get('api'); if (t && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /^ws:\/\/(localhost|127\.0\.0\.1):\d+$/.test(t)) ADDRS = [t]; } catch (e) { /* ignore */ }
const BAN_KEY = 'kusatma-ban';
const HTTP = ADDRS.map((a) => a.replace(/^ws(s?):/, 'http$1:'));
let dev = '';
try {
  dev = localStorage.getItem('kusatma-cihaz') || '';
  if (!/^[a-f0-9]{16}$/.test(dev)) {
    dev = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('kusatma-cihaz', dev);
  }
} catch (e) { dev = dev || 'f'.repeat(16); }

export const LIVE = { news: { on: false, text: '' }, maint: { on: false, text: '' }, ban: null, names: [], shop: null, filter: [], on: 0 };
export let ACCT = null;
export const ME = { qn: 0, best: 0, kills: 0, games: 0, mins: 0, gems: 0, xp: 0, lvl: 1, lx: 0, ln: 100, own: [], eq: {}, set: { fr: 1, on: 1, room: 1 }, pass: '', dl: false, fq: [], un: 0, made: 0, hideLb: false, gd: 0, mute: 0 };
export let PUB = true;
try { PUB = localStorage.getItem('kusatma-pub') !== '0'; } catch (e) { /* ignore */ }
export function setPub(v) { PUB = !!v; try { localStorage.setItem('kusatma-pub', PUB ? '1' : '0'); } catch (e) { /* ignore */ } last = ''; if (H) hi(true); }
const NUMS = ['spn', 'spt', 'best', 'kills', 'games', 'mins', 'gems', 'xp', 'lvl', 'lx', 'ln', 'made', 'un', 'gd', 'mute', 'qn'];
const keepMe = (j) => {
  for (const k of NUMS) if (k in j) ME[k] = Math.max(0, +j[k] || 0);
  if (Array.isArray(j.own)) ME.own = j.own.filter((x) => typeof x === 'string').slice(0, 300);
  if (j.eq && typeof j.eq === 'object') ME.eq = cleanEq(j.eq);
  if (j.set && typeof j.set === 'object') ME.set = { fr: j.set.fr ? 1 : 0, on: j.set.on ? 1 : 0, room: j.set.room ? 1 : 0, pn: j.set.pn && typeof j.set.pn === 'object' ? Object.fromEntries(['dm', 'fr', 'inv', 'clan', 'news'].map((k) => [k, j.set.pn[k] === 0 ? 0 : 1])) : {}, qh: Array.isArray(j.set.qh) && j.set.qh.length === 2 ? [j.set.qh[0] | 0, j.set.qh[1] | 0] : null };
  if (typeof j.pass === 'string') ME.pass = j.pass.slice(0, 4000);
  if ('dl' in j) ME.dl = !!j.dl;
  ME.ls = Math.max(0, Math.min(7, j.ls | 0)); if (Array.isArray(j.lsm) && j.lsm.length === 7) ME.lsm = j.lsm.map((x) => +x || 1);
  if ('bio' in j) ME.bio = String(j.bio || '').slice(0, 120);
  if (Array.isArray(j.show)) ME.show = j.show.map((x) => String(x).slice(0, 4)).slice(0, 3);
  if (j.cx && typeof j.cx === 'object') { ME.cx = {}; for (const [k, v] of Object.entries(j.cx)) if (/^[a-z]{2,12}$/.test(k)) ME.cx[k] = Math.max(0, v | 0); }
  if (Array.isArray(j.bdg)) ME.bdg = j.bdg.filter((x) => typeof x === 'string').map((x) => x.slice(0, 4)).slice(0, 40);
  if ('clan' in j) ME.clan = j.clan && typeof j.clan === 'object' ? { id: String(j.clan.id || '').slice(0, 12), tag: String(j.clan.tag || '').slice(0, 4) } : null;
  if (Array.isArray(j.cinv)) ME.cinv = j.cinv.slice(0, 10).map((x) => ({ c: String(x.c || '').slice(0, 12), n: String(x.n || '').slice(0, 20), t: String(x.t || '').slice(0, 4), by: String(x.by || '').slice(0, 16) }));
  if (j.pvp && typeof j.pvp === 'object') { const v = j.pvp, n = (x) => Math.max(0, x | 0); ME.pvp = { rp: n(v.rp), w: n(v.w), l: n(v.l), dr: n(v.dr), k: n(v.k), dt: n(v.dt), m: n(v.m), best: n(v.best), last: v.last && typeof v.last === 'object' ? { lg: Math.min(4, n(v.last.lg)), rp: n(v.last.rp), cl: v.last.cl ? 1 : 0, s: String(v.last.s || '').slice(0, 7) } : null }; }
  if (j.spin && typeof j.spin === 'object') ME.spin = { free: !!j.spin.free, n: Math.max(0, j.spin.n | 0) };
  if ('dc' in j) ME.dc = j.dc && typeof j.dc === 'object' ? { w: Math.max(0, j.dc.w | 0), k: Math.max(0, j.dc.k | 0) } : null;
  if ('dcc' in j) ME.dcc = String(j.dcc || '').slice(0, 10);
  if ('end' in j) ME.end = Math.max(0, j.end | 0);
  if ('hideLb' in j) ME.hideLb = !!j.hideLb;
  if (Array.isArray(j.fq)) ME.fq = j.fq.slice(0, 50).map((q) => ({ id: str(q.id, 12), name: str(q.name, 16) }));
  if (j.shop) LIVE.shop = cleanShop(j.shop);
  try { localStorage.setItem('kusatma-ben', JSON.stringify(ME)); } catch (e) { /* ignore */ }
};
function cleanShop(s) {
  if (!s || typeof s !== 'object') return null;
  const p = {};
  for (const [k, v] of Object.entries(s.p || {})) if (ITEMS[k]) p[k] = Math.max(0, v | 0);
  const lim = {};
  for (const [k, v] of Object.entries(s.lim || {})) if (ITEMS[k]) lim[k] = +v || 0;
  const o = {};
  for (const [k, v] of Object.entries(s.o || {})) if (ITEMS[k]) o[k] = Math.max(0, v | 0);
  return { p, o, lim, feat: ITEMS[s.feat] ? s.feat : '', mul: [1, 1.5, 2, 3].includes(+s.mul) ? +s.mul : 1, until: +s.until || 0, saleAll: Math.max(0, Math.min(90, s.saleAll | 0)), saleUntil: +s.saleUntil || 0, login: s.login | 0, ren: s.ren | 0, cap: s.cap | 0, spinP: s.spinP == null ? 100 : Math.max(0, s.spinP | 0), spinMax: s.spinMax == null ? 5 : Math.max(0, s.spinMax | 0) };
}
try { const a = JSON.parse(localStorage.getItem('kusatma-hesap') || 'null'); if (a && /^[a-f0-9]{64}$/.test(a.tk)) ACCT = { tk: a.tk, name: String(a.name || '').slice(0, 16), id: String(a.id || '') }; } catch (e) { /* ignore */ }
try { const b = localStorage.getItem(BAN_KEY); if (b !== null) LIVE.ban = b; } catch (e) { /* ignore */ }

// what the player is on, for the owner's panel (no personal data: platform, browser, screen)
const UA = navigator.userAgent || '';
const DV = (() => {
  const app = (UA.match(/KusatmaApp\/(\d+)/) || [])[1];
  const p = /Android/i.test(UA) ? 'Android' : /iPhone|iPad|iPod/i.test(UA) ? 'iOS' : /Windows/i.test(UA) ? 'Windows' : /Mac OS X/i.test(UA) ? 'Mac' : /CrOS/i.test(UA) ? 'ChromeOS' : /Linux/i.test(UA) ? 'Linux' : 'Diğer';
  const os = (UA.match(/Android [\d.]+/) || UA.match(/OS [\d_]+ like Mac/) || UA.match(/Windows NT [\d.]+/) || [''])[0].replace(/_/g, '.').replace(' like Mac', '');
  const b = app ? 'Uygulama' : /Edg\//.test(UA) ? 'Edge ' + (UA.match(/Edg\/(\d+)/) || [])[1] : /OPR\//.test(UA) ? 'Opera' : /SamsungBrowser/.test(UA) ? 'Samsung' : /Firefox\//.test(UA) ? 'Firefox ' + (UA.match(/Firefox\/(\d+)/) || [])[1] : /Chrome\//.test(UA) ? 'Chrome ' + (UA.match(/Chrome\/(\d+)/) || [])[1] : /Safari\//.test(UA) ? 'Safari' : 'Tarayıcı';
  const c = navigator.connection || {};
  return { p, os, b, app: app | 0, w: screen.width | 0, h: screen.height | 0, dpr: window.devicePixelRatio || 1, tc: 'ontouchstart' in window ? 1 : 0, lang: navigator.language || '', mem: navigator.deviceMemory | 0, cpu: navigator.hardwareConcurrency | 0, net: c.effectiveType || '', tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })() };
})();
// coarse device type for the owner's live list (no personal data; kept only while connected)
const PF = DV.app ? 'app' : DV.tc && Math.min(DV.w, DV.h) < 600 ? 'phone' : DV.tc && /Android|iOS/.test(DV.p) ? 'tablet' : 'pc';
export const deviceLine = () => `${DV.p}${DV.os ? ' · ' + DV.os : ''} · ${DV.b}`;
let ws = null, idx = 0, delay = 3000, last = '', H = null, ping = 0;
// a new cookie choice goes to the server with the next hello
onConsent(() => { last = ''; if (H) hi(true); });

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
function cleanCfg(c) {
  c = c && typeof c === 'object' ? c : {};
  const n = c.news || {}, m = c.maint || {};
  return { news: { on: !!n.on, text: str(n.text, 200) }, maint: { on: !!m.on, text: str(m.text, 200) } };
}

function send(o) { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(o)); } catch (e) { /* ignore */ } }

function hi(force) {
  const s = H.state();
  const m = { e: 'hi', dev, name: str(s.name, 16), room: str(s.room, 6), mode: s.mode || '', st: str(s.st, 8), wave: s.wave | 0, n: s.n | 0, ver: s.ver | 0, cls: str(s.cls, 12), tk: ACCT ? ACCT.tk : '', bn: LIVE.ban !== null ? 1 : 0, pub: PUB ? 1 : 0, dv: statsOk() ? DV : null, cs: statsOk() ? 1 : 0, pf: PF, rn: str(s.rn, 24), mx: s.mx | 0, df: str(s.df, 12), gm: str(s.gm, 8) };
  const j = JSON.stringify(m);
  if (force || j !== last) { last = j; send(m); }
}

function onData(raw) {
  let d; try { d = JSON.parse(raw); } catch (e) { return; }
  if (!d || typeof d !== 'object') return;
  if (d.e === 'cfg') { const c = cleanCfg(d.cfg); LIVE.news = c.news; LIVE.maint = c.maint; LIVE.names = Array.isArray(d.cfg && d.cfg.names) ? d.cfg.names.slice(0, 5000).map((x) => str(x, 24)) : []; LIVE.filter = Array.isArray(d.cfg && d.cfg.filter) ? d.cfg.filter.slice(0, 400).map((x) => str(x, 24)).filter(Boolean) : []; const shop0 = JSON.stringify(LIVE.shop || null); if (d.cfg && d.cfg.shop) LIVE.shop = cleanShop(d.cfg.shop); LIVE.on = Math.max(0, Math.min(1e6, (d.cfg && d.cfg.on) | 0)); H.onCfg(JSON.stringify(LIVE.shop || null) !== shop0); }
  else if (d.e === 'rooms') { if (roomsWait) roomsWait(cleanRooms(d.L)); }
  else if (d.e === 'clv') { if (Array.isArray(d.L)) for (const r of d.L.slice(0, 20)) { ME.gems += r.g | 0; if (H.onClv) H.onClv(String(r.c || '').slice(0, 12), r.l | 0, r.g | 0); } }
  else if (d.e === 'clan') { if (H.onClan) H.onClan(); }
  else if (d.e === 'cinv') { sysNotify('Klan daveti', `${str(d.by, 16)} seni ${str(d.n, 20)} klanına çağırıyor.`, 'clan'); if (H.onCinv) H.onCinv(str(d.n, 20), str(d.by, 16)); }
  else if (d.e === 'pvp') { ME.gems += Math.max(0, d.g | 0); ME.pvp = Object.assign({}, ME.pvp || {}, { rp: d.rp | 0 }); if (H.onPvp) H.onPvp(d); }
  else if (d.e === 'gem') { const n = Math.max(0, d.n | 0); ME.gems += n; ME.gd += n; addXp(Math.max(0, d.xp | 0)); if (H.onGem) H.onGem(n, d.xp | 0, !!d.cap); }
  else if (d.e === 'fl') { if (H.onFriends) H.onFriends(cleanFl(d)); }
  else if (d.e === 'dm') { sysNotify(str(d.n, 16), str(d.x, 120), 'dm'); if (H.onDm) H.onDm({ f: str(d.f, 12), n: str(d.n, 16), x: str(d.x, 200), t: +d.t || Date.now() }); }
  else if (d.e === 'dmh') { const w = DMW.get(str(d.w, 12)); if (w) { DMW.delete(str(d.w, 12)); w(d.ok ? cleanMsgs(d.L) : null); } }
  else if (d.e === 'dmok') { const w = DMW.get('c' + (d.c | 0)); if (w) { DMW.delete('c' + (d.c | 0)); w(d); } }
  else if (d.e === 'lvl') { if (Array.isArray(d.L)) for (const r of d.L.slice(0, 20)) { ME.gems += r.g | 0; if (r.it && ITEMS[r.it] && !ME.own.includes(r.it)) ME.own.push(r.it); if (H.onRoad) H.onRoad(r.l | 0, r.g | 0, ITEMS[r.it] ? r.it : ''); } }
  else if (d.e === 'inv') { sysNotify('Oda daveti', `${str(d.f, 16)} seni odasına çağırıyor.`, 'inv'); if (H.onInv) H.onInv({ fid: str(d.fid, 12), f: str(d.f, 16), room: str(d.room, 6).toUpperCase().replace(/[^A-Z0-9]/g, ''), rn: str(d.rn, 24), n: d.n | 0, mx: d.mx | 0, eq: d.eq && typeof d.eq === 'object' ? cleanEq(d.eq) : {} }); }
  else if (d.e === 'invok') { const w = DMW.get('i' + str(d.to, 12)); if (w) { DMW.delete('i' + str(d.to, 12)); w(d); } }
  else if (d.e === 'fr') { if (d.k !== 'acc') sysNotify('Arkadaşlık isteği', `${str(d.n, 16)} seni arkadaş olarak eklemek istiyor.`, 'fr'); if (H.onFr) H.onFr(d.k === 'acc' ? 'acc' : 'req', str(d.n, 16)); }
  else if (d.e === 'msg') { H.onMsg(str(d.text, 300), str(d.title, 120)); msgReceipt(str(d.mid, 12)); }
  else if (d.e === 'kick') H.onKick(str(d.text, 200));
  else if (d.e === 'ban') { LIVE.ban = str(d.text, 120); try { localStorage.setItem(BAN_KEY, LIVE.ban); } catch (e) { /* ignore */ } H.onBan(); }
  else if (d.e === 'ev') H.onEv(['boss', 'gold', 'horde', 'mev', 'item', 'zombie'].includes(d.k) ? d.k : 'gold', d.n | 0, str(d.text, 120), { who: str(d.who, 16), i: d.i | 0, t: d.t | 0, q: str(d.q, 8) });
  else if (d.e === 'gift') H.onGift(str(d.name, 16), d.n | 0);
  else if (d.e === 'acct') acctCheck().then(() => { H.onCfg(); if (H.onAcct) H.onAcct(); });
  else if (d.e === 'watch') { const r = H.detail(); if (r) send({ e: 'rd', d: r }); }
  else if (d.e === 'spec') { const k = str(d.k, 24); if (k && H.onSpec) H.onSpec(k).then((id) => { if (id) send({ e: 'specok', k, id: str(id, 64) }); }).catch(() => {}); }
  else if (d.e === 'qa') { if (Array.isArray(d.L) && H.onQa) H.onQa(d.L.slice(0, 6).map((q) => ({ k: ['q', 'w', 'a'].includes(q.k) ? q.k : 'q', t: str(q.t, 8), id: str(q.id, 4), s: str(q.s, 10), n: q.n | 0, g: q.g | 0, c: str(q.c, 12) }))); }
  else if (d.e === 'unban') { LIVE.ban = null; try { localStorage.removeItem(BAN_KEY); } catch (e) { /* ignore */ } H.onCfg(); }
}

function connect() {
  let s;
  try { s = new WebSocket(ADDRS[idx] + '/klive'); } catch (e) { retry(); return; }
  ws = s;
  let opened = false;
  s.onopen = () => { opened = true; delay = 3000; hi(true); const q = cnQ.splice(0).concat(ERR.q.splice(0)); for (const m of q) send(m); };
  s.onmessage = (e) => { if (typeof e.data === 'string' && e.data !== 'pong') onData(e.data); };
  s.onclose = () => { if (ws !== s) return; ws = null; if (!opened) idx = (idx + 1) % ADDRS.length; retry(); };
  s.onerror = () => { try { s.close(); } catch (e) { /* ignore */ } };
}
function retry() { setTimeout(connect, delay); delay = Math.min(delay * 2, 60000); }

// hooks: state() -> {name, room, mode, st, wave, n, ver}; onCfg(); onMsg(text); onKick(text); onBan(); onEv(kind, n, text); detail()
export function liveStart(hooks) {
  H = hooks;
  connect();
  setInterval(() => hi(false), 4000);
  clearInterval(ping);
  ping = setInterval(() => { if (ws && ws.readyState === 1) try { ws.send('ping'); } catch (e) { /* ignore */ } }, 25000);
}

// ---------- optional accounts ----------
let httpIdx = 0;
async function api(path, body, wait) {
  for (let i = 0; i < HTTP.length; i++) {
    const k = (httpIdx + i) % HTTP.length;
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), wait || 9000);
      const r = await fetch(HTTP[k] + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal } : { signal: ac.signal });
      clearTimeout(to);
      const j = await r.json();
      httpIdx = k;
      return j;
    } catch (e) { /* try the next address */ }
  }
  return { ok: false, reason: 'net' };
}
function keepAcct(a) {
  ACCT = a;
  try { if (a) localStorage.setItem('kusatma-hesap', JSON.stringify(a)); else localStorage.removeItem('kusatma-hesap'); } catch (e) { /* ignore */ }
  last = ''; if (H) hi(true);
}
export async function acctSign(op, name, pw) {
  // slow connections get more time; when a sign-up went through but its answer was lost, the retry on the next
  // address says "taken": the same name and password then sign in, because that account is this player's
  let j = await api('/kacct', { op, name, pw, dev, p: deviceLine() }, 15000);
  if (op === 'reg' && !j.ok && j.reason === 'taken') {
    const l = await api('/kacct', { op: 'login', name, pw, dev, p: deviceLine() }, 15000);
    if (l.ok) j = l;
  }
  if (j.ok) { keepAcct({ tk: j.tk, name: j.name, id: j.id }); keepMe(j); }
  return j;
}
export async function acctOut() { const a = ACCT; const t = appPushToken(); keepAcct(null); if (a) { if (t) api('/kacct', { op: 'push', tk: a.tk, t, on: 0 }); api('/kacct', { op: 'out', tk: a.tk }); } try { localStorage.removeItem('kusatma-push'); } catch (e) { /* ignore */ } }
// phone notifications (the Android app 45+): the app keeps a Firebase token; the game links it to the signed-in account
const appBridge = () => (typeof window !== 'undefined' && window.KusatmaApp && typeof window.KusatmaApp.pushToken === 'function' ? window.KusatmaApp : null);
export const appPushCan = () => !!appBridge();
export function appPushToken() { try { const b = appBridge(); return b ? String(b.pushToken() || '') : ''; } catch (e) { return ''; } }
export const appPushOn = () => { try { return localStorage.getItem('kusatma-push-off') !== '1' && !!appBridge() && appBridge().pushAllowed(); } catch (e) { return false; } };
export async function appPushSet(on) {
  const b = appBridge(); if (!b || !ACCT) return false;
  try { localStorage.setItem('kusatma-push-off', on ? '0' : '1'); } catch (e) { /* ignore */ }
  if (on && !b.pushAllowed()) b.pushAsk();
  const t = appPushToken(); if (!t) return false;
  const al = b.pushAllowed() ? 1 : 0;
  const j = await api('/kacct', { op: 'push', tk: ACCT.tk, t, on: on ? 1 : 0, al });
  try { localStorage.setItem('kusatma-push', on && j.ok ? ACCT.id + ':' + t + ':' + al : ''); } catch (e) { /* ignore */ }
  return !!j.ok;
}
// once per account and phone: ask for permission the first time and register the token
let pushTry = 0;
// coming back from Android's settings may have turned notifications on or off
try { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') appPushAuto(); }); } catch (e) { /* ignore */ }
function appPushAuto() {
  const b = appBridge(); if (!b || !ACCT) return;
  let off = false, sent = ''; try { off = localStorage.getItem('kusatma-push-off') === '1'; sent = localStorage.getItem('kusatma-push') || ''; } catch (e) { /* ignore */ }
  if (off) return;
  if (!b.pushAllowed()) { let asked = false; try { asked = localStorage.getItem('kusatma-push-asked') === '1'; localStorage.setItem('kusatma-push-asked', '1'); } catch (e) { /* ignore */ } if (!asked) b.pushAsk(); }
  const t = appPushToken();
  // registered again when the token or the phone's notification permission changes, so the panel knows which phones can be reached
  if (t && sent !== ACCT.id + ':' + t + ':' + (b.pushAllowed() ? 1 : 0)) appPushSet(true);
  else if (!t && pushTry++ < 3) setTimeout(appPushAuto, 15000); // the token can take a moment on a fresh install
}
try { const m = JSON.parse(localStorage.getItem('kusatma-ben') || 'null'); if (m && ACCT) keepMe(m); } catch (e) { /* ignore */ }
// on start: a session the owner reset or deleted signs out; a name change on the server comes back
export async function acctCheck() {
  if (!ACCT) return;
  const j = await api('/kacct', { op: 'me', tk: ACCT.tk });
  if (j.ok) { keepMe(j); if (j.name !== ACCT.name) keepAcct({ tk: ACCT.tk, name: j.name, id: j.id }); if (j.gift && j.gift.length && H && H.onGift2) H.onGift2(j.gift); setTimeout(appPushAuto, 3000); }
  else if (j.reason === 'signin') keepAcct(null);
  return j;
}
export const topGet = () => api('/ktop');
export const dailyGet = () => api('/kdaily');
// anti-cheat: the host reports something impossible a player did (the server only records it)
// chat lines in this room, for the owner's log (sent by the host only, a few lines at a time)
const chatQ = []; let chatT = 0;
export function liveChat(name, text) {
  chatQ.push([str(name, 16), str(text, 100)]);
  const go = () => { clearTimeout(chatT); chatT = 0; if (chatQ.length) send({ e: 'ch', L: chatQ.splice(0, 10) }); };
  if (chatQ.length >= 10) go(); else if (!chatT) chatT = setTimeout(go, 4000);
}
// connection troubles for the owner's log (why someone dropped, rejoined or could not get in); kept for a moment if the
// live socket is down, since that is often exactly when they happen
const cnQ = [];
// owner messages: tell the panel the message arrived (1) and when it was on a visible screen (2)
const MR = new Set();
function msgReceipt(mid) {
  if (!mid) return;
  try { send({ e: 'mr', mid, s: 1 }); } catch (e) {}
  if (document.visibilityState === 'visible') { try { send({ e: 'mr', mid, s: 2 }); } catch (e) {} return; }
  MR.add(mid); if (MR.size > 20) MR.delete(MR.values().next().value);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !MR.size || !sockOk()) return;
  for (const mid of MR) { try { send({ e: 'mr', mid, s: 2 }); } catch (e) {} }
  MR.clear();
});
export function liveConn(o) {
  const c = navigator.connection || {};
  const m = { e: 'cn', r: str(o.r, 12), why: str(o.why, 40), room: str(o.room, 6), who: str(o.who, 16), secs: Math.max(0, Math.round(o.secs || 0)), tries: o.tries | 0, ping: Math.round(o.ping || 0), net: str(c.effectiveType || '', 10) };
  if (sockOk()) send(m); else { cnQ.push(m); if (cnQ.length > 6) cnQ.shift(); }
}
// errors in this browser: each kind once per visit, at most 8, queued while the socket is down (the owner sees them in the panel)
const ERR = { seen: new Set(), q: [], n: 0, v: 0 };
export function errorReports(build) {
  ERR.v = build | 0;
  const rep = (m, src, stack) => {
    m = String(m || '').slice(0, 200); if (!m || ERR.n >= 8) return;
    // other sites' scripts, extensions and cross-origin "Script error." tell us nothing
    if (/^Script error\.?$/i.test(m) || /(chrome|moz|safari)-extension:/.test(String(stack || '') + src)) return;
    const key = m + '|' + src; if (ERR.seen.has(key)) return; ERR.seen.add(key); ERR.n++;
    const o = { e: 'er', m, s: String(src || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 120), st: String(stack || '').replace(/https?:\/\/[^/\s)]+/g, '').slice(0, 400), v: ERR.v };
    if (sockOk()) send(o); else { ERR.q.push(o); if (ERR.q.length > 8) ERR.q.shift(); }
  };
  window.addEventListener('error', (e) => { if (!e || !e.message) return; rep(e.message, (e.filename || '') + ':' + (e.lineno | 0) + ':' + (e.colno | 0), e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', (e) => { const r = e && e.reason; if (!r) return; rep('Promise: ' + (r.message || String(r)), '', r.stack); });
}
export function liveCheat(r) { send({ e: 'ac', name: str(r.name, 16), acct: str(r.acct, 12), kind: str(r.kind, 12), d: str(r.detail, 80), w: r.wave | 0 }); }
// invite an online friend into the room this player is in (the server checks both sides)
export function inviteSend(to) {
  if (!sockOk()) return Promise.resolve({ ok: false, reason: 'net' });
  to = str(to, 12);
  return new Promise((res) => { DMW.set('i' + to, res); send({ e: 'inv', to }); setTimeout(() => { if (DMW.get('i' + to) === res) { DMW.delete('i' + to); res({ ok: false, reason: 'net' }); } }, 8000); });
}
// ---------- account v2: gems, shop, friends, messages ----------
function addXp(x) { ME.xp += x; ME.lx += x; while (ME.lx >= ME.ln && ME.lvl < 100) { ME.lx -= ME.ln; ME.lvl++; ME.ln = 100 + 40 * (ME.lvl - 1); if (H && H.onLevel) H.onLevel(ME.lvl); } }
export async function acctOp(op, body) {
  if (!ACCT) return { ok: false, reason: 'signin' };
  const j = await api('/kacct', Object.assign({ op, tk: ACCT.tk }, body || {}));
  if (j.reason === 'signin') { keepAcct(null); if (H) H.onCfg(); }
  if (j.ok) {
    if ('gems' in j) ME.gems = Math.max(0, j.gems | 0);
    if (Array.isArray(j.own)) ME.own = j.own;
    if (j.eq) ME.eq = cleanEq(j.eq);
    if (typeof j.pass === 'string') ME.pass = j.pass;
    if (j.set) ME.set = j.set;
    if ('hideLb' in j) ME.hideLb = !!j.hideLb;
    if (op === 'ren' && j.name) keepAcct({ tk: ACCT.tk, name: j.name, id: ACCT.id });
    try { localStorage.setItem('kusatma-ben', JSON.stringify(ME)); } catch (e) { /* ignore */ }
  }
  return j;
}
export const owns = (id) => ME.own.includes(id) || (ITEMS[id] && ITEMS[id].free) || false;
// a cleared wave in my own game: the server decides the gems
let gid = '';
export function liveGameEnd() { gid = ''; lastK = -1; }
let lastK = -1;
// kills when a wave starts: the next report counts only what was killed after this
export function liveKills(k) { if (lastK < 0) lastK = k | 0; }
export function liveGame() { if (gid) return; gid = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join(''); }
export function liveWave(w, kills) { if (!ACCT || !gid) return; const k = lastK < 0 ? 0 : Math.max(0, (kills | 0) - lastK); lastK = kills | 0; send({ e: 'gw', w: w | 0, g: gid, k }); }
const cleanFl = (d) => ({
  L: (Array.isArray(d.L) ? d.L : []).slice(0, 200).map((f) => ({ id: str(f.id, 12), name: str(f.name, 16), lvl: f.lvl | 0, eq: cleanEq(f.eq), on: !!f.on, room: str(f.room, 6).replace(/[^A-Z0-9]/g, ''), st: str(f.st, 8), wave: f.wave | 0, solo: !!f.solo, last: +f.last || 0 })),
  q: (Array.isArray(d.q) ? d.q : []).slice(0, 50).map((q) => ({ id: str(q.id, 12), name: str(q.name, 16) })),
  un: Object.fromEntries(Object.entries(d.un && typeof d.un === 'object' ? d.un : {}).slice(0, 200).map(([k, v]) => [str(k, 12), v | 0])),
});
const cleanMsgs = (L) => (Array.isArray(L) ? L : []).slice(-50).map((m) => ({ f: str(m.f, 12), x: str(m.x, 200), t: +m.t || 0 }));
const DMW = new Map();
let dmc = 0;
const sockOk = () => !!(ws && ws.readyState === 1);
// friends and messages go over the live socket when it's open (cheaper for the server), else over HTTP
export async function friendsGet() {
  if (sockOk()) { send({ e: 'fl' }); return null; }
  const j = await acctOp('flist');
  return j.ok ? cleanFl(j) : null;
}
export function dmHistory(w) {
  if (sockOk()) return new Promise((res) => { DMW.set(w, res); send({ e: 'dmh', w }); setTimeout(() => { if (DMW.get(w) === res) { DMW.delete(w); res(null); } }, 8000); });
  return acctOp('dmh', { w }).then((j) => (j.ok ? cleanMsgs(j.L) : null));
}
export function dmSend(to, x) {
  if (sockOk()) { const c = ++dmc; return new Promise((res) => { DMW.set('c' + c, res); send({ e: 'dm', to, x, c }); setTimeout(() => { if (DMW.get('c' + c) === res) { DMW.delete('c' + c); res({ ok: false, reason: 'net' }); } }, 8000); }); }
  return acctOp('dm', { to, x });
}
// the open rooms list: asked over the live socket when it is up (far cheaper for the server), otherwise as a request
let roomsWait = null;
const cleanRooms = (L) => (Array.isArray(L) ? L : []).slice(0, 60).map((r) => ({ code: str(r.code, 6).replace(/[^A-Z0-9]/g, ''), name: str(r.name, 16), rn: str(r.rn, 24), mx: r.mx | 0, diff: str(r.diff, 12), n: r.n | 0, st: str(r.st, 8), wave: r.wave | 0, ver: r.ver | 0, gm: str(r.gm, 8) })).filter((r) => r.code);
export function roomsGet() {
  if (!ws || ws.readyState !== 1 || roomsWait) return api('/krooms');
  return new Promise((res) => {
    const t = setTimeout(() => { roomsWait = null; api('/krooms').then(res); }, 2500);
    roomsWait = (L) => { clearTimeout(t); roomsWait = null; res({ ok: true, rooms: L }); };
    send({ e: 'kr' });
  });
}
let turnP = null, turnIce = [];
// relay details from our server; waits at most 2.5 s so a slow network never holds up making or joining a room
export function turnReady(add) {
  if (!turnP) turnP = api('/turn').then((j) => { if (j && j.ok) { turnIce = j.ice; add(j.ice); } }).catch(() => {});
  return Promise.race([turnP, new Promise((r) => setTimeout(r, 2500))]);
}
// someone else's account owns this name
export function nameTaken(name) { const k = nkey(name); return !!k && LIVE.names.includes(k) && !(ACCT && nkey(ACCT.name) === k); }

// ---------- connection test: cheap checks only (a ping the server answers without touching its database) ----------
export async function diagRun(step) {
  const out = [];
  const add = (r) => { out.push(r); step(out); };
  add({ k: 'net', t: 'İnternet', s: navigator.onLine ? 'ok' : 'bad', v: navigator.onLine ? 'bağlı' : 'bağlı değil' });
  for (const [i, base] of HTTP.entries()) {
    const name = ['Sunucu (Deno)', 'Sunucu (Workers)', 'Sunucu (Pages)'][i] || base;
    const t0 = performance.now();
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 6000);
      const r = await fetch(base + '/ping', { cache: 'no-store', signal: ac.signal }); clearTimeout(to);
      const j = await r.json();
      add({ k: 'api' + i, t: name, s: j.ok ? 'ok' : 'bad', v: j.ok ? Math.round(performance.now() - t0) + ' ms' : 'hata ' + r.status });
    } catch (e) { add({ k: 'api' + i, t: name, s: 'bad', v: e.name === 'AbortError' ? 'zaman aşımı' : 'ulaşılamadı' }); }
  }
  const wsOk = !!(ws && ws.readyState === 1);
  add({ k: 'live', t: 'Canlı bağlantı (haberler, mesajlar)', s: wsOk ? 'ok' : 'warn', v: wsOk ? ['Deno', 'Workers', 'Pages'][idx] || 'açık' : 'kapalı, tekrar deneniyor' });
  const t1 = performance.now();
  try {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 6000);
    const r = await fetch('https://0.peerjs.com/peerjs/id?ts=' + Date.now(), { cache: 'no-store', signal: ac.signal }); clearTimeout(to);
    add({ k: 'peer', t: 'Oda servisi (oda kodları)', s: r.ok ? 'ok' : 'bad', v: r.ok ? Math.round(performance.now() - t1) + ' ms' : 'hata ' + r.status });
  } catch (e) { add({ k: 'peer', t: 'Oda servisi (oda kodları)', s: 'bad', v: 'ulaşılamadı' }); }
  const gather = (servers, want, ms) => new Promise((res) => {
    let pc; try { pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: want === 'relay' ? 'relay' : 'all' }); } catch (e) { res(false); return; }
    const done = (v) => { try { pc.close(); } catch (e) { /* ignore */ } res(v); };
    const to = setTimeout(() => done(false), ms);
    pc.onicecandidate = (e) => { if (e.candidate && e.candidate.candidate.includes(' typ ' + want + ' ')) { clearTimeout(to); done(true); } };
    pc.createDataChannel('t'); pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done(false));
  });
  const direct = await gather([{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }], 'srflx', 5000);
  add({ k: 'stun', t: 'Doğrudan bağlantı', s: direct ? 'ok' : 'warn', v: direct ? 'mümkün' : 'ağın engelliyor, aktarma kullanılacak' });
  if (!turnIce.length) { try { const j = await api('/turn'); if (j && j.ok) turnIce = j.ice; } catch (e) { /* ignore */ } }
  const relay = turnIce.length ? await gather(turnIce, 'relay', 7000) : false;
  add({ k: 'turn', t: 'Aktarma sunucusu (TURN)', s: relay ? 'ok' : 'bad', v: relay ? 'çalışıyor' : turnIce.length ? 'ulaşılamadı' : 'bilgi alınamadı' });
  return out;
}

// a finished game (only the host's report counts it as a game; everyone's counts for the best wave)
// the room's host reports a finished PvP match; the server rates the signed-in players in the room
// browser notifications: only when the player switched them on, allowed them, and the game is in a background tab
export const sysNotifyOn = () => { try { return localStorage.getItem('kusatma-sysbildirim') === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'; } catch (e) { return false; } };
export async function sysNotifySet(on) {
  try {
    if (!on) { localStorage.setItem('kusatma-sysbildirim', '0'); return true; }
    if (typeof Notification === 'undefined') return false;
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    localStorage.setItem('kusatma-sysbildirim', p === 'granted' ? '1' : '0');
    return p === 'granted';
  } catch (e) { return false; }
}
// the player's notification choices (stored on the account): a switch per kind and quiet hours, Turkey time
export function notifyAllowed(kind) {
  const set = (ME && ME.set) || {}, pn = set.pn || {}, q = set.qh;
  if (kind && pn[kind] === 0) return false;
  if (Array.isArray(q) && q.length === 2 && q[0] !== q[1]) { const h = new Date(Date.now() + 3 * 36e5).getUTCHours(); if (q[0] < q[1] ? h >= q[0] && h < q[1] : h >= q[0] || h < q[1]) return false; }
  return true;
}
export function sysNotify(title, body, kind) {
  if (!sysNotifyOn() || !document.hidden || !notifyAllowed(kind)) return;
  try { const n = new Notification(String(title).slice(0, 60), { body: String(body).slice(0, 160), icon: (window.KROOT || './') + 'app/icon.png', tag: 'kusatma-' + String(title).slice(0, 20) }); n.onclick = () => { window.focus(); n.close(); }; } catch (e) { /* ignore */ }
}
export function livePvp(o) {
  const v = o.pvp; if (!v) return;
  send({ e: 'pvr', k: v.k, win: v.k === 'ffa' ? -1 : v.win, t: o.time | 0, P: (o.P || []).slice(0, 16).map((p) => [p.name, p.tm | 0, p.pk | 0, p.dth | 0]) });
}
// performance reports (js/perf.js); only sent with the statistics choice, checked there and here
export function livePerf(o) { if (statsOk()) send(o); }
export function liveStat(wave, host, kills, extra) { send(Object.assign({ e: 'stat', w: wave | 0, host: host ? 1 : 0, k: kills | 0 }, extra || {})); }

// why online play is closed right now, or '' when it's open
export function liveBlock() {
  if (LIVE.ban !== null) return 'Bu cihazdan çok oyunculu oynaman engellendi.' + (LIVE.ban ? ' Sebep: ' + LIVE.ban : '');
  if (LIVE.maint.on) return 'Bakım çalışması var, çok oyunculu şu an kapalı.' + (LIVE.maint.text ? ' ' + LIVE.maint.text : '');
  return '';
}
