// Networking on top of PeerJS (WebRTC). The host's browser runs the game; everyone else connects to it.
/* global Peer */
import { CODE_LEN } from './config.js';

const PREFIX = 'kusatma-';
// connection helpers: public STUN, plus our relay (TURN) when the server gives it, used only if a direct link fails
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
export function addIce(list) { if (Array.isArray(list)) for (const x of list.slice(0, 4)) if (x && x.urls) ICE.push(x); }
const peerOpts = () => ({ debug: 0, config: { iceServers: ICE } });
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes
const MAX_MSGS_PER_SEC = 80;   // normal play sends about 22
const MSG_BURST = 400;         // a link that stalled and then delivers its backlog at once is not spam
const PIECE = 5000;            // PeerJS refuses JSON messages over 16 KB; bigger ones go in pieces of this many characters
const MAX_MSG_CHARS = 6000;
const HOST_STALE_MS = 30000;   // drop a player we have not heard from in this long
const CLIENT_STALE_MS = 8000;  // the host pings every 2 s; this long without anything means the link is down

export function makeCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
}

const peerAvailable = () => typeof Peer === 'function';

// Splits a message that is too big for one PeerJS message into pieces the client puts back together.
let packId = 0;
function pack(msg) {
  const str = JSON.stringify(msg);
  if (str.length <= PIECE) return [msg];
  const id = ++packId, n = Math.ceil(str.length / PIECE), out = [];
  for (let i = 0; i < n; i++) out.push({ t: 'ck', id, i, n, d: str.slice(i * PIECE, (i + 1) * PIECE) });
  return out;
}

export class HostNet {
  constructor() {
    this.peer = null;
    this.code = null;
    this.conns = new Map(); // pid -> info
    this.nextPid = 2;       // 1 is the host itself
    this.onMsg = null;
    this.onLeave = null;
  }

