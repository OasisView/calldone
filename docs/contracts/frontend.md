# Frontend Contract — Calldone by Oasis (Checkpoint 3: inbound reception & intake)

**Status: FROZEN** (Checkpoint 3, 2026-07-06). Conformance: embodies the decision register
through R28; the register wins over any disagreeing text. Siblings: `db.md` (schema/RLS),
`api.md` (edge API), `security.md`. This document is the collision-prevention law for the
repurposed workstreams (R23): who owns which files, which routes exist, and the hook
signatures everyone codes against.

**Data-access rule (unchanged):** components never import `@/lib/supabase` — all data access
goes through hooks; navigation goes through `useNav()`. In v1 the dashboard calls **no edge
functions**: everything is supabase-js under RLS (api.md §1). Anonymous sign-in is retired
(R23) — `signInAnonymously` must not appear anywhere in `src/` (CI-grep, security.md §10).

## 1. Routes (`src/routes.tsx`, orchestrator-owned)

| Path | Page | Guard |
|---|---|---|
| `/` | `Landing` (product marketing; sign-in CTA) | public |
| `/login`, `/signup` | `Login` / `Signup` | public (redirect to `/dashboard` when authed) |
| `/onboarding` | `Onboarding` — create org (name, timezone, `answering_mode` R26, business hours, escalation phone, notification email) | `RequireAuth` |
| `/dashboard` | `Dashboard` — recent calls, open intake, callback queue summary | `RequireAuth` + `RequireOrg` |
| `/calls` | `Calls` — call history list | `RequireAuth` + `RequireOrg` |
| `/calls/:id` | `CallDetail` — transcript, escalation/disclosure badges, linked intake | `RequireAuth` + `RequireOrg` |
| `/intake` | `Intake` — work queue (status: new → in_review → done; staff notes) | `RequireAuth` + `RequireOrg` |
| `/callbacks` | `Callbacks` — consented queue: approve / cancel / schedule | `RequireAuth` + `RequireOrg` |
| `/knowledge` | `Knowledge` — pack builder (entries CRUD; publish = admin) | `RequireAuth` + `RequireOrg` |
| `/settings` | `OrgSettings` — org fields incl. answering mode, retention, calls_enabled kill switch (admin-gated UI; RLS enforces regardless) | `RequireAuth` + `RequireOrg` |

Guards: `RequireAuth` (session or → `/login`), `RequireOrg` (membership or → `/onboarding`).
Both live in `src/components/guards/` (orchestrator-owned).

## 2. Hook signatures (implement EXACTLY; TanStack Query underneath)

```ts
// use-session.ts (ws/auth-ui)
interface UseSessionResult {
  session: Session | null; user: User | null; isLoading: boolean;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  signInGoogle(): Promise<void>;             // PKCE
  signOut(): Promise<void>;                  // + clears query cache
}
// use-org.ts (ws/auth-ui): current org + membership
interface UseOrgResult {
  org: Org | null; role: "admin" | "staff" | null; isLoading: boolean;
  createOrg(input: OrgCreateInput): Promise<Org>;      // trigger makes creator admin
  updateOrg(patch: OrgUpdateInput): Promise<void>;     // admin; never monthly_minutes_cap
}
// use-members.ts (ws/auth-ui): list/invite-by-email/remove/change-role (admin)
// use-calls.ts (ws/dashboard-ui): list (org, newest first) + detail incl. transcript
// use-intake.ts (ws/dashboard-ui): list by status + updateStatus/updateNotes (granted cols only)
// use-callbacks.ts (ws/dashboard-ui): list + approve(id)/cancel(id)/schedule(id, when)
//   — only legal transitions (db.md guard); render server rejections cleanly
// use-knowledge.ts (ws/kb-ui): pack + entries CRUD, publish() (admin), KB_PACK_MAX_CHARS budget
```

Types come from `src/types/database.ts` (regenerated from the inbound schema at repurpose,
R14) and `src/types/api.ts` (re-export of `_shared/api-types.ts`).

## 3. Workstream ownership (repurposed per R23)

| Workstream (branch) | Owns |
|---|---|
| ws/db (`ws/db`) | `supabase/migrations/`, `supabase/seed.sql`, SQL/RLS tests (rewritten per db.md §5) |
| ws/edge (`ws/edge`) | `supabase/functions/**` except `_shared/api-types.ts` (api.md tree) |
| ws/auth-ui (`ws/auth-ui`) | `Landing/Login/Signup/Onboarding` pages, guards consumption, `layout/*`, `use-session`/`use-org`/`use-members`, `tests/auth/**` |
| ws/dashboard-ui (`ws/calls-ui` repurposed) | `Dashboard/Calls/CallDetail/Intake/Callbacks` pages, calls/intake/callback components, `use-calls`/`use-intake`/`use-callbacks`, `tests/dashboard/**` |
| ws/kb-ui (`ws/brainstorm-ui` repurposed) | `Knowledge` page + KB components, `use-knowledge`, optional browser-local voice input (`src/lib/audio/` carve-out), `tests/kb/**` |
| orchestrator (frozen) | R20 list unchanged: configs, `App/main/routes`, `src/lib/*`, `src/types/*`, `ui/*`, guards, `_shared/api-types.ts`, migration (until handed to ws/db), CI, docs |

**Salvage map (what each repurpose keeps):** auth-ui keeps AuthForm/layout/theme + session
plumbing (drops linkEmail/linkGoogle + anonymous paths); dashboard-ui keeps list/detail/
transcript/AppointmentCard(.ics via shared `ics.ts`, R18)/badge patterns (drops make-call +
polling machinery); kb-ui keeps the conversation-style editor shell + voice input wrappers
(drops transcribe/tts edge calls — Web Speech only).

## 4. UX security posture (mirrors security.md)
Plain-text rendering of transcripts/intake (no `dangerouslySetInnerHTML` — CI grep); demo
badge pattern is retired with the demo; `is_demo` has no successor — every call is real but
**test-numbers-only until E2E acceptance passes**; staff-facing errors render the envelope
message + `Retry-After` cooldowns on 429; admin-only controls hidden for staff AND enforced
server-side (RLS/grants) — UI hiding is never the boundary.
