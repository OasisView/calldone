// frontend.md §3.1 / R8: useUpdateScript updates call_scripts and ALSO appends a
// script_edit_events row ONLY when !isAnonymous and the text actually changed.
// Anonymous callers update call_scripts only (RLS would block the event anyway).
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import React from "react"

let sessionValue = { user: { id: "user-1" }, isAnonymous: false }
vi.mock("@/hooks/use-session", () => ({
  useSession: () => sessionValue,
}))

// Track inserts into script_edit_events.
const editEventInserts: unknown[] = []
const current = {
  id: "script-1",
  user_id: "user-1",
  script_text: "old text",
  call_purpose: "demo",
  source: "brainstorm",
  brainstorm_session_id: null,
  is_favorite: false,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
}

vi.mock("@/lib/supabase", () => {
  return {
    getSupabase: () => ({
      from: (table: string) => {
        if (table === "call_scripts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { ...current }, error: null }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: { ...current, ...patch },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === "script_edit_events") {
          return {
            insert: async (row: unknown) => {
              editEventInserts.push(row)
              return { error: null }
            },
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }),
  }
})

import { useUpdateScript } from "@/hooks/use-scripts"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client }, children)
}

describe("useUpdateScript (R8 edit-event rule)", () => {
  beforeEach(() => {
    editEventInserts.length = 0
    sessionValue = { user: { id: "user-1" }, isAnonymous: false }
  })

  it("appends a script_edit_events row for a full (non-anonymous) account when text changes", async () => {
    const { result } = renderHook(() => useUpdateScript(), { wrapper })
    result.current.mutate({ scriptId: "script-1", scriptText: "new text" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(editEventInserts).toHaveLength(1)
    expect(editEventInserts[0]).toMatchObject({
      script_id: "script-1",
      original_text: "old text",
      edited_text: "new text",
    })
  })

  it("does NOT append an edit event for anonymous callers (R8)", async () => {
    sessionValue = { user: { id: "anon-1" }, isAnonymous: true }
    const { result } = renderHook(() => useUpdateScript(), { wrapper })
    result.current.mutate({ scriptId: "script-1", scriptText: "new text" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(editEventInserts).toHaveLength(0)
  })

  it("does NOT append an edit event when the text is unchanged", async () => {
    const { result } = renderHook(() => useUpdateScript(), { wrapper })
    result.current.mutate({ scriptId: "script-1", scriptText: "old text" })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(editEventInserts).toHaveLength(0)
  })
})
