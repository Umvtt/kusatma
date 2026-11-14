// The end of a game: the result screen, the share picture, and the PvP score bar, notices and end screen.
import { MAPS, DIFFS, MODES, CLASSES, PVP, TEAM_COL, TEAM_NAME, league } from './config.js';
import { drawCharacter } from './render.js';
import { gemIcon } from './dash.js';
import { ACCT, ME, acctCheck } from './live.js';
import {  leave, send } from './main.js';
import { authOpen } from './acct.js';
import { $, IS_TOUCH, S, el, fmt, toast } from './app.js';
import { banner, buzz } from './hud.js';

// ---------- game over ----------
// the "Hesap aç" tile on the end screen is a real button: it leaves the room and opens sign-up
function ctaTile(t) {
  t.setAttribute('role', 'button'); t.tabIndex = 0;
  const go = () => { leave(''); authOpen('reg'); };
  t.addEventListener('click', go); t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  return t;
}
// the signed-in player's take from this game: gems, level, season tier and their own line
function overMe() {
  const box = $('#over-me'), o = S.over, me = o && o.P.find((p) => p.pid === S.me);
  if (!box || !me) { if (box) box.hidden = true; return; }
  const tile = (v, l, cls) => { const t = el('div', 'om-t' + (cls ? ' ' + cls : '')); t.append(el('strong', '', v), el('span', '', l)); return t; };
  const tiles = [tile(fmt(me.kills), 'leş'), tile(fmt(me.dmg), 'hasar'), tile(String(o.wave), 'dalga')];
  if (ACCT) {
    const g = tile('+' + fmt(S.gameGems | 0), 'elmas', 'gem'); g.prepend(gemIcon(18)); tiles.unshift(g);
    const lv = el('div', 'om-t om-lv'); const bar = el('div', 'xpbar'); const f = el('i'); f.style.width = Math.round(100 * (ME.lx | 0) / Math.max(1, ME.ln | 0)) + '%'; bar.append(f);
    lv.append(el('strong', '', 'Seviye ' + (ME.lvl || 1)), bar, el('span', '', `${fmt(ME.lx | 0)} / ${fmt(ME.ln | 0)} XP · sezon kademesi ${ME.spt | 0}`)); tiles.push(lv);
  } else tiles.push(ctaTile(tile('Hesap aç', 'elmas ve seviye kazan', 'cta')));
  box.replaceChildren(...tiles); box.hidden = false;
  if (ACCT && !S.overRefresh) { S.overRefresh = 1; setTimeout(() => { acctCheck().then(() => { S.overRefresh = 0; if (S.screen === 'over') overMe(); }).catch(() => { S.overRefresh = 0; }); }, 2500); }
}
$('#btn-over-again').addEventListener('click', () => { S.again = true; send({ t: 'lobby' }); });
function renderOver() {
  const o = S.over;
  if (!o) return;
  $('#over-h').textContent = 'Kuşatma düştü'; $('#over-h').classList.remove('win'); $('#over-c6').textContent = 'Kaldırma'; $('#over-c7').textContent = 'Düşme';
  if (o.pvp) { renderPvpOver(o); return; }
  const mins = Math.floor((o.time || 0) / 60), secs = String((o.time || 0) % 60).padStart(2, '0');
  const parts = [`${o.wave}. dalgaya kadar dayandınız`, `${mins}:${secs} dakika`];
  if (o.theme && MAPS[o.theme]) parts.push(MAPS[o.theme].name);
  if (o.diff && DIFFS[o.diff]) parts.push(DIFFS[o.diff].name);
  $('#over-sub').textContent = parts.join(' · ');
  $('#over-record').hidden = !o.record;

  // awards: only shown when someone actually earned them
  const score = (p) => p.kills * 2 + p.dmg / 50 + p.revives * 15 - p.downs * 5;
  const best = (f, min = 1) => { let top = null; for (const p of o.P) if (f(p) >= min && (!top || f(p) > f(top))) top = p; return top; };
  const awards = [];
  const mvp = best(score, -Infinity);
  if (mvp && o.P.length > 1) awards.push(['Takımın yıldızı', mvp, `${fmt(mvp.kills)} leş, ${fmt(mvp.revives)} kaldırma`, true]);
  const k = best((p) => p.kills); if (k) awards.push(['Kasap', k, `${fmt(k.kills)} leş`]);
  const d = best((p) => p.dmg); if (d) awards.push(['Yıkıcı', d, `${fmt(d.dmg)} hasar`]);
  const r = best((p) => p.revives); if (r) awards.push(['Melek', r, `${fmt(r.revives)} kez kaldırdı`]);
  const pk = best((p) => p.picks); if (pk) awards.push(['Toplayıcı', pk, `${fmt(pk.picks)} eşya topladı`]);
  const bk = best((p) => p.bk | 0); if (bk) awards.push(['Boss avcısı', bk, `${fmt(bk.bk)} boss indirdi`]);
  const ek = best((p) => p.ek | 0); if (ek) awards.push(['Elit avcısı', ek, `${fmt(ek.ek)} elit zombi`]);
  const never = o.P.filter((p) => p.downs === 0);
  if (never.length === 1 && o.P.length > 1) awards.push(['Ölümsüz', never[0], 'Hiç düşmedi']);
  $('#over-awards').replaceChildren(...awards.map(([title, p, stat, gold]) => {
    const card = el('div', 'award' + (gold ? ' mvp' : ''));
    const name = el('b', '', p.name + (p.pid === S.me ? ' (sen)' : ''));
    name.style.color = p.color;
    card.append(el('span', 'eyebrow', title), name, el('small', '', stat));
    return card;
  }));

  const body = $('#over-body');
  body.replaceChildren();
  o.P.forEach((p, i) => {
    const tr = el('tr');
    const who = el('div', 'who'); const dot = el('span', 'dot'); dot.style.background = p.color;
    who.append(dot, el('span', '', p.name + (p.pid === S.me ? ' (sen)' : '')));
    const tdWho = el('td'); tdWho.append(who);
    tr.append(el('td', '', String(i + 1)), tdWho, el('td', '', CLASSES[p.cls].name), el('td', 'num', fmt(p.kills)), el('td', 'num', fmt(p.dmg)), el('td', 'num', fmt(p.revives || 0)), el('td', 'num', fmt(p.downs || 0)));
    body.append(tr);
  });
  overMe();
  const isHost = S.role === 'host';
  $('#btn-over-lobby').hidden = !isHost;
  $('#btn-over-again').hidden = !(isHost && S.roster && !S.roster.code);
  $('#over-note').textContent = isHost ? 'Lobiye dönünce herkes yeni oyun için sınıf seçebilir.' : 'Kurucu lobiye döndüğünde yeni oyun için hazırlanabilirsin.';
}
$('#btn-over-lobby').addEventListener('click', () => send({ t: 'lobby' }));
// ---------- a picture of the result to share: wave, map, my class and numbers, my awards and the team ----------
function resultImage() {
  const o = S.over; if (!o) return null;
  const me = (o.P || []).find((p) => p.pid === S.me) || (o.P || [])[0]; if (!me) return null;
  const W = 1080, H = 1080, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#16201a'); bg.addColorStop(1, '#0a0d0b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.75, H * 0.32, 20, W * 0.75, H * 0.32, 420); glow.addColorStop(0, 'rgba(255,107,44,.28)'); glow.addColorStop(1, 'rgba(255,107,44,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // hazard stripe and logo
  g.save(); g.beginPath(); g.rect(70, 70, 360, 14); g.clip(); for (let x = 40; x < 460; x += 28) { g.fillStyle = (x / 28) % 2 < 1 ? '#ff6b2c' : '#1d1d1d'; g.beginPath(); g.moveTo(x, 84); g.lineTo(x + 14, 70); g.lineTo(x + 28, 70); g.lineTo(x + 14, 84); g.fill(); } g.restore();
  g.fillStyle = '#ece6d6'; g.font = '900 92px Rubik, system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText('KUŞATMA', 66, 104);
  const pv = !!o.pvp, won = pv && (o.pvp.k === 'ffa' ? o.pvp.win === S.me : o.pvp.win === me.tm);
  g.fillStyle = pv ? (won ? '#ffd23f' : '#e5484d') : '#ff6b2c'; g.font = '800 34px Rubik, system-ui, sans-serif';
  g.fillText(pv ? (won ? 'ZAFER' : 'MAÇ BİTTİ') : 'KUŞATMA DÜŞTÜ', 70, 214);
  // the big number
  g.fillStyle = '#fff'; g.font = '900 210px Rubik, system-ui, sans-serif'; const big = pv ? String(me.pk | 0) : String(o.wave | 0); g.fillText(big, 62, 262);
  const bw = g.measureText(big).width; g.fillStyle = 'rgba(236,230,214,.75)'; g.font = '700 46px Rubik, system-ui, sans-serif'; g.fillText(pv ? 'leş' : '. dalga', 80 + bw, 400);
  const sub = [o.theme && MAPS[o.theme] ? MAPS[o.theme].name : '', o.diff && DIFFS[o.diff] ? DIFFS[o.diff].name : '', S.roster && S.roster.mode && MODES[S.roster.mode] ? MODES[S.roster.mode].name : '', `${Math.floor((o.time || 0) / 60)}:${String((o.time || 0) % 60).padStart(2, '0')} dk`].filter(Boolean).join('  ·  ');
  g.fillStyle = 'rgba(236,230,214,.7)'; g.font = '600 32px Rubik, system-ui, sans-serif'; g.fillText(sub, 70, 500);
  // my character
  g.save(); g.translate(W * 0.76, 330); g.scale(5.2, 5.2); try { drawCharacter(g, me.cls, me.color || '#ff8a3d', -0.5, 0, { alive: true, hat: ACCT ? ME.eq.hat : undefined, wsk: ACCT ? ME.eq.wsk : undefined, wt: me.wt | 0, wp: me.wp | 0, wb: me.wb | 0 }); } catch (e) { /* the picture still works without it */ } g.restore();
  g.textAlign = 'center'; g.fillStyle = '#ece6d6'; g.font = '800 40px Rubik, system-ui, sans-serif'; g.fillText(me.name, W * 0.76, 470); g.fillStyle = 'rgba(236,230,214,.65)'; g.font = '600 28px Rubik, system-ui, sans-serif'; g.fillText(CLASSES[me.cls] ? CLASSES[me.cls].name : '', W * 0.76, 520); g.textAlign = 'left';
  // number tiles
  const tiles = pv ? [[me.pk | 0, 'leş'], [me.dth | 0, 'ölüm'], [me.as | 0, 'asist']] : [[me.kills | 0, 'leş'], [me.dmg | 0, 'hasar'], [me.revives | 0, 'kaldırma'], [me.bk | 0, 'boss']];
  const tw = (W - 140 - (tiles.length - 1) * 20) / tiles.length;
  tiles.forEach(([v, l], i) => { const x = 70 + i * (tw + 20), y = 590; g.fillStyle = 'rgba(255,255,255,.06)'; g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.beginPath(); g.roundRect ? g.roundRect(x, y, tw, 150, 22) : g.rect(x, y, tw, 150); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 64px Rubik, system-ui, sans-serif'; g.fillText(fmt(v), x + 26, y + 26); g.fillStyle = 'rgba(236,230,214,.65)'; g.font = '600 28px Rubik, system-ui, sans-serif'; g.fillText(l, x + 28, y + 104); });
  // my awards and the team
  const mine = [...$('#over-awards').querySelectorAll('.award')].filter((c) => /\(sen\)/.test(c.querySelector('b') ? c.querySelector('b').textContent : '')).map((c) => c.querySelector('.eyebrow').textContent);
  let y = 790;
  if (mine.length) { g.fillStyle = '#ffd23f'; g.font = '800 34px Rubik, system-ui, sans-serif'; g.fillText('★ ' + mine.slice(0, 3).join('  ·  '), 70, y); y += 60; }
  const team = (o.P || []).filter((p) => p.pid !== me.pid).map((p) => p.name);
  if (team.length) { g.fillStyle = 'rgba(236,230,214,.7)'; g.font = '600 30px Rubik, system-ui, sans-serif'; let t = 'Takım: ' + team.join(', '); while (g.measureText(t).width > W - 140 && t.length > 10) t = t.slice(0, -2); if (t !== 'Takım: ' + team.join(', ')) t += '…'; g.fillText(t, 70, y); }
  g.fillStyle = 'rgba(236,230,214,.5)'; g.font = '600 26px Rubik, system-ui, sans-serif'; g.fillText(new Date().toLocaleDateString('tr', { day: 'numeric', month: 'long', year: 'numeric' }), 70, H - 90);
  g.textAlign = 'right'; g.fillStyle = '#ff6b2c'; g.font = '800 30px Rubik, system-ui, sans-serif'; g.fillText('umvtt.github.io/kusatma', W - 70, H - 92); g.textAlign = 'left';
  return cv;
}
let shareBlob = null, shareUrl = '';
$('#btn-over-share').addEventListener('click', () => {
  const cv = resultImage(); if (!cv) return;
  cv.toBlob((b) => {
    if (!b) { toast('Resim oluşturulamadı.', 'bad'); return; }
    shareBlob = b; if (shareUrl) URL.revokeObjectURL(shareUrl); shareUrl = URL.createObjectURL(b);
    $('#share-img').src = shareUrl; $('#share-dl').href = shareUrl;
    const file = new File([b], 'kusatma-sonuc.png', { type: 'image/png' });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('#share-go').hidden = !canShare;
    $('#share-dl').hidden = !!window.KusatmaApp;
    $('#share-note').textContent = window.KusatmaApp && !canShare ? 'Uygulamada resmi kaydetmek için ekran görüntüsü al.' : canShare ? 'Paylaş ile doğrudan gönderebilir ya da İndir ile kaydedebilirsin.' : 'İndir ile kaydet, sonra istediğin yerde paylaş.';
    $('#share-dlg').hidden = false;
  }, 'image/png');
});
$('#share-go').addEventListener('click', async () => {
  if (!shareBlob) return;
  const file = new File([shareBlob], 'kusatma-sonuc.png', { type: 'image/png' });
  try { await navigator.share({ files: [file], title: 'Kuşatma', text: 'Kuşatma\'da ne kadar dayandım, sen de dene: https://umvtt.github.io/kusatma/' }); } catch (e) { /* closed */ }
});
$('#share-close').addEventListener('click', () => { $('#share-dlg').hidden = true; });
// ---------- PvP: score bar, respawn screen, kill feed, round banners and the end screen ----------
function pvpHud(g) {
  const bar = $('#pvp-bar'), rs = $('#pvp-resp');
  if (!g.pv) { if (!bar.hidden) bar.hidden = true; if (!rs.hidden) rs.hidden = true; return; }
  const [k, t, s0, s1, r0, r1] = g.pv, P = PVP[k] || PVP.tdm, mm = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const side = (n, i, label) => { const d = el('div', 'pv-side t' + i); d.append(el('span', '', label), el('strong', '', String(n))); return d; };
  let sig;
  if (k === 'ffa') {
    const L = [...g.ps.entries()].sort((a, b) => b[1].pk - a[1].pk), top = L[0];
    const lead = top ? (top[0] === S.me ? 'Sen öndesin' : `${g.nameOf(top[0])}: ${top[1].pk | 0}`) : '';
    sig = ['f', g.self.pk, lead, mm].join('|');
    if (bar.dataset.sig !== sig) { bar.dataset.sig = sig; const mid = el('div', 'pv-mid'); mid.append(el('strong', '', mm), el('span', '', `${P.goal} leşe ilk ulaşan kazanır`)); bar.replaceChildren(side(g.self.pk | 0, 0, 'Sen'), mid, side(top ? top[1].pk | 0 : 0, 1, top && top[0] !== S.me ? g.nameOf(top[0]) : 'Lider')); bar.title = lead; }
  } else if (k === 'duel') {
    sig = ['d', r0, r1, mm].join('|');
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      const mine = g.self.tm | 0, dots = (n) => { const d = el('div', 'pv-dots'); for (let i = 0; i < P.goal; i++) d.append(el('i', i < n ? 'on' : '')); return d; };
      const a = side(mine ? r1 : r0, 0, 'Sen'), b = side(mine ? r0 : r1, 1, 'Rakip'); a.append(dots(mine ? r1 : r0)); b.append(dots(mine ? r0 : r1));
      const mid = el('div', 'pv-mid'); mid.append(el('strong', '', mm), el('span', '', `Raunt ${g.pv[6] || 1}`)); bar.replaceChildren(a, mid, b);
    }
  } else {
    sig = ['t', s0, s1, mm, g.self.tm].join('|');
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      const mid = el('div', 'pv-mid'); mid.append(el('strong', '', mm), el('span', '', `${P.goal} leşe ilk ulaşan`));
      const a = side(s0, 0, TEAM_NAME[0] + (g.self.tm === 0 ? ' (sen)' : '')), b = side(s1, 1, TEAM_NAME[1] + (g.self.tm === 1 ? ' (sen)' : ''));
      const prog = (n, i) => { const q = el('div', 'pv-prog t' + i); const f = el('i'); f.style.width = Math.min(100, 100 * n / P.goal) + '%'; q.append(f); return q; };
      a.append(prog(s0, 0)); b.append(prog(s1, 1));
      bar.replaceChildren(a, mid, b);
    }
  }
  if (bar.hidden) bar.hidden = false;
  // dead: who did it, when you come back
  const dead = g.self.inGame && !g.self.alive && g.phase === 'combat';
  if (rs.hidden !== !dead) rs.hidden = !dead;
  if (dead) {
    const by = g.deathBy && g.deathBy !== S.me ? `${g.nameOf(g.deathBy)} (${(CLASSES[g.clsOf(g.deathBy)] || {}).name || ''}) seni indirdi` : 'İndin';
    if ($('#pvp-resp-by').textContent !== by) $('#pvp-resp-by').textContent = by;
    const tt = k === 'duel' ? 'Raunt bitti' : g.self.resp > 0 ? `${Math.ceil(g.self.resp)} sn` : 'Doğuyorsun…';
    if ($('#pvp-resp-t').textContent !== tt) $('#pvp-resp-t').textContent = tt;
    const tip = k === 'duel' ? '' : `${fmt(g.self.gold)} altının var: beklerken cephanelikten alışveriş yapabilirsin.`;
    if ($('#pvp-resp-tip').textContent !== tip) $('#pvp-resp-tip').textContent = tip;
  }
}
const PV_TAG = { 9: 'kılıç', 7: 'ateş', 5: 'zehir', 6: 'şimşek', 4: 'buz', 3: 'delici' };
function pvpNotice(n) {
  const g = S.game;
  if (!g) return;
  if (n.k === 'pvk') {
    const box = $('#kfeed');
    const li = el('li', (n.att === S.me || n.vic === S.me ? 'me' : '') + ' pv');
    const nm = (pid) => { const b = el('b', '', pid === S.me ? 'Sen' : pid ? g.nameOf(pid) : 'Dünya'); const p = g.ps.get(pid); if (p && g.pv && g.pv[0] !== 'ffa') b.style.color = TEAM_COL[p.tm | 0]; else if (pid && pid !== S.me) b.style.color = '#ff7b7f'; return b; };
    li.append(nm(n.att), el('span', 'kf-x', PV_TAG[n.tag] ? `› ${PV_TAG[n.tag]} ›` : '›'), nm(n.vic));
    box.prepend(li);
    while (box.children.length > (IS_TOUCH ? 3 : 5)) box.lastChild.remove();
    setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 400); }, 4500);
    if (n.vic === S.me) buzz([120, 60, 180], true);
    if (n.att === S.me && n.vic !== S.me) buzz(40);
    return;
  }
  const k = g.pv ? g.pv[0] : 'tdm', P = PVP[k] || PVP.tdm;
  if (n.k === 'pvw') banner(n.round ? `Raunt ${n.round + 1}` : P.name, 'Hazırlık', n.round ? 'Silahını yenile, sonra tekrar.' : 'Cephanelikten silahını ve yolunu seç. Süre bitince savaş başlar.');
  else if (n.k === 'pvf') { banner('Savaş!', k === 'duel' ? `Raunt ${n.round}` : P.name, k === 'tdm' ? `${P.goal} leşe ilk ulaşan takım kazanır.` : k === 'ffa' ? `${P.goal} leşi ilk yapan kazanır.` : 'Rakibini indir.'); buzz([60, 40, 60]); }
  else if (n.k === 'pvr') {
    const mine = g.self.tm | 0, won = n.win === mine, draw = n.win < 0;
    banner(draw ? 'Berabere' : won ? 'Raundu aldın' : 'Raundu kaybettin', `${mine ? n.r1 : n.r0} – ${mine ? n.r0 : n.r1}`, draw ? 'Kimse kazanamadı, raunt tekrar.' : '');
  }
}
function renderPvpOver(o) {
  const v = o.pvp, me = o.P.find((p) => p.pid === S.me), P = PVP[v.k] || PVP.tdm;
  const won = v.k === 'ffa' ? v.win === S.me : me && v.win === me.tm, draw = v.win === -1;
  const mins = Math.floor((o.time || 0) / 60), secs = String((o.time || 0) % 60).padStart(2, '0');
  const score = v.k === 'tdm' ? `${v.score[0]} – ${v.score[1]}` : v.k === 'duel' ? `${v.rounds[0]} – ${v.rounds[1]}` : '';
  $('#over-h').textContent = draw ? 'Berabere' : won ? 'Zafer!' : 'Yenilgi'; $('#over-h').classList.toggle('win', !!won); $('#over-c6').textContent = 'Asist'; $('#over-c7').textContent = 'Ölüm';
  $('#over-sub').textContent = [draw ? 'Berabere' : won ? 'Kazandın!' : 'Kaybettin', P.name, score, `${mins}:${secs}`, MAPS[o.theme] ? MAPS[o.theme].name : ''].filter(Boolean).join(' · ');
  $('#over-record').hidden = true;
  const best = (f) => { let t = null; for (const p of o.P) if (f(p) > 0 && (!t || f(p) > f(t))) t = p; return t; };
  const awards = [];
  const mvp = best((p) => p.pk * 3 + p.as + p.dmg / 400 - p.dth);
  if (mvp) awards.push(['Maçın yıldızı', mvp, `${mvp.pk} leş, ${mvp.as} asist`, true]);
  const st = best((p) => p.best); if (st && st.best >= 3) awards.push(['Seri katil', st, `${st.best} leş üst üste`]);
  const d = best((p) => p.dmg); if (d) awards.push(['Yıkıcı', d, `${fmt(d.dmg)} hasar`]);
  $('#over-awards').replaceChildren(...awards.map(([title, p, s2, gold]) => { const c = el('div', 'award' + (gold ? ' mvp' : '')); const nm = el('b', '', p.name + (p.pid === S.me ? ' (sen)' : '')); nm.style.color = v.k === 'ffa' ? p.color : TEAM_COL[p.tm]; c.append(el('span', 'eyebrow', title), nm, el('small', '', s2)); return c; }));
  const body = $('#over-body');
  body.replaceChildren();
  o.P.forEach((p, i) => {
    const tr = el('tr'), who = el('div', 'who'), dot = el('span', 'dot');
    dot.style.background = v.k === 'ffa' ? p.color : TEAM_COL[p.tm];
    who.append(dot, el('span', '', p.name + (p.pid === S.me ? ' (sen)' : '')));
    const td = el('td'); td.append(who);
    tr.append(el('td', '', String(i + 1)), td, el('td', '', (CLASSES[p.cls] || {}).name || ''), el('td', 'num', String(p.pk)), el('td', 'num', fmt(p.dmg)), el('td', 'num', String(p.as)), el('td', 'num', String(p.dth)));
    body.append(tr);
  });
  const box = $('#over-me');
  if (box && me) {
    const tile = (val, l, cls) => { const t = el('div', 'om-t' + (cls ? ' ' + cls : '')); t.append(el('strong', '', val), el('span', '', l)); return t; };
    const tiles = [tile(won ? 'Zafer' : draw ? 'Berabere' : 'Yenilgi', P.name, won ? 'gem' : ''), tile(String(me.pk), 'leş'), tile(String(me.dth), 'ölüm'), tile(String(me.as), 'asist')];
    const rk = S.pvpRank;
    if (ACCT && rk) { const L = league(rk.rp), t = el('div', 'om-t om-lv'), b = el('div', 'xpbar'), f = el('i'); f.style.width = Math.round(100 * L.pct) + '%'; f.style.background = L.c; b.append(f); t.append(el('strong', '', `${L.name} ${rk.d > 0 ? '+' : ''}${rk.d} puan`), b, el('span', '', `${rk.rp} puan${rk.up ? ' · yükseldin!' : ''}`)); tiles.push(t); }
    else if (ACCT) tiles.push(tile('…', 'dereceli puan hesaplanıyor'));
    else tiles.push(ctaTile(tile('Hesap aç', 'dereceli lige gir', 'cta')));
    box.replaceChildren(...tiles); box.hidden = false;
  }
  const isHost = S.role === 'host';
  $('#btn-over-lobby').hidden = !isHost;
  $('#btn-over-again').hidden = true;
  $('#over-note').textContent = isHost ? 'Lobiye dönünce takımlar ve sınıflar yeniden seçilir.' : 'Kurucu lobiye döndüğünde rövanş için hazırlanabilirsin.';
}

export { PV_TAG, ctaTile, overMe, pvpHud, pvpNotice, renderOver, renderPvpOver, resultImage, shareBlob, shareUrl };
