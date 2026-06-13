// src/components/brainstorm/MicButton.tsx — the primary push-to-talk control.
// Idle/finalized → "Record"; recording → "Stop & send" (plus a Cancel affordance);
// transcribing/thinking/speaking → disabled (a turn is in flight). Unsupported
// browsers show a disabled state with an explanation.
import { Mic, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { BrainstormStatus } from "@/hooks/use-brainstorm"

export interface MicButtonProps {
  status: BrainstormStatus
  isSupported: boolean
  /** True while a 429 cooldown is active — the control is disabled, no auto-retry. */
  cooldown?: boolean
  onStart(): void
  onStop(): void
  onCancel(): void
}

export function MicButton({
  status,
  isSupported,
  cooldown = false,
  onStart,
  onStop,
  onCancel,
}: MicButtonProps) {
  if (!isSupported) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button size="lg" variant="secondary" disabled>
          <Mic />
          Mic unavailable
        </Button>
        <p className="text-xs text-muted-foreground">
          Recording isn't supported in this browser.
        </p>
      </div>
    )
  }

  if (status === "recording") {
    return (
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          variant="destructive"
          onClick={onStop}
          aria-label="Stop recording and send"
        >
          <Square />
          Stop &amp; send
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onCancel}
          aria-label="Cancel recording"
        >
          <X />
        </Button>
      </div>
    )
  }

  const busy =
    status === "transcribing" || status === "thinking" || status === "speaking"

  return (
    <Button
      size="lg"
      onClick={onStart}
      disabled={busy || cooldown}
      aria-label="Start recording"
    >
      <Mic />
      {cooldown ? "Please wait" : "Record"}
    </Button>
  )
}
