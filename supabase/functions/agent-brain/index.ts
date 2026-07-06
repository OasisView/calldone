// supabase/functions/agent-brain/index.ts
// The conversation brain (api.md §4): Vapi custom-LLM calls this per turn as an
// OpenAI-compatible chat.completions endpoint. Auth = BRAIN_SECRET header
// (constant-time). Kill switches (R28) run BEFORE any Gemini call. Escalation
// (R26) and Spanish handoff (R27) have deterministic code-level triggers in
// addition to the prompt. The first utterance's disclosure is enforced in code
// (R28) — never by model compliance.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BRAIN_SECRET_HEADER,
  LIMITS,
  RATE_LIMITS,
  SPANISH_HANDOFF_LINE_ES,
} from "../_shared/api-types.ts";
import {
  completionJson,
  completionSse,
  endCallToolCall,
  extractBrainContext,
  transferToolCall,
  type CompletionOpts,
} from "../_shared/adapters/vapi.ts";
import { routeOrg, type OrgRoute } from "../_shared/call-events.ts";
import { jsonError } from "../_shared/errors.ts";
import {
  AGENT_TOOL_DECLS,
  geminiGenerate,
  type GeminiContent,
} from "../_shared/gemini.ts";
import { bookAppointment, captureIntake, type IntakeContext } from "../_shared/intake.ts";
import { loadPublishedPack } from "../_shared/kb.ts";
import {
  buildSystemPrompt,
  disclosureGreeting,
  ensureDisclosure,
  looksSpanish,
  wantsHuman,
} from "../_shared/prompts.ts";
import { enforceRateLimits, rateLimitHeaders } from "../_shared/rate-limit.ts";
import { secureEquals } from "../_shared/secure-compare.ts";
import { brainRequestSchema, type BrainRequest } from "../_shared/schemas.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

export interface BrainDeps {
  admin?: SupabaseClient;
  fetchImpl?: typeof fetch;
}

/** Fixed lines (plain speech; disclosure handled separately). */
const DECLINE_LINE =
  "Thanks for calling! Our virtual assistant is offline at the moment — let me connect you with the team.";
const GEMINI_DOWN_LINE =
  "I'm so sorry — I'm having trouble on my end. Let me connect you with a member of the team.";

function respond(body: BrainRequest, opts: CompletionOpts, headers?: Headers): Response {
  const resp = body.stream === false ? completionJson(opts) : completionSse(opts);
  if (headers) headers.forEach((v, k) => resp.headers.set(k, v));
  return resp;
}

/** True when this is the FIRST agent turn of the call (no assistant content yet). */
function isFirstAssistantTurn(body: BrainRequest): boolean {
  return !body.messages.some((m) => m.role === "assistant" && (m.content ?? "") !== "");
}

function lastUserUtterance(body: BrainRequest): string {
  for (let i = body.messages.length - 1; i >= 0; i--) {
    const m = body.messages[i];
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

/** OpenAI messages → Gemini contents (system handled separately; tool messages
 *  folded into user context — good enough for per-turn regeneration). */
function toGeminiContents(body: BrainRequest): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const m of body.messages) {
    if (m.role === "system" || (m.content ?? "") === "") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content as string }],
    });
  }
  // Gemini requires the last content to be user; guard for odd orderings.
  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    contents.push({ role: "user", parts: [{ text: "(caller is silent)" }] });
  }
  return contents;
}

