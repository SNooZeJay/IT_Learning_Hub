-- The catalogue: five categories, six courses, who teaches what, and what a student
-- has to do to earn a certificate.
--
-- Everything here is written from nothing. Nothing in this file was carried over from
-- the previous catalogue, and nothing patches a previous course.
--
-- Courses are keyed on `slug` and inserted only when absent, so the file can be
-- re-applied without duplicating the outline.
--
-- Two things are load-bearing and easy to get wrong:
--
-- 1. `courses.created_by` is NOT sufficient to teach a course. Both `can_edit_course_content`
--    and `is_instructor_of` check `course_instructors` and nothing else. An instructor who
--    created a course but was never added to it cannot edit a single lesson of it. So every
--    course gets a `course_instructors` row for its author, and co-teachers are added as
--    further rows.
--
-- 2. `courses.created_by` IS the payee. `price_a_payment` raises when it is missing, so a
--    paid course with no author cannot be sold. Author and teaching roster therefore have
--    to agree, which is why they are written together below.

begin;

-- ===========================================================================
-- Categories
-- ===========================================================================

insert into public.course_categories (name, slug, description, icon)
select v.name, v.slug, v.description, v.icon
from (values
  ('Programming',      'programming',
   'Writing, testing and shipping software.',
   'code'),
  ('Networking',       'networking',
   'How machines find and talk to each other.',
   'network'),
  ('Cybersecurity',    'cybersecurity',
   'Protecting systems, data and the people who use them.',
   'shield'),
  ('IT Support',       'it-support',
   'Keeping systems running and helping the people who use them.',
   'wrench'),
  ('Web Development',  'web-development',
   'Building for the browser: structure, style and behaviour.',
   'globe')
) as v(name, slug, description, icon)
where not exists (
  select 1 from public.course_categories c where c.slug = v.slug
);

-- ===========================================================================
-- Courses
--
-- `passing_score` is the course's own bar, and every quiz in the course uses the same
-- number. Keeping them identical means "passed every quiz" and "met the course's quiz
-- average" can never disagree, which would otherwise let a student satisfy one
-- requirement and be blocked by the other.
-- ===========================================================================

insert into public.courses
  (category_id, title, slug, description, status, level, duration_minutes,
   passing_score, price_centavos, created_by, published_at)
select cc.id, v.title, v.slug, v.description,
       'published'::public.course_status, v.level::public.course_level,
       v.duration_minutes, v.passing_score, v.price_centavos,
       p.id, now()
from (values
  ('programming',
   'Programming Foundations',
   'programming-foundations',
   'Start from nothing and finish able to write small programs that actually work. Covers how a program is executed, the values and types it manipulates, decisions and repetition, and how to package logic into functions. Written for someone who has never written a line of code.',
   'beginner',      240, 70.00,      0,
   'bautista.jayzee@ncst.edu.ph'),

  ('programming',
   'Python for Data Analysis',
   'python-for-data-analysis',
   'Python is the most widely used language for working with data. This course takes you from core Python syntax through loading, cleaning, summarising and reporting on tabular data with pandas and matplotlib, and ends with an analysis you can hand to someone else.',
   'intermediate',  300, 75.00, 179900,
   'bautista.jayzee@ncst.edu.ph'),

  ('networking',
   'Computer Networking Essentials',
   'computer-networking-essentials',
   'How a packet actually gets from your laptop to a server on another continent. Covers the layered model, IP addressing and subnetting, DNS, routing, and a repeatable method for finding where a connection breaks.',
   'beginner',      210, 70.00,      0,
   'instructor.two@ncst.edu.ph'),

  ('cybersecurity',
   'Security+ Exam Preparation',
   'security-plus-exam-preparation',
   'The CompTIA Security+ domains, taught as working knowledge rather than memorised objectives. Covers threats and vulnerabilities, security controls, security operations, and the exam itself, with practice questions after each domain.',
   'intermediate',  360, 75.00, 249900,
   'instructor.two@ncst.edu.ph'),

  ('it-support',
   'IT Support Essentials',
   'it-support-essentials',
   'What actually happens in a support desk. Covers the hardware and software you will meet, a disciplined way to diagnose a fault instead of guessing, and how to communicate clearly with the person who needs help.',
   'beginner',      180, 70.00,      0,
   'bautista.jayzee@ncst.edu.ph'),

  ('web-development',
   'Web Fundamentals',
   'web-fundamentals',
   'Build a working web page from three technologies: HTML for structure, CSS for presentation, and JavaScript for behaviour. Ends with responsive layout, accessibility basics, and a small interactive page of your own.',
   'beginner',      240, 70.00,      0,
   'instructor.two@ncst.edu.ph')
) as v(category_slug, title, slug, description, level, duration_minutes,
       passing_score, price_centavos, author_email)
join public.course_categories cc on cc.slug = v.category_slug
join public.profiles p on p.email = v.author_email
where not exists (
  select 1 from public.courses c where c.slug = v.slug
);

-- ===========================================================================
-- Who teaches what
--
-- The author is always on the teaching roster, because `is_instructor_of` reads
-- `course_instructors` and never `courses.created_by`. Two courses carry a second
-- instructor so the roster is visibly more than one person.
-- ===========================================================================

