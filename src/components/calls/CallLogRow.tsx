// src/components/calls/CallLogRow.tsx — one row in the Calls history list.
// ALWAYS renders the demo badge for is_demo rows (security.md §10 ws/calls-ui
// item 2 — no UI state may imply a real call happened). Status comes straight
// from the polled call_logs row; this component never mutates anything.
import { formatDistanceToNow } from "date-fns"
import { Phone } from "lucide-react"
import type { CallLog } from "@/types/database"
import { Badge } from "@/components/ui/badge"
import { CallStatusBadge } from "@/components/calls/CallProgressCard"

export interface CallLogRowProps {
  log: CallLog
  onOpen: (callLogId: string) => void
}

export function CallLogRow({ log, onOpen }: CallLogRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(log.id)}
      className="flex w-full items-center justify-between gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50"
      aria-label={`Open call to ${log.phone_number_called ?? "unknown number"}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Phone className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{log.phone_number_called ?? "Unknown number"}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {log.is_demo ? (
          <Badge variant="secondary" data-testid="demo-badge">
            Demo
          </Badge>
        ) : null}
        <CallStatusBadge status={log.status} />
      </div>
    </button>
  )
}
