# Calldone Phase 0: Repo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Calldone project as a working Vite + React + TypeScript + Tailwind + shadcn/ui app, wired to a fresh Supabase project, with a pre-rendered landing page route, deployed to a private GitHub repo at OasisView/calldone.

**Architecture:** Standard Vite SPA with `vite-react-ssg` enabling static pre-rendering of the marketing landing page for SEO. Migration-friendly patterns from day one: data-fetching isolated to custom hooks, navigation centralized in `src/lib/nav.ts`. Supabase managed locally via the Supabase CLI for migrations and edge function development.

**Tech Stack:**
- Vite 5 + React 18 + TypeScript 5
- Tailwind CSS 3 + shadcn/ui
- Supabase (Auth, Postgres, Edge Functions)
- `vite-react-ssg` for pre-rendering
- React Router DOM 6 (with thin abstraction layer)
- TanStack Query for server state
- Vitest + Testing Library for tests
- npm as package manager (not bun, for simplicity)
- GitHub Actions for CI

---

## File Structure

After this phase, the repo will look like:

```
calldone/
├── .github/
│   └── workflows/
│       └── ci.yml                    # lint + typecheck + tests
├── docs/
│   └── superpowers/
│       ├── specs/                    # already exists
│       └── plans/                    # already exists
├── public/
│   ├── favicon.ico
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components (added on demand)
│   │   └── ThemeToggle.tsx
│   ├── hooks/
│   │   └── use-toast.ts              # shadcn toast hook
│   ├── lib/
│   │   ├── nav.ts                    # navigation abstraction (migration-friendly)
│   │   ├── supabase.ts               # supabase client singleton
│   │   └── utils.ts                  # cn() helper for shadcn
│   ├── pages/
│   │   ├── Landing.tsx               # pre-rendered marketing page
│   │   ├── Dashboard.tsx             # placeholder for now
│   │   └── NotFound.tsx
│   ├── App.tsx                       # router config
│   ├── main.tsx                      # SSG entry (uses vite-react-ssg)
│   ├── index.css                     # tailwind base + theme tokens
│   └── vite-env.d.ts
├── supabase/
│   ├── config.toml                   # supabase CLI config
│   ├── migrations/
│   │   └── 00000000000000_initial_schema.sql   # placeholder for Phase 1
│   └── .gitignore
├── tests/
│   └── lib/
│       └── nav.test.ts               # smoke test for navigation abstraction
├── .env.example
├── .gitignore
├── .nvmrc
├── components.json                   # shadcn/ui config
├── eslint.config.js
├── index.html
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
└── vitest.config.ts
```

---

## Prerequisites

- Node.js 20+ installed (`node --version`)
- npm 10+ installed
- `gh` CLI authenticated as OasisView user (`gh auth status`)
- Supabase CLI installed (`brew install supabase/tap/supabase`)

If any are missing, install before starting.

---

## Task 1: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `.gitignore`

- [ ] **Step 1: Create `.nvmrc`**

```
20
```

- [ ] **Step 2: Create `.gitignore`**

```
# dependencies
node_modules
.pnp
.pnp.js

# build outputs
dist
dist-ssr
.next

# testing
coverage

# env files (NEVER commit)
.env
.env.local
.env.*.local
!.env.example

# editor
.vscode/*
!.vscode/extensions.json
.idea
*.swp

# OS
.DS_Store
Thumbs.db

# logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# supabase
supabase/.branches
supabase/.temp
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "calldone",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite-react-ssg build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.10.0",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.58.0",
    "@tanstack/react-query": "^5.83.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "lucide-react": "^0.462.0",
    "next-themes": "^0.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.61.1",
    "react-router-dom": "^6.30.1",
    "sonner": "^1.7.4",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "vite-react-ssg": "^0.7.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@eslint/js": "^9.32.0",
    "@tailwindcss/typography": "^0.5.16",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.16.5",
    "@types/react": "^18.3.23",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react-swc": "^3.11.0",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.32.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.20",
    "globals": "^15.15.0",
    "jsdom": "^25.0.1",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.38.0",
    "vite": "^5.4.19",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: install completes without errors. `node_modules/` and `package-lock.json` created.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc .gitignore package.json package-lock.json
git commit -m "chore: initialize package.json with full dependency set"
```

---

## Task 2: Configure TypeScript

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 2: Create `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Verify TypeScript compiles (will fail with no source files yet, which is fine)**

Run: `npx tsc -b --noEmit`
Expected: no output and exit code 0, or "no inputs were found" error which is acceptable at this point.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.app.json tsconfig.node.json
git commit -m "chore: configure typescript with path aliases"
```

---

