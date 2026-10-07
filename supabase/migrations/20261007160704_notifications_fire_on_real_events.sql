-- The notifications feature was unreachable. notify() and notify_course() existed and
-- nothing called them, so the table could only ever be empty.

create or replace function public.enrollments_notify()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_title text;
begin
  if new.status = 'active' then v_title := 'Enrollment confirmed';
  elsif new.status = 'completed' then v_title := 'Course completed';
  else return new; end if;
  perform public.notify(new.student_id,
    case when new.status = 'completed' then 'course_completed' else 'enrolment_confirmed' end::notification_type,
    v_title, 'Your progress on this course is recorded against your account.', '/student/courses');
  return new;
end; $fn$;

drop trigger if exists enrollments_notify on public.enrollments;
create trigger enrollments_notify after insert on public.enrollments for each row
  when (new.status in ('active','completed')) execute function public.enrollments_notify();

create or replace function public.payments_notify_settled()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_student uuid;
begin
  if new.status is distinct from 'paid' or old.status is not distinct from 'paid' then return new; end if;
  select e.student_id into v_student from public.enrollments e where e.id = new.enrollment_id;
  if v_student is not null then
    perform public.notify(v_student, 'payment_received', 'Payment received',
      'Your payment has been confirmed and your place is recorded.', '/student/courses');
  end if;
  return new;
end; $fn$;

drop trigger if exists payments_notify_settled on public.payments;
create trigger payments_notify_settled after update on public.payments for each row
  execute function public.payments_notify_settled();

create or replace function public.quiz_attempts_notify()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_title text; v_type notification_type; v_name text;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    v_title := 'Quiz submitted'; v_type := 'quiz_graded'; v_name := 'A quiz was submitted';
  elsif new.status = 'graded' and old.status is distinct from 'graded' then
    v_title := 'Quiz graded'; v_type := 'quiz_graded'; v_name := 'A quiz was graded';
  else return new; end if;
  perform public.notify(new.student_id, v_type, v_title, v_name, '/student/grades');
  return new;
end; $fn$;

drop trigger if exists quiz_attempts_notify on public.quiz_attempts;
create trigger quiz_attempts_notify after update on public.quiz_attempts for each row
  execute function public.quiz_attempts_notify();

create or replace function public.assignment_submissions_notify()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_title text; v_type notification_type; v_name text;
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    v_title := 'Work handed in'; v_type := 'assignment_graded'; v_name := 'An assignment was handed in';
  elsif new.status = 'graded' and old.status is distinct from 'graded' then
    v_title := 'Work graded'; v_type := 'assignment_graded'; v_name := 'An assignment was graded';
  else return new; end if;
  perform public.notify(new.student_id, v_type, v_title, v_name, '/student/grades');
  return new;
end; $fn$;

drop trigger if exists assignment_submissions_notify on public.assignment_submissions;
create trigger assignment_submissions_notify after update on public.assignment_submissions for each row
  execute function public.assignment_submissions_notify();

create or replace function public.announcements_notify_course()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public.notify_course(new.course_id, 'announcement', 'New announcement',
    coalesce(new.title, 'An announcement was posted'),
    coalesce('/instructor/courses/' || new.course_id::text, '/instructor/courses'));
  return new;
end; $fn$;

drop trigger if exists announcements_notify_course on public.announcements;
create trigger announcements_notify_course after insert on public.announcements for each row
  execute function public.announcements_notify_course();

revoke all on function public.enrollments_notify() from anon, authenticated;
revoke all on function public.payments_notify_settled() from anon, authenticated;
revoke all on function public.quiz_attempts_notify() from anon, authenticated;
revoke all on function public.assignment_submissions_notify() from anon, authenticated;
revoke all on function public.announcements_notify_course() from anon, authenticated;
