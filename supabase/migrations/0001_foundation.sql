-- ============================================================================
-- IT Learning Hub LMS — foundation schema
--
-- 10 tables, 4 authorisation helpers, 3 triggers, RLS on every table,
-- and 4 storage buckets.
--
-- Design notes that matter when editing this file:
--
--   * Every table has RLS enabled. A table without RLS is readable by anyone
--     holding the publishable key, which is public by design.
--   * Policies NEVER query `profiles` directly. A policy on `profiles` that
--     reads `profiles` recurses until Postgres gives up. Authorisation goes
--     through the SECURITY DEFINER helpers at the bottom instead.
--   * Amounts are integer centavos. PHP has two decimals and float arithmetic
--     loses cents.
--   * `course_progress` is deliberately NOT a table. It is derivable from
--     lesson_progress, and a materialised copy would need synchronising.
--
-- Run with: supabase db reset, or paste into the Supabase SQL editor.
-- Idempotent: safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('admin', 'instructor', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'invited', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.course_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.course_level as enum ('beginner', 'intermediate', 'advanced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.enrollment_status as enum ('active', 'completed', 'dropped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lesson_type as enum ('article', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.progress_status as enum ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null,
  email text not null,
  avatar_url text,
  phone text,
  bio text,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'Assigned by the handle_new_user trigger or an admin. Never accepted from client input.';

create table if not exists public.course_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.course_categories (id) on delete set null,
  title text not null,
  slug text not null unique,
  description text,
  thumbnail_url text,
  status public.course_status not null default 'draft',
  level public.course_level not null default 'beginner',
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  passing_score numeric(5, 2) check (passing_score is null or passing_score between 0 and 100),
  -- A course is paid exactly when this is greater than zero. No separate
  -- boolean: a flag can disagree with the price, and then the two disagree
  -- about whether a student has to pay.
  price_centavos integer not null default 0 check (price_centavos >= 0),
  created_by uuid not null references public.profiles (id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_category_id_idx on public.courses (category_id);
create index if not exists courses_status_idx on public.courses (status);
create index if not exists courses_created_by_idx on public.courses (created_by);

create table if not exists public.course_instructors (
  course_id uuid not null references public.courses (id) on delete cascade,
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (course_id, instructor_id)
);

create index if not exists course_instructors_instructor_id_idx
  on public.course_instructors (instructor_id);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  description text,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null,
  content text,
  lesson_type public.lesson_type not null default 'article',
  position integer not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  -- A preview lesson is visible to signed-out visitors on the course page. This
  -- is the only lesson content that leaves the enrolment boundary.
  is_preview boolean not null default false,
  video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, position)
);

create table if not exists public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  title text not null,
  -- Storage path, never the file itself. See the lesson-materials bucket for
  -- the required path shape.
  file_path text not null,
  file_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lesson_materials_lesson_id_idx on public.lesson_materials (lesson_id);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (course_id, student_id)
);

create index if not exists enrollments_student_id_idx on public.enrollments (student_id);
create index if not exists enrollments_course_id_status_idx on public.enrollments (course_id, status);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status public.progress_status not null default 'not_started',
  progress_percent numeric(5, 2) not null default 0
    check (progress_percent between 0 and 100),
  -- Video resume position. Makes a refresh mid-lecture cheap instead of
  -- restarting it.
  last_position_seconds integer check (last_position_seconds is null or last_position_seconds >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  unique (enrollment_id, lesson_id)
);

create index if not exists lesson_progress_enrollment_id_idx on public.lesson_progress (enrollment_id);
create index if not exists lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  amount_centavos integer not null check (amount_centavos > 0),
  currency text not null default 'PHP',
  status public.payment_status not null default 'pending',
  provider text not null default 'paymongo',
  provider_payment_id text,
  provider_checkout_id text,
  reference_number text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_student_id_idx on public.payments (student_id);
create index if not exists payments_course_id_idx on public.payments (course_id);
create index if not exists payments_status_idx on public.payments (status);

-- Repeated attempts at a failed payment are allowed, but a course can only be
-- paid for once. This is what stops a double-submitted checkout from charging
-- the student twice.
create unique index if not exists payments_one_paid_per_student_course
  on public.payments (student_id, course_id)
  where status = 'paid';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Maintains updated_at. Application code never sets it by hand, so it cannot
-- drift from reality.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'course_categories', 'courses', 'modules',
    'lessons', 'enrollments', 'payments'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Creates the profile row whenever a Supabase auth user is created.
--
-- SECURITY DEFINER because the insert runs as the table owner: at this point
-- there is no request-scoped JWT, so an ordinary insert would be evaluated
-- against RLS with auth.uid() null and fail.
--
-- The role is hardcoded to 'student'. It is deliberately NOT read from
-- raw_user_meta_data, because that is client-supplied and would let anyone
-- register themselves as an instructor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Authorisation helpers
--
-- SECURITY DEFINER so they can read tables whose policies are still being
-- evaluated. Without this, "is this user an instructor of this course?" inside
-- a policy on course_instructors would ask the same policy again.
--
-- STABLE because they only read, which lets the planner cache them within a
-- single query.
--
-- Each pins search_path so a caller cannot shadow these with their own objects.
-- ---------------------------------------------------------------------------

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

-- "Instructor of" means a row exists in course_instructors. It is NOT implied by
-- courses.created_by, which records provenance and confers no access.
create or replace function public.is_instructor_of(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.course_instructors
    where course_id = target_course and instructor_id = auth.uid()
  )
$$;

create or replace function public.is_enrolled_in(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments
    where course_id = target_course
      and student_id = auth.uid()
      and status <> 'dropped'
  )
$$;

-- Whether the signed-in user may read a given profile row: their own, anyone if
-- admin, or a student who shares a course with them.
create or replace function public.can_view_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_profile = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.course_instructors ci
      join public.enrollments e on e.course_id = ci.course_id
      where ci.instructor_id = auth.uid()
        and e.student_id = target_profile
    )
