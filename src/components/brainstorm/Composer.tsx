import { useState, type FormEvent } from "react"
import { SendHorizonal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ComposerProps {
  disabled?: boolean
  placeholder?: string
  onSend(text: string): void
}

/** Typed input — the always-available fallback to the microphone. */
export function Composer({ disabled, placeholder, onSend }: ComposerProps) {
  const [value, setValue] = useState("")

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const text = value.trim()
    if (!text) return
    onSend(text)
    setValue("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? "Or type it here…"}
        disabled={disabled}
        aria-label="Type your request"
      />
      <Button type="submit" size="icon" disabled={disabled || !value.trim()} aria-label="Send">
        <SendHorizonal />
      </Button>
    </form>
  )
}
