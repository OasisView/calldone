import type { RouteRecord } from "vite-react-ssg"
import App from "./App"
import Landing from "./pages/Landing"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import Onboarding from "./pages/Onboarding"
import Dashboard from "./pages/Dashboard"
import Brainstorm from "./pages/Brainstorm"
import Scripts from "./pages/Scripts"
import ScriptReview from "./pages/ScriptReview"
import Calls from "./pages/Calls"
import CallDetail from "./pages/CallDetail"
import Profile from "./pages/Profile"
import NotFound from "./pages/NotFound"
import { RequireAuth } from "./components/guards/RequireAuth"
import { RequireSession } from "./components/guards/RequireSession"

export const routes: RouteRecord[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Landing />, entry: "src/pages/Landing.tsx" },
      { path: "login", element: <Login /> },
      { path: "signup", element: <Signup /> },
      { path: "onboarding", element: <RequireAuth allowUnonboarded><Onboarding /></RequireAuth> },
      { path: "dashboard", element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: "brainstorm", element: <RequireSession><Brainstorm /></RequireSession> },
      { path: "scripts", element: <RequireAuth><Scripts /></RequireAuth> },
      { path: "scripts/:scriptId", element: <RequireSession><ScriptReview /></RequireSession> },
      { path: "calls", element: <RequireAuth><Calls /></RequireAuth> },
      { path: "calls/:callLogId", element: <RequireSession><CallDetail /></RequireSession> },
      { path: "profile", element: <RequireAuth><Profile /></RequireAuth> },
      { path: "*", element: <NotFound /> },
    ],
  },
]
