-- A notice has to say who posted it, and RLS would not let it find out.
--
-- `can_view_profile` admits a person seeing themselves, any administrator, and any student
-- enrolled in a course they teach. It does not admit a student seeing the instructor who
-- wrote to them, so PostgREST's embedded `profiles` join comes back null and every notice
-- reads "posted by nobody" - which is precisely the fact a notice most needs to carry.
--
-- Widening that predicate would publish every instructor's email to every student, so this
-- returns the two fields a byline needs and nothing else: no email, no phone, no bio, no
-- profile id.
--
-- The guard is the announcement itself. The caller must be able to read the notice under
-- the same policy, re-checked here, so this cannot be used to ask about a draft they may
-- not see or about a course they have no place in.
create or replace function public.announcement_byline(p_announcement_ids uuid[])
returns table (id uuid, author_name text, author_role text)
language sql
stable
security definer
set search_path = public
as $fn$
  select a.id,
         coalesce(p.full_name, 'IT Learning Hub'),
         case p.role when 'admin' then 'admin' when 'instructor' then 'instructor' else 'staff' end
    from public.announcements a
    left join public.profiles p on p.id = a.author_id
   where a.id = any (p_announcement_ids)
     and (
       a.published_at is not null
       or a.author_id = auth.uid()
       or public.is_admin()
       or (a.course_id is not null and public.is_instructor_of(a.course_id))
     );
$fn$;

comment on function public.announcement_byline(uuid[]) is
  'Author name and role for the given announcements. Names only, no email or contact details. Re-checks that the caller may read each notice under the same policy as the table.';

revoke all on function public.announcement_byline(uuid[]) from public, anon;
grant execute on function public.announcement_byline(uuid[]) to authenticated;