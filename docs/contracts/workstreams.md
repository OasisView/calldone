# Calldone Rebuild — Phase 2: Parallel Workstreams (Checkpoint 2)

> **⚠️ SUPERSEDED BY CHECKPOINT 3 (2026-07-06, R23–R28).** The product pivoted to inbound
> AI reception & intake for nonprofits; the worker scopes and prompts below describe the
> retired consumer-outbound slice. Current ownership + repurposing map: `frontend.md` §3;
> current worker scopes derive from the re-frozen `db.md` / `api.md` / `security.md`.
> This file is kept as the Checkpoint-2 historical record.

Decomposes the paid-backend build into **5 non-overlapping workstreams**. Each owns a disjoint
set of files (per `frontend.md` §8), builds against the frozen contracts in `docs/contracts/`,
bakes in security, and writes its own tests. The orchestrator owns the shared baseline and the
integration. This document is the Checkpoint-2 artifact: the split, per-worker prompts, acceptance
criteria, and the `git worktree` commands.

## 0. Sequencing (read first)

```
STEP 1  Orchestrator lands the CONTRACTS BASELINE (§1) → PR → merge to main.
        (All frozen shared files + compiling stubs. Workers cannot compile without it.)
STEP 2  Spin up 5 worktrees off the baseline (§2).
STEP 3  Phase 3 — 5 workers build in parallel, each on its branch (§3 prompts).
STEP 4  Phase 4 — orchestrator merges in dependency order, integrates, hardens, reports.

Merge/dependency order:  baseline → ws/db → ws/edge → ws/auth-ui → ws/brainstorm-ui → ws/calls-ui
```

**Why a baseline first:** every workstream imports frozen shared modules (`src/lib/*`,
`src/types/*`, `src/components/ui/*`, guards) and compiling **stubs** of the other workstreams'
hooks/pages. Landing these once, up front, is what guarantees every worktree type-checks in
isolation and that no two workers ever edit the same file.

---

## 1. The contracts baseline (orchestrator, STEP 1)

A single commit on `main` containing every frozen/shared file, plus compiling stubs for files the
workstreams will fill in. Exact ownership list: `frontend.md` §8 (orchestrator block). Concretely:

**Frozen shared code (final content — workers never edit):**
- `src/lib/{nav,supabase,edge,query-keys,phone,schemas,ics,utils}.ts` (final per `frontend.md` §6 / §5.2)
- `src/types/api.ts` (re-export shim of `_shared/api-types.ts`), `src/types/database.ts` (generated from the frozen DDL, R14)
- `src/components/ui/**` (14 shadcn files, `frontend.md` §1.1), `src/components/guards/{RequireAuth,RequireSession}.tsx`
- `src/{App,main,routes,index.css,vite-env.d.ts}` (final per `frontend.md` §6)
- `supabase/functions/_shared/api-types.ts` (already committed, frozen), `supabase/functions/_shared/ics.ts` (frozen **signature stub**; ws/edge implements)
- `supabase/migrations/00000000000000_initial_schema.sql` (already committed; ownership → ws/db after baseline)
- `tsconfig.app.json` include change (adds the two shared `_shared/*.ts` files, `frontend.md` §1.1)

**Compiling stubs (created by orchestrator; ownership transfers to the workstream after baseline):**
- All 8 hooks in `src/hooks/*` as typed stubs matching `frontend.md` §3.1 signatures (`throw new Error("not implemented")` / empty-query bodies)
- One-line placeholder pages for every new route in `src/pages/*` (`frontend.md` §1.1)

**Config / infra / docs (orchestrator-owned, frozen):**
- `package.json` (+lockfile; drop `@supabase/ssr`), all tsconfigs, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `index.html`
- `supabase/config.toml` (`enable_anonymous_sign_ins = true`; `[functions.call-webhook] verify_jwt = false`; redirect allowlist)
- `.github/workflows/ci.yml` (SHA-pinned actions; deno job; gitleaks; `npm audit`; the `VITE_`-allowlist + `BLAND_API_KEY` greps — `security.md` §3.2/§7), `vercel.json` (CSP, `Permissions-Policy: microphone=(self)`, HSTS — `security.md` §6)
- `.env.example` (the secrets contract incl. P6-deferral notes), `public/robots.txt`
- `README.md`, `CLAUDE.md`, `.claude/skills/**` (the dev-process skills, §4), `docs/**`

