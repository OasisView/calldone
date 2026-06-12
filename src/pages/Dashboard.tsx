import { Link } from "react-router-dom"
import { FileText, Phone, Plus } from "lucide-react"

import { DemoBadge } from "@/components/DemoBadge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useCallLogs } from "@/hooks/use-calls"
import { useScripts } from "@/hooks/use-scripts"
import { routePath, ROUTES, useNav } from "@/lib/nav"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function Dashboard() {
  const nav = useNav()
  const { data: scripts = [] } = useScripts()
  const { data: calls = [] } = useCallLogs()
  const scriptById = new Map(scripts.map((s) => [s.id, s]))

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

      <main className="container max-w-3xl space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your calls</h1>
          <Button type="button" onClick={nav.toBrainstorm}>
            <Plus /> New call
          </Button>
        </div>

        {scripts.length === 0 && calls.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nothing here yet</CardTitle>
              <CardDescription>
                Start a brainstorm and Calldone will draft your first call
                script. Everything stays in this browser.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={nav.toBrainstorm}>
                <Plus /> Try the demo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Phone className="h-4 w-4" aria-hidden /> Recent calls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {calls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calls yet.</p>
                ) : (
                  calls.slice(0, 6).map((call) => (
                    <Link
                      key={call.id}
                      to={routePath(ROUTES.callDetail, { callLogId: call.id })}
                      className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <span className="truncate pr-2">
                        {scriptById.get(call.scriptId)?.callPurpose ?? "Call"}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={call.status === "completed" ? "secondary" : "outline"}>
                          {call.status === "completed" ? "done" : "live"}
                        </Badge>
                        {formatDate(call.createdAt)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-4 w-4" aria-hidden /> Scripts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {scripts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No scripts yet.</p>
                ) : (
                  scripts.slice(0, 6).map((script) => (
                    <Link
                      key={script.id}
                      to={routePath(ROUTES.scriptReview, { scriptId: script.id })}
                      className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <span className="truncate pr-2">{script.callPurpose}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(script.createdAt)}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
