import { cn } from "@/lib/utils"
import type { BrainstormMessage } from "@/lib/demo/types"

export function ConversationBubble({ message }: { message: BrainstormMessage }) {
  const isUser = message.role === "user"
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground"
        )}
      >
        {message.text}
      </div>
    </div>
  )
}
