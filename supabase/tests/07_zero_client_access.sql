-- ============================================================================
-- Test 07 — anonymous_events + private.rate_limits have zero client access.
-- Covers: db.md §7 item 7; security.md §10 ws/db items 1 & 2.
--   * As authenticated: SELECT and INSERT on anonymous_events FAIL (RLS on, zero
--     policies, no grant ⇒ 42501).
--   * As authenticated: any access to private.rate_limits FAILS (42501).
--   * As service_role: both are reachable (RLS bypass) — and private.rate_limits
--     is reachable through public.rate_limit_hit (covered fully in test 09).
-- ============================================================================

\echo '== Test 07: anonymous_events + rate_limits zero client access =='

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';

do $$
begin
  -- anonymous_events: no SELECT grant ⇒ 42501.
  perform tests.assert_raises(
    $q$ select count(*) from public.anonymous_events $q$,
    'authenticated SELECT anonymous_events denied', '42501');
  -- anonymous_events: no INSERT grant ⇒ 42501.
  perform tests.assert_raises(
    $q$ insert into public.anonymous_events (event_type) values ('demo_started') $q$,
    'authenticated INSERT anonymous_events denied', '42501');

  -- private.rate_limits: no USAGE on schema / no grant ⇒ 42501.
  perform tests.assert_raises(
    $q$ select count(*) from private.rate_limits $q$,
    'authenticated SELECT private.rate_limits denied', '42501');
  perform tests.assert_raises(
    $q$ insert into private.rate_limits (bucket, key, window_start, count)
        values ('x','y', now(), 1) $q$,
    'authenticated INSERT private.rate_limits denied', '42501');
end $$;

-- service_role can reach anonymous_events (writes done by edge functions).
set local role service_role;
do $$
begin
  insert into public.anonymous_events (event_type, metadata)
    values ('demo_started', '{"count":1}'::jsonb);
  perform tests.assert_eq((select count(*)::int from public.anonymous_events where event_type='demo_started'), 1, 'service_role CAN INSERT anonymous_events');
end $$;

rollback;
\echo 'Test 07 PASSED'
