-- Course completion is an UPDATE, not an INSERT, so the earlier trigger never saw it.
create or replace function public.enrollments_notify_completion()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.notify(new.student_id, 'course_completed', 'Course completed',
      'You have finished every lesson this course required.', '/student/courses');
  end if;
  return new;
end; $fn$;

drop trigger if exists enrollments_notify_completion on public.enrollments;
create trigger enrollments_notify_completion after update on public.enrollments for each row
  execute function public.enrollments_notify_completion();

revoke all on function public.enrollments_notify_completion() from anon, authenticated;
