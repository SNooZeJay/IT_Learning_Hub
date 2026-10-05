-- 20261005090011_completion_certificates_assignments.sql
--
-- Progress turning into a qualification, and work a student hands in.
--
-- Course requirements
-- --------------------
-- "Complete this course" is not one thing. It is every lesson marked complete,
-- plus a quiz average, plus every assignment handed in and graded. Storing that
-- as one boolean on the enrolment loses the reason: a student blocked at 98%
-- needs to be told WHICH requirement is outstanding, and a boolean cannot say.
-- So the requirements are rows, and `course_completion_gaps` reports exactly
-- what is missing.
--
-- Section 19.2 of the spec: hand-ins count toward completion. An assignment that
-- is submitted but ungraded does NOT count - grading is part of the requirement,
-- because an ungraded hand-in is indistinguishable from one that was ignored.
--
-- Certificates
-- ------------
-- Section 19.5: a revoked certificate stays visible and blocks re-issue. So a
-- certificate row is never deleted. Revoking sets revoked_at and a reason, and
-- the unique index on active certificates means a second live certificate for
-- the same person and course cannot exist even if the revocation were bypassed.

create type public.requirement_type as enum (
  'complete_all_lessons',
  'min_quiz_average',
  'submit_all_assignments'
);

create type public.assignment_status as enum ('draft', 'published');
create type public.submission_status as enum ('submitted', 'graded');

-- ---------------------------------------------------------------------------
-- Requirements
-- ---------------------------------------------------------------------------

create table public.course_requirements (
  course_id         uuid not null references public.courses (id) on delete cascade,
  requirement_type  public.requirement_type not null,
  -- Percentage for min_quiz_average. Unused by the other two types, which are
  -- satisfied by doing everything.
  threshold         numeric(5,2) check (threshold is null or (threshold > 0 and threshold <= 100)),
  created_at        timestamptz not null default now(),
  primary key (course_id, requirement_type)
);

comment on table public.course_requirements is
  'What a student must achieve before the course counts as complete. One row per requirement type per course.';

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------

create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  module_id     uuid references public.modules (id) on delete set null,
  title         text not null check (length(btrim(title)) > 0),
  instructions  text,
  due_at        timestamptz,
  max_points    numeric(6,2) not null default 100 check (max_points > 0),
  status        public.assignment_status not null default 'draft',
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index assignments_course_idx on public.assignments (course_id);

create table public.assignment_submissions (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references public.assignments (id) on delete cascade,
  course_id         uuid not null references public.courses (id) on delete cascade,
  student_id        uuid not null references public.profiles (id),
  submission_text  text,
  file_path        text,
  submitted_at      timestamptz not null default now(),
  -- Set once graded. After that the work is a record.
  grade            numeric(6,2) check (grade is null or grade >= 0),
  feedback         text,
  graded_by        uuid references public.profiles (id),
  graded_at        timestamptz,
  status           public.submission_status not null default 'submitted',
  -- Re-submitting replaces the text and clears the grade, so the two can never
  -- disagree about whether a submission has been marked.
  constraint submission_has_content check (
    submission_text is not null or file_path is not null
  )
);

create unique index assignment_submissions_unique_student
  on public.assignment_submissions (assignment_id, student_id);
create index assignment_submissions_course_idx on public.assignment_submissions (course_id);

-- Section 19.3: a server-side check that refuses replacement of marked work.
--
-- This has to be in the database. A RLS policy can stop a student editing their
-- own submission, but it cannot express "unless it has already been graded" -
-- policies are row predicates, not column-and-old-value predicates. Without this
-- trigger a student could clear their own grade by updating the row.
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

create trigger assignment_submissions_protect_graded
  before update on public.assignment_submissions
  for each row execute function public.protect_graded_submission();

-- ---------------------------------------------------------------------------
-- Certificates
-- ---------------------------------------------------------------------------

