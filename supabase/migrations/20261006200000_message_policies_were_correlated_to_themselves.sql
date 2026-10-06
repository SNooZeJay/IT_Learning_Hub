-- Private messages were readable by anyone, and writable by anyone who had any thread.
--
-- The correlation bug
-- -------------------
-- The message policies were written as:
--
--     create policy "messages select" on public.conversation_messages
--       for select to authenticated
--       using (exists (
--         select 1 from public.conversation_participants p
--         where p.conversation_id = conversation_id and p.user_id = auth.uid()
--       ));
--
-- which reads correctly and is not what was created. Inside the subquery, the
-- unqualified `conversation_id` resolves to the inner table's own column, so the
-- predicate became:
--
--     where p.conversation_id = p.conversation_id and p.user_id = auth.uid()
--
-- A tautology. The whole condition collapses to "is the caller a participant in ANY
-- conversation", which every signed-in user with a single thread satisfies.
--
-- This is the same mistake as the self-referencing policy fixed in 20261006150000, and
-- it fails in the opposite direction: that one errored loudly with 42P17, this one
-- widens access silently and returns plausible rows.
--
-- Reproduced, with three students and two private threads, A<->B and A<->C:
--
--     B, a real participant          sees the A<->B message      correct
--     C, in another thread only      sees the A<->B message      LEAK
--     C posts into the A<->B thread  ALLOWED                    LEAK
--
-- C is not in that conversation and could both read it and write into it. Nothing in
-- the application noticed, because nothing in the application used these tables - the
-- messaging feature had no frontend. A user enrolling in one conversation would have
-- opened every other conversation in the system.
--
-- The fix
-- -------
-- Qualify the outer column with the table name, which is what makes it a correlation
-- rather than a comparison of a column with itself:
--
--     p.conversation_id = conversation_messages.conversation_id
--
-- Quoting it on the right-hand table is enough and is the form used elsewhere in this
-- schema, so it reads consistently with `course_id_from_object_name` and friends.
--
-- The participants policies are correct already and are left alone: `participants
-- select` names `conversation_id` as a column of the *policed* table with no inner
-- table in scope to shadow it, which is the case that has to be qualified and the case
-- that does not. Rewriting it for symmetry would risk breaking the one that works.

drop policy if exists "messages select" on public.conversation_messages;
create policy "messages select" on public.conversation_messages
  for select to authenticated
  using (exists (
    select 1
    from public.conversation_participants p
    where p.conversation_id = conversation_messages.conversation_id
      and p.user_id = auth.uid()
  ));

drop policy if exists "messages insert" on public.conversation_messages;
create policy "messages insert" on public.conversation_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.conversation_participants p
      where p.conversation_id = conversation_messages.conversation_id
        and p.user_id = auth.uid()
    )
  );

comment on policy "messages select" on public.conversation_messages is
  'A message is readable only by the participants of its own conversation. The inner conversation_id must be qualified with the outer table, or it resolves to the inner column and the correlation becomes p.conversation_id = p.conversation_id, which any participant in any thread satisfies.';
comment on policy "messages insert" on public.conversation_messages is
  'A message may only be posted by a participant of the conversation it is posted into. Same qualified correlation as the select policy; the original omitted it and let any signed-in user post into any thread.';
