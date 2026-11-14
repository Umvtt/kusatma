// Compact snapshot pieces (build 60, protocol VERSION 22). Plain JSON writes "1234," for every number; the busiest
// parts of a snapshot (zombies that only moved, and the minimap's picture of every zombie) go instead as one string
// of fixed-width base-64 digits, about half the size. Both sides share these helpers.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; // safe inside JSON, no escaping
const VAL = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) VAL[ABC.charCodeAt(i)] = i;

function put(out, n, w) { for (let i = w - 1; i >= 0; i--) out.push(ABC[(n >> (6 * i)) & 63]); }
function get(s, at, w) { let n = 0; for (let i = 0; i < w; i++) { const v = VAL[s.charCodeAt(at + i)]; if (v < 0) return NaN; n = n * 64 + v; } return n; }

const OFF = 65536; // positions may sit a little outside the world; 3 digits hold 0..262143
const clampPos = (v) => Math.max(0, Math.min(262143, (v | 0) + OFF));

// zombies that only moved: id (4 digits) + x (3) + y (3)
export function packMoves(list) {
  const out = [];
  for (const [id, x, y] of list) { put(out, id & 0xffffff, 4); put(out, clampPos(x), 3); put(out, clampPos(y), 3); }
  return out.join('');
}
export function unpackMoves(s) {
  const out = [];
  if (typeof s !== 'string' || s.length % 10) return out;
  for (let i = 0; i < s.length; i += 10) {
    const id = get(s, i, 4), x = get(s, i + 4, 3) - OFF, y = get(s, i + 7, 3) - OFF;
    if (Number.isFinite(id) && Number.isFinite(x) && Number.isFinite(y)) out.push([id, x, y]);
  }
  return out;
}

// Zombies that only moved, smallest form: sorted by id, each as the gap to the previous id, then its position either
// as the change since the snapshot the guest confirmed (a few px: one or two digits) or, when that snapshot did not
// carry it, in full. Numbers use 5 bits per digit plus a "more follows" bit, so small ones take one digit.
function vput(out, n) { while (n >= 32) { out.push(ABC[32 | (n % 32)]); n = Math.floor(n / 32); } out.push(ABC[n]); }
function vget(s, st) { let n = 0, mul = 1; for (;;) { if (st.i >= s.length) return NaN; const v = VAL[s.charCodeAt(st.i++)]; if (v < 0) return NaN; n += (v & 31) * mul; if (!(v & 32)) return n; mul *= 32; if (mul > 2 ** 35) return NaN; } }
const zz = (v) => (v >= 0 ? 2 * v : -2 * v - 1), unzz = (n) => (n % 2 ? -(n + 1) / 2 : n / 2);
// Every zombie in one string. Entries are sorted by id; each starts with (gap to previous id) * 8 + kind * 2 + rel:
//   kind 0 moved only: x, y          kind 1 health changed: x, y, hp
//   kind 2 state changed: x, y, hp, st, cdir*100, sface*100, fl          kind 3 new to this guest: the same plus its type
// rel = position as the change since the confirmed snapshot (base: Map id -> [x, y] from it), else in full.
// Decoded back into the arrays the client always used: [id,x,y], [id,x,y,hp], [id,t,x,y,hp,st,cdir,sface,fl].
export function packZ(entries, base) {
  const out = []; let prev = 0;
  for (const [kind, e] of entries.slice().sort((a, b) => a[1][0] - b[1][0])) {
    const id = e[0], x = kind >= 2 ? e[2] : e[1], y = kind >= 2 ? e[3] : e[2], b = base && base.get(id), rel = b ? 1 : 0;
    vput(out, (id - prev) * 8 + kind * 2 + rel); prev = id;
    if (rel) { vput(out, zz(x - b[0])); vput(out, zz(y - b[1])); } else { vput(out, zz(x)); vput(out, zz(y)); }
    if (kind === 1) vput(out, zz(e[3] | 0));
    if (kind >= 2) { vput(out, zz(e[4] | 0)); vput(out, e[5] | 0); vput(out, zz(Math.round(e[6] * 100) | 0)); vput(out, zz(Math.round(e[7] * 100) | 0)); vput(out, e[8] | 0); }
    if (kind === 3) vput(out, e[1] | 0);
  }
  return out.join('');
}
// typeOf(id) gives the type of a zombie we already have (for kind 2); returns null when the string cannot be read
export function unpackZ(s, base, typeOf) {
  if (typeof s !== 'string') return null;
  const out = [], st = { i: 0 }; let prev = 0;
  while (st.i < s.length) {
    const g = vget(s, st); if (!Number.isFinite(g)) return null;
    const id = prev + Math.floor(g / 8), kind = Math.floor(g / 2) % 4, rel = g % 2; prev = id;
    let x = vget(s, st), y = vget(s, st); if (!Number.isFinite(x + y)) return null;
    if (rel) { const b = base && base.get(id); if (!b) return null; x = b[0] + unzz(x); y = b[1] + unzz(y); } else { x = unzz(x); y = unzz(y); }
    if (kind === 0) { out.push([id, x, y]); continue; }
    if (kind === 1) { const hp = vget(s, st); if (!Number.isFinite(hp)) return null; out.push([id, x, y, unzz(hp)]); continue; }
    const hp = vget(s, st), zs = vget(s, st), cd = vget(s, st), sf = vget(s, st), fl = vget(s, st);
    if (!Number.isFinite(hp + zs + cd + sf + fl)) return null;
    let t;
    if (kind === 3) { t = vget(s, st); if (!Number.isFinite(t)) return null; } else { t = typeOf(id); if (t == null) return null; }
    out.push([id, t, x, y, unzz(hp), zs, unzz(cd) / 100, unzz(sf) / 100, fl]);
  }
  return out;
}

// the minimap's coarse picture: type (1 digit) + x/8 (2) + y/8 (2); positions are clamped to the map's size
export function packFar(list) {
  const out = [];
  for (const [t, x8, y8] of list) { put(out, t & 63, 1); put(out, Math.max(0, Math.min(4095, x8 | 0)), 2); put(out, Math.max(0, Math.min(4095, y8 | 0)), 2); }
  return out.join('');
}
export function unpackFar(s) {
  const out = [];
  if (typeof s !== 'string' || s.length % 5) return out;
  for (let i = 0; i < s.length; i += 5) { const t = get(s, i, 1), x = get(s, i + 1, 2), y = get(s, i + 3, 2); if (Number.isFinite(t + x + y)) out.push([t, x, y]); }
  return out;
}

// players: only the fields that differ from the snapshot the guest has confirmed. A row is [pid, mask, ...values]:
// bit i of mask means field i + 1 of the full row comes next. The guest rebuilds the row from its own copy of that
// confirmed snapshot, so a value that changed and changed back is still right.
const same = (a, b) => a === b || (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null && JSON.stringify(a) === JSON.stringify(b));
export function rowDelta(row, base) {
  if (row.length !== base.length || row.length > 31) return null; // the row's shape changed: send it whole
  let mask = 0; const vals = [];
  for (let i = 1; i < row.length; i++) if (!same(row[i], base[i])) { mask |= 1 << (i - 1); vals.push(row[i]); }
  return [row[0], mask, ...vals];
}
export function rowApply(d, base) {
  if (!Array.isArray(d) || !Array.isArray(base) || !Number.isInteger(d[1])) return null;
  const row = base.slice(); let k = 2;
  for (let i = 1; i < row.length; i++) if (d[1] & (1 << (i - 1))) { if (k >= d.length) return null; row[i] = d[k++]; }
  return k === d.length ? row : null;
}
