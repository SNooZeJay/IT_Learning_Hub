-- Security+ Exam Preparation: the threats, operations and exam quiz.
--
-- Only one quiz belongs here. The general-concepts quiz is deliberately NOT in this
-- file: it is created by the following migration, which also carries the lesson
-- resources for its anchor lesson. Splitting them keeps each file to one responsibility.
--
-- This course is paid, so its quizzes take their passing score from the course (75),
-- matching the course's own min_quiz_average requirement. A quiz below that bar would
-- let a student satisfy pass_all_quizzes and then be stopped by min_quiz_average -
-- two requirements that must never disagree.

begin;

insert into public.quizzes
  (course_id, module_id, lesson_id, title, description, instructions,
   passing_score, attempts_allowed, time_limit_minutes, shuffle_questions,
   reveal_answers, max_warnings, status, created_by)
select c.id, m.id, l.id, v.qtitle, v.qdesc, v.qinstr, c.passing_score, 3, 25,
       true, true, 3, 'draft'::public.quiz_status, c.created_by
from (values
('Security operations and the exam','Incident response in order',
 'Threats, operations and the exam itself',
 'Ten questions on malicious code, social engineering, network attacks, incident response and how the exam is put together.',
 'You have three attempts. The pass mark is 75 percent, matching the course standard. Answers and explanations are shown once you submit.')
) as v(module_title, lesson_title, qtitle, qdesc, qinstr)
join public.courses c on c.slug = 'security-plus-exam-preparation'
join public.modules m on m.course_id = c.id and m.title = v.module_title
join public.lessons l on l.module_id = m.id and l.title = v.lesson_title
where not exists (select 1 from public.quizzes q where q.title = v.qtitle);

