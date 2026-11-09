// Shared game constants. Everything the player sees is Turkish; code identifiers stay English.

export const VERSION = 14;
// Increase by one with every release; shown in the bottom-left corner.
export const BUILD = 36;
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

export const MAP_ORDER = ['meydan', 'benzinlik', 'hastane', 'orman', 'liman', 'kar'];
export const MAPS = {
  meydan: { name: 'Meydan', desc: 'Beton bloklar ve kasalarla dolu terk edilmiş bir şehir meydanı.' },
  benzinlik: { name: 'Benzinlik', desc: 'Yol kenarı, terk edilmiş arabalar, pompalar ve küçük dükkanlar.' },
  hastane: { name: 'Hastane Bahçesi', desc: 'Çitler, ambulanslar ve hastane binaları arasında dar yollar.' },
  orman: { name: 'Orman', desc: 'Sık ağaçlar, kayalar ve devrilmiş kütükler. Görüş kısa.' },
  liman: { name: 'Liman', desc: 'Konteyner yığınları arasında dar koridorlar. Bir yanı deniz.' },
  kar: { name: 'Kış Köyü', desc: 'Karla kaplı evler, çamlar ve kar yığınları. Donmuş göl açık alan.' },
};

export const DIFF_ORDER = ['kolay', 'normal', 'zor', 'kabus'];

// game modes: the room's host picks one in the lobby; the daily challenge has its own button
export const MODES = {
  normal: { name: 'Klasik', desc: 'Dalgalar arasında mola, her 5 dalgada bir boss.' },
  endless: { name: 'Hayatta Kalma', desc: '5. dalgadan sonra mola yok ve zombiler daha sık gelir. Kendi sıralaması var.' },
  boss: { name: 'Boss Akını', desc: 'Her dalgada boss gelir, sıradan zombi azdır. Elmaslar 1,5 kat.' },
  hc: { name: 'Tek Can', desc: 'Düşen kalkamaz, dalga bitince de dönmez. Elmaslar 2 kat.' },
  sandbox: { name: 'Deneme Alanı', desc: 'Tek başına her sınıfı dene. Elmas, XP ve görev ilerlemesi vermez.' },
  daily: { name: 'Günün Görevi', desc: 'Herkese aynı harita, sınıf ve zorluk. Günün ilk denemesi sıralamaya girer.' },
};
export const MODE_ORDER = ['normal', 'endless', 'boss', 'hc'];
// the day in Turkey, the same day the server uses
export const tday = (t = Date.now()) => new Date(t + 3 * 36e5).toISOString().slice(0, 10);
// the daily challenge's rules come from the date alone, so every player and the server agree on them
export function dailyRules(day = tday()) {
  let h = 7;
  for (const c of 'kd' + day) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16; h >>>= 0;
  return { day, map: ['meydan', 'benzinlik', 'hastane', 'orman', 'liman', 'kar'][h % 6], cls: CLASS_ORDER_D[(h >>> 3) % 11], diff: ['normal', 'zor'][(h >>> 7) % 2], seed: h & 0x7fffffff };
}
const CLASS_ORDER_D = ['asker', 'doktor', 'tamirci', 'nisanci', 'kalkanci', 'alevci', 'bombaci', 'izci', 'muhendis', 'kimyager', 'komutan'];
// map events that can hit in the middle of a wave
export const MEV = {
  dark: { name: 'Karartma', desc: 'Işıklar söndü. Fenerin dışında hiçbir şey görünmüyor.', dur: 22 },
  drop: { name: 'İkmal uçağı', desc: 'Bir uçak malzeme attı. Kutuları topla!', dur: 6 },
  horde: { name: 'Sürü akını', desc: 'Koşucu sürüsü geliyor. Sırt sırta verin!', dur: 15 },
  moon: { name: 'Kanlı ay', desc: 'Zombiler hızlandı ama düşürdükleri altın iki katı.', dur: 25 },
};
export const MEV_ORDER = ['dark', 'drop', 'horde', 'moon'];
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

export const CLASS_ORDER = ['asker', 'doktor', 'tamirci', 'nisanci', 'kalkanci', 'alevci', 'bombaci', 'izci', 'muhendis', 'kimyager', 'komutan', 'tesla', 'avci'];

