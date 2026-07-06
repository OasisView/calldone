# API Contract — Calldone by Oasis (Checkpoint 3: inbound reception & intake)

**Status: FROZEN** (Checkpoint 3, 2026-07-06). Canonical artifact:
`supabase/functions/_shared/api-types.ts` — **types/constants there win over this prose**.
Rulings R23–R28 in `decision-register.md`. The consumer-outbound API (whisper-transcribe /
gemini-conversation / elevenlabs-tts / make-call / call-webhook) is retired; its types survive
only in the fenced transitional-compat section of api-types.ts until the worker repurpose.

## 1. Architecture (R25)

The managed voice provider (provisional: **Vapi**, R25a) owns telephony + STT + TTS +
turn-taking. Our Supabase Deno edge functions are **stateless, short-lived HTTPS handlers** —
no long-lived sockets, no audio bytes ever touch our code:

```
caller ⇄ PSTN ⇄ Vapi (voice, STT/TTS, turn-taking)
                 │  per-turn HTTPS chat.completions       │ lifecycle webhooks
                 ▼                                        ▼
        agent-brain (edge fn)                    provider-webhook (edge fn)
        Gemini + knowledge pack + tools          adapter → CallEvent → DB
                 └────────────── service_role Postgres ──────────────┘
                                    (RLS'd staff dashboard reads via supabase-js)
```

- **Adapter boundary (R25):** `_shared/adapters/<provider>.ts` maps raw provider payloads to
  the normalized `CallEvent` and provider-specific control responses. **No provider type leaks
  past the adapter.** Swapping Vapi→Retell touches adapters only.
- The staff dashboard does NOT call edge functions in v1 — it reads/writes Postgres directly
  through supabase-js under RLS (frontend.md). Both edge functions are server-to-server.

## 2. Module tree (`supabase/functions/`) — single owner ws/edge

```
_shared/
  api-types.ts     (orchestrator-owned, FROZEN)
  ics.ts           (frozen browser-safe signature; ws/edge implements — R18 pattern)
  errors.ts        jsonError(code, message, retryable?, details?) → Response w/ envelope
  schemas.ts       zod validators: CallEvent, tool args, brain request (Deno zod@3.25.76 pinned)
  adapters/vapi.ts verify + normalize + control-response builders (see §3/§4)
  call-events.ts   ingestion: idempotency, org routing, inbound_calls upserts
  supabase-admin.ts service-role client (pinned @supabase/supabase-js@2.58.0)
  rate-limit.ts    rate_limit_hit wrapper using RATE_LIMITS.<key>.bucket
  gemini.ts        Gemini 2.5 Flash chat + tool-calling (GEMINI_API_KEY)
  prompts.ts       system prompt builder (disclosure template + KB + intake policy + R26/R27 rules)
  kb.ts            published-pack loader, LIMITS.KB_PACK_MAX_CHARS budget enforcement
  intake.ts        capture_intake/book_appointment persistence + callback enqueue (consent-guarded)
  summary.ts       post-call summary via Gemini + Resend email (+ .ics attachment when booked)
  retry.ts         exponential backoff ×3 for provider/Gemini/Resend calls
provider-webhook/index.ts
agent-brain/index.ts
tests/             Deno tests, fetch-mocked providers (see security.md §10 ws/edge)
deno.json + deno.lock (exact-version pins)
```

## 3. `provider-webhook` — POST, server-to-server

- **Auth:** adapter verifies the provider's documented mechanism against
  `PROVIDER_WEBHOOK_SECRET` (Vapi: configured server-secret header), constant-time compare.
  Missing/wrong → `401 unauthorized` (empty details, no echo). Non-POST → `405`.
- **Body:** raw ≤ `LIMITS.WEBHOOK_BODY_MAX_BYTES` (else `413`); malformed → `400` with zod issues
  summarized (never the raw body).
- **Pipeline:** adapter → `CallEvent` → idempotency (unique `(provider, provider_event_id)`;
  duplicate → `200 {received:true, processed:false, reason:"already_processed"}`) → org routing
  by `org_phone_e164 → phone_numbers.e164` (unknown number → `200 processed:false,
  reason:"unknown_number"`, logged, no row created) → rate limit
  `RATE_LIMITS.webhookEventsPerCall` (bucket key = provider_call_id; over → `429` + Retry-After).
