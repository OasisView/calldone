// src/lib/audio/tts-player.ts — speech playback for the voice brainstorm
// (frontend.md §7, ws/brainstorm-ui). Two surfaces:
//   playBlob(blob)        — play premium (ElevenLabs) MP3 bytes via an <Audio>
//                           element, ALWAYS revoking the object URL after playback
//                           (success, error, or stopAll) so blobs never leak.
//   speakWithBrowser(text)— SpeechSynthesis fallback when premium TTS is null (R7).
// stopAll() halts whichever path is active and revokes any outstanding URL.
//
// No audio is persisted; the object URL lives only for the lifetime of playback.

let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null

/** Revoke and forget the outstanding object URL, if any. Idempotent. */
function revokeCurrentUrl(): void {
  if (currentUrl !== null) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
}

/** Detach the active <Audio> element so a later ended/error event can't fire
 *  stale handlers. */
function teardownAudio(): void {
  if (currentAudio) {
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio = null
  }
}

/**
 * Play premium TTS bytes. Resolves when playback finishes (ended), rejects if the
 * element errors. The object URL is revoked on BOTH paths — leaking it would pin
 * the blob in memory for the page's lifetime.
 */
export function playBlob(blob: Blob): Promise<void> {
  // Interrupt anything already playing before starting the new clip.
  stopAll()

  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    currentUrl = url
    const audio = new Audio(url)
    currentAudio = audio

    const cleanup = () => {
      teardownAudio()
      revokeCurrentUrl()
    }

    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error("Audio playback failed."))
    }

    const playResult = audio.play()
    // play() returns a promise in modern browsers; a rejection (e.g. autoplay
    // policy) must also revoke the URL.
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch((err: unknown) => {
        cleanup()
        reject(err instanceof Error ? err : new Error("Audio playback was blocked."))
      })
    }
  })
}

/** True when the browser exposes the Web Speech synthesis API. */
export function isBrowserSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/**
 * Browser SpeechSynthesis fallback. Resolves when the utterance finishes (or
 * immediately, when synthesis is unavailable, so the conversation never stalls).
 */
export function speakWithBrowser(text: string): Promise<void> {
  if (!isBrowserSpeechSupported()) return Promise.resolve()

  // Cancel any premium playback and any queued utterances first.
  stopAll()

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

/** Stop all playback (premium element + browser synthesis) and revoke any URL. */
export function stopAll(): void {
  if (currentAudio) {
    try {
      currentAudio.pause()
    } catch {
      // ignore — element may already be torn down
    }
    teardownAudio()
  }
  revokeCurrentUrl()
  if (isBrowserSpeechSupported()) {
    window.speechSynthesis.cancel()
  }
}
