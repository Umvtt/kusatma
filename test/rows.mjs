// The player row the host sends must have exactly the fields the guest reads (client.js unpacks them by position):
// build 64 lost one through a comment inside the array, which shifted every field after it on guests.
import './stubs.mjs';
import { readFileSync } from 'node:fs';
const { HostGame } = await import('../js/host.js');
const net = { code: 'T', offline: true, kick() {}, markPlayer() {}, rebind() {}, peerIdOf: () => '', silentFor: () => 0, canSnap: () => true, idle: () => true, sendSnap() {}, send() {}, broadcast() {} };
const g = new HostGame(net); g.addPlayer(1, 'A'); g.players.get(1).ready = true; g.start();
const row = g.snapshot().P[0];
const src = readFileSync(new URL('../js/client.js', import.meta.url), 'utf8');
const m = src.match(/const \[pid, x, y,[^\]]*\] = e;/); if (!m) throw new Error('client row unpacking not found');
const want = m[0].slice(m[0].indexOf('[') + 1, m[0].indexOf(']')).split(',').length;
if (row.length !== want) { console.error('player row has ' + row.length + ' fields, the guest reads ' + want); process.exit(1); }
const inv = g.players.get(1).inv; if (inv && row[20] === inv) { console.error('the row holds p.inv itself, not a copy'); process.exit(1); }
console.log(row.length + ' fields');
