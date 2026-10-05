<template>
  <!--
    Hidden below xl because the header row has no room for it at phone widths:
    the hamburger, the logo and the application-menu button already fill 390px.
    The keyboard shortcut below is a no-op down here for the same reason, and
    the badge that used to advertise `⌘ K` is gone rather than left lying.
  -->
  <div class="hidden xl:block">
    <form role="search" :aria-label="`Search ${scopeLabel}`" @submit.prevent="submit">
      <div class="relative">
        <label for="course-search" class="sr-only">Search {{ scopeLabel }}</label>
        <Search
          class="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-slate"
          aria-hidden="true"
        />
        <input
          id="course-search"
          ref="inputRef"
          v-model="term"
          type="search"
          name="q"
          autocomplete="off"
          :placeholder="placeholder"
          class="h-11 w-full rounded-md border border-hairline bg-surface-soft py-2.5 ps-11 text-sm text-ink shadow-theme-xs placeholder:text-slate focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:appearance-none dark:bg-white/[0.03] dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:border-brand-400 xl:w-[430px]"
          @keydown.esc="clear"
        />

        <button
          v-if="term !== ''"
          type="button"
          class="absolute end-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md border border-hairline bg-canvas p-1.5 text-slate transition-colors hover:bg-surface-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Clear search"
          @click="clear"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

/**
 * A course filter, not a site search.
 *
 * There is no search index and no search API in this project, so the honest
 * version of this control is one that does something real: it takes you to the
 * course list for your role with the term in the URL. It used to bind a string,
 * submit nothing, and sit there looking like TailAdmin's command palette.
 */
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const term = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

/** Where each role's course list lives. Every path is a real route. */
const TARGETS: Record<'admin' | 'instructor' | 'student', { path: string; placeholder: string }> = {
  student: { path: '/student/courses', placeholder: 'Search the course catalogue…' },
  instructor: { path: '/instructor/courses', placeholder: 'Search your courses…' },
  admin: { path: '/admin/courses', placeholder: 'Search all courses…' },
}

const target = computed(() => TARGETS[auth.role ?? 'student'])

const placeholder = computed(() => target.value.placeholder)

/** Used by the accessible name, so it reads as "Search the course catalogue". */
const scopeLabel = computed(() => target.value.placeholder.replace('Search ', '').replace('…', ''))

function submit(): void {
  const query = term.value.trim()
  // An empty term navigates without `?q=` rather than with `?q=`, so the
  // destination is not left holding a filter that matches everything.
  if (query === '') {
    void router.push({ path: target.value.path })
    return
  }
  void router.push({ path: target.value.path, query: { q: query } })
}

function clear(): void {
  term.value = ''
  inputRef.value?.focus()
}

function focusSearchInput(): void {
  inputRef.value?.focus()
  inputRef.value?.select()
}

/**
 * ⌘K / Ctrl+K focuses the field.
 *
 * Wired to the component's own ref rather than to `document.getElementById`, so
 * it cannot focus a same-id element elsewhere, and it only registers once the
 * `xl` breakpoint makes the field visible — otherwise it would silently
 * "work" on an element that is `display: none`.
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
  if (window.matchMedia('(min-width: 1280px)').matches !== true) return
  event.preventDefault()
  focusSearchInput()
}

onMounted(() => {
  // Refilled from the URL, so going back to a filtered list shows the term that
  // produced it instead of an empty box.
  const q = route.query.q
  if (typeof q === 'string') term.value = q

  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