$$;

-- Blocks privilege escalation.
--
-- RLS cannot restrict a single column, so "a student may update their profile
-- but not their role" is not expressible as a policy. This trigger is what
-- actually enforces it, and it is the reason the escalation test in the spec's
-- verification steps must be run.
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change a role.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only an administrator can change an account status.'
      using errcode = '42501';
  end if;

  -- Refuses to remove the final administrator, which would leave nobody able
  -- to promote anyone again.
  if old.role = 'admin' and new.role <> 'admin' then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Cannot demote the last administrator.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Enabled on every table before any policy is written, so there is no window in
-- which a table is readable but has no policy yet.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'course_categories', 'courses', 'course_instructors',
    'modules', 'lessons', 'lesson_materials', 'enrollments',
    'lesson_progress', 'payments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---- profiles -------------------------------------------------------------
-- Reading: your own row, everyone if admin, or a student sharing a course with
-- you. Writing: your own non-privilege fields, or anything if admin. The role
-- and status columns are additionally guarded by a trigger, because RLS cannot
-- protect a column.

drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles
  for select to authenticated
  using (public.can_view_profile(id));

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert" on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles admin delete" on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- ---- course_categories ----------------------------------------------------

drop policy if exists "categories read" on public.course_categories;
create policy "categories read" on public.course_categories
  for select to authenticated using (true);

drop policy if exists "categories admin write" on public.course_categories;
create policy "categories admin write" on public.course_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- courses --------------------------------------------------------------
-- Readable when published to any signed-in user, or to the people who manage
-- it. Drafts stay invisible to everyone except their instructor and admins.

drop policy if exists "courses select" on public.courses;
create policy "courses select" on public.courses
  for select to authenticated
  using (
    status = 'published'
    or public.is_admin()
    or public.is_instructor_of(id)
    or public.is_enrolled_in(id)
  );

