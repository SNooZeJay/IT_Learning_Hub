-- ============================================================================
-- 0006 - anon grants do not depend on RLS staying switched on
-- ============================================================================
--
-- What 0005 left behind
--
-- 0005 correctly gave `anon` read access to published listings. It did not fully
-- clean up: `anon` still held a table-level SELECT grant on profiles, enrollments,
-- lesson_progress, payments and lesson_materials, inherited from before. RLS was
-- filtering every one of them to zero rows, so nothing leaked - verified against
-- the live API, not assumed.
--
-- Why that is still worth fixing
--
-- A table-level grant plus a correct policy is one control. A column-level grant
-- plus a correct policy is two. The difference matters on the day somebody
-- disables RLS on a table to debug something, or a future migration creates a
-- table and copies a grant list, or someone runs a query as a role that bypasses
-- RLS. In every one of those cases the policy is the only thing standing between
-- the public internet and the payments table.
--
-- `anon` has no reason to hold any privilege on a table it may never read. This
-- migration revokes it, so the safe state is the default state and a policy
-- regression is not required for a leak to happen.
--
-- Public access is re-granted explicitly at the end rather than left implicit, so
-- the complete set of tables an anonymous visitor can read is readable in one
-- place: courses, course_categories, modules (structure), lessons (structure).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nothing an anonymous visitor may never read.
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon;
revoke all on public.enrollments from anon;
revoke all on public.lesson_progress from anon;
revoke all on public.payments from anon;
revoke all on public.lesson_materials from anon;
revoke all on public.course_instructors from anon;

-- ---------------------------------------------------------------------------
-- The complete public surface, restated.
-- ---------------------------------------------------------------------------

revoke all on public.courses from anon;
revoke all on public.course_categories from anon;
revoke all on public.modules from anon;
revoke all on public.lessons from anon;

grant select on public.courses to anon;
grant select on public.course_categories to anon;
grant select (id, course_id, title, position) on public.modules to anon;
grant select (id, module_id, title, position, duration_minutes) on public.lessons to anon;

-- ---------------------------------------------------------------------------
-- Assert the boundary rather than trusting the statements above.
--
-- Each of these fails the migration if the state it protects has drifted, so a
-- future change that widens access loudly stops instead of shipping quietly.
-- ---------------------------------------------------------------------------

do $$
declare
  tbl text;
begin
  -- Money and personal data must be unreachable to anon at the GRANT layer, not
  -- merely filtered by a policy.
  foreach tbl in array array['profiles', 'enrollments', 'lesson_progress', 'payments',
                             'lesson_materials', 'course_instructors']
  loop
    if has_table_privilege('anon', 'public.' || tbl, 'SELECT') then
      raise exception 'anon must not hold SELECT on public.%', tbl;
    end if;
  end loop;

  -- The paid material must stay ungranted even though its rows are visible.
  if has_column_privilege('anon', 'public.lessons', 'content', 'SELECT') then
    raise exception 'anon must not hold SELECT on lessons.content';
  end if;
  if has_column_privilege('anon', 'public.lessons', 'video_url', 'SELECT') then
    raise exception 'anon must not hold SELECT on lessons.video_url';
  end if;
  if has_column_privilege('anon', 'public.modules', 'description', 'SELECT') then
    raise exception 'anon must not hold SELECT on modules.description';
  end if;

  -- The public surface must still work, or this migration has broken the site.
  if not has_table_privilege('anon', 'public.courses', 'SELECT') then
    raise exception 'anon must hold SELECT on courses (published rows, via policy)';
  end if;
  if not has_column_privilege('anon', 'public.lessons', 'title', 'SELECT') then
    raise exception 'anon must hold SELECT on lessons.title';
  end if;
end $$;
