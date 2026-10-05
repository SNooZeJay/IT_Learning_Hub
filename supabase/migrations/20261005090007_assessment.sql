-- 0007_assessment.sql
--
-- Quizzes: authoring, sitting, and grading.
--
-- The security problem this migration exists to solve
-- ---------------------------------------------------
-- A quiz is only a quiz if a student cannot read the answers before submitting.
-- Two things give the answers away if you are not careful, and both are easy to
-- ship by accident:
--
--   1. quiz_options.is_correct is a column on a table the student must read, in
--      order to render the answer buttons. `select * from quiz_options` hands
--      over every correct answer in the course.
--   2. Grading in the browser lets a student post whatever score they like.
--
-- So: options are readable column-limited, with `is_correct` and the explanation
-- withheld, and grading happens in a SECURITY DEFINER function that the client
-- cannot influence. The student's browser never decides whether they passed.
--
-- Short-answer questions would need an accepted-answer column on the question
-- itself, which the student must also read in order to see the prompt. So the
-- accepted answers live in their own table with no student policy at all, and the
-- grading function reads it as its owner.
--
-- Section 19.4 of the spec: attempts are counted per quiz, default 3, and capped
-- at 3. The cap is a CHECK constraint rather than application logic so that no
-- client, and no future code path, can raise it.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.quiz_status as enum ('draft', 'published');

create type public.question_type as enum ('multiple_choice', 'true_false', 'short_text');

create type public.attempt_status as enum ('in_progress', 'submitted');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.quizzes (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references public.courses (id) on delete cascade,
  -- A quiz hangs off a module, a lesson, or the course as a whole. Any of the
  -- three may be null, so these are nullable rather than exclusive constraints.
  module_id           uuid references public.modules (id) on delete set null,
  lesson_id           uuid references public.lessons (id) on delete set null,
  title               text not null check (length(btrim(title)) > 0),
  description         text,
  -- Percentage, not a fraction. 70 means 70%.
  passing_score       numeric(5,2) not null default 70
                        check (passing_score > 0 and passing_score <= 100),
  -- Section 19.4: default 3, never more than 3.
  attempts_allowed    integer not null default 3
                        check (attempts_allowed between 1 and 3),
  time_limit_minutes  integer check (time_limit_minutes is null or time_limit_minutes > 0),
  shuffle_questions   boolean not null default false,
  -- When false, a student sees only whether they passed, not which questions
  -- they got wrong. Useful for a high-stakes final.
  reveal_answers      boolean not null default true,
  status              public.quiz_status not null default 'draft',
  created_by          uuid not null references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.quizzes.passing_score is
  'Percentage a student must reach. 70 means 70%.';
comment on column public.quizzes.reveal_answers is
  'When false, submit_quiz_attempt omits per-question correctness.';

create table public.quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  question_type public.question_type not null,
  prompt        text not null check (length(btrim(prompt)) > 0),
  points        numeric(6,2) not null default 1 check (points > 0),
  position      integer not null default 0,
  -- Shown after submitting. Withheld from students before then, because an
  -- explanation is the answer written out in words.
  explanation   text,
  -- Only meaningful for short_text.
  case_sensitive boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (quiz_id, position)
);

-- No accepted-answer column here on purpose: see the header note.
create table public.quiz_text_answers (
  id              uuid primary key default gen_random_uuid(),
  question_id     uuid not null references public.quiz_questions (id) on delete cascade,
  accepted_answer text not null check (length(btrim(accepted_answer)) > 0),
  position        integer not null default 0,
  unique (question_id, position)
);

create table public.quiz_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.quiz_questions (id) on delete cascade,
  option_text  text not null check (length(btrim(option_text)) > 0),
  -- The answer key. See the header note: this column is not readable by students.
  is_correct   boolean not null default false,
  position     integer not null default 0,
  unique (question_id, position)
);

