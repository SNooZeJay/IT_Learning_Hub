-- 20261005100003_quiz_key_exposure_and_grant_hardening.sql
--
-- Three ways a student could read the answer key, and a set of grants that
-- nothing needed. The old Laravel system had the same idea and implemented it as
-- `studentProjection()` in one place; here it was enforced by column grants and
-- then undermined three different ways.
--
-- Hole A - reveal_answers was a promise the return value did not keep
-- ---------------------------------------------------------------------
-- The column comment says: "When false, submit_quiz_attempt omits per-question
-- correctness." It did not omit it. The jsonb carried `is_correct` for every
-- question unconditionally, and the interface merely chose not to render it.
-- Open devtools on a quiz with reveal_answers = false and the whole key is
-- there, per question, with the student's own selection beside it. Over three
-- allowed attempts that reconstructs the answer sheet.
--
-- Fixed by omitting the keys from the payload, not by hiding them in a template.
--
-- Hole B - quiz_answers was readable directly, key included
-- -----------------------------------------------------------
-- `authenticated` held SELECT on every column of `quiz_answers`, including
-- `is_correct`, and `quiz answers select own` let a student read their own rows.
-- So even with Hole A fixed, `GET /rest/v1/quiz_answers?attempt_id=eq.<own>`
-- returned the same information straight from the table.
--
-- Nothing in the frontend reads this table, and the two functions that do
-- (`save_attempt_answer`, `get_attempt_answers`) are SECURITY DEFINER and
-- therefore unaffected by the grant. So the grant can simply be dropped.
--
-- Hole C - quiz content was not enrolment-gated
-- ---------------------------------------------
-- `quiz questions select` and `quiz options select` allowed any signed-in user to
-- read every question and option of every *published* quiz on the platform. The
-- enrolment check existed on `quizzes select` but only as one OR branch beside
-- `status = 'published'`, so published quiz metadata was equally open.
--
-- This matters because a paid course's quiz is part of what was bought. Any
-- student could read the questions before paying, and `quiz_options.option_text`
-- for a multiple-choice quiz is most of the difficulty of the course.
--
-- `get_attempt_questions` reads these tables as SECURITY DEFINER and checks
-- ownership of the attempt itself, so the taking screen is unaffected.
--
-- Grants nothing needed
-- ---------------------
-- `authenticated` held INSERT on `quiz_attempts` with a policy of only
-- `student_id = auth.uid()`. A student could therefore insert attempt rows with
-- an arbitrary `attempt_number` - burning their own attempts and pushing
-- `attempts_remaining` around. `start_quiz_attempt` is SECURITY DEFINER and never
-- needed the grant.
--
-- `anon` held EXECUTE on all four quiz functions, including two SECURITY DEFINER
-- ones, because Supabase's `alter default privileges` grants it to functions and
-- `revoke ... from public` does not undo that. Not exploitable today - every one
-- of those functions gates on `auth.uid()`, which is null for anon - but it is the
-- same gap `20261005090006` closed for tables and left open for functions.

-- ---------------------------------------------------------------------------
-- Hole A: honour reveal_answers in the return value
-- ---------------------------------------------------------------------------

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
  -- completed, a quiz graded, an assignment marked." Without it a
  -- min_quiz_average requirement could never flip an enrolment to completed on
  -- its own, so a course could stay open forever after a student passed.
  if v_attempt.enrollment_id is not null then
    perform public.refresh_enrollment_completion(v_attempt.enrollment_id);
  end if;

  -- The student's own result, not the key.
  --
  -- Per-question correctness and points_awarded are only included when the quiz
  -- says they may be. Both are computed above; omitting them from the payload is
  -- what makes reveal_answers mean something.
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
            'points_awarded', a.points_awarded
          )
          -- No correctness, no points. The count of answers is still there, so
          -- the interface can say how many were answered without saying which.
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


-- ---------------------------------------------------------------------------
-- Hole C: enrolment-gate quiz content
-- ---------------------------------------------------------------------------

drop policy if exists "quiz questions select" on public.quiz_questions;
drop policy if exists "quiz options select" on public.quiz_options;

-- A published quiz is visible to an enrolled student, to whoever can edit it, and
-- to nobody else. `is_enrolled_in` already means active-or-completed, so a
-- pending payment grants nothing.
create policy "quiz questions select" on public.quiz_questions
  for select
  to authenticated
  using (
    public.is_instructor_of((select q.course_id from public.quizzes q where q.id = quiz_questions.quiz_id))
    or public.is_admin()
    or (
      (select q.status from public.quizzes q where q.id = quiz_questions.quiz_id) = 'published'
      and public.is_enrolled_in((select q.course_id from public.quizzes q where q.id = quiz_questions.quiz_id))
    )
  );

create policy "quiz options select" on public.quiz_options
  for select
  to authenticated
  using (
    public.is_instructor_of(
      (select q.course_id from public.quizzes q
        join public.quiz_questions qq on qq.quiz_id = q.id
       where qq.id = quiz_options.question_id)
    )
    or public.is_admin()
    or (
      (select q.status from public.quizzes q
         join public.quiz_questions qq on qq.quiz_id = q.id
        where qq.id = quiz_options.question_id) = 'published'
      and public.is_enrolled_in(
        (select q.course_id from public.quizzes q
           join public.quiz_questions qq on qq.quiz_id = q.id
          where qq.id = quiz_options.question_id)
      )
    )
  );


-- ---------------------------------------------------------------------------
-- Hole B and the surplus grants
-- ---------------------------------------------------------------------------

-- Nothing reads this table from the browser, and both functions that do are
-- SECURITY DEFINER. Dropping the grant removes the direct route to `is_correct`.
revoke select on public.quiz_answers from authenticated;

-- start_quiz_attempt creates the row. A direct insert could forge an attempt
-- number and burn somebody's own attempts.
revoke insert on public.quiz_attempts from authenticated;

-- Supabase grants functions to anon by default; `revoke ... from public` does not
-- undo it. Nothing here is exploitable today, and that is exactly why it is worth
-- closing while it is still boring.
revoke execute on function public.start_quiz_attempt(uuid) from anon;
revoke execute on function public.submit_quiz_attempt(uuid, jsonb) from anon;
revoke execute on function public.quiz_with_answers(uuid) from anon;
revoke execute on function public.quiz_is_publishable(uuid) from anon;

-- quiz_is_publishable lets any caller probe whether a given quiz is answerable,
-- which is a small disclosure about a draft.
revoke execute on function public.quiz_is_publishable(uuid) from public, anon;
grant execute on function public.quiz_is_publishable(uuid) to authenticated, service_role;

-- Both tables have `updated_at not null default now()` and nothing to move it, so
-- every quiz and question read as created today.
drop trigger if exists quizzes_set_updated_at on public.quizzes;
create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.set_updated_at();

drop trigger if exists quiz_questions_set_updated_at on public.quiz_questions;
create trigger quiz_questions_set_updated_at
  before update on public.quiz_questions
  for each row execute function public.set_updated_at();
