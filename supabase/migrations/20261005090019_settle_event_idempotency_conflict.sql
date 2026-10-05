-- 20261005090019_settle_event_idempotency_conflict.sql
--
-- The bug: no payment would ever settle, even with everything else fixed.
--
-- The conflict
-- -----------
-- The webhook's normal order is:
--
--   1. record_payment_event(in_event_id = envelope.eventId, ...)   <- always
--   2. settle_payment(in_event_id = envelope.eventId, ...)        <- same id
--
-- Step 1 is unconditional for any event with a valid signature. So by the time
-- step 2 runs, the event row ALWAYS exists.
--
-- 20261005090017 gave settle_payment this guard:
--
--   select event_id into v_event_id
--     from public.payment_events where event_id = in_event_id;
--   if found then
--     return 'duplicate_event';
--   end if;
--
-- The guard was meant to make settling idempotent. In isolation it is correct.
-- Combined with the caller's ordering it inverts: the first delivery is the one
-- that always trips it, because the webhook has already recorded the event.
-- Every payment would return 'duplicate_event', the enrolment would stay
-- `pending`, and the learner would have paid for nothing.
--
-- Reproduced by executing the webhook's exact sequence:
--
--   record_payment_event('evt_dup_001', ...)   -> recorded
--   settle_payment(..., 'evt_dup_001')         -> duplicate_event
--   payments.status                            -> pending
--
-- A retry guard belongs to the LAYER THAT SEES RETRIES, and that is the webhook:
-- it already has `if (recorded.isNew === false) return duplicate` before it ever
-- calls settle. The database function was duplicating a decision the caller had
-- already made, using information the caller had already supplied.
--
-- The fix
-- -------
-- settle_payment stops consulting payment_events. It keeps its own idempotency,
-- which is the part that actually matters and which the caller cannot check: a
-- payment that is already `paid` is not settled twice, and a payment that is not
-- `pending` is refused. Those guards live on the payment row, which the function
-- already locks.
--
-- It still marks the event processed, which it could not do before - the
-- `duplicate_event` return fired first, so `processing_status` stayed 'received'
-- forever on any event that reached it. Verified: after settling, the event read
-- back as NULL for processing_status.

create or replace function public.settle_payment(
  in_payment_id uuid,
  in_provider_payment_id text,
  in_amount_centavos integer,
  in_currency text,
  in_event_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
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
  --
  -- The caller (paymongo-webhook) separately returns early when
  -- record_payment_event reports the event id as already seen. That is the retry
  -- guard; this is the settlement guard. They were the same check twice, and the
  -- database copy was the one that broke the happy path.
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

  update public.payments
     set status = 'paid',
         provider_payment_id = in_provider_payment_id,
         paid_at = now(),
         updated_at = now()
   where id = in_payment_id;

  update public.enrollments
     set status = 'active',
         activated_at = coalesce(activated_at, now()),
         updated_at = now()
   where id = v_payment.enrollment_id
     and status in ('pending', 'active');

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

revoke all on function public.settle_payment(uuid, text, integer, text, text) from public;
grant execute on function public.settle_payment(uuid, text, integer, text, text) to service_role;

comment on function public.settle_payment(uuid, text, integer, text, text) is
  'Marks a payment paid and activates its enrolment. Idempotent on the payment row, not on the event id: the webhook records the event before calling this, so an event-id guard here made every first delivery look like a replay and no payment ever settled.';
