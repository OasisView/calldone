// src/hooks/use-brainstorm.ts — orchestrates the voice brainstorm and owns ALL
// client-side persistence (frontend.md §3.1, R2). The gemini-conversation edge
// function is stateless: it never writes the DB and its finalize response carries
// script CONTENT, never a server-generated id. This hook, under the caller's own
// JWT (RLS-scoped), is the only writer:
//
//   1. Session start  → INSERT brainstorm_sessions (anonymous allowed, R8); the row
//                        id is passed to converse() as session_id.
//   2. Each exchange  → UPDATE the row's transcript with the appended messages.
//   3. script_finalized:
//      a. INSERT call_scripts (anonymous allowed) → capture the new row id;
//      b. UPSERT user_facts — SKIPPED ENTIRELY when isAnonymous (R8; RLS also blocks);
//      c. UPDATE brainstorm_sessions.resulting_script_id;
//      d. set finalizedScript so the page can nav.toScriptReview(scriptId).
//
// Flow per turn: record → transcribeAudio → converse → speak reply (or finalize).
// A 429 sets a cooldown error and STOPS — no automatic retry loop (security §10 #4).
import { useCallback, useRef, useState } from "react"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { useSpeechPlayback } from "@/hooks/use-speech-playback"
import { useSession } from "@/hooks/use-session"
import { getSupabase } from "@/lib/supabase"
import { converse, transcribeAudio, EdgeError } from "@/lib/edge"
import { LIMITS, type ApiErrorBody, type ConversationMessage } from "@/types/api"
import type {
  BrainstormSessionInsert,
  BrainstormTranscriptEntry,
  CallScriptInsert,
  UserFactInsert,
} from "@/types/database"

type ApiError = ApiErrorBody["error"]

export type BrainstormStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "finalized"
  | "error"

export interface BrainstormMessage {
  role: "user" | "assistant"
  text: string
}

export interface UseBrainstormResult {
  status: BrainstormStatus
  messages: BrainstormMessage[]
  error: ApiError | null
  isTtsFallback: boolean
  finalizedScript: { scriptId: string; targetPhoneHint: string | null } | null
  startRecording(): Promise<void>
  stopAndSend(): Promise<void>
  cancelRecording(): void
  reset(): void
}

/** Coerce any thrown value into our toast-safe ApiError envelope. */
function toApiError(err: unknown): ApiError {
  if (err instanceof EdgeError) {
    return { code: err.code, message: err.message, retryable: err.retryable }
  }
  if (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    return err as ApiError
  }
  return {
    code: "internal_error",
    message: err instanceof Error ? err.message : "Something went wrong.",
    retryable: false,
  }
}

