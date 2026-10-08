-- Attempts, submissions, and the one certificate.
--
-- Attempts are built the way a real attempt is built: an attempt row carrying the
-- question and option order it presented, one quiz_answers row for EVERY question in the
-- quiz, and a score computed from the stored key. Nothing is written as a summary; the
-- percentage is derived from the answers, so it cannot disagree with them.
--
-- Scores are deliberately imperfect. A dataset where every student scored full marks
-- would tell an instructor nothing about their grading queue, and would not exercise the
-- one-attempt-failed-then-retried path at all.
--
-- One attempt is left in_progress with no answers and no score. That is what the quizzes
-- screen shows a student who has started but not submitted, and it is the state most
-- likely to be missing from generated data and most visible when it is.
--
-- Graded submissions are written while impersonating the course's own instructor.
-- protect_graded_submission refuses a grade from anyone who is not an instructor of that
-- course or an administrator, so the seeded grades go through the same check a real
-- grading click does rather than around it.
--
-- Joren's programming-foundations work is complete by the end of this file, which is what
-- lets the last statement finish his enrolment and lets the certificate trigger issue.

begin;

do $$
declare
  r         record;
  v_quiz    uuid;
  v_enr     uuid;
  v_att     uuid;
  v_q       record;
  v_qorder  uuid[];
  v_oorder  jsonb := '{}'::jsonb;
  v_i       integer := 0;
  v_score   numeric := 0;
  v_max     numeric;
  v_n       integer;
begin
  for r in
    select * from (values
      ('lalamonan.joren@ncst.edu.ph',     'programming-foundations',
       'How a program runs: the three steps, and the three kinds of failure', 1, 'submitted'),
      ('lalamonan.joren@ncst.edu.ph',     'programming-foundations',
       'Decisions, loops and functions: choosing the right shape',            2, 'submitted'),
      -- Left open on purpose: this is what the quizzes screen shows as in progress.
      ('lalamonan.joren@ncst.edu.ph',     'computer-networking-essentials',
       'Layers and the last hop: how data actually crosses a network',        0, 'in_progress'),
      ('guia.justinejosh@ncst.edu.ph',    'web-fundamentals',
       'HTML: structure, nesting and semantic markup',                         1, 'submitted'),
      ('guia.justinejosh@ncst.edu.ph',    'python-for-data-analysis',
       'Data structures, filtering and the mess in real data',                1, 'submitted'),
      ('garmino.shanleekian@ncst.edu.ph', 'web-fundamentals',
       'CSS and JavaScript: cascade, layout, events and checking your work',   1, 'submitted')
    ) as t(email, course_slug, qtitle, wrong_count, state)
  loop
    select q.id into v_quiz
      from public.quizzes q join public.courses c on c.id = q.course_id
     where c.slug = r.course_slug and q.title = r.qtitle;

    if v_quiz is null then
      raise exception 'quiz not found: % / %', r.course_slug, r.qtitle;
    end if;

    select en.id into v_enr
      from public.enrollments en
      join public.profiles p on p.id = en.student_id
     where p.email = r.email
       and en.course_id = (select course_id from public.quizzes where id = v_quiz)
       and en.status in ('active', 'completed')
     order by en.enrolled_at desc
     limit 1;

    if v_enr is null then
      raise exception 'no live enrolment for % in %', r.email, r.course_slug;
    end if;

    -- Already seeded: leave it alone, so this file re-applies without doubling attempts.
    if exists (select 1 from public.quiz_attempts a
                where a.quiz_id = v_quiz
                  and a.student_id = (select student_id from public.enrollments where id = v_enr)) then
      continue;
    end if;

    -- The order the attempt presented, recorded exactly as start_quiz_attempt does.
    select coalesce(array_agg(qq.id order by qq.position), '{}')
      into v_qorder
      from public.quiz_questions qq where qq.quiz_id = v_quiz;

    for v_q in
      select qq.id,
             coalesce(array_agg(o.id order by o.position), '{}') as option_ids
        from public.quiz_questions qq
        left join public.quiz_options o on o.question_id = qq.id
       where qq.quiz_id = v_quiz
       group by qq.id
    loop
      v_oorder := v_oorder || jsonb_build_object(v_q.id::text, to_jsonb(v_q.option_ids));
    end loop;

    select count(*) into v_n
      from public.quiz_attempts
     where quiz_id = v_quiz
       and student_id = (select student_id from public.enrollments where id = v_enr);

    insert into public.quiz_attempts
      (quiz_id, course_id, enrollment_id, student_id, attempt_number, status,
       question_order, option_order, started_at, expires_at)
    values (v_quiz, (select course_id from public.quizzes where id = v_quiz), v_enr,
            (select student_id from public.enrollments where id = v_enr), v_n + 1,
            'in_progress'::public.attempt_status, v_qorder, v_oorder,
            now() - make_interval(mins => 25), now() + make_interval(mins => 20))
    returning id into v_att;

    if r.state = 'in_progress' then
      continue;   -- left open, with no answers and no score
    end if;

    -- One answer per question, graded against the stored key. The first few questions are
    -- answered wrongly, which is what a real attempt looks like.
    v_i := 0;
    v_score := 0;
    for v_q in
      select qq.id, qq.points,
             (select o.id from public.quiz_options o
               where o.question_id = qq.id and o.is_correct) as correct_option,
             (select o.id from public.quiz_options o
               where o.question_id = qq.id and not o.is_correct
               order by o.position limit 1) as wrong_option
        from public.quiz_questions qq
       where qq.quiz_id = v_quiz
       order by qq.position
    loop
      v_i := v_i + 1;
      insert into public.quiz_answers
        (attempt_id, question_id, selected_option_id, text_answer, is_correct, points_awarded)
      values (v_att, v_q.id,
              case when v_i <= r.wrong_count then v_q.wrong_option else v_q.correct_option end,
              null,
              v_i > r.wrong_count,
              case when v_i > r.wrong_count then v_q.points else 0 end);
      if v_i > r.wrong_count then
        v_score := v_score + v_q.points;
      end if;
    end loop;

    select coalesce(sum(points), 0) into v_max
      from public.quiz_questions where quiz_id = v_quiz;

    update public.quiz_attempts
       set status = 'submitted',
           score = v_score,
           max_score = v_max,
           percentage = round((v_score / v_max) * 100, 2),
           passed = round((v_score / v_max) * 100, 2)
                    >= (select passing_score from public.quizzes where id = v_quiz),
           submitted_at = now() - make_interval(mins => 3),
           ended_via = 'student_submit'
     where id = v_att;
  end loop;
