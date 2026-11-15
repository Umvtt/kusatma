# Adding content (notes for Claude)

How to add each kind of content without missing a piece. `node test/run.mjs` runs `test/content.mjs`, which fails with the exact missing piece and where it goes; the test repo's `sync70` suite checks the game against the server's own lists. Run both before publishing.

General rules:
- Names the player sees are Turkish. Code, comments and these notes are English. Content has no copyrighted names.
- **Protocol:** guests build the map from its name and draw zombies by their number. A new map, a new zombie or a new zombie state means old and new versions can't play together, so bump `VERSION` in config.js. A new class, item or cosmetic doesn't need this.
- **Balance:** check new numbers with a quick simulation (the host runs in Node: see `test/cheat.mjs` and the test repo's `hostspeed`), not by guessing.
- **Writing it up:** add the content to README.md (player-facing lists), docs/HISTORY.md, the dashboard's `WHATS_NEW` (dash.js) and docs/NEXT.md (mark it done).
- **Admin panel:** class, map, difficulty, zombie and boss names come from config.js by themselves (build 70).
- **New code:** refer to zombies by `ZK.<key>` (config.js), never by a bare number. Old code still uses numbers; leave those alone unless you are touching them anyway.

## A class
1. **config.js:**
   - `CLASSES.<id>`: `name`, `weapon`, `tiers` (3 gun names), `desc`, `hp`, `spd`, `dmg`, `rate`, `spread`, `bspd`, `life`, `pellets`, `pierce`, `kind` (`'b'` bullet, `'g'` grenade, `'m'` melee, `'f'` flame), `gun`, and also:
     - `ab` {name, desc, cd, dur…}
     - `pas` {name, desc}
     - `look`
     - `bars` {can, hiz, hasar} (0–1)
   - Add the id to `CLASS_ORDER` (the order on screen) and a colour to `CLASS_COL`.
   - `AB_UP.<id>`: 3 lines describing what ability mastery adds. If mastery changes the duration, add it in `abDur`.
   - Weapon paths: `CP.<id>` needs exactly 4 paths. Each path has `name`, `desc`, `col`, a curve, effect pieces (`fx`) and 2 branches `br` [{name, desc, cap}]. Copy a similar class and change it.
2. **The ability:**
   - The host side goes in `host-combat.js` `onAbility` (`else if (p.cls === '<id>')`).
   - If it gives a timed effect, the client side goes in `client.js`: the ability effect maps at ~361 and ~500, plus any prediction.
   - Passives are applied where damage or speed is worked out: grep an existing passive such as `ajanBonus`.
3. **render.js:** in `drawCharacter`, add the body/backpack `case '<id>'` and the gun `case '<id>'`, plus the head gear case (~1844), and the muzzle offset in the `front` map (~1784).
4. **sfx.js:** add the gun's sound to the `SHOT` table, or give the class its own case.
5. **Shop:** add a `catalog.js` item `'c.<id>': { name, r, cls: '<id>' }` (unless the class is free, `FREE_CLS`).
6. **Server** (private worker source):
   - Add the id to `KCLS`.
   - Add `'c.<id>': [price]` to `KCAT`.
   - If the class is free, add it to `KFREE_CLS` on the server and to `FREE_CLS` in catalog.js.
   - Deploy, then sync the test repo's copy with `tools/syncworker.sh`.
7. **Tests:** run `node test/run.mjs`, then the test repo's quick run; check the class card and look with the `shots` tool.

## A zombie
1. **config.js `ZTYPES`:** append, never insert, because numbers are saved in replays and used by bosses.
   - Give it `{ key, name, hp, spd, r, dps, gold, col, dark }`.
   - Add an optional spawn rule `spawn: { from, base, step, max, off, pack }`: the chance per zombie in wave w is `min(max, base + (w - off) * step)` from wave `from`; `pack` = how many extra come with it.
   - Add its key to `SPAWN_ORDER`.
   - Check the wave-60 total that `test/content.mjs` prints if it complains: it was 1.20 at build 70.
2. **Behaviour** goes in `host-zombies.js`:
   - a special move: `zombieStart` (starting it) and `zombieMove` (while it is under way), with a new `ZS` state in config.js if needed;
   - walking: `zombieSteer`;
   - death effects: grep `zombieDie`.
3. **Look:** `render.js` `drawZombie` uses the colours, or `drawNewZombie` for a model of its own. Minimap dot colours are in render.js (~571).
4. **Sound:** `sfx.js` `growl(t)` and `zombieDie(…, t)` take the type.
5. **README zombie list.** Bump `VERSION`.

## A boss
Add it as a zombie (above) with no `spawn` rule, then add its number to `BOSS_ORDER`. `isBoss` follows from that. Its attacks go in `host-zombies.js` like the other bosses (grep `ZK.worm` / type 23 for the newest one).

## A map
1. **config.js:** add a `MAPS.<id>` entry `{ name, desc }` and add the id to `MAP_ORDER`.
2. **mapgen.js `generateMap`:** add a `theme === '<id>'` branch that places obstacles (kinds the renderer knows: grep `PV_COL` in render.js) and decor.
3. **Optional map events:** `host-gear.js` `updateMap` (the trains and the haunted-house horde are examples).
4. **Ground colours:** in render.js, grep an existing map id to find them.
5. Bump `VERSION` and add the map to the README.

## Cosmetics (hats, colours, gun skins, frames, name colours, titles, pets, banners)
1. **`catalog.js ITEMS`:** the id prefix is the slot (`SLOTS`: r, h, w, f, n, u, t, p, b). Give it `{ name, r: rarity, … }` plus its look fields (copy an item of the same slot).
   - Exactly one source: sold (needs a server price), `reward: <level>`, `season: 'f'|'p'`, `wheel: true` or `free: true`.
2. **Drawing:**
   - Hats are drawn in `render.js` `drawHat`.
   - Pets, banners and frames are drawn from their fields. A new pattern or shape needs a case in its draw function (grep the slot).
3. **Server:**
   - a sold item needs a price in `KCAT`;
   - a level reward goes in `KROAD`;
   - a season item goes in `KSEAS_ITEMS` and the season config;
   - a wheel prize goes in `KSPIN` / `KSPIN_ITEMS`.

   `sync70` catches a missing one.

## A theme
1. Add `catalog.js 't.<id>'`.
2. **dash.js `THEMES`:** add the hero scene colours.
3. **app.js:** add the id to `THEME_IDS`.
4. **theme.css:** add a `[data-theme="<id>"]` block with the tokens and its art (`--art-<id>-*`).
   - Art is made by `tools/mkthemes.py` in the test repo: add a pattern, skyline, particles and ornament there, run it, and paste its `:root` block over the old one.
   - Add any touches of its own (see Kan drips / Neon glow).
5. Add a price on the server (`KCAT`).

## Battle items, gear, team upgrades, class upgrades
The `ITEMS`, `GEAR`, `TEAM` and `UPGRADES` arrays in config.js. Their effects go in `host-gear.js` (`onBuy` and the item's use) or `host-combat.js`. The armory (`shop.js`) lists them by itself. New fields that guests must see change the snapshot row: update `rows.mjs` expectations and bump `VERSION`.

## Modes and difficulties
1. **config.js:** `MODES` / `MODE_ORDER`, `DIFFS` / `DIFF_ORDER`, and gem multipliers `GEM_MODE` / `GEM_DIFF`.
2. **Server:** its own multipliers are `KGM` / `KDM`. Keep both sides the same.
3. The mode's rules go in `host.js` (`startWave`, `endWave`, `step`).

## Quests, achievements, level road, spin wheel, season
These live on the server:
- `KQ` (daily quests);
- `KWQ` (weekly);
- `KACH` (achievements: [id, stat, goal, gems]);
- `KROAD` (level rewards);
- `KSPIN` (wheel slices; the game's `SPIN` list in dash.js must have the same slices in the same order);
- the season config (panel → Season).

The dashboard shows what the server sends; only new kinds of stat need game code (`liveStat` / `kEnd`).
