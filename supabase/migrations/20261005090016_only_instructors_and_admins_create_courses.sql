-- 20261005090016_only_instructors_and_admins_create_courses.sql
--
-- Closes a pre-existing hole: any signed-in user could create a course.
--
-- The bug
-- -------
-- Migration 0001 wrote the courses INSERT policy as:
--
--   with check (public.is_admin() or created_by = auth.uid())
--
-- `created_by = auth.uid()` is true for EVERY signed-in user, because a client
-- chooses its own `created_by`. So the policy's second clause granted course
-- creation to students as well as instructors and admins. Verified by execution
-- rather than by reading - a row inserted cleanly as a student:
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<student>","role":"authenticated"}';
--   with a as (insert into public.courses (title, slug, created_by)
--               values ('X','audit-x','<student>') returning id)
--   select count(*) from a;   -- 1
--
-- This went unnoticed because RLS was never actually exercised against a
-- non-admin role until this session, and because the earlier verification
-- harness was silently running as postgres.
--
-- The fix
-- -------
-- Name the roles that may create courses rather than relying on `created_by`,
-- which says who made a row rather than whether they are allowed to.
--
-- An instructor creating a course is legitimate - that is what makes the
-- self-service flow in 20261005090014 work. A student creating one is not, and
-- has no path to teaching it: `course_instructors` remains admin-write-only
-- apart from an instructor claiming their own course, so a student's draft would
-- be a course nobody could ever edit.

drop policy if exists "courses insert" on public.courses;

create policy "courses insert" on public.courses
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.current_role() = 'instructor'
      and created_by = auth.uid()
    )
  );

comment on policy "courses insert" on public.courses is
  'Admins, and instructors creating a course they will teach. Deliberately names current_role() rather than relying on created_by = auth.uid(), which was true for every signed-in user and let students create courses.';

-- ---------------------------------------------------------------------------
-- The same mistake, checked for elsewhere
-- ---------------------------------------------------------------------------
--
-- `created_by = auth.uid()` is only meaningful as an INSERT guard when paired
-- with a role check. Used alone it is an authorisation check that authorises
-- everyone. Confirm no other policy relies on it in the same way.

-- assert_no_permissive_created_by  (documentation-as-code: run this by hand)
--
--   select tablename, policyname, cmd, with_check
--     from pg_policies
--    where schemaname = 'public'
--      and cmd = 'INSERT'
--      and with_check like '%created_by = auth.uid()%'
--      and with_check not like '%current_role%';
--
-- Expect zero rows. A row here means the same hole exists on another table.
