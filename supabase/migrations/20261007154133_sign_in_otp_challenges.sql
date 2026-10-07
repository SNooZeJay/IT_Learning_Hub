-- One-time sign-in codes.
create table public.sign_in_challenges (
  id            uuid primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  email         text not null,
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  resends       integer not null default 0,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index sign_in_challenges_user_idx on public.sign_in_challenges (user_id);
create index sign_in_challenges_open_idx on public.sign_in_challenges (user_id) where used_at is null;

alter table public.sign_in_challenges enable row level security;

revoke all on public.sign_in_challenges from anon, authenticated;
revoke all on public.sign_in_challenges from public;

create or replace function public.expire_sign_in_challenges()
returns void
language sql
security definer
set search_path = public
as $$
  update public.sign_in_challenges
     set used_at = now()
   where used_at is null
     and expires_at <= now();
$$;

revoke all on function public.expire_sign_in_challenges() from anon, authenticated;
