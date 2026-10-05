-- 20261005100013_reorder_functions_cannot_use_window_functions.sql
--
-- All three reorder functions were broken, and one of them was unguarded.
--
-- 1. Window functions are not allowed in UPDATE ... SET
-- ---------------------------------------------------
-- Every one of them did this:
--
--     update public.quiz_questions
--        set position = -row_number() over (order by position)
--      where quiz_id = p_quiz_id;
--
-- Postgres rejects it outright:
--
--     ERROR: 42P20: window functions are not allowed in UPDATE
--
-- Not a permission problem, not a policy problem - the statement cannot be parsed
-- as an update at all. So reordering has never worked. The score is computed from
-- `position`, so quizzes graded fine; nothing about taking one depends on the
-- order being right.
--
-- The working form computes the row numbers in a CTE and joins them in:
--
--     with ordered as (
--       select id, row_number() over (order by position) as rn
--         from public.quiz_questions where quiz_id = p_quiz_id
--     )
--     update public.quiz_questions q set position = -o.rn from ordered o where q.id = o.id;
--
-- Same semantics, and still one statement, so the negative placeholders are never
-- visible to a reader.
--
-- 2. `reorder_curriculum` looked the parent up in the wrong table
-- -------------------------------------------------------
-- Given p_table = 'modules' it ran `select id from public.modules where id =
-- p_parent_id`, but p_parent_id is a *course* id. So it never found a parent and
-- raised "no such modules" for a course that has modules:
--
--     ERROR: P0002: no such modules
--     CONTEXT: PL/pgSQL function reorder_curriculum(...)
--
-- The parent lives in courses for modules and in modules for lessons. The
-- pairing of table to parent is now checked explicitly rather than inferred, so
-- the mismatched combinations are refused instead of silently misread.
--
-- 3. None of the three checked who was asking
-- -------------------------------------------
-- All three are SECURITY DEFINER, and none verified that the caller may edit the
-- content being reordered. A student cannot call them - EXECUTE is granted to
-- `authenticated`, which includes students - so the question is only whether an
-- instructor can reorder a course that is not theirs. They could:
--
--     reorder_quiz_questions(another instructor's quiz, ...)
--
-- Now each one resolves the course and requires `can_edit_course_content`, which
-- is admin or the assigned instructor. That is the same gate every other
-- curriculum write uses, so there is one rule rather than three.
--
-- Found by calling each function as an instructor against their own content and
-- against somebody else's. `reorder_quiz_questions` is reachable from the
-- interface - QuizManagerPanel's Move up / Move down - so this was a broken
-- button. `reorder_curriculum` was not: `curriculum.service.reorder` exists and
-- nothing calls it, which is the only reason it went unnoticed since the
-- previous milestone.

-- ---------------------------------------------------------------------------
-- reorder_curriculum
-- ---------------------------------------------------------------------------

create or replace function public.reorder_curriculum(
  p_table         text,
  p_parent_column text,
  p_parent_id     uuid,
  p_ordered_ids   uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_course_id uuid;
  v_index     integer;
begin
  -- The table and its parent column are a matched pair, not two independent
  -- choices. A dynamic identifier cannot be a parameter, so the allow-list is the
  -- whole of the safety story here - and it is now checked as a pairing, which
  -- also stops `('modules', 'module_id')` being read as nonsense.
  if not (
       (p_table = 'modules' and p_parent_column = 'course_id')
    or (p_table = 'lessons' and p_parent_column = 'module_id')
  ) then
    raise exception 'cannot reorder % by %', p_table, p_parent_column
      using errcode = 'invalid_parameter_value';
  end if;

  if p_parent_id is null then
    raise exception 'no parent given' using errcode = 'no_data_found';
  end if;

  -- Resolve the course that owns the parent. For modules the parent *is* the
  -- course, so the id given is the course id. For lessons the parent is a module,
  -- so the course has to be found through it. Either way what permission is
  -- decided on is a course id, which is the only thing can_edit_course_content
  -- accepts.
  if p_table = 'modules' then
    perform 1 from public.courses where id = p_parent_id;
    if not found then
      raise exception 'no such course' using errcode = 'no_data_found';
    end if;
    v_course_id := p_parent_id;
  else
    select c.id into v_course_id
      from public.modules m
      join public.courses c on c.id = m.course_id
     where m.id = p_parent_id;

    if v_course_id is null then
      raise exception 'no such module' using errcode = 'no_data_found';
    end if;
  end if;

  if not public.can_edit_course_content(v_course_id) then
    raise exception 'not your course' using errcode = 'insufficient_privilege';
  end if;

  -- Park everything on negative positions. Negative cannot collide with a real
  -- position, and every row is updated exactly once, so the unique constraint is
  -- never at risk even mid-statement.
  if p_table = 'modules' then
    with ordered as (
      select id, row_number() over (order by position) as rn
        from public.modules where course_id = v_course_id
    )
    update public.modules m set position = -o.rn from ordered o where m.id = o.id;
  else
    with ordered as (
      select id, row_number() over (order by position) as rn
        from public.lessons where module_id = p_parent_id
    )
    update public.lessons l set position = -o.rn from ordered o where l.id = o.id;
  end if;

  -- Then the caller's order.
  for v_index in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    if p_table = 'modules' then
      update public.modules set position = v_index
       where id = p_ordered_ids[v_index] and course_id = v_course_id;
    else
      update public.lessons set position = v_index
       where id = p_ordered_ids[v_index] and module_id = p_parent_id;
    end if;
  end loop;

  -- Anything not mentioned goes to the end, rather than staying negative, which
  -- is a number no interface can display.
  if p_table = 'modules' then
    with leftover as (
      select id, row_number() over (order by position) as rn
        from public.modules
       where course_id = v_course_id and position < 0
    )
    update public.modules m
       set position = coalesce((select max(position) from public.modules
                                 where course_id = v_course_id), 0) + o.rn
      from leftover o
     where m.id = o.id;
  else
    with leftover as (
      select id, row_number() over (order by position) as rn
        from public.lessons
       where module_id = p_parent_id and position < 0
    )
    update public.lessons l
       set position = coalesce((select max(position) from public.lessons
                                 where module_id = p_parent_id), 0) + o.rn
      from leftover o
     where l.id = o.id;
  end if;
end;
$$;

comment on function public.reorder_curriculum(text, text, uuid, uuid[]) is
  'Reorder a course''s modules, or a module''s lessons, in one atomic statement. Row numbers come from a CTE because a window function is not allowed in UPDATE ... SET. Requires can_edit_course_content on the owning course.';


-- ---------------------------------------------------------------------------
-- reorder_quiz_questions
-- ---------------------------------------------------------------------------

create or replace function public.reorder_quiz_questions(p_quiz_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_course_id uuid;
  v_index     integer;
begin
  if p_quiz_id is null then
    raise exception 'no such quiz' using errcode = 'no_data_found';
  end if;

  select course_id into v_course_id from public.quizzes where id = p_quiz_id;
  if v_course_id is null then
    raise exception 'no such quiz' using errcode = 'no_data_found';
  end if;

  -- SECURITY DEFINER, so this is the only thing standing between one instructor
  -- and another's question order. It was missing.
  if not public.can_edit_course_content(v_course_id) then
    raise exception 'not your course' using errcode = 'insufficient_privilege';
  end if;

  with ordered as (
    select id, row_number() over (order by position) as rn
      from public.quiz_questions where quiz_id = p_quiz_id
  )
  update public.quiz_questions q set position = -o.rn from ordered o where q.id = o.id;

  for v_index in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    update public.quiz_questions set position = v_index
     where id = p_ordered_ids[v_index] and quiz_id = p_quiz_id;
  end loop;

  with leftover as (
    select id, row_number() over (order by position) as rn
      from public.quiz_questions where quiz_id = p_quiz_id and position < 0
  )
  update public.quiz_questions q
     set position = coalesce((select max(position) from public.quiz_questions
                               where quiz_id = p_quiz_id), 0) + o.rn
    from leftover o
   where q.id = o.id;
end;
$$;

comment on function public.reorder_quiz_questions(uuid, uuid[]) is
  'Reorder a quiz''s questions in one atomic statement. Requires can_edit_course_content on the quiz''s course.';


-- ---------------------------------------------------------------------------
-- reorder_quiz_options
-- ---------------------------------------------------------------------------

create or replace function public.reorder_quiz_options(p_question_id uuid, p_ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_course_id uuid;
  v_index     integer;
begin
  if p_question_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  -- Through the question to its quiz to its course.
  select z.course_id into v_course_id
    from public.quiz_questions k
    join public.quizzes z on z.id = k.quiz_id
   where k.id = p_question_id;

  if v_course_id is null then
    raise exception 'no such question' using errcode = 'no_data_found';
  end if;

  if not public.can_edit_course_content(v_course_id) then
    raise exception 'not your course' using errcode = 'insufficient_privilege';
  end if;

  with ordered as (
    select id, row_number() over (order by position) as rn
      from public.quiz_options where question_id = p_question_id
  )
  update public.quiz_options o set position = -o2.rn from ordered o2 where o.id = o2.id;

  for v_index in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    update public.quiz_options set position = v_index
     where id = p_ordered_ids[v_index] and question_id = p_question_id;
  end loop;

  with leftover as (
    select id, row_number() over (order by position) as rn
      from public.quiz_options where question_id = p_question_id and position < 0
  )
  update public.quiz_options o
     set position = coalesce((select max(position) from public.quiz_options
                               where question_id = p_question_id), 0) + o2.rn
    from leftover o2
   where o.id = o2.id;
end;
$$;

comment on function public.reorder_quiz_options(uuid, uuid[]) is
  'Reorder a question''s options in one atomic statement. Requires can_edit_course_content on the owning course.';