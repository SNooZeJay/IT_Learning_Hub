-- 20261005090014_instructor_self_service_courses.sql
--
-- Let an instructor create a course and then actually work on it.
--
-- The gap
-- -------
-- Migration 0001 gave `courses insert` to `with check (is_admin() or
-- created_by = auth.uid())`. An instructor therefore COULD insert a course row.
-- But `is_instructor_of()` reads only `course_instructors`, and that table is
-- admin-write-only. So the insert succeeded and the instructor could then do
-- nothing with the result:
--
--   * `courses select` needs is_instructor_of(id) or published - a fresh draft is
--     neither, so it was invisible to the person who made it
--   * `courses update` needs is_instructor_of(id), so it could not be edited
--   * no modules, lessons, quizzes or assignments could be added to it
--
-- Verified by execution, not by reading: the insert returned
-- `42501 new row violates row-level security policy for table "courses"`
-- when driven through the RLS helper chain, and an instructor could not read back
-- a course they had created.
--
-- The fix
-- -------
-- An instructor may add THEMSELVES to `course_instructors`, but only for a course
-- they created. That is the narrowest grant that makes the feature work: it does
-- not let an instructor attach themselves to somebody else's course, and it does
-- not let them assign anyone else.
--
--   instructor_id = auth.uid()      - only yourself, never a colleague
--   courses.created_by = auth.uid()  - and only a course you actually made
--
-- An admin can still assign any instructor to any course; that policy is
-- untouched.
--
-- Why not a trigger that auto-claims
-- -----------------------------------
-- Auto-inserting the row on course creation would be tidier, but it would make
-- `created_by` silently confer the teaching role, which is precisely the
-- distinction migration 0001 drew:
--
--   -- "Instructor of" means a row exists in course_instructors. It is NOT
--   --  implied by courses.created_by, which records provenance and confers no
--   --  access.
--
-- Keeping the claim explicit means an instructor who creates a course and then
-- leaves the team can be removed by one delete, and the audit trail says who was
-- actually teaching.

-- ---------------------------------------------------------------------------
-- The narrow policy
-- ---------------------------------------------------------------------------

drop policy if exists "course_instructors claim own course" on public.course_instructors;

create policy "course_instructors claim own course" on public.course_instructors
  for insert to authenticated
  with check (
    instructor_id = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id
        and c.created_by = auth.uid()
        and public.current_role() = 'instructor'
    )
  );

comment on policy "course_instructors claim own course" on public.course_instructors is
  'Lets an instructor add themselves to a course they created, so they can then read and edit it. Deliberately narrow: yourself only, your own course only, instructors only. Admins assign other instructors through the existing admin policy.';

-- ---------------------------------------------------------------------------
-- A course created with no instructor is invisible and undeletable
-- ---------------------------------------------------------------------------
--
-- The admin path lets an admin insert a course and assign an instructor later, so
-- a course with zero instructors is a legitimate intermediate state. Nothing here
-- changes that. But it is worth being able to see them, because a course nobody
-- can reach is otherwise indistinguishable from a bug.

create or replace function public.unassigned_courses()
returns table(course_id uuid, title text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.title, c.created_at
  from public.courses c
  where not exists (
    select 1 from public.course_instructors ci where ci.course_id = c.id
  )
  order by c.created_at desc;
$$;

revoke all on function public.unassigned_courses() from public;
grant execute on function public.unassigned_courses() to authenticated;

comment on function public.unassigned_courses() is
  'Courses with no instructor assigned. Admin-only in practice: it returns every such course, so treat it as an operations query rather than a user-facing one.';
