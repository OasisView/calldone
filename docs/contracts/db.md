# Calldone — Frozen Database Contract (final)

## 1. Conformance

This document is the human-readable companion to
`supabase/migrations/00000000000000_initial_schema.sql`. It describes that
committed migration **verbatim** and embodies the
[decision register](decision-register.md) (rulings R1–R22). Where this prose and
the migration ever disagree, the migration SQL and the decision register win and
this document is wrong — **fix the doc, never the code**. The migration is frozen
(R1): authored at baseline by the orchestrator, owned by `ws/db` thereafter;
fixes land in this same file pre-merge, and only additive migrations follow once
it ships.

The schema freezes all 9 product tables (spec Phases 1–7) plus the rate-limit
infrastructure now, even though the demo slice only exercises Phases 1–4. Tables
and columns for cut features (`scheduled_calls`, P5/P6 privileged columns) ship
frozen to avoid later migration churn; their *access* is locked down to match the
slice (see R10).

## 2. Anonymous-demo resolution

The demo runs on **Supabase anonymous sign-in**. The resolution baked into the
schema:

- An anonymous visitor gets a real `auth.users` row and a JWT whose Postgres role
  is **`authenticated`** (not `anon`), carrying the claim **`is_anonymous = true`**.
- Every RLS policy therefore targets role **`authenticated` only**. There is no
  policy granting the `anon` role anything.
- The `anon` Postgres role is stripped of all access as defense in depth:
  `revoke all on all tables in schema public from anon;` and the same for
  sequences. The landing page never queries the database, so `anon` needs nothing.
- The `handle_new_user` trigger fires for *every* `auth.users` insert — email,
  Google, and anonymous alike — so an anonymous visitor immediately owns a
  `profiles` row and can CRUD their own brainstorm/script data.
- Where anonymous users must be held back (R8), the policy checks the JWT claim:
  `not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)`.
  Missing/false claim ⇒ a permanent user ⇒ write allowed.

## 3. Per-table reference

All user-owned tables FK to `public.profiles(id)`; `profiles.id` FKs to
`auth.users(id) ON DELETE CASCADE`. Deleting an auth user erases everything they
own. Every table has RLS enabled (§5). Three shared trigger helper functions back
the tables; all three are `set search_path = ''` and have `execute` revoked from
`public, anon, authenticated`:

- **`set_updated_at()`** — `BEFORE UPDATE`, sets `new.updated_at = now()`.
- **`handle_new_user()`** — `SECURITY DEFINER`, `AFTER INSERT on auth.users`;
  inserts a `profiles` row using `display_name`/`full_name`/`name` from
  `raw_user_meta_data` (`nullif(coalesce(...), '')`), `on conflict (id) do nothing`.
- **`reset_phone_verification()`** — `BEFORE UPDATE on profiles`; if
  `phone_number` changed but `phone_verified_at` was not changed in the same
  statement, nulls `phone_verified_at` (R9).

### 3.1 `profiles`
One row per `auth.users` row (incl. anonymous), auto-created by the
`on_auth_user_created` trigger.

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | FK → `auth.users(id)` **ON DELETE CASCADE** |
| `display_name` | text | `profiles_display_name_len`: null or ≤ 120 chars |
| `phone_number` | text | `profiles_phone_e164`: null or `^\+[1-9][0-9]{1,14}$` |
| `phone_verified_at` | timestamptz | never client-writable (R9) |
| `time_zone` | text | `profiles_time_zone_len`: null or ≤ 64 chars |
| `communication_style` | jsonb | NOT NULL default `'{}'`; `profiles_comm_style_object`: `jsonb_typeof = 'object'` |
| `style_summary` | text | `profiles_style_summary_len`: null or ≤ 4000 chars; service-role-only write (P5) |
| `created_at` | timestamptz | NOT NULL default `now()` |
| `updated_at` | timestamptz | NOT NULL default `now()` |