// kind: 'b' bullet, 'f' flame, 'g' grenade
export const CLASSES = {
  asker: {
    name: 'Asker', weapon: 'Tüfek', tiers: ['Tüfek', 'Piyade tüfeği', 'Savaş tüfeği'], desc: 'Dengeli ve dayanıklı. Her duruma uyar.',
    hp: 120, spd: 215, dmg: 20, rate: 8, spread: 0.045, bspd: 1150, life: 0.7, pellets: 1, pierce: 0, kind: 'b', gun: 28,
    ab: { name: 'Hızlı Ateş', desc: '6 saniye boyunca iki kat hızlı ateş edersin.', cd: 20, dur: 6 },
    pas: { name: 'Disiplin', desc: 'Canın yarıdan fazlayken %10 daha sert vurursun.' },
    bars: { can: 0.6, hiz: 0.55, hasar: 0.6 },
  },
  doktor: {
    name: 'Doktor', weapon: 'Makineli', tiers: ['Makineli', 'Susturuculu makineli', 'Çift şarjörlü makineli'], desc: 'Takımı ayakta tutar, düşenleri kaldırır.',
    hp: 100, spd: 232, dmg: 12, rate: 12, spread: 0.09, bspd: 1000, life: 0.55, pellets: 1, pierce: 0, kind: 'b', gun: 22,
    ab: { name: 'İyileştir', desc: 'Yakındaki herkesi iyileştirir, düşenleri ayağa kaldırır.', cd: 18, r: 220, heal: 45 },
    pas: { name: 'Saha hekimi', desc: 'Saniyede 1,5 can yenilenirsin, yanındaki arkadaşlar 1 can. Düşenleri iki kat hızlı kaldırırsın.' },
    bars: { can: 0.45, hiz: 0.75, hasar: 0.45 },
  },
  tamirci: {
    name: 'Tamirci', weapon: 'Pompalı', tiers: ['Pompalı', 'Otomatik pompalı', 'Savaş pompalısı'], desc: 'Yakın mesafede yıkıcı. Kendi taretini kurar.',
    hp: 135, spd: 205, dmg: 13, rate: 1.6, spread: 0.3, bspd: 950, life: 0.32, pellets: 7, pierce: 0, kind: 'b', gun: 24,
    ab: { name: 'Taret', desc: '20 saniye boyunca zombilere ateş eden bir taret kurar.', cd: 24, dur: 20, dmg: 13, rate: 0.2, range: 420 },
    pas: { name: 'Usta eller', desc: 'Eşyalar %25 ucuz, barikatların iki kat dayanıklı.' },
    bars: { can: 0.65, hiz: 0.45, hasar: 0.75 },
  },
  nisanci: {
    name: 'Nişancı', weapon: 'Dürbünlü tüfek', tiers: ['Dürbünlü tüfek', 'Uzun namlu', 'Keskin nişancı tüfeği'], desc: 'Az ama ölümcül atış. Mermiler sürüyü deler.',
    hp: 90, spd: 210, dmg: 95, rate: 1.1, spread: 0.008, bspd: 1900, life: 0.9, pellets: 1, pierce: 3, kind: 'b', gun: 36,
    ab: { name: 'Odak', desc: '5 saniye boyunca iki kat hasar, mermiler her şeyi deler.', cd: 18, dur: 5 },
    pas: { name: 'Kafa avcısı', desc: '+%12 kritik vuruş şansı.' },
    bars: { can: 0.35, hiz: 0.5, hasar: 1 },
  },
  kalkanci: {
    name: 'Kalkancı', weapon: 'Ağır makineli', tiers: ['Ağır makineli', 'Döner namlu', 'Dev döner namlu'], desc: 'Önde durur, sürünün darbesini karşılar.',
    hp: 210, spd: 180, dmg: 9, rate: 13, spread: 0.13, bspd: 1050, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 30,
    ab: { name: 'Kalkan', desc: '5 saniye boyunca aldığın hasar %70 azalır.', cd: 20, dur: 5 },
    pas: { name: 'Çelik yelek', desc: '%15 daha az hasar alırsın, darbeler seni pek savuramaz.' },
    bars: { can: 1, hiz: 0.3, hasar: 0.5 },
  },
  alevci: {
    name: 'Alevci', weapon: 'Alev makinesi', tiers: ['Alev makinesi', 'Yüksek basınçlı alev', 'Napalm makinesi'], desc: 'Kısa menzil, sürüyü toptan yakar.',
    hp: 125, spd: 205, dmg: 5, rate: 22, spread: 0.16, bspd: 560, life: 0.36, pellets: 1, pierce: 2, kind: 'f', gun: 26,
    ab: { name: 'Alev Patlaması', desc: 'Etrafındaki tüm zombileri bir anda yakar.', cd: 16, r: 170, dmg: 70 },
    pas: { name: 'Kundakçı', desc: 'Alevin zombileri tutuşturur. Patlamalar sana yarı hasar verir.' },
    bars: { can: 0.6, hiz: 0.45, hasar: 0.7 },
  },
  bombaci: {
    name: 'Bombacı', weapon: 'Bomba atar', tiers: ['Bomba atar', 'Altılı bomba atar', 'Tamburlu bomba atar'], desc: 'Her atış patlar. Kalabalığa karşı birebir.',
    hp: 110, spd: 205, dmg: 70, rate: 1.15, spread: 0.03, bspd: 720, life: 0.85, pellets: 1, pierce: 0, kind: 'g', aoe: 95, gun: 26,
    ab: { name: 'Mayın', desc: 'Ayağının dibine mayın bırakır. Aynı anda en fazla 3 mayın.', cd: 8, dmg: 220, r: 140, max: 3 },
    pas: { name: 'Patlayıcı uzmanı', desc: 'İki el bombası fazla taşırsın, bombaların %30 sert. Patlamalar sana yarı hasar verir.' },
    bars: { can: 0.5, hiz: 0.45, hasar: 0.85 },
  },
  izci: {
    name: 'İzci', weapon: 'Çift tabanca', tiers: ['Çift tabanca', 'Çift otomatik tabanca', 'Çift magnum'], desc: 'Takımın en hızlısı. Vur ve kaç.',
    hp: 95, spd: 262, dmg: 15, rate: 7, spread: 0.05, bspd: 1150, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 18,
    ab: { name: 'Depar', desc: '4 saniye boyunca %60 daha hızlı koşarsın.', cd: 14, dur: 4 },
    pas: { name: 'Leşçi', desc: '+%15 altın, eşyaları uzaktan toplarsın, Dipçik iki kat hızlı dolar.' },
    bars: { can: 0.4, hiz: 1, hasar: 0.45 },
  },
  muhendis: {
    name: 'Mühendis', weapon: 'Karabina', tiers: ['Karabina', 'Lazer nişangahlı karabina', 'Plazma karabina'], desc: 'İki saldırı dronu hep yanında uçar. Takımı tamir eder.',
    hp: 105, spd: 220, dmg: 14, rate: 6.5, spread: 0.05, bspd: 1150, life: 0.65, pellets: 1, pierce: 0, kind: 'b', gun: 28,
    ab: { name: 'Tamir Dronu', desc: '10 saniye boyunca yakındaki arkadaşları iyileştiren, barikatları ve taretleri onaran bir dron gönderir.', cd: 22, dur: 10, heal: 7, r: 180 },
    pas: { name: 'Dron pilotu', desc: 'İki küçük saldırı dronu etrafında uçar ve en yakın zombiye ateş eder. Silahın güçlendikçe dronlar da güçlenir.' },
    drone: { dmg: 7, rate: 0.55, range: 380 },
    bars: { can: 0.5, hiz: 0.6, hasar: 0.6 },
  },
  kimyager: {
    name: 'Kimyager', weapon: 'Asit tabancası', tiers: ['Asit tabancası', 'Basınçlı asit tabancası', 'Aşındırıcı asit topu'], desc: 'Her mermi zehirler. Zehirli sürü takımın elinde erir.',
    hp: 100, spd: 218, dmg: 16, rate: 5, spread: 0.06, bspd: 820, life: 0.75, pellets: 1, pierce: 1, kind: 'b', gun: 26,
    ab: { name: 'Zehir Bulutu', desc: 'Nişan aldığın yere büyük bir zehir bulutu atar.', cd: 18, dur: 8, r: 150 },
    pas: { name: 'Katalizör', desc: 'Mermilerin zehirler. Zehirlenen zombiler bütün takımdan %20 fazla hasar alır.' },
    bars: { can: 0.45, hiz: 0.6, hasar: 0.55 },
  },
  komutan: {
    name: 'Komutan', weapon: 'Ağır tabanca', tiers: ['Ağır tabanca', 'Magnum', 'Altın magnum'], desc: 'Takımı güçlendirir, ikmal sandığı çağırır.',
    hp: 120, spd: 215, dmg: 40, rate: 3, spread: 0.02, bspd: 1400, life: 0.75, pellets: 1, pierce: 1, kind: 'b', gun: 22,
    ab: { name: 'İkmal Sandığı', desc: 'Yanına bir ikmal sandığı düşer: yakındakiler iyileşir, altın alır ve 5 saniye iki kat hasar verir.', cd: 26, dur: 5, r: 200, heal: 30 },
    pas: { name: 'Liderlik', desc: 'Yakınındaki arkadaşların (ve sen) %10 daha sert vurur.' },
    bars: { can: 0.6, hiz: 0.55, hasar: 0.7 },
  },
  tesla: {
    name: 'Tesla', weapon: 'Tesla tabancası', tiers: ['Tesla tabancası', 'Bobinli tesla', 'Yıldırım topu'], desc: 'Her vuruş yakındaki zombilere sıçrar. Sürüyü elektrikle biçer.',
    hp: 105, spd: 215, dmg: 18, rate: 6, spread: 0.05, bspd: 1350, life: 0.55, pellets: 1, pierce: 0, kind: 'b', gun: 26,
    ab: { name: 'Tesla Bobini', desc: 'Yere bir bobin dikersin: 12 saniye boyunca yakındaki zombileri zincirleme çarpar.', cd: 22, dur: 12, r: 260 },
    look: 'arc',
    pas: { name: 'Aşırı gerilim', desc: 'Her vuruşun iki zombiye daha sıçrar. Silahın güçlendikçe zincir uzar.' },
    bars: { can: 0.5, hiz: 0.55, hasar: 0.6 },
  },
  avci: {
    name: 'Avcı', weapon: 'Arbalet', tiers: ['Arbalet', 'Ağır arbalet', 'Tekrarlı arbalet'], desc: 'Oklar sıra sıra zombiyi deler ve yere çiviler.',
    hp: 100, spd: 225, dmg: 58, rate: 1.7, spread: 0.012, bspd: 1500, life: 0.85, pellets: 1, pierce: 4, kind: 'b', gun: 30,
    ab: { name: 'Ok Yağmuru', desc: 'Önüne yelpaze gibi dokuz delici ok fırlatırsın.', cd: 16, n: 9, dmg: 90, range: 650 },
    look: 'bolt',
    pas: { name: 'Çivileyici', desc: 'Okların zombileri bir an yere çiviler; iri olmayanlar sendeler.' },
    bars: { can: 0.45, hiz: 0.7, hasar: 0.8 },
  },
};

