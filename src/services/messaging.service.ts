import { supabase } from './supabase/client'

/**
 * Conversations between people who already share a course.
 *
 * What the schema allows, and what this file is built around
 * ---------------------------------------------------------
 * Three tables, and the permissions between them are the whole design:
 *
 *   conversations             one thread, its subject, who opened it
 *   conversation_participants who is in it, and how far each has read
 *   conversation_messages     the messages, each naming its sender
 *
 * Two consequences shape everything below, and neither is a limitation to work
 * around so much as the feature:
 *
 * 1. **Only a thread's creator can add participants.** There is no invite step, so a
 *    conversation is always exactly two people: the person who started it and the
 *    person they started it with. That is a direct consequence of the requirement that
 *    messaging follows role and course relationships rather than being a free-for-all
 *    user directory.
 *
 * 2. **A thread is invisible to anyone who is not in it.** There is no query that
 *    lists "everyone I could possibly message", because the database will not produce
 *    one and no such RPC exists. So `listMessageablePeople` builds the recipient list
 *    from the relationships that genuinely exist - the instructors of the courses a
 *    student is enrolled in, and the students enrolled in the courses an instructor
 *    teaches. There is no search-a-directory and no way to invent a recipient.
 *
 * Notifications are a separate system and this file does not touch them. A message may
 * one day produce a notification, and a notification must never become a message.
 */

/**
 * The longest a message may be.
 *
 * Matches the database's `length(btrim(body)) > 0` in the useful direction: this is
 * the upper bound the interface enforces so somebody is told before the database
 * refuses, rather than after.
 */
export const MESSAGE_MAX_LENGTH = 4000

export class MessagingError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'MessagingError'
  }
}

function messageOf(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const raw = String((error as { message: unknown }).message ?? '')
    // Supabase's wording for a policy refusal is accurate but technical. It is the
    // one most likely to be seen here, because membership is enforced by policy.
    if (raw.includes('row-level security')) {
      return 'That conversation is not one you can take part in.'
    }
    if (raw) return raw
  }
  return fallback
}

export interface MessagePerson {
  id: string
  fullName: string
  /** Why this person is reachable, so the picker is not a list of strangers. */
  via: string
}

export interface ConversationSummary {
  id: string
  subject: string
  /** The other participant. Never the signed-in user. */
  withName: string
  lastMessageAt: string
  lastMessagePreview: string
  unreadCount: number
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
}

/**
 * Validate a message body.
 *
 * Returns the trimmed text to send, or throws. Exported so the composer and the tests
 * agree on the rule rather than each restating it.
 */
export function normaliseMessageBody(raw: string): string {
  const body = raw.trim()
  if (!body) {
    throw new MessagingError('A message cannot be empty.')
  }
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new MessagingError(`A message can be at most ${MESSAGE_MAX_LENGTH} characters.`)
  }
  return body
}

/** Validate a subject the same way. */
export function normaliseSubject(raw: string): string {
  const subject = raw.trim()
  if (!subject) {
    throw new MessagingError('Give the conversation a subject so it is recognisable in the list.')
  }
  if (subject.length > 120) {
    throw new MessagingError('A subject can be at most 120 characters.')
  }
  return subject
}

/**
 * Everyone the signed-in user could start a conversation with.
 *
 * Derived from real teaching relationships rather than a directory:
 *
 * - a student's instructors: the instructors of the courses they are enrolled in
 * - an instructor's students: the students enrolled in the courses they teach
 * - an admin: nobody, and the UI says so rather than offering an empty picker
 *
 * `profiles` is readable by an admin for all, by a user for themselves, and - per the
 * policies written for this project - for anyone sharing a course. The joins below
 * therefore stay inside a relationship the database already agrees with, rather than
 * trying to read the whole table.
 */
