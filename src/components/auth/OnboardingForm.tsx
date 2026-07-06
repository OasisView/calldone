import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { E164_REGEX } from "@/types/api"
import { useNav } from "@/lib/nav"
import { useProfile, useUpdateProfile } from "@/hooks/use-profile"

/** Communication styles persisted into profiles.communication_style (jsonb). */
const STYLE_OPTIONS = [
  { value: "friendly", label: "Friendly and warm" },
  { value: "professional", label: "Professional and concise" },
  { value: "direct", label: "Direct and to the point" },
  { value: "detailed", label: "Detailed and thorough" },
] as const

/** A small, browser-safe set of common IANA time zones for the demo. */
const TIME_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const

/** Best-effort default from the browser; falls back to a stable value. */
function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && (TIME_ZONES as readonly string[]).includes(tz)) return tz
  } catch {
    // ignore — SSG / unsupported environment
  }
  return "America/New_York"
}

const onboardingSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Tell us what to call you.")
    .max(120, "Name must be 120 characters or fewer."),
  time_zone: z
    .string()
    .min(1, "Choose your time zone.")
    .max(64),
  communication_style: z.enum(
    STYLE_OPTIONS.map((s) => s.value) as [string, ...string[]],
  ),
  // Optional phone (R9: client-writable). Empty string allowed; if provided it
  // must be E.164. Reuses the shared regex — no local copy.
  phone_number: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || E164_REGEX.test(v),
      "Enter a valid phone number in international format, e.g. +14155550123.",
    ),
})

type OnboardingValues = z.infer<typeof onboardingSchema>

/**
 * Collects name, time zone, communication style, and an optional phone number,
 * then writes them through useUpdateProfile. phone_number IS client-writable
 * (R9); phone_verified_at is never sent — the hook strips it and the
 * reset_phone_verification trigger keeps it unforgeable.
 */
export function OnboardingForm() {
  const nav = useNav()
  const profileQuery = useProfile()
  const updateProfile = useUpdateProfile()
  const [serverError, setServerError] = useState<string | null>(null)

  const profile = profileQuery.data ?? null
  const existingStyle =
    typeof profile?.communication_style?.style === "string"
      ? (profile.communication_style.style as string)
      : ""

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    values: {
      display_name: profile?.display_name ?? "",
      time_zone: profile?.time_zone ?? detectTimeZone(),
      communication_style: existingStyle || "friendly",
      phone_number: profile?.phone_number ?? "",
    },
  })

  const onSubmit = async (values: OnboardingValues) => {
    setServerError(null)
    try {
      await updateProfile.mutateAsync({
        display_name: values.display_name.trim(),
        time_zone: values.time_zone,
        communication_style: { style: values.communication_style },
        phone_number: values.phone_number.trim() === "" ? null : values.phone_number.trim(),
      })
      toast.success("You're all set.")
      nav.toDashboard()
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Something went wrong. Please try again."
      setServerError(message)
    }
  }

  const submitting = form.formState.isSubmitting || updateProfile.isPending

  return (
    <div className="space-y-6">
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="display_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input placeholder="Alex Rivera" autoComplete="name" {...field} />
                </FormControl>
                <FormDescription>The AI uses this to introduce itself on calls.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="time_zone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time zone</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a time zone" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIME_ZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="communication_style"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Communication style</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a style" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STYLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>How the AI should sound on your behalf.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone number (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    placeholder="+14155550123"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Used only for confirmations. You can add or change it later.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Finish setup"}
          </Button>
        </form>
      </Form>
    </div>
  )
}
