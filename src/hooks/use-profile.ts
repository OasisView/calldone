import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"

import { getSupabase } from "@/lib/supabase"
import { queryKeys } from "@/lib/query-keys"
import { useSession } from "@/hooks/use-session"
import type { Profile, ProfileUpdate } from "@/types/database"
import type { ApiErrorBody } from "@/types/api"

type ApiError = ApiErrorBody["error"]

function toApiError(message: string): ApiError {
  return { code: "internal_error", message, retryable: true }
}

/**
 * The ONLY columns a client may write on profiles (security.md §1.4 GRANT, R9).
 * `phone_verified_at` is deliberately absent — it is service-role-only; the
 * reset_phone_verification trigger voids it automatically on any phone change.
 */
const WRITABLE_PROFILE_COLUMNS = [
  "display_name",
  "phone_number",
  "time_zone",
  "communication_style",
] as const

type WritableColumn = (typeof WRITABLE_PROFILE_COLUMNS)[number]

/** Strip an incoming ProfileUpdate down to only the client-writable columns
 *  (R9). Even if a caller passes phone_verified_at / style_summary / id, they
 *  never reach the wire — defense in depth alongside RLS + the column GRANT. */
function pickWritable(update: ProfileUpdate): Partial<Record<WritableColumn, unknown>> {
  const out: Partial<Record<WritableColumn, unknown>> = {}
  for (const col of WRITABLE_PROFILE_COLUMNS) {
    if (col in update) {
      out[col] = update[col]
    }
  }
  return out
}

export function useProfile(): UseQueryResult<Profile | null, ApiError> {
  const { user } = useSession()
  const userId = user?.id ?? null

  return useQuery<Profile | null, ApiError>({
    queryKey: userId ? queryKeys.profile(userId) : ["profile", "anonymous"],
    queryFn: async () => {
      if (!userId) return null
      const { data, error } = await getSupabase()
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle()
      if (error) throw toApiError(error.message)
      return (data as Profile | null) ?? null
    },
    enabled: userId != null,
  })
}

export function useUpdateProfile(): UseMutationResult<Profile, ApiError, ProfileUpdate> {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const userId = user?.id ?? null

  return useMutation<Profile, ApiError, ProfileUpdate>({
    mutationFn: async (update) => {
      if (!userId) {
        throw { code: "unauthorized", message: "No active session.", retryable: false } as ApiError
      }
      const patch = pickWritable(update)
      const { data, error } = await getSupabase()
        .from("profiles")
        .update(patch)
        .eq("id", userId)
        .select("*")
        .single()
      if (error) throw toApiError(error.message)
      return data as Profile
    },
    onSuccess: (profile) => {
      if (userId) {
        queryClient.setQueryData(queryKeys.profile(userId), profile)
      }
    },
  })
}
