---
name: contract-check
description: Diff a worker branch against the frozen contracts in docs/contracts/ and the file-ownership map to catch contract drift before merge. Use when reviewing a workstream branch (ws/db, ws/edge, ws/auth-ui, ws/brainstorm-ui, ws/calls-ui) or verifying a baseline change respects ownership and frozen signatures.
---

# contract-check

The contracts in `docs/contracts/` (`frontend.md`, `api.md`, `db.md`, `security.md`, `workstreams.md`) plus `api-types.ts` are the single source of truth. A worker branch may IMPORT any baseline file but may EDIT only the files its ownership column lists. This skill catches both drift and ownership violations.

## Workflow

1. **Compute the diff.** `git diff main...<branch> --name-only` for the changed file set, and full `git diff` for content.
2. **Ownership check** (frontend.md §8 ownership map / workstreams.md): every changed path must belong to that branch's owning workstream. Flag any edit to an orchestrator-frozen file (`src/types/*`, `src/lib/{supabase,edge,query-keys,phone,schemas,ics,nav,utils}.ts`, `routes.tsx`, `App.tsx`, `src/components/ui/*`, `src/components/guards/*`, `_shared/api-types.ts`, `package.json`, `package-lock.json`, `config.toml`, `ci.yml`, `vercel.json`, `robots.txt`, `.env.example`, root configs, `.claude/skills/**`, `docs/**`). Frozen files must be byte-identical to main; signature-frozen files (`_shared/ics.ts`, the initial migration) keep their exported signatures.
3. **Signature check** (frontend.md §3.1): hook signatures and `UseSessionResult`/result types match the contract exactly — no added/removed exports, no changed param or return shapes. Query keys match §5.2; route guards match §3.3; naming matches §4.
4. **Constant check:** no hard-coded copies of numbers/regex that should import from `src/types/api` (`E164_REGEX`, `LIMITS`, `RATE_LIMITS`). `git grep` for duplicated literals.
5. **API shape check** (api.md §1–3): request/response shapes and the error envelope match per-function contracts; error codes come from the frozen `API_ERROR_CODES`.
6. **Report** a table: file → owner → allowed?/drift found, with a clear pass/fail. Any frozen-file edit or signature change is a hard FAIL — it must go back to the orchestrator to amend the baseline on main, then workers rebase (never patch shared files locally).