**Demo-file teardown (part of the baseline):** the shipped browser demo left files that do NOT
match the frozen §1.1 layout and must be removed or rewritten by the baseline so the frozen shims
land cleanly — notably `src/lib/ics.ts` (demo version imports `./demo/types`; replace with the
shim re-exporting `_shared/ics.ts`, R18), `src/hooks/use-calls.ts` (→ split into the frozen
`use-call-logs.ts`/`use-make-call.ts` stubs), `src/pages/Call.tsx` (→ `Calls.tsx` + `CallDetail.tsx`),
and the demo's `src/lib/demo/**` + `src/components/{brainstorm,calls,DemoBadge}` (superseded by the
contract layout). The orchestrator reconciles the demo tree into the frozen §1.1 layout as part of
the baseline commit; workers branch from the clean result.

Baseline acceptance: `npm run lint && npm run typecheck && npm test && npm run build` green with **no env vars** (the lazy `getSupabase()` keeps SSG building); `supabase db reset` applies the migration cleanly where Docker is available.

---

## 2. Worktree + branch spin-up (STEP 2, run after the baseline merges to `main`)

From the main checkout (`/Users/manny/calldone`), with `main` at the baseline commit:

```bash
cd /Users/manny/calldone
git checkout main && git pull

# One isolated worktree + branch per workstream, all rooted at the baseline (main):
git worktree add -b ws/db            ../calldone-ws-db            main
git worktree add -b ws/edge          ../calldone-ws-edge          main
git worktree add -b ws/auth-ui       ../calldone-ws-auth-ui       main
git worktree add -b ws/brainstorm-ui ../calldone-ws-brainstorm-ui main
git worktree add -b ws/calls-ui      ../calldone-ws-calls-ui      main

# In each worktree, install once:
for d in db edge auth-ui brainstorm-ui calls-ui; do (cd ../calldone-ws-$d && npm ci); done
```

Each worker runs in its own `../calldone-ws-<name>` directory on its `ws/<name>` branch. When done:
`git push -u origin ws/<name>` and open a PR into `main`. Cleanup later: `git worktree remove ../calldone-ws-<name>`.

---

## 3. The five workstreams

Common rules embedded in every prompt below:
- **Scope is law.** Edit ONLY files this workstream owns. NEVER edit an orchestrator-frozen file
  (`src/lib/*`, `src/types/*`, `src/components/ui/*`, guards, `routes.tsx`, `App.tsx`, `package.json`,
  `config.toml`, `ci.yml`, `vercel.json`, `_shared/api-types.ts`, the migration except ws/db). You
  may *import* any baseline file; you may *edit* only your own. If a contract seems wrong, STOP and
  report to the orchestrator — never patch a shared file locally.
- **Contracts are frozen.** Match the signatures/shapes in `docs/contracts/` exactly. The two
  canonical artifacts win over prose: `supabase/functions/_shared/api-types.ts` and
  `supabase/migrations/00000000000000_initial_schema.sql`.
- **TDD + security baked in.** Write tests for your slice; satisfy your acceptance criteria
  (`security.md` §10); never log transcripts/PII/secrets; never reference `BLAND_API_KEY`.
- **Self-verify before pushing.** `npm run lint && npm run typecheck && npm test` green in your
  worktree (plus the stream-specific checks below).

---

### 3.1 — ws/db  (database & RLS)

**Owns:** `supabase/migrations/00000000000000_initial_schema.sql` (post-baseline fixes in-place),
`supabase/seed.sql`, `supabase/tests/**`.
**Depends on:** `db.md` (whole), `decision-register.md` (R1/R5/R6/R8/R9/R10/R15/R21), `security.md` §10 (ws/db).
**Acceptance criteria:** `security.md` §10 ws/db #1–5 + `db.md` §7 (RLS enabled on all 10 tables;
policy matrix verbatim; `profiles` column grant exact; anon-deny on `user_facts`/`script_edit_events`/`script_feedback`
INSERT+UPDATE; `call_logs` no client write; `scheduled_calls` SELECT-only; cascade leaves zero orphans;
`rate_limit_hit` atomic + service-role-only; the two guarded pg_cron jobs exist).

