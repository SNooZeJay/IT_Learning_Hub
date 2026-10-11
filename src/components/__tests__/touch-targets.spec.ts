import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8')
}

/**
 * Touch targets hold 44px at the base breakpoint, not just at sm:/lg:.
 *
 * The base classes are what a phone gets: `sm:size-11` on a 40px base means the
 * smallest viewport - the one held in a hand - is the one that misses. The glyph
 * inside stays small; only the hit area grows. This covers public pages, the app
 * shell, and dashboards alike: a target is a target wherever it renders.
 *
 * Display-only circles (avatars, seals, empty-state icons) are not targets and
 * are deliberately absent here.
 */
describe('touch target floors (44px at base)', () => {
  it('HeaderIconButton holds 44px without scaling its glyph', () => {
    const content = read('layout/HeaderIconButton.vue')
    expect(content).toMatch(/size-11|size-12|min-h-11|min-h-12/)
    expect(content).not.toMatch(/flex size-10 shrink-0/)
  })

  it('carousel arrows hold 44px at base, not only from sm: up', () => {
    const content = read('carousel/DepthCarousel.vue')
    expect(content).toMatch(/grid size-11 .*place-items-center self-center rounded-full/)
  })

  it('carousel dots still hold 44px with the visible dot inside', () => {
    const content = read('carousel/DepthCarousel.vue')
    expect(content).toContain('size-11 cursor-pointer place-items-center')
  })

  it('auth back link holds 44px without reading as a button', () => {
    const content = read('auth/AuthShell.vue')
    expect(content).toMatch(/min-h-11/)
    expect(content).not.toMatch(/min-h-10/)
  })

  it('catalogue back link holds 44px', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'views/auth/Catalog.vue'),
      'utf-8',
    )
    expect(content).toMatch(/min-h-11/)
    expect(content).not.toMatch(/min-h-10/)
  })

  it('course page back link holds 44px', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'views/auth/CoursePage.vue'),
      'utf-8',
    )
    expect(content).toMatch(/min-h-11/)
    expect(content).not.toMatch(/min-h-10/)
  })

  it('landing View-course link holds 44px - it is the keyboard route into the course', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'views/auth/Landing.vue'),
      'utf-8',
    )
    /*
      This used to assert the literal `inline-flex min-h-11 shrink-0` that the
      carousel's View-course link carried as a hand-written class string. It no
      longer does, because that link is now a `<Button variant="outline"
      size="sm">` and the 44px comes from the shared Button's `sm` size rather
      than from the view.

      The guarantee is unchanged - still 44px, still the keyboard route into the
      course - so this asserts the route it now takes through instead. Asserting
      the old literal would have meant keeping a dead class string on the view
      purely to satisfy a test, which is the same trap in reverse.
    */
    expect(content).toMatch(/View course/)
    expect(content).toMatch(/<Button as-child variant="outline" size="sm"/)

    // And the Button's `sm` size is what actually sets the height.
    const button = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'components/public/ui/button/index.ts'),
      'utf-8',
    )
    expect(button).toMatch(/sm:\s*'h-11[^']*'/)
    expect(button).not.toMatch(/sm:\s*'h-(9|10)\b/)
  })

  it('quiz option remove button holds 44px', () => {
    const content = read('quiz/QuizQuestionForm.vue')
    expect(content).toMatch(/inline-flex size-11 shrink-0/)
    expect(content).not.toMatch(/inline-flex size-10 shrink-0/)
  })
})
