-- What kind of notice this is.
--
-- Without it a reader has to infer "the site is down until noon" from "a new lesson is up"
-- by reading the title, and inferring that from wording is exactly the guess that gets it
-- wrong on the one notice that mattered. Stored rather than derived, so the category
-- cannot drift with a reworded title.
--
-- `general` is the default and the fallback. Existing rows keep their meaning: three
-- seeded notices were never categorised, and calling them "general" is accurate rather
-- than a guess.
--
-- Constrained rather than left free text, because the student view renders an icon and a
-- label from it and a value nobody expected would render as an unknown badge.
alter table public.announcements
  add column if not exists kind text not null default 'general';

alter table public.announcements
  drop constraint if exists announcements_kind_check;

alter table public.announcements
  add constraint announcements_kind_check
  check (kind in ('general', 'maintenance', 'course_update', 'assignment'));

comment on column public.announcements.kind is
  'What the notice is about: general news, a maintenance window, a change to a course, or an assignment or quiz. Drives the label and icon a student sees. Defaults to general.';

create index if not exists announcements_published_at_idx
  on public.announcements (published_at desc)
  where published_at is not null;

comment on index public.announcements_published_at_idx is
  'Every calendar and every student announcement list reads published notices newest first. The partial predicate keeps drafts out of the index, because drafts are a minority and are only ever read by their author.';