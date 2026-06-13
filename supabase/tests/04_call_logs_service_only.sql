-- ============================================================================
-- Test 04 — call_logs is read-only for clients; writes are service-role only.
-- Covers: db.md §7 item 4; security.md §10 ws/db item 2 (call_logs no client write).
--   * As authenticated USER_A: INSERT/UPDATE/DELETE on call_logs FAIL (no grant
--     ⇒ SQLSTATE 42501); SELECT of own rows succeeds.
--   * As service_role: INSERT then UPDATE succeed (RLS bypass + full grants the
--     edge functions rely on).
-- ============================================================================

\echo '== Test 04: call_logs service-role-only writes =='

begin;

-- A owns one call_log (seeded as superuser) so SELECT-own can return a row.
insert into public.call_logs (id, user_id, script_id, is_demo, status)
  values ('ffffffff-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a', true, 'initiated');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';

do $$
declare n int;
begin
  -- SELECT own works.
  perform tests.assert_eq((select count(*)::int from public.call_logs where user_id='11111111-1111-1111-1111-111111111111'), 1, 'authenticated CAN SELECT own call_logs');

  -- INSERT denied — no INSERT grant for authenticated ⇒ 42501.
  perform tests.assert_raises(
    $q$ insert into public.call_logs (user_id, is_demo, status)
        values ('11111111-1111-1111-1111-111111111111', true, 'initiated') $q$,
    'authenticated INSERT call_logs denied', '42501');

  -- UPDATE denied — no UPDATE grant ⇒ 42501.
  perform tests.assert_raises(
    $q$ update public.call_logs set status='completed'
        where id='ffffffff-0000-0000-0000-00000000000a' $q$,
    'authenticated UPDATE call_logs denied', '42501');

  -- DELETE denied — no DELETE grant ⇒ 42501.
  perform tests.assert_raises(
    $q$ delete from public.call_logs where id='ffffffff-0000-0000-0000-00000000000a' $q$,
    'authenticated DELETE call_logs denied', '42501');
end $$;

-- service_role: writes succeed (this is the make-call / call-webhook path).
set local role service_role;
do $$
declare n int;
begin
  insert into public.call_logs (id, user_id, script_id, is_demo, bland_call_id, phone_number_called, status)
    values ('ffffffff-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a',
            true, 'demo_svc', '+15555550100', 'initiated');
  perform tests.assert_eq((select count(*)::int from public.call_logs where id='ffffffff-0000-0000-0000-00000000000b'), 1, 'service_role CAN INSERT call_logs');

  update public.call_logs set status='completed', transcript='done' where id='ffffffff-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'service_role CAN UPDATE call_logs');
  perform tests.assert_eq((select status from public.call_logs where id='ffffffff-0000-0000-0000-00000000000b'), 'completed', 'service_role UPDATE persisted');
end $$;

rollback;
\echo 'Test 04 PASSED'
