// Fast checks that need no browser and no server: run with `node test/run.mjs` before every push.
// - every game module parses (as a module)
// - every class, zombie, map, shop item and theme has all its pieces (content.mjs, build 70)
// - the host refuses impossible guest input (cheat.mjs)
// - the player row has the fields guests unpack, and no live object (rows.mjs, build 64)
// - compact snapshots (build 60) rebuild exactly what the host sent, under loss and reordering (compact.mjs)
// - guests never keep dead zombies, under loss, reordering, duplicates, outages (ghosts.mjs, several seeds, with the
//   guest's safety net switched off so the host's removal protocol is checked on its own)
import { readdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url)), root = dir + '../';
let fail = 0;
const run = (label, args) => {
  try { const out = execFileSync('node', args, { cwd: root, encoding: 'utf8', timeout: 600000 }); console.log('ok   ' + label + (out.trim() ? '  ' + out.trim().split('\n').pop() : '')); }
  catch (e) { fail++; console.log('FAIL ' + label + '\n' + String(e.stdout || '') + String(e.stderr || '')); }
};
// parsed as the browser does, as ES modules (build 70: a plain .js check missed a function declared twice, which only
// fails as a module)
const tmp = mkdtempSync(tmpdir() + '/kparse-');
for (const f of readdirSync(root + 'js').filter((f) => f.endsWith('.js'))) { copyFileSync(root + 'js/' + f, tmp + '/' + f.replace(/\.js$/, '.mjs')); run('parse js/' + f, ['--check', tmp + '/' + f.replace(/\.js$/, '.mjs')]); }
run('content is complete (classes, zombies, maps, items, themes)', ['test/content.mjs']);
run('host refuses cheats', ['test/cheat.mjs']);
run('compact snapshots rebuild exactly', ['test/compact.mjs']);
run('player rows match what guests read', ['test/rows.mjs']);
for (const seed of [1, 2, 3]) run('no ghost zombies, seed ' + seed, ['test/ghosts.mjs', String(seed), '90', 'nonet']);
console.log(fail ? fail + ' failed' : 'all passed');
process.exit(fail ? 1 : 0);
