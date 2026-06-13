// security.md §10 ws/calls-ui item 1: E.164 client validation uses the SHARED
// E164_REGEX from the api-types contract (no local regex copy), and that regex
// is byte-identical to the server's source of truth.
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { E164_REGEX } from "@/types/api"
import { validateE164, normalizeE164 } from "@/lib/phone"
import { phoneNumberSchema } from "@/lib/schemas"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../..")

describe("E.164 client validation (shared regex, no local copy)", () => {
  it("uses exactly the server's canonical regex source", () => {
    expect(E164_REGEX.source).toBe("^\\+[1-9]\\d{1,14}$")
  })

  it("accepts valid international numbers", () => {
    for (const n of ["+14155550123", "+447911123456", "+12025550149"]) {
      expect(validateE164(n)).toBe(true)
      expect(phoneNumberSchema.safeParse(normalizeE164(n)).success).toBe(true)
    }
  })

  it("normalizes human formatting before validating", () => {
    expect(normalizeE164("+1 (415) 555-0123")).toBe("+14155550123")
    expect(validateE164("+1 415.555.0123")).toBe(true)
  })

  it("rejects invalid numbers (leading zero, no plus, too long, letters)", () => {
    for (const n of ["+0123456789", "14155550123", "+1415555012345678", "+1abc", ""]) {
      expect(validateE164(n)).toBe(false)
    }
    expect(normalizeE164("not a number")).toBeNull()
  })

  it("the calls-ui workstream defines NO local E.164 regex literal", () => {
    // The shape `\+[1-9]\d` must only originate from the shared api-types module,
    // never re-declared inside an owned calls-ui file (security.md §10 item 1).
    const ownedFiles = [
      "src/components/calls/PhoneNumberField.tsx",
      "src/pages/ScriptReview.tsx",
      "src/hooks/use-make-call.ts",
    ]
    for (const rel of ownedFiles) {
      const body = readFileSync(resolve(repoRoot, rel), "utf8")
      expect(body).not.toMatch(/\\\+\[1-9\]/)
    }
  })
})
