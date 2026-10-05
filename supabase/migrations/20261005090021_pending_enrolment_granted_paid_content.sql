-- 20261005090021_pending_enrolment_granted_paid_content.sql
--
-- An unpaid learner could read every lesson in a paid course.
--
-- The cause
-- ---------
-- `is_enrolled_in` was written when `enrollment_status` had only
-- active/dropped/completed, so `status <> 'dropped'` was exactly right. Migration
-- 20261004195436 later added 'pending' to the enum, and this function was never
-- revisited. `pending` still passes `<> 'dropped'`, so it is "enrolled".
--
-- `create-checkout` inserts the enrolment as `pending` before it calls PayMongo,
-- so the row exists from the moment the learner clicks Enrol. Every policy gated
-- on `is_enrolled_in` therefore opened at that point:
--
--   modules select, lessons select, lesson_materials select (foundation.sql)
--   the private lesson-materials storage read (signed URL downloads)
--   assignment submission insert (20261005090011)
--   start_quiz_attempt, which refuses only 'dropped' (20261005090007)
--
-- Proven, not inferred. With the claims set and a pending enrolment in place:
--
--   LESSONS READABLE WITHOUT PAYING: 2      -- a PHP 1,500 course, 2 of 2 lessons
--   is_enrolled_in(pending paid course) = true
--
-- A learner who clicked Enrol and then closed the tab had the whole course.
--
-- The fix
-- -------
-- Name the statuses that mean "this learner has access": active and completed.
-- A pending enrolment is a payment in flight, and a dropped one is a withdrawal.
-- Neither is access.
--
-- `start_quiz_attempt` is corrected the same way for the same reason - it gates
-- on '<> dropped' directly rather than calling this function.

create or replace function public.is_enrolled_in(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.enrollments
    where course_id = target_course
      and student_id = auth.uid()
      and status in ('active', 'completed')
  );
$$;

comment on function public.is_enrolled_in(uuid) is
  'True only for an active or completed enrolment. A pending enrolment is a payment in flight and grants no access; see migration 20261005090021.';


-- start_quiz_attempt gated on `status = 'dropped'` in the same way, and would
-- otherwise still let an unpaid learner sit a paid quiz and be graded on it.
--
-- Only that one predicate changes. The rest of this body is copied verbatim from
-- the live definition on purpose: an earlier draft of this migration rewrote the
-- whole function from memory and silently changed its return type from uuid to
-- quiz_attempts and its attempt cap from `least(attempts_allowed, 3)` to
-- `attempts_allowed`. Both would have been invisible until a learner hit them.
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quiz       public.quizzes%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_used       integer;
  v_number     integer;
  v_attempt    uuid;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'quiz not found' using errcode = 'no_data_found';
  end if;

  if v_quiz.status <> 'published' then
    raise exception 'quiz is not published' using errcode = 'check_violation';
  end if;

  -- Unpublishing a course must not lock a student out of work already in
  -- progress, but it must also stop a new attempt being started. Enrolment
  -- already covers the "keeps access" half; this covers the other half.
  select * into v_enrollment
    from public.enrollments
    where course_id = v_quiz.course_id and student_id = auth.uid()
      and status in ('active', 'completed')
    order by enrolled_at desc
    limit 1;

  if not found then
    raise exception 'not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_used
    from public.quiz_attempts where quiz_id = p_quiz_id and student_id = auth.uid();

  if v_used >= least(v_quiz.attempts_allowed, 3) then
    raise exception 'no attempts remaining: % of % used', v_used, v_quiz.attempts_allowed
      using errcode = 'check_violation';
  end if;

  v_number := v_used + 1;

  insert into public.quiz_attempts (quiz_id, course_id, enrollment_id, student_id, attempt_number)
  values (p_quiz_id, v_quiz.course_id, v_enrollment.id, auth.uid(), v_number)
  returning id into v_attempt;

  return v_attempt;
end;
$$;


-- issue_certificate referenced `c.title` with no `c` in scope: no FROM clause
-- anywhere in that statement, and no alias `c` declared. Every claim raised
-- `missing FROM-clause entry for table "c"` after the learner had already passed
-- every completion check, so the button could never work.
--
-- This is the same defect class as migration 00010's `v_answered` collision and
-- 00002's missing `why` column: a reference that only fails at runtime, after
-- every gate has passed and the learner is looking at a success path.
create or replace function public.issue_certificate(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_existing  public.certificates%rowtype;
  v_average   numeric(5,2);
  v_title     text;
  v_number    text;
  v_id        uuid;
begin
  select * into v_enrollment
    from public.enrollments
    where course_id = p_course_id and student_id = auth.uid()
    order by enrolled_at desc
    limit 1;

  if not found then
    raise exception 'you are not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  -- A pending enrolment is a payment in flight, not a qualification.
  if v_enrollment.status not in ('active', 'completed') then
    raise exception 'you are not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from public.certificates
    where user_id = auth.uid() and course_id = p_course_id
    order by issued_at desc limit 1;

  if found then
    if v_existing.revoked_at is not null then
      raise exception 'your certificate for this course was revoked on %: %',
        v_existing.revoked_at::date, coalesce(v_existing.revoke_reason, 'no reason given')
        using errcode = 'check_violation';
    end if;
    raise exception 'you already hold a certificate for this course (%), issued %',
      v_existing.certificate_number, v_existing.issued_at::date
      using errcode = 'check_violation';
  end if;

  -- Completion is re-derived here rather than trusted from the enrolment row, so
  -- a certificate cannot be issued against a stale status.
  if not public.refresh_enrollment_completion(v_enrollment.id) and v_enrollment.status <> 'completed' then
    raise exception 'complete every requirement before claiming a certificate'
      using errcode = 'check_violation';
  end if;

  select coalesce(avg(a.percentage), 0) into v_average
    from public.quiz_attempts a
    where a.course_id = p_course_id and a.student_id = auth.uid() and a.status = 'submitted';

  -- The title is read here. It used to be read as `c.title` from an alias that
  -- did not exist in this function, which raised on every claim.
  select title into v_title from public.courses where id = p_course_id;

  v_number := 'ITH-' || upper(substr(replace(coalesce(v_title, 'COURSE'), ' ', '-'), 1, 24)) || '-' ||
              lpad(nextval('public.certificate_number_seq')::text, 6, '0');

  insert into public.certificates
    (user_id, course_id, enrollment_id, certificate_number, final_percentage)
  values (auth.uid(), p_course_id, v_enrollment.id, v_number, round(v_average, 2))
  returning id into v_id;

  return v_id;
end;
$$;
