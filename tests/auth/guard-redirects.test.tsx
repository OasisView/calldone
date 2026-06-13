import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, waitFor } from "@testing-library/react"

// Mock the nav surface so we can assert which redirect fires. The guards are
// frozen orchestrator code we CONSUME; this test verifies the contract they
// implement against our use-session hook (§10 ws/auth-ui #5, R17).
const nav = {
  toLogin: vi.fn(),
  toSignup: vi.fn(),
  toOnboarding: vi.fn(),
  toDashboard: vi.fn(),
  toLanding: vi.fn(),
  toBrainstorm: vi.fn(),
  toScripts: vi.fn(),
  toScriptReview: vi.fn(),
  toCalls: vi.fn(),
  toCallDetail: vi.fn(),
  toProfile: vi.fn(),
  back: vi.fn(),
}
vi.mock("@/lib/nav", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nav")>("@/lib/nav")
  return { ...actual, useNav: () => nav }
})

const sessionState = {
  session: null as unknown,
  isAnonymous: false,
  isLoading: false,
  ensureSession: vi.fn(),
}
vi.mock("@/hooks/use-session", () => ({
  useSession: () => sessionState,
}))

const profileState = {
  data: null as unknown,
  isLoading: false,
}
vi.mock("@/hooks/use-profile", () => ({
  useProfile: () => profileState,
}))

import { RequireAuth } from "@/components/guards/RequireAuth"
import { RequireSession } from "@/components/guards/RequireSession"

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.session = null
  sessionState.isAnonymous = false
  sessionState.isLoading = false
  sessionState.ensureSession = vi.fn().mockResolvedValue({})
  profileState.data = null
  profileState.isLoading = false
})

describe("RequireAuth redirects (R17)", () => {
  it("no session → /login", async () => {
    sessionState.session = null
    render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    )
    await waitFor(() => expect(nav.toLogin).toHaveBeenCalledTimes(1))
    expect(nav.toSignup).not.toHaveBeenCalled()
  })

  it("anonymous session → /signup (never /login)", async () => {
    sessionState.session = { user: { id: "anon" } }
    sessionState.isAnonymous = true
    render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    )
    await waitFor(() => expect(nav.toSignup).toHaveBeenCalledTimes(1))
    expect(nav.toLogin).not.toHaveBeenCalled()
  })

  it("full session but incomplete profile → /onboarding", async () => {
    sessionState.session = { user: { id: "u1" } }
    sessionState.isAnonymous = false
    profileState.data = { display_name: null, time_zone: null }
    render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    )
    await waitFor(() => expect(nav.toOnboarding).toHaveBeenCalledTimes(1))
  })

  it("full onboarded session → renders children, no redirect", async () => {
    sessionState.session = { user: { id: "u1" } }
    sessionState.isAnonymous = false
    profileState.data = { display_name: "Alex", time_zone: "America/New_York" }
    const { getByText } = render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    )
    expect(getByText("protected")).toBeInTheDocument()
    expect(nav.toLogin).not.toHaveBeenCalled()
    expect(nav.toSignup).not.toHaveBeenCalled()
    expect(nav.toOnboarding).not.toHaveBeenCalled()
  })

  it("anonymous on an allowUnonboarded route still → /signup", async () => {
    sessionState.session = { user: { id: "anon" } }
    sessionState.isAnonymous = true
    render(
      <RequireAuth allowUnonboarded>
        <div>protected</div>
      </RequireAuth>,
    )
    await waitFor(() => expect(nav.toSignup).toHaveBeenCalledTimes(1))
    expect(nav.toLogin).not.toHaveBeenCalled()
  })
})

describe("RequireSession (anonymous-demo-allowed)", () => {
  it("no session → calls ensureSession() to mint an anonymous one", async () => {
    sessionState.session = null
    render(
      <RequireSession>
        <div>demo</div>
      </RequireSession>,
    )
    await waitFor(() => expect(sessionState.ensureSession).toHaveBeenCalledTimes(1))
  })

  it("existing session → renders children without minting", () => {
    sessionState.session = { user: { id: "anon" } }
    const { getByText } = render(
      <RequireSession>
        <div>demo</div>
      </RequireSession>,
    )
    expect(getByText("demo")).toBeInTheDocument()
    expect(sessionState.ensureSession).not.toHaveBeenCalled()
  })
})
