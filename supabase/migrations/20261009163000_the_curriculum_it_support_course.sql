-- IT Support Essentials: modules and lessons.
--
-- Kept in its own file because it is a small course, and because a single large
-- values list of long prose is where a mismatched dollar-quote tag goes unnoticed:
-- an unterminated tag makes the NEXT tuple look like a syntax error several hundred
-- lines away from the actual mistake. Splitting the rebuild into per-course files keeps
-- each one reviewable on its own.

begin;

insert into public.modules (course_id, title, description, position, status)
select c.id, v.title, v.description, v.position, 'published'::public.content_status
from (values
  ('it-support-essentials','The support environment',
   'The hardware, software and records you will meet on a support desk.',1),
  ('it-support-essentials','Diagnosing and fixing',
   'A repeatable method for finding a fault, and the common ones you will meet first.',2),
  ('it-support-essentials','Working with people',
   'The part of the job that is not technical, and the part that prevents it recurring.',3)
) as v(course_slug, title, description, position)
join public.courses c on c.slug = v.course_slug
where not exists (select 1 from public.modules m where m.course_id = c.id and m.title = v.title);

insert into public.lessons
  (module_id, title, summary, content, lesson_type, position, duration_minutes,
   is_required, is_preview, status)
select m.id, v.title, v.summary, v.content,
       'article'::public.lesson_type, v.position, v.minutes,
       true, v.is_preview, 'published'::public.content_status
