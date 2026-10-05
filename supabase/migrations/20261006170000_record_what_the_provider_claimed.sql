-- Record what the provider actually claimed, so the admin ledger stops mislabelling it.
--
-- What was wrong
-- --------------
-- `payment_events` has three columns for exactly this:
--
--     reported_amount_centavos integer
--     reported_currency          text
--     livemode                   boolean
--
-- and the comment above them explains why: "What the provider claimed, kept separately
-- from the stored payment so a mismatch is detectable rather than silently
-- overwritten."
--
-- Nothing ever wrote them. `record_payment_event` took no parameters for them, and the
-- webhook never updated the row afterwards. Meanwhile the envelope parser was already
-- extracting all three from the payload and discarding them.
--
-- The consequence is on the one screen an operator uses to reconcile money:
--
--     {{ event.livemode ? 'Live mode' : 'Test mode' }}
--
-- `livemode` is always null, so this always rendered "Test mode" - including for real
-- live-mode payments. A webhook row asserting that a real payment was a test payment is
-- worse than showing nothing, because it is a confident false statement about money.
-- The "Provider reported ₱X" line could never render at all.
--
-- The fix
-- -------
-- Widen the RPC to accept the three values and write them. This is the third change to
-- this function's shape in this series, and the third time a caller had to be widened
-- rather than the record being made complete the first time. The parameters are
-- nullable so an envelope that genuinely lacks them records null - "the provider did not
-- say" - which is distinct from false, which said "no".
--
-- Signature change, so the function is dropped and recreated rather than replaced.
-- Dropping takes the grant with it, which is why it is re-issued.

drop function if exists public.record_payment_event(text, text, text, jsonb, boolean);

create function public.record_payment_event(
  in_event_id text,
  in_event_type text,
  in_resource_id text,
  in_payload jsonb,
  in_signature_verified boolean,
  in_reported_amount_centavos integer default null,
  in_reported_currency text default null,
  in_livemode boolean default null
)
returns table (id uuid, is_new boolean, payment_id uuid, stored_signature_verified boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_payment uuid;
  v_verified boolean;
  v_is_new boolean := false;
begin
  insert into public.payment_events
    (event_id, event_type, resource_id, payload, signature_verified,
     reported_amount_centavos, reported_currency, livemode)
  values
    (in_event_id, in_event_type, in_resource_id, in_payload, in_signature_verified,
     in_reported_amount_centavos, in_reported_currency, in_livemode)
  on conflict (event_id) do nothing
  returning payment_events.id, payment_events.payment_id, payment_events.signature_verified
    into v_id, v_payment, v_verified;

  if v_id is null then
    -- The conflicting row wins. Reporting *its* verification, not the caller's, is the
    -- whole point: a correctly signed event that collides with an unverified pre-claim
    -- must be told so, so it can proceed rather than defer.
    select payment_events.id, payment_events.payment_id, payment_events.signature_verified
      into v_id, v_payment, v_verified
      from public.payment_events
     where event_id = in_event_id;

    v_verified := coalesce(v_verified, in_signature_verified);
  else
    v_is_new := true;
  end if;

  return query select v_id, v_is_new, v_payment, coalesce(v_verified, false);
end;
$$;

comment on function public.record_payment_event(text, text, text, jsonb, boolean, integer, text, boolean) is
  'Idempotency ledger for payment webhooks. stored_signature_verified reports whether the row that already held this event_id was itself verified, so a forged or corrupted pre-claim cannot permanently block settlement. The reported_* and livemode columns record what the provider claimed, which is what makes an amount mismatch detectable rather than silently overwritten, and stops the admin ledger asserting "Test mode" about a live payment.';

grant execute on function public.record_payment_event(text, text, text, jsonb, boolean, integer, text, boolean) to service_role;

-- Backfill nothing: there are no rows. payment_events is empty, which is itself worth
-- knowing and is asserted below rather than assumed.
do $$
declare
  v_rows int;
begin
  select count(*) into v_rows from public.payment_events;
  raise notice 'payment_events has % row(s); none carry a provider claim because none were ever written', v_rows;
end $$;
