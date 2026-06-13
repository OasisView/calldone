import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import type { ApiErrorBody, MakeCallResponse } from "@/types/api"

type ApiError = ApiErrorBody["error"]

export function useMakeCall(): UseMutationResult<
  MakeCallResponse,
  ApiError,
  { scriptId: string; phoneNumber: string }
> {
  return useMutation<MakeCallResponse, ApiError, { scriptId: string; phoneNumber: string }>({
    mutationFn: async () => {
      throw new Error("not implemented")
    },
  })
}
