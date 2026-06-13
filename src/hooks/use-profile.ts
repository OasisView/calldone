import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type { Profile, ProfileUpdate } from "@/types/database"
import type { ApiErrorBody } from "@/types/api"

type ApiError = ApiErrorBody["error"]

export function useProfile(): UseQueryResult<Profile | null, ApiError> {
  return useQuery<Profile | null, ApiError>({
    queryKey: ["profile"],
    queryFn: async () => {
      throw new Error("not implemented")
    },
    enabled: false,
  })
}

export function useUpdateProfile(): UseMutationResult<Profile, ApiError, ProfileUpdate> {
  return useMutation<Profile, ApiError, ProfileUpdate>({
    mutationFn: async () => {
      throw new Error("not implemented")
    },
  })
}