## Task 3: Configure Tailwind CSS, PostCSS, and shadcn/ui base

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/index.css`

- [ ] **Step 1: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 2: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss"
import animate from "tailwindcss-animate"
import typography from "@tailwindcss/typography"

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate, typography],
}

export default config
```

- [ ] **Step 3: Create `components.json` for shadcn/ui**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 4: Create `src/lib/utils.ts` (the cn() helper)**

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Create `src/index.css` with Tailwind directives and theme tokens**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.ts postcss.config.js components.json src/lib/utils.ts src/index.css
git commit -m "chore: add tailwind, postcss, shadcn/ui base config"
```

---

## Task 4: Configure Vite, vite-react-ssg, and ESLint

**Files:**
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react-swc"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: false,
  },
})
```

- [ ] **Step 3: Create `tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest"
```

- [ ] **Step 4: Create `eslint.config.js`**

```js
import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", "node_modules", "supabase/functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
)
```

- [ ] **Step 5: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Calldone - AI phone agent that makes calls for you</title>
    <meta name="description" content="Calldone is an AI phone agent that places real phone calls on your behalf, handles appointments, refills, and reservations, and sends you a transcript and calendar invite when it's done." />
    <meta property="og:title" content="Calldone - AI phone agent" />
    <meta property="og:description" content="Tell Calldone what you need done. It calls, talks, books, and reports back." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Calldone - AI phone agent" />
    <meta name="twitter:description" content="Tell Calldone what you need done. It calls, talks, books, and reports back." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts vitest.config.ts tests/setup.ts eslint.config.js src/vite-env.d.ts index.html
git commit -m "chore: configure vite, vitest, eslint, and html entry"
```

---

## Task 5: Create the navigation abstraction (migration-friendly pattern)

**Files:**
- Create: `src/lib/nav.ts`
- Create: `tests/lib/nav.test.ts`

This is the centralized navigation layer. Components use `nav.toDashboard()` instead of `useNavigate()` directly. When we migrate to Next.js, this is the only file that changes.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/nav.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createNavigator, ROUTES } from "@/lib/nav"

describe("nav abstraction", () => {
  let mockNavigate: ReturnType<typeof vi.fn>
  let nav: ReturnType<typeof createNavigator>

  beforeEach(() => {
    mockNavigate = vi.fn()
    nav = createNavigator(mockNavigate)
  })

  it("exposes route constants", () => {
    expect(ROUTES.landing).toBe("/")
    expect(ROUTES.dashboard).toBe("/dashboard")
    expect(ROUTES.notFound).toBe("*")
  })

  it("toLanding navigates to /", () => {
    nav.toLanding()
    expect(mockNavigate).toHaveBeenCalledWith("/")
  })

  it("toDashboard navigates to /dashboard", () => {
    nav.toDashboard()
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard")
  })

  it("back uses navigate(-1)", () => {
    nav.back()
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/nav.test.ts`
Expected: FAIL with "Cannot find module '@/lib/nav'"

- [ ] **Step 3: Implement `src/lib/nav.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/nav.test.ts`
Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts tests/lib/nav.test.ts
git commit -m "feat: add navigation abstraction for migration-friendly routing"
```

---

## Task 6: Create Supabase client singleton

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

```
# Frontend (Vite, public, baked into bundle)
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY

# Backend secrets (Supabase Edge Function env, NEVER prefixed VITE_)
# Set these in the Supabase dashboard, not in this file at runtime.
# Listed here for reference of what edge functions will need:
# GEMINI_API_KEY=
# GROQ_API_KEY=
# ELEVENLABS_API_KEY=
# BLAND_API_KEY=
# BLAND_WEBHOOK_SECRET=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=
# TWILIO_VERIFY_SERVICE_SID=
# RESEND_API_KEY=
```

- [ ] **Step 2: Create `src/lib/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in values."
  )
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

- [ ] **Step 3: Commit**

```bash
git add .env.example src/lib/supabase.ts
git commit -m "feat: add supabase client singleton and env example"
```

---

## Task 7: Create page components and route config

**Files:**
- Create: `src/pages/Landing.tsx`
- Create: `src/pages/Dashboard.tsx`
- Create: `src/pages/NotFound.tsx`
- Create: `src/App.tsx`
- Create: `src/main.tsx`

- [ ] **Step 1: Create `src/pages/Landing.tsx` (the page that will be pre-rendered)**