Triggers: `trg_profiles_updated_at` (set_updated_at), `trg_profiles_phone_reset`
(reset_phone_verification). No INSERT (trigger-only) and no DELETE
(cascade-from-auth-only) is exposed to clients.

### 3.2 `user_facts`
RAG memory; upsert by `(user_id, key)`. Anonymous sessions may not write (R8).

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `key` | text | NOT NULL; `user_facts_key_len`: 1–100 chars |
| `value` | text | NOT NULL; `user_facts_value_len`: 1–2000 chars |
| `source` | text | NOT NULL default `'manual'`; `user_facts_source_enum`: `onboarding`/`brainstorm`/`manual` |
| `confidence` | real | NOT NULL default `1.0`; `user_facts_confidence_range`: 0–1 |
| `created_at` | timestamptz | NOT NULL default `now()` |
| `updated_at` | timestamptz | NOT NULL default `now()` |
| — | | `user_facts_user_key_unique` UNIQUE `(user_id, key)` (enables upsert) |

Trigger: `trg_user_facts_updated_at`.

### 3.3 `brainstorm_sessions`
`transcript` is a JSONB array of `{role: "user"|"assistant", text, audio_url?}`;
`audio_url` stays null in Phases 1–4 (audio is never stored).

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `transcript` | jsonb | NOT NULL default `'[]'`; `brainstorm_sessions_transcript_array`: `jsonb_typeof = 'array'` |
| `resulting_script_id` | uuid | FK → `call_scripts(id)` **ON DELETE SET NULL** (added after `call_scripts` to close the circular ref) |
| `created_at` | timestamptz | NOT NULL default `now()` |
| `updated_at` | timestamptz | NOT NULL default `now()` |

Trigger: `trg_brainstorm_sessions_updated_at`.

### 3.4 `call_scripts`

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `script_text` | text | NOT NULL; `call_scripts_text_len`: 1–20000 chars |
| `call_purpose` | text | `call_scripts_purpose_len`: null or ≤ 500 chars |
| `source` | text | NOT NULL default `'brainstorm'`; `call_scripts_source_enum`: `brainstorm`/`manual_edit`/`duplicated` |
| `brainstorm_session_id` | uuid | FK → `brainstorm_sessions(id)` **ON DELETE SET NULL** |
| `is_favorite` | boolean | NOT NULL default `false` |
| `created_at` | timestamptz | NOT NULL default `now()` |
| `updated_at` | timestamptz | NOT NULL default `now()` |

Trigger: `trg_call_scripts_updated_at`.

### 3.5 `script_edit_events`
Append-only style-learning signal. Client may SELECT and INSERT only; anonymous
sessions may not write (R8).

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `script_id` | uuid | NOT NULL, FK → `call_scripts(id)` **ON DELETE CASCADE** |
| `original_text` | text | NOT NULL; `script_edit_events_original_len`: ≤ 20000 chars |
| `edited_text` | text | NOT NULL; `script_edit_events_edited_len`: ≤ 20000 chars |
| `created_at` | timestamptz | NOT NULL default `now()` |

No `updated_at`, no update trigger (append-only).

### 3.6 `call_logs`
INSERT by `make-call` (service role); UPDATE by `call-webhook` (service role).
Demo calls use a `bland_call_id` prefixed `demo_` and must still be E.164 in
`phone_number_called`. `is_demo` defaults TRUE as the safety posture (R5).

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `script_id` | uuid | FK → `call_scripts(id)` **ON DELETE SET NULL** |
| `bland_call_id` | text | `call_logs_bland_id_len`: null or ≤ 128 chars |
| `is_demo` | boolean | NOT NULL default `true` |
| `phone_number_called` | text | `call_logs_phone_e164`: null or `^\+[1-9][0-9]{1,14}$` |
| `status` | text | NOT NULL default `'initiated'`; `call_logs_status_enum`: `initiated`/`ringing`/`completed`/`failed`/`no_answer`/`busy` |
| `transcript` | text | nullable |
| `duration_seconds` | integer | `call_logs_duration_nonneg`: null or ≥ 0 |
| `appointment_details` | jsonb | `call_logs_appt_object`: null or `jsonb_typeof = 'object'` |
| `confirmation_detected` | boolean | NULL = extraction not yet run |
| `error_reason` | text | nullable |
| `created_at` | timestamptz | NOT NULL default `now()` |
| `updated_at` | timestamptz | NOT NULL default `now()` |

