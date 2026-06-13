// src/hooks/use-speech-playback.ts — React surface for speaking agent replies
// (frontend.md §3.1 / §7, ws/brainstorm-ui). The TTS-fallback decision lives HERE
// (R7): call edge.synthesizeSpeech(); a non-null Blob plays via the premium path
// (lastSource = "elevenlabs"); a null result (502/503 from the edge) falls back to
// browser SpeechSynthesis (lastSource = "browser"). synthesizeSpeech never throws
// on the fallback path, so the conversation never breaks on a TTS outage.
//
// Text longer than LIMITS.TTS_TEXT_MAX_CHARS is sent straight to the browser voice
// (and not to the premium endpoint, which would 400) — agent utterances are short,
// so this is a rare guard rather than a chunker.
import { useCallback, useEffect, useRef, useState } from "react"
import { synthesizeSpeech } from "@/lib/edge"
import { playBlob, speakWithBrowser, stopAll } from "@/lib/audio/tts-player"
import { LIMITS } from "@/types/api"

export interface UseSpeechPlaybackResult {
  isSpeaking: boolean
  lastSource: "elevenlabs" | "browser" | null
  speak(text: string): Promise<void>
  stop(): void
}

export function useSpeechPlayback(): UseSpeechPlaybackResult {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastSource, setLastSource] = useState<"elevenlabs" | "browser" | null>(null)
  // Guards against state updates after unmount (playback is async).
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopAll()
    }
  }, [])

  const speak = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return

    setIsSpeaking(true)
    try {
      // Oversized text bypasses premium TTS (would 400) and uses the browser voice.
      if (trimmed.length > LIMITS.TTS_TEXT_MAX_CHARS) {
        if (mountedRef.current) setLastSource("browser")
        await speakWithBrowser(trimmed)
        return
      }

      let blob: Blob | null = null
      try {
        blob = await synthesizeSpeech(trimmed)
      } catch {
        // Any non-fallback edge error (e.g. network/internal) — degrade to the
        // browser voice rather than going silent.
        blob = null
      }

      if (blob) {
        if (mountedRef.current) setLastSource("elevenlabs")
        try {
          await playBlob(blob)
          return
        } catch {
          // Playback itself failed (autoplay block, decode error) — fall through
          // to the browser voice so the user still hears the reply.
        }
      }

      if (mountedRef.current) setLastSource("browser")
      await speakWithBrowser(trimmed)
    } finally {
      if (mountedRef.current) setIsSpeaking(false)
    }
  }, [])

  const stop = useCallback(() => {
    stopAll()
    if (mountedRef.current) setIsSpeaking(false)
  }, [])

  return { isSpeaking, lastSource, speak, stop }
}
