// The host refuses impossible things from a guest: huge hits, hits across the map, teleports. Run: node test/cheat.mjs
import './stubs.mjs';
let T = 0; performance.now = () => T;
let seed = 7; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const { HostGame } = await import('../js/host.js');
const net = { code: 'TEST', offline: false, peer: null, broadcast() {}, send() {}, sendSnap() {}, canSnap: () => true, kick() {}, markPlayer() {}, rebind() {}, peerIdOf: () => '', silentFor: () => 0 };
const H = new HostGame(net);
H.addPlayer(1, 'Host'); H.addPlayer(2, 'Guest'); H.mode = 'normal'; H.mapPick = 'meydan';
H.start(); for (let i = 0; i < 400 && H.phase !== 'combat'; i++) { T += 33; H.breakT = 0; H.step(); }
const g = H.players.get(2); g.hp = g.maxHp = 1e9;
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const zAt = (dx, dy) => { H.spawnZombie(2); const z = H.zombies[H.zombies.length - 1]; z.x = g.x + dx; z.y = g.y + dy; z.hp = 1e6; return z; };
T += 50;
// 1. a 5000-damage hit on a zombie next to the guest is cut to what the weapon can do
let z = zAt(60, 0); const cap = H.hitCap(g).d;
H.onInput(g, { n: 1, x: g.x, y: g.y, h: [[z.id, 5000, 1]] });
ok(1e6 - z.hp <= cap * 3 + 1 && 1e6 - z.hp > 0, `5000 damage is cut to the weapon's limit (${Math.round(1e6 - z.hp)} dealt, limit ${Math.round(cap)})`);
// 2. a hit on a zombie far beyond the weapon's reach does nothing
z = zAt(3000, 0); H.onInput(g, { n: 2, x: g.x, y: g.y, h: [[z.id, 50, 1]] });
ok(z.hp === 1e6, 'a hit across the map does nothing');
// 3. a normal step is taken
let x0 = g.x; T += 50; H.onInput(g, { n: 3, x: g.x + 10, y: g.y });
ok(Math.abs(g.x - (x0 + 10)) < 0.01, 'a normal step is accepted');
// 4. a teleport is refused and the guest is told to snap back (sp changes); one long jump every 4 s is allowed
x0 = g.x; const y0 = g.y; T += 50;
H.onInput(g, { n: 4, x: g.x + 600, y: g.y }); const first = g.x; // the one allowed jump (getting out of a corner)
T += 50; const sp0 = g.sp; H.onInput(g, { n: 5, x: g.x + 600, y: g.y });
ok(g.sp === sp0 + 1 && Math.abs(g.x - first) < 0.01, 'a second teleport within 4 s is refused and the guest is snapped back');
// 5. after a knockback, a big push is allowed
T += 50; H.knock(g, g.x - 10, g.y, 500); const xk = g.x; H.onInput(g, { n: 6, x: g.x + 300, y: g.y });
ok(Math.abs(g.x - (xk + 300)) < 0.01, 'a big move right after a knockback is accepted');
// 6. walking at full speed for 2 s in small steps is never refused
const spd = H.pc(g).st.spd; let refused = 0;
for (let i = 0; i < 40; i++) { T += 50; const s0 = g.sp; H.onInput(g, { n: 7 + i, x: g.x + spd * 0.05, y: g.y }); if (g.sp !== s0) refused++; }
ok(refused === 0, 'full-speed walking is never refused');
// 7. a guest that was lagging for 1 s and then sends where it really walked is accepted
T += 1000; { const s0 = g.sp; H.onInput(g, { n: 60, x: g.x + spd * 0.95, y: g.y }); ok(g.sp === s0, 'catching up after a 1 s lag spike is accepted'); }
process.exit(fail ? 1 : 0);
