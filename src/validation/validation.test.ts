import { describe, expect, it } from 'vitest'
import {
  MAX_SLUG_LENGTH,
  MIN_PASSWORD_LENGTH,
  checkFile,
  collect,
  decimalInRange,
  emailField,
  firstFailure,
  formatBytes,
  integerInRange,
  isEmail,
  isSameOriginUrl,
  isSafeUrl,
  isSlug,
  isUuid,
  oneOf,
  passwordField,
  requiredText,
  slugField,
  uuidField,
} from './index'

/**
 * The rules, tested against the inputs that motivated each one.
 *
 * A validation library is only as good as the cases it is shown, and the cases worth
 * showing are the ones a `startsWith` or a `Number()` would wave through. Several tests
 * below name the specific bypass they exist to catch.
 */
describe('isEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isEmail('lalamonan.joren@ncst.edu.ph')).toBe(true)
    expect(isEmail('jayzeeb65@gmail.com')).toBe(true)
    expect(isEmail('a+b@sub.domain.co')).toBe(true)
  })

  it('refuses what an address is not', () => {
    expect(isEmail('')).toBe(false)
    expect(isEmail('no-at-sign')).toBe(false)
    expect(isEmail('@ncst.edu.ph')).toBe(false)
    expect(isEmail('spaces in@the.address')).toBe(false)
    expect(isEmail('trailing@dot.')).toBe(false)
  })

  it('tolerates the whitespace a paste brings', () => {
    expect(isEmail('  jayzeeb65@gmail.com  ')).toBe(true)
  })
})

describe('emailField', () => {
  it('separates "missing" from "malformed", which are different corrections', () => {
    const missing = emailField('   ')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe('Email address is required.')

    const malformed = emailField('not-an-email')
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.reason).not.toBe('Email address is required.')

    expect(emailField('lalamonan.joren@ncst.edu.ph').ok).toBe(true)
  })

  it("uses the caller's own label", () => {
    const result = emailField('nope', 'Recovery email address')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('recovery email address')
  })
})

describe('isUuid', () => {
  it('accepts the canonical form, either case', () => {
    expect(isUuid('e4070e42-8608-4702-acf9-f5265615fb51')).toBe(true)
    expect(isUuid('E4070E42-8608-4702-ACF9-F5265615FB51')).toBe(true)
  })

  it('refuses everything a broken URL can carry', () => {
    // Each of these reached PostgREST before this rule existed, and came back as
    // `22P02 invalid input syntax for type uuid` rendered to the person who clicked.
    for (const bad of [
      '',
      'not-a-uuid',
      '1',
      '12345',
      "'; drop table payments; --",
      '<script>alert(1)</script>',
      'e4070e42-8608-4702-acf9-f5265615fb5', // one char short
      'e4070e42-8608-4702-acf9-f5265615fb511', // one char long
      'g4070e42-8608-4702-acf9-f5265615fb51', // not hex
      'e4070e4286044702acf9f5265615fb51', // no hyphens
      'e4070e42_8608_4702_acf9_f5265615fb51', // wrong separators
    ]) {
      expect(isUuid(bad), `${bad} must not be treated as a uuid`).toBe(false)
    }
  })
})

describe('isSafeUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeUrl('https://example.com/video.mp4')).toBe(true)
    expect(isSafeUrl('http://example.com')).toBe(true)
  })

  it('refuses schemes that are script rather than link', () => {
    // The four shapes a `startsWith('http')` check waves through. `new URL` strips the
    // leading whitespace and the embedded tab exactly as a browser does, which is why
    // parsing beats a prefix test.
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('java\tscript:alert(1)')).toBe(false)
    expect(isSafeUrl('JaVaScRiPt:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeUrl('file:///etc/passwd')).toBe(false)
  })

  it('refuses a value with no scheme at all', () => {
    expect(isSafeUrl('example.com')).toBe(false)
    expect(isSafeUrl('/relative/path')).toBe(false)
    expect(isSafeUrl('')).toBe(false)
  })
})

