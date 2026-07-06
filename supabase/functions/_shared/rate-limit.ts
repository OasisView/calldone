// supabase/functions/_shared/rate-limit.ts
// Wrapper over the public.rate_limit_hit SECURITY DEFINER RPC (api.md §8, R6).
// Edge functions never touch private.rate_limits directly. We increment-then-check
// per bucket; the strictest verdict wins. The IP comes from the PLATFORM-TRUSTED
// hop only (x-real-ip / last XFF entry) — never the client-controlled first XFF
// entry (security.md §5.1).
import type { SupabaseClient } from "@supabase/supabase-js";
import { RATE_LIMIT_HEADERS, type RateLimitWindow } from "./api-types.ts";

/** One configured bucket from RATE_LIMITS, plus the key to scope it by. */
export interface RateLimitSpec {
  bucket: string;
  limit: number;
  window: RateLimitWindow;
  /** ip | uid value | 'global'. */
  key: string;
  /** amount to add (default 1; tts_chars buckets pass text length). */
  amount?: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** the bucket that produced the strictest verdict (for header values). */
  bucket: string;
  limit: number;
  remaining: number;
  /** unix epoch seconds when the offending window resets. */
  resetSeconds: number;
  /** seconds until reset (Retry-After), >= 1. */
  retryAfterSeconds: number;
}

/** Client IP from the platform-trusted hop. Prefer x-real-ip (set by Supabase's
 *  edge gateway); else the LAST x-forwarded-for entry (gateway-appended). NEVER
 *  the first XFF entry, which any caller can forge. Falls back to "unknown" so a
 *  missing header still buckets deterministically. */
export function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim() !== "") return realIp.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff && xff.trim() !== "") {
    const parts = xff.split(",").map((p) => p.trim()).filter((p) => p !== "");
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/** Seconds remaining until a fixed window (truncated to hour/day/month) resets. */
function windowResetSeconds(window: RateLimitWindow): {
  resetEpoch: number;
  retryAfter: number;
} {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCMilliseconds(0);
  reset.setUTCSeconds(0);
  reset.setUTCMinutes(0);
  if (window === "hour") {
    reset.setUTCHours(reset.getUTCHours() + 1);
  } else if (window === "day") {
    reset.setUTCHours(0);
    reset.setUTCDate(reset.getUTCDate() + 1);
  } else {
    // month
    reset.setUTCHours(0);
    reset.setUTCDate(1);
    reset.setUTCMonth(reset.getUTCMonth() + 1);
  }
  const resetEpoch = Math.floor(reset.getTime() / 1000);
  const retryAfter = Math.max(1, resetEpoch - Math.floor(now.getTime() / 1000));
  return { resetEpoch, retryAfter };
}

/** Calls rate_limit_hit for one bucket and returns the post-increment count.
 *  Throws on RPC error (caller maps to 500). */
async function hitBucket(
  admin: SupabaseClient,
  spec: RateLimitSpec,
): Promise<number> {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_bucket: spec.bucket,
    p_key: spec.key,
    p_window: spec.window,
    p_amount: spec.amount ?? 1,
  });
  if (error) throw new Error(`rate_limit_hit failed: ${error.message}`);
  return typeof data === "number" ? data : Number(data);
}

/** Checks ALL specs (every applicable bucket for the request). The strictest
 *  verdict wins; if any bucket is over its limit, allowed=false and the headers
 *  describe that bucket. On allow, headers describe the bucket with the LEAST
 *  remaining. Throws if the RPC errors (caller → 500). */
export async function enforceRateLimits(
  admin: SupabaseClient,
  specs: RateLimitSpec[],
): Promise<RateLimitVerdict> {
  let strictest: RateLimitVerdict | null = null;
  let tightestAllowed: RateLimitVerdict | null = null;

  for (const spec of specs) {
    const count = await hitBucket(admin, spec);
    const { resetEpoch, retryAfter } = windowResetSeconds(spec.window);
    const remaining = Math.max(0, spec.limit - count);
    const over = count > spec.limit;
    const verdict: RateLimitVerdict = {
      allowed: !over,
      bucket: spec.bucket,
      limit: spec.limit,
      remaining,
      resetSeconds: resetEpoch,
      retryAfterSeconds: retryAfter,
    };
    if (over && (!strictest || retryAfter > strictest.retryAfterSeconds)) {
      strictest = verdict;
    }
    if (!tightestAllowed || remaining < tightestAllowed.remaining) {
      tightestAllowed = verdict;
    }
  }

  if (strictest) return strictest;
  // All allowed: surface the bucket closest to its limit for the success headers.
  return (
    tightestAllowed ?? {
      allowed: true,
      bucket: "none",
      limit: 0,
      remaining: 0,
      resetSeconds: Math.floor(Date.now() / 1000),
      retryAfterSeconds: 1,
    }
  );
}

/** Builds the x-ratelimit-* headers for any response (success or 429). On 429 the
 *  caller also relies on retry-after being present. */
export function rateLimitHeaders(verdict: RateLimitVerdict): Headers {
  const h = new Headers();
  h.set(RATE_LIMIT_HEADERS.limit, String(verdict.limit));
  h.set(RATE_LIMIT_HEADERS.remaining, String(verdict.remaining));
  h.set(RATE_LIMIT_HEADERS.reset, String(verdict.resetSeconds));
  if (!verdict.allowed) {
    h.set(RATE_LIMIT_HEADERS.retryAfter, String(verdict.retryAfterSeconds));
  }
  return h;
}
