# Calldone — Frozen Edge-Function API Contract (final)

**Status: FROZEN.** Workers copy this verbatim. Any change requires an update to the decision
register and a re-sync of all worktrees.

**Conformance:** this document embodies the Decision Register
(`docs/contracts/decision-register.md`, rulings R1–R22) in full. Where any earlier draft, spec
passage, or other document disagrees, the register — and therefore this document — wins.

Canonical machine-readable form: `supabase/functions/_shared/api-types.ts` (§2). All numeric
caps, rate-limit numbers, the E.164 regex, header names, and poll cadence live there as exported
constants. This document references the constant names; the only places numbers appear are the
§2 mirror of that file and the single reference table in §8.

---

## 0. Auth Model — resolving the "no signup required" vs "JWT required" gap

**Resolution: Supabase anonymous sign-ins.** Every built edge function except `call-webhook`
requires a valid Supabase JWT, and all of them accept **anonymous JWTs** (`is_anonymous: true`
claim). The public demo flow is:

1. Visitor clicks "Try the demo" → client calls `supabase.auth.signInAnonymously()` if no
   session exists.
2. The anonymous user is a real `auth.users` row with a real `auth.uid()`, so RLS
   (`auth.uid() = user_id`) works unchanged — anonymous visitors own their own
   `brainstorm_sessions`, `call_scripts`, and `call_logs` rows. Per R8, anonymous users may
   **not** write `user_facts`, `script_edit_events`, or `script_feedback` (RLS-enforced AND
   skipped client-side).
3. Edge functions call `requireUser(req)` (`_shared/auth.ts`) to derive
   `{ userId, isAnonymous, client }` from the verified JWT (the `client` is caller-scoped for
   RLS reads, R5). Anonymous sessions are **force-coerced to demo mode** server-side (§6) and
   rate-limited per-IP and per-user (§8).
4. Anonymous retention is 24 h (R15, enforced by the pg_cron job in the migration; FK cascade
   erases all derived data).

Auth requirement vocabulary used below:

| Label | Meaning |
|---|---|
| `JWT (anon ok)` | Valid Supabase JWT required; anonymous JWTs accepted; anonymous forces demo semantics |
| `JWT (no anon)` | Reserved for P6 functions (`schedule-call`, `verify-phone-*`); **no built function in this slice uses it** |
| `HMAC (no JWT)` | `verify_jwt = false`; request authenticated by signed-request HMAC (§3.6) |

**Required config (orchestrator-owned `supabase/config.toml`, frozen per R20):**
- `enable_anonymous_sign_ins = true` under `[auth]`, and `[functions.call-webhook]` →
  `verify_jwt = false`. All other functions keep the platform default `verify_jwt = true`.
- Hosted dashboard: enable "Allow anonymous sign-ins" and set its rate limit to **10 sign-ins
  per IP per hour** (R6; this one limit is a Supabase Auth dashboard setting, not the §8 RPC, so
  it is intentionally not a constant in `api-types.ts`).

**Platform 401 caveat (frozen behavior, document in client):** when `verify_jwt = true`, a
missing/invalid JWT is rejected by the Supabase platform *before* our code runs, with Supabase's
own JSON shape — **not** our error envelope. Clients must treat any 401 (either shape) as
"session expired → re-auth". All other error responses from our code use the envelope in §1.

---

## 1. Shared Error Envelope (all functions, all error statuses)

The envelope type and the 12-code list are defined once in `api-types.ts` (§2):

```ts
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;                    // human-readable, safe to show in a toast
    retryable: boolean;                 // client may retry (with backoff) when true
    details?: Record<string, unknown>;  // optional machine context (e.g. { field: "phone_number" }); NEVER stack traces or secrets
  };
}
```

| Code | HTTP | `retryable` | When |
|---|---|---|---|
| `invalid_request` | 400 | false | Malformed body, failed validation |
| `unauthorized` | 401 | false | Bad/missing JWT, or bad/missing/stale webhook signature |
| `forbidden` | 403 | false | Valid JWT but operation not allowed |
| `not_found` | 404 | false | Referenced resource (`script_id`) not found / not owned |
| `method_not_allowed` | 405 | false | Anything but POST (or OPTIONS preflight where supported) |
| `payload_too_large` | 413 | false | Body or audio exceeds limit |
| `unsupported_media_type` | 415 | false | Wrong Content-Type |
| `rate_limited` | 429 | true | §8; carries rate-limit headers |
| `internal_error` | 500 | true | Anything else; message is generic, never leaks internals |
| `not_implemented` | 501 | false | Code path frozen but cut from this slice (e.g. real-call arm of make-call, R12) |
| `upstream_error` | 502 | true | Provider (Groq/Gemini/ElevenLabs/Resend) failed after retries |
| `quota_exceeded` | 503 | true | Upstream/global free-tier quota exhausted (e.g. ElevenLabs); TTS client falls back to browser SpeechSynthesis (R7) |

Rules: error bodies are always `Content-Type: application/json` and built only by
`_shared/errors.ts` (`jsonError(...)`). `429` additionally carries the rate-limit headers (§8).

---

## 2. Shared Types Module — exact layout and sharing mechanism

**Single source of truth:** `supabase/functions/_shared/api-types.ts`. It is **dependency-free
and side-effect-free** (types, const arrays, const maps, const objects, regex literals only — no
`Deno.*`, no imports). That makes it valid simultaneously for the Deno runtime (edge functions
import it as `../_shared/api-types.ts`) and the Vite/TS app — **no build step, no copying.**

**Vite-side shim** at `src/types/api.ts`:

```ts
// src/types/api.ts — DO NOT add types here. Single source of truth lives in
// supabase/functions/_shared/api-types.ts so Deno functions and the app share one file.
export * from "../../supabase/functions/_shared/api-types.ts";
```

(The `.ts` extension is legal on both sides: `allowImportingTsExtensions: true` is set in
`tsconfig.app.json`, and Deno requires it.)

**Required tsconfig wiring** (orchestrator-owned, frozen per R20): because `tsconfig.app.json`
has `composite: true`, out-of-`include` files must be listed. The `include` line is:

```json
"include": ["src", "tests", "supabase/functions/_shared/api-types.ts", "supabase/functions/_shared/ics.ts"]
```

### 2.1 Final module tree and ownership (R13)

One `supabase/functions/` tree, single owner **ws/edge** — except `_shared/api-types.ts`
(orchestrator-authored, frozen; nobody edits) and `_shared/ics.ts` (orchestrator stubs the
frozen signature; ws/edge implements). There are no per-area sub-workers (no voice/calls/webhook
split).

