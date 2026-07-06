// supabase/functions/provider-webhook/index.ts
// Inbound lifecycle webhook (api.md §3). Server-to-server: adapter-verified
// sender, size-capped raw body, normalize → CallEvent → idempotent ingestion →
// state transitions → post-call pipeline. Always answers 200
// {received, processed, reason?} for authenticated requests so the provider
// never retry-storms; auth/size/shape failures use the error envelope.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITS, RATE_LIMITS, type CallEvent } from "../_shared/api-types.ts";
import {
  normalizeWebhook,
  transferDestinationResponse,
  verifyWebhook,
} from "../_shared/adapters/vapi.ts";
import {
  appendTranscript,
  findCall,
  isTerminal,
  recordEvent,
  routeOrg,
  startCall,
  terminalStatus,
  type EndData,
} from "../_shared/call-events.ts";
import { jsonError } from "../_shared/errors.ts";
import { jsonOk } from "../_shared/http.ts";
import { enforceRateLimits, rateLimitHeaders } from "../_shared/rate-limit.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { buildSummary, sendSummaryEmail } from "../_shared/summary.ts";
import { callEventSchema } from "../_shared/schemas.ts";

export interface WebhookDeps {
  admin?: SupabaseClient;
  fetchImpl?: typeof fetch;
  /** injected for tests to observe/skip the async post-call work. */
  waitUntil?: (p: Promise<unknown>) => void;
}

type Received = {
  received: true;
  processed: boolean;
  reason?: string;
};

function ok(processed: boolean, reason?: string, headers?: Headers): Response {
  const body: Received = { received: true, processed, ...(reason ? { reason } : {}) };
  return jsonOk(body, 200, headers);
}

async function finalizeCall(
  admin: SupabaseClient,
  fetchImpl: typeof fetch,
  route: NonNullable<Awaited<ReturnType<typeof routeOrg>>>,
  event: CallEvent,
): Promise<void> {
  const call = await findCall(admin, event);
  if (!call) return;
  if (isTerminal(call.status)) return; // replay of a terminal report: no-op

  const d = event.data as Record<string, unknown>;
  const endData: EndData = {
    endedReason: typeof d.endedReason === "string" ? d.endedReason : null,
    voicemail: d.voicemail === true,
    durationSeconds: typeof d.durationSeconds === "number" ? d.durationSeconds : null,
    transcript: Array.isArray(d.transcript)
      ? (d.transcript as Array<{ role: string; text: string }>)
      : [],
    providerSummary: typeof d.providerSummary === "string" ? d.providerSummary : null,
  };

  const escalated = call.status === "transferred";
  const status = terminalStatus(endData, escalated);
  const turns = endData.transcript.length > 0 ? endData.transcript : call.transcript;

  // Usage ledger (R28): minutes rounded up.
  const minutes = endData.durationSeconds ? Math.ceil(endData.durationSeconds / 60) : 0;
  if (minutes > 0) {
    await admin.rpc("usage_add_minutes", { p_org: route.orgId, p_minutes: minutes });
  }

  // Summary email (rate-limited per org; failure recorded, never thrown).
  let summary = endData.providerSummary;
  let emailError: string | null = null;
  let emailedAt: string | null = null;
  if (route.notificationEmail) {
    const verdict = await enforceRateLimits(admin, [{
      ...RATE_LIMITS.summaryEmailsPerOrg,
      key: route.orgId,
    }]);
    if (verdict.allowed) {
      summary = summary ?? await buildSummary(turns, route.orgName, fetchImpl);
      const { data: intake } = await admin
        .from("intake_records")
        .select("caller_name, need, callback_consent, appointment")
        .eq("call_id", call.id)
        .maybeSingle();
      const i = intake as {
        caller_name: string | null;
        need: string | null;
        callback_consent: boolean;
        appointment: import("../_shared/api-types.ts").AppointmentDetails | null;
      } | null;
      const sent = await sendSummaryEmail({
        to: route.notificationEmail,
        orgName: route.orgName,
        summary,
        callId: call.id,
        appointment: i?.appointment ?? null,
        intakeLine: i
          ? `${i.caller_name ?? "Unknown caller"} — ${i.need ?? "no need captured"} — callback consent: ${i.callback_consent ? "yes" : "no"}`
          : null,
      }, fetchImpl);
      if (sent.ok) emailedAt = new Date().toISOString();
      else emailError = sent.error ?? "email failed";
    } else {
      emailError = "summary email rate-limited";
    }
  }

  await admin.from("inbound_calls").update({
    status,
    ended_at: event.occurred_at,
    duration_seconds: endData.durationSeconds,
    transcript: turns.slice(0, LIMITS.TRANSCRIPT_MAX_TURNS),
    summary: summary?.slice(0, LIMITS.SUMMARY_MAX_CHARS) ?? null,
    ...(emailedAt ? { summary_emailed_at: emailedAt } : {}),
    ...(emailError ? { error_reason: emailError } : {}),
  }).eq("id", call.id);
}

