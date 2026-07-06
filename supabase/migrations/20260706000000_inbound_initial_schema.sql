-- ============================================================================
-- CALLDONE BY OASIS — INBOUND INITIAL SCHEMA (Checkpoint 3, R23/R24)
-- ============================================================================
-- Inbound AI reception & intake for small nonprofits. Full rewrite of the
-- retired consumer-outbound schema (R24: pre-launch, all tables were empty;
-- the old migration file is deleted, this one replaces it via db reset).
--
-- Canonical companion artifacts:
--   docs/contracts/db.md                        (prose contract for this file)
--   supabase/functions/_shared/api-types.ts     (enums/caps mirrored in CHECKs)
--   docs/contracts/decision-register.md         (R23–R28)
--
-- Security model (R23/R28):
--   * NO anonymous access of any kind. All product grants go to
--     `authenticated` + `service_role`; `anon` is revoked everywhere.
--   * Every product table is org-scoped with RLS; membership via org_members.
--   * Call/event/intake writes are service-role only (edge functions).
--   * private schema is not exposed over the API.
-- ============================================================================

-- SQL-language function bodies below reference tables created later in this
-- file; skip creation-time body validation (they are validated at first call).
set check_function_bodies = off;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- authenticated needs schema USAGE to evaluate the SECURITY DEFINER policy
-- helpers (is_org_member/is_org_admin). USAGE alone exposes nothing: private
-- tables have no grants to authenticated, and PostgREST never exposes the
-- private schema regardless.
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, locked search_path)
-- ---------------------------------------------------------------------------

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.is_org_admin(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.is_org_admin(uuid) to authenticated, service_role;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (member identity; auto-created by trigger)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 120),
  created_at   timestamptz not null default now()
);
comment on table public.profiles is
  'One row per auth.users row, auto-created by on_auth_user_created. Member identity for org staff. No anonymous users exist in this product (R23).';

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- orgs — one row per nonprofit (multi-tenant root)
-- ---------------------------------------------------------------------------

