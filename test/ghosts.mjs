// Ghost-zombie protocol check, no browser: a real HostGame and a real ClientGame talk through a fake network that
// loses, reorders, duplicates and delays snapshots and freezes acknowledgements. After every quiet moment the guest
// must hold no zombie the host killed more than a second ago. Run: node test/ghosts.mjs [seed] [seconds]
import './stubs.mjs';
let seed = +(process.argv[2] || 1) >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
Math.random = rnd; // the whole game becomes repeatable
let T = 0; performance.now = () => T;
const { HostGame } = await import('../js/host.js');
const { ClientGame } = await import('../js/client.js');

const inbox = []; // [arriveAt, msg]
let frozenUntil = 0;
const net = {
  code: 'TEST', offline: false, peer: null,
  broadcast() {}, send() {}, kick() {}, markPlayer() {}, rebind() {}, peerIdOf: () => '', silentFor: () => 0,
  canSnap: () => true,
  sendSnap(pid, m) {
    const r = rnd(), c = JSON.parse(JSON.stringify(m));
    if (r < 0.4 || T < outUntil) return; // lost
    inbox.push([T + (r < 0.6 ? 100 + rnd() * 600 : 30), c]); // late (out of order) or normal
    if (r > 0.95) inbox.push([T + 50 + rnd() * 300, JSON.parse(JSON.stringify(m))]); // twice
  },
};
const host = new HostGame(net);
host.addPlayer(1, 'Host'); host.addPlayer(2, 'Guest');
const guest = new ClientGame(() => {}, 2);
for (const p of host.players.values()) p.ready = true;
host.mode = 'normal'; host.mapPick = 'meydan';
host.start();
for (const p of host.players.values()) { p.hp = p.maxHp = 1e9; }
const killedAt = new Map();
const realDamage = host.damage.bind(host);
host.damage = (z, d, p) => { const was = z.dead; realDamage(z, d, p); if (!was && z.dead) killedAt.set(z.id, T); };

const secs = +(process.argv[3] || 120);
// 'nonet' switches off the guest's safety net, so only the host's removal protocol is tested
const NONET = process.argv.includes('nonet');
let worst = 0, checks = 0, applied = 0;
const gw = { a: 0, r: 200 };
let outUntil = 0; // a full outage: nothing arrives and no acknowledgement leaves
for (let step = 0; T < secs * 1000; step++) {
  T += 33; host.step();
  // the guest stays near the host so most zombies are in its range
  const g = host.players.get(2), h = host.players.get(1);
  // the guest wanders up to 1500 px from the host, so zombies keep crossing its 1800 px range
  gw.a += (rnd() - 0.5) * 0.3; gw.r = Math.max(100, Math.min(1500, gw.r + (rnd() - 0.5) * 40)); g.x = h.x + Math.cos(gw.a) * gw.r; g.y = h.y + Math.sin(gw.a) * gw.r;
  // deliver due snapshots in arrival order, then acknowledge (unless frozen)
  inbox.sort((a, b) => a[0] - b[0]);
  while (inbox.length && inbox[0][0] <= T) { if (NONET) for (const z of guest.zs.values()) z.seenN = 1e9; guest.onSnap(inbox.shift()[1]); applied++; }
  if (T > frozenUntil && rnd() < 0.002) frozenUntil = T + 1500 + rnd() * 3000; // ack goes quiet for up to 4.5 s
  if (T > outUntil && rnd() < 0.0015) outUntil = T + 2000 + rnd() * 4000; // Wi-Fi drops for 2–6 s both ways
  if (T > frozenUntil && T > outUntil && guest.lastQ) host.snapAck(g, guest.lastQ);
  // chaos on the host: spawn near the guest and kill half of everything now and then
  if (step % 20 === 0) {
    for (let i = 0; i < 6; i++) { host.spawnZombie(i % 9); const z = host.zombies[host.zombies.length - 1]; const a = rnd() * 6.283, d = rnd() * 2200; z.x = g.x + Math.cos(a) * d; z.y = g.y + Math.sin(a) * d; }
    const live = host.zombies.filter((z) => !z.dead); for (const z of live.slice(0, live.length >> 1)) host.damage(z, 1e9, null);
    host.queue = [0, 0, 0];
  }
  // check: anything the guest still shows that died over 2.5 s ago (longer than the worst freeze + delay) is a ghost
  if (step % 30 === 0 && T > 5000 && T > frozenUntil + 1000 && T > outUntil + 1500) {
    let ghosts = 0;
    for (const id of guest.zs.keys()) { const k = killedAt.get(id); if (k != null && T - k > Math.max(2500, T - frozenUntil > 0 ? 2500 : 0)) ghosts++; }
    worst = Math.max(worst, ghosts); checks++;
  }
}
console.log(JSON.stringify({ seed: process.argv[2] || 1, seconds: secs, snapshotsApplied: applied, checks, worstGhosts: worst }));
process.exit(worst === 0 && checks > 10 ? 0 : 1);
