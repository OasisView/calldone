import { useEffect, useState } from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query"

import {
  completeCallLog,
  createCallLog,
  getCallLog,
  getScript,
  listCallLogs,
} from "@/lib/demo/store"
import {
  buildAppointment,
  buildTranscript,
  demoAppointmentDate,
} from "@/lib/demo/transcripts"
import type { DemoCallLog } from "@/lib/demo/types"

const KEYS = {
  all: ["demo-calls"] as const,
  detail: (id: string) => ["demo-calls", id] as const,
}

/** Milliseconds between transcript lines during the simulated call. */
export const LINE_REVEAL_MS = 1_500

export function useCallLogs(): UseQueryResult<DemoCallLog[]> {
  return useQuery({ queryKey: KEYS.all, queryFn: () => listCallLogs() })
}

export function useCallLog(callLogId: string): UseQueryResult<DemoCallLog | null> {
  return useQuery({
    queryKey: KEYS.detail(callLogId),
    queryFn: () => getCallLog(callLogId),
  })
}

export function useStartCall(): UseMutationResult<
  DemoCallLog,
  Error,
  { scriptId: string; phoneNumber: string | null }
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ scriptId, phoneNumber }) => {
      const script = getScript(scriptId)
      if (!script) throw new Error("Script not found")
      const when = demoAppointmentDate()
      return createCallLog({
        scriptId,
        phoneNumber,
        transcript: buildTranscript(script.intentId, script.slots, when),
        appointment: buildAppointment(script.intentId, script.slots, when),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.all })
    },
  })
}

export interface CallPlayback {
  /** Lines revealed so far. */
  revealedCount: number
  /** True while the simulated call is still "live". */
  isLive: boolean
}

/**
 * Reveals the transcript line by line for an in-progress call, then marks the
 * log completed in the store. Revisiting a completed call shows everything.
 */
export function useCallPlayback(log: DemoCallLog | null | undefined): CallPlayback {
  const queryClient = useQueryClient()
  const total = log?.transcript.length ?? 0
  const startLive = log?.status === "in_progress"
  const [revealedCount, setRevealedCount] = useState(() => (startLive ? 0 : total))

  useEffect(() => {
    if (!log || log.status !== "in_progress") return
    if (revealedCount >= total) {
      completeCallLog(log.id)
      void queryClient.invalidateQueries({ queryKey: KEYS.all })
      void queryClient.invalidateQueries({ queryKey: KEYS.detail(log.id) })
      return
    }
    const timer = setTimeout(() => setRevealedCount((n) => n + 1), LINE_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [log, revealedCount, total, queryClient])

  if (!log) return { revealedCount: 0, isLive: false }
  if (log.status === "completed") return { revealedCount: total, isLive: false }
  return { revealedCount, isLive: revealedCount < total }
}
