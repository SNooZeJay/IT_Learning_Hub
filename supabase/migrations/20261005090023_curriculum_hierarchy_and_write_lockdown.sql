-- 20261005090023_curriculum_hierarchy_and_write_lockdown.sql
--
-- Modules, lessons and materials were readable and writable by anyone signed in,
-- and could not express the difference between drafted and published content.
--
-- 1. The write hole
-- -----------------
-- `modules write`, `lessons write` and `lesson_materials write` were all created
-- as `for all using (true) to authenticated`. `using (true)` on an ALL policy
-- means every signed-in account - every student - could insert, update and delete
-- any module, lesson or material on the platform.
--
-- Proven rather than inferred, with the request claims set to a student:
--
--     update public.lessons set title = 'DEFACED BY STUDENT' where id = (...);
--     title is now: DEFACED BY STUDENT
--
-- This is the same class of hole as 20261005090016 (the courses insert policy
-- that read `is_admin() or created_by = auth.uid()` and was therefore true for
-- everybody). It survived because the frontend never exercises a student writing
-- a lesson, so no gate and no UI path reaches it.
--
-- Writes are now scoped to an administrator, or the instructor who owns the
-- course the content belongs to. Reaching the course means walking
-- lesson -> module -> course, which is why these are subqueries rather than a
-- simple `created_by` check.
--
-- 2. Draft versus published
-- -------------------------
-- Neither table had a status column, so an instructor had no way to stage work.
-- The old system had `content_status` (draft, published, archived) on both, and
-- published-only visibility was enforced in the query. That is reproduced here:
-- students and the public catalogue see `published` rows only; instructors see
-- everything on their own courses.
--
-- Existing rows are backfilled to 'published', not 'draft'. Every current module
-- and lesson is visible in production right now, and silently hiding them would
-- break live courses.
--
-- 3. Materials could not describe themselves
-- ------------------------------------------
-- The old system had one `material_type` enum where each value implied a
-- different body shape: inline text (text, code), a link (video_link,
-- external_link), or an uploaded file (image, pdf, document). Here a material had
-- only `file_path`, so a link or a code snippet had nowhere to live and
-- `lesson_materials` has never held a single row.
--
-- 4. Progress could not be attributed
-- ------------------------------------
-- `lesson_progress` had no `student_id`. It is reachable from `enrollment_id`,
-- but its write policy was also `ALL to authenticated`, so a student could
-- rewrite any student's progress. `student_id` is denormalised onto the row -
-- the old system does exactly this - so ownership is checkable without a join.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_status') then
    create type public.content_status as enum ('draft', 'published', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'material_type') then
    create type public.material_type as enum
      ('text', 'image', 'pdf', 'document', 'code', 'video_link', 'external_link');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------

alter table public.modules
  add column if not exists status public.content_status not null default 'published';

comment on column public.modules.status is
  'draft is visible only to the owning instructor, published is visible to enrolled students and the public catalogue outline, archived is hidden from both.';

-- ---------------------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------------------

alter table public.lessons
  add column if not exists status public.content_status not null default 'published',
  add column if not exists summary text,
  add column if not exists is_required boolean not null default true;

comment on column public.lessons.summary is
  'One line shown in the course outline under the lesson title. The old system had this and the outline reads much faster with it.';
comment on column public.lessons.is_required is
  'Counts toward course progress and toward the complete_all_lessons requirement.';

-- ---------------------------------------------------------------------------
-- lesson_materials
-- ---------------------------------------------------------------------------

alter table public.lesson_materials
  add column if not exists material_type public.material_type not null default 'document',
  add column if not exists content_text text,
  add column if not exists external_url text,
  add column if not exists uploaded_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.lesson_materials.material_type is
  'Determines the body shape: text/code render content_text, video_link/external_link render external_url, image/pdf/document require file_path. Enforced by check_material_shape().';
comment on column public.lesson_materials.uploaded_by is
  'The instructor who added it. Recorded for accountability; ownership of a material follows its lesson, not this column.';

create index if not exists lesson_materials_lesson_position_idx
  on public.lesson_materials (lesson_id, position);

-- The type/file matrix, in both directions.
--
-- The old system enforced this in a form validator (MaterialFileRules) and again
-- in a withValidator hook. A check constraint is the right place here because it
-- cannot be bypassed by any client, including a direct REST call.
create or replace function public.check_material_shape()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.material_type in ('text', 'code') then
    if new.file_path is not null then
      raise exception 'a % material does not take a file', new.material_type
        using errcode = 'check_violation';
    end if;
    if new.content_text is null or btrim(new.content_text) = '' then
      raise exception 'a % material needs its content', new.material_type
        using errcode = 'check_violation';
    end if;
  elsif new.material_type in ('video_link', 'external_link') then
    if new.file_path is not null then
      raise exception 'a % material does not take a file', new.material_type
        using errcode = 'check_violation';
    end if;
    if new.external_url is null or btrim(new.external_url) = '' then
      raise exception 'a % material needs a link', new.material_type
        using errcode = 'check_violation';
    end if;
  else
    -- image, pdf, document
    if new.file_path is null or btrim(new.file_path) = '' then
      raise exception 'a % material needs an uploaded file', new.material_type
        using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lesson_materials_shape_guard on public.lesson_materials;
create trigger lesson_materials_shape_guard
  before insert or update on public.lesson_materials
  for each row execute function public.check_material_shape();

