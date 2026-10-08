import { supabase } from './supabase/client'
import { humanizeError } from './errors'
import type { Database } from './supabase/types'
import type { Profile, ProfileRow } from '@/types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

/**
 * Every Supabase query the application makes about people lives here.
 *
 * Views and stores call these functions and never import the Supabase client.
 * That boundary is what keeps `.select()` shapes and response types in one
 * place, so a schema change is a one-file edit rather than a hunt.
 */

/** One list of columns, so a schema change is a one-line edit in this file. */
const PROFILE_COLUMNS =
  'id, role, full_name, email, avatar_url, phone, bio, status, email_code_sign_in, created_at, updated_at'

/**
 * A failure the person reading it can act on.
 *
 * Storage rejects an upload with its own wording ("new row violates row-level
 * security policy"), and Postgres writes into `profiles` raise plain sentences.
 * Both are the useful part of the response, so they pass through instead of
 * being flattened into "Something went wrong". See `messageOf`.
 */
export class ProfileError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ProfileError'
  }
}

/**
 * Postgres and Storage error text, made presentable.
 *
 * The same narrow strip the other services use: a leading `ERROR: ` and a
 * five-character SQLSTATE, nothing else. A broader pattern also ate the first
 * colon of a timestamp, which cost the explanation along with the prefix.
 */
function messageOf(error: { message: string } | null, fallback: string): string {
  return humanizeError(error?.message ?? '', fallback)
}

/** Row Level Security decides visibility. This throws only on transport errors. */
function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    bio: row.bio,
    status: row.status,
    emailCodeSignIn: row.email_code_sign_in,
  }
}

export async function fetchProfileByUserId(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new ProfileError(messageOf(error, 'Could not load that profile.'))
  return data ? toProfile(data as ProfileRow) : null
}

/**
 * Update the signed-in user's own profile.
 *
 * The `role` and `status` columns are absent from the payload on purpose. RLS
 * cannot restrict a single column, so a database trigger rejects the write if a
 * non-admin attempts it. Omitting them here means a bug in this function cannot
 * become a privilege-escalation bug.
 *
 * `email` is absent for a second reason. It mirrors `auth.users.email`, there is
 * no trigger keeping the two in step, and `authenticated` has no grant on
 * `auth.users` â€” so a direct write here would leave the profile claiming an
 * address the person cannot sign in with. There is deliberately no way to write
 * it from here.
 */
export async function updateOwnProfile(
  userId: string,
  changes: {
    fullName?: string
    phone?: string | null
    bio?: string | null
    avatarUrl?: string | null
  },
): Promise<Profile> {
  // Typed as the table's Update shape rather than a loose record, so adding a
  // column to `profiles` surfaces as a type error here instead of at runtime.
  const payload: ProfileUpdate = {}
  if (changes.fullName !== undefined) payload.full_name = changes.fullName
  if (changes.phone !== undefined) payload.phone = changes.phone
  if (changes.bio !== undefined) payload.bio = changes.bio
  if (changes.avatarUrl !== undefined) payload.avatar_url = changes.avatarUrl

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) throw new ProfileError(messageOf(error, 'Could not save your profile.'))
  return toProfile(data as ProfileRow)
}

/**
 * Turn the emailed sign-in code on or off for the signed-in person.
 *
 * Separate from `updateOwnProfile` on purpose. That function takes a bag of optional
 * fields and writes whichever are present, which is right for a profile form and wrong
 * here: this one value is a security decision, and folding it into a general save would
 * let a form that did not mean to change it do so by omitting the key. It also gives the
 * setting its own round trip, so a failed write leaves the switch showing what the
 * database actually holds rather than what was hoped for.
 *
 * The row is re-read rather than assumed. A toggle that says "on" while the value is
 * still off is the exact failure this avoids.
 */
export async function setOwnEmailCodeSignIn(userId: string, enabled: boolean): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ email_code_sign_in: enabled })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) {
    throw new ProfileError(
      messageOf(
        error,
        enabled
          ? 'Could not turn on the sign-in code. Try again in a moment.'
          : 'Could not turn off the sign-in code. Try again in a moment.',
      ),
    )
  }
  return toProfile(data as ProfileRow)
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

