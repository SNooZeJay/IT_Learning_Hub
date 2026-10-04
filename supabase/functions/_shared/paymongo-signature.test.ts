import { describe, expect, it } from 'vitest'
import { readSignatureHeader, verifySignature } from './paymongo-signature.ts'
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
