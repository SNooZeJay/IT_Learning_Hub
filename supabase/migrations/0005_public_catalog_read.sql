-- ============================================================================
-- 0005 - let a signed-out visitor read a published course's LISTING
-- ============================================================================
--
-- Why this exists
--
-- The public catalogue and the public course page are the landing page's primary
-- action. Every SELECT policy in 0001 was granted to `authenticated` only, so an
-- anonymous visitor could read nothing at all: `courses`, `course_categories`,
-- `modules` and `lessons` all returned zero rows.
--
-- The visible consequence was worse than a missing feature. The landing page's
-- "Published courses" section reads from `courses`. With no anon access it always
-- fell through to its empty state, which says "No courses published yet" - a
-- flat statement of falsehood, because five courses are published. An honest
-- empty state stops being honest the moment real data exists behind it.
--
-- The security problem
--
-- Opening read access to `lessons` is the dangerous part of this migration, and it
-- is the reason this is not a one-line policy change. `lessons.content` holds the
-- lesson body - the actual paid material. `lessons.video_url` points at the media.
-- Granting row access alone would publish both.
--
-- Row Level Security cannot express "these columns but not those". Postgres can:
-- a column-level GRANT. So anon gets table-level access to `courses` and
-- `course_categories` (every column on a published course is public anyway - the
-- product spec shows the price on the card), and COLUMN-level access to `modules`
-- and `lessons`, naming only the fields the public outline is allowed to show.
--
-- What anon can therefore read, exactly:
--   courses            every column, published rows only
--   course_categories  every column
--   modules            id, course_id, title, position        (no description)
--   lessons            id, module_id, title, position, duration_minutes
--                                                   (no content, no video_url)
--
-- The public outline in the old system is "Module and lesson titles only. Lesson
-- content and materials stay private until you enrol", and this is that rule
-- enforced by the database rather than by the view that displays it.
--
-- Everything else stays shut. `lesson_materials` gets no anon grant at all, so
-- material titles and links are unreachable. `profiles`, `enrollments`,
-- `lesson_progress` and `payments` are untouched and remain authenticated-only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Start from zero rather than from whatever was granted before.
--
-- Revoking ALL first makes this migration idempotent and, more importantly,
-- makes it safe to re-run after someone has widened a grant by hand: the final
-- state is written out in full rather than added to.
-- ---------------------------------------------------------------------------

revoke all on public.courses from anon;
revoke all on public.course_categories from anon;
revoke all on public.modules from anon;
revoke all on public.lessons from anon;
revoke all on public.lesson_materials from anon;

-- ---------------------------------------------------------------------------
-- courses and categories: full rows, published only.
--
-- Every column here is already public by design. A catalogue card shows the
-- title, description, level, duration and peso price; a course page adds the
-- outline. Nothing on a published course row is secret - `created_by` is a user id
-- that the UI never renders, and the product spec forbids publishing an
-- instructor's email address, which is not on this table.
-- ---------------------------------------------------------------------------

grant select on public.courses to anon;
grant select on public.course_categories to anon;

drop policy if exists "courses anon published" on public.courses;
create policy "courses anon published"
  on public.courses
  for select
  to anon
  using (status = 'published');

drop policy if exists "categories anon read" on public.course_categories;
create policy "categories anon read"
  on public.course_categories
  for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- modules: structure only.
--
-- The policy limits rows to modules of a published course. The column grant limits
-- the fields to the four the public outline shows. Both are needed - the policy
-- alone would still expose a module's description.
-- ---------------------------------------------------------------------------

grant select (id, course_id, title, position) on public.modules to anon;

drop policy if exists "modules anon published structure" on public.modules;
create policy "modules anon published structure"
  on public.modules
  for select
  to anon
  using (
    exists (
      select 1 from public.courses c
       where c.id = modules.course_id
         and c.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- lessons: titles, order and duration only. No content, no video.
--
-- This is the policy that matters. `content` and `video_url` are the paid
-- material, and they are not in the grant list above, so `select content from
-- lessons` as anon fails with `permission denied for table lessons` even though
-- the row is visible.
--
-- `is_required` is included in the policy intent but not granted: the public page
-- renders every lesson, so the column is not needed to draw the outline.
-- ---------------------------------------------------------------------------

grant select (id, module_id, title, position, duration_minutes) on public.lessons to anon;

drop policy if exists "lessons anon published structure" on public.lessons;
create policy "lessons anon published structure"
  on public.lessons
  for select
  to anon
  using (
    exists (
      select 1
        from public.modules m
        join public.courses c on c.id = m.course_id
       where m.id = lessons.module_id
         and c.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- Confirm the gate did not drift.
--
-- `lesson_materials` was revoked and never re-granted, so anon cannot reach a
-- material's title, body or link. Asserted here so a future migration that grants
-- broadly fails loudly instead of silently publishing paid material.
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('anon', 'public.lesson_materials', 'SELECT') then
    raise exception 'anon must not be able to read lesson_materials';
  end if;

  -- The paid columns must stay unreachable. has_column_privilege is the check that
  -- actually proves the column grant worked, because a table-level grant would
  -- make every column readable.
  if has_column_privilege('anon', 'public.lessons', 'content', 'SELECT') then
    raise exception 'anon must not be able to read lessons.content';
  end if;

  if has_column_privilege('anon', 'public.lessons', 'video_url', 'SELECT') then
    raise exception 'anon must not be able to read lessons.video_url';
  end if;

  if has_column_privilege('anon', 'public.modules', 'description', 'SELECT') then
    raise exception 'anon must not be able to read modules.description';
  end if;
end $$;