// Order matters: the snapshot sends the levels as an array in this order.
export const UPGRADES = [
  { k: 'dmg', name: 'Hasar', desc: '+%15 hasar', base: 40, max: 10 },
  { k: 'rate', name: 'Atış hızı', desc: '+%10 atış hızı', base: 40, max: 10 },
  { k: 'hp', name: 'Dayanıklılık', desc: '+20 azami can', base: 35, max: 10 },
  { k: 'spd', name: 'Çeviklik', desc: '+%6 hareket hızı', base: 30, max: 6 },
  { k: 'cd', name: 'Yetenek', desc: '−%10 yetenek bekleme süresi', base: 45, max: 5 },
  { k: 'crit', name: 'Kritik vuruş', desc: '+%4 şansla iki kat hasar', base: 50, max: 8 },
  { k: 'regen', name: 'Yenilenme', desc: 'Saniyede +0,5 can kazanırsın', base: 45, max: 6 },
  { k: 'armor', name: 'Zırh', desc: '−%5 alınan hasar', base: 55, max: 6 },
  { k: 'mag', name: 'Mıknatıs', desc: 'Eşyaları uzaktan toplarsın, +%5 altın', base: 40, max: 4 },
];
export const LV_KEYS = [...UPGRADES.map((u) => u.k), 'ab'];
export const newLv = () => Object.fromEntries(LV_KEYS.map((k) => [k, 0]));
export const lvArr = (lv) => LV_KEYS.map((k) => (lv && lv[k]) | 0);
export const lvObj = (a) => Object.fromEntries(LV_KEYS.map((k, i) => [k, (Array.isArray(a) && a[i]) | 0]));
export const HEAL_COST = 25;

