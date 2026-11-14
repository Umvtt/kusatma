// Optional accounts: the sign-in page, account state on the page, the signed-in dashboard glue and the connection test.
import { DIFFS, BUILD, MAX_PLAYERS } from './config.js';
import { drawCharacter } from './render.js';
import { dashInit, dashShow, dashRefresh } from './dash.js';
import { ACCT, liveBlock, acctSign, acctOut, diagRun } from './live.js';
import { $, S, actToast, ask, el, toast } from './app.js';
import { NAME_OK, createRoom,  joinRoom, quickPlay, sceneGo } from './main.js';
import { roomDlg } from './lobby.js';
import { openSettings } from './esc.js';

// ---------- optional accounts and the leaderboard ----------
const TAKEN = 'Bu ad bir hesaba ait. Giriş yap ya da başka bir ad seç.';
const ACCT_WHY = { name: 'Ad en az 6, en fazla 16 karakter olmalı.', chars: 'Ad 6–16 karakter olmalı; sadece İngilizce harf (A-Z) ve rakam.', pw: 'Şifre en az 6 karakter olmalı.', taken: 'Bu ad alınmış. Başka bir ad dene.', wrong: 'Ad ya da şifre yanlış.',
  slow: 'Çok fazla deneme oldu. Birkaç dakika bekleyip tekrar dene.', ban: 'Bu hesap engellendi.', net: 'Sunucuya ulaşılamadı. İnternetini kontrol et.' };
