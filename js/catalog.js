// Everything the gem shop sells. Prices come from the server (the owner can change them live); these are the looks.
export const FREE_CLS = ['asker', 'doktor', 'tamirci', 'nisanci'];

// equipment slots: what each one changes, and the prefix of its items
export const SLOTS = [
  { k: 'col', p: 'r', name: 'Renk', none: 'Takım rengi' },
  { k: 'hat', p: 'h', name: 'Şapka', none: 'Sınıfın başlığı' },
  { k: 'wsk', p: 'w', name: 'Silah kaplaması', none: 'Standart' },
  { k: 'frm', p: 'f', name: 'Çerçeve', none: 'Çerçevesiz' },
  { k: 'nc', p: 'n', name: 'İsim rengi', none: 'Beyaz' },
  { k: 'ttl', p: 'u', name: 'Unvan', none: 'Unvansız' },
  { k: 'thm', p: 't', name: 'Tema', none: 'Gece' },
  { k: 'pet', p: 'p', name: 'Evcil hayvan', none: 'Yok' },
];
export const SLOT_OF = Object.fromEntries(SLOTS.map((s) => [s.p, s]));

// rarity decides the card's glow
export const RARITY = { c: 'Sıradan', r: 'Nadir', e: 'Destansı', l: 'Efsanevi', s: 'Sınırlı' };

