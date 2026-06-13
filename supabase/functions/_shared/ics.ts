// supabase/functions/_shared/ics.ts
// Frozen-signature stub (R18, api.md §2.3). Orchestrator stubs the signature at
// baseline; ws/edge implements buildIcs()/escapeIcsText(). MUST stay
// dependency-free and browser-safe TS (no Deno.*, no imports beyond api-types) —
// the Vite app re-exports this module via src/lib/ics.ts so AppointmentCard can
// build the download client-side from call_logs.appointment_details, and the
// call-webhook email path uses the same code (one shared, unit-tested impl).
import type { AppointmentDetails } from "./api-types.ts";

/** Builds a complete RFC 5545 VCALENDAR string (CRLF line endings, proper
 *  TEXT escaping of , ; \ and newlines; end_iso null => start + 30 min). */
export function buildIcs(
  _appointment: AppointmentDetails,
  _opts: { uid: string; organizerName?: string },
): string {
  throw new Error("not implemented: ws/edge");
}

/** Escapes a single RFC 5545 TEXT value (backslash, comma, semicolon, newline). */
export function escapeIcsText(_value: string): string {
  throw new Error("not implemented: ws/edge");
}