  // fixed: take over an existing room code (host migration), retrying while the old host's id is still held.
  open(fixed = null, waitMs = 15000) {
    if (!peerAvailable()) return Promise.reject(new Error('peerjs-missing'));
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => { if (!finished) { finished = true; this.destroy(); reject(new Error('timeout')); } }, waitMs);
      const attempt = (n) => {
        const code = fixed || makeCode();
        const peer = new Peer(PREFIX + code.toLowerCase(), peerOpts());
        let opened = false;
        peer.on('open', () => {
          if (finished) { peer.destroy(); return; }
          opened = true; finished = true; clearTimeout(timer);
          this.peer = peer; this.code = code;
          peer.on('connection', (conn) => this.accept(conn));
          // signalling server dropped us: keep reconnecting (1, 2, 4… up to 15 s apart) until it works, so players who
          // drop out can always find the room again. A watchdog also checks every 10 s in case an attempt failed quietly.
          this.sigTries = 0;
          const retry = () => {
            if (this.closing || peer.destroyed || !peer.disconnected || this.sigT) return;
            const wait = Math.min(15000, 1000 * 2 ** Math.min(4, this.sigTries++));
            this.sigT = setTimeout(() => { this.sigT = 0; if (this.closing || peer.destroyed || !peer.disconnected) return; try { peer.reconnect(); } catch (e) { /* ignore */ } setTimeout(retry, 3000); }, wait);
          };
          peer.on('disconnected', () => { if (this.onSig) this.onSig('lost'); retry(); });
          peer.on('open', () => { if (this.sigTries && this.onSig) this.onSig('back'); this.sigTries = 0; });
          this.sigWatch = setInterval(() => { if (!this.closing && !peer.destroyed && peer.disconnected) retry(); }, 10000);
          resolve(code);
        });
        peer.on('error', (e) => {
          if (opened) { console.warn('PeerJS:', e.type); return; } // the watchdog above brings a dropped signalling link back
          peer.destroy();
          if (finished) return;
          if (e.type === 'unavailable-id' && fixed) setTimeout(() => { if (!finished) attempt(n + 1); }, 1500);
          else if (e.type === 'unavailable-id' && n < 4) attempt(n + 1);
          else { finished = true; clearTimeout(timer); reject(e); }
        });
      };
      attempt(0);
    });
  }

  accept(conn) {
    // the second, unordered channel of a player (snapshots out, inputs in): one late packet never holds up the others
    if (conn.label === 'u') {
      conn.on('open', () => {
        const attach = () => { for (const i of this.conns.values()) if (i.conn.peer === conn.peer) { i.u = conn; conn.on('data', (d) => this.receive(i, d)); return true; } return false; };
        if (!attach()) { let n = 0; const t = setInterval(() => { if (attach() || ++n > 20) clearInterval(t); }, 250); }
        const off = () => { for (const i of this.conns.values()) if (i.u === conn) i.u = null; };
        conn.on('close', off); conn.on('error', off);
      });
      return;
    }
    conn.on('open', () => {
      const info = { pid: this.nextPid++, conn, player: false, tokens: MSG_BURST, win: performance.now(), last: performance.now() };
      this.conns.set(info.pid, info);
      conn.on('data', (d) => this.receive(info, d));
      conn.on('close', () => { info.why = info.why || 'closed'; this.drop(info); });
      conn.on('error', (e) => { if (!e || e.type !== 'message-too-big') { info.why = info.why || 'error' + (e && e.type ? ':' + e.type : ''); this.drop(info); } });
      setTimeout(() => { if (this.conns.get(info.pid) === info && !info.player) this.close(info.pid); }, 6000);
    });
  }

  receive(info, d) {
    const now = performance.now();
    info.last = now;
    // token bucket: refills at MAX_MSGS_PER_SEC, holds up to MSG_BURST
    info.tokens = Math.min(MSG_BURST, info.tokens + (now - info.win) / 1000 * MAX_MSGS_PER_SEC);
    info.win = now;
    let size = 0;
    try { size = JSON.stringify(d).length; } catch (e) { size = Infinity; }
    info.tokens -= size > MAX_MSG_CHARS ? 20 : 1;
    if (info.tokens < 0) { info.why = 'spam'; this.kick(info.pid, 'spam'); return; }
    if (size > MAX_MSG_CHARS) return;
    if (d && d.t === 'p') return; // keep-alive
    if (this.onMsg) this.onMsg(info.pid, d);
  }

  markPlayer(pid) { const i = this.conns.get(pid); if (i) i.player = true; }
  // how long this player's link has been quiet (ms); a link that is gone counts as quiet forever
  silentFor(pid) { const i = this.conns.get(pid); return i ? performance.now() - i.last : Infinity; }
  peerIdOf(pid) { const i = this.conns.get(pid); return i && i.conn ? i.conn.peer : null; }

  // A reconnecting player gets their old player number back. A stale link still holding that number is closed quietly.
  rebind(from, to) {
    const i = this.conns.get(from);
    if (!i) return false;
    const old = this.conns.get(to);
    if (old) {
      if (!old.player) return false;
      this.conns.delete(to);
      try { old.conn.close(); } catch (e) { /* ignore */ }
    }
    this.conns.delete(from);
    i.pid = to;
    this.conns.set(to, i);
    return true;
  }

  send(pid, msg) {
    const i = this.conns.get(pid);
    if (!i || !i.conn.open) return;
    for (const part of pack(msg)) { try { i.conn.send(part); } catch (e) { /* closed mid-send */ } }
  }

  // snapshots: dropped for a guest whose channel is still busy with earlier data, so lag never piles up
  canSnap(pid) {
    const i = this.conns.get(pid);
    if (!i || !i.player || !i.conn.open) return false;
    const c = i.u && i.u.open ? i.u : i.conn, dc = c.dataChannel;
    if ((dc && dc.bufferedAmount > 64000) || c.bufferSize > 0) { i.skipped = (i.skipped || 0) + 1; return false; }
    return true;
  }
  sendSnap(pid, msg) {
    const i = this.conns.get(pid);
    if (!i || !i.conn.open) return;
    const c = i.u && i.u.open ? i.u : i.conn;
    for (const part of pack(msg)) { try { c.send(part); } catch (e) { /* closed mid-send */ } }
  }
  fast(pid) { const i = this.conns.get(pid); return !!(i && i.u && i.u.open); }

  broadcast(msg) {
    let parts = null;
    for (const i of this.conns.values()) {
      if (!i.player || !i.conn.open) continue;
      if (!parts) parts = pack(msg);
      for (const part of parts) { try { i.conn.send(part); } catch (e) { /* ignore */ } }
    }
  }

  kick(pid, reason) {
    const i = this.conns.get(pid);
    if (!i) return;
    i.why = i.why || 'kick:' + reason;
    this.send(pid, { t: 'bye', r: reason });
    const was = i.player;
    i.player = false; // no more broadcasts to someone on the way out
    if (was && this.onLeave) this.onLeave(pid, i.why, 0);
    setTimeout(() => this.close(pid), 200);
  }

  close(pid) {
    const i = this.conns.get(pid);
    if (!i) return;
    try { i.conn.close(); } catch (e) { /* ignore */ }
    try { if (i.u) i.u.close(); } catch (e) { /* ignore */ }
    this.drop(i);
  }

  drop(info) {
    if (this.conns.get(info.pid) !== info) return;
    this.conns.delete(info.pid);
    if (info.player && this.onLeave) this.onLeave(info.pid, info.why || 'closed', Math.round(performance.now() - info.last));
  }

  // Called on a steady timer: keep-alives out, silent players out.
  maintain() {
    const now = performance.now();
    this.broadcast({ t: 'p' });
    for (const i of [...this.conns.values()]) if (now - i.last > HOST_STALE_MS) { i.why = 'silent'; this.close(i.pid); }
  }

  destroy() {
    this.closing = true;
    clearInterval(this.sigWatch); clearTimeout(this.sigT);
    for (const i of this.conns.values()) { try { i.conn.close(); } catch (e) { /* ignore */ } try { if (i.u) i.u.close(); } catch (e) { /* ignore */ } }
    this.conns.clear();
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null;
  }
}