```tsx
import { Link } from "react-router-dom"

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-bold">Calldone</h1>
          <nav className="flex gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium hover:underline"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main className="container py-24">
        <section className="mx-auto max-w-2xl text-center">
          <h2 className="text-5xl font-bold tracking-tight">
            The AI phone agent that makes calls for you.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Tell Calldone what you need done. It calls the pharmacy, books the
            reservation, schedules the appointment. You get a transcript and a
            calendar invite when it's done.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try the demo
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6">
        <div className="container text-center text-sm text-muted-foreground">
          Built by OasisView
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/Dashboard.tsx` (placeholder for Phase 1)**

```tsx
import { useNav } from "@/lib/nav"

export default function Dashboard() {
  const nav = useNav()

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="container">
        <button
          onClick={nav.toLanding}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to landing
        </button>
        <h1 className="mt-4 text-3xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Phase 1 will add auth and the real dashboard here.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/pages/NotFound.tsx`**

```tsx
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
```

- [ ] **Step 4: Create `src/routes.tsx` (route config for vite-react-ssg)**

```tsx
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
```

- [ ] **Step 5: Create `src/App.tsx` (Outlet shell with providers, used as layout by routes)**

```tsx
import { Outlet } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import "./index.css"

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Toaster />
        <Outlet />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 6: Create `src/main.tsx` (SSG entry point that consumes the routes)**

```tsx
import { ViteReactSSG } from "vite-react-ssg"
import { routes } from "./routes"

export const createRoot = ViteReactSSG({ routes })
```

- [ ] **Step 7: Create a temporary `.env` so dev server can start**

Create `.env` (will NOT be committed because `.gitignore` excludes it):

```
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder_anon_key
```

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: exit code 0, no type errors.

If errors appear about `vite-react-ssg` types, run `npm install vite-react-ssg@latest` to get current types.

- [ ] **Step 9: Run dev server and verify pages load**

Run: `npm run dev`
Expected: server starts on `http://localhost:5173`. Open in browser, verify:
- `/` shows the landing page with "The AI phone agent that makes calls for you."
- `/dashboard` shows the placeholder dashboard
- `/anything-else` shows 404

Stop the server with Ctrl+C.

- [ ] **Step 10: Run the build to verify SSG works**

Run: `npm run build`
Expected: build succeeds. `dist/` contains `index.html` with the landing page content already rendered (not just an empty `<div id="root">`).

Verify SSG worked: `grep -q "The AI phone agent that makes calls for you" dist/index.html && echo "SSG OK"`
Expected: `SSG OK`

- [ ] **Step 11: Commit**

```bash
git add src/
git commit -m "feat: add landing, dashboard, 404 pages with SSG-enabled routing"
```

---

## Task 8: Add a public favicon and robots.txt

**Files:**
- Create: `public/robots.txt`

(favicon.ico can be a generic one for now; copy from the original calldone-manny repo or use a placeholder)

- [ ] **Step 1: Copy favicon from original repo**

Run: `cp /Users/manny/calldone-manny/public/favicon.ico /Users/manny/calldone/public/favicon.ico`
Expected: file copied without error.

- [ ] **Step 2: Create `public/robots.txt`**

```
User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /api/

Sitemap: https://calldone.oasisview.dev/sitemap.xml
```

- [ ] **Step 3: Commit**

```bash
git add public/
git commit -m "chore: add favicon and robots.txt"
```

---

## Task 9: Initialize Supabase project locally

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/00000000000000_initial_schema.sql`
- Create: `supabase/.gitignore`

- [ ] **Step 1: Initialize Supabase in the repo**

Run: `cd /Users/manny/calldone && supabase init`
Expected: creates `supabase/config.toml` and `supabase/.gitignore` automatically.

If it prompts about VS Code settings or other extras, decline (just press Enter or N).

- [ ] **Step 2: Verify `supabase/config.toml` exists and has reasonable defaults**

Run: `cat /Users/manny/calldone/supabase/config.toml | head -20`
Expected: should see `project_id = "calldone"` (or similar) and other config sections.

If `project_id` is missing or wrong, edit it to be `project_id = "calldone"`.

- [ ] **Step 3: Create the initial migration placeholder**

Create `supabase/migrations/00000000000000_initial_schema.sql`:

```sql
-- Initial migration placeholder for Calldone.
-- Real schema is added in Phase 1 (auth + profiles) and onward.
-- This file exists to anchor the migrations folder.

select 1;
```

- [ ] **Step 4: Add a README inside supabase/ explaining what's there**

Create `supabase/README.md`:

```markdown
# Supabase

Local Supabase configuration for Calldone.

## Linking to a remote project

After creating a project at https://supabase.com (under the OasisView account):

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

## Local development

```bash
supabase start    # start local Postgres + studio
supabase stop     # stop everything
supabase status   # see what's running
```

## Migrations

Add new migrations with:

