# Calldone — Frozen Frontend Layout + Ownership Contract (final)

**Status:** FROZEN. This document is the collision-prevention law for 5 parallel workstreams.
**Conformance:** this document embodies the decision register (`docs/contracts/decision-register.md`, R1–R22). Where any other document disagrees, the register wins; this document contains no text the register overrules.

Baseline = spec at `docs/superpowers/specs/2026-04-29-calldone-rebuild-design.md`, build scope = spec Phases 1–4 (demo slice). Sibling contracts: `docs/contracts/db.md` (schema/RLS), `docs/contracts/api.md` (edge API), `docs/contracts/security.md`. All paths below are relative to the repo root.

---

## 0. Scope rulings and gap resolutions (binding)

### 0.1 "No signup required" vs "JWT required" — RESOLVED

**Resolution: Supabase anonymous sign-in sessions.** Every edge function except `call-webhook` keeps `verify_jwt = true`. The public demo never bypasses JWT:

1. Landing "Try the demo" navigates to `/brainstorm`. The `RequireSession` guard calls `useSession().ensureSession()`, which invokes `supabase.auth.signInAnonymously()` if no session exists. Visitor gets a real `auth.users` row, a real JWT, and a real `profiles` row (via DB trigger). `auth.uid()`-based RLS works unchanged.
2. Edge functions read the `is_anonymous` claim (`user.is_anonymous` via `supabase.auth.getUser(jwt)`). Anonymous callers are always demo mode (`resolveCallMode()` in api.md §6) and stricter rate limits apply.
3. Rate limiting is enforced server-side per api.md §8: the `private.rate_limits` table (non-API-exposed schema, owned by db.md) is accessed **only** through the `public.rate_limit_hit()` SECURITY DEFINER RPC. All bucket sizes are the exported `RATE_LIMITS` constants in `supabase/functions/_shared/api-types.ts` — no numbers are restated here or anywhere else. The frontend's only obligation: surface `429 rate_limited` envelopes as a friendly retry-later state.
4. `enable_anonymous_sign_ins = true` is added to `supabase/config.toml [auth]` (and toggled in the hosted dashboard at deploy time, where the anonymous sign-in per-IP rate limit is also configured per the register).
5. Anonymous sessions are retained 24 h server-side (R15); the client treats anonymous data as ephemeral and offers upgrade (§3.1 `linkEmail`/`linkGoogle`) to keep it.

### 0.2 Demo-mode-only build

Phases 5–7 are excluded. Consequences baked into contracts: `make-call` has **zero real-call code** — `resolveCallMode()` exists, but its `"real"` arm returns `501 not_implemented`; no Bland client code exists; `BLAND_API_KEY` is never referenced anywhere (CI grep gate, §6.7). `is_demo` is always `true` in this slice. No `verify-phone-*`, `schedule-call`, or cron-execution functions are built. The `scheduled_calls` and `script_feedback` tables still ship in the frozen schema; clients get **SELECT-only** on `scheduled_calls` (no client INSERT/UPDATE/DELETE until P6). **No "Schedule for later" UI exists anywhere in the slice**, and no client code writes `scheduled_calls`.

### 0.3 Known weak points — fixed in this contract

- `src/lib/supabase.ts` import-time throw → replaced by lazy `getSupabase()` (final content in §6.3). Fixes SSG/CI builds without env.
- `@supabase/ssr` unused dep → removed from `package.json` (§6.1). `@radix-ui/react-toast` also removed (sonner is the toast system).
- README "Project structure" → becomes true once this layout lands; orchestrator refreshes README at integration.
- `public/robots.txt` sitemap pointing at unconfirmed domain → final content in §6.7 (no sitemap line until domain is chosen; app routes disallowed).

---

## 1. Frozen file layout

### 1.1 `src/` (complete; every file that will exist at demo-slice completion)

