// Cookie and local storage consent: a banner on the first visit, a settings window, and the saved choice.
// Necessary storage (sign-in, settings, saves, device id for safety) is always on; statistics are optional.
const KEY = 'kusatma-cerez';
const VER = 1;
let C = null;
const subs = [];

function load() {
  if (C) return C;
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.v === VER) C = { v: VER, a: v.a ? 1 : 0, t: +v.t || 0 }; } catch (e) { /* ignore */ }
  return C;
}
// statistics allowed? (false until the player says yes)
export const statsOk = () => !!(load() && C.a);
export const consentGiven = () => !!load();
export const onConsent = (f) => subs.push(f);
function save(a) {
  C = { v: VER, a: a ? 1 : 0, t: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(C)); } catch (e) { /* ignore */ }
  for (const f of subs) { try { f(C); } catch (e) { /* ignore */ } }
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (cls, text, fn) => { const b = mk('button', cls, text); b.type = 'button'; b.onclick = fn; return b; };
const link = (href, text) => { const a = mk('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a; };
const COOKIE = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3.6-3.6A3 3 0 0 1 13.8 4.8 3 3 0 0 1 12 3z" fill="#d9a066"/><circle cx="8.5" cy="10" r="1.3" fill="#7a4a24"/><circle cx="11" cy="15.5" r="1.4" fill="#7a4a24"/><circle cx="15.8" cy="14" r="1.1" fill="#7a4a24"/><circle cx="7.6" cy="15" r=".8" fill="#7a4a24"/></svg>';

function banner() {
  if (document.getElementById('ck-bar')) return;
  const bar = mk('div', 'ck-bar'); bar.id = 'ck-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Çerez tercihleri');
  const ic = mk('div', 'ck-ic'); ic.innerHTML = COOKIE; // fixed markup, no remote text
  const tx = mk('div', 'ck-tx');
  const p = mk('p', '');
  p.append(mk('strong', '', 'Çerezler ve yerel depolama. '), document.createTextNode('Oyunun çalışması için gerekli olanları (oturum, ayarlar, kayıtlar) kullanıyoruz. İzin verirsen oyunu iyileştirmek için cihaz ve kullanım istatistikleri de toplarız. '), link('cerezler.html', 'Çerez Politikası'));
  tx.append(p);
  const acts = mk('div', 'ck-acts');
  acts.append(button('ck-btn ghost', 'Çerezleri yönet', () => manage()), button('ck-btn primary', 'Kabul et', () => { save(1); close(); }));
  bar.append(ic, tx, acts);
  document.body.append(bar);
  requestAnimationFrame(() => bar.classList.add('in'));
}
function close() { const b = document.getElementById('ck-bar'); if (b) { b.classList.remove('in'); b.classList.add('out'); setTimeout(() => b.remove(), 260); } }

// the settings window: what each kind is for, a switch for the optional one
export function manage() {
  let d = document.getElementById('ck-dlg');
  if (d) d.remove();
  d = mk('div', 'ck-dlg'); d.id = 'ck-dlg';
  const card = mk('div', 'ck-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'ck-h');
  const head = mk('div', 'ck-head'); const h = mk('h3', '', 'Çerez tercihleri'); h.id = 'ck-h';
  const x = button('ck-x', '×', () => d.remove()); x.setAttribute('aria-label', 'Kapat');
  head.append(h, x);
  const intro = mk('p', 'ck-intro', 'Kuşatma reklam ya da takip çerezi kullanmaz. Tarayıcında sakladığımız bilgiler aşağıda. Gerekli olanlar olmadan oyun çalışmaz; istatistikleri istediğin zaman açıp kapatabilirsin.');
  const cur = load();
  const row = (title, text, items, locked, on) => {
    const r = mk('div', 'ck-row' + (locked ? ' locked' : ''));
    const top = mk('label', 'ck-row-top');
    const t = mk('div', 'ck-row-t'); t.append(mk('strong', '', title), mk('span', '', text));
    const sw = mk('input', 'ck-sw'); sw.type = 'checkbox'; sw.checked = !!on; sw.disabled = !!locked; sw.setAttribute('role', 'switch');
    top.append(t, locked ? mk('span', 'ck-always', 'Her zaman açık') : sw);
    r.append(top);
    const det = mk('details', 'ck-det'); det.append(mk('summary', '', 'Neler saklanıyor?'));
    const ul = mk('ul', ''); for (const i of items) ul.append(mk('li', '', i)); det.append(ul); r.append(det);
    return [r, sw];
  };
  const [r1] = row('Gerekli', 'Oyunun ve hesabının çalışması için.', [
    'Oturum anahtarı (giriş yaptıysan), oyun ayarların, ses ve yakınlaştırma tercihlerin',
    'Takma adın, en iyi dalgan, son oda kodun, bildirimlerin ve son oynadıkların',
    'Rastgele bir cihaz kimliği: hile ve kötüye kullanımı önlemek, yasakları uygulamak için',
    'Bu çerez tercihin',
  ], true, true);
  const [r2, sw2] = row('İstatistik', 'Oyunu hangi cihazlarda oynadığını görüp iyileştirmemiz için.', [
    'Cihaz özeti: işletim sistemi, tarayıcı ya da uygulama sürümü, ekran boyutu, dokunmatik ekran, dil, saat dilimi, bellek, işlemci çekirdeği, bağlantı türü',
    'Yaklaşık ülke (IP adresinden, adresin kendisi saklanmaz)',
    'Oyun içi kullanım: hangi mod, harita ve sınıfların oynandığı, oyunların süresi',
  ], false, cur ? cur.a : 0);
  const legal = mk('p', 'ck-links'); legal.append(link('cerezler.html', 'Çerez Politikası'), document.createTextNode(' · '), link('gizlilik.html', 'Gizlilik Politikası'), document.createTextNode(' · '), link('kosullar.html', 'Kullanım Şartları'));
  const acts = mk('div', 'ck-dacts');
  acts.append(button('ck-btn ghost', 'Hepsini reddet', () => { save(0); d.remove(); close(); }), button('ck-btn ghost', 'Seçimimi kaydet', () => { save(sw2.checked ? 1 : 0); d.remove(); close(); }), button('ck-btn primary', 'Hepsini kabul et', () => { save(1); d.remove(); close(); }));
  card.append(head, intro, r1, r2, legal, acts);
  d.append(card);
  d.addEventListener('click', (e) => { if (e.target === d) d.remove(); });
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape') d.remove(); });
  document.body.append(d);
  setTimeout(() => (sw2 || x).focus(), 30);
}

// show the banner once, until a choice is made (not in embedded views)
export function consentStart() {
  if (load()) return;
  if (/[?&]spec=/.test(location.search)) return;
  // automated tests on a local machine skip it (unless they test the banner itself)
  if (/[?&]debug\b/.test(location.search) && !/[?&]ck\b/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  setTimeout(banner, 700);
}
