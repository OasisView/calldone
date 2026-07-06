import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { AppShell } from "@/components/layout/AppShell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { E164_REGEX } from "@/types/api"
import { useProfile, useUpdateProfile } from "@/hooks/use-profile"
import { useSession } from "@/hooks/use-session"

const STYLE_OPTIONS = [
  { value: "friendly", label: "Friendly and warm" },
  { value: "professional", label: "Professional and concise" },
  { value: "direct", label: "Direct and to the point" },
  { value: "detailed", label: "Detailed and thorough" },
] as const

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

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required.").max(120),
  time_zone: z.string().min(1, "Choose your time zone.").max(64),
  communication_style: z.enum(
    STYLE_OPTIONS.map((s) => s.value) as [string, ...string[]],
  ),
  phone_number: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || E164_REGEX.test(v),
      "Enter a valid phone number in international format, e.g. +14155550123.",
    ),
})

type ProfileValues = z.infer<typeof profileSchema>

/**
 * Profile page (RequireAuth — full, onboarded accounts). Edits the
 * client-writable profile columns through useUpdateProfile. phone_number is
 * writable (R9); editing it voids verification server-side (the
 * reset_phone_verification trigger), and phone_verified_at is never sent.
 */
export default function Profile() {
  const { user } = useSession()
  const profileQuery = useProfile()
  const updateProfile = useUpdateProfile()
  const [serverError, setServerError] = useState<string | null>(null)

  const profile = profileQuery.data ?? null
  const existingStyle =
    typeof profile?.communication_style?.style === "string"
      ? (profile.communication_style.style as string)
      : ""

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      display_name: profile?.display_name ?? "",
      time_zone: profile?.time_zone ?? "",
      communication_style: existingStyle || "friendly",
      phone_number: profile?.phone_number ?? "",
    },
  })

  const onSubmit = async (values: ProfileValues) => {
    setServerError(null)
    try {
      await updateProfile.mutateAsync({
        display_name: values.display_name.trim(),
        time_zone: values.time_zone,
        communication_style: { style: values.communication_style },
        phone_number: values.phone_number.trim() === "" ? null : values.phone_number.trim(),
      })
      toast.success("Profile updated.")
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Something went wrong. Please try again."
      setServerError(message)
    }
  }

  const phoneVerified = profile?.phone_verified_at != null
  const submitting = form.formState.isSubmitting || updateProfile.isPending

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account details</CardTitle>
            <CardDescription>
              These shape how the AI represents you on calls.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {profileQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                {serverError ? (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                ) : null}

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-5"
                    noValidate
                  >
                    <FormField
                      control={form.control}
                      name="display_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your name</FormLabel>
                          <FormControl>
                            <Input autoComplete="name" {...field} />
                          </FormControl>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Phone number
                            {field.value ? (
                              phoneVerified ? (
                                <Badge variant="secondary">Verified</Badge>
                              ) : (
                                <Badge variant="outline">Unverified</Badge>
                              )
                            ) : null}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              autoComplete="tel"
                              placeholder="+14155550123"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Changing your number resets verification.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Saving…" : "Save changes"}
                    </Button>
                  </form>
                </Form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
