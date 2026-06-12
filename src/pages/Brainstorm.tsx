import { useEffect } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

import { DemoBadge } from "@/components/DemoBadge"
import { Composer } from "@/components/brainstorm/Composer"
import { ConversationView } from "@/components/brainstorm/ConversationView"
import { ExamplePrompts } from "@/components/brainstorm/ExamplePrompts"
import { MicButton } from "@/components/brainstorm/MicButton"
import { VoiceStatus } from "@/components/brainstorm/VoiceStatus"
import { useBrainstorm } from "@/hooks/use-brainstorm"
import { useNav } from "@/lib/nav"

export default function Brainstorm() {
  const nav = useNav()
  const brainstorm = useBrainstorm()
  const {
    status,
    messages,
    interimText,
    micSupported,
    micError,
    voiceEnabled,
    setVoiceEnabled,
    finalizedScript,
    startListening,
    stopListening,
    sendText,
  } = brainstorm

  // Once the script is finalized (and any closing speech is done), move on.
  useEffect(() => {
    if (!finalizedScript) return
    const timer = setTimeout(() => nav.toScriptReview(finalizedScript.scriptId), 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizedScript])

  const busy = status !== "idle" && status !== "listening"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Calldone
          </Link>
          <DemoBadge />
        </div>
      </header>

      <main className="container flex w-full max-w-2xl flex-1 flex-col pb-6">
        <ConversationView
          messages={messages}
          interimText={interimText}
          isThinking={status === "thinking"}
        />

        {messages.length === 1 ? (
          <div className="pb-4">
            <ExamplePrompts onPick={sendText} />
          </div>
        ) : null}

        <div className="space-y-3 border-t border-border pt-4">
          <VoiceStatus
            status={status}
            micError={micError}
            voiceEnabled={voiceEnabled}
            onToggleVoice={setVoiceEnabled}
          />
          <div className="flex items-center justify-center">
            <MicButton
              status={status}
              supported={micSupported}
              onStart={startListening}
              onStop={stopListening}
            />
          </div>
          <Composer
            disabled={busy || status === "listening"}
            onSend={sendText}
            placeholder={micSupported ? "Or type it here…" : "Type what you need handled…"}
          />
        </div>
      </main>
    </div>
  )
}
