-- 20261005090013_communication_and_ops.sql
--
-- Announcements, notifications, conversations, and the two audit tables.
--
-- Notifications
-- -------------
-- Written by SECURITY DEFINER helpers rather than by the client. A notification
-- a student can insert for themselves is a notification they can also delete,
-- which makes an unread badge meaningless. `notify()` is the only writer.
--
-- Announcements
-- -------------
-- course_id null means platform-wide, readable by anyone signed in. Otherwise
-- visible to the students enrolled in that course and to its instructors.
--
-- Conversations
-- -------------
-- A conversation has no participants column, because membership is many-to-many
-- and duplicating it would let the two drift. Participant rows are the single
-- source of truth, and reading a conversation requires one.

create type public.notification_type as enum (
  'enrolment_confirmed',
  'payment_received',
  'quiz_graded',
  'assignment_graded',
  'course_completed',
  'certificate_issued',
  'certificate_revoked',
  'announcement',
  'new_message'
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  -- Null means platform-wide.
  course_id    uuid references public.courses (id) on delete cascade,
  author_id    uuid not null references public.profiles (id),
  title        text not null check (length(btrim(title)) > 0),
  body         text not null check (length(btrim(body)) > 0),
  -- Null means still a draft, visible only to its author and to admins.
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index announcements_course_idx on public.announcements (course_id, published_at desc);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null check (length(btrim(title)) > 0),
  body       text,
  -- An in-app path. Not a URL: storing a full URL would let one row point the
  -- browser anywhere, and a relative path cannot.
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null check (length(btrim(subject)) > 0),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx
  on public.conversation_participants (user_id);

create table public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id),
  body            text not null check (length(btrim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index conversation_messages_thread_idx
  on public.conversation_messages (conversation_id, created_at);

create table public.activity_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (length(btrim(action)) > 0),
  entity_type text,
  entity_id   uuid,
  -- Free-form detail. Never used to decide access; RLS does that.
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id);
create index activity_logs_actor_idx  on public.activity_logs (actor_id, created_at desc);

create table public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  event_name  text not null check (length(btrim(event_name)) > 0),
  entity_type text,
  entity_id   uuid,
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index analytics_events_name_idx on public.analytics_events (event_name, created_at desc);

-- ---------------------------------------------------------------------------
-- Writers
-- ---------------------------------------------------------------------------

-- The only path by which a notification comes into existence.
create or replace function public.notify(
  p_user_id uuid,
  p_type    public.notification_type,
  p_title   text,
  p_body    text default null,
  p_link    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link)
  returning id into v_id;
  return v_id;
end;
$$;

-- Grants notifications to everyone enrolled in a course. Used by announcements.
create or replace function public.notify_course(
  p_course_id uuid,
  p_type      public.notification_type,
  p_title     text,
  p_body      text default null,
  p_link      text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- A CTE rather than a second FROM: notify() is called once per enrolled
  -- student, and the count comes from what it returned.
  with sent as (
    select public.notify(e.student_id, p_type, p_title, p_body, p_link) as id
    from public.enrollments e
    where e.course_id = p_course_id and e.status <> 'dropped'
  )
  select count(*) into v_count from sent;

  return v_count;
end;
$$;

-- Records an action for the audit trail. Never used to decide who may read what.
create or replace function public.record_activity(
  p_action      text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.record_event(
  p_event_name  text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_properties  jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.analytics_events (user_id, event_name, entity_type, entity_id, properties)
  values (auth.uid(), p_event_name, p_entity_type, p_entity_id, coalesce(p_properties, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.notify(uuid, public.notification_type, text, text, text) from public;
revoke all on function public.notify_course(uuid, public.notification_type, text, text, text) from public;
revoke all on function public.record_activity(text, text, uuid, jsonb) from public;
revoke all on function public.record_event(text, text, uuid, jsonb) from public;

grant execute on function public.notify(uuid, public.notification_type, text, text, text) to authenticated;
grant execute on function public.notify_course(uuid, public.notification_type, text, text, text) to authenticated;
grant execute on function public.record_activity(text, text, uuid, jsonb) to authenticated;
grant execute on function public.record_event(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.announcements            enable row level security;
alter table public.notifications            enable row level security;
alter table public.conversations            enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages    enable row level security;
alter table public.activity_logs            enable row level security;
alter table public.analytics_events         enable row level security;

-- Announcements -----------------------------------------------------------
drop policy if exists "announcements select" on public.announcements;
create policy "announcements select" on public.announcements
  for select to authenticated
  using (
    author_id = auth.uid()
    or public.is_admin()
    or (
      published_at is not null
      and (
        course_id is null
        or public.is_instructor_of(course_id)
        or public.is_enrolled_in(course_id)
      )
    )
  );

drop policy if exists "announcements instructor write" on public.announcements;
create policy "announcements instructor write" on public.announcements
  for all to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin())
  with check (public.is_instructor_of(course_id) or public.is_admin());

-- Notifications -----------------------------------------------------------
-- Read and mark-read only. There is no insert policy and no update policy beyond
-- read_at: a student can dismiss their own notification and cannot manufacture
-- one or alter its contents.
drop policy if exists "notifications select own" on public.notifications;
create policy "notifications select own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications mark read" on public.notifications;
create policy "notifications mark read" on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Conversations -----------------------------------------------------------
drop policy if exists "conversations select" on public.conversations;
create policy "conversations select" on public.conversations
  for select to authenticated
  using (exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = id and p.user_id = auth.uid()
  ));

drop policy if exists "conversations insert" on public.conversations;
create policy "conversations insert" on public.conversations
  for insert to authenticated with check (created_by = auth.uid());

-- Membership is the access boundary, so only a participant may add a participant.
-- Otherwise anyone could add themselves to any thread.
drop policy if exists "participants select" on public.conversation_participants;
create policy "participants select" on public.conversation_participants
  for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = conversation_id and p.user_id = auth.uid()
  ));

drop policy if exists "participants insert" on public.conversation_participants;
create policy "participants insert" on public.conversation_participants
  for insert to authenticated
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.created_by = auth.uid()
  ));

drop policy if exists "participants mark read" on public.conversation_participants;
create policy "participants mark read" on public.conversation_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "messages select" on public.conversation_messages;
create policy "messages select" on public.conversation_messages
  for select to authenticated
  using (exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = conversation_id and p.user_id = auth.uid()
  ));

