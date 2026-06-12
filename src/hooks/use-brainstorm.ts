// The brainstorm loop: mic (or typed) input → scripted conversation engine →
// spoken reply → finalized script saved locally. Components consume this hook
// only; the paid upgrade swaps the engine behind it without UI changes.

import { useCallback, useEffect, useRef, useState } from "react"

import {
  isRecognitionSupported,
  startRecognition,
  type RecognitionHandle,
} from "@/lib/audio/recognition"
import { isTtsSupported, speak, stopSpeaking } from "@/lib/audio/tts"
import {
  GREETING,
  INITIAL_STATE,
  nextTurn,
  type ConversationState,
} from "@/lib/demo/conversation"
import { saveScript } from "@/lib/demo/store"
import type { BrainstormMessage } from "@/lib/demo/types"

export type BrainstormStatus =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "finalized"

export interface UseBrainstormResult {
  status: BrainstormStatus
  messages: BrainstormMessage[]
  /** Live partial transcript while listening. */
  interimText: string
  micSupported: boolean
  micError: string | null
  voiceEnabled: boolean
  setVoiceEnabled(enabled: boolean): void
  finalizedScript: { scriptId: string } | null
  startListening(): void
  stopListening(): void
  sendText(text: string): void
  reset(): void
}

const THINKING_DELAY_MS = 550

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useBrainstorm(): UseBrainstormResult {
  const [status, setStatus] = useState<BrainstormStatus>("idle")
  const [messages, setMessages] = useState<BrainstormMessage[]>([
    { role: "assistant", text: GREETING },
  ])
  const [interimText, setInterimText] = useState("")
  const [micError, setMicError] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(() => isTtsSupported())
  const [finalizedScript, setFinalizedScript] = useState<{ scriptId: string } | null>(null)

  const conversationRef = useRef<ConversationState>(INITIAL_STATE)
  const recognitionRef = useRef<RecognitionHandle | null>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const voiceEnabledRef = useRef(voiceEnabled)
  voiceEnabledRef.current = voiceEnabled

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      recognitionRef.current?.cancel()
      stopSpeaking()
    }
  }, [])

  const sendText = useCallback((rawText: string) => {
    const text = rawText.trim()
    if (!text || busyRef.current) return
    busyRef.current = true
    setMicError(null)
    setInterimText("")
    setMessages((prev) => [...prev, { role: "user", text }])
    setStatus("thinking")

    void (async () => {
      await delay(THINKING_DELAY_MS)
      const result = nextTurn(conversationRef.current, text)
      conversationRef.current = result.state
      if (!mountedRef.current) return
      setMessages((prev) => [...prev, { role: "assistant", text: result.reply }])

      if (voiceEnabledRef.current && isTtsSupported()) {
        setStatus("speaking")
        await speak(result.reply)
        if (!mountedRef.current) return
      }

      if (result.finalized) {
        const script = saveScript({
          intentId: result.finalized.intentId,
          scriptText: result.finalized.scriptText,
          callPurpose: result.finalized.callPurpose,
          targetName: result.finalized.targetName,
          slots: result.finalized.slots,
        })
        setFinalizedScript({ scriptId: script.id })
        setStatus("finalized")
      } else {
        setStatus("idle")
      }
      busyRef.current = false
    })()
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const startListening = useCallback(() => {
    if (busyRef.current || recognitionRef.current) return
    if (!isRecognitionSupported()) {
      setMicError("unsupported")
      return
    }
    stopSpeaking()
    setMicError(null)
    setInterimText("")

    let finalSent = false
    const handle = startRecognition({
      onResult: (text, isFinal) => {
        if (!mountedRef.current) return
        if (isFinal) {
          finalSent = true
          sendText(text)
        } else {
          setInterimText(text)
        }
      },
      onEnd: () => {
        recognitionRef.current = null
        if (!mountedRef.current) return
        setInterimText("")
        // If recognition ended without a usable result, return to idle.
        if (!finalSent) setStatus((s) => (s === "listening" ? "idle" : s))
      },
      onError: (error) => {
        if (!mountedRef.current) return
        setMicError(error)
      },
    })
    if (handle) {
      recognitionRef.current = handle
      setStatus("listening")
    }
  }, [sendText])

  const reset = useCallback(() => {
    recognitionRef.current?.cancel()
    recognitionRef.current = null
    stopSpeaking()
    busyRef.current = false
    conversationRef.current = INITIAL_STATE
    setMessages([{ role: "assistant", text: GREETING }])
    setInterimText("")
    setMicError(null)
    setFinalizedScript(null)
    setStatus("idle")
  }, [])

  return {
    status,
    messages,
    interimText,
    micSupported: isRecognitionSupported(),
    micError,
    voiceEnabled,
    setVoiceEnabled,
    finalizedScript,
    startListening,
    stopListening,
    sendText,
    reset,
  }
}
