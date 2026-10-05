-- Remove a privilege-escalation hole: any signed-in user could grant themselves admin.
--
-- This is the most serious defect found in the audit, and it is not a
-- newly-introduced one. It has been live since 2026-10-05.
--
-- The hole
-- --------
-- `prevent_role_self_change` trusted a session variable:
--
--     sanctioned boolean := coalesce(current_setting('app.allow_role_change', true), 'off') = 'on';
--     if new.role is distinct from old.role and not sanctioned and not public.is_admin() then
--       raise exception 'Only an administrator can change a role.'
--
-- `app.allow_role_change` is a custom GUC, and PostgreSQL lets any role set a custom
-- GUC on its own session. So "sanctioned" was not a fact about who was calling. It was
-- a fact about whether the caller had remembered to set a flag.
--
-- Reproduced, as the student, inside a transaction that was rolled back:
--
--     select set_config('request.jwt.claims', '{"sub":"<student>","role":"authenticated"}');
--     set local role authenticated;
--     select set_config('app.allow_role_change', 'on', false);
--     update public.profiles set role = 'admin' where id = <student>;
--     -- role: student -> admin,  is_admin(): false -> true
--
-- Two statements, no exploit required beyond a valid session, and it defeats
-- `is_admin()` everywhere. Every policy in this database that is gated on
-- `is_admin()` becomes advisory: users, courses, categories, certificates,
-- payments, the activity log. The `profiles update own` policy already permits
-- `id = auth.uid()`, so no further permission was needed.
--
-- Why the flag was ever there
-- ---------------------------
-- `set_user_role` is the privileged path, and it was granted only to `service_role`.
-- A service_role session is not an administrator - `is_admin()` reads the caller's
-- profile row, and service_role has none - so the trigger would have refused it. The
-- flag existed to let that one caller through.
--
-- That is no longer the design. As of the previous migration `set_user_role` checks
-- `is_admin()` itself, before it touches anything, so the caller is already known to
-- be an administrator by the time the UPDATE runs. The flag has no remaining purpose.
--
-- The fix
-- -------
-- Delete the flag branch. A role or status change is now permitted when the caller is
-- an administrator, and that is the whole rule.
--
-- `is_admin()` is safe to rely on here because it is not forgeable from a client:
-- it is `security definer` and reads the role from the profile row whose id is
-- `auth.uid()`, which comes from the verified JWT rather than from anything the
-- session can set.
--
-- Nothing that legitimately worked stops working. An administrator updating a role
-- directly was already allowed by the `is_admin()` half of the condition, and
-- `set_user_role` now qualifies on its own check. The last-administrator check sits
-- outside this condition and is untouched.

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an administrator can change a role.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Only an administrator can change an account status.'
      using errcode = '42501';
  end if;

  -- Unchanged, and deliberately outside the condition above so it applies on every
  -- path: the platform must never be left with nobody able to promote anyone.
  if old.role = 'admin' and new.role <> 'admin' then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Cannot demote the last administrator.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.prevent_role_self_change() is
  'Refuses a role or status change from anyone who is not already an administrator. Earlier versions also honoured a session variable, app.allow_role_change, which any role could set for itself and which therefore let any signed-in user promote themselves to admin. No caller-supplied signal is trusted here any more.';

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- `set_user_role` still sets the flag, harmlessly, but the reason has gone: the
-- function checks is_admin() itself before it writes. Leaving the set_config call in
-- place would be dead code that implies the flag still means something, so it is
-- removed here rather than left to mislead the next reader.
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

  -- The caller must already be an administrator. This is the only gate: the guard
  -- trigger below no longer honours any caller-supplied signal, so nothing downstream
  -- will let an unauthorised write through.
  if not public.is_admin() then
    raise exception 'Only an administrator can change a role.' using errcode = '42501';
  end if;

  if target_id = auth.uid() and new_role <> public.current_role() then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  update public.profiles
  set role = new_role
  where id = target_id;

  if not found then
    raise exception 'No profile with id %.', target_id using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_user_role(uuid, public.user_role) is
  'Privileged role assignment, callable by administrators. Self-defending: the caller is checked with is_admin() here and the guard trigger trusts no caller-supplied signal, so widening the EXECUTE grant cannot make this a self-promotion route.';