```
src/
├── App.tsx                                  [orchestrator — final content §6.5]
├── main.tsx                                 [orchestrator — unchanged]
├── index.css                                [orchestrator — frozen as-is]
├── routes.tsx                               [orchestrator — final content §6.4]
├── vite-env.d.ts                            [orchestrator — frozen as-is; no new VITE_* vars]
├── components/
│   ├── ui/                                  [orchestrator — pre-generated shadcn baseline, FROZEN]
│   │   ├── alert.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── skeleton.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   └── tooltip.tsx
│   ├── guards/                              [orchestrator — pre-written, FROZEN, §3.3]
│   │   ├── RequireAuth.tsx
│   │   └── RequireSession.tsx
│   ├── layout/                              [ws/auth-ui]
│   │   ├── AppShell.tsx                     (header + nav links + children wrapper for authed pages)
│   │   ├── AppHeader.tsx
│   │   └── ThemeToggle.tsx
│   ├── auth/                                [ws/auth-ui]
│   │   ├── AuthForm.tsx                     (email/password + Google button; mode: "login" | "signup";
│   │   │                                     when session.isAnonymous, signup uses linkEmail/linkGoogle
│   │   │                                     to upgrade in place — uid preserved, demo data kept)
│   │   └── OnboardingForm.tsx               (name, time zone, style, optional phone — profiles.phone_number
│   │                                         is client-writable per R9; verification fields are not)
│   ├── dashboard/                           [ws/auth-ui]
│   │   ├── NewCallCard.tsx                  (CTA → nav.toBrainstorm())
│   │   ├── RecentCallsCard.tsx              (consumes useCallLogs)
│   │   └── RecentScriptsCard.tsx            (consumes useScripts)
│   ├── brainstorm/                          [ws/brainstorm-ui]
│   │   ├── MicButton.tsx
│   │   ├── ConversationView.tsx
│   │   ├── ConversationBubble.tsx
│   │   ├── VoiceStatus.tsx                  (recording/transcribing/thinking/speaking indicator)
│   │   └── TtsFallbackNotice.tsx            ("premium voice unavailable, using browser voice")
│   └── calls/                               [ws/calls-ui]
│       ├── ScriptEditor.tsx
│       ├── ScriptCard.tsx
│       ├── PhoneNumberField.tsx             (uses lib/phone.ts validation)
│       ├── CallProgressCard.tsx             (live status while polling)
│       ├── CallLogRow.tsx
│       ├── CallTranscript.tsx
│       └── AppointmentCard.tsx              (appointment details + .ics download built CLIENT-SIDE
│                                             from call_logs.appointment_details via src/lib/ics.ts —
│                                             works for anonymous demo users; R18)
├── hooks/                                   (stubs pre-created in baseline; implementation per owner)
│   ├── use-session.ts                       [ws/auth-ui]
│   ├── use-profile.ts                       [ws/auth-ui]
│   ├── use-brainstorm.ts                    [ws/brainstorm-ui]
│   ├── use-audio-recorder.ts                [ws/brainstorm-ui]
│   ├── use-speech-playback.ts               [ws/brainstorm-ui]
│   ├── use-scripts.ts                       [ws/calls-ui]
│   ├── use-call-logs.ts                     [ws/calls-ui]
│   └── use-make-call.ts                     [ws/calls-ui]
├── lib/
│   ├── audio/                               [ws/brainstorm-ui — EXPLICIT CARVE-OUT, §7]
│   │   ├── recorder.ts                      (MediaRecorder wrapper)
│   │   └── tts-player.ts                    (audio playback + SpeechSynthesis fallback)
│   ├── edge.ts                              [orchestrator — frozen API §3.2 / §6.6]
│   ├── ics.ts                               [orchestrator — shim re-exporting supabase/functions/_shared/ics.ts]
│   ├── nav.ts                               [orchestrator — final content §6.2]
│   ├── phone.ts                             [orchestrator — E.164 validate/normalize using E164_REGEX
│   │                                         imported from the shared api-types constants]
│   ├── query-keys.ts                        [orchestrator — final content §5.2]
│   ├── schemas.ts                           [orchestrator — client zod mirror of the request shapes,
│   │                                         importing LIMITS/E164_REGEX from shared api-types (no
│   │                                         duplicated numbers); used by forms + hooks for pre-flight
│   │                                         validation]
│   ├── supabase.ts                          [orchestrator — final content §6.3]
│   └── utils.ts                             [orchestrator — existing, unchanged]
├── pages/
│   ├── Landing.tsx                          [ws/auth-ui]   (exists; marketing rewrite + "Try the demo" → /brainstorm)
│   ├── Login.tsx                            [ws/auth-ui]
│   ├── Signup.tsx                           [ws/auth-ui]
│   ├── Onboarding.tsx                       [ws/auth-ui]
│   ├── Dashboard.tsx                        [ws/auth-ui]   (exists; full rewrite)
│   ├── Profile.tsx                          [ws/auth-ui]
│   ├── Brainstorm.tsx                       [ws/brainstorm-ui]
│   ├── Scripts.tsx                          [ws/calls-ui]
│   ├── ScriptReview.tsx                     [ws/calls-ui]  (route: /scripts/:scriptId)
│   ├── Calls.tsx                            [ws/calls-ui]
│   ├── CallDetail.tsx                       [ws/calls-ui]  (route: /calls/:callLogId)
│   └── NotFound.tsx                         [orchestrator — existing, unchanged]
└── types/                                   [orchestrator — pre-written, FROZEN]
    ├── api.ts                               (re-export shim of supabase/functions/_shared/api-types.ts —
                                              the single source; NO byte-mirror, NO second copy; §3.2)
    └── database.ts                          (GENERATED from the frozen DDL per R14 — `supabase gen types`,
                                              or hand-derived from db.md's DDL when no local stack, drift-
                                              checked at integration. Row + Insert/Update types for all 9
                                              product tables, snake_case fields. Never hand-maintained as
                                              a second mirror.)
```

**Baseline rule:** orchestrator lands a single "contracts baseline" commit on main containing: `src/types/`, all 8 hook files as compiling typed stubs (frozen signatures, `throw new Error("not implemented")` or empty-query bodies), all `src/components/ui/` files, both guards, placeholder one-liner pages for every new route, the final frozen versions of `routes.tsx`, `App.tsx`, `nav.ts`, `supabase.ts`, `edge.ts`, `query-keys.ts`, `phone.ts`, `schemas.ts`, `ics.ts` (shim), `package.json`, `config.toml`, `ci.yml`, `vercel.json`, `robots.txt`, `tests/lib/nav.test.ts`, `supabase/functions/_shared/api-types.ts`, the frozen-signature stub of `supabase/functions/_shared/ics.ts`, and the full initial migration (§1.3 — it IS the db contract). All 5 worktrees branch from this commit. After baseline, each file is editable only by its owner column; orchestrator-frozen files are editable by no one.

