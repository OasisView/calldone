// src/pages/Scripts.tsx — the user's saved scripts list (route /scripts,
// RequireAuth — full accounts only). Reads useScripts and renders ScriptCard
// rows; favorite toggling goes through useToggleFavorite. Navigation uses the
// nav abstraction (no direct useNavigate — frontend.md §2).
import { useScripts, useToggleFavorite } from "@/hooks/use-scripts"
import { ScriptCard } from "@/components/calls/ScriptCard"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useNav } from "@/lib/nav"

export default function Scripts() {
  const nav = useNav()
  const { data: scripts, isLoading, isError, error, refetch } = useScripts()
  const toggleFavorite = useToggleFavorite()

  return (
    <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your scripts</h1>
        <Button onClick={() => nav.toBrainstorm()}>New script</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your scripts</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            {error?.message ?? "Something went wrong."}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : !scripts || scripts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground">You don&apos;t have any scripts yet.</p>
          <Button className="mt-4" onClick={() => nav.toBrainstorm()}>
            Brainstorm your first call
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {scripts.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              onOpen={(id) => nav.toScriptReview(id)}
              onToggleFavorite={(id, isFavorite) =>
                toggleFavorite.mutate({ scriptId: id, isFavorite })
              }
              favoritePending={
                toggleFavorite.isPending && toggleFavorite.variables?.scriptId === script.id
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
