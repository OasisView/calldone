---
name: security-pass
description: Run a workstream's security acceptance checklist from security.md §10 (the testable per-workstream criteria) before merge. Use when finishing a ws/db, ws/edge, ws/auth-ui, ws/brainstorm-ui, or ws/calls-ui branch and you need to demonstrate each security criterion passes.
---

# security-pass

Every item in `docs/contracts/security.md §10` is testable and must be demonstrated (Deno test, Vitest, CI grep, or SQL/RLS test against `supabase db reset`) before merge. This skill runs the checklist for one workstream.

## Workflow

1. **Identify the workstream** from the branch (ws/db, ws/edge, ws/auth-ui, ws/brainstorm-ui, ws/calls-ui) and open the matching §10 subsection.
2. **Run the shared CI grep gates** (apply to every workstream, security.md §3.2 / §5.4):
   - `git grep -nE 'VITE_(GEMINI|GROQ|ELEVEN|BLAND|TWILIO|RESEND|SERVICE_ROLE)' -- src/` → empty.
   - `grep -RhoE 'import\.meta\.env\.VITE_[A-Z_]+' src/ | sort -u` → exactly `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
   - `grep -r "BLAND_API_KEY" supabase/functions/ src/` → empty (R12).
   - `grep -r "dangerouslySetInnerHTML" src/` → empty.
   - `grep -r "service_role" src/` → empty.
   - `grep -r "call-webhook" src/` → empty (client never reaches the webhook).
3. **Run the workstream-specific criteria**, e.g.:
   - **ws/db:** RLS-on-all-9, policy matrix, `profiles` column grant + trigger, anon-denial, cascade-to-zero-orphans + cron jobs exist (use the db-migrate test suite).
   - **ws/edge:** 401-on-three-cases per function, webhook HMAC + replay + metadata-mismatch, zod rejections, 429 + Retry-After, `501` real-arm, stateless gemini, CORS allowlist, disclosure enforcement (use edge-fn-test).
   - **ws/auth-ui:** SSG build green with placeholder env, lazy anon session only on demo entry, PKCE, uid preserved on link, guards redirect anon to `/signup` not `/login` (R17).
   - **ws/brainstorm-ui:** recorder hard-stops at caps, no `dangerouslySetInnerHTML`, `synthesizeSpeech()` null on 502/503 + fallback notice, 429 cooldown not retry loop, anon skips `user_facts` writes.
   - **ws/calls-ui:** shared `E164_REGEX`, `is_demo` badge always renders, no `call-webhook` ref, status from polling only, client-side `.ics` via shared module with escaping tested in the shared module.
4. **Report** each criterion with its evidence (command output, test name, or screenshot) and a pass/fail. Any failing item blocks merge — fix and re-run; never wave through with assertions instead of evidence.
