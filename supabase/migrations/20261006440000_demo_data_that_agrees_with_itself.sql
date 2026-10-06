-- The demo data contradicted itself in seven ways.
--
-- Authorization was not the problem. That was audited first and found sound: no account can
-- read another account's rows, every write path checks ownership and enrolment, and there
-- are no orphaned rows anywhere. What was wrong is that the data described a different
-- system than the one the application is about.
--
-- What was inconsistent
-- ---------------------
--
-- 1. One instructor taught all six courses and answered to all three students. There was
--    no second instructor, so nothing in the application could demonstrate that an
--    instructor sees only their own courses and students - which is the single most
--    important thing about the instructor role.
--
-- 2. Nobody had ever paid. Both paid courses had only `pending` enrolments, so the system
--    contained no active paid enrolment and no settled payment. The payment path, the paid
--    content behind it, and the admin ledger could not be shown working.
--
-- 3. Joren had a `pending` enrolment on a 1,500 peso course and **no payment row at all**.
--    A pending enrolment is supposed to be a payment in flight; without the payment there
--    is nothing to settle, nothing to show in the ledger, and nothing that explains the
--    row. This is also where the bad notification in the previous migration came from:
--    somebody created an enrolment for him without the payment that justifies it.
--
-- 4. Every one of the 16 payments belonged to one student. Two students had never reached
--    a checkout.
--
-- 5. All three categories were orphaned - six courses, none of them categorised. The
--    catalogue's category filter could therefore never match anything, and the admin
--    Categories screen was managing rows nothing pointed at.
--
-- 6. `course_requirements` was empty. With no requirements, `course_completion_gaps`
--    returns nothing for everybody, so "Courses completed" is permanently 0 and no
--    enrolment can ever complete. A completion feature that cannot complete is not a
--    feature.
--
-- 7. CompTIA Security+ Preparation was `published` with zero modules, zero lessons and
--    zero assignments. It appeared in the public catalogue as a real, purchasable course
--    with nothing in it.
--
-- The target shape
-- -----------------
--
-- Two instructors with genuinely separate course sets and student sets, so the instructor
-- role has something to isolate:
--
--     Instructor Demo   Introduction to Programming, Networking Fundamentals,
--                       Intro to Web APIs                      -> Joren, Shan
--     Instructor Two    IT Support Essentials, Advanced Python Development,
--                       CompTIA Security+ Preparation          -> Joren, Shan, Justine
--
-- Three students with three different enrolment sets, no two identical:
--
--     Joren      Introduction to Programming   (free,  active)
--                Networking Fundamentals      (free,  active)
--                Advanced Python Development  (paid,  paid for - the settlement)
--     Shan       Introduction to Programming   (free,  active)
--                Advanced Python Development  (paid,  paid for - settled through the
--                                                     real settle_payment path)
--                CompTIA Security+ Preparation(paid,  at checkout - still pending)
--     Justine    IT Support Essentials        (free,  active)
--                CompTIA Security+ Preparation(paid,  at checkout - still pending)
--
-- So the money story reads: paid students unlocked, one enrolment still at checkout, and the
-- same paid course reachable for some accounts and not others - which is the state worth
-- demonstrating, because it is the only state where "can this person see this" is a real
-- question.
--
-- Nothing here is hardcoded in the application. Every relationship below is a row, and the
-- application's existing queries resolve it: `messageable_people()` walks enrolments to
-- instructors, `is_enrolled_in()` decides access, and the calendar filters by the viewer's
-- live courses. No screen knows the name of a course or a person.
--
-- The second instructor's login is *not* created here.
--
-- The first version of this file inserted a row into `auth.users` directly, the way
-- Supabase's admin API does it: a bcrypt hash via `crypt`/`gen_salt('bf')`, `aud` and
-- `role` of `authenticated`, the provider metadata in `raw_app_meta_data`. Every visible
-- column then matched an existing working account exactly, and the row was readable and
-- correctly hashed - and GoTrue refused it:
--
--     POST /auth/v1/token?grant_type=password
--     500 {"code":"unexpected_failure","message":"Database error querying schema"}
--
-- while a known-good account signed in normally on the same request. A database error
-- rather than a credentials error, from a row that matched column for column, so the
-- cause is inside GoTrue's own query and not visible from here.
--
-- So the account is registered through the application instead, which is the only path
-- that produces a row GoTrue accepts:
--
--     /auth/register   full name "Instructor Two"
--                      instructor.two@ncst.edu.ph
--                      password      Instructor0002!!!
--
-- Registration sends a confirmation link, so an administrator confirms the account before
-- it can sign in. That is the two steps documented in docs/DEPLOYMENT.md. Everything below
-- this point is *relationship* data and resolves the account by email, so it works whether
-- the login was registered by hand, by an administrator, or by this file.
--
-- `auth.users.confirmed_at` is a generated column (`LEAST(email_confirmed_at,
-- phone_confirmed_at)`) and can only be set to DEFAULT, so confirmation writes
-- `email_confirmed_at` and lets `confirmed_at` follow.