create table public.orgs (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 200),
  slug                text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  timezone            text not null default 'America/New_York' check (char_length(timezone) <= 64),
  -- R26: how the AI answers this org's line.
  answering_mode      text not null default 'always'
                        check (answering_mode in ('always', 'after_hours', 'overflow')),
  business_hours      jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(business_hours) = 'object'),
  -- R26 escalation target; must be set before go-live (app-enforced).
  escalation_phone    text check (escalation_phone is null or escalation_phone ~ '^\+[1-9]\d{1,14}$'),
  notification_email  text check (notification_email is null or char_length(notification_email) <= 320),
  -- R23 data rules: per-org retention of call content, default 90 days.
  retention_days      integer not null default 90 check (retention_days between 1 and 3650),
  -- R28: per-org kill switch (global CALLS_ENABLED env is the master switch).
  calls_enabled       boolean not null default true,
  -- R28: monthly minutes ceiling; service-role managed (not org-editable).
  monthly_minutes_cap integer not null default 300 check (monthly_minutes_cap between 0 and 100000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.orgs enable row level security;

create trigger orgs_touch before update on public.orgs
  for each row execute function private.touch_updated_at();

create policy orgs_select_member on public.orgs
  for select to authenticated using (private.is_org_member(id));
-- Onboarding: any authenticated user may create an org; a trigger makes them admin.
create policy orgs_insert_authenticated on public.orgs
  for insert to authenticated with check (true);
create policy orgs_update_admin on public.orgs
  for update to authenticated
  using (private.is_org_admin(id))
  with check (private.is_org_admin(id));
-- No client DELETE policy: org deletion is a service-role operation.

create or replace function private.handle_new_org()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Service-role inserts (auth.uid() is null) manage membership explicitly.
  if (select auth.uid()) is not null then
    insert into public.org_members (org_id, user_id, role)
    values (new.id, (select auth.uid()), 'admin');
  end if;
  return new;
end;
$$;

create trigger on_org_created
  after insert on public.orgs
  for each row execute function private.handle_new_org();

-- ---------------------------------------------------------------------------
-- org_members — membership + role (admin | staff)
-- ---------------------------------------------------------------------------

create table public.org_members (
  org_id     uuid not null references public.orgs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.org_members enable row level security;

create policy org_members_select_same_org on public.org_members
  for select to authenticated using (private.is_org_member(org_id));
create policy org_members_insert_admin on public.org_members
  for insert to authenticated with check (private.is_org_admin(org_id));
create policy org_members_update_admin on public.org_members
  for update to authenticated
  using (private.is_org_admin(org_id))
  with check (private.is_org_admin(org_id));
create policy org_members_delete_admin_or_self on public.org_members
  for delete to authenticated
  using (private.is_org_admin(org_id) or user_id = (select auth.uid()));

-- Guard: an org can never lose its last admin (UPDATE demotion or DELETE).
create or replace function private.guard_last_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' and old.role = 'admin')
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    if not exists (
      select 1 from public.org_members m
      where m.org_id = old.org_id and m.role = 'admin'
        and m.user_id <> old.user_id
    ) then
      raise exception 'cannot remove the last admin of org %', old.org_id
        using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger org_members_guard_last_admin
  before update or delete on public.org_members
  for each row execute function private.guard_last_admin();

-- ---------------------------------------------------------------------------
-- phone_numbers — provider-provisioned numbers per org (service-role managed)
-- ---------------------------------------------------------------------------

create table public.phone_numbers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  e164               text not null unique check (e164 ~ '^\+[1-9]\d{1,14}$'),
  provider           text not null check (provider in ('vapi', 'retell', 'twilio')),
  provider_number_id text check (provider_number_id is null or char_length(provider_number_id) <= 200),
  status             text not null default 'provisioning'
                       check (status in ('provisioning', 'active', 'released')),
  created_at         timestamptz not null default now()
);

create unique index phone_numbers_provider_ref
  on public.phone_numbers (provider, provider_number_id)
  where provider_number_id is not null;

alter table public.phone_numbers enable row level security;

create policy phone_numbers_select_member on public.phone_numbers
  for select to authenticated using (private.is_org_member(org_id));
-- Writes: service_role only (provisioning is money-gated and orchestrated).

-- ---------------------------------------------------------------------------
-- knowledge_packs / knowledge_entries — the org FAQ the agent answers from
-- ---------------------------------------------------------------------------

create table public.knowledge_packs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  status       text not null default 'draft' check (status in ('draft', 'published')),
  version      integer not null default 1 check (version >= 1),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  published_at timestamptz
);

-- Exactly one published pack per org at a time.
create unique index knowledge_packs_one_published_per_org
  on public.knowledge_packs (org_id)
  where status = 'published';

alter table public.knowledge_packs enable row level security;

create trigger knowledge_packs_touch before update on public.knowledge_packs
  for each row execute function private.touch_updated_at();

create policy knowledge_packs_select_member on public.knowledge_packs
  for select to authenticated using (private.is_org_member(org_id));
create policy knowledge_packs_insert_member on public.knowledge_packs
  for insert to authenticated
  with check (private.is_org_member(org_id) and status = 'draft');
-- Staff may edit drafts; only admins may publish/unpublish (status change).
create policy knowledge_packs_update_member_draft on public.knowledge_packs
  for update to authenticated
  using (private.is_org_member(org_id) and status = 'draft')
  with check (private.is_org_member(org_id) and status = 'draft');
create policy knowledge_packs_update_admin on public.knowledge_packs
  for update to authenticated
  using (private.is_org_admin(org_id))
  with check (private.is_org_admin(org_id));
create policy knowledge_packs_delete_admin on public.knowledge_packs
  for delete to authenticated using (private.is_org_admin(org_id));

create table public.knowledge_entries (
  id         uuid primary key default gen_random_uuid(),
  pack_id    uuid not null references public.knowledge_packs (id) on delete cascade,
  org_id     uuid not null references public.orgs (id) on delete cascade,
  question   text not null check (char_length(question) between 1 and 500),
  answer     text not null check (char_length(answer) between 1 and 2000),
  keywords   text[] not null default '{}' check (array_length(keywords, 1) is null or array_length(keywords, 1) <= 20),
  position   integer not null default 0 check (position between 0 and 10000),
  updated_at timestamptz not null default now()
);
comment on table public.knowledge_entries is
  'FAQ entries. Total published-pack size is app-capped at LIMITS.KB_PACK_MAX_CHARS (api-types.ts); per-entry caps are enforced here.';

