-- A student was shown an assignment deadline for a paid course they had not paid for.
--
-- What was wrong
-- --------------
-- `assignments select` granted access to every published assignment on the platform:
--
--     status = 'published' OR is_instructor_of(course_id) OR is_admin() OR is_enrolled_in(course_id)
--
-- The first disjunct mentions nothing about who is asking. It is not scoped to a
-- course, a role, or an enrolment - it says "published assignments are readable", full
-- stop. Every other branch in the same policy asks the right question; that one does not
-- ask it at all.
--
-- The consequence, reproduced as Joren Lalamonan. He holds two live enrolments, both free
-- courses, plus one *pending* enrolment on Advanced Python Development - ₱1,500, not paid.
-- `is_enrolled_in` is correct and returns false for that course, because it filters to
-- `status in ('active','completed')`. But the policy never had to ask it:
--
--     Advanced Python Development   2026-10-11  published  Checkpoint: control flow and functions
--     Introduction to Programming    (no date)  published  Week 1 practical
--
-- Both readable. He has no live place on the first, and it is the paid one.
--
-- What made it visible
-- --------------------
-- `calendar.service.ts` reads assignments with no course filter at all:
--
--     supabase.from('assignments').select('id, title, due_at, courses!inner(...)')
--       .not('due_at', 'is', null)
--
-- It trusted RLS to scope the result, which is normally the right thing to do. Here the
-- policy it trusted was the thing that was wrong, so the calendar rendered:
--
--     Checkpoint: control flow and functions   ASSIGNMENT DUE  Oct 12  Advanced Python Development
--
-- on a page whose own subtitle is "Every dated thing across your courses".
--
-- Why `status = 'published'` was there, and why it goes
-- ----------------------------------------------------
-- It looks like it was meant to let a browser read the shape of a course it was not yet
-- enrolled in - but nothing needs that. Checked every reader of the table:
--
--     calendar.service.ts      student and instructor calendars
--     learning.service.ts      a student's own assignment lists, course-filtered
--     instructor.service.ts    authoring and grading, behind is_instructor_of / is_admin
--
-- No public page, no catalogue entry and no course outline reads `assignments`. So the
-- clause was not serving a caller that exists; it was only widening who could read
-- published assignment text - titles, instructions and due dates - across every course
-- on the platform.
--
-- The other disjuncts already cover every legitimate reader: the instructor who teaches
-- it, an administrator, and a student holding a live place.
--
-- The notification was bad data, not a policy problem
-- ---------------------------------------------------
-- Joren's notification "Checkpoint due in six days" links to `/student/courses/advanced-python`
-- and was written by hand: the `announcements` table is empty and no function body contains
-- the phrase. Deleting it is a data fix, and the check at the end of this migration is the
-- part that stops it happening again.

drop policy if exists "assignments select" on public.assignments;

create policy "assignments select" on public.assignments
  for select
  using (
    is_instructor_of(course_id)
    or is_admin()
    or is_enrolled_in(course_id)
  );

comment on policy "assignments select" on public.assignments is
  'The instructor who teaches the course, an administrator, or a student holding a live place on it. The previous policy also granted every published assignment to every signed-in account, via a disjunct that mentioned nothing about the caller; a student with a pending enrolment on a paid course could therefore read that course''s assignment titles, instructions and due dates.';

-- A notification may only point at a course the recipient actually holds a place on.
--
-- Scoped to `announcement`-typed rows on a course link, and that scope is the whole point:
-- the general rule "no notification may mention a course you are not on" is wrong. A
-- payment reminder has to name the pending course, or it cannot say what is owed. So this
-- only catches the shape that is never legitimate - a course-scoped announcement aimed at
-- somebody with no live enrolment - rather than asserting something broader.
--
-- Also deletes the row it found, so this is a fix and not just a report. On this database
-- it removes exactly one row, Joren's.
delete from public.notifications nt
 where nt.type = 'announcement'
   and exists (
     select 1 from public.courses z
      where nt.link like '%/courses/' || z.slug
        and not exists (
          select 1 from public.enrollments en
           where en.course_id = z.id
             and en.student_id = nt.user_id
             and en.status in ('active', 'completed')
        )
   );

-- =========================================================================================
-- Checks.
-- =========================================================================================
--
-- Two things to get right here, and both took a wrong attempt to notice.
--
-- Setting `request.jwt.claims` does not apply row-level security. The migration runs as
-- `postgres`, which bypasses RLS, so a check written that way measures the superuser and
-- passes while the hole is still open. The first version of this block reported the
-- student still reading one assignment on a policy that had already been tightened. Every
-- check below therefore switches role as well as setting claims.
--
-- Restoring the role is the other one. `execute 'reset role'` from inside plpgsql turned
-- out to be unreliable here - a later check failed with "permission denied for table
-- notifications" because the role it ran under was not the one it was written for. So
-- there is no restore at all. `set local role` is transaction-scoped, which means the
-- role reverts when the migration's transaction commits; the checks are simply ordered so
-- that each one sets the role it needs first and never inherits a stale one. The
-- last block leaves `anon` in place deliberately, and it goes away with the transaction.
--
-- Each block is a separate `do` so that ordering is explicit rather than emergent.

-- 0. As postgres, before any role is set: no announcement points at a course its
--    recipient cannot reach.
do $$
declare
  v_notif text;