// Ability mastery: three levels per class, bought in the armory.
export const AB_COST = [200, 450, 800];
export const AB_UP = {
  asker: ['Hızlı Ateş 2 sn uzar', 'Hızlı Ateş 2 sn daha uzar', 'Hızlı Ateş sırasında +%30 hasar'],
  doktor: ['+15 iyileştirme, alan büyür', '+15 iyileştirme, alan daha da büyür', 'İyileşenler 3 sn kalkan kazanır'],
  tamirci: ['Taret %40 daha sert vurur', 'Taret iki kat hızlı ateş eder', 'Aynı anda iki taret kurabilirsin'],
  nisanci: ['Odak 1,5 sn uzar', 'Odak 1,5 sn daha uzar', 'Odak sırasında 2,5 kat hasar'],
  kalkanci: ['Kalkan 1,5 sn uzar', 'Kalkan 1,5 sn daha uzar', 'Kalkan açılınca etraftaki zombileri savurur'],
  alevci: ['Patlama alanı ve hasarı büyür', 'Patlama alanı ve hasarı daha da büyür', 'Patlama zombileri tutuşturur'],
  bombaci: ['Aynı anda bir mayın daha', 'Mayınlar %30 daha sert, alanı büyük', 'Mayınlar patlayınca üç küçük bomba saçar'],
  izci: ['Depar 1,5 sn uzar', 'Depar 1,5 sn daha uzar', 'Depar sırasında %60 az hasar, +%30 atış hızı'],
  muhendis: ['Tamir dronu 3 sn uzar', 'Saldırı dronları %40 sert vurur', 'Üçüncü bir saldırı dronu'],
  kimyager: ['Bulut büyür, 2 sn uzar', 'Bulut zombileri yavaşlatır', 'Bulut çok daha sert zehirler'],
  komutan: ['Sandık daha çok iyileştirir ve altın verir', 'İki kat hasar 2 sn uzar', 'Sandık düşenleri de kaldırır'],
  tesla: ['Bobin 4 sn uzar', 'Bobin daha çok zombiye sıçrar', 'Bobin çarptıklarını sersemletir'],
  avci: ['Ok Yağmuru 3 ok daha', 'Oklar %40 daha sert', 'Oklar vurduklarını yavaşlatır'],
};
// How long a timed ability lasts with mastery level l.
export function abDur(cls, l) {
  const c = CLASSES[cls] || CLASSES.asker;
  const d = c.ab.dur || 0;
  const k = Math.min(2, l | 0);
  if (cls === 'asker') return d + 2 * k;
  if (cls === 'nisanci' || cls === 'kalkanci' || cls === 'izci') return d + 1.5 * k;
  if (cls === 'muhendis') return d + (k >= 1 ? 3 : 0);
  if (cls === 'kimyager') return d + (k >= 1 ? 2 : 0);
  if (cls === 'komutan') return d + (k >= 2 ? 2 : 0);
  if (cls === 'tesla') return d + (k >= 1 ? 4 : 0);
  return d;
}