**tsconfig note (orchestrator-owned change, frozen at baseline):** because `tsconfig.app.json` has `composite: true`, its `include` gains the shared files imported by the app:

```json
"include": ["src", "tests", "supabase/functions/_shared/api-types.ts", "supabase/functions/_shared/ics.ts"]
```

### 1.2 `supabase/functions/`

The complete, final tree is owned by **api.md §2** (R13) and is not restated file-by-file here. Summary for ownership purposes:

```
supabase/functions/
├── deno.json
├── _shared/{api-types,ics,schemas,errors,cors,auth,supabase-admin,
│            rate-limit,retry,gemini,prompts,demo-transcript}.ts
├── {whisper-transcribe,gemini-conversation,elevenlabs-tts,make-call}/index.ts
├── call-webhook/{index,extract,notify}.ts
└── tests/
```

Ownership: **everything is ws/edge**, with exactly two exceptions —

- `_shared/api-types.ts` — **orchestrator, FROZEN** (the canonical contract module, §3.2).
- `_shared/ics.ts` — orchestrator stubs the frozen signature at baseline; **ws/edge implements**. It must stay dependency-free, browser-safe TypeScript (no `Deno.*`, no imports beyond api-types) because the app imports it via the `src/lib/ics.ts` shim (R18).

Secrets (`GEMINI_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `BLAND_WEBHOOK_SECRET`, `TWILIO_*`, `RESEND_API_KEY`, plus `ALLOWED_ORIGINS`, `CALLS_ENABLED`, `DEMO_SIMULATION_DELAY_SECONDS`) exist **only** in Supabase function env. `BLAND_API_KEY` does not appear in this list because no code may reference it (R12; CI grep gate). No new `VITE_*` vars; `vite-env.d.ts` stays frozen. Demo enforcement is server-side, never a client flag.

### 1.3 `supabase/migrations/` + seed + SQL tests

Exactly **one** migration file in the slice (R1):

```
supabase/migrations/00000000000000_initial_schema.sql   (the frozen DDL from db.md, wholesale:
                                                          9 product tables + private.rate_limits +
                                                          rate_limit_hit() RPC + guarded pg_cron jobs.
                                                          Authored at baseline by the orchestrator —
                                                          it IS the contract; owned by ws/db thereafter:
                                                          fixes via this file pre-merge, additive
                                                          migrations only after integration.)
supabase/seed.sql                                        [ws/db]  (local-dev seed: one test user profile
                                                          + sample script/log)
supabase/tests/                                          [ws/db]  (SQL/RLS policy test file(s), run
                                                          against `supabase db reset` per R21)
```

No other migration files exist. No timestamped `2026…` migration files are created in this slice.

---

## 2. Route table + nav.ts contract

| Path | Page component | Guard | Behavior |
|---|---|---|---|
| `/` | `pages/Landing.tsx` | none (public, pre-rendered via SSG `entry`) | "Try the demo" → `nav.toBrainstorm()` |
| `/login` | `pages/Login.tsx` | none | in-page: if authed non-anonymous → `nav.toDashboard()` |
| `/signup` | `pages/Signup.tsx` | none | same redirect; anonymous users upgrade here (uid-preserving, §3.1) |
| `/onboarding` | `pages/Onboarding.tsx` | `RequireAuth allowUnonboarded` | no session → `/login`; anonymous → `/signup` |
| `/dashboard` | `pages/Dashboard.tsx` | `RequireAuth` | no session → `/login`; anonymous → `/signup`; unonboarded → `/onboarding` |
| `/profile` | `pages/Profile.tsx` | `RequireAuth` | same |
| `/brainstorm` | `pages/Brainstorm.tsx` | `RequireSession` | **anonymous-demo-allowed**; auto `signInAnonymously()` |
| `/scripts` | `pages/Scripts.tsx` | `RequireAuth` | full accounts only |
| `/scripts/:scriptId` | `pages/ScriptReview.tsx` | `RequireSession` | **anonymous-demo-allowed** (demo loop continues) |
| `/calls` | `pages/Calls.tsx` | `RequireAuth` | full accounts only |
| `/calls/:callLogId` | `pages/CallDetail.tsx` | `RequireSession` | **anonymous-demo-allowed**; polls while in progress |
| `*` | `pages/NotFound.tsx` | none | — |

**Redirect invariant (R17):** an anonymous session hitting any `RequireAuth` route is redirected to `/signup` — never `/login` — in every row above, with no exceptions. No session at all → `/login`.

`nav.ts` is extended, never bypassed — no component imports `useNavigate` directly (lint-reviewed at integration). Final frozen content is in §6.2. New `ROUTES` keys: `login, signup, onboarding, brainstorm, scripts, scriptReview, calls, callDetail, profile`. New `Navigator` methods: `toLogin, toSignup, toOnboarding, toBrainstorm, toScripts, toScriptReview(scriptId), toCalls, toCallDetail(callLogId), toProfile` (parameterized methods interpolate the `:param` segment).

---

## 3. Frozen contracts

### 3.1 Data-fetching hook contracts (the ONLY Supabase surface)

Components never import `@/lib/supabase` or `@/lib/edge`; only hooks do. Pages/components consume hooks. (`@/lib/ics.ts` is a pure function module and may be imported by components directly — it touches no I/O.) Error type below is the `error` member of `ApiErrorBody` from `@/types/api`.

```ts
// hooks/use-session.ts                                        [ws/auth-ui]
export interface UseSessionResult {
  session: Session | null
  user: User | null
  isAnonymous: boolean            // session.user.is_anonymous === true
  isLoading: boolean
  signInWithPassword(email: string, password: string): Promise<{ error: ApiError | null }>
  signUp(email: string, password: string): Promise<{ error: ApiError | null }>
  signInWithGoogle(): Promise<{ error: ApiError | null }>
  /** Uid-preserving anonymous → permanent upgrade (R16): supabase.auth.updateUser /
   *  linkIdentity on the EXISTING anonymous user. The uid does not change, so all
   *  demo-created rows (brainstorm_sessions, call_scripts, call_logs) survive. */
  linkEmail(email: string, password: string): Promise<{ error: ApiError | null }>
  linkGoogle(): Promise<{ error: ApiError | null }>
  signOut(): Promise<void>
  ensureSession(): Promise<Session>   // signInAnonymously() if none; used by RequireSession
}
export function useSession(): UseSessionResult
// No AuthProvider/context exists (R16): session state lives here, in TanStack Query
// (key queryKeys.session) + supabase.auth.onAuthStateChange. App.tsx never changes.

// hooks/use-profile.ts                                        [ws/auth-ui]
export function useProfile(): UseQueryResult<Profile | null, ApiError>
export function useUpdateProfile(): UseMutationResult<Profile, ApiError, ProfileUpdate>
// onboarding completeness = profile.display_name != null && profile.time_zone != null
// profiles.phone_number IS writable here (R9); phone_verified_at is never sent by the client.

// hooks/use-scripts.ts                                        [ws/calls-ui]
export function useScripts(): UseQueryResult<CallScript[], ApiError>                    // own rows, newest first
export function useScript(scriptId: string): UseQueryResult<CallScript | null, ApiError>
export function useUpdateScript(): UseMutationResult<CallScript, ApiError,
  { scriptId: string; scriptText: string }>
// When text differs, ALSO inserts a script_edit_events row — but ONLY when
// !isAnonymous (R8). Anonymous edits update call_scripts only; RLS independently
// blocks anonymous script_edit_events writes, so the client check is a UX nicety,
// not the security boundary.
export function useToggleFavorite(): UseMutationResult<CallScript, ApiError,
  { scriptId: string; isFavorite: boolean }>

// hooks/use-call-logs.ts                                      [ws/calls-ui]
export function useCallLogs(): UseQueryResult<CallLog[], ApiError>
export function useCallLog(callLogId: string, opts?: { poll?: boolean }):
  UseQueryResult<CallLog | null, ApiError>
// poll: refetchInterval = POLL_INTERVAL_MS while status ∈ {"initiated","ringing"};
// stops on terminal status. If still non-terminal after POLL_TIMEOUT_MS, stop
// polling and surface a retryable error state ("the demo call didn't complete").
// Both constants from api-types (R17).

// hooks/use-make-call.ts                                      [ws/calls-ui]
export function useMakeCall(): UseMutationResult<MakeCallResponse, ApiError,
  { scriptId: string; phoneNumber: string }>  // invalidates call-logs keys on success
// Clients have ZERO write policies on call_logs (R5) — the row is created
// server-side by make-call; this hook only calls the edge function and refetches.

// hooks/use-brainstorm.ts                                     [ws/brainstorm-ui]
export type BrainstormStatus =
  "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "finalized" | "error"
export interface UseBrainstormResult {
  status: BrainstormStatus
  messages: BrainstormMessage[]
  error: ApiError | null
  isTtsFallback: boolean
  finalizedScript: { scriptId: string; targetPhoneHint: string | null } | null
  startRecording(): Promise<void>
  stopAndSend(): Promise<void>     // stop rec → transcribe → converse → speak reply (or finalize)
  cancelRecording(): void
  reset(): void
}
export function useBrainstorm(): UseBrainstormResult
// page effect: when finalizedScript set → nav.toScriptReview(finalizedScript.scriptId)

// hooks/use-audio-recorder.ts                                 [ws/brainstorm-ui]
export function useAudioRecorder(): {
  isSupported: boolean; isRecording: boolean; error: ApiError | null
  start(): Promise<void>; stop(): Promise<{ blob: Blob; mimeType: string }>; cancel(): void
}

// hooks/use-speech-playback.ts                                [ws/brainstorm-ui]
export function useSpeechPlayback(): {
  isSpeaking: boolean
  lastSource: "elevenlabs" | "browser" | null
  speak(text: string): Promise<void>   // tries edge.synthesizeSpeech; null → SpeechSynthesis fallback
  stop(): void
}
```

**`use-brainstorm` persistence duties (R2 — binding).** `gemini-conversation` is stateless: it never writes the database and its finalize response carries script *content*, never a server-generated script id. The hook owns ALL persistence, under RLS with the caller's own JWT:

1. **Session start:** INSERT a `brainstorm_sessions` row (client-generated flow; the row id is passed to `converse()` as `session_id`). Anonymous users CAN do this (R8).
2. **After each exchange:** UPDATE the row's transcript with the appended messages.
3. **On a `type: "script_finalized"` response:**
   a. INSERT the script content into `call_scripts` (anonymous-allowed) and capture the new row id;
   b. UPSERT `extracted_facts` into `user_facts` — **SKIPPED entirely when `isAnonymous`** (R8; RLS also blocks it);
   c. UPDATE `brainstorm_sessions.resulting_script_id` to the new script id;
   d. set `finalizedScript = { scriptId: <client-inserted call_scripts row id>, targetPhoneHint: script.target_phone_hint }`.

### 3.2 Edge API types + `src/lib/edge.ts` (FROZEN)

**One canonical type set (R3).** All edge request/response types, the error envelope, and every shared constant live in `supabase/functions/_shared/api-types.ts` (orchestrator-owned, dependency-free, side-effect-free, valid in both Deno and Vite). The app consumes them through the re-export shim:

```ts
// src/types/api.ts — FROZEN, complete content
export * from "../../supabase/functions/_shared/api-types.ts";
```

There is **no byte-mirror and no second copy**; `tsconfig.app.json`'s `include` lists the shared files (§1.1). The exact type bodies — `ApiErrorBody` (with `retryable`), the 11+1 `API_ERROR_CODES` (including `not_implemented`), `TranscribeResponse`, `GeminiConversationRequest`/`GeminiConversationResponse` (discriminated on `type`, with the `"script_finalized"` arm and the `session_id` field), `MakeCallRequest`/`MakeCallResponse`, webhook types, `CALL_STATUSES`, `AppointmentDetails`, the P6-marked `ScheduleCall*` types — are specified in **api.md** and not restated here.

All numeric caps, rate-limit numbers, the E.164 regex, header names, and poll cadence are exported constants in that module (R3/R17). Canonical values, shown **once** for reference:

| Constant (`api-types.ts`) | Canonical value | Frontend consumer |
|---|---|---|
| `LIMITS.AUDIO_MAX_BYTES` | 5 MB | recorder + pre-upload check |
| `LIMITS.AUDIO_MAX_SECONDS` | 60 | recorder hard-stop |
| `LIMITS.TTS_TEXT_MAX_CHARS` | 800 | `use-speech-playback` chunk guard |
| `LIMITS.CONVERSATION_MAX_TOTAL_CHARS` | 30,000 | `use-brainstorm` |
| `LIMITS.CONVERSATION_MAX_MESSAGES` | 40 | `use-brainstorm` |
| `LIMITS.MESSAGE_MAX_CHARS` | 4,000 | `use-brainstorm` / `schemas.ts` |
| `POLL_INTERVAL_MS` | 5,000 | `useCallLog` |
| `POLL_TIMEOUT_MS` | 120,000 | `useCallLog` |
| `E164_REGEX` | `^\+[1-9]\d{1,14}$` | `lib/phone.ts`, `schemas.ts` |
| `RATE_LIMITS` | see api.md §8 | 429 messaging only |

`src/lib/edge.ts` (orchestrator, frozen) is the sole client for the edge functions:

```ts
export class EdgeError extends Error {
  code: ApiErrorCode
  status: number
  retryable: boolean
}

export function transcribeAudio(blob: Blob, language?: string): Promise<TranscribeResponse>
export function converse(req: GeminiConversationRequest): Promise<GeminiConversationResponse>
export function synthesizeSpeech(text: string): Promise<Blob | null>
// returns null on 502 upstream_error / 503 quota_exceeded (R7) — caller falls back
// to browser SpeechSynthesis + TtsFallbackNotice; never throws for the fallback path
export function makeCall(req: MakeCallRequest): Promise<MakeCallResponse>
```

Error codes, envelope shape, status mapping, and `retryable` semantics are exactly api.md §1; `edge.ts` maps every non-2xx JSON envelope to `EdgeError` verbatim.

### 3.3 Guards (orchestrator, frozen)

```tsx
// components/guards/RequireAuth.tsx — full (non-anonymous) accounts
export function RequireAuth({ children, allowUnonboarded = false }:
  { children: ReactNode; allowUnonboarded?: boolean }): JSX.Element
// loading → <Skeleton/>; no session → /login; session but isAnonymous → /signup (R17);
// !allowUnonboarded && profile incomplete → /onboarding

// components/guards/RequireSession.tsx — anonymous-demo-allowed
export function RequireSession({ children }: { children: ReactNode }): JSX.Element
// no session → useSession().ensureSession() (signInAnonymously), render children once resolved
```

---

## 4. Naming conventions (binding)

| Thing | Convention | Example |
|---|---|---|
| React components + page files | PascalCase | `ScriptEditor.tsx`, `CallDetail.tsx` |
| Hook functions | `use`-prefixed camelCase | `useCallLogs` |
| Hook files | kebab-case `use-*.ts` | `use-call-logs.ts` (matches shadcn precedent) |
| Non-component `lib/` files | kebab-case | `query-keys.ts`, `tts-player.ts` |
| Edge function folders | kebab-case | `gemini-conversation/` |
| DB tables/columns | snake_case | `call_logs.duration_seconds` |
| TS types for DB rows | PascalCase singular | `CallLog`, `CallLogInsert`, `CallLogUpdate` |
| Edge env secrets | SCREAMING_SNAKE, never `VITE_` | `BLAND_WEBHOOK_SECRET` |
| TanStack Query keys | via `queryKeys` factory ONLY (§5.2); kebab-case string segments; entity-plural first; `"detail"` segment then id; user-scoped lists embed `userId` | `["call-logs", userId]`, `["call-logs", "detail", callLogId]` |
| Mutations | invalidate via the same factory; never hand-write key arrays | `queryClient.invalidateQueries({ queryKey: queryKeys.callLogs.all(userId) })` |

---

## 5. Pre-decided shared-file contents

### 5.1 Files frozen byte-for-byte at baseline (no workstream may touch)

`src/routes.tsx`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/lib/nav.ts`, `src/lib/supabase.ts`, `src/lib/edge.ts`, `src/lib/query-keys.ts`, `src/lib/phone.ts`, `src/lib/schemas.ts`, `src/lib/ics.ts`, `src/lib/utils.ts`, `src/types/*`, `src/components/ui/*`, `src/components/guards/*`, `supabase/functions/_shared/api-types.ts`, `package.json`, `package-lock.json`, `supabase/config.toml`, `.github/workflows/ci.yml`, `vercel.json`, `public/robots.txt`, `tests/setup.ts`, `tests/lib/nav.test.ts`, `README.md`, `CLAUDE.md`, `.claude/skills/**`, `docs/**` (including `docs/contracts/**`), all root configs (`tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `index.html`, `.env.example`).

Not byte-frozen but signature-frozen: `supabase/functions/_shared/ics.ts` (orchestrator stub → ws/edge implementation, §1.2) and the initial migration (orchestrator-authored at baseline → ws/db ownership, §1.3).

### 5.2 `src/lib/query-keys.ts` (final content)

```ts
export const queryKeys = {
  session: ["session"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  scripts: {
    all: (userId: string) => ["scripts", userId] as const,
    detail: (scriptId: string) => ["scripts", "detail", scriptId] as const,
  },
  callLogs: {
    all: (userId: string) => ["call-logs", userId] as const,
    detail: (callLogId: string) => ["call-logs", "detail", callLogId] as const,
  },
  brainstorm: (sessionId: string) => ["brainstorm", sessionId] as const,
} as const
```

---

## 6. Final contents of contested files

### 6.1 `package.json` (orchestrator; final diff vs current)

- **Remove deps:** `@supabase/ssr` (unused), `@radix-ui/react-toast` (sonner is the toast system).
- **Add deps:** none. (Audio uses native `MediaRecorder`/`Audio`/`speechSynthesis`; the `.ics` builder is the dependency-free shared module `_shared/ics.ts` consumed client-side via shim (R18) — no library; `zod` is already present for `schemas.ts`; all radix packages needed by the §1.1 ui/ subset are already present.)
- **Scripts:** add `"test:edge": "deno test --allow-env supabase/functions"` (documentation-only convenience; CI runs Deno directly). Everything else unchanged. Workers never edit `package.json`.

### 6.2 `src/lib/nav.ts` (final content — FROZEN)

```ts
import { useNavigate, type NavigateFunction } from "react-router-dom"

export const ROUTES = {
  landing: "/",
  login: "/login",
  signup: "/signup",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  brainstorm: "/brainstorm",
  scripts: "/scripts",
  scriptReview: "/scripts/:scriptId",
  calls: "/calls",
  callDetail: "/calls/:callLogId",
  profile: "/profile",
  notFound: "*",
} as const

export type RouteKey = keyof typeof ROUTES

export function routePath(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value)),
    template
  )
}

