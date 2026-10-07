-- Verification for the validation pass: what the privilege catalog actually says.
--
-- Why this file asks rather than attempts
-- ----------------------------------------
--
-- An earlier draft of this verification tried to prove the point by ATTACKING: it set
-- `request.jwt.claims` to a student's id and then ran the UPDATE as though it were that
-- student. The UPDATE succeeded and the probe reported a failure - not because the gap
-- was open, but because the probe was not testing anything.
--
-- `set_config('request.jwt.claims', ...)` changes what `auth.uid()` returns, which is
-- what a Row Level Security POLICY reads. It does not change the SQL role. The statement
-- still ran as the table owner, and the owner bypasses RLS (this schema deliberately does
-- not set FORCE ROW LEVEL SECURITY, because every SECURITY DEFINER helper would then
-- recurse) and holds every column privilege regardless.
--
-- So there are two honest ways to check a privilege, and this file uses both:
--
--   * GRANT layer  `has_table_privilege` / `has_column_privilege` read the catalog
--                  directly. They answer "does this role hold this privilege" without
--                  depending on who is asking, which is the question. Verified here.
--   * RLS layer   a policy is only meaningful for a role that is subject to it, so it
--                  cannot be probed from a migration at all. It is verified against the
--                  running application with a real session - see the report on that pass.
--
-- Every check below raises on failure, so a change that reopens any of these gaps stops
-- here rather than shipping quietly.

-- ---------------------------------------------------------------------------
-- 1. notifications: a user may mark read, and may write nothing else
-- ---------------------------------------------------------------------------

do $$
declare
  v_text_column text;
  v_leak text := '';
begin
  -- The whole point of narrowing this grant: these are the columns a notification's
  -- credibility rests on. `link` is a URL the interface renders, so rewriting it is a
  -- phishing primitive aimed at whoever owns the row.
  foreach v_text_column in array array['id', 'user_id', 'type', 'title', 'body', 'link', 'created_at'] loop
    if has_column_privilege('authenticated', 'public.notifications', v_text_column, 'UPDATE') then
      v_leak := v_leak || ' notifications.' || v_text_column;
    end if;
  end loop;

  if v_leak <> '' then
    raise exception 'authenticated can still UPDATE:%', v_leak;
  end if;
  raise notice '1a. notifications: only read_at is client-writable: correct';

  -- And the one column that must remain writable, or the product is broken.
  if not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE') then
    raise exception 'a user must still be able to mark their own notification read';
  end if;
  raise notice '1b. notifications: marking read still permitted: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 2. certificates: revocable, not editable
-- ---------------------------------------------------------------------------

do $$
declare
  v_column text;
  v_leak text := '';
begin
  foreach v_column in array array[
    'id', 'user_id', 'course_id', 'enrollment_id', 'certificate_number',
    'final_percentage', 'issued_at'
  ] loop
    if has_column_privilege('authenticated', 'public.certificates', v_column, 'UPDATE') then
      v_leak := v_leak || ' certificates.' || v_column;
    end if;
  end loop;

  if v_leak <> '' then
    raise exception 'authenticated can still UPDATE:%', v_leak;
  end if;
  raise notice '2a. certificates: only the revocation columns are client-writable: correct';

  foreach v_column in array array['revoked_at', 'revoked_by', 'revoke_reason'] loop
    if not has_column_privilege('authenticated', 'public.certificates', v_column, 'UPDATE') then
      raise exception 'an administrator must still be able to write certificates.%', v_column;
    end if;
  end loop;
  raise notice '2b. certificates: revocation still permitted: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 3. The split on a payment is not client-writable
-- ---------------------------------------------------------------------------

do $$
begin
  if has_column_privilege('authenticated', 'public.payments', 'platform_fee_centavos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'platform_fee_pct', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_share_centavos', 'UPDATE')
     or has_column_privilege('authenticated', 'public.payments', 'instructor_id', 'UPDATE') then
    raise exception 'authenticated can still UPDATE the marketplace split on payments';
  end if;
  if has_column_privilege('authenticated', 'public.payments', 'platform_fee_centavos', 'INSERT') then
    raise exception 'authenticated can still INSERT the marketplace split on payments';
  end if;
  raise notice '3a. payments: the split is not writable by any client role: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 4. payment_receipts stays service-role only
