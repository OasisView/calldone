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
  makeCallPerIp: { limit: 5, window: "hour" }, //              spec §Demo Safety
  makeCallPerAnonUser: { limit: 10, window: "day" },
  makeCallPerUser: { limit: 20, window: "day" }, //            spec's daily cap
  transcribePerUser: { limit: 30, window: "hour" },
  transcribePerIp: { limit: 60, window: "hour" },
  conversationPerUser: { limit: 60, window: "hour" },
  conversationPerIp: { limit: 120, window: "hour" },
  ttsRequestsPerUser: { limit: 20, window: "hour" },
  ttsRequestsPerIp: { limit: 60, window: "hour" },
  ttsCharsPerUser: { limit: 1_500, window: "day" },
  ttsCharsGlobal: { limit: 9_000, window: "month" }, //        ElevenLabs free-tier guard
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
