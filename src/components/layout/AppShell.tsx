import type { ReactNode } from "react"

import { AppHeader } from "@/components/layout/AppHeader"

/**
 * Page chrome for authenticated routes: the AppHeader plus a centered content
 * column. Guards (RequireAuth) wrap the routes; AppShell only provides layout.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  )
}
