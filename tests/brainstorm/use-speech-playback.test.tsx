// tests/brainstorm/use-speech-playback.test.tsx — §10 #3 (the fallback half):
// synthesizeSpeech() returning null (the edge 502/503 fallback signal, R7) drives
// the browser SpeechSynthesis path and sets lastSource === "browser"; a non-null
// blob plays via the premium path and sets lastSource === "elevenlabs".
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const { synthesizeSpeech, playBlob, speakWithBrowser, stopAll } = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn<(text: string) => Promise<Blob | null>>(),
  playBlob: vi.fn<(blob: Blob) => Promise<void>>(),
  speakWithBrowser: vi.fn<(text: string) => Promise<void>>(),
  stopAll: vi.fn(),
}))

vi.mock("@/lib/edge", () => ({ synthesizeSpeech }))
vi.mock("@/lib/audio/tts-player", () => ({ playBlob, speakWithBrowser, stopAll }))

import { useSpeechPlayback } from "@/hooks/use-speech-playback"

beforeEach(() => {
  synthesizeSpeech.mockReset()
  playBlob.mockReset().mockResolvedValue(undefined)
  speakWithBrowser.mockReset().mockResolvedValue(undefined)
  stopAll.mockReset()
})

describe("useSpeechPlayback", () => {
  it("falls back to browser TTS when synthesizeSpeech returns null (R7)", async () => {
    synthesizeSpeech.mockResolvedValue(null)
    const { result } = renderHook(() => useSpeechPlayback())

    await act(async () => {
      await result.current.speak("hello there")
    })

    expect(synthesizeSpeech).toHaveBeenCalledWith("hello there")
    expect(speakWithBrowser).toHaveBeenCalledWith("hello there")
    expect(playBlob).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.lastSource).toBe("browser"))
  })

  it("plays the premium blob when synthesizeSpeech returns audio", async () => {
    synthesizeSpeech.mockResolvedValue(new Blob(["mp3"]))
    const { result } = renderHook(() => useSpeechPlayback())

    await act(async () => {
      await result.current.speak("premium line")
    })

    expect(playBlob).toHaveBeenCalledOnce()
    expect(speakWithBrowser).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.lastSource).toBe("elevenlabs"))
  })

  it("degrades to browser TTS if synthesizeSpeech throws", async () => {
    synthesizeSpeech.mockRejectedValue(new Error("network"))
    const { result } = renderHook(() => useSpeechPlayback())

    await act(async () => {
      await result.current.speak("resilient")
    })

    expect(speakWithBrowser).toHaveBeenCalledWith("resilient")
    await waitFor(() => expect(result.current.lastSource).toBe("browser"))
  })
})
