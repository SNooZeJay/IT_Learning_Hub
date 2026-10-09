-- An administrator can message the people attached to courses.
--
-- `messageable_people` had exactly two branches: a student's instructors, and an
-- instructor's students. An administrator matched neither, so the picker returned
-- nothing and the messages screen showed "There is nobody to message yet" to the
-- one account on the platform that can see every enrolment.
--
-- The grant is deliberately not "every account". An administrator messaging a
-- stranger who holds no place in any course is a wider capability than the role
-- needs to run the platform, and it would be a capability nobody could later take
-- back without a migration. An administrator is already an instructor of nothing
-- and a student of nothing, so this branch is what makes the existing one
-- reachable for that role.
--
-- `is_admin()` is checked rather than the caller's role column, for the same
-- reason every other policy here uses it: the function is SECURITY DEFINER, and
-- `auth.uid()` is the only thing about the caller that cannot be spoofed from
-- inside.

create or replace function public.messageable_people()
returns table(person_id uuid, person_name text, via text)
language sql
stable security definer
set search_path TO 'public', 'pg_temp'
as $function$
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

  union all

  -- An administrator's side: the same people the teaching side can reach, in both
  -- directions, because an administrator is responsible for the whole platform and
  -- a student with a question is as much theirs to answer as an instructor's.
  select
    e.student_id,
    pr.full_name,
    c.title
  from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.profiles pr on pr.id = e.student_id
  where public.is_admin()
    and e.status in ('active', 'completed')
    and e.student_id <> auth.uid()

  union all

  select
    ci.instructor_id,
    pr.full_name,
    c.title
  from public.enrollments e
    join public.courses c on c.id = e.course_id
    join public.course_instructors ci on ci.course_id = c.id
    join public.profiles pr on pr.id = ci.instructor_id
  where public.is_admin()
    and e.status in ('active', 'completed')
    and ci.instructor_id <> auth.uid()
$function$;