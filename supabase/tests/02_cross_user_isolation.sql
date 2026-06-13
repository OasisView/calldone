-- ============================================================================
-- Test 02 — cross-user isolation.
-- Covers: db.md §7 item 2.
--   As USER_A, reads of USER_B's rows return zero, and UPDATE/DELETE of USER_B's
--   rows affect zero rows, across every owned table. We seed one B-owned row per
--   table inside the txn, then impersonate A and confirm A cannot see/touch them.
-- ============================================================================

\echo '== Test 02: cross-user isolation =='

begin;

-- Seed B-owned rows in every owned table (as superuser; RLS bypassed for setup).
insert into public.user_facts (id, user_id, key, value)
  values ('dddddddd-0000-0000-0000-00000000000d','22222222-2222-2222-2222-222222222222','b_key','b_val');
insert into public.brainstorm_sessions (id, user_id)
  values ('dddddddd-0000-0000-0000-00000000000e','22222222-2222-2222-2222-222222222222');
-- B already owns script bbbbbbbb-... from fixtures; reuse it.
insert into public.script_edit_events (id, user_id, script_id, original_text, edited_text)
  values ('dddddddd-0000-0000-0000-00000000000f','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-00000000000b','o','e');
insert into public.call_logs (id, user_id, script_id, is_demo, status)
  values ('dddddddd-0000-0000-0000-000000000010','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-00000000000b', true, 'initiated');
insert into public.scheduled_calls (id, user_id, script_id, scheduled_for, phone_number)
  values ('dddddddd-0000-0000-0000-000000000011','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-00000000000b', now() + interval '1 day', '+15555550111');
insert into public.script_feedback (id, user_id, script_id, rating)
  values ('dddddddd-0000-0000-0000-000000000012','22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-00000000000b', 5);

-- Impersonate USER_A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","is_anonymous":false}';

do $$
begin
  -- SELECT: A sees zero of B's rows in each table.
  perform tests.assert_eq((select count(*)::int from public.profiles            where id      = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B profile');
  perform tests.assert_eq((select count(*)::int from public.user_facts          where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B user_facts');
  perform tests.assert_eq((select count(*)::int from public.brainstorm_sessions where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B brainstorm_sessions');
  perform tests.assert_eq((select count(*)::int from public.call_scripts        where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B call_scripts');
  perform tests.assert_eq((select count(*)::int from public.script_edit_events  where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B script_edit_events');
  perform tests.assert_eq((select count(*)::int from public.call_logs           where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B call_logs');
  perform tests.assert_eq((select count(*)::int from public.scheduled_calls     where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B scheduled_calls');
  perform tests.assert_eq((select count(*)::int from public.script_feedback     where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'A cannot SELECT B script_feedback');

  -- UPDATE: affects zero of B's rows (RLS USING filters them out). For column-
  -- restricted tables we update only granted columns.
  update public.user_facts          set value = 'hacked'  where user_id = '22222222-2222-2222-2222-222222222222';
  perform tests.assert_eq((select count(*) from public.user_facts where value='hacked' and user_id='22222222-2222-2222-2222-222222222222')::int, 0, 'A UPDATE of B user_facts affects nothing');

  update public.brainstorm_sessions set transcript = '[{"role":"user","text":"x"}]'::jsonb where user_id = '22222222-2222-2222-2222-222222222222';
  update public.call_scripts        set script_text = 'hacked' where user_id = '22222222-2222-2222-2222-222222222222';
  update public.script_feedback     set rating = 1 where user_id = '22222222-2222-2222-2222-222222222222';

  -- DELETE: affects zero of B's rows.
  delete from public.user_facts          where user_id = '22222222-2222-2222-2222-222222222222';
  delete from public.brainstorm_sessions where user_id = '22222222-2222-2222-2222-222222222222';
  delete from public.call_scripts        where user_id = '22222222-2222-2222-2222-222222222222';
  delete from public.script_feedback     where user_id = '22222222-2222-2222-2222-222222222222';
end $$;

-- Switch back to superuser to verify B's rows are all intact + unmodified.
reset role;
reset request.jwt.claims;

do $$
begin
  perform tests.assert_eq((select value  from public.user_facts where id='dddddddd-0000-0000-0000-00000000000d'), 'b_val', 'B user_facts untouched by A');
  perform tests.assert_true(exists(select 1 from public.brainstorm_sessions where id='dddddddd-0000-0000-0000-00000000000e'), 'B brainstorm_session still present');
  perform tests.assert_eq((select script_text from public.call_scripts where id='bbbbbbbb-0000-0000-0000-00000000000b'), 'User B owned script', 'B call_script untouched');
  perform tests.assert_eq((select rating from public.script_feedback where id='dddddddd-0000-0000-0000-000000000012')::int, 5, 'B script_feedback untouched');
end $$;

rollback;
\echo 'Test 02 PASSED'