insert into public.course_instructors (course_id, instructor_id, assigned_at)
select c.id, p.id, now()
from (values
  ('programming-foundations',           'bautista.jayzee@ncst.edu.ph'),
  ('python-for-data-analysis',         'bautista.jayzee@ncst.edu.ph'),
  ('it-support-essentials',            'bautista.jayzee@ncst.edu.ph'),
  ('computer-networking-essentials',   'instructor.two@ncst.edu.ph'),
  ('security-plus-exam-preparation',   'instructor.two@ncst.edu.ph'),
  ('web-fundamentals',                 'instructor.two@ncst.edu.ph'),

  -- Co-teaching. Instructor Two joins Programming Foundations, and Instructor Demo
  -- joins Security+, so both appear on more than one course.
  ('programming-foundations',           'instructor.two@ncst.edu.ph'),
  ('security-plus-exam-preparation',   'bautista.jayzee@ncst.edu.ph')
) as v(course_slug, email)
join public.courses c on c.slug = v.course_slug
join public.profiles p on p.email = v.email
where not exists (
  select 1 from public.course_instructors ci
  where ci.course_id = c.id and ci.instructor_id = p.id
);

-- ===========================================================================
-- What a student must do to finish a course
--
-- `course_completion_gaps` reads these rows and reports every one that is not yet met;
-- `refresh_enrollment_completion` completes the enrolment when none remain, and the
-- certificate trigger fires off that.
--
-- Every course requires: every lesson complete, every published quiz passed, every
-- published assignment submitted and graded.
--
-- The two paid courses additionally require a quiz average of at least the course's own
-- passing score. Their quizzes use that same number as their pass mark, so passing all of
-- them already implies the average - the extra requirement records the standard without
-- adding a second, different way to be blocked.
-- ===========================================================================

insert into public.course_requirements (course_id, requirement_type, threshold)
select c.id, v.requirement_type::public.requirement_type, v.threshold
from (values
  ('programming-foundations',         'complete_all_lessons',  null),
  ('programming-foundations',         'pass_all_quizzes',      null),
  ('programming-foundations',         'submit_all_assignments', null),

  ('python-for-data-analysis',       'complete_all_lessons',  null),
  ('python-for-data-analysis',       'pass_all_quizzes',      null),
  ('python-for-data-analysis',       'submit_all_assignments', null),
  ('python-for-data-analysis',       'min_quiz_average',      75.00),

  ('computer-networking-essentials', 'complete_all_lessons',  null),
  ('computer-networking-essentials', 'pass_all_quizzes',      null),
  ('computer-networking-essentials', 'submit_all_assignments', null),

  ('security-plus-exam-preparation', 'complete_all_lessons',  null),
  ('security-plus-exam-preparation', 'pass_all_quizzes',      null),
  ('security-plus-exam-preparation', 'submit_all_assignments', null),
  ('security-plus-exam-preparation', 'min_quiz_average',      75.00),

  ('it-support-essentials',          'complete_all_lessons',  null),
  ('it-support-essentials',          'pass_all_quizzes',      null),
  ('it-support-essentials',          'submit_all_assignments', null),

  ('web-fundamentals',               'complete_all_lessons',  null),
  ('web-fundamentals',               'pass_all_quizzes',      null),
  ('web-fundamentals',               'submit_all_assignments', null)
) as v(course_slug, requirement_type, threshold)
join public.courses c on c.slug = v.course_slug
where not exists (
  select 1 from public.course_requirements r
  where r.course_id = c.id and r.requirement_type = v.requirement_type::public.requirement_type
);

commit;

-- ===========================================================================
-- The catalogue is coherent when every course has a category, an author who is also
-- on its teaching roster, and at least one completion requirement.
-- ===========================================================================

do $$
declare
  v_bad text;
begin
  select string_agg(c.slug, ', ')
    into v_bad
  from public.courses c
  left join public.course_categories cc on cc.id = c.category_id
   where cc.id is null;
  if v_bad is not null then
    raise exception 'course without a category: %', v_bad;
  end if;

  -- An author who is not on their own teaching roster cannot edit their own course.
  select string_agg(c.slug, ', ')
    into v_bad
  from public.courses c
  where not exists (
    select 1 from public.course_instructors ci
    where ci.course_id = c.id and ci.instructor_id = c.created_by
  );
  if v_bad is not null then
    raise exception 'author is not on the teaching roster for: %', v_bad;
  end if;

  select string_agg(c.slug, ', ')
    into v_bad
  from public.courses c
  where not exists (
    select 1 from public.course_requirements r where r.course_id = c.id
  );
  if v_bad is not null then
    raise exception 'course with no completion requirement: %', v_bad;
  end if;

  -- A paid course must be sellable: price_a_payment raises without an author.
  select string_agg(slug, ', ') into v_bad
  from (
    select c.slug, c.price_centavos, c.created_by,
           (select count(*) from public.course_instructors ci where ci.course_id = c.id) as n
      from public.courses c
  ) s
  where s.price_centavos > 0 and (s.created_by is null or s.n = 0);
  if v_bad is not null then
    raise exception 'paid course that cannot be priced: %', v_bad;
  end if;
end;
$$;