describe('isSameOriginUrl', () => {
  const origin = 'https://it-learning-hub-three.vercel.app'

  it('accepts a return to the deployment itself', () => {
    expect(isSameOriginUrl(`${origin}/student/courses/x?payment=success`, origin)).toBe(true)
    expect(isSameOriginUrl(origin, origin)).toBe(true)
  })

  it('refuses a return to anywhere else', () => {
    // This is the shape the create-checkout hole took: a real hosted PayMongo session
    // whose return trip lands the learner - and the money - somewhere else.
    expect(isSameOriginUrl('https://evil.example/steal', origin)).toBe(false)
    expect(isSameOriginUrl('http://it-learning-hub-three.vercel.app/x', origin)).toBe(false)
    expect(isSameOriginUrl('https://it-learning-hub-three.vercel.app.evil.test/x', origin)).toBe(
      false,
    )
    expect(isSameOriginUrl('https://it-learning-hub-three.vercel.app@evil.test/x', origin)).toBe(
      false,
    )
  })

  it('refuses when there is no origin to compare against', () => {
    // A rule that cannot be evaluated must not pass. `SITE_URL` unset falls here.
    expect(isSameOriginUrl('https://anything.test/x', '')).toBe(false)
    expect(isSameOriginUrl('https://anything.test/x', 'null')).toBe(false)
  })

  it('refuses an unsafe scheme even on the right host', () => {
    expect(isSameOriginUrl('javascript:alert(1)', origin)).toBe(false)
  })
})

describe('isSlug', () => {
  it('accepts what slugify produces', () => {
    expect(isSlug('intro-to-programming')).toBe(true)
    expect(isSlug('advanced-python')).toBe(true)
    expect(isSlug('it2')).toBe(true)
  })

  it('refuses shapes slugify would never emit', () => {
    expect(isSlug('Introduction To Programming')).toBe(false)
    expect(isSlug('intro--to')).toBe(false)
    expect(isSlug('-leading')).toBe(false)
    expect(isSlug('trailing-')).toBe(false)
    expect(isSlug('has space')).toBe(false)
    expect(isSlug('has_underscore')).toBe(false)
    expect(isSlug('')).toBe(false)
  })

  it('bounds the length the way the unique index does in practice', () => {
    expect(isSlug('a'.repeat(MAX_SLUG_LENGTH))).toBe(true)
    expect(isSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false)
  })
})

describe('requiredText', () => {
  it('names the field and the bound', () => {
    const missing = requiredText('', 'Course title')
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.reason).toBe('Course title is required.')

    const long = requiredText('x'.repeat(11), 'Course title', { max: 10 })
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.reason).toContain('10 characters or fewer')
  })

  it('treats whitespace as absent', () => {
    expect(requiredText('   ', 'Course title').ok).toBe(false)
  })

  it('trims before measuring, so padding is not length', () => {
    expect(requiredText('  ok  ', 'Course title', { max: 4 }).ok).toBe(true)
  })
})

describe('passwordField', () => {
  it('enforces the shared minimum', () => {
    const short = passwordField('a'.repeat(MIN_PASSWORD_LENGTH - 1))
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.reason).toContain(String(MIN_PASSWORD_LENGTH))

    expect(passwordField('a'.repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true)
  })

  it('does not trim, because a space is a legitimate character in a password', () => {
    expect(passwordField('   a   b   ').ok).toBe(true)
  })
})

describe('integerInRange', () => {
  it('refuses what Number() would silently turn into zero', () => {
    // `Number('')` is 0 and `Number('abc')` is NaN. Three separate helpers in this
    // project defaulted one of those to a valid zero.
    for (const bad of ['', 'abc', null, undefined, {}, 'NaN', 'Infinity']) {
      expect(integerInRange(bad, 'Price', 0, 100).ok, `${String(bad)} must be refused`).toBe(false)
    }
  })

  it('refuses a fraction where a whole number is required', () => {
    expect(integerInRange(1.5, 'Price', 0, 100).ok).toBe(false)
    expect(integerInRange('1.5', 'Price', 0, 100).ok).toBe(false)
  })

  it('accepts the bounds and refuses outside them', () => {
    expect(integerInRange(0, 'Price', 0, 100).ok).toBe(true)
    expect(integerInRange(100, 'Price', 0, 100).ok).toBe(true)
    expect(integerInRange(-1, 'Price', 0, 100).ok).toBe(false)
    expect(integerInRange(101, 'Price', 0, 100).ok).toBe(false)
  })

  it('accepts a numeric string, because a number input hands one over', () => {
    expect(integerInRange('42', 'Price', 0, 100).ok).toBe(true)
  })
})

