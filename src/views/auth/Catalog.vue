<template>
  <!--
    The public catalogue, on the landing page's surface.

    This is the destination of the landing page's primary action, so it was
    rebuilt on the same tokens, the same floating header and the same card
    component rather than left as the only page in the product still on the
    pre-landing palette. `CatalogueCard` is literally the same component the
    landing page renders, so a course cannot look like one thing here and another
    there.

    What did NOT change: the query, the filter state, the URL sync, the
    pagination, every control's behaviour and every route. Only classes and
    structure moved. The `?q=` search in particular is still read on mount and
    still written back on change, because the landing page used to link here with
    that parameter and still does not - but a shared search box on the landing
    header was removed for minimalism, so this input is now the only way in.
  -->
  <div class="relative isolate min-h-screen overflow-x-clip bg-lp-canvas text-lp-ink">
    <!--
      The same three blurred pastel masses as the landing page, fixed behind
      everything. Static, `pointer-events-none`, and behind `-z-10` so they can
      never become a click target.
    -->
    <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        class="absolute -top-48 -start-40 size-[36rem] rounded-full bg-lp-glow-green opacity-70 blur-3xl"
      ></div>
      <div
        class="absolute -top-24 -end-48 size-[42rem] rounded-full bg-lp-glow-beige opacity-80 blur-3xl"
      ></div>
      <div
        class="absolute top-[52rem] start-1/4 size-[30rem] rounded-full bg-lp-glow-peach opacity-60 blur-3xl"
      ></div>
    </div>

    <!--
      The landing page's header, byte for byte.

      Copied rather than extracted because there is no shared header component
      for the public pages and building one is a larger change than converting a
      page. The arithmetic in its comment about wrapping below 375px is the
      landing page's and applies unchanged here - the controls are identical.
    -->
    <header class="sticky top-0 z-40 px-4 pt-4 md:px-6 md:pt-5">
      <div
        class="mx-auto max-w-6xl rounded-3xl border border-lp-line bg-lp-card/85 shadow-lp-nav backdrop-blur-xl 2xsm:rounded-full"
      >
        <div
          class="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 px-3 py-2.5 2xsm:flex-nowrap 2xsm:justify-between 2xsm:gap-x-3 2xsm:px-4 md:px-5"
        >
          <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
            <BrandMark class="size-8 shrink-0" />
            <span
              class="hidden truncate text-[15px] font-semibold tracking-tight text-lp-ink md:inline"
            >
              IT Learning Hub
            </span>
          </RouterLink>

          <div class="flex shrink-0 items-center gap-0.5 2xsm:gap-1.5 md:gap-2">
            <ThemeToggleButton />

            <RouterLink
              to="/auth/login"
              class="rounded-full px-3 py-2 text-sm font-medium text-lp-slate transition-colors hover:bg-lp-canvas hover:text-lp-ink sm:px-3.5 md:px-4"
            >
              Sign in
            </RouterLink>
            <RouterLink
              to="/auth/register"
              class="rounded-full bg-lp-ink px-3.5 py-2 text-sm font-medium text-lp-ink-inverse shadow-lp-button transition-colors hover:opacity-90 sm:px-4 md:px-5"
            >
              Get Started
            </RouterLink>
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 pt-8 pb-20 md:px-6 md:pt-12 md:pb-28">
      <!--
        The way out, at the top of the page rather than in the navbar.

        `AuthShell` carries this in its header because a sign-in form has nothing
        else on the page. A content page has a heading and a purpose, and a fourth
        control in the bar pushed the row 24px past the pill at 320px. Here it sits
        with the content instead, where it costs the header nothing.

        `-ms-3` pulls the pill's own padding back so the label is optically aligned
        with the page edge rather than inset 12px from it. The arrow points toward
        the start of the reading direction, so it flips in RTL.
      -->
      <RouterLink
        to="/"
        class="-ms-3 mb-8 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-lp-slate transition-colors hover:bg-lp-accent-soft hover:text-lp-accent"
      >
        <ArrowLeft class="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
        Back to home
      </RouterLink>

      <!--
        No eyebrow above this heading. The heading says what the page is; a label
        above it saying "catalogue" would only repeat itself.

        The count moved up beside the heading rather than sitting under the
        paragraph. It is a result count, and on a filtered view it changes as you
        type - at the top of the page, next to the heading it qualifies, it is
        read; buried below two lines of prose it is not.
      -->
      <div
        class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-lp-line pb-8"
      >
        <div :style="{ '--stagger-i': 0 }" class="lp-hero-step">
          <h1
            class="font-display text-4xl leading-[1.08] font-semibold tracking-[-0.02em] text-balance text-lp-ink md:text-5xl"
          >
            Browse published courses
          </h1>
          <p class="mt-4 max-w-2xl text-base leading-relaxed text-lp-slate">
            These courses are published and open to everyone. Sign in to enroll in one.
          </p>
        </div>

        <p
          :style="{ '--stagger-i': 1 }"
          class="lp-hero-step text-sm font-medium text-lp-accent"
        >
          <template v-if="loading">{{ courses.length }} courses published</template>
          <template v-else-if="filtersAreNarrowed"
            >{{ results.length }} of {{ courses.length }} courses published</template
          >
          <template v-else
            >{{ courses.length }}
            {{ courses.length === 1 ? 'course' : 'courses' }} published</template
          >
        </p>
      </div>

      <!--
        FILTERS.

        One form, all combined, matching the URL so a view is shareable - that
        behaviour is untouched. They moved from a ruled band into a white card so
        they read as a tool sitting on the page rather than as a table header.

        The controls keep their native focus ring. The previous version replaced
        it with `focus:ring-2 focus:ring-brand-500/20`, which is a 2px purple
        wash - hard to see against a cream page. `main.css` already declares a
        2px `focus-visible` outline for every interactive element, so suppressing
        it here only removed the indicator.
      -->
      <form
        :style="{ '--stagger-i': 2 }"
        class="lp-hero-step mt-8 rounded-2xl border border-lp-line bg-lp-card p-5 md:p-6"
        @submit.prevent
      >
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="sm:col-span-2 lg:col-span-1">
            <label
              for="catalogue-search"
              class="mb-2 block text-[11px] font-semibold tracking-[0.12em] text-lp-slate uppercase"
            >
              Search by title
            </label>
            <div
              class="flex h-11 items-center gap-2 rounded-full border border-lp-line bg-lp-canvas ps-4 pe-5 transition-colors focus-within:border-lp-line-strong"
            >
              <Search class="size-4 shrink-0 text-lp-slate" aria-hidden="true" />
              <input
                id="catalogue-search"
                v-model="search"
                type="search"
                maxlength="100"
                placeholder="Networking basics"
                class="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-lp-ink placeholder:text-lp-slate focus:outline-none focus:ring-0"
              />
            </div>
          </div>

          <div>
            <label
              for="catalogue-level"
              class="mb-2 block text-[11px] font-semibold tracking-[0.12em] text-lp-slate uppercase"
            >
              Level
            </label>
            <select
              id="catalogue-level"
              v-model="level"
              class="h-11 w-full rounded-full border border-lp-line bg-lp-canvas px-4 text-sm text-lp-ink transition-colors focus-within:border-lp-line-strong"
            >
              <option value="all">All levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div>
            <label
              for="catalogue-price"
              class="mb-2 block text-[11px] font-semibold tracking-[0.12em] text-lp-slate uppercase"
            >
              Price
            </label>
            <select
              id="catalogue-price"
              v-model="price"
              class="h-11 w-full rounded-full border border-lp-line bg-lp-canvas px-4 text-sm text-lp-ink transition-colors focus-within:border-lp-line-strong"
            >
              <option value="all">Free and paid</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div class="flex items-end">
            <button
              type="button"
              class="h-11 rounded-full border border-lp-line-strong bg-lp-card px-5 text-sm font-medium text-lp-ink transition-colors hover:bg-lp-canvas"
              @click="clearFilters"
            >
              Clear filters
            </button>
          </div>
        </div>
      </form>

      <!-- Loading is its own state. A refused load must never look like an empty list. -->
      <div v-if="loading" class="py-20 text-center" role="status" aria-live="polite">
        <LoaderCircle class="mx-auto size-5 animate-spin text-lp-slate" />
        <p class="mt-3 text-sm text-lp-slate">Loading published courses…</p>
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

        `EmptyState` and `Alert` above are shared with every dashboard in the
        product and are deliberately not restyled for this page, so in these two
        states - and only these - the page shows app-grey rather than its own
        palette. Recolouring them would have changed ~25 authenticated views.
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
          class="mt-4 rounded-full border border-lp-line-strong bg-lp-card px-5 py-2.5 text-sm font-medium text-lp-ink transition-colors hover:bg-lp-canvas"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </EmptyState>

      <!--
        THE GRID, ARRIVING.

        A stagger, capped at four steps. The cap is the whole reason this reads as a
        grid assembling rather than as nine cards queueing: with 60ms steps and no
        cap, the ninth card would begin 480ms after the first and the reader would be
        waiting on the list rather than reading it.

        `:key` is the course id, not the index, so filtering the grid re-runs the
        entrance for the results that changed rather than re-animating every card on
        every keystroke. That is the difference between the page feeling responsive
        and the page feeling like it is loading.
      -->
      <ul v-else class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="(course, index) in results"
          :key="course.id"
          :style="{ '--stagger-i': index }"
          class="lp-stagger h-full"
        >
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
 *
 * KNOWN GAP, not fixed here: `listCatalogueCategories()` runs on mount and
 * `categoryId` is part of the filter state and the URL, so `?category=<slug>`
 * filters correctly - but there is no category control in the template, so the
 * only way to reach that filter is to type the query string by hand. Adding the
 * select is a behaviour change rather than a restyle, so it is called out here
 * instead of being slipped into a UI conversion.
 */
import { describeSupabaseError } from '@/services/supabase/client'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, BookOpen, LoaderCircle, Search } from 'lucide-vue-next'
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
