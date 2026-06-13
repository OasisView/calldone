import { PhoneCall } from "lucide-react"

import { OnboardingForm } from "@/components/auth/OnboardingForm"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

/**
 * Onboarding page. Reached only via RequireAuth allowUnonboarded, so a real
 * non-anonymous session is guaranteed (the guard sends no-session → /login and
 * anonymous → /signup). Collects the profile fields, then routes to the
 * dashboard. RequireAuth on /dashboard re-checks completeness.
 */
export default function Onboarding() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex items-center gap-2 font-semibold tracking-tight">
        <PhoneCall className="h-5 w-5 text-primary" aria-hidden />
        <span>Calldone</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Let&apos;s set up your account</CardTitle>
          <CardDescription>
            A few details so the AI can introduce you correctly on calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  )
}