```
supabase/functions/
  _shared/
    api-types.ts        ← FROZEN contract constants/types (orchestrator; mirrored in §2.2)
    ics.ts              ← buildIcs() — orchestrator-stubbed signature (§2.3); ws/edge implements;
                          MUST stay dependency-free, browser-safe TS (app imports it via src/lib/ics.ts)
    schemas.ts          ← zod runtime validators (Deno-only; imports "npm:zod@3.25.76")
    errors.ts           ← jsonError(code, status, message, ...) envelope builder
    cors.ts             ← CORS helper (§7)
    auth.ts             ← requireUser(req): Promise<{ userId, isAnonymous, client } | Response> (verified JWT; client = caller-scoped, R5; Response = 401 short-circuit)
    supabase-admin.ts   ← service-role client factory (server-only)
    rate-limit.ts       ← wrapper over the rate_limit_hit RPC (§8)
    retry.ts            ← bounded exponential-backoff helper for provider calls (3 attempts)
    gemini.ts           ← Gemini REST client incl. tool-call plumbing
    prompts.ts          ← server-side system prompt builders (disclosures, user facts)
    demo-transcript.ts  ← canned demo transcript templates + buildDemoTranscript()
  whisper-transcribe/index.ts
  gemini-conversation/index.ts
  elevenlabs-tts/index.ts
  make-call/index.ts            ← incl. buildDemoWebhookPayload() + HMAC demo simulator (§5, §6)
  call-webhook/index.ts
  call-webhook/extract.ts       ← appointment extraction (§4.3)
  call-webhook/notify.ts        ← Resend email + .ics attachment; SMS no-ops in this slice (§3.6, §9)
  tests/*.test.ts               ← Deno tests, fetch-mocked providers (R21)
  deno.json
```

Reserved for P6+ (do NOT create now): `supabase/functions/schedule-call/`,
`supabase/functions/verify-phone-start/`, `supabase/functions/verify-phone-confirm/`,
`supabase/functions/cron-execute-scheduled-calls/`.

### 2.2 Contents of `supabase/functions/_shared/api-types.ts`

> **The authoritative copy lives in the repo file** (orchestrator-authored, frozen per R13/R20).
> This section mirrors it faithfully; if they ever diverge, the repo file wins.