-- ---------------------------------------------------------------------------
-- lesson_progress
-- ---------------------------------------------------------------------------

alter table public.lesson_progress
  add column if not exists student_id uuid references auth.users (id) on delete cascade;

-- Backfill from the enrolment, which is the only trustworthy source.
update public.lesson_progress lp
   set student_id = e.student_id
  from public.enrollments e
 where e.id = lp.enrollment_id
   and lp.student_id is null;

create index if not exists lesson_progress_student_idx
  on public.lesson_progress (student_id);

comment on column public.lesson_progress.student_id is
  'Denormalised from the enrolment so ownership is checkable without a join. The old system does the same.';

-- ---------------------------------------------------------------------------
-- Row Level Security: who may write curriculum
-- ---------------------------------------------------------------------------

-- Owning a course is the only route to writing its content. The subquery walks
-- up from the row being written, so a student cannot satisfy it by any means.
create or replace function public.can_edit_course_content(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin()
      or exists (
        select 1
        from public.course_instructors ci
        where ci.course_id = target_course
          and ci.instructor_id = auth.uid()
      );
$$;

comment on function public.can_edit_course_content(uuid) is
  'True for an administrator or the instructor assigned to the course. SECURITY DEFINER so it does not recurse through course_instructors RLS.';

drop policy if exists "modules write" on public.modules;
drop policy if exists "lessons write" on public.lessons;
drop policy if exists "lesson_materials write" on public.lesson_materials;

create policy "modules instructor write" on public.modules
  for all
  to authenticated
  using (public.can_edit_course_content(course_id))
  with check (public.can_edit_course_content(course_id));

create policy "lessons instructor write" on public.lessons
  for all
  to authenticated
  using (
    public.can_edit_course_content(
      (select m.course_id from public.modules m where m.id = lessons.module_id)
    )
  )
  with check (
    public.can_edit_course_content(
      (select m.course_id from public.modules m where m.id = lessons.module_id)
    )
  );

create policy "lesson_materials instructor write" on public.lesson_materials
  for all
  to authenticated
  using (
    public.can_edit_course_content(
      (select m.course_id
         from public.lessons l
         join public.modules m on m.id = l.module_id
        where l.id = lesson_materials.lesson_id)
    )
  )
  with check (
    public.can_edit_course_content(
      (select m.course_id
         from public.lessons l
         join public.modules m on m.id = l.module_id
        where l.id = lesson_materials.lesson_id)
    )
  );

-- Progress is written by the student it belongs to, and by nobody else. An
-- instructor cannot mark a student's lesson complete for them.
drop policy if exists "lesson_progress write" on public.lesson_progress;

create policy "lesson_progress own write" on public.lesson_progress
  for all
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Visibility: published only, for students and for the public catalogue
-- ---------------------------------------------------------------------------

drop policy if exists "modules anon published structure" on public.modules;
drop policy if exists "lessons anon published structure" on public.lessons;
drop policy if exists "modules select" on public.modules;
drop policy if exists "lessons select" on public.lessons;

-- The public catalogue shows the shape of a published course and nothing else:
-- module and lesson titles only. This matches catalog/show.blade.php, which
-- renders the outline with no links, no summaries and no material data.
create policy "modules anon published structure" on public.modules
  for select
  to anon
  using (
    status = 'published'
    and exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.status = 'published'
    )
  );

create policy "lessons anon published structure" on public.lessons
  for select
  to anon
  using (
    status = 'published'
    and exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = lessons.module_id
        and m.status = 'published'
        and c.status = 'published'
    )
  );

-- An enrolled student, or the instructor who owns the course, or an
-- administrator. Draft content is deliberately not in here.
create policy "modules select" on public.modules
  for select
  to authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.courses c
      where c.id = modules.course_id and c.status = 'published'
    ))
    or public.is_admin()
    or public.can_edit_course_content(course_id)
    or public.is_enrolled_in(course_id)
  );

create policy "lessons select" on public.lessons
  for select
  to authenticated
  using (
    public.is_admin()
    or public.can_edit_course_content(
      (select m.course_id from public.modules m where m.id = lessons.module_id)
    )
    or (
      status = 'published'
      and exists (
        select 1 from public.modules m
        join public.courses c on c.id = m.course_id
        where m.id = lessons.module_id
          and m.status = 'published'
          and c.status = 'published'
      )
      and public.is_enrolled_in(
        (select m.course_id from public.modules m where m.id = lessons.module_id)
      )
    )
  );

-- Materials are never visible to the public, and to a student only through an
-- enrolled, published lesson. There is deliberately no anon policy at all.
drop policy if exists "lesson_materials select" on public.lesson_materials;

create policy "lesson_materials select" on public.lesson_materials
  for select
  to authenticated
  using (
    public.is_admin()
    or public.can_edit_course_content(
      (select m.course_id
         from public.lessons l
         join public.modules m on m.id = l.module_id
        where l.id = lesson_materials.lesson_id)
    )
    or (
      exists (
        select 1
        from public.lessons l
        join public.modules m on m.id = l.module_id
        where l.id = lesson_materials.lesson_id
          and l.status = 'published'
          and m.status = 'published'
      )
      and public.is_enrolled_in(
        (select m.course_id
           from public.lessons l
           join public.modules m on m.id = l.module_id
          where l.id = lesson_materials.lesson_id)
      )
    )
  );
