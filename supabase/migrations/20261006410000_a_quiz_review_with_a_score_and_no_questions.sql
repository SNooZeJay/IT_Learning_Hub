-- Three of five quiz reviews were blank, and the read path is why.
--
-- What was wrong
-- --------------
-- `get_attempt_questions` decides which questions an attempt showed from the attempt's
-- own `question_order`, and it filtered on it:
--
--     where q.id = any(coalesce(v_attempt.question_order, array[]::uuid[]))
--
-- `coalesce` turns a NULL order into an empty array, so a NULL order silently became
-- "this attempt had no questions". No error, no warning - just an empty list.
--
-- Three submitted attempts have `question_order is null`, all on "Module 1 check".
-- Measured, as the owning student:
--
--     get_attempt_questions(53eefddb)
--       status            submitted
--       score             5.00/5.00
--       questions served  0
--       questions         []
--
-- A score of 5.00 out of 5.00 with nothing above it and nothing wrong-looking. Each of
-- those attempts has three graded answers against a three-question quiz, so the work is
-- all there; the review simply could not name it.
--
-- Why those three rows are NULL
-- -----------------------------
-- `start_quiz_attempt` sets `question_order` on every attempt it creates, and has done
-- since the column was introduced. So these rows are not from a broken code path - they
-- predate the column. Nothing was broken at the time; the reader just assumed the column
-- was always populated.
--
-- Why they are not backfilled
-- ---------------------------
-- All three belong to "Module 1 check", which has `shuffle_questions = true`. The order
-- the student actually saw was randomised at the moment the attempt was served, and it
-- was not recorded anywhere. Writing the questions' position order into `question_order`
-- would produce a plausible-looking array that claims the attempt was served in author
-- order, when it was not. A NULL is the truthful value for "not recorded", so the rows
-- keep it and the reader copes instead.
--
-- That is why this is a reader fix and not a data fix: the alternative would be to
-- fabricate the one field whose whole purpose is to record what the student saw.
--
-- The fix
-- -------
-- An attempt with no recorded order serves every question in its quiz, in author order.
-- An attempt with one serves exactly that order, and only the questions it names - which
-- is still what hides a question deleted since the attempt was served.
--
--     order by coalesce(array_position(v_attempt.question_order, q.id), q.position)
--
-- `array_position` of a NULL array is NULL, so the same expression covers both cases and
-- needs no second branch.

create or replace function public.get_attempt_questions(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_quiz    public.quizzes%rowtype;
  v_out     jsonb;
  v_q       record;
  v_opts    jsonb;
  v_ordered uuid[];
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  v_out := '[]'::jsonb;

  for v_q in
    select q.id, q.prompt, q.question_type, q.points
    from public.quiz_questions q
    where q.quiz_id = v_attempt.quiz_id
      -- A recorded order is authoritative and exclusive: it names the questions this
      -- attempt was served, so a question added to the quiz afterwards stays out of the
      -- review, and one deleted since the attempt was taken cannot be named.
      and (
        v_attempt.question_order is null
        or q.id = any(v_attempt.question_order)
      )
    -- The frozen order where there is one. `array_position` returns NULL for a NULL
    -- array, so an attempt that predates the column falls through to author order -
    -- every question, in the order the author wrote them, rather than none of them.
    order by coalesce(array_position(v_attempt.question_order, q.id), q.position)
  loop
    -- The option ids this attempt was served, in that order. Absent for the same
    -- reason the question order is: the attempt predates the column. `option_order` is
    -- keyed by question id, and a question with no entry simply has no recorded shuffle,
    -- so its options are read in their stored order below.
    v_ordered := coalesce(
      array(
        select (jsonb_array_elements_text(v_attempt.option_order -> v_q.id::text))::uuid
      ),
      '{}'::uuid[]
    );

    -- Options in the served order.
    --
    -- `unnest ... with ordinality` joined on the id is what preserves it:
    -- `order by o.position` would ignore it entirely. The ids are what grading
    -- matches on, so where an option is displayed cannot change whether it is the
    -- right answer.
    select coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'optionText', o.option_text
             ) order by coalesce(opt.ord, o.position)), '[]'::jsonb)
      into v_opts
    from public.quiz_options o
    left join lateral unnest(v_ordered) with ordinality as opt(id, ord)
      on opt.id = o.id
    where o.question_id = v_q.id;

    v_out := v_out || jsonb_build_object(
      'questionId', v_q.id,
      'prompt', v_q.prompt,
      'questionType', v_q.question_type,
      'points', v_q.points,
      'options', v_opts
    );
  end loop;

  return jsonb_build_object(
    'questions', v_out,
    'expiresAt', v_attempt.expires_at,
    'warningCount', v_attempt.warning_count,
    'maxWarnings', v_quiz.max_warnings,
    'timeLimitMinutes', v_quiz.time_limit_minutes,
    'attemptNumber', v_attempt.attempt_number,
    'attemptsAllowed', least(v_quiz.attempts_allowed, 3),
    'status', v_attempt.status,
    'passed', v_attempt.passed,
    'percentage', v_attempt.percentage,
    'score', v_attempt.score,
    'maxScore', v_attempt.max_score,
    'revealAnswers', v_quiz.reveal_answers
  );
end;
$$;

comment on function public.get_attempt_questions(uuid) is
  'The questions an attempt was served, with their options and no correctness flags. An attempt whose question_order was recorded serves exactly that order and only those questions; one that predates the column, or whose order was never stored, serves every question in its quiz in author order. The order is never invented: an attempt on a shuffling quiz that predates the column is shown in author order and says so by having no recorded order at all.';

-- Proved, and proved on the rows that were broken. A guard that only checks the new
-- function on a well-formed attempt would have passed while all three real ones stayed
-- empty.
do $$
declare
  v_attempt uuid;
  v_student uuid;
  v_served  jsonb;
  v_bad     text;
  r         record;
begin
  for r in
    select t.id, t.student_id, t.question_order
      from public.quiz_attempts t
     where t.status = 'submitted'
  loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', r.student_id::text, 'role', 'authenticated')::text,
      true
    );

    v_served := public.get_attempt_questions(r.id);

    if r.question_order is null then
      -- Every submitted attempt must show at least the questions it was graded on, or
      -- the review is a score with nothing under it.
      if jsonb_array_length(v_served->'questions') = 0 then
        raise exception
          'attempt % has no recorded question order and its review serves no questions',
          r.id;
      end if;
    else
      -- An attempt with a recorded order serves exactly that many questions, no more.
      if jsonb_array_length(v_served->'questions') <>
         array_length(r.question_order, 1) then
        raise exception
          'attempt % recorded % question(s) but its review serves %',
          r.id,
          array_length(r.question_order, 1),
          jsonb_array_length(v_served->'questions');
      end if;
    end if;

    -- And nothing may come back without options, since every question is a choice.
    select string_agg(
             format('question %s has %s option(s)', x->>'questionId',
                    jsonb_array_length(coalesce(x->'options', '[]'::jsonb))), '; ')
      into v_bad
      from jsonb_array_elements(v_served->'questions') as x
     where jsonb_array_length(coalesce(x->'options', '[]'::jsonb)) < 2;

    if v_bad is not null then
      raise exception 'attempt %: %', r.id, v_bad;
    end if;
  end loop;

  raise notice 'every submitted attempt now serves its questions in a review';
end;
$$;