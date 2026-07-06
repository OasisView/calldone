import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

// Capture the payload passed to .update() so we can assert column safety (R9):
// phone_verified_at and other non-writable columns must NEVER be sent.
const updateSpy = vi.fn()

function makeQueryBuilder(row: unknown) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  builder.single = vi.fn(async () => ({ data: row, error: null }))
  builder.update = vi.fn((patch: unknown) => {
    updateSpy(patch)
    return builder
  })
  return builder
}

let currentRow: unknown = null

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    from: vi.fn(() => makeQueryBuilder(currentRow)),
  }),
  isSupabaseConfigured: () => true,
}))

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "user-1" } }),
}))

import { useProfile, useUpdateProfile } from "@/hooks/use-profile"

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  currentRow = {
    id: "user-1",
    display_name: "Alex",
    phone_number: "+14155550123",
    phone_verified_at: null,
    time_zone: "America/New_York",
    communication_style: { style: "friendly" },
    style_summary: null,
    created_at: "now",
    updated_at: "now",
  }
})

describe("useProfile", () => {
  it("reads the caller's own profile row", async () => {
    const { result } = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.display_name).toBe("Alex")
  })
})

describe("useUpdateProfile column safety (R9)", () => {
  it("never sends phone_verified_at even if passed", async () => {
    currentRow = { ...(currentRow as object), display_name: "New Name" }
    const { result } = renderHook(() => useUpdateProfile(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        display_name: "New Name",
        phone_number: "+14155550999",
        // Hostile/erroneous fields that must be stripped:
        phone_verified_at: "2026-01-01T00:00:00Z",
        style_summary: "injected",
        id: "someone-else",
      })
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>
    expect(patch).not.toHaveProperty("phone_verified_at")
    expect(patch).not.toHaveProperty("style_summary")
    expect(patch).not.toHaveProperty("id")
    // Writable columns survive:
    expect(patch).toMatchObject({
      display_name: "New Name",
      phone_number: "+14155550999",
    })
  })

  it("only forwards the four writable columns", async () => {
    const { result } = renderHook(() => useUpdateProfile(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        display_name: "X",
        time_zone: "Europe/London",
        communication_style: { style: "direct" },
        phone_number: null,
      })
    })

    const patch = updateSpy.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(
      ["communication_style", "display_name", "phone_number", "time_zone"].sort(),
    )
  })
})
