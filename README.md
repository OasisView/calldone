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
- Supabase CLI (`brew install supabase/tap/supabase`), only needed when working with migrations
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
