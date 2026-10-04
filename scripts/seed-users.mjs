#!/usr/bin/env node
/**
 * Create the demo accounts for the IT Learning Hub LMS.
 *
 * Credentials are NOT in this file. They live in `scripts/seed-users.local.json`,
 * which is gitignored, so nothing sensitive reaches the repository.
 *
 * Why the service-role key is required: creating an auth user is an admin-only
 * operation that the anon key cannot perform by design. The key stays in a
 * local file and is never committed, never bundled, and never sent to a browser.
 *
 * Usage:
 *   1. copy scripts/seed-users.local.example.json -> scripts/seed-users.local.json
 *   2. fill in SUPABASE_SERVICE_ROLE_KEY and the accounts
 *   3. node scripts/seed-users.mjs
 *
 * Idempotent: re-running updates nothing and skips users that already exist.
 */

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const CONFIG_PATH = new URL('./seed-users.local.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

if (!existsSync(CONFIG_PATH)) {
  console.error(
    'Missing scripts/seed-users.local.json\n\n' +
      'Copy scripts/seed-users.local.example.json and fill it in.\n' +
      'That file is gitignored and must never be committed.',
  )
  process.exit(1)
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
const url = config.supabaseUrl
const serviceKey = config.serviceRoleKey

/**
 * A publishable key is safe but powerless; using it here would create accounts
 * that mysteriously fail. Better to say exactly what is wrong up front.
 */
function assertServiceRoleKey(key) {
  if (!key) throw new Error('serviceRoleKey is missing from seed-users.local.json')
  if (typeof key === 'string' && key.startsWith('sb_publishable_')) {
    throw new Error(
      'That is a PUBLISHABLE key, not a service-role key.\n' +
        'Supabase Dashboard -> Project Settings -> API Keys -> Secret keys.',
    )
  }
}

async function findUserByEmail(client, email) {
  // admin.listUsers is paginated; walk it rather than assuming one page.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function main() {
  assertServiceRoleKey(serviceKey)

  const accounts = config.accounts
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('No accounts found in seed-users.local.json')
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const created = []
  const existing = []
  const promoted = []

  for (const account of accounts) {
    const { email, password, fullName, role } = account

    if (!email || !password || !fullName || !role) {
      throw new Error(`Incomplete account entry: ${JSON.stringify({ email, role })}`)
    }
    if (!['admin', 'instructor', 'student'].includes(role)) {
      throw new Error(`Unknown role "${role}" for ${email}`)
    }
    if (String(password).length < 8) {
      throw new Error(`Password for ${email} is shorter than 8 characters`)
    }

    let user = await findUserByEmail(client, email)

    if (user) {
      existing.push(email)
    } else {
      const { data, error } = await client.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // no confirmation round trip for demo accounts
        user_metadata: { full_name: fullName },
      })
      if (error) throw new Error(`${email}: ${error.message}`)
      user = data.user
      created.push(email)
    }

    // The handle_new_user trigger creates the profile as 'student'. Promotion
    // goes through set_user_role, which is the only path the guard permits
    // without a signed-in administrator. See migration 0002.
    if (role !== 'student') {
      const { error: rpcError } = await client.rpc('set_user_role', {
        target_id: user.id,
        new_role: role,
      })
      if (rpcError) throw new Error(`${email}: set_user_role failed - ${rpcError.message}`)
      promoted.push(`${email} -> ${role}`)
    }
  }

  console.log('\nSeed complete.\n')
  if (created.length) console.log(`  created  (${created.length}): ${created.join(', ')}`)
  if (existing.length) console.log(`  existing (${existing.length}): ${existing.join(', ')}`)
  if (promoted.length) console.log(`  promoted (${promoted.length}): ${promoted.join(', ')}`)
  console.log('\nPasswords are never printed. They are in seed-users.local.json.\n')
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error.message}\n`)
  process.exit(1)
})