import { describe, expect, it, vi, afterEach } from 'vitest'
/**
 * A reload must always land at the top.
 *
 * Vue Router persists the last restored scroll position into history.state,
 * so after back-navigating deep and hitting refresh, `savedPosition` arrives
 * non-null and the reload lands mid-page. Reproduced live: scroll to 3000,
 * follow a link, go back (correctly deep), reload (incorrectly deep at 2708).
 * Back and forward keep their restoration; only a reload is overridden.
 */
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, createWebHistory: () => actual.createMemoryHistory() }
})

const { resolveScrollPosition } = await import('./index')

function stubNavigationType(type: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type } as PerformanceNavigationTiming,
  ])
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveScrollPosition', () => {
  it('ignores a saved deep position on reload', () => {
    stubNavigationType('reload')
    expect(resolveScrollPosition({ left: 0, top: 3000 })).toEqual({ left: 0, top: 0 })
  })

  it('keeps the saved position on back and forward', () => {
    stubNavigationType('back_forward')
    expect(resolveScrollPosition({ left: 0, top: 3000 })).toEqual({ left: 0, top: 3000 })
  })

  it('starts at the top on a fresh navigation with nothing saved', () => {
    stubNavigationType('navigate')
    expect(resolveScrollPosition(null)).toEqual({ left: 0, top: 0 })
  })
})
