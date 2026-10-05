-- 20261005100015_a_bogus_option_is_an_unanswered_question.sql
--
-- A submission containing an option id that does not exist failed the whole
-- attempt with a raw foreign key error:
--
--     ERROR: 23503: insert or update on table "quiz_answers" violates foreign key
--             constraint "quiz_answers_selected_option_id_fkey"
--     DETAIL: Key (selected_option_id)=(5b0eb1b1-...) is not present in table quiz_options
--     CONTEXT: PL/pgSQL function submit_quiz_attempt(uuid, jsonb) line 100
--
-- The attempt stayed open, no result was produced, and the student was told
-- something went wrong with no way to act on it.
--
-- How it happens
-- --------------
-- The grading loop already checks that the option belongs to the question being
-- answered, and that check is what stops one correct option id submitted for
-- every question from scoring full marks:
--
--     select true into v_correct
--       from public.quiz_options o
--      where o.id = v_option and o.question_id = v_question.question_id and o.is_correct;
--
-- But it only sets `v_correct`. When the id is not a row at all, `v_correct`
-- stays false - correctly, the answer is wrong - and the raw id is then written to
-- `quiz_answers.selected_option_id`, where the foreign key refuses it. So the
-- score was going to be 0 for that question either way, and the attempt was
-- destroyed on the way there.
--
-- The fix
-- -------
-- Validate the option as a separate step and null it out when it does not belong
-- to this question. The question is then recorded as unanswered, which is what it
-- is: an option id from another question is not an answer to this one, and
-- `points_awarded` is 0 either way.
--
-- Worth being clear about what this does *not* change: the scoring rule is
-- untouched. A correct option belonging to a *different* question was already
-- worth nothing, and still is. This only changes what is stored and stops the
-- insert from failing.

create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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
  v_expired   boolean := false;
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
  -- bad result cannot be quietly replaced by a good one. This is what makes a
  -- double-clicked submit button safe, and it holds whatever the reason below.
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt already submitted at %', v_attempt.submitted_at
      using errcode = 'check_violation';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  if v_attempt.expires_at is not null and now() > v_attempt.expires_at then
    v_expired := true;
  end if;

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
      v_owned     boolean := false;
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
          -- Ownership is checked on its own, before the verdict, so an option
          -- that is not on this question can be discarded rather than stored.
          -- Without this the raw id went into selected_option_id and the foreign
          -- key rejected the whole insert, failing the attempt outright.
          select true into v_owned
          from public.quiz_options o
          where o.id = v_option and o.question_id = v_question.question_id;

          if coalesce(v_owned, false) then
            -- The option must belong to the question being answered, otherwise
            -- one correct option id submitted for every question would score full
            -- marks.
            select true into v_correct
            from public.quiz_options o
            where o.id = v_option
              and o.question_id = v_question.question_id
              and o.is_correct;
          else
            -- An option from another question, or one that does not exist, is not
            -- an answer to this one. Recorded as unanswered, which scores zero -
            -- the same score it was already earning, reached without the insert
            -- failing.
            v_option := null;
          end if;
        end if;
      end if;

      if coalesce(v_correct, false) then
        v_awarded := v_question.points;
        v_score := v_score + v_question.points;
      end if;

      -- `do update set`, not `do nothing`: a row for this question already exists
      -- whenever the student answered while the attempt was open, because
      -- `save_attempt_answer` wrote it as a draft.
      insert into public.quiz_answers
        (attempt_id, question_id, selected_option_id, text_answer, is_correct, points_awarded)
      values
        (p_attempt_id, v_question.question_id, v_option, v_text,
         coalesce(v_correct, false), v_awarded)
      on conflict (attempt_id, question_id) do update
        set selected_option_id = excluded.selected_option_id,
            text_answer         = excluded.text_answer,
            is_correct          = excluded.is_correct,
            points_awarded      = excluded.points_awarded;
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
         percentage = v_pct, passed = v_passed, submitted_at = now(),
         ended_via = case
           when v_expired then 'time_expired'
           when v_attempt.warning_count >= v_quiz.max_warnings then 'warnings_exhausted'
           else 'student_submit'
         end
   where id = p_attempt_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'attempt % vanished during grading', p_attempt_id
      using errcode = 'check_violation';
  end if;

  -- Grading can complete a course. The requirement function's own comment names
  -- this call site: "Called after anything that could move it: a lesson
  -- completed, a quiz graded, an assignment marked."
  if v_attempt.enrollment_id is not null then
    perform public.refresh_enrollment_completion(v_attempt.enrollment_id);
  end if;

  -- The student's own result, not the key.
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
    'ended_via',          case
                            when v_expired then 'time_expired'
                            when v_attempt.warning_count >= v_quiz.max_warnings then 'warnings_exhausted'
                            else 'student_submit'
                          end,
    'answers', (
      select coalesce(jsonb_agg(
        case when v_quiz.reveal_answers
          then jsonb_build_object(
            'question_id',    a.question_id,
            'is_correct',     a.is_correct,
            'points',         q.points,
            'points_awarded', a.points_awarded,
            'question_type',  q.question_type,
            'prompt',         q.prompt,
            'explanation',    q.explanation,
            'your_text',      a.text_answer,
            'your_option_id', a.selected_option_id,
            'options', (
              select coalesce(jsonb_agg(jsonb_build_object(
                         'id', o.id,
                         'option_text', o.option_text,
                         'is_correct', o.is_correct
                       ) order by o.position), '[]'::jsonb)
              from public.quiz_options o
              where o.question_id = a.question_id
            )
          )
          else jsonb_strip_nulls(jsonb_build_object(
            'question_id', a.question_id
          ))
        end
        order by q.position), '[]'::jsonb)
      from public.quiz_answers a
      join public.quiz_questions q on q.id = a.question_id
      where a.attempt_id = p_attempt_id
    )
  );
end;
$$;