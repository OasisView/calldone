# DB Contract — Calldone by Oasis (Checkpoint 3: inbound reception & intake)

**Status: FROZEN** (Checkpoint 3, 2026-07-06). Canonical DDL:
`supabase/migrations/20260706000000_inbound_initial_schema.sql` — **the SQL wins over this
prose**. Enums/caps are mirrored as const arrays in `supabase/functions/_shared/api-types.ts`;
if they ever diverge, the migration wins — report, don't patch locally. Rulings: R23–R28 in
`decision-register.md`. The consumer-outbound schema (Checkpoint 1) is retired per R24: its
migration file is deleted; this schema replaces it via `supabase db reset` (all tables were
empty, pre-launch).

## 1. Model overview

Multi-tenant by **org** (one row per nonprofit). Staff authenticate with real accounts
(anonymous sign-in is retired, R23) and reach data only through org membership. Calls, events,
and intake are written **exclusively by edge functions via `service_role`**; staff read them
through RLS and work the intake/callback queues through narrow column grants.

```
auth.users ─ profiles
     │
org_members (admin|staff) ── orgs ── phone_numbers
                               │  ├── knowledge_packs ── knowledge_entries
                               │  ├── inbound_calls ── call_events
                               │  │        └─(set null)─ intake_records ── callback_queue
                               │  └── (private) usage_counters
                     (private) rate_limits
```

## 2. Tables (public schema; every table RLS-enabled)

| Table | Purpose | Client writes (via RLS + column grants) |
|---|---|---|
| `profiles` | 1:1 with auth.users; member identity; auto-created by `on_auth_user_created` | UPDATE own `display_name` only |
| `orgs` | tenant root: name, slug, timezone, `answering_mode` (R26: `always\|after_hours\|overflow`), `business_hours` jsonb, `escalation_phone` (E.164; must be set before go-live — app-enforced), `notification_email`, `retention_days` (R23, default 90, 1–3650), `calls_enabled` (R28 per-org kill switch), `monthly_minutes_cap` (R28, default 300, **service-role managed — no client grant**) | INSERT (any authenticated user; trigger `on_org_created` makes creator admin); UPDATE by org **admin** on all columns except `monthly_minutes_cap` |
| `org_members` | membership + role `admin\|staff`; PK (org_id, user_id) | admin INSERT/UPDATE/DELETE within own org; self-DELETE allowed; trigger `guard_last_admin` blocks removing/demoting the last admin |
| `phone_numbers` | provider-provisioned numbers; `provider ∈ vapi\|retell\|twilio`; unique `e164`; partial-unique `(provider, provider_number_id)` | none (SELECT only) — provisioning is money-gated, service-role |
| `knowledge_packs` | org FAQ pack; `status draft\|published`; **partial-unique: one published pack per org**; `version`, `published_at` | member INSERT (draft only) + UPDATE while draft; **publish/unpublish (status change) admin-only**; admin DELETE |
| `knowledge_entries` | FAQ rows: question ≤500, answer ≤2000, keywords ≤20, position; denormalized `org_id` for RLS | member full CRUD; total published-pack budget `LIMITS.KB_PACK_MAX_CHARS` is app-enforced |
| `inbound_calls` | one row per handled call: `provider_call_id` (unique per provider), `caller_number` (nullable — withheld caller id), status `in_progress\|completed\|transferred\|voicemail\|failed`, **`disclosure_played` boolean NOT NULL (R28)**, `language en\|es` (R27), `escalation none\|transferred\|voicemail` (R26), `transcript` jsonb array, `summary` ≤4000, `summary_emailed_at`, `error_reason` | **none** — SELECT only; all writes service-role (R5 pattern) |
| `intake_records` | the call's structured outcome (org CRM value): caller_name, need ≤2000, callback_number (E.164), **`callback_consent` boolean NOT NULL (R23)**, preferred_time, `appointment` jsonb (`AppointmentDetails` shape), status `new\|in_review\|done`, staff_notes; `call_id` is **ON DELETE SET NULL** so retention purges never destroy intake | member UPDATE of `status` + `staff_notes` only; INSERT/DELETE service-role |
| `callback_queue` | **the ONLY outbound surface (R23)**: intake_id, `consent_call_id` (provenance; SET NULL on purge) + **`consent_recorded_at` NOT NULL** (survives purge), callback_number, status `pending\|approved\|calling\|done\|canceled`, scheduled_for, attempts ≤10 | member UPDATE of `status` + `scheduled_for`; trigger `guard_callback_rules` allows staff only `pending→approved\|canceled`, `approved→canceled`; **INSERT service-role only and rejected unless the linked intake has `callback_consent = true`** |
| `call_events` | normalized `CallEvent` audit log (R25): provider, `provider_event_id` (**partial-unique per provider = ingestion idempotency**), type, payload jsonb | none; SELECT is **admin-only** (raw payloads); writes service-role |

