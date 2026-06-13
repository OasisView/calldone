// tests/brainstorm/recorder.test.ts — §10 #1: the recorder hard-stops at
// LIMITS.AUDIO_MAX_SECONDS and rejects blobs over LIMITS.AUDIO_MAX_BYTES client-side
// BEFORE upload. Also covers mic-track release on stop/cancel and getUserMedia
// permission errors mapping to typed ApiErrors.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { startRecording, pickSupportedMimeType } from "@/lib/audio/recorder"
import { LIMITS } from "@/types/api"

// ----------------------------------------------------------------- mocks ---

/** A controllable MediaRecorder stand-in. start()/stop() drive listeners; tests
 *  push chunks and fire "stop" to resolve the recorder's stop() promise. */
class FakeMediaRecorder {
  static lastInstance: FakeMediaRecorder | null = null
  static isTypeSupported = vi.fn((t: string) => t === "audio/webm;codecs=opus")

  state: "inactive" | "recording" = "inactive"
  mimeType: string
  private listeners: Record<string, ((ev: unknown) => void)[]> = {}
  /** Bytes to emit as a single chunk when stop() is called. */
  chunkSize = 1000

  constructor(_stream: MediaStream, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? ""
    FakeMediaRecorder.lastInstance = this
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    ;(this.listeners[type] ??= []).push(cb)
  }
  private emit(type: string, ev: unknown) {
    for (const cb of this.listeners[type] ?? []) cb(ev)
  }
  start() {
    this.state = "recording"
  }
  stop() {
    this.state = "inactive"
    // Emit one chunk then the stop event, mirroring the real ordering.
    this.emit("dataavailable", { data: new Blob([new Uint8Array(this.chunkSize)]) })
    this.emit("stop", {})
  }
}

const stoppedTracks: string[] = []
function fakeStream(): MediaStream {
  const track = {
    stop: () => stoppedTracks.push("stopped"),
  } as unknown as MediaStreamTrack
  return { getTracks: () => [track] } as unknown as MediaStream
}

let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  stoppedTracks.length = 0
  FakeMediaRecorder.lastInstance = null
  FakeMediaRecorder.isTypeSupported = vi.fn(
    (t: string) => t === "audio/webm;codecs=opus"
  )
  getUserMedia = vi.fn(async () => fakeStream())

  vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown as typeof MediaRecorder)
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia },
  })
  vi.stubGlobal(
    "Blob",
    class FakeBlob {
      size: number
      type: string
      constructor(parts: BlobPart[] = [], opts?: { type?: string }) {
        this.size = parts.reduce((n, p) => {
          if (p instanceof Uint8Array) return n + p.byteLength
          if (typeof p === "string") return n + p.length
          if (p && typeof (p as { size?: number }).size === "number")
            return n + (p as { size: number }).size
          return n
        }, 0)
        this.type = opts?.type ?? ""
      }
    } as unknown as typeof Blob
  )
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ----------------------------------------------------------------- tests ---

describe("pickSupportedMimeType", () => {
  it("prefers opus-in-webm when supported", () => {
    expect(pickSupportedMimeType()).toBe("audio/webm;codecs=opus")
  })
})

describe("byte-cap guard (LIMITS.AUDIO_MAX_BYTES)", () => {
  it("resolves a blob at or under the cap", async () => {
    const handle = await startRecording()
    FakeMediaRecorder.lastInstance!.chunkSize = 1000
    const { blob } = await handle.stop()
    expect(blob.size).toBeLessThanOrEqual(LIMITS.AUDIO_MAX_BYTES)
  })

  it("REJECTS a blob over the cap before any upload", async () => {
    const handle = await startRecording()
    // One oversized chunk pushes the assembled blob past the byte limit.
    FakeMediaRecorder.lastInstance!.chunkSize = LIMITS.AUDIO_MAX_BYTES + 1
    await expect(handle.stop()).rejects.toMatchObject({
      code: "payload_too_large",
      message: expect.any(String),
    })
  })
})

describe("hard-stop at LIMITS.AUDIO_MAX_SECONDS", () => {
  it("stops the underlying recorder when the cap timer fires", async () => {
    const handle = await startRecording()
    const rec = FakeMediaRecorder.lastInstance!
    expect(rec.state).toBe("recording")

    // Advance past the 60 s hard-stop; the recorder is auto-stopped.
    vi.advanceTimersByTime(LIMITS.AUDIO_MAX_SECONDS * 1000)
    expect(rec.state).toBe("inactive")

    // A subsequent stop() still resolves with the captured (capped) audio.
    rec.chunkSize = 500
    const { blob } = await handle.stop()
    expect(blob.size).toBeLessThanOrEqual(LIMITS.AUDIO_MAX_BYTES)
  })
})

describe("mic-track release", () => {
  it("stops tracks on stop()", async () => {
    const handle = await startRecording()
    await handle.stop()
    expect(stoppedTracks.length).toBeGreaterThan(0)
  })

  it("stops tracks on cancel()", async () => {
    const handle = await startRecording()
    handle.cancel()
    expect(stoppedTracks.length).toBeGreaterThan(0)
  })
})

describe("getUserMedia errors", () => {
  it("maps a permission denial to a typed forbidden ApiError", async () => {
    getUserMedia.mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError")
    )
    await expect(startRecording()).rejects.toMatchObject({ code: "forbidden" })
  })
})
