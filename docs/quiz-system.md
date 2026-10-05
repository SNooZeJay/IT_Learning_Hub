# Quiz System

Course → Modules → Lessons → Materials → **Quiz**. A quiz belongs to a course and
optionally to a module or lesson; it is not a step in the curriculum outline, so
it is presented after the content rather than inside it.

Built against the old Laravel system (`C:\xampp\htdocs\lms-project`) as the
functional reference, and against `qyzen.space` for **workflow only** — its
pre-quiz preparation, its warning ladder, its emphasis on the teacher having a
live view. No part of its visual design was reproduced.

## What the old system had, and what it did not

Kept: the four-way pre-quiz branch (passed / resume / exhausted / ready), the
answer-key firewall, strict correct-marker parsing, "exactly one correct option"
enforced server-side, an option must belong to the question, grading from the
stored key, `unique (attempt_id, question_id)`.

Absent, and therefore built here: question and option shuffling, a time limit,
any anti-cheating at all, mid-attempt answer persistence, editing or deleting a
question after it exists, question reordering, per-question review for
instructors, and attempt expiry.

## The attempt

`quiz_attempts` carries the state that used to live nowhere:

| column | why it is in the database and not the browser |
|---|---|
| `question_order` | The shuffle is a property of the **attempt**, written once at start. A browser-computed order is recomputed on every render, so a refresh renumbers the quiz under a student who has answered half of it. |
| `option_order` | Same, for options. |
| `warning_count` | A column, not browser state, so a reload cannot reset it and the instructor can see what happened. |
| `expires_at` | Set from the server clock and checked in the grading path. A countdown is a hint; this is the limit. |
| `ended_via` | `student_submit`, `time_expired` or `warnings_exhausted`. "Finished" and "ran out" are different facts when somebody reads the record. |

Orders are stored as **ids**, never positions and never copies of the question.
Grading looks an option up by id and checks the key, so where anything is
displayed cannot change whether it is the right answer.

## Functions

| function | purpose |
|---|---|
| `start_quiz_attempt` | Checks enrolment and the attempt cap, freezes the order, starts the clock. |
| `get_attempt_questions` | The student's view of their own attempt. SECURITY DEFINER; never reads `is_correct`. |
| `get_attempt_answers` | Saved choices for an open attempt. |
| `save_attempt_answer` | Stores one choice while the attempt is open. Cannot write `is_correct`. |
| `record_quiz_warning` | Increments the count, stops at the limit, reports whether the attempt has ended. |
| `submit_quiz_attempt` | Grades. Grades **every** question, so the denominator cannot be inflated by answering selectively. |
| `quiz_briefing` | The pre-quiz screen. Carries `hasPassed` read from the graded verdict, never inferred from the attempt count. |
| `quiz_with_answers` | The only path permitted to return the key. Instructor or admin. |
| `quiz_publish_guard` | Refuses to publish a quiz whose key is unusable. |
| `reorder_quiz_questions` / `reorder_quiz_options` | Atomic reorder, gated on `can_edit_course_content`. |

## Security model

The answer key never crosses the student boundary, and this is enforced at three
independent layers so that one mistake is not sufficient:

1. **Column grants.** `authenticated` holds no SELECT on `quiz_options.is_correct`
   or `quiz_questions.explanation`, and none at all on `quiz_text_answers`.
   `select *` returns only the granted columns.
2. **Row policies.** Quizzes, questions and options require `is_enrolled_in`, or
   ownership of the course, or admin.
3. **Function return values.** `reveal_answers = false` makes
   `submit_quiz_attempt` omit `is_correct`, the option text, the prompt and the
   explanation. The template hiding them is not what withholds them.

Verified by execution, in both directions:

