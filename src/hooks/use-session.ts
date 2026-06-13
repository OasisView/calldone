import type { Session, User } from "@supabase/supabase-js"
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

export function useSession(): UseSessionResult {
  return {
    session: null,
    user: null,
    isAnonymous: false,
    isLoading: false,
    signInWithPassword: async () => {
      throw new Error("not implemented")
    },
    signUp: async () => {
      throw new Error("not implemented")
    },
    signInWithGoogle: async () => {
      throw new Error("not implemented")
    },
    linkEmail: async () => {
      throw new Error("not implemented")
    },
    linkGoogle: async () => {
      throw new Error("not implemented")
    },
    signOut: async () => {
      throw new Error("not implemented")
    },
    ensureSession: async () => {
      throw new Error("not implemented")
    },
  }
}
