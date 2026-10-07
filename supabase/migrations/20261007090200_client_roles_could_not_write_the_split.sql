-- Client roles could write the marketplace split. Found by asking Postgres rather than
-- by attempting a write, which had proved nothing.
--
-- What was wrong
-- ---------------
--
-- Two tables created in the previous migration arrived with full write privileges for
-- every client role, because Supabase's default privileges grant ALL on tables in
-- public to anon and authenticated.
--
-- The previous migration tried to prevent this with
--
--   revoke all on <table> from anon;
--   revoke all on <table> from public;
--
-- and that is not enough. `revoke ... from public` removes the grant held by the PUBLIC
-- pseudo-role, but authenticated also holds a DIRECT default grant, which survives.
-- Asking Postgres afterwards:
--
--   has_table_privilege('authenticated', 'public.platform_settings', 'UPDATE')  -> true
--   has_table_privilege('authenticated', 'public.platform_settings', 'INSERT')  -> true
--   has_table_privilege('authenticated', 'public.platform_settings', 'DELETE')  -> true
--
-- Nothing in the application writes either table, and no UPDATE or INSERT policy exists
-- on them, so a student still could not change anything in practice. That is the
-- project's normal enforcement and it held. But the platform fee is the number that
-- decides how much of a sale the platform keeps, and "no policy happens to cover it" is
-- a weaker guarantee than "no privilege exists" - it stops holding the moment somebody
-- adds a convenient broad policy later.
--
-- The same weakness was fixed on `payments` in the previous migration, where the
-- equivalent assertion failed for the same reason. Three tables, one mistake, written
-- the same wrong way each time.
--
-- Why the earlier verification passed anyway
-- ------------------------------------------
-- The first version of the verification file set `request.jwt.claims` and then attempted
-- an UPDATE, expecting a privilege error. It did not get one, and the check was written
-- to read that as proof the table was locked down. It was not. set_config changes what
-- auth.uid() returns for RLS; it does NOT change the SQL role. The block was still
-- running as the table owner, which bypasses RLS and holds every privilege. The "student"
-- was a superuser.
--
-- So a test that asserted a real security property tested nothing at all, and reported
-- success. The assertions below ask Postgres what privileges exist, which is the actual
-- question and does not depend on who is asking.
--
-- The fix
-- -------
--
-- Revoke from each role BY NAME, not only from PUBLIC, then re-grant the one verb each
-- role legitimately needs. Nothing is given up: platform_settings stays readable by
-- signed-in users because the checkout page has to display the fee it is about to
-- charge, and payment_receipts stays service-role only.

begin;

revoke all on public.platform_settings from anon;
revoke all on public.platform_settings from authenticated;
revoke all on public.platform_settings from public;
grant select on public.platform_settings to authenticated;
grant select on public.platform_settings to service_role;

comment on table public.platform_settings is
  'One row. platform_fee_pct is the share of every gross payment the platform keeps; the remainder belongs to the instructor who owns the course. Readable by every signed-in user because the checkout page shows the fee before the student confirms, and writable by nobody directly: the rate is changed through admin_set_platform_fee, which checks is_admin() and records who changed it. Changing it affects payments created afterwards only - each payment stores the rate it was priced at.';

revoke all on public.payment_receipts from anon;
revoke all on public.payment_receipts from authenticated;
revoke all on public.payment_receipts from public;
grant all on public.payment_receipts to service_role;

-- The split columns on payments. Revoked by name in the previous migration; restated
-- here so this file stands on its own as the record of who may touch the money.
revoke insert, update on public.payments from anon;
revoke insert, update on public.payments from authenticated;

-- -----------------------------------------------------------------------------
-- Assert it, by asking Postgres rather than by trying to write.
-- -----------------------------------------------------------------------------

do $$
declare
  v_role text;
  v_bad text;
begin
  -- No client role may write platform_settings. Read is required, so SELECT is the only
  -- verb checked here.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.platform_settings', 'INSERT')
       or has_table_privilege(v_role, 'public.platform_settings', 'UPDATE')
       or has_table_privilege(v_role, 'public.platform_settings', 'DELETE') then
      v_bad := v_role || ' holds a write privilege on platform_settings';
      raise exception '%', v_bad;
    end if;
  end loop;

  -- The checkout page must still be able to show the fee.
  if not has_table_privilege('authenticated', 'public.platform_settings', 'SELECT') then
    raise exception 'authenticated must be able to read platform_settings';
  end if;

  -- payment_receipts: service role only. No client verb at all.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.payment_receipts', 'SELECT')
       or has_table_privilege(v_role, 'public.payment_receipts', 'INSERT')
       or has_table_privilege(v_role, 'public.payment_receipts', 'UPDATE')
       or has_table_privilege(v_role, 'public.payment_receipts', 'DELETE') then
      raise exception '% holds a privilege on payment_receipts', v_role;
    end if;
  end loop;

  -- The split on payments must not be client-writable.
  if has_column_privilege('authenticated', 'public.payments', 'platform_fee_centavos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_share_centavos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'platform_fee_pct', 'UPDATE') then
    raise exception 'authenticated must not be able to UPDATE the split on payments';
  end if;
  if has_column_privilege('authenticated', 'public.payments', 'platform_fee_centavos', 'INSERT')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_share_centavos', 'INSERT')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_id', 'INSERT') then
    raise exception 'authenticated must not be able to INSERT the split on payments';
  end if;

  -- And no write policy may exist on either table, so the guarantee does not rest on
  -- the absence of a policy alone.
  if exists (select 1 from pg_policies
              where schemaname = 'public'
                and tablename in ('platform_settings', 'payment_receipts')
                and cmd in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'a write policy exists on a marketplace money table';
  end if;

  -- anon must not be able to read the money at all.
  if has_table_privilege('anon', 'public.payments', 'SELECT') then
    raise exception 'anon must not hold SELECT on payments';
  end if;
end $$;

commit;