-- An attempt belongs to an enrolment, not just a student, matching payments. It
-- means an attempt survives a course being re-enrolled, and it makes "who was
-- enrolled when they sat this" answerable after the fact.
create table public.quiz_attempts (
  id             uuid primary key default gen_random_uuid(),
  quiz_id        uuid not null references public.quizzes (id) on delete cascade,
  course_id      uuid not null references public.courses (id) on delete cascade,
  enrollment_id  uuid references public.enrollments (id) on delete set null,
  student_id     uuid not null references public.profiles (id),
  attempt_number integer not null check (attempt_number > 0),
  status         public.attempt_status not null default 'in_progress',
  score          numeric(8,2),
  max_score      numeric(8,2),
  percentage     numeric(5,2),
  passed         boolean,
  started_at     timestamptz not null default now(),
  submitted_at   timestamptz,
  unique (quiz_id, student_id, attempt_number)
);

create table public.quiz_answers (
  id                  uuid primary key default gen_random_uuid(),
  attempt_id          uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id         uuid not null references public.quiz_questions (id) on delete cascade,
  selected_option_id  uuid references public.quiz_options (id) on delete set null,
  text_answer         text,
  is_correct          boolean,
  points_awarded      numeric(6,2),
  -- One answer per question per attempt. Re-submitting is refused outright
  -- rather than overwritten, so a marked answer cannot be quietly replaced.
  unique (attempt_id, question_id)
);

create index quizzes_course_idx on public.quizzes (course_id);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);
create index quiz_options_question_idx on public.quiz_options (question_id, position);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, quiz_id);
create index quiz_answers_attempt_idx on public.quiz_answers (attempt_id);

