import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Course covers are typographic, not bars.
 *
 * Every course in the catalogue has no thumbnail, so every cover on the public
 * site was the level-drawn placeholder: thin green rules on mint that read as a
 * loading skeleton rather than art. The course page hero was the worst of it -
 * a 500px panel of decorative nothing above the fold. Well-intentioned code
 * (module count and level encoded honestly) that renders as broken is still
 * broken.
 *
 * The replacement draws from real course data only: the title's initial in the
 * display serif, the category as the eyebrow, the level as the mark. Same
 * course, same cover, on every surface - the catalogue card, the landing
 * carousel and the course hero all read from this one component, so a cover
 * cannot drift from its caption.
 */
describe('course cover', () => {
  const coverPath = path.resolve(__dirname, '..', 'catalogue/CourseCover.vue')
  const content = fs.readFileSync(coverPath, 'utf-8')

  it('renders the title initial in the display serif', () => {
    expect(content).toMatch(/font-display/)
    expect(content).toMatch(/title.*\[0\]|charAt\(0\)|slice\(0,\s*1\)/)
  })

  it('names the category and level in words, not just shapes', () => {
    expect(content).toMatch(/categoryName/)
    expect(content).toMatch(/LEVEL_LABELS|levelLabel|level.*label/i)
  })

  it('is decorative: hidden from assistive technology', () => {
    expect(content).toMatch(/aria-hidden="true"/)
  })

  it('is deterministic: nothing random, nothing time-based', () => {
    expect(content).not.toMatch(/Math\.random|Date\.now|new Date\(\)/)
  })

  it('is the single cover on every surface that shows one', () => {
    // Catalogue.vue gets its covers through CatalogueCard; asserting the three
    // places a cover is actually drawn keeps this honest about what it checks.
    for (const view of [
      'views/auth/Landing.vue',
      'views/auth/CoursePage.vue',
      'components/catalogue/CatalogueCard.vue',
    ]) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', '..', view), 'utf-8')
      expect(src).toMatch(/CourseCover/)
    }
  })
})
