---
name: verify-app
description: Launch the Vite dev server and drive the Calldone demo flow end to end via the Preview MCP to confirm a change works in the real app. Use when asked to verify a feature, confirm a fix, smoke-test the browser demo, or screenshot the running app — not just run unit tests.
---

# verify-app

Verify a change by running the app and observing real behavior. Tests prove logic; this proves the user-facing flow.

## Workflow

1. **Start the server.** Run `npm run dev` (Vite, default `http://localhost:5173`). If a build-time failure appears, fix the obvious env/config issue first (the app uses a lazy `getSupabase()`, so it must boot with placeholder env). Use placeholder env if `.env` is absent: `VITE_SUPABASE_URL=https://placeholder.supabase.co`, `VITE_SUPABASE_ANON_KEY=placeholder`.
2. **Open in Preview MCP.** Use `preview_start` against the dev URL, then `preview_snapshot`/`preview_screenshot` to capture the initial render.
3. **Drive the core demo flow** (matches the frozen route guards in `src/components/guards/*`):
   - Landing page renders with NO anonymous session minted (crawler-safe; security.md §1.1).
   - Click "Try the demo" → reaches `/brainstorm`; the anonymous session is created lazily here.
   - Brainstorm: record/transcribe a turn, get an agent reply, finalize a script (verify both AI disclosures appear in the script text).
   - Script review (`/scripts`) → start a demo call (`/calls`): the `is_demo` badge MUST render; status moves via polling `call_logs`, never a client mutation.
   - Confirm the transcript and any appointment `.ics` download appear.
4. **Check the console.** `preview_console_logs` / `preview_network` for errors, failed requests, or CSP violations.
5. **Report** with screenshots and a pass/fail per step. Capture the exact failing step and console output on failure; do not claim success without evidence (verification-before-completion).

## Guardrails
- Only the demo path is reachable with no real secrets; real-call mode returns `501 not_implemented` by design (R12). A 501 on a real call is correct, not a bug.
- Never assert a step passed from code reading alone — observe it in the running app.
