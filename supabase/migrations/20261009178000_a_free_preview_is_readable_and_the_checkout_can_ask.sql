-- Two things the payment and preview paths were missing.
--
-- Nothing in this file touches learning content. It is separated from the rebuild
-- deliberately: this is behaviour and access control, and it applies to whatever content
-- exists rather than to one particular catalogue.

-- ---------------------------------------------------------------------------
-- 1. is_preview now means something.
--
-- The instructor course editor has carried a "Free preview - anyone can read this lesson
-- without enrolling" checkbox since the editor shipped. No RLS policy ever referenced the
-- column, so a preview lesson was actually LESS readable than any other: the
-- published-structure policy returns titles and positions, but reading the content also
-- required an enrolment. The control was a promise the database did not keep, and a
-- control that silently does nothing is worse than no control.
--
-- The new branch grants the content and materials of a PREVIEW lesson, in a PUBLISHED
-- module, on a PUBLISHED course, without an enrolment. is_preview is the author stating
-- explicitly that this lesson is meant to be readable before paying, so it is honoured for
-- any signed-in visitor. (The anon role holds no grant on lessons or modules at all, so
-- this does not widen public access to lesson bodies - it makes the checkbox do what the
-- label says for the students it can actually reach.)
--
-- Only preview lessons are affected. Every other lesson still requires an enrolment, and
-- the quizzes, questions and assignments policies are untouched, so a prospective student
-- still cannot read an answer key by following a preview lesson.
-- ---------------------------------------------------------------------------

drop policy if exists "lessons select" on public.lessons;

create policy "lessons select" on public.lessons
  for select
  using (
       public.is_admin()
    or public.can_edit_course_content(
         (select m.course_id from public.modules m where m.id = lessons.module_id))
    or (
         lessons.status = 'published'::public.content_status
     and exists (
           select 1
             from public.modules m
             join public.courses c on c.id = m.course_id
            where m.id = lessons.module_id
              and m.status = 'published'::public.content_status
              and c.status = 'published'::public.course_status
         )
     and (
           public.is_enrolled_in(
             (select m.course_id from public.modules m where m.id = lessons.module_id))
        or lessons.is_preview
     )
    )
  );

drop policy if exists "lesson_materials select" on public.lesson_materials;

create policy "lesson_materials select" on public.lesson_materials
  for select
  using (
       public.is_admin()
    or public.can_edit_course_content((
         select m.course_id
           from public.lessons l
           join public.modules m on m.id = l.module_id
          where l.id = lesson_materials.lesson_id))
    or (
         exists (
           select 1
             from public.lessons l
             join public.modules m on m.id = l.module_id
            where l.id = lesson_materials.lesson_id
              and l.status = 'published'::public.content_status
              and m.status = 'published'::public.content_status
         )
     and (
           public.is_enrolled_in((
             select m.course_id
               from public.lessons l
               join public.modules m on m.id = l.module_id
              where l.id = lesson_materials.lesson_id))
        or exists (
             select 1 from public.lessons l
              where l.id = lesson_materials.lesson_id and l.is_preview)
     )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. payment_status_for: the checkout page can ask, without trusting the browser.
--
-- After PayMongo redirects a learner back, the only two server-side facts the browser can
-- see are "is there a live enrolment" and "what does my own payment row say". Settlement
-- stays the webhook's job; this function moves no money and settles nothing.
--
-- It is scoped to auth.uid() and takes NO student id, so a caller can only ever read its
-- own payment. That is the point: the return page has to be able to say "enrolled
-- successfully" on the strength of a fact, not on the strength of a query string anyone
-- can type into the address bar.
--
-- It returns one row even when there is no payment yet, so the page can tell "not
-- started" from "in flight" from "settled" from "failed" in a single round trip.
--
-- `settled` is the only column the page may treat as proof of payment, and it is computed
-- here from the payment row rather than sent by the provider or read from the URL.
-- ---------------------------------------------------------------------------

create or replace function public.payment_status_for(p_course_id uuid)
returns table (
  course_id            uuid,
  course_slug          text,
  course_title         text,
  price_centavos       integer,
  enrollment_status    public.enrollment_status,
  payment_id           uuid,
  payment_status       public.payment_status,
  reference_number     text,
  amount_centavos      integer,
  paid_at              timestamptz,
  settled              boolean
)
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select
    c.id,
    c.slug,
    c.title,
    c.price_centavos,
    en.status,
    pm.id,
    pm.status,
    pm.reference_number,
    pm.amount_centavos,
    pm.paid_at,
    (pm.status = 'paid'::public.payment_status)
  from public.courses c
  left join public.enrollments en
    on en.course_id = c.id
   and en.student_id = auth.uid()
  left join lateral (
    select p.* from public.payments p
     where p.course_id = c.id and p.student_id = auth.uid()
     order by (p.status = 'paid') desc,
              case p.status when 'paid' then 1 when 'pending' then 2 else 3 end,
              p.created_at desc
     limit 1
  ) pm on true
  where c.id = p_course_id
    -- A published course, or one the caller is entitled to see anyway.
    and (
         c.status = 'published'::public.course_status
      or public.is_admin()
      or public.is_instructor_of(c.id)
    );
$$;

revoke all on function public.payment_status_for(uuid) from public, anon;
grant execute on function public.payment_status_for(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- preview_is_readable: one place that answers "is this lesson actually published and
-- visible", so a caller does not have to restate the module and course status checks and
-- get them subtly wrong.
-- ---------------------------------------------------------------------------

create or replace function public.preview_is_readable(p_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.lessons l
      join public.modules m on m.id = l.module_id
      join public.courses c on c.id = m.course_id
     where l.id = p_lesson
       and l.status = 'published'::public.content_status
       and m.status = 'published'::public.content_status
       and c.status = 'published'::public.course_status
  );
$$;

revoke all on function public.preview_is_readable(uuid) from public, anon;
grant execute on function public.preview_is_readable(uuid) to authenticated, anon;