export async function handler(req: Request, deps: BrainDeps = {}): Promise<Response> {
  if (req.method !== "POST") return jsonError("method_not_allowed", "POST only");

  const secret = Deno.env.get("BRAIN_SECRET") ?? "";
  if (secret === "" || !secureEquals(req.headers.get(BRAIN_SECRET_HEADER), secret)) {
    return jsonError("unauthorized", "invalid brain credentials");
  }

  const raw = await req.text();
  if (raw.length > LIMITS.BRAIN_BODY_MAX_BYTES) {
    return jsonError("payload_too_large", "body exceeds limit");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return jsonError("invalid_request", "body is not valid JSON");
  }
  const parsed = brainRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return jsonError("invalid_request", "malformed chat body");
  }
  const body = parsed.data;

  const admin = deps.admin ?? createAdminClient();
  const fetchImpl = deps.fetchImpl ?? fetch;

  const ctx = extractBrainContext(body as unknown as Record<string, unknown>);
  if (!ctx.provider_call_id || !ctx.org_phone_e164) {
    return jsonError("invalid_request", "missing call metadata");
  }

  // Per-call turn flood guard.
  const verdict = await enforceRateLimits(admin, [{
    ...RATE_LIMITS.brainTurnsPerCall,
    key: ctx.provider_call_id,
  }]);
  if (!verdict.allowed) {
    return jsonError("rate_limited", "turn limit reached", {
      headers: rateLimitHeaders(verdict),
    });
  }

  const route = await routeOrg(admin, ctx.org_phone_e164);
  if (!route) return jsonError("not_found", "unknown number");

  const escalationAvailable = route.escalationPhone !== null;
  const escalate = (line: string): Response =>
    respond(body, {
      content: line,
      toolCalls: [escalationAvailable ? transferToolCall() : endCallToolCall()],
    });

  // ---- R28 kill switches — BEFORE any Gemini call ----
  const globalOff = (Deno.env.get("CALLS_ENABLED") ?? "true").toLowerCase() === "false";
  let capReached = false;
  if (!globalOff && route.callsEnabled) {
    const { data: used } = await admin.rpc("usage_add_minutes", {
      p_org: route.orgId,
      p_minutes: 0,
    });
    const usedNum = typeof used === "number" ? used : Number(used ?? 0);
    capReached = usedNum >= route.monthlyMinutesCap;
  }
  if (globalOff || !route.callsEnabled || capReached) {
    return escalate(DECLINE_LINE);
  }

  const firstTurn = isFirstAssistantTurn(body);
  const utterance = lastUserUtterance(body);

  // ---- R26/R27 deterministic triggers — code-level, before the model ----
  if (!firstTurn && wantsHuman(utterance)) {
    return escalate(
      escalationAvailable
        ? "Of course — one moment while I connect you with a member of the team."
        : "Of course — no one is available right this second, so I'll take a message after the tone.",
    );
  }
  if (!firstTurn && looksSpanish(utterance)) {
    return escalate(SPANISH_HANDOFF_LINE_ES);
  }

  // ---- Normal turn: Gemini with tools, tool loop ≤ 3 ----
  const kbText = await loadPublishedPack(admin, route.orgId);
  const system = buildSystemPrompt({
    orgName: route.orgName,
    kbText,
    timezone: route.timezone,
    escalationAvailable,
  });
  const intakeCtx: IntakeContext = {
    orgId: route.orgId,
    callId: await ensureCallRowId(admin, ctx.provider_call_id, route),
    callerNumber: null,
  };

  const contents = toGeminiContents(body);
  let finalText: string | null = null;
  const controlCalls: Record<string, unknown>[] = [];

  try {
    for (let hop = 0; hop < 3; hop++) {
      const res = await geminiGenerate(
        { systemInstruction: system, contents, tools: AGENT_TOOL_DECLS },
        fetchImpl,
      );
      if (res.functionCalls.length === 0) {
        finalText = res.text ?? "";
        break;
      }
      // Execute tools; provider-control tools end the loop.
      const responses: GeminiContent = { role: "user", parts: [] };
      let control = false;
      for (const fc of res.functionCalls) {
        if (fc.name === "capture_intake") {
          const out = await captureIntake(admin, intakeCtx, fc.args);
          responses.parts.push({
            functionResponse: { name: fc.name, response: { result: out.message } },
          });
        } else if (fc.name === "book_appointment") {
          const out = await bookAppointment(admin, intakeCtx, fc.args);
          responses.parts.push({
            functionResponse: { name: fc.name, response: { result: out.message } },
          });
        } else if (fc.name === "request_transfer" || fc.name === "take_voicemail") {
          controlCalls.push(escalationAvailable ? transferToolCall() : endCallToolCall());
          finalText = res.text ??
            "One moment while I connect you with a member of the team.";
          control = true;
        } else if (fc.name === "end_call") {
          controlCalls.push(endCallToolCall());
          finalText = res.text ?? "Thanks so much for calling — goodbye!";
          control = true;
        }
      }
      if (control) break;
      if (responses.parts.length === 0) {
        finalText = res.text ?? "";
        break;
      }
      // Feed tool results back for the model's spoken follow-up.
      contents.push({
        role: "model",
        parts: res.functionCalls.map((fc) => ({
          functionCall: { name: fc.name, args: fc.args },
        })),
      });
      contents.push(responses);
      finalText = res.text; // may be replaced next hop
    }
  } catch {
    // Gemini down after retries: fixed line + escalation — never a 5xx mid-call.
    return escalate(GEMINI_DOWN_LINE);
  }

  let content = (finalText ?? "").trim();
  if (content === "" && controlCalls.length === 0) {
    content = "I'm sorry, could you say that again?";
  }
  // R28: the first agent utterance always carries the warm disclosure.
  if (firstTurn) {
    content = content === ""
      ? disclosureGreeting(route.orgName)
      : ensureDisclosure(content, route.orgName);
  }

  return respond(body, { content: content === "" ? null : content, toolCalls: controlCalls });
}

/** Ensures the inbound_calls row exists for tool writes even when the webhook's
 *  call.started hasn't landed yet (races are normal); returns its id. */
async function ensureCallRowId(
  admin: SupabaseClient,
  providerCallId: string,
  route: OrgRoute,
): Promise<string> {
  const { data: existing } = await admin
    .from("inbound_calls")
    .select("id")
    .eq("provider", "vapi")
    .eq("provider_call_id", providerCallId)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created } = await admin.from("inbound_calls").insert({
    org_id: route.orgId,
    phone_number_id: route.phoneNumberId,
    provider: "vapi",
    provider_call_id: providerCallId,
  }).select("id").single();
  if (created) return (created as { id: string }).id;
  // Concurrent insert by the webhook — re-read.
  const { data: again } = await admin
    .from("inbound_calls")
    .select("id")
    .eq("provider", "vapi")
    .eq("provider_call_id", providerCallId)
    .maybeSingle();
  return (again as { id: string } | null)?.id ?? "";
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
