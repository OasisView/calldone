// supabase/functions/_shared/schemas.ts
// zod validators for both edge functions (api.md §3/§4; security.md §2). All
// caps come from api-types LIMITS/E164_REGEX so numbers cannot drift. Failures
// are mapped to the envelope by the callers — never echo raw payloads.
import { z } from "zod";
import {
  CALL_EVENT_TYPES,
  CALL_PROVIDERS,
  E164_REGEX,
  LIMITS,
} from "./api-types.ts";

export const e164Schema = z.string().regex(E164_REGEX, "must be E.164");

/** Normalized CallEvent (api-types.ts) — what adapters must produce. */
export const callEventSchema = z.object({
  provider: z.enum(CALL_PROVIDERS),
  provider_call_id: z.string().min(1).max(200),
  provider_event_id: z.string().min(1).max(200).nullable(),
  type: z.enum(CALL_EVENT_TYPES),
  org_phone_e164: e164Schema,
  caller_e164: e164Schema.nullable(),
  occurred_at: z.string().datetime({ offset: true }).or(z.string().datetime()),
  data: z.record(z.unknown()),
});
export type CallEventParsed = z.infer<typeof callEventSchema>;

// ------------------------------------------------------------ agent tools ---

export const captureIntakeSchema = z.object({
  caller_name: z.string().max(LIMITS.INTAKE_TEXT_MAX_CHARS).nullish(),
  need: z.string().min(1).max(LIMITS.INTAKE_NEED_MAX_CHARS),
  callback_number: e164Schema.nullish(),
  callback_consent: z.boolean(),
  preferred_time: z.string().max(LIMITS.INTAKE_TEXT_MAX_CHARS).nullish(),
});

export const bookAppointmentSchema = z.object({
  title: z.string().min(1).max(200),
  start_iso: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO datetime"),
  end_iso: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO datetime")
    .nullable(),
  location: z.string().max(500).nullable(),
});

export const requestTransferSchema = z.object({
  reason: z.string().max(200).nullish(),
});

// ----------------------------------------------- agent-brain request body ---

/** OpenAI-compatible chat message (the subset we consume). Content may be null
 *  for assistant tool-call messages. */
export const openAiMessageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().nullish(),
  })
  .passthrough();

/** Vapi custom-LLM chat.completions body: OpenAI shape + a `call` metadata
 *  block. Unknown keys tolerated (.passthrough()), never trusted. */
export const brainRequestSchema = z
  .object({
    model: z.string().optional(),
    stream: z.boolean().optional(),
    messages: z.array(openAiMessageSchema).min(1).max(LIMITS.TRANSCRIPT_MAX_TURNS),
    call: z
      .object({
        id: z.string().min(1).max(200).optional(),
        phoneNumberId: z.string().optional(),
        // Vapi nests the dialed number differently across event versions; the
        // adapter normalizes. We accept loosely here.
      })
      .passthrough()
      .optional(),
    phoneNumber: z.object({ number: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
export type BrainRequest = z.infer<typeof brainRequestSchema>;
