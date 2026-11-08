// Live link to the owner's server: news, maintenance, messages, kicks and bans from the admin panel,
// plus who is online and how far games get. Tries each address in turn (some networks block one of them).
const ADDRS = ['wss://ironfield-api.umvtt.deno.net', 'wss://ironfield-codes.umvtt.workers.dev', 'wss://ironfield-api.pages.dev'];
const BAN_KEY = 'kusatma-ban';
const HTTP = ADDRS.map((a) => a.replace(/^wss:/, 'https:'));
const NK = { '0': 'o', '1': 'i', l: 'i', '|': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g', 'ı': 'i', 'ğ': 'g', 'ş': 's', 'ç': 'c', 'ö': 'o', 'ü': 'u' };
// same rule as the server: case, spaces, accents, look-alikes and repeated letters don't make a new name
export const nkey = (n) => [...String(n || '').toLowerCase().normalize('NFKD')].map((c) => NK[c] || c).join('').replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');

let dev = '';
try {
  dev = localStorage.getItem('kusatma-cihaz') || '';
  if (!/^[a-f0-9]{16}$/.test(dev)) {
    dev = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('kusatma-cihaz', dev);
  }
} catch (e) { dev = dev || 'f'.repeat(16); }

export const LIVE = { news: { on: false, text: '' }, maint: { on: false, text: '' }, ban: null, names: [] };
export let ACCT = null;
export const ME = { best: 0, kills: 0, games: 0, mins: 0 };
export let PUB = true;
try { PUB = localStorage.getItem('kusatma-pub') !== '0'; } catch (e) { /* ignore */ }
export function setPub(v) { PUB = !!v; try { localStorage.setItem('kusatma-pub', PUB ? '1' : '0'); } catch (e) { /* ignore */ } last = ''; if (H) hi(true); }
const keepMe = (j) => { for (const k of Object.keys(ME)) ME[k] = Math.max(0, j[k] | 0); };
try { const a = JSON.parse(localStorage.getItem('kusatma-hesap') || 'null'); if (a && /^[a-f0-9]{64}$/.test(a.tk)) ACCT = { tk: a.tk, name: String(a.name || '').slice(0, 16), id: String(a.id || '') }; } catch (e) { /* ignore */ }
try { const b = localStorage.getItem(BAN_KEY); if (b !== null) LIVE.ban = b; } catch (e) { /* ignore */ }

let ws = null, idx = 0, delay = 3000, last = '', H = null, ping = 0;

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
function cleanCfg(c) {
  c = c && typeof c === 'object' ? c : {};
  const n = c.news || {}, m = c.maint || {};
  return { news: { on: !!n.on, text: str(n.text, 200) }, maint: { on: !!m.on, text: str(m.text, 200) } };
}

function send(o) { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(o)); } catch (e) { /* ignore */ } }

function hi(force) {
  const s = H.state();
  const m = { e: 'hi', dev, name: str(s.name, 16), room: str(s.room, 6), mode: s.mode || '', st: str(s.st, 8), wave: s.wave | 0, n: s.n | 0, ver: s.ver | 0, cls: str(s.cls, 12), tk: ACCT ? ACCT.tk : '', bn: LIVE.ban !== null ? 1 : 0, pub: PUB ? 1 : 0, rn: str(s.rn, 24), mx: s.mx | 0, df: str(s.df, 12) };
  const j = JSON.stringify(m);
  if (force || j !== last) { last = j; send(m); }
}

function onData(raw) {
  let d; try { d = JSON.parse(raw); } catch (e) { return; }
  if (!d || typeof d !== 'object') return;
  if (d.e === 'cfg') { const c = cleanCfg(d.cfg); LIVE.news = c.news; LIVE.maint = c.maint; LIVE.names = Array.isArray(d.cfg && d.cfg.names) ? d.cfg.names.slice(0, 5000).map((x) => str(x, 24)) : []; H.onCfg(); }
  else if (d.e === 'msg') H.onMsg(str(d.text, 300));
  else if (d.e === 'kick') H.onKick(str(d.text, 200));
  else if (d.e === 'ban') { LIVE.ban = str(d.text, 120); try { localStorage.setItem(BAN_KEY, LIVE.ban); } catch (e) { /* ignore */ } H.onBan(); }
  else if (d.e === 'ev') H.onEv(d.k === 'boss' ? 'boss' : 'gold', d.n | 0, str(d.text, 120));
  else if (d.e === 'gift') H.onGift(str(d.name, 16), d.n | 0);
  else if (d.e === 'acct') acctCheck().then(() => H.onCfg());
  else if (d.e === 'watch') { const r = H.detail(); if (r) send({ e: 'rd', d: r }); }
  else if (d.e === 'unban') { LIVE.ban = null; try { localStorage.removeItem(BAN_KEY); } catch (e) { /* ignore */ } H.onCfg(); }
}

function connect() {
  let s;
  try { s = new WebSocket(ADDRS[idx] + '/klive'); } catch (e) { retry(); return; }
  ws = s;
  let opened = false;
  s.onopen = () => { opened = true; delay = 3000; hi(true); };
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
async function api(path, body) {
  for (let i = 0; i < HTTP.length; i++) {
    const k = (httpIdx + i) % HTTP.length;
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 9000);
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
  const j = await api('/kacct', { op, name, pw, dev });
  if (j.ok) { keepAcct({ tk: j.tk, name: j.name, id: j.id }); keepMe(j); }
  return j;
}
export async function acctOut() { const a = ACCT; keepAcct(null); if (a) api('/kacct', { op: 'out', tk: a.tk }); }
// on start: a session the owner reset or deleted signs out; a name change on the server comes back
export async function acctCheck() {
  if (!ACCT) return;
  const j = await api('/kacct', { op: 'me', tk: ACCT.tk });
  if (j.ok) { keepMe(j); if (j.name !== ACCT.name) keepAcct({ tk: ACCT.tk, name: j.name, id: j.id }); }
  else if (j.reason === 'signin') keepAcct(null);
}
export const topGet = () => api('/ktop');
export const roomsGet = () => api('/krooms');
let turnP = null;
// relay details from our server; waits at most 2.5 s so a slow network never holds up making or joining a room
export function turnReady(add) {
  if (!turnP) turnP = api('/turn').then((j) => { if (j && j.ok) add(j.ice); }).catch(() => {});
  return Promise.race([turnP, new Promise((r) => setTimeout(r, 2500))]);
}
// someone else's account owns this name
export function nameTaken(name) { const k = nkey(name); return !!k && LIVE.names.includes(k) && !(ACCT && nkey(ACCT.name) === k); }

// a finished game (only the host's report counts it as a game; everyone's counts for the best wave)
export function liveStat(wave, host, kills, extra) { send(Object.assign({ e: 'stat', w: wave | 0, host: host ? 1 : 0, k: kills | 0 }, extra || {})); }

// why online play is closed right now, or '' when it's open
export function liveBlock() {
  if (LIVE.ban !== null) return 'Bu cihazdan çok oyunculu oynaman engellendi.' + (LIVE.ban ? ' Sebep: ' + LIVE.ban : '');
  if (LIVE.maint.on) return 'Bakım çalışması var, çok oyunculu şu an kapalı.' + (LIVE.maint.text ? ' ' + LIVE.maint.text : '');
  return '';
}
