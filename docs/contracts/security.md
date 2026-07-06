# Security Contract — Calldone by Oasis (Checkpoint 3: inbound reception & intake)

**Conformance:** embodies the Decision Register through **R28** (`docs/contracts/decision-register.md` — Checkpoint 3 wins over Checkpoint 1 where they conflict). Canonical constants: `supabase/functions/_shared/api-types.ts`. Canonical DDL: `supabase/migrations/20260706000000_inbound_initial_schema.sql`. Scope: v1 nonprofit inbound product — 2 edge functions (`provider-webhook`, `agent-brain`), 10 org-scoped tables, staff dashboard via supabase-js under RLS.

---

## 1. Authentication & Authorization

### 1.1 Auth model (R23 — anonymous sign-in RETIRED)
- Org staff authenticate with **real accounts only**: email+password (confirmations ON in prod) and Google OAuth, **PKCE** (`flowType: 'pkce'`). `enable_anonymous_sign_ins = false` in config.toml AND the hosted dashboard. There is no anonymous product surface; the `anon` role has zero table/function grants (migration-enforced).
- Redirect allowlist: exact URLs only — `http://localhost:5173`, `http://127.0.0.1:5173`, production origin. Nothing wildcarded.
- `profiles` row auto-created per auth user (trigger). Session handling: `persistSession`, `autoRefreshToken`, lazy memoized `getSupabase()` (SSG builds with placeholder env). No AuthProvider context (R16 pattern); session state lives in `use-session`.

