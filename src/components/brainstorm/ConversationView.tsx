// src/components/brainstorm/ConversationView.tsx — scrollable transcript of the
// brainstorm. Renders ConversationBubbles; shows an empty-state prompt before the
// first turn and auto-scrolls to the newest message.
import { useEffect, useRef } from "react"
import { ConversationBubble } from "@/components/brainstorm/ConversationBubble"
import type { BrainstormMessage } from "@/hooks/use-brainstorm"

export function ConversationView({ messages }: { messages: BrainstormMessage[] }) {
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <p className="text-base font-medium">Let's plan your call</p>
        <p className="max-w-sm text-sm">
          Tap the mic and tell me who you need to call and what you'd like to get done.
          I'll ask a few questions, then draft a script you can review.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
      {messages.map((message, index) => (
        <ConversationBubble key={index} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  )
}
