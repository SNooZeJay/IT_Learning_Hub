-- The attempt NUMBER is not the attempt ALLOWANCE.
--
-- This is the second half of the abandoned-attempt fix, and it exists because the
-- first half was wrong. Both were found by driving the live database, not by reading
-- it.
--
-- THE BUG THE FIRST FIX INTRODUCED
--
-- The previous migration made an abandoned attempt stop counting towards the
-- allowance. That is correct, and it was written against:
--
--     select count(*) into v_used from quiz_attempts ...
--       and ended_via is distinct from 'abandoned';
--
--     v_number := v_used + 1;
--
-- Deriving the NUMBER from the COUNT only works while every row counts. Once one is
-- refunded, `v_used` is no longer the number of rows. A student with one abandoned
-- attempt has v_used = 0, so the next attempt is offered attempt_number 1 - which
-- already exists - and the unique index rejects it:
--
--     duplicate key value violates unique constraint
--     "quiz_attempts_quiz_id_student_id_attempt_number_key"
--
-- Caught by calling the RPC directly with a real student token. In the UI it showed
-- as a button that said "Start the quiz" and silently created nothing: the error was
-- swallowed into a generic message by `messageOf`. That is the reason this file
-- exists rather than a note in the previous one.
--
-- THE FIX
--
-- Two quantities that were being computed from one:
--
--   v_used    - how many attempts the ALLOWANCE has spent. The count, excluding
--               abandoned rows. Answers "may this student try again".
--   v_highest - the next attempt NUMBER. max(attempt_number) + 1 over ALL rows,
--               abandoned included. Answers "what should this one be called".
--
-- The number has to be monotonic within (quiz, student) whatever the allowance is
-- doing: it is what "Resume attempt 2" renders, and what a transcript cites. A
-- refund must not renumber history.
--
-- Nothing else moves. The expiry sweep and the abandoned exclusion are carried over
-- unchanged, and `submit_quiz_attempt` is untouched, so no path gains time or credit.

BEGIN;

CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
declare
  v_quiz       public.quizzes%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_used       integer;
  v_highest    integer;
  v_number     integer;
  v_attempt    uuid;
  v_questions  uuid[];
  v_options    jsonb := '{}'::jsonb;
  v_row        record;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'quiz not found' using errcode = 'no_data_found';
  end if;

  if v_quiz.status <> 'published' then
    raise exception 'quiz is not published' using errcode = 'check_violation';
  end if;

  select * into v_enrollment
    from public.enrollments
    where course_id = v_quiz.course_id
      and student_id = auth.uid()
      and status in ('active', 'completed')
    order by enrolled_at desc
    limit 1;

  if not found then
    raise exception 'not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  -- Close this student's attempts that timed out without being submitted, before
  -- anything counts them. An attempt left open by a closed tab is not open for ever:
  -- nothing else would ever close it.
  update public.quiz_attempts
     set status       = 'submitted',
         ended_via    = 'abandoned',
         submitted_at = COALESCE(submitted_at, now()),
         score        = COALESCE(score, 0),
         max_score    = COALESCE(max_score, 0),
         percentage   = COALESCE(percentage, 0),
         passed       = COALESCE(passed, false)
   where quiz_id = p_quiz_id
     and student_id = auth.uid()
     and status = 'in_progress'
     and expires_at is not null
     and now() > expires_at;

  -- THE ALLOWANCE. Abandoned attempts are refunded; a submit the student pressed, and
  -- a submit the server made on time_expired, both still cost an attempt.
  select count(*) into v_used
    from public.quiz_attempts
    where quiz_id = p_quiz_id
      and student_id = auth.uid()
      and ended_via is distinct from 'abandoned';

  if v_used >= least(v_quiz.attempts_allowed, 3) then
    raise exception 'no attempts remaining: % of % used',
      v_used, least(v_quiz.attempts_allowed, 3) using errcode = 'check_violation';
  end if;

  -- THE NUMBER. Monotonic over every row this student has, refunded ones included, so
  -- a refund never renumbers the attempts that are already in a transcript.
  select coalesce(max(attempt_number), 0) + 1 into v_highest
    from public.quiz_attempts
    where quiz_id = p_quiz_id
      and student_id = auth.uid();

  select coalesce(array_agg(q.id order by q.position), '{}')
    into v_questions
    from public.quiz_questions q
    where q.quiz_id = p_quiz_id;

  for v_row in
    select q.id as question_id, coalesce(array_agg(o.id order by
             case when v_quiz.shuffle_questions then random() else o.position end), '{}') as ids
    from public.quiz_questions q
    left join public.quiz_options o on o.question_id = q.id
    where q.quiz_id = p_quiz_id
    group by q.id
  loop
    v_options := v_options || jsonb_build_object(v_row.question_id::text, to_jsonb(v_row.ids));
  end loop;

  v_number := v_highest;

  insert into public.quiz_attempts
    (quiz_id, course_id, enrollment_id, student_id, attempt_number,
     question_order, option_order, expires_at)
  values
    (p_quiz_id, v_quiz.course_id, v_enrollment.id, auth.uid(), v_number,
     v_questions, v_options,
     case when v_quiz.time_limit_minutes is null then null
          else now() + make_interval(mins => v_quiz.time_limit_minutes) end)
  returning id into v_attempt;

  return v_attempt;
end;
$fn$;

COMMIT;