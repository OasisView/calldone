// Appointment → RFC 5545 iCalendar string. Pure TS, browser-safe. The paid
// upgrade reuses this exact signature from the call-webhook email path.

import type { Appointment } from "./demo/types"

const DEFAULT_DURATION_MS = 30 * 60 * 1000

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

export interface BuildIcsOptions {
  uid: string
  organizerName?: string
}

export function buildIcs(appointment: Appointment, opts: BuildIcsOptions): string {
  const start = appointment.startIso
  const end =
    appointment.endIso ??
    new Date(new Date(appointment.startIso).getTime() + DEFAULT_DURATION_MS).toISOString()

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calldone//Demo//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(opts.uid)}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(appointment.title)}`,
  ]
  if (appointment.location) lines.push(`LOCATION:${escapeIcsText(appointment.location)}`)
  const description = [
    appointment.notes,
    opts.organizerName ? `Arranged by ${opts.organizerName} via Calldone.` : "Arranged via Calldone.",
  ]
    .filter(Boolean)
    .join(" ")
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
  lines.push("END:VEVENT", "END:VCALENDAR")
  return lines.join("\r\n") + "\r\n"
}

/** Trigger a browser download of the .ics file. */
export function downloadIcs(appointment: Appointment, opts: BuildIcsOptions): void {
  const blob = new Blob([buildIcs(appointment, opts)], {
    type: "text/calendar;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "calldone-appointment.ics"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
