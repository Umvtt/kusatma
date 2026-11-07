// Shared game constants. Everything the player sees is Turkish; code identifiers stay English.

export const VERSION = 5;
// Increase by one with every release; shown in the bottom-left corner.
export const BUILD = 9;
export const MAX_PLAYERS = 15;
export const NAME_MAX = 16;
export const CODE_LEN = 6;

// The whole world is generated up front; only the playable area inside it grows with the player count.
export const WORLD_W = 4400;
export const WORLD_H = 3000;
export const CX = WORLD_W / 2;
export const CY = WORLD_H / 2;
export const PLAYER_R = 16;

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.6;

// Playable size for n players: 1800x1200 alone, 4320x2880 with 15.
export function areaFor(n) {
  const k = Math.min(MAX_PLAYERS, Math.max(1, n)) - 1;
  return { w: 1800 + k * 180, h: 1200 + k * 120 };
}

export const MAP_ORDER = ['meydan', 'benzinlik', 'hastane', 'orman'];
export const MAPS = {
  meydan: { name: 'Meydan', desc: 'Beton bloklar ve kasalarla dolu terk edilmiş bir şehir meydanı.' },
  benzinlik: { name: 'Benzinlik', desc: 'Yol kenarı, terk edilmiş arabalar, pompalar ve küçük dükkanlar.' },
  hastane: { name: 'Hastane Bahçesi', desc: 'Çitler, ambulanslar ve hastane binaları arasında dar yollar.' },
  orman: { name: 'Orman', desc: 'Sık ağaçlar, kayalar ve devrilmiş kütükler. Görüş kısa.' },
};

export const DIFF_ORDER = ['kolay', 'normal', 'zor', 'kabus'];
export const DIFFS = {
  kolay: { name: 'Kolay', desc: 'Zombiler daha zayıf ve az.', hp: 0.75, dmg: 0.7, count: 0.8, spd: 0.95, gold: 1.2 },
  normal: { name: 'Normal', desc: 'Dengeli bir kuşatma.', hp: 1, dmg: 1, count: 1, spd: 1, gold: 1 },
  zor: { name: 'Zor', desc: 'Daha çok, daha güçlü zombi.', hp: 1.3, dmg: 1.3, count: 1.2, spd: 1.08, gold: 1 },
  kabus: { name: 'Kâbus', desc: 'Sadece en iyi takımlar için.', hp: 1.7, dmg: 1.6, count: 1.4, spd: 1.15, gold: 0.9 },
};

export const PLAYER_COLORS = [
  '#ff8a3d', '#4cc9f0', '#f15bb5', '#9ef01a', '#ffd23f',
  '#c77dff', '#00f5d4', '#ff595e', '#7bdff2', '#f4a259',
  '#b8f2e6', '#e9c46a', '#ff99c8', '#a0c4ff', '#caffbf',
];

export const CLASS_ORDER = ['asker', 'doktor', 'tamirci', 'nisanci', 'kalkanci', 'alevci', 'bombaci', 'izci'];

