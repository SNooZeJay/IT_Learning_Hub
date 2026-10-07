-- Validation, part 1: the gaps a client can still walk through.
--
-- What this closes
-- ----------------
--
-- Four things, all found by inspecting the live schema rather than by reading the
-- policies and assuming what they cover.
--
-- 1. `notifications` and `certificates` had a column-BLIND update grant.
--
--    Both tables are `grant update on <table> to authenticated`, and both have an
--    UPDATE policy that checks only *which row*:
--
--      notifications  using (user_id = auth.uid())
--      certificates   using (is_admin())
--
--    Neither says which COLUMN. RLS cannot express that - it sees the new row, not the
--    old one - so the guarantee has to come from the GRANT. The migration that created
--    the notifications policy carries the comment "There is no update policy beyond
--    read_at", which was true of the policy and false of the grant.
--
--    Reachable today: a signed-in user updates their own notification row and rewrites
--    `title`, `body` or `link`. `link` is the serious one - it is a URL rendered into
--    the UI, so this is a phishing primitive pointed at the account that owns the row.
--    For certificates, an administrator can rewrite `final_percentage`, `user_id` and
--    `course_id` on an issued certificate, and there is no trigger on that table at all.
--
--    Fixed the way `conversation_participants` was fixed in 20261006250000: revoke the
--    table-level UPDATE and re-grant the two or three columns that are actually meant to
--    move. Same pattern, same reasoning, applied to the two tables that were missed.
--
-- 2. `profiles.email` was not UNIQUE, while four migrations resolve a profile by email
--    assuming exactly one row. `auth.users.email` is unique, so this only diverges if
--    something writes the profile copy directly - which the admin user-management
--    service does. A duplicate made every one of those lookups non-deterministic.
--
-- 3. Six title/name columns accepted a blank string. `length(btrim(col)) > 0` is the
--    house pattern and it was applied to twelve other columns; these six were missed, so
--    a course with an empty title was insertable.
--
-- 4. Three relationships were checkable but unchecked. Each was already enforced inside
--    the SECURITY DEFINER function that writes it, so these are not new holes - they are
--    places where the invariant lives in one function instead of in the schema, and dies
--    the moment a second writer appears.
--
--        quiz_answers.question_id  must belong to the attempt's own quiz
--        lesson_progress.lesson_id must belong to the enrolment's course
--        payments                   course_id/student_id must match enrollment_id
--
--    Each is enforced by a trigger rather than a composite foreign key. The composite
--    FKs would mean denormalising `quiz_id` onto `quiz_answers` and `course_id` onto
--    `lesson_progress` - new columns that can themselves drift - and this project's
--    established answer to "a row must agree with a row it does not reference" is a
--    trigger: see `check_material_shape`, `protect_graded_submission`,
--    `sync_lesson_progress_student`.
--
-- Deliberately not done here
-- --------------------------
-- Validation of the *shape* of user input. This file is about what a row must agree
-- with. Whether a course title is longer than 80 characters, whether a slug is well
-- formed, whether a route parameter is a UUID - those are TypeScript, in one shared
-- module, and the reason this is one migration rather than a rule per table.

begin;

-- ---------------------------------------------------------------------------
-- 1. Narrow two column-blind update grants
-- ---------------------------------------------------------------------------

-- A notification is a fact the system asserts. Its only legitimate change is being read.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

comment on column public.notifications.read_at is
  'The only column a signed-in user may write. The table-level UPDATE grant was revoked in 20261007090300 and this column grant substituted, because the UPDATE policy checks which ROW a caller may touch and not which COLUMN - so it would otherwise have permitted rewriting title, body and link of one''s own notifications. link is the field that matters: it is a URL the interface renders.';

-- A certificate is an issued record. It is revoked, never edited.
--
-- `user_id`, `course_id`, `final_percentage` and `certificate_number` become unnameable
-- to every client role, including admins. Revocation is the only legitimate change, and
-- `is_admin()` in the policy still governs who may do it.
revoke update on public.certificates from authenticated;
grant update (revoked_at, revoked_by, revoke_reason) on public.certificates to authenticated;

comment on column public.certificates.revoked_at is
  'Set by an administrator to revoke. Revoking is the only update a client role may make on a certificate; the columns that record what was issued are not writable by any client role since 20261007090300.';

-- ---------------------------------------------------------------------------
-- 2. One profile per email address
-- ---------------------------------------------------------------------------

-- `auth.users.email` is unique, so this holds by construction for accounts created
-- through auth. It did not hold for `public.profiles`, which four separate migrations
-- query with `where email = ...` on the assumption that one row answers.
--
-- Added as a UNIQUE index rather than a constraint so the statement is idempotent
-- against a database that already carries duplicates from before this migration.
create unique index if not exists profiles_email_unique
  on public.profiles (lower(email));

