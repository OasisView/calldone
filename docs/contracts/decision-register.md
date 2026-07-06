# Calldone — Decision Register

> **Checkpoint 3 (2026-07-06) is in force.** Rulings R23–R28 below pivot the product to
> **inbound AI reception & intake for small nonprofits** ("Calldone by Oasis") and open a
> full contract re-freeze. Where a Checkpoint 1 ruling conflicts with R23–R28 or with the
> re-frozen contract docs, **Checkpoint 3 wins.** Checkpoint 1 rulings survive as *patterns*
> where noted (canonical-types, rate-limit RPC, HMAC verification, retention cron, frozen-file
> ownership, test strategy, CI hardening, .ics single-source); rulings tied to the consumer
> outbound slice (R2, R4, R5, R7, R8, R10, R16, R19) are **superseded**.

---

## Checkpoint 3 — Oasis Alignment (approved 2026-07-06)

Verdict context: a four-agent review council returned **REMAKE** on the consumer outbound
concept (commoditized me-too; Google ships outbound calling free in Search; traction/funding
are B2B; the $0 model collapses the moment real outbound calls exist). This checkpoint changes
**strategy, not process** — the frozen-contract + decision-register + contract-check/security-pass
discipline still governs. `main` (the $0 browser demo) stays frozen; the real product still
splits into its own app (`calldone-app`).

| # | Ruling |
|---|---|
| R23 | **Beachhead locked: inbound AI reception & intake agent for small nonprofits.** The elderly/accessibility concept is preserved as the **Phase 2 expansion hypothesis**, not the beachhead. Rationale: inbound answering sits outside the TCPA outbound AI-voice consent regime; distribution is built in through the Oasis 50 nonprofit cohorts; B2B monthly pricing fixes the unit economics that killed the $0 consumer framing; senior-serving nonprofits later bridge to the accessibility market. v1 product: per-org dedicated number → warm disclosure at pickup (recorded + AI-assisted, natural phrasing, never removed) → FAQs from an org **knowledge pack** → structured **intake** (caller name, need, callback number, explicit callback-consent y/n, preferred time) → appointments + `.ics` → transcript + structured summary emailed to staff and written to the dashboard. **Human escalation is a v1 requirement** (say "person" / press 0 → staff transfer; no-answer → priority-flagged voicemail). **Outbound exists ONLY as a consented callback queue** (callers who said yes on an inbound call, consent referenced on the call, behind spend cap + non-anonymous gate + kill switch). No cold calls, ever. Hard gate: **no crisis-adjacent or sensitive hotlines in v1** — pilot only low-stakes lines (volunteer coordination, donation hours, program info). Data rules: transcripts + intake belong to the org; strict org-scoped RLS; **no cross-org learning database on call content** (policy, not just deferral); per-org retention, default 90 days, org-configurable deletion. |
| R24 | **Migration strategy: full rewrite, not additive.** All 10 tables are empty; the product is pre-launch. The applied outbound migration is NOT edited in place: the old initial migration file is **deleted** and a new inbound initial schema is authored fresh (`supabase/migrations/20260706000000_inbound_initial_schema.sql`), applied via `supabase db reset` locally and a reset of the (empty) remote project at integration. (Alternative considered and rejected: additive migration layered on the consumer-outbound schema.) |
| R25 | **Telephony architecture: managed inbound for v1** (Vapi / Retell / Bland inbound) — elevated from detail to fork because it determines ws/edge's fundamental shape: webhook consumer + function-call handler (managed) vs realtime media server (raw Twilio). Supabase Deno edge functions have execution-time limits unsuited to long-lived audio streams. The provider integration lives behind the R12-pattern abstraction: a **normalized internal `CallEvent` schema** (canonical in `_shared/api-types.ts`) **+ thin per-provider adapters**; no provider type leaks past the adapter. The provider absorbs telephony + STT + TTS + turn-taking (the old Groq-Whisper / ElevenLabs stack lines are retired from the call path; Gemini stays as the brain). **The provisional provider pick is recorded here BEFORE webhook ingestion is written** — see R25a. Twilio-direct becomes a post-launch cost-optimization checkpoint. |
| R25a | *Provisional provider pick (evaluated 2026-07-06):* **Vapi**, runner-up **Retell**, **Bland ruled out** for v1. Deciding factor — integration shape: Vapi's custom-LLM mode is a **per-turn OpenAI-compatible HTTPS streaming endpoint** (each conversational turn = one short stateless request → fits Supabase edge-function execution limits and keeps **Gemini as the brain**), while Retell's custom-LLM is a **persistent WebSocket for the life of the call** — precisely the long-lived-connection shape R25 exists to avoid; Bland runs a closed model stack (no first-class external-LLM path), is outbound-sales-biased, and voice cloning is a paid add-on. Supporting factors for Vapi: `transferCall` tool + `transfer-destination-request` webhook (R26 escalation), voicemail detection (audio/transcript modes), server-events webhook (CallEvent source), **free US test phone numbers**, **$10 trial credits (~150–200 test minutes)**, and prepaid credits with auto-reload OFF = a **hard spend ceiling** satisfying R28's prepaid cap; ElevenLabs-Multilingual voices available for the R27 Spanish fast-follow. Known caveats (accepted at pilot scale, revisit at the Twilio-direct checkpoint): third-party-measured real cost ~$0.15–0.40/min all-in and reported latency variance at high concurrency. Adapter isolation (R25) means a Retell swap stays cheap if Vapi disappoints. Account creation + any number purchase remain **money-gated**. |
| R26 | **Answering mode per org:** setting `always \| after_hours \| overflow` (overflow = ring staff first, answer on no-pickup). Captured as an onboarding question, stored in org settings. Escalation fallback defined: if the staff transfer target does not answer, take a **priority-flagged voicemail**. |
| R27 | **Language scope v1: English-first with a graceful Spanish handoff.** The agent converses in English; a Spanish-first caller gets one natural Spanish line routing them into the R26 escalation path (staff transfer → priority voicemail) — nobody is dropped. Bilingual EN/ES is the immediate fast-follow; **the R25 evaluation still scores Spanish quality** so the fast-follow cannot force a provider switch. (NYC pilot reality: a meaningful share of callers will be Spanish-first.) |
| R28 | **Guardrail carry-forward (anti-drop clause):** the prepaid spend cap, non-anonymous gate, kill switch (`CALLS_ENABLED` global + per-org `calls_enabled`), and warm-disclosure enforcement migrate **explicitly into the re-frozen `security.md` §10 acceptance criteria** — the contract rewrite cannot silently drop them. Disclosure remains enforced in code with a unit test (R22 pattern), and `inbound_calls.disclosure_played` must be recorded per call. |