> **SUBAGENT PROMPT (hand verbatim):**
>
> You are the **ws/db** worker for the Calldone rebuild, in worktree `/Users/manny/calldone-ws-db`
> on branch `ws/db`. Calldone is an AI phone-call agent; you are building the database layer of the
> real backend that sits behind the already-shipped browser demo. Scope = spec Phases 1–4.
>
> READ FIRST (these are frozen; obey them exactly): `docs/contracts/db.md` (your spec, in full),
> `docs/contracts/decision-register.md` (R1, R5, R6, R8, R9, R10, R15, R21), `docs/contracts/security.md`
> §10 (ws/db). The committed `supabase/migrations/00000000000000_initial_schema.sql` is the GROUND
> TRUTH — it already contains the full schema, RLS, grants, the `private.rate_limits` table + the
> `rate_limit_hit` RPC, and the guarded pg_cron jobs. Your job is to (a) keep that migration correct
> (only fix in place if a test reveals a real defect; do NOT rewrite it), (b) write `supabase/seed.sql`,
> and (c) write the SQL/RLS policy tests under `supabase/tests/`.
>
> HARD RULES: edit ONLY the three paths you own. Never touch `_shared/api-types.ts`, `src/**`, or any
> config. Additive migrations are forbidden in this slice — there is exactly one migration file. The DB
> CHECK values must remain identical to the constants in `_shared/api-types.ts` (E.164 regex, status
> enums, caps) — if they ever diverge, report it, don't silently change the migration.
>
> BUILD:
> 1. `supabase/seed.sql` — minimal local-dev seed: one non-anonymous test profile + one sample
>    `call_scripts` row + one sample `call_logs` row (E.164 demo number like `+15555550100`,
>    `is_demo = true`). Idempotent.
> 2. `supabase/tests/` — SQL/RLS policy tests runnable via `supabase db reset` then assertions
>    (pgTAP or plain SQL `do $$ ... assert ... $$`). Cover EVERY item in `db.md` §7 / `security.md`
>    §10 ws/db: RLS on all 10 tables; cross-user isolation; anon (JWT `is_anonymous=true` via
>    `set local request.jwt.claims`) denied INSERT+UPDATE on `user_facts`/`script_edit_events`/`script_feedback`
>    but allowed full CRUD on own `brainstorm_sessions`/`call_scripts`; `call_logs` no client write
>    (service-role write works); `profiles` UPDATE grant is exactly
>    `(display_name, phone_number, time_zone, communication_style)` — updating `phone_verified_at` as
>    `authenticated` FAILS, and changing `phone_number` nulls `phone_verified_at` via the trigger;
>    `scheduled_calls` SELECT-only; `anonymous_events` + `private.rate_limits` zero client access;
>    deleting an anonymous `auth.users` row cascades to zero orphans; `rate_limit_hit` increments
>    atomically, rejects an invalid window, and is execute-denied to `authenticated`/`anon`.
>
> SELF-VERIFY: `supabase db reset` applies the migration + seed cleanly; your test suite passes
> against it. (Requires local Supabase via Docker.) `npm run lint && npm run typecheck` still green.
> When done: commit, `git push -u origin ws/db`, open a PR into `main`, and report which acceptance
> items each test covers.

---

### 3.2 — ws/edge  (Supabase edge functions, Deno)

**Owns:** `supabase/functions/**` — `deno.json`, `_shared/{ics,schemas,errors,cors,auth,supabase-admin,rate-limit,retry,gemini,prompts,demo-transcript}.ts`,
`{whisper-transcribe,gemini-conversation,elevenlabs-tts,make-call}/index.ts`, `call-webhook/{index,extract,notify}.ts`, `tests/**`.
**Does NOT own:** `_shared/api-types.ts` (frozen). Implements `_shared/ics.ts` against its frozen signature.
**Depends on:** `api.md` (whole), `db.md` (RLS/RPC for service-role access), `decision-register.md`
(R2/R4/R5/R6/R7/R11/R12/R13/R19/R22), `security.md` §1.3, §4, §5, §10 (ws/edge).
**Acceptance criteria:** `security.md` §10 ws/edge #1–6 (401 incl. bare-anon-key on every JWT fn;
webhook HMAC accept/reject + replay no-op + timing-safe + metadata cross-check; zod 413/400 rejections;
429 + `Retry-After`; TTS quota → 503 / other upstream → 502, never 200-with-fallback; `BLAND_API_KEY`
grep returns nothing + `resolveCallMode` real arm → 501; `gemini-conversation` touches no product
tables; disclosure-line enforcement).

