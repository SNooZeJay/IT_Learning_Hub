-- A student could not start a conversation with anyone, and the interface showed
-- "Finding people" for ever instead of saying so.
--
-- What was wrong
-- --------------
-- `listMessageablePeople()` builds the recipient list in the browser:

--     supabase.from('enrollments')
--       .select('courses!inner(id, title, course_instructors!inner(profiles!inner(id, full_name)))')
--       .eq('student_id', me.id)
--
-- The `profiles!inner` is the problem. `profiles select` is `can_view_profile(id)`, and
-- that function permits exactly three things:
--
--     target_profile = auth.uid()
--       or public.is_admin()
--       or exists (... where ci.instructor_id = auth.uid() and e.student_id = target_profile)
--
-- The third clause is one-directional: an instructor may see their own students. Nothing
-- lets a **student** see an instructor. So the innermost `!inner` join matches no rows,
-- the `enrollments` rows are dropped with it, and the picker resolves to an empty list.
--
-- Confirmed in the browser as Joren Lalamonan, signed in as a real student: the compose
-- dialog opened and sat on "Finding people" indefinitely, with an empty recipient select.
-- The instructor's direction is unaffected - `can_view_profile` does allow an instructor
-- to read their students' profiles.
--
-- Why the browser could not fix this
-- ----------------------------------
-- It is not a missing grant. A student's RLS deliberately does not let them read an
-- instructor's profile row, and that is a reasonable rule to hold - the name on a profile
-- is not the only thing that row carries. So the fix is not to widen `can_view_profile`,
-- which would expose every profile field of every instructor to every student. It is to
-- stop asking the browser for a row it is not allowed to have.
--
-- `messageable_people()` returns just what the picker renders - an id and a name - for
-- the people the caller already has a real relationship with, and nothing else. Same shape
-- and same reasoning as `conversation_inbox`.
--
-- SECURITY DEFINER because the caller cannot otherwise read the peer's name. The boundary
-- is inside the function and is not RLS: both branches are driven from a relationship the
-- caller is already party to - their own enrolments, or the courses they are assigned to.
-- `search_path` is pinned, and the row set is the same set the previous query intended to
-- return.

create or replace function public.messageable_people()
returns table (
  person_id   uuid,
  person_name text,
  via         text
)
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  -- A student's side: the instructors of the courses they are enrolled in, restricted to
  -- enrolments that grant something. A pending enrolment has paid nothing and a dropped
  -- one has been left, so neither is someone you can write to.
  select
    ci.instructor_id,
    pr.full_name,
    c.title
  from public.enrollments e
  join public.courses c on c.id = e.course_id
  join public.course_instructors ci on ci.course_id = c.id
  join public.profiles pr on pr.id = ci.instructor_id
  where e.student_id = auth.uid()
    and e.status in ('active', 'completed')

  union all

  -- An instructor's side: the students enrolled in the courses they teach. `can_view_profile`
  -- already permits this direction, so it is here for one query rather than two.
  select
    e.student_id,
    pr.full_name,
    c.title
  from public.course_instructors mine
  join public.courses c on c.id = mine.course_id
  join public.enrollments e on e.course_id = c.id
  join public.profiles pr on pr.id = e.student_id
  where mine.instructor_id = auth.uid()
    and e.status in ('active', 'completed')
    and e.student_id <> auth.uid()
$$;

comment on function public.messageable_people() is
  'The people the signed-in user can start a conversation with: a student''s instructors, an instructor''s students, both limited to enrolments that grant access. Returns an id and a name and nothing else. Exists because profiles select is can_view_profile, which lets an instructor see their own students but not the reverse, so the client-side join to profiles dropped every row and the picker was permanently empty. Widening can_view_profile was rejected: it would expose every column of every instructor profile to every student.';

revoke execute on function public.messageable_people() from anon;
revoke execute on function public.messageable_people() from public;
grant execute on function public.messageable_people() to authenticated;

-- Proved, not asserted: the previous failure was a silent empty list, so a check that only
-- runs when the answer is wrong would never have caught it.
-- Proved, not asserted: the previous failure was a silent empty list, so a check that
-- only runs when the answer is wrong would never have caught it.
--
-- Skipped when there is no caller. A migration runs as postgres with no JWT, so auth.uid()
-- is null and both branches are legitimately empty. The first version of this guard
-- raised on that and failed the push with a message blaming the function.
--
-- A guard that cannot be evaluated must not report either verdict. "Nobody is asking" is
-- not "nobody exists to ask", and the two must not share a branch.
do $$
declare
  v_caller  uuid := auth.uid();
  v_count   integer;
  v_checked boolean := false;
begin
  if v_caller is not null then
    select count(*) into v_count from public.messageable_people();
    v_checked := true;

    if v_count = 0 then
      raise exception
        'messageable_people() returned nobody for caller %; the recipient picker will be empty',
        v_caller;
    end if;
  end if;

  raise notice 'messageable_people() created; caller-scoped check %',
    case when v_checked then 'ran and passed' else 'skipped, no caller in this session' end;
end;
$$;
