// src/pages/ScriptReview.tsx — review/edit a finalized script and place a demo
// call (route /scripts/:scriptId, RequireSession — anonymous-demo-allowed so the
// demo loop continues). Wires ScriptEditor (→ useUpdateScript), PhoneNumberField
// (shared E.164 validation), and "Call now" → useMakeCall → nav.toCallDetail.
// call_logs is created server-side by make-call (R5); this page never writes it.
import { useState } from "react"
import { useParams } from "react-router-dom"
import { Loader2, Phone } from "lucide-react"
import { useScript, useUpdateScript } from "@/hooks/use-scripts"
import { useMakeCall } from "@/hooks/use-make-call"
import { ScriptEditor } from "@/components/calls/ScriptEditor"
import { PhoneNumberField } from "@/components/calls/PhoneNumberField"
import { validateE164 } from "@/lib/phone"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useNav } from "@/lib/nav"

export default function ScriptReview() {
  const nav = useNav()
  const { scriptId = "" } = useParams<{ scriptId: string }>()
  const { data: script, isLoading, isError, error } = useScript(scriptId)
  const updateScript = useUpdateScript()
  const makeCall = useMakeCall()

  const [phone, setPhone] = useState("")

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6 sm:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !script) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 sm:p-8">
        <Alert variant="destructive">
          <AlertTitle>Script not found</AlertTitle>
          <AlertDescription className="flex items-center gap-3">
            {error?.message ?? "This script doesn't exist or isn't available."}
            <Button variant="outline" size="sm" onClick={() => nav.toScripts()}>
              Back to scripts
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Surface the server's 400 invalid_request distinctly from a client format error.
  const serverPhoneError =
    makeCall.isError && makeCall.error?.code === "invalid_request"
      ? makeCall.error.message
      : null
  const otherCallError =
    makeCall.isError && makeCall.error?.code !== "invalid_request"
      ? makeCall.error?.message
      : null

  const canCall = validateE164(phone) && !makeCall.isPending

  const handleCall = () => {
    makeCall.mutate(
      { scriptId: script.id, phoneNumber: phone },
      { onSuccess: (res) => nav.toCallDetail(res.call_log_id) },
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {script.call_purpose?.trim() || "Review your script"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Edit the script, then place a demo call to hear it in action.
        </p>
      </div>

      <ScriptEditor
        scriptText={script.script_text}
        isSaving={updateScript.isPending}
        saveError={updateScript.isError ? (updateScript.error?.message ?? "Save failed.") : null}
        onSave={(scriptText) => updateScript.mutate({ scriptId: script.id, scriptText })}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Place a demo call</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PhoneNumberField
            value={phone}
            onChange={setPhone}
            disabled={makeCall.isPending}
            serverError={serverPhoneError}
          />

          {otherCallError ? (
            <Alert variant="destructive">
              <AlertDescription>{otherCallError}</AlertDescription>
            </Alert>
          ) : null}

          <Button onClick={handleCall} disabled={!canCall}>
            {makeCall.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            Call now
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
