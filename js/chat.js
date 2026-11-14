// Text chat in the game and the lobby.
import { $, S, el, toast } from './app.js';
import { send } from './main.js';

// ---------- chat ----------
function openChat() {
  const inp = $('#chat-input');
  if (S.game) { S.game.input.keys.clear(); S.game.input.down = false; }
  $('#chat-row').hidden = false; $('#chat').classList.add('open');
  const log = $('#chat-log'); log.scrollTop = log.scrollHeight;
  inp.focus();
}
function closeChat() {
  const inp = $('#chat-input');
  inp.value = ''; $('#chat-row').hidden = true; inp.blur();
  $('#chat').classList.remove('open');
}
function chatSend(inp) { const t = inp.value.trim(); if (t) send({ t: 'chat', m: t }); inp.value = ''; }
$('#chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { chatSend(e.target); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});
$('#chat-send').addEventListener('click', () => { chatSend($('#chat-input')); closeChat(); });
$('#chat-x').addEventListener('click', closeChat);
$('#t-chat').addEventListener('click', () => { if ($('#chat').classList.contains('open')) closeChat(); else openChat(); });
$('#lchat-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') chatSend(e.target); });
$('#lchat-go').addEventListener('click', () => { chatSend($('#lchat-in')); $('#lchat-in').focus(); });
function addChat(pid, text) {
  if (typeof text !== 'string') return;
  const info = S.roster && S.roster.players.find((p) => p.pid === pid);
  const li = el('li');
  const who = el('b', '', (info ? info.name : 'Biri') + ':');
  if (info) who.style.color = info.color;
  li.append(who, document.createTextNode(text));
  const log = $('#chat-log');
  log.append(li);
  setTimeout(() => li.classList.add('old'), 7000); // fades away; shown again only while the chat is open
  while (log.children.length > 40) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  // the lobby keeps its own copy, so people can talk while picking classes
  const ll = $('#lchat-log'), l2 = li.cloneNode(true); l2.classList.remove('old'); ll.append(l2);
  while (ll.children.length > 40) ll.firstChild.remove();
  ll.scrollTop = ll.scrollHeight;
  if (S.screen !== 'game' && S.screen !== 'lobby') toast(`${info ? info.name : 'Biri'}: ${text}`);
}

export { addChat, chatSend, closeChat, openChat };
