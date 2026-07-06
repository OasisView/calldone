// tests/brain.test.ts — security.md §10 ws/edge #2/#3/#4: agent-brain auth,
// kill switches BEFORE Gemini (R28), disclosure enforcement (R28), deterministic
// escalation (R26), Spanish handoff (R27), Gemini-down → never a 5xx mid-call.
import { assertEquals, assertStringIncludes } from "@std/assert";
import { handler } from "../agent-brain/index.ts";
import { makeFakeClient, stubFetch, withEnv, TEST_ENV } from "./_helpers.ts";
import {
  BRAIN_SECRET_HEADER,
  DISCLOSURE_REQUIRED_SUBSTRINGS,
  SPANISH_HANDOFF_LINE_ES,
} from "../_shared/api-types.ts";

const SECRET = "brainsec_test_1234567890";
const ENV = {
  ...TEST_ENV,
  BRAIN_SECRET: SECRET,
  GEMINI_API_KEY: "test-gemini-key",
  CALLS_ENABLED: "true",
};

const ORG_PHONE = "+12125551111";

function seededTables() {
  return {
    phone_numbers: [{ id: "pn1", org_id: "org1", e164: ORG_PHONE }],
    orgs: [{
      id: "org1",
      name: "Harlem Food Pantry",
      notification_email: "staff@pantry.org",
      escalation_phone: "+12125552222",
      timezone: "America/New_York",
      calls_enabled: true,
      monthly_minutes_cap: 300,
    }],
    inbound_calls: [{
      id: "ic1",
      provider: "vapi",
      provider_call_id: "call_1",
      status: "in_progress",
      transcript: [],
      disclosure_played: false,
    }],
    knowledge_packs: [] as Record<string, unknown>[],
    knowledge_entries: [] as Record<string, unknown>[],
    intake_records: [] as Record<string, unknown>[],
  };
}

function brainBody(messages: Array<{ role: string; content: string | null }>): string {
  return JSON.stringify({
    model: "gpt-4o",
    stream: false,
    messages,
    call: { id: "call_1" },
    phoneNumber: { number: ORG_PHONE },
  });
}

function post(body: string, secret: string | null = SECRET): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret !== null) headers.set(BRAIN_SECRET_HEADER, secret);
  return new Request("http://localhost/agent-brain", { method: "POST", headers, body });
}

function geminiText(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

Deno.test("brain: 401 on missing/wrong secret", async () => {
  await withEnv(ENV, async () => {
    const r1 = await handler(post(brainBody([{ role: "user", content: "hi" }]), null));
    assertEquals(r1.status, 401);
    await r1.body?.cancel();
    const r2 = await handler(post(brainBody([{ role: "user", content: "hi" }]), "nope-wrong"));
    assertEquals(r2.status, 401);
    await r2.body?.cancel();
  });
});

Deno.test("brain: 400 on malformed body (envelope, no echo)", async () => {
  await withEnv(ENV, async () => {
    const res = await handler(post(JSON.stringify({ messages: [] })));
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.error.code, "invalid_request");
  });
});

Deno.test("brain: global kill switch declines + transfers with ZERO Gemini calls (R28)", async () => {
  await withEnv({ ...ENV, CALLS_ENABLED: "false" }, async () => {
    const { fetch: fetchImpl, calls } = stubFetch(() => geminiText("should not be called"));
    const admin = makeFakeClient({ tables: seededTables() });
    const res = await handler(post(brainBody([{ role: "user", content: "hello" }])), {
      admin,
      fetchImpl,
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    const msg = body.choices[0].message;
    assertEquals(msg.tool_calls[0].function.name, "transferCall");
    assertEquals(calls.length, 0); // Gemini never touched
  });
});

Deno.test("brain: per-org kill switch declines (R28)", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.orgs[0].calls_enabled = false;
    const { fetch: fetchImpl, calls } = stubFetch(() => geminiText("x"));
    const admin = makeFakeClient({ tables });
    const res = await handler(post(brainBody([{ role: "user", content: "hello" }])), {
      admin,
      fetchImpl,
    });
    const body = await res.json();
    assertEquals(body.choices[0].message.tool_calls[0].function.name, "transferCall");
    assertEquals(calls.length, 0);
  });
});

Deno.test("brain: monthly minutes cap reached declines (R28)", async () => {
  await withEnv(ENV, async () => {
    const { fetch: fetchImpl, calls } = stubFetch(() => geminiText("x"));
    const admin = makeFakeClient({
      tables: seededTables(),
      rpcCounts: { usage_add_minutes: 300 }, // == cap
    });
    const res = await handler(post(brainBody([{ role: "user", content: "hello" }])), {
      admin,
      fetchImpl,
    });
    const body = await res.json();
    assertEquals(body.choices[0].message.tool_calls[0].function.name, "transferCall");
    assertEquals(calls.length, 0);
  });
});

