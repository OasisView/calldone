// src/hooks/use-audio-recorder.ts — React surface over src/lib/audio/recorder.ts
// (frontend.md §3.1 / §7, ws/brainstorm-ui). Holds a single live RecorderHandle in
// a ref; start()/stop()/cancel() always leave the mic released. Errors surface as
// typed ApiErrors (never raw DOMExceptions). The recorder enforces the 60 s /
// 5 MB caps internally (R17) — this hook just relays the result.
import { useCallback, useEffect, useRef, useState } from "react"
import {
  isRecordingSupported,
  startRecording,
  type RecorderHandle,
} from "@/lib/audio/recorder"
import type { ApiErrorBody } from "@/types/api"

type ApiError = ApiErrorBody["error"]

export interface UseAudioRecorderResult {
  isSupported: boolean
  isRecording: boolean
  error: ApiError | null
  start(): Promise<void>
  stop(): Promise<{ blob: Blob; mimeType: string }>
  cancel(): void
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  )
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const handleRef = useRef<RecorderHandle | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  // isRecordingSupported() reads navigator/MediaRecorder — stable per session, but
  // compute lazily so SSG (no navigator) never throws at module load.
  const [isSupported] = useState(() => isRecordingSupported())

  // On unmount, release the mic if a recording is still live.
  useEffect(() => {
    return () => {
      handleRef.current?.cancel()
      handleRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    // Defensive: never leak a prior handle if start() is called twice.
    if (handleRef.current) {
      handleRef.current.cancel()
      handleRef.current = null
    }
    try {
      const handle = await startRecording()
      handleRef.current = handle
      setIsRecording(true)
    } catch (err) {
      const apiError: ApiError = isApiError(err)
        ? err
        : {
            code: "internal_error",
            message: "Could not start recording.",
            retryable: false,
          }
      setError(apiError)
      setIsRecording(false)
      throw apiError
    }
  }, [])

  const stop = useCallback(async () => {
    const handle = handleRef.current
    handleRef.current = null
    setIsRecording(false)
    if (!handle) {
      const apiError: ApiError = {
        code: "internal_error",
        message: "No active recording to stop.",
        retryable: false,
      }
      setError(apiError)
      throw apiError
    }
    try {
      return await handle.stop()
    } catch (err) {
      const apiError: ApiError = isApiError(err)
        ? err
        : {
            code: "internal_error",
            message: "Could not finish recording.",
            retryable: false,
          }
      setError(apiError)
      throw apiError
    }
  }, [])

  const cancel = useCallback(() => {
    handleRef.current?.cancel()
    handleRef.current = null
    setIsRecording(false)
  }, [])

  return { isSupported, isRecording, error, start, stop, cancel }
}
