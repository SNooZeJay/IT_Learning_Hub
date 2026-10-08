-- supabase/seed.sql — demonstration curriculum.
--
-- Not a migration. This is demo content, and it is idempotent enough to re-run:
-- every insert is guarded on the row not already existing, so applying it twice
-- does not duplicate the course outline.
--
-- Why it exists: `modules`, `lessons` and `lesson_materials` shipped empty.
-- `lesson_materials` had never held a single row, so the feature had never run.
-- A demonstration of a content system needs content in it.
--
-- The shape follows the old Laravel system, which is the functional reference:
-- a course is a sequence of modules, each holding a sequence of lessons, each
-- lesson carrying materials of several kinds. Lesson summaries are the thing the
-- old outline relied on to be scannable and the new one keeps.

-- ===========================================================================
-- Introduction to Programming — 3 modules, 6 lessons
-- ===========================================================================

insert into public.modules (course_id, title, description, position, status)
select c.id, v.title, v.description, v.position, 'published'
from (values
  ('Introduction to Programming', 'Getting a program to run', 1,
   'How a computer reads instructions, and what happens between typing a line and seeing its output.'),
  ('Introduction to Programming', 'Values, types and variables', 2,
   'The nouns a program manipulates, and the rules that decide what each one can do.'),
  ('Introduction to Programming', 'Making decisions and repeating work', 3,
   'Control flow: choosing between paths, and doing the same thing again without copying yourself.')
) as v(course_title, title, description, position)
join public.courses c on c.slug = 'introduction-to-programming'
where not exists (select 1 from public.modules m where m.course_id = c.id and m.title = v.title);


insert into public.lessons (module_id, title, summary, content, lesson_type, position, duration_minutes, is_required, status)
select m.id, v.title, v.summary, v.content, 'article', v.position, v.minutes, true, 'published'
from (values
  ('Getting a program to run', 'What a program actually is', 'Instructions in order, and why the order is the whole idea.',
   E'A program is a list of instructions, and the computer follows them strictly from top to bottom. It does not understand what you meant; it does exactly what you wrote.\n\nThat sounds obvious, and it is the reason programming feels strange at first. When something does not work, the computer is not being difficult. It is being literal.\n\nThree things happen every time you run a program:\n\n1. The source you wrote is read and turned into something the machine can execute.\n2. Each instruction is carried out in order.\n3. The result is shown to you.\n\nThere is no fourth step. Nothing is inferred, and nothing is corrected on your behalf.',
   12, 1),
  ('Getting a program to run', 'Your first program', 'Writing and running something trivial on purpose.',
   E'The smallest useful program prints one line.\n\nWe start here because removing every possible distraction makes the remaining parts obvious. Later you will add input, decisions and repetition, and each one will have a single job.\n\nWhen a program does not do what you expect, check three things in this order:\n\n- Did it run the line you thought it ran?\n- Did the line do what you thought it did?\n- Did you check the result, or assume it?\n\nAlmost every confusing first hour is a skipped third step.',
   8, 2),
  ('Values, types and variables', 'Values and the types that describe them', 'Every piece of data has a type, and the type decides what you can do with it.',
   E'A value is a piece of data. Its type is the label that says what kind of data it is and therefore which operations are meaningful.\n\nAdd two numbers and you get a number. Add a number to a piece of text and you get a concatenation, which is almost never what anybody meant.\n\nThis is not pedantry. Types are how the computer catches a whole class of mistake before the program runs, and reading a type is often the fastest way to understand what a value really is.',
   15, 1),
  ('Values, types and variables', 'Variables and assignment', 'Giving a name to a value so you can refer to it later.',
   E'A variable is a name bound to a value. Assignment creates or replaces that binding.\n\nThe most common early misunderstanding is that a variable is a box with a label on it. It is better thought of as a name you have written down for a value: two names can point at the same value, and reassigning one does not change the other.\n\nThis matters as soon as you pass values between functions, which is very soon.',
   14, 2),
  ('Making decisions and repeating work', 'Decisions: if, else, and comparison', 'Choosing between paths based on a condition.',
   E'A conditional runs a block only when a condition is true.\n\nThe condition has to be a question with a yes-or-no answer. Anything else is usually a sign that the question is written badly, and it is worth rewriting before adding an else.\n\nComparison operators differ from arithmetic ones in a way that catches everyone once: equality is two equals signs, not one. A single equals sign is assignment.',
   16, 1),
  ('Making decisions and repeating work', 'Repetition: loops', 'Doing the same thing again without copying yourself.',
   E'A loop runs a block repeatedly until a condition stops it.\n\nBefore writing a loop, be precise about which of three things is true: run this many times, run until this happens, or run forever. Each is a different loop, and picking the wrong one produces code that is hard to reason about.\n\nLoops are where most real programs get their power, and where most early bugs live, because they are the first place a mistake repeats itself.',
   18, 2)
) as v(module_title, title, summary, content, minutes, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id and c.slug = 'introduction-to-programming'
where not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);


-- ===========================================================================
-- Networking Fundamentals — 2 modules, 2 lessons
-- ===========================================================================

insert into public.modules (course_id, title, description, position, status)
select c.id, v.title, v.description, v.position, 'published'
from (values
  ('Networking Fundamentals', 'How a packet crosses a network', 'From one machine to another, and everything in between.',
   'The journey of a single piece of data, and the equipment that moves it.'),
  ('Networking Fundamentals', 'Addresses, names and the DNS', 'How a human-readable name becomes a routable address.',
   'Why the internet can be used by people who do not know any numbers.')
) as v(course_title, title, description, position)
join public.courses c on c.slug = 'networking-fundamentals'
where not exists (select 1 from public.modules m where m.course_id = c.id and m.title = v.title);


