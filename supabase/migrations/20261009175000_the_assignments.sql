-- The twelve assignments.
--
-- One anchored to module 2 and one to module 3 in each course, so the work arrives
-- after the teaching rather than alongside it. An assignment in module 1 would ask for
-- work before the material exists.
--
-- Deadlines are relative to the moment this runs. A fixed date would be correct on the
-- day it was written and expired on every rebuild after it.
--
-- On attachments: the assignments table has no attachment column, and adding one would
-- change an interface the services and admin screens already read. The material supplied
-- with an assignment is the resource set on the lessons of its module, which the student
-- can read and download. The file side of the workflow lives on the submission:
-- assignment_submissions.file_path carries the work the student uploads. Both halves of
-- the workflow are real, and neither needed a new column.
--
-- The instructions are long on purpose. Each one states what is being marked and, in most
-- cases, which mistake loses the marks, because an assignment that only says "submit
-- something" cannot be graded consistently between two instructors.

begin;

insert into public.assignments
  (course_id, module_id, title, instructions, due_at, max_points, status, created_by)
select c.id, m.id, v.title, v.instructions,
       now() + make_interval(days => v.due_days),
       v.points, 'published'::public.assignment_status, c.created_by
from (values
('programming-foundations','Values, types and decisions','Decision table exercise',14,50,
$q$Write a program that decides a grade from a score.

Requirements
1. Ask for a score between 0 and 100.
2. Print one of: Distinction (90 and above), Pass (70 to 89), Resit (60 to 69), Fail (below 60).
3. Reject anything outside 0 to 100 with a clear message, and do not print a grade.

What is being marked
- The boundaries are right. 90 is a Distinction and 89 is not; 70 is a Pass and 69 is not.
  Off-by-one errors on the boundaries are the most common mistake here.
- The out-of-range check happens BEFORE the grading, not after.
- The conditions read as questions a person could answer out loud.

Submit your source file. Add a comment for each of the four boundaries explaining which
side of it that score falls on.
$q$),
('programming-foundations','Repetition and functions','A number-reporting program',21,100,
$q$Write one program that reads a list of whole numbers and reports on them.

Requirements
1. Read ten whole numbers from the user.
2. Report how many are even and how many are odd.
3. Report the average, to two decimal places.
4. Report the largest and the smallest.
5. Handle it correctly when every number entered is the same.

Structure requirements
- The even-or-odd test must be a FUNCTION, not an inline expression. The grader will
  check that the rule exists in exactly one place.
- Use a LOOP to walk the list, not repeated blocks of code.
- Name your variables so the code reads like a sentence: total, largest, even_count.

Before you submit, run it with these inputs and confirm each result is what you expect:
  all equal numbers
  all odd numbers
  negative numbers

Explain in one paragraph how your code would behave if the user entered a letter instead
of a number.
$q$),
('python-for-data-analysis','Working with tabular data','Clean and profile a dataset',14,100,
$q$You are given a CSV export with a deliberately poor record. Clean it and describe what
you found.

Requirements
1. Load it and report its shape and column types BEFORE changing anything.
2. Find and list every problem: missing values, duplicates, values outside their
   plausible range, and columns whose type is wrong.
3. Fix each one, and say which fix you chose and WHY. The reasoning is marked, not just
   the result.
4. Re-export the cleaned file.

The part that matters most
An empty cell in your dataset may mean "not recorded", "not applicable", or "not yet".
These need different treatment. Say which one you concluded each empty value was, and
what evidence led you there. Filling every empty cell with the same default is the answer
that loses marks.

Submit the cleaned file and a short written report.
$q$),
('python-for-data-analysis','Summarising and reporting','An analysis someone else can read',28,100,
$q$Produce an analysis of the dataset you cleaned, aimed at someone who has never seen it.

Requirements
1. Two or three questions worth asking, and why each is worth asking.
2. For each: the grouping or join, and the resulting table.
3. One chart per question, chosen to suit the question rather than to look impressive.
4. A written conclusion of no more than 200 words per question.
5. A short paragraph on what your analysis cannot tell you.

Check yourself before submitting
- Does every join preserve the row count you intended?
- Does any conclusion rest on an average of averages?
- Can someone read each chart title and understand the point without reading the body?
- Is your conclusion something you can defend if challenged?

Submit the notebook or script, the charts, and the written conclusion.
$q$),
('computer-networking-essentials','Addressing and naming','Address a network',14,50,
$q$You are given this brief: a new office needs a network for 60 devices on one floor,
divided into three departments. Each department should be on its own subnet.

Requirements
1. Choose a prefix length for each department subnet and justify it.
2. Write out one subnet address, the first and last usable host address, and the
   broadcast address for each department.
3. State the range of addresses available to servers, excluding the first and last usable
   addresses in each subnet.
4. Give one address you could use for a default gateway, and say which subnet it belongs to.

The part that is marked most heavily
Justify the prefix from the number of devices the department actually needs, and write
the justification down. An answer with no working shown scores less than a correct answer
with working shown, even if the numbers are wrong.
$q$),
('computer-networking-essentials','DNS, routing and troubleshooting','Diagnose a reported fault',21,75,
$q$A user reports: "the internet is down". Their laptop has an address and a colleague two
desks away is working fine on the same network.

Work the diagnostic order from the lesson and produce a numbered plan.

Requirements
1. Six checks, in order, each with the specific command or observation that performs it.
2. For each check, state what a PASS result rules out.
3. State what you would do next if each check FAILED, and how you would confirm the fix.
4. State which single result would tell you the fault is at this user machine rather than
   on the network.

Marking note
Answers that change several things before retesting score poorly, however likely the
change is to be the fix. The discipline is the point of this assignment.
$q$),
('security-plus-exam-preparation','Threats and vulnerabilities','Threat assessment of a small office',14,100,
$q$Assess the security of a 12-person office: four Windows workstations, one file server,
a router, and staff who all travel with a laptop.

Requirements
1. List the assets worth protecting, and rank them by what they would cost the business.
2. List the threats you consider realistic, and for each one say which vulnerability it
   would exploit.
3. Rank your top five risks by likelihood multiplied by damage. Show the working.
4. Propose one control for each of your top five, and say which of vulnerability, threat,
   or exposure it actually addresses.
5. State which single risk you would deliberately NOT address in this cycle, and why.

The part that is marked most heavily
Keeping vulnerability, threat, risk and control apart. A control that patches a
vulnerability is not the same as a control that changes behaviour, and saying which you
are doing is the skill the exam tests.
$q$),
('security-plus-exam-preparation','Security operations and the exam','Write an incident response plan',28,100,
$q$Write the incident response plan for the office in the previous assignment, on the
assumption that a workstation has been found to contain malware.

Requirements
1. All six phases in order, with the specific action taken in each.
2. For containment: what you stop spreading first, what you deliberately leave running,
   and why you are willing to trade availability for less damage.
3. For eradication: the full list of what must be removed before recovery. Name the step
   that is most often skipped and say what happens if it is.
4. For recovery: how you will confirm the restore is clean, and how long you will watch.
5. For lessons learned: three questions that would genuinely change the plan.
6. A contacts list, and a note on what to do when the person you need is unreachable.

Marking note
The plan is judged on order and on what each step rules out, not on length. A plan that
goes straight from containment to recovery is the most common failure and loses marks
however thorough the rest of it is.
$q$),
('it-support-essentials','Diagnosing and fixing','Diagnose three faults',10,50,
$q$You are handed three reports. For each one, write the steps you would take, in order,
without touching any hardware.

Report A: "My computer shuts down when I am working on anything big."
Report B: "Word will not open this morning. It worked yesterday."
Report C: "My laptop is really slow lately, and it is getting worse."

For each report
- Your single most likely cause, and why that one.
- The first thing you check, and what each outcome would mean.
- The test you would run, chosen to distinguish between your hypotheses rather than
  because it is most likely to work.
- What you would write in the ticket if the first attempt did not fix it.

Marking note
Report B is testing whether you ask what changed before you start replacing things.
Report C is testing whether you look for several small causes rather than one large one.
$q$),
('it-support-essentials','Working with people','Write a fix someone else can follow',21,75,
$q$Take Report A from the previous assignment and write the record that would be left
behind if you left the organisation the next day.

Requirements
1. What you changed, in plain words, addressed to a colleague rather than to a manager.
2. What you deliberately did NOT change, and why.
3. The verification: what you observed that told you the fix worked. Not "the fix worked".
4. What you would try next if the same report came back.
5. The question you asked the reporter that turned out to matter, and why.

Marking note
This assignment is graded on whether somebody else could pick up the ticket from your note
without contacting you. If your note contains a word only you would understand, rewrite it.
$q$),
('web-fundamentals','Presentation with CSS','Build a responsive card layout',14,75,
$q$Build a layout of six cards from supplied content, at three widths: wide, medium and
narrow.

Requirements
1. Normal flow at the widest width. Reach for flexbox or grid only where normal flow is
   genuinely the wrong tool, and say where and why.
2. The cards reflow at the medium and narrow widths. Write a different arrangement, not a
   shrunken version of the wide one.
3. Support text zoom to 200 percent without losing content or overlapping elements.
4. Support right-to-left. No physical left and right anywhere in your stylesheet.
5. Semantic markup throughout: no div chosen for something a real element describes.

Check before you submit
- Zoom to 200 percent and read every card. Is any text clipped?
- Narrow the window until it is a phone width. Is any content unreachable?
- Turn on a screen reader. Can you navigate by heading?

Submit the page, its stylesheet, and one paragraph on which layout method you used where,
and why.
$q$),
('web-fundamentals','Behaviour with JavaScript','A filter page that handles no matches',28,100,
$q$Build a page that filters a list of items as the user types.

Requirements
1. An input, a list of at least eight items, and an empty-state message.
2. Filtering is case-insensitive.
3. When nothing matches, the page says so. This case is the one most implementations
   omit and it is marked heavily.
4. A visible result count, so the user can tell a filter from a broken page.
5. Look each element up once and hold the reference.
6. The listener is removed when the view is torn down, and you can say where.

Testing you must perform and record
- empty search shows all items
- a capital letter matches the same item as a lower one
- a search with no matches shows the empty-state message and zero results
- searching for something impossible leaves the page intact and usable
- a second character narrows the results further rather than replacing them

Submit the page, the script, and your test results with what you observed for each case.
$q$)
) as v(course_slug, module_title, title, due_days, points, instructions)
join public.courses c on c.slug = v.course_slug
join public.modules m on m.course_id = c.id and m.title = v.module_title
where not exists (
  select 1 from public.assignments a
  where a.course_id = c.id and a.title = v.title
);

commit;

-- Two published assignments per course, each anchored to a module of its own course,
-- each with instructions and a deadline that is still in the future, and none of them
-- placed in the first module.
do $$
declare v_bad text;
begin
  select string_agg(slug, ', ') into v_bad
  from (
    select c.slug,
           (select count(*) from public.assignments a
             where a.course_id = c.id and a.status = 'published') as n
      from public.courses c
  ) s where s.n <> 2;
  if v_bad is not null then
    raise exception 'course without exactly two published assignments: %', v_bad;
  end if;

  select string_agg(a.title, ', ') into v_bad
  from public.assignments a
  where a.status <> 'published'
     or a.instructions is null or btrim(a.instructions) = ''
     or a.due_at is null
     or a.due_at <= now()
     or a.module_id is null
     or not exists (select 1 from public.modules m
                     where m.id = a.module_id and m.course_id = a.course_id)
     or exists (select 1 from public.modules m
                 where m.id = a.module_id and m.position = 1);
  if v_bad is not null then
    raise exception 'assignment is not deliverable: %', v_bad;
  end if;
end;
$$;