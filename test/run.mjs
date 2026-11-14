// Fast checks that need no browser and no server: run with `node test/run.mjs` before every push.
// - every game module parses
// - the host refuses impossible guest input (cheat.mjs)
// - compact snapshots (build 60) rebuild exactly what the host sent, under loss and reordering (compact.mjs)
// - guests never keep dead zombies, under loss, reordering, duplicates, outages (ghosts.mjs, several seeds, with the
//   guest's safety net switched off so the host's removal protocol is checked on its own)
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url)), root = dir + '../';
let fail = 0;
const run = (label, args) => {
  try { const out = execFileSync('node', args, { cwd: root, encoding: 'utf8', timeout: 600000 }); console.log('ok   ' + label + (out.trim() ? '  ' + out.trim().split('\n').pop() : '')); }
  catch (e) { fail++; console.log('FAIL ' + label + '\n' + String(e.stdout || '') + String(e.stderr || '')); }
};
for (const f of readdirSync(root + 'js').filter((f) => f.endsWith('.js'))) run('parse js/' + f, ['--check', 'js/' + f]);
run('host refuses cheats', ['test/cheat.mjs']);
run('compact snapshots rebuild exactly', ['test/compact.mjs']);
for (const seed of [1, 2, 3]) run('no ghost zombies, seed ' + seed, ['test/ghosts.mjs', String(seed), '90', 'nonet']);
console.log(fail ? fail + ' failed' : 'all passed');
process.exit(fail ? 1 : 0);
