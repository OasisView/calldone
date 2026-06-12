import { Mic, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { BrainstormStatus } from "@/hooks/use-brainstorm"

interface MicButtonProps {
  status: BrainstormStatus
  supported: boolean
  onStart(): void
  onStop(): void
}

export function MicButton({ status, supported, onStart, onStop }: MicButtonProps) {
  if (!supported) return null
  const listening = status === "listening"
  const busy = status === "thinking" || status === "speaking" || status === "finalized"

  return (
    <div className="relative">
      {listening ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" aria-hidden />
      ) : null}
      <Button
        type="button"
        size="icon"
        variant={listening ? "destructive" : "default"}
        className={cn("relative h-14 w-14 rounded-full", listening && "shadow-lg")}
        disabled={busy}
        onClick={listening ? onStop : onStart}
        aria-label={listening ? "Stop listening" : "Speak your request"}
      >
        {listening ? <Square className="!size-5" /> : <Mic className="!size-6" />}
      </Button>
    </div>
  )
}
