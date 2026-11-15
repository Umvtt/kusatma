// Friends, the social way (build 66): messages that pop up where you can see them (with Yanıtla), and voice calls
// between friends. The server only passes a call on; the sound goes straight between the two players (PeerJS).
import { $, el, IS_TOUCH } from './app.js';
import { liveCall, liveGvc, sysNotify, turnReady } from './live.js';
import { makeCallPeer, addIce } from './net.js';
import * as sfx from './sfx.js';
import { playAudio, watchCall } from './voice.js';

let H = { openDm: () => {}, avatar: () => {}, inGame: () => false, send: async () => false, voiceOff: () => false, toast: () => {} };
export function socialInit(h) { H = Object.assign(H, h); }

// ---------- message pop-ups ----------
function popBox() { let b = $('#soc-pops'); if (!b) { b = el('div', 'soc-pops'); b.id = 'soc-pops'; b.setAttribute('aria-live', 'polite'); document.body.append(b); } return b; }
// info: a notice only (e.g. a call that could not go through): no reply box, nothing to open
export function msgPop(m, friend, info) {
  const box = popBox(), card = el('div', 'soc-pop' + (H.inGame() ? ' mini' : '') + (info ? ' info' : ''));
  const av = el('canvas', 'soc-av'); av.width = av.height = 40; try { H.avatar(av, (friend && friend.eq) || {}, { size: 40 }); } catch (e) { /* ignore */ }
  const tx = el('div', 'soc-tx'); tx.append(el('strong', '', m.n), el('span', '', m.x));
  const fr = friend || { id: m.f, name: m.n, eq: {} };
  // Yanıtla: a reply box right here (works in a game too); tapping the text opens the whole conversation
  const go = el('button', 'btn small play', 'Yanıtla'); go.type = 'button';
  go.onclick = () => {
    clearTimeout(card.t); const f = el('form', 'soc-reply'), inp = el('input'); inp.maxLength = 200; inp.placeholder = m.n + ' kişisine yaz…'; inp.autocomplete = 'off';
    const s = el('button', 'btn small play', 'Gönder'); s.type = 'submit'; f.append(inp, s); card.append(f); go.remove(); inp.focus();
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    f.onsubmit = async (e) => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; s.disabled = true; const ok = await H.send(fr.g ? 'g:' + fr.g : fr.id, t); if (ok) { card.classList.add('sent'); tx.lastChild.textContent = 'Gönderildi: ' + t; f.remove(); setTimeout(() => card.remove(), 1600); } else { s.disabled = false; tx.lastChild.textContent = 'Gönderilemedi, yeniden dene.'; } };
  };
  if (!info) tx.onclick = () => { if (!H.inGame()) { card.remove(); H.openDm(fr); } };
  const x = el('button', 'soc-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Kapat'); x.onclick = () => card.remove();
  if (info) card.append(av, tx, x); else card.append(av, tx, go, x);
  box.prepend(card);
  while (box.children.length > 3) box.lastChild.remove();
  try { sfx.unlock(); if (!info) sfx.buy(); } catch (e) { /* ignore */ }
  if (!info && navigator.vibrate && IS_TOUCH) try { navigator.vibrate(60); } catch (e) { /* ignore */ }
  card.t = setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 400); }, 8000);
}

