// The armory (Cephanelik): weapons and their paths, upgrades, gear and team upgrades.
import { WEAPON_COST, weaponOf, pathOf, pathsFor, pathDesc, WMAX, ROMAN, BRANCH_SWAP, weaponSpent, AB_COST, AB_UP, GEAR, TEAM, TEAM_CHUNK, gearCost, gearMax, CLASSES, UPGRADES, HEAL_COST, upgradeCost } from './config.js';
import { drawWeaponPreview } from './render.js';
import * as sfx from './sfx.js';
import { CTL } from './layout.js';
import { $, IS_TOUCH, S, el, fmt, setHid } from './app.js';
import {  send } from './main.js';

// ---------- shop ----------
// The armory has four tabs. Each tab is rebuilt only when its layout changes (class, weapon level,
// path or branch); every frame after that just updates prices, levels and which buttons work.
const SHOP_TABS = [['wpn', 'Silah'], ['up', 'Gelişim'], ['gear', 'Eşya'], ['team', 'Takım']];
S.shopTab = 'wpn';
S.shopSig = '';
S.shopUpd = [];
(function buildTabs() {
  const bar = $('#shop-tabs');
  for (const [k, name] of SHOP_TABS) {
    const b = el('button', 'shop-tab');
    b.append(el('span', '', name), el('i', 'tab-n'));
    b.type = 'button'; b.dataset.tab = k; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { S.shopTab = k; S.shopSig = ''; updateShop(); });
    bar.append(b);
  }
})();
function shopTabStep(d) {
  const i = SHOP_TABS.findIndex(([k]) => k === S.shopTab);
  S.shopTab = SHOP_TABS[(i + d + SHOP_TABS.length) % SHOP_TABS.length][0];
  if (S.shopTab === 'team' && S.game && S.game.pv) S.shopTab = SHOP_TABS[(i + 2 * d + SHOP_TABS.length * 2) % SHOP_TABS.length][0];
  S.shopSig = ''; updateShop();
}
function buildShop() {
  const g = S.game;
  const list = $('#shop-list');
  list.replaceChildren();
  S.shopUpd = [];
  S.shopHk = 0;
  if (S.shopTab === 'wpn') buildWeaponTab(list, g);
  else if (S.shopTab === 'up') buildUpTab(list, g);
  else if (S.shopTab === 'gear') buildGearTab(list, g);
  else buildTeamTab(list, g);
  list.scrollTop = 0;
}
// A standard row: hotkey, name, description, price and level pips. upd(b) returns {cost, can, maxed, lv}.
function shopRow(list, name, desc, max, onBuy, upd, extra) {
  const li = el('li');
  const b = el('button', 'shop-item' + (extra ? ' ' + extra : ''));
  b.type = 'button';
  const hk = ++S.shopHk;
  b.dataset.hk = String(hk);
  const cost = el('span', 'cost'); cost.append(el('span', 'coin'), el('span', 'cv'));
  b.append(el('span', 'hk', hk <= 9 ? String(hk) : ''), el('span', 'nm', name), cost, el('span', 'ds', desc));
  if (max) { const pips = el('span', 'pips'); for (let j = 0; j < max; j++) pips.append(el('i')); b.append(pips); }
  b.addEventListener('click', () => { if (!b.disabled) { onBuy(); sfx.buy(); } });
  li.append(b);
  list.append(li);
  S.shopUpd.push(() => {
    const r = upd(b);
    b.querySelector('.cv').textContent = r.maxed ? 'Tam' : r.label || fmt(r.cost);
    b.classList.toggle('maxed', !!r.maxed);
    b.classList.toggle('poor', !r.maxed && r.cost > gold());
    b.disabled = !r.can;
    if (max) b.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < r.lv));
  });
  return b;
}
// a gold price tag: coin + amount, red when you can't afford it yet
function priceTag(cost) { const t = el('span', 'price-tag'); t.append(el('span', 'coin'), el('b', '', fmt(cost))); S.shopUpd.push(() => t.classList.toggle('poor', gold() < cost)); return t; }
function costHead(text, cost) { const li = el('li', 'shop-sub cost-head'); li.append(el('span', '', text), priceTag(cost)); return li; }
const alive = () => S.game && S.game.self.alive;
const gold = () => (S.game ? S.game.self.gold : 0);
function weaponCanvas(cls, wt, wp, wb, w = 240, h = 84) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  drawWeaponPreview(cv.getContext('2d'), cls, wt, wp, w, h, wb, 0.4);
  return cv;
}
function buildWeaponTab(list, g) {
  const me = g.self, cls = g.cls, wt = me.wt, wp = me.wp, wb = me.wb;
  const P = pathOf(cls, wp);
  const B = wb && P.br ? P.br[wb - 1] : null;
  // current weapon
  const card = el('li', 'wpn-card');
  card.style.setProperty('--pc', wt ? P.col : '#ffe1a6');
  const w = weaponOf(cls, wt, wp, wb);
  const info = el('div', 'wpn-info');
  const lvl = el('div', 'wpn-lv');
  for (let i = 1; i <= WMAX; i++) lvl.append(el('i', i <= wt ? 'on' + (i >= 3 ? ' br' : '') : ''));
  info.append(el('span', 'eyebrow', wt ? `Seviye ${ROMAN[wt]} / ${ROMAN[WMAX]}` : 'Başlangıç silahı'), el('strong', '', w.name), lvl,
    el('span', 'ds', wt === 0 ? 'Bir yol seç. Yol, silahın nasıl güçleneceğini belirler.'
      : B ? `${P.name} → ${B.name}: ${B.desc.toLocaleLowerCase('tr')}` : `${P.name}: ${pathDesc(cls, wp).toLocaleLowerCase('tr')}`));
  if (wt >= WMAX && B) info.append(el('span', 'cap on', `Özel güç: ${B.cap}`));
  card.append(weaponCanvas(cls, wt, wp, wb, 240, 70), info);
  list.append(card);

  if (wt === 0) {
    list.append(costHead('Yol seç', WEAPON_COST[1]));
    const li = el('li', 'paths');
    for (const k of pathsFor(cls)) {
      const b = el('button', 'path-btn');
      b.type = 'button';
      b.style.setProperty('--pc', pathOf(cls, k).col);
      const hk = ++S.shopHk; b.dataset.hk = String(hk);
      b.append(weaponCanvas(cls, 2, k, 0), el('span', 'nm', `${hk <= 9 ? hk + ' · ' : ''}${pathOf(cls, k).name}`), el('span', 'ds', pathDesc(cls, k)), priceTag(WEAPON_COST[1]));
      b.addEventListener('click', () => { send({ t: 'buy', k: 'wpn', p: k }); sfx.buy(); });
      li.append(b);
      S.shopUpd.push(() => { b.disabled = !(gold() >= WEAPON_COST[1] && alive()); });
    }
    list.append(li);
    return;
  }
  if (wt === 2) {
    list.append(costHead('Seviye III: dal seç', WEAPON_COST[3]));
    const li = el('li', 'paths branches');
    P.br.forEach((br, i) => {
      const b = el('button', 'path-btn');
      b.type = 'button';
      b.style.setProperty('--pc', P.col);
      const hk = ++S.shopHk; b.dataset.hk = String(hk);
      b.append(weaponCanvas(cls, 3, wp, i + 1), el('span', 'nm', `${hk} · ${br.name}`), el('span', 'ds', br.desc), el('span', 'cap', `Seviye V: ${br.cap}`), priceTag(WEAPON_COST[3]));
      b.addEventListener('click', () => { send({ t: 'buy', k: 'wpn', b: i + 1 }); sfx.buy(); });
      li.append(b);
      S.shopUpd.push(() => { b.disabled = !(gold() >= WEAPON_COST[3] && alive()); });
    });
    list.append(li);
  } else if (wt < WMAX) {
    const next = weaponOf(cls, wt + 1, wp, wb);
    const desc = wt === 1 ? `Daha güçlü. Seviye III'te iki daldan birini seçeceksin: ${P.br.map((x) => x.name).join(' ya da ')}.`
      : wt + 1 === WMAX ? `Son seviye. Özel güç: ${B.cap}.` : 'Daha güçlü, dalın etkisi büyür.';
    shopRow(list, `Seviye ${ROMAN[wt + 1]}: ${next.name}`, desc, 0, () => send({ t: 'buy', k: 'wpn' }),
      () => ({ cost: WEAPON_COST[wt + 1], can: alive() && gold() >= WEAPON_COST[wt + 1] }), 'weapon');
  }
  // change branch or start over
  const acts = el('li', 'wpn-acts');
  if (wt >= 3) {
    const other = P.br[2 - wb];
    const sw = el('button', 'btn small', `${other.name} dalına geç · ${fmt(BRANCH_SWAP)}`);
    sw.type = 'button';
    sw.title = other.desc;
    sw.addEventListener('click', () => { send({ t: 'buy', k: 'wswap' }); sfx.buy(); });
    S.shopUpd.push(() => { sw.disabled = !(gold() >= BRANCH_SWAP && alive()); });
    acts.append(sw);
  }
  const back = Math.floor(weaponSpent(wt) / 2);
  const rs = el('button', 'btn small ghost', `Yolu sıfırla · +${fmt(back)}`);
  rs.type = 'button';
  rs.title = 'Harcadığın altının yarısı geri gelir, yeni bir yol seçersin.';
  let armed = 0;
  rs.addEventListener('click', () => {
    if (performance.now() - armed > 3000) { armed = performance.now(); rs.textContent = 'Emin misin? Tekrar bas'; rs.classList.add('warn'); return; }
    send({ t: 'buy', k: 'wreset' }); sfx.buy();
  });
  S.shopUpd.push(() => {
    rs.disabled = !alive();
    if (armed && performance.now() - armed > 3000) { armed = 0; rs.textContent = `Yolu sıfırla · +${fmt(back)}`; rs.classList.remove('warn'); }
  });
  acts.append(rs);
  list.append(acts);
}
function buildUpTab(list, g) {
  const cls = g.cls;
  // what you have right now
  const sum = el('li', 'stat-strip');
  const cells = [['Can', (st) => fmt(g.self.maxHp)], ['Hasar', (st) => fmt(Math.round(st.dmg))], ['Atış', (st) => `${st.rate.toFixed(1)}/sn`], ['Kritik', (st) => `%${Math.round(st.crit * 100 + (g.myWeapon.fx.crit || 0) * 100)}`], ['Zırh', (st) => `%${Math.round((1 - st.armor) * 100)}`], ['Yenilenme', (st) => `${st.regen.toFixed(1)}/sn`]];
  const vals = cells.map(([label]) => { const d = el('div'); const v = el('b'); d.append(v, el('span', '', label)); sum.append(d); return v; });
  list.append(sum);
  S.shopUpd.push(() => { const st = g.myStats; cells.forEach(([, f], i) => { vals[i].textContent = f(st); }); });
  for (const u of UPGRADES) {
    shopRow(list, u.name, u.desc, u.max, () => send({ t: 'buy', k: u.k }), () => {
      const lv = g.self.lv[u.k] | 0, maxed = lv >= u.max, cost = maxed ? 0 : upgradeCost(u, lv);
      return { cost, maxed, lv, can: !maxed && alive() && gold() >= cost };
    });
  }
  const c = CLASSES[cls];
  const abRow = shopRow(list, `Yetenek ustalığı: ${c.ab.name}`, '', AB_COST.length, () => send({ t: 'buy', k: 'ab' }), (b) => {
    const lv = g.self.lv.ab | 0, maxed = lv >= AB_COST.length, cost = maxed ? 0 : AB_COST[lv];
    b.querySelector('.ds').textContent = maxed ? 'Yeteneğin en güçlü hâlinde' : `Sonraki: ${AB_UP[cls][lv]}`;
    return { cost, maxed, lv, can: !maxed && alive() && gold() >= cost };
  }, 'ability-up');
  void abRow;
}
function buildGearTab(list, g) {
  list.append(el('li', 'shop-sub', IS_TOUCH ? 'Savaşta sağdaki eşya düğmeleriyle kullanılır.' : 'Savaşta 1–4 tuşlarıyla kullanılır. Nişan aldığın yere atılır.'));
  GEAR.forEach((it, i) => {
    const max = gearMax(g.cls, i), cost = gearCost(g.cls, i);
    shopRow(list, `${it.name}`, it.desc, max, () => send({ t: 'buy', k: 'gear', i }), (b) => {
      const n = g.self.inv[i] | 0, maxed = n >= max;
      b.style.setProperty('--pc', it.col);
      return { cost, maxed, lv: n, can: !maxed && alive() && gold() >= cost };
    }, 'gear-item');
  });
}
function buildTeamTab(list, g) {
  list.append(el('li', 'shop-sub', 'Takımca altın biriktirin. Hedefe ulaşınca herkes güçlenir.'));
  const coinBtn = (cls, label, hk) => { const b = el('button', 'btn small ' + cls); b.type = 'button'; if (hk) b.dataset.hk = String(hk); const c = el('span', 'coin'); const t = el('span', '', label); b.append(c, t); return [b, t]; };
  TEAM.forEach((t, i) => {
    const li = el('li', 'team-up');
    const head = el('div', 'tu-head');
    const pips = el('span', 'pips'); for (let j = 0; j < t.cost.length; j++) pips.append(el('i'));
    head.append(el('strong', '', t.name), pips);
    const bar = el('div', 'tu-bar'); const fill = el('i'); const bt = el('span', 'tu-bt'); bar.append(fill, bt);
    const row = el('div', 'tu-btns');
    const hk = ++S.shopHk;
    const [give, giveT] = coinBtn('', `${TEAM_CHUNK} koy`, hk);
    const [all, allT] = coinBtn('primary', 'Tamamla');
    give.addEventListener('click', () => { if (!give.disabled) { send({ t: 'buy', k: 'team', i }); sfx.buy(); } });
    all.addEventListener('click', () => { if (!all.disabled) { send({ t: 'buy', k: 'team', i, all: 1 }); sfx.buy(); } });
    row.append(give, all);
    li.append(head, el('span', 'ds', t.desc), bar, row);
    list.append(li);
    S.shopUpd.push(() => {
      const lv = g.team[i] | 0, maxed = lv >= t.cost.length, cost = g.teamCost[i] | 0, fund = g.teamFund[i] | 0, left = Math.max(0, cost - fund);
      pips.querySelectorAll('i').forEach((p, j) => p.classList.toggle('on', j < lv));
      fill.style.width = maxed ? '100%' : cost ? Math.min(100, (fund / cost) * 100) + '%' : '0%';
      bt.textContent = maxed ? 'Tamamlandı ✓' : `${fmt(fund)} / ${fmt(cost)} · Seviye ${ROMAN[lv + 1]} için`;
      li.classList.toggle('maxed', maxed);
      give.disabled = maxed || !alive() || gold() <= 0;
      // the button names exactly what it will take: never more than you have or than the level still needs
      const put = Math.max(0, Math.min(TEAM_CHUNK, left, Math.floor(gold())));
      giveT.textContent = `${fmt(Math.max(put, 1))} koy`;
      give.title = put < TEAM_CHUNK && put < left ? `Altının yetmiyor: ${fmt(put)} koyabilirsin` : '';
      all.disabled = maxed || !alive() || gold() < left || left <= 0;
      allT.textContent = maxed ? 'Tamam' : `${fmt(left)} ile tamamla`;
      row.hidden = maxed;
    });
  });
}
// How many things in each tab you could buy right now (the small number on the tabs).
function shopAffordable(g) {
  const me = g.self, gd = me.gold, out = { wpn: 0, up: 0, gear: 0, team: 0 };
  if (!me.alive) return out;
  if (me.wt < WMAX && gd >= WEAPON_COST[me.wt + 1]) out.wpn = 1;
  for (const u of UPGRADES) { const lv = me.lv[u.k] | 0; if (lv < u.max && gd >= upgradeCost(u, lv)) out.up++; }
  const al = me.lv.ab | 0; if (al < AB_COST.length && gd >= AB_COST[al]) out.up++;
  GEAR.forEach((it, i) => { if ((me.inv[i] | 0) < gearMax(g.cls, i) && gd >= gearCost(g.cls, i)) out.gear++; });
  TEAM.forEach((t, i) => { if ((g.team[i] | 0) < t.cost.length && gd > 0) out.team++; });
  return out;
}
// Keys in the break: 1-9 press the tab's numbered buttons, Q/E change tabs.
function shopKey(n) {
  const b = $(`#shop-list [data-hk="${n}"]`);
  if (b && !b.disabled) b.click();
}
$('#shop-close').addEventListener('click', () => { S.armoryOpen = false; updateShop(); });
$('#btn-armory').addEventListener('click', () => { S.armoryOpen = true; S.shopSig = ''; updateShop(); });
$('#shop-heal').addEventListener('click', () => { if (!$('#shop-heal').disabled) { send({ t: 'buy', k: 'heal' }); sfx.buy(); } });
function updateShop() {
  const g = S.game;
  { const h = $('#shop-heal'), s2 = g.self, full = s2.hp >= s2.maxHp; $('#shop-heal-c').textContent = String(HEAL_COST); h.disabled = !s2.alive || full || s2.gold < HEAL_COST; h.classList.toggle('full', full); h.title = full ? 'Canın zaten dolu' : ''; h.classList.toggle('need', !h.disabled && s2.hp < s2.maxHp * 0.6); const hd = h.querySelector('.sh-t span'), ht = full ? 'Canın dolu' : s2.gold < HEAL_COST ? 'Altının yetmiyor' : `Canını tamamen doldurur (${Math.ceil(Math.max(0, s2.hp))} / ${s2.maxHp})`; if (hd && hd.textContent !== ht) hd.textContent = ht; }
  const brk = (g.phase === 'break' || (!!g.pv && g.phase === 'combat' && !g.self.alive)) && g.self.inGame, touch = document.body.classList.contains('touch');
  // phones: the armory opens full screen at the start of each break; closing it leaves a button on the screen
  if (brk && !S.wasBreak) S.armoryOpen = true;
  S.wasBreak = brk;
  const open = brk && (!touch || S.armoryOpen !== false);
  if ($('#shop').hidden !== !open) $('#shop').hidden = !open;
  $('#shop').classList.toggle('full', touch);
  { const tt = $('#shop-tabs [data-tab="team"]'), pv = !!g.pv; if (tt && tt.hidden !== pv) tt.hidden = pv; if (pv && S.shopTab === 'team') { S.shopTab = 'wpn'; S.shopSig = ''; } }
  const fab = $('#btn-armory'), showFab = brk && touch && !open;
  if (fab.hidden !== !showFab && !CTL.editing) fab.hidden = !showFab;
  if (showFab) {
    const gs = fmt(g.self.gold); if ($('#fab-gold').textContent !== gs) $('#fab-gold').textContent = gs;
    const na = Object.values(shopAffordable(g)).reduce((a, b) => a + b, 0), nf = $('#fab-n');
    nf.hidden = !na; if (na && nf.textContent !== String(na)) nf.textContent = String(na);
    setHid('#fab-heal', !(g.self.alive && g.self.hp < g.self.maxHp * 0.6 && g.self.gold >= HEAL_COST));
  }
  if (!open) return;
  const me = g.self;
  const sig = `${S.shopTab}|${g.cls}|${me.wt}|${me.wp}|${me.wb}`;
  if (sig !== S.shopSig) { S.shopSig = sig; buildShop(); }
  const n = shopAffordable(g);
  for (const t of $('#shop-tabs').children) {
    const on = t.dataset.tab === S.shopTab;
    t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    const c = n[t.dataset.tab] || 0;
    t.querySelector('.tab-n').textContent = c ? String(c) : '';
  }
  $('#shop-time').textContent = String(g.breakT);
  $('#shop-gold').textContent = fmt(me.gold);
  for (const f of S.shopUpd) f();
  const players = [...g.ps.values()];
  const ready = players.filter((p) => p.ready).length;
  const rb = $('#btn-shop-ready');
  { const hide = !!g.pv && g.phase === 'combat'; if (rb.hidden !== hide) rb.hidden = hide; const rc = $('#shop-ready-count'); if (rc.hidden !== hide) rc.hidden = hide; }
  rb.textContent = me.shopReady ? 'Hazırsın ✓' : 'Hazırım';
  rb.classList.toggle('on', me.shopReady);
  $('#shop-ready-count').textContent = players.length > 1 ? `${ready}/${players.length} oyuncu hazır` : 'Hazırsan dalgayı hemen başlat.';
}

export { SHOP_TABS, alive, buildGearTab, buildShop, buildTeamTab, buildUpTab, buildWeaponTab, costHead, gold, priceTag, shopAffordable, shopKey, shopRow, shopTabStep, updateShop, weaponCanvas };
