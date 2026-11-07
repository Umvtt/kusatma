// Shared game constants. Everything the player sees is Turkish; code identifiers stay English.

export const VERSION = 3;
// Increase by one with every release; shown in the bottom-left corner.
export const BUILD = 4;
export const MAX_PLAYERS = 15;
export const NAME_MAX = 16;
export const CODE_LEN = 6;

export const MAP_W = 2400;
export const MAP_H = 1600;
export const PLAYER_R = 16;

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.6;

// Rectangular cover. k: 'beton' (concrete) or 'kasa' (crate)
export const OBSTACLES = [
  { x: 520, y: 340, w: 220, h: 60, k: 'beton' },
  { x: 520, y: 400, w: 60, h: 140, k: 'beton' },
  { x: 1660, y: 340, w: 220, h: 60, k: 'beton' },
  { x: 1820, y: 400, w: 60, h: 140, k: 'beton' },
  { x: 520, y: 1200, w: 220, h: 60, k: 'beton' },
  { x: 520, y: 1060, w: 60, h: 140, k: 'beton' },
  { x: 1660, y: 1200, w: 220, h: 60, k: 'beton' },
  { x: 1820, y: 1060, w: 60, h: 140, k: 'beton' },
  { x: 1080, y: 200, w: 240, h: 50, k: 'beton' },
  { x: 1080, y: 1350, w: 240, h: 50, k: 'beton' },
  { x: 250, y: 740, w: 50, h: 120, k: 'beton' },
  { x: 2100, y: 740, w: 50, h: 120, k: 'beton' },
  { x: 900, y: 620, w: 56, h: 56, k: 'kasa' },
  { x: 1444, y: 620, w: 56, h: 56, k: 'kasa' },
  { x: 900, y: 924, w: 56, h: 56, k: 'kasa' },
  { x: 1444, y: 924, w: 56, h: 56, k: 'kasa' },
  { x: 1180, y: 540, w: 40, h: 40, k: 'kasa' },
  { x: 1180, y: 1020, w: 40, h: 40, k: 'kasa' },
];

export const PLAYER_COLORS = [
  '#ff8a3d', '#4cc9f0', '#f15bb5', '#9ef01a', '#ffd23f',
  '#c77dff', '#00f5d4', '#ff595e', '#7bdff2', '#f4a259',
  '#b8f2e6', '#e9c46a', '#ff99c8', '#a0c4ff', '#caffbf',
];

export const CLASS_ORDER = ['asker', 'doktor', 'tamirci', 'nisanci', 'kalkanci', 'alevci', 'bombaci', 'izci'];

