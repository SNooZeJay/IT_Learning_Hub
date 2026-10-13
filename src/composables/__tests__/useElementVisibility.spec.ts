// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useElementVisibility } from '@/composables/useElementVisibility'

/**
 * Visibility gating for below-fold motion.
 *
 * The marquee and other always-on motion currently mount (and start their
 * rAF loops) on first paint even when far below the fold. This composable is
 * the gate: observe a sentinel, report once (or continuously), and fail OPEN
 * when IntersectionObserver is missing - content must never stay hidden
 * because an API is absent.
 */

function TestHost(props: { once?: boolean; rootMargin?: string; bindSentinel?: boolean }) {
  return defineComponent({
    setup() {
      const { target, inView } = useElementVisibility({
        once: props.once,
        rootMargin: props.rootMargin,
      })
      return () =>
        h('div', [
          props.bindSentinel === false
            ? null
            : h('div', { ref: target, 'data-testid': 'sentinel' }),
          inView.value ? h('p', { 'data-testid': 'content' }, 'shown') : null,
        ])
    },
  })
}

type ObserverHoist = {
  callback: IntersectionObserverCallback
  options?: IntersectionObserverInit
  observed: Element[]
  disconnected: boolean
}

function stubIO(hoist: { instances: ObserverHoist[] }) {
  class FakeIO {
    callback: IntersectionObserverCallback
    options?: IntersectionObserverInit
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
      this.callback = cb
      this.options = opts
      hoist.instances.push({
        callback: cb,
        options: opts,
        observed: [],
        disconnected: false,
      })
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
})

describe('useElementVisibility', () => {
  it('fails open when IntersectionObserver is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const wrapper = mount(TestHost({}))
    await nextTick()
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('observes the sentinel and reports the first intersection, then disconnects', async () => {
    const hoist: { instances: ObserverHoist[] } = { instances: [] }
    stubIO(hoist)
    const wrapper = mount(TestHost({ once: true }))
    await nextTick()

    expect(hoist.instances).toHaveLength(1)
    const sentinel = wrapper.find('[data-testid="sentinel"]').element
    expect(hoist.instances[0].observed).toContain(sentinel)
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)

    hoist.instances[0].callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    await nextTick()
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(hoist.instances[0].disconnected).toBe(true)
    wrapper.unmount()
  })

  it('passes rootMargin through to the observer', async () => {
    const hoist: { instances: ObserverHoist[] } = { instances: [] }
    stubIO(hoist)
    const wrapper = mount(TestHost({ once: true, rootMargin: '200px' }))
    await nextTick()
    expect(hoist.instances[0].options?.rootMargin).toBe('200px')
    wrapper.unmount()
  })

  it('with once:false it tracks visibility continuously and disconnects on unmount', async () => {
    const hoist: { instances: ObserverHoist[] } = { instances: [] }
    stubIO(hoist)
    const wrapper = mount(TestHost({ once: false }))
    await nextTick()

    const fire = (v: boolean) => {
      hoist.instances[0].callback(
        [{ isIntersecting: v } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    }
    fire(true)
    await nextTick()
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(hoist.instances[0].disconnected).toBe(false)

    fire(false)
    await nextTick()
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)

    wrapper.unmount()
    expect(hoist.instances[0].disconnected).toBe(true)
  })

  it('fails open when the target never binds', async () => {
    // Coverage, not a RED test: the null-target branch shipped with the
    // composable and this pins the contract - a sentinel stuck inside a
    // false v-if must never hide its section.
    const hoist: { instances: ObserverHoist[] } = { instances: [] }
    stubIO(hoist)
    const wrapper = mount(TestHost({ bindSentinel: false }))
    await nextTick()
    expect(hoist.instances).toHaveLength(0)
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
