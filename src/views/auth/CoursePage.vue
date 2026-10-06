<template>
  <div class="min-h-screen bg-canvas">
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

    <main class="mx-auto max-w-(--breakpoint-2xl) px-4 py-10 md:px-6 md:py-14">
      <nav aria-label="Breadcrumb" class="mb-8">
        <!--
          Each crumb carries its own padding so the link box clears 24px. A bare
          text link measures about 17px, which is a fiddly target on a phone.
        -->
        <ol class="flex flex-wrap items-center text-sm text-slate">
          <li class="-ms-2">
            <RouterLink
              to="/"
              class="inline-flex min-h-6 items-center rounded px-2 py-1 hover:underline"
              >Home</RouterLink
            >
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <RouterLink
              to="/courses"
              class="inline-flex min-h-6 items-center rounded px-2 py-1 hover:underline"
            >
              Courses
            </RouterLink>
          </li>
          <li aria-hidden="true">/</li>
          <li class="min-w-0 truncate px-2 text-ink" aria-current="page">
            {{ loading ? 'Loading' : (course?.title ?? 'Not found') }}
          </li>
        </ol>
      </nav>

      <div v-if="loading" class="py-16 text-center" role="status" aria-live="polite">
        <LoaderCircle class="mx-auto size-5 animate-spin text-slate" />
        <p class="mt-3 text-sm text-slate">Loading course…</p>
      </div>

      <Alert
        v-else-if="errorMessage"
        variant="error"
        title="Could not load this course"
        :message="errorMessage"
      />

      <!-- A draft or archived course has no public page. Say so plainly rather than 404. -->
      <EmptyState
        v-else-if="!course"
        title="This course is not published"
        description="Published courses are open to everyone. This one is not available on the catalogue yet."
        :icon="BookOpen"
      >
        <RouterLink
          to="/courses"
          class="mt-4 inline-block rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white"
        >
          Back to all courses
        </RouterLink>
      </EmptyState>

      <template v-else>
        <article class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="min-w-0">
            <div
              class="relative aspect-16/9 w-full overflow-hidden rounded-lg border border-hairline bg-surface"
            >
              <img
                v-if="course.thumbnailUrl"
                :src="course.thumbnailUrl"
                :alt="`Cover for ${course.title}`"
                class="size-full object-cover"
              />
              <div v-else class="flex size-full items-center justify-center p-8">
                <LevelPattern
                  :level="course.level"
                  :module-count="course.moduleCount"
                  class="size-full text-slate"
                />
              </div>
            </div>

            <div class="mt-6 flex flex-wrap items-center gap-2">
              <span class="text-xs font-medium text-slate"> Published course </span>
              <Badge variant="solid">{{ isPaid ? priceLabel : 'Free' }}</Badge>
              <Badge variant="light">{{ LEVEL_LABELS[course.level] }}</Badge>
              <Badge variant="light">{{ course.categoryName ?? 'Uncategorized' }}</Badge>
            </div>

            <h1 class="mt-3 text-title-md text-ink">{{ course.title }}</h1>

            <p v-if="course.description" class="mt-4 max-w-2xl text-base text-slate">
              {{ course.description }}
            </p>

            <!-- Four items, one per concern, stated in words. -->
            <dl
              class="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4"
            >
              <div v-for="fact in facts" :key="fact.label" class="bg-white px-4 py-4">
                <dt class="text-xs text-slate">{{ fact.label }}</dt>
                <dd class="mt-1 text-sm font-medium text-ink">
                  {{ fact.value }}
                </dd>
              </div>
            </dl>

            <section v-if="objectives.length" class="mt-10">
              <h2 class="text-title-sm text-ink">What you will learn</h2>
              <ul class="mt-4 space-y-2.5">
                <li
                  v-for="objective in objectives"
                  :key="objective"
                  class="flex gap-3 text-base text-slate"
                >
                  <Check class="mt-1 size-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span class="whitespace-pre-line">{{ objective }}</span>
                </li>
              </ul>
            </section>

            <section class="mt-10">
              <h2 class="text-title-sm text-ink">Course outline</h2>
              <p class="mt-2 text-sm text-slate">
                Module and lesson titles only. Lesson content and materials stay private until you
                enroll.
              </p>

              <p
                v-if="modules.length === 0"
                class="mt-5 rounded-lg border border-hairline px-4 py-6 text-sm text-slate"
              >
                This course has no published outline yet.
              </p>

              <ol v-else class="mt-5 space-y-4">
                <li
                  v-for="(module, index) in modules"
                  :key="module.id"
                  class="rounded-lg border border-hairline p-4 sm:p-5"
                >
                  <h3 class="text-sm font-semibold text-ink">
                    <span class="text-slate">Module {{ index + 1 }}</span>
                    · {{ module.title }}
                  </h3>

                  <p v-if="module.lessons.length === 0" class="mt-2 text-sm text-slate">
                    No published lessons in this module yet.
                  </p>

                  <ul v-else class="mt-3 space-y-2">
                    <li
                      v-for="(lesson, lessonIndex) in module.lessons"
                      :key="lesson.id"
                      class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                    >
                      <span class="text-slate"> Lesson {{ lessonIndex + 1 }} </span>
                      <span class="text-ink">{{ lesson.title }}</span>
                      <!--
                        No Required/Optional badge here, unlike the old system's
                        course page. That field does not exist on this schema, so
                        every badge would read "Required" - which is not a badge,
                        it is a constant pretending to be information. The schema's
                        real distinction is lesson_type, and is_preview, and
                        neither is part of the public grant.
                      -->
                      <span v-if="lesson.durationMinutes" class="text-slate">
                        {{ lesson.durationMinutes }} min
                      </span>
                    </li>
                  </ul>
                </li>
              </ol>
            </section>
          </div>

          <!-- Enrolment block. Checked before the course type, so someone who has
               already paid is never offered a pay button. -->
          <aside class="lg:sticky lg:top-6 lg:self-start">
            <div class="rounded-lg border border-hairline p-5">
              <p class="text-2xl font-semibold tracking-tight text-ink">
                {{ isPaid ? priceLabel : 'Free' }}
              </p>

              <p class="mt-3 text-sm text-slate">{{ enrollmentMessage }}</p>

              <RouterLink
                v-if="primaryAction"
                :to="primaryAction.to"
                class="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-charcoal"
              >
                {{ primaryAction.label }}
              </RouterLink>

              <p class="mt-4 text-xs text-slate">Browsing needs no account.</p>
            </div>
          </aside>
        </article>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * The public course page.
 *
 * The important rule on this page is what it does NOT show. Lesson bodies,
 * lesson summaries, material titles, material bodies and material links are all
 * absent, because a public page that leaks paid content is not a marketing page,
 * it is a hole in the paywall. Only the structure is public: module and lesson
 * titles, badges and durations.
 */
