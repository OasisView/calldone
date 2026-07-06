// supabase/functions/_shared/adapters/vapi.ts
// The ONLY module that knows Vapi's wire shapes (R25 adapter boundary). It
// verifies webhook authenticity, normalizes raw payloads into CallEvent, pulls
// call metadata out of custom-LLM (agent-brain) requests, and builds the
// provider-side control actions (transfer / end call). Nothing outside
// _shared/adapters/ may import Vapi-specific types — swapping providers must
// touch adapters only.
//
// Vapi shapes are validated LOOSELY (tolerate unknown keys, require only what
// we consume) because the provider evolves; the E2E pilot trues up any drift.
import type { CallEvent } from "../api-types.ts";
import { secureEquals } from "../secure-compare.ts";

export const VAPI_SECRET_HEADER = "x-vapi-secret";

/** Webhook auth: Vapi sends the configured server secret on every request.
 *  Compared constant-time against PROVIDER_WEBHOOK_SECRET (security.md §4). */
export function verifyWebhook(req: Request, secret: string): boolean {
  return secureEquals(req.headers.get(VAPI_SECRET_HEADER), secret);
}

/** agent-brain auth: Vapi custom-LLM requests carry our configured custom
 *  header (api-types BRAIN_SECRET_HEADER); checked by the function itself. */

// ------------------------------------------------------------ raw shapes ---