```
student reads quiz_options.is_correct              -> BLOCKED: permission denied
student reads quiz_questions.explanation           -> BLOCKED: permission denied
student reads quiz_text_answers.accepted_answer    -> BLOCKED: permission denied
student reads quiz_answers.is_correct              -> BLOCKED: permission denied
student calls quiz_with_answers                    -> BLOCKED: not your course
student marks their own attempt passed             -> BLOCKED: permission denied
student writes is_correct on an answer row         -> BLOCKED: permission denied
student forges an attempt row                      -> BLOCKED: permission denied
student sets passing_score = 1                     -> unchanged (70.00)
student edits a question prompt                    -> unchanged
non-enrolled reads quiz questions                  -> 0 rows
non-enrolled starts an attempt                     -> BLOCKED: not enrolled
instructor edits another instructor's quiz         -> unchanged
instructor reorders another instructor's quiz      -> BLOCKED: not your course
anon starts an attempt / reads the key             -> BLOCKED

OUTSIDER (not enrolled) -> questions: 0, options: 0
ENROLLED                -> questions: 4, options: 9
```

Grading integrity:

```
fabricated option id (never existed)          2.00 | 25.00 | false | student_submit
a real option belonging to ANOTHER question   2.00 | 25.00 | false | student_submit
no answers at all                             0.00 |  0.00 | false | student_submit
all four answered correctly                   8.00 | 100.00 | true  | student_submit
second submit of the same attempt             BLOCKED: attempt already submitted
submit after the clock ran out                graded, ended_via = time_expired
attempts 1..3                                 remaining 2, 1, 0
attempt 4                                     BLOCKED: no attempts remaining: 3 of 3 used
```

A stolen option scores zero and the genuine answer still scores. Unanswered
questions score zero against a denominator that still counts them. A late
submission is graded rather than refused — time up is not the student's mistake,
and throwing the attempt away would leave them with no result and no attempts.

## Interface

`src/components/quiz/`

- **`QuizBriefingPanel.vue`** — the four-way branch, plus the rules stated in
  advance: fullscreen, tab switching, the warning budget, the time limit, the
  shuffle, and what happens to the answers. It also says plainly that the checks
  are deterrence rather than security, because a student who believes they are
  foolproof will do something the browser cannot detect and then feel cheated.
- **`QuizQuestionRunner.vue`** — one question per screen, a progress strip of
  jump-to dots, flag for review, full-width choice rows.
- **`QuizWarningDialog.vue`** — a real `alertdialog` that must be acknowledged.
  Names what happened, says how many remain, and on the last one says what is
  about to happen instead of letting it happen.
- **`QuizResultPanel.vue`** — pass/fail as a word, the three ways an attempt can
  end, and a review showing the question, every option, the right answer, which
  was theirs, and the explanation. Rendered only when the server sent it.
- **`QuizManagerPanel.vue`**, **`QuizSettingsForm.vue`**, **`QuizQuestionForm.vue`**,
  **`QuizAttemptsPanel.vue`** — instructor authoring and results review.

`src/composables/useQuizFocusGuard.ts` decides *when* to ask the server about a
focus loss; `record_quiz_warning` decides what it costs.

Warnings end an attempt by **submitting** it with whatever was answered, not by
disconnecting. A student is never ejected mid-question without being told first.

## Deliberate limitations

- Browser-level anti-cheating is deterrence. A second monitor or another person in
  the room is invisible to any page, and the briefing says so rather than implying
  a guarantee the browser cannot make.
- Reordering is a *display* order. Grading is position-independent, so a quiz
  whose questions are reordered after marking keeps its recorded results.
- Editing a question after attempts exist does not recompute them. This is stated
  in the confirmation.

## Support integration point

The briefing carries a support affordance that reveals where to ask and states
that messaging is not connected yet. Messages and notifications were deliberately
not built. The instructor's results panel shows warnings and how each attempt
ended, so the information a support channel would need already exists.

## Verified by execution

Every edge case in the milestone brief was run against the live database or the
deployed site: create quiz, add questions, define correct answers, edit,
delete, reorder, publish, review results, pre-quiz warning, start, fullscreen,
answer, navigate, shuffle confirmed distinct across attempts and stable across
calls, three-warning ladder to its consequence, submit, result, retake, refresh
mid-quiz, double submit, empty answers, last-question submit, a tampered option
id, an expired attempt, the attempt cap, cross-student access, and route guards.

**Not verified: layout at 390px.** The browser tooling has no viewport resize.
Every component uses `sm:`/`lg:` breakpoints and stacks below them, but that is
reasoning, not evidence.