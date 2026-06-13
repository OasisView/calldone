// security.md §10 ws/calls-ui items 3 & 4, enforced as static gates over the
// files this workstream owns:
//   3. the client cannot reach the result webhook — no "call-webhook" string in
//      any owned source file (the client never POSTs the webhook).
//   4. no client-side mutation of call_logs — owned code never .from("call_logs")
//      with a write verb (.insert/.update/.upsert/.delete). Reads (.select) only.
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../..")

// Every file owned by ws/calls-ui (frontend.md §8).
const OWNED_FILES = [
  "src/pages/Scripts.tsx",
  "src/pages/ScriptReview.tsx",
  "src/pages/Calls.tsx",
  "src/pages/CallDetail.tsx",
  "src/components/calls/ScriptEditor.tsx",
  "src/components/calls/ScriptCard.tsx",
  "src/components/calls/PhoneNumberField.tsx",
  "src/components/calls/CallProgressCard.tsx",
  "src/components/calls/CallLogRow.tsx",
  "src/components/calls/CallTranscript.tsx",
  "src/components/calls/AppointmentCard.tsx",
  "src/hooks/use-scripts.ts",
  "src/hooks/use-call-logs.ts",
  "src/hooks/use-make-call.ts",
]

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8")
}

describe("ws/calls-ui security gates", () => {
  it("no owned file references 'call-webhook' (client never reaches the webhook)", () => {
    const offenders = OWNED_FILES.filter((f) => read(f).includes("call-webhook"))
    expect(offenders).toEqual([])
  })

  it("no owned file writes call_logs (zero client write policies, R5)", () => {
    // Match a call_logs table reference immediately followed (any whitespace)
    // by a mutating PostgREST verb anywhere in the chain on the same statement.
    const writeVerb = /call_logs[\s\S]{0,200}?\.(insert|update|upsert|delete)\s*\(/
    const offenders = OWNED_FILES.filter((f) => writeVerb.test(read(f)))
    expect(offenders).toEqual([])
  })

  it("only use-call-logs / use-make-call touch call_logs at all, and only to read/refetch", () => {
    for (const f of OWNED_FILES) {
      const body = read(f)
      if (!body.includes('from("call_logs")')) continue
      // The single table access in this workstream is the .select() read.
      expect(body).toMatch(/from\("call_logs"\)\s*\.select\(/)
      expect(body).not.toMatch(/from\("call_logs"\)\s*\.(insert|update|upsert|delete)\(/)
    }
  })

  it("the client never invokes a 'call-webhook' edge function", () => {
    for (const f of OWNED_FILES) {
      expect(read(f)).not.toMatch(/functions\.invoke\(\s*["'`]call-webhook/)
    }
  })
})