interface VapiMessageEnvelope {
  message?: {
    type?: string;
    status?: string;
    endedReason?: string;
    timestamp?: number | string;
    call?: {
      id?: string;
      customer?: { number?: string };
      phoneNumber?: { number?: string };
    };
    phoneNumber?: { number?: string };
    customer?: { number?: string };
    artifact?: {
      transcript?: string;
      messages?: Array<{ role?: string; message?: string; content?: string }>;
    };
    transcript?: string;
    transcriptType?: string;
    role?: string;
    durationSeconds?: number;
    summary?: string;
    toolCallList?: Array<{ name?: string; arguments?: unknown }>;
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function tsToIso(ts: number | string | undefined): string {
  if (typeof ts === "number") return new Date(ts).toISOString();
  if (typeof ts === "string" && !Number.isNaN(Date.parse(ts))) {
    return new Date(ts).toISOString();
  }
  return isoNow();
}

/** Pulls the org's dialed number (our phone_numbers.e164 routing key) from the
 *  places Vapi puts it, in preference order. */
function dialedNumber(m: NonNullable<VapiMessageEnvelope["message"]>): string | null {
  return (
    str(m.phoneNumber?.number) ??
    str(m.call?.phoneNumber?.number) ??
    null
  );
}

function callerNumber(m: NonNullable<VapiMessageEnvelope["message"]>): string | null {
  return str(m.customer?.number) ?? str(m.call?.customer?.number) ?? null;
}

export interface NormalizedWebhook {
  /** Zero or more normalized events (unknown message types produce zero). */
  events: CallEvent[];
  /** Set when Vapi expects an immediate transfer destination in the response
   *  (message.type === "transfer-destination-request"). */
  wantsTransferDestination: boolean;
  /** Raw message.type, for logging/event storage. */
  rawType: string | null;
}

/** Maps one Vapi server-message envelope to normalized CallEvents. */
export function normalizeWebhook(payload: unknown): NormalizedWebhook {
  const m = (payload as VapiMessageEnvelope)?.message;
  const none = (rawType: string | null): NormalizedWebhook => ({
    events: [],
    wantsTransferDestination: rawType === "transfer-destination-request",
    rawType,
  });
  if (!m || typeof m !== "object") return none(null);

  const type = str(m.type);
  const callId = str(m.call?.id);
  const org = dialedNumber(m);
  if (!type || !callId || !org) return none(type);

  const base = {
    provider: "vapi" as const,
    provider_call_id: callId,
    org_phone_e164: org,
    caller_e164: callerNumber(m),
    occurred_at: tsToIso(m.timestamp),
  };
  // Vapi doesn't ship a per-event id on most messages; synthesize a stable one
  // per (call, type, status/timestamp) for idempotency where retries resend the
  // same logical event.
  const eventId = (suffix: string) => `${callId}:${suffix}`;

  switch (type) {
    case "status-update": {
      const status = str(m.status);
      if (status === "in-progress") {
        return {
          events: [{
            ...base,
            provider_event_id: eventId("started"),
            type: "call.started",
            data: { status },
          }],
          wantsTransferDestination: false,
          rawType: type,
        };
      }
      if (status === "ended") {
        return {
          events: [{
            ...base,
            provider_event_id: eventId("status-ended"),
            type: "call.ended",
            data: { status, endedReason: str(m.endedReason) },
          }],
          wantsTransferDestination: false,
          rawType: type,
        };
      }
      return none(type);
    }
    case "transcript": {
      // Only final fragments; partials are noise.
      if (str(m.transcriptType) !== "final") return none(type);
      return {
        events: [{
          ...base,
          provider_event_id: null, // every final fragment is a distinct append
          type: "transcript.updated",
          data: { role: str(m.role) ?? "unknown", text: str(m.transcript) ?? "" },
        }],
        wantsTransferDestination: false,
        rawType: type,
      };
    }
    case "end-of-call-report": {
      const endedReason = str(m.endedReason);
      const voicemail = endedReason?.toLowerCase().includes("voicemail") ?? false;
      const transcriptTurns = (m.artifact?.messages ?? [])
        .map((t) => ({
          role: str(t.role) ?? "unknown",
          text: str(t.message) ?? str(t.content) ?? "",
        }))
        .filter((t) => t.text !== "");
      return {
        events: [{
          ...base,
          provider_event_id: eventId("report"),
          type: "call.ended",
          data: {
            endedReason,
            voicemail,
            durationSeconds: typeof m.durationSeconds === "number" ? m.durationSeconds : null,
            transcript: transcriptTurns,
            providerSummary: str(m.summary),
          },
        }],
        wantsTransferDestination: false,
        rawType: type,
      };
    }
    case "transfer-destination-request": {
      return {
        events: [{
          ...base,
          provider_event_id: eventId("transfer-request"),
          type: "transfer.initiated",
          data: {},
        }],
        wantsTransferDestination: true,
        rawType: type,
      };
    }
    case "tool-calls": {
      return {
        events: [{
          ...base,
          provider_event_id: null,
          type: "tool.invoked",
          data: { tools: m.toolCallList ?? [] },
        }],
        wantsTransferDestination: false,
        rawType: type,
      };
    }
    default:
      return none(type);
  }
}

/** Response body for transfer-destination-request: send the org's staff line. */
export function transferDestinationResponse(escalationPhone: string): Record<string, unknown> {
  return {
    destination: { type: "number", number: escalationPhone },
  };
}

// -------------------------------------------------- agent-brain (custom LLM) ---

export interface BrainContext {
  provider_call_id: string | null;
  org_phone_e164: string | null;
}

/** Pulls call routing metadata out of a Vapi custom-LLM chat body. */
export function extractBrainContext(body: Record<string, unknown>): BrainContext {
  const call = body["call"] as VapiMessageEnvelope["message"] extends infer _ ? {
    id?: string;
    phoneNumber?: { number?: string };
  } | undefined : never;
  const phoneNumber = body["phoneNumber"] as { number?: string } | undefined;
  return {
    provider_call_id: str(call?.id),
    org_phone_e164: str(phoneNumber?.number) ?? str(call?.phoneNumber?.number),
  };
}

// -------------------------------- OpenAI-compatible responses + control acts ---

/** Vapi executes its built-in tools when the custom LLM emits matching OpenAI
 *  tool_calls: transferCall (uses the assistant's configured destination or the
 *  one we return on transfer-destination-request) and endCall. */
export function transferToolCall(): Record<string, unknown> {
  return {
    id: `call_${crypto.randomUUID().slice(0, 8)}`,
    type: "function",
    function: { name: "transferCall", arguments: "{}" },
  };
}

export function endCallToolCall(): Record<string, unknown> {
  return {
    id: `call_${crypto.randomUUID().slice(0, 8)}`,
    type: "function",
    function: { name: "endCall", arguments: "{}" },
  };
}

export interface CompletionOpts {
  content: string | null;
  toolCalls?: Record<string, unknown>[];
  model?: string;
}

function completionMessage(opts: CompletionOpts): Record<string, unknown> {
  return {
    role: "assistant",
    content: opts.content,
    ...(opts.toolCalls && opts.toolCalls.length > 0 ? { tool_calls: opts.toolCalls } : {}),
  };
}

/** Non-streaming chat.completions response. */
export function completionJson(opts: CompletionOpts): Response {
  const body = {
    id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: opts.model ?? "calldone-brain",
    choices: [{
      index: 0,
      message: completionMessage(opts),
      finish_reason: opts.toolCalls && opts.toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Streaming (SSE) chat.completions response — one delta chunk + [DONE].
 *  Vapi consumes standard OpenAI SSE; a single-chunk stream is valid. */
export function completionSse(opts: CompletionOpts): Response {
  const id = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
  const created = Math.floor(Date.now() / 1000);
  const model = opts.model ?? "calldone-brain";
  const delta: Record<string, unknown> = { role: "assistant" };
  if (opts.content !== null) delta.content = opts.content;
  if (opts.toolCalls && opts.toolCalls.length > 0) {
    delta.tool_calls = opts.toolCalls.map((tc, index) => ({ index, ...tc }));
  }
  const chunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta,
      finish_reason: null,
    }],
  };
  const finish = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: opts.toolCalls && opts.toolCalls.length > 0 ? "tool_calls" : "stop",
    }],
  };
  const payload = `data: ${JSON.stringify(chunk)}\n\n` +
    `data: ${JSON.stringify(finish)}\n\n` +
    "data: [DONE]\n\n";
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