```ts
// supabase/functions/_shared/api-types.ts
// ============================================================================
// FROZEN API CONTRACT for Calldone edge functions (Phases 1-4 demo slice).
// Single source of truth, imported by Deno edge functions
// (../_shared/api-types.ts) AND the Vite app (via the src/types/api.ts
// re-export shim). MUST stay dependency-free and side-effect-free: types,
// const arrays/maps/objects, and regex literals only. No Deno globals, no
// imports, no runtime logic beyond constant expressions.
//
// Owned by the orchestrator. Do not edit without a decision-register update
// (docs/contracts/decision-register.md).
// ============================================================================

// ---------------------------------------------------------------- errors ---

export const API_ERROR_CODES = [
  "invalid_request", //         400 — malformed body, failed validation
  "unauthorized", //            401 — bad/missing JWT or webhook signature
  "forbidden", //               403 — valid JWT but operation not allowed
  "not_found", //               404 — resource missing OR not owned (no existence leak)
  "method_not_allowed", //      405 — anything but POST (or OPTIONS preflight)
  "payload_too_large", //       413 — body or audio exceeds limit
  "unsupported_media_type", //  415 — wrong Content-Type
  "rate_limited", //            429 — see RATE_LIMITS
  "internal_error", //          500 — generic; details never leak internals
  "not_implemented", //         501 — real-call mode in the demo slice (R12)
  "upstream_error", //          502 — provider failed after retries
  "quota_exceeded", //          503 — upstream free-tier quota exhausted
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string; //                  human-readable, safe to show in a toast
    retryable: boolean; //               client may retry (with backoff) when true
    details?: Record<string, unknown>; // machine context; NEVER stack traces or secrets
  };
}

/** retryable flag per code (frozen): */
export const RETRYABLE_CODES: readonly ApiErrorCode[] = [
  "rate_limited",
  "internal_error",
  "upstream_error",
  "quota_exceeded",
] as const;

// ------------------------------------------------------------- constants ---

/** Canonical E.164: + then 2-16 digits total, no leading zero. Used by DB
 *  CHECKs, server zod, and client validation alike. */
export const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/** Webhook HMAC auth (R11): signature = hex(HMAC-SHA256(BLAND_WEBHOOK_SECRET,
 *  `${timestamp}.${rawBody}`)). Constant-time comparison required. */
export const WEBHOOK_SIGNATURE_HEADER = "x-calldone-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-calldone-timestamp"; // unix seconds
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export const RATE_LIMIT_HEADERS = {
  limit: "x-ratelimit-limit",
  remaining: "x-ratelimit-remaining",
  reset: "x-ratelimit-reset", // unix epoch seconds when the window resets
  retryAfter: "retry-after", //  seconds, only on 429
} as const;

/** Canonical numeric caps (R17). Server zod enforces; client mirrors for UX. */
export const LIMITS = {
  AUDIO_MAX_BYTES: 5_242_880, //          5 MB upload cap (server-authoritative)
  AUDIO_MAX_SECONDS: 60, //               client recorder hard-stop
  TTS_TEXT_MAX_CHARS: 800,
  CONVERSATION_MAX_TOTAL_CHARS: 30_000,
  MESSAGE_MAX_CHARS: 4_000,
  MESSAGES_MAX: 40,
  WEBHOOK_BODY_MAX_BYTES: 1_048_576, //   1 MB
  TRANSCRIPT_STORED_MAX_CHARS: 100_000,
  SCRIPT_TEXT_MIN_CHARS: 40,
  SCRIPT_TEXT_MAX_CHARS: 4_000,
  EXTRACTED_FACTS_MAX: 10,
  POLL_INTERVAL_MS: 5_000, //             client polls call_logs at this cadence
  POLL_TIMEOUT_MS: 120_000, //            then shows a retryable error state
  DEMO_DEFAULT_DELAY_SECONDS: 30, //      default DEMO_SIMULATION_DELAY_SECONDS
} as const;

export const TRANSCRIBE_ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

/** Fixed-window rate limits (R6), enforced via public.rate_limit_hit().
 *  window: 'hour' | 'day' | 'month' (date_trunc fixed windows). */
export const RATE_LIMITS = {
  // `bucket` is the exact first argument to public.rate_limit_hit() — frozen
  // here so edge code and contract docs cannot drift to different strings.
  makeCallPerIp: { bucket: "make_call:ip", limit: 5, window: "hour" }, //         spec §Demo Safety
  makeCallPerAnonUser: { bucket: "make_call:uid_anon", limit: 10, window: "day" },
  makeCallPerUser: { bucket: "make_call:uid", limit: 20, window: "day" }, //      spec's daily cap
  transcribePerUser: { bucket: "whisper:uid", limit: 30, window: "hour" },
  transcribePerIp: { bucket: "whisper:ip", limit: 60, window: "hour" },
  conversationPerUser: { bucket: "gemini:uid", limit: 60, window: "hour" },
  conversationPerIp: { bucket: "gemini:ip", limit: 120, window: "hour" },
  ttsRequestsPerUser: { bucket: "tts:uid", limit: 20, window: "hour" },
  ttsRequestsPerIp: { bucket: "tts:ip", limit: 60, window: "hour" },
  ttsCharsPerUser: { bucket: "tts_chars:uid", limit: 1_500, window: "day" },
  ttsCharsGlobal: { bucket: "tts_chars:global", limit: 9_000, window: "month" }, // ElevenLabs free-tier guard
} as const;
export type RateLimitWindow = "hour" | "day" | "month";

/** call_logs.status enum — mirrors the frozen DB schema. */
export const CALL_STATUSES = [
  "initiated",
  "ringing",
  "completed",
  "failed",
  "no_answer",
  "busy",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = [
  "completed",
  "failed",
  "no_answer",
  "busy",
] as const;

/**
 * Normalization of Bland's raw `status` strings to our CallStatus.
 * Unknown raw status: "completed" if payload.completed === true, else "failed".
 */
export const BLAND_STATUS_MAP: Record<string, CallStatus> = {
  completed: "completed",
  complete: "completed",
  "no-answer": "no_answer",
  no_answer: "no_answer",
  busy: "busy",
  failed: "failed",
  error: "failed",
};

export type CallMode = "demo" | "real";

/** Fixed fictional caller id used in simulated demo payloads (undialable). */
export const DEMO_CALLER_ID = "+15555550100";
export const DEMO_CALL_ID_PREFIX = "demo_";

// --------------------------------------------------- whisper-transcribe ---
// POST multipart/form-data. Form field names:
export const TRANSCRIBE_AUDIO_FIELD = "audio"; //       File/Blob, TRANSCRIBE_ALLOWED_MIME_TYPES, <= LIMITS.AUDIO_MAX_BYTES
export const TRANSCRIBE_LANGUAGE_FIELD = "language"; // optional ISO-639-1, e.g. "en"

export interface TranscribeResponse {
  text: string; //                    "" if no speech detected
  duration_seconds: number | null; // null if provider omits it
}

// -------------------------------------------------- gemini-conversation ---

export interface ConversationMessage {
  role: "user" | "assistant"; // server maps assistant -> Gemini "model"
  text: string; //               1..LIMITS.MESSAGE_MAX_CHARS, plain text
}

export interface GeminiConversationRequest {
  /** Full history, oldest first. 1..LIMITS.MESSAGES_MAX items. Last item MUST
   *  be role "user". The system prompt is built SERVER-SIDE only (disclosures,
   *  user facts); clients can never inject or override it. */
  messages: ConversationMessage[];
  /** Client-generated brainstorm_sessions.id (uuid), for logging only.
   *  The function is stateless (R2) — it never writes the DB. */
  session_id?: string | null;
}

export interface ExtractedFact {
  key: string; //        snake_case, /^[a-z][a-z0-9_]{1,63}$/
  value: string; //      1..500 chars
  confidence: number; // 0..1
}

export interface FinalizedScript {
  /** Complete call script. ALWAYS includes the two mandatory disclosures
   *  ("AI assistant calling on behalf of <name>", "this call may be
   *  recorded") — enforced post-generation in code, not by model compliance. */
  script_text: string; //              LIMITS.SCRIPT_TEXT_MIN/MAX_CHARS
  call_purpose: string; //             3..200 chars
  target_phone_hint: string | null; // E.164 or null if the user never said a number
  extracted_facts: ExtractedFact[]; // 0..LIMITS.EXTRACTED_FACTS_MAX items
}

export interface GeminiReplyResponse {
  type: "reply";
  message: string; //          agent's next utterance (plain text, TTS-ready)
  session_id: string | null; // echoed
}

export interface GeminiScriptFinalizedResponse {
  type: "script_finalized";
  script: FinalizedScript;
  /** Short spoken confirmation for TTS, e.g. "Done — I've drafted your script." */
  closing_message: string;
  session_id: string | null; // echoed
}

export type GeminiConversationResponse =
  | GeminiReplyResponse
  | GeminiScriptFinalizedResponse;

// ------------------------------------------------------- elevenlabs-tts ---

export const TTS_VOICES = ["default"] as const; // server maps to real ElevenLabs voice ids
export type TtsVoice = (typeof TTS_VOICES)[number];

export interface TtsRequest {
  text: string; //     1..LIMITS.TTS_TEXT_MAX_CHARS
  voice?: TtsVoice; // defaults to "default"
}
// TTS success response is raw `audio/mpeg` bytes (HTTP 200), NOT JSON.
// 503 quota_exceeded / 502 upstream_error => client falls back to browser
// SpeechSynthesis (synthesizeSpeech() returns null) and shows the notice.

// ------------------------------------------------------------ make-call ---

export interface MakeCallRequest {
  script_id: string; //    uuid of a call_scripts row owned by the caller (RLS-enforced)
  phone_number: string; // E.164
  // Deliberately NO client-supplied demo/real flag. The server decides (R12).
}

export interface MakeCallResponse {
  call_log_id: string; // uuid of the call_logs row created by this function
  call_id: string; //     "demo_<uuid>" in demo mode; Bland call_id in real mode (P6)
  mode: CallMode; //      what the server actually decided
  status: "initiated";
  /** Seconds until the simulated webhook fires (demo); null for real calls. */
  estimated_completion_seconds: number | null;
}

// -------------------------------------------------------- schedule-call ---
// P6 ONLY — types frozen now; the function is NOT built or deployed in the
// demo slice and scheduled_calls has SELECT-only client access (R10).

export interface ScheduleCallRequest {
  script_id: string; //     uuid owned by caller
  phone_number: string; //  E.164
  scheduled_for: string; // ISO 8601; must be > now+5min and < now+30days
}

export interface ScheduleCallResponse {
  scheduled_call_id: string;
  status: "pending";
  scheduled_for: string; // normalized UTC ISO 8601
}

// --------------------------------------------------------- call-webhook ---

/** Correlation metadata. Set by make-call (Bland echoes it back in P6) and
 *  included verbatim in simulated demo payloads. NEVER a source of identity:
 *  the user is resolved from the matched call_logs row; metadata is a
 *  cross-check only (R4). */
export interface CallWebhookMetadata {
  call_log_id: string;
  user_id: string;
  is_demo: boolean;
}

/** The subset of Bland's webhook payload we consume. Simulated demo payloads
 *  use EXACTLY this shape and flow through the same parser (zod .passthrough();
 *  unknown extra fields from Bland are ignored). */
export interface CallWebhookPayload {
  call_id: string; //                 Bland call_id, or "demo_<uuid>"
  to: string; //                      number called (E.164)
  from?: string | null;
  completed: boolean;
  status: string; //                  raw provider status; normalized via BLAND_STATUS_MAP
  corrected_duration?: number | string | null; // seconds (Bland sends string or number)
  call_length?: number | null; //     minutes, float (Bland) — used if corrected_duration absent
  concatenated_transcript?: string | null; // "speaker: text\n" lines
  summary?: string | null;
  error_message?: string | null;
  answered_by?: "human" | "voicemail" | "unknown" | null;
  metadata?: CallWebhookMetadata | null;
}

export interface CallWebhookResponse {
  received: true;
  processed: boolean;
  call_log_id?: string;
  reason?: "unknown_call" | "already_processed" | "metadata_mismatch";
}

// --------------------------------------------- appointment extraction ------

/** Stored in call_logs.appointment_details (JSONB). null when no appointment. */
export interface AppointmentDetails {
  title: string; //          e.g. "Pharmacy pickup — Walgreens"
  start_iso: string; //      ISO 8601 WITH offset
  end_iso: string | null; // null => assume 30 min when building the .ics
  location: string | null;
  notes: string | null;
  confidence: number; //     0..1; UI flags < 0.6 as "unconfirmed"
}
```

