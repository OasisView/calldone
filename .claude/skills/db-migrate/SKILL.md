---
name: db-migrate
description: Author a Supabase SQL migration, reset the local DB to apply it, run the RLS/policy tests, and push. Use when adding or changing database schema, RLS policies, grants, the rate_limit RPC, or pg_cron jobs for Calldone (ws/db work).
---

# db-migrate

The migration IS the contract (R1). All schema, RLS, grants, the `private.rate_limits` table, `public.rate_limit_hit()`, and the guarded pg_cron jobs live in `supabase/migrations/`. `docs/contracts/db.md` is authoritative for columns; `security.md §1.4`/§5 for the policy + grant matrix.

## Workflow

1. **Write the migration.** Add a timestamped file under `supabase/migrations/`. Keep the frozen initial schema intact unless intentionally amending the baseline contract. Every product table has `RLS ENABLED` (all 9, no exceptions); the `private` schema is never added to PostgREST's exposed schemas.
2. **Reset locally.** `supabase db reset` — re-applies every migration from scratch plus seed. This is the only way to prove the migration is self-contained.
3. **Run RLS / policy tests** (security.md §10 ws/db) against the reset DB:
   - Zero tables without RLS: `select relname from pg_class join pg_namespace on relnamespace=pg_namespace.oid where nspname='public' and relkind='r' and not relrowsecurity` returns no rows.
   - Policy matrix matches §1.4 verbatim (`pg_policies`): `anonymous_events` has zero policies; `call_logs` has no client write policy; `scheduled_calls` is SELECT-only (R10).
   - `profiles` `GRANT UPDATE` covers exactly `(display_name, phone_number, time_zone, communication_style)`; updating `phone_verified_at` as `authenticated` fails; changing `phone_number` nulls `phone_verified_at` via the reset trigger.
   - Anon JWT (`set request.jwt.claims`) cannot write `user_facts`/`script_edit_events`/`script_feedback`, but CAN CRUD its own `brainstorm_sessions`/`call_scripts`.
   - Deleting an anonymous `auth.users` row cascades to zero orphans across all 9 tables; the 24h anon purge and 2-day `rate_limits` cleanup jobs exist (extension-guarded).
   - `rate_limit_hit` execute is granted to `service_role`, revoked from `public`/`anon`/`authenticated`.
4. **Push** only after the reset + tests are green: `supabase db push` (or commit for CI to apply). Never push an un-reset migration.

## Guardrails
- pg_cron jobs must be extension-guarded so environments without pg_cron don't fail the migration (R15).
- Never weaken a policy to make a test pass — fix the test or the migration to match the frozen matrix.