Trigger: `trg_call_logs_updated_at`. Added to the `supabase_realtime`
publication (guarded) for optional live call-status subscriptions; RLS still gates
subscribers.

### 3.7 `scheduled_calls`
P6 feature; schema frozen now, clients SELECT-only until P6 (R10).

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `script_id` | uuid | NOT NULL, FK → `call_scripts(id)` **ON DELETE CASCADE** |
| `scheduled_for` | timestamptz | NOT NULL |
| `phone_number` | text | NOT NULL; `scheduled_calls_phone_e164`: `^\+[1-9][0-9]{1,14}$` |
| `status` | text | NOT NULL default `'pending'`; `scheduled_calls_status_enum`: `pending`/`placed`/`failed`/`cancelled` |
| `call_log_id` | uuid | FK → `call_logs(id)` **ON DELETE SET NULL** |
| `attempt_count` | integer | NOT NULL default `0`; `scheduled_calls_attempts_range`: 0–10 |
| `last_error` | text | nullable |
| `created_at` | timestamptz | NOT NULL default `now()` |
| `updated_at` | timestamptz | NOT NULL default `now()` |

Trigger: `trg_scheduled_calls_updated_at`.

### 3.8 `script_feedback`
One row per `(user, script)`: 1 = thumbs down, 5 = thumbs up; upsert to toggle.
Anonymous sessions may not write (R8).

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL, FK → `profiles(id)` **ON DELETE CASCADE** |
| `script_id` | uuid | NOT NULL, FK → `call_scripts(id)` **ON DELETE CASCADE** |
| `rating` | smallint | NOT NULL; `script_feedback_rating_range`: 1–5 |
| `note` | text | `script_feedback_note_len`: null or ≤ 2000 chars |
| `created_at` | timestamptz | NOT NULL default `now()` |
| — | | `script_feedback_user_script_unique` UNIQUE `(user_id, script_id)` |

No `updated_at`, no update trigger.

### 3.9 `anonymous_events`
Aggregate analytics, no PII (metadata keys whitelisted in code: counts/types
only). Inserts/reads via service role only — zero client access whatsoever.

| Column | Type | Notes / CHECK |
|---|---|---|
| `id` | bigint PK | `generated always as identity` |
| `event_type` | text | NOT NULL; `anonymous_events_type_len`: 1–100 chars |
| `metadata` | jsonb | NOT NULL default `'{}'`; `anonymous_events_metadata_object`: `jsonb_typeof = 'object'` |
| `created_at` | timestamptz | NOT NULL default `now()` |

## 4. Rate-limit infrastructure (R6)

A dedicated **`private` schema** (not exposed via PostgREST) holds the counters,
reached solely through one `SECURITY DEFINER` RPC.

**`private.rate_limits`** — fixed-window counters:

| Column | Type | Notes |
|---|---|---|
| `bucket` | text | NOT NULL — the canonical `RATE_LIMITS.<key>.bucket` strings from `api-types.ts` (api.md §8), e.g. `'make_call:ip'`, `'tts_chars:global'` |
| `key` | text | NOT NULL — ip, user_id, or `'global'` |
| `window_start` | timestamptz | NOT NULL — `date_trunc('hour'|'day'|'month', now())` |
| `count` | integer | NOT NULL default `0` |
| — | | PRIMARY KEY `(bucket, key, window_start)` |