// kind: 'b' bullet, 'f' flame, 'g' grenade
export const CLASSES = {
  asker: {
    name: 'Asker', weapon: 'Tüfek', tiers: ['Tüfek', 'Piyade tüfeği', 'Savaş tüfeği'], desc: 'Dengeli ve dayanıklı. Her duruma uyar.',
    hp: 120, spd: 215, dmg: 20, rate: 8, spread: 0.045, bspd: 1150, life: 0.7, pellets: 1, pierce: 0, kind: 'b', gun: 28,
    ab: { name: 'Hızlı Ateş', desc: '6 saniye boyunca iki kat hızlı ateş edersin.', cd: 20, dur: 6 },
    bars: { can: 0.6, hiz: 0.55, hasar: 0.6 },
  },
  doktor: {
    name: 'Doktor', weapon: 'Makineli', tiers: ['Makineli', 'Susturuculu makineli', 'Çift şarjörlü makineli'], desc: 'Takımı ayakta tutar, düşenleri kaldırır.',
    hp: 100, spd: 232, dmg: 12, rate: 12, spread: 0.09, bspd: 1000, life: 0.55, pellets: 1, pierce: 0, kind: 'b', gun: 22,
    ab: { name: 'İyileştir', desc: 'Yakındaki herkesi iyileştirir, düşenleri ayağa kaldırır.', cd: 18, r: 220, heal: 45 },
    bars: { can: 0.45, hiz: 0.75, hasar: 0.45 },
  },
  tamirci: {
    name: 'Tamirci', weapon: 'Pompalı', tiers: ['Pompalı', 'Otomatik pompalı', 'Ağır pompalı'], desc: 'Yakın mesafede yıkıcı. Kendi taretini kurar.',
    hp: 135, spd: 205, dmg: 13, rate: 1.6, spread: 0.3, bspd: 950, life: 0.32, pellets: 7, pierce: 0, kind: 'b', gun: 24,
    ab: { name: 'Taret', desc: '20 saniye boyunca zombilere ateş eden bir taret kurar.', cd: 24, dur: 20, dmg: 13, rate: 0.2, range: 420 },
    bars: { can: 0.65, hiz: 0.45, hasar: 0.75 },
  },
  nisanci: {
    name: 'Nişancı', weapon: 'Dürbünlü tüfek', tiers: ['Dürbünlü tüfek', 'Uzun namlu', 'Ağır nişancı tüfeği'], desc: 'Az ama ölümcül atış. Mermiler sürüyü deler.',
    hp: 90, spd: 210, dmg: 95, rate: 1.1, spread: 0.008, bspd: 1900, life: 0.9, pellets: 1, pierce: 3, kind: 'b', gun: 36,
    ab: { name: 'Odak', desc: '5 saniye boyunca iki kat hasar, mermiler her şeyi deler.', cd: 18, dur: 5 },
    bars: { can: 0.35, hiz: 0.5, hasar: 1 },
  },
  kalkanci: {
    name: 'Kalkancı', weapon: 'Ağır makineli', tiers: ['Ağır makineli', 'Döner namlu', 'Dev döner namlu'], desc: 'Önde durur, sürünün darbesini karşılar.',
    hp: 210, spd: 180, dmg: 9, rate: 13, spread: 0.13, bspd: 1050, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 30,
    ab: { name: 'Kalkan', desc: '5 saniye boyunca aldığın hasar %70 azalır.', cd: 20, dur: 5 },
    bars: { can: 1, hiz: 0.3, hasar: 0.5 },
  },
  alevci: {
    name: 'Alevci', weapon: 'Alev makinesi', tiers: ['Alev makinesi', 'Yüksek basınçlı alev', 'Napalm makinesi'], desc: 'Kısa menzil, sürüyü toptan yakar.',
    hp: 125, spd: 205, dmg: 5, rate: 22, spread: 0.16, bspd: 560, life: 0.36, pellets: 1, pierce: 2, kind: 'f', gun: 26,
    ab: { name: 'Alev Patlaması', desc: 'Etrafındaki tüm zombileri bir anda yakar.', cd: 16, r: 170, dmg: 70 },
    bars: { can: 0.6, hiz: 0.45, hasar: 0.7 },
  },
  bombaci: {
    name: 'Bombacı', weapon: 'Bomba atar', tiers: ['Bomba atar', 'Altılı bomba atar', 'Ağır bomba atar'], desc: 'Her atış patlar. Kalabalığa karşı birebir.',
    hp: 110, spd: 205, dmg: 70, rate: 1.15, spread: 0.03, bspd: 720, life: 0.85, pellets: 1, pierce: 0, kind: 'g', aoe: 95, gun: 26,
    ab: { name: 'Mayın', desc: 'Ayağının dibine mayın bırakır. Aynı anda en fazla 3 mayın.', cd: 8, dmg: 220, r: 140, max: 3 },
    bars: { can: 0.5, hiz: 0.45, hasar: 0.85 },
  },
  izci: {
    name: 'İzci', weapon: 'Çift tabanca', tiers: ['Çift tabanca', 'Çift otomatik tabanca', 'Çift magnum'], desc: 'Takımın en hızlısı. Vur ve kaç.',
    hp: 95, spd: 262, dmg: 15, rate: 7, spread: 0.05, bspd: 1150, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 18,
    ab: { name: 'Depar', desc: '4 saniye boyunca %60 daha hızlı koşarsın.', cd: 14, dur: 4 },
    bars: { can: 0.4, hiz: 1, hasar: 0.45 },
  },
};

export const UPGRADES = [
  { k: 'dmg', name: 'Hasar', desc: '+%15 hasar', base: 40, max: 10 },
  { k: 'rate', name: 'Atış hızı', desc: '+%10 atış hızı', base: 40, max: 10 },
  { k: 'hp', name: 'Dayanıklılık', desc: '+20 azami can', base: 35, max: 10 },
  { k: 'spd', name: 'Çeviklik', desc: '+%6 hareket hızı', base: 30, max: 6 },
  { k: 'cd', name: 'Yetenek', desc: '−%10 yetenek bekleme süresi', base: 45, max: 5 },
];
export const HEAL_COST = 25;

