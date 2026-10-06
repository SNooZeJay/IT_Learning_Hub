-- `sync_lesson_progress_student` looked up the parent enrolment as the invoker, so
-- `enrollments` RLS filtered the row and the trigger reported "the enrolment for this
-- progress row does not exist" for a row that plainly exists.
--
-- The misleading part matters because it points the wrong way. Reproduced after
-- 20261006250000, planting progress on somebody else's enrolment:
--
--     23503: the enrolment for this progress row does not exist
--
-- which reads as a broken foreign key. The enrolment did exist; the writer simply was not
-- allowed to see it. An operator chasing that would go looking for a missing row.
--
-- The trigger is an integrity check, not an access control check. RLS has already decided
-- whether this caller may write this row - by the time the trigger runs, the write is
-- permitted. Its job is only to confirm that the denormalised `student_id` agrees with the
-- parent, and it cannot do that without seeing the parent. So it is SECURITY DEFINER with
-- a pinned search_path, which is what lets it read the enrolment row the caller may not.
--
-- Nothing is loosened: the function still requires the parent to exist and still refuses a
-- mismatch. Making it definer cannot turn a refusal into an allowance, because the only
-- decision it makes is equality against a row that already passed RLS.
--
-- Re-verified after this change:
--
--     plant progress on another student's enrolment    refused 42501, parent exists
--     plant progress on own enrolment, forged student  refused 42501, parent exists
--     plant progress on own enrolment, honest student   accepted
--
-- The first two now say "progress belongs to the student who owns the enrolment" rather
-- than claiming a row is missing.

create or replace function public.sync_lesson_progress_student()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
begin
  select e.student_id into v_owner
  from public.enrollments e
  where e.id = coalesce(new.enrollment_id, old.enrollment_id);

  if v_owner is null then
    raise exception 'the enrolment % for this progress row does not exist',
      coalesce(new.enrollment_id, old.enrollment_id)
      using errcode = 'foreign_key_violation';
  end if;

  -- `lesson_progress.student_id` is denormalised so the read policies are a column
  -- comparison. It is written by the client, so it has to agree with the parent or the
  -- denormalisation is only a claim the client chose.
  if new.student_id is distinct from v_owner then
    raise exception 'progress belongs to the student who owns the enrolment'
      using errcode = '42501';
  end if;

  new.student_id := v_owner;
  return new;
end;
$$;

comment on function public.sync_lesson_progress_student() is
  'Integrity check, not access control: RLS has already decided whether this caller may write this row. SECURITY DEFINER so it can read the parent enrolment even when the writer may not see it - as the invoker it saw no parent at all and reported an existing enrolment as missing.';

revoke execute on function public.sync_lesson_progress_student() from anon;
revoke execute on function public.sync_lesson_progress_student() from public;
grant execute on function public.sync_lesson_progress_student() to authenticated;