**Workstream repurposing under R23:** `ws/edge` remains the critical path and is built FIRST
against the re-frozen `api.md`. `ws/calls-ui` → org **staff dashboard** (call review + history).
`ws/brainstorm-ui` → **org onboarding / knowledge-pack builder** (the voice UI teaches Calldone
about the org). `ws/auth-ui` → **real org auth with roles (admin, staff)** — anonymous sign-in
was a consumer-demo assumption and is retired. All four built branches rebase onto the CI-fixed
`rebuild/baseline` and PR into an **integration branch, never `main`**.

---

# Checkpoint 1 (approved 2026-06-10) — historical; superseded where in conflict with Checkpoint 3

These rulings reconcile the four independently drafted contracts (db, api, frontend, security)
after adversarial review found cross-draft contradictions. **The four final contract docs in
this directory embody these rulings. Where any other document disagrees, this register wins.**

Scope reminder: demo-viable slice = spec Phases 1-4. Built edge functions:
`whisper-transcribe`, `gemini-conversation`, `elevenlabs-tts`, `make-call` (demo-only),
`call-webhook`. Cut from slice: `schedule-call`, `verify-phone-*`, cron execution.
DB schema frozen for all 9 product tables now.

| # | Ruling |
|---|---|
| R1 | **One migration**: replace placeholder `supabase/migrations/00000000000000_initial_schema.sql` wholesale with the frozen DDL in `db.md` (9 product tables + `private.rate_limits` + `rate_limit_hit()` RPC + guarded pg_cron jobs). Authored at baseline by the orchestrator (it IS the contract); owned by ws/db thereafter (fixes via this file pre-merge, additive migrations after). |
| R2 | **Stateless `gemini-conversation`; the client persists** `brainstorm_sessions`/`call_scripts`/`user_facts` under RLS (spec Flow 2 §10). Hook `use-brainstorm` owns persistence incl. fact upserts. The finalize response carries script *content*, never a server-generated `script_id`. |
| R3 | **One canonical type set** in `supabase/functions/_shared/api-types.ts` (11+1-code error envelope with `retryable`; discriminator `script_finalized`; field `session_id`). Re-export shim `src/types/api.ts`; tsconfig `include` lists the shared files. ALL numeric caps, rate-limit numbers, E.164 regex, header names, poll cadence live there as exported constants — no document restates numbers except by reference. |
| R4 | **Webhook payload = rich Bland-compatible shape** (`BLAND_STATUS_MAP` normalization, zod `.passthrough()`, `metadata` correlation block). Invariant: the affected user/row is resolved from the DB row matched by `bland_call_id` (+ `metadata.call_log_id` cross-check); payload identity fields are never trusted. |
| R5 | **make-call**: reads the script via the caller-JWT-scoped client (RLS ownership check), then INSERTs `call_logs` via the service-role client. Clients have zero write policies on `call_logs`. |
| R6 | **Rate limits**: one table `private.rate_limits (bucket, key, window_start, count)` in the non-API-exposed `private` schema, accessed ONLY through the SECURITY DEFINER RPC `public.rate_limit_hit(bucket, key, window, amount)` (execute granted to service_role only; window ∈ 'hour'/'day'/'month' via `date_trunc`). Numbers (canonical copy in api-types.ts): make-call 5/h/IP + 10/day anon-uid + 20/day authed-uid; whisper 30/h/uid + 60/h/IP; gemini-conversation 60/h/uid + 120/h/IP; tts 20/h/uid requests + 60/h/IP + 1,500 chars/day/uid + **9,000 chars/month global**; anonymous sign-ins 10/h/IP (Supabase Auth dashboard setting). The `anonymous_events`-row-counting + `ip_hash` + `RATE_LIMIT_SALT` design is deleted. Client IP from the platform-trusted hop (last gateway-appended XFF entry / `x-real-ip` provided by Supabase), never the client-controlled first entry. |
| R7 | **TTS quota/failure signal**: `503 quota_exceeded` (quota) / `502 upstream_error` (other) with the standard envelope. Client `synthesizeSpeech()` returns `null` on 502/503 → browser `SpeechSynthesis` fallback + notice. Never a 200-with-fallback-payload. |
| R8 | **Anonymous users may NOT write** `user_facts`, `script_edit_events`, `script_feedback` — enforced in RLS (`is_anonymous` JWT claim) AND skipped client-side (`isAnonymous` checks in hooks). Anonymous users CAN CRUD their own `brainstorm_sessions`/`call_scripts`. |
| R9 | **`profiles.phone_number` IS client-writable** (onboarding collects it); the `reset_phone_verification` trigger auto-voids `phone_verified_at` on any phone change; `phone_verified_at` is never client-writable. |
| R10 | **`schedule-call` is CUT from the slice.** Table schema ships frozen; clients get SELECT-only on `scheduled_calls` (no INSERT/UPDATE/DELETE policies or grants until P6); no "Schedule for later" UI; request/response types stay in api-types.ts marked P6. |
| R11 | **Webhook auth = HMAC-SHA256** over `"<timestamp>.<raw body>"` with key `BLAND_WEBHOOK_SECRET`, sent as `x-calldone-signature` (hex) + `x-calldone-timestamp` (unix seconds, ±300 s tolerance), verified with a constant-time compare. make-call's demo simulator computes the same HMAC. No query-param secret anywhere, ever. P6 fallback for Bland-native delivery is pre-decided in security.md §4. |
| R12 | **Zero real-call code**: `resolveCallMode()` exists; the `"real"` arm returns `501 not_implemented` (code added to the envelope); no Bland client code; `BLAND_API_KEY` never referenced (CI grep gate). $0 Bland by absence of code, not a flag. |
| R13 | **One `supabase/functions/` tree** (full listing in api.md §2): `_shared/{api-types,ics,schemas,errors,cors,auth,supabase-admin,rate-limit,retry,gemini,prompts,demo-transcript}.ts` + `{whisper-transcribe,gemini-conversation,elevenlabs-tts,make-call}/index.ts` + `call-webhook/{index,extract,notify}.ts` + `tests/` + `deno.json`. Single owner ws/edge — EXCEPT `api-types.ts` (orchestrator, frozen) and `ics.ts` (orchestrator stubs the frozen signature; ws/edge implements; must stay dependency-free browser-safe TS because the app imports it via shim). |
| R14 | **DB row types generated** into `src/types/database.ts` (supabase gen types, or hand-derived from the frozen DDL when no local stack; drift-checked at integration). No hand-maintained second mirror. |
| R15 | **Anonymous retention = 24 h**: pg_cron job in the migration (extension-guarded so envs without pg_cron don't fail) deletes anonymous `auth.users` older than 24 h; FK cascade erases all their data. Companion daily cleanup of `private.rate_limits` rows older than 2 days. |
| R16 | **No AuthProvider context** — `App.tsx` is frozen with no session provider; session state lives in the `use-session` hook (TanStack Query + `onAuthStateChange`). `UseSessionResult` includes `linkEmail(email, password)` and `linkGoogle()` for uid-preserving anonymous→permanent upgrade. |
| R17 | **Canonical caps** (constants in api-types.ts): audio ≤ 5 MB and ≤ 60 s; TTS text ≤ 800 chars; conversation total ≤ 30,000 chars, ≤ 40 messages, ≤ 4,000 chars/message; webhook body ≤ 1 MB, transcript stored ≤ 100,000 chars; E.164 `^\+[1-9]\d{1,14}$` everywhere (DB CHECK, zod, client). Poll cadence 5 s, timeout 120 s. Transcript roles `"user" | "assistant"`. CORS env `ALLOWED_ORIGINS` (comma-separated list). Anonymous users hitting full-account routes are sent to `/signup` (never `/login`). |
| R18 | **.ics single-source** in `supabase/functions/_shared/ics.ts` (browser-safe), re-exported as `src/lib/ics.ts`; `AppointmentCard` builds the download client-side from `call_logs.appointment_details` (works for anonymous demo users); `call-webhook` still emails the .ics to authed users. |
| R19 | **Notification rule frozen**: SMS only when `is_demo === false` AND `phone_verified_at` set (unreachable in this slice — correct); email only when the auth user has an email (anonymous users do not). Twilio/Resend failures log to `call_logs.error_reason`; no notifications panel in the slice. |
| R20 | **Orchestrator-owned frozen files** (workers never touch): `package.json`+lockfile, all tsconfigs, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `index.html`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/routes.tsx`, `src/lib/{nav,supabase,edge,query-keys,phone,schemas,ics,utils}.ts`, `src/types/*`, `src/components/ui/*`, `src/components/guards/*`, `supabase/config.toml`, `supabase/functions/_shared/api-types.ts`, `.github/workflows/ci.yml`, `.env.example`, `vercel.json`, `public/robots.txt`, `README.md`, `CLAUDE.md`, `.claude/skills/**`, `docs/**`. Page/hook/ics stubs land at baseline and ownership transfers to their workstream. |
| R21 | **Test strategy**: Deno tests per edge function (fetch-mocked providers) + SQL/RLS policy tests against `supabase db reset` + Vitest for hooks/libs. This is the stated substitution for the spec's "Vitest + Supabase local" integration harness. |
| R22 | **Kept security hardening**: gitleaks + `npm audit --audit-level=high` + VITE_-allowlist grep + BLAND_API_KEY grep in CI; GH actions pinned by commit SHA; audio never stored anywhere; AI-disclosure lines enforced post-generation in code with a unit test. |

## Workstream ownership (summary; authoritative map in frontend.md §8)

| Workstream | Branch | Owns |
|---|---|---|
| ws/db | `ws/db` | `supabase/migrations/`, `supabase/seed.sql`, SQL/RLS policy tests |
| ws/edge | `ws/edge` | `supabase/functions/**` except `_shared/api-types.ts`; implements `_shared/ics.ts` |
| ws/auth-ui | `ws/auth-ui` | auth/onboarding/dashboard/profile pages + layout components + `use-session`/`use-profile` |
| ws/brainstorm-ui | `ws/brainstorm-ui` | brainstorm page/components + `use-brainstorm`/`use-audio-recorder`/`use-speech-playback` + `src/lib/audio/` |
| ws/calls-ui | `ws/calls-ui` | scripts/calls pages + calls components + `use-scripts`/`use-call-logs`/`use-make-call` |

Merge order: baseline → ws/db → ws/edge → ws/auth-ui → ws/brainstorm-ui → ws/calls-ui.
