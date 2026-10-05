import { describe, it, expect } from 'vitest'

import { safeExternalHref, UNSAFE_URL_REASON } from '@/services/curriculum.service'

/**
 * Stored XSS through a learning material's link.
 *
 * The bug: `MaterialItem` bound `:href="material.externalUrl"` with no check. An
 * instructor (or anyone who reached the write path) could store
 * `javascript:alert(document.cookie)` and it became a clickable link on the
 * lesson page for every enrolled student, executing in this origin with their
 * session.
 *
 * `novalidate` on `MaterialForm` is why nothing upstream stopped it: it disables
 * the browser's own `type="url"` check. That check would not have helped anyway -
 * `type="url"` accepts any scheme it can parse, `javascript:` included - so the
 * scheme test has to be an explicit one.
 *
 * These cover the parser itself. The `|`-separated cases are the ones a
 * hand-written `startsWith('http')` or regex check gets wrong.
 */

describe('safeExternalHref', () => {
  it('accepts http and https', () => {
    expect(safeExternalHref('https://docs.python.org/3/')).toBe('https://docs.python.org/3/')
    expect(safeExternalHref('http://example.com/a?b=c#d')).toBe('http://example.com/a?b=c#d')
  })

  it('is case-insensitive about the scheme, as a browser is', () => {
    // A `HTTP://` prefix that a case-sensitive string comparison refuses, and a
    // mixed-case `JaVaScRiPt:` that a case-insensitive one would let through.
    expect(safeExternalHref('HTTPS://example.com/')).toBe('https://example.com/')
    expect(safeExternalHref('JaVaScRiPt:alert(1)')).toBeNull()
  })

  it('refuses javascript: in every spelling that parses', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBeNull()
    expect(safeExternalHref('javascript:alert(document.cookie)')).toBeNull()
    expect(safeExternalHref('  javascript:alert(1)')).toBeNull()
    // A tab inside the scheme is stripped by the URL parser, so this executes in a
    // browser while looking like it does not parse as javascript at all.
    expect(safeExternalHref('java\tscript:alert(1)')).toBeNull()
    expect(safeExternalHref('java\nscript:alert(1)')).toBeNull()
    // A leading newline is likewise stripped before the scheme is read.
    expect(safeExternalHref('\njavascript:alert(1)')).toBeNull()
  })

  it('refuses the other schemes that are not links', () => {
    // `data:` is script too, and `vbscript:`/`file:` are the same class of
    // problem. A blocklist naming only `javascript:` would pass all three.
    expect(safeExternalHref('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(
      safeExternalHref('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='),
    ).toBeNull()
    expect(safeExternalHref('vbscript:msgbox(1)')).toBeNull()
    expect(safeExternalHref('file:///etc/passwd')).toBeNull()
    expect(safeExternalHref('blob:https://example.com/uuid')).toBeNull()
  })

  it('refuses a schemeless value rather than guessing at it', () => {
    // These look like plausible typos. Resolving them against the site's origin
    // would turn a mistyped URL into a link into this app's own pages.
    expect(safeExternalHref('docs.python.org/3/')).toBeNull()
    expect(safeExternalHref('//evil.test/path')).toBeNull()
    expect(safeExternalHref('example.com')).toBeNull()
    expect(safeExternalHref('not a url at all')).toBeNull()
  })

  it('treats absent and blank as absent', () => {
    expect(safeExternalHref(null)).toBeNull()
    expect(safeExternalHref(undefined)).toBeNull()
    expect(safeExternalHref('')).toBeNull()
    expect(safeExternalHref('   ')).toBeNull()
  })

  it('refuses a bare https scheme with no host', () => {
    // `new URL('https://')` throws, so this is null rather than a link to nowhere.
    expect(safeExternalHref('https://')).toBeNull()
  })

  it('has a reason that names what is allowed', () => {
    // The form shows this verbatim, so it has to name the rule rather than say
    // "invalid URL" - which is what the instructor would then read as "my link
    // is broken" when it is the scheme that is refused.
    expect(UNSAFE_URL_REASON).toMatch(/http/)
    expect(UNSAFE_URL_REASON).toMatch(/https/)
    expect(UNSAFE_URL_REASON).toMatch(/javascript:/)
  })
})
