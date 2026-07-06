// supabase/functions/_shared/ics.ts
// Frozen-signature module (R18, api.md §2.3). Orchestrator stubs the signature at
// baseline; ws/edge implements buildIcs()/escapeIcsText(). MUST stay
// dependency-free and browser-safe TS (no Deno.*, no imports beyond api-types) —
// the Vite app re-exports this module via src/lib/ics.ts so AppointmentCard can
// build the download client-side from call_logs.appointment_details, and the
// call-webhook email path uses the same code (one shared, unit-tested impl).
import type { AppointmentDetails } from "./api-types.ts";

const ICS_DEFAULT_DURATION_MS = 30 * 60 * 1000; // end_iso null => start + 30 min

/** Escapes a single RFC 5545 TEXT value (backslash, comma, semicolon, newline).
 *  Order matters: backslash first so we do not double-escape the escapes we add. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 UTC timestamp: YYYYMMDDTHHMMSSZ (basic format, no separators). */
function toIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(date.getUTCFullYear()).padStart(4, "0") +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

/** Folds a content line to <=75 octets per RFC 5545 §3.1 (continuation lines
 *  begin with a single space). We fold conservatively on octet count using a
 *  UTF-8 byte measure so multi-byte chars are never split mid-sequence. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line budget 75 octets; continuation lines budget 74 (1 octet for the
  // leading space).
  let budget = 75;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > budget) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      budget = 74;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current.length > 0 || out.length === 0) out.push(current);
  return out.map((seg, i) => (i === 0 ? seg : " " + seg)).join("\r\n");
}

/** Builds a complete RFC 5545 VCALENDAR string (CRLF line endings, proper
 *  TEXT escaping of , ; \ and newlines; end_iso null => start + 30 min). */
export function buildIcs(
  appointment: AppointmentDetails,
  opts: { uid: string; organizerName?: string },
): string {
  const start = new Date(appointment.start_iso);
  const end = appointment.end_iso
    ? new Date(appointment.end_iso)
    : new Date(start.getTime() + ICS_DEFAULT_DURATION_MS);

  const dtStamp = toIcsUtc(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calldone//Call Assistant//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(opts.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(appointment.title)}`,
  ];

  if (appointment.location !== null && appointment.location !== "") {
    lines.push(`LOCATION:${escapeIcsText(appointment.location)}`);
  }
  if (appointment.notes !== null && appointment.notes !== "") {
    lines.push(`DESCRIPTION:${escapeIcsText(appointment.notes)}`);
  }
  if (opts.organizerName) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(opts.organizerName)}:mailto:noreply@calldone.app`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  // Fold every line, join with CRLF, terminate with a trailing CRLF.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
