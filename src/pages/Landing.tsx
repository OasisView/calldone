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
          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              to="/brainstorm"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try the demo
            </Link>
            <p className="text-xs text-muted-foreground">
              Free interactive demo — runs entirely in your browser. No sign-up,
              no real calls placed.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-24 grid max-w-4xl gap-8 text-center sm:grid-cols-3">
          <div>
            <div className="text-3xl">🎙️</div>
            <h3 className="mt-3 font-semibold">1. Say what you need</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Talk (or type) like you would to a friend: “Refill my
              prescription at Walgreens.”
            </p>
          </div>
          <div>
            <div className="text-3xl">📝</div>
            <h3 className="mt-3 font-semibold">2. Review the script</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Calldone asks a couple of questions, then drafts exactly what
              it will say on the call.
            </p>
          </div>
          <div>
            <div className="text-3xl">📅</div>
            <h3 className="mt-3 font-semibold">3. Get it done</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Watch the call happen, read the transcript, and add the
              confirmed appointment to your calendar.
            </p>
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