// ---------- voice calls ----------
const C = { st: '', who: null, peer: null, stream: null, call: null, audio: null, t0: 0, timer: null, ringT: null, ring: null, card: null };
// build 69.4: the call strip can be dragged anywhere (it remembers the spot for this visit); taps on its buttons still work
const DRAG = {};
function draggable(b) {
  if (b.dataset.drag) return; b.dataset.drag = '1'; b.title = 'Sürükleyerek istediğin yere taşıyabilirsin';
  const put = (x, y) => { const r = b.getBoundingClientRect(); x = Math.max(4, Math.min(innerWidth - r.width - 4, x)); y = Math.max(4, Math.min(innerHeight - r.height - 4, y)); b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.right = 'auto'; b.style.transform = 'none'; b.classList.add('dragged'); DRAG[b.id] = { x, y }; };
  b.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input') || !b.classList.contains('mini')) return;
    const r = b.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    b.setPointerCapture(e.pointerId); e.preventDefault();
    const mv = (ev) => put(ev.clientX - dx, ev.clientY - dy);
    const up = () => { b.removeEventListener('pointermove', mv); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); };
    b.addEventListener('pointermove', mv); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
  // the first time a strip shows up, a short tip says it can be moved
  b.tip = () => { let seen = false; try { seen = localStorage.getItem('kusatma-surukle') === '1'; } catch (e) { /* ignore */ } if (seen || !b.classList.contains('mini')) return; try { localStorage.setItem('kusatma-surukle', '1'); } catch (e) { /* ignore */ } H.toast && H.toast('İpucu: arama şeridini ⠿ yerinden tutup istediğin yere sürükleyebilirsin.'); };
  b.restore = () => { const p = DRAG[b.id]; if (p && b.classList.contains('mini')) put(p.x, p.y); else { b.style.left = b.style.top = b.style.right = b.style.transform = ''; b.classList.remove('dragged'); } };
}
const callBox = () => { let b = $('#soc-call'); if (!b) { b = el('div', 'soc-call'); b.id = 'soc-call'; b.hidden = true; document.body.append(b); } draggable(b); return b; };
function draw() {
  const b = callBox(); C.card = b; document.body.classList.toggle('soc-calling', !!C.st);
  if (!C.st) { b.hidden = true; b.replaceChildren(); return; }
  b.hidden = false; b.classList.toggle('mini', C.st === 'on' || C.st === 'out'); requestAnimationFrame(() => { b.restore(); b.tip(); }); b.classList.toggle('ringing', C.st === 'in' || (C.st === 'out' && !!(C.pushed || C.rang)));
  const av = el('canvas', 'soc-av'); av.width = av.height = 48; try { H.avatar(av, C.who.eq || {}, { size: 48 }); } catch (e) { /* ignore */ }
  const tx = el('div', 'soc-tx'), st = el('span', 'soc-st');
  tx.append(el('strong', '', C.who.name), st);
  const acts = el('div', 'soc-acts');
  const b2 = (cls, t, fn, lab) => { const x = el('button', 'btn ' + cls, t); x.type = 'button'; x.onclick = fn; if (lab) x.setAttribute('aria-label', lab); return x; };
  if (C.st === 'in') { st.textContent = '🔔 seni arıyor…'; acts.append(b2('play', 'Kabul et', accept), b2('danger', 'Reddet', () => end(true))); }
  else if (C.st === 'out') { st.textContent = C.pushed ? '📱 telefonu çalıyor…' : C.rang ? '🔔 çalıyor…' : 'aranıyor…'; acts.append(b2('danger', 'Kapat', () => end(true))); }
  else if (C.st === 'on') {
    const tick = () => { const s = Math.round((Date.now() - C.t0) / 1000); st.textContent = 'görüşmede · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    tick(); clearInterval(C.timer); C.timer = setInterval(tick, 1000);
    const mute = b2('ghost', 'Sessize al', () => { const on = C.stream && C.stream.getAudioTracks()[0]; if (!on) return; on.enabled = !on.enabled; mute.textContent = on.enabled ? 'Sessize al' : 'Sesi aç'; });
    acts.append(mute, b2('danger', 'Kapat', () => end(true)));
  }
  b.replaceChildren(av, tx, acts);
}
// incoming: a phone trill every 2.2 s; outgoing (back): the ringback tone every 3 s until they answer
function ringStart(back) { ringStop(); if (back) { const t = () => { try { sfx.unlock(); sfx.ringBack(); } catch (e) { /* ignore */ } }; t(); C.ring = setInterval(t, 3000); return; } const beep = () => { try { sfx.unlock(); sfx.ringIn(); } catch (e) { /* ignore */ } if (navigator.vibrate && IS_TOUCH) try { navigator.vibrate([200, 120, 200]); } catch (e) { /* ignore */ } }; beep(); C.ring = setInterval(beep, 2200); }
function ringStop() { clearInterval(C.ring); C.ring = null; }
async function mic() { try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); } catch (e) { return null; } }
function openPeer() {
  return new Promise((res) => {
    turnReady(addIce).catch(() => {}).finally(() => {
      const p = makeCallPeer(); if (!p) { res(null); return; }
      const t = setTimeout(() => res(null), 12000);
      p.on('open', () => { clearTimeout(t); res(p); }); p.on('error', () => { clearTimeout(t); res(null); });
    });
  });
}
function hook(call) {
  C.call = call;
  call.on('stream', (s) => { if (!C.audio) { C.audio = el('audio'); C.audio.autoplay = true; C.audio.hidden = true; document.body.append(C.audio); } C.audio.srcObject = s; playAudio(C.audio); if (C.st !== 'on') { C.st = 'on'; C.t0 = Date.now(); ringStop(); draw(); } });
  call.on('close', () => end(false)); call.on('error', () => end(false));
  watchCall(call, () => { if (C.call === call && C.st !== 'on') { H.toast('Bağlantı kurulamadı. Tekrar dene.', 'bad'); end(true); } }); // build 70
}
// call a friend { id, name, eq }
export async function callFriend(f) {
  if (C.st || G.g) return 'busy';
  if (!navigator.mediaDevices) return 'mic';
  if (H.voiceOff()) H.toast('Oda sesli sohbeti arama için kapatıldı.');
  C.st = 'out'; C.who = f; draw();
  C.stream = await mic(); if (!C.stream) { end(false); return 'mic'; }
  C.peer = await openPeer(); if (!C.peer || C.st !== 'out') { end(false); return 'net'; }
  C.peer.on('call', (call) => { if (C.st !== 'out' && C.st !== 'on') { try { call.close(); } catch (e) { /* ignore */ } return; } call.answer(C.stream); hook(call); });
  liveCall(f.id, 'ring', C.peer.id); ringStart(true);
  clearTimeout(C.ringT); C.ringT = setTimeout(() => { if (C.st === 'out') end(true); }, 35000);
  return '';
}
async function accept() {
  if (C.st !== 'in') return;
  ringStop(); const who = C.who, theirs = C.theirs;
  if (H.voiceOff()) H.toast('Oda sesli sohbeti arama için kapatıldı.');
  C.stream = await mic(); if (!C.stream) { end(true); return; }
  C.peer = await openPeer(); if (!C.peer || C.st !== 'in') { end(true); return; }
  liveCall(who.id, 'ok', C.peer.id);
  hook(C.peer.call(theirs, C.stream));
}
function end(tell) {
  if (tell && C.who && C.st) liveCall(C.who.id, 'end', '');
  ringStop(); clearInterval(C.timer); clearTimeout(C.ringT);
  try { if (C.call) C.call.close(); } catch (e) { /* ignore */ }
  try { if (C.peer) C.peer.destroy(); } catch (e) { /* ignore */ }
  if (C.stream) for (const t of C.stream.getTracks()) t.stop();
  if (C.audio) C.audio.remove();
  Object.assign(C, { st: '', who: null, peer: null, stream: null, call: null, audio: null, theirs: '', pushed: false, rang: false });
  draw();
}
export const callState = () => C.st || (G.g ? 'grp' : '');

