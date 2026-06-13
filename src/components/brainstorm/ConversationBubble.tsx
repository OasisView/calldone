// src/components/brainstorm/ConversationBubble.tsx — one conversation turn.
// Content is rendered as a plain text node (NEVER dangerouslySetInnerHTML, §10 #2);
// transcript text is untrusted model/user input.
import { cn } from "@/lib/utils"
import type { BrainstormMessage } from "@/hooks/use-brainstorm"

export function ConversationBubble({ message }: { message: BrainstormMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground"
        )}
      >
        <span className="mb-0.5 block text-xs font-medium opacity-70">
          {isUser ? "You" : "Assistant"}
        </span>
        {message.text}
      </div>
    </div>
  )
}
