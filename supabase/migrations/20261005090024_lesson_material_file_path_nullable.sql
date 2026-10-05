-- 20261005090024_lesson_material_file_path_nullable.sql
--
-- A text, code or link material could never be created.
--
-- `lesson_materials.file_path` was NOT NULL. The table was designed around a single
-- shape - "every material is an uploaded file" - which is why it has held zero
-- rows since it was created, and why the shape enum added in the previous
-- migration could never be exercised.
--
-- Migration 20261005090023 gave a material one of seven types, each with its own
-- body:
--
--   text, code            -> content_text
--   video_link, external_link -> external_url
--   image, pdf, document  -> file_path
--
-- and added check_material_shape() to enforce that. But the NOT NULL on
-- file_path sat underneath it and contradicted it: the very first branch of the
-- guard ("a text material does not take a file") was unreachable, because no row
-- without a file could be inserted in the first place.
--
-- Observed directly:
--
--   insert into lesson_materials (lesson_id, title, material_type, content_text, position)
--   values (..., 'Starter snippet', 'code', 'print("hello")', 93);
--   ERROR:  null value in column "file_path" ... violates not-null constraint
--
-- The guard is what decides whether a file is required; the column stops being
-- the thing that decides. Dropping the constraint lets the guard do its job, and
-- the guard refuses a pdf with no file just as firmly - verified:
--
--   ERROR: a pdf material needs an uploaded file
--
-- This also matters for correctness rather than convenience: with file_path
-- mandatory, the only thing an instructor could record was a file, so "add a
-- reading list link to this lesson" had no representation at all.

alter table public.lesson_materials
  alter column file_path drop not null;

comment on column public.lesson_materials.file_path is
  'Path in the private lesson-materials bucket. Required only for image, pdf and document materials; check_material_shape() enforces which types need one.';
