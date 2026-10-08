-- Lessons that claimed to be videos and had nothing to play.
--
-- `Hello, World` and `Loops` were typed `video` with `video_url` null. The student lesson
-- page rendered a whole video panel for each, containing the sentence "No video has been
-- attached to this lesson yet" - a video-shaped hole in a course that does not use video,
-- which reads as missing content rather than as a text lesson.
--
-- Re-typed to `article`. They both carry real written content, which is what they are.
--
-- The page now hides the panel entirely unless a URL exists, so a lesson typed as a video
-- with nothing behind it cannot reintroduce this. No external URL was invented to fill the
-- gap: a link that 404s on stage is worse than no link.
update public.lessons
   set lesson_type = 'article'
 where lesson_type = 'video'
   and video_url is null;

-- Lesson titles were descriptions.
--
-- Every lesson in this database had its `title` column filled with a sentence that
-- explains the lesson - "Structures that hold behaviour, and the patterns that stop them
-- sprawling" - which is a summary, and appears in the sidebar, the curriculum outline,
-- the notification list and the browser tab. A learner scanning a course saw prose where a
-- topic belongs.
--
-- The sentences were not lost. They belong in `summary`, which is the field for them,
-- and the summary is what a learner wants when they open the lesson.
update public.lessons set summary = 'Data Structures That Carry Behaviour', summary = 'Structures that hold behaviour, and the patterns that stop them sprawling.' where title = 'Structures that hold behaviour, and the patterns that stop them sprawling.';
update public.lessons set summary = 'Classes, and When Not to Use Them', summary = 'When to use a class, and when not to.' where title = 'When to use a class, and when not to.';
update public.lessons set summary = 'Tests That Fail for the Right Reason', summary = 'A test that passes for the wrong reason is worse than no test. How to tell the difference.' where title = 'Tests that fail for the right reason.';
update public.lessons set summary = 'Concurrency: Waiting Without Blocking', summary = 'Concurrency: doing more than one thing while you wait.' where title = 'Concurrency: doing more than one thing while you wait.';
update public.lessons set summary = 'Packaging So Others Can Run It', summary = 'Packaging so other people can run it.' where title = 'Packaging so other people can run it.';
update public.lessons set summary = 'Understanding What Users Mean', summary = 'What users mean when they describe a problem.' where title = 'What users mean when they describe a problem.';
update public.lessons set summary = 'Documenting Your Work', summary = 'Writing down what you did, so the next person starts further along.' where title = 'Writing down what you did, so the next person starts further along.';

-- A course with nothing in it.
--
-- "Intro to Web APIs (in progress)" had no modules and no lessons, so opening it showed an
-- empty curriculum and a course the catalogue advertised. Nothing can be enrolled into it,
-- no quiz can hang off it and no certificate can come from it. Removed rather than left as
-- a shell: an empty course on a catalogue page is a dead end in a live demo.
delete from public.course_requirements where course_id = '509bf7de-9f31-47e2-916b-864f8586b81c';
delete from public.enrollments where course_id = '509bf7de-9f31-47e2-916b-864f8586b81c';
delete from public.courses where id = '509bf7de-9f31-47e2-916b-864f8586b81c' and not exists (select 1 from public.modules where course_id = '509bf7de-9f31-47e2-916b-864f8586b81c');