```bash
supabase migration new <name>
```

Edit the generated SQL file under `migrations/`, then push to remote with:

```bash
supabase db push
```
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "chore: initialize supabase config and migration scaffolding"
```

---

## Task 10: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_ANON_KEY: placeholder
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

Run: `cat /Users/manny/calldone/.github/workflows/ci.yml | head -5`
Expected: file exists and starts with `name: CI`.

- [ ] **Step 3: Run all the steps locally first to make sure they pass**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all four commands exit 0 with no errors.

If lint complains about unused imports or similar, fix them. If typecheck complains, fix the types. CI must pass before pushing.

- [ ] **Step 4: Commit**

```bash
git add .github/
git commit -m "ci: add lint + typecheck + test + build workflow"
```

---

## Task 11: Write the README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Calldone

AI phone agent that makes calls on your behalf. Tell it what you need done, it places the call, talks to the human on the other end, and reports back with a transcript and a calendar invite.

Built by [OasisView](https://github.com/OasisView).

## Status

Early development. Demo mode by default; real outbound calls require phone verification and only call your own verified number for now.

## Tech stack

- **Frontend**: Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query
- **Pre-rendering**: vite-react-ssg (for SEO on the landing page)
- **Backend**: Supabase (Auth, Postgres, Edge Functions in Deno)
- **AI**: Google Gemini (LLM), Groq Whisper (transcription), ElevenLabs (voice synthesis)
- **Calls**: Bland AI
- **Notifications**: Twilio (SMS), Resend (email + iCalendar)

## Local development

### Prerequisites
- Node.js 20+
- npm 10+
- Supabase CLI (`brew install supabase/tap/supabase`)
- A Supabase project (create one at https://supabase.com)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env example and fill in your Supabase project values
cp .env.example .env
# edit .env with your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Link to your remote Supabase project
supabase link --project-ref <YOUR_PROJECT_REF>

# 4. Push migrations
supabase db push

# 5. Start dev server
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build for production with SSG pre-rendering |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Run unit tests |
| `npm run test:watch` | Watch mode for tests |

## Project structure

```
src/
├── components/    React components (shadcn/ui under ui/)
├── hooks/         Custom React hooks (data fetching lives here)
├── lib/           Singletons and abstractions (supabase, nav, utils)
├── pages/         Route components
├── App.tsx        App shell with providers
├── main.tsx       SSG entry point
├── routes.tsx     Route configuration
└── index.css      Tailwind + theme tokens

supabase/
├── config.toml    Supabase CLI config
├── migrations/    SQL migrations
└── functions/     Edge functions (Deno)
```

## Architecture notes

This codebase uses two patterns to keep a future Next.js migration cheap:

1. **All data fetching lives in custom hooks** under `src/hooks/`. Components never call Supabase directly.
2. **Navigation is centralized** in `src/lib/nav.ts`. Components use `useNav()` instead of `useNavigate()` directly.

If/when this moves to Next.js, only those two surfaces need to change.

## Design docs

See `docs/superpowers/specs/` for the design specification and `docs/superpowers/plans/` for phased implementation plans.

## License

Private. © OasisView.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README"
```

---

## Task 12: Create the GitHub repo and push

This task affects shared state (creates a repo on the OasisView GitHub org). The plan author has approved this in advance via the spec.

- [ ] **Step 1: Verify gh CLI is authenticated as the right user**

Run: `gh auth status`
Expected: shows logged in as OasisView (or as a user with access to OasisView org).

If not authenticated, run `gh auth login` first.

- [ ] **Step 2: Create the private repo**

Run:
```bash
gh repo create OasisView/calldone --private --description "AI phone agent that makes calls on your behalf" --source=/Users/manny/calldone --remote=origin
```

Expected output: confirms repo created at `https://github.com/OasisView/calldone`.

If repo already exists, the command will fail. In that case, just add the remote manually:
```bash
git remote add origin git@github.com:OasisView/calldone.git
```

- [ ] **Step 3: Push the main branch**

Run: `git push -u origin main`
Expected: all commits pushed, `main` set as upstream tracking branch.

- [ ] **Step 4: Verify CI runs and passes**

Run: `gh run list --limit 1`
Wait ~2 minutes, then run again. Expected: most recent run shows `completed success` for CI.

If CI fails, read the logs with `gh run view --log-failed`, fix the issue locally, commit, and push again.

- [ ] **Step 5: Confirm the repo is set up correctly**

Run: `gh repo view OasisView/calldone --web`
Expected: opens the repo in browser. Verify it's private, has the right description, and the README renders.

---

## Task 13: Connect to Vercel and deploy the landing page

