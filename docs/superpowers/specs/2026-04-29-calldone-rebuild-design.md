# Calldone Rebuild Design

**Date:** 2026-04-29
**Owner:** Manny (OasisView)
**Status:** Draft, pending user approval

## Background

Calldone is an AI phone-call agent originally built on Lovable in April 2025 (repo: `OasisView/calldone-manny`). The original used Bland AI to place outbound calls, Lovable's AI Gateway for script generation, Twilio for SMS, and Resend for email, all backed by a Supabase project the user no longer has access to.

This rebuild starts from scratch in a new private repo (`OasisView/calldone`) with three goals:

1. **Live demo** on the user's portfolio that visitors can safely interact with.
2. **Resume piece** showcasing real-world AI integration work.
3. **Open path** to becoming a real product later.

The rebuild also pivots away from rigid form-based templates toward a **voice-driven, learning-style script creation flow**.

## Goals (in priority order)

1. Strip every Lovable dependency. The new project must work standalone with the user's own infrastructure and accounts.
2. Make script creation feel conversational, not form-based. The user talks to the app to brainstorm what they want said.
3. Make the system feel like it learns the user over time without literal model training (RAG + per-user context + feedback signals).
4. Keep the demo safe and free to leave online (demo mode, phone verification, low-cost LLM/voice stack).
5. Stay portable to Next.js if the project grows into a polished product.

## Non-Goals

- Real-time interruptible voice (OpenAI Realtime API) at MVP.
- Fine-tuning or training a custom model on user data.
- Storing PHI in a HIPAA-compliant manner. Any health-related demo data is treated as transient and not retained for training.
- Calling arbitrary phone numbers without verification.
- Building inbound call handling, call mediation, or workflow automation features.

## Stack and Key Decisions

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind + shadcn/ui | Reuses original stack, fastest path |
| Landing pre-render | `vite-react-ssg` | Closes 90% of SEO gap without Next.js rewrite |
| Auth & DB | Supabase (fresh project) | Built-in auth, RLS, edge functions, free tier |
| Backend logic | Supabase Edge Functions (Deno/TS) | Same as original, hides server-side API keys |
| LLM (script gen + brainstorm) | Google Gemini 2.5 Flash (direct API, free tier) | Free, large context, fast |
| Voice transcription | Whisper via Groq (free tier) | Free, fast, accurate |
| Voice synthesis | ElevenLabs (free tier ~10K chars/mo), browser TTS fallback | Natural voice for demo, graceful degradation |
| Outbound calls | Bland AI | Same as original, simplest provider |
| SMS | Twilio | Same as original |
| Email | Resend | Same as original, generous free tier |
| Hosting | Vercel (frontend), Supabase (backend) | $0/month at idle |

### Migration-friendliness for future Next.js move

Two patterns baked in from day one:

1. **All data fetching in custom hooks** (`useScripts`, `useCallLogs`, `useUserFacts`, etc). Components never call Supabase directly. Migration to Server Components later is hook-by-hook, not page-by-page.
2. **Thin navigation layer** (`src/lib/nav.ts`). One file owns navigation. Pages call `nav.toDashboard()` instead of `useNavigate()`. Migration to Next.js `useRouter` is one file changed.

## High-Level Architecture

```
                   ┌─────────────────────────────┐
                   │  Vercel (Vite SPA + landing)│
                   │  - / (pre-rendered)         │
                   │  - /dashboard               │
                   │  - /brainstorm (voice UI)   │
                   │  - /scripts                 │
                   │  - /calls                   │
                   │  - /profile                 │
                   └──────────────┬──────────────┘
                                  │
                                  │ supabase-js
                                  ▼
                   ┌─────────────────────────────┐
                   │  Supabase                   │
                   │  - Auth (email, Google)     │
                   │  - Postgres + RLS           │
                   │  - Edge Functions ↓         │
                   └──────────────┬──────────────┘
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │                         │                          │
        ▼                         ▼                          ▼
┌───────────────┐     ┌───────────────────┐      ┌────────────────┐
│  Gemini Flash │     │  Bland AI         │      │  Twilio + Resend│
│  Groq Whisper │     │  (outbound calls) │      │  (notifications)│
│  ElevenLabs   │     └────────┬──────────┘      └────────────────┘
└───────────────┘              │
                               │ webhook
                               ▼
                   ┌─────────────────────────────┐
                   │ call-webhook edge function  │
                   │  - parse transcript         │
                   │  - extract appointment      │
                   │  - send SMS + email + .ics  │
                   └─────────────────────────────┘
```

