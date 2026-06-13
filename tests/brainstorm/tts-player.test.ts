// tests/brainstorm/tts-player.test.ts — §10 #3 (the object-URL half): premium TTS
// blob URLs are created for playback and ALWAYS revoked afterward (ended, error, and
// stopAll). Also covers the browser SpeechSynthesis fallback resolving cleanly.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { playBlob, speakWithBrowser, stopAll } from "@/lib/audio/tts-player"

const created: string[] = []
const revoked: string[] = []

/** Captures the Audio element so a test can fire ended/error manually. */
let lastAudio: FakeAudio | null = null

class FakeAudio {
  src: string
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = true
  constructor(src: string) {
    this.src = src
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- test double captures its instance
    lastAudio = this
  }
  play() {
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}

beforeEach(() => {
  created.length = 0
  revoked.length = 0
  lastAudio = null

  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio)
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((_blob: Blob) => {
      const url = `blob:mock/${created.length}`
      created.push(url)
      return url
    }),
    revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("playBlob object-URL lifecycle", () => {
  it("creates a URL and revokes it after playback ends", async () => {
    const promise = playBlob(new Blob(["x"]))
    expect(created).toHaveLength(1)
    expect(revoked).toHaveLength(0) // not yet — still playing

    // Fire the ended event to complete playback.
    lastAudio!.onended!()
    await promise

    expect(revoked).toEqual(created) // every created URL was revoked
  })

  it("revokes the URL when playback errors", async () => {
    const promise = playBlob(new Blob(["x"]))
    lastAudio!.onerror!()
    await expect(promise).rejects.toThrow()
    expect(revoked).toEqual(created)
  })

  it("revokes an outstanding URL on stopAll", async () => {
    // Start playback but never fire ended; stopAll must still revoke.
    void playBlob(new Blob(["x"]))
    expect(created).toHaveLength(1)
    stopAll()
    expect(revoked).toEqual(created)
  })
})

describe("speakWithBrowser fallback", () => {
  it("resolves via SpeechSynthesis onend", async () => {
    let utterance: { onend?: () => void; onerror?: () => void } | null = null
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string
        rate = 1
        pitch = 1
        onend?: () => void
        onerror?: () => void
        constructor(text: string) {
          this.text = text
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- test double captures its instance
          utterance = this
        }
      } as unknown as typeof SpeechSynthesisUtterance
    )
    const speak = vi.fn(() => {
      // Simulate async completion.
      queueMicrotask(() => utterance!.onend?.())
    })
    vi.stubGlobal("window", { speechSynthesis: { speak, cancel: vi.fn() } })
    vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() })

    await speakWithBrowser("hello")
    expect(speak).toHaveBeenCalledOnce()
  })

  it("resolves immediately when synthesis is unavailable", async () => {
    vi.stubGlobal("window", {})
    await expect(speakWithBrowser("hi")).resolves.toBeUndefined()
  })
})
