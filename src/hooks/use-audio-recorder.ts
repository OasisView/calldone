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

export function useAudioRecorder(): UseAudioRecorderResult {
  return {
    isSupported: false,
    isRecording: false,
    error: null,
    start: async () => {
      throw new Error("not implemented")
    },
    stop: async () => {
      throw new Error("not implemented")
    },
    cancel: () => {
      throw new Error("not implemented")
    },
  }
}
