-- A certificate has to name people, and RLS would not let it.
--
-- `can_view_profile` lets a signed-in person see themselves, any administrator, and any
-- student enrolled in a course they teach. It does not let a student see the instructor
-- teaching them, which is exactly the name the certificate is required to carry. Widening
-- that predicate would publish every instructor's email to every student, so it is not
-- widened.
--
-- Instead this returns the names a certificate needs, and nothing else. No email address,
-- no phone, no bio, no profile id: a document that renders a name does not need the row
-- behind it, and returning the row is how a certificate page turns into a directory.
--
-- The guard is the certificate itself: the caller must hold the certificate being
-- described. That is the only relationship this function exposes, so it cannot be used to
-- ask about anybody else.
create or replace function public.certificate_signatories(p_certificate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_certificate public.certificates%rowtype;
  v_course_title text;
  v_student_name text;
  v_admin_name text;
  v_instructors jsonb;
begin
  select * into v_certificate
    from public.certificates
   where id = p_certificate_id and user_id = auth.uid();

  if not found then
    raise exception 'you do not hold that certificate' using errcode = 'insufficient_privilege';
  end if;

  select c.title, p.full_name into v_course_title, v_student_name
    from public.courses c
    join public.profiles p on p.id = v_certificate.user_id
   where c.id = v_certificate.course_id;

  -- The administrator who owns the platform. Taken as the earliest administrator account
  -- rather than a stored column, so the line keeps naming a real person if accounts
  -- change, and so a certificate cannot be revoked by quietly editing the row.
  select full_name into v_admin_name
    from public.profiles
   where role = 'admin' and status = 'active'
   order by created_at
   limit 1;

  -- Only the instructors assigned to THIS course. A course with two of them lists both,
  -- because both taught it, and an instructor who has never touched the course never
  -- appears on its certificate.
  select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name) order by p.full_name), '[]'::jsonb)
    into v_instructors
    from public.course_instructors ci
    join public.profiles p on p.id = ci.instructor_id
   where ci.course_id = v_certificate.course_id
     and p.status = 'active';

  return jsonb_build_object(
    'certificateId', v_certificate.id,
    'certificateNumber', v_certificate.certificate_number,
    'finalPercentage', v_certificate.final_percentage,
    'issuedAt', v_certificate.issued_at,
    'revokedAt', v_certificate.revoked_at,
    'revokeReason', v_certificate.revoke_reason,
    'studentName', coalesce(v_student_name, 'Unknown student'),
    'courseTitle', coalesce(v_course_title, 'Unknown course'),
    'instructors', v_instructors,
    'adminName', v_admin_name
  );
end;
$fn$;

comment on function public.certificate_signatories(uuid) is
  'The names a certificate document needs: the holder, the course, the instructors assigned to that course, and the platform administrator. Returns names only. Callable by the holder of the certificate and nobody else.';

revoke all on function public.certificate_signatories(uuid) from public, anon;
grant execute on function public.certificate_signatories(uuid) to authenticated;