export interface Navigator {
  toLanding: () => void
  toLogin: () => void
  toSignup: () => void
  toOnboarding: () => void
  toDashboard: () => void
  toBrainstorm: () => void
  toScripts: () => void
  toScriptReview: (scriptId: string) => void
  toCalls: () => void
  toCallDetail: (callLogId: string) => void
  toProfile: () => void
  back: () => void
}

export function createNavigator(navigate: NavigateFunction): Navigator {
  return {
    toLanding: () => navigate(ROUTES.landing),
    toLogin: () => navigate(ROUTES.login),
    toSignup: () => navigate(ROUTES.signup),
    toOnboarding: () => navigate(ROUTES.onboarding),
    toDashboard: () => navigate(ROUTES.dashboard),
    toBrainstorm: () => navigate(ROUTES.brainstorm),
    toScripts: () => navigate(ROUTES.scripts),
    toScriptReview: (scriptId) => navigate(routePath(ROUTES.scriptReview, { scriptId })),
    toCalls: () => navigate(ROUTES.calls),
    toCallDetail: (callLogId) => navigate(routePath(ROUTES.callDetail, { callLogId })),
    toProfile: () => navigate(ROUTES.profile),
    back: () => navigate(-1),
  }
}

export function useNav(): Navigator {
  const navigate = useNavigate()
  return createNavigator(navigate)
}
```

(`tests/lib/nav.test.ts` is updated by orchestrator in the same baseline commit to cover every new method.)

### 6.3 `src/lib/supabase.ts` (final content — FROZEN; fixes import-time throw)

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

/** Lazy singleton. Throws only on first *use* without env, never at import time (keeps SSG/CI builds green). */
export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in values."
    )
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  })
  return client
}
```

