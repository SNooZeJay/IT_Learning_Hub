-- `protect_enrollment_entitlement` was executable by `anon`, breaking the rule that no
-- function in `public` is.
--
-- A brand new function gets EXECUTE granted to PUBLIC by Postgres, and `anon` is a member
-- of PUBLIC. `revoke ... from public` therefore has to be written for every new function,
-- not only the ones that are reachable from the client - which is the same trap as
-- 20261006230000, where Supabase's default privileges granted a new helper to `anon` as an
-- explicit grant that revoking PUBLIC did not undo.
--
-- `anon` can execute 0 functions in `public` again.
--
-- Running a trigger function outside a trigger context raises
-- `trigger functions can only be called as triggers`, so the privilege was not itself
-- exploitable. It is revoked because the rule is worth keeping true rather than roughly
-- true: a count of "1, but harmless" is a count that stops being checked.

revoke execute on function public.protect_enrollment_entitlement() from anon;
revoke execute on function public.protect_enrollment_entitlement() from public;
grant execute on function public.protect_enrollment_entitlement() to authenticated;

-- The same check for the three other functions this audit added, so the count is a fact
-- rather than an assumption about which ones were remembered.
revoke execute on function public.protect_graded_submission() from anon;
revoke execute on function public.protect_graded_submission() from public;
grant execute on function public.protect_graded_submission() to authenticated;

-- `assignments_set_updated_at` is a TRIGGER name, not a function; the function it runs is
-- set_updated_at(), which predates this audit and was never regranted. Naming the trigger
-- here failed the migration with 42883, which is worth writing down because the trigger and
-- the function share a prefix and the difference is not visible from the trigger alone.

-- A regression check, so the next function added to this schema cannot quietly reopen
-- this. Placed in the migration rather than the test suite because it is a property of
-- the deployed database, not of the repository.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute');

  if v_count > 0 then
    raise exception
      'anon can execute % function(s) in public; no function in public may be executable by anon',
      v_count;
  end if;
end;
$$;