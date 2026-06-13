import { AppShell } from "@/components/layout/AppShell"
import { NewCallCard } from "@/components/dashboard/NewCallCard"
import { RecentCallsCard } from "@/components/dashboard/RecentCallsCard"
import { RecentScriptsCard } from "@/components/dashboard/RecentScriptsCard"
import { useProfile } from "@/hooks/use-profile"

/**
 * Authenticated home (RequireAuth — full, onboarded accounts). The shell plus a
 * new-call CTA and recent scripts / calls. All data comes from the workstream
 * hooks (useProfile, useScripts, useCallLogs).
 */
export default function Dashboard() {
  const { data: profile } = useProfile()
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? null

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground">
            What call can we take off your plate today?
          </p>
        </div>

        <NewCallCard />

        <div className="grid gap-4 lg:grid-cols-2">
          <RecentScriptsCard />
          <RecentCallsCard />
        </div>
      </div>
    </AppShell>
  )
}