-- Validation belongs at the moment a quiz becomes usable, not while it is being
-- typed. An earlier version of this file checked every option insert, which was
-- wrong in a way that only showed up for real authors: it refused the FIRST
-- option of a question whenever that option was not the correct one, so an
-- instructor who happened to type the wrong answer first could not build the
-- question at all.
--
-- Publishing is the right gate. A draft may be a work in progress; a published
-- quiz must be answerable, and that is exactly when to refuse.
create or replace function public.quiz_is_publishable(p_quiz_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  v_bad text;
begin
  select string_agg(bad, '; ') into v_bad
  from (
    select q.id::text || ' (' || left(q.prompt, 40) || '): ' || why as bad
    from public.quiz_questions q
    where q.quiz_id = p_quiz_id
      and (
        (q.question_type in ('multiple_choice', 'true_false') and (
            (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
            or (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) <> 1
          ))
        or
        (q.question_type = 'short_text' and
            not exists (select 1 from public.quiz_text_answers t where t.question_id = q.id))
      )
  ) problems;

  return v_bad is null;
end;
$$;

create or replace function public.quiz_publish_guard()
returns trigger
language plpgsql
as $$
declare
  v_bad text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    select string_agg(bad, '; ') into v_bad
    from (
      select q.id::text || ' "' || left(q.prompt, 40) || '" (' || q.question_type || '): ' || why as bad
      from public.quiz_questions q
      where q.quiz_id = new.id
        and (
          (q.question_type in ('multiple_choice', 'true_false') and (
              (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
              or (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) <> 1
            ))
          or
          (q.question_type = 'short_text' and
              not exists (select 1 from public.quiz_text_answers t where t.question_id = q.id))
        )
    ) problems;

    if v_bad is not null then
      raise exception 'cannot publish quiz: %', v_bad using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.quiz_questions where quiz_id = new.id) then
      raise exception 'cannot publish quiz: it has no questions' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger quiz_publish_guard
  before insert or update of status on public.quizzes
  for each row execute function public.quiz_publish_guard();

-- ---------------------------------------------------------------------------
-- Grading
-- ---------------------------------------------------------------------------

-- Starts an attempt, or refuses.
--
-- Section 19.4 caps attempts at 3 per quiz. The cap lives in two places on
-- purpose: the CHECK on quizzes.attempts_allowed stops an instructor raising it,
-- and this function refuses the fourth attempt even when three were allowed.
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz       public.quizzes%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_used       integer;
  v_number     integer;
  v_attempt    uuid;
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
  select * into v_enrollment
    from public.enrollments
    where course_id = v_quiz.course_id and student_id = auth.uid()
    order by enrolled_at desc
    limit 1;

  if not found or v_enrollment.status = 'dropped' then
    raise exception 'not enrolled in this course' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_used
    from public.quiz_attempts where quiz_id = p_quiz_id and student_id = auth.uid();

  if v_used >= least(v_quiz.attempts_allowed, 3) then
    raise exception 'no attempts remaining: % of % used', v_used, v_quiz.attempts_allowed
      using errcode = 'check_violation';
  end if;

  v_number := v_used + 1;

  insert into public.quiz_attempts (quiz_id, course_id, enrollment_id, student_id, attempt_number)
  values (p_quiz_id, v_quiz.course_id, v_enrollment.id, auth.uid(), v_number)
  returning id into v_attempt;

  return v_attempt;
end;
$$;

-- Grades a submitted attempt and writes the per-question record.
--
-- p_answers is a jsonb array of {question_id, option_id?, text?}.
--
-- The score is computed here, in the database, from the answer key. The client
-- sends answers and nothing else: it cannot claim a score, cannot mark itself
-- correct, and cannot submit the same attempt twice to have a bad result
-- replaced by a good one.
create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt   public.quiz_attempts%rowtype;
  v_quiz      public.quizzes%rowtype;
  v_answered  jsonb;
  v_score     numeric(8,2) := 0;
  v_max       numeric(8,2);
  v_pct       numeric(5,2);
  v_passed    boolean;
  v_remaining integer;
  v_rows      integer;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = 'insufficient_privilege';
  end if;

  -- Refuse a resubmission instead of overwriting. A marked attempt is a record.
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt already submitted at %', v_attempt.submitted_at
      using errcode = 'check_violation';
  end if;

  select * into v_quiz from public.quizzes where id = v_attempt.quiz_id;

  -- Grade every question in the quiz, not only the ones answered. Skipping the
  -- rest would silently inflate the percentage, because the denominator would
  -- be the questions the student chose to answer.
  for v_answered in
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
      select a into v_submitted
      from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) a
      where (a->>'question_id')::uuid = v_answered.question_id
      limit 1;

      if v_answered.question_type = 'short_text' then
        v_text := nullif(btrim(v_submitted->>'text'), '');
        if v_text is not null then
          if v_answered.case_sensitive then
            select true into v_correct
            from public.quiz_text_answers t
            where t.question_id = v_answered.question_id and t.accepted_answer = v_text;
          else
            select true into v_correct
            from public.quiz_text_answers t
            where t.question_id = v_answered.question_id
              and lower(btrim(t.accepted_answer)) = lower(v_text);
          end if;
        end if;
      else
        v_option := nullif(v_submitted->>'option_id', '')::uuid;
        if v_option is not null then
          -- The option must belong to the question being answered, otherwise a
          -- student could submit one correct option id for every question.
          select true into v_correct
          from public.quiz_options o
          where o.id = v_option
            and o.question_id = v_answered.question_id
            and o.is_correct;
        end if;
      end if;

      if coalesce(v_correct, false) then
        v_awarded := v_answered.points;
        v_score := v_score + v_answered.points;
      end if;

      insert into public.quiz_answers
        (attempt_id, question_id, selected_option_id, text_answer, is_correct, points_awarded)
      values
        (p_attempt_id, v_answered.question_id, v_option, v_text, coalesce(v_correct, false), v_awarded)
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

  -- What the student is allowed to be told. When reveal_answers is false this
  -- is just the outcome, which is the point of the flag.
  v_remaining := greatest(
    least(v_quiz.attempts_allowed, 3) - (v_attempt.attempt_number),
    0
  );

  return jsonb_build_object(
    'attempt_id',       p_attempt_id,
    'score',            v_score,
    'max_score',        v_max,
    'percentage',       v_pct,
    'passed',           v_passed,
    'passing_score',    v_quiz.passing_score,
    'attempts_remaining', v_remaining,
    'reveal_answers',   v_quiz.reveal_answers,
    'answers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', a.question_id,
        'is_correct',  a.is_correct,
        'points',      q.points,
        'points_awarded', a.points_awarded
      ) order by q.position), '[]'::jsonb)
      from public.quiz_answers a
      join public.quiz_questions q on q.id = a.question_id
      where a.attempt_id = p_attempt_id
    )
  );
end;
$$;

