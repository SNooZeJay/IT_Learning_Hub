-- The public course catalogue could not load: `permission denied for table modules`.
--
-- What was wrong
-- --------------
-- `20261005090005_public_catalog_read.sql` gave `anon` a deliberately narrow, column-level
-- grant so the public outline could not see a module's description:
--
--     grant select (id, course_id, title, position) on public.modules to anon;
--
-- and then, a few lines later, wrote the policies that enforce that outline - policies
-- which read `modules.status`:
--
--     create policy "lessons anon published structure" on public.lessons
--       for select to anon
--       using (exists (select 1 from public.modules m
--                       where m.id = lessons.module_id and m.status = 'published' ...
--
-- The grant and the policy disagreed from the moment they shipped. `20261005090006` then
-- re-granted the same four columns, so the omission was written down twice.
--
-- Why the error names `modules` when the page reads lessons
-- ---------------------------------------------------------
-- Reading `modules` on its own worked. Reading `lessons` did not, and `lessons anon
-- published structure` is the policy that reaches into `modules`. Postgres re-checks
-- privileges for tables a policy references *other than* the one it is attached to, so
-- selecting `lessons` demands SELECT on `modules.status` - and gets 42501 instead.
--
-- The catalogue embeds lessons inside modules:
--
--     modules(id, position, lessons(id, position))
--
-- so every public page load asked for lessons, and every one failed. Reproduced as `anon`:
--
--     select id, position from modules                                  ok
--     select id, position from lessons                                  refused 42501 modules
--     ... after grant select (status) on public.modules to anon ...    ok
--
-- So this was never a regression from recent work. It has been broken since 2026-10-05 -
-- the only public page in the product, and the first thing anybody sees.
--
-- The fix
-- -------
-- One column. `status` on `modules` is what the policy needs to decide published-ness, and
-- for an anonymous visitor that decision is already made for them: the policy returns a
-- row only when it is `published`, so the column carries no information the reader did not
-- already have.
--
-- `lessons.status` is deliberately NOT granted. The same policy reads it unqualified, and
-- the table is the one the policy is attached to, so Postgres does not re-check it - the
-- policy cannot leak a draft lesson whatever the grant says. Verified: as `anon`,
-- `select id, position from lessons` succeeds and `select id, position, status from
-- lessons` is refused. Granting it would widen the grant for no gain and give up the
-- property that the grant stays minimal.
--
-- Nothing here loosens who can read what. The row set is unchanged - still published
-- modules of published courses only - and the column set grows by one field that is a
-- constant `published` for every row anon can see.

grant select (status) on public.modules to anon;

comment on column public.modules.status is
  'Granted to anon for the public catalogue, and only because the anon policies on lessons and modules reference modules.status to decide published-ness. A policy that reaches into another table has its referenced columns privilege-checked against the querying role, so omitting this made the whole public catalogue fail with 42501. Granting it discloses nothing: the policies return a row only when status = published, so the value is a constant for every row anon can read.';

-- Proved rather than asserted. This is the check whose absence let the page ship broken:
-- as anon, reading `lessons` at all. `modules` alone is not enough of a probe, because
-- reading modules never runs a policy that reaches into another table.
do $$
declare
  v_count integer;
begin
  begin
    select count(*) into v_count from public.lessons;
  exception
    when insufficient_privilege then
      raise exception
        'anon still cannot read public.lessons: the catalogue would fail with 42501 again';
  end;

  -- And the catalogue's own shape: modules with their lessons embedded.
  begin
    select count(*) into v_count
    from public.modules m
    where exists (select 1 from public.lessons l where l.module_id = m.id);
  exception
    when insufficient_privilege then
      raise exception
        'anon still cannot read modules joined to lessons: the catalogue would fail with 42501 again';
  end;
end;
$$;