insert into public.quiz_questions (quiz_id, prompt, question_type, points, position, explanation)
select q.id, v.prompt, 'multiple_choice'::public.question_type, 1, v.pos, v.expl
from (values
(1,'What distinguishes a worm from a virus?',
 'A worm is encrypted',
 'A worm copies itself across a network without needing something to carry it',
 'A virus is always malicious',
 'A worm only targets operating systems',
$q$That is the distinction worth getting right and the one most often blurred. Everything else is a matter of payload rather than category.$q$),
(2,'Which malware category describes software that hides its own presence from the tools that would reveal it?',
 'Virus','Trojan','Ransomware','Rootkit',
$q$A rootkit. A virus needs a carrier, a trojan misrepresents itself, and ransomware encrypts and demands payment.$q$),
(3,'Which statement about modern malware is most accurate?',
 'It is mostly delivered as an exploit against an unpatched service',
 'It is mostly delivered as ordinary software somebody chose to install',
 'It is almost always removed by antivirus',
 'It rarely targets organisations',
$q$Delivery is overwhelmingly social, and the overwhelming majority is ransomware, because it monetises directly. That is why defence leans on limiting reach and on detection speed.$q$),
(4,'A password attack tries a few common passwords across many accounts. What is this called?',
 'A brute force attack','Password spraying','A dictionary attack','Credential stuffing',
$q$Spraying trades depth for breadth, staying under the lockout threshold on each account while covering many. Credential stuffing reuses credentials already stolen from elsewhere.$q$),
(5,'Which of these best defeats social engineering?',
 'A longer password policy',
 'Verifying unusual requests through a second channel before acting',
 'More spam filtering','Disabling email attachments',
$q$It works because it does not rely on the channel the request arrived on. A second channel plus a deliberate delay removes the urgency window the technique depends on.$q$),
(6,'An amplification attack relies on which property being abused?',
 'The target stores data in plaintext',
 'The reply is larger than the spoofed request that caused it',
 'The target runs an old operating system',
 'The target has a public address',
$q$Servers that answer requests addressed to others let an attacker send a small spoofed request and make a much larger one arrive at the target.$q$),
(7,'Which step is most often skipped, and what happens as a result?',
 'Containment, and the incident spreads while you investigate',
 'Eradication, and the incident returns sometimes weeks later',
 'Recovery, and the system stays down',
 'Documentation, and the cause is never found',
$q$Skipping eradication and going straight to recovery is the classic mistake. It is always made for understandable reasons under time pressure.$q$),
(8,'Why centralise logs during a security investigation?',
 'It makes them easier to read',
 'An attacker who reaches a machine can edit the logs stored on it',
 'It reduces storage cost','It speeds up the network',
$q$Local logs on a compromised host are evidence under the attacker's control. Centralising moves the record somewhere the attacker has not reached.$q$),
(9,'You notice authentication failures and privilege changes in quick succession. What is the priority?',
 'Improve the password policy first',
 'Investigate immediately, since that pairing suggests an attack in progress',
 'Wait for more data before acting','Restore from backup',
$q$Alerting should aim at things that indicate real trouble rather than at everything. Two meaningful events close together is exactly that.$q$),
(10,'On a multiple-choice question two answers appear correct. What usually separates them?',
 'The shorter one is correct',
 'The second sentence of the question stem',
 'The answer that appears first',
 'The one using more technical vocabulary',
$q$Many distractors are true statements that do not answer the question asked. The stem usually narrows the requirement after its opening sentence.$q$)
) as v(pos, prompt, a, b, c, d, expl)
join public.quizzes q on q.title = 'Threats, operations and the exam itself'
where not exists (select 1 from public.quiz_questions qq where qq.quiz_id = q.id and qq.position = v.pos);

insert into public.quiz_options (question_id, option_text, is_correct, position)
select qq.id, v.opt, v.correct, v.pos
from (values
(1,1,'A worm is encrypted',false),(1,2,'A worm copies itself across a network without needing something to carry it',true),(1,3,'A virus is always malicious',false),(1,4,'A worm only targets operating systems',false),
(2,1,'Virus',false),(2,2,'Trojan',false),(2,3,'Ransomware',false),(2,4,'Rootkit',true),
(3,1,'It is mostly delivered as an exploit against an unpatched service',false),(3,2,'It is mostly delivered as ordinary software somebody chose to install',true),(3,3,'It is almost always removed by antivirus',false),(3,4,'It rarely targets organisations',false),
(4,1,'A brute force attack',false),(4,2,'Password spraying',true),(4,3,'A dictionary attack',false),(4,4,'Credential stuffing',false),
(5,1,'A longer password policy',false),(5,2,'Verifying unusual requests through a second channel before acting',true),(5,3,'More spam filtering',false),(5,4,'Disabling email attachments',false),
(6,1,'The target stores data in plaintext',false),(6,2,'The reply is larger than the spoofed request that caused it',true),(6,3,'The target runs an old operating system',false),(6,4,'The target has a public address',false),
(7,1,'Containment, and the incident spreads while you investigate',false),(7,2,'Eradication, and the incident returns sometimes weeks later',true),(7,3,'Recovery, and the system stays down',false),(7,4,'Documentation, and the cause is never found',false),
(8,1,'It makes them easier to read',false),(8,2,'An attacker who reaches a machine can edit the logs stored on it',true),(8,3,'It reduces storage cost',false),(8,4,'It speeds up the network',false),
(9,1,'Improve the password policy first',false),(9,2,'Investigate immediately, since that pairing suggests an attack in progress',true),(9,3,'Wait for more data before acting',false),(9,4,'Restore from backup',false),
(10,1,'The shorter one is correct',false),(10,2,'The second sentence of the question stem',true),(10,3,'The answer that appears first',false),(10,4,'The one using more technical vocabulary',false)
) as v(qpos, pos, opt, correct)
join public.quizzes q on q.title = 'Threats, operations and the exam itself'
join public.quiz_questions qq on qq.quiz_id = q.id and qq.position = v.qpos
where not exists (select 1 from public.quiz_options qo where qo.question_id = qq.id and qo.position = v.pos);

update public.quizzes set status = 'published'
where course_id = (select id from public.courses where slug = 'security-plus-exam-preparation')
  and title = 'Threats, operations and the exam itself';

commit;