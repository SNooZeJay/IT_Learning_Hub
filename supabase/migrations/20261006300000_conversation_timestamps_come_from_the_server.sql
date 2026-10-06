-- Two timestamps were written from the browser and compared against server-written ones.
--
-- What was wrong
-- --------------
-- `conversation_messages.created_at` is `timestamptz not null default now()` - the server
-- clock. Two client writes then stamped values from the browser's clock:
--
--     messaging.service.ts   markConversationRead -> participants.last_read_at = new Date().toISOString()
--     messaging.service.ts   sendMessage         -> conversations.last_message_at = new Date().toISOString()
--
-- `last_read_at` is compared directly against `created_at` by `conversation_inbox`:
--
--     and msg.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz)
--
-- So the unread count is `server time` versus `browser time`. A browser clock a minute
-- behind silently marks unseen messages as read. A clock ahead hides them until it catches
-- up. Neither is detectable, and both look like a wrong number rather than a wrong clock.
--
-- `last_message_at` disagrees with the `created_at` of the message it describes for the
-- same reason, and it is what orders the inbox - so a skewed client reorders the list.
--
-- Before today's change this did not matter: the count was `last_read_at is null`, where
-- clock skew is irrelevant. Making the count correct is what made the skew matter.
--
-- The fix
-- -------
-- Both timestamps are now written by the database.
--
-- `conversation_last_message_at` is a trigger on the message insert, so the conversation's
-- stamp is by construction the message's own `created_at` and the two cannot disagree. It
-- also removes the client's second write entirely, which was a place where a partial
-- failure - message stored, stamp not - left the conversation ordered by a time older than
-- its newest message.
--
-- `mark_conversation_read` is a function rather than an UPDATE so it can use `now()`. The
-- client's UPDATE is now gone; it never needed to choose a column beyond `last_read_at`,
-- which is all the grant permits.
--
-- SECURITY DEFINER is unnecessary and deliberately not used: both operations are already
-- permitted by policy for the caller's own rows, so they stay subject to RLS and inherit
-- the ownership rules rather than restating them. The function is SECURITY INVOKER.

create or replace function public.conversation_last_message_at()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- NEW.created_at, not now(): the conversation should be stamped with the moment of the
  -- message itself, so the two cannot drift even if the trigger fires inside a transaction
  -- that began earlier.
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;

  return new;
end;
$$;

comment on function public.conversation_last_message_at() is
  'Stamps the parent conversation with the newest message''s own created_at. Replaces a client write of last_message_at using the browser clock, which could disagree with created_at and reorder the inbox.';

drop trigger if exists conversation_messages_stamp_last_message on public.conversation_messages;
create trigger conversation_messages_stamp_last_message
  after insert on public.conversation_messages
  for each row execute function public.conversation_last_message_at();

-- Ownership is asserted explicitly rather than left to the update policy, so this is
-- correct even if that policy is later widened - and so the intent is legible here.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();

  return found;
end;
$$;

comment on function public.mark_conversation_read(uuid) is
  'Marks one of the caller''s own threads read, using the database clock. SECURITY INVOKER on purpose: the conversation_participants update policy already restricts this to the caller''s own row, so inheriting it is safer than restating it as a definer function. Exists so that last_read_at is never written from a browser, since conversation_inbox compares it against a server-written created_at.';

revoke execute on function public.mark_conversation_read(uuid) from anon;
revoke execute on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke execute on function public.conversation_last_message_at() from anon;
revoke execute on function public.conversation_last_message_at() from public;
grant execute on function public.conversation_last_message_at() to authenticated;