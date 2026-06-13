-- ============================================================================
-- Calldone initial schema — FROZEN CONTRACT (all 9 product tables, Phases 1-7,
-- plus rate-limit infrastructure). See docs/contracts/db.md and
-- docs/contracts/decision-register.md. Additive migrations only after this
-- ships. Authored at baseline by the orchestrator; owned by ws/db thereafter.
--
-- Conventions:
--   * All user-owned tables FK to public.profiles(id) ON DELETE CASCADE,
--     which itself cascades from auth.users. Deleting an auth user erases
--     everything they own.
--   * RLS enabled on every table. Policies target role `authenticated` only
--     (Supabase anonymous sign-ins also use role `authenticated`, carrying
--     the JWT claim is_anonymous=true). The `anon` role has zero access.
--   * Anonymous sessions may NOT write user_facts, script_edit_events, or
--     script_feedback (R8) — enforced in the policies below.
--   * service_role bypasses RLS: edge functions own all writes to call_logs
--     and anonymous_events, and privileged column updates on profiles
--     (phone_verified_at) and scheduled_calls (P6 cron columns).
--   * (select auth.uid()) wrapper is intentional: caches per-statement
--     (initplan) for RLS performance.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Trigger helper functions
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles auto-create: fires for every auth.users insert (email, Google,
-- and anonymous sign-ins alike). SECURITY DEFINER so it bypasses RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Security (R9): if phone_number changes without phone_verified_at being
-- explicitly changed in the same statement, verification is voided. The client
-- cannot write phone_verified_at at all (column grants below), so any
-- client-side phone edit always voids verification. verify-phone-confirm
-- (service role, P6) sets phone_verified_at without touching phone_number and
-- is unaffected.
create or replace function public.reset_phone_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone_number is distinct from old.phone_number
     and new.phone_verified_at is not distinct from old.phone_verified_at then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_updated_at()           from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.reset_phone_verification() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text
                        constraint profiles_display_name_len
                        check (display_name is null or char_length(display_name) <= 120),
  phone_number        text
                        constraint profiles_phone_e164
                        check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{1,14}$'),
  phone_verified_at   timestamptz,
  time_zone           text
                        constraint profiles_time_zone_len
                        check (time_zone is null or char_length(time_zone) <= 64),
  communication_style jsonb not null default '{}'::jsonb
                        constraint profiles_comm_style_object
                        check (jsonb_typeof(communication_style) = 'object'),
  style_summary       text
                        constraint profiles_style_summary_len
                        check (style_summary is null or char_length(style_summary) <= 4000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users row, auto-created by on_auth_user_created trigger. Includes anonymous demo users.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_profiles_phone_reset
  before update on public.profiles
  for each row execute function public.reset_phone_verification();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. user_facts
-- ----------------------------------------------------------------------------

create table public.user_facts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  key        text not null
               constraint user_facts_key_len check (char_length(key) between 1 and 100),
  value      text not null
               constraint user_facts_value_len check (char_length(value) between 1 and 2000),
  source     text not null default 'manual'
               constraint user_facts_source_enum
               check (source in ('onboarding', 'brainstorm', 'manual')),
  confidence real not null default 1.0
               constraint user_facts_confidence_range check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_facts_user_key_unique unique (user_id, key)
);

comment on table public.user_facts is
  'RAG memory. Upsert by (user_id, key) — ON CONFLICT (user_id, key) DO UPDATE. Anonymous sessions may not write (R8).';

create trigger trg_user_facts_updated_at
  before update on public.user_facts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. brainstorm_sessions  (resulting_script_id FK added after call_scripts)
-- ----------------------------------------------------------------------------

create table public.brainstorm_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  transcript          jsonb not null default '[]'::jsonb
                        constraint brainstorm_sessions_transcript_array
                        check (jsonb_typeof(transcript) = 'array'),
  resulting_script_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.brainstorm_sessions is
  'transcript is a JSONB array of {role: "user"|"assistant", text: string, audio_url?: string}. audio_url stays null in Phases 1-4 (audio is never stored).';

create trigger trg_brainstorm_sessions_updated_at
  before update on public.brainstorm_sessions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. call_scripts
-- ----------------------------------------------------------------------------

create table public.call_scripts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  script_text           text not null
                          constraint call_scripts_text_len
                          check (char_length(script_text) between 1 and 20000),
  call_purpose          text
                          constraint call_scripts_purpose_len
                          check (call_purpose is null or char_length(call_purpose) <= 500),
  source                text not null default 'brainstorm'
                          constraint call_scripts_source_enum
                          check (source in ('brainstorm', 'manual_edit', 'duplicated')),
  brainstorm_session_id uuid references public.brainstorm_sessions (id) on delete set null,
  is_favorite           boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger trg_call_scripts_updated_at
  before update on public.call_scripts
  for each row execute function public.set_updated_at();

