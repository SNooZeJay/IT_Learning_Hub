<script setup lang="ts">
/**
 * One icon-button treatment for the whole application header.
 *
 * This existed four times over, spelled four ways, inside a single 44px-tall row:
 *
 *   - the sidebar toggle: `rounded-md`, bordered, `size-10`
 *   - the theme toggle:  `rounded-full`, bordered, `size-11`
 *   - the bell:          `rounded-full`, bordered, `size-11`
 *   - messages:          `rounded-full`, unbordered, `size-10`
 *
 * So the same cluster held two shapes, two sizes, and a border on three of four
 * controls - which is what reads as "assembled from different sources" rather than
 * designed. The circular outline in particular was decorative: a border drawn round a
 * round icon, carrying no information, and the only control without it was the one
 * directly beside it.
 *
 * The decision: `size-10`, `rounded-md`, no border, hairline on hover via a surface tint.
 * Square-ish radii on a square button is the geometry DESIGN.md already pins for buttons
 * (`rounded.md`, 8px); circles are reserved for avatars, badges and toggles. Every header
 * control is 40px, which clears the 24px minimum comfortably and stays under the 44px
 * primary-control target that a 40px secondary control does not need to hit.
 *
 * `as="router-link"` renders a link instead of a button, for the one control here that
 * navigates. It matters: the message control is the only item in this row that is a
 * destination rather than a disclosure, and rendering it as a `<button>` would have it
 * announced as one.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = withDefaults(
  defineProps<{
    /** Names the control for anything not reading the icon. */
    label: string
    /** Matches `aria-expanded` on the control that owns a panel, when it has one. */
    expanded?: boolean
    /** Identifies what this control controls, for `aria-controls`. */
    controls?: string
    /** Paints the pressed/active surface. For a toggle that is currently on. */
    active?: boolean
    /** `button` for anything that acts in place; `router-link` for a destination. */
    as?: 'button' | 'router-link'
    /** Only meaningful with `as="router-link"`. */
    to?: string
  }>(),
  { expanded: undefined, controls: undefined, active: false, as: 'button', to: undefined },
)

const emit = defineEmits<{ activate: [] }>()

const isLink = computed(() => props.as === 'router-link')

const shared = computed(() => [
  'relative flex size-10 shrink-0 items-center justify-center rounded-md text-slate transition-colors duration-150 hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-white',
  props.active ? 'bg-surface-soft text-ink dark:bg-white/[0.08] dark:text-white' : '',
])

const a11y = computed(() => ({
  'aria-label': props.label,
  title: props.label,
  'aria-expanded': props.expanded,
  'aria-controls': props.controls,
}))
</script>

<template>
  <RouterLink v-if="isLink && to" :to="to" :class="shared" v-bind="a11y">
    <slot />
  </RouterLink>

  <button
    v-else
    type="button"
    :class="shared"
    v-bind="a11y"
    :aria-haspopup="expanded === undefined ? 'menu' : undefined"
    @click="emit('activate')"
  >
    <slot />
  </button>
</template>
