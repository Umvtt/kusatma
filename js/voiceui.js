// Voice chat buttons and indicators (the calls themselves are in voice.js).
import { voiceOn, voiceStart, voiceStop, voicePtt, voiceOpen, voiceTalking, voiceSelfLevel } from './voice.js';
import { send } from './main.js';
import { $, IS_TOUCH, S, el, toast } from './app.js';
import { buzz } from './hud.js';

// ---------- voice chat ----------
// The mic button: tap once to turn voice on. Then hold it to talk (the finger may slide off it, talking stops only
// when it lifts), or tap it quickly to leave the microphone open and tap again to close it. V does the same on a
// keyboard (hold to talk, tap to leave open). The small × beside it turns voice off. "Mikrofon hep açık" in the lobby
// is the same open-mic switch.
let voiceOpenPref = false;
try { voiceOpenPref = localStorage.getItem('kusatma-mik') === '1'; } catch (e) { /* ignore */ }
function setOpenMic(on) {
  voiceOpenPref = !!on;
  try { localStorage.setItem('kusatma-mik', on ? '1' : '0'); } catch (e) { /* ignore */ }
  voiceOpen(voiceOpenPref); voiceUi();
}
async function toggleVoice() {
  if (voiceOn()) { voiceStop(); send({ t: 'voice', on: false }); voiceUi(); return; }
  if (!S.net || !S.net.peer) { toast('Sesli sohbet için bir odada olmalısın.'); return; }
  const ok = await voiceStart(S.net.peer);
  if (!ok) { toast('Mikrofona izin verilmedi. Tarayıcının adres çubuğundan izin verebilirsin.', 'bad'); return; }
  voiceOpen(voiceOpenPref);
  send({ t: 'voice', on: true });
  toast(voiceOpenPref ? 'Sesli sohbet açık, mikrofonun açık.' : IS_TOUCH ? 'Sesli sohbet açık. Basılı tut konuş, kısa dokun mikrofonu açık bırak.' : 'Sesli sohbet açık. V\'ye basılı tut konuş, kısa bas mikrofonu açık bırak.', 'good');
  voiceUi();
}
function voiceLabel() {
  if (!voiceOn()) return 'Ses';
  if (voiceTalking()) return voiceOpenPref ? 'Açık' : 'Konuşuyor';
  return IS_TOUCH ? 'Basılı tut' : 'V: konuş';
}
function voiceUi() {
  const r = S.roster, can = !!(r && r.code && S.net && S.net.peer), on = voiceOn(), talk = voiceTalking();
  const hb = $('#btn-voice');
  if (hb) {
    hb.hidden = !can; hb.setAttribute('aria-pressed', String(on));
    hb.classList.toggle('on', on); hb.classList.toggle('talk', talk); hb.classList.toggle('open', on && voiceOpenPref);
    const t = hb.querySelector('.vb-t'), txt = voiceLabel(); if (t && t.textContent !== txt) t.textContent = txt;
  }
  const off = $('#btn-voice-off'); if (off) off.hidden = !can || !on;
  if (!talk) { const vl = $('#voice-live'); if (vl) vl.hidden = true; }
  const lb = $('#lb-voice');
  if (lb) {
    lb.hidden = !can; lb.setAttribute('aria-pressed', String(on)); lb.classList.toggle('on', on); lb.classList.toggle('talk', talk);
    const t = !on ? '🎙 Sesli sohbeti aç' : '🎙 Sesli sohbeti kapat'; if (lb.textContent !== t) lb.textContent = t;
  }
  const o = $('#lb-vopen'); if (o) { o.hidden = !can; o.querySelector('input').checked = voiceOpenPref; }
}
// called every frame while voice is on: my microphone level drives the ring around the button
function voiceTick() {
  const hb = $('#btn-voice'), vl = $('#voice-live');
  const lv = voiceOn() ? Math.min(1, voiceSelfLevel() / 22) : 0, talk = voiceTalking();
  if (hb && !hb.hidden) hb.style.setProperty('--lv', lv.toFixed(2));
  // the "your voice is going out" badge at the top: shown only while the microphone sends, its bars follow your level
  if (vl) {
    vl.hidden = !talk;
    if (talk) { vl.style.setProperty('--lv', lv.toFixed(2)); vl.classList.toggle('open', voiceOpenPref); const t = vl.querySelector('.vl-t'), txt = voiceOpenPref ? 'Mikrofonun açık' : 'Sesin gidiyor'; if (t.textContent !== txt) t.textContent = txt; }
  }
}
const TAP_MS = 220;
(function voiceButtons() {
  const hb = $('#btn-voice');
  // phones hide the bottom-right HUD, so the mic joins the touch buttons (above Dipçik)
  if (IS_TOUCH) { const w = hb.parentElement, pad = $('#touch'); if (w && pad) { w.classList.add('t-mic'); pad.append(w); } }
  let downAt = 0, pid = null;
  const start = () => { downAt = performance.now(); if (voiceOn() && !voiceOpenPref) { voicePtt(true); buzz(12); } voiceUi(); };
  const end = (cancel) => {
    if (!downAt) return;
    const held = performance.now() - downAt; downAt = 0; pid = null;
    voicePtt(false);
    if (!cancel) {
      if (!voiceOn()) toggleVoice();
      else if (held < TAP_MS) { setOpenMic(!voiceOpenPref); buzz(voiceOpenPref ? 18 : 8); toast(voiceOpenPref ? 'Mikrofonun açık. Kapatmak için tekrar dokun.' : 'Mikrofon kapandı. Konuşmak için basılı tut.', voiceOpenPref ? 'good' : ''); }
    }
    voiceUi();
  };
  hb.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); pid = e.pointerId; try { hb.setPointerCapture(pid); } catch (x) { /* ignore */ } start(); });
  hb.addEventListener('pointerup', (e) => { if (pid !== null && e.pointerId !== pid) return; end(false); });
  hb.addEventListener('pointercancel', () => end(true));
  hb.addEventListener('lostpointercapture', () => { if (downAt) end(false); });
  hb.addEventListener('contextmenu', (e) => e.preventDefault());
  hb.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); if (!voiceOn()) toggleVoice(); else setOpenMic(!voiceOpenPref); } });
  $('#btn-voice-off').addEventListener('click', () => { if (voiceOn()) toggleVoice(); });
  // the lobby gets an on/off button plus "Mikrofon hep açık"
  const lc = $('#lchat');
  if (lc) {
    const row = el('div', 'voice-row');
    const lb = el('button', 'btn small voice-btn', '🎙 Sesli sohbeti aç'); lb.type = 'button'; lb.id = 'lb-voice'; lb.hidden = true; lb.onclick = () => toggleVoice();
    const lab = el('label', 'voice-open'); lab.id = 'lb-vopen'; lab.hidden = true; const cb = el('input'); cb.type = 'checkbox';
    cb.onchange = () => setOpenMic(cb.checked);
    lab.append(cb, el('span', '', 'Mikrofon hep açık'));
    row.append(lb, lab); lc.before(row);
  }
})();

export { TAP_MS, setOpenMic, toggleVoice, voiceLabel, voiceOpenPref, voiceTick, voiceUi };
