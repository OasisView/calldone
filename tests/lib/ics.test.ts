import { describe, it, expect } from "vitest"
import { buildIcs, escapeIcsText } from "@/lib/ics"
import type { Appointment } from "@/lib/demo/types"

const APPOINTMENT: Appointment = {
  title: "Pharmacy pickup — Walgreens",
  startIso: "2026-06-15T14:15:00.000Z",
  endIso: null,
  location: "Walgreens, 5th Ave",
  notes: "Bring ID; ask about refills, please",
}

describe("escapeIcsText", () => {
  it("escapes RFC 5545 special characters", () => {
    expect(escapeIcsText("a,b;c\nd\\e")).toBe("a\\,b\\;c\\nd\\\\e")
  })
})

describe("buildIcs", () => {
  it("produces a structurally valid VCALENDAR with CRLF line endings", () => {
    const ics = buildIcs(APPOINTMENT, { uid: "test-1@calldone.demo" })
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(ics).toContain("BEGIN:VEVENT")
    expect(ics).toContain("END:VEVENT")
    expect(ics).toContain("UID:test-1@calldone.demo")
    expect(ics).toContain("DTSTART:20260615T141500Z")
  })

  it("defaults the end time to 30 minutes after start", () => {
    const ics = buildIcs(APPOINTMENT, { uid: "test-2" })
    expect(ics).toContain("DTEND:20260615T144500Z")
  })

  it("escapes commas and semicolons in text fields", () => {
    const ics = buildIcs(APPOINTMENT, { uid: "test-3" })
    expect(ics).toContain("LOCATION:Walgreens\\, 5th Ave")
    expect(ics).toContain("Bring ID\\; ask about refills\\, please")
  })

  it("respects an explicit end time", () => {
    const ics = buildIcs(
      { ...APPOINTMENT, endIso: "2026-06-15T15:00:00.000Z" },
      { uid: "test-4" }
    )
    expect(ics).toContain("DTEND:20260615T150000Z")
  })
})
