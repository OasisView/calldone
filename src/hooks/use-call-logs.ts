// src/hooks/use-call-logs.ts — the ONLY Supabase surface for call_logs reads
// (frontend.md §3.1). Clients have ZERO write policies on call_logs (R5): these
// hooks SELECT only; the row is created by make-call (service role) and updated
// server-side by the call result webhook. useCallLog optionally polls a single row at
// LIMITS.POLL_INTERVAL_MS while its status is non-terminal, stopping on a
// terminal status; if the row is still non-terminal after LIMITS.POLL_TIMEOUT_MS
// it surfaces a retryable error state ("the demo call didn't complete") and
// stops polling (R17 / api.md §6 step 9). Constants come from api-types.
import {
  useQuery,
  type Query,
  type UseQueryResult,
} from "@tanstack/react-query"
import { useRef } from "react"
import type { CallLog } from "@/types/database"
import { LIMITS, TERMINAL_CALL_STATUSES, type ApiErrorBody, type CallStatus } from "@/types/api"
import { getSupabase } from "@/lib/supabase"
import { queryKeys } from "@/lib/query-keys"
import { useSession } from "@/hooks/use-session"

type ApiError = ApiErrorBody["error"]

function toApiError(error: unknown): ApiError {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "Request failed.")
      : "Request failed."
  return { code: "internal_error", message, retryable: true }
}

/** True once the call has reached a terminal status (api-types TERMINAL_CALL_STATUSES). */
export function isTerminalCallStatus(status: string): boolean {
  return (TERMINAL_CALL_STATUSES as readonly string[]).includes(status)
}

/** Caller's own call logs, newest first (RLS scopes to auth.uid()). */
export function useCallLogs(): UseQueryResult<CallLog[], ApiError> {
  const { user } = useSession()
  const userId = user?.id ?? ""
  return useQuery<CallLog[], ApiError>({
    queryKey: queryKeys.callLogs.all(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("call_logs")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw toApiError(error)
      return (data ?? []) as CallLog[]
    },
  })
}

/**
 * A single owned call log, or null when not found / not owned (RLS).
 *
 * When `opts.poll` is true, the row is refetched every LIMITS.POLL_INTERVAL_MS
 * while its status is in {"initiated","ringing"} and polling stops the moment a
 * terminal status arrives. If POLL_TIMEOUT_MS elapses with the row still
 * non-terminal, the query enters a retryable error state and polling halts —
 * this covers the rare case where the demo's background webhook is torn down.
 */
export function useCallLog(
  callLogId: string,
  opts?: { poll?: boolean },
): UseQueryResult<CallLog | null, ApiError> {
  const poll = opts?.poll ?? false
  // Wall-clock deadline for the current poll session. Reset whenever the polled
  // id changes so navigating between calls restarts the timeout window.
  const deadlineRef = useRef<{ id: string; at: number } | null>(null)
  if (poll && (deadlineRef.current === null || deadlineRef.current.id !== callLogId)) {
    deadlineRef.current = { id: callLogId, at: Date.now() + LIMITS.POLL_TIMEOUT_MS }
  }

  return useQuery<CallLog | null, ApiError>({
    queryKey: queryKeys.callLogs.detail(callLogId),
    enabled: Boolean(callLogId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("call_logs")
        .select("*")
        .eq("id", callLogId)
        .maybeSingle()
      if (error) throw toApiError(error)
      const row = (data as CallLog | null) ?? null

      // Timeout: the call never reached a terminal status in the allotted
      // window. Surface a retryable error so the UI can show a retry prompt.
      if (
        poll &&
        row !== null &&
        !isTerminalCallStatus(row.status) &&
        deadlineRef.current !== null &&
        Date.now() >= deadlineRef.current.at
      ) {
        throw {
          code: "internal_error",
          message: "The demo call didn't complete. Please try again.",
          retryable: true,
        } as ApiError
      }
      return row
    },
    // Poll only while non-terminal and within the timeout window; React Query
    // calls this with the latest query state after every fetch.
    refetchInterval: poll
      ? (query: Query<CallLog | null, ApiError>) => {
          const row = query.state.data
          if (!row) return LIMITS.POLL_INTERVAL_MS // not loaded yet — keep trying
          if (isTerminalCallStatus(row.status)) return false
          if (deadlineRef.current !== null && Date.now() >= deadlineRef.current.at) return false
          return LIMITS.POLL_INTERVAL_MS
        }
      : false,
    refetchIntervalInBackground: false,
  })
}

// Re-export the status type so pages can narrow without re-importing from api.
export type { CallStatus }
