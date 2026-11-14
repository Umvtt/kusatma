// Compact snapshots (build 60), no browser. 1) the packers give back exactly what went in, on random data.
// 2) A real host and guest on a lossy, reordering, duplicating link: every snapshot the guest accepts must rebuild
// exactly the players and zombie values the host had for it, although most of it came as changes against older ones.
import './stubs.mjs';
import { packZ, unpackZ, packFar, unpackFar, rowDelta, rowApply } from '../js/pack.js';
let seed = 5 >>> 0; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
let bad = 0; const fail = (m) => { if (bad++ < 5) console.log('FAIL', m); };

// 1) round trips
for (let n = 0; n < 2000; n++) {
  const base = new Map(), ents = [], used = new Set();
  for (let i = 0; i < ri(0, 40); i++) {
    let id; do id = ri(1, 300000); while (used.has(id)); used.add(id);
    const x = ri(-500, 9000), y = ri(-500, 9000), kind = ri(0, 3);
    if (rnd() < 0.7) base.set(id, [x + ri(-300, 300), y + ri(-300, 300)]);
    const t = ri(0, 30), hp = ri(1, 99999), st = ri(0, 13), cd = Math.round((rnd() * 12 - 6) * 100) / 100, sf = Math.round((rnd() * 12 - 6) * 100) / 100, fl = ri(0, 8191);
    ents.push([kind, kind === 0 ? [id, x, y] : kind === 1 ? [id, x, y, hp] : [id, t, x, y, hp, st, cd, sf, fl]]);
  }
  const types = new Map(ents.filter(([k]) => k >= 2).map(([, e]) => [e[0], e[1]]));
  const back = unpackZ(packZ(ents, base), base, (id) => types.get(id));
  const want = ents.slice().sort((a, b) => a[1][0] - b[1][0]).map(([, e]) => e);
  if (JSON.stringify(back) !== JSON.stringify(want)) { fail('packZ round trip ' + JSON.stringify(want).slice(0, 200) + ' vs ' + JSON.stringify(back).slice(0, 200)); break; }
  const far = ents.map(([, e]) => [ri(0, 40), ri(0, 1000), ri(0, 1000)]);
  if (JSON.stringify(unpackFar(packFar(far))) !== JSON.stringify(far)) { fail('packFar round trip'); break; }
  const row = [7, ri(0, 9000), ri(0, 9000), 1.25, 50, 100, 1, ri(0, 9999), 3, 2, [1, 2, 3], 0, 0, 1, 0, 0, 0, 1, 2, 0, [0, 1, 0, 0, 0, 0], 0, 0, 0, 0, 0, 0, 0, 12, 0];
  const b = row.slice(); for (let i = 1; i < b.length; i++) if (rnd() < 0.3) b[i] = typeof b[i] === 'object' ? [9] : b[i] + 1;
  if (JSON.stringify(rowApply(rowDelta(row, b), b)) !== JSON.stringify(row)) { fail('row delta round trip'); break; }
}
// a guest without the confirmed snapshot must refuse, not guess
if (unpackZ(packZ([[0, [5, 10, 10]]], new Map([[5, [0, 0]]])), null, () => 0) !== null) fail('relative positions without a base must be refused');

// 2) protocol
Math.random = rnd; let T = 0; performance.now = () => T;
const { HostGame } = await import('../js/host.js');
const { ClientGame } = await import('../js/client.js');
const inbox = [], sent = new Map(); let checked = 0, asks = 0;
const net = {
  code: 'TEST', offline: false, peer: null, broadcast() {}, send() {}, kick() {}, markPlayer() {}, rebind() {}, peerIdOf: () => '', silentFor: () => 0, canSnap: () => true, idle: () => false,
  sendSnap(pid, m) { const c = JSON.parse(JSON.stringify(m)); if (rnd() < 0.3) return; inbox.push([T + (rnd() < 0.3 ? 100 + rnd() * 500 : 30), c]); if (rnd() > 0.95) inbox.push([T + 60, JSON.parse(JSON.stringify(m))]); },
};
const host = new HostGame(net);
host.addPlayer(1, 'Host'); host.addPlayer(2, 'Guest'); host.addPlayer(3, 'Third');
const guest = new ClientGame((m) => { if (m && m.t === 'zr') { asks++; host.handle(2, m); } }, 2);
for (const p of host.players.values()) { p.ready = true; p.build = 60; }
host.mode = 'normal'; host.mapPick = 'meydan'; host.start();
for (const p of host.players.values()) { p.hp = p.maxHp = 1e9; }
// what the host meant to say in each snapshot: its full rows, before any packing
const real = host.sendSnaps.bind(host);
host.sendSnaps = () => { const s0 = host.snapshot.bind(host); host.snapshot = () => { const s = s0(); sent.set((host.snapN || 0) + 1, { P: JSON.parse(JSON.stringify(s.P)), Z: new Map(s.Z.map((z) => [z[0], z])) }); host.snapshot = s0; return s; }; real(); };
const on = guest.onSnap.bind(guest);
guest.onSnap = (m) => {
  const before = guest.lastQ; on(m); if (guest.lastQ === before || guest.lastQ !== m.q) return; // skipped (old, or could not be read)
  const want = sent.get(m.q); if (!want) return; checked++;
  if (JSON.stringify(m.P) !== JSON.stringify(want.P)) fail('players differ at ' + m.q + ': ' + JSON.stringify(m.P).slice(0, 160) + ' vs ' + JSON.stringify(want.P).slice(0, 160));
  for (const e of m.Z) { const h = want.Z.get(e[0]); if (!h) { fail('zombie ' + e[0] + ' not in the host snapshot'); continue; }
    const [x, y] = e.length >= 9 ? [e[2], e[3]] : [e[1], e[2]]; if (x !== h[2] || y !== h[3]) fail('zombie ' + e[0] + ' at ' + x + ',' + y + ' but host ' + h[2] + ',' + h[3]);
    if (e.length >= 4) { const hp = e.length >= 9 ? e[4] : e[3]; if (hp !== h[4]) fail('zombie ' + e[0] + ' health ' + hp + ' vs ' + h[4]); }
    if (e.length >= 9 && (e[1] !== h[1] || e[5] !== h[5] || e[8] !== h[8] || Math.abs(e[6] - h[6]) > 1e-9 || Math.abs(e[7] - h[7]) > 1e-9)) fail('zombie ' + e[0] + ' state differs'); }
};
for (let step = 0; T < 60000; step++) {
  T += 33; host.step();
  const g = host.players.get(2), h1 = host.players.get(1); const a = T / 3000; g.x = h1.x + Math.cos(a) * 700; g.y = h1.y + Math.sin(a) * 500;
  if (step % 25 === 0) { for (const p of host.players.values()) p.gold += ri(-5, 50); const live = host.zombies.filter((z) => !z.dead); for (const z of live.slice(0, 3)) host.damage(z, ri(1, 40), null); }
  if (step % 90 === 0) { const live = host.zombies.filter((z) => !z.dead); for (const z of live.slice(0, live.length >> 2)) host.damage(z, 1e9, null); }
  inbox.sort((x, y) => x[0] - y[0]);
  while (inbox.length && inbox[0][0] <= T) guest.onSnap(inbox.shift()[1]);
  if (guest.lastQ && rnd() < 0.8) host.snapAck(g, guest.lastQ);
  if (sent.size > 400) sent.delete(sent.keys().next().value);
}
console.log(JSON.stringify({ checked, asks, bad }));
process.exit(bad === 0 && checked > 300 ? 0 : 1);
