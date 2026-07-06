// supabase/functions/_shared/secure-compare.ts
// Constant-time string comparison for shared-secret auth (security.md §1.3):
// provider-webhook (PROVIDER_WEBHOOK_SECRET) and agent-brain (BRAIN_SECRET).
// Unequal lengths return false without leaking where they differ.
import { timingSafeEqual } from "@std/crypto/timing-safe-equal";

const encoder = new TextEncoder();

export function secureEquals(a: string | null | undefined, b: string): boolean {
  if (!a || !b) return false;
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return timingSafeEqual(ab, bb);
}
