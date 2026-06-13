// src/pages/Calls.tsx — call history (route /calls, RequireAuth — full accounts
// only). Reads useCallLogs (SELECT-only; clients never write call_logs — R5) and
// renders CallLogRow entries; each is_demo row shows the demo badge.
import { useCallLogs } from "@/hooks/use-call-logs"
import { CallLogRow } from "@/components/calls/CallLogRow"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useNav } from "@/lib/nav"

export default function Calls() {
  const nav = useNav()
  const { data: logs, isLoading, isError, error, refetch } = useCallLogs()

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Call history</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your calls</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            {error?.message ?? "Something went wrong."}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !logs || logs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">You haven&apos;t placed any calls yet.</p>
          <Button className="mt-4" onClick={() => nav.toScripts()}>
            Go to your scripts
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <CallLogRow key={log.id} log={log} onOpen={(id) => nav.toCallDetail(id)} />
          ))}
        </div>
      )}
    </div>
  )
}