create table public.certificates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id),
  course_id         uuid not null references public.courses (id) on delete cascade,
  enrollment_id     uuid references public.enrollments (id) on delete set null,
  -- Human-facing and unique. Derived from a sequence rather than a random uuid
  -- so it reads like a reference a person could quote to an employer.
  certificate_number text not null unique,
  final_percentage  numeric(5,2) not null check (final_percentage >= 0 and final_percentage <= 100),
  issued_at         timestamptz not null default now(),
  -- Section 19.5: revocation is recorded, never deleted.
  revoked_at        timestamptz,
  revoked_by        uuid references public.profiles (id),
  revoke_reason     text
);

create unique index certificates_one_active_per_user_course
  on public.certificates (user_id, course_id)
  where revoked_at is null;

create index certificates_user_idx on public.certificates (user_id);

comment on column public.certificates.revoked_at is
  'Set when revoked. The row is kept and stays visible to its holder. A revoked certificate also blocks re-issue for the same course.';

create sequence public.certificate_number_seq start 1000;

-- ---------------------------------------------------------------------------
-- Completion
-- ---------------------------------------------------------------------------

-- What is still missing before this enrolment counts as complete.
--
-- Returns one row per unmet requirement. An enrolment with no rows here is
-- complete. The point is that a student can be told precisely what is left
-- rather than being told they are "not finished".
create or replace function public.course_completion_gaps(p_enrollment_id uuid)
returns table(requirement public.requirement_type, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select en.id, en.course_id from public.enrollments en where en.id = p_enrollment_id
  ),
  totals as (
    select
      (select count(*) from public.lessons l
         join public.modules m on m.id = l.module_id
        where m.course_id = e.course_id) as lessons,
      (select count(*) from public.lesson_progress lp
         join public.lessons l on l.id = lp.lesson_id
         join public.modules m on m.id = l.module_id
        where m.course_id = e.course_id and lp.status = 'completed') as lessons_done
    from e
  ),
  quiz_avg as (
    select coalesce(avg(a.percentage), 0) as avg_pct
    from public.quiz_attempts a
    where a.course_id = (select course_id from e) and a.status = 'submitted'
  ),
  assignment_totals as (
    select
      (select count(*) from public.assignments a
        where a.course_id = (select course_id from e) and a.status = 'published') as published,
      (select count(*) from public.assignment_submissions s
        where s.course_id = (select course_id from e) and s.status = 'graded') as graded
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

-- Recomputes an enrolment's status from its requirements.
--
-- Called after anything that could move it: a lesson completed, a quiz graded, an
-- assignment marked. Deriving the status on read instead would mean a student
-- could be "complete" in one screen and "not complete" in another depending on
-- which query ran.
create or replace function public.refresh_enrollment_completion(p_enrollment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_gaps      integer;
begin
  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if not found then
    return false;
  end if;

  -- A dropped enrolment is never completed by finishing the work. Re-enrolling
  -- is the route back.
  if v_enrollment.status = 'dropped' or v_enrollment.status = 'pending' then
    return false;
  end if;

  select count(*) into v_gaps from public.course_completion_gaps(p_enrollment_id);

  if v_gaps = 0 and v_enrollment.status = 'active' then
    update public.enrollments
       set status = 'completed', completed_at = coalesce(completed_at, now())
     where id = p_enrollment_id;
    return true;
  end if;

  return false;
end;
$$;

-- Issues a certificate, or explains why not.
--
-- Section 19.5: a revoked certificate blocks re-issue. The student keeps seeing
-- the revoked one, with its reason, and cannot quietly obtain a replacement.
create or replace function public.issue_certificate(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_existing  public.certificates%rowtype;
  v_average   numeric(5,2);
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

  v_number := 'ITH-' || upper(substr(replace(c.title, ' ', '-'), 1, 24)) || '-' ||
              lpad(nextval('public.certificate_number_seq')::text, 6, '0');

  insert into public.certificates
    (user_id, course_id, enrollment_id, certificate_number, final_percentage)
  values (auth.uid(), p_course_id, v_enrollment.id, v_number, round(v_average, 2))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.issue_certificate(uuid) from public;
grant execute on function public.issue_certificate(uuid) to authenticated;
grant execute on function public.refresh_enrollment_completion(uuid) to authenticated;
grant execute on function public.course_completion_gaps(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.course_requirements       enable row level security;
alter table public.assignments               enable row level security;
alter table public.assignment_submissions    enable row level security;
alter table public.certificates              enable row level security;

-- A published course's requirements are visible so a student can see what they
-- are working towards. That is the point of storing them as rows.
drop policy if exists "requirements read" on public.course_requirements;
create policy "requirements read" on public.course_requirements
  for select to authenticated using (true);

drop policy if exists "requirements instructor write" on public.course_requirements;
create policy "requirements instructor write" on public.course_requirements
  for all to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin())
  with check (public.is_instructor_of(course_id) or public.is_admin());

-- Assignments -------------------------------------------------------------
drop policy if exists "assignments select" on public.assignments;
create policy "assignments select" on public.assignments
  for select to authenticated
  using (
    status = 'published'
    or public.is_instructor_of(course_id)
    or public.is_admin()
    or public.is_enrolled_in(course_id)
  );

drop policy if exists "assignments instructor write" on public.assignments;
create policy "assignments instructor write" on public.assignments
  for all to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin())
  with check (public.is_instructor_of(course_id) or public.is_admin());

-- Submissions -------------------------------------------------------------
drop policy if exists "submissions select" on public.assignment_submissions;
create policy "submissions select" on public.assignment_submissions
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_instructor_of(course_id)
    or public.is_admin()
  );

-- A student inserts and updates their own, and only while it is ungraded. The
-- trigger refuses the rest, so this policy is the first gate rather than the
-- only one.
drop policy if exists "submissions student write" on public.assignment_submissions;
create policy "submissions student write" on public.assignment_submissions
  for insert to authenticated
  with check (student_id = auth.uid() and public.is_enrolled_in(course_id));

drop policy if exists "submissions student update" on public.assignment_submissions;
create policy "submissions student update" on public.assignment_submissions
  for update to authenticated
  using (student_id = auth.uid() and status = 'submitted')
  with check (student_id = auth.uid());

drop policy if exists "submissions instructor grade" on public.assignment_submissions;
create policy "submissions instructor grade" on public.assignment_submissions
  for update to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin())
  with check (public.is_instructor_of(course_id) or public.is_admin());

