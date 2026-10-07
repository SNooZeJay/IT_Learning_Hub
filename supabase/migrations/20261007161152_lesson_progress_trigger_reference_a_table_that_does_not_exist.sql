-- Completing a lesson failed for every student.
--
-- check_progress_lesson_in_course read `c.id`, an alias never present in the FROM
-- clause, so Postgres raised "missing FROM-clause entry for table c" on every update.
-- No student had ever recorded a lesson completion: certificates empty, course
-- completion unreachable, progress looking like nobody had started.
create or replace function public.check_progress_lesson_in_course()
returns trigger
language plpgsql
as $fn$
declare
  v_enrolment_course uuid;
  v_lesson_course     uuid;
begin
  select e.course_id into v_enrolment_course
    from public.enrollments e where e.id = new.enrollment_id;

  select l.course_id into v_lesson_course
    from public.lessons l
   where l.id = new.lesson_id;

  if v_enrolment_course is null or v_lesson_course is null then
    return new;
  end if;

  if v_enrolment_course <> v_lesson_course then
    raise exception
      'progress on enrolment % (course %) references lesson % (course %)',
      new.enrollment_id, v_enrolment_course, new.lesson_id, v_lesson_course
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;