-- Close the circular reference now that call_scripts exists.
alter table public.brainstorm_sessions
  add constraint brainstorm_sessions_resulting_script_id_fkey
  foreign key (resulting_script_id) references public.call_scripts (id) on delete set null;

-- ----------------------------------------------------------------------------
-- 5. script_edit_events  (append-only)
-- ----------------------------------------------------------------------------

create table public.script_edit_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  script_id     uuid not null references public.call_scripts (id) on delete cascade,
  original_text text not null
                  constraint script_edit_events_original_len
                  check (char_length(original_text) <= 20000),
  edited_text   text not null
                  constraint script_edit_events_edited_len
                  check (char_length(edited_text) <= 20000),
  created_at    timestamptz not null default now()
);

comment on table public.script_edit_events is
  'Append-only style-learning signal. Client may SELECT and INSERT only; anonymous sessions may not write (R8).';

-- ----------------------------------------------------------------------------
-- 6. call_logs  (writes are service-role only: make-call + call-webhook)
-- ----------------------------------------------------------------------------

create table public.call_logs (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles (id) on delete cascade,
  script_id              uuid references public.call_scripts (id) on delete set null,
  bland_call_id          text
                           constraint call_logs_bland_id_len
                           check (bland_call_id is null or char_length(bland_call_id) <= 128),
  is_demo                boolean not null default true,
  phone_number_called    text
                           constraint call_logs_phone_e164
                           check (phone_number_called is null
                                  or phone_number_called ~ '^\+[1-9][0-9]{1,14}$'),
  status                 text not null default 'initiated'
                           constraint call_logs_status_enum
                           check (status in ('initiated', 'ringing', 'completed',
                                             'failed', 'no_answer', 'busy')),
  transcript             text,
  duration_seconds       integer
                           constraint call_logs_duration_nonneg
                           check (duration_seconds is null or duration_seconds >= 0),
  appointment_details    jsonb
                           constraint call_logs_appt_object
                           check (appointment_details is null
                                  or jsonb_typeof(appointment_details) = 'object'),
  confirmation_detected  boolean,   -- NULL = extraction not yet run
  error_reason           text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.call_logs is
  'INSERT by make-call (service role); UPDATE by call-webhook (service role). Demo calls use bland_call_id prefixed "demo_" and must still be E.164 in phone_number_called. is_demo defaults TRUE as the safety posture.';

create trigger trg_call_logs_updated_at
  before update on public.call_logs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. scheduled_calls  (P6 feature; schema frozen now, clients SELECT-only, R10)
-- ----------------------------------------------------------------------------

create table public.scheduled_calls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  script_id     uuid not null references public.call_scripts (id) on delete cascade,
  scheduled_for timestamptz not null,
  phone_number  text not null
                  constraint scheduled_calls_phone_e164
                  check (phone_number ~ '^\+[1-9][0-9]{1,14}$'),
  status        text not null default 'pending'
                  constraint scheduled_calls_status_enum
                  check (status in ('pending', 'placed', 'failed', 'cancelled')),
  call_log_id   uuid references public.call_logs (id) on delete set null,
  attempt_count integer not null default 0
                  constraint scheduled_calls_attempts_range
                  check (attempt_count between 0 and 10),
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.scheduled_calls is
  'P6 feature. Schema frozen now to avoid migration churn; clients have SELECT-only access until P6 ships schedule-call + cron (R10).';

create trigger trg_scheduled_calls_updated_at
  before update on public.scheduled_calls
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. script_feedback
-- ----------------------------------------------------------------------------

create table public.script_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  script_id  uuid not null references public.call_scripts (id) on delete cascade,
  rating     smallint not null
               constraint script_feedback_rating_range check (rating between 1 and 5),
  note       text
               constraint script_feedback_note_len
               check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint script_feedback_user_script_unique unique (user_id, script_id)
);

comment on table public.script_feedback is
  'One row per (user, script): 1 = thumbs down, 5 = thumbs up. Upsert to toggle. Anonymous sessions may not write (R8).';

-- ----------------------------------------------------------------------------
-- 9. anonymous_events  (service-role only; no client access whatsoever)
-- ----------------------------------------------------------------------------

