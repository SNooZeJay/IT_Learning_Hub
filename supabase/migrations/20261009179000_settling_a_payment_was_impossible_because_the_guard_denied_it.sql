-- ===========================================================================
-- The webhook could not settle a payment. Ever.
--
-- Found by running what the PayMongo webhook runs, rather than by reading it:
-- settle_payment called as service_role, against a real pending payment.
--
--   ERROR 42501: a student cannot change the status, course or timing of an
--   enrolment; dropping it is allowed
--
-- The chain, and why each link looked reasonable on its own:
--
--   settle_payment activates the enrolment with an UPDATE, and the BEFORE UPDATE
--   trigger protect_enrollment_entitlement lets a write through only if is_admin() or
--   is_instructor_of(course). Both resolve through auth.uid().
--
--   A service_role request carries no user. auth.uid() is null, so the profiles lookup
--   behind current_role() returns nothing, is_admin() coalesces to false, and
--   is_instructor_of finds no row. The trigger concludes it is being asked by a student
--   and refuses.
--
--   Nothing else in that trigger covers the case: it is not a no-op (the status really
--   is changing), not a drop, and not the GUC-flagged completion path.
--
-- So the payment stayed pending, the enrolment stayed pending, and the learner who had
-- paid got no access, while the provider had taken the money. The seeded demo payments
-- masked it completely, because they were inserted with status 'paid' rather than
-- settled through this path.
--
-- fail_payment did not need this: it moves an enrolment pending -> dropped, which the
-- trigger's own drop branch already permitted.
-- ===========================================================================

-- ===========================================================================
-- Choosing the discriminator, by measurement rather than by argument.
--
-- The first attempt at this fix keyed on session_user. That was wrong, and wrong in a
-- way that would have shipped a branch that could never fire:
--
--   PostgREST does not authenticate as service_role. It authenticates as the
--   authenticator role and then issues SET ROLE service_role.
--
-- Measured on this database:
--
--   postgres connection      session_user=postgres  current_user=postgres       role=none
--   after SET ROLE svc_role  session_user=postgres  current_user=service_role  role=service_role
--
-- session_user is unchanged by SET ROLE, so inside the webhook it reads authenticator
-- and never names service_role. A guard written against it would look correct and pass
-- review, and would silently reject every real settlement.
--
-- current_user is no use either: settle_payment is SECURITY DEFINER, so by the time
-- this trigger runs current_user is the function owner, which names nobody useful.
--
-- current_setting('role') is the GUC that SET ROLE actually writes. SECURITY DEFINER
-- does not reset it, so it is still service_role inside this trigger.
--
-- Safe for the same reason the rest of this trigger is safe, and more directly:
-- PostgREST sets this GUC from the role claim of a signature-verified JWT. A signed-in
-- student cannot present service_role, and no exposed function can run SET ROLE. The
-- service_role key exists only in the Edge Functions environment.
-- ===========================================================================

create or replace function public.protect_enrollment_entitlement()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $fn$
begin
  -- The payment provider settling a real payment: the path that activates an enrolment.
  -- Without it a learner who had paid stayed locked out of what they bought.
  --
  -- current_setting('role') rather than session_user, because PostgREST authenticates as
  -- the authenticator and then does SET ROLE service_role, so session_user never names
  -- service_role. SECURITY DEFINER turns current_user into the function owner before this
  -- trigger runs, but it leaves this GUC alone.
  --
  -- Restricted to activating a pending or dropped enrolment, so it cannot be used to
  -- re-activate a completed course, or to reach one that was never bought.
  if current_setting('role', true) = 'service_role'
     and old.status in ('pending', 'dropped')
     and new.status = 'active'
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