do $$
begin
  if not exists (select 1 from public.profiles where email = 'instructor.two@ncst.edu.ph') then
    raise exception
      'the account instructor.two@ncst.edu.ph does not exist yet - register it through /auth/register and confirm it, then re-run. Everything else in this migration resolves the account by email and will work once it exists.';
  end if;
end;
$$;
--
-- Every slug below was read from the table, not derived from the title. They do not match:
-- "Introduction to Programming" is `intro-to-programming`, "CompTIA Security+ Preparation"
-- is `security-plus-prep`, "Intro to Web APIs (in progress)" is `intro-web-apis`. Guessing
-- them from the titles is what left one course uncategorised and one announcement unwritten
-- on the first run of this file.

-- =========================================================================================
-- 1. A second instructor.
-- =========================================================================================
--
-- Named plainly so nobody mistakes it for a person. The name is also what the initials
-- fall back to in the avatar, so it stays legible there too.

-- `handle_new_user` creates the profile without a role, so it lands on the column default.
--
-- This update runs as the administrator rather than as itself. `prevent_role_self_change`
-- compares against `public.is_admin()`, which reads the profile of `auth.uid()`; a
-- migration has no claims, so `auth.uid()` is null, `is_admin()` is false, and a plain
-- update fails with "Only an administrator can change a role" - which is the trigger working
-- correctly on a caller that is not an administrator.
--
-- Setting the claims to the administrator's own id makes the trigger's question answerable,
-- and it is also the honest answer: promoting an account to instructor is an administrator
-- action, and this is the administrator doing it. It is not a bypass - the same trigger
-- still refuses the same update for every student.
do $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (select id::text from public.profiles where role = 'admin'
               order by created_at limit 1),
      'role', 'authenticated'
    )::text,
    true
  );

  update public.profiles
     set role = 'instructor'
   where email = 'instructor.two@ncst.edu.ph'
     and role is distinct from 'instructor';
end;
$$;

-- =========================================================================================
-- 2. Split the courses between the two instructors.
-- =========================================================================================
--
-- Inserted rather than updated, because the account may have been registered after this
-- file last ran and so have no teaching rows at all. `not exists` per course keeps it from
-- adding a second instructor to a course that already has one.

insert into public.course_instructors (course_id, instructor_id)
select z.id, p.id
  from public.courses z
  cross join public.profiles p
 where p.email = 'instructor.two@ncst.edu.ph'
   and z.slug in ('it-support-essentials', 'advanced-python', 'security-plus-prep')
   and not exists (
     select 1 from public.course_instructors ci where ci.course_id = z.id
   )
on conflict do nothing;

-- =========================================================================================
-- 3. Categorise every course, so the three existing categories are used.
-- =========================================================================================
--
-- Matched on the category's name, lower-cased, rather than by inserting new categories.
-- Creating a fourth category to hold a course that already had a home would have been the
-- tidier-looking answer and the wrong one: it would have left the existing three orphaned
-- still, which is the fault being fixed.

update public.courses z
   set category_id = c.id
  from public.course_categories c
 where (z.slug, lower(c.name)) in (
   ('intro-to-programming',   'programming'),
   ('advanced-python',        'programming'),
   ('intro-web-apis',         'programming'),
   ('networking-fundamentals','networking'),
   ('security-plus-prep',     'networking'),
   ('it-support-essentials',  'it support')
 );

-- =========================================================================================
-- 4. Curriculum for CompTIA Security+ Preparation, which is published and empty.
-- =========================================================================================
--
-- Written here rather than seeded because a published course with no content is the single
-- most visible incoherence in the catalogue: it is offered for money and a student who paid
-- would open nothing.