export function useBrainstorm(): UseBrainstormResult {
  const recorder = useAudioRecorder()
  const playback = useSpeechPlayback()
  const { user, isAnonymous } = useSession()

  const [status, setStatus] = useState<BrainstormStatus>("idle")
  const [messages, setMessages] = useState<BrainstormMessage[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [finalizedScript, setFinalizedScript] = useState<
    { scriptId: string; targetPhoneHint: string | null } | null
  >(null)

  // The brainstorm_sessions row id (client-generated flow). Created lazily on the
  // first send and reused for the whole conversation.
  const sessionIdRef = useRef<string | null>(null)
  // Authoritative message log, mirrored to state — refs avoid stale closures inside
  // the async send pipeline.
  const messagesRef = useRef<BrainstormMessage[]>([])

  const setMessagesBoth = useCallback((next: BrainstormMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  /** Lazily create the brainstorm_sessions row; returns its id. RLS scopes the
   *  insert to the caller — anonymous users may create their own (R8). */
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current
    if (!user) {
      throw {
        code: "unauthorized",
        message: "Your session expired. Please reload to continue the demo.",
        retryable: false,
      } satisfies ApiError
    }
    const insert: BrainstormSessionInsert = { user_id: user.id, transcript: [] }
    const { data, error: dbError } = await getSupabase()
      .from("brainstorm_sessions")
      .insert(insert)
      .select("id")
      .single()
    if (dbError || !data) {
      throw {
        code: "internal_error",
        message: "Could not start the brainstorm session.",
        retryable: true,
      } satisfies ApiError
    }
    sessionIdRef.current = data.id as string
    return sessionIdRef.current
  }, [user])

  /** Mirror the running message log into brainstorm_sessions.transcript (R2 step 2).
   *  Best-effort: a transcript-persist failure must not abort the live conversation. */
  const persistTranscript = useCallback(
    async (sessionId: string, log: BrainstormMessage[]) => {
      const transcript: BrainstormTranscriptEntry[] = log.map((m) => ({
        role: m.role,
        text: m.text,
      }))
      await getSupabase()
        .from("brainstorm_sessions")
        .update({ transcript })
        .eq("id", sessionId)
    },
    []
  )

  /** R2 step 3: persist the finalized script + facts and expose finalizedScript. */
  const persistFinalized = useCallback(
    async (
      sessionId: string,
      script: {
        script_text: string
        call_purpose: string
        target_phone_hint: string | null
        extracted_facts: { key: string; value: string; confidence: number }[]
      }
    ) => {
      const supabase = getSupabase()
      const ownerId = user!.id

      // a. INSERT call_scripts (anonymous allowed) — capture the new row id.
      const scriptInsert: CallScriptInsert = {
        user_id: ownerId,
        script_text: script.script_text,
        call_purpose: script.call_purpose,
        source: "brainstorm",
        brainstorm_session_id: sessionId,
      }
      const { data: scriptRow, error: scriptError } = await supabase
        .from("call_scripts")
        .insert(scriptInsert)
        .select("id")
        .single()
      if (scriptError || !scriptRow) {
        throw {
          code: "internal_error",
          message: "Could not save your script.",
          retryable: true,
        } satisfies ApiError
      }
      const scriptId = scriptRow.id as string

      // b. UPSERT user_facts — SKIPPED ENTIRELY when anonymous (R8). RLS also blocks
      //    it, so this client check is purely a UX/cost nicety, not the boundary.
      if (!isAnonymous && script.extracted_facts.length > 0) {
        const facts: UserFactInsert[] = script.extracted_facts.map((f) => ({
          user_id: ownerId,
          key: f.key,
          value: f.value,
          source: "brainstorm",
          confidence: f.confidence,
        }))
        // Upsert by the (user_id, key) natural key so repeat facts update in place.
        await supabase.from("user_facts").upsert(facts, { onConflict: "user_id,key" })
      }

      // c. UPDATE brainstorm_sessions.resulting_script_id.
      await supabase
        .from("brainstorm_sessions")
        .update({ resulting_script_id: scriptId })
        .eq("id", sessionId)

      // d. Expose for the page to navigate.
      setFinalizedScript({ scriptId, targetPhoneHint: script.target_phone_hint })
    },
    [user, isAnonymous]
  )

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      await recorder.start()
      setStatus("recording")
    } catch (err) {
      setError(toApiError(err))
      setStatus("error")
    }
  }, [recorder])

  const cancelRecording = useCallback(() => {
    recorder.cancel()
    // Discard the take and return to a resting state without sending anything.
    setStatus("idle")
  }, [recorder])

  const stopAndSend = useCallback(async () => {
    setError(null)

    // 1. Stop recording and get the audio blob.
    let blob: Blob
    try {
      setStatus("transcribing")
      const result = await recorder.stop()
      blob = result.blob
    } catch (err) {
      setError(toApiError(err))
      setStatus("error")
      return
    }

    // 2. Transcribe.
    let userText: string
    try {
      const transcription = await transcribeAudio(blob)
      userText = transcription.text.trim()
    } catch (err) {
      setError(toApiError(err))
      setStatus("error")
      return
    }

    if (!userText) {
      // No speech detected — surface a gentle, retryable nudge and reset to idle.
      setError({
        code: "invalid_request",
        message: "I didn't catch that. Try recording again.",
        retryable: true,
      })
      setStatus("idle")
      return
    }

    // Append the user's turn.
    const withUser: BrainstormMessage[] = [
      ...messagesRef.current,
      { role: "user", text: userText },
    ]
    setMessagesBoth(withUser)

    // 3. Converse (and persist).
    setStatus("thinking")
    try {
      const sessionId = await ensureSession()
      await persistTranscript(sessionId, withUser)

      const apiMessages: ConversationMessage[] = withUser
        .slice(-LIMITS.MESSAGES_MAX)
        .map((m) => ({ role: m.role, text: m.text }))

      const response = await converse({ messages: apiMessages, session_id: sessionId })

      if (response.type === "script_finalized") {
        const closing = response.closing_message
        const withClosing: BrainstormMessage[] = [
          ...withUser,
          { role: "assistant", text: closing },
        ]
        setMessagesBoth(withClosing)
        await persistTranscript(sessionId, withClosing)
        await persistFinalized(sessionId, response.script)

        setStatus("speaking")
        await playback.speak(closing)
        setStatus("finalized")
        return
      }

      // Plain reply turn.
      const reply = response.message
      const withReply: BrainstormMessage[] = [
        ...withUser,
        { role: "assistant", text: reply },
      ]
      setMessagesBoth(withReply)
      await persistTranscript(sessionId, withReply)

      setStatus("speaking")
      await playback.speak(reply)
      setStatus("idle")
    } catch (err) {
      // 429 (and every other edge error) lands here: set the error and STOP. The UI
      // renders a cooldown for rate_limited; there is no automatic re-fire (§10 #4).
      setError(toApiError(err))
      setStatus("error")
    }
  }, [
    recorder,
    ensureSession,
    persistTranscript,
    persistFinalized,
    playback,
    setMessagesBoth,
  ])

  const reset = useCallback(() => {
    recorder.cancel()
    playback.stop()
    sessionIdRef.current = null
    messagesRef.current = []
    setMessages([])
    setError(null)
    setFinalizedScript(null)
    setStatus("idle")
  }, [recorder, playback])

  return {
    status,
    messages,
    error,
    isTtsFallback: playback.lastSource === "browser",
    finalizedScript,
    startRecording,
    stopAndSend,
    cancelRecording,
    reset,
  }
}
