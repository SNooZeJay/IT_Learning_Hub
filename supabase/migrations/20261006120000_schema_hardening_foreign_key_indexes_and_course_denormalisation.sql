-- Schema hardening: index every foreign key, and stop two denormalised
-- course_id columns from drifting away from their parent.
--
-- Why these two things together
-- -----------------------------
-- They are both consequences of the same shape: `assignment_submissions` and
-- `quiz_attempts` each store the course id *as well as* a foreign key to the row
-- that already knows it. That is deliberate denormalisation - it lets a single
-- filtered read answer "every quiz attempt in this course" without joining through
-- quizzes - and the data was correct when checked. But nothing enforced it. The
-- column is writable by any client that can insert the row, so a submission or an
-- attempt could name a course its parent does not belong to, and the only symptom
-- would be a quiz attempt that appears under one course in a list and another in a
-- report.
--
-- So the parent is now the authority: a BEFORE trigger overwrites the child's
-- course_id from its parent, and an AFTER trigger on the parent fans a course move
-- out to its children. The child column survives as a read optimisation, and can no
-- longer disagree.
--
-- The indexes are the boring half and matter more than they look. Postgres does not
-- index the referencing side of a foreign key automatically. Every `on delete
-- cascade` from `courses` down through modules, lessons, materials, questions and
-- attempts was doing a sequential scan per child table, and every RLS policy that
-- filters on one of these columns was scanning too. 43 of 54 foreign keys had no
-- index with that column in the leading position; `profiles.id` is skipped because it
-- is already the primary key.

-- ---------------------------------------------------------------------------
-- 1. Indexes on the referencing side of every foreign key
-- ---------------------------------------------------------------------------

create index if not exists idx_activity_logs_actor_id on public.activity_logs (actor_id);
create index if not exists idx_analytics_events_user_id on public.analytics_events (user_id);
create index if not exists idx_announcements_author_id on public.announcements (author_id);
create index if not exists idx_announcements_course_id on public.announcements (course_id);
create index if not exists idx_assignment_submissions_graded_by on public.assignment_submissions (graded_by);
create index if not exists idx_assignment_submissions_assignment_id on public.assignment_submissions (assignment_id);
create index if not exists idx_assignment_submissions_course_id on public.assignment_submissions (course_id);
create index if not exists idx_assignments_course_id on public.assignments (course_id);
create index if not exists idx_assignments_created_by on public.assignments (created_by);
create index if not exists idx_assignments_module_id on public.assignments (module_id);
create index if not exists idx_certificates_user_id on public.certificates (user_id);
create index if not exists idx_certificates_revoked_by on public.certificates (revoked_by);
create index if not exists idx_certificates_enrollment_id on public.certificates (enrollment_id);
create index if not exists idx_conversation_messages_conversation_id on public.conversation_messages (conversation_id);
create index if not exists idx_conversation_messages_sender_id on public.conversation_messages (sender_id);
create index if not exists idx_conversation_participants_conversation_id on public.conversation_participants (conversation_id);
create index if not exists idx_conversations_created_by on public.conversations (created_by);
create index if not exists idx_course_instructors_course_id on public.course_instructors (course_id);
create index if not exists idx_course_requirements_course_id on public.course_requirements (course_id);
create index if not exists idx_courses_created_by on public.courses (created_by);
create index if not exists idx_courses_category_id on public.courses (category_id);
create index if not exists idx_enrollments_course_id on public.enrollments (course_id);
create index if not exists idx_lesson_materials_lesson_id on public.lesson_materials (lesson_id);
create index if not exists idx_lesson_materials_uploaded_by on public.lesson_materials (uploaded_by);
create index if not exists idx_lesson_progress_enrollment_id on public.lesson_progress (enrollment_id);
create index if not exists idx_lesson_progress_student_id on public.lesson_progress (student_id);
create index if not exists idx_lessons_module_id on public.lessons (module_id);
create index if not exists idx_modules_course_id on public.modules (course_id);
create index if not exists idx_notifications_user_id on public.notifications (user_id);
create index if not exists idx_payment_events_payment_id on public.payment_events (payment_id);
create index if not exists idx_payments_enrollment_id on public.payments (enrollment_id);
create index if not exists idx_payments_student_id on public.payments (student_id);
create index if not exists idx_quiz_answers_attempt_id on public.quiz_answers (attempt_id);
create index if not exists idx_quiz_answers_selected_option_id on public.quiz_answers (selected_option_id);
create index if not exists idx_quiz_attempts_enrollment_id on public.quiz_attempts (enrollment_id);
create index if not exists idx_quiz_attempts_course_id on public.quiz_attempts (course_id);
create index if not exists idx_quiz_options_question_id on public.quiz_options (question_id);
create index if not exists idx_quiz_questions_quiz_id on public.quiz_questions (quiz_id);
create index if not exists idx_quiz_text_answers_question_id on public.quiz_text_answers (question_id);
create index if not exists idx_quizzes_course_id on public.quizzes (course_id);
create index if not exists idx_quizzes_created_by on public.quizzes (created_by);
create index if not exists idx_quizzes_lesson_id on public.quizzes (lesson_id);
create index if not exists idx_quizzes_module_id on public.quizzes (module_id);

