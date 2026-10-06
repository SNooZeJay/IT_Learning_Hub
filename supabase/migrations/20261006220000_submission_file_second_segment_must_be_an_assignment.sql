-- The second path segment of a submission file was never checked, so a student could
-- upload to <own id>/anything-at-all/ and no instructor could ever open it.
--
-- What was wrong
-- --------------
-- The insert and update policies required the second folder segment to be *present*:
--
--     and (((storage.foldername(name))[2]) is not null)
--
-- which admits `<student id>/nonsense/report.txt`. The read policy then resolves that
-- segment by joining it against a real assignment:
--
--     where sub.assignment_id::text = ((storage.foldername(name))[2])
--
-- `nonsense` matches no assignment, so the file satisfies none of the three read
-- branches except `owner_id = auth.uid()`. The uploader can see their own file and the
-- instructor grading the hand-in cannot, which is the one read that matters.
--
-- Verified before this migration, as the student, on the deployed policies:
--
--     <own id>/<assignment id>/<uuid>-notes.txt   ALLOWED   correct
--     <classmate id>/<assignment id>/...          refused 42501   correct
--     inbox/<assignment id>/loose.txt             refused 42501   correct
--     <own id>/not-a-uuid/report.txt              ALLOWED   WRONG
--
-- The fix
-- -------
-- `assignment_id_from_object_name`, written to the same shape as the
-- `course_id_from_object_name` that already guards the lesson-materials bucket: the cast
-- is wrapped so a non-uuid yields `null` rather than raising. That matters more here
-- than the cast itself - a policy predicate that raises turns a refused upload into a
-- 500 with no explanation, and the helper makes "not an assignment id" an ordinary
-- `false` the policy can refuse on.
--
-- The helper is `stable`, not `immutable`, because a policy predicate calling an
-- immutable function is not a concern but the body reads nothing, so immutable would
-- also be honest. `stable` is chosen to match its sibling.
--
-- Nothing is deleted. Every key that was valid under the old policy and is a real
-- assignment id is still valid under this one, and there are no stored objects yet -
-- the bucket was admin-only until 20261006210000, so no student has ever written one.

create or replace function public.assignment_id_from_object_name(object_name text)
returns uuid
language plpgsql
stable
set search_path to 'public', 'storage', 'pg_temp'
as $$
begin
  return ((storage.foldername(object_name))[2])::uuid;
exception
  when others then return null;
end;
$$;

comment on function public.assignment_id_from_object_name(text) is
  'The assignment id a submission object belongs to, taken from the second folder segment, or null when that segment is not a uuid. Mirrors course_id_from_object_name, which guards the lesson-materials bucket. The exception handler is deliberate: without it a junk segment raises inside a policy predicate and the student gets a 500 instead of a refusal.';

revoke all on function public.assignment_id_from_object_name(text) from public;
grant execute on function public.assignment_id_from_object_name(text) to authenticated;

drop policy if exists "students upload their own submissions" on storage.objects;
create policy "students upload their own submissions" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assignment-submissions'
    and ((storage.foldername(name))[1]) = auth.uid()::text
    and public.assignment_id_from_object_name(name) is not null
    and coalesce((metadata->>'size')::bigint, 0) <= 10485760
  );

drop policy if exists "students replace their own submission file" on storage.objects;
create policy "students replace their own submission file" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'assignment-submissions'
    and owner_id = auth.uid()::text
  )
  with check (
    bucket_id = 'assignment-submissions'
    and ((storage.foldername(name))[1]) = auth.uid()::text
    and public.assignment_id_from_object_name(name) is not null
    and coalesce((metadata->>'size')::bigint, 0) <= 10485760
  );

drop policy if exists "submission files are readable by their student, their instructor, or an admin" on storage.objects;
create policy "submission files are readable by their student, their instructor, or an admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assignment-submissions'
    and (
      owner_id = auth.uid()::text
      or public.is_admin()
      or exists (
        -- The student's enrolment in the course the submission belongs to, joined to an
        -- instructor of that same course. Both halves are needed: enrolment alone would
        -- let any classmate read your attachment, and instruction alone would let any
        -- instructor read it.
        select 1
        from public.assignment_submissions sub
        join public.enrollments e
          on e.student_id = sub.student_id and e.course_id = sub.course_id
        where sub.assignment_id = public.assignment_id_from_object_name(name)
          and public.is_instructor_of(sub.course_id)
      )
    )
  );