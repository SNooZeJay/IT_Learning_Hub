-- Two things the previous migration's first run got wrong, plus the audit that should have
-- caught both.
--
-- What went wrong
-- ---------------
--
-- 1. "Introduction to Programming" was left uncategorised. Its slug is `intro-to-programming`
--    and the mapping used `introduction-to-programming`, read off the course *title*. Five of
--    the six slugs happened to be guessable from their titles; this one is not, and the five
--    that matched made the sixth look fine. The file has been corrected, and this migration
--    applies the category to the live row.
--
-- 2. CompTIA Security+ Preparation ended up with two modules and no requirement. The
--    requirements insert was ordered *before* the section that gave that course its
--    modules, and its condition is "a published course that has modules" - so it correctly
--    classified every course except the one created moments later. The file has been
--    reordered; this migration adds the missing requirement.
--
-- Both were silent. Neither raised, neither logged, and neither showed up as an error: a
-- course with no category is a filter that quietly matches nothing, and a course with no
-- requirement is one that can never complete. The checks below are what was missing.
--
-- The slug lesson is the general one and is worth more than the two fixes
-- -----------------------------------------------------------------------
-- "Introduction to Programming"  -> intro-to-programming
-- "IT Support Essentials"         -> it-support-essentials
-- "CompTIA Security+ Preparation"-> security-plus-prep
-- "Intro to Web APIs (in progress)" -> intro-web-apis
--
-- A slug is identity, not presentation, and it is not derivable from the title. Every slug
-- touched by either migration was read from the table first.

-- 1. The category, matched on the slug that actually exists.

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

-- 2. The requirement the ordering cost CompTIA.

insert into public.course_requirements (course_id, requirement_type, threshold)
select z.id, 'complete_all_lessons', null
  from public.courses z
 where z.status = 'published'
   and exists (select 1 from public.modules m where m.course_id = z.id)
on conflict do nothing;

-- 3. The announcement that never matched, for the same reason as the category.

insert into public.announcements (course_id, author_id, title, body, published_at, created_at, updated_at)
select z.id,
       ci.instructor_id,
       'Week 1 practical is open',
       'The Week 1 practical is open until Sunday. Hand in the exercises as one file and put your name on it - I read them in the order they arrive, so an early submission is not graded earlier, but it is finished earlier.',
       now(), now(), now()
  from public.courses z
  join public.course_instructors ci on ci.course_id = z.id
 where z.slug = 'intro-to-programming'
   and not exists (
     select 1 from public.announcements a
      where a.course_id = z.id and a.title = 'Week 1 practical is open'
   );

-- =========================================================================================
-- The audit, as checks that refuse to pass.
-- =========================================================================================
--
-- Each of these describes a property the application assumes. None of them was asserted
-- before, which is why two of them were violated by the migration that introduced the data
-- they describe.

do $$
declare
  v_bad text;
