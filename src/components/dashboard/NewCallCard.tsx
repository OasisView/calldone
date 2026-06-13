import { ArrowRight, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useNav } from "@/lib/nav"

/**
 * Primary dashboard CTA: start a new call by brainstorming a script. Routes to
 * /brainstorm via nav.toBrainstorm() (never useNavigate).
 */
export function NewCallCard() {
  const nav = useNav()

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          Start a new call
        </CardTitle>
        <CardDescription>
          Talk through what you need and we&apos;ll draft a script for the AI to call on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="lg" onClick={() => nav.toBrainstorm()}>
          Brainstorm a script
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </CardContent>
    </Card>
  )
}
