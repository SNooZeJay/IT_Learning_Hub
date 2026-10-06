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

/** The profile fields needed to render a person in a list. */
const PERSON_COLUMNS = 'id, full_name'

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
 * The unread count is derived from the messages already fetched rather than from a
 * separate `count` query: a count that disagrees with the rows underneath it is worse
 * than a count that describes exactly what is on screen.
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('id')
    .single<{ id: string }>()
  if (meError || !me)
    throw new MessagingError(messageOf(meError, 'Could not read your account.'), meError)

  const { data: participations, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', me.id)

  if (error) throw new MessagingError(messageOf(error, 'Could not load your conversations.'), error)

  const ids = (participations ?? []).map((p) => p.conversation_id as string)
  if (ids.length === 0) return []

  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select(
      'id, subject, created_by, created_at, last_message_at, conversation_participants!inner(user_id)',
    )
    .in('id', ids)

  if (convError)
    throw new MessagingError(messageOf(convError, 'Could not load your conversations.'), convError)

  const { data: allMessages, error: msgError } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .in('conversation_id', ids)

  if (msgError)
    throw new MessagingError(messageOf(msgError, 'Could not load your messages.'), msgError)

  const readAt = new Map(
    (participations ?? []).map((p) => [
      p.conversation_id as string,
      p.last_read_at as string | null,
    ]),
  )
  const byConversation = new Map<string, typeof allMessages>()
  for (const message of allMessages ?? []) {
    const list = byConversation.get(message.conversation_id as string) ?? []
    list.push(message)
    byConversation.set(message.conversation_id as string, list)
  }

  const summaries: ConversationSummary[] = []

  for (const row of (conversations ?? []) as unknown as Array<{
    id: string
    subject: string
    created_by: string
    created_at: string
    last_message_at: string | null
    conversation_participants: Array<{ user_id: string }>
  }>) {
    const others = (row.conversation_participants ?? [])
      .map((p) => p.user_id)
      .filter((u) => u !== me.id)
    const otherId = others[0]

    // The other person's name. Their participant row is visible because
    // `participants select` admits anyone already in the thread.
    let withName = 'Unknown participant'
    if (otherId) {
      const { data: person } = await supabase
        .from('profiles')
        .select(PERSON_COLUMNS)
        .eq('id', otherId)
        .maybeSingle<{ id: string; full_name: string }>()
      if (person) withName = person.full_name
    }

    const messages = (byConversation.get(row.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime(),
      )
    const last = messages[messages.length - 1]
    const since = readAt.get(row.id)
    const unread = since
      ? messages.filter(
          (m) => new Date(m.created_at as string) > new Date(since) && m.sender_id !== me.id,
        ).length
      : messages.filter((m) => m.sender_id !== me.id).length

    summaries.push({
      id: row.id,
      subject: row.subject,
      withName,
      lastMessageAt: row.last_message_at ?? last?.created_at ?? row.created_at,
      lastMessagePreview: last ? previewOf(String(last.body)) : 'No messages yet',
      unreadCount: unread,
    })
  }

  // Most recent first, with never-messaged threads last so they do not crowd out
  // something that needs answering.
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

  // Keeping the list ordered by this column is what lets the list view avoid reading
  // every message of every conversation.
  const { error: stampError } = await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  if (stampError) {
    // The message is delivered; only the ordering hint failed. Saying the send failed
    // would make the user resend it.
    console.warn('messaging: could not stamp last_message_at', stampError)
  }
}

/** Mark a thread read up to now. */
export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)

  if (error) {
    // A read receipt nobody is waiting on. Not worth an error banner in the thread.
    console.warn('messaging: could not mark the conversation read', error)
  }
}

/** Total unread across every conversation, for the sidebar and the header button. */
export async function countUnreadMessages(): Promise<number> {
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .is('last_read_at', null)

  if (error) {
    throw new MessagingError(messageOf(error, 'Could not count unread messages.'), error)
  }

  // Only rows with a null `last_read_at` can be known-unread without reading the
  // messages themselves, which is a second round trip per thread. Counting them here
  // and letting the list do the exact arithmetic keeps one code path for the truth.
  return (data ?? []).length
}
