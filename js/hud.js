// The in-game screen: notices, kill feed, streaks, banners, the HUD itself, one-use items in battle, the scoreboard
// and quick team messages.
import { ZTYPES, QUICK, ROMAN, GEAR, TEAM, bashCd, MODES, MEV, CLASSES, PVP, TEAM_COL } from './config.js';
import { dashTop, rewardText } from './dash.js';
import * as sfx from './sfx.js';
import { voiceOn, voiceSync, voiceLevel, voiceMute, voiceMuted } from './voice.js';
import { CTL } from './layout.js';
import { SETTINGS } from './settings.js';
import { liveGame, liveWave, liveKills } from './live.js';
import { $, IS_TOUCH, S, el, fmt, setHid, setPct, setT, toast } from './app.js';
import { pvpHud, pvpNotice } from './over.js';
import { myEntry, send, tutTick } from './main.js';
import { voiceTick } from './voiceui.js';
import { updateShop } from './shop.js';
import { kickPlayer } from './lobby.js';

// a quest or achievement finished during play: a card that slides in at the top for a few seconds
function qaPop(L) {
  const box = $('#qa-pops');
  for (const r of L) {
    const x = rewardText(r), c = el('div', 'qa-pop' + (r.k === 'a' ? ' ach' : r.k === 'w' ? ' wk' : ''));
    c.append(el('span', 'qa-ic', x.ic)); const m = el('div', 'qa-m'); m.append(el('strong', '', x.title), el('span', '', x.sub)); c.append(m);
    box.append(c); sfx.sting('clear'); buzz(30);
    setTimeout(() => c.classList.add('out'), 4600); setTimeout(() => c.remove(), 5200);
  }
  while (box.children.length > 3) box.firstChild.remove();
  dashTop();
}
// vibration: the app's own bridge when there is one, the browser's otherwise
let buzzAt = 0;
function buzz(p, force) {
  if (!SETTINGS.vibe || !IS_TOUCH) return;
  const now = performance.now(); if (!force && now - buzzAt < 250) return; buzzAt = now;
  try { if (window.KusatmaApp && window.KusatmaApp.vibrate) window.KusatmaApp.vibrate(JSON.stringify(Array.isArray(p) ? p : [p])); else if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ }
}
let lastHpBuzz = null;
function notice(n) {
  const g = S.game;
  if (n.k === 'down' && n.pid === S.me) buzz([120, 60, 220], true);
  if (n.k === 'wave' && n.boss) buzz([70, 50, 70, 50, 140], true);
  if (n.k === 'mev' && MEV[n.ev]) { banner('Harita olayı', MEV[n.ev].name, MEV[n.ev].desc); return; }
  if (n.k === 'kill') { killFeed(n); return; }
  if (n.k === 'qm') { addQuick(n.pid, n.q); return; }
  if (n.k === 'pvk' || n.k === 'pvw' || n.k === 'pvf' || n.k === 'pvr') { pvpNotice(n); return; }
  if (n.k === 'streak') { streak(n.n); return; }
  if (n.k === 'adm') { adminNote(n); return; }
  if (n.k === 'train') { toast('Tren geliyor! Raydan çekil.', 'bad'); buzz([80, 40, 80]); return; }
  if (n.k === 'cu') { toast(`Takıma yetişmen için +${n.n} altın`, 'good'); return; }
  if (n.k === 'wave') {
    if (n.w === 1) { S.gameGems = 0; $('#kfeed').replaceChildren(); }
    liveGame();
    if (g.self) liveKills(g.self.kills);
    const boss = n.boss ? ZTYPES[n.boss].name : null;
    const tip = { 3: 'Yere vurmadan önce kırmızı halkadan çıkın.', 8: 'Asit yağdırır ve koşucu çağırır. Dağılın.', 9: 'Kırmızı çizgiden kaçın, sonra arkasından vurun.', 19: 'Turuncu halkaya araba düşer, hemen çıkın.', 20: 'Ölüleri kaldırır ve ışınlanır. Önce cesetlerden uzak durun.', 23: 'Yerin altından gelir. Kırmızı halka görünce durma, koş.' }[n.boss];
    banner(boss ? `${boss} geliyor` : 'Sürü yaklaşıyor', `Dalga ${n.w}`, boss ? tip : 'Sırt sırta verin.');
  }
  else if (n.k === 'clear') { const me = myEntry(); if (me && me.inGame) liveWave(g.wave, g.self.kills); }
  if (n.k === 'clear') banner('Dalga temizlendi', 'Mola', `Herkese +${n.bonus} altın. Cephanelikten yükseltme al.`);
  else if (n.k === 'down') toast(n.pid === S.me ? 'Düştün!' : `${g.nameOf(n.pid)} düştü!`, 'bad');
  else if (n.k === 'up') toast(`${g.nameOf(n.pid)} ayağa kalktı.`, 'good');
  else if (n.k === 'revived') toast('Ayağa kalktın!', 'good');
  else if (n.k === 'team' && TEAM[n.i]) toast(`Takım yükseltmesi: ${TEAM[n.i].name} ${ROMAN[n.lv] || n.lv}${n.pid === S.me ? ' (son katkı senden)' : ''}`, 'good');
}
// what the game's organisers just sent, as a short toast for everyone in the game
function adminNote(n) {
  const mine = !!n.who && !!S.game && n.who === S.game.nameOf(S.me);
  const who = n.who ? (mine ? 'Sana' : `${n.who} için`) : 'Herkese';
  const later = n.later ? ' (sonraki dalgada)' : '';
  const zt = ZTYPES[n.t];
  const t = {
    gold: `${who} +${Math.max(10, Math.min(5000, n.n))} altın geldi!`,
    item: `${who} ${(GEAR[n.i] || {}).name || 'eşya'} ×${Math.max(1, n.n)} geldi!`,
    boss: `Bir boss yola çıktı${later}!`,
    horde: `Koşucu sürüsü geliyor${later}!`,
    zombie: `${zt ? zt.name : 'Zombi'} ×${Math.max(1, n.n)} geliyor${later}!`,
    mev: MEV[n.q] ? `${MEV[n.q].name}${later}!` : '',
  }[n.e];
  if (!t) return;
  toast(t, n.e === 'gold' || n.e === 'item' ? 'good' : 'bad');
  if ((n.e === 'gold' || n.e === 'item') && (!n.who || mine)) sfx.buy();
}
// kill feed: bosses, elites and rarer zombies, newest on top, each line fades after a few seconds
const ELITE = ['', 'Hızlı', 'Patlayan', 'Yenilenen', 'Zırhlı'];
function killFeed(n) {
  const g = S.game, box = $('#kfeed'), zt = ZTYPES[n.t];
  if (!g || !box || !zt) return;
  const li = el('li', (n.pid === S.me ? 'me' : '') + (zt.boss ? ' kf-boss' : ''));
  const who = el('b', '', n.pid === S.me ? 'Sen' : g.nameOf(n.pid));
  const r = g.roster.get(n.pid); if (r && r.color && n.pid !== S.me) who.style.color = r.color;
  li.append(who, el('span', 'kf-x', '›'), el('span', '', (n.el && ELITE[n.el] ? ELITE[n.el] + ' ' : '') + zt.name));
  box.prepend(li);
  while (box.children.length > (IS_TOUCH ? 3 : 5)) box.lastChild.remove();
  setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 400); }, 4500);
}
let streakT = 0;
function streak(k) {
  const b = $('#streak'); if (!b) return;
  const word = k >= 15 ? 'Durdurulamaz!' : k >= 10 ? 'Katliam!' : k >= 6 ? 'Seri katil!' : k >= 4 ? 'Seri!' : 'Üçlü!';
  b.replaceChildren(el('strong', '', word), el('span', '', `${k} leş`));
  b.hidden = false; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  if (k === 6 || k === 10 || k === 15) buzz(40);
  clearTimeout(streakT); streakT = setTimeout(() => { b.hidden = true; }, 1600);
}
let bannerTimer = 0;
function banner(eyebrow, title, sub) {
  const b = $('#banner');
  $('#banner-eyebrow').textContent = eyebrow;
  $('#banner-title').textContent = title;
  $('#banner-sub').textContent = sub;
  b.hidden = true; void b.offsetWidth; b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 2700);
}
function updateHud() {
  const g = S.game;
  if (!g) return;
  const me = g.self;
  const c = CLASSES[g.cls];
  const st = g.myStats;
  if (me.inGame && me.alive && lastHpBuzz != null && me.hp < lastHpBuzz - Math.max(8, me.maxHp * 0.06)) buzz(35);
  lastHpBuzz = me.inGame && me.alive ? me.hp : null;

  const BL = g.bosses();
  pvpHud(g);
  tutTick(g);
  if (voiceOn() && S.roster) { voiceSync(S.roster, S.me); voiceTick(); }
  { // the music follows the game: calm in breaks, driving in waves, heavier while a boss is alive
    const ph = g.phase, boss = ph === 'combat' && BL.some((z) => !z.dying);
    const mode = g.pv ? (ph === 'combat' ? 'combat' : 'break') : ph === 'combat' ? (boss ? 'boss' : 'combat') : ph === 'break' ? 'break' : 'off';
    sfx.music(SETTINGS.music > 0 ? mode : 'off', Math.min(1, (g.wave || 1) / 25));
    if (ph === 'over' && S.lastPh !== 'over') sfx.sting('over');
    S.lastPh = ph;
  }
  { // my connection to the room's host
    let pc = $('#hud-ping'); if (!pc) { pc = el('span', 'ping-chip'); pc.id = 'hud-ping'; document.querySelector('.wave-box').append(pc); }
    const mp = g.ps.get(S.me), v = S.role === 'client' && mp ? mp.ping | 0 : 0; pc.hidden = !v;
    if (v) { const t = `Ping ${v} ms`; if (pc.textContent !== t) pc.textContent = t; pc.className = 'ping-chip ' + (v < 90 ? 'ok' : v < 180 ? 'mid' : 'bad'); }
  }
  if (g.pv) {
    const P = PVP[g.pv[0]] || PVP.tdm, t = g.pv[1], mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    setT('#hud-phase', g.phase === 'combat' ? P.name : 'Hazırlık');
    setT('#hud-wave', g.phase === 'combat' ? mm : String(g.breakT));
    setT('#hud-sub', g.phase === 'combat' ? (g.pv[0] === 'duel' ? `Raunt ${g.pv[6]}` : `Leş: ${g.self.pk | 0} · Ölüm: ${g.self.dth | 0}`) : IS_TOUCH ? 'Silahını seç' : 'Cephanelikten silahını seç');
  } else if (g.phase === 'combat') {
    setT('#hud-phase', 'Dalga');
    setT('#hud-wave', String(g.wave));
    setT('#hud-sub', IS_TOUCH ? `${fmt(g.zLeft)} zombi` : `Kalan zombi: ${fmt(g.zLeft)}`);
  } else {
    setT('#hud-phase', g.wave === 0 ? 'Hazırlan' : 'Mola');
    setT('#hud-wave', String(g.wave + 1));
    setT('#hud-sub', IS_TOUCH ? `${g.breakT} sn sonra` : `Dalga ${g.wave + 1} başlıyor: ${g.breakT} sn`);
  }

  const md = S.roster && S.roster.mode && S.roster.mode !== 'normal' ? MODES[S.roster.mode] : null;
  const mt = $('#hud-mode');
  if (mt.hidden !== !md) mt.hidden = !md;
  if (md && mt.textContent !== md.name) mt.textContent = md.name;
  const mv = $('#hud-mev'), ev = g.mev && MEV[g.mev[0]];
  if (mv.hidden !== !ev) mv.hidden = !ev;
  if (ev) { const t = `${ev.name} · ${Math.ceil(g.mev[1])} sn`; if (mv.textContent !== t) mv.textContent = t; mv.dataset.k = g.mev[0]; }

  // team (phones hide this list: nothing to do there)
  if (!IS_TOUCH) {
    const team = $('#hud-team');
    const rows = [...g.ps.entries()];
    if (team.childElementCount !== rows.length) team.replaceChildren(...rows.map(() => { const li = el('li'); li.append(el('i', 'dot'), el('span'), el('div', 'mini-hp')); li.lastChild.append(el('i')); return li; }));
    rows.forEach(([pid, p], i) => {
      const li = team.children[i];
      const info = g.roster.get(pid);
      const col = g.pv && g.pv[0] !== 'ffa' ? TEAM_COL[p.tm | 0] : info ? info.color : '#888';
      const nm = (info ? info.name : '?') + (pid === S.me ? ' (sen)' : ''), pg = p.ping > 0 ? ` ${p.ping} ms` : '', pc = p.ping < 90 ? 'ok' : p.ping < 180 ? 'mid' : 'bad';
      const sig = (p.alive ? 1 : 0) + '|' + col + '|' + nm + '|' + pg + '|' + pc;
      if (li._sig !== sig) {
        li._sig = sig;
        li.className = p.alive ? '' : 'down';
        li.children[0].style.background = col;
        li.children[1].textContent = nm;
        if (pg) li.children[1].append(el('small', 'ping ' + pc, pg));
      }
      const talk = voiceLevel(pid) > 6; if (li._talk !== talk) { li._talk = talk; li.classList.toggle('talk', talk); }
      setPct(li.children[2].firstChild, p.maxHp ? p.hp / p.maxHp : 0);
    });
  }

  // health, ability, gold
  setT('#hud-hp-text', `${fmt(Math.max(0, me.hp))} / ${fmt(me.maxHp)}`);
  const hpk = me.maxHp ? Math.max(0, me.hp / me.maxHp) : 0;
  setPct($('#hud-hp-fill'), hpk);
  $('#hud-hp-fill').classList.toggle('low', hpk < 0.3);
  const cd = c.ab.cd * st.cd;
  const left = me.abLeft;
  setT('#hud-ab-name', c.ab.name);
  setT('#hud-ab-cd', left > 0 ? `${Math.ceil(left)} sn` : 'Hazır');
  setPct($('#hud-ab-fill'), left > 0 ? 1 - left / cd : 1, 'height');
  $('#hud-ab').classList.toggle('ready', left <= 0);
  if (IS_TOUCH) {
    const fighting = g.phase === 'combat' && me.alive;
    setHid('#stick-aim', !fighting);
    setHid('#t-ab', !me.alive);
    $('#t-ab').classList.toggle('ready', left <= 0);
    setT('#t-ab', left > 0 ? `${Math.ceil(left)} sn` : c.ab.name);
  }
  $('#hud-ab').title = c.ab.desc;
  const bashL = me.bashLeft || 0;
  setPct($('#hud-bash-fill'), bashL > 0 ? 1 - bashL / bashCd(g.cls) : 1, 'height');
  $('#hud-bash').classList.toggle('ready', bashL <= 0);
  if (IS_TOUCH) {
    setHid('#t-bash', !me.alive || g.phase !== 'combat');
    $('#t-bash').classList.toggle('ready', bashL <= 0);
  }
  updateGearHud(g, me);
  const act = g.fx.get(S.me);
  if (act && g.time < act.until) { setT('#hud-ab-cd', `Aktif: ${Math.ceil(act.until - g.time)} sn`); $('#hud-ab').classList.add('active'); }
  else $('#hud-ab').classList.remove('active');
  setT('#hud-gold', fmt(me.gold));
  setT('#hud-class', IS_TOUCH ? c.name : `${c.name} · ${g.myWeapon.name}`);
  const buffs = [];
  if (me.power > 0) buffs.push(['power', `Güç ${Math.ceil(me.power)} sn`]);
  if (me.haste > 0) buffs.push(['haste', `Hız ${Math.ceil(me.haste)} sn`]);
  if (me.chill > 0 && me.alive) buffs.push(['chill', 'Üşüdün: yavaşsın']);
  if (me.bs > 0) buffs.push(['blood', `Kan kalkanı ${me.bs}`]);
  else if (me.pfl & 16) buffs.push(['guard', 'Koruma']);
  setHid('#hud-bs', !(me.bs > 0));
  if (me.bs > 0) setPct($('#hud-bs-fill'), me.bs / (me.maxHp * 0.35));
  const bl = $('#hud-buffs');
  if (bl.dataset.sig !== buffs.join()) { bl.dataset.sig = buffs.join(); bl.replaceChildren(...buffs.map(([k, t]) => el('span', 'buff ' + k, t))); }
  const boss = BL[0], bx = $('#boss');
  if (bx.hidden !== !boss && !CTL.editing) bx.hidden = !boss;
  if (boss) {
    setT('#boss-name', ZTYPES[boss.t].name);
    setPct($('#boss-fill'), boss.hp / boss.max);
    // other bosses alive at the same time: thin bars underneath (a few at most, so the bar never fills the screen)
    const more = $('#boss-more'), all = BL.slice(1), cap = IS_TOUCH ? 2 : 3, rest = all.slice(0, cap), extra = all.length - rest.length;
    const want = rest.length + (extra > 0 ? 1 : 0);
    if (more.childElementCount !== want) more.replaceChildren(...rest.map(() => { const r = el('div', 'boss-row'); const b = el('div', 'boss-bar sm'); b.append(el('i')); r.append(el('span'), b); return r; }), ...(extra > 0 ? [el('div', 'boss-n')] : []));
    rest.forEach((z, i) => { const r = more.children[i]; const t = ZTYPES[z.t].name; if (r.firstChild.textContent !== t) r.firstChild.textContent = t; setPct(r.lastChild.firstChild, z.hp / z.max); });
    if (extra > 0) { const t = `+${extra} boss daha`; if (more.lastChild.textContent !== t) more.lastChild.textContent = t; }
  }
  setT('#hud-kills', fmt(me.kills));

  // downed
  $('#dead').hidden = me.alive || !me.inGame || !$('#esc').hidden || !!g.pv;
  { const kb = g.killedBy, db = $('#dead-by'), nm = kb === 'tr' ? 'Metro treni' : ZTYPES[kb] ? ZTYPES[kb].name : '';
    db.hidden = !nm || me.alive; if (nm && db.textContent !== 'Seni deviren: ' + nm) db.textContent = 'Seni deviren: ' + nm; }
  $('#dead-sub').textContent = g.ps.size > 1 ? 'Bir arkadaşın yanına gelip seni kaldırabilir · dalga bitince dönersin' : 'Dalga bitince geri döneceksin';
  $('#net-warn').hidden = S.role !== 'client' || performance.now() - g.lastSnapAt < 1000;
  if (!me.alive) {
    const sp = g.spectate != null ? g.ps.get(g.spectate) : null;
    const mine = g.ps.get(S.me);
    $('#spec').hidden = !sp;
    if (sp) {
      $('#spec-name').textContent = g.nameOf(g.spectate);
      const info = S.roster && S.roster.players.find((p) => p.pid === g.spectate);
      $('#spec-name').style.color = info ? info.color : '';
      $('#spec-hp').style.width = Math.max(0, Math.min(1, sp.hp / (sp.maxHp || 1))) * 100 + '%';
      const many = [...g.ps.entries()].filter(([pid, p]) => pid !== S.me && p.alive).length > 1;
      $('#spec-prev').hidden = $('#spec-next').hidden = !many;
    }
    const rev = mine && mine.rev > 0;
    $('#rev').hidden = !rev;
    if (rev) { $('#dead-watch').textContent = 'Kaldırılıyorsun…'; $('#rev-fill').style.width = Math.round(mine.rev * 100) + '%'; }
  }

  updateShop();
  if (!$('#board').hidden) renderBoard();
}
// ---------- one-use items in battle ----------
function updateGearHud(g, me) {
  const bar = $('#hud-gear');
  const sig = me.inv.join() + '|' + (g.phase === 'combat' && me.alive ? 1 : 0);
  if (bar.dataset.sig === sig) return;
  bar.dataset.sig = sig;
  const fight = g.phase === 'combat' && me.alive;
  const slots = GEAR.map((it, i) => [it, i]).filter(([, i]) => me.inv[i] > 0);
  bar.replaceChildren(...slots.map(([it, i]) => {
    const d = el('div', 'gear-slot');
    d.style.setProperty('--pc', it.col);
    d.append(el('span', 'ab-key', String(i + 1)), el('strong', '', it.short), el('span', 'gear-n', `×${me.inv[i]}`));
    d.title = it.desc;
    return d;
  }));
  bar.hidden = !slots.length;
  const tg = $('#t-gear');
  tg.replaceChildren(...slots.map(([it, i]) => {
    const b = el('button', 't-btn t-gear');
    b.type = 'button';
    b.style.setProperty('--pc', it.col);
    b.append(el('span', '', it.short), el('b', '', `×${me.inv[i]}`));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.game) S.game.input.use = i; });
    return b;
  }));
  tg.hidden = !(IS_TOUCH && fight && slots.length);
}
$('#btn-shop-ready').addEventListener('click', () => { if (S.game) send({ t: 'ready', r: !S.game.self.shopReady }); });
// ---------- scoreboard ----------
function renderBoard() {
  const g = S.game;
  if (!g) return;
  $('#board-wave').textContent = g.pv ? (PVP[g.pv[0]] || PVP.tdm).name : `Dalga ${g.wave}`;
  const body = $('#board-body');
  body.replaceChildren();
  const isHost = S.role === 'host';
  const rows = [...g.ps.entries()].sort((a, b) => g.pv ? ((a[1].tm - b[1].tm) * (g.pv[0] === 'ffa' ? 0 : 1) || b[1].pk - a[1].pk) : b[1].kills - a[1].kills);
  for (const [pid, p] of rows) {
    const info = g.roster.get(pid);
    if (!info) continue;
    const tr = el('tr');
    const who = el('div', 'who'); const dot = el('span', 'dot'); dot.style.background = info.color;
    who.append(dot, el('span', '', info.name + (pid === S.me ? ' (sen)' : '')));
    const td = el('td'); td.append(who);
    const act = el('td');
    if (info.vo && pid !== S.me && voiceOn()) { const mb = el('button', 'btn ghost small', voiceMuted(pid) ? 'Sesi aç' : 'Sustur'); mb.type = 'button'; mb.addEventListener('click', () => { voiceMute(pid, !voiceMuted(pid)); renderBoard(); }); act.append(mb); }
    if (isHost && pid !== S.me) {
      const b = el('button', 'btn ghost small', 'At'); b.type = 'button';
      b.addEventListener('click', () => kickPlayer(info));
      act.append(b);
    }
    if (g.pv && g.pv[0] !== 'ffa') dot.style.background = TEAM_COL[p.tm | 0];
    tr.append(td, el('td', '', CLASSES[info.cls].name), el('td', 'num', g.pv ? `${p.pk | 0} / ${p.dth | 0} / ${p.ast | 0}` : fmt(p.kills)), el('td', '', (g.pv ? (p.alive ? 'Savaşta' : 'Yeniden doğuyor') : p.alive ? 'Ayakta' : 'Düştü') + (p.ping > 0 ? ` · ${p.ping} ms` : pid === (S.roster && S.roster.host) ? ' · kurucu' : '')), act);
    body.append(tr);
  }
}
// ---------- quick team messages ----------
(function quickMenu() {
  const grid = $('#quick-grid');
  QUICK.forEach((q, i) => {
    const b = el('button', 'quick-b'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.style.setProperty('--qc', q.col);
    b.append(el('span', 'quick-ic', q.ic), el('span', 'quick-t', q.t), el('kbd', '', String(i + 1)));
    b.addEventListener('click', () => quickPick(i));
    grid.append(b);
  });
  $('#t-quick').addEventListener('click', () => quickToggle());
})();
function quickToggle(open) { const q = $('#quick'); q.hidden = open === undefined ? !q.hidden : !open; }
function quickPick(i) { if (!S.game || !QUICK[i]) return; S.game.quick(i); quickToggle(false); buzz(15); }
function addQuick(pid, k) {
  const q = QUICK[k]; if (!q) return;
  const info = S.roster && S.roster.players.find((p) => p.pid === pid);
  const li = el('li', 'quick-line'), who = el('b', '', (info ? info.name : 'Biri') + ':');
  if (info) who.style.color = info.color;
  const m = el('span', 'quick-m', q.ic + ' ' + q.t); m.style.color = q.col;
  li.append(who, m);
  const log = $('#chat-log'); log.append(li); setTimeout(() => li.classList.add('old'), 7000);
  while (log.children.length > 40) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

export { ELITE, addQuick, adminNote, banner, bannerTimer, buzz, buzzAt, killFeed, lastHpBuzz, notice, qaPop, quickPick, quickToggle, renderBoard, streak, streakT, updateGearHud, updateHud };
