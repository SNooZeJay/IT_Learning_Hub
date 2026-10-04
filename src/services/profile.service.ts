import { supabase } from './supabase/client'
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
  }
}

export async function fetchProfileByUserId(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, email, avatar_url, phone, bio, status, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toProfile(data as ProfileRow) : null
}

/**
 * Update the signed-in user's own profile.
 *
 * The `role` and `status` columns are absent from the payload on purpose. RLS
 * cannot restrict a single column, so a database trigger rejects the write if a
 * non-admin attempts it. Omitting them here means a bug in this function cannot
 * become a privilege-escalation bug.
 */
export async function updateOwnProfile(
  userId: string,
  changes: { fullName?: string; phone?: string | null; bio?: string | null; avatarUrl?: string | null },
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
    .select('id, role, full_name, email, avatar_url, phone, bio, status, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return toProfile(data as ProfileRow)
}