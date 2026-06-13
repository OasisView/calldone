import { useEffect, useRef, type ReactNode } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { useSession } from "@/hooks/use-session"

/**
 * Anonymous-demo-allowed gate.
 *
 * - no session → useSession().ensureSession() (signInAnonymously), render children
 *   once resolved.
 * - loading or while ensuring → <Skeleton/>
 * - session present → children
 *
 * A real auth.users row + JWT is always established before children render, so
 * auth.uid()-based RLS works for demo visitors (frontend.md §0.1).
 */
export function RequireSession({
  children,
}: {
  children: ReactNode
}): JSX.Element {
  const { session, isLoading, ensureSession } = useSession()
  const ensuringRef = useRef(false)

  useEffect(() => {
    if (isLoading) return
    if (session) return
    if (ensuringRef.current) return
    ensuringRef.current = true
    void ensureSession().finally(() => {
      ensuringRef.current = false
    })
  }, [isLoading, session, ensureSession])

  if (!session) {
    return <Skeleton className="h-32 w-full" />
  }

  return <>{children}</>
}