**`public.rate_limit_hit(p_bucket text, p_key text, p_window text, p_amount integer default 1) returns integer`**
— `SECURITY DEFINER` (owner postgres), `set search_path = ''`:

- Validates `p_window in ('hour','day','month')`, else raises.
- `v_window_start := date_trunc(p_window, now())`.
- Atomic upsert on `(bucket, key, window_start)`: inserts `greatest(p_amount, 0)`,
  on conflict adds `greatest(p_amount, 0)` to the existing count.
- Returns the new running count (`integer`).

`execute` is **revoked from `public, anon, authenticated`** and **granted to
`service_role` only**. No role needs direct access to the `private` schema; the
RPC is the sole access path. Index `idx_rate_limits_window` on `(window_start)`
supports the daily cleanup (§6).

## 5. RLS access matrix

RLS is enabled on **all 10 tables** (9 product tables + `private.rate_limits`).
Policies target role `authenticated` only; `service_role` bypasses RLS entirely.
"Authenticated (incl. anonymous)" means the policy applies to both, **except** the
anon-deny columns called out below. Privileges are reset
(`revoke all ... from anon` and `from authenticated`) then re-granted precisely —
the grants below are the second gate under RLS (defense in depth).

| Table | SELECT | INSERT | UPDATE | DELETE | Service-role-only |
|---|---|---|---|---|---|
| `profiles` | own row | — (trigger-only) | own row, cols `display_name, phone_number, time_zone, communication_style` | — (cascade-only) | `phone_verified_at`, `style_summary`, `created_at`, `updated_at` writes |
| `user_facts` | own | own **non-anon** (R8) | own **non-anon**, cols `value, source, confidence` (R8) | own | — |
| `brainstorm_sessions` | own | own (anon OK) | own (anon OK), cols `transcript, resulting_script_id` | own | — |
| `call_scripts` | own | own (anon OK) | own (anon OK), cols `script_text, call_purpose, is_favorite` | own | — |
| `script_edit_events` | own | own **non-anon** (R8) | — (append-only) | — | — |
| `call_logs` | own | **service-role only** (R5) | **service-role only** (R5) | **service-role only** | all writes (make-call inserts, call-webhook updates) |
| `scheduled_calls` | own | — (R10) | — (R10) | — (R10) | all writes until P6 |
| `script_feedback` | own | own **non-anon** (R8) | own **non-anon**, cols `rating, note` (R8) | own | — |
| `anonymous_events` | — | — | — | — | **all access** (RLS enabled, zero policies, no grants) |
| `private.rate_limits` | — | — | — | — | **all access** (zero policies/grants; touched only via `rate_limit_hit`) |

Callouts (exactly as enforced in the SQL):

- **R8** — anonymous sessions are **denied INSERT and UPDATE** on `user_facts`,
  `script_edit_events`, and `script_feedback`. The `_non_anon` policies add
  `and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)` to
  both `using` and `with check`. Anonymous users *can* SELECT/DELETE their own
  `user_facts`/`script_feedback` and SELECT their `script_edit_events`; they have
  full CRUD on their own `brainstorm_sessions`/`call_scripts`.
- **R9** — `phone_number` is client-writable (it appears in the `profiles` UPDATE
  column grant); `phone_verified_at` is **never** client-writable (absent from the
  grant) and the `reset_phone_verification` trigger voids it on any phone change.
- **R10** — `scheduled_calls` is **SELECT-only** for clients: a single
  `scheduled_calls_select_own` policy and a bare `grant select`, no
  INSERT/UPDATE/DELETE policies or grants until P6.
- **R5** — `call_logs` has **only** a SELECT policy (`call_logs_select_own`) and
  only `grant select`. All writes are service-role-only.
- `anonymous_events` and `private.rate_limits` have RLS enabled with **zero
  policies and zero grants** to `anon`/`authenticated` — only `service_role`
  (RLS bypass) or the `SECURITY DEFINER` RPC can reach them.

