-- ===========================================================================
-- One alt-tab ended the quiz, and the record said the student had simply
-- submitted it.
--
-- Found by sitting a real quiz: switching away from the tab submitted the
-- attempt at 0 percent with "your warnings ran out". No warning had ever been
-- recorded. The attempt row showed warning_count = 0 and ended_via =
-- 'student_submit', so an instructor reading it afterwards could not tell an
-- abandoned run from a deliberate one.
--
-- Why no warning was ever recorded. quiz_attempts_notify branches on the new
-- status, and its second branch tested:
--
--   elsif new.status = 'graded' and old.status is distinct from 'graded'
--
-- attempt_status has exactly two values: in_progress and submitted. 'graded'
-- is not one of them. It belongs to submission_status, which grades ASSIGNMENT
-- submissions, not quiz attempts. Comparing an enum column to a literal outside
-- that enum makes Postgres cast the literal to the enum, which fails:
--
--   ERROR 22P02: invalid input value for enum attempt_status: "graded"
--
-- So the comparison raised rather than evaluating to false or true. And because
-- it sits in the elsif, it is reached by every update whose status is not
-- 'submitted' - which is precisely the update record_quiz_warning makes:
--
--   update quiz_attempts set warning_count = ..., ended_via = ...
--
-- Status stays in_progress there, the first branch is false, the elsif raises,
-- and the whole warning call fails. Measured, three calls in a row:
--
--   1: RAISED 22P02 invalid input value for enum attempt_status: "graded"
--   2: RAISED 22P02 ...
--   3: RAISED 22P02 ...
--   warning_count before 0, after 0
--
-- Why the student saw "your warnings ran out" on the first alt-tab. The client
-- calls recordWarning and, on any failure, assumes the attempt is already closed
-- and submits it. That is a defensible assumption for a genuinely closed attempt
-- but it cannot tell this failure apart, so a server-side enum bug was reported
-- to the student as three warnings they never earned. The same raise also blocked
-- any other update that leaves an attempt in_progress.
--
-- The fix is to drop the branch. There is no graded state for a quiz attempt to
-- move into - AttemptStatus is 'in_progress' | 'submitted' in the database enum
-- and in src/types/enums.ts - so the branch could only ever have raised.
--
-- Nothing is lost: no row has ever reached a 'graded' status, because Postgres
-- would have rejected the value before it could be stored.
--
-- After the fix, the same three calls give:
--
--   1: warningCount 1, remaining 2, ended false
--   2: warningCount 2, remaining 1, ended false
--   3: warningCount 3, remaining 0, ended true    -> row: warning_count=3,
--                                                     ended_via=warnings_exhausted
-- ===========================================================================

create or replace function public.quiz_attempts_notify()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_title text;
  v_type  notification_type;
  v_name  text;
begin
  -- in_progress -> submitted is the only transition a quiz attempt has. Kept as
  -- the only branch on purpose: the previous 'graded' branch named a value that
  -- belongs to submission_status, and merely having it here made every
  -- non-submitting update to this table raise.
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    v_title := 'Quiz submitted';
    v_type  := 'quiz_graded';
    v_name  := 'A quiz was submitted';
  else
    return new;
  end if;

  perform public.notify(
    new.student_id,
    v_type,
    v_title,
    v_name,
    '/student/grades'
  );
  return new;
end;
$fn$;
