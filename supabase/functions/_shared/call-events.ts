// supabase/functions/_shared/call-events.ts
// CallEvent ingestion (api.md §3): idempotency, org routing by dialed number,
// and inbound_calls state transitions. All writes service-role. Statuses,
// escalation outcomes, and disclosure_played mirror the DB CHECKs (db.md §2).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallEvent } from "./api-types.ts";
import { LIMITS } from "./api-types.ts";
import { containsDisclosure } from "./prompts.ts";

export interface OrgRoute {
  orgId: string;
  phoneNumberId: string;
  orgName: string;
  notificationEmail: string | null;
  escalationPhone: string | null;
  timezone: string;
  callsEnabled: boolean;
  monthlyMinutesCap: number;
}

/** Resolves the org that owns the dialed number, or null (unknown_number). */
export async function routeOrg(
  admin: SupabaseClient,
  orgPhoneE164: string,
): Promise<OrgRoute | null> {
  const { data: pn } = await admin
    .from("phone_numbers")
    .select("id, org_id")
    .eq("e164", orgPhoneE164)
    .maybeSingle();
  const phone = pn as { id: string; org_id: string } | null;
  if (!phone) return null;

  const { data: org } = await admin
    .from("orgs")
    .select(
      "id, name, notification_email, escalation_phone, timezone, calls_enabled, monthly_minutes_cap",
    )
    .eq("id", phone.org_id)
    .maybeSingle();
  const o = org as {
    id: string;
    name: string;
    notification_email: string | null;
    escalation_phone: string | null;
    timezone: string;
    calls_enabled: boolean;
    monthly_minutes_cap: number;
  } | null;
  if (!o) return null;

  return {
    orgId: o.id,
    phoneNumberId: phone.id,
    orgName: o.name,
    notificationEmail: o.notification_email,
    escalationPhone: o.escalation_phone,
    timezone: o.timezone,
    callsEnabled: o.calls_enabled,
    monthlyMinutesCap: o.monthly_minutes_cap,
  };
}

/** Records the raw normalized event. Returns duplicate=true when this
 *  provider_event_id was already ingested (unique index backstop). */
export async function recordEvent(
  admin: SupabaseClient,
  orgId: string,
  callRowId: string | null,
  event: CallEvent,
): Promise<{ duplicate: boolean }> {
  if (event.provider_event_id) {
    const { data: existing } = await admin
      .from("call_events")
      .select("id")
      .eq("provider", event.provider)
      .eq("provider_event_id", event.provider_event_id)
      .maybeSingle();
    if (existing) return { duplicate: true };
  }
  const { error } = await admin.from("call_events").insert({
    org_id: orgId,
    call_id: callRowId,
    provider: event.provider,
    provider_event_id: event.provider_event_id,
    type: event.type,
    payload: event.data,
  }).select("id").single();
  // A unique-violation here means a concurrent duplicate — treat as duplicate.
  if (error) {
    const msg = (error as { message?: string }).message ?? "";
    if (msg.includes("duplicate") || msg.includes("23505")) return { duplicate: true };
    throw new Error(`call_events insert failed: ${msg}`);
  }
  return { duplicate: false };
}

export interface CallRow {
  id: string;
  status: string;
  transcript: Array<{ role: string; text: string }>;
  disclosure_played: boolean;
}

export async function findCall(
  admin: SupabaseClient,
  event: CallEvent,
): Promise<CallRow | null> {
  const { data } = await admin
    .from("inbound_calls")
    .select("id, status, transcript, disclosure_played")
    .eq("provider", event.provider)
    .eq("provider_call_id", event.provider_call_id)
    .maybeSingle();
  return (data as CallRow | null) ?? null;
}

const TERMINAL = new Set(["completed", "transferred", "voicemail", "failed"]);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status);
}

/** call.started → create the call row (idempotent by unique provider_call_id). */
export async function startCall(
  admin: SupabaseClient,
  route: OrgRoute,
  event: CallEvent,
): Promise<CallRow | null> {
  const existing = await findCall(admin, event);
  if (existing) return existing;
  const { data, error } = await admin.from("inbound_calls").insert({
    org_id: route.orgId,
    phone_number_id: route.phoneNumberId,
    provider: event.provider,
    provider_call_id: event.provider_call_id,
    caller_number: event.caller_e164,
    started_at: event.occurred_at,
  }).select("id, status, transcript, disclosure_played").single();
  if (error) {
    // concurrent create → re-read
    return await findCall(admin, event);
  }
  return data as unknown as CallRow;
}

/** transcript.updated → append the final fragment; flip disclosure_played when
 *  the FIRST assistant utterance carries the required substrings (R28). */
export async function appendTranscript(
  admin: SupabaseClient,
  call: CallRow,
  turn: { role: string; text: string },
): Promise<void> {
  if (isTerminal(call.status)) return; // replay after terminal: no-op
  const transcript = Array.isArray(call.transcript) ? [...call.transcript] : [];
  if (transcript.length >= LIMITS.TRANSCRIPT_MAX_TURNS) return;
  transcript.push(turn);

  const patch: Record<string, unknown> = { transcript };
  if (!call.disclosure_played && turn.role === "assistant" && containsDisclosure(turn.text)) {
    patch.disclosure_played = true;
  }
  await admin.from("inbound_calls").update(patch).eq("id", call.id);
}

export interface EndData {
  endedReason: string | null;
  voicemail: boolean;
  durationSeconds: number | null;
  transcript: Array<{ role: string; text: string }>;
  providerSummary: string | null;
}

/** Maps the provider end reason to our status enum. Transfers are recorded via
 *  transfer.initiated (escalation), then the report closes the row. */
export function terminalStatus(data: EndData, escalated: boolean): string {
  if (data.voicemail) return "voicemail";
  if (escalated) return "transferred";
  const reason = (data.endedReason ?? "").toLowerCase();
  if (reason.includes("error") || reason.includes("failed")) return "failed";
  return "completed";
}