-- The full quiz including the answer key, for whoever is teaching it.
create or replace function public.quiz_with_answers(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quiz public.quizzes%rowtype;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'quiz not found' using errcode = 'no_data_found';
  end if;

  if not (public.is_instructor_of(v_quiz.course_id) or public.is_admin()) then
    raise exception 'not your course' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'quiz', to_jsonb(v_quiz),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q.id,
        'question_type', q.question_type,
        'prompt', q.prompt,
        'points', q.points,
        'position', q.position,
        'explanation', q.explanation,
        'case_sensitive', q.case_sensitive,
        'options', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'option_text', o.option_text,
            'is_correct', o.is_correct, 'position', o.position
          ) order by o.position), '[]'::jsonb)
          from public.quiz_options o where o.question_id = q.id
        ),
        'accepted_answers', (
          select coalesce(jsonb_agg(t.accepted_answer order by t.position), '[]'::jsonb)
          from public.quiz_text_answers t where t.question_id = q.id
        )
      ) order by q.position), '[]'::jsonb)
      from public.quiz_questions q where q.quiz_id = p_quiz_id
    )
  );
end;
$$;

revoke all on function public.quiz_with_answers(uuid) from public;
revoke all on function public.submit_quiz_attempt(uuid, jsonb) from public;
grant execute on function public.submit_quiz_attempt(uuid, jsonb) to authenticated;
grant execute on function public.quiz_with_answers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Reads of the answer key are closed three ways at once, deliberately:
--   * no student policy on quiz_text_answers at all
--   * quiz_options.is_correct withheld by column-level GRANT (0007_grants below)
--   * quiz_questions.explanation withheld by the same GRANT
-- The grading function is SECURITY DEFINER, so it still reads them.

alter table public.quizzes                enable row level security;
alter table public.quiz_questions         enable row level security;
alter table public.quiz_options           enable row level security;
alter table public.quiz_text_answers      enable row level security;
alter table public.quiz_attempts          enable row level security;
alter table public.quiz_answers           enable row level security;

-- Quizzes ---------------------------------------------------------------
drop policy if exists "quizzes select" on public.quizzes;
create policy "quizzes select" on public.quizzes
  for select to authenticated
  using (
    status = 'published'
    or public.is_instructor_of(course_id)
    or public.is_admin()
    or public.is_enrolled_in(course_id)
  );

drop policy if exists "quizzes instructor write" on public.quizzes;
create policy "quizzes instructor write" on public.quizzes
  for all to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin())
  with check (public.is_instructor_of(course_id) or public.is_admin());

-- Questions -------------------------------------------------------------
drop policy if exists "quiz questions select" on public.quiz_questions;
create policy "quiz questions select" on public.quiz_questions
  for select to authenticated
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id
        and (q.status = 'published' or public.is_instructor_of(q.course_id) or public.is_admin())
    )
  );

drop policy if exists "quiz questions instructor write" on public.quiz_questions;
create policy "quiz questions instructor write" on public.quiz_questions
  for all to authenticated
  using (
    exists (select 1 from public.quizzes q
            where q.id = quiz_id and (public.is_instructor_of(q.course_id) or public.is_admin()))
  )
  with check (
    exists (select 1 from public.quizzes q
            where q.id = quiz_id and (public.is_instructor_of(q.course_id) or public.is_admin()))
  );

-- Options ---------------------------------------------------------------
drop policy if exists "quiz options select" on public.quiz_options;
create policy "quiz options select" on public.quiz_options
  for select to authenticated
  using (
    exists (
      select 1 from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id
        and (q.status = 'published' or public.is_instructor_of(q.course_id) or public.is_admin())
    )
  );

drop policy if exists "quiz options instructor write" on public.quiz_options;
create policy "quiz options instructor write" on public.quiz_options
  for all to authenticated
  using (
    exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
            where qq.id = question_id and (public.is_instructor_of(q.course_id) or public.is_admin()))
  )
  with check (
    exists (select 1 from public.quiz_questions qq join public.quizzes qz on qz.id = qq.quiz_id
            where qq.id = question_id and (public.is_instructor_of(qz.course_id) or public.is_admin()))
  );

-- Accepted short answers: instructor of the course, or nobody. A student has no
-- policy here, which is the whole point.
drop policy if exists "quiz text answers instructor read" on public.quiz_text_answers;
create policy "quiz text answers instructor read" on public.quiz_text_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id
        and (public.is_instructor_of(q.course_id) or public.is_admin())
    )
  );