// Weapon tiers bought in the armory: more damage and fire rate, plus a class-specific bonus.
export const WEAPON_COST = [0, 150, 400];
export const WEAPON_DMG = [1, 1.35, 1.8];
export const WEAPON_RATE = [1, 1.1, 1.2];
export function weaponOf(cls, wt) {
  const c = CLASSES[cls] || CLASSES.asker;
  const t = Math.max(0, Math.min(2, wt | 0));
  return {
    ...c,
    tier: t,
    name: c.tiers[t],
    pellets: c.pellets + (cls === 'tamirci' ? 2 * t : 0),
    pierce: c.pierce + (cls === 'nisanci' ? t : 0),
    aoe: (c.aoe || 0) + (cls === 'bombaci' ? 15 * t : 0),
    life: c.life + (cls === 'alevci' ? 0.05 * t : 0),
  };
}

// Items zombies sometimes drop. k is sent over the network.
export const ITEMS = [
  { name: 'Sargı', col: '#43d17a' },        // heals
  { name: 'Altın', col: '#f5c542' },        // gold
  { name: 'Güç', col: '#ff6b2c', dur: 10 }, // double damage
  { name: 'Hız', col: '#4cc9f0', dur: 10 }, // faster movement
];
export const upgradeCost = (u, lv) => Math.round(u.base * Math.pow(1.55, lv));

// t index is sent over the network
export const ZTYPES = [
  { name: 'Yürüyen', hp: 40, spd: 72, r: 15, dps: 14, gold: 5, col: '#6f8a58', dark: '#3e5233' },
  { name: 'Koşucu', hp: 24, spd: 140, r: 12, dps: 9, gold: 7, col: '#a5b56b', dark: '#5d6a35' },
  { name: 'İri', hp: 260, spd: 52, r: 25, dps: 30, gold: 25, col: '#55704c', dark: '#2c3d28' },
  { name: 'Dev', hp: 1600, spd: 62, r: 40, dps: 50, gold: 150, col: '#8a4a3c', dark: '#4a221a' },
  { name: 'Tükürücü', hp: 50, spd: 88, r: 14, dps: 6, gold: 12, col: '#8f9a3a', dark: '#4d5420' },
  { name: 'Patlayan', hp: 45, spd: 96, r: 15, dps: 0, gold: 10, col: '#c07a3a', dark: '#6a3a18' },
  { name: 'Kalkanlı', hp: 120, spd: 62, r: 18, dps: 18, gold: 18, col: '#6a7682', dark: '#2d3540' },
  { name: 'Çağırıcı', hp: 90, spd: 70, r: 16, dps: 8, gold: 25, col: '#7a5a8a', dark: '#352440' },
  { name: 'Kraliçe', hp: 1400, spd: 55, r: 36, dps: 30, gold: 150, col: '#8a9a2a', dark: '#3d4512', boss: true },
  { name: 'Koç', hp: 1800, spd: 72, r: 36, dps: 40, gold: 150, col: '#7a4a32', dark: '#36190f', boss: true },
];
ZTYPES[3].boss = true;
export const BOSS_ORDER = [3, 8, 9]; // Dev, Kraliçe, Koç, then repeat
export const isBoss = (t) => !!(ZTYPES[t] && ZTYPES[t].boss);
// Charging zombies: the İri and the Koç boss.
export const CHARGE = {
  2: { spd: 420, dur: 0.85, wind: 0.7, cd: 4.5, min: 130, max: 380, dmg: 22, kb: 560 },
  9: { spd: 560, dur: 1.0, wind: 0.55, cd: 2.5, min: 140, max: 560, dmg: 35, kb: 700 },
};
// Front arc (radians either side of facing) a Kalkanlı blocks bullets in.
export const SHIELD_ARC = 1.15;
export const zMaxHp = (t, wave, n, hm = 1) =>
  ZTYPES[t].hp * hm * (1 + (Math.max(1, wave) - 1) * 0.12) * (ZTYPES[t].boss ? 1 + 0.35 * (Math.max(1, n) - 1) : 1);

// zombie states sent over the network
export const ZS = { NORMAL: 0, WINDUP: 1, DASH: 2, SLAM: 3, SPIT: 4, FUSE: 5, SUMMON: 6 };

export const FIRST_BREAK = 8;
export const BREAK_TIME = 25;
export const START_GOLD = 40;

export function stats(cls, lv, wt = 0) {
  const c = CLASSES[cls] || CLASSES.asker;
  const t = Math.max(0, Math.min(2, wt | 0));
  return {
    maxHp: c.hp + 20 * lv.hp,
    spd: c.spd * (1 + 0.06 * lv.spd),
    dmg: c.dmg * (1 + 0.15 * lv.dmg) * WEAPON_DMG[t],
    rate: c.rate * (1 + 0.1 * lv.rate) * WEAPON_RATE[t],
    cd: Math.max(0.4, 1 - 0.1 * lv.cd),
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
