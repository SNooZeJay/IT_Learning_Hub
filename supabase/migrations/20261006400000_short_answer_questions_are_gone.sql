-- Short-answer questions are gone. Multiple choice and true/false remain.
--
-- Why this is not one line
-- -----------------------
-- `ALTER TYPE question_type DROP VALUE 'short_text'` looks like the whole change. It is
-- the smallest part of it, and doing it on its own would break the quiz system.
--
-- Five functions compare `question_type` against the literal `'short_text'`:
--
--     get_attempt_questions            quiz_is_publishable        quiz_publish_guard
--     replace_quiz_question_answers     submit_quiz_attempt
--
-- A string literal compared to an enum column is coerced to that enum at execution, not
-- at parse time. So those functions would not fail to be created - they would fail when
-- called, with `invalid input value for enum question_type: "short_text"`. That is a
-- quiz a student cannot start, a quiz an instructor cannot publish, and a submission
-- that cannot be graded, all surfacing as one opaque cast error at a moment when someone
-- is trying to learn.
--
-- So the functions are rewritten first, and only then is the value dropped. Order is
-- load-bearing here; reversing it is worse than not doing it at all, because the failure
-- looks like a type problem rather than a migration problem.
--
-- A sixth function, `quiz_with_answers`, mentions `question_type` but never the literal,
-- so it is unaffected and untouched.
--
-- What a question is now
-- ----------------------
-- Every remaining type is choice-based: the student picks one option from two to four.
-- One answer per question is enforced in four independent places, which is unchanged by
-- this migration:
--
--     quiz_answers UNIQUE (attempt_id, question_id)
--     quiz_answers.selected_option_id is a single uuid, not an array
--     the authoring form renders radios
--     no question-to-option join table exists, so many answers is not representable
--
-- The option count is deliberately still variable rather than fixed at four. A question
-- with three real choices is better than one padded with a fourth invented answer.
--
-- What happens to recorded grades
-- -------------------------------
-- All five submitted attempts carried points from a short-answer question, so removing
-- those questions would leave every recorded `max_score` describing questions that no
-- longer exist. The scores are therefore recomputed from the answers that remain, using
-- the grading rule `submit_quiz_attempt` itself uses:
--
--     score      = sum of points_awarded over the surviving answers
--     max_score  = sum of points over the quiz's surviving questions
--     percentage = round(score / max_score * 100, 2)
--     passed     = percentage >= quizzes.passing_score
--
-- Three recorded percentages rise, because those students scored zero on a question
-- whose points no longer exist: 16.67% becomes 20% twice, and 25% becomes 33.33%. Two
-- stay at 100%. This is the honest outcome - a score that matches the questions actually
-- asked - and it was the explicit instruction, rather than freezing numbers that would
-- then misdescribe the quiz.
--
-- Left in place deliberately
-- ---------------------------
-- `quiz_text_answers`, `quiz_questions.case_sensitive` and `quiz_answers.text_answer`
-- all become unreachable once no question can be `short_text`. They are not dropped.
-- Each is a small, inert column or table, and dropping them would foreclose re-adding
-- written answers later - which is a decision to make when someone asks for it, not a
-- tidy-up to do in passing.

-- =========================================================================================
-- 1. Rewrite the five functions, removing every branch that reads the short-answer type.
-- =========================================================================================

-- 1a. Taking a quiz. The question list built here decides how the runner renders each
--     question, and it keyed "no options, the student types" off the question type. With
--     no type that needs it, every question renders from its options.
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
      -- Every question is answered by choosing an option. There is no longer a
      -- question whose answer is typed, so the accepted answers that used to be
      -- hidden here have no remaining reader.
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

