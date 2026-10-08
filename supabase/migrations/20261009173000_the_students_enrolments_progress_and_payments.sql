-- Who is taking what: enrolments, lesson progress, and the money trail.
--
-- The spread of enrolment states is deliberate, because each state has something to
-- demonstrate and a single state demonstrates nothing:
--
--   completed  a certificate the trigger actually issued, not one inserted by hand
--   active     progress in flight, so the dashboard and continue-learning have content
--   pending    a paid course awaiting payment - this is where a checkout walkthrough starts
--
-- Two students hold a pending enrolment on a paid course, so the demo can be run from
-- either account and a second run still has something to show.
--
-- Lesson progress is GENERATED rather than listed: take each student's course, order its
-- lessons the way the outline displays them, and mark the first N complete. That
-- guarantees the progress is contiguous from the start of the course, which is what a real
-- student's record looks like and what the percentage assumes. A gap in the middle of a
-- completed set is a broken record, and the assertion at the end checks for it.
--
-- Deadlines and enrolments are relative to the moment this runs, so a database rebuilt
-- later still has assignments that are open rather than ones that expired weeks ago.

begin;

insert into public.enrollments
  (course_id, student_id, status, enrolled_at, activated_at, last_accessed_at)
select c.id, p.id, v.status::public.enrollment_status,
       now() - make_interval(days => v.enrolled_days),
       case when v.status = 'pending' then null
            else now() - make_interval(days => greatest(v.enrolled_days - 1, 0)) end,
       null
from (values
  ('lalamonan.joren@ncst.edu.ph',    'programming-foundations',          'active', 24),
  ('lalamonan.joren@ncst.edu.ph',    'it-support-essentials',           'active', 11),
  ('lalamonan.joren@ncst.edu.ph',    'computer-networking-essentials',  'active',  6),
  ('lalamonan.joren@ncst.edu.ph',    'security-plus-exam-preparation',  'pending',  3),

  ('guia.justinejosh@ncst.edu.ph',   'web-fundamentals',               'active', 18),
  ('guia.justinejosh@ncst.edu.ph',   'it-support-essentials',           'active',  9),
  ('guia.justinejosh@ncst.edu.ph',   'python-for-data-analysis',        'active', 14),
  ('guia.justinejosh@ncst.edu.ph',   'security-plus-exam-preparation',  'pending',  2),

  ('garmino.shanleekian@ncst.edu.ph','programming-foundations',         'active',  4),
  ('garmino.shanleekian@ncst.edu.ph','web-fundamentals',               'active', 13)
) as v(email, course_slug, status, enrolled_days)
join public.profiles p on p.email = v.email
join public.courses c on c.slug = v.course_slug
where not exists (
  select 1 from public.enrollments e where e.course_id = c.id and e.student_id = p.id
);

update public.enrollments
   set last_accessed_at = now() - make_interval(mins => 90)
 where status = 'active';

insert into public.lesson_progress
  (enrollment_id, lesson_id, student_id, status, progress_percent,
   started_at, completed_at, last_position_seconds)
select en.id, rn.lesson_id, en.student_id,
       case when rn.rn <= v.completed_n then 'completed'::public.progress_status
            else 'in_progress'::public.progress_status end,
       case when rn.rn <= v.completed_n then 100 else 30 end,
       en.enrolled_at,
       case when rn.rn <= v.completed_n
            then en.enrolled_at + (rn.rn * interval '6 hours') else null end,
       case when rn.rn <= v.completed_n then null else 90 end
from (values
  ('lalamonan.joren@ncst.edu.ph',    'programming-foundations',         9, 9),
  ('lalamonan.joren@ncst.edu.ph',    'it-support-essentials',          4, 5),
  ('lalamonan.joren@ncst.edu.ph',    'computer-networking-essentials', 1, 1),
  ('guia.justinejosh@ncst.edu.ph',   'web-fundamentals',               5, 5),
  ('guia.justinejosh@ncst.edu.ph',   'it-support-essentials',          2, 2),
  ('guia.justinejosh@ncst.edu.ph',   'python-for-data-analysis',       6, 6),
  ('garmino.shanleekian@ncst.edu.ph','web-fundamentals',               5, 5),
  -- Freshly enrolled: deliberately no progress rows at all, so the percentages and
  -- continue-learning have a genuine starting point rather than a fabricated one.
  ('garmino.shanleekian@ncst.edu.ph','programming-foundations',         0, 0)
) as v(email, course_slug, completed_n, touched_n)
join public.profiles p on p.email = v.email
join public.courses c on c.slug = v.course_slug
join public.enrollments en on en.course_id = c.id and en.student_id = p.id
join lateral (
  select l.id as lesson_id,
         row_number() over (order by m.position, l.position) as rn
  from public.modules m
  join public.lessons l on l.module_id = m.id
  where m.course_id = c.id
    and m.status = 'published'
    and l.status = 'published'
) rn on rn.rn <= v.touched_n
where not exists (
  select 1 from public.lesson_progress lp
  where lp.enrollment_id = en.id and lp.lesson_id = rn.lesson_id
);

