import type { ApiErrorBody } from "@/types/api"

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

export function useBrainstorm(): UseBrainstormResult {
  return {
    status: "idle",
    messages: [],
    error: null,
    isTtsFallback: false,
    finalizedScript: null,
    startRecording: async () => {
      throw new Error("not implemented")
    },
    stopAndSend: async () => {
      throw new Error("not implemented")
    },
    cancelRecording: () => {
      throw new Error("not implemented")
    },
    reset: () => {
      throw new Error("not implemented")
    },
  }
}
