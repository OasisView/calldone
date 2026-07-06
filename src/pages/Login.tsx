import { useEffect } from "react"
import { Link } from "react-router-dom"
import { PhoneCall } from "lucide-react"

import { ROUTES, useNav } from "@/lib/nav"
import { useSession } from "@/hooks/use-session"
import { AuthForm } from "@/components/auth/AuthForm"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Login page. In-page redirect: an authenticated NON-anonymous user is already
 * signed in → send to the dashboard. Anonymous sessions stay (they may want to
 * log into a different existing account).
 */
export default function Login() {
  const nav = useNav()
  const { session, isAnonymous, isLoading } = useSession()

  useEffect(() => {
    if (isLoading) return
    if (session && !isAnonymous) {
      nav.toDashboard()
    }
  }, [isLoading, session, isAnonymous, nav])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link
        to={ROUTES.landing}
        className="mb-8 flex items-center gap-2 font-semibold tracking-tight"
      >
        <PhoneCall className="h-5 w-5 text-primary" aria-hidden />
        <span>Calldone</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <AuthForm mode="login" />
        </CardContent>
      </Card>
    </div>
  )
}
