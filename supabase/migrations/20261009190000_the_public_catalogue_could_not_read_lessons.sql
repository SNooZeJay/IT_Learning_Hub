-- The public course catalogue could not load. `permission denied for function is_admin`.
--
-- What was wrong
-- --------------
-- Three SELECT policies were created `to public`, which in Postgres means *every* role,
-- and all three call helper functions that a later migration took away from `anon`:
--
--     lessons select            is_admin(), can_edit_course_content(), is_enrolled_in()
--     lesson_materials select   is_admin(), can_edit_course_content(), is_enrolled_in()
--     assignments select        is_admin(), is_enrolled_in(), is_instructor_of()
--
-- `20261006180000_no_function_in_public_is_executable_by_anon.sql` revoked EXECUTE on
-- the helpers from `anon` for a good reason: they expose `auth.uid()`-derived facts and
-- were never meant to be callable by an anonymous browser. That was correct.
--
-- It was incomplete, though, and in a way Postgres makes easy to miss. Permissive policies
-- are OR-ed across every policy whose role list matches the caller. For `anon`, *both*
-- `lessons select` (`to public`) and `lessons anon published structure` (`to anon`) apply,
-- and the first one is evaluated too - so `is_admin()` is called, `anon` cannot execute it,
-- and the whole statement raises 42501 instead of quietly returning false. A policy that
-- cannot even be evaluated is a hard error, not a denial.
--
-- The catalogue embeds lessons inside modules:
--
--     modules(id, position, lessons(id, position))
--
-- so every public page load asked for lessons, and every one failed. Reproduced as `anon`:
--
--     select id, title from courses                                           ok
--     select id, title, course_categories!left(name) from courses             ok
--     select id, title, modules(id, position) from courses                    ok
--     select id, title, modules(id, position, lessons(id, position)) ...      refused 42501
--
-- and the error reached the visitor as a sentence on the page:
--
--     Could not load the catalogue
--     permission denied for function is_admin
--
-- So the only public pages in the product, and the first thing anybody sees, rendered a
-- failure with a database function's name on it.
--
-- Why the previous probe missed it
-- -------------------------------
-- `20261006310000` verified the same fix by running `select count(*) from public.lessons`
-- inside a `do $$` block. That block still runs as the migration role, which can execute
-- everything, so it proved the grant and nothing about the policy. The check that matters
-- is the same statement with `role` set to `anon`, which is what the probe at the bottom of
-- this file does.
--
-- The fix
-- -------
-- Scope the three policies to the role they were written for. Every one of them is a
-- question about the *signed-in* person - `is_admin()`, `is_enrolled_in()`,
-- `is_instructor_of()`, `can_edit_course_content()` - so `authenticated` is the only role
-- that was ever meant to evaluate them. `anon` keeps exactly the narrow read it already
-- had: `lessons anon published structure`, which returns published lessons in published
-- modules of published courses and calls nothing.
--
-- Nothing here loosens who can read what:
--
--   * For a signed-in user the policy set is unchanged - the same qual, the same rows.
--   * For `anon`, `lessons` is now governed solely by `lessons anon published structure`,
--     which is the published outline the catalogue is allowed to show.
--   * `lesson_materials` and `assignments` have no `anon` policy at all, and none is added.
--     An anonymous reader gets zero rows rather than an error, which is the correct answer:
--     materials and assignments sit behind enrolment, and the public course page shows the
--     outline without them.

drop policy if exists "lessons select" on public.lessons;
create policy "lessons select" on public.lessons
  for select
  to authenticated
  using (
    is_admin()
    or can_edit_course_content((select m.course_id from public.modules m where m.id = lessons.module_id))
    or (
      status = 'published'::content_status
      and exists (
        select 1
        from public.modules m
        join public.courses c on c.id = m.course_id
        where m.id = lessons.module_id
          and m.status = 'published'::content_status
          and c.status = 'published'::course_status
      )
      and (
        is_enrolled_in((select m.course_id from public.modules m where m.id = lessons.module_id))
        or is_preview
      )
    )
  );

drop policy if exists "lesson_materials select" on public.lesson_materials;
create policy "lesson_materials select" on public.lesson_materials
  for select
  to authenticated
  using (
    is_admin()
    or can_edit_course_content((
      select m.course_id
      from public.lessons l
      join public.modules m on m.id = l.module_id
      where l.id = lesson_materials.lesson_id
    ))
    or (
      exists (
        select 1
        from public.lessons l
        join public.modules m on m.id = l.module_id
        where l.id = lesson_materials.lesson_id
          and l.status = 'published'::content_status
          and m.status = 'published'::content_status
      )
      and (
        is_enrolled_in((
          select m.course_id
          from public.lessons l
          join public.modules m on m.id = l.module_id
          where l.id = lesson_materials.lesson_id
        ))
        or exists (select 1 from public.lessons l where l.id = lesson_materials.lesson_id and l.is_preview)
      )
    )
  );

drop policy if exists "assignments select" on public.assignments;
create policy "assignments select" on public.assignments
  for select
  to authenticated
  using (is_instructor_of(course_id) or is_admin() or is_enrolled_in(course_id));

-- Proved rather than asserted, and proved as `anon` this time. Running the probe as the
-- migration role is what let the previous version of this check report success on a
-- statement that was failing for every real caller.
do $$
declare
  v_saved text := current_setting('role', true);
  v_count integer;
begin
  perform set_config('role', 'anon', true);

  -- The catalogue's own shape: modules with their lessons embedded.
  begin
    select count(*) into v_count
    from public.courses c
    where c.status = 'published'::course_status
      and exists (
        select 1
        from public.modules m
        join public.lessons l on l.module_id = m.id
        where m.course_id = c.id
      );
  exception when others then
    perform set_config('role', coalesce(v_saved, 'postgres'), true);
    raise exception
      'anon still cannot read the published course outline (modules with lessons embedded): %',
      sqlerrm;
  end;

  if v_count = 0 then
    perform set_config('role', coalesce(v_saved, 'postgres'), true);
    raise exception
      'anon reads the published course outline but it is empty, so the catalogue would render nothing';
  end if;

  -- And the two tables an anonymous visitor must get zero rows from, quietly. A refusal
  -- here is not a leak, but it is a 42501 on any page that embeds them, so it must not
  -- raise.
  begin
    select count(*) into v_count from public.lesson_materials;
  exception when others then
    perform set_config('role', coalesce(v_saved, 'postgres'), true);
    raise exception 'anon cannot read public.lesson_materials without erroring: %', sqlerrm;
  end;

  begin
    select count(*) into v_count from public.assignments;
  exception when others then
    perform set_config('role', coalesce(v_saved, 'postgres'), true);
    raise exception 'anon cannot read public.assignments without erroring: %', sqlerrm;
  end;

  perform set_config('role', coalesce(v_saved, 'postgres'), true);
end;
$$;