> **SUBAGENT PROMPT (hand verbatim):**
>
> You are the **ws/edge** worker for the Calldone rebuild, in worktree `/Users/manny/calldone-ws-edge`
> on branch `ws/edge`. You build all Supabase Deno edge functions for the real backend behind the
> shipped demo. Scope = spec Phases 1–4.
>
> READ FIRST (frozen — obey exactly): `docs/contracts/api.md` (your spec, in full — §1 envelope, §2
> module tree + the canonical `_shared/api-types.ts`, §3 per-function contracts, §4 Gemini tool schema,
> §5 demo payload, §6 demo-mode semantics, §7 CORS, §8 rate limiting), `docs/contracts/security.md`
> §1.3/§4/§5/§10, `docs/contracts/db.md` §4–§5 (the `rate_limit_hit` RPC + which writes are
> service-role). GROUND TRUTH: `supabase/functions/_shared/api-types.ts` (import it; never edit it).
>
> HARD RULES: edit ONLY under `supabase/functions/**`, and NOT `_shared/api-types.ts`. Pin every import
> to an exact version (`npm:zod@3.25.76`, `npm:@supabase/supabase-js@2.58.0`, `jsr:@std/crypto@1.x.y`);
> commit `deno.lock`. **Never reference `BLAND_API_KEY`** and write **no real-call code** —
> `resolveCallMode()`'s `"real"` arm returns `501 not_implemented` (R12). Never `console.log` request
> bodies, transcripts, headers, phone numbers, or secrets.
>
> BUILD (match api.md exactly):
> - `_shared/`: `schemas.ts` (Deno zod validators per api.md §4.2 — these produce the 413/400
>   rejections in acceptance #3), `errors.ts` (`jsonError` building the 12-code envelope), `cors.ts`
>   (allowlist from `ALLOWED_ORIGINS`, reflect-not-`*`), `auth.ts` (`requireUser(req): Promise<{userId,
>   isAnonymous, client} | Response>` — verify JWT via caller-scoped client `getUser()`, reject the bare
>   anon key, §1.3), `supabase-admin.ts` (service-role client), `rate-limit.ts` (wraps `rate_limit_hit`, compares
>   to `RATE_LIMITS.<key>`, uses `.bucket`, IP from the platform-trusted hop), `retry.ts` (exp backoff
>   ×3), `gemini.ts` (2.5-flash + tool-calling), `prompts.ts` (system prompt with the two AI-disclosure
>   lines baked in), `demo-transcript.ts` (canned payload builder), and **implement `ics.ts`** against
>   its frozen browser-safe signature (RFC-5545 escaping; no `Deno.*`).
> - Functions: `whisper-transcribe` (Groq), `gemini-conversation` (STATELESS per R2 — reads AND
>   writes NO product tables; the prompt is built from the request messages + the two disclosures
>   only, with NO per-user `user_facts` RAG, which is a P5 feature — so the module contains zero
>   `.from(` calls, ws/edge acceptance #5; finalize returns script *content*; enforce the disclosure
>   lines in code, R22), `elevenlabs-tts`
>   (503/502 per R7, global char budget), `make-call` (caller-JWT read of the script → service-role
>   INSERT of `call_logs`, R5; demo simulation via `EdgeRuntime.waitUntil`, computes the same webhook
>   HMAC), `call-webhook` (HMAC verify `x-calldone-signature`/`x-calldone-timestamp` ±300s timing-safe;
>   resolve row by id; terminal-status → `already_processed`; metadata mismatch → `200 processed:false`;
>   appointment extraction via `extract.ts`; notifications via `notify.ts` — SMS only if `!is_demo` &&
>   verified phone (no-op when Twilio unset), email via Resend with the shared `.ics`).
> - `tests/`: Deno tests per the acceptance criteria, providers mocked at the `fetch` layer.
>
> SELF-VERIFY: `deno test --allow-env supabase/functions` passes; the §10 ws/edge greps hold
> (`grep -r BLAND_API_KEY supabase/functions/` empty; no `.from(` in `gemini-conversation`). Report
> coverage. Commit, `git push -u origin ws/edge`, open a PR.

---

### 3.3 — ws/auth-ui  (auth, onboarding, dashboard, profile)

**Owns:** `src/pages/{Landing,Login,Signup,Onboarding,Dashboard,Profile}.tsx`,
`src/components/layout/{AppShell,AppHeader,ThemeToggle}.tsx`, `src/components/auth/{AuthForm,OnboardingForm}.tsx`,
`src/components/dashboard/{NewCallCard,RecentCallsCard,RecentScriptsCard}.tsx`,
`src/hooks/{use-session,use-profile}.ts`, `tests/auth/**`.
**Depends on:** `frontend.md` §2 (routes), §3.1 (`useSession`/`useProfile` signatures), §3.3 (guards),
`decision-register.md` (R9/R16/R17), `security.md` §1.1/§1.2/§1.6/§10 (ws/auth-ui).
**Acceptance criteria:** `security.md` §10 ws/auth-ui #1–5 (lazy `getSupabase` keeps SSG building;
only the two `VITE_` vars referenced; PKCE; anonymous session minted only on demo entry, never on
landing render; uid-preserving `linkEmail`; guards send no-session→`/login`, anon→`/signup`).

