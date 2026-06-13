// src/lib/schemas.ts — client-side zod mirror of the edge request shapes, used
// by forms + hooks for pre-flight validation BEFORE hitting the network. The
// server (supabase/functions/_shared/schemas.ts) remains authoritative; this is a
// UX nicety. All numbers/regex come from the frozen api-types constants so no
// caps are duplicated here (R3/R17).
import { z } from "zod"
import { E164_REGEX, LIMITS } from "@/types/api"

/** E.164 phone number (PhoneNumberField pre-flight + use-make-call). */
export const phoneNumberSchema = z
  .string()
  .regex(E164_REGEX, "Enter a valid phone number in international format, e.g. +14155550123.")

/** Mirror of MakeCallRequest (api.md §3.4 / MakeCallRequestSchema §4.2). */
export const makeCallRequestSchema = z.object({
  script_id: z.string().uuid(),
  phone_number: phoneNumberSchema,
})
export type MakeCallRequestInput = z.infer<typeof makeCallRequestSchema>

/** Mirror of TtsRequest (api.md §3.3 / TtsRequestSchema §4.2). */
export const ttsRequestSchema = z.object({
  text: z.string().min(1).max(LIMITS.TTS_TEXT_MAX_CHARS),
  voice: z.enum(["default"]).optional(),
})
export type TtsRequestInput = z.infer<typeof ttsRequestSchema>

/** Mirror of ConversationMessage (api.md §2.2 / ConversationMessageSchema §4.2). */
export const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(LIMITS.MESSAGE_MAX_CHARS),
})
export type ConversationMessageInput = z.infer<typeof conversationMessageSchema>

/** Mirror of GeminiConversationRequest (api.md §3.2 / GeminiConversationRequestSchema §4.2). */
export const geminiConversationRequestSchema = z.object({
  messages: z
    .array(conversationMessageSchema)
    .min(1)
    .max(LIMITS.MESSAGES_MAX)
    .refine((m) => m[m.length - 1]?.role === "user", "last message must be role 'user'")
    .refine(
      (m) => m.reduce((n, x) => n + x.text.length, 0) <= LIMITS.CONVERSATION_MAX_TOTAL_CHARS,
      "conversation exceeds total character budget"
    ),
  session_id: z.string().uuid().nullish(),
})
export type GeminiConversationRequestInput = z.infer<typeof geminiConversationRequestSchema>