drop policy if exists "quiz text answers instructor write" on public.quiz_text_answers;
create policy "quiz text answers instructor write" on public.quiz_text_answers
  for all to authenticated
  using (
    exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
            where qq.id = question_id and (public.is_instructor_of(q.course_id) or public.is_admin()))
  )
  with check (
    exists (select 1 from public.quiz_questions qq join public.quizzes q on q.id = qq.quiz_id
            where qq.id = question_id and (public.is_instructor_of(q.course_id) or public.is_admin()))
  );

-- Attempts --------------------------------------------------------------
drop policy if exists "quiz attempts select own" on public.quiz_attempts;
create policy "quiz attempts select own" on public.quiz_attempts
  for select to authenticated
  using (student_id = auth.uid() or public.is_instructor_of(course_id) or public.is_admin());

-- Students never insert or update an attempt directly. start_quiz_attempt and
-- submit_quiz_attempt own both, which is what keeps the attempt cap and the
-- score server-side. Without this, `update quiz_attempts set passed = true`
-- would be a one-line way to pass any quiz.
drop policy if exists "quiz attempts student write" on public.quiz_attempts;
drop policy if exists "quiz attempts insert" on public.quiz_attempts;
create policy "quiz attempts insert" on public.quiz_attempts
  for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "quiz attempts update" on public.quiz_attempts;
create policy "quiz attempts update" on public.quiz_attempts
  for update to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin())
  with check (public.is_instructor_of(course_id) or public.is_admin());

drop policy if exists "quiz attempts delete" on public.quiz_attempts;
create policy "quiz attempts delete" on public.quiz_attempts
  for delete to authenticated
  using (public.is_instructor_of(course_id) or public.is_admin());

-- Answers ---------------------------------------------------------------
-- A student may read back their own graded answers, which is what the results
-- screen renders. They may never write: submit_quiz_attempt does that.
drop policy if exists "quiz answers select own" on public.quiz_answers;
create policy "quiz answers select own" on public.quiz_answers
  for select to authenticated
  using (
    exists (select 1 from public.quiz_attempts a
            where a.id = attempt_id and (a.student_id = auth.uid() or public.is_instructor_of(a.course_id) or public.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- Column-level SELECT for authenticated. `authenticated` is the only role that
-- gets these tables at all: quiz_options is not merely hidden from anon, it is
-- unreachable, and the answer key is unreachable even to a signed-in student.
revoke all on public.quizzes           from anon;
revoke all on public.quiz_questions    from anon;
revoke all on public.quiz_options      from anon;
revoke all on public.quiz_text_answers from anon;
revoke all on public.quiz_attempts     from anon;
revoke all on public.quiz_answers      from anon;

-- Supabase's default ACL grants `authenticated` ALL privileges on every newly
-- created table. That arrives as a TABLE-level SELECT, and a table-level grant
-- unions with any column-level grant: it is not narrowed by them. So the
-- column-level grants further down do nothing at all until the table-level one is
-- taken away. Each revoke below is load bearing, not tidying.
revoke all on public.quizzes           from authenticated;
revoke all on public.quiz_questions    from authenticated;
revoke all on public.quiz_options      from authenticated;
revoke all on public.quiz_text_answers from authenticated;
revoke all on public.quiz_attempts     from authenticated;
revoke all on public.quiz_answers      from authenticated;

grant select on public.quizzes to authenticated;
grant insert, update, delete on public.quizzes to authenticated;

-- The question columns a student legitimately needs. `explanation` is left out
-- deliberately: it is the answer written out in words.
grant select (id, quiz_id, question_type, prompt, points, position, created_at, updated_at)
  on public.quiz_questions to authenticated;
grant insert, update, delete on public.quiz_questions to authenticated;

-- is_correct is the answer key. Reachable only through quiz_with_answers, which
-- checks the caller teaches the course.
grant select (id, question_id, option_text, position)
  on public.quiz_options to authenticated;
grant insert, update, delete on public.quiz_options to authenticated;

-- No column grant at all: a short-answer key is nothing but accepted answers, so
-- there is no subset safe to expose. Instructors read it via quiz_with_answers.
grant insert, update, delete on public.quiz_text_answers to authenticated;

grant select on public.quiz_attempts to authenticated;
grant insert on public.quiz_attempts to authenticated;

-- A student reads back their own graded answers; the results screen renders this.
grant select on public.quiz_answers to authenticated;
