// frontend.md §3.1 / R5 / R17: useCallLog reads a single call_logs row via the
// user-scoped client (SELECT only — no client write of call_logs) and, when
// polling, stops on terminal status / times out at LIMITS.POLL_TIMEOUT_MS into a
// retryable error. Covers the terminal-status helper and the read-only / no-write
// guarantee.
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import React from "react"
import { TERMINAL_CALL_STATUSES, CALL_STATUSES } from "@/types/api"

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "user-1" }, isAnonymous: false }),
}))

// Records every PostgREST verb touched on call_logs so we can assert read-only.
const verbs: string[] = []
let rowToReturn: Record<string, unknown> | null = null
vi.mock("@/lib/supabase", () => {
  function builder() {
    const chain = {
      select: (..._a: unknown[]) => {
        verbs.push("select")
        return chain
      },
      order: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: rowToReturn, error: null }),
      then: undefined,
    }
    return chain
  }
  return {
    getSupabase: () => ({
      from: (table: string) => {
        if (table === "call_logs") {
          return new Proxy(builder(), {
            get(target, prop) {
              if (["insert", "update", "upsert", "delete"].includes(String(prop))) {
                verbs.push(String(prop))
                throw new Error(`forbidden client write call_logs.${String(prop)}`)
              }
              return (target as Record<string, unknown>)[String(prop)]
            },
          })
        }
        return builder()
      },
    }),
  }
})

import { useCallLog, isTerminalCallStatus } from "@/hooks/use-call-logs"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe("isTerminalCallStatus", () => {
  it("matches exactly the api-types TERMINAL_CALL_STATUSES set", () => {
    for (const s of CALL_STATUSES) {
      expect(isTerminalCallStatus(s)).toBe(
        (TERMINAL_CALL_STATUSES as readonly string[]).includes(s),
      )
    }
    expect(isTerminalCallStatus("initiated")).toBe(false)
    expect(isTerminalCallStatus("ringing")).toBe(false)
    expect(isTerminalCallStatus("completed")).toBe(true)
  })
})

describe("useCallLog", () => {
  beforeEach(() => {
    verbs.length = 0
    rowToReturn = null
  })

  it("reads call_logs via SELECT only — never a write verb", async () => {
    rowToReturn = { id: "log-1", status: "completed", is_demo: true }
    const { result } = renderHook(() => useCallLog("log-1", { poll: true }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(verbs).toContain("select")
    expect(verbs).not.toContain("insert")
    expect(verbs).not.toContain("update")
    expect(verbs).not.toContain("upsert")
    expect(verbs).not.toContain("delete")
    expect(result.current.data?.status).toBe("completed")
  })

  it("returns null for a missing / unowned row", async () => {
    rowToReturn = null
    const { result } = renderHook(() => useCallLog("missing", { poll: false }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