All hooks call `getSupabase()`; the old `export const supabase` is removed.

### 6.4 `src/routes.tsx` (final content — FROZEN)

```tsx
import type { RouteRecord } from "vite-react-ssg"
import App from "./App"
import Landing from "./pages/Landing"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import Onboarding from "./pages/Onboarding"
import Dashboard from "./pages/Dashboard"
import Brainstorm from "./pages/Brainstorm"
import Scripts from "./pages/Scripts"
import ScriptReview from "./pages/ScriptReview"
import Calls from "./pages/Calls"
import CallDetail from "./pages/CallDetail"
import Profile from "./pages/Profile"
import NotFound from "./pages/NotFound"
import { RequireAuth } from "./components/guards/RequireAuth"
import { RequireSession } from "./components/guards/RequireSession"

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Landing />, entry: "src/pages/Landing.tsx" },
      { path: "login", element: <Login /> },
      { path: "signup", element: <Signup /> },
      { path: "onboarding", element: <RequireAuth allowUnonboarded><Onboarding /></RequireAuth> },
      { path: "dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: "brainstorm", element: <RequireSession><Brainstorm /></RequireSession> },
      { path: "scripts", element: <RequireAuth><Scripts /></RequireAuth> },
      { path: "scripts/:scriptId", element: <RequireSession><ScriptReview /></RequireSession> },
      { path: "calls", element: <RequireAuth><Calls /></RequireAuth> },
      { path: "calls/:callLogId", element: <RequireSession><CallDetail /></RequireSession> },
      { path: "profile", element: <RequireAuth><Profile /></RequireAuth> },
      { path: "*", element: <NotFound /> },
    ],
  },
]
```

