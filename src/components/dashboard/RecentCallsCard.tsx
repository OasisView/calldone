import { format } from "date-fns"
import { Phone } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { CallLog } from "@/types/database"
import { TERMINAL_CALL_STATUSES, type CallStatus } from "@/types/api"
import { useNav } from "@/lib/nav"
import { useCallLogs } from "@/hooks/use-call-logs"

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "completed") return "default"
  if ((TERMINAL_CALL_STATUSES as readonly string[]).includes(status)) {
    return status === "failed" ? "destructive" : "secondary"
  }
  return "secondary"
}

function CallRow({ log }: { log: CallLog }) {
  const nav = useNav()
  return (
    <li>
      <button
        type="button"
        onClick={() => nav.toCallDetail(log.id)}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {log.phone_number_called ?? "Demo call"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {format(new Date(log.created_at), "MMM d, h:mm a")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {log.is_demo ? (
            <Badge variant="outline" className="text-[10px]">
              Demo
            </Badge>
          ) : null}
          <Badge variant={statusVariant(log.status as CallStatus)} className="capitalize">
            {log.status.replace(/_/g, " ")}
          </Badge>
        </span>
      </button>
    </li>
  )
}

/** Recent calls list on the dashboard, consuming useCallLogs (ws/calls-ui). */
export function RecentCallsCard() {
  const nav = useNav()
  const { data, isLoading, isError } = useCallLogs()
  const logs = (data ?? []).slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
            Recent calls
          </CardTitle>
          <CardDescription>Your latest call results.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => nav.toCalls()}>
          View all
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load your calls.</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No calls yet. Start a new call to see results here.
          </p>
        ) : (
          <ul className="space-y-1">
            {logs.map((log) => (
              <CallRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