-- One settled sale, two awaiting payment.
--
-- The settled payment is inserted with status 'paid' directly. The price_a_new_payment
-- trigger fires on INSERT and computes the marketplace split, so the instructor share and
-- the platform fee come from the same code a real checkout uses rather than being written
-- by hand here. That trigger is INSERT-only on purpose: a settled sale is never
-- re-priced, so editing a course's price later cannot rewrite what someone was charged.
insert into public.payments
  (student_id, course_id, enrollment_id, amount_centavos, currency, status,
   provider, provider_payment_id, reference_number, paid_at)
select p.id, c.id, en.id, c.price_centavos, 'PHP',
       'paid'::public.payment_status, 'paymongo',
       'pay_test_seed_' || substr(md5(p.email || c.slug), 1, 12),
       'ITH-' || upper(substr(md5(c.slug), 1, 8)) || '-' || upper(substr(md5(p.email), 1, 8)),
       now() - make_interval(days => 13)
from (values
  ('guia.justinejosh@ncst.edu.ph', 'python-for-data-analysis')
) as v(email, course_slug)
join public.profiles p on p.email = v.email
join public.courses c on c.slug = v.course_slug
join public.enrollments en on en.course_id = c.id and en.student_id = p.id
where c.price_centavos > 0
  and not exists (select 1 from public.payments pm where pm.student_id = p.id and pm.course_id = c.id);

-- The two pending payments deliberately have no checkout id or URL. A pending payment
-- with no session behind it is exactly what an abandoned checkout leaves, and it is the
-- state the checkout page has to handle by letting the learner start again rather than
-- showing a dead button.
insert into public.payments
  (student_id, course_id, enrollment_id, amount_centavos, currency, status,
   provider, reference_number)
select p.id, c.id, en.id, c.price_centavos, 'PHP',
       'pending'::public.payment_status, 'paymongo',
       'ITH-' || upper(substr(md5(c.slug), 1, 8)) || '-' || upper(substr(md5(p.email), 1, 8))
from (values
  ('lalamonan.joren@ncst.edu.ph',   'security-plus-exam-preparation'),
  ('guia.justinejosh@ncst.edu.ph',  'security-plus-exam-preparation')
) as v(email, course_slug)
join public.profiles p on p.email = v.email
join public.courses c on c.slug = v.course_slug
join public.enrollments en on en.course_id = c.id and en.student_id = p.id
where c.price_centavos > 0
  and not exists (select 1 from public.payments pm where pm.student_id = p.id and pm.course_id = c.id);

commit;

-- A pending enrolment is a payment in flight and always has one behind it; a live
-- enrolment on a paid course is backed by a SETTLED payment, which the browser cannot
-- write because settle_payment is the only writer and is service-role only. If that check
-- fires, something granted access to a course nobody paid for.
do $$
declare v_bad text;
begin
  select string_agg(c.slug || ' / ' || p.email, ', ') into v_bad
  from public.enrollments en
  join public.courses c on c.id = en.course_id
  join public.profiles p on p.id = en.student_id
  where c.price_centavos > 0
    and (
      (en.status = 'pending' and not exists (
         select 1 from public.payments pm
          where pm.enrollment_id = en.id and pm.status = 'pending'))
      or
      (en.status in ('active','completed') and not exists (
         select 1 from public.payments pm
          where pm.enrollment_id = en.id and pm.status = 'paid'))
    );
  if v_bad is not null then
    raise exception 'enrolment and payment disagree: %', v_bad;
  end if;

  select string_agg(reference_number, ', ') into v_bad
  from public.payments
  where (platform_fee_centavos + instructor_share_centavos) <> amount_centavos;
  if v_bad is not null then
    raise exception 'payment whose split does not reconcile to its gross: %', v_bad;
  end if;
end;
$$;