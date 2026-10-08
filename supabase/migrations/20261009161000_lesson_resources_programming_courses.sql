-- Lesson resources for the two programming courses.
--
-- Material types are limited to text, code, video_link and external_link.
--
-- The restriction is forced by check_material_shape: image, pdf and document each
-- require a `file_path` pointing at an uploaded object, and a data migration has no way
-- to upload one. A previous dataset had rows claiming to be PDFs whose paths did not
-- exist, so the four file-free types are the honest set for generated content.
--
-- uploaded_by is the course author, who is a real auth.users row.

begin;

insert into public.lesson_materials
  (lesson_id, title, file_path, material_type, content_text, external_url, position, uploaded_by)
select l.id, v.mat_title, null,
       v.mat_type::public.material_type, v.mat_content, v.mat_url, v.pos,
       c.created_by
from (values
('What a program actually is',1,'Reference: the three steps of every run','text',
$q$1. TRANSLATE - your source text becomes instructions the machine can execute.
2. EXECUTE  - each instruction is carried out, strictly in order.
3. OBSERVE   - the result is displayed to you.

There is no inference step. Nothing is corrected on your behalf. When the output
is wrong, the cause is in the instructions, never in the intent behind them.
$q$,null),
('What a program actually is',2,'Watch: CS50 Lecture 0, Scratch and Python','video_link',
null,'https://www.youtube.com/watch?v=8mAITcNt710'),
('Running your first program',1,'hello.py','code',
$q$# hello.py
# The smallest useful program: one line, one piece of output.

print("Hello, world")

# Run it, then change the text and run it again.
#
# The habit to build: change one thing, run, and READ the output.
# Skipping the reading is what makes the first hour confusing.
$q$,null),
('The three errors you will meet first',1,'Reading an error message','text',
$q$SYNTAX ERROR
  The program could not be read. Nothing ran at all.
  Typical causes: missing bracket, missing colon, misspelled keyword.
  The message points at the line and tells you what it wanted.

RUNTIME ERROR
  The program read fine and stopped partway through.
  Typical causes: dividing by zero, converting text to a number and failing.
  The message names the call and usually shows the value involved.

LOGIC ERROR
  The program ran to completion and the answer is wrong. Nothing crashed.
  Only a person who knows the correct answer can detect this one.
  Treat it as the serious case, because it looks exactly like success.
$q$,null),
('Values and the types that describe them',1,'Types you will use in Python','code',
$q$age    = 20                 # int    - whole numbers
price   = 199.50              # float  - numbers with a decimal part
name    = "Ada"               # str    - text
passed  = True                # bool   - only True or False
missing = None                # None   - the absence of a value

# The type decides which operations make sense.
print(age + 5)        # 25        - int + int is addition
print(price + 5)      # 204.5     - float + int is addition
print(name + " Lovelace")  # Ada Lovelace - str + str is joining
print(age + name)     # TypeError - and this is the type system helping you
$q$,null),
('Variables and assignment',1,'Assignment is a name, not a container','code',
$q$a = 10          # the name a now refers to the value 10
b = a             # b refers to the SAME value, not a copy
a = 20            # a now refers to 20; b is untouched and still means 10

print(a, b)        # 20 10

# This is why lists behave differently when passed around:
x = [1, 2]
y = x
x.append(3)
print(y)           # [1, 2, 3]  <- both names refer to the same list
$q$,null),
('Making decisions with comparison',1,'if, elif and else','code',
$q$score = 74

if score >= 75:
    grade = "Pass"
elif score >= 60:
    grade = "Resit"
else:
    grade = "Fail"

print(grade)       # Resit

# Two equals signs compare. One equals sign assigns - and does not complain,
# it just quietly overwrites the value before comparing it.
$q$,null),
('Repeating work with loops',1,'for and while','code',
$q$scores = [88, 92, 41, 76]

for s in scores:
    print(s)

# Which kind of loop? Decide BEFORE writing it.
#   run this many times     -> for
#   run until something is true -> while

total = 0
i = 0
while i < len(scores):
    total += scores[i]
    i += 1
print(total)      # 297

# If you cannot count by hand how many times the body runs,
# the condition is not understood well enough to write down yet.
$q$,null),
('Packaging logic into functions',1,'Defining and calling a function','code',
$q$def is_even(n):
    """Return True when n is an even whole number."""
    return n % 2 == 0

print(is_even(4))    # True
print(is_even(7))    # False

# The rule lives in one place, so a later change to it is a one-line change.
# A function that depends only on its arguments can be tested on its own.
$q$,null),
('Putting it together: a small program',1,'The finished program','code',
$q$def is_even(n):
    return n % 2 == 0

numbers = [4, 9, 12, 7, 20]

even_count = 0
total = 0
largest = numbers[0]

for n in numbers:
    if is_even(n):
        even_count += 1
    total += n
    if n > largest:
        largest = n

average = total / len(numbers)

print("even numbers:", even_count)   # 3
print("average:", average)           # 10.4
print("largest:", largest)           # 20
$q$,null),
('Lists, dictionaries and the data they hold',1,'The two structures you will use most','code',
$q$names = ["Ada", "Alan", "Grace"]           # a list: order matters, lookup by position
print(names[0])                              # "Ada"

student = {"name": "Grace", "score": 91}     # a dict: lookup by key
print(student["score"])                      # 91

# The shape most tabular data arrives in:
records = [
    {"name": "Ada",   "course": "BSIT"},
    {"name": "Alan",  "course": "BSCS"},
    {"name": "Grace", "course": "BSIT"},
]
print(records[2]["course"])                  # BSIT
$q$,null),
('Lists, dictionaries and the data they hold',2,'Video: freeCodeCamp Python course','video_link',
null,'https://www.youtube.com/@freecodecamp'),
('Comprehensions: the same loop, written once',1,'Comprehension or loop','code',
$q$squares = [n * n for n in range(1, 6)]
print(squares)                # [1, 4, 9, 16, 25]

evens = [n for n in range(1, 11) if n % 2 == 0]
print(evens)                  # [2, 4, 6, 8, 10]

# Use a comprehension when the transform is simple.
# Use a normal loop when you need several steps - clearer wins.
$q$,null),
('Modules, imports and the standard library',1,'Reference: the Python tutorial on modules','external_link',
null,'https://docs.python.org/3/tutorial/modules.html'),
('Modules, imports and the standard library',2,'Import what you need, at the top','code',
$q$import statistics
from pathlib import Path

scores = [88, 92, 41, 76]

print(statistics.mean(scores))          # 74.25
print(max(scores))                      # 92

# Sorting, dates, file paths, JSON and statistics are already written and tested.
# Knowing when NOT to write something yourself is the skill this lesson is about.
$q$,null),
('Reading a CSV into a DataFrame',1,'Reference: pandas reading CSV files','external_link',
null,'https://pandas.pydata.org/docs/user_guide/io.html'),
('Reading a CSV into a DataFrame',2,'Loading a file and checking it','code',
$q$import pandas as pd

df = pd.read_csv("scores.csv")

# Look before you analyse. These three checks find most problems early.
print(df.shape)          # (rows, columns)
print(df.dtypes)         # column types
print(df.head())         # what the first few rows actually contain

# df.shape tells you immediately if the file loaded as one column,
# which is what happens when the separator was guessed wrong.
$q$,null),
('Selecting, filtering and sorting rows',1,'Select, filter, sort','code',
$q$import pandas as pd

df = pd.read_csv("scores.csv")

# Select: columns
names = df["name"]
top_two = df[["name", "score"]]

# Filter: rows where the answer is yes
passed = df[df["score"] >= 75]

# Sort: an order. Always add a tie-breaker, or the order is not reproducible.
ranked = df.sort_values(by=["score", "name"], ascending=[False, True])

# A filter with several conditions silently drops rows where one is null,
# because any comparison against a missing value is false, not an error.
$q$,null),
('Cleaning messy data',1,'The four predictable problems','code',
$q$import pandas as pd

df = pd.read_csv("scores.csv")

# Missing values: decide what an empty cell MEANS before you fill it.
print(df.isna().sum())
df["score"] = df["score"].fillna(df["score"].median())   # not recorded

# Duplicates: usually a join that matched too much, or a file appended twice.
before = len(df)
df = df.drop_duplicates()
print("removed", before - len(df))

# Wrong types: one stray value turns a whole column into text.
df["score"] = pd.to_numeric(df["score"], errors="coerce")

# Impossible values: check the range, do not assume it.
print(df[(df["score"] < 0) | (df["score"] > 100)])
$q$,null),
('Grouping and aggregating',1,'Group, then aggregate','code',
$q$import pandas as pd

df = pd.read_csv("scores.csv")

per_course = df.groupby("course")["score"].agg(["count", "mean", "max"])
print(per_course)

# Three things that go wrong here:
#  - a group with no rows never appears, so a missing zero looks like a missing group
#  - count() is not nunique() - they answer different questions
#  - averaging an average is wrong unless every group is the same size

# Check the number of groups BEFORE you check the numbers.
print(per_course.shape[0], "groups")
$q$,null),
('Joining two tables',1,'Choosing the join that keeps what you need','code',
$q$import pandas as pd

scores  = pd.read_csv("scores.csv")
courses = pd.read_csv("courses.csv")

# inner: only rows that match on both sides
matched = scores.merge(courses, on="course", how="inner")

# left: every row from the left table, gaps filled with nothing
kept    = scores.merge(courses, on="course", how="left")

# Check the row count before and after. An inner join that unexpectedly
# halves your table did what you asked, not what you meant.
print(len(scores), "->", len(matched), "->", len(kept))

# More rows out than the inputs combined means the key is not unique on one side.
$q$,null),
('Charts and an honest report',1,'Reference: matplotlib, choosing a chart','external_link',
null,'https://matplotlib.org/stable/users/explain/')
) as v(lesson_title, pos, mat_title, mat_type, mat_content, mat_url)
join public.lessons l on l.title = v.lesson_title
join public.modules m on m.id = l.module_id
join public.courses c on c.id = m.course_id
where c.slug in ('programming-foundations', 'python-for-data-analysis')
  and not exists (select 1 from public.lesson_materials lm where lm.lesson_id = l.id and lm.title = v.mat_title);

commit;