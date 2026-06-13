// security.md §10 ws/calls-ui item 5: the .ics download is generated CLIENT-SIDE
// from call_logs.appointment_details via the SHARED module src/lib/ics.ts
// (re-export of supabase/functions/_shared/ics.ts, R18). RFC 5545 escaping is
// owned + unit-tested INSIDE that shared module by ws/edge; here we assert the
// WIRING — AppointmentCard calls buildIcs with the correct args per its frozen
// signature buildIcs(appointment, { uid, organizerName? }) — because the shared
// builder body still throws "not implemented" in this baseline (lands w/ ws/edge
// at integration). We also prove the card degrades gracefully until then.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { AppointmentDetails } from "@/types/api"

// Mock the shared single-source builder so we can observe the call wiring
// without depending on the not-yet-implemented body.
const buildIcs = vi.fn()
vi.mock("@/lib/ics", () => ({
  buildIcs: (...args: unknown[]) => buildIcs(...args),
}))

import { AppointmentCard } from "@/components/calls/AppointmentCard"

const appointment: AppointmentDetails = {
  title: "Pharmacy pickup — Walgreens",
  start_iso: "2026-06-20T15:00:00-07:00",
  end_iso: null,
  location: "123 Main St",
  notes: "Bring ID; mention, e.g. the\nrefill",
  confidence: 0.9,
}

describe("AppointmentCard .ics wiring", () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    buildIcs.mockReset()
    createObjectURL = vi.fn(() => "blob:mock")
    revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
    // jsdom doesn't implement real navigation from anchor.click(); stub it so the
    // download wiring runs without emitting a "navigation not implemented" error.
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it("calls the SHARED buildIcs with (appointment, { uid, organizerName }) on download", () => {
    buildIcs.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR")
    render(
      <AppointmentCard appointment={appointment} uid="call-log-id-1" organizerName="Sam" />,
    )

    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }))

    expect(buildIcs).toHaveBeenCalledTimes(1)
    expect(buildIcs).toHaveBeenCalledWith(appointment, {
      uid: "call-log-id-1",
      organizerName: "Sam",
    })
    // Built client-side into a text/calendar blob and offered as a download.
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain("text/calendar")
    // Object URL is revoked after triggering the download (no leak).
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock")
  })

  it("passes organizerName undefined when not provided (still correct args)", () => {
    buildIcs.mockReturnValue("BEGIN:VCALENDAR\r\nEND:VCALENDAR")
    render(<AppointmentCard appointment={appointment} uid="call-log-id-2" />)
    fireEvent.click(screen.getByRole("button", { name: /add to calendar/i }))
    expect(buildIcs).toHaveBeenCalledWith(appointment, {
      uid: "call-log-id-2",
      organizerName: undefined,
    })
  })

  it("degrades gracefully while the shared builder throws 'not implemented'", () => {
    // The baseline supabase/functions/_shared/ics.ts buildIcs() throws until
    // ws/edge lands the body — the card must not crash the page.
    buildIcs.mockImplementation(() => {
      throw new Error("not implemented: ws/edge")
    })
    render(<AppointmentCard appointment={appointment} uid="call-log-id-3" />)
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /add to calendar/i })),
    ).not.toThrow()
    // No blob produced because the shared builder failed.
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it("flags low-confidence extractions as unconfirmed", () => {
    render(
      <AppointmentCard
        appointment={{ ...appointment, confidence: 0.4 }}
        uid="call-log-id-4"
      />,
    )
    expect(screen.getByText(/unconfirmed/i)).toBeInTheDocument()
  })
})
