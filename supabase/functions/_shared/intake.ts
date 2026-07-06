// supabase/functions/_shared/intake.ts
// Intake + appointment persistence and the CONSENT-GUARDED callback enqueue
// (R23; db.md §2). All writes are service-role. The DB trigger
// private.guard_callback_rules re-enforces the consent invariant even if this
// code regresses — defense in depth.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppointmentDetails } from "./api-types.ts";
import {
  bookAppointmentSchema,
  captureIntakeSchema,
} from "./schemas.ts";

export interface IntakeContext {
  orgId: string;
  callId: string;
  callerNumber: string | null;
}

export interface ToolOutcome {
  ok: boolean;
  /** short model-facing result line (never PII beyond what the model sent). */
  message: string;
}

async function findIntake(
  admin: SupabaseClient,
  callId: string,
): Promise<{ id: string; callback_consent?: boolean } | null> {
  const { data } = await admin
    .from("intake_records")
    .select("id, callback_consent")
    .eq("call_id", callId)
    .maybeSingle();
  return (data as { id: string; callback_consent?: boolean } | null) ?? null;
}

/** capture_intake: validate → insert-or-update the call's intake record → when
 *  consent is true AND a callback number exists, enqueue the callback with
 *  consent provenance (consent_call_id + consent_recorded_at). */
export async function captureIntake(
  admin: SupabaseClient,
  ctx: IntakeContext,
  rawArgs: unknown,
): Promise<ToolOutcome> {
  const parsed = captureIntakeSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, message: "invalid intake fields; re-check and try again" };
  }
  const args = parsed.data;
  const callbackNumber = args.callback_number ?? ctx.callerNumber;

  const existing = await findIntake(admin, ctx.callId);
  const row = {
    org_id: ctx.orgId,
    call_id: ctx.callId,
    caller_name: args.caller_name ?? null,
    need: args.need,
    callback_number: callbackNumber,
    callback_consent: args.callback_consent,
    preferred_time: args.preferred_time ?? null,
  };

  let intakeId: string;
  if (existing) {
    const { error } = await admin.from("intake_records").update(row).eq("id", existing.id);
    if (error) return { ok: false, message: "could not save intake" };
    intakeId = existing.id;
  } else {
    const { data, error } = await admin.from("intake_records").insert(row).select("id").single();
    if (error || !data) return { ok: false, message: "could not save intake" };
    intakeId = (data as { id: string }).id;
  }

  if (args.callback_consent && callbackNumber) {
    // Idempotent-ish: one queue row per intake is enough for v1.
    const { data: queued } = await admin
      .from("callback_queue")
      .select("id")
      .eq("intake_id", intakeId)
      .maybeSingle();
    if (!queued) {
      const { error } = await admin.from("callback_queue").insert({
        org_id: ctx.orgId,
        intake_id: intakeId,
        consent_call_id: ctx.callId,
        consent_recorded_at: new Date().toISOString(),
        callback_number: callbackNumber,
      }).select("id").single();
      if (error) return { ok: true, message: "intake saved; callback enqueue failed" };
    }
  }
  return { ok: true, message: "intake saved" };
}

/** book_appointment: validate → write AppointmentDetails onto the intake row
 *  (creating a minimal record if capture_intake hasn't run yet). */
export async function bookAppointment(
  admin: SupabaseClient,
  ctx: IntakeContext,
  rawArgs: unknown,
): Promise<ToolOutcome> {
  const parsed = bookAppointmentSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, message: "invalid appointment fields (ISO 8601 with offset required)" };
  }
  const a = parsed.data;
  const appointment: AppointmentDetails = {
    title: a.title,
    start_iso: a.start_iso,
    end_iso: a.end_iso,
    location: a.location,
    notes: null,
    confidence: 1,
  };

  const existing = await findIntake(admin, ctx.callId);
  if (existing) {
    const { error } = await admin
      .from("intake_records")
      .update({ appointment })
      .eq("id", existing.id);
    if (error) return { ok: false, message: "could not save appointment" };
  } else {
    const { error } = await admin.from("intake_records").insert({
      org_id: ctx.orgId,
      call_id: ctx.callId,
      need: `Appointment: ${a.title}`,
      callback_consent: false,
      appointment,
    }).select("id").single();
    if (error) return { ok: false, message: "could not save appointment" };
  }
  return { ok: true, message: "appointment saved" };
}