from (values
('The support environment','Hardware you will actually meet',
 'The parts of a machine, what each one does, and how to tell which one is failing.',
$q$The parts are not mysterious, and each has a failure signature worth knowing.

Storage is the usual suspect, because it fails slowly rather than suddenly. A drive with bad sectors will read almost everything and fail on particular files, which produces a pattern of specific documents refusing to open rather than an obvious error. A solid state drive fails differently, usually by stopping entirely, and gives no warning at all.

Memory faults are intermittent by nature. They produce crashes that happen at particular times or with particular applications, and the machine may pass a memory test on the second run, which is what makes them so frustrating.

Overheating looks like every other fault and is the one most often misdiagnosed. It presents as random shutdowns under load, and the cause is dust, a failed fan, or a blocked vent.

Power supplies fail in a way that looks like everything failing at once, because the whole machine dies rather than one part. The parts are not the parts; the supply is.

Knowing these signatures turns a vague report into a hypothesis, which is the difference between testing and guessing.
$q$,15,true,1),
('The support environment','Operating systems and the software on top',
 'What an operating system is responsible for, and why software faults follow patterns.',
$q$An operating system manages the hardware and gives everything above it a consistent interface. Applications do not touch the disk or the network directly; they ask the operating system, which is why a permission problem is an operating system problem even when the symptom appears to be in the application.

The pattern to recognise is that software faults are far more often configuration and permission than actual damage. A file that will not open is often a permissions problem. An application that will not start is often a corrupt setting rather than a corrupt program. A machine that will not update is usually something holding a file open.

That distinction changes what you do. Software faults are reversible and cheap to try, which is why support should exhaust them before suspecting hardware. Doing it the other way round costs more and finds less.
$q$,15,false,2),
('The support environment','Documentation, assets and ticketing',
 'Records that make support possible, and why they are written for the next person.',
$q$Documentation is what makes a support desk work rather than become a bottleneck of one experienced person.

An asset record says what each device is, what is installed on it, and who has it. Without that, the first question of every ticket cannot be answered without physically visiting the machine, and a simple problem takes a day.

A ticket should capture who is affected, what they observed, when it started, and what was already tried. The last field is the one most often left empty and the most valuable, because it stops the next person repeating the work.

Write for the reader who is not you. A note that says it made no difference is worth more than a note that says it did not work, because the first one tells the next person where not to look.
$q$,13,false,3),
('Diagnosing and fixing','A repeatable diagnostic method',
 'Confirm the symptom, form one hypothesis, test it, and record what happened.',
$q$The method matters more than any specific fix, because the fixes change with every platform and the method does not.

Confirm the symptom before changing anything. Ask what they observed, when it started, and whether anything changed just before. Half of all tickets are solved by learning that nothing changed, or that something specific changed right before the problem appeared.

State one hypothesis at a time. Not several at once. Two simultaneous changes and a successful outcome tell you nothing about which mattered, and you have learned nothing for next time.

Test the cheapest thing that would distinguish between the hypotheses you have. Not the thing most likely to fix it; the thing that would tell you whether you were right.

Record what you did and what happened, including the attempts that failed. That record is what stops the next person starting where you started.
$q$,18,false,1),
('Diagnosing and fixing','Common hardware faults',
 'Recognising the usual hardware faults and reaching for the right fix.',
$q$No power at all means the supply, the cable, or the switch. Test with something known to work before assuming the machine is broken, because the cheap explanations are far more often the correct ones.

A machine that powers on and immediately restarts is very often memory. Remove one module at a time and see whether the behaviour changes. The machine may work with half the memory installed, which tells you the fault and tells you the machine is not entirely dead.

A machine that runs hot and shuts down is ventilation. Confirm the temperature before opening anything, and check the fans are actually spinning, which costs nothing and is the fix surprisingly often.

Storage faults: check the drive health first, before reinstalling anything. Reinstalling an operating system onto a failing drive destroys the evidence and takes an afternoon to do.

The rule across all of them: confirm before replacing. Parts get swapped by guesswork, the wrong part gets fitted, and the machine is now in a worse state than when it arrived.
$q$,17,false,2),
('Diagnosing and fixing','Common software faults',
 'The software problems that make up most of a support queue, and their usual causes.',
$q$An application that will not start is usually a setting or a corrupt user profile rather than the program itself. Clearing the configuration is a fast, safe test that resolves a large share of these.

Something that worked yesterday and does not work now was changed by an update, an extension, or something installed alongside it. Check what was installed most recently before you check anything else. The answer is usually there and it costs one question.

Performance problems are rarely one thing. Usually several small things accumulate, and they accumulate because each one was individually below the threshold where anyone acted on it.

Malware presents as slowness, pop-ups, and changed browser settings. It is also the most over-reported fault in support, and a large share of reports turn out to be pop-ups the person agreed to install. That is a training problem, not a technical one, and the fix is the same in both cases.
$q$,16,false,3),
('Working with people','Asking questions that find the fault',
 'Turning a vague report into something specific enough to act on.',
$q$Most bad tickets start with a description that cannot be acted on. The computer is broken does not tell you what to do next.

What does: what they saw, on which device, when it started, and whether anything changed just before. Four questions, asked calmly, resolve most of the ambiguity in one exchange.

Ask about scope before you start. Is this the only machine, or several? Does it happen for one user, or everyone? Has anyone been able to work around it? The answers usually identify the layer straight away, and they take thirty seconds to obtain.

Most importantly, ask open questions. What were you doing when it happened? rather than can you reproduce it? invites the detail that identifies the fault, and the closed version only ever produces yes.

Never make the reporter feel they are being blamed for the fault. The fastest way to get a useful answer is for the person to believe it is worth giving.
$q$,15,false,1),
('Working with people','Writing a fix someone else can follow',
 'Recording what you did so the work survives you and the person who asked.',
$q$A record of a fix has two readers: the person who asked, and whoever gets the same ticket next month. The first needs a confirmation and the second needs a method.

Start with what you changed, in plain words, and include anything you deliberately did not change. That last part prevents the next person from redoing the experiment you already ruled out.

Include the verification. Not that the fix worked, but what you observed that told you it worked. Otherwise nobody can tell whether a later problem is the same problem returning.

Keep it in the ticket rather than in your head or a private note. A fix that lives with one person is a fix that will be rediscovered from scratch next term.

This is unglamorous work, and it is most of what makes a support desk consistent rather than dependent on whoever happens to be on shift.
$q$,14,false,2),
('Working with people','Preventing the same ticket twice',
 'Fixing the cause rather than the ticket, and knowing which problems deserve it.',
$q$Solving a ticket and eliminating a ticket are different jobs, and only the second one scales.

Some tickets should not be eliminated. A genuinely broken cable is a broken cable. Spend the effort on problems where the same cause keeps producing new tickets.

The usual cause is user action rather than hardware failure: the same unsupported software installed on three machines by three people. Training, a deployment policy, or simply distributing the supported version all solve this permanently, and none of them is a hardware repair.

Look for patterns across tickets rather than within one. One ticket is an incident. The same ticket from three people is a process that is failing.

After a batch of related tickets, ask what would have stopped them happening, and do that thing even though nobody is waiting on it any more. It is the only work in support that reduces the queue rather than keeping pace with it.
$q$,15,false,3)
) as v(module_title, title, summary, content, minutes, is_preview, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id
where c.slug = 'it-support-essentials'
  and not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);

commit;