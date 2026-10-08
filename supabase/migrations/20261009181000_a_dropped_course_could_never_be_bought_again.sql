-- ===========================================================================
-- Dropping a course and then trying to buy it again failed forever.
--
-- Found by trying to re-purchase a dropped course, not by reading the code.
--
-- create-checkout's findOrCreatePendingEnrollment revives a dropped enrolment to
-- 'pending' so a retry has somewhere valid to land - enrolments has unique
-- (course_id, student_id), so a re-purchase has to reuse the row rather than
-- insert a second one. That revival is an UPDATE from dropped to pending.
--
-- protect_enrollment_entitlement allowed none of its branches for that write:
--
--   service_role branch  requires new.status = 'active'
--   admin / instructor   resolve through auth.uid(), which is null here
--   completion flag      only for active -> completed
--   no-op                the status genuinely changed
--   drop branch          requires new.status = 'dropped'
--
-- So it raised 42501, findOrCreatePendingEnrollment caught it, returned null, and
-- create-checkout answered 409 'enrolment could not be prepared'. Every attempt,
-- forever. A student who dropped a course was locked out of buying it again.
--
-- The fix is the second transition the payment lifecycle actually needs. Both are
-- server-driven, both are narrow, and both still require the caller's role to be
-- service_role - a signed-in student cannot reach either, and cannot present that
-- role, because PostgREST sets it from a signature-verified JWT.
--
-- Verified after the change:
--   service_role settle   pending -> active   OK
--   service_role revive   dropped  -> pending  OK
--   student activates own enrolment           refused 42501
--   student drops own enrolment               allowed
-- ===========================================================================

create or replace function public.protect_enrollment_entitlement()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $fn$
begin
  -- The payment lifecycle, and only it.
  --
  -- current_setting('role') rather than session_user, because PostgREST authenticates
  -- as the authenticator and then does SET ROLE service_role, so session_user never
  -- names service_role. SECURITY DEFINER turns current_user into the function owner
  -- before this trigger runs, but it leaves this GUC alone.
  --
  -- Two transitions, both required for a purchase to complete:
  --
  --   pending|dropped -> active   settle_payment, once PayMongo confirms payment
  --   dropped         -> pending  create-checkout, reviving the row a re-purchase
  --                               must reuse because of the unique constraint
  --
  -- Neither can reach a course that was never bought, and neither can re-open a
  -- completed one: both require the old status to be pending or dropped, and both
  -- require the course and the student to be unchanged.
  if current_setting('role', true) = 'service_role'
     and old.status in ('pending', 'dropped')
     and new.status in ('pending', 'active')
     and new.status <> old.status
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id then
    return new;
  end if;

  -- An administrator or the course's instructor manages enrolments properly.
  if public.is_admin() or public.is_instructor_of(old.course_id) then
    return new;
  end if;

  -- The one completion a student is entitled to, and only when the server decided it.
  -- refresh_enrollment_completion sets this flag immediately before its own UPDATE, and
  -- only after checking that the caller owns the enrolment and that every requirement is
  -- genuinely met. Both of those checks live in that function; the flag is only what lets
  -- its write get past this trigger.
  --
  -- A flag rather than allowing active -> completed outright, because a plain UPDATE
  -- setting completed would otherwise be enough to move an enrolment into the state that
  -- issues a certificate. set_config with a transaction-local flag cannot outlive the call
  -- that set it. It is a narrowing of what a trigger must allow, not a grant of trust in
  -- the GUC, which is exactly why the ownership and requirement checks stay where they
  -- are.
  if current_setting('app.enrollment_completion', true) = 'on'
     and new.status = 'completed'
     and old.status = 'active'
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id
     and new.activated_at is not distinct from old.activated_at then
    return new;
  end if;

  -- Nothing that grants access changed. Written first so that a no-op update, or one that
  -- only touches updated_at via set_updated_at, is not mistaken for an attack.
  if new.status is not distinct from old.status
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id
     and new.enrolled_at is not distinct from old.enrolled_at
     and new.completed_at is not distinct from old.completed_at
     and new.activated_at is not distinct from old.activated_at
     and new.cancelled_at is not distinct from old.cancelled_at then
    return new;
  end if;

  -- Dropping one's own place is the one write a student has. enrollment.service.ts
  -- does exactly this and nothing else.
  if new.status = 'dropped'
     and old.status is distinct from 'dropped'
     and new.course_id is not distinct from old.course_id
     and new.student_id is not distinct from old.student_id then
    new.completed_at := null;
    new.cancelled_at := coalesce(new.cancelled_at, now());
    return new;
  end if;

  raise exception
    'a student cannot change the status, course or timing of an enrolment; dropping it is allowed'
    using errcode = '42501';
end;
$fn$;
