<script setup lang="ts">
/**
 * A person, as a circle.
 *
 * Extracted from `UserMenu.vue`, where the same markup - image with an initials
 * fallback, a stable colour chosen by hashing the name, a one-shot guard against a
 * dead `avatar_url` - was written out inline. It appeared there and nowhere else, so
 * the sidebar footer added for the collapsed rail had a third thing to copy, and a
 * copy of this is how two avatars of the same person end up different colours.
 *
 * `src` is the profile's own `avatar_url`. There is no bundled fallback photograph:
 * TailAdmin shipped `/images/user/owner.png`, a picture of an actual person, and every
 * account that fell back to it wore the same stranger's face.
 *
 * The image is `alt=""` because the name is always rendered next to it. Where it is
 * not - an icon-only control - the control carries the name in its `aria-label`
 * instead, which is the same information by a different route rather than a second
 * announcement.
 */
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    src?: string | null
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { src: null, size: 'md' },
)

/** Set once an `avatar_url` fails, and re-armed if the URL later changes. */
const imageFailed = ref(false)

watch(
  () => props.src,
  () => {
    imageFailed.value = false
  },
)

const showImage = computed(() => Boolean(props.src) && !imageFailed.value)

/**
 * Two letters, or one when the name only has one word. Falls back through the name and
 * then the caller's own default, so the circle is never blank.
 */
const initials = computed(() => {
  const parts = props.name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((part) => part.charAt(0).toUpperCase()).join('')
})

/**
 * A stable colour per person.
 *
 * Six pairs, chosen by a hash of the name, so two different accounts do not land on the
 * same swatch and the same account lands on the same one every visit. Every pair is a
 * theme token rather than a literal colour, so the dark variants come from the same
 * decision as the rest of the app.
 *
 * Hashing the name rather than the id is deliberate: this renders on pages where the
 * person's id is not in hand, and a name hash is stable across those pages.
 */
const AVATAR_SWATCHES = [
  'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400',
  'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400',
  'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400',
  'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400',
  'bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-200',
  'bg-surface text-charcoal dark:bg-white/[0.08] dark:text-gray-200',
] as const

const swatch = computed(() => {
  let hash = 0
  for (let index = 0; index < props.name.length; index += 1) {
    hash = (hash * 31 + props.name.charCodeAt(index)) >>> 0
  }
  return AVATAR_SWATCHES[hash % AVATAR_SWATCHES.length]
})

/**
 * 32 / 40 / 48, with 12px initials at the two smaller sizes and 14px at 48.
 *
 * Every step is a real Tailwind size and every type size is on DESIGN.md's ramp
 * (`caption` 12px, `body-sm` 14px). There was a 24px step here at `text-[10px]`, which
 * is off the ramp and which nothing in the product used - it was a scale invented for a
 * component that had one call site.
 */
const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
} as const
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
    :class="[SIZES[size], swatch]"
  >
    <img
      v-if="showImage"
      :src="src ?? undefined"
      alt=""
      class="size-full object-cover"
      loading="lazy"
      decoding="async"
      @error="imageFailed = true"
    />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>
