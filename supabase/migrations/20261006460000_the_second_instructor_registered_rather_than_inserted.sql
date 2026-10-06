-- Puts the second instructor's relationships back after the account was re-registered.
--
-- What happened
-- -------------
--
-- The first version of the previous migration inserted a row into `auth.users` directly,
-- the way Supabase's admin API does. Every visible column matched an existing working
-- account, the bcrypt hash verified, and GoTrue refused it:
--
--     POST /auth/v1/token?grant_type=password
--     500 {"code":"unexpected_failure","message":"Database error querying schema"}
--
-- while a known-good account signed in normally on the same request. A *database* error
-- from a row that matched column for column, so the cause is inside GoTrue's own query and
-- not reachable from SQL. Hand-building that row is not a supported path, whatever the
-- column list says.
--
-- The account was therefore registered through the application, which is the only thing
-- that produces a row GoTrue accepts. That created the profile through the same
-- `handle_new_user` trigger any registrant goes through, so the new account arrived as a
-- student and had to be promoted - which is exactly the flow the registration page
-- describes: "New accounts start as a student. An administrator can promote you later."
--
-- Re-registering dropped the old profile, and the profile's foreign keys dropped with it:
-- the announcement it authored and its three teaching rows. Those are restored below. The
-- general lesson is recorded in the previous migration's header, and the audit in the
-- migration before that is what should have caught the missing rows - it runs first, so on
-- a rebuild this file only has to put the relationships back.

-- The instructor relationship, matched on slug so no name is written twice.
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

-- The announcement, authored by whoever now teaches that course - read from
-- `course_instructors`, not named, so it follows the teaching relationship rather than
-- outliving it.
insert into public.announcements (course_id, author_id, title, body, published_at, created_at, updated_at)
select z.id,
       ci.instructor_id,
       'Bring your own laptop for module 2',
       'Module 2 has two hands-on exercises on packet capture and segmentation. Bring a laptop you can install a packet analyser on, and tell me before the week if you cannot, so I can pair you up rather than leave you watching.',
       now(), now(), now()
  from public.courses z
  join public.course_instructors ci on ci.course_id = z.id
 where z.slug = 'security-plus-prep'
   and not exists (
     select 1 from public.announcements a
      where a.course_id = z.id and a.title = 'Bring your own laptop for module 2'
   );

-- The account itself must be confirmed and promoted, and both are state rather than
-- relationship, so this file does not assume them. It says so plainly instead of checking
-- quietly: a silently-unpromoted instructor would look like a student who cannot teach.
do $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
    from public.profiles
   where email = 'instructor.two@ncst.edu.ph';

  if not found then
    raise exception
      'the account instructor.two@ncst.edu.ph does not exist. Register it at /auth/register, confirm the emailed link, then re-run.';
  end if;

  if v_profile.role <> 'instructor' then
    raise exception
      'the account instructor.two@ncst.edu.ph has role %, not instructor. Promote it as an administrator.',
      v_profile.role;
  end if;

  -- Unconfirmed accounts cannot sign in, and the symptom is a sign-in form that simply
  -- stays put. Worth naming here rather than leaving to be discovered at the demo.
  if not exists (
    select 1 from auth.users u
     where u.id = v_profile.id and u.email_confirmed_at is not null
  ) then
    raise exception
      'the account instructor.two@ncst.edu.ph is not confirmed, so it cannot sign in. Confirm it as an administrator first.';
  end if;

  raise notice 'the second instructor exists, is an instructor, and is confirmed';
end;
$$;

-- The whole audit, re-run here as well as in the previous migration.
--
-- It lives in the earlier file because that is where it belongs - with the data it
-- describes - and it is repeated at the end of this one because this file *changed* that
-- data after the audit had already passed. An audit that runs once, before the change that
-- could invalidate it, is not an audit of the change.
do $$
declare
  v_bad text;
begin
  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where not exists (select 1 from public.course_instructors ci where ci.course_id = z.id);

  if v_bad is not null then
    raise exception 'these courses have no instructor at all: %', v_bad;
  end if;

  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where z.status = 'published' and z.category_id is null;

  if v_bad is not null then
    raise exception 'these published courses have no category: %', v_bad;
  end if;

  select string_agg(c.name, ', ') into v_bad
    from public.course_categories c
   where not exists (select 1 from public.courses z where z.category_id = c.id);

  if v_bad is not null then
    raise exception 'these categories are used by no course: %', v_bad;
  end if;

  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where z.status = 'published'
     and exists (select 1 from public.modules m where m.course_id = z.id)
     and not exists (select 1 from public.course_requirements q where q.course_id = z.id);

  if v_bad is not null then
    raise exception 'these published courses have content but no requirement: %', v_bad;
  end if;

  select string_agg(z.slug, ', ') into v_bad
    from public.courses z
   where z.status = 'published'
     and not exists (select 1 from public.modules m where m.course_id = z.id);

  if v_bad is not null then
    raise exception 'these published courses have no modules: %', v_bad;
  end if;

  select string_agg(e.id::text, ', ') into v_bad
    from public.enrollments e
    join public.courses z on z.id = e.course_id
   where z.price_centavos > 0
     and not exists (select 1 from public.payments p where p.enrollment_id = e.id);

  if v_bad is not null then
    raise exception 'these paid-course enrolments have no payment record: %', v_bad;
  end if;

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

  if (select count(*) from public.profiles where role = 'instructor') < 2 then
    raise exception 'fewer than two instructor accounts exist';
  end if;

  raise notice 'the second instructor''s relationships are restored and the audit passes';
end;
$$;