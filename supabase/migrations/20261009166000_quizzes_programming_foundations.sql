-- Programming Foundations: two published quizzes.
--
-- Order matters here and it is not arbitrary. `quiz_publish_guard` is a BEFORE INSERT OR
-- UPDATE OF status trigger that refuses to publish a quiz with no questions, or with a
-- question that does not have exactly one correct option. So each quiz is inserted as a
-- draft, given its questions and options, and only then flipped to published. Publishing
-- first would fail, and a failed migration is a rebuild that stops halfway.
--
-- passing_score is taken from the course rather than restated, so a quiz can never be
-- easier than the course that contains it. That matters here because these courses
-- require pass_all_quizzes; a quiz set below the course bar would let a student satisfy
-- one requirement and be stopped by another.

begin;

insert into public.quizzes
  (course_id, module_id, lesson_id, title, description, instructions,
   passing_score, attempts_allowed, time_limit_minutes, shuffle_questions,
   reveal_answers, max_warnings, status, created_by)
select c.id, m.id, l.id, v.qtitle, v.qdesc, v.qinstr,
       c.passing_score, 3, v.time_limit, true, true, 3,
       'draft'::public.quiz_status, c.created_by
from (values
('How a program runs','What a program actually is',
 'How a program runs: the three steps, and the three kinds of failure',
 'Eight questions on what a program actually does when it runs, and how its errors differ from one another.',
 'You have three attempts. The pass mark is 70 percent. Answers and explanations are shown once you submit.',
 20),
('Repetition and functions','Packaging logic into functions',
 'Decisions, loops and functions: choosing the right shape',
 'Eight questions on conditionals, the three kinds of loop, and what makes a function worth having.',
 'You have three attempts. The pass mark is 70 percent. Answers and explanations are shown once you submit.',
 20)
) as v(module_title, lesson_title, qtitle, qdesc, qinstr, time_limit)
join public.courses c on c.slug = 'programming-foundations'
join public.modules m on m.course_id = c.id and m.title = v.module_title
join public.lessons l on l.module_id = m.id and l.title = v.lesson_title
where not exists (select 1 from public.quizzes q where q.title = v.qtitle);

