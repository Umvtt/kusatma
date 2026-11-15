// Content checks (build 70): every class, zombie, map, shop item and theme has all the pieces the game needs, so new
// content can't be half-added. Run by test/run.mjs. A failure names exactly what is missing and where it goes.
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const C = await import(new URL('js/config.js', root));
const K = await import(new URL('js/catalog.js', root));
const src = (f) => readFileSync(new URL(f, root), 'utf8');
const R = src('js/render.js'), SFX = src('js/sfx.js'), DASH = src('js/dash.js'), MAPGEN = src('js/mapgen.js'), THEME = src('css/theme.css'), APP = src('js/app.js');
const bad = [];
const need = (ok, what) => { if (!ok) bad.push(what); };

// classes: config entry, colour, ability upgrades, 4 weapon paths with 2 branches each, shop item (unless free),
// look in render.js (body + gun + head gear), gun sound in sfx.js
for (const id of C.CLASS_ORDER) {
  const c = C.CLASSES[id];
  need(c, `class ${id}: no CLASSES entry (config.js)`); if (!c) continue;
  for (const f of ['name', 'weapon', 'tiers', 'desc', 'hp', 'spd', 'dmg', 'rate', 'ab', 'pas', 'bars']) need(c[f] != null, `class ${id}: CLASSES.${id}.${f} missing (config.js)`);
  need(c.ab && c.ab.name && c.ab.desc && c.ab.cd, `class ${id}: ability needs name, desc, cd`);
  need(C.CLASS_COL[id], `class ${id}: no colour in CLASS_COL (config.js)`);
  need(Array.isArray(C.AB_UP[id]) && C.AB_UP[id].length === 3, `class ${id}: AB_UP needs 3 ability-mastery lines (config.js)`);
  const paths = C.pathsFor(id);
  need(paths.length === C.PATH_N, `class ${id}: ${paths.length} weapon paths, should be ${C.PATH_N} (CP in config.js)`);
  for (const k of paths) { const P = C.pathOf(id, k); need(P && P.name && P.desc && Array.isArray(P.br) && P.br.length === 2 && P.br.every((b) => b.name && b.desc && b.cap), `class ${id}: path ${k} needs name, desc and 2 branches with name/desc/cap`); }
  if (!K.FREE_CLS.includes(id)) need(K.ITEMS['c.' + id] && K.ITEMS['c.' + id].cls === id, `class ${id}: no shop item 'c.${id}' (catalog.js) and a price in the server's KCAT`);
  need(R.includes(`case '${id}':`), `class ${id}: no look in render.js (switch cases for body/gun/head: case '${id}')`);
  need(new RegExp(`\\b${id}: \\[`).test(SFX) || SFX.includes(`'${id}'`) || c.kind === 'm', `class ${id}: no gun sound in sfx.js (SHOT table or its own case)`);
}
for (const id of Object.keys(C.CLASSES)) need(C.CLASS_ORDER.includes(id), `class ${id}: missing from CLASS_ORDER`);
for (const id of K.FREE_CLS) need(C.CLASSES[id], `free class ${id} does not exist`);

// zombies: key, name and stats; keys unique; spawn rules sane and listed in SPAWN_ORDER; bosses flagged
const keys = new Set();
C.ZTYPES.forEach((z, i) => {
  need(z.key && !keys.has(z.key), `zombie ${i} (${z.name}): needs a unique key (ZTYPES in config.js)`); keys.add(z.key);
  for (const f of ['name', 'hp', 'spd', 'r', 'dps', 'gold', 'col', 'dark']) need(z[f] != null, `zombie ${z.key || i}: ${f} missing`);
  if (z.spawn) {
    need(C.SPAWN_ORDER.includes(z.key), `zombie ${z.key}: has a spawn rule but is not in SPAWN_ORDER (config.js)`);
    need(z.spawn.max > 0 && z.spawn.max < 0.5 && z.spawn.from >= 1, `zombie ${z.key}: spawn rule looks wrong (max 0–0.5, from ≥ 1)`);
  }
  if (C.BOSS_ORDER.includes(i)) need(C.isBoss(i), `zombie ${z.key}: in BOSS_ORDER but isBoss() says no`);
});
for (const k of C.SPAWN_ORDER) need(C.ZK[k] != null && C.ZTYPES[C.ZK[k]].spawn, `SPAWN_ORDER: '${k}' is not a zombie with a spawn rule`);
let sum = 0; for (const k of C.SPAWN_ORDER) sum += C.spawnChance(C.ZK[k], 60);
// (late waves already roll more than 1 in total: the last types in SPAWN_ORDER get fewer and Yürüyen none; a new
// type pushes that further, so keep an eye on this number: 1.20 at build 70)
need(sum < 1.6, `spawn chances at wave 60 add up to ${sum.toFixed(2)} (1.20 at build 70): the types last in SPAWN_ORDER are being crowded out`);

// maps: entry with name and desc, a generator branch in mapgen.js, a case for the menu preview colours
for (const id of C.MAP_ORDER) {
  need(C.MAPS[id] && C.MAPS[id].name && C.MAPS[id].desc, `map ${id}: MAPS entry needs name and desc (config.js)`);
  need(MAPGEN.includes(`theme === '${id}'`) || id === 'meydan', `map ${id}: no generator branch in mapgen.js (theme === '${id}')`);
}
for (const id of Object.keys(C.MAPS)) need(C.MAP_ORDER.includes(id), `map ${id}: missing from MAP_ORDER`);

// shop items: right slot prefix, a rarity, one source; themes have CSS and are known to setTheme
for (const [id, it] of Object.entries(K.ITEMS)) {
  const p = id.split('.')[0];
  need(p === 'c' || K.SLOT_OF[p], `item ${id}: unknown prefix '${p}' (SLOTS in catalog.js)`);
  need(it.name && K.RARITY[it.r], `item ${id}: needs a name and a rarity (c/r/e/l/s)`);
  need([it.free, it.season, it.wheel, it.reward].filter(Boolean).length <= 1, `item ${id}: only one of free/season/wheel/reward`);
  if (p === 't') {
    const t = id.slice(2);
    need(THEME.includes(`[data-theme="${t}"]`) || t === 'gece', `theme ${id}: no [data-theme="${t}"] colours in theme.css`);
    need(APP.includes(`'${t}'`), `theme ${id}: not in THEME_IDS (app.js setTheme)`);
    need(DASH.includes(`'${id}':`), `theme ${id}: no hero-scene colours in THEMES (dash.js)`);
  }
}
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log(`${C.CLASS_ORDER.length} classes, ${C.ZTYPES.length} zombies, ${C.MAP_ORDER.length} maps, ${Object.keys(K.ITEMS).length} items: complete`);