// Weapon levels bought in the armory: level 1 picks a path, level 3 picks one of the path's two
// branches, level 5 unlocks the branch's special power. The path or branch can be changed for gold.
export const WMAX = 5;
export const WEAPON_COST = [0, 150, 400, 850, 1500, 2400];
export const BRANCH_SWAP = 250;
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const weaponSpent = (wt) => WEAPON_COST.slice(1, (wt | 0) + 1).reduce((a, b) => a + b, 0);
export const PATHS = [
  { name: 'Standart', adj: '', col: '#ffe1a6', dmg: [1, 1, 1, 1, 1, 1], rate: [1, 1, 1, 1, 1, 1], br: [] },
  { name: 'Ağır', adj: 'Ağır', desc: 'Daha yavaş ama çok sert vurur', col: '#ff8a3d',
    dmg: [1, 1.4, 1.75, 2.05, 2.35, 2.7], rate: [1, 0.92, 0.88, 0.86, 0.84, 0.82],
    br: [
      { name: 'Sarsıcı', adj: 'Sarsıcı', desc: 'Vuruşlar zombileri geri iter ve sendeletir', cap: 'Her vuruş zombiyi sersemletir' },
      { name: 'Yıkıcı', adj: 'Yıkıcı', desc: 'İri zombilere ve bosslara çok daha sert', cap: 'Mermiler küçük patlamalar yapar' },
    ] },
  { name: 'Seri', adj: 'Seri', desc: 'Çok daha hızlı ateş eder', col: '#ffd23f',
    dmg: [1, 1.03, 1.05, 1.08, 1.1, 1.12], rate: [1, 1.25, 1.5, 1.6, 1.72, 1.85],
    br: [
      { name: 'Fırtına', adj: 'Fırtına', desc: 'Ateş hızı katlanarak artar', cap: 'Mermiler bir zombiden diğerine seker' },
      { name: 'Çift namlu', adj: 'Çift namlulu', desc: 'Her atışta iki mermi', cap: 'Her atışta üç mermi' },
    ] },
  { name: 'Delici', adj: 'Delici', desc: 'Mermiler zombileri deler, menzil artar', col: '#c77dff',
    dmg: [1, 1.18, 1.32, 1.46, 1.6, 1.75], rate: [1, 1.04, 1.08, 1.1, 1.12, 1.15],
    br: [
      { name: 'Keskin', adj: 'Keskin', desc: 'Kritik vuruş şansı', cap: 'Kritikler üç kat vurur ve her şeyi deler' },
      { name: 'Ray', adj: 'Raylı', desc: 'Çok uzun menzil, çok daha fazla delme', cap: 'Mermiler her şeyi deler, kalkanları da' },
    ] },
  { name: 'Buz', adj: 'Buzlu', desc: 'Vurduğun zombiler yavaşlar', col: '#7bdff2',
    dmg: [1, 1.2, 1.32, 1.45, 1.58, 1.72], rate: [1, 1.06, 1.1, 1.14, 1.18, 1.22],
    br: [
      { name: 'Donduran', adj: 'Donduran', desc: 'Zombiler çok daha fazla yavaşlar', cap: 'Vuruşlar zombileri buz kalıbına çevirebilir' },
      { name: 'Kırılgan', adj: 'Kırıcı', desc: 'Yavaşlayan zombiler daha çok hasar alır', cap: 'Donan zombiler ölünce buz parçalarına patlar' },
    ] },
  { name: 'Zehir', adj: 'Zehirli', desc: 'Vurduğun zombiler zehirlenip can kaybeder', col: '#8fd14f',
    dmg: [1, 1.1, 1.2, 1.3, 1.4, 1.5], rate: [1, 1.05, 1.1, 1.13, 1.16, 1.2],
    br: [
      { name: 'Salgın', adj: 'Salgın', desc: 'Zehir ölünce yakındakilere bulaşır', cap: 'Ölen zombiler zehir bulutu bırakır' },
      { name: 'Asit', adj: 'Asitli', desc: 'Zehirli zombiler daha çok hasar alır', cap: 'Asit kalkanları eritir, bosslara tam işler' },
    ] },
  { name: 'Elektrik', adj: 'Elektrikli', desc: 'Vuruşlar yakındaki zombilere sıçrar', col: '#9ad8ff',
    dmg: [1, 1.1, 1.2, 1.3, 1.4, 1.5], rate: [1, 1.05, 1.1, 1.12, 1.15, 1.18],
    br: [
      { name: 'Zincir', adj: 'Zincirleme', desc: 'Şimşek daha çok zombiye sıçrar', cap: 'Şimşek çarptığı zombileri sersemletir' },
      { name: 'Aşırı yük', adj: 'Aşırı yüklü', desc: 'Sıçrayan şimşek çok daha sert', cap: 'Arada bir hedefe yıldırım düşer' },
    ] },
  { name: 'Yangın', adj: 'Ateşli', desc: 'Vurduğun zombiler tutuşur', col: '#ff5a36',
    dmg: [1, 1.1, 1.2, 1.3, 1.4, 1.5], rate: [1, 1.05, 1.1, 1.13, 1.16, 1.2],
    br: [
      { name: 'Napalm', adj: 'Napalm', desc: 'Yanan zombiler değdiklerini tutuşturur', cap: 'Yanan zombiler ölünce patlar' },
      { name: 'Kor', adj: 'Kor', desc: 'Yanma çok daha fazla hasar verir', cap: 'Vuruşlar yerde alev bırakır' },
    ] },
  { name: 'Özel', adj: 'Özel', desc: 'Sınıfına özel silah', col: '#ffd34d', dmg: [1, 1, 1, 1, 1, 1], rate: [1, 1, 1, 1, 1, 1], br: [{ name: '', adj: '', desc: '', cap: '' }, { name: '', adj: '', desc: '', cap: '' }] },
];
export const PATH_N = PATHS.length - 1;
export const SPECIAL_K = 8;
// The eighth path is different for each class that has one: a new weapon, not just a new effect.
export const SPECIAL = {
  asker: { name: 'Bomba atar', adj: 'Patlayıcı', desc: 'Tüfek yerine bomba atar: yavaş ama her atış patlar', col: '#c2d16a', kind: 'g', aoe: 70, bspd: 720, life: 0.8,
    dmg: [1, 2.6, 2.9, 3.2, 3.5, 3.9], rate: [1, 0.2, 0.21, 0.22, 0.23, 0.25],
    br: [{ name: 'Geniş alan', adj: 'Yıkıcı', desc: 'Patlama alanı çok büyür', cap: 'Patlamalar zombileri tutuşturur' },
      { name: 'Seri atar', adj: 'Seri', desc: 'Daha hızlı bomba atar', cap: 'Her atışta iki bomba' }] },
  doktor: { name: 'Zehirli dart', adj: 'Zehirli', desc: 'Dartlar zehirler ve yavaşlatır', col: '#5fd38d',
    dmg: [1, 1.05, 1.12, 1.2, 1.28, 1.36], rate: [1, 0.85, 0.87, 0.9, 0.92, 0.95],
    br: [{ name: 'Uyuşturucu', adj: 'Uyuşturucu', desc: 'Zombiler çok daha fazla yavaşlar', cap: 'Dartlar zombileri bir an uyutur' },
      { name: 'Toksin', adj: 'Toksik', desc: 'Zehir çok daha sert', cap: 'Ölen zombiler zehir bulutu bırakır' }] },
  nisanci: { name: 'Raylı top', adj: 'Raylı', desc: 'Tek dev atış, her şeyi ve kalkanları deler', col: '#7ad8ff', bspd: 2600, range: 1.4,
    dmg: [1, 1.6, 1.8, 2, 2.2, 2.45], rate: [1, 0.72, 0.74, 0.76, 0.78, 0.8],
    br: [{ name: 'Aşırı yük', adj: 'Aşırı yüklü', desc: 'Atışlar çok daha sert', cap: 'Kritik atışlar üç kat vurur' },
      { name: 'Hızlı şarj', adj: 'Hızlı', desc: 'Daha sık ateş eder', cap: 'Atış yolunda şimşek bırakır' }] },
  tamirci: { name: 'Çivi tabancası', adj: 'Çivili', desc: 'Pompalı yerine çok hızlı çivi yağdırır, çiviler zombileri yere çakar', col: '#d8c7a0', spread: 0.07, pellets: 1, bspd: 1300, life: 0.5,
    dmg: [1, 1.2, 1.35, 1.5, 1.65, 1.85], rate: [1, 5.2, 5.5, 5.8, 6.1, 6.5],
    br: [{ name: 'Çakıcı', adj: 'Çakıcı', desc: 'Çiviler zombileri daha uzun tutar', cap: 'Çivilenen zombiler %30 fazla hasar alır' },
      { name: 'Şarapnel', adj: 'Şarapnelli', desc: 'Her atışta iki çivi', cap: 'Her atışta üç çivi' }] },
};
export const pathOf = (cls, k) => (k === SPECIAL_K && SPECIAL[cls] ? SPECIAL[cls] : PATHS[k] || PATHS[0]);
export const pathsFor = (cls) => PATHS.map((_, k) => k).filter((k) => k > 0 && (k !== SPECIAL_K || SPECIAL[cls]));
const lowerFirst = (s) => s.charAt(0).toLocaleLowerCase('tr') + s.slice(1);
const cut = (v, a, b) => Math.max(a, Math.min(b, v | 0));