### 2.3 Frozen `_shared/ics.ts` signature (R18)

Single .ics source for the whole product. The orchestrator stubs this exact signature at
baseline; **ws/edge implements it**. It MUST stay dependency-free, browser-safe TS (no `Deno.*`,
no imports beyond `api-types.ts`) because the app re-exports it via `src/lib/ics.ts`.

```ts
// supabase/functions/_shared/ics.ts
import type { AppointmentDetails } from "./api-types.ts";

/** Builds a complete RFC 5545 VCALENDAR string (CRLF line endings, proper
 *  TEXT escaping of , ; \ and newlines; end_iso null => start + 30 min). */
export function buildIcs(
  appointment: AppointmentDetails,
  opts: { uid: string; organizerName?: string },
): string;
```

Consumers: `call-webhook/notify.ts` (email attachment for authed users) and the client via the
`src/lib/ics.ts` re-export (`AppointmentCard` builds the download client-side from
`call_logs.appointment_details` — works for anonymous demo users).

---

## 3. Per-Function Contracts

Base URL: `${SUPABASE_URL}/functions/v1/<name>`. Clients call via
`supabase.functions.invoke(...)` (sends `Authorization` + `apikey` automatically). All bodies
UTF-8 JSON unless stated.

**Built and deployed in this slice (the complete set):** `whisper-transcribe`,
`gemini-conversation`, `elevenlabs-tts`, `make-call`, `call-webhook`.

### 3.1 `whisper-transcribe`

| | |
|---|---|
| Method | `POST` (and `OPTIONS` preflight). Anything else → 405 |
| Auth | `JWT (anon ok)` |
| Request | `multipart/form-data`: field `audio` (required; `TRANSCRIBE_ALLOWED_MIME_TYPES` = `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`; ≤ `LIMITS.AUDIO_MAX_BYTES`; ≤ `LIMITS.AUDIO_MAX_SECONDS`), field `language` (optional, ISO-639-1) |
| Success | `200` → `TranscribeResponse` |
| Errors | `400 invalid_request` (missing field), `401`, `413 payload_too_large` (> `LIMITS.AUDIO_MAX_BYTES`), `415 unsupported_media_type`, `429`, `502 upstream_error` (Groq failed after 3 retries via `_shared/retry.ts`), `500` |
| Secrets | `GROQ_API_KEY` (model: `whisper-large-v3-turbo`) |
| Rate limit | `RATE_LIMITS.transcribePerUser` (uid/hour) + `RATE_LIMITS.transcribePerIp` (IP/hour) |

Audio is forwarded to Groq and **never stored anywhere** — no Supabase Storage, no disk, no logs
(R22).

### 3.2 `gemini-conversation`

| | |
|---|---|
| Method | `POST` + `OPTIONS` |
| Auth | `JWT (anon ok)` |
| Request | `application/json` → `GeminiConversationRequest` |
| Success | `200` → `GeminiConversationResponse` (discriminated on `type`; finalize variant is `"script_finalized"`) |
| Errors | `400 invalid_request` (> `LIMITS.MESSAGES_MAX` messages, message > `LIMITS.MESSAGE_MAX_CHARS`, total > `LIMITS.CONVERSATION_MAX_TOTAL_CHARS`, last not `user`), `401`, `415`, `429`, `502 upstream_error` (after 3 retries), `500` |
| Secrets | `GEMINI_API_KEY` (model: `gemini-2.5-flash`) |
| Rate limit | `RATE_LIMITS.conversationPerUser` (uid/hour) + `RATE_LIMITS.conversationPerIp` (IP/hour) |

Server behavior (frozen): the system prompt is built **only server-side** in
`_shared/prompts.ts`. It always embeds the two mandatory disclosures so every finalized script
contains them; their presence is additionally verified post-generation in code with a unit test
(R22). For **non-anonymous** callers, the function reads `profiles` + `user_facts` using a
**caller-JWT-scoped** supabase client (RLS enforced; no service role). For anonymous callers it
uses a generic prompt.

