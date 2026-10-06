-- A quiz description that says "four questions" over three questions.
--
-- What was wrong
-- --------------
-- Removing the written-answer question left "Module 1 check" with three questions, and
-- its description still read:
--
--     Four questions on variables and your first program. You get three attempts.
--
-- The second sentence is still true and was not touched. The first one is now false, and
-- it is the sort of false that is visible from the seat: the briefing screen states a
-- number and then lists a different one a few lines below it.
--
-- This is copy, and copy belongs to the instructor, so the change here is the smallest
-- one that makes the sentence true again - the count, not the wording. The author can
-- still rewrite it.
--
-- Only the count is corrected, and only where a count was stated. "Network Layers Check"
-- says "A short check on the OSI layers and addressing" and is not touched, because it
-- never made a claim about how many questions there are.

update public.quizzes
   set description = 'Three questions on variables and your first program. You get three attempts.'
 where description = 'Four questions on variables and your first program. You get three attempts.'
   and (
     select count(*) from public.quiz_questions q where q.quiz_id = public.quizzes.id
   ) = 3;

-- Proved: no description may claim a count the quiz does not have.
--
-- A weaker check - "did the row update" - would pass whether or not the number was right,
-- and the number is the entire point of the change. So this reads the number back out of
-- the description and compares it to what is actually there, and a description claiming
-- four questions over a three-question quiz fails here rather than in front of a student.
--
-- The number must match as a word or as digits, because both are natural to write.
--
-- Two things got this wrong before it worked, and both failed by matching nothing at all,
-- which is the quietest way a guard fails. Recorded so the third attempt is not taken on
-- trust.
--
--   `\b` is not a Postgres regular-expression escape. It is not in the POSIX dialect and
--   not in ARE; `\y` and `\m` are. `substring(x from '\b...\b')` therefore returns NULL
--   for every input rather than raising, so a guard built on it passed everything.
--
--   `[a-z]` does not match a capital letter, and a count at the start of a sentence is
--   capitalised. Matching against `description` rather than `lower(description)` misses
--   "Four questions" and finds only "9 questions".
--
-- So the match runs on `lower(...)`, uses `[[:space:]]` in place of `\s`, and takes its
-- answer from `regexp_match` group 2 - `substring(x from pattern)` returns the *first*
-- group, which here is the word-boundary alternative and not the number.
--
-- Verified after the rewrite, each in a transaction that rolled back:
--
--     "Three questions ..." over 3 questions   passes   (correct)
--     "Four questions ..."  over 3 questions   fires
--     "Seven questions ..." over 3 questions   fires
--     "9 questions ..."     over 3 questions   fires
--     no count claimed                         passes   (nothing to contradict)
do $$
declare
  v_bad text;
begin
  select string_agg(
           format('%s says "%s" but holds %s question(s)',
                  s.title, s.description, s.actual), '; ')
    into v_bad
    from (
      select z.title,
             z.description,
             (select count(*)::int from public.quiz_questions q
               where q.quiz_id = z.id) as actual,
             (regexp_match(lower(z.description),
                           '(^|[^a-z0-9])([a-z]+|[0-9]+)[[:space:]]+questions?'))[2] as token
        from public.quizzes z
    ) s
   where s.token is not null
     and s.token <> case s.actual
                        when 0 then 'zero'
                        when 1 then 'one'
                        when 2 then 'two'
                        when 3 then 'three'
                        when 4 then 'four'
                        when 5 then 'five'
                        when 6 then 'six'
                        when 7 then 'seven'
                        when 8 then 'eight'
                        when 9 then 'nine'
                        when 10 then 'ten'
                        else s.actual::text
                      end
     and s.token <> s.actual::text;

  if v_bad is not null then
    raise exception 'a quiz description contradicts its question count: %', v_bad;
  end if;
end;
$$;