insert into public.quiz_questions (quiz_id, prompt, question_type, points, position, explanation)
select q.id, v.prompt, 'multiple_choice'::public.question_type, 1, v.pos, v.expl
from (values
('How a program runs: the three steps, and the three kinds of failure',1,
 'What is a program, in the most literal sense?',
 'A set of instructions carried out in order',
 'A description of what you want the computer to do',
 'A list of things the computer guesses you meant',
 'A file that can only be run once',
$q$A program is a list of instructions, and the machine follows them in order. The most useful consequence is that when a program surprises you, the cause is always in the instructions - never in what you meant.$q$),
('How a program runs: the three steps, and the three kinds of failure',2,
 'A program prints 12 but you expected 30. What does that tell you?',
 'The computer misread the code',
 'A syntax error was silently ignored',
 'The instructions do not compute what you expected',
 'The output was never displayed',
$q$Nothing crashed, so this is a logic error: the program ran to completion and produced a wrong answer. It looks exactly like success, which is why it is the dangerous one.$q$),
('How a program runs: the three steps, and the three kinds of failure',3,
 'Which kind of error means the program could not be read at all?',
 'Syntax error',
 'Runtime error',
 'Logic error',
 'Type error',
$q$A syntax error means something is malformed, so nothing ran. A runtime error means it read fine and stopped partway. A logic error ran to completion and got the wrong answer.$q$),
('How a program runs: the three steps, and the three kinds of failure',4,
 'You change one line and the program prints something different. What have you established?',
 'That the program is now correct',
 'That the computer made a correction',
 'That the change had an effect',
 'That the program is broken',
$q$You have established a cause and an effect. Whether it is the effect you wanted is a separate question, which is why reading the output is a step of its own.$q$),
('How a program runs: the three steps, and the three kinds of failure',5,
 'Why start by writing a program that prints a single line?',
 'Because longer programs are harder to run',
 'To strip away distractions and leave the parts that matter visible',
 'Because one-line programs cannot contain bugs',
 'Because the language requires it',
$q$It is a technique rather than a restriction. You add input, decisions and repetition back one at a time, each with a single job, and each stays easy to check.$q$),
('How a program runs: the three steps, and the three kinds of failure',6,
 'Which of these is a runtime error?',
 'A missing colon at the end of a line',
 'A misspelled keyword',
 'Dividing by zero',
 'Printing the wrong variable',
$q$The first two are syntax errors and stop the program before it starts. Dividing by zero happens while the program is running. Printing the wrong variable is a logic error, which produces output rather than a crash.$q$),
('How a program runs: the three steps, and the three kinds of failure',7,
 'Your program runs to completion and the output is wrong. Which error is this?',
 'Syntax error',
 'Runtime error',
 'Logic error',
 'Compilation error',
$q$Only a person who knows what the right answer should be can detect this. No tool can tell you an answer is wrong unless it knows the right answer, so nothing about this failure announces itself.$q$),
('How a program runs: the three steps, and the three kinds of failure',8,
 'What should you do first when a program does not do what you expected?',
 'Read the error message',
 'Rewrite the whole program',
 'Change every line until it works',
 'Reinstall the language',
$q$The message almost always names the line and usually says what it wanted. Treating it as the answer rather than as a clue is the most expensive habit a beginner can pick up.$q$),
('Decisions, loops and functions: choosing the right shape',1,
 'What does a conditional do?',
 'Runs its block only when its condition is true',
 'Runs its block every time it is reached',
 'Runs only the else branch',
 'Runs its block once and then stops',
$q$The condition has to be a question with a yes-or-no answer. If it is not one, rewriting it as one is usually more useful than reaching for an else.$q$),
('Decisions, loops and functions: choosing the right shape',2,
 'Which operator compares two values for equality in Python?',
 '=',
 '==',
 ':=',
 '->',
$q$Two equals signs compare. A single equals sign is assignment, and using one where you meant the other does not fail loudly: it quietly replaces a value and then compares it.$q$),
('Decisions, loops and functions: choosing the right shape',3,
 'Before writing a loop, which question must you answer first?',
 'Which language should I write it in',
 'Whether it runs a fixed number of times, until something happens, or forever',
 'How many lines the loop body will have',
 'Whether it should be a for or a while',
$q$That is the question that decides the shape of the loop. Picking the loop type first is what produces code that is genuinely hard to reason about.$q$),
('Decisions, loops and functions: choosing the right shape',4,
 'What is a function for?',
 'To make a program run faster',
 'To give a block of work a name, and the values it needs',
 'To reduce the number of lines in a file',
 'To store data between runs',
$q$The name makes the calling code read like a sentence, and taking what it needs as parameters is what makes it possible to understand and test the function on its own.$q$),
('Decisions, loops and functions: choosing the right shape',5,
 'Why should a function depend only on its arguments?',
 'It runs faster',
 'So it can be understood, tested and reused on its own',
 'Because global variables are not allowed',
 'To reduce memory use',
$q$A function that reaches out and reads whatever variables happen to be nearby is tangled with everything around it, and changing anything becomes risky.$q$),
('Decisions, loops and functions: choosing the right shape',6,
 'A loop contains one wrong line. What is the most likely symptom?',
 'The program fails to start',
 'The wrong result appears many times, because the mistake now repeats too',
 'Nothing happens at all',
 'The loop stops immediately',
$q$The loop is the first place a mistake gets to repeat itself, which is why most early bugs live there. A result that is unexpectedly long or unexpectedly empty is the usual first sign.$q$),
('Decisions, loops and functions: choosing the right shape',7,
 'You cannot work out how many times a loop body should run. What is the right response?',
 'Add a counter and run it to find out',
 'Run it until it stops, and see',
 'Do not write it yet: the condition is not understood well enough',
 'Guess, then check the result',
$q$Counting by hand is the check. If you cannot, the loop condition is not yet understood, and running it to find out can lock the program up or produce a very large answer.$q$),
('Decisions, loops and functions: choosing the right shape',8,
 'A variable is best thought of as...',
 'A box with a label on it',
 'A name bound to a value',
 'A column in a table',
 'A fixed piece of storage in the program',
$q$Two names can refer to the same value, and giving one of them a new value does not change the other. Most confusing bugs in early code trace back to assuming it is a box.$q$)
) as v(qtitle, pos, prompt, a, b, c, d, expl)
join public.quizzes q on q.title = v.qtitle
join public.courses c on c.id = q.course_id and c.slug = 'programming-foundations'
where not exists (select 1 from public.quiz_questions qq where qq.quiz_id = q.id and qq.position = v.pos);

