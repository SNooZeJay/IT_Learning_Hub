-- 20261005100000_quiz_attempt_state_and_presentation.sql
--
-- The quiz could be started, answered, graded and never resumed. Everything the
-- assessment experience needs beyond "one number out of many" lived nowhere.
--
-- What is missing and why it has to be in the database
-- ------------------------------------------------------
-- 1. The shuffle was not frozen anywhere.
--
--    `quizzes.shuffle_questions` exists and nothing read it. A shuffle computed in
--    the browser would be recomputed on every render, so a refresh mid-quiz
--    would renumber the questions under the student - and a question they had
--    already answered would appear unanswered. `question_order` and
--    `option_order` are written once when the attempt starts and read on every
--    subsequent load, so the order is a property of the attempt rather than of
--    the page.
--
--    The order is stored as *ids*, never as positions or as a copy of the
--    question. Grading looks an option up by id and checks `is_correct`, so the
--    display order cannot change which answer is right. That is the requirement
--    that shuffling must never alter.
--
-- 2. Warnings had nowhere to be counted.
--
--    Client-side counting alone is not a record. `warning_count` is incremented
--    by a SECURITY DEFINER function that refuses to count past the limit, so a
--    student cannot reset their own warnings by reloading, and an instructor
--    reviewing an attempt can see what happened during it.
--
-- 3. A time limit could only be honoured by the browser.
--
--    `expires_at` is set from `time_limit_minutes` at start and checked in the
--    grading path, so a student who closes the laptop and comes back cannot
--    submit a full attempt after their time is up.
--
-- 4. Nothing recorded how an attempt ended.
--
--    `ended_via` distinguishes a student's own submit from a timeout and from
--    the consequence of too many warnings, which is the difference between
--    "finished" and "ran out" when somebody reads the record afterwards.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.quizzes
  add column if not exists instructions text,
  add column if not exists max_warnings integer not null default 3;

comment on column public.quizzes.instructions is
  'Shown on the pre-quiz screen, before the student commits. This is where the rules live, rather than being discovered during the quiz.';
comment on column public.quizzes.max_warnings is
  'How many focus-loss warnings before the attempt is ended. Capped at 5 by check_quiz_max_warnings.';

alter table public.quiz_attempts
  add column if not exists question_order uuid[],
  add column if not exists option_order jsonb,
  add column if not exists warning_count integer not null default 0,
  add column if not exists expires_at timestamp with time zone,
  add column if not exists ended_via text;

comment on column public.quiz_attempts.question_order is
  'Question ids in the order this attempt was served. Written once at start so a refresh cannot renumber the quiz under the student.';
comment on column public.quiz_attempts.option_order is
  'Map of question_id to option ids in the order served. The ids are unchanged, so grading by id is unaffected by the shuffle.';
comment on column public.quiz_attempts.warning_count is
  'Focus-loss warnings recorded server-side. Reloading does not reset it.';
comment on column public.quiz_attempts.expires_at is
  'When this attempt ran out of time, or null for no limit. Enforced in the grading path, not only by a countdown.';
comment on column public.quiz_attempts.ended_via is
  'student_submit, time_expired, or warnings_exhausted. Null while in progress.';

-- An unbounded warning budget would make the warning system meaningless, and a
-- cap of 5 keeps the consequence rare enough to be a real consequence.
alter table public.quizzes
  drop constraint if exists quizzes_max_warnings_check;
alter table public.quizzes
  add constraint quizzes_max_warnings_check check (max_warnings between 1 and 5);

alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_warning_count_check;
alter table public.quiz_attempts
  add constraint quiz_attempts_warning_count_check check (warning_count >= 0);

alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_ended_via_check;
alter table public.quiz_attempts
  add constraint quiz_attempts_ended_via_check
  check (ended_via is null or ended_via in ('student_submit', 'time_expired', 'warnings_exhausted'));

create index if not exists quiz_attempts_student_quiz_idx
  on public.quiz_attempts (quiz_id, student_id, attempt_number);

-- ---------------------------------------------------------------------------
-- start_quiz_attempt - freeze the shuffle and start the clock
-- ---------------------------------------------------------------------------

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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

  -- Unpublishing a course must not lock a student out of work already in
  -- progress, but it must also stop a new attempt being started. Enrolment
  -- already covers the "keeps access" half; this covers the other half.
  --
  -- `active` or `completed` only. A `pending` enrolment is a payment in flight
  -- and grants nothing.
  select * into v_enrollment
    from public.enrollments
    where course_id = v_quiz.course_id and student_id = auth.uid()
      and status in ('active', 'completed')
    order by enrolled_at desc
    limit 1;

  if not found then
    raise exception 'not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_used
    from public.quiz_attempts where quiz_id = p_quiz_id and student_id = auth.uid();

  if v_used >= least(v_quiz.attempts_allowed, 3) then
    raise exception 'no attempts remaining: % of % used', v_used, v_quiz.attempts_allowed
      using errcode = 'check_violation';
  end if;

  -- Serve the questions. When shuffling is off this is the author's order, so a
  -- non-shuffled quiz is byte-for-byte what the instructor arranged.
  select coalesce(array_agg(id order by
           case when v_quiz.shuffle_questions then random() else position end), '{}')
    into v_questions
    from public.quiz_questions where quiz_id = p_quiz_id;

  -- Options are shuffled independently of questions, and only when the author
  -- asked for it. Stored as ids, so grading - which looks an option up by id -
  -- cannot be affected by where it was displayed.
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
$$;

