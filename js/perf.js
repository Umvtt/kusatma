// Performance reports from real games, so the owner can see where and why the game freezes on players' phones.
// Only when the player allowed statistics (cookie banner). Nothing personal: frame speed, freezes, connection kind and
// what was happening in the game. Sent over the live socket that is already open: a short summary every minute while
// playing, and one right after a freeze (at most one extra every 15 s). The server only adds them up.
import { NETSTAT } from './net.js';
import { statsOk } from './consent.js';

const FREEZE_MS = 500;   // a gap this long is a freeze a player notices
const LONG_MS = 200;     // a frame this long is a visible stutter
const SUM_MS = 60000;    // summary period
const EXTRA_MS = 15000;  // at most one early report per this long, after a freeze

const P = { on: false, ctx: null, send: null, w: null, lastFrame: 0, lastSnap: 0, snapGap: 0, sentAt: 0, extraAt: 0, out0: 0, net: '', relay: '' };

function freshWindow(now) {
  P.w = { t0: now, frames: 0, ft: 0, long: 0, stalls: 0, stallMax: 0, snaps: 0, waits: 0, waitMax: 0, ev: [], sk: 0, bf: 0 };
  P.out0 = NETSTAT.out;
}

// what kind of connection the phone is on: the Android app knows for sure, browsers on Android often do, iPhones never tell
export function netKind() {
  try { const a = window.KusatmaApp; if (a && typeof a.netType === 'function') { const t = String(a.netType() || ''); if (t) return t.slice(0, 8); } } catch (e) { /* ignore */ }
  const c = navigator.connection; if (!c) return '?';
  if (c.type === 'wifi' || c.type === 'ethernet') return 'wifi';
  if (c.type === 'cellular') return 'cell';
  if (c.type === 'none') return 'none';
  return '?';
}

// a game starts: ctx() returns { role: 'h'|'g'|'s', map, w, z, pl, vo, vb, q, ping, links() } when asked; send(o) posts it
export function perfStart(ctx, send) {
  P.on = true; P.ctx = ctx; P.send = send; P.relay = ''; P.net = netKind();
  const now = performance.now(); P.lastFrame = 0; P.lastSnap = 0; P.sentAt = now; P.extraAt = -1e9; freshWindow(now);
}
export function perfStop() { if (P.on && P.w && P.w.frames > 60) report(performance.now(), 'end'); P.on = false; P.ctx = null; }
// the guest's link to the host goes through the relay server (TURN) or straight: found once per game from the connection
export function perfRelay(kind) { P.relay = kind; }

// every drawn frame
export function perfFrame(now) {
  if (!P.on) return;
  const w = P.w;
  if (P.lastFrame) {
    const dt = now - P.lastFrame;
    // a page in the background stops drawing: that is not a freeze
    if (dt < 10000 && document.visibilityState === 'visible') {
      w.frames++; w.ft += dt;
      if (dt > LONG_MS) w.long++;
      if (dt > FREEZE_MS) { w.stalls++; w.stallMax = Math.max(w.stallMax, dt); freeze('stall', dt, now); }
    }
  }
  P.lastFrame = now;
  if (now - P.sentAt >= SUM_MS) report(now, 'min');
}

// a guest got a snapshot; a long wait before it is a freeze the player sees as zombies standing still
export function perfSnap(now, msg) {
  if (!P.on) return;
  const w = P.w; w.snaps++;
  if (P.lastSnap && document.visibilityState === 'visible') {
    const gap = now - P.lastSnap;
    if (gap > FREEZE_MS && gap < 60000) { w.waits++; w.waitMax = Math.max(w.waitMax, gap); let size = 0; try { size = JSON.stringify(msg).length; } catch (e) { /* ignore */ } freeze('wait', gap, now, size); }
  }
  P.lastSnap = now;
}

function freeze(k, ms, now, size) {
  const w = P.w, c = P.ctx ? P.ctx() : {};
  if (w.ev.length < 5) w.ev.push({ k, ms: Math.round(ms), w: c.w | 0, z: c.z | 0, pl: c.pl | 0, ping: c.ping | 0, sz: size | 0, vo: c.vo ? 1 : 0 });
  if (now - P.extraAt > EXTRA_MS && now - P.sentAt > 3000) { P.extraAt = now; report(now, 'frz'); }
}

function report(now, why) {
  const w = P.w, c = P.ctx ? P.ctx() : {}, secs = Math.max(1, (now - w.t0) / 1000);
  // the host: how its links to the guests are doing
  if (c.links) for (const [sk, bf] of c.links()) { w.sk += sk; w.bf = Math.max(w.bf, bf); }
  const o = {
    e: 'pf', why, r: c.role || 's', secs: Math.round(secs),
    fps: w.frames ? Math.round(1000 * w.frames / w.ft) : 0, lf: w.long, st: w.stalls, stx: Math.round(w.stallMax),
    sn: w.snaps, wt: w.waits, wtx: Math.round(w.waitMax),
    up: Math.round((NETSTAT.out - P.out0) / secs / 102.4) / 10, sk: w.sk, bf: Math.round(w.bf / 1024),
    vo: c.vo ? 1 : 0, vb: c.vb | 0, q: c.q || '', nt: P.net = netKind(), rl: P.relay, map: c.map || '', w: c.w | 0, z: c.z | 0, pl: c.pl | 0, ping: c.ping | 0,
    ev: w.ev,
  };
  P.sentAt = now; freshWindow(now);
  if (!statsOk() || !P.send) return;
  try { P.send(o); } catch (e) { /* ignore */ }
}
