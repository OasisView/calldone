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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useNav } from "@/lib/nav"
import { useSession } from "@/hooks/use-session"

export type AuthMode = "login" | "signup"

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

type Credentials = z.infer<typeof credentialsSchema>

const COPY: Record<AuthMode, { title: string; submit: string; google: string }> = {
  login: {
    title: "Welcome back",
    submit: "Log in",
    google: "Continue with Google",
  },
  signup: {
    title: "Create your account",
    submit: "Sign up",
    google: "Sign up with Google",
  },
}

/**
 * Email/password + Google auth form.
 *
 * - mode "login": signInWithPassword / signInWithGoogle.
 * - mode "signup": signUp / signInWithGoogle for fresh visitors, BUT when the
 *   current session is anonymous it upgrades the existing demo user in place
 *   via linkEmail / linkGoogle (R16) — the uid is preserved so demo scripts and
 *   calls carry over. No data migration.
 *
 * All Supabase access flows through the use-session hook; this component never
 * imports @/lib/supabase. Navigation uses useNav, never useNavigate.
 */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const nav = useNav()
  const {
    isAnonymous,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    linkEmail,
    linkGoogle,
  } = useSession()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  })

  const isUpgrade = mode === "signup" && isAnonymous
  const copy = COPY[mode]

  const onSubmit = async ({ email, password }: Credentials) => {
    setServerError(null)
    let result: { error: { message: string } | null }
    if (mode === "login") {
      result = await signInWithPassword(email, password)
    } else if (isUpgrade) {
      result = await linkEmail(email, password)
    } else {
      result = await signUp(email, password)
    }

    if (result.error) {
      setServerError(result.error.message)
      return
    }

    if (mode === "signup" && !isUpgrade) {
      toast.success("Account created. Check your email to confirm, then log in.")
    } else if (isUpgrade) {
      toast.success("Your demo is now saved to your account.")
    }
    nav.toDashboard()
  }

  const onGoogle = async () => {
    setServerError(null)
    const { error } = isUpgrade ? await linkGoogle() : await signInWithGoogle()
    if (error) setServerError(error.message)
    // On success Supabase redirects to the provider; detectSessionInUrl + PKCE
    // complete the exchange on return. No nav call here.
  }

  const submitting = form.formState.isSubmitting

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        {isUpgrade ? (
          <p className="text-sm text-muted-foreground">
            Save the script and call you just created by adding an email and password.
          </p>
        ) : null}
      </div>

      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Please wait…" : copy.submit}
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={submitting}
        onClick={() => void onGoogle()}
      >
        {copy.google}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => nav.toSignup()}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => nav.toLogin()}
            >
              Log in
            </button>
          </>
        )}
      </p>
    </div>
  )
}