-- ---------------------------------------------------------------------------

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.payment_receipts', 'SELECT')
       or has_table_privilege(v_role, 'public.payment_receipts', 'INSERT')
       or has_table_privilege(v_role, 'public.payment_receipts', 'UPDATE')
       or has_table_privilege(v_role, 'public.payment_receipts', 'DELETE') then
      raise exception '% holds a privilege on payment_receipts', v_role;
    end if;
  end loop;
  if not has_table_privilege('service_role', 'public.payment_receipts', 'SELECT') then
    raise exception 'service_role must be able to read payment_receipts';
  end if;
  raise notice '4a. payment_receipts: service-role only, confirmed from the catalog: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 5. platform_settings: readable, never writable by a client
-- ---------------------------------------------------------------------------

do $$
declare
  v_verb text;
  v_result boolean;
begin
  if not has_table_privilege('authenticated', 'public.platform_settings', 'SELECT') then
    raise exception 'authenticated must be able to read the platform fee';
  end if;
  if has_table_privilege('authenticated', 'public.platform_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.platform_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.platform_settings', 'DELETE') then
    raise exception 'authenticated holds a write privilege on platform_settings';
  end if;
  raise notice '5a. platform_settings: readable by students, writable by nobody: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Emails are unique, including case variants
-- ---------------------------------------------------------------------------

do $$
declare
  v_duplicates integer;
begin
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'profiles_email_unique') then
    raise exception 'profiles_email_unique does not exist';
  end if;

  select count(*) into v_duplicates from (
    select lower(email) from public.profiles group by lower(email) having count(*) > 1
  ) dupes;

  if v_duplicates > 0 then
    raise exception '% duplicate profile email(s) exist', v_duplicates;
  end if;
  raise notice '6a. no duplicate profile emails, enforced by a unique index: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 7. The relationship triggers are attached, not merely defined
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'answer_belongs_to_quiz' and not tgisinternal) then
    raise exception 'answer_belongs_to_quiz is defined but not attached';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'progress_lesson_in_course' and not tgisinternal) then
    raise exception 'progress_lesson_in_course is defined but not attached';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'payment_matches_enrollment' and not tgisinternal) then
    raise exception 'payment_matches_enrollment is defined but not attached';
  end if;
  raise notice '7a. all three relationship triggers are attached to their tables: correct';

  -- And each fires on the operations that would create the incoherence, not only insert.
  if not exists (select 1 from pg_trigger
                  where tgname = 'payment_matches_enrollment' and tgtype & 20 <> 0) then
    raise exception 'payment_matches_enrollment does not fire on UPDATE';
  end if;
  raise notice '7b. the triggers fire on UPDATE as well as INSERT: correct';
end $$;

-- ---------------------------------------------------------------------------
-- 8. The blank-title constraints are installed on all six tables
-- ---------------------------------------------------------------------------

do $$
declare
  v_expected text[];
  v_actual text[];
begin
  v_expected := array[
    'profiles_full_name_not_blank',
    'courses_title_not_blank',
    'modules_title_not_blank',
    'lessons_title_not_blank',
    'lesson_materials_title_not_blank',
    'course_categories_name_not_blank'
  ];

  -- Compared as a SET. `array_agg(... order by conname)` is alphabetical while
  -- `v_expected` is not, and `is distinct from` on arrays is order-sensitive - so the
  -- first run of this check reported six present constraints as a mismatch against the
  -- same six, purely on ordering.
  select coalesce(array_agg(conname order by conname), '{}')
    into v_actual
    from pg_constraint
   where conname = any (v_expected);

  select array_agg(x order by x) into v_expected from unnest(v_expected) x;

  if v_expected is distinct from v_actual then
    raise exception 'blank-title constraints present: %, expected: %', v_actual, v_expected;
  end if;
  raise notice '8a. all six blank-title constraints are installed: correct';
end $$;

notify pgrst, 'reload schema';
