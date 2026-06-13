// src/hooks/use-scripts.ts — the ONLY Supabase surface for call_scripts /
// script_edit_events (frontend.md §3.1). Components consume these hooks; they
// never import @/lib/supabase. All access is under the caller's own JWT (RLS):
// useScripts/useScript read the caller's own rows; useUpdateScript writes
// call_scripts and ALSO appends a script_edit_events row, but ONLY when
// !isAnonymous (R8 — RLS independently blocks anonymous script_edit_events
// writes; the client check is a UX nicety). useToggleFavorite flips is_favorite.
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"
import type { CallScript } from "@/types/database"
import type { ApiErrorBody } from "@/types/api"
import { getSupabase } from "@/lib/supabase"
import { queryKeys } from "@/lib/query-keys"
import { useSession } from "@/hooks/use-session"

type ApiError = ApiErrorBody["error"]

/** Map a PostgrestError (or any thrown value) into our ApiErrorBody["error"]
 *  envelope so hooks expose a uniform error shape (api.md §1). */
function toApiError(error: unknown): ApiError {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "Request failed.")
      : "Request failed."
  return { code: "internal_error", message, retryable: true }
}

/** Caller's own scripts, newest first (RLS scopes to auth.uid()). */
export function useScripts(): UseQueryResult<CallScript[], ApiError> {
  const { user } = useSession()
  const userId = user?.id ?? ""
  return useQuery<CallScript[], ApiError>({
    queryKey: queryKeys.scripts.all(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("call_scripts")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw toApiError(error)
      return (data ?? []) as CallScript[]
    },
  })
}

/** A single owned script, or null when not found / not owned (RLS). */
export function useScript(scriptId: string): UseQueryResult<CallScript | null, ApiError> {
  return useQuery<CallScript | null, ApiError>({
    queryKey: queryKeys.scripts.detail(scriptId),
    enabled: Boolean(scriptId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("call_scripts")
        .select("*")
        .eq("id", scriptId)
        .maybeSingle()
      if (error) throw toApiError(error)
      return (data as CallScript | null) ?? null
    },
  })
}

/**
 * Update a script's text. When the text actually changes AND the caller is a
 * full (non-anonymous) account, ALSO append a script_edit_events row capturing
 * the before/after — the append-only style-learning signal (R8). Anonymous
 * callers update call_scripts only (RLS blocks their script_edit_events INSERT
 * anyway; the isAnonymous check just avoids a guaranteed-to-fail round-trip).
 */
export function useUpdateScript(): UseMutationResult<
  CallScript,
  ApiError,
  { scriptId: string; scriptText: string }
> {
  const queryClient = useQueryClient()
  const { user, isAnonymous } = useSession()
  const userId = user?.id ?? ""

  return useMutation<CallScript, ApiError, { scriptId: string; scriptText: string }>({
    mutationFn: async ({ scriptId, scriptText }) => {
      const supabase = getSupabase()

      // Read the current row first so we can record the original text for the
      // edit event and detect a no-op (same text → no event).
      const { data: current, error: readError } = await supabase
        .from("call_scripts")
        .select("*")
        .eq("id", scriptId)
        .maybeSingle()
      if (readError) throw toApiError(readError)
      if (!current) {
        throw { code: "not_found", message: "Script not found.", retryable: false } as ApiError
      }
      const previous = current as CallScript

      const { data: updated, error: updateError } = await supabase
        .from("call_scripts")
        .update({ script_text: scriptText })
        .eq("id", scriptId)
        .select("*")
        .single()
      if (updateError) throw toApiError(updateError)

      // Append the edit event only for full accounts and only on a real change.
      if (!isAnonymous && previous.script_text !== scriptText) {
        const { error: eventError } = await supabase.from("script_edit_events").insert({
          user_id: previous.user_id,
          script_id: scriptId,
          original_text: previous.script_text,
          edited_text: scriptText,
        })
        if (eventError) throw toApiError(eventError)
      }

      return updated as CallScript
    },
    onSuccess: (script) => {
      queryClient.setQueryData(queryKeys.scripts.detail(script.id), script)
      queryClient.invalidateQueries({ queryKey: queryKeys.scripts.all(userId) })
    },
  })
}

/** Toggle a script's favorite flag (RLS-scoped UPDATE). */
export function useToggleFavorite(): UseMutationResult<
  CallScript,
  ApiError,
  { scriptId: string; isFavorite: boolean }
> {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const userId = user?.id ?? ""

  return useMutation<CallScript, ApiError, { scriptId: string; isFavorite: boolean }>({
    mutationFn: async ({ scriptId, isFavorite }) => {
      const { data, error } = await getSupabase()
        .from("call_scripts")
        .update({ is_favorite: isFavorite })
        .eq("id", scriptId)
        .select("*")
        .single()
      if (error) throw toApiError(error)
      return data as CallScript
    },
    onSuccess: (script) => {
      queryClient.setQueryData(queryKeys.scripts.detail(script.id), script)
      queryClient.invalidateQueries({ queryKey: queryKeys.scripts.all(userId) })
    },
  })
}