-- ---------------------------------------------------------------------------
-- 2. The parent decides the course
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the trigger can read `quizzes` and `assignments` even when the
-- writing role is not entitled to select them. It reads exactly one column of one row
-- and writes nothing, so it grants no capability the caller did not already have.
create or replace function public.sync_submission_course()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select a.course_id into new.course_id
  from public.assignments a
  where a.id = new.assignment_id;

  -- A null assignment_id is not a licence to keep whatever the client sent. The
  -- column is not null, so this fails loudly at the constraint rather than storing
  -- an orphan course.
  if new.course_id is null then
    raise exception 'submission % names an assignment that does not exist', new.assignment_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

create or replace function public.sync_attempt_course()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select q.course_id into new.course_id
  from public.quizzes q
  where q.id = new.quiz_id;

  if new.course_id is null then
    raise exception 'attempt % names a quiz that does not exist', new.quiz_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists assignment_submissions_sync_course on public.assignment_submissions;
create trigger assignment_submissions_sync_course
  before insert or update of assignment_id, course_id on public.assignment_submissions
  for each row execute function public.sync_submission_course();

drop trigger if exists quiz_attempts_sync_course on public.quiz_attempts;
create trigger quiz_attempts_sync_course
  before insert or update of quiz_id, course_id on public.quiz_attempts
  for each row execute function public.sync_attempt_course();

-- Moving a quiz or an assignment between courses has to carry its children with it,
-- or the BEFORE trigger above would only fire the next time a child was written and
-- leave the existing rows stale in the meantime.
create or replace function public.propagate_quiz_course_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.course_id is distinct from old.course_id then
    update public.quiz_attempts set course_id = new.course_id where quiz_id = new.id;
  end if;
  return null;
end;
$$;

create or replace function public.propagate_assignment_course_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.course_id is distinct from old.course_id then
    update public.assignment_submissions set course_id = new.course_id where assignment_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists quizzes_propagate_course on public.quizzes;
create trigger quizzes_propagate_course
  after update of course_id on public.quizzes
  for each row execute function public.propagate_quiz_course_move();

drop trigger if exists assignments_propagate_course on public.assignments;
create trigger assignments_propagate_course
  after update of course_id on public.assignments
  for each row execute function public.propagate_assignment_course_move();

-- ---------------------------------------------------------------------------
-- 3. Repair any drift that predates this migration
-- ---------------------------------------------------------------------------

update public.quiz_attempts a
set course_id = q.course_id
from public.quizzes q
where a.quiz_id = q.id and a.course_id is distinct from q.course_id;

update public.assignment_submissions s
set course_id = a.course_id
from public.assignments a
where s.assignment_id = a.id and s.course_id is distinct from a.course_id;

comment on function public.sync_submission_course() is
  'Derives assignment_submissions.course_id from the parent assignment. The column is a read optimisation, never a client-supplied fact.';
comment on function public.sync_attempt_course() is
  'Derives quiz_attempts.course_id from the parent quiz. The column is a read optimisation, never a client-supplied fact.';
