-- ============================================================================
-- Test 06 — scheduled_calls is SELECT-only for clients (R10).
-- Covers: db.md §7 item 6.
--   * As authenticated USER_A: SELECT of own rows succeeds; INSERT/UPDATE/DELETE
--     FAIL (no client write policies/grants ⇒ SQLSTATE 42501).
--   * As service_role: writes succeed (P6 will add client policies additively).
-- ============================================================================

\echo '== Test 06: scheduled_calls SELECT-only (R10) =='

begin;

-- Seed one A-owned scheduled_call as superuser.
insert into public.scheduled_calls (id, user_id, script_id, scheduled_for, phone_number)
  values ('a1a1a1a1-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-00000000000a', now() + interval '2 days', '+15555550100');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';

do $$
begin
  -- SELECT own works.
  perform tests.assert_eq((select count(*)::int from public.scheduled_calls where user_id='11111111-1111-1111-1111-111111111111'), 1, 'authenticated CAN SELECT own scheduled_calls');

  -- INSERT denied (no grant ⇒ 42501).
  perform tests.assert_raises(
    $q$ insert into public.scheduled_calls (user_id, script_id, scheduled_for, phone_number)
        values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a', now() + interval '1 day', '+15555550100') $q$,
    'authenticated INSERT scheduled_calls denied', '42501');

  -- UPDATE denied (no grant ⇒ 42501).
  perform tests.assert_raises(
    $q$ update public.scheduled_calls set status='cancelled'
        where id='a1a1a1a1-0000-0000-0000-00000000000a' $q$,
    'authenticated UPDATE scheduled_calls denied', '42501');

  -- DELETE denied (no grant ⇒ 42501).
  perform tests.assert_raises(
    $q$ delete from public.scheduled_calls where id='a1a1a1a1-0000-0000-0000-00000000000a' $q$,
    'authenticated DELETE scheduled_calls denied', '42501');
end $$;

-- service_role writes succeed.
set local role service_role;
do $$
declare n int;
begin
  update public.scheduled_calls set status='placed' where id='a1a1a1a1-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'service_role CAN UPDATE scheduled_calls');
end $$;

rollback;
\echo 'Test 06 PASSED'