The function is **stateless** (R2): it never writes to the DB, and the finalize response carries
script *content*, never a server-generated `script_id`. **The client persists everything**: the
`use-brainstorm` hook inserts `brainstorm_sessions`, `call_scripts`, and upserts `user_facts`
under RLS. Anonymous users skip the `user_facts` writes entirely — blocked by RLS and skipped
client-side via `isAnonymous` checks (R8); they CAN persist their own `brainstorm_sessions` and
`call_scripts`.

When Gemini returns a `finalize_script` tool call, the function validates it against
`FinalizedScriptSchema` (§4) plus the disclosure check; on failure it makes **one** repair
re-prompt, then returns `502 upstream_error`.

### 3.3 `elevenlabs-tts`

| | |
|---|---|
| Method | `POST` + `OPTIONS` |
| Auth | `JWT (anon ok)` |
| Request | `application/json` → `TtsRequest` (text 1..`LIMITS.TTS_TEXT_MAX_CHARS`) |
| Success | `200`, `Content-Type: audio/mpeg`, raw MP3 bytes, `Cache-Control: no-store` (supabase-js returns it as a `Blob`) |
| Errors | `400 invalid_request` (empty/oversized text, unknown voice), `401`, `415`, `429 rate_limited` (request or per-user char budget), `503 quota_exceeded` (ElevenLabs quota signals OR the global monthly char budget exhausted), `502 upstream_error` (other ElevenLabs failures), `500` |
| Secrets | `ELEVENLABS_API_KEY`; server-side map `TTS_VOICES → ElevenLabs voice ids` (clients never send raw provider voice ids) |
| Rate limit | `RATE_LIMITS.ttsRequestsPerUser` (uid/hour) + `RATE_LIMITS.ttsRequestsPerIp` (IP/hour) request counts, plus char budgets `RATE_LIMITS.ttsCharsPerUser` (uid/day) and `RATE_LIMITS.ttsCharsGlobal` (global/month) (§8) |

Client contract (R7): `synthesizeSpeech()` returns `null` on `502`/`503` → browser
`SpeechSynthesis` fallback + "premium voice unavailable" notice. Never a 200 with a fallback
payload. The global monthly char budget intentionally surfaces as `503 quota_exceeded` so it is
indistinguishable from upstream quota exhaustion and triggers the same fallback.

### 3.4 `make-call`

| | |
|---|---|
| Method | `POST` + `OPTIONS` |
| Auth | `JWT (anon ok)`; anonymous ⇒ demo mode forced |
| Request | `application/json` → `MakeCallRequest` |
| Success | `202 Accepted` → `MakeCallResponse` (call completes asynchronously via webhook) |
| Errors | `400 invalid_request` (bad E.164, bad uuid), `401`, `404 not_found` (script_id not found **or not owned** — same code for both, no existence leak), `415`, `429 rate_limited`, `501 not_implemented` (resolveCallMode → `"real"`, R12), `500` |
| Secrets | `BLAND_WEBHOOK_SECRET`, env `CALLS_ENABLED` (P6 flag, unset in this slice), `DEMO_SIMULATION_DELAY_SECONDS` |
| Rate limit | `RATE_LIMITS.makeCallPerIp` (IP/hour) + `RATE_LIMITS.makeCallPerAnonUser` (anon-uid/day) + `RATE_LIMITS.makeCallPerUser` (authed-uid/day) |

DB access (R5): reads `call_scripts` via the **caller-JWT-scoped** client (RLS ownership check →
404 on miss), then INSERTs the `call_logs` row via the **service-role** client
(`_shared/supabase-admin.ts`) — clients have **zero write policies** on `call_logs`. Full demo
semantics in §6.

There is **no Bland client code anywhere in this slice** and `BLAND_API_KEY` is never referenced
(CI grep gate, R12/R22). $0 Bland by absence of code, not by a flag.

### 3.5 `schedule-call` — CUT from this slice (R10)

Not built, not deployed. The request/response types remain frozen in `api-types.ts` marked
"P6 — not built or deployed in this slice" so the contract is complete. The `scheduled_calls`
table ships in the frozen schema with **SELECT-only** client access (no INSERT/UPDATE/DELETE
policies or grants until P6). No "Schedule for later" UI exists in the slice. When P6 builds it:
auth will be `JWT (no anon)`, and `cron-execute-scheduled-calls` (service-role, pg_cron) will
execute pending rows with the mode decided **at execution time** by the same §6 algorithm — this
contract does not change.

### 3.6 `call-webhook`