`(select auth.uid())` / `(select auth.jwt() ...)` wrappers are intentional:
they cache per statement (initplan) for RLS performance.

## 6. R15 retention

Scheduled jobs are set up inside a guarded `DO` block so environments **without
`pg_cron` still apply the migration cleanly**: `create extension if not exists
pg_cron` is wrapped in an exception handler (`raise notice` on failure), and the
two jobs are scheduled only `if exists (select 1 from pg_extension where extname =
'pg_cron')`.

- **`purge-anonymous-users`** — cron `0 4 * * *`:
  `delete from auth.users where is_anonymous and created_at < now() - interval '24 hours'`.
  Every FK chain cascades from `auth.users` → `profiles` → all user-owned tables,
  so a purged anonymous user's profile, transcripts, scripts, and call logs vanish
  with them (zero orphans).
- **`cleanup-rate-limits`** — cron `30 4 * * *`:
  `delete from private.rate_limits where window_start < now() - interval '2 days'`.

## 7. RLS acceptance tests (ws/db)

SQL/RLS policy tests run against `supabase db reset` (R21). Each item is
independently testable:

1. **RLS enabled on all 10 tables** — `relrowsecurity = true` for the 9 `public`
   product tables and `private.rate_limits`.
2. **Cross-user isolation** — as user A, SELECT/UPDATE/DELETE of user B's rows in
   every owned table returns zero rows / affects zero rows.
3. **Anon-deny works (R8)** — with a JWT carrying `is_anonymous = true`, INSERT or
   UPDATE on `user_facts`, `script_edit_events`, and `script_feedback` is rejected,
   while INSERT on the same user's `brainstorm_sessions`/`call_scripts` succeeds.
4. **`call_logs` has no client write** — as `authenticated`, INSERT/UPDATE/DELETE
   on `call_logs` fails (no policy + no grant); SELECT of own rows succeeds; a
   `service_role` INSERT/UPDATE succeeds.
5. **`phone_verified_at` not client-writable (R9)** — UPDATE setting
   `phone_verified_at` as `authenticated` fails (column not granted); changing
   `phone_number` alone nulls any prior `phone_verified_at` via the trigger.
6. **`scheduled_calls` SELECT-only (R10)** — `authenticated` SELECT of own rows
   succeeds; INSERT/UPDATE/DELETE fails.
7. **`anonymous_events` / `rate_limits` zero client access** — `authenticated`
   SELECT/INSERT on either fails; both are reachable only via `service_role` /
   `rate_limit_hit`.
8. **Cascade leaves zero orphans** — deleting an anonymous `auth.users` row (the
   R15 purge predicate) cascades to `profiles` and every owned table, leaving no
   rows referencing the deleted user across all tables.
9. **`rate_limit_hit` increments atomically** — repeated calls within the same
   fixed window return a monotonically increasing count; an invalid `p_window`
   raises; execute is denied to `authenticated`/`anon` and allowed to
   `service_role`.

## 8. Frozen vs may-evolve

**Frozen (this migration is the law; only additive migrations after it ships,
owned by `ws/db`):** all 9 product tables and their columns, CHECK constraints,
FK/ON DELETE behavior, the three trigger functions and their triggers,
`private.rate_limits` + `rate_limit_hit`, all RLS policies, the precise grant set,
the realtime publication add, the pg_cron jobs, and every index. The E.164 regex,
status enums, and numeric caps mirror `_shared/api-types.ts` (R3/R17) — that file
is the single source for the API-side copies; the DB CHECKs restate the same
values as the database gate.

**May evolve (additively, post-merge):** new tables/columns for P5/P6 features
(personalization summarizer, `schedule-call` + cron execution) and the
client-facing access to `scheduled_calls` (INSERT/UPDATE policies + grants), all
introduced by *new* migration files — never by editing this baseline. Rate-limit
*numbers* live in `api-types.ts` and can be tuned there without a schema change
(the `private.rate_limits` shape is fixed).
