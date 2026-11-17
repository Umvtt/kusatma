---
description: Save where we are to docs/STATE.md so a new chat can pick up from it (run before starting a new chat).
---
Update `docs/STATE.md` so a brand-new session can continue without this chat. Rewrite it fully (keep it under ~60 lines), in English, plain and short:

- **Now:** what was being worked on, how far it got, what is half done (files, branch, uncommitted work), and the exact next step.
- **Waiting on the owner:** open questions and decisions, word for word where it matters.
- **Decided this session:** owner decisions not yet in `docs/NEXT.md` or `CLAUDE.md` (move lasting ones there too).
- **Gotchas:** anything a fresh session would trip on (tool or connector quirks, flaky tests, what was tried and failed).
- **Next build:** which build is next, and the model/effort to use (see CLAUDE.md "Model and effort").

Never write secrets, tokens, keys, webhook addresses or the owner panel's address. Then commit ("Notlar: durum özeti") and push to the working branch, and tell the owner in one line that it is saved and they can start a new chat.
