import { supabase } from './supabase/client'
import { humanizeError } from './errors'

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
    // Membership of a conversation is enforced by a database policy, and this is the
    // one screen where somebody reaches a conversation they are not part of on purpose
    // - by opening a stale link, or a conversation somebody else was removed from. The
    // generic translation would be "You do not have access to that", which is true of
    // the LMS and useless about this page. Said in terms of the conversation instead.
    if (raw.includes('row-level security')) {
      return 'That conversation is not one you can take part in.'
    }
  }
  return humanizeError(error, fallback)
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
 * One RPC, `messageable_people()`: a student's instructors, an instructor's students, each
 * restricted to enrolments that grant access, with the course the relationship comes from
 * so the picker is a list of people you have a reason to write to rather than strangers.
 *
 * This used to be built in the browser, from
 * `enrollments -> courses -> course_instructors -> profiles`. It returned nothing, always,
 * for a student - and the composer said "Finding people" until you navigated away.
 *
 * `profiles select` is `can_view_profile(id)`, which permits three things: your own
 * profile, an administrator's, and - in one direction only - an instructor seeing their own
 * students. There is no clause for a student seeing an instructor, so the innermost join
 * matched no rows and every enrolment row went with it.
 *
 * The fix is deliberately not to widen `can_view_profile`. That would expose every column
 * of every instructor's profile to every signed-in student, which is far more than a
 * picker needs in order to show a name. The RPC returns an id and a name and nothing else,
 * scoped by relationships the caller is already party to.
 *
 * Confirmed against the live database, as each real account:
 *
 *     Joren Lalamonan         1 recipient  Instructor Demo  (via Introduction to Programming,
 *                                                        Networking Fundamentals)
 *     Shan Lee Kian Garmino  1 recipient  Instructor Demo
 *     Justine Josh Guia      1 recipient  Instructor Demo
 *     Instructor Demo        3 recipients Joren, Justine, Shan Lee Kian
 */
export async function listMessageablePeople(): Promise<MessagePerson[]> {
  const { data, error } = await supabase.rpc('messageable_people')

  if (error) {
    throw new MessagingError(messageOf(error, 'Could not find the people you can message.'), error)
  }

  const rows = (data ?? []) as unknown as Array<{
    person_id: string
    person_name: string | null
    via: string | null
  }>

  // Collapsed by person: one instructor may teach two of your courses, and the picker
  // should list them once with both courses beside their name rather than twice.
  const byPerson = new Map<string, MessagePerson>()

  for (const row of rows) {
    const existing = byPerson.get(row.person_id)
    if (existing) {
      if (row.via && !existing.via.includes(row.via)) existing.via = `${existing.via}, ${row.via}`
    } else {
      byPerson.set(row.person_id, {
        id: row.person_id,
        // A name is the entire point of a recipient row. A nameless one renders as a blank
        // option, which is worse than no option at all.
        fullName: row.person_name ?? 'Unknown participant',
        via: row.via ?? '',
      })
    }
  }

  return [...byPerson.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
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
 * One RPC, `start_conversation()`, which creates the conversation and adds both
 * participants in a single statement.
 *
 * This used to be two inserts from here, and it had never worked - not once, for anybody.
 * The two policies involved deadlock each other:
 *
 *     conversations select  admits only participants
 *     participants insert   proves you created the conversation by *reading* that row
 *
 * So the creator could not read their own brand-new conversation, and the participant
 * insert was refused with a bare 42501 that read like a permissions problem. Step by step,
 * as a signed-in student:
 *
 *     insert into conversations (subject, created_by) values (...)      ok
 *     rows of it the creator can select                                0
 *     insert into conversation_participants (conversation_id, user_id) 42501
 *
 * The comment that stood here described "only the creator can add participants" as though
 * it were the intended design. It was the deadlock. The third instance of the same class
 * in this schema, after the `X = X` tautology and the `42P17` self-reference, and the
 * quietest of the three.
 *
 * The function is SECURITY DEFINER, which is the only way through: the creator has to
 * write a participant row for a conversation whose row the select policy will not show
 * them until that row exists. To stop that becoming "add any account to a conversation",
 * the function requires the recipient to be one the caller could already have written to -
 * their own instructor, or their own student.
 *
 * Atomic too, which the two inserts never were: a failure between them left a
 * conversation with one participant that nobody could open or repair.
 */
export async function startConversation(recipientId: string, subjectRaw: string): Promise<string> {
  const subject = normaliseSubject(subjectRaw)

  const { data, error } = await supabase.rpc('start_conversation', {
    p_recipient_id: recipientId,
    p_subject: subject,
  })

  if (error) {
    throw new MessagingError(messageOf(error, 'Could not start the conversation.'), error)
  }

  if (typeof data !== 'string' || data === '') {
    throw new MessagingError('Could not start the conversation.')
  }

  return data
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

  // The sender is whoever is signed in. Asking the database for it by reading
  // `profiles` looked equivalent and was not: `select('id').single()` requires
  // exactly one row, and RLS lets an instructor read every profile in their courses -
  // four of them, in this deployment. `.single()` therefore failed with PGRST116
  // "the result contains 4 rows", and the message was never attempted. A student,
  // who can see fewer profiles, got further, which is why it read as an intermittent
  // or account-specific fault rather than a broken query.
  //
  // The session is the authority on who is signed in, and the insert policy already
  // requires `sender_id = auth.uid()` regardless, so this asks for nothing the
  // database was going to disagree with.
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser()
  if (sessionError || !user) {
    throw new MessagingError(
      messageOf(sessionError, 'Could not read your account. Sign in again and retry.'),
      sessionError,
    )
  }

  const { error } = await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
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
