import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import type { CallLog } from "@/types/database"
import type { ApiErrorBody } from "@/types/api"
import { queryKeys } from "@/lib/query-keys"

type ApiError = ApiErrorBody["error"]

export function useCallLogs(): UseQueryResult<CallLog[], ApiError> {
  return useQuery<CallLog[], ApiError>({
    queryKey: queryKeys.callLogs.all(""),
    queryFn: async () => {
      throw new Error("not implemented")
    },
    enabled: false,
  })
}

export function useCallLog(
  callLogId: string,
  _opts?: { poll?: boolean },
): UseQueryResult<CallLog | null, ApiError> {
  return useQuery<CallLog | null, ApiError>({
    queryKey: queryKeys.callLogs.detail(callLogId),
    queryFn: async () => {
      throw new Error("not implemented")
    },
    enabled: false,
  })
}
