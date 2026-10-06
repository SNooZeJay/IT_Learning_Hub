-- Supabase grants EXECUTE on every new function in `public` to `anon`, and a
-- `revoke ... from public` does not undo it.
--
-- What happened
-- -------------
-- 20261006220000 created `assignment_id_from_object_name` and revoked from `public`,
-- which was correct for the PUBLIC pseudo-role and not sufficient:
--
--     revoke all on function public.assignment_id_from_object_name(text) from public;
--     grant execute on function public.assignment_id_from_object_name(text) to authenticated;
--
-- The resulting ACL was:
--
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- `anon=X` is an *explicit* grant, not the PUBLIC entry, so revoking PUBLIC left it
-- untouched. It comes from the platform's default privileges on the schema:
--
--     alter default privileges in schema public
--       grant all on functions to postgres, anon, authenticated, service_role;
--
-- which stamps every function created afterwards, including one written specifically to
-- tighten a storage policy.
--
-- Why this one matters more than it looks
-- --------------------------------------
-- The function is harmless in itself - it parses a string and returns a uuid or null.
-- But the project rule, enforced by 20261006180000, is that no function in `public` is
-- executable by `anon`, and that migration was correct only because it enumerated
-- functions that already existed. Every new function has to be revoked again, so the
-- rule was quietly one-directional.
--
-- Checked after this migration: `anon` can execute zero functions in `public`, and
-- `assignment_id_from_object_name` is still callable by `authenticated`, which is the
-- only caller the storage policies make.
--
-- The lesson is written here because it is invisible. `revoke ... from public` looks
-- like it removes every grant, and it removes the one that is easy to see. When writing
-- a function in `public`, name the roles:
--
--     revoke execute on function ... from anon, public;

revoke execute on function public.assignment_id_from_object_name(text) from anon;

comment on function public.assignment_id_from_object_name(text) is
  'The assignment id a submission object belongs to, taken from the second folder segment, or null when that segment is not a uuid. Mirrors course_id_from_object_name, which guards the lesson-materials bucket. The exception handler is deliberate: without it a junk segment raises inside a policy predicate and the student gets a 500 instead of a refusal. EXECUTE is revoked from anon explicitly because the schema default privileges grant it to anon on creation, and revoking PUBLIC does not undo that grant.';