// Everything a weapon level changes beyond damage and fire rate. Shared by the host (on-hit effects)
// and every player (bullets). t: level 0..5, k: path 1..7, b: branch 1..2 (from level 3).
export function pathFx(t, k, b) {
  t = cut(t, 0, WMAX); k = t > 0 ? cut(k, 1, PATH_N) : 0; b = t >= 3 ? cut(b, 1, 2) : 0;
  const i = t - 3; // 0..2 on branch levels
  const cap = t >= WMAX;
  const f = { t, k, b, cap };
  if (k === 1) {
    if (b === 1) { f.kb = [90, 110, 130][i]; f.stun = cap ? 0.45 : 0.12; f.dazed = [1.3, 1.45, 1.6][i]; }
    if (b === 2) { f.big = [1.2, 1.35, 1.5][i]; if (cap) f.blast = 45; }
  } else if (k === 2) {
    if (b === 1) { f.rateX = [1.15, 1.3, 1.45][i]; f.rico = cap ? 0.6 : 0; }
    if (b === 2) { f.pel = [1, 1, 2][i]; f.pelDmg = [0.62, 0.68, 0.52][i]; }
  } else if (k === 3) {
    if (b === 1) { f.crit = [0.15, 0.22, 0.3][i]; f.critX = cap ? 3 : 2.2; }
    if (b === 2) { f.pierce = [3, 5, 99][i]; f.range = 1.25; f.noShield = cap; }
  } else if (k === 4) {
    f.slow = [0, 1.5, 2.5, 3, 3.5, 4][t];
    f.slowK = b === 1 ? [0.45, 0.4, 0.35][i] : 0.55;
    if (b === 1) f.dazed = cap ? 1.5 : [1.15, 1.25][i];
    if (b === 1 && cap) f.freeze = 0.12;
    if (b === 2) { f.brittle = [1.15, 1.22, 1.3][i]; f.shatter = cap; }
  } else if (k === 5) {
    f.poison = [0, 0.25, 0.32, 0.38, 0.44, 0.5][t] * (b === 2 ? 1.15 : 1); f.pdur = 4;
    if (b === 1) { f.spread = [2, 3, 5][i]; f.gas = cap; }
    if (b === 2) { f.acid = [1.15, 1.2, 1.25][i]; f.melt = cap; }
  } else if (k === 6) {
    f.chain = b === 2 ? 3 : [0, 2, 3, 4, 5, 6][t] + (b === 1 ? [0, 0, 1][i] : 0);
    f.chainK = [0, 0.25, 0.28, 0.3, 0.33, 0.36][t] * (b === 2 ? [1.3, 1.45, 1.6][i] : 1);
    if (b === 1 && cap) f.chainStun = 0.5;
    if (b === 2 && cap) f.bolt = 3;
  } else if (k === 7) {
    f.burn = [0, 0.25, 0.3, 0.34, 0.38, 0.42][t] * (b === 2 ? [1.5, 1.8, 2.2][i] : b === 1 ? 0.75 : 1); f.bdur = 3.5;
    if (b === 1) { f.napalm = true; f.boomOnDeath = cap; }
    if (b === 2 && cap) f.patch = true;
  }
  return f;
}

// the class's own eighth-path weapon
function special(cls, c, f, P, B) {
  const t = f.t, b = f.b, i = t - 3, cap = f.cap;
  f.k = SPECIAL_K;
  const w = { ...c, tier: t, path: SPECIAL_K, branch: b, fx: f, col: P.col, frost: false, heavy: 0, pelDmg: 1,
    name: B ? `${B.adj} ${lowerFirst(P.name)}` : P.name, kind: P.kind || c.kind, aoe: P.aoe || c.aoe || 0,
    bspd: P.bspd || c.bspd, life: (P.life || c.life) * (P.range || 1), spread: P.spread || c.spread, pellets: P.pellets || c.pellets, pierce: c.pierce };
  w.look = { tamirci: 'nail', nisanci: 'rail' }[cls] || '';
  if (cls === 'asker') {
    w.aoe = 70 + 10 * t + (b === 1 ? [25, 40, 60][i] : 0);
    if (b === 1 && cap) { f.burn = 0.3; f.bdur = 3; }
    if (b === 2) { w.pellets = cap ? 2 : 1; w.pelDmg = cap ? 0.7 : 1; w.spread = 0.08; }
  } else if (cls === 'doktor') {
    f.poison = [0, 0.4, 0.48, 0.55, 0.62, 0.7][t] * (b === 2 ? 1.5 : 1); f.pdur = 4;
    f.slow = 2; f.slowK = b === 1 ? [0.45, 0.4, 0.35][i] : 0.65;
    if (b === 1 && cap) { f.freeze = 0.1; }
    if (b === 2 && cap) f.gas = true;
  } else if (cls === 'nisanci') {
    w.pierce = 99; f.noShield = t >= 3; f.pierce = 99;
    if (b === 1) { f.crit = 0.18; f.critX = cap ? 3 : 2; }
    if (b === 2 && cap) { f.chain = 3; f.chainK = 0.3; }
  } else if (cls === 'tamirci') {
    f.kb = 40; f.stun = b === 1 ? [0.15, 0.2, 0.25][i] : 0.1;
    if (b === 1 && cap) f.dazed = 1.3;
    if (b === 2) { w.pellets = cap ? 3 : 2; w.pelDmg = 0.7; }
  }
  return w;
}