// ban or maintenance: its own notice that always shows the current state
function blockUi() { const t = liveBlock(); for (const id of ['#menu-block', '#dp-block']) { const m = $(id); m.hidden = !t; m.textContent = t; } }
function acctUi() {
  blockUi();
  dpShow();
  $('#acct-txt').textContent = ACCT ? `Giriş yapıldı: ${ACCT.name}` : 'Hesap isteğe bağlı';
  $('#menu-promo').hidden = !!ACCT;
  const ab = $('#btn-acct'); if (ACCT) ab.textContent = 'Çıkış yap'; else ab.replaceChildren(el('span', 'lbl-long', 'Giriş yap / Hesap oluştur'), el('span', 'lbl-short', 'Giriş / Kayıt'));
  $('#name').readOnly = !!ACCT;
  if (ACCT) $('#name').value = ACCT.name;
}
// ---------- sign in / sign up: a page of its own ----------
const AUTH = { m: 'login', busy: false };
function acctMsg(t, info) { const m = $('#acct-msg'); m.hidden = !t; m.textContent = t || ''; m.classList.toggle('info', !!info); }
function pwScore(pw) {
  if (pw.length < 6) return 0;
  let k = 1;
  if (pw.length >= 10) k++;
  if (/[a-zçğıöşü]/.test(pw) && /[A-ZÇĞİÖŞÜ]/.test(pw)) k++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) k++; else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) k += 0.5;
  if (/^(.)\1+$/.test(pw) || /^(123456|password|qwerty|sifre|şifre)/i.test(pw)) k = 1;
  return Math.min(4, Math.round(k));
}
function authCheck() {
  const reg = AUTH.m === 'reg', name = $('#acct-name').value, pw = $('#acct-pw').value, pw2 = $('#acct-pw2').value;
  $('#auth-count').textContent = `${name.length}/16`;
  const len = name.length >= 6 && name.length <= 16, chr = /^[A-Za-z0-9]*$/.test(name) && name.length > 0;
  for (const [r, okv] of [['len', len], ['chr', chr]]) { const li = $(`#auth-rules [data-r="${r}"]`); li.classList.toggle('ok', okv); li.classList.toggle('bad', !!name && !okv); }
  const sc = pwScore(pw), words = ['En az 6 karakter', 'Zayıf', 'İdare eder', 'Güçlü', 'Çok güçlü'];
  $('#auth-meter').dataset.s = String(pw ? sc : -1); $('#auth-meter-t').textContent = pw ? words[sc] : words[0];
  const same = !!pw2 && pw2 === pw; $('#auth-pw2-row').classList.toggle('ok', same); $('#auth-pw2-row').classList.toggle('bad', !!pw2 && !same && pw2.length >= pw.length);
  const ready = reg ? len && chr && pw.length >= 6 && same : name.trim().length > 0 && pw.length > 0;
  $(reg ? '#acct-reg' : '#acct-login').classList.toggle('ready', ready);
  return ready;
}
function authMode(m) {
  AUTH.m = m === 'reg' ? 'reg' : 'login';
  const reg = AUTH.m === 'reg', page = $('#acct-dlg');
  page.dataset.m = AUTH.m;
  for (const b of page.querySelectorAll('.auth-seg [data-m]')) { const on = b.dataset.m === AUTH.m; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  $('#auth-h').textContent = reg ? 'Aramıza katıl' : 'Tekrar hoş geldin';
  $('#auth-sub').textContent = reg ? 'Bir ad ve şifre seç. Adın sana ayrılır, ilerlemen her cihazda seninle.' : 'Hesabına gir, kaldığın yerden devam et.';
  $('#acct-login').hidden = reg; $('#acct-reg').hidden = !reg;
  $('#auth-rules').hidden = !reg; $('#auth-meter').hidden = !reg; $('#auth-pw2-row').hidden = !reg; $('#auth-count').hidden = !reg;
  $('#acct-pw').autocomplete = reg ? 'new-password' : 'current-password';
  const alt = $('#auth-alt'); alt.replaceChildren(document.createTextNode(reg ? 'Zaten hesabın var mı? ' : 'Hesabın yok mu? '));
  const sw = el('button', '', reg ? 'Giriş yap' : 'Hemen oluştur'); sw.type = 'button'; sw.onclick = () => { authMode(reg ? 'login' : 'reg'); $('#acct-name').focus(); }; alt.append(sw);
  acctMsg(''); authCheck();
}
function authOpen(m) {
  const page = $('#acct-dlg');
  $('#acct-name').value = ($('#name').value || '').trim().slice(0, 16); $('#acct-pw').value = ''; $('#acct-pw2').value = '';
  let had = false; try { had = !!localStorage.getItem('kusatma-giris'); } catch (e) { /* ignore */ }
  authMode(m || (had ? 'login' : 'reg'));
  page.hidden = false; page.classList.remove('out'); document.body.classList.add('authing');
  try { if (!history.state || !history.state.auth) history.pushState({ auth: 1 }, ''); } catch (e) { /* ignore */ }
  authSquad();
  setTimeout(() => ($('#acct-name').value ? $('#acct-pw') : $('#acct-name')).focus({ preventScroll: true }), 60);
}
function authClose(fromPop) {
  const page = $('#acct-dlg'); if (page.hidden) return;
  page.classList.add('out'); document.body.classList.remove('authing');
  setTimeout(() => { page.hidden = true; page.classList.remove('out'); }, 220);
  if (!fromPop) { try { if (history.state && history.state.auth) history.back(); } catch (e) { /* ignore */ } }
}
addEventListener('popstate', () => { if (!$('#acct-dlg').hidden) authClose(true); });
// a few of the classes standing together under the logo
function authSquad() {
  const cv = $('#auth-squad'); if (!cv || cv.dataset.done) return; cv.dataset.done = '1';
  const g = cv.getContext('2d'), L = [['kalkanci', '#4cc9f0'], ['asker', '#ff8a3d'], ['doktor', '#43d17a'], ['tesla', '#9ad8ff'], ['nisanci', '#f15bb5']];
  L.forEach(([c, col], i) => { g.save(); g.translate(40 + i * 70, 74); g.scale(1.9, 1.9); try { drawCharacter(g, c, col, -Math.PI / 2 + (i - 2) * 0.12, 0, { alive: true }); } catch (e) { /* ignore */ } g.restore(); });
}
$('#btn-acct').onclick = () => {
  if (ACCT) { ask('Çıkış yap', 'Bu cihazda hesabından çıkılsın mı? İstediğin zaman tekrar girebilirsin.', 'Çıkış yap', async () => { await acctOut(); acctUi(); }); return; }
  authOpen();
};
$('#acct-close').onclick = () => authClose();
$('#auth-guest').onclick = () => authClose();
for (const b of document.querySelectorAll('#acct-dlg .auth-seg [data-m]')) b.onclick = () => { authMode(b.dataset.m); $('#acct-name').focus(); };
$('#acct-dlg .auth-seg').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { authMode(AUTH.m === 'reg' ? 'login' : 'reg'); $(`#auth-t-${AUTH.m}`).focus(); } });
$('#acct-dlg').addEventListener('keydown', (e) => { if (e.key === 'Escape') authClose(); });
for (const id of ['#acct-name', '#acct-pw', '#acct-pw2']) $(id).addEventListener('input', () => { if (!$('#acct-msg').classList.contains('info')) acctMsg(''); authCheck(); });
$('#acct-name').addEventListener('input', () => { const i = $('#acct-name'); if (AUTH.m === 'reg') { const v = i.value.replace(/[^A-Za-z0-9]/g, ''); if (v !== i.value) { i.value = v; authCheck(); const r = $('#auth-rules [data-r="chr"]'); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); } } });
$('#auth-eye').onclick = () => { const on = $('#acct-pw').type === 'password'; for (const id of ['#acct-pw', '#acct-pw2']) $(id).type = on ? 'text' : 'password'; $('#auth-eye').setAttribute('aria-pressed', String(on)); $('#auth-eye').setAttribute('aria-label', on ? 'Şifreyi gizle' : 'Şifreyi göster'); };
function authShake() { const c = $('#auth-form'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
async function acctGo(op) {
  if (AUTH.busy) return;
  const name = $('#acct-name').value.trim(), pw = $('#acct-pw').value;
  if (op === 'reg') {
    if (!NAME_OK.test(name)) { acctMsg(name.length < 6 || name.length > 16 ? ACCT_WHY.name : ACCT_WHY.chars); authShake(); $('#acct-name').focus(); return; }
    if (pw.length < 6) { acctMsg(ACCT_WHY.pw); authShake(); $('#acct-pw').focus(); return; }
    if ($('#acct-pw2').value !== pw) { acctMsg('Şifreler aynı değil.'); authShake(); $('#acct-pw2').focus(); return; }
  } else if (!name || !pw) { acctMsg('Adını ve şifreni yaz.'); authShake(); return; }
  const go = $(op === 'reg' ? '#acct-reg' : '#acct-login');
  AUTH.busy = true; go.classList.add('busy'); go.disabled = true; acctMsg('');
  const j = await acctSign(op, name, pw);
  AUTH.busy = false; go.classList.remove('busy'); go.disabled = false;
  if (!j.ok) { acctMsg(ACCT_WHY[j.reason] || 'Bir sorun oldu. Tekrar dene.'); authShake(); return; }
  try { localStorage.setItem('kusatma-giris', '1'); } catch (e) { /* ignore */ }
  go.classList.add('done');
  setTimeout(() => { go.classList.remove('done'); authClose(); acctUi(); toast(op === 'reg' ? `Hesabın oluşturuldu. Hoş geldin, ${j.name}!` : `Hoş geldin, ${j.name}!`, 'good'); }, 420);
}
// the keyboard's Go/Enter submits through the first submit button, even a hidden one: always use the open mode
$('#auth-form').addEventListener('submit', (e) => { e.preventDefault(); acctGo(AUTH.m === 'reg' ? 'reg' : 'login'); });
// ---------- the signed-in player's full-page panel (js/dash.js) ----------
function dpShow() {
  const on = !!ACCT; document.body.classList.toggle('signed', on); $('#dashpage').hidden = !on;
  dashShow(on);
  if (!on && sceneGo) sceneGo();
}
function roomItems(rooms, max) {
  if (!rooms) return [el('li', 'empty', 'Odalar yüklenemedi.')];
  if (!rooms.length) return [el('li', 'empty', 'Şu an açık oda yok. Bir oda kur, burada görünsün.')];
  return rooms.slice(0, max).map((r) => {
    const li = el('li'), b = el('button', 'btn small', 'Katıl'); b.type = 'button';
    b.onclick = () => { $('#code').value = r.code; joinRoom(); };
    li.append(el('span', 'rc', r.code), el('span', 'rh', r.rn || r.name), el('span', 'rm', `${r.rn ? r.name + ' · ' : ''}${r.n}/${r.mx || MAX_PLAYERS} · ${r.st === 'lobby' ? 'lobide' : `${r.wave}. dalga`}${r.diff ? ' · ' + ((DIFFS[r.diff] || {}).name || '') : ''}`), b);
    if (r.n >= (r.mx || MAX_PLAYERS)) { b.disabled = true; b.textContent = 'Dolu'; }
    return li;
  });
}
dashInit({
  toast, ask, roomItems, actToast,
  inGame: () => !!S.net,
  solo: () => createRoom(true),
  quick: () => quickPlay(),
  daily: () => createRoom(true, { mode: 'daily' }),
  roomDlg: () => roomDlg(),
  join: (code) => { $('#code').value = code; joinRoom(); },
  openSettings: () => openSettings(),
  openDiag: () => openDiag(),
  signOut: () => $('#btn-acct').click(),
  signedOut: async () => { await acctOut(); acctUi(); },
  refresh: () => { acctUi(); dashRefresh(); },
});
// ---------- connection test ----------
let diagText = '';
async function openDiag() {
  $('#settings').hidden = true; $('#diag-dlg').hidden = false;
  $('#diag-copy').disabled = true; $('#diag-again').disabled = true; $('#diag-sum').textContent = 'Test ediliyor…';
  const list = $('#diag-list'); list.replaceChildren();
  const ICON = { ok: '✓', bad: '✕', warn: '!' };
  const draw = (rows) => {
    list.replaceChildren(...rows.map((r) => { const li = el('li', r.s); li.append(el('span', 'ic', ICON[r.s] || ''), el('span', '', r.t), el('span', 'dv', r.v)); return li; }));
    const run = el('li', 'run'); run.append(el('span', 'ic'), el('span', 'dt', 'Sıradaki kontrol…'), el('span', 'dv', '')); list.append(run);
  };
  const rows = await diagRun(draw);
  list.replaceChildren(...rows.map((r) => { const li = el('li', r.s); li.append(el('span', 'ic', ICON[r.s] || ''), el('span', '', r.t), el('span', 'dv', r.v)); return li; }));
  const bad = rows.filter((r) => r.s === 'bad'), apiOk = rows.some((r) => r.k.startsWith('api') && r.s === 'ok');
  $('#diag-sum').textContent = !bad.length ? 'Her şey çalışıyor.'
    : !apiOk ? 'Sunuculara ulaşılamıyor. İnternetini ya da ağının engellerini kontrol et; okul ağındaysan okul aynasını dene.'
    : bad.some((r) => r.k === 'peer') ? 'Oda servisine ulaşılamıyor; oda kurup katılmak çalışmayabilir.'
    : bad.some((r) => r.k === 'turn') && rows.some((r) => r.k === 'stun' && r.s !== 'ok') ? 'Ağın hem doğrudan bağlantıyı hem aktarmayı engelliyor; başka bir ağdan dene.'
    : 'Sunuculardan biri yanıt vermedi ama diğerleri çalışıyor, oyun yedek adresi kullanır.';
  diagText = `Kuşatma bağlantı testi · Yapı ${BUILD} · ${new Date().toLocaleString('tr')}\n` + rows.map((r) => `${ICON[r.s] || '·'} ${r.t}: ${r.v}`).join('\n') + `\n${navigator.userAgent}`;
  $('#diag-copy').disabled = false; $('#diag-again').disabled = false;
}
$('#settings-diag').onclick = openDiag;
$('#diag-again').onclick = openDiag;
$('#diag-close').onclick = () => { $('#diag-dlg').hidden = true; };
$('#diag-copy').onclick = async () => { try { await navigator.clipboard.writeText(diagText); toast('Rapor kopyalandı', 'good'); } catch (e) { toast('Kopyalanamadı', 'bad'); } };

export { ACCT_WHY, AUTH, TAKEN, acctGo, acctMsg, acctUi, authCheck, authClose, authMode, authOpen, authShake, authSquad, blockUi, diagText, dpShow, openDiag, pwScore, roomItems };
