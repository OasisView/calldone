import { Outlet } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider delayDuration={200}>
          <Toaster />
          <Outlet />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