// ---------- group voice chat (build 69): everyone in the group's voice room talks to everyone (peer to peer, up to 8);
// never together with a one-to-one call or the game room's voice chat (joining turns the room's voice off) ----------
const G = { g: '', name: '', peer: null, stream: null, me: '', L: [], calls: new Map(), audios: new Map(), lists: new Map(), retry: new Map(), meters: new Map(), ringing: '' };
// a speaking meter per remote stream (build 70: the strip glows and names light up while someone talks)
let AC = null;
function meterOf(stream) {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume().catch(() => {}); const an = AC.createAnalyser(); an.fftSize = 256; AC.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(256);
    return () => { an.getByteTimeDomainData(buf); let t = 0; for (const v of buf) t += (v - 128) * (v - 128); return Math.sqrt(t / 256); }; } catch (e) { return () => 0; }
}
// every 2 s while in a group voice chat: call whoever I should call and am not connected to (the smaller account id
// calls), and light up who is talking
setInterval(() => {
  if (!G.g || !G.peer || !G.stream) return;
  const L = gvcOf(G.g), now = Date.now();
  for (const x of L) if (x.a !== G.me && x.id && !G.calls.has(x.a) && G.me < x.a && (G.retry.get(x.a) || 0) < now) { try { gvcHook(x.a, G.peer.call(x.id, G.stream)); } catch (e) { /* ignore */ } }
}, 2000);
setInterval(() => {
  const b = $('#soc-gvc'); if (!b || b.hidden || !G.g) return;
  let any = false; for (const [a, f] of G.meters) { const on = f() > 6; any = any || on; const n = b.querySelector(`[data-a="${a}"]`); if (n) n.classList.toggle('talk', on); }
  b.classList.toggle('talking', any);
}, 200);
export const gvcOf = (gid) => G.lists.get(gid) || [];
export const gvcIn = () => G.g;
function gvcHook(a, call) {
  watchCall(call, () => { try { call.close(); } catch (e) { /* ignore */ } if (G.calls.get(a) === call) G.calls.delete(a); G.retry.set(a, Date.now() + 3000); gvcDraw(); });
  const old = G.calls.get(a); if (old && old !== call) { try { old.close(); } catch (e) { /* ignore */ } }
  G.calls.set(a, call);
  call.on('stream', (s) => { let au = G.audios.get(a); if (!au) { au = el('audio'); au.autoplay = true; au.hidden = true; document.body.append(au); G.audios.set(a, au); } au.srcObject = s; playAudio(au); G.meters.set(a, meterOf(s)); gvcDraw(); });
  const gone = () => { if (G.calls.get(a) === call) { G.calls.delete(a); G.meters.delete(a); const au = G.audios.get(a); if (au) { au.remove(); G.audios.delete(a); } gvcDraw(); } };
  call.on('close', gone); call.on('error', gone);
}
export async function gvcJoin(gid, name, me) {
  if (G.g === gid) return '';
  if (C.st) return 'busy';
  if (G.g) gvcLeave();
  if ((gvcOf(gid) || []).length >= 8) return 'full';
  if (!navigator.mediaDevices) return 'mic';
  if (H.voiceOff()) H.toast('Oda sesli sohbeti grup sohbeti için kapatıldı.');
  G.g = gid; G.name = name; G.me = me; gvcDraw();
  G.stream = await mic(); if (!G.stream) { gvcLeave(); return 'mic'; }
  G.peer = await openPeer(); if (!G.peer || G.g !== gid) { gvcLeave(); return 'net'; }
  // whoever is already in answers; the newcomer calls everyone (in onGvc)
  G.peer.on('call', (call) => { if (!G.g) { try { call.close(); } catch (e) { /* ignore */ } return; } const who = (gvcOf(G.g).find((x) => x.id === call.peer) || {}).a || call.peer; call.answer(G.stream); gvcHook(who, call); });
  G.joinedAt = Date.now(); liveGvc(gid, 'join', G.peer.id);
  try { sfx.unlock(); sfx.waveClear(); } catch (e) { /* ignore */ }
  return '';
}
// build 70: "X started a voice chat in <group>": a ringing card (Katıl / Yoksay) for about 20 s
function gvcRing(gid, who) {
  gvcRingStop(); G.ringing = gid;
  const name = H.groupName(gid) || 'Grup';
  let b = $('#soc-gring'); if (!b) { b = el('div', 'soc-call ringing gring'); b.id = 'soc-gring'; document.body.append(b); }
  const tx = el('div', 'soc-tx'); tx.append(el('strong', '', '🔊 ' + name), el('span', 'soc-st', `${who} sesli sohbet başlattı`));
  const acts = el('div', 'soc-acts');
  const go = el('button', 'btn play', 'Katıl'); go.type = 'button'; go.onclick = () => { gvcRingStop(); if (H.joinGroupVoice) H.joinGroupVoice(gid, name); };
  const no = el('button', 'btn ghost', 'Yoksay'); no.type = 'button'; no.onclick = () => gvcRingStop();
  acts.append(go, no); b.replaceChildren(el('div', 'gvc-ic', '💬'), tx, acts); b.hidden = false;
  const beep = () => { try { sfx.unlock(); sfx.ringIn(); } catch (e) { /* ignore */ } if (navigator.vibrate && IS_TOUCH) try { navigator.vibrate([150, 100, 150]); } catch (e) { /* ignore */ } };
  beep(); G.ringT = setInterval(beep, 2600); G.ringEnd = setTimeout(gvcRingStop, 20000);
  sysNotify(name, `${who} sesli sohbet başlattı`, 'dm');
}
function gvcRingStop() { G.ringing = ''; clearInterval(G.ringT); clearTimeout(G.ringEnd); const b = $('#soc-gring'); if (b) b.hidden = true; }
export function gvcLeave() {
  if (G.g) liveGvc(G.g, 'leave', '');
  for (const c of G.calls.values()) { try { c.close(); } catch (e) { /* ignore */ } }
  for (const a of G.audios.values()) a.remove(); G.meters.clear();
  try { if (G.peer) G.peer.destroy(); } catch (e) { /* ignore */ }
  if (G.stream) for (const t of G.stream.getTracks()) t.stop();
  Object.assign(G, { g: '', name: '', peer: null, stream: null, calls: new Map(), audios: new Map() });
  gvcDraw(); if (H.onGvcChange) H.onGvcChange();
}
// the server's list of who is in a group's voice room
export function onGvc(gid, L, st) {
  G.lists.set(gid, L);
  if (st && L.length && G.g !== gid && !C.st && !G.g && !L.some((x) => x.a === G.me) && H.groupName) gvcRing(gid, L[0].n);
  if (!L.length && G.ringing === gid) gvcRingStop();
  if (G.g === gid && G.peer) {
    if (!L.some((x) => x.a === G.me) && Date.now() - (G.joinedAt || 0) > 4000) { gvcLeave(); return; } // dropped by the server
    for (const x of L) if (x.a !== G.me && x.id && !G.calls.has(x.a) && G.me < x.a) gvcHook(x.a, G.peer.call(x.id, G.stream)); // one side calls: the smaller account id
    for (const a of [...G.calls.keys()]) if (!L.some((x) => x.a === a)) { try { G.calls.get(a).close(); } catch (e) { /* ignore */ } }
  }
  gvcDraw(); if (H.onGvcChange) H.onGvcChange();
}
function gvcDraw() {
  let b = $('#soc-gvc'); if (!b) { b = el('div', 'soc-call gvc'); b.id = 'soc-gvc'; b.hidden = true; document.body.append(b); } draggable(b);
  document.body.classList.toggle('soc-calling', !!(C.st || G.g));
  if (!G.g) { b.hidden = true; b.replaceChildren(); return; }
  b.hidden = false; b.classList.add('mini'); requestAnimationFrame(() => { b.restore(); b.tip(); });
  const L = gvcOf(G.g), tx = el('div', 'soc-tx');
  const st = el('span', 'soc-st');
  if (!G.peer) st.textContent = 'bağlanıyor…';
  else if (L.length < 2) st.textContent = 'diğerlerini bekliyorsun…';
  else for (const x of L.filter((y) => y.a !== G.me)) { const n = el('span', 'gvc-n' + (G.audios.has(x.a) ? '' : ' wait'), x.n); n.dataset.a = x.a; st.append(n); }
  tx.append(el('strong', '', `🔊 ${G.name} · ${L.length}`), st);
  const acts = el('div', 'soc-acts');
  const mute = el('button', 'btn ghost', 'Sessize al'); mute.type = 'button';
  mute.onclick = () => { const t = G.stream && G.stream.getAudioTracks()[0]; if (!t) return; t.enabled = !t.enabled; mute.textContent = t.enabled ? 'Sessize al' : 'Sesi aç'; };
  if (G.stream && G.stream.getAudioTracks()[0] && !G.stream.getAudioTracks()[0].enabled) mute.textContent = 'Sesi aç';
  const out = el('button', 'btn danger', 'Ayrıl'); out.type = 'button'; out.onclick = () => gvcLeave();
  acts.append(mute, out);
  const ic = el('div', 'gvc-ic', '💬');
  b.replaceChildren(ic, tx, acts);
}
// a call message from the server: someone rings me, accepted my call, or hung up
export function onCall(d, friendOf) {
  if (d.k === 'ring') {
    if (C.st || G.g) { liveCall(d.f, 'end', ''); return; } // already on a call or in a group voice chat
    C.st = 'in'; C.who = friendOf(d.f) || { id: d.f, name: d.n, eq: d.eq }; C.theirs = d.id; draw(); ringStart();
    sysNotify(d.n + ' seni arıyor', 'Açmak için dokun.', 'dm');
    clearTimeout(C.ringT); C.ringT = setTimeout(() => { if (C.st === 'in') end(true); }, 35000);
  } else if (d.k === 'rang') {
    // build 69: the friend's game got the call and is ringing now
    if (C.st === 'out' && C.who && C.who.id === d.f) { C.rang = true; draw(); }
  } else if (d.k === 'push') {
    // build 67: the friend was away; their phone got a call notification, so keep ringing a little longer while they open the game
    if (C.st === 'out' && C.who && C.who.id === d.f) { C.pushed = true; draw(); clearTimeout(C.ringT); C.ringT = setTimeout(() => { if (C.st === 'out') { const who = C.who; end(true); msgPop({ n: '📞 ' + (who.name || 'Arama'), x: 'Açmadı. Cevapsız arama olarak bildirildi.', f: who.id }, who.eq ? who : null, true); } }, 45000); }
  } else if (d.k === 'end' || d.k === 'busy') {
    if (C.who && C.who.id === d.f) { const who = C.who; const why = d.k === 'busy' ? ({ off: 'Şu an çevrimdışı, aranamadı.', friend: 'Artık arkadaşın değil, aranamadı.', slow: 'Çok sık aradın, biraz bekle.' }[d.why] || 'Şu an meşgul, aranamadı.') : ''; end(false); if (why) msgPop({ n: '📞 ' + (who.name || 'Arama'), x: why, f: d.f }, who.eq ? who : null, true); }
  }
  // 'ok' needs nothing here: the friend's peer calls mine and hook() takes it from there
}
