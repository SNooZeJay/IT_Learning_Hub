import { onMounted, onUnmounted, provide, inject, readonly, ref } from 'vue'
import type { Ref } from 'vue'

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

  const context: SidebarContextType = {
    isExpanded,
    isMobileOpen,
    isMobile: readonly(isMobile) as Ref<boolean>,
    toggleSidebar,
    toggleMobileSidebar,
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
