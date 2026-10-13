// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import AnimatedContent from '@/components/public/ui/AnimatedContent/AnimatedContent.vue'

gsap.registerPlugin(ScrollTrigger)

const SOURCE = path.resolve(__dirname, '..', 'ui', 'AnimatedContent', 'AnimatedContent.vue')
const source = () => fs.readFileSync(SOURCE, 'utf-8')

/**
 * AnimatedContent owns one reveal and nothing else.
 *
 * It used to kill EVERY ScrollTrigger on the page when any prop changed or
 * any instance unmounted - one card re-rendering cancelled every other
 * reveal mid-flight. The fix is scoping: a gsap.context per instance that
 * reverts only its own animations, and gsap.matchMedia for the mobile
 * fade-only variant. Transform/opacity only, play-once, unchanged contract.
 */
describe('AnimatedContent scoping', () => {
  it('never kills ScrollTriggers it does not own', () => {
    expect(source()).not.toMatch(/ScrollTrigger\.getAll\(\)/)
  })

  it('scopes its animations to a per-instance gsap.context reverted on unmount', () => {
    expect(source()).toMatch(/gsap\.context\(/)
    expect(source()).toMatch(/ctx\?\.revert\(\)/)
  })

  it('uses gsap.matchMedia for the small-screen variant', () => {
    expect(source()).toMatch(/gsap\.matchMedia\(|matchMedia\(\)/)
    expect(source()).toMatch(/767px/)
  })

  it('still plays once and never scrubs', () => {
    expect(source()).toMatch(/once:\s*true/)
    expect(source()).toMatch(/toggleActions:\s*['"]play none none none['"]/)
    expect(source()).not.toMatch(/scrub/)
  })
})

describe('AnimatedContent lifecycle', () => {
  /**
   * happy-dom cannot run ScrollTrigger's scroll engine (tween-linked triggers
   * never register there - verified by probe), so trigger counts are
   * unassertable in this environment. What IS assertable is this component's
   * own wiring: one context per mount, and unmount reverting exactly that
   * context. The library stays real throughout; only the observation seam is
   * a spy. Full trigger behaviour is verified in a real browser (Task 3
   * scroll test) instead of faked here.
   */
  it('unmounting one instance reverts only its own context', () => {
    const contexts: { reverted: boolean }[] = []
    const original = gsap.context.bind(gsap)
    const spy = vi.spyOn(gsap, 'context').mockImplementation(((
      func: () => void,
      scope?: Element,
    ) => {
      const ctx = original(func as any, scope)
      const record = { reverted: false }
      const revert = ctx.revert.bind(ctx)
      ctx.revert = (...args: []) => {
        record.reverted = true
        return revert(...args)
      }
      contexts.push(record)
      return ctx
    }) as typeof gsap.context)

    try {
      const first = mount(AnimatedContent, { props: { distance: 24 } })
      const second = mount(AnimatedContent, { props: { distance: 24 } })
      expect(contexts).toHaveLength(2)

      first.unmount()
      expect(contexts[0].reverted).toBe(true)
      expect(contexts[1].reverted).toBe(false)

      second.unmount()
      expect(contexts[1].reverted).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('applies the hidden start state on mount without touching layout properties', () => {
    const wrapper = mount(AnimatedContent, {
      props: { distance: 24, initialOpacity: 0 },
      slots: { default: '<p>hello</p>' },
    })
    const el = wrapper.element as HTMLElement
    expect(el.style.opacity).toBe('0')
    expect(el.style.transform).not.toBe('')
    expect(el.style.width).toBe('')
    expect(el.style.height).toBe('')
    wrapper.unmount()
  })

  it('fades without travel on small screens', () => {
    // Coverage for the matchMedia dispatch, not a RED test: swapping the two
    // branches would pass every other test here and ship desktop travel on
    // phones, where 24px is proportionally triple the motion.
    const queries: string[] = []
    vi.stubGlobal('matchMedia', (query: string) => {
      queries.push(query)
      return {
        matches: query.includes('max-width'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }
    })
    try {
      const mobile = mount(AnimatedContent, { props: { distance: 24 } })
      expect((mobile.element as HTMLElement).style.transform).toBe('translate(0, 0)')
      mobile.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
