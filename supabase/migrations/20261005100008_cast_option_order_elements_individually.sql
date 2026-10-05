-- 20261005100008_cast_option_order_elements_individually.sql
--
-- get_attempt_questions: the cast belongs on each element, not on the set.
--
-- Four migrations have now touched one expression in this function, which is a
-- process failure as much as a technical one: each time I guessed a form, pushed
-- it, and read the error from a live call. This one was tested as a standalone
-- query before being written down.
--
-- The shape that works, verified against real data first:
--
--     select array(select (jsonb_array_elements_text('["e747b557-..."]'))::uuid)
--     -> {e747b557-8982-42e6-a44a-0619482ebc00}
--
-- What failed, and why:
--
--   A.  array(select jsonb_array_elements_text(v)::uuid[])
--       ERROR: 22P02: malformed array literal
--       The cast applied to the whole set expression, so Postgres tried to parse
--       each element's *text* as an array literal.
--
--   B.  array(select jsonb_array_elements_text(v)::uuid)
--       ERROR: 42846: COALESCE could not convert type uuid[] to text[]
--       Correct element type, wrong function: jsonb_array_elements_text already
--       yields text[], so array() is text[] and will not coalesce with uuid[].
--
--   C.  array(select (jsonb_array_elements_text(v))::uuid)   <- this one
--       Parens put the cast on each scalar, so array() builds a uuid[].

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
    -- The option ids this attempt was served, in that order. See the migration
    -- header for the three forms that do not work and why this one does.
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
