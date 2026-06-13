import { describe, it, expect, vi, beforeEach } from "vitest"
import { createNavigator, routePath, ROUTES } from "@/lib/nav"

describe("nav abstraction", () => {
  let mockNavigate: ReturnType<typeof vi.fn>
  let nav: ReturnType<typeof createNavigator>

  beforeEach(() => {
    mockNavigate = vi.fn()
    nav = createNavigator(mockNavigate)
  })

  describe("ROUTES constants", () => {
    it("exposes all 11 product routes plus the not-found wildcard", () => {
      expect(ROUTES).toEqual({
        landing: "/",
        login: "/login",
        signup: "/signup",
        onboarding: "/onboarding",
        dashboard: "/dashboard",
        brainstorm: "/brainstorm",
        scripts: "/scripts",
        scriptReview: "/scripts/:scriptId",
        calls: "/calls",
        callDetail: "/calls/:callLogId",
        profile: "/profile",
        notFound: "*",
      })
    })
  })

  describe("static navigator methods", () => {
    it.each([
      ["toLanding", "/"],
      ["toLogin", "/login"],
      ["toSignup", "/signup"],
      ["toOnboarding", "/onboarding"],
      ["toDashboard", "/dashboard"],
      ["toBrainstorm", "/brainstorm"],
      ["toScripts", "/scripts"],
      ["toCalls", "/calls"],
      ["toProfile", "/profile"],
    ] as const)("%s navigates to %s", (method, path) => {
      ;(nav[method] as () => void)()
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith(path)
    })
  })

  describe("parameterized navigator methods", () => {
    it("toScriptReview interpolates the script id", () => {
      nav.toScriptReview("script-42")
      expect(mockNavigate).toHaveBeenCalledWith("/scripts/script-42")
    })

    it("toScriptReview url-encodes the script id", () => {
      nav.toScriptReview("abc 123")
      expect(mockNavigate).toHaveBeenCalledWith("/scripts/abc%20123")
    })

    it("toCallDetail interpolates the call log id", () => {
      nav.toCallDetail("log-9")
      expect(mockNavigate).toHaveBeenCalledWith("/calls/log-9")
    })

    it("toCallDetail url-encodes the call log id", () => {
      nav.toCallDetail("a/b?c")
      expect(mockNavigate).toHaveBeenCalledWith("/calls/a%2Fb%3Fc")
    })
  })

  describe("back", () => {
    it("uses navigate(-1)", () => {
      nav.back()
      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  describe("routePath", () => {
    it("fills a single param", () => {
      expect(routePath(ROUTES.scriptReview, { scriptId: "x1" })).toBe("/scripts/x1")
    })

    it("fills multiple params", () => {
      expect(routePath("/a/:x/b/:y", { x: "1", y: "2" })).toBe("/a/1/b/2")
    })

    it("encodes param values", () => {
      expect(routePath(ROUTES.callDetail, { callLogId: "id with space" })).toBe(
        "/calls/id%20with%20space"
      )
    })

    it("leaves the template untouched when no params are given", () => {
      expect(routePath(ROUTES.dashboard, {})).toBe("/dashboard")
    })
  })
})
