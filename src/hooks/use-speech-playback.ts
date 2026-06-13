export interface UseSpeechPlaybackResult {
  isSpeaking: boolean
  lastSource: "elevenlabs" | "browser" | null
  speak(text: string): Promise<void>
  stop(): void
}

export function useSpeechPlayback(): UseSpeechPlaybackResult {
  return {
    isSpeaking: false,
    lastSource: null,
    speak: async () => {
      throw new Error("not implemented")
    },
    stop: () => {
      throw new Error("not implemented")
    },
  }
}
