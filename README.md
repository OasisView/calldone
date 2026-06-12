# Calldone

AI phone agent that makes calls on your behalf. Tell it what you need done, it places the call, talks to the human on the other end, and reports back with a transcript and a calendar invite.

Built by [OasisView](https://github.com/OasisView).

## Status

**Free interactive demo.** The current build runs entirely in your browser — no API keys, no backend, no sign-up, and nothing that costs money:

- 🎙️ **Voice in**: real microphone input via the browser's Web Speech API (Chrome/Edge), with a typed input that always works everywhere.
- 🔊 **Voice out**: spoken replies via the browser's `speechSynthesis`.
- 🧠 **Scripted brain**: a deterministic conversation engine recognizes the request (prescription refill, appointment, reservation, general errand), asks clarifying questions, and drafts the call script.
- 📞 **Simulated call**: the "call" plays out live as a realistic transcript — no phone is ever dialed.
- 📅 **Real output**: a confirmed appointment with a downloadable `.ics` calendar invite.
- 💾 **Local storage**: scripts and call history persist in `localStorage` only.

Every generated script opens with two disclosures — "this is an AI assistant calling on behalf of [name]" and "this call may be recorded" — enforced in code, not just templates.

## Try it

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Try the demo**. No `.env` needed.

## Tech stack

- **Frontend**: Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, React Router, TanStack Query
- **Pre-rendering**: vite-react-ssg (SEO for the landing page; build needs zero env vars)
- **Voice**: Web Speech API (`SpeechRecognition` + `speechSynthesis`) — free, browser-native
- **Demo engine**: pure TypeScript under `src/lib/demo/` (intents, conversation state machine, canned transcripts, localStorage store)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build with SSG pre-rendering (no env required) |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Run unit tests |
| `npm run test:watch` | Watch mode for tests |

## Project structure

```
src/
├── components/
│   ├── ui/            shadcn/ui primitives
│   ├── brainstorm/    mic button, conversation view, typed composer
│   ├── calls/         call transcript, appointment card
│   └── DemoBadge.tsx  always-visible "Demo mode" indicator
├── hooks/             use-brainstorm, use-scripts, use-calls (the only data surface)
├── lib/
│   ├── demo/          the local engine: intents, conversation, transcripts, store
│   ├── audio/         Web Speech wrappers (recognition, tts)
│   ├── ics.ts         appointment → RFC 5545 .ics
│   ├── nav.ts         centralized navigation (migration-friendly)
│   └── supabase.ts    lazy client — unused by the demo, ready for the upgrade
├── pages/             Landing, Brainstorm, ScriptReview, Call, Dashboard, NotFound
└── routes.tsx         route configuration
```

## Architecture notes

Two patterns keep future upgrades cheap:

1. **All data access lives in hooks** (`src/hooks/`). Components never touch the storage layer directly — so swapping `localStorage` for Supabase later is a hook-swap, not a rewrite.
2. **Navigation is centralized** in `src/lib/nav.ts`. Components use `useNav()` instead of `useNavigate()` directly.

## The upgrade path (real calls)

The full paid architecture — Supabase (auth, Postgres + RLS, Deno edge functions), Gemini, Whisper via Groq, ElevenLabs, Bland AI for real outbound calls, Twilio/Resend notifications — is fully specified and frozen in `docs/contracts/` (decision register, DB schema migration, canonical API types). The demo's hooks, routes, voice fallback, and `.ics` generation all carry over unchanged.

## Design docs

See `docs/superpowers/specs/` for the original design specification and `docs/contracts/` for the frozen upgrade contracts.

## License

Private. © OasisView.
