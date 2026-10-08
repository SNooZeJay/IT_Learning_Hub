-- The two programming courses: modules, lessons and their prose.
--
-- Every lesson is an article. The instructor editor offers a "free preview" checkbox and
-- `lessons.video_url`, but a video is an external link here rather than the lesson
-- itself: the requirement is text-based lessons with accurate written content, and an
-- optional external video. So `lesson_type` is 'article' and any video lives in
-- lesson_materials as a `video_link`, which is what check_material_shape expects.
--
-- Lessons are keyed on (module title, lesson title) and inserted only when absent, so
-- the file re-applies without duplicating the outline.

begin;

insert into public.modules (course_id, title, description, position, status)
select c.id, v.title, v.description, v.position, 'published'::public.content_status
from (values
  ('programming-foundations','How a program runs',
   'What happens between writing a line and seeing its output, and why the order of those steps is the whole idea.',1),
  ('programming-foundations','Values, types and decisions',
   'The things a program manipulates, the rules that describe them, and how a program chooses between paths.',2),
  ('programming-foundations','Repetition and functions',
   'Doing the same work again without copying yourself, and packaging logic so it can be reused.',3),
  ('python-for-data-analysis','Python beyond the basics',
   'The data structures that carry most real work, and the standard library you get for free.',1),
  ('python-for-data-analysis','Working with tabular data',
   'Loading data from a file, narrowing it down, and cleaning the parts that are wrong.',2),
  ('python-for-data-analysis','Summarising and reporting',
   'Grouping, joining and charting, and putting the result somewhere someone else can read it.',3)
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
('How a program runs','What a program actually is','Instructions in order, and why being literal is not a computer failing.',
$q$A program is a list of instructions, and the machine follows them strictly from top to bottom. It has no idea what you meant. It does exactly what you wrote, including the parts you got wrong.

That sounds obvious, and it is the reason programming feels strange at first. When something does not work, the computer is not being difficult. It is being literal.

Three things happen on every run. First, the source you wrote is read and translated into instructions the machine can execute. Second, each instruction is carried out, in order. Third, the result is shown to you.

There is no fourth step. Nothing is inferred, and nothing is corrected on your behalf.

A useful consequence: when a program does something surprising, the cause is always somewhere in those instructions. It is never in what the program meant. Looking for the intended behaviour in the code wastes time, because the intended behaviour was never in there.
$q$,12,true,1),
('How a program runs','Running your first program','Writing something trivial on purpose, and learning to read what comes back.',
$q$The smallest useful program produces one piece of output. We start there on purpose: strip away every possible distraction and whatever remains is the part that actually matters.

In Python this is one line. You type it, you run it, and the output appears underneath.

The habit worth forming now is checking the result rather than assuming it. When a program does not do what you expect, work through three questions in this order. Did it run the line you thought it ran? Did that line do what you thought it did? Did you look at the output, or assume it?

Almost every confusing first hour is a skipped third step. You wrote something, you believed what it would print, and you never looked.

Once one line works, you are no longer writing theory. You are writing software.
$q$,10,false,2),
('How a program runs','The three errors you will meet first','Syntax, runtime and logic errors, and what each one is telling you.',
$q$Three kinds of failure show up early, and confusing them costs hours. It is worth learning the difference early.

A syntax error means the program could not be read at all. Something is malformed: a missing bracket, a missing colon, a keyword spelled wrong. Nothing ran. The program stopped before it started.

A runtime error means the program was read fine and stopped partway through, when it hit something it cannot do. Dividing by zero, or converting text into a number that is not one.

A logic error means the program ran to completion, produced output, and the output is wrong. Nothing crashed. This is the dangerous one, because it looks exactly like success, and only a person who knows what the right answer should be can tell.

Read the error message. It almost always names the line, and it almost always tells you what it wanted. Treating an error message as the answer rather than as a clue is the most expensive habit a beginner can pick up.
$q$,14,false,3),
('Values, types and decisions','Values and the types that describe them','Every piece of data has a type, and the type decides what you can do with it.',
$q$A value is a piece of data. Its type is the label that says what kind of data it is, and therefore which operations make sense on it.

Add two numbers and you get a number. Add a number to some text and you get a longer piece of text, which is almost never what anybody meant. The type is what stops you making that mistake by accident.

This is not pedantry. Types are how a machine catches a whole class of error before the program runs, and they are also often the fastest way to understand a value you have not looked at in a while. When a value behaves strangely, printing its type tells you more in one line than guessing its value will tell you in ten.

Two values can look identical on screen and still be different types. That difference matters more often than beginners expect, and it is worth checking when something prints in an unexpected shape.
$q$,14,false,1),
('Values, types and decisions','Variables and assignment','Giving a name to a value, and what assignment actually does.',
$q$A variable is a name bound to a value. Assignment creates that binding, or replaces it.

The early mistake here is thinking of a variable as a box with a label on it. It is closer to a name you wrote down next to a value. Two names can refer to the same value, and giving one of them a new value does not change the other.

This stops being academic very quickly. The moment values are passed into a function, or held in a list, or copied between variables, the distinction decides whether your change shows up where you expected it or somewhere else entirely.

If you take one idea from this course, take this one: a variable is a name, not a container. Most confusing bugs in early code trace back to assuming otherwise.
$q$,13,false,2),
('Values, types and decisions','Making decisions with comparison','Choosing between paths, and the operator that catches everyone once.',
$q$A conditional runs a block only when a condition is true. Its condition has to be a question with a yes-or-no answer.

If the condition is not a clear yes-or-no question, that is usually a sign the question is written badly. Rewriting it as one is often more useful than reaching for an else.

Comparison operators also differ from arithmetic ones in a way that catches every beginner at least once. Equality is two equals signs. A single equals sign is assignment, so writing one where you meant the other does not fail loudly; it quietly replaces a value and then compares it.

Before adding a branch, be able to say out loud what the condition is asking. "Is this number above the threshold" is a good condition. "Is this thing valid" is not, because you have not said what valid means.
$q$,15,false,3),
('Repetition and functions','Repeating work with loops','Running a block until something stops it, and choosing which kind of loop you meant.',
$q$A loop runs a block repeatedly until a condition stops it.

Before writing one, decide which of three things is true. Run this many times. Run until this happens. Run forever. Each is a different loop, and picking the wrong one produces code that is genuinely hard to reason about.

Loops are where most real programs get their power, and where most early bugs live, because it is the first place a mistake gets to repeat itself. One wrong line inside a loop can produce a hundred wrong results, and the first sign of trouble is usually a list longer than expected.

A loop that never terminates is the classic failure. Before running anything, count by hand how many times the body should execute. If you cannot, the loop condition is not yet understood well enough to write down.
$q$,16,false,1),
('Repetition and functions','Packaging logic into functions','Giving a block of work a name, and giving it the values it needs.',
$q$A function is a named block of work that takes values and gives back a result.

Two things make a function worth having. It has a name that describes what it does, so the code using it reads like a sentence. And it takes what it needs as parameters rather than reaching out and grabbing whatever happens to be nearby.

That second point is where programs become easy to change. A function that depends only on its arguments can be understood, tested and reused on its own. One that reads variables from wherever they happen to be is tangled with everything around it.

Write the name before you write the body. If the name is hard to write, the function is doing more than one thing, and splitting it will make both halves clearer than the whole was.
$q$,15,false,2),
('Repetition and functions','Putting it together: a small program','Combining values, decisions, loops and functions into something that does a job.',
$q$This lesson builds one program that reads a list of numbers and reports how many are even, what the average is, and which is the largest.

It uses everything so far. A loop to walk the list. A decision to test each value. A function to do the testing, so the rule for even is written once. And variables to carry the running totals between them.

Nothing here is new. That is the point of the lesson. The difficulty of a first real program is rarely any single line; it is holding several small correct ideas in your head at once and keeping them connected.

If a program of this size feels difficult, that is expected. It should feel slightly difficult. When it feels completely obvious, it is usually because something was left out.
$q$,18,false,3),
('Python beyond the basics','Lists, dictionaries and the data they hold','The two structures that carry most of the work you will do with data.',
$q$A list holds values in order. A dictionary holds key-value pairs, and looks up by key rather than by position.

Nearly everything in data work is one of these or a collection of them. Rows are lists, or dictionaries keyed by column name. Groups are dictionaries keyed by group name. Choosing wrongly here causes pain later, so it is worth being deliberate.

The practical difference is how you look things up. Position in a list, which breaks as soon as anything is inserted or removed. Key in a dictionary, which survives reordering and is usually what you actually meant.

A list of dictionaries is the shape most tabular data arrives in, and the shape most of this course assumes. Get comfortable reading one, filtering it, and counting things in it.
$q$,16,false,1),
('Python beyond the basics','Comprehensions: the same loop, written once','Building a list from an existing one in a single readable expression.',
$q$A comprehension builds a new collection from another one, doing the transform and the loop together.

It exists because the pattern of making an empty list, looping, and appending the result is everywhere, and the three-line version says less than the one-line version does.

Use it when the transformation is simple. When you need to do several things, or the condition is complicated, a normal loop is clearer, and clearer wins. A comprehension nobody can read is worse than three plain lines.

One habit worth forming: give the result a name. A comprehension that produces something meaningful and gets stored in a well-named variable documents itself. One that appears inline inside a larger expression is the kind of thing that makes people avoid comprehensions entirely.
$q$,14,false,2),
('Python beyond the basics','Modules, imports and the standard library','Reusing what already exists instead of writing it yourself.',
$q$A module is a file of Python code you can load into a program. The standard library ships with Python, so a great deal is available before installing anything.

The judgement to practise is knowing when not to write something yourself. Sorting, dates, random numbers, file paths, JSON, statistics, maths: all of it is already there, already tested, and almost always better than the version you would write in ten minutes.

Two rules that keep code readable. Import at the top, not inside a function. And import the specific thing you need rather than the whole module, so a reader can see at a glance what the file depends on.
$q$,13,false,3),
('Working with tabular data','Reading a CSV into a DataFrame','Turning a file on disk into a table you can ask questions of.',
$q$The CSV format is a deceptively simple idea: rows of text, values separated by commas. Simple formats accumulate edge cases, and the ones that will bite you are worth knowing before you hit them.

A comma inside a quoted field is not a separator. A line break inside a quoted field is not the end of a row. A file that looks tidy on screen can hold thousands of those.

Reading a CSV into a DataFrame gives you a table with rows and named columns, which means you can select columns, filter rows, group and aggregate, without writing a loop per operation.

The first thing to do after loading is look at the shape: how many rows and columns, what the column types are, and what the first few rows actually contain. Guessing at those is how a bug spends an afternoon.
$q$,17,false,1),
('Working with tabular data','Selecting, filtering and sorting rows','Narrowing a table down to the rows you care about, and putting them in order.',
$q$Filtering asks a yes-or-no question per row and keeps the ones where the answer is yes. Selecting picks columns. Sorting imposes an order.

Those three operations are how nearly every question about a table gets its first cut, and they are worth getting fluent in rather than treating as separate skills.

Two traps. A filter written as an and of three conditions is a filter that silently drops rows when one field is null, because any comparison against a missing value is false rather than an error. And a sort with no tie-breaker gives you an order that is valid but not reproducible, which is why a sorted table that looks wrong usually needs a second sort key.
$q$,16,false,2),
('Working with tabular data','Cleaning messy data','Missing values, duplicates, wrong types and impossible values.',
$q$Real data is wrong in a small number of predictable ways, and each has a fix that depends on why it is wrong rather than on what the symptom looks like.

Missing values are the subtle one. An empty cell might mean not recorded, not applicable, or not yet. Treating those three the same is how a summary quietly becomes wrong, and the error is invisible because nothing crashed.

Duplicates are usually a join that matched more than intended, or a file that was appended to twice. Wrong types usually come from a column that holds one stray value in one row, which turns the whole column into text.

Clean with intent and record what you did. An analysis where the cleaning steps are written down can be checked by someone else. One where they were done by hand cannot.
$q$,18,false,3),
('Summarising and reporting','Grouping and aggregating','Counting, summing and averaging within groups instead of over the whole table.',
$q$Grouping splits the rows into sets by the value of one or more columns, then computes something per group. Counting rows per category, or the average score per department.

It is the single most useful operation in analysis, because most real questions are questions about a subset. Not what is the average, but what is the average per group.

Three things to be careful about. Groups with no rows never appear in the result, which matters if you expect to see a zero. Counts are not the same as distinct counts, and picking the wrong one changes the answer. And averaging an average is wrong unless the groups are the same size, which they usually are not.

Check the group count before you check the numbers. A result with fewer groups than you expected is almost always the interesting finding.
$q$,17,false,1),
('Summarising and reporting','Joining two tables','Combining tables on a shared key, and knowing which kind of join you need.',
$q$A join combines two tables on a shared key. The choice of join decides what happens to rows that do not match, which is almost always the part that matters.

An inner join keeps only matching rows. A left join keeps every row from the left table and fills missing matches with nothing. Choosing inner when you meant left silently discards data, and the result still looks like a perfectly reasonable table.

Always check the row count before and after. An inner join that unexpectedly halves your table has done exactly what you asked and not what you meant. A join that produces more rows than both inputs combined means the key is not unique on one side, and you will get duplicates in your summary.

Where possible, build a small test case with three rows and check the output by hand before trusting it on real data.
$q$,18,false,2),
('Summarising and reporting','Charts and an honest report','Choosing a chart that does not mislead, and writing the conclusion down.',
$q$A chart is an argument, and most bad charts are arguments nobody intended to make.

A truncated axis exaggerates a difference that is not there. A pie chart with eleven slices compares nothing. A line drawn between two points implies a continuous trend where there are only two measurements. Each of these is easy to do by accident and hard to spot if you are close to the problem.

Pick the chart from the question. Comparing categories, bar. Change over time, line. Relationship between two quantities, scatter. Anything else usually means the question needs restating first.

Then write the conclusion in words. If you cannot say what the chart shows in a sentence, you have not understood it yet, and shipping it will move that confusion onto somebody else.
$q$,16,false,3)
) as v(module_title, title, summary, content, minutes, is_preview, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id
where c.slug in ('programming-foundations', 'python-for-data-analysis')
  and not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);

commit;