import { useNav } from "@/lib/nav"

export default function Dashboard() {
  const nav = useNav()

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container">
        <button
          onClick={nav.toLanding}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to landing
        </button>
        <h1 className="mt-4 text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Phase 1 will add auth and the real dashboard here.
        </p>
      </div>
    </div>
  )
}
