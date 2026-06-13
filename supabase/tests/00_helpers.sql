-- ============================================================================
-- Calldone RLS/SQL test helpers + fixtures (ws/db).
--
-- Plain-SQL, pgTAP-free harness: failures are surfaced with `raise exception`,
-- which (under psql -v ON_ERROR_STOP=1) aborts the file with a non-zero exit.
-- This file is sourced FIRST; it creates the `tests` schema, the assertion
-- helpers, and three committed fixture users that every later file reuses.
--
-- Impersonation convention used by every test (set LOCAL ⇒ auto-reset at COMMIT/
-- ROLLBACK, so test files wrap mutating work in their own begin/rollback):
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":..,"role":"authenticated","is_anonymous":..}';
-- service_role (RLS bypass) is `set local role service_role;`.
--
-- Canonical fixtures (created committed below):
--   USER_A  11111111-1111-1111-1111-111111111111  permanent (is_anonymous=false)
--   USER_B  22222222-2222-2222-2222-222222222222  permanent (is_anonymous=false)
--   USER_AN 33333333-3333-3333-3333-333333333333  anonymous (is_anonymous=true)
-- Each gets one call_scripts row (…s for A, …t for B, …u for AN) so cross-user
-- and anon tests have something concrete to target.
-- ============================================================================

create schema if not exists tests;

-- The test runs impersonate `authenticated`, `anon`, and `service_role`; all of
-- them must be able to reach the assertion helpers. Grant broadly — this schema
-- is test-only and never ships to a real database.
grant usage on schema tests to public;

-- ---- assertion helpers ------------------------------------------------------

create or replace function tests.assert_eq(got anyelement, want anyelement, label text)
returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'ASSERT FAILED [%]: got=% want=%', label, got, want;
  end if;
end;
$$;

create or replace function tests.assert_true(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERT FAILED [%]: expected true, got %', label, coalesce(cond::text, 'null');
  end if;
end;
$$;

-- Run an arbitrary SQL string and assert it raises. Optionally require a
-- specific SQLSTATE (e.g. '42501' = insufficient_privilege for a missing grant).
create or replace function tests.assert_raises(sql text, label text, expect_sqlstate text default null)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if expect_sqlstate is not null and sqlstate is distinct from expect_sqlstate then
      raise exception 'ASSERT FAILED [%]: raised SQLSTATE % but expected %', label, sqlstate, expect_sqlstate;
    end if;
    return; -- expected
  end;
  raise exception 'ASSERT FAILED [%]: expected an error but the statement succeeded', label;
end;
$$;

-- Build a request.jwt.claims JSON string for an (uid, is_anonymous) pair.
create or replace function tests.claims_for(uid uuid, anon boolean)
returns text language sql immutable as $$
  select json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text;
$$;

-- Ensure every impersonated role can execute the helpers (functions default to
-- PUBLIC execute, but make it explicit so the harness is robust).
grant execute on all functions in schema tests to public;

-- ---- committed fixtures -----------------------------------------------------

-- USER_A / USER_B permanent, USER_AN anonymous. The on_auth_user_created
-- trigger creates each public.profiles row. ON CONFLICT keeps this idempotent.
insert into auth.users (id, aud, role, email, is_anonymous, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated','a@calldone.test', false, '{"display_name":"User A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated','b@calldone.test', false, '{"display_name":"User B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated', null,             true,  '{}'::jsonb)
on conflict (id) do nothing;

-- One owned script per user (service-role-ish superuser insert bypasses RLS).
insert into public.call_scripts (id, user_id, script_text, source) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','User A owned script', 'manual_edit'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','User B owned script', 'manual_edit'),
  ('cccccccc-0000-0000-0000-00000000000c','33333333-3333-3333-3333-333333333333','Anon owned script',   'brainstorm')
on conflict (id) do nothing;

\echo '00_helpers: schema, assert helpers, and fixtures ready.'
