// The lobby: players, classes and their details, room settings, PvP teams and the room settings popup.
import { pathOf, pathsFor, AB_UP, MAPS, MAP_ORDER, DIFFS, DIFF_ORDER, MODES, MODE_ORDER, MAX_PLAYERS, scaleFor, GEM_DIFF, GEM_MODE, gemTag, CLASSES, CLASS_ORDER, PVP, PVP_ORDER, TEAM_NAME } from './config.js';
import { drawCharacter, drawMapPreview } from './render.js';
import { dashRefresh, gemIcon, frList, drawAvatar } from './dash.js';
import { ownsCls, ITEMS as COS, titleOf } from './catalog.js';
import { LIVE, ACCT, ME, PUB, setPub, liveBlock, acctCheck, nameTaken, acctOp } from './live.js';
import { $, IS_TOUCH, S, ask, el, menuMsg, tipNext, toast } from './app.js';
import { createRoom,  joinRoom, leave, myEntry, online, send } from './main.js';
import { TAKEN, acctUi, blockUi } from './acct.js';

// ---------- lobby ----------
function renderLobby() {
  const r = S.roster;
  if (!r) return;
  const me = myEntry();
  const isHost = S.me === r.host;
  const running = r.ph === 'combat' || r.ph === 'break';

  $('#room-code').textContent = r.code || 'Çevrimdışı';
  $('#btn-copy').hidden = !r.code;
  $('#code-box').classList.toggle('offline', !r.code);
  $('#lobby-eyebrow').textContent = r.code ? 'Lobi' : 'Tek kişilik oyun';
  $('#lobby-title').textContent = running ? 'Oyun sürüyor' : r.ph === 'over' ? 'Oyun bitti' : 'Takımını topla';
  $('#player-count').textContent = `${r.players.length}/${r.max || MAX_PLAYERS}`;
  $('#btn-invite').hidden = !(ACCT && r.code && online() && r.players.length < (r.max || MAX_PLAYERS));

  const list = $('#player-list');
  list.replaceChildren();
  $('#lt-n').textContent = String(r.players.length);
  $('#lchat').hidden = !r.code; $('#t-chat').hidden = !r.code; $('#t-quick').hidden = !r.code;
  for (const p of r.players) {
    const li = el('li', 'player' + (p.pid === S.me ? ' me' : ''));
    let dot = el('span', 'dot'); dot.style.background = p.color;
    if (r.mode === 'pvp' && r.pvp !== 'ffa') li.classList.add('pv-t' + (p.tm | 0));
    if (p.eq && Object.keys(p.eq).length) { dot = el('canvas', 'p-av'); drawAvatar(dot, p.eq, { size: 34, cls: p.cls, noPet: true }); dot.style.setProperty('--pc', p.color); }
    const nm = el('div', 'p-name');
    const pn = el('b', '', p.name + (p.pid === S.me ? ' (sen)' : ''));
    const nc = p.eq && COS[p.eq.nc] ? COS[p.eq.nc].c : null;
    if (nc === 'rainbow') pn.classList.add('rainbow'); else if (nc) pn.style.color = nc;
    if (p.lvl) pn.prepend(el('span', 'lvl-b', String(p.lvl)));
    if (p.ct) pn.prepend(el('span', 'clan-t', '[' + p.ct + ']'));
    const tt = titleOf(p.eq);
    nm.append(pn, el('small', '', CLASSES[p.cls].name + (tt ? ' · ' + tt : '')));
    let chip;
    if (p.away) chip = el('span', 'chip', 'Bağlanıyor');
    else if (p.pid === r.host) chip = el('span', 'chip host', 'Kurucu');
    else if (running || r.ph === 'over') chip = el('span', 'chip' + (p.inGame ? ' ok' : ''), p.inGame ? 'Oyunda' : 'Bekliyor');
    else chip = el('span', 'chip' + (p.ready ? ' ok' : ''), p.ready ? 'Hazır' : 'Bekliyor');
    li.append(dot, nm, chip);
    if (isHost && p.pid !== S.me) {
      const k = el('button', 'btn ghost small kick', 'At');
      k.type = 'button';
      k.setAttribute('aria-label', p.name + ' adlı oyuncuyu odadan at');
      k.addEventListener('click', () => kickPlayer(p));
      li.append(k);
    } else li.append(el('span'));
    list.append(li);
  }
  if (r.code && r.players.length < (r.max || MAX_PLAYERS)) {
    const li = el('li', 'empty-slot inv-slot');
    const on = ACCT ? frList().filter((f) => f.on && !r.players.some((p) => p.name === f.name)).length : 0;
    const acts = el('div', 'inv-acts');
    if (ACCT && online()) { const b = el('button', 'btn small primary', on ? `Arkadaş davet et (${on} çevrimiçi)` : 'Arkadaş davet et'); b.type = 'button'; b.onclick = () => $('#btn-invite').click(); acts.append(b); }
    const cp = el('button', 'btn small', 'Bağlantıyı kopyala'); cp.type = 'button';
    cp.onclick = async () => { const url = location.origin + (window.KROOT || '/') + '?oda=' + r.code; try { if (navigator.share && IS_TOUCH) await navigator.share({ title: 'Kuşatma', text: 'Odama gel!', url }); else { await navigator.clipboard.writeText(url); toast('Bağlantı kopyalandı. Arkadaşın açınca direkt odana gelir.', 'good'); } } catch (e) { /* cancelled */ } };
    acts.append(cp);
    li.append(el('span', '', `Oda kodu ${r.code}. Bağlantıyı açan arkadaşın direkt odana gelir.`), acts);
    list.append(li);
  }

  renderSettings(r, isHost);
  if (S.again && r.ph === 'lobby') { S.again = false; const me2 = r.players.find((p) => p.pid === S.me); if (me2 && !me2.ready) setTimeout(() => $('#btn-ready').click(), 200); }

  const cl = $('#class-list');
  if (!cl.childElementCount) buildClassCards();
  if (me && cl.dataset.color !== me.color) { cl.dataset.color = me.color; drawPreviews(me.color); }
  showClassDetail(null);
  for (const card of cl.children) {
    const id = card.dataset.cls, on = me && id === me.cls, mine = ownsCls(ME.own, id) || (r.mode === 'daily' && id === r.dly), locked = (!mine && r.mode !== 'sandbox') || (r.mode === 'daily' && id !== r.dly);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
    card.tabIndex = on ? 0 : -1;
    card.disabled = !!(me && me.inGame);
    card.classList.toggle('locked', locked);
    const tag = card.querySelector('.cls-tag');
    tag.replaceChildren();
    if (!mine) {
      const pr = LIVE.shop && LIVE.shop.p['c.' + id];
      if (r.mode === 'daily') { tag.className = 'cls-tag lock'; tag.textContent = 'Bugün değil'; }
      else if (r.mode !== 'sandbox') { tag.className = 'cls-tag lock'; tag.append(el('span', '', 'Kilitli')); if (pr) { tag.append(gemIcon(13), el('b', '', pr.toLocaleString('tr'))); } }
      else { tag.className = 'cls-tag try'; tag.textContent = 'Deneme'; }
    } else if (r.mode === 'daily' && id === r.dly) { tag.className = 'cls-tag try'; tag.textContent = 'Günün sınıfı'; }
    else tag.className = 'cls-tag';
    const dots = card.querySelector('.cls-team');
    dots.replaceChildren(...r.players.filter((p) => p.cls === id).map((p) => { const d = el('i'); d.style.background = p.color; d.title = p.name; return d; }));
  }

  const btn = $('#btn-ready');
  const note = $('#lobby-note');
  const others = r.players.filter((p) => p.pid !== r.host);
  if (running) {
    btn.textContent = 'Oyuna katıl';
    btn.disabled = false;
    btn.classList.remove('on');
    note.textContent = 'Oyun devam ediyor. Sınıfını seç ve hemen katıl.';
  } else if (r.ph === 'over') {
    btn.textContent = isHost ? 'Lobiye dön' : 'Kurucu bekleniyor';
    btn.disabled = !isHost;
    note.textContent = 'Önceki oyun bitti.';
  } else if (isHost) {
    const ready = others.filter((p) => p.ready).length, need = Math.ceil(others.length * 0.75);
    btn.textContent = 'Oyunu başlat';
    btn.disabled = (others.length > 0 && ready < need) || (r.mode === 'pvp' && (r.players.length < 2 || (r.pvp === 'duel' && r.players.length !== 2)));
    btn.classList.remove('on');
    note.textContent = r.mode === 'pvp' && r.players.length < 2 ? 'PvP için en az iki oyuncu gerekiyor. Kodu ya da bağlantıyı paylaş.'
      : r.mode === 'pvp' && r.pvp === 'duel' && r.players.length !== 2 ? 'Düello tam iki kişiyle oynanır.'
      : !r.code ? 'Hazır olduğunda başlat. Dalgalar arasında yükseltme alabilirsin.'
      : others.length ? (ready >= need ? `${ready}/${others.length} oyuncu hazır. Başlatabilirsin.` : `${ready}/${others.length} oyuncu hazır. Başlatmak için en az ${need} kişi hazır olmalı.`)
      : 'Henüz kimse katılmadı. Kodu paylaş ya da tek başına başlat.';
  } else {
    btn.textContent = me && me.ready ? 'Hazırım ✓' : 'Hazırım';
    btn.classList.toggle('on', !!(me && me.ready));
    btn.disabled = false;
    note.textContent = 'Kurucu oyunu başlattığında savaş başlar.';
  }
  // the game gets tougher (and the map bigger) with every extra player
  const np = r.players.length;
  if (np > 1 && !running && r.ph !== 'over' && r.mode !== 'pvp') {
    const k = scaleFor(np), pc = (v) => Math.round((v - 1) * 100);
    note.textContent += ` ${np} oyuncu: zombiler +%${pc(k.count)}, can +%${pc(k.hp)}, boss canı +%${pc(k.boss)}, harita daha büyük.`;
  }
}
function renderSettings(r, isHost) {
  const canEdit = isHost && r.ph === 'lobby';
  $('#settings-who').textContent = canEdit ? 'Sen seçiyorsun' : 'Kurucu seçer';
  const ml = $('#map-list');
  if (!ml.childElementCount) {
    for (const id of [...MAP_ORDER, 'rastgele']) {
      const b = el('button', 'choice'); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
      b.append(el('b', '', id === 'rastgele' ? 'Rastgele' : MAPS[id].name));
      b.addEventListener('click', () => send({ t: 'set', map: id }));
      ml.append(b);
    }
    const dl = $('#diff-list');
    for (const id of DIFF_ORDER) {
      const b = el('button', '', DIFFS[id].name); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
      if (gemTag(GEM_DIFF[id])) b.append(el('small', 'gem-x', gemTag(GEM_DIFF[id])));
      b.addEventListener('click', () => send({ t: 'set', diff: id }));
      dl.append(b);
    }
    const mo = $('#mode-list');
    for (const id of MODE_ORDER.concat('sandbox', 'pvp')) {
      const b = el('button', '', MODES[id].name); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
      if (id === 'pvp') b.append(el('small', 'gem-x pv', 'dereceli'));
      else if (gemTag(GEM_MODE[id])) b.append(el('small', 'gem-x', gemTag(GEM_MODE[id])));
      b.addEventListener('click', () => send({ t: 'set', mode: id }));
      mo.append(b);
    }
  }
  const dly = r.mode === 'daily';
  for (const b of ml.children) { b.setAttribute('aria-checked', b.dataset.v === r.map ? 'true' : 'false'); b.disabled = !canEdit || dly; }
  for (const b of $('#diff-list').children) { b.setAttribute('aria-checked', b.dataset.v === r.diff ? 'true' : 'false'); b.disabled = !canEdit || dly; }
  for (const b of $('#mode-list').children) { b.setAttribute('aria-checked', b.dataset.v === (r.mode || 'normal') ? 'true' : 'false'); b.disabled = !canEdit || dly; b.hidden = dly || (b.dataset.v === 'sandbox' && !!r.code) || (b.dataset.v === 'pvp' && !r.code); }
  lobbyPvp(r, canEdit);
  $('#mode-h').textContent = dly ? 'Mod: ' + MODES.daily.name : 'Mod';
  $('#mode-desc').textContent = dly ? `${MODES.daily.desc} Bugünün sınıfı: ${(CLASSES[r.dly] || {}).name || ''}.` : (MODES[r.mode] || MODES.normal).desc;
  $('#diff-desc').textContent = DIFFS[r.diff] ? DIFFS[r.diff].desc : '';
  { const th = dly ? (r.theme || r.map) : r.map; if (S.pvMap !== th) { S.pvMap = th; drawMapPreview($('#map-pv'), th); } }
  if (!$('#lobby-tip').textContent) $('#lobby-tip').textContent = tipNext();
  $('#map-desc').textContent = r.map === 'rastgele' ? 'Her oyunda haritalardan biri rastgele seçilir.' : MAPS[r.map] ? MAPS[r.map].desc : '';
}
function buildClassCards() {
  const cl = $('#class-list');
  for (const id of CLASS_ORDER) {
    const c = CLASSES[id];
    const b = el('button', 'class-card');
    b.type = 'button';
    b.dataset.cls = id;
    b.setAttribute('role', 'radio');
    const top = el('div', 'class-top');
    const pv = el('canvas', 'class-preview');
    pv.width = 128; pv.height = 128;
    pv.setAttribute('aria-hidden', 'true');
    const title = el('div', 'class-title');
    title.append(el('span', 'class-name', c.name), el('span', 'class-weapon', c.weapon));
    top.append(pv, title);
    const bars = el('div', 'bars');
    for (const [label, v] of [['Can', c.bars.can], ['Hız', c.bars.hiz], ['Hasar', c.bars.hasar]]) {
      const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(v * 100) + '%'; bar.append(i);
      bars.append(el('span', '', label), bar);
    }
    const ab = el('div', 'ability');
    ab.append(el('b', '', c.ab.name + ': '), document.createTextNode(c.ab.desc));
    top.append(el('span', 'cls-tag'));
    const role = el('span', 'cls-role', CLASS_ROLE[id] || '');
    b.append(top, role, el('p', 'class-desc', c.desc), bars, ab, el('span', 'cls-team'));
    b.addEventListener('click', () => {
      S.hoverCls = null; showClassDetail(id);
      if (b.classList.contains('locked') && S.roster && S.roster.mode === 'daily') { toast('Günün görevinde herkes aynı sınıfla oynar.'); return; }
      if (b.classList.contains('locked')) { toast(`${c.name} kilitli. ${ACCT ? 'Ana sayfadaki Mağaza\'dan elmasla açabilirsin.' : 'Hesap açıp elmas kazanarak açabilirsin.'} Tek başına modda deneyebilirsin.`); return; }
      send({ t: 'cls', c: id });
    });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { S.hoverCls = id; showClassDetail(id); } });
    b.addEventListener('pointerleave', () => { if (S.hoverCls === id) { S.hoverCls = null; showClassDetail(null); } });
    b.addEventListener('keydown', (e) => {
      const i = CLASS_ORDER.indexOf(id);
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = CLASS_ORDER[(i + 1) % CLASS_ORDER.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = CLASS_ORDER[(i + CLASS_ORDER.length - 1) % CLASS_ORDER.length];
      if (n) { e.preventDefault(); send({ t: 'cls', c: n }); cl.querySelector(`[data-cls="${n}"]`).focus(); }
    });
    cl.append(b);
  }
}
const CLASS_ROLE = { asker: 'Saldırı', doktor: 'Destek', tamirci: 'Savunma', nisanci: 'Keskin nişancı', kalkanci: 'Tank', alevci: 'Yakın dövüş', bombaci: 'Alan hasarı', izci: 'Hız ve ganimet', muhendis: 'Dron ve destek', kimyager: 'Zehir ve kontrol', komutan: 'Liderlik', tesla: 'Zincirleme hasar', avci: 'Delici atış' };
// The side panel with everything about one class: stats, ability, passive, mastery and weapons.
const CLASS_TIPS = {
  asker: 'Her yere uyar. Canını yüksek tut, Disiplin hasarını artırır.',
  doktor: 'Takımın arkasında dur. Düşenlere koş, yeteneğin onları anında kaldırır.',
  tamirci: 'Tareti dar geçitlere kur, barikatlarla arkasını kapat.',
  nisanci: 'Zombileri bir hizaya getir, tek mermi hepsini deler.',
  kalkanci: 'Önde dur. Kalkanı en kalabalık anda aç, Dipçik ile Kalkanlıları aç.',
  alevci: 'Kalabalığın içine dal, alev her şeyi tutuşturur.',
  bombaci: 'Kalabalığa uzaktan ateş et, kaçarken arkana mayın bırak.',
  izci: 'Sürekli hareket et. Altınları ve eşyaları sen topla.',
  muhendis: 'Dronların sen hareket ettikçe ateş eder. Tamir dronunu barikatların ve taretlerin yanına götür.',
  kimyager: 'Önce zehirle, sonra takım eritsin. Bulutu dar geçitlere at.',
  komutan: 'Takımın ortasında kal: liderliğin herkese hasar katar. Sandığı en zor anda çağır.',
  tesla: 'Kalabalığa ateş et, şimşek kendisi yayılır. Bobini sürünün geleceği yere dik.',
  avci: 'Zombileri bir hizaya getir, her ok sırayı deler. Ok Yağmuru ile kapıyı kapat.',
};
function showClassDetail(id) {
  const box = $('#class-detail');
  if (!box) return;
  const me = myEntry();
  const cls = id || S.hoverCls || (me ? me.cls : 'asker');
  const color = me ? me.color : '#ff8a3d';
  const sig = cls + color + ME.own.length + (S.roster && S.roster.code ? 1 : 0) + JSON.stringify(ME.eq);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const c = CLASSES[cls];
  const head = el('div', 'cd-head');
  const cv = el('canvas', 'cd-pic'); cv.width = 176; cv.height = 176;
  const g = cv.getContext('2d'); g.translate(70, 96); g.scale(2.8, 2.8);
  drawCharacter(g, cls, color, -0.6, 0, { alive: true, hat: ME.eq.hat, wsk: ME.eq.wsk });
  const t = el('div', 'cd-title');
  t.append(el('span', 'eyebrow', CLASS_ROLE[cls] || 'Sınıf'), el('strong', '', c.name), el('span', 'cd-weapon', c.tiers.join(' → ')));
  head.append(cv, t);
  const stats = el('div', 'cd-stats');
  const dps = Math.round(c.dmg * c.rate * c.pellets);
  for (const [label, val, k] of [['Can', c.hp, c.bars.can], ['Hız', c.spd, c.bars.hiz], ['Hasar', `${c.dmg}${c.pellets > 1 ? '×' + c.pellets : ''} · ${c.rate}/sn`, c.bars.hasar], ['Saniyede', `~${dps}`, Math.min(1, dps / 180)]]) {
    const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(k * 100) + '%'; bar.append(i);
    stats.append(el('span', '', label), bar, el('b', '', String(val)));
  }
  const sec = (title, name, text, extra) => {
    const d = el('div', 'cd-sec');
    d.append(el('span', 'eyebrow', title));
    const p = el('p'); p.append(el('b', '', name + ' '), document.createTextNode(text)); d.append(p);
    if (extra) d.append(extra);
    return d;
  };
  const mast = el('ol', 'cd-mast');
  AB_UP[cls].forEach((x) => mast.append(el('li', '', x)));
  const abInfo = `${c.ab.desc} Bekleme ${c.ab.cd} sn.`;
  const lockNote = [];
  if (!ownsCls(ME.own, cls)) {
    const pr = LIVE.shop && LIVE.shop.p['c.' + cls], n = el('div', 'cd-lock');
    n.append(el('strong', '', S.roster && S.roster.mode === 'sandbox' ? 'Deneme alanında serbest' : 'Kilitli sınıf'));
    if (pr) { const g = el('span', 'gem-amt'); g.append(gemIcon(14), el('b', '', pr.toLocaleString('tr'))); n.append(g); }
    n.append(el('span', 'dim', (ACCT ? 'Ana sayfadaki Mağaza\'dan açabilirsin.' : 'Hesap aç, oynayarak elmas kazan, sınıfı aç.') + (S.roster && !S.roster.code && S.roster.mode !== 'sandbox' ? ' Denemek için Mod: Deneme Alanı.' : '')));
    lockNote.push(n);
  }
  box.replaceChildren(head, ...lockNote, el('p', 'cd-desc', c.desc), stats,
    sec('Yetenek · Boşluk', c.ab.name, abInfo),
    sec('Pasif', c.pas.name, c.pas.desc),
    sec('Yetenek ustalığı (cephanelikte)', '', '', mast),
    sec('Silah yolları (cephanelikte)', '', '', (() => { const u = el('div', 'cd-paths'); for (const k of pathsFor(cls)) { const P = pathOf(cls, k), ch = el('span', 'cd-path'); ch.style.setProperty('--pc', P.col); ch.title = P.desc || ''; ch.textContent = P.name; u.append(ch); } return u; })()),
    el('p', 'cd-tip', CLASS_TIPS[cls] || ''));
  box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
}
function drawPreviews(color) {
  for (const card of $('#class-list').children) {
    const cv = card.querySelector('canvas');
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.translate(50, 72);
    g.scale(2.05, 2.05);
    drawCharacter(g, card.dataset.cls, color || '#ff8a3d', -0.6, 0, { alive: true, hat: ME.eq.hat, wsk: ME.eq.wsk });
  }
}
function kickPlayer(p) {
  ask('Oyuncuyu at', `${p.name} odadan çıkarılsın mı?`, 'Odadan at', () => send({ t: 'kick', pid: p.pid }));
}
$('#btn-ready').addEventListener('click', () => {
  const r = S.roster; if (!r) return;
  const me = myEntry();
  if (r.ph === 'combat' || r.ph === 'break') send({ t: 'ready', r: true });
  else if (r.ph === 'over') { if (S.me === r.host) send({ t: 'lobby' }); }
  else if (S.me === r.host) send({ t: 'start' });
  else send({ t: 'ready', r: !(me && me.ready) });
});
$('#btn-leave').addEventListener('click', () => {
  if (S.role === 'host' && S.roster && S.roster.players.length > 1) {
    ask('Odadan ayrıl', 'Kurucu sensin. Ayrılırsan kuruculuk başka bir oyuncuya geçer ve oyun devam eder.', 'Ayrıl', () => leave(''));
  } else leave('');
});
for (const b of document.querySelectorAll('.lobby-tabs button')) b.addEventListener('click', () => {
  $('#lobby').dataset.lt = b.dataset.lt;
  for (const o of document.querySelectorAll('.lobby-tabs button')) o.setAttribute('aria-selected', String(o === b));
  $('#lobby').scrollTop = 0;
});
$('#btn-copy').addEventListener('click', async () => {
  const code = S.roster && S.roster.code;
  if (!code) return;
  try { await navigator.clipboard.writeText(code); $('#btn-copy').textContent = 'Kopyalandı'; }
  catch (e) {
    const range = document.createRange(); range.selectNodeContents($('#room-code'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    $('#btn-copy').textContent = 'Seçildi, kopyala';
  }
  setTimeout(() => { $('#btn-copy').textContent = 'Kodu kopyala'; }, 1800);
});
// the lobby's PvP options: the kind of match and (in team fights) which team you're on
function lobbyPvp(r, canEdit) {
  let box = $('#pvp-opts');
  if (!box) {
    box = el('div', 'pvp-opts'); box.id = 'pvp-opts';
    const kinds = el('div', 'seg pv-kinds'); kinds.setAttribute('role', 'radiogroup'); kinds.id = 'pvp-kinds';
    for (const id of PVP_ORDER) { const b = el('button', '', PVP[id].name); b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio'); b.addEventListener('click', () => send({ t: 'set', pv: id })); kinds.append(b); }
    const teams = el('div', 'pv-teams'); teams.id = 'pvp-teams';
    for (const t of [0, 1]) { const b = el('button', 'btn ghost small pv-team t' + t, TEAM_NAME[t] + ' takım'); b.type = 'button'; b.dataset.t = t; b.addEventListener('click', () => send({ t: 'team', tm: t })); teams.append(b); }
    box.append(kinds, el('p', 'dim small', ''), teams);
    $('#mode-desc').after(box);
  }
  const on = r.mode === 'pvp';
  box.hidden = !on;
  const dl = $('#diff-list'); if (dl) { const sec = dl.closest('section, .lb-sec, div'); dl.hidden = on; if ($('#diff-desc')) $('#diff-desc').hidden = on; void sec; }
  if (!on) return;
  const me = r.players.find((p) => p.pid === S.me);
  for (const b of $('#pvp-kinds').children) { b.setAttribute('aria-checked', b.dataset.v === r.pvp ? 'true' : 'false'); b.disabled = !canEdit || (b.dataset.v === 'duel' && r.players.length > 2); }
  box.querySelector('p').textContent = (PVP[r.pvp] || PVP.tdm).desc + (r.pvp === 'duel' && r.players.length > 2 ? '' : '');
  const tb = $('#pvp-teams'); tb.hidden = r.pvp !== 'tdm';
  const cnt = [0, 1].map((t) => r.players.filter((p) => (p.tm | 0) === t).length);
  for (const b of tb.children) { const t = +b.dataset.t; b.textContent = `${TEAM_NAME[t]} takım (${cnt[t]})`; b.classList.toggle('on', !!me && (me.tm | 0) === t); }
}
$('#btn-over-leave').addEventListener('click', () => $('#btn-leave').click());
// ---------- room settings popup: open (listed for signed-in players) or private ----------
let roomVis = 0;
function roomVisSet(v) { roomVis = v; for (const b of document.querySelectorAll('.vis-opt')) b.setAttribute('aria-pressed', String(+b.dataset.v === v)); }
function chipRow(box, items, cur, onPick) {
  box.replaceChildren(...items.map(([v, t, x]) => { const b = el('button', 'chip-opt', t); if (x) b.append(el('small', 'gem-x', x)); b.type = 'button'; b.setAttribute('aria-pressed', String(v === cur)); b.onclick = () => { for (const x of box.children) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true'); onPick(v); }; return b; }));
}
const ROOM = { map: 'meydan', diff: 'normal', mode: 'normal', max: MAX_PLAYERS };
try { Object.assign(ROOM, JSON.parse(localStorage.getItem('kusatma-oda') || '{}')); } catch (e) { /* ignore */ }
function roomDlg() {
  if (liveBlock()) { blockUi(); return; }
  if (nameTaken($('#name').value)) { menuMsg(TAKEN); return; }
  const pubOk = !!ACCT;
  document.querySelector('.vis-opt[data-v="1"]').disabled = !pubOk;
  roomVisSet(pubOk && PUB ? 1 : 0);
  $('#room-note').textContent = pubOk ? 'İstersen sonradan oda kodunu da paylaşabilirsin.' : 'Açık oda kurmak için hesap gerekir. Ana menüden Giriş yap.';
  chipRow($('#room-map'), [...MAP_ORDER.map((id) => [id, MAPS[id].name]), ['rastgele', 'Rastgele']], ROOM.map, (v) => { ROOM.map = v; });
  chipRow($('#room-diff'), DIFF_ORDER.map((id) => [id, DIFFS[id].name, gemTag(GEM_DIFF[id])]), ROOM.diff, (v) => { ROOM.diff = v; });
  const pvRow = () => { const on = ROOM.mode === 'pvp'; $('#room-pvp').hidden = !on; $('#room-diff').hidden = on; const dh = $('#room-diff').previousElementSibling; if (dh) dh.hidden = on; };
  chipRow($('#room-mode'), MODE_ORDER.concat('pvp').map((id) => [id, MODES[id].name, id === 'pvp' ? 'dereceli' : gemTag(GEM_MODE[id])]), MODE_ORDER.includes(ROOM.mode) || ROOM.mode === 'pvp' ? ROOM.mode : 'normal', (v) => { ROOM.mode = v; pvRow(); });
  chipRow($('#room-pvp'), PVP_ORDER.map((id) => [id, PVP[id].name]), PVP[ROOM.pv] ? ROOM.pv : 'tdm', (v) => { ROOM.pv = v; if (v === 'duel') { ROOM.max = 2; chipRow($('#room-max'), [[2, '2'], [4, '4'], [6, '6'], [8, '8'], [12, '12'], [16, '16'], [MAX_PLAYERS, String(MAX_PLAYERS)]], 2, (x) => { ROOM.max = x; }); } });
  pvRow();
  chipRow($('#room-max'), [[2, '2'], [4, '4'], [6, '6'], [8, '8'], [12, '12'], [16, '16'], [MAX_PLAYERS, String(MAX_PLAYERS)]], ROOM.max, (v) => { ROOM.max = v; });
  $('#room-name').value = ACCT ? (ROOM.name || '') : ''; $('#room-name-row').hidden = !ACCT;
  $('#room-dlg').hidden = false;
}
for (const b of document.querySelectorAll('.vis-opt')) b.onclick = () => roomVisSet(+b.dataset.v);
$('#room-close').onclick = () => { $('#room-dlg').hidden = true; };
$('#room-go').onclick = () => {
  $('#room-dlg').hidden = true;
  ROOM.name = ACCT ? $('#room-name').value.trim().slice(0, 24) : '';
  try { localStorage.setItem('kusatma-oda', JSON.stringify(ROOM)); } catch (e) { /* ignore */ }
  setPub(!!ACCT && roomVis === 1);
  createRoom(false, { map: ROOM.map, diff: ROOM.diff, mode: MODE_ORDER.includes(ROOM.mode) || ROOM.mode === 'pvp' ? ROOM.mode : 'normal', pv: PVP[ROOM.pv] ? ROOM.pv : 'tdm', max: ROOM.mode === 'pvp' && ROOM.pv === 'duel' ? 2 : ROOM.max, name: roomVis === 1 ? ROOM.name : '' });
};
acctUi();
acctCheck().then(() => { acctUi(); dashRefresh(); inviteFromPush(); });
// opened from a room-invite phone notice (oyun/davet): ask which room it was and join it straight away
async function inviteFromPush() {
  if (!/\/oyun\/davet\/?$/.test(location.pathname)) return;
  try { history.replaceState(null, '', window.KROOT || './'); } catch (e) { /* ignore */ }
  if (!ACCT || S.net) return;
  const j = await acctOp('linv');
  if (j.ok && j.room) { toast(`${j.f} seni odasına çağırdı, katılıyorsun…`, 'good'); $('#code').value = j.room; joinRoom(); }
  else toast('Bu davetin süresi dolmuş ya da oda kapanmış.', '');
}

export { CLASS_ROLE, CLASS_TIPS, ROOM, buildClassCards, chipRow, drawPreviews, inviteFromPush, kickPlayer, lobbyPvp, renderLobby, renderSettings, roomDlg, roomVis, roomVisSet, showClassDetail };
