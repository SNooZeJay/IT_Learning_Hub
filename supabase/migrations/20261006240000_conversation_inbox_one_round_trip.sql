-- The unread badge counted the wrong thing, and computing it correctly in the client
-- would have meant reading every message of every conversation.
--
-- What was wrong
-- --------------
-- `countUnreadMessages` counted participant rows whose `last_read_at` was null:
--
--     select ... from conversation_participants
--     where last_read_at is null
--     -- then: return rows.length
--
-- That is "conversations never opened", not "unread messages". Two consequences, both
-- wrong in opposite directions:
--
--   * Once a thread was opened, `markConversationRead` set `last_read_at` and the thread
--     was excluded for ever after. New messages arriving in it never incremented the
--     badge, so the bell read 0 while the inbox listed unread replies in the same thread.
--
--   * A conversation created by `startConversation` has no messages and no
--     `last_read_at`, so it counted as 1 unread. Opening an empty thread did not clear
--     it, because there was nothing to read.
--
-- The header button and the sidebar badge both read that number, so the interface
-- disagreed with itself - which is the exact failure `useUnreadMessages` exists to
-- prevent, introduced by the function that feeds it.
--
-- Why a function rather than fixing the query
-- ------------------------------------------
-- An unread count is `messages newer than my last_read_at, not sent by me`. In the
-- client that means fetching the messages of every conversation to count them, which is
-- what `listConversations` was already doing - an unbounded read of full message bodies
-- on every inbox load, contradicting the comment in `messaging.service.ts` that claimed
-- the list avoided reading every message of every conversation.
--
-- So this does both jobs at once: one row per conversation, with the last message's
-- preview and the exact unread count, computed server-side from an index.
--
-- `conversation_inbox` replaces the two queries the client was making. The old
-- `countUnreadMessages` and the N+1 per-conversation `profiles` read both disappear.
--
-- RLS
-- ---
-- SECURITY DEFINER, because the caller's own policies on `conversation_participants`
-- and `conversation_messages` would otherwise have to admit this exact query, and
-- because the `profiles` read must resolve the *other* participant, whose row the
-- caller cannot otherwise select.
--
-- The boundary is inside the function and is not RLS: `mine` is filtered to
-- `p.user_id = auth.uid()`, every other join is driven from that set, and `with_id`
-- is taken as "somebody in this conversation who is not me". A caller can therefore
-- only ever see conversations they are a participant in - the same rule the policies
-- enforce, restated in a place the function controls. `search_path` is pinned.
--
-- `security_invoker` would be tidier, but it would require granting the caller select on
-- `quiz_...`-style tables just to read a preview, and the ownership filter above is the
-- rule that matters.

create index if not exists conversation_messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at desc);

comment on index public.conversation_messages_conversation_created_idx is
  'Backs both the last-message lookup and the unread count in conversation_inbox. Without it each conversation is a sequential scan of its own history, and the inbox degrades as messages accumulate.';

create or replace function public.conversation_inbox()
returns table (
  id                    uuid,
  subject               text,
  with_id               uuid,
  with_name             text,
  last_message_at       timestamp with time zone,
  last_message_preview  text,
  unread_count          bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    select p.conversation_id, p.last_read_at
    from public.conversation_participants p
    where p.user_id = auth.uid()
  ),
  peer as (
    select
      m.conversation_id,
      (select o.user_id
         from public.conversation_participants o
        where o.conversation_id = m.conversation_id
          and o.user_id <> auth.uid()
        limit 1) as peer_id
    from mine m
  ),
  last_seen as (
    select
      m.conversation_id,
      lm.body,
      lm.created_at
    from mine m
    cross join lateral (
      select msg.body, msg.created_at
      from public.conversation_messages msg
      where msg.conversation_id = m.conversation_id
      order by msg.created_at desc
      limit 1
    ) lm
  )
  select
    c.id,
    c.subject,
    pe.peer_id,
    (select pr.full_name from public.profiles pr where pr.id = pe.peer_id),
    coalesce(ls.created_at, c.last_message_at, c.created_at),
    ls.body,
    (
      select count(*)::bigint
      from public.conversation_messages msg
      where msg.conversation_id = c.id
        and msg.sender_id <> auth.uid()
        -- coalesce rather than a plain `>`: a null `last_read_at` means never read, and
        -- `created_at > null` is null, so every message in a never-opened thread would
        -- be skipped rather than counted.
        and msg.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz)
    )
  from mine m
  join public.conversations c on c.id = m.conversation_id
  left join peer pe on pe.conversation_id = c.id
  left join last_seen ls on ls.conversation_id = c.id
  order by coalesce(ls.created_at, c.last_message_at, c.created_at) desc;
$$;

comment on function public.conversation_inbox() is
  'One row per conversation the caller participates in: subject, the other participant, the last message body, and the number of messages they have not read. Security definer because the caller cannot otherwise read the other participant''s profile row; the ownership boundary is the mine CTE, which is filtered to auth.uid(), and every join is driven from it.';

-- `authenticated` only. Supabase's schema default privileges grant EXECUTE to `anon` on
-- every new function, and `revoke ... from public` does not undo that - see
-- 20261006230000, which is the same trap in the same schema.
revoke execute on function public.conversation_inbox() from anon;
revoke execute on function public.conversation_inbox() from public;
grant execute on function public.conversation_inbox() to authenticated;