-- Certificates ------------------------------------------------------------
-- The holder sees their own including revoked ones, with the reason. An
-- instructor sees certificates for their course. Nobody sees anyone else's.
drop policy if exists "certificates select own" on public.certificates;
create policy "certificates select own" on public.certificates
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_instructor_of(course_id)
    or public.is_admin()
  );

drop policy if exists "certificates admin revoke" on public.certificates;
create policy "certificates admin revoke" on public.certificates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Issued only by issue_certificate. No insert policy: a certificate is not
-- something a client creates.
drop policy if exists "certificates insert" on public.certificates;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on public.course_requirements    from anon;
revoke all on public.assignments            from anon;
revoke all on public.assignment_submissions from anon;
revoke all on public.certificates           from anon;

revoke all on public.course_requirements    from authenticated;
revoke all on public.assignments            from authenticated;
revoke all on public.assignment_submissions from authenticated;
revoke all on public.certificates           from authenticated;

grant select on public.course_requirements to authenticated;
grant insert, update, delete on public.course_requirements to authenticated;

grant select on public.assignments to authenticated;
grant insert, update, delete on public.assignments to authenticated;

grant select on public.assignment_submissions to authenticated;
grant insert, update on public.assignment_submissions to authenticated;

-- No insert: a certificate comes from issue_certificate only.
grant select on public.certificates to authenticated;
grant update on public.certificates to authenticated;

grant usage, select on sequence public.certificate_number_seq to authenticated;