// kind: 'b' bullet, 'f' flame, 'g' grenade
export const CLASSES = {
  asker: {
    name: 'Asker', weapon: 'Tüfek', desc: 'Dengeli ve dayanıklı. Her duruma uyar.',
    hp: 120, spd: 215, dmg: 20, rate: 8, spread: 0.045, bspd: 1150, life: 0.7, pellets: 1, pierce: 0, kind: 'b', gun: 28,
    ab: { name: 'Hızlı Ateş', desc: '6 saniye boyunca iki kat hızlı ateş edersin.', cd: 20, dur: 6 },
    bars: { can: 0.6, hiz: 0.55, hasar: 0.6 },
  },
  doktor: {
    name: 'Doktor', weapon: 'Makineli', desc: 'Takımı ayakta tutar, düşenleri kaldırır.',
    hp: 100, spd: 232, dmg: 12, rate: 12, spread: 0.09, bspd: 1000, life: 0.55, pellets: 1, pierce: 0, kind: 'b', gun: 22,
    ab: { name: 'İyileştir', desc: 'Yakındaki herkesi iyileştirir, düşenleri ayağa kaldırır.', cd: 18, r: 220, heal: 45 },
    bars: { can: 0.45, hiz: 0.75, hasar: 0.45 },
  },
  tamirci: {
    name: 'Tamirci', weapon: 'Pompalı', desc: 'Yakın mesafede yıkıcı. Kendi taretini kurar.',
    hp: 135, spd: 205, dmg: 13, rate: 1.6, spread: 0.3, bspd: 950, life: 0.32, pellets: 7, pierce: 0, kind: 'b', gun: 24,
    ab: { name: 'Taret', desc: '20 saniye boyunca zombilere ateş eden bir taret kurar.', cd: 24, dur: 20, dmg: 13, rate: 0.2, range: 420 },
    bars: { can: 0.65, hiz: 0.45, hasar: 0.75 },
  },
  nisanci: {
    name: 'Nişancı', weapon: 'Dürbünlü tüfek', desc: 'Az ama ölümcül atış. Mermiler sürüyü deler.',
    hp: 90, spd: 210, dmg: 95, rate: 1.1, spread: 0.008, bspd: 1900, life: 0.9, pellets: 1, pierce: 3, kind: 'b', gun: 36,
    ab: { name: 'Odak', desc: '5 saniye boyunca iki kat hasar, mermiler her şeyi deler.', cd: 18, dur: 5 },
    bars: { can: 0.35, hiz: 0.5, hasar: 1 },
  },
  kalkanci: {
    name: 'Kalkancı', weapon: 'Ağır makineli', desc: 'Önde durur, sürünün darbesini karşılar.',
    hp: 210, spd: 180, dmg: 9, rate: 13, spread: 0.13, bspd: 1050, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 30,
    ab: { name: 'Kalkan', desc: '5 saniye boyunca aldığın hasar %70 azalır.', cd: 20, dur: 5 },
    bars: { can: 1, hiz: 0.3, hasar: 0.5 },
  },
  alevci: {
    name: 'Alevci', weapon: 'Alev makinesi', desc: 'Kısa menzil, sürüyü toptan yakar.',
    hp: 125, spd: 205, dmg: 5, rate: 22, spread: 0.16, bspd: 560, life: 0.36, pellets: 1, pierce: 2, kind: 'f', gun: 26,
    ab: { name: 'Alev Patlaması', desc: 'Etrafındaki tüm zombileri bir anda yakar.', cd: 16, r: 170, dmg: 70 },
    bars: { can: 0.6, hiz: 0.45, hasar: 0.7 },
  },
  bombaci: {
    name: 'Bombacı', weapon: 'Bomba atar', desc: 'Her atış patlar. Kalabalığa karşı birebir.',
    hp: 110, spd: 205, dmg: 70, rate: 1.15, spread: 0.03, bspd: 720, life: 0.85, pellets: 1, pierce: 0, kind: 'g', aoe: 95, gun: 26,
    ab: { name: 'Mayın', desc: 'Ayağının dibine mayın bırakır. Aynı anda en fazla 3 mayın.', cd: 8, dmg: 220, r: 140, max: 3 },
    bars: { can: 0.5, hiz: 0.45, hasar: 0.85 },
  },
  izci: {
    name: 'İzci', weapon: 'Çift tabanca', desc: 'Takımın en hızlısı. Vur ve kaç.',
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
export const upgradeCost = (u, lv) => Math.round(u.base * Math.pow(1.55, lv));

// t index is sent over the network
export const ZTYPES = [
  { name: 'Yürüyen', hp: 40, spd: 72, r: 15, dps: 14, gold: 5, col: '#6f8a58', dark: '#3e5233' },
  { name: 'Koşucu', hp: 24, spd: 140, r: 12, dps: 9, gold: 7, col: '#a5b56b', dark: '#5d6a35' },
  { name: 'İri', hp: 260, spd: 52, r: 25, dps: 30, gold: 25, col: '#55704c', dark: '#2c3d28' },
  { name: 'Dev', hp: 1600, spd: 62, r: 40, dps: 50, gold: 150, col: '#8a4a3c', dark: '#4a221a' },
  { name: 'Tükürücü', hp: 50, spd: 88, r: 14, dps: 6, gold: 12, col: '#8f9a3a', dark: '#4d5420' },
];
export const zMaxHp = (t, wave, n) =>
  ZTYPES[t].hp * (1 + (Math.max(1, wave) - 1) * 0.12) * (t === 3 ? 1 + 0.35 * (Math.max(1, n) - 1) : 1);

// zombie states sent over the network
export const ZS = { NORMAL: 0, WINDUP: 1, DASH: 2, SLAM: 3, SPIT: 4 };

export const FIRST_BREAK = 8;
export const BREAK_TIME = 25;
export const START_GOLD = 40;

export function stats(cls, lv) {
  const c = CLASSES[cls] || CLASSES.asker;
  return {
    maxHp: c.hp + 20 * lv.hp,
    spd: c.spd * (1 + 0.06 * lv.spd),
    dmg: c.dmg * (1 + 0.15 * lv.dmg),
    rate: c.rate * (1 + 0.1 * lv.rate),
    cd: Math.max(0.4, 1 - 0.1 * lv.cd),
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
