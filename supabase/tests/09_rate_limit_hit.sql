-- ============================================================================
-- Test 09 — public.rate_limit_hit() behavior + access.
-- Covers: db.md §7 item 9; security.md §10 ws/db item 1.
--   * Repeated calls in the same fixed window return a monotonically increasing
--     count (atomic upsert on (bucket,key,window_start)).
--   * date_trunc fixed window: two hits in the same hour share a window_start.
--   * greatest(p_amount,0): a negative amount adds zero.
--   * An invalid p_window raises.
--   * execute is denied to authenticated and anon, allowed to service_role.
-- ============================================================================

\echo '== Test 09: rate_limit_hit =='

begin;

-- service_role is the only caller (per the grant).
set local role service_role;

do $$
declare c1 int; c2 int; c3 int; c4 int;
begin
  -- Monotonic increment within one window.
  c1 := public.rate_limit_hit('make_call:ip', '203.0.113.9', 'hour');         -- +1 => 1
  c2 := public.rate_limit_hit('make_call:ip', '203.0.113.9', 'hour');         -- +1 => 2
  c3 := public.rate_limit_hit('make_call:ip', '203.0.113.9', 'hour', 3);      -- +3 => 5
  perform tests.assert_eq(c1, 1, 'first hit returns 1');
  perform tests.assert_eq(c2, 2, 'second hit returns 2');
  perform tests.assert_eq(c3, 5, 'amount=3 brings running count to 5');

  -- greatest(p_amount,0): negative amount adds nothing.
  c4 := public.rate_limit_hit('make_call:ip', '203.0.113.9', 'hour', -100);   -- +0 => 5
  perform tests.assert_eq(c4, 5, 'negative amount adds zero (greatest clamp)');

  -- Distinct key ⇒ distinct counter starting fresh.
  perform tests.assert_eq(public.rate_limit_hit('make_call:ip', '203.0.113.10', 'hour'), 1, 'distinct key has its own counter');

  -- Distinct bucket ⇒ distinct counter.
  perform tests.assert_eq(public.rate_limit_hit('tts_chars:global', 'global', 'month', 250), 250, 'distinct bucket has its own counter');
end $$;

-- service_role itself canNOT read private.rate_limits directly: the RPC is the
-- SOLE access path (the function is SECURITY DEFINER, owned by postgres). This
-- confirms the "no role needs direct access to the private schema" contract.
do $$
begin
  perform tests.assert_raises(
    $q$ select count(*) from private.rate_limits $q$,
    'service_role cannot read private.rate_limits directly (RPC is sole path)', '42501');
end $$;

-- Introspect the stored rows as the table owner (postgres) to prove the upsert
-- is atomic (one row per (bucket,key,window_start), not append-per-hit) and the
-- window is hour-truncated. The hour-window hits above all share one window_start.
reset role;
do $$
begin
  perform tests.assert_eq(
    (select count(*)::int from private.rate_limits where bucket='make_call:ip' and key='203.0.113.9'),
    1, 'single counter row per (bucket,key,window_start)');
  perform tests.assert_eq(
    (select count from private.rate_limits where bucket='make_call:ip' and key='203.0.113.9')::int,
    5, 'stored count matches last returned value');
  perform tests.assert_eq(
    (select window_start from private.rate_limits where bucket='make_call:ip' and key='203.0.113.9'),
    date_trunc('hour', now()),
    'window_start is date_trunc(hour, now())');
end $$;

-- Invalid window raises.
do $$
begin
  perform tests.assert_raises(
    $q$ select public.rate_limit_hit('make_call:ip', 'k', 'fortnight') $q$,
    'invalid p_window raises');
  perform tests.assert_raises(
    $q$ select public.rate_limit_hit('make_call:ip', 'k', 'minute') $q$,
    'invalid p_window (minute) raises');
end $$;

rollback;

-- ---- execute privilege: denied to authenticated/anon, allowed service_role ----
-- (Privilege failures abort the current txn, so each runs in its own block.)

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';
do $$
begin
  perform tests.assert_raises(
    $q$ select public.rate_limit_hit('make_call:ip', 'k', 'hour') $q$,
    'authenticated cannot execute rate_limit_hit', '42501');
end $$;
rollback;

begin;
set local role anon;
do $$
begin
  perform tests.assert_raises(
    $q$ select public.rate_limit_hit('make_call:ip', 'k', 'hour') $q$,
    'anon cannot execute rate_limit_hit', '42501');
end $$;
rollback;

begin;
set local role service_role;
do $$
begin
  perform tests.assert_eq(public.rate_limit_hit('make_call:ip', 'svc-allowed', 'hour'), 1, 'service_role CAN execute rate_limit_hit');
end $$;
rollback;

\echo 'Test 09 PASSED'
