-- `certificates` keys the owner as `user_id`, not `student_id`.
create or replace function public.certificates_notify_issued()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public.notify(new.user_id, 'certificate_issued', 'Certificate issued',
    'Your certificate for this course is ready to view.', '/profile');
  return new;
end; $fn$;
