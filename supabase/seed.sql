-- ============================================================================
-- Calldone — local-dev seed (idempotent). Loaded by `supabase db reset` after
-- the migration. Owned by ws/db.
--
-- Produces a minimal but realistic local dataset:
--   * one NON-ANONYMOUS test user (auth.users + the trigger-created profile)
--   * one sample call_scripts row owned by that user
--   * one sample call_logs row (demo call: is_demo = true, demo_ bland_call_id,
--     E.164 phone_number_called like +15555550100)
--
-- All fixed UUIDs + ON CONFLICT DO NOTHING so re-running is a no-op. Runs as the
-- migration owner (postgres / service role), which bypasses RLS — exactly how
-- the edge functions' service-role client writes call_logs.
-- ============================================================================

-- 1. Non-anonymous test user. is_anonymous = false keeps it out of the R15
--    24h purge predicate. The on_auth_user_created trigger auto-inserts the
--    matching public.profiles row (display_name pulled from raw_user_meta_data).
insert into auth.users (id, aud, role, email, is_anonymous, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-0000000000a1',
  'authenticated',
  'authenticated',
  'demo.user@calldone.test',
  false,
  '{"display_name": "Demo User"}'::jsonb
)
on conflict (id) do nothing;

-- The trigger created the profile with display_name only. Backfill the rest of
-- the onboarding fields (idempotent: only touch the seeded row, leave a
-- developer's manual edits alone by guarding on the unseeded defaults is
-- unnecessary — this row is exclusively ours).
update public.profiles
set display_name        = coalesce(display_name, 'Demo User'),
    phone_number        = '+15555550100',
    time_zone           = 'America/New_York',
    communication_style = '{"tone": "warm", "pace": "measured"}'::jsonb
where id = '00000000-0000-0000-0000-0000000000a1';

-- 2. Sample call script owned by the test user.
insert into public.call_scripts (id, user_id, script_text, call_purpose, source, is_favorite)
values (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  'Hi, this is an AI assistant calling on behalf of Demo User. This call may be recorded. I''d like to confirm a prescription pickup at the pharmacy. Could you let me know if order #4821 is ready?',
  'Confirm pharmacy prescription pickup',
  'brainstorm',
  true
)
on conflict (id) do nothing;

-- 3. Sample demo call log (service-role write path). is_demo = true, the
--    bland_call_id carries the demo_ prefix, and phone_number_called is E.164.
insert into public.call_logs (
  id, user_id, script_id, bland_call_id, is_demo, phone_number_called,
  status, transcript, duration_seconds, appointment_details, confirmation_detected
)
values (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'demo_00000000-0000-0000-0000-0000000000c1',
  true,
  '+15555550100',
  'completed',
  'assistant: Hi, this is an AI assistant calling on behalf of Demo User. This call may be recorded.\nuser: Sure, order #4821 is ready for pickup until 8pm today.',
  42,
  '{"title": "Pharmacy pickup", "start_iso": "2026-06-12T17:00:00-04:00", "end_iso": null, "location": "Walgreens", "notes": "Order #4821 ready until 8pm", "confidence": 0.92}'::jsonb,
  true
)
on conflict (id) do nothing;