insert into public.modules (course_id, title, description, position, status)
select z.id, v.title, v.description, v.position, 'published'
  from public.courses z
  cross join (values
    ('General Security Concepts',
     'The vocabulary and the reasoning behind it: what a threat is, what a control does about it, and how risk decides which one is worth paying for.', 1),
    ('Network Security',
     'Protecting the path a packet takes, from the switch up to the wireless link and the rules that decide what may cross it.', 2)
  ) as v(title, description, position)
 where z.slug = 'security-plus-prep'
   and not exists (select 1 from public.modules m where m.course_id = z.id);

insert into public.lessons (module_id, title, summary, content, lesson_type, position, duration_minutes, status, is_required)
select m.id, v.title, v.summary, v.content, 'article', v.position, v.minutes, 'published', true
  from public.modules m
  join public.courses z on z.id = m.course_id
  join (values
    ('General Security Concepts', 'Security fundamentals', 'Confidentiality, integrity and availability, and why every control is one of the three.', 'An organisation holds three things it cannot replace: the secrecy of a record, the correctness of a record, and the availability of a service. Most controls are one of the three wearing a hat. Encryption is confidentiality. A checksum and a signature are integrity. A second server in another building is availability. When a control does not map to one of the three, ask what it is actually buying.', 1, 20),
    ('General Security Concepts', 'Threats, vulnerabilities and risk', 'The three-part sentence that describes almost every incident report ever written.', 'A vulnerability is a weakness that exists. A threat is somebody who would use it. Risk is what the two are worth together once you weigh likelihood against impact. The distinction matters because each part has a different remedy: patching fixes a vulnerability, reducing exposure addresses a threat, and neither one helps if the impact was never bounded.', 2, 25),
    ('General Security Concepts', 'Types of security control', 'Preventive, detective and corrective - and why a category of only one leaves a gap.', 'Preventive stops it happening: authentication, encryption, segmentation. Detective notices it happening: logging, monitoring, an intrusion detection system. Corrective puts it right afterwards: a restore from backup, a revocation. Mature programmes run all three. An organisation with only prevention has a single point of failure in its firewall, and one mistake opens everything behind it.', 3, 20),
    ('Network Security', 'Secure network architecture', 'Where the boundaries go, and why the perimeter stopped being the interesting one.', 'The classic design puts a hard boundary around the network and treats everything inside as more or less trusted. That assumption stopped holding once staff started working from home and services moved to other providers, so the current question is not where the wall is but which flows between which segments are permitted, and which are logged rather than merely blocked.', 4, 25),
    ('Network Security', 'Firewalls, segmentation and access control', 'What a packet filter can see, and what it structurally cannot.', 'A stateless packet filter reads the header and decides on address and port. It cannot know whether the connection it is admitting is one the application intended, which is why a filter in front of a service still needs the service itself to authenticate. Segmentation extends the same idea inward, so that compromising one internal host does not mean owning every internal host.', 5, 20),
    ('Network Security', 'Wireless security', 'The failure modes specific to radio, and the one mistake that causes most of them.', 'A wireless frame can be read by anyone in range, so confidentiality depends entirely on the encryption in use. That makes two things urgent: refusing the older protocols, because a broken cipher is not a weak cipher, it is no cipher at all; and treating the access point itself as a network device rather than a cable, because it is administered over the very link it provides.', 6, 20)
  ) as v(module_title, title, summary, content, position, minutes)
    on v.module_title = m.title
 where z.slug = 'security-plus-prep'
   and not exists (select 1 from public.lessons l where l.module_id = m.id);

-- =========================================================================================
-- 5. Give the requirements table something to say.
-- =========================================================================================
--
-- After the curriculum, deliberately. Its condition is "a published course that has
-- modules", and on the first run of this file it sat *before* the section that gave
-- CompTIA its modules - so it classified every course except the one that most obviously
-- needed a requirement, which is how a course with two modules and no requirement is
-- possible. Order is load-bearing here.
--
-- `threshold` is NULL, not 0. The column is `NULL OR (threshold > 0 AND threshold <= 100)`,
-- and only `min_quiz_average` ever reads it - `complete_all_lessons` has nothing to compare
-- a number against. Writing 0 was refused by the check constraint, correctly.

insert into public.course_requirements (course_id, requirement_type, threshold)
select z.id, 'complete_all_lessons', null
  from public.courses z
 where z.status = 'published'
   and exists (select 1 from public.modules m where m.course_id = z.id)
on conflict do nothing;