insert into public.quiz_options (question_id, option_text, is_correct, position)
select qq.id, v.opt, v.correct, v.pos
from (values
('How a program runs: the three steps, and the three kinds of failure',1,1,'A set of instructions carried out in order',true),
('How a program runs: the three steps, and the three kinds of failure',1,2,'A description of what you want the computer to do',false),
('How a program runs: the three steps, and the three kinds of failure',1,3,'A list of things the computer guesses you meant',false),
('How a program runs: the three steps, and the three kinds of failure',1,4,'A file that can only be run once',false),
('How a program runs: the three steps, and the three kinds of failure',2,1,'The computer misread the code',false),
('How a program runs: the three steps, and the three kinds of failure',2,2,'A syntax error was silently ignored',false),
('How a program runs: the three steps, and the three kinds of failure',2,3,'The instructions do not compute what you expected',true),
('How a program runs: the three steps, and the three kinds of failure',2,4,'The output was never displayed',false),
('How a program runs: the three steps, and the three kinds of failure',3,1,'Syntax error',true),
('How a program runs: the three steps, and the three kinds of failure',3,2,'Runtime error',false),
('How a program runs: the three steps, and the three kinds of failure',3,3,'Logic error',false),
('How a program runs: the three steps, and the three kinds of failure',3,4,'Type error',false),
('How a program runs: the three steps, and the three kinds of failure',4,1,'That the program is now correct',false),
('How a program runs: the three steps, and the three kinds of failure',4,2,'That the computer made a correction',false),
('How a program runs: the three steps, and the three kinds of failure',4,3,'That the change had an effect',true),
('How a program runs: the three steps, and the three kinds of failure',4,4,'That the program is broken',false),
('How a program runs: the three steps, and the three kinds of failure',5,1,'Because longer programs are harder to run',false),
('How a program runs: the three steps, and the three kinds of failure',5,2,'To strip away distractions and leave the parts that matter visible',true),
('How a program runs: the three steps, and the three kinds of failure',5,3,'Because one-line programs cannot contain bugs',false),
('How a program runs: the three steps, and the three kinds of failure',5,4,'Because the language requires it',false),
('How a program runs: the three steps, and the three kinds of failure',6,1,'A missing colon at the end of a line',false),
('How a program runs: the three steps, and the three kinds of failure',6,2,'A misspelled keyword',false),
('How a program runs: the three steps, and the three kinds of failure',6,3,'Dividing by zero',true),
('How a program runs: the three steps, and the three kinds of failure',6,4,'Printing the wrong variable',false),
('How a program runs: the three steps, and the three kinds of failure',7,1,'Syntax error',false),
('How a program runs: the three steps, and the three kinds of failure',7,2,'Runtime error',false),
('How a program runs: the three steps, and the three kinds of failure',7,3,'Logic error',true),
('How a program runs: the three steps, and the three kinds of failure',7,4,'Compilation error',false),
('How a program runs: the three steps, and the three kinds of failure',8,1,'Read the error message',true),
('How a program runs: the three steps, and the three kinds of failure',8,2,'Rewrite the whole program',false),
('How a program runs: the three steps, and the three kinds of failure',8,3,'Change every line until it works',false),
('How a program runs: the three steps, and the three kinds of failure',8,4,'Reinstall the language',false),
('Decisions, loops and functions: choosing the right shape',1,1,'Runs its block only when its condition is true',true),
('Decisions, loops and functions: choosing the right shape',1,2,'Runs its block every time it is reached',false),
('Decisions, loops and functions: choosing the right shape',1,3,'Runs only the else branch',false),
('Decisions, loops and functions: choosing the right shape',1,4,'Runs its block once and then stops',false),
('Decisions, loops and functions: choosing the right shape',2,1,'=',false),
('Decisions, loops and functions: choosing the right shape',2,2,'==',true),
('Decisions, loops and functions: choosing the right shape',2,3,':=',false),
('Decisions, loops and functions: choosing the right shape',2,4,'->',false),
('Decisions, loops and functions: choosing the right shape',3,1,'Which language should I write it in',false),
('Decisions, loops and functions: choosing the right shape',3,2,'Whether it runs a fixed number of times, until something happens, or forever',true),
('Decisions, loops and functions: choosing the right shape',3,3,'How many lines the loop body will have',false),
('Decisions, loops and functions: choosing the right shape',3,4,'Whether it should be a for or a while',false),
('Decisions, loops and functions: choosing the right shape',4,1,'To make a program run faster',false),
('Decisions, loops and functions: choosing the right shape',4,2,'To give a block of work a name, and the values it needs',true),
('Decisions, loops and functions: choosing the right shape',4,3,'To reduce the number of lines in a file',false),
('Decisions, loops and functions: choosing the right shape',4,4,'To store data between runs',false),
('Decisions, loops and functions: choosing the right shape',5,1,'It runs faster',false),
('Decisions, loops and functions: choosing the right shape',5,2,'So it can be understood, tested and reused on its own',true),
('Decisions, loops and functions: choosing the right shape',5,3,'Because global variables are not allowed',false),
('Decisions, loops and functions: choosing the right shape',5,4,'To reduce memory use',false),
('Decisions, loops and functions: choosing the right shape',6,1,'The program fails to start',false),
('Decisions, loops and functions: choosing the right shape',6,2,'The wrong result appears many times, because the mistake now repeats too',true),
('Decisions, loops and functions: choosing the right shape',6,3,'Nothing happens at all',false),
('Decisions, loops and functions: choosing the right shape',6,4,'The loop stops immediately',false),
('Decisions, loops and functions: choosing the right shape',7,1,'Add a counter and run it to find out',false),
('Decisions, loops and functions: choosing the right shape',7,2,'Run it until it stops, and see',false),
('Decisions, loops and functions: choosing the right shape',7,3,'Do not write it yet: the condition is not understood well enough',true),
('Decisions, loops and functions: choosing the right shape',7,4,'Guess, then check the result',false),
('Decisions, loops and functions: choosing the right shape',8,1,'A box with a label on it',false),
('Decisions, loops and functions: choosing the right shape',8,2,'A name bound to a value',true),
('Decisions, loops and functions: choosing the right shape',8,3,'A column in a table',false),
('Decisions, loops and functions: choosing the right shape',8,4,'A fixed piece of storage in the program',false)
) as v(qtitle, qpos, pos, opt, correct)
join public.quizzes q on q.title = v.qtitle
join public.courses c on c.id = q.course_id and c.slug = 'programming-foundations'
join public.quiz_questions qq on qq.quiz_id = q.id and qq.position = v.qpos
where not exists (select 1 from public.quiz_options qo where qo.question_id = qq.id and qo.position = v.pos);

update public.quizzes set status = 'published'
where course_id = (select id from public.courses where slug = 'programming-foundations');

commit;