create table public.anonymous_events (
  id         bigint generated always as identity primary key,
  event_type text not null
               constraint anonymous_events_type_len
               check (char_length(event_type) between 1 and 100),
  metadata   jsonb not null default '{}'::jsonb
               constraint anonymous_events_metadata_object
               check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.anonymous_events is
  'Aggregate analytics. No PII: metadata keys are whitelisted in code (counts/types — never transcripts, numbers, names, or IPs). Inserts/reads via service role only.';

-- ----------------------------------------------------------------------------
-- 10. Rate-limit infrastructure (R6) — private schema, RPC-only access
-- ----------------------------------------------------------------------------

create schema if not exists private;

create table private.rate_limits (
  bucket       text not null,        -- canonical RATE_LIMITS.<key>.bucket strings, e.g. 'make_call:ip', 'tts_chars:global'
  key          text not null,        -- ip, user_id, or 'global'
  window_start timestamptz not null, -- date_trunc('hour'|'day'|'month', now())
  count        integer not null default 0,
  primary key (bucket, key, window_start)
);

comment on table private.rate_limits is
  'Fixed-window counters. Schema not exposed via PostgREST; sole access path is public.rate_limit_hit(). Cleaned by pg_cron daily.';

-- Atomic increment-and-read. SECURITY DEFINER (owner: postgres) so no role
-- needs direct access to the private schema. Executable by service_role only.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_key    text,
  p_window text,
  p_amount integer default 1
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_window not in ('hour', 'day', 'month') then
    raise exception 'rate_limit_hit: invalid window %', p_window;
  end if;
  v_window_start := date_trunc(p_window, now());
  insert into private.rate_limits as rl (bucket, key, window_start, count)
  values (p_bucket, p_key, v_window_start, greatest(p_amount, 0))
  on conflict (bucket, key, window_start)
  do update set count = rl.count + greatest(p_amount, 0)
  returning rl.count into v_count;
  return v_count;
end;
$$;

revoke execute on function public.rate_limit_hit(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, text, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- 11. Indexes
-- ----------------------------------------------------------------------------

-- History/dashboard listings + RLS predicate support
create index idx_brainstorm_sessions_user_created on public.brainstorm_sessions (user_id, created_at desc);
create index idx_call_scripts_user_created        on public.call_scripts (user_id, created_at desc);
create index idx_call_scripts_user_favorite       on public.call_scripts (user_id) where is_favorite;
create index idx_script_edit_events_user_created  on public.script_edit_events (user_id, created_at desc);
create index idx_call_logs_user_created           on public.call_logs (user_id, created_at desc);
create index idx_scheduled_calls_user_sched       on public.scheduled_calls (user_id, scheduled_for desc);
create index idx_script_feedback_user             on public.script_feedback (user_id);

-- Webhook lookup: call-webhook resolves a call_id to a row. Demo-mode
-- simulated calls share this namespace with a "demo_" prefix.
create unique index uq_call_logs_bland_call_id on public.call_logs (bland_call_id)
  where bland_call_id is not null;

-- Cron pickup of due calls (P6; spec: every 5 min)
create index idx_scheduled_calls_due on public.scheduled_calls (scheduled_for)
  where status = 'pending';

-- FK-cascade support (ON DELETE SET NULL/CASCADE scans on the referencing side)
create index idx_brainstorm_sessions_result_script on public.brainstorm_sessions (resulting_script_id)
  where resulting_script_id is not null;
create index idx_call_scripts_brainstorm_session   on public.call_scripts (brainstorm_session_id)
  where brainstorm_session_id is not null;
create index idx_script_edit_events_script         on public.script_edit_events (script_id);
create index idx_call_logs_script                  on public.call_logs (script_id)
  where script_id is not null;
create index idx_scheduled_calls_script            on public.scheduled_calls (script_id);
create index idx_scheduled_calls_call_log          on public.scheduled_calls (call_log_id)
  where call_log_id is not null;
create index idx_script_feedback_script            on public.script_feedback (script_id);

-- Analytics
create index idx_anonymous_events_type_created on public.anonymous_events (event_type, created_at desc);

-- Anonymous-user purge support (R15)
create index idx_rate_limits_window on private.rate_limits (window_start);

-- ----------------------------------------------------------------------------
-- 12. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.user_facts          enable row level security;
alter table public.brainstorm_sessions enable row level security;
alter table public.call_scripts        enable row level security;
alter table public.script_edit_events  enable row level security;
alter table public.call_logs           enable row level security;
alter table public.scheduled_calls     enable row level security;
alter table public.script_feedback     enable row level security;
alter table public.anonymous_events    enable row level security;
alter table private.rate_limits        enable row level security;

-- profiles: read/update own row. No INSERT (trigger-only), no DELETE (cascade-only).
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- user_facts: CRUD on own rows; INSERT/UPDATE denied for anonymous sessions (R8).
create policy user_facts_select_own on public.user_facts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_facts_insert_own_non_anon on public.user_facts
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy user_facts_update_own_non_anon on public.user_facts
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy user_facts_delete_own on public.user_facts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- brainstorm_sessions: full CRUD on own rows (anonymous allowed — demo brainstorm is real).
create policy brainstorm_sessions_select_own on public.brainstorm_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy brainstorm_sessions_insert_own on public.brainstorm_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy brainstorm_sessions_update_own on public.brainstorm_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy brainstorm_sessions_delete_own on public.brainstorm_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- call_scripts: full CRUD on own rows (anonymous allowed).
create policy call_scripts_select_own on public.call_scripts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy call_scripts_insert_own on public.call_scripts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy call_scripts_update_own on public.call_scripts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy call_scripts_delete_own on public.call_scripts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- script_edit_events: append-only; INSERT denied for anonymous sessions (R8).
create policy script_edit_events_select_own on public.script_edit_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy script_edit_events_insert_own_non_anon on public.script_edit_events
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );

-- call_logs: client reads own rows only. All writes via service role
-- (make-call inserts, call-webhook updates) — no INSERT/UPDATE/DELETE policies.
create policy call_logs_select_own on public.call_logs
  for select to authenticated using ((select auth.uid()) = user_id);

-- scheduled_calls: SELECT-only for clients until P6 (R10).
create policy scheduled_calls_select_own on public.scheduled_calls
  for select to authenticated using ((select auth.uid()) = user_id);

-- script_feedback: CRUD on own rows; INSERT/UPDATE denied for anonymous (R8).
create policy script_feedback_select_own on public.script_feedback
  for select to authenticated using ((select auth.uid()) = user_id);
create policy script_feedback_insert_own_non_anon on public.script_feedback
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy script_feedback_update_own_non_anon on public.script_feedback
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  )
  with check (
    (select auth.uid()) = user_id
    and not coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false)
  );