export const ITEMS = {
  // classes
  'c.izci': { name: 'İzci', r: 'r', cls: 'izci' },
  'c.kalkanci': { name: 'Kalkancı', r: 'r', cls: 'kalkanci' },
  'c.alevci': { name: 'Alevci', r: 'e', cls: 'alevci' },
  'c.bombaci': { name: 'Bombacı', r: 'e', cls: 'bombaci' },
  'c.muhendis': { name: 'Mühendis', r: 'l', cls: 'muhendis' },
  'c.kimyager': { name: 'Kimyager', r: 'l', cls: 'kimyager' },
  'c.komutan': { name: 'Komutan', r: 'l', cls: 'komutan' },
  // colours
  'r.kan': { name: 'Kan kırmızısı', r: 'c', c: '#d61f3a' },
  'r.buz': { name: 'Buz mavisi', r: 'c', c: '#6fd8ff' },
  'r.zehir': { name: 'Zehir yeşili', r: 'c', c: '#74e35a' },
  'r.mor': { name: 'Mor', r: 'c', c: '#9b5cff' },
  'r.pembe': { name: 'Pembe', r: 'c', c: '#ff6fb5' },
  'r.gece': { name: 'Gece mavisi', r: 'r', c: '#3a4fa8' },
  'r.kar': { name: 'Kar beyazı', r: 'r', c: '#e9eef2' },
  'r.siyah': { name: 'Gölge', r: 'r', c: '#2c2f36' },
  'r.altin': { name: 'Altın', r: 'l', c: '#f2c230' },
  // hats
  'h.bere': { name: 'Bere', r: 'c' },
  'h.kulaklik': { name: 'Kulaklık', r: 'c' },
  'h.bandana': { name: 'Bandana', r: 'c' },
  'h.ninja': { name: 'Ninja bandı', r: 'r' },
  'h.sef': { name: 'Aşçı şapkası', r: 'r' },
  'h.kovboy': { name: 'Kovboy şapkası', r: 'r' },
  'h.viking': { name: 'Viking miğferi', r: 'e' },
  'h.tac': { name: 'Taç', r: 'l' },
  'h.hale': { name: 'Hale', r: 's' },
  'h.kabak': { name: 'Bal kabağı', r: 's' },
  'h.noel': { name: 'Noel şapkası', r: 's' },
  // weapon skins: metal, wood and glow colours
  'w.kamo': { name: 'Kamuflaj', r: 'c', m: '#3f4a2c', w: '#5b4a2a', s: '#6e7a45' },
  'w.karbon': { name: 'Karbon', r: 'c', m: '#101214', w: '#26292d', s: '#3a3f45' },
  'w.kan': { name: 'Kanlı', r: 'r', m: '#5a1018', w: '#3a0b10', s: '#c4182c' },
  'w.buz': { name: 'Buzul', r: 'r', m: '#8fd3f0', w: '#5aa9c9', s: '#e8fbff' },
  'w.neon': { name: 'Neon', r: 'e', m: '#1a0f2e', w: '#2a1446', s: '#ff3df2', glow: '#ff3df2' },
  'w.altin': { name: 'Altın', r: 'l', m: '#c9971b', w: '#8a6510', s: '#ffe27a', glow: '#ffd34d' },
  // avatar frames
  'f.bronz': { name: 'Bronz', r: 'c', free: true, c: ['#b07a45', '#6e4524'] },
  'f.gumus': { name: 'Gümüş', r: 'c', c: ['#dfe6ec', '#7d8a96'] },
  'f.zehir': { name: 'Zehirli', r: 'r', c: ['#9dff6b', '#1e7a2a'] },
  'f.neon': { name: 'Neon', r: 'e', c: ['#ff3df2', '#3df2ff'] },
  'f.alev': { name: 'Alev', r: 'e', c: ['#ffd34d', '#ff4a1c'] },
  'f.altin': { name: 'Altın', r: 'l', c: ['#ffe27a', '#b8860b'] },
  // name colours (lobby, tags, profile)
  'n.kirmizi': { name: 'Kırmızı', r: 'c', c: '#ff5a5f' },
  'n.mavi': { name: 'Mavi', r: 'c', c: '#5ab4ff' },
  'n.yesil': { name: 'Yeşil', r: 'c', c: '#6bdc6b' },
  'n.altin': { name: 'Altın', r: 'e', c: '#ffd34d' },
  'n.gokkusagi': { name: 'Gökkuşağı', r: 'l', c: 'rainbow' },
  // titles under the name
  'u.hayatta': { name: 'Hayatta Kalan', r: 'c' },
  'u.avci': { name: 'Zombi Avcısı', r: 'r' },
  'u.kasap': { name: 'Kasap', r: 'e' },
  'u.efsane': { name: 'Efsane', r: 'l' },
  // level road rewards: never sold, earned by levelling up
  'u.er': { name: 'Er', r: 'c', reward: 5 },
  'u.cavus': { name: 'Çavuş', r: 'r', reward: 10 },
  'f.madalya': { name: 'Madalya', r: 'e', reward: 15, c: ['#ffe27a', '#c4182c'] },
  'u.yuzbasi': { name: 'Yüzbaşı', r: 'e', reward: 20 },
  'n.alev': { name: 'Alev', r: 'e', reward: 30, c: '#ff8a3d' },
  'u.albay': { name: 'Albay', r: 'l', reward: 40 },
  'u.general': { name: 'General', r: 'l', reward: 50 },
  // pets: follow their owner around in battle, looks only
  'p.kopek': { name: 'Köpek', r: 'c', c: '#b07a45' },
  'p.kedi': { name: 'Kedi', r: 'c', c: '#e0a050' },
  'p.karga': { name: 'Karga', r: 'r', c: '#2b2f3a' },
  'p.tilki': { name: 'Tilki', r: 'r', c: '#e06a2c' },
  'p.robot': { name: 'Mini robot', r: 'e', c: '#8fa3b8' },
  'p.ejder': { name: 'Yavru ejder', r: 'l', c: '#4fbf6a' },
  // season pass rewards: never sold
  'p.serce': { name: 'Serçe', r: 'r', c: '#9c7b55', season: 'f' },
  'p.kurt': { name: 'Kurt', r: 'l', c: '#9aa3ad', season: 'p' },
  'h.kask': { name: 'Gazi kaskı', r: 'e', season: 'p' },
  'w.gazi': { name: 'Gazi', r: 'e', m: '#4b5320', w: '#6b4a2b', s: '#d9c27a', glow: '#d9c27a', season: 'p' },
  'f.sezon': { name: 'Kış nişanı', r: 'l', c: ['#e8f6ff', '#3a7bd5'], season: 'p' },
  'n.buz': { name: 'Buz', r: 'e', c: '#9fe3ff', season: 'p' },
  'r.zumrut': { name: 'Zümrüt', r: 'r', c: '#1fa67a', season: 'f' },
  'u.gazi': { name: 'Kuşatma Gazisi', r: 'e', season: 'f' },
  // dashboard themes
  't.gece': { name: 'Gece', r: 'c', free: true },
  't.orman': { name: 'Orman', r: 'c', free: true },
  't.kan': { name: 'Kan Ayı', r: 'r' },
  't.kar': { name: 'Kar Fırtınası', r: 'r' },
  't.col': { name: 'Çöl', r: 'r' },
  't.neon': { name: 'Neon Şehir', r: 'e' },
  't.altin': { name: 'Altın Çağ', r: 'l' },
};
export const isFree = (id) => !!(ITEMS[id] && ITEMS[id].free) || (id.startsWith('c.') && FREE_CLS.includes(id.slice(2)));
export const itemColor = (id) => (ITEMS[id] && ITEMS[id].c) || null;
export const nameColor = (eq) => { const c = eq && ITEMS[eq.nc] ? ITEMS[eq.nc].c : null; return c; };
export const titleOf = (eq) => (eq && ITEMS[eq.ttl] ? ITEMS[eq.ttl].name : '');
// the public key that checks the server's signature on a player's pass (who they are, what they own)
export const PASS_KEY = { kty: 'EC', crv: 'P-256', x: 'SQuMIwkdjyF2SJoCIaVgfun7uKxhOVyJc-ZF1ub5EVk', y: 'w5kPbxW9c0Pn84QcJhO0B74JsWGKoUV8ZiS1c8cm-gU' };

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
let keyP = null;
// returns the pass contents when the signature is real and it hasn't run out, otherwise null
export async function checkPass(pass) {
  try {
    if (typeof pass !== 'string' || pass.length > 4000 || !crypto.subtle) return null;
    const [body, sig] = pass.split('.');
    if (!body || !sig) return null;
    if (!keyP) keyP = crypto.subtle.importKey('jwk', PASS_KEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await keyP, b64(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64(body)));
    if (!p || typeof p !== 'object' || !(p.x > Date.now()) || !Array.isArray(p.o)) return null;
    return { id: String(p.i || ''), name: String(p.n || '').slice(0, 16), own: p.o.filter((x) => typeof x === 'string').slice(0, 200), eq: cleanEq(p.e), lvl: Math.max(1, Math.min(100, p.l | 0)) };
  } catch (e) { return null; }
}
// only real item ids, each in its own slot
export function cleanEq(e) {
  const out = {};
  if (!e || typeof e !== 'object') return out;
  for (const s of SLOTS) { const v = e[s.k]; if (typeof v === 'string' && ITEMS[v] && v.startsWith(s.p + '.')) out[s.k] = v; }
  return out;
}
export const ownsCls = (own, cls) => FREE_CLS.includes(cls) || (Array.isArray(own) && own.includes('c.' + cls));

const NK = { '0': 'o', '1': 'i', l: 'i', '|': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g', 'ı': 'i', 'ğ': 'g', 'ş': 's', 'ç': 'c', 'ö': 'o', 'ü': 'u' };
// names: same rule as the server: case, spaces, accents, look-alikes and repeated letters don't make a new name
export const nkey = (n) => [...String(n || '').toLowerCase().normalize('NFKD')].map((c) => NK[c] || c).join('').replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');

