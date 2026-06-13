// src/hooks/use-make-call.ts — places a (demo) call via the make-call edge
// function (frontend.md §3.1, api.md §3.4/§6). Clients have ZERO write policies
// on call_logs (R5): this hook NEVER mutates call_logs directly — make-call
// creates the row server-side; we just invoke the function and then invalidate
// the call-logs query keys so the new row is refetched. Phone input is
// normalized + validated client-side against the SHARED E164_REGEX (via
// lib/phone + schemas.ts) as a pre-flight UX nicety; the server stays
// authoritative and a server 400 surfaces cleanly through edge.ts → EdgeError.
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"
import type { ApiErrorBody, MakeCallResponse } from "@/types/api"
import { EdgeError, makeCall } from "@/lib/edge"
import { normalizeE164 } from "@/lib/phone"
import { makeCallRequestSchema } from "@/lib/schemas"
import { queryKeys } from "@/lib/query-keys"
import { useSession } from "@/hooks/use-session"

type ApiError = ApiErrorBody["error"]

export function useMakeCall(): UseMutationResult<
  MakeCallResponse,
  ApiError,
  { scriptId: string; phoneNumber: string }
> {
  const queryClient = useQueryClient()
  const { user } = useSession()
  const userId = user?.id ?? ""

  return useMutation<MakeCallResponse, ApiError, { scriptId: string; phoneNumber: string }>({
    mutationFn: async ({ scriptId, phoneNumber }) => {
      // Normalize human formatting (spaces/dashes/parens) to canonical E.164,
      // then pre-flight validate with the shared zod mirror. On failure we
      // short-circuit with the same invalid_request envelope the server uses.
      const normalized = normalizeE164(phoneNumber) ?? phoneNumber
      const parsed = makeCallRequestSchema.safeParse({
        script_id: scriptId,
        phone_number: normalized,
      })
      if (!parsed.success) {
        throw {
          code: "invalid_request",
          message: parsed.error.issues[0]?.message ?? "Invalid call request.",
          retryable: false,
        } as ApiError
      }

      try {
        return await makeCall(parsed.data)
      } catch (error) {
        if (error instanceof EdgeError) {
          throw {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          } as ApiError
        }
        throw {
          code: "internal_error",
          message: error instanceof Error ? error.message : "Request failed.",
          retryable: true,
        } as ApiError
      }
    },
    onSuccess: (res) => {
      // The row was created server-side (R5) — refetch the list and prime the
      // detail key so CallDetail starts polling against the right id.
      queryClient.invalidateQueries({ queryKey: queryKeys.callLogs.all(userId) })
      queryClient.invalidateQueries({
        queryKey: queryKeys.callLogs.detail(res.call_log_id),
      })
    },
  })
}
