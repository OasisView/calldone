// src/components/brainstorm/TtsFallbackNotice.tsx — shown when premium (ElevenLabs)
// TTS was unavailable and the conversation fell back to the browser voice (R7).
// Driven by useBrainstorm().isTtsFallback (lastSource === "browser").
import { Volume2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function TtsFallbackNotice() {
  return (
    <Alert>
      <Volume2 className="h-4 w-4" />
      <AlertDescription>
        Premium voice is unavailable right now, so I'm using your browser's built-in
        voice. The conversation still works normally.
      </AlertDescription>
    </Alert>
  )
}