### 6.5 `src/App.tsx` (final content — FROZEN)

Current content plus `TooltipProvider` (from `@/components/ui/tooltip`) wrapping `<Toaster /><Outlet />` inside `ThemeProvider`, and `QueryClient` constructed with `defaultOptions: { queries: { retry: 1, staleTime: 30_000 } }`. **No other providers** — per R16 there is no AuthProvider/session context; session state lives in TanStack Query (key `queryKeys.session`) + `onAuthStateChange` inside `use-session.ts`, so App never changes again.

### 6.6 `src/lib/edge.ts`

Pre-written in full by orchestrator at baseline implementing exactly the §3.2 surface over `getSupabase().functions.invoke` / raw `fetch` for the binary TTS response; maps every non-2xx envelope to `EdgeError` (carrying `code`, `status`, `retryable`); `synthesizeSpeech` returns `null` on 502/503 (never throws for the fallback path, R7).

### 6.7 Other pre-decided contents

- **`public/robots.txt`:** `User-agent: *` / `Allow: /` / `Disallow: /dashboard` `/brainstorm` `/scripts` `/calls` `/profile` `/login` `/signup` `/onboarding` — sitemap line removed until domain is final.
- **`vercel.json`** (orchestrator): SPA fallback rewrites + security headers for the static deploy. Workers never touch it.
- **`supabase/config.toml` additions:** under `[auth]` → `enable_anonymous_sign_ins = true`; per-function blocks `[functions.whisper-transcribe] verify_jwt = true` (likewise `gemini-conversation`, `elevenlabs-tts`, `make-call`) and `[functions.call-webhook] verify_jwt = false`. The `private` schema is NOT added to `[api]` schemas (R6).
- **`.github/workflows/ci.yml`** (per R22): all actions pinned by commit SHA; existing lint + typecheck + test + build job; a `deno` job running the edge-function tests; `gitleaks` secret scan; `npm audit --audit-level=high`; a `VITE_`-allowlist grep (only `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` may appear); and a `BLAND_API_KEY` grep that fails the build if the string appears anywhere in the repo (R12).
- **`.env.example`:** updated (NOT unchanged) — gains documented entries for `ALLOWED_ORIGINS` (comma-separated exact origins for edge CORS), `CALLS_ENABLED` (unset/`"false"` in this slice; P6 flips it — note included), and `DEMO_SIMULATION_DELAY_SECONDS` (default 30), each with a P6 note where applicable. Secrets remain comment-only reference; nothing real is committed.
- **`README.md` / `CLAUDE.md` / `.claude/skills/**`:** orchestrator-owned; README structure section refreshed at integration; no worker edits any of them.