-- 1b. Can this quiz be published? The check was "a short-answer question needs an
--     accepted answer, a choice question needs exactly one correct option". Only the
--     second half survives.
--
--     The type list is kept explicit rather than deleted. If another type is added later
--     and not added to this list, the behaviour is the pre-existing one - it is not
--     validated - which is the safe direction to fail in.
create or replace function public.quiz_is_publishable(p_quiz_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_bad text;
begin
  if not exists (select 1 from public.quiz_questions where quiz_id = p_quiz_id) then
    return false;
  end if;

  select string_agg(bad, '; ') into v_bad
  from (
    select q.id::text || ' (' || left(q.prompt, 40) || '): '
      || case
          when (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
            then 'needs at least two options'
          when (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) = 0
            then 'no option is marked correct'
          else 'more than one option is marked correct'
        end as bad
    from public.quiz_questions q
    where q.quiz_id = p_quiz_id
      and q.question_type in ('multiple_choice', 'true_false')
      and (
        (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
        or (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) <> 1
      )
  ) problems;

  return v_bad is null;
end;
$$;

-- 1c. The same rule as a trigger, so an unpublishable quiz cannot be published by any
--     route. Raised at the moment of publishing, with the reason.
create or replace function public.quiz_publish_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_bad text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select string_agg(bad, '; ') into v_bad
    from (
      select q.id::text || ' "' || left(q.prompt, 40) || '" (' || q.question_type || '): '
        || case
            when (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
              then 'needs at least two options'
            when (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) = 0
              then 'no option is marked correct'
            else 'more than one option is marked correct'
          end as bad
      from public.quiz_questions q
      where q.quiz_id = new.id
        and q.question_type in ('multiple_choice', 'true_false')
        and (
          (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
          or (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) <> 1
        )
    ) problems;

    if v_bad is not null then
      raise exception 'this quiz cannot be published yet: %', v_bad
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- 1d. Authoring. This function took two payloads - options and accepted answers - and used
--     the question type to pick which one was meaningful, refusing the mismatch. With one
--     kind of answer left, the mismatch check collapses to one direction: every question
--     takes options.
--
--     `p_text_answers` still means something, and is still validated as an array before
--     anything is written. What changed is that a non-empty one is now always refused.
--     Silently ignoring an argument would be worse than refusing it - the caller would get
--     no signal that what they sent was discarded.
create or replace function public.replace_quiz_question_answers(
  p_question_id uuid,
  p_options     jsonb,
  p_text_answers jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_course_id     uuid;
  v_question_type public.question_type;
  v_index         integer;
  v_row           jsonb;
  v_text          text;
  v_options       jsonb := coalesce(p_options, '[]'::jsonb);
  v_answers       jsonb := coalesce(p_text_answers, '[]'::jsonb);
begin
  if p_question_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  -- Resolved before anything is written, so an unknown question or somebody
  -- else's question is refused before a single row moves.
  select k.question_type, z.course_id into v_question_type, v_course_id
    from public.quiz_questions k
    join public.quizzes z on z.id = k.quiz_id
   where k.id = p_question_id;

  if v_course_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  if not public.can_edit_course_content(v_course_id) then
    raise exception 'not your course' using errcode = 'insufficient_privilege';
  end if;

  -- Both payloads have to be arrays. `jsonb_array_length` raises on anything
  -- else with a message about jsonb, which says nothing about the argument that
  -- was wrong, and it would raise after the ownership check has already passed -
  -- so a caller who sent an object gets a database diagnostic for a client
  -- mistake. Checked here, before anything is written.
  if jsonb_typeof(v_options) <> 'array' or jsonb_typeof(v_answers) <> 'array' then
    raise exception 'both answer payloads must be json arrays'
      using errcode = 'check_violation';
  end if;

  -- There is no written-answer question type any more, so accepted answers are always
  -- a mistake. Naming the type that arrived tells the caller what they did wrong rather
  -- than asserting that the feature does not exist.
  if jsonb_array_length(v_answers) > 0 then
    raise exception 'a % question takes options, not accepted answers', v_question_type
      using errcode = 'check_violation';
  end if;

  -- The delete before the insert.
  --
  -- Ordering matters for the intermediate state inside this transaction: the
  -- old key is gone before the new one lands, so if the inserts fail on a
  -- constraint the rollback restores the old rows rather than leaving a mix.
  --
  -- `quiz_text_answers` is no longer written at all, so there is nothing to clear
  -- here. The table is kept, empty, so written answers can be reintroduced without a
  -- schema change.
  delete from public.quiz_options where question_id = p_question_id;

  v_index := 0;
  for v_row in select value from jsonb_array_elements(v_options) loop
    v_index := v_index + 1;

    -- Each element is read as either a bare string or an object with a named
    -- key, because both are natural to send and only one of them can be the
    -- only one this function understands. A bare string carries no correctness
    -- and a truthy string is exactly the trap `coerceMarker` exists to avoid on
    -- the client, so a bare string here is not accepted and is refused below with
    -- a clear error.
    if jsonb_typeof(v_row) = 'string' then
      v_text := btrim(v_row #>> '{}');
    else
      v_text := btrim(coalesce(v_row ->> 'optionText', ''));
    end if;

    if v_text = '' then
      raise exception 'option % has no text', v_index using errcode = 'check_violation';
    end if;

    insert into public.quiz_options (question_id, option_text, is_correct, position)
    values (
      p_question_id,
      v_text,
      -- Read from the object form only, and read strictly. Nothing here infers
      -- `true` from text.
      case
        when jsonb_typeof(v_row) = 'object'
          then coalesce((v_row ->> 'isCorrect')::boolean, false)
        else false
      end,
      v_index
    );
  end loop;
end;
$$;

-- 1e. Grading. The loop over the quiz's questions now has one path. The option
--     ownership check below it is kept whole: it is what stops one correct option id
--     submitted for every question from scoring full marks.
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
    select q.id as question_id, q.points
    from public.quiz_questions q
    where q.quiz_id = v_attempt.quiz_id
    order by q.position
  loop
    declare
      v_submitted jsonb;
      v_option    uuid;
      v_correct   boolean := false;
      v_awarded   numeric(6,2) := 0;
      v_owned     boolean := false;
    begin
      select a.value into v_submitted
      from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as a(value)
      where (a.value->>'question_id')::uuid = v_question.question_id
        -- A payload key that is not a uuid raises here, aborting the whole
        -- submission with a cast error naming nothing useful. Refused as a bad
        -- request instead.
      limit 1;

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

      if coalesce(v_correct, false) then
        v_awarded := v_question.points;
        v_score := v_score + v_question.points;
      end if;

      -- `do update set`, not `do nothing`: a row for this question already exists
      -- whenever the student answered while the attempt was open, because
      -- `save_attempt_answer` wrote it as a draft.
      --
      -- `text_answer` is always written as null. There is no longer a question
      -- whose answer is typed, so the column is retained only so this insert keeps
      -- naming every column it owns.
      insert into public.quiz_answers
        (attempt_id, question_id, selected_option_id, text_answer, is_correct, points_awarded)
      values
        (p_attempt_id, v_question.question_id, v_option, null,
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
           when v_expired then 'time_expired'           when v_attempt.warning_count >= v_quiz.max_warnings then 'warnings_exhausted'
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

-- =========================================================================================
-- 2. Remove the questions, their records, and the enum value.

do $$
declare
  v_questions uuid[];
  v_quizzes   uuid[];
  v_attempts  uuid[];
  r           record;
begin
  -- Captured before anything is deleted, and parked in a temporary table so the checks
  -- later on can still name what was removed. Nothing survives the enum rebuild, so
  -- "which rows were short-answer rows" becomes unaskable the moment the value is gone.
  create temporary table removed_short_answer_questions on commit drop as
  select
    array_agg(id)                                    as question_ids,
    array_agg(distinct quiz_id)                      as quiz_ids,
    (select count(*) from public.quiz_questions
      where question_type <> 'short_text')           as questions_to_keep
    from public.quiz_questions
   where question_type = 'short_text';

  -- The attempt list cannot be computed inside that same select: it needs `quiz_ids`,
  -- which that select is still producing. So the column is added rather than filled in
  -- with a lateral reference to a set the query above has not finished defining.
  alter table removed_short_answer_questions add column attempt_ids uuid[];

  select question_ids, quiz_ids into v_questions, v_quizzes
    from removed_short_answer_questions;

  if array_length(v_questions, 1) is null then
    raise notice 'no short-answer questions existed; nothing removed';
    return;
  end if;

  -- Keyed on the quiz, not on the answers. Taking the attempt set from `question_order`
  -- would have found 2 of the 5, because 3 attempts were graded against a question id
  -- that is not in the order they were served. That gap is the argument for the quiz:
  -- an attempt's own bookkeeping cannot be relied on to say what it covered.
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_attempts
    from public.quiz_attempts
   where quiz_id = any(v_quizzes);

  update removed_short_answer_questions set attempt_ids = v_attempts;

  -- Answers before questions. `quiz_answers` and `quiz_text_answers` both carry a foreign
  -- key to `quiz_questions`, so this order is required rather than tidier.
  delete from public.quiz_answers      where question_id = any(v_questions);
  delete from public.quiz_text_answers where question_id = any(v_questions);
  delete from public.quiz_questions    where id = any(v_questions);

  -- The frozen question order held the deleted ids. Left in place they would name
  -- questions that do not exist, and `get_attempt_questions` filters its question list by
  -- membership of this array, so a stale id is a question that silently stops appearing.
  update public.quiz_attempts t
     set question_order = coalesce(
           (select array_agg(q)
              from unnest(coalesce(t.question_order, '{}'::uuid[])) as q
             where not (q = any(v_questions))),
           '{}'::uuid[])
   where t.question_order && v_questions;

  -- The served option order is keyed by question id, so the same removal applies. Nothing
  -- reads a key without first reading its question, so this one was harmless - but it
  -- stores the shape of a quiz that no longer exists, and that is the sort of thing that
  -- becomes load-bearing later without anyone re-checking.
  update public.quiz_attempts t
     set option_order = coalesce(
           (select jsonb_object_agg(e.key, e.value)
              from jsonb_each(coalesce(t.option_order, '{}'::jsonb)) as e(key, value)
             where not exists (
               select 1 from unnest(v_questions) as v(qid) where v.qid::text = e.key)),
           '{}'::jsonb)
   where exists (
     select 1
       from jsonb_object_keys(coalesce(t.option_order, '{}'::jsonb)) as k
       join unnest(v_questions) as v(qid) on v.qid::text = k
   );

  -- Recompute every affected attempt from the answers that remain, using exactly the rule
  -- `submit_quiz_attempt` applies, so the stored record cannot disagree with what a regrade
  -- of those answers would produce.
  for r in
    with sums as (
      select t.id as attempt_id,
             t.quiz_id,
             coalesce(sum(a.points_awarded), 0)::numeric(8,2) as score
        from public.quiz_attempts t
        left join public.quiz_answers a on a.attempt_id = t.id
       where t.id = any(v_attempts)
       group by t.id, t.quiz_id
    )
    select s.attempt_id,
           s.score,
           coalesce((select sum(q.points) from public.quiz_questions q
                      where q.quiz_id = s.quiz_id), 0)::numeric(8,2) as max_score,
           z.passing_score
      from sums s
      join public.quizzes z on z.id = s.quiz_id
  loop
    -- Refuse rather than write a grade with no denominator. This cannot happen with the
    -- data as it stands; it is here so that if it ever does, the migration stops instead
    -- of recording a division by zero or a silently perfect score.
    if r.max_score = 0 then
      raise exception
        'attempt % would be left with no possible points; refusing to record a grade',
        r.attempt_id;
    end if;

    update public.quiz_attempts
       set score      = r.score,
           max_score  = r.max_score,
           percentage = round((r.score / r.max_score) * 100, 2),
           passed     = round((r.score / r.max_score) * 100, 2) >= r.passing_score
     where id = r.attempt_id;
  end loop;

  raise notice 'short-answer rows removed: % question(s) across % quiz(es), % attempt(s) regraded',
    array_length(v_questions, 1), array_length(v_quizzes, 1), array_length(v_attempts, 1);
end;
$$;

-- =========================================================================================
-- 3. Rebuild the enum, because this database cannot drop a value from one.
-- =========================================================================================
--
-- `alter type question_type drop value 'short_text'` is the obvious statement and it does
-- not work here:
--
--     alter type public.question_type drop value 'short_text'
--     ERROR:  dropping an enum value is not implemented   (0A000)
--
-- There is also no `if exists` in that grammar - `alter type ... drop value if exists 'x'`
-- is a syntax error, which is a confusing way to discover the previous fact.
--
-- So the type is rebuilt instead, which works on any Postgres:
--
--   1. a replacement type with the two values that remain
--   2. the column cast across, through text
--   3. the old type dropped, which takes its array type with it
--   4. the replacement renamed onto the original name
--
-- The cast goes through `text` deliberately. Casting the enum to the new enum directly
-- relies on Postgres choosing a binary-coercible or assignment mapping; through text it is
-- a plain lookup, and a row holding a value the new type lacks becomes an error naming
-- that value rather than a cast that quietly misbehaves.
--
-- Every short-answer row is already gone, so the cast has nothing to reject. That ordering
-- is the whole reason section 2 runs first.

create type public.question_type_choice as enum ('multiple_choice', 'true_false');

alter table public.quiz_questions
  alter column question_type type public.question_type_choice
  using question_type::text::public.question_type_choice;

drop type public.question_type;

alter type public.question_type_choice rename to question_type;

comment on type public.question_type is
  'The kinds of question a quiz can hold: a chosen option, or true/false - which is the same
thing with two options. Written-answer questions were removed; the enum is rebuilt rather
than trimmed because this database reports "dropping an enum value is not implemented".';

-- `replace_quiz_question_answers` is the only function that names the type in its
-- signature rather than reading the column, so its cached plan points at the type object
-- that was just dropped. Re-created here against the new one, byte for byte the version
-- defined above.
create or replace function public.replace_quiz_question_answers(
  p_question_id uuid,
  p_options     jsonb,
  p_text_answers jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_course_id     uuid;
  v_question_type public.question_type;
  v_index         integer;
  v_row           jsonb;
  v_text          text;
  v_options       jsonb := coalesce(p_options, '[]'::jsonb);
  v_answers       jsonb := coalesce(p_text_answers, '[]'::jsonb);
begin
  if p_question_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  -- Resolved before anything is written, so an unknown question or somebody
  -- else's question is refused before a single row moves.
  select k.question_type, z.course_id into v_question_type, v_course_id
    from public.quiz_questions k
    join public.quizzes z on z.id = k.quiz_id
   where k.id = p_question_id;

  if v_course_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  if not public.can_edit_course_content(v_course_id) then
    raise exception 'not your course' using errcode = 'insufficient_privilege';
  end if;

  -- Both payloads have to be arrays. `jsonb_array_length` raises on anything
  -- else with a message about jsonb, which says nothing about the argument that
  -- was wrong, and it would raise after the ownership check has already passed -
  -- so a caller who sent an object gets a database diagnostic for a client
  -- mistake. Checked here, before anything is written.
  if jsonb_typeof(v_options) <> 'array' or jsonb_typeof(v_answers) <> 'array' then
    raise exception 'both answer payloads must be json arrays'
      using errcode = 'check_violation';
  end if;

  -- There is no written-answer question type any more, so accepted answers are always
  -- a mistake. Naming the type that arrived tells the caller what they did wrong rather
  -- than asserting that the feature does not exist.
  if jsonb_array_length(v_answers) > 0 then
    raise exception 'a % question takes options, not accepted answers', v_question_type
      using errcode = 'check_violation';
  end if;

  -- The delete before the insert.
  --
  -- Ordering matters for the intermediate state inside this transaction: the
  -- old key is gone before the new one lands, so if the inserts fail on a
  -- constraint the rollback restores the old rows rather than leaving a mix.
  --
  -- `quiz_text_answers` is no longer written at all, so there is nothing to clear
  -- here. The table is kept, empty, so written answers can be reintroduced without a
  -- schema change.
  delete from public.quiz_options where question_id = p_question_id;

  v_index := 0;
  for v_row in select value from jsonb_array_elements(v_options) loop
    v_index := v_index + 1;

    -- Each element is read as either a bare string or an object with a named
    -- key, because both are natural to send and only one of them can be the
    -- only one this function understands. A bare string carries no correctness
    -- and a truthy string is exactly the trap `coerceMarker` exists to avoid on
    -- the client, so a bare string here is not accepted and is refused below with
    -- a clear error.
    if jsonb_typeof(v_row) = 'string' then
      v_text := btrim(v_row #>> '{}');
    else
      v_text := btrim(coalesce(v_row ->> 'optionText', ''));
    end if;

    if v_text = '' then
      raise exception 'option % has no text', v_index using errcode = 'check_violation';
    end if;

    insert into public.quiz_options (question_id, option_text, is_correct, position)
    values (
      p_question_id,
      v_text,
      -- Read from the object form only, and read strictly. Nothing here infers
      -- `true` from text.
      case
        when jsonb_typeof(v_row) = 'object'
          then coalesce((v_row ->> 'isCorrect')::boolean, false)
        else false
      end,
      v_index
    );
  end loop;
end;
$$;

-- PostgREST caches its schema, and it resolves `quiz_questions.question_type` to a
-- concrete type OID when it builds the relation. Without this notice it keeps serving the
-- enum that was dropped, and the first request after the migration returns an error about
-- a type that no longer exists - in a place with nothing in it to connect to this change.
notify pgrst, 'reload schema';

-- =========================================================================================
-- 4. Checks.
-- =========================================================================================
--
-- Each is written to fail on the outcome this migration was capable of producing wrongly.
-- A check that can only pass is worse than none, because it reads as evidence in a
-- migration log.
--
-- They read `removed_short_answer_questions`, the temporary table section 2 filled in
-- before deleting anything. Nothing can be recovered from the enum at this point - that
-- is the entire reason the id list had to be captured first.

do $$
declare
  v_questions uuid[];
  v_quizzes   uuid[];
  v_attempts  uuid[];
  v_expected  bigint;
  v_bad       text;
  v_attempt   uuid;
  v_student   uuid;
  v_served    jsonb;
begin
  select question_ids, quiz_ids, questions_to_keep, attempt_ids
    into v_questions, v_quizzes, v_expected, v_attempts
    from removed_short_answer_questions;

  -- 4a. The value is gone from the type itself, not merely unused. Reading the enum's
  --     labels is the only way to ask this now - a column cannot be compared to a string
  --     the type no longer has. It is also the check that would catch a rebuild that
  --     silently left the old type in place under a new name.
  if exists (
    select 1
      from pg_enum e
      join pg_type ty on ty.oid = e.enumtypid
      join pg_namespace n on n.oid = ty.typnamespace
     where n.nspname = 'public'
       and ty.typname = 'question_type'
       and e.enumlabel = 'short_text'
  ) then
    raise exception 'short_text is still a member of the question_type enum';
  end if;

  -- 4b. The type has exactly the two labels that were intended. Counting is better than
  --     spotting one bad label: a third value nobody added here would slip past 4a.
  if (select count(*) from pg_enum e
        join pg_type ty on ty.oid = e.enumtypid
        join pg_namespace n on n.oid = ty.typnamespace
       where n.nspname = 'public' and ty.typname = 'question_type') <> 2 then
    raise exception 'question_type does not hold exactly the two remaining labels';
  end if;

  if v_expected is not null then
    -- 4c. Only the short-answer rows went. Compared against the count taken before the
    --     deletion, so an over-broad delete is caught rather than assumed away.
    if (select count(*) from public.quiz_questions) <> v_expected then
      raise exception 'quiz_questions holds % rows but % were expected to survive',
        (select count(*) from public.quiz_questions), v_expected;
    end if;
  end if;

  -- 4d. No answer outlived its question. The foreign keys make this unreachable, which is
  --     exactly why it is worth asserting: if those keys were ever relaxed to let some
  --     other migration through, this is the line that notices.
  select string_agg(a.question_id::text, ', ') into v_bad
    from public.quiz_answers a
   where not exists (select 1 from public.quiz_questions q where q.id = a.question_id);

  if v_bad is not null then
    raise exception 'quiz_answers reference % question(s) that no longer exist', v_bad;
  end if;

  -- 4e. No attempt's frozen order names a question that does not exist. This is the
  --     scrub's own guarantee, checked rather than assumed.
  select string_agg(t.id::text, ', ') into v_bad
    from public.quiz_attempts t
    cross join lateral unnest(coalesce(t.question_order, '{}'::uuid[])) as q(id)
   where not exists (select 1 from public.quiz_questions k where k.id = q.id);

  if v_bad is not null then
    raise exception 'attempts % still order a question that no longer exists', v_bad;
  end if;

  -- 4f. Every stored grade agrees with its own answers, exactly as `submit_quiz_attempt`
  --     would grade them. This is the check on the recomputation, and it covers every
  --     submitted attempt in the database rather than only the ones touched above - so a
  --     regrade that was missed shows up here.
  select string_agg(format('%s reads %s/%s = %s%%, its answers say %s/%s = %s%%',
                           v.attempt_id, v.stored_score, v.stored_max, v.stored_pct,
                           v.score, v.max_score, v.pct), '; ') into v_bad
    from (
      select t.id as attempt_id,
             coalesce(sum(a.points_awarded), 0)::numeric(8,2) as score,
             coalesce((select sum(q.points) from public.quiz_questions q
                        where q.quiz_id = t.quiz_id), 0)::numeric(8,2) as max_score,
             round((coalesce(sum(a.points_awarded), 0)
                    / nullif(coalesce((select sum(q.points) from public.quiz_questions q
                                        where q.quiz_id = t.quiz_id), 0), 0)) * 100, 2) as pct,
             t.score as stored_score,
             t.max_score as stored_max,
             t.percentage as stored_pct,
             t.passed as stored_passed,
             z.passing_score
        from public.quiz_attempts t
        left join public.quiz_answers a on a.attempt_id = t.id
        join public.quizzes z on z.id = t.quiz_id
       where t.status = 'submitted'
       group by t.id, t.quiz_id, t.score, t.max_score, t.percentage, t.passed,
                z.passing_score
    ) v
   where v.stored_score is distinct from v.score
      or v.stored_max is distinct from v.max_score
      or v.stored_pct is distinct from v.pct
      or v.stored_passed is distinct from (v.pct >= v.passing_score);

  if v_bad is not null then
    raise exception 'stored grades disagree with their own answers: %', v_bad;
  end if;

  -- 4g. The publishability check runs. It is the function most likely to have kept a
  --     reference to the dropped value, and a stale reference would not raise here - it
  --     would raise the first time somebody tried to publish a quiz, in the middle of
  --     their work. Calling it now moves that failure to a moment where it can be read.
  perform public.quiz_is_publishable(z.id) from public.quizzes z where z.id = any(v_quizzes);

  -- 4h. The read path a student actually uses, under a real caller's identity.
  --
  --     `get_attempt_questions` decides how each question renders, and refuses to return
  --     anything unless the claims name the attempt's own student - so the claims are set
  --     to that student first. The result is then checked for the property that matters:
  --     every question came back with at least two options and none is a written answer.
  select t.id, t.student_id into v_attempt, v_student
    from public.quiz_attempts t
    where t.id = any(v_attempts)
    order by t.submitted_at nulls last
   limit 1;

  if v_attempt is null then
    raise notice 'no attempt remained to read back; the read-path check was skipped';
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_student::text, 'role', 'authenticated')::text,
      true
    );

    v_served := public.get_attempt_questions(v_attempt);

    select string_agg(
             format('question %s is a %s question with %s option(s)',
                    x->>'questionId', x->>'questionType',
                    jsonb_array_length(coalesce(x->'options', '[]'::jsonb))), '; ')
      into v_bad
      from jsonb_array_elements(v_served->'questions') as x
     where x->>'questionType' = 'short_text'
        or jsonb_array_length(coalesce(x->'options', '[]'::jsonb)) < 2;

    if v_bad is not null then
      raise exception 'a question came back without options to choose from: %', v_bad;
    end if;

    raise notice 'read back % question(s) for attempt %, all with options',
      jsonb_array_length(v_served->'questions'), v_attempt;
  end if;

  raise notice 'question_type now holds only multiple_choice and true_false';
end;
$$;
