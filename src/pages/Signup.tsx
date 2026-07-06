import { useEffect } from "react"
import { Link } from "react-router-dom"
import { PhoneCall } from "lucide-react"

import { ROUTES, useNav } from "@/lib/nav"
import { useSession } from "@/hooks/use-session"
import { AuthForm } from "@/components/auth/AuthForm"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Signup page. Same in-page redirect as Login for fully-authed users. Anonymous
 * users are NOT redirected away — this is exactly where they upgrade in place
 * (AuthForm uses linkEmail/linkGoogle when isAnonymous, preserving the uid so
 * demo data carries over — R16).
 */
export default function Signup() {
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
          <AuthForm mode="signup" />
        </CardContent>
      </Card>
    </div>
  )
}
