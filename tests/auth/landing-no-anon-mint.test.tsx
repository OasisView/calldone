import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ThemeProvider } from "next-themes"

// SECURITY (§10 ws/auth-ui #3): the anonymous session must be minted ONLY on
// demo entry, never during the landing-page render. We spy on the entire
// Supabase auth surface and assert signInAnonymously is never reached from
// rendering <Landing/>. "Try the demo" only navigates to /brainstorm; the
// RequireSession guard (a different route) mints the session.

const auth = {
  getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  onAuthStateChange: vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  }),
  signInAnonymously: vi.fn(),
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth }),
  isSupabaseConfigured: () => true,
}))

const navigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )
  return { ...actual, useNavigate: () => navigate }
})

import Landing from "@/pages/Landing"

function renderLanding() {
  return render(
    <MemoryRouter>
      <ThemeProvider attribute="class">
        <Landing />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // next-themes (used by ThemeToggle, rendered on Landing) reads matchMedia,
  // which jsdom does not implement. Provide a minimal stub.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
})

describe("Landing render does not mint an anonymous user", () => {
  it("never calls signInAnonymously on render", () => {
    renderLanding()
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })

  it("does not even construct a session subscription from Landing (no use-session import)", () => {
    renderLanding()
    // Landing imports neither use-session nor getSupabase, so no auth listener
    // is wired up by simply viewing the page.
    expect(auth.onAuthStateChange).not.toHaveBeenCalled()
    expect(auth.getSession).not.toHaveBeenCalled()
  })

  it("'Try the demo' navigates to /brainstorm and still mints nothing here", () => {
    renderLanding()
    const buttons = screen.getAllByRole("button", { name: /try the demo/i })
    fireEvent.click(buttons[0])
    expect(navigate).toHaveBeenCalledWith("/brainstorm")
    // The session is minted by RequireSession on the /brainstorm route, not here.
    expect(auth.signInAnonymously).not.toHaveBeenCalled()
  })
})
