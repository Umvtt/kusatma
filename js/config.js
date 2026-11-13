// Shared game constants. Everything the player sees is Turkish; code identifiers stay English.

export const VERSION = 20;
// Increase by one with every release; shown in the bottom-left corner.
export const BUILD = 56;
// the Android app's own build: its download is named after it ("Kuşatma 44.0.apk")
export const APP_BUILD = 47;
export const MAX_PLAYERS = 20;
export const NAME_MAX = 16;
export const CODE_LEN = 6;

// The whole world is generated up front; only the playable area inside it grows with the player count.
export const WORLD_W = 6000;
export const WORLD_H = 4000;
export const CX = WORLD_W / 2;
export const CY = WORLD_H / 2;
export const PLAYER_R = 16;

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.6;

// Playable size for n players: 3600x2400 alone, growing with every player (capped by the world)
export function areaFor(n) {
  const k = Math.min(MAX_PLAYERS, Math.max(1, n)) - 1;
  return { w: Math.min(WORLD_W - 160, 3600 + k * 240), h: Math.min(WORLD_H - 160, 2400 + k * 160) };
}

export const MAP_ORDER = ['meydan', 'benzinlik', 'hastane', 'orman', 'liman', 'kar', 'metro', 'avm', 'us', 'luna'];
export const MAPS = {
  meydan: { name: 'Meydan', desc: 'Beton bloklar ve kasalarla dolu terk edilmiş bir şehir meydanı.' },
  benzinlik: { name: 'Benzinlik', desc: 'Yol kenarı, terk edilmiş arabalar, pompalar ve küçük dükkanlar.' },
  hastane: { name: 'Hastane Bahçesi', desc: 'Çitler, ambulanslar ve hastane binaları arasında dar yollar.' },
  orman: { name: 'Orman', desc: 'Sık ağaçlar, kayalar ve devrilmiş kütükler. Görüş kısa.' },
  liman: { name: 'Liman', desc: 'Konteyner yığınları arasında dar koridorlar. Bir yanı deniz.' },
  kar: { name: 'Kış Köyü', desc: 'Karla kaplı evler, çamlar ve kar yığınları. Donmuş göl açık alan.' },
  metro: { name: 'Metro İstasyonu', desc: 'Karanlık peronlar ve raylar. Arada bir tren geçer: korna çalınca raydan çekil, önüne çıkan her şeyi ezer.' },
  avm: { name: 'Alışveriş Merkezi', desc: 'Mağaza sıraları, büfeler, saksılar ve geniş koridorlar. Kalabalık sürüler için bol köşe.' },
  us: { name: 'Askerî Üs', desc: 'Kum torbaları, gözetleme kuleleri, çadırlar ve tank enkazları. Helikopter pisti açık alan.' },
  luna: { name: 'Lunapark', desc: 'Gece lunaparkı: atlıkarınca, büfeler, renkli ışıklar. Korku evinden arada bir zombi sürüsü fırlar.' },
};

export const DIFF_ORDER = ['kolay', 'normal', 'zor', 'kabus'];

// game modes: the room's host picks one in the lobby; the daily challenge has its own button
// extra gems for harder games (the server applies the same table; difficulty × mode)
export const GEM_DIFF = { kolay: 0.75, normal: 1, zor: 1.3, kabus: 1.7 };
export const GEM_MODE = { normal: 1, endless: 1.2, boss: 1.5, hc: 2, daily: 1.3, sandbox: 0 };
export const gemTag = (m) => (m === 0 ? 'elmas yok' : m === 1 ? '' : `×${String(m).replace('.', ',')} elmas`);
export const MODES = {
  normal: { name: 'Klasik', desc: 'Dalgalar arasında mola, her 5 dalgada bir boss.' },
  endless: { name: 'Hayatta Kalma', desc: '5. dalgadan sonra mola yok ve zombiler daha sık gelir. Kendi sıralaması var.' },
  boss: { name: 'Boss Akını', desc: 'Her dalgada boss gelir, sıradan zombi azdır. Elmaslar 1,5 kat.' },
  hc: { name: 'Tek Can', desc: 'Düşen kalkamaz, dalga bitince de dönmez. Elmaslar 2 kat.' },
  sandbox: { name: 'Deneme Alanı', desc: 'Tek başına her sınıfı dene. Elmas, XP ve görev ilerlemesi vermez.' },
  pvp: { name: 'PvP', desc: 'Oyuncular birbirine karşı, zombi yok. Türünü aşağıdan seç; hesabı olanlar dereceli puan kazanır.' },
  daily: { name: 'Günün Görevi', desc: 'Herkese aynı harita, sınıf ve zorluk. Günün ilk denemesi sıralamaya girer.' },
};
export const MODE_ORDER = ['normal', 'endless', 'boss', 'hc'];
// PvP: players fight each other (no zombies). Three kinds, picked in the lobby.
export const PVP = {
  tdm: { name: 'Takım Savaşı', short: 'Takım', desc: 'İki takım. 30 leşe ilk ulaşan ya da 8 dakika sonunda önde olan kazanır.', goal: 30, time: 480, resp: 5 },
  ffa: { name: 'Herkes Herkese', short: 'Herkes', desc: 'Herkes tek başına. 20 leşi ilk yapan ya da 8 dakika sonunda en çok leşi olan kazanır.', goal: 20, time: 480, resp: 4 },
  duel: { name: 'Düello', short: '1v1', desc: 'Bire bir. Üç raundu ilk alan kazanır; her raunt en çok 90 saniye.', goal: 3, time: 90, resp: 0 },
};
export const PVP_ORDER = ['tdm', 'ffa', 'duel'];
// class levels (the server uses the same numbers): each cleared wave gives that class 10 + 2·wave XP
export const clsLvl = (x) => Math.min(30, 1 + Math.floor(Math.sqrt((x | 0) / 60)));
export const clsNext = (x) => { const l = clsLvl(x); if (l >= 30) return { l, pct: 1, need: 0 }; const a = (l - 1) ** 2 * 60, b = l ** 2 * 60; return { l, pct: ((x | 0) - a) / (b - a), need: b - (x | 0) }; };
// badges are worked out by the server from the account; this is how they look
export const BADGES = {
  d25: ['Dayanıklı', '25. dalgaya ulaş', '🛡'], d50: ['Kale', '50. dalgaya ulaş', '🏰'], k1: ['Avcı', '1.000 zombi öldür', '🎯'], k10: ['Katliam', '10.000 zombi öldür', '💀'],
  p1: ['İlk zafer', 'Bir PvP maçı kazan', '⚔'], p50: ['Gladyatör', '50 PvP maçı kazan', '🏟'], lA: ['Altın lig', 'PvP\'de Altın lige çık', '🥇'], lP: ['Platin lig', 'PvP\'de Platin lige çık', '💠'], lE: ['Elmas lig', 'PvP\'de Elmas lige çık', '💎'],
  c10: ['Usta', 'Bir sınıfı 10. seviyeye çıkar', '⭐'], c30: ['Büyük usta', 'Bir sınıfı 30. seviyeye çıkar', '🌟'], c5: ['Çok yönlü', '5 sınıfı 5. seviyeye çıkar', '🎭'],
  kl: ['Klan üyesi', 'Bir klana katıl', '🏳'], kf: ['Kurucu', 'Bir klan kur', '👑'], v50: ['Veteran', '50. seviyeye ulaş', '🎖'], s7: ['Sadık', '7 gün üst üste giriş yap', '📅'],
};
export const PVP_WARM = 15; // seconds to shop before the fight
export const PVP_HP = 1.6; // more health in PvP so fights last a few seconds
export const PVP_DMG = 0.55; // weapons are tuned for zombies: player damage is scaled down
export const PVP_GOLD = { start: 1200, kill: 250, assist: 90, round: 500 };
export const PVP_PROT = 2; // seconds of spawn protection
export const TEAM_COL = ['#4cc9f0', '#ff5a5f'];
export const TEAM_NAME = ['Mavi', 'Kırmızı'];
// ranked leagues (the server uses the same thresholds); every league but Elmas has three divisions
export const LEAGUES = [
  { n: 'Bronz', min: 0, c: '#d08a4c' }, { n: 'Gümüş', min: 300, c: '#c9d3dc' }, { n: 'Altın', min: 700, c: '#ffd23f' },
  { n: 'Platin', min: 1200, c: '#5fe0d2' }, { n: 'Elmas', min: 1800, c: '#8fc2ff' },
];
export function league(rp) {
  rp = Math.max(0, rp | 0);
  let i = 0;
  while (i < LEAGUES.length - 1 && rp >= LEAGUES[i + 1].min) i++;
  const L = LEAGUES[i], top = LEAGUES[i + 1];
  if (!top) return { i, n: L.n, c: L.c, div: '', name: L.n, from: L.min, to: 0, pct: 1 };
  const span = (top.min - L.min) / 3, d = Math.min(2, Math.floor((rp - L.min) / span));
  const from = L.min + d * span, to = from + span;
  return { i, n: L.n, c: L.c, div: ['III', 'II', 'I'][d], name: L.n + ' ' + ['III', 'II', 'I'][d], from: Math.round(from), to: Math.round(to), pct: (rp - from) / span };
}
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
  '#ffb4a2', '#80ffdb', '#e0aaff', '#fdffb6', '#90dbf4',
];

