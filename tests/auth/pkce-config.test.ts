import { describe, it, expect, vi, beforeEach } from "vitest"

// §10 ws/auth-ui #3: PKCE flow configured. supabase.ts is frozen (orchestrator),
// but ws/auth-ui owns the obligation that the client we build uses flowType
// "pkce" (security.md §1.2/§1.6). We assert the options passed to createClient.

const createClientSpy = vi.fn(
  (_url: string, _key: string, _options: { auth: Record<string, unknown> }) => ({
    auth: {},
  }),
)

vi.mock("@supabase/supabase-js", () => ({
  createClient: (
    url: string,
    key: string,
    options: { auth: Record<string, unknown> },
  ) => createClientSpy(url, key, options),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.stubEnv("VITE_SUPABASE_URL", "https://placeholder.supabase.co")
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "placeholder")
})

describe("Supabase client configuration", () => {
  it("constructs the client with the PKCE flow and persistent session", async () => {
    const { getSupabase } = await import("@/lib/supabase")
    getSupabase()

    expect(createClientSpy).toHaveBeenCalledTimes(1)
    const options = createClientSpy.mock.calls[0][2]
    expect(options.auth).toMatchObject({
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    })
  })

  it("does not throw at import time without env (lazy getSupabase)", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "")
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "")
    // Importing the module must not throw even with no env (SSG/CI build green).
    await expect(import("@/lib/supabase")).resolves.toBeTruthy()
  })
})
