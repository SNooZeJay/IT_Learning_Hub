-- The message trigger could not write, so every message was rolled back.
--
-- What was wrong
-- --------------
-- 20261006300000 added a trigger that stamps a conversation with its newest message:
--
--     create trigger conversation_messages_stamp_last_message
--       after insert on public.conversation_messages
--       for each row execute function public.conversation_last_message_at();
--
-- and wrote the function as `security invoker`. It therefore ran as `authenticated`, and
-- its `update public.conversations` was subject to `conversations`' own RLS - which has
-- no UPDATE policy at all:
--
--     SELECT 1 policy   INSERT 1 policy   (no UPDATE policy)
--
-- An AFTER trigger that raises rolls back the statement that fired it. So every
-- `sendMessage` was refused at the database with
--
--     permission denied for table conversations
--
-- and no message was ever stored. Found by sending one in the browser: the error named
-- `conversations`, the table the client had not written to for two commits, which is what
-- pointed at the trigger rather than at the client.
--
-- The fix
-- -------
-- SECURITY DEFINER, with `search_path` already pinned.
--
-- It is safe here because the trigger writes exactly one column of exactly one row - the
-- parent of the message being inserted - and that conversation id comes from the message
-- row, never from the caller. The caller cannot steer it: there is no argument. So the
-- function cannot be used to stamp a conversation the caller had no business touching.
--
-- The grant added in the previous migration is kept, because a trigger function is still
-- executable directly and there is no reason for `anon` to be able to call it.
--
-- Verified after this: as a signed-in student, sending a message stores it, and the
-- conversation's `last_message_at` equals the message's own `created_at`.

create or replace function public.conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- NEW.created_at, not now(): the conversation should carry the moment of the message
  -- itself, so the two cannot drift inside a transaction that began earlier.
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;

  return new;
end;
$$;

comment on function public.conversation_last_message_at() is
  'Stamps the parent conversation with the newest message''s own created_at. SECURITY DEFINER is required, not optional: as SECURITY INVOKER this ran as authenticated, and conversations has no UPDATE policy, so the AFTER trigger raised and rolled back every message insert. Safe because it writes one column of one row, the parent of the row being inserted, and takes no argument - a caller cannot steer which conversation is stamped.';

revoke execute on function public.conversation_last_message_at() from anon;
revoke execute on function public.conversation_last_message_at() from public;
grant execute on function public.conversation_last_message_at() to authenticated;

-- Proved, because the previous version of this migration shipped broken and the only symptom
-- was an error in the interface, on a path nobody had exercised.
--
-- The creator is a literal profile id rather than auth.uid(), because a migration runs with no
-- JWT: the first two versions of this probe failed on auth.uid() being null, which says
-- nothing about the trigger. The probe is about the trigger, so it does not depend on a caller.
do $$
declare
  v_conversation uuid := gen_random_uuid();
  v_message     uuid;
  v_stamped     timestamptz;
  v_created     timestamptz;
begin
  -- As the function's owner, which is what a trigger firing under SECURITY DEFINER does.
  insert into public.conversations (id, subject, created_by)
  values (v_conversation, 'ZZ stamp probe', (select id from public.profiles limit 1));

  insert into public.conversation_messages (id, conversation_id, sender_id, body)
  values (gen_random_uuid(), v_conversation, (select id from public.profiles limit 1), 'probe')
  returning created_at into v_created;

  select last_message_at into v_stamped
  from public.conversations where id = v_conversation;

  if v_stamped is null then
    raise exception 'the trigger did not stamp conversations.last_message_at';
  end if;

  if v_stamped <> v_created then
    raise exception
      'last_message_at (% ) does not equal the message created_at (% )',
      v_stamped, v_created;
  end if;

  delete from public.conversation_messages where conversation_id = v_conversation;
  delete from public.conversations where id = v_conversation;
end;
$$;