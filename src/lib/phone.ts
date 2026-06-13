import { E164_REGEX } from "@/types/api"

/** Strip formatting humans add (spaces, dashes, parens, dots) without touching
 *  the leading "+" or the digits. No local regex literal for the format itself —
 *  the canonical E.164 shape lives in api-types' E164_REGEX (R3/R17). */
function stripFormatting(value: string): string {
  return value.replace(/[\s\-().]/g, "")
}

/** True when `value` is valid E.164 after stripping spaces/dashes/parens/dots. */
export function validateE164(value: string): boolean {
  return E164_REGEX.test(stripFormatting(value))
}

/** Returns the canonical E.164 string (formatting removed) when valid, else null. */
export function normalizeE164(value: string): string | null {
  const stripped = stripFormatting(value)
  return E164_REGEX.test(stripped) ? stripped : null
}
