-- ============================================================================
-- Test 08 — deleting an anonymous auth.users row cascades to zero orphans.
-- Covers: db.md §7 item 8; security.md §10 ws/db item 5.
--   Build a complete anonymous user with at least one row in EVERY owned table,
--   then delete the auth.users row via the exact R15 purge predicate and assert
--   nothing referencing that user survives anywhere.
-- ============================================================================

\echo '== Test 08: cascade leaves zero orphans =='

begin;

-- A throwaway anonymous user, old enough to match the purge predicate.
insert into auth.users (id, aud, role, is_anonymous, created_at)
  values ('99999999-9999-9999-9999-999999999999','authenticated','authenticated', true, now() - interval '48 hours');

-- Fill every owned table for this user (superuser insert; the FK graph is what
-- we're testing, not RLS).
insert into public.user_facts (user_id, key, value)
  values ('99999999-9999-9999-9999-999999999999','k','v');
insert into public.brainstorm_sessions (id, user_id)
  values ('99999999-0000-0000-0000-0000000000b1','99999999-9999-9999-9999-999999999999');
insert into public.call_scripts (id, user_id, script_text, source, brainstorm_session_id)
  values ('99999999-0000-0000-0000-0000000000c1','99999999-9999-9999-9999-999999999999','s','brainstorm','99999999-0000-0000-0000-0000000000b1');
-- close the brainstorm→script circular ref too
update public.brainstorm_sessions set resulting_script_id='99999999-0000-0000-0000-0000000000c1'
  where id='99999999-0000-0000-0000-0000000000b1';
insert into public.script_edit_events (user_id, script_id, original_text, edited_text)
  values ('99999999-9999-9999-9999-999999999999','99999999-0000-0000-0000-0000000000c1','o','e');
insert into public.call_logs (id, user_id, script_id, is_demo, status)
  values ('99999999-0000-0000-0000-0000000000d1','99999999-9999-9999-9999-999999999999','99999999-0000-0000-0000-0000000000c1', true, 'completed');
insert into public.scheduled_calls (id, user_id, script_id, scheduled_for, phone_number, call_log_id)
  values ('99999999-0000-0000-0000-0000000000e1','99999999-9999-9999-9999-999999999999','99999999-0000-0000-0000-0000000000c1',
          now() + interval '1 day', '+15555550100', '99999999-0000-0000-0000-0000000000d1');
insert into public.script_feedback (user_id, script_id, rating)
  values ('99999999-9999-9999-9999-999999999999','99999999-0000-0000-0000-0000000000c1', 5);

-- Sanity: rows exist across all 8 owned tables (+ profile) before the delete.
do $$
begin
  perform tests.assert_eq((select count(*)::int from public.profiles            where id='99999999-9999-9999-9999-999999999999'), 1, 'pre: profile exists');
  perform tests.assert_eq((select count(*)::int from public.user_facts          where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: user_facts exists');
  perform tests.assert_eq((select count(*)::int from public.brainstorm_sessions where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: brainstorm exists');
  perform tests.assert_eq((select count(*)::int from public.call_scripts        where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: call_scripts exists');
  perform tests.assert_eq((select count(*)::int from public.script_edit_events  where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: script_edit_events exists');
  perform tests.assert_eq((select count(*)::int from public.call_logs           where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: call_logs exists');
  perform tests.assert_eq((select count(*)::int from public.scheduled_calls     where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: scheduled_calls exists');
  perform tests.assert_eq((select count(*)::int from public.script_feedback     where user_id='99999999-9999-9999-9999-999999999999'), 1, 'pre: script_feedback exists');
end $$;

-- Execute the EXACT R15 purge predicate.
delete from auth.users
  where is_anonymous and created_at < now() - interval '24 hours';

-- Post: zero rows referencing the deleted user anywhere.
do $$
declare orphans int;
begin
  select
    (select count(*) from public.profiles            where id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.user_facts          where user_id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.brainstorm_sessions where user_id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.call_scripts        where user_id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.script_edit_events  where user_id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.call_logs           where user_id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.scheduled_calls     where user_id='99999999-9999-9999-9999-999999999999')
  + (select count(*) from public.script_feedback     where user_id='99999999-9999-9999-9999-999999999999')
    into orphans;
  perform tests.assert_eq(orphans, 0, 'zero orphans across all owned tables after anon purge');
  -- The permanent fixture users must be untouched by the anon-only predicate.
  perform tests.assert_true(exists(select 1 from auth.users where id='11111111-1111-1111-1111-111111111111'), 'permanent USER_A survives purge');
end $$;

rollback;
\echo 'Test 08 PASSED'
