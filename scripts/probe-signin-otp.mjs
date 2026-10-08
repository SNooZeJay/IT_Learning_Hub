import fs from 'node:fs'

/**
 * Probe the deployed signin-otp function the way the browser would.
 *
 * Reads the anon key from `.env` rather than taking it as an argument, so the key never
 * appears in a shell history or a transcript. Every token-shaped value in the response is
 * replaced before printing: the point of the probe is the SHAPE of the answer, not the
 * session.
 */
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1].trim()
const key = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)?.[1].trim()
if (!url || !key) throw new Error('VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY missing')

function redact(text) {
  return text
    .replace(/eyJ[A-Za-z0-9._-]{30,}/g, '<JWT>')
    .replace(/("(?:access|refresh)_token"\s*:\s*")[^"]+"/g, '$1<JWT>"')
}

async function post(payload) {
  const response = await fetch(`${url}/functions/v1/signin-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  return { status: response.status, body: text }
}

function shape(result) {
  let parsed
  try {
    parsed = JSON.parse(result.body)
  } catch {
    return `HTTP ${result.status} (non-JSON)`
  }
  const keys = Object.keys(parsed)
  const kind = parsed.session ? 'SESSION' : parsed.challenge_id ? 'CHALLENGE' : 'none'
  return `HTTP ${result.status} keys=[${keys.join(',')}] -> ${kind}`
}

const args = process.argv.slice(2)
const action = args[0] ?? 'help'

if (action === 'begin') {
  const [, email, password] = args
  console.log(shape(await post({ action: 'begin', email, password })))
} else if (action === 'verify') {
  const [, challengeId, code] = args
  console.log(shape(await post({ action: 'verify', challenge_id: challengeId, code })))
} else if (action === 'raw') {
  const [, payload] = args
  const result = await post(JSON.parse(payload))
  console.log(redact(result.body))
  console.log('HTTP', result.status)
} else {
  console.log('usage: node scripts/probe-signin-otp.mjs begin <email> <password>')
  console.log('       node scripts/probe-signin-otp.mjs verify <challenge_id> <code>')
  console.log('       node scripts/probe-signin-otp.mjs raw <json>')
}
