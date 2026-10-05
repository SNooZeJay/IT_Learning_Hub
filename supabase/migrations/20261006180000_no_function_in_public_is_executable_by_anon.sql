-- 29 of 44 functions were executable by `anon`, and every one of them is SECURITY DEFINER.
--
-- What was wrong
-- --------------
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and PUBLIC includes
-- anon and every signed-in user. Functions created with an explicit `revoke ... from
-- public, anon` were safe. Functions created by `create or replace` kept whatever ACL
-- they had. Functions created by `drop` + `create` - the shape a signature change
-- requires - came back with the default ACL and no revoke, so they silently became
-- anonymously callable.
--
-- `record_payment_event` is the one that matters most, and it is how this was found. It
-- was widened for this series three times; the first widening revoked explicitly, the
-- second did not, and a check run straight after the deploy reported:
--
--     anon_can_execute: true   public_can_execute: true
--
-- That undoes the previous migration outright. Its whole purpose is that an
-- unauthenticated caller must not be able to claim an event id, and an anonymous caller
-- could call it with in_signature_verified => true and claim any id they liked, which
-- is a cleaner version of the pre-claim attack it was built to stop.
--
-- `notify` and `notify_course` are the same shape: anonymous callers could write
-- notifications to any user. `record_activity` and `record_event` let an anonymous
-- caller write audit and analytics rows.
--
-- The helpers - is_admin, is_enrolled_in, is_instructor_of and the rest - are not a
-- vulnerability on their own. They are SECURITY DEFINER because they must read tables
-- whose policies would otherwise recurse, and they read the caller's identity from
-- auth.uid(), so an anonymous caller gets `false` from all of them. They are revoked
-- from anon here anyway because there is no reason for a signed-out visitor to run
-- them, and denying it costs nothing.
--
-- The fix
-- -------
-- A loop over every function rather than a hand-written list, because the hand-written
-- list is the thing that already went wrong twice. Each function is revoked from PUBLIC
-- and anon; `authenticated` is granted only the functions the application actually
-- calls; `service_role` is granted only what it already had, which is captured before
-- anything is revoked so no grant is silently lost.
--
-- Trigger functions lose their caller grant entirely, which is correct: Postgres runs a
-- trigger function as the table owner, not as whoever wrote the row, so a trigger does
-- not need the caller to hold EXECUTE on it.
--
-- The allow-list below is not a guess. It is the union of the RPCs the frontend
-- actually invokes and the functions RLS policies call, both read out of the repository.

do $$
declare
  r          record;
  v_allow    text[] := array[
    -- Called by the frontend, read out of src/ with a grep for .rpc(
    'claim_own_course', 'course_completion_gaps', 'get_attempt_answers',
    'get_attempt_questions', 'issue_certificate', 'quiz_briefing', 'quiz_with_answers',
    'record_event', 'record_quiz_warning', 'refresh_enrollment_completion',
    'reorder_curriculum', 'reorder_quiz_options', 'reorder_quiz_questions',
    'replace_quiz_question_answers', 'save_attempt_answer', 'start_quiz_attempt',
    'submit_quiz_attempt',
    -- Called from RLS policies, so they must be executable by the role whose policy
    -- reads them, or every query under that policy fails with a permission error.
    'is_admin', 'is_enrolled_in', 'is_instructor_of', 'current_role',
    'can_edit_course_content', 'can_view_profile', 'course_id_from_object_name',
    'check_material_shape', 'is_participant_in', 'quiz_is_publishable',
    'set_user_role'
  ];
  -- service_role's existing grants, captured BEFORE anything is revoked. Reading this
  -- after the revoke would always be false, because the revoke from PUBLIC is what
  -- most of those grants came from, and the restore would then silently grant
  -- service_role nothing and the Edge Functions would stop working.
  v_service  text[];
begin
  select coalesce(array_agg(p.oid::regprocedure::text), '{}')
    into v_service
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('service_role', p.oid, 'execute');

  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    -- Default-deny first.
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);

    if r.proname = any (v_allow) then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;

    if r.sig::text = any (v_service) then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Verify, so the next signature change cannot quietly reopen this
-- ---------------------------------------------------------------------------

do $$
declare
  r        record;
  v_leaks  text := '';
begin
  for r in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    v_leaks := v_leaks || r.proname || ' ';
  end loop;

  if v_leaks <> '' then
    raise exception 'anon can still execute: %', v_leaks;
  end if;

  raise notice 'no function in public is executable by anon';
end $$;