---

## 7. Audio capture/playback ownership

**Owner: `ws/brainstorm-ui`** — sole consumer in the demo slice. Explicit carve-out: `src/lib/audio/` is the ONLY `src/lib` path not owned by the orchestrator.

- `src/lib/audio/recorder.ts` — MediaRecorder wrapper: `pickSupportedMimeType()` (prefer `audio/webm;codecs=opus`, fall back to `audio/mp4` for Safari), `startRecording(): Promise<RecorderHandle>` where `RecorderHandle = { stop(): Promise<{ blob: Blob; mimeType: string }>; cancel(): void }`. Enforces `LIMITS.AUDIO_MAX_SECONDS` (hard-stop) and `LIMITS.AUDIO_MAX_BYTES` (pre-upload check) from api-types. Handles `getUserMedia` permission errors as typed `ApiError`s; always stops tracks on stop/cancel. Audio is never persisted anywhere — blob is held in memory, sent, and discarded (R22).
- `src/lib/audio/tts-player.ts` — playback: `playBlob(blob: Blob): Promise<void>` (object-URL `Audio` element, revokes URL after `ended`), `speakWithBrowser(text: string): Promise<void>` (`speechSynthesis` with sane default voice/rate), `stopAll(): void`.
- Hooks `use-audio-recorder.ts` / `use-speech-playback.ts` (same owner) are the React-facing surface; the fallback decision (`synthesizeSpeech()` returns `null` → browser TTS, set `lastSource: "browser"`, brainstorm shows `TtsFallbackNotice`) lives in `use-speech-playback.ts`, matching R7. The module interfaces above are documented as stable so a future calls-ui feature can consume them without edits.

