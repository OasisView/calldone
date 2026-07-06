// RFC 5545 escaping + structure (security.md §10 ws/edge — shared ics module is
// unit-tested here; calls-ui consumes the same builder via the re-export, R18).
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { buildIcs, escapeIcsText } from "../_shared/ics.ts";
import type { AppointmentDetails } from "../_shared/api-types.ts";

Deno.test("escapeIcsText escapes backslash, comma, semicolon, newline", () => {
  assertEquals(escapeIcsText("a\\b"), "a\\\\b");
  assertEquals(escapeIcsText("a,b"), "a\\,b");
  assertEquals(escapeIcsText("a;b"), "a\\;b");
  assertEquals(escapeIcsText("a\nb"), "a\\nb");
  assertEquals(escapeIcsText("a\r\nb"), "a\\nb");
});

Deno.test("escapeIcsText escapes backslash before the chars it inserts (no double-escape)", () => {
  // A literal comma must become \, and a literal backslash \\ — order matters.
  assertEquals(escapeIcsText("\\,"), "\\\\\\,");
});

const appt: AppointmentDetails = {
  title: "Pharmacy pickup, Walgreens; main counter",
  start_iso: "2026-06-16T14:15:00-04:00",
  end_iso: null,
  location: "5th Street",
  notes: "Bring ID\nAsk for pharmacist",
  confidence: 0.9,
};

Deno.test("buildIcs produces a CRLF VCALENDAR with VEVENT and escaped TEXT", () => {
  const ics = buildIcs(appt, { uid: "log-1@calldone.app" });
  assert(ics.includes("\r\n"), "uses CRLF");
  assertStringIncludes(ics, "BEGIN:VCALENDAR");
  assertStringIncludes(ics, "VERSION:2.0");
  assertStringIncludes(ics, "BEGIN:VEVENT");
  assertStringIncludes(ics, "END:VEVENT");
  assertStringIncludes(ics, "END:VCALENDAR");
  assertStringIncludes(ics, "UID:log-1@calldone.app");
  // Escaped SUMMARY (comma + semicolon).
  assertStringIncludes(ics, "Pharmacy pickup\\, Walgreens\\; main counter");
  // Escaped DESCRIPTION newline.
  assertStringIncludes(ics, "Bring ID\\nAsk for pharmacist");
});

Deno.test("buildIcs end_iso null => start + 30 min (UTC basic format)", () => {
  const ics = buildIcs(appt, { uid: "x" });
  // start 14:15-04:00 => 18:15Z; +30min => 18:45Z
  assertStringIncludes(ics, "DTSTART:20260616T181500Z");
  assertStringIncludes(ics, "DTEND:20260616T184500Z");
});

Deno.test("buildIcs honors explicit end_iso", () => {
  const ics = buildIcs(
    { ...appt, end_iso: "2026-06-16T15:00:00-04:00" },
    { uid: "x" },
  );
  assertStringIncludes(ics, "DTEND:20260616T190000Z");
});

Deno.test("buildIcs omits LOCATION/DESCRIPTION when null", () => {
  const ics = buildIcs(
    { ...appt, location: null, notes: null },
    { uid: "x" },
  );
  assert(!ics.includes("LOCATION:"));
  assert(!ics.includes("DESCRIPTION:"));
});

Deno.test("buildIcs folds long lines to <=75 octets with leading-space continuations", () => {
  const longTitle = "X".repeat(200);
  const ics = buildIcs({ ...appt, title: longTitle }, { uid: "x" });
  for (const line of ics.split("\r\n")) {
    assert(
      new TextEncoder().encode(line).length <= 75,
      `line too long: ${line.length}`,
    );
  }
});
