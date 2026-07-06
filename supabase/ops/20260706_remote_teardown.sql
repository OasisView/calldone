-- ============================================================================
-- ONE-TIME REMOTE TEARDOWN — Checkpoint 3 / R24 (run by Manny, once)
-- ============================================================================
-- Removes the RETIRED consumer-outbound schema from the live "calldone"
-- project (nrlbqdskrzrqenigbkuh) so the new inbound initial schema can apply.
-- SAFE because every table was verified to hold 0 rows (2026-07-06); this
-- drops empty structures only. Run in: Supabase Dashboard → SQL Editor →
-- paste → Run. Afterward, tell Claude "teardown done" — the new migration
-- (supabase/migrations/20260706000000_inbound_initial_schema.sql) is then
-- applied via the management API and verified.
--
-- (Why user-run: the assistant's tooling correctly refuses destructive SQL
-- against the live project; this script keeps a human hand on that switch.)

begin;

-- 1. Unschedule the old calldone cron jobs (this project has no others).
do $$
declare j record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for j in select jobid from cron.job loop
      perform cron.unschedule(j.jobid);
    end loop;
  end if;
end;
$$;

-- 2. Old auth trigger, product tables, functions.
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.script_feedback,
  public.scheduled_calls,
  public.anonymous_events,
  public.script_edit_events,
  public.user_facts,
  public.call_logs,
  public.call_scripts,
  public.brainstorm_sessions,
  public.profiles
cascade;

drop function if exists public.rate_limit_hit(text, text, text, integer);
drop function if exists public.handle_new_user() cascade;
drop function if exists public.reset_phone_verification() cascade;

-- 3. Old private schema (rate_limits + helpers), wholesale.
drop schema if exists private cascade;

-- 4. Clear the retired migration from history so remote matches the repo.
delete from supabase_migrations.schema_migrations where version = '20260613040714';

commit;

-- Expected result: "Success. No rows returned." Then: public schema has no
-- product tables until the inbound migration is applied.
