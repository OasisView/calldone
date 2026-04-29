import { Link } from "react-router-dom"

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="mt-4 text-muted-foreground">Page not found</p>
      <Link to="/" className="mt-6 text-sm hover:underline">
        Back to home
      </Link>
    </div>
  )
}
