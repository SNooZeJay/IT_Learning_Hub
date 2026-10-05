<template>
  <!--
    `role="img"` with the name on the wrapper covers both paths. When there is a
    real picture the inner `img` is `alt=""` on purpose: the wrapper already
    names it, and two labels would be read twice.
  -->
  <span :class="[baseClass, toneClass, sizeClasses[size]]" :aria-label="label || name" role="img">
    <!--
      A stored URL can outlive its object: an admin clearing a bucket, or a row
      written before the bucket existed. `@error` drops to the initials rather
      than showing the browser's broken-image glyph, so a person is never left
      with a torn picture where their face should be.
    -->
    <img
      v-if="shownSrc && !imageFailed"
      :src="shownSrc"
      alt=""
      class="size-full object-cover"
      loading="lazy"
      decoding="async"
      @error="imageFailed = true"
    />
    <template v-else>{{ initials(name) }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * A person's picture, or their initials when there is no picture.
 *
 * The initials path is the one almost everybody sees — the `avatars` bucket
 * shipped empty and no profile in the database has an `avatar_url` — so it is
 * built as a real answer rather than a placeholder: up to two letters, a
 * background chosen from the name, and a light and dark pair per background.
 */

const props = withDefaults(
  defineProps<{
    name: string
    /** A public URL, or null/empty for the initials. */
    src?: string | null
    /**
     * Appended to the URL as a cache-buster. A replacement photo reuses the
     * same object key, so without this a browser may keep showing the old face
     * from its own cache even though the bytes changed.
     */
    version?: number
    label?: string
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  }>(),
  { src: null, version: 0, label: '', size: 'md' },
)

const sizeClasses: Record<string, string> = {
  xs: 'size-7 text-[10px]',
  sm: 'size-9 text-xs',
  md: 'size-12 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-3xl',
}

/**
 * Six backgrounds, each a light pair and its dark counterpart.
 *
 * `brand-50` on `brand-700` and the rest of these clear WCAG AA for text well
 * past the 4.5:1 threshold, and each has a dark partner that keeps the chip
 * readable on the dark canvas. They are written out rather than composed from a
 * fragment because Tailwind cannot see a class it did not find in a source
 * file — a `bg-${tone}-50` would compile to nothing at all.
 */
const toneClasses: readonly string[] = [
  'bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
  'bg-success-50 text-success-700 dark:bg-success-500/20 dark:text-success-300',
  'bg-warning-50 text-warning-700 dark:bg-warning-500/20 dark:text-warning-300',
  'bg-error-50 text-error-700 dark:bg-error-500/20 dark:text-error-300',
  'bg-brand-100 text-brand-800 dark:bg-brand-500/30 dark:text-brand-200',
  'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-charcoal',
]

const baseClass =
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold uppercase leading-none tracking-wide'

const imageFailed = ref(false)

const shownSrc = computed(() => {
  const url = props.src
  if (!url) return ''
  // A `blob:` URL is the pending local preview. It addresses one object in one
  // document and accepts no query string, so appending one would break it.
  if (url.startsWith('blob:')) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${props.version}`
})

// A different image deserves a fresh attempt at loading it.
watch(shownSrc, () => {
  imageFailed.value = false
})

/** FNV-1a. Small, stable, and the same on every device for the same name. */
function hashOf(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

const toneClass = computed(() => {
  const seed = props.name.trim().toLowerCase()
  return seed ? toneClasses[hashOf(seed) % toneClasses.length] : toneClasses[0]
})

/**
 * First letter of the first word plus first letter of the last.
 *
 * "Juan Dela Cruz" reads as JD, which is how the person would say it. A single
 * word takes its first two letters, so a handle like "juan" still shows two
 * characters instead of one lonely initial.
 */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  const first = words[0].charAt(0)
  if (words.length === 1) return (words[0].slice(0, 2) || first).toUpperCase()

  return (first + words[words.length - 1].charAt(0)).toUpperCase()
}
</script>
