-- ============================================================================
-- Test 03 — anonymous-session write denial (R8).
-- Covers: db.md §7 item 3; security.md §10 ws/db item 4.
--   With a JWT carrying is_anonymous=true:
--     * INSERT on user_facts / script_edit_events / script_feedback is REJECTED
--       (WITH CHECK anon clause ⇒ SQLSTATE 42501 / new row violates policy).
--     * UPDATE on user_facts / script_feedback changes ZERO rows (USING anon
--       clause makes the owned row invisible to the UPDATE).
--     * SELECT/DELETE of own user_facts & script_feedback, and SELECT of own
--       script_edit_events, still work (anon is not fully locked out).
--     * Full CRUD on own brainstorm_sessions and call_scripts SUCCEEDS.
--   Closing sanity: a PERMANENT user CAN write all three anon-denied tables.
--   USER_AN = 33..3 (anonymous), owns script cccccccc-...
-- ============================================================================

\echo '== Test 03: anonymous write denial (R8) =='

begin;

-- Seed owner-owned rows up-front (as superuser) so UPDATE-denial is meaningful.
insert into public.user_facts (id, user_id, key, value)
  values ('eeeeeeee-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','anon_seed_key','seed');
insert into public.script_feedback (id, user_id, script_id, rating)
  values ('eeeeeeee-0000-0000-0000-00000000000b','33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-00000000000c', 5);
insert into public.script_edit_events (id, user_id, script_id, original_text, edited_text)
  values ('eeeeeeee-0000-0000-0000-00000000000c','33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-00000000000c','o','e');

-- Now become the anonymous user.
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","is_anonymous":true}';

do $$
declare n int;
begin
  -- ---- INSERT denied (WITH CHECK anon clause) ----
  perform tests.assert_raises(
    $q$ insert into public.user_facts (user_id, key, value)
        values ('33333333-3333-3333-3333-333333333333','k2','v2') $q$,
    'anon INSERT user_facts denied', '42501');
  perform tests.assert_raises(
    $q$ insert into public.script_edit_events (user_id, script_id, original_text, edited_text)
        values ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-00000000000c','o2','e2') $q$,
    'anon INSERT script_edit_events denied', '42501');
  -- script_feedback: a fresh (user,script) pair to isolate the policy from the
  -- unique constraint. USER_AN owns A's script for SELECT? No — RLS WITH CHECK
  -- fails on is_anonymous regardless of which script; use the owned script id
  -- but a row already exists, so use ON CONFLICT-free INSERT that the policy
  -- rejects before the unique check.
  perform tests.assert_raises(
    $q$ insert into public.script_feedback (user_id, script_id, rating)
        values ('33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-00000000000a', 1) $q$,
    'anon INSERT script_feedback denied', '42501');

  -- ---- UPDATE denied (USING anon clause ⇒ 0 rows; value unchanged) ----
  update public.user_facts set value='changed' where user_id='33333333-3333-3333-3333-333333333333';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 0, 'anon UPDATE user_facts affects zero rows');

  update public.script_feedback set rating=1 where user_id='33333333-3333-3333-3333-333333333333';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 0, 'anon UPDATE script_feedback affects zero rows');

  -- ---- ALLOWED for anon: SELECT own + DELETE own + SELECT edit_events ----
  perform tests.assert_eq((select count(*)::int from public.user_facts         where user_id='33333333-3333-3333-3333-333333333333'), 1, 'anon CAN SELECT own user_facts');
  perform tests.assert_eq((select count(*)::int from public.script_feedback    where user_id='33333333-3333-3333-3333-333333333333'), 1, 'anon CAN SELECT own script_feedback');
  perform tests.assert_eq((select count(*)::int from public.script_edit_events where user_id='33333333-3333-3333-3333-333333333333'), 1, 'anon CAN SELECT own script_edit_events');

  delete from public.user_facts where user_id='33333333-3333-3333-3333-333333333333';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'anon CAN DELETE own user_facts');

  -- ---- ALLOWED for anon: full CRUD on own brainstorm_sessions & call_scripts ----
  insert into public.brainstorm_sessions (id, user_id, transcript)
    values ('eeeeeeee-0000-0000-0000-0000000000d0','33333333-3333-3333-3333-333333333333','[{"role":"user","text":"hi"}]'::jsonb);
  perform tests.assert_eq((select count(*)::int from public.brainstorm_sessions where id='eeeeeeee-0000-0000-0000-0000000000d0'), 1, 'anon CAN INSERT own brainstorm_session');
  update public.brainstorm_sessions set transcript='[{"role":"assistant","text":"yo"}]'::jsonb where id='eeeeeeee-0000-0000-0000-0000000000d0';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'anon CAN UPDATE own brainstorm_session');

  insert into public.call_scripts (id, user_id, script_text, source)
    values ('eeeeeeee-0000-0000-0000-0000000000d1','33333333-3333-3333-3333-333333333333','anon new script','brainstorm');
  perform tests.assert_eq((select count(*)::int from public.call_scripts where id='eeeeeeee-0000-0000-0000-0000000000d1'), 1, 'anon CAN INSERT own call_script');
  update public.call_scripts set script_text='anon edited' where id='eeeeeeee-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'anon CAN UPDATE own call_script');
  delete from public.call_scripts where id='eeeeeeee-0000-0000-0000-0000000000d1';
  get diagnostics n = row_count;
  perform tests.assert_eq(n, 1, 'anon CAN DELETE own call_script');
end $$;

-- ---- Sanity: a PERMANENT user CAN write all three anon-denied tables ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';
do $$
begin
  insert into public.user_facts (user_id, key, value)
    values ('11111111-1111-1111-1111-111111111111','perm_key','perm_val');
  perform tests.assert_eq((select count(*)::int from public.user_facts where user_id='11111111-1111-1111-1111-111111111111' and key='perm_key'), 1, 'permanent user CAN INSERT user_facts');

  insert into public.script_edit_events (user_id, script_id, original_text, edited_text)
    values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a','o','e');
  insert into public.script_feedback (user_id, script_id, rating)
    values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a', 5);
  perform tests.assert_true(true, 'permanent user CAN INSERT script_edit_events + script_feedback');
end $$;

rollback;
\echo 'Test 03 PASSED'
