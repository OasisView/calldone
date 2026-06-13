---
name: edge-fn-test
description: Scaffold and run Deno tests for Calldone Supabase edge functions with mocked AI/call providers (Groq, Gemini, ElevenLabs, Bland webhook). Use when implementing or testing functions under supabase/functions/** (ws/edge work) — auth gates, zod validation, rate limits, webhook HMAC, disclosure enforcement.
---

# edge-fn-test

Edge functions are Deno. Tests run via `deno test --allow-env supabase/functions` (also `npm run test:edge`). CI runs Deno directly in the `deno` job. No real provider keys — every upstream is mocked.

## Workflow

1. **Co-locate tests** next to the function: `supabase/functions/<fn>/<fn>.test.ts`, importing the handler directly (not over HTTP). Import zod pinned: `import { z } from "npm:zod@3.25.76"`; pin every import to an exact version (no floating esm.sh).
2. **Mock providers.** Stub `fetch` (Groq/Gemini/ElevenLabs/Bland webhook URL) so no network call is made. Cover success, upstream 5xx → `502 upstream_error`, and quota → `503 quota_exceeded` (never a 200-with-fallback). Inject `Deno.env` values for the test.
3. **Required coverage per security.md §10 (ws/edge):**
   - Auth: every function except `call-webhook` returns 401 for (a) no Authorization header, (b) garbage JWT, AND (c) the bare anon key (the §1.3 gotcha — anon key is a valid signed JWT but has no user).
   - `call-webhook`: 401 on missing/invalid `x-calldone-signature` and out-of-window `x-calldone-timestamp`; a valid HMAC over `"<timestamp>.<rawBody>"` is accepted; a replayed terminal payload is a 200 no-op; `metadata.call_log_id` mismatch → `200 {processed:false, reason:"metadata_mismatch"}` (never 4xx); compare is timing-safe.
   - zod: audio > `LIMITS.AUDIO_MAX_BYTES` → 413; TTS > `LIMITS.TTS_TEXT_MAX_CHARS` → 400; non-`E164_REGEX` phone → 400; messages over `LIMITS.MESSAGES_MAX` / `LIMITS.CONVERSATION_MAX_TOTAL_CHARS` → 400. Envelope is the 12-code `API_ERROR_CODES` shape; 400 code is `invalid_request`; never reflect input.
   - Rate limits: 429 + `Retry-After` (make-call IP bucket, global TTS char counter have explicit tests).
   - `resolveCallMode()` `"real"` arm → `501 not_implemented` (R12); `gemini-conversation` has no `.from(` (stateless, R2); CORS reflects only `ALLOWED_ORIGINS` entries (test a hostile Origin).
   - Disclosure: model output missing the two disclosure lines → returned script content contains them anyway.
4. **Run** `deno test --allow-env supabase/functions` and confirm green before merge.

## Guardrails
- `grep -r "BLAND_API_KEY" supabase/functions/` must return nothing (R12).
- No `console.log` of request bodies, transcripts, phone numbers, emails, or Authorization headers.