Deno.test("brain: first-turn disclosure is enforced in code (R28)", async () => {
  await withEnv(ENV, async () => {
    // Model "forgets" the disclosure entirely.
    const { fetch: fetchImpl } = stubFetch(() => geminiText("Hello! How can I help you today?"));
    const admin = makeFakeClient({ tables: seededTables() });
    const res = await handler(post(brainBody([{ role: "user", content: "hi" }])), {
      admin,
      fetchImpl,
    });
    const body = await res.json();
    const content: string = body.choices[0].message.content;
    for (const required of DISCLOSURE_REQUIRED_SUBSTRINGS) {
      assertStringIncludes(content.toLowerCase(), required.toLowerCase());
    }
    assertStringIncludes(content, "Harlem Food Pantry");
  });
});

Deno.test("brain: caller saying 'person' triggers deterministic transfer (R26)", async () => {
  await withEnv(ENV, async () => {
    const { fetch: fetchImpl, calls } = stubFetch(() => geminiText("x"));
    const admin = makeFakeClient({ tables: seededTables() });
    const res = await handler(
      post(brainBody([
        { role: "assistant", content: "Hi, I'm an AI and this call may be recorded." },
        { role: "user", content: "Can I just talk to a person please" },
      ])),
      { admin, fetchImpl },
    );
    const body = await res.json();
    assertEquals(body.choices[0].message.tool_calls[0].function.name, "transferCall");
    assertEquals(calls.length, 0); // code-level, no model needed
  });
});

Deno.test("brain: DTMF 0 triggers transfer (R26)", async () => {
  await withEnv(ENV, async () => {
    const { fetch: fetchImpl } = stubFetch(() => geminiText("x"));
    const admin = makeFakeClient({ tables: seededTables() });
    const res = await handler(
      post(brainBody([
        { role: "assistant", content: "Hi, I'm an AI and this call may be recorded." },
        { role: "user", content: "0" },
      ])),
      { admin, fetchImpl },
    );
    const body = await res.json();
    assertEquals(body.choices[0].message.tool_calls[0].function.name, "transferCall");
  });
});

Deno.test("brain: Spanish caller gets the exact handoff line then escalation (R27)", async () => {
  await withEnv(ENV, async () => {
    const { fetch: fetchImpl, calls } = stubFetch(() => geminiText("x"));
    const admin = makeFakeClient({ tables: seededTables() });
    const res = await handler(
      post(brainBody([
        { role: "assistant", content: "Hi, I'm an AI and this call may be recorded." },
        { role: "user", content: "Hola, necesito ayuda por favor, ¿habla español?" },
      ])),
      { admin, fetchImpl },
    );
    const body = await res.json();
    assertEquals(body.choices[0].message.content, SPANISH_HANDOFF_LINE_ES);
    assertEquals(body.choices[0].message.tool_calls[0].function.name, "transferCall");
    assertEquals(calls.length, 0);
  });
});

Deno.test("brain: Gemini down after retries → fixed line + transfer, never 5xx", async () => {
  await withEnv(ENV, async () => {
    const { fetch: fetchImpl } = stubFetch(() =>
      new Response("upstream exploded", { status: 500 })
    );
    const admin = makeFakeClient({ tables: seededTables() });
    const res = await handler(
      post(brainBody([
        { role: "assistant", content: "Hi, I'm an AI and this call may be recorded." },
        { role: "user", content: "what are your hours?" },
      ])),
      { admin, fetchImpl },
    );
    assertEquals(res.status, 200); // never a 5xx mid-call
    const body = await res.json();
    assertEquals(body.choices[0].message.tool_calls[0].function.name, "transferCall");
    assertStringIncludes(body.choices[0].message.content, "trouble");
  });
});

Deno.test("brain: normal turn answers from the published knowledge pack", async () => {
  await withEnv(ENV, async () => {
    const tables = seededTables();
    tables.knowledge_packs = [{ id: "kp1", org_id: "org1", status: "published" }];
    tables.knowledge_entries = [{
      pack_id: "kp1",
      org_id: "org1",
      question: "What are your hours?",
      answer: "Tuesdays and Thursdays 10am to 2pm.",
      position: 0,
    }];
    let sawKb = false;
    const { fetch: fetchImpl } = stubFetch((_url, init) => {
      const reqBody = JSON.parse(String(init?.body ?? "{}"));
      const system = reqBody?.systemInstruction?.parts?.[0]?.text ?? "";
      sawKb = system.includes("Tuesdays and Thursdays 10am to 2pm.");
      return geminiText("We're open Tuesdays and Thursdays, 10 to 2!");
    });
    const admin = makeFakeClient({ tables });
    const res = await handler(
      post(brainBody([
        { role: "assistant", content: "Hi, I'm an AI and this call may be recorded." },
        { role: "user", content: "what are your hours?" },
      ])),
      { admin, fetchImpl },
    );
    const body = await res.json();
    assertEquals(sawKb, true); // KB text reached the system prompt
    assertStringIncludes(body.choices[0].message.content, "Tuesdays");
  });
});
