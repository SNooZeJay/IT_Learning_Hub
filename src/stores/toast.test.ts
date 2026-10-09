import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useToastStore } from '@/stores/toast'

/**
 * `push()` appended unconditionally, so identical failures stacked without limit.
 *
 * Nine copies of "Enrollment failed" piled down the screen and covered the page
 * that produced them. The cause was not that failures were frequent - it is that
 * nothing stopped the same failure being reported nine times. `push` had no dedupe
 * key, no cap, and no eviction, and it registered a `setTimeout` per toast whose
 * handle was discarded, so nothing could be cancelled either.
 *
 * The behaviour worth pinning is threefold: repeats collapse, the stack is bounded,
 * and `clear()` on sign-out leaves no timer running. A toast host that can show an
 * unbounded number of opaque cards is not a notification system.
 */
describe('toast store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('collapses an identical repeat instead of stacking a second copy', () => {
    const toast = useToastStore()

    const first = toast.error('Enrollment failed', 'This course is paid.')
    const second = toast.error('Enrollment failed', 'This course is paid.')

    expect(second).toBe(first)
    expect(toast.toasts).toHaveLength(1)
  })

  it('keeps different failures apart', () => {
    const toast = useToastStore()

    toast.error('Enrollment failed', 'This course is paid.')
    toast.error('Enrollment failed', 'The server refused the request.')
    toast.warning('Payment cancelled', 'Nothing was charged.')

    expect(toast.toasts).toHaveLength(3)
  })

  it('treats a missing message and an empty message as the same toast', () => {
    const toast = useToastStore()

    toast.info('Saved')
    toast.info('Saved', '')

    // `undefined` and `''` render identically, so they must not produce two cards.
    expect(toast.toasts).toHaveLength(1)
  })

  it('caps the visible stack and evicts the oldest', () => {
    const toast = useToastStore()

    for (let i = 0; i < 10; i += 1) toast.error('Failure', `Attempt ${i}`)

    expect(toast.toasts).toHaveLength(3)
    // The survivors are the newest three, in order.
    expect(toast.toasts.map((t) => t.message)).toEqual(['Attempt 7', 'Attempt 8', 'Attempt 9'])
  })

  it('survives ten identical failures with a single card', () => {
    const toast = useToastStore()

    for (let i = 0; i < 10; i += 1) toast.error('Enrollment failed', 'This course is paid.')

    expect(toast.toasts).toHaveLength(1)
  })

  it('restarts the dismissal timer on a repeat rather than leaving the old one', () => {
    const toast = useToastStore()
    vi.setSystemTime(0)

    const id = toast.error('Enrollment failed', 'This course is paid.')

    // Almost expired.
    vi.advanceTimersByTime(7_000)
    // A repeat arrives: the countdown must belong to the NEW occurrence.
    toast.error('Enrollment failed', 'This course is paid.')

    // 7s + 1s = 8s since the original. The first timer would have fired at 8s and
    // wrongly dismissed the toast one second into its second appearance.
    vi.advanceTimersByTime(1_000)
    expect(toast.toasts).toHaveLength(1)

    vi.advanceTimersByTime(8_000)
    expect(toast.toasts).toHaveLength(0)
    expect(id).toBeGreaterThan(0)
  })

  it('honours an explicit stick-forever duration over a pending timer', () => {
    const toast = useToastStore()

    toast.error('Enrollment failed', 'This course is paid.', 8_000)
    toast.error('Enrollment failed', 'This course is paid.', null)

    vi.advanceTimersByTime(60_000)
    expect(toast.toasts).toHaveLength(1)
    expect(toast.toasts[0]?.durationMs).toBeNull()
  })

  it('auto-dismisses on the default duration for its variant', () => {
    const toast = useToastStore()

    toast.error('Enrollment failed', 'This course is paid.')
    vi.advanceTimersByTime(7_999)
    expect(toast.toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toast.toasts).toHaveLength(0)
  })

  it('does not fire a timer for an already-dismissed toast', () => {
    const toast = useToastStore()

    const id = toast.error('Enrollment failed', 'This course is paid.')
    toast.dismiss(id)
    expect(toast.toasts).toHaveLength(0)

    // The original 8s timer would have fired here. Cancelling it means `dismiss`
    // is not invoked against an id that no longer exists.
    const dismissSpy = vi.spyOn(toast, 'dismiss')
    vi.advanceTimersByTime(60_000)
    expect(dismissSpy).not.toHaveBeenCalled()
  })

  it('cancels every pending timer when cleared on sign-out', () => {
    const toast = useToastStore()

    toast.error('One', 'First failure.')
    toast.warning('Two', 'Second failure.')
    toast.info('Three', 'Third failure.')

    toast.clear()
    expect(toast.toasts).toHaveLength(0)

    const dismissSpy = vi.spyOn(toast, 'dismiss')
    vi.advanceTimersByTime(60_000)
    expect(dismissSpy).not.toHaveBeenCalled()
  })

  it('does not cap a toast that never dismisses on its own', () => {
    const toast = useToastStore()

    toast.error('Sticky', 'Needs an explicit close.', null)
    vi.advanceTimersByTime(60_000)

    expect(toast.toasts).toHaveLength(1)
  })
})