end;
$$;

do $$
declare
  r         record;
  v_course  uuid;
  v_assign  uuid;
  v_student uuid;
  v_teacher uuid;
  v_max     numeric;
begin
  for r in
    select * from (values
      -- Graded. Joren finishes programming-foundations, which is what lets his enrolment
      -- complete and his certificate issue.
      ('lalamonan.joren@ncst.edu.ph',     'programming-foundations',
       'Decision table exercise',        46, 'graded'),
      ('lalamonan.joren@ncst.edu.ph',     'programming-foundations',
       'A number-reporting program',     88, 'graded'),
      ('lalamonan.joren@ncst.edu.ph',     'it-support-essentials',
       'Diagnose three faults',          43, 'graded'),

      ('guia.justinejosh@ncst.edu.ph',    'python-for-data-analysis',
       'Clean and profile a dataset',    91, 'graded'),

      -- Awaiting marking. These are what puts work in the instructor grading queue, so the
      -- Grading screen has something real in it rather than an empty state.
      ('guia.justinejosh@ncst.edu.ph',    'web-fundamentals',
       'Build a responsive card layout', null, 'submitted'),
      ('garmino.shanleekian@ncst.edu.ph', 'web-fundamentals',
       'Build a responsive card layout', null, 'submitted')
    ) as t(email, course_slug, atitle, grade, state)
  loop
    select c.id into v_course from public.courses c where c.slug = r.course_slug;
    select a.id, a.max_points into v_assign, v_max
      from public.assignments a where a.course_id = v_course and a.title = r.atitle;
    select id into v_student from public.profiles where email = r.email;
    select created_by into v_teacher from public.courses where id = v_course;

    if v_assign is null then
      raise exception 'assignment not found: % / %', r.course_slug, r.atitle;
    end if;

    if exists (select 1 from public.assignment_submissions s
                where s.assignment_id = v_assign and s.student_id = v_student) then
      continue;
    end if;

    if r.grade is not null and r.grade > v_max then
      raise exception 'seed grade % exceeds the maximum % for %', r.grade, v_max, r.atitle;
    end if;

    if r.grade is not null then
      -- Be the instructor who actually owns the course while writing a grade, so the
      -- guard in protect_graded_submission passes for the right reason.
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_teacher::text, 'role', 'authenticated')::text, true);
    end if;

    insert into public.assignment_submissions
      (assignment_id, course_id, student_id, submission_text, submitted_at,
       grade, feedback, graded_by, graded_at, status)
    values (v_assign, v_course, v_student,
            'Submitted through the student dashboard. Work attached as '
            || lower(regexp_replace(r.atitle, '[^a-zA-Z0-9]+', '-', 'g')) || '.pdf',
            now() - make_interval(days => 2),
            r.grade,
            case when r.grade is null then null
                 when r.grade >= (v_max * 0.8) then
                   'Strong work. Your reasoning is clear and your boundary cases are correct. The one thing to carry forward is writing down what you chose not to change.'
                 else
                   'A solid attempt, and the diagnosis is right. Two things to tighten: state the test you would run to distinguish your hypotheses, and record what you deliberately did not try.' end,
            case when r.grade is null then null else v_teacher end,
            case when r.grade is null then null else now() - make_interval(days => 1) end,
            r.state::public.submission_status);

    perform set_config('request.jwt.claims', '', true);
  end loop;
