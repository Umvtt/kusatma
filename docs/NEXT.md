# Planned work (owner's list, newest first). Do each part only when the owner says "start build N".

## Added 15–16 Kasım 2026 (builds 67.1–71, all done)
- **67.1–67.3 (done):** luck wheel on its own screen; info-only call notices; calls ring an away friend's phone; find players by part of a name (Oyuncular page); the locker shows where each item comes from.
- **68 / app 49.0 (done):** group chats; the phone rings like a real call (app 49); ring sounds for both sides; clan invites with a clear state; wheel gem counter.
- **69–69.5 (done):** Sosyal tab; calling/ringing state; group voice chat (never with the room's voice or a call); gem events lift the daily limit to 4000; '56 / 1000' card; scoreboard mutes fixed; panel XP & level log, Level up / Set level; branch-swap button; smaller, draggable call strip; iPhone-only home-screen app; group settings ⚙️ with one-tap add and search; friends refresh; solo games 0.30× gems.
- **70 (done):** the general feel: voice retries and blocked-sound fix, group voice rings, friends refresh everywhere without redraws, seating fixes.
- **71 (done):** loose ends (tests for branch swap and path reset, this list; the old CSS cleanup was tried and undone because it changed screens) and making content easy to add (docs/CONTENT.md, test/content.mjs, the test repo's sync70, zombie spawn rules as data, panel names from config).
- Open, only if wanted: a speed build for late waves on phones; group voice for more than 8 people (needs a paid relay); a real ringing screen for group calls.

## Added 15 Kasım 2026 (during build 67)
- **Build 67 (done):** the redesign the owner asked for after build 66: flat, minimal, filled look (no gradients or glow), themes that change every screen and profile with their own decorations (not only colours), and a better feel on phone and PC (real button presses, tap vibration, smoother screens).
- Later, if wanted: remove the old gradient lines that build 67 now always overrides (tidy-up only, nothing visible).

## Added 14 Kasım 2026 (after build 63)
Split agreed by the owner:
- **Build 64 (done):** the old build 64 list below + items 5, 6, 7, 8 (leaderboard abuse, harder game, visible events, bodies inside the border).
- **Build 65 (done):** items 1, 2, 3, 4 (panel control room with voice listening, leaderboard editing, Turkish names in the panel, muting players).
- **Build 66 (done):** items 9, 10 and 12, as a full separate build: the Roblox-like redesign of the whole site, very clean, plus the uncluttered phone screen and the social part below.
- Voice: nothing is recorded or stored; moderators can only listen live. Players are told with a friendly, truthful note (privacy page + the lobby's voice area), e.g. "Herkes için güvenli bir oyun ortamı sağlamak amacıyla moderatörler zaman zaman sesli sohbete katılabilir. Konuşmalar kaydedilmez." ("To keep the game safe for everyone, moderators may sometimes join voice chat. Conversations are not recorded.")
1. **Panel control room, full room control:** the owner can listen to a room's voice chat; set the current wave; start an intermission (break) of a chosen length that flows on into the next wave by itself; "all that stuff", all seamless. Voice listening needs the privacy page (gizlilik.html) to say so (see notes).
2. **Panel: edit every leaderboard value** (weekly board, best wave, season XP, clan boards…).
3. **Panel: Turkish game names stay Turkish** (zombie names, boss names, classes, maps… exactly as in the game).
4. **Mute other players:** each player can mute someone's text chat and voice chat.
5. **Leaderboard abuse:** joining a random high-wave room must not put a player on the boards (e.g. only count waves the player actually played through, from early in the game).
6. **Harder game:** with everything maxed it is too easy. Much harder on Normal and the harder difficulties (check with simulations, not guesses).
7. **Admin events clearly visible:** when an event is on (e.g. gem weekend) every player sees it plainly (banner on the menu/dashboard and in game).
8. **Dead bodies never land outside the map border.**
9. **Phone screens still cluttered:** clean up the in-game phone layout.
10. **Website UI much better, much more Roblox-like** (bright, rounded, card-based, playful), everything working together seamlessly. Inspired by, not copying (no Roblox names, logos or art).
12. **Much more social (build 66, same Roblox-like style):** far better messaging between friends, with notifications you actually see on phone and PC (site and app); calling friends (voice calls); generally a much more social feel.
11. **Working style:** during a build, give short progress updates on your own as you go, each with the estimated time left, never a list of steps.

## Build 64 list (done in build 64, see docs/HISTORY.md; the full bug hunt was the test suites plus these fixes)
1. Hacker ability + charging zombies: they get stuck facing one angle, the charge misbehaves.
2. The blue/teal "shield" ring on hacked zombies stays after the hack ends.
3. Other leftover states on hacked zombies, checked for every zombie type.
4. Blood fades faster: mostly gone in ~20 s, fully in ~40 s.
5. Full bug hunt across the game.
6. Armory: items can't be bought (button does nothing on PC; check phone); add a test.
7. The items hotbar stays after the item is used.
8. Sound (voices and gunshots) muffles for 1–2 s on phones, even solo, also on speaker.
9. Minor: the 1000 px (host) vs 950 px (guest) zombie safety margin.