| | |
|---|---|
| Method | `POST` only. `OPTIONS`/others → 405. **No CORS headers ever** (server-to-server only) |
| Auth | `HMAC (no JWT)` — signed request, see below. `verify_jwt = false` in config.toml |
| Request | `application/json` → `CallWebhookPayload` (≤ `LIMITS.WEBHOOK_BODY_MAX_BYTES`; larger → 413) |
| Success | `200` → `CallWebhookResponse`. Always 200 for authenticated-but-unprocessable payloads (`processed: false` + `reason`) to prevent provider retry storms |
| Errors | `401 unauthorized` (missing/invalid/stale signature), `400 invalid_request` (unparseable JSON), `405`, `413`, `500` (transient processing failure — sender may retry; processing is idempotent) |
| Secrets | `BLAND_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-injected). Twilio secrets are NOT set in this slice (§9) |
| Rate limit | none (signature-gated) |

**Authentication (R11, frozen):** HMAC-SHA256 over the string `"<timestamp>.<rawBody>"`, keyed
by `BLAND_WEBHOOK_SECRET`, sent as:

- `WEBHOOK_SIGNATURE_HEADER` (`x-calldone-signature`): lowercase hex digest
- `WEBHOOK_TIMESTAMP_HEADER` (`x-calldone-timestamp`): unix seconds

Verification: reject (`401`) if either header is missing, if
`|now − timestamp| > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`, or if the recomputed digest does not
match under a **constant-time compare**. The raw body bytes are read once, verified, then
parsed. There is **no query-param secret and no `x-webhook-secret` header — ever.** Failed
attempts are logged (IP + call_id if parseable) for monitoring; the body is never processed.
make-call's demo simulator computes the exact same HMAC (§5, §6), so the webhook cannot
distinguish it from a real sender except via `metadata.is_demo`.

**Processing** (identical for real and demo payloads — this is the parity guarantee):

1. **Resolve the `call_logs` row** by `bland_call_id = payload.call_id` (with
   `payload.metadata.call_log_id`, when present, as the primary-key fast path into the same
   row). Not found → `200 {received:true, processed:false, reason:"unknown_call"}`.
   **The affected user's identity is resolved ONLY from this matched row** — its `user_id`
   column is the identity; nothing in the payload ever is (R4).
2. **Cross-check (never identity):** when `payload.metadata` is present, the row's `id` must
   equal `metadata.call_log_id` and the row's `user_id` must equal `metadata.user_id`. Any
   mismatch → `200 {..., processed:false, reason:"metadata_mismatch"}` + log. Payload identity
   fields are a tripwire for forged/misrouted payloads, never a source of truth.
3. **Idempotency:** if row status is already terminal (`completed|failed|no_answer|busy`) →
   `200 {..., processed:false, reason:"already_processed"}`.
4. **Normalize and update:** status via `BLAND_STATUS_MAP` (unknown raw:
   `completed===true ? "completed" : "failed"`). Duration: `Number(corrected_duration)` seconds,
   else `round(call_length * 60)`, else null. Transcript truncated to
   `LIMITS.TRANSCRIPT_STORED_MAX_CHARS` before storage. Update `call_logs` via the service-role
   client, `WHERE id = <resolved> AND bland_call_id = <payload.call_id>`.
5. **Extraction:** if status `completed` and transcript non-empty: Gemini tool-call extraction
   (§4.3, `call-webhook/extract.ts`) → store `appointment_details` (or null) and
   `confirmation_detected`.
6. **Notifications** (`call-webhook/notify.ts`; failures log to `call_logs.error_reason`, never
   block the 200 — R19): **SMS** via Twilio only if `is_demo === false` AND
   `profiles.phone_verified_at` not null — unreachable in this slice, and the Twilio secrets are
   unset, so `notify.ts` must **no-op SMS gracefully when they are absent**. **Email** via
   Resend only if the auth user has a non-null email (anonymous users have none — natural
   suppression), with transcript summary + `.ics` attachment (built by `_shared/ics.ts`
   `buildIcs()`) when `appointment_details` exists.

---

## 4. Gemini Tool-Call Schema for Finalized Scripts (frozen)

### 4.1 TS shape

`FinalizedScript` / `ExtractedFact` exactly as in `api-types.ts` (§2.2).

### 4.2 Zod validators — `supabase/functions/_shared/schemas.ts` (Deno-only)

```ts
// supabase/functions/_shared/schemas.ts  (Deno-only; never imported by the Vite app)
import { z } from "npm:zod@3.25.76";
import { E164_REGEX, LIMITS } from "./api-types.ts";

export const ExtractedFactSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  value: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const FinalizedScriptSchema = z.object({
  script_text: z.string().min(40).max(4000),
  call_purpose: z.string().min(3).max(200),
  target_phone_hint: z.string().regex(E164_REGEX).nullable(),
  extracted_facts: z.array(ExtractedFactSchema).max(10),
});

export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(LIMITS.MESSAGE_MAX_CHARS),
});

export const GeminiConversationRequestSchema = z.object({
  messages: z.array(ConversationMessageSchema).min(1).max(LIMITS.MESSAGES_MAX)
    .refine((m) => m[m.length - 1].role === "user", "last message must be role 'user'")
    .refine(
      (m) => m.reduce((n, x) => n + x.text.length, 0) <= LIMITS.CONVERSATION_MAX_TOTAL_CHARS,
      "conversation exceeds total character budget",
    ),
  session_id: z.string().uuid().nullish(),
});

export const TtsRequestSchema = z.object({
  text: z.string().min(1).max(LIMITS.TTS_TEXT_MAX_CHARS),
  voice: z.enum(["default"]).optional(),
});

export const MakeCallRequestSchema = z.object({
  script_id: z.string().uuid(),
  phone_number: z.string().regex(E164_REGEX),
});

// P6 — schedule-call is not built in this slice (R10); schema frozen for completeness.
export const ScheduleCallRequestSchema = z.object({
  script_id: z.string().uuid(),
  phone_number: z.string().regex(E164_REGEX),
  scheduled_for: z.string().datetime({ offset: true }),
});

export const CallWebhookMetadataSchema = z.object({
  call_log_id: z.string().uuid(),
  user_id: z.string().uuid(),
  is_demo: z.boolean(),
});

export const CallWebhookPayloadSchema = z.object({
  call_id: z.string().min(1),
  to: z.string().min(1),
  from: z.string().nullish(),
  completed: z.boolean(),
  status: z.string(),
  corrected_duration: z.union([z.number(), z.string()]).nullish(),
  call_length: z.number().nullish(),
  concatenated_transcript: z.string().nullish(),
  summary: z.string().nullish(),
  error_message: z.string().nullish(),
  answered_by: z.enum(["human", "voicemail", "unknown"]).nullish(),
  metadata: CallWebhookMetadataSchema.nullish(),
}).passthrough(); // Bland sends many extra fields; ignore them

