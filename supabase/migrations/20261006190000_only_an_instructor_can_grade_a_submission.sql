-- A student could award themselves the maximum grade on their own submission.
--
-- What was wrong
-- --------------
-- `protect_graded_submission` guarded the grading record, but only for rows that were
-- *already* graded:
--
--     if old.status = 'graded' then
--       if new.grade is distinct from old.grade
--          or new.feedback is distinct from old.feedback
--          or new.graded_by is distinct from old.graded_by
--          or new.graded_at is distinct from old.graded_at
--          or new.status is distinct from old.status then
--         raise exception 'this submission has already been graded; grading is a record'
--
-- Nothing guarded the transition *into* graded. Reproduced, as the student, inside a
-- transaction that was rolled back:
--
--     insert into assignment_submissions (assignment_id, course_id, student_id, submission_text)
--     values (...);                                     -- allowed: this is the feature
--
--     update assignment_submissions
--        set grade = 50, feedback = 'self', graded_by = <own id>,
--            graded_at = now(), status = 'graded'
--      where student_id = <own id>;                     -- ALSO allowed
--
--     resulting grade: 50.00   resulting status: graded
--
-- 50 of 50. The student graded their own work at full marks, and the grade is the value
-- `getStudentGrades` reads for the gradebook, so it is what a transcript would show.
--
-- Why the policies did not stop it
-- -------------------------------
-- There are two permissive UPDATE policies and Postgres ORs them:
--
--     submissions instructor grade   using (is_instructor_of(course_id) or is_admin())
--     submissions student update     using (student_id = auth.uid() and status = 'submitted')
--                                    with check (student_id = auth.uid())
--
-- The student's own policy matched, so the UPDATE was admitted. Its WITH CHECK only
-- asserts that `student_id` did not change - which it did not. RLS cannot restrict
-- individual columns, so a row-level policy can never express "a student may change
-- their text but not their grade". This is the same reason `profiles` needed
-- `guard_profile_privileges`: where RLS cannot say it, a trigger has to.
--
-- The fix
-- -------
-- A trigger, because that is the only place a column-level rule can live. Any change to
-- grade, feedback, graded_by or graded_at now requires the caller to instruct or
-- administer *this course*.
--
-- `is_instructor_of(course_id)` rather than the trigger's existing
-- `current_role() <> 'instructor'`, because an instructor of some other course is not
-- entitled to grade this one's work. Both functions are already executable by
-- authenticated and are already used inside policies.
--
-- The existing logic below the new check is preserved unchanged: a grade above the
-- assignment maximum is still refused, and a grade still promotes status to graded on
-- the instructor's behalf.

create or replace function public.protect_graded_submission()
returns trigger
language plpgsql
as $$
begin
  -- The grading record belongs to the instructor. This runs before the existing
  -- "already graded" guard so that a student cannot reach the graded state in the
  -- first place and then be protected by it.
  if (new.grade is distinct from old.grade
      or new.feedback is distinct from old.feedback
      or new.graded_by is distinct from old.graded_by
      or new.graded_at is distinct from old.graded_at)
     and not (public.is_instructor_of(old.course_id) or public.is_admin()) then
    raise exception 'only an instructor of this course can grade a submission'
      using errcode = '42501';
  end if;

  if old.status = 'graded' then
    -- Grade, feedback and grader are the instructor's record and never move.
    if new.grade is distinct from old.grade
       or new.feedback is distinct from old.feedback
       or new.graded_by is distinct from old.graded_by
       or new.graded_at is distinct from old.graded_at
       or new.status is distinct from old.status then
      raise exception 'this submission has already been graded; grading is a record'
        using errcode = 'check_violation';
    end if;

    -- The work itself may be replaced, but only by someone entitled to grade,
    -- and doing so reopens it.
    if new.submission_text is distinct from old.submission_text
       or new.file_path is distinct from old.file_path then
      if public.current_role() <> 'instructor' and public.current_role() <> 'admin' then
        raise exception 'this submission has already been graded and cannot be replaced'
          using errcode = 'insufficient_privilege';
      end if;
      new.status := 'submitted';
      new.grade := null;
      new.feedback := null;
      new.graded_by := null;
      new.graded_at := null;
    end if;
  end if;

  -- A grade beyond the assignment's maximum is a data-entry slip that would
  -- otherwise show up in a transcript as an impossible mark.
  if new.grade is not null then
    if new.grade > (select a.max_points from public.assignments a where a.id = new.assignment_id) then
      raise exception 'grade % exceeds the maximum of %',
        new.grade, (select a.max_points from public.assignments a where a.id = new.assignment_id)
        using errcode = 'check_violation';
    end if;
    if new.status <> 'graded' then
      new.status := 'graded';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.protect_graded_submission() is
  'Guards the grading record. A trigger rather than a policy because RLS cannot restrict individual columns: two permissive UPDATE policies are OR-ed, so the student policy admitted any UPDATE on the student''s own row and its WITH CHECK only asserted that student_id had not changed. A student could therefore submit work and immediately set grade, feedback, graded_by and status to graded.';

drop trigger if exists assignment_submissions_protect_graded on public.assignment_submissions;
create trigger assignment_submissions_protect_graded
  before update on public.assignment_submissions
  for each row execute function public.protect_graded_submission();
