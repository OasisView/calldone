import { describe, it, expect, beforeEach } from "vitest"
import {
  clearAll,
  completeCallLog,
  createCallLog,
  getCallLog,
  getScript,
  listCallLogs,
  listScripts,
  saveScript,
  updateScript,
} from "@/lib/demo/store"

const SCRIPT_INPUT = {
  intentId: "pharmacy-refill",
  scriptText: "Hello, this is a test script.",
  callPurpose: "Refill Lisinopril at Walgreens",
  targetName: "Walgreens",
  slots: { userName: "Manny", pharmacyName: "Walgreens" },
}

beforeEach(() => {
  clearAll()
})

describe("demo store — scripts", () => {
  it("saves and retrieves a script", () => {
    const script = saveScript(SCRIPT_INPUT)
    expect(script.id).toBeTruthy()
    expect(getScript(script.id)?.callPurpose).toBe(SCRIPT_INPUT.callPurpose)
    expect(listScripts()).toHaveLength(1)
  })

  it("updates the script text and bumps updatedAt", () => {
    const script = saveScript(SCRIPT_INPUT)
    const updated = updateScript(script.id, { scriptText: "Edited." })
    expect(updated?.scriptText).toBe("Edited.")
    expect(getScript(script.id)?.scriptText).toBe("Edited.")
  })

  it("returns null when updating a missing script", () => {
    expect(updateScript("nope", { scriptText: "x" })).toBeNull()
  })

  it("lists newest first", () => {
    const a = saveScript(SCRIPT_INPUT)
    const b = saveScript({ ...SCRIPT_INPUT, callPurpose: "Second" })
    const list = listScripts()
    expect(list.map((s) => s.id)).toContain(a.id)
    expect(list.map((s) => s.id)).toContain(b.id)
  })
})

describe("demo store — call logs", () => {
  it("creates an in-progress log and completes it", () => {
    const script = saveScript(SCRIPT_INPUT)
    const log = createCallLog({
      scriptId: script.id,
      phoneNumber: null,
      transcript: [{ speaker: "agent", text: "Hi!" }],
      appointment: null,
    })
    expect(log.status).toBe("in_progress")
    expect(log.completedAt).toBeNull()

    const completed = completeCallLog(log.id)
    expect(completed?.status).toBe("completed")
    expect(completed?.completedAt).toBeTruthy()
    expect(getCallLog(log.id)?.status).toBe("completed")
    expect(listCallLogs()).toHaveLength(1)
  })

  it("survives malformed storage gracefully", () => {
    window.localStorage.setItem("calldone:demo:v1", "{not json")
    expect(listScripts()).toEqual([])
    expect(listCallLogs()).toEqual([])
  })
})
