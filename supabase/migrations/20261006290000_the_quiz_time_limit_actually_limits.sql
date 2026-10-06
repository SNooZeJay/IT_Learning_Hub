-- A quiz time limit did not limit anything.
--
-- What was wrong
-- --------------
-- Migration 20261005100001 is explicit about the intent:
--
--     -- A countdown in the browser is a hint, not a limit.
--     -- THE ONE ADDITION. Read the clock the server set, not the browser's.
--
-- and it read that clock in `submit_quiz_attempt` - but only to stamp a label:
--
--     if v_attempt.expires_at is not null and now() > v_attempt.expires_at then
--       v_expired := true;
--     end if;
--     ...
--     ended_via = case when v_expired then 'time_expired' ...
--
-- `save_attempt_answer` - the only function that writes an answer - never read
-- `expires_at` at all:
--
--     proname                 mentions_expires_at   enforces_deadline
--     save_attempt_answer     false                 false
--     submit_quiz_attempt     true                  true
--
-- So the deadline gated a string. A student could let the clock run out, keep calling
-- `save_attempt_answer` for as long as they liked, then submit, and be graded on
-- post-deadline work - with `ended_via = 'time_expired'` sitting in the record as the only
-- evidence. The grading loop above the label check runs unconditionally.
--
-- The fix
-- -------
-- The check goes where the write happens, which is the only place a deadline can be
-- enforced: a limit on reading time is not a limit on answering.
--
-- The comparison is `now() > expires_at` rather than `>=`, matching `submit_quiz_attempt`,
-- so the two agree on the exact instant the attempt closes. `expires_at` may be null -
-- `time_limit_minutes` is nullable, and a quiz without a limit has `expires_at is null`,
-- which means no deadline rather than a deadline of the epoch. `coalesce(..., false)` keeps
-- that explicit rather than relying on `null > now()` being null.
--
-- The error is a `check_violation` rather than `insufficient_privilege`: the student is
-- still the owner of the attempt, the attempt is simply closed. The client treats a
-- failure from `saveAnswer` as "not saved" and carries on, which is right - the answers
-- already stored stand, and `submit_quiz_attempt` grades those.

create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_option_id uuid default null,
  p_text       text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_attempt   public.quiz_attempts%rowtype;
  v_question  public.quiz_questions%rowtype;
  v_valid     boolean := false;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = 'insufficient_privilege';
  end if;

  -- A submitted attempt is a record. Writing to it afterwards is not a draft
  -- update, it is tampering, so it is refused rather than merged.
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt already submitted' using errcode = 'check_violation';
  end if;

  -- The time limit, read from the clock the server set rather than the browser's.
  -- Without this the limit was decorative: the countdown in the interface said the
  -- attempt was over, and the server kept accepting answers for it indefinitely.
  if coalesce(v_attempt.expires_at is not null and now() > v_attempt.expires_at, false) then
    raise exception 'the time limit for this attempt has passed'
      using errcode = 'check_violation';
  end if;

  -- The question must belong to this attempt's quiz. Without this check a
  -- student could store rows against any question in the database.
  select * into v_question
    from public.quiz_questions q
    where q.id = p_question_id and q.quiz_id = v_attempt.quiz_id;

  if not found then
    raise exception 'that question is not on this quiz' using errcode = 'no_data_found';
  end if;

  -- An option must belong to the question being answered. The old system's
  -- grader had this check and a comment explaining that one correct option id
  -- submitted for every question would otherwise score full marks; the same
  -- reasoning applies to what is stored.
  if p_option_id is not null then
    select true into v_valid
    from public.quiz_options o
    where o.id = p_option_id and o.question_id = p_question_id;

    if not coalesce(v_valid, false) then
      raise exception 'that option is not on this question' using errcode = 'check_violation';
    end if;
  end if;

  -- is_correct and points_awarded are deliberately absent from this insert. They
  -- are set by submit_quiz_attempt from the stored key, and are never derived
  -- from anything the client sends.
  insert into public.quiz_answers
    (attempt_id, question_id, selected_option_id, text_answer)
  values
    (p_attempt_id, p_question_id, p_option_id, nullif(btrim(p_text), ''))
  on conflict (attempt_id, question_id) do update
    set selected_option_id = excluded.selected_option_id,
        text_answer = excluded.text_answer;
end;
$$;

comment on function public.save_attempt_answer(uuid, uuid, uuid, text) is
  'Stores one answer against the caller''s own in-progress attempt. Enforces ownership, that the attempt is still in progress, that the question and option belong to this quiz, and - added here - that the attempt''s expires_at has not passed. The deadline check was previously absent from this function and present only in submit_quiz_attempt, where it set a label rather than refusing anything.';

revoke execute on function public.save_attempt_answer(uuid, uuid, uuid, text) from anon;
revoke execute on function public.save_attempt_answer(uuid, uuid, uuid, text) from public;
grant execute on function public.save_attempt_answer(uuid, uuid, uuid, text) to authenticated;