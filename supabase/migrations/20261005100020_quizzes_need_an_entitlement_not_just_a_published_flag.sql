-- 20261005100020_quizzes_need_an_entitlement_not_just_a_published_flag.sql
--
-- Every published quiz on the platform was readable by any signed-in account.
--
-- The audit turned this up from the instructor dashboard, which reported two
-- quizzes for an instructor who teaches one course with one quiz. The second was
-- "Module 1 check" from Introduction to Programming - a course they do not teach.
--
-- Cause
-- -----
-- Migration 20261005100003 closed exactly this hole on `quiz_questions` and
-- `quiz_options`, requiring an enrolment rather than merely a published quiz. It
-- left `quizzes select` as it was:
--
--     status = 'published'
--     OR is_instructor_of(course_id)
--     OR is_admin()
--     OR is_enrolled_in(course_id)
--
-- so the parent row stayed visible to everyone. The questions and options behind it
-- were correctly withheld, which is why this went unnoticed: attempting a quiz
-- still failed with "not your course", and no content leaked. But the metadata did,
-- and metadata is not nothing here:
--
--     title, description, instructions, passing_score, attempts_allowed,
--     time_limit_minutes, max_warnings, shuffle_questions, reveal_answers
--
-- `instructions` is the instructor's own text about how the quiz is run. `passing_score`
-- tells a student what to aim for before they sit it. Both were readable by any
-- account with a session, including one with no relationship to the course at all.
--
-- It also made a real number wrong. `loadInstructorDashboard` counts quizzes, and
-- that count included other people's quizzes - so an instructor's own dashboard
-- overstated their own work.
--
-- The fix
-- -------
-- Entitlement only: ownership of the course, administration, or an enrolment. The
-- published flag stays in the *write* policy's business - publishing is what makes
-- a quiz reachable by the students enrolled in it - but on its own it is not a
-- grant.
--
-- Nothing that legitimately reads a quiz loses access:
--
--   student taking a quiz     they are enrolled, via is_enrolled_in
--   student listing a course  enrolled, same reason
--   the instructor's own      is_instructor_of
--   an admin                  is_admin
--   start_quiz_attempt        SECURITY DEFINER, and checks enrolment itself
--   get_attempt_questions     SECURITY DEFINER, checks attempt ownership
--   quiz_briefing             SECURITY DEFINER, and filters on is_enrolled_in
--   quiz_with_answers         SECURITY DEFINER, and checks is_instructor_of
--
-- Verified after: the instructor's quiz count drops to the one they own, and a
-- non-enrolled student reads no published quiz rows at all.

drop policy if exists "quizzes select" on public.quizzes;

create policy "quizzes select" on public.quizzes
  for select
  to authenticated
  using (
    public.is_instructor_of(course_id)
    or public.is_admin()
    or public.is_enrolled_in(course_id)
  );

comment on policy "quizzes select" on public.quizzes is
  'Ownership, administration or enrolment - never "the quiz is published". The published flag decides who a quiz is reachable by; it is not itself a grant to read it.';