-- Progress needs a place.
--
-- `lesson_progress` is written by the client and its policy checks one thing:
--
--     with_check (student_id = auth.uid())
--
-- That is enough to stop a student writing progress onto somebody else's row -
-- `sync_lesson_progress_student` re-reads the enrolment and refuses a student_id
-- that disagrees with its owner. But it says nothing about the enrolment itself.
-- Any account with a seat in any state could write progress against it, including
-- a `pending` seat, which is what a checkout creates before a card is charged.
--
-- Proved, not theorised. Impersonating a student and inserting a row against
-- their own unpaid `pending` enrolment:
--
--     INSERT INTO lesson_progress (enrollment_id, lesson_id, student_id, status, progress_percent)
--     SELECT e.id, l.id, e.student_id, 'completed', 100 ... e.status = 'pending'
--
-- succeeded. No policy, trigger or constraint objected. The student cannot read
-- the lesson - `is_enrolled_in` counts only active and completed - and cannot
-- complete the enrolment or reach a certificate, because
-- `refresh_enrollment_completion` returns false for a pending seat. So the damage
-- is bounded: the rows are invisible to their owner, but they are not invisible
-- to everyone else. They count towards "lessons completed" on a dashboard, and an
-- instructor reading a student's record sees study on a course the student never
-- bought. This database had exactly that: six completed lessons, a passed quiz
-- and an assignment graded 91/100 against an unpaid enrolment.
--
-- The rule is the same one the rest of the schema already applies to enrolments:
-- studying requires a live place. A `pending` seat is an intention, a `dropped`
-- one is a decision that has been undone, and neither is a place. Administrators
-- and the course's instructors are exempt, because recording progress on a
-- student's behalf is legitimate and the enrolment policies already let them read
-- it.
--
-- A trigger rather than a policy change, because this has to hold however the row
-- arrives. Every existing policy on this table stays as it is.
--
-- Writes are INSERT and UPDATE only. A delete is how a correction is made, and
-- refusing it would leave a wrong row that nobody could take back.

create or replace function public.protect_lesson_progress_entitlement()
returns trigger
language plpgsql
set search_path TO 'public', 'pg_temp'
as $function$
declare
  v_enrolment public.enrollments%rowtype;
begin
  select * into v_enrolment
    from public.enrollments
   where id = coalesce(new.enrollment_id, old.enrollment_id);

  -- No parent row. sync_lesson_progress_student already raises on this one, and
  -- the foreign key would catch it regardless.
  if not found then
    return new;
  end if;

  if v_enrolment.status in ('active', 'completed') then
    return new;
  end if;

  -- An administrator or the course's instructor records progress for a student.
  if public.is_admin() or public.is_instructor_of(v_enrolment.course_id) then
    return new;
  end if;

  raise exception
    'progress can only be recorded on an active or completed enrolment; enrolment % is %',
    v_enrolment.id, v_enrolment.status
    using errcode = '42501';
end;
$function$;

create trigger lesson_progress_protect_entitlement
before insert or update on public.lesson_progress
for each row execute function public.protect_lesson_progress_entitlement();