export async function listMessageablePeople(): Promise<MessagePerson[]> {
  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id, role')
    .single<{ id: string; role: string }>()

  if (meError || !me) {
    throw new MessagingError(messageOf(meError, 'Could not read your account.'), meError)
  }

  const people = new Map<string, MessagePerson>()

  if (me.role === 'student') {
    // The instructors of my courses. `course_instructors` and `enrollments` are both
    // readable by the participants, so this join is inside what RLS already allows.
    const { data, error } = await supabase
      .from('enrollments')
      .select('courses!inner(id, title, course_instructors!inner(profiles!inner(id, full_name)))')
      .eq('student_id', me.id)
      .eq('status', 'active')

    if (error) throw new MessagingError(messageOf(error, 'Could not find your instructors.'), error)

    for (const row of (data ?? []) as unknown as Array<{
      courses: {
        title: string
        course_instructors: Array<{ profiles: { id: string; full_name: string } }>
      } | null
    }>) {
      const course = row.courses
      if (!course) continue
      for (const link of course.course_instructors ?? []) {
        const person = link.profiles
        if (!person || person.id === me.id) continue
        const existing = people.get(person.id)
        // One entry per person, listing every course that makes them reachable.
        if (existing) {
          if (!existing.via.includes(course.title))
            existing.via = `${existing.via}, ${course.title}`
        } else {
          people.set(person.id, { id: person.id, fullName: person.full_name, via: course.title })
        }
      }
    }
  }

  if (me.role === 'instructor') {
    const { data, error } = await supabase
      .from('course_instructors')
      .select(
        'courses!inner(id, title, enrollments!inner(student_id, profiles!inner(id, full_name)))',
      )
      .eq('instructor_id', me.id)

    if (error) throw new MessagingError(messageOf(error, 'Could not find your students.'), error)

    for (const row of (data ?? []) as unknown as Array<{
      courses: {
        title: string
        enrollments: Array<{ profiles: { id: string; full_name: string } | null }>
      } | null
    }>) {
      const course = row.courses
      if (!course) continue
      for (const enrol of course.enrollments ?? []) {
        const person = enrol.profiles
        if (!person || person.id === me.id) continue
        const existing = people.get(person.id)
        if (existing) {
          if (!existing.via.includes(course.title))
            existing.via = `${existing.via}, ${course.title}`
        } else {
          people.set(person.id, { id: person.id, fullName: person.full_name, via: course.title })
        }
      }
    }
  }

  return [...people.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
}

/**
 * Every conversation the signed-in user is a participant in.
 *
 * One round trip. `conversation_inbox()` returns the subject, the other participant, the
 * last message's body and the unread count per conversation, so the list and the badge
 * are computed by the same statement and cannot disagree.
 *
 * That matters because the previous version did not. It read every message of every
 * conversation to build previews and count unread ones, then read the other participant's
 * profile row one conversation at a time - an N+1 on top of an unbounded fetch. It also
 * contradicted its own comment two functions down, which claimed the list avoided reading
 * every message of every conversation.
 *
 * Never-messaged conversations sort last, so a thread awaiting a first reply does not
 * push a thread that needs answering off the top.
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('conversation_inbox')

  if (error) {
    throw new MessagingError(messageOf(error, 'Could not load your conversations.'), error)
  }

  const summaries = (
    (data ?? []) as unknown as Array<{
      id: string
      subject: string
      with_id: string | null
      with_name: string | null
      last_message_at: string
      last_message_preview: string | null
      unread_count: number | string | null
    }>
  ).map((row) => ({
    id: row.id,
    subject: row.subject,
    // Named by the person rather than by their id: this string is the row's heading, and
    // an id would be a worse label than no label at all.
    withName: row.with_name ?? 'Unknown participant',
    lastMessageAt: row.last_message_at,
    lastMessagePreview:
      row.last_message_preview === null || row.last_message_preview === undefined
        ? 'No messages yet'
        : previewOf(String(row.last_message_preview)),
    // The database returns bigint as a string over PostgREST, so this is not a cast
    // that can be forgotten about: a count arriving as "2" would render as a
    // concatenation rather than a number.
    unreadCount: Number(row.unread_count ?? 0),
  }))

  return summaries.sort((a, b) => {
    const aEmpty = a.lastMessagePreview === 'No messages yet'
    const bEmpty = b.lastMessagePreview === 'No messages yet'
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })
}

/** The first line or so of a body, for a list row. */
export function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= 90) return flat
  return `${flat.slice(0, 89)}…`
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw new MessagingError(messageOf(error, 'Could not load this conversation.'), error)

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: String(row.created_at),
  }))
}

/**
 * Start a conversation with one person.
 *
 * Two inserts and no transaction, which is a real limitation and is handled rather than
 * hidden: if the second insert fails there is a thread with one participant, and the
 * list below treats a one-participant thread as a conversation you can still post into
 * rather than an error. The creator's own participant row is written first, so the
 * thread is at least readable by the person who made it.
 *
 * An RPC would make this atomic. That is a schema change and this file does not make
 * one.
 */
