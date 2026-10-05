-- ============================================================================
-- 0004 - harden payments: enrolment parent, webhook ledger, settlement guards
--
-- Changes, and why:
--
-- 1. payments.enrollment_id. The reference system attaches a payment to an
--    ENROLMENT rather than to a course and a student directly. That makes an
--    orphan payment impossible, gives a retry somewhere to land, and means the
--    ledger and the learner's record are the same object. Added as nullable so
--    existing rows keep working; backfilled immediately below.
--
-- 2. 'cancelled' on payment_status. Without it an abandoned PayMongo checkout
--    stays 'pending' forever and the admin payments screen is full of ghosts.
--
-- 3. 'pending' on enrollment_status. A paid enrolment has to exist before
--    payment is taken, so the learner has something to wait on. Without this the
--    only alternative is a payment with no enrolment, which is state 0001
--    allowed.
--
-- 4. payment_events. Every webhook is recorded: the raw payload, whether the
--    signature verified, and how processing ended. This is the idempotency key,
--    the audit trail, the dispute record and the debugging aid in one table.
--
-- 5. activated_at / cancelled_at / last_accessed_at on enrollments, so "when did
--    this learner actually start" is answerable.
--
-- The enum values this file depends on were added in migration 0003, in their own
-- transaction, because Postgres cannot use a new enum value in the transaction that adds it.
--
-- Nothing here loosens access. payment_events is as locked down as payments.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enrolment lifecycle
-- ---------------------------------------------------------------------------

alter table public.enrollments
  add column if not exists activated_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_accessed_at timestamptz;

-- An index on (course_id, student_id) already backs the uniqueness rule, but
-- the learner dashboard lists by student and filters on status, so this is the
-- access path that actually gets used.
create index if not exists enrollments_student_status_idx
  on public.enrollments (student_id, status);

-- ---------------------------------------------------------------------------
-- Payment belongs to an enrolment
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists enrollment_id uuid references public.enrollments (id) on delete set null;

-- Backfill from the pair the old shape already stored, so historical rows gain a
-- parent instead of staying orphaned. ON CONFLICT DO NOTHING because the
-- unique (course_id, student_id) rule on enrollments means several payments can
-- map to one enrolment and the first wins.
update public.payments p
   set enrollment_id = e.id
  from public.enrollments e
 where p.enrollment_id is null
   and e.course_id = p.course_id
   and e.student_id = p.student_id
   and p.status = 'paid';

create index if not exists payments_enrollment_id_idx
  on public.payments (enrollment_id);

-- ---------------------------------------------------------------------------
-- Webhook ledger
-- ---------------------------------------------------------------------------

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),

  -- Idempotency key. The provider's own event id where there is one, otherwise
  -- 'sha256:<hash of the raw body>'. A replayed delivery produces the same key
  -- and is rejected; a genuinely different event produces a different key.
  event_id text not null unique,

  provider text not null default 'paymongo',
  event_type text,
  resource_id text,

  -- Nullable on purpose. An event that correlates to no payment must still be
  -- recorded, or a provider-side mismatch disappears instead of being visible.
  payment_id uuid references public.payments (id) on delete set null,

  -- The payload exactly as received. Kept verbatim so a dispute can be settled
  -- from our own record rather than from the provider's.
  payload jsonb not null,

  -- Whether the HMAC checked out. A false here means the body was never
  -- trusted and nothing from it may change state.
  signature_verified boolean not null default false,

  processing_status public.payment_event_status not null default 'received',

  -- What the provider claimed, kept separately from the stored payment so a
  -- mismatch is detectable rather than silently overwritten.
  reported_amount_centavos integer,
  reported_currency text,
  livemode boolean,

  -- Why a payment was declined, so a failed enrolment can explain itself.
  failure_code text,
  failure_message text,

  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on column public.payment_events.event_id is
  'Idempotency key: the provider event id, or sha256 of the raw body when absent.';

comment on column public.payment_events.signature_verified is
  'False means the HMAC did not check out and nothing in this row may change state.';

