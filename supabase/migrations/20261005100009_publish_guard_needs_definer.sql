-- 20261005100009_publish_guard_needs_definer.sql
--
-- Publishing a quiz has never worked. Any instructor who tried got a raw
-- privilege error and a quiz stuck in draft.
--
-- The cause
-- ---------
-- `quiz_publish_guard` is a BEFORE UPDATE trigger on `quizzes`, and it was
-- declared SECURITY INVOKER - which means it runs as whoever issued the UPDATE.
-- That is the `authenticated` role, and `authenticated` has no SELECT grant on
-- `quiz_options.is_correct`; it holds column-level SELECT on id, question_id,
-- option_text and position, and nothing else. The guard's whole job is to count
-- the options marked correct:
--
--     select count(*) from public.quiz_options o
--      where o.question_id = q.id and o.is_correct
--
-- so every publish attempt died before it could evaluate the rule:
--
--     ERROR: 42501: permission denied for table quiz_options
--
-- The same was true of `quiz_is_publishable`, which the interface would call to
-- ask whether a quiz is ready to publish.
--
-- The answer-key lockdown was not at fault. Withholding `is_correct` from
-- students is right and stays; the guard simply needs to be able to read it in
-- order to do its job.
--
-- The fix, and why it is safe
-- ---------------------------
-- SECURITY DEFINER on a trigger changes what the function can *read*, not who can
-- cause it to run. The trigger fires as part of an UPDATE on `quizzes`, and that
-- UPDATE is already gated: `quizzes instructor write` requires
-- `is_instructor_of(course_id) or is_admin()`. A student cannot reach this code
-- by any route, because they cannot update the row in the first place.
--
-- search_path is pinned, as everywhere else in this schema, so the function
-- resolves `public.*` rather than whatever a caller has shadowed.
--
-- This is the same class of bug as the curriculum write policies from migration
-- 20261005090023: a component that needs to read something it was not granted, in
-- a path no automated check executes. Both were found by clicking the button.

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
            when q.question_type = 'short_text'
              then 'no accepted answer'
            when (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
              then 'needs at least two options'
            when (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) = 0
              then 'no option is marked correct'
            else 'more than one option is marked correct'
          end as bad
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
      raise exception 'this quiz cannot be published yet: %', v_bad
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.quiz_publish_guard() is
  'Refuses to publish a quiz whose answer key is unusable. SECURITY DEFINER because it must read quiz_options.is_correct, which authenticated cannot; the UPDATE that triggers it is already gated by the quizzes write policy.';


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
          when q.question_type = 'short_text' then 'no accepted answer'
          when (select count(*) from public.quiz_options o where o.question_id = q.id) < 2
            then 'needs at least two options'
          when (select count(*) from public.quiz_options o where o.question_id = q.id and o.is_correct) = 0
            then 'no option is marked correct'
          else 'more than one option is marked correct'
        end as bad
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

-- Callable by the two roles that can legitimately ask. anon and public are
-- revoked: it answers questions about draft quizzes.
revoke execute on function public.quiz_is_publishable(uuid) from public, anon;
grant execute on function public.quiz_is_publishable(uuid) to authenticated, service_role;