export const CLASS_ORDER = ['asker', 'doktor', 'tamirci', 'nisanci', 'kalkanci', 'alevci', 'bombaci', 'izci', 'muhendis', 'kimyager', 'komutan', 'tesla', 'avci', 'kilicci', 'egitmen', 'ajan', 'hacker'];

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
    hp: 110, spd: 210, dmg: 110, rate: 1.25, spread: 0.008, bspd: 1900, life: 0.9, pellets: 1, pierce: 3, kind: 'b', gun: 36,
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
  kilicci: {
    name: 'Kılıççı', weapon: 'Kılıç', tiers: ['Kılıç', 'Keskin kılıç', 'Ejder kılıcı'], desc: 'Yakın dövüşün ustası. Önündeki her şeyi tek savuruşta biçer.',
    hp: 155, spd: 238, dmg: 56, rate: 2.3, spread: 0, bspd: 0, life: 0, pellets: 1, pierce: 6, kind: 'm', gun: 34, reach: 100, arc: 1.05,
    ab: { name: 'Kasırga', desc: '3 saniye dönerek etrafındaki her şeyi biçer, aldığın hasar %40 azalır.', cd: 15, dur: 3, r: 125, dmg: 34 },
    look: 'blade',
    pas: { name: 'Kan emici', desc: 'Kılıç vuruşlarının bir kısmı sana can olarak döner.' },
    bars: { can: 0.8, hiz: 0.7, hasar: 0.85 },
  },
  egitmen: {
    name: 'Eğitmen', weapon: 'Tabanca', tiers: ['Tabanca', 'Ağır tabanca', 'Çift tabanca'], desc: 'Sadık köpeği zombileri yakalayıp tutar, o da arkadan bitirir.',
    hp: 110, spd: 225, dmg: 22, rate: 4.5, spread: 0.035, bspd: 1150, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 22,
    ab: { name: 'Saldır!', desc: 'Köpeğin nişan aldığın yere fırlar: 4 saniye iki kat sert ısırır ve hedefini olduğu yere çiviler.', cd: 14, dur: 4 },
    dog: { dmg: 24, rate: 0.6, spd: 360, range: 330 },
    pas: { name: 'Sadık dost', desc: 'Yanında hep bir saldırı köpeği gezer; en yakın zombiye koşar, ısırır ve yavaşlatır.' },
    bars: { can: 0.55, hiz: 0.6, hasar: 0.5 },
  },
  ajan: {
    name: 'Ajan', weapon: 'Susturuculu tabanca', tiers: ['Susturuculu tabanca', 'Gizli tabanca', 'Hayalet tabancası'], desc: 'Gölgelerde kaybolur, arkadan vurur, iz bırakmaz.',
    hp: 110, spd: 240, dmg: 36, rate: 3.6, spread: 0.02, bspd: 1400, life: 0.62, pellets: 1, pierce: 0, kind: 'b', gun: 24,
    ab: { name: 'Gölge', desc: '5 saniye görünmez olursun: zombiler seni kaybeder. Gölgeden ilk vuruşun iki kat sert, sonra görünürsün.', cd: 16, dur: 5 },
    look: 'quiet',
    pas: { name: 'Arkadan vuruş', desc: 'Sırtı sana dönük hedeflere %50 daha sert vurursun.' },
    bars: { can: 0.4, hiz: 0.8, hasar: 0.6 },
  },
  hacker: {
    name: 'Hacker', weapon: 'Akıllı tabanca', tiers: ['Akıllı tabanca', 'Güdümlü tabanca', 'Kuantum tabancası'], desc: 'Zombileri bir süre kendi tarafına geçirir, takımın makinelerini güçlendirir.',
    hp: 100, spd: 222, dmg: 17, rate: 6.5, spread: 0.05, bspd: 1150, life: 0.6, pellets: 1, pierce: 0, kind: 'b', gun: 24, home: 4,
    ab: { name: 'Ele Geçir', desc: 'Nişan aldığın yöndeki 3 zombiyi 8 saniye kendi tarafına geçirir; süre bitince patlarlar. Bosslar etkilenmez.', cd: 22, dur: 8, n: 3, r: 450 },
    look: 'smart',
    pas: { name: 'Ağ uzmanı', desc: 'Mermilerin hedefe hafifçe döner. Yakınındaki taret, dron ve bobinler %25 daha sert vurur.' },
    bars: { can: 0.5, hiz: 0.6, hasar: 0.55 },
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
  kilicci: ['Kasırga 1 sn uzar', 'Kasırga alanı ve hasarı büyür', 'Kasırga zombileri savurur'],
  egitmen: ['Saldırı 2 sn uzar', 'Köpek %40 daha sert ısırır', 'İkinci bir köpek'],
  ajan: ['Gölge 1,5 sn uzar', 'Gölgedeyken %30 daha hızlı koşarsın', 'Gölgeden ilk vuruş üç kat sert'],
  hacker: ['Bir zombi daha ele geçirir', 'Ele geçirilenler iki kat sert vurur', 'Süre 4 sn uzar, patlama büyür'],
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
  if (cls === 'kilicci') return d + (k >= 1 ? 1 : 0);
  if (cls === 'egitmen') return d + (k >= 1 ? 2 : 0);
  if (cls === 'ajan') return d + 1.5 * Math.min(1, k);
  if (cls === 'hacker') return d + ((l | 0) >= 3 ? 4 : 0);
  return d;
}

