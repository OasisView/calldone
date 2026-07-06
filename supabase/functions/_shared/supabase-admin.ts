// supabase/functions/_shared/supabase-admin.ts
// Service-role client factory (server-only, security.md §1.3). Bypasses RLS — use
// ONLY for the writes the contract designates as service-role: call_logs
// INSERT/UPDATE (R5) and the rate_limit_hit RPC (R6). SUPABASE_SERVICE_ROLE_KEY is
// auto-injected by the platform and never readable by browsers.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminFactory: (() => SupabaseClient) | null = null;

/** TEST-ONLY: inject a fake service-role client. Pass null to restore default. */
export function __setAdminClientForTests(client: SupabaseClient | null): void {
  adminFactory = client ? () => client : null;
}

/** Creates a service-role Supabase client. Throws if the platform env is missing
 *  (a deploy/config error, surfaced as 500 by the caller). */
export function createAdminClient(): SupabaseClient {
  if (adminFactory) return adminFactory();
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