drop policy if exists "courses insert" on public.courses;
create policy "courses insert" on public.courses
  for insert to authenticated
  with check (public.is_admin() or created_by = auth.uid());

drop policy if exists "courses update" on public.courses;
create policy "courses update" on public.courses
  for update to authenticated
  using (public.is_admin() or public.is_instructor_of(id))
  with check (public.is_admin() or public.is_instructor_of(id));

drop policy if exists "courses delete" on public.courses;
create policy "courses delete" on public.courses
  for delete to authenticated
  using (public.is_admin() or public.is_instructor_of(id));

-- ---- course_instructors ---------------------------------------------------

drop policy if exists "course_instructors select" on public.course_instructors;
create policy "course_instructors select" on public.course_instructors
  for select to authenticated
  using (
    instructor_id = auth.uid()
    or public.is_admin()
    or public.is_enrolled_in(course_id)
  );

-- Only admins assign instructors. An instructor cannot add a co-instructor,
-- which stops one instructor quietly taking over another's course.
drop policy if exists "course_instructors admin write" on public.course_instructors;
create policy "course_instructors admin write" on public.course_instructors
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---- modules, lessons, lesson_materials -----------------------------------
-- These three share one access rule: admin, the course's instructor, or someone
-- enrolled in the course.

drop policy if exists "modules select" on public.modules;
create policy "modules select" on public.modules
  for select to authenticated
  using (
    public.is_admin()
    or public.is_instructor_of(course_id)
    or public.is_enrolled_in(course_id)
  );

drop policy if exists "modules write" on public.modules;
create policy "modules write" on public.modules
  for all to authenticated
  using (public.is_admin() or public.is_instructor_of(course_id))
  with check (public.is_admin() or public.is_instructor_of(course_id));

drop policy if exists "lessons select" on public.lessons;
create policy "lessons select" on public.lessons
  for select to authenticated
  using (
    exists (
      select 1 from public.modules m
      where m.id = lessons.module_id
        and (
          public.is_admin()
          or public.is_instructor_of(m.course_id)
          or public.is_enrolled_in(m.course_id)
        )
    )
  );

drop policy if exists "lessons write" on public.lessons;
create policy "lessons write" on public.lessons
  for all to authenticated
  using (
    exists (
      select 1 from public.modules m
      where m.id = lessons.module_id
        and (public.is_admin() or public.is_instructor_of(m.course_id))
    )
  )
  with check (
    exists (
      select 1 from public.modules m
      where m.id = lessons.module_id
        and (public.is_admin() or public.is_instructor_of(m.course_id))
    )
  );

drop policy if exists "lesson_materials select" on public.lesson_materials;
create policy "lesson_materials select" on public.lesson_materials
  for select to authenticated
  using (
    exists (
      select 1
      from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.id = lesson_materials.lesson_id
        and (
          public.is_admin()
          or public.is_instructor_of(m.course_id)
          or public.is_enrolled_in(m.course_id)
        )
    )
  );

drop policy if exists "lesson_materials write" on public.lesson_materials;
create policy "lesson_materials write" on public.lesson_materials
  for all to authenticated
  using (
    exists (
      select 1
      from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.id = lesson_materials.lesson_id
        and (public.is_admin() or public.is_instructor_of(m.course_id))
    )
  )
  with check (
    exists (
      select 1
      from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.id = lesson_materials.lesson_id
        and (public.is_admin() or public.is_instructor_of(m.course_id))
    )
  );

-- ---- enrollments ----------------------------------------------------------
-- A student reads and creates their own. Reading everyone in a course is what
-- gives an instructor their roster.

drop policy if exists "enrollments select" on public.enrollments;
create policy "enrollments select" on public.enrollments
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or public.is_instructor_of(course_id)
  );

