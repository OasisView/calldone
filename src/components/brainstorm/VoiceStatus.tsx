// src/components/brainstorm/VoiceStatus.tsx — the recording/transcribing/thinking/
// speaking indicator (frontend.md §1.1). Pure presentational mapping of the
// BrainstormStatus to a label + animated dot; renders nothing for idle/finalized
// (the page shows its own affordances there).
import { cn } from "@/lib/utils"
import type { BrainstormStatus } from "@/hooks/use-brainstorm"

const STATUS_LABELS: Partial<Record<BrainstormStatus, string>> = {
  recording: "Listening…",
  transcribing: "Transcribing…",
  thinking: "Thinking…",
  speaking: "Speaking…",
}

export function VoiceStatus({ status }: { status: BrainstormStatus }) {
  const label = STATUS_LABELS[status]
  if (!label) return null

  const pulsing = status === "recording" || status === "speaking"

  return (
    <div
      className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          status === "recording" ? "bg-destructive" : "bg-primary",
          pulsing && "animate-pulse"
        )}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  )
}
