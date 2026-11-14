// The Esc menu (pauses solo games) and the settings dialog.
import { MAPS, DIFFS, MODES, MAX_PLAYERS, CLASSES } from './config.js';
import { gemIcon } from './dash.js';
import * as sfx from './sfx.js';
import { SETTINGS } from './settings.js';
import { LIVE, ACCT, ME } from './live.js';
import { $, IS_TOUCH, S, el, zoom } from './app.js';
import { aimSync, online, qSync, saverSync, send, setMute } from './main.js';
import { openChat } from './chat.js';
import { openDiag } from './acct.js';

// ---------- Esc menu (pauses solo games) ----------
function openEsc() {
  if (!S.game) return;
  const solo = S.role === 'host' && S.roster && !S.roster.code;
  $('#esc-eyebrow').textContent = solo ? 'Duraklatıldı' : 'Menü';
  $('#esc-title').textContent = solo ? 'Oyun durdu' : 'Oyun sürüyor';
  $('#esc-note').textContent = solo ? 'Zombiler de bekliyor. Hazır olduğunda devam et.' : 'Çok oyunculu oyunda oyun arka planda devam eder. Dikkatli ol.';
  $('#esc-leave').textContent = solo ? 'Ana menüye dön' : 'Odadan ayrıl';
  const code = S.roster && S.roster.code;
  $('#esc-code').hidden = !code;
  if (code) $('#esc-code-val').textContent = code;
  $('#esc-mute').textContent = sfx.isMuted() ? 'Sesi aç' : 'Sesi kapat';
  S.game.input.keys.clear(); S.game.input.down = false;
  leaveArm = 0; $('#esc-leave').classList.remove('danger');
  $('#esc').hidden = false; document.body.classList.add('esc-open');
  escFill(); clearInterval(escTimer); escTimer = setInterval(() => { if ($('#esc').hidden) clearInterval(escTimer); else escFill(); }, 1000);
  if (solo) { S.game.paused = true; send({ t: 'pause', on: true }); }
  document.body.classList.remove('playing');
  $('#esc-resume').focus();
}
function closeEsc(silent) {
  if ($('#esc').hidden) return;
  $('#esc').hidden = true; document.body.classList.remove('esc-open');
  if (S.game && S.game.paused) { S.game.paused = false; if (!silent) send({ t: 'pause', on: false }); }
  if (S.screen === 'game') document.body.classList.add('playing');
}
$('#esc-resume').addEventListener('click', () => closeEsc());
$('#esc-copy').addEventListener('click', async () => {
  const code = S.roster && S.roster.code;
  if (!code) return;
  const b = $('#esc-copy');
  try { await navigator.clipboard.writeText(code); b.textContent = 'Kopyalandı'; }
  catch (e) {
    const range = document.createRange(); range.selectNodeContents($('#esc-code-val'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    b.textContent = 'Seçildi, kopyala';
  }
  setTimeout(() => { b.textContent = 'Kodu kopyala'; }, 1800);
});
$('#esc-mute').addEventListener('click', () => { setMute(sfx.toggleMute()); $('#esc-mute').textContent = sfx.isMuted() ? 'Sesi aç' : 'Sesi kapat'; });
// leaving asks once more so nobody leaves by accident
let leaveArm = 0, escTimer = 0;
$('#esc-leave').addEventListener('click', () => {
  const b = $('#esc-leave');
  if (!leaveArm || Date.now() - leaveArm > 4000) { leaveArm = Date.now(); b.dataset.t = b.textContent; b.textContent = 'Emin misin? Tekrar bas'; b.classList.add('danger'); setTimeout(() => { if (leaveArm && Date.now() - leaveArm >= 3900) { leaveArm = 0; b.textContent = b.dataset.t; b.classList.remove('danger'); } }, 4000); return; }
  leaveArm = 0; b.textContent = b.dataset.t || b.textContent; b.classList.remove('danger');
  closeEsc(); $('#btn-leave').click();
});
const tile = (v, l) => { const d = el('div', 'esc-tile'); d.append(el('b', '', String(v)), el('span', '', l)); return d; };
function escFill() {
  const g = S.game, r = S.roster; if (!g) return;
  const me = (r && r.players.find((p) => p.pid === S.me)) || {};
  const tags = [];
  if (r) {
    tags.push((MODES[r.mode] || MODES.normal).name, MAPS[r.theme || r.map] ? MAPS[r.theme || r.map].name : 'Rastgele', (DIFFS[r.diff] || {}).name || '', `${r.players.length}/${r.max || MAX_PLAYERS} oyuncu`);
    if (S.roomName) tags.unshift(S.roomName);
  }
  $('#esc-room').replaceChildren(...tags.filter(Boolean).map((t) => el('span', 'chip-tag', t)));
  const sec = $('#esc-me-sec'); sec.hidden = !ACCT;
  if (ACCT) {
    const cap = (LIVE.shop && LIVE.shop.cap) || 1000, left = Math.max(0, cap - (ME.gd | 0));
    const gem = el('div', 'esc-tile'); const gb = el('b'); gb.append(gemIcon(16), document.createTextNode(' ' + (ME.gems | 0).toLocaleString('tr'))); gem.append(gb, el('span', '', 'elmas'));
    const lv = el('div', 'esc-tile wide'); const bar = el('div', 'esc-xp'); const f = el('i'); f.style.width = Math.round(100 * ME.lx / Math.max(1, ME.ln)) + '%'; bar.append(f);
    lv.append(el('b', '', `Seviye ${ME.lvl}`), bar, el('span', '', `${(ME.lx | 0).toLocaleString('tr')} / ${(ME.ln | 0).toLocaleString('tr')} XP`));
    $('#esc-me').replaceChildren(gem, tile('+' + (S.gameGems | 0), 'bu oyunda elmas'), tile(left.toLocaleString('tr'), 'bugün kalan elmas'), tile(ME.spt | 0, 'sezon kademesi'), lv);
  }
  let best = 0; try { best = Number(localStorage.getItem('kusatma-rekor')) || 0; } catch (e) { /* ignore */ }
  const mins = Math.floor((g.time || 0) / 60), secs = Math.floor((g.time || 0) % 60);
  $('#esc-stats').replaceChildren(tile(g.wave || 0, 'dalga'), tile((g.self.kills | 0).toLocaleString('tr'), 'leş'), tile((g.self.gold | 0).toLocaleString('tr'), 'altın'), tile(`${mins}:${String(secs).padStart(2, '0')}`, 'süre'), tile(Math.max(best, g.wave || 0), 'en iyi dalgan'), tile(CLASSES[me.cls || g.cls] ? CLASSES[me.cls || g.cls].name : '', 'sınıf'));
  $('#esc-invite').hidden = !(ACCT && r && r.code && online());
  $('#esc-chat').hidden = !(r && r.code);
  $('#esc-diag').hidden = !(r && r.code);
}
$('#esc-invite').addEventListener('click', () => { closeEsc(); $('#btn-invite').click(); });
$('#esc-chat').addEventListener('click', () => { closeEsc(); openChat(); });
$('#esc-diag').addEventListener('click', () => { openDiag(); });
// ---------- settings dialog ----------
function openSettings() {
  $('#set-volume').value = SETTINGS.volume;
  $('#set-music').value = SETTINGS.music;
  $('#set-darkness').value = SETTINGS.darkness;
  $('#set-zoom').value = Math.round(zoom * 100);
  $('#set-shake').checked = SETTINGS.shake;
  $('#set-dmgnums').checked = SETTINGS.dmgNums;
  $('#set-lead').checked = SETTINGS.lead;
  $('#set-fps').checked = SETTINGS.fps;
  $('#set-vibe').checked = SETTINGS.vibe;
  $('#set-vibe-row').hidden = !IS_TOUCH || (!('vibrate' in navigator) && !window.KusatmaApp);
  $('#set-aim-row').hidden = !IS_TOUCH;
  qSync(); aimSync(); saverSync();
  syncSettingsLabels();
  $('#settings').hidden = false;
  $('#settings-close').focus();
}
function syncSettingsLabels() {
  $('#set-volume-out').textContent = `%${$('#set-volume').value}`;
  $('#set-music-out').textContent = +$('#set-music').value ? `%${$('#set-music').value}` : 'Kapalı';
  $('#set-darkness-out').textContent = `%${$('#set-darkness').value}`;
  $('#set-zoom-out').textContent = `%${$('#set-zoom').value}`;
}
$('#btn-settings').addEventListener('click', openSettings);

export { closeEsc, escFill, escTimer, leaveArm, openEsc, openSettings, syncSettingsLabels, tile };
