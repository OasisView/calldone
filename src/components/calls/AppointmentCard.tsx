import { CalendarPlus, CheckCircle2, MapPin, StickyNote } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { downloadIcs } from "@/lib/ics"
import type { Appointment } from "@/lib/demo/types"

interface AppointmentCardProps {
  appointment: Appointment
  /** Stable id for the calendar event UID. */
  callLogId: string
}

export function AppointmentCard({ appointment, callLogId }: AppointmentCardProps) {
  const start = new Date(appointment.startIso)
  const when = start.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <Card className="border-green-600/30 bg-green-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
          Appointment confirmed
        </CardTitle>
        <CardDescription>{appointment.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-medium">{when}</p>
        {appointment.location ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {appointment.location}
          </p>
        ) : null}
        {appointment.notes ? (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {appointment.notes}
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          onClick={() =>
            downloadIcs(appointment, { uid: `${callLogId}@calldone.demo` })
          }
        >
          <CalendarPlus /> Add to calendar (.ics)
        </Button>
      </CardFooter>
    </Card>
  )
}