export async function handler(req: Request, deps: WebhookDeps = {}): Promise<Response> {
  if (req.method === "OPTIONS") {
    // Server-to-server only: no browser origin is granted (api.md §5).
    return jsonError("method_not_allowed", "no browser access");
  }
  if (req.method !== "POST") {
    return jsonError("method_not_allowed", "POST only");
  }

  const secret = Deno.env.get("PROVIDER_WEBHOOK_SECRET") ?? "";
  if (secret === "" || !verifyWebhook(req, secret)) {
    return jsonError("unauthorized", "invalid webhook credentials");
  }

  const raw = await req.text();
  if (raw.length > LIMITS.WEBHOOK_BODY_MAX_BYTES) {
    return jsonError("payload_too_large", "body exceeds limit");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return jsonError("invalid_request", "body is not valid JSON");
  }

  const admin = deps.admin ?? createAdminClient();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const waitUntil = deps.waitUntil ??
    ((p: Promise<unknown>) => {
      // Supabase edge runtime keeps the worker alive for waitUntil work.
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(p) ?? p.catch(() => {});
    });

  const normalized = normalizeWebhook(payload);
  if (normalized.events.length === 0 && !normalized.wantsTransferDestination) {
    // Unknown/uninteresting message type: acknowledged, not processed.
    return ok(false, "ignored_type");
  }

  let processedAny = false;
  let lastReason: string | undefined;

  for (const rawEvent of normalized.events) {
    const parsed = callEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      lastReason = "invalid_event";
      continue;
    }
    const event = parsed.data as CallEvent;

    const route = await routeOrg(admin, event.org_phone_e164);
    if (!route) {
      lastReason = "unknown_number";
      continue;
    }

    // Per-call webhook flood guard.
    const verdict = await enforceRateLimits(admin, [{
      ...RATE_LIMITS.webhookEventsPerCall,
      key: event.provider_call_id,
    }]);
    if (!verdict.allowed) {
      return jsonError("rate_limited", "webhook flood", {
        headers: rateLimitHeaders(verdict),
      });
    }

    const call = await findCall(admin, event);
    const { duplicate } = await recordEvent(admin, route.orgId, call?.id ?? null, event);
    if (duplicate) {
      lastReason = "already_processed";
      continue;
    }

    switch (event.type) {
      case "call.started": {
        await startCall(admin, route, event);
        processedAny = true;
        break;
      }
      case "transcript.updated": {
        const target = call ?? await startCall(admin, route, event);
        if (target) {
          const d = event.data as { role?: string; text?: string };
          await appendTranscript(admin, target, {
            role: d.role ?? "unknown",
            text: d.text ?? "",
          });
          processedAny = true;
        }
        break;
      }
      case "transfer.initiated": {
        const target = call ?? await startCall(admin, route, event);
        if (target && !isTerminal(target.status)) {
          await admin.from("inbound_calls").update({
            status: "transferred",
            escalation: "transferred",
          }).eq("id", target.id);
          processedAny = true;
        }
        break;
      }
      case "call.ended": {
        // Ensure a row exists even if call.started was missed.
        const target = call ?? await startCall(admin, route, event);
        if (target) {
          if (isTerminal(target.status) && target.status !== "transferred") {
            lastReason = "already_processed";
          } else {
            const voicemail = (event.data as { voicemail?: boolean }).voicemail === true;
            if (voicemail) {
              await admin.from("inbound_calls").update({ escalation: "voicemail" })
                .eq("id", target.id);
            }
            waitUntil(finalizeCall(admin, fetchImpl, route, event));
            processedAny = true;
          }
        }
        break;
      }
      case "tool.invoked":
      case "voicemail.left": {
        processedAny = true;
        break;
      }
    }

    // Transfer-destination request: answer with the org's staff line inline.
    if (normalized.wantsTransferDestination) {
      if (!route.escalationPhone) {
        return ok(false, "no_escalation_phone");
      }
      return jsonOk(transferDestinationResponse(route.escalationPhone), 200);
    }
  }

  return ok(processedAny, processedAny ? undefined : lastReason ?? "ignored");
}

if (import.meta.main) {
  Deno.serve((req) => handler(req));
}
