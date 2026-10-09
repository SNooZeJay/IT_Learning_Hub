import { onMounted, onUnmounted, provide, inject, readonly, ref } from 'vue'
import type { Ref } from 'vue'
import router from '@/router'

/**
 * Where the shell switches between a persistent rail and an overlay drawer.
 *
 * One constant, because the shell previously had three and they disagreed:
 *
 *   - `useSidebar` treated anything under 768px as mobile
 *   - `Backdrop.vue` hid itself below 1024px (`lg:hidden`)
 *   - `AppSidebar` and `AppLayout` switched at 1280px (`max-xl` / `xl:`)
 *
 * So between 1024 and 1280 the drawer was open with no backdrop to tap, and between 768
 * and 1024 the backdrop was hidden while the sidebar was also an overlay. Neither range
 * could be dismissed by tapping outside it.
 *
 * The value is the Tailwind `xl` breakpoint. It has to be a literal rather than a
 * computed `window.innerWidth` read: the sidebar's open/closed classes are
 * `max-xl:`/`xl:` variants, and a JS media-query listener would disagree with them at the
 * boundary during a resize.
 */
export const SIDEBAR_BREAKPOINT_PX = 1280

interface SidebarContextType {
  /** True when the rail shows labels. False when it is collapsed to icons. */
  isExpanded: Ref<boolean>
  /** True when the overlay drawer is on screen. Below the breakpoint only. */
  isMobileOpen: Ref<boolean>
  /** True when the viewport is narrower than the breakpoint. */
  isMobile: Ref<boolean>
  toggleSidebar: () => void
  toggleMobileSidebar: () => void
  closeMobileSidebar: () => void
}

const SidebarSymbol = Symbol()

export function useSidebarProvider() {
  const isExpanded = ref(true)
  const isMobileOpen = ref(false)
  const isMobile = ref(false)

  /**
   * Persisted, so a collapsed rail survives a reload.
   *
   * Not a preference the user needs to revisit on every visit: collapsing a sidebar is
   * the first thing anyone does on a small laptop screen and the first thing they
   * complain about when it does not stick. Read defensively - a browser with storage
   * disabled throws here, and a sidebar is not worth a blank page.
   */
  function readStored(): boolean {
    try {
      return window.localStorage.getItem('ith.sidebar.expanded') !== 'false'
    } catch {
      return true
    }
  }

  function writeStored(expanded: boolean): void {
    try {
      window.localStorage.setItem('ith.sidebar.expanded', String(expanded))
    } catch {
      // Nothing to do. The rail still works for this session.
    }
  }

  const handleResize = () => {
    const mobile = window.innerWidth < SIDEBAR_BREAKPOINT_PX
    isMobile.value = mobile
    // Leaving the mobile range must not strand an open drawer, or the rail comes back
    // with an invisible overlay still in place.
    if (!mobile) {
      isMobileOpen.value = false
    }
  }

  onMounted(() => {
    isExpanded.value = readStored()
    handleResize()
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })

  /**
   * One control, two jobs.
   *
   * Below the breakpoint the sidebar is an overlay drawer and the button opens and
   * closes it. At and above it, the button collapses or expands the rail. Reading
   * `isMobile` rather than `window.innerWidth` means the button cannot disagree with the
   * composable's own idea of the current mode.
   */
  const toggleSidebar = () => {
    if (isMobile.value) {
      isMobileOpen.value = !isMobileOpen.value
      return
    }
    isExpanded.value = !isExpanded.value
    writeStored(isExpanded.value)
  }

  const toggleMobileSidebar = () => {
    isMobileOpen.value = !isMobileOpen.value
  }

  /**
   * Dismiss the overlay drawer.
   *
   * Separate from `toggleMobileSidebar` because a dismiss must never be able to
   * *open* it. Toggling is the right behaviour for the button in the header, which
   * is offering two states; every other caller - the backdrop, a navigation, a
   * resize - is stating a single fact, and expressing that with a toggle means any
   * of them can open the drawer by running the code that is supposed to close it.
   */
  const closeMobileSidebar = () => {
    isMobileOpen.value = false
  }

  /**
   * Close the drawer whenever navigation succeeds.
   *
   * Not from the nav items themselves, because there is more than one way to
   * navigate: a `RouterLink` in the sidebar, a programmatic `router.push` from a
   * view, a redirect from the auth guard, a browser back button. Wiring each of
   * those to call `closeMobileSidebar` misses one, and the symptom of missing one is
   * the drawer staying open over the page it just navigated to - you press a link,
   * the URL changes, the content behind the overlay changes, and the overlay is
   * still there covering it.
   *
   * `afterEach` rather than `beforeEach` because the guard has to run only for
   * navigations that actually happened. A `beforeEach` that closes the drawer would
   * also close it for a navigation that was then aborted, which is not what
   * "close the drawer because you navigated" means.
   *
   * Guarded by `isMobile` because on desktop `isMobileOpen` is already forced false
   * by `handleResize`, and because running it unconditionally would make the desktop
   * path depend on a value it does not otherwise care about.
   *
   * Registered in the provider, which is created once, and removed on unmount -
   * `afterEach` returns its own unregister function.
   */
  const removeAfterEach = router.afterEach(() => {
    if (isMobile.value) closeMobileSidebar()
  })

  onUnmounted(removeAfterEach)

  const context: SidebarContextType = {
    isExpanded,
    isMobileOpen,
    isMobile: readonly(isMobile) as Ref<boolean>,
    toggleSidebar,
    toggleMobileSidebar,
    closeMobileSidebar,
  }

  provide(SidebarSymbol, context)

  return context
}

export function useSidebar(): SidebarContextType {
  const context = inject<SidebarContextType>(SidebarSymbol)
  if (!context) {
    throw new Error(
      'useSidebar must be used within a component that has SidebarProvider as an ancestor',
    )
  }
  return context
}
