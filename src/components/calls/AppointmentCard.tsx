// src/components/calls/AppointmentCard.tsx — renders the extracted appointment
// from call_logs.appointment_details and offers a CLIENT-SIDE .ics download
// (R18 / security.md §10 ws/calls-ui item 5). The .ics is built by the SHARED,
// single-source builder src/lib/ics.ts → supabase/functions/_shared/ics.ts
// (buildIcs), the SAME code the server-side email path uses; RFC 5545 escaping
// is owned + unit-tested inside that shared module, never re-implemented here.
// This works for anonymous demo users because it touches no network/auth.
//
// NOTE: in this baseline the shared buildIcs() still throws "not implemented:
// ws/edge" — its body lands with ws/edge at integration. This component wires
// the call correctly (correct args per its signature) and degrades gracefully
// until then, so the page never crashes.
import { useCallback } from "react"
import { CalendarPlus, MapPin } from "lucide-react"
import { format } from "date-fns"
import type { AppointmentDetails } from "@/types/api"
import { buildIcs } from "@/lib/ics"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface AppointmentCardProps {
  appointment: AppointmentDetails
  /** Stable identifier for the .ics VEVENT UID — the call_logs row id. */
  uid: string
  /** Organizer display name for the .ics ORGANIZER line (optional). */
  organizerName?: string
}

/** Below this confidence the extraction is flagged as unconfirmed (api.md §2.2). */
const UNCONFIRMED_THRESHOLD = 0.6

function safeFormat(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : format(date, "EEE, MMM d, yyyy 'at' h:mm a")
}

export function AppointmentCard({ appointment, uid, organizerName }: AppointmentCardProps) {
  const unconfirmed = appointment.confidence < UNCONFIRMED_THRESHOLD

  const handleDownload = useCallback(() => {
    // Build the calendar file from the SAME shared, dependency-free module the
    // email path uses. Correct args per the frozen signature:
    //   buildIcs(appointment, { uid, organizerName? })
    let ics: string
    try {
      ics = buildIcs(appointment, { uid, organizerName })
    } catch {
      // Shared builder not yet implemented in this baseline (ws/edge lands the
      // body at integration). Fail soft rather than crash the page.
      return
    }

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "appointment.ics"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [appointment, uid, organizerName])

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{appointment.title}</CardTitle>
        {unconfirmed ? (
          <Badge variant="outline" className="border-amber-500 text-amber-600">
            Unconfirmed
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <span className="font-medium">When: </span>
          {safeFormat(appointment.start_iso)}
          {appointment.end_iso ? ` – ${safeFormat(appointment.end_iso)}` : ""}
        </p>

        {appointment.location ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            {appointment.location}
          </p>
        ) : null}

        {appointment.notes ? (
          <p className="text-sm text-muted-foreground">{appointment.notes}</p>
        ) : null}

        <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
          <CalendarPlus className="h-4 w-4" />
          Add to calendar
        </Button>
      </CardContent>
    </Card>
  )
}
