// tests/intake-consent.test.ts — security.md §10 ws/edge #5 (R23): callback
// enqueue happens ONLY with explicit consent; provenance fields recorded; zod
// rejects malformed tool args.
import { assertEquals, assertExists } from "@std/assert";
import { bookAppointment, captureIntake } from "../_shared/intake.ts";
import { makeFakeClient } from "./_helpers.ts";

const CTX = { orgId: "org1", callId: "ic1", callerNumber: "+13475550000" };

function freshTables() {
  return {
    intake_records: [] as Record<string, unknown>[],
    callback_queue: [] as Record<string, unknown>[],
  };
}

Deno.test("intake: consent=false saves intake but enqueues NO callback (R23)", async () => {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const admin = makeFakeClient({ tables: freshTables(), inserted });
  const out = await captureIntake(admin, CTX, {
    caller_name: "Rosa",
    need: "Food pantry hours",
    callback_number: "+13475550000",
    callback_consent: false,
    preferred_time: null,
  });
  assertEquals(out.ok, true);
  assertEquals(inserted["intake_records"]?.length, 1);
  assertEquals(inserted["intake_records"][0].callback_consent, false);
  assertEquals(inserted["callback_queue"], undefined); // nothing enqueued
});

Deno.test("intake: consent=true enqueues callback with provenance (R23)", async () => {
  const tables = freshTables();
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const admin = makeFakeClient({ tables, inserted });
  const out = await captureIntake(admin, CTX, {
    caller_name: "Rosa",
    need: "Volunteer signup question",
    callback_number: "+13475550000",
    callback_consent: true,
    preferred_time: "afternoons",
  });
  assertEquals(out.ok, true);
  const q = inserted["callback_queue"]?.[0];
  assertExists(q);
  assertEquals(q.consent_call_id, "ic1");
  assertEquals(q.callback_number, "+13475550000");
  assertExists(q.consent_recorded_at); // provenance survives retention purges
});

Deno.test("intake: consent=true without any number enqueues nothing", async () => {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const admin = makeFakeClient({ tables: freshTables(), inserted });
  const out = await captureIntake(
    admin,
    { ...CTX, callerNumber: null }, // withheld caller id, none provided
    { need: "General question", callback_number: null, callback_consent: true },
  );
  assertEquals(out.ok, true);
  assertEquals(inserted["callback_queue"], undefined);
});

Deno.test("intake: malformed args are rejected by zod (no write)", async () => {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const admin = makeFakeClient({ tables: freshTables(), inserted });
  const out = await captureIntake(admin, CTX, {
    need: "x",
    callback_number: "555-1234", // not E.164
    callback_consent: true,
  });
  assertEquals(out.ok, false);
  assertEquals(inserted["intake_records"], undefined);
});

Deno.test("intake: second capture updates the same record (no duplicate rows)", async () => {
  const tables = freshTables();
  tables.intake_records = [{
    id: "ir1",
    call_id: "ic1",
    org_id: "org1",
    callback_consent: false,
  }];
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const updated: Record<string, Record<string, unknown>[]> = {};
  const admin = makeFakeClient({ tables, inserted, updated });
  const out = await captureIntake(admin, CTX, {
    need: "Updated need",
    callback_consent: false,
  });
  assertEquals(out.ok, true);
  assertEquals(inserted["intake_records"], undefined); // updated, not inserted
  assertEquals(updated["intake_records"]?.length, 1);
});

Deno.test("appointment: valid ISO writes AppointmentDetails onto the intake", async () => {
  const tables = freshTables();
  tables.intake_records = [{ id: "ir1", call_id: "ic1", org_id: "org1" }];
  const updated: Record<string, Record<string, unknown>[]> = {};
  const admin = makeFakeClient({ tables, updated });
  const out = await bookAppointment(admin, CTX, {
    title: "Volunteer orientation",
    start_iso: "2026-07-15T14:00:00-04:00",
    end_iso: null,
    location: "Front desk",
  });
  assertEquals(out.ok, true);
  const appt = updated["intake_records"]?.[0]?.appointment as { title: string };
  assertEquals(appt.title, "Volunteer orientation");
});

Deno.test("appointment: invalid datetime rejected", async () => {
  const admin = makeFakeClient({ tables: freshTables() });
  const out = await bookAppointment(admin, CTX, {
    title: "x",
    start_iso: "next tuesday",
    end_iso: null,
    location: null,
  });
  assertEquals(out.ok, false);
});
