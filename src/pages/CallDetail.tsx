// src/pages/CallDetail.tsx — live + historical view of a single call (route
// /calls/:callLogId, RequireSession — anonymous-demo-allowed; polls while in
// progress). useCallLog polls call_logs at LIMITS.POLL_INTERVAL_MS until a
// terminal status, timing out at LIMITS.POLL_TIMEOUT_MS (R17). Renders
// CallProgressCard, CallTranscript, and AppointmentCard (client-side .ics, R18)
// when an appointment was extracted. Status is read-only — no client call_logs
// mutation exists anywhere (R5).
import { useParams } from "react-router-dom"
import { useCallLog, isTerminalCallStatus } from "@/hooks/use-call-logs"
import { useSession } from "@/hooks/use-session"
import { CallProgressCard } from "@/components/calls/CallProgressCard"
import { CallTranscript } from "@/components/calls/CallTranscript"
import { AppointmentCard } from "@/components/calls/AppointmentCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useNav } from "@/lib/nav"

export default function CallDetail() {
  const nav = useNav()
  const { user } = useSession()
  const { callLogId = "" } = useParams<{ callLogId: string }>()
  const {
    data: log,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCallLog(callLogId, { poll: true })

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6 sm:p-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  // The hook surfaces a retryable error either on a real fetch failure or when
  // the poll window elapsed with the row still non-terminal (the timeout state).
  const timedOut = isError && Boolean(log) && !isTerminalCallStatus(log!.status)

  if (isError && !log) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
        <Alert variant="destructive">
          <AlertTitle>Call not found</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            {error?.message ?? "This call doesn't exist or isn't available."}
            <Button variant="outline" size="sm" onClick={() => nav.toCalls()}>
              Back to calls
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!log) return null

  const terminal = isTerminalCallStatus(log.status)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Call details</h1>
        <Button variant="ghost" size="sm" onClick={() => nav.toCalls()}>
          Back to calls
        </Button>
      </div>

      <CallProgressCard
        log={log}
        isPolling={isFetching && !terminal}
        timedOut={timedOut}
        onRetry={() => refetch()}
      />

      {log.appointment_details ? (
        <AppointmentCard
          appointment={log.appointment_details}
          uid={log.id}
          organizerName={user?.user_metadata?.display_name as string | undefined}
        />
      ) : null}

      {terminal ? <CallTranscript transcript={log.transcript} /> : null}
    </div>
  )
}
