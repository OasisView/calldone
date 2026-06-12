import { describe, it, expect, vi, beforeEach } from "vitest"
import { createNavigator, routePath, ROUTES } from "@/lib/nav"

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
    expect(ROUTES.brainstorm).toBe("/brainstorm")
    expect(ROUTES.scriptReview).toBe("/scripts/:scriptId")
    expect(ROUTES.callDetail).toBe("/calls/:callLogId")
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

  it("toBrainstorm navigates to /brainstorm", () => {
    nav.toBrainstorm()
    expect(mockNavigate).toHaveBeenCalledWith("/brainstorm")
  })

  it("toScriptReview interpolates and encodes the script id", () => {
    nav.toScriptReview("abc 123")
    expect(mockNavigate).toHaveBeenCalledWith("/scripts/abc%20123")
  })

  it("toCallDetail interpolates the call log id", () => {
    nav.toCallDetail("log-9")
    expect(mockNavigate).toHaveBeenCalledWith("/calls/log-9")
  })

  it("back uses navigate(-1)", () => {
    nav.back()
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it("routePath fills multiple params", () => {
    expect(routePath("/a/:x/b/:y", { x: "1", y: "2" })).toBe("/a/1/b/2")
  })
})
