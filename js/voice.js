// Voice chat between the players in a room. Audio goes straight from player to player over the same
// PeerJS peers the game already uses (no server in between); the room's host only shares who has voice on.
// Push-to-talk (V, or holding the mic button) by default; "hep açık" keeps the microphone open.
const V = { retry: new Map(), br: 20000, on: false, stream: null, peer: null, calls: new Map(), lcalls: new Map(), talk: false, open: false, muted: new Set(), levels: new Map(), ac: null };

export const voiceOn = () => V.on;
export const voiceTalking = () => V.on && (V.open || V.talk);
export const voiceLevel = (pid) => V.levels.get(pid) || 0;
export const voiceMuted = (pid) => V.muted.has(pid);
// my own microphone level (0 while the track is off), for the talk button's ring
export function voiceSelfLevel() { if (!V.on || !V.self || !(V.open || V.talk)) return 0; V.self(); return V.levels.get('me') || 0; }

function setTrack() { if (V.stream) for (const t of V.stream.getAudioTracks()) t.enabled = V.open || V.talk; }
export function voiceOpen(on) { V.open = !!on; setTrack(); }
export function voicePtt(down) { V.talk = !!down; setTrack(); }
export function voiceMute(pid, m) { if (m) V.muted.add(pid); else V.muted.delete(pid); const c = V.calls.get(pid); if (c && c.audio) c.audio.muted = !!m; }

// build 70: a browser may block sound that starts without a tap (phones especially); such players start on the next tap
const PEND = new Set();
export function playAudio(a) { const p = a.play(); if (p && p.catch) p.catch(() => { PEND.add(a); }); }
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { for (const a of PEND) { a.play().then(() => PEND.delete(a)).catch(() => {}); } if (V.ac && V.ac.state === 'suspended') V.ac.resume().catch(() => {}); }, { capture: true, passive: true });
// a call that never brings sound (blocked network path, a peer that went away) is dropped after 12 s so it is tried again
// (3 s later), instead of hanging silent forever; a connection that fails later is dropped the same way
export function watchCall(call, onDead) {
  let done = false; const dead = () => { if (done) return; done = true; clearTimeout(t); onDead(); };
  const t = setTimeout(() => { if (!call.__live) dead(); }, 12000);
  call.on('stream', () => { call.__live = true; });
  const pc = call.peerConnection;
  if (pc) pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') dead(); });
  return dead;
}
function meter(pid, stream) {
  try {
    V.ac = V.ac || new (window.AudioContext || window.webkitAudioContext)();
    const src = V.ac.createMediaStreamSource(stream), an = V.ac.createAnalyser();
    an.fftSize = 256; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    return () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) * (v - 128); V.levels.set(pid, Math.sqrt(s / buf.length)); };
  } catch (e) { return () => {}; }
}
// Voice uses the same upload as the game. Talking stays clear at 20 kbps (browsers use about twice that by default);
// while the host's link is struggling the game asks for 12 kbps: a bit rougher for a moment instead of a frozen game.
function capRate(call) {
  try {
    const pc = call.peerConnection; if (!pc) return;
    for (const snd of pc.getSenders()) {
      if (!snd.track || snd.track.kind !== 'audio') continue;
      const prm = snd.getParameters(); if (!prm.encodings || !prm.encodings.length) prm.encodings = [{}];
      if (prm.encodings[0].maxBitrate === V.br) continue;
      prm.encodings[0].maxBitrate = V.br; snd.setParameters(prm).catch(() => {});
    }
  } catch (e) { /* older browsers: default rate */ }
}
export function voiceRate(bps) { if (bps === V.br) return; V.br = bps; for (const c of V.calls.values()) capRate(c.call); }
export const voiceBitrate = () => V.br;
function hookCall(pid, call) {
  const old = V.calls.get(pid);
  if (old && old.call !== call) { try { old.call.close(); } catch (e) { /* ignore */ } if (old.audio) old.audio.remove(); }
  const rec = { call, audio: null, tick: null };
  V.calls.set(pid, rec);
  capRate(call); setTimeout(() => capRate(call), 1500); // once the connection has its sender
  call.on('stream', (s) => {
    capRate(call);
    if (!rec.audio) { rec.audio = document.createElement('audio'); rec.audio.autoplay = true; rec.audio.hidden = true; document.body.append(rec.audio); }
    rec.audio.srcObject = s; rec.audio.muted = V.muted.has(pid);
    playAudio(rec.audio);
    rec.tick = meter(pid, s);
  });
  const drop = () => { if (V.calls.get(pid) === rec) { V.calls.delete(pid); V.levels.delete(pid); V.retry.set(pid, Date.now() + 3000); if (rec.audio) rec.audio.remove(); PEND.delete(rec.audio); } };
  call.on('close', drop); call.on('error', drop);
  watchCall(call, () => { try { call.close(); } catch (e) { /* ignore */ } drop(); });
}

