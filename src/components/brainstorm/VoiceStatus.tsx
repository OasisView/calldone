import { Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { BrainstormStatus } from "@/hooks/use-brainstorm"

const STATUS_LABELS: Record<BrainstormStatus, string> = {
  idle: "Tap the mic or type below",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  finalized: "Script ready!",
}

interface VoiceStatusProps {
  status: BrainstormStatus
  micError: string | null
  voiceEnabled: boolean
  onToggleVoice(enabled: boolean): void
}

export function VoiceStatus({ status, micError, voiceEnabled, onToggleVoice }: VoiceStatusProps) {
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span aria-live="polite">
        {micError === "not-allowed"
          ? "Microphone blocked — typing works just as well!"
          : micError === "unsupported"
            ? "This browser has no speech input — type below instead."
            : STATUS_LABELS[status]}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onToggleVoice(!voiceEnabled)}
        aria-label={voiceEnabled ? "Mute spoken replies" : "Unmute spoken replies"}
      >
        {voiceEnabled ? <Volume2 className="!size-4" /> : <VolumeX className="!size-4" />}
      </Button>
    </div>
  )
}
