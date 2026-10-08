-- Optional sign-in codes.
--
-- Sign-in used to send a six-digit code to every account on every sign-in. That was
-- built as a fixed rule, so nobody could turn it off and nobody could rely on it being
-- on: the whole platform treated a working inbox as a precondition for using it, which
-- is not true of every LMS and was never asked for.
--
-- `false` is the default, deliberately. A column added with `default true` would switch
-- every existing account to a flow they never opted into, and a demo with no inbox
-- would be unusable. The current behaviour becomes the opt-in, not the rule.
--
-- Authorization comes from `profiles update own`, which already requires
-- `id = auth.uid()`. The owner can set this for themselves and cannot set it for
-- anybody else, and an admin's own update policy is not a licence to change another
-- account's sign-in method.
--
-- No column-level GRANT here on purpose. The table already carries an UPDATE grant,
-- which is what lets a person edit their own name and bio; a narrower column grant
-- would not narrow anything, because the table grant still covers every column. Making
-- this column genuinely owner-only would mean revoking UPDATE on the table and granting
-- it back one column at a time, and that is a wider change than this preference needs.
alter table public.profiles
  add column if not exists email_code_sign_in boolean not null default false;

comment on column public.profiles.email_code_sign_in is
  'When true, signing in requires a six-digit code emailed to this account. When false, the password alone is enough. Set by the account owner on /settings. Writable only by the owner, through the `profiles update own` policy.';
