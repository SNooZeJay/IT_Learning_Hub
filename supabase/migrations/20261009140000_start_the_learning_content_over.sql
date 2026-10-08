-- Clear every piece of learning content, so the catalogue can be rebuilt from nothing.
--
-- This is deliberately destructive and deliberately narrow. It removes courses and
-- everything that hangs off them, and it touches nothing else:
--
--   kept  profiles, auth.users, platform_settings   -- the cast of demo accounts
--   kept  conversations and their messages          -- not learning content
--   kept  announcements, with their course detached -- communication, not content
--   gone  courses, curriculum, assessments, student work, and the money trail
--
-- Why detach announcements instead of letting them cascade: `announcements.course_id`
-- is ON DELETE CASCADE, so deleting the courses would silently destroy them. They are
-- an authoring feature that still needs to be demonstrable, and nothing about them
-- belongs to a particular course. Detaching keeps the feature alive and leaves no row
-- pointing at a course that no longer exists.
--
-- Why delete the leaves explicitly rather than delete `courses` and let ON DELETE
-- CASCADE do the work: the cascade order is correct but implicit, and a reader of this
-- file should be able to see every table that is emptied without tracing foreign keys.
--
-- Notifications are derived state. Every row here was produced by a trigger reacting
-- to a course, enrolment, quiz or certificate that no longer exists, and each one's body
-- names content that has been destroyed. They are rebuilt along with the content.

begin;

-- Communication survives its course. A notice is worth reading whether or not the
-- course it was written against is still running.
update public.announcements set course_id = null where course_id is not null;

-- Every notification in the system was emitted by one of the events below.
delete from public.notifications;

-- The money trail. payment_events first because it points at payments; receipts
-- because they cascade from payments but are named here so the set is explicit.
-- This also removes the `unusable:44136fa3...` row recorded by an unsigned probe
-- request that carried no event type.
delete from public.payment_events;
delete from public.payment_receipts;
delete from public.payments;

-- Certificates, before enrolments: certificates.enrollment_id is SET NULL, so the
-- certificate would outlive its enrolment and point at nothing.
delete from public.certificates;

-- Student work. assignment_submissions references both assignments and enrolments;
-- quiz_answers reference both attempts and options.
delete from public.assignment_submissions;
delete from public.quiz_answers;
delete from public.quiz_text_answers;
delete from public.quiz_options;
delete from public.quiz_questions;
delete from public.quiz_attempts;
delete from public.lesson_progress;

-- Curriculum. Materials and progress reference lessons; lessons and progress
-- reference modules.
delete from public.lesson_materials;
delete from public.lessons;

-- Assessments hang off a course, and optionally off a module or a lesson.
-- The module and lesson references are SET NULL, so these may go either side of
-- the curriculum; they are deleted before modules so nothing is left orphaned.
delete from public.assignments;
delete from public.quizzes;
delete from public.modules;

-- Course-level configuration and staffing.
delete from public.course_requirements;
delete from public.course_instructors;

-- Enrolments last of the student-facing tables: progress, attempts, submissions,
-- payments and certificates all reference one.
delete from public.enrollments;

delete from public.courses;
delete from public.course_categories;

commit;

-- ===========================================================================
-- Proof that the wipe was complete.
--
-- These are the failures that a partial wipe produces: content that survived, and
-- content that outlived the row it belonged to. Every count below must be zero.
-- ===========================================================================

do $$
declare
  v_label text;
  v_found bigint;
begin
  -- Tables that must be empty afterwards.
  foreach v_label in array array[
    'payment_events', 'payment_receipts', 'payments', 'certificates',
    'assignment_submissions', 'quiz_answers', 'quiz_text_answers',
    'quiz_options', 'quiz_questions', 'quiz_attempts', 'lesson_progress',
    'lesson_materials', 'lessons', 'assignments', 'quizzes', 'modules',
    'course_requirements', 'course_instructors', 'enrollments', 'courses',
    'course_categories', 'notifications'
  ]
  loop
    execute format('select count(*) from public.%I', v_label) into v_found;
    if v_found <> 0 then
      raise exception 'wipe incomplete: %.% still has % row(s)', 'public', v_label, v_found;
    end if;
  end loop;

  -- Nothing anywhere may still point at a course.
  if exists (select 1 from public.courses) then
    raise exception 'wipe incomplete: a course survived';
  end if;

  -- The accounts must have survived. Six of them, and losing one would leave
  -- enrolments and content that nobody can sign in to reach.
  select count(*) into v_found from public.profiles;
  if v_found = 0 then
    raise exception 'wipe broke the accounts: profiles is empty';
  end if;

  -- Announcements must have been detached, not destroyed.
  if exists (select 1 from public.announcements where course_id is not null) then
    raise exception 'wipe incomplete: an announcement still points at a course';
  end if;
end;
$$;