describe('decimalInRange', () => {
  it('refuses more than two decimal places rather than rounding them', () => {
    // `numeric(6,2)` on the server would round 99.999 to 100.00, so accepting it here
    // would show the author one number and store another.
    const result = decimalInRange('99.999', 'Points', 0, 1000)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('two decimal places')
  })

  it('accepts two and fewer', () => {
    expect(decimalInRange('99.99', 'Points', 0, 1000).ok).toBe(true)
    expect(decimalInRange('99', 'Points', 0, 1000).ok).toBe(true)
    expect(decimalInRange(99.5, 'Points', 0, 1000).ok).toBe(true)
  })

  it('refuses out of range', () => {
    expect(decimalInRange(-0.01, 'Points', 0, 1000).ok).toBe(false)
    expect(decimalInRange(1000.01, 'Points', 0, 1000).ok).toBe(false)
  })
})

describe('oneOf', () => {
  const levels = ['beginner', 'intermediate', 'advanced'] as const

  it('accepts a member and refuses anything else', () => {
    expect(oneOf('beginner', levels, 'Level').ok).toBe(true)
    expect(oneOf('wizard', levels, 'Level').ok).toBe(false)
    expect(oneOf('', levels, 'Level').ok).toBe(false)
  })

  it('lists what was allowed when it refuses', () => {
    const result = oneOf('wizard', levels, 'Level')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('beginner, intermediate, advanced')
  })
})

describe('slugField and uuidField', () => {
  it('report the rule, not the internals', () => {
    const slug = slugField('Not A Slug', 'Slug')
    expect(slug.ok).toBe(false)
    if (!slug.ok) expect(slug.reason).toContain('lowercase')

    const uuid = uuidField('nope', 'course')
    expect(uuid.ok).toBe(false)
    if (!uuid.ok) expect(uuid.reason).toContain('not a valid identifier')
  })
})

describe('checkFile', () => {
  const rule = { maxBytes: 2 * 1024 * 1024, acceptedTypes: ['image/png'], label: 'Avatar' }
  const make = (size: number, type: string) => ({ size, type }) as unknown as File

  it('refuses nothing at all', () => {
    expect(checkFile(null, rule).ok).toBe(false)
    expect(checkFile(undefined, rule).ok).toBe(false)
  })

  it('refuses an empty file', () => {
    expect(checkFile(make(0, 'image/png'), rule).ok).toBe(false)
  })

  it('refuses a file over the bound and says by how much', () => {
    const result = checkFile(make(3 * 1024 * 1024, 'image/png'), rule)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('2 MB')
      expect(result.reason).toContain('3 MB')
    }
  })

  it('refuses a type outside the allow-list', () => {
    const result = checkFile(make(1024, 'application/x-msdownload'), rule)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('image/png')
  })

  it('accepts a good file', () => {
    expect(checkFile(make(1024, 'image/png'), rule).ok).toBe(true)
  })

  it('formats bytes the way a limit is read', () => {
    expect(formatBytes(512)).toBe('512 bytes')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})

describe('collect and firstFailure', () => {
  it('reports every failure, so a form fixes one round of problems', () => {
    const result = collect([
      ['title', requiredText('', 'Course title')],
      ['slug', slugField('Not A Slug')],
      ['price', integerInRange('abc', 'Price', 0, 100)],
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['price', 'slug', 'title'])
    }
  })

  it('passes when everything passes', () => {
    expect(collect([['title', requiredText('Intro', 'Course title')]]).ok).toBe(true)
  })

  it('firstFailure stops at the first, for a single-field guard', () => {
    expect(
      firstFailure([
        ['a', requiredText('', 'First')],
        ['b', requiredText('', 'Second')],
      ]),
    ).toBe('First is required.')
    expect(firstFailure([['a', requiredText('ok', 'First')]])).toBeUndefined()
  })
})
