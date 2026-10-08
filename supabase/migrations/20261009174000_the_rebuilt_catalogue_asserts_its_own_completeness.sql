-- ===========================================================================
-- The gate.
--
-- Every check here exists because its absence let a real defect through.
--
-- The natural-key joins throughout the rebuild are INNER joins. An inner join whose key
-- does not match does not raise; it drops the row silently. A lesson's resources and an
-- entire quiz were both lost exactly that way, because a lesson title was misspelled in
-- the source of two separate statements. Nothing complained and the catalogue looked
-- complete.
--
-- So completeness is asserted, not assumed. This migration makes no data changes: it
-- either passes, or it raises and names what is missing.
-- ===========================================================================

do $$
declare
  v_bad text;
begin
  -- Every course has exactly two published quizzes.
  select string_agg(c.slug, ', ') into v_bad
  from public.courses c
  where (select count(*) from public.quizzes q
          where q.course_id = c.id and q.status = 'published') <> 2;
  if v_bad is not null then
    raise exception 'course without exactly two published quizzes: %', v_bad;
  end if;

  -- Every course is three modules of three lessons.
  select string_agg(slug, ', ') into v_bad
  from (
    select c.slug,
           (select count(*) from public.modules m where m.course_id = c.id) as mods,
           (select count(*) from public.modules m
              join public.lessons l on l.module_id = m.id
             where m.course_id = c.id) as lessons
      from public.courses c
  ) s
  where s.mods <> 3 or s.lessons <> 9;
  if v_bad is not null then
    raise exception 'course is not three modules of three lessons: %', v_bad;
  end if;

  -- Every lesson carries at least one resource. This is the check whose absence hid the
  -- misspelled-title defect: a course can be structurally perfect and still have a
  -- lesson with nothing attached to it.
  select string_agg(c.slug, ', ') into v_bad
  from public.courses c
  where exists (
    select 1
      from public.modules m
      join public.lessons l on l.module_id = m.id
     where m.course_id = c.id
       and not exists (select 1 from public.lesson_materials lm where lm.lesson_id = l.id)
  );
  if v_bad is not null then
    raise exception 'course containing a lesson with no resource: %', v_bad;
  end if;

  -- No material contradicts its declared type. check_material_shape enforces this on
  -- write; this asserts that nothing bypassed it.
  select string_agg(distinct lm.material_type::text, ', ') into v_bad
  from public.lesson_materials lm
  where (lm.material_type in ('text', 'code')
         and (lm.file_path is not null or coalesce(btrim(lm.content_text), '') = ''))
     or (lm.material_type in ('video_link', 'external_link')
         and (lm.file_path is not null or coalesce(btrim(lm.external_url), '') = ''));
  if v_bad is not null then
    raise exception 'material does not match its declared type: %', v_bad;
  end if;

  -- Every published quiz is answerable: it has questions, each with four options,
  -- exactly one correct, and an explanation.
  select string_agg(q.title, ', ') into v_bad
  from public.quizzes q
  where q.status = 'published'
    and (
      (select count(*) from public.quiz_questions qq where qq.quiz_id = q.id) = 0
      or exists (
        select 1
          from public.quiz_questions qq
         where qq.quiz_id = q.id
           and (
             (select count(*) from public.quiz_options o where o.question_id = qq.id) <> 4
             or (select count(*) from public.quiz_options o
                  where o.question_id = qq.id and o.is_correct) <> 1
             or qq.explanation is null
             or btrim(qq.explanation) = ''
           )
      )
    );
  if v_bad is not null then
    raise exception 'quiz is not answerable: %', v_bad;
  end if;

  -- A quiz that tells the student how many questions it has must be telling the truth.
  -- Two descriptions said "eight" over a quiz holding ten and twelve questions, and a
  -- student reading the brief before starting would have been misled.
  select string_agg(q.title, ', ') into v_bad
  from public.quizzes q
  where q.status = 'published'
    and q.description ~ '\m(Eight|Ten|Twelve|Eleven|Nine|Twenty) questions\M'
    and (
      (q.description like 'Eight questions%'  and (select count(*) from public.quiz_questions where quiz_id = q.id) <> 8)
      or (q.description like 'Nine questions%'  and (select count(*) from public.quiz_questions where quiz_id = q.id) <> 9)
      or (q.description like 'Ten questions%'   and (select count(*) from public.quiz_questions where quiz_id = q.id) <> 10)
      or (q.description like 'Eleven questions%' and (select count(*) from public.quiz_questions where quiz_id = q.id) <> 11)
      or (q.description like 'Twelve questions%' and (select count(*) from public.quiz_questions where quiz_id = q.id) <> 12)
    );
  if v_bad is not null then
    raise exception 'quiz description misstates how many questions there are: %', v_bad;
  end if;

  -- Every quiz belongs to the same course as the lesson it is anchored to.
  select string_agg(q.title, ', ') into v_bad
  from public.quizzes q
  where q.lesson_id is not null
    and not exists (
      select 1
        from public.lessons l
        join public.modules m on m.id = l.module_id
       where l.id = q.lesson_id
         and m.course_id = q.course_id
    );
  if v_bad is not null then
    raise exception 'quiz anchored to a lesson in another course: %', v_bad;
  end if;

  -- Every assignment belongs to the same course as the module it is anchored to.
  select string_agg('assignment: ' || a.title, ', ') into v_bad
  from public.assignments a
  where a.module_id is not null
    and not exists (
      select 1 from public.modules m where m.id = a.module_id and m.course_id = a.course_id
    );
  if v_bad is not null then
    raise exception 'assignment anchored to a module in another course: %', v_bad;
  end if;

  -- Every course's author can actually edit it. is_instructor_of reads course_instructors
  -- and never courses.created_by, so an author missing from the roster is locked out of
  -- their own course - which is what the previous dataset did.
  select string_agg(c.slug, ', ') into v_bad
  from public.courses c
  where not exists (
    select 1 from public.course_instructors ci
     where ci.course_id = c.id and ci.instructor_id = c.created_by
  );
  if v_bad is not null then
    raise exception 'course author is not on its teaching roster: %', v_bad;
  end if;

  -- Every course states what a student must do to finish it.
  select string_agg(c.slug, ', ') into v_bad
  from public.courses c
  where not exists (
    select 1 from public.course_requirements r
     where r.course_id = c.id and r.requirement_type = 'complete_all_lessons'
  )
  or not exists (
    select 1 from public.course_requirements r
     where r.course_id = c.id and r.requirement_type = 'pass_all_quizzes'
  )
  or not exists (
    select 1 from public.course_requirements r
     where r.course_id = c.id and r.requirement_type = 'submit_all_assignments'
  );
  if v_bad is not null then
    raise exception 'course missing a required completion requirement: %', v_bad;
  end if;

  -- A quiz must not pass below the course's quiz-average requirement, or a student could
  -- satisfy pass_all_quizzes and then be stopped by min_quiz_average.
  select string_agg(q.title, ', ') into v_bad
  from public.quizzes q
  join public.courses c on c.id = q.course_id
  where q.status = 'published'
    and exists (
      select 1 from public.course_requirements r
       where r.course_id = c.id and r.requirement_type = 'min_quiz_average'
    )
    and q.passing_score < c.passing_score;
  if v_bad is not null then
    raise exception 'quiz passes below the course quiz average requirement: %', v_bad;
  end if;

  -- A paid course must be sellable: price_a_payment raises without an author.
  select string_agg(c.slug, ', ') into v_bad
  from public.courses c
  where c.price_centavos > 0 and c.created_by is null;
  if v_bad is not null then
    raise exception 'paid course with no author: %', v_bad;
  end if;
end;
$$;