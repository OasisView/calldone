import { describe, it, expect, vi, beforeEach } from "vitest"
import { createNavigator, ROUTES } from "@/lib/nav"

describe("nav abstraction", () => {
  let mockNavigate: ReturnType<typeof vi.fn>
  let nav: ReturnType<typeof createNavigator>

  beforeEach(() => {
    mockNavigate = vi.fn()
    nav = createNavigator(mockNavigate)
  })

  it("exposes route constants", () => {
    expect(ROUTES.landing).toBe("/")
    expect(ROUTES.dashboard).toBe("/dashboard")
    expect(ROUTES.notFound).toBe("*")
  })

  it("toLanding navigates to /", () => {
    nav.toLanding()
    expect(mockNavigate).toHaveBeenCalledWith("/")
  })

  it("toDashboard navigates to /dashboard", () => {
    nav.toDashboard()
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("back uses navigate(-1)", () => {
    nav.back()
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})
