<template>
  <div class="min-h-screen bg-canvas">
    <!--
      Public header.

      Deliberately thinner than the workspace header: a stranger has no
      dashboard to navigate to, so the bar carries the brand, one link back to
      the catalogue, the theme switch and the two account actions. Nothing here
      points at a route that does not exist.
    -->
    <header class="border-b border-hairline">
      <div
        class="mx-auto flex max-w-(--breakpoint-2xl) items-center justify-between gap-4 px-4 py-4 md:px-6"
      >
        <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
          <BrandMark class="size-9 shrink-0" />
          <span class="truncate text-title-sm text-ink">IT Learning Hub</span>
        </RouterLink>

        <nav class="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggleButton class="me-1" />
          <RouterLink
            to="/auth/login"
            class="rounded-md px-3 py-2 text-sm font-medium text-slate transition-colors hover:bg-surface"
          >
            Sign in
          </RouterLink>
          <RouterLink
            to="/auth/register"
            class="rounded-md bg-ink px-3 py-2 text-sm font-medium text-canvas transition-colors hover:bg-charcoal"
          >
            Create account
          </RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-(--breakpoint-2xl) px-4 py-12 md:px-6 md:py-16">
      <!--
        No eyebrow above this heading. The heading says what the page is; a label
        above it saying "catalogue" would only repeat itself.
      -->
      <h1 class="text-title-md text-ink">Browse published courses</h1>
      <p class="mt-3 max-w-2xl text-base text-slate">
        These courses are published and open to everyone. Sign in to enroll in one.
      </p>
      <p class="mt-2 text-sm text-slate">
        <template v-if="loading">{{ courses.length }} courses published</template>
        <template v-else-if="filtersAreNarrowed"
          >{{ results.length }} of {{ courses.length }} courses published</template
        >
        <template v-else
          >{{ courses.length }}
          {{ courses.length === 1 ? 'course' : 'courses' }} published</template
        >
      </p>

      <!-- Filters. One form, all combined, matching the URL so a view is shareable. -->
      <form
        class="mt-8 grid gap-3 border-y border-hairline py-5 sm:grid-cols-2 lg:grid-cols-4"
        @submit.prevent
      >
        <div class="sm:col-span-2 lg:col-span-1">
          <label for="catalogue-search" class="mb-1.5 block text-sm font-medium text-slate">
            Search by title
          </label>
          <input
            id="catalogue-search"
            v-model="search"
            type="search"
            maxlength="100"
            placeholder="Networking basics"
            class="h-11 w-full rounded-md border border-hairline-strong bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden dark:placeholder:text-slate"
          />
        </div>

        <div>
          <label for="catalogue-level" class="mb-1.5 block text-sm font-medium text-slate">
            Level
          </label>
          <select
            id="catalogue-level"
            v-model="level"
            class="h-11 w-full rounded-md border border-hairline-strong bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden"
          >
            <option value="all">All levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label for="catalogue-price" class="mb-1.5 block text-sm font-medium text-slate">
            Price
          </label>
          <select
            id="catalogue-price"
            v-model="price"
            class="h-11 w-full rounded-md border border-hairline-strong bg-surface px-3 text-sm text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-hidden"
          >
            <option value="all">Free and paid</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div class="flex items-end gap-2">
          <button
            type="button"
            class="h-11 rounded-md border border-hairline-strong px-4 text-sm font-medium text-slate transition-colors hover:bg-surface"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </form>

      <!-- Loading is its own state. A refused load must never look like an empty list. -->
      <div v-if="loading" class="py-16 text-center" role="status" aria-live="polite">
        <LoaderCircle class="mx-auto size-5 animate-spin text-slate" />
        <p class="mt-3 text-sm text-slate">Loading published courses…</p>
      </div>

      <Alert
        v-else-if="errorMessage"
        variant="error"
        title="Could not load the catalogue"
        :message="errorMessage"
        class="mt-8"
      >
        <button type="button" class="mt-3 text-sm font-medium underline" @click="load">
          Try again
        </button>
      </Alert>

      <!--
        The empty state names the next action rather than showing a blank grid,
        and says which of the two situations this is: nothing published at all,
        or nothing matching.
      -->
      <EmptyState
        v-else-if="results.length === 0"
        class="mt-8"
        :title="courses.length === 0 ? 'No courses published yet' : 'No published courses match'"
        :description="
          courses.length === 0
            ? 'Courses appear here as soon as an instructor publishes them. Sign in to enroll once the catalogue is live.'
            : 'No published course matches these filters yet. Try a different search, or clear the filters to see everything.'
        "
        :icon="BookOpen"
      >
        <button
          v-if="courses.length > 0"
          type="button"
          class="mt-4 rounded-md border border-hairline-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </EmptyState>

      <ul v-else class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="course in results" :key="course.id">
          <CatalogueCard :course="course" />
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * The public catalogue: browse published courses without an account.
 *
 * This is the destination of the landing page's primary action. It had no route
 * of its own before - the course list lived on the landing page and course detail
 * sat behind sign-in - which meant "Explore courses" had nowhere honest to send
 * a stranger who has not decided to make an account yet.
 *
 * Instructor names are deliberately absent from these cards, and no email address
 * appears anywhere on this page.
 */
