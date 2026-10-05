-- 20261005100002_persist_answers_while_the_quiz_is_open.sql
--
-- Refreshing mid-quiz used to throw away everything the student had chosen.
--
-- The old Laravel system never persisted answers until submit, so a refresh meant
-- re-answering from nothing. Its own comment acknowledged the gap and no test
-- covered it. That is the single worst thing that can happen during an
-- assessment, and the brief for this milestone calls it out by name.
--
-- Answers are written to the existing `quiz_answers` table as the student makes
-- them, which is why no new table is needed.
--
-- The columns that decide a grade - `is_correct` and `points_awarded` - are not
-- written here and cannot be written by any client. A `SECURITY DEFINER`
-- function that inserts into `quiz_answers` on the caller's behalf bypasses the
-- table's policies entirely, which is precisely why this is a function and not a
-- direct insert from the browser: the browser cannot reach the columns it must
-- not touch. The student's own session still proves ownership of the attempt.
--
-- Grading is unchanged. `submit_quiz_attempt` writes its own rows with
-- `on conflict (attempt_id, question_id) do nothing`, so these draft rows are
-- overwritten in place rather than duplicated, and the final score is computed
-- once, from the key, at submit time.

create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_option_id uuid default null,
  p_text       text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attempt   public.quiz_attempts%rowtype;
  v_question  public.quiz_questions%rowtype;
  v_valid     boolean := false;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt not found' using errcode = 'no_data_found';
  end if;

  if v_attempt.student_id <> auth.uid() then
    raise exception 'not your attempt' using errcode = 'insufficient_privilege';
  end if;

  -- A submitted attempt is a record. Writing to it afterwards is not a draft
  -- update, it is tampering, so it is refused rather than merged.
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt already submitted' using errcode = 'check_violation';
  end if;

  -- The question must belong to this attempt's quiz. Without this check a
  -- student could store rows against any question in the database.
  select * into v_question
    from public.quiz_questions q
    where q.id = p_question_id and q.quiz_id = v_attempt.quiz_id;

  if not found then
    raise exception 'that question is not on this quiz' using errcode = 'no_data_found';
  end if;

  -- An option must belong to the question being answered. The old system's
  -- grader had this check and a comment explaining that one correct option id
  -- submitted for every question would otherwise score full marks; the same
  -- reasoning applies to what is stored.
  if p_option_id is not null then
    select true into v_valid
    from public.quiz_options o
    where o.id = p_option_id and o.question_id = p_question_id;

    if not coalesce(v_valid, false) then
      raise exception 'that option is not on this question' using errcode = 'check_violation';
    end if;
  end if;

  -- is_correct and points_awarded are deliberately absent from this insert. They
  -- are set by submit_quiz_attempt from the stored key, and are never derived
  -- from anything the client sends.
  insert into public.quiz_answers
    (attempt_id, question_id, selected_option_id, text_answer)
  values
    (p_attempt_id, p_question_id, p_option_id, nullif(btrim(p_text), ''))
  on conflict (attempt_id, question_id) do update
    set selected_option_id = excluded.selected_option_id,
        text_answer = excluded.text_answer;
end;
$$;

revoke execute on function public.save_attempt_answer(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.save_attempt_answer(uuid, uuid, uuid, text) to authenticated, service_role;

comment on function public.save_attempt_answer(uuid, uuid, uuid, text) is
  'Stores one answer choice while the attempt is open, so a refresh does not lose work. Never writes is_correct or points_awarded.';


-- A student resuming after a refresh needs their saved choices back. Reading
-- them directly is refused - `quiz_answers.is_correct` has no grant for
-- `authenticated` - so this returns only the selection.
create or replace function public.get_attempt_answers(p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_object_agg(
    a.question_id::text,
    jsonb_build_object(
      'optionId', a.selected_option_id,
      'text', a.text_answer
    )
  ), '{}'::jsonb)
  from public.quiz_answers a
  join public.quiz_attempts t on t.id = a.attempt_id
  where a.attempt_id = p_attempt_id
    and t.student_id = auth.uid()
    -- Only while it is still the student's own work in progress. After submit,
    -- the result screen reads from the grading function instead.
    and t.status = 'in_progress';
$$;

revoke execute on function public.get_attempt_answers(uuid) from public, anon;
grant execute on function public.get_attempt_answers(uuid) to authenticated, service_role;