### private schema (never API-exposed)
- `private.rate_limits (bucket, key, window_start, count)` — R6 pattern carried forward (R28).
- `private.usage_counters (org_id, month, minutes_used)` — R28 monthly minutes ledger.

## 3. Functions & triggers

| Object | Contract |
|---|---|
| `public.rate_limit_hit(bucket, key, window, amount=1) → int` | SECURITY DEFINER, atomic upsert-increment, rejects windows ∉ hour/day/month; **EXECUTE: service_role only** |
| `public.usage_add_minutes(org, minutes) → numeric` | SECURITY DEFINER; increments the org's current-month ledger, returns new total; edge compares to `orgs.monthly_minutes_cap`; **EXECUTE: service_role only** |
| `private.is_org_member/is_org_admin(org)` | SECURITY DEFINER STABLE membership checks (locked `search_path`) used by every policy |
| `private.handle_new_user` | trigger on `auth.users` insert → creates `profiles` row |
| `private.handle_new_org` | trigger on `orgs` insert → creator becomes admin (skipped for service-role inserts where `auth.uid()` is null) |
| `private.guard_last_admin` | blocks demoting/deleting an org's last admin |
| `private.guard_callback_rules` | INSERT: requires linked intake `callback_consent = true` (R23); UPDATE: staff transitions limited to `pending→approved\|canceled`, `approved→canceled`; service-role unrestricted |
| `private.touch_updated_at` | `updated_at` maintenance on orgs / packs / entries / intake / callbacks |
| `private.purge_expired_call_content()` | R23 retention: deletes `call_events` and ended `inbound_calls` older than **each org's** `retention_days` (intake + consent provenance survive via SET NULL + `consent_recorded_at`); prunes `private.rate_limits` (2-day hour/day rows, 35-day month rows) |

**pg_cron**: one guarded job `calldone-retention-purge` daily 03:10 UTC → `purge_expired_call_content()`. The DO-block guard keeps envs without pg_cron applying cleanly (R15 pattern).

## 4. Grants (deny-by-default)

- **`anon` has NOTHING**: `revoke all on all tables/functions in schema public from anon` — there is no anonymous product surface (R23). `enable_anonymous_sign_ins = false` in config.toml.
- `authenticated`: table-level SELECT on all product tables (**RLS narrows rows**); writes only via the column grants in §2.
- `service_role`: full (edge functions).
- `private` schema: usage revoked from anon/authenticated; RPCs are the only doorway.

## 5. What the ws/db repurpose owes (test contract)

The old SQL/RLS suite (ws/db branch) targets the retired schema; it is rewritten against this
one. Minimum assertions (basis of re-frozen `security.md` §10 ws/db):

1. RLS enabled on all 10 public tables; `anon` role: zero access to every table and RPC.
2. **Cross-org isolation**: a member of org A sees zero rows of org B on every org-scoped table.
3. Role enforcement: staff cannot UPDATE `orgs`; admin can (except `monthly_minutes_cap`,
   which even admin cannot — service-role only); staff can edit draft KB but cannot publish.
4. `inbound_calls` / `call_events` / `intake_records` / `callback_queue` / `phone_numbers`:
   client INSERT rejected (and client UPDATE limited to the granted columns on intake/callback).
5. `guard_callback_rules`: service-role INSERT without consent → error; staff `pending→done` → error;
   `pending→approved` → ok.
6. `guard_last_admin`: demoting/deleting the only admin → error.
7. `rate_limit_hit` atomic under concurrency, invalid window rejected, EXECUTE denied to
   authenticated/anon. Same EXECUTE denial for `usage_add_minutes`.
8. Retention: with `retention_days = 1` and back-dated rows, `purge_expired_call_content()`
   removes the call + events but the intake row and `callback_queue.consent_recorded_at` survive.
9. Cascade: deleting an org leaves zero orphans in any org-scoped table.
10. `disclosure_played` exists NOT NULL default false (R28 anchor for the edge suite).

## 6. Regeneration & drift

- `src/types/database.ts` is regenerated from this schema (R14) **during the worker repurpose**
  — until then the baseline file still mirrors the retired schema and compiles against the
  transitional-compat section of api-types.ts.
- Additive migrations are forbidden until v1 ships; defects in this file are fixed in place
  pre-integration (R1 pattern) with a register note.