insert into public.lessons (module_id, title, summary, content, lesson_type, position, duration_minutes, is_required, status)
select m.id, v.title, v.summary, v.content, 'article', v.position, v.minutes, true, 'published'
from (values
  ('How a packet crosses a network', 'Packets, switches and routers', 'Data is cut into packets, and each device has exactly one job.',
   E'When a machine sends data, it does not send it as one continuous stream. It is cut into packets, each carrying a piece of the payload and the addresses needed to deliver it.\n\nA switch moves packets within one local network. A router moves them between networks. Conflating the two is the usual reason new learners think "the internet" is one enormous machine.\n\nPackets travel independently and may arrive out of order, which is why the reassembly step exists at all.',
   20, 1),
  ('Addresses, names and the DNS', 'IP addresses and DNS lookup', 'Turning a name into an address, and what happens when it fails.',
   E'An IP address is what the network routes on. A domain name is what people read.\n\nThe Domain Name System translates one into the other. A lookup usually involves several steps, and each can be cached at a different level, which is why a name that worked a minute ago can fail.\n\nWhen people say "the internet is down", they usually mean DNS is failing and the network underneath is fine.',
   18, 2)
) as v(module_title, title, summary, content, minutes, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id and c.slug = 'networking-fundamentals'
where not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);


-- ===========================================================================
-- Advanced Python Development — give the paid course a real curriculum
-- ===========================================================================

insert into public.lessons (module_id, title, summary, content, lesson_type, position, duration_minutes, is_required, status)
select m.id, v.title, v.summary, v.content, 'article', v.position, v.minutes, true, 'published'
from (values
  ('Objects and testing', 'Objects, testing and packaging', 'Turning a working script into something you can rely on.',
   E'A script that runs once on your machine is not finished. It is unmeasured.\n\nObjects give you somewhere to put behaviour that would otherwise sprawl across functions. Testing gives you evidence that a change did not break anything. Packaging gives other people a way to run it at all.\n\nThe order is deliberate: each step makes the next one cheap.',
   25, 1)
) as v(module_title, title, summary, content, minutes, position)
join public.modules m on m.title = v.module_title
join public.courses c on c.id = m.course_id and c.slug = 'advanced-python'
where not exists (select 1 from public.lessons l where l.module_id = m.id and l.title = v.title);


-- ===========================================================================
-- Materials — all seven types, so the feature is exercised rather than assumed.
-- ===========================================================================

insert into public.lesson_materials (lesson_id, title, material_type, content_text, external_url, file_path, file_size, file_type, position, uploaded_by)
select l.id, v.title, v.material_type, v.content_text, v.external_url, v.file_path, v.file_size, v.file_type, v.position, u.id
from (values
  -- text: prose shown inline on the lesson page
  ('What a program actually is', 'Reference: order of execution',
   'text'::public.material_type,
   E'The evaluation order that explains most first-program bugs:\n\n1. Expressions are evaluated before the instruction that uses them.\n2. Assignment happens after the right-hand side has a value.\n3. Instructions run strictly top to bottom.\n4. Nothing runs twice unless you ask for it to.',
   null, null, null, null, 1),

  -- code: monospace, whitespace preserved
  ('What a program actually is', 'Starter file',
   'code'::public.material_type,
   E'# first_program.py\n\ndef greet(name: str) -> str:\n    return f"Hello, {name}"\n\n\nif __name__ == "__main__":\n    print(greet("world"))',
   null, null, null, null, 2),

  -- external_link: full URL, opens in a new tab
  ('Values and the types that describe them', 'Python docs: the numeric types',
   'external_link'::public.material_type, null,
   'https://docs.python.org/3/library/stdtypes.html#numeric-types-int-float-complex', null, null, null, 1),

  -- video_link
  ('Comparing values', 'Recorded walkthrough',
   'video_link'::public.material_type, null,
   'https://www.youtube.com/watch?v=dQw4w9WgXcQ', null, null, null, 1),

  -- Materials a learner can actually open.
  --
  -- These were `image` / `pdf` / `document` rows pointing at
  -- `lesson-materials/<name>`, which cannot resolve twice over: the key repeats the bucket
  -- name, so signing it asks for `lesson-materials/lesson-materials/<name>`, and this seed
  -- never uploaded an object at all. Every one of them was a dead download advertised as
  -- a file. See `20261008150000_seeded_materials_pointed_at_files_that_do_not_exist.sql`.
  --
  -- A real `external_link` to a real reference is what this project can honestly offer,
  -- because it stores no binaries.
  ('Packets, switches and routers', 'Packet lifecycle diagram',
   'external_link'::public.material_type, null,
   'https://www.cloudflare.com/learning/network-layer/what-is-the-network-layer/',
   null, null, null, 1),
  ('Packets, switches and routers', 'Reference sheet',
   'external_link'::public.material_type, null,
   'https://www.rfc-editor.org/rfc/rfc791',
   null, null, null, 2),
  ('IP addresses and DNS lookup', 'DNS troubleshooting checklist',
   'external_link'::public.material_type, null,
   'https://www.cloudflare.com/learning/dns/what-is-dns/',
   null, null, null, 1)
) as v(lesson_title, title, material_type, content_text, external_url, file_path, file_size, file_type, position)
join public.lessons l on l.title = v.lesson_title
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
join public.profiles p on p.id = c.created_by
join auth.users u on u.id = p.id
where not exists (
  select 1 from public.lesson_materials lm where lm.lesson_id = l.id and lm.title = v.title
);
