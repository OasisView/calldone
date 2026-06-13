// src/components/calls/ScriptCard.tsx — one row in the Scripts list. Shows the
// purpose/snippet + favorite toggle and opens ScriptReview on click. Pure
// presentational: it takes a CallScript and callbacks; data access stays in
// hooks (frontend.md §3.1).
import { Star } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { CallScript } from "@/types/database"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ScriptCardProps {
  script: CallScript
  onOpen: (scriptId: string) => void
  onToggleFavorite: (scriptId: string, isFavorite: boolean) => void
  favoritePending?: boolean
}

function snippet(text: string, max = 160): string {
  const clean = text.trim().replace(/\s+/g, " ")
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean
}

export function ScriptCard({
  script,
  onOpen,
  onToggleFavorite,
  favoritePending,
}: ScriptCardProps) {
  const title = script.call_purpose?.trim() || "Untitled script"
  return (
    <Card className="transition-colors hover:border-primary/50">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <button
          type="button"
          className="text-left"
          onClick={() => onOpen(script.id)}
          aria-label={`Open script: ${title}`}
        >
          <CardTitle className="text-base">{title}</CardTitle>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={script.is_favorite}
          aria-label={script.is_favorite ? "Remove from favorites" : "Add to favorites"}
          disabled={favoritePending}
          onClick={() => onToggleFavorite(script.id, !script.is_favorite)}
        >
          <Star
            className={cn(
              "h-4 w-4",
              script.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
            )}
          />
        </Button>
      </CardHeader>
      <CardContent>
        <button type="button" className="block w-full text-left" onClick={() => onOpen(script.id)}>
          <p className="text-sm text-muted-foreground">{snippet(script.script_text)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Updated {formatDistanceToNow(new Date(script.updated_at), { addSuffix: true })}
          </p>
        </button>
      </CardContent>
    </Card>
  )
}
