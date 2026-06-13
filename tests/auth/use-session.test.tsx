import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

// --- Supabase auth mock ---------------------------------------------------
// One shared mock auth surface. getSupabase() returns an object whose `auth`
// member is this mock, so the hook drives it without touching real network.

const ANON_UID = "anon-uid-stable-123"

const auth = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  updateUser: vi.fn(),
  linkIdentity: vi.fn(),
  signOut: vi.fn(),
  signInAnonymously: vi.fn(),
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth }),
  isSupabaseConfigured: () => true,
}))

import { useSession } from "@/hooks/use-session"

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "tok",
    refresh_token: "ref",
    user: { id: ANON_UID, is_anonymous: false, email: "a@b.com", ...overrides },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

describe("useSession", () => {
  it("ensureSession() mints an anonymous session when none exists", async () => {
    const anonSession = makeSession({ is_anonymous: true, email: undefined })
    auth.signInAnonymously.mockResolvedValue({
      data: { session: anonSession },
      error: null,
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    let returned: { user: { id: string } } | undefined
    await act(async () => {
      returned = (await result.current.ensureSession()) as unknown as {
        user: { id: string }
      }
    })

    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(returned?.user.id).toBe(ANON_UID)
  })

  it("ensureSession() reuses the existing session without minting", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: makeSession() },
      error: null,
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    await act(async () => {
      await result.current.ensureSession()
    })

    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it("exposes isAnonymous from the user claim", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: makeSession({ is_anonymous: true }) },
      error: null,
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    await waitFor(() => expect(result.current.session).not.toBeNull())
    expect(result.current.isAnonymous).toBe(true)
  })

  // SECURITY: uid-preserving upgrade (R16 / §10 #4). linkEmail calls
  // updateUser on the EXISTING (anonymous) user; the uid never changes, so all
  // demo-created rows survive. We assert the upgrade does not re-mint or sign in
  // a different user — Supabase updateUser keeps auth.uid() identical.
  it("linkEmail() upgrades in place and preserves the uid", async () => {
    const anonSession = makeSession({ is_anonymous: true, email: undefined })
    auth.getSession.mockResolvedValue({
      data: { session: anonSession },
      error: null,
    })
    // updateUser returns the SAME id, now non-anonymous with an email.
    auth.updateUser.mockResolvedValue({
      data: { user: { id: ANON_UID, is_anonymous: false, email: "new@user.com" } },
      error: null,
    })

    const { result } = renderHook(() => useSession(), { wrapper })
    await waitFor(() => expect(result.current.session).not.toBeNull())

    const uidBefore = result.current.user?.id

    let res
    await act(async () => {
      res = await result.current.linkEmail("new@user.com", "password123")
    })

    expect(res).toEqual({ error: null })
    expect(auth.updateUser).toHaveBeenCalledWith({
      email: "new@user.com",
      password: "password123",
    })
    // The id passed to updateUser is implicit (current session); the returned
    // user keeps the same uid — never signInAnonymously / signUp (which would
    // create a NEW uid and orphan the demo rows).
    expect(auth.signUp).not.toHaveBeenCalled()
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
    expect(uidBefore).toBe(ANON_UID)
  })

  it("linkGoogle() uses linkIdentity (uid-preserving), not signInWithOAuth", async () => {
    auth.linkIdentity.mockResolvedValue({ data: {}, error: null })

    const { result } = renderHook(() => useSession(), { wrapper })

    await act(async () => {
      await result.current.linkGoogle()
    })

    expect(auth.linkIdentity).toHaveBeenCalledTimes(1)
    expect(auth.linkIdentity.mock.calls[0][0]).toMatchObject({ provider: "google" })
    expect(auth.signInWithOAuth).not.toHaveBeenCalled()
  })

  it("maps auth errors into the ApiError envelope shape", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials" },
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    let res
    await act(async () => {
      res = await result.current.signInWithPassword("a@b.com", "wrong")
    })

    expect(res).toEqual({
      error: { code: "invalid_request", message: "Invalid login credentials", retryable: false },
    })
  })
})