create policy script_feedback_delete_own on public.script_feedback
  for delete to authenticated using ((select auth.uid()) = user_id);

-- anonymous_events + private.rate_limits: RLS enabled, ZERO policies. Only the
-- service role (bypasses RLS) / the SECURITY DEFINER RPC can touch them.

-- ----------------------------------------------------------------------------
-- 13. Privileges (defense in depth under RLS)
-- ----------------------------------------------------------------------------

-- No session => no access. The landing page never queries the database.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Reset authenticated to a precise grant set.
revoke all on all tables    in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

-- profiles: phone_verified_at, style_summary, created_at, updated_at are NOT
-- client-writable. phone_verified_at is set only by verify-phone-confirm
-- (service role, P6); style_summary only by the P5 summarizer (service role).
grant select on public.profiles to authenticated;
grant update (display_name, phone_number, time_zone, communication_style)
  on public.profiles to authenticated;

grant select, insert, delete on public.user_facts to authenticated;
grant update (value, source, confidence) on public.user_facts to authenticated;

grant select, insert, delete on public.brainstorm_sessions to authenticated;
grant update (transcript, resulting_script_id) on public.brainstorm_sessions to authenticated;

grant select, insert, delete on public.call_scripts to authenticated;
grant update (script_text, call_purpose, is_favorite) on public.call_scripts to authenticated;

grant select, insert on public.script_edit_events to authenticated;

grant select on public.call_logs to authenticated;

grant select on public.scheduled_calls to authenticated;   -- R10: SELECT-only until P6

grant select, insert, delete on public.script_feedback to authenticated;
grant update (rating, note) on public.script_feedback to authenticated;

-- anonymous_events / private.rate_limits: no grants to anon or authenticated.

-- ----------------------------------------------------------------------------
-- 14. Realtime (optional live call status; RLS still gates subscribers)
-- ----------------------------------------------------------------------------

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.call_logs;
  end if;
end;
$realtime$;

-- ----------------------------------------------------------------------------
-- 15. Scheduled jobs (R15) — guarded so environments without pg_cron still
--     apply this migration cleanly.
-- ----------------------------------------------------------------------------

do $cron_setup$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron unavailable; skipping scheduled job setup';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Anonymous demo users are purged after 24 h; every FK chain cascades, so
    -- their profiles, transcripts, scripts, and call logs vanish with them.
    perform cron.schedule(
      'purge-anonymous-users',
      '0 4 * * *',
      $job$ delete from auth.users where is_anonymous and created_at < now() - interval '24 hours' $job$
    );
    perform cron.schedule(
      'cleanup-rate-limits',
      '30 4 * * *',
      $job$ delete from private.rate_limits where window_start < now() - interval '2 days' $job$
    );
  end if;
end;
$cron_setup$;
