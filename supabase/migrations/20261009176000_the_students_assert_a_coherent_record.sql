-- The student record must hang together.
--
-- These are the invariants the application maintains while a student works, asserted
-- once so a rebuild that got them wrong is caught here rather than on screen.
--
-- Two of these checks exist because the first version of them was wrong in a way that
-- made them useless. The contiguity check originally asked whether every earlier lesson
-- of a completed lesson was also completed, expressed as "no earlier lesson exists that
-- is not completed" - which is trivially TRUE when a student is on the first lesson, so
-- it flagged every perfectly good record. And an earlier version treated a later lesson
-- that had simply never been started as "left in progress", so it flagged every healthy
-- half-finished course. Both were corrected here rather than dropped, because the
-- conditions they were meant to catch are real.

do $$
declare v_bad text;
begin
  -- A pending enrolment is a payment in flight, and always has one behind it.
  select string_agg(en.id::text, ', ') into v_bad
  from public.enrollments en
  where en.status = 'pending'
    and not exists (
      select 1 from public.payments pm
      where pm.enrollment_id = en.id and pm.status = 'pending'
    );
  if v_bad is not null then
    raise exception 'pending enrolment with no pending payment: %', v_bad;
  end if;

  -- A live enrolment on a paid course is backed by a SETTLED payment. The browser cannot
  -- write that row: settle_payment is the only writer and is service-role only. If this
  -- fires, something granted access to a course nobody paid for.
  select string_agg(c.slug || ' / ' || p.email, ', ') into v_bad
  from public.enrollments en
  join public.courses c on c.id = en.course_id
  join public.profiles p on p.id = en.student_id
  where c.price_centavos > 0
    and en.status in ('active', 'completed')
    and not exists (
      select 1 from public.payments pm
      where pm.enrollment_id = en.id and pm.status = 'paid'
    );
  if v_bad is not null then
    raise exception 'live enrolment on a paid course with no settled payment: %', v_bad;
  end if;

  -- Nobody settles two payments for the same course. The partial unique index on payments
  -- enforces this going forward; this asserts it for rows that already exist.
  select string_agg(p.email || ' / ' || c.slug, ', ') into v_bad
  from public.payments pm
  join public.profiles p on p.id = pm.student_id
  join public.courses c on c.id = pm.course_id
  where pm.status = 'paid'
    and exists (
      select 1 from public.payments pm2
      where pm2.student_id = pm.student_id
        and pm2.course_id = pm.course_id
        and pm2.status = 'paid'
        and pm2.id <> pm.id
    );
  if v_bad is not null then
    raise exception 'student settled more than one payment for the same course: %', v_bad;
  end if;

  -- Completed lessons must be contiguous from the start of the outline.
  --
  -- Flagged when a completed lesson exists AND an EARLIER lesson exists that is not
  -- completed. A later lesson that was simply never opened is fine and is not flagged.
  select string_agg(p.email || ' in ' || c.slug, ', ') into v_bad
  from public.courses c
  join public.enrollments en on en.course_id = c.id and en.status in ('active','completed')
  join public.profiles p on p.id = en.student_id
  where exists (
    select 1
      from public.modules m
      join public.lessons l on l.module_id = m.id
     where m.course_id = c.id and m.status = 'published' and l.status = 'published'
       and exists (
         select 1 from public.lesson_progress lp
          where lp.enrollment_id = en.id and lp.lesson_id = l.id and lp.status = 'completed'
       )
  )
  and exists (
    select 1
      from public.modules m
      join public.lessons l on l.module_id = m.id
     where m.course_id = c.id and m.status = 'published' and l.status = 'published'
       and exists (
         select 1 from public.lesson_progress lp
          where lp.enrollment_id = en.id and lp.lesson_id = l.id and lp.status = 'completed'
       )
       and exists (
         select 1
           from public.modules m2
           join public.lessons l2 on l2.module_id = m2.id
          where m2.course_id = c.id and m2.status = 'published' and l2.status = 'published'
            and (m2.position, l2.position) < (m.position, l.position)
            and not exists (
              select 1 from public.lesson_progress lp2
               where lp2.enrollment_id = en.id
                 and lp2.lesson_id = l2.id
                 and lp2.status = 'completed'
            )
       )
  );
  if v_bad is not null then
    raise exception 'completed lessons with an incomplete lesson before them: %', v_bad;
  end if;

  -- Two lessons cannot both be half-done with the EARLIER one unfinished. A student has
  -- one current lesson; two open at once, out of order, is what a broken resume produces.
  select string_agg(p.email || ' in ' || c.slug, ', ') into v_bad
  from public.lesson_progress lp
  join public.enrollments en on en.id = lp.enrollment_id
  join public.profiles p on p.id = en.student_id
  join public.courses c on c.id = en.course_id
  where lp.status = 'in_progress'
    and exists (
      select 1
        from public.modules m
        join public.lessons l on l.module_id = m.id
       where m.course_id = c.id and m.status = 'published' and l.status = 'published'
         and (m.position, l.position) > (
           select m3.position, l3.position
             from public.modules m3
             join public.lessons l3 on l3.module_id = m3.id
            where l3.id = lp.lesson_id
         )
         and exists (
           select 1 from public.lesson_progress lp3
            where lp3.enrollment_id = lp.enrollment_id
              and lp3.lesson_id = l.id
              and lp3.status = 'in_progress'
         )
    );
  if v_bad is not null then
    raise exception 'an earlier lesson left in progress while a later one is also open: %', v_bad;
  end if;

  -- The marketplace split must reconcile exactly to the gross.
  select string_agg(reference_number, ', ') into v_bad
  from public.payments
  where (platform_fee_centavos + instructor_share_centavos) <> amount_centavos;
  if v_bad is not null then
    raise exception 'payment whose split does not reconcile to its gross: %', v_bad;
  end if;

  -- A settled payment must carry the provider id and the timestamp it settled with.
  -- An admin ledger row with neither cannot be reconciled against PayMongo later.
  select string_agg(reference_number, ', ') into v_bad
  from public.payments
  where status = 'paid'
    and (provider_payment_id is null or paid_at is null or provider <> 'paymongo');
  if v_bad is not null then
    raise exception 'settled payment missing its provider reference: %', v_bad;
  end if;

  -- Progress must be recorded against the enrolment's own student. sync_lesson_progress_student
  -- enforces this on write; this asserts the outcome.
  select string_agg(lp.id::text, ', ') into v_bad
  from public.lesson_progress lp
  join public.enrollments en on en.id = lp.enrollment_id
  where lp.student_id is distinct from en.student_id;
  if v_bad is not null then
    raise exception 'progress row recorded against the wrong student: %', v_bad;
  end if;
end;
$$;