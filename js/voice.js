// Voice chat between the players in a room. Audio goes straight from player to player over the same
// PeerJS peers the game already uses (no server in between); the room's host only shares who has voice on.
// Push-to-talk (V, or holding the mic button) by default; "hep açık" keeps the microphone open.
const V = { on: false, stream: null, peer: null, calls: new Map(), talk: false, open: false, muted: new Set(), levels: new Map(), ac: null };

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

function meter(pid, stream) {
  try {
    V.ac = V.ac || new (window.AudioContext || window.webkitAudioContext)();
    const src = V.ac.createMediaStreamSource(stream), an = V.ac.createAnalyser();
    an.fftSize = 256; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    return () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) * (v - 128); V.levels.set(pid, Math.sqrt(s / buf.length)); };
  } catch (e) { return () => {}; }
}
function hookCall(pid, call) {
  const old = V.calls.get(pid);
  if (old && old.call !== call) { try { old.call.close(); } catch (e) { /* ignore */ } if (old.audio) old.audio.remove(); }
  const rec = { call, audio: null, tick: null };
  V.calls.set(pid, rec);
  call.on('stream', (s) => {
    if (!rec.audio) { rec.audio = document.createElement('audio'); rec.audio.autoplay = true; rec.audio.hidden = true; document.body.append(rec.audio); }
    rec.audio.srcObject = s; rec.audio.muted = V.muted.has(pid);
    rec.audio.play().catch(() => {});
    rec.tick = meter(pid, s);
  });
  const drop = () => { if (V.calls.get(pid) === rec) { V.calls.delete(pid); V.levels.delete(pid); if (rec.audio) rec.audio.remove(); } };
  call.on('close', drop); call.on('error', drop);
}

// turn voice on: ask for the microphone, answer calls from the room
export async function voiceStart(peer) {
  if (V.on) return true;
  if (!peer || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try { V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); } catch (e) { return false; }
  V.on = true; V.peer = peer; setTrack();
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
  V.calls.clear(); V.levels.clear();
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
    if (V.calls.has(pid) || me > pid) continue; // the lower number calls, so each pair has one call
    try { const call = V.peer.call(vp, V.stream, { metadata: { pid: me } }); if (call) hookCall(pid, call); } catch (e) { /* ignore */ }
  }
  for (const c of V.calls.values()) if (c.tick) c.tick();
}
