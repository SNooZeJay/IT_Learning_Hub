import { supabase } from './supabase/client'
import { humanizeError } from './errors'

/**
 * Platform and course announcements.
 *
 * Written by an administrator for everybody (`course_id` null) or by an instructor for the
 * courses they teach. The table and its Row Level Security policy already existed; nothing
 * ever wrote to it. `announcements` was readable and nothing was publishable, which is why
 * the three rows in the database were seeded by hand and could not be produced by a person
 * using the product.
 *
 * The write policy is `is_instructor_of(course_id) OR is_admin()`, so an instructor cannot
 * post to a course they do not teach and cannot post a platform-wide notice, and an
 * administrator can do both. That is enforced by the database, not by this file, which is
 * why `createAnnouncement` takes the caller's id rather than trusting a role from the
 * browser.
 */

export interface Announcement {
  id: string
  courseId: string | null
  courseTitle: string | null
  authorName: string
  authorRole: 'admin' | 'instructor' | 'student'
  kind: string
  title: string
  body: string
  publishedAt: string | null
  createdAt: string
  /** Drafts are visible only to their author and to administrators. */
  published: boolean
}

export class AnnouncementError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AnnouncementError'
  }
}

/**
 * Postgres wording with the noise stripped.
 *
 * The refusals worth keeping are plain sentences written by the policy - "only an
 * instructor or an administrator may post to this course" - so they pass through rather
 * than being flattened.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

const COLUMNS = 'id, course_id, author_id, kind, title, body, published_at, created_at'

interface AnnouncementRow {
  id: string
  course_id: string | null
  author_id: string | null
  kind: string | null
  title: string
  body: string
  published_at: string | null
  created_at: string
}

/** `{ courses: { title } | null }` is PostgREST's shape for a nullable embedded relation. */
interface AnnouncementRowWithTitle extends AnnouncementRow {
  courses: { title: string } | null
  author: { full_name: string; role: string } | null
}

/**
 * Every announcement the caller may read.
 *
 * Published notices first, then drafts, each group newest first. The order is in the
 * query rather than sorted here so the database does the work and the two lists cannot
 * disagree about what "newest" means.
 */
export async function listAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select(
      `${COLUMNS}, courses(title), author:profiles!announcements_author_id_fkey(full_name, role)`,
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw new AnnouncementError(messageOf(error, 'Announcements could not be loaded.'))

  return ((data ?? []) as unknown as AnnouncementRowWithTitle[]).map(toAnnouncement)
}

/**
 * What kind of notice this is.
 *
 * Stored as a column rather than guessed from the title. A reader scanning five notices
 * needs to tell "the site is down until noon" from "a new lesson is up" at a glance, and
 * inferring that from wording is exactly the kind of guess that gets it wrong on the one
 * notice that mattered.
 */
export type AnnouncementKind = 'maintenance' | 'course_update' | 'assignment' | 'general'

export const ANNOUNCEMENT_KINDS: ReadonlyArray<{ value: AnnouncementKind; label: string }> = [
  { value: 'general', label: 'General news' },
  { value: 'maintenance', label: 'Maintenance or closure' },
  { value: 'course_update', label: 'Course update' },
  { value: 'assignment', label: 'Assignment or quiz' },
]

/**
 * The notices one student may read.
 *
 * The read policy already draws the line: published notices for everybody, plus those for a
 * course this student holds a live place on, plus their own drafts. So this returns exactly
 * what the database considers theirs, and adds no filter of its own.
 *
 * `author:profiles!author_id_fkey` resolves the author, whose role is read from the same
 * row, so "posted by an instructor" is a fact about the author rather than a guess from
 * which screen they wrote it on.
 */
export interface StudentAnnouncement {
  id: string
  kind: AnnouncementKind
  courseId: string | null
  courseTitle: string | null
  courseSlug: string | null
  authorName: string
  authorRole: 'admin' | 'instructor' | 'staff'
  title: string
  body: string
  publishedAt: string
}

export async function listAnnouncementsForStudent(): Promise<StudentAnnouncement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, course_id, kind, title, body, published_at, courses(title, slug)')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  if (error) throw new AnnouncementError(messageOf(error, 'Announcements could not be loaded.'))

  const rows = (data ?? []) as unknown as Array<{
    id: string
    course_id: string | null
    kind: string | null
    title: string
    body: string
    published_at: string
    courses: { title: string; slug: string } | null
  }>

  // The byline is a second call, not an embedded join. `can_view_profile` does not let a
  // student read the instructor who wrote to them, so the join returns null and every
  // notice would read as posted by nobody - the one fact a notice cannot afford to miss.
  const bylines = await loadBylines(rows.map((row) => row.id))

  return rows.map((row) => {
    const byline = bylines.get(row.id)
    return {
      id: row.id,
      kind: (ANNOUNCEMENT_KINDS.some((k) => k.value === row.kind)
        ? row.kind
        : 'general') as AnnouncementKind,
      courseId: row.course_id,
      courseTitle: row.courses?.title ?? null,
      courseSlug: row.courses?.slug ?? null,
      authorName: byline?.authorName ?? 'IT Learning Hub',
      authorRole: byline?.authorRole ?? 'staff',
      title: row.title,
      body: row.body,
      publishedAt: row.published_at,
    }
  })
}