> **SUBAGENT PROMPT (hand verbatim):**
>
> You are the **ws/auth-ui** worker, in worktree `/Users/manny/calldone-ws-auth-ui` on branch
> `ws/auth-ui`. You build authentication, onboarding, the dashboard shell, and profile for the real
> backend behind the shipped demo. Scope = spec Phases 1–4.
>
> READ FIRST (frozen): `docs/contracts/frontend.md` §2 (route table + redirect invariant), §3.1
> (`UseSessionResult`, `useProfile` — implement these signatures EXACTLY), §3.3 (the `RequireAuth`/
> `RequireSession` guards you consume but do NOT edit), §6 (frozen `nav.ts`/`supabase.ts`/`App.tsx`);
> `docs/contracts/security.md` §1 (auth model — PKCE, anonymous sign-in, the `getUser()` rule),
> §10 ws/auth-ui; `decision-register.md` R9, R16, R17.
>
> HARD RULES: edit ONLY your owned files. All Supabase access goes through `use-session`/`use-profile`
> (components never import `@/lib/supabase`). Use `useNav()` for navigation — never `useNavigate`
> directly. There is NO AuthProvider (R16) — session state lives in `use-session` via TanStack Query +
> `onAuthStateChange`. Reference only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
>
> BUILD: implement `use-session.ts` (email/Google/anonymous sign-in, PKCE, `ensureSession`, the
> uid-preserving `linkEmail`/`linkGoogle` upgrade — R16) and `use-profile.ts` (read + column-safe
> update; `phone_number` IS writable, never send `phone_verified_at` — R9). Build the pages/components:
> `Landing` (marketing + "Try the demo" → `nav.toBrainstorm()`; the anonymous session is minted ONLY on
> reaching the demo, never on landing render — security gate), `Login`/`Signup` (`AuthForm`; when
> `isAnonymous`, signup upgrades in place via `linkEmail`/`linkGoogle`), `Onboarding` (`OnboardingForm`:
> name, time zone, style, optional phone), `Dashboard` (`AppShell` + the three cards consuming
> `useCallLogs`/`useScripts` stubs), `Profile`, `layout/*`, `ThemeToggle`.
>
> SELF-VERIFY: `npm run lint && npm run typecheck && npm test`; `npm run build` succeeds with placeholder
> env (proves lazy `getSupabase`); `tests/auth/**` cover the §10 items (uid unchanged after `linkEmail`;
> guard redirects; no `signInAnonymously` reachable from landing render). Commit, push `ws/auth-ui`, PR.

---

### 3.4 — ws/brainstorm-ui  (voice brainstorm)