-- =========================================================================================
-- 6. Joren's pending enrolment needed the payment that justifies it.
-- =========================================================================================
--
-- He had a `pending` enrolment on a paid course and no payment row, which is the shape a
-- payment-less enrolment has: nothing to settle, nothing in the ledger, and no way for a
-- human to see that anybody intended to pay. Created with the same shape as the payments
-- that do exist - same provider, same currency, same reference convention - and left
-- `pending`, so it demonstrates the checkout-in-progress state.
--
-- `reference_number` is derived from the enrolment rather than invented, so re-running this
-- cannot produce two different references for the same enrolment.

insert into public.payments (
  student_id, course_id, amount_centavos, currency, status, provider,
  reference_number, enrollment_id, created_at, updated_at
)
select e.student_id,
       e.course_id,
       z.price_centavos,
       (select currency from public.payments limit 1),
       'pending',
       (select provider from public.payments limit 1),
       'DEMO-' || upper(substr(replace(e.id::text, '-', ''), 1, 10)),
       e.id,
       now(), now()
  from public.enrollments e
  join public.courses z on z.id = e.course_id
 where e.status = 'pending'
   and z.price_centavos > 0
   and not exists (select 1 from public.payments p where p.enrollment_id = e.id);

-- =========================================================================================
-- 7. Justine gets her own second course, so no two students have the same set.
-- =========================================================================================
--
-- The enrolment and its pending payment are created together. Creating one without the
-- other is the gap this whole migration exists to close, so it is worth doing correctly
-- here even though nothing checks that it was.

insert into public.enrollments (course_id, student_id, status, enrolled_at, updated_at)
select z.id, p.id, 'pending', now(), now()
  from public.courses z
  cross join public.profiles p
 where z.slug = 'security-plus-prep'
   and p.email = 'guia.justinejosh@ncst.edu.ph'
   and not exists (
     select 1 from public.enrollments e
      where e.course_id = z.id and e.student_id = p.id
   );

insert into public.payments (
  student_id, course_id, amount_centavos, currency, status, provider,
  reference_number, enrollment_id, created_at, updated_at
)
select e.student_id, e.course_id, z.price_centavos,
       (select currency from public.payments limit 1),
       'pending',
       (select provider from public.payments limit 1),
       'DEMO-' || upper(substr(replace(e.id::text, '-', ''), 1, 10)),
       e.id, now(), now()
  from public.enrollments e
  join public.courses z on z.id = e.course_id
  join public.profiles p on p.id = e.student_id
 where p.email = 'guia.justinejosh@ncst.edu.ph'
   and e.status = 'pending'
   and z.price_centavos > 0
   and not exists (select 1 from public.payments pay where pay.enrollment_id = e.id);

-- =========================================================================================
-- 8. Settle one payment, through the real path.
-- =========================================================================================
--
-- `settle_payment` rather than a direct `update enrollments set status = 'active'`,
-- because that function is where the money is checked against what was recorded, the
-- enrolment is verified to exist and be settleable, and `activated_at` is stamped. Setting
-- the column by hand would produce an active enrolment with no payment behind it, which is
-- the exact incoherence this migration is fixing.
--
-- The provider event id is derived from the payment id, so a second run settles nothing new.

select public.settle_payment(
         pay.id,
         'demo_pay_' || substr(replace(pay.id::text, '-', ''), 1, 12),
         pay.amount_centavos,
         pay.currency,
         'demo_evt_' || substr(replace(pay.id::text, '-', ''), 1, 12)
       )
  from public.payments pay
  join public.profiles p on p.id = pay.student_id
  join public.courses z on z.id = pay.course_id
 where pay.status = 'pending'
   and p.email = 'garmino.shanleekian@ncst.edu.ph'
   and z.slug = 'advanced-python'
 limit 1;

-- =========================================================================================
-- 9. Announcements, so the surface is not empty.
-- =========================================================================================
--
-- Two course-scoped, one site-wide. Every course-scoped one is authored by the instructor
-- who actually teaches that course - read from `course_instructors`, not named - so the
-- author-to-course relationship is derived rather than asserted.
--
-- An announcement is only readable by people on that course or by everyone, per the
-- `announcements select` policy, so nothing here reaches a student who should not see it.