// Weapon levels bought in the armory: level 1 picks a path, level 3 picks one of the path's two
// branches, level 5 unlocks the branch's special power. The path or branch can be changed for gold.
export const WMAX = 5;
export const WEAPON_COST = [0, 150, 400, 850, 1500, 2400];
export const BRANCH_SWAP = 250;
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const weaponSpent = (wt) => WEAPON_COST.slice(1, (wt | 0) + 1).reduce((a, b) => a + b, 0);
// ---------- weapon paths: every class has four of its own ----------
// A path changes how the gun works from level 1; at level 3 the player picks one of its two branches and
// level 5 (the "cap") unlocks the branch's top power. Each path is built from small effect pieces that
// the host applies on hit (fx) and that every player's bullets use (weapon fields).
// Curves: how damage and fire rate grow over levels 0..5 (on top of the shared level bonus).
const CURVE = {
  H: { dmg: [1, 1.4, 1.75, 2.05, 2.35, 2.7], rate: [1, 0.92, 0.88, 0.86, 0.84, 0.82] },   // heavy: slower, much harder
  R: { dmg: [1, 1.03, 1.05, 1.08, 1.1, 1.12], rate: [1, 1.25, 1.5, 1.6, 1.72, 1.85] },     // rapid
  M: { dmg: [1, 1.18, 1.32, 1.46, 1.6, 1.75], rate: [1, 1.04, 1.08, 1.1, 1.12, 1.15] },    // balanced
  E: { dmg: [1, 1.1, 1.2, 1.3, 1.4, 1.5], rate: [1, 1.05, 1.1, 1.13, 1.16, 1.2] },         // the effect does part of the work
  S: { dmg: [1, 1.08, 1.15, 1.22, 1.3, 1.38], rate: [1, 1.04, 1.07, 1.1, 1.12, 1.15] },    // a strong effect does most of it
};
const L3 = (a, i) => a[Math.max(0, Math.min(2, i))];
// [name, adjective, description, colour, gun model, sound, curve, base(f, w, t), [branch1, branch2]]
// branch: [name, adjective, description, top power, (f, w, i, cap) => {}]
// gun models: 1 heavy shroud, 2 drum, 3 long barrel and scope, 4 frost, 5 vial, 6 coils, 7 fuel tank, 9 blade, 10 dish, 11 twin
// sounds: 1 heavy, 2 rapid, 3 crack, 4 ice, 5 hiss, 6 lightning, 7 fire, 8 special
const CP = {
  asker: [
    ['Ağır kalibre', 'Ağır', 'Daha yavaş ama çok sert vurur; vuruşlar zombileri biraz iter', '#ff8a3d', 1, 1, 'H', (f, w, t) => { f.kb = 30 + 6 * t; w.heavy = Math.min(3, Math.ceil(t * 0.6)); }, [
      ['Sarsıcı', 'Sarsıcı', 'Vuruşlar zombileri geri iter ve sendeletir', 'Her vuruş zombiyi sersemletir', (f, w, i, cap) => { f.kb = L3([90, 110, 130], i); f.stun = cap ? 0.45 : 0.12; f.dazed = L3([1.3, 1.45, 1.6], i); }],
      ['Yıkıcı', 'Yıkıcı', 'İri zombilere ve bosslara çok daha sert', 'Mermiler küçük patlamalar yapar', (f, w, i, cap) => { f.big = L3([1.25, 1.4, 1.55], i); if (cap) f.blast = 45; }]]],
    ['Taramalı', 'Taramalı', 'Tetiğe bastıkça ısınır: ateş hızı gittikçe artar', '#ffd23f', 2, 2, 'S', (f, w, t) => { f.ramp = 0.2 + 0.06 * t; f.rampT = 1.6; }, [
      ['Kızgın namlu', 'Kızgın', 'Çok daha çabuk ısınır, daha da hızlanır', 'Mermiler bir zombiden diğerine seker', (f, w, i, cap) => { f.ramp += L3([0.1, 0.15, 0.2], i); f.rampT = 0.9; if (cap) f.rico = 0.6; }],
      ['Çift şarjör', 'Çift şarjörlü', 'Isınınca her atışta iki mermi', 'Isınınca her atışta üç mermi', (f, w, i, cap) => { f.rampPel = cap ? 2 : 1; f.rampPelK = cap ? 0.45 : L3([0.58, 0.6, 0.6], i); }]]],
    ['Süngü', 'Süngülü', 'Yakındaki zombilere çok daha sert vurur ve onları iter', '#e8e2d2', 9, 1, 'M', (f, w, t) => { f.close = [190, 1.2 + 0.06 * t]; f.kb = 20 + 6 * t; }, [
      ['Hücum', 'Hücum', 'Öldürdüğün her zombi seni bir an hızlandırır', 'Hızlanırken iki kat hasar', (f, w, i, cap) => { f.haste = L3([1, 1.5, 2], i); if (cap) f.hasteDmg = 2; }],
      ['Siper', 'Siper', 'Yakın vuruşlar zombileri sersemletir', 'Yakın vuruşlar canını yeniler', (f, w, i, cap) => { f.closeStun = L3([0.15, 0.22, 0.3], i); if (cap) f.leechClose = 0.06; }]]],
    ['Bomba atar', 'Patlayıcı', 'Tüfek yerine bomba atar: yavaş ama her atış patlar', '#c2d16a', 2, 8, { dmg: [1, 2.6, 2.9, 3.2, 3.5, 3.9], rate: [1, 0.2, 0.21, 0.22, 0.23, 0.25] }, (f, w, t) => { w.kind = 'g'; w.aoe = 70 + 10 * t; w.bspd = 720; w.life = 0.8; }, [
      ['Geniş alan', 'Yıkıcı', 'Patlama alanı çok büyür', 'Patlamalar zombileri sarsar', (f, w, i, cap) => { w.aoe += L3([25, 40, 60], i); if (cap) f.stun = 0.3; }],
      ['Seri atar', 'Seri', 'Daha hızlı bomba atar', 'Her atışta iki bomba', (f, w, i, cap) => { f.rateX = L3([1.3, 1.4, 1.5], i); if (cap) { w.pellets = 2; f.pelDmg = 0.7; w.spread = 0.08; } }]]],
  ],
  doktor: [
    ['Uyutucu dart', 'Uyutucu', 'Dartlar zombileri uyuşturur: çok yavaşlarlar ve sersemlerler', '#5fd38d', 5, 8, { dmg: [1, 1.15, 1.25, 1.35, 1.45, 1.55], rate: [1, 0.85, 0.87, 0.9, 0.92, 0.95] }, (f, w, t) => { f.slow = 2.5; f.slowK = 0.55; f.stun = t >= 2 ? 0.08 : 0; }, [
      ['Narkoz', 'Narkozlu', 'Zombiler çok daha fazla yavaşlar', 'Dartlar zombileri bir an uyutur', (f, w, i, cap) => { f.slowK = L3([0.4, 0.34, 0.28], i); if (cap) f.sleep = 0.12; }],
      ['Teşhis', 'Teşhisli', 'Uyuşan zombiler çok daha fazla hasar alır', 'Sersemleyen zombiler iki kat hasar alır', (f, w, i, cap) => { f.brittle = L3([1.2, 1.28, 1.36], i); if (cap) { f.stun = 0.2; f.dazed = 2; } }]]],
    ['Kan emici', 'Kan emici', 'Vurduğun hasarın bir kısmı canına döner', '#e5484d', 5, 5, 'E', (f, w, t) => { f.leech = 0.03 + 0.012 * t; }, [
      ['Kan bankası', 'Bankalı', 'Çok daha fazla can emer', 'Fazla can yakındaki takım arkadaşlarına gider', (f, w, i, cap) => { f.leech += L3([0.03, 0.045, 0.06], i); if (cap) f.leechAll = 0.5; }],
      ['Bağışıklık', 'Bağışık', 'Her vuruş yeteneğini biraz doldurur', 'Can emerken bir süre daha az hasar alırsın', (f, w, i, cap) => { f.cdr = L3([0.04, 0.06, 0.08], i); if (cap) f.guard = 1.5; }]]],
    ['Neşter', 'Neşterli', 'Canı azalmış zombileri bitirir; dartlar bir zombiyi deler', '#dfe6ee', 3, 3, 'M', (f, w, t) => { f.exec = [0.3 + 0.02 * t, 1.4 + 0.08 * t]; f.pierce = 1; }, [
      ['Cerrah', 'Cerrah', 'Bitirme vuruşları çok daha sert', 'Canı üçte birin altındakiler tek vuruşta düşer', (f, w, i, cap) => { f.exec = [f.exec[0] + 0.05, f.exec[1] + L3([0.4, 0.6, 0.8], i)]; if (cap) f.execKill = 0.33; }],
      ['Otopsi', 'Otopsili', 'Öldürdüğün zombi çevresine şarapnel saçar', 'Şarapnel daha geniş ve sert', (f, w, i, cap) => { f.burst = [cap ? 110 : 80, L3([0.35, 0.45, 0.55], i)]; }]]],
    ['Adrenalin', 'Adrenalinli', 'Vuruşlar yeteneğini doldurur, öldürmek seni hızlandırır', '#ff7ab6', 2, 2, 'R', (f, w, t) => { f.cdr = 0.02 + 0.006 * t; f.haste = 0.8; }, [
      ['Yüksek doz', 'Yüksek dozlu', 'Yetenek çok daha çabuk dolar', 'Hızlanırken çok daha hızlı ateş', (f, w, i, cap) => { f.cdr += L3([0.03, 0.045, 0.06], i); if (cap) f.hasteRate = 1.4; }],
      ['Şok iğnesi', 'Şok', 'Dartlar zombileri bir an sersemletir', 'Sersemleyen zombiler daha çok hasar alır', (f, w, i, cap) => { f.stun = L3([0.1, 0.14, 0.18], i); if (cap) f.dazed = 1.6; }]]],
  ],
  tamirci: [
    ['Çivi tabancası', 'Çivili', 'Pompalı yerine çok hızlı çivi yağdırır, çiviler zombileri yere çakar', '#d8c7a0', 11, 8, { dmg: [1, 1.2, 1.35, 1.5, 1.65, 1.85], rate: [1, 5.2, 5.5, 5.8, 6.1, 6.5] }, (f, w, t) => { w.spread = 0.07; w.pellets = 1; w.bspd = 1300; w.life = 0.5; w.look = 'nail'; f.kb = 40; f.stun = 0.1; f.noPel = 1; }, [
      ['Çakıcı', 'Çakıcı', 'Çiviler zombileri daha uzun tutar', 'Çivilenen zombiler %30 fazla hasar alır', (f, w, i, cap) => { f.stun = L3([0.15, 0.2, 0.25], i); if (cap) f.dazed = 1.3; }],
      ['Şarapnel', 'Şarapnelli', 'Her atışta iki çivi', 'Her atışta üç çivi', (f, w, i, cap) => { w.pellets = cap ? 3 : 2; f.pelDmg = 0.7; }]]],
    ['Kalın saçma', 'Kalın', 'Daha az ama çok sert saçma; yakındakileri geri fırlatır', '#ff8a3d', 1, 1, 'H', (f, w, t) => { f.pelK = 0.75; f.kb = 40 + 8 * t; w.heavy = Math.min(3, Math.ceil(t * 0.6)); }, [
      ['Koç', 'Koç', 'Zombileri çok daha uzağa fırlatır ve sersemletir', 'Fırlayan zombiler çarptıklarına hasar verir', (f, w, i, cap) => { f.kb = L3([110, 135, 160], i); f.stun = 0.15; if (cap) f.blast = 40; }],
      ['Saçma yağmuru', 'Yağmur', 'Saçma sayısı geri gelir, ateş hızlanır', 'Çok daha fazla saçma', (f, w, i, cap) => { f.pelK = cap ? 1.15 : L3([0.9, 0.95, 1], i); f.rateX = L3([1.1, 1.15, 1.15], i); if (cap) f.pelDmg = 0.7; }]]],
    ['Şarapnel', 'Şarapnelli', 'Her saçma çarptığı yerde küçük bir patlama yapar', '#f4a259', 2, 3, 'S', (f, w, t) => { f.blast = 18 + 3 * t; f.blastK = 0.22; }, [
      ['Misket', 'Misketli', 'Patlamalar çok daha geniş', 'Patlamalar zombileri sersemletir', (f, w, i, cap) => { f.blast += L3([10, 15, 22], i); if (cap) f.stun = 0.2; }],
      ['Tahrip', 'Tahripli', 'Patlamalar çok daha sert', 'İri zombilere ve bosslara iki kat', (f, w, i, cap) => { f.blastK = L3([0.32, 0.38, 0.45], i); if (cap) f.big = 2; }]]],
    ['Mıknatıs', 'Mıknatıslı', 'Vurduğun zombileri sana doğru çeker; çekilenler bir an sendeler', '#8fa8ff', 10, 6, 'E', (f, w, t) => { f.pull = 45 + 9 * t; f.stun = 0.06; }, [
      ['Çekim', 'Çekimli', 'Çok daha güçlü çeker', 'Çekilen zombiler birbirine çarpıp hasar alır', (f, w, i, cap) => { f.pull += L3([30, 45, 60], i); if (cap) f.blast = 35; }],
      ['Ezici', 'Ezici', 'Sendeleyen zombilere çok daha sert', 'Çekilen zombiler bir süre daha yavaş', (f, w, i, cap) => { f.dazed = L3([1.35, 1.5, 1.65], i); f.stun = 0.12; if (cap) { f.slow = 1.5; f.slowK = 0.6; } }]]],
  ],
  nisanci: [
    ['Raylı top', 'Raylı', 'Tek dev atış, her şeyi ve kalkanları deler', '#7ad8ff', 6, 8, { dmg: [1, 1.6, 1.8, 2, 2.2, 2.45], rate: [1, 0.72, 0.74, 0.76, 0.78, 0.8] }, (f, w, t) => { w.bspd = 2600; w.life *= 1.4; w.look = 'rail'; f.pierce = 99; f.noShield = t >= 3; }, [
      ['Aşırı yük', 'Aşırı yüklü', 'Atışlar çok daha sert', 'Kritik atışlar üç kat vurur', (f, w, i, cap) => { f.dmgX = L3([1.12, 1.18, 1.25], i); f.crit = 0.18; f.critX = cap ? 3 : 2; }],
      ['Hızlı şarj', 'Hızlı', 'Daha sık ateş eder', 'Atış yolundaki zombiler sersemler', (f, w, i, cap) => { f.rateX = L3([1.1, 1.15, 1.22], i); if (cap) f.stun = 0.35; }]]],
    ['Kriyojenik', 'Kriyojenik', 'Mermiler zombileri dondurur ve yavaşlatır', '#7bdff2', 4, 4, 'E', (f, w, t) => { f.slow = [0, 1.5, 2.5, 3, 3.5, 4][t]; f.slowK = 0.55; f.frost = 1; }, [
      ['Donduran', 'Donduran', 'Zombiler çok daha fazla yavaşlar', 'Vuruşlar zombileri buz kalıbına çevirebilir', (f, w, i, cap) => { f.slowK = L3([0.45, 0.4, 0.35], i); f.dazed = cap ? 1.5 : L3([1.15, 1.25, 1.25], i); if (cap) f.freeze = 0.12; }],
      ['Kırılgan', 'Kırıcı', 'Yavaşlayan zombiler daha çok hasar alır', 'Donan zombiler ölünce buz parçalarına patlar', (f, w, i, cap) => { f.brittle = L3([1.15, 1.22, 1.3], i); f.shatter = cap; }]]],
    ['Av işareti', 'İşaretli', 'Vurduğun zombi işaretlenir: herkesten daha çok hasar alır', '#ffb347', 3, 3, 'M', (f, w, t) => { f.mark = [1.08 + 0.04 * t, 4]; }, [
      ['Gözcü', 'Gözcü', 'İşaret daha güçlü ve daha uzun', 'İşaret yakındaki zombilere de yayılır', (f, w, i, cap) => { f.mark = [f.mark[0] + L3([0.08, 0.12, 0.16], i), 6]; if (cap) f.markR = 120; }],
      ['Kafadan', 'Kafadan', 'İşaretli zombilere kritik şansı', 'Kritikler üç kat vurur', (f, w, i, cap) => { f.crit = L3([0.18, 0.24, 0.3], i); f.critX = cap ? 3 : 2.2; }]]],
    ['Seken mermi', 'Seken', 'Mermi vurduğu zombiden yakındaki bir başkasına seker', '#c9a2ff', 3, 3, 'M', (f, w, t) => { f.rico = 0.4 + 0.06 * t; f.ricoN = 1 + (t >= 2 ? 1 : 0); }, [
      ['Bilardo', 'Bilardo', 'Mermi daha çok zombiye seker', 'Her sekme biraz daha sert vurur', (f, w, i, cap) => { f.ricoN += L3([1, 2, 3], i); if (cap) f.ricoUp = 1.2; }],
      ['Delip geçen', 'Delici', 'Seken mermi zombileri deler', 'Mermiler kalkanları da deler', (f, w, i, cap) => { f.pierce = L3([2, 3, 5], i); if (cap) f.noShield = true; }]]],
  ],
  kalkanci: [
    ['Koçbaşı', 'Koçbaşı', 'Ağır mermiler zombileri geri iter, yaklaşmalarını zorlaştırır', '#ff8a3d', 1, 1, 'H', (f, w, t) => { f.kb = 35 + 9 * t; w.heavy = Math.min(3, Math.ceil(t * 0.6)); }, [
      ['Duvar', 'Duvar', 'Çok daha güçlü iter', 'İtilen zombiler sersemler', (f, w, i, cap) => { f.kb = L3([100, 125, 150], i); if (cap) f.stun = 0.3; }],
      ['Ezen', 'Ezen', 'İri zombilere ve bosslara çok daha sert', 'Bosslara karşı her vuruş zırhını deler', (f, w, i, cap) => { f.big = L3([1.3, 1.45, 1.6], i); if (cap) f.noShield = true; }]]],
    ['Baskı ateşi', 'Bastıran', 'Kalkanın arkasından hızlı ateş; vurulan zombiler yavaşlar', '#ffd23f', 2, 2, 'R', (f, w, t) => { f.slow = 1; f.slowK = 0.8 - 0.02 * t; }, [
      ['Kurşun duvarı', 'Duvarlı', 'Zombiler çok daha fazla yavaşlar', 'Yavaşlayan zombiler daha çok hasar alır', (f, w, i, cap) => { f.slowK = L3([0.65, 0.58, 0.5], i); if (cap) f.brittle = 1.25; }],
      ['Sürekli ateş', 'Sürekli', 'Tetiğe bastıkça ısınıp hızlanır', 'Isınınca mermiler zombileri deler', (f, w, i, cap) => { f.ramp = L3([0.15, 0.2, 0.25], i); f.rampT = 1.5; if (cap) f.pierce = 2; }]]],
    ['Zırh kıran', 'Zırh kıran', 'Mermiler kalkanlı ve zırhlı zombileri deler', '#c77dff', 3, 3, 'M', (f, w, t) => { f.noShield = true; f.pierce = Math.min(2, t); f.armorK = 1.3 + 0.05 * t; }, [
      ['Delici', 'Delici', 'Mermiler daha çok zombiyi deler', 'Mermiler her şeyi deler', (f, w, i, cap) => { f.pierce = cap ? 99 : L3([3, 5, 5], i); }],
      ['Parçalayıcı', 'Parçalayıcı', 'İri zombilere çok daha sert', 'Zırhlı ve elit zombilere iki kat', (f, w, i, cap) => { f.big = L3([1.25, 1.4, 1.5], i); if (cap) f.armorK = 2; }]]],
    ['Kan bağı', 'Kan bağlı', 'Yakındaki zombilere daha sert vurur ve canını yeniler', '#e5484d', 5, 5, 'E', (f, w, t) => { f.close = [200, 1.15 + 0.04 * t]; f.leechClose = 0.02 + 0.008 * t; }, [
      ['Kale', 'Kale', 'Yakın vuruşlar çok daha fazla can verir', 'Can yenilerken daha az hasar alırsın', (f, w, i, cap) => { f.leechClose += L3([0.02, 0.03, 0.04], i); if (cap) f.guard = 1.5; }],
      ['Öfke', 'Öfkeli', 'Canın azaldıkça daha sert vurursun', 'Canın yarının altındayken iki kat hasar', (f, w, i, cap) => { f.rage = L3([0.4, 0.55, 0.7], i); if (cap) f.rageCap = 2; }]]],
  ],
  alevci: [
    ['Cehennem', 'Cehennem', 'Alev çok daha uzun yakar ve yayılır', '#ff5a36', 7, 7, 'E', (f, w, t) => { f.burn = [0, 0.25, 0.3, 0.34, 0.38, 0.42][t]; f.bdur = 3.5; }, [
      ['Napalm', 'Yapışkan', 'Yanan zombiler değdiklerini tutuşturur', 'Yanan zombiler ölünce patlar', (f, w, i, cap) => { f.burn *= 0.75; f.napalm = true; f.boomOnDeath = cap; }],
      ['Kor', 'Kor', 'Yanma çok daha fazla hasar verir', 'Vuruşlar yerde alev bırakır', (f, w, i, cap) => { f.burn *= L3([1.5, 1.8, 2.2], i); if (cap) f.patch = true; }]]],
    ['Alev halısı', 'Halı', 'Alev yere yapışır: arkanda yanan bir yol bırakırsın', '#ff9f1c', 7, 7, 'S', (f, w, t) => { f.patch = true; f.patchK = 0.3 + 0.04 * t; f.patchT = 0.9 - 0.05 * t; }, [
      ['Orman yangını', 'Yangın', 'Yanan zemin daha geniş ve uzun', 'Yanan zemin zombileri yavaşlatır', (f, w, i, cap) => { f.patchR = L3([70, 80, 95], i); if (cap) f.patchSlow = true; }],
      ['Lav', 'Lav', 'Yanan zemin çok daha sert yakar', 'Zeminde yanan zombiler patlar', (f, w, i, cap) => { f.patchK += L3([0.15, 0.25, 0.35], i); if (cap) f.boomOnDeath = true; }]]],
    ['Uzun hortum', 'Uzun', 'Alev daha uzağa gider, daha çok zombiyi deler', '#ffd166', 3, 7, 'M', (f, w, t) => { w.life *= 1 + 0.12 * t; f.pierce = 2 + t; }, [
      ['Alev topu', 'Toplu', 'Alev uçta küçük patlamalar yapar', 'Patlamalar zombileri tutuşturur', (f, w, i, cap) => { f.blast = L3([30, 40, 50], i); f.blastK = 0.3; if (cap) f.burn = 0.3; }],
      ['Basınç', 'Basınçlı', 'Alev çok daha sık püskürür', 'Alev zombileri geri iter', (f, w, i, cap) => { f.rateX = L3([1.2, 1.3, 1.4], i); if (cap) f.kb = 60; }]]],
    ['Termit', 'Termit', 'Kalkan ve zırhları eritir, iri zombilere çok sert', '#fff1a8', 6, 7, 'E', (f, w, t) => { f.noShield = true; f.big = 1.15 + 0.06 * t; f.armorK = 1.4; }, [
      ['Eritici', 'Eritici', 'Bosslara ve iri zombilere daha da sert', 'Bossları tutuşturur, yanmaları uzun sürer', (f, w, i, cap) => { f.big += L3([0.2, 0.3, 0.4], i); if (cap) { f.burn = 0.35; f.bdur = 6; } }],
      ['Kıvılcım', 'Kıvılcımlı', 'Vuruşlar çevreye kıvılcım saçar', 'Kıvılcımlar zombileri sersemletir', (f, w, i, cap) => { f.blast = L3([35, 45, 55], i); f.blastK = 0.25; if (cap) f.stun = 0.15; }]]],
  ],
  bombaci: [
    ['Büyük şarj', 'Büyük', 'Bombalar daha sert ve geniş patlar', '#ff8a3d', 1, 1, 'H', (f, w, t) => { w.aoe += 10 * t; w.heavy = Math.min(3, Math.ceil(t * 0.6)); }, [
      ['Yer sarsan', 'Sarsan', 'Patlamalar zombileri geri fırlatır', 'Patlamalar zombileri sersemletir', (f, w, i, cap) => { f.kb = L3([80, 100, 120], i); if (cap) f.stun = 0.4; }],
      ['Bunker kırıcı', 'Kırıcı', 'İri zombilere ve bosslara çok daha sert', 'Patlama alanı çok büyür', (f, w, i, cap) => { f.big = L3([1.3, 1.45, 1.6], i); if (cap) w.aoe += 50; }]]],
    ['Misket', 'Misketli', 'Her atışta birden çok küçük bomba saçar', '#f4a259', 11, 2, 'M', (f, w, t) => { w.pellets = 2 + (t >= 2 ? 1 : 0); f.pelDmg = t >= 2 ? 0.34 : 0.5; w.spread = 0.18; w.aoe *= 0.65; f.noPel = 1; }, [
      ['Halı bombası', 'Halı', 'Daha çok bomba', 'Her atışta beş bomba', (f, w, i, cap) => { w.pellets = cap ? 5 : 4; f.pelDmg = cap ? 0.23 : 0.27; }],
      ['Seri misket', 'Seri', 'Çok daha sık atar', 'Bombalar daha geniş patlar', (f, w, i, cap) => { f.rateX = L3([1.15, 1.22, 1.2], i); if (cap) w.aoe *= 1.4; }]]],
    ['Yapışkan', 'Yapışkan', 'Patlama yapışkan bir sıvı saçar: zombiler çok yavaşlar', '#9ad86b', 5, 5, 'E', (f, w, t) => { f.slow = 2 + 0.3 * t; f.slowK = 0.55; }, [
      ['Zamk', 'Zamklı', 'Zombiler neredeyse durur', 'Yapışan zombiler bir an tamamen durur', (f, w, i, cap) => { f.slowK = L3([0.42, 0.36, 0.3], i); if (cap) f.stun = 0.5; }],
      ['Katran', 'Katranlı', 'Yapışan zombiler daha çok hasar alır', 'Yere zombileri yavaşlatan bir katran gölü bırakır', (f, w, i, cap) => { f.brittle = L3([1.2, 1.28, 1.36], i); if (cap) f.tar = [70, 3]; }]]],
    ['Sekme bombası', 'Seken', 'Bomba ilk çarptığı yerde patlar, sonra bir kez daha sekip patlar', '#c77dff', 2, 1, 'M', (f, w, t) => { f.bounce = 1; f.bounceK = 0.45 + 0.05 * t; }, [
      ['Zıplayan', 'Zıplayan', 'Bomba bir kez daha seker', 'Her sekme daha geniş patlar', (f, w, i, cap) => { f.bounce = 2; f.bounceK += L3([0.05, 0.1, 0.15], i); if (cap) f.bounceAoe = 1.3; }],
      ['Gecikmeli', 'Gecikmeli', 'İkinci patlama çok daha sert', 'İkinci patlama zombileri sersemletir', (f, w, i, cap) => { f.bounceK += L3([0.3, 0.45, 0.6], i); if (cap) f.stun = 0.35; }]]],
  ],
  izci: [
    ['Hazine avcısı', 'Avcı', 'Öldürdüğün zombilerden fazladan altın düşer', '#ffd34d', 11, 2, 'E', (f, w, t) => { f.goldK = 0.1 + 0.05 * t; }, [
      ['Yağmacı', 'Yağmacı', 'Çok daha fazla altın', 'Elit ve iri zombilerden üç kat altın', (f, w, i, cap) => { f.goldK += L3([0.15, 0.22, 0.3], i); if (cap) f.goldBig = 3; }],
      ['Kumarbaz', 'Kumarbaz', 'Altının arttıkça kritik şansın artar', 'Kritikler fazladan altın verir', (f, w, i, cap) => { f.critGold = L3([0.04, 0.06, 0.08], i); f.critX = 2.2; if (cap) f.critGoldK = 1; }]]],
    ['Sekme', 'Seken', 'Mermiler vurduğu zombiden bir başkasına seker', '#c9a2ff', 3, 3, 'M', (f, w, t) => { f.rico = 0.45 + 0.05 * t; f.ricoN = 1 + (t >= 2 ? 1 : 0); }, [
      ['Akrobat', 'Akrobat', 'Mermiler çok daha çok seker', 'Her sekme biraz daha sert', (f, w, i, cap) => { f.ricoN += L3([1, 2, 3], i); if (cap) f.ricoUp = 1.2; }],
      ['Kesişen', 'Kesişen', 'İki tabancanın mermileri aynı zombiye çarpınca sersemletir', 'Sekmeler kritik vurabilir', (f, w, i, cap) => { f.stun = L3([0.08, 0.12, 0.16], i); if (cap) f.crit = 0.2; }]]],
    ['Akıncı', 'Akıncı', 'Öldürmek seni hızlandırır, koşarken daha hızlı ateş edersin', '#7cf29c', 2, 2, 'R', (f, w, t) => { f.haste = 0.6 + 0.15 * t; f.hasteRate = 1.15 + 0.03 * t; }, [
      ['Rüzgar', 'Rüzgar', 'Hızlanma çok daha uzun sürer', 'Hızlanırken mermiler deler', (f, w, i, cap) => { f.haste += L3([0.8, 1.2, 1.6], i); if (cap) f.hastePierce = 2; }],
      ['Vur kaç', 'Vurkaç', 'Hızlanırken çok daha sert vurursun', 'Hızlanırken iki kat hasar', (f, w, i, cap) => { f.hasteDmg = cap ? 2 : L3([1.3, 1.45, 1.45], i); }]]],
    ['Keskin nişan', 'Keskin', 'Yüksek kritik şansı; kritikler çok sert', '#ff5a5a', 3, 3, 'M', (f, w, t) => { f.crit = 0.08 + 0.025 * t; f.critX = 2.2; }, [
      ['Ölümcül', 'Ölümcül', 'Kritikler çok daha sert', 'Kritikler üç kat vurur ve deler', (f, w, i, cap) => { f.critX = cap ? 3 : L3([2.5, 2.7, 2.7], i); }],
      ['Göz kararı', 'Göz kararı', 'Kritik şansı çok artar', 'Kritik vuruşlar zombiyi sersemletir', (f, w, i, cap) => { f.crit += L3([0.08, 0.12, 0.16], i); if (cap) f.critStun = 0.3; }]]],
  ],
  muhendis: [
    ['Hedef lazeri', 'Lazerli', 'Vurduğun zombiler işaretlenir, dronlar ve taretler onlara çok daha sert vurur', '#ff3b3b', 10, 3, 'E', (f, w, t) => { f.mark = [1.08 + 0.04 * t, 3.5]; f.home = 2; }, [
      ['Kilit', 'Kilitli', 'Mermiler hedefe daha çok döner, işaret güçlenir', 'İşaretli zombiye taretler iki kat vurur', (f, w, i, cap) => { f.home = 4; f.mark = [f.mark[0] + L3([0.06, 0.1, 0.14], i), 4.5]; if (cap) f.markTur = 2; }],
      ['Tarama', 'Taramalı', 'İşaret yakındaki zombilere de yayılır', 'İşaretli zombiler yavaşlar', (f, w, i, cap) => { f.markR = L3([80, 110, 140], i); if (cap) { f.slow = 1.5; f.slowK = 0.7; } }]]],
    ['Şok tabancası', 'Şoklu', 'Mermiler zombileri bir an sersemletir', '#9ad8ff', 6, 6, 'E', (f, w, t) => { f.stun = 0.06 + 0.015 * t; }, [
      ['Kısa devre', 'Kısa devreli', 'Daha uzun sersemletir', 'Sersemleyen zombiler daha çok hasar alır', (f, w, i, cap) => { f.stun = L3([0.16, 0.2, 0.25], i); if (cap) f.dazed = 1.5; }],
      ['Darbe', 'Darbeli', 'Sersemletme çevreye yayılır', 'Darbe zombileri geri iter', (f, w, i, cap) => { f.blast = L3([40, 50, 60], i); f.blastK = 0.2; f.stunAoe = 1; if (cap) f.kb = 60; }]]],
    ['Perçin', 'Perçinli', 'Aynı zombiye art arda vurdukça her mermi daha sert vurur', '#d8c7a0', 11, 1, 'M', (f, w, t) => { f.stack = [0.05 + 0.01 * t, 6]; }, [
      ['Matkap', 'Matkaplı', 'Art arda vuruşlar çok daha çok birikir', 'Birikim dolunca zombi sersemler', (f, w, i, cap) => { f.stack = [f.stack[0] + L3([0.02, 0.03, 0.04], i), 8]; if (cap) f.stackStun = 0.4; }],
      ['Hidrolik', 'Hidrolik', 'Birikim daha hızlı ve ateş hızı artar', 'Birikim dolunca zombi patlar', (f, w, i, cap) => { f.rateX = L3([1.15, 1.22, 1.3], i); if (cap) f.stackBoom = 70; }]]],
    ['Seyyar havan', 'Havanlı', 'Tüfek yerine küçük havan mermileri atar: yavaş ama alan hasarı', '#c2d16a', 1, 8, { dmg: [1, 2, 2.25, 2.5, 2.75, 3], rate: [1, 0.32, 0.33, 0.34, 0.36, 0.38] }, (f, w, t) => { w.kind = 'g'; w.aoe = 55 + 8 * t; w.bspd = 800; w.life = 0.75; }, [
      ['Şarapnel', 'Şarapnelli', 'Patlama alanı büyür', 'Patlamalar zombileri sersemletir', (f, w, i, cap) => { w.aoe += L3([20, 30, 45], i); if (cap) f.stun = 0.3; }],
      ['Otomatik yükleyici', 'Otomatik', 'Çok daha sık atar', 'Her atışta iki havan', (f, w, i, cap) => { f.rateX = L3([1.25, 1.35, 1.25], i); if (cap) { w.pellets = 2; f.pelDmg = 0.62; w.spread = 0.1; } }]]],
  ],
  kimyager: [
    ['Toksin', 'Toksik', 'Vurduğun zombiler zehirlenip can kaybeder', '#8fd14f', 5, 5, 'E', (f, w, t) => { f.poison = [0, 0.25, 0.32, 0.38, 0.44, 0.5][t]; f.pdur = 4; }, [
      ['Salgın', 'Salgın', 'Zehir ölünce yakındakilere bulaşır', 'Ölen zombiler zehir bulutu bırakır', (f, w, i, cap) => { f.spread = L3([2, 3, 5], i); f.gas = cap; }],
      ['Nörotoksin', 'Nörotoksik', 'Zehirlenen zombiler yavaşlar', 'Zehirlenen zombiler bir an felç olur', (f, w, i, cap) => { f.poison *= 1.1; f.slow = 2; f.slowK = L3([0.7, 0.62, 0.55], i); if (cap) f.stun = 0.3; }]]],
    ['Asit gölü', 'Göllü', 'Atışlar yere asit gölü bırakır', '#b5e61d', 5, 5, 'S', (f, w, t) => { f.puddle = [55 + 5 * t, 2.5]; f.puddleK = 0.25 + 0.04 * t; }, [
      ['Bataklık', 'Bataklık', 'Göller daha geniş ve uzun sürer', 'Göldeki zombiler yavaşlar', (f, w, i, cap) => { f.puddle = [f.puddle[0] + L3([15, 25, 35], i), 4]; if (cap) f.puddleSlow = true; }],
      ['Kostik', 'Kostik', 'Göller çok daha sert yakar', 'Göller kalkanları da eritir', (f, w, i, cap) => { f.puddleK += L3([0.15, 0.25, 0.35], i); if (cap) f.noShield = true; }]]],
    ['Aşındırıcı', 'Aşındırıcı', 'Asit zombilerin derisini eritir: herkesten daha çok hasar alırlar', '#e8ff5a', 3, 5, 'E', (f, w, t) => { f.acidHit = [1.1 + 0.03 * t, 3]; f.pierce = 1; }, [
      ['Eritici', 'Eritici', 'Eriyen zombiler çok daha çok hasar alır', 'Asit kalkanları eritir, bosslara tam işler', (f, w, i, cap) => { f.acidHit = [f.acidHit[0] + L3([0.08, 0.12, 0.16], i), 3.5]; if (cap) f.noShield = true; }],
      ['Delici asit', 'Delici', 'Atışlar daha çok zombiyi deler', 'Atışlar her şeyi deler', (f, w, i, cap) => { f.pierce = cap ? 99 : L3([3, 4, 5], i); }]]],
    ['Patlayan şişe', 'Şişeli', 'Şişe atar: çarptığı yerde patlayıp zehir saçar', '#6bd36b', 5, 8, { dmg: [1, 1.9, 2.1, 2.35, 2.6, 2.85], rate: [1, 0.36, 0.37, 0.38, 0.4, 0.42] }, (f, w, t) => { w.kind = 'g'; w.aoe = 60 + 8 * t; w.bspd = 700; w.life = 0.8; f.poison = 0.25 + 0.03 * t; f.pdur = 3; }, [
      ['Bulut', 'Bulutlu', 'Patlama zehir bulutu bırakır', 'Bulut daha geniş ve uzun', (f, w, i, cap) => { f.cloud = [cap ? 100 : 75, L3([2.5, 3, 3.5], i)]; }],
      ['Molotof kimyası', 'Patlayıcı', 'Patlama alanı büyür, daha sert vurur', 'Her atışta iki şişe', (f, w, i, cap) => { w.aoe += L3([20, 30, 25], i); f.dmgX = L3([1.1, 1.18, 1.1], i); if (cap) { w.pellets = 2; f.pelDmg = 0.7; w.spread = 0.12; } }]]],
  ],
  komutan: [
    ['Hedef göster', 'Hedefli', 'Vurduğun yerdeki zombiler işaretlenir: takımın onlara çok daha sert vurur', '#ff3b3b', 10, 3, 'E', (f, w, t) => { f.mark = [1.1 + 0.035 * t, 4]; f.markR = 70; }, [
      ['Ateş desteği', 'Destekli', 'İşaret daha güçlü ve daha geniş', 'İşaretli zombiler yavaşlar', (f, w, i, cap) => { f.mark = [f.mark[0] + L3([0.06, 0.09, 0.12], i), 5]; f.markR = L3([100, 120, 140], i); if (cap) { f.slow = 1.5; f.slowK = 0.7; } }],
      ['Taarruz', 'Taarruz', 'İşaretli zombiyi öldürmek takımı hızlandırır', 'Takım hızlanırken daha sert vurur', (f, w, i, cap) => { f.teamHaste = L3([1, 1.5, 2], i); if (cap) f.teamPower = 2; }]]],
    ['Komuta tüfeği', 'Ağır', 'Daha yavaş ama çok sert, delip geçen atışlar', '#ff8a3d', 1, 1, 'H', (f, w, t) => { f.pierce = 1 + (t >= 2 ? 1 : 0); w.heavy = Math.min(3, Math.ceil(t * 0.6)); }, [
      ['Top', 'Toplu', 'İri zombilere ve bosslara çok daha sert', 'Atışlar küçük patlamalar yapar', (f, w, i, cap) => { f.big = L3([1.3, 1.45, 1.6], i); if (cap) f.blast = 50; }],
      ['Mermi yolu', 'Delici', 'Atışlar çok daha çok zombiyi deler', 'Atışlar her şeyi deler, kalkanları da', (f, w, i, cap) => { f.pierce = cap ? 99 : L3([3, 4, 6], i); if (cap) f.noShield = true; }]]],
    ['Sancak', 'Sancaklı', 'Öldürdüğün her zombi yakındaki takım arkadaşlarının canını yeniler', '#43d17a', 11, 2, 'M', (f, w, t) => { f.healAll = [220, 2 + t]; }, [
      ['Moral', 'Moralli', 'Daha çok can verir', 'Öldürmek takımı bir an hızlandırır', (f, w, i, cap) => { f.healAll = [260, f.healAll[1] + L3([2, 3, 4], i)]; if (cap) f.teamHaste = 1; }],
      ['Saflar', 'Saflı', 'Takım arkadaşlarının yanındayken daha sert vurursun', 'Yanındaki her arkadaş için daha sert', (f, w, i, cap) => { f.nearAlly = [260, L3([1.15, 1.22, 1.3], i)]; if (cap) f.nearAllyEach = 0.08; }]]],
    ['Keskin göz', 'Keskin', 'Yüksek kritik şansı, menzil artar', '#c77dff', 3, 3, 'M', (f, w, t) => { f.crit = 0.08 + 0.025 * t; f.critX = 2.2; w.life *= 1 + 0.05 * t; }, [
      ['Usta nişancı', 'Usta', 'Kritik şansı çok artar', 'Kritikler üç kat vurur', (f, w, i, cap) => { f.crit += L3([0.08, 0.12, 0.15], i); if (cap) f.critX = 3; }],
      ['Emir', 'Emirli', 'Kritik vuruşlar yeteneğini doldurur', 'Kritik vuruşlar zombiyi işaretler', (f, w, i, cap) => { f.critCdr = L3([0.4, 0.6, 0.8], i); if (cap) f.critMark = 1.25; }]]],
  ],
  tesla: [
    ['Yüksek gerilim', 'Gerilimli', 'Vuruşlar yakındaki zombilere sıçrar', '#9ad8ff', 6, 6, 'E', (f, w, t) => { f.chain = [0, 2, 3, 4, 5, 6][t]; f.chainK = [0, 0.19, 0.2, 0.22, 0.24, 0.26][t]; w.look = 'arc'; }, [
      ['Zincir', 'Zincirleme', 'Şimşek daha çok zombiye sıçrar', 'Şimşek çarptığı zombileri sersemletir', (f, w, i, cap) => { f.chain += L3([0, 0, 1], i); if (cap) f.chainStun = 0.5; }],
      ['Aşırı yük', 'Aşırı yüklü', 'Sıçrayan şimşek çok daha sert', 'Arada bir hedefe yıldırım düşer', (f, w, i, cap) => { f.chain = 3; f.chainK *= L3([1.3, 1.45, 1.6], i); if (cap) f.bolt = 3; }]]],
    ['Plazma topu', 'Plazmalı', 'Yavaş, parlayan plazma topları: çarptığı yerde patlar ve sersemletir', '#c77dff', 10, 6, { dmg: [1, 1.9, 2.15, 2.4, 2.65, 2.9], rate: [1, 0.48, 0.5, 0.52, 0.54, 0.56] }, (f, w, t) => { w.kind = 'g'; w.aoe = 50 + 6 * t; w.bspd = 650; w.life = 0.9; w.look = 'orb'; f.stun = 0.12; }, [
      ['Yıldız', 'Yıldız', 'Patlama çok daha geniş', 'Patlama yakındaki zombilere şimşek atar', (f, w, i, cap) => { w.aoe += L3([20, 30, 40], i); if (cap) { f.chain = 3; f.chainK = 0.25; } }],
      ['Füzyon', 'Füzyon', 'Çok daha sert patlar', 'Sersemletme çok daha uzun', (f, w, i, cap) => { f.dmgX = L3([1.1, 1.18, 1.25], i); if (cap) f.stun = 0.45; }]]],
    ['Kondansatör', 'Yüklü', 'Aynı zombiye vurdukça yük birikir, her vuruş daha sert', '#ffe066', 6, 6, 'M', (f, w, t) => { f.stack = [0.06 + 0.012 * t, 6]; }, [
      ['Boşalma', 'Boşalan', 'Birikim dolunca zombi yıldırımla çarpılır', 'Yıldırım çevredekilere de vurur', (f, w, i, cap) => { f.stackBolt = L3([1.5, 2, 2.5], i); if (cap) f.stackBoom = 80; }],
      ['Yüksek kapasite', 'Kapasiteli', 'Daha çok yük birikir', 'Birikim hiç sıfırlanmaz, sadece azalır', (f, w, i, cap) => { f.stack = [f.stack[0] + L3([0.015, 0.025, 0.03], i), L3([8, 10, 12], i)]; if (cap) f.stackKeep = 1; }]]],
    ['Manyetik alan', 'Manyetik', 'Vurduğun zombileri kendine çeker ve şimşekle yavaşlatır', '#8fa8ff', 10, 6, 'E', (f, w, t) => { f.pull = 40 + 8 * t; f.slow = 1; f.slowK = 0.75; }, [
      ['Kara delik', 'Delikli', 'Çok daha güçlü çeker', 'Çekilen zombiler sıkışıp birbirine hasar verir', (f, w, i, cap) => { f.pull += L3([30, 45, 60], i); if (cap) f.blast = 40; }],
      ['Faraday', 'Faraday', 'Çekilen zombiler daha çok yavaşlar', 'Yakındaki zombiler sana vurunca çarpılır', (f, w, i, cap) => { f.slowK = L3([0.65, 0.58, 0.5], i); if (cap) f.thorns = 0.5; }]]],
  ],
  avci: [
    ['Çelik uç', 'Çelik uçlu', 'Oklar daha çok zombiyi deler, menzil artar', '#c77dff', 3, 3, 'M', (f, w, t) => { w.life *= 1 + 0.08 * t; f.pierce = 4 + t; }, [
      ['Ok yağmuru', 'Yağmur', 'Oklar her şeyi deler', 'Deldiği her zombi oku daha sert yapar', (f, w, i, cap) => { f.pierce = 99; if (cap) f.pierceUp = 1.1; }],
      ['Keskin uç', 'Keskin', 'Kritik şansı', 'Kritikler kalkanları da deler', (f, w, i, cap) => { f.crit = L3([0.12, 0.18, 0.24], i); f.critX = 2.2; if (cap) f.noShield = true; }]]],
    ['Kanca', 'Kancalı', 'Oklar zombileri sana doğru çeker', '#d8c7a0', 9, 1, 'E', (f, w, t) => { f.pull = 50 + 10 * t; f.pierce = 0; }, [
      ['Zıpkın', 'Zıpkınlı', 'Çok daha güçlü çeker, iri zombileri bile', 'Çekilen zombiler sersemler', (f, w, i, cap) => { f.pull += L3([40, 60, 80], i); f.pullBig = true; if (cap) f.stun = 0.4; }],
      ['Tuzak', 'Tuzaklı', 'Çekilen zombiler daha çok hasar alır', 'Çekilen zombilere iki kat', (f, w, i, cap) => { f.dazed = L3([1.3, 1.45, 1.6], i); f.stun = 0.1; if (cap) f.dazed = 2; }]]],
    ['Çift kiriş', 'Çift kirişli', 'Her atışta iki ok', '#7cf29c', 11, 2, 'M', (f, w, t) => { w.pellets = 2; f.pelDmg = 0.56 + 0.01 * t; w.spread = 0.07; f.noPel = 1; }, [
      ['Yelpaze', 'Yelpaze', 'Her atışta üç ok', 'Her atışta beş ok', (f, w, i, cap) => { w.pellets = cap ? 5 : 3; f.pelDmg = cap ? 0.26 : 0.4; w.spread = 0.14; }],
      ['Paralel', 'Paralel', 'İki ok aynı zombiye çarparsa sersemletir', 'Oklar daha hızlı atılır', (f, w, i, cap) => { f.stun = L3([0.12, 0.16, 0.2], i); if (cap) f.rateX = 1.15; }]]],
    ['Patlayıcı ok', 'Patlayıcı', 'Oklar ilk zombiye saplanıp patlar', '#ff6b2c', 1, 1, 'S', (f, w, t) => { f.pierce = 0; f.blast = 40 + 6 * t; f.blastK = 0.45; }, [
      ['Fişek', 'Fişekli', 'Patlama daha geniş', 'Patlama zombileri sersemletir', (f, w, i, cap) => { f.blast += L3([15, 25, 35], i); if (cap) f.stun = 0.3; }],
      ['Dinamit', 'Dinamitli', 'Patlama çok daha sert', 'İri zombilere ve bosslara iki kat', (f, w, i, cap) => { f.blastK = L3([0.6, 0.7, 0.8], i); if (cap) f.big = 2; }]]],
  ],
  kilicci: [
    ['Ağır kılıç', 'Ağır', 'Daha yavaş ama çok sert savurur, zombileri geri iter', '#ff8a3d', 9, 1, 'H', (f, w, t) => { f.kb = 40 + 8 * t; f.heavySwing = 1; }, [
      ['Balyoz', 'Balyoz', 'Zombileri çok daha uzağa fırlatır ve sersemletir', 'Savuruş yere çarpıp çevreye hasar verir', (f, w, i, cap) => { f.kb = L3([110, 130, 150], i); f.stun = 0.15; if (cap) f.blast = 60; }],
      ['Cellat', 'Cellat', 'İri zombilere ve bosslara çok daha sert', 'Canı azalmış zombileri tek vuruşta bitirir', (f, w, i, cap) => { f.big = L3([1.3, 1.45, 1.6], i); if (cap) f.execKill = 0.2; }]]],
    ['Çift kılıç', 'Çift', 'Çok daha hızlı savurur', '#ffd23f', 9, 2, 'R', (f, w, t) => { }, [
      ['Kasırga dansı', 'Dansçı', 'Çok daha da hızlı savurur', 'Her savuruşta iki kesik', (f, w, i, cap) => { f.rateX = L3([1.15, 1.25, 1.2], i); if (cap) f.doubleCut = 0.6; }],
      ['Kan çiçeği', 'Kanlı', 'Savuruşlar kanatır: zombiler bir süre can kaybeder', 'Kanayan zombiler yavaşlar', (f, w, i, cap) => { f.bleed = L3([0.25, 0.32, 0.4], i); if (cap) { f.slow = 1.5; f.slowK = 0.7; } }]]],
    ['Uzun kılıç', 'Uzun', 'Savuruş daha uzağa ve daha geniş yetişir', '#c9a2ff', 9, 3, 'M', (f, w, t) => { f.reach = 1 + 0.06 * t; f.arcX = 1 + 0.04 * t; }, [
      ['Mızrak', 'Mızrak', 'Çok daha uzağa yetişir', 'Savuruş havaya bir kesik dalgası fırlatır', (f, w, i, cap) => { f.reach += L3([0.12, 0.18, 0.24], i); if (cap) f.wave = 1; }],
      ['Pala', 'Pala', 'Çok daha geniş savurur', 'Savuruş arkayı da keser', (f, w, i, cap) => { f.arcX += L3([0.2, 0.3, 0.4], i); if (cap) f.arcX = 3; }]]],
    ['Kan kılıcı', 'Kan', 'Çok daha fazla can emer, canı azalmış zombilere sert', '#e5484d', 5, 5, 'E', (f, w, t) => { f.leech = 0.05 + 0.012 * t; f.exec = [0.3, 1.3 + 0.06 * t]; }, [
      ['Vampir', 'Vampir', 'Çok daha fazla can emer', 'Canın doluyken emilen can kan kalkanına dönüşür (en çok canının %35\'i)', (f, w, i, cap) => { f.leech += L3([0.04, 0.06, 0.08], i); if (cap) f.bshield = 0.35; }],
      ['İnfazcı', 'İnfazcı', 'Bitirme vuruşları çok daha sert', 'Bitirdiğin zombi canını doldurur', (f, w, i, cap) => { f.exec = [0.35, f.exec[1] + L3([0.4, 0.6, 0.8], i)]; if (cap) f.killHeal = 8; }]]],
  ],
  egitmen: [
    ['İz sürme', 'İzli', 'Vurduğun zombiler işaretlenir; köpeğin onlara saldırır ve çok sert ısırır', '#ffb347', 10, 3, 'E', (f, w, t) => { f.mark = [1.08 + 0.04 * t, 4]; f.markDog = 1.3 + 0.06 * t; }, [
      ['Koku', 'Kokulu', 'İşaret daha güçlü ve daha uzun', 'İşaret yakındaki zombilere de yayılır', (f, w, i, cap) => { f.mark = [f.mark[0] + L3([0.07, 0.11, 0.15], i), 6]; if (cap) f.markR = 110; }],
      ['Sürü', 'Sürü', 'Köpek işaretli zombiye çok daha sert ısırır', 'Işaretli zombiler yavaşlar', (f, w, i, cap) => { f.markDog += L3([0.3, 0.5, 0.7], i); if (cap) { f.slow = 1.5; f.slowK = 0.7; } }]]],
    ['Kemik kıran', 'Kemik kıran', 'Vuruşlar zombileri sakatlar: yavaşlar ve sendelerler', '#e8e2d2', 1, 1, 'M', (f, w, t) => { f.slow = 1.2; f.slowK = 0.8 - 0.02 * t; f.stun = 0.05; }, [
      ['Topal', 'Topal', 'Zombiler çok daha fazla yavaşlar', 'Sakat zombilere köpek iki kat ısırır', (f, w, i, cap) => { f.slowK = L3([0.65, 0.58, 0.5], i); if (cap) f.markDog = 2; }],
      ['Kırık', 'Kırık', 'Yavaşlayan zombiler daha çok hasar alır', 'Yavaşlayan zombiler sersemler', (f, w, i, cap) => { f.brittle = L3([1.2, 1.28, 1.36], i); if (cap) f.stun = 0.25; }]]],
    ['Seri tabanca', 'Seri', 'Çok daha hızlı ateş eder; köpeğin de hızlanır', '#ffd23f', 2, 2, 'R', (f, w, t) => { f.dogRate = 1.1 + 0.04 * t; }, [
      ['Fırtına', 'Fırtına', 'Daha da hızlı ateş', 'Mermiler bir zombiden diğerine seker', (f, w, i, cap) => { f.rateX = L3([1.15, 1.25, 1.35], i); if (cap) f.rico = 0.5; }],
      ['Takım işi', 'Takımlı', 'Köpeğin yanındayken daha sert vurursun', 'Köpek ısırdığı zombiyi sersemletir', (f, w, i, cap) => { f.nearDog = [220, L3([1.2, 1.3, 1.4], i)]; if (cap) f.dogStun = 0.3; }]]],
    ['Ödül tasması', 'Tasmalı', 'Vuruşlar Saldır! yeteneğini doldurur; köpek öldürünce altın düşer', '#43d17a', 11, 2, 'E', (f, w, t) => { f.cdr = 0.03 + 0.008 * t; f.dogGold = 0.2 + 0.05 * t; }, [
      ['Eğitimli', 'Eğitimli', 'Yetenek çok daha çabuk dolar', 'Saldır! sırasında köpek iki kat ısırır', (f, w, i, cap) => { f.cdr += L3([0.03, 0.045, 0.06], i); if (cap) f.dogAtk = 2; }],
      ['Av köpeği', 'Av', 'Köpeğin öldürdüklerinden çok daha fazla altın', 'Köpek her öldürdüğünde seni iyileştirir', (f, w, i, cap) => { f.dogGold += L3([0.3, 0.5, 0.7], i); if (cap) f.dogHeal = 4; }]]],
  ],
  ajan: [
    ['Suikast', 'Suikastçı', 'Yüksek kritik şansı; kritikler çok sert ve sessiz', '#b07cff', 3, 3, 'M', (f, w, t) => { f.crit = 0.1 + 0.025 * t; f.critX = 2.3; }, [
      ['Kalp atışı', 'Kalpten', 'Kritikler çok daha sert', 'Kritikler üç kat vurur', (f, w, i, cap) => { f.critX = cap ? 3 : L3([2.6, 2.8, 2.8], i); }],
      ['Gölge vuruşu', 'Gölge', 'Görünmezken kritik şansı çok artar', 'Görünmezken her atış kritik', (f, w, i, cap) => { f.critInv = cap ? 1 : L3([0.3, 0.45, 0.45], i); }]]],
    ['İnfaz', 'İnfazcı', 'Canı azalmış zombileri çok sert vurur', '#e5484d', 1, 1, 'M', (f, w, t) => { f.exec = [0.3 + 0.02 * t, 1.5 + 0.1 * t]; }, [
      ['Temizlik', 'Temiz', 'Bitirme vuruşları çok daha sert', 'Canı üçte birin altındakiler tek vuruşta düşer', (f, w, i, cap) => { f.exec = [f.exec[0] + 0.05, f.exec[1] + L3([0.4, 0.6, 0.8], i)]; if (cap) f.execKill = 0.3; }],
      ['İz bırakmayan', 'İzsiz', 'Öldürmek Gölge yeteneğini doldurur', 'Öldürünce bir an görünmez olursun', (f, w, i, cap) => { f.killCdr = L3([1, 1.5, 2], i); if (cap) f.killInv = 1.2; }]]],
    ['Hayalet mermi', 'Hayalet', 'Mermiler hedefe döner ve zombileri deler', '#7ad8ff', 3, 3, 'M', (f, w, t) => { f.home = 2.5; f.pierce = 1 + (t >= 3 ? 1 : 0); }, [
      ['Güdümlü', 'Güdümlü', 'Mermiler hedefe çok daha iyi döner', 'Mermiler her şeyi deler', (f, w, i, cap) => { f.home = 5; if (cap) f.pierce = 99; }],
      ['Sızma', 'Sızan', 'Mermiler kalkanları deler', 'Kalkanlı zombilere iki kat', (f, w, i, cap) => { f.noShield = true; f.armorK = cap ? 2 : 1.3; }]]],
    ['Çapraz ateş', 'Çapraz', 'Her atışta iki mermi açılı gider', '#ffd23f', 11, 2, 'M', (f, w, t) => { w.pellets = 2; f.pelDmg = 0.56 + 0.01 * t; w.spread = 0.09; f.noPel = 1; }, [
      ['Saçılım', 'Saçılan', 'Her atışta üç mermi', 'Her atışta dört mermi', (f, w, i, cap) => { w.pellets = cap ? 4 : 3; f.pelDmg = cap ? 0.32 : 0.4; w.spread = 0.14; }],
      ['Tuzak ateşi', 'Tuzaklı', 'İki mermi birden çarparsa zombi sersemler', 'Sersemleyen zombiler daha çok hasar alır', (f, w, i, cap) => { f.stun = L3([0.1, 0.14, 0.18], i); if (cap) f.dazed = 1.6; }]]],
  ],
  hacker: [
    ['Aşırı hız', 'Overclock', 'Tetiğe bastıkça işlemci ısınır: ateş hızı gittikçe artar', '#4cf0d0', 6, 2, 'S', (f, w, t) => { f.ramp = 0.2 + 0.06 * t; f.rampT = 1.4; }, [
      ['Soğutucu', 'Soğutmalı', 'Çok daha çabuk ısınır', 'Isınınca mermiler zombileri deler', (f, w, i, cap) => { f.ramp += L3([0.1, 0.15, 0.2], i); f.rampT = 0.9; if (cap) f.pierce = 2; }],
      ['Paralel işlem', 'Paralel', 'Isınınca her atışta iki mermi', 'Isınınca her atışta üç mermi', (f, w, i, cap) => { f.rampPel = cap ? 2 : 1; f.rampPelK = cap ? 0.45 : L3([0.58, 0.6, 0.6], i); }]]],
    ['Virüs', 'Virüslü', 'Vurduğun zombiye virüs bulaşır: ölünce yakındakilere geçer ve onları sersemletir', '#9dff6b', 10, 6, 'E', (f, w, t) => { f.virus = [90 + 5 * t, 0.35 + 0.03 * t]; }, [
      ['Solucan', 'Solucan', 'Virüs daha çok zombiye geçer', 'Virüslü zombiler yavaşlar', (f, w, i, cap) => { f.virusN = L3([2, 3, 4], i); if (cap) { f.slow = 1.5; f.slowK = 0.7; } }],
      ['Truva', 'Truva', 'Virüs geçerken patlar ve hasar verir', 'Patlama zombileri sersemletir', (f, w, i, cap) => { f.virusBoom = L3([0.4, 0.55, 0.7], i); if (cap) f.stun = 0.25; }]]],
    ['Güçlü çekirdek', 'Çekirdekli', 'Daha yavaş ama çok sert, hedefe daha iyi dönen mermiler', '#ff8a3d', 1, 1, 'H', (f, w, t) => { f.home = 3; w.heavy = Math.min(3, Math.ceil(t * 0.6)); }, [
      ['Kuantum', 'Atomik', 'İri zombilere ve bosslara çok daha sert', 'Mermiler küçük patlamalar yapar', (f, w, i, cap) => { f.big = L3([1.3, 1.45, 1.6], i); if (cap) f.blast = 45; }],
      ['Yeniden başlat', 'Yenilenen', 'Vuruşlar Ele Geçir yeteneğini doldurur', 'Öldürmek yeteneği çok daha çabuk doldurur', (f, w, i, cap) => { f.cdr = L3([0.05, 0.07, 0.09], i); if (cap) f.killCdr = 1.5; }]]],
    ['EMP', 'EMP', 'Mermi yerine EMP topu atar: çarptığı yerde patlar, zombileri sersemletir', '#7bdff2', 10, 8, { dmg: [1, 1.8, 2, 2.2, 2.45, 2.7], rate: [1, 0.42, 0.44, 0.46, 0.48, 0.5] }, (f, w, t) => { w.kind = 'g'; w.aoe = 60 + 7 * t; w.bspd = 750; w.life = 0.85; w.look = 'orb'; f.stun = 0.18; w.home = 0; }, [
      ['Kısa devre', 'Devreli', 'Sersemletme çok daha uzun', 'Sersemleyen zombiler daha çok hasar alır', (f, w, i, cap) => { f.stun = L3([0.3, 0.38, 0.45], i); if (cap) f.dazed = 1.6; }],
      ['Elektromanyetik', 'Manyetik', 'Patlama çok daha geniş', 'Patlamaya yakalanan zombiler sana doğru çekilir', (f, w, i, cap) => { w.aoe += L3([25, 35, 45], i); if (cap) f.pull = 70; }]]],
  ],
};
// paths as objects (name, adj, desc, col, gfx, snd, curves, branches); the path number is 1..4 within the class
const CPATH = Object.fromEntries(Object.entries(CP).map(([cls, L]) => [cls, L.map((x, i) => {
  const cv = typeof x[6] === 'string' ? CURVE[x[6]] : x[6];
  return { k: i + 1, name: x[0], adj: x[1], desc: x[2], col: x[3], gfx: x[4], snd: x[5], dmg: cv.dmg, rate: cv.rate, base: x[7], br: x[8].map((b) => ({ name: b[0], adj: b[1], desc: b[2], cap: b[3], fn: b[4] })) };
})]));
export const PATH_N = 4;
const STD = { k: 0, name: 'Standart', adj: '', desc: '', col: '#ffe1a6', gfx: 0, snd: 0, dmg: [1, 1, 1, 1, 1, 1], rate: [1, 1, 1, 1, 1, 1], base: null, br: [] };
export const pathOf = (cls, k) => (CPATH[cls] && CPATH[cls][k - 1]) || STD;
export const pathsFor = (cls) => (CPATH[cls] || CPATH.asker).map((p) => p.k);
export const pathOk = (cls, k) => Number.isInteger(k) && k >= 1 && k <= (CPATH[cls] || []).length;
export const pathDesc = (cls, k) => pathOf(cls, k).desc;
const lowerFirst = (s) => (/^\p{Lu}\p{Lu}/u.test(s) ? s : s.charAt(0).toLocaleLowerCase('tr') + s.slice(1));
const cut = (v, a, b) => Math.max(a, Math.min(b, v | 0));
// the weapon and its effects for a class at weapon level t (0..5), path k (1..4) and branch b (1..2, from level 3)
const WCACHE = new Map();
function build(cls, t, k, b) {
  const c = CLASSES[cls] || CLASSES.asker;
  t = cut(t, 0, WMAX); k = t > 0 ? cut(k, 1, PATH_N) : 0; b = t >= 3 ? cut(b, 1, 2) : 0;
  const P = pathOf(cls, k), cap = t >= WMAX;
  const f = { t, k, b, cap };
  const w = { ...c, tier: t, path: k, branch: b, fx: f, col: k ? P.col : null, gfx: P.gfx, snd: P.snd, look: c.look || '', heavy: 0, pelDmg: 1, home: c.home || 0 };
  if (k && P.base) P.base(f, w, t);
  const B = b && P.br[b - 1];
  if (B) B.fn(f, w, t - 3, cap);
  // pellet weapons (the shotgun) keep their spread of pellets; other paths that fire more than one round set it themselves
  if (cls === 'tamirci' && !f.noPel) w.pellets = Math.max(1, Math.round((c.pellets + 2 * Math.min(2, t)) * (f.pelK || 1)));
  if (cls === 'bombaci') w.aoe = (w.aoe || c.aoe || 0) + 15 * Math.min(2, t);
  if (cls === 'alevci') w.life = (w.life || c.life) + 0.05 * Math.min(2, t);
  if (cls === 'nisanci' && !f.pierce) w.pierce = c.pierce + Math.min(2, t);
  w.pelDmg = f.pelDmg || 1;
  if (f.pierce) w.pierce = Math.max(f.pierce, c.pierce);
  if (f.home) w.home = f.home;
  if (f.frost) w.frost = true;
  if (f.reach) w.reach = c.reach * f.reach;
  if (f.arcX) w.arc = Math.min(Math.PI, c.arc * f.arcX);
  const nameT = c.tiers[t === 0 ? 0 : t < 3 ? 1 : 2];
  w.name = t === 0 ? c.tiers[0] : (P.snd === 8 ? (B ? `${B.adj} ${lowerFirst(P.name)}` : P.name) : `${B ? B.adj : P.adj} ${lowerFirst(nameT)}`);
  return w;
}
export function pathFx(cls, t, k, b) { return weaponOf(cls, t, k, b).fx; }
export function weaponOf(cls, wt, wp = 0, wb = 0) {
  const key = cls + '|' + (wt | 0) + '|' + (wp | 0) + '|' + (wb | 0);
  let w = WCACHE.get(key);
  if (!w) { w = build(cls, wt, wp, wb); WCACHE.set(key, w); }
  return w;
}