**Owns:** `src/pages/Brainstorm.tsx`,
`src/components/brainstorm/{MicButton,ConversationView,ConversationBubble,VoiceStatus,TtsFallbackNotice}.tsx`,
`src/hooks/{use-brainstorm,use-audio-recorder,use-speech-playback}.ts`, `src/lib/audio/{recorder,tts-player}.ts`
(the explicit `src/lib` carve-out, §7), `tests/brainstorm/**`.
**Depends on:** `frontend.md` §3.1 (`useBrainstorm`/`useAudioRecorder`/`useSpeechPlayback` + the R2
persistence duties), §7 (audio ownership), `api.md` §3.1–§3.3 (transcribe/converse/tts via `edge.ts`),
`decision-register.md` (R2/R7/R8/R17), `security.md` §10 (ws/brainstorm-ui).
**Acceptance criteria:** `security.md` §10 ws/brainstorm-ui #1–5 (recorder hard-stops at the caps;
no `dangerouslySetInnerHTML`; `synthesizeSpeech` null→browser TTS + blob-URL revoke; 429 cooldown not
retry-loop; client persists `brainstorm_sessions`/`call_scripts`, SKIPS `user_facts` when anonymous;
no `service_role` in `src/`).

> **SUBAGENT PROMPT (hand verbatim):**
>
> You are the **ws/brainstorm-ui** worker, in worktree `/Users/manny/calldone-ws-brainstorm-ui` on
> branch `ws/brainstorm-ui`. You build the voice-brainstorm experience for the real backend behind the
> shipped demo. Scope = spec Phases 1–4.
>
> READ FIRST (frozen): `docs/contracts/frontend.md` §3.1 — implement `useBrainstorm`,
> `useAudioRecorder`, `useSpeechPlayback` to those EXACT signatures, and obey the **R2 persistence
> duties** spelled out under §3.1 (the hook, not the edge function, writes `brainstorm_sessions` and
> `call_scripts`; it UPSERTs `user_facts` ONLY when `!isAnonymous`, R8); §7 (you own `src/lib/audio/`);
> `docs/contracts/api.md` §3.1–§3.3 (call the frozen `edge.ts` — `transcribeAudio`, `converse`,
> `synthesizeSpeech`); `security.md` §5.3/§10 ws/brainstorm-ui; `decision-register.md` R2, R7, R8, R17.
>
> HARD RULES: edit ONLY your owned files (your one `src/lib` carve-out is `src/lib/audio/`). Use the
> frozen `edge.ts`/`getSupabase()` only inside hooks, never in components. No `dangerouslySetInnerHTML`.
> No `service_role` anywhere. Use `useNav()` for navigation.
>
> BUILD: `src/lib/audio/recorder.ts` (MediaRecorder wrapper; hard-stop at `LIMITS.AUDIO_MAX_SECONDS`,
> reject blobs over `LIMITS.AUDIO_MAX_BYTES` before upload) and `tts-player.ts` (blob playback +
> `speechSynthesis` fallback; revoke object URLs after playback). The three hooks, with `use-brainstorm`
> orchestrating record→`transcribeAudio`→`converse`→`synthesizeSpeech` (null → browser TTS, set
> `isTtsFallback`) and performing the R2 persistence on `script_finalized`, then exposing
> `finalizedScript` so the page can `nav.toScriptReview(scriptId)`. The `/brainstorm` page +
> components (`MicButton`, `ConversationView`/`Bubble`, `VoiceStatus`, `TtsFallbackNotice`). Handle a
> 429 with a cooldown UI (no auto-retry loop).
>
> SELF-VERIFY: `npm run lint && npm run typecheck && npm test`; `tests/brainstorm/**` cover the §10
> items (recorder cap guard; fallback path on null; blob-URL revoke; anonymous skips `user_facts`).
> Commit, push `ws/brainstorm-ui`, PR.

---

### 3.5 — ws/calls-ui  (scripts, call placement, call detail)

**Owns:** `src/pages/{Scripts,ScriptReview,Calls,CallDetail}.tsx`,
`src/components/calls/{ScriptEditor,ScriptCard,PhoneNumberField,CallProgressCard,CallLogRow,CallTranscript,AppointmentCard}.tsx`,
`src/hooks/{use-scripts,use-call-logs,use-make-call}.ts`, `tests/calls/**`.
**Depends on:** `frontend.md` §3.1 (those hook signatures), §2 (routes), `api.md` §3.4/§6 (make-call,
polling), `decision-register.md` (R5/R17/R18), `security.md` §10 (ws/calls-ui).
**Acceptance criteria:** `security.md` §10 ws/calls-ui #1–5 (client E.164 uses the shared `E164_REGEX`;
`is_demo` rows always show the demo badge; no `call-webhook` reference in `src/`; status only from
polling `call_logs`, no client `call_logs` mutation; `.ics` generated client-side via the shared
`ics.ts`, fields escaped).

