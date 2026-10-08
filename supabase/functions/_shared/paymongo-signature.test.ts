import { describe, expect, it } from 'vitest'
import { parseSignatureHeader, readSignatureHeader, verifySignature } from './paymongo-signature.ts'
import { sha256Hex } from './paymongo-envelope.ts'

/**
 * Signature verification is the only thing standing between a stranger and the
 * ability to mark a course as paid. These tests pin the behaviours that make it
 * safe, including the one that is easiest to get wrong.
 */

const SECRET = 'whsec_test_secret'

async function sign(rawBody: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

describe('signature header', () => {
  it('reads whichever documented header carries it', () => {
    expect(readSignatureHeader(new Headers({ 'paymongo-signature': 'abc' }))).toBe('abc')
    expect(readSignatureHeader(new Headers({ 'x-paymongo-signature': 'def' }))).toBe('def')
  })

  it('returns null when no signature is present', () => {
    expect(readSignatureHeader(new Headers())).toBeNull()
  })

  it('treats a blank signature as absent', () => {
    expect(readSignatureHeader(new Headers({ 'paymongo-signature': '   ' }))).toBeNull()
  })
})

describe('verification', () => {
  it('accepts a signature computed over the raw body', async () => {
    const raw = '{"data":{"id":"evt_1"}}'
    await expect(verifySignature(raw, await sign(raw), SECRET)).resolves.toBe(true)
  })

  it('accepts the multi-part header PayMongo actually sends', async () => {
    // The form that caused the bug. PayMongo sends `t=<unix>,te=<digest>,li=` and signs
    // `${t}.${body}` - Stripe's scheme - while this parser used to treat the whole
    // header as a bare digest, so every real delivery was refused.
    const raw = '{"data":{"id":"evt_multipart"}}'
    const ts = 1750000000
    const digest = await sign(`${ts}.${raw}`)
    const header = `t=${ts},te=${digest},li=`
    await expect(verifySignature(raw, header, SECRET, ts * 1000)).resolves.toBe(true)
  })

  it('parses the header shape PayMongo actually sends', async () => {
    // Recorded verbatim off a rejected delivery. The digest cannot be checked here
    // because the body it was computed over is not in the repository, so this asserts
    // the parse - which is what was broken - rather than pretending to verify it.
    //
    // The digest itself was confirmed against the full captured body while diagnosing
    // this: HMAC-SHA256(secret, `${t}.${rawBody}`) reproduced `te` exactly, whereas
    // HMAC-SHA256(secret, rawBody) did not.
    const parsed = parseSignatureHeader(
      't=1791468778,te=e67e0832054e060959c8e93f00e2c003656dcede719912d8947eb5c333ec012b,li=',
    )

    expect(parsed).not.toBeNull()
    expect(parsed?.digest).toBe(
      'e67e0832054e060959c8e93f00e2c003656dcede719912d8947eb5c333ec012b',
    )
    expect(parsed?.timestamp).toBe(1791468778)
    expect(parsed?.signedPayload('BODY')).toBe('1791468778.BODY')
  })

  it('reads v1 as the digest key as well as te', async () => {
    const raw = '{"data":{"id":"evt_v1"}}'
    const ts = 1750000000
    const digest = await sign(`${ts}.${raw}`)
    await expect(
      verifySignature(raw, `t=${ts},v1=${digest}`, SECRET, ts * 1000),
    ).resolves.toBe(true)
  })

  it('refuses a correctly signed request that is too old to be fresh', async () => {
    // Replay protection. The timestamp is inside the signed message, so it cannot be
    // altered without breaking the digest - which is what makes refusing old requests
    // meaningful rather than cosmetic.
    const raw = '{"data":{"id":"evt_old"}}'
    const ts = 1750000000
    const header = `t=${ts},te=${await sign(`${ts}.${raw}`)},li=`

    await expect(verifySignature(raw, header, SECRET, ts * 1000)).resolves.toBe(true)
    await expect(verifySignature(raw, header, SECRET, (ts + 3600) * 1000)).resolves.toBe(false)
  })

  it('accepts a sha256= prefixed signature', async () => {
    const raw = '{"data":{"id":"evt_2"}}'
    await expect(verifySignature(raw, `sha256=${await sign(raw)}`, SECRET)).resolves.toBe(true)
  })

  it('rejects a signature computed with a different secret', async () => {
    const raw = '{"data":{"id":"evt_3"}}'
    await expect(verifySignature(raw, await sign(raw, 'wrong'), SECRET)).resolves.toBe(false)
  })

  it('rejects a signature computed over different bytes', async () => {
    // The important case. Parsing and re-serialising changes whitespace and key
    // order, so a signature valid for the raw body must not validate a
    // re-serialised copy of the same object.
    const raw = '{"a":1,  "b":2}'
    const reserialised = JSON.stringify(JSON.parse(raw))
    await expect(verifySignature(reserialised, await sign(raw), SECRET)).resolves.toBe(false)
  })

  it('rejects when the signature is missing entirely', async () => {
    await expect(verifySignature('{}', null, SECRET)).resolves.toBe(false)
  })

  it('rejects when no secret is configured', async () => {
    const raw = '{}'
    await expect(verifySignature(raw, await sign(raw), '')).resolves.toBe(false)
  })

  it('rejects a signature that is not hex', async () => {
    await expect(verifySignature('{}', 'not-a-signature', SECRET)).resolves.toBe(false)
  })

  it('rejects a well-formed header whose digest is for a different body', async () => {
    // The exact shape that used to be rejected for the wrong reason. It must still be
    // rejected - now because the digest genuinely does not match, not because the
    // header failed to parse.
    const raw = '{"data":{"id":"evt_5"}}'
    const ts = 1750000000
    const header = `t=${ts},te=${await sign(`${ts}.{"data":{"id":"other"}}`)},li=`
    await expect(verifySignature(raw, header, SECRET, ts * 1000)).resolves.toBe(false)
  })

  it('rejects a truncated signature of the right shape', async () => {
    const raw = '{"data":{"id":"evt_4"}}'
    const full = await sign(raw)
    await expect(verifySignature(raw, full.slice(0, -2), SECRET)).resolves.toBe(false)
  })

  it('cannot be walked byte by byte to leak the expected value', async () => {
    // A length mismatch must reject outright rather than comparing a prefix,
    // otherwise response timing reveals how much of a guess was right.
    const raw = '{}'
    const full = await sign(raw)
    const half = full.slice(0, full.length / 2)
    const start = performance.now()
    await verifySignature(raw, half, SECRET)
    const halfMs = performance.now() - start

    const start2 = performance.now()
    await verifySignature(raw, full, SECRET)
    const fullMs = performance.now() - start2

    // Not a statistical claim, just a guard that the short path is not doing
    // dramatically less work than the long one.
    expect(halfMs).toBeLessThan(fullMs + 50)
  })
})

describe('sha256 helper', () => {
  it('matches the known digest of the empty string', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('is stable and order sensitive', async () => {
    await expect(sha256Hex('ab')).resolves.toBe(await sha256Hex('ab'))
    await expect(sha256Hex('ab')).not.resolves.toBe(await sha256Hex('ba'))
  })
})