end;
$$;

commit;

-- ===========================================================================
-- Finish the one completed course, the way the product does it.
--
-- The certificate is NOT written here. Doing that would put a plausible-looking
-- certificate into the database that no code path produced, and the demo would then be
-- showing a fabrication next to a real feature.
--
-- Instead this impersonates the student and calls refresh_enrollment_completion, which
-- is the same call the lesson, quiz and assignment screens make. That function reads
-- course_completion_gaps, finds nothing outstanding, flips the enrolment to completed,
-- and the existing enrollments_issue_certificate trigger issues the certificate. The
-- notification and certificate counters in the admin dashboard are then real too.
--
-- It has to be impersonated because refresh_enrollment_completion is SECURITY DEFINER
-- and checks ownership: any authenticated user could otherwise pass any enrolment id and
-- complete somebody else's course.
-- ===========================================================================

do $$
declare
  v_enr  uuid;
  v_gaps text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"b5aead0d-f893-4588-bf35-6d637e4b8545","role":"authenticated","email":"lalamonan.joren@ncst.edu.ph"}',
    true);

  select en.id into v_enr
  from public.enrollments en
  join public.profiles p on p.id = en.student_id
  join public.courses c on c.id = en.course_id
  where p.email = 'lalamonan.joren@ncst.edu.ph'
    and c.slug = 'programming-foundations';

  if v_enr is null then
    raise exception 'no enrolment found to complete';
  end if;

  select coalesce(string_agg(g.requirement::text || ': ' || g.detail, ' | '), 'none')
    into v_gaps
  from public.course_completion_gaps(v_enr) g;

  perform public.refresh_enrollment_completion(v_enr);

  perform set_config('request.jwt.claims', '', true);

  -- Whatever the call did, the course is not left half-finished and silent: either it is
  -- completed with a certificate, or it still has named gaps that explain why.
  if not exists (
    select 1 from public.enrollments where id = v_enr and status = 'completed'
  ) then
    raise exception 'programming-foundations did not complete; remaining gaps were: %', v_gaps;
  end if;

  if not exists (
    select 1 from public.certificates where enrollment_id = v_enr
  ) then
    raise exception 'enrolment completed but the certificate trigger issued nothing';
  end if;
end;
$$;