import { Link } from "react-router-dom"
import { ArrowRight, CalendarCheck, Mic, PhoneCall } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ROUTES, useNav } from "@/lib/nav"
import { ThemeToggle } from "@/components/layout/ThemeToggle"

const FEATURES = [
  {
    icon: Mic,
    title: "Talk it through",
    body: "Describe the call out loud. We turn it into a clear, polite script in seconds.",
  },
  {
    icon: PhoneCall,
    title: "We make the call",
    body: "An AI voice places the call, navigates the menu, and handles the conversation.",
  },
  {
    icon: CalendarCheck,
    title: "Get the result",
    body: "Read the transcript and download any appointment straight to your calendar.",
  },
] as const

/**
 * Public marketing landing page (SSG-prerendered). "Try the demo" navigates to
 * /brainstorm; the anonymous session is minted there by RequireSession, NEVER
 * on this render (security gate, §3 ws/auth-ui #3 — crawlers must not mint
 * users). This component imports neither use-session nor @/lib/supabase.
 */
export default function Landing() {
  const nav = useNav()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <PhoneCall className="h-5 w-5 text-primary" aria-hidden />
          <span>Calldone</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <Link to={ROUTES.login}>Log in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="flex flex-col items-center gap-6 py-20 text-center">
          <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Let an AI make the call you&apos;ve been putting off
          </h1>
          <p className="max-w-xl text-pretty text-lg text-muted-foreground">
            Booking appointments, confirming reservations, chasing down details — describe it once
            and Calldone handles the phone call for you.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => nav.toBrainstorm()}>
              Try the demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to={ROUTES.signup}>Create an account</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">No signup required to try it.</p>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="h-6 w-6 text-primary" aria-hidden />
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="pb-24">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="items-center text-center">
              <CardTitle className="text-2xl">Ready to skip the hold music?</CardTitle>
              <CardDescription>Try a demo call now — it takes about a minute.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button size="lg" onClick={() => nav.toBrainstorm()}>
                Try the demo
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-4 text-sm text-muted-foreground">
          Calldone — AI phone calls, done for you.
        </div>
      </footer>
    </div>
  )
}
