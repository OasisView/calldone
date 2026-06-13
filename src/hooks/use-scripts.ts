import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type { CallScript } from "@/types/database"
import type { ApiErrorBody } from "@/types/api"
import { queryKeys } from "@/lib/query-keys"

type ApiError = ApiErrorBody["error"]

export function useScripts(): UseQueryResult<CallScript[], ApiError> {
  return useQuery<CallScript[], ApiError>({
    queryKey: queryKeys.scripts.all(""),
    queryFn: async () => {
      throw new Error("not implemented")
    },
    enabled: false,
  })
}

export function useScript(scriptId: string): UseQueryResult<CallScript | null, ApiError> {
  return useQuery<CallScript | null, ApiError>({
    queryKey: queryKeys.scripts.detail(scriptId),
    queryFn: async () => {
      throw new Error("not implemented")
    },
    enabled: false,
  })
}

export function useUpdateScript(): UseMutationResult<
  CallScript,
  ApiError,
  { scriptId: string; scriptText: string }
> {
  return useMutation<CallScript, ApiError, { scriptId: string; scriptText: string }>({
    mutationFn: async () => {
      throw new Error("not implemented")
    },
  })
}

export function useToggleFavorite(): UseMutationResult<
  CallScript,
  ApiError,
  { scriptId: string; isFavorite: boolean }
> {
  return useMutation<CallScript, ApiError, { scriptId: string; isFavorite: boolean }>({
    mutationFn: async () => {
      throw new Error("not implemented")
    },
  })
}
