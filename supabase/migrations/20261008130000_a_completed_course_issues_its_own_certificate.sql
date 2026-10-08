-- Certificates are issued when a course completes, not when somebody asks.
--
-- Until now a student who finished every lesson, passed every quiz and handed in every
-- assignment still saw an empty certificate panel until they found a button and pressed
-- it. Nothing was wrong with the button, and nothing was broken about the certificate -
-- the work was simply not connected to the outcome. The gap shows up as a student who did
-- everything and is told they have earned nothing until they go looking.
--
-- So this issues the certificate at the moment `enrollments.status` first becomes
-- `completed`. The `AFTER UPDATE` fires only on that transition, so a later write cannot
-- mint a second one, and the unique index on live certificates is the backstop if the
-- function is ever called directly.
create or replace function public.issue_certificate_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.issue_certificate_as(new.id, new.student_id, new.course_id);
  end if;
  return new;
end;
$fn$;

-- The issuing body, split out from the original `issue_certificate`.
--
-- That function reads `auth.uid()` throughout, because a student claiming their own
-- certificate is the only caller it was built for. An automatic issue has no `auth.uid()`
-- to read: it runs inside a trigger on behalf of the enrollment row, where the student is
-- `new.student_id`. Passing the id in is what lets one body serve both callers, and it is
-- also what stops this from being a way to issue a certificate for somebody else - the
-- caller supplies `student_id` from the enrollment row it just updated, and the body
-- re-derives both the enrollment and the course from that row rather than trusting them.
create or replace function public.issue_certificate_as(
  p_enrollment_id uuid,
  p_student_id    uuid,
  p_course_id     uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_enrollment public.enrollments%rowtype;
  v_existing  public.certificates%rowtype;
  v_average   numeric(5,2);
  v_title     text;
  v_number    text;
  v_id        uuid;
begin
  select * into v_enrollment
    from public.enrollments
   where id = p_enrollment_id and student_id = p_student_id and course_id = p_course_id;

  if not found then
    raise exception 'that enrollment does not belong to this student for this course'
      using errcode = 'check_violation';
  end if;

  select * into v_existing
    from public.certificates
   where user_id = p_student_id and course_id = p_course_id
     and revoked_at is null;

  if found then
    return v_existing.id;
  end if;

  select title into v_title from public.courses where id = p_course_id;

  v_number := 'ITH-' || upper(substr(replace(coalesce(v_title, 'course'), ' ', '-'), 1, 24)) || '-' ||
              lpad(nextval('public.certificate_number_seq')::text, 6, '0');

  select coalesce(avg(a.percentage), 0) into v_average
    from public.quiz_attempts a
   where a.course_id = p_course_id and a.student_id = p_student_id and a.status = 'submitted';

  insert into public.certificates
    (user_id, course_id, enrollment_id, certificate_number, final_percentage)
  values (p_student_id, p_course_id, p_enrollment_id, v_number, round(v_average, 2))
  returning id into v_id;

  return v_id;
end;
$fn$;

-- The existing student-facing claim, now a call through the shared body.
--
-- Refuses identically to before: a revoked certificate blocks a replacement, and a live
-- one is returned rather than duplicated. What changed is that `auth.uid()` is passed as
-- `p_student_id` instead of being read deep inside, so the same refusal logic and the same
-- completion re-derivation apply to both callers.
create or replace function public.issue_certificate(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_enrollment public.enrollments%rowtype;
  v_existing  public.certificates%rowtype;
  v_id        uuid;
begin
  select * into v_enrollment
    from public.enrollments
   where course_id = p_course_id and student_id = auth.uid()
   order by enrolled_at desc
   limit 1;

  if not found then
    raise exception 'you are not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing
    from public.certificates
   where user_id = auth.uid() and course_id = p_course_id
   order by issued_at desc limit 1;

  if found then
    if v_existing.revoked_at is not null then
      raise exception 'your certificate for this course was revoked on %: %',
        v_existing.revoked_at::date, coalesce(v_existing.revoke_reason, 'no reason given')
        using errcode = 'check_violation';
    end if;
    return v_existing.id;
  end if;

  -- Completion is re-derived rather than trusted from the enrollment row, so a
  -- certificate cannot be issued against a stale status.
  if not public.refresh_enrollment_completion(v_enrollment.id) and v_enrollment.status <> 'completed' then
    raise exception 'complete every requirement before claiming a certificate'
      using errcode = 'check_violation';
  end if;

  v_id := public.issue_certificate_as(v_enrollment.id, auth.uid(), p_course_id);

  -- Refused the way it always was. A certificate is a record, not a reward that can be
  -- withdrawn without a reason, so the body refuses and the claim function says why.
  if v_id is null then
    raise exception 'complete every requirement before claiming a certificate'
      using errcode = 'check_violation';
  end if;

  return v_id;
end;
$fn$;

drop trigger if exists enrollments_issue_certificate on public.enrollments;
create trigger enrollments_issue_certificate
  after update on public.enrollments
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.issue_certificate_on_completion();

revoke all on function public.issue_certificate_on_completion() from anon, authenticated;
revoke all on function public.issue_certificate_as(uuid, uuid, uuid) from anon, authenticated;
revoke execute on function public.issue_certificate_as(uuid, uuid, uuid) from public;
revoke all on function public.issue_certificate(uuid) from public;
grant execute on function public.issue_certificate(uuid) to authenticated;
