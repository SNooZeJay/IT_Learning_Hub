-- 20261006160000_replace_quiz_question_answers_atomically.sql
--
-- Filename note: this was authored against the version the task named,
-- 20261006150000, which another change had already taken by the time it was
-- written. Two files sharing a version is not a harmless collision - the
-- migration runner orders by version, so the second one is applied in
-- whichever order the filesystem happens to yield and `supabase db push`
-- reports a duplicate. One past the highest existing version is the fix.
--
-- Editing a question was delete-then-insert across three HTTP requests, with no
-- transaction around them.
--
--     update quiz_questions set prompt = ..., points = ...
--     delete from quiz_text_answers where question_id = ...
--     insert into quiz_text_answers ...
--
-- Each is its own PostgREST transaction, so a failure partway through is a
-- committed state, not a rolled-back one. The concrete damage: if the insert
-- was refused, the author's existing answer key had already been deleted and
-- was gone. They had saved a working quiz before and now had a question with no
-- options, and the only place that surfaced was a later publish attempt refused
-- with "no option is marked correct" - about a different question, at a
-- different moment, with no way to trace it back.
--
-- This does the same replacement in one statement, so either the whole new key
-- is in place or the old one is untouched. Same shape as the reorder RPCs from
-- migration 20261005100013: the uniqueness constraints and the cascading
-- delete mean the work has to happen server-side to be atomic at all.
--
-- Why the delete and insert cannot be made atomic from the client
-- -------------------------------------------------------------
-- `quiz_options` has `unique (question_id, position)` and
-- `quiz_text_answers` has `unique (question_id, position)`. Both children also
-- cascade from `quiz_questions`, and `quiz_answers.selected_option_id` is
-- `on delete set null`, so deleting an option that a past attempt referenced
-- rewrites that attempt's row. All of that is fine inside one transaction -
-- the constraint is checked per statement, and a rollback undoes the delete -
-- and none of it is fine across three.
--
-- SECURITY DEFINER, and the ownership check is inside the function
-- ------------------------------------------------------------------
-- `authenticated` holds INSERT/UPDATE/DELETE on both child tables, so the
-- policies on them are what stops one instructor rewriting another's answer
-- key. This function runs as the owner, which is deliberate: a SECURITY
-- INVOKER version would re-enter those policies per statement and the
-- intermediate state - key deleted, key not yet inserted - is exactly the state
-- those policies were not written to describe.
--
-- So the check that matters has to be here instead, and it is the same one
-- every other curriculum write uses: `can_edit_course_content` on the course
-- that owns the quiz. The function resolves question -> quiz -> course and
-- refuses anything else, which is what `reorder_quiz_options` in 20261005100013
-- does and why that migration existed.
--
-- search_path is pinned, as everywhere else in this schema.

create or replace function public.replace_quiz_question_answers(
  p_question_id  uuid,
  p_options      jsonb,
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

  -- Only one of the two children is meaningful for a given question, and the
  -- caller already knows which. Writing options onto a short_text question
  -- would pass every constraint in this schema and produce a question whose key
  -- the grader and the publish guard both read as absent, so the mismatch is
  -- refused here rather than accepted and diagnosed later.
  if v_question_type = 'short_text' then
    if jsonb_array_length(v_options) > 0 then
      raise exception 'a written-answer question takes accepted answers, not options'
        using errcode = 'check_violation';
    end if;
  else
    if jsonb_array_length(v_answers) > 0 then
      raise exception 'a % question takes options, not accepted answers', v_question_type
        using errcode = 'check_violation';
    end if;
  end if;

  -- Both deletes before both inserts.
  --
  -- Ordering matters for the intermediate state inside this transaction: the
  -- old key is gone before the new one lands, so if the inserts fail on a
  -- constraint the rollback restores the old rows rather than leaving a mix.
  delete from public.quiz_options      where question_id = p_question_id;
  delete from public.quiz_text_answers where question_id = p_question_id;

  v_index := 0;
  for v_row in select value from jsonb_array_elements(v_options) loop
    v_index := v_index + 1;

    -- Each element is read as either a bare string or an object with a named
    -- key, because both are natural to send and only one of them can be the
    -- only one this function understands. The first version accepted only
    -- objects, so an array of strings - which is what a caller writing
    -- `["Paris", "Rome"]` for the accepted answers obviously means - reached
    -- the column check as an empty string and failed with a constraint message
    -- naming `accepted_answer`, which describes the symptom rather than the
    -- mistake. Bare strings are accepted for text; an option still needs its
    -- correctness, so a bare string there is not accepted and is refused below
    -- with the same clear error.
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
      -- Read from the object form only, and read strictly. A bare string
      -- carries no correctness and a truthy string is exactly the trap
      -- `coerceMarker` exists to avoid on the client, so nothing here
      -- infers `true` from text.
      case
        when jsonb_typeof(v_row) = 'object'
          then coalesce((v_row ->> 'isCorrect')::boolean, false)
        else false
      end,
      v_index
    );
  end loop;

  v_index := 0;
  for v_row in select value from jsonb_array_elements(v_answers) loop
    v_index := v_index + 1;

    if jsonb_typeof(v_row) = 'string' then
      v_text := btrim(v_row #>> '{}');
    else
      v_text := btrim(coalesce(v_row ->> 'acceptedAnswer', ''));
    end if;

    if v_text = '' then
      raise exception 'accepted answer % has no text', v_index using errcode = 'check_violation';
    end if;

    insert into public.quiz_text_answers (question_id, accepted_answer, position)
    values (p_question_id, v_text, v_index);
  end loop;

  -- Blank entries are refused here rather than left to the column checks, which
  -- would fail with a message about `option_text`/`accepted_answer` and no
  -- indication that the payload was the problem. It raises before any insert for
  -- that entry, and the whole statement rolls back regardless.
end;
$$;

comment on function public.replace_quiz_question_answers(uuid, jsonb, jsonb) is
  'Replace a question''s options and text answers in one transaction, so a failed insert cannot leave the author''s existing key deleted. Requires can_edit_course_content on the owning course.';

-- Same grant shape as the reorder RPCs in 20261005100004, for the same reasons:
-- this writes the answer key, which no student may reach, so EXECUTE is refused
-- to anon and to the implicit PUBLIC grant and given only to a signed-in user
-- plus service_role. The function's own ownership check is what stops a student
-- who somehow obtained EXECUTE - a student passes `can_edit_course_content` for
-- no course.
revoke execute on function public.replace_quiz_question_answers(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_quiz_question_answers(uuid, jsonb, jsonb) to authenticated, service_role;