export async function startConversation(recipientId: string, subjectRaw: string): Promise<string> {
  const subject = normaliseSubject(subjectRaw)

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id')
    .single<{ id: string }>()
  if (meError || !me)
    throw new MessagingError(messageOf(meError, 'Could not read your account.'), meError)

  if (recipientId === me.id) {
    throw new MessagingError('You cannot start a conversation with yourself.')
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ subject, created_by: me.id })
    .select('id')
    .single<{ id: string }>()

  if (createError || !created) {
    throw new MessagingError(
      messageOf(createError, 'Could not start the conversation.'),
      createError,
    )
  }

  const { error: participantError } = await supabase.from('conversation_participants').insert([
    { conversation_id: created.id, user_id: me.id },
    { conversation_id: created.id, user_id: recipientId },
  ])

  if (participantError) {
    throw new MessagingError(
      messageOf(
        participantError,
        'The conversation was created but the other person could not be added.',
      ),
      participantError,
    )
  }

  return created.id
}

/**
 * Post a message.
 *
 * `sender_id` is always the signed-in user and `conversation_id` always the thread being
 * read, never anything passed in from the caller, so there is no path by which a message
 * can appear to come from somebody else.
 */
export async function sendMessage(conversationId: string, bodyRaw: string): Promise<void> {
  const body = normaliseMessageBody(bodyRaw)

  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id')
    .single<{ id: string }>()
  if (meError || !me)
    throw new MessagingError(messageOf(meError, 'Could not read your account.'), meError)

  const { error } = await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_id: me.id,
    body,
  })

  if (error) throw new MessagingError(messageOf(error, 'That message could not be sent.'), error)

  // No client write of `last_message_at`. A trigger on the message insert stamps the
  // conversation with the message's own `created_at`, so the two cannot disagree.
  //
  // It used to be written here from the browser clock, against a `created_at` the
  // database wrote from the server's. That disagreement reordered the inbox whenever a
  // student's clock was off, and it could not be seen: a wrongly ordered list looks like a
  // list. It was also a second write that could half fail, leaving the message stored and
  // the conversation ordered by an older time.
}

/**
 * Mark a thread read up to now, using the database's clock.
 *
 * An RPC rather than an UPDATE so that `now()` is the server's. `last_read_at` is compared
 * against `created_at` by `conversation_inbox`, and `created_at` is server-written, so a
 * client-written `last_read_at` compares a browser clock against a server one. A clock a
 * minute behind marks unseen messages as read; a clock ahead hides them. Neither is
 * detectable, and both present as a wrong number rather than as a wrong clock.
 *
 * SECURITY INVOKER on the server side, so the existing `conversation_participants` update
 * policy still decides whose row this may touch.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  })

  if (error) {
    // A read receipt nobody is waiting on. Not worth an error banner in the thread.
    console.warn('messaging: could not mark the conversation read', error)
  }
}

/**
 * Total unread across every conversation, for the sidebar and the header button.
 *
 * Unread *messages*, not unopened conversations. The previous version counted
 * participant rows with a null `last_read_at`, which is a different question with two
 * wrong answers: a thread stopped counting the moment it was opened once, so replies
 * arriving later never moved the badge, and a brand-new conversation with no messages
 * counted as one unread and could not be cleared.
 *
 * Measured on a three-message thread after the fix, as the participants:
 *
 *     sender of 1 of them, both unread      threads=1 unread=2
 *     sender of 2 of them, both unread      threads=1 unread=1
 *     not a participant                     threads=0 unread=0
 *     after marking read                    threads=1 unread=0
 *     one more message arrives              threads=1 unread=1
 *
 * Shares `conversation_inbox()` with `listConversations` on purpose: the badge and the
 * list are two renderings of one query, so they cannot report different numbers.
 */
export async function countUnreadMessages(): Promise<number> {
  const { data, error } = await supabase.rpc('conversation_inbox')

  if (error) {
    throw new MessagingError(messageOf(error, 'Could not count unread messages.'), error)
  }

  const rows = (data ?? []) as unknown as Array<{ unread_count: number | string | null }>

  // Summed from the same rows the inbox renders, and Number()d because PostgREST returns
  // bigint as a string: adding strings here would concatenate "1" and "2" into "12".
  return rows.reduce((total, row) => total + Number(row.unread_count ?? 0), 0)
}
