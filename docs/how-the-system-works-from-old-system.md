# How the system works

This document explains what the system does, in plain language, for anyone
reading it. It describes behavior only: who can do what, what happens in what
order, what the words on screen say, and what is stored. It does not name any
programming language, framework, library, or vendor. It contains no code.

Read it top to bottom the first time. After that, use the contents list to jump
to the part you need.

---

## Contents

1. [What this system is](#1-what-this-system-is)
2. [The three people who use it](#2-the-three-people-who-use-it)
3. [How an account is created and used](#3-how-an-account-is-created-and-used)
4. [How a course is built by an instructor](#4-how-a-course-is-built-by-an-instructor)
5. [How a student finds and joins a course](#5-how-a-student-finds-and-joins-a-course)
6. [How a student studies and records progress](#6-how-a-student-studies-and-records-progress)
7. [How a student is assessed](#7-how-a-student-is-assessed)
8. [How a course is finished and certified](#8-how-a-course-is-finished-and-certified)
9. [How money is handled](#9-how-money-is-handled)
10. [How people talk to each other](#10-how-people-talk-to-each-other)
11. [How an administrator runs the place](#11-how-an-administrator-runs-the-place)
12. [How the system measures itself](#12-how-the-system-measures-itself)
13. [Rules that hold everywhere](#13-rules-that-hold-everywhere)
14. [Words the system uses, and what they mean](#14-words-the-system-uses-and-what-they-mean)
15. [Every state and every move between states](#15-every-state-and-every-move-between-states)
16. [Messages a person can be shown](#16-messages-a-person-can-be-shown)
17. [How a page is laid out and feels](#17-how-a-page-is-laid-out-and-feels)
18. [Things the system deliberately does not do](#18-things-the-system-deliberately-does-not-do)
19. [Known rough edges to decide about before copying](#19-known-rough-edges-to-decide-about-before-copying)
20. [One walk through, start to finish](#20-one-walk-through-start-to-finish)

---

## 1. What this system is

The system is called **IT Learning Hub**. It is an academic learning platform
for BSIT students in the Philippines. It is not an online shopping mall. The
tone is a calm institutional voice, the way a school registrar or a learning
office writes.

The core idea is simple. An instructor writes a course. A student joins it.
The student works through ordered lessons, takes a quiz, hands in an assignment,
marks lessons complete, and when every requirement is met, claims a printable
certificate of completion.

A course can be free or paid. Free courses open immediately. Paid courses open
only after a verified payment confirmation from a payment provider. Money is
handled in Philippine pesos, stored as whole centavos so no rounding ever
happens.

Three kinds of people use the system:

- a **Student**, who learns,
- an **Instructor**, who teaches,
- an **Administrator**, who operates it.

Everyone signs in with an email address and a password. Nobody can reach
anything they are not entitled to reach, and hiding a link is never treated as
protection.

The product promise, in one line:

```text
Register → Sign in → Find a course → Enroll → Study lessons → Take a quiz
→ Track progress → Meet the requirements → Receive a certificate
```

---

## 2. The three people who use it

A person has exactly one role. The role is never a ladder. An Administrator is
not also a Student and not also an Instructor. An Administrator who types the
address of a Student's workspace gets a refusal page, not an empty dashboard.

| Area | Student | Instructor | Administrator |
| --- | --- | --- | --- |
| Landing page after sign-in | Student dashboard | Teaching dashboard | Operations dashboard |
| Browse the public course catalog | yes | yes | yes |
| Create, edit, publish, or archive a course | no | yes, only their own | no |
| Build modules, lessons, and materials | no | yes, own courses only | no |
| Reorder or archive curriculum | no | yes, own courses only | no |
| Write quizzes and questions | no | yes, own courses only | no |
| Set assignments | no | yes, own courses only | no |
| Read a student's hand-in work | no | yes, own courses only | no |
| Mark or hand back work | no | yes, own courses only | no |
| Take a quiz, see a result | yes, own attempts | no | no |
| Hand in work | yes, own enrollments | no | no |
| Enroll in a course | yes, published only | no | no |
| Pay for a course | yes, own pending enrollments | no | no |
| See own progress | yes | no | no |
| See own certificates | yes, while still enrolled | no | no |
| Revoke or reissue a certificate | no | no | yes |
| See the learners on a course | no | yes, own courses only | no |
| Announce to a course | no | yes, own courses only | no |
| Announce to everybody | no | no | yes |
| Read messages | threads they are in | threads they are in | threads they are in |
| Start a course message thread | with the instructor of a course they joined | with a student on their course | no |
| Raise a support request | yes | yes | yes |
| Read a support request | only their own | never | yes, after joining it |
| Manage users, roles, suspensions | no | no | yes, never their own account |
| Read the activity log | no | no | yes |
| View reports | no | no | yes |
| View analytics | no | no | yes |
| Manage certificates | no | no | yes |
| Edit own profile and password | yes | yes | yes |

Some of these absences are deliberate design positions, not gaps:

- **Administration is not teaching.** An Administrator cannot create or publish
  a course, cannot see a course's learner roster, cannot post into a course
  message thread, and cannot announce inside a course.
- **Marking happens between an Instructor and a Student, and nobody else.**
  An Administrator can see that a piece of work exists and who wrote it, but
  cannot download it or mark it.
- **Access to a conversation comes from being a participant in it, not from
  having a role.** An Instructor cannot read a support request even about a
  student they teach, because they are not a participant in it.
- **Nobody can read anybody else's notifications.** Not even an Administrator.

Every signed-in page is behind four checks in this order:

1. the person is signed in,
2. their account is active,
3. their email address is confirmed,
4. they do not have a pending forced password change.

Then a fifth, area-specific check decides whether that particular role may be
on that particular page. Each page repeats its own permission check again
inside the action that does the work, so a mistake in one layer cannot open a
door that another layer is holding shut.

Navigation is built from the same rules that guard the pages. If a person is
not entitled to a destination, the destination is not drawn for them. A
suspended person, or a person whose role is not recognised, gets an empty
sidebar.

---

## 3. How an account is created and used

### 3.1 Signing up

Registration is open to the public. **Every public registration creates a
Student.** There is no role field on the form, and sending a role anyway is
rejected as an invalid field, not silently ignored. The form asks for four
things:

| Field | Rules |
| --- | --- |
| Full name | required, up to 255 characters |
| Email address | required, a valid address, up to 255 characters, not already in use |
| Password | required, at least 12 characters |
| Confirm password | required, must match the password |

The hint under the password field reads:

> At least 12 characters. A short phrase of a few words works well.

There are no complexity rules: no symbol requirements, no character-class
rules, no check against the email address, no check against a list of leaked
passwords.

What happens on success:

1. The account record and its profile record are created together, as one
   all-or-nothing operation. If one fails, neither exists.
2. The person is signed in immediately and the session identifier is replaced.
3. The role is fixed to Student, the status to Active, and the
   forced-password-change flag to off. All three are set by the server. The
   person cannot influence any of them.
4. A verification email goes out.
5. They land on the verification notice page.

The verification notice says:

> We sent a verification link to your email address. Open the link before
> continuing to your account.

with a note that delivery can take a minute and that they should check spam
before asking for another link, and two buttons: **Resend verification email**
and **Sign out**.

Asking for another link always returns to this same notice page. That is
on purpose, so the notice page and the confirmation page can never be confused
for each other.

Before confirming, the account is a valid, active Student account with only one
thing missing: the confirmed address. Every signed-in page refuses an
unconfirmed person and sends them to the notice.

Asking for a fresh verification email is limited to a small number per minute.

### 3.2 Confirming the address

The link in the email is signed and time-limited. Following it confirms the
address and opens a separate confirmation page:

> **Your address is confirmed**
>
> The link in your email worked. This account is ready to use, and nothing
> else is needed to finish setting it up.

That page counts down from eight seconds and then continues to the person's own
workspace. There is a **Stay here** button that cancels the countdown
permanently, and the continue button is a real link so it works with scripting
turned off. If the countdown value and the written-out number ever disagreed,
a test would fail, so they cannot drift apart.

Visiting the notice page while already confirmed sends you onward. Visiting
the confirmation page while not confirmed sends you back.

### 3.3 Signing in

The sign-in form asks for email, password, and an optional **Keep me signed in**
checkbox. The password field has a keyboard-reachable show/hide control.

Credential checking happens in a deliberate order:

1. The address is trimmed and lower-cased, then looked up. If there is no
   account, or the password does not match, the check stops immediately.
2. **If the account is not active, the check reports "no match."** A suspended
   person is treated exactly like somebody who typed the wrong password.
3. Otherwise the person is signed in.

The failure message is identical in all three cases — wrong password, unknown
address, suspended account:

> These credentials do not match our records.

So the sign-in page never reveals whether an address is registered.

**Attempt limiting:** five failed attempts per minute, counted per
transliterated address plus the caller's network address. Exceeding it produces
an ordinary "too many requests" answer with a retry hint, not a lockout screen.

**Where they land,** decided by role:

| Role | Destination |
| --- | --- |
| Student | Student dashboard |
| Instructor | Teaching dashboard |
| Administrator | Operations dashboard |
| unrecognised role | their own profile page |

**Session handling:** the session identifier is replaced at sign-in and again at
sign-up, so a session identifier fixed before sign-in cannot be used after.
Sign-out invalidates the session and replaces the anti-forgery token. Sessions
last two hours by default and do not expire when the browser closes unless the
person asked to be remembered.

### 3.4 Passwords

**The rule, everywhere:** minimum twelve characters, and must be confirmed.
Applied identically to registration, self-service change, and reset. No reuse
check, no breach-list check.

**Forced first change.** One thing in the system sets this flag: the local
process that creates the very first Administrator, which generates a temporary
password and marks the account as needing a change. While that flag is set, the
person can reach **only** the password page, the change action, sign-out, and
the email-verification family. Every other request is redirected to the
password page with:

> Change your temporary password to continue.

Because the email-confirmed check runs before the forced-change check, someone
with a temporary password who has not confirmed their address is sent to the
verification notice first.

The flag is cleared by either of two things: a successful self-service change,
or a successful reset with a token. Both write the new password and clear the
flag together.

**Changing your own password** asks for the current password, the new password,
and a confirmation. A wrong current password gives:

> The current password is incorrect.

On success the person goes to their role's dashboard with:

> Your password has been changed.

**Forgetting your password** has a deliberate anti-enumeration design. The
request form says:

> Enter your email address. If an account exists, we will send a reset link.

and carries the note:

> For your safety, the response is the same whether or not the address is
> registered.

Both the known-address and unknown-address cases produce **the same status
code, the same message, and byte-for-byte the same response body**, whether the
caller is a browser or asking for machine-readable data. There are no
validation errors in the unknown case, and no email is sent. The single
sentence used is:

> If an account exists for that email, a password reset link has been sent.

That sentence is deliberately written to neither confirm nor deny. It is also
checked against wording that would confirm or deny, so it cannot drift.

Reset requests are limited more tightly than ordinary writes, specifically so
a forgotten password cannot be used to flood a mailbox. Reset tokens expire
after one hour, and a new token cannot be generated for the same address within
a minute of the last.

The reset form asks for the new password and its confirmation. It does not ask
for the current password — the token is the authority.

### 3.5 Your own profile

Exactly two fields are editable by the person themselves:

| Field | Rules | Note on the page |
| --- | --- | --- |
| Display name | required, up to 255 characters | "This is the name other people see on your courses and certificates." |
| Short biography | optional, up to 500 characters | "Optional, up to 500 characters." |

Four things are locked and shown as a read-only fact list rather than as
disabled inputs: **email address**, **role**, **account status**, and
**email confirmation state**.

The page says why:

> Your email address, role, and account status are not changed from this form.
> Only an Administrator can change a role or an account status.

Email is locked because it is both the sign-in identifier and the verification
target. Changing it by self-service would orphan the verification state and the
reset record. Role and account status are locked because authority must never
be self-asserted.

**This is not just a hidden form.** Sending any of those four fields to the
profile update produces validation errors on those field names *and* changes
nothing at all. Sending `role=administrator` to the profile page leaves the
stored role untouched.

On success:

> Profile updated.

### 3.6 What an administrator can change about an account

Only two things, and only on somebody else's account.

**Change role.** A choice of Student, Instructor, or Administrator, with a
confirmation:

> Apply this role change for {name}?

Refused, with these exact sentences:

- **"The target account must have a verified email before its role can change."**
- **"The target account does not have a profile."**
- **"The target already has the selected role."**
- **"The final active Administrator cannot be demoted."**

An administrator attempting to change their **own** role is refused outright.

On success:

> Role updated.

**Change account status.** One control that offers the opposite of the current
status, confirmed with **"Suspend this account?"** or
**"Reactivate this account?"**. Refused, with:

- **"The target account does not have a profile."**
- **"The target already has the selected account status."**
- **"The final active Administrator cannot be suspended."**

An administrator attempting to change their **own** status is refused.

On success:

> Account status updated.

The interface disables both controls on the administrator's own row and
explains:

> Your own role and account status cannot be changed here.

That is belt and braces; the refusal happens on the server too.

**The last-administrator guard** exists in two separate places, both counting
only accounts that are *simultaneously* Administrator and Active: one prevents
demotion, one prevents suspension. Without them, a slip of the mouse could
lock the institution out of its own system.

**The status change and its audit record are written as one all-or-nothing
operation.** If the audit write fails, the status change rolls back too, so the
two can never disagree. This is tested by forcing the audit write to fail.

### 3.7 What suspension actually does to a signed-in person

Suspension does **not** reach out and delete sessions. Instead:

1. On the **next request** from any suspended person's session, the active
   check fires.
2. That session is ended, the anti-forgery token is replaced, and the person is
   sent to sign-in with:

   > Your account is not active. Contact an Administrator.

So every session dies **one request later, individually**, and a person cannot
keep working from an already-open tab. Being suspended also blocks sign-in
exactly as a wrong password does.

Reactivation flips the status back. The person is **not** signed in
automatically, and is not notified that they were reactivated.

### 3.8 The audit record of account changes

One read-only record exists, and the page says of itself:

> Read-only records of approved role and account status changes… Nothing else
> is recorded.

Each record holds: who acted, who was changed, what kind of change it was, the
value before, the value after, and when.

Displayed as a table, newest first, 25 per page, with columns Event, Actor,
Target, Change, Time. The Event column reads **"Role changed"** or **"Account
status changed"**. The Change column reads for example `Student → Instructor`
or `Active → Suspended`. A missing actor shows **"System"**; a missing target
shows **"Unknown"**.

When empty:

> No activity records
>
> A record appears here whenever an Administrator assigns a role or changes an
> account status.

**What is deliberately never recorded there:** passwords, tokens, session
values, network addresses, browser information, and any free-text
justification. There is no deletion anywhere in the system, so an audit record
can never point at a person who no longer exists.

Note the scope honestly: **sign-ins, sign-outs, registrations, profile edits,
password changes, course creation, certificate revocation, and payments are not
in this record.** Those live in the separate measurement system in section 12,
which is a different store with different rules.

### 3.9 The first administrator

The very first Administrator is created by a local maintenance process, not
through the web. It takes a name and an address from configuration, generates a
random temporary password, marks the address confirmed straight away, and
writes the password to a protected secret file **outside the web root**. The
password is never printed unless explicitly asked for, never written to a log,
and never committed.

It refuses to run outside a local environment. It refuses a missing or
over-long name, an invalid address, or a secret path inside the project. It
refuses to overwrite an existing secret file. And it **refuses to silently
promote** an existing Student or Instructor to Administrator — instead it
reports:

> The configured email belongs to a non-Administrator account. No promotion was
> made.

If the account already exists as an Administrator, it updates only the name and
reports that no password was changed.

---

## 4. How a course is built by an instructor

### 4.1 What a course record holds

| Piece of information | Rules | Who may set it |
| --- | --- | --- |
| Owner (the instructor) | required | server only, from the signed-in person |
| Title | required, up to 160 characters | instructor |
| Address (a short code used in links) | required, unique across all courses | server only |
| Description | optional, up to 5000 characters | instructor |
| What the student will be able to do | optional, up to 5000 characters | instructor |
| Category | optional, up to 100 characters | instructor |
| Level | Beginner, Intermediate, or Advanced; defaults to Beginner | instructor |
| Type | Free or Paid; defaults to Free | instructor |
| Price | whole centavos; defaults to 0 | instructor |
| Currency | always Philippine pesos, server-set | server only |
| Status | Draft, Published, or Archived; defaults to Draft | server only |
| Cover image | optional | instructor chooses, server stores |
| First published time | set on publish, kept afterwards | server only |

The price field is labelled **"Price in centavos"** with the help text:

> 100 centavos is ₱1.00. A free course must use 0.

**The free-and-paid pairing is enforced twice** — once in the application and
once as a database rule. A free course must have a price of zero; a paid course
must have a positive price. The two failure messages are:

> A free Course must have a price of zero.
>
> A paid Course must have a positive price.

A free course is displayed as the word **Free**, never as `₱0.00`. A stored
charge, such as a payment record, is never displayed as Free.

The address is generated **once, at creation**, and **never changes** — not even
when the title is completely rewritten. The edit page says so:

> The course address stays the same after a title change, so existing links
> keep working.

Generation works by turning the title into a lowercase hyphenated form; if that
produces nothing, it falls back to `course`; if it is already taken, it appends
`-2`, then `-3`, and keeps going until free. Lesson addresses use the same
algorithm scoped to their module, falling back to `lesson`.

### 4.2 The three course states

**Draft** is the creation state. A draft is invisible in the public catalog —
its public page does not exist — and invisible to students. Only the owning
instructor sees it. Anything new added to a course is created as a draft, even
when the course itself is already published.

**Published** is visible in the catalog and on its own public page. Only
published modules and published lessons appear in the public outline and to
students.

**Archived** is hidden from the catalog; its public page does not exist.

### 4.3 Moving between course states

All four moves require an **active instructor who owns the course**.

| Move | From → to | What happens | Message on success |
| --- | --- | --- | --- |
| **Publish** | Draft → Published | Stamps the first-published time. **Also publishes every module and every lesson inside it**, in one bulk change, whatever state they were individually in. | Course published. It can now appear in the public catalog. |
| **Unpublish** | Published → Draft | **Returns every module and lesson to draft.** The first-published time is **kept**, so the instructor page still shows when it first went live. | Course unpublished. It is hidden from the public catalog. |
| **Archive** | any → Archived | Status only. Cascades nothing. Enrollments and progress are kept. | Course archived. Enrollments and progress are kept. |
| **Restore** | Archived → Draft | Always lands on draft, never straight back to published. | Course restored as a draft. Publish it when the outline is ready. |

Refusals:

> Only a draft course can be published.
>
> Only a published course can be unpublished.
>
> This content is already archived.
>
> Only archived content can be restored.

and, if there is not enough content:

> Add at least one module before publishing this course.
>
> Add at least one lesson before publishing this course.

**What unpublishing does to students, stated honestly.** Enrollments, progress
rows, payments and certificates are **kept** — the records survive. But
unpublishing returns every module and lesson to draft, and students can only
read published lessons inside published modules. So the **records stay and the
content becomes unreadable.** This is a genuine tension in the requirements,
noted in section 19.

Archiving is different. It does not touch modules or lessons, so an archived
course still loads for enrolled students, but the progress panel is hidden
because progress display is gated on the course being published.

Publishing fires one notification to every student with an access-granting
enrollment, titled **"New material in {course}"**. Pressing publish twice does
not announce twice.

### 4.4 The outline: course → module → lesson → material

There is exactly one level of nesting. It is not recursive.

**Module.** Belongs to a course. Holds a title (up to 160 characters), an
optional description (up to 5000), an order position, and a status. Modules
have no address. Two modules of the same course cannot share a position.

**Lesson.** Belongs to a module. Holds a title (up to 160), an address unique
within its module, an optional short summary (up to 5000), optional lesson
body text (up to 100000), an order position, a status, a required flag, and an
optional estimated minutes (positive when present). Two lessons of the same
module cannot share a position.

**Learning material.** Belongs to a lesson. Holds a title (up to 255 — longer
than any course, module, or lesson title), a type, an order position, and then
whichever of a body text, an external link, or a stored file that the type
needs. Also records who uploaded it, which storage area it is in, its stored
path, its detected media type, and its real size in bytes. Two materials of the
same lesson cannot share a position. Materials have **no status** — they are
not individually publishable.

**Ordering is always server-assigned.** When something is added, the server
locks the parent row, reads the current highest position, and hands out one
more than that. Two simultaneous "add module" requests cannot both get the same
number. Position, parent, and status are rejected if a request tries to supply
them.

**Reordering** exists for modules within a course and for lessons within a
module. Materials cannot be reordered. Reordering requires:

- a position for **every** non-archived item, and none for archived items —
  otherwise: **"Every active module in this course needs exactly one
  position."**
- values running 1, 2, 3 with no gaps and no repeats — otherwise:
  **"Positions must run from 1 with no gaps and no repeats."**
- at least one item — otherwise: **"Send a position for every module."**

When reordering, every position is **renumbered from scratch** to 1..n in the
submitted order. Stored positions are never trusted. To avoid tripping the
uniqueness rule mid-update, rows are first parked out of the way and then moved
into place, with the parent row locked for the whole operation.

**Archiving a module or lesson touches only that item.** Archiving a module does
not archive its lessons. Archiving a course does not archive its modules.
Archived items are left out of reorder lists but keep their rows and their
positions. Restore always lands on draft, with:

> Module restored as a draft. Publish the course again to show it.

and the same wording for lessons. A student opening an archived lesson's page
is refused, and the title disappears from both the student course page and the
public course page.

**Mismatched addresses never work.** Every curriculum address that carries a
course, a module, and a lesson checks the whole chain and reports "does not
exist" if they disagree: the module must belong to that course, the lesson to
that module, the material to that lesson. A hand-typed identifier therefore
cannot reach another person's content.

### 4.5 Lesson body text

Lesson bodies are **plain text**. There is no editor, no formatting input, and
no markup field. The authoring hint reads:

> Leave a blank line between paragraphs. The lesson page turns each blank line
> into a new paragraph.

The lesson page splits the stored text on runs of two or more blank lines,
trims each piece, drops blanks, and prints each remaining piece as its own
paragraph. **A single line break does not create a new paragraph.** A lesson
with no body shows:

> This lesson has no written content yet.

All output is escaped, so stored text can never introduce live markup. There is
no separate cleaner on the way in, which is acceptable precisely because
nothing is ever rendered unescaped.

**What the required flag actually does.** Visually it is only a **Required** or
**Optional** badge in three places. But it changes two real computations:

- **Progress percentage** counts only lessons that are published, sit in a
  published module, and are required. Optional lessons never count. The student
  page says so: *"Optional lessons are not counted."*
- **Course completion** treats "finish every required published lesson" as one
  of the completion blockers, and the instructor's learner roster shows
  "X of Y required lessons".

**A wrinkle worth knowing.** When a lesson is created and the required flag is
absent from the request, it defaults to **required**. When a lesson is edited
and the flag is absent, it defaults to **optional**. The forms work around
this by submitting a hidden "no" before the checkbox, so a deliberately
unchecked box arrives as an explicit value rather than as an absent one. A
third-party caller that omits the field entirely gets different results on the
two actions.

The lesson summary is deliberately **hidden from the public catalog**. The
public outline shows only module titles, lesson titles, the required or optional
badge, and estimated minutes.

### 4.6 Learning materials

Seven material types exist:

| Type | Carries | Required content |
| --- | --- | --- |
| Text | body text | required — "A text or code material needs its content." |
| Code | body text | required, same message |
| Video link | external link | required — "A link material needs a valid link." |
| External link | external link | required, same message |
| Image | an uploaded file | required — "This material type needs a file." |
| PDF | an uploaded file | same |
| Document | an uploaded file | same |

Sending a file with a type that does not take one is refused:

> This material type does not take a file.

**File size limit:** 10 MB, with the message:

> A file must be 10 MB or smaller.

**Allowed file types by material type:**

| Material type | Accepted extensions |
| --- | --- |
| Image | jpg, jpeg, png, webp |
| PDF | pdf |
| Document | pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv |

**Two independent checks** are applied: the file name's extension must be on the
list, **and** the real type detected from the file's contents must be on the
list. Two distinct messages:

> That file type is not allowed for this material.
>
> That file content is not allowed for this material.

Executables, scripts, markup files, and vector graphics are all refused. This is
tested by trying to upload five of them and asserting nothing was written.

**Storage rules.** Materials go on a private, non-public area under a generated
name: `learning-materials/{lesson id}/{generated}.{extension}`. **The original
file name is never used as a path**, so a hostile name cannot escape and two
uploads of the same name land in different places. The stored media type, the
size, the uploader, the storage area, the path, and the position are all
rejected if supplied by a request. **No address anywhere serves a stored path
directly.**

**Who can download what:**

| Person | Rule |
| --- | --- |
| Administrator | may download any material, including from courses they do not teach |
| Instructor | only materials in a course they own |
| Student | only in a course they are enrolled in, **and** only when both the lesson and its module are published |
| anyone else, or a suspended account | refused |

Every download goes through one place that: finds the record, refuses if the
lesson or course in the address disagrees with it, checks permission, and
refuses if there is no file or the bytes are gone. Responses are always sent as
an attachment, never displayed inline, carry the stored media type, a filename
rebuilt from the record, a no-sniff instruction, and private no-store caching.
The rebuilt filename takes only the extension from the stored record and gives
it a fixed stem, so a hostile stored name cannot influence the download name.

Materials appear on the student's lesson page only. They never appear on the
public catalog or the public course page. The download button is captioned:

> Stored privately. This link works only while you are enrolled.

**An honest gap:** the server accepts image, PDF, and document materials when
creating, but both the create and the edit form **do not offer** those three
types, and the edit action **refuses** them outright:

> File materials are not available yet. Choose Text, Code, Video link, or
> External link.

So file materials are currently reachable only by a direct request that passes
every server check, not through the interface.

### 4.7 The course cover

Three states, not two: no cover, an uploaded image, or a photograph chosen from
a fixed built-in list. A fourth presentation state exists — a cover pointing at
a file that is no longer there — which shows the placeholder instead of a broken
image.

**Upload rules:**

- Maximum 2 MB — "A cover image must be 2 MB or smaller."
- The real type must be JPEG, PNG, or WebP — "A cover must be a JPEG, PNG or
  WebP image. That file is {type}."
- Minimum dimensions **320 by 180**, read from the image itself — "A cover must
  be at least 320 by 180 pixels. That one is {w} by {h}."
- Unreadable: "That image could not be read."
- Failed upload: "That image did not upload. Try again."

**Storage:** on the public area, at a generated path, with the extension chosen
from the detected type. The original file name is never used. Replacing a cover
deletes the previous file **after** the record is written, and only when the
previous cover was an upload. A cover cannot be stored for a course that has
not been saved yet.

**The photograph list** is a small, hand-reviewed set of computing-themed
photographs grouped by subject: classrooms and study, computing and hardware,
data and analysis, networks and security, design and web, working together. An
identifier not in that list is refused, both by the request and by the action:

> That photograph is not one of the covers on offer.

**Three-way exclusivity:** upload, choose, and remove are mutually exclusive.
Sending more than one gives:

> Choose one of these, not several: {list}.

Sending none changes nothing:

> No cover was chosen, so nothing changed.

**Presentation:** the placeholder is always present in the page, with the image
layered on top, so a missing image never collapses the layout. The
alternative-text description describes the picture rather than repeating the
title — for a chosen photograph it is the list's own description of what it
shows; for an upload it is "Cover image for {title}". Covers in lists load
lazily; the chosen page loads them immediately. Credit appears on the course's
own page and on the About page, never on cards.

### 4.8 The public catalog

**The list page** says, above the results:

> Public catalog
>
> **Browse published courses**
>
> These courses are published and open to everyone. Sign in to enroll in one.

with a count line such as **"N courses published"**. Twelve per page. Only
published courses appear.

**Filters and search**, all on one form, all combined:

| Control | Behaviour |
| --- | --- |
| Search by course title | substring match on the **title only** — never the description, never the objectives. Up to 100 characters. Placeholder: "Networking basics". |
| Category | built from the categories that published courses actually use, so a category that exists only on drafts never appears |
| Level | All levels, Beginner, Intermediate, Advanced |
| Type | Free and paid, Free, Paid |
| Apply filters / Clear filters | both present |

Unknown or empty filter values are **ignored** rather than rejected, so a
hand-typed address never fails. Text containing database metacharacters is
treated as literal text.

**Sorting is fixed:** newest published first, then by title. There is no sort
control.

**A card shows:** the cover; the category as a small eyebrow; the title; the
price on the title line as either the word Free or a formatted peso amount; a
clamped two-line description; one quiet facts line reading
`N modules / N lessons / Level` where the counts are **published content only**;
and a **View course** button. The whole card is one click target. **The
instructor's name is deliberately not on the card**, and an instructor's email
address never appears anywhere public.

Empty result:

> No published courses match
>
> No published course matches these filters yet. Try a different search, or
> clear the filters to see everything.

**The course page** shows, in order: breadcrumbs; the cover; a **Published
course** eyebrow with a Free or Paid badge; the title; level badge; category
badge falling back to **Uncategorized**; the description; a four-item summary
of Price, Instructor (falling back to "IT Learning Hub"), Modules, and
Published (falling back to "Recently"); the enrollment block; **What you will
learn** with line breaks preserved; and **Course outline**.

**The public outline is structure only**, under the explicit statement:

> Module and lesson titles only. Lesson content and materials stay private
> until you enroll.

Each module shows `Module {n}` and its title. Each lesson shows `Lesson {n}`,
the title, a Required or Optional badge, and estimated minutes when set. A
module with nothing published in it reads **"No published lessons in this module
yet."** A course with nothing published at all reads **"This course has no
published outline yet"**.

Lesson summaries, lesson bodies, material titles, material bodies, and material
links are all absent from the public page. This is asserted by test.

**The enrollment block** has six distinct presentations plus a fallback:

| Situation | What is shown |
| --- | --- |
| Visitor not signed in | "Sign in to enroll and open lesson content after enrollment. Browsing needs no account." — a sign-in link, no enrollment detail at all |
| Signed in as instructor or administrator | "Lesson content and materials unlock after a student enrolls." |
| Student, free course, not enrolled | "This course is free. Enroll to start your learning record." — **Enroll free** |
| Student, paid course, not enrolled | "This course is paid at {price}." plus "Lesson content and materials stay locked until a payment is confirmed." — **Enroll to pay** |
| Student, waiting for payment | "Waiting for payment confirmation." plus "Finish the payment to open the course. Access starts as soon as the payment provider confirms it." — **Continue payment** |
| Student, enrolled and access granted | "Enrolled. Open the course to read its published lessons." — **Open course** |
| Student, enrollment in any other state | "This enrollment does not grant access yet. Contact an administrator for help." |

The person's **enrollment is checked before the course type is considered**, so
somebody who has already paid is never shown a pay button on a course they paid
for.

### 4.9 The instructor's course workspace

**My courses.** Shows only courses the instructor owns, fifteen per page,
newest first, with a module count each. Empty state:

> No courses yet
>
> Create your first course as a private draft. Only you can see it until you
> publish it.

**Create course.** Title, description, what the student will be able to do,
category, level, type, and price in centavos. An informational note reads:

> Slug, currency, status, publication time, and price ownership are set by the
> server. This form cannot change them.

A draft-specific note:

> Publishing needs at least one Module and one Lesson. Students cannot see a
> draft course.

On success: **"Course created as a private draft."**

**Edit course details.** The server-owned facts are shown first under **Fixed
for this course** — Status, Address, Modules, Currency — with:

> Only the details below can change. The owner, address, status, and publication
> time stay under server control.

On success: **"Course details updated."**

**The course outline page** is the working page, and it is long. Top to bottom:
the cover; the title, description, and a four-item summary; a note that says
first-published time when there is one; buttons for Edit course details, View
learners, and the status-appropriate Publish / Unpublish / Archive / Restore;
then, per module, `Module {n}` with its title, status badge, edit, and
archive/restore; then, per lesson, `Lesson {n}` with title, summary, status,
required badge, edit, and archive/restore; then, per lesson, a card list of its
materials; then, per lesson, the work set on that lesson; then a per-lesson add
material form; then a per-module add lesson form; then, per module with more
than one non-archived lesson, a reorder form; then a quizzes section; then, when
there is more than one non-archived module, a reorder modules form; then an add
module section; then an announcement composer for anyone entitled to post there;
and finally, at the foot, the **course cover** picker — deliberately last, after
the content.

Empty states:

> No Modules yet
>
> This Course is a private draft. Add the first Module to begin its outline.

> No Lessons are recorded in this Module yet.

> No Learning Materials are recorded yet.

> No quizzes in this course yet.

**Rejected forms reopen with their typed text intact.** Each collapsible form
carries a hidden marker, and on a failed submit that specific form reopens and
repopulates while the others stay closed. A test asserts the marker and the
ordering exist, so a restyle cannot quietly break it. A failed form shows:

> Check the highlighted fields

followed by the specific field message.

**The learner roster** is titled **Learners** with the description "Every learner
enrolled on this course, with the progress they have actually made." Columns:
Learner, State, Progress, Quizzes passed. Progress is a bar labelled
`X of Y required lessons`, or the words **"Nothing required yet"** when the
course has no required published lessons — a deliberate choice so that zero does
not read as failure. Cancelled and unpaid enrollments are excluded, and the page
says so:

> Cancelled and unpaid enrollments are not listed, because they have not
> started.

Empty state:

> No learners yet
>
> A row appears here as soon as somebody enrolls on this course.

This page is authorized by its own dedicated permission rather than reusing the
general view permission, so a later change to course visibility cannot silently
change roster visibility. It is deliberately **not** granted to administrators,
because administration is not teaching.

---

## 5. How a student finds and joins a course

### 5.1 Enrolling

**Free course.** Pressing **Enroll free** creates an enrollment that is
**already active**, stamps the activation moment, and redirects to *My courses*
with:

> You are enrolled. Open the course to read its published lessons.

**Paid course.** Pressing **Enroll to pay** creates an enrollment in
**waiting for payment**, with **no access at all**, and moves on to payment.

Order of checks when enrolling: the course must be published, otherwise the
page does not exist; then permission; then the same two checks again inside the
action.

### 5.2 What an enrollment record holds

The student, the course, the state, the moment it was activated, the moment it
was completed, and the moment it was cancelled. **Exactly one enrollment per
student per course** is enforced by the database itself, so duplicate
submissions are absorbed rather than creating duplicates.

**Access is granted by exactly two states: active and completed.** That single
rule is repeated in several places so it cannot drift.

### 5.3 The enrollment states

| State | Meaning | Access |
| --- | --- | --- |
| Waiting for payment | created for a paid course, not yet paid | none |
| Active | open for learning | yes |
| Completed | finished and certified | yes |
| Cancelled | refunded or withdrawn | none |

The only transitions that happen:

| From | To | Trigger |
| --- | --- | --- |
| nothing | Active | enrolling in a free course |
| nothing | Waiting for payment | enrolling in a paid course |
| Waiting for payment | Active | a verified payment confirmation |
| Active | Completed | the student claims their certificate |
| Active | Cancelled | a verified refund event |
| Cancelled | Waiting for payment | re-enrolling in the same **paid** course, so it can be bought again |

There is **no transition out of Completed**, and **no instructor or
administrator action can cancel, undo, or revoke an enrollment.** The only
thing in the entire system that cancels an enrollment is a verified refund.

### 5.4 Enrolling when already enrolled

Handled in three layers: a pre-check, a database uniqueness rule, and a
re-read-and-return on a caught failure. Behaviour depends on state:

| Situation | Result |
| --- | --- |
| Free course, existing enrollment grants access | nothing changes, returns to the course |
| Free course, existing enrollment does **not** grant access | refused: **"This enrollment is not active. Contact an administrator for help."** It is **not** silently reactivated. |
| Paid course, waiting for payment | returned as-is, so continuing into payment works — this is the retry path |
| Paid course, cancelled | reset to waiting for payment, cancellation and activation both cleared, so it can be bought again |
| Paid course, active or completed | returned untouched, nothing reset |

A "student enrolled" notification is sent **only on genuine creation**, never on
reuse, and never when a duplicate is absorbed.

### 5.5 What an enrollment grants

Reading a course requires an active or completed enrollment. Reading a lesson
additionally requires the lesson **and** its module to be published. The
course's own published state is **not** required — an enrolled student keeps
reading a course that the instructor has moved to draft or archived, seeing only
the content still marked published. While the course is not published the
progress panel is hidden and the page explains that the records are kept.

### 5.6 My courses

One card per enrollment, fifteen per page. Each shows the course, its state, a
progress bar, and a state-appropriate message and button:

| Situation | Badge | Message | Button |
| --- | --- | --- | --- |
| Access granted, paid course | **Paid** | "Payment confirmed. Open the course to read its published lessons." | **Open course** |
| Access granted, free course | **Included** | "Open the course to read its published lessons." | **Open course** |
| No access, not a paid course | **Not available** | "This enrollment does not open the course yet. Contact an administrator for help." | none |
| Waiting for payment, no payment record yet | **Awaiting payment** | "Enroll to continue to payment. The course opens once the payment is confirmed." | **Pay {amount}** |
| Waiting for payment, payment in flight | **Awaiting payment** | "The payment is being confirmed. The course opens as soon as it arrives." | **Pay {amount}** |
| Payment failed | **Payment failed** | "The payment was not completed, so nothing was charged. You can try again." | **Try payment again** |
| Payment refunded | **Refunded** | "This payment was refunded, so the course is closed. You can buy it again." | **Pay again** |
| Payment cancelled | **Payment cancelled** | "The payment was cancelled, so nothing was charged. You can try again." | **Try payment again** |
| Waiting for payment, older than 24 hours | **Payment expired** | "The checkout was left unfinished and can no longer be paid. Start a new one." | **Start payment again** |

Two deliberate constraints here. A settled enrollment **always** reads **Paid**
regardless of a stale pending payment record, so somebody who paid is never
shown as unpaid and never offered a second charge. And a declined payment
**never** tells the student to contact an administrator.

---

## 6. How a student studies and records progress

### 6.1 The reading experience

There is **no sequence gate**. A student who is enrolled may open any published
lesson in the course, in any order, without finishing the one before it.

The course page for a student shows the course title and description, the ordered
outline with each module and lesson, and a progress panel. Each lesson in the
outline shows its position, title, whether it is required or optional, and
estimated minutes when set.

Opening a lesson page shows: breadcrumbs; the lesson title; its required or
optional badge; its summary when there is one; the body split into paragraphs;
the ordered list of learning materials; the work set on this lesson; and a
**Your progress** panel.

The progress panel reads either:

> Completed
>
> You finished this lesson on {date}.

or:

> Marking this lesson complete updates your course progress. It is recorded on
> the server and cannot be changed from the browser.

With nothing stored, the last line reads: **"This lesson is recorded as
complete."**

### 6.2 How progress is recorded

One record per enrollment per lesson, unique in the database. It holds the
state, when it was first started, when it was finished, and when it was last
looked at. Three states:

| State | When |
| --- | --- |
| Not started | the record is created on first open |
| In progress | advanced **only** from not started, and only once |
| Completed | written by an atomic write that cannot overwrite an existing finish time |

Every time a lesson page is opened, the "last looked at" moment is written.
**No path anywhere moves a completed lesson back to unfinished**, regardless of
the order two requests arrive in. This is tested by completing in one tab and
reloading in another.

### 6.3 Finishing a lesson

**Manual only.** There is a **Mark as complete** button at the bottom of the
lesson page. Nothing is completed by reading, by time spent, or by any other
means. Finishing an **optional** lesson is recorded too — it simply does not
count toward the percentage or the completion requirement.

Pressing it twice keeps one record and the **original** finish time. The finish
moment is written exactly once, when the record moves onto completed, and no
later write can move it.

Success message:

> Lesson marked as complete.

**Nothing is read from the browser.** Sending a percentage, a state, a finish
moment, an enrollment id, or a student id changes none of them.

### 6.4 Progress cannot be reset

There is no reset action, no bulk reset, and no administrator control. The only
way a lesson stops counting toward progress is that it stops being required, it
is unpublished, or its module is unpublished.

### 6.5 How the percentage is calculated

**Counted in the denominator:** lessons that are published, flagged required,
and sit in a published module. Optional lessons, draft lessons, and lessons
inside draft modules are all excluded.

**Counted in the numerator:** completion records for this enrollment, limited to
those same required lessons.

**The number:** completed divided by total, as a whole-number percentage, and
**exactly 0 when there is nothing required** — a course with no required lessons
shows 0%, never 100%. The displayed number is clamped to 0–100. The bar drawn is
quantised to five-point steps.

**While the course is not published, the percentage is hidden entirely** and the
page explains that completed lessons are kept and will reappear. The records are
never deleted.

Where the average completion figures on dashboards and reports come from: the
mean of those same per-enrollment percentages, **with enrollments whose total is
zero left out of the mean** rather than counted as zero.

### 6.6 Where progress is surfaced

- **My courses** — one bar per enrollment: the exact percentage plus
  `X of Y required published lessons completed.`
- **My course** — the same bar plus `Optional lessons are not counted.`
- **The lesson page** — the progress panel described above.
- **The student dashboard** — an average completion figure, one bar per enrolled
  course, and a lessons-completed count.
- **Continue learning** — the most recently viewed readable lesson.
- **The instructor's learner roster** — a per-learner percentage from the same
  calculation.
- **The administrator's report** — a per-course mean percentage, plus a
  five-step funnel.

### 6.7 Continue learning

The dashboard shows the most recently viewed readable lesson as a single
suggestion, so a returning student lands back where they left off. When no
lesson has been opened:

> No lessons opened yet

---

## 7. How a student is assessed

Two separate assessment types exist. Neither one is automatic.

### 7.1 Quizzes

#### What a quiz holds

| Piece of information | Rules |
| --- | --- |
| Title | required, up to 255 characters |
| Description | optional, up to 5000 characters |
| Instructions | optional, up to 5000 characters |
| Owning course | required |
| Which module | optional; must be one of that course's modules |
| Required for course completion | yes or no; defaults to no |
| Passing score | 0 to 100 percent; defaults to 80 |
| Maximum attempts | 1 to 3; defaults to 3 |
| Position | assigned by the server, unique within the course |
| Status | Draft, Published, or Archived; defaults to Draft |
| Author | the signed-in instructor; server-set |

Request attempts to supply the status, the position, the author, or the owning
course are rejected outright.

#### Questions

**Only one question type exists: multiple choice with a single correct answer.**
There is no true/false, no typed answer, no multi-select, no ordering, no
matching, and no essay. The type cannot be changed by a request at all.

A question holds a prompt (required, up to 5000 characters), points (0.5 to 100,
defaulting to 1), an optional explanation (up to 5000), a server-assigned
position, and between **2 and 6 options**. Each option holds text (required, up
to 500 characters) and an optional own explanation (up to 2000).

**Exactly one option must be marked correct**, enforced twice. The failure
messages are:

> A question needs at least two options.
>
> A question allows at most six options.
>
> Mark exactly one option as the correct answer.

The correctness marker is validated strictly: absent, true, false, 0, 1, yes,
no, on, and off are accepted; anything else gives:

> The correct answer marker must be true or left empty.

This is deliberate — it stops the string `yes` being treated as merely "present"
and accidentally creating two correct answers.

**There is no limit on how many questions a quiz can have.** There is also **no
way to edit, delete, reorder, or re-key a question or an option** once created.
The only quiz actions are: create, update, publish, archive, add question. The
update action exists and is authorized but **no page in the interface links to
it**, so quiz editing is currently reachable only by a hand-made request.

**Scoring.** Each question is all-or-nothing: full points or zero. There is **no
negative marking** and **no partial credit** below the question's own points.
The total includes questions the student left unanswered. If the total is zero,
the percentage is zero and the attempt cannot pass.

**There is no time limit of any kind.** No countdown, no expiry, no automatic
submission. An attempt can be opened, abandoned, and resumed days later.

#### The quiz lifecycle

| Move | From → to | Message on success |
| --- | --- | --- |
| Create | nothing → Draft | Quiz added as a private draft. |
| Publish | Draft → Published | Quiz published. Students in this course can now take it. |
| Archive | Published → Archived | Quiz archived. Existing attempts are kept. |
| Republish | Archived → Published | same publish control, labelled Republish |

Archiving is confirmed with: *"Archive this quiz? Student results are kept."*

**Only the instructor who owns the course, with an active account, may publish.**

**Publishing is refused unless the quiz is genuinely ready.** Two refusals:

> Add at least one question before publishing this quiz.
>
> Every question needs exactly one correct answer before publishing.

The check re-reads the stored questions and options, so a request cannot skip
it.

**Editing a published quiz is allowed** and can change the title, description,
instructions, module, required flag, passing score, and attempt limit. It cannot
change or remove questions, options, or the answer key, and **no attempt is
reset, invalidated, or deleted by any edit.**

**Two real gaps here.** Changing the passing score or the attempt limit while
attempts are open is not guarded, so an attempt already in progress is graded
against the new threshold, and lowering the limit below the number already used
makes further starts impossible. And **a new question can be added to an
already-published quiz with no warning** — it joins the total points and is
graded from that moment, including for attempts opened earlier.

Publishing or archiving a quiz sends **no notification**.

#### Who may reach a quiz

A student can see and start a quiz only when **all** of these hold:

1. the reader's role is Student and the account is active,
2. the quiz is published,
3. the course is published,
4. if the quiz has a module, that module is published,
5. the student has an enrollment that is active or completed.

Any failure is a refusal. An instructor or administrator never sees a student
quiz page.

#### Taking a quiz

**Step 1 — read.** The quiz page shows the title, the description, and a
four-item panel: **Questions** (the count), **Passing score** (such as
`80%`), **Attempts used** (such as `2 of 3`), and **Result** (Passed, Not
passed, or Not attempted). If the instructor wrote instructions, they appear in
an instructions box. Then **every question with all its options**, as plain
letters `A.`, `B.`, `C.` — with **no radio buttons and no correctness
marking**. The page says:

> Read every question before you start. Answers cannot be changed after
> submitting.

**Step 2 — start.** One button reading `Start attempt {n}`, where n is the
number already used plus one. Above it:

> Starting uses one of your {total} attempts. {remaining} attempts remain.

**Step 3 — answer.** The attempt page repeats the instructions and renders every
question as a radio group with one option per row. Every option is marked
required. Choices can be changed freely.

**Step 4 — submit.** One button. Above it:

> Submitting grades this attempt on the server. Answers cannot be changed
> afterwards, and the correct answer is not shown until you see the result.

**Nothing is saved while answering.** There is no autosave, no draft storage, no
per-question save, and no "save and finish later". Answers are written **only at
submit**. So refreshing the attempt page or closing the tab **discards every
selection** — though the attempt itself survives and can be resumed.

There is **only ever one open attempt at a time**. Pressing Start while one is
open returns that same attempt. Two simultaneous starts resolve to the same
single attempt.

#### The result

Scoring is read entirely from stored records. Nothing about the score is ever
taken from the browser — the browser may only say which option was chosen.

The result page shows:

- A heading of **"Passed"** or **"Not passed"**.
- The percentage, with trailing zeros stripped — `80%`, `100%`.
- A sentence: **"7 of 8 points. Passing needs 80%."**
- A **Review your answers** section, with the note: *"Each option is labelled in
  words, so the result reads the same without colour."*
- Per option: the correct option labelled **"Correct answer"**; the student's
  choice labelled **"Your answer"**, or **"Your answer, and correct"** when it was
  also right.
- Per question, if the instructor wrote one: **"Why: {explanation}"**

On a pass:

> You passed this quiz, so no further attempts are needed. If this quiz is
> required for the course, it now counts toward your certificate.

On a fail:

> You can try again while you have attempts left. The quiz page always shows how
> many you have used.

**Correct answers and explanations are revealed in full after submitting.** The
result page does not exist while the attempt is still in progress.

**Option-level explanations are stored but never shown to anyone.** Only the
question-level explanation appears. Whether that is deliberate is uncertain.

#### Retake rules

| Situation | Result |
| --- | --- |
| A failed attempt | retake allowed while attempts remain |
| Any attempt has **passed** | no further attempt, ever — "You already passed this quiz." |
| All attempts used | "You have used all 3 attempts for this quiz." |
| Submitting an already-submitted attempt | "This attempt was already submitted." — the first result is kept |
| Submitting with no answers at all | "Answer every question, then submit." |
| Submitting an answer belonging to a different quiz | "One or more answers do not belong to this quiz." |
| No access-granting enrollment found by the action | "You need an active enrollment to take this quiz." |

Proactive notices on the quiz page:

> You already passed this quiz. No further attempts are needed.

> You have an attempt in progress.

> You have used all 3 attempts for this quiz, so no new attempt can be started.

An abandoned attempt **still consumes one of the three**. Nothing expires or
releases it.

#### Notifications on grading

| Event | Who | Title and body |
| --- | --- | --- |
| Pass | student | **"You passed {quiz}"** — "You scored 80% and passed "{quiz}"." |
| Fail | student | **"You did not pass {quiz}"** — "You scored 40%. You have 2 attempts left." or, when none remain, "You scored 40%. You have used all 3 attempts." |
| Fail with attempts left | student | **"You can retry {quiz}"** — "You have 2 attempts left for this quiz." |
| Attempt started | instructor | **"{Student} started a quiz"** |
| Attempt submitted | instructor | **"{Student} submitted a quiz"** — includes the score |

A quiz limited to a single attempt offers no retake notice, because there is no
retake.

### 7.2 Assignments and handed-in work

#### What an assignment holds

| Piece of information | Rules |
| --- | --- |
| Which lesson | required — an assignment always hangs off exactly one lesson |
| Author | the signed-in instructor; server-set |
| Title | required, up to 180 characters, **unique within that lesson** |
| Instructions (the brief) | required, 10 to 20000 characters |
| Google Form link | optional, must start with the two accepted Google Forms addresses, up to 255 characters |
| Briefing document | optional uploaded file |
| Mark scale | optional whole number, 1 to 10000 |
| Hand-in deadline | optional, must be in the future when saving |
| Status | Draft, Open for submissions, or Closed; defaults to Draft |

A duplicate title on the same lesson gives:

> This lesson already has an assignment with that title.

A too-short brief gives:

> Describe what is being asked. A student should be able to answer from this
> alone.

A link that is not a Google Form gives:

> Use a Google Form link, which starts with
> https://docs.google.com/forms/ or https://forms.gle/

Mark scale bounds give:

> A mark has to be at least 1.
>
> A mark above 10000 is almost certainly a typo.

**An empty mark scale is legal** and means "not yet decided how this is marked".
The consequence is significant: a brief with no scale **can be published, read,
and submitted against, but cannot be marked.** The instructor page says
**"Not set — you cannot mark yet"**, the outline badge says
**"no mark scale yet"**, and the grading page says *"This assignment has no mark
scale yet, so nothing can be marked."* — the grading form is not even shown.

**An empty scale can never be set later**, because there is no edit action for an
assignment at all. Once a brief is created, its fields are frozen. The only
post-creation control is open/closed. Worth deciding before copying.

#### Briefing documents

Optional — a brief can be nothing but instructions.

- Accepted extensions: **pdf, doc, docx, odt, rtf, txt, png, jpg, jpeg, webp**
- Maximum **10 MB**
- Rejections: **"A briefing document must be under 10 MB."**,
  **"A briefing document must be one of: pdf, doc, docx, odt, rtf, txt, png,
  jpg, jpeg, webp."**
- Both the **file name** and the **actual contents** are checked, so a script
  renamed to `.pdf` is refused.

Stored on the private area under a generated name. The student's own file name
is never used as a path, only kept as a label.

#### Publication and closing

The create form has one checkbox, ticked by default:

> Publish this so students can see it
>
> Leave this unticked to keep it as a draft. A draft is readable by you and by
> nobody else, and can be published later.

Status is read **only** from that checkbox; a status sent in the request is
ignored.

**A brief cannot be published on a lesson that is not published:**

> Publish this lesson before publishing work on it. A student cannot reach a
> draft lesson.

A draft brief on a draft lesson is fine.

| Move | Message on success |
| --- | --- |
| Publish | Assignment published. Students can read it and hand in work. |
| Keep as draft | Assignment saved as a draft. Nobody can see it yet. |
| Close | Assignment closed. No more work will be accepted against it. |

**A closed brief can never be reopened.** Attempting to re-publish a closed one
is refused outright. Closing does not delete anything: the brief stays readable
by students, and already-handed-in work stays readable and marked. When closed,
the instructor page notes:

> Closed. Students can still read this brief and download what they handed in,
> but nothing new will be accepted.

There is no delete action, and none is needed, because nothing may be deleted
once it has hand-ins. Publishing or closing sends **no notification**.

#### The student's view

From the lesson page, work appears under **"Work to hand in"** — published and
closed briefs only, oldest first, never drafts. Each shows the title, a
140-character summary of the brief, a status badge, `out of {n}` when a scale
exists, and **that student's own state only**: either
`You: Checked and scored` and similar, or `You have not handed anything in`.

The assignment page shows, in this order:

1. **Your work** — the current state of their hand-in, first thing on the page.
   When there is nothing yet: *"You have not handed anything in yet. You can
   upload one file, and you can replace it until your instructor has marked
   it."*
2. **What is being asked** — the instructions split into paragraphs, then
   `Marked out of {n}` when a scale exists, then `Hand in by {date}` when a
   deadline exists, then the form and/or briefing buttons, then the note:
   *"The Google Form opens in a new tab. If you answer there, submit a file
   below as well so your instructor has something to mark."*
3. **Hand in your work** or **Replace what you handed in** — one file control.
   Below the button: *"After you hand in, this page will say your work is
   submitted and waiting for checking or scoring. Your instructor reads it and
   gives you a mark and a note."*
4. **Back to the lesson**

**There is no free-text answer box, no note-to-instructor field, and no
"prefer not to upload" option.** By design: a prose answer is not a submission.

#### Upload rules

| Rule | Detail |
| --- | --- |
| Required | missing file: **"Choose a file to hand in."** |
| Accepted extensions | pdf, doc, docx, odt, rtf, txt, png, jpg, jpeg, webp — a screenshot is deliberately allowed |
| Maximum size | 10 MB — "Your file must be under 10 MB." |
| Contents genuinely checked | JPEG, PNG, WebP, plain text, PDF, Word (old and new), OpenDocument text, RTF |

Both the name and the contents are checked, because either alone can be fooled.
A hostile file name such as `../../escape.pdf` cannot escape, and is kept only
as a label.

#### What is recorded per hand-in

The assignment, the student, the storage area, a **generated** path, the
original file name as a label only, the media type detected from the contents,
the real size, the state, the hand-in moment — and a cleared mark, cleared note,
and cleared marker.

**There is no attempt number, no note from the student, no revision history, and
no version list.** Exactly one hand-in record per student per assignment, for
ever. Re-uploading **deletes the previous file, overwrites the same record,
resets the state to waiting, and clears the mark, the note, and the marker.**

Success messages:

> Your file was submitted. Waiting for checking or scoring.

> Your new file was submitted. Waiting for checking or scoring.

#### Status wording for hand-ins

| Stored state | What the student reads |
| --- | --- |
| Waiting to be checked | **Submitted, waiting for checking** |
| Checked and scored | **Checked and scored** |
| Handed back to be redone | **Handed back to be redone** |

After being checked, the page shows the mark as `42 out of 50 (84%)` and the
instructor's note under **"Note from your instructor"**, with blank lines turned
into paragraphs. When handed back, an extra warning: *"Handed back to be redone.
Your instructor's note is above."*

#### Deadlines

Optional. If set, it must be in the future at creation. Students see
`Hand in by {date}`. Once the moment passes, the server refuses any hand-in
with:

> The date for this assignment has passed. Ask your instructor if you need more
> time.

and the page itself warns:

> The date for this assignment has passed, so the server will refuse a hand-in.
> Ask your instructor if you need more time.

**There is no grace period and no per-student extension.**

#### Grading

**The instructor's queue** lives on one assignment's page. There is deliberately
no "all my assignments" index — the question an instructor has is "what is
outstanding on this course". The page has, in order: a header with the set date
and author, the status badge and the open/close button; **The brief** with the
instructions and four facts (Mark scale, Hand in by, Handed in count, Waiting
count); **Waiting for you** — pending hand-ins, oldest first, each with the
student's name, their file name, how long ago, and **Open and mark**; and
**Already looked at** — everything checked or handed back, newest first, showing
the score where one exists, and an **Open** button. A handed-back hand-in is
deliberately **not** put back in the queue.

Empty queue:

> Nothing is waiting
>
> Nobody has handed anything in against this assignment yet.

or, when everything has been seen:

> Everything handed in against this assignment has been looked at.

**The grading form** is one form with two mutually exclusive outcomes, chosen by
a radio pair, deliberately so both cannot be filled in:

- **Give it a mark** — *"The student sees the mark and your note straight
  away."*
- **Hand it back to be redone** — *"No mark. The student sees your note and can
  upload again, which puts it back in your queue."*

Then:

| Field | Label | Rules |
| --- | --- | --- |
| outcome | radio pair | required |
| score | **Mark** | required when marking, forbidden when handing back; from 0 up to the assignment's own scale |
| note | **Note to the student** | **required** when handing back, optional when marking; up to 5000 characters |

The page also shows the brief in full, the hand-in's details (file name, size,
type, when it was handed in), a **Download and open it** button, and this note:

> It downloads rather than opening in this page. A file a student uploaded is
> arbitrary content, and this application will not render it inside the page you
> are signed in to.

When a mark already exists, a **What you recorded** panel appears first with
the mark, the note, and *Recorded {date} by {grader}*, and the form is retitled
**Change this**.

Failure messages:

> Choose whether you are marking this or handing it back.
>
> Enter the mark you are giving.
>
> Leave the mark empty when handing work back.
>
> That is above the mark this assignment is set out of.
>
> This assignment has no mark scale yet, so it cannot be marked.
>
> Say what needs changing, or handing it back teaches nothing.

Success messages:

> Mark recorded. {Student} can see it now.

> Handed back to the student with your note. They can submit again.

What each outcome records:

| Outcome | State | Score | Note |
| --- | --- | --- | --- |
| Give it a mark | checked and scored | the number given | as typed |
| Hand it back | handed back | left as it was | required |
| Hand back something already checked | handed back | **left in the record**, though not displayed | required |

Both outcomes are written as one all-or-nothing operation, so the state, mark,
note, and marker cannot disagree.

**Re-grading is allowed with no restriction.** The grading page is reachable for
a hand-in in any state, and checking something already checked overwrites the
mark, the note, the marker, and the time. The old value is not kept.

**The student is not notified at all.** No notification, no email, no in-app
notice. The only delivery is the page: the student sees it the next time they
open the assignment. This is a deliberate difference from quizzes, which do
write notifications.

**Only the instructor who owns the course may grade** — resolved through
hand-in → assignment → lesson → module → course. No enrolment test: an
instructor does not need to be enrolled in their own course. Another
instructor, a student (including the author of the work), and an administrator
are all refused.

#### Downloads of assignment files

Every assignment file leaves through one place. **No address serves a stored
path, and no address accepts a file name.** Files are never rendered inline: the
response is always an attachment with the media type, the length, a
no-sniff instruction, and private no-store caching.

The download file name is rebuilt from scratch: **only the extension** is taken
from the stored record, and it is given a fixed stem — `briefing` for a
briefing, `submission` for a hand-in. So a file called `essay.PDF` downloads as
`submission.pdf`, and a hostile stored name cannot influence the download name
at all. A record whose file is missing is reported as not found, never as an
empty success.

**Briefing downloads:**

| Who | Rule |
| --- | --- |
| Owning instructor | allowed, including while the brief is still a draft |
| Any other instructor | refused |
| Student | allowed only when the brief is **published** *and* the student has an access-granting enrollment |
| Student, brief is a draft | refused |
| Student, brief is **closed** | **refused** |
| Student, enrollment cancelled or awaiting payment | refused |
| Administrator | refused |
| Anyone, when the brief has **no file attached** | reported as not found — **and this check happens before the permission check** |

Two consequences worth naming. A **closed** brief is still readable by the
student and the page still shows a **Download the briefing** button — but that
download is refused, because the rule only admits published briefs. And because
the "no file attached" check precedes the permission check, a student can tell
whether a brief they may not read has an attachment.

**Hand-in downloads:**

| Who | Rule |
| --- | --- |
| **The student who handed it in** | allowed — matched against the signed-in person, **not** against the address. **No enrolment check and no brief-status check**, so a student can still fetch their own file after the brief closed or after their enrollment was cancelled. |
| Owning instructor | allowed |
| Any other instructor | refused |
| **A different student** | refused |
| A student trying to mark their own work | refused — downloading your own file and marking are different permissions |
| Administrator | **refused, deliberately** — "an administrator can see that work exists and who wrote it, but marking happens between an instructor and a student and no one else has a place in it" |

Two separate addresses exist for the same stored file — one for the instructor,
one for the owner — deliberately, so neither has to branch on the reader's role.

#### How assessment affects progress and completion

**Quizzes: yes.** Passing counts, but only **required, published** quizzes.

**Assignments: no, not at all.** The progress percentage counts only lessons
marked complete. Completion counts required lessons and required published
quizzes. **Hand-in work is never consulted**, so handing in nothing, handing in
everything, failing every assignment, or being marked zero on everything have
**no effect** on completion or on a certificate. The administrator's own report
describes one funnel step as *"Every required lesson, quiz and hand-in done"*,
which overstates what is actually checked.

Assignment data **does** reach the reporting area as a queue summary: total
briefs, published briefs, waiting, checked, handed back, and a mean mark
expressed as a share of each brief's own scale.

---

## 8. How a course is finished and certified

### 8.1 The requirements

Each course has a requirements record, **created automatically the first time
it is needed**, with these defaults. There is no authoring screen anywhere in
the product for these values.

| Requirement | Default | What true means |
| --- | --- | --- |
| All lessons required | yes | every lesson counted below must be finished |
| Minimum lesson percentage | not set | finished divided by total must reach this value; when total is zero the percentage counts as 100 |
| Required quizzes must be passed | yes | every published quiz flagged required must have a passed attempt |
| A passing score must be met | yes | only attempts that passed count |
| Certificates enabled | yes | a certificate may be claimed at all |

**Lessons counted:** published lessons of the course, restricted to required ones
when "all lessons required" is on. **Module publication is *not* checked here** —
which differs from the percentage, where a published module *is* required.

**Quizzes counted:** published quizzes of the course, restricted to required ones
when "required quizzes" is on. Pass or fail comes from the quiz's own passing
score.

**Assignments are not part of completion at all.**

When the check runs it returns whether the student is eligible, a list of
plain-language reasons, and four counts. The exact reason strings are:

> Finish every required published lesson.
>
> Reach the required lesson percentage.
>
> Pass every required published quiz.

### 8.2 Claiming is manual

Finishing the last requirement does **not** complete the course. The student
must press **Claim certificate**, offered in three places: the course page's
certificate panel, the certificates list row, and the equivalent in the
browser application.

Eligibility is recomputed from stored records at the moment of the press, never
from anything sent with it.

On success, in one all-or-nothing operation: the enrollment becomes
**Completed** with a completion moment, and exactly **one** certificate record is
created.

| Situation | Message |
| --- | --- |
| First issuance | Course completed. Your certificate is ready. |
| Pressing again | You already completed this course. |
| Certificates disabled for the course | This course does not issue certificates. |
| Requirements unmet | the three reason strings above |

Two notices go to the student: **"You completed {course}"** — *"You finished
every requirement for "{course}"."* — and **"Your certificate is ready"** —
*"Your certificate for "{course}" is ready to view."* The second is skipped if
no certificate exists.

### 8.3 Completion cannot be undone

**No action exists to un-complete an enrollment or revoke a completion.** Three
consequences, stated plainly:

- Content changes after completion never revoke anything. Renaming a lesson
  after issuance leaves the certificate valid with no revocation date.
- A new required lesson added after issuance **does not** un-complete the
  enrollment — but it does make the course ineligible again, which matters only
  if somebody tries to reissue or re-claim.

### 8.4 What a certificate record holds

The enrollment, the student, the course, a unique verification code, **a
snapshot of the student's name**, **a snapshot of the course title**, the
completion date, who issued it, which certificate it replaces, the state, when
it was revoked, and why.

**The snapshots are the point of the record.** Renaming the learner or the course
afterwards does not rewrite the document. The certificate says what was true when
it was issued.

Nothing about a certificate is mass-assignable except the revocation reason, so
posting a code, a state, a student, a completion date, or an issuing person
changes nothing.

A field called the *active slot* holds `1` while the certificate is the one valid
one and is cleared once revoked. Because the database ignores blanks in
uniqueness rules, this allows any number of revoked records while permitting
**only one valid certificate per enrollment**.

### 8.5 The verification code

Format: `ITH-XXXX-XXXX-XXXX-XXXX` — sixteen characters grouped in fours, drawn
from digits and consonants only, so a code can never be read aloud as an
word. Generated from a secure random source and regenerated until unused.

A reissued certificate always gets a **different** code.

**There is no public verification page or address.** The code appears on the
student's certificate, on the administrator's list, and in the data the
application serves. That is a deliberate boundary: certificate access is
authenticated, not public.

### 8.6 The student's certificate list

One card per access-granting enrollment, newest first, showing the course title,
the instructor's name, `Lessons: X of Y`, `Quizzes: X of Y`, and exactly one of
three states:

| State | What is shown |
| --- | --- |
| A certificate exists | a badge reading **Valid** (green) or **Revoked** (red); when revoked, the reason in a red note; and a **View certificate** button |
| No certificate, and eligible | "You meet every requirement. Claim your certificate." plus **Claim certificate** |
| Otherwise | **Still to do** followed by the exact reason strings |

Empty state:

> No enrollments yet
>
> Enroll in a published course to start your learning record. A certificate
> appears here once every requirement is met.

A refused load does **not** show as an empty list. A refusal reads **"This page
is not available to your account."** and anything else reads *"Your certificates
could not be loaded. Try again in a moment."*

The list returns exactly ten pieces of information and never a whole account
record, a whole course record, or anything password-shaped. This is asserted by
an exact key-list check and a raw-substring check.

### 8.7 The single certificate page

Reads **"Certificate of Completion"**, then **"Issued {date}"**, then:

> This certifies that {name as issued} has completed {course title as issued}

then the code in a fixed-width face, and a status badge of **Issued** or
**Revoked**.

When revoked, a red note:

> This certificate was revoked.

followed by the reason, then *"Revoked on {date}."* When it replaced an earlier
one: *"This certificate replaces an earlier revoked certificate."*

Every certificate carries a standing note:

> This certificate is a record of completion inside IT Learning Hub. It is not
> an accredited academic document, and this page is visible only to you while
> you are enrolled in the course.

There is a **Print this certificate** button that opens the browser's print
dialogue.

Refusals are worded distinctly: **"This certificate is not yours to open."** when
it is forbidden, and **"That certificate does not exist."** when it is not found.

### 8.8 Administrator certificate administration

One page, twenty-five per page, newest first. Each row shows the student, the
status, **the course title snapshot**, the code, the completion date, and — for
a revoked one — `Revoked: {reason}` or `Revoked.`

Empty state:

> No certificates issued yet

The page describes its own rules:

> Revoking keeps the record and the reason. Reissuing creates a linked
> replacement after a fresh eligibility check.

There is **no bulk action, no export, and no search or filter.**

**Revoking** requires a recorded reason: a string up to 2000 characters, with
the message:

> Record why this certificate is being revoked.

Status, revocation time, code, issuing person, and student are all rejected if
supplied by the browser. Revoking an already-revoked certificate is refused:

> This certificate is already revoked.

and the original reason is preserved. On success the state becomes revoked, the
time is stamped, the reason is stored, and the active slot is cleared so a
replacement can claim it. **Nothing is deleted.**

The student is notified: **"Your certificate was withdrawn"** — *"Your
certificate for "{course}" has been withdrawn."*, plus *" Reason: {reason}."*
when one was recorded.

Success message:

> Certificate revoked. The record is kept for audit.

**Reissuing** only works on a revoked certificate:

> Only a revoked certificate can be reissued.

**A fresh eligibility check runs first.** If the student no longer meets every
requirement, the request is refused with the completion reason strings and **no
certificate is created**. On success a **new** record is created with a fresh
code, fresh snapshots, a link back to the original, and the active slot claimed.
The original stays revoked and readable in the audit trail.

The student is notified: **"Your replacement certificate is ready"** — *"A
replacement certificate for "{course}" has been issued."* — and the notice links
to the **replacement**, not the original.

Success message:

> Certificate reissued as {CODE}.

**A gap worth knowing.** Opening a revoked certificate's own address works and
reads **Revoked** with the reason and date. But **the list does not show it**,
because the list is scoped to valid certificates only. Two consequences follow
from that one scoping choice: a student who still meets the requirements can
**claim a brand-new certificate themselves** after a revocation, which bypasses
the administrator's reissue chain; and if the administrator reissues afterwards,
the insert collides and the caught failure reports the student's own certificate
as if it were the replacement.

---

## 9. How money is handled

### 9.1 How money is stored

Money is stored as **whole minor units** — centavos — plus a three-character
currency code. `9950` means ₱99.50. **Only Philippine pesos are permitted**, and
that is enforced by a database rule, not only in the application.

One formatter owns every displayed amount. It produces `₱499.00` — thousands
separated, always two decimals. A course price displays as the word **Free**
instead of `₱0.00`. A stored charge is never displayed as Free.

### 9.2 Who decides the amount

**The course record.** The chargeable amount is copied from the course in
exactly one place. Nothing is read from the browser. Posting an amount, a
currency, or a state to the payment address changes nothing — the stored payment
still holds the course's amount and currency and a pending state.

The checkout button label is built from the course record too: **"Pay
₱1,250.00"**.

### 9.3 The complete checkout sequence

1. The student presses **Enroll to pay** or **Continue payment**.
2. The server resolves the student's **own** enrollment for that course and
   requires it to be **waiting for payment**. Anything else is reported as not
   found — deliberately not as forbidden, so an intruder cannot confirm that a
   purchase exists.
3. Permission is checked: an active student, their own enrollment, the enrollment
   waiting for payment, and the course **published, paid, and priced above
   zero**. This is what stops a free course being "purchased".
4. A payment record is created in a waiting state — or reused; see below.
5. The server asks the payment provider to create a hosted checkout containing:
   one line item at the stored amount and currency, named after the course,
   quantity one; a description reading "IT Learning Hub — course enrollment";
   the payment methods **QR Ph, GCash, and Maya** — cards deliberately excluded,
   falling back to QR Ph alone if the configured list of methods is empty; a flag
   to show
   the description; **both** the success and the cancel return addresses set to
   the application's own waiting page; and the correlation reference.
6. The returned checkout id is stored on the payment. The provider's page
   address is **not** stored — it is used immediately in a redirect away.
7. If the provider's address is not an `https://` address, the whole thing is
   refused:
   > The payment provider did not return a usable checkout address.
8. The student pays, or does not, on the provider's page.

### 9.4 The return page

**The success address and the cancel address are the same page.** The page
cannot tell which button was pressed, and says so:

> This page cannot report which button was pressed, so it waits for the
> provider's signed event and updates itself.

It shows three states:

| State | Heading and explanation | Action |
| --- | --- | --- |
| Confirmed | **Payment confirmed** — "The payment provider confirmed this payment and your enrollment is active." | **Open course** button, no polling |
| Failed | **Payment did not go through** — "Nothing was charged, and your enrollment is still waiting. You can start the payment again." | retry offered |
| Still waiting | **Waiting for payment confirmation** — "This page does not confirm payment by itself. Your enrollment becomes active only after the payment provider sends a verified confirmation to the server." and "This page checks for you every few seconds. You can also reload it." | polls |

The page reloads itself every five seconds, **but only while the payment is not
yet confirmed**. A settled payment stops the reloading.

It always shows the course price from the course record, the payment state (or
a **Not started** badge), and the correlation reference (or **Not created**),
with the note:

> Quote the reference above if you need to ask for help.

And it explains the provider's test buttons:

> choose **Authorize test payment** to complete the payment, or **Fail or expire
> test payment** to see the retry path.

### 9.5 What each payment record holds

The enrollment, the student, the course, the amount in minor units, the
currency, the state, the provider name, the provider's payment id, the
provider's checkout id, the provider's reference, an idempotency key, a failure
code, a failure message, and the paid, cancelled, and refunded moments.

**Nothing about a payment record is mass-assignable.** Every write goes through
an explicit field list, so a posted field cannot reach a payment row. No secret
is ever written to a payment record.

**The idempotency key is derived from the enrollment** — a fixed prefix plus the
enrollment id — and is unique per enrollment.

**Retrying reuses the same payment record.** Because the key comes from the
enrollment and the lookup ignores the payment's state, pressing "Try payment
again" or "Start payment again" finds and reuses the existing record and simply
overwrites the checkout id. **No second payment record is created.** This is
asserted by pressing checkout twice and counting exactly one payment.

### 9.6 Every payment state and transition

| From | To | Trigger |
| --- | --- | --- |
| nothing | Waiting | checkout started |
| Waiting | Confirmed | a verified paid event where the amount **and** currency both match |
| any non-confirmed | Failed | a verified failure event |
| any | Refunded | a verified refund event |
| Confirmed | Confirmed | a second, different paid event — a no-op, "Already paid." |

Enrollment side effects: only a confirmed payment activates a waiting
enrollment, and only a refunded payment cancels an active one.

The **cancelled** payment state exists in the data model and is read by the
display logic, but **nothing in the system ever produces it.** Whether that is
an oversight is uncertain.

### 9.7 The provider's signed event

**One public address accepts these events, and it is signed-message verified.**

**Rejections**, both reported as unprocessable with a plain body:

> The request body must be a structured object.
>
> The submission does not look like a payment event.

**Success** is always acknowledged, so the provider stops retrying:

> accepted: true, with the outcome

The reported outcome never leaks internals. No stack traces, no query text.

**Which events are handled:**

| Event | Effect |
| --- | --- |
| "checkout session, payment paid" | settles the payment and activates the enrollment |
| the alternate documented spelling of the same | the same |
| "payment paid" | the same, at payment level rather than checkout level |
| "payment failed" | marks the payment failed; the enrollment stays waiting |
| "payment refunded" | marks the payment refunded and cancels an active enrollment |
| "refund succeeded" | the same |
| anything else, such as a payout or an expired checkout | recorded, then ignored; nothing changes |

Both documented envelope shapes are accepted, by reading a fixed ordered list of
exact locations for each field — nothing is guessed. The correlation key is read
from either of two documented fields, which is why payment-level failure events
can be matched at all.

**Authenticity verification.** The provider's signature header is parsed as a
timestamp plus a test digest plus a live digest. The signed message is the
timestamp, a dot, and the **raw** request body, hashed with the server's signing
secret for that address and compared in **constant time**. Only the slot matching this server's
configured mode is compared, so a live-mode signature is refused by a test server
and the reverse. **The timestamp is deliberately not checked for freshness**,
because the provider retries a failed delivery up to twelve times carrying the
original timestamp; replay is prevented by the event-id record instead.

Every verification failure is treated as "not verified": no secret configured,
header absent, header malformed, digest mismatch. Each is logged with a reason,
short prefixes of the received and computed digests, the body size, a short
prefix of the body's own hash, and the secret's length. **The secret itself is
never logged.**

**Order of processing:**

1. Look up the event by provider and provider event id. If it already exists and
   was processed, return it immediately — **before verifying the signature**, so a
   later request reusing the id, forged or not, cannot rewrite history.
2. Verify the signature against the raw body.
3. Record the event, idempotently, as received.
4. If not verified → outcome ignored, reason *"Signature verification failed."*
   Nothing else is touched.
5. If the payload's mode flag is present and does not match this server →
   ignored, *"Event livemode does not match this server, so it was not
   applied."*
6. Resolve the payment, by reference or key first, then by checkout id or
   payment id. No match → ignored, *"No matching payment."*
7. Apply, in one all-or-nothing operation with the payment row locked:

| Situation | Outcome | Reason recorded |
| --- | --- | --- |
| already confirmed | processed | Already paid. |
| reported amount present **and different** from the amount owed | **ignored** | The settled amount does not match the amount owed, so the payment was not applied. |
| reported currency present **and different** | **ignored** | The settled currency does not match the currency charged, so the payment was not applied. |
| otherwise, paid | processed | Payment settled and enrollment activated. — confirms the payment, stamps the time, records the provider payment id, **clears** any failure code and message, and activates a waiting enrollment |
| failure | processed | Payment failed; enrollment stays pending. — records the provider payment id, a failure code from the payload or the literal `failed`, and a failure message from the payload or *"The provider reported a failed payment."* The enrollment is **unchanged**. |
| refund | processed | Payment refunded; access removed. — stamps the refunded time and, if the enrollment is active, cancels it |

8. Any unexpected failure is logged with the event id, type, and message, and the
   outcome is recorded as failed. Nothing else propagates.

**Note on the amount and currency comparison:** an amount or currency that is
**absent** from the payload skips the comparison entirely, and a non-integer
amount counts as absent. So a provider shape this reader does not recognise
**skips the check rather than failing closed.**

**Idempotency has three independent mechanisms:** a uniqueness rule on provider
plus event id, the early return for an already-processed event, and the
already-confirmed short-circuit under a row lock. These are asserted by
delivering the identical signed body five more times, and by delivering two
*different* paid event ids for one payment — both leave one event per id, one
payment, one activation, and the original paid moment unchanged.

When a payload carries no usable event id, the id is a hash of the raw body, so
a byte-identical retry maps to the same key while a different event does not.

### 9.8 What happens if the event never arrives

There is **no reconciliation, no scheduled job, no polling of the provider, and
no "mark as paid" button for anyone.** The only two things that happen are:

1. The return page reloads itself every five seconds **while that browser tab
   stays open on it**.
2. After **24 hours**, measured from when the payment record was created, the
   My courses card relabels the state as:

   > **Payment expired**
   >
   > The checkout was left unfinished and can no longer be paid. Start a new
   > one.

   with a **Start payment again** button.

**Access is blocked the whole time.** An unpaid enrollment cannot open the
course, cannot open a lesson, cannot record progress, cannot mark a lesson
complete, cannot sit a quiz, cannot download a material, and cannot claim a
certificate.

One wrinkle: pressing "Start payment again" creates a new provider checkout,
but retries reuse the same payment record, so its creation time is unchanged —
and the card therefore **keeps reading "Payment expired"** rather than returning
to awaiting payment, until the event arrives.

### 9.9 Payment failure messages

| Situation | Result |
| --- | --- |
| Provider cannot be reached | server error page — *"The payment provider could not be reached."* (logged first) |
| Provider rejects the checkout | server error — *"The payment provider rejected the checkout."* |
| Provider returns an incomplete checkout | server error — *"The payment provider returned an incomplete checkout."* |
| Payments switched off on the server | server error — *"Payments are not enabled on this server."* |
| Secret key not configured | server error — *"The payment provider secret key is not configured."* |
| Provider address is not https | server error — *"The payment provider did not return a usable checkout address."* |
| Checkout attempted on a free course, a zero-priced course, a cancelled or active enrollment, or by a non-owner | not found, or refused |

The only address that accepts events from the provider is exempt from
cross-site protection, and it authenticates by its own signature on every call
rather than by a token.

---

## 10. How people talk to each other

### 10.1 Two kinds of conversation

| Kind | Belongs to a course | Who may be in it |
| --- | --- | --- |
| **Course thread** | yes, exactly one | whoever opened it, plus the counterpart |
| **Support thread** | no | whoever raised it, plus an administrator who joins |

**Admission comes from the participant record, not from the role.** That single
decision produces several consequences worth knowing:

- An instructor **cannot** read a support request even about a student they
  teach.
- An administrator **cannot** read a course thread they are not in, and
  **cannot post into one even if they were** — there is no teaching role in an
  administrator.
- A student cannot open another student's thread.

### 10.2 Course threads

Exactly one thread per pair of people per course. The thread's identity is built
from the two people ids in a fixed numeric order plus the course id, so **who
pressed the button cannot change which thread you land on** — a student asking
about a course and the instructor asking about the same course arrive at the
same conversation.

| Who may open one |
| --- |
| A student, for a course they are enrolled in with access, against that course's instructor |
| An instructor, for a course they own, against a student of that course |
| An administrator — **no** |

Refusals:

> You share no course with this person, so there is nobody here to message.
>
> You cannot open a conversation with this person about this course.

### 10.3 Support threads

Any active account of any role may raise one. Each raise creates a **new** thread
with a fresh random identity, so two different problems from one person are two
threads, never merged.

The form asks **"What is this about"** (a subject, up to 160 characters) and
**"Tell us what happened"** (up to 5000). Submitting creates the thread and
immediately posts the body as its first message, then redirects with:

> Request sent. An administrator will reply here.

Refused, with:

> Your account cannot raise a support request.

### 10.4 Messages

The body is trimmed, required, and limited to **5000 characters**.

| Situation | Message |
| --- | --- |
| Empty or only whitespace | Write something before sending. |
| Over 5000 characters | A message is limited to 5000 characters. |
| A send token that is present but invalid | The send token is not valid, so the message was not sent. |

Bodies are stored as written and escaped on output.

**Sending is idempotent.** Posting is keyed on thread, author, and a token.
Repeating a token returns the original message and the page says:

> That message was already sent.

A fresh post says:

> Message sent.

### 10.5 Read and unread

Read state is per person, and measured as **messages written by somebody else
with an id higher than the last id that person read**. It is deliberately
id-based rather than time-based, because timestamps here have whole-second
resolution and time-based reading would drop messages sent in the same second.

A person who has read nothing sees the whole thread as unread. Opening a thread
marks it read. Sending a message marks your own read up to that message. A
suspended account cannot mark anything read. **Archived threads are excluded from
unread counts.**

### 10.6 Archive, close, reopen

| Action | Belongs to | Effect |
| --- | --- | --- |
| **Archive** | the person | hides the thread from that person's list only. Nothing is deleted, and the other participants are unaffected. |
| **Close** | the thread | makes it read-only **for everyone**. Administrator-only, and only for support threads. |
| **Reopen** | the thread | guarded by the same permission as close, so **only an administrator may reopen**. A student who wants to add to a settled request cannot. |

Neither archive nor close removes a record.

Messages:

> Thread archived.
>
> Thread closed.
>
> Thread reopened.

On a closed thread:

> This thread is closed, so it is read only. Reopen it to reply.

**A gap:** un-archiving exists as a capability in the state helper but **no
route or control offers it**, so it is not reachable through the interface.

### 10.7 What each person sees

**The list** shows that person's own threads, newest activity first, twenty per
page, archived threads hidden. Each row shows a title (the course title or the
subject, falling back to "Support request"), a Course or Support badge, a Closed
badge when closed, the opening words of the last message cut to 90 characters,
the message count, the participant count, a relative last-activity time, and an
unread bubble.

Header line:

> N unread messages across your conversations.

or, when nothing is unread:

> Every conversation you are part of, newest activity first. Nothing is unread.

Empty state:

> No conversations yet

**A thread** shows fifty messages per page, the composer **only while the thread
is open**, and a side panel **"In this thread"** listing the other participants
with their role words — or, when nobody else is there yet:

> Nobody else is in this thread yet. An administrator joins when they reply.

### 10.8 The administrator support queue

Lists every support thread with, per row, the requester, the message count, and
the last activity. The button reads **"Pick up and reply"** when the
administrator is not yet a participant, and **"Reply"** when they are.

**Before joining, an administrator cannot open the thread.** Opening it is
refused. Attempting to join a *course* thread reports it as not found, not as
forbidden.

Joining writes the administrator's participant record and marks the thread read
up to the newest existing message, then tells the requester:

> Your request is with an administrator
>
> Someone will reply to '{subject}' shortly.

Joining twice notifies once and does not duplicate the participant record.

**How it resolves.** The administrator replies inside the thread; the requester is
notified. When it is dealt with, an administrator closes it: the thread becomes
read-only, the composer disappears, and it stays in the queue with a Closed
badge. Only an administrator can reopen it.

### 10.9 Announcements

Two scopes and no third: **course** (belongs to exactly one course) and
**platform** (belongs to no course). **The scope is decided by which form was
submitted** — a request cannot declare itself a platform announcement.

| Who may publish |
| --- |
| Into a course | only the instructor who owns it, with an active account |
| To the platform | only an active administrator |
| An instructor publishing to everybody | refused |
| An administrator publishing into a course | refused — administration is not teaching |
| A student | refused |

**Limits:**

| Piece | Rule | Message |
| --- | --- | --- |
| Title | required, 3 to 160 characters | Give the announcement a title. / The title is too short to be useful. / The title is limited to 160 characters. |
| Body | required, 10 to 5000 characters | An announcement with no text says nothing. / Say a little more than that. / The announcement is limited to 5000 characters. |

**There is no draft state and no edit.** Publishing is immediate and the record
is immutable afterwards. A duplicate is refused:

> You have already published an announcement with this title.

**Who receives them.** A course announcement reaches the students the access
rule authorises for that course — enrolled or completed, active account — and
**nobody else**. Cancelled and awaiting-payment enrollments get nothing;
unenrolled people get nothing; **the instructor who wrote it gets nothing**. A
platform announcement reaches **every active account of all three roles**,
including instructors and administrators; suspended accounts get nothing.

**Where they appear.** In that person's announcement list, twenty per page newest
first, plus a notification. Reading is an **enrolment** question rather than a
role question: the author sees their own at either scope, the owning instructor
sees their course's, an enrolled student sees the course's, an administrator sees
all platform ones plus what they authored. **A course announcement about an
unpublished course is unreadable by anyone except its author.**

**Moderation: author-only.** Withdrawal deletes the record and, in the same
all-or-nothing operation, the notices pointing at it by subject — keyed on the
announcement, so notices about other announcements survive. Message:

> Announcement withdrawn.

**There is no administrator override.** An administrator cannot remove an
instructor's announcement, and no other instructor can either.

### 10.10 Notifications

**Eighteen types exist.** Each has one sentence and one tone.

| Type | Trigger | Reads as | Goes to |
| --- | --- | --- | --- |
| course enrollment | student enrolled | Enrollment | instructor |
| course content published | course, module, lesson, or material published | New course content | authorised enrolled students |
| course completed | course finished | Course completed | student |
| lesson started | student opened a lesson | Lesson started | instructor |
| lesson completed | student finished a lesson | Lesson completed | instructor |
| quiz started | student started a quiz | Quiz started | instructor |
| quiz completed | student submitted and was graded | Quiz submitted | instructor |
| quiz passed | attempt passed | Quiz passed | student |
| quiz failed | attempt failed | Quiz not passed | student |
| retake required | failed with attempts left | Retake available | student |
| certificate available | certificate issued with completion | Certificate available | student |
| certificate revoked | certificate withdrawn | Certificate revoked | student |
| certificate reissued | replacement issued | Certificate reissued | student |
| announcement | course announcement published | Announcement | enrolled students |
| system announcement | platform announcement published | System announcement | every active account |
| course message | message posted in a course thread | Course message | other participants |
| support message | message posted in a support thread | Support request sent | other participants |
| support reply | administrator picks up a support request | Support reply | requester |

The content-published notice fires **only** when the subject's state is
published, so archiving produces nothing. A pass writes one notice; a fail writes
one plus a retake notice **only when the quiz's own attempt limit says a try is
left** — a quiz limited to one attempt offers nothing. Lesson and quiz notices
are keyed on the transition and the type, so starting **and** finishing a lesson
produces two distinct notices, while repeating either produces one.

**Delivery is in-app only.** No email, no text message, no push. The text is a
snapshot taken at the moment it was raised and **never recomputed**.

**Rules enforced at the single point where a notice is written:**

- a title must be non-blank and at most 160 characters,
- a course-scoped type must carry a course, and an unscoped type must not,
- a de-duplication key must be meaningful, non-empty, and at most 120
  characters — **refused rather than truncated**,
- a link must be a path inside the application: no scheme, no protocol-relative,
  no control characters, no foreign host,
- and a link must be accompanied by a permission check, and is **dropped rather
  than stored** if the recipient may not follow it.

Only a de-duplication collision is swallowed as a suppressed repeat; any other
failure propagates.

**Uniqueness** is per recipient plus key. A blank key never suppresses anything,
so a repeatable notice with no key can be written repeatedly. Reading a notice
does not re-open its key.

**The centre.** Twenty per page, newest first, ordered so ties are stable. Each
row shows the type sentence, the title, the body, a relative time, a dot when
unread, an **Open** button when a link survived the checks, and a **Mark read**
button when unread. **Mark all read** appears only when the unread count is
above zero.

Marking an already-read notice is not an error and does not move its timestamp.
Mark all read touches **only the actor's own notices**.

**The bell** shows the unread total, the most recent five notices, and over 99
it displays `99+` with the true figure in the accessible name. The count is
scoped to the signed-in account only.

**What a person is not notified about.** Their own message never notifies them,
so the thread they are actively typing in never adds a badge. A support
thread's very first message reaches nobody, because at that moment the only
participant is the author. There is no "message sent" measurement, no
notification-read measurement, and no measurement for a duplicate message.

**Access: recipient only, with no administrator override at all.** Marking
somebody else's notice read is refused, even for an administrator — deliberately,
because an administrator who could read every student's notices would learn
things such as a suspension, a removed enrollment, or a failed quiz.

### 10.11 Navigation, served from the permission rules

The sidebar and the data the browser application uses are built from **one**
source. Every item is filtered through a permission check, and an item the server
says no to is not returned at all. A suspended or unrecognised account gets
nothing — no groups, no items.

**Student** — *Learning*: Dashboard, My courses, Certificates. *Account*:
Announcements, Messages, Profile, Password.

**Instructor** — *Teaching*: Dashboard, My courses. *Account*: Announcements,
Messages, Profile, Password.

**Administrator** — *Operations*: Dashboard, Users, Certificates, Reports,
Analytics, Activity log, Support. *Account*: Announcements, Messages, Profile,
Password.

Item-level gates: Users requires "view any user"; Certificates requires the
ability to revoke a certificate; Activity log requires "view any activity log";
Support requires "view any support"; instructor course items require the ability
to create or view a course.

This is served fresh per request with no caching, and the browser side refetches
it on every client-side navigation. **The supplied navigation is a hint about
what to draw, not a grant** — every destination checks again on arrival.

---

## 11. How an administrator runs the place

### 11.1 Managing users

The page is titled **Manage users** and described as:

> Search verified accounts, assign one approved role, and manage active access.
> A suspended account cannot sign in or continue a session.

**Search and filters** (all on one form, so the address is shareable):

| Control | Behaviour |
| --- | --- |
| Search users | case-insensitive substring on **either** the name or the email. Placeholder: "Name or email". |
| Role | All roles, Student, Instructor, Administrator |
| Account status | All statuses, Active, Suspended |
| Filter / Clear | both present |

Unrecognised filter values are ignored rather than rejected.

Result count: **"3 accounts matched"** or **"1 account matched"**.

Empty state:

> No accounts match
>
> Try a different search term, or clear the role and status filters.

**Fifteen accounts per page**, newest first, with the query string preserved
across pages. Each row shows name, email, an **"Email not verified"** marker
when unverified, the role, the status, the creation date, and the two action
controls. It is a table from tablet width up and stacked cards below it.

**The role control appears only for verified accounts.** An unverified account's
row instead shows:

> Role changes unlock after email verification.

Both controls are hidden entirely on the acting administrator's own row,
replaced by the note:

> Your own role and account status cannot be changed here.

**There is no control anywhere on this page to edit anybody's name, email, or
password**, and no control to view or change the audit records.

### 11.2 The dashboard

The administrator dashboard opens with a row of real counts, then a panel of the
**five newest registrations** with name, email, role badge and status badge, plus
a **Manage users** link.

### 11.3 The activity record

Covered in section 3.8. In summary: exactly two event types, read-only, twenty-five
per page, newest first, with **no filtering at all** — no date range, no event
type filter, no actor filter, no search. Five columns, no field names. Never
credentials, session values, network addresses, or browser information.

### 11.4 The operational report

One page, administrator-only.

**Four totals:** published courses ("Live in the catalog"), enrollments (with a
hint of how many are in progress), certificates issued ("Issued and valid"), and
confirmed payments ("Confirmed by the provider").

**A five-step funnel, "Where learners stop"**, in fixed order, each a share of
everybody enrolled, and each **clamped to the step above it** so the shape only
ever narrows:

1. **Enrolled** — every enrollment in any state
2. **Started a lesson** — has opened at least one lesson
3. **Completed a lesson** — has finished at least one lesson
4. **Finished the course** — every required lesson, quiz and hand-in done
5. **Certified** — a certificate issued and still valid

Below each bar, when there is a drop: **"N did not reach this step"**. A learner
with four finished lessons counts **once** at each of the first three steps, not
four times. An enrollment with no progress is enrolled and nothing else.

**A grading queue, "Work waiting to be checked"**: Waiting, Checked, Handed back,
and Mean mark. The three submission states add up to the total number of
submissions. **The mean mark is each mark as a share of its own brief's scale,
averaged** — so briefs marked out of 10 and out of 100 are comparable. A brief
with no scale is excluded. With no marks at all it shows an em dash and *"Nothing
has been marked yet"* rather than a zero.

**Enrollments by state**, drawing every state including the empty ones:
Awaiting payment, In progress, Completed, Cancelled.

**Progress by course**, one bar per published course on a fixed 0–100 scale so
two courses compare by length. A course with nobody enrolled is drawn at zero with
the hint **"No enrollments"** rather than omitted, and is named in a warning
below.

**A table of the fifty newest enrollments** with exactly five columns: Student,
Course, State, Quizzes passed, Amount paid. Amount is formatted from the stored
minor units and currency, or **"Not paid"**. Footer: "Showing the N most recent
enrollments."

**Filters, dates, export, print: none.** No date range, no filter controls, no
sort controls, no pagination links on the table, no export, no print button.
Everything shown is all-time and unfiltered.

Empty states: **"No enrollments yet"** and **"No enrollments yet."**

### 11.5 Who may run it

**Active administrators only.** An instructor or a student gets a refusal, and
an unauthenticated visitor gets a refusal in this area too.

The same four totals are available as data to administrators, **deliberately
excluding the paginated table and the chart shapes**. A test asserts the two
surfaces agree figure for figure and that each costs no more queries than the
other.

### 11.6 The instructor's equivalent

The learner roster page (section 4.9) shows one row per learner on one owned
course with their real completion percentage, lessons completed out of total
required published, and how many quizzes they passed. Cancelled and
awaiting-payment enrollments are excluded. A learner at 100% of lessons with
nothing passed is shown as exactly that.

---

## 12. How the system measures itself

This is a **separate system** from the report and from the activity record. It
reads a table of recorded behaviour. **Administrator only** — the page and the
data behind it both refuse instructors and students, because these records hold
the behaviour of the whole application.

### 12.1 The time window

Four buttons: **Today**, **7 days**, **30 days**, **90 days**. The chosen window
travels in the address, so a link preserves it and the back button steps through
windows. An unknown or missing window falls back to 30 days, and the response
**states which window it actually used** rather than failing.

Windows are half-open and day-aligned, so the last moment of a day is never
dropped.

### 12.2 The four headline figures

| Figure | What it counts | Caveat printed beside it |
| --- | --- | --- |
| **Page views** | every page load; data requests are excluded | counts pages people actually saw |
| **Events recorded** | everything logged in the period, of every kind | |
| **Sessions** | distinct session identifiers | the identifier is replaced at every sign-in, so one visit can be several sessions — **an upper bound on visits, not a count of them** |
| **Registered accounts active** | signed-in accounts with activity in the window | people not signed in are not counted, and no identifier exists that could count them |

### 12.3 What else is shown

- **Activity over time** — one point per day across the window, **including days
  with nothing on them**.
- **Most visited pages** — top ten, with numeric segments folded to a placeholder
  so every lesson page reads as one page. **Only digit runs are folded**, so a
  year in a path is not merged with an id.
- **A learning funnel of six steps** in dependency order: Page views, Course
  pages viewed, Enrolled, Lessons opened, Lessons completed, Courses completed.
  Each counts what happened, **not how many people did it**, and no conversion
  rate is derived from them.
- **Courses by activity** — a **table, not a chart**: course (falling back to
  `Course #{id}` for a deleted course), Views, Enrolled. Top ten by views; rows
  with no course are dropped.
- **Devices, browsers, and operating systems** — splits of the window's page
  views, each filtered to what actually happened so a chart of zeroes does not
  read as full bars. Devices: Desktop, Mobile, Tablet, Unclassified. Browsers:
  Chrome, Firefox, Safari, Edge, other.
- **Everything recorded** — all event types in six groups, **including the ones
  that did not happen**, so a zero reads as "that did not happen" rather than "we
  do not measure that":

| Group | Labels |
| --- | --- |
| Learning | Enrolled in a course, Lessons opened, Lessons completed, Courses completed |
| Assessment | Quizzes started, Quizzes passed, Assignment submissions |
| Credentials | Certificates issued, Certificates revoked, Certificates reissued |
| Content | Courses created, Lessons or quizzes published, Announcements published, Materials downloaded |
| Accounts | Sign-ins, Registrations, Sign-outs |
| Discovery | Page views, Course pages viewed, Searches run |

- **Recent activity** — the last twenty events in the window, newest first, each
  as a singular phrase plus the path and the time of day. **No identity is ever
  shown. Who, never.**

### 12.4 How the numbers are computed

Every figure is a straight count of stored records over the selected window.
**Nothing is estimated, sampled, or interpolated.**

Three privacy rules are load-bearing:

1. **A search records only that a search happened.** Never the term, never a
   hash of it, never its length, never a truncation of it.
2. **No raw network address is stored** — only a salted hash that is never
   published.
3. **Failed sign-ins are deliberately not recorded.** A test asserts zero records
   after a bad password.

### 12.5 Freshness

**There is no server-side cache.** The whole dashboard is a fixed small number of
record queries regardless of volume, and a test asserts that a hundred extra
events cost the same as one.

Freshness comes from the browser polling the single data address every ten
seconds while the tab is visible, **pausing when the tab is hidden and
refreshing immediately on return**, never overlapping requests, and stopping when
the reader navigates away.

The screen states its own staleness: **"Live, updated just now / N min ago / N
hr ago"** while polling, **"Not refreshing automatically"** otherwise, with a
**Refresh now** button. **A failed poll withdraws the "Live" claim** rather than
leaving it beside figures that stopped moving.

| Situation | Wording |
| --- | --- |
| Not your account | Analytics are not available to your account. |
| Anything else | Analytics could not be loaded. Try again in a moment. |
| Loading | Loading analytics… |
| Empty | No course activity yet / Nothing recorded in this period |

**One labelling flaw to note:** in the "Assessment" group, the label **"Quizzes
passed"** is printed against the event that fires on **every** graded attempt,
pass or fail. That is very likely mislabelled.

---

## 13. Rules that hold everywhere

These are the cross-cutting rules. They are the reason the system can be trusted
with money and with other people's records. **A rebuild must keep every one of
them.**

### 13.1 Hiding something is not protecting it

Every protected area has a permission check **on the server**, and the check is
repeated in a second place — the action that actually does the work. Hiding a
button, removing a link, or writing a check in browser code changes nothing.

Concretely:

- **Role checks sit on every role's own area**, each carrying its own role value.
  There is a documented past incident: one shared catch-all accepting all three
  roles returned the whole application to a Student who asked for an
  administrator address. The fix was one catch-all **per role**.
- **Role checks are restated rather than factored out.** The stated reasoning is
  that a guard shared between the thing it protects and the thing that must not
  be reachable is a single point of failure.
- **Where both checks can exist, both exist.** Support requests are inside the
  administrator group *and* behind a permission check. The certificates page
  re-checks role, status, and ownership before handing over. The data addresses
  behind the dashboards check again.
- **Ownership and enrolment live in the permission layer**, never in a page and
  never in a route group. Ownership is resolved through the whole relationship
  chain — hand-in → assignment → lesson → module → course → instructor — so it
  cannot disagree with who owns the course.
- **Addresses that name a course and a lesson are cross-checked** against each
  other, so a hand-typed identifier cannot reach another person's work.
- **"Is this mine?" is always compared against the signed-in person**, never
  accepted from the address.
- **A page that genuinely does not exist stays not-found.** It is never swallowed
  by a catch-all.

### 13.2 Values the browser may not supply

Role, account status, price, currency, payment state, score, total points,
pass-or-fail, progress percentage, completion, ownership, position, status,
publication time, and file storage details are **all read from stored records,
never from the request.**

Where a form could plausibly contain one of them, it is marked as a
**prohibited field** — so sending it produces a validation error on that field
name *and* changes nothing, rather than being quietly ignored. This applies at
registration (role, account status, forced-password flag), at profile update
(email, role, status, flag), at checkout (amount, currency, state), at quiz
submission (score, points, total, passed, state, student, enrollment, attempt
number, submitted moment), at lesson completion (percentage, state, moment,
enrollment, student), and at certificate revocation (state, revocation moment,
code, issuer, student).

### 13.3 All-or-nothing writes

Anything that writes more than one thing does so as a single all-or-nothing
operation, so the parts cannot disagree:

| Operation | Written together |
| --- | --- |
| Registration | the account and its profile |
| Password change / reset | the new password and clearing the forced-change flag |
| Role change | the new role and the audit record |
| Status change | the new status and the audit record |
| Enrollment with a notification | the enrollment and its notification |
| Paid enrollment activation | the payment settled and the enrollment activated |
| Provider event handling | the payment state, the enrollment state, and the event record |
| Claiming a certificate | the enrollment completed and the certificate created |
| Revoking a certificate | the state, the time, the reason, and the notification |
| Reissuing | the new certificate and its link to the original |
| Marking work | the state, the mark, the note, and who marked it |
| Withdrawing an announcement | the deletion and the removal of its notices |

Several of these are tested by **forcing the second write to fail** and asserting
the first rolled back.

### 13.4 Files

- **Private files are never served directly.** No address anywhere reads a stored
  path. Every file leaves through a download action that finds the record,
  checks permission, and only then reads the bytes.
- **Original file names are never used as paths.** Every stored file gets a
  generated name, so a hostile name cannot escape and two uploads of the same
  name land in different places. The original name is kept only as a label.
- **The real file type is detected from the contents**, and both the extension
  and the detected type must be allowed. Either check alone can be fooled.
- **Files are never rendered inside a signed-in page.** They are always sent as
  an attachment, with a no-sniff instruction and private no-store caching.
- **Download names are rebuilt from the record**, using only the extension, with a
  fixed stem.
- **Traversal attempts are refused** — relative, encoded, double-encoded,
  backslash, null byte, absolute, and dot-segment forms are all exercised.
- **A missing file is reported as not found**, never as an empty success.

### 13.5 Request limiting

Six separate ceilings, chosen per kind of action:

| What | Limit per minute |
| --- | --- |
| Sign-in attempts | 5 |
| Registration, password reset request, password reset, password confirmation | 5 |
| Curriculum authoring, material handling, quiz authoring, user management | 40 |
| Quiz attempt start and submit | 20 |
| Every other write | 60 |
| Reads | unlimited |
| The provider's event address | 120 |

Limits are decided by **what the request does**, so a newly added write is
covered automatically. They are keyed on the **account** rather than the network
address whenever there is one, so one person on a shared connection cannot
exhaust everyone else's allowance — asserted by test.

Refusals are a **429** carrying a retry hint, with a page reading:

> Too many requests
>
> That was more requests than this account allows in a minute. Wait about N
> minute, then try again.

The limiter is a **backstop only.** Duplicate-submission defence is separate and
lives in the actions and in database rules.

### 13.6 Cross-site protection and response headers

Cross-site protection is on everywhere except **one** exemption: the payment
provider's event address pattern. That address authenticates by its own
signature on every call rather than by a token. A test checks the exemption list
against the real address table rather than against a hand-written copy.

Every response carries:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`
- a content security policy with default and base and form-action and object
  restrictions, no framing, one explicitly named external image host, and
  **scripts allowed only with a per-request unguessable value** — no inline
  scripts, no dynamic evaluation
- strict transport security whenever the request or the configured public address
  is `https`

Session cookies are `HttpOnly` and `SameSite=lax`, and the secure flag is set at
request time whenever the configured public address is `https`, rather than
trusting the request scheme, which a tunnel would defeat.

**No page may use an inline style attribute.** That is why progress bars are a
native progress element with a fixed set of widths rather than a styled div.

### 13.7 Output escaping

All output is escaped by default. Two tests assert that a script payload stored
in a course description and an attribute-breaking payload stored in a person's
**name** both render as visible text, never as live markup — and specifically
that the **escaped** form is present, so a page that silently dropped the content
would fail rather than pass.

### 13.8 Secrets

- Secrets live in server-only configuration.
- The payment provider's secret key is asserted to appear in **no response body**
  and in **no built browser bundle**.
- The public pages **and the error pages** are both included in that sweep.
- A temporary first-administrator password is written to a protected secret file
  outside the web root, and is never printed unless explicitly requested, never
  logged, and never committed.
- The document root contains no dotfiles, no dependency manifests, no command
  entry point, and no password file, and there is no public link into the
  private file area.
- The signed-in person's identity is exposed to the browser side as **exactly four
  things**: id, name, email, and role. Nothing else may be added — no password
  hash, no timestamp, no profile record, no network address.
- Debug output is off in production.

### 13.9 Error pages

Safe, styled pages exist for every status a user can meet:

| Status | Heading and message |
| --- | --- |
| 401 | a safe "not signed in" page |
| 403 | **Access denied** — "You do not have permission to open this page." |
| 404 | **Page not found** — "The page may have moved or may not exist." |
| 419 | a safe "your session expired" page |
| 429 | **Too many requests** — as quoted above |
| 500 | a safe "something went wrong" page with no internals |
| 503 | a safe "try again shortly" page |

**No stack trace, query text, or internal message reaches a normal page.**

---

## 14. Words the system uses, and what they mean

**Every stored state is written in words by one single place.** No page writes a
state string by hand, so one state can never read two different ways on two
pages. **A tone is a colour, never the whole message** — every badge carries a
word. An unrecognised state falls back to sentence case of its own value, so a
brand-new state is still readable instead of printing a raw database value.

| Stored value | Reads as |
| --- | --- |
| draft | Draft |
| published | Published |
| archived | Archived |
| free | Free |
| paid | Paid |
| beginner | Beginner |
| intermediate | Intermediate |
| advanced | Advanced |
| pending_payment | Waiting for payment confirmation |
| active | Active |
| completed | Completed |
| cancelled | Cancelled |
| pending | Waiting for payment confirmation |
| paid | Payment confirmed |
| failed | Payment did not go through |
| refunded | Refunded |
| issued | Issued |
| revoked | Revoked |
| not_started | Not started |
| in_progress | In progress |
| graded | Checked and scored |
| returned | Handed back to be redone |
| active (account) | Active |
| suspended | Suspended |
| student | Student |
| instructor | Instructor |
| administrator | Administrator |

**One deliberate override:** a certificate row displays the learner's word
**Valid** rather than the stored word **Issued**.

Naming conventions worth keeping:

| Context | Wording |
| --- | --- |
| Curriculum numbering | `Module 1`, `Lesson 1`, `Material 1 · Text` |
| Lesson markers | `Required`, `Optional`, `Completed` |
| Quiz results | `Not attempted`, `Not passed`, `Passed` |
| Assignment state, student side | `Open for submissions`, `Closed to new submissions`, `Draft, not visible to students` |
| Public catalog enrollment block | `Sign in to enroll`, `Enroll free`, `Enrolled`, or a paid-course note; `Not open yet` replaces an enroll button when the course is not available |
| Curriculum labels | `Create course`, `Edit course details`, `Save course details`, `Edit module`, `Edit lesson`, `Edit material`, `Add module`, `Add private module`, `Add lesson`, `Add private lesson`, `Add material`, `Publish course`, `Unpublish course` (only one of publish/unpublish shown at a time), `Reorder modules`, `Save module order`, `Restore module`, `Download`, `Resume`, `Open My courses`, `Open outline`, `Manage certificates`, `View reports`, `Sign in`, `Create student account` |
| Material types offered | `Text`, `Code`, `Video link`, `External link` |

**Money.** Amounts are stored as whole minor units. A page never prints minor
units raw and never divides them into a decimal. One formatter owns display
strings. A free course shows the word **Free** instead of `₱0.00`. A stored
charge is never reported as Free. The currency code is printed beside the amount
on the payment page. Dollar pricing appears nowhere.

---

## 15. Every state and every move between states

### 15.1 States a person can be in

| Axis | Values |
| --- | --- |
| Role | Student, Instructor, Administrator — and, in principle, **no profile record at all** |
| Account status | Active, Suspended |
| Email confirmation | Confirmed, Not confirmed |
| Forced password change | Required, Not required |
| Session | Signed out, Signed in — and signed in with a session already killed by suspension but not yet noticed |
| Navigation | Full, or **empty** when suspended or the role is not recognised |

An account with **no profile record** is a state the data model technically
allows. Every permission check treats it as "no role, not active": navigation is
empty, every role area refuses, sign-in is refused, and management actions report
*"The target account does not have a profile."*

### 15.2 Moves, and who can make them

| From | To | Who | What happens |
| --- | --- | --- | --- |
| nobody | Student, Active, not confirmed, no forced change | anybody via public registration | account and profile created together; signed in; verification email sent; landed on the verification notice; a sign-up measurement recorded **without the email address** |
| nobody | Administrator, Active, confirmed, **forced change required** | the local bootstrap process | name and address from configuration; a random temporary password; address marked confirmed immediately; the password written to a protected file outside the web root |
| not confirmed | confirmed | the person, by clicking the emailed link | address confirmed; an eight-second countdown page; onward to their workspace |
| not confirmed | still not confirmed | the person | a fresh email; stays on the notice page |
| forced change required | not required | the person, changing the password with the correct current one | password replaced and the flag cleared together; landed on their dashboard |
| forced change required | not required | the person, via a reset token | password replaced and the flag cleared together; landed on their profile |
| Active | Suspended | an **active** administrator, somebody else | status flipped and the audit record written together; on that person's next request the session is killed and they are sent to sign-in with *"Your account is not active. Contact an Administrator."* |
| Suspended | Active | an **active** administrator, somebody else | the same; the person must sign in again and is not notified |
| any confirmed role | any other of the three | an **active** administrator, somebody else | role flipped and the audit record written together |
| not confirmed | any role | — | refused: *"The target account must have a verified email before its role can change."* |
| the last active administrator | demoted or suspended | — | refused |
| signed out | signed in | the person, correct credentials, Active account | session replaced; landed on their dashboard |
| signed in | signed out | the person | session invalidated, token replaced, recorded as a sign-out |
| signed in and Active | signed out and killed | the system, on suspension | session killed on the next request; sent to sign-in |
| any | any privileged field | **nobody**, via a self-service request | role, status, and the forced-change flag at registration; email, role, status, and the flag at profile update — all prohibited |
| Student | Instructor or Administrator | an administrator only | role change, audited |
| any | deleted | — | **not implemented anywhere** |

---

## 16. Messages a person can be shown

### 16.1 Session and account gates, which apply to everything

| Condition | Result | Wording |
| --- | --- | --- |
| Not signed in | sent to sign-in | sign-in page |
| Suspended account | session destroyed, sent to sign-in | **"Your account is not active. Contact an Administrator."** |
| Email not confirmed | sent to the verification notice | verification page |
| Forced password change pending | sent to the password page | **"Change your temporary password to continue."** |
| Wrong role for the area | refused | **Access denied** — "You do not have permission to open this page." |
| Record does not exist | not found | **Page not found** — "The page may have moved or may not exist." |
| Write limit exceeded | too many requests | **Too many requests** — "That was more requests than this account allows in a minute. Wait about N minute, then try again." |

### 16.2 Form feedback conventions

- Every form has visible labels, required indicators, and stated input
  constraints.
- A failed submission shows a **focusable error summary**, and **focus moves to
  it**. It is titled **"Check the highlighted fields"**, or
  **"Fix each item below, then submit the form again."** on longer forms.
- Errors stay associated with their fields and are announced to assistive
  technology.
- **A failed edit keeps the typed text** and reopens the same form.
- A pending state never removes an entered address or name unnecessarily.
- A refused enrollment shows the shared error summary.
- A blocked publish **explains what is missing**.
- An unpublished course on the student's course page explains that the enrollment
  is kept, and **My courses** explains that the course is no longer published —
  with **no dead link shown**.

### 16.3 Anti-enumeration wording

| Context | The only wording used |
| --- | --- |
| Sign-in, any failure | These credentials do not match our records. |
| Password reset request, known **or** unknown address | If an account exists for that email, a password reset link has been sent. |

Both are checked by tests that assert the two outcomes are **byte-for-byte
identical** in status, message, and body, and that the reset sentence matches
**no** wording that would confirm or deny.

### 16.4 Validation messages worth keeping verbatim

Curriculum:

> The course address stays the same after a title change, so existing links keep
> working.
>
> A free Course must have a price of zero.
>
> A paid Course must have a positive price.
>
> Only a draft course can be published.
>
> Only a published course can be unpublished.
>
> This content is already archived.
>
> Only archived content can be restored.
>
> Add at least one module before publishing this course.
>
> Add at least one lesson before publishing this course.
>
> Every active module in this course needs exactly one position.
>
> Positions must run from 1 with no gaps and no repeats.
>
> Send a position for every module.
>
> A text or code material needs its content.
>
> A link material needs a valid link.
>
> This material type needs a file.
>
> This material type does not take a file.
>
> A file must be 10 MB or smaller.
>
> That file type is not allowed for this material.
>
> That file content is not allowed for this material.
>
> A cover image must be 2 MB or smaller.
>
> A cover must be a JPEG, PNG or WebP image. That file is {type}.
>
> A cover must be at least 320 by 180 pixels. That one is {w} by {h}.
>
> That image could not be read.
>
> That image did not upload. Try again.
>
> That photograph is not one of the covers on offer.
>
> Choose one of these, not several: {list}.
>
> No cover was chosen, so nothing changed.
>
> File materials are not available yet. Choose Text, Code, Video link, or
> External link.

Success messages: *Course published. It can now appear the public catalog.* ·
*Course unpublished. It is hidden from the public catalog.* · *Course archived.
Enrollments and progress are kept.* · *Course restored as a draft. Publish it when
the outline is ready.* · *Course created as a private draft.* · *Course details
updated.* · *Cover image uploaded.* · *Cover chosen from the catalog.* · *Cover
removed. The course now shows its placeholder.* · *Module updated.* · *Lesson
updated.* · *Learning Material updated.*

Enrollment:

> You are enrolled. Open the course to read its published lessons.
>
> This enrollment is not active. Contact an administrator for help.
>
> This enrollment does not grant access yet. Contact an administrator for help.

Progress:

> Lesson marked as complete.

Quizzes: the full list is in section 7.1. The most important ones:

> Add at least one question before publishing this quiz.
>
> Every question needs exactly one correct answer before publishing.
>
> A question needs at least two options.
>
> A question allows at most six options.
>
> Mark exactly one option as the correct answer.
>
> The correct answer marker must be true or left empty.
>
> That module does not belong to this course.
>
> A quiz allows at most three attempts.
>
> You need an active enrollment to take this quiz.
>
> You already passed this quiz.
>
> You have used all 3 attempts for this quiz.
>
> Answer every question, then submit.
>
> One or more answers do not belong to this quiz.
>
> This attempt was already submitted.

Success messages: *Quiz added as a private draft.* · *Quiz updated.* · *Quiz
published. Students in this course can now take it.* · *Quiz archived. Existing
attempts are kept.* · *Question added.*

Assignments:

> Publish this lesson before publishing work on it. A student cannot reach a
> draft lesson.
>
> This lesson already has an assignment with that title.
>
> Describe what is being asked. A student should be able to answer from this
> alone.
>
> Use a Google Form link, which starts with
> https://docs.google.com/forms/ or https://forms.gle/
>
> A mark has to be at least 1.
>
> A mark above 10000 is almost certainly a typo.
>
> A briefing document must be under 10 MB.
>
> A briefing document must be one of: pdf, doc, docx, odt, rtf, txt, png, jpg,
> jpeg, webp.
>
> Choose a file to hand in.
>
> Your file must be under 10 MB.
>
> Your file must be one of: pdf, doc, docx, odt, rtf, txt, png, jpg, jpeg, webp.
>
> The date for this assignment has passed. Ask your instructor if you need more
> time.

Grading:

> Choose whether you are marking this or handing it back.
>
> Enter the mark you are giving.
>
> Leave the mark empty when handing work back.
>
> That is above the mark this assignment is set out of.
>
> This assignment is marked out of {n}.
>
> This assignment has no mark scale yet, so it cannot be marked.
>
> Say what needs changing, or handing it back teaches nothing.

Success messages: *Assignment published. Students can read it and hand in work.* ·
*Assignment saved as a draft. Nobody can see it yet.* · *Assignment closed. No
more work will be accepted against it.* · *Your file was submitted. Waiting for
checking or scoring.* · *Your new file was submitted. Waiting for checking or
scoring.* · *Mark recorded. {Student} can see it now.* · *Handed back to the
student with your note. They can submit again.*

Certificates:

> This course does not issue certificates.
>
> Finish every required published lesson.
>
> Reach the required lesson percentage.
>
> Pass every required published quiz.
>
> You meet every requirement. Claim your certificate.
>
> Course completed. Your certificate is ready.
>
> You already completed this course.
>
> This certificate is not yours to open.
>
> That certificate does not exist.
>
> Record why this certificate is being revoked.
>
> This certificate is already revoked.
>
> Only a revoked certificate can be reissued.
>
> Certificate revoked. The record is kept for audit.
>
> Certificate reissued as {CODE}.

Messaging, support, and announcements:

> Write something before sending.
>
> A message is limited to 5000 characters.
>
> The send token is not valid, so the message was not sent.
>
> You share no course with this person, so there is nobody here to message.
>
> You cannot open a conversation with this person about this course.
>
> Your account cannot raise a support request.
>
> Give the announcement a title.
>
> The title is too short to be useful.
>
> The title is limited to 160 characters.
>
> An announcement with no text says nothing.
>
> Say a little more than that.
>
> The announcement is limited to 5000 characters.
>
> You have already published an announcement with this title.

Success messages: *Message sent.* · *That message was already sent.* · *Thread
archived.* · *Thread closed.* · *Thread reopened.* · *Request sent. An
administrator will reply here.* · *Announcement published.* · *Announcement
published to everybody.* · *Announcement withdrawn.*

Account administration:

> The role field is prohibited.
>
> Your email address, role, and account status are not changed from this form.
> Only an Administrator can change a role or an account status.
>
> Role changes unlock after email verification.
>
> Your own role and account status cannot be changed here.
>
> The target account must have a verified email before its role can change.
>
> The target account does not have a profile.
>
> The target already has the selected role.
>
> The target already has the selected account status.
>
> The final active Administrator cannot be demoted.
>
> The final active Administrator cannot be suspended.
>
> The current password is incorrect.

Success messages: *Profile updated.* · *Role updated.* · *Account status
updated.* · *Your password has been changed.*

---

## 17. How a page is laid out and feels

### 17.1 The personality

Read as a calm institutional voice. Academic, modern, friendly, technical,
organised, easy to navigate. The identity motif is **structured academic
rhythm**: numbered modules, ordered lessons, clear progress lines, stable page
headers, consistent content widths, visible section boundaries.

It must **not** feel like a commercial course marketplace, a social media
product, a gaming interface, or a generic generated template. It must not use a
sample testimonial, a preview-year eyebrow, a location footer, a free-trial line,
or social sign-in buttons. **A fictional quote and a claim about software that
does not exist would be untrue.**

The product name is written as **live text**, never baked into an image, so it
is always selectable, translatable, and readable.

### 17.2 Two shells, deliberately

**One workspace shell for all three signed-in roles.** Only the navigation and
the content change by role. Desktop shows a persistent sidebar; tablet widths get
a compact icon rail whose text stays in the document for screen readers; mobile
gets an off-canvas drawer with a named menu button, closing on Escape and
returning focus to the button.

**A different document for the public site.** A visitor has no workspace, so a
visitor must never be shown a sidebar with nothing in it.

### 17.3 Navigation rules

- The current destination is visibly highlighted.
- Navigation is generated from the permission rules (section 10.11), so hidden
  links supplement server authorisation and never replace it.
- **Every navigation item points to a built or approved destination.** A link to
  something that does not exist is a defect.
- The account menu holds Profile, Password, and Sign out.
- Mobile: the brand text truncates, the subtitle hides, control rows wrap or
  stack. **Hiding overflow is a safety net, never a fix.**

### 17.4 The footer

One component with two densities:

- **Public:** brand, three link groups, copyright bar.
- **Workspace:** brand, legal terms, copyright bar — and **no navigation
  columns**, on purpose: every destination they would hold is already in the
  sidebar, and repeating it makes the footer a second, worse navigation.

Rules: the mark is small; link groups size to their own content; section headings
are styled like navigation groups; the copyright bar is separated by a hairline;
on touch devices every link is at least 44 pixels tall; the workspace footer is
hidden when printing — **a certificate and a receipt are the only pages meant on
paper**; **registration is never offered in the footer**; and there are no social
links.

### 17.5 Page composition conventions

**Course detail, recommended order:** title and summary → what you will learn →
level, format, price → course outline → completion requirements → instructor →
enrollment action.

**Student dashboard:** welcome and role context → **Continue Learning** → **My
Courses** → progress → recent assessments → certificates → recent activity →
payment history.

**Instructor dashboard:** teaching summary → Create Course → My Courses → student
progress needing attention → recent assessment results → recent activity.

**Administrator dashboard:** operational summary → recent students → recent
enrollments → recent payments → course status → recent system activity → reports.

**Every dashboard** opens with a row of real counts, one per concern, in a
four-column band that wraps to two columns on mobile. **A label says exactly what
is counted, in words, and never uses an unexplained abbreviation.**

**Authentication pages** are a split panel: a brand panel stating what the product
is, and a single narrow form. On small screens the brand panel reduces to a
compact header. All authentication cards share one surface so the sign-in and
sign-up pages read as a set.

**Wide tables** scroll horizontally inside their own container rather than
widening the page, and **no page is ever wider than the viewport.**

### 17.6 Empty states

**Every empty state names the next action instead of showing a blank grid.** A
page with no data still explains what to do. Specific examples:

| Situation | Wording |
| --- | --- |
| No courses yet (instructor) | No courses yet — Create your first course as a private draft. Only you can see it until you publish it. |
| No modules on a course | No Modules yet — This Course is a private draft. Add the first Module to begin its outline. |
| No lessons in a module | No Lessons are recorded in this Module yet. |
| No materials on a lesson | No Learning Materials are recorded yet. |
| No quizzes on a course | No quizzes in this course yet. |
| Nothing matching catalog filters | No published courses match — No published course matches these filters yet. Try a different search, or clear the filters to see everything. |
| No learners on a course | No learners yet — A row appears here as soon as somebody enrolls on this course. |
| No enrollments yet | No enrollments yet — Enroll in a published course to start your learning record. A certificate appears here once every requirement is met. |
| No conversations | No conversations yet |
| No notifications | Nothing recorded in this period |
| No certificates issued | No certificates issued yet |
| No activity records | No activity records — A record appears here whenever an Administrator assigns a role or changes an account status. |
| Nothing required on a course | **Nothing required yet** — deliberately, so a zero does not read as failure |
| No lesson opened yet | No lessons opened yet |
| No search results | Search is empty: No published courses match |

**Never fill an empty area with invented data.** No sample courses, no fake
progress, no made-up payment totals, no unbuilt dashboard cards.

Every data page handles **Loading, Empty, Error, and Success**. **A refused load
is never shown as an empty list** — a refusal gets its own wording.

### 17.7 Colour and theme

Two themes, light and dark, and the choice **persists**. The stored theme is
applied before the page paints when practical. The system preference is the
first-use fallback. Both themes pass contrast checks. **The theme choice never
changes authorisation or business state.** There is no theme dropdown and no
theme editor.

**Two core colours, one accent, neutral surfaces.** Pure black and pure white
never dominate either theme.

| Role | Light | Dark |
| --- | --- | --- |
| Background | `#F8FAFC` | `#0F172A` |
| Surface | `#FFFFFF` | `#1E293B` |
| Muted surface | `#F1F5F9` | `#334155` |
| Text | `#0F172A` | `#F1F5F9` |
| Muted text | `#475569` | `#CBD5E1` |
| Border | `#CBD5E1` | `#475569` |
| Primary | `#1D4ED8` | `#2563EB` |
| Primary hover | `#1E40AF` | `#1D4ED8` |
| Accent | `#0F766E` | `#5EEAD4` |

**Status colours**, each with its own dark-theme values:

| Status | Light text / background |
| --- | --- |
| Success | `#166534` / `#ECFDF5` |
| Pending | `#92400E` / `#FFFBEB` |
| Error | `#991B1B` / `#FEF2F2` |
| Information | `#1E40AF` / `#EFF6FF` |
| Neutral | `#334155` / `#F1F5F9` |

Rules: no blue-purple or cyan-purple gradients; no glow; **never colour as the
only status signal**; never light text over an uncertain image without a
readable overlay; the accent used sparingly.

### 17.8 Type and spacing

**Inter**, with a fallback stack. A monospace face for code and identifiers.

| Role | Size / weight |
| --- | --- |
| Page title | 2rem / 700 |
| Section title | 1.5rem / 650 |
| Card title | 1.125rem / 650 |
| Body | 1rem / 400 |
| Supporting | 0.875rem / 400 |
| Label | 0.875rem / 600 |
| Caption | 0.75rem / 500 |

**Sentence case for headings and controls.** No long uppercase labels, no wide
letter spacing. Lesson body at least 16 pixels, line length 65–80 characters,
code blocks may scroll horizontally, and **text must wrap without clipping**.

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
Corner radius: 6–8px for inputs and buttons, 8–10px for cards and panels,
10–12px for dialogs, and a full pill **only** for compact status badges —
**not every element is pill-shaped.**
Shadows only on genuinely raised surfaces; **normal cards use borders and
subtle surface contrast.**

### 17.9 The brand mark

A graduation cap over a cube in the primary blue. It appears in the sidebar, the
drawer, the mobile header, the public header, the public footer, the certificate,
and the sign-in brand panel.

- **Never enlarged past 64 pixels, and never used as page decoration.**
- Displayed between 28 and 56 pixels, proportions kept.
- **Never restyled, recoloured, or given a drop shadow.**
- It carries **empty** alternative text when the product name sits beside it, so a
  screen reader announces the name **once** and not twice.

**Not approved, and therefore not invented:** avatars, illustrations,
institutional marks, and fake institutions. Where an asset is missing, a labelled
placeholder is used — **never a realistic person and never a made-up
organisation.**

### 17.10 Accessibility

- Semantic elements throughout; **every control reachable and operable by
  keyboard**; a visible focus indicator.
- Contrast meets AA. **Status uses text and colour, never colour alone.**
- Every input has a label; errors are associated with their fields and announced.
- Dialogs trap focus and close on Escape.
- Images carry useful alternative text; decorative images carry empty alternative
  text.
- Motion respects reduced-motion preferences.
- **Touch targets are at least 44 pixels.** Verified at desktop and at 390
  pixels wide.
- The language is English, and the page title describes the current page.

**Progress:** always text alongside the visual percentage; the meaning preserved
for screen readers; **no animated decorative progress**; and **quiz scores are
never mixed into lesson progress.**

**Quiz flow:** instructions → question → selected option → next question → review
answers → submit → result. One clear question focus, large option targets,
keyboard selection, a visible selected state, **no correct-answer feedback before
submission**, and a pending state. Explanations appear only after submission.

**Results are labelled in words, not by colour alone.**

**Administrator tables** are never compressed into unreadable mobile cards
without a clear layout, and row actions are keyboard accessible.

### 17.11 Motion

Limited to six things: the theme transition; sidebar and drawer movement; dropdown
and dialog appearance; button pending feedback; small hover transitions; and
**one restrained entrance per section as it is scrolled to** — a fade with a small
rise, running once, and hidden from assistive technology so content is only
revealed by code that also reveals it.

**No constant motion. No floating decorative objects. No motion on anything the
reader may still be trying to click.**

---

## 18. Things the system deliberately does not do

### 18.1 Not built

Forums, discussions, live classes, live chat, real-time message channels, a
gradebook, public certificate verification, public dashboards, direct video
uploads, multiple course owners, ownership transfer, multi-role accounts,
instructor applications or invitations, co-instructors, scheduled or drafted
announcement publishing, and email, text-message, or push delivery for anything.

Also absent, by design: **hard deletion anywhere.** No delete action exists for
an account, a course, a module, a lesson, a material, a quiz, a question, an
assignment, an enrollment, a hand-in, or a certificate. Progress cannot be
reset. An enrollment cannot be cancelled by any person. A completion cannot be
undone.

The reasoning: once progress, marks, or payment records exist, removing a record
would silently destroy student history.

### 18.2 Deferred with safe defaults

- **Final institution name** — never display an unverified institution name.
- **Exact file-size limits** — reject uploads until limits are approved.
- **Payment provider methods and events** — deferred, with the current set
  documented above.
- **Production hosting** and the queue mechanism.
- **Public certificate verification.**
- **Automatic payment expiry as an enrollment state** — the current behaviour is
  a 24-hour label plus retry.
- **Ownership transfer.**

### 18.3 Hard limits, gathered in one place

| Thing | Limit |
| --- | --- |
| Password | 12 characters minimum, confirmation required |
| Display name | 255 |
| Short biography | 500 |
| Course, module, lesson title | 160 |
| Material title | 255 |
| Course description / objectives / module description / lesson summary | 5000 |
| Lesson body, material body, quiz description, quiz instructions, question prompt, option-independent explanations | 100000 or 5000 as noted in each section |
| Material link | 2048 |
| Assignment title | 180 |
| Assignment instructions | 10 to 20000 |
| Assignment mark scale | 1 to 10000 |
| Note to the student | 5000 |
| Message body, support body | 5000 |
| Subject, announcement title | 160 |
| Announcement body | 10 to 5000 |
| Search term | 100 |
| Certificate revocation reason | 2000, and **required** |
| Lesson estimated minutes | 1 to 100000 |
| Module, lesson, material position | positive, unique within its parent |
| Question prompt | 5000 |
| Question points | 0.5 to 100 |
| Options per question | 2 to 6 |
| Option text | 500 |
| Option explanation | 2000 |
| Passing score | 0 to 100, defaults to 80 |
| Quiz attempts | 1 to 3, defaults to 3 |
| Material file | 10 MB |
| Assignment briefing or hand-in file | 10 MB |
| Course cover | 2 MB, at least 320 by 180, JPEG/PNG/WebP |
| Price | 0 for a free course, positive for a paid course, whole centavos, Philippine pesos only |
| Listing page sizes | catalog 12, user list 15, instructor courses 15, enrollments 15, activity 25, certificates 25, messages 20 per page, notifications 20 per page, announcements 20 per page, report table the newest 50 |

---

## 19. Known rough edges to decide about before copying

These are real inconsistencies in the current build. They are listed so a
rebuild can **decide** rather than inherit them by accident.

### 19.1 Decide these first

1. **Unpublishing versus preserving access.** The requirements say unpublishing
   "preserves existing active or completed access", but unpublishing also returns
   every module and lesson to draft, and students can only read published content.
   So **the records are kept and the content becomes unreadable.** A later phase
   adopted that reading. The alternative — remove the cascade so content stays
   readable — is a small change. **Decide before building.**
2. **Do hand-ins count toward completion?** They currently do not, in any
   direction. The administrator's own report describes a funnel step as "Every
   required lesson, quiz and hand-in done", which overstates what is checked.
   Either make hand-ins count or change the wording.
3. **Does a closed brief's briefing stay downloadable by students?** The page
   still shows the button; the download is refused.
4. **Can a student replace already-marked work?** The page promises replacement
   stops "until your instructor has marked it". The server never checks the
   state, so re-uploading deletes the graded file and clears the mark. **The
   on-screen promise is currently false.**
5. **Should the administrator be able to withdraw any announcement?** Currently
   author-only, with no administrator override.
6. **Are file materials reachable?** The server accepts image, PDF, and document
   materials on create, both forms hide them, and the edit action refuses them.
7. **Should a quiz's attempt limit and passing score be per quiz or fixed
   globally?** They are per quiz now. The stated policy says a maximum of three;
   the default is three, so raising it breaks the stated policy.
8. **Reconcile the specification with what exists.** The product requirements
   document still lists assignments, hand-ins, grading, and advanced analytics as
   **excluded**, and describes the application as server-rendered with no browser
   data layer — while all of those exist. There is no requirements document for
   assignments or analytics at all. The root readme and the tutorial also contain
   several statements that no longer match the system.

### 19.2 Smaller gaps and rough edges

- **The outline page's own note claims** reordering, uploads, and deletion are
  "not enabled yet", while reordering and uploads are implemented and visible on
  that same page.
- **File material types are accepted on create but refused on edit and hidden on
  both forms.**
- **A revoked certificate does not appear in the student's list** even though its
  own page still works. Two consequences: the student can claim a fresh
  certificate themselves after a revocation, bypassing the reissue chain; and if
  the administrator reissues afterwards, the insert collides and the caught
  failure reports the student's own certificate as if it were the replacement.
- **Option-level quiz explanations are stored but never shown** to anybody.
- **Marks are truncated to whole numbers** on the way in, though the field holds
  decimals and the form says decimals are welcome.
- **Handing back already-marked work leaves the old mark in the record** —
  invisible, but present.
- **An assignment's mark scale can never be set after creation**, so the form
  hint about leaving it empty and setting it later is not actionable.
- **The quiz update action has no page linking to it**, so quiz editing is
  reachable only by a hand-made request.
- **Questions can be added to an already-published quiz with no warning**,
  changing the total points and the grading of attempts already open.
- **The briefing file-type rejection message contains a duplicated phrase**
  ("does not look like a A briefing document we accept"), as does the student
  hand-in one.
- **A mark above the scale can produce two error messages at once.**
- **The "no briefing attached" check precedes the permission check**, so a student
  can tell whether a brief they may not read has an attachment.
- **There is no styled page for the "gone" answer** returned when a closed brief
  refuses a hand-in.
- **The "mark as expired" label never clears**, because retries reuse the same
  payment record and its creation time never changes.
- **An absent required flag means required on create and optional on update.**
- **Un-archiving a conversation is unreachable** through the interface.
- **The payment cancelled state can never be produced** by anything.
- **The label "Quizzes passed"** is printed against an event that fires on every
  graded attempt.
- **A request-reported amount or currency that is absent skips the payment
  comparison** rather than failing closed.
- **The admin revoke form posts no reason field**, while revoking requires one,
  so pressing the button shows the "Record why" message.
- **The student dashboard's payment history reference always reads "No reference
  yet"**, because it asks a payment record for a field that record does not have.
- **The final-administrator guard counts rather than locks**, so two simultaneous
  demotions could in principle both pass the count.
- **An amount above the course's own maximum is not checked** — only the lower
  bound is.
- **Several documents disagree with each other and with the build**: the
  certificate state wording, the page inventory, the money-formatting example, and
  the exclusion lists. Treat the requirements and the roadmap as history, and
  this document plus the tests as the current truth.

---

## 20. One walk through, start to finish

A single student, end to end, so the whole flow reads in order.

**1. They find the system.** The public home page explains what it is. The
catalog link is visible. Registration is reachable from the sign-in page, and is
**not** offered in the footer.

**2. They sign up.** Name, address, password, confirmation. They are signed in
immediately as a Student, the role was never theirs to choose, and they land on
the verification notice.

**3. They confirm.** They click the emailed link, read **"Your address is
confirmed"**, wait eight seconds, and land on the Student dashboard — or press
**Stay here** and stay.

**4. They browse.** The catalog lists twelve published courses per page. They
search by title, filter by category and level, clear the filters. They open a
course and see the title, price, what they will learn, and the **outline
structure only** — no lesson text, no materials, no instructor email.

**5. They enrol.** The course is paid, so the button reads **Enroll to pay**. An
enrollment is created in **waiting for payment**, which grants nothing.

**6. They pay.** They press the pay button with the real course amount on it.
The server copies the amount from the course, asks the provider for a hosted
checkout offering QR Ph, GCash, or Maya, and redirects away. They pay.

**7. They come back.** The return page cannot tell whether they pressed success
or cancel, so it says so plainly, shows **Waiting for payment confirmation**, and
refreshes every five seconds.

**8. The provider's signed event arrives.** The signature is verified against the
raw body in constant time. The amount and currency match. The payment is
confirmed and the enrollment becomes **active**, in one operation. The student
gets a notification. The **Open course** button replaces the waiting notice.

**9. They study.** They open the course page and see their outline and a 0%
progress bar. They open a lesson — any lesson, in any order. They read the
content, the materials, the work set. The page creates a not-started progress
record. They press **Mark as complete** and get **"Lesson marked as complete."**
and **"Completed — You finished this lesson on {date}."** They cannot undo it, and
nothing they send from the browser can change the percentage.

**10. They take a quiz.** They read every question first, with no radio buttons
and no answers marked. They start an attempt. Nothing saves while they answer, so
they are careful. They submit, and the server grades. They see **"Passed"**, the
percentage, and the full review with the correct answer labelled in words and the
instructor's explanation. Retaking is now refused.

**11. They hand in work.** They open the brief, download the briefing, answer the
linked form, upload one file under 10 MB. It is stored under a generated name.
The page says **"Submitted, waiting for checking"**.

**12. They are graded.** They get no notification. The next time they open the
assignment, the mark and the instructor's note are there.

**13. They finish.** The last required lesson and the last required quiz are done.
The course page now says **"You meet every requirement. Claim your certificate."**
They press **Claim certificate**. Eligibility is recomputed from stored records at
that moment. The enrollment becomes **Completed** and one certificate is created,
with a snapshot of their name and the course title as they were at that instant.

**14. They read the certificate.** **Certificate of Completion**, the code, the
snapshot names, the status. They print it. It says, plainly, that it is not an
accredited academic document and that the page is visible only to them while they
are enrolled.

**15. Meanwhile, the instructor sees it happening.** A learner row appears with a
progress bar reading **X of Y required lessons** and a count of quizzes passed. The
outline shows each lesson's work with **N waiting**. They open the assignment,
see the queue oldest-first, choose **Give it a mark**, enter a mark and a note,
and record it.

**16. And an administrator sees only the operations view.** The activity log shows
the role and status changes and nothing else. The report shows the funnel, the
grading queue, the states breakdown, the per-course progress, and the fifty newest
enrollments — all-time, unfiltered. Analytics shows the last thirty days with its
own privacy limits stated on the page. Certificates can be revoked with a reason,
which tells the student and keeps the record.

**Now the uncomfortable parts.** If that student is suspended by an
administrator, their next request kills their session and sends them to sign-in
with **"Your account is not active. Contact an Administrator."** They can still
ask for a password reset and get exactly the same answer as somebody who does not
exist. They can type the address of an administrator page and be refused. They
can type another student's certificate address and be refused. They can post a
percentage, a score, a price, or a role and change nothing at all. **Every one of
those is a server decision, not a hidden link.**

---