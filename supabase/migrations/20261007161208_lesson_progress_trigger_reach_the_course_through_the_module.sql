-- Correction. `lessons` carries no `course_id`; a lesson's course is only reachable
-- through its module, which is why the original query joined `modules`.
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

  select m.course_id into v_lesson_course
    from public.lessons l
    join public.modules m on m.id = l.module_id
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
