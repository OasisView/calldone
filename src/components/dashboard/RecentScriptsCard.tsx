import { format } from "date-fns"
import { FileText, Star } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { CallScript } from "@/types/database"
import { useNav } from "@/lib/nav"
import { useScripts } from "@/hooks/use-scripts"

function ScriptRow({ script }: { script: CallScript }) {
  const nav = useNav()
  const title = script.call_purpose?.trim() || script.script_text.slice(0, 60)
  return (
    <li>
      <button
        type="button"
        onClick={() => nav.toScriptReview(script.id)}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">
            {format(new Date(script.created_at), "MMM d, h:mm a")}
          </span>
        </span>
        {script.is_favorite ? (
          <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" aria-label="Favorite" />
        ) : null}
      </button>
    </li>
  )
}

/** Recent scripts list on the dashboard, consuming useScripts (ws/calls-ui). */
export function RecentScriptsCard() {
  const nav = useNav()
  const { data, isLoading, isError } = useScripts()
  const scripts = (data ?? []).slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
            Recent scripts
          </CardTitle>
          <CardDescription>Scripts you&apos;ve drafted.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => nav.toScripts()}>
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
          <p className="text-sm text-muted-foreground">Couldn&apos;t load your scripts.</p>
        ) : scripts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scripts yet. Brainstorm one to get started.
          </p>
        ) : (
          <ul className="space-y-1">
            {scripts.map((script) => (
              <ScriptRow key={script.id} script={script} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
