-- 20261005090017_fix_settle_payment_missing_column.sql
--
-- No payment has ever settled. Two defects, both silent.
--
-- 1. settle_payment writes a column that does not exist
-- ----------------------------------------------------
-- 20261004195753_payment_hardening.sql activates an enrolment with:
--
--   update public.enrollments
--      set status = 'active',
--          activated_at = coalesce(activated_at, now()),
--          updated_at = now()
--    where id = v_payment.enrollment_id
--      and status in ('pending', 'active');
--
-- `enrollments` has no `updated_at` column. The real columns are:
--
--   id, course_id, student_id, status, enrolled_at, completed_at,
--   activated_at, cancelled_at, last_accessed_at
--
-- So every call raised:
--
--   ERROR: 42703 column "updated_at" of relation "enrollments" does not exist
--   CONTEXT: PL/pgSQL function settle_payment(uuid,text,integer,text,text) line 34
--
-- Found by executing settle_payment against a real pending payment, which is the
-- only way to see it: the function is SECURITY DEFINER and service_role-only, so
-- nothing in the frontend, the type-checker, the linter or the test suite reaches
-- it. Every gate was green.
--
-- 2. set_updated_at is attached to a table that cannot satisfy it
-- ---------------------------------------------------------------
-- 20261004170825_foundation.sql attaches the trigger to seven tables by name:
--
--   'profiles', 'course_categories', 'courses', 'modules',
--   'lessons', 'enrollments', 'payments'
--
-- Six of those have `updated_at`. `enrollments` does not. The trigger body is
-- `new.updated_at := now()`, so on enrollments it raises 42703 on EVERY update -
-- not just settlement. That includes cancelling an enrolment and marking one
-- complete, so those paths were broken too and nobody had tried them.
--
-- Both are fixed by adding the column rather than removing the write. An
-- enrolment genuinely should record when it last changed: it has a lifecycle
-- (pending -> active -> completed or dropped) and "when did this change" is
-- worth having. Removing the trigger instead would have left the money path
-- working and the audit trail missing, which is the worse trade.

alter table public.enrollments
  add column if not exists updated_at timestamptz not null default now();

comment on column public.enrollments.updated_at is
  'When the enrolment row last changed. Backfilled to enrolled_at for existing rows rather than now(), so the value means something on the rows that already existed.';

-- `now()` as the default is the migration time, which is wrong for rows that
-- enrolled days ago. Prefer the moment they enrolled, and fall back only when
-- enrolled_at is somehow null.
update public.enrollments
   set updated_at = coalesce(enrolled_at, now())
 where updated_at > enrolled_at + interval '1 second';

-- Re-create the trigger so it is bound to the column that now exists. The
-- function is unchanged; only its attachment is repaired.
drop trigger if exists set_updated_at on public.enrollments;

create trigger set_updated_at
  before update on public.enrollments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Settle, re-pointed at the real schema
-- ---------------------------------------------------------------------------
--
-- `updated_at` is now a column, so the original statement is valid and the
-- function is restored as written. Kept otherwise byte-identical: the amount
-- check, the event-idempotency check and the status guard are all load-bearing
-- and were never exercised, so changing them blind would be a second guess on
-- top of a bug that has not been observed yet.

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
  v_event_id text;
begin
  select * into v_payment from public.payments where id = in_payment_id;
  if not found then
    raise exception 'payment % not found', in_payment_id using errcode = 'no_data_found';
  end if;

  -- Already settled. Idempotent by event id, so a redelivered webhook is a no-op
  -- rather than a second activation.
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
  -- when the learner chose to pay. A mismatch means either a tampered payload or
  -- a provider bug, and in both cases the enrolment must not activate.
  if in_amount_centavos is null or in_amount_centavos <> v_payment.amount_centavos then
    raise exception 'amount mismatch: provider reported % %, we recorded %',
      in_amount_centavos, coalesce(in_currency, '?'), v_payment.amount_centavos
      using errcode = 'check_violation';
  end if;

  if in_currency is not null and upper(in_currency) <> upper(v_payment.currency) then
    raise exception 'currency mismatch: provider reported %, we recorded %',
      in_currency, v_payment.currency using errcode = 'check_violation';
  end if;

  -- Idempotency. A replayed event id is recognised and returns without acting,
  -- so a retried webhook cannot double-settle.
  select event_id into v_event_id from public.payment_events where event_id = in_event_id;
  if found then
    return 'duplicate_event';
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

  update public.payment_events
     set processing_status = 'processed', processed_at = now()
   where event_id = in_event_id;

  return 'settled';
end;
$$;

revoke all on function public.settle_payment(uuid, text, integer, text, text) from public;
grant execute on function public.settle_payment(uuid, text, integer, text, text) to service_role;
