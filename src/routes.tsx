import type { RouteRecord } from "vite-react-ssg"
import App from "./App"
import Landing from "./pages/Landing"
import Dashboard from "./pages/Dashboard"
import Brainstorm from "./pages/Brainstorm"
import ScriptReview from "./pages/ScriptReview"
import Call from "./pages/Call"
import NotFound from "./pages/NotFound"

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Landing />, entry: "src/pages/Landing.tsx" },
      { path: "dashboard", element: <Dashboard /> },
      { path: "brainstorm", element: <Brainstorm /> },
      { path: "scripts/:scriptId", element: <ScriptReview /> },
      { path: "calls/:callLogId", element: <Call /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]
