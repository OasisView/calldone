// Thin wrapper over the Web Speech API's SpeechRecognition. Free, no API key;
// supported in Chrome/Edge (webkit-prefixed). The UI always offers a typed
// fallback, so lack of support is a degraded-but-working state, never an error.

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isRecognitionSupported(): boolean {
  return getCtor() !== null
}

export interface RecognitionHandle {
  /** Stop listening and let pending results flush. */
  stop(): void
  /** Stop immediately and discard results. */
  cancel(): void
}

export interface RecognitionCallbacks {
  /** Called with the running transcript; isFinal=true once per utterance. */
  onResult(text: string, isFinal: boolean): void
  /** Always called exactly once when recognition fully ends. */
  onEnd(): void
  /** Permission denied, no speech, network, etc. onEnd still follows. */
  onError(error: string): void
}

export function startRecognition(callbacks: RecognitionCallbacks): RecognitionHandle | null {
  const Ctor = getCtor()
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.lang = "en-US"
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1

  let finalText = ""
  recognition.onresult = (event) => {
    let interim = ""
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) finalText += result[0].transcript
      else interim += result[0].transcript
    }
    const combined = (finalText + interim).trim()
    if (combined) callbacks.onResult(combined, false)
  }
  recognition.onend = () => {
    const text = finalText.trim()
    if (text) callbacks.onResult(text, true)
    callbacks.onEnd()
  }
  recognition.onerror = (event) => {
    callbacks.onError(event.error)
  }

  try {
    recognition.start()
  } catch {
    callbacks.onError("start-failed")
    callbacks.onEnd()
    return null
  }

  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
    },
    cancel: () => {
      finalText = ""
      try {
        recognition.abort()
      } catch {
        /* already stopped */
      }
    },
  }
}
