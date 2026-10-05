-- 20261005100014_briefing_must_say_whether_they_passed.sql
--
-- After a reload mid-quiz the pre-quiz screen showed no Start button and no
-- Resume button. The student was stuck on a quiz they had already started.
--
-- Cause
-- -----
-- `quiz_briefing` returned `attemptsUsed` and nothing else about progress, and the
-- view inferred the wrong thing from it:
--
--     alreadyPassed = attemptsUsed > 0
--
-- which is "has started an attempt", not "has passed one". Start an attempt,
-- reload, and the screen believes the quiz is already behind them: the four-way
-- branch resolves to `passed`, which renders a message and no action at all.
--
-- The old Laravel system checked `passed` outright:
--
--     if ($quiz->attempts()->where('student_id', $actor->id)->where('passed', true)->exists()) {
--         throw ValidationException::withMessages(['quiz' => 'You already passed this quiz.']);
--     }
--
-- That is the check, and it needs the real column rather than a proxy. A student
-- who has failed twice has used two attempts and has not passed anything.
--
-- What is added
-- -------------
-- `hasPassed`, read from the same rows the old check read. `bestPercentage` comes
-- with it because a student who has failed twice wants to know whether they are
-- getting closer, and the old screen showed an attempt history for the same
-- reason.
--
-- Deliberately not inferred from anything else. `attempt_number > 1` is not the
-- same thing, and neither is a percentage, because the pass mark is per quiz.

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
    -- Whether a *graded* attempt passed. Not "has an attempt": starting one and
    -- reloading is the case this replaces, and it must not read as a pass.
    'hasPassed', coalesce((select true from public.quiz_attempts a
                            where a.quiz_id = q.id and a.student_id = auth.uid()
                              and a.passed is true
                            limit 1), false),
    -- Best result so far, or null if nothing has been graded. Shown to a student
    -- who has failed an attempt and needs to know whether to try again.
    'bestPercentage', (select max(a.percentage) from public.quiz_attempts a
                        where a.quiz_id = q.id and a.student_id = auth.uid()
                          and a.percentage is not null),
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

comment on function public.quiz_briefing(uuid) is
  'Everything the pre-quiz screen needs, and nothing more. hasPassed reads the graded verdict rather than inferring it from the attempt count.';