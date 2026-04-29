import { Link } from "react-router-dom"

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold">Calldone</h1>
          <nav className="flex gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium hover:underline"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="container py-24">
        <section className="mx-auto max-w-2xl text-center">
          <h2 className="text-5xl font-bold tracking-tight">
            The AI phone agent that makes calls for you.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Tell Calldone what you need done. It calls the pharmacy, books the
            reservation, schedules the appointment. You get a transcript and a
            calendar invite when it's done.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try the demo
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Built by OasisView
        </div>
      </footer>
    </div>
  )
}
