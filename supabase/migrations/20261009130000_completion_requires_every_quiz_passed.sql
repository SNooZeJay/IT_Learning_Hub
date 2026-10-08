-- A course completed without passing its quiz, because nothing required it.
--
-- The gap logic already understood quizzes. No course ever asked. Every one of the five
-- carried only `complete_all_lessons`, so finishing the readings marked the enrolment
-- completed, the completion trigger issued a certificate, and a student who had never
-- opened the quiz held a certificate for the course. The three places that decide
-- "completed" - `refresh_enrollment_completion`, `issue_certificate` and the trigger that
-- issues on completion - all read this one function, so fixing it here fixes all three at
-- once. There is no second completion rule to keep in step.
--
-- `pass_all_quizzes` is per quiz, not an average. `min_quiz_average` exists and was never
-- used either, and it is the wrong shape: a student scoring 100 on one quiz of two and 0
-- on the other averages 50, which reads as "partly done" when what happened is that one
-- quiz was never passed. The brief is "every required quiz passed", so that is what this
-- counts, and the gap names the quizzes so the learner is told which one is outstanding.
--
-- Attached to every course that has a published quiz, and only to those. A course with no
-- quiz must not be blocked by a rule about quizzes.
--
-- Re-audited afterwards: no existing completion was unjustified. Two students hold
-- certificates; Joren's Introduction to Programming has a passing attempt behind it and
-- Justine's IT Support Essentials has no quizzes to fail. Nothing was revoked. Joren's
-- Networking Fundamentals was a genuine miss - lessons and quiz both done, enrolment still
-- `active` because nothing had called refresh - and is now correctly completed with its
-- certificate.
alter type public.requirement_type add value if not exists 'pass_all_quizzes';

create or replace function public.course_completion_gaps(p_enrollment_id uuid)
returns TABLE(requirement requirement_type, detail text)
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $fn$
  with e as (
    select en.id, en.course_id, en.student_id
    from public.enrollments en
    where en.id = p_enrollment_id
      -- The caller must be this student, an administrator, or the course's instructor.
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
  quiz_gap as (
    -- One row per published quiz this student has no passing attempt for.
    --
    -- `passed` is the column the grader wrote, not a percentage recomputed here: the
    -- pass mark lives on the quiz, so recomputing it in the gap function would be a second
    -- definition of "passed" that could disagree with the one that graded the attempt.
    select coalesce(string_agg(q.title, ', ' order by q.title), '') as names,
           count(*)::int as outstanding
      from public.quizzes q
     where q.course_id = (select course_id from e)
       and q.status = 'published'
       and not exists (
         select 1
           from public.quiz_attempts a
          where a.quiz_id = q.id
            and a.student_id = (select student_id from e)
            and a.status = 'submitted'
            and a.passed
       )
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
        (select format('%s of %s lessons complete', lessons_done, lessons) from totals)
      when 'pass_all_quizzes' then
        (select format('not passed yet: %s', names) from quiz_gap where outstanding > 0)
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
      (r.requirement_type = 'pass_all_quizzes'
        and (select outstanding from quiz_gap) > 0)
      or
      (r.requirement_type = 'min_quiz_average'
        and (select avg_pct from quiz_avg) < r.threshold)
      or
      (r.requirement_type = 'submit_all_assignments'
        and (select graded from assignment_totals) < (select published from assignment_totals))
    );
$fn$;

comment on function public.course_completion_gaps(uuid) is
  'Every requirement this enrolment has not yet met, named. Returns no rows when the course is complete. This is the single source of truth: refresh_enrollment_completion, issue_certificate and the completion trigger all read it, so a completion and a certificate cannot disagree.';

-- Every course that can be assessed now says so. A course with no quiz is not given the
-- rule, because a rule about quizzes must not block a course that has none.
insert into public.course_requirements (course_id, requirement_type)
select q.course_id, 'pass_all_quizzes'
  from public.quizzes q
 where q.status = 'published'
 group by q.course_id
having not exists (
  select 1 from public.course_requirements cr
   where cr.course_id = q.course_id
     and cr.requirement_type = 'pass_all_quizzes'
);

-- Re-evaluate everything, so a course that is genuinely finished is completed now rather
-- than on the next unrelated write.
--
-- Only `active` rows are touched. A `dropped` enrolment is never completed by finishing
-- work, and a `pending` one has not paid yet. `refresh_enrollment_completion` only ever
-- promotes a row, so this cannot demote anything: a completion that turns out to be
-- unjustified is corrected by `revoke_certificate` and an explicit status change, not by a
-- bulk re-evaluation that would also un-complete the courses that are right.
do $$
declare
  r record;
begin
  for r in
    select e.id, e.student_id
      from public.enrollments e
     where e.status = 'active'
  loop
    begin
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', r.student_id::text, 'role', 'authenticated')::text,
        true
      );
      perform public.refresh_enrollment_completion(r.id);
    exception when others then
      -- One enrolment that cannot be evaluated must not stop the rest of the sweep.
      raise notice 'could not re-evaluate enrolment %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;