- **Effects by type** (all service-role):
  - `call.started` → insert `inbound_calls` (status `in_progress`) + `call_events` row.
  - `transcript.updated` → append turns (cap `LIMITS.TRANSCRIPT_MAX_TURNS` /
    `TRANSCRIPT_STORED_MAX_CHARS`); set `disclosure_played = true` when the first assistant
    utterance contains all `DISCLOSURE_REQUIRED_SUBSTRINGS` (case-insensitive) (R28).
  - `transfer.initiated` / `voicemail.left` → status/escalation updates (R26).
  - `call.ended` → finalize: duration, terminal status, `usage_add_minutes(org, minutes)`,
    summary via `summary.ts` (≤ `SUMMARY_MAX_CHARS`), Resend email to `orgs.notification_email`
    (rate-limited `summaryEmailsPerOrg`; failure → `inbound_calls.error_reason`, never a 5xx to
    the provider), intake finalize + **consent-guarded** callback enqueue.
- **Response:** `200 {received:true, processed:boolean, reason?}` — mirrors the R4-pattern shape.

## 4. `agent-brain` — POST, OpenAI-compatible `chat.completions` (Vapi custom-LLM)

- **Auth:** header `BRAIN_SECRET_HEADER` constant-time-equals env `BRAIN_SECRET` → else `401`.
  Body ≤ `LIMITS.BRAIN_BODY_MAX_BYTES` → else `413`. Rate limit `brainTurnsPerCall`.
- **Request:** OpenAI chat body; Vapi supplies call metadata (call id, dialed number) in its
  custom-LLM payload — the adapter extracts `{provider_call_id, org_phone_e164}`.
- **Per turn:** resolve org (+ published pack via `kb.ts`) → build system prompt (`prompts.ts`):
  `DISCLOSURE_GREETING_TEMPLATE_EN` with `{org_name}` **as the mandatory first utterance**,
  KB content, intake-collection policy (name → need → callback number → **explicit consent
  question** → preferred time), R26 escalation rules ("person"/DTMF `ESCALATION_DTMF`),
  R27 language rule (English; detected Spanish → speak `SPANISH_HANDOFF_LINE_ES`, then
  escalate), `CALL_MAX_MINUTES` wrap-up → call Gemini (`gemini.ts`, retry ×3) → execute tool
  calls **inline** (`intake.ts`): `capture_intake` upserts `intake_records`;
  `book_appointment` validates ISO + writes `AppointmentDetails`; `request_transfer` /
  `take_voicemail` / `end_call` return **adapter-built control responses** (Vapi transferCall /
  end-call payloads) — the provider executes them.
- **Kill switches (R28), checked BEFORE Gemini:** env `CALLS_ENABLED=false` (global) or
  `orgs.calls_enabled=false` (per-org) or monthly minutes ≥ `orgs.monthly_minutes_cap` → the
  turn returns a short polite line + transfer/voicemail control (no Gemini call, no new intake).
- **Response:** OpenAI-compatible streaming (SSE) completion. Gemini failure after retries →
  a fixed apologetic line + transfer control (**never silence, never a 5xx mid-call**).

## 5. Errors, rate limits, CORS

- Envelope: `ApiErrorBody` (12 codes, `retryable` per `RETRYABLE_CODES`) — unchanged pattern.
- 429s carry `RATE_LIMIT_HEADERS.retryAfter`. All limits + bucket strings: `RATE_LIMITS`.
- **CORS: no browser origin is granted** — both functions reject preflight (server-to-server
  only). `ALLOWED_ORIGINS` is reserved for future browser-called functions.
- Logging: never log transcripts, caller numbers, headers, or secrets (structured event names
  + ids only).

## 6. Provider configuration contract (applied at E2E setup; money-gated)

The Vapi assistant is configured with: our `agent-brain` URL as the custom-LLM endpoint
(+ `BRAIN_SECRET_HEADER`), our `provider-webhook` URL as the server-events URL (+ secret),
first-message mode = assistant-speaks-first (the disclosure greeting), voicemail detection ON,
`transferCall` destination = `orgs.escalation_phone`, max call duration = `CALL_MAX_MINUTES`.
Test numbers only until the E2E acceptance passes (plan §guardrails).
