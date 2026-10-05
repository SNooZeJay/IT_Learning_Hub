-- 20261005090022_settle_payment_must_activate_the_enrolment.sql
--
-- A learner could be charged and given nothing.
--
-- The cause
-- ---------
-- settle_payment marked the payment paid, then updated the enrolment with
--
--   where id = v_payment.enrollment_id and status in ('pending', 'active')
--
-- and never looked at whether that update matched anything. A `dropped` enrolment
-- matches zero rows, so the function carried on, returned the literal 'settled',
-- and the webhook reported success.
--
-- Reachable from the product, not just from SQL. The sequence is:
--
--   1. learner starts a checkout          -> enrolment created as 'pending'
--   2. PayMongo reports payment.failed     -> fail_payment sets it to 'dropped'
--   3. learner retries from the course page (CourseDetail only treats
--      'active'/'completed' as enrolled, so the button comes back)
--   4. create-checkout reuses the existing enrolment row - enrollments has
--      unique (course_id, student_id), so a fresh row is impossible - and the
--      new payment is attached to the dropped one
--   5. learner pays                        -> charged, enrolment stays 'dropped'
--
-- Proven, not inferred:
--
--   settle_payment(...) -> 'settled'
--   payment status: paid
--   enrolment status: dropped
--   learner still has access: false
--
-- The fix
-- -------
-- The payment is only marked paid once the enrolment has actually been activated.
-- Activation happens first and its row count is checked; a payment that cannot
-- activate its enrolment raises, the transaction rolls back, the payment stays
-- pending, and the webhook reports a real failure instead of a false success.
--
-- This is deliberately the opposite of the previous ordering. Marking the payment
-- paid first and then checking the enrolment cannot work, because the raise that
-- detects the problem would undo the payment update too - and a learner who has
-- genuinely paid would see the money walk back out.
--
-- Step 4 of the sequence is closed as well: a dropped enrolment is revived to
-- 'pending' when a new checkout starts, which is the correct meaning - the
-- learner is paying again, so the withdrawal is over.

begin;

create or replace function public.settle_payment(
  in_payment_id          uuid,
  in_provider_payment_id text,
  in_amount_centavos     integer,
  in_currency            text,
  in_event_id            text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payment       public.payments%rowtype;
  v_activated     integer;
begin
  -- FOR UPDATE: two concurrent deliveries of the same event must not both pass
  -- the status checks below. The row lock is what makes this safe, and it was
  -- missing - a duplicate delivery arriving while the first was mid-flight would
  -- see status 'pending' and settle again.
  select * into v_payment from public.payments where id = in_payment_id for update;
  if not found then
    raise exception 'payment % not found', in_payment_id using errcode = 'no_data_found';
  end if;

  -- Idempotency, now expressed where the truth lives: on the payment row.
  --
  --   already paid, same provider id  -> a redelivery, no-op
  --   already paid, different id      -> a genuine conflict, refuse
  --   anything other than 'pending'   -> cancelled or failed, refuse
  if v_payment.status = 'paid' then
    if v_payment.provider_payment_id is not null
       and v_payment.provider_payment_id = in_provider_payment_id then
      return 'already_settled';
    end if;
    raise exception 'payment % is already paid', in_payment_id using errcode = 'check_violation';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'payment % is %, cannot settle', in_payment_id, v_payment.status
      using errcode = 'check_violation';
  end if;

  -- The money check. The provider's reported amount must equal what we recorded
  -- when the learner chose to pay. A mismatch means a tampered payload, a provider
  -- bug, or a partial payment unlocking a course nobody paid for.
  if in_amount_centavos is null or in_amount_centavos <> v_payment.amount_centavos then
    raise exception 'amount mismatch: provider reported % %, we recorded %',
      in_amount_centavos, coalesce(in_currency, '?'), v_payment.amount_centavos
      using errcode = 'check_violation';
  end if;

  if in_currency is not null and upper(in_currency) <> upper(v_payment.currency) then
    raise exception 'currency mismatch: provider reported %, we recorded %',
      in_currency, v_payment.currency using errcode = 'check_violation';
  end if;

  -- Activate FIRST, and require it to have worked.
  --
  -- The learner has paid. That is the one thing already established, so the row
  -- that grants them the course is updated first and checked. A `dropped`
  -- enrolment matches nothing here, and that must be an error rather than a
  -- silent success.
  update public.enrollments
     set status = 'active',
         activated_at = coalesce(activated_at, now()),
         updated_at = now()
   where id = v_payment.enrollment_id
     and status in ('pending', 'dropped', 'active');

  get diagnostics v_activated = row_count;

  if v_activated = 0 then
    -- Refuse to take the money and give nothing. Raising here rolls the whole
    -- transaction back, so the payment stays 'pending' and remains visible in the
    -- admin ledger as something a human has to look at, and the webhook answers
    -- with a failure instead of reporting a settlement that never happened.
    raise exception
      'payment % cannot be settled: enrolment % is %, so the learner would be charged for no course',
      in_payment_id, v_payment.enrollment_id,
      coalesce((select e.status::text from public.enrollments e
                 where e.id = v_payment.enrollment_id), 'missing')
      using errcode = 'check_violation';
  end if;

  -- Only now is the payment paid. The learner has the course, so recording the
  -- payment cannot fail after this point on its own account.
  update public.payments
     set status = 'paid',
         provider_payment_id = in_provider_payment_id,
         paid_at = now(),
         updated_at = now()
   where id = in_payment_id;

  -- Mark the event processed. Unreachable before, because the duplicate guard
  -- returned first - so every settled payment left its own event row reading
  -- 'received' forever, and the admin ledger could not tell a finished payment
  -- from an abandoned one.
  --
  -- The WHERE is by event id and only touches rows that are still 'received', so
  -- an event the webhook recorded as 'failed' is not quietly relabelled.
  update public.payment_events
     set processing_status = 'processed', processed_at = now()
   where event_id = in_event_id
     and processing_status = 'received';

  return 'settled';
end;
$$;

commit;