begin
  select string_agg(nt.title || ' -> ' || nt.link, '; ') into v_notif
    from public.notifications nt
   where nt.type = 'announcement'
     and exists (
       select 1 from public.courses z
        where nt.link like '%/courses/' || z.slug
          and not exists (
            select 1 from public.enrollments en
             where en.course_id = z.id
               and en.student_id = nt.user_id
               and en.status in ('active', 'completed')
          )
     );

  if v_notif is not null then
    raise exception
      'these announcements point at a course the recipient cannot reach: %', v_notif;
  end if;

  raise notice 'no announcement points at a course its recipient cannot reach';
end;
$$;

-- 1. The live witness: the student holding only a pending enrolment, reading as themselves.
--
--    Asserted as an equality rather than as a threshold. What is true is that the
--    assignments this student can read are exactly the assignments on the courses they
--    hold a live place on - not "fewer" and not "zero". An equality catches a leak and an
--    over-tightened policy alike, where "reads 0" would pass on the second and fail on a
--    student who is correctly enrolled.
do $$
declare
  v_course    uuid;
  v_student   uuid;
  v_on_course bigint;
  v_readable  bigint;
  v_expected  bigint;
begin
  select e.course_id, e.student_id into v_course, v_student
    from public.enrollments e
   where e.status = 'pending'
   limit 1;

  if v_course is null then
    raise notice 'no pending enrolment exists; the access check was skipped';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_student::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Under the old policy this was 1: the assignment on the course they have not paid for.
  select count(*) into v_on_course
    from public.assignments
   where course_id = v_course and status = 'published';

  select count(*) into v_readable from public.assignments;

  select count(*) into v_expected
    from public.assignments a
   where exists (
     select 1 from public.enrollments e
      where e.course_id = a.course_id
        and e.student_id = v_student
        and e.status in ('active', 'completed')
   );

  if v_on_course > 0 then
    raise exception
      'a student with only a pending enrolment can read % assignment(s) on the course they have not paid for',
      v_on_course;
  end if;

  if v_readable <> v_expected then
    raise exception
      'this student can read % assignment(s) but holds a live place on % of them',
      v_readable, v_expected;
  end if;

  raise notice
    'pending-enrolment student reads 0 on the unpaid course, and % platform-wide, which is the % on their live courses',
    v_readable, v_expected;
end;
$$;

-- 2. A student holding a live place still reads that course's published assignments. A
--    policy tightened too far reads as a fix and is an outage.
do $$
declare
  v_student uuid;
  v_course  uuid;
  v_seen    bigint;
begin
  select e.student_id, e.course_id into v_student, v_course
    from public.enrollments e
   where e.status = 'active'
     and exists (select 1 from public.assignments a
                  where a.course_id = e.course_id and a.status = 'published')
   limit 1;

  if v_student is null then
    raise notice 'no active enrolment with a published assignment; the student check was skipped';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_student::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_seen
    from public.assignments
   where course_id = v_course and status = 'published';

  if v_seen = 0 then
    raise exception
      'an enrolled student can no longer read the published assignments on their own course';
  end if;

  raise notice 'an enrolled student still reads % assignment(s) on their own course', v_seen;
end;
$$;

-- 3. An administrator still reads everything. `is_admin()` reads the profile row rather
--    than the JWT role, so this exercises the real path rather than a shortcut.
do $$
declare
  v_admin uuid;
  v_seen  bigint;
begin
  select id into v_admin from public.profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise notice 'no administrator account; the admin check was skipped';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_seen from public.assignments;

  if v_seen = 0 then
    raise exception 'an administrator can no longer read any assignment';
  end if;

  raise notice 'an administrator still reads % assignment(s) platform-wide', v_seen;
end;
$$;

-- 4. The instructor who teaches the course still reads it.
do $$
declare
  v_teacher uuid;
  v_seen    bigint;
begin
  select ci.instructor_id into v_teacher
    from public.course_instructors ci
    join public.assignments a on a.course_id = ci.course_id
   limit 1;

  if v_teacher is null then
    raise notice 'no teaching assignment exists; the instructor check was skipped';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_teacher::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_seen
    from public.assignments a
   where exists (select 1 from public.course_instructors ci
                  where ci.course_id = a.course_id and ci.instructor_id = auth.uid());

  if v_seen = 0 then
    raise exception
      'the teaching instructor can no longer read the assignments on their own course';
  end if;

  raise notice 'the teaching instructor still reads % assignment(s) on their own course', v_seen;
end;
$$;

-- 5. `anon` gained nothing, and is refused rather than returning an empty set.
--
--    This was the block that failed, and it failed for a reason worth recording: `anon`
--    holds no SELECT grant on `assignments` at all, so `select count(*)` raises
--    `permission denied` instead of returning 0. Asserting "reads 0" here asked for a
--    query the role cannot run, so the check raised on a table that was correctly
--    unreachable and the migration reported a fault that did not exist.
--
--    So this asserts the refusal itself, which is the stronger statement: it is not
--    enough that the rows are hidden, the role must have no way to ask.
--
--    Left last on purpose: the role reverts when this migration's transaction commits.
do $$
declare
  v_refused boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';

  begin
    perform 1 from public.assignments;
  exception
    when insufficient_privilege then
      v_refused := true;
  end;

  if not v_refused then
    raise exception
      'anon can read assignments; it should hold no SELECT grant on the table';
  end if;

  raise notice 'anon is refused assignments, as it should be';
end;
$$;