comment on function public.start_quiz_attempt(uuid) is
  'Starts an attempt and freezes its question and option order, so the shuffle belongs to the attempt rather than to the page.';


-- ---------------------------------------------------------------------------
-- get_attempt_questions - the student''s view of their own attempt
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because the caller may not hold SELECT on quiz_options'
-- `is_correct`, and this function decides what they see rather than the client
-- deciding what to ask for. It selects the columns the student is entitled to and
-- never reads is_correct at all, so the key cannot leak through it.
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
    order by coalesce(
      array_position(v_attempt.question_order, q.id),  -- the frozen order
      999999
    )
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'optionText', o.option_text
             ) order by opt.ord), '[]'::jsonb)
      into v_opts
    from public.quiz_options o
    left join lateral unnest(
      coalesce(v_attempt.option_order ->> v_q.id::text, '[]'::jsonb)
    ) with ordinality as opt(id, ord) on opt.id::uuid = o.id
    where o.question_id = v_q.id;

    v_out := v_out || jsonb_build_object(
      'questionId', v_q.id,
      'prompt', v_q.prompt,
      'questionType', v_q.question_type,
      'points', v_q.points,
      -- A short_text question has no options; the accepted answers stay hidden,
      -- so the student must type the answer rather than pick from a list.
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

revoke execute on function public.get_attempt_questions(uuid) from public, anon;
grant execute on function public.get_attempt_questions(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- record_quiz_warning - the 1 -> 2 -> 3 -> consequence ladder
-- ---------------------------------------------------------------------------

-- Returns the new count and whether the attempt has now ended, so the interface
-- can say what happened rather than the student finding out by being ejected.
--
-- Counting stops at the limit: a fourth warning returns 3 with `ended = true`,
-- so a student cannot inflate their own count by clicking away repeatedly, and
-- cannot avoid the consequence by reloading, because the count is a column and
-- not browser state.
create or replace function public.record_quiz_warning(p_attempt_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_quiz    public.quizzes%rowtype;
  v_count   integer;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = 'insufficient_privilege';
  end if;

  -- A finished attempt is a record. A warning cannot reopen it.
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt already submitted' using errcode = 'check_violation';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  v_count := least(v_attempt.warning_count + 1, v_quiz.max_warnings);

  update public.quiz_attempts
     set warning_count = v_count,
         ended_via = case when v_count >= v_quiz.max_warnings then 'warnings_exhausted' else ended_via end
   where id = p_attempt_id;

  return jsonb_build_object(
    'warningCount', v_count,
    'maxWarnings', v_quiz.max_warnings,
    'remaining', greatest(v_quiz.max_warnings - v_count, 0),
    -- The consequence is stated, not inferred: the interface is told the attempt
    -- is over rather than having to work it out from a count.
    'ended', v_count >= v_quiz.max_warnings
  );
end;
$$;

revoke execute on function public.record_quiz_warning(uuid, text) from public, anon;
grant execute on function public.record_quiz_warning(uuid, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The quiz, for the pre-quiz screen
-- ---------------------------------------------------------------------------

create or replace function public.quiz_briefing(p_quiz_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'quizId', q.id,
    'title', q.title,
    'description', q.description,
    'instructions', q.instructions,
    'questionCount', (select count(*) from public.quiz_questions k where k.quiz_id = q.id),
    'totalPoints', coalesce((select sum(k.points) from public.quiz_questions k where k.quiz_id = q.id), 0),
    'passingScore', q.passing_score,
    'attemptsAllowed', least(q.attempts_allowed, 3),
    'attemptsUsed', (select count(*) from public.quiz_attempts a
                       where a.quiz_id = q.id and a.student_id = auth.uid()),
    'timeLimitMinutes', q.time_limit_minutes,
    'maxWarnings', q.max_warnings,
    'shuffleQuestions', q.shuffle_questions,
    'revealAnswers', q.reveal_answers
  )
  from public.quizzes q
  where q.id = p_quiz_id
    and q.status = 'published'
    and public.is_enrolled_in(q.course_id);
$$;

revoke execute on function public.quiz_briefing(uuid) from public, anon;
grant execute on function public.quiz_briefing(uuid) to authenticated, service_role;
