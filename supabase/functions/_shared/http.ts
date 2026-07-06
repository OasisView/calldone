// supabase/functions/_shared/http.ts
// Small success-response helpers so functions don't hand-roll Content-Type/headers.
// Error responses always go through _shared/errors.ts (jsonError).

/** JSON success response with merged headers (CORS, rate-limit). */
export function jsonOk(
  body: unknown,
  status: number,
  headers?: Headers,
): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: h });
}