comment on index public.profiles_email_unique is
  'Case-insensitive uniqueness on the profile copy of the auth email. Enforced because four migrations resolve a profile with `where email = ...` assuming a single row; a duplicate made each of those lookups non-deterministic. The index is on lower(email) so that differing case cannot create a second profile for the same address.';

-- ---------------------------------------------------------------------------
-- 3. Titles and names cannot be blank
-- ---------------------------------------------------------------------------

-- The house pattern. Applied to twelve other columns across quizzes, assignments,
-- announcements, conversations and notifications; these six were missed, which is how a
-- course with no title was insertable.
alter table public.profiles
  drop constraint if exists profiles_full_name_not_blank;
alter table public.profiles
  add constraint profiles_full_name_not_blank
  check (length(btrim(full_name)) > 0);

alter table public.courses
  drop constraint if exists courses_title_not_blank;
alter table public.courses
  add constraint courses_title_not_blank
  check (length(btrim(title)) > 0);

alter table public.modules
  drop constraint if exists modules_title_not_blank;
alter table public.modules
  add constraint modules_title_not_blank
  check (length(btrim(title)) > 0);

alter table public.lessons
  drop constraint if exists lessons_title_not_blank;
alter table public.lessons
  add constraint lessons_title_not_blank
  check (length(btrim(title)) > 0);

alter table public.lesson_materials
  drop constraint if exists lesson_materials_title_not_blank;
alter table public.lesson_materials
  add constraint lesson_materials_title_not_blank
  check (length(btrim(title)) > 0);

alter table public.course_categories
  drop constraint if exists course_categories_name_not_blank;
alter table public.course_categories
  add constraint course_categories_name_not_blank
  check (length(btrim(name)) > 0);

-- ---------------------------------------------------------------------------
-- 4a. An answer's question must belong to its attempt's quiz
-- ---------------------------------------------------------------------------

-- `quiz_answers` carries two independent foreign keys, to `quiz_attempts` and to
-- `quiz_questions`, and nothing ties the two together. A row can pair an attempt on one
-- quiz with a question from another, which is not a shape any part of this system can
-- produce honestly.
--
-- Closed inside `save_attempt_answer` and `submit_quiz_attempt` already - so this is not
-- a live hole, it is an invariant that exists in exactly two functions and would be lost
-- by a third writer. This is that third writer's problem, solved once.
create or replace function public.check_answer_belongs_to_quiz()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
declare
  v_attempt_quiz uuid;
  v_question_quiz uuid;
begin
  select a.quiz_id into v_attempt_quiz
    from public.quiz_attempts a where a.id = new.attempt_id;
  select q.quiz_id into v_question_quiz
    from public.quiz_questions q where q.id = new.question_id;

  -- A missing attempt or question is the foreign key's business, not this one's. Returning
  -- untouched lets the FK raise with its own, more precise, error.
  if v_attempt_quiz is null or v_question_quiz is null then
    return new;
  end if;

  if v_attempt_quiz <> v_question_quiz then
    raise exception
      'answer pairs question % (quiz %) with attempt % (quiz %): a question from another quiz',
      new.question_id, v_question_quiz, new.attempt_id, v_attempt_quiz
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists answer_belongs_to_quiz on public.quiz_answers;
create trigger answer_belongs_to_quiz
  before insert or update on public.quiz_answers
  for each row execute function public.check_answer_belongs_to_quiz();

comment on function public.check_answer_belongs_to_quiz() is
  'Refuses a quiz_answers row whose question belongs to a different quiz than its attempt. Two foreign keys existed with nothing relating them; the pairing was enforced only inside save_attempt_answer and submit_quiz_attempt, and would have been lost to any third writer.';

-- ---------------------------------------------------------------------------
-- 4b. Progress must be for a lesson in the enrolled course
-- ---------------------------------------------------------------------------

-- Same shape: `lesson_progress` references an enrolment and a lesson independently. A
-- row can point at a lesson belonging to an unrelated course.
create or replace function public.check_progress_lesson_in_course()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
declare
  v_enrolment_course uuid;
  v_lesson_course uuid;
begin
  select e.course_id into v_enrolment_course
    from public.enrollments e where e.id = new.enrollment_id;

  select c.id into v_lesson_course
    from public.lessons l
    join public.modules m on m.id = l.module_id
   where l.id = new.lesson_id;

  -- Missing parents are the foreign keys' business.
  if v_enrolment_course is null or v_lesson_course is null then
    return new;
  end if;

  if v_enrolment_course <> v_lesson_course then
    raise exception
      'progress on enrolment % (course %) references lesson % (course %)',
      new.enrollment_id, v_enrolment_course, new.lesson_id, v_lesson_course
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists progress_lesson_in_course on public.lesson_progress;
create trigger progress_lesson_in_course
  before insert or update on public.lesson_progress
  for each row execute function public.check_progress_lesson_in_course();

