-- 20261005090010_fix_submit_quiz_attempt_loop_variable.sql
--
-- Fixes a defect that made every quiz submission fail.
--
-- The bug
-- -------
-- submit_quiz_attempt declared `v_answered jsonb;` and then used `v_answered` as
-- the FOR loop variable over the quiz's questions. plpgsql matched the two, so
-- each row was assigned into the pre-declared jsonb variable - including
-- `question_id`, a uuid. Casting a bare uuid to jsonb is invalid input, because
-- `804d6f57-a3a1-...` is not JSON. Every call raised:
--
--   ERROR: 22P02 invalid input syntax for type json
--   DETAIL: Token "804d6f57" is invalid.
--
-- The symptom was total, not partial: no student could ever submit a quiz, and
-- no score could ever be produced. The stray declaration was left over from an
-- earlier draft in which the loop body looked up answers differently.
--
-- Nothing caught it. Type-check, lint, build and 107 tests were all green,
-- because none of them execute plpgsql. It surfaced only when the function was
-- called against the real database with a real student session.
--
-- The fix
-- -------
-- Drop the unused jsonb declaration and give the loop its own name, so the two
-- can never be confused again. Everything else is unchanged: grading still
-- happens over every question in the quiz, from the answer key, in the database.

create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt   public.quiz_attempts%rowtype;
  v_quiz      public.quizzes%rowtype;
  v_score     numeric(8,2) := 0;
  v_max       numeric(8,2);
  v_pct       numeric(5,2);
  v_passed    boolean;
  v_remaining integer;
  v_rows      integer;
  -- Named for the loop. Deliberately NOT `v_answered`: that name was previously
  -- declared as jsonb in this same block, and the collision is what broke it.
  v_question  record;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = 'insufficient_privilege';
  end if;

  -- A marked attempt is a record. A second submit is refused, not merged, so a
  -- bad result cannot be quietly replaced by a good one.
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt already submitted at %', v_attempt.submitted_at
      using errcode = 'check_violation';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- Grade every question in the quiz, not only the ones answered. Skipping the
  -- rest would silently inflate the percentage, because the denominator would be
  -- the questions the student chose to answer.
  for v_question in
    select q.id as question_id, q.question_type, q.points, q.case_sensitive
    from public.quiz_questions q
    where q.quiz_id = v_attempt.quiz_id
    order by q.position
  loop
    declare
      v_submitted jsonb;
      v_option    uuid;
      v_text      text;
      v_correct   boolean := false;
      v_awarded   numeric(6,2) := 0;
    begin
      select a.value into v_submitted
      from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as a(value)
      where (a.value->>'question_id')::uuid = v_question.question_id
      limit 1;

      if v_question.question_type = 'short_text' then
        v_text := nullif(btrim(v_submitted->>'text'), '');
        if v_text is not null then
          if v_question.case_sensitive then
            select true into v_correct
            from public.quiz_text_answers t
            where t.question_id = v_question.question_id and t.accepted_answer = v_text;
          else
            select true into v_correct
            from public.quiz_text_answers t
            where t.question_id = v_question.question_id
              and lower(btrim(t.accepted_answer)) = lower(v_text);
          end if;
        end if;
      else
        v_option := nullif(v_submitted->>'option_id', '')::uuid;
        if v_option is not null then
          -- The option must belong to the question being answered, otherwise one
          -- correct option id submitted for every question would score full marks.
          select true into v_correct
          from public.quiz_options o
          where o.id = v_option
            and o.question_id = v_question.question_id
            and o.is_correct;
        end if;
      end if;

      if coalesce(v_correct, false) then
        v_awarded := v_question.points;
        v_score := v_score + v_question.points;
      end if;

      insert into public.quiz_answers
        (attempt_id, question_id, selected_option_id, text_answer, is_correct, points_awarded)
      values
        (p_attempt_id, v_question.question_id, v_option, v_text,
         coalesce(v_correct, false), v_awarded)
      on conflict (attempt_id, question_id) do nothing;
    end;
  end loop;

  select coalesce(sum(points), 0) into v_max
    from public.quiz_questions where quiz_id = v_attempt.quiz_id;

  -- A quiz with no questions cannot produce a percentage. Refuse rather than
  -- divide by zero.
  if v_max = 0 then
    raise exception 'quiz has no questions' using errcode = 'check_violation';
  end if;

  v_pct := round((v_score / v_max) * 100, 2);
  v_passed := v_pct >= v_quiz.passing_score;

  update public.quiz_attempts
     set status = 'submitted', score = v_score, max_score = v_max,
         percentage = v_pct, passed = v_passed, submitted_at = now()
   where id = p_attempt_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'attempt % vanished during grading', p_attempt_id
      using errcode = 'check_violation';
  end if;

  -- When reveal_answers is false, only the outcome is disclosed. That is the
  -- point of the flag.
  v_remaining := greatest(least(v_quiz.attempts_allowed, 3) - v_attempt.attempt_number, 0);

  return jsonb_build_object(
    'attempt_id',         p_attempt_id,
    'score',              v_score,
    'max_score',          v_max,
    'percentage',         v_pct,
    'passed',             v_passed,
    'passing_score',      v_quiz.passing_score,
    'attempts_remaining', v_remaining,
    'reveal_answers',     v_quiz.reveal_answers,
    'answers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'question_id',    a.question_id,
        'is_correct',     a.is_correct,
        'points',         q.points,
        'points_awarded', a.points_awarded
      ) order by q.position), '[]'::jsonb)
      from public.quiz_answers a
      join public.quiz_questions q on q.id = a.question_id
      where a.attempt_id = p_attempt_id
    )
  );
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
