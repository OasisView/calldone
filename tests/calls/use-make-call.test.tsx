// frontend.md §3.1 / R5: useMakeCall calls the make-call EDGE FUNCTION and
// refetches call-logs; it NEVER writes call_logs (clients have zero write
// policies). It pre-flight validates the phone against the shared E.164 schema
// and surfaces a server 400 cleanly. We mock the edge client + session and a
// Supabase client to prove no call_logs mutation is attempted.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import React from "react"

// Hoisted state shared with the (hoisted) vi.mock factories.
const h = vi.hoisted(() => {
  const makeCall = vi.fn()
  const callLogsWriteSpy = vi.fn()
  return { makeCall, callLogsWriteSpy }
})

vi.mock("@/lib/edge", () => {
  class EdgeError extends Error {
    code: string
    status: number
    retryable: boolean
    constructor(code: string, status: number, message: string, retryable: boolean) {
      super(message)
      this.name = "EdgeError"
      this.code = code
      this.status = status
      this.retryable = retryable
    }
  }
  return { makeCall: (...a: unknown[]) => h.makeCall(...a), EdgeError }
})

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "user-1" }, isAnonymous: false }),
}))

// A supabase mock whose call_logs accessor throws if any write verb is touched.
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === "call_logs") {
        return new Proxy(
          {},
          {
            get(_t, prop) {
              if (["insert", "update", "upsert", "delete"].includes(String(prop))) {
                h.callLogsWriteSpy(String(prop))
                throw new Error(`forbidden client write call_logs.${String(prop)}`)
              }
              return () => ({ select: () => ({}) })
            },
          },
        )
      }
      return { select: () => ({}) }
    },
  }),
}))

import { useMakeCall } from "@/hooks/use-make-call"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

const VALID_UUID = "1f9d0e2a-0000-4000-8000-000000000000"

describe("useMakeCall", () => {
  beforeEach(() => {
    h.makeCall.mockReset()
    h.callLogsWriteSpy.mockReset()
  })

  it("invokes make-call with normalized E.164 and never writes call_logs", async () => {
    h.makeCall.mockResolvedValue({
      call_log_id: "log-1",
      call_id: "demo_x",
      mode: "demo",
      status: "initiated",
      estimated_completion_seconds: 30,
    })

    const { result } = renderHook(() => useMakeCall(), { wrapper })
    result.current.mutate({ scriptId: VALID_UUID, phoneNumber: "+1 (415) 555-0123" })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(h.makeCall).toHaveBeenCalledWith({
      script_id: VALID_UUID,
      phone_number: "+14155550123",
    })
    expect(h.callLogsWriteSpy).not.toHaveBeenCalled()
    expect(result.current.data?.call_log_id).toBe("log-1")
  })

  it("short-circuits an invalid phone number before hitting the network", async () => {
    const { result } = renderHook(() => useMakeCall(), { wrapper })
    result.current.mutate({ scriptId: VALID_UUID, phoneNumber: "not-a-number" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(h.makeCall).not.toHaveBeenCalled()
    expect(result.current.error?.code).toBe("invalid_request")
  })

  it("surfaces a server 400 (EdgeError) cleanly as an ApiError envelope", async () => {
    const { EdgeError } = await import("@/lib/edge")
    h.makeCall.mockRejectedValue(
      new EdgeError("invalid_request", 400, "Invalid phone number.", false),
    )
    const { result } = renderHook(() => useMakeCall(), { wrapper })
    result.current.mutate({ scriptId: VALID_UUID, phoneNumber: "+14155550123" })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({
      code: "invalid_request",
      message: "Invalid phone number.",
      retryable: false,
    })
  })
})
