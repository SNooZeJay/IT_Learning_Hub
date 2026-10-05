-- 20261005090018_fix_fail_payment_row_count_type.sql
--
-- Every failed payment crashed. One-line type error, never executed.
--
-- The bug
-- -------
-- 20261004195753_payment_hardening.sql declares:
--
--   declare
--     v_result text;
--   ...
--   get diagnostics v_result = row_count;
--   ...
--   return case when v_result = 1 then 'recorded' else 'not_pending' end;
--
-- `GET DIAGNOSTICS ... ROW_COUNT` yields an integer. Assigning it to a text
-- variable succeeds - plpgsql coerces - and the failure lands on the comparison
-- instead:
--
--   ERROR: 42883 operator does not exist: text = integer
--   CONTEXT: PL/pgSQL function fail_payment(uuid,text,text,text,text,boolean) line 34
--
-- So the function raised on every call, whatever the arguments. A declined card,
-- an abandoned checkout, a cancelled payment: all of them. The payment stayed
-- `pending` and the enrolment stayed `pending`, because the transaction rolled
-- back.
--
-- This is the second bug in the same family as 20261005090017, and neither was
-- reachable by any gate: the function is SECURITY DEFINER and service_role-only,
-- so the frontend cannot call it, and nothing in the repository executes it.
-- Found only by calling settle_payment and fail_payment directly against real
-- rows.
--
-- The rest of the function is unchanged. The enrolment is dropped only from
-- `pending`, so a learner who has already been activated is never dropped by a
-- late failure event.

create or replace function public.fail_payment(
  in_payment_id uuid,
  in_provider_payment_id text,
  in_failure_code text,
  in_failure_message text,
  in_event_id text,
  in_cancelled boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- integer, because GET DIAGNOSTICS ROW_COUNT yields one. The original
  -- declaration said text, which is what turned a row count into a runtime
  -- error on the comparison below.
  v_result integer;
begin
  if in_payment_id is null then
    update public.payment_events
       set processing_status = 'failed',
           failure_code = in_failure_code,
           failure_message = in_failure_message,
           processed_at = now()
     where event_id = in_event_id;
    return 'unmatched_event';
  end if;

  update public.payments
     set status = case when in_cancelled then 'cancelled'::public.payment_status
                       else 'failed'::public.payment_status end,
         provider_payment_id = coalesce(in_provider_payment_id, provider_payment_id),
         updated_at = now()
   where id = in_payment_id
     and status = 'pending';

  get diagnostics v_result = row_count;

  -- Only a pending enrolment is dropped. A learner already activated is never
  -- removed by a failure event that arrives late.
  update public.enrollments
     set status = 'dropped', cancelled_at = now()
   where id = (select enrollment_id from public.payments where id = in_payment_id)
     and status = 'pending';

  update public.payment_events
     set processing_status = 'processed', processed_at = now()
   where event_id = in_event_id;

  return case when v_result = 1 then 'recorded' else 'not_pending' end;
end;
$$;

revoke execute on function public.fail_payment(uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_payment(uuid, text, text, text, text, boolean)
  to service_role;
