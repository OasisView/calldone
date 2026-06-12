import { Link, useParams } from "react-router-dom"
import { LayoutDashboard, Phone, PhoneCall, Plus } from "lucide-react"

import { DemoBadge } from "@/components/DemoBadge"
import { AppointmentCard } from "@/components/calls/AppointmentCard"
import { CallTranscript } from "@/components/calls/CallTranscript"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useCallLog, useCallPlayback } from "@/hooks/use-calls"
import { useScript } from "@/hooks/use-scripts"
import { useNav } from "@/lib/nav"

export default function Call() {
  const { callLogId = "" } = useParams()
  const nav = useNav()
  const { data: log, isLoading } = useCallLog(callLogId)
  const { data: script } = useScript(log?.scriptId ?? "")
  const playback = useCallPlayback(log)

  const targetName = script?.targetName ?? "Recipient"
  const done = log?.status === "completed" || (log != null && !playback.isLive)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="text-sm font-semibold">
            Calldone
          </Link>
          <DemoBadge />
        </div>
      </header>

      <main className="container max-w-2xl space-y-6 py-8">
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : !log ? (
          <Card>
            <CardHeader>
              <CardTitle>Call not found</CardTitle>
              <CardDescription>
                It may have been cleared from this browser.{" "}
                <Link to="/brainstorm" className="underline">
                  Start a new call
                </Link>
                .
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  {playback.isLive ? (
                    <>
                      <span className="relative flex h-5 w-5 items-center justify-center">
                        <span className="absolute h-full w-full animate-ping rounded-full bg-green-500/50" />
                        <PhoneCall className="relative h-4 w-4 text-green-600" aria-hidden />
                      </span>
                      Calling {targetName}…
                    </>
                  ) : (
                    <>
                      <Phone className="h-5 w-5" aria-hidden /> Call with {targetName} complete
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {script?.callPurpose ?? "Simulated call"} — simulated live in your
                  browser; no phone was dialed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CallTranscript
                  lines={log.transcript}
                  revealedCount={playback.revealedCount}
                  isLive={playback.isLive}
                  targetName={targetName}
                />
              </CardContent>
            </Card>

            {done && log.appointment ? (
              <AppointmentCard appointment={log.appointment} callLogId={log.id} />
            ) : null}

            {done ? (
              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={nav.toDashboard}>
                  <LayoutDashboard /> Dashboard
                </Button>
                <Button type="button" className="flex-1" onClick={nav.toBrainstorm}>
                  <Plus /> New call
                </Button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
