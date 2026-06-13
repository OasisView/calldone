import { useNavigate, type NavigateFunction } from "react-router-dom"

export const ROUTES = {
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
} as const

export type RouteKey = keyof typeof ROUTES

export function routePath(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value)),
    template
  )
}

export interface Navigator {
  toLanding: () => void
  toLogin: () => void
  toSignup: () => void
  toOnboarding: () => void
  toDashboard: () => void
  toBrainstorm: () => void
  toScripts: () => void
  toScriptReview: (scriptId: string) => void
  toCalls: () => void
  toCallDetail: (callLogId: string) => void
  toProfile: () => void
  back: () => void
}

export function createNavigator(navigate: NavigateFunction): Navigator {
  return {
    toLanding: () => navigate(ROUTES.landing),
    toLogin: () => navigate(ROUTES.login),
    toSignup: () => navigate(ROUTES.signup),
    toOnboarding: () => navigate(ROUTES.onboarding),
    toDashboard: () => navigate(ROUTES.dashboard),
    toBrainstorm: () => navigate(ROUTES.brainstorm),
    toScripts: () => navigate(ROUTES.scripts),
    toScriptReview: (scriptId) => navigate(routePath(ROUTES.scriptReview, { scriptId })),
    toCalls: () => navigate(ROUTES.calls),
    toCallDetail: (callLogId) => navigate(routePath(ROUTES.callDetail, { callLogId })),
    toProfile: () => navigate(ROUTES.profile),
    back: () => navigate(-1),
  }
}

export function useNav(): Navigator {
  const navigate = useNavigate()
  return createNavigator(navigate)
}
