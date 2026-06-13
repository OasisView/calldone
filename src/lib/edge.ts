// src/lib/edge.ts — the SOLE client for the Calldone edge functions (frontend.md
// §3.2/§6.6). Hooks call these; components never do. JSON calls go through
// getSupabase().functions.invoke; the binary TTS response is fetched raw with the
// session token. Every non-2xx ApiErrorBody envelope (api.md §1) is mapped to
// EdgeError verbatim. synthesizeSpeech returns null on 502/503 so the caller can
// fall back to browser SpeechSynthesis without a throw (R7).
import { FunctionsHttpError } from "@supabase/supabase-js"
import { getSupabase } from "@/lib/supabase"
import {
  RETRYABLE_CODES,
  TRANSCRIBE_AUDIO_FIELD,
  TRANSCRIBE_LANGUAGE_FIELD,
  type ApiErrorBody,
  type ApiErrorCode,
  type GeminiConversationRequest,
  type GeminiConversationResponse,
  type MakeCallRequest,
  type MakeCallResponse,
  type TranscribeResponse,
  type TtsRequest,
} from "@/types/api"

export class EdgeError extends Error {
  code: ApiErrorCode
  status: number
  retryable: boolean

  constructor(code: ApiErrorCode, status: number, message: string, retryable: boolean) {
    super(message)
    this.name = "EdgeError"
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

/** Type guard for our error envelope (api.md §1). */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false
  const err = (value as { error?: unknown }).error
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { message?: unknown }).message === "string"
  )
}

/** Build an EdgeError from a Response carrying an ApiErrorBody envelope. */
async function edgeErrorFromResponse(res: Response): Promise<EdgeError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON (e.g. the platform 401 short-circuit before our code runs, or an
    // opaque gateway error). Fall through to a status-derived EdgeError below.
  }
  if (isApiErrorBody(body)) {
    const { code, message, retryable } = body.error
    return new EdgeError(code, res.status, message, retryable)
  }
  return edgeErrorFromStatus(res.status)
}

/** Fallback when no parseable envelope is present (e.g. platform 401, network). */
function edgeErrorFromStatus(status: number): EdgeError {
  const code: ApiErrorCode =
    status === 401
      ? "unauthorized"
      : status === 429
        ? "rate_limited"
        : status >= 500
          ? "internal_error"
          : "invalid_request"
  return new EdgeError(code, status, `Request failed with status ${status}.`, RETRYABLE_CODES.includes(code))
}

/**
 * Normalize any supabase-js functions error into an EdgeError. FunctionsHttpError
 * carries the raw Response in `.context`; relay/fetch errors mean we never reached
 * our code, so they map to a retryable internal_error.
 */
async function toEdgeError(error: unknown): Promise<EdgeError> {
  if (error instanceof FunctionsHttpError) {
    return edgeErrorFromResponse(error.context as Response)
  }
  if (error instanceof EdgeError) return error
  const message = error instanceof Error ? error.message : "Network request failed."
  return new EdgeError("internal_error", 0, message, true)
}

/** POST audio to whisper-transcribe (multipart/form-data). */
export async function transcribeAudio(blob: Blob, language?: string): Promise<TranscribeResponse> {
  const form = new FormData()
  form.append(TRANSCRIBE_AUDIO_FIELD, blob)
  if (language) form.append(TRANSCRIBE_LANGUAGE_FIELD, language)

  const { data, error } = await getSupabase().functions.invoke<TranscribeResponse>(
    "whisper-transcribe",
    { body: form }
  )
  if (error) throw await toEdgeError(error)
  return data as TranscribeResponse
}

/** POST conversation history to gemini-conversation. */
export async function converse(
  req: GeminiConversationRequest
): Promise<GeminiConversationResponse> {
  const { data, error } = await getSupabase().functions.invoke<GeminiConversationResponse>(
    "gemini-conversation",
    { body: req }
  )
  if (error) throw await toEdgeError(error)
  return data as GeminiConversationResponse
}

/**
 * POST text to elevenlabs-tts and return the raw audio Blob. The success response
 * is binary `audio/mpeg`, so we use a raw fetch with the session token rather than
 * functions.invoke. Returns null on 502 upstream_error / 503 quota_exceeded so the
 * caller falls back to browser SpeechSynthesis (R7); never throws for that path.
 */
export async function synthesizeSpeech(text: string): Promise<Blob | null> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new EdgeError(
      "internal_error",
      0,
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.",
      false
    )
  }

  const { data } = await getSupabase().auth.getSession()
  const accessToken = data.session?.access_token ?? anonKey

  const body: TtsRequest = { text }
  let res: Response
  try {
    res = await fetch(`${url}/functions/v1/elevenlabs-tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new EdgeError(
      "internal_error",
      0,
      err instanceof Error ? err.message : "Network request failed.",
      true
    )
  }

  if (res.ok) return await res.blob()
  // Fallback path: premium voice unavailable → browser SpeechSynthesis (R7).
  if (res.status === 502 || res.status === 503) return null
  throw await edgeErrorFromResponse(res)
}

/** POST a make-call request; the call_logs row is created server-side. */
export async function makeCall(req: MakeCallRequest): Promise<MakeCallResponse> {
  const { data, error } = await getSupabase().functions.invoke<MakeCallResponse>("make-call", {
    body: req,
  })
  if (error) throw await toEdgeError(error)
  return data as MakeCallResponse
}