// Offline stand-in so solo play uses the same code path.
export class OfflineNet {
  constructor() { this.code = null; this.onMsg = null; this.onLeave = null; this.offline = true; }
  markPlayer() {}
  silentFor() { return 0; }
  rebind() { return false; }
  send() {}
  broadcast() {}
  kick() {}
  maintain() {}
  destroy() {}
}

export class ClientNet {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.onMsg = null;
    this.onClose = null;
    this.last = performance.now();
    this.closed = false;
    this.parts = new Map(); // pieces of split messages being put back together (they can arrive mixed on the fast channel)
    this.u = null;          // the second, unordered channel
  }

  // Puts split messages back together; returns the whole message once every piece is in.
  unpack(d) {
    if (!d || d.t !== 'ck') return d;
    const { id, i, n } = d;
    if (!Number.isInteger(n) || n < 1 || n > 400 || !Number.isInteger(i) || i < 0 || i >= n || typeof d.d !== 'string') return null;
    let P = this.parts.get(id);
    if (!P) { P = { n, got: 0, d: new Array(n) }; this.parts.set(id, P); if (this.parts.size > 6) this.parts.delete(this.parts.keys().next().value); }
    if (P.n !== n || P.d[i] != null) return null;
    P.d[i] = d.d; P.got++;
    if (P.got < n) return null;
    this.parts.delete(id);
    try { return JSON.parse(P.d.join('')); } catch (e) { return null; }
  }

  connect(code, waitMs = 15000, rawId = '') {
    if (!peerAvailable()) return Promise.reject(new Error('peerjs-missing'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer(peerOpts());
      this.peer = peer;
      const fail = (reason) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { peer.destroy(); } catch (e) { /* ignore */ }
        reject(new Error(reason));
      };
      const timer = setTimeout(() => fail('timeout'), waitMs);
      peer.on('open', () => {
        const conn = peer.connect(rawId || PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
        this.conn = conn;
        const onData = (d) => {
          this.last = performance.now();
          if (d && d.t === 'p') return;
          const m = this.unpack(d);
          if (m && this.onMsg) this.onMsg(m);
        };
        conn.on('open', () => {
          if (settled) return; settled = true; clearTimeout(timer); this.last = performance.now(); resolve();
          // the fast channel: unordered, so one packet lost on Wi-Fi never freezes the game while it is sent again
          try {
            const u = peer.connect(rawId || PREFIX + code.toLowerCase(), { reliable: false, serialization: 'json', label: 'u' });
            u.on('open', () => { this.u = u; });
            u.on('data', onData);
            const off = () => { if (this.u === u) this.u = null; };
            u.on('close', off); u.on('error', off);
          } catch (e) { /* the main channel carries everything */ }
        });
        conn.on('data', onData);
        conn.on('close', () => { if (settled) this.lost('closed'); else fail('closed'); });
        conn.on('error', (e) => { if (e && e.type === 'message-too-big') return; if (settled) this.lost('error' + (e && e.type ? ':' + e.type : '')); else fail('closed'); });
      });
      peer.on('error', (e) => { if (!settled) fail(e.type || 'error'); });
      peer.on('disconnected', () => { /* signalling only; the game link stays up */ });
    });
  }

  send(msg) {
    const c = msg && msg.t === 'in' && this.u && this.u.open ? this.u : this.conn;
    if (c && c.open) { try { c.send(msg); } catch (e) { /* ignore */ } }
  }

  maintain() {
    if (this.closed) return;
    this.send({ t: 'p' });
    // a phone in the background runs timers late: that is not a dead link, so only count silence while the page is shown
    if (typeof document !== 'undefined' && document.hidden) { this.hiddenAt = performance.now(); return; }
    if (this.hiddenAt && performance.now() - this.hiddenAt < 4000) return; // just came back: give the next ping a moment
    if (performance.now() - this.last > CLIENT_STALE_MS) this.lost('silent');
  }

  lost(why) {
    if (this.closed) return;
    this.closed = true;
    this.why = why || 'closed';
    if (this.onClose) this.onClose();
  }

  destroy() {
    this.closed = true;
    try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
    try { if (this.u) this.u.close(); } catch (e) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}

