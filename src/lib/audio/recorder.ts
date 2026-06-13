// src/lib/audio/recorder.ts — MediaRecorder wrapper for the voice brainstorm
// (frontend.md §7, ws/brainstorm-ui). Enforces LIMITS.AUDIO_MAX_SECONDS as a
// hard-stop and rejects blobs over LIMITS.AUDIO_MAX_BYTES BEFORE upload. Audio is
// never persisted anywhere — the blob is held in memory, handed to the caller, and
// discarded (R22). Permission / capability failures surface as typed ApiErrors so
// the React layer can render them without inspecting DOM exceptions.
import { LIMITS, type ApiErrorBody } from "@/types/api"

type ApiError = ApiErrorBody["error"]

/** Candidate container/codec types, best first. Opus-in-WebM is preferred; Safari
 *  lacks it and falls back to MP4 (AAC). Both are in TRANSCRIBE_ALLOWED_MIME_TYPES. */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const

export interface RecorderHandle {
  /** Stop recording, flush the final chunk, and resolve with the captured blob.
   *  Rejects (typed ApiError) if the assembled blob exceeds LIMITS.AUDIO_MAX_BYTES. */
  stop(): Promise<{ blob: Blob; mimeType: string }>
  /** Abort recording and discard everything; never resolves a blob. */
  cancel(): void
}

/** True when this browser can capture microphone audio via MediaRecorder. */
export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  )
}

/** Pick the first MediaRecorder-supported mime type, or "" to let the browser
 *  choose its own default (still valid input to MediaRecorder). */
export function pickSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const canCheck = typeof MediaRecorder.isTypeSupported === "function"
  if (!canCheck) return ""
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ""
}

function recorderError(code: ApiError["code"], message: string): ApiError {
  return { code, message, retryable: false }
}

/** Normalize a getUserMedia rejection into a friendly typed ApiError. */
function micError(err: unknown): ApiError {
  const name = err instanceof DOMException ? err.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return recorderError(
      "forbidden",
      "Microphone access was blocked. Allow the mic in your browser to record."
    )
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return recorderError("invalid_request", "No microphone was found on this device.")
  }
  return recorderError(
    "internal_error",
    "Could not start recording. Check your microphone and try again."
  )
}

/** Stop every track on a stream so the OS mic indicator clears (called on every
 *  stop AND cancel path — leaking a live track is a privacy bug). */
function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

/**
 * Begin recording. Resolves once the mic is live and capturing. The returned
 * handle's stop()/cancel() ALWAYS release the mic. A hard-stop timer fires at
 * LIMITS.AUDIO_MAX_SECONDS so a forgotten recording can never run unbounded; when
 * it fires the recorder is stopped and the next stop() resolves with whatever was
 * captured up to the cap.
 */
export async function startRecording(): Promise<RecorderHandle> {
  if (!isRecordingSupported()) {
    throw recorderError(
      "invalid_request",
      "Audio recording is not supported in this browser."
    )
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    throw micError(err)
  }

  const mimeType = pickSupportedMimeType()
  let recorder: MediaRecorder
  try {
    recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream)
  } catch {
    stopTracks(stream)
    throw recorderError("internal_error", "Could not initialize the audio recorder.")
  }

  const chunks: Blob[] = []
  let settled = false
  let hardStopTimer: ReturnType<typeof setTimeout> | null = null

  recorder.addEventListener("dataavailable", (event: BlobEvent) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  })

  const clearTimer = () => {
    if (hardStopTimer !== null) {
      clearTimeout(hardStopTimer)
      hardStopTimer = null
    }
  }

  recorder.start()

  // Hard-stop at the second cap (R17). MediaRecorder keeps buffering until stop(),
  // so we proactively stop it; the pending stop() promise still resolves the blob.
  hardStopTimer = setTimeout(() => {
    if (recorder.state !== "inactive") recorder.stop()
  }, LIMITS.AUDIO_MAX_SECONDS * 1000)

  return {
    stop(): Promise<{ blob: Blob; mimeType: string }> {
      return new Promise((resolve, reject) => {
        if (settled) {
          reject(recorderError("internal_error", "Recorder already stopped."))
          return
        }
        settled = true
        clearTimer()

        const finalize = () => {
          stopTracks(stream)
          const type = recorder.mimeType || mimeType || "audio/webm"
          const blob = new Blob(chunks, { type })
          // Pre-upload byte guard (R17): reject oversized audio before it ever
          // hits the network so the server-side 413 is a backstop, not the UX.
          if (blob.size > LIMITS.AUDIO_MAX_BYTES) {
            reject(
              recorderError(
                "payload_too_large",
                "That recording is too long. Please keep it under a minute."
              )
            )
            return
          }
          resolve({ blob, mimeType: type })
        }

        recorder.addEventListener("stop", finalize, { once: true })
        if (recorder.state === "inactive") {
          // Already stopped by the hard-stop timer; flush synchronously.
          finalize()
        } else {
          recorder.stop()
        }
      })
    },
    cancel(): void {
      if (settled) return
      settled = true
      clearTimer()
      try {
        if (recorder.state !== "inactive") recorder.stop()
      } catch {
        // ignore — we are tearing down regardless
      }
      stopTracks(stream)
    },
  }
}
