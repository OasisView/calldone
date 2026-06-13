// src/pages/Brainstorm.tsx — the voice-brainstorm experience (frontend.md §2;
// route /brainstorm behind RequireSession, anonymous-demo-allowed). Consumes
// useBrainstorm (which owns recording, transcription, conversation, TTS, and all
// persistence) plus useAudioRecorder only for the isSupported capability flag.
//
// When useBrainstorm exposes finalizedScript, the page navigates to the script
// review screen (frontend.md §3.1: nav.toScriptReview(scriptId)). A 429
// rate_limited error renders a non-retrying cooldown banner (§10 #4).
import { useEffect } from "react"
import { ConversationView } from "@/components/brainstorm/ConversationView"
import { MicButton } from "@/components/brainstorm/MicButton"
import { VoiceStatus } from "@/components/brainstorm/VoiceStatus"
import { TtsFallbackNotice } from "@/components/brainstorm/TtsFallbackNotice"
import { useBrainstorm } from "@/hooks/use-brainstorm"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { useNav } from "@/lib/nav"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"

export default function Brainstorm() {
  const nav = useNav()
  const { isSupported } = useAudioRecorder()
  const {
    status,
    messages,
    error,
    isTtsFallback,
    finalizedScript,
    startRecording,
    stopAndSend,
    cancelRecording,
  } = useBrainstorm()

  // When the hook finalizes a script, hand off to the review screen (§3.1).
  useEffect(() => {
    if (finalizedScript) {
      nav.toScriptReview(finalizedScript.scriptId)
    }
  }, [finalizedScript, nav])

  const isRateLimited = error?.code === "rate_limited"

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plan your call</h1>
        <p className="text-sm text-muted-foreground">
          Talk it through with the assistant. When you're ready, it'll draft a script
          you can review and run as a demo call.
        </p>
      </header>

      {isTtsFallback && <TtsFallbackNotice />}

      {isRateLimited && (
        <Alert variant="destructive">
          <AlertTitle>Slow down a moment</AlertTitle>
          <AlertDescription>
            You've hit the demo rate limit. Please wait a little while before recording
            again — there's no need to retry, just pause and come back shortly.
          </AlertDescription>
        </Alert>
      )}

      {error && !isRateLimited && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Card className="flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col p-4">
          <ConversationView messages={messages} />
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3 pb-2">
        <VoiceStatus status={status} />
        <MicButton
          status={status}
          isSupported={isSupported}
          cooldown={isRateLimited}
          onStart={startRecording}
          onStop={stopAndSend}
          onCancel={cancelRecording}
        />
      </div>
    </main>
  )
}
