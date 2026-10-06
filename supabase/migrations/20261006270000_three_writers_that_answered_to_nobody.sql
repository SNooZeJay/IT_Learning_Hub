-- Three writers that answer to nobody: anon holding TRUNCATE on the payment ledger, a
-- caller-controlled audit log, and a notification inbox anyone can post into.
--
-- ===========================================================================================
-- 1. anon holds TRUNCATE on payment_events
-- ===========================================================================================
--
-- `anon` held SELECT, INSERT, UPDATE, DELETE *and TRUNCATE* on `public.payment_events`,
-- and it was the only table in the schema where anon held any write privilege. RLS covers
-- INSERT, UPDATE, DELETE and SELECT, and `payment_events` has a policy for each - so those
-- four are blocked. TRUNCATE is not covered by RLS at all. Postgres applies no policy to
-- it, so the privilege alone is the boundary, and the boundary was open.
--
--     has_table_privilege('anon','public.payment_events','TRUNCATE')  = true
--
-- Migration 20261005090006 enumerated the tables to revoke from anon and `payment_events`
-- did not exist yet when it ran. The comment in 20261004195753 that payment_events is
-- "read-only to the browser, exactly like payments" was therefore never true.
--
-- What is lost by revoking: nothing. `record_payment_event` and `record_event` are
-- SECURITY DEFINER and are the intended writers; the browser has no legitimate reason to
-- write here at all. The DELETE and INSERT grants were equally unused.
--
-- Reachability of the privilege from outside is *unproven* and is not claimed: whether
-- the deployment accepts the anon key as a password for a direct session is a deployment
-- fact, not a schema one. The grant is wrong either way, and TRUNCATE is destructive with
-- no audit, so it goes.
--
-- ===========================================================================================
-- 2. record_activity let any signed-in user forge an audit entry
-- ===========================================================================================
--
--     insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
--     values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata,'{}'))
--
-- `actor_id` is correctly pinned to the caller, so an entry cannot be attributed to
-- somebody else. Everything else was free. `activity_logs` grants nobody INSERT, so this
-- RPC is the only door - and it checks nothing about who is asking.
--
-- The read policy surfaces rows to whoever instructs the referenced course:
--
--     entity_type = 'course' and exists (select 1 from courses c
--       where c.id = activity_logs.entity_id and (is_instructor_of(c.id) or is_admin()))
--
-- so a student could write `entity_type = 'course'`, `entity_id = <any course>`, and an
-- arbitrary action and metadata, and it would appear in that instructor's audit trail -
-- and, through `is_admin()`, in an administrator's.
--
-- `logAdminAction` is the only caller and is used by three admin views
-- (`admin/Categories.vue`, `admin/Courses.vue`, `admin/Users.vue`), so requiring an
-- administrator costs nothing.
--
-- `record_event` is left alone: `recordLearningEvent` calls it from lesson pages a student
-- is using, so it legitimately serves students. It writes to analytics rather than to a
-- trail anybody treats as a record.
--
-- ===========================================================================================
-- 3. notify and notify_course could write into anybody's inbox
-- ===========================================================================================
--
-- Both are SECURITY DEFINER with no authorisation check at all:
--
--     insert into public.notifications (user_id, type, title, body, link)
--     values (p_user_id, p_type, p_title, p_body, p_link)
--
-- `notifications` grants no INSERT to `authenticated` and has no INSERT policy, so these
-- are the only write path. Both were executable by `authenticated`.
--
-- A notification is something the system tells you happened. If any signed-in user can
-- write one, it is no longer that: "Payment failed - re-enter your card at ..." with an
-- arbitrary `link` is a phishing primitive aimed at an administrator, and `notify_course`
-- broadcasts to every non-dropped enrollee of any course by id - including `pending`
-- enrolments, which have not paid.
--
-- Nothing in the application calls either. `types.ts` lists `notify_course` because the
-- types are generated from the schema, not because it is used. Both are executable as
-- `service_role`, which is how the Edge Functions and the webhook reach them, and by
-- `postgres` for internal use.
--
-- Dropping this is not a removal of a feature: notifications are already created by the
-- database itself on enrolment, payment and submission events, and the frontend reads
-- them through `notification.service.ts`. What is removed is the ability to invent one.

-- -------------------------------------------------------------------------------------------
-- 1. payment_events is not writable by the browser
-- -------------------------------------------------------------------------------------------

revoke all on table public.payment_events from anon;

comment on table public.payment_events is
  'The webhook audit ledger: raw payloads and signature_verified flags, kept because they are the evidence that a payment was genuinely settled. Written only by record_payment_event and record_event, both SECURITY DEFINER. anon holds no privilege on this table - TRUNCATE in particular is not covered by RLS, so the GRANT alone is the boundary and it was open while anon held TRUNCATE.';

-- -------------------------------------------------------------------------------------------
-- 2. the activity log is an administrator's record
-- -------------------------------------------------------------------------------------------

create or replace function public.record_activity(
  p_action      text,
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id bigint;
begin
  -- An activity log is the record of what an administrator did. Without this, any
  -- signed-in user could write an entry naming any course, and it would be surfaced to
  -- that course's instructors and to every administrator by the read policy.
  if not public.is_admin() then
    raise exception 'only an administrator may write to the activity log'
      using errcode = '42501';
  end if;

  -- `returns bigint`, not void. The original returns the new row's id and CREATE OR
  -- REPLACE cannot change a return type, so a mismatch here fails the whole migration
  -- with 42P13 rather than applying.
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.record_activity(text, text, uuid, jsonb) is
  'Writes one activity log entry. Restricted to administrators: the read policy surfaces rows to the instructors of the referenced course, so an unrestricted writer could forge entries in an instructor''s and an administrator''s trail. actor_id is auth.uid(), so an entry can never be attributed to somebody else.';

revoke execute on function public.record_activity(text, text, uuid, jsonb) from anon;
revoke execute on function public.record_activity(text, text, uuid, jsonb) from public;
grant execute on function public.record_activity(text, text, uuid, jsonb) to authenticated;

-- -------------------------------------------------------------------------------------------
-- 3. notifications are written by the system, not by whoever asks
-- -------------------------------------------------------------------------------------------

revoke execute on function public.notify(uuid, public.notification_type, text, text, text) from anon;
revoke execute on function public.notify(uuid, public.notification_type, text, text, text) from public;
revoke execute on function public.notify(uuid, public.notification_type, text, text, text) from authenticated;

revoke execute on function public.notify_course(uuid, public.notification_type, text, text, text) from anon;
revoke execute on function public.notify_course(uuid, public.notification_type, text, text, text) from public;
revoke execute on function public.notify_course(uuid, public.notification_type, text, text, text) from authenticated;

comment on function public.notify(uuid, public.notification_type, text, text, text) is
  'Writes one notification row. Not executable by authenticated: notifications are the system telling somebody something happened, and an unrestricted writer makes that arbitrary - arbitrary title, arbitrary body, arbitrary link, into any account including an administrator''s. Notifications are still created by the database itself on enrolment, payment and submission events; what is removed is the ability to invent one. service_role reaches this for the Edge Functions.';

comment on function public.notify_course(uuid, public.notification_type, text, text, text) is
  'Broadcasts one notification to every enrolled student of a course. Not executable by authenticated, for the same reason as notify. It also filtered e.status <> ''dropped'', which includes pending enrolments that have not paid.';