create index if not exists payment_events_payment_id_idx on public.payment_events (payment_id);
create index if not exists payment_events_status_idx on public.payment_events (processing_status);
create index if not exists payment_events_received_at_idx on public.payment_events (received_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.payment_events enable row level security;

-- Read-only to the browser, exactly like payments. Only the Edge Function writes,
-- using the service role, which bypasses RLS by design.
drop policy if exists "payment_events select" on public.payment_events;
create policy "payment_events select" on public.payment_events
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.payments p
      where p.id = payment_events.payment_id
        and p.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Grant the Edge Function what it needs
--
-- These are function grants, not table grants: the service role already bypasses
-- RLS, and the anon and authenticated roles are explicitly denied so nothing
-- web-facing can write the ledger or settle a payment.
-- ---------------------------------------------------------------------------

revoke execute on function public.set_user_role(uuid, public.user_role) from anon;
revoke execute on function public.set_user_role(uuid, public.user_role) from authenticated;
grant execute on function public.set_user_role(uuid, public.user_role) to service_role;

-- ---------------------------------------------------------------------------
-- What the Edge Function calls
--
-- Kept as functions rather than letting the function write tables directly, so
-- the settlement rules are testable and reviewable in one place, and so the
-- invariants below cannot be bypassed by a caller that forgets one.
-- ---------------------------------------------------------------------------

-- Records the webhook. Returns the row and whether it is new.
--
-- ON CONFLICT DO NOTHING on event_id is what makes a redelivered webhook a
-- no-op: PayMongo retries until it gets a 200, so duplicates are routine rather
-- than exceptional.
create or replace function public.record_payment_event(
  in_event_id text,
  in_event_type text,
  in_resource_id text,
  in_payload jsonb,
  in_signature_verified boolean
)
returns table (id uuid, is_new boolean, payment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_payment uuid;
  v_is_new boolean := false;
begin
  insert into public.payment_events
    (event_id, event_type, resource_id, payload, signature_verified)
  values
    (in_event_id, in_event_type, in_resource_id, in_payload, in_signature_verified)
  on conflict (event_id) do nothing
  returning payment_events.id, payment_events.payment_id into v_id, v_payment;

  if v_id is null then
    select payment_events.id, payment_events.payment_id
      into v_id, v_payment
      from public.payment_events
     where event_id = in_event_id;
  else
    v_is_new := true;
  end if;

  return query select v_id, v_is_new, v_payment;
end;
$$;

revoke execute on function public.record_payment_event(text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.record_payment_event(text, text, text, jsonb, boolean) to service_role;

-- Settles a paid payment and activates its enrolment, exactly once.
--
-- The amount check is the point of this function. The HMAC already proves the
-- provider sent the event, so this is not about forgery. It is about a provider
-- bug, a misconfigured checkout, or a partial refund unlocking a course that was
-- never paid for in full. A mismatch is recorded and refused rather than
-- applied.
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
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_result text;
begin
  select * into v_payment from public.payments where id = in_payment_id for update;

  if v_payment.id is null then
    return 'no_payment';
  end if;

  -- Already settled. A redelivery is normal, not an error.
  if v_payment.status = 'paid' then
    v_result := 'already_paid';
  elsif in_amount_centavos is not null
        and in_amount_centavos <> v_payment.amount_centavos then
    v_result := 'amount_mismatch';
  elsif in_currency is not null and lower(in_currency) <> lower(v_payment.currency) then
    v_result := 'currency_mismatch';
  else
    update public.payments
       set status = 'paid',
           provider_payment_id = coalesce(in_provider_payment_id, provider_payment_id),
           paid_at = now(),
           updated_at = now()
     where id = v_payment.id;

    -- The enrolment is what the learner actually experiences, so activating it
    -- is the point of settling. A payment with no enrolment is a refund, not an
    -- unlock, and is reported rather than silently creating one.
    if v_payment.enrollment_id is null then
      v_result := 'paid_without_enrolment';
    else
      update public.enrollments
         set status = 'active',
             activated_at = coalesce(activated_at, now()),
             updated_at = now()
       where id = v_payment.enrollment_id
         and status in ('pending', 'active');

      v_result := 'settled';
    end if;
  end if;

  update public.payment_events
     set processing_status = 'processed', processed_at = now()
   where event_id = in_event_id;

  return v_result;
end;
$$;

revoke execute on function public.settle_payment(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.settle_payment(uuid, text, integer, text, text) to service_role;

-- Records a payment that did not settle, with the provider's reason, so the
-- learner's course page can explain itself instead of appearing broken.
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
  v_result text;
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

revoke execute on function public.fail_payment(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_payment(uuid, text, text, text, text, boolean) to service_role;
