import { useEffect, type ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { useNav } from "@/lib/nav"
import { useProfile } from "@/hooks/use-profile"
import { useSession } from "@/hooks/use-session"

/**
 * Gate for full (non-anonymous) accounts.
 *
 * - loading → <Skeleton/>
 * - no session → /login
 * - session but isAnonymous → /signup (R17: never /login)
 * - !allowUnonboarded && profile incomplete → /onboarding
 * - else → children
 *
 * Onboarding completeness = profile.display_name != null && profile.time_zone != null.
 */
export function RequireAuth({
  children,
  allowUnonboarded = false,
}: {
  children: ReactNode
  allowUnonboarded?: boolean
}): JSX.Element {
  const nav = useNav()
  const { session, isAnonymous, isLoading: sessionLoading } = useSession()
  const profileQuery = useProfile()

  const profile = profileQuery.data ?? null
  const profileLoading = Boolean(session) && !isAnonymous && profileQuery.isLoading

  const onboardingComplete =
    profile != null &&
    profile.display_name != null &&
    profile.time_zone != null

  const needsOnboarding = !allowUnonboarded && !onboardingComplete

  useEffect(() => {
    if (sessionLoading) return
    if (!session) {
      nav.toLogin()
      return
    }
    if (isAnonymous) {
      nav.toSignup()
      return
    }
    if (profileLoading) return
    if (needsOnboarding) {
      nav.toOnboarding()
    }
  }, [
    sessionLoading,
    session,
    isAnonymous,
    profileLoading,
    needsOnboarding,
    nav,
  ])

  if (sessionLoading || profileLoading) {
    return <Skeleton className="h-32 w-full" />
  }

  if (!session || isAnonymous || needsOnboarding) {
    return <Skeleton className="h-32 w-full" />
  }

  return <>{children}</>
}
