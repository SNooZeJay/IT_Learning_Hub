import { supabase } from './supabase/client'

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
  if (!error) return fallback
  return error.message.replace(/^(?:ERROR:\s*|[A-Z]{5}:\s*)/, '').trim() || fallback
}

const COLUMNS = 'id, course_id, author_id, title, body, published_at, created_at'

interface AnnouncementRow {
  id: string
  course_id: string | null
  author_id: string | null
  title: string
  body: string
  published_at: string | null
  created_at: string
}

/** `{ courses: { title } | null }` is PostgREST's shape for a nullable embedded relation. */
interface AnnouncementRowWithTitle extends AnnouncementRow {
  courses: { title: string } | null
  author: { full_name: string } | null
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
    .select(`${COLUMNS}, courses(title), author:profiles!announcements_author_id_fkey(full_name)`)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw new AnnouncementError(messageOf(error, 'Announcements could not be loaded.'))

  return ((data ?? []) as unknown as AnnouncementRowWithTitle[]).map(toAnnouncement)
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
    title: row.title,
    body: row.body,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    published: row.published_at !== null,
  }
}
