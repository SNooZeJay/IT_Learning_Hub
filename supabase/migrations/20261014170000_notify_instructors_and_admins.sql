-- Instructors and admins get notifications too.
--
-- Every writer so far notifies the student in the event: enrolments, payments,
-- quiz and assignment outcomes, and announcements all land on student rows, so
-- the instructor and admin notification pages the app now renders would sit
-- empty by construction. These four triggers close the loop for the events
-- each role actually owns:
--
--   instructor: work handed in (their marking queue) and new enrolments in
--               their courses (their students list);
--   admin:      payments settling (their ledger) and courses publishing
--               (their catalogue).
--
-- Types are reused, not added: `announcement` labels a system notice without
-- claiming a kind, `enrolment_confirmed` and `payment_received` already read
-- correctly for the new audiences. Adding enum values would need
-- ALTER TYPE ... ADD VALUE, which cannot run inside the transaction this file
-- executes in, for labels the existing ones already carry. Links point at the
-- role's own routes, because a notification that opens a screen the guard
-- refuses is a second bug.
--
-- Backfill at the end seeds rows for history that predates these triggers, so
-- the new pages are not empty on day one. `created_at` carries the event time,
-- not now: a two-week-old submission must read as two weeks old. Enrolments
-- and past publications are deliberately NOT backfilled - a notice about a
-- months-old enrolment is noise, not information.
--
-- Like its siblings this file is re-runnable: functions are replaced, triggers
-- dropped first, and the migration framework runs each file once.

create or replace function public.assignment_submissions_notify_instructors()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_assignment_title text;
  v_course_title text;
  v_student_name text;
  v_instructor uuid;
begin
  -- Inserts (the normal creation path, defaulting to submitted), transitions
  -- back to submitted, and re-submissions: handing work in again replaces the
  -- text right up until it is marked, and each hand-in is new work the marking
  -- queue must hear about. Skipped only when nothing new arrived - a feedback
  -- save or any other no-op update while already submitted. Grading itself is
  -- the student's trigger's business, not this one's.
  if new.status is distinct from 'submitted' then return new; end if;
  if TG_OP = 'UPDATE'
    and old.status is not distinct from 'submitted'
    and new.submission_text is not distinct from old.submission_text
    and new.file_path is not distinct from old.file_path
  then return new; end if;

  select a.title, c.title into v_assignment_title, v_course_title
  from public.assignments a
  join public.courses c on c.id = a.course_id
  where a.id = new.assignment_id;

  select p.full_name into v_student_name
  from public.profiles p
  where p.id = new.student_id;

  for v_instructor in
    select ci.instructor_id
    from public.course_instructors ci
    where ci.course_id = new.course_id
  loop
    perform public.notify(v_instructor, 'announcement', 'Submission needs marking',
      coalesce(v_student_name, 'A student') || ' handed in "' ||
      coalesce(v_assignment_title, 'an assignment') || '"' ||
      case when v_course_title is not null then ' for ' || v_course_title else '' end || '.',
      '/instructor/grading');
  end loop;
  return new;
end; $fn$;

drop trigger if exists assignment_submissions_notify_instructors on public.assignment_submissions;
create trigger assignment_submissions_notify_instructors
  after insert or update on public.assignment_submissions for each row
  execute function public.assignment_submissions_notify_instructors();

create or replace function public.enrollments_notify_instructors()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_course_title text;
  v_student_name text;
  v_instructor uuid;
begin
  if new.status is distinct from 'active' then return new; end if;

  select c.title into v_course_title
  from public.courses c
  where c.id = new.course_id;

  select p.full_name into v_student_name
  from public.profiles p
  where p.id = new.student_id;

  for v_instructor in
    select ci.instructor_id
    from public.course_instructors ci
    where ci.course_id = new.course_id
  loop
    perform public.notify(v_instructor, 'enrolment_confirmed', 'New enrollment',
      coalesce(v_student_name, 'A student') || ' enrolled in ' ||
      coalesce(v_course_title, 'your course') || '.',
      '/instructor/students');
  end loop;
  return new;
end; $fn$;

drop trigger if exists enrollments_notify_instructors on public.enrollments;
create trigger enrollments_notify_instructors
  after insert on public.enrollments for each row
  execute function public.enrollments_notify_instructors();

create or replace function public.payments_notify_admins()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_course_title text;
  v_student_name text;
  v_admin uuid;
