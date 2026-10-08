-- Security+: the general-concepts quiz, and the resources on its anchor lesson.
--
-- This exists because of a defect that a clean rebuild would have hidden rather than
-- fixed. Two earlier content statements named the lesson "The CIA triad and how they
-- actually fail" while the lesson is "The CIA triad and how it is actually used". Both
-- resolved it with an INNER JOIN, and an inner join whose key matches nothing does not
-- raise: it drops the row. So the resources on that lesson were never inserted, and an
-- entire quiz was never created, and the catalogue looked complete.
--
-- The assertion at the end of this file is the answer to that. It is kept here as well
-- as in the catalogue-wide gate because the condition it protects against - a lesson
-- title that does not match anything - is invisible to every other check.

begin;

insert into public.lesson_materials
  (lesson_id, title, file_path, material_type, content_text, external_url, position, uploaded_by)
select l.id, v.mat_title, null,
       v.mat_type::public.material_type, v.mat_content, v.mat_url, v.pos,
       c.created_by
from (values
('Reference: CompTIA Security+ certification',1,'external_link',
 null,'https://www.comptia.org/educators/certification/security'),
('Three properties, three different failures',2,'text',
$q$CONFIDENTIALITY - only the right people can read it
  fails by DISCLOSURE
  controls: authentication, authorisation, encryption

INTEGRITY - nobody can change it undetected
  fails by UNDETECTED CHANGE
  controls: hashing, digital signatures, audit logs, version control

AVAILABILITY - the people who need it can reach it
  fails by TAKING IT AWAY
  controls: redundancy, capacity, recovery, rate limiting

The controls differ in KIND, not just in strength. Confidentiality is about identity.
Integrity is about DETECTION. Availability is about CAPACITY.

Most real incidents are availability incidents. Nobody has to break into anything to make
a system unavailable: filling a disk or exhausting a connection pool is enough. A
programme that only thinks about confidentiality will be surprised.
$q$,null)
) as v(mat_title, pos, mat_type, mat_content, mat_url)
join public.lessons l on l.title = 'The CIA triad and how it is actually used'
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id and c.slug = 'security-plus-exam-preparation'
where not exists (select 1 from public.lesson_materials lm where lm.lesson_id = l.id and lm.title = v.mat_title);

insert into public.quizzes
  (course_id, module_id, lesson_id, title, description, instructions,
   passing_score, attempts_allowed, time_limit_minutes, shuffle_questions,
   reveal_answers, max_warnings, status, created_by)
select c.id, m.id, l.id, v.qtitle, v.qdesc, v.qinstr, c.passing_score, 3, 25,
       true, true, 3, 'draft'::public.quiz_status, c.created_by
from (values
('General security concepts: the triad, risk language and access control',
 'Eight questions on confidentiality, integrity and availability, and on telling risk apart from the things that cause it.',
 'You have three attempts. The pass mark is 75 percent, matching the course standard. Answers and explanations are shown once you submit.')
) as v(qtitle, qdesc, qinstr)
join public.courses c on c.slug = 'security-plus-exam-preparation'
join public.modules m on m.course_id = c.id and m.title = 'General security concepts'
join public.lessons l on l.module_id = m.id and l.title = 'The CIA triad and how it is actually used'
where not exists (select 1 from public.quizzes q where q.title = v.qtitle);

