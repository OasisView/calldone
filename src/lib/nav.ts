import { useNavigate, type NavigateFunction } from "react-router-dom"

export const ROUTES = {
  landing: "/",
  dashboard: "/dashboard",
  brainstorm: "/brainstorm",
  scriptReview: "/scripts/:scriptId",
  callDetail: "/calls/:callLogId",
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
  toDashboard: () => void
  toBrainstorm: () => void
  toScriptReview: (scriptId: string) => void
  toCallDetail: (callLogId: string) => void
  back: () => void
}

export function createNavigator(navigate: NavigateFunction): Navigator {
  return {
    toLanding: () => navigate(ROUTES.landing),
    toDashboard: () => navigate(ROUTES.dashboard),
    toBrainstorm: () => navigate(ROUTES.brainstorm),
    toScriptReview: (scriptId) => navigate(routePath(ROUTES.scriptReview, { scriptId })),
    toCallDetail: (callLogId) => navigate(routePath(ROUTES.callDetail, { callLogId })),
    back: () => navigate(-1),
  }
}

export function useNav(): Navigator {
  const navigate = useNavigate()
  return createNavigator(navigate)
}
