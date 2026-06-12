import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"
import type { TranscriptLine } from "@/lib/demo/types"

interface CallTranscriptProps {
  lines: TranscriptLine[]
  revealedCount: number
  isLive: boolean
  /** Who's on the other end, e.g. "Walgreens". */
  targetName: string
}

export function CallTranscript({ lines, revealedCount, isLive, targetName }: CallTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const visible = lines.slice(0, revealedCount)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [revealedCount])

  return (
    <div className="space-y-3" aria-live="polite">
      {visible.map((line, i) => (
        <div key={i} className={cn("flex", line.speaker === "agent" ? "justify-end" : "justify-start")}>
          <div className="max-w-[85%]">
            <p className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
              {line.speaker === "agent" ? "Calldone agent" : targetName}
            </p>
            <div
              className={cn(
                "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                line.speaker === "agent"
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted text-foreground"
              )}
            >
              {line.text}
            </div>
          </div>
        </div>
      ))}
      {isLive ? (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
            </span>
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  )
}