/**
 * The public bucket, already in the schema with a policy for every operation a
 * person needs: they may read it, upload their own, and replace their own.
 *
 * What the bucket does *not* have is a `file_size_limit` or an
 * `allowed_mime_types` list. Both columns are null, so nothing server-side
 * turns away a 40 MB TIFF and nothing forbids `text/html`. That is the reason
 * the checks below are not merely belt-and-braces: they are the only gate.
 */
export const AVATAR_BUCKET = 'avatars'

/**
 * 2 MB. Square enough for a phone portrait, small enough that a public bucket
 * never holds a 12 MP raw file nobody can see at 96 CSS pixels anyway.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** What the picker offers and what is accepted. */
export const AVATAR_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type AvatarMimeType = (typeof AVATAR_ACCEPTED_MIME_TYPES)[number]

const EXTENSION_BY_MIME: Record<AvatarMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Human units for the size rule, so the sentence cannot drift from the cap. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const mb = bytes / (1024 * 1024)
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
}

/**
 * Where this person's image lives: `<user id>/avatar.<ext>`.
 *
 * The leading folder is not a naming preference, it is the access control. The
 * `avatars` policies read `course_id_from_object_name(name)`, which returns the
 * *first* path segment cast to uuid, and compare it to `auth.uid()`. An object
 * at any other path is refused for everybody, and an object outside a folder
 * named after a uuid is refused for everybody including its owner. So a flat
 * `avatar.png` is not merely untidy: it cannot be uploaded at all.
 *
 * The file name itself is fixed rather than suffixed with a random id, so
 * replacing a photo overwrites the previous object instead of leaving one
 * orphaned per upload. `upsert: true` needs the UPDATE policy, which is scoped
 * the same way, so a user still cannot write over anybody else's file.
 */
export function avatarObjectKey(userId: string, file: File): string {
  const extension = EXTENSION_BY_MIME[file.type as AvatarMimeType] ?? 'bin'
  return `${userId}/avatar.${extension}`
}

/**
 * Reject an unusable file, with the sentence to show beside the picker.
 *
 * Returns null when the file is fine. Both refusals name the rule and the way
 * out, because a person who chose the wrong file is not helped by "invalid
 * file".
 */
export function checkAvatarFile(file: File): ProfileError | null {
  if (!AVATAR_ACCEPTED_MIME_TYPES.includes(file.type as AvatarMimeType)) {
    const named = file.type ? ` (${file.type})` : ''
    return new ProfileError(`That is not an image${named}. Choose a JPEG, PNG, WebP or GIF file.`)
  }

  if (file.size === 0) {
    return new ProfileError('That file is empty, so there is nothing to upload.')
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return new ProfileError(
      `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(AVATAR_MAX_BYTES)}.`,
    )
  }

  return null
}

/**
 * Put an image in the bucket and return the public URL to save on the profile.
 *
 * Two things this deliberately does not do.
 *
 * It does not save the profile. The upload succeeds and the column write is a
 * separate call the view makes, because the two fail for different reasons and
 * a person needs to be told which one did. A failed column write is safe to
 * retry: the key is deterministic, so the upload overwrites itself.
 *
 * It does not crop or resize. That is work for a canvas and a worker, and until
 * one exists the stored file is exactly what the person chose. The bucket serves
 * it under `Content-Type` from the upload, and the avatar is rendered inside a
 * fixed circle with `object-cover`, so a portrait shows as a crop rather than a
 * squashed face.
 */
export async function uploadOwnAvatar(userId: string, file: File): Promise<string> {
  const rejection = checkAvatarFile(file)
  if (rejection) throw rejection

  const key = avatarObjectKey(userId, file)
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(key, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  })

  if (error) {
    throw new ProfileError(`The photo did not upload: ${messageOf(error, 'unknown reason')}`, error)
  }

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(key).data.publicUrl
}

/**
 * Drop the reference to the photo, which returns the person to their initials.
 *
 * The object itself is left in the bucket. There is no DELETE policy on
 * `avatars` for anybody â€” not even an administrator â€” so a delete would be
 * refused, and calling one and ignoring the refusal is exactly the silent
 * no-op this file refuses to do. What a person sees is the column that decides
 * whether their face renders, and that is cleared here; the bytes become
 * unreachable the moment the URL is no longer published anywhere.
 */
export async function removeOwnAvatar(userId: string): Promise<Profile> {
  return updateOwnProfile(userId, { avatarUrl: null })
}
