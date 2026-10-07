drop trigger if exists certificates_notify_issued on public.certificates;
create trigger certificates_notify_issued after insert on public.certificates for each row
  execute function public.certificates_notify_issued();
revoke all on function public.certificates_notify_issued() from anon, authenticated;
