-- ============================================================================
-- Test 01 — structural invariants.
-- Covers: db.md §7 item 1; security.md §10 ws/db items 1 & 2.
--   * RLS enabled on all 10 tables (9 public product tables + private.rate_limits)
--   * rate_limit_hit execute: granted service_role, revoked public/anon/authenticated
--   * private schema NOT in PostgREST exposed schemas (config.toml check is out of
--     band; here we assert the schema exists and the table has zero grants)
--   * Policy matrix sanity: anonymous_events has zero policies; call_logs has only
--     a SELECT policy (no client INSERT/UPDATE/DELETE); scheduled_calls SELECT-only
-- ============================================================================

\echo '== Test 01: RLS + structure =='

do $$
declare
  missing text;
begin
  -- 1a. RLS enabled on the 9 public product tables.
  select string_agg(c.relname, ', ')
    into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('profiles','user_facts','brainstorm_sessions','call_scripts',
                      'script_edit_events','call_logs','scheduled_calls',
                      'script_feedback','anonymous_events')
    and not c.relrowsecurity;
  perform tests.assert_true(missing is null, 'RLS must be on for all 9 public product tables; missing: ' || coalesce(missing,'<none>'));

  -- 1b. Exactly 9 such product tables exist (no typo / missing table).
  perform tests.assert_eq(
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind='r'
         and c.relname in ('profiles','user_facts','brainstorm_sessions','call_scripts',
                           'script_edit_events','call_logs','scheduled_calls',
                           'script_feedback','anonymous_events')),
    9, '9 product tables present');

  -- 1c. RLS enabled on private.rate_limits (the 10th table).
  perform tests.assert_true(
    (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='private' and c.relname='rate_limits'),
    'RLS enabled on private.rate_limits');
end $$;

-- 2. rate_limit_hit execute privileges.
do $$
begin
  perform tests.assert_eq(has_function_privilege('service_role',  'public.rate_limit_hit(text,text,text,integer)', 'execute'), true,  'rate_limit_hit execute granted to service_role');
  perform tests.assert_eq(has_function_privilege('authenticated', 'public.rate_limit_hit(text,text,text,integer)', 'execute'), false, 'rate_limit_hit execute revoked from authenticated');
  perform tests.assert_eq(has_function_privilege('anon',          'public.rate_limit_hit(text,text,text,integer)', 'execute'), false, 'rate_limit_hit execute revoked from anon');
  -- PUBLIC pseudo-role: has_function_privilege('public', ...) is the canonical
  -- check (an empty-grantee '=X/owner' ACL entry would make this true).
  perform tests.assert_eq(has_function_privilege('public', 'public.rate_limit_hit(text,text,text,integer)', 'execute'), false, 'rate_limit_hit execute not granted to PUBLIC');
end $$;

-- 3. private schema exists; the private.rate_limits table has NO grants to
--    anon/authenticated (only service_role bypasses RLS / the RPC reaches it).
do $$
begin
  perform tests.assert_true(exists (select 1 from pg_namespace where nspname='private'), 'private schema exists');
  perform tests.assert_eq(has_table_privilege('authenticated', 'private.rate_limits', 'SELECT'), false, 'authenticated cannot SELECT private.rate_limits');
  perform tests.assert_eq(has_table_privilege('authenticated', 'private.rate_limits', 'INSERT'), false, 'authenticated cannot INSERT private.rate_limits');
  perform tests.assert_eq(has_table_privilege('anon',          'private.rate_limits', 'SELECT'), false, 'anon cannot SELECT private.rate_limits');
end $$;

-- 4. Policy-matrix sanity (asserted via pg_policies; full per-op behavior is
--    exercised in tests 02-07).
do $$
begin
  -- anonymous_events: zero policies.
  perform tests.assert_eq(
    (select count(*)::int from pg_policies where schemaname='public' and tablename='anonymous_events'),
    0, 'anonymous_events has zero policies');
  -- private.rate_limits: zero policies.
  perform tests.assert_eq(
    (select count(*)::int from pg_policies where schemaname='private' and tablename='rate_limits'),
    0, 'private.rate_limits has zero policies');
  -- call_logs: exactly one policy, and it is SELECT only.
  perform tests.assert_eq(
    (select count(*)::int from pg_policies where schemaname='public' and tablename='call_logs'),
    1, 'call_logs has exactly one policy');
  perform tests.assert_eq(
    (select cmd from pg_policies where schemaname='public' and tablename='call_logs'),
    'SELECT', 'call_logs policy is SELECT-only');
  -- scheduled_calls: exactly one policy, SELECT only (R10).
  perform tests.assert_eq(
    (select count(*)::int from pg_policies where schemaname='public' and tablename='scheduled_calls'),
    1, 'scheduled_calls has exactly one policy');
  perform tests.assert_eq(
    (select cmd from pg_policies where schemaname='public' and tablename='scheduled_calls'),
    'SELECT', 'scheduled_calls policy is SELECT-only');
end $$;

-- 5. profiles UPDATE column grant is EXACTLY (display_name, phone_number,
--    time_zone, communication_style) for authenticated — no more, no less (R9).
do $$
declare
  granted text;
begin
  select string_agg(column_name, ',' order by column_name)
    into granted
  from information_schema.column_privileges
  where table_schema='public' and table_name='profiles'
    and grantee='authenticated' and privilege_type='UPDATE';
  perform tests.assert_eq(granted, 'communication_style,display_name,phone_number,time_zone',
    'profiles UPDATE column grant is exactly the 4 allowed columns');
  -- explicitly: phone_verified_at, style_summary, created_at, updated_at NOT granted
  perform tests.assert_eq(has_column_privilege('authenticated','public.profiles','phone_verified_at','UPDATE'), false, 'phone_verified_at not UPDATE-grantable');
  perform tests.assert_eq(has_column_privilege('authenticated','public.profiles','style_summary','UPDATE'),     false, 'style_summary not UPDATE-grantable');
end $$;

\echo 'Test 01 PASSED'
