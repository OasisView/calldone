import { useNavigate, type NavigateFunction } from "react-router-dom"

export const ROUTES = {
  landing: "/",
  dashboard: "/dashboard",
  notFound: "*",
} as const

export type RouteKey = keyof typeof ROUTES

export interface Navigator {
  toLanding: () => void
  toDashboard: () => void
  back: () => void
}

export function createNavigator(navigate: NavigateFunction): Navigator {
  return {
    toLanding: () => navigate(ROUTES.landing),
    toDashboard: () => navigate(ROUTES.dashboard),
    back: () => navigate(-1),
  }
}

export function useNav(): Navigator {
  const navigate = useNavigate()
  return createNavigator(navigate)
}
