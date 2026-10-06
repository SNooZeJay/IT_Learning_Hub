-- Nobody could ever start a conversation.
--
-- What was wrong
-- --------------
-- Two policies deadlock each other, and the client's two inserts walk straight into it.
--
--   conversations select   using (exists (select 1 from conversation_participants p
--                                  where p.conversation_id = conversations.id
--                                    and p.user_id = auth.uid()))
--
--   participants insert    with check (exists (select 1 from conversations c
--                                        where c.id = conversation_participants.conversation_id
--                                          and c.created_by = auth.uid()))
--
-- The second policy proves the caller created the conversation by *reading* the
-- conversation row. But reading a conversation row is governed by the first policy, which
-- admits only participants - and at the moment the participants are being inserted, the
-- creator is not yet one. So the check reads a row it is not allowed to see, finds
-- nothing, and refuses.
--
-- Reproduced, step by step, as a signed-in student:
--
--     insert into conversations (subject, created_by) values (...)      ok
--     rows of it the creator can select                                0
--     insert into conversation_participants (conversation_id, user_id) 42501
--
-- A policy whose predicate reads another table governed by another policy is a deadlock
-- whenever the two disagree, and here they disagree by construction. This is the third
-- variant of the same mistake in this schema - after the `X = X` tautology in the message
-- policies and the self-referencing `42P17` - and it is quieter than either, because the
-- refusal surfaces as a generic 42501 that reads like a permissions problem.
--
-- The `messaging.service.ts` header described "only the creator can add participants" as
-- though it were the feature. It was the deadlock.
--
-- The fix
-- -------
-- One function that does both inserts. SECURITY DEFINER is not a convenience here, it is
-- the only way out: the creator has to write a participant row for a conversation whose
-- row the select policy will not show them until that row exists.
--
-- Two things that function must not become:
--
-- 1. **A way to message anyone.** SECURITY DEFINER plus an INSERT into
--    `conversation_participants` means the function would happily add any uuid to a
--    conversation. So the recipient is required to appear in `messageable_people()` - the
--    caller's own instructors or students. A guessed uuid is refused, and the refusal is
--    the same one a stranger would get.
--
-- 2. **Two half-written conversations.** The previous client did two inserts with no
--    transaction between them, so a failure on the second left a conversation with one
--    participant that nobody could ever open or repair. One statement, or nothing.
--
-- Returns the new conversation id, or raises. `subject` is validated here rather than
-- relying on the CHECK constraint alone, so the message names the field.

create or replace function public.start_conversation(
  p_recipient_id uuid,
  p_subject     text
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_conversation_id uuid;
  v_subject         text;
begin
  if p_recipient_id is null then
    raise exception 'choose somebody to write to'
      using errcode = 'no_data_found';
  end if;

  if p_recipient_id = auth.uid() then
    raise exception 'you cannot start a conversation with yourself'
      using errcode = 'check_violation';
  end if;

  v_subject := btrim(coalesce(p_subject, ''));
  if v_subject = '' then
    raise exception 'give the conversation a subject so it is recognisable in your list'
      using errcode = 'check_violation';
  end if;
  if length(v_subject) > 120 then
    raise exception 'a subject can be at most 120 characters'
      using errcode = 'check_violation';
  end if;

  -- The entitlement check. Without it this function would let any signed-in user add any
  -- account to a conversation, because SECURITY DEFINER is not bound by the caller's
  -- RLS on `conversation_participants`.
  if not exists (
    select 1 from public.messageable_people() where person_id = p_recipient_id
  ) then
    raise exception 'you cannot start a conversation with that person'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.conversations (subject, created_by)
  values (v_subject, auth.uid())
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, auth.uid()), (v_conversation_id, p_recipient_id);

  return v_conversation_id;
end;
$$;

comment on function public.start_conversation(uuid, text) is
  'Creates a conversation and adds both participants in one statement. It exists because the client could not do it: participants insert proved the caller created the conversation by reading the conversation row, and conversations select admitted only participants - so the creator could not read their own brand-new conversation and the participant insert was refused. SECURITY DEFINER gets past that, and the messageable_people() check is what stops it becoming "add any uuid to a conversation".';

revoke execute on function public.start_conversation(uuid, text) from anon;
revoke execute on function public.start_conversation(uuid, text) from public;
grant execute on function public.start_conversation(uuid, text) to authenticated;