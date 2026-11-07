// Networking on top of PeerJS (WebRTC). The host's browser runs the game; everyone else connects to it.
/* global Peer */
import { CODE_LEN } from './config.js';

const PREFIX = 'kusatma-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I lookalikes
const MAX_MSGS_PER_SEC = 80;   // normal play sends about 22
const MAX_MSG_CHARS = 6000;
const HOST_STALE_MS = 30000;   // drop a player we have not heard from in this long
const CLIENT_STALE_MS = 6000;  // the host pings every 2 s; this long without anything means it is gone

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
        const peer = new Peer(PREFIX + code.toLowerCase(), { debug: 0 });
        let opened = false;
        peer.on('open', () => {
          if (finished) { peer.destroy(); return; }
          opened = true; finished = true; clearTimeout(timer);
          this.peer = peer; this.code = code;
          peer.on('connection', (conn) => this.accept(conn));
          // signalling server dropped us: reconnect so new players can still find the room (never while shutting down)
          peer.on('disconnected', () => { if (this.closing) return; setTimeout(() => { try { if (!this.closing && !peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1000); });
          resolve(code);
        });
        peer.on('error', (e) => {
          if (opened) { console.warn('PeerJS:', e.type); return; }
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
    conn.on('open', () => {
      const info = { pid: this.nextPid++, conn, player: false, count: 0, win: performance.now(), last: performance.now() };
      this.conns.set(info.pid, info);
      conn.on('data', (d) => this.receive(info, d));
      conn.on('close', () => this.drop(info));
      conn.on('error', () => this.drop(info));
      setTimeout(() => { if (this.conns.get(info.pid) === info && !info.player) this.close(info.pid); }, 6000);
    });
  }

  receive(info, d) {
    const now = performance.now();
    info.last = now;
    if (now - info.win > 1000) { info.win = now; info.count = 0; }
    info.count++;
    let size = 0;
    try { size = JSON.stringify(d).length; } catch (e) { size = Infinity; }
    if (size > MAX_MSG_CHARS) info.count += 10;
    if (info.count > MAX_MSGS_PER_SEC) { this.kick(info.pid, 'spam'); return; }
    if (size > MAX_MSG_CHARS) return;
    if (d && d.t === 'p') return; // keep-alive
    if (this.onMsg) this.onMsg(info.pid, d);
  }

  markPlayer(pid) { const i = this.conns.get(pid); if (i) i.player = true; }

  // A reconnecting player gets their old player number back.
  rebind(from, to) {
    const i = this.conns.get(from);
    if (!i || this.conns.has(to)) return false;
    this.conns.delete(from);
    i.pid = to;
    this.conns.set(to, i);
    return true;
  }

  send(pid, msg) {
    const i = this.conns.get(pid);
    if (i && i.conn.open) { try { i.conn.send(msg); } catch (e) { /* closed mid-send */ } }
  }

  broadcast(msg) {
    for (const i of this.conns.values()) {
      if (i.player && i.conn.open) { try { i.conn.send(msg); } catch (e) { /* ignore */ } }
    }
  }

  kick(pid, reason) {
    const i = this.conns.get(pid);
    if (!i) return;
    this.send(pid, { t: 'bye', r: reason });
    i.player = false; // no more broadcasts to someone on the way out
    if (this.onLeave) this.onLeave(pid);
    setTimeout(() => this.close(pid), 200);
  }

  close(pid) {
    const i = this.conns.get(pid);
    if (!i) return;
    try { i.conn.close(); } catch (e) { /* ignore */ }
    this.drop(i);
  }

  drop(info) {
    if (this.conns.get(info.pid) !== info) return;
    this.conns.delete(info.pid);
    if (info.player && this.onLeave) this.onLeave(info.pid);
  }

  // Called on a steady timer: keep-alives out, silent players out.
  maintain() {
    const now = performance.now();
    this.broadcast({ t: 'p' });
    for (const i of [...this.conns.values()]) if (now - i.last > HOST_STALE_MS) this.close(i.pid);
  }

  destroy() {
    this.closing = true;
    for (const i of this.conns.values()) { try { i.conn.close(); } catch (e) { /* ignore */ } }
    this.conns.clear();
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null;
  }
}

// Offline stand-in so solo play uses the same code path.
export class OfflineNet {
  constructor() { this.code = null; this.onMsg = null; this.onLeave = null; }
  markPlayer() {}
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
  }

  connect(code) {
    if (!peerAvailable()) return Promise.reject(new Error('peerjs-missing'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      const fail = (reason) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { peer.destroy(); } catch (e) { /* ignore */ }
        reject(new Error(reason));
      };
      const timer = setTimeout(() => fail('timeout'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => { if (settled) return; settled = true; clearTimeout(timer); this.last = performance.now(); resolve(); });
        conn.on('data', (d) => { this.last = performance.now(); if (d && d.t === 'p') return; if (this.onMsg) this.onMsg(d); });
        conn.on('close', () => { if (settled) this.lost(); else fail('closed'); });
        conn.on('error', () => { if (settled) this.lost(); else fail('closed'); });
      });
      peer.on('error', (e) => { if (!settled) fail(e.type || 'error'); });
      peer.on('disconnected', () => { /* signalling only; the game link stays up */ });
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (e) { /* ignore */ } }
  }

  maintain() {
    if (this.closed) return;
    this.send({ t: 'p' });
    if (performance.now() - this.last > CLIENT_STALE_MS) this.lost();
  }

  lost() {
    if (this.closed) return;
    this.closed = true;
    if (this.onClose) this.onClose();
  }

  destroy() {
    this.closed = true;
    try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}