### 1.2 Authorization = org membership + role
- Every product table is org-scoped; RLS policies call `private.is_org_member(org_id)` / `private.is_org_admin(org_id)` (SECURITY DEFINER, locked search_path).
- Full table/column matrix: **db.md §2 is the authoritative matrix** (this doc doesn't restate it). Load-bearing rows: `inbound_calls`/`call_events`/`phone_numbers` are client-read-only; `intake_records` staff-writable only on `(status, staff_notes)`; `callback_queue` only on `(status, scheduled_for)` with trigger-enforced transitions; `orgs.monthly_minutes_cap` is service-role-only even for admins; `call_events` SELECT is admin-only.
- **Cross-org isolation is the #1 property of this product** (org data confidentiality): every RLS test suite item asserts a member of org A sees zero org-B rows.

### 1.3 Edge functions (server-to-server; both `verify_jwt = false`)
| Function | Auth | DB access |
|---|---|---|
| `provider-webhook` | per-adapter provider verification against `PROVIDER_WEBHOOK_SECRET`, constant-time; 401 otherwise | service-role writes (calls/events/intake/callbacks) |
| `agent-brain` | `BRAIN_SECRET_HEADER` constant-time-equals `BRAIN_SECRET`; 401 otherwise | service-role reads (org, KB) + intake writes |
No browser ever calls these; **CORS grants no origin** (api.md §5). The staff dashboard talks to Postgres via supabase-js + RLS only.

## 2. Input validation
- zod at both function boundaries (`_shared/schemas.ts`, pinned `npm:zod@3.25.76`): CallEvent shape, tool args (`CaptureIntakeArgs`, `BookAppointmentArgs`, …), brain request. Failures → envelope `invalid_request`, never echoing the raw payload.
- Size caps before body parse: `LIMITS.WEBHOOK_BODY_MAX_BYTES` (1 MB) / `LIMITS.BRAIN_BODY_MAX_BYTES` (256 KB) → 413.
- All numbers/enums/regex: `api-types.ts` (single reference; DB CHECKs mirror them — migration wins on divergence).

## 3. Secrets
| Name | Lives in | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Vercel env / local `.env` / CI placeholders | the only two VITE_ vars (grep-gated) |
| `GEMINI_API_KEY` | Supabase function secrets | brain; free tier, no billing account |
| `RESEND_API_KEY` | Supabase function secrets | staff summary email (SET 2026-07-06) |
| `PROVIDER_WEBHOOK_SECRET` | Supabase function secrets + provider dashboard | 32+ random bytes; rotate: new → set both sides → verify → revoke |
| `BRAIN_SECRET` | Supabase function secrets + provider custom-LLM header config | same rotation pattern |
| `CALLS_ENABLED`, `ALLOWED_ORIGINS` | function env (non-secret) | R28 global kill switch; CORS reserve |
| `SUPABASE_SERVICE_ROLE_KEY` | platform-injected | never leaves the edge runtime |
| **Retired:** `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `BLAND_WEBHOOK_SECRET` | — | provider absorbs STT/TTS (R25) |
| **Never set (money-gated/deferred):** `BLAND_API_KEY`, `TWILIO_*` | — | CI grep gate on BLAND_API_KEY stays |
CI runs with placeholder VITE_ values only; gitleaks + `npm audit` + the VITE_ allowlist/BLAND_API_KEY greps stay as merged on `rebuild/baseline` (R22).

## 4. Provider-facing security (replaces the old §4 HMAC webhook design)
- **provider-webhook:** adapter-verified sender (Vapi server-secret header today; the adapter interface requires a verification step, so a Retell adapter must implement its scheme before it can ship). Constant-time compares. Unknown org number → `200 processed:false` (logged), never a row. **Idempotency is DB-enforced**: unique `(provider, provider_event_id)`; duplicates are 200 no-ops. Terminal-status replays cannot re-trigger email/intake (matched-row state check — R4 pattern).
- **agent-brain:** shared-secret header; per-call rate limit `brainTurnsPerCall`; org resolved from the provider payload's dialed number via `phone_numbers` — never from caller-supplied fields.
- **Provider compromise blast radius:** a leaked `PROVIDER_WEBHOOK_SECRET` lets an attacker forge call records/intake for orgs (not read anything); a leaked `BRAIN_SECRET` lets them run Gemini turns on our quota and write junk intake. Both rotate in minutes; neither reaches other tenants' data reads (RLS) or the service-role key.

## 5. Abuse & cost control (R28)
- **Hard spend ceiling at the provider**: prepaid credits with auto-reload OFF (R25a) — when credits exhaust, calls stop platform-side. This is the outermost wall.
- **Kill switches**: env `CALLS_ENABLED` (global) and `orgs.calls_enabled` (per-org), checked in `agent-brain` **before** any Gemini call; when off → polite line + transfer/voicemail control.
- **Minutes budget**: `usage_add_minutes` ledger vs `orgs.monthly_minutes_cap` (default `LIMITS.ORG_MONTHLY_MINUTES_CAP_DEFAULT`); cap reached → same decline path.
- **Rate limits** (`rate_limit_hit`, service-role-only RPC): `webhookEventsPerCall` 240/h, `brainTurnsPerCall` 80/h, `callsPerOrg` 30/day, `kbPublishPerOrg` 20/day, `summaryEmailsPerOrg` 200/day. 429 + `Retry-After`.
- **Outbound is structurally impossible except the callback queue** (R23): no other outbound code path exists; `callback_queue` INSERT is service-role + consent-guarded (DB trigger), and dialing from it is **deferred** — v1 ships the queue, not the dialer.
- **LLM injection posture:** caller speech is untrusted data — prompts delimit it as data-not-instructions; tool args are zod-validated before any DB write; intake fields are length-capped; model output renders as plain text (no `dangerouslySetInnerHTML` — CI grep); `.ics` escaping in shared `ics.ts` (R18). A hostile caller can at worst pollute their own intake record.

## 6. Transport / headers / hosting
Unchanged from baseline (R22): HTTPS everywhere; HSTS; Vercel `vercel.json` CSP (`default-src 'self'`, supabase connect-src, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`. `Permissions-Policy`: microphone stays `(self)` (the KB-builder voice UI still uses the mic). **No call audio is ever stored** — the provider streams audio; our functions receive text events only; no Storage bucket exists.

## 7. Supply chain
Unchanged from baseline (R22, already merged in ci.yml): `npm ci` + lockfile; audit gate with documented allowlist (`.github/scripts/check-audit.mjs`); gitleaks (with `GITHUB_TOKEN`); VITE_ allowlist + `BLAND_API_KEY` greps; SHA-pinned third-party actions; Dependabot weekly. Deno: exact-version pins + committed `deno.lock`.

## 8. Data privacy (R23 data rules)
- **Transcripts + intake belong to the org.** Strict org-scoped RLS; `call_events` raw payloads admin-only.
- **Retention:** per-org `retention_days` (default 90) purges `inbound_calls` (transcripts/summaries) + `call_events` daily via guarded pg_cron; intake records and `callback_queue.consent_recorded_at` survive purges (consent provenance).
- **No cross-org learning database on call content** — policy, not just deferral. Nothing feeds one org's calls into another org's behavior.
- **Caller PII minimization:** we store caller number (org's operational need), transcript text, and intake fields — no audio, ever. Functions never log transcripts, caller numbers, headers, or secrets (ids/event names/status codes only).
- **Crisis-line hard gate:** v1 must not be deployed on crisis-adjacent or sensitive hotlines; pilots run on low-stakes lines only (volunteer coordination, donation hours, program info). This is an operational acceptance item, not code.

## 9. Disclosure — non-negotiable invariant (R28, carried from R22)
The warm disclosure (`DISCLOSURE_GREETING_TEMPLATE_EN`) is (a) the mandatory assistant-speaks-first greeting in the provider config, (b) baked into the system prompt, and (c) **enforced in code**: the first assistant utterance must contain every `DISCLOSURE_REQUIRED_SUBSTRINGS` member (case-insensitive) or the brain prepends the greeting; `inbound_calls.disclosure_played` records it per call. Unit-tested. The R27 Spanish handoff line is likewise fixed text (`SPANISH_HANDOFF_LINE_ES`).

---

## 10. Security Acceptance Criteria per Workstream (R28 baked in)

Each item is testable (Deno test, Vitest, CI grep, or SQL/RLS test against `supabase db reset` — R21) and must be demonstrated before merge into the integration branch.

**ws/db** (migration, seed, SQL/RLS tests) — full list in db.md §5; headline items:
1. RLS on all 10 public tables; `anon` zero-access everywhere (tables + RPCs).
2. Cross-org isolation on every org-scoped table (member of A sees zero B rows).
3. Role matrix: staff≠admin on orgs/KB-publish; `monthly_minutes_cap` immutable even to admins.
4. Service-role-only writes on calls/events/intake-insert/callbacks-insert/phone_numbers.
5. `guard_callback_rules` (consent-required insert; staff transition limits) + `guard_last_admin` + retention purge (intake & `consent_recorded_at` survive) + cascade-zero-orphans + `rate_limit_hit`/`usage_add_minutes` EXECUTE denial and atomicity.

**ws/edge** (`supabase/functions/**` except api-types.ts)
1. `provider-webhook`: 401 on missing/invalid provider auth; constant-time compare (review); `200 processed:false` for unknown numbers and duplicate `provider_event_id` (idempotency test); terminal-replay is a no-op (no second email/intake).
2. `agent-brain`: 401 on missing/wrong `BRAIN_SECRET_HEADER`; 413 over `BRAIN_BODY_MAX_BYTES`; zod 400s use the envelope; no reflected input.
3. **R28 suite:** kill-switch tests (global env + per-org + minutes-cap → polite decline + transfer control, zero Gemini calls — assert via mock); rate-limit 429 + `Retry-After`; **disclosure enforcement test** (model output missing required substrings → greeting prepended; `disclosure_played` set on the call row).
4. Escalation tests (R26): "person"/DTMF → transfer control; transfer-target no-answer event → voicemail path; Spanish detection → `SPANISH_HANDOFF_LINE_ES` then escalation (R27).
5. Consent tests (R23): `capture_intake` with `callback_consent=false` → NO `callback_queue` row; with `true` → row with `consent_call_id` + `consent_recorded_at`.
6. Hygiene greps: `BLAND_API_KEY` absent; no `console.log` of bodies/transcripts/numbers/headers; all imports version-pinned; no provider type imported outside `_shared/adapters/`; Gemini failure after retries → fixed line + transfer control, never a 5xx mid-call.

**ws/auth-ui** (org auth + roles)
1. SSG build green with placeholder env (lazy `getSupabase`); only the two VITE_ vars (grep).
2. PKCE configured; **no `signInAnonymously` anywhere in `src/`** (grep — R23 retirement).
3. Org onboarding: creating an org makes creator admin (trigger observed via RLS-scoped read).
4. Role-aware UI: staff cannot reach org-settings mutations (and the server rejects them anyway — assert the 42501/RLS error path renders cleanly).
5. Route guards: unauthenticated → `/login`; authenticated-but-orgless → onboarding.

**ws/dashboard-ui** (repurposed calls-ui: staff dashboard)
1. Calls/intake lists render only via RLS'd supabase-js reads; zero edge-function calls in v1.
2. `.ics` download built client-side from `intake_records.appointment` via shared `ics.ts` (escaping unit-tested in the shared module — R18).
3. Intake status/notes edits touch only the granted columns; callback approve/cancel only legal transitions (server rejection path rendered cleanly).
4. Transcripts render as plain text (no `dangerouslySetInnerHTML` — shared grep); `escalation`/`disclosure_played` surfaced on the call detail view.

**ws/kb-ui** (repurposed brainstorm-ui: knowledge-pack builder)
1. Draft editing for staff; **publish action visible/enabled for admins only** (server enforces regardless — test the rejection render).
2. Pack-size budget `KB_PACK_MAX_CHARS` enforced client-side before publish (server/app authoritative).
3. Voice input (if kept for pack authoring) stays browser-local (Web Speech); no audio uploads; `grep -r "service_role" src/` empty (shared gate).