// Quick team messages (Z or the phone's Hızlı button) and the map ping (G, or the last one in the list);
// each shows over the sender, in the chat and, with a place, as a marker in the world and on the minimap.
export const QUICK = [
  { t: 'Buraya gel!', ic: '➜', col: '#6fb2ff', at: 1 },
  { t: 'Yardım!', ic: '!', col: '#ff5a5a', at: 1 },
  { t: 'Altın lazım', ic: '$', col: '#ffd34d', at: 0 },
  { t: 'Dikkat, boss!', ic: '☠', col: '#ff8a3d', at: 1 },
  { t: 'Tamam', ic: '✓', col: '#43d17a', at: 0 },
  { t: 'Geri çekil!', ic: '↩', col: '#c9a2ff', at: 1 },
  { t: 'Şuraya bak', ic: '◎', col: '#ffffff', at: 1 },
];
export const PING_K = QUICK.length - 1;
// loading screen and lobby tips: short, one idea each
export const TIPS = [
  'Dalga arasında Cephanelik açık: silah yolunu seç, seviyesini yükselt.',
  'Dipçik (F) yakındaki zombileri iter. Sıkıştığında kurtarır.',
  'Düşen takım arkadaşının yanında dur: birkaç saniyede kalkar.',
  'Elit zombiler 4 kat altın ve bir eşya bırakır.',
  'Metro haritasında korna duyunca raydan çekil.',
  'Z ile hızlı mesaj menüsü açılır, G ile haritaya işaret koyarsın.',
  'Takım yükseltmelerine herkes para koyabilir; dolunca herkese işler.',
  'Boss dalgalarında yetenekleri saklamak işe yarar.',
  'Telefonda Ayarlar → Kontrolleri düzenle ile tuşları istediğin yere taşı.',
  'Pil tasarrufu açıkken oyun 30 FPS çalışır, telefon daha az ısınır.',
  'Her yeni oyuncu zombi sayısını artırır ama harita da büyür.',
  'Günlük meydan okumada herkes aynı sınıf ve haritayla oynar.',
  'Hesap açarsan dalga başına elmas kazanırsın.',
  'Çığlıkçı yakındaki zombileri hızlandırır; önce onu indir.',
  'Kazıcı yer altındayken vurulmaz; çıktığı anı bekle.',
  'Nişan yardımı telefonda hedefe hafifçe çeker; Ayarlardan değiştir.',
];

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
  { name: 'Yarasa', hp: 22, spd: 150, r: 10, dps: 7, gold: 6, col: '#5a4a5a', dark: '#2a1e2a' },
  { name: 'Zombi köpek', hp: 34, spd: 185, r: 12, dps: 11, gold: 6, col: '#7a6a4a', dark: '#3a2e1e' },
  { name: 'Dev Solucan', hp: 1700, spd: 70, r: 42, dps: 40, gold: 180, col: '#a06a6a', dark: '#4a2a2a', boss: true },
];
ZTYPES[3].boss = true;
export const BOSS_ORDER = [3, 8, 9, 19, 20, 23]; // Dev, Kraliçe, Koç, Dev Hurda, Cadı, Dev Solucan, then repeat
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
// How much tougher a wave gets for each extra player in the game (kept light on purpose).
export const scaleFor = (n) => { const k = Math.max(1, Math.min(MAX_PLAYERS, n | 0 || 1)) - 1; return { count: 1 + 0.2 * k, hp: 1 + 0.05 * k, boss: 1 + 0.2 * k }; };
export const zMaxHp = (t, wave, n, hm = 1) => {
  const S = scaleFor(n);
  return ZTYPES[t].hp * hm * (1 + (Math.max(1, wave) - 1) * 0.12) * (ZTYPES[t].boss ? S.boss : S.hp);
};

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
  const f = weaponOf(cls, wt, wp, wb).fx;
  const P = pathOf(cls, f.k);
  const td = tm ? tm[1] | 0 : 0;
  return {
    maxHp: c.hp + 20 * (L.hp | 0),
    spd: c.spd * (1 + 0.06 * (L.spd | 0)),
    dmg: c.dmg * (1 + 0.15 * (L.dmg | 0)) * TIER_DMG[f.t] * P.dmg[f.t] * (1 + 0.08 * td) * (f.dmgX || 1),
    rate: c.rate * (1 + 0.1 * (L.rate | 0)) * P.rate[f.t] * (f.rateX || 1),
    cd: Math.max(0.4, 1 - 0.1 * (L.cd | 0)),
    crit: 0.04 * (L.crit | 0) + (cls === 'nisanci' ? 0.12 : 0),
    regen: 0.5 * (L.regen | 0) + (tm ? tm[2] | 0 : 0),
    armor: (1 - 0.05 * (L.armor | 0)) * (1 - 0.08 * (tm ? tm[0] | 0 : 0)) * (cls === 'kalkanci' ? 0.85 : 1),
    mag: (L.mag | 0) + (cls === 'izci' ? 1.5 : 0),
    gold: (1 + 0.05 * (L.mag | 0)) * (1 + 0.12 * (tm ? tm[3] | 0 : 0)) * (cls === 'izci' ? 1.15 : 1),
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