export function weaponOf(cls, wt, wp = 0, wb = 0) {
  const c = CLASSES[cls] || CLASSES.asker;
  const f = pathFx(wt, wp, wb);
  const t = f.t, k = f.k;
  const P = pathOf(cls, k);
  const B = f.b ? P.br[f.b - 1] : null;
  if (k === SPECIAL_K && SPECIAL[cls]) return special(cls, c, f, P, B);
  const pierceT = k === 3 ? Math.min(2, t) + (t >= 3 && f.b === 1 ? t - 2 : 0) : 0;
  const nameT = c.tiers[t === 0 ? 0 : t < 3 ? 1 : 2];
  const pelMul = f.pel ? 1 + f.pel : 1;
  return {
    ...c,
    tier: t,
    path: k,
    branch: f.b,
    fx: f,
    col: P.col,
    frost: k === 4,
    name: t === 0 ? c.tiers[0] : `${B ? B.adj : P.adj} ${lowerFirst(nameT)}`,
    pellets: Math.round((c.pellets + (cls === 'tamirci' ? 2 * Math.min(2, t) : 0)) * pelMul),
    pelDmg: f.pelDmg || 1,
    spread: c.spread * (f.pel ? 1.5 : 1),
    pierce: f.pierce ? Math.max(f.pierce, c.pierce) : c.pierce + (cls === 'nisanci' ? Math.min(2, t) : 0) + (c.kind === 'g' ? 0 : pierceT),
    aoe: (c.aoe || 0) + (cls === 'bombaci' ? 15 * Math.min(2, t) : 0) + (c.kind === 'g' && k === 3 ? 25 * Math.min(2, t) + 10 * Math.max(0, t - 2) : 0) + (c.kind === 'g' && k === 1 ? 10 * t : 0),
    life: (c.life + (cls === 'alevci' ? 0.05 * Math.min(2, t) : 0)) * (k === 3 ? 1 + 0.15 * Math.min(2, t) : 1) * (f.range || 1),
    bspd: c.bspd * (k === 3 ? 1 + 0.15 * Math.min(2, t) : 1) * (f.range ? 1.15 : 1),
    heavy: k === 1 ? Math.min(3, Math.ceil(t * 0.6)) : 0,
  };
}
// Short path description for the shop, with class-specific wording where it differs.
export function pathDesc(cls, k) {
  const c = CLASSES[cls] || CLASSES.asker;
  if (k === 3 && c.kind === 'g') return 'Patlama alanı çok büyür, menzil artar';
  if (k === 3 && c.kind === 'f') return 'Alev daha uzağa gider, daha çok zombiyi deler';
  return pathOf(cls, k).desc;
}

// One-use items bought in the armory and used in battle with keys 1-4 (or the item buttons on phones).
export const GEAR = [
  { k: 'nade', name: 'El bombası', short: 'Bomba', desc: 'Nişan aldığın yere atılır, geniş alanda hasar', cost: 60, max: 3, col: '#a7b36a' },
  { k: 'wall', name: 'Barikat', short: 'Barikat', desc: 'Önüne kum torbası kurar, zombileri durdurur', cost: 90, max: 2, col: '#c9a66b' },
  { k: 'med', name: 'İlk yardım', short: 'Yardım', desc: '60 can verir, yanındaki düşmüş arkadaşları kaldırır', cost: 70, max: 2, col: '#43d17a' },
  { k: 'air', name: 'Hava saldırısı', short: 'Hava', desc: 'Nişan aldığın bölgeye 3 saniye sonra bomba yağar', cost: 260, max: 1, col: '#ff6b2c' },
];
export const GEAR_RANGE = [420, 0, 0, 900];
// Class passives that touch items and the Dipçik.
export const gearCost = (cls, i) => Math.round(GEAR[i].cost * (cls === 'tamirci' ? 0.75 : 1));
export const gearMax = (cls, i) => GEAR[i].max + (cls === 'bombaci' && GEAR[i].k === 'nade' ? 2 : 0);
export const bashCd = (cls) => BASH.cd * (cls === 'izci' ? 0.5 : 1);

// Team upgrades: everyone chips in, everyone gets it. Costs grow with the number of players.
export const TEAM = [
  { k: 'tarmor', name: 'Ortak zırh', desc: 'Herkes %8 daha az hasar alır', cost: [400, 800, 1400] },
  { k: 'tdmg', name: 'Ortak güç', desc: 'Herkese +%8 hasar', cost: [450, 900, 1600] },
  { k: 'tregen', name: 'Saha hastanesi', desc: 'Herkes saniyede 1 can yenilenir', cost: [350, 800] },
  { k: 'tgold', name: 'Ganimet', desc: 'Herkese +%12 altın', cost: [300, 700] },
];
export const teamCost = (i, lv, n) => Math.round(TEAM[i].cost[lv] * (1 + 0.35 * (Math.max(1, n) - 1)) / 10) * 10;
export const TEAM_CHUNK = 50;

