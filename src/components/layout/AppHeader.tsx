import { Link, useLocation } from "react-router-dom"
import { LogOut, Phone, User as UserIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ROUTES, useNav } from "@/lib/nav"
import { useSession } from "@/hooks/use-session"
import { ThemeToggle } from "@/components/layout/ThemeToggle"

const NAV_LINKS = [
  { to: ROUTES.dashboard, label: "Dashboard" },
  { to: ROUTES.scripts, label: "Scripts" },
  { to: ROUTES.calls, label: "Calls" },
] as const

/**
 * Top bar for authenticated pages. Nav links, theme toggle, and an account
 * menu with Profile + Sign out. Navigation goes through useNav (never
 * useNavigate directly) and sign-out goes through the use-session hook.
 */
export function AppHeader() {
  const nav = useNav()
  const location = useLocation()
  const { user, signOut } = useSession()

  const handleSignOut = async () => {
    await signOut()
    nav.toLanding()
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4">
        <Link
          to={ROUTES.dashboard}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <Phone className="h-5 w-5 text-primary" aria-hidden />
          <span>Calldone</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {NAV_LINKS.map((link) => {
            const active = location.pathname === link.to
            return (
              <Button
                key={link.to}
                asChild
                variant="ghost"
                size="sm"
                className={cn(active && "bg-accent text-accent-foreground")}
              >
                <Link to={link.to} aria-current={active ? "page" : undefined}>
                  {link.label}
                </Link>
              </Button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <UserIcon className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">
                {user?.email ?? "Account"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => nav.toProfile()}>
                <UserIcon className="h-4 w-4" aria-hidden />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
