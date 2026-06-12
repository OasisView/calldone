import { describe, it, expect } from "vitest"
import {
  ensureDisclosures,
  INITIAL_STATE,
  nextTurn,
  type TurnResult,
} from "@/lib/demo/conversation"

/** Run a whole scripted exchange and return the final turn. */
function runFlow(inputs: string[]): TurnResult {
  let state = INITIAL_STATE
  let last: TurnResult | null = null
  for (const input of inputs) {
    last = nextTurn(state, input)
    state = last.state
  }
  return last!
}

describe("conversation engine", () => {
  it("classifies a pharmacy refill and asks the first clarifying question", () => {
    const result = nextTurn(INITIAL_STATE, "Refill my blood pressure medication at Walgreens")
    expect(result.state.intentId).toBe("pharmacy-refill")
    expect(result.reply).toContain("Which pharmacy")
    expect(result.finalized).toBeUndefined()
  })

  it("classifies reservations and appointments", () => {
    expect(nextTurn(INITIAL_STATE, "book a table for dinner").state.intentId).toBe(
      "restaurant-reservation"
    )
    expect(nextTurn(INITIAL_STATE, "I need a dentist appointment").state.intentId).toBe(
      "appointment-booking"
    )
  })

  it("falls back to the general errand intent when nothing matches", () => {
    const result = nextTurn(INITIAL_STATE, "ask about my package")
    expect(result.state.intentId).toBe("general-errand")
  })

  it("walks the full refill flow and finalizes a personalized script", () => {
    const final = runFlow([
      "I need to refill my prescription",
      "Walgreens on 5th Ave",
      "Lisinopril",
      "Manny",
    ])
    expect(final.finalized).toBeDefined()
    const script = final.finalized!
    expect(script.intentId).toBe("pharmacy-refill")
    expect(script.callPurpose).toBe("Refill Lisinopril at Walgreens on 5th Ave")
    expect(script.targetName).toBe("Walgreens on 5th Ave")
    expect(script.slots.userName).toBe("Manny")
    expect(script.scriptText).toContain("calling on behalf of Manny")
    expect(script.scriptText).toMatch(/call may be recorded/i)
    expect(final.state.done).toBe(true)
  })

  it("never finalizes without both disclosure lines", () => {
    const fixed = ensureDisclosures("Just the body of a script.", "Sam")
    expect(fixed).toContain("AI assistant calling on behalf of Sam")
    expect(fixed).toMatch(/call may be recorded/i)
  })

  it("re-prompts on empty input without consuming a slot", () => {
    const first = nextTurn(INITIAL_STATE, "refill my meds")
    const empty = nextTurn(first.state, "   ")
    expect(empty.state).toEqual(first.state)
    expect(empty.reply).toContain("didn't catch")
  })

  it("is inert after the conversation is done", () => {
    const final = runFlow(["refill please", "CVS", "Metformin", "Alex"])
    const after = nextTurn(final.state, "hello?")
    expect(after.finalized).toBeUndefined()
    expect(after.state.done).toBe(true)
  })
})
