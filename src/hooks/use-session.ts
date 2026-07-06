import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AuthError,
  Session,
  User,
} from "@supabase/supabase-js"

import { getSupabase } from "@/lib/supabase"
import { queryKeys } from "@/lib/query-keys"
import type { ApiErrorBody } from "@/types/api"

type ApiError = ApiErrorBody["error"]

export interface UseSessionResult {
  session: Session | null
  user: User | null
  isAnonymous: boolean
  isLoading: boolean
  signInWithPassword(email: string, password: string): Promise<{ error: ApiError | null }>
  signUp(email: string, password: string): Promise<{ error: ApiError | null }>
  signInWithGoogle(): Promise<{ error: ApiError | null }>
  /** Uid-preserving anonymous → permanent upgrade (R16): supabase.auth.updateUser /
   *  linkIdentity on the EXISTING anonymous user. The uid does not change, so all
   *  demo-created rows (brainstorm_sessions, call_scripts, call_logs) survive. */
  linkEmail(email: string, password: string): Promise<{ error: ApiError | null }>
  linkGoogle(): Promise<{ error: ApiError | null }>
  signOut(): Promise<void>
  ensureSession(): Promise<Session>
}

/** Map a Supabase AuthError to the frozen ApiError envelope shape. Auth errors
 *  are never retryable from the UI's perspective (bad credentials, taken email),
 *  so retryable stays false; the message is safe to surface in a toast. */
function toApiError(error: AuthError): ApiError {
  return {
    code: "invalid_request",
    message: error.message,
    retryable: false,
  }
}

/** OAuth redirect target. Lands back on the app origin after the provider round
 *  trip; detectSessionInUrl + PKCE (configured in getSupabase) complete the
 *  exchange. Guarded for the SSG/no-window build. */
function oauthRedirectTo(): string | undefined {
  if (typeof window === "undefined") return undefined
  return `${window.location.origin}/dashboard`
}

export function useSession(): UseSessionResult {
  const queryClient = useQueryClient()

  const sessionQuery = useQuery<Session | null>({
    queryKey: queryKeys.session,
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.getSession()
      if (error) throw error
      return data.session
    },
    // Auth state is pushed via onAuthStateChange; never auto-refetch on focus.
    staleTime: Infinity,
    gcTime: Infinity,
  })

  // Single subscription to Supabase auth events; every change writes the
  // session straight into the query cache (key queryKeys.session). No context
  // / AuthProvider exists (R16) — this hook IS the session source of truth.
  useEffect(() => {
    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData(queryKeys.session, session)
    })
    return () => subscription.unsubscribe()
  }, [queryClient])

  const session = sessionQuery.data ?? null
  const user = session?.user ?? null
  const isAnonymous = user?.is_anonymous === true

  const signInWithPassword: UseSessionResult["signInWithPassword"] = async (
    email,
    password,
  ) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    return { error: error ? toApiError(error) : null }
  }

  const signUp: UseSessionResult["signUp"] = async (email, password) => {
    const { error } = await getSupabase().auth.signUp({ email, password })
    return { error: error ? toApiError(error) : null }
  }

  const signInWithGoogle: UseSessionResult["signInWithGoogle"] = async () => {
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthRedirectTo() },
    })
    return { error: error ? toApiError(error) : null }
  }

  // Uid-preserving upgrade (R16): updateUser sets email+password on the EXISTING
  // (anonymous) user; the uid does not change, so every demo-created row carries
  // over. No data migration needed.
  const linkEmail: UseSessionResult["linkEmail"] = async (email, password) => {
    const { error } = await getSupabase().auth.updateUser({ email, password })
    return { error: error ? toApiError(error) : null }
  }

  // Uid-preserving upgrade via OAuth identity linking (R16). linkIdentity attaches
  // the Google identity to the current anonymous user, preserving the uid.
  const linkGoogle: UseSessionResult["linkGoogle"] = async () => {
    const { error } = await getSupabase().auth.linkIdentity({
      provider: "google",
      options: { redirectTo: oauthRedirectTo() },
    })
    return { error: error ? toApiError(error) : null }
  }

  const signOut: UseSessionResult["signOut"] = async () => {
    await getSupabase().auth.signOut()
    queryClient.setQueryData(queryKeys.session, null)
    queryClient.clear()
  }

  // signInAnonymously() if none; used by RequireSession on demo entry. NEVER
  // called from the landing-page render path (security gate, §3 ws/auth-ui).
  const ensureSession: UseSessionResult["ensureSession"] = async () => {
    const supabase = getSupabase()
    const { data: existing } = await supabase.auth.getSession()
    if (existing.session) return existing.session

    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    if (!data.session) {
      throw new Error("Anonymous sign-in returned no session")
    }
    queryClient.setQueryData(queryKeys.session, data.session)
    return data.session
  }

  return {
    session,
    user,
    isAnonymous,
    isLoading: sessionQuery.isLoading,
    signInWithPassword,
    signUp,
    signInWithGoogle,
    linkEmail,
    linkGoogle,
    signOut,
    ensureSession,
  }
}
