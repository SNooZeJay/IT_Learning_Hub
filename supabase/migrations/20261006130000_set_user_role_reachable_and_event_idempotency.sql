-- Two privileged paths that do not work, and one that can be made to fail silently.
--
-- 1. set_user_role is unreachable from the browser
-- 2. record_payment_event cannot tell a verified replay from a forged pre-claim
--
-- Both were found by reading the code and then executing it as the role it is
-- meant for, which is the only way either is knowable: type-check, lint, build and
-- the unit tests are all green with both bugs in place.

-- ---------------------------------------------------------------------------
-- 1. set_user_role: the admin screen could never change a role
-- ---------------------------------------------------------------------------
--
-- What was wrong
-- -------------
-- `admin/Users.vue` calls the `set_user_role` RPC over PostgREST. EXECUTE on that
-- function is revoked from `public`, `anon` and `authenticated`, and granted only to
-- `service_role`. A browser session is `authenticated`. So every attempt returned
-- `permission denied for function set_user_role`, and changing a user's role from the
-- admin screen was impossible. The service surfaced the error honestly, which is why
-- it was never mistaken for a success - it simply never worked.
--
-- Why the obvious fix is the wrong one
-- ------------------------------------
-- The tempting repair is `grant execute ... to authenticated`. That would be a
-- self-promotion vulnerability, and the existing code shows exactly why.
--
-- `set_user_role` does not check who is calling it. It sets a session flag:
--
--     perform set_config('app.allow_role_change', 'on', true);
--
-- and the guard trigger reads that flag:
--
--     sanctioned boolean := coalesce(current_setting('app.allow_role_change', true), 'off') = 'on';
--     if new.role is distinct from old.role and not sanctioned and not public.is_admin() then
--       raise exception 'Only an administrator can change a role.'
--
-- So the flag exists precisely to let this function through a guard that would
-- otherwise stop it. Granting it to `authenticated` would let any signed-in student
-- call it, set the flag, and promote themselves to admin. The EXECUTE grant was not
-- an oversight in the security model - it *was* the entire model.
--
-- The fix
-- -------
-- Make the function defend itself, then grant it.
--
-- `is_admin()` is `security definer` and stable, reading the caller's role from
-- their own profile row, so it is trustworthy here. Checking it inside the function
-- means the guard no longer depends on a grant staying revoked: if a later migration
-- widens EXECUTE by accident, the function still refuses. That is defence in depth
-- rather than a single point of failure.
--
-- The last-administrator protection is deliberately left where it is. It sits
-- outside the `sanctioned` branch in the trigger, so it already applied to every
-- path including this one, and moving it would risk weakening it.

create or replace function public.set_user_role(target_id uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new_role is null then
    raise exception 'A role is required.' using errcode = '22023';
  end if;

  -- The caller must already be an administrator. Checked here rather than relied
  -- upon from the grant list, because the flag set below suspends the trigger's own
  -- check and the grant is the only other thing standing in the way.
  if not public.is_admin() then
    raise exception 'Only an administrator can change a role.' using errcode = '42501';
  end if;

  -- A caller cannot promote themselves. An administrator promoting their own
  -- account to a lesser role is allowed (and guarded against removing the last
  -- admin by the trigger), but nobody may use this to grant themselves a role they
  -- do not already hold.
  if target_id = auth.uid() and new_role <> public.current_role() then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
  set role = new_role
  where id = target_id;

  if not found then
    perform set_config('app.allow_role_change', 'off', true);
    raise exception 'No profile with id %.', target_id using errcode = 'P0002';
  end if;

  perform set_config('app.allow_role_change', 'off', true);
end;
$$;

comment on function public.set_user_role(uuid, public.user_role) is
  'Privileged role assignment. Requires the caller to already be an administrator, checked inside the function rather than by the EXECUTE grant alone, because the app.allow_role_change flag this sets would otherwise suspend the trigger guard. Refuses self-promotion and, via the trigger, demotion of the last administrator.';

grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. record_payment_event: a forged pre-claim could permanently block settlement
-- ---------------------------------------------------------------------------
--
-- What was wrong
-- -------------
-- The webhook short-circuits on a duplicate event id:
--
--     if (recorded.isNew === false) return json({ received: true, duplicate: true })
--
-- `is_new` is false whenever a row with that `event_id` already exists. The insert
-- is `on conflict do nothing` and the function returns the pre-existing row without
-- ever looking at `signature_verified`.
--
-- Any delivery that could not be verified is still recorded - `recordAsUnusable`
-- writes the row with `signature_verified = false` and the envelope's id - and it
-- claims the id. When the genuine, correctly signed event for that id later arrives,
-- it is treated as a duplicate, the function returns 200, and settlement never runs.
-- The learner is charged, the payment stays `pending`, the enrolment stays `pending`,
-- and nothing surfaces to a person.
--
-- Two ways in, neither exotic:
--
--   - a retry that arrives with a corrupted or missing signature header claims the
--     id, and PayMongo's next, correct, retry is swallowed as a duplicate. PayMongo
--     retries up to twelve times and then stops.
--   - the endpoint is deliberately unauthenticated (`--no-verify-jwt`) because the
--     provider cannot send a JWT, and the event id is read from the request body. An
--     attacker who learns or guesses an id can pre-claim it and deny that payment.
--
-- The fix
-- -------
-- Return the stored `signature_verified` so the caller can tell "I already handled
-- this legitimate event" from "someone else claimed this id". Changing the return
-- shape is additive - the existing three columns keep their names and positions, so
-- `recorded.ok`, `recorded.isNew` and `recorded.paymentId` in the webhook continue to
-- work untouched. The webhook's own short-circuit is a one-line change in
-- `paymongo-webhook/index.ts` and ships with it.

-- `create or replace` cannot change a function's return type, so the old signature is
-- dropped first. Dropping a function drops its grants with it, which is why the grant
-- to service_role is re-issued at the end.
drop function if exists public.record_payment_event(text, text, text, jsonb, boolean);

create function public.record_payment_event(
  in_event_id text,
  in_event_type text,
  in_resource_id text,
  in_payload jsonb,
  in_signature_verified boolean
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
    (event_id, event_type, resource_id, payload, signature_verified)
  values
    (in_event_id, in_event_type, in_resource_id, in_payload, in_signature_verified)
  on conflict (event_id) do nothing
  returning payment_events.id, payment_events.payment_id, payment_events.signature_verified
    into v_id, v_payment, v_verified;

  if v_id is null then
    -- The conflicting row wins. Reporting *its* verification, not the caller's, is
    -- the whole point: a correctly signed event that collides with an unverified
    -- pre-claim must be told so, so it can proceed rather than defer.
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

comment on function public.record_payment_event(text, text, text, jsonb, boolean) is
  'Idempotency ledger for payment webhooks. The added stored_signature_verified column reports whether the row that already held this event_id was itself verified, so a duplicate forged or corrupted pre-claim cannot permanently block settlement of the genuine event.';

-- The grant is re-issued because the drop above took it with it.
grant execute on function public.record_payment_event(text, text, text, jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Repair any pre-claim that already happened
-- ---------------------------------------------------------------------------
--
-- Any stored unverified row is exactly what the fix is for. Deleting them re-opens
-- the id so a correct delivery can claim it; the payload is retained nowhere that
-- matters, because an unverified payload was never acted on and must never be.

delete from public.payment_events where signature_verified = false;
