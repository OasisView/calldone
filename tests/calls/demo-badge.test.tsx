// security.md §10 ws/calls-ui item 2: is_demo rows ALWAYS render the demo badge
// (no UI state may imply a real call happened). Covered with a snapshot of the
// rendered badge plus presence assertions across both surfaces that show calls.
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { CallLogRow } from "@/components/calls/CallLogRow"
import { CallProgressCard } from "@/components/calls/CallProgressCard"
import type { CallLog } from "@/types/database"

function makeLog(overrides: Partial<CallLog> = {}): CallLog {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "22222222-2222-2222-2222-222222222222",
    script_id: "33333333-3333-3333-3333-333333333333",
    bland_call_id: "demo_abc",
    is_demo: true,
    phone_number_called: "+14155550123",
    status: "completed",
    transcript: null,
    duration_seconds: 42,
    appointment_details: null,
    confirmation_detected: null,
    error_reason: null,
    created_at: "2026-06-01T12:00:00.000Z",
    updated_at: "2026-06-01T12:00:30.000Z",
    ...overrides,
  }
}

describe("demo badge", () => {
  it("CallLogRow renders the demo badge for is_demo rows (snapshot)", () => {
    render(<CallLogRow log={makeLog({ is_demo: true })} onOpen={vi.fn()} />)
    const badge = screen.getByTestId("demo-badge")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("Demo")
    expect(badge).toMatchSnapshot()
  })

  it("CallProgressCard renders the demo badge for is_demo rows (snapshot)", () => {
    render(<CallProgressCard log={makeLog({ is_demo: true })} />)
    const badge = screen.getByTestId("demo-badge")
    expect(badge).toBeInTheDocument()
    expect(badge).toMatchSnapshot()
  })

  it("does NOT render a demo badge when is_demo is false", () => {
    // Defensive: nothing in the slice produces is_demo=false, but if a real call
    // ever appeared its row must not silently inherit the demo badge.
    render(<CallLogRow log={makeLog({ is_demo: false })} onOpen={vi.fn()} />)
    expect(screen.queryByTestId("demo-badge")).not.toBeInTheDocument()
  })
})
