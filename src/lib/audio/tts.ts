// Thin wrapper over the browser's speechSynthesis. Free, built into every
// modern browser; this is the demo's voice (and the planned fallback voice of
// the future paid version).

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

let cachedVoice: SpeechSynthesisVoice | null | undefined

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice
  if (!isTtsSupported()) return (cachedVoice = null)
  const voices = window.speechSynthesis.getVoices()
  const preferred = [
    "Google US English",
    "Samantha", // macOS
    "Microsoft Aria Online (Natural) - English (United States)",
  ]
  cachedVoice =
    voices.find((v) => preferred.includes(v.name)) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0] ??
    null
  return cachedVoice
}

// Voice list loads async in Chrome; refresh the cache when it arrives.
if (isTtsSupported() && "onvoiceschanged" in window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined
  }
}

/** Speak text aloud; resolves when the utterance finishes (or fails). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!isTtsSupported() || !text.trim()) return resolve()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    utterance.rate = 1.02
    utterance.pitch = 1
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.cancel() // never queue behind a stale utterance
    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel()
}