insert into public.quiz_questions (quiz_id, prompt, question_type, points, position, explanation)
select q.id, v.prompt, 'multiple_choice'::public.question_type, 1, v.pos, v.expl
from (values
(1,'Which property is broken when data is changed without anyone noticing?',
 'Confidentiality','Integrity','Availability','Authentication',
$q$Integrity is broken by undetected change, so its controls are about detection rather than prevention: hashing, signatures, audit logs, version control.$q$),
(2,'A hard drive fills up and a service stops responding. Which property has failed?',
 'Confidentiality','Integrity','Availability','Non-repudiation',
$q$Availability is broken by taking something away. Most real incidents are availability incidents, and nobody has to break in to cause one.$q$),
(3,'Which pair of controls suits integrity best?',
 'Encryption and strong passwords','Hashing and digital signatures','Redundancy and backups','Rate limiting and firewalls',
$q$Confidentiality controls are about identity, integrity controls are about detection, and availability controls are about capacity. The three differ in kind, not just strength.$q$),
(4,'What is a vulnerability?',
 'Anything that might exploit a weakness','A weakness in a system','The chance of a loss multiplied by its size','A control that reduces exposure',
$q$A weakness. A threat is what might exploit it, risk is likelihood multiplied by damage, and a control is what you put in to reduce it.$q$),
(5,'Awareness training primarily addresses which of these?',
 'A vulnerability','A threat','A risk score','A technical control',
$q$It addresses the threat of a person being tricked. Training does not patch a weakness; it changes the behaviour that the weakness depends on.$q$),
(6,'Two systems carry the same vulnerability. What can still differ between them?',
 'The vulnerability itself','Their risk, because exposure and value differ','The definition of the weakness','Whether it counts as a weakness at all',
$q$Risk is the only one of the four words that is a judgement, and it is the one that decides where effort goes. One system may be internet-reachable and hold something valuable; the other may be neither.$q$),
(7,'What does least privilege mean in practice?',
 'Everyone gets administrator rights temporarily',
 'Access is granted only for what the job requires, and removed when no longer needed',
 'Passwords are long and rotated often','Only trusted devices may connect',
$q$Access that is not required is not harmless; it is a standing invitation. Least privilege is also what makes an audit tractable.$q$),
(8,'What does zero trust change about the assumption being made?',
 'Nothing; it is another name for a firewall',
 'Trust is never granted by position on the network; every request is verified',
 'All traffic inside a network is trusted','Only administrators may connect',
$q$It does not mean trusting nobody. It means never trusting by position. Perimeters leak, and once one device inside is compromised the older model treats everything it touches as trusted.$q$)
) as v(pos, prompt, a, b, c, d, expl)
join public.quizzes q on q.title = 'General security concepts: the triad, risk language and access control'
where not exists (select 1 from public.quiz_questions qq where qq.quiz_id = q.id and qq.position = v.pos);

insert into public.quiz_options (question_id, option_text, is_correct, position)
select qq.id, v.opt, v.correct, v.pos
from (values
(1,1,'Confidentiality',false),(1,2,'Integrity',true),(1,3,'Availability',false),(1,4,'Authentication',false),
(2,1,'Confidentiality',false),(2,2,'Integrity',false),(2,3,'Availability',true),(2,4,'Non-repudiation',false),
(3,1,'Encryption and strong passwords',false),(3,2,'Hashing and digital signatures',true),(3,3,'Redundancy and backups',false),(3,4,'Rate limiting and firewalls',false),
(4,1,'Anything that might exploit a weakness',false),(4,2,'A weakness in a system',true),(4,3,'The chance of a loss multiplied by its size',false),(4,4,'A control that reduces exposure',false),
(5,1,'A vulnerability',false),(5,2,'A threat',true),(5,3,'A risk score',false),(5,4,'A technical control',false),
(6,1,'The vulnerability itself',false),(6,2,'Their risk, because exposure and value differ',true),(6,3,'The definition of the weakness',false),(6,4,'Whether it counts as a weakness at all',false),
(7,1,'Everyone gets administrator rights temporarily',false),(7,2,'Access is granted only for what the job requires, and removed when no longer needed',true),(7,3,'Passwords are long and rotated often',false),(7,4,'Only trusted devices may connect',false),
(8,1,'Nothing; it is another name for a firewall',false),(8,2,'Trust is never granted by position on the network; every request is verified',true),(8,3,'All traffic inside a network is trusted',false),(8,4,'Only administrators may connect',false)
) as v(qpos, pos, opt, correct)
join public.quizzes q on q.title = 'General security concepts: the triad, risk language and access control'
join public.quiz_questions qq on qq.quiz_id = q.id and qq.position = v.qpos
where not exists (select 1 from public.quiz_options qo where qo.question_id = qq.id and qo.position = v.pos);

update public.quizzes set status = 'published'
where title = 'General security concepts: the triad, risk language and access control';

commit;

-- The lesson this migration is about must now exist, carry its resources, and have a
-- published quiz. Each of these three would have been satisfied by the broken version of
-- this file, because the broken version simply did nothing.
do $$
begin
  if not exists (
    select 1 from public.lessons l
      join public.modules m on m.id = l.module_id
      join public.courses c on c.id = m.course_id
     where c.slug = 'security-plus-exam-preparation'
       and l.title = 'The CIA triad and how it is actually used'
  ) then
    raise exception 'the lesson this migration anchors to does not exist';
  end if;

  if not exists (
    select 1
      from public.lesson_materials lm
      join public.lessons l on l.id = lm.lesson_id
      join public.modules m on m.id = l.module_id
      join public.courses c on c.id = m.course_id
     where c.slug = 'security-plus-exam-preparation'
       and l.title = 'The CIA triad and how it is actually used'
  ) then
    raise exception 'the CIA triad lesson has no resources';
  end if;

  if not exists (
    select 1 from public.quizzes q
      join public.courses c on c.id = q.course_id
     where c.slug = 'security-plus-exam-preparation'
       and q.status = 'published'
       and q.title = 'General security concepts: the triad, risk language and access control'
  ) then
    raise exception 'the general concepts quiz was not published';
  end if;
end;
$$;