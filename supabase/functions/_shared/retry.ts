// supabase/functions/_shared/retry.ts
// Bounded exponential-backoff helper for provider calls (api.md §2.1; 3 attempts).
// Used by whisper/Gemini/ElevenLabs/Resend wrappers. Keeps the slice's "retry x3
// then upstream_error/quota_exceeded" behavior in one place.

export interface RetryOptions {
  /** total attempts including the first (default 3). */
  attempts?: number;
  /** base delay ms for backoff: delay = baseMs * 2^(n-1) (default 250). */
  baseMs?: number;
  /** max delay ms cap (default 4000). */
  maxMs?: number;
  /** decide whether a thrown error is retryable (default: retry all). */
  shouldRetry?: (err: unknown) => boolean;
  /** sleep impl, overridable in tests to avoid real delays. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `fn` with exponential backoff. Re-throws the last error after the final
 *  attempt, or immediately when shouldRetry returns false. Jitter is applied to
 *  avoid synchronized retries. */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 250;
  const maxMs = opts.maxMs ?? 4000;
  const shouldRetry = opts.shouldRetry ?? (() => true);
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !shouldRetry(err)) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * (backoff / 2));
      await sleep(backoff + jitter);
    }
  }
  throw lastErr;
}
