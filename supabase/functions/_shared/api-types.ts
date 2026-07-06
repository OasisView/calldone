// ============================================================================
// FROZEN API CONTRACT — Calldone by Oasis (Checkpoint 3: inbound reception &
// intake for nonprofits, R23–R28). Single source of truth, imported by Deno
// edge functions AND the Vite app (via the src/types/api.ts re-export shim).
// MUST stay dependency-free and side-effect-free: types, const arrays/maps/
// objects, and regex literals only. No Deno globals, no imports, no runtime
// logic beyond constant expressions.
//
// Owned by the orchestrator. Do not edit without a decision-register update
// (docs/contracts/decision-register.md — Checkpoint 3 section).
//
// Layout: INBOUND CANON first; a fenced TRANSITIONAL COMPAT section at the
// bottom keeps the retired consumer-slice symbols compiling until the worker
// repurpose lands (then that whole section is deleted).
// ============================================================================

// ---------------------------------------------------------------- errors ---

export const API_ERROR_CODES = [
  "invalid_request", //         400 — malformed body, failed validation
  "unauthorized", //            401 — bad/missing credentials or webhook auth
  "forbidden", //               403 — authenticated but operation not allowed
  "not_found", //               404 — resource missing OR not owned (no existence leak)
  "method_not_allowed", //      405 — anything but POST (or OPTIONS preflight)
  "payload_too_large", //       413 — body exceeds limit
  "unsupported_media_type", //  415 — wrong Content-Type
  "rate_limited", //            429 — see RATE_LIMITS
  "internal_error", //          500 — generic; details never leak internals
  "not_implemented", //         501 — reserved (R12 pattern: unbuilt arms answer 501)
  "upstream_error", //          502 — provider failed after retries
  "quota_exceeded", //          503 — upstream quota/cap exhausted
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

export const RATE_LIMIT_HEADERS = {
  limit: "x-ratelimit-limit",
  remaining: "x-ratelimit-remaining",
  reset: "x-ratelimit-reset", // unix epoch seconds when the window resets
  retryAfter: "retry-after", //  seconds, only on 429
} as const;

// ------------------------------------------------- providers & CallEvent ---

/** Managed inbound voice providers (R25). 'twilio' reserved for the
 *  post-launch cost-optimization checkpoint. */
export const CALL_PROVIDERS = ["vapi", "retell", "twilio"] as const;
export type CallProvider = (typeof CALL_PROVIDERS)[number];

/** Normalized internal event vocabulary (R25). Thin per-provider adapters map
 *  raw webhook payloads into CallEvent; NO provider-specific type ever leaks
 *  past the adapter boundary (supabase/functions/_shared/adapters/). */
export const CALL_EVENT_TYPES = [
  "call.started", //      provider answered an inbound call for one of our numbers
  "call.ended", //        terminal; carries duration/transcript/end reason in data
  "transcript.updated", // partial or final transcript segments
  "transfer.initiated", // escalation to a human began (R26)
  "voicemail.left", //    caller left a voicemail (R26 fallback)
  "tool.invoked", //      provider-side record of an agent tool call
] as const;
export type CallEventType = (typeof CALL_EVENT_TYPES)[number];

export interface CallEvent {
  provider: CallProvider;
  provider_call_id: string; //         provider's id for the call (≤200 chars)
  provider_event_id: string | null; // idempotency key when the provider sends one
  type: CallEventType;
  org_phone_e164: string; //           the org number that was called (routing key)
  caller_e164: string | null; //       null when caller id is withheld
  occurred_at: string; //              ISO 8601
  data: Record<string, unknown>; //    type-specific payload (normalized by adapter)
}

// ----------------------------------------------------- enums (DB mirror) ---
// These const arrays are the SAME values as the DB CHECK constraints in
// supabase/migrations/20260706000000_inbound_initial_schema.sql. If they ever
// diverge, the migration wins — report, don't patch locally.

export const ORG_ROLES = ["admin", "staff"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** R26 — how the AI answers the org's line. */
export const ANSWERING_MODES = ["always", "after_hours", "overflow"] as const;
export type AnsweringMode = (typeof ANSWERING_MODES)[number];

export const INBOUND_CALL_STATUSES = [
  "in_progress",
  "completed",
  "transferred",
  "voicemail",
  "failed",
] as const;
export type InboundCallStatus = (typeof INBOUND_CALL_STATUSES)[number];

export const ESCALATION_OUTCOMES = ["none", "transferred", "voicemail"] as const;
export type EscalationOutcome = (typeof ESCALATION_OUTCOMES)[number];

/** R27 — v1 languages. 'es' appears only as the graceful-handoff path. */
export const CALL_LANGUAGES = ["en", "es"] as const;
export type CallLanguage = (typeof CALL_LANGUAGES)[number];

export const INTAKE_STATUSES = ["new", "in_review", "done"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const CALLBACK_STATUSES = [
  "pending",
  "approved",
  "calling",
  "done",
  "canceled",
] as const;
export type CallbackStatus = (typeof CALLBACK_STATUSES)[number];

export const PHONE_NUMBER_STATUSES = ["provisioning", "active", "released"] as const;
export type PhoneNumberStatus = (typeof PHONE_NUMBER_STATUSES)[number];

export const KNOWLEDGE_PACK_STATUSES = ["draft", "published"] as const;
export type KnowledgePackStatus = (typeof KNOWLEDGE_PACK_STATUSES)[number];

// ------------------------------------------------- disclosure & language ---
// R23/R28: the warm disclosure is NEVER removed. It is baked into the system
// prompt AND enforced in code post-generation (unit-tested): the first agent
// utterance of every call must contain every DISCLOSURE_REQUIRED_SUBSTRINGS
// member, and inbound_calls.disclosure_played records that it happened.

/** `{org_name}` is replaced server-side; wording changes require a register update. */
export const DISCLOSURE_GREETING_TEMPLATE_EN =
  "Hi, thanks for calling {org_name}! I'm their virtual assistant — quick " +
  "heads-up: I'm an AI, and this call may be recorded so I can take accurate " +
  "notes for the team. How can I help you today?";

/** Case-insensitive containment check for the enforcement test. */
export const DISCLOSURE_REQUIRED_SUBSTRINGS = ["AI", "recorded"] as const;

/** R27 — the one Spanish line: spoken when the agent detects a Spanish-first
 *  caller, immediately before routing into the R26 escalation path. */
export const SPANISH_HANDOFF_LINE_ES =
  "Un momento, por favor — le comunico con una persona del equipo.";

/** R26 — escalation triggers: the word "person" (en), or this DTMF digit. */
export const ESCALATION_DTMF = "0";

// ------------------------------------------------------------ agent tools ---
// The brain executes these tools itself (Vapi custom-LLM mode): tool calls are
// resolved inside agent-brain per turn; the provider only sees control actions
// (transfer, end). Arg shapes are validated with zod in _shared/schemas.ts.

export const AGENT_TOOLS = [
  "capture_intake",
  "book_appointment",
  "request_transfer",
  "take_voicemail",
  "end_call",
] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

export interface CaptureIntakeArgs {
  caller_name?: string | null; //   ≤ LIMITS.INTAKE_TEXT_MAX_CHARS
  need: string; //                  1..LIMITS.INTAKE_NEED_MAX_CHARS
  callback_number?: string | null; // E.164
  callback_consent: boolean; //     explicit yes captured on the call (R23)
  preferred_time?: string | null; // ≤ LIMITS.INTAKE_TEXT_MAX_CHARS
}

export interface BookAppointmentArgs {
  title: string; //          1..200 chars
  start_iso: string; //      ISO 8601 WITH offset
  end_iso: string | null; // null => assume 30 min when building the .ics
  location: string | null;
}

export interface RequestTransferArgs {
  reason?: string | null; // ≤ 200 chars; logged, never spoken back
}

// ----------------------------------------------------------- auth headers ---

/** agent-brain auth (server-to-server): Vapi custom-LLM requests carry this
 *  header, compared constant-time against env BRAIN_SECRET. */
export const BRAIN_SECRET_HEADER = "x-calldone-brain-secret";

/** provider-webhook auth: each adapter verifies the provider's documented
 *  mechanism (Vapi: configured server-secret header) against env
 *  PROVIDER_WEBHOOK_SECRET. Unsigned/mis-signed requests => 401, no body echo. */
export const PROVIDER_WEBHOOK_SECRET_ENV = "PROVIDER_WEBHOOK_SECRET";

/** Function-secret env names (set via Supabase dashboard/CLI, never in git). */
export const ENV_KEYS = [
  "GEMINI_API_KEY",
  "RESEND_API_KEY",
  "PROVIDER_WEBHOOK_SECRET",
  "BRAIN_SECRET",
  "CALLS_ENABLED", //   R28 global kill switch: "true" | "false"
  "ALLOWED_ORIGINS",
] as const;

// ---------------------------------------------------------------- limits ---

/** Canonical numeric caps. Server zod enforces; client mirrors for UX.
 *  Members below the `transitional` comment die with the worker repurpose. */
export const LIMITS = {
  CALL_MAX_MINUTES: 15, //             agent politely wraps up at this ceiling
  TRANSCRIPT_MAX_TURNS: 200,
  TRANSCRIPT_STORED_MAX_CHARS: 100_000,
  KB_PACK_MAX_CHARS: 24_000, //        total published pack budget (prompt safety)
  KB_ENTRIES_MAX: 100,
  KB_ENTRY_QUESTION_MAX_CHARS: 500, // mirrors DB CHECK
  KB_ENTRY_ANSWER_MAX_CHARS: 2_000, // mirrors DB CHECK
  INTAKE_NEED_MAX_CHARS: 2_000, //     mirrors DB CHECK
  INTAKE_TEXT_MAX_CHARS: 200, //       caller_name / preferred_time
  SUMMARY_MAX_CHARS: 4_000, //         mirrors DB CHECK
  ORG_NAME_MAX_CHARS: 200, //          mirrors DB CHECK
  WEBHOOK_BODY_MAX_BYTES: 1_048_576, // 1 MB
  BRAIN_BODY_MAX_BYTES: 262_144, //    256 KB per turn
  ORG_MONTHLY_MINUTES_CAP_DEFAULT: 300, // mirrors DB default (R28)
  RETENTION_DAYS_DEFAULT: 90, //       mirrors DB default (R23)
  // ---- transitional (consumer slice; removed at worker repurpose) ----
  AUDIO_MAX_BYTES: 5_242_880,
  AUDIO_MAX_SECONDS: 60,
  TTS_TEXT_MAX_CHARS: 800,
  CONVERSATION_MAX_TOTAL_CHARS: 30_000,
  MESSAGE_MAX_CHARS: 4_000,
  MESSAGES_MAX: 40,
  POLL_INTERVAL_MS: 5_000,
  POLL_TIMEOUT_MS: 120_000,
} as const;

/** Fixed-window rate limits (R6 pattern, R28), enforced via
 *  public.rate_limit_hit(). `bucket` is the exact first argument to the RPC —
 *  frozen here so edge code and docs cannot drift. */
export const RATE_LIMITS = {
  webhookEventsPerCall: { bucket: "webhook:call", limit: 240, window: "hour" },
  brainTurnsPerCall: { bucket: "brain:call", limit: 80, window: "hour" },
  callsPerOrg: { bucket: "calls:org", limit: 30, window: "day" },
  kbPublishPerOrg: { bucket: "kb_publish:org", limit: 20, window: "day" },
  summaryEmailsPerOrg: { bucket: "email:org", limit: 200, window: "day" },
} as const;
export type RateLimitWindow = "hour" | "day" | "month";

// ------------------------------------------------------------ appointment ---

/** Stored in intake_records.appointment (JSONB). null when no appointment.
 *  The staff dashboard builds the .ics download client-side from this shape
 *  via the shared _shared/ics.ts (R18 pattern). */
export interface AppointmentDetails {
  title: string;
  start_iso: string; //      ISO 8601 WITH offset
  end_iso: string | null; // null => assume 30 min when building the .ics
  location: string | null;
  notes: string | null;
  confidence: number; //     0..1; UI flags < 0.6 as "unconfirmed"
}

// ============================================================================
// ======================= TRANSITIONAL COMPAT SECTION ========================
// Retired consumer-slice symbols kept ONLY so the not-yet-repurposed baseline
// src/ keeps compiling (hooks/lib stubs import these). DELETE this entire
// section in the worker-repurpose stage — nothing in the inbound product may
// import from it. (decision-register.md Checkpoint 3.)
// ============================================================================

export const WEBHOOK_SIGNATURE_HEADER = "x-calldone-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-calldone-timestamp";
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export const TRANSCRIBE_ALLOWED_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

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

export type CallMode = "demo" | "real";
export const DEMO_CALLER_ID = "+15555550100";
export const DEMO_CALL_ID_PREFIX = "demo_";

export const TRANSCRIBE_AUDIO_FIELD = "audio";
export const TRANSCRIBE_LANGUAGE_FIELD = "language";

export interface TranscribeResponse {
  text: string;
  duration_seconds: number | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  text: string;
}

export interface GeminiConversationRequest {
  messages: ConversationMessage[];
  session_id?: string | null;
}

export interface ExtractedFact {
  key: string;
  value: string;
  confidence: number;
}

export interface FinalizedScript {
  script_text: string;
  call_purpose: string;
  target_phone_hint: string | null;
  extracted_facts: ExtractedFact[];
}

export interface GeminiReplyResponse {
  type: "reply";
  message: string;
  session_id: string | null;
}

export interface GeminiScriptFinalizedResponse {
  type: "script_finalized";
  script: FinalizedScript;
  closing_message: string;
  session_id: string | null;
}

export type GeminiConversationResponse =
  | GeminiReplyResponse
  | GeminiScriptFinalizedResponse;

export const TTS_VOICES = ["default"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export interface TtsRequest {
  text: string;
  voice?: TtsVoice;
}

export interface MakeCallRequest {
  script_id: string;
  phone_number: string;
}

export interface MakeCallResponse {
  call_log_id: string;
  call_id: string;
  mode: CallMode;
  status: "initiated";
  estimated_completion_seconds: number | null;
}

export interface ScheduleCallRequest {
  script_id: string;
  phone_number: string;
  scheduled_for: string;
}

export interface ScheduleCallResponse {
  scheduled_call_id: string;
  status: "pending";
  scheduled_for: string;
}

export interface CallWebhookMetadata {
  call_log_id: string;
  user_id: string;
  is_demo: boolean;
}

export interface CallWebhookPayload {
  call_id: string;
  to: string;
  from?: string | null;
  completed: boolean;
  status: string;
  corrected_duration?: number | string | null;
  call_length?: number | null;
  concatenated_transcript?: string | null;
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

export const BLAND_STATUS_MAP: Record<string, CallStatus> = {
  completed: "completed",
  complete: "completed",
  "no-answer": "no_answer",
  no_answer: "no_answer",
  busy: "busy",
  failed: "failed",
  error: "failed",
};
// ========================= END TRANSITIONAL COMPAT ==========================
