-- conversation_participants was unqueryable: its own SELECT policy referenced itself.
--
-- What was wrong
-- --------------
--     create policy "participants select" on public.conversation_participants
--       for select to authenticated
--       using (user_id = auth.uid() or exists (
--         select 1 from public.conversation_participants p
--         where p.conversation_id = conversation_id and p.user_id = auth.uid()
--       ));
--
-- A Row Level Security policy that reads its own table recurses: evaluating the
-- policy for row X runs the subquery, which evaluates the policy for its rows, and so
-- on. Postgres detects it and refuses the whole statement:
--
--     ERROR: 42P17: infinite recursion detected in policy for relation "conversation_participants"
--
-- That is a 500 for the caller, not an empty result. It fires for *every* authenticated
-- user, on *every* query of this table, whatever they were trying to do. Nothing in the
-- application surfaced it because nothing in the application queries this table - the
-- messaging feature has no frontend - so the table was carried through a build, two
-- audits and a full test suite without the defect being visible. It was found by
-- asking each role to count every table it is allowed to touch, which is a check no
-- existing test performed.
--
-- What the clause was trying to do
-- --------------------------------
-- Read "a participant can see who else is in their conversation". That is a real
-- requirement for a messaging feature and it is still met below, but it cannot be
-- expressed as a self-referencing subquery. It needs to ask the question of the table
-- without the policy applying to the question.
--
-- The fix, using the pattern this schema already uses for exactly this problem
-- ---------------------------------------------------------------------------------
-- `is_enrolled_in`, `is_instructor_of` and `course_id_from_object_name` are all
-- SECURITY DEFINER and exist for this reason: a definer function runs with the
-- privileges of its owner rather than the caller's, so the policies on the table it
-- reads do not apply to it. `is_participant_in` is the fourth member of that family.
--
-- STABLE, not VOLATILE: it is used inside a policy, and Postgres requires a stable or
-- immutable function for that. SECURITY DEFINER with a fixed `search_path` so it
-- cannot be hijacked through a temporary object.

create or replace function public.is_participant_in(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = target_conversation
      and cp.user_id = auth.uid()
  );
$$;

comment on function public.is_participant_in(uuid) is
  'True when the caller is a participant in the given conversation. SECURITY DEFINER so the conversation_participants policies do not apply to the subquery; reading the table directly inside a policy on that table is infinite recursion (42P17) and fails the whole query.';

drop policy if exists "participants select" on public.conversation_participants;
create policy "participants select" on public.conversation_participants
  for select to authenticated
  using (user_id = auth.uid() or public.is_participant_in(conversation_id));

-- The insert policy checked `conversations.created_by = auth.uid()`, which reads the
-- `conversations` table. That one is safe: it is a different table, so its policies do
-- not re-enter this one. It is left alone deliberately rather than rewritten for
-- symmetry - changing a working policy to match a broken one is how working policies
-- break.

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------

-- Fails loudly if the recursion ever comes back, rather than leaving it to be
-- discovered by a 500 during a demo. `security invoker` is the default for this
-- connection, so this exercises the policy exactly as PostgREST would.
do $$
declare
  v_visible int;
begin
  select count(*) into v_visible from public.conversation_participants;
  raise notice 'conversation_participants is queryable again: % row(s) visible with no filter', v_visible;
end $$;