export const AppointmentDetailsSchema = z.object({
  title: z.string().min(1).max(200),
  start_iso: z.string().datetime({ offset: true }),
  end_iso: z.string().datetime({ offset: true }).nullable(),
  location: z.string().max(300).nullable(),
  notes: z.string().max(1000).nullable(),
  confidence: z.number().min(0).max(1),
});
```

### 4.3 Gemini `functionDeclarations` (sent verbatim in the `tools` array)

`finalize_script` — used by `gemini-conversation`:

```ts
export const FINALIZE_SCRIPT_TOOL = {
  name: "finalize_script",
  description:
    "Call this ONLY when you have enough information to write the complete phone call script. " +
    "The script must open with: an AI-assistant disclosure on behalf of the user, and a " +
    "'this call may be recorded' notice.",
  parameters: {
    type: "OBJECT",
    properties: {
      script_text: { type: "STRING", description: "Complete call script including both mandatory disclosures." },
      call_purpose: { type: "STRING", description: "One-line purpose, e.g. 'Refill blood pressure prescription'." },
      target_phone_hint: {
        type: "STRING",
        nullable: true,
        description: "Phone number the user mentioned, normalized to E.164, or null.",
      },
      extracted_facts: {
        type: "ARRAY",
        description: "Durable facts learned about the user (max 10). Empty array if none.",
        items: {
          type: "OBJECT",
          properties: {
            key: { type: "STRING", description: "snake_case identifier, e.g. 'primary_pharmacy'." },
            value: { type: "STRING" },
            confidence: { type: "NUMBER", description: "0..1" },
          },
          required: ["key", "value", "confidence"],
        },
      },
    },
    required: ["script_text", "call_purpose", "target_phone_hint", "extracted_facts"],
  },
} as const;
```

`extract_appointment` — used by `call-webhook/extract.ts` (result validated by
`AppointmentDetailsSchema`; the model is instructed to call `no_appointment` — a second zero-arg
declaration — when none was confirmed, mapping to `appointment_details = null`).

---

## 5. Bland Webhook Payload Subset & Simulated Demo Payload

Both are the single `CallWebhookPayload` interface (§2.2) — **the simulated payload is not a
different shape; it is a constructor for the same shape.** Built by `buildDemoWebhookPayload()`
in `make-call/index.ts`:

```ts
// Frozen output of buildDemoWebhookPayload(args):
const payload: CallWebhookPayload = {
  call_id: args.demoCallId,                 // DEMO_CALL_ID_PREFIX + uuid — same value stored in call_logs.bland_call_id
  to: args.phoneNumber,                     // the number the user entered (never dialed)
  from: DEMO_CALLER_ID,                      // "+15555550100" — fixed fictional caller id (555 range, undialable)
  completed: true,
  status: "completed",
  corrected_duration: 95,
  call_length: 1.58,
  concatenated_transcript: buildDemoTranscript(args), // _shared/demo-transcript.ts
  summary: null,                            // webhook computes its own summary via Gemini
  error_message: null,
  answered_by: "human",
  metadata: { call_log_id: args.callLogId, user_id: args.userId, is_demo: true },
};
```

`buildDemoTranscript({ callPurpose, displayName, scriptId, now })` (in
`_shared/demo-transcript.ts`): deterministic template choice via
`hash(scriptId) % TEMPLATES.length` (2–3 canned realistic conversations: pharmacy refill,
appointment booking, reservation). Every template embeds a **confirmed appointment dated
`now + 3 days` at 14:15 local time** (dynamically formatted into the dialogue) so the downstream
Gemini extraction genuinely finds a future appointment and the generated `.ics` is always in the
future. Transcript line format matches Bland: `"agent: ...\nuser: ...\n"`.

The simulator delivers this payload to `call-webhook` signed with the same HMAC scheme as any
real sender (§3.6, §6 step 7) — identical headers, identical verification path. Extra fields
from real providers are ignored by `.passthrough()`.

**P6 note:** real Bland delivery (Bland cannot send our custom HMAC headers natively) will be
configured per the pre-decided fallback in `security.md` §4. Nothing about that lands in this
slice.

---

## 6. Demo-Mode Semantics for `make-call` (frozen)

**Server-side decision — the client has no say.** `MakeCallRequest` deliberately has no demo
flag. The decision function:

```ts
// Inside make-call. Order matters; first match wins.
function resolveCallMode(input: {
  callsEnabled: boolean;          // Deno.env.get("CALLS_ENABLED") === "true"
  isAnonymous: boolean;           // from verified JWT claims
  phoneVerifiedAt: string | null; // profiles.phone_verified_at
  verifiedPhone: string | null;   // profiles.phone_number
  requestedNumber: string;        // validated E.164 from request
}): CallMode {
  if (!input.callsEnabled) return "demo";                      // global kill switch; UNSET in this slice => always demo
  if (input.isAnonymous) return "demo";                        // public demo visitors
  if (!input.phoneVerifiedAt) return "demo";                   // no verified phone (always true until P6)
  if (input.requestedNumber !== input.verifiedPhone) return "demo"; // MVP real mode: own number only
  return "real";
}
```

**The `"real"` arm returns `501 not_implemented` in this slice (R12):** if `resolveCallMode`
ever returns `"real"`, make-call responds with the standard envelope
(`code: "not_implemented"`, e.g. "Real calls are not available yet.") before touching any
provider. There is no Bland client code in the tree and `BLAND_API_KEY` is never referenced
(CI grep gate). `CALLS_ENABLED` remains documented as the P6 activation flag, but since it is
unset here the 501 arm is defense-in-depth, not the primary guard.

**Simulated flow (mode = `"demo"`):**

1. Validate request; load script via **caller-JWT-scoped** client (RLS) → 404 if not owned.
2. Enforce rate limits (§8).
3. `resolveCallMode(...)` → `"real"` ⇒ `501 not_implemented`; `"demo"` ⇒ continue.
4. Generate `call_id = "demo_" + crypto.randomUUID()`.
5. INSERT `call_logs` row via the **service-role** client (R5; clients have zero write policies
   on `call_logs`): `{ user_id, script_id, bland_call_id: call_id, is_demo: true,
   phone_number_called, status: "initiated" }`.
6. Respond `202` with `MakeCallResponse { mode: "demo", estimated_completion_seconds:
   DEMO_SIMULATION_DELAY_SECONDS (default LIMITS.DEMO_DEFAULT_DELAY_SECONDS) }`.
7. **Simulated webhook trigger:** after responding, the function runs
   `EdgeRuntime.waitUntil(simulate())` (Supabase Edge background task; well within the 400 s
   wall-clock limit). `simulate()` sleeps `DEMO_SIMULATION_DELAY_SECONDS * 1000` ms, serializes
   `buildDemoWebhookPayload(...)` to raw body bytes, computes
   `signature = hex(HMAC-SHA256(BLAND_WEBHOOK_SECRET, "<timestamp>.<rawBody>"))` with
   `timestamp = now` in unix seconds, and `fetch`-POSTs to
   `${SUPABASE_URL}/functions/v1/call-webhook` with headers `WEBHOOK_SIGNATURE_HEADER` and
   `WEBHOOK_TIMESTAMP_HEADER` (R11). The webhook cannot distinguish it from a real sender
   except via `metadata.is_demo`.
8. No phone is dialed, no SMS sent, no call provider contacted. Cost: $0.
9. Client behavior (frozen): poll the `call_logs` row by id every `LIMITS.POLL_INTERVAL_MS`
   (Supabase Realtime optional later); if still non-terminal after `LIMITS.POLL_TIMEOUT_MS`,
   show a retryable error state ("the demo call didn't complete") — covers the rare case where
   the background task is torn down.

---

## 7. CORS Policy (frozen)

Implemented once in `supabase/functions/_shared/cors.ts`:

- **Browser functions** (`whisper-transcribe`, `gemini-conversation`, `elevenlabs-tts`,
  `make-call`):
  - Allowlist from env `ALLOWED_ORIGINS` (comma-separated exact origins), default
    `http://localhost:5173`. Production sets e.g.
    `https://calldone.vercel.app,https://<final-domain>`.
  - If the request `Origin` is in the allowlist, **reflect it** in
    `Access-Control-Allow-Origin` (never `*`) and add `Vary: Origin`. If not allowlisted: no
    CORS headers (browser blocks the read).
  - `OPTIONS` preflight → `204` with: `Access-Control-Allow-Methods: POST, OPTIONS`;
    `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`;
    `Access-Control-Max-Age: 86400`.
  - All non-OPTIONS responses (success and error) include
    `Access-Control-Expose-Headers: x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after`.