create index knowledge_entries_pack on public.knowledge_entries (pack_id, position);

alter table public.knowledge_entries enable row level security;

create trigger knowledge_entries_touch before update on public.knowledge_entries
  for each row execute function private.touch_updated_at();

create policy knowledge_entries_select_member on public.knowledge_entries
  for select to authenticated using (private.is_org_member(org_id));
create policy knowledge_entries_write_member on public.knowledge_entries
  for insert to authenticated with check (private.is_org_member(org_id));
create policy knowledge_entries_update_member on public.knowledge_entries
  for update to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));
create policy knowledge_entries_delete_member on public.knowledge_entries
  for delete to authenticated using (private.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- inbound_calls — one row per call the agent handled (service-role writes)
-- ---------------------------------------------------------------------------

create table public.inbound_calls (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  phone_number_id    uuid references public.phone_numbers (id) on delete set null,
  provider           text not null check (provider in ('vapi', 'retell', 'twilio')),
  provider_call_id   text not null check (char_length(provider_call_id) <= 200),
  caller_number      text check (caller_number is null or caller_number ~ '^\+[1-9]\d{1,14}$'),
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  duration_seconds   integer check (duration_seconds is null or duration_seconds >= 0),
  status             text not null default 'in_progress'
                       check (status in ('in_progress', 'completed', 'transferred', 'voicemail', 'failed')),
  -- R28: recorded per call; the §10 acceptance suite asserts it.
  disclosure_played  boolean not null default false,
  language           text not null default 'en' check (language in ('en', 'es')),
  escalation         text not null default 'none'
                       check (escalation in ('none', 'transferred', 'voicemail')),
  transcript         jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  summary            text check (summary is null or char_length(summary) <= 4000),
  summary_emailed_at timestamptz,
  error_reason       text check (error_reason is null or char_length(error_reason) <= 2000),
  created_at         timestamptz not null default now(),
  unique (provider, provider_call_id)
);

create index inbound_calls_org_recent on public.inbound_calls (org_id, started_at desc);

alter table public.inbound_calls enable row level security;

create policy inbound_calls_select_member on public.inbound_calls
  for select to authenticated using (private.is_org_member(org_id));
-- No client INSERT/UPDATE/DELETE policies: calls are written exclusively by
-- edge functions via service_role (R23; mirrors the old R5 pattern).

-- ---------------------------------------------------------------------------
-- intake_records — the structured outcome of a call (the org's CRM value)
-- ---------------------------------------------------------------------------

create table public.intake_records (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  -- SET NULL so retention-purging the call never destroys the intake (R23).
  call_id          uuid references public.inbound_calls (id) on delete set null,
  caller_name      text check (caller_name is null or char_length(caller_name) <= 200),
  need             text check (need is null or char_length(need) <= 2000),
  callback_number  text check (callback_number is null or callback_number ~ '^\+[1-9]\d{1,14}$'),
  -- R23: explicit consent captured on the call; provenance via call_id +
  -- callback_queue.consent_recorded_at.
  callback_consent boolean not null default false,
  preferred_time   text check (preferred_time is null or char_length(preferred_time) <= 200),
  -- AppointmentDetails shape (api-types.ts); null unless the agent booked one.
  appointment      jsonb check (appointment is null or jsonb_typeof(appointment) = 'object'),
  status           text not null default 'new' check (status in ('new', 'in_review', 'done')),
  staff_notes      text check (staff_notes is null or char_length(staff_notes) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index intake_records_call on public.intake_records (call_id)
  where call_id is not null;
create index intake_records_org_recent on public.intake_records (org_id, created_at desc);

alter table public.intake_records enable row level security;

create trigger intake_records_touch before update on public.intake_records
  for each row execute function private.touch_updated_at();

create policy intake_records_select_member on public.intake_records
  for select to authenticated using (private.is_org_member(org_id));
-- Staff work the queue: status + notes only (column grant below narrows this).
create policy intake_records_update_member on public.intake_records
  for update to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));
-- INSERT/DELETE: service_role only (created by the call pipeline).

-- ---------------------------------------------------------------------------
-- callback_queue — R23: the ONLY outbound surface; consent provenance required
-- ---------------------------------------------------------------------------

create table public.callback_queue (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  intake_id           uuid not null references public.intake_records (id) on delete cascade,
  -- Provenance: the inbound call where consent was given. SET NULL only if
  -- that call is retention-purged; consent_recorded_at preserves the fact.
  consent_call_id     uuid references public.inbound_calls (id) on delete set null,
  consent_recorded_at timestamptz not null,
  callback_number     text not null check (callback_number ~ '^\+[1-9]\d{1,14}$'),
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'calling', 'done', 'canceled')),
  scheduled_for       timestamptz,
  attempts            integer not null default 0 check (attempts between 0 and 10),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index callback_queue_org_status on public.callback_queue (org_id, status, created_at desc);

alter table public.callback_queue enable row level security;

create trigger callback_queue_touch before update on public.callback_queue
  for each row execute function private.touch_updated_at();

create policy callback_queue_select_member on public.callback_queue
  for select to authenticated using (private.is_org_member(org_id));
-- Staff may approve/cancel/schedule (column grant narrows to status/scheduled_for;
-- the transition guard below enforces legal moves).
create policy callback_queue_update_member on public.callback_queue
  for update to authenticated
  using (private.is_org_member(org_id))
  with check (private.is_org_member(org_id));
-- INSERT: service_role only, and ONLY from a consented intake (guard below).

create or replace function private.guard_callback_rules()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_consent boolean;
begin
  if tg_op = 'INSERT' then
    select i.callback_consent into v_consent
      from public.intake_records i where i.id = new.intake_id;
    if v_consent is distinct from true then
      raise exception 'callback_queue insert requires intake_records.callback_consent = true (R23)'
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- UPDATE by clients: only pending->approved|canceled and approved->canceled;
  -- service_role (auth.uid() is null over PostgREST) may perform any transition.
  if (select auth.uid()) is not null and new.status is distinct from old.status then
    if not ( (old.status = 'pending'  and new.status in ('approved', 'canceled'))
          or (old.status = 'approved' and new.status = 'canceled') ) then
      raise exception 'illegal callback status transition % -> % for staff', old.status, new.status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger callback_queue_guard
  before insert or update on public.callback_queue
  for each row execute function private.guard_callback_rules();

-- ---------------------------------------------------------------------------
-- call_events — normalized CallEvent audit log (R25); admin-read, service-write
-- ---------------------------------------------------------------------------

create table public.call_events (
  id                bigint generated always as identity primary key,
  org_id            uuid not null references public.orgs (id) on delete cascade,
  call_id           uuid references public.inbound_calls (id) on delete set null,
  provider          text not null check (provider in ('vapi', 'retell', 'twilio')),
  provider_event_id text check (provider_event_id is null or char_length(provider_event_id) <= 200),
  type              text not null check (char_length(type) <= 100),
  payload           jsonb not null default '{}'::jsonb,
  received_at       timestamptz not null default now()
);

-- Idempotency: a provider event is ingested at most once.
create unique index call_events_provider_event
  on public.call_events (provider, provider_event_id)
  where provider_event_id is not null;
create index call_events_org_recent on public.call_events (org_id, received_at desc);
create index call_events_call on public.call_events (call_id);

alter table public.call_events enable row level security;

create policy call_events_select_admin on public.call_events
  for select to authenticated using (private.is_org_admin(org_id));
-- Writes: service_role only (the provider-webhook function).

-- ---------------------------------------------------------------------------
-- private.rate_limits + rate_limit_hit() — R6 pattern carried forward (R28)
-- ---------------------------------------------------------------------------

create table private.rate_limits (
  bucket       text not null,
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, key, window_start)
);

