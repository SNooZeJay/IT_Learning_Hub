-- 20261005090012_graded_submission_audit.sql
--
-- A graded submission must record who graded it.
--
-- The trigger accepted `status = 'graded'` with `graded_by` left null, because
-- nothing required it. A mark with no marker against it cannot be audited, which
-- matters most in exactly the case the trigger exists for: disputing a grade.
--
-- The trigger now fills in the grader, and a CHECK refuses a graded row with no
-- grader at all. Bulk grading through the service role has no auth.uid(), so it
-- must name the instructor explicitly - a server acting on someone's behalf
-- should say on whose behalf.
--
-- Found while verifying section 19.3. The security rule itself held: a student
-- clearing their own grade updated zero rows. What was missing was the audit
-- trail, not the protection.

create or replace function public.protect_graded_submission()
returns trigger
language plpgsql
as $$
begin
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

    -- The work may be replaced, but only by someone entitled to grade, and doing
    -- so reopens it rather than editing a marked submission.
    if new.submission_text is distinct from old.submission_text
       or new.file_path is distinct from old.file_path then
      if public.current_role() not in ('instructor', 'admin') then
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

  if new.grade is not null then
    if new.grade > (select a.max_points from public.assignments a where a.id = new.assignment_id) then
      raise exception 'grade % exceeds the maximum of %',
        new.grade, (select a.max_points from public.assignments a where a.id = new.assignment_id)
        using errcode = 'check_violation';
    end if;
    if new.status <> 'graded' then
      new.status := 'graded';
    end if;
    -- Stamp the grader when the caller did not name one.
    if new.graded_by is null then
      new.graded_by := auth.uid();
    end if;
    if new.graded_at is null then
      new.graded_at := now();
    end if;
  end if;

  return new;
end;
$$;

-- Backfill the row that motivated this, naming the instructor who graded it.
--
-- The trigger has to stand down for this one statement. Changing `graded_by` on
-- an already-graded row is precisely what protect_graded_submission refuses, and
-- the backfill is doing nothing else - it is repairing the audit field on rows
-- graded before the rule existed, not editing anyone's mark. Leaving the trigger
-- armed here makes the migration fail on its own data.
alter table public.assignment_submissions disable trigger assignment_submissions_protect_graded;

update public.assignment_submissions s
   set graded_by = a.created_by
  from public.assignments a
 where a.id = s.assignment_id
   and s.status = 'graded'
   and s.graded_by is null;

alter table public.assignment_submissions enable trigger assignment_submissions_protect_graded;

alter table public.assignment_submissions
  drop constraint if exists submission_graded_has_grader;

alter table public.assignment_submissions
  add constraint submission_graded_has_grader
  check (status <> 'graded' or graded_by is not null);
