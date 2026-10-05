-- 20261005090009_fix_quiz_publish_guard.sql
--
-- Fixes a defect in 20261005090007 that no gate in this repo could have caught.
--
-- `quiz_publish_guard` built its error message with `... || why as bad`, where
-- `why` is not a column. The reference does not resolve, so the function raised
-- `column "why" does not exist` instead of its intended message. The effect was
-- that publishing a quiz was impossible for everyone: the trigger fired, the
-- query failed, and the UPDATE aborted. `quiz_is_publishable` had the same
-- mistake.
--
-- Found by running it, not by reading it. Type-check, lint, build and the test
-- suite were all clean at the time, because none of them execute plpgsql.
--
-- The reason is now derived inline with a CASE rather than referenced as if it
-- were a column.

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
      raise exception 'cannot publish quiz: %', v_bad using errcode = 'check_violation';
    end if;

    if not exists (select 1 from public.quiz_questions where quiz_id = new.id) then
      raise exception 'cannot publish quiz: it has no questions' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.quiz_is_publishable(p_quiz_id uuid)
returns boolean
language plpgsql
stable
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