/**
 * Author name and role for a set of notices.
 *
 * One call for the whole list: a page of ten notices would otherwise be eleven round trips
 * to render one screen.
 *
 * A failure here does not fail the page. An unknown byline falls back to "IT Learning Hub",
 * which is less informative but still true, and losing the whole list over a byline would
 * be a poor trade.
 */
async function loadBylines(
  ids: string[],
): Promise<Map<string, { authorName: string; authorRole: StudentAnnouncement['authorRole'] }>> {
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase.rpc('announcement_byline', { p_announcement_ids: ids })
  if (error) return new Map()

  const bylines = new Map<
    string,
    { authorName: string; authorRole: StudentAnnouncement['authorRole'] }
  >()
  for (const row of (data ?? []) as Array<{
    id: string
    author_name: string
    author_role: string
  }>) {
    bylines.set(row.id, {
      authorName: row.author_name,
      authorRole:
        row.author_role === 'instructor'
          ? 'instructor'
          : row.author_role === 'admin'
            ? 'admin'
            : 'staff',
    })
  }
  return bylines
}

/**
 * Post an announcement.
 *
 * `courseId` null is a platform-wide notice, which only an administrator may post; the
 * policy refuses the attempt otherwise and the refusal reaches the caller as its own
 * sentence rather than as a generic failure.
 *
 * `publishNow` false leaves a draft. A draft is visible to its author and to
 * administrators, so "save and check it before everyone sees it" is a real step rather
 * than a fiction.
 */
export async function createAnnouncement(input: {
  authorId: string
  title: string
  body: string
  courseId?: string | null
  kind?: AnnouncementKind
  publishNow?: boolean
}): Promise<Announcement> {
  const title = input.title.trim()
  const body = input.body.trim()
  if (!title) throw new AnnouncementError('Give the notice a title.')
  if (!body) throw new AnnouncementError('Write what people need to know.')

  const publishNow = input.publishNow ?? true

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      course_id: input.courseId ?? null,
      author_id: input.authorId,
      title,
      body,
      kind: input.kind ?? 'general',
      published_at: publishNow ? new Date().toISOString() : null,
    })
    .select(`${COLUMNS}, courses(title), author:profiles!announcements_author_id_fkey(full_name)`)
    .single()

  if (error) {
    throw new AnnouncementError(messageOf(error, 'The notice was not posted. Try again.'))
  }
  return toAnnouncement(data as unknown as AnnouncementRowWithTitle)
}

/**
 * Publish a draft, or withdraw a published notice.
 *
 * One call for both because they are one decision - "is this visible" - and two separate
 * functions would let the two disagree about what a null `published_at` means. Withdrawing
 * sets the timestamp to null, which puts the row back in front of its author as a draft
 * rather than deleting it: an administrator who removes a notice by accident should be able
 * to put it back.
 */
export async function setAnnouncementPublished(
  announcementId: string,
  published: boolean,
): Promise<Announcement> {
  const { data, error } = await supabase
    .from('announcements')
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq('id', announcementId)
    .select(`${COLUMNS}, courses(title), author:profiles!announcements_author_id_fkey(full_name)`)
    .single()

  if (error) {
    throw new AnnouncementError(messageOf(error, 'That change was not saved. Try again.'))
  }
  return toAnnouncement(data as unknown as AnnouncementRowWithTitle)
}

/** Remove a notice outright. Used only from a confirmation dialog. */
export async function deleteAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', announcementId)
  if (error) throw new AnnouncementError(messageOf(error, 'The notice was not deleted.'))
}

function toAnnouncement(row: AnnouncementRowWithTitle): Announcement {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.courses?.title ?? null,
    authorName: row.author?.full_name ?? 'IT Learning Hub',
    authorRole:
      row.author?.role === 'instructor'
        ? 'instructor'
        : row.author?.role === 'admin'
          ? 'admin'
          : 'student',
    kind: row.kind ?? 'general',
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    published: row.published_at !== null,
  }
}
