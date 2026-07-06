// supabase/functions/_shared/errors.ts
// The ONLY builder of error response bodies (api.md §1). Every error status from
// our code goes through jsonError() so the 12-code envelope, the per-code
// retryable flag, and Content-Type: application/json are enforced in one place.
import {
  type ApiErrorBody,
  type ApiErrorCode,
  RETRYABLE_CODES,
} from "./api-types.ts";

/** Canonical HTTP status per error code (api.md §1 table). */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal_error: 500,
  not_implemented: 501,
  upstream_error: 502,
  quota_exceeded: 503,
};

const RETRYABLE_SET = new Set<ApiErrorCode>(RETRYABLE_CODES);

/** Builds the frozen error envelope. `headers`/`extraHeaders` let callers attach
 *  CORS and rate-limit headers without re-implementing the body. `details` is
 *  optional machine context — NEVER stack traces or secrets (api.md §1). */
export function jsonError(
  code: ApiErrorCode,
  message: string,
  opts: {
    details?: Record<string, unknown>;
    headers?: HeadersInit;
  } = {},
): Response {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      retryable: RETRYABLE_SET.has(code),
      ...(opts.details ? { details: opts.details } : {}),
    },
  };

  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), {
    status: ERROR_STATUS[code],
    headers,
  });
}
