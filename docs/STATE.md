# Where we are (read first in a new chat; updated by `/handoff`)

## Now (20 Kasım 2026)
- Planning is finished; **no build has started**. Live is build 71 (app 49.0), protocol VERSION 23.
- Working branch `claude/kusatma-development-yypn9g` (game repo) holds only notes and tooling: `docs/NEXT.md` (the plan), `docs/TECH.md` (technical reference moved out of CLAUDE.md), `docs/STATE.md`, `.claude/agents/` (tester, finder, shooter, builder), `.claude/commands/handoff.md`, plus the AI Studio starter (package.json, metadata.json, tools/studio-serve.mjs; not needed on main). Everything is committed and pushed; nothing half done.
- The owner's weekly usage has reset. **Next step:** wait for "start build 72", then follow the Build 72 items in `docs/NEXT.md`.
- **Deadline:** the December season must be live by 1 Aralık, so build 72 should be deployed by about 28–29 Kasım. If it runs long, ship the season calendar + December season first, the rest of 72 right after.

## The plan (details in docs/NEXT.md, Roadmap)
- **72** server + panel: monthly season calendar (Dec/Jan with new cosmetics, 350 XP/tier), editable daily/weekly quests + special days, PvP/clan on the same seasons, detailed panel logs (30 days), per-class game stats (for 74), daily backup to **Deno KV** (not R2), GitHub Actions tests in the private test repo, own Discord alerts (Cloudflare and Deno watch each other; webhook set from a panel box, stored as a secret).
- **73** look and feel: every screen polished; group-call ringing screen; badges say why; Kılıççı whirlwind ring showing on every class; grey line on a gun; doubled gold ring on an icon; lobby row showing only the name; remove the moderator voice notice from the menu entirely (owner decided after a warning); Gemini's good UI parts (not its balance); smoother late waves on phones; voice going silent + unexpected disconnects; Üşüme (Donmuş zombie chill) feels random, clear `chillUntil` on reset; Ajan ability "doesn't feel right" + check every class's ability.
- **74** weapon paths overhaul (Claude does it) + full balance of all 17 classes + piercing bullets steer to the next zombie behind.
- **75** perks, wave twists, simple objective waves, later dangers, changing map, mastery challenges; ends with a full A-to-Z test.

## Waiting on the owner
- Nothing. Voice-drop details: the owner doesn't remember; find them from logs.

## Decided (all already in NEXT.md / CLAUDE.md)
- No testing on real phones (no Firebase Test Lab, no owner devices); judge phones by throttled headless Chrome and say so.
- No R2. Links + APK note only after builds or live changes, not in chats.
- Full permission to create/run/delete subagents; Claude reviews everything they write.
- Gemini is no longer used for real work.

## Gotchas
- Cloudflare connector: Workers scripts/KV/D1/observability/tail/analytics/calls/queues work; **no Pages scope**; R2 is not enabled (and not wanted). Worker observability logs are off (turn on in 72).
- Deno API works through a saved network secret for `api.deno.com` (no env variable; the proxy injects it). Apps: `kusatma-api` (forwarder) and `umvtt-games` (site).
- Server source is private: download it with the Cloudflare connector, never commit it; refresh the test repo copy with `tools/syncworker.sh` after deploying.
- `kusatma-studio` was reset to clean build 71 (a51e17d); Gemini's later commit a5f153b only redrew turrets and is ignored. In that clone the fetch refspec had to be added by hand.
- Google Drive: only the "Kusatma" folder; uploads over ~4 MB fail through the connector.
- Pushing git tags fails here; use branches.

## Next build
- **72 on Opus, high effort.** Then 73 Opus medium, 74 Opus high, 75 Opus high (medium for the final test-and-fix). Chats and notes: Sonnet medium.