## Core User Flows

### Flow 1: Onboarding
1. User signs up (email or Google via Supabase Auth).
2. App creates a `profiles` row.
3. Brief onboarding asks for first name, time zone, communication style preference (formal/casual/direct), and (optional) phone number for SMS notifications and call verification.
4. User lands on dashboard.

### Flow 2: Voice-driven script creation (the new core experience)
1. User clicks "New call" on dashboard, lands on `/brainstorm`.
2. UI shows a single mic button and a transcript area.
3. User taps mic, speaks ("I want to call my pharmacy and refill my blood pressure medication").
4. Browser records audio, sends to `whisper-transcribe` edge function (which proxies to Groq Whisper).
5. Transcribed text is added to the conversation. Sent to `gemini-conversation` edge function with the user's profile facts and recent script history as context.
6. Gemini responds with a clarifying question or asks for missing details ("Which pharmacy?").
7. Response is sent to ElevenLabs via `elevenlabs-tts` edge function and played in the browser.
8. Loop until Gemini has enough info to draft a script.
9. Gemini emits a structured `{ script_text, call_purpose, target_phone_hint, extracted_facts }` JSON via tool-calling.
10. App saves the script to `call_scripts` and any new facts to `user_facts`. Navigates to script review.

### Flow 3: Script review and call placement
1. User sees the generated script in an editor.
2. User can edit. Edits are diffed against the original and stored as a `script_edit_event` (signal for future style learning).
3. User enters target phone number (or accepts the AI's hint).
4. User clicks "Call now" or "Schedule for later."
5. **Demo mode (default)**: `make-call` returns a simulated call_id and triggers a fake webhook 30 seconds later with a canned realistic transcript. No real outbound call placed. Cost: $0.
6. **Real call mode (gated)**: requires verified phone number on profile. Bland AI is invoked. Real webhook arrives async.
7. User sees a "Call in progress" state with live status.

### Flow 4: Post-call processing
1. `call-webhook` receives Bland's payload (or simulated payload in demo mode).
2. Updates `call_logs` with status, duration, transcript.
3. If status is `completed`, runs Gemini tool-call to extract appointment details from transcript.
4. If appointment confirmed: stores `appointment_details`, generates `.ics`.
5. Sends SMS via Twilio (if user has verified phone).
6. Sends email via Resend with transcript summary and `.ics` attachment if applicable.
7. User can view full transcript and call history at `/calls`.

## Database Schema

All user-owned tables have RLS policies restricting access to `auth.uid() = user_id`.

### `profiles`
- `id` UUID (FK to `auth.users.id`), PK
- `display_name` TEXT
- `phone_number` TEXT (E.164, verified via OTP if used)
- `phone_verified_at` TIMESTAMPTZ
- `time_zone` TEXT (IANA, e.g., `America/New_York`)
- `communication_style` JSONB (`{ tone: "casual", greeting: "...", signoff: "..." }`)
- `created_at`, `updated_at`

### `user_facts`
Things the agent has learned (or been told) about the user. Used as RAG context.
- `id` UUID PK
- `user_id` UUID FK
- `key` TEXT (e.g., `primary_pharmacy`, `insurance_provider`, `home_address`)
- `value` TEXT
- `source` TEXT (`onboarding`, `brainstorm`, `manual`)
- `confidence` REAL (0-1, AI-extracted facts may be lower)
- `created_at`, `updated_at`

### `brainstorm_sessions`
Each voice conversation that produces a script.
- `id` UUID PK
- `user_id` UUID FK
- `transcript` JSONB (array of `{role, text, audio_url?}`)
- `resulting_script_id` UUID FK to `call_scripts` (nullable until completed)
- `created_at`

### `call_scripts`
- `id` UUID PK
- `user_id` UUID FK
- `script_text` TEXT
- `call_purpose` TEXT
- `source` TEXT (`brainstorm`, `manual_edit`, `duplicated`)
- `brainstorm_session_id` UUID FK (nullable)
- `is_favorite` BOOLEAN
- `created_at`, `updated_at`

### `script_edit_events`
Captures user edits as a learning signal.
- `id` UUID PK
- `user_id` UUID FK
- `script_id` UUID FK
- `original_text` TEXT
- `edited_text` TEXT
- `created_at`

### `call_logs`
- `id` UUID PK
- `user_id` UUID FK
- `script_id` UUID FK (SET NULL on delete)
- `bland_call_id` TEXT
- `is_demo` BOOLEAN
- `phone_number_called` TEXT
- `status` TEXT (`initiated`, `ringing`, `completed`, `failed`, `no_answer`, `busy`)
- `transcript` TEXT
- `duration_seconds` INTEGER
- `appointment_details` JSONB (extracted by AI; null if no appointment)
- `confirmation_detected` BOOLEAN
- `created_at`, `updated_at`

### `scheduled_calls`
- `id` UUID PK
- `user_id` UUID FK
- `script_id` UUID FK
- `scheduled_for` TIMESTAMPTZ
- `phone_number` TEXT
- `status` TEXT (`pending`, `placed`, `failed`, `cancelled`)
- `call_log_id` UUID FK (filled when executed)
- `created_at`

### `script_feedback`
- `id` UUID PK
- `user_id` UUID FK
- `script_id` UUID FK
- `rating` SMALLINT (1 = 👎, 5 = 👍)
- `note` TEXT (optional)
- `created_at`

### `anonymous_events`
Aggregate analytics, no PII. For improving defaults, not training.
- `id` BIGSERIAL PK
- `event_type` TEXT (e.g., `script_generated`, `call_completed`, `appointment_extracted`)
- `metadata` JSONB (counts, types, but no transcripts or contact info)
- `created_at`

## Edge Functions

| Function | Purpose | Auth | Secrets used |
|---|---|---|---|
| `whisper-transcribe` | Proxy browser audio to Groq Whisper | JWT required | `GROQ_API_KEY` |
| `gemini-conversation` | Multi-turn brainstorm conversation, returns next agent reply or finalized script via tool-call | JWT required | `GEMINI_API_KEY` |
| `elevenlabs-tts` | Generate audio from text, return audio URL or stream | JWT required | `ELEVENLABS_API_KEY` |
| `make-call` | Place outbound call via Bland AI; in demo mode, simulate | JWT required | `BLAND_API_KEY` |
| `schedule-call` | Insert into `scheduled_calls` table | JWT required | none |
| `call-webhook` | Receive Bland webhook, update logs, extract appointment, send notifications | NO JWT (Bland calls it); validate with shared secret | `BLAND_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `TWILIO_*`, `RESEND_API_KEY` |
| `verify-phone-start` | Send OTP to user's phone via Twilio Verify | JWT required | `TWILIO_*` |
| `verify-phone-confirm` | Validate OTP, mark `phone_verified_at` | JWT required | `TWILIO_*` |
| `cron-execute-scheduled-calls` | Runs every 5 min via `pg_cron`, picks up due `scheduled_calls`, invokes `make-call` flow | service-role internal | (pulls from above) |

## Demo Safety Design

The default state of the app is **demo mode**, controlled by an env flag that gates the actual Bland AI invocation. This is the most important safety feature.

### Default behavior (no signup required)
- Visitor lands on `/`, sees the marketing page.
- Clicks "Try the demo," lands on a sandbox brainstorm UI.
- Voice brainstorm works for real (uses Groq Whisper + Gemini + ElevenLabs).
- Script generation works for real.
- "Call now" returns a simulated success with a realistic canned transcript and triggers the same downstream UI as a real call. No phone number actually called. No SMS sent.
- Visitor can browse the resulting transcript and `.ics` to see the full flow.

### Authenticated user with verified phone
- After signup and Twilio Verify OTP confirmation, user can place real calls.
- For MVP, real-call mode only allows calling the user's own verified phone number (so they can hear the agent calling them). This is the safest possible "real call" demo.
- "Bring your own Bland API key" path for users who want to call arbitrary numbers, with a clear disclaimer about TCPA compliance.

### In-script disclosures (always-on)
Every generated script includes:
- "Hi, this is an AI assistant calling on behalf of [user name]."
- "This call may be recorded."

These are baked into the system prompt for `gemini-conversation` so they always appear in generated scripts. Cheap insurance against bot-disclosure laws (CA SB 1001) and two-party consent recording statutes.

### Rate limits
- Per-IP: 5 demo calls/hour
- Per-user: 20 real calls/day (MVP cap, raisable later)

## Personalization Layer (the "learns from you" feel)

Three lightweight mechanisms, no model training:

1. **Per-user context injection** (RAG): on every script generation, pull from `user_facts`, `profiles.communication_style`, and the user's last 3 successful scripts. Inject into the Gemini system prompt. Result: "the system remembers me."

2. **Implicit style learning**: when a user edits a generated script, store the diff. Periodically (or on-demand), summarize edit patterns into a `style_summary` field on the profile. Future generations get the summary in context.

3. **Explicit feedback**: 👍/👎 on each script. Negatives surface in the user's history with a "tweak this" affordance. Aggregate negatives flag prompt issues for the developer.

## Migration Path to Next.js (preserved)

When the user is ready to upgrade for SEO/polish:

1. Swap `react-router-dom` routes for App Router file structure (`src/pages/Foo.tsx` → `app/foo/page.tsx`). One file move per route.
2. Swap `useNavigate` references in `src/lib/nav.ts` (one file) for `useRouter`.
3. Replace `vite-react-ssg` landing pre-rendering with native Next.js SSG.
4. Rename `VITE_*` env vars to `NEXT_PUBLIC_*`.
5. Edge functions, Supabase schema, components, business logic: untouched.

Estimated effort: a focused weekend of work.

## Error Handling

- **LLM failures (Gemini/Whisper)**: retry with exponential backoff (up to 3 tries). On final failure, return a typed error to the client and show a toast. Brainstorm session preserved so user can retry without losing state.
- **ElevenLabs failures or quota exhaustion**: fall back to browser `SpeechSynthesis`. User sees a small notice "premium voice unavailable, using browser voice."
- **Bland AI failures**: log to `call_logs` with status `failed` and error reason. Send user an SMS/email if notification channels are set up. Refund any usage credit (future).
- **Twilio/Resend failures**: log and surface in dashboard "notifications" panel. Don't block the call from succeeding.
- **Webhook authentication failures**: return 401 immediately, do not process. Log all rejected webhooks for monitoring.
- **Scheduled call cron failures**: each run is idempotent. Failed calls remain in `pending` and are retried next run, with a max retry count of 3 before being marked `failed`.

## Testing Strategy

### Unit tests (Vitest)
- Prompt builder: given user profile + facts + brainstorm transcript, produces expected system prompt.
- Transcript appointment extractor: given a transcript, returns expected appointment JSON or null.
- iCalendar generator: given appointment object, returns valid `.ics` content.
- Phone number validation and E.164 normalization.

### Integration tests (Vitest + Supabase local)
- Edge functions exercised against a local Supabase stack.
- Bland AI, Twilio, Resend, and Gemini mocked at the fetch layer.
- Each major edge function has a happy path test plus 1-2 failure mode tests.

### Manual test plan (browser-based)
- Voice flow: full brainstorm conversation, script generation, simulated call, transcript display.
- Demo mode: confirms no real call is placed.
- Real call mode: requires verified phone, calls user's own number.
- Mobile responsive: brainstorm UI on iPhone Safari and Chrome Android.
- Accessibility: keyboard nav, mic button works with screen reader, transcript readable.

### CI
- GitHub Actions: lint + typecheck + unit tests on every PR.
- Manual deploy via Vercel CLI for now (auto-deploy from main set up later).

## Phased Implementation

| Phase | Scope | Rough size |
|---|---|---|
| **0** | Repo scaffold, Supabase project, env management, Vercel setup, vite-react-ssg config | 1-2 days |
| **1** | Auth + dashboard shell + landing page + onboarding | 2-3 days |
| **2** | Voice brainstorm: Whisper + Gemini conversation + ElevenLabs, no calls yet | 4-5 days |
| **3** | Script review + Bland AI call execution (demo mode only) | 2-3 days |
| **4** | Webhook + appointment extraction + SMS + email + .ics | 2-3 days |
| **5** | Personalization: facts, style, history, feedback | 3-4 days |
| **6** | Real call mode: phone verify + safety features + rate limits | 2-3 days |
| **7** | Polish: analytics, observability, marketing copy, demo Loom | 2-3 days |

Total rough estimate: **3-4 weeks** of focused work.

Each phase is independently deployable. Demo viability hits at the end of Phase 4.

## Open Questions / Decisions Deferred to Implementation

1. Exact UI/UX of the brainstorm interface (mic button placement, conversation visualization). Will iterate on the live thing.
2. Specific Tailwind theme and design system. Reuse shadcn defaults at first, theme later.
3. Whether to use Supabase Realtime for live transcript streaming during calls. Probably yes in Phase 4, but optional.
4. Domain choice (`calldone.oasisview.dev` vs `calldone.app` vs other). Defer until ready to deploy.