This task requires the user to be signed in to Vercel with a GitHub account that has access to OasisView/calldone. Mostly a click-through in the Vercel dashboard, scripted where possible via the Vercel CLI.

**Files:**
- Create: `vercel.json` (only if Vite build config needs overriding; usually not)

- [ ] **Step 1: Install the Vercel CLI globally**

Run: `npm install -g vercel`
Expected: installs without errors. Verify with `vercel --version`.

- [ ] **Step 2: Log in to Vercel**

Run: `vercel login`
Expected: opens a browser window asking to authenticate. Sign in with the GitHub account that has access to OasisView/calldone.

If the user prefers to do this via the web dashboard instead of the CLI, they can:
1. Go to https://vercel.com/new
2. Import the `OasisView/calldone` repo
3. Vercel auto-detects Vite. Override the build command to `npm run build` and output directory to `dist`.
4. Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (placeholder values for now if real Supabase project doesn't exist yet).
5. Click Deploy.
6. Skip to Step 6 below.

- [ ] **Step 3: Link the local repo to a new Vercel project**

Run from `/Users/manny/calldone`:
```bash
vercel link
```

When prompted:
- Set up and link? **yes**
- Which scope? select **OasisView**
- Link to existing project? **no**
- What's the project name? **calldone**
- In which directory is your code located? **./**

Expected: creates `.vercel/` directory (already gitignored via `.vercel` pattern; if not, add it).

- [ ] **Step 4: Add `.vercel` to `.gitignore`**

Verify `.gitignore` has the line `.vercel`. If not, add it:

```bash
echo ".vercel" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .vercel directory"
```

- [ ] **Step 5: Add env vars and deploy**

Run:
```bash
vercel env add VITE_SUPABASE_URL production
# paste: https://placeholder.supabase.co  (or real value if Supabase project exists)

vercel env add VITE_SUPABASE_ANON_KEY production
# paste: placeholder_anon_key  (or real value if Supabase project exists)

vercel deploy --prod
```

Expected: build completes, deploy succeeds, prints a production URL (e.g., `https://calldone-xyz.vercel.app`).

If the build fails with "Module not found: vite-react-ssg" or similar, ensure the `package.json` build script is `vite-react-ssg build` (which it should be from Task 1).

- [ ] **Step 6: Verify the deployed landing page**

Open the production URL Vercel printed.

Verify:
- Landing page hero text is visible
- View page source: should see "The AI phone agent that makes calls for you" in the raw HTML (proves SSG worked in production)
- `/dashboard` route also loads (the placeholder)
- 404 page works for unknown routes

- [ ] **Step 7: (Optional) Set up a custom domain**

If the user has a domain ready (e.g., `calldone.oasisview.dev`):

```bash
vercel domains add calldone.oasisview.dev
```

Follow the DNS instructions Vercel prints. This is optional and can be deferred.

- [ ] **Step 8: Verify GitHub auto-deploy is enabled**

Go to https://vercel.com/dashboard → calldone project → Settings → Git → confirm "Production Branch: main" is set and that pushes to main trigger deploys.

---

## Self-Review Checklist

After all tasks complete, the engineer should be able to verify:

- [ ] `npm install` works from a fresh clone
- [ ] `npm run dev` starts a dev server at port 5173
- [ ] `/` shows the landing page with hero copy
- [ ] `/dashboard` shows the placeholder dashboard
- [ ] `/random-url` shows the 404 page
- [ ] Light/dark theme tokens are defined (theme toggle comes in Phase 1)
- [ ] `npm run build` produces `dist/` with the landing page pre-rendered as static HTML (verify by `grep` for hero text in `dist/index.html`)
- [ ] `npm run typecheck`, `npm run lint`, `npm test` all exit 0
- [ ] CI passes on GitHub for the first push
- [ ] The repo is private and lives at `OasisView/calldone`
- [ ] `.env` is NOT committed to git
- [ ] `.env.example` lists every env var the app and edge functions need
- [ ] The site is deployed on Vercel and the landing page hero text appears in the production HTML source

## What Phase 0 does NOT include (handled in later phases)

- Authentication (Phase 1)
- Real dashboard UI (Phase 1)
- Voice brainstorm interface (Phase 2)
- Bland AI integration (Phase 3)
- Webhooks and notifications (Phase 4)
- Personalization layer (Phase 5)
- Phone verification and real call mode (Phase 6)
- Polish, analytics, marketing copy iteration (Phase 7)

## After this phase

Once all tasks are checked off and CI is green, write the Phase 1 plan covering: Supabase Auth wiring, profiles table + onboarding flow, basic dashboard layout, dashboard navigation, ThemeToggle component.
