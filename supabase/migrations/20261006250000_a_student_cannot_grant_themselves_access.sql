-- Six ways a student could grant themselves access they had not paid for, earned, or been
-- given. Every one of these was reproduced against the live database as the role, in a
-- rolled-back transaction, before being fixed here.
--
-- ===========================================================================================
-- 1. A student could activate their own unpaid enrolment
-- ===========================================================================================
--
-- `enrollments update` allowed `student_id = auth.uid()` on both USING and WITH CHECK, and
-- the WITH CHECK never mentioned `status`:
--
--     using     : (student_id = auth.uid()) or is_admin() or is_instructor_of(course_id)
--     with check: (student_id = auth.uid()) or is_admin() or is_instructor_of(course_id)
--
-- The price check that makes a paid course unbypassable exists only on the INSERT policy.
-- So one statement unlocked a paid course:
--
--     update enrollments set status = 'active' where student_id = auth.uid() and status = 'pending';
--
-- Reproduced, as Shan Lee Kian Garmino, whose enrolments were pending:
--
--     before: Advanced Python Development     pending  P1,500  is_enrolled_in = false
--     after:  Advanced Python Development     active   P1,500  is_enrolled_in = true
--     after:  CompTIA Security+ Preparation   active   P2,500  is_enrolled_in = true
--
-- `is_enrolled_in` is the gate on modules, lessons, lesson materials, the private
-- lesson-materials bucket, and `start_quiz_attempt`. This was a total payment bypass.
--
-- The fix is a trigger rather than a narrower policy, because the policy cannot see the
-- old row and this check is entirely about the difference between old and new. The one
-- write a student legitimately makes is `enrollment.service.ts:97`, dropping their own
-- place, so that is what is permitted.
--
-- ===========================================================================================
-- 2. A student could insert a submission that was already graded
-- ===========================================================================================
--
-- `protect_graded_submission` was `BEFORE UPDATE`, so its entire body was skipped on
-- INSERT, and the insert policy constrains only `student_id` and enrolment:
--
--     with check: (student_id = auth.uid()) and is_enrolled_in(course_id)
--
-- Reproduced, as Joren Lalamonan, on a 50-point assignment:
--
--     insert into assignment_submissions
--       (..., status, grade, graded_by, graded_at)
--     values (..., 'graded', 999, auth.uid(), now())
--     returning status, grade, graded_by;
--
--     status = graded   grade = 999.00   graded_by is Joren = true
--
-- No instructor was involved at any point. `protect_graded_submission` already had the
-- right rule and the max_points ceiling; it just was not attached to the INSERT path.
--
-- The same trigger fires on INSERT now. `OLD` reads as all-NULL there, so `new.grade is
-- distinct from old.grade` is true exactly when a grade is being supplied - which is the
-- test we want. `course_id` is read as `coalesce(old.course_id, new.course_id)` so an
-- instructor grading by upsert is still recognised as entitled.
--
-- ===========================================================================================
-- 3. One student's work completed a course for every student in it
-- ===========================================================================================
--
-- `course_completion_gaps(p_enrollment_id)` counted, for every requirement:
--
--     lessons_done  - every completed lesson_progress row in the course
--     avg_pct       - the average of every submitted quiz attempt in the course
--     graded        - every graded submission in the course
--
-- and contained no `auth.uid()` and no `student_id` anywhere. Its sibling
-- `issue_certificate` scopes its own average with `a.student_id = auth.uid()`; this one
-- did not. So the "0 of 12 lessons complete" a student saw was the whole cohort's count,
-- and one student's work - or one forged row from finding 2 - satisfied everyone's
-- requirement and unlocked a certificate for all of them.
--
-- Each count is now scoped to the enrolment's own student, and the caller must be that
-- student, an administrator, or an instructor of the course.
--
-- ===========================================================================================
-- 4. Any authenticated user could complete another student's enrolment
-- ===========================================================================================
--
-- `refresh_enrollment_completion` is SECURITY DEFINER and took any enrolment id:
--
--     select * into v_enrollment from enrollments where id = p_enrollment_id;
--     ...
--     update enrollments set status = 'completed' ...
--
-- Being SECURITY DEFINER it bypasses `enrollments` RLS, and nothing in the body checked
-- who was asking. Combined with finding 3 that is a remote certificate for anybody: pass
-- an id, get zero gaps, get completed.
--
-- ===========================================================================================
-- 5. A participant could move themselves into another conversation
-- ===========================================================================================
--
-- The policy is named `mark read` but gates only on `user_id`:
--
--     using     : (user_id = auth.uid())
--     with check: (user_id = auth.uid())
--
-- and `conversation_id` is UPDATEable. Moving your own row to a conversation you are not in
-- makes `is_participant_in` true there, which satisfies `messages select`. Reproduced as
-- Joren Lalamonan, moving her row into a thread she was not party to:
--
--     messages of that thread she could read, before : 0
--     messages of that thread she could read, after  : 1
--
-- RLS cannot compare old and new either, but this one does not need to: the only column a
-- participant ever legitimately updates is `last_read_at`. So the grant is narrowed to
-- that column instead of the table. `conversation_id` becomes unnameable.
--
-- ===========================================================================================
-- 6. lesson_progress was written against any enrolment
-- ===========================================================================================
--
-- `lesson_progress own write` is `FOR ALL` on `student_id = auth.uid()`, and
-- `enrollment_id` is INSERT/UPDATEable. The table comment says ownership is "resolved
-- through the parent enrollment, not by storing student_id twice" - and then the write
-- policy resolved it through the denormalised column instead, never checking the parent.
--
-- `curriculum.service.ts` sends `student_id` from the client, so the value the policy
-- compares is one the client chose. A student could plant `status = 'completed'` rows on
-- another student's enrolment, which - with finding 3 - completed the lesson requirement
-- for the cohort.
--
-- A trigger now requires the denormalised column to agree with the parent, which is what
-- the comment already claimed.
--
-- ===========================================================================================