import { describeSupabaseError } from '@/services/supabase/client'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { BookOpen, LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import CatalogueCard from '@/components/catalogue/CatalogueCard.vue'
import {
  filterCatalogue,
  listCatalogueCategories,
  listPublishedCourses,
} from '@/services/catalogue.service'
import type { CatalogueCourse, PriceFilter } from '@/services/catalogue.service'
import type { CourseLevel } from '@/types'

const PER_PAGE = 12

const route = useRoute()
const router = useRouter()

const courses = ref<CatalogueCourse[]>([])
const loading = ref(true)
const errorMessage = ref('')
const page = ref(1)

const search = ref('')
const level = ref<CourseLevel | 'all'>('all')
const price = ref<PriceFilter>('all')
const categoryId = ref<string | null>(null)

/**
 * Read the query string, tolerating anything in it.
 *
 * A hand-typed or stale URL renders the page rather than throwing. Someone who
 * bookmarks /courses?level=wizard gets the full catalogue, not an error page -
 * the filter they hoped for simply does not exist.
 */
onMounted(() => {
  const q = route.query
  const rawLevel = String(q.level ?? 'all').toLowerCase()
  const rawPrice = String(q.price ?? 'all').toLowerCase()

  level.value = ['beginner', 'intermediate', 'advanced'].includes(rawLevel)
    ? (rawLevel as CourseLevel)
    : 'all'
  price.value = ['all', 'free', 'paid'].includes(rawPrice) ? (rawPrice as PriceFilter) : 'all'
  categoryId.value = typeof q.category === 'string' && q.category ? q.category : null
  search.value = typeof q.q === 'string' ? q.q.slice(0, 100) : ''

  void load()
  void listCatalogueCategories()
    .then((categories) => {
      // Drop a category from the URL that no longer exists, so the filter select
      // and the result list cannot disagree.
      if (categoryId.value && !categories.some((c) => c.id === categoryId.value)) {
        categoryId.value = null
      }
    })
    .catch(() => {
      /* The category list only refines the select. Failing to load it must not
         hide the courses, so this is swallowed deliberately rather than shown. */
    })
})

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    courses.value = await listPublishedCourses()
  } catch (error) {
    errorMessage.value = describeSupabaseError(error)
  } finally {
    loading.value = false
  }
}

/**
 * Every filter change writes the URL.
 *
 * This is what makes a filtered view shareable and what makes the back button
 * undo a filter rather than leave the page. Replace rather than push, so
 * adjusting a filter does not fill the history with fifteen near-identical
 * entries.
 */
let syncHandle: ReturnType<typeof setTimeout> | undefined
watch([search, level, price, categoryId], () => {
  if (syncHandle) clearTimeout(syncHandle)
  syncHandle = setTimeout(() => {
    const query: Record<string, string> = {}
    if (search.value.trim()) query.q = search.value.trim().slice(0, 100)
    if (level.value !== 'all') query.level = level.value
    if (price.value !== 'all') query.price = price.value
    if (categoryId.value) query.category = categoryId.value
    void router.replace({ query })
    page.value = 1
  }, 250)
})

const filtered = computed(() =>
  filterCatalogue(courses.value, {
    search: search.value,
    categoryId: categoryId.value,
    level: level.value,
    price: price.value,
  }),
)

const results = computed(() => filtered.value.slice(0, page.value * PER_PAGE))

const filtersAreNarrowed = computed(
  () =>
    search.value.trim() !== '' ||
    level.value !== 'all' ||
    price.value !== 'all' ||
    categoryId.value !== null,
)

function clearFilters(): void {
  search.value = ''
  level.value = 'all'
  price.value = 'all'
  categoryId.value = null
}
</script>