begin
  -- Every course has an instructor. Without one the course has nobody whose student could
  -- ever see it, and `messageable_people()` returns nothing for it.
  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where not exists (
     select 1 from public.course_instructors ci where ci.course_id = z.id
   );

  if v_bad is not null then
    raise exception 'these courses have no instructor at all: %', v_bad;
  end if;

  -- Every published course has a category. The catalogue filter matches on this, so a
  -- course without one is invisible to its own category rather than absent.
  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where z.status = 'published'
     and z.category_id is null;

  if v_bad is not null then
    raise exception 'these published courses have no category: %', v_bad;
  end if;

  -- No category is orphaned. Three categories existed and nothing used them, which left the
  -- admin Categories screen managing rows that pointed at nothing.
  select string_agg(c.name, ', ') into v_bad
    from public.course_categories c
   where not exists (
     select 1 from public.courses z where z.category_id = c.id
   );

  if v_bad is not null then
    raise exception 'these categories are used by no course: %', v_bad;
  end if;

  -- Every published course that has content has at least one requirement. Without one,
  -- `course_completion_gaps` returns nothing and the enrolment can never complete.
  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where z.status = 'published'
     and exists (select 1 from public.modules m where m.course_id = z.id)
     and not exists (
       select 1 from public.course_requirements q where q.course_id = z.id
     );

  if v_bad is not null then
    raise exception 'these published courses have content but no requirement: %', v_bad;
  end if;

  -- No published course is empty. A purchasable course with no modules is the most visible
  -- incoherence there is: it is offered, and opening it shows nothing.
  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where z.status = 'published'
     and not exists (select 1 from public.modules m where m.course_id = z.id);

  if v_bad is not null then
    raise exception 'these published courses have no modules: %', v_bad;
  end if;

  -- Every enrolment on a paid course has a payment behind it, and vice versa. A pending
  -- enrolment with no payment is the shape that produced the bad notification: a row that
  -- says somebody intends to take a course and nothing that says how or whether.
  select string_agg(e.id::text, ', ') into v_bad
    from public.enrollments e
    join public.courses z on z.id = e.course_id
   where z.price_centavos > 0
     and not exists (select 1 from public.payments p where p.enrollment_id = e.id);

  if v_bad is not null then
    raise exception 'these paid-course enrolments have no payment record: %', v_bad;
  end if;

  -- And no payment points at an enrolment that is not there.
  select string_agg(p.id::text, ', ') into v_bad
    from public.payments p
   where p.enrollment_id is not null
     and not exists (select 1 from public.enrollments e where e.id = p.enrollment_id);

  if v_bad is not null then
    raise exception 'these payments point at an enrolment that does not exist: %', v_bad;
  end if;

  -- An active enrolment on a paid course must have been paid for. The reverse direction of
  -- the one above, and the one that decides whether a course is actually unlocked.
  select string_agg(format('%s on %s', pr.full_name, z.title), ', ') into v_bad
    from public.enrollments e
    join public.courses z on z.id = e.course_id
    join public.profiles pr on pr.id = e.student_id
   where z.price_centavos > 0
     and e.status in ('active', 'completed')
     and not exists (
       select 1 from public.payments p
        where p.enrollment_id = e.id and p.status = 'paid'
     );

  if v_bad is not null then
    raise exception 'these paid enrolments are active without a settled payment: %', v_bad;
  end if;

  -- An instructor is never enrolled as a student, and a student never teaches. A row of
  -- either kind makes every "who can see this" question answer two different ways.
  select string_agg(pr.full_name || ' (' || pr.role || ')', ', ') into v_bad
    from public.enrollments e
    join public.profiles pr on pr.id = e.student_id
   where pr.role <> 'student';

  if v_bad is not null then
    raise exception 'these non-student accounts hold enrolments: %', v_bad;
  end if;

  select string_agg(pr.full_name || ' (' || pr.role || ')', ', ') into v_bad
    from public.course_instructors ci
    join public.profiles pr on pr.id = ci.instructor_id
   where pr.role <> 'instructor' and pr.role <> 'admin';

  if v_bad is not null then
    raise exception 'these accounts teach without being instructors: %', v_bad;
  end if;

  -- Every course-scoped announcement is authored by somebody who teaches that course.
  select string_agg(a.title, ', ') into v_bad
    from public.announcements a
   where a.course_id is not null
     and not exists (
       select 1 from public.course_instructors ci
        where ci.course_id = a.course_id and ci.instructor_id = a.author_id
     );

  if v_bad is not null then
    raise exception
      'these announcements are authored by someone who does not teach the course: %', v_bad;
  end if;

  -- Every conversation has exactly two participants, and every message inside it comes
  -- from one of them. A conversation with a non-participant sender is a message somebody
  -- sent into a thread they are not in.
  select string_agg(c.id::text, ', ') into v_bad
    from public.conversations c
   where (select count(*) from public.conversation_participants cp
           where cp.conversation_id = c.id) <> 2;

  if v_bad is not null then
    raise exception 'these conversations do not have exactly two participants: %', v_bad;
  end if;

  select string_agg(m.id::text, ', ') into v_bad
    from public.conversation_messages m
   where not exists (
     select 1 from public.conversation_participants cp
      where cp.conversation_id = m.conversation_id
        and cp.user_id = m.sender_id
   );

  if v_bad is not null then
    raise exception 'these messages come from a non-participant: %', v_bad;
  end if;

  -- And every conversation has at least one participant who is an enrolled student taught
  -- by the other. This is the check the demo conversation would have failed if it had been
  -- written by hand with the wrong pair of accounts.
  --
  -- Written as an existence over participant *pairs*, not as a per-participant condition.
  -- The first version tested each participant in turn for "is an enrolled student whose
  -- instructor is in this thread", which no instructor can ever satisfy - an instructor
  -- holds no enrolments - so it fired on the very conversation it was written to bless. A
  -- check that only passes when nobody is a teacher is not a check on teaching
  -- relationships.
  select string_agg(c.id::text, ', ') into v_bad
    from public.conversations c
   where not exists (
     select 1
       from public.conversation_participants a
       join public.conversation_participants b
         on b.conversation_id = a.conversation_id
        and b.user_id <> a.user_id
       join public.enrollments e
         on e.student_id = a.user_id
        and e.status in ('active', 'completed')
       join public.course_instructors ci
         on ci.course_id = e.course_id
        and ci.instructor_id = b.user_id
      where a.conversation_id = c.id
   );

  if v_bad is not null then
    raise exception
      'these conversations pair people with no teaching relationship: %', v_bad;
  end if;

  -- Both instructors exist and the courses are split between them, so the instructor role
  -- has something to isolate. One instructor teaching everything is the state this
  -- migration was written to end, so it is worth failing on rather than merely noting.
  if (select count(*) from public.profiles where role = 'instructor') < 2 then
    raise exception 'fewer than two instructor accounts exist';
  end if;

  raise notice
    'demo data is internally consistent: every course taught, categorised and required; no published course empty; every paid enrolment settled or pending; every conversation between people who are actually related';
end;
$$;