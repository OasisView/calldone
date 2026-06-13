-- ============================================================================
-- Test 05 — profiles update grant + phone verification trigger (R9).
-- Covers: db.md §7 item 5; security.md §10 ws/db item 3.
--   * As authenticated, UPDATE of phone_verified_at FAILS (column not granted
--     ⇒ SQLSTATE 42501).
--   * As authenticated, UPDATE of an allowed column (display_name) SUCCEEDS.
--   * Changing phone_number NULLs any prior phone_verified_at via the
--     reset_phone_verification trigger (set the prior value as service role,
--     since clients cannot write it).
--   * A service-role update that sets phone_verified_at WITHOUT touching
--     phone_number is preserved (the trigger only fires on a phone change).
-- ============================================================================

\echo '== Test 05: profiles phone grant + trigger (R9) =='

begin;

-- Service role pre-sets a verified phone for USER_A (only service role can).
set local role service_role;
update public.profiles
  set phone_number = '+15555550100', phone_verified_at = now()
  where id = '11111111-1111-1111-1111-111111111111';
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';

do $$
declare n int;
begin
  -- Precondition: phone is verified going in.
  perform tests.assert_true(
    (select phone_verified_at is not null from public.profiles where id='11111111-1111-1111-1111-111111111111'),
    'precondition: phone_verified_at set by service role');

  -- 1. UPDATE of phone_verified_at as authenticated FAILS (column not granted).
  perform tests.assert_raises(
    $q$ update public.profiles set phone_verified_at = now()
        where id='11111111-1111-1111-1111-111111111111' $q$,
    'authenticated UPDATE phone_verified_at denied', '42501');

  -- 2. UPDATE of an allowed column succeeds.
  update public.profiles set display_name='Renamed A' where id='11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'authenticated CAN UPDATE display_name');

  -- 3. Changing phone_number nulls phone_verified_at via the trigger.
  update public.profiles set phone_number='+15555550999' where id='11111111-1111-1111-1111-111111111111';
  perform tests.assert_true(
    (select phone_verified_at is null from public.profiles where id='11111111-1111-1111-1111-111111111111'),
    'changing phone_number nulls phone_verified_at (trigger)');
  perform tests.assert_eq(
    (select phone_number from public.profiles where id='11111111-1111-1111-1111-111111111111'),
    '+15555550999', 'phone_number actually changed');
end $$;

-- 4. Trigger does NOT fire when phone_number is unchanged: service role can set
--    phone_verified_at and it sticks.
set local role service_role;
do $$
begin
  update public.profiles set phone_verified_at = now()
    where id='11111111-1111-1111-1111-111111111111';
  perform tests.assert_true(
    (select phone_verified_at is not null from public.profiles where id='11111111-1111-1111-1111-111111111111'),
    'service role can set phone_verified_at without phone change (trigger no-op)');
end $$;

rollback;
\echo 'Test 05 PASSED'