-- -------------------------------------------------------------------------------------------
-- 1. Enrolment entitlement
-- -------------------------------------------------------------------------------------------

create or replace function public.protect_enrollment_entitlement()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- An administrator or the course's instructor manages enrolments properly.
  if public.is_admin() or public.is_instructor_of(old.course_id) then
    return new;
  end if;

  -- The one completion a student is entitled to, and only when the server decided it.
  -- `refresh_enrollment_completion` sets this flag immediately before its own UPDATE, and
  -- only after checking that the caller owns the enrolment and that every requirement is
  -- genuinely met. Both of those checks live in that function; the flag is only what lets
  -- its write get past this trigger.
  --
  -- A flag rather than allowing `active -> completed` outright, because a plain UPDATE
  -- setting `completed` would otherwise be enough to move an enrolment into the state
  -- that issues a certificate. `set_config(..., true)` is transaction-local so it cannot
  -- outlive the call that set it. It is a narrowing of what a trigger must allow, not a
  -- grant of trust in the GUC - a caller can set the same GUC, which is exactly why the
  -- ownership and requirement checks stay where they are.
  if current_setting('app.enrollment_completion', true) = 'on'
     and new.status = 'completed'
     and old.status = 'active'
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id
     and new.activated_at is not distinct from old.activated_at then
    return new;
  end if;

  -- Nothing that grants access changed. Written first so that a no-op update, or one that
  -- only touches `updated_at` via set_updated_at, is not mistaken for an attack.
  if new.status is not distinct from old.status
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id
     and new.enrolled_at is not distinct from old.enrolled_at
     and new.completed_at is not distinct from old.completed_at
     and new.activated_at is not distinct from old.activated_at
     and new.cancelled_at is not distinct from old.cancelled_at then
    return new;
  end if;

  -- Dropping one's own place is the one write a student has. `enrollment.service.ts`
  -- does exactly this and nothing else.
  if new.status = 'dropped'
     and old.status is distinct from 'dropped'
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id then
    new.completed_at := null;
    new.cancelled_at := coalesce(new.cancelled_at, now());
    return new;
  end if;

  raise exception
    'a student cannot change the status, course or timing of an enrolment; dropping it is allowed'
    using errcode = '42501';
end;
$$;

comment on function public.protect_enrollment_entitlement() is
  'A student may drop their own enrolment and change nothing else about it. Without this, one UPDATE turned a pending unpaid enrolment into an active one and unlocked a paid course through is_enrolled_in. RLS cannot express this because the rule is entirely about the difference between OLD and NEW.';