create or replace function public.rate_limit_hit(
  p_bucket text,
  p_key    text,
  p_window text,
  p_amount integer default 1
)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_window not in ('hour', 'day', 'month') then
    raise exception 'invalid rate-limit window: %', p_window using errcode = 'P0001';
  end if;
  v_window_start := date_trunc(p_window, now());
  insert into private.rate_limits as rl (bucket, key, window_start, count)
  values (p_bucket, p_key, v_window_start, p_amount)
  on conflict (bucket, key, window_start)
  do update set count = rl.count + excluded.count
  returning rl.count into v_count;
  return v_count;
end;
$$;

revoke all on function public.rate_limit_hit(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- private.usage_counters + usage_add_minutes() — R28 monthly minutes ledger
-- ---------------------------------------------------------------------------

create table private.usage_counters (
  org_id       uuid not null references public.orgs (id) on delete cascade,
  month        date not null,
  minutes_used numeric(10, 2) not null default 0 check (minutes_used >= 0),
  primary key (org_id, month)
);

create or replace function public.usage_add_minutes(
  p_org     uuid,
  p_minutes numeric
)
returns numeric
language plpgsql security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  if p_minutes < 0 then
    raise exception 'minutes must be >= 0' using errcode = 'P0001';
  end if;
  insert into private.usage_counters as uc (org_id, month, minutes_used)
  values (p_org, date_trunc('month', now())::date, p_minutes)
  on conflict (org_id, month)
  do update set minutes_used = uc.minutes_used + excluded.minutes_used
  returning uc.minutes_used into v_total;
  return v_total;
end;
$$;

revoke all on function public.usage_add_minutes(uuid, numeric) from public, anon, authenticated;
grant execute on function public.usage_add_minutes(uuid, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- Retention purge (R23: per-org, default 90 days) + rate-limit cleanup
-- ---------------------------------------------------------------------------

create or replace function private.purge_expired_call_content()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Raw provider events age out with the org's retention window.
  delete from public.call_events e
  using public.orgs o
  where e.org_id = o.id
    and e.received_at < now() - make_interval(days => o.retention_days);

  -- Call rows (transcripts/summaries) age out too. Intake records survive:
  -- intake_records.call_id and callback_queue.consent_call_id are ON DELETE
  -- SET NULL, and consent_recorded_at preserves consent provenance.
  delete from public.inbound_calls c
  using public.orgs o
  where c.org_id = o.id
    and c.ended_at is not null
    and c.ended_at < now() - make_interval(days => o.retention_days);

  -- Rate-limit bookkeeping: drop rows older than 2 days (R15 pattern),
  -- except month-window rows which live ~35 days.
  delete from private.rate_limits
  where (window_start < now() - interval '2 days' and window_start >= date_trunc('month', now()))
     or window_start < now() - interval '35 days';
end;
$$;

-- Guarded pg_cron scheduling (R15 pattern): envs where pg_cron is unavailable
-- still apply this migration cleanly; the purge function can be run manually
-- there. Where available (hosted + local supabase images), create + schedule.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'calldone-retention-purge',
      '10 3 * * *',
      $job$ select private.purge_expired_call_content(); $job$
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants — deny-by-default; NO anon access anywhere (R23)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- Baseline table grants to authenticated (RLS narrows rows; column grants
-- narrow writable fields).
grant select on public.profiles, public.orgs, public.org_members,
                public.phone_numbers, public.knowledge_packs,
                public.knowledge_entries, public.inbound_calls,
                public.intake_records, public.callback_queue,
                public.call_events
  to authenticated;

grant update (display_name) on public.profiles to authenticated;

grant insert (name, slug, timezone, answering_mode, business_hours,
              escalation_phone, notification_email)
  on public.orgs to authenticated;
-- Note: retention_days/calls_enabled ARE org-editable (R23/R26/R28: org admin
-- controls); monthly_minutes_cap is NOT (service-role managed ceiling).
grant update (name, timezone, answering_mode, business_hours,
              escalation_phone, notification_email, retention_days,
              calls_enabled)
  on public.orgs to authenticated;

grant insert (org_id, user_id, role) on public.org_members to authenticated;
grant update (role) on public.org_members to authenticated;
grant delete on public.org_members to authenticated;

grant insert (org_id, title, status) on public.knowledge_packs to authenticated;
grant update (title, status, version, published_at) on public.knowledge_packs to authenticated;
grant delete on public.knowledge_packs to authenticated;

grant insert (pack_id, org_id, question, answer, keywords, position)
  on public.knowledge_entries to authenticated;
grant update (question, answer, keywords, position)
  on public.knowledge_entries to authenticated;
grant delete on public.knowledge_entries to authenticated;

grant update (status, staff_notes) on public.intake_records to authenticated;
grant update (status, scheduled_for) on public.callback_queue to authenticated;

-- service_role: full access (default in Supabase, restated for clarity).
grant all on all tables in schema public to service_role;
grant all on all tables in schema private to service_role;
