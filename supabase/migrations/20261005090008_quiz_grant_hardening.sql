-- 20261005090008_quiz_grant_hardening.sql
--
-- Corrects a grant defect in 20261005090007.
--
-- What went wrong
-- ---------------
-- Supabase's default ACL grants `authenticated` ALL privileges on every newly
-- created table. That arrives as a TABLE-level SELECT, and Postgres unions
-- table-level and column-level privileges rather than intersecting them. So the
-- column-level grants in 0007 - the ones withholding `quiz_options.is_correct`,
-- `quiz_questions.explanation` and `quiz_text_answers.accepted_answer` - were
-- additive to a grant that already covered every column, and withheld nothing.
--
-- This was not theoretical. Verified against information_schema.column_privileges
-- immediately after 0007 applied:
--
--   quiz_options       readable by authenticated: ..., is_correct, ...
--   quiz_questions     readable by authenticated: ..., explanation, ...
--   quiz_text_answers  readable by authenticated: accepted_answer, ...
--
-- Any signed-in student could read every answer key in the course with a single
-- REST call. RLS was never the thing being bypassed - the columns were simply
-- granted.
--
-- The fix is to REVOKE the table-level grant first, then grant the safe columns.
-- Order matters: granting columns before revoking the table leaves the table
-- grant in force.
--
-- 0007 has been corrected in place as well, so a fresh `db reset` does not need
-- this file to reach the correct state. It exists because the live database has
-- already run the original 0007, and editing an applied migration does not
-- change what ran.

alter table public.quizzes           enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_options      enable row level security;
alter table public.quiz_text_answers enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.quiz_answers      enable row level security;

-- anon: no access to any assessment table.
revoke all on public.quizzes           from anon;
revoke all on public.quiz_questions    from anon;
revoke all on public.quiz_options      from anon;
revoke all on public.quiz_text_answers from anon;
revoke all on public.quiz_attempts     from anon;
revoke all on public.quiz_answers      from anon;

-- authenticated: drop the blanket grant the default ACL applied, then rebuild it
-- from columns that are safe to hand to a student.
revoke all on public.quizzes           from authenticated;
revoke all on public.quiz_questions    from authenticated;
revoke all on public.quiz_options      from authenticated;
revoke all on public.quiz_text_answers from authenticated;
revoke all on public.quiz_attempts     from authenticated;
revoke all on public.quiz_answers      from authenticated;

grant select on public.quizzes to authenticated;
grant insert, update, delete on public.quizzes to authenticated;

grant select (id, quiz_id, question_type, prompt, points, position, created_at, updated_at)
  on public.quiz_questions to authenticated;
grant insert, update, delete on public.quiz_questions to authenticated;

-- No is_correct. The answer key for a multiple-choice question.
grant select (id, question_id, option_text, position)
  on public.quiz_options to authenticated;
grant insert, update, delete on public.quiz_options to authenticated;

-- No grant of any kind: every column here is an accepted answer. Instructors read
-- them through quiz_with_answers, which is SECURITY DEFINER and checks that the
-- caller teaches the course.
grant insert, update, delete on public.quiz_text_answers to authenticated;

grant select on public.quiz_attempts to authenticated;
-- Insert only. A student must not be able to `update quiz_attempts set passed =
-- true`, which RLS already refuses and the absence of an UPDATE grant now also
-- makes impossible at the GRANT layer.
grant insert on public.quiz_attempts to authenticated;

-- A student's own graded answers, which is what the results screen renders.
grant select on public.quiz_answers to authenticated;

-- service_role bypasses RLS and is used by trusted server code. It keeps
-- everything; nothing above restricts it.
grant all on public.quizzes           to service_role;
grant all on public.quiz_questions    to service_role;
grant all on public.quiz_options      to service_role;
grant all on public.quiz_text_answers to service_role;
grant all on public.quiz_attempts     to service_role;
grant all on public.quiz_answers      to service_role;
