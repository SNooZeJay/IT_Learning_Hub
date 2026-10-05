import { supabase } from './supabase/client'

/**
 * Signed, expiring URLs for lesson-material files.
 *
 * Why this file exists
 * --------------------
 * The lesson-materials bucket is private, and `lesson_materials.file_path` stores an
 * *object key*, not a URL. Those are different things and conflating them breaks the
 * download: the outline rendered `href="<file_path>"`, so clicking Download asked the
 * SPA host for something like `<course-id>/<lesson-id>/report.pdf`. The SPA rewrite
 * answered 200 with `index.html`, so the learner navigated away from the lesson to a
 * page that was not the file. The comment beside that anchor claimed the link "is a
 * signed request through the storage API", which was not true of the code at the time.
 *
 * A private bucket is the correct design here - these are course files and the read
 * policy is `is_enrolled_in(course_id_from_object_name(name))`, so access follows
 * enrolment. Signing is what turns a stored key into something a browser can fetch
 * while keeping that policy in force: the signature is minted only for a caller the
 * policy already admitted, and it expires.
 */

const MATERIAL_BUCKET = 'lesson-materials'

/** How long a generated link stays valid. Long enough to click, short enough to matter. */
const SIGNED_URL_TTL_SECONDS = 60 * 10

export type MaterialUrlState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'unavailable'; message: string }

/**
 * A signed URL for one material file.
 *
 * Returns a discriminated result rather than a string so the caller can tell three
 * states apart: still loading, ready, and refused. Refusal is a real outcome, not an
 * edge case - a learner who has lost access to the course, or an object key left
 * behind by a deleted lesson, both land here, and both deserve an honest message
 * rather than a link that goes nowhere.
 */
export async function createMaterialUrl(filePath: string): Promise<MaterialUrlState> {
  // An object key is a relative path. Anything absolute or protocol-relative is not
  // one, and passing it to the storage client would ask the host for an arbitrary URL.
  if (!filePath || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(filePath)) {
    return {
      status: 'unavailable',
      message: 'This file has no usable location recorded.',
    }
  }

  const { data, error } = await supabase.storage
    .from(MATERIAL_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

  if (error) {
    // Supabase refuses a sign request when the caller's SELECT policy does not admit
    // the object, so this message is the boundary working rather than a fault.
    return {
      status: 'unavailable',
      message:
        'This file cannot be opened. It may belong to a course you no longer have access to.',
    }
  }

  if (!data?.signedUrl) {
    return { status: 'unavailable', message: 'This file cannot be opened right now.' }
  }

  return { status: 'ready', url: data.signedUrl }
}

/** The filename to show, from the stored key's last segment. */
export function materialFileName(filePath: string | null, fallback: string): string {
  if (!filePath) return fallback
  const last = filePath.split('/').pop()
  // Uploads are stored as `<uuid>-<original name>`; the uuid is not part of the name
  // the instructor recognises, so it is stripped for display only.
  const withoutId = last?.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/,
    '',
  )
  return withoutId || fallback
}
