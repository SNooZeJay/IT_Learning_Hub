import { describe, expect, it } from 'vitest'
import {
  MESSAGE_MAX_LENGTH,
  MessagingError,
  normaliseMessageBody,
  normaliseSubject,
  previewOf,
} from './messaging.service'

/**
 * The pure rules of a message, tested without a database.
 *
 * These exist because the two rules that matter most are the ones a database would
 * otherwise be the first to enforce: an empty message and a blank subject. Both are
 * checked here so the composer and the tests cannot drift, and so the trimmed value
 * that gets sent is the value the caller sees typed back.
 */
describe('normaliseMessageBody', () => {
  it('trims before sending, so the stored body is the one the user sees', () => {
    expect(normaliseMessageBody('  hello  ')).toBe('hello')
  })

  it('keeps internal whitespace exactly as typed', () => {
    expect(normaliseMessageBody('two\nlines\there')).toBe('two\nlines\there')
  })

  it('refuses an empty or whitespace-only message', () => {
    for (const empty of ['', '   ', '\n\n', '\t']) {
      expect(() => normaliseMessageBody(empty)).toThrow(MessagingError)
    }
  })

  it('refuses a message over the limit rather than letting the database do it', () => {
    const tooLong = 'x'.repeat(MESSAGE_MAX_LENGTH + 1)
    expect(() => normaliseMessageBody(tooLong)).toThrow(/at most/)
  })

  it('accepts a message exactly on the limit', () => {
    expect(normaliseMessageBody('x'.repeat(MESSAGE_MAX_LENGTH))).toHaveLength(MESSAGE_MAX_LENGTH)
  })

  it('counts characters after trimming, not before', () => {
    // A user pasting a long line and then deleting a trailing space should not be
    // rejected for a length they are no longer at.
    const padded = `  ${'y'.repeat(MESSAGE_MAX_LENGTH)}  `
    expect(() => normaliseMessageBody(padded)).not.toThrow()
  })
})

describe('normaliseSubject', () => {
  it('trims', () => {
    expect(normaliseSubject('  Question about week 3  ')).toBe('Question about week 3')
  })

  it('refuses a blank subject, because the list is identified by it', () => {
    expect(() => normaliseSubject('   ')).toThrow(MessagingError)
  })

  it('refuses a subject over 120 characters', () => {
    expect(() => normaliseSubject('s'.repeat(121))).toThrow(/120/)
  })

  it('explains why a subject is required rather than just refusing', () => {
    // The message is what a person reads when the field is empty. "Subject is
    // required" tells them what to do; a bare failure does not.
    expect(() => normaliseSubject('')).toThrow(/recognisable/i)
  })
})

describe('previewOf', () => {
  it('leaves a short message alone', () => {
    expect(previewOf('See you then.')).toBe('See you then.')
  })

  it('flattens newlines so a preview stays one line in the list', () => {
    expect(previewOf('one\ntwo   three')).toBe('one two three')
  })

  it('truncates a long message with an ellipsis', () => {
    const preview = previewOf('z'.repeat(400))
    expect(preview.length).toBeLessThanOrEqual(90)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('trims before measuring, so whitespace does not push a short message over', () => {
    expect(previewOf('   short   ')).toBe('short')
  })
})