import { describeSupabaseError } from '@/services/supabase/client'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { BookOpen, Check, LoaderCircle } from 'lucide-vue-next'
import Alert from '@/components/ui/Alert.vue'
import Badge from '@/components/ui/Badge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BrandMark from '@/components/common/BrandMark.vue'
import ThemeToggleButton from '@/components/common/ThemeToggleButton.vue'
import LevelPattern from '@/components/catalogue/LevelPattern.vue'
import {
  LEVEL_LABELS,
  getPublicCourseOutline,
  listPublishedCourses,
} from '@/services/catalogue.service'
import type { CatalogueCourse, PublicModule } from '@/services/catalogue.service'

const route = useRoute()

const course = ref<CatalogueCourse | null>(null)
const modules = ref<PublicModule[]>([])
const loading = ref(true)
const errorMessage = ref('')

const slug = computed(() => String(route.params.slug ?? ''))

onMounted(async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    // The catalogue service is the read model that already filters to published
    // and carries the counts, so the page gets its card data and its privacy
    // decision from the same place rather than trusting the router.
    const listed = await listPublishedCourses()
    const match = listed.find((c) => c.slug === slug.value)
    course.value = match ?? null

    // Only ask for the outline once the course is known to be published. A draft's
    // modules are not public, so requesting them would be denied rather than
    // return nothing, and the page would show an error instead of "not published".
    if (course.value) {
      modules.value = await getPublicCourseOutline(course.value.id)
    }
  } catch (error) {
    errorMessage.value = describeSupabaseError(error)
  } finally {
    loading.value = false
  }
})

const isPaid = computed(() => (course.value?.priceCentavos ?? 0) > 0)

const priceLabel = computed(() => {
  const centavos = course.value?.priceCentavos ?? 0
  return `₱${(centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
})

/**
 * Objectives live in the description as line breaks on this schema, so they are
 * split rather than stored twice. No objectives means no section, rather than an
 * empty one.
 */
const objectives = computed(() =>
  (course.value?.description ?? '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 3 && line.length < 160),
)

const facts = computed(() => {
  const c = course.value
  if (!c) return []
  // Four items, one per concern, as the product spec requires. Lesson counts are
  // deliberately absent: the outline below already lists every lesson by name, so
  // a count here would restate what the reader is looking at.
  return [
    { label: 'Price', value: isPaid.value ? priceLabel.value : 'Free' },
    // The instructor is never named publicly, so this slot states what is
    // actually known rather than leaking an account.
    { label: 'Instructor', value: 'IT Learning Hub' },
    { label: 'Modules', value: String(c.moduleCount) },
    {
      label: 'Published',
      value: c.publishedAt
        ? new Date(c.publishedAt).toLocaleDateString('en-PH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Recently',
    },
  ]
})

const enrollmentMessage = computed(() =>
  isPaid.value
    ? 'This course is paid. Lesson content and materials stay locked until a payment is confirmed.'
    : 'This course is free. Enroll to start your learning record.',
)

const primaryAction = computed(() =>
  isPaid.value
    ? { to: '/auth/register', label: 'Create an account to enroll' }
    : { to: '/auth/register', label: 'Create a free account to enroll' },
)
</script>