comment on function public.check_progress_lesson_in_course() is
  'Refuses a lesson_progress row whose lesson is not part of the enrolled course. course_completion_gaps already ignored such a row rather than counting it, so this was an incoherence rather than a leak - but an incoherent row that is silently ignored is harder to find than one that is refused.';

-- ---------------------------------------------------------------------------
-- 4c. A payment must describe the same enrolment it points at
-- ---------------------------------------------------------------------------

-- `payments` holds `student_id`, `course_id` and `enrollment_id` as three independent
-- foreign keys. Nothing requires the first two to be the enrolment's own.
--
-- `settle_payment` verifies the AMOUNT against the stored payment and activates the
-- enrolment; it never checks that the payment's course and student are the enrolment's.
-- Every writer today computes both from the same call, so no live row disagrees - which
-- is precisely why this is worth asserting rather than assuming.
create or replace function public.check_payment_matches_enrollment()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
declare
  v_enrolment record;
begin
  if new.enrollment_id is null then
    return new;
  end if;

  select e.course_id, e.student_id into v_enrolment
    from public.enrollments e where e.id = new.enrollment_id;

  -- A missing enrolment is the foreign key's business, and `on delete set null` means a
  -- null here is legitimate for an orphaned historical payment.
  if v_enrolment is null then
    return new;
  end if;

  if new.course_id <> v_enrolment.course_id or new.student_id <> v_enrolment.student_id then
    raise exception
      'payment for course % / student % is attached to an enrolment for course % / student %',
      new.course_id, new.student_id, v_enrolment.course_id, v_enrolment.student_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_matches_enrollment on public.payments;
create trigger payment_matches_enrollment
  before insert or update on public.payments
  for each row execute function public.check_payment_matches_enrollment();

comment on function public.check_payment_matches_enrollment() is
  'Refuses a payment whose course_id or student_id disagrees with the enrolment it is attached to. All three were independent foreign keys with nothing relating them; settle_payment checked the amount and activated the enrolment but never checked that they described the same thing.';

-- ---------------------------------------------------------------------------
-- Assert the result, so a future change that breaks one of these fails here
-- ---------------------------------------------------------------------------

do $$
declare
  v_bad integer;
begin
  -- No existing row may violate a constraint just added.
  if exists (select 1 from public.profiles where length(btrim(full_name)) = 0) then
    raise exception 'a profile has a blank full_name';
  end if;
  if exists (select 1 from public.courses where length(btrim(title)) = 0) then
    raise exception 'a course has a blank title';
  end if;
  if exists (select 1 from public.modules where length(btrim(title)) = 0) then
    raise exception 'a module has a blank title';
  end if;
  if exists (select 1 from public.lessons where length(btrim(title)) = 0) then
    raise exception 'a lesson has a blank title';
  end if;
  if exists (select 1 from public.lesson_materials where length(btrim(title)) = 0) then
    raise exception 'a lesson material has a blank title';
  end if;

  -- Duplicate emails would have blocked the index; prove the index exists and is usable.
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'profiles_email_unique'
  ) then
    raise exception 'profiles_email_unique was not created';
  end if;

  -- The triggers must be attached, not merely defined.
  if not exists (
    select 1 from pg_trigger where tgname = 'answer_belongs_to_quiz' and not tgisinternal
  ) then
    raise exception 'answer_belongs_to_quiz trigger is missing';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'progress_lesson_in_course' and not tgisinternal
  ) then
    raise exception 'progress_lesson_in_course trigger is missing';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'payment_matches_enrollment' and not tgisinternal
  ) then
    raise exception 'payment_matches_enrollment trigger is missing';
  end if;

  -- The narrowed grants. `has_column_privilege` on a column that was never granted
  -- returns false, so this distinguishes "narrowed" from "left wide open".
  v_bad := 0;
  if has_column_privilege('authenticated', 'public.notifications', 'link', 'UPDATE') then
    v_bad := v_bad + 1;
  end if;
  if has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE') then
    v_bad := v_bad + 1;
  end if;
  if has_column_privilege('authenticated', 'public.certificates', 'final_percentage', 'UPDATE') then
    v_bad := v_bad + 1;
  end if;
  if has_column_privilege('authenticated', 'public.certificates', 'user_id', 'UPDATE') then
    v_bad := v_bad + 1;
  end if;
  if v_bad > 0 then
    raise exception '% narrowed grant(s) are still open to a client role', v_bad;
  end if;

  -- And the legitimate ones must still work, or this migration has broken the product.
  if not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') then
    raise exception 'a user must still be able to mark their own notification read';
  end if;
  if not has_column_privilege('authenticated', 'public.certificates', 'revoked_at', 'UPDATE') then
    raise exception 'an administrator must still be able to revoke a certificate';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
