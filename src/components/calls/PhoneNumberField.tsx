// src/components/calls/PhoneNumberField.tsx — controlled E.164 phone input used
// on ScriptReview before "Call now". Validation uses the SHARED E164_REGEX via
// lib/phone.ts (validateE164/normalizeE164) — there is NO local regex copy
// (security.md §10 ws/calls-ui item 1). The server stays authoritative; this is
// a pre-flight UX nicety only.
import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { validateE164 } from "@/lib/phone"

export interface PhoneNumberFieldProps {
  value: string
  onChange: (value: string) => void
  /** Prefill hint extracted from the brainstorm script (target_phone_hint). */
  hint?: string | null
  disabled?: boolean
  /** Server-supplied error (e.g. a 400 invalid_request from make-call). */
  serverError?: string | null
}

export function PhoneNumberField({
  value,
  onChange,
  hint,
  disabled,
  serverError,
}: PhoneNumberFieldProps) {
  const id = useId()
  const trimmed = value.trim()
  // Only flag a *client-side* format error once the user has typed something.
  const clientInvalid = trimmed.length > 0 && !validateE164(trimmed)
  const errorMessage = clientInvalid
    ? "Enter a valid phone number in international format, e.g. +14155550123."
    : (serverError ?? null)
  const describedBy = errorMessage ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Phone number to call</Label>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+14155550123"
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      {errorMessage ? (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Suggested from your brainstorm: {hint}
        </p>
      ) : null}
    </div>
  )
}
