# Where we are (read first in a new chat; updated by `/handoff`)

**Now (20 Kasım 2026):** planning done, no build started; the owner's weekly usage has reset. Next: build 72 as soon as the owner says "start build 72". Time is tight: the December season must be live by 1 Aralık, so build 72 should be finished and deployed by about 28–29 Kasım; if it runs long, ship the season calendar and December season first and the rest of 72 right after.

**Plan:** four builds in `docs/NEXT.md` (Roadmap): 72 server + panel; 73 look and feel + voice/connection/slowdown (Üşüme) + ability checks; 74 weapon paths (by Claude) + full balance + piercing bullets seek the next zombie; 75 variety features + full A-to-Z test. No real-phone testing (owner's choice).

**Waiting on the owner:** nothing. Voice-drop details unknown (owner doesn't remember); find them from logs.

**Connected:** Cloudflare (Workers scripts, KV, R2 scope though R2 is not enabled and not wanted, D1, observability, tail, analytics, calls, queues; no Pages), Deno API token (network secret on the cloud environment, host api.deno.com), GitHub (kusatma, kusatma-tests, kusatma-studio), Google Drive (Kusatma folder only). Backups go to Deno KV, not R2.

**Gotchas:** `kusatma-studio` was reset to clean build 71 (a51e17d); Gemini's later commit a5f153b only redrew turrets and is ignored. Worker server observability logs are off (turn on in build 72). Helpers in `.claude/agents/` load only in new sessions.

**Next build:** 72 on Opus, high effort.
