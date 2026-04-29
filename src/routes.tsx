import type { RouteRecord } from "vite-react-ssg"
import App from "./App"
import Landing from "./pages/Landing"
import Dashboard from "./pages/Dashboard"
import NotFound from "./pages/NotFound"

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Landing />, entry: "src/pages/Landing.tsx" },
      { path: "dashboard", element: <Dashboard /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]