> **SUBAGENT PROMPT (hand verbatim):**
>
> You are the **ws/calls-ui** worker, in worktree `/Users/manny/calldone-ws-calls-ui` on branch
> `ws/calls-ui`. You build script review, call placement, and call history/detail for the real backend
> behind the shipped demo. Scope = spec Phases 1–4.
>
> READ FIRST (frozen): `docs/contracts/frontend.md` §3.1 — implement `useScripts`/`useScript`/
> `useUpdateScript`/`useToggleFavorite`, `useCallLogs`/`useCallLog`, `useMakeCall` to those EXACT
> signatures (note: `useUpdateScript` inserts a `script_edit_events` row only when `!isAnonymous`, R8;
> `useCallLog` polls at `LIMITS.POLL_INTERVAL_MS` until terminal, timing out at
> `LIMITS.POLL_TIMEOUT_MS`, R17); §2 (routes); `docs/contracts/api.md` §3.4/§6 (make-call + the
> simulated-call lifecycle); `decision-register.md` R5, R17, R18; `security.md` §10 ws/calls-ui.
>
> HARD RULES: edit ONLY your owned files. All Supabase/edge access through your hooks. Clients have
> ZERO write policies on `call_logs` (R5) — `useMakeCall` calls the edge function and refetches; never
> attempt a client `call_logs` mutation. NEVER reference `call-webhook` anywhere in `src/`. Use the
> frozen `src/lib/phone.ts`/`schemas.ts` (which import `E164_REGEX` from api-types) for client
> validation — no local regex copy. Use the frozen `src/lib/ics.ts` shim for the `.ics`.
>
> BUILD: the three hooks; `Scripts` (list) + `ScriptReview` (`ScriptEditor`, `PhoneNumberField`,
> "Call now" → `useMakeCall` → `nav.toCallDetail`), `Calls` (history via `CallLogRow`) + `CallDetail`
> (`CallProgressCard` polling, `CallTranscript`, and `AppointmentCard` that builds the `.ics` download
> CLIENT-SIDE from `call_logs.appointment_details` via `src/lib/ics.ts`, R18 — works for anonymous demo
> users). Every `is_demo` row shows a demo badge.
>
> SELF-VERIFY: `npm run lint && npm run typecheck && npm test`; `tests/calls/**` cover the §10 items
> (E.164 mirrors the server; demo badge snapshot; `grep -r call-webhook src/` empty; no client
> `call_logs` write; `.ics` escaping via the shared module). Commit, push `ws/calls-ui`, PR.

---

## 4. Dev-process connectors & skills (the "new feature" ask)

Landed in the baseline (`.claude/skills/`), plus one connector to wire up:
- **Connect the Supabase MCP** (official) so agents can run read-only SQL, inspect schema, and manage
  migrations against the real project during Phases 3–4. (Vercel, Twilio-docs, Preview/Chrome MCPs are
  already connected.)
- **Project skills:** `verify-app` (launch dev server + drive the flow in Preview MCP), `db-migrate`
  (migration → local `supabase db reset` → RLS tests → push), `edge-fn-test` (scaffold/run Deno tests
  with mocked providers), `contract-check` (diff a worker branch against the frozen contracts +
  file-ownership map before merge), `security-pass` (run a workstream's `security.md` §10 checklist).

## 5. Integration & hardening (Phase 4 preview)

Merge in dependency order (`ws/db` → `ws/edge` → `ws/auth-ui` → `ws/brainstorm-ui` → `ws/calls-ui`),
resolving interface mismatches against the contracts (not by editing shared files ad hoc). Run the full
suite (lint, typecheck, vitest, deno tests, RLS tests, build), then a dedicated integrated security
review (fresh adversarial agents + `/security-review`). Deploy: Supabase (migrations + function env
secrets) and Vercel (real `VITE_*`). Final report: changes, coverage, security findings + fixes, deferred.

**Phase-3 external prerequisites (you provide before integration can be verified end-to-end):**
a Supabase project (URL + anon + service-role; enable anonymous sign-ins); function-env secrets
`GEMINI_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY`, a random `BLAND_WEBHOOK_SECRET`;
Docker for local `supabase` (ws/db + ws/edge tests). No Bland or Twilio keys in this slice. Designed to
stay ~$0/month at demo traffic.