// The owner's hidden spectators: a separate peer the game opens only when the panel asks (solo games too).
// Spectators are never players: not in the roster, not counted, invisible to everyone in the game.
export class SpecHost {
  constructor() { this.keys = new Set(); this.conns = new Set(); this.peer = null; this.id = ''; this.onJoin = null; this.idleT = 0; }
  open() {
    if (this.id) return Promise.resolve(this.id);
    if (!peerAvailable()) return Promise.reject(new Error('peerjs-missing'));
    return new Promise((resolve, reject) => {
      const id = PREFIX + 'v' + (makeCode() + makeCode()).toLowerCase();
      const peer = new Peer(id, peerOpts());
      this.peer = peer;
      const t = setTimeout(() => reject(new Error('timeout')), 15000);
      peer.on('open', () => {
        clearTimeout(t); this.id = id; resolve(id);
        // keep spectators' links warm, and close the door when nobody has watched for 3 minutes
        let idle = 0;
        this.ping = setInterval(() => { for (const c of this.conns) { try { if (c.open) c.send({ t: 'p' }); } catch (e) { /* ignore */ } } idle = this.conns.size ? 0 : idle + 2; if (idle >= 180) this.destroy(); }, 2000);
      });
      peer.on('error', (e) => { if (!this.id) { clearTimeout(t); reject(e); } });
      peer.on('connection', (c) => {
        c.on('data', (d) => {
          if (c.ok) return; // spectators only listen
          if (d && d.t === 'spec' && this.keys.has(d.k)) { c.ok = true; this.conns.add(c); if (this.onJoin) this.onJoin(c); } else { try { c.close(); } catch (e) { /* ignore */ } }
        });
        const gone = () => this.conns.delete(c);
        c.on('close', gone); c.on('error', gone);
      });
    });
  }
  get count() { return this.conns.size; }
  sendTo(c, msg) { if (!c.open) return; for (const p of pack(msg)) { try { c.send(p); } catch (e) { /* ignore */ } } }
  send(msg) {
    let parts = null;
    for (const c of this.conns) {
      if (!c.open) continue;
      const dc = c.dataChannel;
      if (msg.t === 's' && dc && dc.bufferedAmount > 96000) continue;
      if (!parts) parts = pack(msg);
      for (const p of parts) { try { c.send(p); } catch (e) { /* ignore */ } }
    }
  }
  destroy() { clearInterval(this.ping); try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ } this.conns.clear(); this.id = ''; this.peer = null; }
}
