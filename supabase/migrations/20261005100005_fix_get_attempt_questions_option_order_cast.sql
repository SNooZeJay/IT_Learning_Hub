-- 20261005100005_fix_get_attempt_questions_option_order_cast.sql
--
-- get_attempt_questions could not run at all.
--
-- The option-order lookup used `->>` against a jsonb column and then coalesced the
-- text result with a jsonb literal:
--
--     coalesce(v_attempt.option_order ->> v_q.id::text, '[]'::jsonb)
--
-- `->>` returns text, `'[]'::jsonb` is jsonb, and Postgres will not match them:
--
--     ERROR: 42804: COALESCE types text and jsonb cannot be matched
--     CONTEXT: PL/pgSQL function get_attempt_questions(uuid) line 31
--
-- So every call to the function raised, which meant every student who pressed
-- Start got a failure rather than a quiz. Found on the first execution against the
-- live database - nothing about this was visible to type-check, lint, build or the
-- tests, because it is a Postgres type error inside a body that no query in the
-- repository calls directly.
--
-- The fix is the cast the expression needed all along: use `->` to get jsonb, then
-- cast the result, so both arms of the coalesce are jsonb.
--
-- The whole function is reproduced rather than patched, because there is no
-- CREATE OR REPLACE for a partial body - and because the ordering logic below is
-- the part worth being able to read in full.

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
    -- attempt was served at; questions outside question_order would sort to the
    -- end by the 999999 default, which cannot happen because of the any() above.
    order by coalesce(array_position(v_attempt.question_order, q.id), 999999)
  loop
    -- Read back the option ids this attempt was served, in the order it was served.
    --
    -- `array(select jsonb_array_elements_text(...))` rather than a cast. There is
    -- no implicit jsonb -> uuid[] conversion in Postgres, and `(jsonb)::uuid[]`
    -- fails with:
    --
    --     ERROR: 22P02: malformed array literal
    --     DETAIL:  "[" must introduce explicitly-specified array dimensions
    --
    -- because it hands the raw JSON text to the array parser. Extracting the
    -- elements as text and building the array from them is the form that works,
    -- and it is the reason this function is reproduced in full here rather than
    -- patched: the failure only appears at runtime, on the second call, after the
    -- first call's type error had already been fixed.
    v_ordered := coalesce(
      array(
        select jsonb_array_elements_text(v_attempt.option_order -> v_q.id::text)
      ),
      '{}'::uuid[]
    );

    -- Options in the order this attempt was served.
    --
    -- `unnest ... with ordinality` joined on the id is what keeps the stored
    -- order: `order by o.position` would ignore it entirely, and the ids are
    -- what the grading function matches on, so the display order cannot change
    -- which answer is right.
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
      -- A short_text question has no options; the accepted answers stay hidden, so
      -- the student must type the answer rather than pick from a list.
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

comment on function public.get_attempt_questions(uuid) is
  'The student''s view of their own attempt: questions and options in the order this attempt was served, and never is_correct. SECURITY DEFINER because the caller holds no SELECT on that column.';
