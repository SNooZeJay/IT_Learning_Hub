<script setup lang="ts">
/**
 * The label that appears beside an icon when the sidebar rail is collapsed.
 *
 * Why this exists
 * ---------------
 * The rail previously expanded on hover. That was not merely a layout shift - it was a
 * whole-page reflow: `AppSidebar` widened itself *and* `AppLayout` widened the content
 * margin that tracks it, so hovering a 72px rail shoved every dashboard 184px to the
 * right over 200ms. Anything the pointer passed over moved out from under it.
 *
 * A tooltip positioned outside the rail has none of those properties. It is absolutely
 * positioned, so it takes no part in layout and cannot change a single computed width,
 * and it disappears with the pointer rather than persisting.
 *
 * Accessibility
 * -------------
 * The tooltip is `aria-hidden`. It restates a label the parent link already carries as
 * its accessible name, so announcing it would make a screen reader say "Dashboard"
 * twice. The name itself is set by the caller as `aria-label` on the link whenever the
 * visible text is hidden - that is the part which has to be right, and the reason this
 * component stays out of the accessibility tree.
 *
 * Visibility is a prop rather than an imperative handle, because the parent already
 * knows which item the pointer is on. A `defineExpose({ show, hide })` surface with a
 * template ref per item is more machinery for the same fact, and it cannot be reasoned
 * about from the template alone.
 *
 * Focus parity is deliberate: the rail is reachable by keyboard, and a sighted keyboard
 * user who collapses the sidebar and tabs through it would otherwise meet a column of
 * unlabelled icons. The parent therefore treats focus the same as hover.
 */
defineProps<{
  /** The label to show. Also what the caller puts on the link's aria-label. */
  label: string
}>()
</script>

<template>
  <!--
    `start-full` puts it entirely outside the rail with a 12px gap, so it never
    overlaps the icon it describes and never covers the content beside it. `ms-3` is
    logical, and mirrored in RTL where the rail grows the other way.
  -->
  <span
    class="animate-fadeIn pointer-events-none absolute top-1/2 z-99999 ms-3 start-full -translate-y-1/2 rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-theme-sm rtl:me-3 rtl:ms-0 dark:bg-surface"
    aria-hidden="true"
  >
    {{ label }}
  </span>
</template>
