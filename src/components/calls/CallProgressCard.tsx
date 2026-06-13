// src/components/calls/CallProgressCard.tsx — the live status panel on
// CallDetail while useCallLog polls. Renders the current call_logs.status, a
// spinner for non-terminal states, the demo badge for is_demo rows (always —
// security.md §10 ws/calls-ui item 2), and a retry affordance when polling
// times out (api.md §6 step 9). Also exports CallStatusBadge, reused by
// CallLogRow.
import { Loader2, PhoneCall, PhoneOff, CheckCircle2, AlertTriangle } from "lucide-react"
import type { CallLog } from "@/types/database"
import { TERMINAL_CALL_STATUSES, type CallStatus } from "@/types/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const STATUS_LABELS: Record<string, string> = {
  initiated: "Dialing",
  ringing: "Ringing",
  completed: "Completed",
  failed: "Failed",
  no_answer: "No answer",
  busy: "Busy",
}

function isTerminal(status: string): boolean {
  return (TERMINAL_CALL_STATUSES as readonly string[]).includes(status)
}

function badgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default"
  if (status === "failed" || status === "no_answer" || status === "busy") return "destructive"
  return "secondary"
}

/** Compact status pill used in both the progress card and the history rows. */
export function CallStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={badgeVariant(status)}>{STATUS_LABELS[status] ?? status}</Badge>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (!isTerminal(status)) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  if (status === "completed") return <CheckCircle2 className="h-5 w-5 text-green-600" />
  if (status === "no_answer" || status === "busy")
    return <PhoneOff className="h-5 w-5 text-destructive" />
  return <AlertTriangle className="h-5 w-5 text-destructive" />
}

export interface CallProgressCardProps {
  log: CallLog
  /** True while useCallLog is actively polling a non-terminal row. */
  isPolling?: boolean
  /** Set when polling timed out (useCallLog surfaced a retryable error). */
  timedOut?: boolean
  onRetry?: () => void
}

export function CallProgressCard({ log, isPolling, timedOut, onRetry }: CallProgressCardProps) {
  const status = log.status as CallStatus
  const terminal = isTerminal(status)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneCall className="h-4 w-4" />
          {log.phone_number_called ?? "Demo call"}
        </CardTitle>
        {log.is_demo ? (
          <Badge variant="secondary" data-testid="demo-badge">
            Demo
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <StatusIcon status={status} />
          <div>
            <CallStatusBadge status={status} />
            {!terminal && isPolling ? (
              <p className="mt-1 text-xs text-muted-foreground">
                We&apos;re placing your demo call and listening for the result…
              </p>
            ) : null}
          </div>
        </div>

        {log.duration_seconds != null ? (
          <p className="text-sm text-muted-foreground">
            Duration: {log.duration_seconds}s
          </p>
        ) : null}

        {log.error_reason ? (
          <p className="text-sm text-destructive">{log.error_reason}</p>
        ) : null}

        {timedOut ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">
              The demo call didn&apos;t complete in time.
            </p>
            {onRetry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={onRetry}
              >
                Check again
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
