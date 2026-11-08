// Live link to the owner's server: news, maintenance, messages, kicks and bans from the admin panel,
// plus who is online and how far games get. Tries each address in turn (some networks block one of them).
const ADDRS = ['wss://ironfield-api.umvtt.deno.net', 'wss://ironfield-codes.umvtt.workers.dev', 'wss://ironfield-api.pages.dev'];
const BAN_KEY = 'kusatma-ban';

let dev = '';
try {
  dev = localStorage.getItem('kusatma-cihaz') || '';
  if (!/^[a-f0-9]{16}$/.test(dev)) {
    dev = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('kusatma-cihaz', dev);
  }
} catch (e) { dev = dev || 'f'.repeat(16); }

export const LIVE = { news: { on: false, text: '' }, maint: { on: false, text: '' }, ban: null };
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
  const m = { e: 'hi', dev, name: str(s.name, 16), room: str(s.room, 6), mode: s.mode || '', st: str(s.st, 8), wave: s.wave | 0, n: s.n | 0, ver: s.ver | 0 };
  const j = JSON.stringify(m);
  if (force || j !== last) { last = j; send(m); }
}

function onData(raw) {
  let d; try { d = JSON.parse(raw); } catch (e) { return; }
  if (!d || typeof d !== 'object') return;
  if (d.e === 'cfg') { const c = cleanCfg(d.cfg); LIVE.news = c.news; LIVE.maint = c.maint; H.onCfg(); }
  else if (d.e === 'msg') H.onMsg(str(d.text, 300));
  else if (d.e === 'kick') H.onKick(str(d.text, 200));
  else if (d.e === 'ban') { LIVE.ban = str(d.text, 120); try { localStorage.setItem(BAN_KEY, LIVE.ban); } catch (e) { /* ignore */ } H.onBan(); }
  else if (d.e === 'ev') H.onEv(d.k === 'boss' ? 'boss' : 'gold', d.n | 0, str(d.text, 120));
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

// a finished game (only the host's report counts it as a game; everyone's counts for the best wave)
export function liveStat(wave, host, kills) { send({ e: 'stat', w: wave | 0, host: host ? 1 : 0, k: kills | 0 }); }

// why online play is closed right now, or '' when it's open
export function liveBlock() {
  if (LIVE.ban !== null) return 'Bu cihazdan çok oyunculu oynaman engellendi.' + (LIVE.ban ? ' Sebep: ' + LIVE.ban : '');
  if (LIVE.maint.on) return 'Bakım çalışması var, çok oyunculu şu an kapalı.' + (LIVE.maint.text ? ' ' + LIVE.maint.text : '');
  return '';
}
