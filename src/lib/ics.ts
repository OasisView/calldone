// src/lib/ics.ts — re-export shim. The single .ics source of truth lives in
// supabase/functions/_shared/ics.ts (dependency-free, browser-safe TS) so the
// edge call-webhook email path and the client AppointmentCard share one builder (R18).
export * from "../../supabase/functions/_shared/ics.ts"
