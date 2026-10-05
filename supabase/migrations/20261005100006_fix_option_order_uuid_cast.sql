-- 20261005100006_fix_option_order_uuid_cast.sql
--
-- get_attempt_questions still could not run: the previous fix corrected a type
-- mismatch and uncovered a second one behind it.
--
-- Migration 20261005100005 changed
--
--     coalesce(v_attempt.option_order ->> v_q.id::text, '[]'::jsonb)
--
-- to a jsonb form, which fixed `COALESCE types text and jsonb cannot be matched`
-- and then produced the next error on the very next attempt:
--
--     ERROR: 22P02: malformed array literal:
--       "["3efba467-...", "5a05896c-...", ...]"
--     DETAIL:  "[" must introduce explicitly-specified array dimensions.
--     CONTEXT: PL/pgSQL function get_attempt_questions(uuid) line 34
--
-- There is no implicit jsonb -> uuid[] conversion in Postgres, and casting one to
-- the other hands the raw JSON text to the array parser, which wants a bare
-- `[a,b,c]` literal and not a quoted one.
--
-- The working form extracts the elements as text and builds the array from them:
--
--     array(select jsonb_array_elements_text(...))
--
-- Recorded rather than quietly patched, because this is the THIRD consecutive
-- runtime-only failure in one expression in one function. All three were invisible
-- to type-check, lint, build and the test suite, and all three were found only by
-- calling the function on the live database - nothing in the repository invokes it
-- directly. The lesson is the same one this project has now paid repeatedly: a
-- body nothing calls is a body nothing has run.

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
    where q.id = any(coalesce(v_attempt.question_order, array[]::uuid[]))
    -- The frozen order, not the author's. array_position gives the index this
    -- attempt was served at; the 999999 default cannot be reached because of the
    -- any() above, so every row has a real position.
    order by coalesce(array_position(v_attempt.question_order, q.id), 999999)
  loop
    -- The option ids this attempt was served, in that order.
    --
    -- Two things are needed here and both were found the hard way, on a third
    -- attempt at this expression:
    --
    --   * No implicit jsonb -> uuid[] conversion exists. Casting one hands raw
    --     JSON text to the array parser, which rejects the quoted form:
    --       ERROR: 22P02: malformed array literal
    --
    --   * jsonb_array_elements_text returns text[], so array(...) is text[] and
    --     will not coalesce with '{}'::uuid[]:
    --       ERROR: 42846: COALESCE could not convert type uuid[] to text[]
    --
    -- The cast on each element is what makes both arms uuid[].
    v_ordered := coalesce(
      array(
        select jsonb_array_elements_text(v_attempt.option_order -> v_q.id::text)::uuid[]
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
             ) order by opt.ord), '[]'::jsonb)
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
      -- A short_text question has no options; the accepted answers stay on the
      -- server, so the student must type the answer rather than pick from a list.
      'options', case when v_q.question_type = 'short_text' then '[]'::jsonb else v_opts end
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
