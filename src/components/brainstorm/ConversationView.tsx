import { useEffect, useRef } from "react"

import { ConversationBubble } from "./ConversationBubble"
import type { BrainstormMessage } from "@/lib/demo/types"

interface ConversationViewProps {
  messages: BrainstormMessage[]
  /** Live partial speech transcript, rendered as a pending user bubble. */
  interimText?: string
  isThinking?: boolean
}

export function ConversationView({ messages, interimText, isThinking }: ConversationViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, interimText, isThinking])

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-1 py-4" aria-live="polite">
      {messages.map((message, i) => (
        <ConversationBubble key={i} message={message} />
      ))}
      {interimText ? (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/60 px-4 py-2.5 text-sm italic text-primary-foreground">
            {interimText}…
          </div>
        </div>
      ) : null}
      {isThinking ? (
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
