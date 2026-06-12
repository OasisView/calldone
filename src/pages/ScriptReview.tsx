import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, PhoneCall } from "lucide-react"

import { DemoBadge } from "@/components/DemoBadge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useStartCall } from "@/hooks/use-calls"
import { useScript, useUpdateScript } from "@/hooks/use-scripts"
import { useNav } from "@/lib/nav"

export default function ScriptReview() {
  const { scriptId = "" } = useParams()
  const nav = useNav()
  const { data: script, isLoading } = useScript(scriptId)
  const updateScript = useUpdateScript()
  const startCall = useStartCall()

  const [text, setText] = useState("")
  const [phone, setPhone] = useState("")

  useEffect(() => {
    if (script) setText(script.scriptText)
  }, [script])

  function handleBlur() {
    if (script && text.trim() && text !== script.scriptText) {
      updateScript.mutate({ scriptId: script.id, scriptText: text })
    }
  }

  function handleCallNow() {
    if (!script) return
    handleBlur()
    startCall.mutate(
      { scriptId: script.id, phoneNumber: phone.trim() || null },
      { onSuccess: (log) => nav.toCallDetail(log.id) }
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <Link
            to="/brainstorm"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to brainstorm
          </Link>
          <DemoBadge />
        </div>
      </header>

      <main className="container max-w-2xl py-8">
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !script ? (
          <Card>
            <CardHeader>
              <CardTitle>Script not found</CardTitle>
              <CardDescription>
                It may have been cleared from this browser.{" "}
                <Link to="/brainstorm" className="underline">
                  Start a new brainstorm
                </Link>
                .
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{script.callPurpose}</CardTitle>
              <CardDescription>
                Review the script your agent will follow. Edit anything — then
                place the (simulated) call.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="script-text">Call script</Label>
                <Textarea
                  id="script-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={handleBlur}
                  rows={12}
                  className="font-mono text-sm leading-relaxed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 555 0100"
                />
                <p className="text-xs text-muted-foreground">
                  Demo mode: this number is never dialed — the call below is fully
                  simulated in your browser.
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={handleCallNow}
                disabled={startCall.isPending || !text.trim()}
              >
                <PhoneCall /> {startCall.isPending ? "Connecting…" : "Call now"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