---

## 8. FILE-OWNERSHIP MAP (exhaustive, zero overlap)

### orchestrator (shared contracts; lands baseline before workers branch; frozen thereafter)

```
package.json  package-lock.json  index.html  .env.example  .gitignore  .nvmrc
tsconfig.json  tsconfig.app.json  tsconfig.node.json  vite.config.ts  vitest.config.ts
eslint.config.js  tailwind.config.ts  postcss.config.js  components.json
.github/workflows/ci.yml  vercel.json
public/favicon.ico  public/robots.txt
README.md  CLAUDE.md  .claude/skills/**  docs/**  (incl. docs/contracts/**)
supabase/config.toml  supabase/README.md  supabase/.gitignore
supabase/functions/_shared/api-types.ts
supabase/functions/_shared/ics.ts            (signature stub only; impl → ws/edge)
supabase/migrations/00000000000000_initial_schema.sql   (authored at baseline; ownership → ws/db)
src/App.tsx  src/main.tsx  src/routes.tsx  src/index.css  src/vite-env.d.ts
src/lib/nav.ts  src/lib/supabase.ts  src/lib/edge.ts  src/lib/query-keys.ts
src/lib/phone.ts  src/lib/schemas.ts  src/lib/ics.ts  src/lib/utils.ts
src/types/api.ts  src/types/database.ts      (database.ts generated from the frozen DDL, R14)
src/components/ui/** (14 files, §1.1)
src/components/guards/RequireAuth.tsx  src/components/guards/RequireSession.tsx
src/pages/NotFound.tsx
tests/setup.ts  tests/lib/nav.test.ts
+ all hook/page stubs in the baseline commit (ownership transfers to workstreams below after baseline)
```

### ws/db

```
supabase/migrations/00000000000000_initial_schema.sql   (post-baseline: fixes in-place pre-merge;
                                                         additive migrations only after integration)
supabase/seed.sql
supabase/tests/**                                       (SQL/RLS policy tests, R21)
```

### ws/edge

```
supabase/functions/**   — the entire tree per api.md §2 (deno.json, _shared/{schemas,errors,cors,
                          auth,supabase-admin,rate-limit,retry,gemini,prompts,demo-transcript}.ts,
                          all function index files, call-webhook/{index,extract,notify}.ts, tests/)
                          EXCEPT _shared/api-types.ts (orchestrator, frozen);
                          PLUS the implementation of _shared/ics.ts (frozen signature, §1.2)
```

### ws/auth-ui

```
src/pages/{Landing,Login,Signup,Onboarding,Dashboard,Profile}.tsx
src/components/layout/{AppShell,AppHeader,ThemeToggle}.tsx
src/components/auth/{AuthForm,OnboardingForm}.tsx
src/components/dashboard/{NewCallCard,RecentCallsCard,RecentScriptsCard}.tsx
src/hooks/use-session.ts  src/hooks/use-profile.ts
tests/auth/**
```

### ws/brainstorm-ui

```
src/pages/Brainstorm.tsx
src/components/brainstorm/{MicButton,ConversationView,ConversationBubble,VoiceStatus,TtsFallbackNotice}.tsx
src/hooks/{use-brainstorm,use-audio-recorder,use-speech-playback}.ts
src/lib/audio/{recorder,tts-player}.ts        ← explicit src/lib carve-out (§7)
tests/brainstorm/**
```

### ws/calls-ui

```
src/pages/{Scripts,ScriptReview,Calls,CallDetail}.tsx
src/components/calls/{ScriptEditor,ScriptCard,PhoneNumberField,CallProgressCard,CallLogRow,CallTranscript,AppointmentCard}.tsx
src/hooks/{use-scripts,use-call-logs,use-make-call}.ts
tests/calls/**
```

**Cross-import rule:** any workstream may *import* any baseline file or another workstream's hook (stubs guarantee compilation in every worktree); only the owner may *edit*. Files two workstreams would both want (`routes.tsx`, `nav.ts`, `App.tsx`, `package.json`, `config.toml`, `ci.yml`, `vercel.json`, `edge.ts`, `schemas.ts`, `ics.ts`, `_shared/api-types.ts`, `src/types/*`, `ui/*`) are all pre-written/pre-decided above in §5–6 — no worker ever touches them. If a contract change is discovered mid-build, it goes to the orchestrator, who amends the baseline file on main and workers rebase; workers never patch shared files locally.

Merge order: baseline → ws/db → ws/edge → ws/auth-ui → ws/brainstorm-ui → ws/calls-ui.
