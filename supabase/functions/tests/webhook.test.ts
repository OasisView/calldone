// tests/webhook.test.ts — security.md §10 ws/edge #1: provider-webhook auth,
// idempotency, routing, transcript/disclosure recording, transfer destination.
import { assertEquals } from "@std/assert";
import { handler } from "../provider-webhook/index.ts";
import { makeFakeClient, withEnv, TEST_ENV } from "./_helpers.ts";
import { VAPI_SECRET_HEADER } from "../_shared/adapters/vapi.ts";

const SECRET = "whsec_test_1234567890";
const ENV = { ...TEST_ENV, PROVIDER_WEBHOOK_SECRET: SECRET };

const ORG_PHONE = "+12125551111";
const CALLER = "+13475550000";

function seededTables() {
  return {
    phone_numbers: [{ id: "pn1", org_id: "org1", e164: ORG_PHONE }],
    orgs: [{
      id: "org1",
      name: "Harlem Food Pantry",
      notification_email: null, // keep finalize email path off unless a test opts in
      escalation_phone: "+12125552222",
      timezone: "America/New_York",
      calls_enabled: true,
      monthly_minutes_cap: 300,
    }],
    inbound_calls: [] as Record<string, unknown>[],
    call_events: [] as Record<string, unknown>[],
    intake_records: [] as Record<string, unknown>[],
  };
}

function vapiMessage(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    message: {
      call: { id: "call_1", customer: { number: CALLER } },
      phoneNumber: { number: ORG_PHONE },
      timestamp: 1780000000000,
      ...overrides,
    },
  });
}

function post(body: string, secret: string | null = SECRET): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret !== null) headers.set(VAPI_SECRET_HEADER, secret);
  return new Request("http://localhost/provider-webhook", { method: "POST", headers, body });
}

Deno.test("webhook: 401 on missing secret header", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(post(vapiMessage({ type: "status-update", status: "in-progress" }), null));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error.code, "unauthorized");
  });
});

Deno.test("webhook: 401 on wrong secret", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(post(vapiMessage({ type: "status-update" }), "wrong-secret-value"));
    assertEquals(res.status, 401);
  });
});

Deno.test("webhook: 405 on GET", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(new Request("http://localhost/x", { method: "GET" }));
    assertEquals(res.status, 405);
    await res.body?.cancel();
  });
});

Deno.test("webhook: 400 on invalid JSON", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(post("{not json"));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, "invalid_request");
  });
});

Deno.test("webhook: unknown dialed number → 200 processed:false unknown_number", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.phone_numbers = []; // no numbers registered
    const admin = makeFakeClient({ tables });
    const res = await handler(
      post(vapiMessage({ type: "status-update", status: "in-progress" })),
      { admin },
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, { received: true, processed: false, reason: "unknown_number" });
  });
});

Deno.test("webhook: call.started creates the call row", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    const inserted: Record<string, Record<string, unknown>[]> = {};
    const admin = makeFakeClient({ tables, inserted });
    const res = await handler(
      post(vapiMessage({ type: "status-update", status: "in-progress" })),
      { admin },
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.processed, true);
    assertEquals(inserted["inbound_calls"]?.length, 1);
    assertEquals(inserted["inbound_calls"][0].provider_call_id, "call_1");
    assertEquals(inserted["inbound_calls"][0].caller_number, CALLER);
  });
});

Deno.test("webhook: duplicate provider_event_id → already_processed no-op", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.call_events = [{
      id: 1,
      provider: "vapi",
      provider_event_id: "call_1:started",
    }];
    const inserted: Record<string, Record<string, unknown>[]> = {};
    const admin = makeFakeClient({ tables, inserted });
    const res = await handler(
      post(vapiMessage({ type: "status-update", status: "in-progress" })),
      { admin },
    );
    const body = await res.json();
    assertEquals(body, { received: true, processed: false, reason: "already_processed" });
    assertEquals(inserted["inbound_calls"], undefined); // no second row
  });
});

Deno.test("webhook: final transcript with disclosure flips disclosure_played (R28)", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.inbound_calls = [{
      id: "ic1",
      provider: "vapi",
      provider_call_id: "call_1",
      status: "in_progress",
      transcript: [],
      disclosure_played: false,
    }];
    const updated: Record<string, Record<string, unknown>[]> = {};
    const admin = makeFakeClient({ tables, updated });
    const res = await handler(
      post(vapiMessage({
        type: "transcript",
        transcriptType: "final",
        role: "assistant",
        transcript:
          "Hi, thanks for calling Harlem Food Pantry! I'm their virtual assistant — quick heads-up: I'm an AI, and this call may be recorded so I can take accurate notes for the team.",
      })),
      { admin },
    );
    assertEquals((await res.json()).processed, true);
    const patch = updated["inbound_calls"]?.[0];
    assertEquals(patch?.disclosure_played, true);
  });
});

Deno.test("webhook: transfer-destination-request answers with org escalation phone (R26)", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.inbound_calls = [{
      id: "ic1",
      provider: "vapi",
      provider_call_id: "call_1",
      status: "in_progress",
      transcript: [],
      disclosure_played: true,
    }];
    const admin = makeFakeClient({ tables });
    const res = await handler(
      post(vapiMessage({ type: "transfer-destination-request" })),
      { admin },
    );
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.destination, { type: "number", number: "+12125552222" });
  });
});

Deno.test("webhook: call.ended on a terminal row → already_processed (replay-safe)", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.inbound_calls = [{
      id: "ic1",
      provider: "vapi",
      provider_call_id: "call_1",
      status: "completed",
      transcript: [],
      disclosure_played: true,
    }];
    const finalizes: Promise<unknown>[] = [];
    const admin = makeFakeClient({ tables });
    const res = await handler(
      post(vapiMessage({ type: "end-of-call-report", endedReason: "customer-ended-call", durationSeconds: 62 })),
      { admin, waitUntil: (p) => finalizes.push(p) },
    );
    const body = await res.json();
    assertEquals(body.processed, false);
    assertEquals(body.reason, "already_processed");
    assertEquals(finalizes.length, 0); // no post-call pipeline scheduled
  });
});
