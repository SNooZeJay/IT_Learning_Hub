// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Catalogue, course page and legal - the last public surfaces.
 *
 * Two assumptions in the plan for this work turned out to be wrong when the
 * code was measured rather than recalled, and both are recorded here as
 * decisions rather than quietly dropped.
 *
 * The course outline was to be rebuilt on shadcn's `Accordion`, replacing what
 * the plan described as a custom expand/collapse with bespoke focus handling.
 * It is not one. It is a static numbered `<ol>` of modules, already keyboard
 * and screen-reader neutral because it is a list. An Accordion would have
 * added a disclosure interaction nobody asked for, on content that is meant to
 * be scannable at a glance - the comment above the list says so explicitly.
 *
 * The catalogue filter was to be replaced by shadcn's `Select`, replacing what
 * the plan described as a hand-rolled dropdown. It is not one either: it is a
 * native `<select>` with the native arrow suppressed and an SVG chevron drawn in
 * its place. A native select is the most accessible option control that exists
 * - platform keyboard behaviour, screen-reader support, and a mobile picker
 * that no custom listbox matches. Swapping it for an ARIA listbox would have
 * been a regression dressed as an upgrade.
 *
 * So this suite asserts the two things that are actually true: the surfaces use
 * the shadcn surface primitive, and the controls that were deliberately left
 * alone stay that way.
 */
describe('catalogue, course page and legal surfaces', () => {
  const catalogueCard = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'components/catalogue/CatalogueCard.vue'),
    'utf-8',
  )
  const catalog = fs.readFileSync(path.resolve(__dirname, '..', 'auth', 'Catalog.vue'), 'utf-8')
  const coursePage = fs.readFileSync(
    path.resolve(__dirname, '..', 'auth', 'CoursePage.vue'),
    'utf-8',
  )

  describe('the course outline stays a list', () => {
    it('is an ordered list of modules, not a disclosure', () => {
      expect(coursePage).toMatch(/<ol[\s>]/)
      expect(coursePage).toMatch(/v-for="\(module, index\) in modules"/)
    })

    it('did not gain an accordion it never had', () => {
      // If someone later "fixes" this to match the plan, this fails.
      expect(coursePage).not.toMatch(/<Accordion/)
      expect(coursePage).not.toMatch(/aria-expanded/)
    })

    it('numbers its modules in text, which is what makes a list scannable', () => {
      expect(coursePage).toMatch(/Module \{\{ index \+ 1 \}\}/)
    })
  })

  describe('the catalogue filter stays native', () => {
    it('keeps a native select for the category and level filters', () => {
      const selects = (catalog.match(/<select\b/g) ?? []).length
      expect(selects).toBeGreaterThanOrEqual(3)
    })

    it('did not gain an ARIA listbox', () => {
      expect(catalog).not.toMatch(/role="listbox"/)
      expect(catalog).not.toMatch(/<Select\b/)
    })

    it('keeps the drawn chevron, which is the one thing worth customising', () => {
      // Suppressing the platform arrow and drawing an SVG in its place is what
      // puts the control back under the app's own control language. Losing it
      // would leave a foreign widget in the middle of the filter bar.
      expect(catalog).toMatch(/select-chevron/)
    })

    it('holds its 44px height', () => {
      expect(catalog).toMatch(/select-chevron h-11/)
    })
  })

  describe('shared card surface', () => {
    it('the catalogue card renders on the shadcn Card primitive', () => {
      expect(catalogueCard).toMatch(/from '@\/components\/public\/ui\/card'/)
    })

    it('the course page module tile renders on the shadcn Card primitive', () => {
      expect(coursePage).toMatch(/from '@\/components\/public\/ui\/card'/)
    })

    it('neither declares a literal colour', () => {
      expect(catalogueCard).not.toMatch(/#[0-9a-fA-F]{6}\b/)
      expect(coursePage).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    })
  })

  describe('legal pages', () => {
    /*
      All three legal pages were missing an `<h1>` entirely - the document title
      rendered as an `<h2>`, below a "Contents" heading that was also an `<h2>`.
      A page whose highest heading is level 2 tells assistive technology the
      document has no title, and heading navigation starts from the table of
      contents instead of from the document.

      The shell is where the title lives, so that is what carries the assertion.
    */
    it('the document shell renders exactly one h1, and it is the title', () => {
      const shell = fs.readFileSync(
        path.resolve(__dirname, '..', 'auth', 'LegalDocument.vue'),
        'utf-8',
      )
      expect((shell.match(/<h1\b/g) ?? []).length).toBe(1)
      // "Contents" must stay a level 2 - a second h1 would make the document
      // look like two documents.
      expect(shell).toMatch(/<h2[^>]*>\s*Contents\s*<\/h2>/)
    })

    it.each(['TermsOfService', 'PrivacyPolicy'] as const)(
      '%s renders through the shared shell rather than restating it',
      (page) => {
        const content = fs.readFileSync(
          path.resolve(__dirname, '..', 'auth', `${page}.vue`),
          'utf-8',
        )
        expect(content).toMatch(/LegalDocument/)
      },
    )
  })
})
