// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LogoLoop from '@/components/public/ui/LogoLoop/LogoLoop.vue'

/**
 * The marquee's rAF loop is visibility-gated: offscreen, no loop.
 *
 * Regression pin for a one-line latent bug - the props watcher restarted the
 * loop directly instead of through the gate, so any future dynamic-logos
 * caller would get a permanent offscreen rAF. rAF call counts are the honest
 * signal here: they ARE the resource being saved, and happy-dom runs no
 * layout, so transform assertions cannot distinguish a running loop from a
 * stopped one (both write nothing with a zero measured width).
 */

type ObserverHoist = {
  callback: IntersectionObserverCallback
  observed: Element[]
  disconnected: boolean
}

function stubIO(hoist: { instances: ObserverHoist[] }) {
  class FakeIO {
    callback: IntersectionObserverCallback
    constructor(cb: IntersectionObserverCallback) {
      this.callback = cb
      hoist.instances.push({ callback: cb, observed: [], disconnected: false })
    }
    observe(el: Element) {
      hoist.instances[hoist.instances.length - 1].observed.push(el)
    }
    unobserve() {}
    disconnect() {
      hoist.instances[hoist.instances.length - 1].disconnected = true
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('LogoLoop visibility gating', () => {
  it('runs no rAF loop while offscreen, even when props change', async () => {
    const hoist: { instances: ObserverHoist[] } = { instances: [] }
    stubIO(hoist)
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const wrapper = mount(LogoLoop, {
      props: {
        logos: [{ node: '<i>a</i>' }, { node: '<i>b</i>' }],
        speed: 120,
      },
    })
    await sleep(200)
    const idleCalls = raf.mock.calls.length

    // A prop change must go through the gate, not around it. `gap` exercises
    // the dimensions watcher, which is the one that restarted the loop
    // directly.
    await wrapper.setProps({ gap: 48 })
    await sleep(200)
    const afterPropCalls = raf.mock.calls.length - idleCalls
    expect(afterPropCalls).toBeLessThanOrEqual(2)

    // Positive control: entering the viewport starts the loop.
    hoist.instances[0].callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    await sleep(200)
    expect(raf.mock.calls.length - idleCalls - afterPropCalls).toBeGreaterThan(4)

    wrapper.unmount()
  })
})
