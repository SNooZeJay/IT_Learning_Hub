-- Student file attachments, and an assignments.updated_at that actually moves.
--
-- 1. Students cannot attach a file to a submission
-- 2. assignments has no updated_at trigger, so editing one leaves it at its creation time
--
-- Both were flagged during the assignment work and left undone deliberately, because each
-- is a schema decision rather than a bug. They are taken here, and the reasoning is
-- written down so the next person can reverse it knowingly.
--
-- ---------------------------------------------------------------------------
-- 1. The assignment-submissions bucket
-- ---------------------------------------------------------------------------
-- The bucket's only policy is admin-only, for every command:
--
--     create policy "admins manage submission bucket" on storage.objects
--       for all to authenticated
--       using (bucket_id = 'assignment-submissions' and public.is_admin())
--
-- So a student's upload was refused by storage before any row was written, and the
-- submission form is text-only because offering a file input that cannot work would be
-- worse than not offering one.
--
-- A student may now write to the bucket, and only their own folder. The object key is
-- `<student_id>/<uuid>-<filename>`, and the policy refuses any key whose first segment is
-- not the caller's own id. That is the same shape the avatars and lesson-materials
-- buckets use, and it is the reason `course_id_from_object_name` exists: the first path
-- segment is the ownership claim, so it has to be a uuid the caller can be held to.
--
-- Reading is scoped the same way. A student reads their own attachments; an instructor
-- reads those of students enrolled in a course they teach; an admin reads all of them.
-- Without the instructor clause a student could not open an attachment on a submission
-- they need to grade, which would make grading a submitted file impossible.
--
-- `notify` is not involved: a submission is not a message, and the user's requirement is
-- that the two stay separate systems. Nothing here creates a notification.
--
-- The 10 MB cap is enforced in the bucket policy rather than only in the browser,
-- because a browser cap is a suggestion and `storage.objects` is where a file actually
-- arrives. It matches the 10 MB the lesson-materials form already enforces.

drop policy if exists "students upload their own submissions" on storage.objects;
create policy "students upload their own submissions" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assignment-submissions'
    and ((storage.foldername(name))[1]) = auth.uid()::text
    and (((storage.foldername(name))[2]) is not null)
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
    and (((storage.foldername(name))[2]) is not null)
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
        where sub.assignment_id::text = ((storage.foldername(name))[2])
          and public.is_instructor_of(sub.course_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. assignments.updated_at
-- ---------------------------------------------------------------------------
-- `assignments` was created without the `set_updated_at` trigger that eight other tables
-- carry, so editing an assignment left `updated_at` at its creation time. Nothing reads
-- the column today, so nothing is wrong yet - but it is a stale value waiting for
-- whoever does read it.
--
-- Set by a trigger rather than from the browser. `lesson_materials` already stamps
-- updated_at from `check_material_shape`, and the other tables use `set_updated_at`; a
-- client-written timestamp is the one that invites the next writer to do it
-- inconsistently, or to forget.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();