-- Self-enrolment only into a published course. A draft course cannot be joined
-- by guesswork, and the price check is what makes a paid course impossible to
-- bypass here: paid enrolment happens in the webhook, not from the browser.
drop policy if exists "enrollments self insert" on public.enrollments;
create policy "enrollments self insert" on public.enrollments
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id
        and c.status = 'published'
        and c.price_centavos = 0
    )
  );

drop policy if exists "enrollments update" on public.enrollments;
create policy "enrollments update" on public.enrollments
  for update to authenticated
  using (student_id = auth.uid() or public.is_admin() or public.is_instructor_of(course_id))
  with check (student_id = auth.uid() or public.is_admin() or public.is_instructor_of(course_id));

drop policy if exists "enrollments delete" on public.enrollments;
create policy "enrollments delete" on public.enrollments
  for delete to authenticated
  using (public.is_admin());

-- ---- lesson_progress ------------------------------------------------------
-- Ownership is resolved through the parent enrollment, not by storing
-- student_id twice. One source of truth for "whose progress is this".

drop policy if exists "lesson_progress select" on public.lesson_progress;
create policy "lesson_progress select" on public.lesson_progress
  for select to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      where e.id = lesson_progress.enrollment_id
        and (
          e.student_id = auth.uid()
          or public.is_admin()
          or public.is_instructor_of(e.course_id)
        )
    )
  );

drop policy if exists "lesson_progress write" on public.lesson_progress;
create policy "lesson_progress write" on public.lesson_progress
  for all to authenticated
  using (
    exists (
      select 1 from public.enrollments e
      where e.id = lesson_progress.enrollment_id
        and (e.student_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.enrollments e
      where e.id = lesson_progress.enrollment_id
        and (e.student_id = auth.uid() or public.is_admin())
    )
  );

-- ---- payments -------------------------------------------------------------
-- Read-only to the browser. Only the Edge Function writes, using the service
-- role, which bypasses RLS by design. This is what makes a client unable to
-- mark itself paid.

drop policy if exists "payments select" on public.payments;
create policy "payments select" on public.payments
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists "payments admin delete" on public.payments;
create policy "payments admin delete" on public.payments
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage
--
-- Buckets only store bytes. Metadata lives in Postgres above.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('course-thumbnails', 'course-thumbnails', true),
  ('avatars', 'avatars', true),
  ('lesson-materials', 'lesson-materials', false),
  ('assignment-submissions', 'assignment-submissions', false)
on conflict (id) do nothing;

-- Thumbnails and avatars are public: they appear on catalogue cards and in
-- header menus, including for signed-out visitors.
drop policy if exists "public read course thumbnails" on storage.objects;
create policy "public read course thumbnails" on storage.objects
  for select using (bucket_id = 'course-thumbnails');

drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "instructors upload course thumbnails" on storage.objects;
create policy "instructors upload course thumbnails" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'course-thumbnails'
    and public.is_admin()
  );

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- lesson-materials is private and served through signed URLs.
--
-- Object keys MUST be shaped `{course_id}/{lesson_id}/{filename}` because the
-- policy below reads the course straight off the path. An object stored under
-- any other shape is invisible to this policy, which fails closed: a student
-- gets no download rather than the wrong download.
drop policy if exists "enrolled read lesson materials" on storage.objects;
create policy "enrolled read lesson materials" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lesson-materials'
    and public.is_enrolled_in(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "instructors upload lesson materials" on storage.objects;
create policy "instructors upload lesson materials" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lesson-materials'
    and public.is_instructor_of(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "admins manage submission bucket" on storage.objects;
create policy "admins manage submission bucket" on storage.objects
  for all to authenticated
  using (bucket_id = 'assignment-submissions' and public.is_admin())
  with check (bucket_id = 'assignment-submissions' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Bootstrap note
--
-- There is deliberately no "first admin" seed. Self-escalation is blocked by
-- guard_profile_privileges, so the first administrator is promoted by hand:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Run that once, from the Supabase SQL editor, against an account that already
-- exists. Nothing in the application can do it.
-- ---------------------------------------------------------------------------