begin
  if new.status is distinct from 'paid' or old.status is not distinct from 'paid' then return new; end if;

  select c.title into v_course_title
  from public.courses c
  where c.id = new.course_id;

  select p.full_name into v_student_name
  from public.profiles p
  where p.id = new.student_id;

  for v_admin in
    select p.id from public.profiles p where p.role = 'admin' and p.status = 'active'
  loop
    perform public.notify(v_admin, 'payment_received', 'Payment received',
      trim(to_char(new.amount_centavos / 100.0, 'FM999,999,990.00')) || ' ' || new.currency ||
      ' for ' || coalesce(v_course_title, 'a course') ||
      ' from ' || coalesce(v_student_name, 'a student') || '.',
      '/admin/payments');
  end loop;
  return new;
end; $fn$;

drop trigger if exists payments_notify_admins on public.payments;
create trigger payments_notify_admins
  after update on public.payments for each row
  execute function public.payments_notify_admins();

create or replace function public.courses_notify_admins_published()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_admin uuid;
begin
  if new.status is distinct from 'published' or old.status is not distinct from 'published' then return new; end if;

  for v_admin in
    select p.id from public.profiles p where p.role = 'admin' and p.status = 'active'
  loop
    perform public.notify(v_admin, 'announcement', 'Course published',
      '"' || new.title || '" is now published and open for enrollment.',
      '/admin/courses');
  end loop;
  return new;
end; $fn$;

drop trigger if exists courses_notify_admins_published on public.courses;
create trigger courses_notify_admins_published
  after update on public.courses for each row
  execute function public.courses_notify_admins_published();

revoke all on function public.assignment_submissions_notify_instructors() from anon, authenticated;
revoke all on function public.enrollments_notify_instructors() from anon, authenticated;
revoke all on function public.payments_notify_admins() from anon, authenticated;
revoke all on function public.courses_notify_admins_published() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: history that predates the triggers above.
-- ---------------------------------------------------------------------------

-- Submissions sitting ungraded in marking queues right now. These are live
-- work items, not history, which is why they backfill while enrolments do not.
-- Idempotent via the anti-join: re-running this file (or a later `db push`
-- that replays it) must not double-notice work it already noticed. The match
-- is the full row identity - who, what kind, what words, where it points,
-- when the event happened - so a genuine second submission still inserts.
with candidate as (
  select ci.instructor_id as user_id, 'announcement' as type, 'Submission needs marking' as title,
    coalesce(st.full_name, 'A student') || ' handed in "' ||
    coalesce(a.title, 'an assignment') || '" for ' || coalesce(c.title, 'a course') || '.' as body,
    '/instructor/grading' as link, s.submitted_at as created_at
  from public.assignment_submissions s
  join public.assignments a on a.id = s.assignment_id
  join public.courses c on c.id = s.course_id
  join public.course_instructors ci on ci.course_id = s.course_id
  join public.profiles st on st.id = s.student_id
  where s.status = 'submitted'
)
insert into public.notifications (user_id, type, title, body, link, created_at)
select user_id, type::public.notification_type, title, body, link, created_at
from candidate
where not exists (
  select 1 from public.notifications n
  where n.user_id = candidate.user_id
    and n.title = candidate.title
    and n.body = candidate.body
    and n.link = candidate.link
    and n.created_at = candidate.created_at
);

-- Settled payments, so the admin ledger's past is visible next to its future.
-- Same idempotency rule as above.
with candidate as (
  select ad.id as user_id, 'payment_received' as type, 'Payment received' as title,
    trim(to_char(p.amount_centavos / 100.0, 'FM999,999,990.00')) || ' ' || p.currency ||
    ' for ' || coalesce(c.title, 'a course') ||
    ' from ' || coalesce(st.full_name, 'a student') || '.' as body,
    '/admin/payments' as link, coalesce(p.paid_at, p.created_at) as created_at
  from public.payments p
  join public.courses c on c.id = p.course_id
  join public.profiles st on st.id = p.student_id
  cross join lateral (
    select pr.id from public.profiles pr where pr.role = 'admin' and pr.status = 'active'
  ) ad
  where p.status = 'paid'
)
insert into public.notifications (user_id, type, title, body, link, created_at)
select user_id, type::public.notification_type, title, body, link, created_at
from candidate
where not exists (
  select 1 from public.notifications n
  where n.user_id = candidate.user_id
    and n.title = candidate.title
    and n.body = candidate.body
    and n.link = candidate.link
    and n.created_at = candidate.created_at
);
