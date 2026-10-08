-- CompTIA Security+ had six lessons and no quiz.
--
-- It is the flagship intermediate course on the catalogue and nothing could be assessed
-- against it: no quiz meant no attempt, no score, no contribution to a completion rule,
-- and the student quizzes screen showed it as a course with nothing to do. The other two
-- assessable courses each carry a quiz, so this one was the odd one out rather than a
-- deliberate choice.
--
-- Three questions, both reliable types only: two multiple choice and one true/false. Every
-- question carries an explanation, which is what the student sees after submitting and the
-- thing that makes a wrong answer useful.
--
-- `created_by` is read from `course_instructors` rather than hardcoded, so the quiz belongs
-- to the person who actually teaches the course. `publish_guard` requires a choice
-- question to have an option marked correct, and all three do.
do $$
declare
  v_quiz  uuid;
  v_q1    uuid;
  v_q2    uuid;
  v_q3    uuid;
  v_teacher uuid;
  v_module uuid;
begin
  select p.id into v_teacher
    from public.course_instructors ci
    join public.profiles p on p.id = ci.instructor_id
   where ci.course_id = 'd4852593-3a93-4942-b639-daa535da1fa6'
   limit 1;

  select id into v_module
    from public.modules
   where course_id = 'd4852593-3a93-4942-b639-daa535da1fa6'
   order by position
   limit 1;

  insert into public.quizzes
    (course_id, module_id, title, description, passing_score, attempts_allowed,
     time_limit_minutes, status, created_by, instructions)
  values
    ('d4852593-3a93-4942-b639-daa535da1fa6', v_module,
     'Security fundamentals check',
     'Covers general security concepts: threats, risk and the three types of control.',
     70, 3, 20, 'published', v_teacher,
     'Three questions. You need 70% to pass, and you have three attempts.')
  returning id into v_quiz;

  insert into public.quiz_questions (quiz_id, question_type, prompt, points, position, explanation)
  values (v_quiz, 'multiple_choice',
          'Which control type prevents an incident from happening in the first place?', 2, 1,
          'A preventive control stops the event. A detective control finds it afterwards, and a corrective control repairs the damage.')
  returning id into v_q1;

  insert into public.quiz_questions (quiz_id, question_type, prompt, points, position, explanation)
  values (v_quiz, 'multiple_choice',
          'A firewall that logs traffic it blocks but does not stop is which type of control?', 2, 2,
          'Logging without blocking is detection, not prevention. The firewall is watching, not enforcing.')
  returning id into v_q2;

  insert into public.quiz_questions (quiz_id, question_type, prompt, points, position, explanation)
  values (v_quiz, 'true_false',
          'A vulnerability is a weakness; an exploit is the code or technique that takes advantage of it.', 2, 3,
          'True. The weakness is the vulnerability; the exploit is what someone uses it for.')
  returning id into v_q3;

  insert into public.quiz_options (question_id, option_text, is_correct, position) values
    (v_q1, 'Preventive', true, 1),
    (v_q1, 'Detective', false, 2),
    (v_q1, 'Corrective', false, 3),
    (v_q1, 'Compensating', false, 4);

  insert into public.quiz_options (question_id, option_text, is_correct, position) values
    (v_q2, 'Detective', true, 1),
    (v_q2, 'Preventive', false, 2),
    (v_q2, 'Corrective', false, 3);

  insert into public.quiz_options (question_id, option_text, is_correct, position) values
    (v_q3, 'True', true, 1),
    (v_q3, 'False', false, 2);
end $$;