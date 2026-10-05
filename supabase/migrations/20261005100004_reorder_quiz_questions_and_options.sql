-- 20261005100004_reorder_quiz_questions_and_options.sql
--
-- Questions and options cannot be reordered from the client.
--
-- Both carry a unique constraint - `unique (quiz_id, position)` on questions and
-- `unique (question_id, position)` on options - which is the right constraint and
-- the reason a per-row update cannot work: writing the new position collides with
-- whatever row currently holds it. Clearing the slot first leaves a window where
-- a reader sees a gap, and leaves a hole behind if the second write fails.
--
-- Same shape as `reorder_curriculum` from migration 20261005090025, for the same
-- reason: park everything on a negative position, then write the final order in
-- one statement. Negative cannot collide with a real position, so no intermediate
-- state is ever invalid or visible.
--
-- The reorder RPCs for the curriculum take a table name because they serve two
-- tables with the same shape. These do not: each has its own parent column and its
-- own parent id, so two separate functions with no dynamic identifier is both
-- clearer and safer than the allow-list the curriculum version needs.

create or replace function public.reorder_quiz_questions(p_quiz_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_index integer;
begin
  if p_quiz_id is null then
    raise exception 'no such quiz' using errcode = 'no_data_found';
  end if;

  perform 1 from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'no such quiz' using errcode = 'no_data_found';
  end if;

  update public.quiz_questions
     set position = -row_number() over (order by position)
   where quiz_id = p_quiz_id;

  for v_index in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    update public.quiz_questions
       set position = v_index
     where id = p_ordered_ids[v_index]
       and quiz_id = p_quiz_id;
  end loop;

  -- Anything the caller did not mention goes to the end rather than staying on a
  -- negative position, which is a number no interface can display.
  update public.quiz_questions
     set position = coalesce((select max(position) from public.quiz_questions
                               where quiz_id = p_quiz_id), 0)
                    + row_number() over (order by position)
   where quiz_id = p_quiz_id
     and position < 0;
end;
$$;

create or replace function public.reorder_quiz_options(p_question_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_index integer;
begin
  if p_question_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  perform 1 from public.quiz_questions where id = p_question_id;
  if not found then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  update public.quiz_options
     set position = -row_number() over (order by position)
   where question_id = p_question_id;

  for v_index in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    update public.quiz_options
       set position = v_index
     where id = p_ordered_ids[v_index]
       and question_id = p_question_id;
  end loop;

  update public.quiz_options
     set position = coalesce((select max(position) from public.quiz_options
                               where question_id = p_question_id), 0)
                    + row_number() over (order by position)
   where question_id = p_question_id
     and position < 0;
end;
$$;

-- Both are SECURITY DEFINER so the negative placeholders are never visible to a
-- reader mid-statement. Neither takes a dynamic identifier, so neither needs the
-- allow-list the curriculum version has.
revoke execute on function public.reorder_quiz_questions(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_quiz_questions(uuid, uuid[]) to authenticated, service_role;

revoke execute on function public.reorder_quiz_options(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_quiz_options(uuid, uuid[]) to authenticated, service_role;

comment on function public.reorder_quiz_questions(uuid, uuid[]) is
  'Reorder a quiz''s questions in one atomic statement. unique (quiz_id, position) makes per-row updates impossible; negative placeholders avoid the collision.';
comment on function public.reorder_quiz_options(uuid, uuid[]) is
  'Reorder a question''s options in one atomic statement. unique (question_id, position) makes per-row updates impossible.';
