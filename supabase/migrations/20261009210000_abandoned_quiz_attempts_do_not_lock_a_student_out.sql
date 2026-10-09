-- An abandoned attempt must not lock a student out of a quiz for ever.
--
-- THE BUG
--
-- `start_quiz_attempt` counted attempts like this:
--
--     select count(*) into v_used
--       from public.quiz_attempts
--      where quiz_id = p_quiz_id and student_id = auth.uid();
--
-- No status filter. Every row counted, including one still marked `in_progress`,
-- which is what a browser crash, a closed laptop, a phone going to sleep or a
-- dropped connection leaves behind.
--
-- The attempt is never closed by anything else. The only watcher that submits on
-- expiry lives in `QuizAttempt.vue` and it fires only while `phase === 'running'`
-- - that is, only in a tab that is open and watching. A student who closes the
-- laptop never gets it.
--
-- So the attempt stays `in_progress` for ever, `find_open_attempt` keeps offering
-- "Resume attempt N" into an attempt that ended twenty minutes ago, and the
-- allowance burns down one row at a time. Three of those - which is three ordinary
-- interruptions, not abuse - and `v_used >= least(v_quiz.attempts_allowed, 3)`
-- raises "no attempts remaining" against a student who has never actually failed
-- anything. There is no recovery path in the product.
--
-- Reproduced on the live database while auditing: one attempt started at 14:50 was
-- still `in_progress` at 15:11 with `expires_at = 15:10`, and the briefing screen
-- was still offering to resume it.
--
-- WHAT THIS CHANGES
--
-- Two things, together:
--
--   1. A sweep that closes expired `in_progress` attempts as `ended_via =
--      'abandoned'`. The row is kept, so the history stays true - the student did
--      start an attempt - but the attempt is finished rather than open, and
--      `find_open_attempt` stops offering to resume into it.
--
--   2. The count excludes `abandoned` rows, so an abandoned attempt no longer
--      spends the allowance.
--
-- `abandoned` is deliberately a different value from `time_expired`, and the
-- distinction matters. `time_expired` is a submit the SERVER made: the client was
-- alive, saw the clock run out, and the attempt was graded on whatever was
-- answered. That costs an attempt, correctly. `abandoned` means the student never
-- came back, and refunding it is the difference between a locked-out student and an
-- interrupted one.
--
-- It cannot be farmed. Producing an `abandoned` row requires starting an attempt
-- and letting `expires_at` pass without submitting, so the cheapest way to earn one
-- is to be interrupted - which is exactly the case being refunded.
--
-- The server-side grading path is untouched: `submit_quiz_attempt` already refuses
-- credit for an attempt past `expires_at`, so none of this grants extra time.

BEGIN;

-- 1. Close every attempt that is open and already past its deadline.
UPDATE public.quiz_attempts
SET status          = 'submitted',
    ended_via       = 'abandoned',
    submitted_at    = COALESCE(submitted_at, now()),
    score           = COALESCE(score, 0),
    max_score       = COALESCE(max_score, 0),
    percentage      = COALESCE(percentage, 0),
    passed          = COALESCE(passed, false)
WHERE status = 'in_progress'
  AND expires_at IS NOT NULL
  AND now() > expires_at;

-- 2. Recreate the RPC with the sweep inline, so the repair happens on the next
--    attempt rather than waiting for a cron that does not exist.
CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_quiz       public.quizzes%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_used       integer;
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

  -- Unpublishing a course must not lock a student out of an attempt they were
  -- already sitting. Same shape as the original check, left as found.
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

  -- Close anything that timed out without being submitted, for this student, before
  -- it is counted. Without this the count below sees rows that no longer describe
  -- anything, and a student who was interrupted cannot start again.
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

  -- `ended_via is distinct from 'abandoned'` is the whole fix. A submission the
  -- server timed out ('time_expired') and a student who pressed submit both still
  -- cost an attempt; only an attempt the student never returned from is refunded.
  select count(*) into v_used
    from public.quiz_attempts
    where quiz_id = p_quiz_id
      and student_id = auth.uid()
      and ended_via is distinct from 'abandoned';

  if v_used >= least(v_quiz.attempts_allowed, 3) then
    raise exception 'no attempts remaining: % of % used',
      v_used, least(v_quiz.attempts_allowed, 3) using errcode = 'check_violation';
  end if;

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

  v_number := v_used + 1;

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
$function$;

COMMIT;