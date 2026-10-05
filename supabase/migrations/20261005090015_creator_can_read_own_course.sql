-- 20261005090015_creator_can_read_own_course.sql
--
-- Fixes a deadlock that made instructor self-service impossible.
--
-- The bug
-- ------
-- 20261005090014 let an instructor add themselves to `course_instructors` for a
-- course they created. That was necessary but not sufficient, and the reason is a
-- chicken-and-egg problem:
--
--   * `courses select` allows a row when it is published, OR the caller is an
--     admin, OR `is_instructor_of(id)`, OR the caller is enrolled.
--   * A brand-new course is a DRAFT and has no `course_instructors` row, so all
--     four branches are false.
--   * The claim itself is `insert ... select id from courses where slug = ...`,
--     and that SELECT is filtered by the very policy above.
--   * So the lookup found nothing, the INSERT matched zero rows, and it did so
--     WITHOUT raising an error. The instructor clicked "save", saw success, and
--     the course remained invisible and uneditable forever.
--
-- Verified by execution, across two committed transactions:
--
--   create as instructor  -> row exists, created_by = the instructor
--   select count(*) where slug = ... as that instructor -> 0
--   claim                 -> 0 rows inserted, no error
--
-- Adding `created_by = auth.uid()` to the SELECT policy breaks the deadlock: the
-- creator can always read their own course, so the claim's lookup succeeds, so
-- `is_instructor_of` becomes true, and from then on the normal instructor
-- policies take over.
--
-- Why this is safe
-- ----------------
-- `created_by` is set by the inserting user and is immutable in practice: the
-- UPDATE policy requires `is_instructor_of(id) or is_admin()`, and an instructor
-- who is not yet an instructor of the course cannot change it. A student cannot
-- insert a course at all - `courses insert` requires `is_admin() or created_by =
-- auth.uid()`, and the INSERT policy's WITH CHECK does not permit a student to
-- set `created_by` to themselves for a course they may not create.
--
-- So this widens read access to exactly one thing: a course you created, before
-- you have been added to it. It grants no write access - `courses update` is
-- unchanged and still requires `is_instructor_of(id)`.
--
-- The claim policy is also replaced with a SECURITY DEFINER function, because a
-- policy whose own lookup is subject to RLS is fragile in the same way. Taking
-- the id as an argument avoids the filtered SELECT entirely, and the function
-- checks ownership as its owner rather than as the caller.

-- ---------------------------------------------------------------------------
-- The creator can read their own course
-- ---------------------------------------------------------------------------

drop policy if exists "courses select" on public.courses;

create policy "courses select" on public.courses
  for select to authenticated
  using (
    status = 'published'
    or public.is_admin()
    or public.is_instructor_of(id)
    or public.is_enrolled_in(id)
    -- Added in 20261005090015. Without this an instructor cannot see a draft
    -- they just created, which also makes the self-service claim impossible.
    or created_by = auth.uid()
  );

comment on policy "courses select" on public.courses is
  'Published to everyone signed in; plus anything you teach, are enrolled in, or created. The created_by branch exists so a new draft is visible to its author before course_instructors has a row for it.';

-- ---------------------------------------------------------------------------
-- Claiming, without a policy whose lookup is RLS-filtered
-- ---------------------------------------------------------------------------

create or replace function public.claim_own_course(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ownership is checked here, as the function owner, so it is not subject to the
  -- caller's RLS. Checking it in a policy instead meant checking it through a
  -- SELECT that the courses policy had already filtered.
  if not exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and c.created_by = auth.uid()
      and public.current_role() = 'instructor'
  ) then
    raise exception 'you can only claim a course you created'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.course_instructors (course_id, instructor_id)
  values (p_course_id, auth.uid())
  on conflict (course_id, instructor_id) do nothing;

  return true;
end;
$$;

revoke all on function public.claim_own_course(uuid) from public;
grant execute on function public.claim_own_course(uuid) to authenticated;

comment on function public.claim_own_course(uuid) is
  'Adds the calling instructor to a course they created, so they can edit it. Refuses for anyone else''s course, and for anyone who is not an instructor.';

-- The 00014 policy is now redundant and, worse, its lookup is RLS-filtered.
drop policy if exists "course_instructors claim own course" on public.course_instructors;