// Dipçik (melee shove), key F.
export const BASH = { cd: 1.1, range: 68, arc: 1.3, dmg: 18, kb: 520, stun: 0.6, shieldStun: 2.6 };

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
  { name: 'Hayalet', hp: 55, spd: 95, r: 14, dps: 11, gold: 14, col: '#b9c8d6', dark: '#5a6a7a' },
  { name: 'Zırhlı', hp: 190, spd: 58, r: 19, dps: 20, gold: 22, col: '#6e7a5a', dark: '#2f3826' },
  { name: 'Sıçrayıcı', hp: 60, spd: 88, r: 14, dps: 10, gold: 14, col: '#8f7a4a', dark: '#4a3c20' },
  { name: 'Doğurgan', hp: 170, spd: 50, r: 22, dps: 14, gold: 20, col: '#9a8a5a', dark: '#544824' },
  { name: 'Sürüngen', hp: 14, spd: 165, r: 9, dps: 6, gold: 2, col: '#7a9a5a', dark: '#3a4a26' },
  { name: 'Şifacı', hp: 85, spd: 66, r: 15, dps: 5, gold: 22, col: '#6aa88a', dark: '#2a5040' },
  { name: 'Kazıcı', hp: 75, spd: 90, r: 15, dps: 14, gold: 16, col: '#8a6a3a', dark: '#4a361a' },
  { name: 'Çığlıkçı', hp: 65, spd: 78, r: 15, dps: 6, gold: 18, col: '#b07a8a', dark: '#5a3040' },
  { name: 'Donmuş', hp: 100, spd: 62, r: 17, dps: 12, gold: 18, col: '#9ec8e0', dark: '#4a6a80' },
  { name: 'Dev Hurda', hp: 2000, spd: 50, r: 44, dps: 50, gold: 170, col: '#6a5a4a', dark: '#2f2820', boss: true },
  { name: 'Cadı', hp: 1500, spd: 74, r: 30, dps: 25, gold: 170, col: '#6a4a8a', dark: '#2a1a3a', boss: true },
];
ZTYPES[3].boss = true;
export const BOSS_ORDER = [3, 8, 9, 19, 20]; // Dev, Kraliçe, Koç, Dev Hurda, Cadı, then repeat
// build 36: bosses are tougher (1.8x health; the host also gives them 1.4x damage and 35% faster attacks)
for (const t of BOSS_ORDER) { ZTYPES[t].boss = true; ZTYPES[t].hp = Math.round(ZTYPES[t].hp * 1.8); }
export const BOSS_DMG = 1.4, BOSS_CD = 1.35;
// elite zombies: one random power each
export const ELITE = ['', 'Hızlı', 'Patlayıcı', 'Yenilenen', 'Zırhlı'];
export const isBoss = (t) => !!(ZTYPES[t] && ZTYPES[t].boss);
// Charging zombies: the İri and the Koç boss.
export const CHARGE = {
  2: { spd: 420, dur: 0.85, wind: 0.7, cd: 4.5, min: 130, max: 380, dmg: 22, kb: 560 },
  9: { spd: 560, dur: 1.0, wind: 0.55, cd: 2.5, min: 140, max: 560, dmg: 49, kb: 700 },
};
// Front arc (radians either side of facing) a Kalkanlı blocks bullets in.
export const SHIELD_ARC = 1.15;
export const zMaxHp = (t, wave, n, hm = 1) =>
  ZTYPES[t].hp * hm * (1 + (Math.max(1, wave) - 1) * 0.12) * (ZTYPES[t].boss ? 1 + 0.35 * (Math.max(1, n) - 1) : 1);

// zombie states sent over the network
export const ZS = { NORMAL: 0, WINDUP: 1, DASH: 2, SLAM: 3, SPIT: 4, FUSE: 5, SUMMON: 6, PHASE: 7, CROUCH: 8, LEAP: 9, BURROW: 10, SCREAM: 11, THROW: 12, CAST: 13 };

export const FIRST_BREAK = 8;
export const BREAK_TIME = 25;
export const START_GOLD = 40;

// Base level bonus every path gets, on top of the path's own multipliers.
const TIER_DMG = [1, 1.1, 1.2, 1.28, 1.36, 1.45];
// tm: team upgrade levels [tarmor, tdmg, tregen, tgold]
export function stats(cls, lv, wt = 0, wp = 0, wb = 0, tm) {
  const c = CLASSES[cls] || CLASSES.asker;
  const L = lv || {};
  const f = pathFx(wt, wp, wb);
  const P = pathOf(cls, f.k);
  const td = tm ? tm[1] | 0 : 0;
  const sp = f.k === SPECIAL_K && SPECIAL[cls] ? (cls === 'asker' && f.b === 2 ? [1, [1.3, 1.4, 1.5][f.t - 3]] : cls === 'nisanci' && f.b === 1 ? [[1.12, 1.18, 1.25][f.t - 3], 1] : cls === 'nisanci' && f.b === 2 ? [1, [1.1, 1.15, 1.22][f.t - 3]] : [1, 1]) : [1, 1];
  return {
    maxHp: c.hp + 20 * (L.hp | 0),
    spd: c.spd * (1 + 0.06 * (L.spd | 0)),
    dmg: c.dmg * (1 + 0.15 * (L.dmg | 0)) * TIER_DMG[f.t] * P.dmg[f.t] * (1 + 0.08 * td) * sp[0],
    rate: c.rate * (1 + 0.1 * (L.rate | 0)) * P.rate[f.t] * (f.rateX || 1) * sp[1],
    cd: Math.max(0.4, 1 - 0.1 * (L.cd | 0)),
    crit: 0.04 * (L.crit | 0) + (cls === 'nisanci' ? 0.12 : 0),
    regen: 0.5 * (L.regen | 0) + (tm ? tm[2] | 0 : 0),
    armor: (1 - 0.05 * (L.armor | 0)) * (1 - 0.08 * (tm ? tm[0] | 0 : 0)) * (cls === 'kalkanci' ? 0.85 : 1),
    mag: (L.mag | 0) + (cls === 'izci' ? 1.5 : 0),
    gold: (1 + 0.05 * (L.mag | 0)) * (1 + 0.12 * (tm ? tm[3] | 0 : 0)) * (cls === 'izci' ? 1.15 : 1),
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
