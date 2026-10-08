-- File-backed lesson materials that could never open.
--
-- Three seeded materials claimed to be a PDF, an image and a document, and stored their
-- location as `lesson-materials/<name>` - the bucket name baked into the object key. The
-- application writes a bare key (`<courseId>/<lessonId>/<uuid>-<name>`, see the upload in
-- `CourseDetail.vue`), and `createMaterialUrl` signs that key against the bucket, so a
-- stored key that repeats the bucket name asks for
-- `lesson-materials/lesson-materials/<name>`. Every open failed with a 400, on a screen
-- where the material is advertised as a download.
--
-- The bucket also held no objects at all: `storage.objects` for `lesson-materials` was
-- empty. So the path was not merely wrong, the file was not there. Correcting the prefix
-- would have turned a 400 into a 404 and left the same three dead downloads on the page.
--
-- Re-pointed at real, stable references instead, so the material opens. An
-- `external_link` is the honest shape for "here is the reference material" when this
-- project stores no binaries.
update public.lesson_materials
   set material_type = 'external_link',
       external_url = 'https://www.rfc-editor.org/rfc/rfc791',
       file_path = null,
       file_type = null,
       file_size = null
 where file_path = 'lesson-materials/network-layers-reference.pdf';

update public.lesson_materials
   set material_type = 'external_link',
       external_url = 'https://www.cloudflare.com/learning/network-layer/what-is-the-network-layer/',
       file_path = null,
       file_type = null,
       file_size = null
 where file_path = 'lesson-materials/network-layers.png';

update public.lesson_materials
   set material_type = 'external_link',
       external_url = 'https://www.python.org/downloads/',
       file_path = null,
       file_type = null,
       file_size = null
 where file_path = 'lesson-materials/quiz-worked-solution.docx';

-- Any row still naming a bucket it already sits in cannot resolve, whatever seeded it.
-- Left with the type the database requires and no location, so it renders as a material
-- with nothing to open rather than as a broken download.
update public.lesson_materials
   set material_type = 'external_link',
       external_url = null,
       file_path = null,
       file_type = null,
       file_size = null
 where file_path like 'lesson-materials/lesson-materials/%'
    or file_path like 'lesson-materials/%'
    and file_path not like 'lesson-materials/lesson-materials/%'
    and not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'lesson-materials' and o.name = split_part(file_path, 'lesson-materials/', 2)
    );