// turn voice on: ask for the microphone, answer calls from the room
export async function voiceStart(peer) {
  if (V.on) return true;
  if (!peer || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try { V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); } catch (e) { return false; }
  V.on = true; V.peer = peer; setTrack();
  try { V.ac = V.ac || new (window.AudioContext || window.webkitAudioContext)(); if (V.ac.state === 'suspended') V.ac.resume().catch(() => {}); } catch (e) { /* ignore */ }
  V.self = meter('me', V.stream);
  if (!peer.__voice) {
    peer.__voice = true;
    peer.on('call', (call) => {
      if (!V.on) { try { call.close(); } catch (e) { /* ignore */ } return; }
      const pid = call.metadata && Number.isInteger(call.metadata.pid) ? call.metadata.pid : 0;
      if (!pid) { try { call.close(); } catch (e) { /* ignore */ } return; }
      call.answer(V.stream);
      hookCall(pid, call);
    });
  }
  return true;
}
export function voiceStop() {
  V.on = false; V.talk = false; V.self = null; V.levels.delete('me');
  for (const [, c] of V.calls) { try { c.call.close(); } catch (e) { /* ignore */ } if (c.audio) c.audio.remove(); }
  for (const call of V.lcalls.values()) { try { call.close(); } catch (e) { /* ignore */ } }
  V.calls.clear(); V.lcalls.clear(); V.levels.clear();
  if (V.stream) for (const t of V.stream.getTracks()) t.stop();
  V.stream = null;
}

// keep calls in step with the room: call everyone (with a higher player number) who has voice on and can hear me,
// hang up on anyone who left, turned voice off or (team PvP) is on the other team
export function voiceSync(roster, me) {
  if (!V.on || !roster || !V.peer) return;
  const mine = roster.players.find((p) => p.pid === me);
  const team = roster.mode === 'pvp' && roster.pvp === 'tdm';
  const want = new Map();
  for (const p of roster.players) {
    if (p.pid === me || !p.vo || !p.vp || p.away) continue;
    if (team && mine && (p.tm | 0) !== (mine.tm | 0)) continue;
    want.set(p.pid, p.vp);
  }
  for (const [pid, c] of [...V.calls]) if (!want.has(pid)) { try { c.call.close(); } catch (e) { /* ignore */ } if (c.audio) c.audio.remove(); V.calls.delete(pid); V.levels.delete(pid); }
  for (const [pid, vp] of want) {
    if (V.calls.has(pid) || me > pid || (V.retry.get(pid) || 0) > Date.now()) continue; // the lower number calls, so each pair has one call
    try { const call = V.peer.call(vp, V.stream, { metadata: { pid: me } }); if (call) hookCall(pid, call); } catch (e) { /* ignore */ }
  }
  for (const c of V.calls.values()) if (c.tick) c.tick();
  // the owner listening from the panel (build 65; players are told on the privacy page and in the lobby)
  const L = new Set((Array.isArray(roster.lsn) ? roster.lsn : []).filter((x) => typeof x === 'string' && /^[a-z0-9-]{8,64}$/.test(x)).slice(0, 3));
  for (const [id, call] of [...V.lcalls]) if (!L.has(id)) { try { call.close(); } catch (e) { /* ignore */ } V.lcalls.delete(id); }
  for (const id of L) {
    if (V.lcalls.has(id)) continue;
    try { const call = V.peer.call(id, V.stream, { metadata: { pid: me, l: 1 } }); if (call) { V.lcalls.set(id, call); capRate(call); const drop = () => { if (V.lcalls.get(id) === call) V.lcalls.delete(id); }; call.on('close', drop); call.on('error', drop); } } catch (e) { /* ignore */ }
  }
}
// the owner's hidden view: answer the players' one-way calls and play them (build 65)
export function voiceListen(peer, onCount) {
  const audios = new Map();
  peer.on('call', (call) => {
    if (!call.metadata || !call.metadata.l) { try { call.close(); } catch (e) { /* ignore */ } return; }
    call.answer();
    const key = call.metadata.pid | 0;
    call.on('stream', (s) => { let a = audios.get(key); if (!a) { a = document.createElement('audio'); a.autoplay = true; a.hidden = true; document.body.append(a); audios.set(key, a); } a.srcObject = s; a.play().catch(() => {}); if (onCount) onCount(audios.size); });
    const drop = () => { const a = audios.get(key); if (a && a.srcObject === call.remoteStream) { a.remove(); audios.delete(key); } if (onCount) onCount(audios.size); };
    call.on('close', drop); call.on('error', drop);
  });
}