- **`call-webhook`:** server-to-server only. **Zero CORS headers.** `OPTIONS` →
  `405 method_not_allowed`.

---

## 8. Rate Limiting (frozen, R6)

**Storage:** one table `private.rate_limits (bucket, key, window_start, count)` in the
non-API-exposed `private` schema (DDL frozen in `db.md` / the initial migration, R1). Edge
functions never touch the table directly — access is ONLY through the SECURITY DEFINER RPC:

```
public.rate_limit_hit(p_bucket text, p_key text, p_window text, p_amount integer default 1) returns integer
```

- `window ∈ 'hour' | 'day' | 'month'`; the window start is computed server-side via
  `date_trunc(window, now())`.
- Atomic upsert-increment; returns the post-increment count. The caller compares against the
  limit constant and rejects when exceeded (increment-then-check; the recorded overshoot is
  harmless).
- `EXECUTE` granted to `service_role` only; `_shared/rate-limit.ts` invokes it via the
  service-role client.
- **Cleanup:** the pg_cron job defined in `db.md` deletes `private.rate_limits` rows older than
  2 days daily (R15). There is no opportunistic in-request deletion.

**Client IP:** taken from the **platform-trusted hop** — the Supabase-provided `x-real-ip`, or
equivalently the *last* gateway-appended `x-forwarded-for` entry. **Never the client-controlled
first XFF entry.** The per-user JWT-bound limits are the spoof-resistant backstop regardless.

**Buckets** (numbers are the canonical values frozen in `RATE_LIMITS` in `api-types.ts`; this is
the single permitted reference table):

| Bucket (`RATE_LIMITS.….bucket`) | Key | Window | Constant (`RATE_LIMITS.…`) | Value |
|---|---|---|---|---|
| `make_call:ip` | client IP | hour | `makeCallPerIp` | 5 |
| `make_call:uid_anon` | anonymous uid | day | `makeCallPerAnonUser` | 10 |
| `make_call:uid` | authed uid | day | `makeCallPerUser` | 20 |
| `whisper:uid` | uid | hour | `transcribePerUser` | 30 |
| `whisper:ip` | client IP | hour | `transcribePerIp` | 60 |
| `gemini:uid` | uid | hour | `conversationPerUser` | 60 |
| `gemini:ip` | client IP | hour | `conversationPerIp` | 120 |
| `tts:uid` | uid | hour | `ttsRequestsPerUser` | 20 |
| `tts:ip` | client IP | hour | `ttsRequestsPerIp` | 60 |
| `tts_chars:uid` | uid | day | `ttsCharsPerUser` | 1500 |
| `tts_chars:global` | `"global"` | month | `ttsCharsGlobal` | 9000 |
| Anonymous sign-ins | client IP | hour | _(Supabase Auth dashboard setting, not the RPC and not a constant in `api-types.ts`)_ | 10 |

For the `tts_chars:*` buckets, `amount` = the request's text length; the others use the default
`amount = 1`. All applicable buckets for a request are checked; the strictest verdict wins.
`call-webhook` is not rate-limited (signature-gated).

On exceed: `429` with `ApiErrorBody{ code: "rate_limited", retryable: true }` plus headers
`retry-after` (seconds), `x-ratelimit-limit`, `x-ratelimit-remaining` (`0`), `x-ratelimit-reset`
(epoch seconds) — names frozen as `RATE_LIMIT_HEADERS`. Exception: exhaustion of
`tts_chars:global` surfaces as `503 quota_exceeded` (§3.3, R7). Successful responses on
rate-limited functions SHOULD also carry the three `x-ratelimit-*` headers.

---

## 9. Environment Variables (contract surface)

**Client-side (only these two, ever; CI grep-enforces the VITE_ allowlist, R22):**
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

**Edge-function secrets set in this slice** (Supabase dashboard; never in git; documented in
`.env.example`):

| Name | Used by | Notes |
|---|---|---|
| `GROQ_API_KEY` | whisper-transcribe | |
| `GEMINI_API_KEY` | gemini-conversation, call-webhook | |
| `ELEVENLABS_API_KEY` | elevenlabs-tts | |
| `BLAND_WEBHOOK_SECRET` | make-call, call-webhook | HMAC key for §3.6 signed requests |
| `RESEND_API_KEY` | call-webhook | email notifications |
| `ALLOWED_ORIGINS` | all browser functions | comma-separated exact origins (§7) |
| `DEMO_SIMULATION_DELAY_SECONDS` | make-call | optional; default `LIMITS.DEMO_DEFAULT_DELAY_SECONDS` |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` are auto-injected by the
platform.

**Deferred to P6 — NOT set in this slice:**

- `BLAND_API_KEY` — never referenced anywhere in the tree; CI greps to enforce absence
  (R12/R22).
- `CALLS_ENABLED` — documented as the P6 real-call activation flag; unset here (§6).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — SMS is unreachable in this
  slice (R19); `call-webhook/notify.ts` MUST no-op the SMS path gracefully when these are unset
  (log-and-continue, never throw).

---

## Appendix: contract-bearing files

| File | Owner | Role |
|---|---|---|
| `supabase/functions/_shared/api-types.ts` | orchestrator (frozen) | canonical constants + types (§2.2 mirrors it) |
| `supabase/functions/_shared/ics.ts` | orchestrator stubs signature; ws/edge implements | §2.3 |
| `supabase/functions/_shared/schemas.ts` | ws/edge | §4.2 verbatim |
| `src/types/api.ts` | orchestrator (frozen) | re-export shim (§2) |
| `src/lib/ics.ts` | orchestrator (frozen) | re-export shim for `_shared/ics.ts` (R18) |
| `supabase/config.toml` | orchestrator (frozen) | anonymous sign-ins + `verify_jwt = false` for call-webhook (§0) |
| `supabase/migrations/00000000000000_initial_schema.sql` | orchestrator at baseline; ws/db thereafter (R1) | 9 product tables + `private.rate_limits` + `rate_limit_hit()` + pg_cron jobs — see `db.md` |
