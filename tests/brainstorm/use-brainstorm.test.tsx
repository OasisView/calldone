// tests/brainstorm/use-brainstorm.test.tsx — the R2 persistence + 429 acceptance
// tests for ws/brainstorm-ui (security §10 #4, #5):
//   • On script_finalized, the hook inserts call_scripts and (for a NON-anonymous
//     user) upserts user_facts; finalizedScript is exposed for navigation.
//   • An ANONYMOUS user finalizing the SAME script skips the user_facts upsert
//     entirely (R8) while still persisting brainstorm_sessions + call_scripts.
//   • A 429 rate_limited error from converse() lands in error state with status
//     "error" and triggers NO automatic retry of converse().
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

// --- mocked module surfaces -------------------------------------------------
// vi.mock factories are hoisted above imports, so every value they close over must
// come from vi.hoisted (which is hoisted with them).

const { transcribeAudio, converse, recorderStop, playbackSpeak, sessionState, writes } =
  vi.hoisted(() => ({
    transcribeAudio: vi.fn(),
    converse: vi.fn(),
    recorderStop: vi.fn(),
    playbackSpeak: vi.fn().mockResolvedValue(undefined),
    sessionState: { isAnonymous: false },
    writes: [] as { table: string; op: "insert" | "update" | "upsert"; payload: unknown }[],
  }))

// Re-export the real EdgeError so toApiError(err instanceof EdgeError) works.
vi.mock("@/lib/edge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/edge")>("@/lib/edge")
  return { EdgeError: actual.EdgeError, transcribeAudio, converse, synthesizeSpeech: vi.fn() }
})

// Recorder + playback hooks are stubbed so the test drives the pipeline directly.
vi.mock("@/hooks/use-audio-recorder", () => ({
  useAudioRecorder: () => ({
    isSupported: true,
    isRecording: false,
    error: null,
    start: vi.fn().mockResolvedValue(undefined),
    stop: recorderStop,
    cancel: vi.fn(),
  }),
}))
vi.mock("@/hooks/use-speech-playback", () => ({
  useSpeechPlayback: () => ({
    isSpeaking: false,
    lastSource: null,
    speak: playbackSpeak,
    stop: vi.fn(),
  }),
}))

// Session: toggled per-test via the hoisted mutable holder.
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    session: null,
    user: { id: "user-1" },
    isAnonymous: sessionState.isAnonymous,
    isLoading: false,
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    linkEmail: vi.fn(),
    linkGoogle: vi.fn(),
    signOut: vi.fn(),
    ensureSession: vi.fn(),
  }),
}))

// --- chainable supabase mock ------------------------------------------------
// Records every table write (into the hoisted `writes`) so assertions can inspect
// which tables were touched.

function makeBuilder(table: string) {
  // Each terminal returns a thenable resolving to a Supabase-like { data, error }.
  const builder = {
    insert(payload: unknown) {
      writes.push({ table, op: "insert", payload })
      return {
        select: () => ({
          single: async () => ({
            data: { id: table === "call_scripts" ? "script-99" : "session-1" },
            error: null,
          }),
        }),
      }
    },
    update(payload: unknown) {
      writes.push({ table, op: "update", payload })
      return { eq: async () => ({ data: null, error: null }) }
    },
    upsert(payload: unknown) {
      writes.push({ table, op: "upsert", payload })
      return Promise.resolve({ data: null, error: null })
    },
  }
  return builder
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ from: (table: string) => makeBuilder(table) }),
}))

import { useBrainstorm } from "@/hooks/use-brainstorm"
import { EdgeError } from "@/lib/edge"

const FINALIZE_RESPONSE = {
  type: "script_finalized" as const,
  closing_message: "Done — I've drafted your script.",
  session_id: "session-1",
  script: {
    script_text: "x".repeat(60),
    call_purpose: "Refill prescription",
    target_phone_hint: "+15551234567",
    extracted_facts: [{ key: "primary_pharmacy", value: "Walgreens", confidence: 0.9 }],
  },
}

beforeEach(() => {
  writes.length = 0
  sessionState.isAnonymous = false
  transcribeAudio.mockReset().mockResolvedValue({ text: "Refill my meds", duration_seconds: 2 })
  converse.mockReset()
  recorderStop.mockReset().mockResolvedValue({ blob: new Blob(["a"]), mimeType: "audio/webm" })
  playbackSpeak.mockReset().mockResolvedValue(undefined)
})

describe("use-brainstorm finalize persistence (R2)", () => {
  it("non-anonymous: inserts call_scripts AND upserts user_facts; exposes finalizedScript", async () => {
    converse.mockResolvedValue(FINALIZE_RESPONSE)
    const { result } = renderHook(() => useBrainstorm())

    await act(async () => {
      await result.current.stopAndSend()
    })

    await waitFor(() => expect(result.current.status).toBe("finalized"))

    const tables = writes.map((w) => `${w.op}:${w.table}`)
    expect(tables).toContain("insert:brainstorm_sessions")
    expect(tables).toContain("insert:call_scripts")
    expect(tables).toContain("upsert:user_facts") // facts persisted for full accounts
    expect(tables).toContain("update:brainstorm_sessions") // resulting_script_id

    expect(result.current.finalizedScript).toEqual({
      scriptId: "script-99",
      targetPhoneHint: "+15551234567",
    })
  })

  it("anonymous: SKIPS the user_facts upsert entirely (R8) but still persists the script", async () => {
    sessionState.isAnonymous = true
    converse.mockResolvedValue(FINALIZE_RESPONSE)
    const { result } = renderHook(() => useBrainstorm())

    await act(async () => {
      await result.current.stopAndSend()
    })

    await waitFor(() => expect(result.current.status).toBe("finalized"))

    const tables = writes.map((w) => `${w.op}:${w.table}`)
    expect(tables).toContain("insert:call_scripts")
    expect(tables).toContain("insert:brainstorm_sessions")
    // The security boundary: no user_facts write for anonymous users.
    expect(writes.some((w) => w.table === "user_facts")).toBe(false)
    expect(result.current.finalizedScript?.scriptId).toBe("script-99")
  })
})

describe("use-brainstorm 429 handling (§10 #4)", () => {
  it("surfaces a rate_limited error and does NOT auto-retry converse", async () => {
    converse.mockRejectedValue(
      new EdgeError("rate_limited", 429, "Too many requests.", true)
    )
    const { result } = renderHook(() => useBrainstorm())

    await act(async () => {
      await result.current.stopAndSend()
    })

    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current.error?.code).toBe("rate_limited")
    // No retry loop: converse called exactly once for the single turn.
    expect(converse).toHaveBeenCalledTimes(1)
  })
})