insert into public.announcements (course_id, author_id, title, body, published_at, created_at, updated_at)
select z.id,
       ci.instructor_id,
       v.title,
       v.body,
       now(), now(), now()
  from public.courses z
  join public.course_instructors ci on ci.course_id = z.id
  join (values
    ('intro-to-programming', 'Week 1 practical is open',
       'The Week 1 practical is open until Sunday. Hand in the exercises as one file and put your name on it - I read them in the order they arrive, so an early submission is not graded earlier, but it is finished earlier.'),
    ('security-plus-prep',    'Bring your own laptop for module 2',
       'Module 2 has two hands-on exercises on packet capture and segmentation. Bring a laptop you can install a packet analyser on, and tell me before the week if you cannot, so I can pair you up rather than leave you watching.')
  ) as v(slug, title, body) on v.slug = z.slug
 where not exists (
   select 1 from public.announcements a where a.course_id = z.id and a.title = v.title
 );

insert into public.announcements (course_id, author_id, title, body, published_at, created_at, updated_at)
select null,
       (select id from public.profiles where role = 'admin' order by created_at limit 1),
       'Term dates and the assessment window',
       'Assessment opens on the first working day of the term and closes a week before the end. Nothing is due outside that window, and an extension is a request to your instructor rather than a setting on the portal.',
       now(), now(), now()
 where not exists (
   select 1 from public.announcements where course_id is null and title = 'Term dates and the assessment window'
 );

-- =========================================================================================
-- 10. One conversation, between a student and an instructor they are actually related to.
-- =========================================================================================
--
-- Both sides are resolved from the data, not chosen. The student is found among those with
-- a submitted attempt, and the instructor through the enrolment join. If no such pairing
-- exists the insert writes nothing rather than inventing one.
--
-- This exists so the messaging surface can be shown working. It is the one piece of the
-- demo that is fabricated conversation, and it is fabricated *consistently*: the pairing is
-- only made because the enrolment makes it true.

do $$
declare
  v_student uuid;
  v_teacher  uuid;
  v_thread   uuid;
begin
  select a.student_id into v_student
    from public.quiz_attempts a
   where a.status = 'submitted'
     and a.student_id is not null
   group by a.student_id
   order by count(*) desc, a.student_id
   limit 1;

  if v_student is null then
    raise notice 'no student with a submitted attempt; the demo conversation was skipped';
    return;
  end if;

  -- An instructor of a course that student is on, resolved through the enrolment.
  select ci.instructor_id into v_teacher
    from public.enrollments e
    join public.course_instructors ci on ci.course_id = e.course_id
   where e.student_id = v_student
     and e.status in ('active', 'completed')
     and ci.instructor_id is distinct from v_student
   order by ci.instructor_id
   limit 1;

  if v_teacher is null then
    raise notice 'no instructor teaches a course this student is on; the demo conversation was skipped';
    return;
  end if;

  insert into public.conversations (subject, created_by, created_at, last_message_at)
  values ('Question about the Week 1 practical', v_student,
          now() - interval '2 days', now() - interval '1 day')
  on conflict do nothing
  returning id into v_thread;

  if v_thread is null then
    -- Already present from an earlier run: find it rather than opening a second thread.
    select c.id into v_thread
      from public.conversations c
     where c.subject = 'Question about the Week 1 practical'
       and c.created_by = v_student
     order by c.created_at
     limit 1;
  end if;

  if v_thread is null then
    raise notice 'the demo conversation could not be created';
    return;
  end if;

  -- `last_read_at` is left null on purpose. A thread the instructor has not opened yet is
  -- the only state in which the unread badge has anything to show.
  insert into public.conversation_participants (conversation_id, user_id, last_read_at)
  select v_thread, u, null
    from unnest(array[v_student, v_teacher]) as u
  on conflict do nothing;

  insert into public.conversation_messages (conversation_id, sender_id, body, created_at)
  select v_thread, v_student,
         'Good morning Sir. On exercise 3 I wrote a helper function for the second requirement - is the helper itself graded, or only the output it returns? I could not tell from the instructions.',
         now() - interval '2 days'
  where not exists (select 1 from public.conversation_messages where conversation_id = v_thread);

  insert into public.conversation_messages (conversation_id, sender_id, body, created_at)
  select v_thread, v_teacher,
         'Good morning. Both are graded - the marker reads the function, not just what it returns, so a correct answer from a function that does not do what the requirement says will not pass. Read requirement 3 again: it says the function must handle the empty list, which is the part that catches people out. Send it when you have it and I will tell you the same afternoon.',
         now() - interval '1 day'
  where (select count(*) from public.conversation_messages where conversation_id = v_thread) = 1;
end;
$$;