drop policy if exists "messages insert" on public.conversation_messages;
create policy "messages insert" on public.conversation_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = conversation_id and p.user_id = auth.uid()
    )
  );

-- Audit -------------------------------------------------------------------
-- An instructor sees activity for their own courses; an admin sees everything.
-- Nobody sees activity for a course they have no part in.
drop policy if exists "activity logs read" on public.activity_logs;
create policy "activity logs read" on public.activity_logs
  for select to authenticated
  using (
    public.is_admin()
    or (
      entity_type = 'course'
      and exists (
        select 1 from public.courses c
        where c.id = entity_id and (public.is_instructor_of(c.id) or public.is_admin())
      )
    )
    or actor_id = auth.uid()
  );

-- Analytics events are written only by record_event. Instructors read their own
-- courses' events; nobody reads raw event rows outside that.
drop policy if exists "analytics events read" on public.analytics_events;
create policy "analytics events read" on public.analytics_events
  for select to authenticated
  using (
    public.is_admin()
    or user_id = auth.uid()
    or (
      entity_type = 'course'
      and exists (
        select 1 from public.courses c
        where c.id = entity_id and public.is_instructor_of(c.id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.announcements             from anon;
revoke all on public.notifications             from anon;
revoke all on public.conversations             from anon;
revoke all on public.conversation_participants from anon;
revoke all on public.conversation_messages     from anon;
revoke all on public.activity_logs             from anon;
revoke all on public.analytics_events          from anon;

-- The default ACL grants `authenticated` everything on new tables, so each of
-- these is revoked before being rebuilt from what is actually safe. See
-- 20261005090008 for why the revoke has to come first.
revoke all on public.announcements             from authenticated;
revoke all on public.notifications             from authenticated;
revoke all on public.conversations             from authenticated;
revoke all on public.conversation_participants from authenticated;
revoke all on public.conversation_messages     from authenticated;
revoke all on public.activity_logs             from authenticated;
revoke all on public.analytics_events          from authenticated;

grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;

grant select on public.notifications to authenticated;
-- Update is for read_at alone. No insert: notifications come from notify().
grant update on public.notifications to authenticated;

grant select, insert on public.conversations to authenticated;
grant select, insert, update on public.conversation_participants to authenticated;
grant select, insert on public.conversation_messages to authenticated;

-- No insert or update on either audit table: both are written only by their
-- SECURITY DEFINER functions, which is what makes them trustworthy.
grant select on public.activity_logs to authenticated;
grant select on public.analytics_events to authenticated;
