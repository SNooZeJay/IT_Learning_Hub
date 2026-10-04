-- ============================================================================
-- 0002 - make the first-admin bootstrap possible
--
-- 0001 shipped a bootstrap procedure that does not work, and the database proves
-- it. `prevent_role_self_change()` asks `public.is_admin()`, which asks
-- `public.current_role()`, which reads `profiles` filtered by `auth.uid()`.
-- With no JWT - in the SQL editor, or under the service role - `auth.uid()` is
-- NULL, so `current_role()` is NULL, `is_admin()` is false, and the trigger
-- raises 'Only an administrator can change a role.'
--
--   select auth.uid(), public.current_role(), public.is_admin();
--   --  null | null | false   ->  the documented step was a dead end
--
-- That is the guard working as designed and the procedure being wrong at the
-- same time: the guard should stop a student promoting themselves, and it
-- should not stop the operator who owns the database.
--
-- The fix is one sanctioned way to change a role, guarded by a transaction-local
-- setting that only a SECURITY DEFINER function can raise. Clients cannot reach
-- set_config through PostgREST, so this does not reopen the hole the guard closed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The one sanctioned path for changing a role.
--
-- Transaction-local, so the allowance cannot outlive the statement that used it.
-- If the update raises - demoting the last admin - the exception aborts the
-- transaction and the setting goes with it, so there is no way to leave the
-- bypass switched on.
-- ---------------------------------------------------------------------------

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

  perform set_config('app.allow_role_change', 'on', true);

  update public.profiles
  set role = new_role
  where id = target_id;

  if not found then
    raise exception 'No profile with id %.', target_id using errcode = 'P0002';
  end if;

  perform set_config('app.allow_role_change', 'off', true);
end;
$$;

comment on function public.set_user_role(uuid, public.user_role) is
  'Privileged role assignment. Callable only by service_role and superusers; '
  'the anon and authenticated roles are explicitly revoked so this cannot '
  'become a self-promotion route.';

-- Default-deny. Without this, every role could execute the function and the
-- entire guard would be pointless.
revoke execute on function public.set_user_role(uuid, public.user_role) from public;
revoke execute on function public.set_user_role(uuid, public.user_role) from anon;
revoke execute on function public.set_user_role(uuid, public.user_role) from authenticated;

grant execute on function public.set_user_role(uuid, public.user_role) to service_role;

-- ---------------------------------------------------------------------------
-- Guard, now with a third case.
--
-- A role change is allowed when the caller is an administrator OR when it came
-- through set_user_role. Everything else is rejected, exactly as before.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sanctioned boolean := coalesce(current_setting('app.allow_role_change', true), 'off') = 'on';
begin
  if new.role is distinct from old.role and not sanctioned and not public.is_admin() then
    raise exception 'Only an administrator can change a role.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not sanctioned and not public.is_admin() then
    raise exception 'Only an administrator can change an account status.'
      using errcode = '42501';
  end if;

  -- Applies on every path, including set_user_role: the platform must never be
  -- left with nobody able to promote anyone.
  if old.role = 'admin' and new.role <> 'admin' then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Cannot demote the last administrator.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Corrected bootstrap, for the SQL editor.
--
--   select public.set_user_role(
--     (select id from public.profiles where email = 'you@example.com'),
--     'admin'
--   );
--
-- Run this AFTER registering through the app, because the profile row only
-- exists once handle_new_user has run on signup.
-- ---------------------------------------------------------------------------