drop trigger if exists enrollments_protect_entitlement on public.enrollments;
create trigger enrollments_protect_entitlement
  before update on public.enrollments
  for each row execute function public.protect_enrollment_entitlement();

-- -------------------------------------------------------------------------------------------
-- 2. A submission cannot arrive already graded
-- -------------------------------------------------------------------------------------------

create or replace function public.protect_graded_submission()
returns trigger
language plpgsql
as $$
declare
  v_course uuid;
begin
  -- OLD is all-NULL on INSERT, so `coalesce(old.course_id, new.course_id)` is the course
  -- of the row being written on either path.
  v_course := coalesce(old.course_id, new.course_id);

  -- The grading record belongs to the instructor. This runs before the existing
  -- "already graded" guard so that a student cannot reach the graded state in the
  -- first place and then be protected by it.
  if (new.grade is distinct from old.grade
      or new.feedback is distinct from old.feedback
      or new.graded_by is distinct from old.graded_by
      or new.graded_at is distinct from old.graded_at)
     and not (public.is_instructor_of(v_course) or public.is_admin()) then
    raise exception 'only an instructor of this course can grade a submission'
      using errcode = '42501';
  end if;

  -- `OLD` is NULL on INSERT, so this block - which is about replacing graded work - is
  -- naturally skipped there.
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

-- Was UPDATE only, which is why an INSERT could arrive already graded.
drop trigger if exists assignment_submissions_protect_graded on public.assignment_submissions;
create trigger assignment_submissions_protect_graded
  before insert or update on public.assignment_submissions
  for each row execute function public.protect_graded_submission();

-- -------------------------------------------------------------------------------------------
-- 3. Completion gaps belong to one student
-- -------------------------------------------------------------------------------------------

create or replace function public.course_completion_gaps(p_enrollment_id uuid)
returns table (requirement requirement_type, detail text)
language sql
stable
security definer
set search_path to 'public', pg_temp
as $$
  with e as (
    select en.id, en.course_id, en.student_id
    from public.enrollments en
    where en.id = p_enrollment_id
      -- The caller must be this student, an administrator, or the course's instructor.
      -- `issue_certificate` scopes its average the same way.
      and (
        en.student_id = auth.uid()
        or public.is_admin()
        or public.is_instructor_of(en.course_id)
      )
  ),
  totals as (
    select
      (select count(*) from public.lessons l
         join public.modules m on m.id = l.module_id
        where m.course_id = e.course_id) as lessons,
      -- Scoped to this student. Previously it counted every completed row in the course,
      -- so one student's work reported every student as finished.
      (select count(*) from public.lesson_progress lp
         join public.lessons l on l.id = lp.lesson_id
         join public.modules m on m.id = l.module_id
        where m.course_id = e.course_id
          and lp.status = 'completed'
          and lp.student_id = e.student_id) as lessons_done
    from e
  ),
  quiz_avg as (
    select coalesce(avg(a.percentage), 0) as avg_pct
    from public.quiz_attempts a
    where a.course_id = (select course_id from e)
      and a.status = 'submitted'
      and a.student_id = (select student_id from e)
  ),
  assignment_totals as (
    select
      (select count(*) from public.assignments a
        where a.course_id = (select course_id from e) and a.status = 'published') as published,
      (select count(*) from public.assignment_submissions s
        where s.course_id = (select course_id from e)
          and s.status = 'graded'
          and s.student_id = (select student_id from e)) as graded
  )
  select r.requirement_type,
    case r.requirement_type
      when 'complete_all_lessons' then
        (select format('%s of %s lessons complete',
          (select lessons_done from totals), (select lessons from totals)) from totals)
      when 'min_quiz_average' then
        format('quiz average %s%%, needs %s%%',
          round((select avg_pct from quiz_avg), 1), r.threshold)
      when 'submit_all_assignments' then
        format('%s of %s assignments graded',
          (select graded from assignment_totals), (select published from assignment_totals))
    end
  from public.course_requirements r
  where r.course_id = (select course_id from e)
    and (
      (r.requirement_type = 'complete_all_lessons'
        and (select lessons from totals) > 0
        and (select lessons_done from totals) < (select lessons from totals))
      or
      (r.requirement_type = 'min_quiz_average'
        and (select avg_pct from quiz_avg) < r.threshold)
      or
      (r.requirement_type = 'submit_all_assignments'
        and (select graded from assignment_totals) < (select published from assignment_totals))
    );
$$;

comment on function public.course_completion_gaps(uuid) is
  'Requirements not yet met by THIS student, for THIS enrolment. Every count is filtered by the enrolment''s student_id and the caller must be that student, an administrator, or an instructor of the course. It previously contained neither auth.uid() nor student_id, so one student''s completed lessons, quiz attempts and graded submissions satisfied the requirement for every enrolled student and unlocked a certificate for all of them.';

revoke execute on function public.course_completion_gaps(uuid) from anon;
grant execute on function public.course_completion_gaps(uuid) to authenticated;

-- -------------------------------------------------------------------------------------------
-- 4. Only the owner may ask whether their own enrolment is complete
-- -------------------------------------------------------------------------------------------

create or replace function public.refresh_enrollment_completion(p_enrollment_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', pg_temp
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_gaps      integer;
begin
  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if not found then
    return false;
  end if;

  -- SECURITY DEFINER bypasses the enrollments policies, so ownership is checked here.
  -- Without this, any authenticated user could pass any enrolment id and complete it -
  -- and with course_completion_gaps cohort-wide that produced a certificate.
  if not (
    v_enrollment.student_id = auth.uid()
    or public.is_admin()
    or public.is_instructor_of(v_enrollment.course_id)
  ) then
    raise exception 'you may only refresh your own enrolment'
      using errcode = '42501';
  end if;

  -- A dropped enrolment is never completed by finishing the work. Re-enrolling
  -- is the route back.
  if v_enrollment.status = 'dropped' or v_enrollment.status = 'pending' then
    return false;
  end if;

  select count(*) into v_gaps from public.course_completion_gaps(p_enrollment_id);

  if v_gaps = 0 and v_enrollment.status = 'active' then
    -- Lets this function's own write past protect_enrollment_entitlement, which allows a
    -- student to drop their enrolment and nothing else. Transaction-local, and set
    -- immediately before the one statement it authorises.
    perform set_config('app.enrollment_completion', 'on', true);
    update public.enrollments
       set status = 'completed', completed_at = coalesce(completed_at, now())
     where id = p_enrollment_id;
    return true;
  end if;

  return false;
end;
$$;

revoke execute on function public.refresh_enrollment_completion(uuid) from anon;
grant execute on function public.refresh_enrollment_completion(uuid) to authenticated;

-- -------------------------------------------------------------------------------------------
-- 5. A participant can move their read marker and nothing else
-- -------------------------------------------------------------------------------------------

-- Column-level, because the only write a participant ever makes is `last_read_at` and
-- narrowing the grant makes `conversation_id` unnameable. A narrower policy could not do
-- this: WITH CHECK sees the new row but not the old one.
revoke update on public.conversation_participants from authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

-- `FOR ALL` included SELECT, which the select policy already governs; granting only the
-- two write columns keeps `FOR ALL` working for insert and leaves select to its policy.
grant insert on public.conversation_participants to authenticated;

-- -------------------------------------------------------------------------------------------
-- 6. lesson_progress must agree with its parent enrolment
-- -------------------------------------------------------------------------------------------

create or replace function public.sync_lesson_progress_student()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
begin
  select e.student_id into v_owner
  from public.enrollments e
  where e.id = coalesce(new.enrollment_id, old.enrollment_id);

  if v_owner is null then
    raise exception 'the enrolment for this progress row does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  -- `lesson_progress.student_id` is denormalised so the read policies are a column
  -- comparison. It is written by the client, so it has to agree with the parent or the
  -- denormalisation is just a client-supplied claim.
  if new.student_id is distinct from v_owner then
    raise exception 'progress belongs to the student who owns the enrolment'
      using errcode = '42501';
  end if;

  new.student_id := v_owner;
  return new;
end;
$$;

comment on function public.sync_lesson_progress_student() is
  'Forces lesson_progress.student_id to match the parent enrolment. The write policy compared that column to auth.uid(), and the client supplies it, so a student could write progress against any enrolment - including another student''s - by choosing the value.';

drop trigger if exists lesson_progress_sync_student on public.lesson_progress;
create trigger lesson_progress_sync_student
  before insert or update on public.lesson_progress
  for each row execute function public.sync_lesson_progress_student();